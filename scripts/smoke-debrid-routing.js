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
const { handleDebridPlayback, _clearDebridPlaybackJobs } = require('../src/handlers/playbackDebrid')
const { encodeFileStateToken, encodePlaybackStateToken, decodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT } = require('../src/utils/opaqueState')
const { validateTorrentPayload, inspectTorrentPayload } = require('../src/utils/torrentPayload')

const PLAYBACK_BASE = 'https://example.test'
const CONFIG_TOKEN = 'cfgtoken123'
const SAMPLE_HASH = 'abcdef0123456789abcdef0123456789abcdef01'

function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(String(value.length)), Buffer.from(':'), value])
  if (value instanceof Uint8Array) return bencode(Buffer.from(value))
  if (typeof value === 'string') return bencode(Buffer.from(value, 'utf8'))
  if (typeof value === 'number') return Buffer.from(`i${value}e`)
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')])
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

function buildTorrentPayload(fileName = 'test.mp4', length = 12345) {
  return bencode({
    info: {
      length,
      name: fileName
    }
  })
}

let checks = 0
function check(label, fn) {
  return Promise.resolve(fn()).then(() => {
    checks++
    console.log(`  PASS ${label}`)
  })
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    redirected: null,
    headersSent: false,
    setHeader() {},
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; this.headersSent = true; return this },
    redirect(status, url) { this.redirected = { status, url }; this.headersSent = true; return this }
  }
}

function makeQbitStream(label = 'On Seedbox', title = 'sample 1080p') {
  const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
  return { name: label, title, url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }
}

function makeQbitFileStream(label = 'On Seedbox', title = '') {
  const token = encodeFileStateToken({ h: SAMPLE_HASH, p: 'completed/m.mkv' })
  return { name: label, title, url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/file/${token}` }
}

function withBehaviorHints(stream, behaviorHints = {}) {
  return {
    ...stream,
    behaviorHints: {
      ...(stream.behaviorHints || {}),
      ...behaviorHints
    }
  }
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
    assert.equal(meta.playbackToken, token)
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

  await check('SPORTS PM cache hit appears before qBit without uncached debrid handoff', async () => {
    const baseResult = { streams: [makeQbitStream('On Seedbox', 'sports match')] }
    const originalPlaybackToken = baseResult.streams[0].url.split('/playback/')[1]
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
                  name: 'cached sports match 1080p.mkv',
                  infohash,
                  sizeBytes: 2_800_000_000,
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
    assert.equal(result.streams.length, 2)
    assert.match(result.streams[0].name, /READY/)
    assert.doesNotMatch(result.streams[0].name, /Premiumize/)
    assert.match(result.streams[0].description, /cached sports match 1080p\.mkv/)
    assert.match(result.streams[0].description, /READY \| 1080P \| 2\.8 GB \| MKV \| Premiumize/)
    assert.match(result.streams[0].thumbnail, /logo\.png$/)
    assert.match(result.streams[0].url, /\/playback\/debrid\//)
    const token = result.streams[0].url.split('/playback/debrid/')[1]
    const decoded = decodeDebridPlaybackToken(token)
    assert.equal(decoded.providers[0].type, 'pm')
    assert.equal(decoded.qbitFallback?.token, originalPlaybackToken, 'READY row must retain the exact qBit takeover token')
    assert.equal(result.streams[1].name, 'On Seedbox')

    const { _clearAccountIndexCache } = require('../src/clients/debrid/realdebrid')
    _clearDebridPlaybackJobs()
    _clearAccountIndexCache()
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      const target = String(url)
      if (target.endsWith('/transfer/create')) {
        return new Response(JSON.stringify({ status: 'error', message: 'blocked' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (/\/torrents\?/.test(target)) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (target.endsWith('/torrents/addMagnet')) {
        return new Response(JSON.stringify({ error: 'blocked', error_code: 35 }), {
          status: 451,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`Unexpected READY fallback fetch: ${target}`)
    }
    try {
      const res = createMockRes()
      await handleDebridPlayback({ params: { config: CONFIG_TOKEN, token } }, res)
      assert.deepEqual(res.redirected, {
        status: 302,
        url: `/${CONFIG_TOKEN}/playback/${encodeURIComponent(originalPlaybackToken)}`
      })
    } finally {
      globalThis.fetch = originalFetch
      _clearDebridPlaybackJobs()
      _clearAccountIndexCache()
    }
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

  await check('SPORTS + debrid linked defaults to qBit when source is uncached', async () => {
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
    assert.equal(result.streams.length, 1, 'uncached sports debrid handoff should not be offered as a play row')
    assert.doesNotMatch(result.streams[0].url, /\/playback\/debrid\//, 'qBit first')
    assert.equal(result.streams[0].name, 'On Seedbox', 'qBit/seedbox remains the playable sports path')
  })

  await check('SPORTS + explicit uncached debrid opt-in still adds debrid above qBit', async () => {
    const baseResult = {
      streams: [{
        ...makeQbitStream('On Seedbox', 'football 1080p'),
        description: 'football 1080p\nDL | 1080P | 5.7 GB | TKR: SportsCult'
      }]
    }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: {
          providers: [{ type: 'rd', apiKey: 'k1', enabled: true }],
          preferDebridOverSeedbox: true,
          allowUncachedSportsHandoff: true
        },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:premier-league:2026-05-23:arsenal-vs-chelsea'
    })
    assert.equal(result.streams.length, 2, 'explicit opt-in should preserve old additive behavior')
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid first')
    assert.ok(result.streams[0].url.startsWith(`${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/debrid/`))
    assert.match(result.streams[0].description, /^RD DEBRID\nfootball 1080p\nDL \| 1080P/m, 'debrid provider must be visible in Stremio description text')
    assert.match(result.streams[0].name, /^⬇ RD/)
    assert.equal(result.streams[1].name, 'On Seedbox', 'qBit backup kept underneath')
  })

  await check('SPORTS local install hides zero-peer tracker rows before playback', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitStream('PVTKRRX [PC] 1080p', 'zero peer sports'), {
        sourceMode: 'tracker',
        sourceSeeders: 0,
        sourceSize: 4_200_000_000
      })]
    }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: 'local',
      id: 'sportsmeta:nba'
    })
    assert.deepEqual(result.streams, [])
  })

  await check('SPORTS seedbox install hides zero-peer buffering rows before playback', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitStream('PVTKRRX [SERVER] 1080p', 'zero peer sports'), {
        sourceMode: 'buffering',
        sourceSeeders: 0,
        sourceSize: 4_200_000_000
      })]
    }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:nba'
    })
    assert.deepEqual(result.streams, [])
  })

  await check('SPORTS ready seedbox files stay visible even with zero current peers', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitFileStream('PVTKRRX [SERVER] AUTO MKV'), {
        sourceMode: 'seedbox',
        sourceSeeders: 0,
        sourceSize: 4_200_000_000
      })]
    }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:nba'
    })
    assert.equal(result.streams.length, 1)
    assert.match(result.streams[0].url, /\/file\//)
  })

  await check('SPORTS PM cache hit stays visible while zero-peer intermediate rows are hidden', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitStream('PVTKRRX [SERVER] 1080p', 'zero peer cached sports'), {
        sourceMode: 'tracker',
        sourceSeeders: 0,
        sourceSize: 4_200_000_000
      })]
    }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'pm', apiKey: 'pmkey', enabled: true }], preferDebridOverSeedbox: true },
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
                  name: 'cached zero peer sports.mkv',
                  infohash,
                  sizeBytes: 4_200_000_000,
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
      id: 'sportsmeta:nba'
    })
    assert.equal(result.streams.length, 1)
    assert.match(result.streams[0].name, /READY/)
    assert.match(result.streams[0].description, /READY \| 4\.2 GB \| MKV \| Premiumize/)
    assert.match(result.streams[0].thumbnail, /logo\.png$/)
    assert.equal(result.streams[0].behaviorHints.sourceMode, 'debrid-cache')
    assert.equal(result.streams[0].behaviorHints.sourceOriginLabel, 'Premiumize')
    assert.equal(result.streams[0].behaviorHints.proxyHeaders?.response?.['Content-Type'], 'video/x-matroska')
    _clearDebridCacheMemo()
  })

  await check('SPORTS hides zero-size intermediate rows when cache misses', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitStream('PVTKRRX [SERVER] 1080p', 'zero file sports'), {
        sourceMode: 'tracker',
        sourceSeeders: 9,
        sourceSize: 0
      })]
    }
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
    assert.deepEqual(result.streams, [])
  })

  await check('MOVIE zero-peer routing remains unchanged by sports-only guard', async () => {
    const baseResult = {
      streams: [withBehaviorHints(makeQbitStream('PVTKRRX [SERVER] 1080p', 'movie'), {
        sourceMode: 'tracker',
        sourceSeeders: 0,
        sourceSize: 0
      })]
    }
    const result = await applyV13Routing(baseResult, {
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678',
      type: 'movie'
    })
    assert.equal(result.streams.length, 1)
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
    const debridToken = result.streams[0].url.split('/playback/debrid/')[1]
    const decoded = decodeDebridPlaybackToken(debridToken)
    assert.ok(decoded.qbitFallback?.token, 'debrid row must retain its exact qBit takeover token')
    assert.match(decoded.qbitFallback.configDigest, /^[a-f0-9]{64}$/)
    assert.equal(result.streams[1].name, 'On Seedbox', 'qBit kept as fallback')
  })

  await check('SPORTS completed /file/ stream + PM cache miss keeps qBit file only', async () => {
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
    assert.equal(result.streams.length, 1)
    assert.match(result.streams[0].url, /\/file\//, 'ready qBit file remains available')
    assert.doesNotMatch(result.streams[0].url, /\/playback\/debrid\//)
  })

  await check('MOVIE completed /file/ stream + debrid linked still starts debrid before qBit fallback', async () => {
    const baseResult = { streams: [makeQbitFileStream('PVTKRRX [SERVER] AUTO MKV')] }
    const result = await applyV13Routing(baseResult, {
      config: {
        debrid: { providers: [{ type: 'pm', apiKey: 'pmkey', enabled: true }], preferDebridOverSeedbox: true },
        cacheSearch: { sources: [makePmCacheMissSource()] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'tt12345678',
      type: 'movie'
    })
    assert.equal(result.streams.length, 2)
    assert.match(result.streams[0].url, /\/playback\/debrid\//, 'debrid downloader first')
    const decoded = decodeDebridPlaybackToken(result.streams[0].url.split('/playback/debrid/')[1])
    assert.equal(decoded.qbitFallback, undefined, 'completed file rows must never become qBit add fallbacks')
    assert.match(result.streams[0].name, /^⬇ PM/)
    assert.match(result.streams[1].url, /\/file\//, 'ready qBit file remains fallback')
  })

  await check('preferDebridOverSeedbox=false puts seedbox/base first, debrid second', async () => {
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
    assert.equal(result.streams[0].name, 'On Seedbox', 'seedbox first when preference off')
    assert.match(result.streams[1].url, /\/playback\/debrid\//, 'debrid second when preference off')
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

  // === NEW TARGETED TESTS FOR BAD .torrent PAYLOADS (the core gap in /playback/debrid) ===
  // These would have caught the missing validation before the provider.addTorrentFile call.
  await check('validateTorrentPayload rejects HTML 200 login page (common private tracker 200 response)', () => {
    const bad = Buffer.from('<!DOCTYPE html><html><body>Please log in</body></html>')
    let threw = false
    try { validateTorrentPayload(bad) } catch (e) { threw = e.message.includes('valid torrent') }
    assert.ok(threw, 'should throw on HTML instead of bencoded torrent')
  })

  await check('validateTorrentPayload rejects random invalid bytes', () => {
    const bad = Buffer.from('this is not bencoded at all ' + Math.random())
    let threw = false
    try { validateTorrentPayload(bad) } catch (e) { threw = e.message.includes('valid torrent') }
    assert.ok(threw)
  })

  await check('validateTorrentPayload rejects 403-style error body even if fetch returned 200 (simulated)', () => {
    const bad = Buffer.from('{"error": "forbidden", "reason": "no auth"}')
    let threw = false
    try { validateTorrentPayload(bad) } catch (e) { threw = e.message.includes('valid torrent') }
    assert.ok(threw)
  })

  await check('validateTorrentPayload accepts a minimal valid bencoded torrent (reuses inspect)', () => {
    const good = buildTorrentPayload()
    validateTorrentPayload(good)
    const inspected = inspectTorrentPayload(good)
    assert.match(inspected.infoHash, /^[a-f0-9]{40}$/)
    assert.equal(inspected.files[0]?.name, 'test.mp4')
  })

  // Repeated DL click / dedup note:
  // playbackDebrid.js now keeps an in-memory provider job by provider + source + fileIdx.
  // Repeated clicks on the same /playback/debrid token attach to the existing add/poll job.
  // The streamRouter still dedupes the *emitted stream rows* separately.

  // 503 provider timeout behavior is already implemented in the handler (lines 110-118: sets Retry-After, returns 503 JSON).
  // No test change needed for that path.

  console.log(`[smoke-debrid-routing] PASS (${checks} checks)`)
}

run().catch((err) => {
  console.error(`[smoke-debrid-routing] FAIL: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
})
