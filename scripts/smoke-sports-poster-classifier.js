#!/usr/bin/env node

const assert = require('node:assert/strict')

const {
  POSTER_CLASSES,
  classifySportsPosterEvent,
  hasActualPair
} = require('../src/utils/sportsPosterClassifier')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const {
  layoutFamilyForSportsPosterRender,
  renderSportsPosterTemplateSvg
} = require('../src/utils/sportsPosterTemplates')
const { ProwlarrClient } = require('../src/clients/prowlarr')
const { parseSportsTorrentProfile } = require('../src/utils/sportsTorrentProfile')

const REQUIRED_CLASSES = [
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
]

const CASES = [
  {
    slug: 'uefa-nations-league-matchup',
    expected: 'team_vs_team',
    input: {
      rawTitle: 'UEFA Nations League England vs France 2026 06 10 1080p',
      sportHint: 'football',
      competition: 'UEFA Nations League',
      date: '2026-06-10'
    }
  },
  {
    slug: 'efl-championship-current-matchup',
    expected: 'team_vs_team',
    input: {
      rawTitle: 'English League Championship Coventry City vs Bristol City 2026 05 24 1080p',
      sportHint: 'football',
      competition: 'English League Championship',
      date: '2026-05-24'
    }
  },
  {
    slug: 'f1-british-grand-prix-session',
    expected: 'motorsport_event',
    input: {
      rawTitle: 'Formula 1 British Grand Prix Practice 1 1080p WEB-DL',
      sportHint: 'motorsport',
      competition: 'Formula 1',
      eventTitle: 'British Grand Prix',
      eventDetail: 'Practice 1',
      date: '2026-07-03'
    }
  },
  {
    slug: 'motogp-brazil-gear-up',
    expected: 'motorsport_event',
    input: {
      rawTitle: 'MotoGP Brazil Gear Up',
      sportHint: 'motorsport',
      competition: 'MotoGP',
      eventTitle: 'Brazil Gear Up'
    }
  },
  {
    slug: 'wrc-spain-islas-canarias-highlights',
    expected: 'motorsport_event',
    input: {
      rawTitle: 'WRC Spain Islas Canarias Saturday Highlights',
      sportHint: 'motorsport',
      competition: 'WRC',
      eventTitle: 'Spain Islas Canarias Saturday Highlights'
    }
  },
  {
    slug: 'ufc-numbered-card',
    expected: 'combat_event',
    input: {
      rawTitle: 'UFC 312 Main Card 1080p',
      sportHint: 'mma',
      competition: 'UFC',
      eventTitle: 'UFC 312',
      eventDetail: 'Main Card'
    }
  },
  {
    slug: 'pga-championship-round',
    expected: 'golf_event',
    input: {
      rawTitle: 'PGA Championship Round 2 1080p Sky Sports',
      sportHint: 'golf',
      competition: 'PGA Championship',
      eventTitle: 'PGA Championship',
      eventDetail: 'Round 2'
    }
  },
  {
    slug: 'wwe-smackdown',
    expected: 'wrestling_event',
    input: {
      rawTitle: 'WWE SmackDown 2026 04 29 1080p',
      sportHint: 'wrestling',
      competition: 'WWE',
      eventTitle: 'SmackDown'
    }
  },
  {
    slug: 'tour-de-france-stage',
    expected: 'cycling_event',
    input: {
      rawTitle: 'Tour de France Stage 1 1080p Eurosport',
      sportHint: 'cycling',
      competition: 'Tour de France',
      eventTitle: 'Tour de France',
      eventDetail: 'Stage 1'
    }
  },
  {
    slug: 'diamond-league-athletics',
    expected: 'athletics_event',
    input: {
      rawTitle: 'Diamond League Doha 2026 1080p',
      sportHint: 'athletics',
      competition: 'Diamond League',
      eventTitle: 'Doha'
    }
  },
  {
    slug: 'fifa-world-cup-qualifier-matchup',
    expected: 'team_vs_team',
    input: {
      rawTitle: 'FIFA World Cup Qualifier Brazil vs Argentina 1080p',
      sportHint: '',
      competition: 'FIFA World Cup Qualifier'
    }
  },
  {
    slug: 'world-athletics-continental-tour-classic',
    expected: 'athletics_event',
    input: {
      rawTitle: 'World Athletics Continental Tour Gold 2026 04 24 Kip Keino Classic',
      competition: 'World Athletics Continental Tour Gold',
      eventTitle: 'Kip Keino Classic'
    }
  },
  {
    slug: 'premier-league-darts',
    expected: 'darts_event',
    input: {
      rawTitle: 'Premier League Darts Luke Littler vs Michael van Gerwen 1080p',
      sportHint: 'darts',
      competition: 'Premier League Darts',
      homeTeam: 'Luke Littler',
      awayTeam: 'Michael van Gerwen'
    }
  },
  {
    slug: 'wimbledon-tennis-match',
    expected: 'tennis_or_snooker_match',
    input: {
      rawTitle: 'Wimbledon Sinner vs Alcaraz Final 1080p BBC',
      sportHint: 'tennis',
      competition: 'Wimbledon',
      eventTitle: 'Wimbledon',
      eventDetail: 'Final',
      homeTeam: 'Sinner',
      awayTeam: 'Alcaraz'
    }
  },
  {
    slug: 'wimbledon-day-one',
    expected: 'racket_event',
    input: {
      rawTitle: 'Wimbledon Day 1 Centre Court 1080p BBC',
      sportHint: 'tennis',
      competition: 'Wimbledon',
      eventTitle: 'Wimbledon',
      eventDetail: 'Day 1'
    }
  },
  {
    slug: 'generic-sports-release',
    expected: 'generic_event',
    input: {
      rawTitle: 'Sports Highlights Pack 2026 1080p',
      sportHint: '',
      competition: '',
      eventTitle: 'Sports Highlights Pack'
    }
  },
  {
    slug: 'olympic-games-default',
    expected: 'olympic_event',
    input: {
      rawTitle: 'Olympic Games Paris 2024 Opening Ceremony 1080p',
      sportsCultCategory: 'OlympicGamesParis24',
      eventTitle: 'Opening Ceremony'
    }
  },
  {
    slug: 'olympic-games-athletics-refinement',
    expected: 'athletics_event',
    input: {
      rawTitle: 'Olympic Games Track and Field 100m Final 1080p',
      sportsCultCategory: 'Olympic games',
      eventTitle: 'Track and Field 100m Final'
    }
  },
  {
    slug: 'winter-sport',
    expected: 'winter_sport_event',
    input: {
      rawTitle: 'Alpine Skiing World Cup Soelden 1080p',
      sportsCultCategory: 'WinterSport',
      eventTitle: 'Alpine Skiing World Cup'
    }
  },
  {
    slug: 'aquatics-swimming',
    expected: 'aquatics_event',
    input: {
      rawTitle: 'World Aquatics Championships 100m Freestyle Final',
      sportsCultCategory: 'Swimming/Aquatics',
      eventTitle: 'World Aquatics Championships'
    }
  },
  {
    slug: 'gymnastics-rhythmic',
    expected: 'gymnastics_event',
    input: {
      rawTitle: 'Rhythmic Gymnastics World Cup 2026 1080p',
      sportsCultCategory: 'RhythmicGymnastics',
      eventTitle: 'Rhythmic Gymnastics World Cup'
    }
  },
  {
    slug: 'table-tennis-tournament',
    expected: 'racket_event',
    input: {
      rawTitle: 'World Table Tennis Singapore Smash 2026 1080p',
      sportsCultCategory: 'TableTennis',
      eventTitle: 'Singapore Smash'
    }
  },
  {
    slug: 'wwe-categorised-as-grappling',
    expected: 'wrestling_event',
    input: {
      rawTitle: 'WWE Monday Night Raw 2026 04 29 1080p',
      sportsCultCategory: 'Wrestling/Grapling',
      eventTitle: 'Monday Night Raw'
    }
  },
  {
    slug: 'pure-grappling-not-wrestling-show',
    expected: 'combat_event',
    input: {
      rawTitle: 'ADCC World Championship 2026 Submission Only 1080p',
      sportsCultCategory: 'Wrestling/Grapling',
      eventTitle: 'ADCC World Championship'
    }
  },
  {
    slug: 'fight-sports-pfl-refinement',
    expected: 'combat_event',
    input: {
      rawTitle: 'PFL 2026 Lightweight Tournament Main Card 1080p',
      sportsCultCategory: 'Fight Sports',
      eventTitle: 'PFL 2026'
    }
  },
  {
    slug: 'european-soccer-international-pair',
    expected: 'team_vs_team',
    input: {
      rawTitle: 'UEFA Nations League England vs France 2026 06 10 1080p',
      sportsCultCategory: 'International Soccer',
      homeTeam: 'England',
      awayTeam: 'France'
    }
  },
  {
    slug: 'uncategorised-stays-generic',
    expected: 'generic_event',
    input: {
      rawTitle: 'Some Sports Special 2026 1080p',
      sportsCultCategory: 'Uncategorised',
      eventTitle: 'Sports Special'
    }
  },
  {
    slug: 'cricket-the-hundred-tournament',
    expected: 'tournament_event',
    input: {
      rawTitle: 'The Hundred 2026 Highlights 1080p',
      sportsCultCategory: 'Cricket',
      eventTitle: 'The Hundred Highlights'
    }
  }
]

function eventFor(input = {}) {
  const normalized = normalizeSportsEventMetadata({
    ...input,
    source: input.source || 'prowlarr'
  })
  return {
    ...input,
    ...normalized,
    sport: normalized.sport || input.sportHint,
    sportHint: input.sportHint,
    league: normalized.competition || input.competition,
    title: normalized.eventTitle || input.eventTitle,
    eventTitle: normalized.eventTitle || input.eventTitle,
    eventDetail: normalized.eventDetail || input.eventDetail,
    rawTitle: input.rawTitle
  }
}

assert.deepEqual(POSTER_CLASSES, REQUIRED_CLASSES, 'sports poster classifier exposes the contract classes')

const seen = new Set()
for (const testCase of CASES) {
  const event = eventFor(testCase.input)
  const posterClass = classifySportsPosterEvent(event)
  const compatibilityClass = classifySportsEvent(event)
  assert.equal(posterClass, testCase.expected, `${testCase.slug} poster class`)
  assert.equal(compatibilityClass, testCase.expected, `${testCase.slug} compatibility class`)
  if (testCase.expected === 'team_vs_team' || testCase.expected === 'tennis_or_snooker_match' || testCase.expected === 'darts_event') {
    assert.equal(hasActualPair(event), true, `${testCase.slug} should expose an actual pair`)
  }
  seen.add(posterClass)
}

for (const className of REQUIRED_CLASSES) {
  assert.ok(seen.has(className), `classifier smoke covers ${className}`)
}

for (const testCase of [
  {
    slug: 'efl-championship-is-not-home-team',
    rawTitle: 'EFL Championship 2026 vs Millwall'
  },
  {
    slug: 'afl-is-not-home-team',
    rawTitle: 'AFL 2026 vs Bulldogs'
  },
  {
    slug: 'champions-league-is-not-home-team',
    rawTitle: 'Champions League vs La Laguna Tenerife'
  },
  {
    slug: 'ncaa-women-softball-is-not-home-team',
    rawTitle: 'NCAA Women Softball vs Oregon Ducks'
  },
  {
    slug: 'uecl-is-not-away-team',
    rawTitle: 'Shakhtar Donetsk vs UECL'
  },
  {
    slug: 'sports-league-token-is-not-away-team',
    rawTitle: 'Indiana Hoosiers vs NCAA Women Softball'
  },
  {
    slug: 'ohl-is-not-away-team',
    rawTitle: 'Kitchener vs OHL'
  }
]) {
  const event = eventFor({ rawTitle: testCase.rawTitle })
  assert.equal(hasActualPair(event), false, `${testCase.slug} should not expose an actual pair`)
  assert.notEqual(classifySportsPosterEvent(event), 'team_vs_team', `${testCase.slug} should not classify as team_vs_team`)
  assert.notEqual(
    layoutFamilyForSportsPosterRender('ticket-stub', {
      ...event,
      eventClass: 'team_vs_team',
      layoutFamily: 'TEAM_VS_TEAM'
    }),
    'TEAM_VS_TEAM',
    `${testCase.slug} should not render a forced team-vs-team layout`
  )
  const rendered = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event: {
      ...event,
      eventClass: 'team_vs_team',
      layoutFamily: 'TEAM_VS_TEAM'
    }
  })
  assert.notEqual(rendered.layoutFamily, 'TEAM_VS_TEAM', `${testCase.slug} rendered layout family`)
  assert.equal(rendered.svg.includes('data-layout-family="TEAM_VS_TEAM"'), false, `${testCase.slug} SVG marker`)
}

for (const testCase of [
  {
    slug: 'post-match-show-is-not-team-layout',
    rawTitle: '[Champions League] UEFA Champions League Semi Final Leg 1 Post Match Atletico Madrid Vs Arsenal 1080pEN50fps TNTSports',
    sportsCultCategory: 'Champions League'
  },
  {
    slug: 'pre-show-is-not-team-layout',
    rawTitle: '[Champions League] UEFA Champions League Semi Final Leg 1 Pre Show Atletico Madrid Vs Arsenal 1080pEN50fps TNTSports',
    sportsCultCategory: 'Champions League'
  },
  {
    slug: 'recap-is-not-team-layout',
    rawTitle: 'MLB Recapping the Action',
    sportHint: 'baseball',
    sportsCultCategory: 'Baseball'
  }
]) {
  const event = eventFor(testCase)
  assert.notEqual(classifySportsPosterEvent(event), 'team_vs_team', `${testCase.slug} should not classify as team_vs_team`)
  assert.notEqual(
    layoutFamilyForSportsPosterRender('ticket-stub', {
      ...event,
      eventClass: 'team_vs_team',
      layoutFamily: 'TEAM_VS_TEAM'
    }),
    'TEAM_VS_TEAM',
    `${testCase.slug} should not render a forced team-vs-team layout`
  )
}

for (const testCase of [
  {
    slug: 'efl-playoff-stage-prefix-stripped',
    rawTitle: 'EFL Championship 2026 Playoff SF 1st Leg Hull City vs Millwall 08 05',
    sportHint: 'football',
    expectedHome: 'Hull City',
    expectedAway: 'Millwall'
  },
  {
    slug: 'afl-round-prefix-stripped',
    rawTitle: 'AFL 2026 Round 9 Game 3 Port Adelaide V Western Bulldogs',
    sportHint: 'rugby',
    expectedHome: 'Port Adelaide',
    expectedAway: 'Western Bulldogs'
  },
  {
    slug: 'ncaa-softball-qf-and-broadcast-stripped',
    rawTitle: 'NCAA Women Softball QF 2026 Washington Huskies vs Indiana Hoosiers 07 05 BIGN',
    sportHint: 'baseball',
    expectedHome: 'Washington Huskies',
    expectedAway: 'Indiana Hoosiers'
  },
  {
    slug: 'ufl-away-league-prefix-stripped',
    rawTitle: 'St Louis Battlehawks vs UFL Columbus Aviators',
    sportHint: 'american-football',
    expectedHome: 'St Louis Battlehawks',
    expectedAway: 'Columbus Aviators'
  },
  {
    slug: 'kings-cup-away-prefix-stripped',
    rawTitle: 'Al Kholood vs Kings Cup Al Hilal',
    sportHint: 'football',
    expectedHome: 'Al Kholood',
    expectedAway: 'Al Hilal'
  },
  {
    slug: 'elc-home-prefix-stripped',
    rawTitle: 'ELC Hull vs Millwall',
    sportHint: 'football',
    expectedHome: 'Hull',
    expectedAway: 'Millwall'
  },
  {
    slug: 'cpl-home-prefix-stripped',
    rawTitle: 'CPL FC Supra vs Woodbridge Strikers',
    sportHint: 'football',
    expectedHome: 'FC Supra',
    expectedAway: 'Woodbridge Strikers'
  },
  {
    slug: 'primera-feb-away-prefix-stripped',
    rawTitle: 'Inveready Gipuzkoa vs Primera FEB Monbus Obradoiro',
    sportHint: 'basketball',
    expectedHome: 'Inveready Gipuzkoa',
    expectedAway: 'Monbus Obradoiro'
  },
  {
    slug: 'flohockey-away-broadcast-stripped',
    rawTitle: 'OHL Finals 2026 Barrie vs Kitchener Game 2 FloHockey',
    sportHint: 'hockey',
    expectedHome: 'Barrie',
    expectedAway: 'Kitchener'
  },
  {
    slug: 'beinsports-away-broadcast-stripped',
    rawTitle: 'UEFA Conference League SF L2 Shakhtar Donetsk v Crystal Palace BeinSports',
    sportHint: 'football',
    expectedHome: 'Shakhtar Donetsk',
    expectedAway: 'Crystal Palace'
  },
  {
    slug: 'copa-sudamericana-competition-prefix-stripped',
    rawTitle: "Copa Sudamericana 2026 O'Higgins vs Sau Paulo",
    sportHint: 'football',
    expectedHome: "O'Higgins",
    expectedAway: 'Sau Paulo'
  },
  {
    slug: 'copa-libertadores-competition-prefix-stripped',
    rawTitle: 'Copa Libertadores 2026 Carabobo FC vs River Plate',
    sportHint: 'football',
    expectedHome: 'Carabobo FC',
    expectedAway: 'River Plate'
  },
  {
    slug: 'ncaa-softball-prefix-stripped-from-team-side',
    rawTitle: 'NCAA Women Softball 2026 Michigan Wolverines vs Nebraska Cornhuskers',
    sportHint: 'baseball',
    expectedHome: 'Michigan Wolverines',
    expectedAway: 'Nebraska Cornhuskers'
  },
  {
    slug: 'pipe-delimited-stage-title-team-pair',
    rawTitle: '[Champions League] UEFA Champions League 2025/2026 | Semifinal | 1st leg | Atletico Madrid vs Arsenal 29 04 2026 | 1080pEN60fps | DAZN',
    sportHint: 'football',
    sportsCultCategory: 'Champions League',
    expectedHome: 'Atletico Madrid',
    expectedAway: 'Arsenal'
  },
  {
    slug: 'final-four-stage-prefix-stripped',
    rawTitle: 'Four 2026 Rytas Vilnius vs La Laguna Tenerife',
    sportHint: 'basketball',
    expectedHome: 'Rytas Vilnius',
    expectedAway: 'La Laguna Tenerife'
  },
  {
    slug: 'away-final-four-stage-prefix-stripped',
    rawTitle: 'AEK Betsson vs Four 2026 Unicaja',
    sportHint: 'basketball',
    expectedHome: 'AEK Betsson',
    expectedAway: 'Unicaja'
  },
  {
    slug: 'away-turkish-league-prefix-stripped',
    rawTitle: 'Buyukcekmece vs Turkish League Anadolu Efes',
    sportHint: 'basketball',
    expectedHome: 'Buyukcekmece',
    expectedAway: 'Anadolu Efes'
  },
  {
    slug: 'home-round-code-prefix-stripped',
    rawTitle: 'L2 Bayern Munich vs PSG',
    sportHint: 'football',
    expectedHome: 'Bayern Munich',
    expectedAway: 'PSG'
  },
  {
    slug: 'away-wnba-preseason-prefix-stripped',
    rawTitle: 'Indiana Fever vs WNBA PreS 2026 Dallas Wings',
    sportHint: 'basketball',
    expectedHome: 'Indiana Fever',
    expectedAway: 'Dallas Wings'
  },
  {
    slug: 'away-trailing-sport-and-quality-stripped',
    rawTitle: 'Carolina Hurricanes vs Philadelphia Flyers Hockey 4k',
    sportHint: 'hockey',
    expectedHome: 'Carolina Hurricanes',
    expectedAway: 'Philadelphia Flyers'
  }
]) {
  const event = eventFor({ rawTitle: testCase.rawTitle, sportHint: testCase.sportHint })
  assert.equal(event.homeTeam, testCase.expectedHome, `${testCase.slug} home team`)
  assert.equal(event.awayTeam, testCase.expectedAway, `${testCase.slug} away team`)
  assert.equal(hasActualPair(event), true, `${testCase.slug} should expose an actual pair`)
  assert.equal(classifySportsPosterEvent(event), 'team_vs_team', `${testCase.slug} class`)
  assert.equal(layoutFamilyForSportsPosterRender('ticket-stub', event), 'TEAM_VS_TEAM', `${testCase.slug} layout family`)
}

for (const testCase of [
  {
    slug: 'tournament-class-afl-with-credible-pair-upgrades-to-team-layout',
    rawTitle: 'AFL 2026 Round 9 Game 3 Port Adelaide V Western Bulldogs',
    sportHint: 'rugby'
  },
  {
    slug: 'tournament-class-cricket-with-credible-pair-upgrades-to-team-layout',
    rawTitle: 'Bangladesh vs Pakistan',
    sportHint: 'cricket'
  }
]) {
  const event = eventFor({ rawTitle: testCase.rawTitle, sportHint: testCase.sportHint })
  assert.equal(hasActualPair(event), true, `${testCase.slug} should expose an actual pair`)
  assert.equal(
    layoutFamilyForSportsPosterRender('ticket-stub', {
      ...event,
      eventClass: 'tournament_event'
    }),
    'TEAM_VS_TEAM',
    `${testCase.slug} layout family`
  )
}

{
  const proxyEvent = {
    title: 'Port Adelaide vs Western Bulldogs',
    eventTitle: 'Port Adelaide vs Western Bulldogs',
    league: 'Sports',
    homeTeam: 'Port Adelaide',
    awayTeam: 'Western Bulldogs',
    eventClass: 'team_vs_team'
  }
  assert.equal(hasActualPair(proxyEvent), true, 'proxy-limited team event should expose an actual pair')
  assert.equal(
    layoutFamilyForSportsPosterRender('ticket-stub', proxyEvent),
    'TEAM_VS_TEAM',
    'proxy-limited team event should honor explicit team_vs_team when the pair is credible'
  )
}

for (const testCase of [
  {
    slug: 'sportcult-euroleague-bracket-stripped',
    rawTitle: '[EuroLeague Basketbal] Real Madrid vs Barcelona 1080p',
    expectedCompetition: 'EuroLeague Basketball',
    expectedHome: 'Real Madrid',
    expectedAway: 'Barcelona'
  },
  {
    slug: 'sportcult-elc-bracket-stripped',
    rawTitle: '[ELC] West Brom vs Leeds 1080p',
    expectedCompetition: 'EFL Championship',
    expectedHome: 'West Brom',
    expectedAway: 'Leeds'
  },
  {
    slug: 'sportcult-english-league-championship-stripped',
    rawTitle: '[English League Championship] Coventry City vs Bristol City 1080p',
    expectedCompetition: 'EFL Championship',
    expectedHome: 'Coventry City',
    expectedAway: 'Bristol City'
  },
  {
    slug: 'sportcult-ucl-round-noise-stripped',
    rawTitle: '[Champions League] UCL 2025/26 Semi Final 1st Leg Atletico Madrid vs Arsenal 2160p 4K HDR',
    expectedCompetition: 'UEFA Champions League',
    expectedHome: 'Atletico Madrid',
    expectedAway: 'Arsenal'
  }
]) {
  const event = eventFor({ rawTitle: testCase.rawTitle })
  assert.equal(event.competition, testCase.expectedCompetition, `${testCase.slug} competition`)
  assert.equal(event.homeTeam, testCase.expectedHome, `${testCase.slug} home team`)
  assert.equal(event.awayTeam, testCase.expectedAway, `${testCase.slug} away team`)
  assert.equal(classifySportsPosterEvent(event), 'team_vs_team', `${testCase.slug} class`)
}

const categoryLookup = new Map([
  ['7', new Map([
    ['100011', 'EuroLeague Basketbal']
  ])]
])
const mappedProwlarrItem = new ProwlarrClient('http://prowlarr.test', 'test-api-key')._mapResult({
  title: 'EuroLeague Round 30 Highlights 1080p',
  indexerId: 7,
  indexer: 'SportsCult',
  categories: [{ id: 100011 }],
  size: 123,
  seeders: 3,
  publishDate: '2026-04-29T12:00:00.000Z'
}, categoryLookup)
assert.deepEqual(mappedProwlarrItem.categoryNames, ['EuroLeague Basketbal'], 'Prowlarr category lookup should expose categoryNames')
assert.equal(mappedProwlarrItem.indexerCategoryName, 'EuroLeague Basketbal', 'Prowlarr category lookup should expose first mapped category as indexerCategoryName')

for (const testCase of [
  {
    slug: 'categoryNames-only-context',
    expected: 'darts_event',
    input: {
      rawTitle: 'Premier League Darts Night 1 1080p',
      categoryNames: ['Darts'],
      eventTitle: 'Premier League Darts'
    }
  },
  {
    slug: 'indexerCategoryName-only-context',
    expected: 'motorsport_event',
    input: {
      rawTitle: 'Formula1 British Grand Prix Qualifying 1080p',
      indexerCategoryName: 'Formula1',
      eventTitle: 'British Grand Prix'
    }
  },
  {
    slug: 'indexer-name-is-not-category-context',
    expected: 'generic_event',
    input: {
      rawTitle: 'Some Sports Special 2026 1080p',
      indexer: 'Darts',
      eventTitle: 'Sports Special'
    }
  },
  {
    slug: 'bracket-category-context',
    expected: 'darts_event',
    input: {
      rawTitle: '[Darts] Premier League Darts Night 1 1080p',
      eventTitle: 'Premier League Darts'
    }
  }
]) {
  const event = eventFor(testCase.input)
  assert.equal(classifySportsPosterEvent(event), testCase.expected, `${testCase.slug} poster class`)
  assert.equal(classifySportsEvent(event), testCase.expected, `${testCase.slug} compatibility class`)
}

const categoryNamesOnlyProfile = parseSportsTorrentProfile({
  title: 'Premier League Darts Night 1 1080p',
  categoryNames: ['Darts'],
  pubDate: '2026-04-29T12:00:00.000Z'
})
assert.equal(categoryNamesOnlyProfile.event_class, 'darts_event', 'sports torrent profile should classify from categoryNames alone')

const indexerCategoryOnlyProfile = parseSportsTorrentProfile({
  title: 'Formula1 British Grand Prix Qualifying 1080p',
  indexerCategoryName: 'Formula1',
  pubDate: '2026-04-29T12:00:00.000Z'
})
assert.equal(indexerCategoryOnlyProfile.event_class, 'motorsport_event', 'sports torrent profile should classify from indexerCategoryName alone')

const indexerNameOnlyProfile = parseSportsTorrentProfile({
  title: 'Some Sports Special 2026 1080p',
  indexer: 'SportsCult',
  pubDate: '2026-04-29T12:00:00.000Z'
})
assert.equal(indexerNameOnlyProfile.event_class, 'generic_event', 'sports torrent profile must not treat a tracker indexer name as category truth')

const genuineCategoryIndexerProfile = parseSportsTorrentProfile({
  title: 'Formula1 British Grand Prix Qualifying 1080p',
  indexer: 'Formula1',
  pubDate: '2026-04-29T12:00:00.000Z'
})
assert.equal(genuineCategoryIndexerProfile.event_class, 'motorsport_event', 'sports torrent profile may use item.indexer only when it is itself a known SportsCult category')

console.log(`Sports poster classifier smoke passed. classes=${[...seen].join(',')}`)
