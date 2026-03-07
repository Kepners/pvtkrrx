const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const http = require('node:http')
const { encrypt } = require('../src/utils/crypto')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'

const app = require('../index')
const LINKED_STREMIO_USER_ID = 'stremio_user_abc123'

function derivePairIdFromStremioUserId(stremioUserId) {
  const userId = String(stremioUserId || '').trim()
  if (!userId) return ''
  const digest = crypto.createHash('sha256').update(userId).digest('hex')
  return `s_${digest.slice(0, 22)}`
}

async function run() {
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
      maxResults: 50
    }

    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const configureHtml = await configureRes.text()
    assert.match(configureHtml, /Install in Stremio/, 'configure page should render install action')
    assert.match(configureHtml, /testConnection\(\)/, 'configure page should expose test connection action')
    assert.match(configureHtml, /Auto Setup \(Home LAN\)/, 'configure page should render auto setup action')
    assert.match(configureHtml, /Seedbox Runbooks/, 'configure page should link to seedbox runbooks')

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
    assert.match(networkInfo.loopback.httpManifest, /\/local\/manifest\.json\?mode=local$/)

    const autoProvisionRes = await fetch(`${base}/auto-provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig)
    })
    assert.equal(localSaveRes.status, 200, 'POST /local-config should return 200')
    const localSavePayload = await localSaveRes.json()
    assert.equal(localSavePayload.ok, true, 'local config save should return ok=true')

    const localConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(localConfigRes.status, 200, 'GET /local/config.json should return 200 after save')
    const localConfig = await localConfigRes.json()
    assert.equal(localConfig.jackettUrl, sampleConfig.jackettUrl)
    assert.equal(localConfig.qbitUrl, sampleConfig.qbitUrl)

    const expectedLinkedPairId = derivePairIdFromStremioUserId(LINKED_STREMIO_USER_ID)
    const linkedSaveRes = await fetch(`${base}/local-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sampleConfig,
        stremioUserId: LINKED_STREMIO_USER_ID,
        lanPairId: '',
        lanPairKey: ''
      })
    })
    assert.equal(linkedSaveRes.status, 200, 'POST /local-config should support linked stremio user identity')
    const linkedSavePayload = await linkedSaveRes.json()
    assert.equal(linkedSavePayload.ok, true)
    assert.equal(linkedSavePayload.lanPairId, expectedLinkedPairId, 'linked stremio user should derive deterministic lan pair id')
    assert.ok(String(linkedSavePayload.lanPairKey || '').length >= 16, 'linked local config should return generated pair key')
    assert.equal(Boolean(linkedSavePayload.lanPairEnabled), true)
    assert.equal(Boolean(linkedSavePayload.lanPairRequired), true)

    const linkedLocalConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(linkedLocalConfigRes.status, 200)
    const linkedLocalConfig = await linkedLocalConfigRes.json()
    assert.equal(String(linkedLocalConfig.stremioUserId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(linkedLocalConfig.lanPairId || ''), expectedLinkedPairId)
    assert.ok(String(linkedLocalConfig.lanPairKey || '').length >= 16)

    const localManifestRes = await fetch(`${base}/local/manifest.json?mode=local`)
    assert.equal(localManifestRes.status, 200, 'GET /local/manifest.json should return 200 after local config save')
    const localManifest = await localManifestRes.json()
    assert.equal(localManifest.id, 'com.kepners.pvtkrrx.local')
    assert.equal(localManifest.behaviorHints?.configurationRequired, false)

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

    const invalidRes = await fetch(`${base}/invalid-token/manifest.json`)
    assert.equal(invalidRes.status, 400, 'invalid config token should return 400')

    const rootManifestRes = await fetch(`${base}/manifest.json`)
    assert.equal(rootManifestRes.status, 200, 'GET /manifest.json should return 200')
    const rootManifest = await rootManifestRes.json()
    assert.equal(rootManifest.id, 'com.kepners.pvtkrrx.local')
    assert.equal(rootManifest.behaviorHints?.configurationRequired, true)

    console.log('Smoke config flow passed')
    console.log(`Install link format: ${installLink}`)
  } finally {
    server.close()
  }
}

run().catch((error) => {
  console.error('Smoke config flow failed')
  console.error(error)
  process.exit(1)
})
