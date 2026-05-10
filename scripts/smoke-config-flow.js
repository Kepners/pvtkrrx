const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { decrypt, encrypt } = require('../src/utils/crypto')
const { buildLocalModeUrls } = require('../src/utils/localInstallUrls')
const { loadSecureJsonFile, saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const { DEFAULT_PAIR_RELAY_URL, normalizeRelayUrl } = require('../src/utils/relayUrl')
const { resolveExistingSelfHostPassword } = require('./server-installer')
const manifest = require('../src/config/manifest')

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

function requestJsonWithHostHeader(port, reqPath, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: reqPath,
      headers: {
        Host: hostHeader
      }
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({
        status: Number(res.statusCode || 0),
        json: body ? JSON.parse(body) : null
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

function requestJsonWithHeaders(port, method, reqPath, body = null, headers = {}) {
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
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => resolve({
        status: Number(res.statusCode || 0),
        json: raw ? JSON.parse(raw) : null
      }))
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

function withCsrf(csrf, headers = {}) {
  return {
    ...headers,
    Cookie: csrf.cookie,
    'X-PVTKRRX-CSRF': csrf.token
  }
}

async function assertPngResponse(response, label, expectedWidth, expectedHeight) {
  assert.equal(response.status, 200, `${label} should return 200`)
  const contentType = String(response.headers.get('content-type') || '')
  assert.match(contentType, /^image\/png\b/i, `${label} should return image/png`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()
  assert.equal(metadata.format, 'png', `${label} should be a PNG`)
  assert.equal(metadata.width, expectedWidth, `${label} should be ${expectedWidth}px wide`)
  assert.equal(metadata.height, expectedHeight, `${label} should be ${expectedHeight}px tall`)
}

async function run() {
  const provisionModule = require('../src/utils/provision')
  const originalDiscoverProwlarrConfig = provisionModule.discoverProwlarrConfig
  provisionModule.discoverProwlarrConfig = async () => ({
    installed: true,
    running: true,
    url: 'http://127.0.0.1:9696',
    apiKey: 'recovered-prowlarr-key'
  })
  const sampleDetectedAuthKey = 'stremioLocalAuthKey1234567890='
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-auth-scan-'))
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-config-flow-'))
  const localConfigPath = path.join(runtimeDir, 'local-config.json')
  const selfHostPasswordPath = path.join(runtimeDir, 'server-admin-token')
  fs.writeFileSync(selfHostPasswordPath, 'kept-selfhost-password\n', { encoding: 'utf8', mode: 0o600 })
  assert.equal(
    resolveExistingSelfHostPassword(runtimeDir, {}),
    'kept-selfhost-password',
    'self-host installer should preserve an existing runtime password file when env has no password'
  )
  assert.equal(
    resolveExistingSelfHostPassword(runtimeDir, { PVTKRRX_SELF_HOST_PASSWORD: 'env-selfhost-password' }),
    'env-selfhost-password',
    'self-host installer should prefer explicit env password over runtime password file'
  )
  const relayEncryptBodies = []
  const relayPairStatus = new Map()
  const scanDir = path.join(tempRoot, 'leveldb')
  fs.mkdirSync(scanDir, { recursive: true })
  fs.writeFileSync(
    path.join(scanDir, '000001.log'),
    `)_https://web.stremio.com\u0001profile\u0001{"auth":keyðið"${sampleDetectedAuthKey}","user":{"_id":"${LINKED_STREMIO_USER_ID}","email":"linked@example.com"}}`,
    'utf8'
  )

  const relayServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || (req.url !== '/encrypt' && req.url !== '/pair/status')) {
      res.statusCode = 404
      return res.end('not found')
    }

    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {}
      if (req.url === '/pair/status') {
        const pairId = String(parsed.pairId || '').trim()
        const pairKey = String(parsed.pairKey || '').trim()
        const record = relayPairStatus.get(pairId)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          ok: true,
          online: Boolean(record && record.pairKey === pairKey),
          updatedAt: Number(record?.updatedAt || 0),
          expiresAt: Number(record?.expiresAt || 0)
        }))
      }
      relayEncryptBodies.push(parsed)
      if (String(parsed.lanPairId || '').trim() && String(parsed.lanPairKey || '').trim()) {
        const now = Date.now()
        relayPairStatus.set(String(parsed.lanPairId || '').trim(), {
          pairKey: String(parsed.lanPairKey || '').trim(),
          updatedAt: now,
          expiresAt: now + 600000
        })
      }
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

    const homeRes = await fetch(`${base}/`)
    assert.equal(homeRes.status, 200, 'GET / should return 200')
    const homeHtml = await homeRes.text()
    assert.match(
      homeHtml,
      /<h1 class="logo" data-text="PVTKRRX"><span>PVTKRRX<\/span>(?:<span class="sr-only">[\s\S]*?<\/span>)?<\/h1>/,
      'homepage hero should use live PVTKRRX text in the main headline'
    )
    assert.doesNotMatch(homeHtml, /SETRUP/i, 'homepage should not contain the SETRUP typo')
    assert.doesNotMatch(homeHtml, /Stremio Seedbox Addon/i, 'homepage should not contain the old generic addon headline')
    assert.doesNotMatch(homeHtml, /href="\/configure(?:\?|")/i, 'homepage should not link to configure routes')
    assert.match(homeHtml, /id="siteReleaseCard"/, 'homepage should render a release status card')
    assert.match(homeHtml, /id="siteReleaseLink"/, 'homepage should render a release link')
    assert.match(homeHtml, /<link rel="canonical" href="https:\/\/www\.pvtkrrx\.cc\/">/i, 'homepage should expose canonical metadata')
    assert.match(homeHtml, /<meta property="og:image" content="https:\/\/www\.pvtkrrx\.cc\/social\/pvtkrrx-home\.png">/i, 'homepage should expose the dedicated home social image')
    assert.match(homeHtml, /<link rel="manifest" href="\/site\.webmanifest">/i, 'homepage should link the site web manifest')
    assert.match(homeHtml, /<link rel="icon" href="\/favicon\.ico" sizes="any">/i, 'homepage should expose the favicon link')

    const configureRes = await fetch(`${base}/configure`)
    assert.equal(configureRes.status, 200, 'GET /configure should return 200')
    const csrf = readCsrf(configureRes.headers.get('set-cookie'))
    const configureHtml = await configureRes.text()
    assert.match(
      configureHtml,
      /<h1 class="logo-title" data-text="PVTKRRX"><span>PVTKRRX<\/span>(?:<span class="sr-only">[\s\S]*?<\/span>)?<\/h1>/,
      'configure hero should use live PVTKRRX text in the main headline'
    )
    assert.doesNotMatch(configureHtml, /SETRUP/i, 'configure page should not contain the SETRUP typo')
    assert.doesNotMatch(configureHtml, /Stremio Seedbox Addon/i, 'configure page should not contain the old generic addon headline')
    assert.match(configureHtml, /<meta name="robots" content="noindex,nofollow,noarchive">/i, 'configure page should not be indexable')
    assert.match(configureHtml, /<meta property="og:image" content="https:\/\/www\.pvtkrrx\.cc\/social\/pvtkrrx-configure\.png">/i, 'configure page should expose the configure social image')
    assert.equal(String(configureRes.headers.get('x-robots-tag') || '').toLowerCase(), 'noindex, nofollow, noarchive', 'configure page should emit an X-Robots-Tag header')
    assert.doesNotMatch(configureHtml, />Manifest<\/a>/i, 'configure page should not render a manifest nav link')
    assert.match(configureHtml, /Windows Host App/, 'configure page should include the desktop host app console header')
    assert.match(configureHtml, /This page runs on the Windows host\./, 'configure page should include the desktop host app summary copy')
    assert.match(configureHtml, /<h2>LAN Bridge Fallback<\/h2>/, 'configure page should render LAN Bridge fallback section')
    assert.match(configureHtml, /<h2>Manual \/ Fallback<\/h2>/, 'configure page should render manual fallback section')
    assert.match(configureHtml, /id="installActionBtn"/, 'configure page should render install action button')
    assert.match(configureHtml, /Copy Install URL/, 'configure page should render a primary install url copy action')
    assert.match(configureHtml, /Copy Stremio Install Link/, 'configure page should render a dedicated Stremio install link copy action for LAN Bridge')
    assert.match(configureHtml, /primary install link should start with stremio:\/\//i, 'configure page should explain that the primary LAN Bridge install link must start with stremio://')
    assert.match(configureHtml, /Copy PC Local URL/, 'configure page should render same-PC local install action')
    assert.match(configureHtml, /testConnection\(\)/, 'configure page should expose test connection action')
    assert.match(configureHtml, /Auto Setup LAN Bridge/, 'configure page should render auto setup action')
    assert.match(configureHtml, /id="quickInstallLanBtn"/, 'configure page should render quick install button')
    assert.match(configureHtml, /auth\/stremio\/local-status/, 'configure page should check local Stremio status')
    assert.match(configureHtml, /id="qbitRuntimeStatus"/, 'configure page should render live qBittorrent runtime status')
    assert.match(configureHtml, /id="qbitAutoExtractEnabled"/, 'configure page should render the qBittorrent extraction-hook toggle')
    assert.match(configureHtml, /id="openProwlarrLink"/, 'configure page should render a direct Prowlarr launch link')
    assert.match(configureHtml, /id="openQbitLink"/, 'configure page should render a direct qBittorrent launch link')
    assert.match(configureHtml, /Change the actual qBittorrent save path/i, 'configure page should explain where to change the live qBittorrent save path')
    assert.match(configureHtml, /href="\/runbooks"/, 'configure page should link to runbooks')
    assert.match(configureHtml, /route-parity\.js/, 'configure page should load shared parity helper')
    assert.match(configureHtml, /id="appVersionStatus"/, 'configure page should show app version and update status at the top')
    assert.match(configureHtml, /fetch\('\/version-status\.json'/, 'configure page should check the runtime version endpoint')
    assert.match(configureHtml, /id="sportsPosterTemplate"[\s\S]*value="ticket-stub"/i, 'configure page should expose the single included Ticket Stub sports style')
    for (const template of ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'glitch']) {
      assert.doesNotMatch(configureHtml, new RegExp(`value="${template}"`, 'i'), `configure page should not expose ${template} as a free Sports Posters template`)
    }
    assert.match(configureHtml, /<select id="sportsPosterTemplate" disabled aria-disabled="true">/i, 'configure page should render the included sports style as locked')
    assert.match(
      configureHtml,
      /SportsMeta service owns sports metadata and artwork[\s\S]*PVTKRRX is the Stremio-facing frontend and consumes that output as presentation enrichment/i,
      'configure page should explain the SportsMeta-owned sports metadata/artwork boundary'
    )
    assert.doesNotMatch(configureHtml, /Prowlarr Base URL\s*-\s*<code>http:\/\/localhost:9696<\/code>/i, 'configure page should not present localhost as the default Remote Seedbox truth')
    assert.match(configureHtml, /Same-host setups use <code>http:\/\/127\.0\.0\.1:9696<\/code>\. Put the reachable URL here if Prowlarr runs on a different seedbox or VPS/i, 'configure page should explain when loopback is valid for Prowlarr')
    assert.match(configureHtml, /Same-host setups use <code>http:\/\/127\.0\.0\.1:8080<\/code>\. Put the reachable URL here if qBittorrent runs on a different seedbox or VPS/i, 'configure page should explain when loopback is valid for qBittorrent')
    assert.match(configureHtml, /That looks like this PC's local .*Remote Seedbox through the hosted relay needs a public URL/i, 'configure page should warn about stale PC-local values on the Remote Seedbox route')

    const versionStatusRes = await fetch(`${base}/version-status.json`)
    assert.equal(versionStatusRes.status, 200, 'GET /version-status.json should return 200')
    const versionStatus = await versionStatusRes.json()
    assert.equal(typeof versionStatus.ok, 'boolean')
    assert.equal(typeof versionStatus.currentVersion, 'string')
    assert.equal(typeof versionStatus.latestVersion, 'string')
    assert.equal(typeof versionStatus.updateAvailable, 'boolean')
    assert.equal(typeof versionStatus.latestReleaseUrl, 'string')
    assert.equal(typeof versionStatus.latestWindowsSetupDownloadUrl, 'string')
    assert.equal(typeof versionStatus.hasWindowsSetupDownload, 'boolean')

    const latestSetupDownloadRes = await fetch(`${base}/download/windows/setup?source=smoke_config`, {
      redirect: 'manual'
    })
    assert.equal(latestSetupDownloadRes.status, 302, 'GET /download/windows/setup should redirect')
    const latestSetupDownloadLocation = String(latestSetupDownloadRes.headers.get('location') || '')
    assert.match(
      latestSetupDownloadLocation,
      /^https:\/\/github\.com\/Kepners\/pvtkrrx\/releases(?:\/download\/|\/?$)/i,
      'setup download route should redirect to the GitHub release asset or release page'
    )

    const runbooksRes = await fetch(`${base}/runbooks`)
    assert.equal(runbooksRes.status, 200, 'GET /runbooks should return 200')
    const runbooksHtml = await runbooksRes.text()
    assert.match(runbooksHtml, /Seedbox Runbooks/, 'runbooks page should render heading')
    assert.match(runbooksHtml, /Whatbox Runbook/, 'runbooks page should include Whatbox runbook')
    assert.match(runbooksHtml, /Ultra\.cc Runbook/, 'runbooks page should include Ultra.cc runbook')
    assert.match(runbooksHtml, /<link rel="canonical" href="https:\/\/www\.pvtkrrx\.cc\/runbooks">/i, 'runbooks page should expose canonical metadata')
    assert.match(runbooksHtml, /<meta property="og:image" content="https:\/\/www\.pvtkrrx\.cc\/social\/pvtkrrx-runbooks\.png">/i, 'runbooks page should expose the runbooks social image')

    const sportsRes = await fetch(`${base}/sports`)
    assert.equal(sportsRes.status, 200, 'GET /sports should return 200')
    const sportsHtml = await sportsRes.text()
    assert.match(sportsHtml, /<link rel="canonical" href="https:\/\/www\.pvtkrrx\.cc\/sports">/i, 'sports page should expose canonical metadata')
    assert.match(sportsHtml, /<meta property="og:image" content="https:\/\/www\.pvtkrrx\.cc\/social\/pvtkrrx-sports\.png">/i, 'sports page should expose the sports social image')
    assert.match(sportsHtml, /Sports Posters/, 'sports page should render the Sports Posters offer')
    assert.match(sportsHtml, /One public page\. One SportsMeta checkout/, 'sports page should present PVTKRRX sports as the single public page')
    assert.match(sportsHtml, /Checkout on SportsMeta|Open SportsMeta Checkout/, 'sports page should treat SportsMeta as checkout rather than a second public pricing page')
    assert.doesNotMatch(sportsHtml, /data-checkout-interval="month"/, 'sports page should not advertise unavailable monthly checkout')
    assert.match(sportsHtml, /data-checkout-interval="year"/, 'sports page should expose yearly checkout')
    assert.doesNotMatch(sportsHtml, /Plus \/ Pro|Compare Plus|Pro adds|Open SportsMeta Pricing/i, 'sports page should not advertise stale tiers or a second pricing page')
    assert.match(sportsHtml, /\/sports\/billing\/checkout/, 'sports page should use the PVTKRRX checkout proxy')
    assert.doesNotMatch(sportsHtml, /href="\/configure"/i, 'sports page should not advertise public configure as a primary visitor action')

    const siteManifestRes = await fetch(`${base}/site.webmanifest`)
    assert.equal(siteManifestRes.status, 200, 'GET /site.webmanifest should return 200')
    const siteManifest = await siteManifestRes.json()
    assert.equal(siteManifest.name, 'PVTKRRX')
    assert.ok(Array.isArray(siteManifest.icons) && siteManifest.icons.some((icon) => icon?.src === '/android-chrome-192x192.png'), 'site web manifest should expose the app icons')

    const faviconRes = await fetch(`${base}/favicon.ico`)
    assert.equal(faviconRes.status, 200, 'GET /favicon.ico should return 200')

    await assertPngResponse(await fetch(`${base}/apple-touch-icon.png`), 'apple touch icon', 180, 180)
    await assertPngResponse(await fetch(`${base}/social/pvtkrrx-home.png`), 'home social image', 1200, 630)
    await assertPngResponse(await fetch(`${base}/social/pvtkrrx-sports.png`), 'sports social image', 1200, 630)
    await assertPngResponse(await fetch(`${base}/social/pvtkrrx-runbooks.png`), 'runbooks social image', 1200, 630)
    await assertPngResponse(await fetch(`${base}/social/pvtkrrx-configure.png`), 'configure social image', 1200, 630)

    const healthPageRes = await fetch(`${base}/health`, {
      headers: { Accept: 'text/html' }
    })
    assert.equal(healthPageRes.status, 200, 'GET /health with HTML accept should return 200')
    const healthHtml = await healthPageRes.text()
    assert.match(healthHtml, /<meta name="robots" content="noindex,nofollow,noarchive">/i, 'health page should not be indexable')
    assert.equal(String(healthPageRes.headers.get('x-robots-tag') || '').toLowerCase(), 'noindex, nofollow, noarchive', 'health page should emit an X-Robots-Tag header')

    const healthJsonRes = await fetch(`${base}/health?format=json`)
    assert.equal(healthJsonRes.status, 200, 'GET /health?format=json should return 200')
    assert.equal(String(healthJsonRes.headers.get('x-robots-tag') || '').toLowerCase(), 'noindex, nofollow, noarchive', 'health JSON should emit an X-Robots-Tag header')

    const sitemapRes = await fetch(`${base}/sitemap.xml`)
    assert.equal(sitemapRes.status, 200, 'GET /sitemap.xml should return 200')
    const sitemapXml = await sitemapRes.text()
    assert.match(sitemapXml, /<lastmod>2026-04-23<\/lastmod>/, 'sitemap should expose updated lastmod entries')
    assert.match(sitemapXml, /<loc>https:\/\/www\.pvtkrrx\.cc\/sports<\/loc>/, 'sitemap should include the sports page')

    const installLauncherRes = await fetch(`${base}/install-selfhost.sh`)
    assert.equal(installLauncherRes.status, 200, 'GET /install-selfhost.sh should return 200')
    const installLauncherText = await installLauncherRes.text()
    assert.match(installLauncherText, /^#!\/usr\/bin\/env bash/m, 'install launcher should serve the shell script payload')
    assert.match(installLauncherText, /RELEASE_MANIFEST_URL|PVTKRRX_RELEASE_MANIFEST_URL/, 'install launcher should include the release-manifest bootstrap logic')
    assert.match(installLauncherText, /PVTKRRX_SELF_HOST_HTTPS_MODE/, 'install launcher should expose the HTTPS mode selector')
    assert.match(installLauncherText, /Cloudflare Tunnel/i, 'install launcher should describe the Cloudflare Tunnel option')
    assert.match(installLauncherText, /scripts\/server-installer\.js/, 'install launcher should validate the extracted source contains the self-host installer')
    assert.match(installLauncherText, /retrying with branch/i, 'install launcher should retry from main when a pinned release is too old')

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
    assert.equal(normalizeRelayUrl('https://www.pvtkrrx.cc'), DEFAULT_PAIR_RELAY_URL)
    assert.equal(normalizeRelayUrl('https://www.pvtkrrx.cc/'), DEFAULT_PAIR_RELAY_URL)

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

    const expectedLinkedPairId = derivePairIdFromStremioUserId(LINKED_STREMIO_USER_ID)
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
    const autoProvisionPayload = await autoProvisionRes.json()
    assert.equal(String(autoProvisionPayload?.config?.stremioUserId || ''), LINKED_STREMIO_USER_ID, 'auto-provision should auto-link the signed-in local Stremio session')
    assert.equal(String(autoProvisionPayload?.config?.accountProvider || ''), 'stremio-authkey', 'auto-provision should persist the linked Stremio account provider')
    assert.equal(String(autoProvisionPayload?.config?.lanPairId || ''), expectedLinkedPairId, 'auto-provision should derive the LAN pair id from the linked Stremio user')
    assert.equal(String(autoProvisionPayload?.config?.routeProfile || ''), 'hybrid', 'auto-provision should promote the desktop home route to hybrid')
    assert.equal(Boolean(autoProvisionPayload?.config?.lanPairRequired), false, 'auto-provision should keep cloud fallback enabled for the desktop home route')

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
    assert.equal(String(localSavePayload.routeProfile || ''), 'hybrid', 'local config save should default the desktop home route to hybrid')
    assert.equal(Boolean(localSavePayload.lanPairRequired), false, 'local config save should keep hybrid LAN fallback optional')
    assert.equal(String(localConfig.routeProfile || ''), 'hybrid', 'local config readback should expose the hybrid home route')
    assert.equal(Boolean(localConfig.lanPairRequired), false, 'local config readback should keep hybrid LAN fallback optional')

    const staleLocalRemoteSeedboxRes = await requestJsonWithHeaders(
      port,
      'POST',
      '/encrypt',
      {
        ...sampleConfig,
        routeProfile: 'online',
        lanPairEnabled: false,
        lanPairRequired: false,
        fileServerUrl: 'https://files.example/media'
      },
      {
        Host: 'www.pvtkrrx.cc',
        'X-Forwarded-Proto': 'https'
      }
    )
    assert.equal(staleLocalRemoteSeedboxRes.status, 400, 'switching a saved localhost desktop config to explicit Remote Seedbox should be rejected')
    const staleLocalRemoteSeedboxPayload = staleLocalRemoteSeedboxRes.json || {}
    assert.equal(staleLocalRemoteSeedboxPayload.notifyUser, true)
    assert.equal(staleLocalRemoteSeedboxPayload.issueCode, 'REMOTE_SEEDBOX_REQUIRES_PUBLIC_URL')
    assert.match(String(staleLocalRemoteSeedboxPayload.error || ''), /publicly reachable URL/i)

    const localRepairSaveRes = await fetch(`${base}/local-config`, {
      method: 'POST',
      headers: withCsrf(csrf, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...sampleConfig,
        jackettApiKey: ''
      })
    })
    assert.equal(localRepairSaveRes.status, 200, 'POST /local-config should allow a blank local Prowlarr key for repair testing')
    const localRepairConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(localRepairConfigRes.status, 200, 'GET /local/config.json should trigger local Prowlarr repair when the key is missing')
    const localRepairConfig = await localRepairConfigRes.json()
    assert.equal(Boolean(localRepairConfig.savedSecrets?.jackettApiKey), true, 'local config repair should restore the saved Prowlarr API key')
    const repairedLocalConfig = loadSecureJsonFile(localConfigPath, { defaultValue: null })
    assert.equal(repairedLocalConfig?.jackettApiKey, 'recovered-prowlarr-key', 'local config repair should persist the discovered Prowlarr API key')

    const evilLocalConfigRes = await fetch(`${base}/local/config.json`, {
      headers: { Origin: 'https://evil.example' }
    })
    assert.equal(evilLocalConfigRes.status, 403, 'evil-origin local config readback should be blocked')

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
    assert.equal(String(linkedSavePayload.routeProfile || ''), 'hybrid', 'linked local config should keep the hybrid home route')
    assert.equal(Boolean(linkedSavePayload.lanPairRequired), false)
    assert.equal(linkedSavePayload.lanPairKey, undefined, 'linked save response should not expose lanPairKey')

    const linkedLocalConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(linkedLocalConfigRes.status, 200)
    const linkedLocalConfig = await linkedLocalConfigRes.json()
    assert.equal(String(linkedLocalConfig.stremioUserId || ''), LINKED_STREMIO_USER_ID)
    assert.equal(String(linkedLocalConfig.lanPairId || ''), expectedLinkedPairId)
    assert.equal(Boolean(linkedLocalConfig.savedSecrets?.lanPairKey), true)
    assert.equal(linkedLocalConfig.lanPairKey, undefined, 'linked local config readback should not expose lanPairKey')
    assert.deepEqual(linkedLocalConfig.additionalStorageRoots, sampleConfig.additionalStorageRoots)
    assert.equal(String(linkedLocalConfig.routeProfile || ''), 'hybrid', 'linked local config readback should expose the hybrid home route')
    assert.equal(Boolean(linkedLocalConfig.lanPairRequired), false, 'linked local config readback should keep hybrid LAN fallback optional')

    const persistedLinkedLocalConfig = loadSecureJsonFile(localConfigPath, { defaultValue: null })
    saveSecureJsonFile(localConfigPath, {
      ...sampleConfig,
      routeProfile: 'lan',
      lanPairEnabled: true,
      lanPairRequired: true,
      lanPairId: 'legacyPairId123',
      lanPairKey: 'legacyPairKeyABCDEFGHIJKLMNOPQRSTUVWX',
      lanPairRelayUrl: relayBase
    })
    const migratedLegacyConfigRes = await fetch(`${base}/local/config.json`)
    assert.equal(migratedLegacyConfigRes.status, 200, 'legacy desktop local config should still read back after migration')
    const migratedLegacyConfig = await migratedLegacyConfigRes.json()
    assert.equal(String(migratedLegacyConfig.routeProfile || ''), 'hybrid', 'legacy desktop LAN configs should auto-upgrade to hybrid')
    assert.equal(Boolean(migratedLegacyConfig.lanPairRequired), false, 'legacy desktop LAN configs should auto-upgrade to hybrid fallback')
    const persistedMigratedLegacyConfig = loadSecureJsonFile(localConfigPath, { defaultValue: null })
    assert.equal(String(persistedMigratedLegacyConfig?.routeProfile || ''), 'hybrid', 'legacy desktop local config migration should persist back to disk')
    assert.equal(Boolean(persistedMigratedLegacyConfig?.lanPairRequired), false, 'legacy desktop local config migration should persist hybrid fallback')
    saveSecureJsonFile(localConfigPath, persistedLinkedLocalConfig)

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
      body: JSON.stringify({
        pairId: expectedLinkedPairId,
        routeProfile: 'hybrid',
        lanPairRequired: false
      })
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
    assert.equal(String(relayEncryptPayload.routeProfile || ''), 'hybrid', 'relay mint should request the hybrid hosted profile')
    assert.equal(relayEncryptPayload.lanPairRequired, false, 'relay mint should keep hybrid LAN fallback optional')
    assert.throws(() => decrypt(localLanTokenPayload.token, LOCAL_SMOKE_SECRET), 'LAN Bridge token should no longer be encrypted with the local runtime secret')
    const lanBridgeTokenConfig = decrypt(localLanTokenPayload.token, RELAY_SMOKE_SECRET)
    assert.equal(String(lanBridgeTokenConfig.routeProfile || ''), 'hybrid', 'local hosted token should use the hybrid route profile')
    assert.equal(String(lanBridgeTokenConfig.lanPairId || ''), expectedLinkedPairId, 'LAN Bridge token should retain pair id')
    assert.equal(Boolean(String(lanBridgeTokenConfig.lanPairKey || '').trim()), true, 'LAN Bridge token should retain pair key')
    assert.equal(String(lanBridgeTokenConfig.localHostname || ''), 'pvtkrrx.local', 'LAN Bridge token should retain local hostname for the paired host')
    assert.equal(String(lanBridgeTokenConfig.lanPairRelayUrl || ''), relayBase, 'LAN Bridge token should retain relay URL')

    const localPairStatusRes = await fetch(`${base}/local/pair-status`)
    assert.equal(localPairStatusRes.status, 200, 'local pair status should proxy relay status')
    const localPairStatus = await localPairStatusRes.json()
    assert.equal(Boolean(localPairStatus?.ok), true)
    assert.equal(Boolean(localPairStatus?.online), true, 'local pair status should reflect relay-backed LAN status')
    assert.ok(Number(localPairStatus?.updatedAt || 0) > 0, 'local pair status should forward relay timestamps')

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
    assert.match(String(localManifest.name || ''), /^PVTKRR(?:\s|$)/, 'local manifest should keep the PVTKRR prefix')
    assert.match(String(localManifest.description || ''), /PC Local route/i, 'local manifest should identify the PC Local route')
    assert.match(String(localManifest.description || ''), /Prowlarr\/qBittorrent/i, 'local manifest should state the configured provider dependency')
    assert.equal(localManifest.behaviorHints?.configurationRequired, false)
    assert.deepEqual(localManifest.types, ['movie', 'series', 'sports'], 'local manifest should expose sports as a first-class type')
    assert.ok(Array.isArray(localManifest.catalogs) && localManifest.catalogs.some((catalog) => catalog?.id === 'pvtkrrx-sports' && catalog?.type === 'sports'), 'local manifest should expose sports through the sports catalog contract')
    const localSportsCatalogIds = localManifest.catalogs.filter((catalog) => catalog?.type === 'sports').map((catalog) => catalog?.id)
    assert.deepEqual(
      localSportsCatalogIds.slice(0, 4),
      ['pvtkrrx-sports', 'pvtkrrx-sports-football', 'pvtkrrx-sports-motorsport', 'pvtkrrx-sports-mma'],
      'local manifest should promote sports families to the front of sports discovery'
    )
    const footballCatalog = localManifest.catalogs.find((catalog) => catalog?.id === 'pvtkrrx-sports-football')
    assert.ok(footballCatalog?.extra?.some((extra) => extra?.name === 'genre' && extra?.options?.includes('Premier League') && extra?.options?.includes('Arsenal')), 'football discovery catalog should expose league/team detail filters')

    const bootstrapManifestRes = await fetch(`${base}/manifest.json`)
    assert.equal(bootstrapManifestRes.status, 200, 'GET /manifest.json should return 200')
    const bootstrapManifest = await bootstrapManifestRes.json()
    assert.equal(bootstrapManifest.id, 'com.kepners.pvtkrrx.bootstrap')
    assert.equal(
      bootstrapManifest.name,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_NAME,
      'root bootstrap manifest name must match the CLAUDE.md lock (PVTKRR — no Setup/Server/Desktop suffix)'
    )
    assert.equal(
      bootstrapManifest.description,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
      'root bootstrap manifest description must match the CLAUDE.md lock verbatim'
    )
    assert.equal(bootstrapManifest.behaviorHints?.configurationRequired, true)
    assert.deepEqual(bootstrapManifest.resources, [], 'root bootstrap manifest should not advertise addon resources')
    assert.deepEqual(bootstrapManifest.catalogs, [], 'root bootstrap manifest should not advertise addon catalogs')

    const bootstrapCatalogRes = await fetch(`${base}/catalog/sports/pvtkrrx-sports.json`)
    assert.equal(bootstrapCatalogRes.status, 200, 'GET /catalog/... without a config segment should stay compatible for stale root installs')
    const bootstrapCatalog = await bootstrapCatalogRes.json()
    assert.ok(Array.isArray(bootstrapCatalog.metas), 'root compatibility catalog should return metas array')

    const legacyLanManifestRes = await requestJsonWithHostHeader(port, '/local/manifest.json?mode=local', `192.168.50.48:${port}`)
    assert.equal(legacyLanManifestRes.status, 200, 'legacy same-LAN local manifest fetch should keep returning 200')
    assert.equal(legacyLanManifestRes.json?.id, 'com.kepners.pvtkrrx.local')
    assert.equal(
      legacyLanManifestRes.json?.behaviorHints?.configurationRequired,
      false,
      'legacy same-LAN local manifest fetch should not be downgraded to Configure-required'
    )

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
        lanPairRelayUrl: 'https://www.pvtkrrx.cc'
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
      lanPairRelayUrl: 'https://www.pvtkrrx.cc'
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
      lanPairRelayUrl: 'https://www.pvtkrrx.cc'
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
    assert.equal(tokenManifest.name, 'PVTKRR')
    assert.match(String(tokenManifest.description || ''), /Remote Seedbox route/i, 'hosted manifest should identify the Remote Seedbox route')
    assert.match(String(tokenManifest.description || ''), /public away-from-home playback/i, 'hosted manifest should state the public playback boundary')
    assert.equal(tokenManifest.behaviorHints?.configurable, true)
    assert.equal(tokenManifest.behaviorHints?.configurationRequired, false)
    assert.deepEqual(tokenManifest.types, ['movie', 'series', 'sports'], 'hosted manifest should expose sports as a first-class type')
    assert.ok(tokenManifest.resources?.some((resource) => resource?.name === 'stream' && Array.isArray(resource.types) && resource.types.includes('sports')), 'hosted manifest stream resource should advertise sports playback support')
    assert.ok(tokenManifest.catalogs?.some((catalog) => catalog?.id === 'pvtkrrx-sports' && catalog?.type === 'sports'), 'hosted manifest should register sports through the sports catalog contract')
    const hostedSportsCatalogIds = tokenManifest.catalogs.filter((catalog) => catalog?.type === 'sports').map((catalog) => catalog?.id)
    assert.deepEqual(
      hostedSportsCatalogIds.slice(0, 4),
      ['pvtkrrx-sports', 'pvtkrrx-sports-football', 'pvtkrrx-sports-motorsport', 'pvtkrrx-sports-mma'],
      'hosted manifest should keep sports families at the front of sports discovery'
    )

    const tokenManifestLocalRes = await fetch(`${base}/${token}/manifest.json?mode=local`)
    assert.equal(tokenManifestLocalRes.status, 200, 'GET /:token/manifest.json?mode=local should return 200')
    const tokenManifestLocal = await tokenManifestLocalRes.json()
    assert.equal(tokenManifestLocal.id, 'com.kepners.pvtkrrx.local')

    const tokenConfigureRes = await fetch(`${base}/${token}/configure`)
    assert.equal(tokenConfigureRes.status, 200, 'GET /:token/configure should return 200')
    const tokenConfigureHtml = await tokenConfigureRes.text()
    assert.match(tokenConfigureHtml, /<h1 class="logo-title" data-text="PVTKRRX"><span>PVTKRRX<\/span>(?:<span class="sr-only">[\s\S]*?<\/span>)?<\/h1>/)
    assert.match(tokenConfigureHtml, /Your hardware, your trackers.*configure the bridge to Stremio/i)
    assert.match(tokenConfigureHtml, /maybePrefillFromToken/, 'token configure page should include prefill loader')
    assert.match(tokenConfigureHtml, /clearRejectedServerAdminToken/, 'configure page should clear stale self-host passwords after rejection')

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
    assert.equal(
      rootManifest.name,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_NAME,
      'root bootstrap manifest name must match the CLAUDE.md lock'
    )
    assert.equal(
      rootManifest.description,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
      'root bootstrap manifest description must match the CLAUDE.md lock verbatim'
    )
    assert.equal(rootManifest.behaviorHints?.configurationRequired, true)
    assert.deepEqual(rootManifest.catalogs, [], 'root manifest should stay bootstrap-only')
    const rootHostedManifestRes = await fetch(`${base}/manifest.json?mode=hosted`)
    assert.equal(rootHostedManifestRes.status, 200, 'GET /manifest.json?mode=hosted should return 200')
    const rootHostedManifest = await rootHostedManifestRes.json()
    assert.equal(rootHostedManifest.id, 'com.kepners.pvtkrrx.bootstrap')
    assert.equal(
      rootHostedManifest.name,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_NAME,
      'hosted-mode root manifest name must match the CLAUDE.md lock'
    )
    assert.equal(
      rootHostedManifest.description,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
      'hosted-mode root manifest description must match the CLAUDE.md lock verbatim'
    )
    assert.equal(rootHostedManifest.behaviorHints?.configurationRequired, true)
    assert.deepEqual(rootHostedManifest.catalogs, [], 'hosted-mode root manifest should stay bootstrap-only')

    const publicBootstrapManifest = manifest.createBootstrapManifest('https://www.pvtkrrx.cc', {
      guideOnlyBootstrap: true
    })
    assert.equal(
      publicBootstrapManifest.name,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_NAME,
      'public-guide bootstrap manifest name must match the CLAUDE.md lock'
    )
    assert.equal(
      publicBootstrapManifest.description,
      manifest.PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
      'public-guide bootstrap manifest description must match the CLAUDE.md lock verbatim'
    )
    assert.doesNotMatch(String(publicBootstrapManifest.description || ''), /website only|guide only/i)
    assert.match(String(publicBootstrapManifest.description || ''), /Sports in Stremio are catalogued through SportsMeta/, 'public-guide description must keep the SportsMeta provenance sentence')
    assert.deepEqual(publicBootstrapManifest.resources, [], 'public root setup manifest should not advertise addon resources')
    assert.deepEqual(publicBootstrapManifest.catalogs, [], 'public root setup manifest should not advertise addon catalogs')

    const persistedLocalConfig = fs.readFileSync(localConfigPath, 'utf8')
    assert.ok(persistedLocalConfig.includes('__pvtkrrxSecure'), 'local config should be stored using secure-json wrapper')
    assert.ok(!persistedLocalConfig.includes(sampleConfig.jackettApiKey), 'local config file should not contain plaintext jackett api key')
    assert.ok(!persistedLocalConfig.includes(sampleConfig.qbitPassword), 'local config file should not contain plaintext qBit password')
    assert.ok(!persistedLocalConfig.includes('linked@example.com'), 'local config file should not contain linked account email')

    console.log('Smoke config flow passed')
    console.log(`Install link format: ${installLink}`)
  } finally {
    provisionModule.discoverProwlarrConfig = originalDiscoverProwlarrConfig
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
