const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { findSportsDiscoveryCatalog, getSportsSearchSeedTerms } = require('../config/sportsCatalogs')
const { cleanTitle, isLikelyPackedReleaseTitle } = require('../utils/parser')
const { normalizeSportKey, resolveSportHint, isSportsNoiseTitle, isLikelySportsEventTitle } = require('../utils/sportsRules')
const { isSportsOnlyIndexer } = require('../utils/sportsIndexers')
const { formatSize, findVideoFile } = require('../utils/streams')
const { makeSportsThumbUrl } = require('../utils/sportsThumb')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { mapLeague } = require('../utils/leagueMap')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { encodeCustomId } = require('../utils/customId')
const { findExistingLocalFilePath } = require('../utils/localStorageRoots')
const { findExtractedArchiveVideoPath, ensurePackedArchiveExtracted } = require('../utils/archiveExtraction')

const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'
const cinemeta = new CinemetaClient()
const cinemetaCache = new Map()
const prowlarrSearchCache = new Map()
const prowlarrSearchInFlight = new Map()
const PROWLARR_SEARCH_CACHE_TTL_MS = Math.max(15000, parseInt(process.env.PVTKRRX_PROWLARR_CACHE_MS || '120000', 10))
const PROWLARR_SEARCH_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS || '7000', 10))
const PROWLARR_SEARCH_CACHE_MAX_KEYS = Math.max(50, parseInt(process.env.PVTKRRX_PROWLARR_CACHE_MAX_KEYS || '500', 10))
const SPORTS_CATALOG_CACHE_MAX_AGE = Math.max(
  120,
  parseInt(
    process.env.PVTKRRX_SPORTS_CATALOG_CACHE_MAX_AGE || process.env.PVTKRRX_SPORTS_CACHE_MAX_AGE || '600',
    10
  )
)

function isLikelySeriesRelease(title) {
  const value = String(title || '')
  return (
    /\bS\d{1,2}E\d{1,3}\b/i.test(value) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(value) ||
    /\bSeason[\s._-]*\d{1,2}\b/i.test(value) ||
    /\bS\d{1,2}\b/i.test(value) ||
    /\b(?:19|20)\d{2}[.\-_\s]\d{2}[.\-_\s]\d{2}\b/i.test(value) ||
    /\b\d{2}[.\-_\s]\d{2}[.\-_\s](?:19|20)\d{2}\b/i.test(value)
  )
}

function imdbPoster(imdbId, size = 'medium') {
  const id = String(imdbId || '').trim()
  if (!id) return ''
  return `https://images.metahub.space/poster/${size}/${id}/img`
}

function placeholderPoster() {
  return BRAND_POSTER
}

function normalizeSportsKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function sportHintFromLeagueCode(value) {
  const code = normalizeSportsKeyPart(value)
  if (!code) return ''
  if (code === 'nba') return 'basketball'
  if (code === 'nfl') return 'american-football'
  if (code === 'ufc') return 'mma'
  if (['f1', 'formula1', 'motogp', 'nascar', 'indycar', 'wrc', 'supercars', 'v8sc', 'wsbk', 'wec', 'formulae'].includes(code)) return 'motorsport'
  if (['pdc', 'bdo'].includes(code)) return 'darts'
  if (['pga', 'lpga', 'masters'].includes(code)) return 'golf'
  if (['mlb'].includes(code)) return 'baseball'
  if (['nhl'].includes(code)) return 'hockey'
  if (['wwe', 'aew'].includes(code)) return 'wrestling'
  if (mapLeague(value)) return 'football'
  return ''
}

function extractYear(value) {
  const m = String(value || '').match(/\b(19|20)\d{2}\b/)
  return m ? m[0] : ''
}



function cacheKey(type, imdbId) {
  return `${type}:${String(imdbId || '').trim()}`
}

async function getCinemetaCached(type, imdbId) {
  const key = cacheKey(type, imdbId)
  const now = Date.now()
  const hit = cinemetaCache.get(key)
  if (hit && hit.expiresAt > now) return hit.meta

  let meta = null
  try {
    meta = type === 'series'
      ? await cinemeta.getSeries(imdbId)
      : await cinemeta.getMovie(imdbId)
  } catch (_) {
    meta = null
  }

  cinemetaCache.set(key, {
    meta,
    expiresAt: now + (meta ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000)
  })
  return meta
}

const { withTimeout } = require('../utils/timeout')

function cacheKeyForProwlarrSearch(config, query, cats, type = 'search', options = {}) {
  const apiKey = String(config?.jackettApiKey || '').trim()
  const apiFingerprint = apiKey ? `${apiKey.slice(0, 4)}:${apiKey.length}` : ''
  return JSON.stringify({
    baseUrl: String(config?.jackettUrl || '').trim().toLowerCase(),
    apiKey: apiFingerprint,
    query: String(query || ''),
    cats: String(cats || ''),
    type: String(type || 'search'),
    useCategories: Boolean(options?.useCategories)
  })
}

function trimProwlarrSearchCache() {
  while (prowlarrSearchCache.size > PROWLARR_SEARCH_CACHE_MAX_KEYS) {
    const oldestKey = prowlarrSearchCache.keys().next().value
    if (!oldestKey) break
    prowlarrSearchCache.delete(oldestKey)
  }
}

async function cachedProwlarrSearch(config, client, query, cats, type = 'search', options = {}) {
  const key = cacheKeyForProwlarrSearch(config, query, cats, type, options)
  const now = Date.now()
  const cached = prowlarrSearchCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  if (prowlarrSearchInFlight.has(key)) return prowlarrSearchInFlight.get(key)

  const fallback = Array.isArray(cached?.value) ? cached.value : []
  const pending = withTimeout(
    client.search(query, cats, type, options),
    PROWLARR_SEARCH_TIMEOUT_MS,
    fallback
  ).then((result) => {
    const value = Array.isArray(result) ? result : fallback
    prowlarrSearchCache.set(key, {
      value,
      expiresAt: Date.now() + PROWLARR_SEARCH_CACHE_TTL_MS
    })
    trimProwlarrSearchCache()
    return value
  }).finally(() => {
    prowlarrSearchInFlight.delete(key)
  })

  prowlarrSearchInFlight.set(key, pending)
  return pending
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length)
  let index = 0

  async function worker() {
    while (true) {
      const i = index++
      if (i >= items.length) return
      out[i] = await mapper(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker())
  await Promise.all(workers)
  return out
}

async function enrichImdbEntries(type, items, options = {}) {
  const requirePoster = Boolean(options.requirePoster)
  const inspectCount = Math.max(1, Math.min(items.length, Number(options.inspectCount || items.length)))
  const source = items.slice(0, inspectCount)
  const enriched = await mapLimit(source, 8, async (item) => {
    const meta = await getCinemetaCached(type, item.imdbId)
    const poster = String(meta?.poster || imdbPoster(item.imdbId) || '').trim()
    const displayName = String(meta?.name || cleanTitle(item.title) || item.title || '').trim()
    const year = extractYear(meta?.releaseInfo || item.title)

    if (requirePoster && !poster) return null
    if (!displayName) return null

    return {
      id: item.imdbId,
      type,
      name: year && !displayName.includes(year) ? `${displayName} ${year}` : displayName,
      poster: poster || placeholderPoster(),
      item
    }
  })

  return enriched.filter(Boolean)
}

function toTimestamp(value) {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : 0
}

function qualityScore(title) {
  const t = String(title || '')
  if (/2160p/i.test(t)) return 3
  if (/1080p/i.test(t)) return 2
  if (/720p/i.test(t)) return 1
  return 0
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
}

function tokenizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
}

function libraryLookupQuery(name) {
  return cleanTitle(name)
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\b\d{1,2}x\d{1,3}\b/ig, ' ')
    .replace(/\bSeason[\s._-]*\d{1,2}\b/ig, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchScore(name, candidateName) {
  const a = tokenizeLoose(name)
  const bText = String(candidateName || '').toLowerCase()
  if (a.length === 0) return 0
  let score = 0
  for (const token of a) {
    if (bText.includes(token)) score += token.length
  }
  return score
}

function relevanceScore(title, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return 0

  const normalizedTitle = String(title || '').toLowerCase()
  let score = 0

  if (normalizedTitle.includes(q)) score += 1000

  for (const token of tokenize(q)) {
    if (normalizedTitle.includes(token)) score += token.length >= 4 ? 120 : 60
  }

  return score
}

function compareItems(a, b, query = '') {
  const relDiff = relevanceScore(b.title, query) - relevanceScore(a.title, query)
  if (relDiff !== 0) return relDiff

  const dateDiff = toTimestamp(b.pubDate) - toTimestamp(a.pubDate)
  if (dateDiff !== 0) return dateDiff

  const seedDiff = Number(b.seeders || 0) - Number(a.seeders || 0)
  if (seedDiff !== 0) return seedDiff

  const qualityDiff = qualityScore(b.title) - qualityScore(a.title)
  if (qualityDiff !== 0) return qualityDiff

  const sizeDiff = Number(b.size || 0) - Number(a.size || 0)
  if (sizeDiff !== 0) return sizeDiff

  return String(a.title || '').localeCompare(String(b.title || ''))
}

function dedupeByImdbBest(items, query = '') {
  const bestById = new Map()
  for (const item of items) {
    const key = String(item.imdbId || '').trim()
    if (!key) continue
    const current = bestById.get(key)
    if (!current || compareItems(item, current, query) < 0) {
      bestById.set(key, item)
    }
  }
  return [...bestById.values()].sort((a, b) => compareItems(a, b, query))
}

function normalizeSportsEventTitle(title, parsedSportsEvent = null, parsedEvent = null) {
  if (parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) {
    return `${parsedSportsEvent.homeTeam} vs ${parsedSportsEvent.awayTeam}`.trim()
  }

  if (parsedEvent?.league && parsedEvent?.eventName) {
    const leagueDisplay = mapLeague(parsedEvent.league) || parsedEvent.league
    return `${leagueDisplay} ${parsedEvent.eventName}`.trim()
  }

  return cleanTitle(title)
    .replace(/\butd\b/gi, 'united')
    .replace(/\b\d{3,4}p\d*\b/gi, ' ')
    .replace(/\b(?:mini|full|extended|highlights?|replay|pre[\s.\-_]*match|post[\s.\-_]*match|match)\b/gi, ' ')
    .replace(/\b(?:web[\s.\-_]*dl|webrip|hdtv|h264|h265|x264|x265|hevc|aac|ac3|ddp|multi|english|en|skynz|fubo)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sportsEventKey(input) {
  const parsedSportsEvent = input && typeof input === 'object'
    ? (input.parsedSportsEvent || parseSportsTitle(input.title || ''))
    : parseSportsTitle(input)

  if (parsedSportsEvent?.league && parsedSportsEvent?.date && parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) {
    const teams = [
      normalizeSportsKeyPart(parsedSportsEvent.homeTeam),
      normalizeSportsKeyPart(parsedSportsEvent.awayTeam)
    ].filter(Boolean).sort()
    return [
      normalizeSportsKeyPart(parsedSportsEvent.league),
      String(parsedSportsEvent.date || '').slice(0, 10),
      ...teams
    ].filter(Boolean).join('-')
  }

  // Non-vs event: use league + event name as grouping key
  const parsedEvent = input && typeof input === 'object'
    ? (input.parsedEvent || parseSportsEventTitle(input.title || ''))
    : parseSportsEventTitle(input)

  if (parsedEvent?.league && parsedEvent?.eventName) {
    const parts = [
      normalizeSportsKeyPart(parsedEvent.league),
      parsedEvent.date ? String(parsedEvent.date).slice(0, 10) : '',
      normalizeSportsKeyPart(parsedEvent.eventName)
    ].filter(Boolean)
    return parts.join('-')
  }

  const title = typeof input === 'string' ? input : input?.title
  const stop = new Set(['vs', 'v', 'at', 'fps', 'hotspur', 'super', 'sunday'])
  const tokens = normalizeSportsEventTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/\d+/g, ''))
    .filter(w => w.length > 1 && !stop.has(w) && !w.endsWith('fps'))
  const unique = [...new Set(tokens)].sort()
  return unique.join(' ')
}

function getSportsVariantTag(title) {
  const t = String(title || '').toLowerCase()
  if (/\bearly[\s.\-_]*prelims?\b/.test(t)) return 'early-prelims'
  if (/\bprelims?\b/.test(t)) return 'prelims'
  if (/\bmain[\s.\-_]*card\b/.test(t)) return 'main-card'
  return 'main'
}

function groupSportsItems(items, query = '') {
  const groups = new Map()
  for (const item of items || []) {
    // Reuse pre-computed parsedSportsEvent, parsedEvent, and mappedLeague from normalization step
    const parsedSportsEvent = item?.parsedSportsEvent || null
    const parsedEvent = item?.parsedEvent || null
    const itemMappedLeague = item?.mappedLeague || ''
    const display = normalizeSportsEventTitle(item.title, parsedSportsEvent, parsedEvent) || cleanTitle(item.title) || String(item.title || '').trim()
    if (!display) continue
    const baseKey = sportsEventKey({ title: item.title, parsedSportsEvent, parsedEvent })
    const hasStructuredKey = (parsedSportsEvent?.league && parsedSportsEvent?.date && parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) ||
      (parsedEvent?.league && parsedEvent?.eventName)
    const key = hasStructuredKey
      ? baseKey
      : `${baseKey}|${getSportsVariantTag(item.title)}`
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        display,
        baseKey,
        best: item,
        count: 1,
        parsedSportsEvent,
        parsedEvent,
        mappedLeague: itemMappedLeague
      })
      continue
    }
    current.count += 1
    if (!current.parsedSportsEvent && parsedSportsEvent) {
      current.parsedSportsEvent = parsedSportsEvent
      current.mappedLeague = itemMappedLeague || current.mappedLeague
    }
    if (!current.parsedEvent && parsedEvent) {
      current.parsedEvent = parsedEvent
      current.mappedLeague = itemMappedLeague || current.mappedLeague
    }
    if (compareItems(item, current.best, query) < 0) {
      current.best = item
      current.display = display || current.display
      if (parsedSportsEvent) {
        current.parsedSportsEvent = parsedSportsEvent
        current.mappedLeague = itemMappedLeague || current.mappedLeague
      }
      if (parsedEvent) {
        current.parsedEvent = parsedEvent
        current.mappedLeague = itemMappedLeague || current.mappedLeague
      }
    }
  }
  return [...groups.values()].sort((a, b) => compareItems(a.best, b.best, query))
}

function getCatalogLimit(config) {
  const raw = Number.parseInt(String(config?.maxResults || '50'), 10)
  if (!Number.isFinite(raw)) return 50
  return Math.max(10, Math.min(200, raw))
}

// Parse Stremio extra path segment into object
// e.g. "genre=Football&search=UFC&skip=10" → { genre: 'Football', search: 'UFC', skip: '10' }
function parseExtra(extraStr) {
  if (!extraStr) return {}
  const result = {}
  const parts = extraStr.split('&')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq)
    const value = decodeURIComponent(part.slice(eq + 1))
    result[key] = value
  }
  return result
}

function normalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSearchValue(value) {
  return normalizeSearchValue(value).replace(/\s+/g, '')
}

function abbreviateSearchValue(value) {
  const tokens = normalizeSearchValue(value)
    .split(' ')
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((token) => token[0]).join('')
}

function anyFieldMatchesDetail(fields, detailFilter = '') {
  const normalizedFilter = normalizeSearchValue(detailFilter)
  const compactFilter = compactSearchValue(detailFilter)
  const abbreviatedFilter = abbreviateSearchValue(detailFilter)
  if (!normalizedFilter && !compactFilter) return true

  return (fields || []).some((field) => {
    const normalizedField = normalizeSearchValue(field)
    if (!normalizedField) return false
    if (normalizedFilter && normalizedField.includes(normalizedFilter)) return true
    if (compactFilter && compactSearchValue(field).includes(compactFilter)) return true
    if (!abbreviatedFilter) return false
    return abbreviateSearchValue(field) === abbreviatedFilter
  })
}

function itemMatchesSportsCatalog(item, sportHint = '') {
  const expectedHint = normalizeSportKey(sportHint)
  if (!expectedHint) return true
  return normalizeSportKey(item?.sportHint) === expectedHint
}

function itemMatchesSportsDetail(item, detailFilter = '') {
  if (!String(detailFilter || '').trim()) return true
  return anyFieldMatchesDetail([
    item?.title,
    item?.mappedLeague,
    item?.parsedSportsEvent?.league,
    item?.parsedSportsEvent?.homeTeam,
    item?.parsedSportsEvent?.awayTeam,
    item?.parsedEvent?.league,
    item?.parsedEvent?.eventName,
    item?.indexer
  ], detailFilter)
}

async function handleCatalog(config, type, id, extraStr, context = {}) {
  try {
    const extra = parseExtra(extraStr)
    const opts = {
      baseUrl: String(context.baseUrl || '').replace(/\/+$/, '')
    }
    const sportsCatalogDefinition = findSportsDiscoveryCatalog(id)
    if (sportsCatalogDefinition) {
      return await sportsCatalog(config, extra, opts, type, sportsCatalogDefinition)
    }

    switch (id) {
      case 'pvtkrrx-movies':
        return await moviesCatalog(config, extra, opts)
      case 'pvtkrrx-tv':
        return await tvCatalog(config, extra, opts)
      case 'pvtkrrx-library':
        return await libraryCatalog(config, extra, opts)
      default:
        return { metas: [] }
    }
  } catch (err) {
    console.error(`[catalog] ERROR id=${id} type=${type}: ${err.message}`)
    return { metas: [] }
  }
}

async function sportsCatalog(config, extra, options = {}, catalogType = 'movie', catalogDefinition = null) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const sportsDb = new SportsDbClient(config.sportsDbApiKey, {
    cacheHours: config.sportsDbCacheHours
  })
  const mediaType = String(catalogType || 'movie').trim().toLowerCase() || 'movie'
  const requestedDetail = String(extra.genre || extra.search || '').trim()
  const catalogSportHint = normalizeSportKey(catalogDefinition?.sportHint || '')
  const requestedSportHint = catalogSportHint || resolveSportHint({ explicitHint: requestedDetail })
  const query = requestedDetail
  const limit = getCatalogLimit(config)
  const strictItems = await cachedProwlarrSearch(
    config,
    torznab,
    query,
    SPORT_CATS,
    'search',
    { useCategories: true }
  )
  let items = strictItems
  if (items.length < Math.min(80, limit * 2)) {
    const broadItems = await cachedProwlarrSearch(
      config,
      torznab,
      query,
      SPORT_CATS
    )
    const byKey = new Map()
    for (const item of [...strictItems, ...broadItems]) {
      const key = `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
      if (!key || byKey.has(key)) continue
      byKey.set(key, item)
    }
    items = [...byKey.values()]
  }

  // Fallback: many indexers don't support empty-query text search — try
  // tvsearch browse (Torznab browse mode) then seed with popular sport terms
  if (items.length === 0 && !query) {
    const browseItems = await cachedProwlarrSearch(
      config, torznab, '', SPORT_CATS, 'tvsearch', { useCategories: true }
    )
    if (browseItems.length > 0) {
      items = browseItems
    } else {
      const SEED_TERMS = getSportsSearchSeedTerms(catalogSportHint)
      const seedBatches = await Promise.all(
        SEED_TERMS.map(term => cachedProwlarrSearch(config, torznab, term, SPORT_CATS))
      )
      const byKey = new Map()
      for (const batch of seedBatches) {
        for (const item of batch) {
          const key = `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
          if (!key || byKey.has(key)) continue
          byKey.set(key, item)
        }
      }
      items = [...byKey.values()]
    }
  }

  const normalizedItems = items.map(item => {
    const parsedSportsEvent = parseSportsTitle(item?.title || '')
    const parsedEvent = !parsedSportsEvent ? parseSportsEventTitle(item?.title || '') : null
    const effectiveLeague = parsedSportsEvent?.league || parsedEvent?.league || ''
    return {
      ...item,
      parsedSportsEvent,
      parsedEvent,
      mappedLeague: mapLeague(effectiveLeague) || '',
      sportHint: resolveSportHint({
        explicitHint: item?.sportHint,
        categoryHint: sportHintFromLeagueCode(effectiveLeague) || requestedSportHint,
        title: item?.title
      })
    }
  })

  const strictFiltered = normalizedItems.filter(item =>
    (isSportsOnlyIndexer(item.indexer) || Boolean(item.sportHint)) &&
    itemMatchesSportsCatalog(item, catalogSportHint) &&
    itemMatchesSportsDetail(item, requestedDetail) &&
    isLikelySportsEventTitle(item.title, item.sportHint) &&
    !isLikelyPackedReleaseTitle(item.title)
  )
  let filtered = strictFiltered
  if (filtered.length < Math.min(12, limit)) {
    // Strict event-title filter left too few results — relax to sport-hint +
    // noise rejection so the catalog isn't empty on default browse or sparse
    // genre/search results
    filtered = normalizedItems.filter(item =>
      (isSportsOnlyIndexer(item.indexer) || Boolean(item.sportHint)) &&
      itemMatchesSportsCatalog(item, catalogSportHint) &&
      itemMatchesSportsDetail(item, requestedDetail) &&
      !isSportsNoiseTitle(item.title) &&
      !isLikelyPackedReleaseTitle(item.title)
    )
  }
  console.log(`[sports-catalog] catalog="${catalogDefinition?.id || 'pvtkrrx-sports'}" query="${query}" prowlarr=${items.length} normalized=${normalizedItems.length} strict=${strictFiltered.length} filtered=${filtered.length}`)

  const grouped = groupSportsItems(filtered.sort((a, b) => compareItems(a, b, query)), query)

  const skip = parseInt(extra.skip || '0', 10)
  const pageGroups = grouped.slice(skip, skip + limit)
  const artworkByBaseKey = new Map()
  const metas = await mapLimit(pageGroups, 6, async (group, index) => {
    const item = group.best
    const parsedSportsEvent = group.parsedSportsEvent || item.parsedSportsEvent || null
    const parsedEvent = group.parsedEvent || item.parsedEvent || null
    const effectiveLeagueCode = parsedSportsEvent?.league || parsedEvent?.league || ''
    const mappedLeague = group.mappedLeague || item.mappedLeague || mapLeague(effectiveLeagueCode) || ''
    const displayTitle = group.display || normalizeSportsEventTitle(item.title, parsedSportsEvent, parsedEvent) || cleanTitle(item.title) || item.title
    const resolvedSportHint = resolveSportHint({
      explicitHint: effectiveLeagueCode ? (sportHintFromLeagueCode(effectiveLeagueCode) || item?.sportHint) : item?.sportHint,
      categoryHint: requestedSportHint,
      title: item?.title || displayTitle
    })
    let sportsArtwork = artworkByBaseKey.get(group.baseKey) || null
    try {
      if (!sportsArtwork) {
        sportsArtwork = await sportsDb.getEventArtwork({
          ...item,
          title: item.title,
          publishDate: item.pubDate || item.publishDate || '',
          sportHint: resolvedSportHint,
          league: parsedSportsEvent?.league || parsedEvent?.league || mappedLeague,
          date: parsedSportsEvent?.date || parsedEvent?.date || '',
          homeTeam: parsedSportsEvent?.homeTeam || '',
          awayTeam: parsedSportsEvent?.awayTeam || '',
          eventName: parsedEvent?.eventName || '',
          quality: parsedSportsEvent?.quality || parsedEvent?.quality || ''
        })
      }
    } catch (_) {
      // keep fallback flow below
    }
    if (sportsArtwork && group.baseKey) {
      artworkByBaseKey.set(group.baseKey, sportsArtwork)
    }

    const eventDate = String(sportsArtwork?.eventDate || parsedSportsEvent?.date || parsedEvent?.date || '').trim()
    const league = String(sportsArtwork?.league || mappedLeague || parsedSportsEvent?.league || parsedEvent?.league || '').trim()
    const descriptionParts = [
      `${item.seeders} seeders`,
      formatSize(item.size),
      `${group.count} source${group.count === 1 ? '' : 's'}`
    ]
    if (eventDate) descriptionParts.push(eventDate)
    if (league) descriptionParts.push(league)

    const posterUrl = sportsArtwork?.landscapeImage || sportsArtwork?.image || sportsArtwork?.poster ||
      (item.imdbId
        ? (imdbPoster(item.imdbId) || placeholderPoster())
        : makeSportsThumbUrl(options.baseUrl, { ...item, publishDate: item.pubDate || item.publishDate || '', sportHint: resolvedSportHint }))
    const backgroundUrl = sportsArtwork?.backgroundImage || posterUrl
    const carriedPosterUrl = sportsArtwork?.poster || sportsArtwork?.image || posterUrl

    return {
      id: encodeCustomId({
        y: mediaType,
        k: 'sports',
        n: displayTitle,
        t: item.title || displayTitle,
        h: '',
        l: '',
        i: item.indexer,
        s: item.size,
        d: item.seeders,
        p: item.pubDate || '',
        c: group.count,
        e: eventDate,
        g: league,
        r: resolvedSportHint,
        u: parsedSportsEvent?.league || parsedEvent?.league || '',
        o: parsedSportsEvent?.homeTeam || '',
        w: parsedSportsEvent?.awayTeam || '',
        v: String(sportsArtwork?.eventId || '').trim()
      }, {
        compress: true,
        compact: 'sports'
      }),
      type: mediaType,
      name: displayTitle,
      description: descriptionParts.join(' | '),
      poster: posterUrl,
      background: backgroundUrl,
      logo: String(sportsArtwork?.logo || '').trim() || undefined,
      releaseInfo: eventDate || undefined,
      posterShape: 'landscape'
    }
  })

  return { metas, cacheMaxAge: SPORTS_CATALOG_CACHE_MAX_AGE }
}

async function moviesCatalog(config, extra) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const query = String(extra.search || '').trim()
  const limit = getCatalogLimit(config)
  const items = await cachedProwlarrSearch(config, torznab, query, MOVIE_CATS)
  const filtered = items.filter(item =>
    item.imdbId &&
    !isSportsOnlyIndexer(item.indexer) &&
    !isLikelySeriesRelease(item.title) &&
    !isLikelyPackedReleaseTitle(item.title)
  )
  const best = dedupeByImdbBest(filtered, query)
  const inspectCount = Math.min(best.length, Math.max(80, (parseInt(extra.skip || '0', 10) + limit) * 3))
  const enriched = await enrichImdbEntries('movie', best, {
    inspectCount,
    requirePoster: !query
  })

  const skip = parseInt(extra.skip || '0', 10)
  const metas = (enriched.length > 0 ? enriched : best.map(item => ({
    id: item.imdbId,
    type: 'movie',
    name: cleanTitle(item.title),
    poster: imdbPoster(item.imdbId) || placeholderPoster(),
    item
  }))).sort((a, b) => compareItems(a.item, b.item, query))
    .map(entry => ({
      id: entry.id,
      type: 'movie',
      name: entry.name,
      poster: entry.poster
    }))

  return { metas: metas.slice(skip, skip + limit), cacheMaxAge: 300 }
}

async function tvCatalog(config, extra) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const query = String(extra.search || '').trim()
  const limit = getCatalogLimit(config)
  const items = await cachedProwlarrSearch(config, torznab, query, TV_CATS)
  const filtered = items.filter(item =>
    !isSportsOnlyIndexer(item.indexer) &&
    (isLikelySeriesRelease(item.title) || Boolean(extra.search)) &&
    !isLikelyPackedReleaseTitle(item.title)
  )

  const withImdb = []
  const missingImdb = []
  for (const item of filtered) {
    const imdbId = normalizeImdbId(item.imdbId)
    if (imdbId) {
      withImdb.push({ ...item, imdbId })
    } else {
      missingImdb.push(item)
    }
  }

  const titleResolveLimit = Math.min(missingImdb.length, Math.max(120, limit * 4))
  const resolvedFromTitle = await mapLimit(missingImdb.slice(0, titleResolveLimit), 6, async (item) => {
    try {
      const lookup = libraryLookupQuery(item.title) || cleanTitle(item.title)
      if (!lookup) return null
      const candidates = await cinemeta.searchSeries(lookup)
      if (!Array.isArray(candidates) || candidates.length === 0) return null

      let best = candidates[0]
      let bestScore = matchScore(lookup, best?.name)
      for (const candidate of candidates.slice(1, 8)) {
        const score = matchScore(lookup, candidate?.name)
        if (score > bestScore) {
          best = candidate
          bestScore = score
        }
      }

      const imdbId = normalizeImdbId(best?.imdb_id || best?.id || '')
      if (!imdbId) return null
      return { ...item, imdbId }
    } catch (_) {
      return null
    }
  })

  const merged = [...withImdb, ...resolvedFromTitle.filter(Boolean)]
  const best = dedupeByImdbBest(merged, query)
  const inspectCount = Math.min(best.length, Math.max(80, (parseInt(extra.skip || '0', 10) + limit) * 3))
  const enriched = await enrichImdbEntries('series', best, {
    inspectCount,
    requirePoster: !query
  })

  const skip = parseInt(extra.skip || '0', 10)
  const metas = (enriched.length > 0 ? enriched : best.map(item => ({
    id: item.imdbId,
    type: 'series',
    name: cleanTitle(item.title),
    poster: imdbPoster(item.imdbId) || placeholderPoster(),
    item
  }))).sort((a, b) => compareItems(a.item, b.item, query))
    .map(entry => ({
      id: entry.id,
      type: 'series',
      name: entry.name,
      poster: entry.poster
    }))

  return { metas: metas.slice(skip, skip + limit), cacheMaxAge: 300 }
}

async function libraryCatalog(config, extra) {
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const limit = getCatalogLimit(config)
  const torrents = await qbit.torrents('completed')
  torrents.sort((a, b) => {
    const aDone = Number(a.completion_on || 0)
    const bDone = Number(b.completion_on || 0)
    if (bDone !== aDone) return bDone - aDone
    return String(a.name || '').localeCompare(String(b.name || ''))
  })

  const skip = parseInt(extra.skip || '0', 10)
  let filtered = torrents

  if (extra.search) {
    const q = extra.search.toLowerCase()
    filtered = torrents.filter(t => t.name.toLowerCase().includes(q))
  }

  const page = filtered.slice(skip, skip + limit)
  const metas = await mapLimit(page, 6, async (t) => {
    let directVideoFilePath = ''
    try {
      const files = await qbit.files(t.hash)
      const videoFile = findVideoFile(files)
      if (videoFile?.name) {
        directVideoFilePath = findExistingLocalFilePath(t, videoFile.name, config.additionalStorageRoots)
      } else {
        directVideoFilePath = findExtractedArchiveVideoPath(t)
        if (!directVideoFilePath) {
          const extraction = await ensurePackedArchiveExtracted(t, files, config.additionalStorageRoots)
          if (extraction?.status === 'ready' && extraction.path) {
            directVideoFilePath = extraction.path
          }
        }
      }
    } catch (_) {
      directVideoFilePath = ''
    }

    const seriesLike = isLikelySeriesRelease(t.name)
    const type = seriesLike ? 'series' : 'movie'
    const fallbackName = cleanTitle(t.name)
    const query = libraryLookupQuery(t.name) || fallbackName

    let poster = placeholderPoster()
    let displayName = fallbackName
    let background = ''
    let imdbId = ''
    let resolvedType = type

    try {
      const candidates = seriesLike
        ? await cinemeta.searchSeries(query)
        : await cinemeta.searchMovies(query)
      if (Array.isArray(candidates) && candidates.length > 0) {
        let best = candidates[0]
        let bestScore = matchScore(fallbackName, best?.name)
        for (const c of candidates.slice(1, 8)) {
          const score = matchScore(fallbackName, c?.name)
          if (score > bestScore) {
            best = c
            bestScore = score
          }
        }
        const candidateImdb = String(best?.imdb_id || best?.id || '').trim()
        if (/^tt\d{5,10}$/i.test(candidateImdb)) imdbId = candidateImdb
        if (best?.type === 'movie' || best?.type === 'series') resolvedType = best.type
        if (best?.poster) poster = String(best.poster)
        if (best?.background) background = String(best.background)
        if (best?.name) displayName = String(best.name)
      }
    } catch (_) {
      // keep fallback title/poster
    }

    return {
      id: encodeCustomId({
        y: resolvedType,
        t: t.name,
        n: displayName,
        h: t.hash,
        s: t.size,
        d: 0,
        m: imdbId,
        f: directVideoFilePath
      }, {
        compress: true,
        compact: 'library'
      }),
      type: resolvedType,
      name: displayName,
      description: formatSize(t.size),
      poster,
      background: background || undefined
    }
  })

  return { metas, cacheMaxAge: 300 }
}

module.exports = { handleCatalog }
