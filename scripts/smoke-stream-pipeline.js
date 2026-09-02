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
const {
  clearSportsAvailabilityAnchors,
  setSportsAvailabilityAnchor,
  setSportsAvailabilityCanonicalAnchor
} = require('../src/utils/sportsAvailabilityStore')
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

function customSportsId(overrides = {}) {
  return encodeCustomId({
    y: 'movie',
    k: 'sports',
    t: 'Arsenal vs Chelsea',
    n: 'Arsenal vs Chelsea',
    r: 'football',
    e: '2026-03-15',
    u: 'EPL',
    o: 'Arsenal',
    w: 'Chelsea',
    q: 'ambiguous',
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

function buildTorrentPayload(fileEntries, options = {}) {
  const root = {
    info: {
      name: 'packed-release',
      files: fileEntries.map(entry => ({
        length: entry.length,
        path: entry.path.split('/').filter(Boolean)
      }))
    }
  }
  if (Array.isArray(options.trackers) && options.trackers.length > 0) {
    root.announce = options.trackers[0]
    root['announce-list'] = options.trackers.map(tracker => [tracker])
  }
  if (options.private === true) {
    root.info.private = 1
  }
  return bencode(root)
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
  const scenarioNativeStremioTorrent = process.env.PVTKRRX_NATIVE_STREMIO_TORRENT
  await setup()
  try {
    await run()
  } finally {
    resetMocks()
    if (scenarioNativeStremioTorrent === undefined) delete process.env.PVTKRRX_NATIVE_STREMIO_TORRENT
    else process.env.PVTKRRX_NATIVE_STREMIO_TORRENT = scenarioNativeStremioTorrent
  }
}

async function run() {
  const originalHostedRelay = process.env.PVTKRRX_HOSTED_RELAY
  const originalExperimentalRar = process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
  const originalNativeStremioTorrent = process.env.PVTKRRX_NATIVE_STREMIO_TORRENT
  const originalHostedGateway = process.env.PVTKRRX_HOST_GATEWAY_HOST
  const orphanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-stream-pipeline-'))
  const orphanFilePath = path.join(orphanRoot, 'Downloaded.Movie.2026.1080p.mp4')
  let resolvedSportsAnchorKey = ''
  fs.writeFileSync(orphanFilePath, 'orphaned local file bytes', 'utf8')

  try {
    await withScenario(async () => {
      process.env.PVTKRRX_HOSTED_RELAY = '1'
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
        'https://www.pvtkrrx.cc',
        'remote-token'
      )

      assert.equal(result.streams.filter(stream => stream.url).length, 0, '#1 hosted relay remote must suppress dead tracker /playback streams')
      const readyNotice = findNoticeStream(result.streams, 'hosted-ready-only')
      assert.ok(readyNotice, '#1 hosted relay remote should explain ready-file-first suppression')
      assert.match(String(readyNotice?.name || ''), /Ready Files Only/i, '#1 notice title should read like a user-facing limitation')
      assert.match(String(readyNotice?.description || ''), /already ready to play/i, '#1 notice should explain the ready-file-only rule plainly')
      assert.match(String(readyNotice?.description || ''), /PC Local, LAN Bridge, or self-hosted playback/i, '#1 notice should point users to an actionable route')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ dlspeed: 524288, eta: 540 })]
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
      process.env.PVTKRRX_HOSTED_RELAY = '1'
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
        'https://www.pvtkrrx.cc',
        'remote-token'
      )

      assert.equal(result.streams.length, 1, '#3d hosted remote ready-file flow should still emit a direct stream when the file is already complete')
      assert.equal(String(result.streams[0]?.url || ''), 'https://files.example/media/Movie.Name.2026.1080p.WEB-DL.x264.mkv', '#3d hosted remote ready-file stream should point at the external file server')
      assert.match(String(result.streams[0]?.name || ''), /\[SERVER\]/, '#3d hosted remote ready-file stream should show the server origin badge')
      assert.match(String(result.streams[0]?.description || ''), /Source: Remote Server/i, '#3d hosted remote ready-file stream description should say the server is serving the file')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceOrigin || ''), 'server', '#3d hosted remote ready-file stream should expose the server origin hint')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ dlspeed: 524288, eta: 540 })]
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
      process.env.PVTKRRX_HOSTED_RELAY = '1'
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
      assert.match(String(result.streams[0]?.description || ''), /DL \| 1080P \| 12\.0 GB \| TKR: SmokeTracker/i, '#4 tracker stream description should expose DL quality, size, and tracker while it is not downloaded yet')
      assert.match(String(result.streams[0]?.description || ''), /\n42 seeders\n/i, '#4 tracker stream description should put seeders on their own line')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4 tracker stream description should say the host PC will do the work')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceOrigin || ''), 'pc', '#4 tracker stream should expose the PC origin hint')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      process.env.PVTKRRX_NATIVE_STREMIO_TORRENT = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({
        link: 'https://tracker.example/download/public-movie-name.torrent'
      })]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.__nativeTorrentExpectedHash = ''
      const payload = buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ], {
        trackers: ['udp://tracker.public.example:6969/announce']
      })
      global.__nativeTorrentExpectedHash = String(inspectTorrentPayload(payload).infoHash || '').toLowerCase()
      global.fetch = async () => createFetchResponse(payload)
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4a native Stremio torrent mode should emit one direct P2P stream')
      assert.equal(result.streams[0]?.url, undefined, '#4a native stream should not be an HTTP playback URL')
      assert.match(String(result.streams[0]?.infoHash || ''), /^[a-f0-9]{40}$/, '#4a native stream should expose infoHash')
      assert.equal(result.streams[0]?.fileIdx, 0, '#4a native stream should expose fileIdx')
      assert.ok((result.streams[0]?.sources || []).includes('tracker:udp://tracker.public.example:6969/announce'), '#4a native stream should expose public tracker source')
      assert.ok((result.streams[0]?.sources || []).includes(`dht:${global.__nativeTorrentExpectedHash}`), '#4a native stream should expose DHT source')
      assert.match(String(result.streams[0]?.description || ''), /DIRECT P2P \| 1080P \| 12\.0 GB \| MKV \| TKR: SmokeTracker/i, '#4a native stream should be labelled as direct P2P')
      assert.match(String(result.streams[0]?.description || ''), /Source: Stremio/i, '#4a native stream should say Stremio does the downloading')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      process.env.PVTKRRX_NATIVE_STREMIO_TORRENT = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({
        link: 'https://tracker.example/download/private-movie-name.torrent'
      })]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 12_000_000_000 }
      ], {
        trackers: ['https://private.tracker.example/announce'],
        private: true
      }))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.some(stream => stream?.infoHash && !stream?.url), false, '#4a1 private torrent payloads should not emit native Stremio P2P rows')
      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 1, '#4a1 private payload should stay on PVTKRR playback route')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'The Mandalorian and Grogu' })
      ProwlarrClient.prototype.searchImdb = async () => [
        trackerItem({
          title: 'Star Wars The Mandalorian 1080p WEB-DL',
          link: 'https://tracker.example/download/mandalorian-not-grogu.torrent',
          size: 209_800_000,
          seeders: 75,
          indexer: 'IPTorrents'
        }),
        trackerItem({
          title: 'Grogu Stocking Tree Hang 1080p WEB-DL',
          link: 'https://tracker.example/download/grogu-stocking.torrent',
          size: 56_500_000,
          seeders: 8,
          indexer: 'IPTorrents'
        }),
        trackerItem({
          title: 'The Mandalorian with Grogu in Hover Cot Star Wars Fan Art Figure Statue Model 3D STL',
          link: 'https://tracker.example/download/mandalorian-grogu-stl.torrent',
          size: 301_989_888,
          seeders: 7,
          indexer: 'IPTorrents',
          categoryIds: ['7050', '100095'],
          categoryNames: ['Books/Other', 'Books/Educational']
        }),
        trackerItem({
          title: 'The Mandalorian and Grogu 2026 1080p WEB-DL x264',
          link: 'https://tracker.example/download/mandalorian-and-grogu.torrent',
          size: 2_800_000_000,
          seeders: 42,
          indexer: 'IPTorrents'
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async (url) => {
        assert.equal(String(url), 'https://tracker.example/download/mandalorian-and-grogu.torrent', '#4b movie filter should only inspect the relevant feature-sized source')
        return createFetchResponse(buildTorrentPayload([
          { path: 'The.Mandalorian.And.Grogu.2026.1080p.WEB-DL.x264.mkv', length: 2_800_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt9991111',
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackStreams = result.streams.filter(stream => /\/playback\//.test(String(stream?.url || '')))
      assert.equal(playbackStreams.length, 1, '#4b movie filter should suppress off-title/tiny merchandise rows and keep the real movie candidate')
      assert.match(String(playbackStreams[0]?.description || ''), /The Mandalorian and Grogu 2026/i)
      assert.doesNotMatch(JSON.stringify(result.streams), /Grogu Stocking|mandalorian-not-grogu|mandalorian-grogu-stl/i)
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'The Devil Wears Prada 2' })
      ProwlarrClient.prototype.searchImdb = async () => [
        trackerItem({
          title: 'The Devil Wears Prada 2006 1080p USA Blu-ray MPEG-2 DTS-HD MA 5.1',
          link: 'https://tracker.example/download/devil-wears-prada-2006.torrent',
          size: 23_800_000_000,
          seeders: 42,
          imdbId: 'tt0458352'
        }),
        trackerItem({
          title: 'The Devil Wears Prada 2 2026 1080p DCPRip CAM AUDIO DD2.0 x264-AOC',
          link: 'https://tracker.example/download/devil-wears-prada-2-2026.torrent',
          size: 12_300_000_000,
          seeders: 613,
          imdbId: 'tt33612209'
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async (url) => {
        assert.equal(String(url), 'https://tracker.example/download/devil-wears-prada-2-2026.torrent', '#4b1 sequel number should reject the old 2006 movie before tracker payload fetch')
        await new Promise(resolve => setTimeout(resolve, 2600))
        return createFetchResponse(buildTorrentPayload([
          { path: 'The.Devil.Wears.Prada.2.2026.1080p.DCPRip.CAM.mkv', length: 12_300_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt33612209',
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackStreams = result.streams.filter(stream => /\/playback\//.test(String(stream?.url || '')))
      assert.equal(playbackStreams.length, 1, '#4b1 movie filter should keep the sequel and suppress the original movie')
      assert.match(String(playbackStreams[0]?.description || ''), /The Devil Wears Prada 2 2026/i)
      assert.doesNotMatch(JSON.stringify(result.streams), /devil-wears-prada-2006/i)
    })

    const housemaidFallbackQueries = []
    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'The Housemaid', releaseInfo: '2025' })
      ProwlarrClient.prototype.searchImdb = async () => []
      ProwlarrClient.prototype.search = async (query) => {
        housemaidFallbackQueries.push(query)
        if (query !== 'The Housemaid 2025') return []
        return [
          trackerItem({
            title: 'The Housemaid 2025 1080p TELESYNC x264-SyncUP',
            link: 'https://tracker.example/download/the-housemaid-2025.torrent',
            size: 8_200_000_000,
            seeders: 157,
            imdbId: 'tt27543632'
          })
        ]
      }
      global.fetch = async (url) => {
        assert.equal(String(url), 'https://tracker.example/download/the-housemaid-2025.torrent', '#4b2 year-qualified movie fallback should inspect the matching source')
        return createFetchResponse(buildTorrentPayload([
          { path: 'The.Housemaid.2025.1080p.TELESYNC.x264-SyncUP.mkv', length: 8_200_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt27543632',
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackStreams = result.streams.filter(stream => /\/playback\//.test(String(stream?.url || '')))
      assert.equal(playbackStreams.length, 1, '#4b2 movie fallback should try title+year before the bare title')
      assert.match(String(playbackStreams[0]?.description || ''), /The Housemaid 2025/i)
      assert.deepEqual(housemaidFallbackQueries.slice(0, 1), ['The Housemaid 2025'])
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => null
      ProwlarrClient.prototype.searchImdb = async () => [
        trackerItem({
          title: 'Random Grogu Toy Review 2026 1080p WEB-DL',
          link: 'https://tracker.example/download/random-grogu.torrent',
          size: 2_000_000_000,
          seeders: 90,
          imdbId: ''
        }),
        trackerItem({
          title: 'Localized Feature Title 2026 1080p WEB-DL',
          link: 'https://tracker.example/download/localized-feature.torrent',
          size: 2_000_000_000,
          seeders: 12,
          imdbId: 'tt7654321'
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async (url) => {
        assert.equal(String(url), 'https://tracker.example/download/localized-feature.torrent', '#4c no-title movie filter should only trust matching imdb id rows')
        return createFetchResponse(buildTorrentPayload([
          { path: 'Localized.Feature.Title.2026.1080p.WEB-DL.mkv', length: 2_000_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt7654321',
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackStreams = result.streams.filter(stream => /\/playback\//.test(String(stream?.url || '')))
      assert.equal(playbackStreams.length, 1, '#4c movie filter should not trust arbitrary imdb search rows when Cinemeta title is unavailable')
      assert.match(String(playbackStreams[0]?.description || ''), /Localized Feature Title/i)
      assert.doesNotMatch(JSON.stringify(result.streams), /Random Grogu Toy/i)
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent({ dlspeed: 524288, eta: 540 })]
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
      assert.match(String(result.streams[0]?.description || ''), /BUFFERING 25%/i, '#4b buffering stream description should say buffering with progress')
      assert.match(String(result.streams[0]?.description || ''), /Download: slow \| 25% \| 512 KiB\/s \| ETA 9m/i, '#4b buffering stream description should expose live qBit speed and ETA')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4b buffering stream description should say the host PC is serving the stream')
      assert.match(String(result.streams[0]?.description || ''), /\| MKV \|/i, '#4b buffering stream description should surface the file format')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceDownloadState || ''), 'slow', '#4b buffering stream should expose slow-download state')
      assert.equal(Number(result.streams[0]?.behaviorHints?.sourceDownloadSpeed || 0), 524288, '#4b buffering stream should expose download speed')
      assert.equal(Number(result.streams[0]?.behaviorHints?.sourceDownloadEta || 0), 540, '#4b buffering stream should expose download ETA')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      assert.ok(findNoticeStream(result.streams, 'packed-archive-live-unsupported'), '#4h packed supplemental sports torrents should surface the packed-release notice')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      assert.ok(findNoticeStream(result.streams, 'tracker-link-unverified'), '#4i unverified supplemental sports torrents should surface the tracker-link notice')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => [
        trackerItem({
          title: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          link: 'https://tracker.example/download/home-away-zero-peer.torrent',
          infohash: '',
          seeders: 0,
          size: 3_600_000_000
        })
      ]
      global.fetch = async () => {
        throw new Error('zero-peer sports torrents should be suppressed before payload fetch')
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'sports',
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

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4i1 zero-peer supplemental sports torrents should not be advertised as playable')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(buildTorrentPayload([]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'sports',
        customPackedId({
          t: 'Sports RS 2026 Home Club vs Away Club 28 03 720pEN60fps FDSN',
          n: 'Home Club vs Away Club',
          h: matchedTorrent().hash,
          l: 'https://tracker.example/download/home-away-zero-files.torrent',
          s: 3_600_000_000,
          d: 7,
          p: '2026-03-28',
          o: 'Home Club',
          w: 'Away Club'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4i2 direct sports torrents with no playable files should be inspected and hidden even when an infohash is embedded')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      assert.match(String(result.streams[0]?.description || ''), /READY/i, '#4j completed direct-video stream description should replace queue-and-buffer with ready')
      assert.match(String(result.streams[0]?.description || ''), /Source: Host PC/i, '#4j completed direct-video stream description should say the host PC already has the file')
      assert.match(String(result.streams[0]?.description || ''), /\| MP4 \|/i, '#4j completed direct-video stream description should surface the file format')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
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
      delete process.env.PVTKRRX_HOSTED_RELAY
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
            infohash: '',
            indexer: 'sportscult'
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

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async (_query, _cats, _type, options = {}) => {
        const sportscult = trackerItem({
          title: 'MotoGP 2026 Round04 Spain Jerez Practice WEB DL 1080p H264 English MWR',
          link: 'https://tracker.example/download/motogp-sportscult.torrent',
          infohash: '',
          indexer: 'SportsCult',
          seeders: 16
        })
        if (options.useCategories) return [sportscult]
        return [
          sportscult,
          trackerItem({
            title: 'MotoGP 2026 Round04 Spain Jerez Practice WEB-DL 1080p H264 English-MWR',
            link: 'https://tracker.example/download/motogp-torrentleech.torrent',
            infohash: '',
            indexer: 'TorrentLeech',
            seeders: 8
          }),
          trackerItem({
            title: 'MotoGP 2026 Round04 Spain Jerez Practice WEB-DL 1080p H264 English-MWR',
            link: 'https://tracker.example/download/motogp-torrenting.torrent',
            infohash: '',
            indexer: 'Torrenting',
            seeders: 2
          })
        ]
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'MotoGP.2026.Round04.Spain.Jerez.Practice.1080p.mkv', length: 3_100_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'sports',
        customPackedId({
          t: 'MotoGP 2026 Round04 Spain Jerez Practice WEB DL 1080p H264 English MWR',
          n: 'MotoGP 2026 Round04 Spain Jerez Practice',
          h: '',
          l: 'https://tracker.example/download/motogp-sportscult.torrent',
          i: 'SportsCult',
          r: 'motorsport'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackLinks = result.streams
        .filter(stream => /\/playback\//.test(String(stream?.url || '')))
        .map(stream => String(decodeOpaquePlaybackState(stream?.url || '')?.l || ''))
      assert.equal(playbackLinks.length, 1, '#4m sports streams should stay category-constrained after sports stream hygiene')
      assert.ok(playbackLinks.includes('https://tracker.example/download/motogp-sportscult.torrent'), '#4m keeps the original SportsCult source')
      assert.ok(!playbackLinks.includes('https://tracker.example/download/motogp-torrentleech.torrent'), '#4m does not add broad TorrentLeech sports source')
      assert.ok(!playbackLinks.includes('https://tracker.example/download/motogp-torrenting.torrent'), '#4m does not add broad Torrenting sports source')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      clearSportsAvailabilityAnchors()
      const anchorKey = setSportsAvailabilityAnchor({
        title: 'Premier.League.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-SC',
        link: 'https://tracker.example/download/arsenal-chelsea-sportscult.torrent',
        infohash: '',
        size: 4_200_000_000,
        seeders: 34,
        indexer: 'sportscult',
        pubDate: '2026-03-15T19:00:00Z',
        sportHint: 'football'
      })
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Premier.League.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-SC.mkv', length: 4_200_000_000 }
      ]))
      resolvedSportsAnchorKey = anchorKey
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customSportsId({
          q: 'resolved',
          x: 'sportsmeta:event:football|2026-03-15|premier-league|arsenal|chelsea',
          ak: resolvedSportsAnchorKey
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 1, '#4m resolved sports ids should reattach to the original SportsCult tracker availability')
      const playbackState = decodeOpaquePlaybackState(result.streams[0]?.url || '')
      assert.equal(String(playbackState?.l || ''), 'https://tracker.example/download/arsenal-chelsea-sportscult.torrent', '#4m resolved sports ids should keep playback tied to the originating SportsCult torrent')
      assert.ok(result.streams.every(stream => String(stream?.name || '').startsWith('PVTKRRX ') || !stream?.name), '#4m anchored sports streams should keep the addon-prefixed stream naming')

      setSportsAvailabilityCanonicalAnchor('sportsmeta:event:football|2026-03-15|premier-league|arsenal|chelsea', resolvedSportsAnchorKey)
      const canonicalResult = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'sportsmeta:event:football|2026-03-15|premier-league|arsenal|chelsea',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(canonicalResult.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 1, '#4m canonical SportsMeta ids should recover the original SportsCult tracker availability')
      const canonicalPlaybackState = decodeOpaquePlaybackState(canonicalResult.streams[0]?.url || '')
      assert.equal(String(canonicalPlaybackState?.l || ''), 'https://tracker.example/download/arsenal-chelsea-sportscult.torrent', '#4m canonical SportsMeta ids should keep playback tied to the originating SportsCult torrent')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      clearSportsAvailabilityAnchors()
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => [
        trackerItem({
          title: 'Premier.League.2026.03.15.Arsenal.vs.Chelsea.1080p.WEB.h264-GENERAL',
          link: 'https://tracker.example/download/arsenal-chelsea-general.torrent',
          infohash: '',
          indexer: 'GeneralTracker',
          pubDate: '2026-03-15T20:00:00Z'
        })
      ]
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Premier.League.2026.03.15.Arsenal.vs.Chelsea.1080p.WEB.h264-GENERAL.mkv', length: 4_100_000_000 }
      ]))
    }, async () => {
      const withoutAnchor = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customSportsId({
          q: 'ambiguous'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(withoutAnchor.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 1, '#4n matching sports search results should surface without requiring a SportsCult anchor')

      const anchorKey = setSportsAvailabilityAnchor({
        title: 'Premier.League.2026.03.15.Arsenal.vs.Chelsea.1080p.HDTV.x264-SC',
        link: 'https://tracker.example/download/arsenal-chelsea-sportscult.torrent',
        infohash: '',
        size: 4_200_000_000,
        seeders: 34,
        indexer: 'sportscult',
        pubDate: '2026-03-15T19:00:00Z',
        sportHint: 'football'
      })

      const withResolvedAnchor = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        customSportsId({
          q: 'resolved',
          x: 'sportsmeta:event:football|2026-03-15|premier-league|arsenal|chelsea',
          ak: anchorKey
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackStates = withResolvedAnchor.streams
        .filter(stream => /\/playback\//.test(String(stream?.url || '')))
        .map(stream => decodeOpaquePlaybackState(stream?.url || ''))
      const playbackLinks = playbackStates.map((state) => String(state?.l || ''))

      assert.ok(playbackLinks.includes('https://tracker.example/download/arsenal-chelsea-sportscult.torrent'), '#4n resolved anchors should retain the original SportsCult playback source')
      assert.ok(playbackLinks.includes('https://tracker.example/download/arsenal-chelsea-general.torrent'), '#4n non-SportsCult streams may attach alongside the original sports source')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getSeries = async () => ({ name: 'The Curse of Oak Island' })
      ProwlarrClient.prototype.searchImdb = async () => []
      ProwlarrClient.prototype.search = async (query, _cats, _type, options = {}) => {
        if (options.useCategories) throw new Error('Prowlarr HTTP 400')
        if (String(query || '').toLowerCase() === 'oak island') {
          return [
            trackerItem({
              title: 'Oak Island E Il Tesoro Maledetto S12E17 Un mistero lungo 230 anni WEB DL 1080p AAC',
              link: 'https://tracker.example/download/oak-island-s12e17.torrent',
              size: 1_660_000_000,
              seeders: 9,
              indexer: 'TorrentGalaxy'
            })
          ]
        }
        return []
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Oak.Island.E.Il.Tesoro.Maledetto.S12E17.1080p.mkv', length: 1_660_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'series',
        'tt3455408:12:17',
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackLinks = result.streams
        .filter(stream => /\/playback\//.test(String(stream?.url || '')))
        .map(stream => String(decodeOpaquePlaybackState(stream?.url || '')?.l || ''))
      assert.ok(playbackLinks.includes('https://tracker.example/download/oak-island-s12e17.torrent'), '#4o localized TV episode fallback should survive category 400 and still emit PVTKRRX playback')
      assert.ok(result.streams.every(stream => String(stream?.name || '').startsWith('PVTKRRX ') || !stream?.name), '#4o localized TV streams should keep PVTKRRX source naming')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getSeries = async () => ({ name: 'The Curse of Oak Island' })
      ProwlarrClient.prototype.searchImdb = async () => []
      const broadQueries = []
      ProwlarrClient.prototype.search = async (query, _cats, _type, options = {}) => {
        if (!options.useCategories) broadQueries.push(String(query || ''))
        return []
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Oak.Island.S12E20.1080p.mkv', length: 1_660_000_000 }
      ]))
      global.__pvtkrrxBroadQueries = broadQueries
    }, async () => {
      await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'series',
        'tt3455408:12:20',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(global.__pvtkrrxBroadQueries[0], 'The Curse of Oak Island S12E20', '#4o1 TV title fallback should try the exact episode marker before broad title-only searches')
      delete global.__pvtkrrxBroadQueries
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      ProwlarrClient.prototype.searchImdb = async () => [
        trackerItem({
          title: 'Movie Name 2026 DVDRip XviD AVI',
          link: 'https://tracker.example/download/movie-name-xvid.torrent',
          size: 900_000_000,
          seeders: 9
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => {
        throw new Error('legacy AVI title should be suppressed before tracker payload fetch')
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4o3 legacy AVI/XviD titles should not emit playback streams')
      assert.ok(findNoticeStream(result.streams, 'legacy-avi-suppressed'), '#4o3 legacy AVI/XviD suppression should be visible as an info row')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      ProwlarrClient.prototype.searchImdb = async () => [
        trackerItem({
          title: 'Movie Name 2026 480p DVDRip',
          link: 'https://tracker.example/download/movie-name-legacy-video.torrent',
          size: 900_000_000,
          seeders: 9
        })
      ]
      ProwlarrClient.prototype.search = async () => []
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'Movie.Name.2026.480p.DVDRip.avi', length: 900_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 0, '#4o4 inspected AVI-only payloads should not emit playback streams')
      assert.ok(findNoticeStream(result.streams, 'legacy-avi-suppressed'), '#4o4 inspected AVI-only payloads should show the AVI hidden notice')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
      ProwlarrClient.prototype.searchImdb = async () => Array.from({ length: 5 }, (_, index) => trackerItem({
        title: `Movie Name 2026 1080p WEB-DL x264 Source ${index}`,
        link: `https://tracker.example/download/movie-name-concurrent-${index}.torrent`,
        seeders: 20 - index
      }))
      ProwlarrClient.prototype.search = async () => []
      let activeFetches = 0
      let maxActiveFetches = 0
      global.fetch = async () => {
        activeFetches += 1
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
        await new Promise(resolve => setTimeout(resolve, 30))
        activeFetches -= 1
        return createFetchResponse(buildTorrentPayload([
          { path: 'Movie.Name.2026.1080p.WEB-DL.x264.mkv', length: 2_000_000_000 }
        ]))
      }
      global.__pvtkrrxMaxActiveFetches = () => maxActiveFetches
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.filter(stream => /\/playback\//.test(String(stream?.url || ''))).length, 5, '#4o5 concurrent tracker inspection should still emit verified playback streams')
      assert.ok(global.__pvtkrrxMaxActiveFetches() > 1, '#4o5 tracker payload inspection should run concurrently instead of serially')
      delete global.__pvtkrrxMaxActiveFetches
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => [
        matchedTorrent({
          hash: '89abcdef012345670123456789abcdef01234567',
          name: 'Oak Island E Il Tesoro Maledetto S12E17 Un mistero lungo 230 anni WEB DL 1080p AAC',
          progress: 1
        })
      ]
      QBitClient.prototype.files = async () => [
        matchedFile({
          name: 'Oak.Island.E.Il.Tesoro.Maledetto.S12E17.1080p.mkv',
          size: 1_660_000_000,
          progress: 1
        })
      ]
      CinemetaClient.prototype.getSeries = async () => ({ name: 'The Curse of Oak Island' })
      ProwlarrClient.prototype.searchImdb = async () => []
      let titleSearchCalls = 0
      ProwlarrClient.prototype.search = async () => {
        titleSearchCalls += 1
        return Array.from({ length: 3 }, (_, index) => trackerItem({
          title: `The Curse of Oak Island S12E17 1080p WEB-DL x264 Alt ${index}`,
          link: `https://tracker.example/download/oak-island-alt-${index}.torrent`,
          seeders: 30 - index
        }))
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'The.Curse.of.Oak.Island.S12E17.1080p.WEB-DL.x264.mkv', length: 1_700_000_000 }
      ]))
      global.__pvtkrrxTitleSearchCalls = () => titleSearchCalls
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'series',
        'tt3455408:12:17',
        'http://127.0.0.1:7000',
        'local'
      )

      const fileStreams = result.streams.filter(stream => /\/file\//.test(String(stream?.url || '')))
      const trackerStreams = result.streams.filter(stream => /\/playback\//.test(String(stream?.url || '')))

      assert.ok(fileStreams.length > 0, '#4o2 qBit title fallback should emit a ready file stream when Prowlarr IMDB search is empty')
      assert.ok(fileStreams.every(stream => String(stream?.name || '').startsWith('PVTKRRX ') || !stream?.name), '#4o2 qBit title fallback should keep PVTKRRX source naming')
      // A local copy answers "can I watch it now", not "what else is out there".
      // It must never cancel the title search, or an already-downloaded episode
      // comes back with one row while an undownloaded one returns twenty.
      assert.ok(global.__pvtkrrxTitleSearchCalls() > 0, '#4o2 a local copy must not cancel the title fallback search')
      assert.ok(trackerStreams.length > 0, '#4o2 tracker alternatives should be offered alongside the already-downloaded copy')
      assert.ok(/\/file\//.test(String(result.streams[0]?.url || '')), '#4o2 the already-downloaded copy should rank first')
      delete global.__pvtkrrxTitleSearchCalls
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      QBitClient.prototype.torrents = async () => []
      QBitClient.prototype.files = async () => []
      ProwlarrClient.prototype.search = async () => [
        trackerItem({
          title: 'MotoGP 2026 Round03 USA Race WEB DL 1080p H264 English MWR',
          link: 'https://tracker.example/download/motogp-usa-race.torrent',
          indexer: 'TorrentLeech',
          seeders: 200
        }),
        trackerItem({
          title: 'MotoGP 2026 Round04 Spain Jerez Sprint WEB-DL 1080p H264 English-MWR',
          link: 'https://tracker.example/download/motogp-spain-sprint-mirror.torrent',
          indexer: 'TorrentLeech',
          seeders: 12
        })
      ]
      global.fetch = async (url) => {
        const target = String(url || '')
        const path = target.includes('usa-race')
          ? 'MotoGP.2026.Round03.USA.Race.1080p.mkv'
          : target.includes('mirror')
            ? 'MotoGP.2026.Round04.Spain.Jerez.Sprint.Mirror.1080p.mkv'
            : 'MotoGP.2026.Round04.Spain.Jerez.Sprint.1080p.mkv'
        return createFetchResponse(buildTorrentPayload([
          { path, length: 3_100_000_000 }
        ]))
      }
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'sports',
        customPackedId({
          t: 'MotoGP 2026 Round04 Spain Jerez Sprint WEB DL 1080p H264 English MWR',
          n: 'Spain Sprint Race',
          h: '',
          l: 'https://tracker.example/download/motogp-spain-sprint.torrent',
          i: 'SportsCult',
          r: 'motorsport'
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackLinks = result.streams
        .filter(stream => /\/playback\//.test(String(stream?.url || '')))
        .map(stream => String(decodeOpaquePlaybackState(stream?.url || '')?.l || ''))
      assert.ok(playbackLinks.includes('https://tracker.example/download/motogp-spain-sprint.torrent'), '#4p selected MotoGP source should stay present')
      assert.ok(playbackLinks.includes('https://tracker.example/download/motogp-spain-sprint-mirror.torrent'), '#4p same-event MotoGP mirror should stay present')
      assert.ok(!playbackLinks.includes('https://tracker.example/download/motogp-usa-race.torrent'), '#4p different MotoGP event/session should not attach just because it has more seeders')
    })

    await withScenario(async () => {
      delete process.env.PVTKRRX_HOSTED_RELAY
      clearSportsAvailabilityAnchors()
      const selectedHash = '5210cbc4b81a59e14b61f87e89af6e5cc8576b64'
      const wrongLocalHash = 'b176088dfb0b58cb59a1a5148f122d13347b2039'
      resolvedSportsAnchorKey = setSportsAvailabilityAnchor({
        title: 'MotoGP 2026 Round04 Spain Jerez Sprint TNT WEB DL 1080p H264 DDP5 1 English MWR',
        link: 'https://tracker.example/download/motogp-spain-sprint-selected.torrent',
        infohash: selectedHash,
        size: 3_600_000_000,
        seeders: 14,
        indexer: 'SportsCult',
        pubDate: '2026-04-25T12:00:00Z',
        sportHint: 'motorsport'
      })
      QBitClient.prototype.torrents = async () => [
        matchedTorrent({
          hash: wrongLocalHash,
          name: 'MotoGP 2026 Round04 Spain Jerez Sprint TNT WEB DL 1080p H264 DDP5 1 English MWR',
          progress: 1
        })
      ]
      QBitClient.prototype.files = async () => {
        throw new Error('wrong qBit title match should not be inspected')
      }
      ProwlarrClient.prototype.search = async () => {
        throw new Error('resolved hash-backed sports anchors should not wait for supplemental search')
      }
      global.fetch = async () => createFetchResponse(buildTorrentPayload([
        { path: 'MotoGP.2026.Round04.Spain.Jerez.Sprint.Selected.1080p.mkv', length: 3_600_000_000 }
      ]))
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'sports',
        customSportsId({
          q: 'resolved',
          x: 'sportsmeta:event:motorsport|2026-04-25|motogp|spain-sprint-race',
          ak: resolvedSportsAnchorKey,
          r: 'motorsport',
          e: '2026-04-25',
          u: 'MotoGP',
          o: '',
          w: ''
        }),
        'http://127.0.0.1:7000',
        'local'
      )

      const playbackLinks = result.streams
        .filter(stream => /\/playback\//.test(String(stream?.url || '')))
        .map(stream => String(decodeOpaquePlaybackState(stream?.url || '')?.l || ''))
      assert.deepEqual(playbackLinks, ['https://tracker.example/download/motogp-spain-sprint-selected.torrent'], '#4q explicit hash-backed sports anchors should keep the selected source and skip wrong qBit title matches')
      assert.equal(result.streams.filter(stream => /\/file\//.test(String(stream?.url || ''))).length, 0, '#4q wrong local qBit title matches must not emit ready-file playback')
    })

    console.log('Smoke stream pipeline passed')
  } finally {
    resetMocks()
    clearSportsAvailabilityAnchors()
    if (originalHostedRelay === undefined) delete process.env.PVTKRRX_HOSTED_RELAY
    else process.env.PVTKRRX_HOSTED_RELAY = originalHostedRelay
    if (originalExperimentalRar === undefined) delete process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS
    else process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS = originalExperimentalRar
    if (originalNativeStremioTorrent === undefined) delete process.env.PVTKRRX_NATIVE_STREMIO_TORRENT
    else process.env.PVTKRRX_NATIVE_STREMIO_TORRENT = originalNativeStremioTorrent
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
