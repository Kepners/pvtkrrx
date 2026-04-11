const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { QBitClient } = require('../src/clients/qbittorrent')
const { CinemetaClient } = require('../src/clients/cinemeta')
const { handleStream } = require('../src/handlers/stream')
const { buildExternalFileUrl } = require('../src/utils/fileServing')
const { decodeFileStateToken, decodePlaybackStateToken } = require('../src/utils/opaqueState')
const { encodeCustomId } = require('../src/utils/customId')
const { inspectTorrentPayload } = require('../src/utils/torrentPayload')
const ORIGINAL_FETCH = global.fetch

const ORIGINALS = {
  searchImdb: ProwlarrClient.prototype.searchImdb,
  search: ProwlarrClient.prototype.search,
  torrents: QBitClient.prototype.torrents,
  files: QBitClient.prototype.files,
  getMovie: CinemetaClient.prototype.getMovie,
  getSeries: CinemetaClient.prototype.getSeries
}

function resetMocks() {
  ProwlarrClient.prototype.searchImdb = ORIGINALS.searchImdb
  ProwlarrClient.prototype.search = ORIGINALS.search
  QBitClient.prototype.torrents = ORIGINALS.torrents
  QBitClient.prototype.files = ORIGINALS.files
  CinemetaClient.prototype.getMovie = ORIGINALS.getMovie
  CinemetaClient.prototype.getSeries = ORIGINALS.getSeries
  global.fetch = ORIGINAL_FETCH
}

function makeBaseConfig(overrides = {}) {
  return {
    jackettUrl: 'https://prowlarr.example',
    jackettApiKey: 'dummy-key',
    qbitUrl: 'https://qbit.example',
    qbitUsername: 'demo',
    qbitPassword: 'demo',
    fileServerUrl: 'https://files.example',
    fileServerAuth: '',
    pathMapping: { from: '', to: '' },
    additionalStorageRoots: [],
    maxResults: 50,
    lanPairEnabled: false,
    lanPairRequired: false,
    ...overrides
  }
}

function trackerItem(overrides = {}) {
  return {
    title: 'Movie Name 2026 1080p WEB-DL x264',
    link: 'https://tracker.example/download/movie-name.torrent',
    infohash: '',
    size: 12_000_000_000,
    seeders: 42,
    indexer: 'SmokeTracker',
    ...overrides
  }
}

function matchedTorrent(overrides = {}) {
  return {
    hash: '0123456789abcdef0123456789abcdef01234567',
    name: 'Movie Name 2026 1080p WEB-DL x264',
    progress: 0.25,
    save_path: '/downloads/complete',
    download_path: '/downloads/incomplete',
    content_path: '',
    ...overrides
  }
}

function matchedFile(overrides = {}) {
  return {
    name: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv',
    size: 12_000_000_000,
    progress: 0.25,
    index: 0,
    ...overrides
  }
}

function packedArchiveFilesPartial() {
  return [
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
      progress: 0.35,
      index: 2
    },
    {
      name: 'Release/release.r02',
      size: 100_000_000,
      progress: 0,
      index: 3
    }
  ]
}

function packedArchiveFilesComplete() {
  return [
    {
      name: 'Release/Sample/sample-release.mkv',
      size: 125_948_856,
      progress: 1,
      index: 0
    },
    {
      name: 'Release/release.rar',
      size: 100_000_000,
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
}

function findNoticeStream(streams, code) {
  return (streams || []).find(stream => String(stream?.behaviorHints?.sourceNoticeCode || '') === code)
}

function decodeOpaqueFilePath(url) {
  const resolvedUrl = Array.isArray(url)
    ? String(url[0] || '')
    : String(url?.url || url || '')
  const parsed = new URL(resolvedUrl)
  const token = decodeURIComponent(parsed.pathname.split('/').pop() || '')
  return String(decodeFileStateToken(token)?.p || '')
}

function decodeOpaquePlaybackState(url) {
  const resolvedUrl = Array.isArray(url)
    ? String(url[0] || '')
    : String(url?.url || url || '')
  const parsed = new URL(resolvedUrl)
  const token = decodeURIComponent(parsed.pathname.split('/').pop() || '')
  return decodePlaybackStateToken(token)
}

function customPackedId(overrides = {}) {
  return encodeCustomId({
    y: 'sports',
    k: 'sports',
    t: 'SeriesX 2026 Event 03 Practice Two HLG 2160p WEB h265 VERUM',
    n: 'SeriesX Event 03 Practice 2',
    h: matchedTorrent().hash,
    l: 'https://tracker.example/download/seriesx-practice.torrent',
    i: 'SmokeTracker',
    s: 7_890_000_000,
    d: 4,
    ...overrides
  }, {
    compress: true,
    compact: 'sports'
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
      name: 'packed-release',
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

async function withScenario(setup, run) {
  resetMocks()
  await setup()
  try {
    await run()
  } finally {
    resetMocks()
  }
}

async function run() {
  const originalVercel = process.env.VERCEL
  const originalExperimentalRar = process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
  const originalHostedGateway = process.env.PVTKRRX_HOST_GATEWAY_HOST
  const orphanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-stream-pipeline-'))
  const orphanFilePath = path.join(orphanRoot, 'Downloaded.Movie.2026.1080p.mp4')
  fs.writeFileSync(orphanFilePath, 'orphaned local file bytes', 'utf8')

  try {
    await withScenario(async () => {
      process.env.VERCEL = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig(),
        'movie',
        'tt1234567',
        'https://pvtkrrx.vercel.app',
        'remote-token'
      )

      assert.equal(result.streams.filter(stream => stream.url).length, 0, '#1 hosted Vercel remote must suppress dead tracker /playback streams')
      const readyNotice = findNoticeStream(result.streams, 'hosted-ready-only')
      assert.ok(readyNotice, '#1 hosted Vercel remote should explain ready-file-first suppression')
      assert.match(String(readyNotice?.name || ''), /Ready Files Only/i, '#1 notice title should read like a user-facing limitation')
      assert.match(String(readyNotice?.description || ''), /already ready to play/i, '#1 notice should explain the ready-file-only rule plainly')
      assert.match(String(readyNotice?.description || ''), /PC Local, LAN Bridge, or self-hosted playback/i, '#1 notice should point users to an actionable route')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerAuth: 'seedboxuser:seedboxpass' }),
        'movie',
        'tt1234567',
        'https://selfhost.example',
        'remote-token'
      )

      assert.equal(result.streams.filter(stream => stream.url).length, 0, '#2 remote tracker/download flows must be suppressed when file server auth would be lost')
      const authNotice = findNoticeStream(result.streams, 'auth-suppressed')
      assert.ok(authNotice, '#2 remote auth-safe suppression should be visible in stream notices')
      assert.match(String(authNotice?.description || ''), /protect your file-server login/i, '#2 notice should explain the safety reason in user language')
      assert.match(String(authNotice?.description || ''), /Ready files can still play/i, '#2 notice should explain the safe path that still works')
    })

    const unsafeBufferUrl = buildExternalFileUrl(
      makeBaseConfig({
        pathMapping: { from: '/downloads/incomplete', to: 'media' }
      }),
      matchedTorrent(),
      matchedFile().name,
      {
        multipleFiles: false,
        requireCurrentPathProof: true
      }
    )
    assert.equal(unsafeBufferUrl, null, '#3 buffering external URL must be suppressed when current file path cannot be proven')

    const safeBufferUrl = buildExternalFileUrl(
      makeBaseConfig({
        pathMapping: { from: '/downloads/incomplete', to: 'media' }
      }),
      matchedTorrent({ content_path: '/downloads/incomplete/Movie.Name.2026.1080p.WEB-DL.x264.mkv' }),
      matchedFile().name,
      {
        multipleFiles: false,
        requireCurrentPathProof: true
      }
    )
    assert.equal(
      safeBufferUrl,
      'https://files.example/media/Movie.Name.2026.1080p.WEB-DL.x264.mkv',
      '#3b buffering external URL should emit when qBit exposes a provable current file path'
    )

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => [matchedFile()]
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({
          fileServerUrl: 'https://files.example',
          pathMapping: { from: '/downloads/incomplete', to: 'media' }
        }),
        'movie',
        'tt1234567',
        'https://selfhost.example',
        'remote-token'
      )

      assert.equal(result.streams.filter(stream => stream.url).length, 0, '#3c remote buffering should stay hidden when current file path cannot be proven')
      const bufferingNotice = findNoticeStream(result.streams, 'buffering-path-unproven')
      assert.ok(bufferingNotice, '#3c remote buffering suppression should explain missing current-path proof')
      assert.match(String(bufferingNotice?.description || ''), /safe buffer URL/i, '#3c notice should frame missing path proof as a safe limitation')
      assert.match(String(bufferingNotice?.description || ''), /Wait for more progress/i, '#3c notice should give a clear next step')
    })

    await withScenario(async () => {
      process.env.VERCEL = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ progress: 1 })]
      QBitClient.prototype.files = async () => [matchedFile({ progress: 1 })]
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({
          pathMapping: { from: '/downloads/complete', to: 'media' }
        }),
        'movie',
        'tt1234567',
        'https://pvtkrrx.vercel.app',
        'remote-token'
      )

      assert.equal(result.streams.length, 1, '#3d hosted remote ready-file flow should still emit a direct stream when the file is already complete')
      assert.equal(String(result.streams[0]?.url || ''), 'https://files.example/media/Movie.Name.2026.1080p.WEB-DL.x264.mkv', '#3d hosted remote ready-file stream should point at the external file server')
      assert.match(String(result.streams[0]?.name || ''), /\[SERVER\]/, '#3d hosted remote ready-file stream should show the server origin badge')
      assert.match(String(result.streams[0]?.description || ''), /Source: Remote Server/i, '#3d hosted remote ready-file stream description should say the server is serving the file')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceOrigin || ''), 'server', '#3d hosted remote ready-file stream should expose the server origin hint')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'https://control.example',
        'selfhost',
        'https://play.example'
      )

      assert.equal(result.streams.length, 1, '#3e self-host tracker playback should still emit a stream when a dedicated playback origin is configured')
      assert.match(String(result.streams[0]?.url || ''), /^https:\/\/play\.example\/selfhost\/playback\//, '#3e self-host tracker playback should use the dedicated playback origin instead of the control/tunnel origin')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => [matchedFile()]
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'https://control.example',
        'selfhost',
        'https://play.example'
      )

      assert.equal(result.streams.length, 1, '#3f self-host buffering should still emit a stream when a dedicated playback origin is configured')
      assert.match(String(result.streams[0]?.url || ''), /^https:\/\/play\.example\/selfhost\/playback\//, '#3f self-host buffering should use the dedicated playback origin and the safer /playback handoff instead of jumping straight into /file')
      assert.equal(
        String(decodeOpaquePlaybackState(result.streams[0]?.url || '')?.p || ''),
        matchedFile().name,
        '#3f self-host buffering token should preserve the selected file path'
      )
    })

    await withScenario(async () => {
      process.env.VERCEL = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig(),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4 local playback-capable route should still emit tracker playback stream')
      assert.match(String(result.streams[0]?.url || ''), /\/local\/playback\//)
      assert.match(String(result.streams[0]?.name || ''), /\[PC\]/, '#4 tracker stream should show the PC origin badge')
      assert.match(String(result.streams[0]?.name || ''), /⬇️/, '#4 tracker stream should show the download-and-play badge before the file is downloaded')
      assert.match(String(result.streams[0]?.description || ''), /Download and play/i, '#4 tracker stream description should say download and play while it is not downloaded yet')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4 tracker stream description should say the host PC will do the work')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceOrigin || ''), 'pc', '#4 tracker stream should expose the PC origin hint')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => [matchedFile()]
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4b local buffering flow should remain intact')
      assert.match(String(result.streams[0]?.url || ''), /\/local\/playback\//)
      assert.equal(
        String(decodeOpaquePlaybackState(result.streams[0]?.url || '')?.p || ''),
        matchedFile().name,
        '#4b local buffering token should preserve the selected file path'
      )
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceMode || ''), 'buffering')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceOrigin || ''), 'pc', '#4b buffering stream should expose the PC origin hint')
      assert.match(String(result.streams[0]?.name || ''), /\[PC\]/, '#4b buffering stream should show the PC origin badge')
      assert.match(String(result.streams[0]?.name || ''), /⏳/, '#4b buffering stream should show the buffering badge')
      assert.match(String(result.streams[0]?.name || ''), /🎬MKV/, '#4b buffering stream should show the detected file format badge')
      assert.match(String(result.streams[0]?.description || ''), /Buffering/i, '#4b buffering stream description should say buffering')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4b buffering stream description should say the host PC is serving the stream')
      assert.match(String(result.streams[0]?.description || ''), /Format: MKV/i, '#4b buffering stream description should surface the file format')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => []
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        encodeCustomId({
          y: 'movie',
          t: 'Downloaded Movie 2026 1080p',
          n: 'Downloaded Movie',
          h: matchedTorrent().hash,
          s: 1234,
          d: 0,
          f: orphanFilePath
        }, {
          compress: true,
          compact: 'library'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/local\/file\//.test(String(stream?.url || ''))).length, 1, '#4ba orphaned local library items should still emit a direct file stream when the file exists on disk')
      assert.equal(
        decodeOpaqueFilePath(result.streams[0]?.url || ''),
        orphanFilePath,
        '#4ba orphaned local library stream should carry the absolute local file path in the opaque file token'
      )
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => packedArchiveFilesPartial()
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => Array.isArray(stream?.rarUrls)).length, 0, '#4c incomplete packed archive should stay hidden until all archive parts are ready')
      const archiveNotice = findNoticeStream(result.streams, 'packed-archive-pending')
      assert.ok(archiveNotice, '#4c incomplete packed archive should show a user-facing pending notice')
      assert.match(String(archiveNotice?.description || ''), /still downloading/i, '#4c pending notice should explain why packed playback is hidden')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      delete process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent({ progress: 1 }).hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ progress: 1 })]
      QBitClient.prototype.files = async () => packedArchiveFilesComplete()
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => Array.isArray(stream?.rarUrls)).length, 0, '#4d completed packed archive should stay hidden by default until a direct-play file is ready')
      const archiveNotice = findNoticeStream(result.streams, 'packed-archive-extractor-unavailable')
      assert.ok(archiveNotice, '#4d completed packed archive should explain why the packed release is hidden')
      assert.match(String(archiveNotice?.description || ''), /direct-play file/i, '#4d archive notice should explain that PVTKRRX is waiting for extracted direct playback')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS = 'true'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent({ progress: 1 }).hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ progress: 1 })]
      QBitClient.prototype.files = async () => packedArchiveFilesComplete()
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4d1 experimental native archive mode should still emit a single archive-mode stream when explicitly enabled')
      assert.ok(Array.isArray(result.streams[0]?.rarUrls), '#4d1 experimental native archive mode should expose rarUrls')
      assert.equal(result.streams[0].rarUrls.length, 3, '#4d1 experimental native archive stream should include all archive parts and skip the sample clip')
      assert.ok(Array.isArray(result.streams[0]?.rarUrls?.[0]), '#4d1 experimental native archive stream should serialize archive parts as tuple entries for Stremio core')
      assert.equal(String(result.streams[0]?.rarUrls?.[0]?.[1] || ''), '100000000', '#4d1 experimental native archive stream should carry archive size bytes in the tuple form')
      assert.deepEqual(result.streams[0]?.fileMustInclude || [], ['/\\.(mkv|mp4|avi|wmv|ts|m4v)$/i'], '#4d1 experimental native archive stream should serialize fileMustInclude as Stremio-compatible string patterns')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceContainer || ''), 'rar', '#4d1 experimental native archive stream should advertise archive container type')
      assert.match(decodeOpaqueFilePath(result.streams[0]?.rarUrls?.[0] || ''), /release\.rar/i, '#4d1 experimental native archive stream should start with the first archive volume')
      assert.match(decodeOpaqueFilePath(result.streams[0]?.rarUrls?.[1] || ''), /release\.r00/i, '#4d1 experimental native archive stream should keep classic multi-volume order')
      assert.match(decodeOpaqueFilePath(result.streams[0]?.rarUrls?.[2] || ''), /release\.r01/i, '#4d1 experimental native archive stream should keep classic multi-volume order')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      const torrent = matchedTorrent({
        progress: 1,
        save_path: orphanRoot,
        download_path: orphanRoot
      })
      const extractedDir = path.join(orphanRoot, '.pvtkrrx-extracted', torrent.hash)
      const extractedFilePath = path.join(extractedDir, 'release-extracted.mp4')
      fs.mkdirSync(extractedDir, { recursive: true })
      fs.writeFileSync(extractedFilePath, Buffer.from('extracted archive stream', 'utf8'))
      fs.writeFileSync(path.join(extractedDir, '.pvtkrrx-ready.json'), JSON.stringify({
        hash: torrent.hash,
        videoPath: extractedFilePath,
        sourceArchivePath: path.join(orphanRoot, 'Release', 'release.rar'),
        extractedAt: new Date().toISOString()
      }, null, 2))
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: torrent.hash, link: '' })]
      QBitClient.prototype.torrents = async () => [torrent]
      QBitClient.prototype.files = async () => packedArchiveFilesComplete()
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4d2 extracted packed archive should emit a single direct-play stream')
      assert.equal(Array.isArray(result.streams[0]?.rarUrls), false, '#4d2 extracted packed archive should prefer a normal direct file stream over rarUrls')
      assert.match(String(result.streams[0]?.url || ''), /\/file\//, '#4d2 extracted packed archive should still use the shared file route')
      assert.match(decodeOpaqueFilePath(result.streams[0]?.url || ''), /release-extracted\.mp4/i, '#4d2 extracted packed archive should point at the extracted video file')
      assert.match(String(result.streams[0]?.name || ''), /📦/, '#4d2 extracted archive stream should show that the release was extracted after download')
      assert.match(String(result.streams[0]?.description || ''), /Downloaded and extracted/i, '#4d2 extracted archive stream description should make the extracted state explicit')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => packedArchiveFilesPartial()
      ProwlarrClient.prototype.search = async () => []
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId(),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => Array.isArray(stream?.rarUrls)).length, 0, '#4e incomplete packed custom streams should not expose archive playback yet')
      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4e incomplete packed custom streams should not fall back to stale tracker playback')
      const archiveNotice = findNoticeStream(result.streams, 'packed-archive-pending')
      assert.ok(archiveNotice, '#4e incomplete packed custom streams should explain the archive is still downloading')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'SeriesX.2026.Event03.Practice.Two.HLG.2160p.WEB.h265-VERUM.rar', length: 100_000_000 },
        { path: 'SeriesX.2026.Event03.Practice.Two.HLG.2160p.WEB.h265-VERUM.r00', length: 100_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'SeriesX 2026 Event 03 Practice Two HLG 2160p WEB h265 VERUM RAR r00',
          h: '',
          l: 'https://tracker.example/download/seriesx-packed-scene.torrent'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4f unmatched packed custom streams should not be advertised as live tracker playback')
      const unsupportedNotice = findNoticeStream(result.streams, 'packed-archive-live-unsupported')
      assert.ok(unsupportedNotice, '#4f unmatched packed custom streams should explain that partial packed playback is not offered')
      assert.match(String(unsupportedNotice?.description || ''), /not offered as live playback/i, '#4f unmatched packed custom notice should explain why the play-now stream is suppressed')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.rar', length: 476_800_000 },
        { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.r00', length: 476_800_000 },
        { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.r01', length: 476_800_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: '',
          l: 'https://tracker.example/download/home-away-packed.torrent'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4g neutral-title packed torrents should be dynamically suppressed before tracker playback is emitted')
      const unsupportedNotice = findNoticeStream(result.streams, 'packed-archive-live-unsupported')
      assert.ok(unsupportedNotice, '#4g neutral-title packed torrents should still surface the packed-release notice')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => [
        trackerItem({
          title: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE',
          link: 'https://tracker.example/download/home-away-packed.torrent',
          infohash: ''
        })
      ]
      global.fetch = async (url) => {
        const target = String(url || '')
        if (/home-away-packed\.torrent/i.test(target)) {
          return createFetchResponse(buildTorrentPayload([
            { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.rar', length: 476_800_000 },
            { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.r00', length: 476_800_000 },
            { path: 'Sports.2026.03.28.Home.Club.vs.Away.Club.1080p.WEB.h264-BILLIE.r01', length: 476_800_000 }
          ]))
        }
        return createFetchResponse(buildTorrentPayload([
          { path: 'fallback-video.mkv', length: 100_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: '',
          l: '',
          p: '2026-03-28',
          o: 'Home Club',
          w: 'Away Club'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4h packed supplemental sports torrents should not leak into generic tracker playback')
      const unsupportedNotice = findNoticeStream(result.streams, 'packed-archive-live-unsupported')
      assert.ok(unsupportedNotice, '#4h packed supplemental sports torrents should still surface the packed-release notice')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => [
        trackerItem({
          title: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          link: 'https://tracker.example/download/home-away-unverified.torrent',
          infohash: ''
        })
      ]
      global.fetch = async () => {
        throw new Error('tracker fetch failed')
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: '',
          l: '',
          p: '2026-03-28',
          o: 'Home Club',
          w: 'Away Club'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4i unverified supplemental sports torrents should not be advertised as playable')
      const verificationNotice = findNoticeStream(result.streams, 'tracker-link-unverified')
      assert.ok(verificationNotice, '#4i unverified supplemental sports torrents should show a verification notice instead')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      const payload = buildTorrentPayload([
        { path: 'Sports.RS.2026.Home.Club.vs.Away.Club.720p.mp4', length: 3_600_000_000 }
      ])
      const inferredHash = String(inspectTorrentPayload(payload).infoHash || '').toLowerCase()
      QBitClient.prototype.torrents = async () => [
        matchedTorrent({
          hash: inferredHash,
          name: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          progress: 1,
          content_path: '/downloads/incomplete/Sports.RS.2026.Home.Club.vs.Away.Club.720p.mp4'
        })
      ]
      QBitClient.prototype.files = async () => [
        matchedFile({
          name: 'Sports.RS.2026.Home.Club.vs.Away.Club.720p.mp4',
          size: 3_600_000_000,
          progress: 1
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(payload)
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: '',
          l: 'https://tracker.example/download/home-away-complete.torrent'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4j completed direct-video torrents without embedded hashes should resolve to the existing qBit torrent instead of falling back to tracker playback')
      assert.equal(result.streams.filter(stream => /\/file\//.test(String(stream?.url || ''))).length, 1, '#4j completed direct-video torrents without embedded hashes should emit the ready file stream')
      assert.equal(
        decodeOpaqueFilePath(result.streams[0]?.url || ''),
        path.normalize('/downloads/incomplete/Sports.RS.2026.Home.Club.vs.Away.Club.720p.mp4'),
        '#4j completed direct-video streams should carry the resolved absolute file path so playback survives if the torrent row disappears later'
      )
      assert.ok(result.streams.every(stream => String(stream?.name || '').startsWith('PVTKRRX ') || !stream?.name), '#4j stream names should start with PVTKRRX so Stremio can group them under the addon source')
      assert.match(String(result.streams[0]?.name || ''), /\[PC\]/, '#4j completed direct-video stream should show the PC origin badge')
      assert.match(String(result.streams[0]?.name || ''), /✅/, '#4j completed direct-video stream should show the downloaded badge')
      assert.match(String(result.streams[0]?.name || ''), /🎬MP4/, '#4j completed direct-video stream should show the detected file format badge')
      assert.match(String(result.streams[0]?.description || ''), /Downloaded/i, '#4j completed direct-video stream description should replace queue-and-buffer with downloaded')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4j completed direct-video stream description should say the host PC already has the file')
      assert.match(String(result.streams[0]?.description || ''), /Format: MP4/i, '#4j completed direct-video stream description should surface the file format')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      delete process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
      const payload = buildTorrentPayload([
        { path: 'Release/release.rar', length: 100_000_000 },
        { path: 'Release/release.r00', length: 100_000_000 },
        { path: 'Release/release.r01', length: 100_000_000 }
      ])
      const inferredHash = String(inspectTorrentPayload(payload).infoHash || '').toLowerCase()
      QBitClient.prototype.torrents = async () => [
        matchedTorrent({
          hash: inferredHash,
          name: 'SeriesX 2026 Event 03 1080p WEB h264 BILLIE',
          progress: 1
        })
      ]
      QBitClient.prototype.files = async () => packedArchiveFilesComplete()
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(payload)
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customPackedId({
          t: 'SeriesX 2026 Event 03 1080p WEB h264 BILLIE',
          h: '',
          l: 'https://tracker.example/download/seriesx-complete-packed.torrent'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => Array.isArray(stream?.rarUrls)).length, 0, '#4k completed packed torrents without embedded hashes should still hide native archive playback by default')
      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4k completed packed torrents without embedded hashes should not fall back to generic tracker playback')
      assert.ok(findNoticeStream(result.streams, 'packed-archive-extractor-unavailable'), '#4k completed packed torrents without embedded hashes should explain why the packed release stayed hidden')
      assert.ok(
        result.streams
          .filter(stream => stream?.url || Array.isArray(stream?.rarUrls))
          .every(stream => String(stream?.name || '').startsWith('PVTKRRX ') || !stream?.name),
        '#4k packed ready stream names should start with PVTKRRX so Stremio can group them under the addon source'
      )
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      process.env.PVTKRRX_HOST_GATEWAY_HOST = '10.0.1.1'
      QBitClient.prototype.torrents = async function () {
        assert.equal(this.url, 'http://10.0.1.1:8090', '#4l qBit should use the hosted gateway override instead of container loopback')
        return []
      }
      ProwlarrClient.prototype.search = async function () {
        assert.equal(this.baseUrl, 'http://10.0.1.1:9696', '#4l Prowlarr should use the hosted gateway override instead of container loopback')
        return [
          trackerItem({
            title: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
            link: 'https://tracker.example/download/home-away-loopback-override.torrent',
            infohash: ''
          })
        ]
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Sports.RS.2026.Home.Club.vs.Away.Club.720p.mp4', length: 3_600_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({
          jackettUrl: 'http://127.0.0.1:9696',
          qbitUrl: 'http://127.0.0.1:8090',
          fileServerUrl: ''
        }),
        'movie',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: '',
          l: '',
          p: '2026-03-28',
          o: 'Home Club',
          w: 'Away Club'
        }),
        'https://addon.example',
        'relay-token'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 1, '#4l hosted loopback overrides should restore tracker playback for tokenized configs on the same server')
    })

    console.log('Smoke stream pipeline passed')
  } finally {
    resetMocks()
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
    if (originalExperimentalRar === undefined) delete process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
    else process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS = originalExperimentalRar
    if (originalHostedGateway === undefined) delete process.env.PVTKRRX_HOST_GATEWAY_HOST
    else process.env.PVTKRRX_HOST_GATEWAY_HOST = originalHostedGateway
    fs.rmSync(orphanRoot, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error('Smoke stream pipeline failed')
  console.error(error)
  process.exit(1)
})
