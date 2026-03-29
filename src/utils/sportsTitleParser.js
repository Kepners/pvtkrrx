const QUALITY_RE = /^(?:2160p|1080p|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:\d{2,3}fps)?$/i
const SOURCE_RE = /^(?:hdtv|pdtv|sdtv|webrip|webdl|web-dl|web|bluray|bdrip|dvdrip|satfeed|iptv)$/i
const CODEC_RE = /^(?:x264|x265|h264|h265|hevc|avc|av1)(?:-.+)?$/i
const RELEASE_GROUP_RE = /^[A-Z0-9]+-[A-Za-z0-9]+$/
const HLG_HDR_RE = /^(?:hlg|hdr10?\+?|dovi?|dv|10bit|8bit)$/i

// Known league/series tokens that start non-vs event titles
const EVENT_LEAGUE_RE = /^(?:Formula1|F1|UFC|MotoGP|NASCAR|IndyCar|WRC|Supercars|V8SC|Bathurst|WSBK|WEC|FormulaE|Rally|Dakar|PGA|LPGA|Masters|Tour\s*de\s*France|Giro|Vuelta|TDF)$/i

function normalizeSegment(value) {
  return String(value || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isValidDate(year, month, day) {
  if (!/^(19|20)\d{2}$/.test(String(year || ''))) return false
  if (!/^\d{2}$/.test(String(month || '')) || !/^\d{2}$/.test(String(day || ''))) return false

  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

function isTeamSeparator(token) {
  const value = String(token || '').trim().toLowerCase()
  return value === 'vs' || value === 'v'
}

function isMetadataToken(token) {
  const value = String(token || '').trim()
  if (!value) return false
  return QUALITY_RE.test(value) || SOURCE_RE.test(value) || CODEC_RE.test(value) || HLG_HDR_RE.test(value)
}

function isReleaseGroupToken(token) {
  return RELEASE_GROUP_RE.test(String(token || '').trim())
}

function parseSportsTitle(title) {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = raw.split('.').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 7) return null

  const [leagueToken, year, month, day, ...tail] = tokens
  if (!leagueToken || !isValidDate(year, month, day)) return null

  const separatorIndex = tail.findIndex(isTeamSeparator)
  if (separatorIndex <= 0 || separatorIndex >= tail.length - 1) return null

  const homeTeamTokens = tail.slice(0, separatorIndex)
  const trailingTokens = tail.slice(separatorIndex + 1)

  const metadataIndex = trailingTokens.findIndex(isMetadataToken)
  const awayTeamTokens = metadataIndex === -1
    ? trailingTokens
    : trailingTokens.slice(0, metadataIndex)

  if (homeTeamTokens.length === 0 || awayTeamTokens.length === 0) return null

  const league = normalizeSegment(leagueToken)
  const homeTeam = normalizeSegment(homeTeamTokens.join(' '))
  const awayTeam = normalizeSegment(awayTeamTokens.join(' '))
  if (!league || !homeTeam || !awayTeam) return null

  const qualityToken = metadataIndex === -1 ? '' : trailingTokens[metadataIndex]
  const quality = QUALITY_RE.test(qualityToken) ? qualityToken : ''

  return {
    league,
    date: `${year}-${month}-${day}`,
    homeTeam,
    awayTeam,
    ...(quality ? { quality } : {}),
    raw
  }
}

/**
 * Parse non-vs event titles like F1, UFC, MotoGP, Supercars.
 * Returns { league, date?, eventName, quality?, raw } or null.
 *
 * Patterns handled:
 *   Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB.h265-VERUM
 *   UFC.Fight.Night.270.Main.Card.1080p.WEB.h264-GROUP
 *   Formula1.2026.Japanese.Grand.Prix.Practice.Two.HLG.2160p.WEB.h265-VERUM
 *   Supercars.2026.Round.03.Melbourne.Race.1.1080p.HDTV
 *   MotoGP.2026.Round.04.Spanish.GP.Sprint.720p
 */
function parseSportsEventTitle(title) {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = raw.split('.').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 4) return null

  // First token must be a known event-league token
  const leagueToken = tokens[0]
  if (!EVENT_LEAGUE_RE.test(leagueToken)) return null

  let dateStr = ''
  let eventStartIndex = 1

  // Try to extract YYYY.MM.DD date after the league token
  if (tokens.length > 3 && isValidDate(tokens[1], tokens[2], tokens[3])) {
    dateStr = `${tokens[1]}-${tokens[2]}-${tokens[3]}`
    eventStartIndex = 4
  } else if (tokens.length > 1 && /^(19|20)\d{2}$/.test(tokens[1])) {
    // Just a year token — skip it, don't treat it as part of event name
    eventStartIndex = 2
  }

  // Collect event name tokens until we hit metadata
  const eventTokens = []
  let quality = ''
  for (let i = eventStartIndex; i < tokens.length; i++) {
    const token = tokens[i]
    if (isMetadataToken(token)) {
      if (QUALITY_RE.test(token)) quality = token
      break
    }
    if (isReleaseGroupToken(token)) break
    // Skip pure noise at the end (file extensions)
    if (/^\w{2,4}$/.test(token) && /^(mp4|mkv|avi|ts|m4v)$/i.test(token)) break
    eventTokens.push(token)
  }

  if (eventTokens.length === 0) return null

  const league = normalizeSegment(leagueToken)
  const eventName = normalizeSegment(eventTokens.join(' '))
  if (!league || !eventName) return null

  return {
    league,
    ...(dateStr ? { date: dateStr } : {}),
    eventName,
    ...(quality ? { quality } : {}),
    raw
  }
}

module.exports = {
  parseSportsTitle,
  parseSportsEventTitle
}
