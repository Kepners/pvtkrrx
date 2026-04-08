const fs = require('fs')
const path = require('path')
const { resolveRuntimeDir } = require('./runtimeDir')
const { loadSecureJsonFile } = require('./secureJsonFile')

const MANIFEST_CACHE_TTL_MS = 5000
const DEFAULT_MANIFEST_NAMES = [
  'sports-image-package.json',
  'sports-poster-package.json',
  'manifest.json'
]
const manifestCache = new Map()

function normalizeSpace(value) {
  return String(value || '').trim()
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    const text = normalizeSpace(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function parsePathList(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value)
  }
  return uniqueStrings(String(value || '').split(/[\r\n;]+/))
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
  const value = normalizeSpace(input)
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

function inferContentTypeFromPath(filePath, fallback = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return normalizeSpace(fallback)
}

function loadLocalAddonConfig(runtimeDir = resolveRuntimeDir()) {
  const configPath = path.join(runtimeDir, 'local-config.json')
  try {
    return loadSecureJsonFile(configPath, { defaultValue: null }) || null
  } catch (_) {
    return null
  }
}

function resolveConfiguredSportsImagePackagePaths(options = {}) {
  const env = options.env || process.env
  const runtimeDir = normalizeSpace(options.runtimeDir) || resolveRuntimeDir(env)
  const localConfig = options.localConfig === undefined
    ? loadLocalAddonConfig(runtimeDir)
    : options.localConfig

  return uniqueStrings([
    ...parsePathList(env.PVTKRRX_SPORTS_IMAGE_PACKAGE_PATHS || ''),
    env.PVTKRRX_SPORTS_IMAGE_PACKAGE_PATH || '',
    ...(Array.isArray(localConfig?.sportsImagePackagePaths) ? localConfig.sportsImagePackagePaths : []),
    localConfig?.sportsImagePackagePath || ''
  ])
}

function resolveManifestPath(spec) {
  const input = normalizeSpace(spec)
  if (!input) return ''

  let stats = null
  try {
    stats = fs.statSync(input)
  } catch (_) {
    return ''
  }

  if (stats.isFile()) {
    return path.resolve(input)
  }

  if (!stats.isDirectory()) return ''

  for (const candidate of DEFAULT_MANIFEST_NAMES) {
    const manifestPath = path.join(input, candidate)
    if (fs.existsSync(manifestPath)) {
      return path.resolve(manifestPath)
    }
  }

  return ''
}

function normalizeManifestEntries(parsed) {
  const list = []
  if (Array.isArray(parsed?.images)) list.push(...parsed.images)
  if (Array.isArray(parsed?.entries)) list.push(...parsed.entries)
  if (Array.isArray(parsed?.assets)) list.push(...parsed.assets)
  if (parsed?.imagesBySourceUrl && typeof parsed.imagesBySourceUrl === 'object') {
    for (const [sourceUrl, value] of Object.entries(parsed.imagesBySourceUrl)) {
      if (!value) continue
      if (typeof value === 'string') {
        list.push({ sourceUrl, path: value })
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        list.push({ sourceUrl, ...value })
      }
    }
  }
  return list
}

function loadManifestRecord(manifestPath) {
  const resolvedPath = resolveManifestPath(manifestPath)
  if (!resolvedPath) return null

  const stats = fs.statSync(resolvedPath)
  const cached = manifestCache.get(resolvedPath)
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.mtimeMs === Number(stats.mtimeMs || 0)
  ) {
    return cached.value
  }

  const rootDir = path.dirname(resolvedPath)
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8').replace(/^\uFEFF/, ''))
  const packageName = normalizeSpace(parsed?.name) || path.basename(rootDir)
  const bySourceUrl = new Map()

  for (const entry of normalizeManifestEntries(parsed)) {
    const sourceUrls = uniqueStrings([
      ...(Array.isArray(entry?.sourceUrls) ? entry.sourceUrls : []),
      entry?.sourceUrl || ''
    ])
    const pathValue = normalizeSpace(entry?.path || entry?.file || entry?.relativePath || entry?.localPath)
    if (!sourceUrls.length || !pathValue) continue

    const localPath = path.isAbsolute(pathValue)
      ? pathValue
      : path.resolve(rootDir, pathValue)
    if (!fs.existsSync(localPath)) continue

    const contentType = inferContentTypeFromPath(localPath, entry?.contentType)
    for (const rawSourceUrl of sourceUrls) {
      const sourceUrl = normalizeRemoteImageUrl(rawSourceUrl)
      if (!sourceUrl || bySourceUrl.has(sourceUrl)) continue
      bySourceUrl.set(sourceUrl, {
        sourceUrl,
        filePath: localPath,
        contentType,
        packageName,
        manifestPath: resolvedPath
      })
    }
  }

  const value = {
    manifestPath: resolvedPath,
    packageName,
    entries: [...bySourceUrl.values()],
    bySourceUrl
  }

  manifestCache.set(resolvedPath, {
    expiresAt: Date.now() + MANIFEST_CACHE_TTL_MS,
    mtimeMs: Number(stats.mtimeMs || 0),
    value
  })
  return value
}

function listConfiguredSportsImagePackageEntries(options = {}) {
  const entries = []
  for (const spec of resolveConfiguredSportsImagePackagePaths(options)) {
    const record = loadManifestRecord(spec)
    if (!record) continue
    entries.push(...record.entries)
  }
  return entries
}

function findSportsImagePackageEntry(sourceUrl, options = {}) {
  const normalizedUrl = normalizeRemoteImageUrl(sourceUrl)
  if (!normalizedUrl) return null

  for (const spec of resolveConfiguredSportsImagePackagePaths(options)) {
    const record = loadManifestRecord(spec)
    const hit = record?.bySourceUrl?.get(normalizedUrl)
    if (hit) return hit
  }

  return null
}

module.exports = {
  findSportsImagePackageEntry,
  listConfiguredSportsImagePackageEntries,
  resolveConfiguredSportsImagePackagePaths
}
