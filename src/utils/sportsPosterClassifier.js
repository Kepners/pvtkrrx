const POSTER_CLASSES = Object.freeze([
  'team_vs_team',
  'motorsport_event',
  'combat_event',
  'golf_event',
  'wrestling_event',
  'cycling_event',
  'athletics_event',
  'darts_event',
  'tennis_or_snooker_match',
  'tournament_event',
  'generic_event'
])

const TEAM_SPORT_KEYS = new Set([
  'american-football',
  'baseball',
  'basketball',
  'cricket',
  'football',
  'hockey',
  'ice-hockey',
  'rugby'
])

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

function normalizedSearchText(input = {}) {
  return normalizeSpace([
    input.sportKey,
    input.sportHint,
    input.sport,
    input.competition,
    input.league,
    input.eventName,
    input.eventShort,
    input.eventTitle,
    input.title,
    input.round,
    input.session,
    input.eventDetail,
    input.detail,
    input.rawTitle
  ].filter(Boolean).join(' '))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function sideName(value) {
  if (!value) return ''
  if (typeof value === 'string') return normalizeSpace(value)
  return normalizeSpace(value.name || value.short || value.initials || '')
}

function isPlaceholderSide(value) {
  const clean = normalizeSpace(value).toLowerCase()
  return !clean || /^(?:sport|sports|unknown|undefined|null|n\/a|na|home|away|team|event)$/i.test(clean)
}

function hasActualPair(input = {}) {
  const left = sideName(input.principalA || input.homeTeam || input.home || input.fighterA || input.playerA)
  const right = sideName(input.principalB || input.awayTeam || input.away || input.fighterB || input.playerB)
  if (isPlaceholderSide(left) || isPlaceholderSide(right)) return false
  return left.toLowerCase() !== right.toLowerCase()
}

function classifySportsPosterEvent(input = {}) {
  const sport = normalizeKey(input.sportKey || input.sportHint || input.sport)
  const text = normalizedSearchText(input)
  const paired = hasActualPair(input)

  // Darts must win before any generic "Premier League" football logic.
  if (sport === 'darts' || /\b(?:pdc|darts?|premier league darts|world matchplay|world championship darts)\b/.test(text)) {
    return 'darts_event'
  }

  if (
    sport === 'motorsport' ||
    /\b(?:formula\s*1|formula\s*one|f1|motogp|moto\s*gp|nascar|indycar|wrc|supercars?|v8sc|wec|formula\s*e|grand prix|daytona 500|rally)\b/.test(text)
  ) {
    return 'motorsport_event'
  }

  if (
    sport === 'mma' ||
    sport === 'boxing' ||
    sport === 'fighting' ||
    /\b(?:ufc|mma|pfl|bellator|one championship|cage warriors|fight night|main card|prelims?|boxing|bkfc|matchroom|queensberry|heavyweight|welterweight|lightweight|title fight|ppv)\b/.test(text)
  ) {
    return 'combat_event'
  }

  if (
    sport === 'golf' ||
    /\b(?:pga(?: tour| championship)?|lpga|masters|ryder cup|liv golf|dp world tour|open championship|us open golf|u\.s\. open golf)\b/.test(text)
  ) {
    return 'golf_event'
  }

  if (
    sport === 'wrestling' ||
    /\b(?:wwe|aew|nxt|raw|smackdown|dynamite|collision|wrestlemania|royal rumble|summerslam|survivor series|money in the bank|crown jewel|backlash|all in|double or nothing|full gear|revolution)\b/.test(text)
  ) {
    return 'wrestling_event'
  }

  // Athletics has "Tour" and "Classic" event names, so it must win before cycling classics.
  if (
    sport === 'athletics' ||
    /\b(?:world athletics|diamond league|continental tour|track and field|olympic athletics|athletics championships|london marathon|boston marathon|marathon)\b/.test(text)
  ) {
    return 'athletics_event'
  }

  if (
    sport === 'cycling' ||
    /\b(?:tour de france|giro d[''`]?italia|giro ditalia|vuelta a espana|vuelta|paris roubaix|milan san remo|tour of flanders|liege bastogne liege|criterium du dauphine|tour de suisse|uci|road race|time trial|stage\s*\d+|classics?)\b/.test(text)
  ) {
    return 'cycling_event'
  }

  if (sport === 'tennis' || sport === 'snooker' || /\b(?:tennis|wimbledon|atp|wta|australian open|roland garros|french open|us open tennis|snooker|crucible|uk championship)\b/.test(text)) {
    return paired ? 'tennis_or_snooker_match' : 'tournament_event'
  }

  if (paired && (TEAM_SPORT_KEYS.has(sport) || /\b(?:football|soccer|premier league|fa cup|mls|champions league|europa league|conference league|la liga|serie a|bundesliga|world cup|nations league|euro qualifiers?|copa america|afcon|asian cup|nba|wnba|euroleague|nfl|super bowl|mlb|world series|nhl|stanley cup|iihf|ipl|test cricket|odi|t20|the ashes|rugby)\b/.test(text))) {
    return 'team_vs_team'
  }

  if (TEAM_SPORT_KEYS.has(sport)) {
    return 'tournament_event'
  }

  if (/\b(?:tournament|championship|cup|open|final|semi final|quarter final|round|stage|day|night)\b/.test(text)) {
    return 'tournament_event'
  }

  return 'generic_event'
}

module.exports = {
  POSTER_CLASSES,
  classifySportsPosterEvent,
  hasActualPair
}
