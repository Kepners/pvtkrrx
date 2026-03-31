const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { formatSize } = require('../utils/streams')
const { makeSportsThumbUrl, makeSportsPosterUrl } = require('../utils/sportsThumb')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { decodeCustomId } = require('../utils/customId')
const { proxySportsImageUrl } = require('../utils/sportsImageCache')
const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'
const BRAND_LOGO = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'

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
  const carriedLogo = String(info.z || '').trim()
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
  const shouldLookupSportsArtwork = isSports && (!carriedArtwork || !carriedEventDate || !carriedLeague || !carriedBackground || !carriedLogo)
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
        const logo = carriedLogo || String(cmeta.logo || '').trim() || BRAND_LOGO
        return {
          meta: {
            ...cmeta,
            id,
            type: String(info.y || cmeta.type || 'movie'),
            name: String(info.n || cmeta.name || info.t || '').trim() || String(cmeta.name || ''),
            poster,
            background,
            logo
          }
        }
      }
    } catch (_) {
      // fall through to generic custom-meta response
    }
  }

  const generatedArtworkItem = {
    title: String(info.n || info.t || '').trim() || String(info.t || ''),
    publishDate: info.p,
    sportHint: resolvedSportHint,
    league: carriedLeague || carriedLeagueCode
  }
  const posterFallback = isSports && baseUrl
    ? makeSportsPosterUrl(baseUrl, generatedArtworkItem)
    : BRAND_POSTER
  const backgroundFallback = isSports && baseUrl
    ? makeSportsThumbUrl(baseUrl, generatedArtworkItem, 'background')
    : posterFallback
  const portraitPosterUrl = String(sportsArtwork?.poster || '').trim()
  const landscapePosterUrl = String(sportsArtwork?.image || sportsArtwork?.landscapeImage || '').trim()
  const posterSourceUrl = carriedArtwork || portraitPosterUrl || landscapePosterUrl
  const backgroundSourceUrl = carriedBackground || String(sportsArtwork?.backgroundImage || sportsArtwork?.landscapeImage || sportsArtwork?.image || '').trim()
  const logoSourceUrl = carriedLogo || String(sportsArtwork?.logo || '').trim()
  const poster = (isSports
    ? proxySportsImageUrl(baseUrl, posterSourceUrl, carriedArtwork || portraitPosterUrl ? 'poster' : 'landscape')
    : '') || posterSourceUrl || posterFallback
  const background = (isSports
    ? proxySportsImageUrl(baseUrl, backgroundSourceUrl, 'background')
    : '') || backgroundSourceUrl || backgroundFallback || poster
  const logo = (isSports
    ? proxySportsImageUrl(baseUrl, logoSourceUrl, 'logo')
    : '') || logoSourceUrl || BRAND_LOGO
  const posterShape = isSports
    ? ((carriedArtwork || portraitPosterUrl || poster === posterFallback) ? 'poster' : 'landscape')
    : undefined

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
    background,
    logo
  }
  if (posterShape) meta.posterShape = posterShape
  if (sportsGenres.length > 0) meta.genres = sportsGenres
  if (eventDate) meta.releaseInfo = eventDate
  if (isSports && resolvedSportHint) {
    meta.runtime = formatSportGenreLabel(resolvedSportHint)
  }
  return { meta }
}

module.exports = { handleMeta }
