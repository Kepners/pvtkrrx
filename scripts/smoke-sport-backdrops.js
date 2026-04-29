const assert = require('assert')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  REQUIRED_SPORT_BACKDROP_BUCKETS,
  resolveSportBackdrop,
  resolveSportBackdropBucket,
  sportBackdropPath
} = require('../src/utils/sportBackdrops')

async function assertBackdropFile(bucket) {
  const filePath = sportBackdropPath(bucket)
  assert.ok(fs.existsSync(filePath), `${bucket} backdrop must exist`)
  const stat = fs.statSync(filePath)
  const metadata = await sharp(filePath).metadata()
  assert.equal(metadata.width, 3840, `${bucket} backdrop width`)
  assert.equal(metadata.height, 2160, `${bucket} backdrop height`)
  assert.ok(metadata.width > metadata.height, `${bucket} backdrop must be landscape`)
  return {
    bucket,
    file: path.basename(filePath),
    width: metadata.width,
    height: metadata.height,
    bytes: stat.size
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
    { name: 'PGA/Golf', expected: 'golf', input: { sport: 'golf', league: 'PGA Tour', title: 'PGA Tour Highlights' } },
    { name: 'UFC', expected: 'ufc', input: { sport: 'mma', league: 'UFC', title: 'UFC Fight Night' } },
    { name: 'unknown', expected: 'generic-sport', input: { title: 'Unknown Sports Release' } }
  ]

  for (const testCase of cases) {
    const bucket = resolveSportBackdropBucket(testCase.input)
    assert.equal(bucket, testCase.expected, `${testCase.name} bucket`)
    const resolved = resolveSportBackdrop({ ...testCase.input, baseUrl: 'https://addon.test' })
    assert.ok(
      resolved.url.endsWith(`/sports-backdrops/${testCase.expected}-4k.jpg?v=20260429-sport-level-4k-v1`),
      `${testCase.name} URL should use ${testCase.expected}-4k`
    )
  }

  console.log(JSON.stringify({ ok: true, assets, cases }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
