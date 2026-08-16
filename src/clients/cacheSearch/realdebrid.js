const { RealDebridProvider } = require('../debrid/realdebrid');

// "Is this ready to play right now?" for Real-Debrid.
//
// Premiumize and put.io answer this with a cache-check endpoint. Real-Debrid
// retired theirs, so RD had no cache-search source at all — which meant no RD
// row could ever be marked "⚡ READY", every RD row said "will download", and
// clicking one re-added a torrent the account might already hold.
//
// This source answers the question from the account's own finished torrents.
// That is a narrower claim than "RD can get this instantly" and a stronger one:
// the file is already on the account, so it streams immediately.
class RealDebridCacheSearchSource {
  constructor(apiKey) {
    this.id = 'rd';
    this.apiKey = String(apiKey || '');
    this.provider = new RealDebridProvider(this.apiKey);
  }

  // Title matching against account filenames. Deliberately conservative: every
  // significant word of the query must appear, so "House of the Dragon S01E01"
  // cannot match a different episode. Loose matching here would put a confident
  // "READY" label on the wrong file, which is worse than showing nothing.
  async searchByTitle(title, options = {}) {
    const query = String(title || '').trim().toLowerCase();
    if (!query) return [];

    let index;
    try {
      index = await this.provider.accountIndex();
    } catch (_) {
      return [];
    }

    const terms = query
      .split(/[^a-z0-9]+/i)
      .filter(term => term.length > 1);
    if (!terms.length) return [];

    const hits = [];
    for (const entry of index.values()) {
      if (entry.status !== 'downloaded') continue;
      const haystack = entry.filename.toLowerCase();
      if (!terms.every(term => haystack.includes(term))) continue;
      hits.push(this._toHit(entry));
    }
    return hits;
  }

  async searchByHash(infohash) {
    const entry = await this.provider.findReadyByHash(infohash);
    if (!entry) return null;
    // A multi-episode pack is deliberately NOT announced as ready. Which episode
    // the viewer wants is not known at this layer, so a "⚡ READY" row here would
    // be a confident promise pointing at an arbitrary episode. The ordinary
    // debrid row for the same release still appears, so nothing is lost — only
    // the false certainty.
    if (Number(entry.distinctEpisodes || 0) > 1) return null;
    return this._toHit(entry);
  }

  _toHit(entry) {
    return {
      sourceId: 'rd',
      name: entry.filename,
      sizeBytes: Math.max(0, Number(entry.bytes || 0)),
      infohash: entry.hash,
      // Resolved at click time through /playback/debrid rather than unrestricted
      // here: an unrestricted link is time-limited, and a stream list can sit on
      // a TV for hours before anyone presses play.
      directStreamUrl: null,
      accountTorrentId: entry.id
    };
  }

  async streamUrl(hit) {
    const torrentId = String(hit?.accountTorrentId || '').trim();
    if (!torrentId) return hit?.directStreamUrl ?? null;
    return this.provider.getStreamUrl(torrentId, 0);
  }
}

module.exports = {
  RealDebridCacheSearchSource
};
