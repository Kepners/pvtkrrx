const sharp = require('sharp')
const crypto = require('crypto')
const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  buildSportsMetaMemberAssetUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')
const {
  buildArtworkInputFromRequest,
  renderSportsArtworkSvg
} = require('../utils/sportsCardArtwork')

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

function buildUpstreamUrl({ kind, variant, canonicalId, sport, league, title, date, sportsmetaBaseUrl, memberToken }) {
  if (kind === 'id') {
    if (memberToken) {
      const memberUrl = buildSportsMetaMemberAssetUrl(sportsmetaBaseUrl || '', memberToken, variant, canonicalId)
      if (memberUrl) return memberUrl
    }
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
  return { status: response.status, contentType, buffer }
}

async function rasterizeToPng(buffer, variant) {
  const { width, height } = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  return sharp(buffer, { density: 192 })
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

function shouldRenderLocalFallbackForSvg(variant) {
  return variant === 'poster' || variant === 'background' || variant === 'landscape'
}

async function renderLocalFallbackPng(variant, fallbackInput = {}) {
  const svg = renderSportsArtworkSvg(fallbackInput, variant)
  return rasterizeToPng(Buffer.from(svg), variant)
}

async function loadRaster(cacheKey, upstreamUrl, variant, fallbackInput = {}) {
  const now = Date.now()
  const hit = rasterCache.get(cacheKey)
  if (hit && hit.expiresAt > now) return hit.value
  if (rasterInFlight.has(cacheKey)) return rasterInFlight.get(cacheKey)

  const pending = (async () => {
    try {
      const { status, contentType, buffer } = await fetchUpstream(upstreamUrl)
      if (/^image\/(png|jpeg|jpg|webp)/i.test(contentType)) {
        return {
          buffer,
          contentType,
          selectedArtworkSource: 'sportsmeta-raster',
          fallbackReason: '',
          httpStatus: status,
          upstreamContentType: contentType
        }
      }
      if (/^image\/svg\+xml/i.test(contentType) && shouldRenderLocalFallbackForSvg(variant)) {
        const png = await renderLocalFallbackPng(variant, fallbackInput)
        return {
          buffer: png,
          contentType: 'image/png',
          selectedArtworkSource: 'pvtkrrx-generated-card',
          fallbackReason: 'sportsmeta_svg_layout_replaced',
          httpStatus: status,
          upstreamContentType: contentType
        }
      }
      const png = await rasterizeToPng(buffer, variant)
      return {
        buffer: png,
        contentType: 'image/png',
        selectedArtworkSource: 'sportsmeta-rasterized',
        fallbackReason: /^image\/svg\+xml/i.test(contentType) ? 'sportsmeta_svg_rasterized' : 'sportsmeta_non_raster_rasterized',
        httpStatus: status,
        upstreamContentType: contentType
      }
    } catch (error) {
      if (!shouldRenderLocalFallbackForSvg(variant) && variant !== 'logo') throw error
      const png = await renderLocalFallbackPng(variant, fallbackInput)
      return {
        buffer: png,
        contentType: 'image/png',
        selectedArtworkSource: 'pvtkrrx-generated-card',
        fallbackReason: `upstream_${error?.status || 'error'}`,
        httpStatus: error?.status || 0,
        upstreamContentType: ''
      }
    }
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

function resolveSportsPosterMemberToken(config = {}, req = null) {
  return String(
    req?.query?.token ||
    config?.sportsPosterMemberToken ||
    process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN ||
    process.env.SPORTSMETA_MEMBER_TOKEN ||
    ''
  ).trim()
}

function redactUrl(value) {
  return String(value || '')
    .replace(/\/member\/([^/?#]+)\/asset\//i, '/member/[redacted]/asset/')
    .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
}

function tokenFingerprint(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

async function sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput }) {
  if (!upstreamUrl) {
    res.status(400).type('text/plain').send('invalid sports artwork request')
    return
  }
  try {
    const result = await loadRaster(cacheKey, upstreamUrl, variant, fallbackInput)
    const { buffer, contentType } = result
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000')
    res.setHeader('X-PVTKRRX-Artwork-Upstream', upstreamUrl)
    res.setHeader('X-PVTKRRX-Artwork-Source', result.selectedArtworkSource || 'unknown')
    if (result.fallbackReason) res.setHeader('X-PVTKRRX-Artwork-Fallback', result.fallbackReason)
    console.log(
      `[sports-artwork] selectedArtworkSource=${result.selectedArtworkSource || 'unknown'} variant=${variant} artworkUrl=${redactUrl(upstreamUrl)} fallbackReason=${result.fallbackReason || ''} httpStatus=${result.httpStatus || ''} contentType=${result.upstreamContentType || contentType || ''}`
    )
    res.status(200).end(buffer)
  } catch (err) {
    const status = err?.status === 404 ? 404 : 502
    console.warn(`[sports-artwork] proxy failed variant=${variant} upstream=${upstreamUrl}: ${err.message}`)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    res.status(status).type('text/plain').send(status === 404 ? 'sports artwork not found' : 'sports artwork upstream error')
  }
}

function buildDefaultArtworkCacheKey({ variant, sportSlug, league, title, date, detail, seeders, size, rawTitle, sportsmetaBaseUrl }) {
  return [
    'default',
    variant,
    sportSlug,
    (league || '').trim().toLowerCase(),
    (title || '').trim().toLowerCase(),
    (date || '').trim().toLowerCase(),
    (detail || '').trim().toLowerCase(),
    (seeders || '').trim().toLowerCase(),
    (size || '').trim().toLowerCase(),
    (rawTitle || '').trim().toLowerCase(),
    (sportsmetaBaseUrl || '').trim().toLowerCase()
  ].join('|')
}

function buildCanonicalArtworkCacheKey({ variant, canonicalId, sportsmetaBaseUrl, memberToken }) {
  return `id|${variant}|${canonicalId}|${(sportsmetaBaseUrl || '').trim().toLowerCase()}|${tokenFingerprint(memberToken)}`
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
  const detail = String(req.query?.detail || '').trim()
  const seeders = String(req.query?.seeders || '').trim()
  const size = String(req.query?.size || '').trim()
  const rawTitle = String(req.query?.rawTitle || '').trim()
  const source = String(req.query?.source || 'fallback').trim()
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
  const fallbackInput = buildArtworkInputFromRequest({
    sport: sportSlug,
    league,
    title,
    date,
    detail,
    seeders,
    size,
    rawTitle,
    source
  })
  if (detail) fallbackInput.eventDetail = detail
  const cacheKey = buildDefaultArtworkCacheKey({ variant, sportSlug, league, title, date, detail, seeders, size, rawTitle, sportsmetaBaseUrl })
  await sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput })
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
  const memberToken = resolveSportsPosterMemberToken(config, req)
  const upstreamUrl = buildUpstreamUrl({
    kind: 'id',
    variant,
    canonicalId,
    sportsmetaBaseUrl,
    memberToken
  })
  const fallbackInput = buildArtworkInputFromRequest({
    canonicalId,
    source: 'sportsmeta'
  })
  const cacheKey = buildCanonicalArtworkCacheKey({ variant, canonicalId, sportsmetaBaseUrl, memberToken })
  await sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput })
}

module.exports = {
  handleDefaultSportsArtwork,
  handleCanonicalSportsArtwork,
  ALLOWED_VARIANTS
}
