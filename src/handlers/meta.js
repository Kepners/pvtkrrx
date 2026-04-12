const { CinemetaClient } = require('../clients/cinemeta')
const { SportsMetaClient } = require('../clients/sportsmeta')
const { formatSize } = require('../utils/streams')
const { resolveSportHint } = require('../utils/sportsRules')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { decodeCustomId } = require('../utils/customId')
const { mapLeague } = require('../utils/leagueMap')
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

async function loadCanonicalSportsMeta(config = {}, canonicalId = '') {
  const normalizedId = String(canonicalId || '').trim()
  if (!normalizedId) return null

  const client = new SportsMetaClient({
    baseUrl: config?.sportsmetaBaseUrl
  })

  try {
    return await client.getEvent(normalizedId)
  } catch (error) {
    console.warn(`[meta] SportsMeta lookup failed for ${normalizedId}: ${error.message}`)
    return null
  }
}

function buildCanonicalSportsMetaResponse(canonical = {}, requestedId, baseUrl) {
  const canonicalEvent = canonical?.event || {}
  const sportsArtwork = canonical?.sportsArtwork || null
  const sportHint = resolveSportHint({
    explicitHint: canonicalEvent?.sport,
    title: canonicalEvent?.title || canonicalEvent?.name
  })
  const league = String(canonicalEvent?.league || '').trim()
  const eventDate = String(canonicalEvent?.date || '').trim()
  const displayTitle = String(canonicalEvent?.name || canonicalEvent?.title || requestedId).trim() || requestedId
  const artworkInput = {
    baseUrl,
    artworkMode: 'svg',
    title: canonicalEvent?.title || displayTitle,
    displayTitle,
    publishDate: eventDate,
    sportHint,
    league,
    eventName: canonicalEvent?.title || canonicalEvent?.name || '',
    homeTeam: canonicalEvent?.homeTeam || '',
    awayTeam: canonicalEvent?.awayTeam || '',
    sportsArtwork
  }
  const posterResolved = resolveSportsPosterAsset(artworkInput)
  const backgroundResolved = resolveSportsBackgroundAsset(artworkInput)
  const logoResolved = resolveSportsLogoAsset(artworkInput)
  const poster = String(posterResolved?.poster || '').trim() || BRAND_POSTER
  const background = String(backgroundResolved || '').trim() || poster
  const logo = String(logoResolved || '').trim() || BRAND_LOGO
  const meta = {
    id: requestedId,
    type: String(canonicalEvent?.type || 'movie').trim() || 'movie',
    name: displayTitle,
    description: String(canonicalEvent?.description || '').trim(),
    poster,
    background,
    logo
  }
  if (posterResolved?.posterShape) meta.posterShape = posterResolved.posterShape
  const genres = buildSportsGenres(sportHint, league)
  if (genres.length > 0) meta.genres = genres
  if (eventDate) meta.releaseInfo = eventDate
  if (sportHint) meta.runtime = formatSportGenreLabel(sportHint)
  return { meta }
}

async function handleMeta(config, type, id, context = {}) {
  try {
    const baseUrl = String(context.baseUrl || '').replace(/\/+$/, '')

    // Custom ID (sports, library)
    if (id.startsWith('pvtkrrx:')) {
      return await handleCustomMeta(config, id, context)
    }

    if (id.startsWith('sportsmeta:')) {
      const canonical = await loadCanonicalSportsMeta(config, id)
      if (canonical) {
        return buildCanonicalSportsMetaResponse(canonical, id, baseUrl)
      }
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
  const carriedArtwork = String(info.a || '').trim()
  const carriedBackground = String(info.b || '').trim()
  const carriedLogo = String(info.z || '').trim()
  const carriedEventDate = String(info.e || '').trim()
  const carriedLeague = String(info.g || '').trim()
  const carriedLeagueCode = String(info.u || '').trim()
  const carriedHomeTeam = String(info.o || '').trim()
  const carriedAwayTeam = String(info.w || '').trim()
  const carriedSportHint = String(info.r || '').trim()
  const canonicalId = String(info.x || '').trim()
  const resolutionStatus = String(info.q || '').trim()
  const normalizedCarriedLeague = String(carriedLeague || mapLeague(carriedLeagueCode) || carriedLeagueCode).trim()
  const isSports = String(info.k || '').toLowerCase() === 'sports' || Boolean(carriedSportHint) || Boolean(canonicalId)
  const canonicalSportsMeta = isSports && canonicalId && resolutionStatus === 'resolved'
    ? await loadCanonicalSportsMeta(config, canonicalId)
    : null
  const canonicalEvent = canonicalSportsMeta?.event || {}
  const sportsArtwork = canonicalSportsMeta?.sportsArtwork || null
  const resolvedSportHint = resolveSportHint({
    explicitHint: canonicalEvent?.sport || carriedSportHint,
    title: canonicalEvent?.title || canonicalEvent?.name || info.t
  })

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

  const displayTitle = String(canonicalEvent?.name || canonicalEvent?.title || info.n || info.t || '').trim() || String(info.t || '')
  const eventDate = String(canonicalEvent?.date || carriedEventDate || sportsArtwork?.eventDate || '').trim()
  const league = String(canonicalEvent?.league || normalizedCarriedLeague || sportsArtwork?.league || '').trim()
  const homeTeam = String(canonicalEvent?.homeTeam || carriedHomeTeam || sportsArtwork?.homeTeam || '').trim()
  const awayTeam = String(canonicalEvent?.awayTeam || carriedAwayTeam || sportsArtwork?.awayTeam || '').trim()
  const eventName = String(canonicalEvent?.title || canonicalEvent?.name || sportsArtwork?.eventName || '').trim()

  const artworkInput = {
    baseUrl,
    artworkMode: 'svg',
    title: String(canonicalEvent?.title || info.t || info.n || '').trim(),
    displayTitle,
    publishDate: info.p,
    sportHint: resolvedSportHint,
    league,
    eventName,
    homeTeam,
    awayTeam,
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

  const sportsGenres = isSports ? buildSportsGenres(resolvedSportHint, league) : []

  const descriptionLines = []
  if (isSports) {
    const canonicalDescription = String(canonicalEvent?.description || '').trim()
    if (canonicalDescription) {
      for (const line of canonicalDescription.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
        if (!descriptionLines.includes(line)) descriptionLines.push(line)
      }
    } else {
      if (eventName && eventName !== displayTitle) descriptionLines.push(eventName)
      if (league && !descriptionLines.some(line => line.includes(league))) descriptionLines.push(league)
      if (eventDate) descriptionLines.push(`Date: ${eventDate}`)
      if (homeTeam && awayTeam) {
        descriptionLines.push(`${homeTeam} vs ${awayTeam}`)
      }
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

  const meta = {
    id,
    type: String(info.y || 'movie'),
    name: displayTitle,
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
