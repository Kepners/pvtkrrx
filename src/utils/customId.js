const zlib = require('zlib')

const CUSTOM_ID_PREFIX = 'pvtkrrx:'
const COMPRESSED_CUSTOM_ID_PREFIX = `${CUSTOM_ID_PREFIX}z:`

function isCustomId(id) {
  return String(id || '').startsWith(CUSTOM_ID_PREFIX)
}

function compactSportsPayload(payload = {}) {
  const compact = {
    y: String(payload.y || 'movie').trim() || 'movie',
    k: 'sports',
    n: String(payload.n || payload.t || '').trim(),
    t: String(payload.t || payload.n || '').trim(),
    s: Number(payload.s || 0) || 0,
    d: Number(payload.d || 0) || 0,
    p: String(payload.p || '').trim(),
    r: String(payload.r || '').trim()
  }

  const infoHash = String(payload.h || '').trim()
  const directLink = String(payload.l || '').trim()
  const imdbId = String(payload.m || '').trim()
  if (infoHash) compact.h = infoHash
  if (directLink) compact.l = directLink
  if (imdbId) compact.m = imdbId
  return compact
}

function encodeCustomId(payload = {}, options = {}) {
  const compactMode = String(options.compact || '').trim().toLowerCase()
  const normalized = compactMode === 'sports'
    ? compactSportsPayload(payload)
    : payload
  const raw = Buffer.from(JSON.stringify(normalized), 'utf8')

  if (options.compress === true) {
    return `${COMPRESSED_CUSTOM_ID_PREFIX}${zlib.deflateRawSync(raw).toString('base64url')}`
  }

  return `${CUSTOM_ID_PREFIX}${raw.toString('base64url')}`
}

function decodeCustomId(id) {
  const rawId = String(id || '').trim()
  if (!isCustomId(rawId)) {
    throw new Error('Invalid custom id')
  }

  let decoded = ''
  if (rawId.startsWith(COMPRESSED_CUSTOM_ID_PREFIX)) {
    const token = rawId.slice(COMPRESSED_CUSTOM_ID_PREFIX.length)
    decoded = zlib.inflateRawSync(Buffer.from(token, 'base64url')).toString('utf8')
  } else {
    decoded = Buffer.from(rawId.slice(CUSTOM_ID_PREFIX.length), 'base64url').toString('utf8')
  }

  return JSON.parse(decoded)
}

module.exports = {
  CUSTOM_ID_PREFIX,
  COMPRESSED_CUSTOM_ID_PREFIX,
  isCustomId,
  encodeCustomId,
  decodeCustomId
}
