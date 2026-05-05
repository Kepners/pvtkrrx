#!/usr/bin/env node
// Drives the proxy's renderTeamBadgeArtworkPng directly against the live
// SportsMeta service to prove that the inspect-based real-logo path emits a
// poster whose composited badges come from r2.thesportsdb.com (not glyph SVG).

const fs = require('fs')
const path = require('path')

const proxy = require('../src/handlers/sportsArtworkProxy')
const renderTeamBadgeArtworkPng = proxy._test.renderTeamBadgeArtworkPng

const CASES = [
  {
    label: 'arsenal-vs-atletico-madrid',
    canonicalId: 'sportsmeta:event:football|2026-05-05|uefa-champions-league|arsenal|atl-tico-madrid'
  },
  {
    label: 'knicks-vs-76ers',
    canonicalId: 'sportsmeta:event:basketball|2026-05-05|nba|new-york-knicks|philadelphia-76ers'
  },
  {
    label: 'spurs-vs-timberwolves',
    canonicalId: 'sportsmeta:event:basketball|2026-05-04|nba|san-antonio-spurs|minnesota-timberwolves'
  }
]

async function main() {
  const outDir = path.resolve(__dirname, '..', 'tmp', 'real-logo-verify')
  fs.mkdirSync(outDir, { recursive: true })

  // Also exercise the logo variant via the loadInspectAssetSourceUrl + tryRealLogoVariantPng path
  const sharp = require('sharp')
  const fetch1 = global.fetch
  for (const { label, canonicalId } of CASES) {
    const url = `https://sportsmeta.pvtkrrx.cc/inspect/asset/leagueLogo/${encodeURIComponent(canonicalId)}`
    try {
      const r = await fetch1(url)
      const j = await r.json()
      const cdn = j.assetSourceUrl
      const cdnResp = await fetch1(cdn)
      const buf = Buffer.from(await cdnResp.arrayBuffer())
      const png = await sharp(buf).resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      fs.writeFileSync(path.join(outDir, `${label}-logo.png`), png)
      console.log(`[logo] ${label} -> ${cdn} (${png.length} bytes)`)
    } catch (e) {
      console.log(`[logo] ${label} ERROR: ${e.message}`)
    }
  }

  for (const { label, canonicalId } of CASES) {
    const result = await renderTeamBadgeArtworkPng({
      canonicalId,
      sportsmetaBaseUrl: 'https://sportsmeta.pvtkrrx.cc',
      variant: 'poster',
      template: 'ticket-stub'
    })
    const pngPath = path.join(outDir, `${label}.png`)
    if (result?.buffer) fs.writeFileSync(pngPath, result.buffer)
    console.log(`[verify] ${label}`)
    console.log(`  logoKind: ${result?.logoKind}`)
    console.log(`  logoRealCount: ${result?.logoRealCount}`)
    console.log(`  logoFallbackCount: ${result?.logoFallbackCount}`)
    console.log(`  logoSourceUrls:`)
    for (const url of (result?.logoSourceUrls || [])) console.log(`    - ${url}`)
    console.log(`  logoLookupAttempts:`)
    for (const a of (result?.logoLookupAttempts || [])) {
      console.log(`    - role=${a.role} kind=${a.kind} status=${a.status} result=${a.result} url=${a.url}`)
    }
    console.log(`  png: ${result?.buffer ? pngPath + ' (' + result.buffer.length + ' bytes)' : 'NONE'}`)
    console.log('')
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
