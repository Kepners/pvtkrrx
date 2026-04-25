const assert = require('node:assert/strict')

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')
const { buildSportsPrewarmJobs } = require('../src/utils/sportsCatalogPrewarm')
const { resolveSportHint } = require('../src/utils/sportsRules')

const ORIGINAL_SEARCH = ProwlarrClient.prototype.search
const ORIGINAL_FETCH = global.fetch

function trackerItem(title, options = {}) {
  return {
    title,
    link: options.link || `https://tracker.example/${encodeURIComponent(title)}.torrent`,
    infohash: options.infohash || '',
    size: options.size || 4_000_000_000,
    seeders: options.seeders ?? 12,
    indexer: options.indexer || 'sportscult',
    sportHint: options.sportHint || '',
    pubDate: options.pubDate || '2026-04-22T12:00:00.000Z'
  }
}

function makeConfig() {
  return {
    jackettUrl: 'https://prowlarr.example',
    jackettApiKey: 'dummy-key',
    sportsmetaBaseUrl: 'https://sportsmeta.test',
    qbitUrl: 'https://qbit.example',
    qbitUsername: 'demo',
    qbitPassword: 'demo',
    fileServerUrl: 'https://files.example',
    fileServerAuth: '',
    pathMapping: { from: '', to: '' },
    additionalStorageRoots: [],
    maxResults: 50,
    lanPairEnabled: false,
    lanPairRequired: false
  }
}

async function runCatalogSeedCase({ catalogId, expectedNames, expectedSeedQueries, queryResults }) {
  const requestedQueries = []
  ProwlarrClient.prototype.search = async function search(query) {
    requestedQueries.push(String(query || ''))
    return queryResults.get(String(query || '')) || []
  }

  const result = await handleCatalog(makeConfig(), 'sports', catalogId, '', {
    baseUrl: 'http://127.0.0.1:7000'
  })

  assert.ok(Array.isArray(result?.metas), `${catalogId} should return a metas array`)
  assert.ok(result.metas.length > 0, `${catalogId} should emit seeded sport rows on empty browse`)
  for (const meta of result.metas) {
    assert.equal(meta?.posterShape, 'poster', `${catalogId} should emit portrait/square sports browse posters`)
    assert.match(
      String(meta?.poster || ''),
      /\/sports-artwork\/(?:id|default)\/poster\//,
      `${catalogId} sports browse poster should use the poster artwork variant`
    )
    assert.doesNotMatch(
      String(meta?.poster || ''),
      /\/sports-artwork\/(?:id|default)\/landscape\//,
      `${catalogId} sports browse poster should not use the landscape artwork variant`
    )
  }
  for (const expectedName of expectedNames) {
    assert.ok(
      result.metas.some((meta) => String(meta?.name || '').includes(expectedName)),
      `${catalogId} should include ${expectedName}`
    )
  }
  for (const expectedQuery of expectedSeedQueries) {
    assert.ok(
      requestedQueries.includes(expectedQuery),
      `${catalogId} should query Prowlarr with the ${expectedQuery} seed term`
    )
  }
  return result
}

async function run() {
  const prewarmJobs = buildSportsPrewarmJobs()
  assert.ok(
    prewarmJobs.some((job) => job.id === 'pvtkrrx-sports' && job.extra === 'search=MotoGP'),
    'sports prewarm should prepare common Stremio sports search terms before tablet browse'
  )
  assert.ok(
    prewarmJobs.some((job) => job.id === 'pvtkrrx-sports-football' && !job.extra),
    'sports prewarm should prepare sport-specific catalogs before tablet browse'
  )
  assert.equal(
    resolveSportHint({
      categoryHint: 'motorsport',
      title: 'EFL Championship 2026 04 17 Blackburn vs Coventry Full Broadcast 720p50 x264 EN SKY'
    }),
    'football',
    'strong league words in sports titles should override conflicting tracker category hints'
  )
  assert.equal(
    resolveSportHint({
      categoryHint: 'motorsport',
      title: 'ELC 2026 Leicester City vs Milwall 720p50 x264'
    }),
    'football',
    'common tracker typo league codes should not leak football rows into motorsport'
  )

  global.fetch = async (input) => {
    const url = String(input || '')
    if (url.startsWith('https://sportsmeta.test/resolve')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    }
    if (url.startsWith('https://sportsmeta.test/catalog/')) {
      return new Response(JSON.stringify({ metas: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`Unexpected fetch in smoke-sports-catalog-seeds: ${url}`)
  }

  const footballOnlyBrowse = [
    trackerItem('EPL Brighton Vs Chelsea 21/04/2026 Sky Sports 1080p 50fps', {
      sportHint: 'football',
      pubDate: '2026-04-21T12:00:00.000Z'
    })
  ]

  const motorsportResult = await runCatalogSeedCase({
    catalogId: 'pvtkrrx-sports-motorsport',
    expectedNames: ['Formula 1', 'MotoGP'],
    expectedSeedQueries: ['Formula 1', 'MotoGP', 'NASCAR', 'Supercars'],
    queryResults: new Map([
      ['', footballOnlyBrowse],
      ['Formula 1', [
        trackerItem('Formula 1 Round03 Japan Race SKY F1TV', {
          sportHint: 'motorsport',
          pubDate: '2026-04-06T12:00:00.000Z'
        })
      ]],
      ['MotoGP', [
        trackerItem('EFL Championship 2026 04 17 Blackburn vs Coventry Full Broadcast 720p50 x264 EN SKY', {
          sportHint: 'motorsport',
          pubDate: '2026-04-17T12:00:00.000Z',
          seeders: 99
        }),
        trackerItem('ELC 2026 Leicester City vs Milwall 720p50 x264', {
          sportHint: 'motorsport',
          pubDate: '2026-04-17T12:00:00.000Z',
          seeders: 98
        }),
        trackerItem('MotoGP Qatar Grand Prix Race Replay 1080p', {
          sportHint: 'motorsport',
          pubDate: '2026-04-07T12:00:00.000Z'
        })
      ]],
      ['NASCAR', []],
      ['Supercars', []]
    ])
  })
  const motorsportNames = (motorsportResult.metas || []).map((meta) => String(meta?.name || ''))
  assert.ok(
    !motorsportNames.some((name) => /Blackburn|Coventry|EFL Championship|Leicester|Milwall/i.test(name)),
    'motorsport catalog should reject football rows even when the tracker category hint says motorsport'
  )

  await runCatalogSeedCase({
    catalogId: 'pvtkrrx-sports-mma',
    expectedNames: ['Burns vs Malott', 'PFL Europe'],
    expectedSeedQueries: ['UFC', 'PFL', 'ONE Championship'],
    queryResults: new Map([
      ['', footballOnlyBrowse],
      ['UFC', [
        trackerItem('Burns vs Malott 1080p WEB DL H264 Fight BB', {
          sportHint: 'mma',
          pubDate: '2026-04-18T12:00:00.000Z'
        })
      ]],
      ['PFL', [
        trackerItem('PFL Europe Main Card 1080p WEB DL H264', {
          sportHint: 'mma',
          pubDate: '2026-04-19T12:00:00.000Z'
        })
      ]],
      ['ONE Championship', []]
    ])
  })

  const requestedQueries = []
  ProwlarrClient.prototype.search = async function search(query) {
    requestedQueries.push(String(query || ''))
    if (String(query || '') !== 'Premier League') return []
    return [
      trackerItem('Indian Premier League 2026 Gujarat Titans vs Royal Challengers Bengaluru 1080p', {
        sportHint: 'cricket',
        pubDate: '2026-04-22T12:00:00.000Z'
      }),
      trackerItem('Scottish Womens Premier League 2025 26 Show 06 04 2026 1080p', {
        sportHint: 'football',
        pubDate: '2026-04-06T12:00:00.000Z'
      }),
      trackerItem('EPL Liverpool vs Crystal Palace 25/04/2026 Sky Sports 1080p 50fps', {
        sportHint: 'football',
        pubDate: '2026-04-25T12:00:00.000Z'
      })
    ]
  }

  const premierLeagueResult = await handleCatalog(
    makeConfig(),
    'sports',
    'pvtkrrx-sports',
    'search=Premier%20League',
    { baseUrl: 'http://127.0.0.1:7000' }
  )
  const premierLeagueNames = (premierLeagueResult.metas || []).map((meta) => String(meta?.name || ''))
  assert.ok(requestedQueries.includes('Premier League'), 'Premier League search should query Prowlarr')
  assert.ok(
    premierLeagueNames.some((name) => /(?:Liverpool vs Crystal Palace|Crystal Palace vs Liverpool)/i.test(name)),
    'Premier League search should keep English Premier League football rows'
  )
  assert.ok(
    !premierLeagueNames.some((name) => /Gujarat Titans|Royal Challengers|Indian Premier League/i.test(name)),
    'Premier League search should not treat Indian Premier League cricket as English Premier League football'
  )
  assert.ok(
    !premierLeagueNames.some((name) => /Scottish Womens Premier League/i.test(name)),
    'Premier League search should not treat Scottish Womens Premier League as English Premier League football'
  )

  console.log('Smoke sports catalog seeds passed')
}

run()
  .catch((error) => {
    console.error('Smoke sports catalog seeds failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    ProwlarrClient.prototype.search = ORIGINAL_SEARCH
    global.fetch = ORIGINAL_FETCH
  })
