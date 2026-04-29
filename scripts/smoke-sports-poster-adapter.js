#!/usr/bin/env node

const assert = require('node:assert/strict')

const { buildPaidTemplateMatchup, cleanDisplayText } = require('../src/utils/sportsPosterAdapter')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')

const BAD_TEXT_RE = /\b(?:SPOR|BASK|undefined|null|unknown|n\/a)\b/i

const CASES = [
  {
    slug: 'team-matchup',
    expectedClass: 'team_vs_team',
    expectedFormat: 'matchup',
    input: {
      sportHint: 'football',
      competition: 'English Premier League',
      rawTitle: 'Premier League Arsenal vs Chelsea 2026 04 29 1080p',
      eventTitle: 'Arsenal vs Chelsea',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      date: '2026-04-29'
    }
  },
  {
    slug: 'f1-solo-session',
    expectedClass: 'motorsport_event',
    expectedFormat: 'solo',
    input: {
      sportHint: 'motorsport',
      competition: 'Formula 1',
      rawTitle: 'Formula 1 British Grand Prix Qualifying 1080p WEB-DL',
      eventTitle: 'British Grand Prix',
      eventDetail: 'Qualifying',
      date: '2026-07-04'
    }
  },
  {
    slug: 'combat-head-to-head',
    expectedClass: 'combat_event',
    expectedFormat: 'single',
    input: {
      sportHint: 'mma',
      competition: 'UFC',
      rawTitle: 'UFC 312 Makhachev vs Oliveira Main Event 1080p',
      eventTitle: 'UFC 312',
      eventDetail: 'Main Event',
      homeTeam: 'Makhachev',
      awayTeam: 'Oliveira'
    }
  },
  {
    slug: 'combat-card-solo',
    expectedClass: 'combat_event',
    expectedFormat: 'solo',
    input: {
      sportHint: 'mma',
      competition: 'UFC',
      rawTitle: 'UFC 312 Main Card 1080p',
      eventTitle: 'UFC 312',
      eventDetail: 'Main Card'
    }
  },
  {
    slug: 'darts-head-to-head',
    expectedClass: 'darts_event',
    expectedFormat: 'single',
    input: {
      sportHint: 'darts',
      competition: 'Premier League Darts',
      rawTitle: 'Premier League Darts Luke Littler vs Michael van Gerwen 1080p',
      eventTitle: 'Premier League Darts',
      homeTeam: 'Luke Littler',
      awayTeam: 'Michael van Gerwen'
    }
  },
  {
    slug: 'golf-round-solo',
    expectedClass: 'golf_event',
    expectedFormat: 'solo',
    input: {
      sportHint: 'golf',
      competition: 'PGA Championship',
      rawTitle: 'PGA Championship Round 2 1080p',
      eventTitle: 'PGA Championship',
      eventDetail: 'Round 2'
    }
  }
]

function eventFor(input = {}) {
  const normalized = normalizeSportsEventMetadata({
    ...input,
    source: 'prowlarr'
  })
  return {
    ...input,
    ...normalized,
    sport: normalized.sport || input.sportHint,
    league: normalized.competition || input.competition,
    title: normalized.eventTitle || input.eventTitle,
    eventTitle: normalized.eventTitle || input.eventTitle,
    eventDetail: normalized.eventDetail || input.eventDetail,
    rawTitle: input.rawTitle
  }
}

function assertNoBadText(slug, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  assert.doesNotMatch(text, BAD_TEXT_RE, `${slug} should not contain placeholder/release text`)
  assert.doesNotMatch(text, /\b(?:2160p|1080p|720p|WEB-DL|x264|x265|H264|H265)\b/i, `${slug} should not contain release tags`)
}

for (const testCase of CASES) {
  const event = eventFor(testCase.input)
  const eventClass = classifySportsEvent(event)
  const data = buildPaidTemplateMatchup(event, eventClass)

  assert.equal(eventClass, testCase.expectedClass, `${testCase.slug} class`)
  assert.equal(data.event_format, testCase.expectedFormat, `${testCase.slug} event format`)
  assert.ok(data.event_short && data.event_short.length <= 38, `${testCase.slug} event_short bounded`)
  assert.ok(data.session && data.session.length <= 42, `${testCase.slug} session bounded`)
  assert.ok(data.home?.name && data.away?.name, `${testCase.slug} sides populated for template compatibility`)
  assert.notEqual(data.home.short, data.away.short, `${testCase.slug} short codes must be distinct`)
  assert.notEqual(data.home.initials, data.away.initials, `${testCase.slug} initials must be distinct`)
  assertNoBadText(testCase.slug, data)
}

const cleaned = cleanDisplayText('Formula.1.British.GP.1080p.WEB-DL.x264-Group', 'Event')
assert.equal(cleaned, 'Formula 1 British GP', 'cleanDisplayText removes release noise')

console.log(`Sports poster adapter smoke passed. cases=${CASES.length}`)
