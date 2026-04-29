#!/usr/bin/env node

const assert = require('node:assert/strict')

const {
  POSTER_CLASSES,
  POSTER_MODES,
  mapSportsCultCategory,
  listSportsCultCategories,
  inferSportsCultPosterContextFromCategoryNames
} = require('../src/config/sportsCultCategoryMap')

// Required SportsCult categories from the poster contract — every one of these
// must map to a non-null entry exposing the contract shape.
const REQUIRED_CATEGORIES = [
  'AFL(AustralianFB)',
  'American Football',
  'Athletics',
  'AutoMotoRacing',
  'Baseball',
  'Basketball Champions',
  'BeachSoccer',
  'BeachVolleyball',
  'BelgianProLeague',
  'Bellator',
  'Billard',
  'Bodybuilding/Fitness',
  'Bowling',
  'Boxing',
  'BrainGames',
  'BreakDance',
  'Bundesliga',
  'CFL',
  'Champions League',
  'Chess',
  'Climbing',
  'CPL',
  'Cricket',
  'CrossFit',
  'Cycling',
  'Darts',
  'Documentary',
  'DutchEredivisie',
  'ELC',
  'EPL',
  'ESport',
  'EuroCup',
  'EuroLeague Basketbal',
  'Europa League',
  'European Basketball',
  'European Soccer',
  'Extreme Sports',
  'FIBA 3x3 Basketball',
  'Field Hockey',
  'Fight Sports',
  'Formula1',
  'GAA (Gaelic)',
  "Girod'Italia",
  'GLeagueNBA',
  'Golf',
  'Gymnastics',
  'Handball',
  'IceHockey',
  'IndyCar',
  'International Basket',
  'International Soccer',
  'KHL',
  'KickBoxing/Muay Thai',
  'La Liga',
  'LaVuelta',
  'Ligue1',
  'MLB',
  'MLS',
  'MMA',
  'MotoGP',
  'MotorSport',
  'NASCAR',
  'NBA',
  'NCAA Basket/Football',
  'NCAABasketball',
  'NCAAFootball',
  'NFL',
  'NHL',
  'NRL',
  'Olympic games',
  'OlympicGamesParis24',
  'PrimeiraPortugal',
  'RhythmicGymnastics',
  'Rugby',
  'Sailing',
  'Serie A',
  'Snooker/Pool',
  'Streetball',
  'Surfing',
  'Swimming/Aquatics',
  'TableTennis',
  'Tennis',
  'TourDeFrance',
  'UefaConferenceLeague',
  'UEFAEuro',
  'UFC',
  'UFL',
  'Ultimate Diskk',
  'Uncategorised',
  'Volleyball',
  'Weightlifting',
  'WinterOlympicGames',
  'WinterSport',
  'WNBA',
  'WRCRally',
  'Wrestling/Grapling'
]

const POSTER_CLASS_SET = new Set(POSTER_CLASSES)

function assertEntry(category, entry, expected = {}) {
  assert.ok(entry, `category=${category} returns an entry`)
  assert.equal(entry.sourceCategory.length > 0, true, `category=${category} sourceCategory non-empty`)
  assert.equal(typeof entry.appSportHint, 'string', `category=${category} appSportHint string`)
  assert.equal(typeof entry.canonicalSport, 'string', `category=${category} canonicalSport string`)
  assert.ok(POSTER_CLASS_SET.has(entry.posterClass), `category=${category} posterClass=${entry.posterClass} is in contract enum`)
  assert.ok(POSTER_MODES.includes(entry.defaultPosterMode), `category=${category} defaultPosterMode=${entry.defaultPosterMode} is in contract modes`)
  assert.equal(typeof entry.topLevelLabel, 'string', `category=${category} topLevelLabel string`)
  assert.equal(typeof entry.allowTitleRefinement, 'boolean', `category=${category} allowTitleRefinement boolean`)
  assert.equal(typeof entry.notes, 'string', `category=${category} notes string`)

  for (const [key, value] of Object.entries(expected)) {
    assert.equal(entry[key], value, `category=${category} ${key} expected ${value} got ${entry[key]}`)
  }
}

// 1. Every contract category maps to a valid entry.
for (const category of REQUIRED_CATEGORIES) {
  const entry = mapSportsCultCategory(category)
  assertEntry(category, entry)
}

// 2. SportsCult truths beat title parsing — these specific categories must
//    produce the expected poster class/mode.
const FIXED_TRUTHS = [
  ['Formula1', { appSportHint: 'motorsport', posterClass: 'motorsport_event', defaultPosterMode: 'solo' }],
  ['MotoGP', { appSportHint: 'motorsport', posterClass: 'motorsport_event' }],
  ['NASCAR', { appSportHint: 'motorsport', posterClass: 'motorsport_event' }],
  ['UFC', { appSportHint: 'mma', posterClass: 'combat_event', defaultPosterMode: 'solo' }],
  ['Boxing', { appSportHint: 'boxing', posterClass: 'combat_event' }],
  ['Bellator', { posterClass: 'combat_event' }],
  ['MMA', { posterClass: 'combat_event' }],
  ['Golf', { appSportHint: 'golf', posterClass: 'golf_event', defaultPosterMode: 'solo' }],
  ['Cycling', { appSportHint: 'cycling', posterClass: 'cycling_event' }],
  ['TourDeFrance', { posterClass: 'cycling_event' }],
  ['Darts', { appSportHint: 'darts', posterClass: 'darts_event' }],
  ['Tennis', { appSportHint: 'tennis', posterClass: 'racket_event' }],
  ['TableTennis', { posterClass: 'racket_event' }],
  ['Snooker/Pool', { appSportHint: 'snooker', posterClass: 'racket_event' }],
  ['Athletics', { posterClass: 'athletics_event' }],
  ['Olympic games', { posterClass: 'olympic_event' }],
  ['OlympicGamesParis24', { posterClass: 'olympic_event' }],
  ['WinterOlympicGames', { posterClass: 'winter_sport_event' }],
  ['WinterSport', { posterClass: 'winter_sport_event' }],
  ['Swimming/Aquatics', { posterClass: 'aquatics_event' }],
  ['Gymnastics', { posterClass: 'gymnastics_event' }],
  ['RhythmicGymnastics', { posterClass: 'gymnastics_event' }],
  ['EPL', { appSportHint: 'football', posterClass: 'team_vs_team', defaultPosterMode: 'matchup' }],
  ['MLS', { appSportHint: 'football', posterClass: 'team_vs_team' }],
  ['International Soccer', { appSportHint: 'football', posterClass: 'team_vs_team', allowTitleRefinement: true }],
  ['EuroLeague Basketbal', { appSportHint: 'basketball', posterClass: 'team_vs_team' }],
  ['NBA', { appSportHint: 'basketball', posterClass: 'team_vs_team' }],
  ['NFL', { appSportHint: 'american-football', posterClass: 'team_vs_team' }],
  ['MLB', { appSportHint: 'baseball', posterClass: 'team_vs_team' }],
  ['NHL', { appSportHint: 'hockey', posterClass: 'team_vs_team' }],
  ['Wrestling/Grapling', { posterClass: 'wrestling_event', allowTitleRefinement: true }],
  ['Fight Sports', { allowTitleRefinement: true, posterClass: 'combat_event' }],
  ['Uncategorised', { posterClass: 'generic_event', defaultPosterMode: 'solo', allowTitleRefinement: true }]
]

for (const [category, expected] of FIXED_TRUTHS) {
  const entry = mapSportsCultCategory(category)
  assertEntry(category, entry, expected)
}

// 3. Aliases — these phrasings must resolve to the same locked entries.
const ALIAS_CHECKS = [
  ['Premier League Darts', 'Darts'],
  ['Premier League', 'EPL'],
  ['Formula 1', 'Formula1'],
  ['F1', 'Formula1'],
  ['UEFA Nations League', 'International Soccer'],
  ['Indian Premier League', 'Cricket'],
  ['IPL', 'Cricket']
]

for (const [alias, target] of ALIAS_CHECKS) {
  const aliasEntry = mapSportsCultCategory(alias)
  const targetEntry = mapSportsCultCategory(target)
  assert.ok(aliasEntry, `alias=${alias} resolves`)
  assert.equal(aliasEntry?.sourceCategory, targetEntry?.sourceCategory, `alias=${alias} -> ${target}`)
}

// 4. Bulk inference — categoryNames array picks the first matching entry.
const inferred = inferSportsCultPosterContextFromCategoryNames(['Spam', 'Premier League Darts', 'Cricket'])
assert.ok(inferred, 'inference returns entry from list')
assert.equal(inferred.posterClass, 'darts_event', 'inference picks darts ahead of cricket when listed first')

// 5. listSportsCultCategories surfaces every required category.
const exposed = new Set(listSportsCultCategories())
for (const category of REQUIRED_CATEGORIES) {
  assert.ok(exposed.has(category), `listSportsCultCategories includes ${category}`)
}

// 6. Empty/unknown input returns null.
assert.equal(mapSportsCultCategory(''), null, 'empty category returns null')
assert.equal(mapSportsCultCategory(null), null, 'null category returns null')
assert.equal(mapSportsCultCategory('NotARealCategory12345'), null, 'unknown category returns null')

console.log(`SportsCult category map smoke passed. categories=${REQUIRED_CATEGORIES.length} aliases=${ALIAS_CHECKS.length} truths=${FIXED_TRUTHS.length}`)
