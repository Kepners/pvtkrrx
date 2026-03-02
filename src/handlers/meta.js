const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { formatSize } = require('../utils/streams')
const { makeSportsThumbUrl } = require('../utils/sportsThumb')
const { resolveSportHint } = require('../utils/sportsRules')
const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'

function normalizeImdbId(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^tt(\d{5,10})$/i)
  if (!m) return raw
  return `tt${m[1].padStart(7, '0')}`
}

async function handleMeta(config, type, id, context = {}) {
  try {
    // Custom ID (sports, library)
    if (id.startsWith('pvtkrrx:')) {
      return await handleCustomMeta(config, id, context)
    }

    // IMDb ID — proxy to Cinemeta
    if (id.startsWith('tt')) {
      const cinemeta = new CinemetaClient()
      const canonicalId = normalizeImdbId(id)
      const meta = type === 'series'
        ? await cinemeta.getSeries(canonicalId)
        : await cinemeta.getMovie(canonicalId)
      if (meta && !meta.id) meta.id = id
      return { meta }
    }

    return { meta: null }
  } catch (err) {
    return { meta: null }
  }
}

async function handleCustomMeta(config, id, context = {}) {
  const encoded = id.replace('pvtkrrx:', '')
  const info = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  const baseUrl = String(context.baseUrl || '').replace(/\/+$/, '')
  const imdbId = normalizeImdbId(String(info.m || '').trim())
  let sportsArtwork = null
  const carriedArtwork = String(info.a || '').trim()
  const carriedBackground = String(info.b || '').trim()
  const carriedEventDate = String(info.e || '').trim()
  const carriedLeague = String(info.g || '').trim()
  const carriedSportHint = String(info.r || '').trim()
  const carriedEventId = String(info.v || '').trim()
  const resolvedSportHint = resolveSportHint({
    explicitHint: carriedSportHint,
    title: info.t
  })
  const isSports = String(info.k || '').toLowerCase() === 'sports' || Boolean(resolvedSportHint)
  const shouldLookupSportsArtwork = isSports && (!carriedArtwork || !carriedEventDate || !carriedLeague || !carriedBackground)
  if (shouldLookupSportsArtwork) {
    try {
      const sportsDb = new SportsDbClient(config?.sportsDbApiKey, {
        cacheHours: config?.sportsDbCacheHours
      })
      sportsArtwork = await sportsDb.getEventArtwork({
        title: info.t,
        publishDate: info.p,
        sportHint: resolvedSportHint,
        eventId: carriedEventId
      })
    } catch (_) {
      sportsArtwork = null
    }
  }

  if (!isSports && /^tt\d{7,10}$/i.test(imdbId)) {
    try {
      const cinemeta = new CinemetaClient()
      const cmeta = String(info.y || '').toLowerCase() === 'series'
        ? await cinemeta.getSeries(imdbId)
        : await cinemeta.getMovie(imdbId)
      if (cmeta) {
        const poster = carriedArtwork || String(info.a || '').trim() || String(cmeta.poster || '').trim() || BRAND_POSTER
        const background = String(info.b || '').trim() || String(cmeta.background || '').trim() || poster
        return {
          meta: {
            ...cmeta,
            id,
            type: String(info.y || cmeta.type || 'movie'),
            name: String(info.n || cmeta.name || info.t || '').trim() || String(cmeta.name || ''),
            poster,
            background
          }
        }
      }
    } catch (_) {
      // fall through to generic custom-meta response
    }
  }

  const posterFallback = isSports && baseUrl
    ? makeSportsThumbUrl(baseUrl, { title: info.t, publishDate: info.p, sportHint: resolvedSportHint })
    : BRAND_POSTER
  const poster = carriedArtwork || sportsArtwork?.poster || sportsArtwork?.image || posterFallback
  const background = carriedBackground || String(sportsArtwork?.backgroundImage || sportsArtwork?.image || '').trim() || poster

  const descriptionParts = [
    `${info.d} seeders`,
    formatSize(info.s)
  ]
  if (Number.isFinite(Number(info.c)) && Number(info.c) > 0) {
    const count = Number(info.c)
    descriptionParts.push(`${count} source${count === 1 ? '' : 's'}`)
  }
  const eventDate = carriedEventDate || sportsArtwork?.eventDate || ''
  const league = carriedLeague || sportsArtwork?.league || ''
  if (eventDate) descriptionParts.push(eventDate)
  if (league) descriptionParts.push(league)

  const meta = {
    id,
    type: String(info.y || 'movie'),
    name: String(info.n || info.t || '').trim() || String(info.t || ''),
    description: descriptionParts.join(' | '),
    poster,
    background
  }
  if (eventDate) meta.releaseInfo = eventDate
  return { meta }
}

module.exports = { handleMeta }
