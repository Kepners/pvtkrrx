const sharp = require('sharp')
const crypto = require('crypto')
const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  buildSportsMetaMemberAssetUrl,
  getPublicSportsMetaBaseUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')
const {
  buildArtworkInputFromRequest,
  renderSportsArtworkSvg
} = require('../utils/sportsCardArtwork')
const {
  readSportsArtworkDiskCache,
  writeSportsArtworkDiskCache
} = require('../utils/sportsArtworkDiskCache')

const VARIANT_DIMENSIONS = {
  poster: { width: 600, height: 900 },
  background: { width: 1920, height: 1080 },
  landscape: { width: 1280, height: 720 },
  logo: { width: 512, height: 512 }
}

const ALLOWED_VARIANTS = new Set(Object.keys(VARIANT_DIMENSIONS))
const LOCAL_ARTWORK_RENDER_VERSION = '20260428-visual-v5'

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
const canonicalEventCache = new Map()
const canonicalEventInFlight = new Map()

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
  const headers = {}
  for (const [key, value] of response.headers.entries()) {
    headers[String(key || '').toLowerCase()] = String(value || '')
  }
  return { status: response.status, contentType, buffer, headers }
}

async function rasterizeToPng(buffer, variant) {
  const { width, height } = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  return sharp(buffer, { density: 192 })
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function readRasterDimensions(buffer) {
  try {
    const metadata = await sharp(buffer).metadata()
    return {
      width: Number(metadata.width || 0),
      height: Number(metadata.height || 0)
    }
  } catch (_) {
    return { width: 0, height: 0 }
  }
}

function isExpectedRasterLayout(variant, dimensions = {}) {
  const width = Number(dimensions.width || 0)
  const height = Number(dimensions.height || 0)
  if (!width || !height) return false
  const ratio = width / height
  if (variant === 'poster') return height >= width && ratio >= 0.55 && ratio <= 1.05
  if (variant === 'landscape' || variant === 'background') return width > height && ratio >= 1.55 && ratio <= 1.9
  if (variant === 'logo') return ratio >= 0.7 && ratio <= 1.3
  return true
}

function shouldRenderLocalFallbackForSvg(variant) {
  return variant === 'poster' || variant === 'background' || variant === 'landscape'
}

async function renderLocalFallbackPng(variant, fallbackInput = {}) {
  const svg = renderSportsArtworkSvg(fallbackInput, variant)
  return rasterizeToPng(Buffer.from(svg), variant)
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hashString(value = '') {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function colorForLabel(label = '', fallback = '#1f6f50') {
  const palette = ['#123c69', '#0f766e', '#7c2d12', '#1d4ed8', '#7f1d1d', '#365314', '#4c1d95', '#0f172a']
  return palette[hashString(label) % palette.length] || fallback
}

function splitLines(value = '', maxChars = 18, maxLines = 2) {
  const words = normalizeSpace(value).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length > maxLines) lines.length = maxLines
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1] || ''
    lines[maxLines - 1] = last.length > maxChars - 3 ? `${last.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...` : `${last}...`
  }
  return lines
}

function renderTextLines(lines = [], x, y, options = {}) {
  const fontSize = Number(options.fontSize || 30)
  const lineHeight = Number(options.lineHeight || Math.round(fontSize * 1.2))
  const anchor = options.anchor || 'middle'
  const weight = options.weight || 800
  const fill = options.fill || '#f8fafc'
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + (index * lineHeight)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" letter-spacing="0" fill="${fill}">${escapeXml(line)}</text>`
  ).join('\n')
}

function renderTeamSplitBaseSvg(event = {}, variant = 'poster') {
  const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  const width = dims.width
  const height = dims.height
  const portrait = height > width
  const home = normalizeSpace(event.homeTeam)
  const away = normalizeSpace(event.awayTeam)
  const league = normalizeSpace(event.league || event.competition)
  const sport = normalizeSpace(event.sport) || 'Sports'
  const date = normalizeSpace(event.date)
  const leftColor = colorForLabel(home || sport, '#0f766e')
  const rightColor = colorForLabel(away || league || sport, '#123c69')
  const title = home && away ? `${home} vs ${away}` : normalizeSpace(event.title || event.name || 'Sports Event')
  const topBand = Math.round(portrait ? height * 0.135 : height * 0.14)
  const bottomBand = Math.round(portrait ? height * 0.205 : height * 0.22)
  const teamY = Math.round(height - bottomBand + (portrait ? 62 : 70))
  const titleY = Math.round(height - (portrait ? 38 : 42))
  const sportFont = Math.round(portrait ? 26 : Math.max(32, height * 0.05))
  const metaFont = Math.round(portrait ? 20 : Math.max(22, height * 0.032))
  const teamFont = Math.round(portrait ? 33 : Math.max(34, height * 0.055))
  const teamLineHeight = Math.round(teamFont * 1.16)
  const titleFont = Math.round(portrait ? 19 : Math.max(22, height * 0.032))
  const homeLines = splitLines(home || title, portrait ? 14 : 24, 2)
  const awayLines = splitLines(away || league || sport, portrait ? 14 : 24, 2)
  const titleLines = splitLines(title, portrait ? 28 : 58, 2)
  const meta = [league, date].filter(Boolean).join(' | ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="0.48" stop-color="rgba(255,255,255,0.02)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.32)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width / 2}" height="${height}" fill="${leftColor}"/>
  <rect x="${width / 2}" y="0" width="${width / 2}" height="${height}" fill="${rightColor}"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#shade)"/>
  <rect x="${(width / 2) - 5}" y="0" width="10" height="${height}" fill="rgba(0,0,0,0.58)"/>
  <rect x="0" y="0" width="${width}" height="${topBand}" fill="rgba(0,0,0,0.58)"/>
  <rect x="0" y="${height - bottomBand}" width="${width}" height="${bottomBand}" fill="rgba(0,0,0,0.62)"/>
  <text x="${Math.round(width * 0.055)}" y="${Math.round(topBand * 0.42)}" font-family="Arial, Helvetica, sans-serif" font-size="${sportFont}" font-weight="900" letter-spacing="0" fill="#ffffff">${escapeXml(sport)}</text>
  <text x="${Math.round(width * 0.055)}" y="${Math.round(topBand * 0.74)}" font-family="Arial, Helvetica, sans-serif" font-size="${metaFont}" font-weight="700" letter-spacing="0" fill="#dbeafe">${escapeXml(meta || league || 'SportsMeta')}</text>
  ${renderTextLines(homeLines, width * 0.25, teamY, { fontSize: teamFont, lineHeight: teamLineHeight })}
  ${renderTextLines(awayLines, width * 0.75, teamY, { fontSize: teamFont, lineHeight: teamLineHeight })}
  ${renderTextLines(titleLines, width / 2, titleY, { fontSize: titleFont, lineHeight: Math.round(titleFont * 1.25), weight: 700, fill: '#cbd5e1' })}
</svg>`
}

function renderTeamSplitOverlaySvg(variant = 'poster') {
  const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  const width = dims.width
  const height = dims.height
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="${Math.round(height * 0.51)}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${Math.round(width * 0.17)}" font-weight="900" letter-spacing="0" stroke="#000000" stroke-width="12" stroke-linejoin="round" fill="#ffffff">V</text>
</svg>`
}

async function loadCanonicalEvent(canonicalId = '', sportsmetaBaseUrl = '') {
  const id = normalizeSpace(canonicalId)
  if (!id) return null
  const base = getPublicSportsMetaBaseUrl(sportsmetaBaseUrl)
  const url = `${base}/event/${encodeURIComponent(id)}`
  const now = Date.now()
  const hit = canonicalEventCache.get(url)
  if (hit && hit.expiresAt > now) return hit.value
  if (canonicalEventInFlight.has(url)) return canonicalEventInFlight.get(url)

  const pending = (async () => {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const payload = await response.json()
    const event = payload?.event || {}
    const assets = payload?.assets || {}
    if (!event?.id) return null
    return {
      event: {
        id: normalizeSpace(event.id),
        title: normalizeSpace(event.title || event.name),
        name: normalizeSpace(event.name || event.title),
        sport: normalizeSpace(event.sport),
        league: normalizeSpace(event.league),
        date: normalizeSpace(event.date),
        homeTeam: normalizeSpace(event.homeTeam),
        awayTeam: normalizeSpace(event.awayTeam)
      },
      assets: {
        homeBadge: normalizeSpace(assets.homeBadge),
        awayBadge: normalizeSpace(assets.awayBadge)
      }
    }
  })()
    .then((value) => {
      canonicalEventCache.set(url, { value, expiresAt: Date.now() + RASTER_CACHE_TTL_MS })
      while (canonicalEventCache.size > RASTER_CACHE_MAX_KEYS) {
        const oldestKey = canonicalEventCache.keys().next().value
        if (!oldestKey) break
        canonicalEventCache.delete(oldestKey)
      }
      return value
    })
    .finally(() => canonicalEventInFlight.delete(url))

  canonicalEventInFlight.set(url, pending)
  return pending
}

function buildCanonicalBadgeUrl({ sportsmetaBaseUrl = '', memberToken = '', canonicalId = '', variant = '', fallbackUrl = '' } = {}) {
  if (memberToken) {
    const memberUrl = buildSportsMetaMemberAssetUrl(sportsmetaBaseUrl, memberToken, variant, canonicalId)
    if (memberUrl) return memberUrl
  }
  return normalizeSpace(fallbackUrl) || buildSportsMetaAssetUrl(sportsmetaBaseUrl, variant, canonicalId)
}

async function fetchBadgePng(url = '', size = 210) {
  const targetUrl = normalizeSpace(url)
  if (!targetUrl) return null
  try {
    const response = await fetch(targetUrl, {
      headers: { accept: 'image/png,image/jpeg,image/svg+xml,image/*' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return sharp(buffer, { density: 192 })
      .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  } catch (_) {
    return null
  }
}

async function renderTeamBadgeArtworkPng({ canonicalId = '', sportsmetaBaseUrl = '', memberToken = '', variant = 'poster' } = {}) {
  const canonical = await loadCanonicalEvent(canonicalId, sportsmetaBaseUrl)
  const event = canonical?.event || {}
  if (!event.homeTeam || !event.awayTeam) return null

  const homeBadgeUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    memberToken,
    canonicalId,
    variant: 'homeBadge',
    fallbackUrl: canonical?.assets?.homeBadge
  })
  const awayBadgeUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    memberToken,
    canonicalId,
    variant: 'awayBadge',
    fallbackUrl: canonical?.assets?.awayBadge
  })

  const normalizedVariant = ['poster', 'landscape', 'background'].includes(variant) ? variant : 'poster'
  const dims = VARIANT_DIMENSIONS[normalizedVariant] || VARIANT_DIMENSIONS.poster
  const portrait = dims.height > dims.width
  const logoSize = Math.round(Math.min(dims.width * (portrait ? 0.36 : 0.2), dims.height * (portrait ? 0.34 : 0.36), portrait ? 218 : 320))
  const [homeBadge, awayBadge] = await Promise.all([
    fetchBadgePng(homeBadgeUrl, logoSize),
    fetchBadgePng(awayBadgeUrl, logoSize)
  ])
  if (!homeBadge && !awayBadge) return null

  const homeLeft = Math.round((dims.width / 4) - (logoSize / 2))
  const awayLeft = Math.round((dims.width * 0.75) - (logoSize / 2))
  const topBand = Math.round(portrait ? dims.height * 0.135 : dims.height * 0.14)
  const bottomBand = Math.round(portrait ? dims.height * 0.205 : dims.height * 0.22)
  const logoTop = Math.round(topBand + (((dims.height - topBand - bottomBand) - logoSize) / 2))
  const composites = []
  if (homeBadge) composites.push({ input: homeBadge, left: homeLeft, top: logoTop })
  if (awayBadge) composites.push({ input: awayBadge, left: awayLeft, top: logoTop })
  composites.push({ input: Buffer.from(renderTeamSplitOverlaySvg(normalizedVariant)), left: 0, top: 0 })

  return sharp(Buffer.from(renderTeamSplitBaseSvg(event, normalizedVariant)))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function renderLayoutFallback({ variant, fallbackInput = {}, teamPosterContext = {}, status = 0, contentType = '', reason = 'sportsmeta_layout_replaced' } = {}) {
  if (['poster', 'landscape', 'background'].includes(variant) && teamPosterContext?.canonicalId) {
    const teamPoster = await renderTeamBadgeArtworkPng({
      canonicalId: teamPosterContext.canonicalId,
      sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
      memberToken: teamPosterContext.memberToken,
      variant
    })
    if (teamPoster) {
      return {
        buffer: teamPoster,
        contentType: 'image/png',
        selectedArtworkSource: `pvtkrrx-team-badge-${variant}`,
        fallbackReason: `${reason}_with_team_badges`,
        httpStatus: status,
        upstreamContentType: contentType
      }
    }
  }

  const png = await renderLocalFallbackPng(variant, fallbackInput)
  return {
    buffer: png,
    contentType: 'image/png',
    selectedArtworkSource: 'pvtkrrx-generated-card',
    fallbackReason: reason,
    httpStatus: status,
    upstreamContentType: contentType
  }
}

async function loadRaster(cacheKey, upstreamUrl, variant, fallbackInput = {}, teamPosterContext = {}) {
  const now = Date.now()
  const hit = rasterCache.get(cacheKey)
  if (hit && hit.expiresAt > now) return { ...hit.value, cacheLayer: hit.value.cacheLayer || 'memory' }
  if (rasterInFlight.has(cacheKey)) return rasterInFlight.get(cacheKey)

  const diskHit = await readSportsArtworkDiskCache(cacheKey)
  if (diskHit) {
    rasterCache.set(cacheKey, {
      value: diskHit,
      expiresAt: Date.now() + RASTER_CACHE_TTL_MS
    })
    trimCache()
    return diskHit
  }

  const pending = (async () => {
    try {
      const { status, contentType, buffer, headers } = await fetchUpstream(upstreamUrl)
      const generatedAsset = /^true$/i.test(String(headers?.['x-sportsmeta-generated-asset'] || ''))
      if (['poster', 'landscape', 'background'].includes(variant) && (generatedAsset || /^image\/svg\+xml/i.test(contentType)) && teamPosterContext?.canonicalId) {
        const teamPosterFallback = await renderLayoutFallback({
          variant,
          fallbackInput,
          teamPosterContext,
          status,
          contentType,
          reason: generatedAsset ? 'sportsmeta_generated_replaced' : 'sportsmeta_svg_replaced'
        })
        if (teamPosterFallback.selectedArtworkSource !== 'pvtkrrx-generated-card') return teamPosterFallback
      }
      if (/^image\/(png|jpeg|jpg|webp)/i.test(contentType)) {
        const dimensions = await readRasterDimensions(buffer)
        if (!isExpectedRasterLayout(variant, dimensions) && shouldRenderLocalFallbackForSvg(variant)) {
          return renderLayoutFallback({
            variant,
            fallbackInput,
            teamPosterContext,
            status,
            contentType,
            reason: `sportsmeta_${variant}_raster_layout_replaced`
          })
        }
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
      const cachedValue = { ...value, cacheLayer: value.cacheLayer || 'rendered' }
      rasterCache.set(cacheKey, { value: cachedValue, expiresAt: Date.now() + RASTER_CACHE_TTL_MS })
      trimCache()
      writeSportsArtworkDiskCache(cacheKey, cachedValue, {
        ttlMs: RASTER_CACHE_TTL_MS,
        maxEntries: RASTER_CACHE_MAX_KEYS
      }).catch(() => {})
      return cachedValue
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

async function sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput, teamPosterContext }) {
  if (!upstreamUrl) {
    res.status(400).type('text/plain').send('invalid sports artwork request')
    return
  }
  try {
    const result = await loadRaster(cacheKey, upstreamUrl, variant, fallbackInput, teamPosterContext)
    const { buffer, contentType } = result
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000')
    res.setHeader('X-PVTKRRX-Artwork-Upstream', redactUrl(upstreamUrl))
    res.setHeader('X-PVTKRRX-Artwork-Source', result.selectedArtworkSource || 'unknown')
    res.setHeader('X-PVTKRRX-Artwork-Cache', result.cacheLayer || 'rendered')
    if (result.fallbackReason) res.setHeader('X-PVTKRRX-Artwork-Fallback', result.fallbackReason)
    console.log(
      `[sports-artwork] selectedArtworkSource=${result.selectedArtworkSource || 'unknown'} variant=${variant} cache=${result.cacheLayer || 'rendered'} artworkUrl=${redactUrl(upstreamUrl)} fallbackReason=${result.fallbackReason || ''} httpStatus=${result.httpStatus || ''} contentType=${result.upstreamContentType || contentType || ''}`
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
    LOCAL_ARTWORK_RENDER_VERSION,
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
  return `${LOCAL_ARTWORK_RENDER_VERSION}|id|${variant}|${canonicalId}|${(sportsmetaBaseUrl || '').trim().toLowerCase()}|${tokenFingerprint(memberToken)}`
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
  await sendArtwork(res, {
    cacheKey,
    upstreamUrl,
    variant,
    fallbackInput,
    teamPosterContext: {
      canonicalId,
      sportsmetaBaseUrl,
      memberToken
    }
  })
}

module.exports = {
  handleDefaultSportsArtwork,
  handleCanonicalSportsArtwork,
  ALLOWED_VARIANTS
}
