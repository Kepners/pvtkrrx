# PVTKRRX Architecture

Updated: 2026-04-11

## Canonical Sources

- `docs/CURRENT_DESIGN.md` defines the live system behavior.
- `docs/ROUTE_FRAMEWORK.md` defines the three install routes.
- `docs/STREMIO_INSTALL_TRACKER.md` tracks what Stremio clients actually accept.

## System Overview

PVTKRRX is one addon system with a hosted relay, a local runtime, and a Windows desktop wrapper.

Current Contabo note: `www.pvtkrrx.cc` is presently served through Caddy into the Coolify-hosted `pvtkrrx` app container. A separate `/opt/pvtkrrx` `systemd` runtime can exist on the same host for self-host/manual use, but it is not the public route unless Caddy is repointed.

```text
Stremio client
   |
   +-- PC Local --------------------------------------+
   |                                                  |
   |         http://127.0.0.1:7000/local/...          v
   |                                         Local PVTKRRX runtime
   |                                         - local config
   |                                         - /file and /playback
   |                                         - /network-info
   |                                         - qBit/Prowlarr access
   |
   +-- Hybrid Home / Remote Seedbox ---------> Hosted relay (https://www.pvtkrrx.cc)
                                             - Contabo Caddy -> live Express runtime
                                             - current public target: Coolify alias pvtkrrx:3000
                                             - hosted manifests/config tokens
                                             - pair heartbeat/status
                                             - Stremio account link
                                             - public-only connection tests
                                             - optional KV-backed pair/account state
                                                       |
                                                       +--> redirects back to live LAN host
                                                       or
                                                       +--> uses public remote playback path

Self-hosted server mode uses the same Express runtime on a VPS/seedbox, but with `PVTKRRX_SELF_HOST_MODE=true` so the server can persist a disk-backed config, expose a stable `/selfhost/manifest.json?mode=hosted`, and accept authenticated private/localhost service URLs from the configure page.
```

## SportsMeta Boundary

SportsMeta is not a subsection of the public `www.pvtkrrx.cc` app.

- SportsMeta owns the separate hostname `https://sportsmeta.pvtkrrx.cc`
- SportsMeta owns `sportsmeta.service`, the SportsMeta SQLite DB, asset cache, member-token routes, and Stripe billing
- PVTKRRX stays the separate stream addon and only consumes canonical `sportsmeta:` ids when attaching streams
- the old integrated `/sportsmeta/*` draft inside this repo is now non-production and disabled by default unless `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA=true`

Shared Contabo hosting and same-box network access are infrastructure couplings, not proof that the products are one runtime.

## Components

| Component | Responsibility |
|---|---|
| `index.js` | Main Express + SDK server, hosted + local routes, playback, file serving, account and pair APIs |
| `src/handlers/*` | Catalog, stream, and meta generation |
| `src/clients/*` | Prowlarr, qBittorrent, Cinemeta, TheSportsDB, and separate-SportsMeta integrations |
| `src/utils/analytics.js` | Optional Umami monitoring for hosted traffic and product events, with host gating and dedupe state |
| `src/utils/sportsImageCache.js` | Signed sports artwork proxy URLs plus runtime disk cache for poster, background, landscape, and logo bytes |
| `src/utils/sportsCacheAutofill.js` | Rotating background sports-cache refill for long-running Linux/cloud runtimes |
| `src/utils/opaqueState.js` | Opaque state tokens for `/file` and `/playback` |
| `src/utils/pairStore.js` | LAN pair persistence |
| `src/utils/accountStore.js` | Stremio-linked account and billing/trial data store |
| `electron/main.js` | Desktop wrapper, startup splash, heartbeat loop, Windows integration |
| `electron/popup.html` | Route-aware Windows shell with runtime logs and host path controls |
| `public/configure.html` | Route-first configure/install UI with hidden advanced tabs |
| `scripts/build-win.js` | Temp-output Windows packaging workflow that copies/archive artifacts back into `dist/` |

## Route Model

`Hybrid Home` is the current name for the hosted home-device route.
Legacy `LAN Bridge` strings still exist in some live UI/help surfaces and in the internal `lanPair*` field names, but they refer to the same hosted home-device path unless the docs explicitly call out the older strict-LAN profile.

| Route | Install surface | Runtime dependency | Intended device |
|---|---|---|---|
| `PC Local` | Local manifest on `127.0.0.1` | Local runtime only | The host Windows PC |
| `Hybrid Home` | Hosted manifest with `lanPair*` fields | Hosted relay + live desktop heartbeat, with cloud fallback when configured | Other home devices on the same account |
| `Remote Seedbox` | Hosted manifest with public playback config | Hosted relay + public ready-file playback endpoints | Away-from-home / public route |

## Main Flows

### Configure And Save

1. User opens `/configure`.
2. User selects a route card:
   - Windows desktop/local runtime: `PC Local` or `Hybrid Home`
   - Hosted public relay: `PC Local`, `Hybrid Home`, or `Remote Seedbox`
   - Explicit self-host server runtime: `Remote Seedbox` only
3. The page focuses on the next action for that route.
4. Manual/fallback controls stay hidden in `Hidden Setup Tabs`.
5. Local route saves config into the runtime `local-config.json`.
6. Public hosted routes call `POST /encrypt` and install a hosted manifest token.
7. Explicit self-host server mode saves `Remote Seedbox` config into the same runtime `local-config.json`, serves it through `/selfhost/manifest.json?mode=hosted`, and keeps the server configure surface separate from the Windows-local app.

### Desktop Shell

1. Electron starts the splash immediately on cold boot.
2. The splash stays frontmost while the local runtime comes up.
3. The main popup appears only after the local runtime is reachable.
4. The popup then exposes:
   - route launchers for `PC Local` and the hosted home-device route
   - Stremio preflight guidance for the hosted home-device route
   - Windows startup auto-launch and tray lifecycle controls
   - qBittorrent download path controls
   - recent runtime logs and clipboard export
5. `Remote Seedbox` is intentionally not surfaced in the Windows EXE anymore; it belongs to the hosted/self-host server runtime.

The current desktop popup copy still says `LAN Bridge`; the configure flow and hosted profile behavior now treat that route as `Hybrid Home`.

### Hybrid Home Resolve

1. Desktop runtime gathers LAN endpoints from `/network-info`.
2. Desktop posts `pairId`, `pairKey`, and endpoints to `POST /pair/heartbeat`.
3. Hosted addon requests resolve the pair state.
4. Non-loopback hosted requests 307-redirect to the best current endpoint.
5. Redirect preference is the live LAN IP first, with `.local` as fallback.
6. The host desktop itself should not browse this hosted route; it should use `PC Local`.

### Playback

1. Stream handler resolves content from Prowlarr search plus qBittorrent state.
2. Completed local files prefer `/file/:info`.
3. Not-ready content uses `/playback/:info` only on playback-capable runtimes such as `PC Local`, `Hybrid Home` after local redirect, or self-hosted installs that actually serve `/playback`; once qBittorrent exposes the target file on a built-in playback-capable runtime, `/playback` immediately hands off to `/file/:info` so the shared file route can keep the player request alive while bytes arrive.
4. External `fileServerUrl` is optional and mainly used when the local runtime cannot read the file directly.
5. Hosted runtime fails fast rather than buffering or serving local-only playback.
6. Completed local playback now correctly checks torrent completion state before redirecting to `/file`.

### Sports And Library

1. Sports catalog items use internal `pvtkrrx:` ids.
2. Canonical cross-product sports metadata ids use `sportsmeta:` and are owned by SportsMeta, not PVTKRRX.
3. Meta and stream handlers decode `pvtkrrx:` ids locally and consume `sportsmeta:` ids only on the stream-attach side.
4. TheSportsDB is used for poster, background, and logo enrichment where configured for PVTKRRX-owned rows.
5. The manifest now exposes a dedicated top-level `sports` surface with an `All Sports` catalog plus sport-family catalogs such as `Football`, `Motorsport`, and `MMA`.
6. Each sport-family catalog uses the third-column `genre` dropdown for narrower league/team filters.
7. When external sports art exists, local and hosted runtimes now hand Stremio stable `/image/sports/...` URLs backed by the runtime disk cache instead of hotlinking TheSportsDB on every request.
8. Sports catalog tiles now prefer portrait poster art, while background/logo art is carried separately for player-loading and wallpaper use.
9. Library items expose completed qBittorrent content through the same addon surface.
10. Long-running Linux/cloud runtimes now revisit one sport group every 15 minutes by default and keep filling `sports-image-cache/` gradually between installer/manual warm passes.

## Storage Model

| Data | Where it lives |
|---|---|
| Hosted addon config | Encrypted token in hosted manifest URL |
| Local addon config | Runtime `local-config.json` on the Windows host or self-hosted server |
| Pair state | Memory or KV-backed pair store |
| Stremio-linked account data | Memory, local file, or KV-backed account store depending on deployment |
| Hosted analytics dedupe state | Runtime `analytics-dedupe.json` with hashed keys only |
| Video bytes | Never proxied through the hosted relay |

## Key Constraints

1. Raw `192.168.x.x` addon installs are not the supported Stremio install path.
2. `PC Local` is same-host only.
3. `Hybrid Home` needs the desktop app alive and heartbeating.
4. Hosted relay responses may redirect into the local runtime, but they should not become the video proxy.
5. Hosted connection checks may validate public endpoints from the configure page, but they must not probe loopback/LAN/private targets.
6. There is no `.pvtk` file format in the live code; the repo uses `pvtkrrx:` ids inside addon responses.
7. `https://www.pvtkrrx.cc` is the canonical public host; the dead `https://pvtkrrx.vercel.app` preview is not part of the supported install surface.

## Build And Packaging

- `npm run dist:win` now runs through `scripts/build-win.js`.
- Packages are built in temp output first, then copied into `dist/` and archived into `dist/releases/<version>/`.
- This keeps Windows packaging reliable when the repo itself lives inside a OneDrive-backed path.
