'use strict';

// WhatsApp gateway settings used to live in two places:
//
//   db.settings.wa      -> what the senders and the settings form read/write
//   db.whatsappConfig   -> a second, newer store used by the "missing routes"
//
// They drifted: settings.wa pointed at WACloud (`api_key` + `device_id`) while
// whatsappConfig carried a placeholder Evolution Cloud Run URL and a hard-coded
// `status: 'connected'`. The status endpoint read one store, the sender used the
// other, so the UI could say "connected" or "unconfigured" at the same time.
//
// `settings.wa` is now the single source of truth. `whatsappConfig` is kept as a
// derived mirror for older clients, and placeholder Evolution values are ignored
// instead of being reported as real configuration.

const WACLOUD_BASE_URL = 'https://app.wacloud.id/api/v1';
const EVOLUTION_PLACEHOLDER = /evolution-api-pos-xyz|GAK_EVOLUTION_SECRET_KEY_2026/i;

function isPlaceholderEvolution(url, key) {
  return EVOLUTION_PLACEHOLDER.test(String(url || '')) || EVOLUTION_PLACEHOLDER.test(String(key || ''));
}

function readWaConfig(db) {
  const legacy = (db.settings && db.settings.wa) || {};
  const mirror = db.whatsappConfig || {};

  // A real Evolution deployment must not be a placeholder. If the only
  // Evolution values we have are the seeded placeholders, ignore them.
  const mirrorEvolutionReal = Boolean(
    mirror.evolution_url && !isPlaceholderEvolution(mirror.evolution_url, mirror.evolution_api_key)
  );

  const hasWacloud = Boolean((legacy.api_key && legacy.device_id) || (mirror.api_key && mirror.device_id));
  const provider = legacy.provider || (hasWacloud ? 'wacloud' : mirrorEvolutionReal ? 'evolution' : 'wacloud');

  return {
    ...mirror,
    ...legacy,
    provider,
    base_url: legacy.base_url || mirror.base_url || WACLOUD_BASE_URL,
    api_key: legacy.api_key || mirror.api_key || '',
    device_id: legacy.device_id || mirror.device_id || '',
    device_name: legacy.device_name || mirror.device_name || '',
    evolution_url: legacy.evolution_url || (mirrorEvolutionReal ? mirror.evolution_url : ''),
    evolution_api_key: legacy.evolution_api_key || (mirrorEvolutionReal ? mirror.evolution_api_key : ''),
    evolution_instance: legacy.evolution_instance || mirror.evolution_instance || 'grand-aceh-pos',
    phone: legacy.phone || mirror.phone || '',
    recipients: Array.isArray(legacy.recipients)
      ? legacy.recipients
      : Array.isArray(mirror.recipients)
        ? mirror.recipients
        : [],
    auto_receipt: legacy.auto_receipt !== undefined ? legacy.auto_receipt : mirror.auto_receipt !== false,
    auto_failover: legacy.auto_failover !== false,
    // Never surface a cached "connected"; callers use probeWaStatus() for that.
    status: legacy.status || '',
  };
}

function isWaConfigured(cfg) {
  if (!cfg) return false;
  if (cfg.provider === 'evolution') return Boolean(cfg.evolution_url && cfg.evolution_api_key);
  if (cfg.provider === 'hermes') return Boolean(cfg.hermes_url);
  return Boolean(cfg.api_key && cfg.device_id);
}

// Keep `db.whatsappConfig` as a derived view. Callers that still read it get
// the same values as `settings.wa`, never a stale "connected" claim.
function syncWaMirror(db) {
  const cfg = readWaConfig(db);
  const mirror = {
    ...(db.whatsappConfig || {}),
    provider: cfg.provider,
    configured: isWaConfigured(cfg),
    api_url: cfg.provider === 'evolution' ? cfg.evolution_url : cfg.base_url,
    base_url: cfg.base_url,
    device_id: cfg.device_id,
    device_name: cfg.device_name,
    phone: cfg.phone,
    recipients: cfg.recipients,
    auto_receipt: cfg.auto_receipt,
    evolution_url: cfg.evolution_url,
    evolution_api_key: cfg.evolution_api_key,
    evolution_instance: cfg.evolution_instance,
    derived_from: 'settings.wa',
    updated_at: new Date().toISOString(),
  };
  // A mirrored config must not carry a cached connection claim; only a live
  // probe may say "connected".
  delete mirror.status;
  db.whatsappConfig = mirror;
  return mirror;
}

function saveWaConfig(db, patch) {
  if (!db.settings) db.settings = {};
  db.settings.wa = { ...(db.settings.wa || {}), ...(patch || {}) };
  syncWaMirror(db);
  return db.settings.wa;
}

async function probeWaStatus(db, fetchImpl = fetch) {
  const cfg = readWaConfig(db);
  const has_key = Boolean(cfg.provider === 'evolution' ? cfg.evolution_api_key : cfg.api_key);

  if (cfg.provider === 'evolution') {
    if (!cfg.evolution_url || !cfg.evolution_api_key) {
      return { status: 'disconnected', state: 'unconfigured', provider: 'evolution', api_url: cfg.evolution_url || '', instance_name: cfg.evolution_instance, has_key, details: {} };
    }
    try {
      const url = cfg.evolution_url.replace(/\/+$/, '');
      const response = await fetchImpl(`${url}/instance/connectionState/${encodeURIComponent(cfg.evolution_instance)}`, {
        headers: { apikey: cfg.evolution_api_key },
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const instState = String((data.instance && data.instance.state) || data.state || '').toLowerCase();
        const state = instState || 'unknown';
        return {
          status: ['open', 'connected'].includes(state) ? 'connected' : state,
          state,
          provider: 'evolution',
          api_url: cfg.evolution_url,
          instance_name: cfg.evolution_instance,
          has_key,
          details: data,
        };
      }
      const state = response.status === 404 ? 'not_created' : `http_${response.status}`;
      return { status: 'disconnected', state, provider: 'evolution', api_url: cfg.evolution_url, instance_name: cfg.evolution_instance, has_key, details: {} };
    } catch (err) {
      return { status: 'disconnected', state: 'offline', provider: 'evolution', api_url: cfg.evolution_url, instance_name: cfg.evolution_instance, has_key, details: { error: err.message } };
    }
  }

  // WACloud: ask the provider which devices the key actually owns. The stored
  // `device_id` can go stale after a device is re-created, so report the device
  // the key sees instead of claiming a fixed status.
  if (!cfg.api_key) {
    return { status: 'disconnected', state: 'unconfigured', provider: 'wacloud', api_url: cfg.base_url, instance_name: cfg.device_name || cfg.device_id || '', has_key, details: {} };
  }
  try {
    const base = (cfg.base_url || WACLOUD_BASE_URL).replace(/\/+$/, '');
    const response = await fetchImpl(`${base}/devices`, {
      headers: { 'X-Api-Key': cfg.api_key },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      return { status: 'disconnected', state: `http_${response.status}`, provider: 'wacloud', api_url: cfg.base_url, instance_name: cfg.device_name || '', has_key, details: {} };
    }
    const body = await response.json().catch(() => ({}));
    const devices = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
    const device =
      devices.find((d) => String(d.id) === String(cfg.device_id)) ||
      devices.find((d) => String(d.status || '').toLowerCase() === 'connected') ||
      devices[0] ||
      null;
    const deviceState = String((device && device.status) || 'disconnected').toLowerCase();
    return {
      status: deviceState === 'connected' ? 'connected' : 'disconnected',
      state: device ? deviceState : 'no_device',
      provider: 'wacloud',
      api_url: cfg.base_url,
      instance_name: (device && device.name) || cfg.device_name || '',
      device_id: (device && device.id) || cfg.device_id || '',
      device_id_matches: Boolean(device && String(device.id) === String(cfg.device_id)),
      has_key,
      details: { devices },
    };
  } catch (err) {
    return { status: 'disconnected', state: 'offline', provider: 'wacloud', api_url: cfg.base_url, instance_name: cfg.device_name || '', has_key, details: { error: err.message } };
  }
}

module.exports = {
  WACLOUD_BASE_URL,
  isPlaceholderEvolution,
  readWaConfig,
  isWaConfigured,
  syncWaMirror,
  saveWaConfig,
  probeWaStatus,
};
