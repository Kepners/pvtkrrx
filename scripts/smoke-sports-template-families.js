#!/usr/bin/env node
// Locks the runtime poster template contract: exactly 7 families, in the
// order documented in CLAUDE.md "Sports Posters Template Source". The 8th
// `08-team-vs-team` is a backdrop generator under backdrops/python-backdrops/,
// not a runtime poster template — adding/removing/renaming runtime templates
// is a breaking contract change and should be visible at smoke-test time.

const assert = require('node:assert/strict')

const { SPORTS_POSTER_TEMPLATES } = require('../src/utils/sportsPosterTemplates')

const EXPECTED = Object.freeze([
  'editorial',
  'broadcast',
  'sportsbook',
  'trading-card',
  'brutalist',
  'ticket-stub',
  'glitch'
])

assert.ok(Array.isArray(SPORTS_POSTER_TEMPLATES) || (SPORTS_POSTER_TEMPLATES && typeof SPORTS_POSTER_TEMPLATES[Symbol.iterator] === 'function'),
  'SPORTS_POSTER_TEMPLATES must be an iterable export')

const actual = [...SPORTS_POSTER_TEMPLATES]

assert.equal(
  actual.length,
  EXPECTED.length,
  `Expected exactly ${EXPECTED.length} runtime poster template families, got ${actual.length}: ${actual.join(',')}`
)

assert.deepEqual(
  actual,
  [...EXPECTED],
  `Runtime poster template family list drifted from the frozen contract. expected=${EXPECTED.join(',')} actual=${actual.join(',')}`
)

assert.ok(Object.isFrozen(SPORTS_POSTER_TEMPLATES),
  'SPORTS_POSTER_TEMPLATES must be Object.freeze()d so the contract cannot mutate at runtime')

console.log(`Sports poster template families smoke passed. count=${actual.length} families=${actual.join(',')}`)
