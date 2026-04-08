const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const umamiModule = require('@umami/node')
const { resolveRuntimeDir } = require('./runtimeDir')

const umami = umamiModule && umamiModule.default ? umamiModule.default : umamiModule

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizeHost(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    if (raw.includes('://')) return String(new URL(raw).hostname || '').trim().toLowerCase()
  } catch (_) {}
  return String(raw.split(':')[0] || '').trim().toLowerCase()
}

function normalizePath(value) {
  const raw = String(value || '').trim()
  if (!raw) return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

function normalizeUrlBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function parseAllowedHosts(value) {
  const out = new Set()
  for (const part of String(value || '').split(',')) {
    const host = normalizeHost(part)
    if (host) out.add(host)
  }
  return out
}

function sanitizeEventName(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 50)
}

function sanitizeEventValue(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 120)
}

function sanitizeEventData(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined

  const out = {}
  for (const [rawKey, rawValue] of Object.entries(data)) {
    const key = String(rawKey || '').trim().replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)
    if (!key) continue

    if (rawValue === null || rawValue === undefined) continue
    if (Array.isArray(rawValue)) {
      const joined = rawValue.map(value => sanitizeEventValue(value)).filter(Boolean).join(', ')
      if (joined) out[key] = joined.slice(0, 120)
      continue
    }
    if (typeof rawValue === 'object') {
      const text = sanitizeEventValue(JSON.stringify(rawValue))
      if (text) out[key] = text
      continue
    }

    const value = sanitizeEventValue(rawValue)
    if (value === '' && value !== false && value !== 0) continue
    out[key] = value
  }

  return Object.keys(out).length > 0 ? out : undefined
}

const provider = String(process.env.PVTKRRX_ANALYTICS_PROVIDER || 'umami').trim().toLowerCase()
const umamiHostUrl = normalizeUrlBase(process.env.PVTKRRX_ANALYTICS_UMAMI_HOST_URL || '')
const umamiWebsiteId = String(process.env.PVTKRRX_ANALYTICS_UMAMI_WEBSITE_ID || '').trim()
const allowedHosts = parseAllowedHosts(
  process.env.PVTKRRX_ANALYTICS_ALLOWED_HOSTS ||
  process.env.PVTKRRX_ANALYTICS_PUBLIC_HOSTS ||
  ''
)
const trackPrivateRuntimes = parseBoolean(process.env.PVTKRRX_ANALYTICS_TRACK_PRIVATE_RUNTIMES, false)
const hashSalt = String(
  process.env.PVTKRRX_ANALYTICS_HASH_SALT ||
  process.env.PVTKRRX_OPAQUE_STATE_SECRET ||
  process.env.AUTH_TOKEN_SECRET ||
  process.env.ENCRYPTION_SECRET ||
  umamiWebsiteId ||
  'pvtkrrx-analytics'
).trim()

let analyticsEnabled = provider === 'umami' && Boolean(umamiHostUrl) && Boolean(umamiWebsiteId)
if (analyticsEnabled) {
  try {
    umami.init({
      websiteId: umamiWebsiteId,
      hostUrl: umamiHostUrl
    })
  } catch (error) {
    analyticsEnabled = false
    console.warn('[analytics] init failed:', error.message)
  }
}

const dedupeFilePath = path.join(resolveRuntimeDir(), 'analytics-dedupe.json')
let dedupeStateLoaded = false
let dedupeEntries = {}
let dedupeSaveTimer = null
let lastWarningAt = 0

function warn(message) {
  const now = Date.now()
  if (now - lastWarningAt < 60000) return
  lastWarningAt = now
  console.warn('[analytics]', message)
}

function loadDedupeState() {
  if (dedupeStateLoaded) return
  dedupeStateLoaded = true

  try {
    if (!fs.existsSync(dedupeFilePath)) {
      dedupeEntries = {}
      return
    }
    const parsed = JSON.parse(fs.readFileSync(dedupeFilePath, 'utf8'))
    dedupeEntries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {})
      : {}
  } catch (error) {
    dedupeEntries = {}
    warn(`dedupe state load failed: ${error.message}`)
  }
}

function pruneDedupeEntries(now = Date.now()) {
  const next = {}
  for (const [key, expiresAt] of Object.entries(dedupeEntries)) {
    if (Number(expiresAt) > now) next[key] = Number(expiresAt)
  }

  const keys = Object.keys(next)
  if (keys.length > 10000) {
    keys
      .sort((left, right) => Number(next[right]) - Number(next[left]))
      .slice(0, 10000)
      .forEach(key => {
        next[key] = next[key]
      })
    const trimmed = {}
    for (const key of keys.slice(0, 10000)) trimmed[key] = next[key]
    dedupeEntries = trimmed
    return
  }

  dedupeEntries = next
}

function scheduleDedupeSave() {
  if (dedupeSaveTimer) return
  dedupeSaveTimer = setTimeout(() => {
    dedupeSaveTimer = null
    try {
      fs.mkdirSync(path.dirname(dedupeFilePath), { recursive: true })
      fs.writeFileSync(
        dedupeFilePath,
        JSON.stringify({ entries: dedupeEntries }, null, 2),
        'utf8'
      )
    } catch (error) {
      warn(`dedupe state save failed: ${error.message}`)
    }
  }, 250)
  if (typeof dedupeSaveTimer.unref === 'function') dedupeSaveTimer.unref()
}

function hashKey(value) {
  return crypto
    .createHash('sha256')
    .update(hashSalt)
    .update('\0')
    .update(String(value || ''))
    .digest('hex')
}

function claimDedupeKey(key, windowMs) {
  if (!key || !Number.isFinite(windowMs) || windowMs <= 0) return true
  loadDedupeState()
  pruneDedupeEntries()

  const hashed = hashKey(key)
  const now = Date.now()
  const expiresAt = Number(dedupeEntries[hashed] || 0)
  if (expiresAt > now) return false

  dedupeEntries[hashed] = now + windowMs
  scheduleDedupeSave()
  return true
}

function isHostAllowed(hostname, options = {}) {
  const normalizedHost = normalizeHost(hostname)
  if (!normalizedHost) return false
  if (analyticsEnabled !== true) return false
  if (options.selfHostServerMode === true && trackPrivateRuntimes !== true) return false
  if (allowedHosts.size > 0 && !allowedHosts.has(normalizedHost)) return false
  return true
}

function getBrowserConfig(options = {}) {
  const hostname = normalizeHost(options.hostname)
  if (!isHostAllowed(hostname, options)) {
    return { enabled: false }
  }

  return {
    enabled: true,
    provider: 'umami',
    scriptUrl: `${umamiHostUrl}/script.js`,
    websiteId: umamiWebsiteId
  }
}

async function trackEvent(options = {}) {
  const hostname = normalizeHost(options.hostname)
  if (!isHostAllowed(hostname, options)) return false

  const eventName = sanitizeEventName(options.eventName)
  if (!eventName) return false

  const dedupeWindowMs = Number(options.dedupeWindowMs || 0)
  if (options.dedupeKey && !claimDedupeKey(`${eventName}:${options.dedupeKey}`, dedupeWindowMs)) {
    return false
  }

  try {
    await umami.track({
      hostname,
      url: normalizePath(options.url || '/'),
      name: eventName,
      data: sanitizeEventData(options.data)
    })
    return true
  } catch (error) {
    warn(`track failed for ${eventName}: ${error.message}`)
    return false
  }
}

module.exports = {
  analyticsEnabled,
  getBrowserConfig,
  trackEvent
}
