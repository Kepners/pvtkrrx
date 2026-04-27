const { parseSportsTitle, parseSportsEventTitle } = require('./sportsTitleParser')
const { normalizeSportKey, resolveSportHint } = require('./sportsRules')
const { getMappedLeagueEntry, mapLeague } = require('./leagueMap')

const SPORT_LABELS = {
  'american-football': 'American Football',
  baseball: 'Baseball',
  basketball: 'Basketball',
  boxing: 'Boxing',
  cricket: 'Cricket',
  cycling: 'Cycling',
  darts: 'Darts',
  fighting: 'Fighting',
  football: 'Football',
  golf: 'Golf',
  hockey: 'Hockey',
  'ice-hockey': 'Hockey',
  mma: 'MMA',
  motorsport: 'Motorsport',
  rugby: 'Rugby',
  snooker: 'Snooker',
  tennis: 'Tennis',
  wrestling: 'Wrestling'
}

const COUNTRY_WORDS = {
  america: 'United States',
  american: 'United States',
  australian: 'Australia',
  austria: 'Austria',
  austrian: 'Austria',
  belgian: 'Belgium',
  britain: 'Britain',
  british: 'Britain',
  canada: 'Canada',
  canadian: 'Canada',
  catalan: 'Catalunya',
  czech: 'Czech Republic',
  dutch: 'Netherlands',
  french: 'France',
  german: 'Germany',
  hungarian: 'Hungary',
  indian: 'India',
  indonesian: 'Indonesia',
  italian: 'Italy',
  japanese: 'Japan',
  malaysian: 'Malaysia',
  mexican: 'Mexico',
  portuguese: 'Portugal',
  qatar: 'Qatar',
  qataris: 'Qatar',
  sanmarino: 'San Marino',
  spanish: 'Spain',
  spain: 'Spain',
  thai: 'Thailand',
  turkish: 'Turkey',
  valencian: 'Valencia'
}

const SESSION_WORDS = new Set([
  'race',
  'sprint',
  'qualifying',
  'qualifier',
  'practice',
  'warmup',
  'warm-up',
  'fp1',
  'fp2',
  'fp3'
])

const MATCHUP_PREFIX_NOISE_RE = /\b(?:english\s+premier\s+league|major\s+league\s+soccer|premier\s+league|champions\s+league|europa\s+league|fa\s+cup|la\s+liga|serie\s+a|bundesliga|college\s+football|world\s+series|stanley\s+cup|super\s+league\s+rugby|super\s+league|six\s+nations|premiership\s+rugby|rugby\s+championship|rugby\s+league|test\s+cricket|indian\s+premier\s+league|the\s+ashes|world\s+championship|world\s+matchplay|fight\s+night|main\s+card|main\s+event|regular\s+season|formula\s+1|formula\s+e|pga\s+tour|tour\s+de\s+france|giro\s+d['’]?italia|vuelta\s+a\s+espana|australian\s+open|roland\s+garros|us\s+open|nhl|mlb|nba|nfl|mls|epl|ipl|odi|t20|atp|wta|pdc|ufc|pfl|wwe|aew|pga|lpga|motogp|nascar|indycar|wrc|wec|bkfc|football|baseball|hockey|basketball|cricket|rugby|tennis|boxing|mma|wrestling|darts|golf|motorsport|playoffs?|postseason|finals?|prelims?|heavyweight|matchroom|queensberry|masters|wimbledon|classics|rs)\b/gi

const RELEASE_GROUP_NOISE_RE = /\b(?:m4rtyr|thecig|mwr|billie|mgp|ntb|ctrlhd|deflate|organic|tgx|nf|int)\b.*$/i

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function titleCase(value) {
  return normalizeSpace(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()
      if (['EPL', 'FA', 'F1', 'IPL', 'MLB', 'MLS', 'MMA', 'MOTOGP', 'NBA', 'NFL', 'NHL', 'PGA', 'UFC', 'WRC', 'WWE'].includes(upper)) {
        return upper === 'MOTOGP' ? 'MotoGP' : upper
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function formatSportLabel(value) {
  const key = normalizeSportKey(value)
  if (!key) return ''
  return SPORT_LABELS[key] || titleCase(key)
}

function normalizeCompetition(value, sportKey = '', rawTitle = '') {
  const mapped = mapLeague(value) || String(value || '').trim()
  let competition = normalizeSpace(mapped)
  const sport = normalizeSportKey(sportKey)
  const raw = String(rawTitle || '')

  if (!competition) {
    if (sport === 'baseball') competition = 'MLB'
    else if (sport === 'hockey') competition = 'NHL'
  }

  if (/^nhl$/i.test(competition) && /\bplayoffs?\b/i.test(raw)) {
    competition = 'NHL Playoffs'
  }
  if (/^nba$/i.test(competition) && /\b(?:playoffs?|postseason)\b/i.test(raw)) {
    competition = 'NBA Playoffs'
  }
  if (/^(mls|american major league soccer)$/i.test(competition)) {
    competition = 'Major League Soccer'
  }

  return competition
}

function labelsMatch(left = '', right = '') {
  const a = normalizeSpace(left).toLowerCase()
  const b = normalizeSpace(right).toLowerCase()
  return Boolean(a && b && a === b)
}

function cleanTrackerText(value) {
  return normalizeSpace(
    String(value || '')
      .replace(/[._]+/g, ' ')
      .replace(/\b(?:2160p|1080p|1080i|720p|576p|540p|480p)(?:\d{2,3}(?:fps)?)?\b/gi, ' ')
      .replace(/\b\d{2,3}fps\b/gi, ' ')
      .replace(/\b(?:x264|x265|h264|h265|hevc|avc|av1|web(?:rip|dl)?|hdtv|aac|ac3|ddp)\b/gi, ' ')
      .replace(/\b(?:en|english|fubo|skynz|usan?|yes\s*network|yes|nesn|msg|espn(?:p|plus|\+)?|tnt|sky|nbc|fox|sn|sportsnet|eurosport)\b/gi, ' ')
  )
}

function stripMatchupSideNoise(value, side = 'left') {
  let text = cleanTrackerText(value)
    .replace(/[{}\[\]()]/g, ' ')
    .replace(RELEASE_GROUP_NOISE_RE, ' ')
    .replace(MATCHUP_PREFIX_NOISE_RE, ' ')
    .replace(/\b(?:game|gm|g|r|round)\s*\d+\b/gi, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\b/g, ' ')
  text = normalizeSpace(text)
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length > 5) {
    return side === 'left'
      ? tokens.slice(-5).join(' ')
      : tokens.slice(0, 5).join(' ')
  }
  return text
}

function parseLooseMatchup(rawTitle = '') {
  const cleaned = String(rawTitle || '').replace(/[._]+/g, ' ')
  const closedBracketedMatchup = [...cleaned.matchAll(/[\[{(]([^{}[\]()]{3,160})[\]})]/g)]
    .map((match) => match[1])
    .find((value) => /\s+(?:vs\.?|v\.?|@)\s+/i.test(value))
  const openBracketedMatchup = cleaned.match(/[\[{(]([^{}[\]()]{3,160})$/)?.[1] || ''
  const bracketedMatchup = closedBracketedMatchup ||
    (/\s+(?:vs\.?|v\.?|@)\s+/i.test(openBracketedMatchup) ? openBracketedMatchup : '')
  const matchupText = bracketedMatchup || cleaned
  const match = matchupText.match(/(.+?)\s+(?:vs\.?|v\.?|@)\s+(.+)/i)
  if (!match) return null
  const homeTeam = stripMatchupSideNoise(match[1], 'left')
  const awayTeam = stripMatchupSideNoise(match[2], 'right')
  if (!homeTeam || !awayTeam) return null
  return {
    homeTeam: titleCase(homeTeam),
    awayTeam: titleCase(awayTeam)
  }
}

function normalizeCountryToken(value = '') {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return COUNTRY_WORDS[key] || titleCase(value)
}

function normalizeMotorsportEvent({ league = '', eventName = '', rawTitle = '' }) {
  const leagueLabel = normalizeCompetition(league, 'motorsport', rawTitle) || 'Motorsport'
  let tokens = cleanTrackerText(eventName || rawTitle)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^round\d+$/i.test(token))
  const leagueTokens = leagueLabel.toLowerCase().split(/\s+/).filter(Boolean)
  while (
    leagueTokens.length > 0 &&
    tokens.length >= leagueTokens.length &&
    tokens.slice(0, leagueTokens.length).join(' ').toLowerCase() === leagueTokens.join(' ')
  ) {
    tokens = tokens.slice(leagueTokens.length)
  }
  if (tokens.length === 0) {
    return { competition: leagueLabel, eventTitle: '', eventDetail: '' }
  }

  let detail = ''
  const last = tokens[tokens.length - 1]
  if (SESSION_WORDS.has(String(last || '').toLowerCase())) {
    detail = titleCase(tokens.pop())
  } else {
    detail = extractMotorsportSessionDetail(rawTitle)
  }

  let competition = leagueLabel
  let eventTitle = titleCase(tokens.join(' '))
  if (/^(motogp|formula 1|f1|nascar|indycar|wrc|wec|formula e)$/i.test(leagueLabel) && tokens.length >= 2) {
    const country = normalizeCountryToken(tokens[0])
    competition = `${leagueLabel} ${country}`.trim()
    eventTitle = titleCase(tokens.slice(1).join(' '))
  }

  return {
    competition,
    eventTitle,
    eventDetail: detail
  }
}

function extractMotorsportSessionDetail(rawTitle = '') {
  const text = normalizeSpace(String(rawTitle || '').replace(/[._-]+/g, ' '))
  if (!text) return ''
  const fpPractice = text.match(/\b(fp[1-3])\s+(practice)\b/i)
  if (fpPractice) return `${fpPractice[1].toUpperCase()} ${titleCase(fpPractice[2])}`
  const freePractice = text.match(/\bfree\s+practice\s+([1-3]|one|two|three)\b/i)
  if (freePractice) return `Free Practice ${titleCase(freePractice[1])}`
  const rawSession = text.match(/\b(warm\s+up|warmup|qualifying|qualifier|practice|sprint|race|fp[1-3])\b/i)
  if (!rawSession) return ''
  const value = rawSession[1].replace(/\s+/g, ' ')
  if (/^fp[1-3]$/i.test(value)) return value.toUpperCase()
  if (/^warmup$/i.test(value)) return 'Warm Up'
  return titleCase(value)
}

function parseSportsMetaCanonicalId(id = '') {
  const rawId = String(id || '').trim()
  if (!rawId.startsWith('sportsmeta:event:')) return null
  const parts = rawId.slice('sportsmeta:event:'.length).split('|').map((part) => String(part || '').trim())
  if (parts.length < 4) return null
  const sportKey = normalizeSportKey(parts[0])
  const date = parts[1] || ''
  const league = normalizeCompetition(parts[2], sportKey, rawId)
  if (parts.length >= 5) {
    return {
      sportKey,
      sport: formatSportLabel(sportKey),
      competition: league,
      date,
      homeTeam: titleCase(parts[3].replace(/-/g, ' ')),
      awayTeam: titleCase(parts[4].replace(/-/g, ' '))
    }
  }
  return {
    sportKey,
    sport: formatSportLabel(sportKey),
    competition: league,
    date,
    eventTitle: titleCase(parts[3].replace(/-/g, ' '))
  }
}

function normalizeSource(value, hasCanonical) {
  const source = String(value || '').trim().toLowerCase()
  if (source === 'prowlarr' || source === 'sportsmeta' || source === 'fallback') return source
  return hasCanonical ? 'sportsmeta' : 'prowlarr'
}

function normalizeSportsEventMetadata(input = {}) {
  const canonicalEvent = input.canonicalEvent || input.event || {}
  const rawTitle = normalizeSpace(
    input.rawTitle ||
    input.trackerTitle ||
    input.title ||
    canonicalEvent.rawTitle ||
    canonicalEvent.title ||
    canonicalEvent.name ||
    ''
  )
  const canonicalParsed = parseSportsMetaCanonicalId(input.canonicalId || canonicalEvent.id || '')
  const parsedSportsEvent = input.parsedSportsEvent || parseSportsTitle(rawTitle, input.date || input.pubDate || '') || null
  const parsedEvent = input.parsedEvent || (!parsedSportsEvent ? parseSportsEventTitle(rawTitle, input.date || input.pubDate || '') : null)
  const looseMatchup = parseLooseMatchup(rawTitle)
  const rawLeague = normalizeSpace(
    input.competition ||
    input.league ||
    canonicalEvent.league ||
    canonicalParsed?.competition ||
    parsedSportsEvent?.league ||
    parsedEvent?.league ||
    ''
  )
  const mappedEntry = getMappedLeagueEntry(rawLeague)
  const sportKey = normalizeSportKey(resolveSportHint({
    explicitHint: input.sportHint || input.sport || canonicalEvent.sport || canonicalParsed?.sportKey || mappedEntry?.sportKey || '',
    categoryHint: input.categoryHint || '',
    title: rawTitle
  }))
  const sport = formatSportLabel(sportKey || input.sport || canonicalParsed?.sportKey) || 'Sports'
  const date = normalizeSpace(input.date || canonicalEvent.date || canonicalParsed?.date || parsedSportsEvent?.date || parsedEvent?.date || '')
  const homeTeam = normalizeSpace(canonicalEvent.homeTeam || canonicalParsed?.homeTeam || parsedSportsEvent?.homeTeam || looseMatchup?.homeTeam || '')
  const awayTeam = normalizeSpace(canonicalEvent.awayTeam || canonicalParsed?.awayTeam || parsedSportsEvent?.awayTeam || looseMatchup?.awayTeam || '')

  let competition = normalizeCompetition(rawLeague, sportKey, rawTitle)
  let eventTitle = normalizeSpace(input.eventTitle || input.name || canonicalEvent.name || canonicalEvent.title || '')
  let eventDetail = normalizeSpace(input.eventDetail || '')

  if (homeTeam && awayTeam && labelsMatch(homeTeam, competition)) {
    eventTitle = awayTeam
  } else if (homeTeam && awayTeam && labelsMatch(awayTeam, competition)) {
    eventTitle = homeTeam
  } else if (homeTeam && awayTeam) {
    eventTitle = `${homeTeam} vs ${awayTeam}`
  } else if (parsedEvent?.eventName) {
    eventTitle = normalizeSpace(input.eventTitle || parsedEvent.eventName)
  } else if (canonicalParsed?.eventTitle) {
    eventTitle = canonicalParsed.eventTitle
  }

  if (sportKey === 'motorsport' && (parsedEvent?.eventName || /motogp|formula|f1|grand prix|race/i.test(rawTitle))) {
    const motorsport = normalizeMotorsportEvent({
      league: rawLeague || parsedEvent?.league || '',
      eventName: parsedEvent?.eventName || input.eventTitle || eventTitle,
      rawTitle
    })
    competition = motorsport.competition || competition
    eventTitle = motorsport.eventTitle || eventTitle
    eventDetail = eventDetail || motorsport.eventDetail
  }

  if (!eventTitle) {
    eventTitle = cleanTrackerText(rawTitle) || rawTitle || 'Sports Event'
  }

  return {
    sport,
    competition: competition || sport,
    eventTitle,
    ...(eventDetail ? { eventDetail } : {}),
    ...(date ? { date } : {}),
    ...(Number.isFinite(Number(input.seeders)) ? { seeders: Number(input.seeders) } : {}),
    ...(input.size ? { size: String(input.size) } : {}),
    rawTitle,
    source: normalizeSource(input.source || canonicalEvent.source, Boolean(canonicalEvent.id || input.canonicalId))
  }
}

module.exports = {
  formatSportLabel,
  normalizeSportsEventMetadata,
  parseSportsMetaCanonicalId
}
