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
const { TorznabClient } = require('./src/clients/torznab')
const { QBitClient } = require('./src/clients/qbittorrent')
const { mapPath } = require('./src/utils/pathMapper')
const { findVideoFile } = require('./src/utils/streams')

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
    id: `com.kepners.pvtkrrx.${mode}`,
    name: `PVTKRRX (${modeLabel})`,
    logo: `${getPublicBaseUrl(req)}/logo.svg`
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

// ─── POST /test-connection — validate credentials ──────────
app.post('/test-connection', async (req, res) => {
  const { jackettUrl, jackettApiKey, qbitUrl, qbitUsername, qbitPassword } = req.body
  const results = { jackett: false, qbit: false }

  try {
    const torznab = new TorznabClient(jackettUrl, jackettApiKey)
    await torznab.caps()
    results.jackett = true
  } catch (err) {
    results.jackettError = err.message
  }

  try {
    const qbit = new QBitClient(qbitUrl, qbitUsername, qbitPassword)
    await qbit.login()
    results.qbit = true
  } catch (err) {
    results.qbitError = err.message
  }

  res.json(results)
})

// ─── withConfig middleware ──────────────────────────────────
function withConfig(req, res, next) {
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
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null)
  res.json(result)
})

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, async (req, res) => {
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra)
  res.json(result)
})

app.get('/:config/stream/:type/:id.json', withConfig, async (req, res) => {
  const addonUrl = `${req.protocol}://${req.get('host')}`
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, req.params.config)
  res.json(result)
})

app.get('/:config/meta/:type/:id.json', withConfig, async (req, res) => {
  const result = await handleMeta(req.config, req.params.type, req.params.id)
  res.json(result)
})

// ─── Playback endpoint — Comet pattern ──────────────────────
app.get('/:config/playback/:info', withConfig, async (req, res) => {
  try {
    const info = JSON.parse(Buffer.from(req.params.info, 'base64url').toString())
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)

    // Check if already downloaded
    const torrents = await qbit.torrents('completed')
    const found = torrents.find(t => t.hash.toLowerCase() === info.h)

    if (found) {
      const files = await qbit.files(found.hash)
      const videoFile = findVideoFile(files)
      const fileUrl = mapPath(found.save_path, videoFile.name, req.config.fileServerUrl, req.config.pathMapping)
      return res.redirect(302, fileUrl)
    }

    // Not downloaded — trigger qBit add
    await qbit.add(info.l)

    // Poll within budget (~6s on Hobby tier, max 2 cycles)
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const updated = await qbit.torrents('completed')
      const done = updated.find(t => t.hash.toLowerCase() === info.h)
      if (done) {
        const files = await qbit.files(done.hash)
        const videoFile = findVideoFile(files)
        const fileUrl = mapPath(done.save_path, videoFile.name, req.config.fileServerUrl, req.config.pathMapping)
        return res.redirect(302, fileUrl)
      }
    }

    // Timeout — download started but not ready yet
    res.status(504).json({ error: 'Download started — close and try again' })
  } catch (err) {
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
if (require.main === module) {
  const port = parseInt(process.env.PORT || '7000', 10)
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)

  // HTTP
  const httpServer = http.createServer(app)
  httpServer.listen(port, () => {
    console.log(`PVTKRRX HTTP  → http://localhost:${port}`)
    console.log(`Configure:      http://localhost:${port}/configure`)
  })
  httpServer.on('error', (err) => {
    console.error('HTTP server failed to start:', err.message)
    process.exit(1)
  })

  // HTTPS (self-signed — must be trusted in OS/browser first)
  try {
    const attrs = [{ name: 'commonName', value: '127.0.0.1' }]
    const pems = selfsigned.generate(attrs, { days: 365, algorithm: 'sha256' })
    const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app)
    httpsServer.listen(httpsPort, () => {
      console.log(`PVTKRRX HTTPS → https://localhost:${httpsPort} (self-signed — trust cert in browser first)`)
    })
    httpsServer.on('error', (err) => {
      console.warn(`HTTPS server failed to start on port ${httpsPort}:`, err.message)
    })
  } catch (err) {
    console.warn('HTTPS server skipped:', err.message)
  }
}

module.exports = app
