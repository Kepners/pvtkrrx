const BASE_URL = 'https://v3-cinemeta.strem.io'
const TIMEOUT_MS = 3000
const META_CACHE_TTL_MS = Math.max(
  60 * 1000,
  parseInt(process.env.PVTKRRX_CINEMETA_META_TTL_MS || String(12 * 60 * 60 * 1000), 10)
)
const SEARCH_CACHE_TTL_MS = Math.max(
  60 * 1000,
  parseInt(process.env.PVTKRRX_CINEMETA_SEARCH_TTL_MS || String(60 * 60 * 1000), 10)
)
const CACHE_MAX_KEYS = Math.max(
  100,
  parseInt(process.env.PVTKRRX_CINEMETA_CLIENT_CACHE_MAX_KEYS || '2000', 10)
)

const metaCache = new Map()
const metaInFlight = new Map()
const searchCache = new Map()
const searchInFlight = new Map()

function trimCache(cache) {
  while (cache.size > CACHE_MAX_KEYS) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

function readCache(cache, key) {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached
  return null
}

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
    const id = String(imdbId || '').trim()
    if (!id) return null
    const key = `${type}:${id}`
    const cached = readCache(metaCache, key)
    if (cached) return cached.value
    if (metaInFlight.has(key)) return metaInFlight.get(key)

    const pending = (async () => {
      const res = await fetch(`${BASE_URL}/meta/${type}/${id}.json`, {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.meta || null
    })()
      .then((value) => {
        metaCache.set(key, { value, expiresAt: Date.now() + META_CACHE_TTL_MS })
        trimCache(metaCache)
        return value
      })
      .finally(() => {
        metaInFlight.delete(key)
      })

    metaInFlight.set(key, pending)
    return pending
  }

  async _searchCatalog(type, query) {
    const q = String(query || '').trim()
    if (!q) return []
    const key = `${type}:${q}`
    const cached = readCache(searchCache, key)
    if (cached) return cached.value
    if (searchInFlight.has(key)) return searchInFlight.get(key)

    const pending = (async () => {
      const res = await fetch(`${BASE_URL}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`, {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.metas) ? data.metas : []
    })()
      .then((value) => {
        searchCache.set(key, { value, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS })
        trimCache(searchCache)
        return value
      })
      .finally(() => {
        searchInFlight.delete(key)
      })

    searchInFlight.set(key, pending)
    return pending
  }
}

module.exports = { CinemetaClient }
