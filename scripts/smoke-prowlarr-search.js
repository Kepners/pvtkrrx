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

    // One request carrying every category, NOT one request per category.
    //
    // This assertion used to demand the opposite. The per-category fan-out was
    // deliberately replaced on 2026-08-11 because it multiplied tracker traffic
    // elevenfold and private trackers rate-limit exactly that: hd-torrents.org
    // answered 429 "wait 13 seconds", a search went from 4.3s to over 200s, and
    // Stremio got zero streams. Prowlarr returns the same union either way —
    // measured 64 results both ways for "Game of Thrones S01E01".
    //
    // The test was left asserting the old shape, so it failed permanently and
    // stopped being able to report a real regression.
    assert.equal(state.searchCalls.length, 1, 'a multi-category search must be ONE Prowlarr call, not one call per category')
    assert.deepEqual(
      state.searchCalls.map(call => call.categories),
      [['2040', '2080']]
    )
    assert.equal(results.length, 2, 'grouped category search should merge and dedupe results')
    assert.deepEqual(
      results.map(item => item.link).sort(),
      [
        'https://tracker.example/movie-name-1080p.torrent',
        'https://tracker.example/movie-name-720p.torrent'
      ]
    )

    // A tracker that never answers must fail fast, not hang.
    //
    // This block used to assert per-category PARTIAL results: with one request
    // per category, the fast category could return while the slow one was still
    // running. Folding the categories into a single request (2026-08-11, to stop
    // trackers rate-limiting us) traded that away for a tenth of the traffic, so
    // partial results are no longer possible by design.
    //
    // The guarantee that still matters — and that this now protects — is that the
    // search gives up at its own timeout instead of holding Stremio until every
    // internal deadline expires, which is exactly how one throttled tracker used
    // to turn into zero streams for everything.
    const quickStart = Date.now()
    await assert.rejects(
      client.search('Movie Name', '2040,2050', 'search', {
        useCategories: true,
        timeoutMs: 500,
        categoryGroupTimeoutMs: 500
      }),
      'a search whose tracker never answers must reject rather than hang'
    )
    assert.ok(Date.now() - quickStart < 2000, 'a timing-out search must give up at its own timeout, not wait on the tracker')
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
