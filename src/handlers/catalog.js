const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { cleanTitle, isLikelyPackedReleaseTitle } = require('../utils/parser')
const { isSportsTitle } = require('../utils/sportClassifier')
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
  return isSportsTitle(title)
}

function isLikelySportsNoiseTitle(title) {
  const value = String(title || '')
  return (
    /\bS\d{1,2}E\d{1,3}\b/i.test(value) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(value) ||
    /\bSeason[\s._-]*\d{1,2}\b/i.test(value) ||
    /\b(?:ebook|e[\s.\-_]*book|audiobook|retail|node|novel)\b/i.test(value) ||
    /\b(?:update|patch|trainer|unlocker|dlc|mod|manager)\b/i.test(value) ||
    /\b(?:tutorial|how[\s.\-_]*to|guide)\b/i.test(value)
  )
}

function isLikelySportsEventRelease(title) {
  const value = String(title || '')
  if (isLikelySportsNoiseTitle(value)) return false

  const hasVersus = /\b(?:vs\.?|v)\b/i.test(value)
  const hasDate = (
    /\b(?:19|20)\d{2}[.\-_\s]\d{2}[.\-_\s]\d{2}\b/i.test(value) ||
    /\b\d{2}[.\-_\s]\d{2}[.\-_\s](?:19|20)\d{2}\b/i.test(value) ||
    /\b(?:19|20)\d{2}\d{2}\d{2}\b/i.test(value)
  )
  const combatEvent = /\b(?:ufc|bellator|pfl|one[\s.\-_]*championship|fight[\s.\-_]*night|main[\s.\-_]*card|prelims?|wwe|aew|smackdown|raw|wrestlemania|royal[\s.\-_]*rumble)\b/i.test(value)
  const motorsportEvent = /\b(?:f1|formula[\s.\-_]*1|motogp|indycar|nascar|wrc|grand[\s.\-_]*prix|gp)\b/i.test(value)
  const leagueEvent = /\b(?:nba|nfl|mlb|nhl|epl|premier[\s.\-_]*league|la[\s.\-_]*liga|serie[\s.\-_]*a|bundesliga|uefa|champions[\s.\-_]*league|ncaa)\b/i.test(value)
  const tournamentEvent = /\b(?:open|masters|cup|championship|playoffs?|qualifier|quarter[\s.\-_]*final|semi[\s.\-_]*final|final|round[\s.\-_]*\d+|\br\d{1,2}\b)\b/i.test(value)

  if (hasVersus || combatEvent) return true
  if (hasDate && (motorsportEvent || leagueEvent || tournamentEvent)) return true
  return false
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

function normalizeImdbId(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^tt(\d{5,10})$/i)
  if (!m) return ''
  return `tt${m[1].padStart(7, '0')}`
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

function normalizeSportsEventTitle(title) {
  return cleanTitle(title)
    .replace(/\butd\b/gi, 'united')
    .replace(/\b\d{3,4}p\d*\b/gi, ' ')
    .replace(/\b(?:mini|full|extended|highlights?|replay|pre[\s.\-_]*match|post[\s.\-_]*match|match)\b/gi, ' ')
    .replace(/\b(?:web[\s.\-_]*dl|webrip|hdtv|h264|h265|x264|x265|hevc|aac|ac3|ddp|multi|english|en|skynz|fubo)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sportsEventKey(title) {
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
    const display = normalizeSportsEventTitle(item.title) || cleanTitle(item.title) || String(item.title || '').trim()
    if (!display) continue
    const baseKey = sportsEventKey(item.title)
    const key = `${baseKey}|${getSportsVariantTag(item.title)}`
    const current = groups.get(key)
    if (!current) {
      groups.set(key, { display, baseKey, best: item, count: 1 })
      continue
    }
    current.count += 1
    if (compareItems(item, current.best, query) < 0) current.best = item
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

async function handleCatalog(config, type, id, extraStr, context = {}) {
  try {
    const extra = parseExtra(extraStr)
    const opts = {
      baseUrl: String(context.baseUrl || '').replace(/\/+$/, '')
    }

    switch (id) {
      case 'pvtkrrx-sports':
        return await sportsCatalog(config, extra, opts, type)
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

async function sportsCatalog(config, extra, options = {}, catalogType = 'movie') {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const sportsDb = new SportsDbClient(config.sportsDbApiKey, {
    cacheHours: config.sportsDbCacheHours
  })
  const mediaType = String(catalogType || 'movie').trim().toLowerCase() || 'movie'
  const query = extra.genre || extra.search || ''
  const limit = getCatalogLimit(config)
  const strictItems = query
    ? await torznab.search(query, SPORT_CATS, 'search', { useCategories: true })
    : await torznab.search('', SPORT_CATS, 'search', { useCategories: true })
  let items = strictItems
  if (items.length < Math.min(80, limit * 2)) {
    const broadItems = query
      ? await torznab.search(query, SPORT_CATS)
      : await torznab.search('', SPORT_CATS)
    const byKey = new Map()
    for (const item of [...strictItems, ...broadItems]) {
      const key = `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
      if (!key || byKey.has(key)) continue
      byKey.set(key, item)
    }
    items = [...byKey.values()]
  }
  const strictFiltered = items.filter(item =>
    (isSportsOnlyIndexer(item.indexer) || isLikelySportsTitle(item.title)) &&
    isLikelySportsEventRelease(item.title) &&
    !isLikelyPackedReleaseTitle(item.title)
  )
  let filtered = strictFiltered
  if (filtered.length < Math.min(12, limit) && String(extra.search || '').trim()) {
    filtered = items.filter(item =>
      (isSportsOnlyIndexer(item.indexer) || isLikelySportsTitle(item.title)) &&
      !isLikelySportsNoiseTitle(item.title) &&
      !isLikelyPackedReleaseTitle(item.title)
    )
  }
  const grouped = groupSportsItems(filtered.sort((a, b) => compareItems(a, b, query)), query)

  const skip = parseInt(extra.skip || '0', 10)
  const pageGroups = grouped.slice(skip, skip + limit)
  const sportsDbLookupLimit = Math.min(pageGroups.length, 10)
  const artworkByBaseKey = new Map()
  const metas = await mapLimit(pageGroups, 6, async (group, index) => {
    const item = group.best
    const displayTitle = group.display || cleanTitle(item.title) || item.title
    let sportsArtwork = artworkByBaseKey.get(group.baseKey) || null
    if (index < sportsDbLookupLimit) {
      try {
        if (!sportsArtwork) {
          sportsArtwork = await sportsDb.getEventArtwork({
            title: displayTitle,
            publishDate: item.pubDate
          })
        }
        if (!sportsArtwork) {
          sportsArtwork = await sportsDb.getEventArtwork(item)
        }
      } catch (_) {
        // keep fallback flow below
      }
      if (sportsArtwork && group.baseKey) {
        artworkByBaseKey.set(group.baseKey, sportsArtwork)
      }
    }

    const eventDate = String(sportsArtwork?.eventDate || '').trim()
    const league = String(sportsArtwork?.league || '').trim()
    const descriptionParts = [
      `${item.seeders} seeders`,
      formatSize(item.size),
      `${group.count} source${group.count === 1 ? '' : 's'}`
    ]
    if (eventDate) descriptionParts.push(eventDate)
    if (league) descriptionParts.push(league)

    const posterUrl = sportsArtwork?.poster || sportsArtwork?.image ||
      (item.imdbId
        ? (imdbPoster(item.imdbId) || placeholderPoster())
        : makeSportsThumbUrl(options.baseUrl, { ...item, publishDate: item.pubDate || item.publishDate || '' }))
    const backgroundUrl = sportsArtwork?.backgroundImage || posterUrl

    return {
    id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
      y: mediaType,
      k: 'sports',
      n: displayTitle,
      t: displayTitle,
      h: '',
      l: '',
      i: item.indexer,
      s: item.size,
      d: item.seeders,
      p: item.pubDate || '',
      c: group.count,
      e: eventDate,
      g: league,
      a: sportsArtwork?.poster || sportsArtwork?.image || posterUrl || '',
      b: backgroundUrl
    })).toString('base64url'),
    type: mediaType,
    name: displayTitle,
    description: descriptionParts.join(' | '),
    poster: posterUrl,
    background: backgroundUrl,
    releaseInfo: eventDate || undefined,
    posterShape: 'landscape'
  }})

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
  const items = extra.search
    ? await torznab.search(extra.search, TV_CATS)
    : await torznab.search('', TV_CATS)
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
      id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
        y: resolvedType,
        t: t.name,
        n: displayName,
        h: t.hash,
        s: t.size,
        d: 0,
        m: imdbId,
        a: poster,
        b: background
      })).toString('base64url'),
      type: resolvedType,
      name: displayName,
      description: formatSize(t.size),
      poster
    }
  })

  return { metas, cacheMaxAge: 300 }
}

module.exports = { handleCatalog, parseExtra }
