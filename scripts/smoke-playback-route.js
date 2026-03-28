const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-playback-smoke-'))
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
delete process.env.VERCEL

const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken } = require('../src/utils/opaqueState')
const { QBitClient } = require('../src/clients/qbittorrent')
const app = require('../index')

const ORIGINALS = {
  torrentsByHashes: QBitClient.prototype.torrentsByHashes,
  files: QBitClient.prototype.files,
  setFilePriority: QBitClient.prototype.setFilePriority,
  toggleSequentialDownload: QBitClient.prototype.toggleSequentialDownload,
  toggleFirstLastPiecePrio: QBitClient.prototype.toggleFirstLastPiecePrio
}

function restoreMocks() {
  QBitClient.prototype.torrentsByHashes = ORIGINALS.torrentsByHashes
  QBitClient.prototype.files = ORIGINALS.files
  QBitClient.prototype.setFilePriority = ORIGINALS.setFilePriority
  QBitClient.prototype.toggleSequentialDownload = ORIGINALS.toggleSequentialDownload
  QBitClient.prototype.toggleFirstLastPiecePrio = ORIGINALS.toggleFirstLastPiecePrio
}

function request(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: reqPath
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: Number(res.statusCode || 0),
          headers: res.headers || {},
          text
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  const hash = 'c1287d13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const torrent = {
    hash,
    name: 'UFC Fight Night 270 Main Card 21 03 26 Z3R0 1080p',
    progress: 1,
    seq_dl: true,
    f_l_piece_prio: false,
    save_path: 'C:\\downloads',
    download_path: 'C:\\downloads',
    content_path: ''
  }
  const file = {
    name: 'UFC.Fight.Night.270.Main.Card.1080p.mkv',
    size: 4_000_000_000,
    progress: 1,
    index: 0
  }

  QBitClient.prototype.torrentsByHashes = async () => [torrent]
  QBitClient.prototype.files = async () => [file]
  QBitClient.prototype.setFilePriority = async () => 'Ok.'
  QBitClient.prototype.toggleSequentialDownload = async () => 'Ok.'
  QBitClient.prototype.toggleFirstLastPiecePrio = async () => 'Ok.'

  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  try {
    const configToken = encodeURIComponent(encrypt({
      qbitUrl: 'http://127.0.0.1:8080',
      qbitUsername: 'admin',
      qbitPassword: 'adminadmin',
      fileServerUrl: '',
      lanPairEnabled: false,
      lanPairRequired: false
    }, process.env.ENCRYPTION_SECRET))
    const playbackToken = encodePlaybackStateToken({ h: hash })

    const response = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(playbackToken)}`)
    assert.equal(response.status, 302, 'completed playback should redirect instead of crashing')
    assert.match(String(response.headers.location || ''), new RegExp(`/${configToken}/file/`), 'playback redirect should target the shared file route')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restoreMocks()
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }
}

run().then(() => {
  console.log('Smoke playback route passed')
}).catch((error) => {
  restoreMocks()
  fs.rmSync(runtimeDir, { recursive: true, force: true })
  console.error('Smoke playback route failed')
  console.error(error?.stack || error)
  process.exit(1)
})
