const {
  ServiceApiError,
  fetchWithRetry
} = require('./base');

const BASE_URL = 'https://api.put.io/v2/';

function buildUrl(endpoint) {
  return new URL(String(endpoint || '').replace(/^\//, ''), BASE_URL);
}

function parseJson(text, fallback = {}) {
  if (!text) return fallback;
  return JSON.parse(text);
}

function scorePutioResult(file, options) {
  const name = String(file?.name || '');
  let score = 0;
  if (options.year && name.includes(String(options.year))) score += 10;
  if (options.type === 'series' && /S\d{2}E\d{2}/i.test(name)) score += 5;
  return score;
}

class PutioCacheSearchSource {
  constructor(apiKey) {
    this.id = 'putio';
    this.apiKey = String(apiKey || '');
  }

  async _requestJson(endpoint, url = buildUrl(endpoint).toString()) {
    const response = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    }, { serviceId: this.id, endpoint });
    return parseJson(await response.text(), {});
  }

  async searchByTitle(title, options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit || 10)));
    const url = buildUrl('/files/search');
    url.searchParams.set('query', String(title || ''));
    url.searchParams.set('per_page', String(limit));

    const body = await this._requestJson(`/files/search?query=<redacted>&per_page=${limit}`, url.toString());
    const files = Array.isArray(body?.files) ? body.files : [];
    if (String(body?.status || 'OK').toUpperCase() !== 'OK') {
      throw new ServiceApiError({ serviceId: this.id, endpoint: '/files/search', status: 200, body });
    }

    return files
      .filter(file => String(file?.file_type || '').toUpperCase() === 'VIDEO')
      .map((file, index) => ({ file, index, score: scorePutioResult(file, options) }))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .slice(0, limit)
      .map(({ file }) => ({
        sourceId: 'putio',
        name: String(file.name || ''),
        sizeBytes: Number(file.size || 0),
        fileId: String(file.id || ''),
        directStreamUrl: null
      }));
  }

  async searchByHash() {
    // put.io's public API has no account/friends hash index; title search is the only READY query path.
    return null;
  }

  async streamUrl(hit) {
    const fileId = String(hit?.fileId || '').trim();
    const body = await this._requestJson(`/files/${encodeURIComponent(fileId)}/url`);
    if (String(body?.status || 'OK').toUpperCase() !== 'OK') {
      throw new ServiceApiError({ serviceId: this.id, endpoint: '/files/:id/url', status: 200, body });
    }
    return String(body.url || '');
  }
}

module.exports = {
  PutioCacheSearchSource,
  scorePutioResult
};
