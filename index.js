const path = require('path')
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
const configPage = path.join(__dirname, 'public', 'configure.html')
app.get('/configure', (req, res) => res.sendFile(configPage))
app.get('/:config/configure', (req, res) => res.sendFile(configPage))

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
  res.json(manifest)
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
const builder = new addonBuilder(manifest)
builder.defineCatalogHandler(async () => ({ metas: [] }))
builder.defineStreamHandler(async () => ({ streams: [] }))
builder.defineMetaHandler(async () => ({ meta: null }))
const addonInterface = builder.getInterface()
app.use(getRouter(addonInterface))

// ─── Local dev server ───────────────────────────────────────
if (require.main === module) {
  app.listen(7000, () => {
    console.log('PVTKRRX running at http://localhost:7000')
    console.log('Configure: http://localhost:7000/configure')
  })
}

module.exports = app
