#!/usr/bin/env node

const assert = require('node:assert/strict')
const fs = require('node:fs')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'smoke-free-tier-artwork-secret-abcdefghijklmnop'

const { normalizeAddonConfig } = require('../src/lib/shared')
const {
  SPORTS_POSTER_TEMPLATES,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate
} = require('../src/utils/sportsPosterTemplates')
const {
  resolveSportsPosterAsset,
  resolveSportsArtworkLayoutFamily
} = require('../src/utils/sportsArtwork')
const { encodeCustomId } = require('../src/utils/customId')
const { handleMeta } = require('../src/handlers/meta')

const DEFAULT_TEMPLATE = 'ticket-stub'
const EXPECTED_LAYOUT = {
  editorial: 'EDITORIAL',
  broadcast: 'BROADCAST',
  sportsbook: 'SPORTSBOOK',
  'trading-card': 'TRADING_CARD',
  brutalist: 'BRUTALIST',
  'ticket-stub': 'TICKET_STUB',
  glitch: 'GLITCH'
}

function assertTemplate(value, expected, message) {
  assert.equal(value, expected, `${message}: expected ${expected}, got ${value}`)
}

function assertNoStaleCopy(file, patterns) {
  const text = fs.readFileSync(file, 'utf8')
  for (const pattern of patterns) {
    assert.doesNotMatch(text, pattern, `${file} contains stale sports artwork wording: ${pattern}`)
  }
}

function sportsEventInput(template) {
  return {
    baseUrl: 'https://www.pvtkrrx.cc',
    sportsmetaBaseUrl: 'https://sportsmeta.pvtkrrx.cc',
    sportsPosterTemplate: template,
    config: { sportsPosterTemplate: template },
    canonicalId: 'sportsmeta:event:fighting|2026-04-10|professional-fighters-league|pfl-africa-1-pretoria',
    sportHint: 'mma',
    league: 'Professional Fighters League',
    title: 'PFL Africa 1 Pretoria',
    eventClass: 'combat_event',
    date: '2026-04-10',
    source: 'sportsmeta'
  }
}

async function assertConfiguredMetaHonours(template) {
  const id = encodeCustomId({
    y: 'sports',
    k: 'sports',
    n: 'PFL Africa 1 Pretoria',
    t: 'PFL Africa 1 Pretoria',
    r: 'mma',
    g: 'Professional Fighters League',
    j: 'Main Card',
    e: '2026-04-10',
    ec: 'combat_event',
    q: 'fallback_only'
  }, {
    compress: true,
    compact: 'sports'
  })
  const result = await handleMeta(
    normalizeAddonConfig({ sportsPosterTemplate: template }),
    'sports',
    id,
    { baseUrl: 'https://www.pvtkrrx.cc' }
  )
  assert.ok(result?.meta, `${template} configured meta returned meta`)
  assertTemplate(result.meta.sportsArtwork?.posterTemplate, template, `${template} configured meta posterTemplate`)
  assertTemplate(new URL(result.meta.poster).searchParams.get('template'), template, `${template} configured meta poster URL template`)
  assertTemplate(result.meta.layoutFamily, EXPECTED_LAYOUT[template], `${template} configured meta layoutFamily`)
}

async function main() {
  assert.deepEqual(
    SPORTS_POSTER_TEMPLATES,
    ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'ticket-stub', 'glitch'],
    'locked poster family list changed unexpectedly'
  )

  assertTemplate(normalizeSportsPosterTemplate('free'), DEFAULT_TEMPLATE, 'free alias')
  assertTemplate(normalizeSportsPosterTemplate('default'), DEFAULT_TEMPLATE, 'default alias')
  assertTemplate(resolveSportsPosterTemplate('', undefined, DEFAULT_TEMPLATE), DEFAULT_TEMPLATE, 'empty/default resolver')

  for (const template of SPORTS_POSTER_TEMPLATES) {
    const normalized = normalizeAddonConfig({ sportsPosterTemplate: template })
    assertTemplate(normalized.sportsPosterTemplate, template, `${template} normalizeAddonConfig`)

    const poster = resolveSportsPosterAsset(sportsEventInput(template))
    assertTemplate(poster.selectedTemplate, template, `${template} resolveSportsPosterAsset selectedTemplate`)
    assertTemplate(new URL(poster.poster).searchParams.get('template'), template, `${template} poster URL template`)
    assertTemplate(poster.layoutFamily, EXPECTED_LAYOUT[template], `${template} poster layoutFamily`)
    assertTemplate(resolveSportsArtworkLayoutFamily(sportsEventInput(template)), EXPECTED_LAYOUT[template], `${template} layout resolver`)
    await assertConfiguredMetaHonours(template)
  }

  const configureHtml = fs.readFileSync('public/configure.html', 'utf8')
  const optionValues = [...configureHtml.matchAll(/<option\s+value="([^"]+)"/gi)].map((match) => match[1])
  assert.deepEqual(
    optionValues.filter((value) => SPORTS_POSTER_TEMPLATES.includes(value)),
    SPORTS_POSTER_TEMPLATES,
    'public configure page must expose every sports poster option'
  )
  assert.match(configureHtml, /Sports Poster Style/i, 'configure page should expose the sports style selector')
  assert.doesNotMatch(configureHtml, /Other templates require an entitlement/i, 'configure page must not claim user styles require entitlement')

  const staleFreeTierPatterns = [
    /free[^.\n]{0,80}(?:text-only|text only|plain text|generated text|generated cards|generated svg|svg-only|svg first|svg-first)/i,
    /(?:text-only|text only|plain text|generated text|generated cards|generated svg|svg-only|svg first|svg-first)[^.\n]{0,80}free/i,
    /Free cards\s*=\s*generated,\s*generic,\s*text-only/i,
    /Free users see text/i,
    /configured\s+`?sportsPosterTemplate=glitch`?[^.\n]{0,80}`?ticket-stub`?/i
  ]
  for (const file of ['public/sports.html', 'docs/SALES_SPEC.md']) {
    assertNoStaleCopy(file, staleFreeTierPatterns)
  }
  assertNoStaleCopy('CLAUDE.md', [/all eight styles/i, /\b8 styles\b/i])

  console.log(
    `Sports artwork selection smoke passed. ` +
    `families=${SPORTS_POSTER_TEMPLATES.length} default=${DEFAULT_TEMPLATE} ` +
    `selectable=${SPORTS_POSTER_TEMPLATES.join(',')} ui=unlocked copy=clean`
  )
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
