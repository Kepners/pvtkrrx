# PVTKRRX Rollback Baseline: v1.0.4

Updated: 2026-03-25

## Purpose

This file records the confirmed regression findings from the March 2026 Stremio breakage review.
It is the working baseline for the recovery branch that should start from `v1.0.4` behavior, then selectively reintroduce later UI and phone-support improvements without reintroducing the contract breaks.

## User Goal

- Return to the known-good `v1.0.4` addon behavior.
- Keep the upgraded UI and website where they do not break the addon contract.
- Restore working phone behavior.
- Preserve posters and Prowlarr-backed Stremio browsing.

## Confirmed Good Baseline

- `v1.0.4` is the last tagged line that still matches the early working Stremio contract.
- In `v1.0.4`, the sports catalog is exposed as `type: 'movie'`, not a top-level `sports` catalog type.
- In `v1.0.4`, `/manifest.json` is still a real addon manifest, not a bootstrap-only placeholder.
- In `v1.0.4`, the core addon surfaces still align with the behavior the user remembers working in Stremio.

## Confirmed Regression Points

### 1. Sports contract regression

- Commit: `343e54d`
- Date: 2026-03-09
- Subject: `feat: major configurator and addon enhancements`
- Confirmed change:
  - Added `'sports'` to manifest `types`
  - Added `'sports'` to stream resource types
  - Changed the Sports catalog from `type: 'movie'` to `type: 'sports'`
- Why this matters:
  - Early working builds did not use a top-level Stremio `sports` type.
  - This is the first direct manifest-contract break that lines up with the empty Sports view in current Stremio builds.

### 2. Large architecture churn to avoid

- Commit: `52b9202`
- Date: 2026-03-15
- Subject: `feat: sync latest stremio server, routes, and docs`
- Scope:
  - 51 files changed
  - 10,944 insertions
  - 10,728 deletions
- Why this matters:
  - This is the major churn point between the stable `v1.0.4` line and the current architecture.
  - It is too large to treat as a safe upgrade on top of the rollback branch.
  - It should be treated as a banned reintroduction target for the recovery branch.

### 3. Hosted private-target hardening and bootstrap manifest shift

- Commit: `0959486`
- Date: 2026-03-24
- Subject: `sync website and route spec`
- Confirmed change:
  - Hosted `/test-connection` now rejects loopback, LAN, and private-resolution targets.
  - Root `/manifest.json` now returns a bootstrap-only manifest instead of a real addon manifest.
- Why this matters:
  - This explains the current hosted test behavior.
  - It is newer than the early working builds and must not be assumed compatible with the recovery branch.
  - Reuse only after phone and LAN behavior are re-proven on the recovered baseline.

## Banned Commit Policy For Recovery Work

### Hard ban

- Do not cherry-pick, replay, or merge commit `52b9202` into the rollback branch.
- Do not use `52b9202` as a rebase target.
- Do not copy its Stremio route architecture wholesale.

### Soft ban unless explicitly re-proven

- Do not carry forward the `343e54d` manifest change that promotes Sports to a top-level `sports` catalog type.
- Do not carry forward the `0959486` bootstrap-only root manifest behavior by default.
- Do not carry forward hosted private-target restrictions if they block the intended recovery workflow without a separately verified replacement path.

## What Must Stay

### Non-negotiable addon contract

- Sports catalog stays on the legacy working Stremio contract:
  - `type: 'movie'`
  - no top-level manifest `types: ['sports']`
  - no stream-resource promotion to top-level `sports` unless real-client proof exists
- `/manifest.json` must remain a real addon manifest unless a separate bootstrap route is introduced and verified on real Stremio clients.
- Prowlarr + qBittorrent remain the core service pair.
- Posters and artwork should stay, but only if they do not require changing the known-good catalog contract.

### Worth preserving from later work

- UI improvements in `public/configure.html`, `public/index.html`, and the desktop popup, as long as they are decoupled from Stremio contract changes.
- Website polish and brand improvements, as long as they are presentation-only.
- LAN phone/home-device support as a concept:
  - hosted manifest token
  - desktop heartbeat
  - redirect to active LAN host
  - but only if this is rebuilt on top of the working addon contract
- Local config stability and explicit `/local/manifest.json?mode=local` behavior.
- Sports poster enrichment, if it works under the legacy sports-as-movie surface.

## Recovery Branch Rules

1. Start from `v1.0.4` behavior, not from `HEAD`.
2. Reintroduce UI and website improvements in isolation from addon-contract changes.
3. Reintroduce phone support selectively from the late-February LAN-pair line, not from the March 15 rewrite.
4. Treat Stremio manifest shape as a protected interface.
5. Any future manifest change must be tested against real Stremio desktop and phone behavior before it is accepted.

## Recommended Rebuild Order

1. Recreate the `v1.0.4` manifest and catalog contract.
2. Confirm desktop browse and posters work again.
3. Re-add UI and website improvements without changing addon routes.
4. Re-add LAN phone support in a smaller, testable slice.
5. Only then consider later security hardening one piece at a time.

## Evidence Used

- Git tags:
  - `v1.0.1`
  - `v1.0.2`
  - `v1.0.3`
  - `v1.0.4`
  - `v1.1.6`
- Key commits reviewed:
  - `343e54d`
  - `52b9202`
  - `0959486`
  - `0ea0011`
  - `3789cf5`
- Current files inspected:
  - `src/config/manifest.js`
  - `src/handlers/catalog.js`
  - `index.js`

## Current Working Decision

The recovery effort should begin from the `v1.0.4` addon contract, then bring forward UI, website, and phone-support pieces selectively.
The March 15, 2026 rewrite `52b9202` is not an acceptable base for that recovery line.
