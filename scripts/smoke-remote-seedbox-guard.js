const assert = require('node:assert/strict')

// Prove the Remote Seedbox hosted-relay guard in getConfigIssues:
//   * routeProfile='online' + private host URL + not self-host → reject
//   * routeProfile='online' + public host URL + not self-host → accept
//   * routeProfile='online' + private host URL + self-host disk config → accept
//   * routeProfile='hybrid' + private host URL + not self-host → accept (LAN Bridge)
//
// These cases protect against the stale-local-URL leak where a PC Local
// auto-provisioned http://127.0.0.1:xxxx URL would otherwise ride through
// the hosted relay /encrypt path unchallenged.

process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'smoke-remote-seedbox-secret-abcdefghijklmnopqr'

const { getConfigIssues } = require('../src/lib/shared')

function firstIssueCode(config, options = {}) {
  const issues = getConfigIssues(config, options)
  return issues.length ? String(issues[0].code || '') : ''
}

function run() {
  const base = {
    provider: 'custom',
    maxResults: 50,
    autoDeleteWatched: true,
    watchedDeleteGraceSeconds: 300,
    fileServerUrl: 'https://files.example.com'
  }

  // CASE A — clean Remote Seedbox with public URLs: should pass.
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'online',
      lanPairEnabled: false,
      jackettUrl: 'https://prowlarr.example.com',
      qbitUrl: 'https://qbit.example.com'
    }, { requestBaseUrl: 'https://www.pvtkrrx.cc' }),
    '',
    'CASE A: public Remote Seedbox config should produce no issues'
  )

  // CASE B — stale local provisioning leaked into Remote Seedbox payload.
  // Must be rejected by the hosted-relay guard.
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'online',
      lanPairEnabled: false,
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'https://www.pvtkrrx.cc' }),
    'REMOTE_SEEDBOX_REQUIRES_PUBLIC_URL',
    'CASE B: loopback Remote Seedbox payload must be rejected on the hosted relay path'
  )

  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'online',
      lanPairEnabled: false,
      jackettUrl: 'https://prowlarr.example.com',
      qbitUrl: 'http://192.168.1.50:8080'
    }, { requestBaseUrl: 'https://www.pvtkrrx.cc' }),
    'REMOTE_SEEDBOX_REQUIRES_PUBLIC_URL',
    'CASE B: private LAN host on Remote Seedbox must also be rejected'
  )

  // CASE C — self-host same-box: localhost URLs are legitimate because the
  // /server-config path gates behind the admin token. selfHostDiskConfig=true
  // signals that context and should suppress the guard.
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'online',
      lanPairEnabled: false,
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'https://pvtkrrx.example.com', selfHostDiskConfig: true }),
    '',
    'CASE C: self-host same-box config with localhost must not trip the hosted-relay guard'
  )

  // CASE D — LAN Bridge (hybrid) over the hosted relay: loopback is correct
  // because the Windows host serves the backend itself via a 307 redirect,
  // not through the public relay.
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'hybrid',
      lanPairEnabled: true,
      lanPairRequired: false,
      lanPairId: 's_0123456789abcdef01234567',
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'https://www.pvtkrrx.cc' }),
    '',
    'CASE D: LAN Bridge hybrid profile with loopback URLs must be accepted'
  )

  // CASE E — PC Local disk config read through withConfig should not trip the
  // guard even though it is loopback (PC Local is not a Remote Seedbox route).
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'local',
      lanPairEnabled: true,
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'http://127.0.0.1:7000', localDiskConfig: true }),
    '',
    'CASE E: PC Local disk config with loopback URLs must be accepted'
  )

  // CASE F — loopback-origin request (smoke tests, self-install on the same
  // PC) must not fire the guard even with a loopback backend URL, because
  // /encrypt in that context is not arriving at the public hosted relay.
  assert.equal(
    firstIssueCode({
      ...base,
      routeProfile: 'online',
      lanPairEnabled: false,
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'http://127.0.0.1:7000' }),
    '',
    'CASE F: loopback-origin request must not trigger the public-relay guard'
  )

  // CASE G — implicit Remote Seedbox (no explicit routeProfile, no explicit
  // lanPairEnabled=false) must not trigger the guard. This protects legacy
  // ambiguous configs and test sampleConfig shapes.
  assert.equal(
    firstIssueCode({
      ...base,
      jackettUrl: 'http://127.0.0.1:9696',
      qbitUrl: 'http://127.0.0.1:8080'
    }, { requestBaseUrl: 'https://www.pvtkrrx.cc' }),
    '',
    'CASE G: implicit/legacy config without explicit Remote Seedbox intent must not trigger the guard'
  )

  console.log('remote-seedbox-guard: OK (7 cases pass)')
}

try {
  run()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
