const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')
const { isAdultContentResult } = require('../src/utils/adultContentFilter')

const rootDir = path.join(__dirname, '..')
const streamSource = fs.readFileSync(path.join(rootDir, 'src', 'handlers', 'stream.js'), 'utf8')
const catalogSource = fs.readFileSync(path.join(rootDir, 'src', 'handlers', 'catalog.js'), 'utf8')

assert.equal(
  isAdultContentResult({
    title: 'AFL 360 2026 05 25 Monday Footy 1080p',
    indexer: 'SportsCult',
    categoryIds: ['5060'],
    categoryNames: ['TV/Sport']
  }),
  false,
  'normal sports result should pass'
)

assert.equal(
  isAdultContentResult({
    title: 'WWE Raw 2026 05 25 1080p',
    indexer: 'SportsCult',
    categoryIds: ['5060'],
    categoryNames: ['TV/Sport']
  }),
  false,
  'wrestling Raw should not be blocked by adult filter'
)

assert.equal(
  isAdultContentResult({
    title: 'Unrelated adult release',
    indexer: 'IPTorrents',
    categoryIds: ['6000'],
    categoryNames: ['XXX']
  }),
  true,
  'Torznab adult category should be blocked'
)

assert.equal(
  isAdultContentResult({
    title: 'Example wet pussy release',
    indexer: 'IPTorrents',
    categoryIds: [],
    categoryNames: []
  }),
  true,
  'adult title terms should be blocked even without category metadata'
)

assert.equal(
  streamSource.includes('runSportsProwlarrSearch(torznab, query, false'),
  false,
  'sports supplemental search must not fall back to all Prowlarr categories'
)

assert.equal(
  catalogSource.includes('const broadItems = await cachedProwlarrSearch'),
  false,
  'sports catalog search must not fall back to all Prowlarr categories'
)

assert.equal(
  catalogSource.includes('isAdultContentResult'),
  true,
  'sports catalog must apply adult result filtering'
)

async function assertSportsCatalogSuppressesAdultResults() {
  const originalSearch = ProwlarrClient.prototype.search
  const originalFetch = global.fetch

  ProwlarrClient.prototype.search = async () => [
    {
      title: 'Adult On Couch decoy',
      link: 'https://tracker.example/adult.torrent',
      size: 1_500_000_000,
      seeders: 10,
      indexer: 'IPTorrents',
      categoryIds: ['6000'],
      categoryNames: ['XXX'],
      category: '6000',
      sportHint: '',
      pubDate: '2026-05-25T12:00:00.000Z'
    },
    {
      title: 'Australian Football On Couch 2026 05 25 1080p',
      link: 'https://tracker.example/on-couch.torrent',
      size: 1_500_000_000,
      seeders: 1,
      indexer: 'SportsCult',
      categoryIds: ['5060'],
      categoryNames: ['TV/Sport'],
      category: '5060',
      sportHint: 'australian-football',
      pubDate: '2026-05-25T12:00:00.000Z'
    }
  ]

  global.fetch = async (input) => {
    const url = String(input || '')
    if (url.startsWith('https://sportsmeta.test/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`Unexpected fetch in smoke-sports-stream-hygiene: ${url}`)
  }

  try {
    const result = await handleCatalog(
      {
        jackettUrl: 'https://prowlarr.example/sports-hygiene',
        jackettApiKey: 'dummy-key',
        sportsmetaBaseUrl: 'https://sportsmeta.test',
        maxResults: 10
      },
      'sports',
      'pvtkrrx-sports',
      'search=On%20Couch',
      { baseUrl: 'http://127.0.0.1:7000' }
    )

    const metaText = JSON.stringify(result?.metas || [])
    assert.match(metaText, /On Couch/i, 'sports catalog should keep the legitimate On Couch result')
    assert.doesNotMatch(metaText, /Adult On Couch decoy/i, 'sports catalog should suppress adult decoys')
  } finally {
    ProwlarrClient.prototype.search = originalSearch
    global.fetch = originalFetch
  }
}

assertSportsCatalogSuppressesAdultResults()
  .then(() => {
    console.log('[smoke-sports-stream-hygiene] PASS')
  })
  .catch((error) => {
    console.error('[smoke-sports-stream-hygiene] FAIL')
    console.error(error)
    process.exitCode = 1
  })
