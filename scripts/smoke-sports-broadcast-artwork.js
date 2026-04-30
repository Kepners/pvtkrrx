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
const BROADCAST_WORDMARK = 'PVTKRRX \u00b7 BROADCAST'

const cases = [
  {
    slug: 'wrc',
    input: 'WRC Spain Islas Canarias Saturday Highlights',
    labelPattern: /\b(?:WRC|MOTORSPORT)\b/i,
    titlePattern: /ISLAS|CANARIAS|HIGHLIGHTS/i,
    mustNotMatch: [/FORMULA\s*1/i, /\bF1\b/i, /\bICS\b/i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: true,
    forbidFormulaBackdrop: true,
    expectedSport: /motorsport/i
  },
  {
    slug: 'motogp',
    input: 'MotoGP Brazil Gear Up',
    labelPattern: /\bMOTOGP\b/i,
    titlePattern: /GEAR|UP/i,
    mustNotMatch: [/FORMULA\s*1/i, /\bF1\b/i, /\bICS\b/i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: true,
    forbidFormulaBackdrop: true,
    expectedSport: /motorsport/i
  },
  {
    slug: 'snooker',
    input: 'John Higgins vs Shaun Murphy WC',
    labelPattern: /\b(?:SNOOKER|WC|WORLD\s+CHAMPIONSHIP)\b/i,
    titlePattern: /JOHN\s+HIGGINS|SHAUN\s+MURPHY/i,
    mustNotMatch: [/\bICS\b/i, /data-role="broadcast-live"/i, />LIVE</i],
    forbidVs: false,
    expectedSport: /snooker/i
  },
  {
    slug: 'basketball',
    input: 'Houston Rockets vs Los Angeles Lakers',
    labelPattern: /\b(?:NBA|BASKETBALL)\b/i,
    titlePattern: /HOUSTON\s+ROCKETS|LOS\s+ANGELES\s+LAKERS/i,
    mustNotMatch: [/\bICS\b/i, /data-role="broadcast-live"/i, />LIVE</i],
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

function textForRole(svg, role) {
  const match = svg.match(new RegExp(`data-role="${role}"[^>]*>([^<]*)`, 'i'))
  return match ? match[1] : ''
}

function textListForRole(svg, role) {
  return [...svg.matchAll(new RegExp(`data-role="${role}"[^>]*>([^<]*)`, 'gi'))].map((match) => match[1])
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
    assert.match(svg, /viewBox="0 0 600 900"/, `${testCase.slug} native 600x900 viewBox`)
    assert.match(svg, /data-layout-family="BROADCAST"/, `${testCase.slug} SVG explicit layout family marker`)
    assert.match(svg, /data-layout-style="sportsmeta-default-poster"/, `${testCase.slug} Broadcast default-poster style marker`)
    assert.match(svg, /data-role="inner-border"/, `${testCase.slug} inner border marker`)
    assert.match(svg, /data-role="accent-top"/, `${testCase.slug} top accent stripe marker`)
    assert.match(svg, /data-role="accent-bottom"/, `${testCase.slug} bottom accent stripe marker`)
    assert.match(svg, /data-role="pill-badge"/, `${testCase.slug} pill badge marker`)
    assert.match(svg, /data-role="broadcast-pattern"/, `${testCase.slug} sport pattern marker`)
    assert.match(svg, /data-role="broadcast-title"[^>]*(?:class="broadcast-title"|font-family="[^"]*Inter)/i, `${testCase.slug} Inter-style Broadcast title marker`)
    assert.match(svg, testCase.labelPattern, `${testCase.slug} sport or league label`)
    assert.match(svg, testCase.titlePattern, `${testCase.slug} readable title text`)
    assert.match(svg, new RegExp(BROADCAST_WORDMARK), `${testCase.slug} honest Broadcast wordmark`)
    assert.match(normalized.sport, testCase.expectedSport, `${testCase.slug} normalized sport`)
    assert.equal((artwork.slots || []).length, 0, `${testCase.slug} broadcast poster must not allocate fake logo slots`)
    assert.doesNotMatch(svg, /viewBox="0 0 400 600"/, `${testCase.slug} must not wrap old 400x600 source`)
    assert.doesNotMatch(svg, /data-role="broadcast-title"[^>]*class="bebas"/i, `${testCase.slug} Broadcast title must not use Bebas`)
    assert.doesNotMatch(svg, /homeGrad/i, `${testCase.slug} must not use homeGrad`)
    assert.doesNotMatch(svg, /awayGrad/i, `${testCase.slug} must not use awayGrad`)
    assert.doesNotMatch(svg, /lowerThird/i, `${testCase.slug} must not use old lowerThird block`)
    assert.doesNotMatch(svg, /\bTBA\b/i, `${testCase.slug} must not render TBA placeholder`)
    assert.doesNotMatch(svg, /\.{3,}/, `${testCase.slug} must not render ellipsis truncation`)
    assert.doesNotMatch(svg, /\bICS\b/i, `${testCase.slug} must not render fake title acronym badge`)

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

    const titleSafeRightX = 560
    const titleLeftX = 50
    const titleSafeWidth = titleSafeRightX - titleLeftX
    const titleMatches = [...svg.matchAll(/<text\s+data-role="broadcast-title"[^>]*font-size="(\d+)"[^>]*>([^<]+)<\/text>/g)]
    assert.ok(titleMatches.length > 0, `${testCase.slug} must emit broadcast-title text`)
    for (const match of titleMatches) {
      const fontSize = Number(match[1])
      const text = match[2]
      const estWidth = text.length * fontSize * 0.58
      assert.ok(
        estWidth <= titleSafeWidth,
        `${testCase.slug} title line "${text}" at ${fontSize}px ~${Math.round(estWidth)}px > ${titleSafeWidth}px safe width`
      )
    }

    const svgOutputPath = path.join(OUTPUT_DIR, `${testCase.slug}-broadcast.svg`)
    await fs.promises.writeFile(svgOutputPath, svg)

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
      renderedTitle: textListForRole(svg, 'broadcast-title').join(' '),
      renderedLabel: textForRole(svg, 'broadcast-label'),
      renderedSubtitle: textForRole(svg, 'broadcast-subtitle'),
      hasTba: /\bTBA\b/i.test(svg),
      hasEllipsis: /\.{3,}/.test(svg),
      hasHomeAwayGrad: /homeGrad|awayGrad/i.test(svg),
      layoutFamily: posterResolved.layoutFamily,
      poster: posterResolved.poster,
      background,
      svg: path.relative(path.join(__dirname, '..'), svgOutputPath),
      preview: path.relative(path.join(__dirname, '..'), outputPath)
    })
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
