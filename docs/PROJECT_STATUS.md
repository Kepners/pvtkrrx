# PVTKRRX Project Status

Updated: 2026-03-27

## Current Stage

PVTKRRX is at a reset point.

The current code is not blocked because the basic server-side flows are obviously missing. It is blocked because we have spent too much time patching Stremio-specific edge cases without enough real-client proof that the product now behaves correctly on desktop, mobile, TV, and hosted routes.

The practical reading of the project today is:

- core route logic exists for `PC Local`, `LAN Bridge`, and `Remote Seedbox`
- the current branch now passes the full local smoke suite again
- the latest pivot changed root `/manifest.json` into a bootstrap-only manifest and added compatibility resource routes to avoid the latest `EmptyContent` failure mode
- real Stremio client acceptance is still the blocker
- a clean rebuild is now a reasonable next step

## Verified Working Now

These items are actually verified in the current workspace, not just intended:

- `npm run smoke:config` passed on 2026-03-27
- `npm run smoke:guards` passed on 2026-03-27
- `npm run smoke:pipeline` passed on 2026-03-27
- `npm run smoke:lan-pair` passed on 2026-03-27
- `npm run smoke:stremio-link` passed on 2026-03-27
- `npm run smoke:security` passed on 2026-03-27
- `npm run smoke:sports` passed on 2026-03-27
- root `/manifest.json` now returns a bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- root compatibility `/catalog`, `/meta`, and `/stream` routes now resolve safely instead of falling into missing root resource paths
- `PC Local` still resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- hosted token manifests still resolve for configured installs
- LAN pair heartbeat/status/redirect behavior is covered by smoke tests
- Stremio AuthKey link flow is covered by a local mock API smoke test
- hosted/local security hardening remains covered by automated checks
- sports catalog and structured enrichment pipeline remain covered by automated checks
- desktop qBittorrent path lookup now degrades cleanly when qBit preferences are not ready

## Not Solved Yet

These are still the real blockers:

- we still do not have enough real-client proof that the bootstrap-root manifest fix fully solves the latest Stremio `EmptyContent` behavior
- Android TV and Android mobile same-account `LAN Bridge` pickup is still not proven end to end on real devices
- Apple TV synced-addon behavior is still not proven end to end on a real client path
- one real public `Remote Seedbox` ready-file playback path is still not proven
- one auth-protected external file-server playback path is still not proven on real clients
- KV-backed hosted pair persistence across restarts/redeploys is still not proven
- notice-only stream rows still need real-client verification so they do not bury or visually outrank a playable stream
- smoke runs can still log non-fatal startup warm-up noise when live qBittorrent or Prowlarr credentials are missing or invalid

## Why Progress Stalled

The repeated churn has mostly come from a small number of structural problems:

- raw LAN addon URLs kept fighting official Stremio transport rules instead of working with them
- root `/manifest.json` behavior was too close to the configured route manifests, which let Stremio attach to the wrong manifest/resource shape and then fetch paths that did not exist
- hosted relay logic, local runtime logic, and desktop shell logic are still too intertwined, mainly inside `index.js` plus `electron/main.js`
- install wording, route rules, fallback paths, and real-device validation drifted apart during repeated fix attempts

## Recommended Next Move

The current repo should now be treated as:

- a behavior reference
- a smoke-test reference
- a Stremio edge-case notebook
- not the architecture to blindly keep extending

Recommended next step:

1. Stop layering more tactical fixes into the current structure unless a blocker is trivial and isolated.
2. Use [docs/REBUILD_PROMPT.md](docs/REBUILD_PROMPT.md) as the handoff brief for a clean rebuild.
3. Treat these files as the source of truth for the rewrite:
   - [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md)
   - [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md)
   - [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md)
   - [docs/LAN_BRIDGE_PROCESS.md](docs/LAN_BRIDGE_PROCESS.md)
   - [docs/SPEC.md](docs/SPEC.md)
   - [docs/STREMIO_ADDON_REFERENCE.md](docs/STREMIO_ADDON_REFERENCE.md)
4. Treat the current implementation as reference material, not as mandatory structure.

## Release Gate Still Blocked By

Do not call this production-trustworthy until these are proven:

1. `PC Local` installs and plays correctly on the Windows host using the real Stremio desktop client.
2. `LAN Bridge` installs cleanly from the hosted path and browses/plays correctly from a second same-account device on the same LAN.
3. `LAN Bridge` fails clearly when the host desktop heartbeat is offline.
4. Android TV/mobile same-account sync is proven on real clients.
5. Apple TV synced-addon behavior is proven on a real client path.
6. `Remote Seedbox` plays one real public HTTPS ready-file successfully.
7. Hosted pair state survives restart/redeploy with KV enabled.

## Handoff Note

If the next step is a rewrite, start from [docs/REBUILD_PROMPT.md](docs/REBUILD_PROMPT.md), not from the February planning docs and not from assumptions about how Stremio "should" behave.
