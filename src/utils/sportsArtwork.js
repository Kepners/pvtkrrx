const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl
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

function buildVariantUrl(variant, input = {}) {
  const baseUrl = resolveSportsMetaBaseUrl(input)
  const canonicalId = resolveCanonicalId(input)
  // PVTKRRX intentionally emits only the public SportsMeta asset surface.
  // Member-token artwork stays on the separate SportsMeta addon/install.
  if (canonicalId) {
    const canonical = buildSportsMetaAssetUrl(baseUrl, variant, canonicalId)
    if (canonical) return canonical
  }
  const sport = resolveSport(input)
  return buildSportsMetaDefaultAssetUrl(baseUrl, variant, sport, resolveLeague(input))
}

function resolveSportsPosterAsset(input = {}) {
  const poster = buildVariantUrl('poster', input)
  return {
    poster,
    posterShape: 'poster',
    posterMode: resolveCanonicalId(input) ? 'sportsmeta-canonical' : 'sportsmeta-default'
  }
}

function resolveSportsBackgroundAsset(input = {}) {
  return buildVariantUrl('background', input)
}

function resolveSportsLogoAsset(input = {}) {
  return buildVariantUrl('logo', input)
}

module.exports = {
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLogoAsset
}
