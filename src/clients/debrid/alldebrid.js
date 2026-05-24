const {
  ServiceApiError,
  UnsupportedCapabilityError,
  fetchWithRetry
} = require('./base');

const BASE_URL = 'https://api.alldebrid.com/';

function buildUrl(endpoint) {
  return new URL(String(endpoint || '').replace(/^\//, ''), BASE_URL).toString();
}

function formBody(entries) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(entries || {})) {
    if (Array.isArray(value)) {
      for (const item of value) body.append(key, String(item));
    } else {
      body.set(key, String(value));
    }
  }
  return body;
}

function parseJson(text, fallback = {}) {
  if (!text) return fallback;
  return JSON.parse(text);
}

function isFormDataBody(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function normalizeTorrentPayload(bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!payload || payload.length === 0) {
    throw new Error('torrent payload is empty');
  }
  return payload;
}

function flattenAdTree(files) {
  const result = [];

  function visit(nodes, prefix = '') {
    for (const node of (Array.isArray(nodes) ? nodes : [])) {
      const name = String(node?.n || node?.name || '').trim();
      const path = prefix && name ? `${prefix}/${name}` : (name || prefix);
      if (Array.isArray(node?.e)) {
        visit(node.e, path);
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(node || {}, 's') || Object.prototype.hasOwnProperty.call(node || {}, 'l')) {
        result.push({
          path,
          size: Number(node.s || node.size || 0),
          link: String(node.l || node.link || '')
        });
      }
    }
  }

  visit(files);
  return result;
}

function mapAdStatusCode(statusCode) {
  const code = Number(statusCode);
  if (code === 0) return 'queued';
  if ([1, 2, 3].includes(code)) return 'downloading';
  if (code === 4) return 'ready';
  return 'error';
}

class AllDebridProvider {
  constructor(apiKey) {
    this.id = 'ad';
    this.apiKey = String(apiKey || '');
    this.capabilities = { magnet: true, torrentFile: true, nzb: false };
  }

  async _request(endpoint, options = {}) {
    const response = await fetchWithRetry(buildUrl(endpoint), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.body && !isFormDataBody(options.body) ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(options.headers || {})
      },
      body: options.body
    }, { serviceId: this.id, endpoint });

    if (options.expectNoContent) return null;
    const text = await response.text();
    return parseJson(text, {});
  }

  _assertSuccess(body, endpoint) {
    if (String(body?.status || '').toLowerCase() === 'success') return;
    throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body });
  }

  async addMagnet(magnet) {
    const endpoint = '/v4/magnet/upload';
    const body = await this._request(endpoint, {
      method: 'POST',
      body: formBody({ 'magnets[]': [magnet] })
    });
    this._assertSuccess(body, endpoint);

    const entry = Array.isArray(body?.data?.magnets) ? body.data.magnets[0] : null;
    if (!entry || entry.error) {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body: entry || body });
    }

    return { addedId: String(entry.id) };
  }

  async addTorrentFile(bytes, fileName = 'download.torrent') {
    const payload = normalizeTorrentPayload(bytes);
    const endpoint = '/v4/magnet/upload/file';
    const form = new FormData();
    form.append(
      'files[]',
      new Blob([payload], { type: 'application/x-bittorrent' }),
      String(fileName || 'download.torrent')
    );
    const body = await this._request(endpoint, {
      method: 'POST',
      body: form
    });
    this._assertSuccess(body, endpoint);

    const entry = Array.isArray(body?.data?.files) ? body.data.files[0] : null;
    if (!entry || entry.error) {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body: entry || body });
    }

    return { addedId: String(entry.id) };
  }

  async addNzb() {
    throw new UnsupportedCapabilityError(this.id, 'nzb');
  }

  async selectFiles() {}

  async _getMagnetStatus(addedId) {
    const endpoint = '/v4.1/magnet/status';
    const body = await this._request(endpoint, {
      method: 'POST',
      body: formBody({ id: addedId })
    });
    this._assertSuccess(body, endpoint);

    const magnets = Array.isArray(body?.data?.magnets) ? body.data.magnets : [body?.data?.magnets].filter(Boolean);
    const target = magnets.find(magnet => String(magnet?.id) === String(addedId)) || magnets[0];
    if (!target) {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body });
    }
    return target;
  }

  async pollStatus(addedId) {
    const magnet = await this._getMagnetStatus(addedId);
    const state = mapAdStatusCode(magnet.statusCode);
    const size = Number(magnet.size || 0);
    const downloaded = Number(magnet.downloaded || 0);
    const files = flattenAdTree(magnet.files).map((file, index) => ({
      idx: index,
      name: file.path,
      size: file.size,
      selected: true
    }));

    return {
      state,
      progress: size > 0 ? Math.max(0, Math.min(1, downloaded / size)) : 0,
      files,
      ...(state === 'error' ? { errorMessage: String(magnet.status || magnet.statusCode || '') } : {})
    };
  }

  async getStreamUrl(addedId, fileIdx) {
    const magnet = await this._getMagnetStatus(addedId);
    const files = flattenAdTree(magnet.files);
    const file = files[Number(fileIdx) || 0];
    if (!file?.link) {
      throw new ServiceApiError({
        serviceId: this.id,
        endpoint: '/v4.1/magnet/status',
        status: 200,
        body: { error: 'missing AllDebrid file link', fileIdx }
      });
    }

    const endpoint = '/v4/link/unlock';
    const unlocked = await this._request(endpoint, {
      method: 'POST',
      body: formBody({ link: file.link })
    });
    this._assertSuccess(unlocked, endpoint);
    return String(unlocked?.data?.link || '');
  }

  async remove(addedId) {
    const endpoint = '/v4/magnet/delete';
    const body = await this._request(endpoint, {
      method: 'POST',
      body: formBody({ id: addedId })
    });
    this._assertSuccess(body, endpoint);
  }
}

module.exports = {
  AllDebridProvider,
  flattenAdTree,
  mapAdStatusCode
};
