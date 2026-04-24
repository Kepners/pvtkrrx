/**
 * smoke-security.js — regression coverage for confirmed security fixes
 *
 * Covers:
 *  #1  Config readback secrets are redacted
 *  #2  Spoofed Host / X-Forwarded-For does NOT unlock local-only routes
 *  #3  nip.io / lvh.me rebinding targets are blocked in test-connection
 *  #4  pair/status does not return raw endpoint URLs or pairKey
 *  #5  /auth/me requires auth token
 *  #6  Legacy plain base64-JSON playback/file tokens are rejected
 *  #7  Server-side log output redacts paths, tracker URLs, auth ids, and pair secrets
 *  #8  Secure JSON reads legacy plaintext but new saves stay encrypted-at-rest
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
process.env.PVTKRRX_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-security-'))
// Simulate hosted relay runtime so local-only route guards are active
process.env.PVTKRRX_HOSTED_RELAY = '1'

const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken } = require('../src/utils/opaqueState')
const { loadSecureJsonFile, saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const app = require('../index')
const CANONICAL_HOST = 'www.pvtkrrx.cc'
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`

function readCsrf(setCookieHeader) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader || '')
  const match = raw.match(/pvtkrrx_csrf=([^;]+)/)
  if (!match) return { cookie: '', token: '' }
  return { cookie: `pvtkrrx_csrf=${match[1]}`, token: decodeURIComponent(match[1]) }
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
        try { json = text ? JSON.parse(text) : null } catch (_) { json = null }
        resolve({ status: Number(res.statusCode || 0), headers: res.headers || {}, text, json })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function captureProcessConsole(run) {
  const chunks = []
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)

  function intercept(chunk, encoding, callback) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
    if (typeof encoding === 'function') encoding()
    if (typeof callback === 'function') callback()
    return true
  }

  process.stdout.write = intercept
  process.stderr.write = intercept
  try {
    await run()
  } finally {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  }

  return chunks.join('')
}

async function run() {
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    const secret = process.env.ENCRYPTION_SECRET
    const hostedConfig = {
      jackettUrl: 'https://seedbox.example',
      jackettApiKey: 'SECRETKEY',
      qbitUrl: 'https://seedbox.example',
      qbitUsername: 'admin',
      qbitPassword: 'SECRETPASS',
      fileServerUrl: '',
      fileServerAuth: 'SECRETAUTH',
      lanPairKey: 'SECRETPAIRKEY',
      lanPairEnabled: false,
      lanPairRequired: false
    }
    const token = encodeURIComponent(encrypt(hostedConfig, secret))

    // ── #1a: hosted /:token/config.json must redact secrets ─────────────────
    const hostedConfigRes = await request(port, 'GET', `/${token}/config.json`, null, {
      Host: CANONICAL_HOST,
      Origin: CANONICAL_ORIGIN
    })
    assert.equal(hostedConfigRes.status, 200, '#1a hosted config.json should succeed')
    const hostedCfg = hostedConfigRes.json
    assert.ok(hostedCfg, '#1a response must parse as JSON')
    assert.notEqual(hostedCfg.jackettApiKey, 'SECRETKEY', '#1a jackettApiKey must be redacted')
    assert.notEqual(hostedCfg.qbitPassword, 'SECRETPASS', '#1a qbitPassword must be redacted')
    assert.notEqual(hostedCfg.fileServerAuth, 'SECRETAUTH', '#1a fileServerAuth must be redacted')
    assert.equal(hostedCfg.lanPairKey, undefined, '#1a lanPairKey must be absent from hosted config readback')
    console.log('✓ #1a hosted config.json redacts secrets')

    // ── #1b: evil-origin GET to hosted config.json gets no CORS allow header ─
    const evilOriginConfigRes = await request(port, 'GET', `/${token}/config.json`, null, {
      Host: CANONICAL_HOST,
      Origin: 'https://evil.example.com'
    })
    const corsHeader = evilOriginConfigRes.headers['access-control-allow-origin']
    assert.ok(
      !corsHeader || corsHeader === 'null',
      '#1b evil origin must NOT receive CORS allow header for config.json'
    )
    console.log('✓ #1b evil origin denied CORS for config.json')

    // ── #2a: spoofed X-Forwarded-For must NOT unlock local-only routes ───────
    const xffSpoofed = await request(port, 'POST', '/local-config', { qbitUrl: 'http://127.0.0.1:8080' }, {
      Host: CANONICAL_HOST,
      'X-Forwarded-For': '127.0.0.1'
    })
    assert.equal(xffSpoofed.status, 403, '#2a spoofed XFF must not unlock /local-config on hosted relay')
    console.log('✓ #2a spoofed X-Forwarded-For cannot unlock /local-config')

    // ── #2b: spoofed Host must NOT unlock local-only routes ──────────────────
    const hostSpoofed = await request(port, 'GET', '/network-info', null, {
      Host: '192.168.1.1:7000',
      'X-Real-IP': '192.168.1.50'
    })
    assert.equal(hostSpoofed.status, 403, '#2b spoofed Host must not unlock /network-info on hosted relay')
    console.log('✓ #2b spoofed Host cannot unlock /network-info')

    // ── #3a/#3b: hosted /configure now redirects away on hosted relay, so prove the
    // actual double-submit contract directly with a matching cookie + header.
    const csrf = {
      cookie: 'pvtkrrx_csrf=security-smoke-token-1234567890',
      token: 'security-smoke-token-1234567890'
    }

    // ── #3a: nip.io loopback target is blocked in hosted test-connection ─────
    const nipIoTest = await request(port, 'POST', '/test-connection', {
      jackettUrl: 'http://127.0.0.1.nip.io:9696',
      jackettApiKey: 'key',
      qbitUrl: 'http://192.168.1.1.nip.io:8080',
      qbitUsername: 'u',
      qbitPassword: 'p'
    }, {
      Cookie: csrf.cookie,
      Host: CANONICAL_HOST,
      Origin: CANONICAL_ORIGIN,
      Referer: `${CANONICAL_ORIGIN}/configure`,
      'X-PVTKRRX-CSRF': csrf.token
    })
    assert.equal(nipIoTest.status, 403, '#3a nip.io loopback target must be blocked')
    assert.match(String(nipIoTest.json?.error || ''), /cannot probe loopback, lan, or (private-resolution|\.local) targets/i)
    console.log('✓ #3a nip.io rebinding target blocked')

    // ── #3b: lvh.me target is blocked ───────────────────────────────────────
    const lvhTest = await request(port, 'POST', '/test-connection', {
      jackettUrl: 'http://evil.lvh.me:9696',
      jackettApiKey: 'key',
      qbitUrl: 'https://example.org',
      qbitUsername: 'u',
      qbitPassword: 'p'
    }, {
      Cookie: csrf.cookie,
      Host: CANONICAL_HOST,
      Origin: CANONICAL_ORIGIN,
      Referer: `${CANONICAL_ORIGIN}/configure`,
      'X-PVTKRRX-CSRF': csrf.token
    })
    assert.equal(lvhTest.status, 403, '#3b lvh.me target must be blocked')
    console.log('✓ #3b lvh.me rebinding target blocked')

    // ── #4: pair/status must not return endpoint URL or localHostname ────────
    // Plant a fake pair entry via heartbeat (local socket so it passes the guard)
    const pairId = 'p_testsecurityid00001'
    const pairKey = 'test-security-pair-key-value-here'
    const ownerId = 'security-smoke-owner-id-1234567890'

    // Heartbeat: socket IS 127.0.0.1 but hosted relay=1 → require /pair/heartbeat to not be behind requireLocalNetworkRoute
    const heartbeatRes = await request(port, 'POST', '/pair/heartbeat', {
      pairId,
      pairKey,
      ownerId,
      endpoints: [{ baseUrl: 'http://192.168.1.10:7000', source: 'lan' }],
      localHostname: 'mypc.local'
    })
    // heartbeat is not a requireLocalNetworkRoute — it should succeed
    assert.equal(heartbeatRes.status, 200, '#4 heartbeat must succeed to set up test')

    const statusRes = await request(port, 'POST', '/pair/status', { pairId, pairKey })
    assert.equal(statusRes.status, 200, '#4 pair/status must return 200')
    assert.equal(statusRes.json?.ok, true, '#4 pair/status ok must be true')
    assert.equal(statusRes.json?.endpointBaseUrl, undefined, '#4 pair/status must NOT return endpointBaseUrl')
    assert.equal(statusRes.json?.endpointSource, undefined, '#4 pair/status must NOT return endpointSource')
    assert.equal(statusRes.json?.localHostname, undefined, '#4 pair/status must NOT return localHostname')
    console.log('✓ #4 pair/status omits private endpoint metadata')

    // ── #5: /auth/me must require auth token ────────────────────────────────
    const authMeNoToken = await request(port, 'GET', '/auth/me')
    assert.equal(authMeNoToken.status, 401, '#5 /auth/me without token must return 401')
    console.log('✓ #5 /auth/me requires auth token')

    // ── #6: plain base64-JSON playback token is rejected ────────────────────
    const legacyPayload = Buffer.from(JSON.stringify({
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'
    })).toString('base64url')

    const legacyPlaybackRes = await request(port, 'GET', `/${token}/playback/${legacyPayload}`, null, {
      Host: CANONICAL_HOST
    })
    // On hosted relay the playback route should 403 (disabled); on local it should also 403 (invalid token)
    assert.ok(
      legacyPlaybackRes.status === 403 || legacyPlaybackRes.status === 400,
      `#6 legacy base64-JSON playback token must be rejected (got ${legacyPlaybackRes.status})`
    )
    console.log('✓ #6 legacy plain base64-JSON playback token rejected')

    // ── #7: server-side logger/console output must redact sensitive values ───
    const capturedText = await captureProcessConsole(async () => {
      console.error(
        'tracker=https://tracker.example/download/abc?passkey=secret endpoint=http://192.168.1.10:7000/local/manifest.json?mode=local',
        {
          pairKey,
          stremioUserId: 'stremio_user_security_smoke',
          nested: {
            authKey: 'good-authkey-1234567890',
            fileServerAuth: 'secret-file-auth',
            currentPath: 'C:\\Media\\Movie Name.mkv'
          }
        },
        new Error('failed to open /mnt/media/My Movie/file name.mkv for accountUserId=usr_security_sensitive')
      )
    })
    assert.ok(!capturedText.includes('tracker.example'), '#7 tracker URLs must be redacted in server logs')
    assert.ok(!capturedText.includes('passkey=secret'), '#7 tracker query secrets must be redacted in server logs')
    assert.ok(!capturedText.includes('192.168.1.10'), '#7 private endpoint URLs must be redacted in server logs')
    assert.ok(!capturedText.includes(pairKey), '#7 pair keys must be redacted in server logs')
    assert.ok(!capturedText.includes('stremio_user_security_smoke'), '#7 auth identifiers must be redacted in server logs')
    assert.ok(!capturedText.includes('good-authkey-1234567890'), '#7 auth keys must be redacted in server logs')
    assert.ok(!capturedText.includes('C:\\Media\\Movie Name.mkv'), '#7 windows paths with spaces must be redacted in server logs')
    assert.ok(!capturedText.includes('/mnt/media/My Movie/file name.mkv'), '#7 unix paths with spaces must be redacted in server logs')
    console.log('✓ #7 server-side log output redacts urls, paths, and auth secrets')

    // ── #8: plaintext secure-json fallback is migration-only, not save path ──
    const secureJsonMigrationPath = path.join(process.env.PVTKRRX_RUNTIME_DIR, 'secure-json-migration.json')
    const legacyPlaintext = {
      token: 'legacy-plain-secret-token',
      pairKey: 'legacy-plain-pair-key'
    }
    fs.writeFileSync(secureJsonMigrationPath, JSON.stringify(legacyPlaintext), 'utf8')
    const migratedValue = loadSecureJsonFile(secureJsonMigrationPath, { defaultValue: null })
    assert.deepEqual(migratedValue, legacyPlaintext, '#8 legacy plaintext secure-json should still read for migration')
    saveSecureJsonFile(secureJsonMigrationPath, migratedValue)
    const migratedRaw = fs.readFileSync(secureJsonMigrationPath, 'utf8')
    assert.ok(migratedRaw.includes('__pvtkrrxSecure'), '#8 migrated secure-json should use encrypted wrapper')
    assert.ok(!migratedRaw.includes(legacyPlaintext.token), '#8 migrated secure-json should not keep plaintext secrets')
    assert.ok(!migratedRaw.includes(legacyPlaintext.pairKey), '#8 migrated secure-json should not keep plaintext pair keys')

    const previousEncryptionSecret = process.env.ENCRYPTION_SECRET
    const previousAtRestSecret = process.env.PVTKRRX_AT_REST_SECRET
    const previousNodeEnv = process.env.NODE_ENV
    delete process.env.ENCRYPTION_SECRET
    delete process.env.PVTKRRX_AT_REST_SECRET
    process.env.NODE_ENV = 'production'
    let missingSecretError = null
    try {
      saveSecureJsonFile(path.join(process.env.PVTKRRX_RUNTIME_DIR, 'secure-json-should-fail.json'), { ok: true })
    } catch (error) {
      missingSecretError = error
    } finally {
      process.env.ENCRYPTION_SECRET = previousEncryptionSecret
      if (previousAtRestSecret === undefined) delete process.env.PVTKRRX_AT_REST_SECRET
      else process.env.PVTKRRX_AT_REST_SECRET = previousAtRestSecret
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
    assert.match(String(missingSecretError?.message || ''), /secret is not configured/i, '#8 secure-json saves should fail closed without a configured secret')
    console.log('✓ #8 secure-json plaintext fallback stays migration-only')

    console.log('\nSmoke security checks passed')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch((error) => {
  console.error('Smoke security failed')
  console.error(error)
  process.exit(1)
})
