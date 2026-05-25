// Club / abbreviation / spaced-letter / sponsor identity map.
//
// Governed by SPORTS_TITLE_PARSER_SPEC.md §4 and §5 ("Title competition token
// is NOT authoritative"). When the title's competition token contradicts the
// real competition the clubs play in, the clubs win.
//
// Three jobs:
//   1. Normalize a side label (expand abbreviations, spaced letters, strip
//      sponsor prefixes) → canonical club name.
//   2. Given the two sides, report the competition override they imply (e.g.
//      Celtic/Rangers → Scottish Premiership even if the title says "EPL").
//   3. Provide deterministic lookups callers can extend per sport.

function normalize(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value = '') {
  return normalize(value)
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Sponsor prefixes glued onto club names in scene titles (Batch 5-7
// SPONSOR-PREFIX-LEAK). Stripped before identity resolution.
const SPONSOR_PREFIXES = [
  'vet concept',
  'easycredit',
  'betclic',
  'emirates',
  'etihad',
  'sportsbet',
  'bet365',
  'cinch',
  'sky bet',
  'efbet',
  'lba',
  'serie a tim',
  'laliga ea sports',
  'ligue 1 uber eats',
  'bundesliga'
]

function stripSponsorPrefix(value = '') {
  let text = normalize(value)
  let changed = true
  while (changed && text) {
    changed = false
    for (const prefix of SPONSOR_PREFIXES) {
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i')
      if (re.test(text)) {
        text = normalize(text.replace(re, ''))
        changed = true
      }
    }
  }
  return text
}

// Canonical-name lookup. Keys are normalizeKey() forms. Values are the
// canonical club / franchise name. Includes:
//   - spaced-letter forms: "n e c" -> NEC Nijmegen
//   - 3-letter league codes: NBA / NHL / MLB tricodes
//   - common short club names
const EFL_CHAMPIONSHIP_CLUBS = Object.freeze([
  ['Birmingham City', ['birmingham', 'birmingham city']],
  ['Blackburn Rovers', ['blackburn', 'blackburn rovers']],
  ['Bristol City', ['bristol', 'bristol city']],
  ['Charlton Athletic', ['charlton', 'charlton athletic']],
  ['Coventry City', ['coventry', 'coventry city']],
  ['Derby County', ['derby', 'derby county']],
  ['Hull City', ['hull', 'hull city']],
  ['Ipswich Town', ['ipswich', 'ipswich town']],
  ['Leicester City', ['leicester', 'leicester city']],
  ['Middlesbrough', ['boro', 'middlesbrough']],
  ['Millwall', ['millwall']],
  ['Norwich City', ['norwich', 'norwich city']],
  ['Oxford United', ['oxford', 'oxford united', 'oxford utd']],
  ['Portsmouth', ['pompey', 'portsmouth']],
  ['Preston North End', ['preston', 'preston north end']],
  ['Queens Park Rangers', ['qpr', 'queens park rangers']],
  ['Sheffield United', ['sheffield united', 'sheffield utd', 'sheff utd']],
  ['Sheffield Wednesday', ['sheffield wednesday', 'sheffield wed', 'wednesday']],
  ['Southampton', ['saints', 'southampton']],
  ['Stoke City', ['stoke', 'stoke city']],
  ['Swansea City', ['swansea', 'swansea city']],
  ['Watford', ['watford']],
  ['West Bromwich Albion', ['west brom', 'west bromwich albion', 'wba']],
  ['Wrexham', ['wrexham', 'wrexham afc']]
])

const CLUB_ALIASES = new Map([
  // --- Eredivisie / Dutch (spaced-letter, Batch 16) ---
  ['n e c', 'NEC Nijmegen'],
  ['nec', 'NEC Nijmegen'],
  ['nec nijmegen', 'NEC Nijmegen'],
  ['fc groningen', 'FC Groningen'],
  ['groningen', 'FC Groningen'],
  ['psv', 'PSV Eindhoven'],
  ['psv eindhoven', 'PSV Eindhoven'],
  ['ajax', 'Ajax'],
  ['feyenoord', 'Feyenoord'],
  ['az', 'AZ Alkmaar'],
  ['az alkmaar', 'AZ Alkmaar'],
  ['fc twente', 'FC Twente'],
  ['twente', 'FC Twente'],
  ['fc utrecht', 'FC Utrecht'],

  // --- Scottish Premiership (Batch 13, club override) ---
  ['celtic', 'Celtic'],
  ['rangers', 'Rangers'],
  ['hearts', 'Heart of Midlothian'],
  ['heart of midlothian', 'Heart of Midlothian'],
  ['hibs', 'Hibernian'],
  ['hibernian', 'Hibernian'],
  ['aberdeen', 'Aberdeen'],
  ['dundee', 'Dundee'],
  ['dundee united', 'Dundee United'],
  ['motherwell', 'Motherwell'],
  ['kilmarnock', 'Kilmarnock'],
  ['st mirren', 'St Mirren'],
  ['st johnstone', 'St Johnstone'],
  ['livingston', 'Livingston'],
  ['ross county', 'Ross County'],

  // --- EFL Championship (club override for bad tracker sport hints) ---
  ...EFL_CHAMPIONSHIP_CLUBS.flatMap(([club, aliases]) => aliases.map((alias) => [alias, club])),

  // --- MLS / U.S. Open Cup (avoid tennis "US Open" misrouting) ---
  ['atlanta united', 'Atlanta United FC'],
  ['atlanta united fc', 'Atlanta United FC'],
  ['columbus crew', 'Columbus Crew'],
  ['colorado rapids', 'Colorado Rapids'],
  ['houston dynamo', 'Houston Dynamo FC'],
  ['houston dynamo fc', 'Houston Dynamo FC'],
  ['new york city fc', 'New York City FC'],
  ['nycfc', 'New York City FC'],
  ['orlando city', 'Orlando City SC'],
  ['orlando city sc', 'Orlando City SC'],
  ['san jose earthquakes', 'San Jose Earthquakes'],
  ['st louis city', 'St. Louis CITY SC'],
  ['st louis city sc', 'St. Louis CITY SC'],
  ['st. louis city sc', 'St. Louis CITY SC'],

  // --- NBA tricodes (Batch 15) ---
  ['atl', 'Atlanta Hawks'],
  ['bos', 'Boston Celtics'],
  ['bkn', 'Brooklyn Nets'],
  ['cha', 'Charlotte Hornets'],
  ['chi', 'Chicago Bulls'],
  ['cle', 'Cleveland Cavaliers'],
  ['dal', 'Dallas Mavericks'],
  ['den', 'Denver Nuggets'],
  ['det', 'Detroit Pistons'],
  ['gsw', 'Golden State Warriors'],
  ['hou', 'Houston Rockets'],
  ['ind', 'Indiana Pacers'],
  ['lac', 'LA Clippers'],
  ['lal', 'Los Angeles Lakers'],
  ['mem', 'Memphis Grizzlies'],
  ['mia', 'Miami Heat'],
  ['mil', 'Milwaukee Bucks'],
  ['min', 'Minnesota Timberwolves'],
  ['nop', 'New Orleans Pelicans'],
  ['nyk', 'New York Knicks'],
  ['okc', 'Oklahoma City Thunder'],
  ['orl', 'Orlando Magic'],
  ['phi', 'Philadelphia 76ers'],
  ['phx', 'Phoenix Suns'],
  ['por', 'Portland Trail Blazers'],
  ['sac', 'Sacramento Kings'],
  ['sas', 'San Antonio Spurs'],
  ['tor', 'Toronto Raptors'],
  ['uta', 'Utah Jazz'],
  ['was', 'Washington Wizards']
])

// Competition override map. Keyed by normalizeKey(canonicalClub). When BOTH
// sides resolve to the same competition, that competition overrides a
// mislabelled title token. Clubs are ground truth (spec §5).
const CLUB_COMPETITION = new Map([
  ['celtic', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['rangers', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['heart of midlothian', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['hibernian', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['aberdeen', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['dundee', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['dundee united', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['motherwell', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['kilmarnock', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['st mirren', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['st johnstone', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['livingston', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ['ross county', { competition: 'Scottish Premiership', sportKey: 'football' }],
  ...EFL_CHAMPIONSHIP_CLUBS.map(([club]) => [
    normalizeKey(club),
    { competition: 'EFL Championship', sportKey: 'football' }
  ]),
  ['atlanta united fc', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['columbus crew', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['colorado rapids', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['houston dynamo fc', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['new york city fc', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['orlando city sc', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['san jose earthquakes', { competition: 'U.S. Open Cup', sportKey: 'football' }],
  ['st louis city sc', { competition: 'U.S. Open Cup', sportKey: 'football' }]
])

// Canonicalize a single side label. Strips sponsor prefixes, collapses
// spaced-letters, expands known abbreviations / tricodes.
function canonicalizeClub(value = '', options = {}) {
  const stripped = stripSponsorPrefix(value)
  if (!stripped) return ''

  // Collapse spaced single letters: "N E C" -> "NEC"
  const collapsedSpacedLetters = /^(?:[a-z]\s){1,5}[a-z]$/i.test(stripped)
    ? stripped.replace(/\s+/g, '')
    : stripped

  const directKey = normalizeKey(collapsedSpacedLetters)
  if (CLUB_ALIASES.has(directKey)) return CLUB_ALIASES.get(directKey)

  // Tricode only meaningful when the surrounding sport is a US league with
  // tricodes (NBA/NHL/MLB). The caller passes sport context.
  const sport = String(options.sport || '').toLowerCase()
  const ctx = String(options.context || '').toLowerCase()
  const tricodeEligible = /\b(?:nba|nhl|mlb|basketball|hockey|baseball)\b/.test(`${sport} ${ctx}`)
  if (tricodeEligible && /^[a-z]{3}$/i.test(collapsedSpacedLetters)) {
    const tri = CLUB_ALIASES.get(collapsedSpacedLetters.toLowerCase())
    if (tri) return tri
  }

  const strippedKey = normalizeKey(stripped)
  if (CLUB_ALIASES.has(strippedKey)) return CLUB_ALIASES.get(strippedKey)

  return stripped
}

// Given the two resolved sides, return a competition override if BOTH map to
// the same competition. Returns null when there is no confident override.
function resolveClubCompetitionOverride(home = '', away = '') {
  const a = CLUB_COMPETITION.get(normalizeKey(home))
  const b = CLUB_COMPETITION.get(normalizeKey(away))
  if (a && b && a.competition === b.competition) {
    return { ...a }
  }
  // A single famous club is still a strong signal if the other side is unknown
  // (e.g. "Celtic vs <lower-table club not in map>").
  if (a && !b) return { ...a }
  if (b && !a) return { ...b }
  return null
}

module.exports = {
  canonicalizeClub,
  resolveClubCompetitionOverride,
  stripSponsorPrefix,
  CLUB_ALIASES,
  CLUB_COMPETITION
}
