const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-playback-smoke-'))
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.STREAM_WAIT_TIMEOUT_MS = '50'
process.env.STREAM_WAIT_INTERVAL_MS = '10'
delete process.env.VERCEL

const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken, encodeFileStateToken } = require('../src/utils/opaqueState')
const { QBitClient } = require('../src/clients/qbittorrent')
const { inspectTorrentPayload } = require('../src/utils/torrentPayload')
const app = require('../index')

const ORIGINALS = {
  torrents: QBitClient.prototype.torrents,
  torrentsByHashes: QBitClient.prototype.torrentsByHashes,
  files: QBitClient.prototype.files,
  setFilePriority: QBitClient.prototype.setFilePriority,
  toggleSequentialDownload: QBitClient.prototype.toggleSequentialDownload,
  toggleFirstLastPiecePrio: QBitClient.prototype.toggleFirstLastPiecePrio,
  fetch: global.fetch
}

function restoreMocks() {
  QBitClient.prototype.torrents = ORIGINALS.torrents
  QBitClient.prototype.torrentsByHashes = ORIGINALS.torrentsByHashes
  QBitClient.prototype.files = ORIGINALS.files
  QBitClient.prototype.setFilePriority = ORIGINALS.setFilePriority
  QBitClient.prototype.toggleSequentialDownload = ORIGINALS.toggleSequentialDownload
  QBitClient.prototype.toggleFirstLastPiecePrio = ORIGINALS.toggleFirstLastPiecePrio
  global.fetch = ORIGINALS.fetch
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

function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(String(value.length)), Buffer.from(':'), value])
  if (value instanceof Uint8Array) return bencode(Buffer.from(value))
  if (typeof value === 'string') return bencode(Buffer.from(value, 'utf8'))
  if (typeof value === 'number') return Buffer.from(`i${value}e`)
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')])
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return Buffer.concat([
      Buffer.from('d'),
      ...keys.flatMap(key => [bencode(key), bencode(value[key])]),
      Buffer.from('e')
    ])
  }
  return bencode('')
}

function buildTorrentPayload(fileEntries) {
  return bencode({
    info: {
      name: 'smoke-release',
      files: fileEntries.map(entry => ({
        length: entry.length,
        path: entry.path.split('/').filter(Boolean)
      }))
    }
  })
}

function createFetchResponse(bytes, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        const key = String(name || '').toLowerCase()
        return headers[key] || null
      }
    },
    async arrayBuffer() {
      const buffer = Buffer.from(bytes)
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
  }
}

async function run() {
  const hash = 'c1287d13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const packedHash = 'd1287d13bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const readyPackedHash = 'e1287d13cccccccccccccccccccccccccccccccc'
  const priorityCalls = []
  const payload = Buffer.from('smoke playback bytes', 'utf8')
  const archivePayload = Buffer.from('smoke rar bytes', 'utf8')
  const torrent = {
    hash,
    name: 'UFC Fight Night 270 Main Card 21 03 26 Z3R0 1080p',
    progress: 1,
    seq_dl: true,
    f_l_piece_prio: false,
    save_path: runtimeDir,
    download_path: runtimeDir,
    content_path: ''
  }
  const file = {
    name: 'UFC.Fight.Night.270.Main.Card.1080p.mp4',
    size: payload.length,
    progress: 1,
    index: 0
  }
  const packedTorrent = {
    hash: packedHash,
    name: 'Formula1.2026.Japanese.Grand.Prix.Practice.Two.HLG.2160p.WEB.h265-VERUM',
    progress: 0.2,
    seq_dl: true,
    f_l_piece_prio: false,
    save_path: runtimeDir,
    download_path: runtimeDir,
    content_path: ''
  }
  const readyPackedTorrent = {
    hash: readyPackedHash,
    name: 'Formula1.2026.Japanese.Grand.Prix.Practice.Two.HLG.2160p.WEB.h265-VERUM',
    progress: 1,
    seq_dl: true,
    f_l_piece_prio: false,
    save_path: runtimeDir,
    download_path: runtimeDir,
    content_path: ''
  }
  const packedFiles = [
    {
      name: 'Release/Sample/sample-release.mkv',
      size: 125_948_856,
      progress: 1,
      index: 0
    },
    {
      name: 'Release/release.r00',
      size: 100_000_000,
      progress: 1,
      index: 1
    },
    {
      name: 'Release/release.r01',
      size: 100_000_000,
      progress: 0.2,
      index: 2
    }
  ]
  const readyPackedFiles = [
    {
      name: 'Release/Sample/sample-release.mkv',
      size: 125_948_856,
      progress: 1,
      index: 0
    },
    {
      name: 'Release/release.rar',
      size: archivePayload.length,
      progress: 1,
      index: 1
    },
    {
      name: 'Release/release.r00',
      size: 100_000_000,
      progress: 1,
      index: 2
    },
    {
      name: 'Release/release.r01',
      size: 100_000_000,
      progress: 1,
      index: 3
    }
  ]
  fs.writeFileSync(path.join(runtimeDir, file.name), payload)
  fs.mkdirSync(path.join(runtimeDir, 'Release'), { recursive: true })
  fs.writeFileSync(path.join(runtimeDir, 'Release', 'release.rar'), archivePayload)
  const inferredPayload = buildTorrentPayload([
    { path: file.name, length: payload.length }
  ])
  const inferredHash = String(inspectTorrentPayload(inferredPayload).infoHash || '').toLowerCase()
  const inferredTorrent = {
    ...torrent,
    hash: inferredHash
  }

  QBitClient.prototype.torrents = async () => [torrent, inferredTorrent, packedTorrent, readyPackedTorrent]
  QBitClient.prototype.torrentsByHashes = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === hash) return [torrent]
    if (normalized === inferredHash) return [inferredTorrent]
    if (normalized === packedHash) return [packedTorrent]
    if (normalized === readyPackedHash) return [readyPackedTorrent]
    return []
  }
  QBitClient.prototype.files = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === hash) return [file]
    if (normalized === inferredHash) return [file]
    if (normalized === packedHash) return packedFiles
    if (normalized === readyPackedHash) return readyPackedFiles
    return []
  }
  QBitClient.prototype.setFilePriority = async (_hash, ids, priority) => {
    priorityCalls.push({ ids: [...ids], priority })
    return 'Ok.'
  }
  QBitClient.prototype.toggleSequentialDownload = async () => 'Ok.'
  QBitClient.prototype.toggleFirstLastPiecePrio = async () => 'Ok.'
  global.fetch = async (url) => {
    if (/existing-without-hash\.torrent/i.test(String(url || ''))) {
      return createFetchResponse(inferredPayload)
    }
    throw new Error(`unexpected fetch ${String(url || '')}`)
  }

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
    const inferredPlaybackToken = encodePlaybackStateToken({ h: '', l: 'https://tracker.example/existing-without-hash.torrent' })
    const packedPlaybackToken = encodePlaybackStateToken({ h: packedHash })
    const archiveFileToken = encodeFileStateToken({ h: readyPackedHash, p: 'Release/release.rar' })

    const response = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(playbackToken)}`)
    assert.equal(response.status, 302, 'completed playback should redirect instead of crashing')
    assert.match(String(response.headers.location || ''), new RegExp(`/${configToken}/file/`), 'playback redirect should target the shared file route')
    const fileResponse = await request(server.address().port, String(response.headers.location || ''))
    assert.equal(fileResponse.status, 200, 'file route should serve the completed local file')
    assert.equal(fileResponse.text, payload.toString('utf8'))
    assert.equal(String(fileResponse.headers['content-type'] || ''), 'video/mp4')

    const inferredResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(inferredPlaybackToken)}`)
    assert.equal(inferredResponse.status, 302, 'tracker playback should recover an existing completed torrent by inspecting the torrent payload hash when the stream token has no hash')
    const inferredFileResponse = await request(server.address().port, String(inferredResponse.headers.location || ''))
    assert.equal(inferredFileResponse.status, 200, 'recovered existing torrent should still redirect into the shared file route')
    assert.equal(inferredFileResponse.text, payload.toString('utf8'))

    const packedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(packedPlaybackToken)}`)
    assert.equal(packedResponse.status, 422, 'incomplete packed archives should fail fast with a truthful packed-release message instead of stalling')
    assert.match(String(packedResponse.text || ''), /partial multi-volume archive/i)
    assert.deepEqual(priorityCalls.slice(-2), [
      { ids: [0], priority: 0 },
      { ids: [1, 2], priority: 7 }
    ], 'packed playback should demote the sample clip and prioritize the archive bundle when priming archive-only torrents')

    const archiveFileResponse = await request(server.address().port, `/${configToken}/file/${encodeURIComponent(archiveFileToken)}`)
    assert.equal(archiveFileResponse.status, 200, 'file route should serve completed archive parts for RAR streams')
    assert.equal(archiveFileResponse.text, archivePayload.toString('utf8'))
    assert.equal(String(archiveFileResponse.headers['content-type'] || ''), 'application/octet-stream')
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
