const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-lan-pair-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir

const app = require('../index')
const { lanPairStore, hashPairKey } = require('../src/lib/shared')
const { encodePlaybackStateToken, decodePlaybackStateToken } = require('../src/utils/opaqueState')
const pairStorePath = path.join(runtimeDir, 'lan-pair-store.json')

function readCsrf(setCookieHeader) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader || '')
  const match = raw.match(/pvtkrrx_csrf=([^;]+)/)
  assert.ok(match, 'configure response should set CSRF cookie')
  return {
    cookie: `pvtkrrx_csrf=${match[1]}`,
    token: decodeURIComponent(match[1])
  }
}

function withCsrf(csrf, headers = {}) {
  return {
    ...headers,
    Cookie: csrf.cookie,
    'X-PVTKRRX-CSRF': csrf.token
  }
}

function requestWithHostHeader(port, path, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path,
      headers: {
        Host: hostHeader
      }
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try {
          json = text ? JSON.parse(text) : null
        } catch (_) {
          json = null
        }
        resolve({
          status: Number(res.statusCode || 0),
          headers: res.headers || {},
          text,
          json
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`
    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const csrf = readCsrf(configureRes.headers.get('set-cookie'))

    // Opaque state should not be readable as plain JSON even if someone base64-decodes it.
    const plainPlayback = {
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'https://tracker.example/download/abc?t=passkey',
      p: 'Series/Smoke.Show.S01E02.mkv'
    }
    const opaquePlaybackToken = encodePlaybackStateToken(plainPlayback)
    const roundTripPlayback = decodePlaybackStateToken(opaquePlaybackToken)
    assert.equal(roundTripPlayback.h, plainPlayback.h)
    assert.equal(roundTripPlayback.l, plainPlayback.l)
    assert.equal(roundTripPlayback.p, plainPlayback.p)

    let rawDecoded = ''
    let decodedJson = null
    try {
      rawDecoded = Buffer.from(opaquePlaybackToken, 'base64url').toString('utf8')
      decodedJson = JSON.parse(rawDecoded)
    } catch (_) {
      decodedJson = null
    }
    assert.ok(!decodedJson, 'opaque playback token must not be plain decodable JSON')
    assert.ok(!rawDecoded.includes('tracker.example'), 'opaque token should not expose tracker host')
    assert.ok(!rawDecoded.includes('passkey'), 'opaque token should not expose tracker query params')

    const pairId = 'pairtest01'
    const initialPairKey = 'ABCDEFGHIJKLMNOPQRSTUVWX'
    let pairKey = initialPairKey
    const ownerId = 'pairownerABCDEFGHIJKLMNOP'
    const endpointBaseUrl = `http://10.10.10.42:${port}`
    const mdnsBaseUrl = `http://pvtkrrx.local:${port}`

    const heartbeatRes = await fetch(`${base}/pair/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairId,
        pairKey,
        ownerId,
        localHostname: 'pvtkrrx.local',
        relayUrl: base,
        endpoints: [
          { baseUrl: mdnsBaseUrl, source: 'mdns' },
          { baseUrl: endpointBaseUrl, source: 'lan-ip' }
        ]
      })
    })
    assert.equal(heartbeatRes.status, 200, 'pair heartbeat should succeed')
    const heartbeatPayload = await heartbeatRes.json()
    assert.equal(Boolean(heartbeatPayload?.ok), true)
    assert.equal(Boolean(heartbeatPayload?.online), true)

    const takeoverRes = await fetch(`${base}/pair/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairId,
        pairKey,
        ownerId: 'differentOwnerABCDEFGHIJKL',
        localHostname: 'other.local',
        relayUrl: base,
        endpoints: [
          { baseUrl: `http://10.10.10.88:${port}`, source: 'lan-ip' }
        ]
      })
    })
    assert.equal(takeoverRes.status, 409, 'alternate-host heartbeat should be rejected')

    const statusRes = await fetch(`${base}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, pairKey })
    })
    assert.equal(statusRes.status, 200, 'pair status should return 200')
    const statusPayload = await statusRes.json()
    assert.equal(Boolean(statusPayload?.online), true, 'pair should be online')
    assert.equal(statusPayload?.endpointBaseUrl, undefined, 'pair status should not expose endpointBaseUrl')
    assert.equal(statusPayload?.endpointSource, undefined, 'pair status should not expose endpointSource')
    assert.equal(statusPayload?.localHostname, undefined, 'pair status should not expose localHostname')

    const rotatedPairKey = 'ROTATEDPAIRKEYABCDEFGHIJKLMN'
    const rotateRes = await fetch(`${base}/pair/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairId,
        pairKey: rotatedPairKey,
        ownerId,
        localHostname: 'pvtkrrx.local',
        relayUrl: base,
        endpoints: [
          { baseUrl: mdnsBaseUrl, source: 'mdns' },
          { baseUrl: endpointBaseUrl, source: 'lan-ip' }
        ]
      })
    })
    assert.equal(rotateRes.status, 200, 'same-owner heartbeat should allow pair key rotation')
    pairKey = rotatedPairKey

    const rotatedStatusRes = await fetch(`${base}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, pairKey })
    })
    assert.equal(rotatedStatusRes.status, 200, 'rotated pair status should return 200')
    const rotatedStatusPayload = await rotatedStatusRes.json()
    assert.equal(Boolean(rotatedStatusPayload?.online), true, 'rotated pair key should be online')

    const staleStatusRes = await fetch(`${base}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, pairKey: initialPairKey })
    })
    assert.equal(staleStatusRes.status, 200, 'stale pair status should return 200')
    const staleStatusPayload = await staleStatusRes.json()
    assert.equal(Boolean(staleStatusPayload?.online), false, 'stale pair key should no longer authenticate')

    const hostedConfig = {
      jackettUrl: 'http://seedbox.example:9696',
      jackettApiKey: 'dummy-key',
      qbitUrl: 'http://seedbox.example:8080',
      qbitUsername: 'u',
      qbitPassword: 'p',
      fileServerUrl: '',
      fileServerAuth: '',
      pathMapping: { from: '', to: '' },
      maxResults: 50,
      lanPairEnabled: true,
      lanPairRequired: true,
      lanPairId: pairId,
      lanPairKey: pairKey,
      lanPairRelayUrl: base
    }

    const encryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hostedConfig)
    })
    assert.equal(encryptRes.status, 200, '/encrypt should succeed')
    const encryptPayload = await encryptRes.json()
    const hostedToken = encodeURIComponent(String(encryptPayload?.token || ''))
    assert.ok(hostedToken, 'hosted token should be present')

    // Simulate TV/account-hosted request by setting a non-loopback Host header.
    const redirectedCatalog = await requestWithHostHeader(
      port,
      `/${hostedToken}/catalog/movie/pvtkrrx-movies.json`,
      `tv.device.example:${port}`
    )
    assert.equal(redirectedCatalog.status, 307, 'hosted catalog should 307 to LAN endpoint when pair is online')
    assert.equal(String(redirectedCatalog.headers['x-pvtkrrx-lan-pair'] || ''), 'redirect')
    assert.equal(
      String(redirectedCatalog.headers.location || ''),
      `${endpointBaseUrl}/local/catalog/movie/pvtkrrx-movies.json?mode=local`
    )

    const hostedManifestRes = await fetch(`${base}/${hostedToken}/manifest.json?mode=hosted`)
    assert.equal(hostedManifestRes.status, 200, 'legacy LAN manifest should resolve')
    const hostedManifest = await hostedManifestRes.json()
    assert.equal(hostedManifest?.id, 'com.kepners.pvtkrrx.lan', 'legacy LAN token should keep LAN manifest id')

    const legacyImplicitHostedConfig = {
      ...hostedConfig
    }
    delete legacyImplicitHostedConfig.lanPairEnabled
    delete legacyImplicitHostedConfig.lanPairRequired
    const legacyImplicitEncryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyImplicitHostedConfig)
    })
    assert.equal(legacyImplicitEncryptRes.status, 200, 'legacy LAN token without explicit pair booleans should still encrypt')
    const legacyImplicitPayload = await legacyImplicitEncryptRes.json()
    const legacyImplicitToken = encodeURIComponent(String(legacyImplicitPayload?.token || ''))
    const legacyImplicitManifestRes = await fetch(`${base}/${legacyImplicitToken}/manifest.json?mode=hosted`)
    assert.equal(legacyImplicitManifestRes.status, 200, 'legacy LAN manifest without explicit pair booleans should resolve')
    const legacyImplicitManifest = await legacyImplicitManifestRes.json()
    assert.equal(legacyImplicitManifest?.id, 'com.kepners.pvtkrrx.lan', 'legacy LAN token without explicit pair booleans should still resolve as LAN')

    // Wrong key in token should fail closed when LAN pair is required.
    const badHostedConfig = {
      ...hostedConfig,
      lanPairKey: 'ZZZZZZZZZZZZZZZZZZZZZZZZ'
    }
    const encryptBadRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badHostedConfig)
    })
    assert.equal(encryptBadRes.status, 200)
    const badPayload = await encryptBadRes.json()
    const badToken = encodeURIComponent(String(badPayload?.token || ''))

    const offlineCatalog = await requestWithHostHeader(
      port,
      `/${badToken}/catalog/movie/pvtkrrx-movies.json`,
      `tv.device.example:${port}`
    )
    assert.equal(offlineCatalog.status, 200, 'offline catalog fallback should return 200 with empty metas')
    assert.equal(String(offlineCatalog.headers['x-pvtkrrx-lan-pair'] || ''), 'offline')
    assert.deepEqual(offlineCatalog.json, { metas: [], cacheMaxAge: 0 })

    const offlineMeta = await requestWithHostHeader(
      port,
      `/${badToken}/meta/movie/tt1234567.json`,
      `tv.device.example:${port}`
    )
    assert.equal(offlineMeta.status, 200, 'offline meta fallback should return 200')
    assert.notEqual(String(offlineMeta.headers['x-pvtkrrx-lan-pair'] || ''), 'offline')
    assert.equal(offlineMeta.json?.meta?.id, 'tt1234567')
    assert.equal(offlineMeta.json?.meta?.type, 'movie')
    assert.notEqual(offlineMeta.json?.meta?.name, 'PVTKRRX host offline')
    assert.doesNotMatch(
      String(offlineMeta.json?.meta?.description || ''),
      /LAN pair offline/i,
      'offline meta should not leak the host-offline notice into the description'
    )

    // No heartbeat record for the requested pair should also fail closed.
    const missingPairConfig = {
      ...hostedConfig,
      lanPairId: 'missingpair99'
    }
    const encryptMissingRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(missingPairConfig)
    })
    assert.equal(encryptMissingRes.status, 200)
    const missingPayload = await encryptMissingRes.json()
    const missingToken = encodeURIComponent(String(missingPayload?.token || ''))

    const missingPairCatalog = await requestWithHostHeader(
      port,
      `/${missingToken}/catalog/movie/pvtkrrx-movies.json`,
      `tv.device.example:${port}`
    )
    assert.equal(missingPairCatalog.status, 200, 'missing-heartbeat pair should return offline fallback')
    assert.equal(String(missingPairCatalog.headers['x-pvtkrrx-lan-pair'] || ''), 'offline')
    assert.deepEqual(missingPairCatalog.json, { metas: [], cacheMaxAge: 0 })

    const hybridPairId = 'hybridpair99'
    const hybridPairKey = 'HYBRIDPAIRKEYABCDEFGHIJKLMNOP'
    const hybridOwnerId = 'hybridownerABCDEFGHIJKLMNOP'
    await lanPairStore.set(hybridPairId, {
      pairId: hybridPairId,
      keyHash: hashPairKey(hybridPairKey),
      ownerHash: hashPairKey(hybridOwnerId),
      clientIpHash: 'nonmatching-network-hash',
      endpoints: [
        { baseUrl: endpointBaseUrl, source: 'lan-ip' }
      ],
      localHostname: 'pvtkrrx.local',
      relayUrl: base,
      appVersion: 'smoke',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60_000
    }, 3600)

    const hybridConfig = {
      ...hostedConfig,
      lanPairRequired: false,
      routeProfile: 'hybrid',
      lanPairId: hybridPairId,
      lanPairKey: hybridPairKey,
      fileServerUrl: 'https://files.seedbox.example'
    }
    const encryptHybridRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hybridConfig)
    })
    assert.equal(encryptHybridRes.status, 200, 'hybrid /encrypt should succeed')
    const hybridPayload = await encryptHybridRes.json()
    const hybridToken = encodeURIComponent(String(hybridPayload?.token || ''))

    const hybridManifestRes = await fetch(`${base}/${hybridToken}/manifest.json?mode=hosted`)
    assert.equal(hybridManifestRes.status, 200, 'hybrid manifest should resolve')
    const hybridManifest = await hybridManifestRes.json()
    assert.equal(hybridManifest?.id, 'com.kepners.pvtkrrx.hybrid', 'hybrid token should use dedicated hybrid manifest id')

    const hybridCatalog = await requestWithHostHeader(
      port,
      `/${hybridToken}/catalog/movie/pvtkrrx-movies.json`,
      `tv.device.example:${port}`
    )
    assert.equal(hybridCatalog.status, 200, 'hybrid catalog should fall through to hosted/cloud')
    assert.equal(String(hybridCatalog.headers['x-pvtkrrx-lan-pair'] || ''), 'fallback')
    assert.equal(String(hybridCatalog.headers['x-pvtkrrx-route-decision'] || ''), 'cloud')
    assert.ok(
      hybridCatalog.json?.metas || hybridCatalog.json?.error || hybridCatalog.text,
      'hybrid cloud fallback should produce a non-empty HTTP response'
    )

    const stalePairId = 'stalepair99'
    const stalePairKey = 'STALEPAIRKEYABCDEFGHIJKLMNOP'
    const staleOwnerId = 'staleownerABCDEFGHIJKLMNOP'
    const staleUpdatedAt = Date.now() - (2 * 60 * 60 * 1000)
    await lanPairStore.set(stalePairId, {
      pairId: stalePairId,
      keyHash: hashPairKey(stalePairKey),
      ownerHash: hashPairKey(staleOwnerId),
      clientIpHash: '',
      endpoints: [
        { baseUrl: endpointBaseUrl, source: 'lan-ip' }
      ],
      localHostname: 'pvtkrrx.local',
      relayUrl: base,
      appVersion: 'smoke',
      updatedAt: staleUpdatedAt,
      expiresAt: Date.now() + 60_000
    }, 3600)

    const staleHeartbeatStatusRes = await fetch(`${base}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId: stalePairId, pairKey: stalePairKey })
    })
    assert.equal(staleHeartbeatStatusRes.status, 200, 'stale-heartbeat pair status should return 200')
    const staleHeartbeatStatusPayload = await staleHeartbeatStatusRes.json()
    assert.equal(Boolean(staleHeartbeatStatusPayload?.online), false, 'stale-heartbeat pair should not stay online')
    assert.equal(String(staleHeartbeatStatusPayload?.reason || ''), 'stale-heartbeat')

    const staleHybridConfig = {
      ...hybridConfig,
      lanPairId: stalePairId,
      lanPairKey: stalePairKey
    }
    const encryptStaleHybridRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleHybridConfig)
    })
    assert.equal(encryptStaleHybridRes.status, 200, 'stale hybrid /encrypt should succeed')
    const staleHybridPayload = await encryptStaleHybridRes.json()
    const staleHybridToken = encodeURIComponent(String(staleHybridPayload?.token || ''))

    const staleHybridCatalog = await requestWithHostHeader(
      port,
      `/${staleHybridToken}/catalog/movie/pvtkrrx-movies.json`,
      `tv.device.example:${port}`
    )
    assert.equal(staleHybridCatalog.status, 200, 'stale hybrid catalog should fall through to hosted/cloud')
    assert.equal(String(staleHybridCatalog.headers['x-pvtkrrx-lan-pair'] || ''), 'fallback')
    assert.equal(String(staleHybridCatalog.headers['x-pvtkrrx-route-decision'] || ''), 'cloud')
    assert.equal(String(staleHybridCatalog.headers['x-pvtkrrx-route-reason'] || ''), 'stale-heartbeat')
    assert.ok(
      staleHybridCatalog.json?.metas || staleHybridCatalog.json?.error || staleHybridCatalog.text,
      'stale hybrid fallback should produce a non-empty HTTP response'
    )

    const localConfigRes = await fetch(`${base}/local-config`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'local-key',
        qbitUrl: 'http://127.0.0.1:8080',
        qbitUsername: 'admin',
        qbitPassword: 'secret'
      })
    })
    assert.equal(localConfigRes.status, 200, 'local config save should succeed for legacy token checks')

    const legacyPayload = Buffer.from(JSON.stringify({
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      p: 'C:\\Media\\Movie.mkv'
    })).toString('base64url')

    const legacyPlaybackRes = await fetch(`${base}/local/playback/${legacyPayload}`)
    assert.equal(legacyPlaybackRes.status, 400, 'legacy plain base64 playback token should be rejected')

    const legacyFileRes = await fetch(`${base}/local/file/${legacyPayload}`)
    assert.equal(legacyFileRes.status, 400, 'legacy plain base64 file token should be rejected')

    const pairStoreRaw = fs.readFileSync(pairStorePath, 'utf8')
    assert.ok(pairStoreRaw.includes('__pvtkrrxSecure'), 'pair store should use secure-json wrapper')
    assert.ok(!pairStoreRaw.includes(pairKey), 'pair store should not contain plaintext pair key')
    assert.ok(!pairStoreRaw.includes(endpointBaseUrl), 'pair store should not contain plaintext endpoint URLs')

    console.log('Smoke LAN pair + opaque stream token flow passed')
  } finally {
    server.close()
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true })
    } catch (_) {}
  }
}

run().catch((error) => {
  console.error('Smoke LAN pair + opaque stream token flow failed')
  console.error(error)
  process.exit(1)
})
