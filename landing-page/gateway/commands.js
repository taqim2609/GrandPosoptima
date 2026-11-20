/**
 * GrandPOS WhatsApp gateway command layer.
 *
 * Zero-LLM command parsing, allowlist enforcement, HMAC verification and
 * idempotency live here. This replaces the (non-existent) Hermes
 * `pre_gateway_dispatch` hook — see gateway/README.md for the rationale.
 *
 * The parser is a faithful port of app/parsers.py so both the Python API and
 * this service agree byte-for-byte on what counts as a command.
 */

'use strict';

const crypto = require('crypto');

const JID_SUFFIXES = ['@s.whatsapp.net', '@c.us', '@g.us', '@lid'];
const SLASH = /^\/(stok|laporan-shift|dashboard)\b\s*(.*)$/i;
const RESERVASI = /^#reservasi\b(.*)$/i;
const PHONE = /^\d{8,15}$/;

const ENDPOINTS = {
  '/stok': '/reports/low-stock',
  '/laporan-shift': '/shifts/active/summary',
  '/dashboard': '/reports/dashboard',
};

const MONTHS_ID = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4,
  mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agustus: 8, aug: 8,
  sep: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11,
  des: 12, desember: 12,
};

const TODAY_WORDS = ['hari ini', 'today', 'sekarang', 'skrg'];
const TOMORROW_WORDS = ['besok', 'tomorrow', 'esok'];

const MAX_PARTY_SIZE = 500;

/** Normalise a WhatsApp JID or raw phone into digits (62…), throwing on junk. */
function normalisePhone(raw) {
  if (!raw) throw new Error('empty sender');
  let value = String(raw).trim();
  for (const suffix of JID_SUFFIXES) {
    if (value.includes(suffix)) {
      value = value.split(suffix)[0];
      break;
    }
  }
  value = value.split(':')[0];
  value = value.replace(/[^\d+]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  if (value.startsWith('0')) value = '62' + value.slice(1);
  if (!PHONE.test(value)) throw new Error('unparseable sender');
  return value;
}

function maskPhone(phone) {
  const digits = normalisePhone(phone);
  if (digits.length <= 6) return '*'.repeat(digits.length);
  return `${digits.slice(0, 5)}***${digits.slice(-2)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseTime(token) {
  const t = String(token).toLowerCase().replace('wib', '').replace(':', '.').trim();
  const m = /^(\d{1,2})[.\s]?(\d{2})?$/.exec(t);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function isoDate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseDate(token, today) {
  const t = String(token).trim().toLowerCase();
  if (TODAY_WORDS.includes(t)) return today;
  if (TOMORROW_WORDS.includes(t)) {
    const d = new Date(today.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  m = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(t);
  if (m) {
    const day = Number(m[1]);
    const key = m[2].slice(0, 9) in MONTHS_ID ? m[2].slice(0, 9) : m[2].slice(0, 3);
    const month = MONTHS_ID[key];
    if (!month) return null;
    let year = m[3] ? Number(m[3]) : today.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, month - 1, day));
    if (!m[3] && candidate.getTime() < today.getTime()) {
      year += 1;
      candidate = new Date(Date.UTC(year, month - 1, day));
    }
    return candidate;
  }
  return null;
}

function parsePartySize(token) {
  const digits = String(token).replace(/\D/g, '');
  if (!digits || digits.length > 3) return null;
  const value = Number(digits);
  return value > 0 && value <= MAX_PARTY_SIZE ? value : null;
}

/** Parse `Nama/Tgl/Jam/JumlahOrang`; returns null when it is not a valid request. */
function parseReservation(payload, today) {
  const base = (today || new Date()).toISOString().slice(0, 10);
  const todayDate = new Date(`${base}T00:00:00Z`);
  const body = String(payload || '').replace(/^[\s/|,]+|[\s/|,]+$/g, '');
  if (!body) return null;

  const parts = body.split(/[/|,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const partySize = parsePartySize(parts[parts.length - 1]);
  const time = parseTime(parts[parts.length - 2]);
  const date = parseDate(parts[parts.length - 3], todayDate);
  const name = parts.slice(0, parts.length - 3).join(' ').trim();
  if (!name || name.length > 80) return null;
  if (!partySize || !time || !date) return null;

  return {
    type: 'reservation',
    customer_name: name,
    reserved_date: isoDate(date),
    reserved_time: `${pad2(time.hour)}:${pad2(time.minute)}`,
    party_size: partySize,
  };
}

/**
 * Parse one inbound message.
 * Returns {type:'command'|'reservation'} or {type:'unrecognised'}; the caller
 * forwards 'unrecognised' text to the named Hermes profile.
 */
function parseMessage(text, today) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { type: 'unrecognised', raw: '' };

  const slash = SLASH.exec(cleaned);
  if (slash) {
    const name = '/' + slash[1].toLowerCase();
    const rest = (slash[2] || '').replace(/\s+/g, ' ').trim();
    if (name === '/laporan-shift' && rest) {
      if (!/^[A-Za-z0-9\- ]{1,32}$/.test(rest)) return { type: 'unrecognised', raw: cleaned };
      return { type: 'command', name, endpoint: ENDPOINTS[name], args: [rest] };
    }
    if (name !== '/laporan-shift' && rest) return { type: 'unrecognised', raw: cleaned };
    return { type: 'command', name, endpoint: ENDPOINTS[name], args: [] };
  }

  const res = RESERVASI.exec(cleaned);
  if (res) {
    const parsed = parseReservation(res[1], today);
    return parsed || { type: 'unrecognised', raw: cleaned };
  }

  return { type: 'unrecognised', raw: cleaned };
}

/** Constant-time HMAC-SHA256 verification of an outbound/inbound webhook body. */
function verifySignature({ body, secret, header, timestamp, toleranceSeconds = 300, now }) {
  if (!secret) throw new Error('missing HMAC secret');
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new Error('invalid timestamp');
  const current = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  if (ts > current + 60) throw new Error('timestamp in the future');
  if (current - ts > toleranceSeconds) throw new Error('timestamp outside tolerance');

  let provided = String(header || '').trim();
  if (provided.startsWith('sha256=')) provided = provided.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(provided)) throw new Error('malformed signature');

  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${canonicalise(body)}`)
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided.toLowerCase(), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('signature mismatch');
  }
  return { payload, digest: expected };
}

/** Canonical JSON: sorted keys, compact separators (matches Python side). */
function canonicalise(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return JSON.stringify(sortKeys(parsed));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function dedupeKey(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

module.exports = {
  ENDPOINTS,
  normalisePhone,
  maskPhone,
  parseMessage,
  parseReservation,
  verifySignature,
  canonicalise,
  dedupeKey,
};
