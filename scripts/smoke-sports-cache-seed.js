const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-cache-seed-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'pvtkrrx-sports-cache-seed-secret'

const { seedSportsImageCache, SUPPORTED_SPORT_TARGETS } = require('../src/utils/sportsCacheSeeder')

function todayIso() {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function buildFetchStub() {
  const today = todayIso()
  const queryKey = (endpoint, params = {}) => `${endpoint}?${new URLSearchParams(params).toString()}`
  const jsonResponses = new Map([
    [
      queryKey('search_all_leagues.php', { s: 'Soccer' }),
      {
        countries: [
          {
            idLeague: '4328',
            strLeague: 'English Premier League',
            strSport: 'Soccer',
            strLogo: 'https://images.example.com/league/epl-logo.png',
            strBadge: 'https://images.example.com/league/epl-badge.png',
            strPoster: 'https://images.example.com/league/epl-poster.jpg',
            strBanner: 'https://images.example.com/league/epl-banner.jpg',
            strFanart1: 'https://images.example.com/league/epl-fanart-1.jpg'
          }
        ]
      }
    ],
    [
      'eventsnextleague.php?id=4328',
      {
        events: [
          {
            idEvent: 'evt-1',
            strEvent: 'Arsenal vs Chelsea',
            dateEvent: today,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/evt-1-poster.jpg',
            strThumb: 'https://images.example.com/events/evt-1-thumb.jpg',
            strBanner: 'https://images.example.com/events/evt-1-banner.jpg',
            strFanart: 'https://images.example.com/events/evt-1-fanart.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventsday.php', { d: today, s: 'Soccer' }),
      {
        events: [
          {
            idEvent: 'evt-1',
            strEvent: 'Arsenal vs Chelsea',
            dateEvent: today,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/evt-1-poster.jpg',
            strThumb: 'https://images.example.com/events/evt-1-thumb.jpg',
            strBanner: 'https://images.example.com/events/evt-1-banner.jpg',
            strFanart: 'https://images.example.com/events/evt-1-fanart.jpg'
          }
        ]
      }
    ],
    [
      queryKey('eventstv.php', { d: today, s: 'Soccer' }),
      {
        tvevents: [
          {
            idEvent: 'evt-2',
            strEvent: 'Liverpool vs Manchester United',
            dateEvent: today,
            strLeague: 'English Premier League',
            strPoster: 'https://images.example.com/events/evt-2-poster.jpg',
            strThumb: 'https://images.example.com/events/evt-2-thumb.jpg'
          }
        ]
      }
    ],
    [
      queryKey('search_all_teams.php', { l: 'English Premier League' }),
      {
        teams: [
          {
            idTeam: '133604',
            strTeam: 'Arsenal',
            strBadge: 'https://images.example.com/teams/arsenal-badge.png',
            strTeamLogo: 'https://images.example.com/teams/arsenal-logo.png'
          },
          {
            idTeam: '133610',
            strTeam: 'Chelsea',
            strBadge: 'https://images.example.com/teams/chelsea-badge.png',
            strTeamLogo: 'https://images.example.com/teams/chelsea-logo.png'
          }
        ]
      }
    ]
  ])

  let apiCalls = 0
  let imageCalls = 0

  const fetchStub = async (url) => {
    const parsed = new URL(String(url))
    if (parsed.hostname === 'www.thesportsdb.com') {
      apiCalls += 1
      const key = `${path.posix.basename(parsed.pathname)}?${parsed.searchParams.toString()}`
      const payload = jsonResponses.get(key) || {}
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
    getApiCalls: () => apiCalls,
    getImageCalls: () => imageCalls
  }
}

async function main() {
  const originalFetch = global.fetch
  const { fetchStub, getApiCalls, getImageCalls } = buildFetchStub()
  const silentLogger = {
    log() {},
    warn() {}
  }

  global.fetch = fetchStub
  try {
    const footballTarget = SUPPORTED_SPORT_TARGETS.find((target) => target.key === 'football')
    assert.ok(footballTarget, 'expected football preseed target to exist')

    const first = await seedSportsImageCache({
      apiKey: '123',
      logger: silentLogger,
      targets: [footballTarget],
      scheduleDays: 1,
      imageConcurrency: 1
    })

    assert.equal(first.sports.length, 1, 'expected one seeded sport')
    assert.equal(first.sports[0].label, 'Soccer')
    assert.equal(first.sports[0].upcomingEvents, 2, 'expected deduped event count from league + schedule feeds')
    assert.equal(first.sports[0].teamsCollected, 2, 'expected team badges to be collected')
    assert.equal(first.images.failed, 0, 'expected no image download failures on first pass')
    assert.equal(first.images.skipped, 0, 'expected cold seed to download every image once')
    assert.equal(first.images.downloaded, first.images.total, 'expected every queued image to be downloaded on first pass')
    assert.ok(getApiCalls() > 0, 'expected API calls during first pre-seed')
    assert.equal(getImageCalls(), first.images.total, 'expected exactly one upstream fetch per unique image on first pass')

    const cacheDir = path.join(runtimeDir, 'sports-image-cache')
    assert.ok(fs.existsSync(cacheDir), 'expected sports image cache directory to exist')
    assert.ok(fs.readdirSync(cacheDir).length > 0, 'expected cached image files to be written to disk')

    const second = await seedSportsImageCache({
      apiKey: '123',
      logger: silentLogger,
      targets: [footballTarget],
      scheduleDays: 1,
      imageConcurrency: 1
    })

    assert.equal(second.images.total, first.images.total, 'expected the same unique image set on rerun')
    assert.equal(second.images.downloaded, 0, 'expected rerun to skip already cached images')
    assert.equal(second.images.skipped, second.images.total, 'expected rerun to hit the disk cache for every image')
    assert.equal(second.images.failed, 0, 'expected no failures on rerun')
    assert.equal(getImageCalls(), first.images.total, 'expected rerun to avoid any extra upstream image downloads')

    console.log('Smoke sports cache pre-seed passed')
  } finally {
    global.fetch = originalFetch
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
