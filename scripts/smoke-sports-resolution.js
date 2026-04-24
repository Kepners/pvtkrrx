const assert = require('node:assert/strict')

const { SportsMetaClient } = require('../src/clients/sportsmeta')
const { handleMeta } = require('../src/handlers/meta')
const {
  SPORTS_META_RESOLUTION_STATUS,
  resolveSportsMetaIdentity
} = require('../src/utils/sportsIdentityResolution')
const {
  resolveSportsPosterAsset
} = require('../src/utils/sportsArtwork')
const { parseSportsEventTitle, parseSportsTitle } = require('../src/utils/sportsTitleParser')

const ORIGINAL_FETCH = global.fetch

function canonicalPayload({ id, name, league, date, sport }) {
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
      homeTeam: '',
      awayTeam: ''
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
        sport: 'Football'
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
        sport: 'Football'
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
        sport: 'Football'
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
        sport: 'MMA'
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
    `https://sportsmeta.test/member/sm_paid_poster_token/asset/poster/${encodeURIComponent(barcaId)}`,
    'paid sports configs must emit direct SportsMeta member poster URLs for canonical sports art'
  )

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
  })
