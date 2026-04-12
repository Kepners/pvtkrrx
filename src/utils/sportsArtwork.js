const {
  makeSportsPosterUrl,
  makeSportsPosterSvgUrl,
  makeSportsThumbSvgUrl,
  makeSportsThumbUrl
} = require('./sportsThumb')
const { proxySportsImageUrl } = require('./sportsImageCache')

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isLeagueFallbackArtwork(sportsArtwork = {}) {
  return normalizeSpace(sportsArtwork?.source) === 'thesportsdb-league'
}

function hasMatchupContext(input = {}) {
  const sportsArtwork = input?.sportsArtwork || {}
  const homeTeam = normalizeSpace(input?.homeTeam || sportsArtwork?.homeTeam)
  const awayTeam = normalizeSpace(input?.awayTeam || sportsArtwork?.awayTeam)
  return Boolean(homeTeam && awayTeam)
}

function isFormulaOneContext(input = {}) {
  const sportsArtwork = input?.sportsArtwork || {}
  const text = [
    input?.sportHint,
    input?.league,
    input?.title,
    input?.displayTitle,
    input?.eventName,
    sportsArtwork?.sport,
    sportsArtwork?.league,
    sportsArtwork?.eventName
  ].filter(Boolean).join(' ').toLowerCase()

  return /\b(?:f1|formula[\s-]*1|formula1|grand[\s-]*prix)\b/.test(text)
}

function resolveArtworkMode(input = {}) {
  const normalized = normalizeSpace(input?.artworkMode || input?.assetMode).toLowerCase()
  if (['svg', 'generated', 'free'].includes(normalized)) return 'svg'
  return 'auto'
}

function resolveGeneratedArtworkStyle(input = {}) {
  if (hasMatchupContext(input)) return 'matchup'
  if (isFormulaOneContext(input)) return 'formula1'
  return 'league-event'
}

function buildGeneratedArtworkItem(input = {}, style = 'generic-event') {
  const sportsArtwork = input?.sportsArtwork || {}
  const homeTeam = normalizeSpace(input?.homeTeam || sportsArtwork?.homeTeam)
  const awayTeam = normalizeSpace(input?.awayTeam || sportsArtwork?.awayTeam)
  const displayTitle = normalizeSpace(input?.displayTitle || input?.title || sportsArtwork?.eventName || '')

  return {
    title: displayTitle || [homeTeam, awayTeam].filter(Boolean).join(' vs '),
    publishDate: normalizeSpace(input?.publishDate || sportsArtwork?.eventDate),
    sportHint: normalizeSpace(input?.sportHint || sportsArtwork?.sport),
    league: normalizeSpace(input?.league || sportsArtwork?.league),
    eventName: normalizeSpace(input?.eventName || sportsArtwork?.eventName),
    homeTeam,
    awayTeam,
    homeBadge: normalizeSpace(sportsArtwork?.homeBadge),
    awayBadge: normalizeSpace(sportsArtwork?.awayBadge),
    leagueLogo: normalizeSpace(sportsArtwork?.leagueLogo || sportsArtwork?.logo),
    posterStyle: normalizeSpace(style)
  }
}

function buildGeneratedArtworkUrls(input = {}) {
  const style = resolveGeneratedArtworkStyle(input)
  const item = buildGeneratedArtworkItem(input, style)
  const baseUrl = normalizeSpace(input?.baseUrl)

  return {
    poster: makeSportsPosterSvgUrl(baseUrl, item),
    landscape: makeSportsThumbSvgUrl(baseUrl, item, 'landscape'),
    background: makeSportsThumbSvgUrl(baseUrl, item, 'background'),
    style
  }
}

function resolveGeneratedPosterUrl(baseUrl, input, style) {
  return makeSportsPosterUrl(baseUrl, buildGeneratedArtworkItem(input, style))
}

function resolveSportsPosterAsset(input = {}) {
  const baseUrl = normalizeSpace(input?.baseUrl)
  const artworkMode = resolveArtworkMode(input)
  const sportsArtwork = input?.sportsArtwork || {}
  const carriedArtwork = normalizeSpace(input?.carriedArtwork)
  const portraitPosterUrl = normalizeSpace(carriedArtwork || sportsArtwork?.poster)
  const landscapePosterUrl = normalizeSpace(sportsArtwork?.image || sportsArtwork?.landscapeImage)
  const matchup = hasMatchupContext(input)
  const formulaOne = isFormulaOneContext(input)
  const generated = buildGeneratedArtworkUrls(input)
  const generatedStyle = generated.style
  const generatedPosterUrl = generated.poster || resolveGeneratedPosterUrl(baseUrl, input, generatedStyle)
  const exactPosterAvailable = Boolean(portraitPosterUrl && !isLeagueFallbackArtwork(sportsArtwork))
  const formulaOneLeaguePosterFallback = Boolean(
    portraitPosterUrl &&
    isLeagueFallbackArtwork(sportsArtwork) &&
    formulaOne &&
    !matchup
  )

  if (artworkMode === 'svg' && generatedPosterUrl) {
    return {
      poster: generatedPosterUrl,
      posterShape: 'poster',
      posterMode: generatedStyle
    }
  }

  // PRIORITY: real event artwork from TheSportsDB ALWAYS wins over generated cards.
  // Generated cards are a last resort - real images make the catalog look like a real media UI.
  if (exactPosterAvailable) {
    return {
      poster: proxySportsImageUrl(baseUrl, portraitPosterUrl, 'poster') || portraitPosterUrl,
      posterShape: 'poster',
      posterMode: 'exact'
    }
  }

  // Real landscape/thumb image from TheSportsDB (not league fallback)
  if (landscapePosterUrl && !isLeagueFallbackArtwork(sportsArtwork)) {
    return {
      poster: proxySportsImageUrl(baseUrl, landscapePosterUrl, 'landscape') || landscapePosterUrl,
      posterShape: 'landscape',
      posterMode: 'exact-landscape'
    }
  }

  // Formula 1 cards look substantially better with the real league poster than
  // with the generated fallback when only league-level art is available.
  if (formulaOneLeaguePosterFallback) {
    return {
      poster: proxySportsImageUrl(baseUrl, portraitPosterUrl, 'poster') || portraitPosterUrl,
      posterShape: 'poster',
      posterMode: 'fallback-league'
    }
  }

  // No real event image available - fall back to generated poster card
  if (generatedPosterUrl) {
    return {
      poster: generatedPosterUrl,
      posterShape: 'poster',
      posterMode: generatedStyle
    }
  }

  // Absolute last resort — league-level fallback image or nothing
  return {
    poster: (proxySportsImageUrl(baseUrl, portraitPosterUrl || landscapePosterUrl, portraitPosterUrl ? 'poster' : 'landscape') ||
      portraitPosterUrl ||
      landscapePosterUrl),
    posterShape: portraitPosterUrl ? 'poster' : 'landscape',
    posterMode: 'fallback'
  }
}

function resolveSportsBackgroundAsset(input = {}) {
  const artworkMode = resolveArtworkMode(input)
  const generated = buildGeneratedArtworkUrls(input)
  const baseUrl = normalizeSpace(input?.baseUrl)
  const sportsArtwork = input?.sportsArtwork || {}
  const carriedBackground = normalizeSpace(input?.carriedBackground)
  const backgroundSourceUrl = normalizeSpace(
    carriedBackground ||
    sportsArtwork?.backgroundImage ||
    sportsArtwork?.landscapeImage ||
    sportsArtwork?.image
  )
  const backgroundFallback = makeSportsThumbUrl(
    baseUrl,
    buildGeneratedArtworkItem(
      input,
      generated.style
    ),
    'background'
  )

  if (artworkMode === 'svg') {
    return generated.background || backgroundFallback
  }

  return (
    proxySportsImageUrl(baseUrl, backgroundSourceUrl, 'background') ||
    backgroundSourceUrl ||
    backgroundFallback
  )
}

function resolveSportsLogoAsset(input = {}) {
  if (resolveArtworkMode(input) === 'svg') return ''
  const baseUrl = normalizeSpace(input?.baseUrl)
  const sportsArtwork = input?.sportsArtwork || {}
  const carriedLogo = normalizeSpace(input?.carriedLogo)
  const logoSourceUrl = normalizeSpace(carriedLogo || sportsArtwork?.logo || sportsArtwork?.leagueLogo)
  return proxySportsImageUrl(baseUrl, logoSourceUrl, 'logo') || logoSourceUrl
}

module.exports = {
  buildGeneratedArtworkItem,
  hasMatchupContext,
  isFormulaOneContext,
  isLeagueFallbackArtwork,
  resolveSportsPosterAsset,
  resolveSportsBackgroundAsset,
  resolveSportsLogoAsset
}
