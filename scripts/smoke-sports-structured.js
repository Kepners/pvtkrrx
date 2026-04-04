const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-smoke-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'pvtkrrx-sports-smoke-secret'

const { mapLeague } = require('../src/utils/leagueMap')
const manifest = require('../src/config/manifest')
const { findSportsDiscoveryCatalog } = require('../src/config/sportsCatalogs')
const { parseSportsTitle, parseSportsEventTitle } = require('../src/utils/sportsTitleParser')
const { resolveSportHint, scoreSportsEventSignals, isLikelySportsEventTitle } = require('../src/utils/sportsRules')
const { detectSport } = require('../src/utils/sportClassifier')
const { SportsDbClient } = require('../src/clients/sportsdb')
const { encodeCustomId, decodeCustomId } = require('../src/utils/customId')
const { setPublicCacheHeaders } = require('../src/lib/shared')
const { decodeSportsThumbToken } = require('../src/utils/sportsThumb')
const {
  makeSportsImageProxyUrl,
  decodeSportsImageToken,
  resolveSportsImageRequest
} = require('../src/utils/sportsImageCache')

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

async function withSportsDbPrototypePatches(patches, run) {
  const originals = new Map()
  for (const [name, impl] of Object.entries(patches || {})) {
    originals.set(name, SportsDbClient.prototype[name])
    SportsDbClient.prototype[name] = impl
  }

  try {
    return await run()
  } finally {
    for (const [name, original] of originals.entries()) {
      SportsDbClient.prototype[name] = original
    }
  }
}

function assertSportsProxyUrl(url, variant, sourceUrl, message) {
  const value = String(url || '')
  assert.match(
    value,
    new RegExp(`^http://127\\.0\\.0\\.1:7000/image/sports/${variant}/`),
    message || `expected sports image proxy variant ${variant}`
  )
  const token = value.split('/').pop()
  assert.equal(decodeSportsImageToken(token), sourceUrl, 'expected proxied sports image token to resolve back to the original artwork URL')
}

function assertSportsThumbUrl(url, variant = 'poster', message) {
  const value = String(url || '')
  assert.match(
    value,
    new RegExp(`^http://127\\.0\\.0\\.1:7000/thumb/sports/${variant}/`),
    message || `expected sports thumb variant ${variant}`
  )
  const token = value.split('/').pop().replace(/\.svg$/i, '')
  return decodeSportsThumbToken(token)
}

function testCacheHeadersIncludeStaleIfError() {
  const headers = {}
  const res = {
    setHeader(name, value) {
      headers[name] = value
    }
  }

  setPublicCacheHeaders(res, 0, {
    sMaxAge: 300,
    staleWhileRevalidate: 900,
    staleIfError: 7200
  })

  assert.equal(
    headers['Cache-Control'],
    'public, max-age=0, s-maxage=300, stale-while-revalidate=900, stale-if-error=7200'
  )
}

function testSportsDiscoveryCatalogLayout() {
  const sportsCatalogIds = manifest.catalogs
    .filter((catalog) => catalog?.type === 'sports')
    .map((catalog) => catalog?.id)

  assert.deepEqual(
    sportsCatalogIds.slice(0, 4),
    ['pvtkrrx-sports', 'pvtkrrx-sports-football', 'pvtkrrx-sports-motorsport', 'pvtkrrx-sports-mma'],
    'sports families should lead sports discovery catalogs'
  )

  const footballCatalog = findSportsDiscoveryCatalog('pvtkrrx-sports-football')
  assert.ok(footballCatalog, 'expected football discovery catalog definition')
  assert.ok(footballCatalog.detailOptions.includes('Premier League'), 'football discovery should expose league filters')
  assert.ok(footballCatalog.detailOptions.includes('Arsenal'), 'football discovery should expose team filters')
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
  const landscape = 'https://example.com/thumb.jpg'
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
    strLogo: 'https://example.com/logo.png',
    strPoster: poster,
    strThumb: landscape,
    strBanner: background
  }]
  client._fetchEventsByDate = async () => []
  client._fetchTvEventsByDate = async () => []
  client._lookupLeague = async () => null
  client._lookupTeam = async () => null

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
  assert.equal(artwork.landscapeImage, landscape)
  assert.equal(artwork.image, landscape)
  assert.equal(artwork.backgroundImage, background)
  assert.equal(artwork.logo, 'https://example.com/logo.png')
}

async function testStructuredArtworkCacheDoesNotBleedAcrossFixtures() {
  const client = new SportsDbClient('smoke-key', { cacheHours: 1 })
  let structuredCalls = 0

  client.findEventByStructuredData = async (input = {}) => {
    structuredCalls += 1
    if (String(input.homeTeam || '').includes('Bulls')) {
      return {
        idEvent: 'evt-bulls-knicks',
        strEvent: 'Chicago Bulls vs New York Knicks',
        dateEvent: '2026-03-18',
        strSport: 'Basketball',
        strLeague: 'NBA',
        strHomeTeam: 'Chicago Bulls',
        strAwayTeam: 'New York Knicks'
      }
    }
    return {
      idEvent: 'evt-celtics-heat',
      strEvent: 'Boston Celtics vs Miami Heat',
      dateEvent: '2026-03-18',
      strSport: 'Basketball',
      strLeague: 'NBA',
      strHomeTeam: 'Boston Celtics',
      strAwayTeam: 'Miami Heat'
    }
  }
  client._resolveFallbackImage = async (event, prefer) => `https://example.com/${event.idEvent}-${prefer}.jpg`
  client._resolveFallbackLogo = async (event) => `https://example.com/${event.idEvent}-logo.png`
  client._resolveArtworkContext = async (event) => ({
    homeTeam: event?.strHomeTeam || '',
    awayTeam: event?.strAwayTeam || '',
    homeBadge: `https://example.com/${String(event?.strHomeTeam || '').replace(/\s+/g, '-').toLowerCase()}-badge.png`,
    awayBadge: `https://example.com/${String(event?.strAwayTeam || '').replace(/\s+/g, '-').toLowerCase()}-badge.png`,
    leagueLogo: 'https://example.com/nba-logo.png'
  })
  client._fetchEvents = async () => []
  client._fetchEventsByDate = async () => []
  client._fetchTvEventsByDate = async () => []
  client._resolveLeagueArtworkFromTitle = async () => null

  const first = await client.getEventArtwork({
    title: 'NBA.2026.03.18.Chicago.Bulls.vs.New.York.Knicks.1080p',
    publishDate: '2026-03-18T12:00:00Z',
    league: 'NBA',
    date: '2026-03-18',
    homeTeam: 'Chicago Bulls',
    awayTeam: 'New York Knicks',
    sportHint: 'basketball'
  })

  const second = await client.getEventArtwork({
    title: 'NBA.2026.03.18.Boston.Celtics.vs.Miami.Heat.1080p',
    publishDate: '2026-03-18T12:30:00Z',
    league: 'NBA',
    date: '2026-03-18',
    homeTeam: 'Boston Celtics',
    awayTeam: 'Miami Heat',
    sportHint: 'basketball'
  })

  assert.equal(structuredCalls, 2, 'each fixture should resolve its own structured artwork instead of reusing a broad league/date cache entry')
  assert.equal(first.eventId, 'evt-bulls-knicks')
  assert.equal(second.eventId, 'evt-celtics-heat')
  assert.notEqual(first.poster, second.poster, 'different fixtures should not reuse the same poster artwork')
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
      return {
        poster: 'https://example.com/portrait.jpg',
        landscapeImage: 'https://example.com/landscape.jpg',
        backgroundImage: 'https://example.com/background.jpg',
        image: 'https://example.com/landscape.jpg',
        homeBadge: 'https://example.com/arsenal-badge.png',
        awayBadge: 'https://example.com/chelsea-badge.png',
        leagueLogo: 'https://example.com/epl-logo.png',
        eventId: 'sports-event-1',
        eventDate: '2026-03-15',
        league: 'English Premier League',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea'
      }
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
    'sports',
    'pvtkrrx-sports',
    'search=Arsenal',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  assert.equal(result.metas.length, 1, 'expected reversed team order to dedupe into one sports meta')
  assert.ok(result.metas[0].id.length < 256, 'expected sports meta id to stay under common Stremio client limits')
  const posterPayload = assertSportsThumbUrl(result.metas[0].poster, 'poster', 'expected sports catalog to build a matchup poster for vs fixtures')
  assert.equal(posterPayload.m, 'matchup', 'expected matchup posters for team-vs-team fixtures')
  assert.deepEqual([posterPayload.o, posterPayload.w].sort(), ['Arsenal', 'Chelsea'])
  assert.equal(result.metas[0].posterShape, 'poster', 'expected sports catalog to tag portrait artwork as poster-shaped')
  assertSportsProxyUrl(result.metas[0].background, 'background', 'https://example.com/background.jpg')
  const decoded = decodeCustomId(result.metas[0].id)
  assert.equal(decoded.k, 'sports')
  assert.ok(
    decoded.n && decoded.n.length > 0,
    'expected compressed sports id to carry a display title'
  )
}

async function testLeagueFallbackUsesGeneratedMatchupPoster() {
  class FakeProwlarrClient {
    async search() {
      return [{
        title: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
        indexer: 'GeneralA',
        size: 1_000_000_000,
        seeders: 20,
        pubDate: '2026-03-15T09:00:00Z'
      }]
    }
  }

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient }
  })

  const result = await withSportsDbPrototypePatches({
    getEventArtwork: async () => ({
      poster: 'https://example.com/repeated-football-photo.jpg',
      image: 'https://example.com/repeated-football-photo-landscape.jpg',
      backgroundImage: 'https://example.com/epl-background.jpg',
      logo: 'https://example.com/epl-logo.png',
      leagueLogo: 'https://example.com/epl-logo.png',
      eventDate: '2026-03-15',
      league: 'English Premier League',
      source: 'thesportsdb-league'
    })
  }, async () => handleCatalog(
    {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'smoke-api-key',
      sportsDbApiKey: 'smoke-sports-key',
      maxResults: '10'
    },
    'sports',
    'pvtkrrx-sports',
    'search=Arsenal',
    { baseUrl: 'http://127.0.0.1:7000' }
  ))

  const posterPayload = assertSportsThumbUrl(result.metas[0].poster, 'poster', 'league fallback should still produce a matchup event card, not a repeated generic football photo')
  assert.equal(posterPayload.m, 'matchup')
  assert.equal(posterPayload.gl, 'https://example.com/epl-logo.png')
  assert.equal(posterPayload.o, 'Arsenal')
  assert.equal(posterPayload.w, 'Chelsea')
}

async function testCatalogShowsSetupPlaceholderWhenProwlarrHasNoIndexers() {
  class FakeProwlarrClient {
    async search() {
      return []
    }

    async caps() {
      return []
    }
  }

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient }
  })

  const result = await handleCatalog(
    {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'smoke-api-key',
      sportsDbApiKey: 'smoke-sports-key',
      maxResults: '10'
    },
    'movie',
    'pvtkrrx-movies',
    'search=',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  assert.equal(result.metas.length, 1, 'expected a setup placeholder when Prowlarr has no indexers')
  assert.match(result.metas[0].id, /^pvtkrrx:setup-required:movie:/)
  assert.equal(result.metas[0].type, 'movie')
  assert.match(String(result.metas[0].description || ''), /no Prowlarr indexers/i)
}

async function testSportSpecificCatalogDetailFiltering() {
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
          title: 'UFC.Fight.Night.270.Main.Card.1080p.WEB.h264-GROUP',
          indexer: 'GeneralB',
          size: 1_200_000_000,
          seeders: 30,
          pubDate: '2026-03-15T10:00:00Z'
        },
        {
          title: 'UEFA.Champions.League.2026.03.15.Liverpool.vs.Real.Madrid.1080p.HDTV.x264-B',
          indexer: 'GeneralC',
          size: 1_100_000_000,
          seeders: 18,
          pubDate: '2026-03-15T11:00:00Z'
        }
      ]
    }
  }

  class FakeSportsDbClient {
    async getEventArtwork() {
      return {
        poster: 'https://example.com/football-portrait.jpg',
        landscapeImage: 'https://example.com/football-landscape.jpg',
        backgroundImage: 'https://example.com/football-background.jpg',
        image: 'https://example.com/football-landscape.jpg',
        eventId: 'football-event-1',
        eventDate: '2026-03-15',
        league: 'English Premier League'
      }
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
    'sports',
    'pvtkrrx-sports-football',
    'genre=Arsenal',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  assert.equal(result.metas.length, 1, 'football discovery detail filter should narrow results to the requested team')
  assert.match(result.metas[0].name, /Arsenal vs Chelsea/i)
  assert.match(String(result.metas[0].description || ''), /English Premier League/i)
  const decoded = decodeCustomId(result.metas[0].id)
  assert.equal(decoded.r, 'football', 'football discovery catalog should stamp the football sport hint into the custom id')
}

async function testLibraryCustomIdsStayCompact() {
  class FakeQBitClient {
    async torrents(scope) {
      assert.equal(scope, 'completed')
      return [
        {
          name: 'UFC.Fight.Night.267.Strickland.vs.Hernandez.Prelims.1080p.WEB.h264-VERUM',
          hash: '6cd321a1334efb29eb8f4fc077adca70ce24cbb1',
          size: 8_110_701_419,
          completion_on: 1,
          content_path: '/media/UFC.Fight.Night.267.Strickland.vs.Hernandez.Prelims.1080p.WEB.h264-VERUM.mp4'
        }
      ]
    }

    async files() {
      return [{
        name: 'UFC.Fight.Night.267.Strickland.vs.Hernandez.Prelims.1080p.WEB.h264-VERUM.mp4',
        size: 8_110_701_419,
        progress: 1,
        index: 0
      }]
    }
  }

  class FakeCinemetaClient {
    async searchMovies() {
      return [{
        id: 'tt7512512',
        imdb_id: 'tt7512512',
        type: 'movie',
        name: 'UFC Fight Night: Poirier vs. Pettis',
        poster: 'https://images.metahub.space/poster/small/tt7512512/img',
        background: 'https://images.metahub.space/background/medium/tt7512512/img'
      }]
    }
  }

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/qbittorrent': { QBitClient: FakeQBitClient },
    '../clients/cinemeta': { CinemetaClient: FakeCinemetaClient }
  })

  const result = await handleCatalog(
    {
      qbitUrl: 'http://127.0.0.1:8080',
      maxResults: '10'
    },
    'movie',
    'pvtkrrx-library',
    '',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  assert.equal(result.metas.length, 1, 'expected one library meta')
  assert.ok(result.metas[0].id.length < 256, 'expected library custom id to stay under common Stremio client limits')
  const decoded = decodeCustomId(result.metas[0].id)
  assert.equal(decoded.h, '6cd321a1334efb29eb8f4fc077adca70ce24cbb1')
  assert.equal(decoded.m, 'tt7512512')
  assert.equal(decoded.f, path.normalize('/media/UFC.Fight.Night.267.Strickland.vs.Hernandez.Prelims.1080p.WEB.h264-VERUM.mp4'))
}

async function testSportsMetaIncludesGenres() {
  const { handleMeta } = require('../src/handlers/meta')
  const id = encodeCustomId({
    y: 'sports',
    k: 'sports',
    n: 'Arsenal vs Chelsea',
    t: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
    s: 1_000_000_000,
    d: 20,
    p: '2026-03-15T09:00:00Z',
    r: 'football',
    e: '2026-03-15',
    g: 'English Premier League',
    a: 'https://example.com/portrait.jpg',
    b: 'https://example.com/background.jpg'
  }, {
    compress: true
  })

  const result = await handleMeta({}, 'sports', id, {
    baseUrl: 'http://127.0.0.1:7000'
  })

  assert.equal(result.meta.type, 'sports')
  assert.deepEqual(result.meta.genres, ['Football', 'English Premier League'])
  assert.equal(result.meta.releaseInfo, '2026-03-15')
}

function testEventTitleParser() {
  // F1 with date
  const f1 = parseSportsEventTitle('Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB.h265-VERUM')
  assert.ok(f1, 'expected F1 title with date to parse')
  assert.equal(f1.league, 'Formula1')
  assert.equal(f1.date, '2026-03-28')
  assert.equal(f1.eventName, 'Japanese Grand Prix Qualifying')
  assert.equal(f1.quality, '1080p')

  // F1 without date
  const f1b = parseSportsEventTitle('Formula1.2026.Japanese.Grand.Prix.Practice.Two.HLG.2160p.WEB.h265-VERUM')
  assert.ok(f1b, 'expected F1 title without full date to parse')
  assert.equal(f1b.league, 'Formula1')
  assert.equal(f1b.eventName, 'Japanese Grand Prix Practice Two')

  // UFC event-style (no vs)
  const ufc = parseSportsEventTitle('UFC.Fight.Night.270.Main.Card.1080p.WEB.h264-GROUP')
  assert.ok(ufc, 'expected UFC event title to parse')
  assert.equal(ufc.league, 'UFC')
  assert.equal(ufc.eventName, 'Fight Night 270 Main Card')

  // MotoGP
  const moto = parseSportsEventTitle('MotoGP.2026.Round.04.Spanish.GP.Sprint.720p.HDTV')
  assert.ok(moto, 'expected MotoGP title to parse')
  assert.equal(moto.league, 'MotoGP')
  assert.equal(moto.eventName, 'Round 04 Spanish GP Sprint')

  // Supercars
  const sc = parseSportsEventTitle('Supercars.2026.Round.03.Melbourne.Race.1.1080p.HDTV.x264-GROUP')
  assert.ok(sc, 'expected Supercars title to parse')
  assert.equal(sc.league, 'Supercars')
  assert.equal(sc.eventName, 'Round 03 Melbourne Race 1')

  // Non-event title should not parse
  assert.equal(parseSportsEventTitle('EPL.2026.03.15.Arsenal.vs.Chelsea.1080p'), null, 'vs-style title should not match event parser')
  assert.equal(parseSportsEventTitle('Random.Movie.Title.2026.1080p'), null, 'non-sports title should not match event parser')
}

function testSportDisambiguation() {
  // Supercars and V8 should detect as motorsport
  assert.equal(detectSport('Supercars 2026 Round 03 Melbourne'), 'motorsport', 'Supercars should detect as motorsport')
  assert.equal(detectSport('V8 Supercars Bathurst 1000'), 'motorsport', 'V8 Supercars should detect as motorsport')
  assert.equal(detectSport('NASCAR Cup Series 2026'), 'motorsport', 'NASCAR should detect as motorsport')
  assert.equal(detectSport('Formula1 2026 Japanese Grand Prix'), 'motorsport', 'Formula1 should detect as motorsport')
  assert.equal(detectSport('PDC Darts World Championship 2026'), 'darts', 'PDC Darts should detect as darts')
  assert.equal(detectSport('Premier League Darts Night 10'), 'darts', 'Premier League Darts should detect as darts')

  // League mapping
  assert.equal(mapLeague('formula1'), 'Formula 1')
  assert.equal(mapLeague('supercars'), 'Supercars Championship')
  assert.equal(mapLeague('motogp'), 'MotoGP')
  assert.equal(mapLeague('nascar'), 'NASCAR')

  // Sport hint resolution
  assert.equal(resolveSportHint({ explicitHint: 'supercars' }), 'motorsport')
  assert.equal(resolveSportHint({ explicitHint: 'v8sc' }), 'motorsport')
  assert.equal(resolveSportHint({ explicitHint: 'pdc' }), 'darts')

  // Event signals should score well for non-vs event titles
  const f1Score = scoreSportsEventSignals('Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB', 'motorsport')
  assert.ok(f1Score >= 5, `expected F1 event score >= 5, got ${f1Score}`)

  const ufcScore = scoreSportsEventSignals('UFC.Fight.Night.270.Main.Card.1080p.WEB', 'mma')
  assert.ok(ufcScore >= 5, `expected UFC event score >= 5, got ${ufcScore}`)

  // isLikelySportsEventTitle should accept non-vs events with enough signals
  assert.ok(isLikelySportsEventTitle('Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB', 'motorsport'), 'F1 event should be likely sports')
  assert.ok(isLikelySportsEventTitle('UFC.Fight.Night.270.Main.Card.1080p.WEB', 'mma'), 'UFC event should be likely sports')
}

async function testEventTitleCatalogGrouping() {
  class FakeProwlarrClient {
    async search() {
      return [
        {
          title: 'Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB.h265-VERUM',
          indexer: 'SportsTracker',
          size: 2_000_000_000,
          seeders: 30,
          pubDate: '2026-03-28T12:00:00Z'
        },
        {
          title: 'Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.720p.HDTV.x264-SPORTS',
          indexer: 'SportsTracker',
          size: 1_200_000_000,
          seeders: 15,
          pubDate: '2026-03-28T14:00:00Z'
        },
        {
          title: 'Formula1.2026.03.28.Japanese.Grand.Prix.Race.1080p.WEB.h265-VERUM',
          indexer: 'SportsTracker',
          size: 3_000_000_000,
          seeders: 50,
          pubDate: '2026-03-28T18:00:00Z'
        }
      ]
    }
  }

  class FakeSportsDbClient {
    async getEventArtwork() {
      return {
        poster: 'https://example.com/f1-poster.jpg',
        landscapeImage: 'https://example.com/f1-landscape.jpg',
        backgroundImage: 'https://example.com/f1-background.jpg',
        image: 'https://example.com/f1-landscape.jpg',
        eventId: 'f1-event-1',
        eventDate: '2026-03-28',
        league: 'Formula 1'
      }
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
    'sports',
    'pvtkrrx-sports',
    'genre=F1',
    { baseUrl: 'http://127.0.0.1:7000' }
  )

  // Qualifying variants should group together, Race should be separate
  assert.equal(result.metas.length, 2, `expected 2 grouped F1 metas (Qualifying + Race), got ${result.metas.length}`)
  const names = result.metas.map(m => m.name)
  assert.ok(names.some(n => /qualifying/i.test(n)), 'expected a Qualifying entry')
  assert.ok(names.some(n => /race/i.test(n)), 'expected a Race entry')
  assertSportsProxyUrl(result.metas[0].poster, 'poster', 'https://example.com/f1-poster.jpg', 'expected sports catalog to prefer portrait poster art for F1 events')
  assert.equal(result.metas[0].posterShape, 'poster', 'expected F1 catalog cards to declare poster-shaped artwork')
}

async function testF1FallbackUsesWeekendPosterCard() {
  class FakeProwlarrClient {
    async search() {
      return [{
        title: 'Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB.h265-VERUM',
        indexer: 'SportsTracker',
        size: 2_000_000_000,
        seeders: 30,
        pubDate: '2026-03-28T12:00:00Z'
      }]
    }
  }

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient }
  })

  const result = await withSportsDbPrototypePatches({
    getEventArtwork: async () => ({
      image: 'https://example.com/f1-landscape.jpg',
      backgroundImage: 'https://example.com/f1-background.jpg',
      logo: 'https://example.com/f1-logo.png',
      leagueLogo: 'https://example.com/f1-logo.png',
      eventId: '',
      eventDate: '2026-03-28',
      league: 'Formula 1',
      eventName: 'Japanese Grand Prix Qualifying',
      source: 'thesportsdb-league'
    })
  }, async () => handleCatalog(
    {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'smoke-api-key',
      sportsDbApiKey: 'smoke-sports-key',
      maxResults: '10'
    },
    'sports',
    'pvtkrrx-sports',
    'genre=F1',
    { baseUrl: 'http://127.0.0.1:7000' }
  ))

  const posterPayload = assertSportsThumbUrl(result.metas[0].poster, 'poster', 'F1 fallback should use a generated race-weekend poster card')
  assert.equal(posterPayload.m, 'formula1')
  assert.equal(posterPayload.e, 'Japanese Grand Prix Qualifying')
  assert.equal(posterPayload.gl, 'https://example.com/f1-logo.png')
}

async function testSportsMetaRichDescription() {
  const { handleMeta } = require('../src/handlers/meta')
  const id = encodeCustomId({
    y: 'sports',
    k: 'sports',
    n: 'Formula 1 Japanese Grand Prix Qualifying',
    t: 'Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying.1080p.WEB',
    s: 2_000_000_000,
    d: 30,
    p: '2026-03-28T12:00:00Z',
    c: 2,
    r: 'motorsport',
    e: '2026-03-28',
    g: 'Formula 1',
    u: 'Formula1',
    a: 'https://example.com/f1-poster.jpg',
    b: 'https://example.com/f1-bg.jpg'
  }, { compress: true })

  const result = await handleMeta({}, 'sports', id, { baseUrl: 'http://127.0.0.1:7000' })
  assert.ok(result.meta, 'expected meta to exist')
  assert.equal(result.meta.type, 'sports')
  assert.ok(result.meta.description, 'expected non-empty description')
  assert.ok(result.meta.description.includes('Formula 1'), 'expected description to mention league')
  assert.ok(result.meta.genres.includes('Motorsport'), 'expected Motorsport genre')
  assert.equal(result.meta.releaseInfo, '2026-03-28')
  assertSportsProxyUrl(result.meta.poster, 'poster', 'https://example.com/f1-poster.jpg')
  assertSportsProxyUrl(result.meta.background, 'background', 'https://example.com/f1-bg.jpg')
  assert.ok(result.meta.logo, 'expected sports meta to include a logo for the Stremio waiting screen')
  assert.ok(result.meta.runtime, 'expected runtime to carry sport type label')
}

async function testArtworkFallbackBehavior() {
  const { handleMeta } = require('../src/handlers/meta')
  // Sports entry with NO carried artwork — should fall back to SVG thumb
  const id = encodeCustomId({
    y: 'sports',
    k: 'sports',
    n: 'UFC Fight Night 270 Main Card',
    t: 'UFC.Fight.Night.270.Main.Card.1080p.WEB',
    s: 1_500_000_000,
    d: 25,
    p: '2026-03-26T00:00:00Z',
    r: 'mma',
    e: '2026-03-26',
    g: 'UFC'
  }, { compress: true })

  const result = await handleMeta({}, 'sports', id, { baseUrl: 'http://127.0.0.1:7000' })
  assert.ok(result.meta, 'expected meta to exist for UFC entry')
  assert.equal(result.meta.type, 'sports')
  assert.ok(result.meta.poster, 'expected a poster fallback')
  assert.ok(result.meta.background, 'expected a background fallback')
  assert.match(String(result.meta.poster || ''), /\/thumb\/sports\/poster\//, 'expected sports poster fallback to use the poster artwork route')
  assert.match(String(result.meta.background || ''), /\/thumb\/sports\/background\//, 'expected sports background fallback to use the background artwork route')
  assert.equal(result.meta.posterShape, 'poster', 'expected fallback sports meta to declare poster-shaped artwork')
  assert.ok(result.meta.description, 'expected non-empty description')
  assert.deepEqual(result.meta.genres, ['MMA', 'UFC'], 'expected MMA + UFC genres')
}

async function testCompactSportsIdMetaArtwork() {
  const { handleMeta } = require('../src/handlers/meta')

  class FakeProwlarrClient {
    async search() {
      return [{
        title: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
        indexer: 'GeneralA',
        size: 1_000_000_000,
        seeders: 20,
        pubDate: '2026-03-15T09:00:00Z'
      }]
    }
  }

  const event = {
    idEvent: 'cache-bridge-event-1',
    strEvent: 'Arsenal vs Chelsea',
    dateEvent: '2026-03-15',
    strSport: 'Soccer',
    strLeague: 'English Premier League'
  }
  const poster = 'https://example.com/cache-bridge-poster.jpg'
  const landscape = 'https://example.com/cache-bridge-landscape.jpg'
  const background = 'https://example.com/cache-bridge-background.jpg'
  const logo = 'https://example.com/cache-bridge-logo.png'

  const catalogResult = await withSportsDbPrototypePatches({
    findEventByStructuredData: async () => event,
    _resolveFallbackImage: async (_event, prefer) => {
      if (prefer === 'poster') return poster
      if (prefer === 'landscape') return landscape
      if (prefer === 'background') return background
      return ''
    },
    _resolveFallbackLogo: async () => logo,
    _fetchEvents: async () => [],
    _fetchEventsByDate: async () => [],
    _fetchTvEventsByDate: async () => [],
    _resolveLeagueArtworkFromTitle: async () => null
  }, async () => {
    const { handleCatalog } = loadCatalogWithStubs({
      '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient }
    })

    return handleCatalog(
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'smoke-api-key',
        sportsDbApiKey: 'smoke-sports-key',
        maxResults: '10'
      },
      'sports',
      'pvtkrrx-sports',
      'search=Arsenal',
      { baseUrl: 'http://127.0.0.1:7000' }
    )
  })

  assert.equal(catalogResult.metas.length, 1, 'expected one compact sports meta from catalog')
  const compactId = catalogResult.metas[0].id
  const decoded = decodeCustomId(compactId)
  assert.ok(!decoded.a, 'compact sports ids should not carry poster URLs')
  assert.ok(!decoded.b, 'compact sports ids should not carry background URLs')
  assert.ok(!decoded.z, 'compact sports ids should not carry logo URLs')
  assert.equal(decoded.v, event.idEvent, 'compact sports ids should carry eventId for meta lookups')

  const metaResult = await withSportsDbPrototypePatches({
    _lookupEvent: async () => {
      throw new Error('meta should reuse cached catalog artwork before doing a direct event lookup')
    },
    findEventByStructuredData: async () => {
      throw new Error('meta should not need structured title parsing when cached artwork aliases exist')
    },
    _fetchEvents: async () => {
      throw new Error('meta should not need title-based SportsDB searches when cached artwork aliases exist')
    },
    _fetchEventsByDate: async () => [],
    _fetchTvEventsByDate: async () => [],
    _resolveLeagueArtworkFromTitle: async () => null
  }, async () => handleMeta({ sportsDbApiKey: 'smoke-sports-key' }, 'movie', compactId, { baseUrl: 'http://127.0.0.1:7000' }))

  assert.ok(metaResult.meta, 'compact sports meta should still resolve a meta object')
  const posterPayload = assertSportsThumbUrl(metaResult.meta.poster, 'poster', 'meta should rebuild a matchup poster from cached sports context')
  assert.equal(posterPayload.m, 'matchup')
  assert.equal(posterPayload.o, 'Arsenal')
  assert.equal(posterPayload.w, 'Chelsea')
  assertSportsProxyUrl(metaResult.meta.background, 'background', background, 'meta should reuse the cached background from the catalog lookup')
  assertSportsProxyUrl(metaResult.meta.logo, 'logo', logo, 'meta should reuse the cached logo from the catalog lookup')
}

async function testCompactSportsMetaUsesDirectEventLookup() {
  const { handleMeta } = require('../src/handlers/meta')
  const eventId = 'direct-event-lookup-1'
  const event = {
    idEvent: eventId,
    strEvent: 'Liverpool vs Real Madrid',
    dateEvent: '2026-03-15',
    strSport: 'Soccer',
    strLeague: 'UEFA Champions League'
  }
  const poster = 'https://example.com/direct-event-poster.jpg'
  const landscape = 'https://example.com/direct-event-landscape.jpg'
  const background = 'https://example.com/direct-event-background.jpg'
  const logo = 'https://example.com/direct-event-logo.png'
  let lookupCalls = 0
  let structuredCalls = 0
  let titleSearchCalls = 0

  const compactId = encodeCustomId({
    y: 'movie',
    k: 'sports',
    n: 'Liverpool vs Real Madrid',
    t: 'UEFA.Champions.League.2026.03.15.Liverpool.vs.Real.Madrid.1080p.HDTV.x264-B',
    s: 1_100_000_000,
    d: 18,
    p: '2026-03-15T11:00:00Z',
    r: 'football',
    e: '2026-03-15',
    g: 'UEFA Champions League',
    v: eventId
  }, {
    compress: true,
    compact: 'sports'
  })

  const result = await withSportsDbPrototypePatches({
    _lookupEvent: async (requestedId) => {
      lookupCalls += 1
      return String(requestedId || '') === eventId ? event : null
    },
    _resolveFallbackImage: async (_event, prefer) => {
      if (prefer === 'poster') return poster
      if (prefer === 'landscape') return landscape
      if (prefer === 'background') return background
      return ''
    },
    _resolveFallbackLogo: async () => logo,
    findEventByStructuredData: async () => {
      structuredCalls += 1
      throw new Error('direct event lookup should win before structured parsing')
    },
    _fetchEvents: async () => {
      titleSearchCalls += 1
      throw new Error('direct event lookup should win before title searches')
    },
    _fetchEventsByDate: async () => [],
    _fetchTvEventsByDate: async () => [],
    _resolveLeagueArtworkFromTitle: async () => null
  }, async () => handleMeta({ sportsDbApiKey: 'smoke-sports-key' }, 'movie', compactId, { baseUrl: 'http://127.0.0.1:7000' }))

  assert.equal(lookupCalls, 1, 'meta should perform a single direct event lookup when eventId is available')
  assert.equal(structuredCalls, 0, 'direct event lookup should avoid structured title parsing')
  assert.equal(titleSearchCalls, 0, 'direct event lookup should avoid fallback title searches')
  assertSportsProxyUrl(result.meta.poster, 'poster', poster)
  assertSportsProxyUrl(result.meta.background, 'background', background)
  assertSportsProxyUrl(result.meta.logo, 'logo', logo)
  assert.deepEqual(result.meta.genres, ['Football', 'UEFA Champions League'])
}

async function testSportsCatalogUsesImageProxyUrls() {
  class FakeProwlarrClient {
    async search() {
      return [{
        title: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
        indexer: 'GeneralA',
        size: 1_000_000_000,
        seeders: 20,
        pubDate: '2026-03-15T09:00:00Z'
      }]
    }
  }

  const poster = 'https://images.example.com/cache-proxy-poster.jpg'
  const background = 'https://images.example.com/cache-proxy-background.jpg'
  const logo = 'https://images.example.com/cache-proxy-logo.png'

  const { handleCatalog } = loadCatalogWithStubs({
    '../clients/prowlarr': { ProwlarrClient: FakeProwlarrClient }
  })

  const result = await withSportsDbPrototypePatches({
    getEventArtwork: async () => ({
      poster,
      image: 'https://images.example.com/cache-proxy-landscape.jpg',
      backgroundImage: background,
      logo,
      homeBadge: 'https://images.example.com/arsenal-badge.png',
      awayBadge: 'https://images.example.com/chelsea-badge.png',
      leagueLogo: 'https://images.example.com/epl-logo.png',
      eventId: 'catalog-image-proxy-event',
      eventDate: '2026-03-15',
      league: 'English Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea'
    })
  }, async () => handleCatalog(
    {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'smoke-api-key',
      sportsDbApiKey: 'smoke-sports-key',
      maxResults: '10'
    },
    'sports',
    'pvtkrrx-sports',
    'search=Arsenal',
    { baseUrl: 'http://127.0.0.1:7000' }
  ))

  const posterPayload = assertSportsThumbUrl(result.metas[0].poster, 'poster', 'expected catalog poster to use generated matchup artwork')
  assert.equal(posterPayload.m, 'matchup')
  assert.match(result.metas[0].background, /^http:\/\/127\.0\.0\.1:7000\/image\/sports\/background\//, 'expected catalog background to use local sports image proxy')
  assert.match(String(result.metas[0].logo || ''), /^http:\/\/127\.0\.0\.1:7000\/image\/sports\/logo\//, 'expected catalog logo to use local sports image proxy')
}

async function testSportsMetaUsesImageProxyUrls() {
  const { handleMeta } = require('../src/handlers/meta')
  const compactId = encodeCustomId({
    y: 'movie',
    k: 'sports',
    n: 'Arsenal vs Chelsea',
    t: 'EPL.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-A',
    s: 1_000_000_000,
    d: 20,
    p: '2026-03-15T09:00:00Z',
    r: 'football',
    e: '2026-03-15',
    g: 'English Premier League',
    v: 'meta-image-proxy-event'
  }, {
    compress: true,
    compact: 'sports'
  })

  const poster = 'https://images.example.com/meta-proxy-poster.jpg'
  const background = 'https://images.example.com/meta-proxy-background.jpg'
  const logo = 'https://images.example.com/meta-proxy-logo.png'

  const result = await withSportsDbPrototypePatches({
    getEventArtwork: async () => ({
      poster,
      image: 'https://images.example.com/meta-proxy-landscape.jpg',
      backgroundImage: background,
      logo,
      homeBadge: 'https://images.example.com/arsenal-badge.png',
      awayBadge: 'https://images.example.com/chelsea-badge.png',
      leagueLogo: 'https://images.example.com/epl-logo.png',
      eventDate: '2026-03-15',
      league: 'English Premier League',
      eventName: 'Arsenal vs Chelsea',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea'
    })
  }, async () => handleMeta(
    { sportsDbApiKey: 'smoke-sports-key' },
    'movie',
    compactId,
    { baseUrl: 'http://127.0.0.1:7000' }
  ))

  const posterPayload = assertSportsThumbUrl(result.meta.poster, 'poster', 'expected sports meta poster to use generated matchup artwork')
  assert.equal(posterPayload.m, 'matchup')
  assert.match(result.meta.background, /^http:\/\/127\.0\.0\.1:7000\/image\/sports\/background\//, 'expected sports meta background to use local sports image proxy')
  assert.match(String(result.meta.logo || ''), /^http:\/\/127\.0\.0\.1:7000\/image\/sports\/logo\//, 'expected sports meta logo to use local sports image proxy')
}

async function testSportsImageCacheReusesDownloadedBytes() {
  const sourceUrl = 'https://images.example.com/cache-hit-poster.png'
  const proxyUrl = makeSportsImageProxyUrl('http://127.0.0.1:7000', sourceUrl, 'poster')
  const token = proxyUrl.split('/').pop()
  let fetchCalls = 0
  const originalFetch = global.fetch

  global.fetch = async () => {
    fetchCalls += 1
    if (fetchCalls > 1) throw new Error('sports image cache should reuse the first downloaded file')
    return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: {
        'content-type': 'image/png'
      }
    })
  }

  try {
    assert.equal(decodeSportsImageToken(token), sourceUrl)
    const first = await resolveSportsImageRequest(token, 'poster')
    assert.equal(first.cacheStatus, 'miss', 'expected first sports image request to download the image')
    assert.ok(fs.existsSync(first.filePath), 'expected first sports image request to persist a cache file')

    const second = await resolveSportsImageRequest(token, 'poster')
    assert.equal(second.cacheStatus, 'hit', 'expected second sports image request to reuse cached bytes')
    assert.equal(fetchCalls, 1, 'expected only one upstream image fetch for a cache hit path')
  } finally {
    global.fetch = originalFetch
  }
}

async function testMetaFallbackNeverReturnsNull() {
  const { handleMeta } = require('../src/handlers/meta')

  const unsupported = await handleMeta({}, 'movie', 'unsupported-meta-id', {
    baseUrl: 'http://127.0.0.1:7000'
  })
  assert.ok(unsupported.meta, 'expected unsupported meta ids to return a placeholder object')
  assert.equal(unsupported.meta.id, 'unsupported-meta-id')
  assert.equal(unsupported.meta.type, 'movie')
  assert.equal(unsupported.meta.name, 'Item unavailable')

  const malformedCustom = await handleMeta({}, 'movie', 'pvtkrrx:bad', {
    baseUrl: 'http://127.0.0.1:7000'
  })
  assert.ok(malformedCustom.meta, 'expected malformed custom ids to return a placeholder object')
  assert.equal(malformedCustom.meta.id, 'pvtkrrx:bad')
  assert.equal(malformedCustom.meta.type, 'movie')
  assert.match(
    String(malformedCustom.meta.description || ''),
    /metadata error/i,
    'expected malformed custom ids to explain the meta failure'
  )
}

async function main() {
  try {
    testCacheHeadersIncludeStaleIfError()
    testSportsDiscoveryCatalogLayout()
    testParserAndLeagueMap()
    testEventTitleParser()
    testSportDisambiguation()
    await testStructuredFallbackToFuzzyLookup()
    await testStructuredArtworkCacheDoesNotBleedAcrossFixtures()
    await testOrderAgnosticSportsGrouping()
    await testLeagueFallbackUsesGeneratedMatchupPoster()
    await testCatalogShowsSetupPlaceholderWhenProwlarrHasNoIndexers()
    await testSportSpecificCatalogDetailFiltering()
    await testEventTitleCatalogGrouping()
    await testF1FallbackUsesWeekendPosterCard()
    await testLibraryCustomIdsStayCompact()
    await testSportsMetaIncludesGenres()
    await testSportsMetaRichDescription()
    await testArtworkFallbackBehavior()
    await testCompactSportsIdMetaArtwork()
    await testCompactSportsMetaUsesDirectEventLookup()
    await testSportsCatalogUsesImageProxyUrls()
    await testSportsMetaUsesImageProxyUrls()
    await testSportsImageCacheReusesDownloadedBytes()
    await testMetaFallbackNeverReturnsNull()
    console.log('Smoke sports structured flow passed')
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
