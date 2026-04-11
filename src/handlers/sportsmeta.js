// Experimental integrated SportsMeta draft only.
// Production SportsMeta now lives in the separate `sportsmeta` service/repo and this
// handler should only load when `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA=true`.

const { SportsDbClient } = require('../clients/sportsdb')
const { mapLeague } = require('../utils/leagueMap')
const { proxySportsImageUrl } = require('../utils/sportsImageCache')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { makeSportsPosterSvgUrl, makeSportsThumbSvgUrl } = require('../utils/sportsThumb')
const { resolveSportHint } = require('../utils/sportsRules')
const {
  buildGeneratedArtworkItem,
  hasMatchupContext,
  isFormulaOneContext,
  isLeagueFallbackArtwork,
  resolveSportsBackgroundAsset,
  resolveSportsLogoAsset,
  resolveSportsPosterAsset
} = require('../utils/sportsArtwork')
const {
  getSportsMetaEntitlement,
  lookupSportsMetaRecord,
  upsertResolvedSportsMetaRecord
} = require('../utils/sportsmetaCatalogue')

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseBooleanLoose(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeTierCandidate(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (['sportsmeta', 'paid', 'premium', 'real'].includes(normalized)) return 'sportsmeta'
  if (['svg', 'free', 'generated'].includes(normalized)) return 'svg'
  return ''
}

function slugKeyPart(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeLeagueForDisplay(value) {
  const text = normalizeSpace(value)
  if (!text) return ''
  return normalizeSpace(mapLeague(text) || text)
}

function buildEventKey(input = {}) {
  const league = slugKeyPart(input.league)
  const date = normalizeSpace(input.date).slice(0, 10)
  const homeTeam = slugKeyPart(input.homeTeam)
  const awayTeam = slugKeyPart(input.awayTeam)
  const eventName = slugKeyPart(input.eventName)

  if (league && date && homeTeam && awayTeam) {
    return [league, date, ...[homeTeam, awayTeam].sort()].join('.')
  }
  if (league && date && eventName) {
    return [league, date, eventName].join('.')
  }
  if (league && eventName) {
    return [league, eventName].join('.')
  }
  return ''
}

function rewriteGeneratedThumbUrlToSvg(value) {
  return String(value || '').replace(/(\/thumb\/sports(?:\/[^/]+)?\/[^/.]+)\.png$/i, '$1.svg')
}

function resolveSportsMetaTier(config = {}, options = {}) {
  if (parseBooleanLoose(process.env.PVTKRRX_SPORTSMETA_FREE_ALL, false)) return 'svg'

  const forcedTier = normalizeTierCandidate(options.forceTier || process.env.PVTKRRX_SPORTSMETA_FORCE_TIER)
  if (forcedTier) return forcedTier

  const accountUserId = normalizeSpace(config?.accountUserId || config?.account?.userId)
  if (accountUserId) {
    try {
      const entitlement = getSportsMetaEntitlement(accountUserId)
      const entitlementTier = normalizeTierCandidate(entitlement?.tier)
      if (entitlementTier) return entitlementTier
    } catch (_) {
      // ignore entitlement lookup errors on the request path
    }
  }

  const configTier = normalizeTierCandidate(
    config?.sportsmetaTier ||
    config?.sportsMetaTier ||
    config?.sportsmetaEntitlement ||
    config?.sportsMetaEntitlement
  )
  if (configTier) return configTier

  if (
    parseBooleanLoose(config?.sportsmetaPaid, false) ||
    parseBooleanLoose(config?.sportsMetaPaid, false) ||
    parseBooleanLoose(config?.sportsmetaEnabled, false) ||
    parseBooleanLoose(config?.sportsMetaEnabled, false)
  ) {
    return 'sportsmeta'
  }

  const defaultTier = normalizeTierCandidate(process.env.PVTKRRX_SPORTSMETA_DEFAULT_TIER || 'svg')
  return defaultTier || 'svg'
}

function normalizeSportsMetaQuery(query = {}) {
  const title = normalizeSpace(query.title)
  const publishDate = normalizeSpace(query.publishDate || query.pubDate || query.date)
  const parsedSportsEvent = title ? parseSportsTitle(title, publishDate) : null
  const parsedEvent = !parsedSportsEvent && title ? parseSportsEventTitle(title) : null
  const rawLeague = normalizeSpace(query.league || parsedSportsEvent?.league || parsedEvent?.league)
  const homeTeam = normalizeSpace(query.home || query.homeTeam || parsedSportsEvent?.homeTeam)
  const awayTeam = normalizeSpace(query.away || query.awayTeam || parsedSportsEvent?.awayTeam)
  const eventName = normalizeSpace(query.event || query.eventName || parsedEvent?.eventName)
  const date = normalizeSpace(query.date || parsedSportsEvent?.date || parsedEvent?.date)
  const sportHint = normalizeSpace(resolveSportHint({
    explicitHint: query.sport,
    categoryHint: rawLeague,
    title
  }))
  const league = normalizeLeagueForDisplay(rawLeague)
  const displayTitle = normalizeSpace(title || eventName || [homeTeam, awayTeam].filter(Boolean).join(' vs '))
  const eventId = normalizeSpace(query.eventId)

  const hasIdentity = Boolean(
    eventId ||
    (league && homeTeam && awayTeam) ||
    (league && eventName) ||
    title
  )

  return {
    title,
    publishDate,
    league,
    rawLeague,
    date,
    homeTeam,
    awayTeam,
    eventName,
    sportHint,
    displayTitle,
    eventId,
    hasIdentity
  }
}

function buildGeneratedArtwork(artworkInput) {
  const generatedStyle = hasMatchupContext(artworkInput)
    ? 'matchup'
    : (isFormulaOneContext(artworkInput) ? 'formula1' : 'league-event')
  const generatedItem = buildGeneratedArtworkItem(artworkInput, generatedStyle)

  return {
    poster: makeSportsPosterSvgUrl(artworkInput.baseUrl, generatedItem),
    landscape: makeSportsThumbSvgUrl(artworkInput.baseUrl, generatedItem, 'landscape'),
    background: makeSportsThumbSvgUrl(artworkInput.baseUrl, generatedItem, 'background')
  }
}

function resolveLandscapeArtwork(baseUrl, sportsArtwork, generatedLandscapeUrl) {
  const landscapeSource = normalizeSpace(
    sportsArtwork?.image ||
    sportsArtwork?.landscapeImage ||
    sportsArtwork?.backgroundImage
  )
  const posterSource = normalizeSpace(sportsArtwork?.poster)
  const sourceUrl = landscapeSource || posterSource
  if (!sourceUrl) return generatedLandscapeUrl
  const variant = landscapeSource ? 'landscape' : 'poster'
  return proxySportsImageUrl(baseUrl, sourceUrl, variant) || sourceUrl || generatedLandscapeUrl
}

function buildArtworkPayload(tier, artworkInput) {
  const generatedArtwork = buildGeneratedArtwork(artworkInput)
  const sportsArtwork = artworkInput?.sportsArtwork || null

  if (tier === 'svg') {
    return {
      poster: generatedArtwork.poster,
      thumb: generatedArtwork.landscape,
      landscape: generatedArtwork.landscape,
      background: generatedArtwork.background,
      logo: null,
      leagueLogo: null,
      homeBadge: null,
      awayBadge: null
    }
  }

  const posterResolved = resolveSportsPosterAsset(artworkInput)
  const backgroundResolved = resolveSportsBackgroundAsset(artworkInput)
  const logoResolved = resolveSportsLogoAsset(artworkInput)
  const leagueLogoSource = normalizeSpace(sportsArtwork?.leagueLogo || sportsArtwork?.logo)
  const homeBadgeSource = normalizeSpace(sportsArtwork?.homeBadge)
  const awayBadgeSource = normalizeSpace(sportsArtwork?.awayBadge)

  const poster = rewriteGeneratedThumbUrlToSvg(
    String(posterResolved?.poster || '').trim() || generatedArtwork.poster
  ) || generatedArtwork.poster
  const background = rewriteGeneratedThumbUrlToSvg(
    String(backgroundResolved || '').trim() || generatedArtwork.background
  ) || generatedArtwork.background
  const landscape = resolveLandscapeArtwork(artworkInput.baseUrl, sportsArtwork, generatedArtwork.landscape)
  const logo = normalizeSpace(logoResolved)
  const leagueLogo = proxySportsImageUrl(artworkInput.baseUrl, leagueLogoSource, 'logo') || leagueLogoSource || logo || null
  const homeBadge = proxySportsImageUrl(artworkInput.baseUrl, homeBadgeSource, 'logo') || homeBadgeSource || null
  const awayBadge = proxySportsImageUrl(artworkInput.baseUrl, awayBadgeSource, 'logo') || awayBadgeSource || null

  return {
    poster,
    thumb: landscape,
    landscape,
    background,
    logo: logo || leagueLogo || null,
    leagueLogo: leagueLogo || null,
    homeBadge,
    awayBadge
  }
}

async function handleSportsMetaEvent(config = {}, query = {}, context = {}) {
  const normalized = normalizeSportsMetaQuery(query)
  const tier = resolveSportsMetaTier(config, { forceTier: context.forceTier })

  if (!normalized.hasIdentity) {
    return {
      match: false,
      resolved: false,
      event: null,
      artwork: null,
      tier,
      source: 'none',
      cacheMaxAge: 60
    }
  }

  let sportsArtwork = null
  try {
    sportsArtwork = lookupSportsMetaRecord(normalized)
  } catch (_) {
    sportsArtwork = null
  }

  if (!sportsArtwork) {
    try {
      const sportsDb = new SportsDbClient(config?.sportsDbApiKey, {
        cacheHours: config?.sportsDbCacheHours
      })
      sportsArtwork = await sportsDb.getEventArtwork({
        title: normalized.title || normalized.displayTitle,
        publishDate: normalized.publishDate,
        sportHint: normalized.sportHint,
        eventId: normalized.eventId,
        league: normalized.rawLeague || normalized.league,
        date: normalized.date,
        homeTeam: normalized.homeTeam,
        awayTeam: normalized.awayTeam,
        eventName: normalized.eventName
      })
      if (sportsArtwork) {
        try {
          upsertResolvedSportsMetaRecord(sportsArtwork)
        } catch (_) {
          // ignore catalogue write errors on the request path
        }
      }
    } catch (_) {
      sportsArtwork = null
    }
  }

  const homeTeam = normalizeSpace(sportsArtwork?.homeTeam || normalized.homeTeam)
  const awayTeam = normalizeSpace(sportsArtwork?.awayTeam || normalized.awayTeam)
  const eventName = normalizeSpace(
    sportsArtwork?.eventName ||
    normalized.eventName ||
    [homeTeam, awayTeam].filter(Boolean).join(' vs ')
  )
  const league = normalizeLeagueForDisplay(sportsArtwork?.league || normalized.league || normalized.rawLeague)
  const date = normalizeSpace(sportsArtwork?.eventDate || normalized.date)
  const sport = normalizeSpace(resolveSportHint({
    explicitHint: normalized.sportHint || sportsArtwork?.sport,
    categoryHint: league,
    title: normalized.title || eventName
  }))

  const event = {
    key: buildEventKey({ league, date, homeTeam, awayTeam, eventName }),
    eventId: normalizeSpace(sportsArtwork?.eventId || normalized.eventId),
    name: eventName || normalized.displayTitle,
    league,
    date,
    sport,
    homeTeam,
    awayTeam,
    source: normalizeSpace(sportsArtwork?.source || '') || 'generated'
  }

  const artworkInput = {
    baseUrl: normalizeSpace(context.baseUrl),
    title: normalized.title || normalized.displayTitle,
    displayTitle: normalized.displayTitle || event.name,
    publishDate: normalized.publishDate || event.date,
    sportHint: event.sport,
    league: event.league,
    eventName: event.name,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    sportsArtwork
  }

  return {
    match: Boolean(event.name || event.key || event.eventId),
    resolved: Boolean(sportsArtwork),
    event,
    artwork: buildArtworkPayload(tier, artworkInput),
    tier,
    source: event.source,
    cacheMaxAge: sportsArtwork && !isLeagueFallbackArtwork(sportsArtwork) ? 300 : 120
  }
}

module.exports = {
  handleSportsMetaEvent,
  normalizeSportsMetaQuery,
  resolveSportsMetaTier
}
