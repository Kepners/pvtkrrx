const assert = require('node:assert/strict')

const { SportsMetaClient } = require('../src/clients/sportsmeta')
const {
  SPORTS_META_RESOLUTION_STATUS,
  resolveSportsMetaIdentity
} = require('../src/utils/sportsIdentityResolution')
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

  global.fetch = async (input) => {
    const url = new URL(String(input))
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

  const footballResolution = await resolveSportsMetaIdentity(
    client,
    availability('FC Barcelona vs RC Celta Round 33 1080p50fps', {
      sportHint: 'football',
      mappedLeague: 'Spanish La Liga',
      pubDate: '2026-04-22'
    })
  )
  assert.equal(footballResolution.status, SPORTS_META_RESOLUTION_STATUS.RESOLVED, 'football fallback search should resolve Barcelona vs Celta')
  assert.equal(footballResolution.canonicalId, barcaId, 'football fallback search should return the canonical SportsMeta id')

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
