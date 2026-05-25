const assert = require('node:assert/strict')

// Reproduce and lock in the sports catalog latency contract.
// Simulates a slow Prowlarr by stubbing ProwlarrClient.search with a fixed
// per-call delay, and measures how long a sport-specific catalog takes to
// return. Football / motorsport / MMA each carry 3–4 seed terms, and each
// seed term calls `searchSportsCatalogItems` with sports categories.
// Sequential execution multiplies into a cascade that
// breaks catalog reliability when Prowlarr is slow.
//
// The acceptance bar: with a simulated 400ms-per-call Prowlarr, the
// football catalog must finish in under 6 seconds. The old sequential
// implementation took over 8 seconds (2 × (1 + 4 × 2) = up to 18 calls
// serialized). The fixed implementation fans seed queries out in parallel
// and skips the enrich pass when the initial browse already returned
// enough items.

process.env.PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS = '20000'
process.env.PVTKRRX_SPORTSMETA_TIMEOUT_MS = '1500'

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')

const ORIGINAL_SEARCH = ProwlarrClient.prototype.search
const ORIGINAL_FETCH = global.fetch

// Simulate a real-world slow Prowlarr (1.2 s per call). With sequential seed
// fan-out (the previous implementation) a sport-specific catalog would do up
// to 2 initial + 4 × 2 = 10 serial calls, pushing football to ~12 s which
// breaks the catalog reliability contract reported on 2026-04-23.
const PROWLARR_CALL_DELAY_MS = 1200
// Football has a dense browse, so the fix should skip the enrichment pass
// entirely and return in ~2 initial calls.
const FOOTBALL_CATALOG_BUDGET_MS = 4000
// Motorsport and MMA hit the enrichment pass (empty browse) but should
// fan seed queries out in parallel. Worst case is 2 rounds × 2 calls = 4
// call-widths of time (plus a little overhead).
const MOTORSPORT_CATALOG_BUDGET_MS = 7000
const MMA_CATALOG_BUDGET_MS = 7000

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

function makeConfig(caseTag = 'default') {
  // Vary the Prowlarr URL per case so the module-level search cache in
  // `catalog.js` does not leak state between independent catalog cases.
  return {
    jackettUrl: `https://prowlarr.example/${caseTag}`,
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

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function measureCatalog({ catalogId, sportHint, browseItems, seedResults, budgetMs }) {
  const callLog = []
  const parallelCallTimestamps = []
  let maxInFlight = 0
  let currentInFlight = 0

  ProwlarrClient.prototype.search = async function search(query) {
    const key = String(query || '')
    currentInFlight += 1
    if (currentInFlight > maxInFlight) maxInFlight = currentInFlight
    parallelCallTimestamps.push({ query: key, at: Date.now(), inFlight: currentInFlight })
    callLog.push({ query: key, startedAt: Date.now() })
    try {
      await delay(PROWLARR_CALL_DELAY_MS)
      if (!key) return browseItems
      return seedResults.get(key) || []
    } finally {
      currentInFlight -= 1
    }
  }

  const started = Date.now()
  const result = await handleCatalog(makeConfig(catalogId), 'sports', catalogId, '', {
    baseUrl: 'http://127.0.0.1:7000'
  })
  const elapsed = Date.now() - started

  assert.ok(Array.isArray(result?.metas), `${catalogId} should return metas array`)
  assert.ok(result.metas.length > 0, `${catalogId} should emit metas`)
  assert.ok(
    elapsed < budgetMs,
    `${catalogId} took ${elapsed}ms (budget ${budgetMs}ms). Calls: ${callLog.length}`
  )
  return { elapsed, metas: result.metas.length, calls: callLog.length, maxInFlight }
}

async function run() {
  global.fetch = async (input) => {
    const url = String(input || '')
    if (url.startsWith('https://sportsmeta.test/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`Unexpected fetch in smoke-sports-catalog-latency: ${url}`)
  }

  // Case 1: football catalog with a dense browse result. The fix should
  // skip the second-pass seeding entirely because initial browse already
  // has plenty of items matching the sport.
  const footballBrowse = Array.from({ length: 40 }, (_, i) =>
    trackerItem(
      `EPL Team${i} vs Team${i + 1} 20/04/2026 Sky Sports 1080p 50fps`,
      { sportHint: 'football', pubDate: `2026-04-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z` }
    )
  )

  const footballResult = await measureCatalog({
    catalogId: 'pvtkrrx-sports-football',
    sportHint: 'football',
    browseItems: footballBrowse,
    seedResults: new Map(),
    budgetMs: FOOTBALL_CATALOG_BUDGET_MS
  })
  console.log(`  football: ${footballResult.metas} metas in ${footballResult.elapsed}ms (${footballResult.calls} Prowlarr calls, max ${footballResult.maxInFlight} in flight)`)

  // Case 2: motorsport catalog with a browse batch that is large but
  // dominated by football results. The fix must look at sport-relevant
  // matches, not raw browse size, then fan seed queries out in parallel.
  const motorsportSeeds = new Map([
    ['Formula 1', [trackerItem('Formula 1 Japan Race SKY F1TV', { sportHint: 'motorsport' })]],
    ['MotoGP', [trackerItem('MotoGP Qatar Grand Prix Replay 1080p', { sportHint: 'motorsport' })]],
    ['NASCAR', []],
    ['Supercars', []]
  ])

  const motorsportResult = await measureCatalog({
    catalogId: 'pvtkrrx-sports-motorsport',
    sportHint: 'motorsport',
    browseItems: footballBrowse,
    seedResults: motorsportSeeds,
    budgetMs: MOTORSPORT_CATALOG_BUDGET_MS
  })
  console.log(`  motorsport: ${motorsportResult.metas} metas in ${motorsportResult.elapsed}ms (${motorsportResult.calls} Prowlarr calls, max ${motorsportResult.maxInFlight} in flight)`)
  assert.ok(
    motorsportResult.maxInFlight >= 2,
    `motorsport should fan seed queries out in parallel (got max=${motorsportResult.maxInFlight})`
  )

  // Case 3: MMA has the same failure mode as motorsport on a football-heavy
  // browse. It should still seed and return quickly.
  const mmaSeeds = new Map([
    ['UFC', [trackerItem('Burns vs Malott 1080p WEB DL H264 Fight BB', { sportHint: 'mma' })]],
    ['PFL', [trackerItem('PFL Europe Main Card 1080p WEB DL H264', { sportHint: 'mma' })]],
    ['ONE Championship', []]
  ])

  const mmaResult = await measureCatalog({
    catalogId: 'pvtkrrx-sports-mma',
    sportHint: 'mma',
    browseItems: footballBrowse,
    seedResults: mmaSeeds,
    budgetMs: MMA_CATALOG_BUDGET_MS
  })
  console.log(`  mma: ${mmaResult.metas} metas in ${mmaResult.elapsed}ms (${mmaResult.calls} Prowlarr calls, max ${mmaResult.maxInFlight} in flight)`)
  assert.ok(
    mmaResult.maxInFlight >= 2,
    `mma should fan seed queries out in parallel (got max=${mmaResult.maxInFlight})`
  )

  console.log('Smoke sports catalog latency passed')
}

run()
  .catch((error) => {
    console.error('Smoke sports catalog latency failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    ProwlarrClient.prototype.search = ORIGINAL_SEARCH
    global.fetch = ORIGINAL_FETCH
  })
