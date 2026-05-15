const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const persistentBackfillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-backfill-'))
process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_FILE = path.join(persistentBackfillRoot, 'sports-identity-backfill-cache.json')

const {
  clearSportsMetaResolveCache,
  SportsMetaClient
} = require('../src/clients/sportsmeta')
const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleMeta } = require('../src/handlers/meta')
const { handleCatalog } = require('../src/handlers/catalog')
const {
  SPORTS_META_RESOLUTION_STATUS,
  resolveSportsMetaIdentity
} = require('../src/utils/sportsIdentityResolution')
const {
  SPORTS_ARTWORK_PROXY_VERSION,
  resolveSportsPosterAsset
} = require('../src/utils/sportsArtwork')
const {
  clearSportsIdentityBackfillState,
  getCachedSportsIdentityBackfill,
  getSportsIdentityBackfillStats,
  setCachedSportsIdentityBackfill
} = require('../src/utils/sportsIdentityBackfill')
const { encodeCustomId } = require('../src/utils/customId')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { parseSportsEventTitle, parseSportsTitle } = require('../src/utils/sportsTitleParser')
const { parseSportsTorrentProfile, rankSportsTorrent } = require('../src/utils/sportsTorrentProfile')

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_PROWLARR_SEARCH = ProwlarrClient.prototype.search
const ORIGINAL_PROWLARR_CAPS = ProwlarrClient.prototype.caps

function canonicalPayload({ id, name, league, date, sport, homeTeam = '', awayTeam = '' }) {
  return {
    ok: true,
    service: 'sportsmeta',
    event: {
      id,
      type: 'movie',
      name,
      title: name,
      description: `${league}\nDate: ${date}`,
      sport,
      league,
      date,
      homeTeam,
      awayTeam
    },
    assets: {
      poster: `https://sportsmeta.test/asset/poster/${encodeURIComponent(id)}`,
      background: `https://sportsmeta.test/asset/background/${encodeURIComponent(id)}`,
      landscape: `https://sportsmeta.test/asset/landscape/${encodeURIComponent(id)}`,
      logo: `https://sportsmeta.test/asset/logo/${encodeURIComponent(id)}`
    }
  }
}

function availability(title, options = {}) {
  const pubDate = options.pubDate || ''
  return {
    title,
    pubDate,
    sportHint: options.sportHint || '',
    mappedLeague: options.mappedLeague || '',
    parsedSportsEvent: parseSportsTitle(title, pubDate) || null,
    parsedEvent: parseSportsEventTitle(title, pubDate) || null
  }
}

async function run() {
  const sportsSearchCalls = []
  ProwlarrClient.prototype.search = async function search(query, cats, type = 'search', options = {}) {
    sportsSearchCalls.push({
      query,
      cats: String(cats || ''),
      type,
      useCategories: Boolean(options?.useCategories)
    })
    return []
  }
  ProwlarrClient.prototype.caps = async function caps() {
    return [{ id: 1, name: 'SportsCult' }]
  }
  try {
    await handleCatalog(
      { jackettUrl: 'http://prowlarr.test', jackettApiKey: 'test-api-key' },
      'sports',
      'pvtkrrx-sports',
      '',
      {}
    )
  } finally {
    ProwlarrClient.prototype.search = ORIGINAL_PROWLARR_SEARCH
    ProwlarrClient.prototype.caps = ORIGINAL_PROWLARR_CAPS
  }
  assert.ok(sportsSearchCalls.length > 0, 'sports catalog smoke should exercise Prowlarr sports searches')
  assert.ok(
    sportsSearchCalls.every((call) => call.cats === '5060' && call.useCategories === true),
    'sports catalog/prewarm search path should keep every Prowlarr call constrained to Torznab category 5060'
  )

  const burnsId = 'sportsmeta:event:mma|2026-04-18|ufc|ufc-fight-night-273-burns|malott'
  const barcaId = 'sportsmeta:event:football|2026-04-22|spanish-la-liga|barcelona|celta-vigo'
  const barcaOtherId = 'sportsmeta:event:football|2026-04-25|spanish-la-liga|getafe|barcelona'
  const barcaWomenId = 'sportsmeta:event:football|2026-04-25|uefa-womens-champions-league|bayern-munich-women|barcelona-femen'
  const badChelseaId = 'sportsmeta:event:football|2026-03-24|ghanaian-premier-league|berekum-chelsea|medeama'
  const faCupChelseaLeedsId = 'sportsmeta:event:football|2026-04-26|fa-cup|chelsea|leeds-united'
  const mlbRoyalsAngelsId = 'sportsmeta:event:baseball|2026-04-25|mlb|kansas-city-royals|los-angeles-angels'
  const nbaPlayoffsSpursBlazersId = 'sportsmeta:event:basketball|2026-04-26|nba-playoffs|san-antonio-spurs|portland-trail-blazers'
  const mlsAtlantaMiamiId = 'sportsmeta:event:football|2026-04-27|major-league-soccer|atlanta-united|inter-miami'
  const iplTitansBengaluruId = 'sportsmeta:event:cricket|2026-04-27|indian-premier-league|gujarat-titans|royal-challengers-bengaluru'
  const pgaZurichClassicId = 'sportsmeta:event:golf|2026-04-27|pga-tour|zurich-classic'
  const motoGpSpainId = 'sportsmeta:event:motorsport|2026-04-25|motogp|spain-sprint-race'
  const fetchCounts = new Map()

  const countFetch = (url) => {
    const key = String(url || '')
    fetchCounts.set(key, (fetchCounts.get(key) || 0) + 1)
  }

  global.fetch = async (input) => {
    const url = new URL(String(input))
    countFetch(url.toString())
    if (url.hostname !== 'sportsmeta.test') {
      throw new Error(`Unexpected fetch host in smoke-sports-resolution: ${url.hostname}`)
    }

    if (url.pathname === '/resolve') {
      return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/catalog/movie/sportsmeta-football/search=barcelona.json') {
      return new Response(JSON.stringify({
        metas: [
          { id: barcaOtherId, name: 'Getafe vs Barcelona', releaseInfo: '2026-04-25' },
          { id: barcaWomenId, name: 'Bayern Munich Women vs Barcelona Femeni', releaseInfo: '2026-04-25' },
          { id: barcaId, name: 'Barcelona vs Celta Vigo', releaseInfo: '2026-04-22' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (
      url.pathname === '/catalog/movie/sportsmeta-football/search=arsenal.json' ||
      url.pathname === '/catalog/movie/sportsmeta-football/search=chelsea.json'
    ) {
      return new Response(JSON.stringify({
        metas: [
          { id: faCupChelseaLeedsId, name: 'Chelsea vs Leeds United', releaseInfo: '2026-04-26' },
          { id: badChelseaId, name: 'Berekum Chelsea vs Medeama', releaseInfo: '2026-03-24' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (
      url.pathname === '/catalog/movie/sportsmeta-baseball/search=royals.json' ||
      url.pathname === '/catalog/movie/sportsmeta-baseball/search=angels.json' ||
      url.pathname === '/catalog/movie/sportsmeta-baseball/search=los.json'
    ) {
      return new Response(JSON.stringify({
        metas: [
          { id: mlbRoyalsAngelsId, name: 'Kansas City Royals vs Los Angeles Angels', releaseInfo: '2026-04-25' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (
      url.pathname === '/catalog/movie/sportsmeta-basketball/search=antonio.json' ||
      url.pathname === '/catalog/movie/sportsmeta-basketball/search=portland.json'
    ) {
      return new Response(JSON.stringify({
        metas: [
          { id: nbaPlayoffsSpursBlazersId, name: 'San Antonio Spurs vs Portland Trail Blazers', releaseInfo: '2026-04-26' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (
      url.pathname === '/catalog/movie/sportsmeta-football/search=atlanta.json' ||
      url.pathname === '/catalog/movie/sportsmeta-football/search=inter.json'
    ) {
      return new Response(JSON.stringify({
        metas: [
          { id: mlsAtlantaMiamiId, name: 'Atlanta United vs Inter Miami', releaseInfo: '2026-04-27' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (
      url.pathname === '/catalog/movie/sportsmeta-cricket/search=gujarat.json' ||
      url.pathname === '/catalog/movie/sportsmeta-cricket/search=challengers.json' ||
      url.pathname === '/catalog/movie/sportsmeta-cricket/search=bengaluru.json'
    ) {
      return new Response(JSON.stringify({
        metas: [
          { id: iplTitansBengaluruId, name: 'Gujarat Titans vs Royal Challengers Bengaluru', releaseInfo: '2026-04-27' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/catalog/movie/sportsmeta-golf/search=classic.json') {
      return new Response(JSON.stringify({
        metas: [
          { id: pgaZurichClassicId, name: 'Zurich Classic', releaseInfo: '2026-04-27' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/catalog/movie/sportsmeta-mma/search=burns.json') {
      return new Response(JSON.stringify({
        metas: [
          { id: burnsId, name: 'UFC Fight Night 273 Burns vs Malott', releaseInfo: '2026-04-18' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/catalog/movie/sportsmeta-mma/search=belfast.json') {
      return new Response(JSON.stringify({
        metas: [
          {
            id: 'sportsmeta:event:mma|2026-04-16|professional-fighters-league|pfl-belfast-kelly|wilson',
            name: 'PFL Belfast Kelly vs Wilson',
            releaseInfo: '2026-04-16'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/catalog/movie/sportsmeta-motorsport/search=spain.json') {
      return new Response(JSON.stringify({
        metas: [
          { id: motoGpSpainId, name: 'Spain Sprint Race', releaseInfo: '2026-04-25' }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === '/event/sportsmeta%3Aevent%3Amma%7C2026-04-16%7Cprofessional-fighters-league%7Cpfl-belfast-kelly%7Cwilson') {
      return new Response(JSON.stringify(canonicalPayload({
        id: 'sportsmeta:event:mma|2026-04-16|professional-fighters-league|pfl-belfast-kelly|wilson',
        name: 'PFL Belfast Kelly vs Wilson',
        league: 'Professional Fighters League',
        date: '2026-04-16',
        sport: 'MMA'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(barcaId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: barcaId,
        name: 'Barcelona vs Celta Vigo',
        league: 'Spanish La Liga',
        date: '2026-04-22',
        sport: 'Football',
        homeTeam: 'Barcelona',
        awayTeam: 'Celta Vigo'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(barcaOtherId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: barcaOtherId,
        name: 'Getafe vs Barcelona',
        league: 'Spanish La Liga',
        date: '2026-04-25',
        sport: 'Football',
        homeTeam: 'Getafe',
        awayTeam: 'Barcelona'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(barcaWomenId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: barcaWomenId,
        name: 'Bayern Munich Women vs Barcelona Femeni',
        league: 'UEFA Womens Champions League',
        date: '2026-04-25',
        sport: 'Football',
        homeTeam: 'Bayern Munich Women',
        awayTeam: 'Barcelona Femeni'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(badChelseaId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: badChelseaId,
        name: 'Berekum Chelsea vs Medeama',
        league: 'Ghanaian Premier League',
        date: '2026-03-24',
        sport: 'Football',
        homeTeam: 'Berekum Chelsea',
        awayTeam: 'Medeama'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(faCupChelseaLeedsId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: faCupChelseaLeedsId,
        name: 'Chelsea vs Leeds United',
        league: 'FA Cup',
        date: '2026-04-26',
        sport: 'Football',
        homeTeam: 'Chelsea',
        awayTeam: 'Leeds United'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(mlbRoyalsAngelsId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: mlbRoyalsAngelsId,
        name: 'Kansas City Royals vs Los Angeles Angels',
        league: 'MLB',
        date: '2026-04-25',
        sport: 'Baseball',
        homeTeam: 'Kansas City Royals',
        awayTeam: 'Los Angeles Angels'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(nbaPlayoffsSpursBlazersId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: nbaPlayoffsSpursBlazersId,
        name: 'San Antonio Spurs vs Portland Trail Blazers',
        league: 'NBA Playoffs',
        date: '2026-04-26',
        sport: 'Basketball',
        homeTeam: 'San Antonio Spurs',
        awayTeam: 'Portland Trail Blazers'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(mlsAtlantaMiamiId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: mlsAtlantaMiamiId,
        name: 'Atlanta United vs Inter Miami',
        league: 'Major League Soccer',
        date: '2026-04-27',
        sport: 'Football',
        homeTeam: 'Atlanta United',
        awayTeam: 'Inter Miami'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(iplTitansBengaluruId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: iplTitansBengaluruId,
        name: 'Gujarat Titans vs Royal Challengers Bengaluru',
        league: 'Indian Premier League',
        date: '2026-04-27',
        sport: 'Cricket',
        homeTeam: 'Gujarat Titans',
        awayTeam: 'Royal Challengers Bengaluru'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(pgaZurichClassicId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: pgaZurichClassicId,
        name: 'Zurich Classic',
        league: 'PGA Tour',
        date: '2026-04-27',
        sport: 'Golf'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(burnsId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: burnsId,
        name: 'UFC Fight Night 273 Burns vs Malott',
        league: 'UFC',
        date: '2026-04-18',
        sport: 'MMA',
        homeTeam: 'Burns',
        awayTeam: 'Malott'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    if (url.pathname === `/event/${encodeURIComponent(motoGpSpainId)}`) {
      return new Response(JSON.stringify(canonicalPayload({
        id: motoGpSpainId,
        name: 'Spain Sprint Race',
        league: 'MotoGP',
        date: '2026-04-25',
        sport: 'Motorsport'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    throw new Error(`Unexpected fetch in smoke-sports-resolution: ${url.toString()}`)
  }

  const client = new SportsMetaClient({ baseUrl: 'https://sportsmeta.test' })

  const footballAvailability = availability('FC Barcelona vs RC Celta Round 33 1080p50fps', {
    sportHint: 'football',
    mappedLeague: 'Spanish La Liga',
    pubDate: '2026-04-22'
  })

  const footballResolution = await resolveSportsMetaIdentity(
    client,
    footballAvailability
  )
  assert.equal(footballResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'football fallback search should resolve Barcelona vs Celta')
  assert.equal(footballResolution.canonicalId, barcaId, 'football fallback search should return the canonical SportsMeta id')

  const cachedFootballResolution = await resolveSportsMetaIdentity(client, footballAvailability)
  assert.equal(cachedFootballResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'football fallback search should still resolve from cached SportsMeta responses')
  assert.equal(fetchCounts.get('https://sportsmeta.test/catalog/movie/sportsmeta-football/search=barcelona.json') || 0, 1, 'football search fallback should cache repeated SportsMeta catalog lookups')
  assert.equal(fetchCounts.get(`https://sportsmeta.test/event/${encodeURIComponent(barcaId)}`) || 0, 1, 'football fallback search should cache repeated canonical event fetches')
  assert.equal(fetchCounts.get(`https://sportsmeta.test/event/${encodeURIComponent(barcaOtherId)}`) || 0, 0, 'football fallback search should skip mismatched-date candidates before fetching canonical events')
  assert.equal(fetchCounts.get(`https://sportsmeta.test/event/${encodeURIComponent(barcaWomenId)}`) || 0, 0, 'football fallback search should not walk unrelated same-term candidates')

  clearSportsMetaResolveCache()
  const sportsMetaTestFetch = global.fetch
  const scopedResolveCalls = []
  try {
    global.fetch = async (input) => {
      const url = new URL(String(input))
      if (url.hostname !== 'sportsmeta-a.test' && url.hostname !== 'sportsmeta-b.test') {
        return sportsMetaTestFetch(input)
      }
      scopedResolveCalls.push(url.toString())
      if (url.pathname !== '/resolve') {
        throw new Error(`Unexpected scoped SportsMeta smoke path: ${url.pathname}`)
      }
      return new Response(JSON.stringify(canonicalPayload({
        id: `sportsmeta:event:football|2026-04-22|spanish-la-liga|${url.hostname}|celta-vigo`,
        name: `${url.hostname} vs Celta Vigo`,
        league: 'Spanish La Liga',
        date: '2026-04-22',
        sport: 'football',
        homeTeam: url.hostname,
        awayTeam: 'Celta Vigo'
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    const scopedResolveQuery = {
      recordType: 'event',
      date: '2026-04-22',
      sport: 'football',
      league: 'Spanish La Liga',
      home: 'Barcelona',
      away: 'Celta Vigo'
    }
    const scopedResolveA = await new SportsMetaClient({ baseUrl: 'https://sportsmeta-a.test' }).resolveEvent(scopedResolveQuery)
    const scopedResolveB = await new SportsMetaClient({ baseUrl: 'https://sportsmeta-b.test' }).resolveEvent(scopedResolveQuery)
    assert.match(scopedResolveA.canonicalId, /sportsmeta-a\.test/, 'SportsMeta /resolve cache should retain client A result')
    assert.match(scopedResolveB.canonicalId, /sportsmeta-b\.test/, 'SportsMeta /resolve cache should be scoped by base URL')
    assert.equal(scopedResolveCalls.length, 2, 'same structured tuple on two SportsMeta base URLs should make two upstream /resolve calls')
  } finally {
    global.fetch = sportsMetaTestFetch
    clearSportsMetaResolveCache()
  }

  const sportsMetaResponse = await handleMeta(
    { sportsmetaBaseUrl: 'https://sportsmeta.test' },
    'sports',
    barcaId,
    { baseUrl: 'https://addon.test' }
  )
  assert.equal(sportsMetaResponse.meta?.type, 'sports', 'canonical SportsMeta rows requested on the sports surface must return meta.type=sports')

  const paidSportsMetaResponse = await handleMeta(
    {
      sportsmetaBaseUrl: 'https://sportsmeta.test',
      sportsPosterMemberToken: 'https://sportsmeta.test/member/sm_paid_poster_token'
    },
    'sports',
    barcaId,
    { baseUrl: 'https://addon.test' }
  )
  const expectedPublicProxyPoster = `https://addon.test/sports-artwork/id/poster/${encodeURIComponent(barcaId)}.png?template=ticket-stub&v=${SPORTS_ARTWORK_PROXY_VERSION}`

  assert.equal(
    paidSportsMetaResponse.meta?.poster,
    expectedPublicProxyPoster,
    'PVTKRRX must not expose or forward SportsMeta member tokens in stream-addon artwork URLs'
  )

  const templateSportsMetaResponse = await handleMeta(
    {
      sportsmetaBaseUrl: 'https://sportsmeta.test',
      sportsPosterMemberToken: 'https://sportsmeta.test/member/sm_paid_poster_token',
      sportsPosterTemplate: 'glitch'
    },
    'sports',
    barcaId,
    { baseUrl: 'https://addon.test' }
  )
  assert.equal(
    templateSportsMetaResponse.meta?.poster,
    expectedPublicProxyPoster,
    'PVTKRRX free-tier rule: configured sportsPosterTemplate=glitch must normalise to ticket-stub and must not expose SportsMeta member tokens'
  )

  const previousEnvMemberToken = process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN
  process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN = 'https://sportsmeta.test/member/sm_env_poster_token'
  try {
    const envTokenPoster = resolveSportsPosterAsset({
      baseUrl: 'https://addon.test',
      sportsmetaBaseUrl: 'https://sportsmeta.test',
      canonicalId: barcaId
    })
    assert.equal(
      envTokenPoster.poster,
      expectedPublicProxyPoster,
      'PVTKRRX should ignore runtime env member tokens on stream-addon artwork URLs'
    )
    assert.equal(envTokenPoster.selectedArtworkSource, 'pvtkrrx-canonical-public-proxy')
  } finally {
    if (previousEnvMemberToken === undefined) delete process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN
    else process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN = previousEnvMemberToken
  }

  const fallbackPoster = resolveSportsPosterAsset({
    baseUrl: 'https://addon.test',
    sportsmetaBaseUrl: 'https://sportsmeta.test',
    sportHint: 'basketball',
    league: 'NBA',
    title: 'Atlanta Hawks vs New York Knicks',
    date: '2026-04-23'
  })
  assert.match(fallbackPoster.poster, /\/sports-artwork\/default\/poster\/basketball\.png/, 'fallback sports artwork should stay on the PVTKRRX raster proxy')
  assert.match(fallbackPoster.poster, /title=Atlanta\+Hawks\+vs\+New\+York\+Knicks/, 'fallback sports artwork should carry the game title')
  assert.match(fallbackPoster.poster, /date=2026-04-23/, 'fallback sports artwork should carry the event date')

  const unresolvedSportsId = encodeCustomId({
    y: 'sports',
    k: 'sports',
    n: 'San Antonio Spurs vs Portland Trail Blazers',
    t: 'NBA Playoffs 2026 / 1st Round / West / Game 4 / 26 04 2026 / {San Antonio Spurs @ Portland Trail Blazers m4rtyr',
    r: 'basketball',
    g: 'NBA Playoffs',
    e: '2026-04-26',
    o: 'San Antonio Spurs',
    w: 'Portland Trail Blazers',
    j: 'Game 4',
    d: 29,
    s: 7_800_000_000,
    c: 2,
    q: SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY
  }, { compact: 'sports', compress: true })
  const unresolvedSportsMeta = await handleMeta(
    { sportsmetaBaseUrl: 'https://sportsmeta.test' },
    'sports',
    unresolvedSportsId,
    { baseUrl: 'https://addon.test' }
  )
  assert.equal(unresolvedSportsMeta.meta?.posterShape, 'poster', 'unresolved sports detail should keep poster-shaped artwork')
  assert.match(String(unresolvedSportsMeta.meta?.poster || ''), /\/sports-artwork\/default\/poster\/basketball\.png/, 'unresolved sports detail poster should use the poster variant')
  const unresolvedBackgroundUrl = new URL(String(unresolvedSportsMeta.meta?.background || ''))
  assert.equal(unresolvedBackgroundUrl.pathname, '/sports-backdrops/nba-4k.jpg', 'unresolved sports detail background should use the reusable NBA 4K sport backdrop')
  assert.equal(unresolvedBackgroundUrl.searchParams.get('v'), '20260429-sport-level-4k-v1', 'unresolved sports detail background should keep the reusable sport backdrop cache key')
  assert.equal(unresolvedBackgroundUrl.searchParams.get('artworkV'), SPORTS_ARTWORK_PROXY_VERSION, 'sports detail background should also carry the current artwork cache key for Stremio URL-level busting')
  assert.doesNotMatch(String(unresolvedSportsMeta.meta?.background || ''), /\/poster\//, 'sports detail background must not be a blown-up poster')
  assert.match(String(unresolvedSportsMeta.meta?.description || ''), /Sport: Basketball/, 'sports detail description should include sport')
  assert.match(String(unresolvedSportsMeta.meta?.description || ''), /League: NBA Playoffs/, 'sports detail description should include league')
  assert.match(String(unresolvedSportsMeta.meta?.description || ''), /Event: San Antonio Spurs vs Portland Trail Blazers/, 'sports detail description should include event')
  assert.match(String(unresolvedSportsMeta.meta?.description || ''), /Session: Game 4/, 'sports detail description should include session')
  assert.match(String(unresolvedSportsMeta.meta?.description || ''), /Availability: 29 seeders \| 7\.8 GB \| 2 sources/, 'sports detail description should include availability facts')

  const noisyLaLiga = parseSportsTitle('La Liga 2026 Levante vs Sevilla 23 04 720p60fps EN ESPNP', '2026-04-23T12:00:00Z')
  assert.equal(noisyLaLiga?.date, '2026-04-23', 'sports parser should infer day/month from tracker football titles with broadcast tokens')
  assert.equal(noisyLaLiga?.homeTeam, 'Levante', 'sports parser should keep the home team after stripping league/year noise')
  assert.equal(noisyLaLiga?.awayTeam, 'Sevilla', 'sports parser should strip quality/language/broadcast tokens from away team')

  const compactMatchweek = parseSportsTitle('EPL.2026.04.30.Manchester.United.vs.Manchester.City.MW36.1080p', '2026-04-30T12:00:00Z')
  assert.equal(compactMatchweek?.homeTeam, 'Manchester United', 'compact matchweek title should keep clean home team')
  assert.equal(compactMatchweek?.awayTeam, 'Manchester City', 'compact matchweek title should strip MW tokens from away team')
  const compactMw35 = parseSportsTitle('EPL.2026.05.15.Manchester.United.vs.Brighton.MW35.1080p', '2026-05-15T12:00:00Z')
  assert.equal(compactMw35?.homeTeam, 'Manchester United', 'compact MW35 title should keep clean home team')
  assert.equal(compactMw35?.awayTeam, 'Brighton', 'compact MW35 title should be treated as matchweek noise, not opponent text')
  const spacedMatchweek = parseSportsTitle('Premier League Manchester United vs Wolverhampton Wanderers Matchweek 35', '2026-05-15T12:00:00Z')
  assert.equal(spacedMatchweek?.league, 'English Premier League', 'spaced matchweek title should keep the league')
  assert.equal(spacedMatchweek?.awayTeam, 'Wolverhampton Wanderers', 'spaced matchweek title should strip Matchweek tokens')
  const leadingMatchweek = parseSportsTitle('EPL.MW36.Manchester.United.vs.Brighton.and.Hove.Albion.2026.05.10.1080p.WEB-DL', '2026-05-10T12:00:00Z')
  assert.equal(leadingMatchweek?.homeTeam, 'Manchester United', 'leading MW title should strip compact matchweek from home team')
  assert.equal(leadingMatchweek?.awayTeam, 'Brighton and Hove Albion', 'leading MW title should keep the clean away team')
  const trailingLeague = parseSportsTitle('Manchester.United.vs.Manchester.City.2026.04.30.EPL.MW36.1080p.WEB.h264-FOO', '2026-04-30T12:00:00Z')
  assert.equal(trailingLeague?.league, 'English Premier League', 'date-before-league title should recover trailing EPL league')
  assert.equal(trailingLeague?.awayTeam, 'Manchester City', 'date-before-league title should strip trailing MW noise from away team')
  const leagueAsOpponent = parseSportsTitle('Soccer.EPL.2026.05.10.Manchester.United.vs.Womens.Super.League.1080p', '2026-05-10T12:00:00Z')
  assert.equal(leagueAsOpponent, null, 'competition phrases must not be accepted as an away team')

  const womensChampionsTitle = 'UEFA Womens Champions League 2025 26 Quarter Final 1st Leg 24 03 2026 Arsenal vs Chelsea 1080p 50fps EN BBC'
  const womensChampions = parseSportsTitle(womensChampionsTitle, '2026-04-24T12:00:00Z')
  assert.equal(womensChampions?.league, 'UEFA Womens Champions League', 'women Champions League titles should keep the full competition label')
  assert.equal(womensChampions?.date, '2026-03-24', 'women Champions League titles should use the in-title fixture date instead of torrent publish date')
  assert.equal(womensChampions?.homeTeam, 'Arsenal', 'women Champions League parser should isolate the home team after round/date text')
  assert.equal(womensChampions?.awayTeam, 'Chelsea', 'women Champions League parser should isolate the away team before quality/source text')

  const wrongChelseaResolution = await resolveSportsMetaIdentity(
    client,
    availability(womensChampionsTitle, {
      sportHint: 'football',
      mappedLeague: 'UEFA Womens Champions League',
      pubDate: '2026-04-24T12:00:00.000Z'
    })
  )
  assert.notEqual(
    wrongChelseaResolution.status,
    SPORTS_META_RESOLUTION_STATUS.RESOLVED,
    'matchup search fallback must not pair Arsenal vs Chelsea to an unrelated Chelsea fixture'
  )

  const oneTeamFaCup = parseSportsTitle('Football FA Cup vs Chelsea 2026 04 25 1080p', '2026-04-25T12:00:00Z')
  assert.equal(oneTeamFaCup?.league, 'FA Cup', 'FA Cup tracker rows should keep FA Cup as the competition')
  assert.equal(oneTeamFaCup?.awayTeam, 'Chelsea', 'FA Cup one-team tracker rows should preserve the real team token')
  const oneTeamFaCupNormalized = normalizeSportsEventMetadata({
    rawTitle: 'Football FA Cup vs Chelsea 2026 04 25 1080p',
    sportHint: 'football',
    competition: 'FA Cup',
    date: '2026-04-25'
  })
  assert.equal(oneTeamFaCupNormalized.eventTitle, 'Chelsea', 'FA Cup one-team fallback cards should not invent a fake FA Cup vs Chelsea matchup')
  const faCupRoundParsed = parseSportsTitle('FA Cup 2026 05 04 QF West Ham Utd vs Leeds Utd 1080pEN50fps', '2026-05-04T12:00:00.000Z')
  assert.equal(faCupRoundParsed?.league, 'FA Cup', 'FA Cup rows with round abbreviations should keep FA Cup as the competition')
  assert.equal(faCupRoundParsed?.homeTeam, 'West Ham Utd', 'FA Cup parser should keep West Ham when stripping QF round noise')
  assert.equal(faCupRoundParsed?.awayTeam, 'Leeds Utd', 'FA Cup parser should keep the away team after QF round noise')

  const faCupResolution = await resolveSportsMetaIdentity(
    client,
    availability('Football FA Cup vs Chelsea 2026 04 25 1080p', {
      sportHint: 'football',
      mappedLeague: 'FA Cup',
      pubDate: '2026-04-25T12:00:00.000Z'
    })
  )
  assert.equal(faCupResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'one-team FA Cup rows should resolve through same/next-day team search')
  assert.equal(faCupResolution.canonicalId, faCupChelseaLeedsId, 'FA Cup vs Chelsea should pair to the proved Chelsea vs Leeds United event')

  const mlbResolution = await resolveSportsMetaIdentity(
    client,
    availability('Kansas City Royals vs Los Angeles Angels MLB 2026 04 25', {
      sportHint: 'baseball',
      mappedLeague: 'MLB',
      pubDate: '2026-04-25T12:00:00.000Z'
    })
  )
  assert.equal(mlbResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'MLB rows with trailing league text should resolve to SportsMeta events')
  assert.equal(mlbResolution.canonicalId, mlbRoyalsAngelsId, 'MLB Royals vs Angels should pair to the canonical MLB event')
  const mlbParsed = parseSportsTitle('Kansas City Royals vs Los Angeles Angels MLB 2026 04 25', '2026-04-25T12:00:00.000Z')
  assert.equal(mlbParsed?.awayTeam, 'Los Angeles Angels', 'MLB parser should strip trailing league suffixes from team labels')

  const nbaPlayoffsParsed = parseSportsTitle('NBA Playoffs 2026 / 1st Round / West / Game 4 / 26 04 2026 / {San Antonio Spurs @ Portland Trail Blazers m4rtyr', '2026-04-26T12:00:00.000Z')
  assert.equal(nbaPlayoffsParsed?.league, 'NBA Playoffs', 'NBA Playoffs tracker rows should keep the postseason competition')
  assert.equal(nbaPlayoffsParsed?.homeTeam, 'San Antonio Spurs', 'NBA Playoffs parser should isolate the home team')
  assert.equal(nbaPlayoffsParsed?.awayTeam, 'Portland Trail Blazers', 'NBA Playoffs parser should isolate the away team')
  const compactNbaWcsfTitle = 'NBA Playoffs WCSF Timberwolves@Spurs Game 1 04 05 2026 1080pEN60fps NBC'
  const compactNbaWcsfParsed = parseSportsTitle(compactNbaWcsfTitle, '2026-05-05T12:00:00.000Z')
  assert.equal(compactNbaWcsfParsed?.league, 'NBA Playoffs', 'compact NBA playoff rows should keep the postseason competition')
  assert.equal(compactNbaWcsfParsed?.date, '2026-05-04', 'compact NBA playoff rows should extract the tracker event date')
  assert.equal(compactNbaWcsfParsed?.homeTeam, 'Minnesota Timberwolves', 'compact NBA playoff rows should expand Timberwolves for SportsMeta lookup')
  assert.equal(compactNbaWcsfParsed?.awayTeam, 'San Antonio Spurs', 'compact NBA playoff rows should expand Spurs for SportsMeta lookup')
  const compactNbaWcsfNormalized = normalizeSportsEventMetadata({
    rawTitle: compactNbaWcsfTitle,
    sportHint: 'basketball',
    competition: 'NBA Playoffs',
    date: compactNbaWcsfParsed?.date
  })
  assert.equal(compactNbaWcsfNormalized.eventTitle, 'Minnesota Timberwolves vs San Antonio Spurs', 'compact NBA playoff rows should become two-team poster titles')
  assert.equal(compactNbaWcsfNormalized.homeTeam, 'Minnesota Timberwolves', 'compact NBA normalized metadata should carry the expanded first team')
  assert.equal(compactNbaWcsfNormalized.awayTeam, 'San Antonio Spurs', 'compact NBA normalized metadata should carry the expanded second team')
  const compactNbaEcsfTitle = 'NBA Playoffs ECSF 76ers@Knicks Game 1 04 05 2026 1080pEN60fps TNT'
  const compactNbaEcsfParsed = parseSportsTitle(compactNbaEcsfTitle, '2026-05-05T12:00:00.000Z')
  assert.equal(compactNbaEcsfParsed?.homeTeam, 'Philadelphia 76ers', 'compact NBA playoff rows should expand 76ers for SportsMeta lookup')
  assert.equal(compactNbaEcsfParsed?.awayTeam, 'New York Knicks', 'compact NBA playoff rows should expand Knicks for SportsMeta lookup')
  const compactNbaProfile = parseSportsTorrentProfile({
    title: compactNbaEcsfTitle,
    pubDate: '2026-05-05T12:00:00.000Z',
    sportHint: 'basketball',
    seeders: 26
  })
  assert.equal(compactNbaProfile.event_class, 'team_vs_team', 'compact NBA playoff torrent profile should produce team-vs-team artwork inputs')
  assert.equal(compactNbaProfile.home_team, 'Philadelphia 76ers', 'compact NBA playoff torrent profile should carry the expanded first team')
  assert.equal(compactNbaProfile.away_team, 'New York Knicks', 'compact NBA playoff torrent profile should carry the expanded second team')
  const nbaPlayoffsResolution = await resolveSportsMetaIdentity(
    client,
    availability('NBA Playoffs 2026 / 1st Round / West / Game 4 / 26 04 2026 / {San Antonio Spurs @ Portland Trail Blazers m4rtyr', {
      sportHint: 'basketball',
      mappedLeague: 'NBA Playoffs',
      pubDate: '2026-04-26T12:00:00.000Z'
    })
  )
  assert.equal(nbaPlayoffsResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'NBA Playoffs tracker rows should resolve as basketball playoff fixtures')
  assert.equal(nbaPlayoffsResolution.canonicalId, nbaPlayoffsSpursBlazersId, 'NBA Playoffs fixture should pair to the canonical playoff event')

  const mlsParsed = parseSportsTitle('MLS 2026 Atlanta United vs Inter Miami 2026 04 27 1080p', '2026-04-27T12:00:00.000Z')
  assert.equal(mlsParsed?.league, 'Major League Soccer', 'MLS shorthand should parse as Major League Soccer')
  assert.equal(mlsParsed?.homeTeam, 'Atlanta United', 'MLS parser should isolate the home team')
  assert.equal(mlsParsed?.awayTeam, 'Inter Miami', 'MLS parser should isolate the away team')
  const mlsResolution = await resolveSportsMetaIdentity(
    client,
    availability('Major League Soccer 2026 Atlanta United vs Inter Miami 2026 04 27 1080p', {
      sportHint: 'football',
      mappedLeague: 'Major League Soccer',
      pubDate: '2026-04-27T12:00:00.000Z'
    })
  )
  assert.equal(mlsResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'MLS/Major League Soccer rows should resolve as football fixtures')
  assert.equal(mlsResolution.canonicalId, mlsAtlantaMiamiId, 'MLS fixture should pair to the canonical football event')

  const iplParsed = parseSportsTitle('IPL 2026 Gujarat Titans vs Royal Challengers Bengaluru 1080p', '2026-04-27T12:00:00.000Z')
  assert.equal(iplParsed?.league, 'Indian Premier League', 'IPL shorthand should parse as Indian Premier League')
  assert.equal(iplParsed?.homeTeam, 'Gujarat Titans', 'IPL parser should isolate the home team')
  assert.equal(iplParsed?.awayTeam, 'Royal Challengers Bengaluru', 'IPL parser should isolate the away team')
  const iplResolution = await resolveSportsMetaIdentity(
    client,
    availability('Indian Premier League 2026 Gujarat Titans vs Royal Challengers Bengaluru 1080p', {
      sportHint: 'cricket',
      mappedLeague: 'Indian Premier League',
      pubDate: '2026-04-27T12:00:00.000Z'
    })
  )
  assert.equal(iplResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'IPL rows should resolve as cricket fixtures')
  assert.equal(iplResolution.canonicalId, iplTitansBengaluruId, 'IPL fixture should pair to the canonical cricket event')

  const pgaParsed = parseSportsEventTitle('PGA Tour 2026 Zurich Classic Round 3 WEB-DL 1080p', '2026-04-27T12:00:00.000Z')
  assert.equal(pgaParsed?.league, 'PGA Tour', 'PGA Tour rows should parse as golf')
  assert.equal(pgaParsed?.eventName, 'Zurich Classic', 'PGA Tour parser should preserve the event name')
  const pgaResolution = await resolveSportsMetaIdentity(
    client,
    availability('PGA Tour 2026 Zurich Classic Round 3 WEB-DL 1080p', {
      sportHint: 'golf',
      mappedLeague: 'PGA Tour',
      pubDate: '2026-04-27T12:00:00.000Z'
    })
  )
  assert.equal(pgaResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'PGA Tour rows should resolve as golf events')
  assert.equal(pgaResolution.canonicalId, pgaZurichClassicId, 'PGA Tour fixture should pair to the canonical golf event')

  const motogpSession = parseSportsEventTitle('MotoGP 2026 Round04 Spain Jerez FP1 Practice WEB DL 1080p H264 English')
  assert.equal(motogpSession?.eventName, 'Spain Jerez', 'motorsport parser should strip round/session wording from event names')
  const motogpNormalized = normalizeSportsEventMetadata({
    rawTitle: 'MotoGP 2026 Round04 Spain Jerez FP1 Practice WEB DL 1080p H264 English',
    sportHint: 'motorsport',
    competition: 'MotoGP',
    date: '2026-04-25'
  })
  assert.equal(motogpNormalized.eventDetail, 'FP1 Practice', 'MotoGP parser should expose compound FP session detail')

  const motogpShortTitle = parseSportsEventTitle('MotoGP Spain Jerez', '2026-04-25T12:00:00.000Z')
  assert.equal(motogpShortTitle?.league, 'MotoGP', 'motorsport parser should accept short league + location titles')
  assert.equal(motogpShortTitle?.eventName, 'Spain Jerez', 'short MotoGP titles should retain the searchable location')

  const motoGpResolution = await resolveSportsMetaIdentity(
    client,
    availability('MotoGP Spain Jerez', {
      sportHint: 'motorsport',
      mappedLeague: 'MotoGP',
      pubDate: '2026-04-24T12:00:00.000Z'
    })
  )
  assert.equal(motoGpResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'MotoGP location aliases should resolve without treating torrent publish date as event date')
  assert.equal(motoGpResolution.canonicalId, motoGpSpainId, 'MotoGP Spain Jerez should pair with the SportsMeta Spain Sprint Race')

  const motogpTntProfile = parseSportsTorrentProfile({
    title: 'MotoGP 2026 Round04 Spain Jerez Race TNT WEB DL 1080p H264 DDP5 1 English MWR',
    pubDate: '2026-04-26T12:00:00.000Z',
    sportHint: 'motorsport',
    seeders: 5
  })
  assert.equal(motogpTntProfile.league, 'MotoGP', 'Prowlarr MotoGP rows should classify as MotoGP')
  assert.equal(motogpTntProfile.event, 'Spain Jerez', 'Prowlarr MotoGP rows should not leak TNT into the event name')
  assert.equal(motogpTntProfile.session, 'Race', 'Prowlarr MotoGP rows should expose the session')
  assert.equal(motogpTntProfile.broadcast, 'TNT', 'Prowlarr MotoGP rows should keep broadcast separately')
  assert.equal(motogpTntProfile.release_group, 'MWR', 'Prowlarr MotoGP rows should keep the real release group')
  assert.equal(motogpTntProfile.event_class, 'motorsport_event', 'MotoGP rows should be classified as event/session posters, not team matchups')

  const mlbRsProfile = parseSportsTorrentProfile({
    title: 'MLB 26 04 2026 RS Miami Marlins vs San Francisco Giants 720p60 EN NBCSBA',
    pubDate: '2026-04-26T12:00:00.000Z',
    sportHint: 'baseball',
    seeders: 10
  })
  assert.equal(mlbRsProfile.league, 'MLB', 'Prowlarr MLB rows should classify as MLB')
  assert.equal(mlbRsProfile.home_team, 'Miami Marlins', 'Prowlarr MLB rows should strip RS regular-season noise from home team')
  assert.equal(mlbRsProfile.away_team, 'San Francisco Giants', 'Prowlarr MLB rows should keep the away team clean')

  const iplMatchProfile = parseSportsTorrentProfile({
    title: 'IPL 2026 M13 Rajasthan Royals vs Mumbai Indians Full Match Replay Sky Sports NZ WEB DL 1080p50FPS Jinx8004',
    pubDate: '2026-04-07T12:00:00.000Z',
    sportHint: 'cricket',
    seeders: 2
  })
  assert.equal(iplMatchProfile.league, 'Indian Premier League', 'Prowlarr IPL rows should classify as Indian Premier League')
  assert.equal(iplMatchProfile.home_team, 'Rajasthan Royals', 'Prowlarr IPL rows should strip match-number noise from home team')
  assert.equal(iplMatchProfile.away_team, 'Mumbai Indians', 'Prowlarr IPL rows should keep the away team clean')

  const iplKayoProfile = parseSportsTorrentProfile({
    title: 'IPL 2026 M30 Gujarat Titans v Mumbai Indians Kayo Sport 1080p50 H 264',
    pubDate: '2026-04-20T12:00:00.000Z',
    sportHint: 'cricket',
    seeders: 2
  })
  assert.equal(iplKayoProfile.league, 'Indian Premier League', 'Prowlarr IPL Kayo rows should classify as Indian Premier League')
  assert.equal(iplKayoProfile.home_team, 'Gujarat Titans', 'Prowlarr IPL Kayo rows should strip match-number noise from home team')
  assert.equal(iplKayoProfile.away_team, 'Mumbai Indians', 'Prowlarr IPL Kayo rows should strip Kayo Sport from away team')
  assert.equal(iplKayoProfile.broadcast, 'Kayo Sports', 'Prowlarr IPL Kayo rows should keep Kayo as broadcast metadata')

  const wweProfile = parseSportsTorrentProfile({
    title: 'WWE SmackDown 2026 04 24 1080p WEB h264 HEEL',
    pubDate: '2026-04-24T12:00:00.000Z',
    sportHint: 'wrestling',
    seeders: 7
  })
  assert.equal(wweProfile.league, 'WWE', 'Prowlarr WWE rows should classify as WWE')
  assert.equal(wweProfile.event, 'SmackDown', 'Prowlarr WWE rows should keep the show name as the event')

  const wweRepackNormalized = normalizeSportsEventMetadata({
    rawTitle: 'WWE Monday Night Raw REPACK',
    sportHint: 'wrestling',
    competition: 'WWE',
    date: '2026-03-09'
  })
  assert.equal(wweRepackNormalized.eventTitle, 'Monday Night Raw', 'WWE rows should strip REPACK from poster titles')
  assert.doesNotMatch(wweRepackNormalized.eventTitle, /\bREPACK\b/i, 'WWE normalized poster title should not contain release tags')
  const wweRepackProfile = parseSportsTorrentProfile({
    title: 'WWE Monday Night Raw REPACK',
    pubDate: '2026-03-09T12:00:00.000Z',
    sportHint: 'wrestling',
    seeders: 2
  })
  assert.equal(wweRepackProfile.event, 'Monday Night RAW', 'Prowlarr WWE REPACK rows should keep only the show name')
  assert.equal(wweRepackProfile.release_group, null, 'REPACK should not be treated as a real release group')

  const superRugbyProfile = parseSportsTorrentProfile({
    title: 'Super Rugby 2026 Hurricanes vs Brumbies 25 04 1080p50fps',
    pubDate: '2026-04-26T12:00:00.000Z',
    sportHint: 'rugby',
    seeders: 1
  })
  assert.equal(superRugbyProfile.league, 'Super Rugby', 'Prowlarr Super Rugby rows should not map to rugby league')
  assert.equal(superRugbyProfile.home_team, 'Hurricanes', 'Prowlarr Super Rugby rows should keep home team clean')

  const basketballChampionsProfile = parseSportsTorrentProfile({
    title: '2026 Basketball Champions League of Americas F4 SF Boca Juniors (Arg) vs Flamengo (Bra)',
    pubDate: '2026-04-17T12:00:00.000Z',
    sportHint: 'football',
    seeders: 0
  })
  assert.equal(basketballChampionsProfile.sport, 'basketball', 'basketball league words should override a wrong football tracker hint')
  assert.equal(basketballChampionsProfile.league, 'Basketball Champions League Americas', 'Basketball Champions League rows should classify as basketball')
  assert.equal(basketballChampionsProfile.home_team, 'Boca Juniors Arg', 'Basketball Champions League rows should strip final-four round noise from home team')

  const basketballChampionsGeneralProfile = parseSportsTorrentProfile({
    title: 'Basketball Champions League Quarter Final 2026 La Laguna Tenerife vs Galatasaray Game 3 15 04 720pEN60fps',
    pubDate: '2026-04-15T12:00:00.000Z',
    sportHint: 'football',
    seeders: 1
  })
  assert.equal(basketballChampionsGeneralProfile.sport, 'basketball', 'Basketball Champions League general rows should override wrong football hints')
  assert.equal(basketballChampionsGeneralProfile.league, 'Basketball Champions League', 'Basketball Champions League should not map to UEFA Champions League')
  assert.equal(basketballChampionsGeneralProfile.home_team, 'La Laguna Tenerife', 'Basketball Champions League should preserve the home team')
  assert.equal(basketballChampionsGeneralProfile.away_team, 'Galatasaray', 'Basketball Champions League should preserve the away team')

  const pgaPrefixedProfile = parseSportsTorrentProfile({
    title: 'Golf PGA Tour Valero Texas Open Day 2 03 04 1080pEN50fps Sky Sports Golf',
    pubDate: '2026-04-03T12:00:00.000Z',
    sportHint: 'golf',
    seeders: 1
  })
  assert.equal(pgaPrefixedProfile.league, 'PGA Tour', 'Golf-prefixed PGA Tour rows should keep PGA Tour as the league')
  assert.equal(pgaPrefixedProfile.event, 'Valero Texas Open Day', 'Golf-prefixed PGA Tour rows should preserve the event label')
  assert.equal(pgaPrefixedProfile.broadcast, 'Sky Sports', 'Golf-prefixed PGA Tour rows should keep Sky as broadcast metadata')
  assert.equal(pgaPrefixedProfile.event_class, 'golf_event', 'PGA Tour rows should be classified as golf-event posters')

  const faCupPrefixedProfile = parseSportsTorrentProfile({
    title: 'Football FA Cup Chelsea vs Leeds United 2026 04 26 1080p WEB-DL',
    pubDate: '2026-04-26T12:00:00.000Z',
    sportHint: 'football',
    seeders: 26
  })
  assert.equal(faCupPrefixedProfile.sport, 'football', 'Football-prefixed FA Cup rows should classify as football')
  assert.equal(faCupPrefixedProfile.league, 'FA Cup', 'Football-prefixed FA Cup rows should keep FA Cup as league')
  assert.equal(faCupPrefixedProfile.home_team, 'Chelsea', 'Football-prefixed FA Cup rows should not leak the league into the home team')
  assert.equal(faCupPrefixedProfile.away_team, 'Leeds United', 'Football-prefixed FA Cup rows should preserve the away team')
  assert.equal(faCupPrefixedProfile.date, '2026-04-26', 'Football-prefixed FA Cup rows should extract the event date')

  const eplProfile = parseSportsTorrentProfile({
    title: 'EPL Liverpool vs Crystal Palace 25 04 2026 Sky Sports 1080p 50fps',
    pubDate: '2026-04-25T12:00:00.000Z',
    sportHint: 'football',
    seeders: 10
  })
  assert.equal(eplProfile.sport, 'football', 'EPL rows should classify as football')
  assert.equal(eplProfile.league, 'English Premier League', 'EPL shorthand should map to English Premier League')
  assert.equal(eplProfile.home_team, 'Liverpool', 'EPL rows should preserve the home team')
  assert.equal(eplProfile.away_team, 'Crystal Palace', 'EPL rows should preserve the away team')
  assert.equal(eplProfile.date, '2026-04-25', 'EPL rows should extract the fixture date')
  assert.equal(eplProfile.event_class, 'team_vs_team', 'EPL rows with two teams should be classified as team-vs-team')

  const ufcProfile = parseSportsTorrentProfile({
    title: 'UFC Fight Night Burns vs Malott Main Card 1080p WEB DL H264 Fight BB',
    pubDate: '2026-04-18T12:00:00.000Z',
    sportHint: 'mma',
    seeders: 8
  })
  assert.equal(ufcProfile.sport, 'mma', 'UFC rows should classify as MMA')
  assert.equal(ufcProfile.league, 'UFC', 'UFC rows should keep UFC as league')
  assert.equal(ufcProfile.home_team, 'Burns', 'UFC rows should preserve the first fighter')
  assert.equal(ufcProfile.away_team, 'Malott', 'UFC rows should preserve the second fighter')
  assert.equal(ufcProfile.session, 'Main Card', 'UFC rows should expose main card as session metadata')
  assert.equal(ufcProfile.event_class, 'combat_event', 'UFC rows should be classified as combat-event posters')

  const wimbledonProfile = parseSportsTorrentProfile({
    title: 'Wimbledon 2025 07 06 Day 7 Court #2 1080p BBC',
    pubDate: '2025-07-06T12:00:00.000Z',
    sportHint: 'tennis',
    seeders: 3
  })
  assert.equal(wimbledonProfile.sport, 'tennis', 'Wimbledon rows should classify as tennis')
  assert.equal(wimbledonProfile.league, 'Wimbledon', 'Wimbledon rows should keep Wimbledon as league')
  assert.equal(wimbledonProfile.event, 'Day Court #2', 'Wimbledon schedule rows should keep court/day event detail')
  assert.equal(wimbledonProfile.date, '2025-07-06', 'Wimbledon schedule rows should extract the event date')

  const atpProfile = parseSportsTorrentProfile({
    title: 'ATP Madrid Open 2026 Sinner vs Alcaraz Final 1080p WEB DL',
    pubDate: '2026-05-03T12:00:00.000Z',
    sportHint: 'tennis',
    seeders: 3
  })
  assert.equal(atpProfile.sport, 'tennis', 'ATP rows should classify as tennis')
  assert.equal(atpProfile.league, 'ATP World Tour', 'ATP rows should keep ATP World Tour as league')
  assert.equal(atpProfile.home_team, 'Sinner', 'ATP rows should not leak tournament name into first player')
  assert.equal(atpProfile.away_team, 'Alcaraz', 'ATP rows should preserve the second player')
  assert.equal(atpProfile.round, 'Final', 'ATP rows should expose final as round metadata')
  assert.equal(atpProfile.event_class, 'tennis_or_snooker_match', 'ATP rows should be classified as tennis/snooker posters')

  const wtaProfile = parseSportsTorrentProfile({
    title: 'WTA Rome 2026 Swiatek vs Gauff Semi Final 720p WEB',
    pubDate: '2026-05-14T12:00:00.000Z',
    sportHint: 'tennis',
    seeders: 3
  })
  assert.equal(wtaProfile.sport, 'tennis', 'WTA rows should classify as tennis')
  assert.equal(wtaProfile.league, 'WTA Tour', 'WTA rows should keep WTA Tour as league')
  assert.equal(wtaProfile.home_team, 'Swiatek', 'WTA rows should not leak tournament name into first player')
  assert.equal(wtaProfile.away_team, 'Gauff', 'WTA rows should preserve the second player')
  assert.equal(wtaProfile.round, 'Semi Final', 'WTA rows should expose semi final as round metadata')

  const oldArchiveRank = rankSportsTorrent({
    title: 'Formula1 2017 Round 8 Azerbaijan GP Race 1080p WEB DL H264',
    pubDate: '2026-04-26T12:00:00.000Z',
    sportHint: 'motorsport',
    seeders: 18
  }, 'Formula 1', { today: '2026-04-27' })
  const currentMotogpRank = rankSportsTorrent({
    title: 'MotoGP Brazil Race 1080p',
    pubDate: '2026-04-25T12:00:00.000Z',
    sportHint: 'motorsport',
    seeders: 1
  }, 'MotoGP', { today: '2026-04-27' })
  assert.ok(
    currentMotogpRank > oldArchiveRank,
    'sports torrent ranking should not let old archive seasons outrank current sports rows just because they were uploaded recently'
  )

  clearSportsIdentityBackfillState()
  const backfillGroup = {
    availabilityKey: 'spanish-la-liga-2026-04-22-barcelona-celta-vigo',
    bestAvailability: footballAvailability
  }
  setCachedSportsIdentityBackfill(backfillGroup, footballResolution)
  const cachedBackfill = getCachedSportsIdentityBackfill(backfillGroup)
  assert.equal(cachedBackfill?.canonicalId, barcaId, 'background sports identity backfill cache should replay resolved canonical ids')
  const backfillStats = getSportsIdentityBackfillStats()
  assert.equal(backfillStats.persistentCache, true, 'background sports identity backfill cache should be persistence-capable')
  assert.match(backfillStats.persistentCacheFile, /sports-identity-backfill-cache\.json$/, 'persistent backfill cache should have a stable file path')
  clearSportsIdentityBackfillState()

  const mmaResolution = await resolveSportsMetaIdentity(
    client,
    availability('Burns vs Malott 1080p WEB DL H264 Fight BB', {
      sportHint: 'mma',
      mappedLeague: 'UFC',
      pubDate: '2026-04-18'
    })
  )
  assert.equal(mmaResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'mma fallback search should resolve Burns vs Malott')
  assert.equal(mmaResolution.canonicalId, burnsId, 'mma fallback search should return the canonical SportsMeta id')

  const genericEventResolution = await resolveSportsMetaIdentity(
    client,
    availability('PFL Belfast 2026 Event 16 04 26 Z3R0', {
      sportHint: 'mma',
      mappedLeague: 'PFL',
      pubDate: '2026-04-16'
    })
  )
  assert.notEqual(genericEventResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'generic event-only titles should still fail closed')

  console.log('Smoke sports resolution passed')
}

run()
  .catch((error) => {
    console.error('Smoke sports resolution failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    global.fetch = ORIGINAL_FETCH
    fs.rmSync(persistentBackfillRoot, { recursive: true, force: true })
  })
