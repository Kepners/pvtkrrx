const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-provider-discovery-'))
  const prowlarrData = path.join(tempRoot, 'prowlarr')
  const qbitData = path.join(tempRoot, 'qbit')
  const downloadsDir = path.join(tempRoot, 'downloads')
  const originalEnv = {
    PVTKRRX_PROWLARR_DATA: process.env.PVTKRRX_PROWLARR_DATA,
    PVTKRRX_QBIT_DATA: process.env.PVTKRRX_QBIT_DATA,
    PVTKRRX_QBIT_USER: process.env.PVTKRRX_QBIT_USER,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    ProgramData: process.env.ProgramData
  }

  try {
    fs.mkdirSync(prowlarrData, { recursive: true })
    fs.mkdirSync(path.join(qbitData, '.config', 'qBittorrent'), { recursive: true })
    fs.mkdirSync(downloadsDir, { recursive: true })

    fs.writeFileSync(
      path.join(prowlarrData, 'config.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<Config>
  <Port>9797</Port>
  <ApiKey>discovery-prowlarr-key</ApiKey>
  <UrlBase>prowlarr</UrlBase>
</Config>
`,
      'utf8'
    )

    fs.writeFileSync(
      path.join(qbitData, '.config', 'qBittorrent', 'qBittorrent.conf'),
      `[Preferences]
WebUI\\Port=8090
WebUI\\Username=admin
WebUI\\LocalHostAuth=false
Session\\DefaultSavePath=${downloadsDir}
`,
      'utf8'
    )

    process.env.PVTKRRX_PROWLARR_DATA = prowlarrData
    process.env.PVTKRRX_QBIT_DATA = qbitData
    process.env.PVTKRRX_QBIT_USER = ''

    const {
      discoverProwlarrConfig,
      discoverQbitConfig
    } = require('../src/utils/provision')

    const prowlarr = await discoverProwlarrConfig({ useHints: false })
    const qbit = await discoverQbitConfig({ useHints: false })

    assert.equal(prowlarr.installed, true)
    assert.equal(prowlarr.configPath, path.join(prowlarrData, 'config.xml'))
    assert.equal(prowlarr.url, 'http://127.0.0.1:9797/prowlarr')
    assert.equal(prowlarr.apiKey, 'discovery-prowlarr-key')

    assert.equal(qbit.installed, true)
    assert.equal(qbit.configPath, path.join(qbitData, '.config', 'qBittorrent', 'qBittorrent.conf'))
    assert.equal(qbit.url, 'http://127.0.0.1:8090')
    assert.equal(qbit.username, 'admin')
    assert.equal(qbit.savePath, downloadsDir)
    assert.equal(qbit.localHostAuthDisabled, true)

    const isolatedEnvRoot = path.join(tempRoot, 'isolated-env')
    fs.mkdirSync(isolatedEnvRoot, { recursive: true })
    process.env.PVTKRRX_PROWLARR_DATA = path.join(isolatedEnvRoot, 'missing-prowlarr')
    process.env.PVTKRRX_QBIT_DATA = path.join(isolatedEnvRoot, 'missing-qbit')
    process.env.PVTKRRX_QBIT_USER = ''
    process.env.HOME = isolatedEnvRoot
    process.env.USERPROFILE = isolatedEnvRoot
    process.env.APPDATA = isolatedEnvRoot
    process.env.LOCALAPPDATA = isolatedEnvRoot
    process.env.ProgramData = isolatedEnvRoot

    const missingProwlarr = await discoverProwlarrConfig({ useHints: false })
    const missingQbit = await discoverQbitConfig({ useHints: false })

    assert.equal(missingProwlarr.installed, false)
    assert.equal(missingProwlarr.url, '', 'discovery must not invent a localhost Prowlarr URL when nothing was detected on this host')
    assert.equal(missingProwlarr.apiKey, '')

    assert.equal(missingQbit.installed, false)
    assert.equal(missingQbit.url, '', 'discovery must not invent a localhost qBittorrent URL when nothing was detected on this host')
    assert.equal(missingQbit.username, '')
    assert.equal(missingQbit.savePath, '')

    console.log('Provider discovery smoke passed')
  } finally {
    if (originalEnv.PVTKRRX_PROWLARR_DATA === undefined) delete process.env.PVTKRRX_PROWLARR_DATA
    else process.env.PVTKRRX_PROWLARR_DATA = originalEnv.PVTKRRX_PROWLARR_DATA

    if (originalEnv.PVTKRRX_QBIT_DATA === undefined) delete process.env.PVTKRRX_QBIT_DATA
    else process.env.PVTKRRX_QBIT_DATA = originalEnv.PVTKRRX_QBIT_DATA

    if (originalEnv.PVTKRRX_QBIT_USER === undefined) delete process.env.PVTKRRX_QBIT_USER
    else process.env.PVTKRRX_QBIT_USER = originalEnv.PVTKRRX_QBIT_USER

    if (originalEnv.HOME === undefined) delete process.env.HOME
    else process.env.HOME = originalEnv.HOME

    if (originalEnv.USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalEnv.USERPROFILE

    if (originalEnv.APPDATA === undefined) delete process.env.APPDATA
    else process.env.APPDATA = originalEnv.APPDATA

    if (originalEnv.LOCALAPPDATA === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = originalEnv.LOCALAPPDATA

    if (originalEnv.ProgramData === undefined) delete process.env.ProgramData
    else process.env.ProgramData = originalEnv.ProgramData

    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch (_) {}
  }
}

run().catch((error) => {
  console.error('Provider discovery smoke failed')
  console.error(error)
  process.exit(1)
})
