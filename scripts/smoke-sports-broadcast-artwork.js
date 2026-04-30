const assert = require('assert')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  resolveSportsBackgroundAsset,
  resolveSportsLandscapeAsset,
  resolveSportsPosterAsset
} = require('../src/utils/sportsArtwork')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const OUTPUT_DIR = path.join(__dirname, '..', '.runtime', 'sports-broadcast-smoke')
const BASE_URL = 'https://addon.test'

const cases = [
  {
    slug: 'wrc',
    input: 'WRC Spain Islas Canarias Saturday Highlights',
    labelPattern: /\b(?:WRC|MOTORSPORT)\b/i,
    titlePattern: /ISLAS|CANARIAS|HIGHLIGHTS/i,
    mustNotMatch: [/FORMULA\s*1/i, /\bF1\b/i, />ICS</i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: true,
    forbidFormulaBackdrop: true,
    expectedSport: /motorsport/i
  },
  {
    slug: 'motogp',
    input: 'MotoGP Brazil Gear Up',
    labelPattern: /\bMOTOGP\b/i,
    titlePattern: /GEAR|UP/i,
    mustNotMatch: [/FORMULA\s*1/i, /\bF1\b/i, />ICS</i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: true,
    forbidFormulaBackdrop: true,
    expectedSport: /motorsport/i
  },
  {
    slug: 'snooker',
    input: 'John Higgins vs Shaun Murphy WC',
    labelPattern: /\b(?:SNOOKER|WC|WORLD\s+CHAMPIONSHIP)\b/i,
    titlePattern: /JOHN\s+HIGGINS|SHAUN\s+MURPHY/i,
    mustNotMatch: [/>ICS</i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: false,
    expectedSport: /snooker/i
  },
  {
    slug: 'basketball',
    input: 'Houston Rockets vs Los Angeles Lakers',
    labelPattern: /\b(?:NBA|BASKETBALL)\b/i,
    titlePattern: /HOUSTON\s+ROCKETS|LOS\s+ANGELES\s+LAKERS/i,
    mustNotMatch: [/>ICS</i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: false,
    expectedSport: /basketball/i
  }
]

function compactEvent(normalized, eventClass) {
  return {
    sport: normalized.sport,
    league: normalized.competition,
    title: normalized.eventTitle,
    eventTitle: normalized.eventTitle,
    eventName: normalized.eventName,
    eventShort: normalized.eventShort,
    eventDetail: normalized.eventDetail || '',
    homeTeam: normalized.homeTeam || '',
    awayTeam: normalized.awayTeam || '',
    principalA: normalized.principalA || normalized.homeTeam || '',
    principalB: normalized.principalB || normalized.awayTeam || '',
    rawTitle: normalized.rawTitle,
    source: normalized.source,
    eventClass
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const results = []

  for (const testCase of cases) {
    const normalized = normalizeSportsEventMetadata({
      rawTitle: testCase.input,
      source: 'prowlarr'
    })
    const eventClass = classifySportsEvent({
      ...normalized,
      sport: normalized.sport,
      league: normalized.competition,
      title: normalized.eventTitle,
      eventTitle: normalized.eventTitle,
      rawTitle: normalized.rawTitle
    })
    const event = compactEvent(normalized, eventClass)
    const artwork = renderSportsPosterTemplateSvg({
      event,
      variant: 'poster',
      template: 'broadcast'
    })
    const svg = artwork.svg
    const artworkInput = {
      baseUrl: BASE_URL,
      sportsPosterTemplate: 'broadcast',
      sportHint: normalized.sport,
      league: normalized.competition,
      title: normalized.eventTitle,
      homeTeam: normalized.homeTeam || '',
      awayTeam: normalized.awayTeam || '',
      eventDetail: normalized.eventDetail || '',
      eventClass,
      rawTitle: normalized.rawTitle,
      source: normalized.source
    }
    const posterResolved = resolveSportsPosterAsset(artworkInput)
    const background = resolveSportsLandscapeAsset(artworkInput) || resolveSportsBackgroundAsset(artworkInput)

    assert.equal(artwork.layoutFamily, 'BROADCAST', `${testCase.slug} SVG layout family`)
    assert.equal(posterResolved.layoutFamily, 'BROADCAST', `${testCase.slug} poster layout family`)
    assert.equal(posterResolved.selectedTemplate, 'broadcast', `${testCase.slug} selected template`)
    assert.match(posterResolved.poster, /template=broadcast/, `${testCase.slug} poster URL template`)
    assert.match(background, /\/sports-backdrops\//, `${testCase.slug} background must use sport backdrop asset`)
    assert.doesNotMatch(background, /glitch/i, `${testCase.slug} background must not use glitch`)
    assert.match(svg, /data-layout-family="BROADCAST"/, `${testCase.slug} SVG explicit layout family marker`)
    assert.match(svg, testCase.labelPattern, `${testCase.slug} sport or league label`)
    assert.match(svg, testCase.titlePattern, `${testCase.slug} readable title text`)
    assert.match(normalized.sport, testCase.expectedSport, `${testCase.slug} normalized sport`)
    assert.equal((artwork.slots || []).length, 0, `${testCase.slug} broadcast poster must not allocate fake logo slots`)

    if (testCase.forbidVs) {
      assert.doesNotMatch(svg, /data-role="broadcast-versus"|>VS</i, `${testCase.slug} must not force VS`)
    }
    if (testCase.forbidFormulaBackdrop) {
      assert.doesNotMatch(background, /formula1/i, `${testCase.slug} background must not use Formula 1`)
    }
    assert.doesNotMatch(svg, /M10,60 L30,60 L40,48 L60,48/i, `${testCase.slug} must not render F1 car glyph`)
    for (const pattern of testCase.mustNotMatch) {
      assert.doesNotMatch(svg, pattern, `${testCase.slug} forbidden SVG pattern ${pattern}`)
    }

    const outputPath = path.join(OUTPUT_DIR, `${testCase.slug}-broadcast.png`)
    const buffer = await sharp(Buffer.from(svg), { density: 192 })
      .resize({ width: 600, height: 900, fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
    await fs.promises.writeFile(outputPath, buffer)
    const metadata = await sharp(buffer).metadata()
    assert.equal(metadata.width, 600, `${testCase.slug} rendered width`)
    assert.equal(metadata.height, 900, `${testCase.slug} rendered height`)

    results.push({
      slug: testCase.slug,
      input: testCase.input,
      normalizedSport: normalized.sport,
      normalizedLeague: normalized.competition,
      eventTitle: normalized.eventTitle,
      eventClass,
      layoutFamily: posterResolved.layoutFamily,
      poster: posterResolved.poster,
      background,
      preview: path.relative(path.join(__dirname, '..'), outputPath)
    })
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
