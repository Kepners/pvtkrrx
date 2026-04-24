# Tablet Sports First-Screen Audit - 2026-04-24

## Scope

- Boundary: LAN Bridge / Hybrid Home tablet-home-device route only.
- Measured path: hosted manifest -> hosted catalog redirect -> local football catalog.
- Playback not tested here.

## Verified Before

- Hosted manifest response: ~54 ms.
- Hosted pair resolve / 307 redirect: ~34 ms.
- Local football catalog on the installed desktop runtime: ~33.9 s.
- Existing desktop logs from `runtime/logs/desktop-2026-04-24.log` also showed sports catalog spans in the 22-51 s range.

## Root Cause

- Delay was not in the hosted relay.
- The dominant blocker was local sports catalog assembly.
- The cold football first-screen path was over-waiting for second-pass Prowlarr seed enrichment before returning the first usable page.
- SportsMeta identity/artwork work also blocked first paint, but after the repo-side mitigation it was secondary to Prowlarr.
- Direct TheSportsDB calls are not in the live PVTKRRX path; enrichment here is SportsMeta-only.

## Repo Changes

- `src/handlers/catalog.js`
  - lowered the default seed-enrich threshold for first paint
  - added fast seed-query timeout handling
  - capped the identity-resolution wall-clock budget for catalog first paint
- `src/utils/sportsIdentityResolution.js`
  - added the fast-fail resolver mode used by the catalog first-screen path
- `scripts/probe-tablet-first-screen.js`
  - added an ad-hoc timing harness for repeatable measurement

## Verified After

- Patched repo runtime on sidecar `7010/7011`, with relay pinned to that endpoint by heartbeat:
  - hosted manifest: ~69 ms
  - hosted pair resolve / redirect: ~19 ms
  - local football catalog: ~2069 ms
  - total measured route: ~2157 ms

## Live Runtime Caveat

- The packaged desktop host on `7000/7001` could not be cleanly replaced from this session.
- `taskkill /F /T /IM PVTKRRX.exe` hit `Access is denied` on the active listener process.
- Because of that, the stable packaged EXE listener is still the old slow one on `7000/7001`.
- The current live home-device route is being kept on the patched repo sidecar `7010/7011` by a background heartbeat loop so the relay prefers that endpoint instead of the old packaged listener.

## Follow-Up Needed

- Replace or restart the packaged elevated desktop host with a build that includes the repo changes, so the workaround sidecar and heartbeat pin are no longer needed.
