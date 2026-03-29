# PVTKRRX Project Status

Updated: 2026-03-29

## Current Stage

PVTKRRX is in a working `1.1.15` state on the main Windows/local route set.

The practical reading of the project today is:

- `PC Local` is the real host-desktop route and is working
- `LAN Bridge` is the same-account home-device route and the host desktop should not use it for local browsing
- completed-file playback on the local runtime is working again after the `/playback` and `/file` path fixes
- the sports catalog artwork path now prefers landscape art for tiles when available
- the Windows installer/build flow is reproducible again
- the remaining work is real-device coverage and performance tuning, not a reset/rebuild

## Verified Working Now

These items are verified in the current workspace or by direct client/log proof:

- `npm run smoke:config` passed on 2026-03-29
- `npm run smoke:desktop` passed on 2026-03-29 and now guards the desktop auto-provision persistence path against writing redacted config readbacks back to disk
- `npm run smoke:playback` passed on 2026-03-29 and now covers redirect plus byte-serving on the shared `/file` route
- `npm run smoke:pipeline` passed on 2026-03-29
- `npm run smoke:sports` passed on 2026-03-29
- `npm run dist:win` passed on 2026-03-29
- root `/manifest.json` returns the bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- `PC Local` resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- same-host `LAN Bridge` `Failed to fetch` was traced to route choice on 2026-03-28, not to server failure
- completed-file playback error `isCompletedTorrent is not defined` was fixed in the local playback path
- the desktop splash now appears on every cold boot and stays frontmost until the main shell is ready
- host-side `LAN Bridge` status now checks the hosted relay directly, and the desktop can repair a stale local pair identity after an `invalid pair key` rejection
- sports catalog tiles now prefer landscape artwork when TheSportsDB provides it
- `1.1.15` installers were built successfully into `dist/`

## What We Fixed On 2026-03-28 And 2026-03-29

1. Host-desktop `LAN Bridge` browsing:
   - Root cause: the host Windows PC was using the hosted `LAN Bridge` route instead of `PC Local`.
   - Fix: keep `LAN Bridge` for the other home devices and use `PC Local` on the host desktop.
2. Playback error on a fully downloaded file:
   - Root cause: first `/playback` crashed with `isCompletedTorrent is not defined`, and after that was fixed the redirected `/file` route still crashed because `fs` was not imported in `index.js`.
   - Fix: restored the completion-state helper, re-imported `fs` for the built-in file server, and re-covered the route with a smoke test that follows playback redirect all the way into served bytes.
3. Windows installer build failure:
   - Root cause: `electron-builder`/`rcedit` was failing when writing EXE metadata directly inside the OneDrive-backed repo output folder.
   - Fix: build in temp first, then copy/archive back into `dist/`.
4. Startup shell behavior:
   - Root cause: the splash could disappear too quickly and was not forced to the front.
   - Fix: splash is now frontmost, minimum-duration, and replaced only after the local runtime is reachable.
5. Sports posters:
   - Root cause: sports tiles were biased toward portrait/fallback art even when landscape event art existed.
   - Fix: sports artwork now tracks portrait, landscape, and background separately, and tiles prefer landscape.
6. LAN Bridge pair drift after desktop auto-provision:
   - Root cause: desktop boot could rewrite the saved local config with a sanitized `/auto-provision` readback payload, which dropped `lanPairKey` / `lanPairOwnerId`. A later local auto-setup then regenerated a new key for the same pair id and the hosted relay rejected it as `invalid pair key`.
   - Fix: desktop boot no longer persists sanitized provision readbacks, host-side pair status now asks the relay directly, and the desktop can repair the local LAN identity if the relay rejects a stale pair.

## Still Needs Real-Client Proof

These items should still be treated as open until captured on real clients:

- second-device `LAN Bridge` browse/play pass on Android TV or Android mobile using the latest `1.1.15` desktop build
- Apple TV synced-addon flow after desktop/web install
- one real public `Remote Seedbox` ready-file playback success on a remote client
- one auth-protected external file-server playback success on a real Stremio client
- long-session playback/performance tuning after qBittorrent download-speed adjustments

## Current Risks

- `LAN Bridge` still depends on the Windows host desktop staying online and heartbeating
- Bonjour may still be missing or stopped on some hosts; that affects discovery/fallback polish, not the core loopback path
- remote/auth-protected playback behavior still depends on what the target Stremio client honors during redirect/auth handoff

## Recommended Next Work

1. Tune qBittorrent for faster early playback and confirm stream start time improvements on real clients.
2. Re-test `LAN Bridge` from a second device using the latest `1.1.15` build and record the exact device/client result.
3. Keep sports poster review focused on what Stremio clients actually render, not just what the metadata payload contains.
4. Keep this file updated whenever a real device test changes the truth table.
