#!/usr/bin/env node

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { classifySportsEvent, selectTemplateForSportsClass } = require('../src/utils/sportsEventClassifier')
const { resolveSportsPosterAsset } = require('../src/utils/sportsArtwork')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.runtime', 'sports-team-vs-team-smoke')
const GENERATOR = path.join(ROOT, 'backdrops', 'python-backdrops', '08-team-vs-team', 'generate.py')
const PYTHON = process.env.PYTHON || 'python'
const GENERATOR_ARGS = [GENERATOR, '--out', OUT_DIR]
const SOURCE_BOX = { width: 400, height: 600 }
const PROOF_BOX = { width: 600, height: 900 }

const FIXTURES = [
  {
    slug: 'epl-manchester-city-arsenal',
    rawTitle: 'Manchester City vs Arsenal EPL',
    sportHint: 'football',
    competition: 'English Premier League',
    expectedHome: 'Manchester City',
    expectedAway: 'Arsenal',
    expectedLabel: /^(?:EPL|FOOTBALL)$/
  },
  {
    slug: 'nba-houston-rockets-lakers',
    rawTitle: 'Houston Rockets vs Los Angeles Lakers',
    sportHint: 'basketball',
    competition: 'NBA',
    expectedHome: 'Houston Rockets',
    expectedAway: 'Los Angeles Lakers',
    expectedLabel: /^(?:NBA|BASKETBALL)$/
  },
  {
    slug: 'nba-cavaliers-raptors',
    rawTitle: 'Cleveland Cavaliers vs Toronto Raptors',
    sportHint: 'basketball',
    competition: 'NBA',
    expectedHome: 'Cleveland Cavaliers',
    expectedAway: 'Toronto Raptors',
    expectedLabel: /^(?:NBA|BASKETBALL)$/
  },
  {
    slug: 'nhl-flyers-penguins',
    rawTitle: 'Philadelphia Flyers vs Pittsburgh Penguins',
    sportHint: 'hockey',
    competition: 'NHL',
    expectedHome: 'Philadelphia Flyers',
    expectedAway: 'Pittsburgh Penguins',
    expectedLabel: /^(?:NHL|HOCKEY)$/
  }
]

const NEGATIVES = [
  {
    rawTitle: 'MotoGP Brazil Gear Up',
    sportHint: 'motorsport',
    competition: 'MotoGP'
  },
  {
    rawTitle: 'WRC Spain Islas Canarias Saturday Highlights',
    sportHint: 'motorsport',
    competition: 'WRC'
  }
]

function commandText() {
  return [PYTHON, ...GENERATOR_ARGS.map((part) => (/\s/.test(part) ? `"${part}"` : part))].join(' ')
}

function runGenerator() {
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
  return result.stdout
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
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  }
}

function assertCentered(slug, box, canvas, tolerance = 1) {
  const actual = center(box)
  assert.ok(Math.abs(actual.x - canvas.width / 2) <= tolerance, `${slug} VS x centered`)
  assert.ok(Math.abs(actual.y - canvas.height / 2) <= tolerance, `${slug} VS y centered`)
}

function assertTeamLayoutGeometry(slug, homeBox, awayBox, versusBox, canvas) {
  assertCentered(slug, versusBox, canvas)
  assert.ok(homeBox.y < awayBox.y, `${slug} home visual higher than away visual`)
  assert.ok(homeBox.x < canvas.width / 2, `${slug} home visual left of centre`)
  assert.ok(awayBox.x > canvas.width / 2, `${slug} away visual right of centre`)
  assert.ok(homeBox.x + homeBox.width < versusBox.x || homeBox.y + homeBox.height < versusBox.y + versusBox.height, `${slug} home visual separated from VS`)
  assert.ok(awayBox.x > versusBox.x + versusBox.width || awayBox.y > versusBox.y, `${slug} away visual separated from VS`)
}

function assertNoBadTeamText(slug, text, home, away) {
  assert.doesNotMatch(text, /\bTBA\b|\bTBD\b/i, `${slug} no TBA/TBD`)
  assert.doesNotMatch(text, /\.\.\.|\u2026/, `${slug} no ellipsis`)
  assert.doesNotMatch(text, new RegExp(`${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*${away.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${slug} no merged team names`)
  assert.doesNotMatch(text, /data-role="fake-acronym-badge"|data-role="pill-badge"/i, `${slug} no fake acronym badge`)
  assert.doesNotMatch(text, /data-role="live-status"|>LIVE</i, `${slug} no fake LIVE`)
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

function assertRuntimeTeamPoster(fixture) {
  const event = eventFor(fixture)
  assert.equal(event.eventClass, 'team_vs_team', `${fixture.slug} runtime class`)
  assert.equal(event.homeTeam, fixture.expectedHome, `${fixture.slug} runtime home team`)
  assert.equal(event.awayTeam, fixture.expectedAway, `${fixture.slug} runtime away team`)
  assert.equal(selectTemplateForSportsClass(event.eventClass, 'ticket-stub'), 'ticket-stub', `${fixture.slug} template contract`)

  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.equal(asset.layoutFamily, 'TEAM_VS_TEAM', `${fixture.slug} resolved layoutFamily`)

  const artwork = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event,
    variant: 'poster'
  })
  assert.equal(artwork.layoutFamily, 'TEAM_VS_TEAM', `${fixture.slug} rendered layoutFamily`)
  assert.match(artwork.svg, /data-layout-family="TEAM_VS_TEAM"/, `${fixture.slug} rendered family marker`)
  assert.match(artwork.svg, /data-role="home-team-visual"/, `${fixture.slug} rendered home marker`)
  assert.match(artwork.svg, /data-role="away-team-visual"/, `${fixture.slug} rendered away marker`)
  assert.match(artwork.svg, /data-role="versus"/, `${fixture.slug} rendered VS marker`)

  const homeBox = boxFromMarker(artwork.svg, 'home-team-visual')
  const awayBox = boxFromMarker(artwork.svg, 'away-team-visual')
  const versusBox = boxFromMarker(artwork.svg, 'versus')
  assertTeamLayoutGeometry(`${fixture.slug} runtime`, homeBox, awayBox, versusBox, SOURCE_BOX)
  assertNoBadTeamText(`${fixture.slug} runtime`, artwork.svg, fixture.expectedHome, fixture.expectedAway)
  return {
    layoutFamily: artwork.layoutFamily,
    homeVisualBox: homeBox,
    awayVisualBox: awayBox,
    versusBox,
    selectedTemplate: asset.selectedTemplate
  }
}

async function assertGeneratedFixture(fixture) {
  const svgPath = path.join(OUT_DIR, `${fixture.slug}.svg`)
  const jsonPath = path.join(OUT_DIR, `${fixture.slug}.json`)
  const pngPath = path.join(OUT_DIR, `${fixture.slug}.png`)
  const svg = fs.readFileSync(svgPath, 'utf8')
  const proof = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

  assert.equal(proof.layoutFamily, 'TEAM_VS_TEAM', `${fixture.slug} proof family`)
  assert.equal(proof.homeTeam, fixture.expectedHome, `${fixture.slug} proof home`)
  assert.equal(proof.awayTeam, fixture.expectedAway, `${fixture.slug} proof away`)
  assert.match(proof.leagueLabel, fixture.expectedLabel, `${fixture.slug} proof league label`)
  assert.equal(proof.titleFitStatus.home.status, 'fit', `${fixture.slug} home title fit`)
  assert.equal(proof.titleFitStatus.away.status, 'fit', `${fixture.slug} away title fit`)
  assert.match(svg, /data-layout-family="TEAM_VS_TEAM"/, `${fixture.slug} SVG family marker`)
  assert.match(svg, /data-role="home-team-visual"/, `${fixture.slug} SVG home marker`)
  assert.match(svg, /data-role="away-team-visual"/, `${fixture.slug} SVG away marker`)
  assert.match(svg, /data-role="versus"/, `${fixture.slug} SVG VS marker`)
  assertNoBadTeamText(fixture.slug, svg, fixture.expectedHome, fixture.expectedAway)
  assertTeamLayoutGeometry(fixture.slug, proof.homeVisualBox, proof.awayVisualBox, proof.versusBox, PROOF_BOX)

  await sharp(Buffer.from(svg)).png().toFile(pngPath)
  const metadata = await sharp(pngPath).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, PROOF_BOX, `${fixture.slug} PNG dimensions`)

  const runtime = assertRuntimeTeamPoster(fixture)
  return {
    slug: fixture.slug,
    svg: path.relative(ROOT, svgPath),
    png: path.relative(ROOT, pngPath),
    json: path.relative(ROOT, jsonPath),
    layoutFamily: proof.layoutFamily,
    label: proof.leagueLabel,
    homeTeam: proof.homeTeam,
    awayTeam: proof.awayTeam,
    homeVisualBox: proof.homeVisualBox,
    awayVisualBox: proof.awayVisualBox,
    versusBox: proof.versusBox,
    usedLogoOrInitials: proof.usedLogoOrInitials,
    titleFitStatus: {
      home: proof.titleFitStatus.home.status,
      away: proof.titleFitStatus.away.status
    },
    runtime
  }
}

function assertNegativeSelection(testCase) {
  const event = eventFor(testCase)
  assert.notEqual(event.eventClass, 'team_vs_team', `${testCase.rawTitle} must not classify as TEAM_VS_TEAM`)
  const asset = resolveSportsPosterAsset({
    ...event,
    baseUrl: 'https://addon.test',
    sportsPosterTemplate: 'ticket-stub'
  })
  assert.notEqual(asset.layoutFamily, 'TEAM_VS_TEAM', `${testCase.rawTitle} must not resolve TEAM_VS_TEAM`)
  return {
    rawTitle: testCase.rawTitle,
    eventClass: event.eventClass,
    selectedTemplate: asset.selectedTemplate,
    layoutFamily: asset.layoutFamily
  }
}

async function main() {
  const generatorStdout = runGenerator()
  const fixtures = []
  for (const fixture of FIXTURES) {
    fixtures.push(await assertGeneratedFixture(fixture))
  }
  const negatives = NEGATIVES.map(assertNegativeSelection)
  console.log(JSON.stringify({
    ok: true,
    command: commandText(),
    stdout: JSON.parse(generatorStdout),
    fixtures,
    negatives
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
