const crypto = require('node:crypto')

const VIDEO_EXTENSIONS = [ '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.ts', '.m4v' ]
const RAR_EXT_RE = /\.(?:rar|r\d{2,3}|part\d{1,3}\.rar)$/i
const SAMPLE_HINT_RE = /(^|[\\/._ -])(sample|trailer)([\\/._ -]|$)/i

function parseTorrentFileName(contentDisposition, fallback = 'download.torrent') {
  const text = String(contentDisposition || '')
  const utf8Match = text.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match && utf8Match[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1]).trim()
      if (decoded) return decoded
    } catch (_) {}
  }
  const plainMatch = text.match(/filename="?([^\";]+)"?/i)
  if (plainMatch && plainMatch[1]) {
    const value = String(plainMatch[1]).trim()
    if (value) return value
  }
  return fallback
}

async function fetchTorrentPayload(link, options = {}) {
  const target = String(link || '').trim()
  if (!target) throw new Error('Empty tracker link')

  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 10000))
  const response = await fetch(target, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/x-bittorrent, application/octet-stream, */*'
    }
  })

  if (!response.ok) {
    throw new Error(`tracker download HTTP ${response.status}`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) throw new Error('tracker download returned empty payload')

  const fileName = parseTorrentFileName(
    response.headers.get('content-disposition'),
    'download.torrent'
  )

  return { bytes, fileName }
}

function decodeTorrentText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  if (typeof value === 'string') return value
  return ''
}

function parseBencodeValue(buffer, startIndex = 0) {
  const token = buffer[startIndex]
  if (token === 0x69) {
    const end = buffer.indexOf(0x65, startIndex + 1)
    if (end === -1) throw new Error('Invalid bencode integer')
    const value = Number.parseInt(buffer.subarray(startIndex + 1, end).toString('ascii'), 10)
    if (!Number.isFinite(value)) throw new Error('Invalid bencode integer value')
    return { value, nextIndex: end + 1 }
  }

  if (token === 0x6c) {
    const value = []
    let index = startIndex + 1
    while (buffer[index] !== 0x65) {
      if (index >= buffer.length) throw new Error('Invalid bencode list')
      const parsed = parseBencodeValue(buffer, index)
      value.push(parsed.value)
      index = parsed.nextIndex
    }
    return { value, nextIndex: index + 1 }
  }

  if (token === 0x64) {
    const value = {}
    let index = startIndex + 1
    while (buffer[index] !== 0x65) {
      if (index >= buffer.length) throw new Error('Invalid bencode dictionary')
      const keyParsed = parseBencodeValue(buffer, index)
      const key = decodeTorrentText(keyParsed.value)
      const nextParsed = parseBencodeValue(buffer, keyParsed.nextIndex)
      value[key] = nextParsed.value
      index = nextParsed.nextIndex
    }
    return { value, nextIndex: index + 1 }
  }

  if (token >= 0x30 && token <= 0x39) {
    const colon = buffer.indexOf(0x3a, startIndex)
    if (colon === -1) throw new Error('Invalid bencode string')
    const length = Number.parseInt(buffer.subarray(startIndex, colon).toString('ascii'), 10)
    if (!Number.isFinite(length) || length < 0) throw new Error('Invalid bencode string length')
    const valueStart = colon + 1
    const valueEnd = valueStart + length
    if (valueEnd > buffer.length) throw new Error('Invalid bencode string bounds')
    return { value: buffer.subarray(valueStart, valueEnd), nextIndex: valueEnd }
  }

  throw new Error(`Unsupported bencode token at ${startIndex}`)
}

function parseBencode(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  const parsed = parseBencodeValue(buffer, 0)
  return parsed.value
}

function extractRawTorrentInfo(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || [])
  if (!buffer.length || buffer[0] !== 0x64) return Buffer.alloc(0)

  let index = 1
  while (index < buffer.length && buffer[index] !== 0x65) {
    const keyParsed = parseBencodeValue(buffer, index)
    const key = decodeTorrentText(keyParsed.value)
    const valueStart = keyParsed.nextIndex
    const valueParsed = parseBencodeValue(buffer, valueStart)
    if (key === 'info') {
      return Buffer.from(buffer.subarray(valueStart, valueParsed.nextIndex))
    }
    index = valueParsed.nextIndex
  }

  return Buffer.alloc(0)
}

function computeTorrentInfoHash(bytes) {
  const rawInfo = extractRawTorrentInfo(bytes)
  if (!rawInfo.length) return ''
  return crypto.createHash('sha1').update(rawInfo).digest('hex')
}

function normalizeTorrentPathSegments(value) {
  if (Array.isArray(value)) {
    return value.map(segment => decodeTorrentText(segment).trim()).filter(Boolean)
  }

  const single = decodeTorrentText(value).trim()
  return single ? [single] : []
}

function listTorrentPayloadFiles(bytes) {
  const root = parseBencode(bytes)
  const info = root?.info
  if (!info || typeof info !== 'object') return []

  if (Array.isArray(info.files)) {
    return info.files.map(file => {
      const pathSegments = normalizeTorrentPathSegments(file['path.utf-8'] || file.path)
      const joinedPath = pathSegments.join('/')
      return {
        path: joinedPath,
        name: pathSegments[pathSegments.length - 1] || '',
        size: Math.max(0, Number(file.length || 0))
      }
    }).filter(file => file.name)
  }

  const singleName = decodeTorrentText(info['name.utf-8'] || info.name).trim()
  if (!singleName) return []
  return [{
    path: singleName,
    name: singleName,
    size: Math.max(0, Number(info.length || 0))
  }]
}

function isVideoFileName(name) {
  const value = String(name || '').toLowerCase()
  return VIDEO_EXTENSIONS.some(ext => value.endsWith(ext))
}

function isArchiveFileName(name) {
  return RAR_EXT_RE.test(String(name || '').toLowerCase())
}

function isSampleVideoName(name) {
  return SAMPLE_HINT_RE.test(String(name || ''))
}

function inspectTorrentPayload(bytes) {
  const files = listTorrentPayloadFiles(bytes)
  const archiveFiles = files.filter(file => isArchiveFileName(file.name))
  const videoFiles = files.filter(file => isVideoFileName(file.name))
  const directVideoFiles = videoFiles.filter(file => !isSampleVideoName(file.name))
  const infoHash = computeTorrentInfoHash(bytes)

  return {
    infoHash,
    files,
    archiveFiles,
    videoFiles,
    directVideoFiles,
    packedOnly: archiveFiles.length > 0 && directVideoFiles.length === 0
  }
}

module.exports = {
  parseTorrentFileName,
  fetchTorrentPayload,
  listTorrentPayloadFiles,
  computeTorrentInfoHash,
  inspectTorrentPayload
}
