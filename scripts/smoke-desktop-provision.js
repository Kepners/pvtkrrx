const assert = require('node:assert/strict')
const { shouldPersistProvisionConfig, isSanitizedProvisionReadback } = require('../electron/provisionPersistence')

const directProvisionResult = {
  config: {
    qbitUrl: 'http://127.0.0.1:8080',
    qbitPassword: '',
    lanPairKey: 'PAIRKEYPAIRKEYPAIRKEYPAIRKEY'
  }
}

const sanitizedReadback = {
  config: {
    qbitUrl: 'http://127.0.0.1:8080',
    lanPairId: 's_pairidpairidpairid12',
    savedSecrets: {
      qbitPassword: true,
      lanPairKey: true
    }
  }
}

assert.equal(isSanitizedProvisionReadback(directProvisionResult.config), false, 'direct provision config must not look sanitized')
assert.equal(shouldPersistProvisionConfig(directProvisionResult), true, 'desktop should persist direct provision results')

assert.equal(isSanitizedProvisionReadback(sanitizedReadback.config), true, 'readback payload should be detected as sanitized')
assert.equal(shouldPersistProvisionConfig(sanitizedReadback), false, 'desktop must not overwrite local config with sanitized readback payloads')

console.log('Smoke desktop provision persistence passed')
