const {
  POSTER_CLASSES: SPORTS_CULT_POSTER_CLASSES,
  mapSportsCultCategory,
  inferSportsCultPosterContextFromCategoryNames
} = require('../config/sportsCultCategoryMap')

const POSTER_CLASSES = Object.freeze([...SPORTS_CULT_POSTER_CLASSES])

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
    .replace(/[̀-ͯ]/g, '')
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
    .replace(/[̀-ͯ]/g, '')
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

// SportsCult category truths beat title parsing for hard cases. Title parsing
// only refines when the category map says allowTitleRefinement.
function resolveSportsCultContext(input = {}) {
  const explicit = normalizeSpace(input.sportsCultCategory || input.sportscultCategory || '')
  const direct = explicit ? mapSportsCultCategory(explicit) : null
  if (direct) return direct

  const names = []
  if (Array.isArray(input.sportsCultCategoryNames)) names.push(...input.sportsCultCategoryNames)
  if (Array.isArray(input.categoryNames)) names.push(...input.categoryNames)
  if (input.indexerCategoryName) names.push(input.indexerCategoryName)
  return inferSportsCultPosterContextFromCategoryNames(names)
}

function refineWrestlingClass(text) {
  if (/\b(?:wwe|aew|nxt|raw|smackdown|dynamite|collision|wrestlemania|royal rumble|summerslam|survivor series|money in the bank|crown jewel|backlash|all in|double or nothing|full gear|revolution)\b/.test(text)) {
    return 'wrestling_event'
  }
  if (/\b(?:adcc|grappling|grapling|jiu[\s-]*jitsu|bjj|submission only|polaris|ebi|f2w|adcw)\b/.test(text)) {
    return 'combat_event'
  }
  return ''
}

function refineFightSportsClass(text) {
  if (/\b(?:wwe|aew|nxt|wrestlemania)\b/.test(text)) return 'wrestling_event'
  if (/\b(?:ufc|pfl|bellator|one championship|cage warriors|fight night|main card|prelims?|mma)\b/.test(text)) return 'combat_event'
  if (/\b(?:boxing|bkfc|matchroom|queensberry|heavyweight|welterweight|lightweight|title fight|ppv)\b/.test(text)) return 'combat_event'
  if (/\b(?:kickboxing|muay thai|glory)\b/.test(text)) return 'combat_event'
  return ''
}

function refineOlympicClass(text) {
  if (/\b(?:athletics|track and field|marathon|10k|5k|100m|200m|sprint|hurdles)\b/.test(text)) return 'athletics_event'
  if (/\b(?:swimming|aquatics|diving|water polo)\b/.test(text)) return 'aquatics_event'
  if (/\b(?:gymnastics|rhythmic gymnastics|trampoline)\b/.test(text)) return 'gymnastics_event'
  if (/\b(?:cycling|road race|time trial|velodrome|bmx)\b/.test(text)) return 'cycling_event'
  if (/\b(?:winter|skiing|ski|snowboard|biathlon|luge|skeleton|curling|ice skating|figure skating)\b/.test(text)) return 'winter_sport_event'
  if (/\b(?:basketball|nba|wnba)\b/.test(text)) return 'team_vs_team'
  if (/\b(?:football|soccer)\b/.test(text)) return 'team_vs_team'
  return ''
}

function refineWinterClass(text) {
  if (/\b(?:cycling|stage)\b/.test(text)) return 'cycling_event'
  return ''
}

function refineAthleticsClass(text) {
  if (/\b(?:swimming|aquatics|diving)\b/.test(text)) return 'aquatics_event'
  if (/\b(?:gymnastics|rhythmic)\b/.test(text)) return 'gymnastics_event'
  return ''
}

function refineBaseballClass(text) {
  if (/\b(?:home run derby|all[\s-]star|skills)\b/.test(text) && !/\bvs\b|\bv\b/.test(text)) return 'tournament_event'
  return ''
}

function refineCricketClass(text) {
  if (/\b(?:hundred|the hundred|big bash|highlights)\b/.test(text) && !/\bvs\b|\bv\b/.test(text)) return 'tournament_event'
  return ''
}

function refineRugbyClass(text) {
  if (/\b(?:six nations launch|rugby launch|highlights)\b/.test(text) && !/\bvs\b|\bv\b/.test(text)) return 'tournament_event'
  return ''
}

function refineMotorClass(text) {
  if (/\b(?:karting|kart championship)\b/.test(text)) return 'motorsport_event'
  return ''
}

function refineGolfClass(text) {
  if (/\b(?:skins|skills challenge|long drive)\b/.test(text)) return 'tournament_event'
  return ''
}

function refineNcaaClass(text) {
  if (/\b(?:basketball|hoops|march madness|final four)\b/.test(text)) return 'team_vs_team'
  if (/\b(?:football|bowl|kickoff)\b/.test(text)) return 'team_vs_team'
  return ''
}

function refineByCategory(context, text) {
  if (!context) return ''
  const source = String(context.sourceCategory || '').toLowerCase()
  if (/wrestling|grapling/.test(source)) return refineWrestlingClass(text)
  if (/fight sports/.test(source)) return refineFightSportsClass(text)
  if (/olympic/.test(source)) return refineOlympicClass(text)
  if (/winter/.test(source)) return refineWinterClass(text)
  if (/athletics|extreme/.test(source)) return refineAthleticsClass(text)
  if (/baseball/.test(source)) return refineBaseballClass(text)
  if (/cricket/.test(source)) return refineCricketClass(text)
  if (/rugby/.test(source)) return refineRugbyClass(text)
  if (/auto|motor/.test(source)) return refineMotorClass(text)
  if (/golf/.test(source)) return refineGolfClass(text)
  if (/ncaa/.test(source)) return refineNcaaClass(text)
  return ''
}

function classifyByText(text, sport, paired) {
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
    /\b(?:ufc|mma|pfl|bellator|one championship|cage warriors|fight night|main card|prelims?|boxing|bkfc|matchroom|queensberry|heavyweight|welterweight|lightweight|title fight|ppv|kickboxing|muay thai)\b/.test(text)
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

  if (sport === 'aquatics' || /\b(?:swimming|aquatics|fina|world aquatics|diving)\b/.test(text)) {
    return 'aquatics_event'
  }

  if (sport === 'gymnastics' || /\b(?:gymnastics|rhythmic gymnastics|trampoline gymnastics|world artistic gymnastics)\b/.test(text)) {
    return 'gymnastics_event'
  }

  if (sport === 'winter' || /\b(?:winter olympics|winter sport|alpine skiing|biathlon|cross country skiing|snowboard|ice skating|figure skating|curling|luge|skeleton)\b/.test(text)) {
    return 'winter_sport_event'
  }

  if (sport === 'olympics' || /\b(?:olympic games|paris 2024|los angeles 2028|beijing 2022|olympics)\b/.test(text)) {
    return 'olympic_event'
  }

  if (
    sport === 'cycling' ||
    /\b(?:tour de france|giro d[''`]?italia|giro ditalia|vuelta a espana|vuelta|paris roubaix|milan san remo|tour of flanders|liege bastogne liege|criterium du dauphine|tour de suisse|uci|road race|time trial|stage\s*\d+|classics?)\b/.test(text)
  ) {
    return 'cycling_event'
  }

  if (sport === 'tennis' || sport === 'snooker' || /\b(?:tennis|wimbledon|atp|wta|australian open|roland garros|french open|us open tennis|snooker|crucible|uk championship|table tennis|billiards)\b/.test(text)) {
    return paired ? 'tennis_or_snooker_match' : 'racket_event'
  }

  if (paired && (TEAM_SPORT_KEYS.has(sport) || /\b(?:football|soccer|premier league|fa cup|mls|champions league|europa league|conference league|la liga|serie a|bundesliga|world cup|nations league|euro qualifiers?|copa america|afcon|asian cup|nba|wnba|euroleague|nfl|super bowl|mlb|world series|nhl|stanley cup|iihf|ipl|test cricket|odi|t20|the ashes|rugby|volleyball|handball|afl)\b/.test(text))) {
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

function classifySportsPosterEvent(input = {}) {
  const sport = normalizeKey(input.sportKey || input.sportHint || input.sport)
  const text = normalizedSearchText(input)
  const paired = hasActualPair(input)
  const context = resolveSportsCultContext(input)

  // Title-driven precision overrides: even when SportsCult points at a broad
  // category, "Premier League Darts" is darts not football, "EuroLeague
  // Basketbal" is basketball not football. Run the text classifier first and
  // accept its highly specific verdicts only.
  const textClass = classifyByText(text, sport, paired)
  if (context) {
    const refined = refineByCategory(context, text)
    const allow = context.allowTitleRefinement

    // SportsCult locked-down categories — text classifier may not override
    // unless the context allows refinement.
    if (!allow) {
      // If the locked context is team_vs_team, downgrade to tournament_event
      // when no real pair was parsed (don't fake a matchup).
      if (context.posterClass === 'team_vs_team' && !paired) {
        return 'tournament_event'
      }
      return refined || context.posterClass
    }

    // Allowed-refinement contexts: prefer the refined value, then text
    // classifier, then context default.
    if (refined) return refined
    if (textClass && textClass !== 'generic_event') return textClass
    if (context.posterClass === 'team_vs_team' && !paired) return 'tournament_event'
    return context.posterClass
  }

  return textClass
}

module.exports = {
  POSTER_CLASSES,
  classifySportsPosterEvent,
  hasActualPair
}
