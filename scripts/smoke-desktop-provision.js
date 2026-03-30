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

console.log('Smoke desktop provision flow passed')
