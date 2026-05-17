const fs = require('fs')
const path = require('path')
const { encrypt, decrypt } = require('./crypto')

const SECURE_JSON_MARKER = 'pvtkrrx-secure-json-v1'

function resolveSecureJsonSecret(explicitSecret = '') {
  const direct = String(explicitSecret || '').trim()
  if (direct) return direct

  const envSecret = String(
    process.env.PVTKRRX_AT_REST_SECRET ||
    process.env.ENCRYPTION_SECRET ||
    ''
  ).trim()
  if (envSecret) return envSecret

  const hostedRelayRuntime = /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_HOSTED_RELAY || '').trim())
  if (process.env.NODE_ENV !== 'production' && !hostedRelayRuntime) {
    return 'pvtkrrx-local-dev-secret-change-me'
  }
  return ''
}

function parseSecureJson(raw, options = {}) {
  const text = String(raw || '').trim()
  if (!text) return options.defaultValue ?? null

  const parsed = JSON.parse(text)
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.__pvtkrrxSecure === SECURE_JSON_MARKER
  ) {
    const secret = resolveSecureJsonSecret(options.secret)
    if (!secret) throw new Error('Secure JSON secret is not configured')
    return decrypt(String(parsed.data || ''), secret)
  }

  return parsed
}

function stringifySecureJson(value, options = {}) {
  const pretty = options.pretty === true ? 2 : 0
  const secret = resolveSecureJsonSecret(options.secret)
  if (!secret) {
    if (options.allowPlaintext === true) return JSON.stringify(value, null, pretty)
    throw new Error('Secure JSON secret is not configured')
  }

  return JSON.stringify({
    __pvtkrrxSecure: SECURE_JSON_MARKER,
    data: encrypt(value, secret)
  }, null, pretty)
}

function loadSecureJsonFile(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return options.defaultValue ?? null
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  return parseSecureJson(raw, options)
}

function saveSecureJsonFile(filePath, value, options = {}) {
  const target = String(filePath || '').trim()
  if (!target) throw new Error('filePath is required')
  const dir = path.dirname(target)
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(target, stringifySecureJson(value, options), 'utf8')
}

module.exports = {
  resolveSecureJsonSecret,
  parseSecureJson,
  stringifySecureJson,
  loadSecureJsonFile,
  saveSecureJsonFile
}
