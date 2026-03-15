const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'local-smoke-secret-12345678901234567890'
process.env.VERCEL = '1'
process.env.PVTKRRX_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-runtime-guards-'))

const { encrypt } = require('../src/utils/crypto')
const { encodePlaybackStateToken } = require('../src/utils/opaqueState')
const app = require('../index')

function request(port, method, reqPath, body = null, headers = {}) {
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
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try {
          json = text ? JSON.parse(text) : null
        } catch (_) {
          json = null
        }
        resolve({
          status: Number(res.statusCode || 0),
          headers: res.headers || {},
          text,
          json
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function run() {
  const server = http.createServer(app)
  await new Promise(resolve => server.listen(0, resolve))

  try {
    const port = server.address().port
    const hostedConfig = {
      jackettUrl: 'https://seedbox.example',
      jackettApiKey: 'dummy-key',
      qbitUrl: 'https://seedbox.example',
      qbitUsername: 'demo',
      qbitPassword: 'demo',
      fileServerUrl: '',
      fileServerAuth: '',
      pathMapping: { from: '', to: '' },
      maxResults: 50,
      lanPairEnabled: false,
      lanPairRequired: false
    }
    const token = encodeURIComponent(encrypt(hostedConfig, process.env.ENCRYPTION_SECRET))
    const playbackInfo = encodePlaybackStateToken({
      h: '0123456789abcdef0123456789abcdef01234567',
      l: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'
    })

    const hostedPlayback = await request(
      port,
      'GET',
      `/${token}/playback/${playbackInfo}`,
      null,
      {
        Host: 'pvtkrrx.vercel.app',
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(hostedPlayback.status, 403, 'hosted /playback should fail fast on Vercel runtime')
    assert.match(String(hostedPlayback.json?.error || ''), /disabled on hosted runtime/i)

    const remoteNoOrigin = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'https://example.com',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'https://example.org',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Host: 'pvtkrrx.vercel.app',
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remoteNoOrigin.status, 403, 'remote direct test-connection call should be rejected')

    const remotePrivateTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://192.168.1.5:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Host: 'pvtkrrx.vercel.app',
        Origin: 'https://pvtkrrx.vercel.app',
        Referer: 'https://pvtkrrx.vercel.app/configure',
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remotePrivateTarget.status, 403, 'hosted test-connection should block LAN/loopback targets')
    assert.match(String(remotePrivateTarget.json?.error || ''), /cannot probe loopback, lan, or \.local targets/i)

    const remotePublicTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'https://example.com',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'https://example.org',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Host: 'pvtkrrx.vercel.app',
        Origin: 'https://pvtkrrx.vercel.app',
        Referer: 'https://pvtkrrx.vercel.app/configure',
        'X-Forwarded-For': '203.0.113.10'
      }
    )
    assert.equal(remotePublicTarget.status, 200, 'hosted configure test should still accept public targets')
    assert.equal(typeof remotePublicTarget.json?.jackett, 'boolean')
    assert.equal(typeof remotePublicTarget.json?.qbit, 'boolean')

    const localPrivateTarget = await request(
      port,
      'POST',
      '/test-connection',
      {
        jackettUrl: 'http://127.0.0.1:9696',
        jackettApiKey: 'dummy-key',
        qbitUrl: 'http://127.0.0.1:8080',
        qbitUsername: 'demo',
        qbitPassword: 'demo'
      },
      {
        Host: `127.0.0.1:${port}`
      }
    )
    assert.equal(localPrivateTarget.status, 200, 'local configure should still be able to test loopback targets')

    console.log('Smoke runtime guards passed')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch((error) => {
  console.error('Smoke runtime guards failed')
  console.error(error)
  process.exit(1)
})
