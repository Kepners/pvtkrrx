const sharp = require('sharp')
const crypto = require('crypto')
const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  buildSportsMetaMemberAssetUrl,
  SportsMetaClient,
  getPublicSportsMetaBaseUrl,
  resolveSportSlug
} = require('../clients/sportsmeta')
const {
  buildArtworkInputFromRequest,
  renderSportSurfaceOutline,
  renderSportsArtworkSvg
} = require('../utils/sportsCardArtwork')
const {
  SPORTS_POSTER_TEMPLATES,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate,
  renderLogoGlyphSvg,
  renderSportsPosterTemplateSvg
} = require('../utils/sportsPosterTemplates')
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
const LOCAL_ARTWORK_RENDER_VERSION = '20260429-template-glyph-fallback-v2'

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

function buildUpstreamUrl({ kind, variant, canonicalId, sport, league, title, date, homeTeam, awayTeam, sportsmetaBaseUrl, memberToken, template }) {
  if (kind === 'id') {
    const centralOptions = {
      template: normalizeSportsPosterTemplate(template),
      logoMode: memberToken ? 'logos' : ''
    }
    if (memberToken) {
      const memberUrl = buildSportsMetaMemberAssetUrl(sportsmetaBaseUrl || '', memberToken, variant, canonicalId, centralOptions)
      if (memberUrl) return memberUrl
    }
    return buildSportsMetaAssetUrl(sportsmetaBaseUrl || '', variant, canonicalId, centralOptions)
  }
  return buildSportsMetaDefaultAssetUrl(sportsmetaBaseUrl || '', variant, sport, league || '', {
    title,
    date,
    homeTeam,
    awayTeam,
    template: normalizeSportsPosterTemplate(template),
    logoMode: memberToken ? 'logos' : ''
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

function buildTemplateFallbackEvent(fallbackInput = {}) {
  return {
    sport: normalizeSpace(fallbackInput.sport),
    league: normalizeSpace(fallbackInput.competition || fallbackInput.league),
    title: normalizeSpace(fallbackInput.eventTitle || fallbackInput.title),
    eventName: normalizeSpace(fallbackInput.eventTitle || fallbackInput.title),
    eventDetail: normalizeSpace(fallbackInput.eventDetail || fallbackInput.detail || fallbackInput.session),
    date: normalizeSpace(fallbackInput.date),
    homeTeam: normalizeSpace(fallbackInput.homeTeam),
    awayTeam: normalizeSpace(fallbackInput.awayTeam),
    seeders: normalizeSpace(fallbackInput.seeders),
    size: normalizeSpace(fallbackInput.size),
    rawTitle: normalizeSpace(fallbackInput.rawTitle),
    source: normalizeSpace(fallbackInput.source || 'fallback')
  }
}

async function renderTemplateFallbackPng(variant, fallbackInput = {}, template = 'ticket-stub') {
  if (!['poster', 'landscape', 'background'].includes(variant)) {
    const svg = renderSportsArtworkSvg(fallbackInput, variant)
    return rasterizeToPng(Buffer.from(svg), variant)
  }

  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  const event = buildTemplateFallbackEvent(fallbackInput)
  const homeColor = colorForLabel(event.homeTeam || event.title || event.league || event.sport, '#0f766e')
  const awayColor = colorForLabel(event.awayTeam || event.league || event.sport, '#123c69')
  const theme = {
    homeColor,
    awayColor,
    accentColor: paperAccentFromHex(readableAccentFromHex(homeColor))
  }
  const hasMatchup = Boolean(event.homeTeam && event.awayTeam)
  const artwork = renderSportsPosterTemplateSvg({
    event,
    variant,
    template: normalizedTemplate,
    theme,
    mode: hasMatchup ? 'matchup' : 'single'
  })
  const composites = []
  for (const slot of artwork.slots || []) {
    const glyphSvg = renderLogoGlyphSvg({
      role: slot.role,
      event,
      theme,
      size: slot.size
    })
    composites.push({
      input: await resizeCompositionBuffer(Buffer.from(glyphSvg), slot.size),
      left: slot.left,
      top: slot.top
    })
  }
  if (artwork.overlay) {
    composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
  }

  return sharp(Buffer.from(artwork.svg))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
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

function clampByte(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(255, Math.round(number)))
}

function rgbToHex(color = {}) {
  return `#${[color.r, color.g, color.b].map((part) => clampByte(part).toString(16).padStart(2, '0')).join('')}`
}

function readableAccentFromHex(hex = '#0f766e') {
  const clean = String(hex || '').replace(/[^a-f0-9]/gi, '')
  if (clean.length !== 6) return '#f5d76e'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b)
  return luminance > 150 ? '#1f2937' : '#f8fafc'
}

function paperAccentFromHex(hex = '#b58b2a') {
  const clean = String(hex || '').replace(/[^a-f0-9]/gi, '')
  if (clean.length !== 6) return '#b58b2a'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b)
  if (luminance > 180) return '#9a6a16'
  if (luminance < 35) return '#9a6a16'
  return `#${clean.toLowerCase()}`
}

async function dominantColorFromImage(buffer, fallback = '#0f766e') {
  if (!buffer) return fallback
  try {
    const stats = await sharp(buffer)
      .resize({ width: 96, height: 96, fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
      .flatten({ background: '#0f172a' })
      .stats()
    return rgbToHex(stats?.dominant || {})
  } catch (_) {
    return fallback
  }
}

function isSportsMetaRealRaster(contentType = '', headers = {}) {
  if (!/^image\/(png|jpeg|jpg|webp)/i.test(String(contentType || ''))) return false
  const source = String(headers?.['x-sportsmeta-source'] || '').toLowerCase()
  const delivery = String(headers?.['x-sportsmeta-delivery-format'] || '').toLowerCase()
  const assetClass = String(headers?.['x-sportsmeta-asset-class'] || '').toLowerCase()
  const generated = /^true$/i.test(String(headers?.['x-sportsmeta-generated-asset'] || ''))
  if (generated) return false
  if (!source && !delivery && !assetClass) return true
  return delivery === 'raster' && source === 'cached-asset' && /raster/.test(assetClass)
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

function renderTeamSplitBaseSvg(event = {}, variant = 'poster', theme = {}) {
  const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  const width = dims.width
  const height = dims.height
  const portrait = height > width
  const home = normalizeSpace(event.homeTeam)
  const away = normalizeSpace(event.awayTeam)
  const league = normalizeSpace(event.league || event.competition)
  const sport = normalizeSpace(event.sport) || 'Sports'
  const date = normalizeSpace(event.date)
  const leftColor = normalizeSpace(theme.homeColor) || colorForLabel(home || sport, '#0f766e')
  const rightColor = normalizeSpace(theme.awayColor) || colorForLabel(away || league || sport, '#123c69')
  const accent = normalizeSpace(theme.accentColor) || '#b58b2a'
  const headerText = normalizeSpace(theme.headerText) || league || sport
  const venue = normalizeSpace(event.venue)
  const time = normalizeSpace(event.time || event.timestamp)
  const round = normalizeSpace(event.round)
  const session = normalizeSpace(event.eventDetail || event.detail || event.session)
  const title = home && away ? `${home} vs ${away}` : normalizeSpace(event.title || event.name || 'Sports Event')
  const titleLines = splitLines(title, portrait ? 25 : 18, 2)
  const metaParts = [round ? `Round ${round}` : '', session, date].filter(Boolean)
  const noteParts = [round ? `Round ${round}` : '', venue, time].filter(Boolean)
  const headerH = Math.round(portrait ? 112 : 118)
  const footerH = Math.round(portrait ? 170 : 118)
  const visualX = Math.round(width * (portrait ? 0.07 : 0.46))
  const visualY = Math.round(portrait ? 166 : 146)
  const visualW = Math.round(width * (portrait ? 0.86 : 0.47))
  const visualH = Math.round(portrait ? 360 : height - visualY - 86)
  const surface = renderSportSurfaceOutline({
    sport,
    competition: league,
    title,
    detail: session,
    x: visualX + Math.round(visualW * 0.05),
    y: visualY + Math.round(visualH * 0.1),
    width: Math.round(visualW * 0.9),
    height: Math.round(visualH * 0.78),
    highlight: '#f8fafc',
    accent,
    text: '#f8fafc',
    opacity: 0.38
  })
  const titleY = portrait ? 612 : 268
  const titleFontSize = portrait ? 49 : 44
  const titleLineHeight = portrait ? 54 : 52
  const homeLabel = splitLines(home, portrait ? 20 : 28, portrait ? 2 : 1)
  const awayLabel = splitLines(away, portrait ? 20 : 28, portrait ? 2 : 1)
  const titleMarkup = renderTextLines(titleLines, portrait ? width * 0.08 : width * 0.07, titleY, {
    anchor: 'start',
    fontSize: titleFontSize,
    lineHeight: titleLineHeight,
    weight: 500,
    fill: '#161616'
  })
  const homeMarkup = renderTextLines(homeLabel, visualX + Math.round(visualW * 0.25), visualY + visualH - (portrait ? 38 : 30), {
    fontSize: portrait ? 17 : 24,
    lineHeight: portrait ? 20 : 28,
    weight: 800,
    fill: '#f8fafc'
  })
  const awayMarkup = renderTextLines(awayLabel, visualX + Math.round(visualW * 0.75), visualY + visualH - (portrait ? 38 : 30), {
    fontSize: portrait ? 17 : 24,
    lineHeight: portrait ? 20 : 28,
    weight: 800,
    fill: '#f8fafc'
  })
  const subtitle = metaParts.join(' | ')
  const story = noteParts.length
    ? `${noteParts.join(', ')}.`
    : [league, sport].filter(Boolean).join(' | ')
  const footerLeft = venue || league || sport
  const footerRight = time || date

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="paper" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="#f4efe4"/>
      <circle cx="2" cy="2" r="0.9" fill="rgba(31,41,55,0.06)"/>
      <circle cx="11" cy="8" r="0.8" fill="rgba(31,41,55,0.045)"/>
      <circle cx="7" cy="15" r="0.7" fill="rgba(31,41,55,0.04)"/>
    </pattern>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="rgba(15,23,42,0.28)"/>
    </pattern>
    <linearGradient id="visualShade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="0.48" stop-color="rgba(255,255,255,0.03)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.38)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#paper)"/>
  <line x1="0" y1="${headerH}" x2="${width}" y2="${headerH}" stroke="#1f2937" stroke-width="${Math.max(2, Math.round(width * 0.003))}"/>
  <text x="${Math.round(width * (portrait ? 0.18 : 0.1))}" y="${Math.round(headerH * 0.46)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 29 : 38}" font-weight="900" letter-spacing="0" fill="#111827">${escapeXml(headerText)}</text>
  <text x="${Math.round(width * (portrait ? 0.18 : 0.1))}" y="${Math.round(headerH * 0.72)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 16 : 21}" font-weight="700" letter-spacing="4" fill="#374151">${escapeXml(sport.toUpperCase())}</text>
  <text x="${Math.round(width * 0.92)}" y="${Math.round(headerH * 0.56)}" text-anchor="end" font-family="Georgia, serif" font-size="${portrait ? 20 : 26}" font-style="italic" fill="${accent}">${escapeXml(date || 'SportsMeta')}</text>
  ${portrait ? '' : `<text x="${Math.round(width * 0.07)}" y="208" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" letter-spacing="5" fill="${accent}">LIVE SPORTS POSTER</text>`}
  <rect x="${visualX}" y="${visualY}" width="${visualW}" height="${visualH}" fill="${leftColor}"/>
  <rect x="${visualX + visualW / 2}" y="${visualY}" width="${visualW / 2}" height="${visualH}" fill="${rightColor}"/>
  <rect x="${visualX}" y="${visualY}" width="${visualW}" height="${visualH}" fill="url(#visualShade)"/>
  <rect x="${visualX}" y="${visualY}" width="${visualW}" height="${visualH}" fill="url(#dots)" opacity="0.42"/>
  <line x1="${visualX + visualW / 2}" y1="${visualY}" x2="${visualX + visualW / 2}" y2="${visualY + visualH}" stroke="rgba(0,0,0,0.5)" stroke-width="${Math.max(4, Math.round(visualW * 0.012))}"/>
  ${surface}
  <rect x="${visualX + 18}" y="${visualY + 20}" width="${Math.round(visualW * 0.26)}" height="${portrait ? 38 : 46}" fill="rgba(17,24,39,0.78)"/>
  <text x="${visualX + 34}" y="${visualY + (portrait ? 46 : 52)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 19 : 26}" font-weight="900" letter-spacing="5" fill="#ffffff">${escapeXml(session ? session.toUpperCase() : 'LIVE')}</text>
  <line x1="${visualX + 22}" y1="${visualY + visualH + (portrait ? 32 : 42)}" x2="${visualX + visualW - 22}" y2="${visualY + visualH + (portrait ? 32 : 42)}" stroke="${accent}" stroke-width="${portrait ? 4 : 5}"/>
  ${homeMarkup}
  ${awayMarkup}
  ${titleMarkup}
  ${subtitle ? `<text x="${portrait ? Math.round(width * 0.08) : Math.round(width * 0.07)}" y="${titleY + (portrait ? 128 : 126)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 18 : 22}" font-weight="800" letter-spacing="6" fill="${accent}">${escapeXml(subtitle.toUpperCase())}</text>` : ''}
  ${story ? `<text x="${portrait ? Math.round(width * 0.08) : Math.round(width * 0.07)}" y="${height - footerH + (portrait ? 28 : 18)}" font-family="Georgia, serif" font-size="${portrait ? 23 : 28}" font-style="italic" fill="#27272a">${escapeXml(splitLines(story, portrait ? 48 : 76, 1)[0] || story)}</text>` : ''}
  <line x1="${Math.round(width * 0.08)}" y1="${height - (portrait ? 98 : 52)}" x2="${Math.round(width * 0.92)}" y2="${height - (portrait ? 98 : 52)}" stroke="${accent}" stroke-width="${portrait ? 3 : 4}"/>
  <text x="${Math.round(width * 0.08)}" y="${height - (portrait ? 46 : 22)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 17 : 22}" font-weight="900" letter-spacing="5" fill="#111827">${escapeXml(footerLeft.toUpperCase())}</text>
  <text x="${Math.round(width * 0.92)}" y="${height - (portrait ? 46 : 22)}" text-anchor="end" font-family="Georgia, serif" font-size="${portrait ? 20 : 25}" font-style="italic" fill="${accent}">${escapeXml(footerRight)}</text>
</svg>`
}

function renderTeamSplitOverlaySvg(variant = 'poster') {
  const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.poster
  const width = dims.width
  const height = dims.height
  const portrait = height > width
  const visualX = Math.round(width * (portrait ? 0.07 : 0.46))
  const visualY = Math.round(portrait ? 166 : 146)
  const visualW = Math.round(width * (portrait ? 0.86 : 0.47))
  const visualH = Math.round(portrait ? 360 : height - visualY - 86)
  const cx = portrait ? width / 2 : visualX + visualW / 2
  const cy = visualY + visualH * 0.52
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${cx}" y="${Math.round(cy)}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${Math.round(Math.min(visualW, visualH) * 0.29)}" font-weight="900" letter-spacing="0" stroke="#000000" stroke-width="${Math.max(9, Math.round(Math.min(visualW, visualH) * 0.035))}" stroke-linejoin="round" fill="#ffffff">V</text>
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
        venue: normalizeSpace(event.venue),
        round: normalizeSpace(event.round),
        time: normalizeSpace(event.time),
        timestamp: normalizeSpace(event.timestamp),
        localDate: normalizeSpace(event.localDate),
        season: normalizeSpace(event.season),
        country: normalizeSpace(event.country),
        homeTeam: normalizeSpace(event.homeTeam),
        awayTeam: normalizeSpace(event.awayTeam)
      },
      assets: {
        homeBadge: normalizeSpace(assets.homeBadge),
        awayBadge: normalizeSpace(assets.awayBadge),
        leagueLogo: normalizeSpace(assets.leagueLogo),
        logo: normalizeSpace(assets.logo)
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

async function fetchCompositionImage(url = '', size = 210, options = {}) {
  const targetUrl = normalizeSpace(url)
  if (!targetUrl) return null
  try {
    const response = await fetch(targetUrl, {
      headers: { accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/*' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const headers = {}
    for (const [key, value] of response.headers.entries()) {
      headers[String(key || '').toLowerCase()] = String(value || '')
    }
    if (options.requireRealRaster && !isSportsMetaRealRaster(contentType, headers)) return null
    const source = Buffer.from(await response.arrayBuffer())
    const buffer = await sharp(source, { density: 192 })
      .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return {
      buffer,
      color: await dominantColorFromImage(source, options.fallbackColor || '#0f766e'),
      contentType,
      headers
    }
  } catch (_) {
    return null
  }
}

async function resizeCompositionBuffer(buffer, size = 210) {
  return sharp(buffer, { density: 192 })
    .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function renderTeamBadgeArtworkPng({ canonicalId = '', sportsmetaBaseUrl = '', memberToken = '', variant = 'poster', template = 'editorial' } = {}) {
  const canonical = await loadCanonicalEvent(canonicalId, sportsmetaBaseUrl)
  const event = canonical?.event || {}
  const hasMatchup = Boolean(event.homeTeam && event.awayTeam)

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
  const leagueLogoUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    memberToken,
    canonicalId,
    variant: 'leagueLogo',
    fallbackUrl: canonical?.assets?.leagueLogo || canonical?.assets?.logo
  })

  const normalizedVariant = ['poster', 'landscape', 'background'].includes(variant) ? variant : 'poster'
  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  const dims = VARIANT_DIMENSIONS[normalizedVariant] || VARIANT_DIMENSIONS.poster
  const portrait = dims.height > dims.width
  const logoSize = Math.round(Math.min(dims.width * (portrait ? 0.42 : 0.22), dims.height * (portrait ? 0.36 : 0.4), portrait ? 260 : 390))
  const leagueLogoSize = Math.round(Math.min(dims.width * (portrait ? 0.42 : 0.22), dims.height * (portrait ? 0.34 : 0.36), portrait ? 260 : 390))
  const [homeBadge, awayBadge, leagueLogo] = await Promise.all([
    hasMatchup ? fetchCompositionImage(homeBadgeUrl, logoSize, { requireRealRaster: true, fallbackColor: colorForLabel(event.homeTeam, '#0f766e') }) : null,
    hasMatchup ? fetchCompositionImage(awayBadgeUrl, logoSize, { requireRealRaster: true, fallbackColor: colorForLabel(event.awayTeam, '#123c69') }) : null,
    fetchCompositionImage(leagueLogoUrl, leagueLogoSize, {
      requireRealRaster: true,
      fallbackColor: '#b58b2a'
    })
  ])
  if (hasMatchup && (!homeBadge?.buffer || !awayBadge?.buffer)) return null
  if (!hasMatchup && !leagueLogo?.buffer) return null

  const theme = {
    homeColor: homeBadge?.color || leagueLogo?.color || colorForLabel(event.homeTeam || event.sport, '#0f766e'),
    awayColor: awayBadge?.color || colorForLabel(event.awayTeam || event.league || event.sport, '#123c69'),
    accentColor: paperAccentFromHex(leagueLogo?.color || homeBadge?.color || readableAccentFromHex(homeBadge?.color))
  }
  const artwork = renderSportsPosterTemplateSvg({
    event,
    variant: normalizedVariant,
    template: normalizedTemplate,
    theme,
    mode: hasMatchup ? 'matchup' : 'single'
  })
  const imageByRole = {
    home: homeBadge,
    away: awayBadge,
    league: leagueLogo
  }
  const composites = []
  for (const slot of artwork.slots || []) {
    const image = imageByRole[slot.role]
    if (!image?.buffer) continue
    composites.push({
      input: await resizeCompositionBuffer(image.buffer, slot.size),
      left: slot.left,
      top: slot.top
    })
  }
  if (artwork.overlay) {
    composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
  }

  return sharp(Buffer.from(artwork.svg))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function renderTeamBadgeArtworkPngLegacy({ canonicalId = '', sportsmetaBaseUrl = '', memberToken = '', variant = 'poster' } = {}) {
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
  const leagueLogoUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    memberToken,
    canonicalId,
    variant: 'leagueLogo',
    fallbackUrl: canonical?.assets?.leagueLogo || canonical?.assets?.logo
  })

  const normalizedVariant = ['poster', 'landscape', 'background'].includes(variant) ? variant : 'poster'
  const dims = VARIANT_DIMENSIONS[normalizedVariant] || VARIANT_DIMENSIONS.poster
  const portrait = dims.height > dims.width
  const logoSize = Math.round(Math.min(dims.width * (portrait ? 0.36 : 0.2), dims.height * (portrait ? 0.34 : 0.36), portrait ? 218 : 320))
  const headerLogoSize = Math.round(Math.min(dims.width * (portrait ? 0.14 : 0.07), dims.height * (portrait ? 0.085 : 0.11), portrait ? 78 : 96))
  const [homeBadge, awayBadge] = await Promise.all([
    fetchCompositionImage(homeBadgeUrl, logoSize, { requireRealRaster: true, fallbackColor: colorForLabel(event.homeTeam, '#0f766e') }),
    fetchCompositionImage(awayBadgeUrl, logoSize, { requireRealRaster: true, fallbackColor: colorForLabel(event.awayTeam, '#123c69') })
  ])
  if (!homeBadge?.buffer || !awayBadge?.buffer) return null

  const leagueLogo = await fetchCompositionImage(leagueLogoUrl, headerLogoSize, {
    requireRealRaster: true,
    fallbackColor: '#b58b2a'
  })

  const visualX = Math.round(dims.width * (portrait ? 0.07 : 0.46))
  const visualY = Math.round(portrait ? 166 : 146)
  const visualW = Math.round(dims.width * (portrait ? 0.86 : 0.47))
  const visualH = Math.round(portrait ? 360 : dims.height - visualY - 86)
  const homeLeft = Math.round(visualX + (visualW * 0.25) - (logoSize / 2))
  const awayLeft = Math.round(visualX + (visualW * 0.75) - (logoSize / 2))
  const logoTop = Math.round(visualY + (visualH * 0.5) - (logoSize / 2))
  const composites = []
  if (leagueLogo?.buffer) {
    composites.push({
      input: leagueLogo.buffer,
      left: Math.round(dims.width * (portrait ? 0.07 : 0.035)),
      top: Math.round(portrait ? 24 : 18)
    })
  }
  composites.push({ input: homeBadge.buffer, left: homeLeft, top: logoTop })
  composites.push({ input: awayBadge.buffer, left: awayLeft, top: logoTop })
  composites.push({ input: Buffer.from(renderTeamSplitOverlaySvg(normalizedVariant)), left: 0, top: 0 })

  return sharp(Buffer.from(renderTeamSplitBaseSvg(event, normalizedVariant, {
    homeColor: homeBadge.color,
    awayColor: awayBadge.color,
    accentColor: paperAccentFromHex(leagueLogo?.color || homeBadge.color || readableAccentFromHex(homeBadge.color))
  })))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function renderLayoutFallback({ variant, fallbackInput = {}, teamPosterContext = {}, template = 'editorial', status = 0, contentType = '', reason = 'sportsmeta_layout_replaced' } = {}) {
  if (['poster', 'landscape', 'background'].includes(variant) && teamPosterContext?.canonicalId) {
    const teamPoster = await renderTeamBadgeArtworkPng({
      canonicalId: teamPosterContext.canonicalId,
      sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
      memberToken: teamPosterContext.memberToken,
      variant,
      template
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

  const png = await renderTemplateFallbackPng(variant, fallbackInput, template)
  return {
    buffer: png,
    contentType: 'image/png',
    selectedArtworkSource: 'pvtkrrx-generated-card',
    fallbackReason: reason,
    httpStatus: status,
    upstreamContentType: contentType
  }
}

async function loadRaster(cacheKey, upstreamUrl, variant, fallbackInput = {}, teamPosterContext = {}, template = 'editorial') {
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
      if (/^image\/(png|jpeg|jpg|webp)/i.test(contentType)) {
        const dimensions = await readRasterDimensions(buffer)
        if (!isExpectedRasterLayout(variant, dimensions) && shouldRenderLocalFallbackForSvg(variant)) {
          return renderLayoutFallback({
            variant,
            fallbackInput,
            teamPosterContext,
            template,
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
        const png = await rasterizeToPng(buffer, variant)
        return {
          buffer: png,
          contentType: 'image/png',
          selectedArtworkSource: generatedAsset ? 'sportsmeta-central-rasterized' : 'sportsmeta-svg-rasterized',
          fallbackReason: generatedAsset ? 'sportsmeta_central_svg_rasterized' : 'sportsmeta_svg_rasterized',
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
      const png = await renderTemplateFallbackPng(variant, fallbackInput, template)
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

function resolveSportsPosterTemplateFromConfig(config = {}, req = null) {
  return resolveSportsPosterTemplate(
    req?.query?.template,
    config?.sportsPosterTemplate,
    process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE
  )
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

async function sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput, teamPosterContext, template = 'editorial' }) {
  if (!upstreamUrl) {
    res.status(400).type('text/plain').send('invalid sports artwork request')
    return
  }
  try {
    const normalizedTemplate = normalizeSportsPosterTemplate(template)
    const result = await loadRaster(cacheKey, upstreamUrl, variant, fallbackInput, teamPosterContext, normalizedTemplate)
    const { buffer, contentType } = result
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000')
    res.setHeader('X-PVTKRRX-Artwork-Upstream', redactUrl(upstreamUrl))
    res.setHeader('X-PVTKRRX-Artwork-Source', result.selectedArtworkSource || 'unknown')
    res.setHeader('X-PVTKRRX-Artwork-Cache', result.cacheLayer || 'rendered')
    res.setHeader('X-PVTKRRX-Artwork-Template', normalizedTemplate)
    if (result.fallbackReason) res.setHeader('X-PVTKRRX-Artwork-Fallback', result.fallbackReason)
    console.log(
      `[sports-artwork] selectedArtworkSource=${result.selectedArtworkSource || 'unknown'} variant=${variant} template=${normalizedTemplate} cache=${result.cacheLayer || 'rendered'} artworkUrl=${redactUrl(upstreamUrl)} fallbackReason=${result.fallbackReason || ''} httpStatus=${result.httpStatus || ''} contentType=${result.upstreamContentType || contentType || ''}`
    )
    res.status(200).end(buffer)
  } catch (err) {
    const status = err?.status === 404 ? 404 : 502
    console.warn(`[sports-artwork] proxy failed variant=${variant} upstream=${upstreamUrl}: ${err.message}`)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    res.status(status).type('text/plain').send(status === 404 ? 'sports artwork not found' : 'sports artwork upstream error')
  }
}

function buildDefaultArtworkCacheKey({ variant, template, sportSlug, league, title, date, homeTeam, awayTeam, detail, seeders, size, rawTitle, sportsmetaBaseUrl }) {
  return [
    LOCAL_ARTWORK_RENDER_VERSION,
    'default',
    variant,
    normalizeSportsPosterTemplate(template),
    sportSlug,
    (league || '').trim().toLowerCase(),
    (title || '').trim().toLowerCase(),
    (date || '').trim().toLowerCase(),
    (homeTeam || '').trim().toLowerCase(),
    (awayTeam || '').trim().toLowerCase(),
    (detail || '').trim().toLowerCase(),
    (seeders || '').trim().toLowerCase(),
    (size || '').trim().toLowerCase(),
    (rawTitle || '').trim().toLowerCase(),
    (sportsmetaBaseUrl || '').trim().toLowerCase()
  ].join('|')
}

function buildCanonicalArtworkCacheKey({ variant, template, canonicalId, sportsmetaBaseUrl, memberToken }) {
  return `${LOCAL_ARTWORK_RENDER_VERSION}|id|${variant}|${normalizeSportsPosterTemplate(template)}|${canonicalId}|${(sportsmetaBaseUrl || '').trim().toLowerCase()}|${tokenFingerprint(memberToken)}`
}

async function resolveDefaultArtworkCanonical({
  sportsmetaBaseUrl = '',
  sportSlug = '',
  league = '',
  title = '',
  date = '',
  homeTeam = '',
  awayTeam = '',
  fallbackInput = {}
} = {}) {
  const hasStructuredQuery = Boolean(date && ((homeTeam && awayTeam) || title))
  if (!hasStructuredQuery) return null
  try {
    const client = new SportsMetaClient({ baseUrl: sportsmetaBaseUrl })
    const payload = await client.resolveEvent({
      recordType: 'event',
      sport: sportSlug || fallbackInput.sport,
      league,
      date,
      home: homeTeam || fallbackInput.homeTeam,
      away: awayTeam || fallbackInput.awayTeam,
      event: title || fallbackInput.eventTitle,
      title: title || fallbackInput.eventTitle
    })
    if (!payload?.canonicalId) return null
    return payload
  } catch (error) {
    console.warn(`[sports-artwork] default canonical lookup failed sport=${sportSlug} league="${league}" title="${title}" date="${date}": ${error.message}`)
    return null
  }
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
  const homeTeam = String(req.query?.home || req.query?.homeTeam || '').trim()
  const awayTeam = String(req.query?.away || req.query?.awayTeam || '').trim()
  const seeders = String(req.query?.seeders || '').trim()
  const size = String(req.query?.size || '').trim()
  const rawTitle = String(req.query?.rawTitle || '').trim()
  const source = String(req.query?.source || 'fallback').trim()
  const sportsmetaBaseUrl = resolveSportsmetaBaseUrlFromConfig(config)
  const memberToken = resolveSportsPosterMemberToken(config, req)
  const template = resolveSportsPosterTemplateFromConfig(config, req)
  const upstreamUrl = buildUpstreamUrl({
    kind: 'default',
    variant,
    sport: sportSlug,
    league,
    title,
    date,
    homeTeam,
    awayTeam,
    sportsmetaBaseUrl,
    template
  })
  const fallbackInput = buildArtworkInputFromRequest({
    sport: sportSlug,
    league,
    title,
    date,
    homeTeam,
    awayTeam,
    detail,
    seeders,
    size,
    rawTitle,
    source
  })
  if (detail) fallbackInput.eventDetail = detail
  const canonical = await resolveDefaultArtworkCanonical({
    sportsmetaBaseUrl,
    sportSlug,
    league,
    title,
    date,
    homeTeam,
    awayTeam,
    fallbackInput
  })
  if (canonical?.canonicalId) {
    const canonicalUpstreamUrl = buildUpstreamUrl({
      kind: 'id',
      variant,
      canonicalId: canonical.canonicalId,
      sportsmetaBaseUrl,
      memberToken,
      template
    })
    const canonicalFallbackInput = buildArtworkInputFromRequest({
      canonicalId: canonical.canonicalId,
      sport: canonical.event?.sport || sportSlug,
      league: canonical.event?.league || league,
      title: canonical.event?.title || canonical.event?.name || title,
      date: canonical.event?.date || date,
      homeTeam: canonical.event?.homeTeam || homeTeam,
      awayTeam: canonical.event?.awayTeam || awayTeam,
      seeders,
      size,
      rawTitle,
      source: 'sportsmeta'
    })
    if (detail) canonicalFallbackInput.eventDetail = detail
    const canonicalCacheKey = buildCanonicalArtworkCacheKey({
      variant,
      template,
      canonicalId: canonical.canonicalId,
      sportsmetaBaseUrl,
      memberToken
    })
    await sendArtwork(res, {
      cacheKey: canonicalCacheKey,
      upstreamUrl: canonicalUpstreamUrl,
      variant,
      fallbackInput: canonicalFallbackInput,
      template,
      teamPosterContext: {
        canonicalId: canonical.canonicalId,
        sportsmetaBaseUrl,
        memberToken
      }
    })
    return
  }
  const cacheKey = buildDefaultArtworkCacheKey({ variant, template, sportSlug, league, title, date, homeTeam, awayTeam, detail, seeders, size, rawTitle, sportsmetaBaseUrl })
  await sendArtwork(res, { cacheKey, upstreamUrl, variant, fallbackInput, template })
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
  const template = resolveSportsPosterTemplateFromConfig(config, req)
  const upstreamUrl = buildUpstreamUrl({
    kind: 'id',
    variant,
    canonicalId,
    sportsmetaBaseUrl,
    memberToken,
    template
  })
  const fallbackInput = buildArtworkInputFromRequest({
    canonicalId,
    source: 'sportsmeta'
  })
  const cacheKey = buildCanonicalArtworkCacheKey({ variant, template, canonicalId, sportsmetaBaseUrl, memberToken })
  await sendArtwork(res, {
    cacheKey,
    upstreamUrl,
    variant,
    fallbackInput,
    template,
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
  ALLOWED_VARIANTS,
  SPORTS_POSTER_TEMPLATES
}
