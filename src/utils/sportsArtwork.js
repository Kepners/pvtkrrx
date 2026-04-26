const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  buildSportsMetaMemberAssetUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')

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

function resolveSportsPosterMemberToken(input = {}) {
  return normalizeSpace(
    input?.sportsPosterMemberToken ||
    input?.sportsmetaMemberToken ||
    input?.memberToken ||
    input?.config?.sportsPosterMemberToken ||
    process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN ||
    process.env.SPORTSMETA_MEMBER_TOKEN ||
    ''
  )
}

// SportsMeta returns image/svg+xml for every asset URL — default and canonical
// — and Stremio mobile/tablet clients do not render SVG posters. To keep the
// tablet route rendering real artwork, emit a PVTKRRX-hosted raster proxy URL
// whenever the catalog/meta handler has a public addon baseUrl. The proxy
// fetches the SportsMeta SVG and returns a PNG rasterized with sharp.
function buildPvtkrrxRasterUrl(variant, input = {}) {
  const addonBase = resolveAddonBaseUrl(input)
  if (!addonBase) return ''
  const canonicalId = resolveCanonicalId(input)
  if (canonicalId) {
    const url = new URL(`${addonBase}/sports-artwork/id/${encodeURIComponent(variant)}/${encodeURIComponent(canonicalId)}.png`)
    const memberToken = resolveSportsPosterMemberToken(input)
    if (memberToken) url.searchParams.set('token', memberToken)
    return url.toString()
  }
  const sportSlug = resolveSportSlug(resolveSport(input))
  if (!sportSlug) return ''
  const league = resolveLeague(input)
  const title = resolveTitle(input)
  const date = resolveDate(input)
  const url = new URL(`${addonBase}/sports-artwork/default/${encodeURIComponent(variant)}/${encodeURIComponent(sportSlug)}.png`)
  if (league) url.searchParams.set('league', league)
  if (title) url.searchParams.set('title', title)
  if (date) url.searchParams.set('date', date)
  if (input?.eventDetail) url.searchParams.set('detail', normalizeSpace(input.eventDetail))
  if (input?.rawTitle) url.searchParams.set('rawTitle', normalizeSpace(input.rawTitle))
  if (Number(input?.seeders) > 0) url.searchParams.set('seeders', String(Number(input.seeders)))
  if (input?.size) url.searchParams.set('size', normalizeSpace(input.size))
  if (input?.source) url.searchParams.set('source', normalizeSpace(input.source))
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

function buildSportsMetaMemberDirectUrl(variant, input = {}) {
  const sportsmetaBaseUrl = resolveSportsMetaBaseUrl(input)
  const canonicalId = resolveCanonicalId(input)
  const memberToken = resolveSportsPosterMemberToken(input)
  if (!canonicalId || !memberToken) return ''
  return buildSportsMetaMemberAssetUrl(sportsmetaBaseUrl, memberToken, variant, canonicalId)
}

function buildVariantUrl(variant, input = {}) {
  // Prefer PVTKRRX-hosted raster when we have a public addon base URL — that
  // is the client-safe form for every route (catalog + meta responses go to
  // Stremio clients that may not render SVG). Fall back to the direct
  // SportsMeta asset URL only when no baseUrl is available (internal tests,
  // tooling that bypasses the HTTP handlers).
  const rasterUrl = buildPvtkrrxRasterUrl(variant, input)
  if (rasterUrl) return rasterUrl
  const memberUrl = buildSportsMetaMemberDirectUrl(variant, input)
  if (memberUrl) return memberUrl
  return buildSportsMetaDirectUrl(variant, input)
}

function resolveSportsPosterAsset(input = {}) {
  const hasMemberUrl = Boolean(buildSportsMetaMemberDirectUrl('poster', input))
  const poster = buildVariantUrl('poster', input)
  return {
    poster,
    posterShape: 'poster',
    posterMode: hasMemberUrl
      ? 'sportsmeta-member'
      : resolveCanonicalId(input) ? 'pvtkrrx-proxy-canonical' : 'pvtkrrx-proxy-default',
    selectedArtworkSource: hasMemberUrl
      ? 'sportsmeta-member-raster'
      : resolveCanonicalId(input) ? 'pvtkrrx-canonical-proxy' : 'pvtkrrx-generated-fallback'
  }
}

function resolveSportsBackgroundAsset(input = {}) {
  return buildVariantUrl('background', input)
}

function resolveSportsLandscapeAsset(input = {}) {
  return buildVariantUrl('landscape', input)
}

function resolveSportsLogoAsset(input = {}) {
  return buildVariantUrl('logo', input)
}

module.exports = {
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLandscapeAsset,
  resolveSportsLogoAsset
}
