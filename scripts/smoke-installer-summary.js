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
      'https://pvtkrrx.mooo.com',
      'https://pvtkrrx.mooo.com/configure#serverPassword=abc123',
      'https://pvtkrrx.mooo.com'
    )
  } finally {
    fs.writeSync = originalWriteSync
  }

  return captured
}

try {
  const output = captureSummary()
  assert.match(output, /Working public URLs:/)
  assert.match(output, /PVTKRRX URL: https:\/\/pvtkrrx\.mooo\.com/)
  assert.match(output, /Configure URL: https:\/\/pvtkrrx\.mooo\.com\/configure/)
  assert.match(output, /Bootstrap URL: https:\/\/pvtkrrx\.mooo\.com\/configure#serverPassword=abc123/)
  assert.match(output, /Self-host manifest URL: https:\/\/pvtkrrx\.mooo\.com\/selfhost\/manifest\.json\?mode=hosted/)
  assert.doesNotMatch(output, /\[redacted-url\]/)
  console.log('Smoke installer summary URLs passed')
} catch (error) {
  console.error('Smoke installer summary URLs failed')
  console.error(error)
  process.exit(1)
}
