const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'selfhost-smoke-secret-12345678901234567890'
process.env.PVTKRRX_SELF_HOST_MODE = 'true'
delete process.env.VERCEL
process.env.PVTKRRX_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-selfhost-'))

delete require.cache[require.resolve('../src/lib/shared')]
delete require.cache[require.resolve('../index')]

const shared = require('../src/lib/shared')
const app = require('../index')

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
  const adminTokenPath = path.join(process.env.PVTKRRX_RUNTIME_DIR, 'server-admin-token')
  const adminToken = String(fs.readFileSync(adminTokenPath, 'utf8') || '').trim()
  assert.ok(adminToken, 'self-host mode should create a server admin token file')

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
  assert.equal(nextCalled, false, 'remote self-host request without admin token should not pass middleware')
  assert.equal(deniedRes.statusCode, 401)
  assert.equal(String(deniedRes.body?.error || ''), 'Valid server admin token required')

  nextCalled = false
  const allowedReq = {
    headers: { 'x-pvtkrrx-admin-token': adminToken },
    socket: { remoteAddress: '203.0.113.10' },
    connection: { remoteAddress: '203.0.113.10' },
    get: () => 'seedbox.example'
  }
  const allowedRes = makeMockRes()
  shared.requireServerAdminToken(allowedReq, allowedRes, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true, 'remote self-host request with admin token should pass middleware')

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

    const configureRes = await request(port, 'GET', '/configure')
    assert.equal(configureRes.status, 200)
    const csrf = readCsrf(configureRes.headers['set-cookie'])

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
        sportsDbApiKey: '123',
        sportsDbCacheHours: 24,
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
    assert.equal(manifestRes.json?.id, 'com.kepners.pvtkrrx.online')
    assert.equal(manifestRes.json?.behaviorHints?.configurationRequired, false)
    assert.equal(String(manifestRes.headers['cache-control'] || '').toLowerCase(), 'no-store')

    console.log('Smoke self-host server passed')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch((error) => {
  console.error('Smoke self-host server failed')
  console.error(error)
  process.exit(1)
})
