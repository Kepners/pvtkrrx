const { mapLeague } = require('./leagueMap')
const { normalizeSportKey } = require('./sportsRules')

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

function buildSportsMetaResolutionQuery(availability = {}) {
  const parsedSportsEvent = availability?.parsedSportsEvent || null
  const parsedEvent = availability?.parsedEvent || null
  const trackerTitle = normalizeSpace(availability?.title || availability?.trackerSource?.title || '')
  const mappedLeague = normalizeLeagueLabel(
    availability?.mappedLeague ||
    parsedSportsEvent?.league ||
    parsedEvent?.league ||
    ''
  )
  const sport = normalizeSportKey(availability?.sportHint || availability?.trackerSource?.sportHint || '')
  const fallbackDate = extractResolutionDate(
    availability?.pubDate ||
    availability?.publishDate ||
    availability?.trackerSource?.pubDate ||
    availability?.trackerSource?.publishDate ||
    ''
  )

  if (parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam) {
    const date = normalizeSpace(parsedSportsEvent.date || fallbackDate)
    const params = {
      title: trackerTitle,
      date,
      sport,
      league: mappedLeague,
      home: normalizeSpace(parsedSportsEvent.homeTeam),
      away: normalizeSpace(parsedSportsEvent.awayTeam)
    }

    if (!params.date || !params.home || !params.away || (!params.league && !params.sport)) {
      return {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'matchup',
        params,
        reason: 'incomplete_matchup_hints'
      }
    }

    return {
      status: '',
      identityType: 'matchup',
      params,
      reason: ''
    }
  }

  if (parsedEvent?.eventName) {
    const eventName = normalizeEventNameLabel(parsedEvent.eventName)
    const date = normalizeSpace(parsedEvent.date || fallbackDate)
    const params = {
      title: trackerTitle,
      date,
      sport,
      league: mappedLeague,
      event: eventName
    }

    const meaningfulEventTokens = tokenizeIdentity(eventName, {
      genericTokens: GENERIC_EVENT_TOKENS
    })

    if (!eventName || !date || (!params.league && !params.sport)) {
      return {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'event',
        params,
        reason: 'incomplete_event_hints'
      }
    }

    if (meaningfulEventTokens.length === 0) {
      return {
        status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
        identityType: 'event',
        params,
        reason: 'generic_event_name'
      }
    }

    return {
      status: '',
      identityType: 'event',
      params,
      reason: ''
    }
  }

  const titleTokens = tokenizeIdentity(trackerTitle, {
    genericTokens: new Set([...GENERIC_EVENT_TOKENS, ...TRACKER_NOISE_TOKENS]),
    keepNumbers: true
  })
  if (titleTokens.length > 0 && titleTokens.length <= 2) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.AMBIGUOUS,
      identityType: 'unknown',
      params: {
        title: trackerTitle,
        sport,
        league: mappedLeague
      },
      reason: 'ambiguous_tracker_title'
    }
  }

  return {
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
  const query = buildSportsMetaResolutionQuery(availability)
  if (query.status) {
    return {
      status: query.status,
      identityType: query.identityType,
      query: query.params,
      reason: query.reason,
      canonicalId: '',
      canonical: null
    }
  }

  let payload = null
  try {
    payload = await client.resolveEvent(query.params)
  } catch (error) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY,
      identityType: query.identityType,
      query: query.params,
      reason: `sportsmeta_error:${String(error?.message || 'request failed').trim()}`,
      canonicalId: '',
      canonical: null
    }
  }

  if (!payload) {
    return {
      status: SPORTS_META_RESOLUTION_STATUS.NOT_FOUND,
      identityType: query.identityType,
      query: query.params,
      reason: 'sportsmeta_not_found',
      canonicalId: '',
      canonical: null
    }
  }

  const verification = verifySportsMetaResolution(query, payload)
  return {
    status: verification.status,
    identityType: query.identityType,
    query: query.params,
    reason: verification.reason,
    canonicalId: String(payload?.canonicalId || payload?.event?.id || '').trim(),
    canonical: payload
  }
}

module.exports = {
  SPORTS_META_RESOLUTION_STATUS,
  buildSportsMetaResolutionQuery,
  normalizeLeagueLabel,
  resolveSportsMetaIdentity,
  verifySportsMetaResolution
}
