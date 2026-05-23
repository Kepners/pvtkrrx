'use strict'

const assert = require('node:assert/strict')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'debrid-routing-smoke-secret-12345678901234567890'
process.env.PVTKRRX_OPAQUE_STATE_SECRET = process.env.PVTKRRX_OPAQUE_STATE_SECRET || process.env.ENCRYPTION_SECRET

const { applyV13Routing, _buildMagnetFromHash, _tryExtractDebridMetaFromStreamUrl, _buildDebridPlaybackUrl } = require('../src/utils/streamRouter')
const { encodePlaybackStateToken, decodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT, DEBRID_PROTOCOL_USENET } = require('../src/utils/opaqueState')

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

async function run() {
  console.log('[smoke-debrid-routing] start')

  await check('buildMagnetFromHash builds a valid magnet', () => {
    const m = _buildMagnetFromHash(SAMPLE_HASH, 'Sample Title')
    assert.match(m, /^magnet:\?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=/)
  })

  await check('buildMagnetFromHash rejects garbage hash', () => {
    assert.equal(_buildMagnetFromHash('not-a-hash', 'x'), null)
  })

  await check('tryExtractDebridMetaFromStreamUrl decodes a playback token', () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'movie.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}`
    const meta = _tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN)
    assert.ok(meta)
    assert.equal(meta.hash, SAMPLE_HASH)
    assert.equal(meta.name, 'movie.mkv')
  })

  await check('tryExtractDebridMetaFromStreamUrl returns null for /file/ URLs', () => {
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/file/somefiletoken`
    assert.equal(_tryExtractDebridMetaFromStreamUrl(url, PLAYBACK_BASE, CONFIG_TOKEN), null)
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

  await check('sports + v1.3-configured but no ENABLED debrid → empty streams (sports rule)', async () => {
    const baseResult = {
      streams: [
        { name: 'qBit', title: 'football match', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })}` }
      ]
    }
    const result = await applyV13Routing(baseResult, {
      // User has v1.3 config (RD with apiKey) but provider is disabled → still triggers v1.3 sports rule.
      config: {
        debrid: { providers: [{ type: 'rd', apiKey: 'somekey', enabled: false }] },
        cacheSearch: { sources: [] }
      },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:premier-league:2026-05-23:arsenal-vs-chelsea'
    })
    assert.deepEqual(result.streams, [])
  })

  await check('sports + no v1.3 config at all → BACKWARD COMPAT (existing streams pass through)', async () => {
    const baseResult = {
      streams: [
        { name: 'qBit', title: 'football match', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })}` }
      ]
    }
    const result = await applyV13Routing(baseResult, {
      // No debrid providers, no cache search sources — pure v1.2 install.
      config: { debrid: { providers: [] }, cacheSearch: { sources: [] } },
      addonUrl: PLAYBACK_BASE,
      playbackBaseUrl: PLAYBACK_BASE,
      configToken: CONFIG_TOKEN,
      id: 'sportsmeta:premier-league:2026-05-23:arsenal-vs-chelsea'
    })
    // Pure v1.2 install: passthrough. No streams removed.
    assert.equal(result.streams.length, 1)
    assert.equal(result.streams[0].name, 'qBit')
  })

  await check('sports + debrid configured → existing qBit stream replaced by debrid variant', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const baseResult = {
      streams: [
        { name: 'On Seedbox', title: 'football 1080p', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }
      ]
    }
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
    // qBit stream replaced; only debrid stream emitted
    assert.equal(result.streams.length, 1)
    assert.match(result.streams[0].url, /\/playback\/debrid\//)
    assert.match(result.streams[0].name, /^⬇ RD/)
  })

  await check('movie + debrid + preferDebridOverSeedbox=true → debrid stream added BEFORE qBit', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const baseResult = {
      streams: [
        { name: 'On Seedbox', title: 'Movie 1080p', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }
      ]
    }
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
    assert.match(result.streams[1].url, /\/playback\/[^/]+$/, 'qBit second (no /debrid/ in path)')
    assert.doesNotMatch(result.streams[1].url, /\/playback\/debrid\//)
  })

  await check('movie + debrid + preferDebridOverSeedbox=false → qBit BEFORE debrid', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const baseResult = {
      streams: [
        { name: 'On Seedbox', title: 'Movie 1080p', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }
      ]
    }
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
    assert.doesNotMatch(result.streams[0].url, /\/playback\/debrid\//, 'qBit first')
    assert.match(result.streams[1].url, /\/playback\/debrid\//, 'debrid second')
  })

  await check('install without debrid OR cacheSearch is unchanged (backward compat)', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const url = `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}`
    const baseResult = {
      streams: [{ name: 'On Seedbox', title: 'Movie', url }],
      cacheMaxAge: 60
    }
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

  await check('disabled debrid providers are NOT used', async () => {
    const token = encodePlaybackStateToken({ h: SAMPLE_HASH, l: '', p: 'm.mkv' })
    const baseResult = {
      streams: [{ name: 'On Seedbox', url: `${PLAYBACK_BASE}/${CONFIG_TOKEN}/playback/${token}` }]
    }
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
    // No debrid variants because the only provider is disabled
    assert.equal(result.streams.length, 1)
    assert.doesNotMatch(result.streams[0].url, /\/playback\/debrid\//)
  })

  await check('sports + debrid + empty existing streams → still empty (no fabricated streams)', async () => {
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
