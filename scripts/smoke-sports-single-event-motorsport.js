#!/usr/bin/env node

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { resolveSportsPosterAsset } = require('../src/utils/sportsArtwork')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.runtime', 'sports-single-event-motorsport-smoke')
const GENERATOR = path.join(ROOT, 'backdrops', 'python-backdrops', '10-single-event-motorsport', 'generate.py')
const PYTHON = process.env.PYTHON || 'python'
const GENERATOR_ARGS = [GENERATOR, '--out', OUT_DIR]
const SOURCE_BOX = { width: 400, height: 600 }
const POSTER_BOX = { width: 600, height: 900 }

const FIXTURES = [
  {
    slug: 'motogp-brazil-gear-up',
    rawTitle: 'MotoGP Brazil Gear Up',
    sportHint: 'motorsport',
    competition: 'MotoGP',
    expectedLabel: 'MOTOGP',
    expectedIcon: 'motogp-bike',
    expectedTitleIncludes: /Brazil/i,
    forbidF1: true
  },
  {
    slug: 'motogp-brazil',
    rawTitle: 'MotoGP Brazil',
    sportHint: 'motorsport',
    competition: 'MotoGP',
    expectedLabel: 'MOTOGP',
    expectedIcon: 'motogp-bike',
    expectedTitleIncludes: /Brazil/i,
    forbidF1: true
  },
  {
    slug: 'wrc-spain-islas-canarias',
    rawTitle: 'WRC Spain Islas Canarias Saturday Highlights',
    sportHint: 'motorsport',
    competition: 'WRC',
    expectedLabel: 'WRC',
    expectedIcon: 'wrc-rally',
    expectedTitleIncludes: /Islas Canarias|Saturday Highlights/i,
    forbidF1: true
  },
  {
    slug: 'formula1-australian-grand-prix',
    rawTitle: 'Formula 1 Australian Grand Prix',
    sportHint: 'motorsport',
    competition: 'Formula 1',
    expectedLabel: 'FORMULA 1',
    expectedIcon: 'f1',
    expectedTitleIncludes: /Australian Grand Prix/i,
    forbidF1: false
  },
  {
    slug: 'nascar-daytona-500',
    rawTitle: 'NASCAR Daytona 500',
    sportHint: 'motorsport',
    competition: 'NASCAR',
    expectedLabel: 'NASCAR',
    expectedIcon: 'nascar-oval',
    expectedTitleIncludes: /Daytona 500/i,
    forbidF1: true
  },
  {
    slug: 'indycar-long-beach-grand-prix',
    rawTitle: 'IndyCar Long Beach Grand Prix',
    sportHint: 'motorsport',
    competition: 'IndyCar',
    expectedLabel: 'INDYCAR',
    expectedIcon: 'indycar-oval',
    expectedTitleIncludes: /Long Beach Grand Prix/i,
    forbidF1: true
  }
]

const NEGATIVES = [
  {
    slug: 'team-houston-rockets-lakers',
    rawTitle: 'Houston Rockets vs Los Angeles Lakers',
    sportHint: 'basketball',
    competition: 'NBA',
    expectedNotFamily: 'SINGLE_EVENT_MOTORSPORT'
  },
  {
    slug: 'snooker-higgins-murphy',
    rawTitle: 'John Higgins vs Shaun Murphy WC',
    sportHint: 'snooker',
    competition: 'World Championship',
    expectedNotFamily: 'SINGLE_EVENT_MOTORSPORT'
  }
]

function commandText() {
  return [PYTHON, ...GENERATOR_ARGS.map((part) => (/\s/.test(part) ? `"${part}"` : part))].join(' ')
}

function runGenerator() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const result = spawnSync(PYTHON, GENERATOR_ARGS, { cwd: ROOT, encoding: 'utf8' })
  if (result.error) throw result.error
  assert.equal(
    result.status,
    0,
    `generator failed\ncommand=${commandText()}\nstdout=${result.stdout}\nstderr=${result.stderr}`
  )
  return JSON.parse(result.stdout)
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
    rawTitle: fixture.rawTitle
  }
  event.eventClass = classifySportsEvent(event)
  return event
}

function assertNoForbiddenMarkers(slug, svg, { forbidF1 }) {
  assert.doesNotMatch(svg, /data-role="versus"/, `${slug} no VS marker`)
  assert.doesNotMatch(svg, />\s*VS\s*</, `${slug} no VS text`)
  assert.doesNotMatch(svg, />\s*HOME\s*<|>\s*AWAY\s*</, `${slug} no HOME/AWAY label`)
  assert.doesNotMatch(svg, /data-role="fake-acronym-badge"|data-role="pill-badge"/i, `${slug} no fake acronym badge`)
  assert.doesNotMatch(svg, /\bTBA\b|\bTBD\b/i, `${slug} no TBA/TBD`)
  assert.doesNotMatch(svg, /\.{3,}|…/, `${slug} no ellipsis`)
  if (forbidF1) {
    assert.doesNotMatch(svg, /data-icon-kind="f1"/, `${slug} no F1 icon`)
    assert.doesNotMatch(svg, /data-league-label="FORMULA 1"|data-sport-label="Formula 1"/i, `${slug} no F1 branding`)
  }
}

function assertRuntimeMotorsportPoster(fixture) {
  const event = eventFor(fixture)
  assert.equal(event.eventClass, 'motorsport_event', `${fixture.slug} runtime class`)

  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.equal(asset.layoutFamily, 'SINGLE_EVENT_MOTORSPORT', `${fixture.slug} resolved layoutFamily`)

  const artwork = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event,
    variant: 'poster'
  })
  assert.equal(artwork.layoutFamily, 'SINGLE_EVENT_MOTORSPORT', `${fixture.slug} rendered layoutFamily`)
  assert.match(artwork.svg, /data-layout-family="SINGLE_EVENT_MOTORSPORT"/, `${fixture.slug} family marker`)
  assert.match(artwork.svg, /data-role="motorsport-identity-box"/, `${fixture.slug} identity box marker`)
  assert.match(artwork.svg, /data-role="motorsport-identity"/, `${fixture.slug} identity glyph marker`)
  assert.match(artwork.svg, /data-role="event-title-box"/, `${fixture.slug} title box marker`)
  assert.match(artwork.svg, /data-role="event-title"/, `${fixture.slug} event-title text marker`)
  assert.match(artwork.svg, /data-role="sport-label"/, `${fixture.slug} sport-label marker`)
  assertNoForbiddenMarkers(`${fixture.slug} runtime`, artwork.svg, fixture)

  const layoutLabel = artwork.svg.match(/data-layout-family="SINGLE_EVENT_MOTORSPORT"[\s\S]*?data-league-label="([^"]+)"/)?.[1]
  const layoutIcon = artwork.svg.match(/data-role="motorsport-identity"[^>]*data-icon-kind="([^"]+)"/)?.[1]
  assert.equal(layoutLabel, fixture.expectedLabel, `${fixture.slug} runtime league label`)
  assert.equal(layoutIcon, fixture.expectedIcon, `${fixture.slug} runtime icon kind`)

  const titles = [...artwork.svg.matchAll(/data-role="event-title"[^>]*>([^<]+)</g)].map((match) => match[1])
  const concatenatedTitle = titles.join(' ').trim()
  assert.match(concatenatedTitle, fixture.expectedTitleIncludes, `${fixture.slug} runtime title text`)

  for (const fitMatch of artwork.svg.matchAll(/data-fit-status="([^"]+)"/g)) {
    assert.notEqual(fitMatch[1], 'clip', `${fixture.slug} no clipped title`)
  }

  const identityBox = boxFromMarker(artwork.svg, 'motorsport-identity-box')
  assert.ok(identityBox.width > 0 && identityBox.height > 0, `${fixture.slug} identity box has size`)

  return {
    layoutFamily: artwork.layoutFamily,
    leagueLabel: layoutLabel,
    iconKind: layoutIcon,
    title: concatenatedTitle,
    identityBox
  }
}

async function assertGeneratedFixture(fixture) {
  const svgPath = path.join(OUT_DIR, `${fixture.slug}.svg`)
  const jsonPath = path.join(OUT_DIR, `${fixture.slug}.json`)
  const pngPath = path.join(OUT_DIR, `${fixture.slug}.png`)
  assert.ok(fs.existsSync(svgPath), `${fixture.slug} svg generated at ${svgPath}`)
  assert.ok(fs.existsSync(jsonPath), `${fixture.slug} json generated at ${jsonPath}`)
  const svg = fs.readFileSync(svgPath, 'utf8')
  const proof = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

  assert.equal(proof.layoutFamily, 'SINGLE_EVENT_MOTORSPORT', `${fixture.slug} proof family`)
  assert.equal(proof.leagueLabel, fixture.expectedLabel, `${fixture.slug} proof league label`)
  assert.equal(proof.iconKind, fixture.expectedIcon, `${fixture.slug} proof icon kind`)
  assert.match(proof.eventTitle, fixture.expectedTitleIncludes, `${fixture.slug} proof event title`)
  assert.equal(proof.titleFitStatus, 'fit', `${fixture.slug} proof title fit status (got ${proof.titleFitStatus})`)
  assert.match(svg, /data-layout-family="SINGLE_EVENT_MOTORSPORT"/, `${fixture.slug} svg family marker`)
  assert.match(svg, /data-role="motorsport-identity-box"/, `${fixture.slug} svg identity box marker`)
  assert.match(svg, /data-role="motorsport-identity"/, `${fixture.slug} svg identity glyph marker`)
  assert.match(svg, /data-role="event-title-box"/, `${fixture.slug} svg title box marker`)
  assert.match(svg, /data-role="event-title"/, `${fixture.slug} svg event-title text marker`)
  assert.match(svg, /data-role="sport-label"/, `${fixture.slug} svg sport-label marker`)
  assertNoForbiddenMarkers(fixture.slug, svg, fixture)

  await sharp(Buffer.from(svg)).png().toFile(pngPath)
  const metadata = await sharp(pngPath).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, POSTER_BOX, `${fixture.slug} PNG dimensions`)

  const runtime = assertRuntimeMotorsportPoster(fixture)
  return {
    slug: fixture.slug,
    svg: path.relative(ROOT, svgPath),
    png: path.relative(ROOT, pngPath),
    json: path.relative(ROOT, jsonPath),
    layoutFamily: proof.layoutFamily,
    leagueLabel: proof.leagueLabel,
    sportLabel: proof.sportLabel,
    iconKind: proof.iconKind,
    eventTitle: proof.eventTitle,
    titleFitStatus: proof.titleFitStatus,
    titleFontSize: proof.titleFontSize,
    titleLines: proof.titleLines,
    identityBox: proof.identityBox,
    eventTitleBox: proof.eventTitleBox,
    runtime
  }
}

function assertNegative(testCase) {
  const event = eventFor(testCase)
  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.notEqual(asset.layoutFamily, testCase.expectedNotFamily, `${testCase.slug} must not resolve ${testCase.expectedNotFamily} (got ${asset.layoutFamily})`)
  return {
    slug: testCase.slug,
    eventClass: event.eventClass,
    layoutFamily: asset.layoutFamily
  }
}

async function main() {
  const generated = runGenerator()
  const fixtures = []
  for (const fixture of FIXTURES) {
    fixtures.push(await assertGeneratedFixture(fixture))
  }
  const negatives = NEGATIVES.map(assertNegative)
  console.log(JSON.stringify({
    ok: true,
    command: commandText(),
    generated,
    fixtures,
    negatives,
    sourceBox: SOURCE_BOX,
    posterBox: POSTER_BOX
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
