const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const crypto = require('crypto')
const selfsigned = require('selfsigned')
const express = require('express')
const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const manifest = require('./src/config/manifest')
const { encrypt, decrypt } = require('./src/utils/crypto')
const { handleCatalog } = require('./src/handlers/catalog')
const { handleStream } = require('./src/handlers/stream')
const { handleMeta } = require('./src/handlers/meta')
const { ProwlarrClient } = require('./src/clients/prowlarr')
const { QBitClient } = require('./src/clients/qbittorrent')
const { autoProvisionWindows } = require('./src/utils/provision')
const { getLanIpv4Addresses, normalizeLocalHostname, startLanAlias } = require('./src/utils/lanAlias')
const { decodeSportsThumbToken, renderSportsThumbSvg } = require('./src/utils/sportsThumb')
const { mapPath } = require('./src/utils/pathMapper')
const { findVideoFile, hasPackedArchiveFiles, isSampleVideoName } = require('./src/utils/streams')
const { PairStore } = require('./src/utils/pairStore')

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
const LAN_PAIR_TTL_SECONDS = Math.max(30, parseInt(process.env.PVTKRRX_LAN_PAIR_TTL_SECONDS || '120', 10))
const LAN_PAIR_BIND_PUBLIC_IP = String(process.env.PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP || 'true').trim().toLowerCase() !== 'false'
const LAN_PAIR_RATE_LIMIT_WINDOW_MS = Math.max(1000, parseInt(process.env.PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS || '60000', 10))
const LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW || '30', 10))
const LAN_PAIR_STATUS_MAX_PER_WINDOW = Math.max(5, parseInt(process.env.PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW || '60', 10))
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
app.use(express.json())

const runtimeDir = process.env.PVTKRRX_RUNTIME_DIR || path.join(__dirname, '.runtime')
const localConfigPath = path.join(runtimeDir, 'local-config.json')
const lanPairStore = new PairStore({
  filePath: process.env.PVTKRRX_PAIR_STORE_FILE || path.join(runtimeDir, 'lan-pair-store.json')
})

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
    stremio: `stremio://${hostname}:${port}/local/manifest.json${modeQuery}`
  }
}

function normalizeBaseUrl(input) {
  const value = String(input || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  return value
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
  const pairId = sanitizePairId(config.lanPairId) || makePairId()
  const pairKey = sanitizePairKey(config.lanPairKey) || makePairKey()
  const relayUrl = normalizeRelayUrl(config.lanPairRelayUrl || options.lanPairRelayUrl)
  const pairEnabled = parseBooleanLoose(config.lanPairEnabled, options.defaultEnabled !== false)
  const pairRequired = parseBooleanLoose(config.lanPairRequired, options.defaultRequired === true)

  return {
    ...config,
    lanPairEnabled: pairEnabled,
    lanPairRequired: pairRequired,
    lanPairId: pairId,
    lanPairKey: pairKey,
    lanPairRelayUrl: relayUrl
  }
}

function chooseLanPairEndpoint(state) {
  const endpoints = normalizePairEndpoints(state?.endpoints || [])
  if (!endpoints.length) return null
  const score = (entry) => {
    let points = 0
    if (entry.source === 'lan-ip') points += 30
    if (entry.source === 'mdns') points += 20
    if (entry.source === 'loopback') points += 1
    try {
      const host = new URL(entry.baseUrl).hostname
      if (isPrivateIpv4(host) && host !== '127.0.0.1') points += 10
      if (host.endsWith('.local')) points += 5
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

// ─── CORS ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').trim()
  const defaultHeaders = [
    'Content-Type',
    'Authorization',
    'Range',
    'Accept',
    'Stremio-Protocol-Version',
    'Access-Control-Request-Private-Network'
  ]
  res.setHeader(
    'Access-Control-Allow-Headers',
    requestedHeaders || defaultHeaders.join(', ')
  )
  // Needed for browser-based clients (e.g. web Stremio) requesting local/LAN URLs.
  // Without this, Chrome/Edge may block with generic "Failed to fetch".
  if (String(req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  res.setHeader('Access-Control-Max-Age', '600')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ─── Static routes ──────────────────────────────────────────
const publicDir = path.join(__dirname, 'public')
const configPage = path.join(publicDir, 'configure.html')
app.use(express.static(publicDir))
app.get('/configure', (req, res) => res.sendFile(configPage))
app.get('/:config/configure', (req, res) => res.sendFile(configPage))
app.get('/thumb/sports/:info.svg', (req, res) => {
  try {
    const payload = decodeSportsThumbToken(req.params.info)
    const svg = renderSportsThumbSvg(payload)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(svg)
  } catch (_) {
    res.status(400).send('invalid thumbnail payload')
  }
})

// Build a URL to serve a local file — uses the built-in /file/ endpoint when no
// external fileServerUrl is configured (e.g. local qBit setup with no HTTP server).
function buildFileUrl(config, configToken, baseUrl, hash, savePath, fileName) {
  // Prefer built-in serving when the addon can access files on local disk.
  // This protects local installs from stale external fileServerUrl values in older config tokens.
  const localPath = path.join(savePath || '', fileName || '')
  const localFileAvailable = Boolean(savePath && fileName && fs.existsSync(localPath))
  if (config.fileServerUrl && !localFileAvailable) {
    return mapPath(savePath, fileName, config.fileServerUrl, config.pathMapping)
  }
  const info = Buffer.from(JSON.stringify({ h: hash.toLowerCase(), p: fileName })).toString('base64url')
  return `${baseUrl}/${configToken}/file/${info}`
}

function getPublicBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const protocol = forwardedProto || req.protocol || 'http'
  return `${protocol}://${req.get('host')}`
}

function isLoopbackHost(req) {
  const hostHeader = String(req.get('host') || '')
  const hostname = hostHeader.split(':')[0].toLowerCase()
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
  const modeLabel = mode === 'local' ? 'Local' : 'Hosted'
  return {
    ...manifest,
    behaviorHints: { ...(manifest.behaviorHints || {}) },
    id: `com.kepners.pvtkrrx.${mode}`,
    name: `PVTKRRX (${modeLabel})`,
    logo: `${getPublicBaseUrl(req)}/logo.ico`
  }
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

function resolveTorrentFilePath(torrent, relPath) {
  const normalized = normalizeTorrentPath(relPath)
  const candidates = []

  if (torrent?.save_path && normalized) candidates.push(path.join(torrent.save_path, normalized))
  if (torrent?.download_path && normalized) candidates.push(path.join(torrent.download_path, normalized))

  if (torrent?.content_path) {
    const contentPath = String(torrent.content_path)
    candidates.push(contentPath)
    try {
      if (fs.existsSync(contentPath) && fs.statSync(contentPath).isDirectory() && normalized) {
        candidates.push(path.join(contentPath, normalized))
      }
    } catch (_) {}
    if (normalized && contentPath.toLowerCase().endsWith(`\\${normalized.toLowerCase().replace(/\//g, '\\')}`)) {
      candidates.push(contentPath)
    }
  }

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch (_) {}
  }

  return candidates[0] || ''
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

async function loadTorrentPlaybackState(qbit, hash, targetPath) {
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

  const resolvedFilePath = resolveTorrentFilePath(torrent, chosenFile?.name || targetPath)
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

  try {
    const token = encrypt(req.body, secret)
    res.json({ token })
  } catch (err) {
    res.status(400).json({ error: 'Encryption failed' })
  }
})

// Save local-mode config to disk so Stremio can use a stable /local manifest URL.
app.post('/local-config', (req, res) => {
  const cfg = req.body || {}
  if (!cfg.qbitUrl) {
    return res.status(400).json({ error: 'qBit URL is required for local config' })
  }

  try {
    const localHostname = normalizeLocalHostname(cfg.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    const saved = ensureLanPairConfig({
      ...cfg,
      localHostname,
      localHostnameCustom
    }, {
      defaultEnabled: true,
      defaultRequired: true
    })
    saveLocalConfigFile(saved)
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

app.post('/auto-provision', async (req, res) => {
  try {
    const options = req.body || {}
    const localHostname = normalizeLocalHostname(options.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    const result = await autoProvisionWindows({
      ...options,
      localHostname
    })
    const provisionedConfig = result.config
      ? ensureLanPairConfig({
        ...result.config,
        localHostname,
        localHostnameCustom
      }, {
        defaultEnabled: true,
        defaultRequired: true
      })
      : null

    if (result.config && result.config.qbitUrl) {
      saveLocalConfigFile(provisionedConfig)
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
  res.json({
    ok: true,
    time: new Date().toISOString()
  })
})

// Returns local/lan install URLs for one-click setup across PC + TV/phone on same LAN.
app.get('/network-info', (req, res) => {
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

    const now = Date.now()
    const state = {
      pairId,
      keyHash: hashPairKey(pairKey),
      clientIpHash: LAN_PAIR_BIND_PUBLIC_IP ? hashClientIp(req) : '',
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
      expiresAt: Number(state.expiresAt || 0)
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'status failed', detail: err.message })
  }
})

// Local install helper page (localhost copy workflow).
// Open on the same PC that runs PVTKRRX:
// http://127.0.0.1:7000/local/install
app.get('/local/install', (req, res) => {
  const port = parseInt(process.env.PORT || '7000', 10)
  const loopbackManifest = `http://127.0.0.1:${port}/local/manifest.json?mode=local`
  const requestedHost = sanitizeHostForUrl(req.query.host)
  const headerHost = sanitizeHostForUrl(String(req.get('host') || '').split(':')[0])
  const fallbackHost = sanitizeHostForUrl(getMdnsHost())
  const host = requestedHost || headerHost || fallbackHost || '127.0.0.1'
  const lanDebugManifest = `http://${host}:${port}/local/manifest.json?mode=local`

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PVTKRRX Local Install</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #101018; color: #e8e8ff; }
    .card { max-width: 720px; padding: 16px; border: 1px solid #2a2a3a; border-radius: 10px; background: #151526; }
    button.btn { display: inline-block; margin-top: 10px; padding: 10px 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
    code { display: block; margin-top: 10px; padding: 10px; background: #0c0c15; border-radius: 6px; word-break: break-all; }
    p { line-height: 1.45; }
  </style>
</head>
<body>
  <div class="card">
    <h2>PVTKRRX Local Install</h2>
    <p>Use this on the same Windows PC that runs PVTKRRX. Click once to copy the correct URL.</p>
    <button class="btn" id="copyBtn" type="button">Copy local Addon URL</button>
    <p>Paste into Stremio: <code>Addons -> + Add Addon URL</code></p>
    <code id="manifestCode">${loopbackManifest}</code>
    <p>LAN debug URL (not recommended for install):</p>
    <code>${lanDebugManifest}</code>
    <p>For phone/TV installs, use hosted HTTPS mode from the configure page.</p>
  </div>
  <script>
    const btn = document.getElementById('copyBtn')
    const text = document.getElementById('manifestCode').textContent.trim()
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text)
        const prev = btn.textContent
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = prev }, 1400)
      } catch (_) {
        const range = document.createRange()
        const code = document.getElementById('manifestCode')
        range.selectNodeContents(code)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        try { document.execCommand('copy') } catch (_) {}
        sel.removeAllRanges()
      }
    })
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
  if (req.params.config === 'local') {
    const localConfig = loadLocalConfigFile()
    if (!localConfig) {
      // Allow local manifest/configure bootstrap even before credentials are saved.
      req.localConfigMissing = true
      req.config = {}
      return next()
    }
    const normalizedLocal = ensureLanPairConfig(localConfig, {
      defaultEnabled: true,
      defaultRequired: true
    })
    if (
      normalizedLocal.lanPairId !== localConfig.lanPairId ||
      normalizedLocal.lanPairKey !== localConfig.lanPairKey ||
      normalizedLocal.lanPairEnabled !== localConfig.lanPairEnabled ||
      normalizedLocal.lanPairRequired !== localConfig.lanPairRequired ||
      normalizedLocal.lanPairRelayUrl !== localConfig.lanPairRelayUrl
    ) {
      saveLocalConfigFile(normalizedLocal)
    }
    req.config = normalizedLocal
    return next()
  }

  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) return res.status(500).json({ error: 'ENCRYPTION_SECRET not configured' })

  try {
    req.config = decrypt(req.params.config, secret)
    next()
  } catch (err) {
    res.status(400).json({ error: 'Invalid config token' })
  }
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
app.get('/:config/manifest.json', withConfig, maybeLanPairRedirect('manifest'), (req, res) => {
  const m = getManifest(req)
  // Configured URL — user is already set up, show Install not Configure.
  // For /local without saved credentials, keep configurationRequired=true
  // so Stremio can install and then guide user to Configure instead of failing fetch.
  if (m.behaviorHints) m.behaviorHints.configurationRequired = Boolean(req.localConfigMissing)
  res.json(m)
})

app.get('/:config/config.json', withConfig, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(req.config)
})

app.get('/manifest.json', (req, res) => {
  res.json(getManifest(req))
})

app.get('/:config/catalog/:type/:id.json', withConfig, maybeLanPairRedirect('catalog'), async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null, {
    baseUrl: getPublicBaseUrl(req)
  })
  res.json(result)
})

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, maybeLanPairRedirect('catalog'), async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra, {
    baseUrl: getPublicBaseUrl(req)
  })
  res.json(result)
})

app.get('/:config/stream/:type/:id.json', withConfig, maybeLanPairRedirect('stream'), async (req, res) => {
  const addonUrl = getPublicBaseUrl(req)
  const tokenShort = String(req.params.config || '').slice(0, 8)
  console.log(`[stream-route] token=${tokenShort} type=${req.params.type} id=${req.params.id}`)
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, req.params.config)
  console.log(`[stream-route] token=${tokenShort} streams=${Array.isArray(result?.streams) ? result.streams.length : 0}`)
  res.json(result)
})

app.get('/:config/meta/:type/:id.json', withConfig, maybeLanPairRedirect('meta'), async (req, res) => {
  const result = await handleMeta(req.config, req.params.type, req.params.id, {
    baseUrl: getPublicBaseUrl(req)
  })
  res.json(result)
})

app.get('/:config/qbit/preferences', withConfig, async (req, res) => {
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

app.post('/:config/qbit/download-path', withConfig, async (req, res) => {
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
app.get('/:config/file/:info', withConfig, maybeLanPairRedirect('file'), async (req, res) => {
  try {
    const tokenShort = String(req.params.config || '').slice(0, 8)
    const { h, p } = JSON.parse(Buffer.from(req.params.info, 'base64url').toString())
    console.log(`[file-route] token=${tokenShort} hash=${String(h || '').slice(0, 8)} file="${p}"`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const playback = await loadTorrentPlaybackState(qbit, String(h || '').toLowerCase(), p)
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
            const refreshed = await loadTorrentPlaybackState(qbit, torrentHash, file?.name || p)
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
app.get('/:config/playback/:info', withConfig, maybeLanPairRedirect('playback'), async (req, res) => {
  try {
    const tokenShort = String(req.params.config || '').slice(0, 8)
    const info = JSON.parse(Buffer.from(req.params.info, 'base64url').toString())
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
      const existing = await loadTorrentPlaybackState(qbit, trackedHash)
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
            existing.torrent.save_path,
            existing.file.name
          )
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
        await qbit.add(info.l, {
          sequentialDownload: true,
          firstLastPiecePrio: STREAM_PRIORITIZE_LAST_PIECES
        })
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

      const state = await loadTorrentPlaybackState(qbit, trackedHash)
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
          state.torrent.save_path,
          state.file.name
        )
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
  const logger = options.logger || console
  const port = parseInt(process.env.PORT || '7000', 10)
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)
  const mdnsHost = getMdnsHost()
  let lanAlias = null

  // HTTP
  const httpServer = http.createServer(app)
  httpServer.listen(port, () => {
    logger.log(`PVTKRRX HTTP  → http://localhost:${port}`)
    logger.log(`Configure:      http://localhost:${port}/configure`)
    if (enableLanAlias && !lanAlias) {
      lanAlias = startLanAlias({ hostname: mdnsHost, port, logger })
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
  try {
    const attrs = [{ name: 'commonName', value: '127.0.0.1' }]
    const pems = selfsigned.generate(attrs, { days: 365, algorithm: 'sha256' })
    const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app)
    httpsServer.listen(httpsPort, () => {
      logger.log(`PVTKRRX HTTPS → https://localhost:${httpsPort} (self-signed — trust cert in browser first)`)
    })
    httpsServer.on('error', (err) => {
      logger.warn(`HTTPS server failed to start on port ${httpsPort}:`, err.message)
    })
  } catch (err) {
    logger.warn('HTTPS server skipped:', err.message)
  }

  return { httpServer, port, httpsPort, lanAlias }
}

if (require.main === module) {
  startLocalServers({ exitOnHttpError: true, logger: console })
}

module.exports = app
module.exports.startLocalServers = startLocalServers
