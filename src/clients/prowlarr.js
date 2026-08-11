const TIMEOUT_MS = 20000
const INDEXER_CATEGORY_TTL_MS = 6 * 60 * 60 * 1000
const { sportHintFromCategory } = require('../utils/sportsCategoryHint')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { isSportsOnlyIndexer } = require('../utils/sportsIndexers')

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

// Failures get their own, much shorter memory.
//
// Not caching failures at all sounds safer but is what made repeat searches
// slow. A title search fans out to one request per category; on this deployment
// several categories are consistently rejected or time out. With successes
// cached and failures not, every repeat search skipped straight past the cached
// half and spent the FULL timeout on the failing half — measured as a flat 7s
// on every request, for ever.
//
// 60 seconds is short enough that a tracker coming back is picked up almost
// immediately, and long enough that one browsing session does not pay the same
// timeout again and again.
const SEARCH_FAILURE_TTL_MS = Math.max(0, parseInt(
  process.env.PVTKRRX_PROWLARR_SEARCH_FAILURE_TTL_MS || '60000',
  10
))
const searchFailureCache = new Map()

function indexerCategoryCacheKey(baseUrl, apiKey) {
  return `${String(baseUrl || '').toLowerCase()}|${String(apiKey || '')}`
}

function splitCategoryList(cats) {
  return String(cats || '')
    .split(',')
    .map(cat => cat.trim())
    .filter(Boolean)
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

// Prowlarr binds indexerIds as a REPEATED integer query parameter. Joining the
// ids with commas produces one value and the API rejects the whole search with
// HTTP 400: "The value '1,7,5,8,2,3,4,6' is not valid."
//
// Proven against the live Prowlarr on 2026-08-11, same query three ways:
//   indexerIds=-2                 -> 200   (the sentinel for "every indexer")
//   indexerIds=1,7,5,8,2,3,4,6    -> 400
//   indexerIds=1&indexerIds=7&... -> 200
//
// This stayed hidden until the sports-only exclusion started sending a real
// list, because -2 is a single value and always survived the comma path. Every
// film and TV search returned zero streams while sports catalogues, which do
// not filter indexers, kept working perfectly and hid the breakage.
function applyIndexerIds(params, indexerIds) {
  if (Array.isArray(indexerIds) && indexerIds.length > 0) {
    for (const id of indexerIds) params.append('indexerIds', String(id))
  } else {
    params.set('indexerIds', '-2')
  }
  return params
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
      entry = { lookup: new Map(), names: new Map(), expiresAt: 0, inFlight: null }
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
          // Keep the indexer's NAME too, so movie/TV searches can skip the
          // sports-only trackers instead of waiting for them and then binning
          // whatever they return.
          entry.names.set(indexerId, String(row?.name || '').trim())
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

  // Which indexers are worth asking for a film or a TV episode.
  //
  // A sports-only tracker will never hold a feature film, but it was still
  // being searched on every movie/TV request — the result filter then dropped
  // everything it returned (`items.filter(item => !isSportsOnlyIndexer(...))`).
  // That is a whole tracker's round-trip spent to throw the answer away, and on
  // a slow night one tracker sets the pace for the entire search.
  //
  // Returns null when the list cannot be determined, so the caller falls back to
  // "all indexers" rather than accidentally searching none.
  async _nonSportsIndexerIds() {
    await this._getIndexerCategoryLookup()
    const entry = this._indexerCategoryCacheEntry()
    if (!entry.names || entry.names.size === 0) return null
    const keep = []
    const skipped = []
    for (const [id, name] of entry.names) {
      if (isSportsOnlyIndexer(name)) skipped.push(name)
      else keep.push(id)
    }
    if (keep.length === 0) return null
    if (skipped.length > 0) {
      console.log(`[prowlarr] skipping sports-only indexer(s) for this search: ${skipped.join(', ')}`)
    }
    return keep
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

    // A category that just failed is not worth waiting on again this minute.
    const failed = searchFailureCache.get(cacheKey)
    if (failed && (now - failed.at) < SEARCH_FAILURE_TTL_MS) {
      console.log(`[prowlarr] skipping a search that failed ${Math.round((now - failed.at) / 1000)}s ago (${failed.reason})`)
      throw new Error(failed.reason)
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
      searchFailureCache.delete(cacheKey)
      return value
    } catch (err) {
      if (searchFailureCache.size >= SEARCH_CACHE_MAX) {
        const oldest = searchFailureCache.keys().next().value
        if (oldest !== undefined) searchFailureCache.delete(oldest)
      }
      searchFailureCache.set(cacheKey, {
        at: Date.now(),
        reason: String(err?.message || 'Prowlarr search failed')
      })
      throw err
    } finally {
      inFlightSearches.delete(cacheKey)
    }
  }

  async search(query, cats, type = 'search', options = {}) {
    // Ask only the indexers that could plausibly hold this. For a film or TV
    // episode that means skipping the sports-only trackers entirely, rather
    // than waiting for them and discarding whatever they send back.
    const indexerIds = options.excludeSportsIndexers
      ? await this._nonSportsIndexerIds()
      : null
    const categoryList = options.useCategories ? splitCategoryList(cats) : []

    // Ask for every category in ONE request. This used to fan out into one
    // Prowlarr search per category, and Prowlarr forwards each of those to
    // every configured indexer -- so a single Stremio click became roughly
    // 10 searches x 8 trackers, twice over (once per query variant), on top of
    // the IMDB search and the broad fallback.
    //
    // Private trackers rate-limit exactly that. Measured on the live server
    // 2026-08-11, hd-torrents.org answered with
    //   429 TooManyRequests -- "You've reached the request limit for
    //   automation tools. Please wait 13 seconds before making another
    //   request."
    // and once throttled a plain search went from 4.3s to over 200s, so every
    // internal timeout expired and Stremio got zero streams for films AND
    // episodes while the sports catalogue -- which issues one query, not
    // eleven -- carried on working and hid the problem.
    //
    // Prowlarr accepts categories as a repeated parameter and returns the same
    // union. Proven with "Game of Thrones S01E01":
    //   one call, all 8 TV categories -> 64 results in 4391ms
    //   one broad call, no categories -> 64 results in 4180ms
    // Same answer for a tenth of the tracker traffic.
    const params = applyIndexerIds(
      new URLSearchParams({ query, type, apikey: this.apiKey }),
      indexerIds
    )
    if (categoryList.length > 1) {
      for (const cat of categoryList) params.append('categories', cat)
      return this._search(params, {
        timeoutMs: Math.max(
          1000,
          Number(options.categoryGroupTimeoutMs) || Number(options.timeoutMs) || TIMEOUT_MS
        )
      })
    }
    if (categoryList.length === 1) params.set('categories', categoryList[0])
    return this._search(params, { timeoutMs: options.timeoutMs })
  }

  async searchImdb(imdbId, _cats, type = 'movie', options = {}) {
    const numericId = String(imdbId).replace(/^tt/i, '')
    const searchType = type === 'series' ? 'tvsearch' : 'movie'
    const imdbIndexerIds = options.excludeSportsIndexers
      ? await this._nonSportsIndexerIds()
      : null
    const params = applyIndexerIds(
      new URLSearchParams({ query: '', type: searchType, imdbId: numericId, apikey: this.apiKey }),
      imdbIndexerIds
    )
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
