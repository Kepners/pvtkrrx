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

  // Carry short event context so the meta handler can pass them to
  // TheSportsDB for targeted artwork/logo lookups without re-deriving.
  // Only the most impactful fields — team names and league codes are
  // too expensive and would push the compressed ID over 256 chars.
  const eventDate = String(payload.e || '').trim()
  const league = String(payload.g || '').trim()
  const eventId = String(payload.v || '').trim()
  if (eventDate) compact.e = eventDate
  if (league) compact.g = league
  if (eventId) compact.v = eventId
  return compact
}

function compactLibraryPayload(payload = {}) {
  const displayTitle = String(payload.n || payload.t || '').trim()
  const compact = {
    y: String(payload.y || 'movie').trim() || 'movie',
    t: displayTitle,
    h: String(payload.h || '').trim()
  }

  const seeders = Number(payload.d || 0) || 0
  const imdbId = String(payload.m || '').trim()
  const filePath = String(payload.f || '').trim()
  if (seeders > 0) compact.d = seeders
  if (imdbId) compact.m = imdbId
  if (filePath) compact.f = filePath
  return compact
}

function encodeCustomId(payload = {}, options = {}) {
  const compactMode = String(options.compact || '').trim().toLowerCase()
  let normalized = payload
  if (compactMode === 'sports') normalized = compactSportsPayload(payload)
  else if (compactMode === 'library') normalized = compactLibraryPayload(payload)
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
