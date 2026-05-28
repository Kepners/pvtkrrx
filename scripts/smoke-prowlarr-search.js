const assert = require('node:assert/strict')
const http = require('node:http')

const { ProwlarrClient } = require('../src/clients/prowlarr')

function startMockProwlarr() {
  const state = {
    searchCalls: []
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.searchParams.get('apikey') !== 'test-key') {
      res.statusCode = 401
      res.end('unauthorized')
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/indexer') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([]))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/search') {
      const categories = url.searchParams.getAll('categories')
      state.searchCalls.push({
        query: url.searchParams.get('query'),
        type: url.searchParams.get('type'),
        categories
      })

      if (categories.includes('2050')) {
        const timer = setTimeout(() => {
          if (!res.writableEnded) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify([]))
          }
        }, 5000)
        timer.unref()
        return
      }

      if (categories.some(cat => cat.includes(','))) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ errors: { categories: ['comma category lists are invalid'] } }))
        return
      }

      const rows = []
      if (categories.includes('2040')) {
        rows.push({
          title: 'Movie Name 2026 1080p WEB-DL x264',
          downloadUrl: 'https://tracker.example/movie-name-1080p.torrent',
          size: 2_800_000_000,
          seeders: 12,
          indexer: 'MockHD',
          categories: [{ id: 2040, name: 'Movies/HD' }]
        })
      }
      if (categories.includes('2080')) {
        rows.push({
          title: 'Movie Name 2026 1080p WEB-DL x264',
          downloadUrl: 'https://tracker.example/movie-name-1080p.torrent',
          size: 2_800_000_000,
          seeders: 12,
          indexer: 'MockWEB',
          categories: [{ id: 2080, name: 'Movies/WEB-DL' }]
        })
        rows.push({
          title: 'Movie Name 2026 720p WEB-DL x264',
          downloadUrl: 'https://tracker.example/movie-name-720p.torrent',
          size: 1_400_000_000,
          seeders: 6,
          indexer: 'MockWEB',
          categories: [{ id: 2080, name: 'Movies/WEB-DL' }]
        })
      }

      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(rows))
      return
    }

    res.statusCode = 404
    res.end('not found')
  })

  return new Promise(resolve => {
    server.listen(0, () => resolve({ server, state }))
  })
}

async function run() {
  const { server, state } = await startMockProwlarr()
  try {
    const client = new ProwlarrClient(`http://127.0.0.1:${server.address().port}`, 'test-key')
    const results = await client.search('Movie Name', '2040,2080', 'search', {
      useCategories: true,
      timeoutMs: 5000
    })

    assert.equal(state.searchCalls.length, 2, 'comma-separated category lists must be split into per-category Prowlarr searches')
    assert.deepEqual(
      state.searchCalls.map(call => call.categories).sort(),
      [['2040'], ['2080']]
    )
    assert.equal(results.length, 2, 'split category search should merge and dedupe per-category results')
    assert.deepEqual(
      results.map(item => item.link).sort(),
      [
        'https://tracker.example/movie-name-1080p.torrent',
        'https://tracker.example/movie-name-720p.torrent'
      ]
    )

    const quickStart = Date.now()
    const partialResults = await client.search('Movie Name', '2040,2050', 'search', {
      useCategories: true,
      timeoutMs: 500,
      categoryGroupTimeoutMs: 500
    })
    assert.ok(Date.now() - quickStart < 2000, 'grouped category search should return completed partial results instead of waiting for every slow category')
    assert.equal(partialResults.length, 1)
    assert.equal(partialResults[0].link, 'https://tracker.example/movie-name-1080p.torrent')
  } finally {
    server.close()
  }
}

run()
  .then(() => {
    console.log('Smoke Prowlarr search passed')
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
