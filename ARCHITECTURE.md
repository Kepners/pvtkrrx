# PVTKRRX Architecture

Updated: 2026-03-24

## Canonical Sources

- `docs/CURRENT_DESIGN.md` defines the live system behavior.
- `docs/ROUTE_FRAMEWORK.md` defines the three install routes.
- `docs/STREMIO_INSTALL_TRACKER.md` tracks what Stremio clients actually accept.

## System Overview

PVTKRRX is one addon system with a hosted relay, a local runtime, and a Windows desktop wrapper.

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
   +-- LAN Bridge / Remote Seedbox ----------> Hosted relay (www.pvtkrrx.cc)
                                             - hosted manifests/config tokens
                                             - pair heartbeat/status
                                             - Stremio account link
                                             - public-only connection tests
                                             - optional KV-backed pair/account state
                                                       |
                                                       +--> redirects back to live LAN host
                                                       or
                                                       +--> uses public remote playback path
```

## Components

| Component | Responsibility |
|---|---|
| `index.js` | Main Express + SDK server, hosted + local routes, playback, file serving, account and pair APIs |
| `src/handlers/*` | Catalog, stream, and meta generation |
| `src/clients/*` | Prowlarr, Torznab-compatible search, qBittorrent, Cinemeta, and TheSportsDB integrations |
| `src/utils/opaqueState.js` | Opaque state tokens for `/file` and `/playback` |
| `src/utils/pairStore.js` | LAN pair persistence |
| `src/utils/accountStore.js` | Stremio-linked account and billing/trial data store |
| `electron/main.js` | Desktop wrapper, startup automation, heartbeat loop, Windows integration |
| `public/configure.html` | Route-aware configure/install UI |

## Route Model

| Route | Install surface | Runtime dependency | Intended device |
|---|---|---|---|
| `PC Local` | Local manifest on `127.0.0.1` | Local runtime only | The host Windows PC |
| `LAN Bridge` | Hosted manifest with `lanPair*` fields | Hosted relay + live desktop heartbeat | Same-account home devices |
| `Remote Seedbox` | Hosted manifest with public playback config | Hosted relay + public ready-file playback endpoints | Away-from-home / public route |

## Main Flows

### Configure And Save

1. User opens `/configure`.
2. User selects a route: `PC Local`, `LAN Bridge`, or `Remote Seedbox`.
3. Local route saves config into the Windows runtime folder.
4. Hosted routes call `POST /encrypt` and install a hosted manifest token.

### LAN Bridge Resolve

1. Desktop runtime gathers LAN endpoints from `/network-info`.
2. Desktop posts `pairId`, `pairKey`, and endpoints to `POST /pair/heartbeat`.
3. Hosted addon requests resolve the pair state.
4. Non-loopback hosted requests 307-redirect to the best current endpoint.
5. Redirect preference is the live LAN IP first, with `.local` as fallback.

### Playback

1. Stream handler resolves content from Prowlarr/Torznab-compatible search plus qBittorrent state.
2. Completed local files prefer `/file/:info`.
3. Not-ready content uses `/playback/:info` only on playback-capable runtimes such as PC Local, LAN Bridge after local redirect, or self-hosted installs that actually serve `/playback`.
4. External `fileServerUrl` is optional and mainly used when the local runtime cannot read the file directly.
5. Hosted runtime must fail fast rather than buffering or serving local-only playback, and hosted Remote Seedbox responses must suppress dead tracker `/playback` streams.

### Sports And Library

1. Sports catalog items use internal `pvtkrrx:` ids.
2. Meta and stream handlers decode those ids at request time.
3. TheSportsDB is used for posters, fanart, and cached enrichment where configured.
4. Library items expose completed qBittorrent content through the same addon surface.

## Storage Model

| Data | Where it lives |
|---|---|
| Hosted addon config | Encrypted token in hosted manifest URL |
| Local addon config | Runtime `local-config.json` on the Windows host |
| Pair state | Memory or KV-backed pair store |
| Stremio-linked account data | Memory, local file, or KV-backed account store depending on deployment |
| Video bytes | Never proxied through the hosted relay |

## Key Constraints

1. Raw `192.168.x.x` addon installs are not the supported Stremio install path.
2. `PC Local` is same-host only.
3. `LAN Bridge` needs the desktop app alive and heartbeating.
4. Hosted relay responses may redirect into the local runtime, but they should not become the video proxy.
5. Hosted connection checks may validate public endpoints from the configure page, but they must not probe loopback/LAN/private targets.
6. There is no `.pvtk` file format in the live code; the repo uses `pvtkrrx:` ids inside addon responses.
