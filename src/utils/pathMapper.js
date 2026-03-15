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

module.exports = { mapPath }
