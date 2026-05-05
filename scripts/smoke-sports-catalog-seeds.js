const assert = require('node:assert/strict')

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')
const { buildSportsPrewarmJobs } = require('../src/utils/sportsCatalogPrewarm')
const { resolveSportHint } = require('../src/utils/sportsRules')

const ORIGINAL_SEARCH = ProwlarrClient.prototype.search
const ORIGINAL_CAPS = ProwlarrClient.prototype.caps
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

function isoDateOffset(days) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

async function runCatalogSeedCase({ catalogId, expectedNames, expectedSeedQueries, queryResults, configOverrides = {} }) {
  const requestedQueries = []
  ProwlarrClient.prototype.search = async function search(query) {
    requestedQueries.push(String(query || ''))
    return queryResults.get(String(query || '')) || []
  }

  const result = await handleCatalog({ ...makeConfig(), ...configOverrides }, 'sports', catalogId, '', {
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
  ProwlarrClient.prototype.caps = async function caps() {
    return [{ name: 'SportsCult' }]
  }

  const nonSportsCultCatalogCalls = []
  ProwlarrClient.prototype.search = async function search(query, cats, type, options = {}) {
    nonSportsCultCatalogCalls.push({
      query: String(query || ''),
      cats: String(cats || ''),
      useCategories: options.useCategories === true
    })
    return [
      trackerItem('NBA 2026 Atlanta Hawks vs New York Knicks 1080p', {
        indexer: 'GenericSportsTracker',
        sportHint: 'basketball',
        pubDate: '2026-04-23T12:00:00.000Z'
      })
    ]
  }
  const nonSportsCultConfig = makeConfig()
  nonSportsCultConfig.jackettUrl = 'https://prowlarr-non-sportscult.example'
  const nonSportsCultCatalogResult = await handleCatalog(
    nonSportsCultConfig,
    'sports',
    'pvtkrrx-sports',
    '',
    { baseUrl: 'http://127.0.0.1:7000' }
  )
  assert.deepEqual(
    nonSportsCultCatalogResult.metas || [],
    [],
    'sports catalogs must not emit non-SportsCult Prowlarr rows as catalog-owned events'
  )
  assert.ok(
    nonSportsCultCatalogCalls.length > 0 && nonSportsCultCatalogCalls.every((call) => call.cats === '5060' && call.useCategories),
    'non-SportsCult catalog rejection should still prove the Prowlarr sports-category contract'
  )

  const sportsMetaScheduleOnlyCalls = []
  let sportsMetaScheduleFetches = 0
  ProwlarrClient.prototype.search = async function search(query, cats, type, options = {}) {
    sportsMetaScheduleOnlyCalls.push({
      query: String(query || ''),
      cats: String(cats || ''),
      useCategories: options.useCategories === true
    })
    return []
  }
  global.fetch = async (input) => {
    const url = String(input || '')
    if (url.startsWith('https://sportsmeta.test/catalog/')) {
      sportsMetaScheduleFetches += 1
      return new Response(JSON.stringify({
        metas: [
          {
            id: 'sportsmeta:event:basketball|2026-04-23|nba|atlanta-hawks|new-york-knicks',
            name: 'Atlanta Hawks vs New York Knicks',
            type: 'sports'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    if (url.startsWith('https://sportsmeta.test/resolve')) {
      sportsMetaScheduleFetches += 1
      return new Response(JSON.stringify({
        event: {
          id: 'sportsmeta:event:basketball|2026-04-23|nba|atlanta-hawks|new-york-knicks',
          name: 'Atlanta Hawks vs New York Knicks',
          sport: 'Basketball',
          league: 'NBA',
          date: '2026-04-23',
          homeTeam: 'Atlanta Hawks',
          awayTeam: 'New York Knicks'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`Unexpected SportsMeta schedule-only fetch in smoke-sports-catalog-seeds: ${url}`)
  }
  const sportsMetaScheduleOnlyConfig = makeConfig()
  sportsMetaScheduleOnlyConfig.jackettUrl = 'https://prowlarr-sportsmeta-schedule-only.example'
  const sportsMetaScheduleOnlyResult = await handleCatalog(
    sportsMetaScheduleOnlyConfig,
    'sports',
    'pvtkrrx-sports',
    '',
    { baseUrl: 'http://127.0.0.1:7000' }
  )
  assert.deepEqual(
    sportsMetaScheduleOnlyResult.metas || [],
    [],
    'SportsMeta schedule/catalog rows must not create sports catalog items without SportsCult availability'
  )
  assert.ok(
    sportsMetaScheduleOnlyCalls.length > 0 && sportsMetaScheduleOnlyCalls.every((call) => call.cats === '5060' && call.useCategories),
    'SportsMeta schedule-only rejection should still start from Prowlarr sports-category searches'
  )
  assert.equal(
    sportsMetaScheduleFetches,
    0,
    'SportsMeta must not be queried for schedule/catalog enrichment when SportsCult availability is empty'
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
        trackerItem('Moto Grand Prix (MotoGP, Moto2, Moto3) 2026 Stage 04 Spain (Jerez) Complete Weekend', {
          sportHint: 'motorsport',
          pubDate: '2026-04-07T12:00:00.000Z'
        }),
        trackerItem('Moto Grand Prix (MotoGP, Moto2, Moto3) 2026 Stage 05 France (Le Mans) REPACK Weekend', {
          sportHint: 'motorsport',
          pubDate: '2026-04-14T12:00:00.000Z'
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
  assert.ok(
    !motorsportNames.some((name) => /\bComplete\b/i.test(name)),
    'motorsport catalog should strip upstream complete-package text from display names'
  )
  assert.ok(
    !motorsportNames.some((name) => /\bREPACK\b/i.test(name)),
    'motorsport catalog should strip shared release-package text from display names'
  )
  assert.ok(
    motorsportNames.some((name) => /France.*Weekend/i.test(name)),
    'motorsport catalog should include the REPACK regression fixture after cleanup'
  )
  const motorsportPosterTitles = (motorsportResult.metas || []).map((meta) => {
    try {
      return new URL(String(meta?.poster || '')).searchParams.get('title') || ''
    } catch {
      return ''
    }
  })
  assert.ok(
    !motorsportPosterTitles.some((title) => /\b(?:Complete|REPACK)\b/i.test(title)),
    'motorsport catalog should pass shared release-package cleanup through poster title fields'
  )

  const boxingQualityResult = await runCatalogSeedCase({
    catalogId: 'pvtkrrx-sports',
    expectedNames: ['Natasha Jonas'],
    expectedSeedQueries: [''],
    configOverrides: {
      jackettUrl: 'https://prowlarr-boxing-quality.example'
    },
    queryResults: new Map([[
      '',
      [
        trackerItem('Sky Sport Boxing Natasha Jonas vs Lauren Price 1080i FEED', {
          sportHint: 'boxing',
          pubDate: '2026-05-04T12:00:00.000Z'
        })
      ]
    ]])
  })
  const boxingQualityText = JSON.stringify(boxingQualityResult.metas || [])
  assert.doesNotMatch(
    boxingQualityText,
    /\b1080i\b/i,
    'sports catalog fallback cleanup should strip shared interlaced quality tags from display and poster fields'
  )

  const staleMotoGpDate = isoDateOffset(-1)
  const staleMotoGpTitleDate = staleMotoGpDate.replace(/-/g, ' ')
  global.fetch = async (input) => {
    const url = new URL(String(input || ''))
    if (url.origin === 'https://sportsmeta.test' && url.pathname === '/resolve') {
      const eventName = `${url.searchParams.get('event') || ''} ${url.searchParams.get('title') || ''}`
      if (/spain/i.test(eventName)) {
        return new Response(JSON.stringify({
          event: {
            id: `sportsmeta:event:motorsport|${staleMotoGpDate}|motogp|spain-sprint-race`,
            type: 'movie',
            name: 'Spain Sprint Race',
            title: 'Spain Sprint Race',
            sport: 'Motorsport',
            league: 'MotoGP',
            date: staleMotoGpDate,
            eventId: 'stale-motogp-spain'
          },
          assets: {}
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    }
    if (url.origin === 'https://sportsmeta.test' && url.pathname.startsWith('/catalog/')) {
      return new Response(JSON.stringify({ metas: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`Unexpected fetch in smoke-sports-catalog-seeds: ${url.toString()}`)
  }
  ProwlarrClient.prototype.search = async function search(query) {
    if (String(query || '') !== 'MotoGP') return []
    return [
      trackerItem(`MotoGP ${staleMotoGpTitleDate} Spain Sprint Race 1080p`, {
        sportHint: 'motorsport',
        pubDate: `${isoDateOffset(0)}T12:00:00.000Z`,
        seeders: 200
      }),
      trackerItem('MotoGP Brazil Race 1080p', {
        sportHint: 'motorsport',
        pubDate: `${isoDateOffset(-2)}T12:00:00.000Z`,
        seeders: 1
      })
    ]
  }
  const rankingConfig = makeConfig()
  rankingConfig.jackettUrl = 'https://prowlarr-ranking.example'
  const staleResolvedRankingResult = await handleCatalog(
    rankingConfig,
    'sports',
    'pvtkrrx-sports-motorsport',
    '',
    { baseUrl: 'http://127.0.0.1:7000' }
  )
  const staleResolvedRankingNames = (staleResolvedRankingResult.metas || []).map((meta) => String(meta?.name || ''))
  assert.ok(staleResolvedRankingNames.length >= 2, 'motorsport ranking regression should emit both MotoGP rows')
  assert.match(
    staleResolvedRankingNames[0],
    /Brazil/i,
    'sports browse should not pin a stale resolved MotoGP event above fresher undated availability'
  )
  assert.doesNotMatch(
    staleResolvedRankingNames[0],
    /Spain Sprint Race/i,
    'stale resolved SportsMeta rows should be a tie-break, not the first catalog sort key'
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
    ProwlarrClient.prototype.caps = ORIGINAL_CAPS
    global.fetch = ORIGINAL_FETCH
  })
