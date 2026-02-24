const BASE_URL = 'https://v3-cinemeta.strem.io'
const TIMEOUT_MS = 3000

class CinemetaClient {
  async getMovie(imdbId) {
    return this._getMeta('movie', imdbId)
  }

  async getSeries(imdbId) {
    return this._getMeta('series', imdbId)
  }

  async searchMovies(query) {
    return this._searchCatalog('movie', query)
  }

  async searchSeries(query) {
    return this._searchCatalog('series', query)
  }

  async _getMeta(type, imdbId) {
    const res = await fetch(`${BASE_URL}/meta/${type}/${imdbId}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.meta || null
  }

  async _searchCatalog(type, query) {
    const q = String(query || '').trim()
    if (!q) return []
    const res = await fetch(`${BASE_URL}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.metas) ? data.metas : []
  }
}

module.exports = { CinemetaClient }
