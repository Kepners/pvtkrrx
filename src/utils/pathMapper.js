// Map qBit save path + file name to HTTP file server URL via pathMapping config.
// External file servers need URL-safe path segments; torrent names often contain spaces and brackets.

function encodeUrlPathSegments(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function joinUrlPath(baseUrl, relativePath) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const encodedRelative = encodeUrlPathSegments(relativePath)
  return encodedRelative ? `${base}/${encodedRelative}` : base
}

function normalizeFsPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
}

function mapAbsolutePath(filePath, fileServerUrl, pathMapping) {
  const { from, to } = pathMapping || {}
  const normalizedFilePath = normalizeFsPath(filePath)
  const normalizedFrom = normalizeFsPath(from)
  const toPath = String(to || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

  if (!normalizedFilePath || !normalizedFrom) return null
  if (normalizedFilePath !== normalizedFrom && !normalizedFilePath.startsWith(normalizedFrom + '/')) {
    return null
  }

  const relative = normalizedFilePath.slice(normalizedFrom.length).replace(/^\/+/, '')
  return joinUrlPath(fileServerUrl, [toPath, relative].filter(Boolean).join('/'))
}

function mapPath(savePath, fileName, fileServerUrl, pathMapping) {
  const { from, to } = pathMapping || {}

  // Build full filesystem path, normalize separators
  const normalizedFileName = String(fileName || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const fullPath = ((savePath || '').replace(/[\\/]+$/, '') + '/' + normalizedFileName).replace(/\\/g, '/')
  const normalizedFrom = String(from || '').replace(/\\/g, '/').replace(/[\\/]+$/, '')
  const toPath = String(to || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

  // Apply path mapping
  if (normalizedFrom && (fullPath === normalizedFrom || fullPath.startsWith(normalizedFrom + '/'))) {
    const relative = fullPath.slice(normalizedFrom.length).replace(/^\/+/, '')
    return joinUrlPath(fileServerUrl, [toPath, relative].filter(Boolean).join('/'))
  }

  // Fallback: preserve the torrent-relative path even without explicit mapping.
  return joinUrlPath(fileServerUrl, [toPath, normalizedFileName].filter(Boolean).join('/'))
}

module.exports = { mapPath, mapAbsolutePath }
