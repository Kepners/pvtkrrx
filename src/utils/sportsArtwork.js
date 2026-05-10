const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')
const {
  isBroadcastLayoutFamily,
  layoutFamilyForSportsPosterRender,
  resolveSportsPosterTemplate
} = require('./sportsPosterTemplates')
const { resolveSportBackdrop } = require('./sportBackdrops')
const { verifyStampedSportsPosterEntitlement } = require('./entitlement')

const SPORTS_ARTWORK_PROXY_VERSION = '20260510-real-logo-v15-catalog-orientation'

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function resolveSportsMetaBaseUrl(input = {}) {
  return normalizeSpace(
    input?.sportsmetaBaseUrl ||
    input?.config?.sportsmetaBaseUrl ||
    ''
  )
}

function resolveAddonBaseUrl(input = {}) {
  return normalizeSpace(input?.baseUrl || '').replace(/\/+$/, '')
}

function appendSportsArtworkVersion(urlString) {
  const value = normalizeSpace(urlString)
  if (!value) return ''
  try {
    const url = new URL(value)
    url.searchParams.set('artworkV', SPORTS_ARTWORK_PROXY_VERSION)
    return url.toString()
  } catch {
    return value
  }
}

function resolveCanonicalId(input = {}) {
  return normalizeSpace(
    input?.canonicalId ||
    input?.sportsmetaCanonicalId ||
    input?.sportsArtwork?.canonicalId ||
    ''
  )
}

function resolveSport(input = {}) {
  return normalizeSpace(
    input?.sportHint ||
    input?.sport ||
    input?.sportsArtwork?.sport ||
    ''
  )
}

function resolveLeague(input = {}) {
  return normalizeSpace(
    input?.league ||
    input?.sportsArtwork?.league ||
    ''
  )
}

function resolveTitle(input = {}) {
  return normalizeSpace(
    input?.title ||
    input?.name ||
    input?.displayTitle ||
    input?.sportsArtwork?.eventName ||
    ''
  )
}

function resolveDate(input = {}) {
  return normalizeSpace(
    input?.date ||
    input?.eventDate ||
    input?.releaseInfo ||
    input?.sportsArtwork?.eventDate ||
    ''
  )
}

function resolveHomeTeam(input = {}) {
  return normalizeSpace(
    input?.homeTeam ||
    input?.home ||
    input?.sportsArtwork?.homeTeam ||
    ''
  )
}

function resolveAwayTeam(input = {}) {
  return normalizeSpace(
    input?.awayTeam ||
    input?.away ||
    input?.sportsArtwork?.awayTeam ||
    ''
  )
}

function resolveEventClass(input = {}) {
  return normalizeSpace(
    input?.eventClass ||
    input?.sportsEventClass ||
    input?.sportsArtwork?.eventClass ||
    ''
  )
}

function isWeakCanonicalId(value = '') {
  const id = normalizeSpace(value).toLowerCase()
  return /\|general\|/.test(id) || /\|sports\|/.test(id)
}

function resolveConfiguredSportsPosterTemplate(input = {}) {
  // Honour the stamped entitlement on the encrypted config token.
  // Owner/admin sources are re-verified against the current env so revoking
  // PVTKRRX_OWNER_EMAILS instantly downgrades a leaked token. Anything
  // without a verified stamp falls back to the free `ticket-stub` style.
  const config = input && typeof input.config === 'object' ? input.config : null
  const requestedTemplate = String(
    input?.sportsPosterTemplate || config?.sportsPosterTemplate || ''
  ).trim()
  const stampedSource = String(
    input?.entitlementSource || config?.entitlementSource || ''
  ).trim()
  const stampedHash = String(
    input?.entitlementOwnerEmailHash || config?.entitlementOwnerEmailHash || ''
  ).trim()
  const verified = verifyStampedSportsPosterEntitlement({
    requestedTemplate,
    stampedSource,
    stampedHash
  })
  return resolveSportsPosterTemplate(verified.resolvedTemplate || 'ticket-stub')
}

function resolveSportsArtworkLayoutFamily(input = {}) {
  return layoutFamilyForSportsPosterRender(resolveConfiguredSportsPosterTemplate(input), input)
}

// SportsMeta returns image/svg+xml for every asset URL — default and canonical
// — and Stremio mobile/tablet clients do not render SVG posters. To keep the
// tablet route rendering public glyph artwork, emit a PVTKRRX-hosted raster proxy URL
// whenever the catalog/meta handler has a public addon baseUrl. The proxy
// fetches the SportsMeta SVG and returns a PNG rasterized with sharp.
function buildPvtkrrxRasterUrl(variant, input = {}) {
  const addonBase = resolveAddonBaseUrl(input)
  if (!addonBase) return ''
  const canonicalId = resolveCanonicalId(input)
  const league = resolveLeague(input)
  const title = resolveTitle(input)
  const date = resolveDate(input)
  const homeTeam = resolveHomeTeam(input)
  const awayTeam = resolveAwayTeam(input)
  if (canonicalId) {
    const url = new URL(`${addonBase}/sports-artwork/id/${encodeURIComponent(variant)}/${encodeURIComponent(canonicalId)}.png`)
    const includeContext = variant === 'background' || variant === 'landscape' || isWeakCanonicalId(canonicalId)
    if (includeContext) {
      const sport = resolveSport(input)
      if (sport) url.searchParams.set('sport', sport)
      if (league) url.searchParams.set('league', league)
      if (title) url.searchParams.set('title', title)
      if (date) url.searchParams.set('date', date)
      if (homeTeam) url.searchParams.set('home', homeTeam)
      if (awayTeam) url.searchParams.set('away', awayTeam)
      if (input?.eventDetail) url.searchParams.set('detail', normalizeSpace(input.eventDetail))
      const eventClass = resolveEventClass(input)
      if (eventClass) url.searchParams.set('eventClass', eventClass)
      if (input?.rawTitle) url.searchParams.set('rawTitle', normalizeSpace(input.rawTitle))
      if (input?.source) url.searchParams.set('source', normalizeSpace(input.source))
    }
    url.searchParams.set('template', resolveConfiguredSportsPosterTemplate(input))
    url.searchParams.set('v', SPORTS_ARTWORK_PROXY_VERSION)
    return url.toString()
  }
  const sportSlug = resolveSportSlug(resolveSport(input))
  if (!sportSlug) return ''
  const url = new URL(`${addonBase}/sports-artwork/default/${encodeURIComponent(variant)}/${encodeURIComponent(sportSlug)}.png`)
  if (league) url.searchParams.set('league', league)
  if (title) url.searchParams.set('title', title)
  if (date) url.searchParams.set('date', date)
  if (homeTeam) url.searchParams.set('home', homeTeam)
  if (awayTeam) url.searchParams.set('away', awayTeam)
  if (input?.eventDetail) url.searchParams.set('detail', normalizeSpace(input.eventDetail))
  const eventClass = resolveEventClass(input)
  if (eventClass) url.searchParams.set('eventClass', eventClass)
  if (Number(input?.seeders) > 0) url.searchParams.set('seeders', String(Number(input.seeders)))
  if (input?.size) url.searchParams.set('size', normalizeSpace(input.size))
  if (input?.source) url.searchParams.set('source', normalizeSpace(input.source))
  url.searchParams.set('template', resolveConfiguredSportsPosterTemplate(input))
  url.searchParams.set('v', SPORTS_ARTWORK_PROXY_VERSION)
  return url.toString()
}

function buildSportsMetaDirectUrl(variant, input = {}) {
  const sportsmetaBaseUrl = resolveSportsMetaBaseUrl(input)
  const canonicalId = resolveCanonicalId(input)
  if (canonicalId) {
    const canonical = buildSportsMetaAssetUrl(sportsmetaBaseUrl, variant, canonicalId)
    if (canonical) return canonical
  }
  const sport = resolveSport(input)
  return buildSportsMetaDefaultAssetUrl(sportsmetaBaseUrl, variant, sport, resolveLeague(input), {
    title: resolveTitle(input),
    date: resolveDate(input)
  })
}

function buildVariantUrl(variant, input = {}) {
  // Prefer PVTKRRX-hosted raster when we have a public addon base URL — that
  // is the client-safe form for every route (catalog + meta responses go to
  // Stremio clients that may not render SVG). Fall back to the direct
  // SportsMeta asset URL only when no baseUrl is available (internal tests,
  // tooling that bypasses the HTTP handlers).
  const rasterUrl = buildPvtkrrxRasterUrl(variant, input)
  if (rasterUrl) return rasterUrl
  return buildSportsMetaDirectUrl(variant, input)
}

function resolveSportsPosterAsset(input = {}) {
  const selectedTemplate = resolveConfiguredSportsPosterTemplate(input)
  const layoutFamily = layoutFamilyForSportsPosterRender(selectedTemplate, input)
  const poster = buildVariantUrl('poster', input)
  return {
    poster,
    posterShape: 'poster',
    posterMode: resolveCanonicalId(input) ? 'pvtkrrx-proxy-canonical-public' : 'pvtkrrx-proxy-default-public',
    selectedArtworkSource: resolveCanonicalId(input) ? 'pvtkrrx-canonical-public-proxy' : 'sportsmeta-default-public-proxy',
    selectedTemplate,
    layoutFamily
  }
}

function resolveSportsBroadcastBackdrop(input = {}) {
  const layoutFamily = input.layoutFamily || resolveSportsArtworkLayoutFamily(input)
  if (!isBroadcastLayoutFamily(layoutFamily)) return null
  const backdrop = resolveSportBackdrop({
    ...input,
    layoutFamily,
    sport: resolveSport(input),
    league: resolveLeague(input),
    title: resolveTitle(input),
    baseUrl: resolveAddonBaseUrl(input)
  })
  if (backdrop?.url) {
    console.log(
      `[sports-backdrop-select] layoutFamily=${layoutFamily} bucket=${backdrop.bucket || ''} requested=${backdrop.requestedBucket || ''} fallbackReason="${backdrop.fallbackReason || ''}" backdropUrl="${backdrop.url}"`
    )
  }
  return backdrop
}

function resolveSportsBackdropForDefault(input = {}) {
  return resolveSportBackdrop({
    ...input,
    sport: resolveSport(input),
    league: resolveLeague(input),
    title: resolveTitle(input),
    baseUrl: resolveAddonBaseUrl(input)
  })
}

function resolveSportsBackgroundAsset(input = {}) {
  const broadcastBackdrop = resolveSportsBroadcastBackdrop(input)
  if (broadcastBackdrop?.url) return appendSportsArtworkVersion(broadcastBackdrop.url)
  if (resolveCanonicalId(input)) return buildVariantUrl('background', input)
  return appendSportsArtworkVersion(resolveSportsBackdropForDefault(input).url) || buildVariantUrl('background', input)
}

function resolveSportsLandscapeAsset(input = {}) {
  const broadcastBackdrop = resolveSportsBroadcastBackdrop(input)
  if (broadcastBackdrop?.url) return appendSportsArtworkVersion(broadcastBackdrop.url)
  if (resolveCanonicalId(input)) return buildVariantUrl('landscape', input)
  return appendSportsArtworkVersion(resolveSportsBackdropForDefault(input).url) || buildVariantUrl('landscape', input)
}

function resolveSportsLogoAsset(input = {}) {
  return buildVariantUrl('logo', input)
}

module.exports = {
  SPORTS_ARTWORK_PROXY_VERSION,
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLandscapeAsset,
  resolveSportsLogoAsset,
  resolveSportBackdrop,
  resolveSportsArtworkLayoutFamily,
  resolveSportsBroadcastBackdrop
}
