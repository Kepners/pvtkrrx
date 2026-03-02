const assert = require('node:assert/strict')
const http = require('node:http')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'

const app = require('../index')
const { encodePlaybackStateToken, decodePlaybackStateToken } = require('../src/utils/opaqueState')

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

    // Opaque state should not be readable as plain JSON even if someone base64-decodes it.
    const plainPlayback = {
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'https://tracker.example/download/abc?t=passkey'
    }
    const opaquePlaybackToken = encodePlaybackStateToken(plainPlayback)
    const roundTripPlayback = decodePlaybackStateToken(opaquePlaybackToken)
    assert.equal(roundTripPlayback.h, plainPlayback.h)
    assert.equal(roundTripPlayback.l, plainPlayback.l)

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
    const pairKey = 'ABCDEFGHIJKLMNOPQRSTUVWX'
    const endpointBaseUrl = `http://10.10.10.42:${port}`

    const heartbeatRes = await fetch(`${base}/pair/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairId,
        pairKey,
        localHostname: 'pvtkrrx.local',
        relayUrl: base,
        endpoints: [{ baseUrl: endpointBaseUrl, source: 'lan-ip' }]
      })
    })
    assert.equal(heartbeatRes.status, 200, 'pair heartbeat should succeed')
    const heartbeatPayload = await heartbeatRes.json()
    assert.equal(Boolean(heartbeatPayload?.ok), true)
    assert.equal(Boolean(heartbeatPayload?.online), true)

    const statusRes = await fetch(`${base}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, pairKey })
    })
    assert.equal(statusRes.status, 200, 'pair status should return 200')
    const statusPayload = await statusRes.json()
    assert.equal(Boolean(statusPayload?.online), true, 'pair should be online')

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

    console.log('Smoke LAN pair + opaque stream token flow passed')
  } finally {
    server.close()
  }
}

run().catch((error) => {
  console.error('Smoke LAN pair + opaque stream token flow failed')
  console.error(error)
  process.exit(1)
})
