const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const crypto = require('crypto')
const selfsigned = require('selfsigned')
const express = require('express')
const Stripe = require('stripe')
const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const manifest = require('./src/config/manifest')
const { encrypt, decrypt } = require('./src/utils/crypto')
const { encodeFileStateToken, decodeFileStateToken, decodePlaybackStateToken } = require('./src/utils/opaqueState')
const { handleCatalog } = require('./src/handlers/catalog')
const { handleStream } = require('./src/handlers/stream')
const { handleMeta } = require('./src/handlers/meta')
const { ProwlarrClient } = require('./src/clients/prowlarr')
const { QBitClient } = require('./src/clients/qbittorrent')
const { autoProvisionWindows, ensureWindowsLanAccess } = require('./src/utils/provision')
const { getLanIpv4Addresses, normalizeLocalHostname, startLanAlias } = require('./src/utils/lanAlias')
const { decodeSportsThumbToken, renderSportsThumbSvg } = require('./src/utils/sportsThumb')
const { mapPath } = require('./src/utils/pathMapper')
const { findVideoFile, hasPackedArchiveFiles, isSampleVideoName } = require('./src/utils/streams')
const {
  normalizeLocalStorageRoots,
  findExistingLocalFilePath
} = require('./src/utils/localStorageRoots')
const { PairStore } = require('./src/utils/pairStore')
const {
  AccountStore,
  normalizeAccountEmail,
  normalizeStremioUserId,
  hashStremioAuthKey
} = require('./src/utils/accountStore')
const { createAuthToken, verifyAuthToken, parseBearerToken } = require('./src/utils/authToken')

const STREAM_WAIT_TIMEOUT_MS = parseInt(process.env.STREAM_WAIT_TIMEOUT_MS || '90000', 10)
const STREAM_WAIT_INTERVAL_MS = parseInt(process.env.STREAM_WAIT_INTERVAL_MS || '2000', 10)
const STREAM_RANGE_WAIT_TIMEOUT_MS = parseInt(process.env.STREAM_RANGE_WAIT_TIMEOUT_MS || '15000', 10)
const STREAM_RANGE_WAIT_INTERVAL_MS = parseInt(process.env.STREAM_RANGE_WAIT_INTERVAL_MS || '500', 10)
const STREAM_READY_START_FRACTION = parseStartFraction(
  process.env.STREAM_READY_START_PERCENT ||
  process.env.STREAM_READY_MIN_PROGRESS ||
  '0.5%'
)
const STREAM_PRIORITIZE_LAST_PIECES = String(process.env.STREAM_PRIORITIZE_LAST_PIECES || '').trim().toLowerCase() === 'true'
const WATCHED_DELETE_THRESHOLD = Math.max(0.5, Math.min(0.99, parseFloat(process.env.PVTKRRX_WATCHED_DELETE_THRESHOLD || '0.95')))
const WATCHED_DELETE_GRACE_MS = Math.max(0, parseInt(process.env.PVTKRRX_WATCHED_DELETE_GRACE_MS || '180000', 10))
// Pairing should be hash-first and stable: desktop publishes LAN endpoint, hosted token hash resolves it.
// Keep TTL long enough to avoid noisy relay chatter; desktop still refreshes periodically.
const LAN_PAIR_TTL_SECONDS = Math.max(300, parseInt(process.env.PVTKRRX_LAN_PAIR_TTL_SECONDS || '21600', 10))
const LAN_PAIR_BIND_PUBLIC_IP = String(process.env.PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP || 'false').trim().toLowerCase() === 'true'
const LAN_PAIR_LOCK_HOST = String(process.env.PVTKRRX_LAN_PAIR_LOCK_HOST || 'true').trim().toLowerCase() !== 'false'
const LAN_PAIR_RATE_LIMIT_WINDOW_MS = Math.max(1000, parseInt(process.env.PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS || '60000', 10))
const LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW || '30', 10))
const LAN_PAIR_STATUS_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW || '60', 10))
const ENCRYPT_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_ENCRYPT_MAX_PER_WINDOW || '30', 10))
const AUTH_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_AUTH_MAX_PER_WINDOW || '20', 10))
const BILLING_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_BILLING_MAX_PER_WINDOW || '30', 10))
const AUTH_TOKEN_TTL_SECONDS = Math.max(900, parseInt(process.env.PVTKRRX_AUTH_TOKEN_TTL_SECONDS || '2592000', 10))
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim()
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
const STRIPE_DEFAULT_PRICE_ID = String(process.env.STRIPE_DEFAULT_PRICE_ID || '').trim()
const STRIPE_SUCCESS_URL = String(process.env.STRIPE_SUCCESS_URL || '').trim()
const STRIPE_CANCEL_URL = String(process.env.STRIPE_CANCEL_URL || '').trim()
const STRIPE_PORTAL_RETURN_URL = String(process.env.STRIPE_PORTAL_RETURN_URL || '').trim()
const STREMIO_API_BASE_URL = normalizeBaseUrl(process.env.PVTKRRX_STREMIO_API_BASE_URL || 'https://api.strem.io')
const STREMIO_API_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_STREMIO_API_TIMEOUT_MS || '10000', 10))
const STREMIO_AUTH_KEY_REGEX = /^[A-Za-z0-9._~+/=-]{16,1024}$/
const STREMIO_AUTH_KEY_CAPTURE_PATTERN = '[A-Za-z0-9._~+/=-]{16,1024}'
const STREMIO_AUTH_SCAN_DIRS_OVERRIDE = String(process.env.PVTKRRX_STREMIO_AUTH_SCAN_DIRS || '').trim()
// Temporary commercial mode: keep addon free for all users.
const FREE_MODE = true
const TRIAL_ENABLED = String(process.env.PVTKRRX_TRIAL_ENABLED || 'true').trim().toLowerCase() !== 'false'
const TRIAL_DAYS = Math.max(1, Math.min(30, parseInt(process.env.PVTKRRX_TRIAL_DAYS || '3', 10)))
const TRIAL_REQUIRE_LINKED_ACCOUNT = String(process.env.PVTKRRX_TRIAL_REQUIRE_LINKED_ACCOUNT || 'true').trim().toLowerCase() !== 'false'
const REQUIRE_ACTIVE_SUBSCRIPTION = false
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL)
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])
const SENSITIVE_WEB_ORIGINS = parseOriginAllowlist(
  process.env.PVTKRRX_ALLOWED_WEB_ORIGINS || 'https://pvtkrrx.vercel.app'
)
const watchedDeleteTimers = new Map()
const watchedDeleteInFlight = new Set()
const lanPairRateBuckets = new Map()
const DEFAULT_LOCAL_HOSTNAME = 'pvtkrrx.local'

function parseStartFraction(raw) {
  const text = String(raw || '').trim()
  if (!text) return 0.005
  const hasPercent = text.endsWith('%')
  const numeric = parseFloat(hasPercent ? text.slice(0, -1) : text)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0.005

  let fraction
  if (hasPercent || numeric > 1) {
    fraction = numeric / 100
  } else {
    fraction = numeric
  }
  return Math.max(0.001, Math.min(0.99, fraction))
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

if (!process.env.ENCRYPTION_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.ENCRYPTION_SECRET = 'pvtkrrx-local-dev-secret-change-me'
  console.warn('[PVTKRRX] ENCRYPTION_SECRET missing; using local development fallback secret.')
}

const app = express()
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf)
  }
}))

const runtimeDir = process.env.PVTKRRX_RUNTIME_DIR || path.join(__dirname, '.runtime')
const localConfigPath = path.join(runtimeDir, 'local-config.json')
const lanPairStore = new PairStore({
  filePath: process.env.PVTKRRX_PAIR_STORE_FILE || path.join(runtimeDir, 'lan-pair-store.json')
})
const accountStore = new AccountStore({
  filePath: process.env.PVTKRRX_ACCOUNT_STORE_FILE || path.join(runtimeDir, 'accounts-store.json')
})
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null
let bootLanAccessPromise = null
let localProviderWarmupPromise = null

function loadLocalConfigFile() {
  try {
    if (!fs.existsSync(localConfigPath)) return null
    const raw = fs.readFileSync(localConfigPath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (_) {
    return null
  }
}

function saveLocalConfigFile(config) {
  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.writeFileSync(localConfigPath, JSON.stringify(config), 'utf8')
}

function detectLanAddresses() {
  return getLanIpv4Addresses()
}

function getMdnsHost() {
  const localConfig = loadLocalConfigFile()
  const configured = normalizeLocalHostname(String(localConfig?.localHostname || '').trim())
  const configuredCustom = localConfig?.localHostnameCustom === true
  const envConfigured = String(process.env.PVTKRRX_LOCAL_HOSTNAME || '').trim()
  // Force a stable default alias for all installs unless explicitly customized by the user.
  if (configuredCustom && configured) return configured
  if (configured === DEFAULT_LOCAL_HOSTNAME) return configured
  if (envConfigured) return normalizeLocalHostname(envConfigured)
  return DEFAULT_LOCAL_HOSTNAME
}

function buildLocalModeUrls(hostname, port, httpsPort) {
  const modeQuery = '?mode=local'
  return {
    httpManifest: `http://${hostname}:${port}/local/manifest.json${modeQuery}`,
    httpsManifest: `https://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`,
    stremio: `stremio://${hostname}:${port}/local/manifest.json${modeQuery}`,
    stremioHttps: `stremio://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`
  }
}

function normalizeBaseUrl(input) {
  const value = String(input || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  return value
}

async function ensureBootLanAccess(logger = console) {
  if (process.platform !== 'win32' || IS_VERCEL_RUNTIME) return null
  if (bootLanAccessPromise) return bootLanAccessPromise

  bootLanAccessPromise = (async () => {
    try {
      const result = await ensureWindowsLanAccess({
        openFirewall: true,
        ensureBonjour: true,
        installBonjourIfMissing: false,
        startIfStopped: true
      })

      if (result?.firewallOk) {
        logger.log('[startup-network] Windows Firewall verified for TCP 7000/7001 and UDP 5353')
      } else {
        logger.warn('[startup-network] Firewall verification failed; run PVTKRRX as Administrator once to repair LAN access')
      }

      if (result?.mdnsReady) {
        logger.log('[startup-network] mDNS responder ready')
      } else if (result?.bonjour?.installed) {
        logger.warn('[startup-network] Bonjour service detected but not running')
      } else {
        logger.warn('[startup-network] Bonjour/mDNS service not detected; .local discovery may be limited')
      }

      return result
    } catch (err) {
      logger.warn('[startup-network] LAN access check failed:', err.message)
      return null
    }
  })()

  return bootLanAccessPromise
}

function normalizeRelayUrl(input) {
  const fallback = normalizeBaseUrl(process.env.PVTKRRX_PAIR_RELAY_URL || 'https://pvtkrrx.vercel.app')
  const raw = normalizeBaseUrl(input)
  if (!raw) return fallback
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback
    return normalizeBaseUrl(parsed.origin)
  } catch (_) {
    return fallback
  }
}

function parseBooleanLoose(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined || value === '') return fallback
  return parseBoolean(value)
}

function getAuthTokenSecret() {
  return String(process.env.AUTH_TOKEN_SECRET || process.env.ENCRYPTION_SECRET || '').trim()
}

function sanitizePairId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!id) return ''
  if (!/^[a-z0-9_-]{8,64}$/.test(id)) return ''
  return id
}

function makePairId() {
  return crypto.randomBytes(9).toString('base64url').toLowerCase()
}

function sanitizePairKey(value) {
  const key = String(value || '').trim()
  if (!key) return ''
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(key)) return ''
  return key
}

function makePairKey() {
  return crypto.randomBytes(24).toString('base64url')
}

function hashPairKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function sanitizeStremioAuthKey(value) {
  const key = String(value || '').trim()
  if (!key) return ''
  if (!STREMIO_AUTH_KEY_REGEX.test(key)) return ''
  return key
}

function derivePairIdFromStremioUserId(stremioUserId) {
  const userId = normalizeStremioUserId(stremioUserId)
  if (!userId) return ''
  const digest = crypto.createHash('sha256').update(userId).digest('hex')
  return `s_${digest.slice(0, 22)}`
}

function parsePathList(value) {
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw
    .split(new RegExp(`[${path.delimiter === ';' ? ';' : ':'}\\n\\r]+`, 'g'))
    .map(entry => String(entry || '').trim())
    .filter(Boolean)
}

function extractStremioAuthKeysFromBlob(blob) {
  const raw = String(blob || '')
  if (!raw) return []
  const normalized = raw.replace(/\x00/g, '')
  const compact = normalized.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]+/g, '')
  if (!compact.includes('stremio.com') && !compact.includes('strem.io')) return []

  const matches = []
  const seen = new Set()
  const pushCandidate = (value) => {
    const key = sanitizeStremioAuthKey(value)
    if (!key || seen.has(key)) return
    seen.add(key)
    matches.push(key)
  }

  pushCandidate(compact)

  for (const regex of [
    new RegExp(`authKey=(${STREMIO_AUTH_KEY_CAPTURE_PATTERN})`, 'ig'),
    new RegExp(`"authKey"\\s*[:=]\\s*"(${STREMIO_AUTH_KEY_CAPTURE_PATTERN})"`, 'ig'),
    new RegExp(`"auth_key"\\s*[:=]\\s*"(${STREMIO_AUTH_KEY_CAPTURE_PATTERN})"`, 'ig'),
    new RegExp(`"auth"\\s*[:=]\\s*\\{[^{}]{0,400}"key"\\s*[:=]\\s*"(${STREMIO_AUTH_KEY_CAPTURE_PATTERN})"`, 'igs')
  ]) {
    let match = null
    while ((match = regex.exec(compact))) {
      pushCandidate(match[1])
    }
  }

  return matches
}

function getStremioAuthScanSources() {
  const explicitDirs = parsePathList(STREMIO_AUTH_SCAN_DIRS_OVERRIDE)
  if (explicitDirs.length) {
    return explicitDirs.map(dir => ({
      label: 'Override',
      profile: 'Override',
      levelDbDir: dir
    }))
  }

  const localAppData = String(process.env.LOCALAPPDATA || '').trim()
  if (!localAppData) return []

  const sources = []
  const seenDirs = new Set()
  const pushSource = (label, profile, levelDbDir) => {
    const dir = String(levelDbDir || '').trim()
    if (!dir || seenDirs.has(dir)) return
    if (!fs.existsSync(dir)) return
    seenDirs.add(dir)
    sources.push({ label, profile, levelDbDir: dir })
  }

  pushSource(
    'Stremio Desktop',
    'Default',
    path.join(localAppData, 'Programs', 'Stremio', 'stremio-shell-ng.exe.WebView2', 'EBWebView', 'Default', 'Local Storage', 'leveldb')
  )

  const browserRoots = [
    {
      label: 'Brave',
      root: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')
    },
    {
      label: 'Chrome',
      root: path.join(localAppData, 'Google', 'Chrome', 'User Data')
    },
    {
      label: 'Edge',
      root: path.join(localAppData, 'Microsoft', 'Edge', 'User Data')
    }
  ]

  for (const browser of browserRoots) {
    if (!fs.existsSync(browser.root)) continue
    let entries = []
    try {
      entries = fs.readdirSync(browser.root, { withFileTypes: true })
    } catch (_) {
      continue
    }
    entries
      .filter(entry => entry.isDirectory() && /^(Default|Profile \d+)$/i.test(entry.name))
      .sort((a, b) => {
        if (a.name === 'Default') return -1
        if (b.name === 'Default') return 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      .slice(0, 6)
      .forEach((entry) => {
        pushSource(
          browser.label,
          entry.name,
          path.join(browser.root, entry.name, 'Local Storage', 'leveldb')
        )
      })
  }

  return sources
}

function discoverLocalStremioAuthKeyCandidates() {
  const candidates = []
  const seenKeys = new Set()
  const filesPerSourceLimit = 16

  for (const source of getStremioAuthScanSources()) {
    let entries = []
    try {
      entries = fs.readdirSync(source.levelDbDir, { withFileTypes: true })
    } catch (_) {
      continue
    }

    const files = entries
      .filter(entry => entry.isFile() && (/\.ldb$/i.test(entry.name) || /\.log$/i.test(entry.name) || /^MANIFEST-/i.test(entry.name)))
      .map((entry) => {
        const filePath = path.join(source.levelDbDir, entry.name)
        try {
          const stat = fs.statSync(filePath)
          return {
            name: entry.name,
            filePath,
            mtimeMs: Number(stat.mtimeMs || 0),
            size: Number(stat.size || 0)
          }
        } catch (_) {
          return null
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.mtimeMs - a.mtimeMs) || (b.size - a.size) || a.name.localeCompare(b.name))
      .slice(0, filesPerSourceLimit)

    for (const file of files) {
      let blob = ''
      try {
        blob = fs.readFileSync(file.filePath).toString('latin1')
      } catch (_) {
        continue
      }

      const matches = extractStremioAuthKeysFromBlob(blob)
      for (const authKey of matches) {
        if (seenKeys.has(authKey)) continue
        seenKeys.add(authKey)
        candidates.push({
          authKey,
          sourceLabel: source.profile && source.profile !== 'Default'
            ? `${source.label} (${source.profile})`
            : source.label,
          sourceType: source.label,
          profile: source.profile,
          filePath: file.filePath,
          updatedAt: file.mtimeMs
        })
      }
    }
  }

  return candidates.sort((a, b) => (b.updatedAt - a.updatedAt) || a.sourceLabel.localeCompare(b.sourceLabel))
}

function getLocalStremioDesktopInstallCandidates() {
  const localAppData = String(process.env.LOCALAPPDATA || '').trim()
  if (!localAppData) return []

  const seen = new Set()
  return [
    path.join(localAppData, 'Programs', 'Stremio', 'stremio.exe'),
    path.join(localAppData, 'Programs', 'Stremio', 'Stremio.exe'),
    path.join(localAppData, 'Programs', 'Stremio', 'stremio-shell-ng.exe')
  ].filter((candidate) => {
    const filePath = String(candidate || '').trim()
    if (!filePath || seen.has(filePath)) return false
    seen.add(filePath)
    return true
  })
}

function getLocalStremioDesktopStatus() {
  const installCandidates = getLocalStremioDesktopInstallCandidates()
  const installPaths = installCandidates.filter(candidate => fs.existsSync(candidate))
  const authSources = getStremioAuthScanSources()
  const desktopStorageDetected = authSources.some(source => source.label === 'Stremio Desktop')
  const sessionCandidates = discoverLocalStremioAuthKeyCandidates()

  return {
    installed: installPaths.length > 0 || desktopStorageDetected,
    installPath: installPaths[0] || '',
    desktopStorageDetected,
    signedInSessionFound: sessionCandidates.length > 0,
    signedInSourceLabel: sessionCandidates[0]?.sourceLabel || '',
    signedInSessionCount: sessionCandidates.length,
    authTokenReady: authSecretAvailable(),
    downloadUrl: 'https://www.stremio.com/downloads'
  }
}

function isSameHostRequest(req) {
  const clientIp = getClientIp(req)
  if (!clientIp) return false
  if (clientIp === '127.0.0.1' || clientIp === '::1') return true
  try {
    return getLanIpv4Addresses().includes(clientIp)
  } catch (_) {
    return false
  }
}

async function fetchStremioUserByAuthKey(authKey) {
  const key = sanitizeStremioAuthKey(authKey)
  if (!key) return null
  const endpoint = `${STREMIO_API_BASE_URL}/api/getUser`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ authKey: key }),
    signal: AbortSignal.timeout(STREMIO_API_TIMEOUT_MS)
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      return null
    }
    throw new Error(`stremio getUser failed (${res.status})`)
  }

  const body = await res.json().catch(() => null)
  if (!body || typeof body !== 'object') return null
  const payload = body.result && typeof body.result === 'object' ? body.result : body
  const stremioUserId = normalizeStremioUserId(payload?._id || payload?.id || '')
  if (!stremioUserId) return null
  const email = normalizeAccountEmail(payload?.email || '')
  return {
    stremioUserId,
    email: isValidEmail(email) ? email : ''
  }
}

function createHttpError(statusCode, message, detail = '') {
  const err = new Error(message)
  err.statusCode = statusCode
  if (detail) err.detail = detail
  return err
}

async function createLinkedStremioAuthSession(authKey, authSecret) {
  const safeAuthKey = sanitizeStremioAuthKey(authKey)
  if (!safeAuthKey) {
    throw createHttpError(400, 'Invalid Stremio AuthKey')
  }

  const stremioUser = await fetchStremioUserByAuthKey(safeAuthKey)
  if (!stremioUser || !stremioUser.stremioUserId) {
    throw createHttpError(401, 'Stremio AuthKey verification failed')
  }

  const authKeyHash = hashStremioAuthKey(safeAuthKey)
  let user = await accountStore.getUserByStremioUserId(stremioUser.stremioUserId)
  if (!user) {
    user = await accountStore.createOrLinkStremioUser({
      stremioUserId: stremioUser.stremioUserId,
      email: stremioUser.email,
      authKeyHash
    })
  } else {
    const next = {
      ...user,
      stremio: {
        ...(user.stremio && typeof user.stremio === 'object' ? user.stremio : {}),
        userId: stremioUser.stremioUserId,
        authKeyHash,
        linkedAt: Number(user?.stremio?.linkedAt || Date.now()),
        lastVerifiedAt: Date.now()
      }
    }
    if (stremioUser.email && isValidEmail(stremioUser.email)) {
      next.email = stremioUser.email
    }
    user = await accountStore.saveUser(next)
  }

  const recommendedPairId = derivePairIdFromStremioUserId(stremioUser.stremioUserId)
  const token = createAuthToken({
    sub: user.id,
    provider: 'stremio-authkey',
    stremioUserId: stremioUser.stremioUserId
  }, authSecret, AUTH_TOKEN_TTL_SECONDS)

  return {
    ok: true,
    token,
    user: publicUserModel(user),
    stremio: {
      userId: stremioUser.stremioUserId,
      recommendedPairId
    }
  }
}

function normalizeClientIp(value) {
  let ip = String(value || '').trim()
  if (!ip) return ''
  if (ip.includes(',')) ip = ip.split(',')[0].trim()
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  const zoneIndex = ip.indexOf('%')
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex)
  return ip.replace(/[^a-fA-F0-9:.]/g, '').toLowerCase()
}

function getClientIp(req) {
  const forwarded = normalizeClientIp(String(req.headers['x-forwarded-for'] || ''))
  const realIp = normalizeClientIp(String(req.headers['x-real-ip'] || ''))
  const remote = normalizeClientIp(String(req.socket?.remoteAddress || req.ip || ''))
  return forwarded || realIp || remote
}

function hashClientIp(req) {
  const ip = getClientIp(req)
  if (!ip) return ''
  return crypto.createHash('sha256').update(ip).digest('hex')
}

function consumeLanPairRateLimit(scope, key, maxPerWindow) {
  const now = Date.now()
  const safeScope = String(scope || 'default').trim() || 'default'
  const safeKey = String(key || 'anon').trim() || 'anon'
  const bucketKey = `${safeScope}:${safeKey}`
  let bucket = lanPairRateBuckets.get(bucketKey)
  if (!bucket || Number(bucket.resetAt || 0) <= now) {
    bucket = { count: 0, resetAt: now + LAN_PAIR_RATE_LIMIT_WINDOW_MS }
  }
  bucket.count += 1
  lanPairRateBuckets.set(bucketKey, bucket)

  if (lanPairRateBuckets.size > 4096) {
    for (const [k, v] of lanPairRateBuckets.entries()) {
      if (Number(v?.resetAt || 0) <= now) lanPairRateBuckets.delete(k)
    }
  }

  return {
    allowed: bucket.count <= maxPerWindow,
    retryAfterSeconds: Math.max(1, Math.ceil((Number(bucket.resetAt || now) - now) / 1000))
  }
}

function isPrivateIpv4(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (host.startsWith('10.')) return true
  if (host.startsWith('192.168.')) return true
  const parts = host.split('.')
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const second = Number.parseInt(parts[1], 10)
    if (parts[0] === '172' && second >= 16 && second <= 31) return true
  }
  return false
}

function isLikelyLanHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host) return false
  if (host.endsWith('.local')) return true
  return isPrivateIpv4(host)
}

function sanitizeLanBaseUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const protocol = String(parsed.protocol || '').toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:') return ''
    if (!isLikelyLanHost(parsed.hostname)) return ''
    return normalizeBaseUrl(parsed.origin)
  } catch (_) {
    return ''
  }
}

function normalizePairEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) return []
  const out = []
  const seen = new Set()
  for (const entry of endpoints) {
    const baseUrl = sanitizeLanBaseUrl(entry?.baseUrl || '')
    if (!baseUrl) continue
    if (seen.has(baseUrl)) continue
    seen.add(baseUrl)
    out.push({
      baseUrl,
      source: String(entry?.source || '').trim() || 'unknown'
    })
  }
  return out
}

function buildLanPairEndpoints(port, httpsPort) {
  const mdnsHost = getMdnsHost()
  const lanIps = detectLanAddresses()
  const entries = []
  for (const ip of lanIps) {
    const urls = buildLocalModeUrls(ip, port, httpsPort)
    entries.push({ baseUrl: normalizeBaseUrl(urls.httpManifest.replace(/\/local\/manifest\.json\?mode=local$/i, '')), source: 'lan-ip' })
  }
  const mdnsUrls = buildLocalModeUrls(mdnsHost, port, httpsPort)
  entries.push({ baseUrl: normalizeBaseUrl(mdnsUrls.httpManifest.replace(/\/local\/manifest\.json\?mode=local$/i, '')), source: 'mdns' })
  const loopbackUrls = buildLocalModeUrls('127.0.0.1', port, httpsPort)
  entries.push({ baseUrl: normalizeBaseUrl(loopbackUrls.httpManifest.replace(/\/local\/manifest\.json\?mode=local$/i, '')), source: 'loopback' })
  return normalizePairEndpoints(entries)
}

function ensureLanPairConfig(config = {}, options = {}) {
  const recommendedPairId = derivePairIdFromStremioUserId(config?.stremioUserId || '')
  const pairId = sanitizePairId(config.lanPairId) || recommendedPairId || makePairId()
  const pairKey = sanitizePairKey(config.lanPairKey) || makePairKey()
  const relayUrl = normalizeRelayUrl(config.lanPairRelayUrl || options.lanPairRelayUrl)
  const pairEnabledFallback = typeof options.defaultEnabled === 'boolean' ? options.defaultEnabled : false
  const pairRequiredFallback = typeof options.defaultRequired === 'boolean' ? options.defaultRequired : false
  const pairEnabled = parseBooleanLoose(config.lanPairEnabled, pairEnabledFallback)
  const pairRequired = parseBooleanLoose(config.lanPairRequired, pairRequiredFallback)

  return {
    ...config,
    lanPairEnabled: pairEnabled,
    lanPairRequired: pairRequired,
    lanPairId: pairId,
    lanPairKey: pairKey,
    lanPairRelayUrl: relayUrl
  }
}

function normalizeAddonConfig(config = {}, options = {}) {
  const normalized = {
    ...config,
    additionalStorageRoots: normalizeLocalStorageRoots(config.additionalStorageRoots)
  }
  const shouldNormalizeLanPair = (
    typeof options.defaultEnabled === 'boolean' ||
    typeof options.defaultRequired === 'boolean' ||
    typeof normalized.lanPairEnabled === 'boolean' ||
    typeof normalized.lanPairRequired === 'boolean' ||
    Boolean(normalized.lanPairId) ||
    Boolean(normalized.lanPairKey) ||
    Boolean(normalized.lanPairRelayUrl) ||
    Boolean(normalized.stremioUserId)
  )
  return shouldNormalizeLanPair
    ? ensureLanPairConfig(normalized, options)
    : normalized
}

function chooseLanPairEndpoint(state) {
  const endpoints = normalizePairEndpoints(state?.endpoints || [])
  if (!endpoints.length) return null
  const score = (entry) => {
    let points = 0
    if (entry.source === 'mdns') points += 40
    if (entry.source === 'lan-ip') points += 25
    if (entry.source === 'loopback') points += 1
    try {
      const host = new URL(entry.baseUrl).hostname
      if (host.endsWith('.local')) points += 20
      if (isPrivateIpv4(host) && host !== '127.0.0.1') points += 8
    } catch (_) {}
    return points
  }
  return [...endpoints].sort((a, b) => score(b) - score(a))[0]
}

function buildLanRedirectUrl(req, baseUrl) {
  const origin = sanitizeLanBaseUrl(baseUrl)
  if (!origin) return ''
  const raw = String(req.originalUrl || '')
  const qIndex = raw.indexOf('?')
  const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex)
  const query = qIndex === -1 ? '' : raw.slice(qIndex)
  const localPath = pathname.replace(/^\/[^/]+/, '/local')
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  params.set('mode', 'local')
  const queryText = params.toString()
  return `${origin}${localPath}${queryText ? `?${queryText}` : ''}`
}

function sanitizeHostForUrl(value) {
  const host = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9.\-:]/g, '')
  return host || ''
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return `${parsed.protocol}//${parsed.host}`.toLowerCase()
  } catch (_) {
    return ''
  }
}

function parseOriginAllowlist(raw) {
  const out = new Set()
  const parts = String(raw || '').split(',')
  for (const part of parts) {
    const origin = normalizeOrigin(part)
    if (origin) out.add(origin)
  }
  return out
}

function requestHostname(req) {
  const hostHeader = String(req.get('host') || '')
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']')
    if (end > 1) return hostHeader.slice(1, end).trim().toLowerCase()
  }
  return String(hostHeader.split(':')[0] || '').trim().toLowerCase()
}

function isLocalNetworkRequest(req) {
  const host = requestHostname(req)
  if (!host) return false
  if (host === '::1') return true
  return isLikelyLanHost(host)
}

function isSensitiveCorsRoute(req) {
  const pathName = String(req.path || '')
  return (
    pathName === '/encrypt' ||
    pathName.startsWith('/pair/') ||
    pathName.startsWith('/auth/') ||
    pathName.startsWith('/billing/')
  )
}

function isAllowedSensitiveOrigin(req) {
  const rawOrigin = String(req.headers.origin || '').trim()
  if (!rawOrigin) return true
  const origin = normalizeOrigin(rawOrigin)
  if (!origin) return false

  const currentOrigin = normalizeOrigin(getPublicBaseUrl(req))
  if (currentOrigin && origin === currentOrigin) return true
  if (SENSITIVE_WEB_ORIGINS.has(origin)) return true

  try {
    const host = String(new URL(origin).hostname || '').toLowerCase()
    if (host === '::1') return true
    if (isLikelyLanHost(host)) return true
  } catch (_) {}
  return false
}

function requireLocalNetworkRoute(req, res, next) {
  if (isLocalNetworkRequest(req)) return next()
  return res.status(403).json({ error: 'Local network route only' })
}

function requireLoopbackLocalConfig(req, res, next) {
  if (req.params.config !== 'local') return next()
  if (isLoopbackHost(req)) return next()
  return res.status(403).json({ error: 'Local config route requires loopback host' })
}

function requireLocalQbitControl(req, res, next) {
  if (req.params.config === 'local' && isLoopbackHost(req)) return next()
  return res.status(403).json({ error: 'qBittorrent control route is local-only' })
}

// ─── CORS ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const sensitiveCorsRoute = isSensitiveCorsRoute(req)
  const sensitiveOriginAllowed = !sensitiveCorsRoute || isAllowedSensitiveOrigin(req)
  const rawOrigin = String(req.headers.origin || '').trim()
  const requestOrigin = normalizeOrigin(rawOrigin)
  const responseOrigin = rawOrigin === 'null' ? 'null' : (requestOrigin || rawOrigin)

  if (rawOrigin) {
    if (sensitiveCorsRoute) {
      if (responseOrigin && sensitiveOriginAllowed) {
        res.setHeader('Access-Control-Allow-Origin', responseOrigin)
        res.setHeader('Vary', 'Origin')
      }
    } else {
      if (responseOrigin) {
        res.setHeader('Access-Control-Allow-Origin', responseOrigin)
        res.setHeader('Vary', 'Origin')
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*')
      }
    }
  } else if (sensitiveCorsRoute) {
    if (requestOrigin && sensitiveOriginAllowed) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin)
      res.setHeader('Vary', 'Origin')
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').trim()
  const defaultHeaders = [
    'Content-Type',
    'Authorization',
    'Range',
    'Accept',
    'Stremio-Protocol-Version',
    'Access-Control-Request-Private-Network'
  ]
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders || defaultHeaders.join(', '))
  if (String(req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if (String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase().includes('https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (req.method === 'OPTIONS') {
    if (sensitiveCorsRoute && !sensitiveOriginAllowed) return res.sendStatus(403)
    return res.sendStatus(204)
  }
  if (sensitiveCorsRoute && !sensitiveOriginAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  next()
})

// ─── Static routes ──────────────────────────────────────────
const publicDir = path.join(__dirname, 'public')
const configPage = path.join(publicDir, 'configure.html')
const runbooksPage = path.join(publicDir, 'runbooks.html')
const healthPage = path.join(publicDir, 'health.html')
app.use(express.static(publicDir, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const lowerPath = String(filePath || '').toLowerCase()
    if (lowerPath.endsWith('.html')) {
      setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
      return
    }
    setPublicCacheHeaders(res, 86400, { sMaxAge: 604800, staleWhileRevalidate: 2592000, immutable: true })
  }
}))
app.get('/configure', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(configPage)
})
app.get('/:config/configure', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(configPage)
})
app.get('/runbooks', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(runbooksPage)
})
app.get('/seedbox-runbooks', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(runbooksPage)
})
app.get('/thumb/sports/:info.svg', (req, res) => {
  try {
    const payload = decodeSportsThumbToken(req.params.info)
    const svg = renderSportsThumbSvg(payload)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    setPublicCacheHeaders(res, 86400, { sMaxAge: 604800, staleWhileRevalidate: 2592000, immutable: true })
    res.send(svg)
  } catch (_) {
    res.status(400).send('invalid thumbnail payload')
  }
})

// Build a URL to serve a local file — uses the built-in /file/ endpoint when no
// external fileServerUrl is configured (e.g. local qBit setup with no HTTP server).
function buildFileUrl(config, configToken, baseUrl, hash, torrent, fileName) {
  if (IS_VERCEL_RUNTIME) {
    if (config.fileServerUrl) {
      return mapPath(torrent?.save_path || torrent?.download_path || '', fileName, config.fileServerUrl, config.pathMapping)
    }
    return null
  }

  // Prefer built-in serving when the addon can access files on local disk.
  // This protects local installs from stale external fileServerUrl values in older config tokens.
  const localFilePath = findExistingLocalFilePath(torrent, fileName, config.additionalStorageRoots)
  const localFileAvailable = Boolean(localFilePath && fs.existsSync(localFilePath))
  if (config.fileServerUrl && !localFileAvailable) {
    return mapPath(torrent?.save_path || torrent?.download_path || '', fileName, config.fileServerUrl, config.pathMapping)
  }
  try {
    const info = encodeFileStateToken({ h: hash.toLowerCase(), p: fileName })
    return `${baseUrl}/${configToken}/file/${info}`
  } catch (_) {
    return null
  }
}

function getPublicBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const protocol = forwardedProto || req.protocol || 'http'
  return `${protocol}://${req.get('host')}`
}

function getConfigIssues(config, options = {}) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const issues = []
  const requestBaseUrl = normalizeBaseUrl(options.requestBaseUrl || '')
  const requestOrigin = normalizeOrigin(requestBaseUrl)
  const relayOrigin = normalizeOrigin(String(safeConfig.lanPairRelayUrl || '').trim())
  const usingHostedProfile = safeConfig.lanPairEnabled === false
  const missingFileServerUrl = !String(safeConfig.fileServerUrl || '').trim()
  const relayTargetsDifferentOrigin = Boolean(requestOrigin && relayOrigin && relayOrigin !== requestOrigin)

  if (usingHostedProfile && missingFileServerUrl && (IS_VERCEL_RUNTIME || relayTargetsDifferentOrigin)) {
    issues.push({
      code: 'HOSTED_FILE_SERVER_REQUIRED',
      message: 'Hosted profile needs an HTTPS File Server URL for completed-file playback. Add your seedbox file server URL or use a direct-host/LAN profile.'
    })
  }

  return issues
}

function isLoopbackHost(req) {
  const hostname = requestHostname(req)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function getInstallMode(req) {
  const mode = String(req.query.mode || req.query.node || '').toLowerCase()
  if (mode === 'local' || mode === 'hosted') return mode
  return isLoopbackHost(req) ? 'local' : 'hosted'
}

function parseBoolean(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function authSecretAvailable() {
  return Boolean(getAuthTokenSecret())
}

function stripeBillingAvailable() {
  return Boolean(stripe)
}

function isValidEmail(email) {
  const value = normalizeAccountEmail(email)
  if (!value) return false
  if (value.length < 5 || value.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPassword(password) {
  const value = String(password || '')
  if (value.length < 8 || value.length > 256) return false
  return true
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const raw = String(storedHash || '')
  const parts = raw.split(':')
  if (parts.length !== 2) return false
  const salt = parts[0]
  const expectedHex = parts[1]
  if (!salt || !expectedHex) return false
  try {
    const derived = crypto.scryptSync(String(password || ''), salt, 64)
    const expected = Buffer.from(expectedHex, 'hex')
    if (expected.length !== derived.length) return false
    return crypto.timingSafeEqual(expected, derived)
  } catch (_) {
    return false
  }
}

function toUnixMsFromStripe(secondsValue) {
  const n = Number(secondsValue || 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.floor(n * 1000)
}

function isSubscriptionActiveStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(status || '').toLowerCase())
}

function isUserSubscriptionActive(user) {
  const status = String(user?.billing?.status || '').toLowerCase()
  if (!isSubscriptionActiveStatus(status)) return false
  const end = Number(user?.billing?.currentPeriodEndMs || 0)
  if (!Number.isFinite(end) || end <= 0) return true
  return end > Date.now()
}

function trialStartMsForUser(user) {
  const linkedAt = Number(user?.stremio?.linkedAt || 0)
  if (Number.isFinite(linkedAt) && linkedAt > 0) return linkedAt
  const createdAt = Number(user?.createdAt || 0)
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt
  return 0
}

function getUserTrialState(user) {
  const base = {
    enabled: TRIAL_ENABLED,
    days: TRIAL_DAYS,
    requiresLinkedAccount: TRIAL_REQUIRE_LINKED_ACCOUNT,
    eligible: false,
    active: false,
    startMs: 0,
    endMs: 0,
    remainingMs: 0
  }
  if (!TRIAL_ENABLED) return base

  const startMs = trialStartMsForUser(user)
  if (!startMs) return base

  const durationMs = TRIAL_DAYS * 24 * 60 * 60 * 1000
  const endMs = startMs + durationMs
  const now = Date.now()
  const active = now < endMs

  return {
    ...base,
    eligible: true,
    active,
    startMs,
    endMs,
    remainingMs: active ? Math.max(0, endMs - now) : 0
  }
}

function publicUserModel(user) {
  if (!user || typeof user !== 'object') return null
  const billing = user.billing && typeof user.billing === 'object' ? user.billing : {}
  const stremio = user.stremio && typeof user.stremio === 'object' ? user.stremio : {}
  const trial = getUserTrialState(user)
  return {
    id: String(user.id || ''),
    email: String(user.email || ''),
    stremio: {
      linked: Boolean(stremio.userId),
      userId: String(stremio.userId || ''),
      linkedAt: Number(stremio.linkedAt || 0),
      lastVerifiedAt: Number(stremio.lastVerifiedAt || 0)
    },
    trial: {
      enabled: trial.enabled,
      days: trial.days,
      requiresLinkedAccount: trial.requiresLinkedAccount,
      eligible: trial.eligible,
      active: trial.active,
      startMs: trial.startMs,
      endMs: trial.endMs,
      remainingMs: trial.remainingMs
    },
    billing: {
      status: String(billing.status || 'inactive'),
      active: isUserSubscriptionActive(user),
      customerId: String(billing.customerId || ''),
      subscriptionId: String(billing.subscriptionId || ''),
      priceId: String(billing.priceId || ''),
      currentPeriodEndMs: Number(billing.currentPeriodEndMs || 0),
      cancelAtPeriodEnd: Boolean(billing.cancelAtPeriodEnd)
    },
    createdAt: Number(user.createdAt || 0),
    updatedAt: Number(user.updatedAt || 0)
  }
}

function sanitizeRedirectUrl(input, fallback = '') {
  const candidate = String(input || '').trim()
  if (candidate) {
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString()
    } catch (_) {}
  }
  const fb = String(fallback || '').trim()
  if (!fb) return ''
  try {
    const parsed = new URL(fb)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString()
  } catch (_) {}
  return ''
}

async function applyBillingUpdateToUser(user, patch = {}) {
  if (!user || typeof user !== 'object') return null
  const next = {
    ...user,
    billing: {
      ...(user.billing && typeof user.billing === 'object' ? user.billing : {}),
      status: String(patch.status || user?.billing?.status || 'inactive'),
      customerId: String(patch.customerId || user?.billing?.customerId || ''),
      subscriptionId: String(patch.subscriptionId || user?.billing?.subscriptionId || ''),
      priceId: String(patch.priceId || user?.billing?.priceId || ''),
      currentPeriodEndMs: Number(patch.currentPeriodEndMs || user?.billing?.currentPeriodEndMs || 0),
      cancelAtPeriodEnd: Boolean(
        patch.cancelAtPeriodEnd !== undefined
          ? patch.cancelAtPeriodEnd
          : user?.billing?.cancelAtPeriodEnd
      ),
      updatedAt: Date.now()
    }
  }
  return accountStore.saveUser(next)
}

async function requireAuthUser(req, res, next) {
  if (!authSecretAvailable()) {
    return res.status(500).json({ error: 'AUTH_TOKEN_SECRET not configured' })
  }
  const authSecret = getAuthTokenSecret()
  const token = parseBearerToken(req.headers.authorization || '')
  if (!token) return res.status(401).json({ error: 'Missing bearer token' })
  const payload = verifyAuthToken(token, authSecret)
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = String(payload.sub || '').trim()
  if (!userId) return res.status(401).json({ error: 'Invalid token subject' })
  const user = await accountStore.getUserById(userId)
  if (!user) return res.status(401).json({ error: 'Account not found' })
  req.authUser = user
  req.authTokenPayload = payload
  next()
}

async function requireActiveSubscription(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: 'Not authenticated' })
  if (!isUserSubscriptionActive(req.authUser)) {
    return res.status(402).json({ error: 'Active subscription required' })
  }
  next()
}

async function requireConfigSubscription(req, res, next) {
  if (!REQUIRE_ACTIVE_SUBSCRIPTION) return next()

  const userId = String(req?.config?.accountUserId || '').trim()
  if (!userId) {
    if (TRIAL_ENABLED && !TRIAL_REQUIRE_LINKED_ACCOUNT) {
      req.trialAccess = {
        enabled: true,
        active: true,
        guest: true,
        requiresLinkedAccount: false
      }
      return next()
    }
    return res.status(402).json({
      error: 'Active subscription required',
      detail: TRIAL_ENABLED
        ? 'Link Stremio account in Configure to start your free trial.'
        : 'Subscription required'
    })
  }

  const user = await accountStore.getUserById(userId)
  if (!user) {
    return res.status(402).json({
      error: 'Active subscription required',
      detail: TRIAL_ENABLED
        ? 'Linked account not found. Re-link your Stremio account in Configure.'
        : 'Subscription required'
    })
  }

  if (isUserSubscriptionActive(user)) {
    req.configAccountUser = user
    return next()
  }

  const trial = getUserTrialState(user)
  if (trial.active) {
    req.configAccountUser = user
    req.trialAccess = trial
    return next()
  }

  return res.status(402).json({
    error: 'Active subscription required',
    detail: trial.enabled && trial.eligible
      ? 'Free trial has ended. Activate subscription to continue.'
      : 'Subscription required',
    trial: trial.enabled ? {
      enabled: true,
      active: false,
      days: trial.days,
      startMs: trial.startMs,
      endMs: trial.endMs,
      requiresLinkedAccount: trial.requiresLinkedAccount
    } : { enabled: false }
  })
}

function parseCacheSeconds(value, fallback, min = 0, max = 3600) {
  const raw = Number.parseInt(String(value ?? ''), 10)
  const safeFallback = Number.isFinite(fallback) ? fallback : 0
  if (!Number.isFinite(raw) || raw <= 0) return Math.max(min, Math.min(max, safeFallback))
  return Math.max(min, Math.min(max, raw))
}

function setPublicCacheHeaders(res, browserMaxAgeSeconds, options = {}) {
  const browserMaxAge = parseCacheSeconds(browserMaxAgeSeconds, 0, 0, 31536000)
  const sMaxAge = parseCacheSeconds(options.sMaxAge, browserMaxAge, 0, 31536000)
  const staleWhileRevalidate = parseCacheSeconds(
    options.staleWhileRevalidate,
    Math.max(sMaxAge, 60),
    0,
    31536000
  )
  const directives = [
    'public',
    `max-age=${browserMaxAge}`,
    `s-maxage=${sMaxAge}`,
    `stale-while-revalidate=${staleWhileRevalidate}`
  ]
  if (options.immutable) directives.push('immutable')
  res.setHeader('Cache-Control', directives.join(', '))
}

function applyHostedRouteCacheHeaders(req, res, browserMaxAgeSeconds, options = {}) {
  if (String(req.params?.config || '').toLowerCase() === 'local' || req.localConfigMissing) {
    res.setHeader('Cache-Control', 'no-store')
    return
  }
  setPublicCacheHeaders(res, browserMaxAgeSeconds, options)
}

function autoDeleteWatchedEnabled(config) {
  if (typeof config?.autoDeleteWatched === 'boolean') return config.autoDeleteWatched
  return parseBoolean(process.env.PVTKRRX_AUTO_DELETE_WATCHED)
}

function watchedDeleteGraceMs(config) {
  const cfgSeconds = Number.parseInt(String(config?.watchedDeleteGraceSeconds || ''), 10)
  if (Number.isFinite(cfgSeconds) && cfgSeconds >= 0) return cfgSeconds * 1000
  return WATCHED_DELETE_GRACE_MS
}

function scheduleWatchedCleanup(config, hash, reason = 'watched-threshold') {
  const normalizedHash = String(hash || '').toLowerCase()
  if (!normalizedHash) return
  if (!autoDeleteWatchedEnabled(config)) return
  if (watchedDeleteInFlight.has(normalizedHash)) return

  const existing = watchedDeleteTimers.get(normalizedHash)
  if (existing?.timer) clearTimeout(existing.timer)

  const delay = watchedDeleteGraceMs(config)
  const timer = setTimeout(async () => {
    watchedDeleteTimers.delete(normalizedHash)
    if (watchedDeleteInFlight.has(normalizedHash)) return
    watchedDeleteInFlight.add(normalizedHash)
    try {
      const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
      await qbit.delete(normalizedHash, true)
      console.log(`[watch-cleanup] removed torrent ${normalizedHash.slice(0, 8)} (${reason})`)
    } catch (err) {
      console.warn(`[watch-cleanup] failed ${normalizedHash.slice(0, 8)}: ${err.message}`)
    } finally {
      watchedDeleteInFlight.delete(normalizedHash)
    }
  }, delay)

  if (typeof timer.unref === 'function') timer.unref()
  watchedDeleteTimers.set(normalizedHash, { timer, reason, scheduledAt: Date.now(), delay })
}

function getManifest(req) {
  const mode = getInstallMode(req)
  let profile = 'online'
  if (mode === 'local') {
    profile = 'local'
  } else if (req?.params?.config && req.params.config !== 'local' && parseBooleanLoose(req?.config?.lanPairEnabled, false)) {
    profile = 'lan'
  }

  const idSuffix = profile
  const nameLabel = profile === 'local'
    ? 'PC Local'
    : profile === 'lan'
      ? 'LAN Bridge'
      : 'Remote Seedbox'
  const defaultLogoUrl = `${getPublicBaseUrl(req)}/logo.ico`
  // Keep local profile self-contained; hosted/lan profiles can use manifest logo URL.
  const logoUrl = profile === 'local'
    ? defaultLogoUrl
    : String(manifest.logo || defaultLogoUrl)

  const nextManifest = {
    ...manifest,
    behaviorHints: { ...(manifest.behaviorHints || {}) },
    id: `com.kepners.pvtkrrx.${idSuffix}`,
    name: `PVTKRRX (${nameLabel})`,
    logo: logoUrl
  }

  if (profile === 'local') {
    return {
      ...nextManifest,
      description: 'Local addon for the same Windows PC running PVTKRRX. Browse movies, TV, sports, and library, and stream directly from the local server.'
    }
  }

  return nextManifest
}

async function warmLocalProviders(config, logger = console, reason = 'boot') {
  const snapshot = config && typeof config === 'object' ? { ...config } : null
  if (!snapshot) {
    logger.log(`[startup-warm] skipped (${reason}): no local config`)
    return null
  }

  const qbitUrl = String(snapshot.qbitUrl || '').trim()
  const jackettUrl = String(snapshot.jackettUrl || '').trim()
  const jackettApiKey = String(snapshot.jackettApiKey || '').trim()
  if (!qbitUrl && (!jackettUrl || !jackettApiKey)) {
    logger.log(`[startup-warm] skipped (${reason}): qBittorrent/Prowlarr not configured`)
    return null
  }

  logger.log(`[startup-warm] starting (${reason})`)
  const tasks = []

  if (qbitUrl) {
    tasks.push((async () => {
      const qbit = new QBitClient(qbitUrl, snapshot.qbitUsername, snapshot.qbitPassword)
      const torrents = await qbit.torrents('all')
      const total = Array.isArray(torrents) ? torrents.length : 0
      const completed = Array.isArray(torrents)
        ? torrents.filter(t => Number(t?.progress || 0) >= 0.999).length
        : 0
      const active = Math.max(0, total - completed)
      logger.log(`[startup-warm] qBittorrent ready (${total} torrents, ${completed} completed, ${active} active)`)
      return { service: 'qbit', total, completed, active }
    })().catch((err) => {
      logger.warn(`[startup-warm] qBittorrent warm-up failed: ${err.message}`)
      return { service: 'qbit', error: err.message }
    }))
  }

  if (jackettUrl && jackettApiKey) {
    tasks.push((async () => {
      const prowlarr = new ProwlarrClient(jackettUrl, jackettApiKey)
      const indexers = await prowlarr.caps()
      const count = Array.isArray(indexers) ? indexers.length : 0
      logger.log(`[startup-warm] Prowlarr ready (${count} indexers)`)
      return { service: 'prowlarr', count }
    })().catch((err) => {
      logger.warn(`[startup-warm] Prowlarr warm-up failed: ${err.message}`)
      return { service: 'prowlarr', error: err.message }
    }))
  }

  return Promise.all(tasks)
}

function scheduleLocalProviderWarmup(config = loadLocalConfigFile(), logger = console, reason = 'boot') {
  const snapshot = config && typeof config === 'object' ? { ...config } : null
  if (!snapshot) return Promise.resolve(null)
  if (localProviderWarmupPromise) return localProviderWarmupPromise

  localProviderWarmupPromise = warmLocalProviders(snapshot, logger, reason)
    .catch(() => null)
    .finally(() => {
      localProviderWarmupPromise = null
    })

  return localProviderWarmupPromise
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractInfoHashFromLink(link) {
  const raw = String(link || '')
  if (!raw) return ''

  const magnetMatch = raw.match(/[?&]xt=urn:btih:([a-zA-Z0-9]+)/i)
  if (magnetMatch && magnetMatch[1]) return magnetMatch[1].toLowerCase()

  const hashMatch = raw.match(/\b[a-fA-F0-9]{40}\b/)
  if (hashMatch && hashMatch[0]) return hashMatch[0].toLowerCase()
  return ''
}

function extractTrackerHost(link) {
  try {
    const url = new URL(String(link || ''))
    return String(url.hostname || '').toLowerCase()
  } catch (_) {
    return ''
  }
}

function pickLikelyNewTorrent(torrents, knownHashes, trackerHost) {
  if (!Array.isArray(torrents) || !torrents.length) return null
  const known = knownHashes || new Set()
  const host = String(trackerHost || '')
  const scored = torrents
    .filter(t => t?.hash)
    .map(t => {
      const hash = String(t.hash || '').toLowerCase()
      const isNew = !known.has(hash)
      let score = 0
      if (isNew) score += 1000
      if (host && String(t.tracker || '').toLowerCase().includes(host)) score += 100
      score += Number(t.added_on || 0)
      return { torrent: t, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.torrent || null
}

function normalizeTorrentPath(relPath) {
  return String(relPath || '').replace(/[\\/]+/g, '/').replace(/^\/+/, '')
}

function findTorrentFileByPath(files, relPath) {
  const target = normalizeTorrentPath(relPath).toLowerCase()
  if (!target) return null

  const direct = files.find(f => normalizeTorrentPath(f.name).toLowerCase() === target)
  if (direct) return direct

  const targetBase = path.basename(target)
  return files.find(f => path.basename(normalizeTorrentPath(f.name).toLowerCase()) === targetBase) || null
}

function resolveTorrentFilePath(torrent, relPath, additionalStorageRoots = []) {
  return findExistingLocalFilePath(torrent, relPath, additionalStorageRoots)
}

function getReadableBytes(fileEntry, torrent, diskBytes) {
  const complete = Number(torrent?.progress || 0) >= 0.999 || Number(fileEntry?.progress || 0) >= 0.999
  if (complete) return diskBytes

  const entrySize = Number(fileEntry?.size || 0)
  const fileProgress = Number(fileEntry?.progress || torrent?.progress || 0)
  let estimated = Math.floor(entrySize * fileProgress)
  if (!Number.isFinite(estimated) || estimated < 0) estimated = 0

  // Keep a small safety margin so range reads never outrun currently downloaded pieces.
  const margin = 2 * 1024 * 1024
  estimated = Math.max(0, estimated - margin)

  return Math.max(0, Math.min(diskBytes, estimated))
}

function isPlaybackReady(fileEntry, readableBytes) {
  const size = Number(fileEntry?.size || 0)
  if (!size) return false
  const required = Math.min(size, Math.max(1, Math.floor(size * STREAM_READY_START_FRACTION)))
  return readableBytes >= required || Number(fileEntry?.progress || 0) >= 0.999
}

async function primeTorrentForStreaming(qbit, torrent, videoFile, allFiles = null) {
  const hash = String(torrent?.hash || '').toLowerCase()
  if (!hash) return

  const seqEnabled = torrent?.seq_dl === true
  const firstLastEnabled = torrent?.f_l_piece_prio === true

  if (!seqEnabled) {
    try {
      await qbit.toggleSequentialDownload(hash)
    } catch (err) {
      console.warn(`[streaming-prime] sequential toggle failed ${hash.slice(0, 8)}: ${err.message}`)
    }
  }
  // "first + last" can make the piece map appear scattered.
  // Keep it optional so local playback can stay head-first by default.
  if (STREAM_PRIORITIZE_LAST_PIECES && !firstLastEnabled) {
    try {
      await qbit.toggleFirstLastPiecePrio(hash)
    } catch (err) {
      console.warn(`[streaming-prime] first/last toggle failed ${hash.slice(0, 8)}: ${err.message}`)
    }
  } else if (!STREAM_PRIORITIZE_LAST_PIECES && firstLastEnabled) {
    try {
      await qbit.toggleFirstLastPiecePrio(hash)
    } catch (err) {
      console.warn(`[streaming-prime] first/last untoggle failed ${hash.slice(0, 8)}: ${err.message}`)
    }
  }

  if (videoFile && Number.isInteger(videoFile.index)) {
    try {
      const files = Array.isArray(allFiles) ? allFiles : []
      const otherFileIds = files
        .filter(f => Number.isInteger(f?.index) && f.index !== videoFile.index)
        .map(f => f.index)
      if (otherFileIds.length > 0) {
        await qbit.setFilePriority(hash, otherFileIds, 0)
      }
      await qbit.setFilePriority(hash, [videoFile.index], 7)
    } catch (err) {
      console.warn(`[streaming-prime] file priority failed ${hash.slice(0, 8)}: ${err.message}`)
    }
  }
}

async function loadTorrentPlaybackState(qbit, hash, targetPath, additionalStorageRoots = []) {
  if (!hash) return null
  const list = await qbit.torrentsByHashes(hash, 'all')
  const torrent = Array.isArray(list) && list.length ? list[0] : null
  if (!torrent) return null

  const files = await qbit.files(torrent.hash)
  if (!Array.isArray(files) || files.length === 0) {
    return {
      torrent,
      files: [],
      file: null,
      resolvedFilePath: '',
      fileExists: false,
      diskSize: 0,
      readableBytes: 0,
      ready: false
    }
  }
  const targetFile = findTorrentFileByPath(files, targetPath)
  const preferredVideoFile = findVideoFile(files)
  const packedArchive = hasPackedArchiveFiles(files)

  // If a previous URL points to a Sample file, upgrade to the primary video when available.
  // For packed scene releases (RAR + Sample), avoid selecting Sample as main playback target.
  let chosenFile = null
  if (targetFile && !isSampleVideoName(targetFile.name)) {
    chosenFile = targetFile
  } else if (preferredVideoFile) {
    chosenFile = preferredVideoFile
  } else if (targetFile && !packedArchive) {
    chosenFile = targetFile
  }

  const resolvedFilePath = resolveTorrentFilePath(torrent, chosenFile?.name || targetPath, additionalStorageRoots)
  const fileExists = Boolean(resolvedFilePath && fs.existsSync(resolvedFilePath))
  const diskSize = fileExists ? fs.statSync(resolvedFilePath).size : 0
  const readableBytes = getReadableBytes(chosenFile, torrent, diskSize)
  return {
    torrent,
    files,
    file: chosenFile,
    resolvedFilePath,
    fileExists,
    diskSize,
    readableBytes,
    packedArchive,
    ready: isPlaybackReady(chosenFile, readableBytes)
  }
}

// ─── POST /encrypt — server-side config encryption ─────────
app.post('/encrypt', (req, res) => {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) return res.status(500).json({ error: 'ENCRYPTION_SECRET not configured' })
  const clientIp = getClientIp(req)
  const limit = consumeLanPairRateLimit('encrypt', clientIp || 'unknown', ENCRYPT_MAX_PER_WINDOW)
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: 'too many requests' })
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid config payload' })
  }

  const normalizedConfig = normalizeAddonConfig(req.body)
  const issues = getConfigIssues(normalizedConfig, {
    requestBaseUrl: getPublicBaseUrl(req)
  })
  if (issues.length > 0) {
    return res.status(400).json({
      error: issues[0].message,
      issueCode: issues[0].code,
      notifyUser: true
    })
  }

  try {
    const token = encrypt(normalizedConfig, secret)
    res.json({ token })
  } catch (err) {
    res.status(400).json({ error: 'Encryption failed' })
  }
})

// Save local-mode config to disk so Stremio can use a stable /local manifest URL.
app.post('/local-config', requireLocalNetworkRoute, (req, res) => {
  const cfg = req.body || {}
  if (!cfg.qbitUrl) {
    return res.status(400).json({ error: 'qBit URL is required for local config' })
  }

  try {
    const localHostname = normalizeLocalHostname(cfg.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    const saved = normalizeAddonConfig({
      ...cfg,
      localHostname,
      localHostnameCustom
    }, {
      defaultEnabled: true,
      defaultRequired: true
    })
    saveLocalConfigFile(saved)
    scheduleLocalProviderWarmup(saved, console, 'local-config-save').catch(() => {})
    res.json({
      ok: true,
      localHostname,
      lanPairId: saved.lanPairId,
      lanPairKey: saved.lanPairKey,
      lanPairEnabled: saved.lanPairEnabled,
      lanPairRequired: saved.lanPairRequired,
      lanPairRelayUrl: saved.lanPairRelayUrl
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save local config' })
  }
})

app.post('/auto-provision', requireLocalNetworkRoute, async (req, res) => {
  try {
    const options = req.body || {}
    const localHostname = normalizeLocalHostname(options.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    const accountUserId = String(options.accountUserId || '').trim()
    const accountProvider = String(options.accountProvider || '').trim()
    const accountLinkedAt = Number(options.accountLinkedAt || 0)
    const stremioUserId = normalizeStremioUserId(options.stremioUserId || '')
    const hintedPairId = sanitizePairId(options.lanPairId || '')
    const result = await autoProvisionWindows({
      ...options,
      localHostname
    })
    const provisionedConfig = result.config
      ? normalizeAddonConfig({
        ...result.config,
        ...(accountUserId ? { accountUserId } : {}),
        ...(accountProvider ? { accountProvider } : {}),
        ...(accountLinkedAt > 0 ? { accountLinkedAt } : {}),
        ...(stremioUserId ? { stremioUserId } : {}),
        ...(hintedPairId ? { lanPairId: hintedPairId } : {}),
        localHostname,
        localHostnameCustom
      }, {
        defaultEnabled: true,
        defaultRequired: true
      })
      : null

    if (result.config && result.config.qbitUrl) {
      saveLocalConfigFile(provisionedConfig)
      scheduleLocalProviderWarmup(provisionedConfig, console, 'auto-provision').catch(() => {})
    }
    res.json({
      ...result,
      config: provisionedConfig || result.config,
      lanPair: provisionedConfig
        ? {
            lanPairId: provisionedConfig.lanPairId,
            lanPairKey: provisionedConfig.lanPairKey,
            lanPairEnabled: provisionedConfig.lanPairEnabled,
            lanPairRequired: provisionedConfig.lanPairRequired,
            lanPairRelayUrl: provisionedConfig.lanPairRelayUrl
          }
        : null,
      localHostname
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Auto provision failed', detail: err.message })
  }
})

app.get('/health', (req, res) => {
  const accept = String(req.headers.accept || '')
  const wantsHtml = req.query?.format !== 'json' && accept.includes('text/html')
  if (wantsHtml) {
    setPublicCacheHeaders(res, 10, { sMaxAge: 60, staleWhileRevalidate: 60 })
    return res.sendFile(healthPage)
  }
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    ok: true,
    time: new Date().toISOString()
  })
})

app.get('/auth/stremio/local-status', (req, res) => {
  if (!isSameHostRequest(req)) {
    return res.status(403).json({ error: 'Open configure on the Windows host PC to check local Stremio status.' })
  }

  try {
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      ...getLocalStremioDesktopStatus()
    })
  } catch (err) {
    res.status(500).json({
      error: 'Failed to inspect local Stremio status',
      detail: err.message
    })
  }
})

app.post('/auth/stremio/auto-link-local', async (req, res) => {
  if (!authSecretAvailable()) {
    return res.status(500).json({ error: 'AUTH_TOKEN_SECRET not configured' })
  }
  if (!isSameHostRequest(req)) {
    return res.status(403).json({ error: 'Auto detect only works from this PC. Open configure on the Windows host and try again.' })
  }

  const authSecret = getAuthTokenSecret()

  try {
    const clientIp = getClientIp(req)
    const limit = consumeLanPairRateLimit(
      'auth-stremio-auto-link',
      clientIp || 'unknown',
      AUTH_MAX_PER_WINDOW
    )
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ error: 'too many requests' })
    }

    const candidates = discoverLocalStremioAuthKeyCandidates()
    if (!candidates.length) {
      return res.status(404).json({
        error: 'No signed-in Stremio session found on this PC',
        detail: 'Open Stremio Desktop or sign in at web.stremio.com in Brave, Chrome, or Edge, then try again.'
      })
    }

    let lastVerificationError = null
    for (const candidate of candidates) {
      try {
        const payload = await createLinkedStremioAuthSession(candidate.authKey, authSecret)
        return res.json({
          ...payload,
          detected: {
            method: 'local-storage',
            sourceLabel: candidate.sourceLabel
          }
        })
      } catch (err) {
        if (Number(err?.statusCode || 0) === 401) {
          lastVerificationError = err
          continue
        }
        throw err
      }
    }

    if (lastVerificationError) {
      return res.status(401).json({
        error: 'Signed-in Stremio session was found, but the stored AuthKey is no longer valid',
        detail: 'Open Stremio Desktop or web.stremio.com, refresh the login, then try Auto Find again.'
      })
    }

    return res.status(404).json({
      error: 'No valid Stremio AuthKey found on this PC',
      detail: 'Open Stremio Desktop or sign in at web.stremio.com, then try again.'
    })
  } catch (err) {
    const statusCode = Number(err?.statusCode || 0) || 500
    const payload = { error: statusCode === 500 ? 'Local Stremio auto-link failed' : err.message }
    if (err?.detail) payload.detail = err.detail
    res.status(statusCode).json(payload)
  }
})

app.post('/auth/stremio/link-authkey', async (req, res) => {
  if (!authSecretAvailable()) {
    return res.status(500).json({ error: 'AUTH_TOKEN_SECRET not configured' })
  }
  const authSecret = getAuthTokenSecret()

  try {
    const clientIp = getClientIp(req)
    const limit = consumeLanPairRateLimit(
      'auth-stremio-link',
      clientIp || 'unknown',
      AUTH_MAX_PER_WINDOW
    )
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ error: 'too many requests' })
    }

    const payload = await createLinkedStremioAuthSession(req.body?.authKey, authSecret)
    res.json(payload)
  } catch (err) {
    const statusCode = Number(err?.statusCode || 0) || 500
    const payload = { error: statusCode === 500 ? 'Stremio link failed' : err.message }
    if (err?.detail) payload.detail = err.detail
    res.status(statusCode).json(payload)
  }
})

app.get('/auth/me', requireAuthUser, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    ok: true,
    user: publicUserModel(req.authUser),
    freeMode: FREE_MODE,
    requiresActiveSubscription: REQUIRE_ACTIVE_SUBSCRIPTION
  })
})

// Returns local/lan install URLs for one-click setup across PC + TV/phone on same LAN.
app.get('/network-info', requireLocalNetworkRoute, (req, res) => {
  const port = parseInt(process.env.PORT || '7000', 10)
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)
  const lanIps = detectLanAddresses()
  const primaryLanIp = lanIps[0] || ''
  const mdnsHost = getMdnsHost()
  const loopback = buildLocalModeUrls('127.0.0.1', port, httpsPort)
  const mdns = buildLocalModeUrls(mdnsHost, port, httpsPort)
  const lan = primaryLanIp ? buildLocalModeUrls(primaryLanIp, port, httpsPort) : null

  res.json({
    port,
    httpsPort,
    localHostname: mdnsHost,
    loopback,
    mdns: { hostname: mdnsHost, ...mdns },
    lan,
    lanCandidates: lanIps.map(ip => ({ ip, ...buildLocalModeUrls(ip, port, httpsPort) })),
    preferredOrder: [
      { id: 'localhost', url: loopback.httpManifest },
      { id: 'mdns', url: mdns.httpManifest },
      { id: 'lan-ip', url: lan ? lan.httpManifest : '' }
    ],
    pairEndpoints: buildLanPairEndpoints(port, httpsPort)
  })
})

app.post('/pair/heartbeat', async (req, res) => {
  try {
    const pairId = sanitizePairId(req.body?.pairId)
    const pairKey = sanitizePairKey(req.body?.pairKey)
    const localHostname = normalizeLocalHostname(req.body?.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const relayUrl = normalizeRelayUrl(req.body?.relayUrl || '')
    const endpoints = normalizePairEndpoints(req.body?.endpoints || [])

    if (!pairId || !pairKey) {
      return res.status(400).json({ ok: false, error: 'pairId and pairKey are required' })
    }
    if (!endpoints.length) {
      return res.status(400).json({ ok: false, error: 'At least one valid LAN endpoint is required' })
    }
    const clientIp = getClientIp(req)
    const limit = consumeLanPairRateLimit(
      'pair-heartbeat',
      `${clientIp || 'unknown'}:${pairId}`,
      LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW
    )
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ ok: false, error: 'too many requests' })
    }

    const incomingKeyHash = hashPairKey(pairKey)
    const incomingIpHash = LAN_PAIR_BIND_PUBLIC_IP ? hashClientIp(req) : ''
    const existingState = await lanPairStore.get(pairId)
    if (existingState) {
      if (incomingKeyHash !== String(existingState.keyHash || '')) {
        return res.status(403).json({ ok: false, error: 'invalid pair key' })
      }
      if (LAN_PAIR_BIND_PUBLIC_IP && LAN_PAIR_LOCK_HOST) {
        const existingIpHash = String(existingState.clientIpHash || '')
        if (existingIpHash && incomingIpHash && existingIpHash !== incomingIpHash) {
          return res.status(409).json({ ok: false, error: 'pair host mismatch' })
        }
      }
    }

    const now = Date.now()
    const state = {
      pairId,
      keyHash: incomingKeyHash,
      clientIpHash: incomingIpHash,
      endpoints,
      localHostname,
      relayUrl,
      appVersion: String(req.body?.appVersion || '').trim(),
      updatedAt: now,
      expiresAt: now + LAN_PAIR_TTL_SECONDS * 1000
    }
    await lanPairStore.set(pairId, state, LAN_PAIR_TTL_SECONDS)
    res.json({
      ok: true,
      online: true,
      ttlSeconds: LAN_PAIR_TTL_SECONDS,
      updatedAt: state.updatedAt
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'heartbeat failed', detail: err.message })
  }
})

app.post('/pair/status', async (req, res) => {
  try {
    const pairId = sanitizePairId(req.body?.pairId)
    const pairKey = sanitizePairKey(req.body?.pairKey)
    if (!pairId || !pairKey) return res.status(400).json({ ok: false, error: 'pairId and pairKey are required' })
    const clientIp = getClientIp(req)
    const limit = consumeLanPairRateLimit(
      'pair-status',
      `${clientIp || 'unknown'}:${pairId}`,
      LAN_PAIR_STATUS_MAX_PER_WINDOW
    )
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ ok: false, error: 'too many requests' })
    }

    const state = await lanPairStore.get(pairId)
    if (!state) {
      return res.json({ ok: true, online: false })
    }

    if (hashPairKey(pairKey) !== String(state.keyHash || '')) {
      return res.json({ ok: true, online: false })
    }

    if (LAN_PAIR_BIND_PUBLIC_IP) {
      const stateIpHash = String(state.clientIpHash || '')
      const requestIpHash = hashClientIp(req)
      if (stateIpHash && requestIpHash && stateIpHash !== requestIpHash) {
        return res.json({ ok: true, online: false })
      }
    }

    const preferred = chooseLanPairEndpoint(state)
    res.json({
      ok: true,
      online: Boolean(preferred),
      updatedAt: Number(state.updatedAt || 0),
      expiresAt: Number(state.expiresAt || 0),
      endpointBaseUrl: String(preferred?.baseUrl || ''),
      endpointSource: String(preferred?.source || ''),
      localHostname: String(state.localHostname || '')
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'status failed', detail: err.message })
  }
})

// Local install helper page (localhost copy workflow).
// Open on the same PC that runs PVTKRRX:
// http://127.0.0.1:7000/local/install
app.get('/local/install', requireLocalNetworkRoute, (req, res) => {
  const port = parseInt(process.env.PORT || '7000', 10)
  const loopbackManifest = `http://127.0.0.1:${port}/local/manifest.json?mode=local`
  const requestedHost = sanitizeHostForUrl(req.query.host)
  const headerHost = sanitizeHostForUrl(String(req.get('host') || '').split(':')[0])
  const fallbackHost = sanitizeHostForUrl(getMdnsHost())
  const host = requestedHost || headerHost || fallbackHost || '127.0.0.1'
  const lanDebugManifest = `http://${host}:${port}/local/manifest.json?mode=local`
  const pcConfigureUrl = `http://127.0.0.1:${port}/configure?target=pc`
  const lanConfigureUrl = `http://127.0.0.1:${port}/configure?target=lan`
  const seedboxConfigureUrl = `http://127.0.0.1:${port}/configure?target=seedbox`

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PVTKRRX Install Routes</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #101018; color: #e8e8ff; }
    .shell { max-width: 1040px; margin: 0 auto; }
    .card { padding: 18px; border: 1px solid #2a2a3a; border-radius: 12px; background: #151526; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18); }
    .lead { max-width: 760px; line-height: 1.55; color: #c9d4f8; }
    .route-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
    .route-card { padding: 16px; border: 1px solid #2d3958; border-radius: 10px; background: linear-gradient(180deg, #131c2b, #101725); }
    .route-card h3 { margin: 0 0 6px; font-size: 18px; }
    .route-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 1.3px; color: #7dd3fc; margin-bottom: 10px; }
    .route-copy { min-height: 64px; line-height: 1.5; color: #d9e2ff; }
    .route-list { margin: 12px 0; padding-left: 18px; color: #b9c5e8; line-height: 1.45; }
    .route-list li + li { margin-top: 5px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    button.btn, a.btn { display: inline-block; padding: 10px 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; }
    a.btn.secondary, button.btn.secondary { background: #1d2738; color: #d4def7; border: 1px solid #32415f; }
    code { display: block; margin-top: 10px; padding: 10px; background: #0c0c15; border-radius: 6px; word-break: break-all; }
    p { line-height: 1.45; }
    .route-note { margin-top: 10px; color: #99acd9; font-size: 13px; }
    @media (max-width: 900px) { .route-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <h2>PVTKRRX Install Routes</h2>
      <p class="lead">PVTKRRX is one runtime with three separate Stremio routes. PC Local is now a real same-PC addon for browsing and playback on this Windows machine. LAN Bridge remains the route for your other home devices.</p>
      <div class="route-grid">
        <section class="route-card">
          <div class="route-kicker">Same Windows machine</div>
          <h3>PC Local</h3>
          <p class="route-copy">Use this on the same Windows machine that runs the local PVTKRRX server. It now exposes the real movies, TV, sports, and library catalogs on this PC.</p>
          <ul class="route-list">
            <li>Uses loopback only</li>
            <li>No heartbeat or account sync</li>
            <li>Direct same-PC browsing and playback</li>
          </ul>
          <div class="actions">
            <button class="btn" id="copyHttpBtn" type="button">Copy PC Local URL</button>
            <a class="btn secondary" href="${pcConfigureUrl}">Open PC Local Setup</a>
          </div>
          <code id="manifestCode">${loopbackManifest}</code>
          <p class="route-note">Install this in Stremio Desktop on this same Windows PC when you want PVTKRRX to appear as a real local addon source.</p>
          <code>${lanDebugManifest}</code>
        </section>

        <section class="route-card">
          <div class="route-kicker">Home network sync</div>
          <h3>LAN Bridge</h3>
          <p class="route-copy">Use this for phone, tablet, Android TV, Apple TV, or Stremio Web on the same LAN as the host PC.</p>
          <ul class="route-list">
            <li>Hosted install URL with LAN heartbeat</li>
            <li>Optional Stremio account sync</li>
            <li>Host PC must stay online</li>
          </ul>
          <div class="actions">
            <a class="btn" href="${lanConfigureUrl}">Open LAN Bridge Setup</a>
          </div>
          <p class="route-note">This is the route that should sync across your Stremio account on phone, TV, web, and Apple TV while the host PC stays online.</p>
        </section>

        <section class="route-card">
          <div class="route-kicker">Public HTTPS endpoints</div>
          <h3>Remote Seedbox</h3>
          <p class="route-copy">Use this when Prowlarr, qBittorrent, and file serving are reachable over public authenticated URLs.</p>
          <ul class="route-list">
            <li>Hosted remote profile</li>
            <li>Works away from home LAN</li>
            <li>Requires public HTTPS playback path</li>
          </ul>
          <div class="actions">
            <a class="btn" href="${seedboxConfigureUrl}">Open Remote Seedbox Setup</a>
          </div>
          <p class="route-note">This is the right route for seedbox-first playback, not the LAN Bridge.</p>
        </section>
      </div>
    </div>
  </div>
  <script>
    async function copyCode(codeId, btnId) {
      const btn = document.getElementById(btnId)
      const text = document.getElementById(codeId).textContent.trim()
      try {
        await navigator.clipboard.writeText(text)
        const prev = btn.textContent
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = prev }, 1400)
      } catch (_) {
        const range = document.createRange()
        const code = document.getElementById(codeId)
        range.selectNodeContents(code)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        try { document.execCommand('copy') } catch (_) {}
        sel.removeAllRanges()
      }
    }
    document.getElementById('copyHttpBtn').addEventListener('click', () => copyCode('manifestCode', 'copyHttpBtn'))
  </script>
</body>
</html>`)
})

// ─── POST /test-connection — validate credentials ──────────
app.post('/test-connection', async (req, res) => {
  const { jackettUrl, jackettApiKey, qbitUrl, qbitUsername, qbitPassword } = req.body
  const results = { jackett: false, qbit: false }

  try {
    const prowlarr = new ProwlarrClient(jackettUrl, jackettApiKey)
    await prowlarr.caps()
    results.jackett = true
  } catch (err) {
    results.jackettError = err.message
  }

  try {
    const qbit = new QBitClient(qbitUrl, qbitUsername, qbitPassword)
    await qbit.preferences()
    results.qbit = true
  } catch (err) {
    results.qbitError = err.message
  }

  res.json(results)
})

// ─── withConfig middleware ──────────────────────────────────
function withConfig(req, res, next) {
  req.localConfigMissing = false
  req.configIssues = []
  if (req.params.config === 'local') {
    const localConfig = loadLocalConfigFile()
    if (!localConfig) {
      // Allow local manifest/configure bootstrap even before credentials are saved.
      req.localConfigMissing = true
      req.config = {}
      return next()
    }
    const normalizedLocal = normalizeAddonConfig(localConfig, {
      defaultEnabled: true,
      defaultRequired: true
    })
    if (JSON.stringify(normalizedLocal) !== JSON.stringify(localConfig)) {
      saveLocalConfigFile(normalizedLocal)
    }
    req.config = normalizedLocal
    req.configIssues = getConfigIssues(req.config, {
      requestBaseUrl: getPublicBaseUrl(req)
    })
    return next()
  }

  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) return res.status(500).json({ error: 'ENCRYPTION_SECRET not configured' })

  try {
    req.config = normalizeAddonConfig(decrypt(req.params.config, secret))
    req.configIssues = getConfigIssues(req.config, {
      requestBaseUrl: getPublicBaseUrl(req)
    })
    next()
  } catch (err) {
    res.status(400).json({ error: 'Invalid config token' })
  }
}

function isMagnetLink(link) {
  return String(link || '').trim().toLowerCase().startsWith('magnet:')
}

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

async function fetchTorrentPayload(link) {
  const target = String(link || '').trim()
  if (!target) throw new Error('Empty tracker link')
  const response = await fetch(target, {
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'application/x-bittorrent, application/octet-stream, */*'
    }
  })
  if (!response.ok) {
    throw new Error(`tracker download HTTP ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.length) throw new Error('tracker download returned empty payload')
  const fileName = parseTorrentFileName(response.headers.get('content-disposition'), 'download.torrent')
  return { bytes, fileName }
}

async function resolveLanPair(config, req) {
  const enabled = parseBooleanLoose(config?.lanPairEnabled, false)
  if (!enabled) return { enabled: false, online: false, reason: 'disabled' }

  const pairId = sanitizePairId(config?.lanPairId)
  const pairKey = sanitizePairKey(config?.lanPairKey)
  if (!pairId || !pairKey) return { enabled: true, online: false, reason: 'missing-config' }

  const state = await lanPairStore.get(pairId)
  if (!state) return { enabled: true, online: false, reason: 'offline' }
  if (hashPairKey(pairKey) !== String(state.keyHash || '')) {
    return { enabled: true, online: false, reason: 'key-mismatch' }
  }
  if (LAN_PAIR_BIND_PUBLIC_IP) {
    const stateIpHash = String(state.clientIpHash || '')
    const requestIpHash = hashClientIp(req)
    if (stateIpHash && requestIpHash && stateIpHash !== requestIpHash) {
      return { enabled: true, online: false, reason: 'network-mismatch' }
    }
  }

  const endpoint = chooseLanPairEndpoint(state)
  if (!endpoint) return { enabled: true, online: false, reason: 'no-endpoint' }

  return {
    enabled: true,
    online: true,
    endpoint,
    state
  }
}

function lanPairOfflineResponse(req, res, routeKind) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-PVTKRRX-LAN-Pair', 'offline')

  if (routeKind === 'manifest') {
    const m = getManifest(req)
    if (m.behaviorHints) m.behaviorHints.configurationRequired = true
    return res.json(m)
  }
  if (routeKind === 'catalog') return res.json({ metas: [], cacheMaxAge: 0 })
  if (routeKind === 'stream') return res.json({ streams: [], cacheMaxAge: 0 })
  if (routeKind === 'meta') return res.json({ meta: null })
  return res.status(503).json({
    error: 'LAN pair offline. Open PVTKRRX desktop on the host PC.'
  })
}

function maybeLanPairRedirect(routeKind) {
  return async (req, res, next) => {
    try {
      if (req.params.config === 'local') return next()
      if (isLoopbackHost(req)) return next()

      const resolution = await resolveLanPair(req.config || {}, req)
      req.lanPair = resolution

      if (!resolution.enabled) return next()

      if (!resolution.online) {
        if (parseBooleanLoose(req.config?.lanPairRequired, false)) {
          return lanPairOfflineResponse(req, res, routeKind)
        }
        return next()
      }

      const redirectUrl = buildLanRedirectUrl(req, resolution.endpoint.baseUrl)
      if (!redirectUrl) {
        if (parseBooleanLoose(req.config?.lanPairRequired, false)) {
          return lanPairOfflineResponse(req, res, routeKind)
        }
        return next()
      }

      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-PVTKRRX-LAN-Pair', 'redirect')
      res.redirect(307, redirectUrl)
    } catch (err) {
      if (parseBooleanLoose(req.config?.lanPairRequired, false)) {
        return lanPairOfflineResponse(req, res, routeKind)
      }
      next()
    }
  }
}

// ─── Stremio addon routes (config-authenticated) ────────────
app.get('/:config/manifest.json', withConfig, (req, res) => {
  const m = getManifest(req)
  // Configured URL — user is already set up, show Install not Configure.
  // For /local without saved credentials, keep configurationRequired=true
  // so Stremio can install and then guide user to Configure instead of failing fetch.
  if (m.behaviorHints) m.behaviorHints.configurationRequired = Boolean(req.localConfigMissing)
  if (req.configIssues.length > 0) {
    if (m.behaviorHints) m.behaviorHints.configurationRequired = true
    m.description = req.configIssues[0].message
  }
  applyHostedRouteCacheHeaders(req, res, 60, { sMaxAge: 300, staleWhileRevalidate: 900 })
  res.json(m)
})

app.get('/:config/config.json', withConfig, requireLoopbackLocalConfig, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(req.config)
})

app.get('/manifest.json', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 300, staleWhileRevalidate: 900 })
  res.json(getManifest(req))
})

app.get('/:config/catalog/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('catalog'), async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null, {
    baseUrl: getPublicBaseUrl(req)
  })
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('catalog'), async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra, {
    baseUrl: getPublicBaseUrl(req)
  })
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/:config/stream/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('stream'), async (req, res) => {
  const addonUrl = getPublicBaseUrl(req)
  const tokenShort = String(req.params.config || '').slice(0, 8)
  console.log(`[stream-route] token=${tokenShort} type=${req.params.type} id=${req.params.id}`)
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, req.params.config)
  console.log(`[stream-route] token=${tokenShort} streams=${Array.isArray(result?.streams) ? result.streams.length : 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 20, 5, 120)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 3, 300) })
  res.json(result)
})

app.get('/:config/meta/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('meta'), async (req, res) => {
  const result = await handleMeta(req.config, req.params.type, req.params.id, {
    baseUrl: getPublicBaseUrl(req)
  })
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: 300, staleWhileRevalidate: 1800 })
  res.json(result)
})

app.get('/:config/qbit/preferences', withConfig, requireLocalQbitControl, async (req, res) => {
  try {
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const prefs = await qbit.preferences()
    res.json({
      savePath: String(prefs?.save_path || ''),
      tempPath: String(prefs?.temp_path || ''),
      incompletePathEnabled: Boolean(prefs?.temp_path_enabled)
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read qBit preferences', detail: err.message })
  }
})

app.post('/:config/qbit/download-path', withConfig, requireLocalQbitControl, async (req, res) => {
  try {
    const savePath = String(req.body?.savePath || '').trim()
    if (!savePath) return res.status(400).json({ error: 'savePath is required' })

    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    await qbit.setPreferences({ save_path: savePath })
    const prefs = await qbit.preferences()
    res.json({
      ok: true,
      savePath: String(prefs?.save_path || '')
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update qBit download path', detail: err.message })
  }
})

// ─── Built-in file server — serves local files with Range support ───
// Used when no external fileServerUrl is configured (e.g. local qBit setup).
app.get('/:config/file/:info', withConfig, requireConfigSubscription, maybeLanPairRedirect('file'), async (req, res) => {
  try {
    if (IS_VERCEL_RUNTIME && req.params.config !== 'local') {
      return res.status(403).json({
        error: 'Built-in file serving is disabled on hosted runtime',
        detail: 'Use File Server URL or LAN Pair local relay for playback'
      })
    }

    const tokenShort = String(req.params.config || '').slice(0, 8)
    let state = null
    try {
      state = decodeFileStateToken(req.params.info)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid file token' })
    }
    const h = String(state?.h || '').toLowerCase()
    const p = String(state?.p || '')
    console.log(`[file-route] token=${tokenShort} hash=${String(h || '').slice(0, 8)} file="${p}"`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const playback = await loadTorrentPlaybackState(qbit, String(h || '').toLowerCase(), p, req.config.additionalStorageRoots)
    if (!playback?.torrent) {
      console.warn(`[file-route] torrent not found hash=${String(h || '').slice(0, 8)}`)
      return res.status(404).json({ error: 'Torrent not found' })
    }

    const { torrent, files, file, resolvedFilePath } = playback
    const torrentHash = String(torrent?.hash || h || '').toLowerCase()
    if (!file) {
      const errMsg = playback.packedArchive
        ? 'Packed archive release detected (RAR) with no direct video file. Choose a WEB-DL/REMUX source.'
        : 'No playable video file found in torrent.'
      return res.status(422).json({ error: errMsg })
    }
    await primeTorrentForStreaming(qbit, torrent, file, files)
    if (!playback.fileExists || !resolvedFilePath) {
      console.warn(`[file-route] file not found on disk path="${resolvedFilePath || 'n/a'}"`)
      return res.status(425).json({
        error: 'Buffering torrent metadata',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    let fileSize = Math.max(0, Number(file?.size || playback.diskSize || 0))
    let readableBytes = Number(playback.readableBytes || 0)
    let isComplete = Number(file?.progress || torrent.progress || 0) >= 0.999

    const ext = path.extname(resolvedFilePath).toLowerCase()
    const mime = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.ts': 'video/mp2t', '.m4v': 'video/x-m4v' }
    const contentType = mime[ext] || 'application/octet-stream'

    if (!isComplete && readableBytes <= 0) {
      return res.status(425).json({
        error: 'Download started — waiting for initial buffer',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    let maxReadable = isComplete ? fileSize : Math.max(0, Math.min(fileSize, readableBytes))
    const range = req.headers.range
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PVTKRRX-Progress', String(Math.round(Number(file?.progress || torrent.progress || 0) * 100)))

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      let start = parseInt(startStr, 10)
      let requestedEnd = endStr ? parseInt(endStr, 10) : fileSize - 1

      // Support suffix-byte ranges: "bytes=-500000"
      if (!Number.isFinite(start) && Number.isFinite(requestedEnd) && requestedEnd > 0) {
        const suffixLen = requestedEnd
        start = Math.max(0, maxReadable - suffixLen)
        requestedEnd = maxReadable - 1
      }

      if (!Number.isFinite(start) || start < 0 || start >= maxReadable) {
        // Stremio can request ranges ahead of currently downloaded bytes.
        // Avoid immediate hard failure: wait briefly for the needed range.
        if (!isComplete && Number.isFinite(start) && start >= 0) {
          const waitUntil = Date.now() + STREAM_RANGE_WAIT_TIMEOUT_MS
          while (Date.now() < waitUntil && start >= maxReadable) {
            await sleep(STREAM_RANGE_WAIT_INTERVAL_MS)
            const refreshed = await loadTorrentPlaybackState(qbit, torrentHash, file?.name || p, req.config.additionalStorageRoots)
            if (!refreshed?.torrent || !refreshed?.file) break
            fileSize = Math.max(0, Number(refreshed.file?.size || refreshed.diskSize || fileSize))
            readableBytes = Number(refreshed.readableBytes || readableBytes)
            isComplete = Number(refreshed.file?.progress || refreshed.torrent.progress || 0) >= 0.999
            maxReadable = isComplete ? fileSize : Math.max(0, Math.min(fileSize, readableBytes))
            if (start < maxReadable) break
          }
        }

        if (start >= maxReadable) {
          // Return a retryable status for progressive playback instead of a hard 416.
          res.setHeader('Content-Range', `bytes */${fileSize}`)
          res.setHeader('Retry-After', '2')
          return res.status(503).json({
            error: 'Requested byte range not available yet',
            progress: Number(file?.progress || torrent.progress || 0),
            retryAfterSeconds: 2
          })
        }
      }

      const end = Math.min(requestedEnd, maxReadable - 1)
      if (end < start) {
        res.setHeader('Content-Range', `bytes */${fileSize}`)
        res.setHeader('Retry-After', '2')
        return res.sendStatus(416)
      }

      if (isComplete && fileSize > 0) {
        const watchedRatio = (end + 1) / fileSize
        if (watchedRatio >= WATCHED_DELETE_THRESHOLD) {
          scheduleWatchedCleanup(req.config, torrentHash, `range-${Math.round(watchedRatio * 100)}pct`)
        }
      }

      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Content-Length', String(end - start + 1))
      fs.createReadStream(resolvedFilePath, { start, end }).pipe(res)
    } else {
      if (isComplete) {
        res.status(200)
        res.setHeader('Content-Length', String(fileSize))
        fs.createReadStream(resolvedFilePath).pipe(res)
      } else {
        if (maxReadable <= 0) {
          return res.status(425).json({
            error: 'Download started — waiting for initial buffer',
            progress: Number(file?.progress || torrent.progress || 0)
          })
        }
        const end = maxReadable - 1
        res.status(206)
        res.setHeader('Content-Range', `bytes 0-${end}/${fileSize}`)
        res.setHeader('Content-Length', String(maxReadable))
        fs.createReadStream(resolvedFilePath, { start: 0, end }).pipe(res)
      }
    }
  } catch (err) {
    console.error('[file] Error:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'File serve failed' })
  }
})

// ─── Playback endpoint — Comet pattern ──────────────────────
app.get('/:config/playback/:info', withConfig, requireConfigSubscription, maybeLanPairRedirect('playback'), async (req, res) => {
  try {
    const tokenShort = String(req.params.config || '').slice(0, 8)
    let info = null
    try {
      info = decodePlaybackStateToken(req.params.info)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid playback token' })
    }
    const trackerHost = extractTrackerHost(info.l)
    let trackedHash = String(info.h || extractInfoHashFromLink(info.l) || '').toLowerCase()
    console.log(`[playback-route] token=${tokenShort} hash=${trackedHash.slice(0, 8)} hasLink=${Boolean(info.l)}`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const waitDeadline = Date.now() + STREAM_WAIT_TIMEOUT_MS
    let primedTorrent = false
    let primedFile = false
    let lastProgress = 0
    let hasTorrent = false
    let knownHashesBeforeAdd = null
    let maxAvailability = 0
    let maxSeedersSeen = 0
    let maxPeersSeen = 0

    // If we can identify the torrent hash, check whether it's already playable.
    if (trackedHash) {
      const existing = await loadTorrentPlaybackState(qbit, trackedHash, '', req.config.additionalStorageRoots)
      if (existing?.torrent) {
        if (!primedTorrent || (!primedFile && existing.file)) {
          await primeTorrentForStreaming(qbit, existing.torrent, existing.file, existing.files)
          primedTorrent = true
          if (existing.file) primedFile = true
        }
        if (!existing.file && (existing.packedArchive || Number(existing.torrent.progress || 0) >= 0.999)) {
          return res.status(422).json({
            error: existing.packedArchive
              ? 'Packed archive release detected (RAR). Pick a source with direct .mkv/.mp4 video.'
              : 'Torrent completed but no playable video file was detected.'
          })
        }
        hasTorrent = true
        if ((existing.ready || Number(existing.torrent.progress || 0) >= 0.999) && existing.file?.name) {
          const fileUrl = buildFileUrl(
            req.config,
            req.params.config,
            getPublicBaseUrl(req),
            existing.torrent.hash,
            existing.torrent,
            existing.file.name
          )
          if (!fileUrl) {
            return res.status(412).json({
              error: 'Hosted playback requires File Server URL or LAN Pair relay'
            })
          }
          console.log(`[playback-route] token=${tokenShort} existing torrent ready -> redirect file`)
          return res.redirect(302, fileUrl)
        }
        lastProgress = Number(existing.file?.progress || existing.torrent.progress || 0)
        maxAvailability = Math.max(maxAvailability, Number(existing.torrent?.availability || 0))
        maxSeedersSeen = Math.max(maxSeedersSeen, Number(existing.torrent?.num_seeds || 0))
        maxPeersSeen = Math.max(maxPeersSeen, Number(existing.torrent?.num_leechs || 0))
      }
    }

    // If hash is missing, snapshot current torrent hashes so we can detect which torrent was just added.
    if (!trackedHash && info.l) {
      try {
        const current = await qbit.torrents('all')
        knownHashesBeforeAdd = new Set((current || []).map(t => String(t.hash || '').toLowerCase()))
      } catch (_) {}
    }

    if (!hasTorrent && !info.l) {
      return res.status(404).json({ error: 'Torrent not found and no tracker link provided' })
    }

    // Not ready yet — add to qBit queue if we have a tracker/magnet link.
    if (info.l && !hasTorrent) {
      try {
        if (isMagnetLink(info.l)) {
          await qbit.add(info.l, {
            sequentialDownload: true,
            firstLastPiecePrio: STREAM_PRIORITIZE_LAST_PIECES
          })
        } else {
          const payload = await fetchTorrentPayload(info.l)
          await qbit.addTorrentFile(payload.bytes, payload.fileName, {
            sequentialDownload: true,
            firstLastPiecePrio: STREAM_PRIORITIZE_LAST_PIECES
          })
        }
      } catch (addErr) {
        // qBit may reject duplicate/stale URLs; continue probing torrent list.
        console.warn(`[playback-route] add rejected: ${addErr.message}`)
      }
    }

    // Keep request open and auto-redirect once enough start-buffer exists.
    while (Date.now() < waitDeadline) {
      await sleep(STREAM_WAIT_INTERVAL_MS)

      if (!trackedHash) {
        const allTorrents = await qbit.torrents('all')
        const candidate = pickLikelyNewTorrent(allTorrents, knownHashesBeforeAdd, trackerHost)
        if (candidate?.hash) {
          trackedHash = String(candidate.hash).toLowerCase()
          lastProgress = Number(candidate.progress || 0)
        } else {
          continue
        }
      }

      const state = await loadTorrentPlaybackState(qbit, trackedHash, '', req.config.additionalStorageRoots)
      if (!state?.torrent) {
        trackedHash = ''
        continue
      }
      if (!primedTorrent || (!primedFile && state.file)) {
        await primeTorrentForStreaming(qbit, state.torrent, state.file, state.files)
        primedTorrent = true
        if (state.file) primedFile = true
      }
      if (!state.file) {
        if (state.packedArchive || Number(state.torrent.progress || 0) >= 0.999) {
          return res.status(422).json({
            error: state.packedArchive
              ? 'Packed archive release detected (RAR). Pick a source with direct .mkv/.mp4 video.'
              : 'Torrent completed but no playable video file was detected.'
          })
        }
        lastProgress = Number(state.torrent.progress || 0)
        maxAvailability = Math.max(maxAvailability, Number(state.torrent?.availability || 0))
        maxSeedersSeen = Math.max(maxSeedersSeen, Number(state.torrent?.num_seeds || 0))
        maxPeersSeen = Math.max(maxPeersSeen, Number(state.torrent?.num_leechs || 0))
        continue
      }
      hasTorrent = true

      lastProgress = Number(state.file?.progress || state.torrent.progress || 0)
      maxAvailability = Math.max(maxAvailability, Number(state.torrent?.availability || 0))
      maxSeedersSeen = Math.max(maxSeedersSeen, Number(state.torrent?.num_seeds || 0))
      maxPeersSeen = Math.max(maxPeersSeen, Number(state.torrent?.num_leechs || 0))
      if ((state.ready || Number(state.torrent.progress || 0) >= 0.999) && state.file?.name) {
        const fileUrl = buildFileUrl(
          req.config,
          req.params.config,
          getPublicBaseUrl(req),
          state.torrent.hash,
          state.torrent,
          state.file.name
        )
        if (!fileUrl) {
          return res.status(412).json({
            error: 'Hosted playback requires File Server URL or LAN Pair relay'
          })
        }
        console.log(`[playback-route] token=${tokenShort} progressive-ready -> redirect file`)
        return res.redirect(302, fileUrl)
      }
    }

    // Still buffering.
    const stalledNoPieces = lastProgress <= 0.001 && maxAvailability < 0.01
    console.warn(
      `[playback-route] token=${tokenShort} timeout waiting for buffer hash=${trackedHash.slice(0, 8)} ` +
      `progress=${Math.round(lastProgress * 100)}% availability=${maxAvailability.toFixed(3)} ` +
      `seeders=${maxSeedersSeen} peers=${maxPeersSeen}`
    )
    res.status(503).json({
      error: stalledNoPieces
        ? 'Source stalled - no available pieces from peers. Pick another source.'
        : 'Download queued - still buffering start of file',
      progress: lastProgress,
      availability: Number(maxAvailability.toFixed(3)),
      seedersSeen: maxSeedersSeen,
      peersSeen: maxPeersSeen,
      retryAfterSeconds: 4
    })
  } catch (err) {
    console.error('[playback-route] Error:', err.message)
    res.status(500).json({ error: 'Playback failed' })
  }
})

// ─── SDK router (fallback — serves /manifest.json at root) ──
const builder = new addonBuilder({
  ...manifest,
  id: 'com.kepners.pvtkrrx.hosted',
  name: 'PVTKRRX (Hosted)'
})
builder.defineCatalogHandler(async () => ({ metas: [] }))
builder.defineStreamHandler(async () => ({ streams: [] }))
builder.defineMetaHandler(async () => ({ meta: null }))
const addonInterface = builder.getInterface()
app.use(getRouter(addonInterface))

// ─── Local dev server ───────────────────────────────────────
function startLocalServers(options = {}) {
  const exitOnHttpError = options.exitOnHttpError !== false
  const enableLanAlias = options.enableLanAlias !== false
  const ensureLanAccessOnBoot = options.ensureLanAccessOnBoot !== false
  const logger = options.logger || console
  const port = Number.isFinite(options.port) ? options.port : parseInt(process.env.PORT || '7000', 10)
  const httpsPort = Number.isFinite(options.httpsPort) ? options.httpsPort : parseInt(process.env.HTTPS_PORT || '7001', 10)
  const mdnsHost = getMdnsHost()
  let lanAlias = null
  const state = {
    httpServer: null,
    httpsServer: null,
    httpsReady: Promise.resolve(null),
    port,
    httpsPort,
    lanAlias: null
  }

  if (ensureLanAccessOnBoot) {
    ensureBootLanAccess(logger).catch(() => {})
  }

  const bootConfig = loadLocalConfigFile()
  if (bootConfig) {
    const warmTimer = setTimeout(() => {
      scheduleLocalProviderWarmup(bootConfig, logger, 'server-boot').catch(() => {})
    }, 900)
    if (typeof warmTimer.unref === 'function') warmTimer.unref()
  }

  // HTTP
  const httpServer = http.createServer(app)
  state.httpServer = httpServer
  httpServer.listen(port, () => {
    logger.log(`PVTKRRX HTTP  → http://localhost:${port}`)
    logger.log(`Configure:      http://localhost:${port}/configure`)
    if (enableLanAlias && !lanAlias) {
      lanAlias = startLanAlias({ hostname: mdnsHost, port, logger })
      state.lanAlias = lanAlias
      if (lanAlias?.enabled) {
        logger.log(`PVTKRRX mDNS  → http://${lanAlias.hostname}:${port}/local/manifest.json?mode=local`)
      } else {
        logger.warn(`PVTKRRX mDNS disabled (${lanAlias?.reason || 'unknown'})`)
      }
    }
  })
  httpServer.on('error', (err) => {
    logger.error('HTTP server failed to start:', err.message)
    if (exitOnHttpError) process.exit(1)
  })
  httpServer.on('close', () => {
    try {
      if (lanAlias && typeof lanAlias.stop === 'function') lanAlias.stop()
    } catch (_) {}
  })

  // HTTPS (self-signed — must be trusted in OS/browser first)
  state.httpsReady = (async () => {
    try {
      const attrs = [{ name: 'commonName', value: 'localhost' }]
      const pems = await selfsigned.generate(attrs, {
        days: 365,
        algorithm: 'sha256',
        keySize: 2048,
        extensions: [
          { name: 'basicConstraints', cA: false, critical: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
          { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' },
              { type: 7, ip: '127.0.0.1' },
              { type: 7, ip: '::1' }
            ]
          }
        ]
      })
      const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app)
      state.httpsServer = httpsServer
      await new Promise((resolve, reject) => {
        const onListening = () => {
          httpsServer.off('error', onError)
          resolve()
        }
        const onError = (err) => {
          httpsServer.off('listening', onListening)
          reject(err)
        }
        httpsServer.once('listening', onListening)
        httpsServer.once('error', onError)
        httpsServer.listen(httpsPort)
      })
      logger.log(`PVTKRRX HTTPS → https://localhost:${httpsPort} (self-signed — trust cert in browser first)`)
      httpsServer.on('error', (err) => {
        logger.warn(`HTTPS server error on port ${httpsPort}:`, err.message)
      })
      return httpsServer
    } catch (err) {
      logger.warn('HTTPS server skipped:', err.message)
      return null
    }
  })()

  return state
}

if (require.main === module) {
  startLocalServers({ exitOnHttpError: true, logger: console })
}

module.exports = app
module.exports.startLocalServers = startLocalServers
