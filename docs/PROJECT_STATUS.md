# PVTKRRX Project Status

Updated: 2026-02-27

## Current Stage

PVTKRRX is in **post-MVP hardening and multi-device LAN pairing**.

- Core addon flow (catalog, stream, playback, local config, encryption, desktop wrapper) is complete and shipping.
- Local desktop usage is stable via `http://127.0.0.1:7000/local/manifest.json?mode=local`.
- New LAN pair relay flow for Android TV/mobile account-sync has now been implemented in code.

## What Is Implemented

1. Local + hosted install modes with stable local config.
2. Built-in file serving + progressive playback buffering.
3. Sports catalog and artwork enrichment.
4. Electron desktop packaging (`Dist/PVTKRRX Setup 1.0.0.exe`, portable build).
5. LAN pair relay plumbing:
   - `POST /pair/heartbeat`
   - `POST /pair/status`
   - hosted route redirect to active LAN endpoint when pair is online
   - desktop background heartbeat loop + Stremio launch pulse
   - configure UI Method 4 hosted LAN-pair install URL generation
6. LAN pair privacy hardening:
   - `/pair/status` now requires both `pairId` and `pairKey`
   - status responses no longer expose LAN endpoint metadata
   - hosted fallback responses avoid exposing resolver reason details
   - heartbeat/status endpoints are rate limited
   - optional public-IP binding blocks pair reuse from other networks by default (`PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP=true`)
   - heartbeat host-lock can reject active-session takeover from a different source IP (`PVTKRRX_LAN_PAIR_LOCK_HOST=true`)
   - sensitive routes (`/encrypt`, `/pair/*`) use strict browser-origin allowlists
   - local admin routes (`/local-config`, `/auto-provision`, `/network-info`, local qBit control) are local-network/loopback guarded

## Active Worktree Items

- Sports hint/artwork tuning remains in-progress and uncommitted:
  - `src/clients/prowlarr.js`
  - `src/clients/sportsdb.js`
  - `src/handlers/catalog.js`
  - `src/utils/sportsRules.js`

## Required Vercel Configuration For LAN Pair Relay

Use these on the hosted deployment:

1. `ENCRYPTION_SECRET` (existing required secret).
2. `KV_REST_API_URL` and `KV_REST_API_TOKEN` (recommended) to persist pair heartbeat state across serverless invocations.
3. Optional: `PVTKRRX_PAIR_RELAY_URL` (defaults to `https://pvtkrrx.vercel.app`).
4. Optional: `PVTKRRX_LAN_PAIR_TTL_SECONDS` (default `120`).
5. Optional security tuning:
   - `PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP` (default `true`)
   - `PVTKRRX_LAN_PAIR_LOCK_HOST` (default `true`)
   - `PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS` (default `60000`)
   - `PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW` (default `30`)
   - `PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW` (default `60`)
   - `PVTKRRX_ENCRYPT_MAX_PER_WINDOW` (default `30`)
   - `PVTKRRX_ALLOWED_WEB_ORIGINS` (browser allowlist, defaults to hosted production origin)

Without KV, pair state falls back to in-memory state and may be unreliable on cold starts.

## Next Validation Pass

1. Deploy to Vercel with KV env vars.
2. Start local desktop app and verify relay heartbeat every ~30s.
3. Install Method 4 URL in Stremio account on Android TV/phone.
4. Confirm opening Stremio on LAN devices resolves catalogs/streams via silent relay redirect.
5. Confirm offline behavior when desktop app stops (pair status shows offline and addon routes fail gracefully).
