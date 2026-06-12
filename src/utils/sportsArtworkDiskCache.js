const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { resolveRuntimeDir } = require('./runtimeDir')

const CACHE_DIR_NAME = 'sports-artwork-raster-cache'

function parseBooleanEnv(value, fallback = true) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(1|true|yes|on)$/i.test(text)) return true
  if (/^(0|false|no|off)$/i.test(text)) return false
  return fallback
}

function diskCacheEnabled() {
  return parseBooleanEnv(process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE, true)
}

function resolveCacheDir() {
  const configured = String(process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_DIR || '').trim()
  return configured || path.join(resolveRuntimeDir(), CACHE_DIR_NAME)
}

function cacheNameForKey(cacheKey = '') {
  return crypto.createHash('sha256').update(String(cacheKey || '')).digest('hex')
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true })
}

async function readSportsArtworkDiskCache(cacheKey = {}) {
  if (!diskCacheEnabled()) return null
  const key = String(cacheKey || '').trim()
  if (!key) return null

  const dir = resolveCacheDir()
  const name = cacheNameForKey(key)
  const metaPath = path.join(dir, `${name}.json`)
  const dataPath = path.join(dir, `${name}.bin`)

  try {
    const [metaRaw, buffer] = await Promise.all([
      fs.promises.readFile(metaPath, 'utf8'),
      fs.promises.readFile(dataPath)
    ])
    const meta = JSON.parse(metaRaw)
    if (!meta || Number(meta.expiresAt || 0) <= Date.now()) return null
    return {
      buffer,
      contentType: String(meta.contentType || 'image/png'),
      selectedArtworkSource: String(meta.selectedArtworkSource || 'unknown'),
      selectedTemplate: String(meta.selectedTemplate || ''),
      layoutFamily: String(meta.layoutFamily || ''),
      eventClass: String(meta.eventClass || ''),
      renderFailure: String(meta.renderFailure || ''),
      fallbackReason: String(meta.fallbackReason || ''),
      sportBackdropFallbackReason: String(meta.sportBackdropFallbackReason || ''),
      logoKind: String(meta.logoKind || ''),
      logoSourceUrl: String(meta.logoSourceUrl || ''),
      logoSourceUrls: Array.isArray(meta.logoSourceUrls) ? meta.logoSourceUrls : [],
      logoFallbackReason: String(meta.logoFallbackReason || ''),
      logoRealCount: Number(meta.logoRealCount || 0) || 0,
      logoFallbackCount: Number(meta.logoFallbackCount || 0) || 0,
      logoSlots: Array.isArray(meta.logoSlots) ? meta.logoSlots : [],
      logoLookupAttempts: Array.isArray(meta.logoLookupAttempts) ? meta.logoLookupAttempts : [],
      realLogoLookupAttempted: Boolean(meta.realLogoLookupAttempted),
      httpStatus: Number(meta.httpStatus || 0) || 0,
      upstreamContentType: String(meta.upstreamContentType || ''),
      cacheLayer: 'disk'
    }
  } catch (_) {
    return null
  }
}

async function trimSportsArtworkDiskCache(dir, maxEntries) {
  const limit = Math.max(100, Number(maxEntries || process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE_MAX_ENTRIES || 2000) || 2000)
  let entries = []
  try {
    const names = await fs.promises.readdir(dir)
    const metaNames = names.filter((name) => /^[a-f0-9]{64}\.json$/i.test(name))
    if (metaNames.length <= limit) return
    entries = await Promise.all(metaNames.map(async (name) => {
      const metaPath = path.join(dir, name)
      try {
        const stat = await fs.promises.stat(metaPath)
        return { name, mtimeMs: stat.mtimeMs }
      } catch (_) {
        return { name, mtimeMs: 0 }
      }
    }))
  } catch (_) {
    return
  }

  entries.sort((left, right) => left.mtimeMs - right.mtimeMs)
  const remove = entries.slice(0, Math.max(0, entries.length - limit))
  await Promise.all(remove.map(async (entry) => {
    const base = entry.name.replace(/\.json$/i, '')
    await Promise.all([
      fs.promises.unlink(path.join(dir, `${base}.json`)).catch(() => {}),
      fs.promises.unlink(path.join(dir, `${base}.bin`)).catch(() => {})
    ])
  }))
}

async function writeSportsArtworkDiskCache(cacheKey = '', value = {}, options = {}) {
  const ttlMs = Math.max(60000, Number(options.ttlMs || process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_MS || 6 * 60 * 60 * 1000) || 6 * 60 * 60 * 1000)

  if (!diskCacheEnabled()) return false
  const key = String(cacheKey || '').trim()
  if (!key || !Buffer.isBuffer(value?.buffer)) return false

  const dir = resolveCacheDir()
  const name = cacheNameForKey(key)
  const metaPath = path.join(dir, `${name}.json`)
  const dataPath = path.join(dir, `${name}.bin`)
  const now = Date.now()
  const meta = {
    version: 1,
    createdAt: now,
    expiresAt: now + ttlMs,
    contentType: String(value.contentType || 'image/png'),
    selectedArtworkSource: String(value.selectedArtworkSource || 'unknown'),
    selectedTemplate: String(value.selectedTemplate || ''),
    layoutFamily: String(value.layoutFamily || ''),
    eventClass: String(value.eventClass || ''),
    renderFailure: String(value.renderFailure || ''),
    fallbackReason: String(value.fallbackReason || ''),
    sportBackdropFallbackReason: String(value.sportBackdropFallbackReason || ''),
    logoKind: String(value.logoKind || ''),
    logoSourceUrl: String(value.logoSourceUrl || ''),
    logoSourceUrls: Array.isArray(value.logoSourceUrls) ? value.logoSourceUrls : [],
    logoFallbackReason: String(value.logoFallbackReason || ''),
    logoRealCount: Number(value.logoRealCount || 0) || 0,
    logoFallbackCount: Number(value.logoFallbackCount || 0) || 0,
    logoSlots: Array.isArray(value.logoSlots) ? value.logoSlots : [],
    logoLookupAttempts: Array.isArray(value.logoLookupAttempts) ? value.logoLookupAttempts : [],
    realLogoLookupAttempted: Boolean(value.realLogoLookupAttempted),
    httpStatus: Number(value.httpStatus || 0) || 0,
    upstreamContentType: String(value.upstreamContentType || '')
  }

  try {
    await ensureDir(dir)
    await Promise.all([
      fs.promises.writeFile(dataPath, value.buffer),
      fs.promises.writeFile(metaPath, JSON.stringify(meta))
    ])
    trimSportsArtworkDiskCache(dir, options.maxEntries).catch(() => {})
    return true
  } catch (_) {
    return false
  }
}

module.exports = {
  readSportsArtworkDiskCache,
  writeSportsArtworkDiskCache
}
