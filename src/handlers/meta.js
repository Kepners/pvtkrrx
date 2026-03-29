const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { formatSize } = require('../utils/streams')
const { makeSportsThumbUrl } = require('../utils/sportsThumb')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { decodeCustomId } = require('../utils/customId')
const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'

function formatSportGenreLabel(value) {
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
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function buildSportsGenres(sportHint, league) {
  const genres = []
  const primary = formatSportGenreLabel(sportHint)
  const leagueLabel = String(league || '').trim()

  if (primary) genres.push(primary)
  if (leagueLabel && !genres.some(value => value.toLowerCase() === leagueLabel.toLowerCase())) {
    genres.push(leagueLabel)
  }

  return genres
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
    console.error(`[meta] ERROR type=${type} id=${id}: ${err.message}`)
    return { meta: null }
  }
}

async function handleCustomMeta(config, id, context = {}) {
  const info = decodeCustomId(id)
  const baseUrl = String(context.baseUrl || '').replace(/\/+$/, '')
  const imdbId = normalizeImdbId(String(info.m || '').trim())
  let sportsArtwork = null
  const carriedArtwork = String(info.a || '').trim()
  const carriedBackground = String(info.b || '').trim()
  const carriedEventDate = String(info.e || '').trim()
  const carriedLeague = String(info.g || '').trim()
  const carriedLeagueCode = String(info.u || '').trim()
  const carriedHomeTeam = String(info.o || '').trim()
  const carriedAwayTeam = String(info.w || '').trim()
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
        eventId: carriedEventId,
        league: carriedLeagueCode || carriedLeague,
        date: carriedEventDate,
        homeTeam: carriedHomeTeam,
        awayTeam: carriedAwayTeam
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

  const eventDate = carriedEventDate || sportsArtwork?.eventDate || ''
  const league = carriedLeague || sportsArtwork?.league || ''
  const sportsGenres = isSports ? buildSportsGenres(resolvedSportHint, league) : []

  // Build a rich description for sports detail pages
  const descriptionLines = []
  if (isSports) {
    const eventName = sportsArtwork?.eventName || ''
    if (eventName) descriptionLines.push(eventName)
    if (league && !descriptionLines.some(line => line.includes(league))) descriptionLines.push(league)
    if (eventDate) descriptionLines.push(`Date: ${eventDate}`)
    if (carriedHomeTeam && carriedAwayTeam) {
      descriptionLines.push(`${carriedHomeTeam} vs ${carriedAwayTeam}`)
    }
  }
  const statParts = []
  if (Number(info.d) > 0) statParts.push(`${info.d} seeders`)
  if (Number(info.s) > 0) statParts.push(formatSize(info.s))
  if (Number.isFinite(Number(info.c)) && Number(info.c) > 0) {
    const count = Number(info.c)
    statParts.push(`${count} source${count === 1 ? '' : 's'}`)
  }
  if (statParts.length > 0) descriptionLines.push(statParts.join(' | '))
  const description = descriptionLines.filter(Boolean).join('\n') || statParts.join(' | ')

  const displayName = String(info.n || info.t || '').trim() || String(info.t || '')

  const meta = {
    id,
    type: String(info.y || 'movie'),
    name: displayName,
    description,
    poster,
    background
  }
  if (sportsGenres.length > 0) meta.genres = sportsGenres
  if (eventDate) meta.releaseInfo = eventDate
  if (isSports && resolvedSportHint) {
    meta.runtime = formatSportGenreLabel(resolvedSportHint)
  }
  return { meta }
}

module.exports = { handleMeta }
