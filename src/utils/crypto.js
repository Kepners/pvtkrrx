const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(data, secret) {
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(JSON.stringify(data), 'utf8')
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const authTag = cipher.getAuthTag()

  // Format: iv (12) + authTag (16) + ciphertext → base64url
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64url')
}

function decrypt(token, secret) {
  const key = deriveKey(secret)
  const combined = Buffer.from(token, 'base64url')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, null, 'utf8')
  decrypted += decipher.final('utf8')
  return JSON.parse(decrypted)
}

module.exports = { encrypt, decrypt }
