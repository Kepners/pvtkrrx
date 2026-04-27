const { getMappedLeagueEntry } = require('./leagueMap')

const QUALITY_RE = /^(?:(?:2160p|1080p|1080i|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:[a-z]{1,4})?(?:\d{2,3}(?:fps)?)?|\d{2,3}fps)$/i
const SOURCE_RE = /^(?:hdtv|pdtv|sdtv|webrip|webdl|web-dl|web|bluray|bdrip|dvdrip|satfeed|iptv|espn(?:p|plus|\+)?|f1tv|nesn|msg|usan?|nbcsn|sportsnet|sn|bally|bein(?:sport)?\d*|eurosport|skynz|fubo|newvision)$/i
const CODEC_RE = /^(?:x264|x265|h264|h265|hevc|avc|av1)(?:-.+)?$/i
const RELEASE_GROUP_RE = /^[A-Z0-9]+-[A-Za-z0-9]+$/
const HLG_HDR_RE = /^(?:hlg|hdr10?\+?|dovi?|dv|10bit|8bit)$/i
const GENERIC_SPORT_PREFIX_RE = /^(?:football|soccer|basketball|baseball|cricket|rugby|mma|boxing|wrestling|darts|golf|motorsport|motor|tennis|hockey|ice|american|uefa)$/i
const LEADING_TEAM_NOISE_RE = /^(?:game|games|match|matches|week|round|heat|session|fight|night|grand|prix|qualifying|practice|sprint|race|main|card|prelims?|early|cup|bowl|super|opening|closing|ceremony|playoffs?|postseason|finals?|semi(?:final)?|quarter(?:final)?|championship|title|event|world|wimbledon|australian|roland|garros|open|us|east|west|centre|center|court|heavyweight|middleweight|welterweight|lightweight|featherweight|qf|sf|r\d+|gm\d+|g\d+|\d+(?:st|nd|rd|th))$/i
const ROMAN_NUMERAL_RE = /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i
const TEAM_BROADCAST_RE = /\b(?:nbc|nbcsn|espn(?:2|p|plus|\+)?|f1tv|nesn|msg|usan?|yes(?:\s*network)?|sky(?:\s*sports?)?|bt(?:\s*sport)?|tnt(?:\s*sports?)?|fox(?:\s*sports?)?|cbs|abc|itv(?:4)?|tsn|sportsnet|sn|bally|bein(?:\s*sports?)?\d*|canal\+?|dazn|eurosport|skynz|fubo|newvision)\b/gi
const TEAM_LANGUAGE_RE = /\b(?:en|english|spanish|french|german|italian|portuguese)\b/gi
const TEAM_PRESENTATION_RE = /\b(?:condensed(?:\s*game)?|extended(?:\s*highlights?)?|highlights?|replay)\b/gi
const TEAM_TAIL_NOISE_RE = /^(?:game|games|round|matchday|main|card|pre|post|episode|show|event|fight|full|review|preview|highlights?|replay|coverage|studio|apple|tv|fubo|beinsport\d*|skynz|z3r0|nva|wrestlemania|east|west|centre|center|court|playoffs?|postseason|finals?|semi(?:final)?|quarter(?:final)?|qf|sf|r\d+|gm\d+|g\d+|\d+(?:st|nd|rd|th))$/i
const EVENT_SOURCE_NOISE_RE = /^(?:apple|tv|fubo|skynz|z3r0|nva|espn(?:p|plus|\+)?|f1tv|nesn|msg|usan?|eurosport)$/i

// Known league/series tokens that start non-vs event titles
const EVENT_LEAGUE_RE = /^(?:Formula1|F1|UFC|PFL|Bellator|ONE|MotoGP|Moto\s*GP|NASCAR|IndyCar|WRC|Supercars|Supercars\s*Championship|V8SC|Bathurst|WSBK|WEC|FormulaE|Rally|Dakar|PGA|PGA\s*Tour|LPGA|LPGA\s*Tour|Masters|IPL|Indian\s*Premier\s*League|MLS|Major\s*League\s*Soccer|MLB|Major\s*League\s*Baseball|NBA|NBA\s*Playoffs|Tour\s*de\s*France|Giro|Vuelta|TDF)$/i

function normalizeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
  return value === 'vs' || value === 'v' || value === '@'
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

function splitMatchupTitleTokens(raw) {
  return String(raw || '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[._/\\:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function resolveEventLeagueStart(tokens = []) {
  const parts = Array.isArray(tokens) ? tokens.map(normalizeSegment).filter(Boolean) : []
  const maxParts = Math.min(parts.length, 4)
  let bestMatch = null
  for (let count = 1; count <= maxParts; count += 1) {
    const slice = parts.slice(0, count)
    const spaced = slice.join(' ')
    const compact = slice.join('')
    if (EVENT_LEAGUE_RE.test(spaced) || EVENT_LEAGUE_RE.test(compact)) {
      bestMatch = {
        leagueToken: spaced,
        nextIndex: count
      }
    }
  }
  return bestMatch
}

function extractFallbackDate(value) {
  const source = String(value || '').trim()
  if (!source) return ''

  const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
  if (iso && isValidDate(iso[1], iso[2], iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
  if (dmy && isValidDate(dmy[3], dmy[2], dmy[1])) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
  if (compact && isValidDate(compact[1], compact[2], compact[3])) return `${compact[1]}-${compact[2]}-${compact[3]}`

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

function findLeadingLeagueSpan(tokens = []) {
  const parts = (Array.isArray(tokens) ? tokens : [])
    .map(normalizeSegment)
    .filter(Boolean)
  if (parts.length === 0) return null

  let best = null
  const maxParts = Math.min(parts.length, 6)
  for (let count = 1; count <= maxParts; count += 1) {
    const candidate = normalizeSegment(parts.slice(0, count).join(' '))
    const mapped = getMappedLeagueEntry(candidate)
    if (mapped) {
      best = {
        league: mapped.name || candidate,
        nextIndex: count
      }
    }
  }

  if (best) return best

  if (parts.length > 1 && GENERIC_SPORT_PREFIX_RE.test(parts[0])) {
    return {
      league: resolveLeagueToken(parts.slice(0, Math.min(parts.length, 3))),
      nextIndex: 1
    }
  }

  return null
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
    const next = String(parts[1] || '').trim()
    if (!token) {
      parts.shift()
      continue
    }
    if (/^(?:east|west)$/i.test(token)) {
      const nextIsRoundNoise = Boolean(
        LEADING_TEAM_NOISE_RE.test(next) ||
        GENERIC_SPORT_PREFIX_RE.test(next) ||
        /^(?:19|20)\d{2}$/.test(next) ||
        /^\d{1,3}$/.test(next)
      )
      if (!nextIsRoundNoise) break
    }
    if (
      LEADING_TEAM_NOISE_RE.test(token) ||
      GENERIC_SPORT_PREFIX_RE.test(token) ||
      /^(?:19|20)\d{2}$/.test(token) ||
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
      .replace(/\b(?:m4rtyr|thecig|mwr|billie|mgp|ntb|ctrlhd|deflate|organic|tgx|nf|int)\b.*$/gi, ' ')
      .replace(TEAM_BROADCAST_RE, ' ')
      .replace(TEAM_LANGUAGE_RE, ' ')
      .replace(TEAM_PRESENTATION_RE, ' ')
      .replace(/\b(?:mlb|nba(?:\s+playoffs?)?|nfl|nhl|mls|ipl|pga(?:\s+tour)?|motogp|ufc)\b$/gi, ' ')
      .replace(/\b(?:r\d+|gm\d+|g\d+|\d{2,3}fps|fps)\b/gi, ' ')
  )
}

function normalizeTeamTokens(tokens) {
  const normalized = trimTrailingMetadataTokens(
    (Array.isArray(tokens) ? tokens : [])
      .map(normalizeSegment)
      .filter(Boolean)
  )
  const leadingCleaned = trimLeadingTeamNoise(normalized)
  const trimmed = []
  for (let index = 0; index < leadingCleaned.length; index += 1) {
    const token = String(leadingCleaned[index] || '').trim()
    const next = String(leadingCleaned[index + 1] || '').trim()
    if (!token) continue
    const isDirectionalTeamPrefix = /^(?:east|west)$/i.test(token) && Boolean(next) && !(
      LEADING_TEAM_NOISE_RE.test(next) ||
      GENERIC_SPORT_PREFIX_RE.test(next) ||
      /^(?:19|20)\d{2}$/.test(next) ||
      /^\d{1,3}$/.test(next)
    )
    if (
      isMetadataToken(token) ||
      parseSingleDateToken(token) ||
      (TEAM_TAIL_NOISE_RE.test(token) && !isDirectionalTeamPrefix) ||
      /^(?:r\d+|gm\d+|g\d+)$/i.test(token) ||
      (/^\d{1,2}$/.test(token) && /^\d{1,2}$/.test(next)) ||
      (/^(19|20)\d{2}$/.test(token) && /^\d{1,2}$/.test(next)) ||
      EVENT_SOURCE_NOISE_RE.test(token)
    ) {
      break
    }
    trimmed.push(token)
  }
  const cleanedLabel = normalizeTeamLabel(trimmed.join(' '))
  return trimTrailingMetadataTokens(cleanedLabel.split(/\s+/)).join(' ')
}

function parseSingleDateToken(token = '') {
  const value = String(token || '').trim()
  if (!value) return ''

  const iso = value.match(/^((?:19|20)\d{2})[._/-](\d{2})[._/-](\d{2})$/)
  if (iso && isValidDate(iso[1], iso[2], iso[3])) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = value.match(/^(\d{2})[._/-](\d{2})[._/-]((?:19|20)\d{2})$/)
  if (dmy && isValidDate(dmy[3], dmy[2], dmy[1])) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  return ''
}

function resolveSeasonYearHint(token = '', nextToken = '') {
  const value = String(token || '').trim()
  if (!value) return ''

  const season = value.match(/^((?:19|20)\d{2})[/-](\d{2})$/)
  if (season) {
    const century = season[1].slice(0, 2)
    return `${century}${season[2]}`
  }

  if (/^(19|20)\d{2}$/.test(value)) {
    const trailing = String(nextToken || '').trim()
    if (/^\d{2}$/.test(trailing)) {
      const century = value.slice(0, 2)
      return `${century}${trailing}`
    }
    return value
  }

  return ''
}

function stripLeadingSeasonTokens(tokens = []) {
  const parts = [...(Array.isArray(tokens) ? tokens : [])]
  let yearHint = ''

  while (parts.length > 0) {
    const current = String(parts[0] || '').trim()
    const next = String(parts[1] || '').trim()
    const resolvedYearHint = resolveSeasonYearHint(current, next)
    if (!resolvedYearHint) break

    yearHint = resolvedYearHint
    parts.shift()
    if (/^(19|20)\d{2}$/.test(current) && /^\d{2}$/.test(next)) {
      parts.shift()
    }
  }

  return {
    tokens: parts,
    yearHint
  }
}

function parseLeadingDateTokens(tokens = [], fallbackDate = '') {
  const parts = (Array.isArray(tokens) ? tokens : []).map((token) => String(token || '').trim()).filter(Boolean)
  if (parts.length === 0) return null

  const single = parseSingleDateToken(parts[0])
  if (single) {
    return {
      date: single,
      nextIndex: 1
    }
  }

  if (parts.length >= 3) {
    const first = parts[0]
    const second = parts[1]
    const third = parts[2]
    if (isValidDate(first, second, third)) {
      return {
        date: `${first}-${second}-${third}`,
        nextIndex: 3
      }
    }

    if (isValidDate(third, second, first)) {
      return {
        date: `${third}-${second}-${first}`,
        nextIndex: 3
      }
    }
  }

  const fallback = extractFallbackDate(fallbackDate)
  if (!fallback) return null
  return {
    date: fallback,
    nextIndex: 0
  }
}

function inferDateFromMonthDayTokens(left = '', right = '', yearHint = '') {
  const year = String(yearHint || '').trim()
  if (!/^(19|20)\d{2}$/.test(year)) return ''

  const a = String(left || '').trim()
  const b = String(right || '').trim()
  if (!/^\d{2}$/.test(a) || !/^\d{2}$/.test(b)) return ''

  if (isValidDate(year, b, a)) return `${year}-${b}-${a}`
  if (isValidDate(year, a, b)) return `${year}-${a}-${b}`
  return ''
}

function findTrailingDateSpan(tokens = [], yearHint = '', fallbackDate = '') {
  const parts = (Array.isArray(tokens) ? tokens : []).map((token) => String(token || '').trim()).filter(Boolean)
  for (let index = 0; index < parts.length; index += 1) {
    const single = parseSingleDateToken(parts[index])
    if (single) {
      return {
        date: single,
        startIndex: index,
        nextIndex: index + 1
      }
    }
  }

  for (let index = 0; index <= parts.length - 3; index += 1) {
    const first = parts[index]
    const second = parts[index + 1]
    const third = parts[index + 2]
    if (isValidDate(first, second, third)) {
      return {
        date: `${first}-${second}-${third}`,
        startIndex: index,
        nextIndex: index + 3
      }
    }

    if (isValidDate(third, second, first)) {
      return {
        date: `${third}-${second}-${first}`,
        startIndex: index,
        nextIndex: index + 3
      }
    }
  }

  if (parts.length >= 2) {
    for (let index = 0; index <= parts.length - 2; index += 1) {
      const inferred = inferDateFromMonthDayTokens(parts[index], parts[index + 1], yearHint)
      if (inferred) {
        return {
          date: inferred,
          startIndex: index,
          nextIndex: index + 2
        }
      }
    }
  }

  const fallback = extractFallbackDate(fallbackDate)
  if (!fallback) return null
  return {
    date: fallback,
    startIndex: parts.length,
    nextIndex: parts.length
  }
}

function parseFlexibleMatchupTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = splitMatchupTitleTokens(raw)
  if (tokens.length < 4) return null

  const separatorIndex = tokens.findIndex(isTeamSeparator)
  if (separatorIndex <= 0 || separatorIndex >= tokens.length - 1) return null

  const beforeSeparator = tokens.slice(0, separatorIndex)
  const afterSeparator = tokens.slice(separatorIndex + 1)
  const leadingLeague = findLeadingLeagueSpan(beforeSeparator)
  const preTeamTokens = leadingLeague?.league
    ? beforeSeparator.slice(leadingLeague.nextIndex)
    : beforeSeparator
  const leadingDate = parseLeadingDateTokens(preTeamTokens, fallbackDate)
  const useLeadingDate = Boolean(leadingDate && leadingDate.nextIndex > 0)
  const seasonInfo = useLeadingDate
    ? { tokens: preTeamTokens, yearHint: leadingDate.date.slice(0, 4) }
    : stripLeadingSeasonTokens(preTeamTokens)
  const preSeparatorDate = useLeadingDate
    ? null
    : findTrailingDateSpan(seasonInfo.tokens, seasonInfo.yearHint, '')

  const homeTeamTokens = useLeadingDate
    ? preTeamTokens.slice(leadingDate.nextIndex)
    : (preSeparatorDate && preSeparatorDate.nextIndex < seasonInfo.tokens.length
      ? seasonInfo.tokens.slice(preSeparatorDate.nextIndex)
      : seasonInfo.tokens)
  const dateHint = String(
    (useLeadingDate ? leadingDate?.date?.slice(0, 4) : '') ||
    preSeparatorDate?.date?.slice(0, 4) ||
    seasonInfo.yearHint ||
    ''
  ).trim()
  const trailingDate = (!useLeadingDate && !preSeparatorDate)
    ? findTrailingDateSpan(afterSeparator, dateHint, fallbackDate)
    : null

  const awayTeamTokens = trailingDate
    ? afterSeparator.slice(0, trailingDate.startIndex)
    : afterSeparator
  const date = (useLeadingDate ? leadingDate?.date : '') || preSeparatorDate?.date || trailingDate?.date || extractFallbackDate(fallbackDate)

  const homeTeam = normalizeTeamTokens(homeTeamTokens)
  const awayTeam = normalizeTeamTokens(awayTeamTokens)
  if (!homeTeam || !awayTeam || !date) return null

  return {
    league: leadingLeague?.league || '',
    date,
    homeTeam,
    awayTeam,
    raw
  }
}

function trimTrailingEventDateTokens(tokens = [], fallbackDate = '') {
  const parts = [...(Array.isArray(tokens) ? tokens : [])]
  const fallback = extractFallbackDate(fallbackDate)
  const yearHint = fallback ? fallback.slice(0, 4) : ''

  while (parts.length > 0) {
    const last = String(parts[parts.length - 1] || '').trim()
    const prev = String(parts[parts.length - 2] || '').trim()
    const prevPrev = String(parts[parts.length - 3] || '').trim()
    if (!last) {
      parts.pop()
      continue
    }

    if (parseSingleDateToken(last)) {
      parts.pop()
      continue
    }

    if (/^\d{1,2}$/.test(last) && /^\d{1,2}$/.test(prev) && yearHint) {
      parts.splice(parts.length - 2, 2)
      continue
    }

    if (/^(19|20)\d{2}$/.test(last) && /^\d{1,2}$/.test(prev) && /^\d{1,2}$/.test(prevPrev)) {
      parts.splice(parts.length - 3, 3)
      continue
    }

    break
  }

  return parts
}

function normalizeEventNameTokens(tokens = [], fallbackDate = '') {
  const cleaned = []
  const stripped = trimTrailingEventDateTokens(tokens, fallbackDate)

  for (let index = 0; index < stripped.length; index += 1) {
    const token = String(stripped[index] || '').trim()
    const next = String(stripped[index + 1] || '').trim()
    const lower = token.toLowerCase()
    if (!token) continue
    if (isMetadataToken(token) || isReleaseGroupToken(token)) break
    if (/^(?:mp4|mkv|avi|ts|m4v)$/i.test(token)) break
    if (EVENT_SOURCE_NOISE_RE.test(token)) break
    if (/^(19|20)\d{2}$/.test(token) || /^\d{1,2}$/.test(token)) continue
    if (/^(?:round|session|race)?\d+$/i.test(token) || /^r\d+$/i.test(token)) continue
    if ((lower === 'round' || lower === 'event' || lower === 'episode') && /^\d+$/.test(next)) {
      index += 1
      continue
    }
    if (lower === 'full' && /^race$/i.test(next)) {
      index += 1
      continue
    }
    if (['replay', 'review', 'preview', 'coverage', 'studio'].includes(lower)) continue
    if (['free', 'practice', 'qualifying', 'qualifier', 'sprint', 'session', 'warmup', 'fp1', 'fp2', 'fp3'].includes(lower)) continue
    if (lower === 'race' && cleaned.length > 0) continue
    if (lower === 'apple' && /^tv$/i.test(next)) {
      index += 1
      continue
    }
    cleaned.push(token)
  }

  return cleaned
}

function parseSportsTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = raw.split('.').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 5) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const dateMatch = findStructuredDate(tokens, fallbackDate)
  if (!dateMatch) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const league = resolveLeagueToken(tokens.slice(0, dateMatch.startIndex))
  const tail = tokens.slice(dateMatch.nextIndex)
  if (!league || tail.length < 3) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const separatorIndex = tail.findIndex(isTeamSeparator)
  if (separatorIndex <= 0 || separatorIndex >= tail.length - 1) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const homeTeamTokens = tail.slice(0, separatorIndex)
  const trailingTokens = tail.slice(separatorIndex + 1)

  const metadataIndex = trailingTokens.findIndex(isMetadataToken)
  const awayTeamTokens = metadataIndex === -1
    ? trailingTokens
    : trailingTokens.slice(0, metadataIndex)

  if (homeTeamTokens.length === 0 || awayTeamTokens.length === 0) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const homeTeam = normalizeTeamTokens(homeTeamTokens)
  const awayTeam = normalizeTeamTokens(awayTeamTokens)
  if (!league || !homeTeam || !awayTeam) return parseFlexibleMatchupTitle(raw, fallbackDate)

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
function parseSportsEventTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = splitEventTitleTokens(raw)
  if (tokens.length < 2) return null

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

  const normalizedEventTokens = normalizeEventNameTokens(eventTokens, dateStr || fallbackDate)
  if (normalizedEventTokens.length === 0) return null

  const league = normalizeSegment(leagueStart.leagueToken)
  const eventName = normalizeSegment(normalizedEventTokens.join(' '))
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
