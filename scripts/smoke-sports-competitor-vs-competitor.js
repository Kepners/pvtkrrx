#!/usr/bin/env node

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { isCompetitorVsCompetitorEvent } = require('../src/utils/sportsPosterClassifier')
const { resolveSportsPosterAsset } = require('../src/utils/sportsArtwork')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.runtime', 'sports-competitor-vs-competitor-smoke')
const GENERATOR = path.join(ROOT, 'backdrops', 'python-backdrops', '09-competitor-vs-competitor', 'generate.py')
const PYTHON = process.env.PYTHON || 'python'
const GENERATOR_ARGS = [GENERATOR, '--out', OUT_DIR]
const SOURCE_BOX = { width: 400, height: 600 }
const POSTER_BOX = { width: 600, height: 900 }

const FIXTURES = [
  {
    slug: 'snooker-higgins-murphy',
    rawTitle: 'John Higgins vs Shaun Murphy WC',
    sportHint: 'snooker',
    competition: 'World Championship',
    expectedClass: 'tennis_or_snooker_match',
    expectedSport: /snooker/i,
    expectedLabel: /^(?:SNOOKER|WC|WORLD CHAMPIONSHIP)$/,
    expectedOne: 'John Higgins',
    expectedTwo: 'Shaun Murphy'
  },
  {
    slug: 'tennis-djokovic-alcaraz',
    rawTitle: 'Novak Djokovic vs Carlos Alcaraz ATP',
    sportHint: 'tennis',
    competition: 'ATP',
    expectedClass: 'tennis_or_snooker_match',
    expectedSport: /tennis/i,
    expectedLabel: /^(?:ATP|TENNIS)$/,
    expectedOne: 'Novak Djokovic',
    expectedTwo: 'Carlos Alcaraz'
  },
  {
    slug: 'ufc-makhachev-oliveira',
    rawTitle: 'Islam Makhachev vs Charles Oliveira UFC',
    sportHint: 'mma',
    competition: 'UFC',
    expectedClass: 'combat_event',
    expectedSport: /mma/i,
    expectedLabel: /^(?:UFC|MMA)$/,
    expectedOne: 'Islam Makhachev',
    expectedTwo: 'Charles Oliveira'
  },
  {
    slug: 'darts-littler-van-gerwen',
    rawTitle: 'Luke Littler vs Michael van Gerwen Darts',
    sportHint: 'darts',
    competition: 'Darts',
    expectedClass: 'darts_event',
    expectedSport: /darts/i,
    expectedLabel: /^DARTS$/,
    expectedOne: 'Luke Littler',
    expectedTwo: 'Michael van Gerwen'
  }
]

const NEGATIVES = [
  {
    slug: 'team-houston-rockets-lakers',
    rawTitle: 'Houston Rockets vs Los Angeles Lakers',
    sportHint: 'basketball',
    competition: 'NBA',
    expectedClass: 'team_vs_team'
  },
  {
    slug: 'motogp-brazil-gear-up',
    rawTitle: 'MotoGP Brazil Gear Up',
    sportHint: 'motorsport',
    competition: 'MotoGP',
    expectedNotClass: 'team_vs_team'
  },
  {
    slug: 'wrc-spain-highlights',
    rawTitle: 'WRC Spain Islas Canarias Saturday Highlights',
    sportHint: 'motorsport',
    competition: 'WRC',
    expectedNotClass: 'team_vs_team'
  }
]

function commandText() {
  return [PYTHON, ...GENERATOR_ARGS.map((part) => (/\s/.test(part) ? `"${part}"` : part))].join(' ')
}

function runGenerator() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const result = spawnSync(PYTHON, GENERATOR_ARGS, {
    cwd: ROOT,
    encoding: 'utf8'
  })
  if (result.error) throw result.error
  assert.equal(
    result.status,
    0,
    `generator failed\ncommand=${commandText()}\nstdout=${result.stdout}\nstderr=${result.stderr}`
  )
  return JSON.parse(result.stdout)
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}="([^"]*)"`))
  return match ? match[1] : ''
}

function markerTag(svg, role) {
  const match = String(svg || '').match(new RegExp(`<g\\b[^>]*data-role="${role}"[^>]*>`, 'i'))
  return match ? match[0] : ''
}

function boxFromMarker(svg, role) {
  const tag = markerTag(svg, role)
  assert.ok(tag, `${role} marker exists`)
  return {
    x: Number(attr(tag, 'data-box-x')),
    y: Number(attr(tag, 'data-box-y')),
    width: Number(attr(tag, 'data-box-width')),
    height: Number(attr(tag, 'data-box-height'))
  }
}

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function assertCompetitorGeometry(slug, oneBox, twoBox, versusBox, canvas) {
  const versusCenter = center(versusBox)
  assert.ok(Math.abs(versusCenter.x - canvas.width / 2) <= canvas.width * 0.09, `${slug} VS x near centre`)
  assert.ok(Math.abs(versusCenter.y - canvas.height / 2) <= canvas.height * 0.09, `${slug} VS y near centre`)
  assert.ok(oneBox.y < versusBox.y, `${slug} competitor one above VS`)
  assert.ok(twoBox.y > versusBox.y, `${slug} competitor two below VS`)
  assert.ok(oneBox.width > versusBox.width * 2.5, `${slug} competitor one wider than VS`)
  assert.ok(twoBox.width > versusBox.width * 2.5, `${slug} competitor two wider than VS`)
}

function assertNoBadCompetitorText(slug, svg, one, two) {
  assert.doesNotMatch(svg, /\bTBA\b|\bTBD\b/i, `${slug} no TBA/TBD`)
  assert.doesNotMatch(svg, /\.\.\.|\u2026/, `${slug} no ellipsis`)
  assert.doesNotMatch(svg, /data-role="fake-acronym-badge"|data-role="pill-badge"/i, `${slug} no fake acronym badge`)
  assert.doesNotMatch(svg, /data-role="fallback-team-initials"|data-role="fallback-competitor-initials"/i, `${slug} no fake player/team initials logo`)
  assert.doesNotMatch(svg, /data-role="home-team-visual"|data-role="away-team-visual"/i, `${slug} no team visual slots`)
  assert.doesNotMatch(svg, /data-role="broadcast-live"|>LIVE</i, `${slug} no fake LIVE`)
  assert.doesNotMatch(svg, new RegExp(`${escapeRegExp(one)}\\s*${escapeRegExp(two)}`), `${slug} no merged competitor names`)
}

function eventFor(fixture) {
  const normalized = normalizeSportsEventMetadata({
    rawTitle: fixture.rawTitle,
    sportHint: fixture.sportHint,
    competition: fixture.competition,
    source: 'prowlarr'
  })
  const event = {
    ...normalized,
    sport: normalized.sport || fixture.sportHint,
    sportHint: fixture.sportHint,
    league: normalized.competition || fixture.competition,
    competition: normalized.competition || fixture.competition,
    title: normalized.eventTitle || fixture.rawTitle,
    eventTitle: normalized.eventTitle || fixture.rawTitle,
    rawTitle: fixture.rawTitle,
    source: 'prowlarr'
  }
  event.eventClass = classifySportsEvent(event)
  return event
}

function assertRuntimeCompetitorPoster(fixture) {
  const event = eventFor(fixture)
  assert.equal(event.eventClass, fixture.expectedClass, `${fixture.slug} runtime class`)
  assert.match(event.sport, fixture.expectedSport, `${fixture.slug} runtime sport`)
  assert.equal(event.homeTeam, fixture.expectedOne, `${fixture.slug} runtime competitor one`)
  assert.equal(event.awayTeam, fixture.expectedTwo, `${fixture.slug} runtime competitor two`)
  assert.equal(isCompetitorVsCompetitorEvent(event), true, `${fixture.slug} competitor predicate`)

  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.equal(asset.layoutFamily, 'COMPETITOR_VS_COMPETITOR', `${fixture.slug} resolved layoutFamily`)

  const artwork = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event,
    variant: 'poster'
  })
  const svg = artwork.svg
  assert.equal(artwork.layoutFamily, 'COMPETITOR_VS_COMPETITOR', `${fixture.slug} rendered layoutFamily`)
  assert.match(svg, /data-layout-family="COMPETITOR_VS_COMPETITOR"/, `${fixture.slug} rendered family marker`)
  assert.match(svg, new RegExp(`data-competitor-name="${escapeRegExp(fixture.expectedOne)}"`), `${fixture.slug} competitor one marker name`)
  assert.match(svg, new RegExp(`data-competitor-name="${escapeRegExp(fixture.expectedTwo)}"`), `${fixture.slug} competitor two marker name`)
  assert.match(svg, /data-role="competitor-one"/, `${fixture.slug} competitor one marker`)
  assert.match(svg, /data-role="competitor-two"/, `${fixture.slug} competitor two marker`)
  assert.match(svg, /data-role="versus"/, `${fixture.slug} VS marker`)
  assert.match(attr(markerTag(svg, 'event-identity'), 'data-league-label'), fixture.expectedLabel, `${fixture.slug} label rendered`)
  assertNoBadCompetitorText(`${fixture.slug} runtime`, svg, fixture.expectedOne, fixture.expectedTwo)

  const oneBox = boxFromMarker(svg, 'competitor-one')
  const twoBox = boxFromMarker(svg, 'competitor-two')
  const versusBox = boxFromMarker(svg, 'versus')
  assertCompetitorGeometry(`${fixture.slug} runtime`, oneBox, twoBox, versusBox, SOURCE_BOX)
  assert.equal((artwork.slots || []).filter((slot) => slot.role === 'home' || slot.role === 'away').length, 0, `${fixture.slug} no competitor player logo slots`)

  return {
    layoutFamily: artwork.layoutFamily,
    competitorOneBox: oneBox,
    competitorTwoBox: twoBox,
    versusBox,
    selectedTemplate: asset.selectedTemplate,
    slots: artwork.slots
  }
}

function assertProofBoxMatchesSvg(slug, svg, role, proofBox) {
  assert.deepEqual(boxFromMarker(svg, role), proofBox, `${slug} ${role} SVG marker matches JSON proof`)
}

async function assertGeneratedFixture(fixture) {
  const svgPath = path.join(OUT_DIR, `${fixture.slug}.svg`)
  const jsonPath = path.join(OUT_DIR, `${fixture.slug}.json`)
  const pngPath = path.join(OUT_DIR, `${fixture.slug}.png`)
  const svg = fs.readFileSync(svgPath, 'utf8')
  const proof = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

  assert.equal(proof.layoutFamily, 'COMPETITOR_VS_COMPETITOR', `${fixture.slug} proof family`)
  assert.equal(proof.competitorOne, fixture.expectedOne, `${fixture.slug} proof competitor one`)
  assert.equal(proof.competitorTwo, fixture.expectedTwo, `${fixture.slug} proof competitor two`)
  assert.match(proof.sport, fixture.expectedSport, `${fixture.slug} proof sport`)
  assert.match(proof.leagueLabel, fixture.expectedLabel, `${fixture.slug} proof league label`)
  assert.ok(['fit', 'fit-with-textLength'].includes(proof.titleFitStatus.competitorOne.status), `${fixture.slug} competitor one fit status known`)
  assert.ok(['fit', 'fit-with-textLength'].includes(proof.titleFitStatus.competitorTwo.status), `${fixture.slug} competitor two fit status known`)
  assert.equal(proof.titleFitStatus.competitorOne.lines.join(' ').includes('...'), false, `${fixture.slug} competitor one fit has no ellipsis`)
  assert.equal(proof.titleFitStatus.competitorTwo.lines.join(' ').includes('...'), false, `${fixture.slug} competitor two fit has no ellipsis`)
  assert.match(svg, /data-layout-family="COMPETITOR_VS_COMPETITOR"/, `${fixture.slug} SVG family marker`)
  assert.match(svg, /data-role="competitor-one"/, `${fixture.slug} SVG competitor one marker`)
  assert.match(svg, /data-role="competitor-two"/, `${fixture.slug} SVG competitor two marker`)
  assert.match(svg, /data-role="versus"/, `${fixture.slug} SVG VS marker`)
  assertNoBadCompetitorText(fixture.slug, svg, fixture.expectedOne, fixture.expectedTwo)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'competitor-one', proof.competitorOneBox)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'competitor-two', proof.competitorTwoBox)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'versus', proof.versusBox)
  assertCompetitorGeometry(fixture.slug, proof.competitorOneBox, proof.competitorTwoBox, proof.versusBox, POSTER_BOX)
  assert.ok(['event-logo', 'league-logo', 'text-label'].includes(proof.usedLogoOrLabel), `${fixture.slug} logo/label source known`)

  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  await fs.promises.writeFile(pngPath, png)
  const metadata = await sharp(png).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, POSTER_BOX, `${fixture.slug} PNG dimensions`)

  const runtime = assertRuntimeCompetitorPoster(fixture)
  return {
    slug: fixture.slug,
    svg: path.relative(ROOT, svgPath),
    png: path.relative(ROOT, pngPath),
    json: path.relative(ROOT, jsonPath),
    layoutFamily: proof.layoutFamily,
    sport: proof.sport,
    leagueLabel: proof.leagueLabel,
    competitorOne: proof.competitorOne,
    competitorTwo: proof.competitorTwo,
    competitorOneBox: proof.competitorOneBox,
    competitorTwoBox: proof.competitorTwoBox,
    versusBox: proof.versusBox,
    usedLogoOrLabel: proof.usedLogoOrLabel,
    titleFitStatus: {
      competitorOne: proof.titleFitStatus.competitorOne.status,
      competitorTwo: proof.titleFitStatus.competitorTwo.status
    },
    runtime
  }
}

function assertNegativeSelection(testCase) {
  const event = eventFor(testCase)
  if (testCase.expectedClass) assert.equal(event.eventClass, testCase.expectedClass, `${testCase.slug} expected class`)
  if (testCase.expectedNotClass) assert.notEqual(event.eventClass, testCase.expectedNotClass, `${testCase.slug} excluded class`)
  assert.equal(isCompetitorVsCompetitorEvent(event), false, `${testCase.slug} competitor predicate false`)
  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.notEqual(asset.layoutFamily, 'COMPETITOR_VS_COMPETITOR', `${testCase.slug} must not resolve COMPETITOR_VS_COMPETITOR`)
  return {
    slug: testCase.slug,
    rawTitle: testCase.rawTitle,
    eventClass: event.eventClass,
    selectedTemplate: asset.selectedTemplate,
    layoutFamily: asset.layoutFamily
  }
}

async function main() {
  const generated = runGenerator()
  const fixtures = []
  for (const fixture of FIXTURES) {
    fixtures.push(await assertGeneratedFixture(fixture))
  }
  const negatives = NEGATIVES.map(assertNegativeSelection)
  console.log(JSON.stringify({
    ok: true,
    command: commandText(),
    generated,
    fixtures,
    negatives
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
