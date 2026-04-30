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
const POSTER_BOX = { width: 600, height: 900 }

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
  },
  {
    // Edge case: 3-word team where the third word starts with a digit ("49ers").
    // The generic fallback must skip digit-prefixed words when assembling the
    // serial code so we get "SF" instead of "S4". No SportsMeta identity supplied
    // so this proves the generic algorithm.
    slug: 'nfl-49ers-chiefs-generic-fallback',
    rawTitle: 'San Francisco 49ers vs Kansas City Chiefs',
    sportHint: 'american-football',
    competition: 'NFL',
    expectedHome: 'San Francisco 49ers',
    expectedAway: 'Kansas City Chiefs',
    expectedLabel: /^(?:NFL|FOOTBALL)$/,
    expectedSerial: /#SF-KC[A-Z]?-/
  },
  {
    // Edge case: 3-word teams where the generic fallback must produce a multi-letter
    // acronym from each letter-starting word. No SportsMeta identity supplied.
    slug: 'mlb-yankees-redsox-generic-fallback',
    rawTitle: 'New York Yankees vs Boston Red Sox',
    sportHint: 'baseball',
    competition: 'MLB',
    expectedHome: 'New York Yankees',
    expectedAway: 'Boston Red Sox',
    expectedLabel: /^(?:MLB|BASEBALL)$/,
    expectedSerial: /#NYY-BRS-/
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

const SPORTSMETA_IDENTITY_FIXTURE = {
  slug: 'epl-manchester-city-arsenal-sportsmeta-identity',
  rawTitle: 'Manchester City vs Arsenal EPL',
  sportHint: 'football',
  competition: 'English Premier League',
  expectedHome: 'Manchester City',
  expectedAway: 'Arsenal',
  identity: {
    home: { short: 'CTY', initials: 'MC' },
    away: { short: 'ARS', initials: 'AR' }
  }
}

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
  // Stub serial line is "#HOME-AWAY-YYMMDD" — assert short codes never contain vulgar substrings.
  // Single-word team auto-shorts must stop at 3 chars to avoid e.g. Arsenal -> ARSE.
  const serial = text.match(/#([A-Z0-9]+)-([A-Z0-9]+)-/)
  if (serial) {
    assert.doesNotMatch(serial[1], /(?:ARSE|FUCK|SHIT|CUNT|CRAP)/, `${slug} home short avoids vulgar substring (got ${serial[1]})`)
    assert.doesNotMatch(serial[2], /(?:ARSE|FUCK|SHIT|CUNT|CRAP)/, `${slug} away short avoids vulgar substring (got ${serial[2]})`)
  }
}

function assertProofBoxMatchesSvg(slug, svg, role, proofBox) {
  assert.deepEqual(boxFromMarker(svg, role), proofBox, `${slug} ${role} SVG marker matches JSON proof`)
}

function assertNoEmptyDateTime(slug, svg) {
  // When a stub element is present (DATE / KICKOFF), it must not be empty.
  // Acceptable: element absent; OR element with non-empty text.
  assert.doesNotMatch(svg, />\s*<\/text>/, `${slug} no empty <text> elements`)
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
  if (fixture.identity) {
    if (fixture.identity.home) event.home = { ...fixture.identity.home }
    if (fixture.identity.away) event.away = { ...fixture.identity.away }
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
  assertNoEmptyDateTime(`${fixture.slug} runtime`, artwork.svg)
  if (fixture.expectedSerial) {
    assert.match(artwork.svg, fixture.expectedSerial, `${fixture.slug} stub serial matches expected pattern`)
  }
  // Slot coordinates are what the badge-composite path consumes when SportsMeta
  // returns real team logos. Lock the staggered home-higher-left / away-lower-right
  // positions so future template tweaks can't silently shift the composite slots.
  assert.deepEqual(
    artwork.slots.find((slot) => slot.role === 'home'),
    { role: 'home', size: 132, left: 96, top: 242 },
    `${fixture.slug} home composite slot coordinates`
  )
  assert.deepEqual(
    artwork.slots.find((slot) => slot.role === 'away'),
    { role: 'away', size: 132, left: 372, top: 467 },
    `${fixture.slug} away composite slot coordinates`
  )
  return {
    layoutFamily: artwork.layoutFamily,
    homeVisualBox: homeBox,
    awayVisualBox: awayBox,
    versusBox,
    selectedTemplate: asset.selectedTemplate,
    slots: artwork.slots
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
  assert.match(svg, new RegExp(`data-team-name="${fixture.expectedHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${fixture.slug} SVG home name marker`)
  assert.match(svg, new RegExp(`data-team-name="${fixture.expectedAway.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${fixture.slug} SVG away name marker`)
  assertNoBadTeamText(fixture.slug, svg, fixture.expectedHome, fixture.expectedAway)
  assertNoEmptyDateTime(`${fixture.slug} generated`, svg)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'home-team-visual', proof.homeVisualBox)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'away-team-visual', proof.awayVisualBox)
  assertProofBoxMatchesSvg(fixture.slug, svg, 'versus', proof.versusBox)
  assertTeamLayoutGeometry(fixture.slug, proof.homeVisualBox, proof.awayVisualBox, proof.versusBox, POSTER_BOX)
  assert.ok(['team-logo', 'local-team-logo', 'league-logo', 'initials'].includes(proof.usedLogoOrInitials.home), `${fixture.slug} home visual source is known`)
  assert.ok(['team-logo', 'local-team-logo', 'league-logo', 'initials'].includes(proof.usedLogoOrInitials.away), `${fixture.slug} away visual source is known`)

  await sharp(Buffer.from(svg)).png().toFile(pngPath)
  const metadata = await sharp(pngPath).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, POSTER_BOX, `${fixture.slug} PNG dimensions`)

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

function assertSportsMetaIdentityHonoured(fixture) {
  const event = eventFor(fixture)
  const artwork = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event,
    variant: 'poster'
  })
  assert.equal(artwork.layoutFamily, 'TEAM_VS_TEAM', `${fixture.slug} sportsmeta layoutFamily`)
  assert.match(
    artwork.svg,
    new RegExp(`data-role="fallback-team-initials"[^>]*data-team-side="home"[^>]*>${fixture.identity.home.initials}</text>`),
    `${fixture.slug} home initials sourced from sportsmeta input`
  )
  assert.match(
    artwork.svg,
    new RegExp(`data-role="fallback-team-initials"[^>]*data-team-side="away"[^>]*>${fixture.identity.away.initials}</text>`),
    `${fixture.slug} away initials sourced from sportsmeta input`
  )
  // Stub serial line uses .short
  const serial = `#${fixture.identity.home.short}-${fixture.identity.away.short}-`
  assert.ok(artwork.svg.includes(serial), `${fixture.slug} stub serial honours sportsmeta short codes (${serial})`)
  return { slug: fixture.slug, homeShort: fixture.identity.home.short, awayShort: fixture.identity.away.short }
}

async function main() {
  const generated = runGenerator()
  const fixtures = []
  for (const fixture of FIXTURES) {
    fixtures.push(await assertGeneratedFixture(fixture))
  }
  const negatives = NEGATIVES.map(assertNegativeSelection)
  const sportsmetaIdentity = assertSportsMetaIdentityHonoured(SPORTSMETA_IDENTITY_FIXTURE)
  console.log(JSON.stringify({
    ok: true,
    command: commandText(),
    generated,
    fixtures,
    negatives,
    sportsmetaIdentity
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
