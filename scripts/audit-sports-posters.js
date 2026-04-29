#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const OUT_DIR = path.join(process.cwd(), '.runtime', 'sports-poster-audit')
const EXPECTED_VERSION = '20260429-paid-template-classifier-v1'
const DEFAULT_MANIFEST = process.env.PVTKRRX_SPORTS_POSTER_AUDIT_MANIFEST ||
  'https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted'
const ALLOWED_SOURCES = new Set([
  'sportsmeta-raster',
  'pvtkrrx-team-badge-poster',
  'pvtkrrx-paid-template',
  'pvtkrrx-emergency-legacy-fallback'
])
const BAD_TEXT_RE = /\b(?:SPOR\/SPOR|BASK\/BASK|undefined|null|unknown|x264|x265|h264|h265|2160p|1080p|720p|WEB-DL|HDTV|REPACK|COMPLETE)\b/i
const STALE_VERSION_RE = /paid-python-template|python-template-port|generated-card|sports-card|legacy|2026042[78]-/i

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
    template: '',
    cacheControl: '',
    cors: '',
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
  if (BAD_TEXT_RE.test(name) || BAD_TEXT_RE.test(posterUrl)) row.failures.push('raw_or_bad_text')

  try {
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

    const buffer = Buffer.from(await response.arrayBuffer())
    if (response.status !== 200) row.failures.push(`poster_http_${response.status}`)
    if (!imageTypeAllowed(row.contentType)) row.failures.push(`bad_content_type_${row.contentType || 'missing'}`)
    if (row.source && !ALLOWED_SOURCES.has(row.source)) row.failures.push(`legacy_or_unknown_source_${row.source}`)
    if (!row.source) row.failures.push('missing_source_header')
    if (/generated-card|sports-card|legacy-default/i.test(row.source)) row.failures.push('legacy_source_header')
    if (BAD_TEXT_RE.test(buffer.slice(0, Math.min(buffer.length, 32768)).toString('utf8'))) row.failures.push('bad_text_in_image_payload')

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

  const summary = {
    manifest: args.manifest,
    expectedVersion: EXPECTED_VERSION,
    catalogCount: catalogs.length,
    sampled: rows.length,
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
    }, {})
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
      `dims=${row.width || 0}x${row.height || 0}`,
      `poster=${row.posterUrl}`,
      row.failures.length ? `failures=${row.failures.join(',')}` : ''
    ].filter(Boolean).join(' | '))
  }

  console.log(`PVTKRRX sports poster audit summary: ${JSON.stringify(summary)}`)
  console.log(`auditJson=${path.join(args.out, 'audit.json')}`)

  if (summary.failures > 0) {
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
