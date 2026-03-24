const assert = require('node:assert/strict')
const { redactSensitiveText, redactSensitiveArgs } = require('../src/utils/logRedaction')

function run() {
  const redacted = redactSensitiveText(
    '[playback-route] tracker=https://tracker.example/download/abc?passkey=secret ' +
    'path=C:\\Media\\Movie Name.mkv pairKey=ABCDEFGHIJKLMNOPQRSTUVWX ' +
    'stremioUserId=stremio_user_abc123 authKey=good-authkey-1234567890'
  )

  assert.ok(!redacted.includes('tracker.example'), 'tracker URLs should be redacted from logs')
  assert.ok(!redacted.includes('passkey=secret'), 'tracker query secrets should be redacted from logs')
  assert.ok(!redacted.includes('C:\\Media\\Movie Name.mkv'), 'windows file paths with spaces should be redacted from logs')
  assert.ok(!redacted.includes('ABCDEFGHIJKLMNOPQRSTUVWX'), 'pair keys should be redacted from logs')
  assert.ok(!redacted.includes('stremio_user_abc123'), 'auth identifiers should be redacted from logs')
  assert.ok(!redacted.includes('good-authkey-1234567890'), 'auth keys should be redacted from logs')

  const args = redactSensitiveArgs([
    'file not found at /mnt/media/My Movie/file name.mkv',
    new Error('tracker https://tracker.example/download/abc?t=secret failed for C:\\Media\\Movie Name.mkv')
  ])
  assert.ok(!String(args[0] || '').includes('/mnt/media/My Movie/file name.mkv'), 'unix paths with spaces should be redacted from log args')
  assert.ok(!String(args[1]?.message || '').includes('tracker.example'), 'error messages should be redacted in log args')
  assert.ok(!String(args[1]?.message || '').includes('C:\\Media\\Movie Name.mkv'), 'error messages should redact windows paths with spaces')

  console.log('Smoke log redaction passed')
}

try {
  run()
} catch (error) {
  console.error('Smoke log redaction failed')
  console.error(error)
  process.exit(1)
}
