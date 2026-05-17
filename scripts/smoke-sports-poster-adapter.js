#!/usr/bin/env node

const assert = require('node:assert/strict')

const { buildPaidTemplateMatchup, cleanDisplayText } = require('../src/utils/sportsPosterAdapter')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { containsSportsReleaseNoise } = require('../src/utils/sportsReleaseNoise')
const { parseSportsTorrentProfile } = require('../src/utils/sportsTorrentProfile')

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
    slug: 'f1-fp-session-casing',
    expectedClass: 'motorsport_event',
    expectedFormat: 'solo',
    expectedEventShort: 'Monaco GP',
    expectedSession: 'FP2',
    input: {
      sportHint: 'motorsport',
      competition: 'Formula 1',
      rawTitle: 'F1 Monaco Grand Prix FP2 1080p',
      eventTitle: 'Monaco Grand Prix',
      eventShort: 'Monaco GP',
      eventDetail: 'FP2',
      date: '2026-05-22'
    }
  },
  {
    // Combat is contract-locked as one event string; fighter names may be in
    // the title, but they are not the poster layout driver.
    slug: 'combat-boxing-solo',
    expectedClass: 'combat_event',
    expectedFormat: 'solo',
    allowEmptySession: true,
    input: {
      sportHint: 'boxing',
      competition: 'Boxing',
      rawTitle: 'Tyson Fury vs Oleksandr Usyk Heavyweight Title 1080p',
      eventTitle: 'Tyson Fury vs Oleksandr Usyk',
      homeTeam: 'Tyson Fury',
      awayTeam: 'Oleksandr Usyk'
    }
  },
  {
    // UFC/MMA card events (UFC NNN, UFC Fight Night, PFL, Bellator) MUST
    // render solo F1-style — event mark dominant + headline as subtitle —
    // even when the title parses a fighter pair. Per
    // feedback_ufc_card_layout.md.
    slug: 'combat-ufc-card-solo',
    expectedClass: 'combat_event',
    expectedFormat: 'solo',
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
    slug: 'combat-mvp-mma-stale-pair-solo',
    expectedClass: 'combat_event',
    expectedFormat: 'solo',
    allowEmptySession: true,
    input: {
      sportHint: 'mma',
      competition: 'MMA',
      rawTitle: 'MVP MMA 1 Rousey vs Carano 1080p H264-FBB',
      eventTitle: 'MVP MMA Rousey vs Carano',
      homeTeam: 'MVP MMA Rousey',
      awayTeam: 'Carano'
    }
  },
  {
    slug: 'combat-card-solo-no-pair',
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
    slug: 'darts-tournament-solo',
    expectedClass: 'darts_event',
    expectedFormat: 'solo',
    expectedEventShort: 'Premier League Darts',
    expectedSession: 'Night 1',
    input: {
      sportHint: 'darts',
      competition: 'Premier League Darts',
      rawTitle: 'Premier League Darts Night 1 1080p',
      eventTitle: 'Premier League Darts',
      eventDetail: 'Night 1'
    }
  },
  {
    slug: 'tennis-player-match',
    expectedClass: 'tennis_or_snooker_match',
    expectedFormat: 'single',
    expectedEventShort: 'Wimbledon',
    expectedSession: 'Final',
    input: {
      sportHint: 'tennis',
      competition: 'Wimbledon',
      rawTitle: 'Wimbledon 2026 Final Alcaraz vs Sinner 1080p',
      eventTitle: 'Alcaraz vs Sinner',
      eventDetail: 'Final',
      homeTeam: 'Alcaraz',
      awayTeam: 'Sinner'
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
  assert.equal(containsSportsReleaseNoise(text), false, `${slug} should not contain shared release-noise tags`)
}

for (const testCase of CASES) {
  const event = eventFor(testCase.input)
  const eventClass = classifySportsEvent(event)
  const data = buildPaidTemplateMatchup(event, eventClass)

  assert.equal(eventClass, testCase.expectedClass, `${testCase.slug} class`)
  assert.equal(data.event_format, testCase.expectedFormat, `${testCase.slug} event format`)
  if (testCase.expectedEventShort) assert.equal(data.event_short, testCase.expectedEventShort, `${testCase.slug} event_short`)
  if (testCase.expectedSession) assert.equal(data.session, testCase.expectedSession, `${testCase.slug} session`)
  assert.ok(data.event_short && data.event_short.length <= 38, `${testCase.slug} event_short bounded`)
  if (testCase.allowEmptySession) {
    assert.ok(typeof data.session === 'string' && data.session.length <= 42, `${testCase.slug} session bounded`)
  } else {
    assert.ok(data.session && data.session.length <= 42, `${testCase.slug} session bounded`)
  }
  assert.ok(data.home?.name && data.away?.name, `${testCase.slug} sides populated for template compatibility`)
  assert.notEqual(data.home.short, data.away.short, `${testCase.slug} short codes must be distinct`)
  assert.notEqual(data.home.initials, data.away.initials, `${testCase.slug} initials must be distinct`)
  assertNoBadText(testCase.slug, data)
}

const cleaned = cleanDisplayText('Formula.1.British.GP.1080p.WEB-DL.x264-Group', 'Event')
assert.equal(cleaned, 'Formula 1 British GP', 'cleanDisplayText removes release noise')

const cleanedRepack = cleanDisplayText('MotoGP.Spain.REPACK.Complete.Weekend.1080p.WEB-DL.x264-MWR', 'Event')
assert.equal(cleanedRepack, 'MotoGP Spain Weekend', 'cleanDisplayText removes shared release/package noise')

const cleanedMashed = cleanDisplayText('Inside the NBA 2026 28 04 720pEN60fps', 'Event')
assert.doesNotMatch(cleanedMashed, /720p|60fps/i, 'cleanDisplayText strips mashed quality+language+fps tokens')

const cleanedFps = cleanDisplayText('Premier League Match 1080pES60fps', 'Event')
assert.doesNotMatch(cleanedFps, /1080p|60fps/i, 'cleanDisplayText strips quality+language combinations')

const PROFILE_CASES = [
  {
    slug: 'profile-mvp-mma-no-legacy-sides',
    title: 'MVP MMA 1 Rousey vs Carano 1080p H264-FBB',
    sportHint: 'mma',
    categoryNames: ['MMA'],
    expected: {
      sport: 'mma',
      eventClass: 'combat_event',
      event: /rousey\s+vs\s+carano/i,
      forbiddenEvent: /\b(?:h264|fbb)\b/i
    }
  },
  {
    slug: 'profile-bsb-motorsport-not-one',
    title: 'BSB Donington Park GP Race One 1080p H264-FBB',
    sportHint: 'motorsport',
    categoryNames: ['Motorsport'],
    expected: {
      sport: 'motorsport',
      league: 'British Superbikes',
      eventClass: 'motorsport_event',
      event: /donington park gp/i,
      session: 'Race One',
      forbiddenEvent: /\b(?:h264|fbb|one championship)\b/i
    }
  }
]

for (const testCase of PROFILE_CASES) {
  const profile = parseSportsTorrentProfile({
    title: testCase.title,
    sportHint: testCase.sportHint,
    categoryNames: testCase.categoryNames,
    pubDate: '2026-05-17T00:00:00Z'
  }, {
    sportHint: testCase.sportHint,
    categoryNames: testCase.categoryNames
  })
  assert.equal(profile.sport, testCase.expected.sport, `${testCase.slug} sport`)
  if (testCase.expected.league) assert.equal(profile.league, testCase.expected.league, `${testCase.slug} league`)
  assert.equal(profile.event_class, testCase.expected.eventClass, `${testCase.slug} event_class`)
  assert.match(profile.event || '', testCase.expected.event, `${testCase.slug} event`)
  if (testCase.expected.session) assert.equal(profile.session, testCase.expected.session, `${testCase.slug} session`)
  assert.equal(profile.home_team, null, `${testCase.slug} home_team omitted`)
  assert.equal(profile.away_team, null, `${testCase.slug} away_team omitted`)
  assert.doesNotMatch(profile.event || '', testCase.expected.forbiddenEvent, `${testCase.slug} event noise stripped`)
}

console.log(`Sports poster adapter smoke passed. cases=${CASES.length} profileCases=${PROFILE_CASES.length}`)
