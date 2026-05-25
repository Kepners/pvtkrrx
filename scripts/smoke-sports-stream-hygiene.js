const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { isAdultContentResult } = require('../src/utils/adultContentFilter')

const rootDir = path.join(__dirname, '..')
const streamSource = fs.readFileSync(path.join(rootDir, 'src', 'handlers', 'stream.js'), 'utf8')

assert.equal(
  isAdultContentResult({
    title: 'AFL 360 2026 05 25 Monday Footy 1080p',
    indexer: 'SportsCult',
    categoryIds: ['5060'],
    categoryNames: ['TV/Sport']
  }),
  false,
  'normal sports result should pass'
)

assert.equal(
  isAdultContentResult({
    title: 'WWE Raw 2026 05 25 1080p',
    indexer: 'SportsCult',
    categoryIds: ['5060'],
    categoryNames: ['TV/Sport']
  }),
  false,
  'wrestling Raw should not be blocked by adult filter'
)

assert.equal(
  isAdultContentResult({
    title: 'Unrelated adult release',
    indexer: 'IPTorrents',
    categoryIds: ['6000'],
    categoryNames: ['XXX']
  }),
  true,
  'Torznab adult category should be blocked'
)

assert.equal(
  isAdultContentResult({
    title: 'Example wet pussy release',
    indexer: 'IPTorrents',
    categoryIds: [],
    categoryNames: []
  }),
  true,
  'adult title terms should be blocked even without category metadata'
)

assert.equal(
  streamSource.includes('runSportsProwlarrSearch(torznab, query, false'),
  false,
  'sports supplemental search must not fall back to all Prowlarr categories'
)

console.log('[smoke-sports-stream-hygiene] PASS')
