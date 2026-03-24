const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { decrypt, encrypt } = require('../src/utils/crypto')
const { buildLocalModeUrls } = require('../src/utils/localInstallUrls')
const { DEFAULT_PAIR_RELAY_URL, normalizeRelayUrl } = require('../src/utils/relayUrl')

const LOCAL_SMOKE_SECRET = 'local-smoke-secret-12345678901234567890'
const RELAY_SMOKE_SECRET = 'relay-smoke-secret-12345678901234567890'

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || LOCAL_SMOKE_SECRET
const LINKED_STREMIO_USER_ID = 'stremio_user_abc123'

function derivePairIdFromStremioUserId(stremioUserId) {
  const userId = String(stremioUserId || '').trim()
  if (!userId) return ''
  const digest = crypto.createHash('sha256').update(userId).digest('hex')
  return `s_${digest.slice(0, 22)}`
}

async function getFreePort() {
  const server = http.createServer(() => {})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

async function fetchHttpsJson(url) {
  return await new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({
        status: res.statusCode,
        json: body ? JSON.parse(body) : null
      }))
    }).on('error', reject)
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
  const sampleDetectedAuthKey = 'stremioLocalAuthKey1234567890='
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-auth-scan-'))
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-config-flow-'))
  const localConfigPath = path.join(runtimeDir, 'local-config.json')
  const relayEncryptBodies = []
  const scanDir = path.join(tempRoot, 'leveldb')
  fs.mkdirSync(scanDir, { recursive: true })
  fs.writeFileSync(
    path.join(scanDir, '000001.log'),
    `)_https://web.stremio.com\u0001profile\u0001{"auth":{"key":"${sampleDetectedAuthKey}"},"user":{"_id":"${LINKED_STREMIO_USER_ID}","email":"linked@example.com"}}`,
    'utf8'
  )

  const relayServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/encrypt') {
      res.statusCode = 404
      return res.end('not found')
    }

    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {}
      relayEncryptBodies.push(parsed)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        token: encrypt(parsed, RELAY_SMOKE_SECRET)
      }))
    })
  })
  await new Promise(resolve => relayServer.listen(0, '127.0.0.1', resolve))
  const relayBase = `http://127.0.0.1:${relayServer.address().port}`

  const stremioApiServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/getUser') {
      res.statusCode = 404
      return res.end('not found')
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {}
      if (String(parsed.authKey || '') !== sampleDetectedAuthKey) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ error: 'invalid auth key' }))
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        result: {
          _id: LINKED_STREMIO_USER_ID,
          email: 'linked@example.com'
        }
      }))
    })
  })
  await new Promise(resolve => stremioApiServer.listen(0, '127.0.0.1', resolve))

  process.env.PVTKRRX_STREMIO_AUTH_SCAN_DIRS = scanDir
  process.env.PVTKRRX_STREMIO_API_BASE_URL = `http://127.0.0.1:${stremioApiServer.address().port}`
  process.env.PVTKRRX_RUNTIME_DIR = runtimeDir

  const app = require('../index')
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const host = `127.0.0.1:${port}`
    const base = `http://${host}`

    const sampleConfig = {
      jackettUrl: 'http://127.0.0.1:9696',
      jackettApiKey: 'test-key',
      qbitUrl: 'http://127.0.0.1:8080',
      qbitUsername: 'admin',
      qbitPassword: 'adminadmin',
      fileServerUrl: '',
      fileServerAuth: '',
      pathMapping: { from: '/', to: '/' },
      additionalStorageRoots: ['Z:\\Media', '\\\\NAS\\TV'],
      maxResults: 50
    }

    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const csrf = readCsrf(configureRes.headers.get('set-cookie'))
    const configureHtml = await configureRes.text()
    assert.match(configureHtml, /<h2>LAN Bridge Quick Setup<\/h2>/, 'configure page should render LAN quick setup section')
    assert.match(configureHtml, /<h2>Addon URL<\/h2>/, 'configure page should render addon url section')
    assert.match(configureHtml, /id="installActionBtn"/, 'configure page should render install action button')
    assert.match(configureHtml, /Copy Addon URL/, 'configure page should render a primary addon url copy action')
    assert.match(configureHtml, /Copy Stremio Install Link/, 'configure page should render a dedicated Stremio install link copy action for LAN Bridge')
    assert.match(configureHtml, /primary install link should start with stremio:\/\//i, 'configure page should explain that the primary LAN Bridge install link must start with stremio://')
    assert.match(configureHtml, /Copy PC Local URL/, 'configure page should render same-PC local install action')
    assert.match(configureHtml, /testConnection\(\)/, 'configure page should expose test connection action')
    assert.match(configureHtml, /Auto Setup \(Home LAN\)/, 'configure page should render auto setup action')
    assert.match(configureHtml, /id="quickInstallLanBtn"/, 'configure page should render quick install button')
    assert.match(configureHtml, /auth\/stremio\/local-status/, 'configure page should check local Stremio status')
    assert.match(configureHtml, /href="\/runbooks"/, 'configure page should link to runbooks')
    assert.match(configureHtml, /route-parity\.js/, 'configure page should load shared parity helper')

    const runbooksRes = await fetch(`${base}/runbooks`)
    assert.equal(runbooksRes.status, 200, 'GET /runbooks should return 200')
    const runbooksHtml = await runbooksRes.text()
    assert.match(runbooksHtml, /Seedbox Runbooks/, 'runbooks page should render heading')
    assert.match(runbooksHtml, /Whatbox Runbook/, 'runbooks page should include Whatbox runbook')
    assert.match(runbooksHtml, /Ultra\.cc Runbook/, 'runbooks page should include Ultra.cc runbook')

    const networkInfoRes = await fetch(`${base}/network-info`)
    assert.equal(networkInfoRes.status, 200, 'GET /network-info should return 200')
    const networkInfo = await networkInfoRes.json()
    assert.equal(typeof networkInfo.loopback?.httpManifest, 'string')
    assert.equal(typeof networkInfo.loopback?.httpsManifest, 'string')
    assert.equal(typeof networkInfo.loopback?.stremio, 'string')
    assert.equal(typeof networkInfo.loopback?.stremioHttps, 'string')
    assert.equal(networkInfo.loopback.httpManifest, 'http://127.0.0.1:7000/local/manifest.json?mode=local')
    assert.equal(networkInfo.loopback.httpsManifest, 'https://127.0.0.1:7001/local/manifest.json?mode=local')
    assert.equal(networkInfo.loopback.stremio, 'stremio://127.0.0.1:7000/local/manifest.json?mode=local')
    assert.equal(networkInfo.loopback.stremioHttps, 'stremio://127.0.0.1:7001/local/manifest.json?mode=local')
    assert.notEqual(networkInfo.loopback.stremio, networkInfo.loopback.stremioHttps, 'primary same-PC install path must not collapse to the HTTPS deep link')

    const localInstallUrls = buildLocalModeUrls('127.0.0.1', 7000, 7001)
    assert.equal(localInstallUrls.httpManifest, 'http://127.0.0.1:7000/local/manifest.json?mode=local')
    assert.equal(localInstallUrls.stremio, 'stremio://127.0.0.1:7000/local/manifest.json?mode=local')
    assert.equal(localInstallUrls.stremioHttps, 'stremio://127.0.0.1:7001/local/manifest.json?mode=local')
    assert.notEqual(localInstallUrls.stremio, localInstallUrls.stremioHttps)
    assert.equal(normalizeRelayUrl(''), DEFAULT_PAIR_RELAY_URL)
    assert.equal(normalizeRelayUrl('https://pvtkrrx.vercel.app'), DEFAULT_PAIR_RELAY_URL)
    assert.equal(normalizeRelayUrl('https://www.pvtkrrx.vercel.app'), DEFAULT_PAIR_RELAY_URL)

    const stremioStatusRes = await fetch(`${base}/auth/stremio/local-status`)
    assert.equal(stremioStatusRes.status, 200, 'GET /auth/stremio/local-status should return 200 on the host PC')
    const stremioStatus = await stremioStatusRes.json()
    assert.equal(stremioStatus.ok, true, 'local Stremio status should return ok=true')
    assert.equal(typeof stremioStatus.installed, 'boolean')
    assert.equal(typeof stremioStatus.signedInSessionFound, 'boolean')
    assert.equal(typeof stremioStatus.downloadUrl, 'string')

    const localInstallRes = await fetch(`${base}/local/install`)
    assert.equal(localInstallRes.status, 200, 'GET /local/install should return 200')
    const localInstallHtml = await localInstallRes.text()
    assert.match(localInstallHtml, /Copy PC Local URL/, 'local install helper should expose same-PC local copy action')
    assert.doesNotMatch(localInstallHtml, /Open In Stremio/, 'local install helper should not expose unreliable Stremio deep link action')

    const localInstallDebugRes = await fetch(`${base}/local/install?host=192.168.50.48`)
    assert.equal(localInstallDebugRes.status, 200, 'GET /local/install with explicit LAN host should return 200')
    const localInstallDebugHtml = await localInstallDebugRes.text()
    assert.match(localInstallDebugHtml, /Debug-only raw LAN URL/i, 'local install helper should label raw LAN URLs as debug-only')
    assert.match(localInstallDebugHtml, /http:\/\/192\.168\.50\.48:7000\/local\/manifest\.json\?mode=local/, 'local install helper should surface the raw LAN URL only as a debug aid')

    const autoProvisionRes = await fetch(`${base}/auto-provision`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        installIfMissing: false,
        startIfStopped: false,
        configureQbitLocalNoAuth: false,
        openFirewall: false
      })
    })
    assert.equal(autoProvisionRes.status, 200, 'POST /auto-provision should return 200')

    const localSaveRes = await fetch(`${base}/local-config`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(sampleConfig)
    })
    assert.equal(localSaveRes.status, 200, 'POST /local-config should return 200')
    const localSavePayload = await localSaveRes.json()
    assert.equal(localSavePayload.ok, true, 'local config save should return ok=true')
    assert.equal(localSavePayload.jackettApiKey, undefined, 'local save response should redact jackett api key')
    assert.equal(localSavePayload.qbitUsername, undefined, 'local save response should redact qBit username')
    assert.equal(localSavePayload.qbitPassword, undefined, 'local save response should redact qBit password')
    assert.equal(localSavePayload.fileServerAuth, undefined, 'local save response should redact file server auth')
    assert.equal(localSavePayload.lanPairKey, undefined, 'local save response should not expose lanPairKey')

    const localConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(localConfigRes.status, 200, 'GET /local/config.json should return 200 after save')
    const localConfig = await localConfigRes.json()
    assert.equal(localConfig.jackettUrl, sampleConfig.jackettUrl)
    assert.equal(localConfig.qbitUrl, sampleConfig.qbitUrl)
    assert.deepEqual(localConfig.additionalStorageRoots, sampleConfig.additionalStorageRoots)
    assert.equal(localConfig.jackettApiKey, undefined, 'local config readback should redact jackett api key')
    assert.equal(localConfig.qbitUsername, undefined, 'local config readback should redact qBit username')
    assert.equal(localConfig.qbitPassword, undefined, 'local config readback should redact qBit password')
    assert.equal(localConfig.fileServerAuth, undefined, 'local config readback should redact file server auth')
    assert.equal(localConfig.lanPairKey, undefined, 'local config readback should not expose lanPairKey')
    assert.equal(Boolean(localConfig.savedSecrets?.jackettApiKey), true)
    assert.equal(Boolean(localConfig.savedSecrets?.qbitUsername), true)
    assert.equal(Boolean(localConfig.savedSecrets?.qbitPassword), true)

    const evilLocalConfigRes = await fetch(`${base}/local/config.json`, {
      headers: { Origin: 'https://evil.example' }
    })
    assert.equal(evilLocalConfigRes.status, 403, 'evil-origin local config readback should be blocked')

    const expectedLinkedPairId = derivePairIdFromStremioUserId(LINKED_STREMIO_USER_ID)
    const linkedSaveRes = await fetch(`${base}/local-config`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...sampleConfig,
        stremioUserId: LINKED_STREMIO_USER_ID,
        lanPairRelayUrl: relayBase,
        lanPairId: '',
        lanPairKey: ''
      })
    })
    assert.equal(linkedSaveRes.status, 200, 'POST /local-config should support linked stremio user identity')
    const linkedSavePayload = await linkedSaveRes.json()
    assert.equal(linkedSavePayload.ok, true)
    assert.equal(linkedSavePayload.lanPairId, expectedLinkedPairId, 'linked stremio user should derive deterministic lan pair id')
    assert.equal(Boolean(linkedSavePayload.savedSecrets?.lanPairKey), true, 'linked local config should retain a generated pair key')
    assert.equal(Boolean(linkedSavePayload.lanPairEnabled), true)
    assert.equal(Boolean(linkedSavePayload.lanPairRequired), true)
    assert.equal(linkedSavePayload.lanPairKey, undefined, 'linked save response should not expose lanPairKey')

    const linkedLocalConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(linkedLocalConfigRes.status, 200)
    const linkedLocalConfig = await linkedLocalConfigRes.json()
    assert.equal(String(linkedLocalConfig.stremioUserId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(linkedLocalConfig.lanPairId || ''), expectedLinkedPairId)
    assert.equal(Boolean(linkedLocalConfig.savedSecrets?.lanPairKey), true)
    assert.equal(linkedLocalConfig.lanPairKey, undefined, 'linked local config readback should not expose lanPairKey')
    assert.deepEqual(linkedLocalConfig.additionalStorageRoots, sampleConfig.additionalStorageRoots)

    const localLanTokenMissingCsrfRes = await fetch(`${base}/local/lan-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId: expectedLinkedPairId })
    })
    assert.equal(localLanTokenMissingCsrfRes.status, 403, 'local lan token helper should reject missing CSRF token')
    const localLanTokenMissingCsrfPayload = await localLanTokenMissingCsrfRes.json().catch(() => ({}))
    assert.match(String(localLanTokenMissingCsrfPayload.error || ''), /csrf/i)

    const localLanTokenRes = await fetch(`${base}/local/lan-token`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pairId: expectedLinkedPairId })
    })
    assert.equal(localLanTokenRes.status, 200, 'local lan token helper should return 200')
    const localLanTokenPayload = await localLanTokenRes.json()
    assert.equal(Boolean(localLanTokenPayload?.ok), true)
    assert.equal(localLanTokenPayload?.lanPairId, expectedLinkedPairId)
    assert.equal(localLanTokenPayload?.lanPairRelayUrl, relayBase)
    assert.equal(localLanTokenPayload?.lanPairKey, undefined, 'local lan token helper should not expose pair key')
    assert.ok(relayEncryptBodies.length >= 1, 'local lan token helper should ask the relay to mint the hosted token')
    const relayEncryptPayload = relayEncryptBodies.at(-1)
    assert.equal(String(relayEncryptPayload.jackettApiKey || ''), sampleConfig.jackettApiKey, 'relay mint should include saved jackett api key from local config')
    assert.equal(String(relayEncryptPayload.qbitUsername || ''), sampleConfig.qbitUsername, 'relay mint should include saved qBit username from local config')
    assert.equal(String(relayEncryptPayload.qbitPassword || ''), sampleConfig.qbitPassword, 'relay mint should include saved qBit password from local config')
    assert.equal(String(relayEncryptPayload.lanPairRelayUrl || ''), relayBase, 'relay mint should target the configured relay')
    assert.throws(() => decrypt(localLanTokenPayload.token, LOCAL_SMOKE_SECRET), 'LAN Bridge token should no longer be encrypted with the local runtime secret')
    const lanBridgeTokenConfig = decrypt(localLanTokenPayload.token, RELAY_SMOKE_SECRET)
    assert.equal(String(lanBridgeTokenConfig.lanPairId || ''), expectedLinkedPairId, 'LAN Bridge token should retain pair id')
    assert.equal(Boolean(String(lanBridgeTokenConfig.lanPairKey || '').trim()), true, 'LAN Bridge token should retain pair key')
    assert.equal(String(lanBridgeTokenConfig.localHostname || ''), 'pvtkrrx.local', 'LAN Bridge token should retain local hostname for the paired host')
    assert.equal(String(lanBridgeTokenConfig.lanPairRelayUrl || ''), relayBase, 'LAN Bridge token should retain relay URL')

    const localLanTokenBadOriginRes = await fetch(`${base}/local/lan-token`, {
      method: 'POST',
      headers: withCsrf(csrf, {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example'
      }),
      body: JSON.stringify({ pairId: expectedLinkedPairId })
    })
    assert.equal(localLanTokenBadOriginRes.status, 403, 'local lan token helper should reject disallowed origins even with valid CSRF')

    const invalidAuthKeyLinkRes = await fetch(`${base}/auth/stremio/link-authkey`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ authKey: 'bad' })
    })
    assert.equal(invalidAuthKeyLinkRes.status, 400, 'local auth-link endpoint should be active and reject invalid auth keys without missing-secret errors')
    const invalidAuthKeyLinkPayload = await invalidAuthKeyLinkRes.json()
    assert.equal(String(invalidAuthKeyLinkPayload.error || ''), 'Invalid Stremio AuthKey')

    const autoLinkMissingCsrfRes = await fetch(`${base}/auth/stremio/auto-link-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    assert.equal(autoLinkMissingCsrfRes.status, 403, 'auto-link-local should reject missing CSRF token')
    const autoLinkMissingCsrfPayload = await autoLinkMissingCsrfRes.json().catch(() => ({}))
    assert.match(String(autoLinkMissingCsrfPayload.error || ''), /csrf/i)

    const autoLinkRes = await fetch(`${base}/auth/stremio/auto-link-local`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' })
    })
    assert.equal(autoLinkRes.status, 200, 'POST /auth/stremio/auto-link-local should return 200 with a detected local session')
    const autoLinkPayload = await autoLinkRes.json()
    assert.equal(autoLinkPayload.ok, true, 'local auto-link should return ok=true')
    assert.equal(typeof autoLinkPayload.token, 'string', 'local auto-link should return a token')
    assert.equal(String(autoLinkPayload.stremio?.userId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(autoLinkPayload.detected?.method || ''), 'local-storage')
    assert.match(String(autoLinkPayload.detected?.sourceLabel || ''), /Override/i)
    assert.equal(Object.prototype.hasOwnProperty.call(autoLinkPayload, 'authKey'), false, 'local auto-link should not expose raw auth keys')

    const autoLinkBadOriginRes = await fetch(`${base}/auth/stremio/auto-link-local`, {
      method: 'POST',
      headers: withCsrf(csrf, {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example'
      })
    })
    assert.equal(autoLinkBadOriginRes.status, 403, 'auto-link-local should reject disallowed origins even with valid CSRF')

    const localManifestRes = await fetch(`${base}/local/manifest.json?mode=local`)
    assert.equal(localManifestRes.status, 200, 'GET /local/manifest.json should return 200 after local config save')
    const localManifest = await localManifestRes.json()
    assert.equal(localManifest.id, 'com.kepners.pvtkrrx.local')
    assert.equal(localManifest.name, 'PVTKRRX (PC Local)')
    assert.equal(localManifest.behaviorHints?.configurationRequired, false)
    assert.ok(Array.isArray(localManifest.types) && localManifest.types.includes('sports'), 'local manifest should expose sports as a top-level type')
    assert.ok(Array.isArray(localManifest.catalogs) && localManifest.catalogs.some((catalog) => catalog?.id === 'pvtkrrx-sports' && catalog?.type === 'sports'), 'local manifest should expose the sports catalog')

    const localSportsCatalogRes = await fetch(`${base}/local/catalog/sports/pvtkrrx-sports.json?mode=local`)
    assert.equal(localSportsCatalogRes.status, 200, 'GET /local/catalog/sports/pvtkrrx-sports.json should return 200')
    const localSportsCatalog = await localSportsCatalogRes.json()
    assert.ok(Array.isArray(localSportsCatalog.metas), 'sports catalog should return metas array')

    const tlsPort = await getFreePort()
    const tlsHttpsPort = await getFreePort()
    const tlsState = app.startLocalServers({
      port: tlsPort,
      httpsPort: tlsHttpsPort,
      exitOnHttpError: false,
      enableLanAlias: false,
      ensureLanAccessOnBoot: false,
      logger: {
        log() {},
        warn() {},
        error() {}
      }
    })
    try {
      await tlsState.httpsReady
      const httpsManifestRes = await fetchHttpsJson(`https://127.0.0.1:${tlsHttpsPort}/local/manifest.json?mode=local`)
      assert.equal(httpsManifestRes.status, 200, 'GET /local/manifest.json over HTTPS should return 200')
      assert.equal(httpsManifestRes.json?.id, 'com.kepners.pvtkrrx.local')
    } finally {
      await new Promise(resolve => tlsState.httpServer.close(resolve))
      if (tlsState.httpsServer) {
        await new Promise(resolve => tlsState.httpsServer.close(resolve))
      }
    }

    const encryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig)
    })
    assert.equal(encryptRes.status, 200, 'POST /encrypt should return 200')
    const encryptPayload = await encryptRes.json()
    assert.equal(typeof encryptPayload.token, 'string', 'encrypt should return a token')
    assert.ok(encryptPayload.token.length > 20, 'token should look non-trivial')

    const hostedMissingFileServerRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleConfig,
        lanPairEnabled: false,
        lanPairRequired: false,
        lanPairRelayUrl: 'https://pvtkrrx.vercel.app'
      })
    })
    assert.equal(hostedMissingFileServerRes.status, 400, 'hosted relay config without file server should be rejected')
    const hostedMissingFileServerPayload = await hostedMissingFileServerRes.json()
    assert.equal(hostedMissingFileServerPayload.notifyUser, true)
    assert.equal(hostedMissingFileServerPayload.issueCode, 'HOSTED_FILE_SERVER_REQUIRED')
    assert.match(hostedMissingFileServerPayload.error, /File Server URL/i)

    const remoteSeedboxSourcePayload = {
      ...sampleConfig,
      fileServerUrl: 'https://files.example/media',
      fileServerAuth: 'Bearer remote-secret',
      localHostname: 'my-host.local',
      localHostnameCustom: true,
      lanPairEnabled: false,
      lanPairRequired: false,
      lanPairId: 'pair_remote_should_strip',
      lanPairKey: 'pair_key_should_strip',
      lanPairRelayUrl: 'https://pvtkrrx.vercel.app'
    }
    const remoteSeedboxEncryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remoteSeedboxSourcePayload)
    })
    assert.equal(remoteSeedboxEncryptRes.status, 200, 'remote seedbox payload with public file server should encrypt successfully')
    const remoteSeedboxEncryptPayload = await remoteSeedboxEncryptRes.json()
    const remoteSeedboxTokenConfig = decrypt(remoteSeedboxEncryptPayload.token, process.env.ENCRYPTION_SECRET)
    assert.equal(remoteSeedboxTokenConfig.lanPairEnabled, false, 'Remote Seedbox token should remain LAN-disabled')
    assert.equal(remoteSeedboxTokenConfig.lanPairRequired, false, 'Remote Seedbox token should remain LAN-optional')
    assert.equal(remoteSeedboxTokenConfig.lanPairId, undefined, 'Remote Seedbox token should strip LAN pair id')
    assert.equal(remoteSeedboxTokenConfig.lanPairKey, undefined, 'Remote Seedbox token should strip LAN pair key')
    assert.equal(remoteSeedboxTokenConfig.lanPairRelayUrl, undefined, 'Remote Seedbox token should strip relay URL when pairing is off')
    assert.equal(remoteSeedboxTokenConfig.localHostname, undefined, 'Remote Seedbox token should strip local hostname when pairing is off')
    assert.equal(remoteSeedboxTokenConfig.localHostnameCustom, undefined, 'Remote Seedbox token should strip local hostname customization when pairing is off')
    assert.equal(remoteSeedboxTokenConfig.fileServerUrl, 'https://files.example/media')

    const legacyHostedToken = encodeURIComponent(encrypt({
      ...sampleConfig,
      lanPairEnabled: false,
      lanPairRequired: false,
      lanPairRelayUrl: 'https://pvtkrrx.vercel.app'
    }, process.env.ENCRYPTION_SECRET))
    const legacyHostedManifestRes = await fetch(`${base}/${legacyHostedToken}/manifest.json?mode=hosted`)
    assert.equal(legacyHostedManifestRes.status, 200, 'legacy hosted token manifest should still resolve')
    const legacyHostedManifest = await legacyHostedManifestRes.json()
    assert.equal(legacyHostedManifest.behaviorHints?.configurationRequired, true)
    assert.match(String(legacyHostedManifest.description || ''), /File Server URL/i)

    const token = encodeURIComponent(encryptPayload.token)
    const installLink = `stremio://${host}/${token}/manifest.json`

    const tokenManifestRes = await fetch(`${base}/${token}/manifest.json?mode=hosted`)
    assert.equal(tokenManifestRes.status, 200, 'GET /:token/manifest.json should return 200')
    const tokenManifest = await tokenManifestRes.json()
    assert.equal(tokenManifest.id, 'com.kepners.pvtkrrx.online')
    assert.equal(tokenManifest.behaviorHints?.configurable, true)
    assert.equal(tokenManifest.behaviorHints?.configurationRequired, false)
    assert.ok(Array.isArray(tokenManifest.types) && tokenManifest.types.includes('sports'), 'hosted manifest should expose sports as a top-level type')
    assert.ok(tokenManifest.resources?.some((resource) => resource?.name === 'stream' && Array.isArray(resource.types) && resource.types.includes('sports')), 'hosted manifest stream resource should support sports')
    assert.ok(tokenManifest.catalogs?.some((catalog) => catalog?.id === 'pvtkrrx-sports' && catalog?.type === 'sports'), 'hosted manifest should register sports as a top-level catalog')

    const tokenManifestLocalRes = await fetch(`${base}/${token}/manifest.json?mode=local`)
    assert.equal(tokenManifestLocalRes.status, 200, 'GET /:token/manifest.json?mode=local should return 200')
    const tokenManifestLocal = await tokenManifestLocalRes.json()
    assert.equal(tokenManifestLocal.id, 'com.kepners.pvtkrrx.local')

    const tokenConfigureRes = await fetch(`${base}/${token}/configure`)
    assert.equal(tokenConfigureRes.status, 200, 'GET /:token/configure should return 200')
    const tokenConfigureHtml = await tokenConfigureRes.text()
    assert.match(tokenConfigureHtml, /Connect your private tracker seedbox to Stremio/)
    assert.match(tokenConfigureHtml, /maybePrefillFromToken/, 'token configure page should include prefill loader')

    const tokenConfigRes = await fetch(`${base}/${token}/config.json`)
    assert.equal(tokenConfigRes.status, 200, 'GET /:token/config.json should return 200')
    const tokenConfig = await tokenConfigRes.json()
    assert.equal(tokenConfig.jackettUrl, sampleConfig.jackettUrl)
    assert.equal(tokenConfig.qbitUrl, sampleConfig.qbitUrl)
    assert.equal(tokenConfig.fileServerUrl, sampleConfig.fileServerUrl)
    assert.equal(tokenConfig.jackettApiKey, undefined, 'hosted config readback should redact jackett api key')
    assert.equal(tokenConfig.qbitUsername, undefined, 'hosted config readback should redact qBit username')
    assert.equal(tokenConfig.qbitPassword, undefined, 'hosted config readback should redact qBit password')
    assert.equal(tokenConfig.fileServerAuth, undefined, 'hosted config readback should redact file server auth')
    assert.equal(tokenConfig.lanPairKey, undefined, 'hosted config readback should not expose lanPairKey')
    assert.equal(Boolean(tokenConfig.savedSecrets?.jackettApiKey), true)
    assert.equal(Boolean(tokenConfig.savedSecrets?.qbitUsername), true)
    assert.equal(Boolean(tokenConfig.savedSecrets?.qbitPassword), true)

    const evilTokenConfigRes = await fetch(`${base}/${token}/config.json`, {
      headers: { Origin: 'https://evil.example' }
    })
    assert.equal(evilTokenConfigRes.status, 403, 'evil-origin hosted config readback should be blocked')

    const invalidRes = await fetch(`${base}/invalid-token/manifest.json`)
    assert.equal(invalidRes.status, 400, 'invalid config token should return 400')

    const rootManifestRes = await fetch(`${base}/manifest.json`)
    assert.equal(rootManifestRes.status, 200, 'GET /manifest.json should return 200')
    const rootManifest = await rootManifestRes.json()
    assert.equal(rootManifest.id, 'com.kepners.pvtkrrx.bootstrap')
    assert.equal(rootManifest.name, 'PVTKRRX (Configure)')
    assert.equal(rootManifest.behaviorHints?.configurationRequired, true)
    assert.deepEqual(rootManifest.resources, [], 'root manifest should be an honest bootstrap placeholder')
    assert.deepEqual(rootManifest.catalogs, [], 'root manifest should not claim route catalogs')
    assert.match(String(rootManifest.description || ''), /bootstrap manifest only/i)

    const persistedLocalConfig = fs.readFileSync(localConfigPath, 'utf8')
    assert.ok(persistedLocalConfig.includes('__pvtkrrxSecure'), 'local config should be stored using secure-json wrapper')
    assert.ok(!persistedLocalConfig.includes(sampleConfig.jackettApiKey), 'local config file should not contain plaintext jackett api key')
    assert.ok(!persistedLocalConfig.includes(sampleConfig.qbitPassword), 'local config file should not contain plaintext qBit password')
    assert.ok(!persistedLocalConfig.includes('linked@example.com'), 'local config file should not contain linked account email')

    console.log('Smoke config flow passed')
    console.log(`Install link format: ${installLink}`)
  } finally {
    server.close()
    relayServer.close()
    stremioApiServer.close()
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch (_) {}
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true })
    } catch (_) {}
  }
}

run().catch((error) => {
  console.error('Smoke config flow failed')
  console.error(error)
  process.exit(1)
})
