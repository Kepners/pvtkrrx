# PVTKRRX Rebuild Prompt

Updated: 2026-03-27

Use the prompt below with another AI coding agent. It is written for an agent working inside this repository.

```text
Rebuild PVTKRRX from scratch as a clean Node.js + Express + Electron Stremio addon app.

Do not keep patching the current architecture. Treat the existing code as behavior reference only, not as the structure you must preserve.

Read these files first, in this order:
1. AGENTS.md
2. CLAUDE.md
3. README.md
4. ARCHITECTURE.md
5. docs/CURRENT_DESIGN.md
6. docs/ROUTE_FRAMEWORK.md
7. docs/STREMIO_INSTALL_TRACKER.md
8. docs/LAN_BRIDGE_PROCESS.md
9. docs/SPEC.md
10. docs/PROJECT_STATUS.md
11. docs/STREMIO_ADDON_REFERENCE.md

Goal:
Build a maintainable, working rewrite of PVTKRRX that bridges Prowlarr/qBittorrent into Stremio with three explicit routes:
- PC Local
- LAN Bridge
- Remote Seedbox

What the product is:
- a Stremio addon plus Windows desktop runtime
- local route for the Windows host PC
- hosted relay route for same-account home devices
- hosted public route for real HTTPS-ready remote playback
- sports, movies, TV, and library in one addon family
- direct integration with:
  - Prowlarr or other Torznab-compatible search
  - qBittorrent WebUI for torrent state, download control, and library visibility
  - optional external/public file server for completed-file playback on remote routes
- installable both as:
  - a Windows desktop/local-runtime app for PC Local and LAN Bridge
  - a self-hosted server deployment on a VPS or seedbox for hosted/public routes

Non-negotiable protocol and product rules:
- respect real Stremio protocol rules, not wishful assumptions
- remote addon URLs must be HTTPS
- the only HTTP exception is 127.0.0.1 / localhost for same-machine local installs
- raw http://192.168.x.x:7000/... addon installs are not a supported primary path
- root /manifest.json must be bootstrap-only
- addon ids must be stable addon identities, not per-user or per-PC values
- do not generate addon ids dynamically per install
- do not use the personal namespace `com.kepners.*` for the rebuilt product
- default the addon id base to a neutral product namespace derived from the public product domain, for example `cc.pvtkrrx`
- allow the addon id base to be configured once per deployment or fork, for example via `PVTKRRX_ADDON_ID_BASE`, defaulting to `cc.pvtkrrx`
- derive route ids from that stable base id:
  - bootstrap: `<base>.bootstrap`
  - PC Local: `<base>.local`
  - LAN Bridge: `<base>.lan`
  - Remote Seedbox: `<base>.online`
- if the addon id base changes from the currently shipped namespace, treat that as a deliberate breaking identity change:
  - existing Stremio installs will not auto-upgrade into the new id
  - users may need to remove the old addon and install the rebuilt one
  - docs must state that clearly
- bootstrap manifest must have no catalogs and no addon resources
- bootstrap manifest must keep behaviorHints.configurationRequired=true
- PC Local must install from http://127.0.0.1:7000/local/manifest.json?mode=local
- LAN Bridge and Remote Seedbox must install from hosted token manifests
- hosted relay must never proxy video bytes
- hosted /playback must fail fast or be suppressed when the hosted runtime cannot actually serve playback
- remote buffering/file flows that would leak external file-server auth or depend on unprovable live file paths must be suppressed
- sports must stay on the dedicated top-level `sports` catalog contract so Stremio exposes a real Sports type instead of hiding it under Movie
- sports/library custom ids use pvtkrrx: internally
- there is no .pvtk file format in this repo
- hosted config tokens must be encrypted
- playback/file state must use opaque tokens, not plain base64 JSON
- sensitive hosted routes must keep origin checks, CSRF protection where appropriate, rate limits, and public-target-only connection testing
- do not assume any specific managed host is required; the canonical hosted base today is https://www.pvtkrrx.cc

Core integration requirements:
- Prowlarr integration must be first-class:
  - store and validate Prowlarr base URL + API key
  - support Torznab-compatible search behavior used by the current app
  - use Prowlarr for sports, movie, and TV discovery
- qBittorrent integration must be first-class:
  - store and validate qBittorrent WebUI URL + credentials
  - inspect torrent state and files
  - add torrents/magnets when queue-and-buffer playback is allowed
  - expose completed downloads as library/playback candidates
- seedbox deployment must be a first-class scenario:
  - document how to run the app on a VPS or seedbox behind HTTPS
  - support remote/public playback when Prowlarr, qBittorrent, and file-serving endpoints are actually reachable from the public route
  - clearly separate hosted ready-file playback from local queue-and-buffer playback
  - if the rewrite supports a self-hosted playback-capable runtime on the seedbox, document exactly when hosted `/playback` is allowed and when it must still be suppressed

What the current workspace already proves:
- the local smoke suite passes on 2026-03-27:
  - npm run smoke:config
  - npm run smoke:guards
  - npm run smoke:pipeline
  - npm run smoke:lan-pair
  - npm run smoke:stremio-link
  - npm run smoke:security
  - npm run smoke:sports
- pair heartbeat/status/redirect logic exists and is test-covered
- Stremio AuthKey account linking exists and is test-covered
- security hardening exists and is test-covered
- the latest pivot changed root /manifest.json into a bootstrap manifest and added root compatibility routes for stale installs

What is still not proven and must be treated as active risk:
- real Stremio client behavior after the bootstrap-manifest pivot
- Android TV/mobile same-account LAN Bridge sync
- Apple TV synced-addon behavior
- one real public Remote Seedbox ready-file playback path
- one auth-protected external file-server playback path
- KV-backed pair persistence across restarts/redeploys

Architecture direction for the rewrite:
- separate concerns cleanly instead of keeping a giant mixed runtime
- recommended modules:
  - manifest and Stremio transport layer
  - config/token encryption layer
  - provider clients: Prowlarr, qBittorrent, Cinemeta, SportsDB
  - stream/file/playback orchestration
  - LAN pair store and relay logic
  - Stremio AuthKey account-link logic
  - Electron desktop shell and IPC
  - shared validation, redaction, URL policy, and config helpers
- prefer plain, debuggable Node.js/CommonJS over unnecessary framework churn unless there is a clear reason not to

Behavior requirements:
- PC Local must be the real same-PC addon for the Windows host
- LAN Bridge must be the synced home-device route and depend on live desktop heartbeat
- Remote Seedbox must be the public HTTPS route and ready-file-first unless the runtime truly supports hosted playback
- configure UI must stay route-aware and make the install choice obvious
- configure UI must explicitly collect and validate:
  - Prowlarr URL + API key
  - qBittorrent URL + username + password
  - optional file-server URL and path mapping for remote/public playback
- desktop shell must start the local runtime, surface logs/status, help with LAN Bridge, and degrade gracefully when local dependencies are not ready
- rewrite docs so they match the new architecture exactly

Compatibility requirement:
- if you keep support for stale root installs, root /catalog, /meta, and /stream compatibility routes must resolve safely instead of producing EmptyContent
- if you deliberately drop stale-root compatibility, explain why and provide an explicit migration strategy

Minimum deliverables:
- a clean rewritten app in this repo
- updated docs
- smoke coverage for config/install, guards, stream pipeline, LAN pair, auth link, security, and sports
- a manual real-client test checklist for desktop, Android TV/mobile, Apple TV, and hosted remote playback

Acceptance criteria:
- all smoke tests pass locally
- root /manifest.json is bootstrap-only
- PC Local, LAN Bridge, and Remote Seedbox have clearly separated manifest identity and behavior
- local-only and hosted-only logic cannot be confused by stale tokens or wrong manifest reuse
- the code structure makes Stremio protocol rules obvious instead of fighting them
- docs clearly separate what is verified from what is still unproven

Working style:
- prove root causes before changing behavior
- use the docs above as the source of truth over old February planning documents
- if legacy code conflicts with docs/STREMIO_ADDON_REFERENCE.md or docs/STREMIO_INSTALL_TRACKER.md, follow protocol truth, not legacy behavior
- prefer clean replacement over incremental salvage when old structure is the reason the bug keeps returning

Start by producing a short implementation plan, then rebuild the app end to end.
```
