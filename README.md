# PVTKRRX

**Connect your private tracker seedbox to Stremio. No debrid. No third-party media host. Your hardware, your trackers.**

The self-hosted runtime is the independence path: install once, then the app runs from your own hardware and does not need PVTKRRX in the request path afterward.

## What This Does

PVTKRRX is a Stremio addon that bridges your existing seedbox infrastructure into Stremio. You configure it with your own:

- **Prowlarr URL + API key** — searches your private trackers
- **qBittorrent WebUI URL** — manages downloads and streams your library

The addon handles: search → download → stream. PVTKRRX has a **built-in file server** for playback-capable runtimes, while the public hosted `Remote Seedbox` route expects public ready-file playback endpoints.

Hosted `Test Connection` checks are intentionally limited to public HTTP/HTTPS endpoints. Self-hosted server mode is different: the server can store a disk-backed `selfhost` config locally, reuse it on boot, and validate localhost/private service URLs once you authenticate as the server admin.

## Key Features

- **Sports** — Browse and search private tracker sports content (EPL, F1, UFC) directly in Stremio
- **Sports-first discovery** — `All Sports` plus sport-family catalogs now lead the movie discovery column, with the third-column filter used for league/team detail
- **Sports artwork enrichment** — Optional TheSportsDB poster, landscape, background, and logo artwork with cache-aware lookups plus on-demand disk-backed image caching on the active runtime; sports catalog tiles now prefer portrait poster art while keeping separate background/logo loading art
- **Movies & TV** — IMDb-matched content from your private trackers
- **Seedbox Library** — Browse everything already downloaded on your seedbox
- **Smart filtering** — Sports indexers never contaminate movie/TV searches
- **Hosted tokens stay encrypted** — Hosted configs are AES-256-GCM encrypted in addon URLs; local installs save config only on the host PC runtime
- **No debrid needed** — Your seedbox IS the streaming server
- **Self-hosted runtime** - install on your own hardware and keep operating without our infrastructure in the middle after setup

- **Desktop host controls** - The Windows shell now exposes qBit save-path visibility, packed-release extraction-hook control, tray restore, minimize, explicit exit, and Windows sign-in auto-launch

## Route Framework

PVTKRRX is one runtime with three install routes:

- **PC Local** — Real same-PC addon for the Windows host running PVTKRRX. Installs from the copied `127.0.0.1` URL and exposes movies, TV, sports, and library on that machine.
- **LAN Bridge** — Home-network route for your phone, TV, web, and Apple TV on the same Stremio account. Primary install uses the hosted `stremio://...` LAN Bridge link, while the plain hosted `https://.../manifest.json` value is manual fallback only if Stremio explicitly asks for an addon URL.
- **Remote Seedbox** — Public HTTPS route for away-from-home or seedbox-first playback. Requires public qBittorrent, Prowlarr, and file serving endpoints, and is ready-file-first on the hosted relay unless you self-host playback support.

The packaged Windows EXE now exposes only the Windows-local routes: `PC Local` and `LAN Bridge`. `Remote Seedbox` now belongs to the hosted/self-host server surfaces instead of the desktop app.

See [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) for the canonical current design, [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) for the route model, and [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) for current client install behavior.
See [docs/LAN_BRIDGE_PROCESS.md](docs/LAN_BRIDGE_PROCESS.md) for the exact LAN Bridge lifecycle, pair generation rules, and empty-content troubleshooting.

## What's Working

| Feature | Status |
|---------|--------|
| Sports discovery catalogs (All Sports, Football, Motorsport, MMA, etc.) | Working |
| Sports artwork enrichment | Working (portrait posters + sport-aware backdrops preferred when TheSportsDB provides them; sports meta also carries Stremio loading-screen background + logo artwork when available, and local/hosted runtimes now serve cached sports image URLs instead of hotlinking every request) |
| Movie/TV streams from private trackers | Working |
| Sports contamination filter | Working (SportsCult excluded from movie searches) |
| Already-downloaded files | Working (built-in file server with Range support) |
| Packed RAR scene releases already added to qBittorrent | Implemented with truthful direct-play behavior: partial multi-volume playback stays suppressed, completed bundles stay hidden until the host prepares an extracted direct video, and native `rarUrls` is now opt-in experimental only |
| On-tracker download + play | Working on playback-capable routes (PC Local, LAN Bridge via local redirect, or self-hosted runtime) |
| Local + Hosted install modes | Working |
| Hosted LAN pair mode (Android TV/mobile) | Implemented (requires relay config) |
| Windows desktop startup shell | Working and verified on Windows (frontmost splash + route-aware popup on normal boot, optional Windows sign-in auto-launch hidden in tray) |
| Windows packaged build | Working (`npm run dist:win` now rebuilds `dist/` and `dist/releases/<version>/`) |

## Current Project Status

See [docs/WEBSITE_STATUS.md](docs/WEBSITE_STATUS.md) for the current public-site truth table plus homepage rewrite backlog.
See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the authoritative current stage, active worktree items, and deployment checklist. See [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) for the live architecture and [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) for route-specific install/playback rules.

## Documentation Guide

Use these files as the live documentation set:

- [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) — canonical current behavior
- [ARCHITECTURE.md](ARCHITECTURE.md) — component/runtime structure
- [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) — route selection and install rules
- [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) — verified Stremio client truth table
- [docs/LAN_BRIDGE_PROCESS.md](docs/LAN_BRIDGE_PROCESS.md) — LAN Bridge setup, pairing, heartbeat, and troubleshooting
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — current verification and deployment status

- [docs/WEBSITE_STATUS.md](docs/WEBSITE_STATUS.md) - public route health, canonical host notes, and homepage/content backlog
The February 2026 planning docs under `docs/` are kept as project history and are now marked as historical where they no longer describe the live runtime.

## Quick Start

If you want the app to be independent from PVTKRRX after setup, use the self-host path below. The hosted bootstrap is optional convenience, not the default contract.

### Optional Hosted Bootstrap

Visit **[www.pvtkrrx.cc](https://www.pvtkrrx.cc)** if you want the hosted launcher or relay.
Use the canonical hosted base only for bootstrap and hosted relay flows: `https://www.pvtkrrx.cc`.
Do not use the old preview host `https://pvtkrrx.vercel.app`; on 2026-03-31 it returned Vercel `DEPLOYMENT_NOT_FOUND`.
Hosted install links should resolve under `https://www.pvtkrrx.cc/{token}/manifest.json?...`.
For `LAN Bridge`, the primary install action should start with `stremio://`; the hosted HTTPS manifest is manual fallback only when Stremio shows an `Add Addon URL` box.

### Self-Host on Your Own Hardware

```bash
curl -fsSL https://www.pvtkrrx.cc/install-selfhost.sh | sudo bash
```

That launcher comes from the canonical hosted site. The installer pulls the branch payload by default, and if a pinned release is too old to include the self-host bootstrap script it falls back to `main` instead of crashing on a missing file.

The Linux installer now bootstraps a dedicated self-host server in one flow:
- downloads the app into `/opt/pvtkrrx` by default
- installs a bundled Node runtime under `/opt/pvtkrrx/.node`
- installs production dependencies
- auto-discovers existing Prowlarr/qBittorrent configs when they are already installed, then prompts only for the values it cannot recover
- configures qBittorrent for localhost addon access when it has to stand up the service itself
- if Prowlarr or qBittorrent are missing on a direct `npm run server:setup` run, it can offer to hand off to the full bootstrap and install them automatically
- pulls the app source from the branch payload by default, with an automatic retry from `main` if a pinned release is too old to include `scripts/server-installer.js`
- can be pinned to a specific release with `PVTKRRX_RELEASE_TAG` or pointed at a Contabo-hosted release manifest with `PVTKRRX_RELEASE_MANIFEST_URL`
- prompts for your public HTTPS base URL plus any remaining seedbox connection details
- writes `.env` with `ENCRYPTION_SECRET`, `AUTH_TOKEN_SECRET`, `PVTKRRX_SELF_HOST_MODE=true`, `PVTKRRX_RUNTIME_DIR`, and `PVTKRRX_PUBLIC_BASE_URL`
- saves the disk-backed self-host config into the runtime directory
- creates the server admin token file
- can install/start a Linux `systemd` service for auto-boot
- prints a one-time `Configure` bootstrap URL with `#serverAdminToken=...` so the first browser open can load the saved self-host config automatically

After this first install, the runtime is yours. The hosted site is only the download/bootstrap source.

If you are already inside a checked-out repo on the server, run the same installer directly:

```bash
npm run server:setup
```

The self-hosted server route keeps a stable disk-backed manifest at `/selfhost/manifest.json?mode=hosted`.
Open `/configure` in a browser to review or edit the saved config at any time.
For remote Stremio installs, give the installer a real public `https://` origin. Raw public `http://IP:7000/...` addon URLs are not a valid self-host install target for Stremio.

On a self-hosted server, `/configure` is now the server app only:
- **Remote Seedbox** is the only route exposed there
- **PC Local** and **LAN Bridge** stay in the Windows desktop runtime
- the server can keep its config on disk and use private/localhost backend URLs after server-admin authentication
- only the browser-facing install origin still needs a real public `https://` hostname for Stremio

When using `LAN Bridge` on Windows, install and sign into Stremio Desktop on the host PC first. On boot, the local runtime now scans the host Stremio Desktop WebView2 session automatically and links that account into startup auto-provision when a signed-in session is present. The configure page still exposes the host check as a manual fallback.

Auto Setup also attempts to:
- install/start Prowlarr and qBittorrent (Windows, via winget + service/process start)
- disable qBittorrent localhost auth for zero-config local API access
- open Windows Firewall ports `7000/7001` and UDP `5353` for LAN devices

Windows desktop install/startup now also re-checks those LAN firewall rules automatically on each boot.
When you open the configure page on the Windows host runtime, it now also shows the live qBittorrent save path, incomplete path, fallback storage roots, and whether PVTKRRX currently manages the qBit completion hook for packed-release extraction.
The desktop shell also has a Windows startup toggle so PVTKRRX can launch automatically after sign-in, start hidden in the tray, and keep the local runtime online without a manual app open.
A 2026-03-31 real-device pass also confirmed the current Windows host flow plus Apple TV LAN Bridge playback while the Windows PC stayed locked; playback started normally, the client reported the video as local, and forward/back seek worked.

## Requirements

Your seedbox needs:
1. **Prowlarr** with private trackers configured
2. **qBittorrent** with WebUI enabled

That is enough for `PC Local` and `LAN Bridge`, where the local runtime can read files directly from qBittorrent's download directory with the built-in file server.

> `Remote Seedbox` is different: the public hosted route needs a public HTTPS file-serving path for completed-file playback. Leave `File Server URL` blank only for local playback-capable routes or self-hosted runtimes that can actually serve `/file` and `/playback`.

## Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Prowlarr URL | Yes | e.g. `http://seedbox.example.com:9696` |
| Prowlarr API Key | Yes | Found in Prowlarr → Settings → General |
| TheSportsDB API Key | No | Defaults to free key `123`; add your own key for higher limits |
| TheSportsDB Cache (hours) | No | How long sports artwork lookups are reused before refresh. Sports image bytes are also cached on demand by the active runtime |
| qBittorrent URL | Yes | e.g. `http://seedbox.example.com:8080` |
| qBittorrent Username | Yes | qBit WebUI credentials |
| qBittorrent Password | Yes | qBit WebUI credentials |
| File Server URL | No | External HTTP server URL. Leave blank only for local playback-capable routes or self-hosted runtimes that can serve files directly |
| Path Mapping | No | Only if using external file server with different paths |

## How It Works

```
Your Stremio App
        ↓
PVTKRRX route selected in configure
   ├── PC Local      → local runtime on the Windows host
   ├── LAN Bridge    → hosted relay resolves active LAN host, then redirects
   └── Remote Seedbox → hosted route with public ready-file playback endpoints

Back-end services used by the chosen route:
   ├── Prowlarr search
   ├── qBittorrent WebUI
   ├── Optional external file server
   └── Optional TheSportsDB artwork enrichment + on-demand sports image cache
```

Hosted configs are AES-256-GCM encrypted into addon tokens. Local installs save their working config inside the runtime folder, and explicit self-hosted server installs reuse that disk-backed config through `/selfhost/manifest.json?mode=hosted` after every reboot. Hosted relay/account state can be persisted in KV-backed storage when enabled.
Playback/file state links are also issued as opaque encrypted tokens (instead of plain base64 JSON), so tracker endpoints and file hints are not directly readable from stream URLs.
Hosted relay routes do not proxy video bytes, and hosted `/file` or `/playback` requests fail fast when playback still depends on the local runtime.

### Stream Types

PVTKRRX stream rows now show a visible source badge plus explicit state + format badges in the stream `name`: `PVTKRRX ✅ [PC] ...` for host-PC playback and `PVTKRRX ✅ [SERVER] ...` for remote/server playback, plus the detected container such as `🎬MKV` or `🎬MP4`. The description also switches from `Download and play` / `Buffering` to `Downloaded` once the file is actually ready and now states whether the host PC or remote server is serving it.

**⚡ On Seedbox** — File is already downloaded. Plays immediately.

**📥 Available** — File is on a private tracker. PC Local and LAN Bridge can use local `/playback` queue-and-buffer behavior. Hosted Remote Seedbox does not expose dead tracker `/playback` links and is effectively ready-file playback unless you run a playback-capable self-hosted runtime.

**[INFO] Remote notice** — Hosted Remote Seedbox can append an explanation row when direct queue-and-buffer is hidden to protect your file-server login or when qBittorrent has not exposed enough live file info for a safe buffer URL yet.

**Packed RAR scene release** — If a tracker source is a multi-part RAR release (`.rar`, `.r00`, `.r01`, ...), the first click can still queue the torrent, but PVTKRRX no longer pretends that partial archive playback will work. Real Stremio clients can fail with `liberror` on incomplete multi-volume archives, so PVTKRRX suppresses live tracker playback for packed-only torrents and fails fast on `/playback` with a truthful message after queueing the download. Once qBittorrent has the full archive set, the host now starts background extraction for broader device compatibility and only treats the extracted direct video as supported playback. Until that extracted direct-play file is ready, the packed source stays hidden instead of being advertised as normal playback.

Official Stremio SDK/core docs do support `rarUrls` archive sources, routed through the client's local streaming server. PVTKRRX keeps that tuple-based payload path behind `PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true` for manual testing, but the supported default is now extracted direct video only until a real PVTKRRX client pass proves the native archive path end to end.

## Verify Stremio Config Flow

Run this smoke check to validate the configuration page, token encryption, and install manifest routes:

```bash
npm run smoke:config
```

This verifies:
- `/configure` loads
- `POST /encrypt` returns a token
- `/:token/manifest.json` resolves
- local `PC Local` manifest/profile routes resolve
- `/:token/configure` resolves
- Invalid token routes return `400`

Hosted runtime/security guard smoke check:

```bash
npm run smoke:guards
```

This validates:
- hosted `/playback` fails fast instead of waiting for local buffering
- hosted remote stream responses suppress dead tracker `/playback` flows
- remote direct `/test-connection` calls are rejected
- hosted `/test-connection` refuses loopback/LAN targets
- local configure can still test loopback targets

Security hardening regression smoke check:

```bash
npm run smoke:security
```

This validates:
- config readback and server-side logs redact stored secrets, URLs, paths, and auth identifiers
- spoofed `Host` / `X-Forwarded-For` headers do not unlock local-only routes
- hosted `/test-connection` blocks rebinding-style `nip.io` / `lvh.me` targets
- `/pair/status` omits private endpoint metadata, and the auth-user surface stays off billing internals (the auth-model shape check is code-reviewed rather than a full authenticated round-trip)
- legacy plain playback/file tokens are rejected
- secure JSON storage stays read-legacy/write-secure and fails closed on writes without a configured secret

Self-hosted server smoke check:

```bash
npm run smoke:selfhost
```

This validates:
- explicit self-host server mode advertises `/selfhost`
- remote self-host admin requests need the server admin token
- same-host self-host runtime can save disk-backed server config and read it back
- remote/browser-driven Stremio link sessions can persist a linked `stremioUserId` into the disk-backed self-host config
- `/selfhost/manifest.json?mode=hosted` resolves with no-store caching

Provider discovery smoke check:

```bash
npm run smoke:provider-discovery
```

This validates:
- existing Prowlarr `config.xml` discovery
- existing qBittorrent config discovery
- auto-filled URL/API key/username/save-path values from the recovered provider configs

Route-capability stream pipeline smoke check:

```bash
npm run smoke:pipeline
```

This validates:
- hosted `Remote Seedbox` suppresses dead tracker `/playback` streams at stream emission time
- remote tracker/download flows are suppressed when `fileServerAuth` would be lost on redirect
- remote buffering URLs are suppressed unless the current file path is provable from live torrent state
- local playback-capable routes still emit the expected `/playback` and `/file` flows

LAN pair + TV-hosted redirect smoke check:

```bash
npm run smoke:lan-pair
```

This validates:
- pair heartbeat/status flow
- hosted (non-loopback) requests 307-redirect to active LAN endpoint
- required-pair offline fallback behavior
- opaque playback token format is not plain decodable JSON

Stremio AuthKey linking smoke check (uses a local mock Stremio API):

```bash
npm run smoke:stremio-link
```

This now validates the server-agnostic link-session flow as well:
- the server can create a short-lived `/auth/stremio/link-session`
- the generated addon URL marks the session as `install-seen` when Stremio fetches the manifest
- the browser-side AuthKey proof completes the link without exposing a Stremio password to the server
- token-backed configs receive a refreshed linked install URL that omits the one-time session token after completion

## Deployment

### Hosted Production

Use the canonical hosted base: `https://www.pvtkrrx.cc`.
As of 2026-03-31, `https://www.pvtkrrx.cc/`, `/configure`, `/runbooks`, `/manifest.json`, and `/health` all responded from the live public host, while the old `https://pvtkrrx.vercel.app` preview returned `DEPLOYMENT_NOT_FOUND`.
Production updates are deployed from the synced GitHub branch and must preserve the active `ENCRYPTION_SECRET`.

### Self-Host
```bash
ENCRYPTION_SECRET=your-secret-here npm start
```

### Windows Build

```bash
npm run dist:win
```

This now builds in the system temp directory first, then copies the finished current-version artifacts back into `dist/` and `dist/releases/<version>/`. That avoids the Windows `rcedit` failure we were hitting when building directly inside the OneDrive-backed repo output folder.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| ENCRYPTION_SECRET | Yes | Key for encrypting/decrypting user configs |
| AUTH_TOKEN_SECRET | Recommended | Key for signing account auth tokens (falls back to ENCRYPTION_SECRET) |
| PVTKRRX_RUNTIME_DIR | Recommended for self-host | Stable runtime/config directory. The server installer now defaults this to `<repo>/data/pvtkrrx` so saved config and admin-token state do not depend on whichever user launched the process |
| PVTKRRX_PUBLIC_BASE_URL | Recommended for self-host | Public `https://` origin used when generating self-host install/config links. Set this to the real reverse-proxied host you want Stremio and browsers to use |
| KV_REST_API_URL | Recommended | Persist LAN pair heartbeat state for the hosted relay across restarts/redeploys |
| KV_REST_API_TOKEN | Recommended | Auth token for KV REST API |
| PVTKRRX_PAIR_RELAY_URL | Optional | Hosted relay base URL (default https://www.pvtkrrx.cc) |
| PVTKRRX_LAN_PAIR_TTL_SECONDS | Optional | Pair record TTL (default 21600) |
| PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP | Optional | Bind hosted pair redirects to heartbeat source network (default false) |
| PVTKRRX_LAN_PAIR_LOCK_HOST | Optional | Reject heartbeat takeover attempts from a different active host IP (default true) |
| PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS | Optional | Pair API rate-limit window in ms (default 60000) |
| PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW | Optional | Max heartbeat calls per window (default 30) |
| PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW | Optional | Max status calls per window (default 60) |
| PVTKRRX_ENCRYPT_MAX_PER_WINDOW | Optional | Max `/encrypt` requests per window (default 30) |
| PVTKRRX_TEST_CONNECTION_MAX_PER_WINDOW | Optional | Max `/test-connection` requests per window (default 20) |
| PVTKRRX_AUTH_MAX_PER_WINDOW | Optional | Max Stremio AuthKey link requests per window (default 20) |
| PVTKRRX_PROWLARR_CACHE_MS | Optional | Catalog search cache TTL in ms (default 120000) |
| PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS | Optional | Timeout for catalog Prowlarr search calls in ms (default 7000) |
| PVTKRRX_PROWLARR_CACHE_MAX_KEYS | Optional | Max in-memory cached catalog search keys (default 500) |
| PVTKRRX_QBIT_TIMEOUT_MS | Optional | Timeout for qBittorrent API calls in ms (default 12000) |
| PVTKRRX_SPORTS_CATALOG_CACHE_MAX_AGE | Optional | Sports catalog response cache max-age seconds (default 600) |
| PVTKRRX_STREAM_UPSTREAM_TIMEOUT_MS | Optional | Timeout for stream route upstream calls (Prowlarr/qBit/Cinemeta), default 7000 |
| PVTKRRX_STREAM_TITLE_FALLBACK_TIMEOUT_MS | Optional | Timeout for stream title-fallback Prowlarr call, default 5000 |
| PVTKRRX_STREAM_MAX_CANDIDATES | Optional | Max stream candidates to process per request (default 20) |
| STREAM_READY_START_PERCENT | Optional | Fraction of a file that must be locally readable before playback is considered ready for direct file-server redirects (default `0.5%`) |
| STREAM_READY_MIN_BYTES | Optional | Minimum readable head buffer required before playback is considered ready for direct file-server redirects (default `24MB`) |
| STREAM_PRIORITIZE_LAST_PIECES | Optional | Keep qBittorrent first+last piece priority enabled for incomplete playback so Stremio footer/range probes do not bounce back to source selection (default true) |
| PVTKRRX_STREMIO_API_BASE_URL | Optional | Stremio API base URL for AuthKey verification (default https://api.strem.io) |
| PVTKRRX_STREMIO_API_TIMEOUT_MS | Optional | Timeout for Stremio AuthKey verification calls (default 10000) |
| PVTKRRX_STREMIO_LINK_SESSION_TTL_SECONDS | Optional | TTL for one-time Stremio server link sessions in seconds (default 900) |
| PVTKRRX_OPAQUE_STATE_SECRET | Optional | Secret for stream/file opaque state tokens (defaults to `ENCRYPTION_SECRET`) |
| PVTKRRX_PLAYBACK_STATE_TTL_SECONDS | Optional | TTL for `/playback/:info` opaque tokens in seconds (default 86400) |
| PVTKRRX_FILE_STATE_TTL_SECONDS | Optional | TTL for `/file/:info` opaque tokens in seconds (default 86400) |
| PVTKRRX_EXPERIMENTAL_RAR_STREAMS | Optional | Opt in to emitting native `rarUrls` archive streams for manual testing; default supported behavior keeps packed releases hidden until extracted direct video is ready |
| PVTKRRX_FREE_MODE | Optional | Reserved for future billing rollout. Access is currently forced free in server code. |
| PVTKRRX_REQUIRE_ACTIVE_SUBSCRIPTION | Optional | Reserved for future billing rollout. Currently ignored while free mode is forced. |
| PVTKRRX_TRIAL_ENABLED | Optional | Allow free trial access before paid subscription is required (default true) |
| PVTKRRX_TRIAL_DAYS | Optional | Free trial length in days for linked accounts (default 3) |
| PVTKRRX_TRIAL_REQUIRE_LINKED_ACCOUNT | Optional | Require Stremio account linking to start trial (default true) |
| PVTKRRX_ALLOWED_WEB_ORIGINS | Optional | Comma-separated trusted browser origins for sensitive API routes |
| PVTKRRX_POWER_BLOCKER_MODE | Optional | Desktop host power policy: `prevent-app-suspension` (default), `prevent-display-sleep`, or `off` |
| PVTKRRX_STREMIO_LAUNCH_WATCH_ENABLED | Optional | Send immediate pair heartbeat when local Stremio process launches (default true) |
| PVTKRRX_STREMIO_LAUNCH_POLL_MS | Optional | Poll interval for Stremio process detection in ms (default 10000) |

## Stremio Account Link

Configure page now supports optional Stremio AuthKey linking:
- POST `/auth/stremio/link-authkey` verifies AuthKey via Stremio `/api/getUser`
- PVTKRRX stores only a hash of the AuthKey and links config tokens to `accountUserId`
- deterministic LAN pair id is derived from Stremio user id when linking in local mode
- GET `/auth/me` returns linked account profile from bearer token
- addon access is currently free for all users
- billing/trial env flags are kept for future rollout but are not enforced right now

The configure page and server API now also support a short-lived one-time link-session flow that works across machines:
- POST `/auth/stremio/link-session` creates a temporary link session for either a hosted token config or a disk-backed `local` / `selfhost` config
- the response includes a browser link plus an addon URL that can be pasted into Stremio locally on any signed-in device
- Stremio opening that addon URL only proves "this install saw the session" and marks the session as `install-seen`
- the actual account link still completes in browser context when the user reuses an existing Stremio session or runs the existing `Login + Fetch AuthKey` helper
- for disk-backed configs, completing the link persists `stremioUserId` into the saved config
- for hosted token configs, completing the link returns a refreshed linked addon/config token instead of mutating server disk state

Practical answer to "can I set this up on my PC and use the same Stremio login on the cloud?": yes, if your local signed-in device completes the one-time browser/AuthKey proof against the cloud server. No raw Stremio password needs to live on the cloud host.

## Troubleshooting

### Black screen when playing a downloaded file

1. In the Stremio player click `⋯ -> Copy stream link`
2. Paste it somewhere to inspect the URL
3. `/{token}/file/...` means built-in serving; external host/path means external file server serving
4. If it still points to an old external host, go to `http://localhost:7000/configure`, clear File Server URL, and save local config
5. Runtime now auto-prefers built-in `/file/` whenever the addon can read the file locally

### Android TV / mobile cannot reach addon

1. In local mode, use **Method 4 - Mobile/TV via Hosted LAN Pair** from configure page
2. Ensure the desktop app is running on the host PC (heartbeat keeps pair active silently)
3. Ensure TV/phone and PC are on the same network
4. Desktop app should auto-ensure inbound TCP `7000/7001` + UDP `5353` on install/startup; if Windows still blocks it, run the installed app once as Administrator
5. If pair shows offline in configure page, restart the desktop app and re-check pair status; the host page now asks the relay directly instead of guessing from stale local state
6. If the relay rejects a stale `lanPairId`/`lanPairKey` combo, the desktop app now repairs the local LAN identity automatically; after that, refresh `LAN Bridge` once in Stremio on the other home devices
7. The current desktop build starts a Windows power blocker by default so the host can stay alive through lock-screen and display-off states; if the host still vanishes, check that Windows is not forcing full sleep or hibernate from the power plan

### Host PC desktop shows `Failed to fetch` on LAN Bridge

1. On the Windows host itself, use `PC Local` via `http://127.0.0.1:7000/local/manifest.json?mode=local`
2. Treat `LAN Bridge` as the synced addon for your other home devices on the same account and LAN
3. If Stremio Desktop on the host PC is currently browsing the hosted `LAN Bridge` addon, install `PC Local` as well and use that route on this machine
4. Keep the desktop app running so `LAN Bridge` stays alive for phone, TV, and web clients

### Apple TV does not show addon URL/configure controls

1. Install/configure PVTKRRX from Stremio Web or desktop first (same Stremio account as Apple TV).
2. Use Method 4 hosted LAN pair URL from `http://localhost:7000/configure`.
3. Reopen Stremio on Apple TV and let account addon sync complete.
4. If addon list is stale, sign out/in on Apple TV and relaunch the app.
5. Treat Apple TV as a synced playback client; do first-time addon setup on web/desktop.

Current verified behavior on 2026-03-31: once installed on web/desktop first, Apple TV synced playback worked through LAN Bridge while the Windows host stayed locked, with forward/back seek working and the player recognizing the stream as local.


### Install URL protocol rules (important)

Stremio addon install URLs are HTTPS-first, with only one HTTP exception:
- `http://127.0.0.1/...` (same machine loopback)

Practical result:
- `http://127.0.0.1:7000/local/manifest.json?mode=local` works on the same PC.
- `http://192.168.x.x:7000/...` may open in browser but still fail in Stremio install flow.

Track current verified behavior in:
- `docs/STREMIO_INSTALL_TRACKER.md`
- `docs/ROUTE_FRAMEWORK.md`

### PVTKRRX not appearing in stream dropdown

Usually means all search results got filtered (good — stops sports content showing for movies).

- Check server console: `[stream]` log lines show result counts before and after filtering
- If 0 results after filtering, the title fallback search also ran — check that too
- Confirm Prowlarr indexers are working: test connection in configure page

### Sports content appearing in movie searches

Should not happen — the filter chain explicitly blocks sports-only indexers and uses title matching.

If it does appear, check server console for `[stream] Title filter removed` lines. If the filter isn't running, the Cinemeta lookup may have failed (movie title unavailable).

## License

Source Available — free for personal use. Commercial use restricted.
