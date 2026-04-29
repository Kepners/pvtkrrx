#!/usr/bin/env node
//
// Prewarm sports poster cache from real Prowlarr / SportsCult releases.
//
// This script is operational only — it does not create catalog rows. It just
// queries Prowlarr's Torznab category 5060 (TV_SPORT), classifies each row
// using the SportsCult category map, and pings the local PVTKRRX poster
// route so the disk/memory cache is warm before Stremio Discover loads.
//
// Usage:
//   npm run prewarm:sports-posters -- --dry-run --limit 100
//
// Env / config:
//   PVTKRRX_PROWLARR_URL              required (or pass --prowlarr-url)
//   PVTKRRX_PROWLARR_API_KEY          required (or pass --prowlarr-api-key)
//   PVTKRRX_PREWARM_BASE_URL          PVTKRRX HTTP base, default http://127.0.0.1:7000
//   PVTKRRX_SPORTS_POSTER_TEMPLATE    optional poster template
//
// Output: counts only — never prints raw RSS rows or download URLs.

const ProwlarrClient = require('../src/clients/prowlarr')
const { resolveSportsPosterAsset } = require('../src/utils/sportsArtwork')
const { parseSportsTorrentProfile } = require('../src/utils/sportsTorrentProfile')
const { parseSportsTitle, parseSportsEventTitle } = require('../src/utils/sportsTitleParser')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { mapSportsCultCategory, inferSportsCultPosterContextFromCategoryNames } = require('../src/config/sportsCultCategoryMap')
const { resolveSportHint } = require('../src/utils/sportsRules')

const SPORTS_CATS = [5060]
const DEFAULT_BASE_URL = process.env.PVTKRRX_PREWARM_BASE_URL || 'http://127.0.0.1:7000'

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: false,
    limit: 100,
    baseUrl: DEFAULT_BASE_URL,
    prowlarrUrl: process.env.PVTKRRX_PROWLARR_URL || '',
    prowlarrApiKey: process.env.PVTKRRX_PROWLARR_API_KEY || '',
    template: process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE || 'ticket-stub',
    queries: ['']
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--limit') args.limit = Number(argv[++i] || args.limit) || args.limit
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || args.limit
    else if (arg === '--base-url') args.baseUrl = argv[++i] || args.baseUrl
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length)
    else if (arg === '--prowlarr-url') args.prowlarrUrl = argv[++i] || args.prowlarrUrl
    else if (arg.startsWith('--prowlarr-url=')) args.prowlarrUrl = arg.slice('--prowlarr-url='.length)
    else if (arg === '--prowlarr-api-key') args.prowlarrApiKey = argv[++i] || args.prowlarrApiKey
    else if (arg.startsWith('--prowlarr-api-key=')) args.prowlarrApiKey = arg.slice('--prowlarr-api-key='.length)
    else if (arg === '--template') args.template = argv[++i] || args.template
    else if (arg.startsWith('--template=')) args.template = arg.slice('--template='.length)
    else if (arg === '--query') args.queries.push(argv[++i] || '')
    else if (arg.startsWith('--query=')) args.queries.push(arg.slice('--query='.length))
  }
  args.limit = Math.max(1, Math.min(500, args.limit))
  args.queries = [...new Set(args.queries.map((value) => String(value || '').trim()))]
  if (args.queries.length === 0) args.queries = ['']
  return args
}

function redactUrl(url = '') {
  return String(url || '')
    .replace(/(\?|&)(?:apikey|api_key|token|passkey|key|secret)=[^&#]+/gi, '$1[redacted]')
    .replace(/\/(?:passkey|apikey|token)\/[^/?#]+/gi, '/[redacted]')
}

function eventKey(profile = {}, parsedSportsEvent = null, parsedEvent = null, item = {}) {
  const sport = profile?.sport || ''
  const league = profile?.league || ''
  const date = profile?.date || ''
  const home = profile?.home_team || parsedSportsEvent?.homeTeam || ''
  const away = profile?.away_team || parsedSportsEvent?.awayTeam || ''
  const event = profile?.event || parsedEvent?.eventName || ''
  const session = profile?.session || ''
  return [sport, league, date, home, away, event, session].map((part) => String(part || '').trim().toLowerCase()).join('|') || (item?.title || '').toLowerCase()
}

async function fetchPosterUrl(posterUrl) {
  if (!posterUrl) return { ok: false, reason: 'missing_url', status: 0 }
  try {
    const response = await fetch(posterUrl, {
      method: 'GET',
      headers: { accept: 'image/png,image/*' },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}`, status: response.status }
    }
    const source = String(response.headers.get('x-pvtkrrx-artwork-source') || '').toLowerCase()
    const cache = String(response.headers.get('x-pvtkrrx-artwork-cache') || '').toLowerCase()
    return { ok: true, source, cache, status: response.status }
  } catch (error) {
    return { ok: false, reason: `fetch_error_${(error.message || '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}`, status: 0 }
  }
}

async function main() {
  const args = parseArgs()
  if (!args.prowlarrUrl || !args.prowlarrApiKey) {
    console.error('Missing Prowlarr URL or API key. Set PVTKRRX_PROWLARR_URL / PVTKRRX_PROWLARR_API_KEY or pass --prowlarr-url / --prowlarr-api-key.')
    process.exit(2)
  }

  console.log(`PVTKRRX poster prewarm starting — baseUrl=${args.baseUrl} dryRun=${args.dryRun} limit=${args.limit}`)

  const torznab = new ProwlarrClient(args.prowlarrUrl, args.prowlarrApiKey)
  const seen = new Set()
  const counts = {
    scanned: 0,
    classified: 0,
    deduped: 0,
    requested: 0,
    cacheWarm: 0,
    cacheMiss: 0,
    failed: 0,
    emergencyFallback: 0,
    byClass: {}
  }

  for (const query of args.queries) {
    if (counts.scanned >= args.limit) break
    let results = []
    try {
      results = await torznab.search(query, SPORTS_CATS) || []
    } catch (error) {
      console.warn(`Prowlarr search failed query="${query}" error=${(error.message || '').slice(0, 200)}`)
      continue
    }

    for (const item of results) {
      if (counts.scanned >= args.limit) break
      counts.scanned += 1

      const parsedSportsEvent = parseSportsTitle(item?.title || '', item?.pubDate || '') || null
      const parsedEvent = !parsedSportsEvent ? parseSportsEventTitle(item?.title || '') : null
      const sportsCultEntry = mapSportsCultCategory(item?.indexer || '') || inferSportsCultPosterContextFromCategoryNames(item?.categoryNames || [])
      const profile = parseSportsTorrentProfile(item, {
        parsedSportsEvent,
        parsedEvent,
        sportHint: item?.sportHint || sportsCultEntry?.appSportHint || '',
        categoryNames: item?.categoryNames || [],
        indexerCategoryName: item?.indexer || ''
      })
      const eventClass = profile?.event_class || classifySportsEvent({
        sportHint: profile?.sport || item?.sportHint || sportsCultEntry?.appSportHint || '',
        league: profile?.league || parsedSportsEvent?.league || parsedEvent?.league || '',
        eventTitle: profile?.event || parsedEvent?.eventName || '',
        homeTeam: profile?.home_team || parsedSportsEvent?.homeTeam,
        awayTeam: profile?.away_team || parsedSportsEvent?.awayTeam,
        rawTitle: item?.title || '',
        categoryNames: item?.categoryNames || [],
        indexerCategoryName: item?.indexer || ''
      })
      counts.classified += 1
      counts.byClass[eventClass] = (counts.byClass[eventClass] || 0) + 1

      const key = eventKey(profile, parsedSportsEvent, parsedEvent, item)
      if (seen.has(key)) {
        counts.deduped += 1
        continue
      }
      seen.add(key)

      const sportHint = resolveSportHint({
        explicitHint: profile?.sport || item?.sportHint || sportsCultEntry?.appSportHint || '',
        title: item?.title || ''
      }) || sportsCultEntry?.appSportHint || ''

      const artworkInput = {
        baseUrl: args.baseUrl,
        sportsmetaBaseUrl: process.env.PVTKRRX_SPORTSMETA_BASE_URL || '',
        sportsPosterTemplate: args.template,
        sportHint,
        league: profile?.league || parsedSportsEvent?.league || parsedEvent?.league || '',
        title: profile?.event || parsedEvent?.eventName || (parsedSportsEvent?.homeTeam && parsedSportsEvent?.awayTeam ? `${parsedSportsEvent.homeTeam} vs ${parsedSportsEvent.awayTeam}` : item?.title || ''),
        homeTeam: profile?.home_team || parsedSportsEvent?.homeTeam || '',
        awayTeam: profile?.away_team || parsedSportsEvent?.awayTeam || '',
        eventDetail: profile?.session || profile?.round || '',
        eventClass,
        date: profile?.date || ''
      }
      const { poster: posterUrl } = resolveSportsPosterAsset(artworkInput)

      if (args.dryRun) {
        console.log(`[dry-run] class=${eventClass} sport=${sportHint || 'unknown'} key=${key.slice(0, 80)} url=${redactUrl(posterUrl)}`)
        continue
      }

      counts.requested += 1
      const result = await fetchPosterUrl(posterUrl)
      if (!result.ok) {
        counts.failed += 1
        console.warn(`[warm] FAIL class=${eventClass} reason=${result.reason} url=${redactUrl(posterUrl)}`)
        continue
      }
      if (/emergency/i.test(result.source)) counts.emergencyFallback += 1
      if (result.cache && result.cache !== 'rendered') counts.cacheWarm += 1
      else counts.cacheMiss += 1
      console.log(`[warm] OK class=${eventClass} source=${result.source} cache=${result.cache} url=${redactUrl(posterUrl)}`)
    }
  }

  console.log(`PVTKRRX poster prewarm summary: ${JSON.stringify(counts)}`)
  if (counts.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
