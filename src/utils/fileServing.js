const path = require('path')
const { hasAccessibleLocalFile } = require('./localStorageRoots')
const { mapPath, mapAbsolutePath } = require('./pathMapper')
const { settleWithTimeout } = require('./timeout')

// Preferring a finished remote copy (e.g. an rclone-served Google Drive mount
// behind fileServerUrl) over a still-downloading local file. Without this a
// partially downloaded local file always wins, because the local-disk check is
// only an existence test and qBittorrent creates the file the moment a download
// starts — so playback chases the download frontier even when a complete copy
// is already sitting on the file server.
const REMOTE_COPY_PROBE_TIMEOUT_MS = Math.max(
  500,
  parseInt(process.env.PVTKRRX_REMOTE_COPY_PROBE_TIMEOUT_MS || '2500', 10) || 2500
)
const REMOTE_COPY_HIT_TTL_MS = Math.max(
  0,
  parseInt(process.env.PVTKRRX_REMOTE_COPY_HIT_TTL_MS || '300000', 10) || 300000
)
const REMOTE_COPY_MISS_TTL_MS = Math.max(
  0,
  parseInt(process.env.PVTKRRX_REMOTE_COPY_MISS_TTL_MS || '30000', 10) || 30000
)
const REMOTE_COPY_CACHE_MAX_KEYS = 500
const remoteCopyProbeCache = new Map()

function remoteCopyPreferenceEnabled() {
  return String(process.env.PVTKRRX_PREFER_REMOTE_COPY || 'true').trim().toLowerCase() !== 'false'
}

function rememberRemoteCopyProbe(key, result, now) {
  const ttl = result?.ok ? REMOTE_COPY_HIT_TTL_MS : REMOTE_COPY_MISS_TTL_MS
  if (ttl <= 0) return result
  remoteCopyProbeCache.set(key, { result, expiresAt: now + ttl })
  for (const [cachedKey, entry] of remoteCopyProbeCache) {
    if (!entry?.expiresAt || entry.expiresAt <= now) remoteCopyProbeCache.delete(cachedKey)
  }
  while (remoteCopyProbeCache.size > REMOTE_COPY_CACHE_MAX_KEYS) {
    const oldestKey = remoteCopyProbeCache.keys().next().value
    if (!oldestKey) break
    remoteCopyProbeCache.delete(oldestKey)
  }
  return result
}

function clearRemoteCopyProbeCache() {
  remoteCopyProbeCache.clear()
}

// HEAD the candidate remote URL and only accept it as a usable copy when the
// server reports the exact expected byte count. A half-copied file on the
// mount must never win over the local torrent.
async function probeRemoteFileCopy(url, expectedSize, options = {}) {
  const target = String(url || '').trim()
  if (!target) return { ok: false, size: 0, reason: 'no-url' }

  const size = Math.max(0, Number(expectedSize) || 0)
  const cacheKey = `${target}|${size}`
  const now = Number(options.now) || Date.now()
  const cached = remoteCopyProbeCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.result

  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : global.fetch
  if (typeof fetchImpl !== 'function') return { ok: false, size: 0, reason: 'no-fetch' }

  const { value: response } = await settleWithTimeout(
    fetchImpl(target, { method: 'HEAD', redirect: 'follow' }),
    Number(options.timeoutMs) || REMOTE_COPY_PROBE_TIMEOUT_MS,
    null
  )

  if (!response || !response.ok) {
    return rememberRemoteCopyProbe(cacheKey, { ok: false, size: 0, reason: 'unreachable' }, now)
  }

  const reportedSize = Number(response.headers?.get?.('content-length') || 0)
  if (size > 0 && reportedSize !== size) {
    // Still copying, a different encode, or the server hides the length —
    // either way it is not a proven complete copy of this exact file.
    return rememberRemoteCopyProbe(cacheKey, { ok: false, size: reportedSize, reason: 'size-mismatch' }, now)
  }
  if (size <= 0 && reportedSize <= 0) {
    return rememberRemoteCopyProbe(cacheKey, { ok: false, size: 0, reason: 'unknown-size' }, now)
  }

  return rememberRemoteCopyProbe(cacheKey, { ok: true, size: reportedSize, reason: 'complete' }, now)
}

function isHostedRelayRuntime(options = {}) {
  if (typeof options.isHostedRelayRuntime === 'boolean') return options.isHostedRelayRuntime
  return /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_HOSTED_RELAY || '').trim())
}

function canServePlaybackRoute(configToken, options = {}) {
  return !isHostedRelayRuntime(options) || String(configToken || '') === 'local'
}

function requiresExternalFileServerAuth(config = {}) {
  return Boolean(String(config?.fileServerAuth || '').trim())
}

function getTrackerPlaybackRestriction(config, configToken, options = {}) {
  if (!canServePlaybackRoute(configToken, options)) return 'hosted-runtime'

  // Remote tracker playback eventually redirects into the external file server.
  // Suppress that flow when auth would be required because the redirect cannot
  // safely preserve proxy headers end-to-end in Stremio.
  if (requiresExternalFileServerAuth(config) && String(configToken || '') !== 'local') {
    return 'file-server-auth'
  }

  return null
}

function canEmitTrackerPlayback(config, configToken, options = {}) {
  return !getTrackerPlaybackRestriction(config, configToken, options)
}

function canServeFromLocalDisk(config, torrent, fileName) {
  return hasAccessibleLocalFile(torrent, fileName, config?.additionalStorageRoots)
}

function normalizeComparePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function resolveCurrentFilePath(torrent, fileName, options = {}) {
  const explicit = String(options.currentFilePath || '').trim()
  if (explicit) return path.normalize(explicit)

  const contentPath = String(torrent?.content_path || '').trim()
  const normalizedFileName = String(fileName || '').replace(/[\\/]+/g, '/').replace(/^\/+/, '')
  if (!contentPath || !normalizedFileName) return ''

  const normalizedContentPath = normalizeComparePath(contentPath)
  const normalizedRelativePath = normalizedFileName.toLowerCase()
  if (
    normalizedContentPath === normalizedRelativePath ||
    normalizedContentPath.endsWith(`/${normalizedRelativePath}`)
  ) {
    return path.normalize(contentPath)
  }

  if (options.multipleFiles === true) {
    return path.join(contentPath, ...normalizedFileName.split('/'))
  }

  return ''
}

function buildExternalFileUrl(config, torrent, fileName, options = {}) {
  const serverUrl = String(config?.fileServerUrl || '').trim()
  if (!serverUrl || !fileName) return null

  // A copy that has already been pushed to the file server sits at the final
  // save path, never at whatever partial/incomplete path qBittorrent is still
  // writing to locally, so skip the current-path branch entirely.
  if (options.useFinalPath === true) {
    return mapPath(
      torrent?.save_path || torrent?.download_path || '',
      fileName,
      serverUrl,
      config?.pathMapping
    )
  }

  const currentFilePath = resolveCurrentFilePath(torrent, fileName, options)
  const mappedCurrentUrl = currentFilePath
    ? mapAbsolutePath(currentFilePath, serverUrl, config?.pathMapping)
    : null
  if (mappedCurrentUrl) return mappedCurrentUrl

  if (options.requireCurrentPathProof === true) {
    const guessedFinalPath = path.join(
      String(torrent?.save_path || torrent?.download_path || ''),
      ...String(fileName || '').replace(/[\\/]+/g, '/').replace(/^\/+/, '').split('/')
    )
    const currentPathKey = normalizeComparePath(currentFilePath)
    const finalPathKey = normalizeComparePath(guessedFinalPath)

    if (!currentPathKey || !finalPathKey || currentPathKey !== finalPathKey) {
      return null
    }
  }

  return mapPath(
    torrent?.save_path || torrent?.download_path || '',
    fileName,
    serverUrl,
    config?.pathMapping
  )
}

function buildPlaybackFileUrl(config, configToken, baseUrl, hash, torrent, fileName, options = {}) {
  if (isHostedRelayRuntime(options)) {
    return buildExternalFileUrl(config, torrent, fileName, options)
  }

  if (config?.fileServerUrl && !canServeFromLocalDisk(config, torrent, fileName)) {
    return buildExternalFileUrl(config, torrent, fileName, options)
  }

  try {
    const { encodeFileStateToken } = require('./opaqueState')
    const currentFilePath = resolveCurrentFilePath(torrent, fileName, options)
    const tokenPath = currentFilePath || String(fileName || '')
    const info = encodeFileStateToken({ h: String(hash || '').toLowerCase(), p: tokenPath })
    return `${baseUrl}/${configToken}/file/${info}`
  } catch (_) {
    return null
  }
}

// Decide where an in-progress title should actually play from.
//
// The local-disk check is only an existence test, and qBittorrent creates the
// file as soon as a download starts — so without this a 4%-downloaded local
// file beats a finished copy on the file server, and playback spends the whole
// episode chasing the download frontier. When the local copy is incomplete and
// the file server has a proven byte-for-byte complete copy, play that instead.
async function resolvePreferredPlaybackFileUrl(config, configToken, baseUrl, hash, torrent, fileName, options = {}) {
  const builtinUrl = buildPlaybackFileUrl(config, configToken, baseUrl, hash, torrent, fileName, options)

  if (!remoteCopyPreferenceEnabled()) return builtinUrl
  if (isHostedRelayRuntime(options)) return builtinUrl
  if (options.localComplete === true) return builtinUrl
  if (!String(config?.fileServerUrl || '').trim()) return builtinUrl

  // A redirect cannot carry Stremio's proxyHeaders, so an authenticated file
  // server is unreachable this way — same reasoning as getTrackerPlaybackRestriction.
  if (requiresExternalFileServerAuth(config) && String(configToken || '') !== 'local') {
    return builtinUrl
  }

  const remoteUrl = buildExternalFileUrl(config, torrent, fileName, {
    multipleFiles: options.multipleFiles,
    useFinalPath: true
  })
  if (!remoteUrl || remoteUrl === builtinUrl) return builtinUrl

  const probe = await probeRemoteFileCopy(remoteUrl, options.expectedSize, options)
  if (!probe?.ok) return builtinUrl

  return remoteUrl
}

module.exports = {
  canServePlaybackRoute,
  probeRemoteFileCopy,
  resolvePreferredPlaybackFileUrl,
  remoteCopyPreferenceEnabled,
  clearRemoteCopyProbeCache,
  canEmitTrackerPlayback,
  getTrackerPlaybackRestriction,
  canServeFromLocalDisk,
  resolveCurrentFilePath,
  buildExternalFileUrl,
  buildPlaybackFileUrl
}
