const { classifySportsPosterEvent, hasActualPair } = require('./sportsPosterClassifier')

const FORBIDDEN_VALUE_RE = /^(?:undefined|null|unknown|n\/a|na|sport|sports|tba|tbd)$/i
const RELEASE_NOISE_RE = /(?:\b(?:2160p|1080p|1080i|720p|576p|540p|480p)(?:[a-z]{1,6})?(?:\d{2,3}fps)?|\b\d{2,3}fps\b|\b(?:x264|x265|h264|h265|hevc|avc|av1|web[-._\s]?dl|web[-._\s]?rip|web|hdtv|repack|proper|complete|aac|ddp?\d?(?:\.\d)?|multi|english)\b)/gi

const LEAGUE_CODES = Object.freeze({
  'english premier league': 'EPL',
  'premier league': 'EPL',
  epl: 'EPL',
  'fa cup': 'FAC',
  'major league soccer': 'MLS',
  mls: 'MLS',
  'champions league': 'UCL',
  'uefa champions league': 'UCL',
  'europa league': 'UEL',
  'uefa nations league': 'UNL',
  'fifa world cup': 'FIFA',
  'world cup qualifier': 'WCQ',
  nba: 'NBA',
  'nba playoffs': 'NBA',
  wnba: 'WNBA',
  nfl: 'NFL',
  'college football': 'CFB',
  mlb: 'MLB',
  nhl: 'NHL',
  ipl: 'IPL',
  'indian premier league': 'IPL',
  ufc: 'UFC',
  pfl: 'PFL',
  wwe: 'WWE',
  aew: 'AEW',
  pga: 'PGA',
  'pga tour': 'PGA',
  'formula 1': 'F1',
  'formula one': 'F1',
  f1: 'F1',
  motogp: 'MotoGP',
  'moto gp': 'MotoGP',
  nascar: 'NASCAR',
  indycar: 'INDY',
  wrc: 'WRC',
  wec: 'WEC',
  'formula e': 'FE',
  snooker: 'SNOOKER',
  'world championship': 'WC',
  darts: 'DARTS',
  boxing: 'BOXING',
  tennis: 'TENNIS',
  'table tennis': 'TABLE',
  pdc: 'PDC',
  wimbledon: 'WIM',
  atp: 'ATP',
  wta: 'WTA'
})

const SPORT_LABELS = Object.freeze({
  'american-football': 'American Football',
  athletics: 'Athletics',
  aquatics: 'Aquatics',
  baseball: 'Baseball',
  basketball: 'Basketball',
  boxing: 'Boxing',
  cricket: 'Cricket',
  cycling: 'Cycling',
  darts: 'Darts',
  fighting: 'Fighting',
  football: 'Football',
  golf: 'Golf',
  gymnastics: 'Gymnastics',
  hockey: 'Hockey',
  'ice-hockey': 'Hockey',
  kickboxing: 'Kickboxing',
  mma: 'MMA',
  motorsport: 'Motorsport',
  olympics: 'Olympics',
  rugby: 'Rugby',
  snooker: 'Snooker',
  'table-tennis': 'Table Tennis',
  tennis: 'Tennis',
  volleyball: 'Volleyball',
  winter: 'Winter Sport',
  wrestling: 'Wrestling'
})

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value) {
  return normalizeSpace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function titleCase(value = '') {
  return normalizeSpace(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const upper = part.toUpperCase()
      if (['AEW', 'AFCON', 'ATP', 'EFL', 'EPL', 'FA', 'F1', 'FIFA', 'FP1', 'FP2', 'FP3', 'GP', 'IPL', 'LIV', 'MLB', 'MLS', 'MMA', 'NBA', 'NFL', 'NHL', 'NXT', 'PDC', 'PFL', 'PGA', 'RAW', 'TBA', 'UFC', 'UEFA', 'WC', 'WEC', 'WRC', 'WTA', 'WWE'].includes(upper)) return upper
      if (upper === 'MOTOGP') return 'MotoGP'
      if (upper === 'SMACKDOWN') return 'SmackDown'
      if (upper === 'WRESTLEMANIA') return 'WrestleMania'
      if (index > 0 && /^(?:van|von|de|del|da|dos|du)$/i.test(part)) return part.toLowerCase()
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function cleanDisplayText(value = '', fallback = 'Event') {
  const clean = normalizeSpace(
    String(value || '')
      .replace(/[._]+/g, ' ')
      .replace(RELEASE_NOISE_RE, ' ')
      .replace(/\b(?:mkv|mp4|avi|ts)\b/gi, ' ')
      .replace(/\s+-\s*[A-Za-z0-9]{2,24}$/g, ' ')
      .replace(/\b(?:undefined|null|unknown)\b/gi, ' ')
  )
  const result = clean && !FORBIDDEN_VALUE_RE.test(clean) ? clean : fallback
  return titleCase(result)
}

function truncate(value = '', max = 46, fallback = 'Event') {
  const clean = cleanDisplayText(value, fallback)
  if (clean.length <= max) return clean
  // Hard cut at the previous word boundary if possible. No ellipsis suffix:
  // "..." gets read as missing data and confuses real-time event posters.
  const hardCut = clean.slice(0, max).trimEnd()
  const lastSpace = hardCut.lastIndexOf(' ')
  if (lastSpace > Math.floor(max * 0.6)) return hardCut.slice(0, lastSpace).trimEnd()
  return hardCut
}

function cleanEssentialName(value = '', fallback = 'Event') {
  return cleanDisplayText(value, fallback)
    .replace(/\.{3,}|\u2026/g, '')
    .trim()
}

function cleanOptionalDisplayText(value = '') {
  return cleanDisplayText(value, '')
    .replace(/\.{3,}|\u2026/g, '')
    .trim()
}

function hashString(value = '') {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function colorForLabel(label = '', fallback = '#123c69') {
  const palette = ['#6CABDD', '#EF0107', '#552583', '#FDB927', '#0C2340', '#E31837', '#004C54', '#B4975A', '#0B5C36', '#D20A0A', '#E10600', '#15151E']
  return palette[hashString(label || fallback) % palette.length] || fallback
}

function readableAccent(primary = '#123c69') {
  const clean = String(primary || '').replace(/[^a-f0-9]/gi, '')
  if (clean.length !== 6) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return ((0.299 * r) + (0.587 * g) + (0.114 * b)) > 150 ? '#111827' : '#ffffff'
}

function sanitizeIdentityCode(value = '', maxLen = 6) {
  const clean = String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase()
  if (!clean) return ''
  if (FORBIDDEN_VALUE_RE.test(clean)) return ''
  return clean.slice(0, maxLen)
}

function letterStartingWords(words = []) {
  return words.filter((word) => /^[A-Za-z]/.test(word))
}

function shortCode(value = '', fallback = 'EVT') {
  const clean = cleanDisplayText(value, fallback)
  const words = clean.replace(/[^a-z0-9 ]+/gi, ' ').split(/\s+/).filter(Boolean)
  const lettered = letterStartingWords(words)
  // For multi-word names, build an acronym from words that start with a letter
  // so digit-prefixed segments like "49ers" don't pollute the code with "4".
  const code = lettered.length >= 2
    ? lettered.map((word) => word[0]).join('')
    : (lettered[0] || words[0] || fallback).slice(0, 3)
  return (code || fallback).slice(0, 6).toUpperCase()
}

function initials(value = '', fallback = 'EV') {
  const clean = cleanDisplayText(value, fallback)
  const words = clean.replace(/[^a-z0-9 ]+/gi, ' ').split(/\s+/).filter(Boolean)
  const lettered = letterStartingWords(words)
  // 3+ letter-starting words: take first letter of each (e.g. Boston Red Sox -> BRS,
  // New York Yankees -> NYY, Tampa Bay Lightning -> TBL), capped at 3 chars.
  if (lettered.length >= 3) {
    return lettered.map((word) => word[0]).join('').slice(0, 3).toUpperCase()
  }
  if (lettered.length === 2) {
    return `${lettered[0][0]}${lettered[1][0]}`.toUpperCase()
  }
  return (lettered[0] || words[0] || fallback).slice(0, 3).toUpperCase()
}

function sportLabel(input = {}) {
  const key = normalizeKey(input.sportKey || input.sportHint || input.sport)
  return SPORT_LABELS[key] || cleanDisplayText(input.sport || input.sportHint || key || 'General', 'General')
}

function leagueCodeFor(league = '', sport = '') {
  const normalized = normalizeSpace(league).toLowerCase()
  if (LEAGUE_CODES[normalized]) return LEAGUE_CODES[normalized]
  if (/^formula\s*1\b/i.test(league)) return 'F1'
  if (/^moto\s*gp\b/i.test(league)) return 'MotoGP'
  // Composite leagues like "MotoGP Brazil" or "WRC Spain" carry the round
  // venue as a suffix. Match the first token so we still return the recognised
  // abbreviation (MotoGP / WRC / NBA / etc.) rather than a 2-letter acronym.
  const firstToken = normalized.split(/\s+/)[0]
  if (firstToken && LEAGUE_CODES[firstToken]) return LEAGUE_CODES[firstToken]
  return shortCode(league || sport, 'EVT')
}

function sportIconFor(input = {}) {
  const text = normalizeSpace([
    input.sport,
    input.sportHint,
    input.league,
    input.competition,
    input.eventTitle,
    input.title,
    input.rawTitle
  ].filter(Boolean).join(' ')).toLowerCase()
  if (/\b(?:formula\s*1|formula\s*one|formula1|f1)\b/.test(text)) return 'f1'
  if (/\b(?:motogp|moto\s*gp)\b/.test(text)) return 'motogp'
  if (/\b(?:motor|wrc|rally|grand prix|nascar|indycar|wec|formula e|supercars|v8sc)\b/.test(text)) return 'motorsport'
  if (/golf|pga|lpga|masters|ryder cup|liv golf|open championship/.test(text)) return 'golf'
  if (/darts|pdc|world matchplay|premier league darts/.test(text)) return 'darts'
  if (/cycling|tour de france|giro|vuelta|stage|time trial|road race|paris roubaix|tour of flanders/.test(text)) return 'cycling'
  if (/swimming|aquatics|fina|water polo|diving/.test(text)) return 'athletics'
  if (/gymnastics|rhythmic gymnastics|trampoline/.test(text)) return 'athletics'
  if (/winter olympics|alpine skiing|biathlon|snowboard|ice skating|figure skating|luge|skeleton/.test(text)) return 'athletics'
  if (/athletics|diamond league|continental tour|track and field|marathon|simbine|kip keino/.test(text)) return 'athletics'
  if (/cricket|ipl|odi|t20|ashes|test match/.test(text)) return 'cricket'
  if (/rugby|nrl|six nations|super rugby|major league rugby/.test(text)) return 'rugby'
  if (/wrestling|wwe|aew|smackdown|raw|nxt|wrestlemania|royal rumble/.test(text)) return 'wrestling'
  if (/snooker|crucible|world snooker|table tennis|billiards/.test(text)) return 'snooker'
  if (/american.*football|nfl|super bowl/.test(text)) return 'football'
  if (/football|soccer|premier|fa cup|mls|champions league|europa|nations league|world cup/.test(text)) return 'soccer'
  if (/hockey|nhl/.test(text)) return 'hockey'
  if (/basketball|nba|wnba|euroleague/.test(text)) return 'basketball'
  if (/baseball|mlb|world series/.test(text)) return 'baseball'
  if (/tennis|wimbledon|atp|wta/.test(text)) return 'tennis'
  if (/mma|ufc|boxing|fight/.test(text)) return 'mma'
  if (/olympic/.test(text)) return 'athletics'
  return 'soccer'
}

function eventFormatFor(classification, input = {}) {
  if (classification === 'team_vs_team') return 'matchup'
  if (classification === 'tennis_or_snooker_match') return 'single'
  if (
    (classification === 'combat_event' ||
     classification === 'darts_event' ||
     classification === 'racket_event') &&
    hasActualPair(input)
  ) {
    return 'single'
  }
  return 'solo'
}

function pickFirst(...values) {
  for (const value of values) {
    const clean = normalizeSpace(value)
    if (clean && !FORBIDDEN_VALUE_RE.test(clean)) return clean
  }
  return ''
}

function sideName(input = {}, side = 'home', eventShort = 'Event', session = 'Session') {
  if (side === 'home') {
    return pickFirst(input.principalA, input.homeTeam, input.home?.name, input.fighterA, input.playerA, input.teamA, eventShort)
  }
  return pickFirst(input.principalB, input.awayTeam, input.away?.name, input.fighterB, input.playerB, input.teamB, session, input.league, 'Session')
}

function buildSide(name, role, theme = {}, identity = {}) {
  const displayName = cleanEssentialName(name, role === 'away' ? 'Away' : 'Home')
  const primary = pickFirst(role === 'away' ? theme.awayColor : theme.homeColor, role === 'away' ? theme.secondaryColor : theme.primaryColor) || colorForLabel(displayName)
  const secondary = pickFirst(role === 'away' ? theme.awaySecondary : theme.homeSecondary) || colorForLabel(`${displayName} secondary`, '#1C2C5B')
  const explicitShort = sanitizeIdentityCode(pickFirst(identity.short, identity.code, identity.tla, identity.abbreviation, identity.abbr), 6)
  const explicitInitials = sanitizeIdentityCode(pickFirst(identity.initials), 5)
  return {
    name: displayName,
    short: explicitShort || shortCode(displayName, role === 'away' ? 'AWY' : 'HME'),
    initials: explicitInitials || initials(displayName, role === 'away' ? 'AW' : 'HM'),
    primary,
    secondary,
    accent: readableAccent(primary)
  }
}

function ensureDistinctSides(home, away) {
  if (home.short === away.short) away.short = `${away.short.slice(0, 5)}2`.slice(0, 6)
  if (home.initials === away.initials) away.initials = `${away.initials.slice(0, 4)}2`.slice(0, 5)
  if (home.name.toLowerCase() === away.name.toLowerCase()) away.name = `${away.name} Session`
}

function eventShortFor(input = {}, classification = '') {
  if (classification === 'team_vs_team') {
    return truncate(pickFirst(input.eventShort, input.event_short, input.league, input.competition, 'Matchup'), 38)
  }
  if (classification === 'tennis_or_snooker_match') {
    return truncate(pickFirst(input.league, input.competition, input.eventShort, input.event_short, input.eventTitle, input.title, 'Tournament'), 38)
  }
  if (classification === 'golf_event') {
    return truncate(pickFirst(input.eventTitle, input.title, input.eventName, input.eventShort, input.event_short, input.league, input.competition, 'Golf Event'), 38)
  }
  if (classification === 'darts_event' && !hasActualPair(input)) {
    return truncate(pickFirst(input.league, input.competition, input.eventTitle, input.title, 'Darts Event'), 38)
  }
  if (classification === 'racket_event' && !hasActualPair(input)) {
    return truncate(pickFirst(input.league, input.competition, input.eventTitle, input.title, 'Tournament'), 38)
  }
  if (classification === 'motorsport_event') {
    // Prefer an explicitly supplied event short (e.g. "Monaco GP", "British GP")
    // when it survives release-noise stripping with substance. Fall back to
    // competition (e.g. "MotoGP Brazil", "WRC Spain") if the stripped eventShort
    // is just a fragment that the competition already contains — that catches
    // normalizer leftovers like eventShort="Brazil" with competition="MotoGP
    // Brazil". Otherwise use the explicit eventShort even when long.
    const cleanedCompetition = stripReleaseTitleNoise(input.competition)
    const explicitShort = [input.eventShort, input.event_short, input.eventName]
      .map(stripReleaseTitleNoise)
      .find((value) => value && value.length >= 3)
    const competitionFullyContains = explicitShort && cleanedCompetition &&
      cleanedCompetition.toLowerCase().includes(explicitShort.toLowerCase()) &&
      cleanedCompetition.split(/\s+/).filter(Boolean).length > explicitShort.split(/\s+/).filter(Boolean).length
    const preferred = competitionFullyContains ? cleanedCompetition : explicitShort
    return truncate(pickFirst(
      preferred,
      cleanedCompetition,
      stripReleaseTitleNoise(input.league),
      stripReleaseTitleNoise(input.eventTitle),
      stripReleaseTitleNoise(input.title),
      'Motorsport Event'
    ), 38)
  }
  if (
    classification === 'olympic_event' ||
    classification === 'winter_sport_event' ||
    classification === 'aquatics_event' ||
    classification === 'gymnastics_event'
  ) {
    return truncate(pickFirst(input.eventTitle, input.title, input.eventName, input.eventShort, input.event_short, input.league, input.competition, 'Sports Event'), 38)
  }
  const raw = pickFirst(
    input.eventShort,
    input.event_short,
    input.eventName,
    input.eventTitle,
    input.title,
    input.name,
    classification === 'team_vs_team' && hasActualPair(input)
      ? `${sideName(input, 'home')} vs ${sideName(input, 'away')}`
      : '',
    input.league,
    input.competition,
    'Sports Event'
  )
  return truncate(raw, 38)
}

function sessionFor(input = {}, classification = '', eventShort = '') {
  const raw = pickFirst(
    input.session,
    input.eventDetail,
    input.detail,
    input.roundShort,
    input.round,
    (classification === 'team_vs_team' || classification === 'combat_event' || classification === 'tennis_or_snooker_match' || classification === 'darts_event' || classification === 'racket_event') && hasActualPair(input)
      ? `${sideName(input, 'home')} v ${sideName(input, 'away')}`
      : '',
    classification === 'wrestling_event' ? input.date : ''
  )
  if (!raw) return ''
  const clean = truncate(raw, 42)
  if (isPlaceholderLabel(clean)) return ''
  if (clean.toLowerCase() === eventShort.toLowerCase()) return ''
  return clean
}

function distinctLeagueLabel(league = '', sport = '', eventShort = '') {
  const a = normalizeSpace(league).toLowerCase()
  const b = normalizeSpace(sport).toLowerCase()
  if (!a || a !== b) return league
  const candidate = normalizeSpace(eventShort)
  if (candidate && candidate.toLowerCase() !== a) return truncate(candidate, 30)
  if (/^(?:general|sports?|event|live)$/i.test(a)) return 'Live Sport'
  return league
}

const PLACEHOLDER_LABEL_RE = /^(?:event|sports?\s*event|general|sport|matchup|tournament|session)$/i

function isPlaceholderLabel(value = '') {
  return PLACEHOLDER_LABEL_RE.test(normalizeSpace(value))
}

function blankIfPlaceholder(value = '') {
  return isPlaceholderLabel(value) ? '' : value
}

const RELEASE_TITLE_NOISE_RE = /\b(?:gear\s*up|saturday\s*highlights|sunday\s*highlights|friday\s*highlights|highlights|recap|preview|qualifying\s*recap|race\s*recap)\b/gi

function stripReleaseTitleNoise(value = '') {
  return normalizeSpace(String(value || '').replace(RELEASE_TITLE_NOISE_RE, ' '))
}

function buildPaidTemplateMatchup(normalizedEvent = {}, classification = '') {
  const eventClass = POSTER_CLASS_SET.has(classification)
    ? classification
    : classifySportsPosterEvent(normalizedEvent)
  const sport = sportLabel(normalizedEvent)
  let league = truncate(pickFirst(normalizedEvent.league, normalizedEvent.competition, sport), 30)
  const eventShort = eventShortFor(normalizedEvent, eventClass)
  league = distinctLeagueLabel(league, sport, eventShort)
  const session = sessionFor(normalizedEvent, eventClass, eventShort)
  const eventFormat = eventFormatFor(eventClass, normalizedEvent)
  const primaryColor = pickFirst(normalizedEvent.primaryColor, normalizedEvent.primary_color) || colorForLabel(eventShort, '#123c69')
  const secondaryColor = pickFirst(normalizedEvent.secondaryColor, normalizedEvent.secondary_color) || colorForLabel(`${eventShort} secondary`, '#15151E')
  const accentColor = pickFirst(normalizedEvent.accentColor, normalizedEvent.accent_color) || readableAccent(primaryColor)

  const home = buildSide(
    sideName(normalizedEvent, 'home', eventShort, session),
    'home',
    {
      primaryColor,
      secondaryColor,
      homeColor: normalizedEvent.home?.primary || normalizedEvent.homeColor
    },
    {
      short: pickFirst(normalizedEvent.homeShort, normalizedEvent.homeCode, normalizedEvent.home?.short, normalizedEvent.home?.code, normalizedEvent.home?.tla, normalizedEvent.home?.abbreviation),
      initials: pickFirst(normalizedEvent.homeInitials, normalizedEvent.home?.initials)
    }
  )
  const away = buildSide(
    sideName(normalizedEvent, 'away', eventShort, session),
    'away',
    {
      primaryColor,
      secondaryColor,
      awayColor: normalizedEvent.away?.primary || normalizedEvent.awayColor
    },
    {
      short: pickFirst(normalizedEvent.awayShort, normalizedEvent.awayCode, normalizedEvent.away?.short, normalizedEvent.away?.code, normalizedEvent.away?.tla, normalizedEvent.away?.abbreviation),
      initials: pickFirst(normalizedEvent.awayInitials, normalizedEvent.away?.initials)
    }
  )
  ensureDistinctSides(home, away)

  return {
    sport,
    league,
    league_code: leagueCodeFor(pickFirst(normalizedEvent.leagueCode, normalizedEvent.league_code, league), sport),
    league_full: truncate(pickFirst(normalizedEvent.leagueFull, normalizedEvent.league_full, league), 46),
    round: blankIfPlaceholder(truncate(pickFirst(normalizedEvent.round, normalizedEvent.roundShort, session), 42)),
    venue: blankIfPlaceholder(truncate(pickFirst(normalizedEvent.venue, league, sport), 42)),
    date: cleanOptionalDisplayText(pickFirst(normalizedEvent.date, normalizedEvent.localDate)),
    time: cleanOptionalDisplayText(pickFirst(normalizedEvent.time, normalizedEvent.timestamp)),
    home,
    away,
    sport_icon: sportIconFor(normalizedEvent),
    event: truncate(pickFirst(normalizedEvent.event, normalizedEvent.eventName, normalizedEvent.eventTitle, normalizedEvent.title, eventShort), 48),
    event_short: eventShort,
    session,
    event_format: eventFormat,
    primary_color: primaryColor,
    secondary_color: secondaryColor,
    accent_color: accentColor
  }
}

const POSTER_CLASS_SET = new Set(require('./sportsPosterClassifier').POSTER_CLASSES)

module.exports = {
  buildPaidTemplateMatchup,
  cleanDisplayText,
  eventFormatFor
}
