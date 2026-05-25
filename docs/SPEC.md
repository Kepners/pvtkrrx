# PVTKRRX Specification

> **Status:** Live product specification
> **Updated:** 2026-05-25

## Product Statement

PVTKRRX connects private tracker and seedbox infrastructure to Stremio, with optional user-supplied debrid provider handoff, without turning the hosted relay into a video proxy or a debrid provider.

## Current Product Goals

- Provide a real same-PC Stremio addon route for the Windows host running PVTKRRX.
- Provide a same-account home-device route that can bridge hosted addon installs back to the active LAN host.
- Provide a hosted route for public HTTPS seedbox playback.
- Surface sports, movies, TV, and library content in one addon family.
- Support optional debrid/cache-search handoff while preserving qBittorrent/local fallback behavior.
- Keep tracker/file hints protected by encrypted config tokens and opaque playback state tokens.
- Keep the local Windows desktop experience route-first and simple, with advanced/fallback tools hidden by default.

## Required Route Model

1. `PC Local`
   - install on `127.0.0.1`
   - use local `/file` and `/playback`
   - same-host only
2. `LAN Bridge`
   - install from hosted manifest token
   - use pair heartbeat plus hosted redirect
   - same Stremio account across devices
   - not the route for the Windows host desktop itself
3. `Remote Seedbox`
   - install from hosted manifest token
   - use public HTTPS ready-file playback endpoints
   - no LAN heartbeat dependency

## Functional Scope

1. Configure page with route-aware install actions.
2. Route-first configure UI with advanced/manual tabs hidden by default.
3. Local config save for the host-PC runtime.
4. Hosted token encryption for non-local installs.
5. Sports catalog with SportsMeta-backed sports identity resolution plus client-safe PVTKRRX `/sports-artwork/...png` URLs backed by SportsMeta-owned canonical and default public artwork routes.
6. Movie and TV stream resolution using Prowlarr/Torznab-compatible search plus Cinemeta metadata assistance.
7. Seedbox library browsing from qBittorrent state.
8. Built-in `/file` serving with range support when the host can read the file locally.
9. `/playback` queue-and-wait behavior for tracker content not yet ready on playback-capable runtimes.
10. LAN pair heartbeat/status flow for hosted home-device routing.
11. Optional Stremio AuthKey account linking and account-scoped access state.
12. Windows desktop packaging for the local runtime.
13. Desktop startup splash and route-aware popup guidance on Windows.
14. Route-aware connection testing: hosted configure may test public HTTP/HTTPS service endpoints, while local configure may test loopback/LAN endpoints on the host.
15. Optional Debrid provider configuration for Real-Debrid, AllDebrid, and Premiumize, plus optional cache search for put.io and Premiumize cache checks.
16. `/playback/debrid` add/check/poll handoff that redirects to provider playback when ready and keeps qBittorrent/local streams as fallback.

## Non-Goals

- Raw `192.168.x.x` addon install as the primary supported Stremio path.
- Hosted relay proxying video bytes.
- PVTKRRX acting as a debrid provider or third-party media host.
- A standalone `.pvtk` file format.
- Multiple independent seedbox profiles inside a single addon install.

## Operational Requirements

- Hosted manifests must be HTTPS.
- Same-PC local install must remain available through `http://127.0.0.1:7000/local/manifest.json?mode=local`.
- Hosted LAN Bridge requests must resolve to the best active LAN endpoint, preferring live LAN IP over `.local`.
- The Windows host desktop must use `PC Local`, not the hosted `LAN Bridge` route, for its own browsing/playback.
- Local playback should prefer the built-in file server when the runtime can read the completed file.
- Hosted `/file` and `/playback` must fail fast instead of waiting on a hosted runtime for local-only playback paths.
- `/playback/debrid` must hand off to the configured provider and must not proxy provider media bytes through the hosted relay.
- Hosted `Remote Seedbox` must not emit tracker `/playback` streams that depend on a disabled hosted playback path.
- Remote tracker flows that would lose required external file-server auth must be suppressed.
- Remote buffering URLs must only be emitted when the current file path is provable from live torrent state.
- Hosted connection-test routes must be rate limited and reject loopback/LAN/private targets.
- Windows packaging must remain reproducible from `npm run dist:win`.

## Canonical Companion Docs

| Document | Purpose |
|----------|---------|
| [CURRENT_DESIGN.md](CURRENT_DESIGN.md) | Canonical current behavior |
| [ROUTE_FRAMEWORK.md](ROUTE_FRAMEWORK.md) | Route selection rules |
| [STREMIO_INSTALL_TRACKER.md](STREMIO_INSTALL_TRACKER.md) | Verified Stremio client install behavior |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Current delivery and verification status |

## Historical Planning Docs

The February 2026 planning records are kept for context:

- [CLIENT_DRIVERS.md](CLIENT_DRIVERS.md)
- [SCOPE_OF_WORKS.md](SCOPE_OF_WORKS.md)
- [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)
- [COMMERCIAL_SPEC.md](COMMERCIAL_SPEC.md)
- [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md)
