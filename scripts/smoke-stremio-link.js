const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { AccountStore } = require('../src/utils/accountStore')
const { verifyAuthToken } = require('../src/utils/authToken')

const GOOD_AUTH_KEY = 'good-authkey-1234567890'
const BAD_AUTH_KEY = 'bad-authkey-1234567890'
const LINKED_STREMIO_USER_ID = 'stremio_user_abc123'
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-stremio-link-'))
const accountStorePath = path.join(runtimeDir, 'accounts-store.json')

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

async function run() {
  const mockServer = await startMockStremioApi()
  const mockPort = mockServer.address().port

  process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
  process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'local-auth-secret-12345678901234567890'
  process.env.PVTKRRX_STREMIO_API_BASE_URL = `http://127.0.0.1:${mockPort}`
  process.env.PVTKRRX_STREMIO_API_TIMEOUT_MS = '5000'
  process.env.PVTKRRX_RUNTIME_DIR = runtimeDir

  const accountStore = new AccountStore({ filePath: accountStorePath })
  let app = require('../index')
  let server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    let base = `http://127.0.0.1:${server.address().port}`
    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const csrf = readCsrf(configureRes.headers.get('set-cookie'))

    const missingCsrfRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: GOOD_AUTH_KEY })
    })
    assert.equal(missingCsrfRes.status, 403, 'stremio auth-link should reject missing CSRF token')
    const missingCsrfPayload = await missingCsrfRes.json().catch(() => ({}))
    assert.match(String(missingCsrfPayload.error || ''), /csrf/i)

    const badRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ authKey: BAD_AUTH_KEY })
    })
    assert.equal(badRes.status, 401, 'invalid stremio auth key should be rejected')

    const encryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        jackettUrl: 'https://seedbox.example:9696',
        jackettApiKey: 'seedbox-key',
        qbitUrl: 'https://seedbox.example:8080',
        qbitUsername: 'demo',
        qbitPassword: 'secret',
        provider: 'custom',
        fileServerUrl: 'https://files.example',
        fileServerAuth: '',
        maxResults: 50,
        lanPairEnabled: false,
        lanPairRequired: false
      })
    })
    assert.equal(encryptRes.status, 200, 'encrypt should create a hosted token for link-session testing')
    const encryptData = await encryptRes.json()
    assert.ok(String(encryptData?.token || '').length > 20, 'encrypt should return a token')

    const sessionRes = await fetch(`${base}/auth/stremio/link-session`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        sourceConfigToken: String(encryptData.token || ''),
        installMode: 'hosted',
        installTarget: 'seedbox'
      })
    })
    assert.equal(sessionRes.status, 200, 'server link session should be created for token configs')
    const sessionData = await sessionRes.json()
    assert.equal(Boolean(sessionData?.ok), true)
    assert.ok(String(sessionData?.sessionToken || '').length > 16)
    assert.ok(String(sessionData?.install?.addonUrl || '').includes('/manifest.json?mode=hosted&linkSession='), 'session should expose a hosted addon url with link session marker')

    const seenManifestRes = await fetch(String(sessionData.install.addonUrl || ''))
    assert.equal(seenManifestRes.status, 200, 'link-session addon url should resolve a manifest')
    const seenManifest = await seenManifestRes.json()
    assert.ok(String(seenManifest?.id || '').length > 3, 'manifest should still resolve normally through the session url')

    const seenStatusRes = await fetch(`${base}/auth/stremio/link-session/${encodeURIComponent(String(sessionData.sessionToken || ''))}`)
    assert.equal(seenStatusRes.status, 200, 'link-session status should be readable')
    const seenStatusData = await seenStatusRes.json()
    assert.equal(String(seenStatusData?.status || ''), 'install-seen', 'manifest hit should mark the session install as seen')
    assert.equal(Boolean(seenStatusData?.stremio?.linked), false, 'install-seen should not imply account-linked')

    const linkRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        authKey: GOOD_AUTH_KEY,
        linkSessionToken: String(sessionData.sessionToken || '')
      })
    })
    assert.equal(linkRes.status, 200, 'valid stremio auth key should link successfully')
    const linkData = await linkRes.json()
    assert.equal(Boolean(linkData?.ok), true)
    assert.ok(String(linkData?.token || '').length > 20)
    assert.equal(linkData?.user, undefined, 'link response should omit internal user details')
    assert.equal(String(linkData?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    const expectedPairId = derivePairIdFromStremioUserId(LINKED_STREMIO_USER_ID)
    assert.equal(
      String(linkData?.stremio?.recommendedPairId || ''),
      expectedPairId,
      'recommended pair id should be deterministic from stremio user id'
    )
    assert.equal(String(linkData?.linkSession?.status || ''), 'linked', 'link-session should complete once auth key is verified')
    assert.equal(String(linkData?.linkSession?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.ok(String(linkData?.linkSession?.linkedInstall?.addonUrl || '').includes('/manifest.json?mode=hosted'), 'completed link-session should expose a refreshed addon url')
    assert.ok(!String(linkData?.linkSession?.linkedInstall?.addonUrl || '').includes('linkSession='), 'refreshed linked addon url should not keep the one-time link session query')

    const linkedTokenMatch = String(linkData?.linkSession?.linkedInstall?.addonUrl || '').match(/\/([^/?]+)\/manifest\.json/i)
    assert.ok(linkedTokenMatch, 'linked addon url should contain a token config path')
    const linkedTokenConfigRes = await fetch(`${base}/${encodeURIComponent(String(linkedTokenMatch[1] || ''))}/config.json`)
    assert.equal(linkedTokenConfigRes.status, 200, 'linked token config should be readable')
    const linkedTokenConfig = await linkedTokenConfigRes.json()
    assert.equal(String(linkedTokenConfig?.stremioUserId || ''), LINKED_STREMIO_USER_ID, 'linked token config should carry the stremio user id')

    let rawTokenText = ''
    let parsedToken = null
    try {
      rawTokenText = Buffer.from(String(linkData.token || ''), 'base64url').toString('utf8')
      parsedToken = JSON.parse(rawTokenText)
    } catch (_) {
      parsedToken = null
    }
    assert.equal(parsedToken, null, 'auth token should not be readable as plain JSON')
    assert.ok(!rawTokenText.includes(LINKED_STREMIO_USER_ID), 'auth token should not expose stremio user id')
    assert.ok(!rawTokenText.includes('linked-user@example.com'), 'auth token should not expose linked email')
    const verifiedToken = verifyAuthToken(linkData.token, process.env.AUTH_TOKEN_SECRET)
    assert.ok(verifiedToken, 'auth token should verify with AUTH_TOKEN_SECRET')
    assert.deepEqual(
      Object.keys(verifiedToken).sort(),
      ['exp', 'iat', 'sub'],
      'auth token payload should stay limited to opaque bearer metadata'
    )

    const legacyReadableBearer = Buffer.from(JSON.stringify({
      sub: String(verifiedToken?.sub || ''),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url')
    assert.equal(
      verifyAuthToken(legacyReadableBearer, process.env.AUTH_TOKEN_SECRET),
      null,
      'plain readable base64-JSON bearer tokens should no longer verify'
    )

    const relinkRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ authKey: GOOD_AUTH_KEY })
    })
    assert.equal(relinkRes.status, 200, 're-linking same auth key should stay idempotent')
    const relinkData = await relinkRes.json()
    assert.equal(String(relinkData?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(relinkData?.stremio?.recommendedPairId || ''), expectedPairId)

    const linkedUser = await accountStore.getUserByStremioUserId(LINKED_STREMIO_USER_ID)
    assert.ok(linkedUser?.id, 'linked account should be persisted')
    assert.equal(
      String(verifiedToken?.sub || ''),
      String(linkedUser.id || ''),
      'auth token subject should map only to the internal linked account id'
    )
    await new Promise(resolve => server.close(resolve))
    delete require.cache[require.resolve('../index')]
    delete require.cache[require.resolve('../src/lib/shared')]
    app = require('../index')
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, resolve))
    base = `http://127.0.0.1:${server.address().port}`

    const meRes = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${linkData.token}` }
    })
    assert.equal(meRes.status, 200, 'linked bearer token should authorize /auth/me')
    const meData = await meRes.json()
    assert.equal(Boolean(meData?.ok), true)
    assert.equal(String(meData?.user?.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(Boolean(meData?.user?.stremio?.linked), true)
    assert.equal(meData?.user?.id, undefined, '/auth/me should omit internal user id')
    assert.equal(meData?.user?.email, undefined, '/auth/me should omit account email')

    const legacyMeRes = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${legacyReadableBearer}` }
    })
    assert.equal(legacyMeRes.status, 401, 'legacy readable bearer contents should be rejected by /auth/me')

    const accountStoreRaw = fs.readFileSync(accountStorePath, 'utf8')
    assert.ok(accountStoreRaw.includes('__pvtkrrxSecure'), 'account store should use secure-json wrapper')
    assert.ok(!accountStoreRaw.includes(LINKED_STREMIO_USER_ID), 'account store file should not contain plaintext stremio user id')
    assert.ok(!accountStoreRaw.includes('linked-user@example.com'), 'account store file should not contain plaintext linked email')
    assert.ok(!accountStoreRaw.includes(GOOD_AUTH_KEY), 'account store file should not contain plaintext AuthKey material')

    console.log('Smoke Stremio AuthKey link flow passed')
  } finally {
    await new Promise(resolve => server.close(resolve))
    mockServer.close()
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true })
    } catch (_) {}
  }
}

run().catch((error) => {
  console.error('Smoke Stremio AuthKey link flow failed')
  console.error(error)
  process.exit(1)
})
