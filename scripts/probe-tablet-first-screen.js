#!/usr/bin/env node
// Ad-hoc probe: simulate the tablet LAN Bridge first-screen catalog path
// with realistic Prowlarr and SportsMeta latencies, and report per-hop time.
//
// This is NOT a smoke test. It is a measurement harness for the audit.

const { performance } = require('node:perf_hooks')

process.env.PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS = '20000'
process.env.PVTKRRX_SPORTSMETA_TIMEOUT_MS = '4000'
process.env.PVTKRRX_SPORTSMETA_CACHE_MS = '60000'

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { handleCatalog } = require('../src/handlers/catalog')

const PROWLARR_CALL_DELAY_MS = 600   // seedbox Prowlarr at ~600ms per call (realistic)
const SPORTSMETA_CALL_DELAY_MS = 200 // public HTTPS roundtrip to Contabo
const GROUP_COUNT = 80               // dense sports browse day

function trackerItem(title, options = {}) {
  return {
    title,
    link: `https://tracker.example/${encodeURIComponent(title)}.torrent`,
    infohash: '',
    size: 4_000_000_000,
    seeders: options.seeders ?? 25,
    indexer: 'sportscult',
    sportHint: options.sportHint || '',
    pubDate: options.pubDate || '2026-04-22T12:00:00.000Z'
  }
}

const PROWLARR_CALLS = { strict: 0, broad: 0, seed: 0 }
const SPORTSMETA_CALLS = { resolve: 0, getEvent: 0, catalog: 0 }

function makeConfig(tag = 't') {
  return {
    jackettUrl: `https://prowlarr.example/${tag}-${Date.now()}-${Math.random()}`,
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildBrowseBatch(count, sportHint = 'football') {
  const teams = ['Arsenal', 'Chelsea', 'Liverpool', 'Man City', 'Man Utd', 'Tottenham',
                 'Newcastle', 'Brighton', 'West Ham', 'Everton', 'Fulham', 'Villa',
                 'Palace', 'Bournemouth', 'Wolves', 'Brentford', 'Leeds', 'Leicester']
  return Array.from({ length: count }, (_, i) => {
    const home = teams[i % teams.length]
    const away = teams[(i + 1) % teams.length]
    const day = String((i % 28) + 1).padStart(2, '0')
    return trackerItem(
      `EPL ${home} vs ${away} 2026.04.${day} Sky Sports 1080p 50fps`,
      { sportHint, pubDate: `2026-04-${day}T12:00:00.000Z` }
    )
  })
}

ProwlarrClient.prototype.search = async function search(query, cats, type = 'search', options = {}) {
  await sleep(PROWLARR_CALL_DELAY_MS)
  if (options?.useCategories) PROWLARR_CALLS.strict += 1
  else if (query) PROWLARR_CALLS.seed += 1
  else PROWLARR_CALLS.broad += 1
  // Populated at runtime by stashing onto the prototype
  return ProwlarrClient.prototype._nextBrowse || []
}

// Stub /api/v1/indexer (caps) + SportsMeta fetches
global.fetch = async (input) => {
  const url = String(input?.url || input || '')
  if (url.includes('/api/v1/indexer')) {
    return new Response(JSON.stringify([{ id: 1, name: 'sportscult', capabilities: { categories: [] } }]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  if (url.includes('sportsmeta.test')) {
    await sleep(SPORTSMETA_CALL_DELAY_MS)
    if (url.includes('/resolve')) SPORTSMETA_CALLS.resolve += 1
    else if (url.includes('/event/')) SPORTSMETA_CALLS.getEvent += 1
    else if (url.includes('/catalog/')) SPORTSMETA_CALLS.catalog += 1
    // Return 404 to force the resolver through every attempt (worst case)
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })
  }
  throw new Error(`Unexpected fetch: ${url}`)
}

function resetCounters() {
  PROWLARR_CALLS.strict = 0
  PROWLARR_CALLS.broad = 0
  PROWLARR_CALLS.seed = 0
  SPORTSMETA_CALLS.resolve = 0
  SPORTSMETA_CALLS.getEvent = 0
  SPORTSMETA_CALLS.catalog = 0
}

async function runCase(label, groupCount) {
  resetCounters()
  ProwlarrClient.prototype._nextBrowse = buildBrowseBatch(groupCount)
  const t0 = performance.now()
  const result = await handleCatalog(makeConfig(label), 'movie', 'pvtkrrx-sports-football', '', {
    baseUrl: 'http://127.0.0.1:7000'
  })
  const t1 = performance.now()
  const payload = JSON.stringify(result)
  console.log(`\n[case ${label}] groups=${groupCount}`)
  console.log(`  total=${(t1 - t0).toFixed(0)}ms`)
  console.log(`  metas emitted=${result.metas?.length || 0}  payload=${payload.length}B`)
  console.log(`  prowlarr calls: strict=${PROWLARR_CALLS.strict} broad=${PROWLARR_CALLS.broad} seed=${PROWLARR_CALLS.seed}`)
  console.log(`  sportsmeta calls: resolve=${SPORTSMETA_CALLS.resolve} getEvent=${SPORTSMETA_CALLS.getEvent} catalog=${SPORTSMETA_CALLS.catalog}`)
  return { label, total: t1 - t0, metas: result.metas?.length || 0, groupCount }
}

async function main() {
  const results = []
  results.push(await runCase('football-40', 40))
  results.push(await runCase('football-80', 80))
  results.push(await runCase('football-120', 120))

  console.log('\nSummary:')
  for (const r of results) {
    const verdict = r.total < 3000 ? 'READY' : r.total < 6000 ? 'CAVEATS' : 'NOT READY'
    console.log(`  ${r.label}: ${r.total.toFixed(0)}ms (${r.metas} metas) -> ${verdict}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
