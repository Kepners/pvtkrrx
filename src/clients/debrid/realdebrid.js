const {
  RdInfringingFileError,
  ServiceApiError,
  UnsupportedCapabilityError,
  fetchWithRetry
} = require('./base');
const { sanitizeMagnet } = require('../../utils/rdFilenameSanitizer');

const BASE_URL = 'https://api.real-debrid.com/rest/1.0/';

function buildUrl(endpoint) {
  return new URL(String(endpoint || '').replace(/^\//, ''), BASE_URL).toString();
}

function formBody(entries) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(entries || {})) {
    body.set(key, String(value));
  }
  return body;
}

function parseJson(text, fallback = {}) {
  if (!text) return fallback;
  return JSON.parse(text);
}

function normalizeTorrentPayload(bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!payload || payload.length === 0) {
    throw new Error('torrent payload is empty');
  }
  return payload;
}

function isRdInfringingFile(error) {
  if (!(error instanceof ServiceApiError) || error.status !== 403) return false;
  const body = error.body;
  if (body && typeof body === 'object') {
    return Number(body.error_code) === 35 || String(body.error || '').toLowerCase().includes('infringing_file');
  }
  return String(body || '').toLowerCase().includes('infringing_file');
}

function mapRdStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['magnet_conversion', 'waiting_files_selection', 'queued'].includes(value)) return 'queued';
  if (['downloading', 'compressing', 'uploading'].includes(value)) return 'downloading';
  if (value === 'downloaded') return 'ready';
  return 'error';
}

class RealDebridProvider {
  constructor(apiKey) {
    this.id = 'rd';
    this.apiKey = String(apiKey || '');
    this.capabilities = { magnet: true, torrentFile: true, nzb: false };
  }

  async _request(endpoint, options = {}) {
    const response = await fetchWithRetry(buildUrl(endpoint), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(options.headers || {})
      },
      body: options.body
    }, { serviceId: this.id, endpoint });

    if (options.expectNoContent) return null;
    const text = await response.text();
    return parseJson(text, {});
  }

  async addMagnet(magnet) {
    const sanitizedMagnet = sanitizeMagnet(magnet);
    try {
      const body = await this._request('/torrents/addMagnet', {
        method: 'POST',
        body: formBody({ magnet: sanitizedMagnet })
      });
      return { addedId: String(body.id || '') };
    } catch (error) {
      if (isRdInfringingFile(error)) {
        throw new RdInfringingFileError({ body: error.body });
      }
      throw error;
    }
  }

  async addTorrentFile(bytes) {
    const payload = normalizeTorrentPayload(bytes);
    try {
      const body = await this._request('/torrents/addTorrent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-bittorrent' },
        body: payload
      });
      return { addedId: String(body.id || '') };
    } catch (error) {
      if (isRdInfringingFile(error)) {
        throw new RdInfringingFileError({ body: error.body });
      }
      throw error;
    }
  }

  async addNzb() {
    throw new UnsupportedCapabilityError(this.id, 'nzb');
  }

  async selectFiles(addedId, fileIdxs) {
    const files = fileIdxs === 'all' ? 'all' : (Array.isArray(fileIdxs) ? fileIdxs.join(',') : String(fileIdxs || ''));
    await this._request(`/torrents/selectFiles/${encodeURIComponent(String(addedId))}`, {
      method: 'POST',
      body: formBody({ files }),
      expectNoContent: true
    });
  }

  async pollStatus(addedId) {
    const info = await this._request(`/torrents/info/${encodeURIComponent(String(addedId))}`);
    const state = mapRdStatus(info.status);
    return {
      state,
      progress: Math.max(0, Math.min(1, Number(info.progress || 0) / 100)),
      files: (Array.isArray(info.files) ? info.files : []).map((file, index) => ({
        idx: Number(file.id ?? index),
        name: String(file.path || file.name || ''),
        size: Number(file.bytes || file.size || 0),
        selected: Boolean(file.selected)
      })),
      ...(state === 'error' ? { errorMessage: String(info.error || info.status || '') } : {})
    };
  }

  async getStreamUrl(addedId, fileIdx) {
    const info = await this._request(`/torrents/info/${encodeURIComponent(String(addedId))}`);
    const links = Array.isArray(info.links) ? info.links : [];
    const link = links[Number(fileIdx) || 0];
    if (!link) {
      throw new ServiceApiError({
        serviceId: this.id,
        endpoint: '/torrents/info/:id',
        status: 200,
        body: { error: 'missing Real-Debrid host link', fileIdx }
      });
    }

    const unrestricted = await this._request('/unrestrict/link', {
      method: 'POST',
      body: formBody({ link })
    });

    return String(unrestricted.download || '');
  }

  async remove(addedId) {
    await this._request(`/torrents/delete/${encodeURIComponent(String(addedId))}`, {
      method: 'DELETE',
      expectNoContent: true
    });
  }
}

module.exports = {
  RealDebridProvider,
  mapRdStatus
};
