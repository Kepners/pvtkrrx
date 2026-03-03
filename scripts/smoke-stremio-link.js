const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const http = require('node:http')

const GOOD_AUTH_KEY = 'good-authkey-1234567890'
const BAD_AUTH_KEY = 'bad-authkey-1234567890'
const LINKED_STREMIO_USER_ID = 'stremio_user_abc123'

function derivePairIdFromStremioUserId(stremioUserId) {
  const userId = String(stremioUserId || '').trim()
  if (!userId) return ''
  const digest = crypto.createHash('sha256').update(userId).digest('hex')
  return `s_${digest.slice(0, 22)}`
}

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
          _id: 'stremio_user_abc123',
          email: 'linked-user@example.com'
        }
      }))
    })
  })

  return new Promise((resolve) => {
    server.listen(0, () => resolve(server))
  })
}

async function run() {
  const mockServer = await startMockStremioApi()
  const mockPort = mockServer.address().port

  process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
  process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'local-auth-secret-12345678901234567890'
  process.env.PVTKRRX_STREMIO_API_BASE_URL = `http://127.0.0.1:${mockPort}`
  process.env.PVTKRRX_STREMIO_API_TIMEOUT_MS = '5000'

  const app = require('../index')
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`

    const badRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: BAD_AUTH_KEY })
    })
    assert.equal(badRes.status, 401, 'invalid stremio auth key should be rejected')

    const linkRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: GOOD_AUTH_KEY })
    })
    assert.equal(linkRes.status, 200, 'valid stremio auth key should link successfully')
    const linkData = await linkRes.json()
    assert.equal(Boolean(linkData?.ok), true)
    assert.ok(String(linkData?.token || '').length > 20)
    assert.ok(String(linkData?.user?.id || '').startsWith('usr_'))
    assert.equal(String(linkData?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    const expectedPairId = derivePairIdFromStremioUserId(LINKED_STREMIO_USER_ID)
    assert.equal(
      String(linkData?.stremio?.recommendedPairId || ''),
      expectedPairId,
      'recommended pair id should be deterministic from stremio user id'
    )

    const relinkRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: GOOD_AUTH_KEY })
    })
    assert.equal(relinkRes.status, 200, 're-linking same auth key should stay idempotent')
    const relinkData = await relinkRes.json()
    assert.equal(String(relinkData?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(relinkData?.stremio?.recommendedPairId || ''), expectedPairId)

    const meRes = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${linkData.token}` }
    })
    assert.equal(meRes.status, 200, 'linked bearer token should authorize /auth/me')
    const meData = await meRes.json()
    assert.equal(Boolean(meData?.ok), true)
    assert.equal(String(meData?.user?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(Boolean(meData?.user?.stremio?.linked), true)

    console.log('Smoke Stremio AuthKey link flow passed')
  } finally {
    server.close()
    mockServer.close()
  }
}

run().catch((error) => {
  console.error('Smoke Stremio AuthKey link flow failed')
  console.error(error)
  process.exit(1)
})
