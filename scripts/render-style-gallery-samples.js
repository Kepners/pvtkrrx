#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { _test: { renderTeamBadgeArtworkPng } } = require('../src/handlers/sportsArtworkProxy')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const SPORTSMETA_BASE_URL = process.env.SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc'
const OUT_DIR = path.join(process.cwd(), 'public', 'sports-style-samples')

// Each sample renders one theme. Themes whose templates expose home/away/league
// logo slots (editorial, brutalist, glitch) go through the real-logo pipeline
// using SportsMeta canonical events that have working logo coverage. Broadcast,
// sportsbook, and trading-card render template-only with hand-crafted
// matchup fixtures so the gallery showcases the matchup branch of each layout
// (real-logo combat-event canonicals lacked parsed fighter pairs and rendered
// the empty solo branch, and Levante vs Sevilla collapsed both broadcast
// halves to similar reds via the deterministic palette hash).
const SAMPLES = [
  {
    theme: 'editorial',
    canonicalId: 'sportsmeta:event:football|2026-04-23|spanish-la-liga|levante|sevilla',
    realLogos: true
  },
  // Broadcast fixture: render only fields verifiable from the title. No
  // fabricated venue or date.
  {
    theme: 'broadcast',
    realLogos: false,
    eventOverride: {
      sport: 'Football',
      sportHint: 'football',
      league: 'Spanish La Liga',
      title: 'Real Madrid vs Barcelona',
      eventTitle: 'Real Madrid vs Barcelona',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      eventClass: 'team_vs_team'
    }
  },
  // UFC fixtures: render only fields verifiable from the catalog title itself.
  // No fabricated venue, time, round, session, status, or title-fight label —
  // the upstream catalog title is the only authoritative source. (See feedback
  // memory: "Don't fabricate sport-event metadata".)
  // UFC fixtures render F1-style: big "UFC 272" event mark, headline fight as
  // the subtitle line. eventTitle is the headline only; leagueCode supplies the
  // big mark with the event number. (See feedback_ufc_card_layout.md.)
  {
    theme: 'sportsbook',
    realLogos: false,
    eventOverride: {
      sport: 'MMA',
      sportHint: 'mma',
      league: 'UFC',
      leagueCode: 'UFC 272',
      title: 'UFC 272',
      eventTitle: 'Covington vs Masvidal',
      eventName: 'UFC 272',
      principalA: 'Colby Covington',
      principalB: 'Jorge Masvidal',
      fighterA: 'Colby Covington',
      fighterB: 'Jorge Masvidal',
      eventClass: 'combat_event'
    }
  },
  {
    theme: 'trading-card',
    realLogos: false,
    eventOverride: {
      sport: 'MMA',
      sportHint: 'mma',
      league: 'UFC',
      leagueCode: 'UFC 272',
      title: 'UFC 272',
      eventTitle: 'Covington vs Masvidal',
      eventName: 'UFC 272',
      principalA: 'Colby Covington',
      principalB: 'Jorge Masvidal',
      fighterA: 'Colby Covington',
      fighterB: 'Jorge Masvidal',
      eventClass: 'combat_event'
    }
  },
  {
    theme: 'brutalist',
    canonicalId: 'sportsmeta:event:motorsport|2026-11-08|formula-1|2026-brazilian-grand-prix',
    realLogos: true
  },
  {
    theme: 'glitch',
    canonicalId: 'sportsmeta:event:motorsport|2026-11-08|formula-1|2026-brazilian-grand-prix',
    realLogos: true
  }
]

async function renderRealLogo(theme, canonicalId) {
  const result = await renderTeamBadgeArtworkPng({
    canonicalId,
    sportsmetaBaseUrl: SPORTSMETA_BASE_URL,
    variant: 'poster',
    template: theme
  })
  if (!result?.buffer) {
    throw new Error(`real-logo render failed for ${theme} / ${canonicalId}: ${result?.logoFallbackReason || 'unknown'}`)
  }
  return {
    buffer: result.buffer,
    logoKind: result.logoKind || 'real',
    real: result.logoRealCount || 0,
    fallback: result.logoFallbackCount || 0
  }
}

async function renderTemplateOnly(theme, event) {
  const artwork = renderSportsPosterTemplateSvg({ event, template: theme, variant: 'poster' })
  const buffer = await sharp(Buffer.from(artwork.svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
  return { buffer, logoKind: 'template-svg', real: 0, fallback: 0 }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const { theme, canonicalId, realLogos, eventOverride } of SAMPLES) {
    const rendered = realLogos
      ? await renderRealLogo(theme, canonicalId)
      : await renderTemplateOnly(theme, eventOverride)
    const file = path.join(OUT_DIR, `${theme}.png`)
    fs.writeFileSync(file, rendered.buffer)
    const realInfo = realLogos ? `real=${rendered.real}/${rendered.real + rendered.fallback}` : 'template-only'
    console.log(`${theme.padEnd(14)} ${rendered.buffer.length.toString().padStart(8)} bytes  logoKind=${rendered.logoKind}  ${realInfo}`)
  }
  console.log(`\nWrote ${SAMPLES.length} samples to ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
