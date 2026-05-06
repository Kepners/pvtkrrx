#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const {
  discoverLocalStremioAuthKeyCandidates
} = require('../src/lib/shared')

const OUT_ROOT = path.join(process.cwd(), '.claude', 'proofs', 'stremio-real-logo-account')
const DEFAULT_LIMIT = 18
const STREMIO_API_BASE = 'https://api.strem.io'

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    limit: DEFAULT_LIMIT,
    out: '',
    manifestUrl: '',
    catalogId: 'pvtkrrx-sports',
    catalogType: 'sports',
    account: true
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--limit') args.limit = Math.max(1, Number(argv[++i] || DEFAULT_LIMIT))
    else if (arg.startsWith('--limit=')) args.limit = Math.max(1, Number(arg.slice('--limit='.length) || DEFAULT_LIMIT))
    else if (arg === '--out') args.out = argv[++i] || ''
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
    else if (arg === '--manifest') {
      args.manifestUrl = argv[++i] || ''
      args.account = false
    } else if (arg.startsWith('--manifest=')) {
      args.manifestUrl = arg.slice('--manifest='.length)
      args.account = false
    } else if (arg === '--catalog-id') args.catalogId = argv[++i] || args.catalogId
    else if (arg.startsWith('--catalog-id=')) args.catalogId = arg.slice('--catalog-id='.length)
  }
  return args
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function sanitizeAddon(addon) {
  if (!addon || typeof addon !== 'object') return null
  const manifest = addon.manifest || {}
  return {
    id: manifest.id || '',
    name: manifest.name || '',
    version: manifest.version || '',
    transportUrl: addon.transportUrl || '',
    catalogs: Array.isArray(manifest.catalogs) ? manifest.catalogs : []
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (_) {}
  return { status: response.status, ok: response.ok, json, text }
}

async function fetchAccountAddons(outDir) {
  const candidates = discoverLocalStremioAuthKeyCandidates()
  const attempts = []
  for (const [index, candidate] of candidates.entries()) {
    try {
      const response = await postJson(`${STREMIO_API_BASE}/api/addonCollectionGet`, {
        authKey: candidate.authKey
      })
      const addons = response.json?.result?.addons
      attempts.push({
        source: candidate.sourceLabel,
        status: response.status,
        addonCount: Array.isArray(addons) ? addons.length : 0
      })
      if (!Array.isArray(addons)) continue
      const pvtkrrx = addons.find((addon) => {
        const manifest = addon?.manifest || {}
        const id = String(manifest.id || '')
        const name = String(manifest.name || '')
        return /pvtkrrx/i.test(id) || /pvtkrrx/i.test(name)
      })
      if (pvtkrrx) {
        const sanitized = {
          attempts,
          selectedSource: candidate.sourceLabel,
          installedAddon: sanitizeAddon(pvtkrrx)
        }
        writeJson(path.join(outDir, 'addonCollectionGet.sanitized.json'), sanitized)
        return sanitized
      }
    } catch (error) {
      attempts.push({
        source: candidate.sourceLabel || `candidate-${index}`,
        status: 'error',
        error: String(error.message || error)
      })
    }
  }
  writeJson(path.join(outDir, 'addonCollectionGet.sanitized.json'), { attempts, installedAddon: null })
  throw new Error('No PVTKRRX addon found in local Stremio account sources')
}

function catalogUrlFromManifest(manifestUrl, catalogType, catalogId) {
  const url = new URL(manifestUrl)
  url.search = ''
  url.hash = ''
  const pathname = url.pathname.replace(/\/manifest\.json$/i, '')
  url.pathname = `${pathname}/catalog/${encodeURIComponent(catalogType)}/${encodeURIComponent(catalogId)}.json`
  return url.toString()
}

function metaUrlFromManifest(manifestUrl, type, id) {
  const url = new URL(manifestUrl)
  url.search = ''
  url.hash = ''
  const pathname = url.pathname.replace(/\/manifest\.json$/i, '')
  url.pathname = `${pathname}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`
  return url.toString()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(60000)
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new Error(`${url} returned non-JSON status=${response.status}: ${text.slice(0, 120)}`)
  }
  return { status: response.status, ok: response.ok, json, text }
}

function headerObject(headers) {
  const out = {}
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()
    if (
      lower.startsWith('x-pvtkrrx') ||
      lower === 'content-type' ||
      lower === 'content-length' ||
      lower === 'cache-control'
    ) {
      out[lower] = value
    }
  }
  return out
}

function summarizeHeaders(headers = {}) {
  return {
    revision: headers['x-pvtkrrx-revision'] || '',
    cacheVersion: headers['x-pvtkrrx-artwork-cache-version'] || '',
    renderVersion: headers['x-pvtkrrx-artwork-render-version'] || '',
    logoKind: headers['x-pvtkrrx-logo-kind'] || headers['x-pvtkrrx-artwork-logo-kind'] || '',
    sourceCount: headers['x-pvtkrrx-logo-source-count'] || headers['x-pvtkrrx-artwork-logo-source-count'] || '',
    fallbackReason: headers['x-pvtkrrx-logo-fallback-reason'] || headers['x-pvtkrrx-artwork-logo-fallback-reason'] || headers['x-pvtkrrx-artwork-fallback'] || '',
    sourceUrl: headers['x-pvtkrrx-logo-source-url'] || '',
    sourceUrls: headers['x-pvtkrrx-logo-source-urls'] || headers['x-pvtkrrx-artwork-logo-source-urls'] || '',
    upstream: headers['x-pvtkrrx-artwork-upstream'] || '',
    cacheLayer: headers['x-pvtkrrx-artwork-cache'] || ''
  }
}

function fileSafeName(value = '') {
  return String(value || 'item')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'item'
}

async function fetchAsset(url, outputPath) {
  if (!url) return null
  const response = await fetch(url, {
    headers: { accept: 'image/png,image/jpeg,image/webp,image/*,*/*' },
    signal: AbortSignal.timeout(90000)
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  mkdirp(path.dirname(outputPath))
  fs.writeFileSync(outputPath, buffer)
  const headers = headerObject(response.headers)
  return {
    status: response.status,
    ok: response.ok,
    url,
    outputPath,
    bytes: buffer.length,
    headers,
    summary: summarizeHeaders(headers)
  }
}

function cacheVersionFromUrl(value = '') {
  if (!value) return ''
  try {
    const url = new URL(value)
    const v = url.searchParams.get('v') || ''
    const artworkV = url.searchParams.get('artworkV') || ''
    if (v && artworkV && v !== artworkV) return `${v}/${artworkV}`
    return v || artworkV
  } catch (_) {
    return ''
  }
}

function expectedLogoKind(meta = {}) {
  const id = String(meta.id || '').toLowerCase()
  const name = String(meta.name || '')
  const poster = String(meta.poster || '')
  let eventClass = ''
  try {
    eventClass = new URL(poster).searchParams.get('eventClass') || ''
  } catch (_) {}
  const text = `${id} ${name} ${poster} ${eventClass}`.toLowerCase()
  if (/\bvs\b|%40|@/.test(text) || /team_vs_team/.test(text)) return 'real-team'
  if (/nba|mlb|nhl|nfl|uefa|champions|europa|epl|motogp|ufc|atp|pga|ipl|afl|nrl|bwf|formula/.test(text)) return 'real-league'
  return 'fallback-glyph'
}

async function buildContactSheet(rows, outPath) {
  const cellW = 180
  const cellH = 270
  const labelH = 34
  const cols = Math.min(6, Math.max(1, rows.length))
  const rowCount = Math.ceil(rows.length / cols)
  const width = cols * cellW
  const height = rowCount * (cellH + labelH)
  const composites = []
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const col = i % cols
    const sheetRow = Math.floor(i / cols)
    const left = col * cellW
    const top = sheetRow * (cellH + labelH)
    const poster = await sharp(row.posterFetch.outputPath)
      .resize(cellW, cellH, { fit: 'cover' })
      .png()
      .toBuffer()
    composites.push({ input: poster, left, top: top + labelH })
    const label = `${row.index}. ${row.posterFetch.summary.logoKind || 'missing'}`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#111827"/><text x="8" y="14" font-family="Arial,sans-serif" font-size="10" fill="#ffffff">${escapeXml(label)}</text><text x="8" y="28" font-family="Arial,sans-serif" font-size="9" fill="#cbd5e1">${escapeXml(row.meta.name).slice(0, 32)}</text></svg>`
    composites.push({ input: Buffer.from(svg), left, top })
  }
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 20, b: 22 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function extensionForFetch(fetchResult, fallback = 'png') {
  const contentType = String(fetchResult?.headers?.['content-type'] || '').toLowerCase()
  if (/jpeg|jpg/.test(contentType)) return 'jpg'
  if (/webp/.test(contentType)) return 'webp'
  return fallback
}

async function main() {
  const args = parseArgs()
  const outDir = path.resolve(args.out || path.join(OUT_ROOT, stamp()))
  mkdirp(outDir)
  mkdirp(path.join(outDir, 'posters-exact'))
  mkdirp(path.join(outDir, 'backgrounds-exact'))
  mkdirp(path.join(outDir, 'logos-exact'))

  let installedManifestUrl = args.manifestUrl
  let accountProof = null
  if (args.account) {
    accountProof = await fetchAccountAddons(outDir)
    installedManifestUrl = accountProof?.installedAddon?.transportUrl || ''
  }
  if (!installedManifestUrl) throw new Error('Missing installed manifest URL')

  const manifestFetch = await fetchJson(installedManifestUrl)
  writeJson(path.join(outDir, 'manifest.exact.json'), manifestFetch.json)
  const catalog = (manifestFetch.json.catalogs || []).find((item) => item.type === args.catalogType && item.id === args.catalogId) ||
    (manifestFetch.json.catalogs || []).find((item) => item.type === args.catalogType)
  if (!catalog) throw new Error(`No ${args.catalogType} catalog found in manifest`)
  const catalogUrl = catalogUrlFromManifest(installedManifestUrl, catalog.type, catalog.id)
  fs.writeFileSync(path.join(outDir, 'selected-catalog-url.txt'), `${catalogUrl}\n`)
  const catalogFetch = await fetchJson(catalogUrl)
  writeJson(path.join(outDir, 'catalog.sports.exact.json'), catalogFetch.json)

  const metas = Array.isArray(catalogFetch.json.metas) ? catalogFetch.json.metas.slice(0, args.limit) : []
  const rows = []
  for (const [offset, meta] of metas.entries()) {
    const index = offset + 1
    const safe = `${String(index).padStart(2, '0')}-${fileSafeName(meta.name)}`
    const posterPath = path.join(outDir, 'posters-exact', `${safe}.png`)
    const posterFetch = await fetchAsset(meta.poster, posterPath)
    let backgroundFetch = null
    if (meta.background) {
      const firstBgPath = path.join(outDir, 'backgrounds-exact', `${safe}.bin`)
      const bg = await fetchAsset(meta.background, firstBgPath)
      const bgExt = extensionForFetch(bg, 'jpg')
      const finalBgPath = path.join(outDir, 'backgrounds-exact', `${safe}.${bgExt}`)
      fs.renameSync(firstBgPath, finalBgPath)
      backgroundFetch = { ...bg, outputPath: finalBgPath }
    }
    let logoFetch = null
    if (meta.logo) {
      const logoPath = path.join(outDir, 'logos-exact', `${safe}.png`)
      logoFetch = await fetchAsset(meta.logo, logoPath)
    }
    let detailFetch = null
    if (index === 1 && meta.id && meta.type) {
      const detailUrl = metaUrlFromManifest(installedManifestUrl, meta.type, meta.id)
      detailFetch = await fetchJson(detailUrl)
      writeJson(path.join(outDir, 'detail.selected-first-meta.exact.json'), detailFetch.json)
      const detailMeta = detailFetch.json?.meta || {}
      if (detailMeta.poster) {
        await fetchAsset(detailMeta.poster, path.join(outDir, 'selected-detail-panel-poster-exact.png'))
      }
      if (detailMeta.logo) {
        await fetchAsset(detailMeta.logo, path.join(outDir, 'selected-detail-panel-logo-exact.png'))
      }
    }
    const row = {
      index,
      meta: {
        id: meta.id || '',
        type: meta.type || '',
        name: meta.name || '',
        poster: meta.poster || '',
        background: meta.background || '',
        logo: meta.logo || ''
      },
      posterVersion: cacheVersionFromUrl(meta.poster),
      backgroundVersion: cacheVersionFromUrl(meta.background),
      logoVersion: cacheVersionFromUrl(meta.logo),
      expectedPosterLogoKind: expectedLogoKind(meta),
      posterFetch,
      logoFetch,
      backgroundFetch,
      detailStatus: detailFetch?.status || null,
      urlLevelCacheBust: {
        posterHasVersion: Boolean(cacheVersionFromUrl(meta.poster)),
        logoHasVersion: Boolean(cacheVersionFromUrl(meta.logo)),
        backgroundHasVersion: Boolean(cacheVersionFromUrl(meta.background))
      }
    }
    rows.push(row)
  }

  await buildContactSheet(rows.filter((row) => row.posterFetch?.outputPath), path.join(outDir, 'contact-sheet-catalog-order.png'))

  const proof = {
    generatedAt: new Date().toISOString(),
    installedManifestUrl,
    catalogUrl,
    installedAddon: accountProof?.installedAddon || null,
    manifestStatus: manifestFetch.status,
    catalogStatus: catalogFetch.status,
    visibleLimit: args.limit,
    visibleMetaCount: rows.length,
    contactSheet: path.join(outDir, 'contact-sheet-catalog-order.png'),
    rows
  }
  writeJson(path.join(outDir, 'visible-meta-proof.json'), proof)

  const summaryLines = [
    '# Stremio Real Logo Account Proof',
    `Generated: ${proof.generatedAt}`,
    `Installed manifest: ${installedManifestUrl}`,
    `Catalog: ${catalogUrl}`,
    `Contact sheet: ${proof.contactSheet}`,
    '',
    '| # | meta.name | poster v | bg v | expected | header logoKind | revision | sourceCount | fallbackReason |',
    '| - | - | - | - | - | - | - | - | - |',
    ...rows.map((row) => {
      const h = row.posterFetch?.summary || {}
      return `| ${row.index} | ${String(row.meta.name || '').replace(/\|/g, '\\|')} | ${row.posterVersion || ''} | ${row.backgroundVersion || ''} | ${row.expectedPosterLogoKind || ''} | ${h.logoKind || ''} | ${h.revision || ''} | ${h.sourceCount || ''} | ${String(h.fallbackReason || '').replace(/\|/g, '/')} |`
    })
  ]
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), `${summaryLines.join('\n')}\n`)

  const failures = rows.filter((row) => {
    const expected = row.expectedPosterLogoKind
    const actual = row.posterFetch?.summary?.logoKind || ''
    if (expected === 'real-team') return actual !== 'real-team'
    if (expected === 'real-league') return !/^real-/.test(actual)
    return false
  })
  console.log(JSON.stringify({
    outDir,
    installedManifestUrl,
    catalogUrl,
    rows: rows.length,
    failures: failures.map((row) => ({
      index: row.index,
      name: row.meta.name,
      expected: row.expectedPosterLogoKind,
      actual: row.posterFetch?.summary?.logoKind || '',
      fallbackReason: row.posterFetch?.summary?.fallbackReason || ''
    }))
  }, null, 2))
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
