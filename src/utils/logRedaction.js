const REDACTION_INSTALLED = Symbol.for('pvtkrrx.logRedactionInstalled')
const URL_PLACEHOLDER_PREFIX = 'PVTKRRX_SAFE_URL_'
const SECRET_PARAM_PATTERN = /(?:auth|token|key|pass|password|secret|apikey|api_key)/i
const SECRET_FIELD_PATTERN = /\b(authKey|lanPairKey|pairKey|fileServerAuth|accountUserId|stremioUserId|authToken|accessToken|refreshToken|token)\s*[:=]\s*([A-Za-z0-9._~+/=-]{6,})/gi
const SECRET_OBJECT_KEY_PATTERN = /authkey|lanpairkey|pairkey|fileserverauth|accountuserid|stremiouserid|authorization|password|passkey|secret|apikey|token/i
const WINDOWS_FILE_PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\)[^"'<>\r\n]+?\.[A-Za-z0-9]{1,12}(?=(?:[\s"'<>]|$))/g
const UNIX_FILE_PATH_PATTERN = /(^|[^\w])(\/(?:[^"'<>\r\n]+?\.[A-Za-z0-9]{1,12}))(?=(?:[\s"'<>]|$))/g
const UNIX_FILESYSTEM_ROOTS = new Set(['mnt', 'media', 'home', 'users', 'var', 'tmp', 'srv', 'opt', 'etc', 'private', 'volumes'])

function normalizeHostname(hostname) {
  return String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase()
}

function isLoopbackHostname(hostname) {
  const host = normalizeHostname(hostname)
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function isMdnsHostname(hostname) {
  const host = normalizeHostname(hostname)
  return host.endsWith('.local')
}

function isSafeLocalUrl(candidate) {
  try {
    const parsed = new URL(candidate)
    const host = normalizeHostname(parsed.hostname)
    if (!isLoopbackHostname(host) && !isMdnsHostname(host)) return false
    if (parsed.username || parsed.password) return false
    const safePath = parsed.pathname === '/' || parsed.pathname === '/configure' || parsed.pathname === '/local/manifest.json'
    if (!safePath) return false
    const queryKeys = Array.from(parsed.searchParams.keys())
    return queryKeys.every((key) => key === 'mode')
  } catch (_) {
    return false
  }
}

function shouldRedactUrl(candidate) {
  try {
    const parsed = new URL(candidate)
    if (isSafeLocalUrl(candidate)) return false
    if (parsed.username || parsed.password) return true
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_PARAM_PATTERN.test(key)) return true
    }
    return true
  } catch (_) {
    return true
  }
}

function shouldRedactUnixPath(candidate) {
  const value = String(candidate || '').trim()
  if (!value.startsWith('/')) return false
  const pathname = value.split(/[?#]/)[0]
  const segments = pathname.split('/').filter(Boolean)
  if (!segments.length) return false
  const first = String(segments[0] || '').toLowerCase()
  const last = String(segments[segments.length - 1] || '')
  if (UNIX_FILESYSTEM_ROOTS.has(first)) return true
  return segments.length > 1 && /\.[A-Za-z0-9]{1,12}$/.test(last)
}

function redactSensitiveText(input) {
  const text = String(input ?? '')
  if (!text) return text

  const safeUrls = []
  let next = text.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (match) => {
    if (shouldRedactUrl(match)) return '[redacted-url]'
    const placeholder = `${URL_PLACEHOLDER_PREFIX}${safeUrls.length}_`
    safeUrls.push(match)
    return placeholder
  })

  next = next
    .replace(/\bmagnet:\?[^\s"'<>]+/gi, '[redacted-magnet]')
    .replace(WINDOWS_FILE_PATH_PATTERN, '[redacted-path]')
    .replace(UNIX_FILE_PATH_PATTERN, (match, prefix) => `${prefix}[redacted-path]`)
    .replace(/(?:[A-Za-z]:\\|\\\\)[^\s"'<>]+/g, '[redacted-path]')
    .replace(/(?:^|[^\w])\/(?:[^/\s"'<>]+\/)+[^/\s"'<>]*/g, (match) => {
      const prefix = /^[^\w]/.test(match) ? match[0] : ''
      const candidate = prefix ? match.slice(1) : match
      return shouldRedactUnixPath(candidate) ? `${prefix}[redacted-path]` : match
    })
    .replace(SECRET_FIELD_PATTERN, '$1=[redacted]')

  return safeUrls.reduce((acc, value, index) => {
    const placeholder = `${URL_PLACEHOLDER_PREFIX}${index}_`
    return acc.replaceAll(placeholder, value)
  }, next)
}

function isRedactableObject(value) {
  return Boolean(value) && typeof value === 'object'
}

function redactSensitiveValue(value, keyName = '', seen = new WeakSet()) {
  if (typeof value === 'string') {
    if (SECRET_OBJECT_KEY_PATTERN.test(String(keyName || ''))) return '[redacted]'
    return redactSensitiveText(value)
  }
  if (value instanceof Error) {
    const clone = new Error(redactSensitiveText(value.message))
    clone.name = value.name
    if (value.stack) clone.stack = redactSensitiveText(value.stack)
    for (const [entryKey, entryValue] of Object.entries(value)) {
      clone[entryKey] = redactSensitiveValue(entryValue, entryKey, seen)
    }
    return clone
  }
  if (!isRedactableObject(value)) return value
  if (seen.has(value)) return '[redacted-circular]'

  if (Array.isArray(value)) {
    seen.add(value)
    const out = value.map((entry) => redactSensitiveValue(entry, keyName, seen))
    seen.delete(value)
    return out
  }

  if (value instanceof URL) {
    return shouldRedactUrl(value.toString()) ? '[redacted-url]' : value.toString()
  }

  if (Buffer.isBuffer(value)) {
    return redactSensitiveText(value.toString('utf8'))
  }

  if (value instanceof Date || value instanceof RegExp) return value

  seen.add(value)
  const out = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (SECRET_OBJECT_KEY_PATTERN.test(entryKey)) {
      out[entryKey] = '[redacted]'
      continue
    }
    out[entryKey] = redactSensitiveValue(entryValue, entryKey, seen)
  }
  seen.delete(value)
  return out
}

function redactSensitiveArgs(args) {
  return (Array.isArray(args) ? args : []).map((value) => redactSensitiveValue(value))
}

function createRedactingLogger(logger = console) {
  const base = logger && typeof logger === 'object' ? logger : console
  const wrapped = {}
  for (const level of ['log', 'info', 'warn', 'error']) {
    const target = typeof base[level] === 'function' ? base[level].bind(base) : () => {}
    wrapped[level] = (...args) => target(...redactSensitiveArgs(args))
  }
  return wrapped
}

function installConsoleRedaction(targetConsole = console) {
  if (!targetConsole || targetConsole[REDACTION_INSTALLED]) return targetConsole

  const originals = {}
  for (const level of ['log', 'info', 'warn', 'error']) {
    if (typeof targetConsole[level] !== 'function') continue
    originals[level] = targetConsole[level].bind(targetConsole)
    targetConsole[level] = (...args) => originals[level](...redactSensitiveArgs(args))
  }

  Object.defineProperty(targetConsole, REDACTION_INSTALLED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  })

  return targetConsole
}

module.exports = {
  redactSensitiveText,
  redactSensitiveArgs,
  createRedactingLogger,
  installConsoleRedaction
}
