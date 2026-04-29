// SportsCult category mapping — contract-locked.
//
// SportsCult is the source of truth for sports torrent rows. Their category
// names are the strongest classification hint we have. This file maps every
// SportsCult category we have seen to:
//
//   - appSportHint        the broad sport bucket PVTKRRX exposes (`football`,
//                         `motorsport`, ...) — kept narrow on purpose so
//                         Stremio rows stay broad and useful.
//   - canonicalSport      the canonical sport key SportsMeta uses, may be the
//                         same as appSportHint or a more specific value.
//   - posterClass         the poster class the renderer/adapter must use; one
//                         of the values in POSTER_CLASSES.
//   - defaultPosterMode   `matchup` / `single` / `solo`. Title parsing may
//                         downgrade matchup -> solo when no pair is found,
//                         but never upgrade `solo` -> fake `matchup`.
//   - topLevelLabel       human label shown on the poster header when no
//                         specific league is parsed.
//   - allowTitleRefinement   true when title parsing is allowed to refine
//                            broad categories (Fight Sports -> Boxing,
//                            Olympic games -> Athletics, ...).
//   - notes               human-readable hint for future contributors.
//
// Title parsing must NOT override SportsCult truths. Premier League Darts is
// darts. EuroLeague Basketbal is basketball. Formula1 is motorsport.

const POSTER_CLASSES = Object.freeze([
  'team_vs_team',
  'motorsport_event',
  'combat_event',
  'golf_event',
  'wrestling_event',
  'cycling_event',
  'athletics_event',
  'olympic_event',
  'winter_sport_event',
  'aquatics_event',
  'gymnastics_event',
  'racket_event',
  'darts_event',
  'tennis_or_snooker_match',
  'tournament_event',
  'generic_event'
])

const POSTER_MODES = Object.freeze(['matchup', 'single', 'solo'])

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

const TEAM_DEFAULT = 'team_vs_team'
const TOURNAMENT_DEFAULT = 'tournament_event'

const RAW_MAP = [
  // Football — clubs and nations
  ['EPL', 'football', 'football', TEAM_DEFAULT, 'matchup', 'EPL'],
  ['FA Cup', 'football', 'football', TEAM_DEFAULT, 'matchup', 'FA Cup'],
  ['Champions League', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Champions League'],
  ['Europa League', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Europa League'],
  ['UefaConferenceLeague', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Conference League'],
  ['UEFAEuro', 'football', 'football', TEAM_DEFAULT, 'matchup', 'UEFA Euros'],
  ['EuroCup', 'football', 'football', TEAM_DEFAULT, 'matchup', 'EuroCup'],
  ['ELC', 'football', 'football', TEAM_DEFAULT, 'matchup', 'EFL Championship'],
  ['La Liga', 'football', 'football', TEAM_DEFAULT, 'matchup', 'La Liga'],
  ['Serie A', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Serie A'],
  ['Bundesliga', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Bundesliga'],
  ['Ligue1', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Ligue 1'],
  ['DutchEredivisie', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Eredivisie'],
  ['BelgianProLeague', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Belgian Pro League'],
  ['PrimeiraPortugal', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Primeira Liga'],
  ['MLS', 'football', 'football', TEAM_DEFAULT, 'matchup', 'MLS'],
  ['CPL', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Canadian Premier League'],
  ['European Soccer', 'football', 'football', TEAM_DEFAULT, 'matchup', 'European Soccer', { allowTitleRefinement: true }],
  ['International Soccer', 'football', 'football', TEAM_DEFAULT, 'matchup', 'International Soccer', { allowTitleRefinement: true }],
  ['BeachSoccer', 'football', 'football', TEAM_DEFAULT, 'matchup', 'Beach Soccer'],

  // Motorsport
  ['Formula1', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'Formula 1'],
  ['MotoGP', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'MotoGP'],
  ['NASCAR', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'NASCAR'],
  ['IndyCar', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'IndyCar'],
  ['WRCRally', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'WRC'],
  ['MotorSport', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'Motorsport', { allowTitleRefinement: true }],
  ['AutoMotoRacing', 'motorsport', 'motorsport', 'motorsport_event', 'solo', 'Auto/Moto Racing', { allowTitleRefinement: true }],

  // Combat / fight sports
  ['UFC', 'mma', 'mma', 'combat_event', 'solo', 'UFC'],
  ['MMA', 'mma', 'mma', 'combat_event', 'solo', 'MMA'],
  ['Bellator', 'mma', 'mma', 'combat_event', 'solo', 'Bellator'],
  ['Boxing', 'boxing', 'boxing', 'combat_event', 'solo', 'Boxing'],
  ['KickBoxing/Muay Thai', 'mma', 'kickboxing', 'combat_event', 'solo', 'Kickboxing / Muay Thai'],
  ['Fight Sports', 'mma', 'mma', 'combat_event', 'solo', 'Fight Sports', { allowTitleRefinement: true }],

  // Wrestling shows + grappling carve-out
  ['Wrestling/Grapling', 'wrestling', 'wrestling', 'wrestling_event', 'solo', 'Wrestling', { allowTitleRefinement: true, notes: 'WWE/AEW/NXT titles win as wrestling_event; pure grappling titles fall back to combat/tournament via title refinement.' }],

  // Golf
  ['Golf', 'golf', 'golf', 'golf_event', 'solo', 'Golf', { allowTitleRefinement: true }],

  // Cycling
  ['Cycling', 'cycling', 'cycling', 'cycling_event', 'solo', 'Cycling', { allowTitleRefinement: true }],
  ['TourDeFrance', 'cycling', 'cycling', 'cycling_event', 'solo', 'Tour de France'],
  ["Girod'Italia", 'cycling', 'cycling', 'cycling_event', 'solo', "Giro d'Italia"],
  ['LaVuelta', 'cycling', 'cycling', 'cycling_event', 'solo', 'La Vuelta'],

  // Tennis / racket / cue
  ['Tennis', 'tennis', 'tennis', 'racket_event', 'solo', 'Tennis', { allowTitleRefinement: true }],
  ['TableTennis', 'tennis', 'table-tennis', 'racket_event', 'solo', 'Table Tennis'],
  ['Snooker/Pool', 'snooker', 'snooker', 'racket_event', 'solo', 'Snooker'],
  ['Billard', 'snooker', 'billiards', 'racket_event', 'solo', 'Billiards'],
  ['Darts', 'darts', 'darts', 'darts_event', 'solo', 'Darts', { allowTitleRefinement: true }],

  // Athletics / endurance / Olympics / Winter
  ['Athletics', 'athletics', 'athletics', 'athletics_event', 'solo', 'Athletics', { allowTitleRefinement: true }],
  ['Olympic games', 'athletics', 'olympics', 'olympic_event', 'solo', 'Olympic Games', { allowTitleRefinement: true }],
  ['OlympicGamesParis24', 'athletics', 'olympics', 'olympic_event', 'solo', 'Paris 2024', { allowTitleRefinement: true }],
  ['WinterOlympicGames', 'winter', 'winter-olympics', 'winter_sport_event', 'solo', 'Winter Olympics', { allowTitleRefinement: true }],
  ['WinterSport', 'winter', 'winter-sport', 'winter_sport_event', 'solo', 'Winter Sport', { allowTitleRefinement: true }],
  ['Sailing', 'athletics', 'sailing', 'athletics_event', 'solo', 'Sailing'],
  ['Surfing', 'athletics', 'surfing', 'athletics_event', 'solo', 'Surfing'],
  ['Climbing', 'athletics', 'climbing', 'athletics_event', 'solo', 'Climbing'],
  ['Extreme Sports', 'athletics', 'extreme', 'athletics_event', 'solo', 'Extreme Sports', { allowTitleRefinement: true }],
  ['Bodybuilding/Fitness', 'athletics', 'fitness', 'athletics_event', 'solo', 'Bodybuilding / Fitness'],
  ['BreakDance', 'athletics', 'breakdance', 'athletics_event', 'solo', 'Break Dance'],
  ['CrossFit', 'athletics', 'crossfit', 'athletics_event', 'solo', 'CrossFit'],
  ['Bowling', 'athletics', 'bowling', 'athletics_event', 'solo', 'Bowling'],

  // Aquatics / gymnastics
  ['Swimming/Aquatics', 'athletics', 'aquatics', 'aquatics_event', 'solo', 'Swimming / Aquatics'],
  ['Gymnastics', 'athletics', 'gymnastics', 'gymnastics_event', 'solo', 'Gymnastics'],
  ['RhythmicGymnastics', 'athletics', 'rhythmic-gymnastics', 'gymnastics_event', 'solo', 'Rhythmic Gymnastics'],
  ['Weightlifting', 'athletics', 'weightlifting', 'athletics_event', 'solo', 'Weightlifting'],

  // American football and gridiron
  ['American Football', 'american-football', 'american-football', TEAM_DEFAULT, 'matchup', 'American Football'],
  ['NFL', 'american-football', 'american-football', TEAM_DEFAULT, 'matchup', 'NFL'],
  ['CFL', 'american-football', 'american-football', TEAM_DEFAULT, 'matchup', 'CFL'],
  ['UFL', 'american-football', 'american-football', TEAM_DEFAULT, 'matchup', 'UFL'],
  ['NCAAFootball', 'american-football', 'ncaaf', TEAM_DEFAULT, 'matchup', 'NCAA Football'],
  ['NCAA Basket/Football', 'american-football', 'ncaa', TEAM_DEFAULT, 'matchup', 'NCAA', { allowTitleRefinement: true, notes: 'Title parsing splits NCAAB vs NCAAF.' }],

  // Basketball
  ['Basketball Champions', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'Basketball Champions League'],
  ['EuroLeague Basketbal', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'EuroLeague'],
  ['European Basketball', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'European Basketball'],
  ['FIBA 3x3 Basketball', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'FIBA 3x3'],
  ['GLeagueNBA', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'NBA G League'],
  ['International Basket', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'International Basketball', { allowTitleRefinement: true }],
  ['NBA', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'NBA'],
  ['NCAABasketball', 'basketball', 'ncaab', TEAM_DEFAULT, 'matchup', 'NCAA Basketball'],
  ['Streetball', 'basketball', 'streetball', TEAM_DEFAULT, 'matchup', 'Streetball'],
  ['WNBA', 'basketball', 'basketball', TEAM_DEFAULT, 'matchup', 'WNBA'],

  // Baseball
  ['Baseball', 'baseball', 'baseball', TEAM_DEFAULT, 'matchup', 'Baseball', { allowTitleRefinement: true }],
  ['MLB', 'baseball', 'baseball', TEAM_DEFAULT, 'matchup', 'MLB'],

  // Cricket
  ['Cricket', 'cricket', 'cricket', TEAM_DEFAULT, 'matchup', 'Cricket', { allowTitleRefinement: true }],

  // Rugby
  ['Rugby', 'rugby', 'rugby', TEAM_DEFAULT, 'matchup', 'Rugby', { allowTitleRefinement: true }],
  ['NRL', 'rugby', 'rugby', TEAM_DEFAULT, 'matchup', 'NRL'],
  ['GAA (Gaelic)', 'rugby', 'gaa', TEAM_DEFAULT, 'matchup', 'GAA'],

  // Hockey
  ['IceHockey', 'hockey', 'hockey', TEAM_DEFAULT, 'matchup', 'Ice Hockey'],
  ['NHL', 'hockey', 'hockey', TEAM_DEFAULT, 'matchup', 'NHL'],
  ['KHL', 'hockey', 'hockey', TEAM_DEFAULT, 'matchup', 'KHL'],
  ['Field Hockey', 'hockey', 'field-hockey', TEAM_DEFAULT, 'matchup', 'Field Hockey'],

  // Volleyball / Handball / Australian football
  ['Volleyball', 'rugby', 'volleyball', TEAM_DEFAULT, 'matchup', 'Volleyball'],
  ['BeachVolleyball', 'rugby', 'beach-volleyball', TEAM_DEFAULT, 'matchup', 'Beach Volleyball'],
  ['Handball', 'rugby', 'handball', TEAM_DEFAULT, 'matchup', 'Handball'],
  ['AFL(AustralianFB)', 'rugby', 'afl', TEAM_DEFAULT, 'matchup', 'AFL'],
  ['Ultimate Diskk', 'rugby', 'ultimate-frisbee', TEAM_DEFAULT, 'matchup', 'Ultimate'],

  // Mind sport / esports / docs / generic safety net
  ['Chess', 'athletics', 'chess', TOURNAMENT_DEFAULT, 'solo', 'Chess'],
  ['BrainGames', 'athletics', 'brain-games', TOURNAMENT_DEFAULT, 'solo', 'Brain Games', { allowTitleRefinement: true }],
  ['ESport', 'athletics', 'esports', TOURNAMENT_DEFAULT, 'solo', 'Esports', { allowTitleRefinement: true }],
  ['Documentary', 'athletics', 'sports-documentary', 'generic_event', 'solo', 'Documentary'],
  ['Uncategorised', '', '', 'generic_event', 'solo', 'Sports', { allowTitleRefinement: true, notes: 'Never invent fake team-v-team. Title parsing must add real signal first.' }]
]

function buildEntry(row) {
  const [
    sourceCategory,
    appSportHint,
    canonicalSport,
    posterClass,
    defaultPosterMode,
    topLevelLabel,
    extras = {}
  ] = row
  return Object.freeze({
    sourceCategory,
    appSportHint,
    canonicalSport,
    posterClass,
    defaultPosterMode,
    topLevelLabel,
    allowTitleRefinement: Boolean(extras.allowTitleRefinement),
    notes: extras.notes || ''
  })
}

const CATEGORY_ENTRIES = RAW_MAP.map(buildEntry)

const CATEGORY_INDEX = new Map()
for (const entry of CATEGORY_ENTRIES) {
  CATEGORY_INDEX.set(normalizeKey(entry.sourceCategory), entry)
}

// Aliases — same canonical entry under multiple SportsCult phrasings.
const ALIASES = [
  ['english premier league', 'EPL'],
  ['premier league', 'EPL'],
  ['premier league darts', 'Darts'],
  ['epl darts', 'Darts'],
  ['major league soccer', 'MLS'],
  ['indian premier league', 'Cricket'],
  ['ipl', 'Cricket'],
  ['formula 1', 'Formula1'],
  ['f1', 'Formula1'],
  ['moto gp', 'MotoGP'],
  ['ufc fight night', 'UFC'],
  ['euro qualifiers', 'International Soccer'],
  ['fifa world cup', 'International Soccer'],
  ['world cup qualifiers', 'International Soccer'],
  ['uefa nations league', 'International Soccer'],
  ['uefa euro qualifiers', 'International Soccer']
]
for (const [alias, target] of ALIASES) {
  const entry = CATEGORY_INDEX.get(normalizeKey(target))
  if (entry) CATEGORY_INDEX.set(normalizeKey(alias), entry)
}

const UNCATEGORISED_ENTRY = CATEGORY_INDEX.get(normalizeKey('Uncategorised'))

function mapSportsCultCategory(categoryName) {
  const key = normalizeKey(categoryName)
  if (!key) return null
  return CATEGORY_INDEX.get(key) || null
}

function listSportsCultCategories() {
  return RAW_MAP.map((row) => row[0])
}

function getDefaultUncategorised() {
  return UNCATEGORISED_ENTRY || null
}

function inferSportsCultPosterContextFromCategoryNames(categoryNames = []) {
  const list = Array.isArray(categoryNames) ? categoryNames : []
  for (const name of list) {
    const entry = mapSportsCultCategory(name)
    if (entry) return entry
  }
  return null
}

module.exports = {
  POSTER_CLASSES,
  POSTER_MODES,
  mapSportsCultCategory,
  listSportsCultCategories,
  getDefaultUncategorised,
  inferSportsCultPosterContextFromCategoryNames
}
