const assert = require('node:assert/strict')
const http = require('node:http')

const { ensureProwlarrQbitDownloadClient } = require('../src/utils/provision')
const { isTryCloudflareUrl, resolveInstallPlaybackBaseUrl, resolveSelfHostHttpsMode } = require('./server-installer')

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch (_) {
        resolve({})
      }
    })
  })
}

function startMockProwlarr() {
  const state = {
    clients: [],
    createBody: null,
    updateBody: null,
    testBodies: []
  }

  const schema = {
    name: 'qBittorrent',
    implementationName: 'qBittorrent',
    implementation: 'qBittorrent',
    configContract: 'QBittorrentSettings',
    enable: false,
    protocol: 'torrent',
    priority: 1,
    categories: [],
    supportsCategories: true,
    fields: [
      { name: 'host', value: 'localhost' },
      { name: 'port', value: 8080 },
      { name: 'useSsl', value: false },
      { name: 'urlBase', value: '' },
      { name: 'username', value: '' },
      { name: 'password', value: '' },
      { name: 'category', value: 'prowlarr' },
      { name: 'priority', value: 1 },
      { name: 'initialState', value: 0 },
      { name: 'sequentialOrder', value: false },
      { name: 'firstAndLast', value: false },
      { name: 'contentLayout', value: 0 }
    ]
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.searchParams.get('apikey') !== 'test-key') {
      res.statusCode = 401
      res.end('unauthorized')
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/downloadclient') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(state.clients))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/downloadclient/schema') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([schema]))
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/downloadclient') {
      state.createBody = await readJsonBody(req)
      const created = { ...state.createBody, id: 1 }
      state.clients = [created]
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(created))
      return
    }

    if (req.method === 'PUT' && url.pathname === '/api/v1/downloadclient/1') {
      state.updateBody = await readJsonBody(req)
      const updated = { ...state.updateBody, id: 1 }
      state.clients = [updated]
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(updated))
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/downloadclient/test') {
      state.testBodies.push(await readJsonBody(req))
      res.statusCode = 200
      res.end('')
      return
    }

    res.statusCode = 404
    res.end('not found')
  })

  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, state }))
  })
}

async function run() {
  assert.equal(isTryCloudflareUrl('https://scanner-seeks-cent-ant.trycloudflare.com'), true)
  assert.equal(resolveSelfHostHttpsMode('', 'https://scanner-seeks-cent-ant.trycloudflare.com'), 'cloudflare')
  assert.equal(resolveSelfHostHttpsMode('', 'https://example.com'), 'domain')
  assert.equal(resolveSelfHostHttpsMode('domain', 'https://scanner-seeks-cent-ant.trycloudflare.com'), 'cloudflare')
  assert.equal(resolveInstallPlaybackBaseUrl('', 'https://seedbox.example.com', 'domain'), 'https://seedbox.example.com')
  assert.equal(resolveInstallPlaybackBaseUrl('', 'https://scanner-seeks-cent-ant.trycloudflare.com', 'cloudflare'), '')
  assert.equal(resolveInstallPlaybackBaseUrl('https://play.example.com', 'https://scanner-seeks-cent-ant.trycloudflare.com', 'cloudflare'), 'https://play.example.com')

  const { server, state } = await startMockProwlarr()
  try {
    const port = server.address().port
    const baseUrl = `http://127.0.0.1:${port}`

    const first = await ensureProwlarrQbitDownloadClient({
      prowlarrUrl: baseUrl,
      prowlarrApiKey: 'test-key',
      qbitUrl: 'http://127.0.0.1:8090/qbittorrent',
      qbitUsername: 'admin',
      qbitPassword: 'secret'
    })
    assert.equal(first.ok, true)
    assert.equal(first.action, 'created')
    assert.equal(state.testBodies.length, 1)
    assert.equal(state.createBody.name, 'qBittorrent')
    assert.equal(state.createBody.enable, true)
    assert.equal(state.createBody.protocol, 'torrent')
    assert.equal(state.createBody.fields.find((field) => field.name === 'host')?.value, '127.0.0.1')
    assert.equal(state.createBody.fields.find((field) => field.name === 'port')?.value, 8090)
    assert.equal(state.createBody.fields.find((field) => field.name === 'useSsl')?.value, false)
    assert.equal(state.createBody.fields.find((field) => field.name === 'urlBase')?.value, 'qbittorrent')
    assert.equal(state.createBody.fields.find((field) => field.name === 'username')?.value, 'admin')
    assert.equal(state.createBody.fields.find((field) => field.name === 'password')?.value, 'secret')
    assert.equal(state.createBody.fields.find((field) => field.name === 'category')?.value, 'prowlarr')
    assert.equal(state.createBody.fields.find((field) => field.name === 'priority')?.value, 0)

    const second = await ensureProwlarrQbitDownloadClient({
      prowlarrUrl: baseUrl,
      prowlarrApiKey: 'test-key',
      qbitUrl: 'https://seedbox.example.com/qbittorrent',
      qbitUsername: '',
      qbitPassword: ''
    })
    assert.equal(second.ok, true)
    assert.equal(second.action, 'updated')
    assert.equal(state.testBodies.length, 2)
    assert.equal(state.updateBody.fields.find((field) => field.name === 'host')?.value, 'seedbox.example.com')
    assert.equal(state.updateBody.fields.find((field) => field.name === 'port')?.value, 443)
    assert.equal(state.updateBody.fields.find((field) => field.name === 'useSsl')?.value, true)
    assert.equal(state.updateBody.fields.find((field) => field.name === 'urlBase')?.value, 'qbittorrent')
    assert.equal(state.updateBody.fields.find((field) => field.name === 'priority')?.value, 0)
  } finally {
    server.close()
  }
}

run()
  .then(() => {
    console.log('Smoke Prowlarr qBit link passed')
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
