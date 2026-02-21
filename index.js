const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
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
const { findVideoFile } = require('./src/utils/streams')

const STREAM_WAIT_TIMEOUT_MS = parseInt(process.env.STREAM_WAIT_TIMEOUT_MS || '90000', 10)
const STREAM_WAIT_INTERVAL_MS = parseInt(process.env.STREAM_WAIT_INTERVAL_MS || '2000', 10)
const STREAM_READY_MIN_BYTES = parseInt(process.env.STREAM_READY_MIN_BYTES || String(24 * 1024 * 1024), 10)
const STREAM_READY_MIN_PROGRESS = parseFloat(process.env.STREAM_READY_MIN_PROGRESS || '0.02')

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
  return normalizeLocalHostname(process.env.PVTKRRX_LOCAL_HOSTNAME || 'pvtkrrx.local')
}

function buildLocalModeUrls(hostname, port, httpsPort) {
  const modeQuery = '?mode=local'
  return {
    httpManifest: `http://${hostname}:${port}/local/manifest.json${modeQuery}`,
    httpsManifest: `https://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`,
    stremio: `stremio://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`
  }
}

// ─── CORS ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
  const mode = String(req.query.mode || '').toLowerCase()
  if (mode === 'local' || mode === 'hosted') return mode
  return isLoopbackHost(req) ? 'local' : 'hosted'
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
  const minByProgress = Math.floor(size * STREAM_READY_MIN_PROGRESS)
  const required = Math.min(size, Math.max(STREAM_READY_MIN_BYTES, minByProgress))
  return readableBytes >= required || Number(fileEntry?.progress || 0) >= 0.999
}

async function primeTorrentForStreaming(qbit, torrent, videoFile) {
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
  if (!firstLastEnabled) {
    try {
      await qbit.toggleFirstLastPiecePrio(hash)
    } catch (err) {
      console.warn(`[streaming-prime] first/last toggle failed ${hash.slice(0, 8)}: ${err.message}`)
    }
  }

  if (videoFile && Number.isInteger(videoFile.index)) {
    try {
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
  const chosenFile = findTorrentFileByPath(files, targetPath) || findVideoFile(files)
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
    saveLocalConfigFile(cfg)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save local config' })
  }
})

app.post('/auto-provision', async (req, res) => {
  try {
    const options = req.body || {}
    const result = await autoProvisionWindows(options)
    if (result.config && result.config.qbitUrl) {
      saveLocalConfigFile(result.config)
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Auto provision failed', detail: err.message })
  }
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
    loopback,
    mdns: { hostname: mdnsHost, ...mdns },
    lan,
    lanCandidates: lanIps.map(ip => ({ ip, ...buildLocalModeUrls(ip, port, httpsPort) })),
    preferredOrder: [
      { id: 'localhost', url: loopback.httpManifest },
      { id: 'mdns', url: mdns.httpManifest },
      { id: 'lan-ip', url: lan ? lan.httpManifest : '' }
    ]
  })
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
  if (req.params.config === 'local') {
    const localConfig = loadLocalConfigFile()
    if (!localConfig) return res.status(400).json({ error: 'Local config not found. Open /configure and save local config first.' })
    req.config = localConfig
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

// ─── Stremio addon routes (config-authenticated) ────────────
app.get('/:config/manifest.json', withConfig, (req, res) => {
  const m = getManifest(req)
  // Configured URL — user is already set up, show Install not Configure
  if (m.behaviorHints) m.behaviorHints.configurationRequired = false
  res.json(m)
})

app.get('/:config/config.json', withConfig, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(req.config)
})

app.get('/manifest.json', (req, res) => {
  res.json(getManifest(req))
})

app.get('/:config/catalog/:type/:id.json', withConfig, async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null, {
    baseUrl: getPublicBaseUrl(req)
  })
  res.json(result)
})

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra, {
    baseUrl: getPublicBaseUrl(req)
  })
  res.json(result)
})

app.get('/:config/stream/:type/:id.json', withConfig, async (req, res) => {
  const addonUrl = getPublicBaseUrl(req)
  const tokenShort = String(req.params.config || '').slice(0, 8)
  console.log(`[stream-route] token=${tokenShort} type=${req.params.type} id=${req.params.id}`)
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, req.params.config)
  console.log(`[stream-route] token=${tokenShort} streams=${Array.isArray(result?.streams) ? result.streams.length : 0}`)
  res.json(result)
})

app.get('/:config/meta/:type/:id.json', withConfig, async (req, res) => {
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
app.get('/:config/file/:info', withConfig, async (req, res) => {
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

    const { torrent, file, resolvedFilePath } = playback
    if (file) {
      await primeTorrentForStreaming(qbit, torrent, file)
    }
    if (!playback.fileExists || !resolvedFilePath) {
      console.warn(`[file-route] file not found on disk path="${resolvedFilePath || 'n/a'}"`)
      return res.status(425).json({
        error: 'Buffering torrent metadata',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    const fileSize = Math.max(0, Number(file?.size || playback.diskSize || 0))
    const readableBytes = Number(playback.readableBytes || 0)
    const isComplete = Number(file?.progress || torrent.progress || 0) >= 0.999

    const ext = path.extname(resolvedFilePath).toLowerCase()
    const mime = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.ts': 'video/mp2t', '.m4v': 'video/x-m4v' }
    const contentType = mime[ext] || 'application/octet-stream'

    if (!isComplete && readableBytes <= 0) {
      return res.status(425).json({
        error: 'Download started — waiting for initial buffer',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    const maxReadable = isComplete ? fileSize : Math.max(0, Math.min(fileSize, readableBytes))
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
        res.setHeader('Content-Range', `bytes */${fileSize}`)
        res.setHeader('Retry-After', '2')
        return res.sendStatus(416)
      }

      const end = Math.min(requestedEnd, maxReadable - 1)
      if (end < start) {
        res.setHeader('Content-Range', `bytes */${fileSize}`)
        res.setHeader('Retry-After', '2')
        return res.sendStatus(416)
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
app.get('/:config/playback/:info', withConfig, async (req, res) => {
  try {
    const tokenShort = String(req.params.config || '').slice(0, 8)
    const info = JSON.parse(Buffer.from(req.params.info, 'base64url').toString())
    const trackerHost = extractTrackerHost(info.l)
    let trackedHash = String(info.h || extractInfoHashFromLink(info.l) || '').toLowerCase()
    console.log(`[playback-route] token=${tokenShort} hash=${trackedHash.slice(0, 8)} hasLink=${Boolean(info.l)}`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const waitDeadline = Date.now() + STREAM_WAIT_TIMEOUT_MS
    let primed = false
    let lastProgress = 0
    let hasTorrent = false
    let knownHashesBeforeAdd = null

    // If we can identify the torrent hash, check whether it's already playable.
    if (trackedHash) {
      const existing = await loadTorrentPlaybackState(qbit, trackedHash)
      if (existing?.torrent) {
        hasTorrent = true
        if (!primed) {
          await primeTorrentForStreaming(qbit, existing.torrent, existing.file)
          primed = true
        }
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
      await qbit.add(info.l)
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
      hasTorrent = true
      if (!primed) {
        await primeTorrentForStreaming(qbit, state.torrent, state.file)
        primed = true
      }

      lastProgress = Number(state.file?.progress || state.torrent.progress || 0)
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
    console.warn(`[playback-route] token=${tokenShort} timeout waiting for buffer hash=${trackedHash.slice(0, 8)} progress=${Math.round(lastProgress * 100)}%`)
    res.status(503).json({
      error: 'Download queued — still buffering start of file',
      progress: lastProgress,
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
