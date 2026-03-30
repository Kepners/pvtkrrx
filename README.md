# PVTKRRX

**Connect your private tracker seedbox to Stremio. No debrid. No third-party media host. Your hardware, your trackers.**

## What This Does

PVTKRRX is a Stremio addon that bridges your existing seedbox infrastructure into Stremio. You configure it with your own:

- **Prowlarr URL + API key** — searches your private trackers
- **qBittorrent WebUI URL** — manages downloads and streams your library

The addon handles: search → download → stream. PVTKRRX has a **built-in file server** for playback-capable local routes, while hosted `Remote Seedbox` expects public ready-file playback endpoints.

Hosted `Test Connection` checks are intentionally limited to public HTTP/HTTPS endpoints. If you want to validate loopback or LAN-only service URLs such as `http://127.0.0.1:9696`, use the local configure page on the Windows host runtime instead of the hosted site.

## Key Features

- **Sports** — Browse and search private tracker sports content (EPL, F1, UFC) directly in Stremio
- **Sports-first discovery** — `All Sports` plus sport-family catalogs now lead the movie discovery column, with the third-column filter used for league/team detail
- **Sports artwork enrichment** — Optional TheSportsDB portrait, landscape, and background artwork with cache-aware lookups; sports catalog tiles now prefer landscape art when available
- **Movies & TV** — IMDb-matched content from your private trackers
- **Seedbox Library** — Browse everything already downloaded on your seedbox
- **Smart filtering** — Sports indexers never contaminate movie/TV searches
- **Hosted tokens stay encrypted** — Hosted configs are AES-256-GCM encrypted in addon URLs; local installs save config only on the host PC runtime
- **No debrid needed** — Your seedbox IS the streaming server
- **Free hosted option** — Canonical hosted setup is available at `https://www.pvtkrrx.cc`

## Route Framework

PVTKRRX is one runtime with three install routes:

- **PC Local** — Real same-PC addon for the Windows host running PVTKRRX. Installs from the copied `127.0.0.1` URL and exposes movies, TV, sports, and library on that machine.
- **LAN Bridge** — Home-network route for your phone, TV, web, and Apple TV on the same Stremio account. Primary install uses the hosted `stremio://...` LAN Bridge link, while the plain hosted `https://.../manifest.json` value is manual fallback only if Stremio explicitly asks for an addon URL.
- **Remote Seedbox** — Public HTTPS route for away-from-home or seedbox-first playback. Requires public qBittorrent, Prowlarr, and file serving endpoints, and is ready-file-first on the hosted relay unless you self-host playback support.

See [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) for the canonical current design, [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) for the route model, and [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) for current client install behavior.
See [docs/LAN_BRIDGE_PROCESS.md](docs/LAN_BRIDGE_PROCESS.md) for the exact LAN Bridge lifecycle, pair generation rules, and empty-content troubleshooting.

## What's Working

| Feature | Status |
|---------|--------|
| Sports discovery catalogs (All Sports, Football, Motorsport, MMA, etc.) | Working |
| Sports artwork enrichment | Working (landscape art preferred for sports tiles when available) |
| Movie/TV streams from private trackers | Working |
| Sports contamination filter | Working (SportsCult excluded from movie searches) |
| Already-downloaded files | Working (built-in file server with Range support) |
| Packed RAR scene releases already added to qBittorrent | Working on supported routes once complete: the host now background-extracts packed releases when possible and prefers the extracted direct video; native ordered `rarUrls` remain as the desktop-capable fallback, while partial multi-volume archive playback stays suppressed |
| On-tracker download + play | Working on playback-capable routes (PC Local, LAN Bridge via local redirect, or self-hosted runtime) |
| Local + Hosted install modes | Working |
| Hosted LAN pair mode (Android TV/mobile) | Implemented (requires relay config) |
| Windows desktop startup shell | Working (frontmost splash + route-aware popup on boot) |
| Windows packaged build | Working (`npm run dist:win` now rebuilds `dist/` and `dist/releases/<version>/`) |

## Current Project Status

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the authoritative current stage, active worktree items, and deployment checklist. See [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) for the live architecture and [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) for route-specific install/playback rules.

## Documentation Guide

Use these files as the live documentation set:

- [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) — canonical current behavior
- [ARCHITECTURE.md](ARCHITECTURE.md) — component/runtime structure
- [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) — route selection and install rules
- [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) — verified Stremio client truth table
- [docs/LAN_BRIDGE_PROCESS.md](docs/LAN_BRIDGE_PROCESS.md) — LAN Bridge setup, pairing, heartbeat, and troubleshooting
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — current verification and deployment status

The February 2026 planning docs under `docs/` are kept as project history and are now marked as historical where they no longer describe the live runtime.

## Quick Start

### Use the Hosted Service (Currently Free)

Visit **[www.pvtkrrx.cc](https://www.pvtkrrx.cc)** to configure your addon in 60 seconds.
Use the canonical hosted base only: `https://www.pvtkrrx.cc`.
Hosted install links should resolve under `https://www.pvtkrrx.cc/{token}/manifest.json?...`.
For `LAN Bridge`, the primary install action should start with `stremio://`; the hosted HTTPS manifest is manual fallback only when Stremio shows an `Add Addon URL` box.

### Self-Host (Free)

```bash
git clone https://github.com/Kepners/pvtkrrx.git
cd pvtkrrx
npm install
npm start
```

Then open `http://localhost:7000/configure` to enter your seedbox details.

Use the configure page to prepare the route you actually want to use:
- **PC Local** for this Windows host (`127.0.0.1`)
- **LAN Bridge** for Android TV / phone / web on the same network and Stremio account
- **Remote Seedbox** when your playback endpoints are public over HTTPS

When using `LAN Bridge` on Windows, install and sign into Stremio Desktop on the host PC first. On boot, the local runtime now scans the host Stremio Desktop WebView2 session automatically and links that account into startup auto-provision when a signed-in session is present. The configure page still exposes the host check as a manual fallback.

Auto Setup also attempts to:
- install/start Prowlarr and qBittorrent (Windows, via winget + service/process start)
- disable qBittorrent localhost auth for zero-config local API access
- open Windows Firewall ports `7000/7001` and UDP `5353` for LAN devices

Windows desktop install/startup now also re-checks those LAN firewall rules automatically on each boot.

## Requirements

Your seedbox needs:
1. **Prowlarr** with private trackers configured (or Jackett — same config page)
2. **qBittorrent** with WebUI enabled

That is enough for `PC Local` and `LAN Bridge`, where the local runtime can read files directly from qBittorrent's download directory with the built-in file server.

> `Remote Seedbox` is different: the hosted route needs a public HTTPS file-serving path for completed-file playback. Leave `File Server URL` blank only for local playback-capable routes or self-hosted runtimes that can actually serve `/file` and `/playback`.

## Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Prowlarr URL | Yes | e.g. `http://seedbox.example.com:9696` |
| Prowlarr API Key | Yes | Found in Prowlarr → Settings → General |
| TheSportsDB API Key | No | Defaults to free key `123`; add your own key for higher limits |
| TheSportsDB Cache (hours) | No | How long sports artwork lookups are reused before refresh |
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
   ├── Prowlarr / Torznab-compatible search
   ├── qBittorrent WebUI
   ├── Optional external file server
   └── Optional TheSportsDB artwork enrichment
```

Hosted configs are AES-256-GCM encrypted into addon tokens. Local installs save their working config inside the Windows runtime folder, and hosted relay/account state can be persisted in KV-backed storage when enabled.
Playback/file state links are also issued as opaque encrypted tokens (instead of plain base64 JSON), so tracker endpoints and file hints are not directly readable from stream URLs.
Hosted relay routes do not proxy video bytes, and hosted `/file` or `/playback` requests fail fast when playback still depends on the local runtime.

### Stream Types

**⚡ On Seedbox** — File is already downloaded. Plays immediately.

**📥 Available** — File is on a private tracker. PC Local and LAN Bridge can use local `/playback` queue-and-buffer behavior. Hosted Remote Seedbox does not expose dead tracker `/playback` links and is effectively ready-file playback unless you run a playback-capable self-hosted runtime.

**[INFO] Remote notice** — Hosted Remote Seedbox can append an explanation row when direct queue-and-buffer is hidden to protect your file-server login or when qBittorrent has not exposed enough live file info for a safe buffer URL yet.

**Packed RAR scene release** — If a tracker source is a multi-part RAR release (`.rar`, `.r00`, `.r01`, ...), the first click can still queue the torrent, but PVTKRRX no longer pretends that partial archive playback will work. Real Stremio clients can fail with `liberror` on incomplete multi-volume archives, so PVTKRRX suppresses live tracker playback for packed-only torrents and fails fast on `/playback` with a truthful message after queueing the download. Once qBittorrent has the full archive set, the host now starts background extraction for broader device compatibility and prefers the extracted direct video stream when ready. If extraction has not finished yet, local playback-capable routes still expose the ordered, Stremio-core-compatible `rarUrls` fallback for desktop-capable Stremio clients.

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

## Deployment

### Hosted Production

Use the canonical hosted base: `https://www.pvtkrrx.cc`.
Production updates are deployed from the synced GitHub branch and must preserve the active `ENCRYPTION_SECRET`.

### Self-Host
```bash
ENCRYPTION_SECRET=your-secret-here npm start
```

### Windows Build

```bash
npm run dist:win
```

This now builds in the system temp directory first, then copies the finished `1.1.19` artifacts back into `dist/` and `dist/releases/<version>/`. That avoids the Windows `rcedit` failure we were hitting when building directly inside the OneDrive-backed repo output folder.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| ENCRYPTION_SECRET | Yes | Key for encrypting/decrypting user configs |
| AUTH_TOKEN_SECRET | Recommended | Key for signing account auth tokens (falls back to ENCRYPTION_SECRET) |
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
| PVTKRRX_STREMIO_API_BASE_URL | Optional | Stremio API base URL for AuthKey verification (default https://api.strem.io) |
| PVTKRRX_STREMIO_API_TIMEOUT_MS | Optional | Timeout for Stremio AuthKey verification calls (default 10000) |
| PVTKRRX_OPAQUE_STATE_SECRET | Optional | Secret for stream/file opaque state tokens (defaults to `ENCRYPTION_SECRET`) |
| PVTKRRX_PLAYBACK_STATE_TTL_SECONDS | Optional | TTL for `/playback/:info` opaque tokens in seconds (default 86400) |
| PVTKRRX_FILE_STATE_TTL_SECONDS | Optional | TTL for `/file/:info` opaque tokens in seconds (default 86400) |
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
7. `1.1.19` now starts a Windows power blocker by default so the host can stay alive through lock-screen and display-off states; if the host still vanishes, check that Windows is not forcing full sleep or hibernate from the power plan

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
