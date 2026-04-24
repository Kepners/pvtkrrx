const path = require('path')
const { hasAccessibleLocalFile } = require('./localStorageRoots')
const { mapPath, mapAbsolutePath } = require('./pathMapper')

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

module.exports = {
  canServePlaybackRoute,
  canEmitTrackerPlayback,
  getTrackerPlaybackRestriction,
  canServeFromLocalDisk,
  resolveCurrentFilePath,
  buildExternalFileUrl,
  buildPlaybackFileUrl
}
