const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SportsMetaClient } = require('../clients/sportsmeta')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { findSportsDiscoveryCatalog, getSportsSearchSeedTerms } = require('../config/sportsCatalogs')
const { cleanTitle, isLikelyPackedReleaseTitle } = require('../utils/parser')
const { normalizeSportKey, resolveSportHint, isSportsNoiseTitle, isLikelySportsEventTitle } = require('../utils/sportsRules')
const { isSportsCultIndexer, isSportsOnlyIndexer } = require('../utils/sportsIndexers')
const { formatSize, findVideoFile } = require('../utils/streams')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { parseSportsTorrentProfile, rankSportsTorrent } = require('../utils/sportsTorrentProfile')
const { stripSportsReleaseNoise } = require('../utils/sportsReleaseNoise')
const { getMappedLeagueEntry, mapLeague, normalizeLeagueCode } = require('../utils/leagueMap')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { encodeCustomId } = require('../utils/customId')
const {
  setSportsAvailabilityAnchor,
  setSportsAvailabilityCanonicalAnchor
} = require('../utils/sportsAvailabilityStore')
const { findExistingLocalFilePath } = require('../utils/localStorageRoots')
const { findExtractedArchiveVideoPath, ensurePackedArchiveExtracted } = require('../utils/archiveExtraction')
const {
  SPORTS_META_RESOLUTION_STATUS,
  normalizeLeagueLabel,
  resolveSportsMetaIdentity
} = require('../utils/sportsIdentityResolution')
const {
  getCachedSportsIdentityBackfill,
  queueSportsIdentityBackfills
} = require('../utils/sportsIdentityBackfill')
const {
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLandscapeAsset,
  resolveSportsLogoAsset
} = require('../utils/sportsArtwork')
const { normalizeSportsEventMetadata } = require('../utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../utils/sportsEventClassifier')
const { buildMetaPlaceholder } = require('../utils/metaPlaceholder')
const { applyHostedServiceOverrides } = require('../utils/hostedServiceOverrides')

const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'
const cinemeta = new CinemetaClient()
const cinemetaCache = new Map()
const prowlarrSearchCache = new Map()
const prowlarrSearchInFlight = new Map()
const PROWLARR_SEARCH_CACHE_TTL_MS = Math.max(15000, parseInt(process.env.PVTKRRX_PROWLARR_CACHE_MS || '120000', 10))
const PROWLARR_SEARCH_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS || '7000', 10))
const PROWLARR_SEARCH_CACHE_MAX_KEYS = Math.max(50, parseInt(process.env.PVTKRRX_PROWLARR_CACHE_MAX_KEYS || '500', 10))
const SPORTS_SEED_CONCURRENCY = Math.max(1, parseInt(process.env.PVTKRRX_SPORTS_SEED_CONCURRENCY || '2', 10))
const SPORTS_SEED_QUERY_TIMEOUT_MS = Math.max(
  800,
  parseInt(process.env.PVTKRRX_SPORTS_SEED_QUERY_TIMEOUT_MS || '2500', 10)
)
// Don't re-run a second pass of seed-term queries when the initial browse has
// already produced enough items to paint a usable first screen. Do not wait
// for a near-full page before returning to tablet/home-device clients.
const SPORTS_SEED_ENRICH_THRESHOLD = Math.max(1, parseInt(process.env.PVTKRRX_SPORTS_SEED_ENRICH_THRESHOLD || '12', 10))
const SPORTS_CATALOG_CACHE_MAX_AGE = Math.max(
  120,
  parseInt(
    process.env.PVTKRRX_SPORTS_CATALOG_CACHE_MAX_AGE || process.env.PVTKRRX_SPORTS_CACHE_MAX_AGE || '600',
    10
  )
)
// Overfetch beyond the emitted page so `mergeSportsIdentityGroups` can still
// collapse within-page canonical-id duplicates. Kept small: each extra group
// is up to ~6 serialized SportsMeta HTTP calls in the worst case, and each
// one is wall-clock latency on the tablet first-screen path.
const SPORTS_IDENTITY_PAGE_OVERFETCH = Math.max(
  0,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_OVERFETCH || '5', 10)
)
// Identity resolution is network-bound against SportsMeta. 16 inflight is
// comfortable for the hosted service and halves wall time vs the old default.
const SPORTS_IDENTITY_CONCURRENCY = Math.max(
  2,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_CONCURRENCY || '16', 10)
)
// Hard wall-clock ceiling on the entire identity-resolution pass. Any group
// that hasn't resolved in time ships with a FALLBACK_ONLY status and a
// `pvtkrrx:` custom id. Caps tablet first-screen latency under variable
// real-world SportsMeta/Prowlarr response times.
const SPORTS_IDENTITY_PASS_BUDGET_MS = Math.max(
  500,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BUDGET_MS || '1000', 10)
)
const DEBUG_SPORTS_RESOLUTION = /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_DEBUG_SPORTS_RESOLUTION || '').trim())

function formatCatalogSportLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  const labels = {
    'american-football': 'American Football',
    basketball: 'Basketball',
    baseball: 'Baseball',
    boxing: 'Boxing',
    cricket: 'Cricket',
    cycling: 'Cycling',
    darts: 'Darts',
    football: 'Football',
    golf: 'Golf',
    hockey: 'Hockey',
    mma: 'MMA',
    motorsport: 'Motorsport',
    rugby: 'Rugby',
    snooker: 'Snooker',
    tennis: 'Tennis',
    wrestling: 'Wrestling'
  }
  return labels[normalized] || normalized
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function pushUniqueCatalogLine(lines, value) {
  const text = String(value || '').trim()
  if (!text) return
  if (!lines.some((line) => line.toLowerCase() === text.toLowerCase())) lines.push(text)
}

function buildSportsCatalogDescription(input = {}) {
  const lines = []
  const sport = formatCatalogSportLabel(input.sportHint || input.sport)
  const league = String(input.league || '').trim()
  const title = String(input.eventTitle || input.title || '').trim()
  const detail = String(input.eventDetail || '').trim()
  const date = String(input.date || '').trim()
  const homeTeam = String(input.homeTeam || '').trim()
  const awayTeam = String(input.awayTeam || '').trim()
  const availability = []

  if (sport) pushUniqueCatalogLine(lines, `Sport: ${sport}`)
  if (league) pushUniqueCatalogLine(lines, `League: ${league}`)
  if (title) pushUniqueCatalogLine(lines, `Event: ${title}`)
  if (detail) pushUniqueCatalogLine(lines, `Session: ${detail}`)
  if (date) pushUniqueCatalogLine(lines, `Date: ${date}`)
  if (homeTeam && awayTeam) pushUniqueCatalogLine(lines, `Teams: ${homeTeam} vs ${awayTeam}`)
  if (Number(input.seeders) > 0) availability.push(`${Number(input.seeders)} seeders`)
  if (input.size) availability.push(String(input.size).trim())
  if (Number(input.sourceCount) > 0) {
    const count = Number(input.sourceCount)
    availability.push(`${count} source${count === 1 ? '' : 's'}`)
  }
  if (availability.length > 0) pushUniqueCatalogLine(lines, `Availability: ${availability.join(' | ')}`)
  if (input.indexer) pushUniqueCatalogLine(lines, `Indexer: ${input.indexer}`)
  return lines
}

function redactArtworkUrl(value) {
  return String(value || '')
    .replace(/\/member\/([^/?#]+)\/asset\//i, '/member/[redacted]/asset/')
    .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
}

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

function slugifyCatalogKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'catalog'
}

const PROWLARR_HEALTH_CACHE_TTL_MS = Math.max(
  60000,
  parseInt(process.env.PVTKRRX_PROWLARR_HEALTH_CACHE_MS || '300000', 10)
)
const prowlarrHealthCache = new Map()

function getProwlarrHealthCacheKey(config = {}) {
  const baseUrl = String(config?.jackettUrl || '').trim().toLowerCase()
  const apiKey = String(config?.jackettApiKey || '').trim()
  return `${baseUrl}|${apiKey ? `${apiKey.slice(0, 6)}:${apiKey.length}` : 'no-key'}`
}

async function getProwlarrHealth(config, torznab) {
  const key = getProwlarrHealthCacheKey(config)
  const now = Date.now()
  const hit = prowlarrHealthCache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  let value
  try {
    const indexers = await torznab.caps()
    const count = Array.isArray(indexers) ? indexers.length : 0
    value = {
      available: true,
      hasIndexers: count > 0,
      count,
      error: ''
    }
  } catch (error) {
    const message = String(error?.message || error || '').trim()
    value = {
      available: false,
      hasIndexers: false,
      count: 0,
      error: message
    }
  }

  prowlarrHealthCache.set(key, {
    value,
    expiresAt: now + PROWLARR_HEALTH_CACHE_TTL_MS
  })
  return value
}

function buildSetupRequiredMeta(type, label, reason) {
  const cleanType = String(type || 'movie').trim() || 'movie'
  const cleanLabel = String(label || '').trim() || cleanType
  const cleanReason = String(reason || '').trim() || 'PVTKRRX could not load this catalog right now.'
  return buildMetaPlaceholder({
    id: `pvtkrrx:setup-required:${slugifyCatalogKey(cleanType)}:${slugifyCatalogKey(cleanLabel)}`,
    type: cleanType,
    name: `${cleanLabel} unavailable`,
    description: cleanReason,
    poster: placeholderPoster(),
    background: placeholderPoster(),
    logo: placeholderPoster()
  })
}

async function maybeBuildSetupRequiredCatalog(config, torznab, type, label, skip = 0) {
  if (Number.parseInt(skip || '0', 10) > 0) return null
  const health = await getProwlarrHealth(config, torznab)
  if (health.hasIndexers) return null

  const reason = health.available
    ? `${label} has no Prowlarr indexers configured yet. Open Configure and add indexers to populate this catalog.`
    : `Prowlarr could not be reached${health.error ? ` (${health.error})` : ''}. Check the Prowlarr URL and API key in Configure.`

  return buildSetupRequiredMeta(type, label, reason)
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
  if ([
    'eflleagueone',
    'eflleaguetwo',
    'eflchampionship',
    'facup',
    'carabaocup',
    'communityshield',
    'conferenceleague',
    'uefaconferenceleague'
  ].includes(code)) return 'football'
  const mappedEntry = getMappedLeagueEntry(value)
  if (mappedEntry?.sportKey) return mappedEntry.sportKey
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

const { settleWithTimeout } = require('../utils/timeout')

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
  const effectiveTimeoutMs = Math.max(
    1000,
    Number(options?.timeoutMs) || PROWLARR_SEARCH_TIMEOUT_MS
  )
  // Give the underlying fetch a small grace window beyond the wrapper budget
  // so the AbortSignal fires shortly AFTER `settleWithTimeout` has already
  // returned the fallback. Without this, the Prowlarr client would keep
  // sockets open on its own hardcoded timeout long after the caller has
  // given up, consuming Prowlarr capacity and starving parallel seed queries.
  const searchOptions = { ...options, timeoutMs: effectiveTimeoutMs + 500 }
  const pending = settleWithTimeout(
    client.search(query, cats, type, searchOptions),
    effectiveTimeoutMs,
    fallback
  ).then((result) => {
    const value = Array.isArray(result?.value) ? result.value : fallback
    if (!result?.timedOut && !result?.error) {
      prowlarrSearchCache.set(key, {
        value,
        expiresAt: Date.now() + PROWLARR_SEARCH_CACHE_TTL_MS
      })
      trimProwlarrSearchCache()
    }
    return value
  }).finally(() => {
    prowlarrSearchInFlight.delete(key)
  })

  prowlarrSearchInFlight.set(key, pending)
  return pending
}

function mergeUniqueProwlarrItems(...batches) {
  const byKey = new Map()
  for (const batch of batches) {
    for (const item of (Array.isArray(batch) ? batch : [])) {
      const key = `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
      if (!key || byKey.has(key)) continue
      byKey.set(key, item)
    }
  }
  return [...byKey.values()]
}

async function searchSportsCatalogItems(config, torznab, query, limit) {
  const strictItems = await cachedProwlarrSearch(
    config,
    torznab,
    query,
    SPORT_CATS,
    'search',
    { useCategories: true }
  )
  const strictEnoughThreshold = Math.max(20, Math.min(80, limit + 10))
  if (strictItems.length >= strictEnoughThreshold) return strictItems

  const broadItems = await cachedProwlarrSearch(
    config,
    torznab,
    query,
    SPORT_CATS,
    'search',
    { useCategories: true }
  )
  return mergeUniqueProwlarrItems(strictItems, broadItems)
}

async function searchSportsCatalogSeedItems(config, torznab, query) {
  return cachedProwlarrSearch(
    config,
    torznab,
    query,
    SPORT_CATS,
    'search',
    {
      useCategories: true,
      timeoutMs: SPORTS_SEED_QUERY_TIMEOUT_MS
    }
  )
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

  const sportsRankDiff = sportsTorrentRankScore(b, query) - sportsTorrentRankScore(a, query)
  if (sportsRankDiff !== 0) return sportsRankDiff

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

function sportsTorrentRankScore(item = {}, query = '') {
  if (!item || typeof item !== 'object') return 0
  if (!item.sportsProfile && !Number.isFinite(Number(item.sportsRank))) return 0
  return rankSportsTorrent(item, query, {
    profile: item.sportsProfile,
    parsedSportsEvent: item.parsedSportsEvent,
    parsedEvent: item.parsedEvent,
    sportHint: item.sportHint,
    today: currentUtcDateString()
  })
}

function currentUtcDateString() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function sportsIdentityGroupEventDate(group = {}) {
  const resolution = group?.sportsMetaResolution || {}
  const canonical = resolution?.canonical || {}
  const canonicalEvent = canonical?.event || {}
  const sportsArtwork = canonical?.sportsArtwork || {}
  const parsedSportsEvent = group?.parsedSportsEvent || group?.bestAvailability?.parsedSportsEvent || null
  const parsedEvent = group?.parsedEvent || group?.bestAvailability?.parsedEvent || null

  return normalizeIsoDate(
    canonicalEvent.date ||
    sportsArtwork.eventDate ||
    parsedSportsEvent?.date ||
    parsedEvent?.date
  )
}

function sportsCatalogDateBucket(eventDate, today = currentUtcDateString()) {
  const date = normalizeIsoDate(eventDate)
  if (!date) return 1
  return date >= today ? 0 : 2
}

function compareSportsIdentityGroupFreshness(a = {}, b = {}, today = currentUtcDateString()) {
  const aDate = sportsIdentityGroupEventDate(a)
  const bDate = sportsIdentityGroupEventDate(b)
  const aBucket = sportsCatalogDateBucket(aDate, today)
  const bBucket = sportsCatalogDateBucket(bDate, today)
  if (aBucket !== bBucket) return aBucket - bBucket
  if (!aDate || !bDate) return 0

  if (aBucket === 0) {
    return aDate.localeCompare(bDate)
  }
  return bDate.localeCompare(aDate)
}

function normalizeSportsCatalogItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const parsedSportsEvent = parseSportsTitle(item?.title || '', item?.pubDate || item?.publishDate || '')
    const parsedEvent = !parsedSportsEvent ? parseSportsEventTitle(item?.title || '') : null
    const effectiveLeague = parsedSportsEvent?.league || parsedEvent?.league || ''
    const sportsProfile = parseSportsTorrentProfile(item, {
      parsedSportsEvent,
      parsedEvent,
      sportHint: item?.sportHint,
      league: effectiveLeague
    })
    const eventClass = sportsProfile?.event_class || classifySportsEvent({
      sportHint: sportsProfile?.sport || item?.sportHint,
      sport: sportsProfile?.sport,
      competition: sportsProfile?.league || effectiveLeague,
      league: sportsProfile?.league || effectiveLeague,
      eventTitle: sportsProfile?.event,
      eventDetail: sportsProfile?.session || sportsProfile?.round,
      homeTeam: sportsProfile?.home_team || parsedSportsEvent?.homeTeam,
      awayTeam: sportsProfile?.away_team || parsedSportsEvent?.awayTeam,
      rawTitle: item?.title || '',
      categoryNames: Array.isArray(item?.categoryNames) ? item.categoryNames : [],
      indexerCategoryName: item?.indexerCategoryName || ''
    })
    return {
      ...item,
      trackerSource: {
        title: item?.title || '',
        link: item?.link || '',
        infohash: item?.infohash || '',
        size: item?.size || 0,
        seeders: item?.seeders || 0,
        indexer: item?.indexer || '',
        pubDate: item?.pubDate || item?.publishDate || '',
        sportHint: item?.sportHint || '',
        categoryNames: Array.isArray(item?.categoryNames) ? item.categoryNames : [],
        indexerCategoryName: item?.indexerCategoryName || '',
        eventClass
      },
      trackerSourceType: isSportsCultIndexer(item?.indexer) ? 'sportscult' : 'other',
      parsedSportsEvent,
      parsedEvent,
      eventClass,
      sportsProfile: {
        ...sportsProfile,
        event_class: eventClass
      },
      sportsRank: rankSportsTorrent(item, '', {
        profile: sportsProfile,
        parsedSportsEvent,
        parsedEvent,
        sportHint: item?.sportHint,
        today: currentUtcDateString()
      }),
      mappedLeague: mapLeague(effectiveLeague) || '',
      sportHint: resolveSportHint({
        explicitHint: item?.sportHint,
        categoryHint: sportHintFromLeagueCode(effectiveLeague),
        title: item?.title
      })
    }
  })
}

function filterSportsCatalogItems(normalizedItems = [], catalogSportHint = '', requestedDetail = '', limit = 50) {
  const strictFiltered = normalizedItems.filter(item =>
    itemMatchesSportsCatalog(item, catalogSportHint) &&
    itemMatchesSportsDetail(item, requestedDetail) &&
    isLikelySportsEventTitle(item.title, item.sportHint) &&
    !isLikelyPackedReleaseTitle(item.title)
  )

  let filtered = strictFiltered
  if (filtered.length < Math.min(12, limit)) {
    // Strict event-title filter left too few results — relax to sport-hint +
    // noise rejection so the catalog isn't empty on default browse or sparse
    // genre/search results.
    filtered = normalizedItems.filter(item =>
      itemMatchesSportsCatalog(item, catalogSportHint) &&
      itemMatchesSportsDetail(item, requestedDetail) &&
      !isSportsNoiseTitle(item.title) &&
      !isLikelyPackedReleaseTitle(item.title)
    )
  }

  const otherIndexerCandidates = normalizedItems.filter(item =>
    item.trackerSourceType !== 'sportscult' &&
    itemMatchesSportsCatalog(item, catalogSportHint) &&
    itemMatchesSportsDetail(item, requestedDetail) &&
    !isSportsNoiseTitle(item.title) &&
    !isLikelyPackedReleaseTitle(item.title)
  ).length
  const otherIndexerAccepted = filtered.filter(item => item.trackerSourceType !== 'sportscult').length
  const otherIndexerRejected = Math.max(0, otherIndexerCandidates - otherIndexerAccepted)

  return {
    strictFiltered,
    filtered,
    otherIndexerAccepted,
    otherIndexerRejected
  }
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

  const presentationCleaned = cleanTitle(title)
    .replace(/\butd\b/gi, 'united')
    .replace(/\b(?:mini|full|extended|highlights?|replay|pre[\s.\-_]*match|post[\s.\-_]*match|match)\b/gi, ' ')
    .replace(/\b(?:en|skynz|fubo)\b/gi, ' ')

  return stripSportsReleaseNoise(presentationCleaned)
}

function sportsEventKey(input) {
  const parsedSportsEvent = input && typeof input === 'object'
    ? (input.parsedSportsEvent || parseSportsTitle(input.title || '', input.publishDate || input.pubDate || ''))
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

function canonicalizeSportsMatchupOrder(parsedSportsEvent, query = '') {
  if (!parsedSportsEvent?.homeTeam || !parsedSportsEvent?.awayTeam) return parsedSportsEvent

  const homeTeam = String(parsedSportsEvent.homeTeam || '').trim()
  const awayTeam = String(parsedSportsEvent.awayTeam || '').trim()
  if (!homeTeam || !awayTeam) return parsedSportsEvent

  const homeRelevance = relevanceScore(homeTeam, query)
  const awayRelevance = relevanceScore(awayTeam, query)
  if (homeRelevance !== awayRelevance) {
    return homeRelevance > awayRelevance
      ? parsedSportsEvent
      : { ...parsedSportsEvent, homeTeam: awayTeam, awayTeam: homeTeam }
  }

  const orderedTeams = [homeTeam, awayTeam].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  if (orderedTeams[0] === homeTeam && orderedTeams[1] === awayTeam) return parsedSportsEvent
  return {
    ...parsedSportsEvent,
    homeTeam: orderedTeams[0],
    awayTeam: orderedTeams[1]
  }
}

function getSportsVariantTag(title) {
  const t = String(title || '').toLowerCase()
  if (/\bearly[\s.\-_]*prelims?\b/.test(t)) return 'early-prelims'
  if (/\bprelims?\b/.test(t)) return 'prelims'
  if (/\bmain[\s.\-_]*card\b/.test(t)) return 'main-card'
  return 'main'
}

function groupSportsAvailabilityItems(items, query = '') {
  const groups = new Map()
  for (const item of items || []) {
    const parsedSportsEvent = item?.parsedSportsEvent || null
    const displaySportsEvent = canonicalizeSportsMatchupOrder(parsedSportsEvent, query)
    const parsedEvent = item?.parsedEvent || null
    const itemMappedLeague = item?.mappedLeague || ''
    const fallbackDisplayTitle = normalizeSportsEventTitle(item.title, displaySportsEvent, parsedEvent) || cleanTitle(item.title) || String(item.title || '').trim()
    if (!fallbackDisplayTitle) continue
    const availabilityKey = sportsEventKey({ title: item.title, parsedSportsEvent, parsedEvent })
    const hasStructuredKey = (parsedSportsEvent?.league && parsedSportsEvent?.date && parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) ||
      (parsedEvent?.league && parsedEvent?.eventName)
    const key = hasStructuredKey
      ? availabilityKey
      : `${availabilityKey}|${getSportsVariantTag(item.title)}`
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        availabilityKey,
        fallbackDisplayTitle,
        bestAvailability: item,
        availabilityCount: 1,
        parsedSportsEvent,
        displaySportsEvent,
        parsedEvent,
        mappedLeague: itemMappedLeague,
        sportsMetaResolution: null
      })
      continue
    }
    current.availabilityCount += 1
    if (!current.parsedSportsEvent && parsedSportsEvent) {
      current.parsedSportsEvent = parsedSportsEvent
      current.displaySportsEvent = current.displaySportsEvent || displaySportsEvent
      current.mappedLeague = itemMappedLeague || current.mappedLeague
    }
    if (!current.parsedEvent && parsedEvent) {
      current.parsedEvent = parsedEvent
      current.mappedLeague = itemMappedLeague || current.mappedLeague
    }
    if (compareItems(item, current.bestAvailability, query) < 0) {
      current.bestAvailability = item
      current.fallbackDisplayTitle = fallbackDisplayTitle || current.fallbackDisplayTitle
      if (parsedSportsEvent) {
        current.parsedSportsEvent = parsedSportsEvent
        current.displaySportsEvent = displaySportsEvent
        current.mappedLeague = itemMappedLeague || current.mappedLeague
      }
      if (parsedEvent) {
        current.parsedEvent = parsedEvent
        current.mappedLeague = itemMappedLeague || current.mappedLeague
      }
    }
  }
  return [...groups.values()].sort((a, b) => compareItems(a.bestAvailability, b.bestAvailability, query))
}

function buildSportsIdentityGroupKey(group = {}) {
  const resolution = group?.sportsMetaResolution || {}
  const canonicalId = String(resolution?.canonicalId || '').trim()
  if (resolution?.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED && canonicalId) {
    return `canonical:${canonicalId}`
  }
  return `availability:${String(group?.availabilityKey || '').trim()}`
}

function logSportsAvailabilityResolution(group = {}) {
  if (!DEBUG_SPORTS_RESOLUTION) return

  const availability = group?.bestAvailability || {}
  const resolution = group?.sportsMetaResolution || {}
  const parsedSportsEvent = group?.parsedSportsEvent || null
  const parsedEvent = group?.parsedEvent || null
  const parsedHints = parsedSportsEvent
    ? {
        type: 'matchup',
        league: parsedSportsEvent.league,
        date: parsedSportsEvent.date,
        homeTeam: parsedSportsEvent.homeTeam,
        awayTeam: parsedSportsEvent.awayTeam
      }
    : parsedEvent
      ? {
          type: 'event',
          league: parsedEvent.league,
          date: parsedEvent.date || '',
          eventName: parsedEvent.eventName
        }
      : { type: 'none' }

  console.log('[sports-resolution]',
    JSON.stringify({
      title: availability?.title || '',
      trackerSource: String(availability?.indexer || '').trim().toLowerCase(),
      parsedHints,
      sportsMetaQuery: resolution?.query || {},
      outcome: resolution?.status || '',
      canonicalId: resolution?.canonicalId || '',
      fallbackReason: resolution?.reason || ''
    })
  )
}

function mergeSportsIdentityGroups(groups, query = '') {
  const merged = new Map()
  for (const group of groups || []) {
    const key = buildSportsIdentityGroupKey(group)
    const current = merged.get(key)
    if (!current) {
      merged.set(key, {
        ...group,
        identityGroupKey: key
      })
      continue
    }

    current.availabilityCount += Math.max(1, Number(group?.availabilityCount || 0))
    if (compareItems(group.bestAvailability, current.bestAvailability, query) < 0) {
      current.bestAvailability = group.bestAvailability
      current.fallbackDisplayTitle = group.fallbackDisplayTitle || current.fallbackDisplayTitle
      current.parsedSportsEvent = group.parsedSportsEvent || current.parsedSportsEvent
      current.displaySportsEvent = group.displaySportsEvent || current.displaySportsEvent
      current.parsedEvent = group.parsedEvent || current.parsedEvent
      current.mappedLeague = group.mappedLeague || current.mappedLeague
    }

    const currentResolution = current.sportsMetaResolution || {}
    const incomingResolution = group.sportsMetaResolution || {}
    const currentResolved = currentResolution.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED
    const incomingResolved = incomingResolution.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED
    if (!currentResolved && incomingResolved) {
      current.sportsMetaResolution = incomingResolution
    }
  }

  return [...merged.values()].sort((a, b) => compareItems(a.bestAvailability, b.bestAvailability, query))
}

function compareSportsIdentityGroupsForCatalog(a, b, query = '') {
  const relDiff = relevanceScore(b?.bestAvailability?.title, query) - relevanceScore(a?.bestAvailability?.title, query)
  if (relDiff !== 0) return relDiff

  const freshnessDiff = compareSportsIdentityGroupFreshness(a, b)
  if (freshnessDiff !== 0) return freshnessDiff

  const availabilityDiff = compareItems(a?.bestAvailability, b?.bestAvailability, query)
  if (availabilityDiff !== 0) return availabilityDiff

  const aResolved = Boolean(a?.sportsMetaResolution?.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED &&
    String(a?.sportsMetaResolution?.canonicalId || '').trim())
  const bResolved = Boolean(b?.sportsMetaResolution?.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED &&
    String(b?.sportsMetaResolution?.canonicalId || '').trim())
  if (aResolved !== bResolved) return aResolved ? -1 : 1
  return 0
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

function leagueEntryMatchesField(entry = null, field = '') {
  if (!entry) return false
  const normalizedField = normalizeLeagueCode(field)
  if (!normalizedField) return false
  const values = [
    entry.code,
    entry.name,
    entry.sportsDbName,
    ...(Array.isArray(entry.aliases) ? entry.aliases : [])
  ]
  return values.some((value) => normalizeLeagueCode(value) === normalizedField)
}

function textContainsLeagueEntry(entry = null, text = '') {
  if (!entry) return false
  const normalizedText = normalizeSearchValue(text)
  if (!normalizedText) return false
  const values = [
    entry.code,
    entry.name,
    entry.sportsDbName
  ]
  return values.some((value) => {
    const normalizedValue = normalizeSearchValue(value)
    return normalizedValue && new RegExp(`(^| )${normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(normalizedText)
  })
}

function itemMatchesSportsCatalog(item, sportHint = '') {
  const expectedHint = normalizeSportKey(sportHint)
  if (!expectedHint) return true
  return normalizeSportKey(item?.sportHint) === expectedHint
}

function itemMatchesSportsDetail(item, detailFilter = '') {
  const filter = String(detailFilter || '').trim()
  if (!filter) return true
  const mappedFilterLeague = getMappedLeagueEntry(filter)
  if (mappedFilterLeague) {
    const expectedSport = normalizeSportKey(mappedFilterLeague.sportKey)
    const itemSport = normalizeSportKey(item?.sportHint)
    if (expectedSport && itemSport && itemSport !== expectedSport) return false

    const leagueFields = [
      item?.mappedLeague,
      item?.parsedSportsEvent?.league,
      item?.parsedEvent?.league
    ]
    if (leagueFields.some((field) => leagueEntryMatchesField(mappedFilterLeague, field))) return true

    return Boolean(expectedSport && itemSport === expectedSport && textContainsLeagueEntry(mappedFilterLeague, item?.title))
  }

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
    const effectiveConfig = applyHostedServiceOverrides(config && typeof config === 'object' ? config : {})
    const extra = parseExtra(extraStr)
    const opts = {
      baseUrl: String(context.baseUrl || '').replace(/\/+$/, '')
    }
    const sportsCatalogDefinition = findSportsDiscoveryCatalog(id)
    if (sportsCatalogDefinition) {
      return await sportsCatalog(effectiveConfig, extra, opts, type, sportsCatalogDefinition, { baseUrl: opts.baseUrl })
    }

    switch (id) {
      case 'pvtkrrx-movies':
        return await moviesCatalog(effectiveConfig, extra, opts)
      case 'pvtkrrx-tv':
        return await tvCatalog(effectiveConfig, extra, opts)
      case 'pvtkrrx-library':
        return await libraryCatalog(effectiveConfig, extra, opts)
      default:
        return { metas: [] }
    }
  } catch (err) {
    console.error(`[catalog] ERROR id=${id} type=${type}: ${err.message}`)
    return { metas: [] }
  }
}

async function sportsCatalog(config, extra, options = {}, catalogType = 'movie', catalogDefinition = null, context = {}) {
  const addonBaseUrl = String(context?.baseUrl || options?.baseUrl || '').replace(/\/+$/, '')
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const sportsMeta = new SportsMetaClient({
    baseUrl: config?.sportsmetaBaseUrl
  })
  const mediaType = String(catalogType || 'movie').trim().toLowerCase() || 'movie'
  const requestedDetail = String(extra.genre || extra.search || '').trim()
  const catalogSportHint = normalizeSportKey(catalogDefinition?.sportHint || '')
  const requestedSportHint = catalogSportHint || resolveSportHint({ explicitHint: requestedDetail })
  const query = requestedDetail
  const limit = getCatalogLimit(config)
  let items = await searchSportsCatalogItems(config, torznab, query, limit)

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
      const seedBatches = await mapLimit(
        SEED_TERMS,
        SPORTS_SEED_CONCURRENCY,
        (term) => searchSportsCatalogSeedItems(config, torznab, term)
      )
      items = mergeUniqueProwlarrItems(...seedBatches)
    }
  }

  let normalizedItems = normalizeSportsCatalogItems(items)
  let {
    strictFiltered,
    filtered,
    otherIndexerAccepted,
    otherIndexerRejected
  } = filterSportsCatalogItems(normalizedItems, catalogSportHint, requestedDetail, limit)

  // Sport-specific catalogs (football / motorsport / mma / …) enrich the
  // initial browse with the catalog's own seed terms so they don't collapse
  // when browse is dominated by another sport. Skip this pass when browse
  // already produced enough relevant matches for that sport: a raw browse
  // batch can be large while still being dominated by another sport family.
  if (!query && catalogSportHint && filtered.length < SPORTS_SEED_ENRICH_THRESHOLD) {
    const seedBatches = await mapLimit(
      getSportsSearchSeedTerms(catalogSportHint),
      SPORTS_SEED_CONCURRENCY,
      (term) => searchSportsCatalogSeedItems(config, torznab, term)
    )
    items = mergeUniqueProwlarrItems(items, ...seedBatches)
    normalizedItems = normalizeSportsCatalogItems(items)
    ;({
      strictFiltered,
      filtered,
      otherIndexerAccepted,
      otherIndexerRejected
    } = filterSportsCatalogItems(normalizedItems, catalogSportHint, requestedDetail, limit))
  }

  const skip = parseInt(extra.skip || '0', 10)
  if (filtered.length === 0) {
    const placeholder = await maybeBuildSetupRequiredCatalog(
      config,
      torznab,
      mediaType,
      catalogDefinition?.name || 'Sports',
      skip
    )
    if (placeholder) {
      return { metas: [placeholder], cacheMaxAge: 120 }
    }
  }

  const groupedAvailability = groupSportsAvailabilityItems(filtered.sort((a, b) => compareItems(a, b, query)), query)
  // First-screen latency fix: resolve canonical SportsMeta identity only for
  // the window that will actually be emitted (plus a small overfetch so
  // `mergeSportsIdentityGroups` can still collapse within-page duplicates).
  // Groups beyond the window keep the fallback `pvtkrrx:` custom id they
  // already fall back to — a later meta/stream request re-resolves lazily
  // against the 60s SportsMeta cache.
  const identityWindowEnd = Math.max(
    0,
    Math.min(groupedAvailability.length, skip + limit + SPORTS_IDENTITY_PAGE_OVERFETCH)
  )
  const identityWindow = groupedAvailability.slice(0, identityWindowEnd)
  const identityPassStart = Date.now()
  const deferredResolution = (reason) => ({
    status: SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY,
    identityType: 'deferred',
    query: {},
    reason,
    canonicalId: '',
    canonical: null
  })
  let identityPassTimedOutCount = 0
  const resolvedIdentityWindow = await mapLimit(identityWindow, SPORTS_IDENTITY_CONCURRENCY, async (group) => {
    const cachedBackfillResolution = getCachedSportsIdentityBackfill(group)
    if (cachedBackfillResolution) {
      return { ...group, sportsMetaResolution: cachedBackfillResolution, sportsMetaBackfill: 'cache' }
    }

    const remaining = SPORTS_IDENTITY_PASS_BUDGET_MS - (Date.now() - identityPassStart)
    if (remaining <= 0) {
      identityPassTimedOutCount += 1
      return { ...group, sportsMetaResolution: deferredResolution('identity_budget_exhausted') }
    }
    const outcome = await settleWithTimeout(
      resolveSportsMetaIdentity(sportsMeta, group.bestAvailability, { fastFail: true }),
      remaining,
      null
    )
    const sportsMetaResolution = outcome.timedOut || !outcome.value
      ? deferredResolution(outcome.timedOut ? 'identity_budget_exhausted' : 'identity_resolve_failed')
      : outcome.value
    if (outcome.timedOut) identityPassTimedOutCount += 1
    const resolvedGroup = { ...group, sportsMetaResolution }
    logSportsAvailabilityResolution(resolvedGroup)
    return resolvedGroup
  })
  const groupedIdentity = mergeSportsIdentityGroups(resolvedIdentityWindow, query)
  // Emit resolved-window groups first (canonical ids where available), then
  // append deferred groups with fallback custom ids so the catalog still
  // shows the full page on sparse days. Deferred groups carry a
  // FALLBACK_ONLY resolution so `encodeCustomId` runs instead of canonical.
  const deferredGroups = groupedAvailability.slice(identityWindowEnd).map((group) => ({
    ...group,
    sportsMetaResolution: getCachedSportsIdentityBackfill(group) || deferredResolution('deferred_beyond_identity_window')
  }))
  const resolvedIdentityGroups = [...groupedIdentity, ...deferredGroups]
    .sort((a, b) => compareSportsIdentityGroupsForCatalog(a, b, query))
  const backfillQueued = queueSportsIdentityBackfills({
    groups: resolvedIdentityGroups,
    config,
    reason: 'sports_catalog_unresolved'
  })

  const resolutionCounts = resolvedIdentityWindow.reduce((counts, group) => {
    const state = String(group?.sportsMetaResolution?.status || SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY)
    counts[state] = (counts[state] || 0) + 1
    return counts
  }, {})

  console.log(
    `[sports-catalog] catalog="${catalogDefinition?.id || 'pvtkrrx-sports'}" query="${query}" prowlarr=${items.length} normalized=${normalizedItems.length} strict=${strictFiltered.length} anchors=${filtered.length} otherIndexerAccepted=${otherIndexerAccepted} otherIndexerRejected=${otherIndexerRejected} availabilityGroups=${groupedAvailability.length} identityWindow=${identityWindow.length} identityBudgetMs=${SPORTS_IDENTITY_PASS_BUDGET_MS} identityPassMs=${Date.now() - identityPassStart} identityTimedOut=${identityPassTimedOutCount} deferred=${deferredGroups.length} identityGroups=${groupedIdentity.length} emitted=${resolvedIdentityGroups.length} backfillQueued=${backfillQueued} resolved=${resolutionCounts[SPORTS_META_RESOLUTION_STATUS.RESOLVED] || 0} ambiguous=${resolutionCounts[SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS] || 0} notFound=${resolutionCounts[SPORTS_META_RESOLUTION_STATUS.NOT_FOUND] || 0} weak=${resolutionCounts[SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH] || 0} fallback=${resolutionCounts[SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY] || 0}`
  )

  const pageGroups = resolvedIdentityGroups.slice(skip, skip + limit)
  const metas = await mapLimit(pageGroups, 6, async (group) => {
    const availability = group.bestAvailability
    const sportsMetaResolution = group.sportsMetaResolution || {}
    const canonicalIdentity = sportsMetaResolution.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED
      ? (sportsMetaResolution.canonical || null)
      : null
    const canonicalEvent = canonicalIdentity?.event || {}
    const sportsArtwork = canonicalIdentity?.sportsArtwork || null
    const parsedSportsEvent = group.parsedSportsEvent || availability?.parsedSportsEvent || null
    const displaySportsEvent = group.displaySportsEvent || parsedSportsEvent || null
    const parsedEvent = group.parsedEvent || availability?.parsedEvent || null
    const effectiveLeagueCode = parsedSportsEvent?.league || displaySportsEvent?.league || parsedEvent?.league || ''
    const fallbackLeague = normalizeLeagueLabel(group.mappedLeague || availability?.mappedLeague || mapLeague(effectiveLeagueCode) || effectiveLeagueCode)
    const fallbackDisplayTitle = group.fallbackDisplayTitle || normalizeSportsEventTitle(availability?.title, displaySportsEvent, parsedEvent) || cleanTitle(availability?.title) || availability?.title
    const displayTitle = canonicalEvent?.name || canonicalEvent?.title || fallbackDisplayTitle
    const resolvedSportHint = resolveSportHint({
      explicitHint: canonicalEvent?.sport || (effectiveLeagueCode ? (sportHintFromLeagueCode(effectiveLeagueCode) || availability?.sportHint) : availability?.sportHint),
      categoryHint: requestedSportHint,
      title: canonicalEvent?.title || availability?.title || displayTitle
    })
    const eventDate = String(canonicalEvent?.date || sportsArtwork?.eventDate || parsedSportsEvent?.date || parsedEvent?.date || '').trim()
    const league = String(canonicalEvent?.league || sportsArtwork?.league || fallbackLeague || parsedSportsEvent?.league || parsedEvent?.league || '').trim()
    const fallbackHomeTeam = displaySportsEvent?.homeTeam || parsedSportsEvent?.homeTeam || ''
    const fallbackAwayTeam = displaySportsEvent?.awayTeam || parsedSportsEvent?.awayTeam || ''
    const fallbackEventName = parsedEvent?.eventName || ''
    const canonicalCatalogIdForArtwork = String(sportsMetaResolution?.canonicalId || '').trim()
    const normalizedSportsEvent = normalizeSportsEventMetadata({
      canonicalId: canonicalCatalogIdForArtwork,
      canonicalEvent,
      parsedSportsEvent: displaySportsEvent || parsedSportsEvent,
      parsedEvent,
      sportHint: resolvedSportHint,
      competition: league,
      eventTitle: displayTitle,
      date: eventDate,
      seeders: availability.seeders,
      size: formatSize(availability.size),
      rawTitle: availability?.title || '',
      source: canonicalIdentity ? 'sportsmeta' : 'prowlarr'
    })
    const descriptionParts = [
      `${availability.seeders} seeders`,
      formatSize(availability.size),
      `${group.availabilityCount} source${group.availabilityCount === 1 ? '' : 's'}`
    ]
    if (eventDate) descriptionParts.push(eventDate)
    if (league) descriptionParts.push(league)
    const descriptionLines = buildSportsCatalogDescription({
      sportHint: resolvedSportHint || normalizedSportsEvent.sport,
      league: normalizedSportsEvent.competition || league,
      eventTitle: normalizedSportsEvent.eventTitle || displayTitle,
      eventDetail: normalizedSportsEvent.eventDetail || '',
      date: normalizedSportsEvent.date || eventDate,
      homeTeam: normalizedSportsEvent.homeTeam || fallbackHomeTeam,
      awayTeam: normalizedSportsEvent.awayTeam || fallbackAwayTeam,
      seeders: availability.seeders,
      size: formatSize(availability.size),
      sourceCount: group.availabilityCount,
      indexer: availability?.trackerSource?.indexer || availability?.indexer || ''
    })

    const carriedEventClass = availability.eventClass || availability.sportsProfile?.event_class || ''
    const classifiedArtworkEventClass = classifySportsEvent({
      sportHint: resolvedSportHint || normalizedSportsEvent.sport,
      sport: normalizedSportsEvent.sport,
      competition: normalizedSportsEvent.competition || league,
      league: normalizedSportsEvent.competition || league,
      eventTitle: normalizedSportsEvent.eventTitle || displayTitle,
      eventDetail: normalizedSportsEvent.eventDetail || '',
      homeTeam: normalizedSportsEvent.homeTeam || fallbackHomeTeam,
      awayTeam: normalizedSportsEvent.awayTeam || fallbackAwayTeam,
      rawTitle: normalizedSportsEvent.rawTitle || availability?.title || displayTitle
    })
    const artworkEventClass = classifiedArtworkEventClass === 'team_vs_team'
      ? 'team_vs_team'
      : (carriedEventClass || classifiedArtworkEventClass)

    const artworkInput = {
      baseUrl: addonBaseUrl,
      sportsmetaBaseUrl: config?.sportsmetaBaseUrl,
      sportsPosterTemplate: config?.sportsPosterTemplate,
      entitlementSource: config?.entitlementSource,
      entitlementOwnerEmailHash: config?.entitlementOwnerEmailHash,
      canonicalId: sportsMetaResolution?.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED
        ? canonicalCatalogIdForArtwork
        : '',
      sportHint: resolvedSportHint || normalizedSportsEvent.sport,
      league: normalizedSportsEvent.competition || league,
      title: normalizedSportsEvent.eventTitle || displayTitle,
      homeTeam: normalizedSportsEvent.homeTeam || fallbackHomeTeam,
      awayTeam: normalizedSportsEvent.awayTeam || fallbackAwayTeam,
      eventDetail: normalizedSportsEvent.eventDetail || '',
      eventClass: artworkEventClass,
      date: normalizedSportsEvent.date || eventDate,
      seeders: normalizedSportsEvent.seeders,
      size: normalizedSportsEvent.size,
      rawTitle: normalizedSportsEvent.rawTitle,
      source: normalizedSportsEvent.source
    }
    const posterResolved = resolveSportsPosterAsset(artworkInput)
    const { poster: posterUrl, posterShape } = posterResolved
    const landscapeUrl = resolveSportsLandscapeAsset(artworkInput)
    const backgroundUrl = resolveSportsBackgroundAsset(artworkInput)
    const logoUrl = resolveSportsLogoAsset(artworkInput)
    const catalogPosterUrl = posterUrl
    const catalogPosterShape = posterShape || 'poster'
    console.log(
      `[sports-artwork-select] id="${sportsMetaResolution?.canonicalId || 'fallback'}" selectedArtworkSource=${posterResolved.selectedArtworkSource || ''} layoutFamily=${posterResolved.layoutFamily || ''} posterUrl="${redactArtworkUrl(posterUrl)}" backdropUrl="${redactArtworkUrl(landscapeUrl || backgroundUrl)}" fallbackReason="${sportsMetaResolution?.reason || ''}"`
    )
    const availabilityAnchorKey = setSportsAvailabilityAnchor({
      ...(availability.trackerSource || availability),
      sourceCount: group.availabilityCount,
      eventDate,
      league,
      sportHint: resolvedSportHint || normalizedSportsEvent.sport,
      homeTeam: normalizedSportsEvent.homeTeam || fallbackHomeTeam,
      awayTeam: normalizedSportsEvent.awayTeam || fallbackAwayTeam,
      title: availability?.trackerSource?.title || availability?.title || displayTitle
    })
    const canonicalCatalogId = String(sportsMetaResolution?.canonicalId || '').trim()
    if (
      sportsMetaResolution.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED &&
      canonicalCatalogId &&
      availabilityAnchorKey
    ) {
      setSportsAvailabilityCanonicalAnchor(canonicalCatalogId, availabilityAnchorKey)
    }

    const catalogDescription = descriptionLines.join('\n') || descriptionParts.join(' | ')

    return {
      id: (
        sportsMetaResolution.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED &&
        canonicalCatalogId
      )
        ? canonicalCatalogId
        : encodeCustomId({
            y: mediaType,
            k: 'sports',
            n: displayTitle,
            t: displayTitle,
            s: availability.size,
            d: availability.seeders,
            p: availability.pubDate || '',
            c: group.availabilityCount,
            e: eventDate,
            r: resolvedSportHint,
            g: league,
            j: normalizedSportsEvent.eventDetail || '',
            u: parsedSportsEvent?.league || parsedEvent?.league || '',
            o: canonicalEvent?.homeTeam || fallbackHomeTeam || '',
            w: canonicalEvent?.awayTeam || fallbackAwayTeam || '',
            v: String(canonicalEvent?.eventId || sportsArtwork?.eventId || '').trim(),
            x: canonicalCatalogId,
            q: String(sportsMetaResolution?.status || SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY),
            ak: availabilityAnchorKey,
            ec: artworkEventClass
          }, {
            compress: true,
            compact: 'sports'
          }),
      type: mediaType,
      name: displayTitle,
      description: catalogDescription,
      overview: catalogDescription,
      poster: catalogPosterUrl,
      background: landscapeUrl || backgroundUrl || undefined,
      logo: logoUrl || undefined,
      releaseInfo: eventDate || undefined,
      posterShape: catalogPosterShape,
      ...(posterResolved.layoutFamily ? { layoutFamily: posterResolved.layoutFamily } : {}),
      ...(posterResolved.layoutFamily ? {
        sportsArtwork: {
          layoutFamily: posterResolved.layoutFamily,
          posterTemplate: posterResolved.selectedTemplate || config?.sportsPosterTemplate || '',
          eventClass: artworkInput.eventClass || '',
          resolutionStatus: String(sportsMetaResolution?.status || SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY)
        }
      } : {})
    }
  })

  return { metas, cacheMaxAge: SPORTS_CATALOG_CACHE_MAX_AGE }
}

async function moviesCatalog(config, extra) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const query = String(extra.search || '').trim()
  const limit = getCatalogLimit(config)
  const items = await cachedProwlarrSearch(config, torznab, query, MOVIE_CATS)
  const skip = parseInt(extra.skip || '0', 10)
  const filtered = items.filter(item =>
    item.imdbId &&
    !isSportsOnlyIndexer(item.indexer) &&
    !isLikelySeriesRelease(item.title) &&
    !isLikelyPackedReleaseTitle(item.title)
  )
  if (filtered.length === 0) {
    const placeholder = await maybeBuildSetupRequiredCatalog(config, torznab, 'movie', 'PVTKRRX Movies', skip)
    if (placeholder) {
      return { metas: [placeholder], cacheMaxAge: 120 }
    }
  }
  const best = dedupeByImdbBest(filtered, query)
  const inspectCount = Math.min(best.length, Math.max(80, (parseInt(extra.skip || '0', 10) + limit) * 3))
  const enriched = await enrichImdbEntries('movie', best, {
    inspectCount,
    requirePoster: !query
  })

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
  const skip = parseInt(extra.skip || '0', 10)
  const filtered = items.filter(item =>
    !isSportsOnlyIndexer(item.indexer) &&
    (isLikelySeriesRelease(item.title) || Boolean(extra.search)) &&
    !isLikelyPackedReleaseTitle(item.title)
  )
  if (filtered.length === 0) {
    const placeholder = await maybeBuildSetupRequiredCatalog(config, torznab, 'series', 'PVTKRRX TV', skip)
    if (placeholder) {
      return { metas: [placeholder], cacheMaxAge: 120 }
    }
  }

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
