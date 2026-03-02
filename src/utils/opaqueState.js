const { encrypt, decrypt } = require('./crypto')

const TOKEN_VERSION = 1
const DEFAULT_PLAYBACK_TTL_SECONDS = 24 * 60 * 60
const DEFAULT_FILE_TTL_SECONDS = 24 * 60 * 60

function parseBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function resolveOpaqueSecret() {
  const explicit = String(process.env.PVTKRRX_OPAQUE_STATE_SECRET || '').trim()
  if (explicit) return explicit

  const fromEncryptionSecret = String(process.env.ENCRYPTION_SECRET || '').trim()
  if (fromEncryptionSecret) return fromEncryptionSecret

  // Local development fallback so desktop/local smoke flows still work without manual setup.
  if (process.env.NODE_ENV !== 'production') return 'pvtkrrx-local-dev-secret-change-me'
  return ''
}

function normalizeHash(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (/^[a-f0-9]{40}$/.test(raw)) return raw
  if (/^[a-z0-9]{32,64}$/.test(raw)) return raw
  return ''
}

function normalizeTrackerLink(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 8192) return ''

  if (/^magnet:/i.test(raw)) return raw

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return raw
  } catch (_) {
    return ''
  }
}

function normalizeFilePath(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) return ''
  if (raw.includes('\u0000')) return ''
  return raw
}

function parseLegacyBase64JsonToken(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (_) {
    return null
  }
}

function encodeOpaqueToken(type, payload, ttlSeconds) {
  const secret = resolveOpaqueSecret()
  if (!secret) throw new Error('Opaque token secret is not configured')

  const now = Math.floor(Date.now() / 1000)
  const ttl = Math.max(60, Number.parseInt(String(ttlSeconds || 0), 10) || 0)

  return encrypt({
    v: TOKEN_VERSION,
    t: String(type || ''),
    p: payload,
    iat: now,
    exp: now + ttl
  }, secret)
}

function decodeOpaqueToken(token, expectedType) {
  const secret = resolveOpaqueSecret()
  if (!secret) throw new Error('Opaque token secret is not configured')

  const parsed = decrypt(String(token || ''), secret)
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid token payload')
  if (Number(parsed.v || 0) !== TOKEN_VERSION) throw new Error('Unsupported token version')
  if (String(parsed.t || '') !== String(expectedType || '')) throw new Error('Token type mismatch')
  const exp = Number(parsed.exp || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(exp) || exp <= now) throw new Error('Token expired')
  if (!parsed.p || typeof parsed.p !== 'object') throw new Error('Invalid token state')
  return parsed.p
}

function sanitizePlaybackPayload(input) {
  const hash = normalizeHash(input?.h)
  const link = normalizeTrackerLink(input?.l)
  if (!hash && !link) throw new Error('Playback state must include hash or tracker link')
  return { h: hash, l: link }
}

function sanitizeFilePayload(input) {
  const hash = normalizeHash(input?.h)
  const filePath = normalizeFilePath(input?.p)
  if (!hash || !filePath) throw new Error('File state must include torrent hash and file path')
  return { h: hash, p: filePath }
}

function encodePlaybackStateToken(input) {
  const payload = sanitizePlaybackPayload(input || {})
  const ttl = parseBoundedInt(
    process.env.PVTKRRX_PLAYBACK_STATE_TTL_SECONDS,
    DEFAULT_PLAYBACK_TTL_SECONDS,
    60,
    7 * 24 * 60 * 60
  )
  return encodeOpaqueToken('playback', payload, ttl)
}

function encodeFileStateToken(input) {
  const payload = sanitizeFilePayload(input || {})
  const ttl = parseBoundedInt(
    process.env.PVTKRRX_FILE_STATE_TTL_SECONDS,
    DEFAULT_FILE_TTL_SECONDS,
    60,
    7 * 24 * 60 * 60
  )
  return encodeOpaqueToken('file', payload, ttl)
}

function decodePlaybackStateToken(token) {
  try {
    return sanitizePlaybackPayload(decodeOpaqueToken(token, 'playback'))
  } catch (_) {
    const legacy = parseLegacyBase64JsonToken(token)
    if (!legacy) throw new Error('Invalid playback token')
    return sanitizePlaybackPayload(legacy)
  }
}

function decodeFileStateToken(token) {
  try {
    return sanitizeFilePayload(decodeOpaqueToken(token, 'file'))
  } catch (_) {
    const legacy = parseLegacyBase64JsonToken(token)
    if (!legacy) throw new Error('Invalid file token')
    return sanitizeFilePayload(legacy)
  }
}

module.exports = {
  encodePlaybackStateToken,
  decodePlaybackStateToken,
  encodeFileStateToken,
  decodeFileStateToken
}
