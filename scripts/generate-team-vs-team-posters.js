#!/usr/bin/env node
// Renders the team-vs-team smoke fixtures as both .svg and .png files into
// .runtime/sports-team-vs-team-posters/ so they can be inspected visually.

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.runtime', 'sports-team-vs-team-posters')

const FIXTURES = [
  // Original 4 fixtures (no SportsMeta supply — exercises generic algorithm)
  {
    slug: '01-epl-manchester-city-arsenal',
    rawTitle: 'Manchester City vs Arsenal EPL',
    sportHint: 'football',
    competition: 'English Premier League'
  },
  {
    slug: '02-nba-houston-rockets-lakers',
    rawTitle: 'Houston Rockets vs Los Angeles Lakers',
    sportHint: 'basketball',
    competition: 'NBA'
  },
  {
    slug: '03-nba-cavaliers-raptors',
    rawTitle: 'Cleveland Cavaliers vs Toronto Raptors',
    sportHint: 'basketball',
    competition: 'NBA'
  },
  {
    slug: '04-nhl-flyers-penguins',
    rawTitle: 'Philadelphia Flyers vs Pittsburgh Penguins',
    sportHint: 'hockey',
    competition: 'NHL'
  },

  // Digit-prefix-word edge cases
  {
    slug: '05-nfl-49ers-chiefs-generic',
    rawTitle: 'San Francisco 49ers vs Kansas City Chiefs',
    sportHint: 'american-football',
    competition: 'NFL'
  },
  {
    slug: '06-mlb-yankees-redsox-generic',
    rawTitle: 'New York Yankees vs Boston Red Sox',
    sportHint: 'baseball',
    competition: 'MLB'
  },

  // SportsMeta-supply path: explicit codes win over generic algorithm
  {
    slug: '07-epl-mci-arsenal-sportsmeta-supply',
    rawTitle: 'Manchester City vs Arsenal EPL',
    sportHint: 'football',
    competition: 'English Premier League',
    identity: {
      home: { short: 'MCI', initials: 'MC' },
      away: { short: 'ARS', initials: 'AR' }
    }
  },

  // Negative cases — should NOT be TEAM_VS_TEAM
  {
    slug: '08-motogp-brazil-not-team-vs-team',
    rawTitle: 'MotoGP Brazil Gear Up',
    sportHint: 'motorsport',
    competition: 'MotoGP'
  },
  {
    slug: '09-wrc-spain-not-team-vs-team',
    rawTitle: 'WRC Spain Islas Canarias Saturday Highlights',
    sportHint: 'motorsport',
    competition: 'WRC'
  },

  // Empty date/time fixture: proves no dead <text> elements
  {
    slug: '10-no-date-no-time-empty-text-check',
    rawTitle: 'Chelsea vs Liverpool',
    sportHint: 'football',
    competition: 'English Premier League'
  }
]

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
  if (fixture.identity?.home) event.home = { ...fixture.identity.home }
  if (fixture.identity?.away) event.away = { ...fixture.identity.away }
  event.eventClass = classifySportsEvent(event)
  return event
}

async function renderFixture(fixture) {
  const event = eventFor(fixture)
  const artwork = renderSportsPosterTemplateSvg({
    template: 'ticket-stub',
    event,
    variant: 'poster'
  })

  const svgPath = path.join(OUT_DIR, `${fixture.slug}.svg`)
  fs.writeFileSync(svgPath, artwork.svg)

  const pngPath = path.join(OUT_DIR, `${fixture.slug}.png`)
  await sharp(Buffer.from(artwork.svg)).png().toFile(pngPath)

  // Quick proof for each fixture
  const homeShort = artwork.svg.match(/data-role="home-team-visual"[^>]*data-team-name="([^"]*)"/)?.[1] || '(no marker)'
  const awayShort = artwork.svg.match(/data-role="away-team-visual"[^>]*data-team-name="([^"]*)"/)?.[1] || '(no marker)'
  const stubSerial = artwork.svg.match(/#([A-Z0-9]+)-([A-Z0-9]+)-([0-9]*)/)?.[0] || '(no serial)'
  const emptyTextCount = (artwork.svg.match(/>\s*<\/text>/g) || []).length

  return {
    slug: fixture.slug,
    eventClass: event.eventClass,
    layoutFamily: artwork.layoutFamily,
    home: homeShort,
    away: awayShort,
    stubSerial,
    emptyTextCount,
    svg: path.relative(ROOT, svgPath),
    png: path.relative(ROOT, pngPath)
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const results = []
  for (const fixture of FIXTURES) {
    results.push(await renderFixture(fixture))
  }
  console.log(JSON.stringify({
    ok: true,
    outputDir: path.relative(ROOT, OUT_DIR),
    fixtures: results
  }, null, 2))
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
