const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { cleanTitle } = require('../utils/parser')
const { formatSize } = require('../utils/streams')
const { makeSportsThumbUrl } = require('../utils/sportsThumb')

const SPORTS_ONLY_INDEXERS = new Set([
  'sportscult',
  'beyondhd-sports',
  'tvvault-sports'
])
const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'
const cinemeta = new CinemetaClient()
const cinemetaCache = new Map()

function isSportsOnlyIndexer(indexerName) {
  const normalized = String(indexerName || '').trim().toLowerCase()
  if (SPORTS_ONLY_INDEXERS.has(normalized)) return true
  return normalized.includes('sportscult')
}

function isLikelySportsTitle(title) {
  const t = String(title || '').toLowerCase()
  return /\b(epl|premier league|la liga|serie a|bundesliga|champions league|football|soccer|f1|formula[\s-]?1|grand prix|ufc|mma|boxing|nba|wnba|nfl|mlb|nhl|cricket|ipl|rugby|tennis|wta|atp|olympic|motogp|wwe)\b/.test(t)
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

async function handleCatalog(config, type, id, extraStr, context = {}) {
  try {
    const extra = parseExtra(extraStr)
    const opts = {
      baseUrl: String(context.baseUrl || '').replace(/\/+$/, '')
    }

    switch (id) {
      case 'pvtkrrx-sports':
        return await sportsCatalog(config, extra, opts)
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
    return { metas: [] }
  }
}

async function sportsCatalog(config, extra, options = {}) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const query = extra.genre || extra.search || ''
  const limit = getCatalogLimit(config)
  const items = query
    ? await torznab.search(query, SPORT_CATS)
    : await torznab.search('', SPORT_CATS)
  const filtered = items.filter(item => isSportsOnlyIndexer(item.indexer) || isLikelySportsTitle(item.title))
  const sorted = filtered.sort((a, b) => compareItems(a, b, query))

  const skip = parseInt(extra.skip || '0', 10)
  const metas = sorted.slice(skip, skip + limit).map(item => ({
    id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
      y: 'tv',
      t: item.title,
      h: item.infohash,
      l: item.link,
      i: item.indexer,
      s: item.size,
      d: item.seeders,
      p: item.publishDate || ''
    })).toString('base64url'),
    type: 'tv',
    name: item.title,
    description: `${item.seeders} seeders | ${formatSize(item.size)}`,
    poster: item.imdbId
      ? (imdbPoster(item.imdbId) || placeholderPoster())
      : makeSportsThumbUrl(options.baseUrl, item),
    posterShape: 'landscape'
  }))

  return { metas, cacheMaxAge: 120 }
}

async function moviesCatalog(config, extra) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const query = String(extra.search || '').trim()
  const limit = getCatalogLimit(config)
  const items = extra.search
    ? await torznab.search(extra.search, MOVIE_CATS)
    : await torznab.search('', MOVIE_CATS)
  const filtered = items.filter(item =>
    item.imdbId &&
    !isSportsOnlyIndexer(item.indexer) &&
    !isLikelySeriesRelease(item.title)
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
  const items = extra.search
    ? await torznab.search(extra.search, TV_CATS)
    : await torznab.search('', TV_CATS)
  const filtered = items.filter(item =>
    item.imdbId &&
    !isSportsOnlyIndexer(item.indexer) &&
    (isLikelySeriesRelease(item.title) || Boolean(extra.search))
  )
  const best = dedupeByImdbBest(filtered, query)
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

  const metas = filtered.slice(skip, skip + limit).map(t => ({
    id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
      y: 'movie',
      t: t.name,
      h: t.hash,
      s: t.size,
      d: 0
    })).toString('base64url'),
    type: 'movie',
    name: cleanTitle(t.name),
    description: formatSize(t.size),
    poster: placeholderPoster()
  }))

  return { metas, cacheMaxAge: 300 }
}

module.exports = { handleCatalog, parseExtra }
