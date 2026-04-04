const assert = require('node:assert/strict')
const fs = require('node:fs')

const installer = require('./server-installer')

function captureSummary() {
  const originalWriteSync = fs.writeSync
  let captured = ''

  fs.writeSync = (fd, data) => {
    if (fd === 1) {
      captured += Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
    }
    return 0
  }

  try {
    installer.printWorkingUrlSummary(
      'https://scanner-seeks-cent-ant.trycloudflare.com',
      'https://scanner-seeks-cent-ant.trycloudflare.com/configure#serverPassword=abc123',
      'https://scanner-seeks-cent-ant.trycloudflare.com'
    )
  } finally {
    fs.writeSync = originalWriteSync
  }

  return captured
}

try {
  const output = captureSummary()
  assert.match(output, /Working public URLs:/)
  assert.match(output, /PVTKRRX URL: https:\/\/scanner-seeks-cent-ant\.trycloudflare\.com/)
  assert.match(output, /Configure URL: https:\/\/scanner-seeks-cent-ant\.trycloudflare\.com\/configure/)
  assert.match(output, /Bootstrap URL: https:\/\/scanner-seeks-cent-ant\.trycloudflare\.com\/configure#serverPassword=abc123/)
  assert.match(output, /Self-host manifest URL: https:\/\/scanner-seeks-cent-ant\.trycloudflare\.com\/selfhost\/manifest\.json\?mode=hosted/)
  assert.doesNotMatch(output, /\[redacted-url\]/)
  console.log('Smoke installer summary URLs passed')
} catch (error) {
  console.error('Smoke installer summary URLs failed')
  console.error(error)
  process.exit(1)
}
