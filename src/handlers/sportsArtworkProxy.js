const sharp = require('sharp')
// Pin sharp/libvips to 1 thread per render so libuv can dispatch many small
// poster renders in parallel via UV_THREADPOOL_SIZE instead of 4 renders
// fighting for all cores. Stremio catalog cold-loads request 30-50 posters at
// once; this flip removes the CPU thrash on first-screen paint.
sharp.concurrency(1)
sharp.cache({ memory: 200, files: 0 })

const fs = require('fs')
const path = require('path')
const {
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
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
  layoutFamilyForSportsPosterRender,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate,
  renderLogoGlyphSvg,
  renderSportsPosterTemplateSvg
} = require('../utils/sportsPosterTemplates')
const { classifySportsEvent, hasActualPair } = require('../utils/sportsEventClassifier')
const {
  readSportsArtworkDiskCache,
  writeSportsArtworkDiskCache
} = require('../utils/sportsArtworkDiskCache')
const {
  resolveSportBackdrop,
  resolveSportBackdropBucket
} = require('../utils/sportBackdrops')
const { SPORTS_ARTWORK_PROXY_VERSION } = require('../utils/sportsArtwork')
const {
  ENTITLEMENT_SOURCE,
  verifyStampedSportsPosterEntitlement,
  resolveServerAdminPosterTemplate
} = require('../utils/entitlement')

const VARIANT_DIMENSIONS = {
  poster: { width: 600, height: 900 },
  background: { width: 1920, height: 1080 },
  landscape: { width: 1280, height: 720 },
  logo: { width: 512, height: 512 }
}

const ALLOWED_VARIANTS = new Set(Object.keys(VARIANT_DIMENSIONS))
const LOCAL_ARTWORK_RENDER_VERSION = '20260516-competition-context-v30'

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
const LOGO_ERROR_TTL_MS = Math.max(
  5000,
  parseInt(process.env.PVTKRRX_SPORTS_ARTWORK_LOGO_ERROR_CACHE_MS || '30000', 10)
)

const rasterCache = new Map()
const rasterInFlight = new Map()
const canonicalEventCache = new Map()
const canonicalEventInFlight = new Map()
const inspectAssetCache = new Map()
const inspectAssetInFlight = new Map()
const logoFetchCache = new Map()
const logoFetchInFlight = new Map()
// BUG 3: memoise the SportsMeta /resolve lookup (canonicalId AND negative
// "no match" results) so repeated artwork requests for the same event do not
// re-hit SportsMeta per request. Negative results get a shorter TTL so a
// later upstream ingest is still picked up reasonably soon.
const resolveCanonicalCache = new Map()
const resolveCanonicalInFlight = new Map()
let runtimeRevisionCache

function resolveRuntimeRevision() {
  if (runtimeRevisionCache !== undefined) return runtimeRevisionCache
  runtimeRevisionCache = String(
    process.env.SOURCE_COMMIT ||
    process.env.COOLIFY_GIT_COMMIT ||
    process.env.COOLIFY_COMMIT ||
    process.env.COMMIT_SHA ||
    ''
  ).trim()
  if (!runtimeRevisionCache) {
    try {
      runtimeRevisionCache = fs.readFileSync(path.join(process.cwd(), 'REVISION'), 'utf8').trim()
    } catch {
      runtimeRevisionCache = ''
    }
  }
  if (!runtimeRevisionCache) runtimeRevisionCache = 'unknown'
  return runtimeRevisionCache
}

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

function buildUpstreamUrl({ kind, variant, canonicalId, sport, league, title, date, homeTeam, awayTeam, sportsmetaBaseUrl, template }) {
  if (kind === 'id') {
    const centralOptions = {
      template: normalizeSportsPosterTemplate(template)
    }
    return buildSportsMetaAssetUrl(sportsmetaBaseUrl || '', variant, canonicalId, centralOptions)
  }
  return buildSportsMetaDefaultAssetUrl(sportsmetaBaseUrl || '', variant, sport, league || '', {
    title,
    date,
    homeTeam,
    awayTeam,
    template: normalizeSportsPosterTemplate(template)
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
  const event = {
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
  if (fallbackInput.eventClass) event.eventClass = normalizeSpace(fallbackInput.eventClass)
  return event
}

function failureReason(value = '') {
  return String(value || 'error')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'error'
}

function sourceTitleForAudit(fallbackInput = {}) {
  return normalizeSpace(
    fallbackInput.rawTitle ||
    fallbackInput.eventTitle ||
    fallbackInput.title ||
    fallbackInput.name ||
    fallbackInput.canonicalId ||
    'sports artwork request'
  )
}

function isBackdropVariant(variant) {
  return variant === 'background' || variant === 'landscape'
}

async function readLocalSportBackdropFallback(variant, fallbackInput = {}, reason = 'sportsmeta_backdrop_missing', status = 0, contentType = '', template = '') {
  if (!isBackdropVariant(variant)) return null
  const normalizedTemplate = normalizeSportsPosterTemplate(template || fallbackInput.template || 'ticket-stub')
  const layoutFamily = layoutFamilyForSportsPosterRender(normalizedTemplate, fallbackInput)
  const backdrop = resolveSportBackdrop({
    sport: fallbackInput.sport,
    sportHint: fallbackInput.sport,
    league: fallbackInput.competition || fallbackInput.league,
    title: fallbackInput.eventTitle || fallbackInput.title,
    rawTitle: fallbackInput.rawTitle,
    category: fallbackInput.category,
    source: fallbackInput.source,
    layoutFamily
  })
  if (!backdrop.path) return null
  try {
    const buffer = await fs.promises.readFile(backdrop.path)
    return {
      buffer,
      contentType: 'image/jpeg',
      selectedArtworkSource: 'pvtkrrx-sport-4k-backdrop',
      selectedTemplate: normalizedTemplate,
      layoutFamily,
      eventClass: fallbackInput.eventClass || classifySportsEvent(fallbackInput),
      fallbackReason: reason,
      sportBackdropBucket: backdrop.bucket || resolveSportBackdropBucket(fallbackInput),
      sportBackdropFallbackReason: backdrop.fallbackReason || '',
      // Logo provenance: a backdrop is identity art for a SPORT, not a real
      // logo. Audit treats this as fallback-backdrop (acceptable for
      // background/landscape variants where a wide identity image is the
      // intended outcome) — distinct from fallback-glyph.
      logoKind: 'fallback-backdrop',
      logoSourceUrl: '',
      logoSourceUrls: [],
      logoFallbackReason: reason,
      logoRealCount: 0,
      logoFallbackCount: 1,
      logoSlots: [],
      logoLookupAttempts: [],
      httpStatus: status,
      upstreamContentType: contentType
    }
  } catch (_) {
    return null
  }
}

async function renderEmergencyTemplatePng(variant, fallbackInput = {}, template = 'ticket-stub', error = null) {
  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  const event = buildTemplateFallbackEvent(fallbackInput)
  const eventClass = fallbackInput.eventClass || classifySportsEvent(event)
  event.eventClass = eventClass
  const homeColor = colorForLabel(event.homeTeam || event.title || event.league || event.sport, '#0f766e')
  const awayColor = colorForLabel(event.awayTeam || event.league || event.sport, '#123c69')
  const theme = {
    homeColor,
    awayColor,
    accentColor: paperAccentFromHex(readableAccentFromHex(homeColor))
  }
  const artwork = renderSportsPosterTemplateSvg({
    event,
    variant,
    template: normalizedTemplate,
    theme
  })
  const skipGeneratedSlots = (artwork.layoutFamily || layoutFamilyForSportsPosterRender(normalizedTemplate, event)) === 'COMPETITOR_VS_COMPETITOR'
  const fallbackSlots = skipGeneratedSlots ? [] : (artwork.slots || [])
  const composites = []
  for (const slot of fallbackSlots) {
    // Visible fallback is intentionally plain: it marks unresolved logo data
    // without pretending a league mark is a team badge.
    const glyphSvg = renderLogoGlyphSvg({ role: slot.role, event, theme, size: slot.size })
    if (!glyphSvg) continue
    composites.push({
      input: await resizeCompositionBuffer(Buffer.from(glyphSvg), slot.size, { frame: true }),
      left: slot.left,
      top: slot.top
    })
  }
  if (artwork.overlay) {
    composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
  }
  const title = sourceTitleForAudit(fallbackInput)
  const cause = failureReason(error?.message || error || 'unknown')
  console.warn(`[sports-poster] EMERGENCY_LEGACY_FALLBACK variant=${variant} cause=${cause} title=${title}`)
  const buffer = await sharp(Buffer.from(artwork.svg))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  return {
    buffer,
    selectedArtworkSource: 'pvtkrrx-emergency-legacy-fallback',
    selectedTemplate: normalizedTemplate,
    layoutFamily: layoutFamilyForSportsPosterRender(normalizedTemplate, event),
    eventClass,
    // Emergency fallback always paints initials/glyphs — never a real logo.
    logoKind: 'fallback-glyph',
    logoSourceUrls: [],
    logoFallbackReason: `emergency_${cause}`,
    logoRealCount: 0,
    logoFallbackCount: fallbackSlots.length,
    logoSlots: fallbackSlots.map((slot) => ({
      role: slot.role,
      logoKind: 'fallback-glyph',
      logoFallbackReason: `emergency_${cause}`,
      left: slot.left,
      top: slot.top,
      size: slot.size
    })),
    renderFailure: error?.message || String(error || '')
  }
}

async function renderTemplateFallbackArtwork(variant, fallbackInput = {}, template = 'ticket-stub', logoFallbackReason = 'template_glyph_fallback', logoContext = {}) {
  if (!['poster', 'landscape', 'background'].includes(variant)) {
    const svg = renderSportsArtworkSvg(fallbackInput, variant)
    const title = sourceTitleForAudit(fallbackInput)
    console.warn(`[sports-poster] EMERGENCY_LEGACY_FALLBACK variant=${variant} cause=unsupported_variant title=${title}`)
    return {
      buffer: await rasterizeToPng(Buffer.from(svg), variant),
      selectedArtworkSource: 'pvtkrrx-emergency-legacy-fallback',
      selectedTemplate: normalizeSportsPosterTemplate(template),
      layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
      eventClass: fallbackInput.eventClass || classifySportsEvent(fallbackInput),
      logoKind: 'fallback-glyph',
      logoSourceUrls: [],
      logoFallbackReason: `emergency_unsupported_variant_${variant}`,
      logoRealCount: 0,
      logoFallbackCount: 1,
      logoSlots: []
    }
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
  const eventClass = fallbackInput.eventClass || classifySportsEvent(event)
  event.eventClass = eventClass
  try {
    const artwork = renderSportsPosterTemplateSvg({
      event,
      variant,
      template: normalizedTemplate,
      theme
    })
    const fallbackSlots = artwork.slots || []
    const realLeagueLogo = logoContext?.leagueLogo || logoContext?.logo || null
    const realHomeLogo = logoContext?.homeBadge || null
    const realAwayLogo = logoContext?.awayBadge || null
    const realLogoForSlot = (role = '') => {
      if (role === 'home') return realHomeLogo
      if (role === 'away') return realAwayLogo
      if (['league', 'leagueLogo', 'logo'].includes(role)) return realLeagueLogo
      return realLeagueLogo
    }
    const composites = []
    const logoSlots = []
    for (const slot of fallbackSlots) {
      const realLogo = realLogoForSlot(slot.role)
      if (realLogo?.buffer) {
        composites.push({
          input: await resizeCompositionBuffer(realLogo.buffer, slot.size, { frame: true }),
          left: slot.left,
          top: slot.top
        })
        logoSlots.push({
          role: slot.role,
          logoKind: realLogo.kind || 'real-league',
          logoSourceUrl: realLogo.sourceUrl || '',
          logoSourceUrls: realLogo.sourceUrls || [realLogo.sourceUrl].filter(Boolean),
          sourceKey: realLogo.sourceKey || slot.role || 'league',
          left: slot.left,
          top: slot.top,
          size: slot.size
        })
      } else {
        // Visible fallback is intentionally plain: it marks unresolved logo
        // data without pretending a league mark is a team badge.
        const glyphSvg = renderLogoGlyphSvg({ role: slot.role, event, theme, size: slot.size })
        if (glyphSvg) {
          composites.push({
            input: await resizeCompositionBuffer(Buffer.from(glyphSvg), slot.size, { frame: true }),
            left: slot.left,
            top: slot.top
          })
          logoSlots.push({
            role: slot.role,
            logoKind: 'fallback-glyph',
            logoFallbackReason,
            left: slot.left,
            top: slot.top,
            size: slot.size
          })
        } else {
          console.warn(`[sports-poster] LOGO_MISSING_NO_GLYPH variant=${variant} template=${normalizedTemplate} role=${slot.role} reason=${logoFallbackReason} title=${sourceTitleForAudit(fallbackInput)}`)
          logoSlots.push({
            role: slot.role,
            logoKind: 'missing-no-glyph',
            logoFallbackReason,
            left: slot.left,
            top: slot.top,
            size: slot.size
          })
        }
      }
    }
    if (artwork.overlay) {
      composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
    }
    const buffer = await sharp(Buffer.from(artwork.svg))
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()
    const realLogoSlots = logoSlots.filter((slot) => slot.logoKind && !['fallback-glyph', 'missing-no-glyph'].includes(slot.logoKind))
    const fallbackLogoSlots = logoSlots.filter((slot) => ['fallback-glyph', 'missing-no-glyph'].includes(slot.logoKind))
    // Log the silent full-glyph fallback explicitly so it shows up in proxy logs
    // alongside the upstream URL. Mixed real+fallback slots are covered by the
    // response provenance headers.
    if (realLogoSlots.length === 0) {
      const auditTitle = sourceTitleForAudit(fallbackInput)
      console.warn(
        `[sports-poster] LOGO_GLYPH_FALLBACK variant=${variant} template=${normalizedTemplate} eventClass=${eventClass} reason=${logoFallbackReason} title=${auditTitle}`
      )
    }
    return {
      buffer,
      selectedArtworkSource: realLogoSlots.length ? 'pvtkrrx-public-template' : 'pvtkrrx-template-glyph',
      selectedTemplate: normalizedTemplate,
      layoutFamily: artwork.layoutFamily || layoutFamilyForSportsPosterRender(normalizedTemplate, event),
      eventClass,
      logoKind: realLogoSlots.length ? preferredLogoKind(realLogoSlots.map((slot) => slot.logoKind)) : 'fallback-glyph',
      logoSourceUrl: realLogoSlots[0]?.logoSourceUrl || '',
      logoSourceUrls: Array.from(new Set(realLogoSlots.flatMap((slot) => slot.logoSourceUrls || slot.logoSourceUrl || []).filter(Boolean))),
      logoFallbackReason: fallbackLogoSlots.length ? `fallback_slots=${fallbackLogoSlots.map((slot) => slot.role || 'logo').join(',')}` : logoFallbackReason,
      logoRealCount: realLogoSlots.length,
      logoFallbackCount: fallbackLogoSlots.length,
      logoSlots,
      logoLookupAttempts: Array.isArray(logoContext.logoLookupAttempts) ? logoContext.logoLookupAttempts : []
    }
  } catch (error) {
    return renderEmergencyTemplatePng(variant, fallbackInput, normalizedTemplate, error)
  }
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

function isImageAssetContentType(contentType = '') {
  return /^image\/(?:png|jpeg|jpg|webp|svg\+xml)/i.test(String(contentType || ''))
}

function isSportsMetaRealLogoAsset(contentType = '', headers = {}) {
  if (!isImageAssetContentType(contentType)) return false
  const source = String(headers?.['x-sportsmeta-source'] || '').toLowerCase()
  const delivery = String(headers?.['x-sportsmeta-delivery-format'] || '').toLowerCase()
  const assetClass = String(headers?.['x-sportsmeta-asset-class'] || '').toLowerCase()
  const generated = /^true$/i.test(String(headers?.['x-sportsmeta-generated-asset'] || ''))
  if (generated) return false
  if (/default/.test(source) || /default/.test(assetClass)) return false
  // SportsMeta's `canonical-generator + public-canonical-svg` route emits a
  // glyph-only SVG (just team initials like "A" / "AM") even when a real logo
  // exists in the cache — verified via /inspect/asset which exposes the real
  // CDN URL. So treat that signature as fallback, not a real logo.
  if (source === 'canonical-generator') return false
  if (source === 'cached-asset' && delivery === 'raster' && /raster/.test(assetClass)) return true
  // Direct CDN responses (e.g. r2.thesportsdb.com) carry no SportsMeta headers
  // — we trust the content-type for those, since they are the upstream truth.
  if (!source && !delivery && !assetClass) return true
  return false
}

function logoKindForCandidate(key = '') {
  if (key === 'home' || key === 'away') return 'real-team'
  if (key === 'league') return 'real-league'
  if (key === 'event') return 'real-event'
  return 'fallback-glyph'
}

function preferredLogoKind(kinds = []) {
  const priority = ['real-team', 'real-league', 'real-event']
  return priority.find((kind) => kinds.includes(kind)) || 'fallback-glyph'
}

function summarizeLogoAttempts(attempts = []) {
  return attempts
    .map((attempt) => `${attempt.role || 'asset'}:${attempt.kind || 'unknown'}:${attempt.status || 0}:${attempt.result || 'unknown'}`)
    .join(',')
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
        poster: normalizeSpace(assets.poster),
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

function buildCanonicalBadgeUrl({ sportsmetaBaseUrl = '', canonicalId = '', variant = '', fallbackUrl = '' } = {}) {
  const publicFallback = normalizeSpace(fallbackUrl)
  return publicFallback && !/\/member\//i.test(publicFallback)
    ? publicFallback
    : buildSportsMetaAssetUrl(sportsmetaBaseUrl, variant, canonicalId)
}

function extractFetchableInspectAssetSourceUrl(sourceUrl = '') {
  const raw = normalizeSpace(sourceUrl)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) && !/sportsmeta\./i.test(raw)) return raw

  const optimizedMatch = raw.match(/^sportsmeta:\/\/optimized-logo\/v\d+\/[^/]+\/[^/]+\/[^/]+\/(.+)$/i)
  if (!optimizedMatch?.[1]) return ''
  try {
    const decoded = decodeURIComponent(optimizedMatch[1])
    return /^https?:\/\//i.test(decoded) && !/sportsmeta\./i.test(decoded) ? decoded : ''
  } catch (_) {
    return ''
  }
}

// SportsMeta's public canonical asset route returns a glyph-only SVG by
// default. The real raster URL (e.g. on r2.thesportsdb.com) is exposed via
// /inspect/asset/<variant>/<id> as `assetSourceUrl`. This helper resolves
// that CDN URL so we can fetch the actual badge instead of the placeholder.
async function loadInspectAssetSourceUrl({ canonicalId = '', sportsmetaBaseUrl = '', variant = '' } = {}) {
  const id = normalizeSpace(canonicalId)
  const v = normalizeSpace(variant)
  if (!id || !v) return ''
  const base = getPublicSportsMetaBaseUrl(sportsmetaBaseUrl)
  const url = `${base}/inspect/asset/${encodeURIComponent(v)}/${encodeURIComponent(id)}`
  const now = Date.now()
  const hit = inspectAssetCache.get(url)
  if (hit && hit.expiresAt > now) return hit.value
  if (inspectAssetInFlight.has(url)) return inspectAssetInFlight.get(url)

  const pending = (async () => {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      if (!response.ok) return ''
      const payload = await response.json().catch(() => null)
      const sourceUrl = normalizeSpace(payload?.assetSourceUrl || payload?.classification?.assetSourceUrl)
      if (!sourceUrl) return ''
      // SportsMeta may return `sportsmeta://optimized-logo/.../<encoded-url>`
      // for real public rasters. Decode the embedded original CDN URL and keep
      // rejecting anything that is not a fetchable external HTTP(S) image.
      return extractFetchableInspectAssetSourceUrl(sourceUrl)
    } catch (_) {
      return ''
    }
  })()
    .then((value) => {
      inspectAssetCache.set(url, { value, expiresAt: Date.now() + RASTER_CACHE_TTL_MS })
      while (inspectAssetCache.size > RASTER_CACHE_MAX_KEYS) {
        const oldestKey = inspectAssetCache.keys().next().value
        if (!oldestKey) break
        inspectAssetCache.delete(oldestKey)
      }
      return value
    })
    .finally(() => inspectAssetInFlight.delete(url))

  inspectAssetInFlight.set(url, pending)
  return pending
}

function leagueSlugFor(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const LEAGUE_SLUG_ALIASES = Object.freeze({
  'epl': 'english-premier-league',
  'premier league': 'english-premier-league',
  'champions league': 'uefa-champions-league',
  'uefa champions league': 'uefa-champions-league',
  'ucl': 'uefa-champions-league',
  'europa league': 'uefa-europa-league',
  'uefa europa league': 'uefa-europa-league',
  'fa cup': 'fa-cup',
  'the fa cup': 'fa-cup',
  'the emirates fa cup': 'fa-cup',
  'emirates fa cup': 'fa-cup',
  'english womens super league': 'english-womens-super-league',
  'english women super league': 'english-womens-super-league',
  'womens super league': 'english-womens-super-league',
  "women's super league": 'english-womens-super-league',
  'barclays womens super league': 'english-womens-super-league',
  "barclays women's super league": 'english-womens-super-league',
  'fa wsl': 'english-womens-super-league',
  'wsl': 'english-womens-super-league',
  'mls': 'major-league-soccer',
  'major league soccer': 'major-league-soccer',
  'american major league soccer': 'major-league-soccer',
  'ncaa basketball': 'ncaa-basketball',
  'college basketball': 'ncaa-basketball',
  'atp': 'atp-world-tour',
  'wta': 'wta-tour',
  'ufc': 'ufc',
  'nba': 'nba',
  'wnba': 'wnba',
  'women basketball league': 'wnba',
  'womens basketball league': 'wnba',
  "women's basketball league": 'wnba',
  'womens national basketball association': 'wnba',
  "women's national basketball association": 'wnba',
  'nfl': 'nfl',
  'nhl': 'nhl',
  'mlb': 'mlb',
  'motogp': 'moto-gp',
  'moto gp': 'moto-gp',
  'f1': 'formula-1',
  'formula 1': 'formula-1',
  'indycar': 'indycar-series',
  'indy car': 'indycar-series',
  'indycar series': 'indycar-series',
  'ntt indycar series': 'indycar-series',
  'indianapolis 500': 'indycar-series',
  'indy 500': 'indycar-series',
  'wrc': 'wrc',
  'world rally championship': 'wrc',
  'afl': 'afl',
  'australian football league': 'afl'
})

const GENERIC_LEAGUE_SLUGS = new Set([
  'sport',
  'sports',
  'general',
  'other',
  'football',
  'soccer',
  'basketball',
  'baseball',
  'hockey',
  'ice-hockey',
  'motorsport',
  'athletics',
  'golf',
  'fighting',
  'boxing',
  'mma',
  'wrestling',
  'rugby',
  'tennis'
])

function normalizedLeagueSlug(value = '') {
  const raw = String(value || '').toLowerCase().trim()
  return LEAGUE_SLUG_ALIASES[raw] || leagueSlugFor(value)
}

function isGenericLeagueSlug(value = '') {
  const slug = normalizedLeagueSlug(value)
  return !slug || GENERIC_LEAGUE_SLUGS.has(slug)
}

function deriveLeagueCanonicalId(sport = '', league = '') {
  const sportSlug = leagueSlugFor(sport)
  if (!sportSlug) return ''
  const leagueRaw = String(league || '').toLowerCase().trim()
  const aliasSlug = LEAGUE_SLUG_ALIASES[leagueRaw]
  const slug = aliasSlug || leagueSlugFor(league)
  if (!slug) return ''
  return `sportsmeta:league:${sportSlug}|${slug}`
}

// Build a poster/landscape/background/logo for a non-canonical league/sport
// package using the real league logo from the inspect-revealed CDN URL.
// MotoGP weekend, ATP singles bracket, FA Cup matchday RSS etc. now show e.g.
// the real Champions League crest instead of a generic "ADMIT ONE" glyph.
async function tryRealLeagueLogoPoster({ variant = 'poster', sport = '', league = '', sportsmetaBaseUrl = '', fallbackInput = {}, template = 'ticket-stub' } = {}) {
  if (!['poster', 'landscape', 'background', 'logo'].includes(variant)) return null
  const leagueCanonicalId = deriveLeagueCanonicalId(sport, league)
  if (!leagueCanonicalId) return null
  const cdnUrl = await loadInspectAssetSourceUrl({
    canonicalId: leagueCanonicalId,
    sportsmetaBaseUrl,
    variant: 'leagueLogo'
  })
  if (!cdnUrl) return null

  let leagueLogoBuffer
  try {
    const response = await fetch(cdnUrl, {
      headers: { accept: 'image/png,image/jpeg,image/webp,image/*' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return null
    const upstreamContentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (!/^image\/(png|jpeg|jpg|webp)/i.test(upstreamContentType)) return null
    leagueLogoBuffer = Buffer.from(await response.arrayBuffer())
  } catch (_) {
    return null
  }

  if (variant === 'logo') {
    const dims = VARIANT_DIMENSIONS.logo
    const png = await sharp(leagueLogoBuffer, { density: 192 })
      .resize({ width: dims.width, height: dims.height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()
    return {
      buffer: png,
      contentType: 'image/png',
      selectedArtworkSource: 'pvtkrrx-cdn-league-logo',
      selectedTemplate: normalizeSportsPosterTemplate(template),
      layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
      eventClass: fallbackInput.eventClass || classifySportsEvent(fallbackInput),
      fallbackReason: 'sportsmeta_default_replaced_with_league_cdn_logo',
      logoKind: 'real-league',
      logoSourceUrl: cdnUrl,
      logoSourceUrls: [cdnUrl],
      logoFallbackReason: '',
      logoRealCount: 1,
      logoFallbackCount: 0,
      logoSlots: [],
      logoLookupAttempts: [{ role: 'leagueLogo', kind: 'real-league', url: cdnUrl, status: 200, result: 'real_logo' }],
      realLogoLookupAttempted: true
    }
  }

  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  const event = buildTemplateFallbackEvent(fallbackInput)
  const eventClass = fallbackInput.eventClass || classifySportsEvent(event)
  event.eventClass = eventClass
  const fallbackHomeColor = colorForLabel(event.league || event.sport || 'league', '#0f766e')
  const dominant = await dominantColorFromImage(leagueLogoBuffer, fallbackHomeColor)
  const theme = {
    homeColor: dominant,
    awayColor: dominant,
    accentColor: paperAccentFromHex(readableAccentFromHex(dominant))
  }
  let artwork
  try {
    artwork = renderSportsPosterTemplateSvg({ event, variant, template: normalizedTemplate, theme })
  } catch (_) {
    return null
  }
  const slots = artwork.slots || []
  const composites = []
  let realCount = 0
  for (const slot of slots) {
    if (slot.role !== 'league') continue
    const sized = await sharp(leagueLogoBuffer, { density: 192 })
      .resize({ width: slot.size, height: slot.size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    composites.push({ input: sized, left: slot.left, top: slot.top })
    realCount += 1
  }
  if (realCount === 0) return null
  if (artwork.overlay) composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
  const buffer = await sharp(Buffer.from(artwork.svg))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  return {
    buffer,
    contentType: 'image/png',
    selectedArtworkSource: 'pvtkrrx-cdn-league-poster',
    selectedTemplate: normalizedTemplate,
    layoutFamily: artwork.layoutFamily || layoutFamilyForSportsPosterRender(normalizedTemplate, event),
    eventClass,
    fallbackReason: 'sportsmeta_default_replaced_with_league_cdn_logo',
    logoKind: 'real-league',
    logoSourceUrl: cdnUrl,
    logoSourceUrls: [cdnUrl],
    logoFallbackReason: '',
    logoRealCount: realCount,
    logoFallbackCount: 0,
    logoSlots: slots.filter((s) => s.role === 'league').map((s) => ({
      role: 'league',
      logoKind: 'real-league',
      logoSourceUrl: cdnUrl,
      left: s.left,
      top: s.top,
      size: s.size
    })),
    logoLookupAttempts: [{ role: 'leagueLogo', kind: 'real-league', url: cdnUrl, status: 200, result: 'real_logo' }],
    realLogoLookupAttempted: true
  }
}

// For variant=logo: try the inspect-revealed CDN URL (real league/team badge)
// and return a rasterized PNG sized to the logo variant. Used by Stremio's
// detail-panel small thumbnail (`meta.logo`). Returns null if no real CDN URL.
async function rasterizeLogoUrlForVariant(cdnUrl = '', variant = 'logo', inspectVariant = 'logo') {
  const sourceUrl = normalizeSpace(cdnUrl)
  if (!sourceUrl) return null
  try {
    let sourceBuffer
    let upstreamContentType = ''
    if (sourceUrl === 'pvtkrrx://logo/ufc-red') {
      sourceBuffer = Buffer.from(renderUfcRedLogoSvg(640))
      upstreamContentType = 'image/svg+xml'
    } else {
      const response = await fetch(sourceUrl, {
        headers: { accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/*' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      if (!response.ok) return null
      upstreamContentType = String(response.headers.get('content-type') || '').toLowerCase()
      if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)/i.test(upstreamContentType)) return null
      sourceBuffer = Buffer.from(await response.arrayBuffer())
    }
    const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.logo
    const logoSize = Math.round(Math.min(dims.width, dims.height) * 0.86)
    const logo = await resizeCompositionBuffer(sourceBuffer, logoSize, { frame: true })
    const png = await sharp({
      create: {
        width: dims.width,
        height: dims.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{
        input: logo,
        left: Math.round((dims.width - logoSize) / 2),
        top: Math.round((dims.height - logoSize) / 2)
      }])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer()
    return {
      buffer: png,
      sourceUrl,
      inspectVariant,
      logoKind: inspectVariant === 'leagueLogo' || inspectVariant === 'logo' || inspectVariant === 'directLeagueLogo' ? 'real-league' : 'real-team',
      upstreamContentType
    }
  } catch (_) {
    return null
  }
}

async function tryRealLogoVariantPng({ canonicalId = '', sportsmetaBaseUrl = '', variant = 'logo' } = {}) {
  if (!canonicalId) return null
  for (const cdnUrl of directLeagueLogoUrlsForCanonicalId(canonicalId)) {
    const direct = await rasterizeLogoUrlForVariant(cdnUrl, variant, 'directLeagueLogo')
    if (direct?.buffer) return direct
  }
  // Logo variant — prefer the competition/league mark. Stremio's detail panel
  // uses meta.logo, and for fixtures that should identify the competition
  // (e.g. UEFA Champions League), not the first team badge.
  const order = variant === 'logo'
    ? ['leagueLogo', 'logo']
    : [variant]
  for (const inspectVariant of order) {
    const cdnUrl = await loadInspectAssetSourceUrl({
      canonicalId,
      sportsmetaBaseUrl,
      variant: inspectVariant
    })
    if (!cdnUrl) continue
    try {
      const raster = await rasterizeLogoUrlForVariant(cdnUrl, variant, inspectVariant)
      if (raster?.buffer) return raster
    } catch (_) {
      continue
    }
  }
  return null
}

const DEFAULT_LEAGUE_LOGO_RULES = Object.freeze([
  {
    sport: 'football',
    pattern: /\b(?:scottish\s+women'?s?\s+premier\s+league|swpl)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://upload.wikimedia.org/wikipedia/commons/c/cc/SWPL_Logo_Brandmarque_Colour.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:uefa\s+champions\s+league|champions\s+league|ucl)\b/i,
    canonicalIds: ['sportsmeta:league:football|uefa-champions-league'],
    searchTerms: ['UEFA Champions League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/facv1u1742998896.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:uefa\s+conference\s+league|conference\s+league|uecl)\b/i,
    canonicalIds: ['sportsmeta:league:football|uefa-conference-league'],
    searchTerms: ['UEFA Conference League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/ymfo5j1718775759.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:uefa\s+europa\s+(?:and|&)\s+conference\s+league|europa\s+(?:and|&)\s+conference\s+league)\b/i,
    canonicalIds: ['sportsmeta:league:football|uefa-europa-league'],
    searchTerms: ['UEFA Europa League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:uefa\s+europa\s+league|europa\s+league|uel)\b/i,
    canonicalIds: ['sportsmeta:league:football|uefa-europa-league'],
    searchTerms: ['UEFA Europa League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png']
  },
  {
    sport: 'football',
    pattern: /^(?!.*\bscottish\b)(?!.*\bwomen'?s?\b).*\b(?:english\s+premier\s+league|premier\s+league|epl)\b/i,
    canonicalIds: ['sportsmeta:league:football|english-premier-league'],
    searchTerms: ['English Premier League']
  },
  {
    sport: 'football',
    pattern: /\b(?:spanish\s+la\s+liga|la\s*liga|laliga)\b/i,
    canonicalIds: ['sportsmeta:league:football|spanish-la-liga'],
    searchTerms: ['Spanish La Liga'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:german\s+bundesliga|bundesliga)\b/i,
    canonicalIds: ['sportsmeta:league:football|german-bundesliga'],
    searchTerms: ['German Bundesliga'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/teqh1b1679952008.png']
  },
  {
    sport: 'football',
    pattern: /\bfa\s+cup\b/i,
    canonicalIds: [],
    searchTerms: ['FA Cup'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/vk7isd1598802862.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:barclays\s+women'?s?\s+super\s+league|english\s+women'?s?\s+super\s+league|women'?s?\s+super\s+league|fa\s+wsl|wsl)\b/i,
    canonicalIds: ['sportsmeta:league:football|english-womens-super-league'],
    searchTerms: ['English Womens Super League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/lpsm6p1751723311.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:english\s+national\s+league|national\s+league|conference\s+national|vanarama\s+national\s+league)\b/i,
    canonicalIds: ['sportsmeta:league:football|english-national-league'],
    searchTerms: ['English National League'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/5mq9v01752167973.png']
  },
  {
    sport: 'football',
    pattern: /\b(?:major\s+league\s+soccer|mls)\b/i,
    canonicalIds: ['sportsmeta:league:football|major-league-soccer'],
    searchTerms: ['Major League Soccer'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/dqo6r91549878326.png']
  },
  {
    sport: 'basketball',
    pattern: /\b(?:nba|nba\s+playoffs?)\b/i,
    canonicalIds: ['sportsmeta:league:basketball|nba'],
    searchTerms: ['NBA']
  },
  {
    sport: 'basketball',
    pattern: /\b(?:wnba|women'?s?\s+(?:national\s+)?basketball\s+(?:association|league))\b/i,
    canonicalIds: ['sportsmeta:league:basketball|wnba'],
    searchTerms: ['WNBA'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/logo/3fv4p01573154525.png']
  },
  {
    sport: 'basketball',
    pattern: /\b(?:ncaa\s+basketball|college\s+basketball)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/NCAA_Basketball_wordmark_color.svg']
  },
  {
    sport: 'baseball',
    pattern: /\b(?:mlb|major\s+league\s+baseball)\b/i,
    canonicalIds: ['sportsmeta:league:baseball|mlb'],
    searchTerms: ['MLB']
  },
  {
    sport: 'hockey',
    pattern: /\bnhl\b/i,
    canonicalIds: ['sportsmeta:league:hockey|nhl'],
    searchTerms: ['NHL'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/4cem2k1619616539.png']
  },
  {
    sport: 'american-football',
    pattern: /\bnfl\b/i,
    canonicalIds: ['sportsmeta:league:american-football|nfl'],
    searchTerms: ['NFL']
  },
  {
    sport: 'motorsport',
    pattern: /\b(?:moto\s*gp|motogp|moto\s+grand\s+prix)\b/i,
    canonicalIds: ['sportsmeta:league:motorsport|motogp'],
    searchTerms: ['MotoGP']
  },
  {
    sport: 'motorsport',
    pattern: /\b(?:indy\s*car|indycar|ntt\s+indycar|indianapolis\s+500|indy\s*500)\b/i,
    canonicalIds: ['sportsmeta:league:motorsport|indycar-series'],
    searchTerms: ['IndyCar Series'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/logo/mkv0xb1641916982.png']
  },
  {
    sport: 'motorsport',
    pattern: /\b(?:wrc|world\s+rally\s+championship)\b/i,
    canonicalIds: ['sportsmeta:league:motorsport|wrc'],
    searchTerms: ['World Rally Championship'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/logo/5f36o51544372922.png']
  },
  {
    sport: 'motorsport',
    pattern: /\b(?:v8\s*supercars?|v8sc|supercars?(?:\s+championship)?)\b/i,
    canonicalIds: ['sportsmeta:league:motorsport|v8-supercars'],
    searchTerms: ['V8 Supercars', 'Supercars Championship'],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/64f67s1770108650.png']
  },
  {
    sport: 'motorsport',
    pattern: /\b(?:wsbk|wssp|wwcr|world\s+super\s*bikes?|world\s*superbikes?|world\s*sbk|superbike\s+world\s+championship|sbk)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/g2j9rc1649703609.png']
  },
  {
    sport: 'athletics',
    pattern: /\b(?:world\s+athletics\s+diamond\s+league|diamond\s+league)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/7d5xlh1650475438.png']
  },
  {
    sport: 'mma',
    pattern: /\bufc\b/i,
    canonicalIds: ['sportsmeta:league:mma|ufc'],
    searchTerms: ['UFC'],
    directLogoUrls: ['pvtkrrx://logo/ufc-red']
  },
  {
    sport: 'boxing',
    pattern: /\bboxing\b/i,
    canonicalIds: ['sportsmeta:league:boxing|boxing'],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/logo/xtssst1473774665.png']
  },
  // Tennis — SportsMeta does not index tennis as a sport slug, so every tennis
  // tournament has to lean on TheSportsDB CDN league badges. ATP/WTA badges
  // double as the tour mark for any singles tournament on that tour. Grand
  // Slams (Wimbledon / US Open / Australian Open / Roland Garros) and team
  // events (Davis Cup / Laver Cup / United Cup / Olympics) get specific marks
  // where TheSportsDB carries them.
  {
    sport: 'tennis',
    pattern: /\b(?:atp|atp\s+world\s+tour|men\'?s\s+singles|davis\s+cup)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png']
  },
  {
    sport: 'tennis',
    pattern: /\b(?:wta|wta\s+tour|women\'?s\s+singles|billie\s+jean\s+king\s+cup)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/bddhun1768230678.png']
  },
  {
    sport: 'tennis',
    pattern: /\b(?:wimbledon|us\s+open|u\.s\.\s+open|aus\s+open|australian\s+open|french\s+open|roland\s+garros)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png']
  },
  {
    sport: 'tennis',
    pattern: /\bunited\s+cup\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/6dhk9z1775665150.png']
  },
  {
    sport: 'tennis',
    pattern: /\blaver\s+cup\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/pd74m91572093834.png']
  },
  {
    sport: 'tennis',
    pattern: /\b(?:olympic\s+tennis|olympics\s+tennis|olympics?)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/5m0rwm1687510227.png']
  },
  // Catch-all tennis fallback — any tennis-flagged event without a matched
  // tournament still gets the ATP World Tour mark instead of a glyph. The
  // sport-only pattern always fires when sport is "tennis".
  {
    sport: 'tennis',
    pattern: /\btennis\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png']
  },
  {
    sport: 'cricket',
    pattern: /\b(?:ipl|indian\s+premier\s+league)\b/i,
    canonicalIds: ['sportsmeta:league:cricket|indian-premier-league'],
    searchTerms: ['Indian Premier League']
  },
  {
    sport: 'golf',
    pattern: /\b(?:pga\s+tour|pga)\b/i,
    canonicalIds: ['sportsmeta:league:golf|pga-tour'],
    searchTerms: ['PGA Tour']
  },
  // Leagues SportsMeta does not currently index — use TheSportsDB CDN URLs
  // directly as a third tier so AFL / NRL / BWF posters still get a real
  // league badge instead of a generic "ADMIT ONE" glyph.
  {
    sport: 'rugby',
    pattern: /\b(?:afl|first\s+crack|aussie\s+rules|australian\s+football|australian\s+rules\s+football)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/wvx4721525519372.png']
  },
  {
    sport: 'australian-rules-football',
    pattern: /\b(?:afl|first\s+crack|aussie\s+rules|australian\s+football|australian\s+rules\s+football)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/wvx4721525519372.png']
  },
  {
    sport: 'rugby',
    pattern: /\b(?:nrl|national\s+rugby\s+league|midweek\s+tackle)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://www.thesportsdb.com/images/media/league/badge/g5ocbs1777721333.png']
  },
  {
    sport: 'badminton',
    pattern: /\b(?:bwf|bwf\s+world\s+tour|badminton)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/d5xvqq1750423289.png']
  },
  // Snooker — SportsMeta does not index snooker. World Snooker (WST) badge
  // covers every ranking event (World Championship, UK Championship, Masters,
  // German Masters, Champion of Champions, Players Championship, Tour
  // Championship). Matched per-tournament keywords first, then a sport-only
  // catch-all so any snooker-flagged event still gets a real badge.
  {
    sport: 'snooker',
    pattern: /\b(?:world\s+snooker|world\s+championship\s+snooker|wst|uk\s+championship|masters\s+snooker|german\s+masters|champion\s+of\s+champions|players\s+championship|tour\s+championship|crucible)\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/0gmkgj1555600537.png']
  },
  {
    sport: 'snooker',
    pattern: /\bsnooker\b/i,
    canonicalIds: [],
    searchTerms: [],
    directLogoUrls: ['https://r2.thesportsdb.com/images/media/league/badge/0gmkgj1555600537.png']
  },
  {
    sport: 'wrestling',
    pattern: /\b(?:wwe|world\s+wrestling\s+entertainment)\b/i,
    canonicalIds: ['sportsmeta:league:wrestling|wwe'],
    searchTerms: [],
    directLogoUrls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/WWE_official_logo.svg']
  },
  {
    sport: 'wrestling',
    pattern: /\b(?:tna|tna\s+wrestling|impact\s+wrestling|total\s+nonstop\s+action)\b/i,
    canonicalIds: ['sportsmeta:league:wrestling|tna-wrestling'],
    searchTerms: [],
    directLogoUrls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/TNA_Wrestling_%282024%29_Logo.svg']
  }
])

const DEFAULT_TEAM_LOGO_ALIASES = Object.freeze([
  { sport: 'basketball', league: 'nba', team: 'Atlanta Hawks', aliases: ['hawks'] },
  { sport: 'basketball', league: 'nba', team: 'Boston Celtics', aliases: ['celtics'] },
  { sport: 'basketball', league: 'nba', team: 'Brooklyn Nets', aliases: ['nets'] },
  { sport: 'basketball', league: 'nba', team: 'Charlotte Hornets', aliases: ['hornets'] },
  { sport: 'basketball', league: 'nba', team: 'Chicago Bulls', aliases: ['bulls'] },
  { sport: 'basketball', league: 'nba', team: 'Cleveland Cavaliers', aliases: ['cavaliers', 'cavs'] },
  { sport: 'basketball', league: 'nba', team: 'Dallas Mavericks', aliases: ['mavericks', 'mavs'] },
  { sport: 'basketball', league: 'nba', team: 'Denver Nuggets', aliases: ['nuggets'] },
  { sport: 'basketball', league: 'nba', team: 'Detroit Pistons', aliases: ['pistons'] },
  { sport: 'basketball', league: 'nba', team: 'Golden State Warriors', aliases: ['warriors'] },
  { sport: 'basketball', league: 'nba', team: 'Houston Rockets', aliases: ['rockets'] },
  { sport: 'basketball', league: 'nba', team: 'Indiana Pacers', aliases: ['pacers'] },
  { sport: 'basketball', league: 'nba', team: 'Los Angeles Clippers', aliases: ['clippers'] },
  { sport: 'basketball', league: 'nba', team: 'Los Angeles Lakers', aliases: ['lakers'] },
  { sport: 'basketball', league: 'nba', team: 'Memphis Grizzlies', aliases: ['grizzlies'] },
  { sport: 'basketball', league: 'nba', team: 'Miami Heat', aliases: ['heat'] },
  { sport: 'basketball', league: 'nba', team: 'Milwaukee Bucks', aliases: ['bucks'] },
  { sport: 'basketball', league: 'nba', team: 'Minnesota Timberwolves', aliases: ['timberwolves', 'wolves'] },
  { sport: 'basketball', league: 'nba', team: 'New Orleans Pelicans', aliases: ['pelicans'] },
  { sport: 'basketball', league: 'nba', team: 'New York Knicks', aliases: ['knicks'] },
  { sport: 'basketball', league: 'nba', team: 'Oklahoma City Thunder', aliases: ['thunder', 'okc'] },
  { sport: 'basketball', league: 'nba', team: 'Orlando Magic', aliases: ['magic'] },
  { sport: 'basketball', league: 'nba', team: 'Philadelphia 76ers', aliases: ['76ers', 'sixers'] },
  { sport: 'basketball', league: 'nba', team: 'Phoenix Suns', aliases: ['suns'] },
  { sport: 'basketball', league: 'nba', team: 'Portland Trail Blazers', aliases: ['trail blazers', 'blazers'] },
  { sport: 'basketball', league: 'nba', team: 'Sacramento Kings', aliases: ['kings'] },
  { sport: 'basketball', league: 'nba', team: 'San Antonio Spurs', aliases: ['spurs'] },
  { sport: 'basketball', league: 'nba', team: 'Toronto Raptors', aliases: ['raptors'] },
  { sport: 'basketball', league: 'nba', team: 'Utah Jazz', aliases: ['jazz'] },
  { sport: 'basketball', league: 'nba', team: 'Washington Wizards', aliases: ['wizards'] }
])

const DIRECT_LEAGUE_LOGO_OVERRIDES = Object.freeze([
  { sport: 'football', league: 'Scottish Womens Premier League', pattern: /\b(?:scottish\s+women'?s?\s+premier\s+league|swpl)\b/i, urls: ['https://upload.wikimedia.org/wikipedia/commons/c/cc/SWPL_Logo_Brandmarque_Colour.png'] },
  { sport: 'football', league: 'Spanish La Liga', pattern: /\b(?:spanish\s+la\s+liga|la\s*liga|laliga)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png'] },
  { sport: 'football', league: 'German Bundesliga', pattern: /\b(?:german\s+bundesliga|bundesliga)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/teqh1b1679952008.png'] },
  { sport: 'football', league: 'UEFA Champions League', pattern: /\b(?:uefa\s+champions\s+league|champions\s+league|ucl)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/facv1u1742998896.png'] },
  { sport: 'football', league: 'UEFA Conference League', pattern: /\b(?:uefa\s+conference\s+league|conference\s+league|uecl)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/ymfo5j1718775759.png'] },
  { sport: 'football', league: 'UEFA Europa League', pattern: /\b(?:uefa\s+europa\s+(?:and|&)\s+conference\s+league|europa\s+(?:and|&)\s+conference\s+league|uefa\s+europa\s+league|europa\s+league|uel)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/mlsr7d1718774547.png'] },
  { sport: 'football', league: 'FA Cup', pattern: /\b(?:the\s+emirates\s+fa\s+cup|emirates\s+fa\s+cup|fa\s+cup)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/vk7isd1598802862.png'] },
  { sport: 'football', league: 'English Womens Super League', pattern: /\b(?:barclays\s+women'?s?\s+super\s+league|english\s+women'?s?\s+super\s+league|women'?s?\s+super\s+league|fa\s+wsl|wsl)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/lpsm6p1751723311.png'] },
  { sport: 'football', league: 'English National League', pattern: /\b(?:english\s+national\s+league|national\s+league|conference\s+national|vanarama\s+national\s+league)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/5mq9v01752167973.png'] },
  { sport: 'football', league: 'Scottish Premiership', pattern: /\b(?:scottish\s+premiership|scottish\s+premier\s+league|cinch\s+premiership|celtic|motherwell|falkirk|heart\s+of\s+midlothian|hibernian|rangers)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/72d3zc1688333496.png'] },
  { sport: 'football', league: 'Major League Soccer', pattern: /\b(?:major\s+league\s+soccer|mls)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/dqo6r91549878326.png'] },
  { sport: 'basketball', league: 'WNBA', pattern: /\b(?:wnba|women'?s?\s+(?:national\s+)?basketball\s+(?:association|league))\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/logo/3fv4p01573154525.png'] },
  { sport: 'basketball', league: 'NCAA Basketball', pattern: /\b(?:ncaa\s+basketball|college\s+basketball)\b/i, urls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/NCAA_Basketball_wordmark_color.svg'] },
  { sport: 'mma', league: 'UFC', pattern: /\bufc\b/i, urls: ['pvtkrrx://logo/ufc-red'] },
  { sport: 'boxing', league: 'Boxing', pattern: /\bboxing\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/logo/xtssst1473774665.png'] },
  { sport: 'wrestling', league: 'WWE', pattern: /\b(?:wwe|world\s+wrestling\s+entertainment)\b/i, urls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/WWE_official_logo.svg'] },
  { sport: 'wrestling', league: 'TNA Wrestling', pattern: /\b(?:tna|tna\s+wrestling|impact\s+wrestling|total\s+nonstop\s+action)\b/i, urls: ['https://commons.wikimedia.org/wiki/Special:Redirect/file/TNA_Wrestling_%282024%29_Logo.svg'] },
  { sport: 'motorsport', league: 'IndyCar Series', pattern: /\b(?:indy\s*car|indycar|ntt\s+indycar|indianapolis\s+500|indy\s*500)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/logo/mkv0xb1641916982.png'] },
  { sport: 'motorsport', league: 'WRC', pattern: /\b(?:wrc|world\s+rally\s+championship)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/logo/5f36o51544372922.png'] },
  { sport: 'motorsport', league: 'Supercars Championship', pattern: /\b(?:v8\s*supercars?|v8sc|supercars?(?:\s+championship)?)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/64f67s1770108650.png'] },
  { sport: 'motorsport', league: 'World Superbikes', pattern: /\b(?:wsbk|wssp|wwcr|world\s+super\s*bikes?|world\s*superbikes?|world\s*sbk|superbike\s+world\s+championship|sbk)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/g2j9rc1649703609.png'] },
  { sport: 'athletics', league: 'Diamond League', pattern: /\b(?:world\s+athletics\s+diamond\s+league|diamond\s+league)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/7d5xlh1650475438.png'] },
  { sport: 'rugby', league: 'AFL', pattern: /\b(?:afl|first\s+crack|aussie\s+rules|australian\s+football|australian\s+rules\s+football)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/wvx4721525519372.png'] },
  { sport: 'australian-rules-football', league: 'AFL', pattern: /\b(?:afl|first\s+crack|aussie\s+rules|australian\s+football|australian\s+rules\s+football)\b/i, urls: ['https://r2.thesportsdb.com/images/media/league/badge/wvx4721525519372.png'] }
])

const DIRECT_TEAM_LOGO_OVERRIDES = Object.freeze([
  ...[
    ['hockey', 'NHL', 'Anaheim Ducks', ['ducks', 'ana'], 'https://a.espncdn.com/i/teamlogos/nhl/500/ana.png'],
    ['hockey', 'NHL', 'Boston Bruins', ['bruins', 'bos'], 'https://a.espncdn.com/i/teamlogos/nhl/500/bos.png'],
    ['hockey', 'NHL', 'Buffalo Sabres', ['sabres', 'buf'], 'https://a.espncdn.com/i/teamlogos/nhl/500/buf.png'],
    ['hockey', 'NHL', 'Calgary Flames', ['flames', 'cgy'], 'https://a.espncdn.com/i/teamlogos/nhl/500/cgy.png'],
    ['hockey', 'NHL', 'Carolina Hurricanes', ['hurricanes', 'canes', 'car'], 'https://a.espncdn.com/i/teamlogos/nhl/500/car.png'],
    ['hockey', 'NHL', 'Chicago Blackhawks', ['blackhawks', 'hawks', 'chi'], 'https://a.espncdn.com/i/teamlogos/nhl/500/chi.png'],
    ['hockey', 'NHL', 'Colorado Avalanche', ['avalanche', 'avs', 'col'], 'https://a.espncdn.com/i/teamlogos/nhl/500/col.png'],
    ['hockey', 'NHL', 'Columbus Blue Jackets', ['blue jackets', 'cbj'], 'https://a.espncdn.com/i/teamlogos/nhl/500/cbj.png'],
    ['hockey', 'NHL', 'Dallas Stars', ['stars', 'dal'], 'https://a.espncdn.com/i/teamlogos/nhl/500/dal.png'],
    ['hockey', 'NHL', 'Detroit Red Wings', ['red wings', 'det'], 'https://a.espncdn.com/i/teamlogos/nhl/500/det.png'],
    ['hockey', 'NHL', 'Edmonton Oilers', ['oilers', 'edm'], 'https://a.espncdn.com/i/teamlogos/nhl/500/edm.png'],
    ['hockey', 'NHL', 'Florida Panthers', ['panthers', 'fla'], 'https://a.espncdn.com/i/teamlogos/nhl/500/fla.png'],
    ['hockey', 'NHL', 'Los Angeles Kings', ['la kings', 'kings', 'lak'], 'https://a.espncdn.com/i/teamlogos/nhl/500/la.png'],
    ['hockey', 'NHL', 'Minnesota Wild', ['wild', 'min'], 'https://a.espncdn.com/i/teamlogos/nhl/500/min.png'],
    ['hockey', 'NHL', 'Montreal Canadiens', ['canadiens', 'habs', 'mtl'], 'https://a.espncdn.com/i/teamlogos/nhl/500/mtl.png'],
    ['hockey', 'NHL', 'Nashville Predators', ['predators', 'preds', 'nsh'], 'https://a.espncdn.com/i/teamlogos/nhl/500/nsh.png'],
    ['hockey', 'NHL', 'New Jersey Devils', ['devils', 'njd', 'nj'], 'https://a.espncdn.com/i/teamlogos/nhl/500/nj.png'],
    ['hockey', 'NHL', 'New York Islanders', ['islanders', 'nyi'], 'https://a.espncdn.com/i/teamlogos/nhl/500/nyi.png'],
    ['hockey', 'NHL', 'New York Rangers', ['rangers', 'nyr'], 'https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png'],
    ['hockey', 'NHL', 'Ottawa Senators', ['senators', 'sens', 'ott'], 'https://a.espncdn.com/i/teamlogos/nhl/500/ott.png'],
    ['hockey', 'NHL', 'Philadelphia Flyers', ['flyers', 'phi'], 'https://a.espncdn.com/i/teamlogos/nhl/500/phi.png'],
    ['hockey', 'NHL', 'Pittsburgh Penguins', ['penguins', 'pens', 'pit'], 'https://a.espncdn.com/i/teamlogos/nhl/500/pit.png'],
    ['hockey', 'NHL', 'San Jose Sharks', ['sharks', 'sj'], 'https://a.espncdn.com/i/teamlogos/nhl/500/sj.png'],
    ['hockey', 'NHL', 'Seattle Kraken', ['kraken', 'sea'], 'https://a.espncdn.com/i/teamlogos/nhl/500/sea.png'],
    ['hockey', 'NHL', 'St. Louis Blues', ['st louis blues', 'st. louis blues', 'blues', 'stl'], 'https://a.espncdn.com/i/teamlogos/nhl/500/stl.png'],
    ['hockey', 'NHL', 'Tampa Bay Lightning', ['lightning', 'bolts', 'tb'], 'https://a.espncdn.com/i/teamlogos/nhl/500/tb.png'],
    ['hockey', 'NHL', 'Toronto Maple Leafs', ['maple leafs', 'leafs', 'tor'], 'https://a.espncdn.com/i/teamlogos/nhl/500/tor.png'],
    ['hockey', 'NHL', 'Utah Mammoth', ['mammoth', 'utah hockey club', 'utah'], 'https://a.espncdn.com/i/teamlogos/nhl/500/utah.png'],
    ['hockey', 'NHL', 'Vancouver Canucks', ['canucks', 'van'], 'https://a.espncdn.com/i/teamlogos/nhl/500/van.png'],
    ['hockey', 'NHL', 'Vegas Golden Knights', ['golden knights', 'knights', 'vgk'], 'https://a.espncdn.com/i/teamlogos/nhl/500/vgk.png'],
    ['hockey', 'NHL', 'Washington Capitals', ['capitals', 'caps', 'wsh'], 'https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png'],
    ['hockey', 'NHL', 'Winnipeg Jets', ['jets', 'wpg'], 'https://a.espncdn.com/i/teamlogos/nhl/500/wpg.png'],
    ['football', '', 'Ajax Amsterdam', ['ajax', 'aja'], 'https://a.espncdn.com/i/teamlogos/soccer/500/139.png'],
    ['football', '', 'Arsenal', ['arsenal', 'ars'], 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png'],
    ['football', '', 'AS Monaco', ['monaco', 'asm', 'mon'], 'https://a.espncdn.com/i/teamlogos/soccer/500/174.png'],
    ['football', '', 'Atalanta', ['atalanta', 'ata'], 'https://a.espncdn.com/i/teamlogos/soccer/500/105.png'],
    ['football', '', 'Athletic Club', ['athletic bilbao', 'bilbao', 'athletic', 'ath'], 'https://a.espncdn.com/i/teamlogos/soccer/500/93.png'],
    ['football', '', 'Atletico Madrid', ['atletico madrid', 'atletico', 'atleti', 'atm'], 'https://a.espncdn.com/i/teamlogos/soccer/500/1068.png'],
    ['football', '', 'Barcelona', ['barcelona', 'barca', 'fcb', 'bar'], 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png'],
    ['football', '', 'Bayer Leverkusen', ['leverkusen', 'bayer 04', 'b04'], 'https://a.espncdn.com/i/teamlogos/soccer/500/131.png'],
    ['football', '', 'Bayern Munich', ['bayern', 'bayern munich', 'mun'], 'https://a.espncdn.com/i/teamlogos/soccer/500/132.png'],
    ['football', '', 'Benfica', ['sl benfica', 'benfica', 'slb'], 'https://a.espncdn.com/i/teamlogos/soccer/500/1929.png'],
    ['football', '', 'Bodo/Glimt', ['bodo glimt', 'bodo', 'glimt'], 'https://a.espncdn.com/i/teamlogos/soccer/500/2980.png'],
    ['football', '', 'Borussia Dortmund', ['dortmund', 'bvb', 'borussia dortmund'], 'https://a.espncdn.com/i/teamlogos/soccer/500/124.png'],
    ['football', '', 'Chelsea', ['chelsea', 'che'], 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png'],
    ['football', '', 'Club Brugge', ['brugge', 'club brugge', 'bru'], 'https://a.espncdn.com/i/teamlogos/soccer/500/570.png'],
    ['football', '', 'Eintracht Frankfurt', ['frankfurt', 'eintracht frankfurt', 'sge'], 'https://a.espncdn.com/i/teamlogos/soccer/500/125.png'],
    ['football', '', 'FC Copenhagen', ['copenhagen', 'kobenhavn', 'fc copenhagen', 'f c copenhagen', 'kbh'], 'https://a.espncdn.com/i/teamlogos/soccer/500/909.png'],
    ['football', '', 'FK Qarabag', ['qarabag', 'fk qarabag', 'qar'], 'https://a.espncdn.com/i/teamlogos/soccer/500/10414.png'],
    ['football', '', 'Galatasaray', ['galatasaray', 'gal'], 'https://a.espncdn.com/i/teamlogos/soccer/500/432.png'],
    ['football', '', 'Internazionale', ['internazionale', 'inter milan', 'inter', 'int'], 'https://a.espncdn.com/i/teamlogos/soccer/500/110.png'],
    ['football', '', 'Juventus', ['juventus', 'juve', 'juv'], 'https://a.espncdn.com/i/teamlogos/soccer/500/111.png'],
    ['football', '', 'Kairat Almaty', ['kairat', 'kairat almaty', 'kai'], 'https://a.espncdn.com/i/teamlogos/soccer/500/2528.png'],
    ['football', '', 'Liverpool', ['liverpool', 'liv'], 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png'],
    ['football', '', 'Manchester City', ['manchester city', 'man city', 'mancity', 'mnc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png'],
    ['football', '', 'Maccabi Haifa', ['maccabi haifa', 'haifa', 'mh'], 'https://a.espncdn.com/i/teamlogos/soccer/500/611.png'],
    ['football', '', 'Maccabi Tel Aviv', ['maccabi tel aviv', 'maccabi tel-aviv', 'maccabi tel-aviv fc', 'mta'], 'https://a.espncdn.com/i/teamlogos/soccer/500/524.png'],
    ['football', '', 'Marseille', ['marseille', 'olympique marseille', 'om', 'olm'], 'https://a.espncdn.com/i/teamlogos/soccer/500/176.png'],
    ['football', '', 'Napoli', ['napoli', 'nap'], 'https://a.espncdn.com/i/teamlogos/soccer/500/114.png'],
    ['football', '', 'Newcastle United', ['newcastle', 'newcastle united', 'new'], 'https://a.espncdn.com/i/teamlogos/soccer/500/361.png'],
    ['football', '', 'Nottingham Forest', ['nottingham forest', 'forest', 'nfo'], 'https://a.espncdn.com/i/teamlogos/soccer/500/393.png'],
    ['football', '', 'Olympiacos', ['olympiacos', 'olympiakos', 'oly'], 'https://a.espncdn.com/i/teamlogos/soccer/500/435.png'],
    ['football', '', 'Pafos', ['pafos', 'paf'], 'https://a.espncdn.com/i/teamlogos/soccer/500/22281.png'],
    ['football', '', 'Panathinaikos', ['panathinaikos', 'panathinaikos fc', 'pao', 'pan'], 'https://a.espncdn.com/i/teamlogos/soccer/500/443.png'],
    ['football', '', 'Paris Saint-Germain', ['paris saint germain', 'paris st germain', 'psg', 'paris sg'], 'https://a.espncdn.com/i/teamlogos/soccer/500/160.png'],
    ['football', '', 'FC Porto', ['porto', 'fc porto', 'por'], 'https://a.espncdn.com/i/teamlogos/soccer/500/437.png'],
    ['football', '', 'PSV Eindhoven', ['psv', 'psv eindhoven'], 'https://a.espncdn.com/i/teamlogos/soccer/500/148.png'],
    ['football', '', 'Racing Genk', ['racing genk', 'krc genk', 'genk'], 'https://a.espncdn.com/i/teamlogos/soccer/500/938.png'],
    ['football', '', 'Real Madrid', ['real madrid', 'rma'], 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png'],
    ['football', '', 'Real Betis', ['real betis', 'betis', 'bet'], 'https://a.espncdn.com/i/teamlogos/soccer/500/244.png'],
    ['football', '', 'RC Celta Vigo', ['celta vigo', 'celta de vigo', 'celta', 'vig'], 'https://a.espncdn.com/i/teamlogos/soccer/500/85.png'],
    ['football', '', 'SC Freiburg', ['freiburg', 'sc freiburg', 'frb'], 'https://a.espncdn.com/i/teamlogos/soccer/500/126.png'],
    ['football', '', 'Slavia Prague', ['slavia prague', 'slavia', 'slp'], 'https://a.espncdn.com/i/teamlogos/soccer/500/494.png'],
    ['football', '', 'Sporting CP', ['sporting cp', 'sporting lisbon', 'scp'], 'https://a.espncdn.com/i/teamlogos/soccer/500/2250.png'],
    ['football', '', 'Tottenham Hotspur', ['tottenham', 'tottenham hotspur', 'spurs', 'tot'], 'https://a.espncdn.com/i/teamlogos/soccer/500/367.png'],
    ['football', '', 'Union St.-Gilloise', ['union saint gilloise', 'union st gilloise', 'union sg', 'usg'], 'https://a.espncdn.com/i/teamlogos/soccer/500/5807.png'],
    ['football', '', 'FC Midtjylland', ['midtjylland', 'fc midtjylland', 'mid'], 'https://a.espncdn.com/i/teamlogos/soccer/500/572.png'],
    ['football', '', 'VfB Stuttgart', ['stuttgart', 'vfb stuttgart'], 'https://a.espncdn.com/i/teamlogos/soccer/500/134.png'],
    ['football', '', 'Villarreal', ['villarreal', 'vil'], 'https://a.espncdn.com/i/teamlogos/soccer/500/102.png'],
    ['football', 'MLS', 'Atlanta United FC', ['atlanta united', 'atl'], 'https://a.espncdn.com/i/teamlogos/soccer/500/18418.png'],
    ['football', 'MLS', 'Austin FC', ['atx'], 'https://a.espncdn.com/i/teamlogos/soccer/500/20906.png'],
    ['football', 'MLS', 'CF Montreal', ['club de foot montreal', 'cf montreal', 'montreal impact', 'mtl'], 'https://a.espncdn.com/i/teamlogos/soccer/500/9720.png'],
    ['football', 'MLS', 'Charlotte FC', ['clt'], 'https://a.espncdn.com/i/teamlogos/soccer/500/21300.png'],
    ['football', 'MLS', 'Chicago Fire FC', ['chicago fire', 'cff', 'chi'], 'https://a.espncdn.com/i/teamlogos/soccer/500/182.png'],
    ['football', 'MLS', 'Colorado Rapids', ['rapids', 'col'], 'https://a.espncdn.com/i/teamlogos/soccer/500/184.png'],
    ['football', 'MLS', 'Columbus Crew', ['crew', 'clb'], 'https://a.espncdn.com/i/teamlogos/soccer/500/183.png'],
    ['football', 'MLS', 'D.C. United', ['dc united', 'd c united', 'dc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/193.png'],
    ['football', 'MLS', 'FC Cincinnati', ['cincinnati', 'cin'], 'https://a.espncdn.com/i/teamlogos/soccer/500/18267.png'],
    ['football', 'MLS', 'FC Dallas', ['dallas', 'dal'], 'https://a.espncdn.com/i/teamlogos/soccer/500/185.png'],
    ['football', 'MLS', 'Houston Dynamo FC', ['houston dynamo', 'hou'], 'https://a.espncdn.com/i/teamlogos/soccer/500/6077.png'],
    ['football', 'MLS', 'Inter Miami CF', ['inter miami', 'miami', 'mia'], 'https://a.espncdn.com/i/teamlogos/soccer/500/20232.png'],
    ['football', 'MLS', 'LA Galaxy', ['los angeles galaxy', 'galaxy'], 'https://a.espncdn.com/i/teamlogos/soccer/500/187.png'],
    ['football', 'MLS', 'LAFC', ['los angeles fc', 'lafc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/18966.png'],
    ['football', '', 'Louisville City FC', ['loucity', 'louisville city'], 'https://a.espncdn.com/i/teamlogos/soccer/500/17832.png'],
    ['football', 'MLS', 'Minnesota United FC', ['minnesota united', 'min'], 'https://a.espncdn.com/i/teamlogos/soccer/500/17362.png'],
    ['football', 'MLS', 'Nashville SC', ['nashville', 'nsh'], 'https://a.espncdn.com/i/teamlogos/soccer/500/18986.png'],
    ['football', 'MLS', 'New England Revolution', ['revolution', 'revs', 'ne'], 'https://a.espncdn.com/i/teamlogos/soccer/500/189.png'],
    ['football', 'MLS', 'New York City FC', ['nycfc', 'nyc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/17606.png'],
    ['football', 'MLS', 'New York Red Bulls', ['red bull new york', 'ny red bulls', 'rbny'], 'https://a.espncdn.com/i/teamlogos/soccer/500/190.png'],
    ['football', 'MLS', 'Orlando City SC', ['orlando city', 'orl'], 'https://a.espncdn.com/i/teamlogos/soccer/500/12011.png'],
    ['football', 'MLS', 'Philadelphia Union', ['union', 'phi'], 'https://a.espncdn.com/i/teamlogos/soccer/500/10739.png'],
    ['football', 'MLS', 'Portland Timbers', ['timbers', 'por'], 'https://a.espncdn.com/i/teamlogos/soccer/500/9723.png'],
    ['football', 'MLS', 'Real Salt Lake', ['rsl', 'salt lake', 'slc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/4771.png'],
    ['football', 'MLS', 'San Diego FC', ['sdfc', 'sd'], 'https://a.espncdn.com/i/teamlogos/soccer/500/22529.png'],
    ['football', 'MLS', 'San Jose Earthquakes', ['earthquakes', 'quakes', 'sj'], 'https://a.espncdn.com/i/teamlogos/soccer/500/191.png'],
    ['football', 'MLS', 'Seattle Sounders FC', ['seattle sounders', 'sounders', 'sea'], 'https://a.espncdn.com/i/teamlogos/soccer/500/9726.png'],
    ['football', 'MLS', 'Sporting Kansas City', ['sporting kc', 'sporting kansas city', 'skc'], 'https://a.espncdn.com/i/teamlogos/soccer/500/186.png'],
    ['football', 'MLS', 'St. Louis CITY SC', ['st louis city sc', 'st. louis city sc', 'st louis city', 'stl'], 'https://a.espncdn.com/i/teamlogos/soccer/500/21812.png'],
    ['football', 'MLS', 'Toronto FC', ['toronto', 'tor'], 'https://a.espncdn.com/i/teamlogos/soccer/500/7318.png'],
    ['football', 'MLS', 'Vancouver Whitecaps', ['vancouver whitecaps', 'whitecaps', 'van'], 'https://a.espncdn.com/i/teamlogos/soccer/500/9727.png'],
    ['football', 'English Womens Super League', 'Aston Villa WFC', ['aston villa women', 'aston villa wfc', 'aston women', 'aston villa'], 'https://r2.thesportsdb.com/images/media/team/badge/lqfz1c1721821650.png'],
    ['football', 'English Womens Super League', 'Brighton WFC', ['brighton women', 'brighton wfc', "women's brighton", 'brighton'], 'https://r2.thesportsdb.com/images/media/team/badge/zn0x7h1605371909.png'],
    ['football', 'English Womens Super League', 'London City Lionesses', ['london city lionesses', 'london city', 'lionesses'], 'https://r2.thesportsdb.com/images/media/team/badge/524gpk1761707917.png'],
    ['football', 'English Womens Super League', 'Tottenham Women', ['tottenham women', 'tottenham wfc', "women's tottenham", 'tottenham'], 'https://r2.thesportsdb.com/images/media/team/badge/3dhd0j1605371995.png'],
    ['basketball', 'NCAA Basketball', 'Minnesota Golden Gophers', ['minnesota golden gophers', 'minnesota gophers', 'golden gophers', 'minnesota'], 'https://a.espncdn.com/i/teamlogos/ncaa/500/135.png'],
    ['basketball', 'NCAA Basketball', 'Nebraska Cornhuskers', ['nebraska cornhuskers', 'cornhuskers', 'huskers', 'nebraska'], 'https://a.espncdn.com/i/teamlogos/ncaa/500/158.png'],
    ['american-football', 'NCAA Football', 'Minnesota Golden Gophers', ['minnesota golden gophers', 'minnesota gophers', 'golden gophers', 'minnesota'], 'https://a.espncdn.com/i/teamlogos/ncaa/500/135.png'],
    ['american-football', 'NCAA Football', 'Nebraska Cornhuskers', ['nebraska cornhuskers', 'cornhuskers', 'huskers', 'nebraska'], 'https://a.espncdn.com/i/teamlogos/ncaa/500/158.png'],
    ['basketball', '', 'Maccabi Haifa', ['maccabi haifa', 'haifa', 'mh'], 'https://upload.wikimedia.org/wikipedia/en/4/4c/Maccabi_Haifa_B.C_logo.png'],
    ['basketball', '', 'Maccabi Tel Aviv', ['maccabi tel aviv', 'maccabi tel-aviv', 'maccabi tel-aviv bc', 'mta'], 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6b/Maccabi_Tel_Aviv_BC_logo.svg/250px-Maccabi_Tel_Aviv_BC_logo.svg.png'],
    ['basketball', 'WNBA', 'Atlanta Dream', ['dream', 'atl'], 'https://a.espncdn.com/i/teamlogos/wnba/500/atl.png'],
    ['basketball', 'WNBA', 'Chicago Sky', ['sky', 'chicago', 'chi'], 'https://a.espncdn.com/i/teamlogos/wnba/500/chi.png'],
    ['basketball', 'WNBA', 'Connecticut Sun', ['sun', 'con'], 'https://a.espncdn.com/i/teamlogos/wnba/500/con.png'],
    ['basketball', 'WNBA', 'Dallas Wings', ['wings', 'dal'], 'https://a.espncdn.com/i/teamlogos/wnba/500/dal.png'],
    ['basketball', 'WNBA', 'Golden State Valkyries', ['valkyries', 'gs'], 'https://a.espncdn.com/i/teamlogos/wnba/500/gs.png'],
    ['basketball', 'WNBA', 'Indiana Fever', ['fever', 'ind'], 'https://a.espncdn.com/i/teamlogos/wnba/500/ind.png'],
    ['basketball', 'WNBA', 'Las Vegas Aces', ['aces', 'lv'], 'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png'],
    ['basketball', 'WNBA', 'Los Angeles Sparks', ['sparks', 'la'], 'https://a.espncdn.com/i/teamlogos/wnba/500/la.png'],
    ['basketball', 'WNBA', 'Minnesota Lynx', ['lynx', 'min'], 'https://a.espncdn.com/i/teamlogos/wnba/500/min.png'],
    ['basketball', 'WNBA', 'New York Liberty', ['liberty', 'ny'], 'https://a.espncdn.com/i/teamlogos/wnba/500/ny.png'],
    ['basketball', 'WNBA', 'Phoenix Mercury', ['mercury', 'phx'], 'https://a.espncdn.com/i/teamlogos/wnba/500/phx.png'],
    ['basketball', 'WNBA', 'Portland Fire', ['fire', 'por'], 'https://a.espncdn.com/i/teamlogos/wnba/500/por.png'],
    ['basketball', 'WNBA', 'Seattle Storm', ['storm', 'sea'], 'https://a.espncdn.com/i/teamlogos/wnba/500/sea.png'],
    ['basketball', 'WNBA', 'Toronto Tempo', ['tempo', 'tor'], 'https://a.espncdn.com/i/teamlogos/wnba/500/tor.png'],
    ['basketball', 'WNBA', 'Washington Mystics', ['mystics', 'wsh'], 'https://a.espncdn.com/i/teamlogos/wnba/500/wsh.png']
  ].map(([sport, league, team, aliases, url]) => ({ sport, league, team, aliases, url }))
])

function sportMatchesLogoRule(ruleSport = '', sport = '') {
  const rule = normalizeSpace(ruleSport).toLowerCase()
  const value = normalizeSpace(sport).toLowerCase()
  if (!rule || !value) return true
  if (rule === value) return true
  if (['sports', 'sport', 'general', 'other'].includes(value)) return true
  if ((rule === 'boxing' || rule === 'fighting') && (value === 'boxing' || value === 'fighting')) return true
  if (rule === 'badminton' && value === 'tennis') return true
  if (rule === 'hockey' && value === 'ice-hockey') return true
  if (rule === 'american-football' && value === 'football') return false
  if (rule === 'football' && value === 'american-football') return false
  return false
}

function defaultLogoLookupText(fallbackInput = {}) {
  return normalizeSpace([
    fallbackInput.sport,
    fallbackInput.league,
    fallbackInput.competition,
    fallbackInput.eventTitle,
    fallbackInput.title,
    fallbackInput.rawTitle,
    fallbackInput.eventDetail,
    fallbackInput.detail
  ].filter(Boolean).join(' '))
}

function buildDefaultLogoRequests(fallbackInput = {}) {
  const sport = normalizeSpace(fallbackInput.sport)
  const text = defaultLogoLookupText(fallbackInput)
  const inputLeagueSlug = normalizedLeagueSlug(fallbackInput.competition || fallbackInput.league)
  const requests = []
  const seen = new Set()
  const addInspect = (canonicalId) => {
    const id = normalizeSpace(canonicalId)
    const key = `inspect:${id}`
    if (!id || seen.has(key)) return
    seen.add(key)
    requests.push({ type: 'inspect', canonicalId: id })
  }
  const addSearch = (searchSport, term) => {
    const q = normalizeSpace(term)
    const s = normalizeSpace(searchSport || sport)
    const key = `search:${s}:${q}`.toLowerCase()
    if (!s || !q || seen.has(key)) return
    seen.add(key)
    requests.push({ type: 'search', sport: s, search: q })
  }

  const addDirect = (directUrl) => {
    const url = normalizeSpace(directUrl)
    const key = `direct:${url}`
    if (!url || seen.has(key)) return
    seen.add(key)
    requests.push({ type: 'direct', url })
  }

  for (const directUrl of directLeagueLogoUrlsForInput(fallbackInput)) addDirect(directUrl)

  for (const rule of DEFAULT_LEAGUE_LOGO_RULES) {
    if (!sportMatchesLogoRule(rule.sport, sport)) continue
    const ruleLeagueSlug = Array.isArray(rule.canonicalIds)
      ? rule.canonicalIds.map((id) => String(id || '').match(/^sportsmeta:league:[^|]+\|(.+)$/i)?.[1]).find(Boolean)
      : ''
    if (ruleLeagueSlug && inputLeagueSlug && ruleLeagueSlug !== inputLeagueSlug && !isGenericLeagueSlug(inputLeagueSlug)) continue
    if (!rule.pattern.test(text)) continue
    for (const directUrl of rule.directLogoUrls || []) addDirect(directUrl)
    for (const canonicalId of rule.canonicalIds || []) addInspect(canonicalId)
    for (const term of rule.searchTerms || []) addSearch(rule.sport || sport, term)
  }

  return requests
}

function slugContainsToken(slug = '', token = '') {
  const source = leagueSlugFor(slug)
  const needle = leagueSlugFor(token)
  if (!source || !needle) return false
  return source === needle ||
    source.startsWith(`${needle}-`) ||
    source.endsWith(`-${needle}`) ||
    source.includes(`-${needle}-`)
}

function directLogoInputMatches({ ruleSport = '', ruleLeague = '', sport = '', league = '', text = '', pattern = null } = {}) {
  if (!sportMatchesLogoRule(ruleSport, sport)) return false
  const ruleLeagueSlug = normalizedLeagueSlug(ruleLeague)
  const leagueSlug = normalizedLeagueSlug(league)
  if (ruleLeagueSlug && leagueSlug) {
    if (ruleLeagueSlug === leagueSlug) return true
    if (!isGenericLeagueSlug(leagueSlug)) return false
  }
  return pattern ? pattern.test(normalizeSpace(text)) : false
}

function directLeagueLogoUrlsForInput(input = {}) {
  const sport = normalizeSpace(input.sport)
  const league = normalizeSpace(input.competition || input.league)
  const text = normalizeSpace([
    input.sport,
    input.league,
    input.competition,
    input.eventTitle,
    input.title,
    input.rawTitle,
    input.eventDetail,
    input.detail
  ].filter(Boolean).join(' '))
  const urls = []
  const seen = new Set()
  for (const rule of DIRECT_LEAGUE_LOGO_OVERRIDES) {
    if (!directLogoInputMatches({
      ruleSport: rule.sport,
      ruleLeague: rule.league,
      sport,
      league,
      text,
      pattern: rule.pattern
    })) continue
    for (const directUrl of rule.urls || []) {
      const url = normalizeSpace(directUrl)
      if (!url || seen.has(url)) continue
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

function directLeagueLogoUrlsForCanonicalId(canonicalId = '') {
  const id = normalizeSpace(canonicalId)
  const leagueMatch = /^sportsmeta:league:([^|]+)\|([^|]+)$/i.exec(id)
  if (leagueMatch) {
    return directLeagueLogoUrlsForInput({
      sport: leagueMatch[1],
      league: leagueMatch[2],
      title: id
    })
  }
  const eventMatch = /^sportsmeta:event:([^|]+)\|[^|]+\|([^|]+)/i.exec(id)
  if (eventMatch) {
    return directLeagueLogoUrlsForInput({
      sport: eventMatch[1],
      league: eventMatch[2],
      title: id
    })
  }
  return []
}

function directTeamLogoUrlFor({ sport = '', league = '', team = '' } = {}) {
  const sportSlug = resolveSportSlug(sport)
  const leagueSlug = normalizedLeagueSlug(league)
  const teamSlug = leagueSlugFor(team)
  if (!sportSlug || !teamSlug) return ''

  for (const rule of DIRECT_TEAM_LOGO_OVERRIDES) {
    if (resolveSportSlug(rule.sport) !== sportSlug) continue
    const ruleLeagueSlug = normalizedLeagueSlug(rule.league)
    if (ruleLeagueSlug) {
      if (!leagueSlug || ruleLeagueSlug !== leagueSlug) continue
    }
    const aliases = [rule.team, ...(rule.aliases || [])].map(leagueSlugFor).filter(Boolean)
    if (aliases.includes(teamSlug) || aliases.some((alias) => slugContainsToken(teamSlug, alias))) return rule.url
  }
  return ''
}

function teamLogoSearchTerms({ sport = '', league = '', team = '', text = '' } = {}) {
  const terms = []
  const seen = new Set()
  const add = (value) => {
    const term = normalizeSpace(value)
    const key = term.toLowerCase()
    if (!term || seen.has(key)) return
    seen.add(key)
    terms.push(term)
  }
  add(team)

  const sportSlug = resolveSportSlug(sport)
  const leagueSlug = leagueSlugFor(league)
  const haystack = normalizeSpace([team, text].filter(Boolean).join(' '))
  for (const alias of DEFAULT_TEAM_LOGO_ALIASES) {
    if (resolveSportSlug(alias.sport) !== sportSlug) continue
    if (leagueSlugFor(alias.league) && leagueSlug && leagueSlugFor(alias.league) !== leagueSlug) continue
    const allTerms = [alias.team, ...(alias.aliases || [])]
    if (allTerms.some((term) => slugContainsToken(haystack, term))) add(alias.team)
  }
  return terms
}

function parseSportsMetaEventId(canonicalId = '') {
  const match = /^sportsmeta:event:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)$/i.exec(normalizeSpace(canonicalId))
  if (!match) return null
  return {
    sport: leagueSlugFor(match[1]),
    date: match[2],
    league: leagueSlugFor(match[3]),
    home: leagueSlugFor(match[4]),
    away: leagueSlugFor(match[5])
  }
}

async function searchSportsMetaLogoSourceUrl({ sportsmetaBaseUrl = '', sport = '', search = '' } = {}) {
  const base = getPublicSportsMetaBaseUrl(sportsmetaBaseUrl)
  const sportSlug = resolveSportSlug(sport)
  const query = normalizeSpace(search)
  if (!base || !sportSlug || !query) return ''
  try {
    const url = `${base}/catalog/movie/sportsmeta-${encodeURIComponent(sportSlug)}/search=${encodeURIComponent(query)}.json`
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (!response.ok) return ''
    const payload = await response.json().catch(() => null)
    const metas = Array.isArray(payload?.metas) ? payload.metas.slice(0, 5) : []
    for (const meta of metas) {
      const id = normalizeSpace(meta?.id)
      if (!id) continue
      for (const variant of ['leagueLogo', 'logo']) {
        const sourceUrl = await loadInspectAssetSourceUrl({ canonicalId: id, sportsmetaBaseUrl, variant })
        if (sourceUrl) return sourceUrl
      }
    }
  } catch (_) {}
  return ''
}

async function searchSportsMetaTeamBadgeSourceUrl({ sportsmetaBaseUrl = '', sport = '', league = '', team = '', role = '', text = '' } = {}) {
  const base = getPublicSportsMetaBaseUrl(sportsmetaBaseUrl)
  const sportSlug = resolveSportSlug(sport)
  const leagueSlug = leagueSlugFor(league)
  const terms = teamLogoSearchTerms({ sport, league, team, text: '' })
  if (!base || !sportSlug || terms.length === 0) return null
  for (const term of terms) {
    try {
      const url = `${base}/catalog/movie/sportsmeta-${encodeURIComponent(sportSlug)}/search=${encodeURIComponent(term)}.json`
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      if (!response.ok) continue
      const payload = await response.json().catch(() => null)
      const metas = Array.isArray(payload?.metas) ? payload.metas.slice(0, 12) : []
      const targetSlugs = teamLogoSearchTerms({ sport, league, team: term, text: '' }).map(leagueSlugFor).filter(Boolean)
      for (const meta of metas) {
        const id = normalizeSpace(meta?.id)
        const parsed = parseSportsMetaEventId(id)
        if (!parsed || parsed.sport !== sportSlug) continue
        if (leagueSlug && parsed.league !== leagueSlug) continue
        const side = targetSlugs.includes(parsed.home) ? 'homeBadge' : targetSlugs.includes(parsed.away) ? 'awayBadge' : ''
        if (!side) continue
        const sourceUrl = await loadInspectAssetSourceUrl({ canonicalId: id, sportsmetaBaseUrl, variant: side })
        if (sourceUrl) return { sourceUrl, canonicalId: id, variant: side, search: term, role }
      }
    } catch (_) {}
  }
  return null
}

async function resolveDefaultTeamLogoImage({ sportsmetaBaseUrl = '', fallbackInput = {}, role = '', team = '', size = 260 } = {}) {
  const logoLookupAttempts = []
  const text = defaultLogoLookupText(fallbackInput)
  const directUrl = directTeamLogoUrlFor({
    sport: fallbackInput.sport,
    league: fallbackInput.league || fallbackInput.competition,
    team,
    text
  })
  if (directUrl) {
    const directCandidate = await fetchLogoCandidate({
      url: directUrl,
      key: role === 'awayBadge' ? 'away' : 'home',
      role,
      size,
      fallbackColor: colorForLabel(team, role === 'awayBadge' ? '#123c69' : '#0f766e')
    })
    if (directCandidate.attempt) logoLookupAttempts.push(directCandidate.attempt)
    if (directCandidate.image?.buffer) {
      return {
        image: directCandidate.image,
        logoLookupAttempts,
        sourceUrl: directUrl
      }
    }
  }
  const found = await searchSportsMetaTeamBadgeSourceUrl({
    sportsmetaBaseUrl,
    sport: fallbackInput.sport,
    league: fallbackInput.league,
    team,
    role,
    text
  })
  logoLookupAttempts.push({
    role,
    kind: 'real-team',
    url: team,
    status: found?.sourceUrl ? 200 : 0,
    result: found?.sourceUrl ? `team_source_url:${found.search}` : 'team_search_miss'
  })
  if (!found?.sourceUrl) return { image: null, logoLookupAttempts }
  const candidate = await fetchLogoCandidate({
    url: found.sourceUrl,
    key: role === 'awayBadge' ? 'away' : 'home',
    role,
    size,
    fallbackColor: colorForLabel(team, role === 'awayBadge' ? '#123c69' : '#0f766e')
  })
  if (candidate.attempt) logoLookupAttempts.push(candidate.attempt)
  return {
    image: candidate.image || null,
    logoLookupAttempts,
    sourceUrl: found.sourceUrl
  }
}

async function resolveDefaultTeamLogoImages({ sportsmetaBaseUrl = '', fallbackInput = {}, size = 260 } = {}) {
  const homeTeam = normalizeSpace(fallbackInput.homeTeam)
  const awayTeam = normalizeSpace(fallbackInput.awayTeam)
  if (!homeTeam && !awayTeam) return { homeBadge: null, awayBadge: null, logoLookupAttempts: [] }
  const [homeResult, awayResult] = await Promise.all([
    homeTeam
      ? resolveDefaultTeamLogoImage({ sportsmetaBaseUrl, fallbackInput, role: 'homeBadge', team: homeTeam, size })
      : Promise.resolve({ image: null, logoLookupAttempts: [] }),
    awayTeam
      ? resolveDefaultTeamLogoImage({ sportsmetaBaseUrl, fallbackInput, role: 'awayBadge', team: awayTeam, size })
      : Promise.resolve({ image: null, logoLookupAttempts: [] })
  ])
  return {
    homeBadge: homeResult.image || null,
    awayBadge: awayResult.image || null,
    logoLookupAttempts: [
      ...(homeResult.logoLookupAttempts || []),
      ...(awayResult.logoLookupAttempts || [])
    ]
  }
}

function uniqueLogoUrls(urls = []) {
  const seen = new Set()
  return urls
    .map(normalizeSpace)
    .filter((url) => {
      if (!url || seen.has(url)) return false
      seen.add(url)
      return true
    })
}

async function fetchLogoCandidateFromUrls({ urls = [], key = '', role = '', size = 210, fallbackColor = '#0f766e' } = {}) {
  const attempts = []
  for (const url of uniqueLogoUrls(urls)) {
    const result = await fetchLogoCandidate({ url, key, role, size, fallbackColor })
    if (result.attempt) attempts.push(result.attempt)
    if (result.image?.buffer) {
      return {
        image: result.image,
        attempt: result.attempt,
        attempts
      }
    }
  }
  return {
    image: null,
    attempt: attempts[attempts.length - 1] || {
      role: role || key || 'logo',
      kind: logoKindForCandidate(key),
      url: '',
      status: 0,
      result: 'missing_url'
    },
    attempts
  }
}

async function resolveDefaultLogoImage({ sportsmetaBaseUrl = '', fallbackInput = {}, size = 260, preferLeagueLogo = false } = {}) {
  const requests = buildDefaultLogoRequests(fallbackInput)
  const logoLookupAttempts = []
  const teamLogo = await resolveDefaultTeamLogoImages({ sportsmetaBaseUrl, fallbackInput, size })
  logoLookupAttempts.push(...(teamLogo.logoLookupAttempts || []))
  let leagueLogo = null
  let leagueLogoSourceUrl = ''
  for (const request of requests) {
    let sourceUrl = ''
    if (request.type === 'inspect') {
      sourceUrl = await loadInspectAssetSourceUrl({
        canonicalId: request.canonicalId,
        sportsmetaBaseUrl,
        variant: 'leagueLogo'
      })
      logoLookupAttempts.push({
        role: 'leagueLogo',
        kind: 'real-league',
        url: request.canonicalId,
        status: sourceUrl ? 200 : 0,
        result: sourceUrl ? 'source_url' : 'missing_source_url'
      })
    } else if (request.type === 'search') {
      sourceUrl = await searchSportsMetaLogoSourceUrl({
        sportsmetaBaseUrl,
        sport: request.sport,
        search: request.search
      })
      logoLookupAttempts.push({
        role: 'leagueLogo',
        kind: 'real-league',
        url: `${request.sport}:${request.search}`,
        status: sourceUrl ? 200 : 0,
        result: sourceUrl ? 'search_source_url' : 'search_miss'
      })
    } else if (request.type === 'direct') {
      sourceUrl = request.url
      logoLookupAttempts.push({
        role: 'leagueLogo',
        kind: 'real-league',
        url: request.url,
        status: 0,
        result: 'direct_source_url'
      })
    }
    if (!sourceUrl) continue
    const candidate = await fetchLogoCandidate({
      url: sourceUrl,
      key: 'league',
      role: 'leagueLogo',
      size,
      fallbackColor: '#b58b2a'
    })
    if (candidate.attempt) logoLookupAttempts.push(candidate.attempt)
    if (candidate.image?.buffer) {
      leagueLogo = candidate.image
      leagueLogoSourceUrl = sourceUrl
      break
    }
  }
  const matchupLogo = preferLeagueLogo
    ? null
    : await buildMatchupLogoPair(teamLogo.homeBadge, teamLogo.awayBadge, Math.max(size, 260))
  const image = preferLeagueLogo
    ? (leagueLogo || matchupLogo || null)
    : (matchupLogo || teamLogo.homeBadge || teamLogo.awayBadge || leagueLogo || null)
  return {
    image,
    homeBadge: teamLogo.homeBadge,
    awayBadge: teamLogo.awayBadge,
    leagueLogo,
    logoLookupAttempts,
    logoSourceUrl: image?.sourceUrl || leagueLogoSourceUrl || ''
  }
}

async function renderLogoImageVariantPng(image, variant = 'logo') {
  if (!image?.buffer) return null
  const dims = VARIANT_DIMENSIONS[variant] || VARIANT_DIMENSIONS.logo
  const logoSize = Math.round(Math.min(dims.width, dims.height) * 0.82)
  const logo = await resizeCompositionBuffer(image.buffer, logoSize, { frame: true })
  return sharp({
    create: {
      width: dims.width,
      height: dims.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: logo,
      left: Math.round((dims.width - logoSize) / 2),
      top: Math.round((dims.height - logoSize) / 2)
    }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
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

function renderUfcRedLogoSvg(size = 320) {
  const width = Math.max(160, Math.round(Number(size) || 320))
  const height = Math.round(width * 0.42)
  const fontSize = Math.round(width * 0.34)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
    <rect width="${width}" height="${height}" fill="none"/>
    <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.76)}" text-anchor="middle" font-family="Arial Black, Impact, Arial, sans-serif" font-size="${fontSize}" font-weight="900" font-style="italic" fill="#D20A0A" letter-spacing="0">UFC</text>
  </svg>`
}

async function fetchLogoCandidate({ url = '', key = '', role = '', size = 210, fallbackColor = '#0f766e' } = {}) {
  const targetUrl = normalizeSpace(url)
  const attempt = {
    role: role || key || 'logo',
    kind: logoKindForCandidate(key),
    url: targetUrl,
    status: 0,
    contentType: '',
    result: targetUrl ? 'pending' : 'missing_url'
  }
  if (!targetUrl) return { image: null, attempt }

  // Stremio cold-loads ~50 posters at once and many share the same league/team
  // logo. Cache the fetched+resized buffer keyed by `url|size` and dedup
  // in-flight requests so we run one HTTP fetch and one Sharp pipeline per
  // unique logo, not one per poster. Errors get a short TTL so a transient
  // upstream blip does not poison fixtures for hours.
  const cacheKey = `${targetUrl}|${size}`
  const now = Date.now()

  const hit = logoFetchCache.get(cacheKey)
  if (hit && hit.expiresAt > now) return applyCachedLogoResult(hit.value, attempt, { targetUrl, key, fallbackColor })

  let pending = logoFetchInFlight.get(cacheKey)
  if (!pending) {
    pending = (async () => {
      const value = {
        status: 0,
        contentType: '',
        headers: {},
        source: '',
        assetClass: '',
        delivery: '',
        generated: '',
        result: '',
        error: false,
        buffer: null,
        color: null
      }
      try {
        if (targetUrl === 'pvtkrrx://logo/ufc-red') {
          const sourceBuf = Buffer.from(renderUfcRedLogoSvg(Math.max(320, size * 2)))
          value.status = 200
          value.contentType = 'image/svg+xml'
          value.source = 'pvtkrrx-direct-logo'
          value.assetClass = 'logo'
          value.delivery = 'svg'
          value.buffer = await sharp(sourceBuf, { density: 192 })
            .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()
          value.color = '#D20A0A'
          value.result = 'real_logo'
          return value
        }
        const response = await fetch(targetUrl, {
          headers: { accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/*' },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
        })
        value.status = response.status
        value.contentType = String(response.headers.get('content-type') || '').toLowerCase()
        for (const [headerKey, headerValue] of response.headers.entries()) {
          value.headers[String(headerKey || '').toLowerCase()] = String(headerValue || '')
        }
        value.source = String(value.headers['x-sportsmeta-source'] || '')
        value.assetClass = String(value.headers['x-sportsmeta-asset-class'] || '')
        value.delivery = String(value.headers['x-sportsmeta-delivery-format'] || '')
        value.generated = String(value.headers['x-sportsmeta-generated-asset'] || '')

        if (!response.ok) {
          value.result = `http_${response.status}`
          value.error = true
          return value
        }
        if (!isSportsMetaRealLogoAsset(value.contentType, value.headers)) {
          value.result = 'not_real_logo'
          value.error = true
          return value
        }

        const sourceBuf = Buffer.from(await response.arrayBuffer())
        value.buffer = await sharp(sourceBuf, { density: 192 })
          .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer()
        value.color = await dominantColorFromImage(sourceBuf, fallbackColor)
        value.result = 'real_logo'
        return value
      } catch (error) {
        value.result = `fetch_error_${failureReason(error?.message || error)}`
        value.error = true
        return value
      }
    })().then((value) => {
      const ttl = value.error ? LOGO_ERROR_TTL_MS : RASTER_CACHE_TTL_MS
      logoFetchCache.set(cacheKey, { value, expiresAt: Date.now() + ttl })
      while (logoFetchCache.size > RASTER_CACHE_MAX_KEYS) {
        const oldestKey = logoFetchCache.keys().next().value
        if (!oldestKey) break
        logoFetchCache.delete(oldestKey)
      }
      return value
    }).finally(() => {
      logoFetchInFlight.delete(cacheKey)
    })
    logoFetchInFlight.set(cacheKey, pending)
  }

  const resolved = await pending
  return applyCachedLogoResult(resolved, attempt, { targetUrl, key, fallbackColor })
}

function applyCachedLogoResult(value, attempt, { targetUrl, key, fallbackColor }) {
  attempt.status = value.status
  attempt.contentType = value.contentType
  attempt.source = value.source
  attempt.assetClass = value.assetClass
  attempt.delivery = value.delivery
  attempt.generated = value.generated
  attempt.result = value.result
  if (value.error || !value.buffer) return { image: null, attempt }
  return {
    image: {
      // Shared by reference across concurrent callers — do not mutate.
      buffer: value.buffer,
      color: value.color || fallbackColor,
      contentType: value.contentType,
      headers: value.headers,
      kind: attempt.kind,
      sourceUrl: targetUrl,
      sourceKey: key
    },
    attempt
  }
}

// Mean luminance of a logo's opaque pixels. Light transparent PNG marks can
// vanish on the cream ticket-stub body, so framed slots choose a contrasting
// backing from this signal. Returns 0..255, or null when undecidable.
async function opaqueMeanLuminance(buffer) {
  try {
    const img = sharp(buffer, { density: 96 }).resize({
      width: 48,
      height: 48,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    const ch = info.channels
    let sum = 0
    let aSum = 0
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = ch >= 4 ? data[i + 3] : 255
      if (a < 16) continue
      const lum = (0.299 * r) + (0.587 * g) + (0.114 * b)
      sum += lum * (a / 255)
      aSum += a / 255
    }
    if (aSum < 1) return null
    return sum / aSum
  } catch (_) {
    return null
  }
}

async function resizeCompositionBuffer(buffer, size = 210, options = {}) {
  const canvasSize = Math.max(24, Math.round(Number(size) || 210))
  const framed = options.frame === true
  if (!framed) {
    return sharp(buffer, { density: 192 })
      .resize({ width: canvasSize, height: canvasSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  }
  const pad = Math.max(3, Math.round(canvasSize * 0.08))
  const innerSize = Math.max(12, canvasSize - pad * 2)
  const logo = await sharp(buffer, { density: 192 })
    .resize({ width: innerSize, height: innerSize, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const radius = Math.max(5, Math.round(canvasSize * 0.12))
  const stroke = Math.max(2, Math.round(canvasSize * 0.035))
  // Contrast-safe plate: dark backing for light marks, cream for dark marks.
  const lum = await opaqueMeanLuminance(logo)
  const lightLogo = lum !== null && lum >= 168
  const plateFill = lightLogo ? 'rgba(15,23,42,0.96)' : 'rgba(248,242,223,0.96)'
  const plateStroke = lightLogo ? 'rgba(248,242,223,0.92)' : '#ffffff'
  const frameSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
    <rect x="${Math.round(stroke / 2)}" y="${Math.round(stroke / 2)}" width="${canvasSize - stroke}" height="${canvasSize - stroke}" rx="${radius}" fill="${plateFill}" stroke="${plateStroke}" stroke-width="${stroke}"/>
  </svg>`)
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: frameSvg, left: 0, top: 0 },
      { input: logo, left: pad, top: pad }
    ])
    .png()
    .toBuffer()
}

async function buildMatchupLogoPair(homeBadge, awayBadge, size = 210) {
  if (!homeBadge?.buffer || !awayBadge?.buffer) return null
  const canvasSize = Math.max(32, Math.round(size))
  const badgeSize = Math.max(24, Math.round(canvasSize * 0.48))
  const vertical = Math.round((canvasSize - badgeSize) / 2)
  const homeBuffer = await resizeCompositionBuffer(homeBadge.buffer, badgeSize)
  const awayBuffer = await resizeCompositionBuffer(awayBadge.buffer, badgeSize)
  const buffer = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: homeBuffer, left: 0, top: vertical },
      { input: awayBuffer, left: canvasSize - badgeSize, top: vertical }
    ])
    .png()
    .toBuffer()
  return {
    buffer,
    color: homeBadge.color || awayBadge.color || '#0f766e',
    contentType: 'image/png',
    headers: {},
    kind: 'real-team',
    sourceUrl: homeBadge.sourceUrl || awayBadge.sourceUrl || '',
    sourceUrls: [homeBadge.sourceUrl, awayBadge.sourceUrl].filter(Boolean),
    sourceKey: 'matchup'
  }
}

async function renderTeamBadgeArtworkPng({ canonicalId = '', sportsmetaBaseUrl = '', variant = 'poster', template = 'editorial', requestedHome = '', requestedAway = '', requestedTitle = '' } = {}) {
  let effectiveCanonicalId = canonicalId
  let canonical = await loadCanonicalEvent(canonicalId, sportsmetaBaseUrl)
  const event = { ...(canonical?.event || {}) }

  // Catalog title order wins: SportsMeta canonical home/away encodes the
  // actual home venue (e.g. NHL home = team that owns the arena), but the
  // Stremio meta.name shown above the card is built from the Prowlarr/
  // SportsCult catalog title — and those orders can disagree. PVTKRRX
  // honours the catalog order so the rendered poster matches the displayed
  // title. Two signals indicate inversion:
  //   1. Request home/away (from ?home= / ?away=) is flipped vs canonical
  //   2. Request title parses as "X vs|v|@ Y" with X matching canonical away
  let assetHomeKey = 'homeBadge'
  let assetAwayKey = 'awayBadge'
  const canonHomeKey = leagueSlugFor(event.homeTeam)
  const canonAwayKey = leagueSlugFor(event.awayTeam)
  const reqHomeKey = leagueSlugFor(requestedHome)
  const reqAwayKey = leagueSlugFor(requestedAway)
  let inverted = (
    reqHomeKey && reqAwayKey && canonHomeKey && canonAwayKey &&
    reqHomeKey !== canonHomeKey &&
    reqHomeKey === canonAwayKey &&
    reqAwayKey === canonHomeKey
  )
  if (!inverted && requestedTitle && canonHomeKey && canonAwayKey) {
    const titleMatch = String(requestedTitle).match(/^\s*(.+?)\s+(vs?\.?|@)\s+(.+?)\s*$/i)
    if (titleMatch) {
      const sep = titleMatch[2].toLowerCase()
      // `vs`/`v` convention: first team is home. `@` convention (US sports):
      // first team is away, second is home.
      const isAtSeparator = sep === '@'
      const titleHomeKey = leagueSlugFor(isAtSeparator ? titleMatch[3] : titleMatch[1])
      const titleAwayKey = leagueSlugFor(isAtSeparator ? titleMatch[1] : titleMatch[3])
      if (
        titleHomeKey && titleAwayKey &&
        titleHomeKey !== canonHomeKey &&
        titleHomeKey === canonAwayKey &&
        titleAwayKey === canonHomeKey
      ) {
        inverted = true
      }
    }
  }
  if (inverted) {
    const swappedHome = event.awayTeam
    event.awayTeam = event.homeTeam
    event.homeTeam = swappedHome
    assetHomeKey = 'awayBadge'
    assetAwayKey = 'homeBadge'
  }

  const eventClass = classifySportsEvent(event)
  event.eventClass = eventClass
  const hasMatchup = eventClass === 'team_vs_team' && hasActualPair(event)

  if (!canonical?.event?.id) {
    // Solo-event league fallback: SportsCult RSS surfaces show-style fixtures
    // (e.g. "Inside the NBA", "Bundesliga Show", "UFC Deep Waters", "On The
    // Couch") that SportsMeta has no canonical event record for. The PARENT
    // league IS cached though — parse `sportsmeta:event:<sport>|<date>|<league>|...`
    // and try `sportsmeta:league:<sport>|<league>` so the renderer still
    // picks up the real NBA / Bundesliga / UFC mark instead of falling to a
    // generic sport-family glyph.
    const eventIdMatch = String(canonicalId).match(/^sportsmeta:event:([a-z0-9-]+)\|[^|]+\|([a-z0-9-]+)/i)
    if (eventIdMatch) {
      const fallbackLeagueId = `sportsmeta:league:${eventIdMatch[1].toLowerCase()}|${eventIdMatch[2].toLowerCase()}`
      const leagueCanonical = await loadCanonicalEvent(fallbackLeagueId, sportsmetaBaseUrl)
      if (leagueCanonical?.event?.id) {
        canonical = leagueCanonical
        effectiveCanonicalId = fallbackLeagueId
        // Backfill the in-flight event object so the renderer has sport +
        // league context for theme colours and labels. Don't overwrite home/
        // away — solo events don't have them and that's intentional.
        event.id = leagueCanonical.event.id
        event.sport = event.sport || leagueCanonical.event.sport
        event.league = event.league || leagueCanonical.event.league
        event.title = event.title || leagueCanonical.event.title
        event.name = event.name || leagueCanonical.event.name
      }
    }
    if (!canonical?.event?.id) {
      return {
        buffer: null,
        logoKind: 'fallback-glyph',
        logoFallbackReason: 'canonical_event_lookup_failed',
        logoLookupAttempts: []
      }
    }
  }

  // Resolve the real CDN URL for each badge variant via /inspect/asset. The
  // public canonical /asset/<variant>/<id> route returns a glyph SVG even when
  // a real logo exists in the upstream cache — inspect exposes the underlying
  // assetSourceUrl. We prefer the CDN URL when present; otherwise fall back to
  // the SportsMeta canonical URL (which the validator now correctly rejects
  // as a glyph if it is one).
  const inspectVariants = ['homeBadge', 'awayBadge', 'leagueLogo', 'logo', 'poster']
  const inspectResults = await Promise.all(
    inspectVariants.map((v) => loadInspectAssetSourceUrl({ canonicalId: effectiveCanonicalId, sportsmetaBaseUrl, variant: v }))
  )
  const inspectByVariant = Object.fromEntries(inspectVariants.map((v, i) => [v, inspectResults[i] || '']))
  const pickLogoUrl = (variantKey, fallbackUrl) => {
    const cdn = inspectByVariant[variantKey]
    if (cdn) return cdn
    return buildCanonicalBadgeUrl({ sportsmetaBaseUrl, canonicalId: effectiveCanonicalId, variant: variantKey, fallbackUrl })
  }
  const homeBadgeUrl = pickLogoUrl(assetHomeKey, canonical?.assets?.[assetHomeKey])
  const awayBadgeUrl = pickLogoUrl(assetAwayKey, canonical?.assets?.[assetAwayKey])
  const leagueLogoUrl = pickLogoUrl('leagueLogo', canonical?.assets?.leagueLogo || canonical?.assets?.logo)
  const eventLogoUrl = pickLogoUrl('logo', canonical?.assets?.logo)
  const eventPosterUrl = pickLogoUrl('poster', canonical?.assets?.poster)
  const directLookupText = normalizeSpace([
    requestedTitle,
    event.title,
    event.name,
    event.sport,
    event.league,
    event.homeTeam,
    event.awayTeam
  ].filter(Boolean).join(' '))
  const directHomeBadgeUrl = directTeamLogoUrlFor({
    sport: event.sport,
    league: event.league,
    team: event.homeTeam,
    text: directLookupText
  })
  const directAwayBadgeUrl = directTeamLogoUrlFor({
    sport: event.sport,
    league: event.league,
    team: event.awayTeam,
    text: directLookupText
  })
  const directLeagueLogoUrls = directLeagueLogoUrlsForInput({
    sport: event.sport,
    league: event.league,
    competition: event.league,
    title: directLookupText
  })

  const normalizedVariant = ['poster', 'landscape', 'background'].includes(variant) ? variant : 'poster'
  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  const layoutFamily = layoutFamilyForSportsPosterRender(normalizedTemplate, event)
  const dims = VARIANT_DIMENSIONS[normalizedVariant] || VARIANT_DIMENSIONS.poster
  const portrait = dims.height > dims.width
  const logoSize = Math.round(Math.min(dims.width * (portrait ? 0.42 : 0.22), dims.height * (portrait ? 0.36 : 0.4), portrait ? 260 : 390))
  const leagueLogoSize = Math.round(Math.min(dims.width * (portrait ? 0.42 : 0.22), dims.height * (portrait ? 0.34 : 0.36), portrait ? 260 : 390))
  const eventLogoSize = Math.max(logoSize, leagueLogoSize)
  const candidateResults = await Promise.all([
    hasMatchup
      ? fetchLogoCandidateFromUrls({ urls: [directHomeBadgeUrl, homeBadgeUrl], key: 'home', role: 'homeBadge', size: logoSize, fallbackColor: colorForLabel(event.homeTeam, '#0f766e') })
      : Promise.resolve({ image: null, attempt: { role: 'homeBadge', kind: 'real-team', url: homeBadgeUrl, status: 0, result: 'not_applicable_no_matchup' } }),
    hasMatchup
      ? fetchLogoCandidateFromUrls({ urls: [directAwayBadgeUrl, awayBadgeUrl], key: 'away', role: 'awayBadge', size: logoSize, fallbackColor: colorForLabel(event.awayTeam, '#123c69') })
      : Promise.resolve({ image: null, attempt: { role: 'awayBadge', kind: 'real-team', url: awayBadgeUrl, status: 0, result: 'not_applicable_no_matchup' } }),
    fetchLogoCandidateFromUrls({ urls: [...directLeagueLogoUrls, leagueLogoUrl], key: 'league', role: 'leagueLogo', size: leagueLogoSize, fallbackColor: '#b58b2a' }),
    fetchLogoCandidate({ url: eventLogoUrl, key: 'event', role: 'eventLogo', size: eventLogoSize, fallbackColor: '#b58b2a' }),
    fetchLogoCandidate({ url: eventPosterUrl, key: 'event', role: 'eventPoster', size: eventLogoSize, fallbackColor: '#b58b2a' })
  ])
  const logoLookupAttempts = candidateResults.flatMap((result) => result.attempts || [result.attempt].filter(Boolean))
  const homeBadge = candidateResults[0]?.image || null
  const awayBadge = candidateResults[1]?.image || null
  const leagueLogo = candidateResults[2]?.image || null
  const eventIdentity = candidateResults[3]?.image || candidateResults[4]?.image || null
  const matchupLogo = await buildMatchupLogoPair(homeBadge, awayBadge, Math.max(logoSize, leagueLogoSize))
  const theme = {
    homeColor: homeBadge?.color || leagueLogo?.color || eventIdentity?.color || colorForLabel(event.homeTeam || event.sport, '#0f766e'),
    awayColor: awayBadge?.color || colorForLabel(event.awayTeam || event.league || event.sport, '#123c69'),
    accentColor: paperAccentFromHex(leagueLogo?.color || homeBadge?.color || eventIdentity?.color || readableAccentFromHex(homeBadge?.color))
  }
  let artwork
  try {
    artwork = renderSportsPosterTemplateSvg({
      event,
      variant: normalizedVariant,
      template: normalizedTemplate,
      theme
    })
  } catch (error) {
    const emergency = await renderEmergencyTemplatePng(normalizedVariant, {
      canonicalId,
      sport: event.sport,
      league: event.league,
      title: event.title || event.name,
      eventTitle: event.title || event.name,
      date: event.date,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      rawTitle: event.title || event.name || canonicalId,
      source: 'sportsmeta'
    }, normalizedTemplate, error)
    return {
      ...emergency,
      logoKind: emergency.logoKind || 'fallback-glyph',
      logoFallbackReason: emergency.logoFallbackReason || `template_render_failed:${failureReason(error?.message || error)}`,
      logoLookupAttempts
    }
  }

  const artworkSlots = artwork.slots || []
  const hasTeamSpecificSlots = artworkSlots.some((slot) => slot.role === 'home' || slot.role === 'away')
  const selectLogoForSlot = (role = '') => {
    if (role === 'home') return homeBadge
    if (role === 'away') return awayBadge
    // The league slot must show the league/event identity. Falling back to a
    // team badge here puts (e.g.) the Arsenal crest in the UCL header slot,
    // which the user has explicitly flagged as wrong. Prefer leagueLogo, then
    // eventLogo/eventPoster (still "league-derived" for canonical events),
    // and never substitute a single team badge.
    if (role === 'league') return leagueLogo || eventIdentity || null
    if (hasMatchup && !hasTeamSpecificSlots && matchupLogo) return matchupLogo
    return leagueLogo || eventIdentity || homeBadge || awayBadge
  }
  const composites = []
  const logoSlots = []
  for (const slot of artworkSlots) {
    const image = selectLogoForSlot(slot.role)
    if (!image?.buffer) {
      const glyphSvg = renderLogoGlyphSvg({ role: slot.role, event, theme, size: slot.size })
      if (glyphSvg) {
        composites.push({
          input: await resizeCompositionBuffer(Buffer.from(glyphSvg), slot.size, { frame: true }),
          left: slot.left,
          top: slot.top
        })
      }
      logoSlots.push({
        role: slot.role,
        logoKind: 'fallback-glyph',
        logoFallbackReason: `slot_${slot.role || 'logo'}_real_logo_unresolved`,
        left: slot.left,
        top: slot.top,
        size: slot.size
      })
      continue
    }
    composites.push({
      input: await resizeCompositionBuffer(image.buffer, slot.size, { frame: true }),
      left: slot.left,
      top: slot.top
    })
    logoSlots.push({
      role: slot.role,
      logoKind: image.kind,
      logoSourceUrl: image.sourceUrl,
      logoSourceUrls: image.sourceUrls || [image.sourceUrl].filter(Boolean),
      sourceKey: image.sourceKey,
      left: slot.left,
      top: slot.top,
      size: slot.size
    })
  }
  if (artwork.overlay) {
    composites.push({ input: Buffer.from(artwork.overlay), left: 0, top: 0 })
  }

  const realLogoSlots = logoSlots.filter((slot) => slot.logoKind && !['fallback-glyph', 'missing-no-glyph'].includes(slot.logoKind))
  const fallbackLogoSlots = logoSlots.filter((slot) => slot.logoKind === 'fallback-glyph')

  const buffer = await sharp(Buffer.from(artwork.svg))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  return {
    buffer,
    selectedArtworkSource: 'pvtkrrx-public-template',
    selectedTemplate: normalizedTemplate,
    layoutFamily: artwork.layoutFamily || layoutFamily,
    eventClass,
    logoKind: preferredLogoKind(realLogoSlots.map((slot) => slot.logoKind)),
    logoSourceUrl: realLogoSlots[0]?.logoSourceUrl || '',
    logoSourceUrls: Array.from(new Set(realLogoSlots.flatMap((slot) => slot.logoSourceUrls || slot.logoSourceUrl || []).filter(Boolean))),
    logoFallbackReason: fallbackLogoSlots.length
      ? `fallback_slots=${fallbackLogoSlots.map((slot) => slot.role || 'logo').join(',')}`
      : '',
    logoRealCount: realLogoSlots.length,
    logoFallbackCount: fallbackLogoSlots.length,
    logoSlots,
    logoLookupAttempts
  }
}

async function renderTeamBadgeArtworkPngLegacy({ canonicalId = '', sportsmetaBaseUrl = '', variant = 'poster' } = {}) {
  const canonical = await loadCanonicalEvent(canonicalId, sportsmetaBaseUrl)
  const event = canonical?.event || {}
  if (!event.homeTeam || !event.awayTeam) return null

  const homeBadgeUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    canonicalId,
    variant: 'homeBadge',
    fallbackUrl: canonical?.assets?.homeBadge
  })
  const awayBadgeUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
    canonicalId,
    variant: 'awayBadge',
    fallbackUrl: canonical?.assets?.awayBadge
  })
  const leagueLogoUrl = buildCanonicalBadgeUrl({
    sportsmetaBaseUrl,
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
  // Whether we even attempted real-logo lookup. Audit needs to know this so a
  // missing-logo result on a default URL with no canonical doesn't get scored
  // as an unexpected fallback.
  let realLogoLookupAttempted = ['poster', 'landscape', 'background'].includes(variant) && Boolean(teamPosterContext?.canonicalId)
  let realLogoLookupFailure = null
  let defaultLogoContext = null

  if (realLogoLookupAttempted) {
    const teamPoster = await renderTeamBadgeArtworkPng({
      canonicalId: teamPosterContext.canonicalId,
      sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
      variant,
      template,
      requestedHome: teamPosterContext.requestedHome || fallbackInput.homeTeam || '',
      requestedAway: teamPosterContext.requestedAway || fallbackInput.awayTeam || '',
      requestedTitle: teamPosterContext.requestedTitle || fallbackInput.eventTitle || fallbackInput.title || ''
    })
    if (teamPoster?.buffer) {
      return {
        buffer: teamPoster.buffer,
        contentType: 'image/png',
        selectedArtworkSource: teamPoster.selectedArtworkSource || 'pvtkrrx-public-template',
        fallbackReason: `${reason}_with_real_logos`,
        selectedTemplate: teamPoster.selectedTemplate || template,
        layoutFamily: teamPoster.layoutFamily || layoutFamilyForSportsPosterRender(teamPoster.selectedTemplate || template, fallbackInput),
        renderFailure: teamPoster.renderFailure || '',
        eventClass: teamPoster.eventClass || '',
        logoKind: teamPoster.logoKind || 'real-event',
        logoSourceUrl: teamPoster.logoSourceUrl || '',
        logoSourceUrls: teamPoster.logoSourceUrls || [],
        logoFallbackReason: teamPoster.logoFallbackReason || '',
        logoRealCount: Number(teamPoster.logoRealCount || 0),
        logoFallbackCount: Number(teamPoster.logoFallbackCount || 0),
        logoSlots: teamPoster.logoSlots || [],
        logoLookupAttempts: teamPoster.logoLookupAttempts || [],
        realLogoLookupAttempted: true,
        httpStatus: status,
        upstreamContentType: contentType
      }
    }
    realLogoLookupFailure = teamPoster || null
  }

  if (!realLogoLookupAttempted && variant === 'poster') {
    const defaultLogo = await resolveDefaultLogoImage({
      sportsmetaBaseUrl: teamPosterContext?.sportsmetaBaseUrl,
      fallbackInput,
      size: 260
    })
    if (defaultLogo?.image?.buffer) {
      defaultLogoContext = {
        leagueLogo: defaultLogo.leagueLogo || null,
        homeBadge: defaultLogo.homeBadge || null,
        awayBadge: defaultLogo.awayBadge || null,
        logoLookupAttempts: defaultLogo.logoLookupAttempts || []
      }
    }
    if ((defaultLogo?.logoLookupAttempts || []).length > 0) {
      realLogoLookupAttempted = true
      realLogoLookupFailure = defaultLogo
    }
  }

  const localBackdrop = await readLocalSportBackdropFallback(variant, fallbackInput, reason, status, contentType, template)
  if (localBackdrop) {
    return {
      ...localBackdrop,
      // Audit needs to know whether real-logo lookup was attempted so a
      // backdrop served instead of real logos for a canonical event is
      // distinguishable from a backdrop served because no canonical was known.
      realLogoLookupAttempted
    }
  }

  const glyphReason = (defaultLogoContext?.leagueLogo || defaultLogoContext?.homeBadge || defaultLogoContext?.awayBadge)
    ? ''
    : realLogoLookupAttempted
    ? (realLogoLookupFailure?.logoFallbackReason || `${reason}_real_logo_lookup_failed`)
    : reason
  const rendered = await renderTemplateFallbackArtwork(variant, fallbackInput, template, glyphReason, defaultLogoContext || {})
  return {
    buffer: rendered.buffer,
    contentType: 'image/png',
    selectedArtworkSource: rendered.selectedArtworkSource || 'pvtkrrx-template-glyph',
    fallbackReason: rendered.renderFailure ? `${reason}_public_template_failed_${failureReason(rendered.renderFailure)}` : reason,
    selectedTemplate: rendered.selectedTemplate || template,
    layoutFamily: rendered.layoutFamily || layoutFamilyForSportsPosterRender(rendered.selectedTemplate || template, fallbackInput),
    renderFailure: rendered.renderFailure || '',
    eventClass: rendered.eventClass || '',
    logoKind: rendered.logoKind || 'fallback-glyph',
    logoSourceUrl: rendered.logoSourceUrl || '',
    logoSourceUrls: rendered.logoSourceUrls || [],
    logoFallbackReason: rendered.logoFallbackReason || glyphReason,
    logoRealCount: Number(rendered.logoRealCount || 0),
    logoFallbackCount: Number(rendered.logoFallbackCount || 0),
    logoSlots: rendered.logoSlots || [],
    logoLookupAttempts: realLogoLookupFailure?.logoLookupAttempts || rendered.logoLookupAttempts || [],
    realLogoLookupAttempted,
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

  const realLogoLookupAttemptedAtUpstream = ['poster', 'landscape', 'background'].includes(variant) && Boolean(teamPosterContext?.canonicalId)

  const pending = (async () => {
    const fallbackEventClass = fallbackInput.eventClass || classifySportsEvent(fallbackInput)
    try {
      const { status, contentType, buffer, headers } = await fetchUpstream(upstreamUrl)
      const generatedAsset = /^true$/i.test(String(headers?.['x-sportsmeta-generated-asset'] || ''))
      // Promote the SportsMeta `isSportsMetaRealRaster` signal so a passthrough
      // PNG with no real-asset header is no longer counted as a real logo by
      // the audit. SportsMeta sometimes serves text-only generated rasters via
      // the same /asset/poster route — those must score as fallback.
      const upstreamLooksReal = isSportsMetaRealRaster(contentType, headers)
      if (/^image\/(png|jpeg|jpg|webp)/i.test(contentType)) {
        if (variant === 'logo' && teamPosterContext?.canonicalId) {
          const realLogo = await tryRealLogoVariantPng({
            canonicalId: teamPosterContext.canonicalId,
            sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
            variant: 'logo'
          })
          if (realLogo?.buffer) {
            return {
              buffer: realLogo.buffer,
              contentType: 'image/png',
              selectedArtworkSource: 'pvtkrrx-cdn-logo',
              selectedTemplate: normalizeSportsPosterTemplate(template),
              layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
              eventClass: fallbackEventClass,
              fallbackReason: 'sportsmeta_logo_raster_replaced_with_cdn',
              logoKind: realLogo.logoKind || 'real-league',
              logoSourceUrl: realLogo.sourceUrl,
              logoSourceUrls: [realLogo.sourceUrl],
              logoFallbackReason: '',
              logoRealCount: 1,
              logoFallbackCount: 0,
              logoSlots: [],
              logoLookupAttempts: [{
                role: 'logo',
                kind: realLogo.logoKind || 'real-league',
                url: realLogo.sourceUrl,
                status: 200,
                result: 'real_logo'
              }],
              realLogoLookupAttempted: true,
              httpStatus: status,
              upstreamContentType: contentType
            }
          }
        }
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
          selectedTemplate: normalizeSportsPosterTemplate(template),
          layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
          eventClass: fallbackEventClass,
          fallbackReason: '',
          logoKind: upstreamLooksReal ? 'real-event' : 'fallback-glyph',
          logoSourceUrl: upstreamLooksReal ? upstreamUrl : '',
          logoSourceUrls: upstreamLooksReal ? [upstreamUrl] : [],
          logoFallbackReason: upstreamLooksReal ? '' : (generatedAsset ? 'sportsmeta_generated_raster' : 'sportsmeta_unverified_raster'),
          logoRealCount: upstreamLooksReal ? 1 : 0,
          logoFallbackCount: upstreamLooksReal ? 0 : 1,
          logoSlots: [],
          logoLookupAttempts: [],
          realLogoLookupAttempted: realLogoLookupAttemptedAtUpstream,
          httpStatus: status,
          upstreamContentType: contentType
        }
      }
      if (/^image\/svg\+xml/i.test(contentType) && shouldRenderLocalFallbackForSvg(variant)) {
        return renderLayoutFallback({
          variant,
          fallbackInput,
          teamPosterContext,
          template,
          status,
          contentType,
          reason: generatedAsset ? 'sportsmeta_central_svg_layout_replaced' : 'sportsmeta_svg_layout_replaced'
        })
      }
      if (/^image\/svg\+xml/i.test(contentType)) {
        // Logo variant + canonical event: SportsMeta's `/asset/logo/<id>` returns
        // a generated SVG glyph. The inspect endpoint reveals the real CDN
        // league badge. Resolve it before rasterizing the glyph.
        if (variant === 'logo' && teamPosterContext?.canonicalId) {
          const realLogo = await tryRealLogoVariantPng({
            canonicalId: teamPosterContext.canonicalId,
            sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
            variant: 'logo'
          })
          if (realLogo?.buffer) {
            return {
              buffer: realLogo.buffer,
              contentType: 'image/png',
              selectedArtworkSource: 'pvtkrrx-cdn-logo',
              selectedTemplate: normalizeSportsPosterTemplate(template),
              layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
              eventClass: fallbackEventClass,
              fallbackReason: 'sportsmeta_logo_svg_replaced_with_cdn',
              logoKind: realLogo.logoKind || 'real-league',
              logoSourceUrl: realLogo.sourceUrl,
              logoSourceUrls: [realLogo.sourceUrl],
              logoFallbackReason: '',
              logoRealCount: 1,
              logoFallbackCount: 0,
              logoSlots: [],
              logoLookupAttempts: [{
                role: 'logo',
                kind: realLogo.logoKind || 'real-league',
                url: realLogo.sourceUrl,
                status: 200,
                result: 'real_logo'
              }],
              realLogoLookupAttempted: true,
              httpStatus: status,
              upstreamContentType: contentType
            }
          }
        }
        if (variant === 'logo' && !teamPosterContext?.canonicalId) {
          const defaultLogo = await resolveDefaultLogoImage({
            sportsmetaBaseUrl: teamPosterContext?.sportsmetaBaseUrl,
            fallbackInput,
            size: 420,
            preferLeagueLogo: true
          })
          if (defaultLogo?.image?.buffer) {
            const logoPng = await renderLogoImageVariantPng(defaultLogo.image, 'logo')
            const logoSourceUrls = Array.from(new Set([
              ...(defaultLogo.image.sourceUrls || []),
              defaultLogo.image.sourceUrl,
              defaultLogo.logoSourceUrl
            ].filter(Boolean)))
            return {
              buffer: logoPng,
              contentType: 'image/png',
              selectedArtworkSource: 'pvtkrrx-cdn-logo',
              selectedTemplate: normalizeSportsPosterTemplate(template),
              layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
              eventClass: fallbackEventClass,
              fallbackReason: 'sportsmeta_default_logo_svg_replaced_with_cdn',
              logoKind: defaultLogo.image.kind || 'real-league',
              logoSourceUrl: logoSourceUrls[0] || '',
              logoSourceUrls,
              logoFallbackReason: '',
              logoRealCount: 1,
              logoFallbackCount: 0,
              logoSlots: [],
              logoLookupAttempts: defaultLogo.logoLookupAttempts || [],
              realLogoLookupAttempted: true,
              httpStatus: status,
              upstreamContentType: contentType
            }
          }
        }
        const png = await rasterizeToPng(buffer, variant)
        const upstreamSvgLooksReal = variant === 'logo' && isSportsMetaRealLogoAsset(contentType, headers)
        return {
          buffer: png,
          contentType: 'image/png',
          selectedArtworkSource: 'sportsmeta-raster',
          selectedTemplate: normalizeSportsPosterTemplate(template),
          layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
          eventClass: fallbackEventClass,
          fallbackReason: 'sportsmeta_svg_rasterized',
          logoKind: upstreamSvgLooksReal ? 'real-event' : 'fallback-glyph',
          logoSourceUrl: upstreamSvgLooksReal ? upstreamUrl : '',
          logoSourceUrls: upstreamSvgLooksReal ? [upstreamUrl] : [],
          logoFallbackReason: upstreamSvgLooksReal ? '' : (generatedAsset ? 'sportsmeta_generated_svg_rasterized' : 'sportsmeta_svg_rasterized'),
          logoRealCount: upstreamSvgLooksReal ? 1 : 0,
          logoFallbackCount: upstreamSvgLooksReal ? 0 : 1,
          logoSlots: [],
          logoLookupAttempts: [],
          realLogoLookupAttempted: realLogoLookupAttemptedAtUpstream,
          httpStatus: status,
          upstreamContentType: contentType
        }
      }
      const png = await rasterizeToPng(buffer, variant)
      return {
        buffer: png,
        contentType: 'image/png',
        selectedArtworkSource: 'sportsmeta-raster',
        selectedTemplate: normalizeSportsPosterTemplate(template),
        layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
        eventClass: fallbackEventClass,
        fallbackReason: /^image\/svg\+xml/i.test(contentType) ? 'sportsmeta_svg_rasterized' : 'sportsmeta_non_raster_rasterized',
        logoKind: 'fallback-glyph',
        logoSourceUrl: '',
        logoSourceUrls: [],
        logoFallbackReason: 'sportsmeta_non_raster_rasterized',
        logoRealCount: 0,
        logoFallbackCount: 1,
        logoSlots: [],
        logoLookupAttempts: [],
        realLogoLookupAttempted: realLogoLookupAttemptedAtUpstream,
        httpStatus: status,
        upstreamContentType: contentType
      }
    } catch (error) {
      if (!shouldRenderLocalFallbackForSvg(variant) && variant !== 'logo') throw error
      if (variant === 'logo' && teamPosterContext?.canonicalId) {
        const realLogo = await tryRealLogoVariantPng({
          canonicalId: teamPosterContext.canonicalId,
          sportsmetaBaseUrl: teamPosterContext.sportsmetaBaseUrl,
          variant: 'logo'
        })
        if (realLogo?.buffer) {
          return {
            buffer: realLogo.buffer,
            contentType: 'image/png',
            selectedArtworkSource: 'pvtkrrx-cdn-logo',
            selectedTemplate: normalizeSportsPosterTemplate(template),
            layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
            eventClass: fallbackEventClass,
            fallbackReason: 'upstream_error_logo_replaced_with_cdn',
            logoKind: realLogo.logoKind || 'real-league',
            logoSourceUrl: realLogo.sourceUrl,
            logoSourceUrls: [realLogo.sourceUrl],
            logoFallbackReason: '',
            logoRealCount: 1,
            logoFallbackCount: 0,
            logoSlots: [],
            logoLookupAttempts: [{
              role: 'logo',
              kind: realLogo.logoKind || 'real-league',
              url: realLogo.sourceUrl,
              status: 200,
              result: 'real_logo'
            }],
            realLogoLookupAttempted: true,
            httpStatus: error?.status || 0,
            upstreamContentType: ''
          }
        }
      }
      if (variant === 'logo' && !teamPosterContext?.canonicalId) {
        const defaultLogo = await resolveDefaultLogoImage({
          sportsmetaBaseUrl: teamPosterContext?.sportsmetaBaseUrl,
          fallbackInput,
          size: 420,
          preferLeagueLogo: true
        })
        if (defaultLogo?.image?.buffer) {
          const logoPng = await renderLogoImageVariantPng(defaultLogo.image, 'logo')
          const logoSourceUrls = Array.from(new Set([
            ...(defaultLogo.image.sourceUrls || []),
            defaultLogo.image.sourceUrl,
            defaultLogo.logoSourceUrl
          ].filter(Boolean)))
          return {
            buffer: logoPng,
            contentType: 'image/png',
            selectedArtworkSource: 'pvtkrrx-cdn-logo',
            selectedTemplate: normalizeSportsPosterTemplate(template),
            layoutFamily: layoutFamilyForSportsPosterRender(template, fallbackInput),
            eventClass: fallbackEventClass,
            fallbackReason: 'upstream_error_default_logo_replaced_with_cdn',
            logoKind: defaultLogo.image.kind || 'real-league',
            logoSourceUrl: logoSourceUrls[0] || '',
            logoSourceUrls,
            logoFallbackReason: '',
            logoRealCount: 1,
            logoFallbackCount: 0,
            logoSlots: [],
            logoLookupAttempts: defaultLogo.logoLookupAttempts || [],
            realLogoLookupAttempted: true,
            httpStatus: error?.status || 0,
            upstreamContentType: ''
          }
        }
      }
      if (shouldRenderLocalFallbackForSvg(variant)) {
        const upstreamFailureReason = `upstream_${error?.status || 'error'}`
        const retry = await renderLayoutFallback({
          variant,
          fallbackInput,
          teamPosterContext,
          template,
          status: error?.status || 0,
          contentType: '',
          reason: upstreamFailureReason
        })
        if (retry?.buffer) return retry
      }
      const localBackdrop = await readLocalSportBackdropFallback(
        variant,
        fallbackInput,
        `upstream_${error?.status || 'error'}_sport_4k_backdrop`,
        error?.status || 0,
        '',
        template
      )
      if (localBackdrop) return { ...localBackdrop, realLogoLookupAttempted: realLogoLookupAttemptedAtUpstream }
      const upstreamFailureReason = `upstream_${error?.status || 'error'}`
      const rendered = await renderTemplateFallbackArtwork(variant, fallbackInput, template, upstreamFailureReason)
      return {
        buffer: rendered.buffer,
        contentType: 'image/png',
        selectedArtworkSource: rendered.selectedArtworkSource || 'pvtkrrx-template-glyph',
        fallbackReason: rendered.renderFailure
          ? `${upstreamFailureReason}_public_template_failed_${failureReason(rendered.renderFailure)}`
          : upstreamFailureReason,
        selectedTemplate: rendered.selectedTemplate || template,
        layoutFamily: rendered.layoutFamily || layoutFamilyForSportsPosterRender(rendered.selectedTemplate || template, fallbackInput),
        renderFailure: rendered.renderFailure || '',
        eventClass: rendered.eventClass || '',
        logoKind: rendered.logoKind || 'fallback-glyph',
        logoSourceUrl: rendered.logoSourceUrl || '',
        logoSourceUrls: rendered.logoSourceUrls || [],
        logoFallbackReason: rendered.logoFallbackReason || upstreamFailureReason,
        logoRealCount: Number(rendered.logoRealCount || 0),
        logoFallbackCount: Number(rendered.logoFallbackCount || 0),
        logoSlots: rendered.logoSlots || [],
        logoLookupAttempts: rendered.logoLookupAttempts || [],
        realLogoLookupAttempted: realLogoLookupAttemptedAtUpstream,
        httpStatus: error?.status || 0,
        upstreamContentType: ''
      }
    }
  })()
    .then((value) => {
      // Store the entry tagged as a memory-cache entry. The CURRENT response
      // is the fresh render (cacheLayer='rendered'); every SUBSEQUENT serve
      // of this key from rasterCache must report cache=memory (BUG 3: the
      // header used to be permanently stuck on 'rendered' because the stored
      // value carried 'rendered', masking the real hit rate).
      const storedValue = { ...value, cacheLayer: value.cacheLayer === 'disk' || value.cacheLayer === 'postgres' ? value.cacheLayer : 'memory' }
      rasterCache.set(cacheKey, { value: storedValue, expiresAt: Date.now() + RASTER_CACHE_TTL_MS })
      trimCache()
      writeSportsArtworkDiskCache(cacheKey, storedValue, {
        ttlMs: RASTER_CACHE_TTL_MS,
        maxEntries: RASTER_CACHE_MAX_KEYS
      }).catch(() => {})
      return { ...value, cacheLayer: value.cacheLayer || 'rendered' }
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

function resolveSportsPosterTemplateFromConfig(config = {}, req = null) {
  // (1) URL-forwarded stamped entitlement. The configured catalog/meta
  // handler decrypted the user's token and forwarded the stamp
  // (entSource/entHash + reqTemplate) on the artwork URL because this route
  // has no token of its own. Re-run the SAME verification the catalog ran,
  // against the LIVE env owner/admin list — a leaked URL with a non-owner
  // (or absent) stamp still verifies to NONE -> ticket-stub, so the public
  // free-tier lock is intact; only a genuine env-verifiable owner/admin
  // stamp unlocks the selected style. This is what makes a fresh configured
  // install that selected broadcast/glitch/etc. actually render it.
  const q = req && typeof req.query === 'object' ? req.query : {}
  const urlReqTemplate = String(q.reqTemplate || '').trim()
  const urlEntSource = String(q.entSource || '').trim()
  const urlEntHash = String(q.entHash || '').trim()
  const urlVerifiableSource = urlEntSource === ENTITLEMENT_SOURCE.OWNER_OVERRIDE ||
    urlEntSource === ENTITLEMENT_SOURCE.ADMIN_OVERRIDE
  if (urlVerifiableSource && urlEntHash) {
    const urlVerified = verifyStampedSportsPosterEntitlement({
      requestedTemplate: urlReqTemplate,
      stampedSource: urlEntSource,
      stampedHash: urlEntHash
    })
    if (urlVerified.allowed && urlVerified.resolvedTemplate) {
      return resolveSportsPosterTemplate(urlVerified.resolvedTemplate)
    }
  }

  // (2) Otherwise honour the stamped entitlement on the decrypted config
  // token (when this handler IS given one); revoke instantly when the env
  // owner list no longer covers the stamped owner-email hash.
  const requestedTemplate = String(config?.sportsPosterTemplate || '').trim()
  const stampedSource = String(config?.entitlementSource || '').trim()
  const stampedHash = String(config?.entitlementOwnerEmailHash || '').trim()
  const verified = verifyStampedSportsPosterEntitlement({
    requestedTemplate,
    stampedSource,
    stampedHash
  })
  if (verified.allowed && verified.resolvedTemplate) {
    return resolveSportsPosterTemplate(verified.resolvedTemplate)
  }

  // (3) Server-side admin override remains a fallback for public/no-token
  // artwork. Verified owner/admin config must win so the owner can change
  // layout without reinstalling the Stremio addon.
  const serverAdminTemplate = resolveServerAdminPosterTemplate(process.env)
  if (serverAdminTemplate) return resolveSportsPosterTemplate(serverAdminTemplate)

  return resolveSportsPosterTemplate('ticket-stub')
}

function redactUrl(value) {
  return String(value || '')
    .replace(/\/member\/([^/?#]+)\/asset\//i, '/member/[redacted]/asset/')
    .replace(/([?&](?:token|key|password|secret)=)[^&#]+/ig, '$1[redacted]')
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
    const selectedTemplate = normalizeSportsPosterTemplate(result.selectedTemplate || normalizedTemplate)
    const layoutFamily = result.layoutFamily || layoutFamilyForSportsPosterRender(selectedTemplate, fallbackInput)
    // Logo provenance is propagated as response headers so the audit
    // verifier can score real logo vs glyph fallback without re-running the
    // pipeline. Default to fallback-glyph if absent so missing markers fail
    // safe (fail audit, not silently pass).
    const logoKind = String(result.logoKind || 'fallback-glyph')
    const logoSourceUrls = Array.isArray(result.logoSourceUrls) ? result.logoSourceUrls : []
    const logoSourceUrl = String(result.logoSourceUrl || logoSourceUrls[0] || '')
    const logoFallbackReason = String(result.logoFallbackReason || '')
    const logoRealCount = Number(result.logoRealCount || 0)
    const logoFallbackCount = Number(result.logoFallbackCount || 0)
    const logoLookupAttempts = Array.isArray(result.logoLookupAttempts) ? result.logoLookupAttempts : []
    const logoSlots = Array.isArray(result.logoSlots) ? result.logoSlots : []
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000, stale-if-error=2592000')
    res.setHeader('X-PVTKRRX-Artwork-Upstream', redactUrl(upstreamUrl))
    res.setHeader('X-PVTKRRX-Artwork-Source', result.selectedArtworkSource || 'unknown')
    res.setHeader('X-PVTKRRX-Artwork-Cache', result.cacheLayer || 'rendered')
    res.setHeader('X-PVTKRRX-Revision', resolveRuntimeRevision())
    res.setHeader('X-PVTKRRX-Artwork-Cache-Version', SPORTS_ARTWORK_PROXY_VERSION)
    res.setHeader('X-PVTKRRX-Artwork-Render-Version', LOCAL_ARTWORK_RENDER_VERSION)
    res.setHeader('X-PVTKRRX-Artwork-Template', selectedTemplate)
    res.setHeader('X-PVTKRRX-Artwork-Layout-Family', layoutFamily)
    res.setHeader('X-PVTKRRX-Artwork-Logo-Kind', logoKind)
    res.setHeader('X-PVTKRRX-Logo-Kind', logoKind)
    res.setHeader('X-PVTKRRX-Logo-Real-Count', String(logoRealCount))
    res.setHeader('X-PVTKRRX-Logo-Fallback-Count', String(logoFallbackCount))
    res.setHeader('X-PVTKRRX-Artwork-Real-Logo-Lookup-Attempted', result.realLogoLookupAttempted ? 'true' : 'false')
    res.setHeader('X-PVTKRRX-Logo-Lookup-Attempted', result.realLogoLookupAttempted ? 'true' : 'false')
    if (logoFallbackReason) {
      res.setHeader('X-PVTKRRX-Artwork-Logo-Fallback-Reason', logoFallbackReason)
      res.setHeader('X-PVTKRRX-Logo-Fallback-Reason', logoFallbackReason)
    }
    if (logoSourceUrl) res.setHeader('X-PVTKRRX-Logo-Source-Url', redactUrl(logoSourceUrl))
    if (logoSourceUrls.length) {
      res.setHeader('X-PVTKRRX-Artwork-Logo-Source-Count', String(logoSourceUrls.length))
      res.setHeader('X-PVTKRRX-Logo-Source-Count', String(logoSourceUrls.length))
      res.setHeader('X-PVTKRRX-Artwork-Logo-Source-Urls', logoSourceUrls.map(redactUrl).join(' | '))
      res.setHeader('X-PVTKRRX-Logo-Source-Urls', logoSourceUrls.map(redactUrl).join(' | '))
    }
    if (logoSlots.length) {
      const slotSummary = logoSlots
        .map((slot) => [
          slot.role || 'logo',
          slot.logoKind || 'unknown',
          redactUrl(slot.logoSourceUrl || slot.logoFallbackReason || '')
        ].join(':'))
        .join(' | ')
      res.setHeader('X-PVTKRRX-Logo-Slots', slotSummary.slice(0, 3800))
    }
    if (logoLookupAttempts.length) {
      res.setHeader('X-PVTKRRX-Logo-Lookup-Attempts', summarizeLogoAttempts(logoLookupAttempts))
    }
    if (result.sportBackdropBucket) res.setHeader('X-PVTKRRX-Sport-Backdrop', result.sportBackdropBucket)
    if (result.sportBackdropFallbackReason) res.setHeader('X-PVTKRRX-Sport-Backdrop-Fallback', result.sportBackdropFallbackReason)
    if (result.eventClass) res.setHeader('X-PVTKRRX-Sports-Event-Class', result.eventClass)
    if (result.renderFailure) res.setHeader('X-PVTKRRX-Artwork-Render-Failure', result.renderFailure)
    if (result.fallbackReason) res.setHeader('X-PVTKRRX-Artwork-Fallback', result.fallbackReason)
    console.log(
      `[sports-artwork] selectedArtworkSource=${result.selectedArtworkSource || 'unknown'} variant=${variant} template=${selectedTemplate} layoutFamily=${layoutFamily} eventClass=${result.eventClass || ''} logoKind=${logoKind} realLogoCount=${logoRealCount} fallbackLogoCount=${logoFallbackCount} realLogoLookupAttempted=${result.realLogoLookupAttempted ? 'true' : 'false'} logoSourceUrl="${redactUrl(logoSourceUrl)}" logoFallbackReason="${logoFallbackReason}" logoLookupAttempts="${summarizeLogoAttempts(logoLookupAttempts)}" cache=${result.cacheLayer || 'rendered'} artworkUrl=${redactUrl(upstreamUrl)} backdropFallbackReason="${result.sportBackdropFallbackReason || ''}" fallbackReason=${result.fallbackReason || ''} renderFailure="${result.renderFailure || ''}" httpStatus=${result.httpStatus || ''} contentType=${result.upstreamContentType || contentType || ''}`
    )
    res.status(200).end(buffer)
  } catch (err) {
    const status = err?.status === 404 ? 404 : 502
    console.warn(`[sports-artwork] proxy failed variant=${variant} upstream=${upstreamUrl}: ${err.message}`)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    res.status(status).type('text/plain').send(status === 404 ? 'sports artwork not found' : 'sports artwork upstream error')
  }
}

function buildDefaultArtworkCacheKey({ variant, template, sportSlug, league, title, date, homeTeam, awayTeam, detail, eventClass, rawTitle, sportsmetaBaseUrl }) {
  // BUG 3 (cache hit rate): seeders/size are per-torrent and DO NOT appear on
  // any rendered poster (verified: ticket-stub "SECTION A-12-4" is hardcoded,
  // stubSerial/perfRow derive from teams/date only, no template reads
  // seeders/size). Keying on them meant every torrent variant of the same
  // logical event minted a fresh cache key -> rendered every request +
  // re-ran the SportsMeta /resolve lookup. They are dropped from the key so
  // sibling torrents of one event share one cached poster.
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
    (eventClass || '').trim().toLowerCase(),
    (rawTitle || '').trim().toLowerCase(),
    (sportsmetaBaseUrl || '').trim().toLowerCase()
  ].join('|')
}

function buildCanonicalArtworkCacheKey({ variant, template, canonicalId, sportsmetaBaseUrl, requestedHome = '', requestedAway = '', requestedTitle = '' }) {
  // Orientation must be in the cache key: SportsMeta canonical home/away can
  // disagree with the catalog title order (e.g. NHL canonical home = actual
  // venue but catalog wrote "Away vs Home"). PVTKRRX honours the catalog
  // order so the rendered poster matches Stremio's displayed meta.name. Both
  // request home/away and the request title can carry the catalog signal, so
  // both contribute to the cache key.
  const homeKey = leagueSlugFor(requestedHome)
  const awayKey = leagueSlugFor(requestedAway)
  const titleKey = leagueSlugFor(requestedTitle)
  return [
    LOCAL_ARTWORK_RENDER_VERSION,
    'id',
    variant,
    normalizeSportsPosterTemplate(template),
    canonicalId,
    (sportsmetaBaseUrl || '').trim().toLowerCase(),
    homeKey,
    awayKey,
    titleKey
  ].join('|')
}

async function resolveDefaultArtworkCanonical(args = {}) {
  const {
    sportsmetaBaseUrl = '',
    sportSlug = '',
    league = '',
    title = '',
    date = '',
    homeTeam = '',
    awayTeam = ''
  } = args
  const hasStructuredQuery = Boolean(date && ((homeTeam && awayTeam) || title))
  if (!hasStructuredQuery) return null
  const memoKey = [
    (sportsmetaBaseUrl || '').trim().toLowerCase(),
    (sportSlug || '').trim().toLowerCase(),
    (league || '').trim().toLowerCase(),
    (title || '').trim().toLowerCase(),
    (date || '').trim().toLowerCase(),
    (homeTeam || '').trim().toLowerCase(),
    (awayTeam || '').trim().toLowerCase()
  ].join('|')
  const now = Date.now()
  const hit = resolveCanonicalCache.get(memoKey)
  if (hit && hit.expiresAt > now) return hit.value
  if (resolveCanonicalInFlight.has(memoKey)) return resolveCanonicalInFlight.get(memoKey)

  const pending = (async () => resolveDefaultArtworkCanonicalUncached(args))()
    .then((value) => {
      // Negative (no-match) results expire faster than positive ones so a
      // later SportsMeta ingest is still picked up; positive results are as
      // durable as the raster cache.
      const ttl = value && value.canonicalId ? RASTER_CACHE_TTL_MS : Math.min(RASTER_CACHE_TTL_MS, 15 * 60 * 1000)
      resolveCanonicalCache.set(memoKey, { value: value || null, expiresAt: Date.now() + ttl })
      while (resolveCanonicalCache.size > RASTER_CACHE_MAX_KEYS) {
        const oldest = resolveCanonicalCache.keys().next().value
        if (!oldest) break
        resolveCanonicalCache.delete(oldest)
      }
      return value || null
    })
    .finally(() => { resolveCanonicalInFlight.delete(memoKey) })

  resolveCanonicalInFlight.set(memoKey, pending)
  return pending
}

async function resolveDefaultArtworkCanonicalUncached({
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
    const ambiguous = await resolveAmbiguousArtworkCanonical({
      sportsmetaBaseUrl,
      sportSlug,
      league,
      title,
      date,
      homeTeam,
      awayTeam,
      fallbackInput
    })
    if (ambiguous) return ambiguous
    return null
  }
}

async function resolveAmbiguousArtworkCanonical({
  sportsmetaBaseUrl = '',
  sportSlug = '',
  league = '',
  title = '',
  date = '',
  homeTeam = '',
  awayTeam = '',
  fallbackInput = {}
} = {}) {
  const homeSlug = leagueSlugFor(homeTeam || fallbackInput.homeTeam)
  const awaySlug = leagueSlugFor(awayTeam || fallbackInput.awayTeam)
  const sport = resolveSportSlug(sportSlug || fallbackInput.sport)
  if (!homeSlug || !awaySlug || !sport) return null

  try {
    const url = new URL(`${getPublicSportsMetaBaseUrl(sportsmetaBaseUrl)}/resolve`)
    const query = {
      recordType: 'event',
      sport,
      league,
      date,
      home: homeTeam || fallbackInput.homeTeam,
      away: awayTeam || fallbackInput.awayTeam,
      event: title || fallbackInput.eventTitle,
      title: title || fallbackInput.eventTitle
    }
    for (const [key, value] of Object.entries(query)) {
      if (normalizeSpace(value)) url.searchParams.set(key, normalizeSpace(value))
    }
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    if (response.status !== 409) return null
    const payload = await response.json().catch(() => null)
    const candidateIds = Array.isArray(payload?.candidateCanonicalIds)
      ? payload.candidateCanonicalIds.map(normalizeSpace).filter(Boolean)
      : []
    const selectedId = candidateIds.find((candidateId) => {
      const id = candidateId.toLowerCase()
      return id.includes(`:${sport}|`) && id.includes(`|${homeSlug}|${awaySlug}`)
    }) || candidateIds.find((candidateId) => {
      const id = candidateId.toLowerCase()
      return id.includes(`|${homeSlug}|${awaySlug}`)
    })
    if (!selectedId) return null
    console.warn(
      `[sports-artwork] using ambiguous canonical for logo-only artwork sport=${sport} title="${title}" canonicalId=${selectedId}`
    )
    return {
      canonicalId: selectedId,
      event: {
        id: selectedId,
        sport,
        league,
        title: title || `${homeTeam} vs ${awayTeam}`,
        name: title || `${homeTeam} vs ${awayTeam}`,
        date,
        homeTeam: homeTeam || fallbackInput.homeTeam,
        awayTeam: awayTeam || fallbackInput.awayTeam
      },
      assets: {}
    }
  } catch (_) {
    return null
  }
}

function isWeakSportsMetaCanonicalId(canonicalId = '') {
  const id = normalizeSpace(canonicalId).toLowerCase()
  return /\|general\|/.test(id) || /\|sports\|/.test(id)
}

function hasSpecificLeagueContext(value = '') {
  const league = normalizeSpace(value).toLowerCase()
  return Boolean(league && !['general', 'sports', 'sport', 'football', 'basketball', 'baseball', 'hockey', 'motorsport'].includes(league))
}

async function resolveArtworkCanonicalOverride({
  canonicalId = '',
  sportsmetaBaseUrl = '',
  sportSlug = '',
  league = '',
  title = '',
  date = '',
  homeTeam = '',
  awayTeam = '',
  fallbackInput = {}
} = {}) {
  if (!isWeakSportsMetaCanonicalId(canonicalId)) return null
  if (!hasSpecificLeagueContext(league)) return null
  const resolved = await resolveDefaultArtworkCanonical({
    sportsmetaBaseUrl,
    sportSlug,
    league,
    title,
    date,
    homeTeam,
    awayTeam,
    fallbackInput
  })
  const overrideId = normalizeSpace(resolved?.canonicalId)
  if (!overrideId || overrideId === canonicalId) return null
  return resolved
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
  const eventClass = String(req.query?.eventClass || req.query?.class || '').trim()
  const sportsmetaBaseUrl = resolveSportsmetaBaseUrlFromConfig(config)
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
  const defaultEventClass = eventClass || classifySportsEvent(fallbackInput)
  if (defaultEventClass && defaultEventClass !== 'team_vs_team' && title) {
    fallbackInput.eventTitle = title
    fallbackInput.eventName = title
  }
  if (!fallbackInput.eventDetail && defaultEventClass && defaultEventClass !== 'team_vs_team' && homeTeam && awayTeam) {
    fallbackInput.eventDetail = `${homeTeam} v ${awayTeam}`
  }
  if (defaultEventClass) fallbackInput.eventClass = defaultEventClass
  // Resolve a canonical SportsMeta event whenever there's enough query data to
  // ask, not only for team_vs_team. Combat fights, tennis matches, racket
  // matchups, and motorsport sessions also get cached SportsMeta artwork —
  // without this expansion they fall through to default-URL glyph fallback
  // even when SportsMeta has the real event indexed.
  const canHaveCanonical = (defaultEventClass === 'team_vs_team' ||
    defaultEventClass === 'combat_event' ||
    defaultEventClass === 'tennis_or_snooker_match' ||
    defaultEventClass === 'darts_event' ||
    defaultEventClass === 'racket_event' ||
    defaultEventClass === 'motorsport_event' ||
    defaultEventClass === 'golf_event' ||
    defaultEventClass === 'wrestling_event') &&
    Boolean(date && (title || (homeTeam && awayTeam)))
  const canonical = canHaveCanonical
    ? await resolveDefaultArtworkCanonical({
        sportsmetaBaseUrl,
        sportSlug,
        league,
        title,
        date,
        homeTeam,
        awayTeam,
        eventClass: defaultEventClass,
        fallbackInput
      })
    : null
  if (canonical?.canonicalId) {
    const canonicalUpstreamUrl = buildUpstreamUrl({
      kind: 'id',
      variant,
      canonicalId: canonical.canonicalId,
      sportsmetaBaseUrl,
      template
    })
    // Catalog title order wins (Prowlarr title is authoritative). If the
    // request supplied home/away, keep them; only fall back to canonical
    // home/away when the request didn't have any.
    const canonicalFallbackInput = buildArtworkInputFromRequest({
      canonicalId: canonical.canonicalId,
      sport: canonical.event?.sport || sportSlug,
      league: canonical.event?.league || league,
      title: canonical.event?.title || canonical.event?.name || title,
      date: canonical.event?.date || date,
      homeTeam: homeTeam || canonical.event?.homeTeam,
      awayTeam: awayTeam || canonical.event?.awayTeam,
      seeders,
      size,
      rawTitle,
      source: 'sportsmeta'
    })
    if (detail) canonicalFallbackInput.eventDetail = detail
    if (defaultEventClass) canonicalFallbackInput.eventClass = defaultEventClass
    const canonicalCacheKey = buildCanonicalArtworkCacheKey({
      variant,
      template,
      canonicalId: canonical.canonicalId,
      sportsmetaBaseUrl,
      requestedHome: homeTeam,
      requestedAway: awayTeam,
      requestedTitle: title
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
        requestedHome: homeTeam,
        requestedAway: awayTeam,
        requestedTitle: title
      }
    })
    return
  }

  const cacheKey = buildDefaultArtworkCacheKey({ variant, template, sportSlug, league, title, date, homeTeam, awayTeam, detail, eventClass: defaultEventClass, seeders, size, rawTitle, sportsmetaBaseUrl })
  await sendArtwork(res, {
    cacheKey,
    upstreamUrl,
    variant,
    fallbackInput,
    template,
    teamPosterContext: { sportsmetaBaseUrl }
  })
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
  const template = resolveSportsPosterTemplateFromConfig(config, req)
  const fallbackInput = buildArtworkInputFromRequest({
    canonicalId,
    sport: String(req.query?.sport || '').trim(),
    league: String(req.query?.league || '').trim(),
    title: String(req.query?.title || '').trim(),
    date: String(req.query?.date || '').trim(),
    homeTeam: String(req.query?.home || req.query?.homeTeam || '').trim(),
    awayTeam: String(req.query?.away || req.query?.awayTeam || '').trim(),
    detail: String(req.query?.detail || '').trim(),
    rawTitle: String(req.query?.rawTitle || '').trim(),
    source: String(req.query?.source || 'sportsmeta').trim()
  })
  const eventClass = String(req.query?.eventClass || req.query?.class || '').trim()
  if (req.query?.detail) fallbackInput.eventDetail = String(req.query.detail).trim()
  if (eventClass) fallbackInput.eventClass = eventClass
  const canonicalOverride = await resolveArtworkCanonicalOverride({
    canonicalId,
    sportsmetaBaseUrl,
    sportSlug: fallbackInput.sport,
    league: fallbackInput.league || fallbackInput.competition,
    title: fallbackInput.eventTitle || fallbackInput.title,
    date: fallbackInput.date,
    homeTeam: fallbackInput.homeTeam,
    awayTeam: fallbackInput.awayTeam,
    fallbackInput
  })
  const artworkCanonicalId = normalizeSpace(canonicalOverride?.canonicalId) || canonicalId
  if (canonicalOverride?.event) {
    fallbackInput.canonicalId = artworkCanonicalId
    fallbackInput.sport = normalizeSpace(canonicalOverride.event.sport) || fallbackInput.sport
    fallbackInput.league = normalizeSpace(canonicalOverride.event.league) || fallbackInput.league
    fallbackInput.competition = fallbackInput.league
    fallbackInput.eventTitle = normalizeSpace(canonicalOverride.event.title || canonicalOverride.event.name) || fallbackInput.eventTitle
    fallbackInput.title = fallbackInput.eventTitle
    fallbackInput.date = normalizeSpace(canonicalOverride.event.date) || fallbackInput.date
    // Catalog title order wins: only fill home/away from canonical when the
    // request didn't supply either. Prevents SportsMeta canonical (which
    // encodes the actual home venue) from inverting Prowlarr's catalog order.
    if (!fallbackInput.homeTeam) fallbackInput.homeTeam = normalizeSpace(canonicalOverride.event.homeTeam)
    if (!fallbackInput.awayTeam) fallbackInput.awayTeam = normalizeSpace(canonicalOverride.event.awayTeam)
    fallbackInput.source = 'sportsmeta'
  }
  const upstreamUrl = buildUpstreamUrl({
    kind: 'id',
    variant,
    canonicalId: artworkCanonicalId,
    sportsmetaBaseUrl,
    template
  })
  const cacheKey = buildCanonicalArtworkCacheKey({
    variant,
    template,
    canonicalId: artworkCanonicalId,
    sportsmetaBaseUrl,
    requestedHome: fallbackInput.homeTeam,
    requestedAway: fallbackInput.awayTeam,
    requestedTitle: fallbackInput.eventTitle || fallbackInput.title
  })
  await sendArtwork(res, {
    cacheKey,
    upstreamUrl,
    variant,
    fallbackInput,
    template,
    teamPosterContext: {
      canonicalId: artworkCanonicalId,
      sportsmetaBaseUrl,
      requestedHome: fallbackInput.homeTeam,
      requestedAway: fallbackInput.awayTeam,
      requestedTitle: fallbackInput.eventTitle || fallbackInput.title
    }
  })
}

module.exports = {
  handleDefaultSportsArtwork,
  handleCanonicalSportsArtwork,
  ALLOWED_VARIANTS,
  SPORTS_POSTER_TEMPLATES,
  _test: {
    isSportsMetaRealLogoAsset,
    renderTeamBadgeArtworkPng,
    renderTemplateFallbackArtwork
  }
}
