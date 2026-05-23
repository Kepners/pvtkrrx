const DEFAULT_TIMEOUT_MS = 10000;
const SERVER_RETRY_DELAYS_MS = [500, 1500];
const DEFAULT_RATE_LIMIT_DELAY_MS = 5000;

class UnsupportedCapabilityError extends Error {
  constructor(providerId, capability) {
    super(`${providerId} does not support ${capability}`);
    this.name = 'UnsupportedCapabilityError';
    this.providerId = providerId;
    this.capability = capability;
  }
}

class ServiceApiError extends Error {
  constructor({ serviceId, endpoint, status, body }) {
    super(`[svc:${serviceId}] ${endpoint} HTTP ${status}`);
    this.name = 'ServiceApiError';
    this.serviceId = serviceId;
    this.endpoint = endpoint;
    this.status = status;
    this.body = body;
  }
}

class RdInfringingFileError extends Error {
  constructor({ addedId, body } = {}) {
    super('Real-Debrid rejected the torrent as infringing_file');
    this.name = 'RdInfringingFileError';
    this.addedId = addedId || '';
    this.body = body || null;
  }
}

class PremiumizeContainerError extends Error {
  constructor(body) {
    super('Premiumize returned a container response; direct magnet or NZB URL required');
    this.name = 'PremiumizeContainerError';
    this.body = body || null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function parseRetryAfter(headerValue) {
  const raw = String(headerValue || '').trim();
  if (!raw) return DEFAULT_RATE_LIMIT_DELAY_MS;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return DEFAULT_RATE_LIMIT_DELAY_MS;
}

async function readBody(response) {
  const text = await response.text().catch(() => '');
  if (!text) return '';

  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

async function fetchOnce(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await globalThis.fetch(url, {
      ...opts,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shared provider HTTP helper. It never logs URLs or headers so API keys cannot
 * leak through query strings or Authorization headers.
 *
 * @param {string} url
 * @param {object} opts
 * @param {{ serviceId: string, endpoint: string }} ctx
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, opts = {}, ctx = {}) {
  const serviceId = String(ctx.serviceId || 'unknown');
  const endpoint = String(ctx.endpoint || 'unknown');
  const method = String(opts.method || 'GET').toUpperCase();
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
  let serverRetryIndex = 0;
  let retriedRateLimit = false;
  let lastError = null;

  while (true) {
    let response = null;
    try {
      response = await fetchOnce(url, opts, timeoutMs);
    } catch (error) {
      lastError = error;
      if (serverRetryIndex < SERVER_RETRY_DELAYS_MS.length) {
        await sleep(SERVER_RETRY_DELAYS_MS[serverRetryIndex]);
        serverRetryIndex += 1;
        continue;
      }
      throw error;
    }

    console.log(`[svc:${serviceId}] ${method} ${endpoint} \u2192 ${response.status}`);

    if (response.status === 429 && !retriedRateLimit) {
      retriedRateLimit = true;
      await sleep(parseRetryAfter(response.headers.get('retry-after')));
      continue;
    }

    if (response.status >= 500 && response.status <= 599 && serverRetryIndex < SERVER_RETRY_DELAYS_MS.length) {
      await sleep(SERVER_RETRY_DELAYS_MS[serverRetryIndex]);
      serverRetryIndex += 1;
      continue;
    }

    if (!response.ok) {
      const body = await readBody(response);
      throw new ServiceApiError({ serviceId, endpoint, status: response.status, body });
    }

    return response;
  }
}

function getDebridProvider(type, apiKey) {
  switch (String(type || '').toLowerCase()) {
    case 'rd': {
      const { RealDebridProvider } = require('./realdebrid');
      return new RealDebridProvider(apiKey);
    }
    case 'ad': {
      const { AllDebridProvider } = require('./alldebrid');
      return new AllDebridProvider(apiKey);
    }
    case 'pm': {
      const { PremiumizeDebridProvider } = require('./premiumize');
      return new PremiumizeDebridProvider(apiKey);
    }
    default:
      throw new UnsupportedCapabilityError(String(type || 'unknown'), 'provider');
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  UnsupportedCapabilityError,
  ServiceApiError,
  RdInfringingFileError,
  PremiumizeContainerError,
  fetchWithRetry,
  getDebridProvider,
  readBody,
  sleep
};
