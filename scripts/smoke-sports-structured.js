const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-smoke-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir

const { mapLeague } = require('../src/utils/leagueMap')
const { parseSportsTitle } = require('../src/utils/sportsTitleParser')
const { SportsDbClient } = require('../src/clients/sportsdb')

function loadCatalogWithStubs(stubs) {
  const catalogPath = path.resolve(__dirname, '../src/handlers/catalog.js')
  delete require.cache[catalogPath]

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === catalogPath && Object.prototype.hasOwnProperty.call(stubs, request)) {
      return stubs[request]
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    return require(catalogPath)
  } finally {
    Module._load = originalLoad
  }
}

function testParserAndLeagueMap() {
  const parsed = parseSportsTitle('EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER')
  assert.deepEqual(parsed, {
    league: 'EPL',
    date: '2026-03-15',
    homeTeam: 'Manchester United',
    awayTeam: 'Chelsea',
    quality: '1080p',
    raw: 'EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER'
  })
  assert.equal(parseSportsTitle('Broken.Title.Without.Separator.1080p'), null)
  assert.equal(mapLeague(' epl '), 'English Premier League')
  assert.equal(mapLeague('unknown'), null)
}

async function testStructuredFallbackToFuzzyLookup() {
  const client = new SportsDbClient('smoke-key', { cacheHours: 1 })
  const poster = 'https://example.com/poster.jpg'
  const background = 'https://example.com/background.jpg'

  client.findEventByStructuredData = async () => null
  client._fetchEvents = async () => [{
    idEvent: 'smoke-event-1',
    strEvent: 'North London Blue vs West London Red',
    dateEvent: '2026-03-18',
    strSport: 'Soccer',
    strLeague: 'English Premier League',
    strHomeTeam: 'North London Blue',
    strAwayTeam: 'West London Red',
    strThumb: poster
  }]
  client._fetchEventsByDate = async () => []
  client._fetchTvEventsByDate = async () => []
  client._resolveFallbackImage = async (_event, prefer) => (prefer === 'background' ? background : poster)

  const artwork = await client.getEventArtwork({
    title: 'EPL.2026.03.18.North.London.Blue.vs.West.London.Red.1080p.HDTV.x264-SMOKE',
    publishDate: '2026-03-18T12:00:00Z',
    league: 'EPL',
    date: '2026-03-18',
    homeTeam: 'North London Blue',
    awayTeam: 'West London Red'
  })

  assert.ok(artwork, 'expected fuzzy fallback artwork after structured miss')
  assert.equal(artwork.source, 'thesportsdb')
  assert.equal(artwork.poster, poster)
  assert.equal(artwork.backgroundImage, background)
}

async function testOrderAgnosticSportsGrouping() {
  class FakeProwlarrClient {
    async search() {
      return [
        {
          title: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
          indexer: 'GeneralA',
          size: 1_000_000_000,
          seeders: 20,
          pubDate: '2026-03-15T09:00:00Z'
        },
        {
          title: 'EPL.2026.03.15.Chelsea.vs.Arsenal.720p.HDTV.x264-B',
          indexer: 'GeneralB',
          size: 900_000_000,
          seeders: 15,
          pubDate: '2026-03-15T10:00:00Z'
        }
      ]
    }
  }

  class FakeSportsDbClient {
    async getEventArtwork() {
      return null
    }
  }

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient },
    '../clients/sportsdb': { SportsDbClient: FakeSportsDbClient }
  })

  const result = await handleCatalog(
    {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'smoke-api-key',
      sportsDbApiKey: 'smoke-sports-key',
      maxResults: '10'
    },
    'movie',
    'pvtkrrx-sports',
    'search=Arsenal',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  assert.equal(result.metas.length, 1, 'expected reversed team order to dedupe into one sports meta')
}

async function main() {
  try {
    testParserAndLeagueMap()
    await testStructuredFallbackToFuzzyLookup()
    await testOrderAgnosticSportsGrouping()
    console.log('Smoke sports structured flow passed')
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
