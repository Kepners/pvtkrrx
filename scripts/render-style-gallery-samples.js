#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { _test: { renderTeamBadgeArtworkPng } } = require('../src/handlers/sportsArtworkProxy')
const { renderSportsPosterTemplateSvg } = require('../src/utils/sportsPosterTemplates')

const SPORTSMETA_BASE_URL = process.env.SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc'
const OUT_DIR = path.join(process.cwd(), 'public', 'sports-style-samples')

// Each sample renders one theme through the real-logo pipeline. Canonical IDs
// were verified to have homeBadge + awayBadge + leagueLogo cached in SportsMeta
// so every preview is a guaranteed three-real-logo render (no glyph fallback,
// no template-only initials). Different sports per template so the gallery
// shows variety: football editorial / football broadcast / hockey sportsbook /
// basketball trading-card / F1 brutalist / F1 glitch.
const SAMPLES = [
  {
    theme: 'editorial',
    canonicalId: 'sportsmeta:event:football|2026-04-23|spanish-la-liga|levante|sevilla',
    realLogos: true
  },
  {
    theme: 'broadcast',
    canonicalId: 'sportsmeta:event:football|2026-05-13|english-premier-league|manchester-city|crystal-palace',
    realLogos: true
  },
  {
    theme: 'sportsbook',
    canonicalId: 'sportsmeta:event:ice-hockey|2026-05-08|canadian-whl|everett-silvertips|prince-albert-raiders',
    realLogos: true
  },
  {
    theme: 'trading-card',
    canonicalId: 'sportsmeta:event:basketball|2026-05-14|wnba|connecticut-sun|las-vegas-aces',
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
