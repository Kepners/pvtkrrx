#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const {
  SPORTS_POSTER_TEMPLATES,
  renderSportsPosterTemplateSvg
} = require('../src/utils/sportsPosterTemplates')

const OUT_DIR = path.join(process.cwd(), '.runtime', 'sports-poster-render-smoke')
const BAD_TEXT_RE = /\b(?:SPOR|BASK|undefined|null|unknown|n\/a)\b/i
const BROADCAST_WORDMARK_RE = /PVTKRRX \u00b7 BROADCAST/

const SOLO_EVENT = {
  sport: 'Motorsport',
  sportHint: 'motorsport',
  league: 'Formula 1',
  competition: 'Formula 1',
  title: 'British Grand Prix',
  eventTitle: 'British Grand Prix',
  eventName: 'British Grand Prix',
  eventShort: 'British Grand Prix',
  eventDetail: 'Qualifying',
  session: 'Qualifying',
  date: '2026-07-04',
  eventClass: 'motorsport_event'
}

const TEAM_EVENT = {
  sport: 'Football',
  sportHint: 'football',
  league: 'English Premier League',
  competition: 'English Premier League',
  title: 'Arsenal vs Chelsea',
  eventTitle: 'Arsenal vs Chelsea',
  homeTeam: 'Arsenal',
  awayTeam: 'Chelsea',
  date: '2026-04-29',
  eventClass: 'team_vs_team'
}

const SINGLE_EVENT = {
  sport: 'MMA',
  sportHint: 'mma',
  league: 'UFC',
  competition: 'UFC',
  title: 'UFC 312',
  eventTitle: 'UFC 312',
  eventName: 'UFC 312',
  eventDetail: 'Main Event',
  session: 'Main Event',
  homeTeam: 'Makhachev',
  awayTeam: 'Oliveira',
  date: '2026-06-14',
  eventClass: 'combat_event'
}

function textNodes(svg) {
  return [...String(svg || '').matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

async function assertRendered({ template, event, variant = 'poster', slug, expectations }) {
  const artwork = renderSportsPosterTemplateSvg({ template, event, variant })
  assert.ok(artwork?.svg, `${slug} svg returned`)
  assert.match(artwork.svg, /<svg\b/, `${slug} svg root`)
  assert.doesNotMatch(artwork.svg, BAD_TEXT_RE, `${slug} no placeholder tokens`)

  const texts = textNodes(artwork.svg)
  assert.ok(texts.length > 0, `${slug} text nodes`)
  if (expectations.noFakeVersus) {
    assert.ok(!texts.some((text) => /^(?:vs|v|versus)$/i.test(text)), `${slug} should not render fake versus text`)
    assert.ok(!texts.some((text) => /\bversus\b/i.test(text)), `${slug} should not render fake versus wording`)
  }
  if (expectations.noHomeAwayLabels) {
    assert.ok(!texts.some((text) => /^(?:home|away)$/i.test(text)), `${slug} should not render HOME/AWAY labels`)
  }
  if (expectations.requireHeadToHead) {
    assert.ok(
      texts.some((text) => /^(?:vs|v|versus|x|\u00d7)$/i.test(text) || /\bversus\b/i.test(text) || /\b[xv]\b/i.test(text) || /\u00d7/.test(text)),
      `${slug} should render a real head-to-head marker`
    )
  }
  if (expectations.requireBroadcastMarkers) {
    assert.match(artwork.svg, /viewBox="0 0 600 900"/, `${slug} native Broadcast viewBox`)
    assert.match(artwork.svg, /data-layout-family="BROADCAST"/, `${slug} Broadcast family marker`)
    assert.match(artwork.svg, /data-layout-style="sportsmeta-default-poster"/, `${slug} Broadcast style marker`)
    assert.match(artwork.svg, /data-role="inner-border"/, `${slug} Broadcast inner border`)
    assert.match(artwork.svg, /data-role="accent-top"/, `${slug} Broadcast top accent`)
    assert.match(artwork.svg, /data-role="accent-bottom"/, `${slug} Broadcast bottom accent`)
    assert.match(artwork.svg, /data-role="pill-badge"/, `${slug} Broadcast pill badge`)
    assert.match(artwork.svg, /data-role="broadcast-title"[^>]*(?:class="broadcast-title"|font-family="[^"]*Inter)/i, `${slug} Broadcast Inter title`)
    assert.match(artwork.svg, BROADCAST_WORDMARK_RE, `${slug} Broadcast wordmark`)
    assert.doesNotMatch(artwork.svg, /viewBox="0 0 400 600"/, `${slug} no wrapped 400x600 SVG`)
    assert.doesNotMatch(artwork.svg, /homeGrad|awayGrad|lowerThird/i, `${slug} no old Broadcast split artifacts`)
    assert.doesNotMatch(artwork.svg, /data-role="broadcast-title"[^>]*class="bebas"/i, `${slug} no Bebas Broadcast title`)
    assert.doesNotMatch(artwork.svg, /\bTBA\b|\.{3,}|\bICS\b/i, `${slug} no Broadcast placeholder leakage`)
  }

  const png = await sharp(Buffer.from(artwork.svg)).png().toBuffer()
  const metadata = await sharp(png).metadata()
  assert.deepEqual(
    { width: metadata.width, height: metadata.height },
    { width: 600, height: 900 },
    `${slug} raster dimensions`
  )

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), png)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const template of SPORTS_POSTER_TEMPLATES) {
    const expectations = template === 'broadcast'
      ? { requireBroadcastMarkers: true }
      : { requireHeadToHead: true }
    await assertRendered({
      template,
      event: TEAM_EVENT,
      slug: `team-${template}`,
      expectations
    })
  }

  for (const template of SPORTS_POSTER_TEMPLATES) {
    const expectations = template === 'broadcast'
      ? { noFakeVersus: true, noHomeAwayLabels: true, requireBroadcastMarkers: true }
      : { noFakeVersus: true, noHomeAwayLabels: true }
    await assertRendered({
      template,
      event: SOLO_EVENT,
      slug: `solo-${template}`,
      expectations
    })
  }

  for (const template of SPORTS_POSTER_TEMPLATES) {
    const expectations = template === 'broadcast'
      ? { noHomeAwayLabels: true, requireBroadcastMarkers: true }
      : { noHomeAwayLabels: true, requireHeadToHead: true }
    await assertRendered({
      template,
      event: SINGLE_EVENT,
      slug: `single-${template}`,
      expectations
    })
  }

  console.log(`Sports poster render smoke passed. templates=${SPORTS_POSTER_TEMPLATES.length} previews=${OUT_DIR}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error?.stack || error)
    process.exit(1)
  })
