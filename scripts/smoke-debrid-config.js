'use strict'

const assert = require('node:assert/strict')

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'debrid-config-smoke-secret-12345678901234567890'
process.env.PVTKRRX_RUNTIME_DIR = process.env.PVTKRRX_RUNTIME_DIR ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'pvtkrrx-debrid-cfg-'))

const shared = require('../src/lib/shared')
const { encrypt, decrypt } = require('../src/utils/crypto')

let checks = 0
function check(label, fn) {
  fn()
  checks++
  console.log(`  PASS ${label}`)
}

console.log('[smoke-debrid-config] start')

check('empty config gets default debrid + cacheSearch blocks', () => {
  const norm = shared.normalizeAddonConfig({})
  assert.deepEqual(norm.debrid, {
    providers: [],
    preferOrder: ['rd', 'ad', 'pm'],
    preferDebridOverSeedbox: true
  })
  assert.deepEqual(norm.cacheSearch, {
    sources: [],
    preferOrder: ['putio', 'pm']
  })
})

check('unknown provider type is filtered out', () => {
  const norm = shared.normalizeDebridConfig({
    providers: [
      { type: 'rd', apiKey: 'rdkey', enabled: true },
      { type: 'bogus', apiKey: 'x', enabled: true },
      { type: 'PM', apiKey: 'pmkey', enabled: false }  // case-insensitive
    ]
  })
  assert.equal(norm.providers.length, 2)
  assert.equal(norm.providers[0].type, 'rd')
  assert.equal(norm.providers[1].type, 'pm')
})

check('duplicate provider types collapse to first occurrence', () => {
  const norm = shared.normalizeDebridConfig({
    providers: [
      { type: 'rd', apiKey: 'first', enabled: true },
      { type: 'rd', apiKey: 'second', enabled: false }
    ]
  })
  assert.equal(norm.providers.length, 1)
  assert.equal(norm.providers[0].apiKey, 'first')
})

check('preferOrder defaults are appended when not specified', () => {
  const norm = shared.normalizeDebridConfig({ preferOrder: ['pm'] })
  assert.deepEqual(norm.preferOrder, ['pm', 'rd', 'ad'])
})

check('preferDebridOverSeedbox defaults to true', () => {
  const norm = shared.normalizeDebridConfig({})
  assert.equal(norm.preferDebridOverSeedbox, true)
})

check('preferDebridOverSeedbox can be explicitly false', () => {
  const norm = shared.normalizeDebridConfig({ preferDebridOverSeedbox: false })
  assert.equal(norm.preferDebridOverSeedbox, false)
})

check('cacheSearch normalizes putio + pm only', () => {
  const norm = shared.normalizeCacheSearchConfig({
    sources: [
      { type: 'putio', apiKey: 'pio', enabled: true },
      { type: 'rd', apiKey: 'no', enabled: true },  // not a search source
      { type: 'pm', apiKey: 'pm', enabled: false }
    ]
  })
  assert.equal(norm.sources.length, 2)
  assert.equal(norm.sources[0].type, 'putio')
  assert.equal(norm.sources[1].type, 'pm')
})

check('redactDebridApiKeys strips apiKeys but preserves enabled + types', () => {
  const redacted = shared.redactDebridApiKeys({
    providers: [
      { type: 'rd', apiKey: 'should-not-leak', enabled: true },
      { type: 'pm', apiKey: 'also-not-leak', enabled: false }
    ]
  })
  assert.equal(redacted.providers[0].apiKey, undefined)
  assert.equal(redacted.providers[0].enabled, true)
  assert.equal(redacted.providers[1].enabled, false)
})

check('redactCacheSearchApiKeys strips apiKeys', () => {
  const redacted = shared.redactCacheSearchApiKeys({
    sources: [{ type: 'putio', apiKey: 'should-not-leak', enabled: true }]
  })
  assert.equal(redacted.sources[0].apiKey, undefined)
  assert.equal(redacted.sources[0].enabled, true)
})

check('savedDebridProviderFlags reflects which providers have apiKeys saved', () => {
  const flags = shared.savedDebridProviderFlags({
    providers: [
      { type: 'rd', apiKey: 'rdkey', enabled: true },
      { type: 'ad', apiKey: '', enabled: false },
      { type: 'pm', apiKey: 'pmkey', enabled: true }
    ]
  })
  assert.deepEqual(flags, { rd: true, ad: false, pm: true })
})

check('savedCacheSearchSourceFlags reflects which sources have apiKeys saved', () => {
  const flags = shared.savedCacheSearchSourceFlags({
    sources: [{ type: 'putio', apiKey: 'tok', enabled: true }]
  })
  assert.deepEqual(flags, { putio: true, pm: false })
})

check('buildConfigReadback redacts nested apiKeys and surfaces savedSecrets.debrid', () => {
  const readback = shared.buildConfigReadback({
    jackettApiKey: 'jkey',
    qbitUsername: 'admin',
    debrid: {
      providers: [{ type: 'rd', apiKey: 'rdkey', enabled: true }]
    },
    cacheSearch: {
      sources: [{ type: 'putio', apiKey: 'piotok', enabled: true }]
    }
  })
  assert.equal(readback.jackettApiKey, undefined, 'flat secret redacted')
  assert.equal(readback.savedSecrets.jackettApiKey, true, 'flat saved flag set')
  assert.equal(readback.savedSecrets.debrid.rd, true)
  assert.equal(readback.savedSecrets.debrid.ad, false)
  assert.equal(readback.savedSecrets.cacheSearch.putio, true)
  assert.equal(readback.debrid.providers[0].apiKey, undefined, 'nested debrid apiKey redacted')
  assert.equal(readback.debrid.providers[0].type, 'rd', 'nested debrid type preserved')
  assert.equal(readback.cacheSearch.sources[0].apiKey, undefined, 'nested cacheSearch apiKey redacted')
})

check('mergeRetainedSecrets preserves nested debrid apiKeys when flagged', () => {
  const existing = {
    debrid: { providers: [{ type: 'rd', apiKey: 'OLD-rd-key', enabled: true }] },
    cacheSearch: { sources: [{ type: 'putio', apiKey: 'OLD-pio-key', enabled: true }] }
  }
  const incoming = {
    debrid: { providers: [{ type: 'rd', apiKey: '', enabled: true }] },
    cacheSearch: { sources: [{ type: 'putio', apiKey: '', enabled: true }] },
    retainSecretFields: {
      debrid: { rd: true },
      cacheSearch: { putio: true }
    }
  }
  const merged = shared.mergeRetainedSecrets(incoming, existing)
  assert.equal(merged.debrid.providers[0].apiKey, 'OLD-rd-key')
  assert.equal(merged.cacheSearch.sources[0].apiKey, 'OLD-pio-key')
})

check('mergeRetainedSecrets does NOT preserve when retain flag absent', () => {
  const existing = {
    debrid: { providers: [{ type: 'rd', apiKey: 'OLD-rd-key', enabled: true }] }
  }
  const incoming = {
    debrid: { providers: [{ type: 'rd', apiKey: '', enabled: true }] }
  }
  const merged = shared.mergeRetainedSecrets(incoming, existing)
  assert.equal(merged.debrid.providers[0].apiKey, '', 'apiKey stays blank without retain flag')
})

check('v1.2 config without debrid block deserializes cleanly to defaults', () => {
  const legacy = {
    jackettUrl: 'http://127.0.0.1:9696',
    jackettApiKey: 'k',
    qbitUrl: 'http://127.0.0.1:8080',
    qbitUsername: 'admin',
    qbitPassword: 'p'
  }
  const norm = shared.normalizeAddonConfig(legacy)
  assert.deepEqual(norm.debrid.providers, [])
  assert.deepEqual(norm.cacheSearch.sources, [])
  assert.equal(norm.debrid.preferDebridOverSeedbox, true)
  assert.equal(norm.jackettUrl, 'http://127.0.0.1:9696')
  assert.equal(norm.jackettApiKey, 'k')
})

check('encrypt/decrypt round-trip preserves debrid + cacheSearch apiKeys', () => {
  const original = shared.normalizeAddonConfig({
    jackettUrl: 'http://127.0.0.1:9696',
    jackettApiKey: 'jkey',
    qbitUrl: 'http://127.0.0.1:8080',
    qbitUsername: 'admin',
    qbitPassword: 'pw',
    debrid: {
      providers: [
        { type: 'rd', apiKey: 'rd-real-key-xyz', enabled: true },
        { type: 'pm', apiKey: 'pm-real-key-xyz', enabled: false }
      ],
      preferOrder: ['pm', 'rd', 'ad'],
      preferDebridOverSeedbox: false
    },
    cacheSearch: {
      sources: [{ type: 'putio', apiKey: 'pio-real-tok', enabled: true }]
    }
  })
  const token = encrypt(original, process.env.ENCRYPTION_SECRET)
  const decoded = shared.normalizeAddonConfig(decrypt(token, process.env.ENCRYPTION_SECRET))
  assert.equal(decoded.debrid.providers[0].apiKey, 'rd-real-key-xyz')
  assert.equal(decoded.debrid.providers[1].apiKey, 'pm-real-key-xyz')
  assert.equal(decoded.debrid.preferDebridOverSeedbox, false)
  assert.deepEqual(decoded.debrid.preferOrder, ['pm', 'rd', 'ad'])
  assert.equal(decoded.cacheSearch.sources[0].apiKey, 'pio-real-tok')
  assert.equal(decoded.jackettApiKey, 'jkey', 'flat secrets still round-trip')
})

check('Stremio-bound config token (no debrid) decrypts to defaults — v1.2 → v1.3 forward compat', () => {
  const legacyToken = encrypt({
    jackettUrl: 'http://127.0.0.1:9696',
    jackettApiKey: 'k',
    qbitUrl: 'http://127.0.0.1:8080',
    qbitUsername: 'a',
    qbitPassword: 'p'
  }, process.env.ENCRYPTION_SECRET)
  const decoded = shared.normalizeAddonConfig(decrypt(legacyToken, process.env.ENCRYPTION_SECRET))
  assert.equal(decoded.debrid.providers.length, 0)
  assert.equal(decoded.cacheSearch.sources.length, 0)
  assert.equal(decoded.jackettApiKey, 'k', 'legacy v1.2 token still works')
})

console.log(`[smoke-debrid-config] PASS (${checks} checks)`)
process.exit(0)
