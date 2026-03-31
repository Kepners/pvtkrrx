const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  buildLocalModeUrls,
  isBlockedPrivateTargetHost,
  stripRemoteSeedboxLanFields
} = require('../public/route-parity')
const { resolveRuntimeDir } = require('../src/utils/runtimeDir')

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}

function run() {
  const localUrls = buildLocalModeUrls('127.0.0.1', 7000, 7001)
  assert.equal(localUrls.httpManifest, 'http://127.0.0.1:7000/local/manifest.json?mode=local')
  assert.equal(localUrls.httpsManifest, 'https://127.0.0.1:7001/local/manifest.json?mode=local')
  assert.equal(localUrls.stremio, 'stremio://127.0.0.1:7000/local/manifest.json?mode=local')
  assert.equal(localUrls.stremioHttps, 'stremio://127.0.0.1:7001/local/manifest.json?mode=local')
  assert.notEqual(localUrls.stremio, localUrls.stremioHttps)

  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    'foo.localhost',
    'printer.local',
    '10.24.5.9',
    '192.168.1.44',
    '172.16.0.2',
    '172.31.255.254',
    '169.254.10.20',
    'fc00::1',
    'fd12::abcd',
    'fe80::abcd',
    'host.docker.internal',
    '0.0.0.0',
    '127.0.0.1.nip.io',
    '127-0-0-1.sslip.io',
    'app.lvh.me',
    'app.localtest.me'
  ]
  for (const host of blockedHosts) {
    assert.equal(isBlockedPrivateTargetHost(host), true, `${host} should be blocked as a private/loopback target`)
  }

  const publicHosts = ['example.com', 'seedbox.example', '8.8.8.8', '2001:4860:4860::8888']
  for (const host of publicHosts) {
    assert.equal(isBlockedPrivateTargetHost(host), false, `${host} should remain a public target`)
  }

  const remoteSeedboxPayload = stripRemoteSeedboxLanFields({
    lanPairEnabled: true,
    lanPairRequired: true,
    lanPairId: 'pair_id',
    lanPairKey: 'pair_key',
    lanPairOwnerId: 'pair_owner',
    lanPairRelayUrl: 'https://pvtkrrx.vercel.app',
    localHostname: 'pvtkrrx.local',
    localHostnameCustom: true,
    fileServerUrl: 'https://files.example/media'
  })
  assert.equal(remoteSeedboxPayload.lanPairEnabled, false)
  assert.equal(remoteSeedboxPayload.lanPairRequired, false)
  assert.equal(remoteSeedboxPayload.lanPairId, undefined)
  assert.equal(remoteSeedboxPayload.lanPairKey, undefined)
  assert.equal(remoteSeedboxPayload.lanPairOwnerId, undefined)
  assert.equal(remoteSeedboxPayload.lanPairRelayUrl, undefined)
  assert.equal(remoteSeedboxPayload.localHostname, undefined)
  assert.equal(remoteSeedboxPayload.localHostnameCustom, undefined)
  assert.equal(remoteSeedboxPayload.fileServerUrl, 'https://files.example/media')

  const remoteSeedboxWithRelay = stripRemoteSeedboxLanFields({
    lanPairId: 'pair_id',
    lanPairKey: 'pair_key',
    lanPairRelayUrl: 'https://pvtkrrx.vercel.app'
  }, { keepRelayUrl: true })
  assert.equal(remoteSeedboxWithRelay.lanPairRelayUrl, 'https://pvtkrrx.vercel.app')
  assert.equal(remoteSeedboxWithRelay.lanPairId, undefined)
  assert.equal(remoteSeedboxWithRelay.lanPairKey, undefined)

  const appData = 'C:\\Users\\Demo\\AppData\\Roaming'
  assert.equal(
    resolveRuntimeDir({ APPDATA: appData }, { platform: 'win32' }),
    path.join(appData, 'PVTKRRX', 'runtime'),
    'default Windows runtime dir should resolve under %APPDATA%'
  )
  assert.equal(
    resolveRuntimeDir({ PVTKRRX_RUNTIME_DIR: 'D:\\PVTKRRX\\runtime', APPDATA: appData }, { platform: 'win32' }),
    'D:\\PVTKRRX\\runtime',
    'runtime dir override should win everywhere'
  )
  assert.equal(
    resolveRuntimeDir({ HOME: '/home/demo' }, { platform: 'linux', cwd: '/tmp/pvtkrrx-dev' }),
    path.normalize('/home/demo/.local/share/PVTKRRX/runtime'),
    'default Linux runtime dir should resolve under XDG data home'
  )
  assert.equal(
    resolveRuntimeDir({ HOME: '/home/demo', XDG_DATA_HOME: '/srv/pvtkrrx-data' }, { platform: 'linux', cwd: '/tmp/pvtkrrx-dev' }),
    path.normalize('/srv/pvtkrrx-data/PVTKRRX/runtime'),
    'Linux runtime dir should honor XDG_DATA_HOME'
  )

  assert.match(read('src/lib/shared.js'), /resolveRuntimeDir/, 'server shared runtime should use the runtime dir helper')
  assert.match(read('electron/main.js'), /resolveRuntimeDir/, 'Electron should use shared runtime dir helper')
  assert.match(read('src/clients/sportsdb.js'), /resolveRuntimeDir/, 'SportsDB cache should use shared runtime dir helper')
  assert.match(read('public/configure.html'), /route-parity\.js/, 'configure UI should load the shared route parity helper')

  console.log('Smoke parity helpers passed')
}

try {
  run()
} catch (error) {
  console.error('Smoke parity helpers failed')
  console.error(error)
  process.exit(1)
}
