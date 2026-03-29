const assert = require('node:assert/strict')

const { ProwlarrClient } = require('../src/clients/prowlarr')
const { QBitClient } = require('../src/clients/qbittorrent')
const { CinemetaClient } = require('../src/clients/cinemeta')
const { handleStream } = require('../src/handlers/stream')
const { buildExternalFileUrl } = require('../src/utils/fileServing')

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

function packedArchiveFiles() {
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

function findNoticeStream(streams, code) {
  return (streams || []).find(stream => String(stream?.behaviorHints?.sourceNoticeCode || '') === code)
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

  try {
    await withScenario(async () => {
      process.env.VERCEL = '1'
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
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
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem()]
      QBitClient.prototype.torrents = async () => []
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
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
      assert.match(String(result.streams[0]?.url || ''), /\/local\/file\//)
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceMode || ''), 'buffering')
    })

    await withScenario(async () => {
      delete process.env.VERCEL
      ProwlarrClient.prototype.searchImdb = async () => [trackerItem({ infohash: matchedTorrent().hash, link: '' })]
      QBitClient.prototype.torrents = async () => [matchedTorrent()]
      QBitClient.prototype.files = async () => packedArchiveFiles()
      CinemetaClient.prototype.getMovie = async () => ({ name: 'Movie Name' })
    }, async () => {
      const result = await handleStream(
        makeBaseConfig({ fileServerUrl: '' }),
        'movie',
        'tt1234567',
        'http://127.0.0.1:7000',
        'local'
      )

      assert.equal(result.streams.length, 1, '#4c matched packed archive should emit a single archive-mode stream')
      assert.ok(Array.isArray(result.streams[0]?.rarUrls), '#4c packed archive stream should expose rarUrls')
      assert.equal(result.streams[0].rarUrls.length, 3, '#4c packed archive stream should include all archive parts and skip the sample clip')
      assert.equal(String(result.streams[0]?.fileMustInclude || ''), '/\\.(mkv|mp4|avi|wmv|ts|m4v)$/i', '#4c packed archive stream should tell Stremio how to find the video inside the archive set')
      assert.equal(String(result.streams[0]?.behaviorHints?.sourceContainer || ''), 'rar', '#4c packed archive stream should advertise archive container type')
      assert.match(String(result.streams[0]?.rarUrls?.[0]?.url || ''), /\/local\/file\//, '#4c packed archive source objects should reuse the local file route')
    })

    console.log('Smoke stream pipeline passed')
  } finally {
    resetMocks()
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  }
}

run().catch((error) => {
  console.error('Smoke stream pipeline failed')
  console.error(error)
  process.exit(1)
})
