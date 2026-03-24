# PVTKRRX Project Status

Updated: 2026-03-24

## Current Stage

PVTKRRX is at **v1.1.6** — structured sports enrichment and the current security-hardening baseline are implemented and smoke-tested, but the final live-device/runtime acceptance pass is still pending.

- Core addon flow (catalog, stream, playback, local config, encryption, desktop wrapper) is complete and shipping.
- Current route model is `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- `PC Local` is a real same-PC addon via `http://127.0.0.1:7000/local/manifest.json?mode=local`.
- LAN pair relay flow for Android TV/mobile account-sync is implemented and covered by smoke checks.
- Stremio AuthKey linking flow is implemented and smoke-tested with a local API mock.
- The live architecture is documented in `docs/CURRENT_DESIGN.md` and `docs/ROUTE_FRAMEWORK.md`.
- Implementation currently looks aligned with the live `PC Local` / `LAN Bridge` / `Remote Seedbox` design, but hosted auth/public playback behavior still needs proof on real clients and a real hosted deployment.
- Status shorthand: implementation hardened, wording aligned, smoke locked, awaiting real client verification.
- That remaining client pass matters because sports is a custom top-level Stremio type, sports/library items use internal `pvtkrrx:` ids, and PVTKRRX must own how those rows render on real Stremio clients instead of assuming Cinemeta or generic client behavior will smooth it over.

## Status Summary

### PASS

- Route-model parity matches the live three-route canon: `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- Architecture/docs/code wiring currently align with `docs/CURRENT_DESIGN.md`, `docs/ROUTE_FRAMEWORK.md`, and `docs/STREMIO_INSTALL_TRACKER.md`.
- `PC Local` remains the supported same-host route via `http://127.0.0.1:7000/local/manifest.json?mode=local`.
- Current automated verification is green: `smoke:config`, `smoke:guards`, `smoke:pipeline`, `smoke:lan-pair`, `smoke:stremio-link`, `smoke:security`, and `smoke:sports` all passed locally on 2026-03-24.
- A Windows-host runtime probe also passed on 2026-03-24: `npm start` bound `http://127.0.0.1:7000` and `https://127.0.0.1:7001`, `/network-info` advertised the expected `127.0.0.1`, `pvtkrrx.local`, and `192.168.50.48` endpoints, and both HTTP + HTTPS local manifests responded on the Windows host.

### PARTIAL

- End-device acceptance is not yet fully proven.
- Pending live validation still includes Android TV/mobile Method 4 pickup, Apple TV same-account sync, one real public `Remote Seedbox` ready-file playback path, one auth-protected external file-server playback path, and KV-backed hosted pair-state persistence across restarts/redeploys.
- Hosted `LAN Bridge` production reliability still depends on live heartbeat plus KV-backed pair state.
- Real-client rendering of notice-only stream rows still needs proof so info rows do not bury playable streams or mislead users on different Stremio clients.
- Non-Windows `./.runtime` fallback remains a minor dev-path consistency risk.

### FAIL

- No current route-model regression is detected in docs, code wiring, or smoke coverage.
- Raw `192.168.x.x:7000` addon install remains unsupported by Stremio protocol policy; this is an expected platform constraint, not a regression.

## What Is Implemented

1. Local + hosted install modes with stable local config.
2. Three explicit install routes:
   - `PC Local` for the host Windows machine
   - `LAN Bridge` for same-account home-device sync
   - `Remote Seedbox` for public HTTPS playback
3. Built-in file serving + progressive playback buffering.
4. Sports catalog and structured artwork enrichment.
   - `src/clients/sportsdb.js` — SportsDB structured event lookup with persistent disk cache, in-flight deduplication, rate-limit back-off, league and team asset caching, and team name aliases (e.g. `Spurs → Tottenham Hotspur`).
   - `src/utils/sportsTitleParser.js` — Parse torrent titles into structured `{ homeTeam, awayTeam, date, league }` objects for reliable event matching.
   - `src/utils/leagueMap.js` — Normalize league codes (e.g. `epl → English Premier League`) for catalog display and API lookup.
   - `src/handlers/catalog.js`, `src/handlers/stream.js`, `src/handlers/meta.js` — All three handlers updated to consume structured sports data.
   - `scripts/smoke-sports-structured.js` — Order-agnostic event dedup smoke test (`npm run smoke:sports`).
5. Electron desktop packaging (`dist/` current release artifacts + `dist/releases/<version>/` archives).
6. LAN pair relay plumbing:
   - `POST /pair/heartbeat`
   - `POST /pair/status`
   - hosted route redirect to active LAN endpoint when pair is online
   - desktop background heartbeat loop + Stremio launch pulse
   - configure UI Method 4 hosted LAN-pair install URL generation
7. LAN pair privacy hardening:
   - `/pair/status` now requires both `pairId` and `pairKey`
   - status responses expose only the selected LAN endpoint metadata, and only to callers that prove `pairId` + `pairKey`
   - hosted fallback responses avoid exposing resolver reason details
   - heartbeat/status endpoints are rate limited
   - optional public-IP binding can block pair reuse from other networks when enabled (`PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP=true`)
   - heartbeat host-lock can reject active-session takeover from a different source IP (`PVTKRRX_LAN_PAIR_LOCK_HOST=true`)
   - sensitive routes (`/encrypt`, `/pair/*`, `/test-connection`, auth, billing) use strict browser-origin allowlists
   - hosted `/test-connection` is rate limited and refuses loopback/LAN/.local targets; local/loopback configure can still validate local endpoints
   - local admin routes (`/local-config`, `/auto-provision`, `/network-info`, local qBit control) are local-network/loopback guarded
   - hosted `/file` and `/playback` fail fast instead of waiting for local-only playback paths
8. Additional security hardening:
   - browser-driven helper POST routes enforce CSRF tokens in addition to origin checks
   - config readback and server-side logging redact stored secrets, private URLs, local file paths, and auth identifiers
   - legacy plain base64 playback/file tokens are rejected in favor of opaque encrypted state
   - secure JSON storage reads legacy plaintext for migration only, writes encrypted state, and fails closed if no at-rest secret is configured
9. Configure/install wording now matches the live hosted route contract:
   - hosted `Remote Seedbox` is explicitly not presented as a generic tracker-buffering path on the hosted site
   - hosted remote copy now states it is effectively ready-file / public-playback only unless the runtime can truly serve playback
   - auth-protected external file-server playback is flagged as needing real-device validation

## Latest Automated Verification (2026-03-24)

1. `npm run smoke:config` - PASS
2. `npm run smoke:guards` - PASS
3. `npm run smoke:pipeline` - PASS
4. `npm run smoke:lan-pair` - PASS
5. `npm run smoke:stremio-link` - PASS
6. `npm run smoke:security` - PASS
7. `npm run smoke:sports` - PASS (structured event dedup, order-agnostic)

These checks validate the current `PC Local` install/profile routes, configure/encrypt/install behavior, hosted runtime guard behavior, route-capability stream suppression, `/test-connection` hardening, LAN pair heartbeat/status + hosted redirect behavior, Stremio AuthKey account-link flow, the security-hardening regression set, and the structured sports enrichment pipeline.

They do not replace the remaining real-device acceptance proof for Android TV/mobile/desktop playback behavior, public remote seedbox playback, auth-protected external file-server playback, or KV-backed LAN-pair behavior on an actual hosted deployment.

Note: the `/auth/me` billing-field part of `smoke:security` is currently checked against the public user model shape rather than a full authenticated end-to-end response.

## Latest Host Runtime Probe (2026-03-24)

1. Windows-host `npm start` - PASS
2. `GET http://127.0.0.1:7000/network-info` on the Windows host - PASS
3. `GET http://127.0.0.1:7000/local/manifest.json?mode=local` on the Windows host - PASS
4. `GET https://127.0.0.1:7001/local/manifest.json?mode=local` on the Windows host - PASS

Operational note:

- Use the Windows runtime or Electron app for real `PC Local` / `LAN Bridge` acceptance. A WSL-started Node process is fine for code-level smoke work, but it can advertise the WSL bridge IP instead of the real Windows LAN IP, which makes it a poor source of truth for LAN-pair validation.

## Required Hosted Configuration For LAN Pair Relay

Use these on the hosted deployment:

1. `ENCRYPTION_SECRET` (existing required secret).
2. `KV_REST_API_URL` and `KV_REST_API_TOKEN` (recommended) to persist pair heartbeat state across serverless invocations.
3. Optional: `PVTKRRX_PAIR_RELAY_URL` (defaults to `https://www.pvtkrrx.cc`).
4. Optional: `PVTKRRX_LAN_PAIR_TTL_SECONDS` (default `21600`, minimum enforced `300`).
5. Optional security tuning:
   - `PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP` (default `false`)
   - `PVTKRRX_LAN_PAIR_LOCK_HOST` (default `true`)
   - `PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS` (default `60000`)
   - `PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW` (default `30`)
   - `PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW` (default `60`)
   - `PVTKRRX_ENCRYPT_MAX_PER_WINDOW` (default `30`)
   - `PVTKRRX_TEST_CONNECTION_MAX_PER_WINDOW` (default `20`)
   - `PVTKRRX_ALLOWED_WEB_ORIGINS` (browser allowlist, defaults to hosted production origin)

Without KV, pair state falls back to in-memory state and may reset on restarts or redeploys.

## Release Candidate Gate

Call this release-candidate ready only if all seven live checks pass:

1. `PC Local` installs and plays on the host PC.
2. `LAN Bridge` redirects live for both catalog browse and actual stream open while heartbeat is up.
3. `LAN Bridge` fails gracefully for both browse and stream open when heartbeat is down.
4. Android TV/mobile pick up the installed addon on the same account.
5. Apple TV syncs after desktop/web install.
6. `Remote Seedbox` plays one real public HTTPS ready-file.
7. Hosted pair state survives restarts/redeploys with KV enabled.

## Still Blocking Full Production Pass

- Android TV/mobile Method 4 same-account sync is not yet proven on real clients.
- Apple TV synced-addon behavior is not yet proven reliable on a live client path.
- Hosted `Remote Seedbox` playback is not yet proven with a real public ready-file.
- Auth-protected external file-server playback still needs a real-client validation pass, ideally on a client path that may drop headers.
- KV-backed hosted pair-state persistence is not yet proven across restarts/redeploys.
- Notice-only stream rows still need real-client validation:
  - `[INFO] Ready Files Only`
  - `[INFO] Direct Buffer Hidden`
  - `[INFO] Buffer URL Not Ready`
  - confirm they do not truncate, duplicate, or bury a genuinely playable stream beside them.

Record the exact pass/fail results here once the live acceptance sweep is complete.
