#!/usr/bin/env node

const assert = require('node:assert/strict')

const {
  POSTER_CLASSES,
  classifySportsPosterEvent,
  hasActualPair
} = require('../src/utils/sportsPosterClassifier')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')

const REQUIRED_CLASSES = [
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
    expected: 'tournament_event',
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

console.log(`Sports poster classifier smoke passed. classes=${[...seen].join(',')}`)
