const { makeSportsPosterUrl, makeSportsThumbUrl } = require('./sportsThumb')
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

function resolveGeneratedPosterUrl(baseUrl, input, style) {
  return makeSportsPosterUrl(baseUrl, buildGeneratedArtworkItem(input, style))
}

function resolveSportsPosterAsset(input = {}) {
  const baseUrl = normalizeSpace(input?.baseUrl)
  const sportsArtwork = input?.sportsArtwork || {}
  const carriedArtwork = normalizeSpace(input?.carriedArtwork)
  const portraitPosterUrl = normalizeSpace(carriedArtwork || sportsArtwork?.poster)
  const landscapePosterUrl = normalizeSpace(sportsArtwork?.image || sportsArtwork?.landscapeImage)
  const matchup = hasMatchupContext(input)
  const formulaOne = isFormulaOneContext(input)
  const generatedStyle = matchup ? 'matchup' : (formulaOne ? 'formula1' : 'league-event')
  const generatedPosterUrl = resolveGeneratedPosterUrl(baseUrl, input, generatedStyle)
  const exactPosterAvailable = Boolean(portraitPosterUrl && !isLeagueFallbackArtwork(sportsArtwork))

  if (matchup) {
    return {
      poster: generatedPosterUrl || portraitPosterUrl || landscapePosterUrl,
      posterShape: 'poster',
      posterMode: 'matchup'
    }
  }

  if (exactPosterAvailable) {
    return {
      poster: proxySportsImageUrl(baseUrl, portraitPosterUrl, 'poster') || portraitPosterUrl,
      posterShape: 'poster',
      posterMode: formulaOne ? 'formula1-exact' : 'exact'
    }
  }

  if (generatedPosterUrl) {
    return {
      poster: generatedPosterUrl,
      posterShape: 'poster',
      posterMode: generatedStyle
    }
  }

  return {
    poster: (proxySportsImageUrl(baseUrl, portraitPosterUrl || landscapePosterUrl, portraitPosterUrl ? 'poster' : 'landscape') ||
      portraitPosterUrl ||
      landscapePosterUrl),
    posterShape: portraitPosterUrl ? 'poster' : 'landscape',
    posterMode: 'fallback'
  }
}

function resolveSportsBackgroundAsset(input = {}) {
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
      hasMatchupContext(input) ? 'matchup' : (isFormulaOneContext(input) ? 'formula1' : 'league-event')
    ),
    'background'
  )

  return (
    proxySportsImageUrl(baseUrl, backgroundSourceUrl, 'background') ||
    backgroundSourceUrl ||
    backgroundFallback
  )
}

function resolveSportsLogoAsset(input = {}) {
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
