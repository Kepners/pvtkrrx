const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sportsmeta-catalogue-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.PVTKRRX_SPORTSMETA_DEFAULT_TIER = 'svg'

const {
  closeSportsMetaCatalogue,
  getSportsMetaCatalogueStats,
  importSportsMetaCatalogue,
  upsertSportsMetaEntitlement
} = require('../src/utils/sportsmetaCatalogue')
const { handleSportsMetaEvent } = require('../src/handlers/sportsmeta')
const { SportsDbClient } = require('../src/clients/sportsdb')

function writeCacheEntry(cacheDir, cacheKey, sourceUrl, ext, contentType, content) {
  fs.writeFileSync(path.join(cacheDir, `${cacheKey}${ext}`), content)
  fs.writeFileSync(
    path.join(cacheDir, `${cacheKey}.json`),
    JSON.stringify({
      version: 1,
      cacheKey,
      sourceUrl,
      contentType,
      ext,
      size: content.length,
      fetchedAt: Date.now(),
      lastAccessedAt: Date.now()
    }),
    'utf8'
  )
}

async function main() {
  const cacheDir = path.join(runtimeDir, 'sports-image-cache')
  fs.mkdirSync(cacheDir, { recursive: true })

  writeCacheEntry(
    cacheDir,
    'poster-cache',
    'https://images.example.com/poster.jpg',
    '.jpg',
    'image/jpeg',
    Buffer.from('poster-bytes')
  )
  writeCacheEntry(
    cacheDir,
    'landscape-cache',
    'https://images.example.com/landscape.jpg',
    '.jpg',
    'image/jpeg',
    Buffer.from('landscape-bytes')
  )
  writeCacheEntry(
    cacheDir,
    'background-cache',
    'https://images.example.com/background.jpg',
    '.jpg',
    'image/jpeg',
    Buffer.from('background-bytes')
  )
  writeCacheEntry(
    cacheDir,
    'logo-cache',
    'https://images.example.com/logo.png',
    '.png',
    'image/png',
    Buffer.from('logo-bytes')
  )
  writeCacheEntry(
    cacheDir,
    'home-badge-cache',
    'https://images.example.com/home-badge.png',
    '.png',
    'image/png',
    Buffer.from('home-badge-bytes')
  )
  writeCacheEntry(
    cacheDir,
    'away-badge-cache',
    'https://images.example.com/away-badge.png',
    '.png',
    'image/png',
    Buffer.from('away-badge-bytes')
  )

  fs.writeFileSync(
    path.join(runtimeDir, 'sportsdb-poster-cache.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          key: 'v5|event-artwork|123|sportsmeta-smoke-event',
          value: {
            image: 'https://images.example.com/landscape.jpg',
            poster: 'https://images.example.com/poster.jpg',
            landscapeImage: 'https://images.example.com/landscape.jpg',
            backgroundImage: 'https://images.example.com/background.jpg',
            logo: 'https://images.example.com/logo.png',
            leagueLogo: 'https://images.example.com/logo.png',
            homeBadge: 'https://images.example.com/home-badge.png',
            awayBadge: 'https://images.example.com/away-badge.png',
            eventId: 'sportsmeta-smoke-event',
            eventName: 'Oklahoma City Thunder vs LA Clippers',
            eventDate: '2026-04-08',
            sport: 'Basketball',
            league: 'NBA',
            homeTeam: 'Oklahoma City Thunder',
            awayTeam: 'LA Clippers',
            source: 'thesportsdb-seeded'
          }
        }
      ]
    }),
    'utf8'
  )

  const summary = importSportsMetaCatalogue({ runtimeDir })
  assert.equal(summary.assetCount, 6)
  assert.equal(summary.recordCount, 1)
  assert.equal(summary.aliasCount, 4)

  const stats = getSportsMetaCatalogueStats({ runtimeDir })
  assert.equal(stats.assetCount, 6)
  assert.equal(stats.recordCount, 1)
  assert.equal(stats.aliasCount, 4)

  fs.writeFileSync(
    path.join(runtimeDir, 'sportsdb-poster-cache.json'),
    JSON.stringify({
      version: 1,
      entries: []
    }),
    'utf8'
  )

  const catalogueBackedArtwork = await new SportsDbClient('123').getEventArtwork({
    league: 'NBA',
    date: '2026-04-08',
    homeTeam: 'Oklahoma City Thunder',
    awayTeam: 'LA Clippers',
    sportHint: 'basketball'
  })
  assert.equal(catalogueBackedArtwork?.eventId, 'sportsmeta-smoke-event')
  assert.equal(catalogueBackedArtwork?.league, 'NBA')

  upsertSportsMetaEntitlement({
    accountUserId: 'usr_sportsmeta_smoke',
    tier: 'sportsmeta',
    plan: 'annual',
    expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000),
    source: 'smoke'
  }, { runtimeDir })

  const originalGetEventArtwork = SportsDbClient.prototype.getEventArtwork
  SportsDbClient.prototype.getEventArtwork = async () => {
    throw new Error('SportsDbClient fallback should not run when catalogue already has the record')
  }

  try {
    const result = await handleSportsMetaEvent({
      accountUserId: 'usr_sportsmeta_smoke'
    }, {
      league: 'NBA',
      date: '2026-04-08',
      home: 'Oklahoma City Thunder',
      away: 'LA Clippers'
    }, {
      baseUrl: 'http://127.0.0.1:7000'
    })

    assert.equal(result.match, true)
    assert.equal(result.resolved, true)
    assert.equal(result.event?.eventId, 'sportsmeta-smoke-event')
    assert.equal(result.tier, 'sportsmeta')
    assert.match(String(result.artwork?.poster || ''), /\/image\/sports\/poster\//i)
    assert.match(String(result.artwork?.thumb || ''), /\/image\/sports\/landscape\//i)
    assert.match(String(result.artwork?.background || ''), /\/image\/sports\/background\//i)
    assert.match(String(result.artwork?.leagueLogo || ''), /\/image\/sports\/logo\//i)
  } finally {
    SportsDbClient.prototype.getEventArtwork = originalGetEventArtwork
    closeSportsMetaCatalogue({ runtimeDir })
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }

  console.log('Smoke SportsMeta catalogue passed')
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
