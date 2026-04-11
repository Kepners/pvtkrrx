const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvtkrrx-sportsmeta-'))
process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'pvtkrrx-sportsmeta-smoke-secret'
process.env.PVTKRRX_SPORTSMETA_DEFAULT_TIER = 'svg'

const { encrypt } = require('../src/utils/crypto')
const { saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const { SportsDbClient } = require('../src/clients/sportsdb')
const { closeSportsMetaCatalogue } = require('../src/utils/sportsmetaCatalogue')

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  return {
    status: res.status,
    json: await res.json()
  }
}

async function main() {
  const originalGetEventArtwork = SportsDbClient.prototype.getEventArtwork
  SportsDbClient.prototype.getEventArtwork = async (input = {}) => ({
    poster: 'https://images.example.com/poster.jpg',
    image: 'https://images.example.com/landscape.jpg',
    landscapeImage: 'https://images.example.com/landscape.jpg',
    backgroundImage: 'https://images.example.com/background.jpg',
    logo: 'https://images.example.com/league-logo.png',
    leagueLogo: 'https://images.example.com/league-logo.png',
    homeBadge: 'https://images.example.com/home-badge.png',
    awayBadge: 'https://images.example.com/away-badge.png',
    eventId: 'sportsmeta-smoke-event',
    eventDate: String(input?.date || '2026-04-08'),
    league: 'NBA',
    eventName: 'Oklahoma City Thunder vs LA Clippers',
    homeTeam: 'Oklahoma City Thunder',
    awayTeam: 'LA Clippers',
    source: 'thesportsdb'
  })

  const localConfigPath = path.join(runtimeDir, 'local-config.json')
  saveSecureJsonFile(localConfigPath, {
    sportsDbApiKey: 'smoke-sports-key'
  })

  const app = require('../index')
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const { port } = server.address()
    const baseUrl = `http://127.0.0.1:${port}`
    const sportsmetaToken = encodeURIComponent(encrypt({
      sportsDbApiKey: 'smoke-sports-key',
      sportsmetaTier: 'sportsmeta'
    }, process.env.ENCRYPTION_SECRET))

    const freeResult = await fetchJson(
      `${baseUrl}/sportsmeta/event?title=NBA.2026.04.08.Oklahoma.City.Thunder.vs.LA.Clippers.1080p`
    )
    assert.equal(freeResult.status, 200, 'root SportsMeta route should return 200')
    assert.equal(freeResult.json.match, true)
    assert.equal(freeResult.json.resolved, true)
    assert.equal(freeResult.json.tier, 'svg')
    assert.equal(freeResult.json.event?.league, 'NBA')
    assert.match(String(freeResult.json.artwork?.poster || ''), /\/thumb\/sports\/poster\/.+\.svg$/i)
    assert.match(String(freeResult.json.artwork?.thumb || ''), /\/thumb\/sports\/.+\.svg$/i)
    assert.match(String(freeResult.json.artwork?.background || ''), /\/thumb\/sports\/background\/.+\.svg$/i)
    assert.equal(freeResult.json.artwork?.homeBadge, null)
    assert.equal(freeResult.json.artwork?.awayBadge, null)
    assert.equal(freeResult.json.artwork?.leagueLogo, null)

    const paidResult = await fetchJson(
      `${baseUrl}/${sportsmetaToken}/sportsmeta/event?title=NBA.2026.04.08.Oklahoma.City.Thunder.vs.LA.Clippers.1080p`
    )
    assert.equal(paidResult.status, 200, 'token SportsMeta route should return 200')
    assert.equal(paidResult.json.match, true)
    assert.equal(paidResult.json.resolved, true)
    assert.equal(paidResult.json.tier, 'sportsmeta')
    assert.match(String(paidResult.json.artwork?.poster || ''), /\/image\/sports\/poster\//i)
    assert.match(String(paidResult.json.artwork?.thumb || ''), /\/image\/sports\/landscape\//i)
    assert.match(String(paidResult.json.artwork?.background || ''), /\/image\/sports\/background\//i)
    assert.match(String(paidResult.json.artwork?.leagueLogo || ''), /\/image\/sports\/logo\//i)
    assert.match(String(paidResult.json.artwork?.homeBadge || ''), /\/image\/sports\/logo\//i)
    assert.match(String(paidResult.json.artwork?.awayBadge || ''), /\/image\/sports\/logo\//i)

    const missResult = await fetchJson(`${baseUrl}/sportsmeta/event`)
    assert.equal(missResult.status, 200, 'empty SportsMeta requests should still return 200')
    assert.equal(missResult.json.match, false)
    assert.equal(missResult.json.resolved, false)
    assert.equal(missResult.json.event, null)
    assert.equal(missResult.json.artwork, null)

    console.log('Smoke SportsMeta route passed')
  } finally {
    SportsDbClient.prototype.getEventArtwork = originalGetEventArtwork
    await new Promise((resolve) => server.close(resolve))
    closeSportsMetaCatalogue({ runtimeDir })
    fs.rmSync(runtimeDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
