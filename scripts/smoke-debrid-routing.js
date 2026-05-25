'use strict'

const assert = require('node:assert/strict')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'debrid-routing-smoke-secret-12345678901234567890'
process.env.PVTKRRX_OPAQUE_STATE_SECRET = process.env.PVTKRRX_OPAQUE_STATE_SECRET || process.env.ENCRYPTION_SECRET

const {
  applyV13Routing,
  _buildMagnetFromHash,
  _tryExtractDebridMetaFromStreamUrl,
  _buildDebridPlaybackUrl,
  _resolveEnabledCacheSources,
  _prioritizeProviderForCacheSource
} = require('../src/utils/streamRouter')
const { _clearDebridCacheMemo } = require('../src/utils/debridCache')
const { encodeFileStateToken, encodePlaybackStateToken, decodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT } = require('../src/utils/opaqueState')

const PLAYBACK_BASE = 'https://example.test'
const CONFIG_TOKEN = 'cfgtoken123'
const SAMPLE_HASH = 'abcdef0123456789abcdef0123456789abcdef01'

let checks = 0
function check(label, fn) {
  return Promise.resolve(fn()).then(() => {
    checks++
    console.log(`  PASS ${label}`)
  })
}

function makeQbitStream(label = 'On Seedbox', title = 'sample 1080p') {
  const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
  return { name: label, title, url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }
}

function makeQbitFileStream(label = 'On Seedbox', title = '') {
  const token = encodeFileStateToken({ h: SAMPLE_HASH, p: 'completed/m.mkv' })
  return { name: label, title, url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/file/${token}` }
}

function makePmCacheMissSource(apiKey = 'pmkey') {
  return {
    type: 'pm',
    apiKey,
    enabled: true,
    source: {
      id: 'pm',
      async searchByHash() {
        return null
      },
      async searchByTitle() {
        return []
      }
    }
  }
}

async function run() {
  console.log('[smoke-debrid-routing] start')

  await check('buildMagnetFromHash builds a valid magnet', () => {
    const m = _buildMagnetFromHash(SAMPLE_HASH, 'Sample Title')
    assert.match(m, /^magnet:\?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=/)
  })

  await check('buildMagnetFromHash rejects garbage hash', () => {
    assert.equal(_buildMagnetFromHash('not-a-hash', 'x'), null)
  })

  await check('buildDebridPlaybackUrl can scope playback under the config route', () => {
    const magnet = _buildMagnetFromHash(SAMPLE_HASH, 'Sample')
    const url = _buildDebridPlaybackUrl(PLAYBACK_BASE, [{ type: 'pm', apiKey: 'pmkey' }], {
      src: magnet,
      name: 'Sample',
      protocol: DEBRID_PROTOCOL_TORRENT,
      configToken: CONFIG_TOKEN
    })
    assert.ok(url.startsWith(`${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/debrid/`))
  })

  await check('tryExtractDebridMetaFromStreamUrl decodes a playback token', () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'movie.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}`
    const meta = _tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN)
    assert.ok(meta)
    assert.equal(meta.hash, SAMPLE_HASH)
    assert.equal(meta.name, 'movie.mkv')
  })

  await check('tryExtractDebridMetaFromStreamUrl preserves original torrent download URL', () => {
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=sportscult-123&apikey=secret'
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: torrentUrl, p: 'match.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}`
    const meta = _tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN)
    assert.ok(meta)
    assert.equal(meta.link, torrentUrl)

    const debridUrl = _buildDebridPlaybackUrl(PLAYBACK_BASE, [{ type: 'pm', apiKey: 'pmkey' }], {
      src: meta.link,
      name: 'SportsCult match',
      protocol: DEBRID_PROTOCOL_TORRENT
    })
    const decoded = decodeDebridPlaybackToken(debridUrl.slice(`${PLAYBACK_BASE}/playback/debrid/`.length))
    assert.equal(decoded.src, torrentUrl)
  })

  await check('tryExtractDebridMetaFromStreamUrl decodes a file token', () => {
    const token = encodeFileStateToken({ h: SAMPLE_HASH, p: 'completed/movie.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/file/${token}`
    const meta = _tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN)
    assert.ok(meta)
    assert.equal(meta.hash, SAMPLE_HASH)
    assert.equal(meta.link, '')
    assert.equal(meta.name, 'completed/movie.mkv')
  })

  await check('tryExtractDebridMetaFromStreamUrl returns null for /playback/debrid/ URLs (avoid rewrite loop)', () => {
    const url = `${PLAYBACK_BASE}/playback/debrid/sometoken`
    assert.equal(_tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN), null)
  })

  await check('buildDebridPlaybackUrl encodes a torrent token', () => {
    const magnet = _buildMagnetFromHash(SAMPLE_HASH, 'Sample')
    const url = _buildDebridPlaybackUrl(PLAYBACK_BASE, [{ type: 'rd', apiKey: 'k1' }], {
      src: magnet, name: 'Sample', protocol: DEBRID_PROTOCOL_TORRENT
    })
    assert.ok(url.startsWith(`${PLAYBACK_BASE}/playback/debrid/`))
    const token = url.slice(`${PLAYBACK_BASE}/playback/debrid/`.length)
    const decoded = decodeDebridPlaybackToken(token)
    assert.equal(decoded.protocol, DEBRID_PROTOCOL_TORRENT)
    assert.equal(decoded.src, magnet)
    assert.equal(decoded.providers[0].type, 'rd')
    assert.equal(decoded.providers[0].apiKey, 'k1')
  })

  await check('Premiumize debrid key implicitly enables PM cache check', () => {
    const sources = _resolveEnabledCacheSources(
      { sources: [] },
      [{ type: 'pm', apiKey: 'pmkey', enabled: true }]
    )
    assert.equal(sources.length, 1)
    assert.equal(sources[0].type, 'pm')
    assert.equal(sources[0].apiKey, 'pmkey')
    assert.equal(sources[0].enabled, true)
  })

  await check('PM cache hit prioritizes the PM provider', () => {
    const providers = _prioritizeProviderForCacheSource('pm', [
      { type: 'rd', apiKey: 'rdkey' },
      { type: 'pm', apiKey: 'pmkey' }
    ])
    assert.equal(providers[0].type, 'pm')
    assert.equal(providers[1].type, 'rd')
  })

  await check('PM cache hit by infohash appears before debrid downloader and qBit fallback', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'sports match')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: {
          providers: [
            { type: 'rd', apiKey: 'rdkey', enabled: true },
            { type: 'pm', apiKey: 'pmkey', enabled: true }
          ],
          preferDebridOverSeedbox: true
        },
        cacheSearch: {
          sources: [{
            type: 'pm',
            apiKey: 'pmkey',
            enabled: true,
            source: {
              id: 'pm',
              async searchByHash(infohash) {
                assert.equal(infohash, SAMPLE_HASH)
                return {
                  sourceId: 'pm',
                  name: 'cached sports match',
                  infohash,
                  directStreamUrl: null
                }
              },
              async searchByTitle() {
                return []
              }
            }
          }]
        }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:test'
    })
    assert.equal(result.streams.length, 3)
    assert.match(result.streams[0].name, /READY/)
    assert.match(result.streams[0].url, /\/playback\/debrid\//)
    const token = result.streams[0].url.split('/playback/debrid/')[1]
    const decoded = decodeDebridPlaybackToken(token)
    assert.equal(decoded.providers[0].type, 'pm')
    assert.match(result.streams[1].url, /\/playback\/debrid\//, 'uncached downloader second')
    assert.equal(result.streams[2].name, 'On Seedbox')
    _clearDebridCacheMemo()
  })

  await check('SPORTS + no debrid → qBit streams pass through UNCHANGED (qBit is the backup)', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'football 1080p')] }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:premier-league:2026-05-23:arsenal-vs-chelsea'
    })
    assert.equal(result.streams.length, 1)
    assert.equal(result.streams[0].name, 'On Seedbox')
  })

  await check('SPORTS + debrid linked → debrid ADDED above qBit, qBit STAYS as backup', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'football 1080p')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'rd', apiKey: 'k1', enabled: true }], preferDebridOverSeedbox: true },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:premier-league:2026-05-23:arsenal-vs-chelsea'
    })
    // ADDITIVE: 2 streams — debrid first, original qBit kept below as fallback
    assert.equal(result.streams.length, 2, 'should have both debrid and qBit streams')
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid first')
    assert.ok(result.streams[0].url.startsWith(`${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/debrid/`))
    assert.match(result.streams[0].name, /^⬇ RD/)
    assert.equal(result.streams[1].name, 'On Seedbox', 'qBit backup kept underneath')
    assert.doesNotMatch(result.streams[1].url, /\/playback\/debrid\//)
  })

  await check('MOVIE + no debrid → qBit unchanged (v1.2 passthrough)', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'movie 1080p')], cacheMaxAge: 60 }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678'
    })
    assert.equal(result.streams.length, 1)
    assert.equal(result.streams[0].name, 'On Seedbox')
    assert.equal(result.cacheMaxAge, 60)
  })

  await check('MOVIE + debrid linked → debrid ADDED above qBit, qBit STAYS', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'movie 1080p')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'rd', apiKey: 'k1', enabled: true }], preferDebridOverSeedbox: true },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678'
    })
    assert.equal(result.streams.length, 2)
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid first')
    assert.equal(result.streams[1].name, 'On Seedbox', 'qBit kept as fallback')
  })

  await check('completed /file/ stream + debrid linked starts debrid before qBit fallback', async () => {
    const baseResult = { streams: [makeQbitFileStream('PVTKRRX [SERVER] AUTO MKV')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'pm', apiKey: 'pmkey', enabled: true }], preferDebridOverSeedbox: true },
        cacheSearch: { sources: [makePmCacheMissSource()] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:nba'
    })
    assert.equal(result.streams.length, 2)
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid downloader first')
    assert.match(result.streams[0].name, /^⬇ PM/)
    assert.match(result.streams[1].url, /\/file\//, 'ready qBit file remains fallback')
  })

  await check('preferDebridOverSeedbox=false still keeps debrid first', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'movie 1080p')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'rd', apiKey: 'k1', enabled: true }], preferDebridOverSeedbox: false },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678'
    })
    assert.equal(result.streams.length, 2)
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid first')
    assert.equal(result.streams[1].name, 'On Seedbox', 'qBit fallback second')
  })

  await check('TV episode + debrid + multiple qBit streams → debrid added for each, qBit ALL preserved', async () => {
    const baseResult = {
      streams: [
        makeQbitStream('On Seedbox 1080p', 'S01E05 1080p'),
        makeQbitStream('On Seedbox 720p', 'S01E05 720p')
      ]
    }
    // Add a second hash variant so dedup doesn't collapse
    const token2 = encodePlaybackStateToken({ h: '1111111111111111111111111111111111111111', l: '', p: 'ep2.mkv' })
    baseResult.streams[1].url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token2}`

    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'pm', apiKey: 'pmkey', enabled: true }], preferDebridOverSeedbox: true },
        cacheSearch: { sources: [makePmCacheMissSource()] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678:1:5'
    })
    // 2 debrid + 2 qBit = 4 total (additive, qBit ALL kept)
    assert.equal(result.streams.length, 4)
    assert.match(result.streams[0].url, /\/playback\/debrid\//)
    assert.match(result.streams[1].url, /\/playback\/debrid\//)
    assert.match(result.streams[2].name, /Seedbox/, 'first qBit kept')
    assert.match(result.streams[3].name, /Seedbox/, 'second qBit kept')
  })

  await check('install without ANY v1.3 config is unchanged (backward compat)', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}`
    const baseResult = { streams: [{ name: 'On Seedbox', title: 'Movie', url }], cacheMaxAge: 60 }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678'
    })
    assert.equal(result.streams.length, 1)
    assert.equal(result.streams[0].url, url)
    assert.equal(result.cacheMaxAge, 60)
  })

  await check('disabled debrid providers are NOT used (qBit-only behavior preserved)', async () => {
    const baseResult = { streams: [makeQbitStream()] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'rd', apiKey: 'k1', enabled: false }] },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678'
    })
    assert.equal(result.streams.length, 1)
    assert.doesNotMatch(result.streams[0].url, /\/playback\/debrid\//)
  })

  await check('SPORTS + debrid + empty existing streams → still empty (no debrid streams to derive)', async () => {
    const result = await applyV13Routing(
      { streams: [] },
      {
        config: {
          debrid: { providers: [{ type: 'pm', apiKey: 'k', enabled: true }] },
          cacheSearch: { sources: [] }
        },
        addonUrl: PLAYBACK_BASE,
        playbackBaseUrl: PLAYBACK_BASE,
        configToken: CONFIG_TOKEN,
        id: 'sportsmeta:test'
      }
    )
    assert.deepEqual(result.streams, [])
  })

  console.log(`[smoke-debrid-routing] PASS (${checks} checks)`)
}

run().catch((err) => {
  console.error(`[smoke-debrid-routing] FAIL: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
})
