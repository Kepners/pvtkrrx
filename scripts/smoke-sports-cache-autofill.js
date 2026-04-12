const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-cache-autofill-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'pvtkrrx-sports-cache-autofill-secret'

const {
  getSportsCacheAutofillStatePath,
  loadSportsCacheAutofillState,
  runSportsCacheAutofill
} = require('../src/utils/sportsCacheAutofill')
const { SUPPORTED_SPORT_TARGETS } = require('../src/utils/sportsCacheSeeder')

function todayIso() {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function isoOffset(days) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

function buildFetchStub() {
  const today = todayIso()
  const yesterday = isoOffset(-1)
  const queryKey = (endpoint, params = {}) => `${endpoint}?${new URLSearchParams(params).toString()}`
  const jsonResponses = new Map([
    [
      queryKey('search_all_leagues.php', { s: 'Soccer' }),
      {
        countries: [
          {
            idLeague: '4617',
            strLeague: 'Albanian Superliga',
            strSport: 'Soccer',
            strLogo: 'https://images.example.com/league/albania-logo.png'
          }
        ]
      }
    ],
    [
      'lookupleague.php?id=4328',
      {
        leagues: [
          {
            idLeague: '4328',
            strLeague: 'English Premier League',
            strLeagueAlternate: 'Premier League, EPL, England',
            strSport: 'Soccer',
            strLogo: 'https://images.example.com/league/epl-logo.png',
            strBadge: 'https://images.example.com/league/epl-badge.png',
            strPoster: 'https://images.example.com/league/epl-poster.jpg'
          }
        ]
      }
    ],
    [
      'eventsnextleague.php?id=4328',
      {
        events: [
          {
            idEvent: 'football-evt-1',
            strEvent: 'Arsenal vs Chelsea',
            dateEvent: today,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/football-evt-1-poster.jpg',
            strThumb: 'https://images.example.com/events/football-evt-1-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventsday.php', { d: yesterday, s: 'Soccer' }),
      {
        events: [
          {
            idEvent: 'football-evt-0',
            strEvent: 'Tottenham Hotspur vs Newcastle United',
            dateEvent: yesterday,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/football-evt-0-poster.jpg',
            strThumb: 'https://images.example.com/events/football-evt-0-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventsday.php', { d: today, s: 'Soccer' }),
      {
        events: [
          {
            idEvent: 'football-evt-2',
            strEvent: 'Liverpool vs Manchester United',
            dateEvent: today,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/football-evt-2-poster.jpg',
            strThumb: 'https://images.example.com/events/football-evt-2-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventstv.php', { d: yesterday, s: 'Soccer' }),
      { tvevents: [] }
    ],
    [
      queryKey('eventstv.php', { d: today, s: 'Soccer' }),
      { tvevents: [] }
    ],
    [
      queryKey('search_all_teams.php', { l: 'English Premier League' }),
      {
        teams: [
          {
            idTeam: '133604',
            strTeam: 'Arsenal',
            strBadge: 'https://images.example.com/teams/arsenal-badge.png'
          },
          {
            idTeam: '133610',
            strTeam: 'Chelsea',
            strBadge: 'https://images.example.com/teams/chelsea-badge.png'
          }
        ]
      }
    ],
    [
      queryKey('search_all_leagues.php', { s: 'MMA' }),
      {
        countries: [
          {
            idLeague: '5999',
            strLeague: 'Cage Fury Fighting Championships',
            strSport: 'MMA',
            strLogo: 'https://images.example.com/league/cffc-logo.png'
          }
        ]
      }
    ],
    [
      'lookupleague.php?id=4443',
      {
        leagues: [
          {
            idLeague: '4443',
            strLeague: 'UFC',
            strLeagueAlternate: 'Ultimate Fighting Championship',
            strSport: 'MMA',
            strLogo: 'https://images.example.com/league/ufc-logo.png',
            strPoster: 'https://images.example.com/league/ufc-poster.jpg'
          }
        ]
      }
    ],
    [
      'eventsnextleague.php?id=4443',
      {
        events: [
          {
            idEvent: 'mma-evt-1',
            strEvent: 'UFC Fight Night 300',
            dateEvent: today,
            strLeague: 'UFC',
            strPoster: 'https://images.example.com/events/mma-evt-1-poster.jpg',
            strThumb: 'https://images.example.com/events/mma-evt-1-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventsday.php', { d: today, s: 'MMA' }),
      {
        events: [
          {
            idEvent: 'mma-evt-1',
            strEvent: 'UFC Fight Night 300',
            dateEvent: today,
            strLeague: 'UFC',
            strPoster: 'https://images.example.com/events/mma-evt-1-poster.jpg',
            strThumb: 'https://images.example.com/events/mma-evt-1-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventstv.php', { d: today, s: 'MMA' }),
      { tvevents: [] }
    ],
    [
      queryKey('search_all_teams.php', { l: 'UFC' }),
      { teams: [] }
    ]
  ])

  let imageCalls = 0

  const fetchStub = async (url) => {
    const parsed = new URL(String(url))
    if (parsed.hostname === 'www.thesportsdb.com') {
      const key = `${path.posix.basename(parsed.pathname)}?${parsed.searchParams.toString()}`
      const payload = jsonResponses.get(key)
      if (payload === undefined) {
        throw new Error(`Unexpected SportsDB request: ${key}`)
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    }

    if (parsed.hostname === 'images.example.com') {
      imageCalls += 1
      return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-type': 'image/png'
        }
      })
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  return {
    fetchStub,
    getImageCalls: () => imageCalls
  }
}

async function main() {
  const footballTarget = SUPPORTED_SPORT_TARGETS.find((target) => target.key === 'football')
  const mmaTarget = SUPPORTED_SPORT_TARGETS.find((target) => target.key === 'mma')
  assert.ok(footballTarget, 'expected football target')
  assert.ok(mmaTarget, 'expected mma target')

  const silentLogger = {
    log() {},
    warn() {}
  }
  const { fetchStub, getImageCalls } = buildFetchStub()
  const originalFetch = global.fetch
  const statePath = getSportsCacheAutofillStatePath(runtimeDir)
  const options = {
    enabled: true,
    platform: 'linux',
    runtimeDir,
    statePath,
    apiKey: '123',
    targets: [footballTarget, mmaTarget],
    targetsPerRun: 1,
    eventLeagueLimit: 1,
    teamLimitPerSport: 2,
    scheduleDays: 1,
    imageConcurrency: 1,
    fetchImpl: fetchStub,
    logger: silentLogger
  }

  global.fetch = fetchStub
  try {
    const first = await runSportsCacheAutofill({
      ...options,
      scheduleLookbackDays: 1,
      reason: 'smoke-first'
    })
    assert.equal(first.targets.length, 1)
    assert.equal(first.targets[0].key, 'football', 'expected first pass to start with football')
    assert.equal(first.summary.sports[0].mappedLeagues, 1, 'expected football autofill to recover the mapped league via direct lookup')
    assert.equal(first.summary.sports[0].upcomingEvents, 3, 'expected autofill to include yesterday replays alongside today\'s football schedule')
    let state = loadSportsCacheAutofillState(statePath)
    assert.equal(state.nextTargetIndex, 1, 'expected first pass to advance cursor to next sport')
    assert.deepEqual(state.lastTargets, ['football'])
    const imageCallsAfterFirst = getImageCalls()
    assert.ok(imageCallsAfterFirst > 0, 'expected first pass to download images')

    const second = await runSportsCacheAutofill({
      ...options,
      scheduleLookbackDays: 1,
      reason: 'smoke-second'
    })
    assert.equal(second.targets.length, 1)
    assert.equal(second.targets[0].key, 'mma', 'expected second pass to rotate to mma')
    assert.equal(second.summary.sports[0].mappedLeagues, 1, 'expected MMA autofill to recover the mapped league via direct lookup')
    state = loadSportsCacheAutofillState(statePath)
    assert.equal(state.nextTargetIndex, 0, 'expected second pass to wrap the cursor')
    assert.deepEqual(state.lastTargets, ['mma'])
    const imageCallsAfterSecond = getImageCalls()
    assert.ok(imageCallsAfterSecond > imageCallsAfterFirst, 'expected second pass to download a new image set')

    const third = await runSportsCacheAutofill({
      ...options,
      scheduleLookbackDays: 1,
      reason: 'smoke-third'
    })
    assert.equal(third.targets.length, 1)
    assert.equal(third.targets[0].key, 'football', 'expected third pass to wrap back to football')
    assert.equal(third.summary.images.downloaded, 0, 'expected wrapped pass to reuse cached football images')
    assert.ok(third.summary.images.skipped > 0, 'expected wrapped pass to hit disk cache')
    assert.equal(getImageCalls(), imageCallsAfterSecond, 'expected wrapped pass to avoid extra upstream image downloads')
  } finally {
    global.fetch = originalFetch
  }

  console.log('Smoke sports cache autofill passed')
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
}).finally(() => {
  fs.rmSync(runtimeDir, { recursive: true, force: true })
})
