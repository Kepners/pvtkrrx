const crypto = require('crypto')

function sign(value, secret) {
  return crypto
    .createHmac('sha256', String(secret || ''))
    .update(String(value || ''))
    .digest('base64url')
}

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
  const body = {
    ...payload,
    iat: now,
    exp: now + ttl
  }
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = sign(encoded, secret)
  return `${encoded}.${sig}`
}

function verifyAuthToken(token, secret) {
  const raw = String(token || '').trim()
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0 || dot >= raw.length - 1) return null

  const encoded = raw.slice(0, dot)
  const receivedSig = raw.slice(dot + 1)
  const expectedSig = sign(encoded, secret)
  const a = Buffer.from(receivedSig, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
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

