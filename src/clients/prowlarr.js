const TIMEOUT_MS = 20000

class ProwlarrClient {
  constructor(baseUrl, apiKey) {
    // Accept either base URL (http://host:port) or legacy torznab URL - normalise to base
    this.baseUrl = baseUrl.replace(/\/api\/v1.*$/, '').replace(/\/\d+\/api.*$/, '').replace(/\/$/, '')
    this.apiKey = apiKey
  }

  _mapResult(r) {
    // Try to extract infohash from guid or infoUrl (some indexers embed SHA1 hash in URL)
    let infohash = ''
    const hashMatch = (r.guid || r.infoUrl || '').match(/[?&]id=([0-9a-f]{40})/i)
    if (hashMatch) infohash = hashMatch[1].toLowerCase()

    return {
      title: String(r.title || ''),
      link: String(r.downloadUrl || ''),
      size: Number(r.size || 0),
      seeders: Number(r.seeders || 0),
      infohash,
      imdbId: r.imdbId ? String(r.imdbId) : '',
      indexer: r.indexer ? String(r.indexer) : '',
      category: r.categories?.[0]?.id ? String(r.categories[0].id) : '',
      pubDate: r.publishDate || ''
    }
  }

  async _search(params) {
    const url = `${this.baseUrl}/api/v1/search?${params}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}`)
    const data = await res.json()
    return (Array.isArray(data) ? data : []).map(r => this._mapResult(r))
  }

  async search(query, _cats, type = 'search') {
    // Note: categories intentionally omitted — private trackers don't tag with standard Torznab
    // categories in Prowlarr, so filtering by category returns 0 results. indexerIds=-2 = all.
    const params = new URLSearchParams({ query, type, indexerIds: -2, apikey: this.apiKey })
    return this._search(params)
  }

  async searchImdb(imdbId, _cats, type = 'movie') {
    const numericId = String(imdbId).replace(/^tt/i, '')
    const searchType = type === 'series' ? 'tvsearch' : 'movie'
    const params = new URLSearchParams({ query: '', type: searchType, imdbId: numericId, indexerIds: -2, apikey: this.apiKey })
    return this._search(params)
  }

  async caps() {
    // Validate by fetching indexer list
    const res = await fetch(`${this.baseUrl}/api/v1/indexer?apikey=${this.apiKey}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}`)
    const indexers = await res.json()
    if (!Array.isArray(indexers) || indexers.length === 0) throw new Error('No indexers configured in Prowlarr')
    return indexers
  }
}

module.exports = { ProwlarrClient }
