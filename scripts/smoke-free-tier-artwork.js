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

const INCLUDED_TEMPLATE = 'ticket-stub'
const BLOCKED_TEMPLATES = ['glitch', 'broadcast', 'sportsbook', 'editorial', 'trading-card', 'brutalist']

function assertTicketStub(value, message) {
  assert.equal(value, INCLUDED_TEMPLATE, `${message}: expected ${INCLUDED_TEMPLATE}, got ${value}`)
}

function assertNoStaleCopy(file, patterns) {
  const text = fs.readFileSync(file, 'utf8')
  for (const pattern of patterns) {
    assert.doesNotMatch(text, pattern, `${file} contains stale free-tier sports artwork wording: ${pattern}`)
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

async function assertConfiguredMetaNormalizes(template) {
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
  assertTicketStub(result.meta.sportsArtwork?.posterTemplate, `${template} configured meta posterTemplate`)
  assertTicketStub(new URL(result.meta.poster).searchParams.get('template'), `${template} configured meta poster URL template`)
  assert.equal(result.meta.layoutFamily, 'TICKET_STUB', `${template} configured meta layoutFamily`)
}

async function main() {
  assert.equal(SPORTS_POSTER_TEMPLATES.length, 7, `locked poster contract should remain 7 families, got ${SPORTS_POSTER_TEMPLATES.length}`)
  assert.deepEqual(
    SPORTS_POSTER_TEMPLATES,
    ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'ticket-stub', 'glitch'],
    'locked poster family list changed unexpectedly'
  )

  assertTicketStub(normalizeSportsPosterTemplate('free'), 'free alias')
  assertTicketStub(normalizeSportsPosterTemplate('default'), 'default alias')
  assertTicketStub(resolveSportsPosterTemplate('', undefined, INCLUDED_TEMPLATE), 'empty/default resolver')

  for (const template of [INCLUDED_TEMPLATE, ...BLOCKED_TEMPLATES]) {
    const normalized = normalizeAddonConfig({ sportsPosterTemplate: template })
    assertTicketStub(normalized.sportsPosterTemplate, `${template} normalizeAddonConfig`)

    const poster = resolveSportsPosterAsset(sportsEventInput(template))
    assertTicketStub(poster.selectedTemplate, `${template} resolveSportsPosterAsset selectedTemplate`)
    assertTicketStub(new URL(poster.poster).searchParams.get('template'), `${template} poster URL template`)
    assert.equal(poster.layoutFamily, 'TICKET_STUB', `${template} poster layoutFamily`)
    assert.equal(resolveSportsArtworkLayoutFamily(sportsEventInput(template)), 'TICKET_STUB', `${template} layout resolver`)
    await assertConfiguredMetaNormalizes(template)
  }

  const previousAdminOverride = process.env.PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE
  const previousTemplateOverride = process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE
  process.env.PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE = 'broadcast'
  process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE = 'broadcast'
  try {
    const poster = resolveSportsPosterAsset(sportsEventInput('broadcast'))
    assertTicketStub(poster.selectedTemplate, 'server env override resolveSportsPosterAsset selectedTemplate')
    assertTicketStub(new URL(poster.poster).searchParams.get('template'), 'server env override poster URL template')
  } finally {
    if (previousAdminOverride === undefined) delete process.env.PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE
    else process.env.PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE = previousAdminOverride
    if (previousTemplateOverride === undefined) delete process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE
    else process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE = previousTemplateOverride
  }

  const configureHtml = fs.readFileSync('public/configure.html', 'utf8')
  const optionValues = [...configureHtml.matchAll(/<option\s+value="([^"]+)"/gi)].map((match) => match[1])
  assert.deepEqual(
    optionValues.filter((value) => SPORTS_POSTER_TEMPLATES.includes(value)),
    [INCLUDED_TEMPLATE],
    'public configure page must expose exactly one selectable sports poster option'
  )
  assert.match(configureHtml, /Included Sports Style/i, 'configure page should present the included sports style')
  assert.match(
    configureHtml,
    /sportsPosterTemplate:\s*resolveSelectedSportsPosterTemplate\(\s*'ticket-stub'\s*\)/,
    'configure save payload must default to ticket-stub when entitlement is absent'
  )
  for (const template of BLOCKED_TEMPLATES) {
    assert.doesNotMatch(configureHtml, new RegExp(`value="${template}"`, 'i'), `configure page leaks ${template}`)
  }

  const staleFreeTierPatterns = [
    /free[^.\n]{0,80}(?:text-only|text only|plain text|generated text|generated cards|generated svg|svg-only|svg first|svg-first)/i,
    /(?:text-only|text only|plain text|generated text|generated cards|generated svg|svg-only|svg first|svg-first)[^.\n]{0,80}free/i,
    /Free cards\s*=\s*generated,\s*generic,\s*text-only/i,
    /Free users see text/i
  ]
  for (const file of ['public/sports.html', 'docs/SALES_SPEC.md']) {
    assertNoStaleCopy(file, staleFreeTierPatterns)
  }
  assertNoStaleCopy('CLAUDE.md', [/all eight styles/i, /\b8 styles\b/i])

  console.log(
    `Free-tier artwork smoke passed. ` +
    `families=7 included=${INCLUDED_TEMPLATE} ` +
    `blocked=${BLOCKED_TEMPLATES.join(',')} ` +
    `configuredMeta=ticket-stub ui=locked copy=clean`
  )
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
