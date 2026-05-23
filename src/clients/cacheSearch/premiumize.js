const {
  ServiceApiError,
  fetchWithRetry
} = require('./base');
const { sleep } = require('../debrid/base');

const BASE_URL = 'https://www.premiumize.me/api/';
const RATE_LIMIT_DELAYS_MS = [500, 1500];

function buildUrl(endpoint) {
  return new URL(String(endpoint || '').replace(/^\//, ''), BASE_URL);
}

function parseJson(text, fallback = {}) {
  if (!text) return fallback;
  return JSON.parse(text);
}

class PremiumizeCacheSearchSource {
  constructor(apiKey) {
    this.id = 'pm';
    this.apiKey = String(apiKey || '');
  }

  async _requestJson(endpoint, url = buildUrl(endpoint).toString()) {
    let rateRetry = 0;

    while (true) {
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }, { serviceId: this.id, endpoint });

      const body = parseJson(await response.text(), {});
      if (String(body?.status || '').toLowerCase() !== 'rate_limit_reached') {
        return body;
      }

      if (rateRetry >= RATE_LIMIT_DELAYS_MS.length) {
        throw new ServiceApiError({ serviceId: this.id, endpoint, status: response.status, body });
      }

      await sleep(RATE_LIMIT_DELAYS_MS[rateRetry]);
      rateRetry += 1;
    }
  }

  async searchByTitle() {
    return [];
  }

  async searchByHash(infohash) {
    const hash = String(infohash || '').trim();
    const url = buildUrl('/cache/check');
    url.searchParams.append('items[]', `magnet:?xt=urn:btih:${hash}`);

    const body = await this._requestJson('/cache/check?items[]=<magnet>', url.toString());
    if (String(body?.status || '').toLowerCase() !== 'success') {
      throw new ServiceApiError({ serviceId: this.id, endpoint: '/cache/check', status: 200, body });
    }

    if (!Array.isArray(body.response) || body.response[0] !== true) {
      return null;
    }

    return {
      sourceId: 'pm',
      name: String(Array.isArray(body.filename) ? body.filename[0] : hash),
      sizeBytes: Number(Array.isArray(body.filesize) ? body.filesize[0] : 0),
      infohash: hash,
      directStreamUrl: null
    };
  }

  async streamUrl(hit) {
    return hit?.directStreamUrl ?? null;
  }
}

module.exports = {
  PremiumizeCacheSearchSource
};
