#!/usr/bin/env node

const DEFAULT_MANIFEST_URL = 'https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted'
const REQUEST_TIMEOUT_MS = Math.max(2000, Number(process.env.PVTKRRX_PROBE_TIMEOUT_MS || 15000) || 15000)
const SPORTS_CATALOG_LIMIT = Math.max(1, Number(process.env.PVTKRRX_PROBE_CATALOG_LIMIT || 8) || 8)
const ACCEPTABLE_STREMIO_IMAGE_RE = /^image\/(?:png|jpe?g|webp)(?:\s*;|$)/i

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function decodeMaybe(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch (_) {
    return raw
  }
}

function normalizeText(value) {
  return decodeMaybe(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeManifestUrl() {
  const explicitManifest = String(process.env.PVTKRRX_PROBE_MANIFEST_URL || '').trim()
  if (explicitManifest) return explicitManifest

  const base = stripTrailingSlash(process.env.PVTKRRX_PROBE_BASE_URL || '')
  if (!base) return DEFAULT_MANIFEST_URL
  if (/\/manifest\.json(?:\?|$)/i.test(base)) return base
  return `${base}/manifest.json?mode=hosted`
}

function buildRouteContext(manifestUrl) {
  const parsed = new URL(manifestUrl)
  parsed.hash = ''
  const mode = parsed.searchParams.get('mode') || ''
  const pathname = parsed.pathname.replace(/\/manifest\.json$/i, '')
  const routeBase = `${parsed.origin}${pathname}`.replace(/\/+$/, '')
  const querySuffix = mode ? `?mode=${encodeURIComponent(mode)}` : ''
  return {
    manifestUrl: parsed.toString(),
    installedManifestBaseUrl: routeBase,
    querySuffix
  }
}

function routeUrl(routeBase, routeName, type, id, querySuffix) {
  return `${routeBase}/${routeName}/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json${querySuffix || ''}`
}

function catalogUrl(routeBase, type, id, querySuffix, extra = '') {
  const extraPath = extra ? `/${extra}` : ''
  return `${routeBase}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extraPath}.json${querySuffix || ''}`
}

async function fetchTimed(url, options = {}) {
  const start = Date.now()
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
    const ms = Date.now() - start
    return { response, ms, error: null }
  } catch (error) {
    return { response: null, ms: Date.now() - start, error }
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJson(url, label) {
  const result = await fetchTimed(url, {
    accept: 'application/json'
  })
  if (result.error) {
    return {
      ok: false,
      status: 0,
      ms: result.ms,
      error: `${label} request failed: ${result.error.message}`,
      json: null
    }
  }

  const response = result.response
  const text = await response.text()
  let json = null
  let parseError = ''
  try {
    json = text ? JSON.parse(text) : null
  } catch (error) {
    parseError = error.message
  }

  return {
    ok: response.ok && !parseError,
    status: response.status,
    ms: result.ms,
    contentType: String(response.headers.get('content-type') || ''),
    error: parseError ? `${label} JSON parse failed: ${parseError}` : '',
    json,
    text
  }
}

async function checkImageUrl(url) {
  const target = String(url || '').trim()
  if (!target) {
    return {
      url: '',
      status: 0,
      ms: 0,
      contentType: '',
      ok200: false,
      acceptableContentType: false,
      error: 'missing_url'
    }
  }

  if (/^data:/i.test(target) || /^file:/i.test(target)) {
    return {
      url: target,
      status: 0,
      ms: 0,
      contentType: '',
      ok200: false,
      acceptableContentType: false,
      error: 'unsupported_url_scheme'
    }
  }

  const result = await fetchTimed(target, {
    method: 'GET',
    accept: 'image/png,image/jpeg,image/webp,image/*',
    timeoutMs: REQUEST_TIMEOUT_MS
  })
  if (result.error) {
    return {
      url: target,
      status: 0,
      ms: result.ms,
      contentType: '',
      ok200: false,
      acceptableContentType: false,
      error: result.error.message
    }
  }

  const response = result.response
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  return {
    url: target,
    status: response.status,
    ms: result.ms,
    contentType,
    ok200: response.status === 200,
    acceptableContentType: ACCEPTABLE_STREMIO_IMAGE_RE.test(contentType),
    error: ''
  }
}

function streamJsonShape(value) {
  if (!value || typeof value !== 'object') return typeof value
  const root = {}
  for (const [key, rootValue] of Object.entries(value)) {
    if (Array.isArray(rootValue)) {
      root[key] = rootValue.map((entry) => {
        if (!entry || typeof entry !== 'object') return typeof entry
        return Object.fromEntries(
          Object.entries(entry).map(([entryKey, entryValue]) => {
            if (Array.isArray(entryValue)) return [entryKey, 'array']
            if (entryValue && typeof entryValue === 'object') {
              return [
                entryKey,
                Object.fromEntries(Object.keys(entryValue).sort().map((nestedKey) => [nestedKey, typeof entryValue[nestedKey]]))
              ]
            }
            return [entryKey, typeof entryValue]
          })
        )
      })
      continue
    }
    if (rootValue && typeof rootValue === 'object') {
      root[key] = Object.fromEntries(Object.keys(rootValue).sort().map((nestedKey) => [nestedKey, typeof rootValue[nestedKey]]))
      continue
    }
    root[key] = typeof rootValue
  }
  return root
}

function redactStreamJson(value) {
  if (!value || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value, (key, current) => {
    if (/authorization|cookie|token|key|password|secret/i.test(key)) return '[redacted]'
    if (key === 'url' && typeof current === 'string') {
      return current
        .replace(/\/(file|playback)\/[^/?#]+/i, '/$1/[opaque]')
        .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
    }
    return current
  }))
}

function redactUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
    .replace(/\/member\/([^/?#]+)\/asset\//i, '/member/[redacted]/asset/')
    .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
}

function getSportsCatalogs(manifest) {
  return (Array.isArray(manifest?.catalogs) ? manifest.catalogs : [])
    .filter((catalog) => String(catalog?.type || '').toLowerCase() === 'sports')
}

function candidateMatches(meta, needle) {
  if (!needle) return false
  const id = decodeMaybe(meta?.id || '')
  if (id === needle || encodeURIComponent(id) === needle) return true
  const haystack = normalizeText([
    meta?.id,
    meta?.name,
    meta?.description,
    meta?.releaseInfo
  ].filter(Boolean).join(' '))
  const normalizedNeedle = normalizeText(needle)
  return Boolean(normalizedNeedle && haystack.includes(normalizedNeedle))
}

async function findCatalogItem({ routeBase, querySuffix, manifest, needle }) {
  const sportsCatalogs = getSportsCatalogs(manifest)
  const fallbackCatalogs = sportsCatalogs.length > 0
    ? sportsCatalogs
    : [{ id: 'pvtkrrx-sports', type: 'sports' }]
  const limitCatalogs = fallbackCatalogs.slice(0, SPORTS_CATALOG_LIMIT)
  const catalogResults = []

  for (const catalog of limitCatalogs) {
    const url = catalogUrl(routeBase, catalog.type || 'sports', catalog.id || 'pvtkrrx-sports', querySuffix)
    const result = await fetchJson(url, `catalog ${catalog.id}`)
    const metas = Array.isArray(result.json?.metas) ? result.json.metas : []
    catalogResults.push({
      catalog,
      url,
      status: result.status,
      ms: result.ms,
      metas: metas.length
    })
    const match = metas.find((meta) => candidateMatches(meta, needle))
    if (match) {
      return {
        item: match,
        catalogUrl: url,
        catalogStatus: result.status,
        catalogMs: result.ms,
        catalogId: catalog.id || '',
        catalogResults
      }
    }
  }

  const decodedNeedle = decodeMaybe(needle)
  if (/^(sportsmeta:|pvtkrrx:)/i.test(decodedNeedle)) {
    return {
      item: { id: decodedNeedle, type: 'sports' },
      catalogUrl: '',
      catalogStatus: 0,
      catalogMs: 0,
      catalogId: '',
      catalogResults
    }
  }

  return {
    item: null,
    catalogUrl: '',
    catalogStatus: 0,
    catalogMs: 0,
    catalogId: '',
    catalogResults
  }
}

function passFail(value) {
  return value ? 'PASS' : 'FAIL'
}

function isPrivateOrLocalHostname(hostname = '') {
  const host = String(hostname || '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local')) return true
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  const private172 = host.match(/^172\.(\d{1,2})\./)
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31)
}

function streamUrlsArePublicHttps(streams) {
  if (!Array.isArray(streams)) return false
  const urls = []
  for (const stream of streams) {
    if (stream?.url) urls.push(stream.url)
    if (Array.isArray(stream?.rarUrls)) {
      for (const entry of stream.rarUrls) {
        if (Array.isArray(entry) && entry[0]) urls.push(entry[0])
      }
    }
  }
  if (urls.length === 0) return true
  return urls.every((url) => {
    try {
      const parsed = new URL(String(url || ''))
      return parsed.protocol === 'https:' && !isPrivateOrLocalHostname(parsed.hostname)
    } catch (_) {
      return false
    }
  })
}

function printSection(title, value) {
  console.log(`\n${title}`)
  console.log(value)
}

async function main() {
  const needle = String(process.argv.slice(2).join(' ') || '').trim()
  if (!needle) {
    console.error('Usage: npm run probe:sports-item -- "<ITEM_ID_OR_SLUG>"')
    process.exit(2)
  }

  const routeContext = buildRouteContext(normalizeManifestUrl())
  const manifestResult = await fetchJson(routeContext.manifestUrl, 'manifest')
  const manifest = manifestResult.json || {}
  const found = manifestResult.ok
    ? await findCatalogItem({
        routeBase: routeContext.installedManifestBaseUrl,
        querySuffix: routeContext.querySuffix,
        manifest,
        needle
      })
    : { item: null, catalogResults: [] }

  const item = found.item || {}
  const itemId = decodeMaybe(item.id || needle)
  const itemType = String(item.type || 'sports').trim() || 'sports'
  const metaUrl = routeUrl(routeContext.installedManifestBaseUrl, 'meta', itemType, itemId, routeContext.querySuffix)
  const streamUrl = routeUrl(routeContext.installedManifestBaseUrl, 'stream', itemType, itemId, routeContext.querySuffix)
  const metaResult = itemId ? await fetchJson(metaUrl, 'meta') : { ok: false, status: 0, ms: 0, json: null, error: 'missing_item_id' }
  const meta = metaResult.json?.meta || {}
  const posterUrl = String(meta.poster || item.poster || '').trim()
  const backdropUrl = String(meta.background || meta.backgroundImage || item.background || item.backgroundImage || '').trim()
  const posterCheck = await checkImageUrl(posterUrl)
  const backdropCheck = await checkImageUrl(backdropUrl)
  const streamResult = itemId ? await fetchJson(streamUrl, 'stream') : { ok: false, status: 0, ms: 0, json: null, error: 'missing_item_id' }
  const streams = Array.isArray(streamResult.json?.streams) ? streamResult.json.streams : null
  const streamShapeValid = streamResult.status === 200 && Array.isArray(streams)
  const pass = {
    manifestReachable: manifestResult.status === 200 && manifestResult.ok,
    catalogReachable: found.catalogResults?.some((result) => result.status === 200),
    catalogItemResolved: Boolean(found.item?.id || /^(sportsmeta:|pvtkrrx:)/i.test(itemId)),
    posterUrl200: posterCheck.ok200,
    backdropUrl200: backdropCheck.ok200,
    posterContentTypeAcceptable: posterCheck.acceptableContentType,
    backdropContentTypeAcceptable: backdropCheck.acceptableContentType,
    metaRouteValid: metaResult.status === 200 && Boolean(metaResult.json?.meta?.id || metaResult.json?.meta),
    streamRouteValid: streamShapeValid,
    streamResponseTime: streamResult.status === 200 && streamResult.ms < REQUEST_TIMEOUT_MS,
    stremioJsonShapeValid: streamShapeValid,
    streamUrlsPublicHttps: streamUrlsArePublicHttps(streams)
  }
  const overallPass = Object.values(pass).every(Boolean)

  console.log('PVTKRRX sports item probe')
  console.log(`installedManifestUrl=${routeContext.manifestUrl}`)
  console.log(`installedManifestBaseUrl=${routeContext.installedManifestBaseUrl}`)
  console.log(`input=${needle}`)
  console.log(`catalogItemId=${itemId}`)
  console.log(`catalogItemName=${item.name || meta.name || ''}`)
  console.log(`catalogUrl=${found.catalogUrl || '(not found in scanned catalogs)'}`)
  console.log(`metaRouteUrl=${metaUrl}`)
  console.log(`streamRouteUrl=${streamUrl}`)
  console.log(`posterUrl=${redactUrl(posterUrl)}`)
  console.log(`backgroundBackdropUrl=${redactUrl(backdropUrl)}`)
  console.log(`posterStatus=${posterCheck.status} contentType=${posterCheck.contentType || ''} acceptable=${posterCheck.acceptableContentType}`)
  console.log(`backdropStatus=${backdropCheck.status} contentType=${backdropCheck.contentType || ''} acceptable=${backdropCheck.acceptableContentType}`)
  console.log(`streamStatus=${streamResult.status} responseTimeMs=${streamResult.ms}`)
  console.log(`streamCount=${Array.isArray(streams) ? streams.length : 'invalid'}`)

  printSection('catalogScan', JSON.stringify(found.catalogResults || [], null, 2))
  printSection('streamJsonShape', JSON.stringify(streamJsonShape(streamResult.json), null, 2))
  printSection('streamJsonRedacted', JSON.stringify(redactStreamJson(streamResult.json), null, 2))

  console.log('\nPASS/FAIL')
  for (const [key, value] of Object.entries(pass)) {
    console.log(`${key}: ${passFail(value)}`)
  }
  console.log(`overall: ${passFail(overallPass)}`)

  if (manifestResult.error) console.log(`manifestError=${manifestResult.error}`)
  if (metaResult.error) console.log(`metaError=${metaResult.error}`)
  if (streamResult.error) console.log(`streamError=${streamResult.error}`)
  if (posterCheck.error) console.log(`posterError=${posterCheck.error}`)
  if (backdropCheck.error) console.log(`backdropError=${backdropCheck.error}`)

  process.exit(overallPass ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
