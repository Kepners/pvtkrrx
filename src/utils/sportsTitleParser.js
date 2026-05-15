const { getMappedLeagueEntry } = require('./leagueMap')

const QUALITY_RE = /^(?:(?:2160p|1080p|1080i|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:[a-z]{1,4})?(?:\d{2,3}(?:fps)?)?|\d{2,3}fps)$/i
const SOURCE_RE = /^(?:hdtv|pdtv|sdtv|webrip|webdl|web-dl|web|bluray|bdrip|dvdrip|satfeed|iptv|repack|proper|complete|espn(?:p|plus|\+)?|f1tv|fs1|nesn|msg|usan?|nbcsn|nbcsba|nbcsca|sportsnet|sn|sny|snla|snp|bally|bein(?:sport)?\d*|eurosport|skynz|kayo|fubo|newvision|tnt|fox|bbc|itv|cbs|abc|peacock|atvp?|apple|bign|flo(?:hockey|sports?))$/i
const CODEC_RE = /^(?:x264|x265|h264|h265|hevc|avc|av1)(?:-.+)?$/i
const RELEASE_GROUP_RE = /^[A-Z0-9]+-[A-Za-z0-9]+$/
const HLG_HDR_RE = /^(?:hlg|hdr10?\+?|dovi?|dv|10bit|8bit)$/i
const GENERIC_SPORT_PREFIX_RE = /^(?:football|soccer|basketball|baseball|cricket|rugby|mma|boxing|wrestling|darts|golf|motorsport|motor|tennis|hockey|ice|american|uefa)$/i
const LEADING_TEAM_NOISE_RE = /^(?:game|games|match|matches|week|round|matchweek|mw|gw|md|wd|wsm|heat|session|fight|night|grand|prix|qualifying|practice|sprint|race|main|card|prelims?|early|cup|bowl|super|opening|closing|ceremony|playoffs?|postseason|finals?|semi(?:final)?|quarter(?:final)?|championship|conference|title|event|world|wimbledon|australian|roland|garros|open|us|east|west|western|eastern|centre|center|court|heavyweight|middleweight|welterweight|lightweight|rs|qf|sf|wcqf|ecqf|wcsf|ecsf|wcf|ecf|f\d*|r\d+|m\d+|gm\d+|g\d+|mw\d+|gw\d+|md\d+|wd\d+|\d+(?:st|nd|rd|th))$/i
const ROMAN_NUMERAL_RE = /^(?=[ivxlcdm]+$)m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i
const TEAM_BROADCAST_RE = /\b(?:nbc|nbcsn|espn(?:2|p|plus|\+)?|f1tv|nesn|msg|usan?|yes(?:\s*network)?|sky(?:\s*sports?)?|bt(?:\s*sport)?|tnt(?:\s*sports?)?|fox(?:\s*sports?)?|cbs|abc|itv(?:4)?|tsn|sportsnet|sn|bally|bein(?:\s*sports?)?\d*|canal\+?|dazn|eurosport|skynz|kayo(?:\s*sports?)?|fubo|newvision|bign|big\s*ten(?:\s*network)?|flo(?:hockey|sports?))\b/gi
const TEAM_LANGUAGE_RE = /\b(?:en|english|spanish|french|german|italian|portuguese)\b/gi
const TEAM_PRESENTATION_RE = /\b(?:condensed(?:\s*game)?|extended(?:\s*highlights?)?|highlights?|replay)\b/gi
const TEAM_TAIL_NOISE_RE = /^(?:game|games|round|matchday|matchweek|mw|gw|md|wd|wsm|main|card|pre|post|episode|show|event|fight|full|review|preview|highlights?|replay|coverage|studio|apple|tv|fubo|beinsport\d*|skynz|z3r0|nva|bign|flo(?:hockey|sports?)|wrestlemania|east|west|western|eastern|conference|centre|center|court|playoffs?|postseason|finals?|semi(?:final)?|quarter(?:final)?|rs|qf|sf|wcqf|ecqf|wcsf|ecsf|wcf|ecf|f\d*|r\d+|m\d+|gm\d+|g\d+|mw\d+|gw\d+|md\d+|wd\d+|\d+(?:st|nd|rd|th))$/i
const EVENT_SOURCE_NOISE_RE = /^(?:apple|tv|atvp?|fubo|skynz|kayo|z3r0|nva|espn(?:p|plus|\+)?|f1tv|fs1|nesn|msg|usan?|nbc(?:sn|sba|sca)?|sny|snla|snp|sky|sports|fox|bbc|itv|cbs|abc|tnt|peacock|eurosport|nordic|bign|flo(?:hockey|sports?))$/i
const TEAM_SIDE_LEADING_COMPETITION_RE = /^(?:(?:english\s+)?premier\s+league|women'?s?\s+super\s+league|wsl|wsm|scottish\s+women'?s?\s+premier\s+league|women'?s?\s+(?:national\s+)?basketball\s+(?:association|league)|efl\s+championship|efl|elc|championship|uefa\s+champions\s+league|champions\s+league|uefa\s+conference\s+league|conference\s+league|uecl|ucl|uefa\s+europa\s+league|europa\s+league|uel|copa\s+libertadores|copa\s+sudamericana|copa\s+america|kings?\s+cup|basketball\s+champions\s+league(?:\s+of\s+americas)?|primera\s+feb|ncaa\s+(?:women\s+)?softball(?:\s+(?:qf|sf|quarter\s*final|semi\s*final))?|ncaa\s+(?:women\s+)?basketball|ncaa\s+football|wnba\s+(?:pre?s|preseason)|turkish\s+league|rsl|afl|cpl|ufl|ohl|final\s+four|four|f4|league|l\d+)\b/i
const TEAM_SIDE_EXACT_COMPETITION_RE = /^(?:(?:english\s+)?premier\s+league|women'?s?\s+super\s+league|wsl|wsm|scottish\s+women'?s?\s+premier\s+league|women'?s?\s+(?:national\s+)?basketball\s+(?:association|league)|efl\s+championship|efl|elc|championship|uefa\s+champions\s+league|champions\s+league|uefa\s+conference\s+league|conference\s+league|uecl|ucl|uefa\s+europa\s+league|europa\s+league|uel|copa\s+libertadores|copa\s+sudamericana|copa\s+america|kings?\s+cup|basketball\s+champions\s+league(?:\s+of\s+americas)?|primera\s+feb|ncaa\s+(?:women\s+)?softball(?:\s+(?:qf|sf|quarter\s*final|semi\s*final))?|ncaa\s+(?:women\s+)?basketball|ncaa\s+football|wnba\s+(?:pre?s|preseason)|turkish\s+league|rsl|afl|cpl|ufl|ohl|final\s+four|four|f4|league|l\d+)$/i
const TEAM_SIDE_SEASON_NOISE_RE = /^(?:(?:19|20)\d{2}(?:[/-]\d{2})?|pre?s|preseason|playoffs?|quarter\s*final|semi\s*final|qf|sf|(?:\d{1,2}(?:st|nd|rd|th)?\s+)?leg|first\s+leg|second\s+leg|full\s+match|post\s+match|pre\s+show|pre\s+match|game\s*\d+|round\s*\d+|matchweek\s*\d*|mw\s*\d+|gw\s*\d+|md\s*\d+|wd\s*\d+|r\d+|g\d+|gm\d+|f\d+|\d{1,2}(?:st|nd|rd|th)?|\d{1,2})\b/i
const TEAM_SIDE_TRAILING_SPORT_NOISE_RE = /\b(?:4k|hockey|ice\s+hockey|basketball|football|baseball|softball|soccer|rugby)\s*$/i
// Game-state injections appear between team name and "vs" in MLB rescheduled
// games and a few other sports: "Colorado Rockies Makeup of vs New York Mets".
// Strip the trailing phrase so it does not become part of the team name.
const TEAM_SIDE_TRAILING_GAME_STATE_RE = /\b(?:make[\s-]*up\s+of|completion\s+of|continuation\s+of|resumption\s+of|postponed|suspended|rain[\s-]*delayed?|resumed|tba)\s*$/i

// Known league/series tokens that start non-vs event titles
const EVENT_LEAGUE_RE = /^(?:Formula1|F1|UFC|PFL|Bellator|ONE|WWE|AEW|TNA|ROH|NJPW|MotoGP|Moto\s*GP|NASCAR|IndyCar|WRC|Supercars|Supercars\s*Championship|V8SC|Bathurst|WSBK|WEC|FormulaE|Rally|Dakar|PGA|PGA\s*Tour|LPGA|LPGA\s*Tour|Masters|ATP|ATP\s*World\s*Tour|WTA|WTA\s*Tour|Wimbledon|Australian\s*Open|Roland\s*Garros|French\s*Open|US\s*Open|U\.S\.\s*Open|Davis\s*Cup|Laver\s*Cup|PDC|PDC\s*Darts|Premier\s*League\s*Darts|World\s*Championship\s*Darts|World\s*Matchplay|IPL|IPLM\d+|Indian\s*Premier\s*League|MLS|Major\s*League\s*Soccer|MLB|Major\s*League\s*Baseball|NCAA\s*Baseball|World\s*Baseball\s*Classic|NBA|NBA\s*Playoffs|EuroLeague|EasyCredit\s*BBL|Basketball\s*Champions\s*League(?:\s*of\s*Americas)?|Super\s*Rugby|MLR|Major\s*League\s*Rugby|Tour\s*de\s*France|Giro|Vuelta|TDF)$/i

const SESSION_PATTERNS = [
  ['Pre-Season Testing', /\bpre[\s-]*season\s+testing\b/i],
  ['Test Session', /\btest\s+session\b/i],
  ['Sprint Shootout', /\bsprint\s+shootout\b/i],
  ['Sprint Qualifying', /\bsprint\s+qualifying\b/i],
  ['Early Prelims', /\bearly\s+prelims?\b/i],
  ['Main Card', /\bmain\s+card\b/i],
  ['Main Event', /\bmain\s+event\b/i],
  ['FP1 Practice', /\bfp1\s+practice\b/i],
  ['FP2 Practice', /\bfp2\s+practice\b/i],
  ['FP3 Practice', /\bfp3\s+practice\b/i],
  ['Free Practice 1', /\bfree\s+practice\s+(?:1|one)\b/i],
  ['Free Practice 2', /\bfree\s+practice\s+(?:2|two)\b/i],
  ['Free Practice 3', /\bfree\s+practice\s+(?:3|three)\b/i],
  ['Practice 1', /\bpractice\s+(?:1|one)\b/i],
  ['Practice 2', /\bpractice\s+(?:2|two)\b/i],
  ['Practice 3', /\bpractice\s+(?:3|three)\b/i],
  ['FP1', /\bfp1\b/i],
  ['FP2', /\bfp2\b/i],
  ['FP3', /\bfp3\b/i],
  ['Qualifying', /\bqualifying\b/i],
  ['Sprint', /\bsprint\b/i],
  ['Warm Up', /\bwarm\s*up\b/i],
  ['Race', /\brace\b/i],
  ['Prelims', /\bprelims?\b/i],
  ['PPV', /\bppv\b/i],
  ['Final Round', /\bfinal\s+round\b/i],
  ['Round 1', /\bround\s+(?:1|one)\b/i],
  ['Round 2', /\bround\s+(?:2|two)\b/i],
  ['Round 3', /\bround\s+(?:3|three)\b/i],
  ['Round 4', /\bround\s+(?:4|four)\b/i],
  ['Foursomes', /\bfoursomes\b/i],
  ['Singles', /\bsingles\b/i],
  ['Time Trial', /\btime\s+trial\b/i],
  ['Road Race', /\broad\s+race\b/i]
]

const ROUND_PATTERNS = [
  ['Quarter Final', /\b(?:quarter[\s-]*final|qf)\b/i],
  ['Semi Final', /\b(?:semi[\s-]*final|sf)\b/i],
  ['Final', /\bfinal\b/i],
  // \s* (not \s+) so dotted titles like `WRC.Catalunya.Day3.Tanak` (token=`Day3`)
  // and conventionally-spaced `Round 3` both match.
  ['Round', /\bround\s*(\d{1,2})\b/i],
  ['R', /\br(\d{1,2})\b/i],
  ['Stage', /\bstage\s*(\d{1,2})\b/i],
  ['Day', /\bday\s*(\d{1,2})\b/i],
  ['Night', /\bnight\s*(\d{1,2})\b/i],
  ['Game', /\bgame\s*(\d{1,2})\b/i],
  ['Week', /\bweek\s*(\d{1,2})\b/i]
]

const LEADING_LEAGUE_ALIASES = [
  [/^uefa nations league$/i, 'UEFA Nations League'],
  [/^fifa world cup qualifiers?$/i, 'FIFA World Cup Qualifier'],
  [/^world cup qualifiers?$/i, 'World Cup Qualifier'],
  [/^euro qualifiers?$/i, 'Euro Qualifier'],
  [/^european championship$/i, 'European Championship'],
  [/^copa america$/i, 'Copa America'],
  [/^afcon$/i, 'AFCON'],
  [/^asian cup$/i, 'Asian Cup'],
  [/^conmebol qualifiers?$/i, 'CONMEBOL Qualifier'],
  [/^concacaf qualifiers?$/i, 'CONCACAF Qualifier'],
  [/^international friendlies?$/i, 'International Friendly'],
  [/^premier league darts$/i, 'Premier League Darts']
]

const NBA_TEAM_ALIASES = new Map([
  ['76ers', 'Philadelphia 76ers'],
  ['sixers', 'Philadelphia 76ers'],
  ['atlanta hawks', 'Atlanta Hawks'],
  ['hawks', 'Atlanta Hawks'],
  ['boston celtics', 'Boston Celtics'],
  ['celtics', 'Boston Celtics'],
  ['brooklyn nets', 'Brooklyn Nets'],
  ['nets', 'Brooklyn Nets'],
  ['charlotte hornets', 'Charlotte Hornets'],
  ['hornets', 'Charlotte Hornets'],
  ['chicago bulls', 'Chicago Bulls'],
  ['bulls', 'Chicago Bulls'],
  ['cleveland cavaliers', 'Cleveland Cavaliers'],
  ['cavaliers', 'Cleveland Cavaliers'],
  ['cavs', 'Cleveland Cavaliers'],
  ['dallas mavericks', 'Dallas Mavericks'],
  ['mavericks', 'Dallas Mavericks'],
  ['mavs', 'Dallas Mavericks'],
  ['denver nuggets', 'Denver Nuggets'],
  ['nuggets', 'Denver Nuggets'],
  ['detroit pistons', 'Detroit Pistons'],
  ['pistons', 'Detroit Pistons'],
  ['golden state warriors', 'Golden State Warriors'],
  ['warriors', 'Golden State Warriors'],
  ['houston rockets', 'Houston Rockets'],
  ['rockets', 'Houston Rockets'],
  ['indiana pacers', 'Indiana Pacers'],
  ['pacers', 'Indiana Pacers'],
  ['la clippers', 'LA Clippers'],
  ['los angeles clippers', 'LA Clippers'],
  ['clippers', 'LA Clippers'],
  ['los angeles lakers', 'Los Angeles Lakers'],
  ['la lakers', 'Los Angeles Lakers'],
  ['lakers', 'Los Angeles Lakers'],
  ['memphis grizzlies', 'Memphis Grizzlies'],
  ['grizzlies', 'Memphis Grizzlies'],
  ['miami heat', 'Miami Heat'],
  ['heat', 'Miami Heat'],
  ['milwaukee bucks', 'Milwaukee Bucks'],
  ['bucks', 'Milwaukee Bucks'],
  ['minnesota timberwolves', 'Minnesota Timberwolves'],
  ['timberwolves', 'Minnesota Timberwolves'],
  ['wolves', 'Minnesota Timberwolves'],
  ['new orleans pelicans', 'New Orleans Pelicans'],
  ['pelicans', 'New Orleans Pelicans'],
  ['new york knicks', 'New York Knicks'],
  ['knicks', 'New York Knicks'],
  ['oklahoma city thunder', 'Oklahoma City Thunder'],
  ['okc thunder', 'Oklahoma City Thunder'],
  ['thunder', 'Oklahoma City Thunder'],
  ['orlando magic', 'Orlando Magic'],
  ['magic', 'Orlando Magic'],
  ['philadelphia 76ers', 'Philadelphia 76ers'],
  ['phoenix suns', 'Phoenix Suns'],
  ['suns', 'Phoenix Suns'],
  ['portland trail blazers', 'Portland Trail Blazers'],
  ['trail blazers', 'Portland Trail Blazers'],
  ['blazers', 'Portland Trail Blazers'],
  ['sacramento kings', 'Sacramento Kings'],
  ['kings', 'Sacramento Kings'],
  ['san antonio spurs', 'San Antonio Spurs'],
  ['spurs', 'San Antonio Spurs'],
  ['toronto raptors', 'Toronto Raptors'],
  ['raptors', 'Toronto Raptors'],
  ['utah jazz', 'Utah Jazz'],
  ['jazz', 'Utah Jazz'],
  ['washington wizards', 'Washington Wizards'],
  ['wizards', 'Washington Wizards']
])

function normalizeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sportsTeamAliasKey(value = '') {
  return normalizeSegment(value)
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeKnownSportsTeamAlias(value = '') {
  const cleaned = normalizeSegment(value)
  if (!cleaned) return ''
  return NBA_TEAM_ALIASES.get(sportsTeamAliasKey(cleaned)) || cleaned
}

function shouldExpandKnownSportsTeamAlias(options = {}) {
  const context = normalizeSegment([
    options.league,
    options.sport,
    options.raw
  ].filter(Boolean).join(' ')).toLowerCase()
  return /\b(?:nba|basketball)\b/.test(context)
}

function titleCase(value = '') {
  const upperTokens = new Set([
    'AC', 'AEK', 'AEW', 'AFCON', 'AFC', 'ATP', 'BIGN', 'CF', 'CPL', 'EFL',
    'ELC', 'EPL', 'FA', 'F1', 'FC', 'FEB', 'FIFA', 'FP1', 'FP2', 'FP3', 'GP', 'IPL', 'LIV', 'MLB', 'MLS', 'MMA',
    'NBA', 'NCAA', 'NFL', 'NHL', 'NJPW', 'NXT', 'PDC', 'PFL', 'PGA', 'PPV',
    'OHL', 'PSG', 'ROH', 'SC', 'TNA', 'UCL', 'UCLA', 'UECL', 'UEFA', 'UFC', 'UEL', 'UFL',
    'WC', 'WEC', 'WNBA', 'WRC', 'WTA', 'WWE'
  ])
  return normalizeSegment(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()
      if (upperTokens.has(upper)) return upper
      if (upper === 'MOTOGP') return 'MotoGP'
      if (upper === 'SMACKDOWN') return 'SmackDown'
      if (upper === 'WRESTLEMANIA') return 'WrestleMania'
      const cased = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      return cased.replace(/\bO'([a-z])/g, (_, letter) => `O'${letter.toUpperCase()}`)
    })
    .join(' ')
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

function stripCompetitionSideNoise(value = '') {
  let text = normalizeSegment(value)
  if (!text) return ''

  let changed = true
  while (changed && text) {
    const before = text
    text = normalizeSegment(
      text
        .replace(TEAM_SIDE_LEADING_COMPETITION_RE, ' ')
        .replace(TEAM_SIDE_SEASON_NOISE_RE, ' ')
    )
    changed = text !== before
  }

  text = normalizeSegment(
    text
      .replace(TEAM_BROADCAST_RE, ' ')
      .replace(TEAM_LANGUAGE_RE, ' ')
      .replace(TEAM_PRESENTATION_RE, ' ')
      .replace(/\b(?:19|20)\d{2}(?:[/-]\d{2})?\b/g, ' ')
      .replace(/\b(?:pre?s|preseason)\b/gi, ' ')
      .replace(TEAM_SIDE_TRAILING_GAME_STATE_RE, ' ')
      .replace(TEAM_SIDE_TRAILING_SPORT_NOISE_RE, ' ')
  )

  return TEAM_SIDE_EXACT_COMPETITION_RE.test(text) ? '' : text
}

function splitEventTitleTokens(raw) {
  const dotted = String(raw || '').split('.').map(token => token.trim()).filter(Boolean)
  if (dotted.length >= 2) return dotted
  return normalizeSegment(raw).split(/\s+/).filter(Boolean)
}

function splitMatchupTitleTokens(raw) {
  return String(raw || '')
    .replace(/([A-Za-z0-9])@([A-Za-z0-9])/g, '$1 @ $2')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[._/\\:,;|-]+/g, ' ')
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
        leagueToken: /^iplm\d+$/i.test(compact) ? 'IPL' : spaced,
        nextIndex: count
      }
    }
  }
  if (!bestMatch && parts.length > 1 && GENERIC_SPORT_PREFIX_RE.test(parts[0])) {
    const afterPrefix = resolveEventLeagueStart(parts.slice(1))
    if (afterPrefix) {
      bestMatch = {
        leagueToken: afterPrefix.leagueToken,
        nextIndex: afterPrefix.nextIndex + 1
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

// Year-only fallback for titles like `F1.2026.Round.04...` or `PGA.2026.The.Masters...`
// where the season/year is present but no month/day. Returns 'YYYY' or ''.
function extractFallbackYear(value) {
  const source = String(value || '').trim()
  if (!source) return ''
  const match = source.match(/\b((?:19|20)\d{2})\b/)
  return match ? match[1] : ''
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

  if (/^(19|20)\d{2}$/.test(parts[0]) && parts.length > 1) {
    const afterYear = findLeadingLeagueSpan(parts.slice(1))
    if (afterYear) {
      return {
        league: afterYear.league,
        nextIndex: afterYear.nextIndex + 1
      }
    }
  }

  if (/^iplm\d+$/i.test(parts[0])) {
    return {
      league: 'Indian Premier League',
      nextIndex: 1
    }
  }

  let best = null
  const maxParts = Math.min(parts.length, 6)
  for (let count = 1; count <= maxParts; count += 1) {
    const candidate = normalizeSegment(parts.slice(0, count).join(' '))
    const alias = LEADING_LEAGUE_ALIASES.find(([pattern]) => pattern.test(candidate))
    if (alias) {
      best = {
        league: alias[1],
        nextIndex: count
      }
    }
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
    const afterPrefix = findLeadingLeagueSpan(parts.slice(1))
    if (afterPrefix && afterPrefix.nextIndex + 1 < parts.length) {
      return {
        league: afterPrefix.league,
        nextIndex: afterPrefix.nextIndex + 1
      }
    }
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

function normalizeTeamLabel(value, options = {}) {
  const cleaned = stripCompetitionSideNoise(normalizeSegment(
    String(value || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b\d+\s+of\s+\d+\b/gi, ' ')
      .replace(/\b(?:iplm?\d+|m\d+)\b/gi, ' ')
      .replace(/\b(?:m4rtyr|thecig|mwr|billie|mgp|ntb|ctrlhd|deflate|organic|tgx|nf|int)\b.*$/gi, ' ')
      .replace(TEAM_BROADCAST_RE, ' ')
      .replace(TEAM_LANGUAGE_RE, ' ')
      .replace(TEAM_PRESENTATION_RE, ' ')
      .replace(/\b(?:matchweek|mw|gw|md|wd)\s*\d+\b/gi, ' ')
      .replace(/\b(?:mw|gw|md|wd)\b/gi, ' ')
      .replace(/\bwsm\b/gi, ' ')
      .replace(/\b(?:mlb|nba(?:\s+playoffs?)?|nfl|nhl|mls|ipl|pga(?:\s+tour)?|motogp|ufc|mma|pfl|bellator|atp|wta|pdc|darts?|wc|world\s+championship|snooker|tennis|boxing)\b$/gi, ' ')
      .replace(/\b(?:r\d+|gm\d+|g\d+|\d{2,3}fps|fps)\b/gi, ' ')
  ))
  return shouldExpandKnownSportsTeamAlias(options) ? normalizeKnownSportsTeamAlias(cleaned) : cleaned
}

function normalizeTeamTokens(tokens, options = {}) {
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
  const cleanedLabel = normalizeTeamLabel(trimmed.join(' '), options)
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
  const leadingLeagueSport = getMappedLeagueEntry(leadingLeague?.league || '')?.sportKey || ''
  const tennisYearIndex = leadingLeagueSport === 'tennis'
    ? preTeamTokens.findIndex(token => /^(19|20)\d{2}$/.test(String(token || '').trim()))
    : -1
  const tennisPreTeamTokens = tennisYearIndex >= 0 && tennisYearIndex < preTeamTokens.length - 1
    ? preTeamTokens.slice(tennisYearIndex + 1)
    : preTeamTokens
  const leadingDate = parseLeadingDateTokens(preTeamTokens, fallbackDate)
  const useLeadingDate = Boolean(leadingDate && leadingDate.nextIndex > 0)
  const seasonInfo = useLeadingDate
    ? { tokens: preTeamTokens, yearHint: leadingDate.date.slice(0, 4) }
    : (tennisYearIndex >= 0
      ? { tokens: tennisPreTeamTokens, yearHint: preTeamTokens[tennisYearIndex] }
      : stripLeadingSeasonTokens(preTeamTokens))
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
  const trailingLeague = trailingDate && trailingDate.nextIndex < afterSeparator.length
    ? findLeadingLeagueSpan(afterSeparator.slice(trailingDate.nextIndex))
    : null

  const awayTeamTokens = trailingDate
    ? afterSeparator.slice(0, trailingDate.startIndex)
    : afterSeparator
  const date = (useLeadingDate ? leadingDate?.date : '') || preSeparatorDate?.date || trailingDate?.date || extractFallbackDate(fallbackDate)

  const resolvedLeague = leadingLeague?.league || trailingLeague?.league || ''
  const teamAliasContext = { league: resolvedLeague, raw }
  const homeTeam = normalizeTeamTokens(homeTeamTokens, teamAliasContext)
  const awayTeam = normalizeTeamTokens(awayTeamTokens, teamAliasContext)
  if (!homeTeam || !awayTeam) return null
  const eventShort = leadingLeague?.league && /^\d{1,4}$/.test(String(preTeamTokens[0] || '').trim())
    ? `${leadingLeague.league} ${preTeamTokens[0]}`
    : (resolvedLeague || `${homeTeam} vs ${awayTeam}`)

  const eventYear = date ? date.slice(0, 4) : extractFallbackYear(raw || fallbackDate)

  return {
    league: resolvedLeague,
    ...(date ? { date } : {}),
    ...(eventYear ? { eventYear } : {}),
    homeTeam,
    awayTeam,
    principalA: homeTeam,
    principalB: awayTeam,
    eventName: `${homeTeam} vs ${awayTeam}`,
    eventShort,
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
    // Strip dotted round/session token forms used in WRC/F1 titles such as
    // `Day3`, `Stage4`, `Night2`, `Game5`, `Week7` so they don't pollute the
    // event display title — extractPosterSessionAndRound surfaces them as a
    // separate `round` field.
    if (/^(?:day|stage|night|game|week)\d+$/i.test(token)) continue
    if (/^m\d+$/i.test(token)) continue
    // Note: standalone words "Day"/"Stage"/"Night"/"Game"/"Week" are part of
    // legitimate event names (e.g. "Valero Texas Open Day 2") and must be
    // kept. Only the compact-token forms (Day3/Stage4/...) are stripped above.
    if ((lower === 'round' || lower === 'event' || lower === 'episode') && /^\d+$/.test(next)) {
      index += 1
      continue
    }
    if (lower === 'full' && /^race$/i.test(next)) {
      index += 1
      continue
    }
    if (lower === 'warm' && /^up$/i.test(next)) {
      index += 1
      continue
    }
    if (lower === 'free' && /^practice$/i.test(next)) {
      if (/^(?:[1-3]|one|two|three)$/i.test(String(stripped[index + 2] || ''))) index += 2
      else index += 1
      continue
    }
    if (lower === 'practice' && /^(?:[1-3]|one|two|three)$/i.test(next)) {
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

function extractPosterSessionAndRound(tokens = [], rawTitle = '') {
  const text = normalizeSegment(
    (Array.isArray(tokens) ? tokens.join(' ') : String(tokens || '')) || rawTitle
  )
  const result = {
    session: '',
    round: '',
    roundShort: ''
  }

  for (const [label, pattern] of SESSION_PATTERNS) {
    if (pattern.test(text)) {
      result.session = label
      break
    }
  }

  for (const [label, pattern] of ROUND_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    result.round = match[1] ? `${label} ${match[1]}` : label
    result.roundShort = match[1] ? `${label.charAt(0).toUpperCase()}${match[1]}` : result.round
    break
  }

  if (!result.round && result.session && /^round\s+\d+/i.test(result.session)) {
    result.round = result.session
    result.roundShort = result.session.replace(/^round\s+/i, 'R')
  }

  return result
}

function shortenEventName(value = '') {
  const clean = titleCase(value)
  if (!clean) return ''
  return clean
    .replace(/\bGrand Prix\b/g, 'GP')
    .replace(/\bChampionship\b/g, 'Champs')
    .replace(/\bWorld Cup Qualifier\b/g, 'WCQ')
    .replace(/\bWorld Cup Qualifiers\b/g, 'WCQ')
    .replace(/\bFriday Night SmackDown\b/g, 'SmackDown')
    .replace(/\bMonday Night Raw\b/g, 'Raw')
}

function normalizeLeagueLabel(value = '') {
  const label = titleCase(value)
  if (/^F1$/i.test(label)) return 'Formula 1'
  if (/^Pdc$/i.test(label)) return 'PDC'
  if (/^Pdc Darts$/i.test(label)) return 'PDC Darts'
  if (/^Premier League Darts$/i.test(label)) return 'Premier League Darts'
  return label
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

  const teamAliasContext = { league, raw }
  const homeTeam = normalizeTeamTokens(homeTeamTokens, teamAliasContext)
  const awayTeam = normalizeTeamTokens(awayTeamTokens, teamAliasContext)
  if (!league || !homeTeam || !awayTeam) return parseFlexibleMatchupTitle(raw, fallbackDate)

  const qualityToken = metadataIndex === -1 ? '' : trailingTokens[metadataIndex]
  const quality = QUALITY_RE.test(qualityToken) ? qualityToken : ''

  return {
    league,
    date: dateMatch.date,
    eventYear: dateMatch.date ? dateMatch.date.slice(0, 4) : extractFallbackYear(raw),
    homeTeam,
    awayTeam,
    principalA: homeTeam,
    principalB: awayTeam,
    eventName: `${homeTeam} vs ${awayTeam}`,
    eventShort: league,
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
  dateStr = dateStr || extractFallbackDate(raw || fallbackDate)

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

  const posterDetail = extractPosterSessionAndRound(eventTokens, raw)
  const league = normalizeLeagueLabel(leagueStart.leagueToken)
  const numericCard = /^(?:ufc|pfl|bellator|one|wwe|aew)$/i.test(league) &&
    /^\d{1,4}$/.test(String(eventTokens[0] || '').trim())
  const normalizedEventTokens = numericCard
    ? [league, eventTokens[0]]
    : normalizeEventNameTokens(eventTokens, dateStr || fallbackDate)
  if (normalizedEventTokens.length === 0) return null

  let eventName = normalizeSegment(normalizedEventTokens.join(' '))
  if (/darts/i.test(league) && /^(?:night|round|final|semi final|quarter final)$/i.test(eventName)) {
    eventName = league
  }
  if (!league || !eventName) return null

  const eventYear = dateStr ? dateStr.slice(0, 4) : extractFallbackYear(raw || fallbackDate)

  return {
    league,
    ...(dateStr ? { date: dateStr } : {}),
    ...(eventYear ? { eventYear } : {}),
    eventName,
    eventShort: shortenEventName(eventName),
    ...(posterDetail.session ? { session: posterDetail.session } : {}),
    ...(posterDetail.round ? { round: posterDetail.round } : {}),
    ...(posterDetail.roundShort ? { roundShort: posterDetail.roundShort } : {}),
    ...(quality ? { quality } : {}),
    raw
  }
}

module.exports = {
  parseSportsTitle,
  parseSportsEventTitle,
  normalizeKnownSportsTeamAlias,
  stripCompetitionSideNoise
}
