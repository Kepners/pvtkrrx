const { encrypt, decrypt } = require('./crypto')

function parseBearerToken(headerValue) {
  const value = String(headerValue || '').trim()
  if (!value) return ''
  const match = value.match(/^Bearer\s+(.+)$/i)
  if (!match || !match[1]) return ''
  return String(match[1]).trim()
}

function createAuthToken(payload, secret, ttlSeconds = 2592000) {
  const ttl = Math.max(300, Number.parseInt(String(ttlSeconds || 2592000), 10) || 2592000)
  const now = Math.floor(Date.now() / 1000)
  return encrypt({
    ...payload,
    iat: now,
    exp: now + ttl
  }, secret)
}

function verifyAuthToken(token, secret) {
  const raw = String(token || '').trim()
  if (!raw) return null

  try {
    const payload = decrypt(raw, secret)
    if (!payload || typeof payload !== 'object') return null
    const now = Math.floor(Date.now() / 1000)
    const exp = Number(payload.exp || 0)
    if (!Number.isFinite(exp) || exp <= now) return null
    return payload
  } catch (_) {
    return null
  }
}

module.exports = {
  createAuthToken,
  verifyAuthToken,
  parseBearerToken
}
