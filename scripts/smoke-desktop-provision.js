const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const mainPath = path.join(__dirname, '..', 'electron', 'main.js')
const source = fs.readFileSync(mainPath, 'utf8')

assert.match(source, /async function runProvisionOnlyMode\(/, 'desktop provision-only mode should still exist')
assert.match(source, /async function bootstrapAutoProvision\(/, 'desktop bootstrap auto-provision should still exist')
assert.match(source, /\/auto-provision/, 'desktop bootstrap should still call the local auto-provision route')
assert.match(source, /powerSaveBlocker\.start\(/, 'desktop runtime should keep a power blocker available so Windows lock\/screen-off does not suspend hosting')
assert.match(source, /powerMonitor\.on\('resume'/, 'desktop runtime should react to system resume events')
assert.match(source, /powerMonitor\.on\('lock-screen'/, 'desktop runtime should log lock-screen events for troubleshooting')
assert.match(source, /app\.getLoginItemSettings\(/, 'desktop runtime should be able to read the Windows startup setting')
assert.match(source, /app\.setLoginItemSettings\(/, 'desktop runtime should be able to toggle the Windows startup setting')
assert.match(source, /const startupLaunchMode = process\.argv\.includes\(STARTUP_LAUNCH_ARG\)/, 'desktop runtime should detect Windows startup launches')
assert.match(source, /hideMainWindowToTray\('startup-launch'\)/, 'desktop runtime should boot hidden in the tray for startup launches')
assert.match(source, /PVTKRRX_DESKTOP_LOCAL_ONLY\s*=\s*'true'/, 'desktop runtime should force the Windows EXE into local-only mode')
assert.match(source, /PVTKRRX_SELF_HOST_MODE\s*=\s*'false'/, 'desktop runtime should not inherit self-host server mode from ambient env')
assert.match(source, /version-status\.json/, 'desktop runtime should proxy the release-status route from the local server')

const preloadPath = path.join(__dirname, '..', 'electron', 'preload.js')
const preloadSource = fs.readFileSync(preloadPath, 'utf8')
assert.match(preloadSource, /getVersionStatus/, 'desktop preload should expose the release-status IPC bridge')

assert.doesNotMatch(
  source,
  /persistProvisionConfig\s*\(/,
  'desktop should not write raw or readback auto-provision payloads back into local-config'
)

assert.doesNotMatch(
  source,
  /require\('\.\/provisionPersistence'\)/,
  'desktop should not depend on the removed provision persistence helper'
)

const popupPath = path.join(__dirname, '..', 'electron', 'popup.html')
const popupSource = fs.readFileSync(popupPath, 'utf8')
assert.match(popupSource, /id="startupToggle"/, 'desktop popup should expose a startup toggle')
assert.match(popupSource, /Launch PVTKRRX when Windows starts/i, 'desktop popup should explain the startup toggle')
assert.match(popupSource, /id="releaseCard"/, 'desktop popup should render release status')
assert.match(popupSource, /id="releaseLink"/, 'desktop popup should render a release link')

console.log('Smoke desktop provision flow passed')
