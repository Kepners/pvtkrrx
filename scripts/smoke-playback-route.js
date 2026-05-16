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
process.env.STREAM_RANGE_WAIT_TIMEOUT_MS = '100'
process.env.STREAM_RANGE_WAIT_INTERVAL_MS = '10'
delete process.env.PVTKRRX_HOSTED_RELAY

const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken, encodeFileStateToken } = require('../src/utils/opaqueState')
const { QBitClient } = require('../src/clients/qbittorrent')
const { inspectTorrentPayload } = require('../src/utils/torrentPayload')
const { isPlaybackReady } = require('../src/lib/shared')
const app = require('../index')

const ORIGINALS = {
  torrents: QBitClient.prototype.torrents,
  torrentsByHashes: QBitClient.prototype.torrentsByHashes,
  files: QBitClient.prototype.files,
  properties: QBitClient.prototype.properties,
  pieceStates: QBitClient.prototype.pieceStates,
  add: QBitClient.prototype.add,
  addTorrentFile: QBitClient.prototype.addTorrentFile,
  resume: QBitClient.prototype.resume,
  topPriority: QBitClient.prototype.topPriority,
  setFilePriority: QBitClient.prototype.setFilePriority,
  toggleSequentialDownload: QBitClient.prototype.toggleSequentialDownload,
  toggleFirstLastPiecePrio: QBitClient.prototype.toggleFirstLastPiecePrio,
  fetch: global.fetch
}

function restoreMocks() {
  QBitClient.prototype.torrents = ORIGINALS.torrents
  QBitClient.prototype.torrentsByHashes = ORIGINALS.torrentsByHashes
  QBitClient.prototype.files = ORIGINALS.files
  QBitClient.prototype.properties = ORIGINALS.properties
  QBitClient.prototype.pieceStates = ORIGINALS.pieceStates
  QBitClient.prototype.add = ORIGINALS.add
  QBitClient.prototype.addTorrentFile = ORIGINALS.addTorrentFile
  QBitClient.prototype.resume = ORIGINALS.resume
  QBitClient.prototype.topPriority = ORIGINALS.topPriority
  QBitClient.prototype.setFilePriority = ORIGINALS.setFilePriority
  QBitClient.prototype.toggleSequentialDownload = ORIGINALS.toggleSequentialDownload
  QBitClient.prototype.toggleFirstLastPiecePrio = ORIGINALS.toggleFirstLastPiecePrio
  global.fetch = ORIGINALS.fetch
}

function request(port, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: reqPath,
      headers: options.headers || {}
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
  const originalPublicBaseUrl = process.env.PVTKRRX_PUBLIC_BASE_URL
  const originalPlaybackBaseUrl = process.env.PVTKRRX_PLAYBACK_BASE_URL
  const hash = 'c1287d13aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const incompleteHash = 'b1287d13dddddddddddddddddddddddddddddddd'
  const packedHash = 'd1287d13bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const readyPackedHash = 'e1287d13cccccccccccccccccccccccccccccccc'
  const targetedHash = 'f1287d13eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  const unverifiedHash = 'a1287d13ffffffffffffffffffffffffffffffff'
  const newlyQueuedTorrents = new Set()
  const addFileCalls = []
  const resumeCalls = []
  const topPriorityCalls = []
  const priorityCalls = []
  const firstLastToggleCalls = []
  const sequentialToggleCalls = []
  const payload = Buffer.from('smoke playback bytes', 'utf8')
  const targetedPayload = Buffer.from('smoke episode two bytes', 'utf8')
  const partialPayload = Buffer.alloc(30 * 1024 * 1024, 7)
  const archivePayload = Buffer.from('smoke rar bytes', 'utf8')
  const extractedPayload = Buffer.from('smoke extracted bytes', 'utf8')
  let incompletePieceStates = [2, 2, 0, 0, 2, 2]
  let promoteIncompleteSeekWindow = false
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
  const incompleteTorrent = {
    hash: incompleteHash,
    name: 'Formula1.2026.Japanese.Grand.Prix.Qualifying.1080p',
    progress: 0.25,
    seq_dl: true,
    f_l_piece_prio: false,
    save_path: runtimeDir,
    download_path: runtimeDir,
    content_path: ''
  }
  const unverifiedTorrent = {
    hash: unverifiedHash,
    name: 'UFC.328.Main.Event.1080p',
    progress: 0.9,
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
  const incompleteFile = {
    name: 'buffering/Formula1.2026.Japanese.Grand.Prix.Qualifying.1080p.mkv',
    size: 30 * 1024 * 1024,
    progress: 0.25,
    index: 0,
    piece_range: [0, 5]
  }
  const unverifiedFile = {
    name: 'buffering/UFC.328.Main.Event.1080p.mkv',
    size: 100 * 1024 * 1024,
    progress: 0.9,
    index: 0,
    piece_range: [0, 19]
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
  const targetedTorrent = {
    hash: targetedHash,
    name: 'Series Pack Smoke',
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
  const targetedFiles = [
    {
      name: 'Series/Smoke.Show.S01E01.mkv',
      size: payload.length,
      progress: 1,
      index: 0
    },
    {
      name: 'Series/Smoke.Show.S01E02.mkv',
      size: targetedPayload.length,
      progress: 1,
      index: 1
    }
  ]
  fs.writeFileSync(path.join(runtimeDir, file.name), payload)
  fs.mkdirSync(path.join(runtimeDir, 'buffering'), { recursive: true })
  fs.writeFileSync(path.join(runtimeDir, incompleteFile.name), partialPayload)
  fs.writeFileSync(path.join(runtimeDir, unverifiedFile.name), Buffer.alloc(96 * 1024 * 1024, 8))
  fs.mkdirSync(path.join(runtimeDir, 'Release'), { recursive: true })
  fs.writeFileSync(path.join(runtimeDir, 'Release', 'release.rar'), archivePayload)
  fs.mkdirSync(path.join(runtimeDir, 'Series'), { recursive: true })
  fs.writeFileSync(path.join(runtimeDir, 'Series', 'Smoke.Show.S01E01.mkv'), payload)
  fs.writeFileSync(path.join(runtimeDir, 'Series', 'Smoke.Show.S01E02.mkv'), targetedPayload)
  const extractedDir = path.join(runtimeDir, '.pvtkrrx-extracted', readyPackedHash)
  fs.mkdirSync(extractedDir, { recursive: true })
  const extractedFilePath = path.join(extractedDir, 'release-extracted.mp4')
  fs.writeFileSync(extractedFilePath, extractedPayload)
  fs.writeFileSync(path.join(extractedDir, '.pvtkrrx-ready.json'), JSON.stringify({
    hash: readyPackedHash,
    videoPath: extractedFilePath,
    sourceArchivePath: path.join(runtimeDir, 'Release', 'release.rar'),
    extractedAt: new Date().toISOString()
  }, null, 2))
  const inferredPayload = buildTorrentPayload([
    { path: file.name, length: payload.length }
  ])
  const legacyAviPayload = buildTorrentPayload([
    { path: 'Legacy/Movie.Name.2026.DVDRip.XviD.avi', length: 900_000_000 }
  ])
  const newQueuedPayload = buildTorrentPayload([
    { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 100 * 1024 * 1024 },
    { path: 'Extras/behind-the-scenes.nfo', length: 800_000 }
  ])
  const inferredHash = String(inspectTorrentPayload(inferredPayload).infoHash || '').toLowerCase()
  const newQueuedHash = String(inspectTorrentPayload(newQueuedPayload).infoHash || '').toLowerCase()
  const inferredTorrent = {
    ...torrent,
    hash: inferredHash
  }
  const newQueuedTorrent = {
    hash: newQueuedHash,
    name: 'Movie.Name.2026.1080p.WEB-DL.x264',
    progress: 0.01,
    seq_dl: false,
    f_l_piece_prio: false,
    save_path: runtimeDir,
    download_path: runtimeDir,
    content_path: ''
  }
  const newQueuedFiles = [
    {
      name: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv',
      size: 100 * 1024 * 1024,
      progress: 0.01,
      index: 0,
      piece_range: [0, 19]
    },
    {
      name: 'Extras/behind-the-scenes.nfo',
      size: 800_000,
      progress: 0,
      index: 1,
      piece_range: [20, 20]
    }
  ]
  fs.writeFileSync(path.join(runtimeDir, newQueuedFiles[0].name), Buffer.alloc(64 * 1024 * 1024, 9))

  QBitClient.prototype.torrents = async () => [
    torrent,
    inferredTorrent,
    incompleteTorrent,
    unverifiedTorrent,
    packedTorrent,
    readyPackedTorrent,
    targetedTorrent,
    ...(newlyQueuedTorrents.has(newQueuedHash) ? [newQueuedTorrent] : [])
  ]
  QBitClient.prototype.torrentsByHashes = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === hash) return [torrent]
    if (normalized === inferredHash) return [inferredTorrent]
    if (normalized === incompleteHash) return [incompleteTorrent]
    if (normalized === unverifiedHash) return [unverifiedTorrent]
    if (normalized === packedHash) return [packedTorrent]
    if (normalized === readyPackedHash) return [readyPackedTorrent]
    if (normalized === targetedHash) return [targetedTorrent]
    if (normalized === newQueuedHash && newlyQueuedTorrents.has(newQueuedHash)) return [newQueuedTorrent]
    return []
  }
  QBitClient.prototype.files = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === hash) return [file]
    if (normalized === inferredHash) return [file]
    if (normalized === incompleteHash) return [incompleteFile]
    if (normalized === unverifiedHash) return [unverifiedFile]
    if (normalized === packedHash) return packedFiles
    if (normalized === readyPackedHash) return readyPackedFiles
    if (normalized === targetedHash) return targetedFiles
    if (normalized === newQueuedHash && newlyQueuedTorrents.has(newQueuedHash)) return newQueuedFiles
    return []
  }
  QBitClient.prototype.properties = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === incompleteHash) {
      return { piece_size: 5 * 1024 * 1024 }
    }
    if (normalized === unverifiedHash) {
      return { piece_size: 5 * 1024 * 1024 }
    }
    if (normalized === newQueuedHash) {
      return { piece_size: 5 * 1024 * 1024 }
    }
    return { piece_size: payload.length || 1 }
  }
  QBitClient.prototype.pieceStates = async (inputHash) => {
    const normalized = String(inputHash || '').toLowerCase()
    if (normalized === incompleteHash) {
      const states = [...incompletePieceStates]
      if (promoteIncompleteSeekWindow) {
        incompletePieceStates = [2, 2, 0, 2, 2, 2]
        promoteIncompleteSeekWindow = false
      }
      return states
    }
    if (normalized === unverifiedHash) return []
    if (normalized === newQueuedHash) return Array.from({ length: 20 }, (_value, index) => index < 6 ? 2 : 0)
    return []
  }
  QBitClient.prototype.add = async (_link, options = {}) => {
    addFileCalls.push({ kind: 'magnet', options: { ...options } })
    return 'Ok.'
  }
  QBitClient.prototype.addTorrentFile = async (bytes, fileName, options = {}) => {
    const addedHash = String(inspectTorrentPayload(bytes).infoHash || '').toLowerCase()
    addFileCalls.push({ kind: 'file', fileName, hash: addedHash, options: { ...options } })
    if (addedHash === newQueuedHash) newlyQueuedTorrents.add(addedHash)
    return 'Ok.'
  }
  QBitClient.prototype.resume = async (inputHash) => {
    resumeCalls.push(String(inputHash || '').toLowerCase())
    return 'Ok.'
  }
  QBitClient.prototype.topPriority = async (inputHash) => {
    topPriorityCalls.push(String(inputHash || '').toLowerCase())
    return 'Ok.'
  }
  QBitClient.prototype.setFilePriority = async (_hash, ids, priority) => {
    priorityCalls.push({ ids: [...ids], priority })
    return 'Ok.'
  }
  QBitClient.prototype.toggleSequentialDownload = async (inputHash) => {
    sequentialToggleCalls.push(String(inputHash || '').toLowerCase())
    return 'Ok.'
  }
  QBitClient.prototype.toggleFirstLastPiecePrio = async (inputHash) => {
    firstLastToggleCalls.push(String(inputHash || '').toLowerCase())
    return 'Ok.'
  }
  global.fetch = async (url) => {
    if (/existing-without-hash\.torrent/i.test(String(url || ''))) {
      return createFetchResponse(inferredPayload)
    }
    if (/legacy-avi\.torrent/i.test(String(url || ''))) {
      return createFetchResponse(legacyAviPayload)
    }
    if (/new-queued\.torrent/i.test(String(url || ''))) {
      return createFetchResponse(newQueuedPayload, {
        'content-disposition': 'attachment; filename="new-queued.torrent"'
      })
    }
    throw new Error(`unexpected fetch ${String(url || '')}`)
  }

  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  try {
    assert.equal(
      isPlaybackReady({ size: 100 * 1024 * 1024 }, 8 * 1024 * 1024),
      false,
      'tiny head buffers should not be marked playback-ready yet'
    )
    assert.equal(
      isPlaybackReady({ size: 100 * 1024 * 1024 }, 30 * 1024 * 1024),
      true,
      'playback should become ready once a meaningful initial buffer exists'
    )

    const configToken = encodeURIComponent(encrypt({
      qbitUrl: 'http://127.0.0.1:8080',
      qbitUsername: 'admin',
      qbitPassword: 'adminadmin',
      fileServerUrl: '',
      lanPairEnabled: false,
      lanPairRequired: false
    }, process.env.ENCRYPTION_SECRET))
    const playbackToken = encodePlaybackStateToken({ h: hash })
    const incompletePlaybackToken = encodePlaybackStateToken({ h: incompleteHash })
    const unverifiedPlaybackToken = encodePlaybackStateToken({ h: unverifiedHash })
    const inferredPlaybackToken = encodePlaybackStateToken({ h: '', l: 'https://tracker.example/existing-without-hash.torrent' })
    const legacyAviPlaybackToken = encodePlaybackStateToken({ h: '', l: 'https://tracker.example/legacy-avi.torrent' })
    const newQueuedPlaybackToken = encodePlaybackStateToken({ h: '', l: 'https://tracker.example/new-queued.torrent' })
    const packedPlaybackToken = encodePlaybackStateToken({ h: packedHash })
    const readyPackedPlaybackToken = encodePlaybackStateToken({ h: readyPackedHash })
    const targetedPlaybackToken = encodePlaybackStateToken({ h: targetedHash, p: targetedFiles[1].name })
    const archiveFileToken = encodeFileStateToken({ h: readyPackedHash, p: 'Release/release.rar' })
    const orphanFileToken = encodeFileStateToken({ h: 'ffffffffffffffffffffffffffffffffffffffff', p: path.join(runtimeDir, file.name) })

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

    const legacyAviResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(legacyAviPlaybackToken)}`)
    assert.equal(legacyAviResponse.status, 422, 'AVI-only tracker playback should fail fast before qBit queueing instead of handing Stremio a source that never starts')
    assert.match(String(legacyAviResponse.text || ''), /Legacy AVI\/XviD source detected/i)

    const newQueuedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(newQueuedPlaybackToken)}`)
    assert.equal(newQueuedResponse.status, 302, 'brand-new tracker playback should add the torrent and redirect into /file as soon as qBit exposes the video file')
    assert.match(String(newQueuedResponse.headers.location || ''), new RegExp(`/${configToken}/file/`), 'newly queued playback should target the shared file route')
    assert.deepEqual(
      addFileCalls.filter(call => call.hash === newQueuedHash).map(call => call.options),
      [{
        sequentialDownload: true,
        firstLastPiecePrio: true,
        paused: false
      }],
      'new tracker torrents should be added as active sequential playback jobs'
    )
    assert.ok(resumeCalls.includes(newQueuedHash), 'new tracker torrents should be explicitly resumed for playback')
    assert.ok(topPriorityCalls.includes(newQueuedHash), 'new tracker torrents should be promoted to the top of the qBit queue for playback')
    assert.deepEqual(
      priorityCalls.slice(-2),
      [
        { ids: [1], priority: 0 },
        { ids: [0], priority: 7 }
      ],
      'new tracker torrents should prioritize the selected video file and demote unrelated files'
    )

    const coldIncompleteResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(incompletePlaybackToken)}`)
    assert.equal(coldIncompleteResponse.status, 503, 'incomplete playback should not redirect into /file before the selected file has a real contiguous head buffer')
    assert.equal(String(coldIncompleteResponse.headers.location || ''), '', 'cold incomplete playback should not hand Stremio a premature file URL')

    const unverifiedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(unverifiedPlaybackToken)}`)
    assert.equal(unverifiedResponse.status, 503, 'incomplete playback should fail closed when qBit cannot prove the contiguous head pieces')
    assert.equal(String(unverifiedResponse.headers.location || ''), '', 'unverified incomplete playback should not redirect based on progress percent alone')

    incompletePieceStates = [2, 2, 2, 2, 2, 2]
    const incompleteResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(incompletePlaybackToken)}`)
    assert.equal(incompleteResponse.status, 302, 'incomplete playback should redirect into the shared file route instead of timing out inside /playback')
    assert.match(String(incompleteResponse.headers.location || ''), new RegExp(`/${configToken}/file/`), 'incomplete playback redirect should target the shared file route')
    const incompleteFileResponse = await request(server.address().port, String(incompleteResponse.headers.location || ''))
    assert.equal(incompleteFileResponse.status, 206, 'shared file route should keep Stremio on the player with a partial-content response while bytes continue downloading')
    assert.match(String(incompleteFileResponse.headers['content-range'] || ''), /^bytes 0-\d+\/31457280$/)

    const seekRangeResponse = await request(
      server.address().port,
      String(incompleteResponse.headers.location || ''),
      {
        headers: {
          Range: 'bytes=20971520-22020095'
        }
      }
    )
    assert.equal(seekRangeResponse.status, 206, 'seek-like range probes should stay on the player when qBit has already downloaded the requested piece window')
    assert.match(String(seekRangeResponse.headers['content-range'] || ''), /^bytes 20971520-\d+\/31457280$/)

    incompletePieceStates = [2, 2, 2, 0, 2, 2]
    const sequentialToggleCountBeforeUnavailableSeek = sequentialToggleCalls.length
    promoteIncompleteSeekWindow = true
    const unavailableSeekResponse = await request(
      server.address().port,
      String(incompleteResponse.headers.location || ''),
      {
        headers: {
          Range: 'bytes=15728640-16777215'
        }
      }
    )
    assert.equal(unavailableSeekResponse.status, 206, 'seek retries should recover once the requested piece window arrives')
    assert.match(String(unavailableSeekResponse.headers['content-range'] || ''), /^bytes 15728640-\d+\/31457280$/)
    assert.equal(
      sequentialToggleCalls.length,
      sequentialToggleCountBeforeUnavailableSeek,
      'seek retries should not toggle sequential download back off when qBit is already in sequential mode'
    )

    const packedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(packedPlaybackToken)}`)
    assert.equal(packedResponse.status, 422, 'incomplete packed archives should fail fast with a truthful packed-release message instead of stalling')
    assert.match(String(packedResponse.text || ''), /partial multi-volume archive/i)
    assert.deepEqual(priorityCalls.slice(-2), [
      { ids: [0], priority: 0 },
      { ids: [1, 2], priority: 7 }
    ], 'packed playback should demote the sample clip and prioritize the archive bundle when priming archive-only torrents')
    assert.ok(
      firstLastToggleCalls.includes(hash) || firstLastToggleCalls.includes(packedHash),
      'progressive playback should enable first/last piece priority so Stremio stays on the player while probing both ends of the file'
    )

    const readyPackedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(readyPackedPlaybackToken)}`)
    assert.equal(readyPackedResponse.status, 302, 'completed packed archives with an extracted video should redirect into the shared file route')
    const readyPackedFileResponse = await request(server.address().port, String(readyPackedResponse.headers.location || ''))
    assert.equal(readyPackedFileResponse.status, 200, 'completed packed archives should serve the extracted direct-play file once available')
    assert.equal(readyPackedFileResponse.text, extractedPayload.toString('utf8'))
    assert.equal(String(readyPackedFileResponse.headers['content-type'] || ''), 'video/mp4')

    const targetedResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(targetedPlaybackToken)}`)
    assert.equal(targetedResponse.status, 302, 'playback tokens with a target file hint should still redirect normally')
    const targetedFileResponse = await request(server.address().port, String(targetedResponse.headers.location || ''))
    assert.equal(targetedFileResponse.status, 200, 'playback target hints should resolve the requested file from a multi-file torrent')
    assert.equal(targetedFileResponse.text, targetedPayload.toString('utf8'))

    const archiveFileResponse = await request(server.address().port, `/${configToken}/file/${encodeURIComponent(archiveFileToken)}`)
    assert.equal(archiveFileResponse.status, 200, 'file route should serve completed archive parts for RAR streams')
    assert.equal(archiveFileResponse.text, archivePayload.toString('utf8'))
    assert.equal(String(archiveFileResponse.headers['content-type'] || ''), 'application/octet-stream')

    const orphanFileResponse = await request(server.address().port, `/${configToken}/file/${encodeURIComponent(orphanFileToken)}`)
    assert.equal(orphanFileResponse.status, 200, 'file route should still serve an absolute local file path when the qBit torrent row no longer exists')
    assert.equal(orphanFileResponse.text, payload.toString('utf8'))

    process.env.PVTKRRX_PUBLIC_BASE_URL = 'https://control.example.com'
    process.env.PVTKRRX_PLAYBACK_BASE_URL = 'https://play.example.com'
    const splitOriginResponse = await request(server.address().port, `/${configToken}/playback/${encodeURIComponent(playbackToken)}`)
    assert.equal(splitOriginResponse.status, 302, 'playback should still redirect when a dedicated playback origin is configured')
    assert.match(
      String(splitOriginResponse.headers.location || ''),
      new RegExp(`^https://play\\.example\\.com/${configToken}/file/`),
      'playback redirect should target the dedicated playback origin instead of the control/tunnel origin'
    )
  } finally {
    if (originalPublicBaseUrl === undefined) delete process.env.PVTKRRX_PUBLIC_BASE_URL
    else process.env.PVTKRRX_PUBLIC_BASE_URL = originalPublicBaseUrl
    if (originalPlaybackBaseUrl === undefined) delete process.env.PVTKRRX_PLAYBACK_BASE_URL
    else process.env.PVTKRRX_PLAYBACK_BASE_URL = originalPlaybackBaseUrl
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
