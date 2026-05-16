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
    // Directional tokens (East/West/Eastern/Western) lead real club names
    // ("West Ham", "Western Bulldogs", "Eastern Suburbs"). Only strip them
    // when the NEXT token is itself round/season noise (i.e. a conference
    // qualifier like "Western Conference Round 2"), never when a real team
    // word follows. Without this, AFL "... Port Adelaide V Western Bulldogs"
    // loses "Western" (GARBLED-OPPONENT, DIRECTIVE 001).
    if (/^(?:east|west|eastern|western)$/i.test(token)) {
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

/* ============================================================================
 * CONTRACT PARSER — SPORTS_TITLE_PARSER_SPEC.md §1/§1a/§7
 *
 * `parseSportsTitleContract(rawTitle, options)` emits the client-defined schema
 * and is the binding acceptance oracle (scripts/smoke-sports-title-parser.js).
 *
 * It does NOT replace parseSportsTitle / parseSportsEventTitle (those remain
 * for the ~20 existing consumers); it is an additive, schema-complete path.
 *
 * options:
 *   sportHint     - Prowlarr-derived sport key (the sport oracle, §6)
 *   categoryNames - Prowlarr category names (fallback sport derivation)
 *   indexer       - indexer name
 *   pubDate       - torrent made date (date fallback, §5)
 * ========================================================================== */

const { canonicalizeClub, resolveClubCompetitionOverride } = require('./clubIdentity')
const { sportKeyFromCategoryName } = require('./sportsCategoryHint')

const CONTRACT_SEPARATORS = new Set(['vs', 'v', 'versus', 'at', '@'])
// `at` / `@` use the US convention: first side is AWAY, second is HOME.
const AWAY_FIRST_SEPARATORS = new Set(['at', '@'])

const RUBBISH_TOKENS = new Set([
  // scene groups / stations the client explicitly called rubbish
  'fs1', 'fs2', 'stan', 'skyf1', 'mwr', 'z3r0', 'kontrast', 'flux',
  'verum', 'm4rtyr', 'thecig', 'billie', 'mgp', 'ntb', 'ctrlhd', 'deflate',
  'organic', 'tgx', 'nf', 'blackdevil', 'nva', 'bravesvsn', 'group',
  // generic broadcasters that are NOT client-named tvChannel keepers.
  // NOTE: bare ambiguous team words ('sky','fox','heat','magic') are NOT
  // listed — "Chicago Sky"/"Miami Heat" are real teams. Multi-word
  // broadcaster forms ("Sky Sports","Fox Sports") are stripped by the
  // format/tvChannel pass and the trailing-noise regex below.
  'cbs', 'espn', 'espn+', 'espnplus', 'nbc', 'nbcsn',
  'tnt', 'bbc', 'itv', 'kayo', 'fubo', 'peacock',
  'talksport', 'bein', 'beinsport', 'eurosport', 'tsn', 'sportsnet',
  'f1tv', 'nesn', 'msg', 'redbull', 'atvp',
  'dsnp', 'webrip', 'web', 'web-dl', 'webdl', 'hdtv', 'bluray'
])

// Client-named tvChannel keepers ONLY (spec §1 HARD RULE — do NOT generalise).
const TV_CHANNEL_KEEPERS = new Map([
  ['dazn', 'DAZN'],
  ['probox', 'ProBox'],
  ['probox tv', 'ProBox']
])

const QUALITY_TOKEN_RE = /^(?:2160p|1080p|1080i|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:[a-z]{1,4})?(?:\d{2,3}(?:fps)?)?$|^\d{2,3}fps$/i
const SOURCE_FORMAT_RE = /^(?:web|web-?dl|dl|webrip|hdtv|pdtv|bluray|bdrip|dvdrip|repack|proper|complete|h264|h265|x264|x265|hevc|avc|av1|dsnp|ddp\d?)$/i
const LANG_TOKEN_RE = /^(?:en|eng|english|es|spa|spanish|fr|fre|french|de|ger|german|it|ita|italian|pt|por|portuguese|multi)$/i
// Documentaries / docuseries (episodic markers). Studio shows are ANCILLARY.
const DOC_MARKERS_RE = /\b(?:s\d{1,2}(?:e\d{1,3})?|drive to survive|the impossible|the .+? story|: a .+? story)\b/i
// Studio / recap / replay / coverage / press shows -> ancillary (spec §5).
const ANCILLARY_RE = /\b(?:press conference|pre[\s-]*(?:&|and)[\s-]*post|after the flag|gear up|highlights?|coverage|recap|recapping|replay|all games|preview|review|post[\s-]*event|pre[\s-]*event|build[\s-]*up|reaction|analysis|the verdict|magazine show|inside the nba|afl 360|studio show)\b/i

function langLabel(token = '') {
  const t = String(token || '').toLowerCase()
  if (/^en|eng|english$/.test(t)) return 'EN'
  if (/^es|spa|spanish$/.test(t)) return 'ES'
  if (/^fr|fre|french$/.test(t)) return 'FR'
  if (/^de|ger|german$/.test(t)) return 'DE'
  if (/^it|ita|italian$/.test(t)) return 'IT'
  if (/^pt|por|portuguese$/.test(t)) return 'PT'
  if (t === 'multi') return 'MULTI'
  return token
}

// Split keeping `@` as its own token, expanding pipe and bracket delimiters.
function contractTokens(raw) {
  return String(raw || '')
    .replace(/([A-Za-z0-9])@([A-Za-z0-9])/g, '$1 @ $2')
    .replace(/[()[\]{}|]/g, ' ')
    .replace(/&/g, ' & ')
    .replace(/([0-9])\/([0-9])/g, '$1 __SLASH__ $2')
    .replace(/[._:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => (t === '__SLASH__' ? '/' : t))
}

// Pull every date the title can yield, preferring DD MM (day-first, spec §5)
// and guarding the WRONG-DATE-INTERPRETATION case.
function resolveContractDate(tokens, raw, yearToken, pubDate) {
  const parts = tokens.map(t => String(t || '').trim())
  const num = parts.map(p => (/^\d{1,4}$/.test(p) ? p : ''))
  const seasonYearRe = /^(19|20)\d{2}$/

  // 0. WRONG-DATE-INTERPRETATION guard (must beat the generic ISO regex):
  // "YYYY <n> <n> YYYY" with the SAME year both sides — the inner pair is
  // DD MM bound to that year. Prefer day-first. Guards "2026 12 05 2026"
  // -> 2026-05-12 (not Dec 5).
  for (let i = 0; i <= num.length - 4; i += 1) {
    const y1 = num[i]; const a = num[i + 1]; const b = num[i + 2]; const y2 = num[i + 3]
    if (seasonYearRe.test(y1) && seasonYearRe.test(y2) && y1 === y2 &&
      /^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b)) {
      const d = a.padStart(2, '0'); const m = b.padStart(2, '0')
      if (isValidDate(y1, m, d)) return { date: `${y1}-${m}-${d}`, year: y1 }
      const d2 = b.padStart(2, '0'); const m2 = a.padStart(2, '0')
      if (isValidDate(y1, m2, d2)) return { date: `${y1}-${m2}-${d2}`, year: y1 }
    }
  }

  // 1. ISO YYYY MM DD (also slash form 2026/05/10 -> 2026 / 05 / 10)
  const isoFromSlash = raw.match(/\b((?:19|20)\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/)
  if (isoFromSlash) {
    const y = isoFromSlash[1]
    const m = isoFromSlash[2].padStart(2, '0')
    const d = isoFromSlash[3].padStart(2, '0')
    if (isValidDate(y, m, d)) return { date: `${y}-${m}-${d}`, year: y }
  }
  const iso = raw.match(/\b((?:19|20)\d{2})[._\s/-](\d{1,2})[._\s/-](\d{1,2})\b/)
  if (iso) {
    const y = iso[1]
    const m = iso[2].padStart(2, '0')
    const d = iso[3].padStart(2, '0')
    if (isValidDate(y, m, d)) return { date: `${y}-${m}-${d}`, year: y }
  }

  // 2. US M/D/YYYY or M/D/YY (slash) — must check before generic DD MM
  const usSlashLong = raw.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*((?:19|20)\d{2})\b/)
  if (usSlashLong) {
    const m = usSlashLong[1].padStart(2, '0')
    const d = usSlashLong[2].padStart(2, '0')
    const y = usSlashLong[3]
    if (isValidDate(y, m, d)) return { date: `${y}-${m}-${d}`, year: y }
  }
  const usSlashShort = raw.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2})\b/)
  if (usSlashShort) {
    const m = usSlashShort[1].padStart(2, '0')
    const d = usSlashShort[2].padStart(2, '0')
    const y = `20${usSlashShort[3]}`
    if (isValidDate(y, m, d)) return { date: `${y}-${m}-${d}`, year: y }
  }

  // 3. DD MM YYYY token triple (day-first preferred)
  for (let i = 0; i <= num.length - 3; i += 1) {
    const a = num[i]; const b = num[i + 1]; const c = num[i + 2]
    if (!a || !b || !c) continue
    if (/^(19|20)\d{2}$/.test(c) && /^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b)) {
      const d = a.padStart(2, '0'); const m = b.padStart(2, '0')
      if (isValidDate(c, m, d)) return { date: `${c}-${m}-${d}`, year: c }
    }
    if (/^(19|20)\d{2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{1,2}$/.test(c)) {
      // ISO-ish leading year: prefer DD-MM read of (b,c) — guards
      // "2026 12 05 2026" -> 2026-05-12 (not Dec 5).
      const dd = c.padStart(2, '0'); const mm = b.padStart(2, '0')
      if (isValidDate(a, mm, dd)) return { date: `${a}-${mm}-${dd}`, year: a }
      const mm2 = c.padStart(2, '0'); const dd2 = b.padStart(2, '0')
      if (isValidDate(a, mm2, dd2)) return { date: `${a}-${mm2}-${dd2}`, year: a }
    }
  }

  // 4. DD MM YY (2-digit year) e.g. 01 05 26 -> 2026-05-01
  for (let i = 0; i <= num.length - 3; i += 1) {
    const a = num[i]; const b = num[i + 1]; const c = num[i + 2]
    if (!a || !b || !c) continue
    if (/^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{2}$/.test(c) && Number(c) <= 49) {
      const y = `20${c}`
      const d = a.padStart(2, '0'); const m = b.padStart(2, '0')
      if (isValidDate(y, m, d)) return { date: `${y}-${m}-${d}`, year: y }
    }
  }

  // 5. Bare DD MM — day-first; year from title year token else pubDate
  const yearFromToken = /^(19|20)\d{2}$/.test(String(yearToken || '')) ? String(yearToken) : ''
  const pub = String(pubDate || '').match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})/)
  const fallbackYear = yearFromToken || (pub ? pub[1] : '')
  if (fallbackYear) {
    for (let i = 0; i < num.length - 1; i += 1) {
      const a = num[i]; const b = num[i + 1]
      if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) continue
      // skip pairs that are obviously a quality token slice
      const d = a.padStart(2, '0'); const m = b.padStart(2, '0')
      if (isValidDate(fallbackYear, m, d)) return { date: `${fallbackYear}-${m}-${d}`, year: fallbackYear }
    }
  }

  // 6. torrent pubDate fallback (date never empty, spec §5)
  if (pub) return { date: `${pub[1]}-${pub[2]}-${pub[3]}`, year: pub[1] }
  if (yearFromToken) return { date: '', year: yearFromToken }
  return { date: '', year: '' }
}

function detectContractSport(rawTitle, options = {}) {
  const explicit = String(options.sportHint || '').trim().toLowerCase()
  if (explicit && explicit !== 'others') return explicit
  const names = Array.isArray(options.categoryNames) ? options.categoryNames : []
  for (const n of names) {
    const s = sportKeyFromCategoryName(n)
    if (s) return s
  }
  const idxr = sportKeyFromCategoryName(options.indexer || '')
  if (idxr) return idxr
  if (explicit === 'others') return 'Others'
  return 'Others'
}

function isCombatSport(sport) {
  return /^(?:boxing|mma)$/i.test(String(sport || ''))
}

// Known competition-code shapes that may lead an unmapped title. A bare
// city/team word ("Indiana") is NOT a competition.
const KNOWN_COMP_TOKEN_RE = /^(?:UECL|UEL|UCL|UEFA|EPL|EFL|ELC|MLB|MLS|NBA|NHL|NFL|UFC|PFL|AEW|WWE|TNA|ROH|NJPW|AFL|NRL|RSL|WSL|UWCL|WSBK|WRC|WEC|BTCC|IPL|BBL|PDC|BDO|ATP|WTA|PGA|LPGA|F1|NCAA)$/i

// Resolve the competition label + (optionally) corrected sport. Title token is
// NOT authoritative — leagueMap canonicalises it; club identity overrides it.
// Returns `span` only when the matched competition is at the title start so
// callers can slice it off the home side.
function resolveContractCompetition(tokens, sport) {
  // Longest leagueMap hit anywhere in the first ~8 tokens.
  let mapped = null
  let mappedStart = -1
  let mappedSpan = 0
  const scanMax = Math.min(tokens.length, 8)
  for (let start = 0; start < scanMax; start += 1) {
    for (let count = 1; count <= Math.min(tokens.length - start, 6); count += 1) {
      const candidate = normalizeSegment(tokens.slice(start, start + count).join(' '))
      const entry = getMappedLeagueEntry(candidate)
      if (entry && (!mapped || count > mappedSpan)) {
        mapped = entry; mappedStart = start; mappedSpan = count
      }
    }
  }
  if (mapped) {
    return {
      competition: mapped.name,
      sportKey: mapped.sportKey || sport,
      span: mappedStart === 0 ? mappedSpan : 0
    }
  }
  // Unmapped: keep a leading competition-code phrase (e.g. UECL, AFL) but
  // never a plain city/team word.
  const first = String(tokens[0] || '').trim()
  if (KNOWN_COMP_TOKEN_RE.test(first)) {
    // Allow a multi-word leading code phrase like "American Rodeo"
    let span = 1
    const second = String(tokens[1] || '').trim()
    if (/^[A-Z][a-z]+$/.test(second) && /^[A-Z]/.test(first) && !/^\d/.test(second)) {
      // keep single-word unless clearly a comp phrase; default span 1
    }
    return { competition: first, sportKey: sport, span }
  }
  return { competition: '', sportKey: sport, span: 0 }
}

function captureGameNumber(raw) {
  // R2G3 / R2 G3 / R2 GM3 / Round 10 Game 1 / Game 5 / QF Game 4
  let m = raw.match(/\b(R\d{1,2})\s*(?:G|GM)\s*(\d{1,2})\b/i)
  if (m) return `${m[1].toUpperCase()} G${m[2]}`
  m = raw.match(/\bRound\s*(\d{1,2})\s*Game\s*(\d{1,2})\b/i)
  if (m) return `Round ${m[1]} Game ${m[2]}`
  m = raw.match(/\b(QF|SF)\s*Game\s*(\d{1,2})\b/i)
  if (m) return `${m[1].toUpperCase()} Game ${m[2]}`
  m = raw.match(/\bGame\s*(\d{1,2})\b/i)
  if (m) return `Game ${m[1]}`
  return ''
}

function captureSession(raw) {
  const detail = extractPosterSessionAndRound([], raw)
  // Multi-part practice: "Practice 1 & 2"
  const multi = raw.match(/\bPractice\s*(\d)\s*&\s*(\d)\b/i)
  if (multi) return `Practice ${multi[1]} & ${multi[2]}`
  for (const [label, pattern] of [
    ['Full Event', /\bfull\s*event\b/i],
    ['Main Event', /\bmain\s*event\b/i],
    ['Main Card', /\bmain\s*card\b/i],
    ['Early Prelims', /\bearly\s*prelims?\b/i],
    ['Prelims', /\bprelims?\b/i]
  ]) {
    if (pattern.test(raw)) return label
  }
  return detail.session || ''
}

function captureRound(raw) {
  const detail = extractPosterSessionAndRound([], raw)
  // Named races (Indy500 etc.)
  const named = raw.match(/\b(Indy\s*500|Indy500|Daytona\s*500|Bathurst\s*1000|Le\s*Mans)\b/i)
  if (named) return named[1].replace(/\s+/g, '')
  // Round05 / Round 05 / R06
  const roundCompact = raw.match(/\bRound\s*0*(\d{1,2})\b/i)
  if (roundCompact) return `Round${roundCompact[1].padStart(2, '0')}`
  const rCode = raw.match(/\bR0*(\d{1,2})\b/i)
  if (rCode && !/\bR\d{1,2}\s*(?:G|GM)/i.test(raw)) return `R${rCode[1].padStart(2, '0')}`
  if (/\bsuper\s*qualifier\b/i.test(raw)) return 'Super Qualifier'
  // Knockout rounds incl. glued forms ("Semifinals","Quarterfinal") that the
  // \b-anchored ROUND_PATTERNS miss.
  if (/\b(?:quarter[\s-]*finals?|qf)\b/i.test(raw)) return 'Quarter Final'
  if (/\b(?:semi[\s-]*finals?|sf)\b/i.test(raw)) return 'Semi Final'
  if (detail.round && /^(quarter final|semi final|final)$/i.test(detail.round)) return detail.round
  if (/\bfinals?\b/i.test(raw) && !/\b(?:semi|quarter)/i.test(raw)) return 'Final'
  return detail.round || ''
}

const VENUE_DICT = new Set([
  'indianapolis', 'long beach', 'czech republic', 'spain catalunya', 'catalunya',
  'france', 'monaco', 'silverstone', 'monza', 'spa', 'suzuka', 'austin',
  'melbourne', 'st tite', 'zhengzhou', 'rome', 'st andrews'
])

function captureVenue(tokens, raw, sport) {
  const joined = normalizeSegment(tokens.join(' ')).toLowerCase()
  for (const v of VENUE_DICT) {
    if (joined.includes(v)) {
      return v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
  }
  // Motorsport: IndyCar named-circuit shortcut
  if (/motorsport/i.test(sport) && /\bIndy\s*500|Indy500\b/i.test(raw)) return 'Indianapolis'
  return ''
}

function captureFormatQualityLanguage(tokens) {
  let quality = ''
  let language = ''
  const formatParts = []
  for (const tok of tokens) {
    const t = String(tok || '').trim()
    if (!t) continue
    if (QUALITY_TOKEN_RE.test(t)) {
      // Split "720pEN60fps" into quality + language
      const m = t.match(/^(\d{3,4}[ip]|sd|hd|fhd|uhd)([a-z]{2,4})?(\d{2,3}fps)?$/i)
      if (m) {
        quality = `${m[1]}${m[3] ? m[3] : ''}`
        if (m[2] && LANG_TOKEN_RE.test(m[2])) language = langLabel(m[2])
      } else {
        quality = t
      }
      continue
    }
    if (SOURCE_FORMAT_RE.test(t)) { formatParts.push(t.toUpperCase().replace('WEBDL', 'WEB DL')); continue }
    if (LANG_TOKEN_RE.test(t) && !language) { language = langLabel(t); continue }
  }
  return {
    quality,
    language,
    format: formatParts.length ? formatParts.join(' ').replace(/\bWEB DL\b/g, 'WEB DL') : ''
  }
}

function captureTvChannel(raw) {
  const lower = ` ${raw.toLowerCase()} `
  for (const [needle, label] of TV_CHANNEL_KEEPERS) {
    if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) return label
  }
  return ''
}

function isSideNoiseToken(t) {
  const low = String(t || '').toLowerCase()
  if (!low) return true
  if (CONTRACT_SEPARATORS.has(low)) return true
  if (RUBBISH_TOKENS.has(low) || TV_CHANNEL_KEEPERS.has(low)) return true
  if (QUALITY_TOKEN_RE.test(t) || SOURCE_FORMAT_RE.test(t)) return true
  if (LANG_TOKEN_RE.test(t) && low !== 'it') return true
  if (/^(?:19|20)\d{2}$/.test(t)) return true
  if (/^\d{1,4}$/.test(t)) return true
  if (/^(?:r\d{1,2}|g\d{1,2}|gm\d{1,2}|r\d{1,2}g(?:m)?\d{1,2}|mw\d{1,2}|gw\d{1,2}|wd\d{1,2})$/i.test(t)) return true
  if (/^(?:game|round|week|matchweek|mw|gw|leg|qf|sf|semifinals?|quarterfinals?|finals?|prelims?|main|card|event|full|playoffs?|playoff|rs|regular|season|pre|post|press|conference|singles|doubles|women|men|mens|womens)$/i.test(t)) return true
  if (/^(?:slash|the|of|round\d{1,2}|game\d{1,2})$/i.test(t)) return true
  return false
}

// Venue words that can lead the home side (tennis tournament city, motorsport
// circuit) and must be trimmed before the player/team name.
function isLeadingVenueNoise(t) {
  const low = String(t || '').toLowerCase().replace(/,$/, '')
  if (VENUE_DICT.has(low)) return true
  // tournament-city tokens that appear right after a tennis/golf league code
  return /^(?:roma|rome|paris|madrid|miami|monte|carlo|indian|wells|cincinnati|montreal|toronto|dubai|doha|stuttgart|berlin|prague|italy|spain|france)$/i.test(low.replace(/,$/, ''))
}

// Strip every noise class so a side never carries broadcaster / round / year /
// sponsor / scene-group tokens (spec invariant: no leaks).
// `trimLeadingVenue` removes leading tournament-city/venue noise (home side).
function cleanSide(tokens, sport, ctx, trimLeadingVenue = false) {
  let work = [...tokens]
  // Trim leading noise tokens (round/date/year/season/venue) before the name.
  if (trimLeadingVenue) {
    while (work.length > 1) {
      const head = String(work[0] || '').trim()
      if (isSideNoiseToken(head) || isLeadingVenueNoise(head)) { work.shift(); continue }
      break
    }
  }
  const kept = []
  for (const tok of work) {
    const t = String(tok || '').replace(/,$/, '').trim()
    if (!t) continue
    if (isSideNoiseToken(t)) continue
    kept.push(t)
  }
  let label = normalizeSegment(kept.join(' '))
  // Drop trailing competition / sport noise
  label = label.replace(/\b(?:premier league|super league|championship|playoffs?|regular season)\b/gi, ' ')
  label = normalizeSegment(label)
  const canon = canonicalizeClub(label, { sport, context: ctx })
  return titleCase(canon)
}

function parseSportsTitleContract(rawTitle, options = {}) {
  const raw = normalizeSegment(rawTitle)
  if (!raw) {
    return {
      sport: 'Others', competition: '', contentType: 'event',
      date: '', year: '', raw: String(rawTitle || '')
    }
  }

  const tokens = contractTokens(rawTitle)
  const sport = detectContractSport(rawTitle, options)

  // contentType: documentary / ancillary / event
  let contentType = 'event'
  if (DOC_MARKERS_RE.test(raw)) contentType = 'documentary'
  else if (ANCILLARY_RE.test(raw)) contentType = 'ancillary'

  const yearTok = (tokens.find(t => /^(19|20)\d{2}$/.test(String(t).trim())) || '')
  const { date, year } = resolveContractDate(tokens, raw, yearTok, options.pubDate)

  // Competition (leagueMap-canonical; club identity may override)
  const comp = resolveContractCompetition(tokens, sport)

  const out = {
    sport: comp.sportKey || sport || 'Others',
    competition: comp.competition || '',
    contentType,
    date: date || '',
    year: year || (date ? date.slice(0, 4) : ''),
    raw: String(rawTitle || '')
  }

  const gameNumber = captureGameNumber(raw)
  const round = captureRound(raw)
  const session = captureSession(raw)
  const venue = captureVenue(tokens, raw, out.sport)
  const fql = captureFormatQualityLanguage(tokens)
  const tvChannel = captureTvChannel(raw)

  if (gameNumber) out.gameNumber = gameNumber
  if (round) out.round = round
  if (session) out.session = session
  if (venue) out.venue = venue
  if (fql.quality) out.quality = fql.quality
  if (fql.format) out.format = fql.format
  if (fql.language) out.language = fql.language
  if (tvChannel) out.tvChannel = tvChannel

  // Regular Season qualifier
  if (/\bRS\b/.test(raw) || /\bregular\s+season\b/i.test(raw)) out.season = 'Regular Season'
  if (/\bplayoffs?\b/i.test(raw) && !/\bnba\s+playoffs\b/i.test(raw)) out.season = out.season || 'Playoffs'

  // Documentary / ancillary: keep under sport, NO head-to-head, single title.
  if (contentType !== 'event') {
    out.title = titleCase(
      normalizeSegment(
        raw
          .replace(DOC_MARKERS_RE, m => m)
          .replace(/\b(?:1080p|720p|2160p|web ?-?dl|webrip|hdtv|x264|x265|h264|h265|hevc|dsnp|ddp\d?(?: \d)?)\b/gi, ' ')
          .replace(/\b(?:19|20)\d{2}\/\d{1,2}\/\d{1,2}\b/g, ' ')
      )
    ).trim() || raw
    return out
  }

  // Combat (boxing / MMA / UFC): single `event` string, NO home/away.
  const sepIndex = tokens.findIndex(t => CONTRACT_SEPARATORS.has(String(t).toLowerCase()))
  if (isCombatSport(out.sport) || (/^(?:ufc|pfl|bellator|one)$/i.test(out.competition) && sepIndex > 0)) {
    if (sepIndex > 0 && sepIndex < tokens.length - 1) {
      const before = cleanSide(tokens.slice(0, sepIndex), out.sport, raw)
      const after = cleanSide(tokens.slice(sepIndex + 1), out.sport, raw)
      if (before && after) out.event = `${before} vs ${after}`
    }
    if (!out.event) {
      out.event = cleanSide(tokens, out.sport, raw) || raw
    }
    if (!out.competition && /^(?:boxing)$/i.test(out.sport)) out.competition = 'Boxing'
    return out
  }

  // Team / player vs team (or at/@ away-first) path.
  if (sepIndex > 0 && sepIndex < tokens.length - 1) {
    const sepTok = String(tokens[sepIndex]).toLowerCase()
    // The left side carries all leading league/date/round/venue noise — trim
    // it aggressively. The right side ends at the first metadata token.
    const leftRaw = tokens.slice(comp.span, sepIndex)
    const rightRaw = tokens.slice(sepIndex + 1)
    let sideA = cleanSide(leftRaw, out.sport, raw, true)
    let sideB = cleanSide(rightRaw, out.sport, raw, false)

    let home; let away
    if (AWAY_FIRST_SEPARATORS.has(sepTok)) {
      away = sideA; home = sideB
    } else {
      home = sideA; away = sideB
    }

    // Club identity competition override (clubs are ground truth, §5)
    const override = resolveClubCompetitionOverride(home, away)
    if (override) {
      out.competition = override.competition
      out.sport = override.sportKey || out.sport
    }

    if (home) out.home = home
    if (away) out.away = away
    if (home && away) out.event = `${home} vs ${away}`
    return out
  }

  // No separator: single-event (motorsport / niche / tournament). Title kept.
  const eventTokens = tokens.slice(comp.span)
  const cleanedEvent = cleanSide(eventTokens, out.sport, raw)
  if (cleanedEvent) out.event = cleanedEvent
  else out.event = titleCase(normalizeSegment(raw))
  return out
}

module.exports = {
  parseSportsTitle,
  parseSportsEventTitle,
  parseSportsTitleContract,
  normalizeKnownSportsTeamAlias,
  stripCompetitionSideNoise
}
