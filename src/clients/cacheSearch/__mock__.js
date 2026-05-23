function normalizeTitle(title) {
  return String(title || '').trim().toLowerCase();
}

function cloneHit(hit, sourceId) {
  return {
    sourceId,
    name: String(hit?.name || ''),
    sizeBytes: Number(hit?.sizeBytes || 0),
    ...(hit?.infohash ? { infohash: String(hit.infohash) } : {}),
    ...(hit?.fileId ? { fileId: String(hit.fileId) } : {}),
    directStreamUrl: Object.prototype.hasOwnProperty.call(hit || {}, 'directStreamUrl') ? hit.directStreamUrl : null,
    ...(hit?.expiresAt ? { expiresAt: hit.expiresAt } : {})
  };
}

class MockCacheSearchSource {
  constructor(config = {}) {
    this.id = String(config.id || 'putio');
    this.titleHits = config.titleHits || {};
    this.hashHits = config.hashHits || {};
    this.failOn = config.failOn || {};
    this.calls = [];
    this.callCounts = {};
  }

  _record(method, payload = {}) {
    this.callCounts[method] = Number(this.callCounts[method] || 0) + 1;
    this.calls.push({ method, ...payload });
  }

  _maybeFail(method) {
    const failure = this.failOn[method];
    if (!failure) return;
    if (failure instanceof Error) throw failure;
    throw new Error(typeof failure === 'string' ? failure : `Mock failure: ${method}`);
  }

  async searchByTitle(title, options = {}) {
    this._maybeFail('searchByTitle');
    this._record('searchByTitle', { title: String(title || ''), options });
    const hits = this.titleHits[String(title || '')] || this.titleHits[normalizeTitle(title)] || [];
    if (this.id === 'pm' && hits.length === 0) return [];
    const limit = Math.max(1, Number(options.limit || hits.length || 10));
    return hits.slice(0, limit).map(hit => cloneHit(hit, this.id));
  }

  async searchByHash(infohash) {
    this._maybeFail('searchByHash');
    this._record('searchByHash', { infohash: String(infohash || '') });
    if (this.id === 'putio') return null;
    const hit = this.hashHits[String(infohash || '')] || this.hashHits[String(infohash || '').toLowerCase()] || null;
    return hit ? cloneHit({ ...hit, infohash: hit.infohash || infohash }, this.id) : null;
  }

  async streamUrl(hit) {
    this._maybeFail('streamUrl');
    this._record('streamUrl', { hit });
    if (this.id === 'pm') return hit?.directStreamUrl ?? null;
    return hit?.directStreamUrl || `http://mock/${this.id}/${hit?.fileId || hit?.infohash || 'stream'}.mkv`;
  }
}

function createMockCacheSearchSource(config = {}) {
  return new MockCacheSearchSource(config);
}

module.exports = {
  MockCacheSearchSource,
  createMockCacheSearchSource
};
