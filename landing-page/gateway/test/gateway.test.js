/**
 * Unit tests for the Node/Baileys gateway boundary (run with node --test).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalisePhone,
  maskPhone,
  parseMessage,
  verifySignature,
  dedupeKey,
  canonicalise,
} = require('../commands');
const { RateLimiter, GrandPosGateway, configFromEnv } = require('../index');

describe('normalisePhone (must match Python app/guard.py)', () => {
  it('strips JID suffix and device part', () => {
    assert.equal(normalisePhone('628110000001@s.whatsapp.net:12'), '628110000001');
  });

  it('converts leading zero to 62', () => {
    assert.equal(normalisePhone('08110000001'), '628110000001');
  });

  it('rejects garbage', () => {
    assert.throws(() => normalisePhone('not-a-number'));
  });
});

describe('maskPhone', () => {
  it('never leaks the full number', () => {
    const masked = maskPhone('628110000001');
    assert.ok(!masked.includes('628110000001'));
    assert.equal(masked, '62811***01');
  });
});

describe('parseMessage (must match Python app/parsers.py)', () => {
  it('routes /stok to low-stock', () => {
    const r = parseMessage('/stok');
    assert.equal(r.type, 'command');
    assert.equal(r.name, '/stok');
    assert.equal(r.endpoint, '/reports/low-stock');
  });

  it('routes #reservasi with ISO date', () => {
    const r = parseMessage('#reservasi Budi/2026-10-20/19.30/4', new Date('2026-10-16T00:00:00Z'));
    assert.equal(r.type, 'reservation');
    assert.equal(r.reserved_date, '2026-10-20');
    assert.equal(r.reserved_time, '19:30');
    assert.equal(r.party_size, 4);
  });

  it('rejects tampered arguments as unrecognised', () => {
    assert.equal(parseMessage('/stok semua').type, 'unrecognised');
    assert.equal(parseMessage('halo kak').type, 'unrecognised');
  });
});

describe('verifySignature (must match Python app/signing.py)', () => {
  const crypto = require('crypto');
  const secret = 'test-only-hmac-secret-0123456789abcdef';
  const body = { event: 'receipt', order_number: 'GAK-1', total: 91000 };
  const ts = 1700000000;

  it('accepts a Python-compatible signature', () => {
    const canonical = canonicalise(body);
    const digest = crypto.createHmac('sha256', secret).update(`${ts}.${canonical}`).digest('hex');
    const { digest: out } = verifySignature({
      body, secret, header: `sha256=${digest}`, timestamp: ts, now: ts + 100,
    });
    assert.equal(out, digest);
  });

  it('rejects a wrong secret and an expired window', () => {
    const digest = crypto.createHmac('sha256', secret).update(`${ts}.${canonicalise(body)}`).digest('hex');
    assert.throws(() =>
      verifySignature({ body, secret: 'wrong', header: `sha256=${digest}`, timestamp: ts, now: ts + 100 }),
    );
    assert.throws(() =>
      verifySignature({ body, secret, header: `sha256=${digest}`, timestamp: ts, now: ts + 301 }),
    );
  });
});

describe('dedupeKey', () => {
  it('is stable and opaque', () => {
    const a = dedupeKey('receipt', 'GAK-001');
    assert.equal(a, dedupeKey('receipt', 'GAK-001'));
    assert.notEqual(a, dedupeKey('receipt', 'GAK-002'));
    assert.ok(!a.includes('GAK-001'));
  });
});

describe('RateLimiter', () => {
  it('rejects over-limit senders per sender', () => {
    const limiter = new RateLimiter(1);
    limiter.check('628110000001', 60);
    assert.throws(() => limiter.check('628110000001', 61));
    limiter.check('628110000002', 61); // other sender unaffected
  });
});

describe('GrandPosGateway.handleIncoming', () => {
  function stubFetch(handler) {
    return async (url, options) => handler(url, options);
  }

  it('blocks non-allowlisted senders without any fetch', async () => {
    let fetched = false;
    const gw = new GrandPosGateway(
      { allowedNumbers: ['628110000001'], apiBase: 'http://api' },
      { fetch: stubFetch(async () => { fetched = true; return { ok: true, status: 200, json: async () => ({}) }; }) },
    );
    const reply = await gw.handleIncoming({ from: '628199999999', text: '/stok', messageId: 'm1' });
    assert.equal(reply, null);
    assert.equal(fetched, false);
  });

  it('calls the allowlisted API endpoint for /stok', async () => {
    const calls = [];
    const gw = new GrandPosGateway(
      { allowedNumbers: ['628110000001'], apiBase: 'http://api' },
      {
        fetch: stubFetch(async (url, options) => {
          calls.push([url, options]);
          return { ok: true, status: 200, json: async () => ({ reply_text: 'Stok OK' }) };
        }),
      },
    );
    const reply = await gw.handleIncoming({ from: '628110000001@s.whatsapp.net', text: '/stok', messageId: 'm2' });
    assert.equal(reply, 'Stok OK');
    assert.equal(calls[0][0], 'http://api/reports/low-stock');
  });

  it('rejects startup with an empty allowlist', () => {
    assert.throws(() => new GrandPosGateway({ allowedNumbers: [] }), /WA_ALLOWED_NUMBERS/);
  });
});

describe('configFromEnv', () => {
  it('parses the documented environment', () => {
    const cfg = configFromEnv({
      WA_ALLOWED_NUMBERS: '628110000001, 628110000002',
      WA_OWNER_NUMBER: '628110000001',
      GRANDPOS_API_BASE: 'http://api:8000',
      GRANDPOS_OUTBOX_SECRET: 's',
      WA_RATE_LIMIT_PER_MINUTE: '20',
      WA_REQUEST_TIMEOUT_MS: '8000',
    });
    assert.deepEqual(cfg.allowedNumbers, ['628110000001', '628110000002']);
    assert.equal(cfg.timeoutMs, 8000);
    assert.equal(cfg.outboxSecret, 's');
  });
});
