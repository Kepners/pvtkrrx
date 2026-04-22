const assert = require('node:assert/strict')

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')

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
}

async function run() {
  global.fetch = async (input) => {
    const url = String(input || '')
    if (url.startsWith('https://sportsmeta.test/resolve')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
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

  await runCatalogSeedCase({
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
        trackerItem('MotoGP Qatar Grand Prix Race Replay 1080p', {
          sportHint: 'motorsport',
          pubDate: '2026-04-07T12:00:00.000Z'
        })
      ]],
      ['NASCAR', []],
      ['Supercars', []]
    ])
  })

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
