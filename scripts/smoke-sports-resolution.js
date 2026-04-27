const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const persistentBackfillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sports-backfill-'))
process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_FILE = path.join(persistentBackfillRoot, 'sports-identity-backfill-cache.json')

const { SportsMetaClient } = require('../src/clients/sportsmeta')
const { handleMeta } = require('../src/handlers/meta')
const {
  SPORTS_META_RESOLUTION_STATUS,
  resolveSportsMetaIdentity
} = require('../src/utils/sportsIdentityResolution')
const {
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

const ORIGINAL_FETCH = global.fetch

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
  assert.equal(
    paidSportsMetaResponse.meta?.poster,
    `https://addon.test/sports-artwork/id/poster/${encodeURIComponent(barcaId)}.png?token=${encodeURIComponent('https://sportsmeta.test/member/sm_paid_poster_token')}&v=20260427-visual-v2`,
    'paid sports configs must emit PVTKRRX raster-proxy poster URLs for canonical sports art'
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
      `https://addon.test/sports-artwork/id/poster/${encodeURIComponent(barcaId)}.png?token=${encodeURIComponent('https://sportsmeta.test/member/sm_env_poster_token')}&v=20260427-visual-v2`,
      'PVTKRRX should prefer SportsMeta member artwork when a runtime env token is configured'
    )
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
  assert.match(String(unresolvedSportsMeta.meta?.background || ''), /\/sports-artwork\/default\/landscape\/basketball\.png/, 'unresolved sports detail background should use a 16:9 landscape variant, not the poster')
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
