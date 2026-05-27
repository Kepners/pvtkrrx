const TIMEOUT_MS = 20000
const INDEXER_CATEGORY_TTL_MS = 6 * 60 * 60 * 1000
const { sportHintFromCategory } = require('../utils/sportsCategoryHint')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')

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
    this.indexerCategoryLookup = new Map()
    this.indexerCategoryLookupExpiresAt = 0
    this.indexerCategoryLookupInFlight = null
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
    const now = Date.now()
    if (this.indexerCategoryLookup.size > 0 && this.indexerCategoryLookupExpiresAt > now) {
      return this.indexerCategoryLookup
    }
    if (this.indexerCategoryLookupInFlight) return this.indexerCategoryLookupInFlight

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
        this.indexerCategoryLookup = lookup
        this.indexerCategoryLookupExpiresAt = Date.now() + INDEXER_CATEGORY_TTL_MS
        return this.indexerCategoryLookup
      } catch (_) {
        return this.indexerCategoryLookup
      } finally {
        this.indexerCategoryLookupInFlight = null
      }
    })()

    this.indexerCategoryLookupInFlight = pending
    return pending
  }

  async _search(params, { timeoutMs } = {}) {
    const url = `${this.baseUrl}/api/v1/search?${params}`
    const effectiveTimeout = Math.max(1000, Number(timeoutMs) || TIMEOUT_MS)
    const res = await fetch(url, { signal: AbortSignal.timeout(effectiveTimeout) })
    if (!res.ok) throw new Error(`Prowlarr HTTP ${res.status}`)
    const data = await res.json()
    const categoryLookup = await this._getIndexerCategoryLookup()
    return (Array.isArray(data) ? data : []).map(r => this._mapResult(r, categoryLookup))
  }

  async search(query, cats, type = 'search', options = {}) {
    const categoryList = options.useCategories ? splitCategoryList(cats) : []
    if (categoryList.length > 1) {
      const settled = await Promise.allSettled(categoryList.map((cat) => {
        const params = new URLSearchParams({ query, type, indexerIds: -2, apikey: this.apiKey })
        params.set('categories', cat)
        return this._search(params, { timeoutMs: options.timeoutMs })
      }))

      const values = []
      let firstError = null
      for (const result of settled) {
        if (result.status === 'fulfilled') values.push(result.value)
        else if (!firstError) firstError = result.reason
      }

      if (values.length === 0 && firstError) throw firstError
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
