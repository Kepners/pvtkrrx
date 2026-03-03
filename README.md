# PVTKRRX

**Connect your private tracker seedbox to Stremio. No debrid. No hosting. Your hardware, your trackers.**

## What This Does

PVTKRRX is a Stremio addon that bridges your existing seedbox infrastructure into Stremio. You configure it with your own:

- **Prowlarr URL + API key** — searches your private trackers
- **qBittorrent WebUI URL** — manages downloads and streams your library

The addon handles: search → download → stream. PVTKRRX has a **built-in file server** so you can stream completed downloads directly — no external HTTP server required.

## Key Features

- **Sports** — Browse and search private tracker sports content (EPL, F1, UFC) directly in Stremio
- **Sports artwork enrichment** — Optional TheSportsDB posters/thumbs with cache-aware lookups
- **Movies & TV** — IMDb-matched content from your private trackers
- **Seedbox Library** — Browse everything already downloaded on your seedbox
- **Smart filtering** — Sports indexers never contaminate movie/TV searches
- **Zero data stored** — All config AES-256-GCM encrypted in the addon URL
- **No debrid needed** — Your seedbox IS the streaming server
- **Free hosting** — Runs on Vercel Hobby tier ($0/month)

## What's Working

| Feature | Status |
|---------|--------|
| Sports catalog (EPL, F1, UFC tiles) | Working |
| Movie/TV streams from private trackers | Working |
| Sports contamination filter | Working (SportsCult excluded from movie searches) |
| Already-downloaded files | Working (built-in file server with Range support) |
| On-tracker download + play | Working (Comet pattern: queue then redirect) |
| Local + Hosted install modes | Working |
| Hosted LAN pair mode (Android TV/mobile) | Implemented (requires relay config) |

## Current Project Status

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the authoritative current stage, active worktree items, and deployment checklist.

## Quick Start

### Use the Hosted Service (Currently Free)

Visit **[pvtkrrx.vercel.app](https://pvtkrrx.vercel.app)** to configure your addon in 60 seconds.
Use the canonical hosted base only: `https://pvtkrrx.vercel.app`.
Hosted install links should resolve under `https://pvtkrrx.vercel.app/{token}/manifest.json?...`.

### Self-Host (Free)

```bash
git clone https://github.com/Kepners/pvtkrrx.git
cd pvtkrrx
npm install
npm start
```

Then open `http://localhost:7000/configure` to enter your seedbox details.

Use **Auto Setup Local / LAN** on the configure page to prefill local defaults and generate install links for:
- this PC (`127.0.0.1`)
- Android TV / phone on the same network (Method 4 hosted LAN pair URL)

Auto Setup also attempts to:
- install/start Prowlarr and qBittorrent (Windows, via winget + service/process start)
- disable qBittorrent localhost auth for zero-config local API access
- open Windows Firewall ports `7000/7001` for LAN devices

## Requirements

Your seedbox needs:
1. **Prowlarr** with private trackers configured (or Jackett — same config page)
2. **qBittorrent** with WebUI enabled

That's it. PVTKRRX has a **built-in file server** and will stream files directly from qBittorrent's download directory. No nginx, no caddy, no ruTorrent file server needed.

> **Optional:** If you already have an HTTP file server on your seedbox (nginx, caddy, Synology, etc.) you can configure the "File Server URL" field to use it instead. Leave it blank to use the built-in server.

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
| File Server URL | No | External HTTP server URL. **Leave blank** to use built-in server |
| Path Mapping | No | Only if using external file server with different paths |

## How It Works

```
Your Stremio App (any device)
        ↓ HTTPS
PVTKRRX (Vercel serverless, stateless)
        ↓ decrypts your config from the addon URL
Your Seedbox:
   ├── Prowlarr  → searches your private trackers
   └── qBittorrent → manages downloads + streams files
```

All credentials are AES-256-GCM encrypted and embedded in the addon URL. The server never stores anything.
Playback/file state links are also issued as opaque encrypted tokens (instead of plain base64 JSON), so tracker endpoints and file hints are not directly readable from stream URLs.

### Stream Types

**⚡ On Seedbox** — File is already downloaded. Plays immediately.

**📥 Available** — File is on a private tracker. Click to trigger download. PVTKRRX polls qBittorrent and redirects to the file once it's done.

## Verify Stremio Config Flow

Run this smoke check to validate the configuration page, token encryption, and install manifest routes:

```bash
npm run smoke:config
```

This verifies:
- `/configure` loads
- `POST /encrypt` returns a token
- `/:token/manifest.json` resolves
- `/:token/configure` resolves
- Invalid token routes return `400`

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

### Vercel (Recommended)
```bash
npx vercel --prod
# Set ENCRYPTION_SECRET in Vercel dashboard
```

### Self-Host
```bash
ENCRYPTION_SECRET=your-secret-here npm start
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| ENCRYPTION_SECRET | Yes | Key for encrypting/decrypting user configs |
| AUTH_TOKEN_SECRET | Recommended | Key for signing account auth tokens (falls back to ENCRYPTION_SECRET) |
| KV_REST_API_URL | Recommended | Persist LAN pair heartbeat state on Vercel |
| KV_REST_API_TOKEN | Recommended | Auth token for KV REST API |
| PVTKRRX_PAIR_RELAY_URL | Optional | Hosted relay base URL (default https://pvtkrrx.vercel.app) |
| PVTKRRX_LAN_PAIR_TTL_SECONDS | Optional | Pair record TTL (default 21600) |
| PVTKRRX_LAN_PAIR_BIND_PUBLIC_IP | Optional | Bind hosted pair redirects to heartbeat source network (default false) |
| PVTKRRX_LAN_PAIR_LOCK_HOST | Optional | Reject heartbeat takeover attempts from a different active host IP (default true) |
| PVTKRRX_LAN_PAIR_RATE_LIMIT_WINDOW_MS | Optional | Pair API rate-limit window in ms (default 60000) |
| PVTKRRX_LAN_PAIR_HEARTBEAT_MAX_PER_WINDOW | Optional | Max heartbeat calls per window (default 30) |
| PVTKRRX_LAN_PAIR_STATUS_MAX_PER_WINDOW | Optional | Max status calls per window (default 60) |
| PVTKRRX_ENCRYPT_MAX_PER_WINDOW | Optional | Max `/encrypt` requests per window (default 30) |
| PVTKRRX_AUTH_MAX_PER_WINDOW | Optional | Max Stremio AuthKey link requests per window (default 20) |
| PVTKRRX_PROWLARR_CACHE_MS | Optional | Catalog search cache TTL in ms (default 120000) |
| PVTKRRX_PROWLARR_SEARCH_TIMEOUT_MS | Optional | Timeout for catalog Prowlarr search calls in ms (default 7000) |
| PVTKRRX_PROWLARR_CACHE_MAX_KEYS | Optional | Max in-memory cached catalog search keys (default 500) |
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
4. Ensure firewall allows inbound TCP `7000/7001` + UDP `5353`
5. If pair shows offline in configure page, restart desktop app and re-check pair status

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
