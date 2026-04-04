# PVTKRRX Current Design

Updated: 2026-04-04

## Purpose

This is the canonical description of how PVTKRRX works today.
If another document disagrees with this file, this file wins unless that document is explicitly marked as historical context.

## Runtime Model

PVTKRRX is one codebase with three active runtime pieces:

1. Optional hosted relay on the public site (`https://www.pvtkrrx.cc` today, fronted by Caddy into the Express app):
   - serves hosted manifests and the hosted configure UI
   - serves `/version-status.json` so the public site can compare the live build against the latest GitHub release
   - encrypts hosted config tokens
   - stores LAN pair state and account data when KV-backed storage is configured
   - handles Stremio AuthKey linking and account-scoped access checks
   - can mint short-lived Stremio link sessions so any signed-in browser device can link a hosted config token to a Stremio account
   - may test only public HTTP/HTTPS endpoints from the hosted configure flow
2. Self-hosted server mode on a VPS/seedbox (`PVTKRRX_SELF_HOST_MODE=true`):
   - serves its own `/configure` page and static UI
   - saves a disk-backed server config into the runtime directory
   - exposes a stable `/selfhost/manifest.json?mode=hosted`
   - can mint short-lived Stremio link sessions that persist the linked `stremioUserId` back into the disk-backed `selfhost` config
   - can validate localhost/private Prowlarr and qBittorrent URLs only for same-host requests or browser sessions that present the self-host password
   - now has a one-command Linux installer that bootstraps the app directory, bundled Node runtime, `.env`, stable runtime dir, saved self-host config, password, and optional `systemd` service
   - the Linux bootstrap now auto-selects a free qBittorrent WebUI port when the default is occupied, and it captures the Cloudflare Tunnel URL cleanly instead of leaking the "waiting" log line into the saved public URL
   - can choose the self-host HTTPS front door as Cloudflare Tunnel, a user-owned `https://` origin, or skip for later manual setup, and persists that choice in `PVTKRRX_SELF_HOST_HTTPS_MODE`
   - exposes a hosted launcher script at `https://www.pvtkrrx.cc/install-selfhost.sh` so the first curl can come from the canonical site instead of the moving GitHub branch tip
   - pulls the app source from the branch payload by default, with optional pinning via `PVTKRRX_RELEASE_TAG` or a custom release manifest URL; if a pinned release is too old to include `scripts/server-installer.js`, it retries from `main`
   - auto-discovers existing Prowlarr/qBittorrent configs when the services are already installed, then fills the self-host config from the recovered URLs, API keys, usernames, and ports instead of forcing a blank slate
   - if those providers are missing on a direct `npm run server:setup` run, it can hand off to the full Linux bootstrap so the installer can install them instead of silently continuing with empty defaults
   - self-host install links should come from a configured public HTTPS base URL (`PVTKRRX_PUBLIC_BASE_URL`) rather than a raw public `http://IP:port` origin
   - the installer prints a one-time `Configure` bootstrap URL with `#serverAdminToken=...` so the browser can load the saved self-host config automatically on first open
   - this is the independence path: after bootstrap, the runtime and config stay on the user's hardware and the hosted PVTKRRX site is no longer in the request path unless the user explicitly chooses the hosted relay
   - can install optional Linux `systemd` startup through `npm run server:setup` / `npm run server:install-service`
3. Local runtime on the Windows host:
   - serves `PC Local` manifests and config-backed addon routes
   - exposes built-in `/file` and `/playback` endpoints
   - provides local admin routes such as `/local-config`, `/auto-provision`, `/network-info`, `/local/qbit/preferences`, `/local/qbit/download-path`, and `/local/qbit/auto-extract`
   - reads completed files directly from the host download path when available
   - can mint short-lived Stremio link sessions for the disk-backed `local` config when the request comes from the same host
4. Electron desktop wrapper:
   - launches and packages the local runtime on Windows
   - shows the startup splash and desktop shell
   - reads the same `/version-status.json` release check so the popup can flag when the desktop EXE is behind GitHub Releases
   - performs startup checks, provider warm-up, and local auto-provision helpers
   - can register/unregister itself with Windows sign-in startup from the desktop shell
   - sends LAN pair heartbeat updates and Stremio launch pulses

## Current UX Model

- Hosted `/configure` keeps three route cards: `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- Desktop-local `/configure` on the Windows EXE now exposes only `PC Local` and `LAN Bridge`; `Remote Seedbox` belongs to the separate server/cloud runtime.
- The top of the page focuses on the next action for the selected route.
- Noisy fallback tools are hidden by default behind `Hidden Setup Tabs`.
- When explicit self-host server mode is active, `/configure` is now a server-only app surface: it exposes `Remote Seedbox` only, defaults there immediately, and exposes a browser-stored self-host password field for remote seedbox administration.
- Self-host server copy now explains the real contract: private/localhost backend URLs are allowed once the server password is authenticated, while only the browser-facing install origin still needs public HTTPS for Stremio.
- `/app-config.json` now also tells the shared configure UI when the runtime is desktop-local-only, so the shared page can hide the seedbox route inside the EXE without forking the whole UI.
- The advanced Stremio account tools now also expose a `Server Link Session` flow:
  - create a one-time session from the target runtime
  - copy a browser link or addon URL
  - let any signed-in Stremio browser/device session complete the proof
  - poll status until the runtime reports `install-seen` or `linked`
- Pasting the generated addon URL into Stremio is only a bootstrap step. It marks that the session was seen by Stremio, but the real account link still completes through browser-side AuthKey proof.
- The desktop popup now exposes only `PC Local` and `LAN Bridge`, and tells the user to install/sign in to Stremio on the host PC before using `LAN Bridge`.
- The desktop popup also exposes:
  - current runtime status
  - qBittorrent save-path controls
  - qBittorrent packed-release extraction-hook controls
  - Windows startup auto-launch control
  - runtime log copy/open actions
  - explicit `Minimize`, `Send To Tray`, and `Exit App` actions
- The configure page now mirrors that local-runtime visibility with a live qBittorrent status panel that shows the effective save path, incomplete path, fallback storage roots, and whether PVTKRRX currently manages the qBit completion hook.
- The current public landing page visual system is on-brand, but the copy still undersells the product compared with the README; keep the rewrite backlog in `docs/WEBSITE_STATUS.md`.
- The public homepage now shows a live release-status card driven by `/version-status.json`, and the Windows desktop shell shows the same release check in the popup.

## Public Host Truth Table

Verified on 2026-03-31:

- `https://www.pvtkrrx.cc/` returns the landing page (`200`)
- `https://www.pvtkrrx.cc/configure` returns the hosted configure UI (`200`)
- `https://www.pvtkrrx.cc/runbooks` returns the runbooks page (`200`)
- `https://www.pvtkrrx.cc/manifest.json` returns the bootstrap manifest (`200`)
- `https://www.pvtkrrx.cc/health` returns health JSON (`200`) or the health page when the client asks for HTML
- `https://www.pvtkrrx.cc/local/install` returns `403` from the public internet because it is a same-host/local-network helper route
- `https://pvtkrrx.vercel.app` is not canonical and returned Vercel `DEPLOYMENT_NOT_FOUND`

## Route Model

| Route | User | Install path | Playback path | Main rule |
|---|---|---|---|---|
| `PC Local` | Same Windows machine running PVTKRRX | `http://127.0.0.1:7000/local/manifest.json?mode=local` | Local `/file` (completed) and `/playback` (queue+buffer) routes | Same-PC only |
| `LAN Bridge` | Other home devices on the same Stremio account and LAN, including Apple TV | Hosted token manifest generated by configure | Hosted relay 307-redirects to the host's local runtime, so all PC Local playback capabilities apply after redirect; if the pair is offline, catalogs and streams fail closed while meta can still fall through to hosted metadata | Host desktop must stay running and heartbeating |
| `Remote Seedbox` | Away-from-home or public playback | Hosted token manifest on the public relay, or disk-backed `/selfhost/manifest.json?mode=hosted` on a self-hosted server | Public hosted relay uses external `fileServerUrl` or public qBit URLs for completed files only; self-hosted server mode can use built-in playback and private localhost service URLs once authenticated as the server admin | Ready-file-first on the public hosted relay; playback-capable when self-hosted on a suitable runtime |

All three routes expose the same catalog family: sports discovery catalogs first, then movies, TV, and library.
See `docs/ROUTE_FRAMEWORK.md` for the full per-route capability matrix including packed RAR releases and auth-protected file servers.

## Host Vs Home-Device Rule

- The Windows host desktop itself must use `PC Local` for browsing and playback.
- `LAN Bridge` is the same-account addon for the user's other home devices.
- If the host desktop browses the hosted `LAN Bridge` addon and sees `Failed to fetch`, that is a route-choice problem, not proof that the addon server is down.

## Content Model

- Top-level addon types are `movie`, `series`, and `sports`.
- Sports now uses its own top-level `sports` surface instead of being hidden under `movie`.
- Sports discovery is no longer one generic catalog plus broad sport-type genre filters. The sports surface now leads with an `All Sports` catalog followed by sport-family catalogs such as `Football`, `Motorsport`, `MMA`, `American Football`, and others, so sport selection happens in Stremio's type picker and catalog column first.
- Sport-family catalogs keep the third-column `genre` dropdown for narrower league/team-style filters such as `Premier League`, `Arsenal`, `Formula 1`, `UFC`, or `NBA`.
- Sports artwork can now carry four distinct assets from TheSportsDB:
  - `poster`
  - `landscapeImage`
  - `backgroundImage`
  - `logo`
- Sports catalog tiles now prefer real portrait poster art first when available, while `backgroundImage` and `logo` stay separate for player-loading and wallpaper use.
- When Prowlarr has no indexers or cannot be reached, empty movie, TV, and sports catalogs now return a setup-needed placeholder card instead of a blank grid, so the user gets a useful recovery cue in Stremio.
- When external sports art exists, addon responses now prefer signed `/image/sports/...` URLs so the active local or hosted runtime can cache poster, wallpaper, landscape, and logo bytes on disk instead of hotlinking every request back to the upstream art host.
- Sports detail meta now exposes Stremio `genres` tags from the resolved sport classification when available.
- Sports title parsing now handles both team-vs-team formats (`EPL.2026.03.15.Arsenal.vs.Chelsea`) and non-vs event formats (`Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying`, `UFC.Fight.Night.270.Main.Card`).
- Motorsport coverage now includes F1, MotoGP, NASCAR, IndyCar, WRC, Supercars/V8, WSBK, WEC, and Formula E.
- Darts and golf are now recognized as distinct sport categories.
- Sports catalog grouping uses structured event keys for both vs and non-vs titles, so different quality variants of the same event collapse into one tile.
- Sports detail pages now carry richer metadata: league, date, event name, sport type label, and multi-line descriptions instead of flat stat lines.
- Library and sports items use internal `pvtkrrx:` custom ids inside Stremio responses.
- Installed route manifests keep the plain addon name `PVTKRRX`; route identity now lives in the manifest `id` and description so Stremio source grouping stays consistent.
- There is no standalone `.pvtk` file format in this repository.

## Playback Model

- Hosted relay routes do not proxy video bytes.
- Hosted/local runtimes may proxy and cache sports artwork bytes through `/image/sports/...`; that image path is intentional and separate from the no-video-proxy rule.
- Hosted `/file` and `/playback` return 403 on the public hosted relay for non-local requests.
- `LAN Bridge` requests 307-redirect to the host's local runtime before hitting `/file` or `/playback`, so after redirect all local playback capabilities apply.
- Local `/file` serves bytes with HTTP Range support when the file is locally accessible on disk.
- Local progressive playback now waits for a safer initial readable buffer and keeps qBittorrent first+last piece priority enabled by default while a file is still incomplete, so Stremio can stay on the player page instead of bouncing back to source selection during early range probes.
- Local `/file` now also waits on the specific requested qBittorrent piece window for seek-like range probes, so footer/skip requests can return `206` as soon as that piece window is locally readable instead of timing out after the initial head buffer succeeds.
- Local `/file` can continue serving a known absolute local file path even after qBittorrent no longer reports the torrent row, as long as the file still exists on disk.
- Local `/playback` is the queued-download path for tracker content that is not yet ready. It fetches the `.torrent` payload, adds it to qBittorrent, and as soon as qBittorrent exposes the target file on a built-in playback-capable runtime it 302-redirects into `/file`, letting the shared file route hold the HTTP connection open while bytes arrive. When built-in buffering is not possible, `/playback` still waits for ready-file thresholds before redirecting.
- Completed-file playback correctly checks torrent completion state before redirecting into `/file`.
- Stream rows now expose emoji state badges (`⬇️` download-and-play, `⏳` buffering, `✅` downloaded, `📦` extracted), a visible origin badge (`[PC]` for host-PC playback or `[SERVER]` for remote/server playback), and a film-icon container badge (`🎬MKV`, `🎬MP4`, etc.) in the addon `name`. The description switches from `Download and play` to `Downloaded — ready to play` once the file is ready and also states whether the host PC or remote server is serving it.
- Packed RAR releases (`.rar/.r00/.r01/...`):
  - Official Stremio archive-source support is real: `rarUrls` is part of the addon/core contract and is routed through the client's local streaming server.
  - Completed archive sets now trigger background extraction on the host when the archive volumes are locally reachable.
  - If extraction has already finished, PVTKRRX prefers the extracted direct video file for playback.
  - When the local runtime enables the qBittorrent completion hook, qBit only calls back into PVTKRRX after completion; PVTKRRX remains the single extraction owner.
  - If extraction is still running or unavailable, the packed source stays hidden by default instead of being advertised as normal playback.
  - Native `rarUrls` emission is now an explicit manual-testing override (`PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true`), not part of the supported default playback contract.
  - Emitting `rarUrls` still means the addon is using the official archive payload shape; it does not count as end-to-end real-client sign-off for PVTKRRX archive playback.
  - Incomplete archive sets are suppressed — no stream is offered until every volume is 100% ready.
  - Packed-only tracker sources are suppressed at stream emission time before `/playback` is ever reached.
  - `/playback` fails fast with a truthful packed-archive message if a packed torrent is already in qBit but not yet complete.
  - The addon still sets `behaviorHints.sourceContainer = 'rar'` as a repo-local hint, but that field is not part of the official Stremio archive contract and should not be used as proof that clients honor the stream.
- External `fileServerUrl` is optional. It is required for `Remote Seedbox` completed-file playback on the public hosted relay but not needed for `PC Local`, `LAN Bridge`, or self-hosted server runtimes that can read files directly and serve `/file` / `/playback`.
- When `fileServerAuth` is configured, `proxyHeaders` with Basic Auth are added to seedbox and buffering stream URLs. Tracker `/playback` is suppressed on non-local routes because Stremio cannot forward auth headers through a redirect chain.
- Remote buffering URLs are emitted only when the current file path is provable from live torrent state.
- See `docs/ROUTE_FRAMEWORK.md` for the full per-route capability matrix.

## Desktop Startup Model

- On every cold boot, the splash window opens before the main desktop shell.
- The splash is pinned `alwaysOnTop`, brought to the front, and kept visible for a minimum startup window before the main shell replaces it.
- The desktop shell starts hidden and only appears after the local runtime is reachable.
- Closing the main desktop shell now hides it to the Windows system tray unless the user explicitly exits.
- The tray exposes restore/open/exit behavior so the local runtime can keep serving while the window is hidden intentionally.
- The desktop shell can also toggle Windows sign-in startup on/off without leaving the app.
- When Windows launches PVTKRRX from sign-in startup, the runtime now stays hidden in the system tray instead of opening the main window immediately.
- The desktop wrapper now starts a Windows power blocker by default (`prevent-app-suspension`) so the host can stay alive through lock-screen and display-off states while serving local/LAN traffic.
- Startup still runs:
  - local server boot
  - provider warm-up
  - automatic host-side Stremio session scan and account-link reuse when a signed-in desktop session is present
  - firewall/Bonjour checks
  - LAN pair heartbeat startup pulse
  - Stremio launch watch
- The desktop wrapper also logs `lock-screen`, `unlock-screen`, `suspend`, and `resume`, and sends a fresh LAN heartbeat on unlock/resume.

## Heartbeat Model

- `LAN Bridge` heartbeat is not a rapid fixed loop anymore.
- The current behavior is:
  - send a startup pulse
  - send a pulse when Stremio launches on the host
  - send a periodic background heartbeat on the long interval configured by `PVTKRRX_LAN_PAIR_HEARTBEAT_MS` (default 12 minutes)

## Build Model

- `npm run dist:win` now builds Windows packages in the system temp directory first.
- After a successful build, artifacts are copied back into `dist/` and archived into `dist/releases/<version>/`.
- This avoids the `rcedit` metadata-write failure that can happen when building directly inside the OneDrive-backed repo output folder.

## Security Rules

- Local admin routes are local-network or loopback only.
- Hosted sensitive routes use the browser-origin allowlist.
- Hosted `/test-connection` is rate limited and only allows public HTTP/HTTPS targets.
- `/pair/status` returns chosen endpoint metadata only to callers that present both `pairId` and `pairKey`.
- Stremio link sessions are short-lived, random server-issued tokens; Stremio install hits can mark them as `install-seen`, but account linking still requires a verified AuthKey proof before PVTKRRX stores linked identity.

## Design Rules

1. Raw `http://192.168.x.x:7000/...` addon installs are not a supported primary Stremio install path.
2. `PC Local` is the only supported same-PC install route.
3. `LAN Bridge` is the supported home-device route and depends on the host desktop app remaining online.
4. Hosted LAN-pair installs must be refreshable because stale installed tokens can point at old pair state or old route behavior.
5. Root `/manifest.json` must remain a bootstrap manifest, not a real catalog-bearing route manifest.
6. The repo contains historical planning docs from February 2026; they are useful for project history, not as the live architecture.
7. Use `https://www.pvtkrrx.cc` as the canonical hosted base; the old `https://pvtkrrx.vercel.app` hostname is not part of the supported install surface.
8. If the goal is to keep PVTKRRX out of the request path after setup, use explicit self-hosted server mode and a user-owned HTTPS origin.

## Documentation Canon

Use these as the live set:

- `README.md` for user-facing setup
- `ARCHITECTURE.md` for runtime/component structure
- `docs/CURRENT_DESIGN.md` for canonical current behavior
- `docs/ROUTE_FRAMEWORK.md` for install-route rules
- `docs/STREMIO_INSTALL_TRACKER.md` for verified Stremio client behavior
- `docs/LAN_BRIDGE_PROCESS.md` for LAN Bridge pairing, heartbeat, and troubleshooting
- `docs/PROJECT_STATUS.md` for current verification and release state
- `docs/WEBSITE_STATUS.md` for current public route checks and homepage/content backlog

The following files are planning/history records and should be read as archival context unless a section explicitly says otherwise:

- `docs/CLIENT_DRIVERS.md`
- `docs/COMMERCIAL_SPEC.md`
- `docs/PRESTART_OUTCOME.md`
- `docs/PRODUCTION_SPEC.md`
- `docs/PROGRAMME.md`
- `docs/SCOPE_OF_WORKS.md`
- `docs/TECHNICAL_SPEC.md`
