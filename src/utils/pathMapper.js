// Map qBit save path + file name to HTTP file server URL via pathMapping config

function mapPath(savePath, fileName, fileServerUrl, pathMapping) {
  const { from, to } = pathMapping || {}

  // Build full filesystem path, normalize separators
  const fullPath = ((savePath || '').replace(/[\\/]+$/, '') + '/' + fileName).replace(/\\/g, '/')
  const normalizedFrom = String(from || '').replace(/\\/g, '/').replace(/[\\/]+$/, '')

  // Apply path mapping
  if (normalizedFrom && (fullPath === normalizedFrom || fullPath.startsWith(normalizedFrom + '/'))) {
    const relative = fullPath.slice(normalizedFrom.length).replace(/^\/+/, '')
    const base = fileServerUrl.replace(/\/+$/, '')
    const toPath = (to || '').replace(/^\/+|\/+$/g, '')
    return toPath ? `${base}/${toPath}/${relative}` : `${base}/${relative}`
  }

  // Fallback: append filename directly
  return fileServerUrl.replace(/\/+$/, '') + '/' + fileName.replace(/^\/+/, '')
}

module.exports = { mapPath }
