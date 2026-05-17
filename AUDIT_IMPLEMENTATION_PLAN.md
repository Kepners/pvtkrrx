# PVTKRRX Audit Implementation Plan

Date: 2026-05-17
Source audit: `AUDIT.md`
Mode: surgical fixes only; read call sites before changing them.

## Ground Rules

- Do not rewrite working systems while fixing audit findings.
- Before editing a file, read the exact inbound/outbound flow for the affected code.
- Keep each implementation phase independently testable.
- Prefer additive guards, bounded caches, and focused correctness fixes before refactors.
- Separate local proof from live/deployed proof.
- Treat live/source version drift as resolved as of the 2026-05-17 follow-up verification: public live reports `1.1.74`.

## Phase 1 - Runtime Safety And Cache Caps

Status: completed locally

Scope:
- Add controlled process/Express error handling.
- Add stream error listeners to file playback reads.
- Add graceful shutdown for HTTP/HTTPS servers.
- Add bounded eviction to the two unbounded non-buffer caches called out by the audit.

Files expected:
- `index.js`
- `src/handlers/catalog.js`
- `src/handlers/stream.js`

Acceptance proof:
- `node --check index.js`
- `node --check src/handlers/catalog.js`
- `node --check src/handlers/stream.js`
- `npm run smoke:security`
- `npm run smoke:playback`
- `npm run smoke:guards`

## Phase 2 - Narrow Correctness Fixes

Status: completed locally

Scope:
- Restore broad sports catalog fallback by disabling category filtering on the second Prowlarr call.
- Include normalized fallback event identity in the sports artwork canonical memo key.
- Resolve UFC generator proof drift so UFC/MMA cards are not generated as competitor-vs-competitor layouts.

Files expected:
- `src/handlers/catalog.js`
- `src/handlers/sportsArtworkProxy.js`
- `backdrops/python-backdrops/09-competitor-vs-competitor/generate.py`

Acceptance proof:
- `npm run smoke:sports-resolution`
- `npm run smoke:sports-artwork`
- `npm run smoke:free-tier-artwork`

## Phase 3 - Hosted Security Footguns

Status: in progress

Scope:
- Prevent hosted deployments from using the local development encryption secret.
- Harden `/encrypt` only after tracing the setup/config flow that depends on it.
- Create or reconcile the missing `LICENSE` file only after confirming the intended source-available terms.

Files expected:
- `Dockerfile`
- `src/lib/shared.js`
- `index.js`
- relevant config-flow smoke scripts if coverage is missing
- `LICENSE`

Acceptance proof:
- `npm run smoke:config`
- `npm run smoke:security`
- manual proof that setup install flow still mints valid config tokens

## Phase 4 - Route Hardening

Status: pending

Scope:
- Prove current Express v5 tokenized route behavior with IDs containing dots and encoded delimiters.
- Add route constraints or route ordering changes only after proof.

Files expected:
- `index.js`
- route smoke scripts

Acceptance proof:
- `npm run smoke:config`
- `npm run smoke:stremio-link`
- `npm run smoke:pipeline`

## Phase 5 - Sports Artwork Load Reduction

Status: pending

Scope:
- Reduce unconditional SportsMeta inspect fan-out.
- Add request-level memoization for repeated classification/normalization.
- Make disk/Postgres artwork cache trimming thresholded or periodic.

Files expected:
- `src/handlers/sportsArtworkProxy.js`
- `src/utils/sportsArtworkDiskCache.js`

Acceptance proof:
- `npm run smoke:sports-artwork`
- `npm run smoke:sports-broadcast`
- `npm run smoke:sports-competitor-vs-competitor`
- `npm run smoke:free-tier-artwork`

## Phase 6 - Structural Refactor

Status: pending

Scope:
- Extract playback route handling from `index.js` after safety and correctness fixes are proven.
- Extract torrent playback state helpers from `src/lib/shared.js` behind compatible exports.

Files expected:
- `index.js`
- `src/lib/shared.js`
- new `src/handlers/playback.js` or smaller helper modules

Acceptance proof:
- full local smoke suite for config, playback, stream, sports, security, guards.

## Progress Log

- 2026-05-17: Plan created. Phase 1 started.
- 2026-05-17: Follow-up audit reconciliation added: live version drift resolved; missing `LICENSE` and UFC generator drift added to tracked scope.
- 2026-05-17: Phase 1 local work completed: controlled runtime shutdown/error handling, read-stream error listeners, Express terminal error middleware, `cinemetaCache` cap, and `trackerLinkInspectionCache` cap.
- 2026-05-17: Phase 2 local work completed: broad sports catalog fallback restored, SportsMeta default-artwork memo key includes fallback identity, UFC default proof removed from competitor-vs-competitor generator, and parser metadata now preserves ancillary fixture teams while UFC fighter pairs stay in the solo `combat_event` title instead of team-side fields.
- 2026-05-17: Phase 3 started: Docker now sets `NODE_ENV=production`; hosted relay mode can no longer activate the local development encryption fallback in `shared.js` or `secureJsonFile.js`. `/encrypt` hardening and `LICENSE` terms remain pending.

## Local Proof Log

- PASS: `node --check index.js`
- PASS: `node --check src/handlers/catalog.js`
- PASS: `node --check src/handlers/stream.js`
- PASS: `node --check src/handlers/sportsArtworkProxy.js`
- PASS: `node --check src/lib/shared.js`
- PASS: `node --check src/utils/secureJsonFile.js`
- PASS: `node --check src/utils/sportsTorrentProfile.js`
- PASS: `node --check scripts/smoke-sports-resolution.js`
- PASS: `node --check scripts/smoke-sports-competitor-vs-competitor.js`
- PASS: `python -m py_compile backdrops/python-backdrops/09-competitor-vs-competitor/generate.py`
- PASS: `npm run smoke:security`
- PASS: `npm run smoke:playback`
- PASS: `npm run smoke:guards`
- PASS: `npm run smoke:config`
- PASS: `npm run smoke:sports-resolution`
- PASS: `npm run smoke:sports-artwork`
- PASS: `npm run smoke:free-tier-artwork`
- PASS: `npm run smoke:sports-competitor-vs-competitor`
- PASS: `npm run smoke:sports-poster-adapter`
- PASS: `npm run smoke:sports-poster-classifier`
- PASS: local invalid JSON probe against `POST /encrypt` returned `400 application/json` with `{"error":"Invalid JSON body"}`.
