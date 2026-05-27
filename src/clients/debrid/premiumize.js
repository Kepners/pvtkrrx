const {
  PremiumizeContainerError,
  ServiceApiError,
  fetchWithRetry,
  sleep
} = require('./base');

const BASE_URL = 'https://www.premiumize.me/api/';
const RATE_LIMIT_DELAYS_MS = [500, 1500];

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

function mapPremiumizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'queued') return 'queued';
  if (value === 'running') return 'downloading';
  if (value === 'finished' || value === 'seeding') return 'ready';
  return 'error';
}

const PLAYABLE_VIDEO_EXT_RE = /\.(?:mkv|mp4|m4v|webm|avi|mov|ts|m2ts|mpg|mpeg)$/i;
const NON_PLAYABLE_EXT_RE = /\.(?:jpg|jpeg|png|gif|webp|nfo|txt|srt|sub|idx|sfv|md5|url|lnk)$/i;

function isPlayableVideoFile(file) {
  const path = String(file?.path || file?.name || '');
  if (!path || NON_PLAYABLE_EXT_RE.test(path)) return false;
  return PLAYABLE_VIDEO_EXT_RE.test(path);
}

function pickPremiumizeStreamFile(files, fileIdx) {
  const list = Array.isArray(files) ? files : [];
  const requestedIndex = Number(fileIdx) || 0;
  const requested = list[requestedIndex];
  if (requested?.link && isPlayableVideoFile(requested)) return requested;

  const playable = list
    .filter(file => file?.link && isPlayableVideoFile(file))
    .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  if (playable.length) return playable[0];

  return requested;
}

class PremiumizeDebridProvider {
  constructor(apiKey) {
    this.id = 'pm';
    this.apiKey = String(apiKey || '');
    this.capabilities = { magnet: true, torrentFile: true, nzb: true };
  }

  async _requestJson(endpoint, options = {}) {
    let rateRetry = 0;

    while (true) {
      const response = await fetchWithRetry(buildUrl(endpoint), {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(options.body && !isFormDataBody(options.body) ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(options.headers || {})
        },
        body: options.body
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

  _assertTransferResponse(body, endpoint) {
    if (body?.type === 'container') {
      throw new PremiumizeContainerError(body);
    }
    if (String(body?.status || '').toLowerCase() === 'success') return;
    throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body });
  }

  async _addSource(src) {
    const endpoint = '/transfer/create';
    const body = await this._requestJson(endpoint, {
      method: 'POST',
      body: formBody({ src })
    });
    this._assertTransferResponse(body, endpoint);
    return { addedId: String(body.id || '') };
  }

  async addMagnet(magnet) {
    return this._addSource(magnet);
  }

  async addTorrentFile(bytes, fileName = 'download.torrent') {
    const payload = normalizeTorrentPayload(bytes);
    const endpoint = '/transfer/create';
    const form = new FormData();
    form.append(
      'src',
      new Blob([payload], { type: 'application/x-bittorrent' }),
      String(fileName || 'download.torrent')
    );
    const body = await this._requestJson(endpoint, {
      method: 'POST',
      body: form
    });
    this._assertTransferResponse(body, endpoint);
    return { addedId: String(body.id || '') };
  }

  async addNzb(nzbUrl) {
    return this._addSource(nzbUrl);
  }

  async selectFiles() {}

  async _findTransfer(addedId) {
    const body = await this._requestJson('/transfer/list');
    const transfers = Array.isArray(body?.transfers) ? body.transfers : (Array.isArray(body?.content) ? body.content : []);
    return transfers.find(transfer => String(transfer?.id) === String(addedId)) || null;
  }

  async pollStatus(addedId) {
    const transfer = await this._findTransfer(addedId);
    if (!transfer) {
      return {
        state: 'error',
        progress: 0,
        files: [],
        errorMessage: 'transfer not found'
      };
    }

    const state = mapPremiumizeStatus(transfer.status);
    return {
      state,
      progress: Math.max(0, Math.min(1, Number(transfer.progress || 0))),
      files: transfer.file_id ? [{
        idx: 0,
        name: String(transfer.name || ''),
        size: Number(transfer.size || 0),
        selected: true
      }] : [],
      ...(state === 'error' ? { errorMessage: String(transfer.message || transfer.status || '') } : {})
    };
  }

  async _flattenFolder(folderId, prefix = '') {
    const body = await this._requestJson(`/folder/list?id=${encodeURIComponent(String(folderId))}`);
    const entries = Array.isArray(body?.content) ? body.content : [];
    const files = [];

    for (const entry of entries) {
      const name = String(entry?.name || '');
      const path = prefix && name ? `${prefix}/${name}` : name;
      if (entry?.type === 'folder') {
        if (Array.isArray(entry.content)) {
          files.push(...this._flattenFolderEntries(entry.content, path));
        } else if (entry.id) {
          files.push(...await this._flattenFolder(entry.id, path));
        }
        continue;
      }

      if (entry?.type === 'file' || entry?.link) {
        files.push({
          id: String(entry.id || ''),
          path,
          size: Number(entry.size || 0),
          link: String(entry.link || '')
        });
      }
    }

    return files;
  }

  _flattenFolderEntries(entries, prefix = '') {
    const files = [];
    for (const entry of (Array.isArray(entries) ? entries : [])) {
      const name = String(entry?.name || '');
      const path = prefix && name ? `${prefix}/${name}` : name;
      if (entry?.type === 'folder') {
        files.push(...this._flattenFolderEntries(entry.content, path));
      } else if (entry?.type === 'file' || entry?.link) {
        files.push({
          id: String(entry.id || ''),
          path,
          size: Number(entry.size || 0),
          link: String(entry.link || '')
        });
      }
    }
    return files;
  }

  async _getItemLink(fileId) {
    const endpoint = `/item/details?id=${encodeURIComponent(String(fileId))}`;
    const body = await this._requestJson(endpoint);
    if (String(body?.status || '').toLowerCase() !== 'success') {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body });
    }

    const link = String(body?.link || body?.content?.link || '');
    if (!link) {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body: { error: 'missing Premiumize item link', fileId } });
    }
    return link;
  }

  async getStreamUrl(addedId, fileIdx) {
    const transfer = await this._findTransfer(addedId);
    if (!transfer) {
      throw new ServiceApiError({ serviceId: this.id, endpoint: '/transfer/list', status: 200, body: { error: 'transfer not found' } });
    }

    if (transfer.file_id) {
      if ((Number(fileIdx) || 0) !== 0) {
        throw new ServiceApiError({ serviceId: this.id, endpoint: '/transfer/list', status: 200, body: { error: 'file index out of range' } });
      }
      if (transfer.link) return String(transfer.link);
      return this._getItemLink(transfer.file_id);
    }

    const files = await this._flattenFolder(transfer.folder_id);
    const file = pickPremiumizeStreamFile(files, fileIdx);
    if (!file?.link) {
      throw new ServiceApiError({ serviceId: this.id, endpoint: '/folder/list', status: 200, body: { error: 'missing Premiumize file link', fileIdx } });
    }
    return file.link;
  }

  async remove(addedId) {
    const endpoint = '/transfer/delete';
    const body = await this._requestJson(endpoint, {
      method: 'POST',
      body: formBody({ id: addedId })
    });
    if (String(body?.status || '').toLowerCase() !== 'success') {
      throw new ServiceApiError({ serviceId: this.id, endpoint, status: 200, body });
    }
  }
}

module.exports = {
  PremiumizeDebridProvider,
  mapPremiumizeStatus,
  pickPremiumizeStreamFile
};
