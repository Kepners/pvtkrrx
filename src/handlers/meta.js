const { CinemetaClient } = require('../clients/cinemeta')
const { SportsDbClient } = require('../clients/sportsdb')
const { formatSize } = require('../utils/streams')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { decodeCustomId } = require('../utils/customId')
const { BRAND_ARTWORK, buildMetaPlaceholder } = require('../utils/metaPlaceholder')
const {
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLogoAsset
} = require('../utils/sportsArtwork')
const BRAND_POSTER = BRAND_ARTWORK
const BRAND_LOGO = BRAND_ARTWORK

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

    return {
      meta: buildMetaPlaceholder({
        id,
        type,
        description: 'PVTKRRX could not resolve metadata for this item.'
      })
    }
  } catch (err) {
    console.error(`[meta] ERROR type=${type} id=${id}: ${err.message}`)
    return {
      meta: buildMetaPlaceholder({
        id,
        type,
        description: 'PVTKRRX hit a metadata error while loading this item.'
      })
    }
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

  const artworkInput = {
    baseUrl,
    title: String(info.t || info.n || '').trim(),
    displayTitle: String(info.n || info.t || '').trim() || String(info.t || ''),
    publishDate: info.p,
    sportHint: resolvedSportHint,
    league: carriedLeague || sportsArtwork?.league || carriedLeagueCode,
    eventName: sportsArtwork?.eventName || '',
    homeTeam: carriedHomeTeam || sportsArtwork?.homeTeam || '',
    awayTeam: carriedAwayTeam || sportsArtwork?.awayTeam || '',
    carriedArtwork,
    carriedBackground,
    carriedLogo,
    sportsArtwork
  }
  const posterResolved = isSports
    ? resolveSportsPosterAsset(artworkInput)
    : { poster: carriedArtwork || BRAND_POSTER, posterShape: undefined }
  const backgroundResolved = isSports
    ? resolveSportsBackgroundAsset(artworkInput)
    : (String(info.b || '').trim() || BRAND_POSTER)
  const logoResolved = isSports
    ? resolveSportsLogoAsset(artworkInput)
    : carriedLogo
  const poster = String(posterResolved?.poster || '').trim() || BRAND_POSTER
  const background = String(backgroundResolved || '').trim() || poster
  const logo = String(logoResolved || '').trim() || BRAND_LOGO
  const posterShape = isSports ? posterResolved?.posterShape : undefined

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
