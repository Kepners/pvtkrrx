# PVTKRRX Specification

> **Status:** Live product specification
> **Updated:** 2026-03-15

## Product Statement

PVTKRRX connects private tracker and seedbox infrastructure to Stremio without using debrid and without turning the hosted relay into a video proxy.

## Current Product Goals

- Provide a real same-PC Stremio addon route for the Windows host running PVTKRRX.
- Provide a same-account home-device route that can bridge hosted addon installs back to the active LAN host.
- Provide a hosted route for public HTTPS seedbox playback.
- Surface sports, movies, TV, and library content in one addon family.
- Keep tracker/file hints protected by encrypted config tokens and opaque playback state tokens.

## Required Route Model

1. `PC Local`
   - install on `127.0.0.1`
   - use local `/file` and `/playback`
   - same-host only
2. `LAN Bridge`
   - install from hosted manifest token
   - use pair heartbeat plus hosted redirect
   - same Stremio account across devices
3. `Remote Seedbox`
   - install from hosted manifest token
   - use public HTTPS ready-file playback endpoints
   - no LAN heartbeat dependency

## Functional Scope

1. Configure page with route-aware install actions.
2. Local config save for host-PC runtime.
3. Hosted token encryption for non-local installs.
4. Sports catalog with TheSportsDB enrichment and cached artwork.
5. Movie and TV stream resolution using Prowlarr/Torznab-compatible search plus Cinemeta metadata assistance.
6. Seedbox library browsing from qBittorrent state.
7. Built-in `/file` serving with range support when the host can read the file locally.
8. `/playback` queue-and-wait behavior for tracker content not yet ready on playback-capable runtimes.
9. LAN pair heartbeat/status flow for hosted home-device routing.
10. Optional Stremio AuthKey account linking and account-scoped access state.
11. Windows desktop packaging for the local runtime.
12. Route-aware connection testing: hosted configure may test public HTTP/HTTPS service endpoints, while local configure may test loopback/LAN endpoints on the host.

## Non-Goals

- Raw `192.168.x.x` addon install as the primary supported Stremio path.
- Hosted relay proxying video bytes.
- A standalone `.pvtk` file format.
- Multiple independent seedbox profiles inside a single addon install.

## Operational Requirements

- Hosted manifests must be HTTPS.
- Same-PC local install must remain available through `http://127.0.0.1:7000/local/manifest.json?mode=local`.
- Hosted LAN Bridge requests must resolve to the best active LAN endpoint, preferring live LAN IP over `.local`.
- Local playback should prefer the built-in file server when the runtime can read the completed file.
- Hosted `/file` and `/playback` must fail fast instead of waiting on serverless runtime for local-only playback paths.
- Hosted Remote Seedbox on Vercel must not emit tracker `/playback` streams that depend on that disabled hosted route.
- Remote tracker flows that would lose required external file-server auth must be suppressed.
- Remote buffering URLs must only be emitted when the current file path is provable from live torrent state.
- Hosted connection-test routes must be rate limited and reject loopback/LAN/private targets.

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
