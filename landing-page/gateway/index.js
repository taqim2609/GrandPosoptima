/**
 * GrandPOS WhatsApp gateway service.
 *
 * Responsibilities:
 *   - allowlisted inbound command handling with zero LLM tokens;
 *   - forwarding unknown conversational traffic to the named Hermes profile;
 *   - outbound receipt and shift-recap delivery via the Hermes webhook adapter;
 *   - HMAC-SHA256 verification, idempotency, rate limiting, timeouts;
 *   - structured logs that never contain message bodies, secrets or full numbers.
 *
 * The Baileys socket is injected so this module is unit-testable without a
 * WhatsApp connection.
 */

'use strict';

const crypto = require('crypto');
const { parseMessage, normalisePhone, maskPhone, verifySignature, dedupeKey } = require('./commands');

const DEFAULT_TIMEOUT_MS = 8000;

function logEvent(level, event, fields = {}) {
  const record = { event, ...fields };
  process.stdout.write(`${JSON.stringify({ level, ...record })}\n`);
}

class RateLimiter {
  constructor(limitPerMinute = 20, windowSeconds = 60) {
    this.limit = limitPerMinute;
    this.window = windowSeconds;
    this.hits = new Map();
  }

  check(sender, now = Math.floor(Date.now() / 1000)) {
    const key = normalisePhone(sender);
    const bucket = Math.floor(now / this.window);
    const [recorded, count] = this.hits.get(key) || [bucket, 0];
    const current = recorded === bucket ? count : 0;
    if (current >= this.limit) {
      throw new Error('rate limit exceeded');
    }
    this.hits.set(key, [bucket, current + 1]);
  }
}

class ReplayGuard {
  constructor(ttlSeconds = 86400) {
    this.ttl = ttlSeconds;
    this.seen = new Map();
  }

  accept(key, digest, now = Math.floor(Date.now() / 1000)) {
    for (const [k, exp] of this.seen) {
      if (exp < now) this.seen.delete(k);
    }
    const composite = `${key}:${digest}`;
    if (this.seen.has(composite)) return false;
    this.seen.set(composite, now + this.ttl);
    return true;
  }
}

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class GrandPosGateway {
  constructor(config, deps = {}) {
    const numbers = (config.allowedNumbers || [])
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map(normalisePhone);
    if (!numbers.length) throw new Error('WA_ALLOWED_NUMBERS must not be empty');

    this.allowlist = new Set(numbers);
    if (config.ownerNumber) this.allowlist.add(normalisePhone(config.ownerNumber));

    this.apiBase = config.apiBase || 'http://127.0.0.1:8000';
    this.outboxUrl = config.outboxUrl || null;
    this.outboxSecret = config.outboxSecret || '';
    this.forwardUrl = config.forwardUrl || null;
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.fetchImpl = deps.fetch || global.fetch;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute || 20);
    this.replayGuard = new ReplayGuard();
    this.socket = deps.socket || null;
  }

  isAllowed(sender) {
    try {
      return this.allowlist.has(normalisePhone(sender));
    } catch {
      return false;
    }
  }

  /** Handle one inbound message. Returns the reply text or null when forwarded. */
  async handleIncoming({ from, text, messageId }) {
    const started = Date.now();
    const id = messageId || dedupeKey(from, text, started);
    let sender;
    try {
      sender = normalisePhone(from);
    } catch {
      logEvent('warn', 'inbound.invalid_sender', { delivery: id });
      return null;
    }

    if (!this.allowlist.has(sender)) {
      logEvent('warn', 'inbound.not_allowlisted', { sender: maskPhone(sender), delivery: id });
      return null;
    }

    let parsed;
    try {
      this.rateLimiter.check(sender);
      parsed = parseMessage(text);
    } catch (err) {
      logEvent('warn', 'inbound.rejected', {
        sender: maskPhone(sender),
        reason: err.message,
        delivery: id,
      });
      return null;
    }

    if (parsed.type === 'unrecognised') {
      if (!this.forwardUrl) {
        logEvent('info', 'inbound.no_forward_target', {
          sender: maskPhone(sender),
          delivery: id,
        });
        return null;
      }
      logEvent('info', 'inbound.forwarded', {
        sender: maskPhone(sender),
        delivery: id,
        ms: Date.now() - started,
      });
      const response = await fetchWithTimeout(
        this.forwardUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sender, text, delivery_id: id }),
        },
        this.timeoutMs,
        this.fetchImpl,
      );
      if (!response.ok) {
        logEvent('error', 'inbound.forward_failed', { status: response.status, delivery: id });
      }
      return null;
    }

    let endpoint;
    let payload;
    if (parsed.type === 'command') {
      endpoint = parsed.endpoint;
      payload = { args: parsed.args };
    } else {
      endpoint = '/reservations/intake';
      payload = {
        customer_name: parsed.customer_name,
        reserved_date: parsed.reserved_date,
        reserved_time: parsed.reserved_time,
        party_size: parsed.party_size,
        source: 'whatsapp',
        customer_phone: sender,
      };
    }

    try {
      const response = await fetchWithTimeout(
        `${this.apiBase}${endpoint}`,
        {
          method: parsed.type === 'command' && endpoint === '/shifts/active/summary' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': id },
          body: endpoint === '/shifts/active/summary' ? undefined : JSON.stringify(payload),
        },
        this.timeoutMs,
        this.fetchImpl,
      );
      const body = await response.json().catch(() => ({}));
      logEvent(response.ok ? 'info' : 'error', 'command.handled', {
        sender: maskPhone(sender),
        command: parsed.type === 'command' ? parsed.name : '#reservasi',
        status: response.status,
        ms: Date.now() - started,
        delivery: id,
      });
      if (!response.ok) return null;
      return body.reply_text || null;
    } catch (err) {
      logEvent('error', 'command.failed', {
        sender: maskPhone(sender),
        command: parsed.type === 'command' ? parsed.name : '#reservasi',
        reason: err.message,
        delivery: id,
      });
      return null;
    }
  }

  /** Deliver a prepared outbox payload (receipt / shift recap) via Hermes. */
  async deliver(payload, { event, recipient }) {
    if (!this.outboxUrl || !this.outboxSecret) {
      throw new Error('outbox URL and secret are required to deliver');
    }
    const dedupe = payload.dedupe_key || dedupeKey(event, payload.order_number || payload.shift_code, recipient);
    const ts = Math.floor(Date.now() / 1000);
    const canonical = require('./commands').canonicalise(payload);
    const digest = crypto.createHmac('sha256', this.outboxSecret).update(`${ts}.${canonical}`).digest('hex');

    const response = await fetchWithTimeout(
      this.outboxUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GrandPOS-Event': event,
          'X-GrandPOS-Delivery': dedupe,
          'X-GrandPOS-Timestamp': String(ts),
          'X-Hub-Signature-256': `sha256=${digest}`,
          'X-GrandPOS-Recipient': normalisePhone(recipient),
        },
        body: JSON.stringify(payload),
      },
      this.timeoutMs,
      this.fetchImpl,
    );
    logEvent(response.ok ? 'info' : 'error', 'outbox.delivered', {
      event_type: event,
      recipient: maskPhone(recipient),
      status: response.status,
      delivery: dedupe,
    });
    return response.ok;
  }

  /** Verify an inbound webhook (POS -> gateway) before acting on it. */
  verifyInbound({ body, header, timestamp }) {
    const { digest } = verifySignature({
      body,
      secret: this.outboxSecret,
      header,
      timestamp,
    });
    const key = typeof body === 'string' ? JSON.parse(body).delivery_id : body.delivery_id;
    if (!this.replayGuard.accept(key || 'unknown', digest)) {
      throw new Error('replay detected');
    }
    return true;
  }
}

function configFromEnv(env = process.env) {
  const allowed = (env.WA_ALLOWED_NUMBERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    allowedNumbers: allowed,
    ownerNumber: env.WA_OWNER_NUMBER || null,
    apiBase: env.GRANDPOS_API_BASE || 'http://127.0.0.1:8000',
    outboxUrl: env.GRANDPOS_OUTBOX_URL || null,
    outboxSecret: env.GRANDPOS_OUTBOX_SECRET || '',
    forwardUrl: env.HERMES_FORWARD_URL || null,
    timeoutMs: Number(env.WA_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    rateLimitPerMinute: Number(env.WA_RATE_LIMIT_PER_MINUTE || 20),
  };
}

module.exports = { GrandPosGateway, RateLimiter, ReplayGuard, configFromEnv, logEvent };
