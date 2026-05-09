const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'selfhost-smoke-secret-12345678901234567890'
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'selfhost-auth-secret-12345678901234567890'
process.env.PVTKRRX_SELF_HOST_MODE = 'true'
process.env.PVTKRRX_PUBLIC_BASE_URL = 'https://seedbox.example.com'
delete process.env.PVTKRRX_HOSTED_RELAY
process.env.PVTKRRX_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-selfhost-'))

const GOOD_AUTH_KEY = 'good-authkey-1234567890'
const LINKED_STREMIO_USER_ID = 'stremio_user_abc123'

function startMockStremioApi() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/getUser') {
      res.statusCode = 404
      res.end('Not found')
      return
    }

    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      } catch (_) {
        body = {}
      }

      if (String(body.authKey || '') !== GOOD_AUTH_KEY) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        result: {
          _id: LINKED_STREMIO_USER_ID,
          email: 'linked-user@example.com'
        }
      }))
    })
  })

  return new Promise((resolve) => {
    server.listen(0, () => resolve(server))
  })
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

function makeMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

async function run() {
  const mockServer = await startMockStremioApi()
  const mockPort = mockServer.address().port
  process.env.PVTKRRX_STREMIO_API_BASE_URL = `http://127.0.0.1:${mockPort}`
  process.env.PVTKRRX_STREMIO_API_TIMEOUT_MS = '5000'

  delete require.cache[require.resolve('../src/lib/shared')]
  delete require.cache[require.resolve('../index')]

  const shared = require('../src/lib/shared')
  const app = require('../index')

  const selfHostPasswordPath = path.join(process.env.PVTKRRX_RUNTIME_DIR, 'server-admin-token')
  const selfHostPassword = String(fs.readFileSync(selfHostPasswordPath, 'utf8') || '').trim()
  assert.ok(selfHostPassword, 'self-host mode should create a self-host password file')

  let nextCalled = false
  const deniedReq = {
    headers: {},
    socket: { remoteAddress: '203.0.113.10' },
    connection: { remoteAddress: '203.0.113.10' },
    get: () => 'seedbox.example'
  }
  const deniedRes = makeMockRes()
  shared.requireServerAdminToken(deniedReq, deniedRes, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, false, 'remote self-host request without self-host password should not pass middleware')
  assert.equal(deniedRes.statusCode, 401)
  assert.equal(String(deniedRes.body?.error || ''), 'Valid self-host password required')

  nextCalled = false
  const staleReq = {
    headers: { 'x-pvtkrrx-admin-token': 'stale-browser-password' },
    socket: { remoteAddress: '203.0.113.10' },
    connection: { remoteAddress: '203.0.113.10' },
    get: () => 'seedbox.example'
  }
  const staleRes = makeMockRes()
  shared.requireServerAdminToken(staleReq, staleRes, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, false, 'remote self-host request with a stale browser password should not pass middleware')
  assert.equal(staleRes.statusCode, 401)
  assert.equal(String(staleRes.body?.error || ''), 'Valid self-host password required')

  nextCalled = false
  const allowedReq = {
    headers: { 'x-pvtkrrx-admin-token': selfHostPassword },
    socket: { remoteAddress: '203.0.113.10' },
    connection: { remoteAddress: '203.0.113.10' },
    get: () => 'seedbox.example'
  }
  const allowedRes = makeMockRes()
  shared.requireServerAdminToken(allowedReq, allowedRes, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true, 'remote self-host request with self-host password should pass middleware')

  await assert.rejects(
    shared.validateHostedConnectionTarget(new URL('http://127.0.0.1:9696')),
    /Hosted connection tests cannot probe loopback, LAN, or private-resolution targets/i
  )

  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const appConfigBefore = await request(port, 'GET', '/app-config.json')
    assert.equal(appConfigBefore.status, 200)
    assert.equal(appConfigBefore.json?.selfHostServerMode, true)
    assert.equal(appConfigBefore.json?.serverConfigAlias, 'selfhost')
    assert.equal(appConfigBefore.json?.serverConfigConfigured, false)
    assert.equal(appConfigBefore.json?.publicBaseUrl, 'https://seedbox.example.com')

    const configureRes = await request(port, 'GET', '/configure')
    assert.equal(configureRes.status, 200)
    const csrf = readCsrf(configureRes.headers['set-cookie'])
    assert.match(configureRes.text, /<body class="[^"]*runtime-config-pending[^"]*selfhost-seedbox-only[^"]*">/i)
    assert.match(configureRes.text, /__PVTKRRX_RUNTIME_BOOTSTRAP__/)
    assert.match(configureRes.text, /Self-Hosted Server/i)
    assert.match(configureRes.text, /This page is the server app\./i)
    assert.match(configureRes.text, /Generate Server Install (URL|Link)/)
    assert.match(configureRes.text, /Remote Seedbox is the only route in self-hosted server mode/i)

    const bootstrapManifestRes = await request(
      port,
      'GET',
      '/manifest.json',
      null,
      {
        Host: `127.0.0.1:${port}`
      }
    )
    assert.equal(bootstrapManifestRes.status, 200)
    assert.equal(bootstrapManifestRes.json?.id, 'com.kepners.pvtkrrx.bootstrap')
    assert.equal(bootstrapManifestRes.json?.name, 'PVTKRR Server Setup')
    assert.match(String(bootstrapManifestRes.json?.description || ''), /Configure-first entry for the self-host server/i)
    assert.match(String(bootstrapManifestRes.json?.description || ''), /generated route manifest/i)

    const privateTest = await request(
      port,
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
        Cookie: csrf.cookie,
        Host: `127.0.0.1:${port}`,
        'X-PVTKRRX-CSRF': csrf.token
      }
    )
    assert.equal(privateTest.status, 200, 'same-host self-host runtime should allow private connection tests')

    const saveRes = await request(
      port,
      'POST',
      '/server-config',
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'seedbox-key',
        qbitUrl: 'http://127.0.0.1:8080',
        qbitUsername: 'demo',
        qbitPassword: 'secret',
        provider: 'custom',
        fileServerUrl: '',
        fileServerAuth: '',
        maxResults: 50,
        lanPairEnabled: false,
        lanPairRequired: false
      },
      {
        Cookie: csrf.cookie,
        Host: `127.0.0.1:${port}`,
        'X-PVTKRRX-CSRF': csrf.token
      }
    )
    assert.equal(saveRes.status, 200, 'same-host self-host runtime should save server config')
    assert.equal(saveRes.json?.ok, true)
    assert.equal(saveRes.json?.configAlias, 'selfhost')
    assert.equal(saveRes.json?.savedSecrets?.jackettApiKey, true)
    assert.equal(saveRes.json?.savedSecrets?.qbitPassword, true)
    assert.equal(saveRes.json?.jackettApiKey, undefined)

    const appConfigAfter = await request(port, 'GET', '/app-config.json')
    assert.equal(appConfigAfter.status, 200)
    assert.equal(appConfigAfter.json?.serverConfigConfigured, true)
    assert.equal(appConfigAfter.json?.publicBaseUrl, 'https://seedbox.example.com')

    const readbackRes = await request(
      port,
      'GET',
      '/selfhost/config.json',
      null,
      {
        Host: `127.0.0.1:${port}`
      }
    )
    assert.equal(readbackRes.status, 200)
    assert.equal(readbackRes.json?.jackettUrl, 'http://127.0.0.1:9696')
    assert.equal(readbackRes.json?.savedSecrets?.jackettApiKey, true)
    assert.equal(readbackRes.json?.jackettApiKey, undefined)

    const manifestRes = await request(
      port,
      'GET',
      '/selfhost/manifest.json?mode=hosted',
      null,
      {
        Host: `127.0.0.1:${port}`
      }
    )
    assert.equal(manifestRes.status, 200)
    assert.equal(manifestRes.json?.id, 'com.kepners.pvtkrrx.selfhost')
    assert.match(String(manifestRes.json?.description || ''), /Self-hosted server route/i)
    assert.match(String(manifestRes.json?.description || ''), /saved Prowlarr\/qBittorrent config/i)
    assert.match(String(manifestRes.json?.name || ''), /^PVTKRR(?:\s|$)/)
    assert.equal(manifestRes.json?.behaviorHints?.configurationRequired, false)
    assert.equal(String(manifestRes.headers['cache-control'] || '').toLowerCase(), 'no-store')

    const linkSessionRes = await request(
      port,
      'POST',
      '/auth/stremio/link-session',
      {
        configAlias: 'selfhost',
        installMode: 'hosted',
        installTarget: 'seedbox'
      },
      {
        Cookie: csrf.cookie,
        Host: 'seedbox.example',
        'X-PVTKRRX-CSRF': csrf.token,
        'X-PVTKRRX-Admin-Token': selfHostPassword
      }
    )
    assert.equal(linkSessionRes.status, 200, 'remote self-host should create a server link session when self-host password is present')
    assert.equal(Boolean(linkSessionRes.json?.ok), true)
    assert.ok(String(linkSessionRes.json?.install?.addonUrl || '').includes('/selfhost/manifest.json?mode=hosted&linkSession='), 'self-host link session should expose a stable selfhost addon url')

    const linkSessionAddonUrl = new URL(String(linkSessionRes.json?.install?.addonUrl || ''))
    const installSeenRes = await request(
      port,
      'GET',
      `${linkSessionAddonUrl.pathname}${linkSessionAddonUrl.search}`,
      null,
      {
        Host: 'seedbox.example'
      }
    )
    assert.equal(installSeenRes.status, 200, 'self-host link-session addon url should resolve')

    const linkAuthRes = await request(
      port,
      'POST',
      '/auth/stremio/link-authkey',
      {
        authKey: GOOD_AUTH_KEY,
        linkSessionToken: String(linkSessionRes.json?.sessionToken || '')
      },
      {
        Cookie: csrf.cookie,
        Host: 'seedbox.example',
        'X-PVTKRRX-CSRF': csrf.token
      }
    )
    assert.equal(linkAuthRes.status, 200, 'self-host auth link should complete the link session')
    assert.equal(String(linkAuthRes.json?.linkSession?.status || ''), 'linked')
    assert.equal(Boolean(linkAuthRes.json?.linkSession?.persistedConfigSaved), true, 'self-host link session should persist disk-backed config state')

    const linkedReadbackRes = await request(
      port,
      'GET',
      '/selfhost/config.json',
      null,
      {
        Host: `127.0.0.1:${port}`
      }
    )
    assert.equal(linkedReadbackRes.status, 200)
    assert.equal(String(linkedReadbackRes.json?.stremioUserId || ''), LINKED_STREMIO_USER_ID, 'self-host config readback should expose the linked stremio user id')

    console.log('Smoke self-host server passed')
  } finally {
    await new Promise(resolve => server.close(resolve))
    mockServer.close()
  }
}

run().catch((error) => {
  console.error('Smoke self-host server failed')
  console.error(error)
  process.exit(1)
})
