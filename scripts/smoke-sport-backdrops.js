// Guards source/public mirror parity for the approved 4K JPG sport backdrops
// in backdrops/python-backdrops/<sport>-4k.jpg vs public/sports-backdrops/.
// This is NOT a check on the Python SVG generators that share the folder name —
// those are a separate, unused experimental family. See backdrops/python-backdrops/README.md.
const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  REQUIRED_SPORT_BACKDROP_BUCKETS,
  resolveSportBackdrop,
  resolveSportBackdropBucket,
  sportBackdropPath
} = require('../src/utils/sportBackdrops')

const SOURCE_BACKDROP_DIR = path.join(__dirname, '..', 'backdrops', 'python-backdrops')

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

async function assertBackdropFile(bucket) {
  const publicPath = sportBackdropPath(bucket)
  const sourcePath = path.join(SOURCE_BACKDROP_DIR, `${bucket}-4k.jpg`)
  assert.ok(fs.existsSync(sourcePath), `${bucket} source backdrop must exist`)
  assert.ok(fs.existsSync(publicPath), `${bucket} public backdrop must exist`)
  const sourceStat = fs.statSync(sourcePath)
  const publicStat = fs.statSync(publicPath)
  const metadata = await sharp(publicPath).metadata()
  assert.equal(metadata.width, 3840, `${bucket} backdrop width`)
  assert.equal(metadata.height, 2160, `${bucket} backdrop height`)
  assert.equal(metadata.format, 'jpeg', `${bucket} backdrop format`)
  assert.ok(metadata.width > metadata.height, `${bucket} backdrop must be landscape`)
  const sourceHash = sha256(sourcePath)
  const publicHash = sha256(publicPath)
  assert.equal(publicHash, sourceHash, `${bucket} public mirror must match source`)
  return {
    bucket,
    sourceFile: path.relative(path.join(__dirname, '..'), sourcePath),
    publicFile: path.relative(path.join(__dirname, '..'), publicPath),
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    sourceBytes: sourceStat.size,
    publicBytes: publicStat.size,
    sha256: publicHash
  }
}

async function main() {
  const assets = []
  for (const bucket of REQUIRED_SPORT_BACKDROP_BUCKETS) {
    assets.push(await assertBackdropFile(bucket))
  }

  const cases = [
    { name: 'EPL', expected: 'football', input: { sport: 'football', league: 'EPL', title: 'EPL Arsenal vs Chelsea' } },
    { name: 'FA Cup', expected: 'football', input: { league: 'FA Cup', title: 'FA Cup Round Five' } },
    { name: 'UCL', expected: 'football', input: { league: 'UCL', title: 'UEFA Champions League' } },
    { name: 'La Liga', expected: 'football', input: { league: 'La Liga', title: 'Real Madrid vs Barcelona' } },
    { name: 'UFC', expected: 'ufc', input: { sport: 'mma', league: 'UFC', title: 'UFC Fight Night' } },
    { name: 'F1', expected: 'formula1', input: { sport: 'motorsport', league: 'F1', title: 'Formula 1 Grand Prix' } },
    { name: 'MotoGP', expected: 'motogp', input: { sport: 'motorsport', league: 'MotoGP', title: 'MotoGP Brazil Gear Up', layoutFamily: 'BROADCAST' } },
    // template-contract.md §2 row 17 + Q5.1: WRC/NASCAR/IndyCar/Supercars/
    // WEC/Formula E/Dakar/etc. ROUTE to the planned `motorsport` bucket. The
    // asset is Phase 5 backlog so the resolver falls back to generic-sport
    // when checking file existence (resolvedBucket below).
    { name: 'WRC routes to motorsport bucket', expected: 'motorsport', resolvedBucket: 'generic-sport', input: { sport: 'motorsport', league: 'WRC Spain', title: 'Islas Canarias Saturday Highlights', layoutFamily: 'BROADCAST' } },
    { name: 'generic motorsport routes to motorsport bucket', expected: 'motorsport', resolvedBucket: 'generic-sport', input: { sport: 'motorsport', league: 'Motorsport', title: 'Rally Highlights', layoutFamily: 'BROADCAST' } },
    // Phase 5 backlog: snooker/table-tennis/badminton route to their planned
    // buckets but fall back to generic-sport at file-resolve time.
    { name: 'snooker routes to snooker bucket', expected: 'snooker', resolvedBucket: 'generic-sport', input: { sport: 'snooker', league: 'World Snooker', title: 'Crucible Final', layoutFamily: 'BROADCAST' } },
    { name: 'table-tennis routes to table-tennis bucket', expected: 'table-tennis', resolvedBucket: 'generic-sport', input: { sport: 'table-tennis', league: 'ITTF', title: 'Table Tennis World Tour' } },
    { name: 'badminton routes to badminton bucket', expected: 'badminton', resolvedBucket: 'generic-sport', input: { sport: 'badminton', league: 'BWF', title: 'Badminton All England Open' } },
    { name: 'PGA/Golf', expected: 'golf', input: { sport: 'golf', league: 'PGA Tour', title: 'PGA Tour Highlights' } },
    { name: 'unknown', expected: 'generic-sport', input: { title: 'Unknown Sports Release' } }
  ]

  for (const testCase of cases) {
    const bucket = resolveSportBackdropBucket(testCase.input)
    assert.equal(bucket, testCase.expected, `${testCase.name} bucket intent`)
    const resolved = resolveSportBackdrop({ ...testCase.input, baseUrl: 'https://addon.test' })
    // For Phase 5 backlog buckets the intent (testCase.expected) and the
    // resolved-with-file-check bucket (testCase.resolvedBucket) differ
    // until the asset ships. resolvedBucket falls back to generic-sport.
    const urlBucket = testCase.resolvedBucket || testCase.expected
    assert.ok(
      resolved.url.endsWith(`/sports-backdrops/${urlBucket}-4k.jpg?v=20260429-sport-level-4k-v1`),
      `${testCase.name} URL should use ${urlBucket}-4k`
    )
    if (testCase.fallbackReason) {
      assert.equal(resolved.fallbackReason, testCase.fallbackReason, `${testCase.name} fallback reason`)
    }
  }

  console.log(JSON.stringify({ ok: true, assets, cases }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
