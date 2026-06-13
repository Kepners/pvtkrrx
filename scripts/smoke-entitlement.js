#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')

// Set ENCRYPTION_SECRET BEFORE shared.js is required so the runtime accepts
// the smoke-only secret. Other env vars are flipped per scenario below.
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ||
  'smoke-entitlement-secret-aaaaaaaaaaaaaaaaaaaa'

const {
  ENTITLEMENT_SOURCE,
  resolveSportsPosterEntitlement,
  verifyStampedSportsPosterEntitlement,
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
const ADMIN_EMAIL = 'admin@pvtkrrx.cc'
const PAID_USER_EMAIL = 'paid@example.com'
const UNPAID_USER_EMAIL = 'unpaid@example.com'
const PAID_TEMPLATES = ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'glitch']

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

function assertEntitlement(actual, expected, label) {
  assert.equal(actual.source, expected.source, `${label}: source ${actual.source} != ${expected.source}`)
  assert.deepEqual(
    [...actual.allowedTemplates].sort(),
    [...expected.allowedTemplates].sort(),
    `${label}: allowedTemplates`
  )
  assert.equal(actual.resolvedTemplate, expected.resolvedTemplate, `${label}: resolvedTemplate`)
  assert.equal(actual.allowed, expected.allowed, `${label}: allowed`)
}

function eventInput(stampedConfig, extra = {}) {
  return {
    baseUrl: 'https://www.pvtkrrx.cc',
    sportsmetaBaseUrl: 'https://sportsmeta.pvtkrrx.cc',
    sportsPosterTemplate: stampedConfig.sportsPosterTemplate,
    entitlementSource: stampedConfig.entitlementSource,
    entitlementOwnerEmailHash: stampedConfig.entitlementOwnerEmailHash,
    canonicalId: 'sportsmeta:event:football|2026-04-10|epl|arsenal-vs-chelsea',
    sportHint: 'football',
    league: 'EPL',
    title: 'Arsenal vs Chelsea',
    date: '2026-04-10',
    source: 'sportsmeta',
    ...extra
  }
}

// ────────────────────────────────────────────────────────────────────────
// 1. Resolver precedence (owner > admin > manual_grant > member_token > trial > none)
// ────────────────────────────────────────────────────────────────────────
function testOwnerOverrideByEmail() {
  withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, () => {
    const entitlement = resolveSportsPosterEntitlement({
      user: { email: OWNER_EMAIL, id: 'usr_owner' },
      requestedTemplate: 'glitch'
    })
    assertEntitlement(entitlement, {
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES,
      resolvedTemplate: 'glitch',
      allowed: true
    }, 'owner override by email')
    assert.equal(entitlement.ownerEmailHash, hashEmailForOwnerCheck(OWNER_EMAIL), 'owner ownerEmailHash')
  })
}

function testOwnerOverrideByStremioUserId() {
  withEnv({ PVTKRRX_OWNER_STREMIO_USER_IDS: 'stremio-user-abc' }, () => {
    const entitlement = resolveSportsPosterEntitlement({
      user: { id: 'usr_x', stremio: { userId: 'stremio-user-abc' } },
      requestedTemplate: 'broadcast'
    })
    assertEntitlement(entitlement, {
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES,
      resolvedTemplate: 'broadcast',
      allowed: true
    }, 'owner override by Stremio userId')
  })
}

function testAdminOverride() {
  withEnv({ PVTKRRX_ADMIN_EMAILS: ADMIN_EMAIL }, () => {
    const entitlement = resolveSportsPosterEntitlement({
      user: { email: ADMIN_EMAIL, id: 'usr_admin' },
      requestedTemplate: 'editorial'
    })
    assertEntitlement(entitlement, {
      source: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES,
      resolvedTemplate: 'editorial',
      allowed: true
    }, 'admin override')
  })
}

function testManualGrantOnAccount() {
  const entitlement = resolveSportsPosterEntitlement({
    user: {
      email: PAID_USER_EMAIL,
      id: 'usr_paid',
      entitlements: { sportsPosterTemplates: ['broadcast', 'editorial'] }
    },
    requestedTemplate: 'broadcast'
  })
  assertEntitlement(entitlement, {
    source: ENTITLEMENT_SOURCE.MANUAL_GRANT,
    allowedTemplates: ['broadcast', 'editorial', 'ticket-stub'],
    resolvedTemplate: 'broadcast',
    allowed: true
  }, 'manual grant – allowed template')

  const blocked = resolveSportsPosterEntitlement({
    user: {
      email: PAID_USER_EMAIL,
      id: 'usr_paid',
      entitlements: { sportsPosterTemplates: ['broadcast'] }
    },
    requestedTemplate: 'glitch'
  })
  assert.equal(blocked.resolvedTemplate, 'ticket-stub', 'manual grant – non-granted template clamped')
}

function testMemberTokenOnConfig() {
  const entitlement = resolveSportsPosterEntitlement({
    user: { email: PAID_USER_EMAIL, id: 'usr_paid' },
    config: { sportsPosterMemberToken: 'sm_xxx' },
    requestedTemplate: 'sportsbook'
  })
  assert.equal(entitlement.source, ENTITLEMENT_SOURCE.MEMBER_TOKEN, 'member token source')
  assert.equal(entitlement.resolvedTemplate, 'sportsbook', 'member token resolved template')
}

function testTrialActive() {
  const entitlement = resolveSportsPosterEntitlement({
    user: { email: PAID_USER_EMAIL, id: 'usr_trial', trial: { active: true } },
    requestedTemplate: 'trading-card'
  })
  assert.equal(entitlement.source, ENTITLEMENT_SOURCE.TRIAL, 'trial source')
  assert.equal(entitlement.resolvedTemplate, 'trading-card', 'trial resolved template')
}

function testUnpaidUser() {
  const entitlement = resolveSportsPosterEntitlement({
    user: { email: UNPAID_USER_EMAIL, id: 'usr_unpaid' },
    requestedTemplate: 'glitch'
  })
  assertEntitlement(entitlement, {
    source: ENTITLEMENT_SOURCE.NONE,
    allowedTemplates: ['ticket-stub'],
    resolvedTemplate: 'ticket-stub',
    allowed: false
  }, 'unpaid user blocked')
}

function testSelfHostAdminFlagWithoutOwnerEmails() {
  withEnv({ PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, () => {
    const entitlement = resolveSportsPosterEntitlement({
      user: null,
      requestedTemplate: 'sportsbook',
      selfHostAdmin: true
    })
    assert.equal(entitlement.source, ENTITLEMENT_SOURCE.ADMIN_OVERRIDE, 'self-host admin source')
    assert.equal(entitlement.resolvedTemplate, 'sportsbook', 'self-host admin resolved template')
    assert.equal(entitlement.ownerEmailHash, 'self-host-admin', 'self-host admin sentinel hash')
  })
}

function testSelfHostAdminFlagWithOwnerEmails() {
  withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL, PVTKRRX_ADMIN_EMAILS: '' }, () => {
    const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
    const entitlement = resolveSportsPosterEntitlement({
      user: null,
      requestedTemplate: 'broadcast',
      selfHostAdmin: true
    })
    assert.equal(entitlement.source, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'self-host admin with owner emails stamps owner_override')
    assert.equal(entitlement.resolvedTemplate, 'broadcast', 'self-host admin owner stamp keeps selected template')
    assert.equal(entitlement.ownerEmailHash, ownerHash, 'self-host admin owner stamp carries the real owner-email hash')

    // The whole point of the fix: a runtime with NO self-host mode (the public
    // Coolify host) but the SAME owner email must honour this stamp to all
    // templates, where the old admin_override + self-host-admin sentinel would
    // have downgraded to ticket-stub.
    const verified = verifyStampedSportsPosterEntitlement({
      requestedTemplate: 'broadcast',
      stampedSource: entitlement.source,
      stampedHash: entitlement.ownerEmailHash,
      env: { PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }
    })
    assertEntitlement(verified, {
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES,
      resolvedTemplate: 'broadcast',
      allowed: true
    }, 'self-host owner stamp verifies to all templates on a non-self-host runtime sharing the owner email')
  })
}

async function testSelfHostAdminStampSurvivesRuntimeVerify() {
  await withEnv({ PVTKRRX_SELF_HOST_MODE: 'true', PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, () => {
    const verified = verifyStampedSportsPosterEntitlement({
      requestedTemplate: 'glitch',
      stampedSource: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      stampedHash: 'self-host-admin'
    })
    assert.equal(verified.source, ENTITLEMENT_SOURCE.ADMIN_OVERRIDE, 'self-host admin sentinel survives verify in self-host mode')
    assert.equal(verified.resolvedTemplate, 'glitch', 'self-host admin sentinel preserves template')
  })
  await withEnv({ PVTKRRX_SELF_HOST_MODE: '', PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, () => {
    const verified = verifyStampedSportsPosterEntitlement({
      requestedTemplate: 'glitch',
      stampedSource: ENTITLEMENT_SOURCE.ADMIN_OVERRIDE,
      stampedHash: 'self-host-admin'
    })
    assert.equal(verified.source, ENTITLEMENT_SOURCE.NONE, 'self-host admin sentinel rejected outside self-host mode')
    assert.equal(verified.resolvedTemplate, 'ticket-stub', 'sentinel falls back when not self-host')
  })
}

// ────────────────────────────────────────────────────────────────────────
// 2. normalizeAddonConfig respects options.entitlement and clamps when absent
// ────────────────────────────────────────────────────────────────────────
function testNormalizeWithoutEntitlementClamps() {
  const normalized = normalizeAddonConfig({ sportsPosterTemplate: 'glitch' })
  assert.equal(normalized.sportsPosterTemplate, 'ticket-stub', 'unstamped → ticket-stub')
  assert.equal(normalized.entitlementSource, ENTITLEMENT_SOURCE.NONE, 'unstamped source')
  assert.equal(normalized.entitlementOwnerEmailHash, undefined, 'no owner hash on unstamped')
}

function testNormalizeWithOwnerEntitlementPreserves() {
  const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
  const normalized = normalizeAddonConfig({ sportsPosterTemplate: 'broadcast' }, {
    entitlement: {
      source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
      resolvedTemplate: 'broadcast',
      allowed: true,
      ownerEmailHash: ownerHash
    }
  })
  assert.equal(normalized.sportsPosterTemplate, 'broadcast', 'owner entitlement preserves template')
  assert.equal(normalized.entitlementSource, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'stamped owner source')
  assert.equal(normalized.entitlementOwnerEmailHash, ownerHash, 'stamped owner hash')
}

function testNormalizeRevokesWhenOwnerRemovedFromEnv() {
  const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
  withEnv({ PVTKRRX_OWNER_EMAILS: '' }, () => {
    const normalized = normalizeAddonConfig({
      sportsPosterTemplate: 'broadcast',
      entitlementSource: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      entitlementOwnerEmailHash: ownerHash
    })
    assert.equal(normalized.sportsPosterTemplate, 'ticket-stub', 'revoked owner downgraded')
    assert.equal(normalized.entitlementSource, ENTITLEMENT_SOURCE.NONE, 'revoked source becomes none')
    assert.equal(normalized.entitlementOwnerEmailHash, undefined, 'revoked owner hash dropped')
  })
}

function testNormalizeHonoursOwnerWhenEnvStillContains() {
  const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
  withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, () => {
    const normalized = normalizeAddonConfig({
      sportsPosterTemplate: 'glitch',
      entitlementSource: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      entitlementOwnerEmailHash: ownerHash
    })
    assert.equal(normalized.sportsPosterTemplate, 'glitch', 'env-confirmed owner keeps template')
    assert.equal(normalized.entitlementSource, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'env-confirmed source preserved')
  })
}

// ────────────────────────────────────────────────────────────────────────
// 3. End-to-end save path stamps entitlement and unlocks the URL builder
// ────────────────────────────────────────────────────────────────────────
async function testApplySportsPosterEntitlementForOwnerSave() {
  await withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, async () => {
    const initial = normalizeAddonConfig({ sportsPosterTemplate: 'broadcast' }) // forced to ticket-stub
    const { config: stamped, entitlement } = await applySportsPosterEntitlement(initial, {
      requestedTemplate: 'broadcast',
      user: { email: OWNER_EMAIL, id: 'usr_owner' }
    })
    assert.equal(stamped.sportsPosterTemplate, 'broadcast', 'owner save unlocks broadcast')
    assert.equal(stamped.entitlementSource, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'stamped owner source')
    assert.equal(entitlement.source, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'returned entitlement source')

    const poster = resolveSportsPosterAsset(eventInput(stamped))
    const url = new URL(poster.poster)
    assert.equal(url.searchParams.get('template'), 'broadcast', 'URL builder honours owner-stamped template')
    assert.equal(poster.selectedTemplate, 'broadcast', 'resolveSportsPosterAsset selectedTemplate')
    assert.equal(resolveSportsArtworkLayoutFamily(eventInput(stamped)), 'BROADCAST', 'broadcast layoutFamily')

    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, {
        originalUrl: `${url.pathname}${url.search}`,
        query: Object.fromEntries(url.searchParams.entries())
      }),
      'broadcast',
      'proxy accepts env-verifiable owner stamp'
    )
    // Owner/admin stamps carry an env-verifiable hash, so the proxy re-verifies
    // against the live owner list even if the HMAC signature is stripped. The
    // hash itself is the proof; only a non-env source needs the signature.
    const forgedHash = new URL(poster.poster)
    forgedHash.searchParams.set('entHash', hashEmailForOwnerCheck('attacker@example.com'))
    forgedHash.searchParams.delete('entSig')
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, {
        originalUrl: `${forgedHash.pathname}${forgedHash.search}`,
        query: Object.fromEntries(forgedHash.searchParams.entries())
      }),
      'ticket-stub',
      'proxy rejects owner-style URL with a forged non-env owner hash'
    )
  })
}

async function testApplySportsPosterEntitlementForManualGrantSave() {
  await withEnv({ PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, async () => {
    const initial = normalizeAddonConfig({ sportsPosterTemplate: 'glitch' })
    const { config: stamped, entitlement } = await applySportsPosterEntitlement(initial, {
      requestedTemplate: 'glitch',
      user: {
        email: PAID_USER_EMAIL,
        id: 'usr_paid',
        entitlements: { sportsPosterTemplates: SPORTS_POSTER_TEMPLATES.slice() }
      }
    })
    assert.equal(stamped.sportsPosterTemplate, 'glitch', 'paid manual grant save unlocks glitch')
    assert.equal(stamped.entitlementSource, ENTITLEMENT_SOURCE.MANUAL_GRANT, 'paid save stamps manual grant source')
    assert.equal(entitlement.source, ENTITLEMENT_SOURCE.MANUAL_GRANT, 'returned paid entitlement source')

    const poster = resolveSportsPosterAsset(eventInput(stamped, {
      canonicalId: 'sportsmeta:event:football|2026-04-10|epl|paid-grant',
      title: 'Paid Grant'
    }))
    const url = new URL(poster.poster)
    assert.equal(url.searchParams.get('template'), 'glitch', 'paid URL carries selected template')
    assert.equal(url.searchParams.get('reqTemplate'), 'glitch', 'paid URL forwards requested template')
    assert.equal(url.searchParams.get('entSource'), ENTITLEMENT_SOURCE.MANUAL_GRANT, 'paid URL forwards entitlement source')
    assert.match(url.searchParams.get('entSig') || '', /^[a-f0-9]{64}$/i, 'paid URL carries signed entitlement stamp')
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, {
        originalUrl: `${url.pathname}${url.search}`,
        query: Object.fromEntries(url.searchParams.entries())
      }),
      'glitch',
      'proxy accepts signed paid stamp'
    )
    const forged = new URL(poster.poster)
    forged.searchParams.delete('entSig')
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, {
        originalUrl: `${forged.pathname}${forged.search}`,
        query: Object.fromEntries(forged.searchParams.entries())
      }),
      'ticket-stub',
      'proxy rejects unsigned paid-style URL'
    )
  })
}

async function testApplySportsPosterEntitlementForUnpaidSave() {
  // No env owner/admin entries, no manual grant, no member token, no trial.
  await withEnv({ PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, async () => {
    const initial = normalizeAddonConfig({ sportsPosterTemplate: 'glitch' })
    const { config: stamped, entitlement } = await applySportsPosterEntitlement(initial, {
      requestedTemplate: 'glitch',
      user: { email: UNPAID_USER_EMAIL, id: 'usr_unpaid' }
    })
    assert.equal(stamped.sportsPosterTemplate, 'ticket-stub', 'unpaid save clamped to ticket-stub')
    assert.equal(stamped.entitlementSource, ENTITLEMENT_SOURCE.NONE, 'unpaid source = none')
    assert.equal(entitlement.allowed, false, 'unpaid entitlement.allowed = false')

    const poster = resolveSportsPosterAsset(eventInput(stamped))
    assert.equal(poster.selectedTemplate, 'ticket-stub', 'unpaid asset resolver clamps to ticket-stub')
    assert.equal(new URL(poster.poster).searchParams.get('template'), 'ticket-stub', 'URL builder still ticket-stub for unpaid')
  })
}

async function testForgedPlainTemplateQueryClamped() {
  await withEnv({ PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, async () => {
    for (const template of PAID_TEMPLATES) {
      assert.equal(
        sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template } }),
        'ticket-stub',
        `proxy ignores unsigned plain ?template=${template}`
      )
    }
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template: 'ticket-stub' } }),
      'ticket-stub',
      'proxy keeps ticket-stub for unsigned plain query'
    )
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template: 'not-real' } }),
      'ticket-stub',
      'proxy normalizes invalid plain template query to ticket-stub'
    )
  })
}

async function testServerOverrideDoesNotUnlockFreeArtwork() {
  await withEnv({
    PVTKRRX_OWNER_EMAILS: '',
    PVTKRRX_ADMIN_EMAILS: '',
    PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE: 'broadcast',
    PVTKRRX_SPORTS_POSTER_TEMPLATE: 'broadcast'
  }, async () => {
    const poster = resolveSportsPosterAsset(eventInput({
      sportsPosterTemplate: 'broadcast',
      entitlementSource: '',
      entitlementOwnerEmailHash: ''
    }, { canonicalId: 'sportsmeta:event:football|2026-04-10|epl|free-user', title: 'Free User' }))
    assert.equal(poster.selectedTemplate, 'ticket-stub', 'server override must not unlock free catalog poster')
    assert.equal(new URL(poster.poster).searchParams.get('template'), 'ticket-stub', 'server override must not leak into free poster URL')
    assert.equal(
      sportsArtworkProxyTest.resolveSportsPosterTemplateFromConfig({}, { query: { template: 'broadcast' } }),
      'ticket-stub',
      'proxy ignores unsigned plain premium template query'
    )
  })
}

// ────────────────────────────────────────────────────────────────────────
// 4. Replay protection: forged stamps without env confirmation are rejected
// ────────────────────────────────────────────────────────────────────────
function testForgedOwnerStampWithoutEnvIsRejected() {
  withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, () => {
    const fakeHash = hashEmailForOwnerCheck('attacker@example.com')
    const verified = verifyStampedSportsPosterEntitlement({
      requestedTemplate: 'broadcast',
      stampedSource: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      stampedHash: fakeHash
    })
    assert.equal(verified.source, ENTITLEMENT_SOURCE.NONE, 'forged owner hash rejected')
    assert.equal(verified.resolvedTemplate, 'ticket-stub', 'forged owner falls back')
  })
}

function testRuntimeURLIgnoresStaleQueryAfterRevocation() {
  // Decrypted config no longer trusts stamp; URL builders read from input.
  const poster = resolveSportsPosterAsset(eventInput({
    sportsPosterTemplate: 'broadcast', // attacker tries to set
    entitlementSource: '', // no stamp
    entitlementOwnerEmailHash: ''
  }, { canonicalId: 'sportsmeta:event:football|2026-04-10|epl|stale-test', title: 'Stale Test' }))
  const tplFromUrl = new URL(poster.poster).searchParams.get('template')
  assert.equal(tplFromUrl, 'ticket-stub', 'stale ?template ignored without entitlement stamp')
}

// ────────────────────────────────────────────────────────────────────────
// 5. buildConfigReadback exposes entitlement source + allowed templates
// ────────────────────────────────────────────────────────────────────────
function testReadbackExposesEntitlement() {
  const ownerHash = hashEmailForOwnerCheck(OWNER_EMAIL)
  withEnv({ PVTKRRX_OWNER_EMAILS: OWNER_EMAIL }, () => {
    const persisted = normalizeAddonConfig({
      sportsPosterTemplate: 'glitch',
      entitlementSource: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
      entitlementOwnerEmailHash: ownerHash
    })
    const readback = buildConfigReadback(persisted)
    assert.equal(readback.entitlement.source, ENTITLEMENT_SOURCE.OWNER_OVERRIDE, 'readback source')
    assert.equal(readback.entitlement.allowed, true, 'readback allowed = true')
    assert.equal(readback.sportsPosterTemplate, 'glitch', 'readback resolved template')
    assert.deepEqual(
      [...readback.entitlement.allowedSportsPosterTemplates].sort(),
      [...SPORTS_POSTER_TEMPLATES].sort(),
      'readback exposes all 7 allowed templates for owner'
    )
    assert.equal(readback.entitlementOwnerEmailHash, undefined, 'owner email hash not leaked to readback')
  })
}

function testReadbackForUnpaid() {
  withEnv({ PVTKRRX_OWNER_EMAILS: '', PVTKRRX_ADMIN_EMAILS: '' }, () => {
    const persisted = normalizeAddonConfig({ sportsPosterTemplate: 'glitch' })
    const readback = buildConfigReadback(persisted)
    assert.equal(readback.entitlement.source, ENTITLEMENT_SOURCE.NONE, 'unpaid readback source')
    assert.equal(readback.entitlement.allowed, false, 'unpaid readback allowed = false')
    assert.deepEqual(
      readback.entitlement.allowedSportsPosterTemplates,
      ['ticket-stub'],
      'unpaid readback only allows ticket-stub'
    )
  })
}

// ────────────────────────────────────────────────────────────────────────
// 6. Locked template family contract — must remain 7
// ────────────────────────────────────────────────────────────────────────
function testTemplateContractIntact() {
  assert.equal(SPORTS_POSTER_TEMPLATES.length, 7, 'template contract must remain 7 families')
  for (const t of PAID_TEMPLATES) {
    assert.equal(normalizeSportsPosterTemplate(t), t, `${t} normalizer round-trip`)
  }
}

// ────────────────────────────────────────────────────────────────────────
// 7. clampSportsPosterTemplate enforces allow-list on every call
// ────────────────────────────────────────────────────────────────────────
function testClampHelper() {
  const ownerEntitlement = {
    source: ENTITLEMENT_SOURCE.OWNER_OVERRIDE,
    allowedTemplates: SPORTS_POSTER_TEMPLATES.slice(),
    resolvedTemplate: 'broadcast',
    allowed: true
  }
  const noneEntitlement = {
    source: ENTITLEMENT_SOURCE.NONE,
    allowedTemplates: ['ticket-stub'],
    resolvedTemplate: 'ticket-stub',
    allowed: false
  }
  assert.equal(clampSportsPosterTemplate('broadcast', ownerEntitlement), 'broadcast', 'owner clamp owner-allowed')
  assert.equal(clampSportsPosterTemplate('glitch', ownerEntitlement), 'glitch', 'owner clamp glitch-allowed')
  assert.equal(clampSportsPosterTemplate('broadcast', noneEntitlement), 'ticket-stub', 'no entitlement clamps broadcast')
  assert.equal(clampSportsPosterTemplate('', noneEntitlement), 'ticket-stub', 'no entitlement clamps empty')
}

async function main() {
  testTemplateContractIntact()
  await testOwnerOverrideByEmail()
  await testOwnerOverrideByStremioUserId()
  await testAdminOverride()
  testManualGrantOnAccount()
  testMemberTokenOnConfig()
  testTrialActive()
  testUnpaidUser()
  testSelfHostAdminFlagWithoutOwnerEmails()
  testSelfHostAdminFlagWithOwnerEmails()
  await testSelfHostAdminStampSurvivesRuntimeVerify()
  testNormalizeWithoutEntitlementClamps()
  testNormalizeWithOwnerEntitlementPreserves()
  await testNormalizeRevokesWhenOwnerRemovedFromEnv()
  await testNormalizeHonoursOwnerWhenEnvStillContains()
  await testApplySportsPosterEntitlementForOwnerSave()
  await testApplySportsPosterEntitlementForManualGrantSave()
  await testApplySportsPosterEntitlementForUnpaidSave()
  await testForgedPlainTemplateQueryClamped()
  await testServerOverrideDoesNotUnlockFreeArtwork()
  await testForgedOwnerStampWithoutEnvIsRejected()
  testRuntimeURLIgnoresStaleQueryAfterRevocation()
  await testReadbackExposesEntitlement()
  await testReadbackForUnpaid()
  testClampHelper()

  console.log(
    'Entitlement smoke passed. ' +
    'precedence=owner_override>admin_override>manual_grant>member_token>trial>none ' +
    'sources=owner|admin|manual|token|trial|none ' +
    'normalize=owner-preserve+revoke unpaid=blocked readback=visible plain-template=clamped'
  )
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
