const { CinemetaClient } = require('../clients/cinemeta')
const { SportsMetaClient } = require('../clients/sportsmeta')
const { formatSize } = require('../utils/streams')
const { resolveSportHint } = require('../utils/sportsRules')
const { settleWithTimeout } = require('../utils/timeout')

const SPORTSMETA_META_TIMEOUT_MS = Math.max(500, parseInt(process.env.PVTKRRX_SPORTSMETA_META_TIMEOUT_MS || '1500', 10))
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { decodeCustomId } = require('../utils/customId')
const { mapLeague } = require('../utils/leagueMap')
const { BRAND_ARTWORK, buildMetaPlaceholder } = require('../utils/metaPlaceholder')
const {
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLandscapeAsset,
  resolveSportsLogoAsset
} = require('../utils/sportsArtwork')
const { normalizeSportsEventMetadata } = require('../utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../utils/sportsEventClassifier')
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

function pushUniqueLine(lines, value) {
  const text = String(value || '').trim()
  if (!text) return
  if (!lines.some((line) => line.toLowerCase() === text.toLowerCase())) lines.push(text)
}

function buildSportsDescriptionLines(input = {}) {
  const lines = []
  const sport = formatSportGenreLabel(input.sportHint || input.sport || '')
  const league = String(input.league || '').trim()
  const title = String(input.eventTitle || input.title || '').trim()
  const detail = String(input.eventDetail || '').trim()
  const date = String(input.date || '').trim()
  const round = String(input.round || '').trim()
  const venue = String(input.venue || '').trim()
  const time = String(input.time || input.timestamp || '').trim()
  const homeTeam = String(input.homeTeam || '').trim()
  const awayTeam = String(input.awayTeam || '').trim()
  const canonicalDescription = String(input.canonicalDescription || '').trim()

  if (canonicalDescription) {
    for (const line of canonicalDescription.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      pushUniqueLine(lines, line)
    }
  }

  if (sport) pushUniqueLine(lines, `Sport: ${sport}`)
  if (league) pushUniqueLine(lines, `League: ${league}`)
  if (title) pushUniqueLine(lines, `Event: ${title}`)
  if (detail) pushUniqueLine(lines, `Session: ${detail}`)
  if (date) pushUniqueLine(lines, `Date: ${date}`)
  if (round) pushUniqueLine(lines, `Round: ${round}`)
  if (venue) pushUniqueLine(lines, `Venue: ${venue}`)
  if (time) pushUniqueLine(lines, `Time: ${time}`)
  if (homeTeam && awayTeam) pushUniqueLine(lines, `Teams: ${homeTeam} vs ${awayTeam}`)

  const availability = []
  if (Number(input.seeders) > 0) availability.push(`${Number(input.seeders)} seeders`)
  if (input.size) availability.push(String(input.size).trim())
  if (Number(input.sourceCount) > 0) {
    const count = Number(input.sourceCount)
    availability.push(`${count} source${count === 1 ? '' : 's'}`)
  }
  if (availability.length > 0) pushUniqueLine(lines, `Availability: ${availability.join(' | ')}`)

  const status = String(input.resolutionStatus || '').trim()
  const source = String(input.source || '').trim()
  if (status && status !== 'resolved') pushUniqueLine(lines, `Artwork status: ${status}`)
  else if (source) pushUniqueLine(lines, `Metadata source: ${source === 'sportsmeta' ? 'SportsMeta' : source}`)

  return lines
}

function buildSportsArtworkDebug(input = {}) {
  const layoutFamily = String(input.posterResolved?.layoutFamily || '').trim()
  const selectedTemplate = String(input.posterResolved?.selectedTemplate || input.sportsPosterTemplate || '').trim()
  const eventClass = String(input.eventClass || '').trim()
  const resolutionStatus = String(input.resolutionStatus || '').trim()
  return {
    ...(layoutFamily ? { layoutFamily } : {}),
    ...(selectedTemplate ? { posterTemplate: selectedTemplate } : {}),
    ...(eventClass ? { eventClass } : {}),
    ...(resolutionStatus ? { resolutionStatus } : {})
  }
}

async function loadCanonicalSportsMeta(config = {}, canonicalId = '') {
  const normalizedId = String(canonicalId || '').trim()
  if (!normalizedId) return null

  const client = new SportsMetaClient({
    baseUrl: config?.sportsmetaBaseUrl
  })

  // Bound the lookup so a slow SportsMeta cannot starve `meta.json`
  // responses. Catalog-side identity resolution already has a budget; this
  // gives the per-id meta path the same protection.
  const outcome = await settleWithTimeout(
    client.getEvent(normalizedId).catch((error) => {
      console.warn(`[meta] SportsMeta lookup failed for ${normalizedId}: ${error.message}`)
      return null
    }),
    SPORTSMETA_META_TIMEOUT_MS,
    null
  )
  if (outcome.timedOut) {
    console.warn(`[meta] SportsMeta lookup timed out for ${normalizedId} after ${SPORTSMETA_META_TIMEOUT_MS}ms`)
  }
  return outcome.value || null
}

function buildCanonicalSportsMetaResponse(canonical = {}, requestedId, baseUrl, config = {}, requestedType = '') {
  const canonicalEvent = canonical?.event || {}
  const metaType = String(requestedType || canonicalEvent?.type || 'sports').trim() || 'sports'
  const sportHint = resolveSportHint({
    explicitHint: canonicalEvent?.sport,
    title: canonicalEvent?.title || canonicalEvent?.name
  })
  const league = String(canonicalEvent?.league || '').trim()
  const eventDate = String(canonicalEvent?.date || '').trim()
  const displayTitle = String(canonicalEvent?.name || canonicalEvent?.title || requestedId).trim() || requestedId
  const normalizedSportsEvent = normalizeSportsEventMetadata({
    canonicalId: String(canonicalEvent?.id || canonical?.canonicalId || requestedId || '').trim(),
    canonicalEvent,
    sportHint,
    competition: league,
    eventTitle: displayTitle,
    date: eventDate,
    rawTitle: displayTitle,
    source: 'sportsmeta'
  })
  const artworkInput = {
    baseUrl: String(baseUrl || '').replace(/\/+$/, ''),
    sportsmetaBaseUrl: config?.sportsmetaBaseUrl,
    sportsPosterTemplate: config?.sportsPosterTemplate,
    entitlementSource: config?.entitlementSource,
    entitlementOwnerEmailHash: config?.entitlementOwnerEmailHash,
    canonicalId: String(canonicalEvent?.id || canonical?.canonicalId || requestedId || '').trim(),
    sportHint: sportHint || normalizedSportsEvent.sport,
    league: normalizedSportsEvent.competition || league,
    title: normalizedSportsEvent.eventTitle || displayTitle,
    eventDetail: normalizedSportsEvent.eventDetail || '',
    date: normalizedSportsEvent.date || eventDate,
    rawTitle: normalizedSportsEvent.rawTitle,
    source: normalizedSportsEvent.source
  }
  const posterResolved = resolveSportsPosterAsset(artworkInput)
  const backgroundResolved = resolveSportsLandscapeAsset(artworkInput) || resolveSportsBackgroundAsset(artworkInput)
  const logoResolved = resolveSportsLogoAsset(artworkInput)
  const poster = String(posterResolved?.poster || '').trim() || BRAND_POSTER
  const background = String(backgroundResolved || '').trim() || BRAND_POSTER
  const logo = String(logoResolved || '').trim() || BRAND_LOGO
  const descriptionLines = buildSportsDescriptionLines({
    canonicalDescription: canonicalEvent?.description,
    sportHint,
    league: normalizedSportsEvent.competition || league,
    eventTitle: normalizedSportsEvent.eventTitle || displayTitle,
    eventDetail: normalizedSportsEvent.eventDetail || '',
    date: normalizedSportsEvent.date || eventDate,
    round: canonicalEvent?.round,
    venue: canonicalEvent?.venue,
    time: canonicalEvent?.time || canonicalEvent?.timestamp,
    homeTeam: canonicalEvent?.homeTeam,
    awayTeam: canonicalEvent?.awayTeam,
    source: 'sportsmeta'
  })
  const meta = {
    id: requestedId,
    type: metaType,
    name: displayTitle,
    description: descriptionLines.join('\n'),
    poster,
    background,
    logo
  }
  if (posterResolved?.posterShape) meta.posterShape = posterResolved.posterShape
  if (posterResolved?.layoutFamily) {
    meta.layoutFamily = posterResolved.layoutFamily
    meta.sportsArtwork = buildSportsArtworkDebug({
      posterResolved,
      sportsPosterTemplate: config?.sportsPosterTemplate,
      eventClass: classifySportsEvent({
        sport: sportHint || normalizedSportsEvent.sport,
        league: normalizedSportsEvent.competition || league,
        title: normalizedSportsEvent.eventTitle || displayTitle,
        eventTitle: normalizedSportsEvent.eventTitle || displayTitle,
        homeTeam: canonicalEvent?.homeTeam,
        awayTeam: canonicalEvent?.awayTeam,
        rawTitle: normalizedSportsEvent.rawTitle
      }),
      resolutionStatus: 'resolved'
    })
  }
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
        return buildCanonicalSportsMetaResponse(canonical, id, baseUrl, config, type)
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
  const carriedEventDetail = String(info.j || '').trim()
  const carriedSportHint = String(info.r || '').trim()
  const carriedEventClass = String(info.ec || info.eventClass || info.event_class || '').trim()
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
  const normalizedSportsEvent = isSports
    ? normalizeSportsEventMetadata({
        canonicalId,
        canonicalEvent,
        sportHint: resolvedSportHint || carriedSportHint,
        competition: league,
        eventTitle: displayTitle,
        date: eventDate,
        homeTeam,
        awayTeam,
        eventDetail: carriedEventDetail,
        seeders: Number(info.d || 0) || undefined,
        size: Number(info.s || 0) > 0 ? formatSize(info.s) : '',
        rawTitle: info.t || displayTitle,
        source: canonicalSportsMeta ? 'sportsmeta' : 'prowlarr'
      })
    : null
  const classifiedEventClass = isSports
    ? classifySportsEvent({
        sport: resolvedSportHint || normalizedSportsEvent?.sport || '',
        league: normalizedSportsEvent?.competition || league,
        title: normalizedSportsEvent?.eventTitle || displayTitle,
        eventTitle: normalizedSportsEvent?.eventTitle || displayTitle,
        eventDetail: normalizedSportsEvent?.eventDetail || carriedEventDetail,
        homeTeam: normalizedSportsEvent?.homeTeam || homeTeam,
        awayTeam: normalizedSportsEvent?.awayTeam || awayTeam,
        rawTitle: normalizedSportsEvent?.rawTitle || info.t || displayTitle
      })
    : ''
  const eventClass = isSports
    ? (classifiedEventClass === 'team_vs_team' ? 'team_vs_team' : (carriedEventClass || classifiedEventClass))
    : ''

  const artworkInput = {
    baseUrl: String(baseUrl || '').replace(/\/+$/, ''),
    sportsmetaBaseUrl: config?.sportsmetaBaseUrl,
    sportsPosterTemplate: config?.sportsPosterTemplate,
    entitlementSource: config?.entitlementSource,
    entitlementOwnerEmailHash: config?.entitlementOwnerEmailHash,
    canonicalId: canonicalId && resolutionStatus === 'resolved' ? canonicalId : '',
    sportHint: resolvedSportHint || normalizedSportsEvent?.sport || '',
    league: normalizedSportsEvent?.competition || league,
    title: normalizedSportsEvent?.eventTitle || displayTitle,
    homeTeam: normalizedSportsEvent?.homeTeam || homeTeam,
    awayTeam: normalizedSportsEvent?.awayTeam || awayTeam,
    eventDetail: normalizedSportsEvent?.eventDetail || '',
    eventClass,
    date: normalizedSportsEvent?.date || eventDate,
    seeders: normalizedSportsEvent?.seeders,
    size: normalizedSportsEvent?.size,
    rawTitle: normalizedSportsEvent?.rawTitle || info.t || displayTitle,
    source: normalizedSportsEvent?.source || ''
  }
  const posterResolved = isSports
    ? resolveSportsPosterAsset(artworkInput)
    : { poster: carriedArtwork || BRAND_POSTER, posterShape: undefined }
  const backgroundResolved = isSports
    ? (resolveSportsLandscapeAsset(artworkInput) || resolveSportsBackgroundAsset(artworkInput))
    : (String(info.b || '').trim() || BRAND_POSTER)
  const logoResolved = isSports
    ? resolveSportsLogoAsset(artworkInput)
    : carriedLogo
  const poster = String(posterResolved?.poster || '').trim() || BRAND_POSTER
  const background = String(backgroundResolved || '').trim() || (isSports ? BRAND_POSTER : poster)
  const logo = String(logoResolved || '').trim() || BRAND_LOGO
  const posterShape = isSports ? posterResolved?.posterShape : undefined

  const sportsGenres = isSports ? buildSportsGenres(resolvedSportHint, league) : []

  let descriptionLines = []
  if (isSports) {
    descriptionLines = buildSportsDescriptionLines({
      canonicalDescription: canonicalEvent?.description,
      sportHint: resolvedSportHint,
      league: normalizedSportsEvent?.competition || league,
      eventTitle: normalizedSportsEvent?.eventTitle || eventName || displayTitle,
      eventDetail: normalizedSportsEvent?.eventDetail || carriedEventDetail,
      date: normalizedSportsEvent?.date || eventDate,
      round: canonicalEvent?.round || sportsArtwork?.round,
      venue: canonicalEvent?.venue || sportsArtwork?.venue,
      time: canonicalEvent?.time || canonicalEvent?.timestamp || sportsArtwork?.time || sportsArtwork?.timestamp,
      homeTeam,
      awayTeam,
      seeders: Number(info.d || 0) || 0,
      size: Number(info.s || 0) > 0 ? formatSize(info.s) : '',
      sourceCount: Number(info.c || 0) || 0,
      resolutionStatus,
      source: canonicalSportsMeta ? 'sportsmeta' : 'prowlarr'
    })
  }
  const statParts = []
  if (Number(info.d) > 0) statParts.push(`${info.d} seeders`)
  if (Number(info.s) > 0) statParts.push(formatSize(info.s))
  if (Number.isFinite(Number(info.c)) && Number(info.c) > 0) {
    const count = Number(info.c)
    statParts.push(`${count} source${count === 1 ? '' : 's'}`)
  }
  if (!isSports && statParts.length > 0) descriptionLines.push(statParts.join(' | '))
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
  if (isSports && posterResolved?.layoutFamily) {
    meta.layoutFamily = posterResolved.layoutFamily
    meta.sportsArtwork = buildSportsArtworkDebug({
      posterResolved,
      sportsPosterTemplate: config?.sportsPosterTemplate,
      eventClass,
      resolutionStatus
    })
  }
  if (sportsGenres.length > 0) meta.genres = sportsGenres
  if (eventDate) meta.releaseInfo = eventDate
  if (isSports && resolvedSportHint) {
    meta.runtime = formatSportGenreLabel(resolvedSportHint)
  }
  return { meta }
}

module.exports = { handleMeta }
