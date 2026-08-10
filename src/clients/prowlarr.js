const TIMEOUT_MS = 20000
const INDEXER_CATEGORY_TTL_MS = 6 * 60 * 60 * 1000
const { sportHintFromCategory } = require('../utils/sportsCategoryHint')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')

// The indexer category lookup is expensive (one extra Prowlarr round-trip) and
// rarely changes, so cache it at module scope keyed by baseUrl|apiKey. Per-request
// ProwlarrClient instances then share the cached map instead of each rebuilding it.
const indexerCategoryCache = new Map()

// Search results, keyed by the exact Prowlarr query. Searching the same title
// twice in a session should be instant the second time — the whole cost is the
// trackers answering, and that answer does not change minute to minute.
// 15 minutes is long enough to make browsing feel instant and short enough that
// a newly published release still turns up on the next look.
const SEARCH_CACHE_TTL_MS = Math.max(0, parseInt(
  process.env.PVTKRRX_PROWLARR_SEARCH_CACHE_TTL_MS || String(15 * 60 * 1000),
  10
))
const SEARCH_CACHE_MAX = Math.max(50, parseInt(
  process.env.PVTKRRX_PROWLARR_SEARCH_CACHE_MAX || '500',
  10
))
const searchCache = new Map()
// Identical searches already running, so concurrent duplicates share one call
// rather than each hitting the trackers.
const inFlightSearches = new Map()

function indexerCategoryCacheKey(baseUrl, apiKey) {
  return `${String(baseUrl || '').toLowerCase()}|${String(apiKey || '')}`
}

function splitCategoryList(cats) {
  return String(cats || '')
    .split(',')
    .map(cat => cat.trim())
    .filter(Boolean)
}

function searchResultKey(item = {}) {
  const infohash = String(item?.infohash || '').trim().toLowerCase()
  if (infohash) return `hash:${infohash}`
  const link = String(item?.link || '').trim()
  if (link) return `link:${link}`
  return [
    String(item?.indexer || '').trim().toLowerCase(),
    String(item?.title || '').trim().toLowerCase(),
    String(item?.size || '').trim()
  ].join('|')
}

function mergeSearchResults(lists) {
  const merged = []
  const seen = new Set()
  for (const list of lists) {
    for (const item of (Array.isArray(list) ? list : [])) {
      const key = searchResultKey(item)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeProwlarrBaseUrl(input) {
  let url = String(input || '').trim()
  if (!url) return ''

  url = url
    // Legacy Jackett/Prowlarr Torznab endpoint pasted into base URL field
    .replace(/\/api\/v2\.0\/indexers\/all\/results\/torznab.*$/i, '')
    // Current Prowlarr REST API paths
    .replace(/\/api\/v1.*$/i, '')
    // Legacy "<apikey>/api" style URLs
    .replace(/\/[a-z0-9]{16,}\/api.*$/i, '')
    // Legacy numeric token segment style
    .replace(/\/\d+\/api.*$/i, '')
    .replace(/\/+$/, '')

  return url
}

class ProwlarrClient {
  constructor(baseUrl, apiKey) {
    // Accept either base URL (http://host:port) or legacy torznab URL; normalize to base.
    this.baseUrl = normalizeProwlarrBaseUrl(baseUrl)
    this.apiKey = apiKey
    this.indexerCategoryCacheKey = indexerCategoryCacheKey(this.baseUrl, this.apiKey)
  }

  _indexerCategoryCacheEntry() {
    let entry = indexerCategoryCache.get(this.indexerCategoryCacheKey)
    if (!entry) {
      entry = { lookup: new Map(), expiresAt: 0, inFlight: null }
      indexerCategoryCache.set(this.indexerCategoryCacheKey, entry)
    }
    return entry
  }

  async _requestJson(path, options = {}) {
    const url = new URL(`${this.baseUrl}${path}`)
    url.searchParams.set('apikey', this.apiKey)

    const res = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {})
      },
      body: options.body,
      signal: AbortSignal.timeout(options.timeoutMs || TIMEOUT_MS)
    })

    if (!res.ok) {
      throw new Error(`Prowlarr HTTP ${res.status}`)
    }

    if (options.expect === 'text') {
      return res.text()
    }

    const text = await res.text()
    if (!text) return null
    return JSON.parse(text)
  }

  _mapResult(r, categoryLookup = new Map()) {
    // Try to extract infohash from guid or infoUrl (some indexers embed SHA1 hash in URL)
    let infohash = ''
    const hashMatch = (r.guid || r.infoUrl || '').match(/[?&]id=([0-9a-f]{40})/i)
    if (hashMatch) infohash = hashMatch[1].toLowerCase()

    const imdbId = normalizeImdbId(r.imdbId)
    const indexerId = String(r.indexerId ?? '').trim()
    const categoryMap = categoryLookup.get(indexerId) || new Map()
    const rawCategories = Array.isArray(r.categories) ? r.categories : []
    const categoryIds = []
    const categoryNames = []
    const seenIds = new Set()
    const seenNames = new Set()

    for (const entry of rawCategories) {
      const id = String(entry?.id ?? '').trim()
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        categoryIds.push(id)
      }
      const fallbackName = id ? String(categoryMap.get(id) || '').trim() : ''
      const name = String(entry?.name || fallbackName || '').trim()
      if (name) {
        const key = name.toLowerCase()
        if (!seenNames.has(key)) {
          seenNames.add(key)
          categoryNames.push(name)
        }
      }
    }

    const categoryHint = sportHintFromCategory({
      indexerName: r.indexer,
      categoryIds,
      categoryNames
    })
    const sportHint = resolveSportHint({
      categoryHint,
      title: r.title
    })

    return {
      title: String(r.title || ''),
      link: String(r.downloadUrl || ''),
      size: Number(r.size || 0),
      seeders: Number(r.seeders || 0),
      infohash,
      imdbId,
      indexer: r.indexer ? String(r.indexer) : '',
      category: categoryIds[0] || '',
      categoryIds,
      categoryNames,
      indexerCategoryName: categoryNames[0] || '',
      sportHint,
      pubDate: r.publishDate || ''
    }
  }

  async _getIndexerCategoryLookup() {
    const entry = this._indexerCategoryCacheEntry()
    const now = Date.now()
    if (entry.lookup.size > 0 && entry.expiresAt > now) {
      return entry.lookup
    }
    if (entry.inFlight) return entry.inFlight

    const pending = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/indexer?apikey=${encodeURIComponent(this.apiKey)}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}`)
        const rows = await res.json()
        const lookup = new Map()
        for (const row of (Array.isArray(rows) ? rows : [])) {
          const indexerId = String(row?.id ?? '').trim()
          if (!indexerId) continue

          const cats = Array.isArray(row?.capabilities?.categories) ? row.capabilities.categories : []
          const idToName = new Map()
          for (const cat of cats) {
            const catId = String(cat?.id ?? '').trim()
            const catName = String(cat?.name || '').trim()
            if (catId && catName) idToName.set(catId, catName)

            for (const sub of (Array.isArray(cat?.subCategories) ? cat.subCategories : [])) {
              const subId = String(sub?.id ?? '').trim()
              const subName = String(sub?.name || '').trim()
              if (subId && subName) idToName.set(subId, subName)
            }
          }
          lookup.set(indexerId, idToName)
        }
        entry.lookup = lookup
        entry.expiresAt = Date.now() + INDEXER_CATEGORY_TTL_MS
        return entry.lookup
      } catch (_) {
        return entry.lookup
      } finally {
        entry.inFlight = null
      }
    })()

    entry.inFlight = pending
    return pending
  }

  async _search(params, { timeoutMs } = {}) {
    // Searching the same thing twice should not cost the same twice.
    //
    // Every Prowlarr query goes through here, so caching at this level covers
    // the IMDB lookup, the categorised title search and the broad fallback, and
    // each category sub-search caches separately.
    //
    // This is the single biggest win available: measured on the live server the
    // same query took 7.4s, 32s, 47s and once timed out at 180s. The cost is
    // entirely the trackers answering, so the only way to make a repeat search
    // fast is not to make it again.
    //
    // Errors and timeouts are deliberately NOT cached — a failed search must be
    // retried, never remembered.
    const cacheKey = `${this.baseUrl}|${params}`
    const now = Date.now()

    const hit = searchCache.get(cacheKey)
    if (hit && (now - hit.at) < SEARCH_CACHE_TTL_MS) {
      console.log(`[prowlarr] cache hit (${Math.round((now - hit.at) / 1000)}s old, ${hit.value.length} results)`)
      return hit.value
    }

    // If an identical search is already in flight, wait on it instead of
    // starting a second one. Stremio fires several requests at once, so without
    // this the same query can run three or four times in parallel.
    const pending = inFlightSearches.get(cacheKey)
    if (pending) {
      console.log('[prowlarr] joining an identical search already in flight')
      return pending
    }

    const url = `${this.baseUrl}/api/v1/search?${params}`
    const effectiveTimeout = Math.max(1000, Number(timeoutMs) || TIMEOUT_MS)
    const run = (async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(effectiveTimeout) })
      if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}`)
      const data = await res.json()
      const categoryLookup = await this._getIndexerCategoryLookup()
      return (Array.isArray(data) ? data : []).map(r => this._mapResult(r, categoryLookup))
    })()

    inFlightSearches.set(cacheKey, run)
    try {
      const value = await run
      if (searchCache.size >= SEARCH_CACHE_MAX) {
        // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
        const oldest = searchCache.keys().next().value
        if (oldest !== undefined) searchCache.delete(oldest)
      }
      searchCache.set(cacheKey, { at: Date.now(), value })
      return value
    } finally {
      inFlightSearches.delete(cacheKey)
    }
  }

  async search(query, cats, type = 'search', options = {}) {
    const categoryList = options.useCategories ? splitCategoryList(cats) : []
    if (categoryList.length > 1) {
      const groupTimeout = Math.max(1000, Number(options.categoryGroupTimeoutMs) || Number(options.timeoutMs) || TIMEOUT_MS)
      const categoryConcurrency = Math.max(1, Math.min(
        categoryList.length,
        Number(options.categorySearchConcurrency) || categoryList.length
      ))
      const values = []
      let firstError = null
      let settledCount = 0
      let nextIndex = 0
      const workers = Array.from({ length: categoryConcurrency }, async () => {
        while (nextIndex < categoryList.length) {
          const cat = categoryList[nextIndex]
          nextIndex += 1
          const params = new URLSearchParams({ query, type, indexerIds: -2, apikey: this.apiKey })
          params.set('categories', cat)
          await this._search(params, { timeoutMs: groupTimeout })
            .then((value) => {
              values.push(value)
            })
            .catch((error) => {
              if (!firstError) firstError = error
            })
            .finally(() => {
              settledCount += 1
            })
        }
      })

      const completedAll = await Promise.race([
        Promise.allSettled(workers).then(() => true),
        wait(groupTimeout).then(() => false)
      ])

      if (values.length === 0 && firstError && completedAll && settledCount === categoryList.length) throw firstError
      return mergeSearchResults(values)
    }

    const params = new URLSearchParams({ query, type, indexerIds: -2, apikey: this.apiKey })
    if (categoryList.length === 1) params.set('categories', categoryList[0])
    return this._search(params, { timeoutMs: options.timeoutMs })
  }

  async searchImdb(imdbId, _cats, type = 'movie', options = {}) {
    const numericId = String(imdbId).replace(/^tt/i, '')
    const searchType = type === 'series' ? 'tvsearch' : 'movie'
    const params = new URLSearchParams({ query: '', type: searchType, imdbId: numericId, indexerIds: -2, apikey: this.apiKey })
    return this._search(params, { timeoutMs: options.timeoutMs })
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

  async listDownloadClients() {
    const rows = await this._requestJson('/api/v1/downloadclient')
    return Array.isArray(rows) ? rows : []
  }

  async listDownloadClientSchemas() {
    const rows = await this._requestJson('/api/v1/downloadclient/schema')
    return Array.isArray(rows) ? rows : []
  }

  async getDownloadClientById(id) {
    if (!String(id || '').trim()) return null
    return this._requestJson(`/api/v1/downloadclient/${encodeURIComponent(String(id))}`)
  }

  async createDownloadClient(downloadClientResource, forceSave = false) {
    const url = new URL(`${this.baseUrl}/api/v1/downloadclient`)
    url.searchParams.set('apikey', this.apiKey)
    if (forceSave) url.searchParams.set('forceSave', 'true')

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(downloadClientResource || {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (!res.ok) {
      throw new Error(`Prowlarr HTTP ${res.status}`)
    }

    return res.json()
  }

  async updateDownloadClient(id, downloadClientResource, forceSave = false) {
    const url = new URL(`${this.baseUrl}/api/v1/downloadclient/${encodeURIComponent(String(id || '').trim())}`)
    url.searchParams.set('apikey', this.apiKey)
    if (forceSave) url.searchParams.set('forceSave', 'true')

    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(downloadClientResource || {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (!res.ok) {
      throw new Error(`Prowlarr HTTP ${res.status}`)
    }

    return res.json()
  }

  async testDownloadClient(downloadClientResource, forceTest = false) {
    const url = new URL(`${this.baseUrl}/api/v1/downloadclient/test`)
    url.searchParams.set('apikey', this.apiKey)
    if (forceTest) url.searchParams.set('forceTest', 'true')

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(downloadClientResource || {}),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (!res.ok) {
      throw new Error(`Prowlarr HTTP ${res.status}`)
    }

    return res.text()
  }
}

module.exports = { ProwlarrClient }
