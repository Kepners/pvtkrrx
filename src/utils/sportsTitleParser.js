const { getMappedLeagueEntry } = require('./leagueMap')

const QUALITY_RE = /^(?:2160p|1080p|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:\d{2,3}fps)?$/i
const SOURCE_RE = /^(?:hdtv|pdtv|sdtv|webrip|webdl|web-dl|web|bluray|bdrip|dvdrip|satfeed|iptv)$/i
const CODEC_RE = /^(?:x264|x265|h264|h265|hevc|avc|av1)(?:-.+)?$/i
const RELEASE_GROUP_RE = /^[A-Z0-9]+-[A-Za-z0-9]+$/
const HLG_HDR_RE = /^(?:hlg|hdr10?\+?|dovi?|dv|10bit|8bit)$/i
const GENERIC_SPORT_PREFIX_RE = /^(?:football|soccer|basketball|baseball|cricket|rugby|mma|boxing|wrestling|darts|golf|motorsport|motor|tennis|hockey|ice|american|uefa)$/i
const LEADING_TEAM_NOISE_RE = /^(?:game|games|match|matches|week|round|heat|session|fight|night|grand|prix|qualifying|practice|sprint|race|card|prelims?|early|cup|bowl|super|opening|closing|ceremony|playoffs?|finals?|semi(?:final)?|quarter(?:final)?|championship|title|event)$/i
const ROMAN_NUMERAL_RE = /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i
const TEAM_BROADCAST_RE = /\b(?:nbc|espn(?:2)?|sky(?:\s*sports?)?|bt(?:\s*sport)?|tnt(?:\s*sports?)?|fox(?:\s*sports?)?|cbs|abc|itv(?:4)?|tsn|bein(?:\s*sports?)?|canal\+?|dazn)\b/gi
const TEAM_LANGUAGE_RE = /\b(?:english|spanish|french|german|italian|portuguese)\b/gi
const TEAM_PRESENTATION_RE = /\b(?:condensed(?:\s*game)?|extended(?:\s*highlights?)?|highlights?|replay)\b/gi

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

function splitEventTitleTokens(raw) {
  const dotted = String(raw || '').split('.').map(token => token.trim()).filter(Boolean)
  if (dotted.length >= 2) return dotted
  return normalizeSegment(raw).split(/\s+/).filter(Boolean)
}

function resolveEventLeagueStart(tokens = []) {
  const parts = Array.isArray(tokens) ? tokens.map(normalizeSegment).filter(Boolean) : []
  const maxParts = Math.min(parts.length, 4)
  for (let count = 1; count <= maxParts; count += 1) {
    const slice = parts.slice(0, count)
    const spaced = slice.join(' ')
    const compact = slice.join('')
    if (EVENT_LEAGUE_RE.test(spaced) || EVENT_LEAGUE_RE.test(compact)) {
      return {
        leagueToken: spaced,
        nextIndex: count
      }
    }
  }
  return null
}

function extractFallbackDate(value) {
  const source = String(value || '').trim()
  if (!source) return ''

  const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
  if (iso && isValidDate(iso[1], iso[2], iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
  if (dmy && isValidDate(dmy[3], dmy[2], dmy[1])) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  const plain = source.match(/((?:19|20)\d{2}-\d{2}-\d{2})/)
  if (plain) return plain[1]

  return ''
}

function findStructuredDate(tokens, fallbackDate = '') {
  const maxStart = Math.min(tokens.length - 3, 5)
  for (let i = 1; i <= maxStart; i += 1) {
    const first = String(tokens[i] || '').trim()
    const second = String(tokens[i + 1] || '').trim()
    const third = String(tokens[i + 2] || '').trim()

    if (isValidDate(first, second, third)) {
      return {
        date: `${first}-${second}-${third}`,
        startIndex: i,
        nextIndex: i + 3
      }
    }

    if (isValidDate(third, second, first)) {
      return {
        date: `${third}-${second}-${first}`,
        startIndex: i,
        nextIndex: i + 3
      }
    }
  }

  const fallback = extractFallbackDate(fallbackDate)
  if (!fallback) return null

  const yearIndex = tokens.findIndex((token, index) =>
    index > 0 &&
    index <= 5 &&
    /^(19|20)\d{2}$/.test(String(token || '').trim())
  )
  if (yearIndex <= 0) return null

  const yearToken = String(tokens[yearIndex] || '').trim()
  if (!fallback.startsWith(`${yearToken}-`)) return null

  return {
    date: fallback,
    startIndex: yearIndex,
    nextIndex: yearIndex + 1
  }
}

function resolveLeagueToken(tokens) {
  const normalizedTokens = (Array.isArray(tokens) ? tokens : [])
    .map(normalizeSegment)
    .filter(Boolean)
  if (normalizedTokens.length === 0) return ''

  for (let start = 0; start < normalizedTokens.length; start += 1) {
    const candidate = normalizeSegment(normalizedTokens.slice(start).join(' '))
    if (getMappedLeagueEntry(candidate)) return candidate
  }

  if (normalizedTokens.length > 1 && GENERIC_SPORT_PREFIX_RE.test(normalizedTokens[0])) {
    return normalizeSegment(normalizedTokens.slice(1).join(' '))
  }

  return normalizeSegment(normalizedTokens.join(' '))
}

function trimTrailingMetadataTokens(tokens) {
  const parts = [...(Array.isArray(tokens) ? tokens : [])]
  while (parts.length > 0) {
    const token = String(parts[parts.length - 1] || '').trim()
    if (!token) {
      parts.pop()
      continue
    }
    if (
      isMetadataToken(token) ||
      isReleaseGroupToken(token) ||
      /^(?:mp4|mkv|avi|ts|m4v)$/i.test(token)
    ) {
      parts.pop()
      continue
    }
    break
  }
  return parts
}

function trimLeadingTeamNoise(tokens) {
  const parts = [...(Array.isArray(tokens) ? tokens : [])]
  let strippedNoiseCount = 0
  while (parts.length > 1) {
    const token = String(parts[0] || '').trim()
    if (!token) {
      parts.shift()
      continue
    }
    if (
      LEADING_TEAM_NOISE_RE.test(token) ||
      /^\d{1,3}$/.test(token) ||
      (strippedNoiseCount > 0 && ROMAN_NUMERAL_RE.test(token))
    ) {
      parts.shift()
      strippedNoiseCount += 1
      continue
    }
    break
  }
  return parts
}

function normalizeTeamLabel(value) {
  return normalizeSegment(
    String(value || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(TEAM_BROADCAST_RE, ' ')
      .replace(TEAM_LANGUAGE_RE, ' ')
      .replace(TEAM_PRESENTATION_RE, ' ')
  )
}

function normalizeTeamTokens(tokens) {
  const normalized = trimTrailingMetadataTokens(
    (Array.isArray(tokens) ? tokens : [])
      .map(normalizeSegment)
      .filter(Boolean)
  )
  return normalizeTeamLabel(trimLeadingTeamNoise(normalized).join(' '))
}

function parseSportsTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = raw.split('.').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 5) return null

  const dateMatch = findStructuredDate(tokens, fallbackDate)
  if (!dateMatch) return null

  const league = resolveLeagueToken(tokens.slice(0, dateMatch.startIndex))
  const tail = tokens.slice(dateMatch.nextIndex)
  if (!league || tail.length < 3) return null

  const separatorIndex = tail.findIndex(isTeamSeparator)
  if (separatorIndex <= 0 || separatorIndex >= tail.length - 1) return null

  const homeTeamTokens = tail.slice(0, separatorIndex)
  const trailingTokens = tail.slice(separatorIndex + 1)

  const metadataIndex = trailingTokens.findIndex(isMetadataToken)
  const awayTeamTokens = metadataIndex === -1
    ? trailingTokens
    : trailingTokens.slice(0, metadataIndex)

  if (homeTeamTokens.length === 0 || awayTeamTokens.length === 0) return null

  const homeTeam = normalizeTeamTokens(homeTeamTokens)
  const awayTeam = normalizeTeamTokens(awayTeamTokens)
  if (!league || !homeTeam || !awayTeam) return null

  const qualityToken = metadataIndex === -1 ? '' : trailingTokens[metadataIndex]
  const quality = QUALITY_RE.test(qualityToken) ? qualityToken : ''

  return {
    league,
    date: dateMatch.date,
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

  const tokens = splitEventTitleTokens(raw)
  if (tokens.length < 4) return null

  const leagueStart = resolveEventLeagueStart(tokens)
  if (!leagueStart) return null

  let dateStr = ''
  let eventStartIndex = leagueStart.nextIndex

  // Try to extract YYYY MM DD date immediately after the league token.
  if (
    tokens.length > eventStartIndex + 2 &&
    isValidDate(tokens[eventStartIndex], tokens[eventStartIndex + 1], tokens[eventStartIndex + 2])
  ) {
    dateStr = `${tokens[eventStartIndex]}-${tokens[eventStartIndex + 1]}-${tokens[eventStartIndex + 2]}`
    eventStartIndex += 3
  } else if (tokens.length > eventStartIndex && /^(19|20)\d{2}$/.test(tokens[eventStartIndex])) {
    // Just a year token - skip it, don't treat it as part of event name
    eventStartIndex += 1
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

  const league = normalizeSegment(leagueStart.leagueToken)
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
