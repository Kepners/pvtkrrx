const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'

const { isBlockedPrivateTargetHost } = require('../public/route-parity')
const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken } = require('../src/utils/opaqueState')
const { findAvailableTcpPort, isTcpPortAvailable } = require('../src/utils/provision')
const CANONICAL_HOST = 'www.pvtkrrx.cc'
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`

function loadApp(hostedRelayEnabled) {
  if (hostedRelayEnabled) process.env.PVTKRRX_HOSTED_RELAY = '1'
  else delete process.env.PVTKRRX_HOSTED_RELAY
  process.env.PVTKRRX_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-runtime-guards-'))
  delete require.cache[require.resolve('../index')]
  delete require.cache[require.resolve('../src/lib/shared')]
  return require('../index')
}

function request(port, method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body)
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: reqPath,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
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
    if (payload) req.write(payload)
    req.end()
  })
}

function readCsrf(setCookieHeader) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader || '')
  const match = raw.match(/pvtkrrx_csrf=([^;]+)/)
  assert.ok(match, 'configure response should set CSRF cookie')
  return {
    cookie: `pvtkrrx_csrf=${match[1]}`,
    token: decodeURIComponent(match[1])
  }
}

function buildCsrfTokenPair(token = 'pvtkrrx-smoke-csrf-token') {
  return {
    cookie: `pvtkrrx_csrf=${encodeURIComponent(token)}`,
    token
  }
}

async function run() {
  const portProbe = http.createServer((_, res) => res.end('ok'))
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))

  try {
    const occupiedPort = portProbe.address().port
    assert.equal(await isTcpPortAvailable(occupiedPort, '127.0.0.1'), false, 'occupied port should not be reported as free')
    const fallbackPort = await findAvailableTcpPort(occupiedPort, {
      host: '127.0.0.1',
      fallbackPorts: [occupiedPort + 1, occupiedPort + 2, occupiedPort + 3]
    })
    assert.notEqual(fallbackPort, occupiedPort, 'expected port probe to move away from a busy listener')
    assert.equal(await isTcpPortAvailable(fallbackPort, '127.0.0.1'), true, 'selected fallback port should be free')
  } finally {
    await new Promise(resolve => portProbe.close(resolve))
  }

  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    'printer.local',
    'foo.localhost',
    '10.0.0.5',
    '192.168.1.50',
    '172.20.8.9',
    '169.254.10.2',
    'host.docker.internal',
    '0.0.0.0',
    'fd12::abcd',
    'fe80::abcd',
    '127.0.0.1.nip.io',
    '127-0-0-1.sslip.io',
    'app.lvh.me',
    'app.localtest.me'
  ]
  for (const host of blockedHosts) {
    assert.equal(isBlockedPrivateTargetHost(host), true, `${host} should be blocked`)
  }
  for (const host of ['example.com', 'seedbox.example', '8.8.8.8']) {
    assert.equal(isBlockedPrivateTargetHost(host), false, `${host} should remain public`)
  }

  const hostedServer = http.createServer(loadApp(true))
  await new Promise(resolve => hostedServer.listen(0, resolve))

  try {
    const port = hostedServer.address().port
    const hostedConfig = {
      jackettUrl: 'https://seedbox.example',
      jackettApiKey: 'dummy-key',
      qbitUrl: 'https://seedbox.example',
      qbitUsername: 'demo',
      qbitPassword: 'demo',
      fileServerUrl: '',
      fileServerAuth: '',
      pathMapping: { from: '', to: '' },
      maxResults: 50,
      lanPairEnabled: false,
      lanPairRequired: false
    }
    const token = encodeURIComponent(encrypt(hostedConfig, process.env.ENCRYPTION_SECRET))
    const playbackInfo = encodePlaybackStateToken({
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'
    })

    const hostedPlayback = await request(
      port,
      'GET',
      `/${token}/playback/${playbackInfo}`,
      null,
      {
        Host: CANONICAL_HOST,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedPlayback.status, 403, 'hosted /playback should fail fast on hosted relay runtime')
    assert.match(String(hostedPlayback.json?.error || ''), /disabled on hosted runtime/i)

    const hostedConfigure = await request(
      port,
      'GET',
      '/configure',
      null,
      {
        Host: CANONICAL_HOST,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedConfigure.status, 302, 'hosted configure page should redirect back to the guide-only homepage')
    assert.equal(String(hostedConfigure.headers.location || ''), '/#routes', 'hosted configure page should redirect to the route guide section')
    const hostedCsrf = buildCsrfTokenPair()

    const hostedLinkAuthKey = await request(
      port,
      'POST',
      '/auth/stremio/link-authkey',
      { authKey: 'bad' },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedLinkAuthKey.status, 400, 'hosted AuthKey link should stay available behind CSRF/origin gates')
    assert.equal(String(hostedLinkAuthKey.json?.error || ''), 'Invalid Stremio AuthKey')

    const evilOriginLinkAuthKey = await request(
      port,
      'POST',
      '/auth/stremio/link-authkey',
      { authKey: 'bad' },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: 'https://evil.example',
        Referer: 'https://evil.example/pvtkrrx',
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(evilOriginLinkAuthKey.status, 403, 'disallowed origins should not reach AuthKey link validation even with a CSRF token')

    const hostedAutoLinkLocal = await request(
      port,
      'POST',
      '/auth/stremio/auto-link-local',
      {},
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedAutoLinkLocal.status, 403, 'hosted auto-link should stay same-host only even with valid CSRF')
    assert.match(String(hostedAutoLinkLocal.json?.error || ''), /this PC|host/i)

    const hostedLanToken = await request(
      port,
      'POST',
      '/local/lan-token',
      {},
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedLanToken.status, 403, 'hosted LAN token helper should stay same-host only even with valid CSRF')
    assert.match(String(hostedLanToken.json?.error || ''), /Windows host PC/i)

    const spoofedOriginOnly = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'https://example.com',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'https://example.org',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(spoofedOriginOnly.status, 403, 'spoofed Origin/Referer alone must not unlock hosted test-connection')
    assert.match(String(spoofedOriginOnly.json?.error || ''), /csrf/i)

    const remotePrivateTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://192.168.1.5:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remotePrivateTarget.status, 403, 'hosted test-connection should block LAN/loopback targets')
    assert.match(String(remotePrivateTarget.json?.error || ''), /cannot probe loopback, lan, or private-resolution targets/i)

    const remoteNipIoTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://127.0.0.1.nip.io:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://192.168.1.55.nip.io:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remoteNipIoTarget.status, 403, 'nip.io private-resolution targets should be blocked')
    assert.match(String(remoteNipIoTarget.json?.error || ''), /cannot probe loopback, lan, or private-resolution targets/i)

    const remoteLocalSuffixTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://printer.local:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://host.docker.internal:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remoteLocalSuffixTarget.status, 403, 'hosted test-connection should block .local and host.docker.internal targets')
    assert.match(String(remoteLocalSuffixTarget.json?.error || ''), /cannot probe loopback, lan, or private-resolution targets/i)

    const remoteIpv6Target = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://[fe80::1]:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'https://example.org',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remoteIpv6Target.status, 403, 'hosted test-connection should block private IPv6 targets')
    assert.match(String(remoteIpv6Target.json?.error || ''), /cannot probe loopback, lan, or private-resolution targets/i)

    const spoofedLocalConfig = await request(
      port,
      'POST',
      '/local-config',
      { qbitUrl: 'http://127.0.0.1:8080' },
      {
        Host: CANONICAL_HOST,
        'X-Forwarded-For': '127.0.0.1'
      }
    )
    assert.equal(spoofedLocalConfig.status, 403, 'spoofed X-Forwarded-For must not unlock /local-config')

    const spoofedNetworkInfo = await request(
      port,
      'GET',
      '/network-info',
      null,
      {
        Host: '192.168.1.1:7000',
        'X-Real-IP': '192.168.1.50'
      }
    )
    assert.equal(spoofedNetworkInfo.status, 403, 'spoofed Host must not unlock /network-info')

    const remotePublicTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'https://example.com',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'https://example.org',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: hostedCsrf.cookie,
        Host: CANONICAL_HOST,
        Origin: CANONICAL_ORIGIN,
        Referer: `${CANONICAL_ORIGIN}/configure`,
        'X-PVTKRRX-CSRF': hostedCsrf.token,
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remotePublicTarget.status, 200, 'hosted configure test should still accept public targets')
    assert.equal(typeof remotePublicTarget.json?.jackett, 'boolean')
    assert.equal(typeof remotePublicTarget.json?.qbit, 'boolean')
  } finally {
    await new Promise(resolve => hostedServer.close(resolve))
  }

  const localServer = http.createServer(loadApp(false))
  await new Promise(resolve => localServer.listen(0, resolve))

  try {
    const localPort = localServer.address().port
    const localConfigure = await request(localPort, 'GET', '/configure')
    assert.equal(localConfigure.status, 200, 'local configure page should return 200')
    const localCsrf = readCsrf(localConfigure.headers['set-cookie'])

    const localPrivateTarget = await request(
      localPort,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://127.0.0.1:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Cookie: localCsrf.cookie,
        Host: `127.0.0.1:${localPort}`,
        'X-PVTKRRX-CSRF': localCsrf.token
      }
    )
    assert.equal(localPrivateTarget.status, 200, 'local configure should still be able to test loopback targets')

    const publicOriginNetworkInfo = await request(
      localPort,
      'GET',
      '/network-info',
      null,
      {
        Host: `127.0.0.1:${localPort}`,
        Origin: 'https://evil.example'
      }
    )
    assert.equal(publicOriginNetworkInfo.status, 403, 'public-origin /network-info should fail on local runtime')

    const publicOriginLocalConfig = await request(
      localPort,
      'POST',
      '/local-config',
      { qbitUrl: 'http://127.0.0.1:8080' },
      {
        Cookie: localCsrf.cookie,
        Host: `127.0.0.1:${localPort}`,
        Origin: 'https://evil.example',
        'X-PVTKRRX-CSRF': localCsrf.token
      }
    )
    assert.equal(publicOriginLocalConfig.status, 403, 'public-origin /local-config should fail on local runtime')

    console.log('Smoke runtime guards passed')
  } finally {
    await new Promise(resolve => localServer.close(resolve))
  }
}

run().catch((error) => {
  console.error('Smoke runtime guards failed')
  console.error(error)
  process.exit(1)
})
