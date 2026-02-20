const assert = require('node:assert/strict')
const http = require('node:http')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'

const app = require('../index')

async function run() {
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const host = `127.0.0.1:${port}`
    const base = `http://${host}`

    const sampleConfig = {
      jackettUrl: 'http://127.0.0.1:9117/api/v2.0/indexers/all/results/torznab',
      jackettApiKey: 'test-key',
      qbitUrl: 'http://127.0.0.1:8080',
      qbitUsername: 'admin',
      qbitPassword: 'adminadmin',
      fileServerUrl: 'http://127.0.0.1/files',
      fileServerAuth: '',
      pathMapping: { from: '/', to: '/' },
      maxResults: 50
    }

    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const configureHtml = await configureRes.text()
    assert.match(configureHtml, /Install in Stremio/, 'configure page should render install action')
    assert.match(configureHtml, /testConnection\(\)/, 'configure page should expose test connection action')

    const encryptRes = await fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleConfig)
    })
    assert.equal(encryptRes.status, 200, 'POST /encrypt should return 200')
    const encryptPayload = await encryptRes.json()
    assert.equal(typeof encryptPayload.token, 'string', 'encrypt should return a token')
    assert.ok(encryptPayload.token.length > 20, 'token should look non-trivial')

    const token = encodeURIComponent(encryptPayload.token)
    const installLink = `stremio://${host}/${token}/manifest.json`

    const tokenManifestRes = await fetch(`${base}/${token}/manifest.json?mode=hosted`)
    assert.equal(tokenManifestRes.status, 200, 'GET /:token/manifest.json should return 200')
    const tokenManifest = await tokenManifestRes.json()
    assert.equal(tokenManifest.id, 'com.kepners.pvtkrrx.hosted')
    assert.equal(tokenManifest.behaviorHints?.configurable, true)
    assert.equal(tokenManifest.behaviorHints?.configurationRequired, true)

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
