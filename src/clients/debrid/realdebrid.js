const {
  RdInfringingFileError,
  ServiceApiError,
  UnsupportedCapabilityError,
  fetchWithRetry,
  makeUrlBuilder,
  formBody,
  parseJson,
  normalizeTorrentPayload
} = require('./base');
const { sanitizeMagnet } = require('../../utils/rdFilenameSanitizer');

const BASE_URL = 'https://api.real-debrid.com/rest/1.0/';
const buildUrl = makeUrlBuilder(BASE_URL);

// Account listing is shared across every candidate in a stream list and across
// concurrent requests, so it is memoised per API key. The promise is cached (not
// just the result) so a dozen simultaneous lookups collapse into one call.
const ACCOUNT_INDEX_TTL_MS = Math.max(10 * 1000, parseInt(
  process.env.PVTKRRX_RD_ACCOUNT_INDEX_TTL_MS || '60000',
  10
) || 60000);
const ACCOUNT_INDEX_PAGE_SIZE = 100;
const ACCOUNT_INDEX_MAX_PAGES = Math.max(1, parseInt(
  process.env.PVTKRRX_RD_ACCOUNT_INDEX_MAX_PAGES || '10',
  10
) || 10);
const accountIndexCache = new Map();

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

  // Everything already sitting on the account, indexed by infohash.
  //
  // Real-Debrid retired the public "instant availability" endpoint, so PVTKRRX
  // had no way to answer "is this ready?" for RD and every RD row was labelled
  // (and treated as) "will download". The account's OWN torrent list is a
  // completely reliable answer to a narrower but more useful question: does
  // THIS account already hold this exact torrent, finished? If it does, playback
  // is instant and re-adding it is pure waste.
  //
  // Seen live 2026-08-15: one HOTD infohash sat on the account FOUR times and
  // another THREE times, because every click re-added a torrent the account had
  // already finished, then waited for it to "download" again. Hence the owner's
  // report that only qBit rows start instantly.
  //
  // The whole page set is fetched once and shared: a stream list inspects a
  // dozen candidates, and that must cost one request, not a dozen.
  async accountIndex() {
    const cacheKey = this.apiKey;
    const cached = accountIndexCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = (async () => {
      const index = new Map();
      let page = 1;
      while (page <= ACCOUNT_INDEX_MAX_PAGES) {
        const rows = await this._request(
          `/torrents?limit=${ACCOUNT_INDEX_PAGE_SIZE}&page=${page}`
        );
        if (!Array.isArray(rows) || rows.length === 0) break;
        for (const row of rows) {
          const hash = String(row?.hash || '').toLowerCase();
          if (!hash) continue;
          const entry = {
            id: String(row.id || ''),
            hash,
            filename: String(row.filename || ''),
            bytes: Number(row.bytes || 0),
            status: String(row.status || ''),
            progress: Number(row.progress || 0)
          };
          // Keep the finished copy when duplicates exist — an unfinished retry
          // must never mask a completed one.
          const existing = index.get(hash);
          if (!existing || (existing.status !== 'downloaded' && entry.status === 'downloaded')) {
            index.set(hash, entry);
          }
        }
        if (rows.length < ACCOUNT_INDEX_PAGE_SIZE) break;
        page += 1;
      }
      return index;
    })();

    accountIndexCache.set(cacheKey, {
      expiresAt: Date.now() + ACCOUNT_INDEX_TTL_MS,
      promise
    });

    try {
      return await promise;
    } catch (err) {
      // Never let one failed listing poison the next lookup.
      accountIndexCache.delete(cacheKey);
      throw err;
    }
  }

  // The finished account entry for this infohash, or null. Null is also the
  // answer when the listing fails — an unknown account state must degrade to
  // the existing add-and-poll path, never to a false "ready".
  async findReadyByHash(infohash) {
    const hash = String(infohash || '').trim().toLowerCase();
    if (!hash) return null;
    let index;
    try {
      index = await this.accountIndex();
    } catch (_) {
      return null;
    }
    const entry = index.get(hash);
    if (!entry || entry.status !== 'downloaded') return null;
    return entry;
  }
}

module.exports = {
  RealDebridProvider,
  mapRdStatus,
  _clearAccountIndexCache: () => accountIndexCache.clear()
};
