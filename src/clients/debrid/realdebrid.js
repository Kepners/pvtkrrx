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

const PLAYABLE_VIDEO_EXT_RE = /\.(?:mkv|mp4|m4v|webm|avi|mov|ts|m2ts|mpg|mpeg)$/i;
const NON_PLAYABLE_EXT_RE = /\.(?:jpg|jpeg|png|gif|webp|nfo|txt|srt|sub|idx|sfv|md5|url|lnk)$/i;
// Paths a release puts alongside the feature that are never the thing anyone
// asked to watch. Real-Debrid returns these in the same links array.
const SIDE_CONTENT_RE = /(?:^|[\/\\._-])(?:sample|samples|featurette|featurettes|extra|extras|trailer|trailers|deleted[\s._-]?scenes?|behind[\s._-]?the[\s._-]?scenes|bonus|interviews?|proof|screens?)(?:[\/\\._-]|$)/i;
const EPISODE_RE = /\bS(\d{1,2})[\s._-]?E(\d{1,3})\b/i;

function isPlayableVideoPath(path) {
  const value = String(path || '');
  if (!value || NON_PLAYABLE_EXT_RE.test(value)) return false;
  return PLAYABLE_VIDEO_EXT_RE.test(value);
}

function episodeKeyOf(text) {
  const match = EPISODE_RE.exec(String(text || ''));
  return match ? `s${Number(match[1])}e${Number(match[2])}` : '';
}

// Choose which of a Real-Debrid torrent's files to actually stream.
//
// RD's `links` array has one entry per SELECTED file, in file order — so
// links[i] belongs to the i-th selected file, and blindly taking links[0] takes
// whatever happens to sort first. Audited against this account on 2026-08-17:
// of 80 sampled multi-file torrents, 57 (71%) had something other than the main
// file at index 0 and 46 (58%) had something under a quarter of its size. Real
// cases: a 121 MB /Sample/ clip instead of a 5.51 GB episode, a 30 MB John Candy
// featurette instead of an 11.55 GB film, and the season FINALE for any episode
// request against a season pack.
//
// Order of preference: an explicitly requested index that is playable, then the
// file whose name carries the wanted SxxEyy, then the largest real video with
// samples and extras excluded. Falls back to the old behaviour if nothing
// qualifies, so this can only ever improve on index 0.
function pickStreamLinkIndex(info, { fileIdx = 0, releaseName = '' } = {}) {
  const links = Array.isArray(info?.links) ? info.links : [];
  if (links.length <= 1) return 0;

  const selected = (Array.isArray(info?.files) ? info.files : []).filter(f => f?.selected);
  // Without a usable file list there is nothing to reason about.
  if (selected.length !== links.length) return Math.min(Math.max(0, Number(fileIdx) || 0), links.length - 1);

  const entries = selected.map((file, index) => ({
    index,
    path: String(file?.path || file?.name || ''),
    bytes: Number(file?.bytes || file?.size || 0)
  }));

  const requestedIndex = Number(fileIdx) || 0;
  const requested = entries[requestedIndex];
  if (requestedIndex > 0 && requested && isPlayableVideoPath(requested.path) && !SIDE_CONTENT_RE.test(requested.path)) {
    return requestedIndex;
  }

  const playable = entries.filter(e => isPlayableVideoPath(e.path));
  const main = playable.filter(e => !SIDE_CONTENT_RE.test(e.path));
  const pool = main.length ? main : playable;
  if (!pool.length) return Math.min(Math.max(0, requestedIndex), links.length - 1);

  const wantedEpisode = episodeKeyOf(releaseName);
  if (wantedEpisode) {
    const matches = pool.filter(e => episodeKeyOf(e.path) === wantedEpisode);
    if (matches.length) {
      matches.sort((a, b) => b.bytes - a.bytes);
      return matches[0].index;
    }
  }

  const sorted = [...pool].sort((a, b) => b.bytes - a.bytes);
  return sorted[0].index;
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

  async getStreamUrl(addedId, fileIdx, options = {}) {
    const info = await this._request(`/torrents/info/${encodeURIComponent(String(addedId))}`);
    const links = Array.isArray(info.links) ? info.links : [];
    const chosenIdx = pickStreamLinkIndex(info, {
      fileIdx,
      releaseName: options.releaseName || info.filename || ''
    });
    const link = links[chosenIdx];
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

    // Confirm the item is still on the account before anyone commits to it.
    //
    // The index is up to a minute stale. Without this check a torrent removed
    // in that window is still reported ready, playback skips the add entirely
    // and then polls an id Real-Debrid answers with 404 — and because the
    // caller has already committed to the reuse path there is no way back to a
    // normal add, so a click that used to work returns an error instead. One
    // extra request, only ever on a hit, removes that whole failure mode.
    try {
      const info = await this._request(`/torrents/info/${encodeURIComponent(entry.id)}`);
      if (!info || String(info.status || '') !== 'downloaded') {
        index.delete(hash);
        return null;
      }
    } catch (_) {
      index.delete(hash);
      return null;
    }
    return entry;
  }
}

module.exports = {
  RealDebridProvider,
  mapRdStatus,
  _clearAccountIndexCache: () => accountIndexCache.clear()
};
