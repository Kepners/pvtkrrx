const sharp = require('sharp')
const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')

const VARIANT_DIMENSIONS = {
  poster: { width: 600, height: 900 },
  background: { width: 1920, height: 1080 },
  landscape: { width: 1280, height: 720 },
  logo: { width: 512, height: 512 }
}

const ALLOWED_VARIANTS = new Set(Object.keys(VARIANT_DIMENSIONS))

const UPSTREAM_TIMEOUT_MS = Math.max(
  1500,
  parseInt(process.env.PVTKRRX_SPORTS_ARTWORK_UPSTREAM_TIMEOUT_MS || '5000', 10)
)
const RASTER_CACHE_TTL_MS = Math.max(
  60000,
  parseInt(process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_MS || String(6 * 60 * 60 * 1000), 10)
)
const RASTER_CACHE_MAX_KEYS = Math.max(
  200,
  parseInt(process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_MAX_KEYS || '2000', 10)
)

const rasterCache = new Map()
const rasterInFlight = new Map()

function trimCache() {
  while (rasterCache.size > RASTER_CACHE_MAX_KEYS) {
    const oldestKey = rasterCache.keys().next().value
    if (!oldestKey) break
    rasterCache.delete(oldestKey)
  }
}

function normalizeVariant(value) {
  const v = String(value || '').trim().toLowerCase()
  return ALLOWED_VARIANTS.has(v) ? v : ''
}

function buildUpstreamUrl({ kind, variant, canonicalId, sport, league, title, date, sportsmetaBaseUrl }) {
  if (kind === 'id') {
    return buildSportsMetaAssetUrl(sportsmetaBaseUrl || '', variant, canonicalId)
  }
  return buildSportsMetaDefaultAssetUrl(sportsmetaBaseUrl || '', variant, sport, league || '', {
    title,
    date
  })
}

async function fetchUpstream(url) {
  const response = await fetch(url, {
    headers: { accept: 'image/png,image/jpeg,image/svg+xml,image/*' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  })
  if (!response.ok) {
    const error = new Error(`sportsmeta upstream ${response.status}`)
    error.status = response.status
    throw error
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  const buffer = Buffer.from(await response.arrayBuffer())
  return { contentType, buffer }
}

async function rasterizeToPng(buffer, variant) {
  const { width, height } = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  return sharp(buffer, { density: 192 })
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function loadRaster(cacheKey, upstreamUrl, variant) {
  const now = Date.now()
  const hit = rasterCache.get(cacheKey)
  if (hit && hit.expiresAt > now) return hit.value
  if (rasterInFlight.has(cacheKey)) return rasterInFlight.get(cacheKey)

  const pending = (async () => {
    const { contentType, buffer } = await fetchUpstream(upstreamUrl)
    if (/^image\/(png|jpeg|jpg|webp)/i.test(contentType)) {
      return { buffer, contentType }
    }
    const png = await rasterizeToPng(buffer, variant)
    return { buffer: png, contentType: 'image/png' }
  })()
    .then((value) => {
      rasterCache.set(cacheKey, { value, expiresAt: Date.now() + RASTER_CACHE_TTL_MS })
      trimCache()
      return value
    })
    .finally(() => {
      rasterInFlight.delete(cacheKey)
    })

  rasterInFlight.set(cacheKey, pending)
  return pending
}

function parseCanonicalId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded && decoded !== raw) return decoded
  } catch (_) {}
  return raw
}

function resolveSportsmetaBaseUrlFromConfig(config = {}) {
  return String(config?.sportsmetaBaseUrl || '').trim()
}

async function sendArtwork(res, { cacheKey, upstreamUrl, variant }) {
  if (!upstreamUrl) {
    res.status(400).type('text/plain').send('invalid sports artwork request')
    return
  }
  try {
    const { buffer, contentType } = await loadRaster(cacheKey, upstreamUrl, variant)
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000')
    res.setHeader('X-PVTKRRX-Artwork-Upstream', upstreamUrl)
    res.status(200).end(buffer)
  } catch (err) {
    const status = err?.status === 404 ? 404 : 502
    console.warn(`[sports-artwork] proxy failed variant=${variant} upstream=${upstreamUrl}: ${err.message}`)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    res.status(status).type('text/plain').send(status === 404 ? 'sports artwork not found' : 'sports artwork upstream error')
  }
}

function buildDefaultArtworkCacheKey({ variant, sportSlug, league, title, date, sportsmetaBaseUrl }) {
  return [
    'default',
    variant,
    sportSlug,
    (league || '').trim().toLowerCase(),
    (title || '').trim().toLowerCase(),
    (date || '').trim().toLowerCase(),
    (sportsmetaBaseUrl || '').trim().toLowerCase()
  ].join('|')
}

function buildCanonicalArtworkCacheKey({ variant, canonicalId, sportsmetaBaseUrl }) {
  return `id|${variant}|${canonicalId}|${(sportsmetaBaseUrl || '').trim().toLowerCase()}`
}

async function handleDefaultSportsArtwork(req, res, config = {}) {
  const variant = normalizeVariant(req.params.variant)
  const rawSport = String(req.params.sport || '').replace(/\.png$/i, '')
  const sportSlug = resolveSportSlug(rawSport)
  if (!variant || !sportSlug) {
    res.status(400).type('text/plain').send('invalid sports artwork variant/sport')
    return
  }
  const league = String(req.query?.league || '').trim()
  const title = String(req.query?.title || '').trim()
  const date = String(req.query?.date || '').trim()
  const sportsmetaBaseUrl = resolveSportsmetaBaseUrlFromConfig(config)
  const upstreamUrl = buildUpstreamUrl({
    kind: 'default',
    variant,
    sport: sportSlug,
    league,
    title,
    date,
    sportsmetaBaseUrl
  })
  const cacheKey = buildDefaultArtworkCacheKey({ variant, sportSlug, league, title, date, sportsmetaBaseUrl })
  await sendArtwork(res, { cacheKey, upstreamUrl, variant })
}

async function handleCanonicalSportsArtwork(req, res, config = {}) {
  const variant = normalizeVariant(req.params.variant)
  const rawId = String(req.params.canonicalId || '').replace(/\.png$/i, '')
  const canonicalId = parseCanonicalId(rawId)
  if (!variant || !canonicalId) {
    res.status(400).type('text/plain').send('invalid sports artwork variant/id')
    return
  }
  const sportsmetaBaseUrl = resolveSportsmetaBaseUrlFromConfig(config)
  const upstreamUrl = buildUpstreamUrl({
    kind: 'id',
    variant,
    canonicalId,
    sportsmetaBaseUrl
  })
  const cacheKey = buildCanonicalArtworkCacheKey({ variant, canonicalId, sportsmetaBaseUrl })
  await sendArtwork(res, { cacheKey, upstreamUrl, variant })
}

module.exports = {
  handleDefaultSportsArtwork,
  handleCanonicalSportsArtwork,
  ALLOWED_VARIANTS
}
