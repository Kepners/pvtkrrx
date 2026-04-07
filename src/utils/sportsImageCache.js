const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { resolveRuntimeDir } = require('./runtimeDir')

const CACHE_ROOT_NAME = 'sports-image-cache'
const TOKEN_VERSION = 'v1'
const DEFAULT_FETCH_TIMEOUT_MS = 10000
const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024
const inFlight = new Map()

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function normalizeSportsImageVariant(value) {
  const variant = String(value || '').trim().toLowerCase()
  if (variant === 'background' || variant === 'wallpaper') return 'background'
  if (variant === 'landscape' || variant === 'thumb' || variant === 'thumbnail') return 'landscape'
  if (variant === 'logo' || variant === 'badge') return 'logo'
  return 'poster'
}

function getCacheRoot() {
  const root = path.join(resolveRuntimeDir(), CACHE_ROOT_NAME)
  fs.mkdirSync(root, { recursive: true })
  return root
}

function getFetchTimeoutMs() {
  return clampNumber(process.env.PVTKRRX_SPORTS_IMAGE_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS, 2000, 30000)
}

function getMaxImageBytes() {
  return clampNumber(process.env.PVTKRRX_SPORTS_IMAGE_MAX_BYTES, DEFAULT_MAX_IMAGE_BYTES, 64 * 1024, 25 * 1024 * 1024)
}

function getSigningSecret() {
  const configured = String(
    process.env.PVTKRRX_SPORTS_IMAGE_PROXY_SECRET ||
    process.env.PVTKRRX_OPAQUE_STATE_SECRET ||
    process.env.ENCRYPTION_SECRET ||
    ''
  ).trim()
  return configured || 'pvtkrrx-sports-image-dev-secret'
}

function isPrivateIpv4(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false
  const parts = hostname.split('.').map(part => Number(part))
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 0) return true
  return false
}

function isPrivateIpv6(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized.includes(':')) return false
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

function normalizeRemoteImageUrl(input) {
  const value = String(input || '').trim()
  if (!value) return ''

  let parsed = null
  try {
    parsed = new URL(value)
  } catch (_) {
    return ''
  }

  const protocol = String(parsed.protocol || '').toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') return ''

  const hostname = String(parsed.hostname || '').trim().toLowerCase()
  if (!hostname) return ''
  if (hostname === 'localhost' || hostname.endsWith('.local')) return ''
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return ''

  parsed.hash = ''
  return parsed.toString()
}

function signPayload(payload) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(String(payload || ''))
    .digest('base64url')
}

function signaturesMatch(expected, actual) {
  const left = Buffer.from(String(expected || ''), 'utf8')
  const right = Buffer.from(String(actual || ''), 'utf8')
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false
  try {
    return crypto.timingSafeEqual(left, right)
  } catch (_) {
    return false
  }
}

function encodeSportsImageToken(sourceUrl) {
  const normalizedUrl = normalizeRemoteImageUrl(sourceUrl)
  if (!normalizedUrl) return ''
  const payload = zlib
    .deflateRawSync(Buffer.from(JSON.stringify({ u: normalizedUrl }), 'utf8'))
    .toString('base64url')
  return `${TOKEN_VERSION}.${payload}.${signPayload(payload)}`
}

function decodeSportsImageToken(token) {
  const parts = String(token || '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    throw new Error('Invalid sports image token')
  }

  const payload = String(parts[1] || '')
  const signature = String(parts[2] || '')
  const expectedSignature = signPayload(payload)
  if (!signaturesMatch(expectedSignature, signature)) {
    throw new Error('Invalid sports image signature')
  }

  const decoded = zlib.inflateRawSync(Buffer.from(payload, 'base64url')).toString('utf8')
  const parsed = JSON.parse(decoded)
  const sourceUrl = normalizeRemoteImageUrl(parsed?.u)
  if (!sourceUrl) throw new Error('Invalid sports image URL')
  return sourceUrl
}

function makeSportsImageProxyUrl(baseUrl, sourceUrl, variant = 'poster') {
  const normalizedUrl = normalizeRemoteImageUrl(sourceUrl)
  if (!normalizedUrl) return ''
  const root = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!root) return normalizedUrl
  const token = encodeSportsImageToken(normalizedUrl)
  if (!token) return normalizedUrl
  return `${root}/image/sports/${normalizeSportsImageVariant(variant)}/${token}`
}

function proxySportsImageUrl(baseUrl, sourceUrl, variant = 'poster') {
  const value = String(sourceUrl || '').trim()
  if (!value) return ''
  const root = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (root && (value.startsWith(`${root}/image/sports/`) || value.startsWith(`${root}/thumb/sports/`))) {
    return value
  }
  const proxied = makeSportsImageProxyUrl(root, value, variant)
  return proxied || value
}

async function resolveSportsImageSourceUrl(sourceUrl, variant = 'poster') {
  const normalizedUrl = normalizeRemoteImageUrl(sourceUrl)
  if (!normalizedUrl) return null
  const token = encodeSportsImageToken(normalizedUrl)
  if (!token) return null
  return resolveSportsImageRequest(token, variant)
}

async function readSportsImageDataUri(sourceUrl, variant = 'logo', options = {}) {
  const maxBytes = clampNumber(options.maxBytes, 1024 * 1024, 16 * 1024, 2 * 1024 * 1024)
  const resolved = await resolveSportsImageSourceUrl(sourceUrl, variant)
  if (!resolved?.filePath || !fs.existsSync(resolved.filePath)) return ''

  const size = Number(resolved.size || 0)
  if (Number.isFinite(size) && size > maxBytes) return ''

  const content = fs.readFileSync(resolved.filePath)
  if (!content || content.length === 0 || content.length > maxBytes) return ''

  const ext = path.extname(String(resolved.filePath || '')).toLowerCase()
  const contentType = inferContentType(resolved.contentType, ext)
  if (!contentType) return ''
  return `data:${contentType};base64,${content.toString('base64')}`
}

function buildCacheKey(sourceUrl) {
  return crypto.createHash('sha256').update(String(sourceUrl || '')).digest('hex')
}

function getMetadataPath(cacheKey) {
  return path.join(getCacheRoot(), `${cacheKey}.json`)
}

function getFilePath(cacheKey, ext) {
  return path.join(getCacheRoot(), `${cacheKey}${ext}`)
}

function inferExtension(contentType, sourceUrl) {
  const normalizedType = String(contentType || '').trim().toLowerCase().split(';')[0]
  if (normalizedType === 'image/jpeg') return '.jpg'
  if (normalizedType === 'image/png') return '.png'
  if (normalizedType === 'image/webp') return '.webp'
  if (normalizedType === 'image/avif') return '.avif'
  if (normalizedType === 'image/gif') return '.gif'
  if (normalizedType === 'image/svg+xml') return '.svg'

  try {
    const parsed = new URL(String(sourceUrl || ''))
    const ext = path.extname(parsed.pathname || '').toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext
    }
  } catch (_) {
    // ignore
  }

  return '.img'
}

function inferContentType(contentType, ext) {
  const normalizedType = String(contentType || '').trim().toLowerCase().split(';')[0]
  if (normalizedType.startsWith('image/')) return normalizedType
  if (ext === '.jpg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return ''
}

function removeCacheEntry(entry) {
  if (!entry?.cacheKey) return
  const ext = String(entry.ext || '').trim()
  if (ext) {
    try {
      fs.rmSync(getFilePath(entry.cacheKey, ext), { force: true })
    } catch (_) {
      // ignore
    }
  }
  try {
    fs.rmSync(getMetadataPath(entry.cacheKey), { force: true })
  } catch (_) {
    // ignore
  }
}

function loadCacheEntry(cacheKey) {
  const metadataPath = getMetadataPath(cacheKey)
  if (!fs.existsSync(metadataPath)) return null

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    if (!parsed || parsed.cacheKey !== cacheKey) {
      removeCacheEntry({ cacheKey, ext: parsed?.ext })
      return null
    }
    const ext = String(parsed.ext || '').trim()
    if (!ext) {
      removeCacheEntry(parsed)
      return null
    }
    const filePath = getFilePath(cacheKey, ext)
    if (!fs.existsSync(filePath)) {
      removeCacheEntry(parsed)
      return null
    }
    return {
      ...parsed,
      filePath
    }
  } catch (_) {
    removeCacheEntry({ cacheKey })
    return null
  }
}

function writeCacheEntry(cacheKey, sourceUrl, fileBuffer, contentType, ext) {
  const filePath = getFilePath(cacheKey, ext)
  const metadataPath = getMetadataPath(cacheKey)
  const existing = loadCacheEntry(cacheKey)
  const now = Date.now()
  const entry = {
    version: 1,
    cacheKey,
    sourceUrl,
    contentType,
    ext,
    size: fileBuffer.length,
    fetchedAt: now,
    lastAccessedAt: now
  }

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tempPath, fileBuffer)
  fs.renameSync(tempPath, filePath)
  fs.writeFileSync(metadataPath, JSON.stringify(entry), 'utf8')

  if (existing?.ext && existing.ext !== ext) {
    try {
      fs.rmSync(getFilePath(cacheKey, existing.ext), { force: true })
    } catch (_) {
      // ignore
    }
  }

  return {
    ...entry,
    filePath
  }
}

async function downloadSportsImage(sourceUrl) {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(getFetchTimeoutMs()),
    headers: {
      Accept: 'image/*'
    }
  })
  if (!res.ok) {
    throw new Error(`sports image fetch failed (${res.status})`)
  }

  const declaredLength = Number(res.headers.get('content-length') || 0)
  const maxBytes = getMaxImageBytes()
  if (declaredLength > maxBytes) {
    throw new Error('sports image exceeds max size')
  }

  const ext = inferExtension(res.headers.get('content-type'), sourceUrl)
  const contentType = inferContentType(res.headers.get('content-type'), ext)
  if (!contentType.startsWith('image/')) {
    throw new Error('sports image response is not an image')
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length === 0) {
    throw new Error('sports image response was empty')
  }
  if (buffer.length > maxBytes) {
    throw new Error('sports image exceeds max size')
  }

  return {
    buffer,
    contentType,
    ext
  }
}

function maybeTouchEntry(entry) {
  if (!entry?.cacheKey) return entry
  const now = Date.now()
  if (now - Number(entry.lastAccessedAt || 0) < 5 * 60 * 1000) return entry

  const nextEntry = {
    ...entry,
    lastAccessedAt: now
  }
  try {
    fs.writeFileSync(getMetadataPath(entry.cacheKey), JSON.stringify({
      version: 1,
      cacheKey: entry.cacheKey,
      sourceUrl: entry.sourceUrl,
      contentType: entry.contentType,
      ext: entry.ext,
      size: entry.size,
      fetchedAt: entry.fetchedAt,
      lastAccessedAt: now
    }), 'utf8')
  } catch (_) {
    return entry
  }
  return nextEntry
}

// Sports image cache is a permanent catalogue — no pruning, no expiry.
// Images are kept forever once downloaded. The catalogue is the product.

async function getCachedSportsImage(sourceUrl) {
  const normalizedUrl = normalizeRemoteImageUrl(sourceUrl)
  if (!normalizedUrl) {
    throw new Error('Invalid sports image URL')
  }

  const cacheKey = buildCacheKey(normalizedUrl)
  const existing = loadCacheEntry(cacheKey)
  if (existing) {
    const touched = maybeTouchEntry(existing)
    return {
      ...touched,
      cacheStatus: 'hit'
    }
  }

  const ongoing = inFlight.get(cacheKey)
  if (ongoing) return ongoing

  const pending = (async () => {
    try {
      const downloaded = await downloadSportsImage(normalizedUrl)
      const fresh = writeCacheEntry(
        cacheKey,
        normalizedUrl,
        downloaded.buffer,
        downloaded.contentType,
        downloaded.ext
      )
      return {
        ...fresh,
        cacheStatus: 'miss'
      }
    } catch (err) {
      throw err
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, pending)
  return pending
}

async function resolveSportsImageRequest(token, variant = 'poster') {
  const sourceUrl = decodeSportsImageToken(token)
  const entry = await getCachedSportsImage(sourceUrl)
  return {
    ...entry,
    variant: normalizeSportsImageVariant(variant),
    sourceUrl
  }
}

module.exports = {
  normalizeSportsImageVariant,
  normalizeRemoteImageUrl,
  encodeSportsImageToken,
  decodeSportsImageToken,
  makeSportsImageProxyUrl,
  proxySportsImageUrl,
  resolveSportsImageSourceUrl,
  readSportsImageDataUri,
  getCachedSportsImage,
  resolveSportsImageRequest
}
