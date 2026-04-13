const { getMappedLeagueEntry, listMappedLeagues, mapLeague } = require('./leagueMap')
const { normalizeSportKey } = require('./sportsRules')
const { parseSportsEventTitle, parseSportsTitle } = require('./sportsTitleParser')

const SPORTS_META_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  AMBIGUOUS: 'ambiguous',
  NOT_FOUND: 'not_found',
  WEAK_MATCH: 'weak_match',
  FALLBACK_ONLY: 'fallback_only'
})

const GENERIC_EVENT_TOKENS = new Set([
  'card',
  'cup',
  'event',
  'fight',
  'final',
  'finals',
  'game',
  'grand',
  'league',
  'main',
  'match',
  'night',
  'playoff',
  'playoffs',
  'prelims',
  'prix',
  'qualifying',
  'race',
  'round',
  'session'
])

const TRACKER_NOISE_TOKENS = new Set([
  '1080i',
  '1080p',
  '2160p',
  '480p',
  '576p',
  '720p',
  'aac',
  'ac3',
  'brrip',
  'ddp5',
  'dsnp',
  'dubbed',
  'dublado',
  'eng',
  'extended',
  'h264',
  'h265',
  'hdtv',
  'hevc',
  'hdr',
  'internal',
  'multi',
  'proper',
  'repack',
  'rip',
  'sdtv',
  'uhd',
  'web',
  'webrip',
  'webdl',
  'x264',
  'x265'
])

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isValidResolutionDate(year, month, day) {
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

function normalizeIdentityToken(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/\butd\b/g, 'united')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeIdentity(value, options = {}) {
  const genericTokens = options.genericTokens instanceof Set ? options.genericTokens : new Set()
  const keepNumbers = options.keepNumbers !== false

  return normalizeIdentityToken(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => {
      if (genericTokens.has(token)) return false
      if (keepNumbers) return token.length > 1 || /^\d+$/.test(token)
      return token.length > 1 && !/^\d+$/.test(token)
    })
}

function extractResolutionDate(value = '') {
  const source = String(value || '').trim()
  if (!source) return ''

  const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

  const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
  if (compact && isValidResolutionDate(compact[1], compact[2], compact[3])) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`
  }

  const plain = source.match(/\b((?:19|20)\d{2}-\d{2}-\d{2})\b/)
  return plain ? plain[1] : ''
}

function normalizeLeagueLabel(value) {
  const raw = normalizeSpace(value)
  if (!raw) return ''
  return normalizeSpace(mapLeague(raw) || raw)
}

function normalizeEventNameLabel(value) {
  return normalizeSpace(value)
}

function splitTrackerTitleTokens(value = '') {
  return normalizeSpace(
    String(value || '')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/[._/\\:-]+/g, ' ')
  )
    .split(/\s+/)
    .filter(Boolean)
}

function isCompactResolutionDateToken(token = '') {
  const match = String(token || '').trim().match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/)
  if (!match || !isValidResolutionDate(match[1], match[2], match[3])) return ''
  return `${match[1]}-${match[2]}-${match[3]}`
}

function stripResolutionDateTokens(tokens = [], date = '') {
  const normalizedDate = normalizeSpace(date).slice(0, 10)
  const dateParts = normalizedDate ? normalizedDate.split('-') : []
  const stripped = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index] || '').trim()
    if (!token) continue

    if (isCompactResolutionDateToken(token)) continue

    if (
      dateParts.length === 3 &&
      token === dateParts[0] &&
      String(tokens[index + 1] || '').trim() === dateParts[1] &&
      String(tokens[index + 2] || '').trim() === dateParts[2]
    ) {
      index += 2
      continue
    }

    if (
      dateParts.length === 3 &&
      token === dateParts[2] &&
      String(tokens[index + 1] || '').trim() === dateParts[1] &&
      String(tokens[index + 2] || '').trim() === dateParts[0]
    ) {
      index += 2
      continue
    }

    stripped.push(token)
  }

  return stripped
}

function isResolutionNoiseToken(token = '') {
  const normalized = normalizeIdentityToken(token)
  if (!normalized) return true
  if (GENERIC_EVENT_TOKENS.has(normalized) || TRACKER_NOISE_TOKENS.has(normalized)) return true
  if (['feed', 'full', 'h', 'live', 'mp1', 'mp2', 'mp3', 'newvision', 'replay', 'stream', 'tptv'].includes(normalized)) return true
  if (/^(?:264|265|x264|x265)$/i.test(normalized)) return true
  if (/^(19|20)\d{2}$/.test(normalized) || /^\d{1,2}$/.test(normalized)) return true
  return false
}

function trimResolutionCandidateTokens(tokens = []) {
  const parts = [...(Array.isArray(tokens) ? tokens : [])]
    .map((token) => String(token || '').trim())
    .filter(Boolean)

  while (parts.length > 1 && isResolutionNoiseToken(parts[0])) parts.shift()
  while (parts.length > 1 && isResolutionNoiseToken(parts[parts.length - 1])) parts.pop()

  return parts
}

function normalizeCandidateLabel(tokens = []) {
  return normalizeSpace(trimResolutionCandidateTokens(tokens).join(' '))
}

function buildLeagueAliasTokenSets(leagueLabel = '') {
  const entry = getMappedLeagueEntry(leagueLabel)
  const values = [
    leagueLabel,
    entry?.name,
    entry?.code,
    ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
  ]
  const seen = new Set()
  const aliases = []

  for (const value of values) {
    const normalized = normalizeIdentityToken(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    aliases.push(normalized.split(' ').filter(Boolean))
  }

  aliases.sort((left, right) => right.length - left.length)
  return aliases
}

function findLeagueTokenSpan(tokens = [], leagueLabel = '') {
  const aliasTokenSets = buildLeagueAliasTokenSets(leagueLabel)
  if (aliasTokenSets.length === 0) return null

  const normalizedTokens = tokens.map((token) => normalizeIdentityToken(token))
  for (let start = 0; start < normalizedTokens.length; start += 1) {
    for (const aliasTokens of aliasTokenSets) {
      if (aliasTokens.length === 0 || start + aliasTokens.length > normalizedTokens.length) continue
      const matches = aliasTokens.every((token, offset) => normalizedTokens[start + offset] === token)
      if (matches) {
        return {
          start,
          end: start + aliasTokens.length
        }
      }
    }
  }

  return null
}

function inferLeagueEntryFromTitleTokens(tokens = []) {
  const normalizedTokens = tokens.map((token) => normalizeIdentityToken(token))
  let bestMatch = null

  for (const entry of listMappedLeagues()) {
    const candidateValues = [entry?.name, entry?.code, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
    const seen = new Set()
    for (const value of candidateValues) {
      const normalized = normalizeIdentityToken(value)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      const aliasTokens = normalized.split(' ').filter(Boolean)
      if (aliasTokens.length === 0) continue

      for (let start = 0; start < normalizedTokens.length; start += 1) {
        if (start + aliasTokens.length > normalizedTokens.length) continue
        const matches = aliasTokens.every((token, offset) => normalizedTokens[start + offset] === token)
        if (!matches) continue

        if (!bestMatch || aliasTokens.length > bestMatch.aliasLength) {
          bestMatch = {
            entry,
            start,
            end: start + aliasTokens.length,
            aliasLength: aliasTokens.length
          }
        }
      }
    }
  }

  return bestMatch
}

function buildHeuristicMatchupQueries({
  trackerTitle = '',
  fallbackDate = '',
  mappedLeague = '',
  sport = ''
} = {}) {
  const title = normalizeSpace(trackerTitle)
  const league = normalizeLeagueLabel(mappedLeague)
  const eventDate = extractResolutionDate(title) || extractResolutionDate(fallbackDate)
  if (!title || !eventDate || (!league && !sport)) return []

  const queries = []
  const seen = new Set()
  const addQuery = (homeTeam, awayTeam, reason = '') => {
    const home = normalizeCandidateLabel(homeTeam)
    const away = normalizeCandidateLabel(awayTeam)
    if (!home || !away || normalizeIdentityToken(home) === normalizeIdentityToken(away)) return

    const params = {
      title,
      date: eventDate,
      sport,
      league,
      home,
      away
    }
    const key = JSON.stringify(params)
    if (seen.has(key)) return
    seen.add(key)
    queries.push({
      status: '',
      identityType: 'matchup',
      params,
      reason
    })
  }

  const cleanedTitle = normalizeSpace(
    title
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
  )
  const separatorMatch = cleanedTitle.match(/(.+?)\b(?:vs\.?|v|@)\b(.+)/i)
  if (separatorMatch) {
    const leftTokens = stripResolutionDateTokens(splitTrackerTitleTokens(separatorMatch[1]), eventDate)
    const rightTokens = stripResolutionDateTokens(splitTrackerTitleTokens(separatorMatch[2]), eventDate)
    const leftLeagueSpan = findLeagueTokenSpan(leftTokens, league)
    const leftTeamTokens = leftLeagueSpan
      ? [...leftTokens.slice(0, leftLeagueSpan.start), ...leftTokens.slice(leftLeagueSpan.end)]
      : leftTokens
    addQuery(leftTeamTokens, rightTokens, 'heuristic_vs_separator')
  }

  const titleTokens = trimResolutionCandidateTokens(
    stripResolutionDateTokens(splitTrackerTitleTokens(title), eventDate)
  )
  if (titleTokens.length < 2) return queries

  let matchupTokens = titleTokens
  const leagueSpan = findLeagueTokenSpan(titleTokens, league)
  if (leagueSpan) {
    matchupTokens = [
      ...titleTokens.slice(0, leagueSpan.start),
      ...titleTokens.slice(leagueSpan.end)
    ]
  }
  matchupTokens = trimResolutionCandidateTokens(matchupTokens)

  const maxDrop = Math.min(2, Math.max(0, matchupTokens.length - 2))
  for (let dropCount = 0; dropCount <= maxDrop; dropCount += 1) {
    const candidateTokens = trimResolutionCandidateTokens(matchupTokens.slice(dropCount))
    if (candidateTokens.length < 2 || candidateTokens.length > 8) continue

    for (let splitIndex = 1; splitIndex < candidateTokens.length; splitIndex += 1) {
      addQuery(
        candidateTokens.slice(0, splitIndex),
        candidateTokens.slice(splitIndex),
        `heuristic_league_split:${dropCount}:${splitIndex}`
      )
      if (queries.length >= 12) return queries
    }
  }

  return queries
}

function buildSportsMetaResolutionPlan(availability = {}) {
  const trackerTitle = normalizeSpace(availability?.title || availability?.trackerSource?.title || '')
  const fallbackDate = extractResolutionDate(
    availability?.pubDate ||
    availability?.publishDate ||
    availability?.trackerSource?.pubDate ||
    availability?.trackerSource?.publishDate ||
    ''
  )
  const inferredLeagueMatch = inferLeagueEntryFromTitleTokens(splitTrackerTitleTokens(trackerTitle))
  const parsedSportsEvent = availability?.parsedSportsEvent ||
    parseSportsTitle(trackerTitle, fallbackDate) ||
    null
  const parsedEvent = availability?.parsedEvent ||
    (!parsedSportsEvent ? parseSportsEventTitle(trackerTitle) : null)
  const mappedLeague = normalizeLeagueLabel(
    availability?.mappedLeague ||
    parsedSportsEvent?.league ||
    parsedEvent?.league ||
    inferredLeagueMatch?.entry?.name ||
    ''
  )
  const sport = normalizeSportKey(
    availability?.sportHint ||
    availability?.trackerSource?.sportHint ||
    inferredLeagueMatch?.entry?.sportKey ||
    ''
  )
  const attempts = []
  const seen = new Set()
  const addAttempt = (attempt = {}) => {
    const params = attempt?.params || {}
    if (!params || Object.keys(params).length === 0) return
    const key = JSON.stringify({
      identityType: String(attempt?.identityType || '').trim(),
      params
    })
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({
      status: '',
      identityType: String(attempt?.identityType || '').trim(),
      params,
      reason: String(attempt?.reason || '').trim()
    })
  }

  if (parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) {
    const date = normalizeSpace(parsedSportsEvent.date || fallbackDate)
    addAttempt({
      identityType: 'matchup',
      params: {
        title: trackerTitle,
        date,
        sport,
        league: mappedLeague,
        home: normalizeSpace(parsedSportsEvent.homeTeam),
        away: normalizeSpace(parsedSportsEvent.awayTeam)
      },
      reason: 'structured_matchup'
    })
  }

  if (parsedEvent?.eventName) {
    const eventName = normalizeEventNameLabel(parsedEvent.eventName)
    const date = normalizeSpace(parsedEvent.date || fallbackDate)
    addAttempt({
      identityType: 'event',
      params: {
        title: trackerTitle,
        date,
        sport,
        league: mappedLeague,
        event: eventName
      },
      reason: 'structured_event'
    })
  }

  for (const heuristicAttempt of buildHeuristicMatchupQueries({
    trackerTitle,
    fallbackDate,
    mappedLeague,
    sport
  })) {
    addAttempt(heuristicAttempt)
  }

  const firstMatchupAttempt = attempts.find((attempt) => attempt.identityType === 'matchup')
  if (firstMatchupAttempt) {
    return {
      attempts,
      fallback: {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'matchup',
        params: firstMatchupAttempt.params,
        reason: 'incomplete_matchup_hints'
      }
    }
  }

  const firstEventAttempt = attempts.find((attempt) => attempt.identityType === 'event')
  if (firstEventAttempt) {
    const meaningfulEventTokens = tokenizeIdentity(firstEventAttempt?.params?.event, {
      genericTokens: GENERIC_EVENT_TOKENS
    })
    return {
      attempts,
      fallback: {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'event',
        params: firstEventAttempt.params,
        reason: meaningfulEventTokens.length === 0 ? 'generic_event_name' : 'incomplete_event_hints'
      }
    }
  }

  const titleTokens = tokenizeIdentity(trackerTitle, {
    genericTokens: new Set([...GENERIC_EVENT_TOKENS, ...TRACKER_NOISE_TOKENS]),
    keepNumbers: true
  })
  if (titleTokens.length > 0 && titleTokens.length <= 2) {
    return {
      attempts,
      fallback: {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'unknown',
        params: {
          title: trackerTitle,
          sport,
          league: mappedLeague
        },
        reason: 'ambiguous_tracker_title'
      },
    }
  }

  return {
    attempts,
    fallback: {
      status: SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY,
      identityType: 'unknown',
      params: {
        title: trackerTitle,
        sport,
        league: mappedLeague
      },
      reason: 'no_structured_identity'
    }
  }
}

function buildSportsMetaResolutionQuery(availability = {}) {
  const plan = buildSportsMetaResolutionPlan(availability)
  for (const attempt of plan.attempts) {
    const params = attempt?.params || {}
    if (attempt.identityType === 'matchup') {
      if (params.date && params.home && params.away && (params.league || params.sport)) {
        return attempt
      }
      continue
    }

    if (attempt.identityType === 'event') {
      const meaningfulEventTokens = tokenizeIdentity(params.event, {
        genericTokens: GENERIC_EVENT_TOKENS
      })
      if (params.event && params.date && (params.league || params.sport) && meaningfulEventTokens.length > 0) {
        return attempt
      }
    }
  }

  return plan.fallback
}

function setsEqual(left = [], right = []) {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function compareEventNameSimilarity(left = '', right = '') {
  const leftTokens = tokenizeIdentity(left, { genericTokens: GENERIC_EVENT_TOKENS })
  const rightTokens = tokenizeIdentity(right, { genericTokens: GENERIC_EVENT_TOKENS })

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return normalizeIdentityToken(left) === normalizeIdentityToken(right) ? 1 : 0
  }

  const rightSet = new Set(rightTokens)
  let hits = 0
  for (const token of leftTokens) {
    if (rightSet.has(token)) hits += 1
  }
  return hits / Math.max(leftTokens.length, rightTokens.length)
}

function verifySportsMetaResolution(query = {}, canonical = {}) {
  const identityType = String(query?.identityType || '').trim()
  const params = query?.params || {}
  const canonicalEvent = canonical?.event || {}
  const canonicalId = String(canonical?.canonicalId || canonicalEvent?.id || '').trim()
  if (!canonicalId) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
      reason: 'missing_canonical_id'
    }
  }

  const requestedSport = normalizeSportKey(params.sport)
  const canonicalSport = normalizeSportKey(canonicalEvent.sport)
  if (requestedSport && canonicalSport && requestedSport !== canonicalSport) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
      reason: 'sport_mismatch'
    }
  }

  const requestedLeague = normalizeIdentityToken(normalizeLeagueLabel(params.league))
  const canonicalLeague = normalizeIdentityToken(normalizeLeagueLabel(canonicalEvent.league))
  if (requestedLeague && canonicalLeague && requestedLeague !== canonicalLeague) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
      reason: 'league_mismatch'
    }
  }

  const requestedDate = normalizeSpace(params.date).slice(0, 10)
  const canonicalDate = normalizeSpace(canonicalEvent.date).slice(0, 10)
  if (requestedDate && canonicalDate && requestedDate !== canonicalDate) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
      reason: 'date_mismatch'
    }
  }

  if (identityType === 'matchup') {
    const requestedTeams = [
      normalizeIdentityToken(params.home),
      normalizeIdentityToken(params.away)
    ].filter(Boolean).sort()
    const canonicalTeams = [
      normalizeIdentityToken(canonicalEvent.homeTeam),
      normalizeIdentityToken(canonicalEvent.awayTeam)
    ].filter(Boolean).sort()

    if (requestedTeams.length !== 2 || canonicalTeams.length !== 2 || !setsEqual(requestedTeams, canonicalTeams)) {
      return {
        status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
        reason: 'team_mismatch'
      }
    }

    return {
      status: SPORTS_META_RESOLUTION_STATUS.RESOLVED,
      reason: ''
    }
  }

  if (identityType === 'event') {
    const similarity = compareEventNameSimilarity(params.event, canonicalEvent.name || canonicalEvent.title)
    if (similarity < 0.75) {
      return {
        status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
        reason: 'event_name_mismatch'
      }
    }

    return {
      status: SPORTS_META_RESOLUTION_STATUS.RESOLVED,
      reason: ''
    }
  }

  return {
    status: SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH,
    reason: 'unverifiable_identity'
  }
}

async function resolveSportsMetaIdentity(client, availability = {}) {
  const plan = buildSportsMetaResolutionPlan(availability)
  if (plan.attempts.length === 0) {
    const query = plan.fallback
    return {
      status: query.status,
      identityType: query.identityType,
      query: query.params,
      reason: query.reason,
      canonicalId: '',
      canonical: null
    }
  }

  let bestFailure = null
  const recordFailure = (failure = {}) => {
    const next = failure && typeof failure === 'object' ? failure : {}
    const currentStatus = String(bestFailure?.status || '').trim()
    const nextStatus = String(next?.status || '').trim()
    const rank = {
      [SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS]: 4,
      [SPORTS_META_RESOLUTION_STATUS.WEAK_MATCH]: 3,
      [SPORTS_META_RESOLUTION_STATUS.NOT_FOUND]: 2,
      [SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY]: 1
    }
    if (!bestFailure || (rank[nextStatus] || 0) > (rank[currentStatus] || 0)) {
      bestFailure = next
    }
  }

  for (const query of plan.attempts) {
    const params = query?.params || {}
    if (query.identityType === 'matchup') {
      if (!params.date || !params.home || !params.away || (!params.league && !params.sport)) {
        continue
      }
    } else if (query.identityType === 'event') {
      const meaningfulEventTokens = tokenizeIdentity(params.event, {
        genericTokens: GENERIC_EVENT_TOKENS
      })
      if (!params.event || !params.date || (!params.league && !params.sport) || meaningfulEventTokens.length === 0) {
        continue
      }
    }

    let payload = null
    try {
      payload = await client.resolveEvent(query.params)
    } catch (error) {
      const statusCode = Number(error?.status || 0)
      if (statusCode === 409) {
        recordFailure({
          status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
          identityType: query.identityType,
          query: query.params,
          reason: 'sportsmeta_ambiguous',
          canonicalId: '',
          canonical: null
        })
        continue
      }

      recordFailure({
        status: SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY,
        identityType: query.identityType,
        query: query.params,
        reason: `sportsmeta_error:${String(error?.message || 'request failed').trim()}`,
        canonicalId: '',
        canonical: null
      })
      continue
    }

    if (!payload) {
      recordFailure({
        status: SPORTS_META_RESOLUTION_STATUS.NOT_FOUND,
        identityType: query.identityType,
        query: query.params,
        reason: 'sportsmeta_not_found',
        canonicalId: '',
        canonical: null
      })
      continue
    }

    const verification = verifySportsMetaResolution(query, payload)
    if (verification.status === SPORTS_META_RESOLUTION_STATUS.RESOLVED) {
      return {
        status: verification.status,
        identityType: query.identityType,
        query: query.params,
        reason: verification.reason || query.reason,
        canonicalId: String(payload?.canonicalId || payload?.event?.id || '').trim(),
        canonical: payload
      }
    }

    recordFailure({
      status: verification.status,
      identityType: query.identityType,
      query: query.params,
      reason: verification.reason || query.reason,
      canonicalId: String(payload?.canonicalId || payload?.event?.id || '').trim(),
      canonical: payload
    })
  }

  return bestFailure || {
    status: plan.fallback.status,
    identityType: plan.fallback.identityType,
    query: plan.fallback.params,
    reason: plan.fallback.reason,
    canonicalId: '',
    canonical: null
  }
}

module.exports = {
  SPORTS_META_RESOLUTION_STATUS,
  buildSportsMetaResolutionQuery,
  normalizeLeagueLabel,
  resolveSportsMetaIdentity,
  verifySportsMetaResolution
}
