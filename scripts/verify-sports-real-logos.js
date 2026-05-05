#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { SPORTS_POSTER_TEMPLATES } = require('../src/utils/sportsPosterTemplates')
const { _test: sportsArtworkProxyTest } = require('../src/handlers/sportsArtworkProxy')

const OUT_DIR = path.join(process.cwd(), '.runtime', 'sports-real-logo-proof')
const SPORTSMETA_BASE_URL = String(process.env.PVTKRRX_SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc').replace(/\/+$/, '')
const WIDTH = 600
const HEIGHT = 900
const REAL_LOGO_KINDS = new Set(['real-team', 'real-league', 'real-event'])

const FIXTURES = [
  {
    key: 'football-team-vs-team',
    sampleType: 'real-team-vs-team',
    sport: 'football',
    event: 'Chelsea vs Nottingham Forest',
    canonicalId: 'sportsmeta:event:football|2026-05-04|english-premier-league|chelsea|nottingham-forest',
    expectsRealLogo: true,
    expectedSource: 'team badges, then league/event identity'
  },
  {
    key: 'mma-fighter-vs-fighter',
    sampleType: 'real-fighter-vs-fighter',
    sport: 'mma',
    event: 'UFC 328',
    canonicalId: 'sportsmeta:event:mma|2026-05-09|ufc|ufc-328-chimaev|strickland',
    expectsRealLogo: true,
    expectedSource: 'fighter/team badge if present, then UFC/event identity'
  },
  {
    key: 'motorsport-league-event',
    sampleType: 'real-league-event',
    sport: 'motorsport',
    event: 'Vodafone Rally de Portugal',
    canonicalId: 'sportsmeta:event:motorsport|2026-05-07|wrc|wrc-vodafone-rally-de-portugal',
    expectsRealLogo: true,
    expectedSource: 'league logo, then event identity'
  },
  {
    key: 'fallback-only',
    sampleType: 'fallback-only',
    sport: 'test-sport',
    event: 'Fallback Only Proof',
    expectsRealLogo: false,
    expectedSource: 'synthetic glyph fallback only',
    fallbackInput: {
      sport: 'Test Sport',
      league: 'No Real Logo League',
      eventTitle: 'Fallback Only Proof',
      title: 'Fallback Only Proof',
      eventDetail: 'No canonical ID',
      date: '2026-05-05',
      eventClass: 'generic_event',
      source: 'verifier',
      rawTitle: 'Fallback Only Proof'
    }
  }
]

function slug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sample'
}

function slotFailures(slots = []) {
  const failures = []
  for (const slot of slots || []) {
    const role = String(slot.role || 'logo')
    const left = Number(slot.left)
    const top = Number(slot.top)
    const size = Number(slot.size)
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(size) || size <= 0) {
      failures.push(`bad_logo_slot_${role}`)
      continue
    }
    if (left < 0 || top < 0 || left + size > WIDTH || top + size > HEIGHT) {
      failures.push(`clipped_logo_slot_${role}`)
    }
  }
  return failures
}

async function renderFixture(template, fixture) {
  if (fixture.canonicalId) {
    return sportsArtworkProxyTest.renderTeamBadgeArtworkPng({
      canonicalId: fixture.canonicalId,
      sportsmetaBaseUrl: SPORTSMETA_BASE_URL,
      variant: 'poster',
      template
    })
  }
  return sportsArtworkProxyTest.renderTemplateFallbackArtwork(
    'poster',
    fixture.fallbackInput,
    template,
    'verifier_no_real_logo_available'
  )
}

async function inspectBuffer(buffer, outputPath) {
  if (!buffer) return { width: 0, height: 0, outputPath: '' }
  fs.writeFileSync(outputPath, buffer)
  const metadata = await sharp(buffer).metadata()
  return {
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    outputPath
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const rows = []
  for (const template of SPORTS_POSTER_TEMPLATES) {
    for (const fixture of FIXTURES) {
      const row = {
        sample: fixture.key,
        sampleType: fixture.sampleType,
        template,
        sport: fixture.sport,
        event: fixture.event,
        expectedLogoSource: fixture.expectedSource,
        expectsRealLogo: fixture.expectsRealLogo,
        canonicalId: fixture.canonicalId || '',
        logoKind: '',
        logoSourceUrl: '',
        logoSourceUrls: [],
        logoFallbackReason: '',
        logoRealCount: 0,
        logoFallbackCount: 0,
        width: 0,
        height: 0,
        outputPath: '',
        failures: []
      }

      try {
        const result = await renderFixture(template, fixture)
        row.logoKind = String(result?.logoKind || 'fallback-glyph')
        row.logoSourceUrl = String(result?.logoSourceUrl || '')
        row.logoSourceUrls = Array.isArray(result?.logoSourceUrls) ? result.logoSourceUrls : []
        row.logoFallbackReason = String(result?.logoFallbackReason || '')
        row.logoRealCount = Number(result?.logoRealCount || 0)
        row.logoFallbackCount = Number(result?.logoFallbackCount || 0)
        row.logoLookupAttempts = result?.logoLookupAttempts || []
        row.logoSlots = result?.logoSlots || []

        const outputPath = path.join(OUT_DIR, `${slug(template)}-${slug(fixture.key)}.png`)
        const dimensions = await inspectBuffer(result?.buffer, outputPath)
        row.width = dimensions.width
        row.height = dimensions.height
        row.outputPath = dimensions.outputPath

        if (!result?.buffer) row.failures.push('missing_rendered_buffer')
        if (row.width !== WIDTH || row.height !== HEIGHT) row.failures.push(`bad_dimensions_${row.width}x${row.height}`)
        if (fixture.expectsRealLogo) {
          if (!REAL_LOGO_KINDS.has(row.logoKind)) row.failures.push(`expected_real_logo_got_${row.logoKind || 'missing'}`)
          if ((fixture.sampleType === 'real-team-vs-team' || fixture.sampleType === 'real-fighter-vs-fighter') && row.logoKind !== 'real-team') {
            row.failures.push(`expected_real_team_logo_got_${row.logoKind || 'missing'}`)
          }
          if (row.logoRealCount < 1) row.failures.push('expected_real_logo_count')
          if (!row.logoSourceUrl && row.logoSourceUrls.length === 0) row.failures.push('missing_real_logo_source_url')
        } else {
          if (row.logoKind !== 'fallback-glyph') row.failures.push(`expected_fallback_glyph_got_${row.logoKind || 'missing'}`)
          if (row.logoFallbackCount < 1) row.failures.push('expected_fallback_logo_count')
          if (!row.logoFallbackReason) row.failures.push('missing_fallback_reason')
        }
        row.failures.push(...slotFailures(row.logoSlots))
      } catch (error) {
        row.failures.push(`render_error_${String(error?.message || error).replace(/[^a-z0-9]+/gi, '_').slice(0, 100)}`)
      }

      rows.push(row)
    }
  }

  const realLogoCount = rows.filter((row) => row.expectsRealLogo && row.failures.length === 0 && REAL_LOGO_KINDS.has(row.logoKind)).length
  const fallbackGlyphCount = rows.filter((row) => row.logoKind === 'fallback-glyph').length
  const fallbackAllowedCount = rows.filter((row) => !row.expectsRealLogo && row.logoKind === 'fallback-glyph' && row.failures.length === 0).length
  const unexpectedFallbackCount = rows.filter((row) => row.expectsRealLogo && row.logoKind === 'fallback-glyph').length
  const failures = rows.reduce((total, row) => total + row.failures.length, 0)
  const summary = {
    outputDir: OUT_DIR,
    sportsmetaBaseUrl: SPORTSMETA_BASE_URL,
    totalOutputs: rows.length,
    realLogoCount,
    fallbackGlyphCount,
    fallbackAllowedCount,
    unexpectedFallbackCount,
    failures
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ summary, rows }, null, 2))

  for (const row of rows) {
    console.log([
      row.failures.length ? 'FAIL' : 'PASS',
      `sample=${row.sample}`,
      `template=${row.template}`,
      `expectedReal=${row.expectsRealLogo ? 'yes' : 'no'}`,
      `logoKind=${row.logoKind || 'missing'}`,
      `logoReal=${row.logoRealCount}`,
      `logoFallback=${row.logoFallbackCount}`,
      `dims=${row.width}x${row.height}`,
      `output=${row.outputPath}`,
      row.failures.length ? `failures=${row.failures.join(',')}` : ''
    ].filter(Boolean).join(' | '))
  }
  console.log(`PVTKRRX sports real-logo verifier summary: ${JSON.stringify(summary)}`)
  console.log(`manifest=${path.join(OUT_DIR, 'manifest.json')}`)

  if (failures > 0 || unexpectedFallbackCount > 0) process.exitCode = 1
}

main()
  .then(() => {
    if (process.exitCode) process.exit(process.exitCode)
  })
  .catch((error) => {
    console.error(error?.stack || error)
    process.exit(1)
  })
