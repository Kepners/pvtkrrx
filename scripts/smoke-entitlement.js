#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ||
  'smoke-entitlement-secret-aaaaaaaaaaaaaaaaaaaa'

const {
  ENTITLEMENT_SOURCE,
  resolveSportsPosterEntitlement,
  verifySportsPosterEntitlementStamp,
  signSportsPosterEntitlementStamp,
  hashEmailForOwnerCheck,
  clampSportsPosterTemplate
} = require('../src/utils/entitlement')
const {
  SPORTS_POSTER_TEMPLATES,
  normalizeSportsPosterTemplate
} = require('../src/utils/sportsPosterTemplates')
const {
  normalizeAddonConfig,
  applySportsPosterEntitlement,
  buildConfigReadback
} = require('../src/lib/shared')
const {
  resolveSportsPosterAsset,
  resolveSportsArtworkLayoutFamily
} = require('../src/utils/sportsArtwork')
const {
  _test: sportsArtworkProxyTest
} = require('../src/handlers/sportsArtworkProxy')

const OWNER_EMAIL = 'kepners@gmail.com'

async function withEnv(values, fn) {
  const previous = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key]
    if (value === undefined || value === null) delete process.env[key]
    else process.env[key] = String(value)
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function assertAllTemplates(value, label) {
  assert.deepEqual([...value].sort(), [...SPORTS_POSTER_TEMPLATES].sort(), label)
}

function eventInput(template, extra = {}) {
  return {
    baseUrl: 'https://www.pvtkrrx.cc',
    sportsmetaBaseUrl: 'https://sportsmeta.pvtkrrx.cc',
    sportsPosterTemplate: template,
    canonicalId: 'sportsmeta:event:football|2026-04-10|epl|arsenal-vs-chelsea',
    sportHint: 'football',
    league: 'EPL',
    title: 'Arsenal vs Chelsea',
    date: '2026-04-10',
    source: 'sportsmeta',
    ...extra
  }
}

async function main() {
  assert.deepEqual(
    SPORTS_POSTER_TEMPLATES,
    ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'ticket-stub', 'glitch'],
    'template contract must remain seven known families'
  )
  for (const template of SPORTS_POSTER_TEMPLATES) {
    assert.equal(normalizeSportsPosterTemplate(template), template, `${template} normalizer round-trip`)
  }

  const publicSelection = resolveSportsPosterEntitlement({
    requestedTemplate: 'glitch',
    user: { email: 'unpaid@example.com', id: 'usr_unpaid' }
  })
  assert.equal(publicSelection.source, ENTITLEMENT_SOURCE.NONE, 'plain user selection source')
  assert.equal(publicSelection.resolvedTemplate, 'glitch', 'plain user selection preserves glitch')
  assert.equal(publicSelection.allowed, true, 'plain user selection is allowed')
  assertAllTemplates(publicSelection.allowedTemplates, 'plain user selection allows all templates')

  const normalized = normalizeAddonConfig({ sportsPosterTemplate: 'glitch' })
  assert.equal(normalized.sportsPosterTemplate, 'glitch', 'normalizeAddonConfig preserves glitch')
  assert.equal(normalized.entitlementSource, ENTITLEMENT_SOURCE.NONE, 'normal user selection carries no entitlement source')

  const { config: saved, entitlement } = await applySportsPosterEntitlement(
    normalizeAddonConfig({ sportsPosterTemplate: 'glitch' }),
    {
      requestedTemplate: 'glitch',
      user: { email: 'unpaid@example.com', id: 'usr_unpaid' }
    }
  )
  assert.equal(saved.sportsPosterTemplate, 'glitch', 'save path preserves user-selected glitch')
  assert.equal(saved.entitlementSource, ENTITLEMENT_SOURCE.NONE, 'save path does not need paid entitlement source')
  assert.equal(entitlement.resolvedTemplate, 'glitch', 'save path entitlement resolves glitch')

  const readback = buildConfigReadback(saved)
  assert.equal(readback.sportsPosterTemplate, 'glitch', 'readback shows selected glitch')
  assert.equal(readback.entitlement.source, ENTITLEMENT_SOURCE.NONE, 'readback source remains none')
  assert.equal(readback.entitlement.allowed, true, 'readback marks style selection allowed')
  assertAllTemplates(readback.entitlement.allowedSportsPosterTemplates, 'readback exposes every template')

  const poster = resolveSportsPosterAsset(eventInput('glitch', saved))
  const posterUrl = new URL(poster.poster)
  assert.equal(poster.selectedTemplate, 'glitch', 'asset resolver selects glitch')
  assert.equal(posterUrl.searchParams.get('template'), 'glitch', 'poster URL carries glitch')
  assert.equal(resolveSportsArtworkLayoutFamily(eventInput('glitch', saved)), 'GLITCH', 'glitch layout family')

  assert.equal(
    sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template: 'glitch' } }),
    'glitch',
    'artwork proxy honours plain valid template query'
  )
  assert.equal(
    sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template: 'not-real' } }),
    'ticket-stub',
    'artwork proxy normalizes invalid template query to ticket-stub'
  )

  await withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, async () => {
    const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
    const ownerSelection = resolveSportsPosterEntitlement({
      user: { email: OWNER_EMAIL, id: 'usr_owner' },
      requestedTemplate: 'broadcast'
    })
    assert.equal(ownerSelection.source, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'owner source still detected')
    assert.equal(ownerSelection.ownerEmailHash, ownerHash, 'owner hash stamped')
    assert.equal(ownerSelection.resolvedTemplate, 'broadcast', 'owner template preserved')
  })

  const stampUrl = new URL('https://www.pvtkrrx.cc/sports-artwork/id/poster/test.png?template=broadcast')
  const signature = signSportsPosterEntitlementStamp({
    pathname: stampUrl.pathname,
    query: stampUrl.searchParams,
    requestedTemplate: 'broadcast',
    stampedSource: ENTITLEMENT_SOURCE.MANUAL_GRANT,
    stampedHash: ''
  })
  assert.match(signature, /^[a-f0-9]{64}$/i, 'legacy entitlement stamp signs')
  assert.equal(
    verifySportsPosterEntitlementStamp({
      pathname: stampUrl.pathname,
      query: stampUrl.searchParams,
      requestedTemplate: 'broadcast',
      stampedSource: ENTITLEMENT_SOURCE.MANUAL_GRANT,
      stampedHash: '',
      signature
    }),
    true,
    'legacy entitlement stamp still verifies'
  )

  const noneEntitlement = {
    source: ENTITLEMENT_SOURCE.NONE,
    allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
    resolvedTemplate: 'broadcast',
    allowed: true
  }
  assert.equal(clampSportsPosterTemplate('glitch', noneEntitlement), 'glitch', 'clamp allows normal user glitch')
  assert.equal(clampSportsPosterTemplate('', noneEntitlement), 'broadcast', 'clamp falls back to resolved template')

  console.log(
    'Entitlement smoke passed. ' +
    'user-selection=all-templates source=none owner-detection=kept legacy-stamps=kept'
  )
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
