#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { _test: { renderTeamBadgeArtworkPng } } = require('../src/handlers/sportsArtworkProxy')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const SPORTSMETA_BASE_URL = process.env.SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc'
const OUT_DIR = path.join(process.cwd(), 'public', 'sports-style-samples')

// Each sample renders one theme using a canonical SportsMeta event ID. Themes
// whose templates expose home/away/league logo slots (editorial, sportsbook,
// trading-card, brutalist, glitch, ticket-stub) go through the real-logo
// pipeline. Broadcast has empty slots by design — it draws its own initials-
// in-circles — so it renders straight from the template SVG.
const SAMPLES = [
  {
    theme: 'editorial',
    canonicalId: 'sportsmeta:event:football|2026-04-23|spanish-la-liga|levante|sevilla',
    realLogos: true
  },
  {
    theme: 'broadcast',
    canonicalId: 'sportsmeta:event:football|2026-04-23|spanish-la-liga|levante|sevilla',
    realLogos: false,
    eventOverride: {
      sport: 'Football',
      sportHint: 'football',
      league: 'Spanish La Liga',
      title: 'Levante vs Sevilla',
      eventTitle: 'Levante vs Sevilla',
      homeTeam: 'Levante',
      awayTeam: 'Sevilla',
      date: '2026-04-23',
      eventClass: 'team_vs_team'
    }
  },
  {
    theme: 'sportsbook',
    canonicalId: 'sportsmeta:event:mma|2022-03-06|ufc|ufc-272-covington-vs-masvidal',
    realLogos: true
  },
  {
    theme: 'trading-card',
    canonicalId: 'sportsmeta:event:mma|2022-03-06|ufc|ufc-272-covington-vs-masvidal',
    realLogos: true
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
