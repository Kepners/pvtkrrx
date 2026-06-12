#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { SPORTS_ARTWORK_PROXY_VERSION } = require('../src/utils/sportsArtwork')
const { containsSportsReleaseNoise } = require('../src/utils/sportsReleaseNoise')

const OUT_DIR = path.join(process.cwd(), '.runtime', 'sports-poster-audit')
// Track the live proxy version so this audit doesn't false-FAIL after a
// routine bump in src/utils/sportsArtwork.js. Override only when proving
// against a deployed runtime that's older than HEAD.
const EXPECTED_VERSION = String(process.env.PVTKRRX_SPORTS_POSTER_AUDIT_VERSION || SPORTS_ARTWORK_PROXY_VERSION)
const DEFAULT_MANIFEST = process.env.PVTKRRX_SPORTS_POSTER_AUDIT_MANIFEST ||
  'https://pvtkrr.layoutforge.app/selfhost/manifest.json?mode=hosted'
const POSTER_ALLOWED_SOURCES = new Set([
  'sportsmeta-raster',
  'pvtkrrx-public-template',
  'pvtkrrx-template-glyph',
  'pvtkrrx-emergency-legacy-fallback'
])
const BACKDROP_ALLOWED_SOURCES = new Set([
  ...POSTER_ALLOWED_SOURCES,
  'pvtkrrx-sport-4k-backdrop'
])
const BAD_TEXT_RE = /\b(?:SPOR\/SPOR|BASK\/BASK|undefined|null|unknown)\b/i
const STALE_VERSION_RE = /paid-python-template|python-template-port|generated-card|sports-card|legacy|2026042[78]-|20260429-(?:sportcult-category-poster|paid-template-classifier)-v1|paid-template-classifier-v1/i
const POSTER_TEXT_PARAMS = ['sport', 'league', 'title', 'detail', 'home', 'away', 'rawTitle']
const SPORTSMETA_BASE_URL = String(process.env.PVTKRRX_SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc').replace(/\/+$/, '')
const REAL_LOGO_VARIANTS = ['homeBadge', 'awayBadge', 'leagueLogo', 'logo', 'poster']

function containsBadText(value = '') {
  return BAD_TEXT_RE.test(String(value || '')) || containsSportsReleaseNoise(value)
}

function posterTextFields(posterUrl = '') {
  try {
    const url = new URL(String(posterUrl || ''))
    return POSTER_TEXT_PARAMS.map((param) => url.searchParams.get(param) || '').filter(Boolean)
  } catch {
    return []
  }
}

function containsBadTextInImagePayload(contentType = '', payload = '') {
  const text = String(payload || '')
  if (/svg\+xml/i.test(contentType)) return containsBadText(text)
  return BAD_TEXT_RE.test(text)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    manifest: '',
    limit: 20,
    catalog: '',
    out: OUT_DIR
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--manifest') args.manifest = argv[++index] || ''
    else if (arg.startsWith('--manifest=')) args.manifest = arg.slice('--manifest='.length)
    else if (arg === '--limit') args.limit = Number(argv[++index] || 20) || 20
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || 20
    else if (arg === '--catalog') args.catalog = argv[++index] || ''
    else if (arg.startsWith('--catalog=')) args.catalog = arg.slice('--catalog='.length)
    else if (arg === '--out') args.out = argv[++index] || OUT_DIR
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
  }
  if (!args.manifest) args.manifest = DEFAULT_MANIFEST
  args.limit = Math.max(1, Math.min(50, args.limit))
  return args
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function resolveManifestBase(manifestUrl) {
  const url = new URL(manifestUrl)
  const manifestPath = url.pathname.replace(/\/manifest\.json$/i, '')
  return {
    origin: url.origin,
    basePath: manifestPath.replace(/\/+$/, ''),
    query: url.search
  }
}

function buildCatalogUrl(manifestUrl, catalog) {
  const base = resolveManifestBase(manifestUrl)
  const type = encodeURIComponent(catalog.type || 'movie')
  const id = encodeURIComponent(catalog.id || '')
  const pathPart = `${base.basePath}/catalog/${type}/${id}.json`
  return `${base.origin}${pathPart}${base.query || ''}`
}

function absoluteUrl(value, manifestUrl) {
  const raw = normalizeSpace(value)
  if (!raw) return ''
  return new URL(raw, manifestUrl).toString()
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

function sportsCatalogs(manifest, onlyCatalog = '') {
  const catalogs = Array.isArray(manifest?.catalogs) ? manifest.catalogs : []
  return catalogs
    .filter((catalog) => {
      const id = String(catalog.id || '')
      const type = String(catalog.type || '')
      if (onlyCatalog && id !== onlyCatalog) return false
      return type === 'sports' || /^pvtkrrx-sports/.test(id) || id.includes('sports')
    })
}

function imageTypeAllowed(contentType = '') {
  return /^image\/(?:png|jpeg|jpg|webp|svg\+xml)/i.test(contentType)
}

function isRealLogoAsset(contentType = '', headers = {}) {
  if (!imageTypeAllowed(contentType)) return false
  const source = String(headers?.['x-sportsmeta-source'] || '').toLowerCase()
  const delivery = String(headers?.['x-sportsmeta-delivery-format'] || '').toLowerCase()
  const assetClass = String(headers?.['x-sportsmeta-asset-class'] || '').toLowerCase()
  const generated = /^true$/i.test(String(headers?.['x-sportsmeta-generated-asset'] || ''))
  if (generated) return false
  if (/default/.test(source) || /default/.test(assetClass)) return false
  if (source === 'canonical-generator' && delivery === 'svg' && assetClass === 'public-canonical-svg') return true
  if (source === 'cached-asset' && delivery === 'raster' && /raster/.test(assetClass)) return true
  if (!source && !delivery && !assetClass) return true
  return false
}

function artworkVariantFromUrl(value = '') {
  const url = String(value || '')
  const match = url.match(/\/sports-artwork\/(?:default|id)\/([^/?#]+)/i)
  return match ? decodeURIComponent(match[1]).toLowerCase() : ''
}

function allowedSourcesForVariant(variant = '') {
  return variant === 'background' || variant === 'landscape'
    ? BACKDROP_ALLOWED_SOURCES
    : POSTER_ALLOWED_SOURCES
}

// Logo provenance tags emitted by the proxy via the
// X-PVTKRRX-Artwork-Logo-Kind header. Anything outside this set is treated
// as fallback by the audit (fail-safe default) so a future pipeline that
// forgets to set the marker will fail this audit, not silently pass it.
const REAL_LOGO_KINDS = new Set(['real-team', 'real-league', 'real-event'])
const FALLBACK_LOGO_KINDS = new Set(['fallback-glyph', 'fallback-backdrop'])

function headersObject(headers) {
  const out = {}
  for (const [key, value] of headers.entries()) out[String(key || '').toLowerCase()] = String(value || '')
  return out
}

function sportsMetaAssetUrl(canonicalId = '', variant = '') {
  const normalizedId = normalizeSpace(canonicalId)
  const normalizedVariant = normalizeSpace(variant)
  if (!normalizedId || !normalizedVariant) return ''
  return `${SPORTSMETA_BASE_URL}/asset/${encodeURIComponent(normalizedVariant)}/${encodeURIComponent(normalizedId)}`
}

function canonicalIdFromMeta(meta = {}) {
  const candidates = [
    meta?.id,
    meta?.sportsArtwork?.canonicalId,
    meta?.sportsMetaResolution?.canonicalId
  ]
  for (const candidate of candidates) {
    const value = normalizeSpace(candidate)
    if (/^sportsmeta:event:/i.test(value)) return value
  }
  return ''
}

function posterQuery(posterUrl = '') {
  try {
    const url = new URL(posterUrl)
    const sportMatch = url.pathname.match(/\/sports-artwork\/default\/[^/]+\/([^/.?#]+)/i)
    return {
      sport: sportMatch ? decodeURIComponent(sportMatch[1]) : normalizeSpace(url.searchParams.get('sport') || ''),
      league: normalizeSpace(url.searchParams.get('league') || ''),
      title: normalizeSpace(url.searchParams.get('title') || ''),
      date: normalizeSpace(url.searchParams.get('date') || ''),
      home: normalizeSpace(url.searchParams.get('home') || ''),
      away: normalizeSpace(url.searchParams.get('away') || ''),
      eventClass: normalizeSpace(url.searchParams.get('eventClass') || '')
    }
  } catch {
    return {}
  }
}

async function resolveCanonicalFromPoster(posterUrl = '') {
  const query = posterQuery(posterUrl)
  if (!query.sport && !query.title && !query.home && !query.away) {
    return { canonicalId: '', reason: 'no_canonical_or_resolvable_query' }
  }
  try {
    const url = new URL(`${SPORTSMETA_BASE_URL}/resolve`)
    url.searchParams.set('recordType', 'event')
    if (query.title) url.searchParams.set('title', query.title)
    if (query.date) url.searchParams.set('date', query.date)
    if (query.sport) url.searchParams.set('sport', query.sport)
    if (query.league) url.searchParams.set('league', query.league)
    if (query.home) url.searchParams.set('home', query.home)
    if (query.away) url.searchParams.set('away', query.away)
    const response = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return { canonicalId: '', reason: `resolve_http_${response.status}` }
    const payload = await response.json()
    const canonicalId = normalizeSpace(payload?.event?.id || payload?.id || '')
    return /^sportsmeta:event:/i.test(canonicalId)
      ? { canonicalId, reason: 'resolved_from_poster_query' }
      : { canonicalId: '', reason: 'resolve_no_match' }
  } catch (error) {
    return { canonicalId: '', reason: `resolve_error_${normalizeSpace(error?.message || error).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}` }
  }
}

async function probeLogoAsset(url = '', role = '') {
  const attempt = {
    role,
    url,
    status: 0,
    contentType: '',
    source: '',
    assetClass: '',
    delivery: '',
    generated: '',
    result: url ? 'pending' : 'missing_url'
  }
  if (!url) return attempt
  try {
    const response = await fetch(url, {
      headers: { accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/*' },
      signal: AbortSignal.timeout(8000)
    })
    attempt.status = response.status
    attempt.contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const headers = headersObject(response.headers)
    attempt.source = headers['x-sportsmeta-source'] || ''
    attempt.assetClass = headers['x-sportsmeta-asset-class'] || ''
    attempt.delivery = headers['x-sportsmeta-delivery-format'] || ''
    attempt.generated = headers['x-sportsmeta-generated-asset'] || ''
    attempt.result = response.ok && isRealLogoAsset(attempt.contentType, headers)
      ? 'real_logo'
      : (response.ok ? 'not_real_logo' : `http_${response.status}`)
  } catch (error) {
    attempt.result = `fetch_error_${normalizeSpace(error?.message || error).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}`
  }
  return attempt
}

async function probeCanonicalLogoAvailability(canonicalId = '') {
  const normalizedId = normalizeSpace(canonicalId)
  if (!normalizedId) {
    return {
      expected: false,
      reason: 'no_canonical_id',
      urls: [],
      attempts: []
    }
  }
  const attempts = await Promise.all(REAL_LOGO_VARIANTS.map((variant) => probeLogoAsset(sportsMetaAssetUrl(normalizedId, variant), variant)))
  const realAttempts = attempts.filter((attempt) => attempt.result === 'real_logo')
  return {
    expected: realAttempts.length > 0,
    reason: realAttempts.length ? `real_logo_available:${realAttempts.map((attempt) => attempt.role).join(',')}` : 'no_real_logo_asset_available',
    urls: realAttempts.map((attempt) => attempt.url).filter(Boolean),
    attempts
  }
}

async function probeRealLogoAvailability(meta = {}, posterUrl = '') {
  const directCanonicalId = canonicalIdFromMeta(meta)
  if (directCanonicalId) {
    return {
      canonicalId: directCanonicalId,
      resolvedBy: 'meta_id',
      ...(await probeCanonicalLogoAvailability(directCanonicalId))
    }
  }
  const resolved = await resolveCanonicalFromPoster(posterUrl)
  if (!resolved.canonicalId) {
    return {
      canonicalId: '',
      resolvedBy: 'none',
      expected: false,
      reason: resolved.reason || 'no_canonical_id',
      urls: [],
      attempts: []
    }
  }
  return {
    canonicalId: resolved.canonicalId,
    resolvedBy: resolved.reason || 'poster_query',
    ...(await probeCanonicalLogoAvailability(resolved.canonicalId))
  }
}

function judgeLogoProvenance(row) {
  // row is mutated in place. Returns the logo-provenance fields so the
  // caller can include them in the per-row console line and audit JSON.
  const logoKind = String(row.logoKind || '').toLowerCase()
  const realLogoLookupAttempted = String(row.realLogoLookupAttempted || '').toLowerCase() === 'true'
  const expectsRealLogo = Boolean(row.realLogoExpected)

  if (!logoKind) {
    row.failures.push('missing_logo_kind_header')
    return { isRealLogo: false, isFallback: true, isUnexpectedFallback: expectsRealLogo, expectsRealLogo }
  }

  const isRealLogo = REAL_LOGO_KINDS.has(logoKind)
  const isFallback = FALLBACK_LOGO_KINDS.has(logoKind)
  if (!isRealLogo && !isFallback) {
    row.failures.push(`unknown_logo_kind_${logoKind}`)
  }

  // The unambiguous failure case: a poster variant for an event class where
  // real logos should be available, with real-logo lookup actually
  // attempted, served a glyph fallback. Backdrop fallback for a poster
  // variant also fails — the poster contract requires identity art, not a
  // sport backdrop.
  const isPosterVariant = row.variant === 'poster' || /\/sports-artwork\/(?:default|id)\/poster/i.test(row.posterUrl || '')
  const isUnexpectedFallback = isFallback && expectsRealLogo && (
    realLogoLookupAttempted || logoKind === 'fallback-glyph' || (logoKind === 'fallback-backdrop' && isPosterVariant)
  )
  if (isUnexpectedFallback) {
    row.failures.push(`unexpected_${logoKind}_real_logo_available`)
  }
  if (isRealLogo && !row.logoSourceUrl && !row.logoSourceUrls) {
    row.failures.push('missing_logo_source_url')
  }
  if (isFallback && !expectsRealLogo && !row.logoFallbackReason) {
    row.failures.push('missing_allowed_fallback_reason')
  }
  return { isRealLogo, isFallback, isUnexpectedFallback, expectsRealLogo }
}

async function inspectPoster({ manifestUrl, catalog, meta, index }) {
  const name = normalizeSpace(meta?.name || meta?.title || '')
  const posterUrl = absoluteUrl(meta?.poster || meta?.posterShape || '', manifestUrl)
  const row = {
    catalogId: catalog.id || '',
    catalogType: catalog.type || '',
    index,
    metaId: meta?.id || '',
    metaName: name,
    classification: meta?.eventClass || meta?.sportsEventClass || meta?.sportsArtwork?.eventClass || '',
    posterUrl,
    status: 0,
    contentType: '',
    source: '',
    variant: artworkVariantFromUrl(posterUrl),
    template: '',
    cacheControl: '',
    cors: '',
    logoKind: '',
    logoFallbackReason: '',
    logoSourceUrl: '',
    logoSourceCount: 0,
    logoSourceUrls: '',
    logoRealCount: 0,
    logoFallbackCount: 0,
    realLogoLookupAttempted: '',
    rendererLogoLookupAttempts: '',
    realLogoExpected: false,
    realLogoExpectedReason: '',
    realLogoExpectedCanonicalId: '',
    realLogoExpectedResolvedBy: '',
    realLogoExpectedUrls: [],
    realLogoExpectedAttempts: [],
    width: 0,
    height: 0,
    failures: []
  }

  if (!posterUrl || !/^https?:\/\//i.test(posterUrl)) {
    row.failures.push('missing_poster_url')
    return row
  }
  if (!posterUrl.includes(EXPECTED_VERSION)) row.failures.push('stale_or_missing_cache_version')
  if (STALE_VERSION_RE.test(posterUrl)) row.failures.push('stale_poster_url')
  if (containsBadText(name) || posterTextFields(posterUrl).some(containsBadText)) row.failures.push('raw_or_bad_text')

  try {
    const logoAvailability = await probeRealLogoAvailability(meta, posterUrl)
    row.realLogoExpected = Boolean(logoAvailability.expected)
    row.realLogoExpectedReason = logoAvailability.reason || ''
    row.realLogoExpectedCanonicalId = logoAvailability.canonicalId || ''
    row.realLogoExpectedResolvedBy = logoAvailability.resolvedBy || ''
    row.realLogoExpectedUrls = logoAvailability.urls || []
    row.realLogoExpectedAttempts = logoAvailability.attempts || []

    const response = await fetch(posterUrl, {
      headers: { accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/*' }
    })
    row.status = response.status
    row.contentType = String(response.headers.get('content-type') || '').toLowerCase()
    row.source = String(response.headers.get('x-pvtkrrx-artwork-source') || '').toLowerCase()
    row.template = String(response.headers.get('x-pvtkrrx-artwork-template') || '')
    row.classification = row.classification || String(response.headers.get('x-pvtkrrx-sports-event-class') || '')
    row.cacheControl = String(response.headers.get('cache-control') || '')
    row.cors = String(response.headers.get('access-control-allow-origin') || '')
    row.logoKind = String(response.headers.get('x-pvtkrrx-logo-kind') || response.headers.get('x-pvtkrrx-artwork-logo-kind') || '').toLowerCase()
    row.logoFallbackReason = String(response.headers.get('x-pvtkrrx-logo-fallback-reason') || response.headers.get('x-pvtkrrx-artwork-logo-fallback-reason') || '')
    row.logoSourceUrl = String(response.headers.get('x-pvtkrrx-logo-source-url') || '')
    row.logoRealCount = Number(response.headers.get('x-pvtkrrx-logo-real-count') || 0) || 0
    row.logoFallbackCount = Number(response.headers.get('x-pvtkrrx-logo-fallback-count') || 0) || 0
    row.logoSourceCount = Number(response.headers.get('x-pvtkrrx-artwork-logo-source-count') || row.logoRealCount || 0) || 0
    row.logoSourceUrls = String(response.headers.get('x-pvtkrrx-logo-source-urls') || response.headers.get('x-pvtkrrx-artwork-logo-source-urls') || '')
    row.realLogoLookupAttempted = String(response.headers.get('x-pvtkrrx-logo-lookup-attempted') || response.headers.get('x-pvtkrrx-artwork-real-logo-lookup-attempted') || '')
    row.rendererLogoLookupAttempts = String(response.headers.get('x-pvtkrrx-logo-lookup-attempts') || '')

    const buffer = Buffer.from(await response.arrayBuffer())
    if (response.status !== 200) row.failures.push(`poster_http_${response.status}`)
    if (!imageTypeAllowed(row.contentType)) row.failures.push(`bad_content_type_${row.contentType || 'missing'}`)
    const allowedSources = allowedSourcesForVariant(row.variant)
    if (row.source && !allowedSources.has(row.source)) row.failures.push(`source_not_allowed_for_${row.variant || 'unknown'}_${row.source}`)
    if (!row.source) row.failures.push('missing_source_header')
    if (/generated-card|sports-card|legacy-default/i.test(row.source)) row.failures.push('legacy_source_header')
    if (containsBadTextInImagePayload(row.contentType, buffer.slice(0, Math.min(buffer.length, 32768)).toString('utf8'))) row.failures.push('bad_text_in_image_payload')
    if (row.realLogoExpected && REAL_LOGO_KINDS.has(row.logoKind) && row.logoRealCount < 1 && !row.logoSourceUrl && !row.logoSourceUrls) {
      row.failures.push('real_logo_marker_without_source')
    }

    if (imageTypeAllowed(row.contentType) && buffer.length > 0) {
      const metadata = await sharp(buffer).metadata()
      row.width = Number(metadata.width || 0)
      row.height = Number(metadata.height || 0)
      if (!row.width || !row.height) row.failures.push('missing_dimensions')
      if (row.height && row.width && row.height < row.width && /poster/i.test(posterUrl)) row.failures.push('poster_not_portrait')
    }
  } catch (error) {
    row.failures.push(`poster_fetch_failed_${normalizeSpace(error.message).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}`)
  }

  // Real-logo verifier: counts real vs fallback and marks unexpected glyph
  // fallback as a failure. This is the new gate.
  const provenance = judgeLogoProvenance(row)
  row.logoProvenance = provenance
  return row
}

async function main() {
  const args = parseArgs()
  fs.mkdirSync(args.out, { recursive: true })

  const manifest = await fetchJson(args.manifest)
  const catalogs = sportsCatalogs(manifest, args.catalog)
  if (!catalogs.length) throw new Error(`No sports catalogs found in manifest ${args.manifest}`)

  const rows = []
  const catalogSummaries = []
  for (const catalog of catalogs) {
    const catalogUrl = buildCatalogUrl(args.manifest, catalog)
    let metas = []
    let catalogError = ''
    try {
      const payload = await fetchJson(catalogUrl)
      metas = Array.isArray(payload?.metas) ? payload.metas.slice(0, args.limit) : []
    } catch (error) {
      catalogError = error.message
    }
    catalogSummaries.push({
      catalogId: catalog.id || '',
      catalogType: catalog.type || '',
      catalogName: catalog.name || '',
      catalogUrl,
      sampled: metas.length,
      error: catalogError
    })
    if (catalogError) {
      rows.push({
        catalogId: catalog.id || '',
        catalogType: catalog.type || '',
        index: 0,
        metaId: '',
        metaName: '',
        classification: '',
        posterUrl: '',
        status: 0,
        contentType: '',
        source: '',
        template: '',
        width: 0,
        height: 0,
        failures: [`catalog_fetch_failed_${catalogError.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}`]
      })
      continue
    }

    for (let index = 0; index < metas.length; index += 1) {
      rows.push(await inspectPoster({ manifestUrl: args.manifest, catalog, meta: metas[index], index: index + 1 }))
    }
  }

  // Real-logo verifier counters — computed from per-row logoProvenance.
  // realLogoCount      = posters that used a verified real logo
  // fallbackGlyphCount = posters that used a generated initials/glyph
  // fallbackBackdropCount = posters that used a sport backdrop (acceptable
  //                         for background/landscape variants, NOT for posters)
  // fallbackAllowedCount = fallback rows where real logo wasn't expected
  // fallbackUnexpectedCount = fallback rows where real logo SHOULD have been used
  const realLogoCount = rows.filter((row) => row.logoProvenance?.isRealLogo).length
  const fallbackGlyphCount = rows.filter((row) => String(row.logoKind || '').toLowerCase() === 'fallback-glyph').length
  const fallbackBackdropCount = rows.filter((row) => String(row.logoKind || '').toLowerCase() === 'fallback-backdrop').length
  const fallbackAllowedCount = rows.filter((row) => row.logoProvenance?.isFallback && !row.logoProvenance?.isUnexpectedFallback).length
  const unexpectedFallbackCount = rows.filter((row) => row.logoProvenance?.isUnexpectedFallback).length

  const summary = {
    manifest: args.manifest,
    expectedVersion: EXPECTED_VERSION,
    catalogCount: catalogs.length,
    sampled: rows.length,
    totalPostersSampled: rows.length,
    realLogoCount,
    fallbackGlyphCount,
    fallbackBackdropCount,
    fallbackAllowedCount,
    fallbackUnexpectedCount: unexpectedFallbackCount,
    failures: rows.reduce((total, row) => total + row.failures.length, 0),
    sources: rows.reduce((acc, row) => {
      const key = row.source || 'missing'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    classes: rows.reduce((acc, row) => {
      const key = row.classification || 'missing'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    logoKinds: rows.reduce((acc, row) => {
      const key = row.logoKind || 'missing'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    realLogoVerifier: {
      total: rows.length,
      realLogoCount,
      fallbackGlyphCount,
      fallbackBackdropCount,
      fallbackAllowedCount,
      unexpectedFallbackCount
    }
  }

  const output = { summary, catalogSummaries, rows }
  fs.writeFileSync(path.join(args.out, 'audit.json'), JSON.stringify(output, null, 2))

  for (const row of rows) {
    const status = row.failures.length ? 'FAIL' : 'PASS'
    console.log([
      status,
      `catalog=${row.catalogId}`,
      `index=${row.index}`,
      `id=${row.metaId}`,
      `name=${row.metaName}`,
      `class=${row.classification || 'missing'}`,
      `status=${row.status}`,
      `type=${row.contentType || 'missing'}`,
      `source=${row.source || 'missing'}`,
      `logoKind=${row.logoKind || 'missing'}`,
      `realExpected=${row.realLogoExpected ? 'yes' : 'no'}`,
      `logoReal=${row.logoRealCount || 0}`,
      `logoFallback=${row.logoFallbackCount || 0}`,
      row.logoFallbackReason ? `logoReason=${row.logoFallbackReason}` : '',
      `dims=${row.width || 0}x${row.height || 0}`,
      `poster=${row.posterUrl}`,
      row.failures.length ? `failures=${row.failures.join(',')}` : ''
    ].filter(Boolean).join(' | '))
  }

  console.log(`PVTKRRX sports poster audit summary: ${JSON.stringify(summary)}`)
  console.log(`auditJson=${path.join(args.out, 'audit.json')}`)
  console.log(
    `PVTKRRX real-logo verifier: total=${rows.length} realLogoCount=${realLogoCount} fallbackGlyphCount=${fallbackGlyphCount} fallbackBackdropCount=${fallbackBackdropCount} fallbackAllowedCount=${fallbackAllowedCount} unexpectedFallbackCount=${unexpectedFallbackCount}`
  )

  if (summary.failures > 0 || unexpectedFallbackCount > 0) {
    process.exitCode = 1
  }
}

main()
  .then(() => {
    if (process.exitCode) process.exit(process.exitCode)
  })
  .catch((error) => {
    console.error(error?.stack || error)
    process.exit(1)
  })
