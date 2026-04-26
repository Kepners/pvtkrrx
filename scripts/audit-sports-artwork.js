#!/usr/bin/env node

const sharp = require('sharp')

const DEFAULT_MANIFEST_URL = 'https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted'
const REQUEST_TIMEOUT_MS = Math.max(2000, Number(process.env.PVTKRRX_AUDIT_TIMEOUT_MS || 15000) || 15000)
const SAMPLE_LIMIT = Math.max(1, Number(process.env.PVTKRRX_AUDIT_LIMIT || 50) || 50)

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizeManifestUrl() {
  const explicitManifest = String(process.env.PVTKRRX_AUDIT_MANIFEST_URL || '').trim()
  if (explicitManifest) return explicitManifest

  const base = stripTrailingSlash(process.env.PVTKRRX_AUDIT_BASE_URL || '')
  if (!base) return DEFAULT_MANIFEST_URL
  if (/\/manifest\.json(?:\?|$)/i.test(base)) return base
  return `${base}/manifest.json?mode=hosted`
}

function buildRouteContext(manifestUrl) {
  const parsed = new URL(manifestUrl)
  parsed.hash = ''
  const mode = parsed.searchParams.get('mode') || ''
  const pathname = parsed.pathname.replace(/\/manifest\.json$/i, '')
  return {
    manifestUrl: parsed.toString(),
    routeBase: `${parsed.origin}${pathname}`.replace(/\/+$/, ''),
    querySuffix: mode ? `?mode=${encodeURIComponent(mode)}` : ''
  }
}

function catalogUrl(routeBase, catalog, querySuffix, extra = '') {
  const extraPath = extra ? `/${extra}` : ''
  return `${routeBase}/catalog/${encodeURIComponent(catalog.type || 'sports')}/${encodeURIComponent(catalog.id)}${extraPath}.json${querySuffix || ''}`
}

function redactUrl(value) {
  return String(value || '')
    .replace(/\/member\/([^/?#]+)\/asset\//i, '/member/[redacted]/asset/')
    .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
}

async function fetchTimed(url, options = {}) {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: options.accept || '*/*',
        ...(options.headers || {})
      }
    })
    return { response, ms: Date.now() - started, error: null }
  } catch (error) {
    return { response: null, ms: Date.now() - started, error }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJson(url, label) {
  const result = await fetchTimed(url, { accept: 'application/json' })
  if (result.error) {
    return { ok: false, status: 0, ms: result.ms, json: null, error: `${label}: ${result.error.message}` }
  }
  const text = await result.response.text()
  try {
    return {
      ok: result.response.ok,
      status: result.response.status,
      ms: result.ms,
      json: text ? JSON.parse(text) : null,
      error: ''
    }
  } catch (error) {
    return { ok: false, status: result.response.status, ms: result.ms, json: null, error: `${label}: ${error.message}` }
  }
}

async function inspectImage(url) {
  const target = String(url || '').trim()
  if (!target) return { ok: false, status: 0, width: 0, height: 0, contentType: '', source: '', fallback: 'missing_url', upstream: '' }

  const result = await fetchTimed(target, { accept: 'image/png,image/jpeg,image/webp,image/*' })
  if (result.error) {
    return { ok: false, status: 0, width: 0, height: 0, contentType: '', source: '', fallback: result.error.message, upstream: '' }
  }

  const response = result.response
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  const buffer = Buffer.from(await response.arrayBuffer())
  let metadata = {}
  try {
    metadata = await sharp(buffer).metadata()
  } catch (_) {
    metadata = {}
  }

  return {
    ok: response.status === 200 && Boolean(metadata.width && metadata.height),
    status: response.status,
    ms: result.ms,
    contentType,
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    source: String(response.headers.get('x-pvtkrrx-artwork-source') || ''),
    fallback: String(response.headers.get('x-pvtkrrx-artwork-fallback') || ''),
    upstream: redactUrl(String(response.headers.get('x-pvtkrrx-artwork-upstream') || ''))
  }
}

function isPortrait(image = {}) {
  if (!image.width || !image.height) return false
  const ratio = image.width / image.height
  return image.height >= image.width && ratio >= 0.55 && ratio <= 1.05
}

function isWide(image = {}) {
  if (!image.width || !image.height) return false
  const ratio = image.width / image.height
  return image.width > image.height && ratio >= 1.55 && ratio <= 1.9
}

function pickSportsCatalog(manifest = {}) {
  const catalogs = (Array.isArray(manifest.catalogs) ? manifest.catalogs : [])
    .filter((catalog) => String(catalog?.type || '').toLowerCase() === 'sports')
  const requested = String(process.env.PVTKRRX_AUDIT_CATALOG_ID || '').trim()
  if (requested) {
    return catalogs.find((catalog) => catalog.id === requested) || { type: 'sports', id: requested }
  }
  return catalogs.find((catalog) => catalog.id === 'pvtkrrx-sports') || catalogs[0] || { type: 'sports', id: 'pvtkrrx-sports' }
}

async function main() {
  const context = buildRouteContext(normalizeManifestUrl())
  const manifestResult = await fetchJson(context.manifestUrl, 'manifest')
  if (!manifestResult.ok) {
    throw new Error(`manifest failed status=${manifestResult.status} error=${manifestResult.error}`)
  }

  const catalog = pickSportsCatalog(manifestResult.json || {})
  const extra = String(process.env.PVTKRRX_AUDIT_EXTRA || '').trim()
  const url = catalogUrl(context.routeBase, catalog, context.querySuffix, extra)
  const catalogResult = await fetchJson(url, `catalog ${catalog.id}`)
  if (!catalogResult.ok) {
    throw new Error(`catalog failed status=${catalogResult.status} error=${catalogResult.error}`)
  }

  const metas = (Array.isArray(catalogResult.json?.metas) ? catalogResult.json.metas : []).slice(0, SAMPLE_LIMIT)
  const rows = []
  for (const meta of metas) {
    const poster = await inspectImage(meta.poster)
    const background = await inspectImage(meta.background)
    const resolved = String(meta.id || '').startsWith('sportsmeta:')
    const row = {
      id: String(meta.id || ''),
      name: String(meta.name || ''),
      resolved,
      posterShape: String(meta.posterShape || ''),
      posterUrl: redactUrl(meta.poster),
      backgroundUrl: redactUrl(meta.background),
      poster,
      background,
      checks: {
        posterPortrait: isPortrait(poster),
        backgroundWide: isWide(background),
        posterReachable: poster.ok,
        backgroundReachable: background.ok
      }
    }
    rows.push(row)
  }

  const summary = {
    ok: true,
    manifestUrl: context.manifestUrl,
    catalogUrl: url,
    sampled: rows.length,
    resolved: rows.filter((row) => row.resolved).length,
    fallback: rows.filter((row) => !row.resolved).length,
    posterReachable: rows.filter((row) => row.checks.posterReachable).length,
    posterPortrait: rows.filter((row) => row.checks.posterPortrait).length,
    backgroundReachable: rows.filter((row) => row.checks.backgroundReachable).length,
    backgroundWide: rows.filter((row) => row.checks.backgroundWide).length,
    generatedFallbacks: rows.filter((row) => row.poster.source === 'pvtkrrx-generated-card' || row.background.source === 'pvtkrrx-generated-card').length,
    memberUpstreams: rows.filter((row) => /\/member\/\[redacted\]\/asset\//.test(row.poster.upstream) || /\/member\/\[redacted\]\/asset\//.test(row.background.upstream)).length
  }

  console.log('PVTKRRX sports artwork audit')
  console.log(`manifestUrl=${summary.manifestUrl}`)
  console.log(`catalogUrl=${summary.catalogUrl}`)
  console.log(`sampled=${summary.sampled} resolved=${summary.resolved} fallback=${summary.fallback}`)
  console.log(`posterReachable=${summary.posterReachable}/${summary.sampled} posterPortrait=${summary.posterPortrait}/${summary.sampled}`)
  console.log(`backgroundReachable=${summary.backgroundReachable}/${summary.sampled} backgroundWide=${summary.backgroundWide}/${summary.sampled}`)
  console.log(`generatedFallbacks=${summary.generatedFallbacks} memberUpstreams=${summary.memberUpstreams}`)
  console.log(JSON.stringify({ summary, rows }, null, 2))

  const hardFail = rows.some((row) => !row.checks.posterReachable || !row.checks.posterPortrait || !row.checks.backgroundReachable || !row.checks.backgroundWide)
  process.exit(hardFail ? 1 : 0)
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
