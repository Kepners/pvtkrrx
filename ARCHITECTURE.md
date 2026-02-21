# PVTKRRX - Architecture

## System Overview

```
User's Stremio App (any device)
        ↓ HTTPS
PVTKRRX Addon Server (Vercel serverless OR local Express — stateless)
        ↓ decrypts config from URL token (AES-256-GCM)
User's Seedbox:
   ├── Prowlarr REST API  → search private trackers (JSON)
   ├── qBittorrent WebUI API → manage downloads (REST + cookie auth)
   └── (optional) HTTP file server → stream to Stremio (direct)
             OR
   └── PVTKRRX built-in file server → streams from qBit save_path
```

**Key principle:** The addon server relays ~5-10KB of JSON metadata only. Video streams flow directly from the user's seedbox to their Stremio client. No video data passes through PVTKRRX.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 18+ (Vercel) | Clockrr pattern, free hosting |
| Framework | Express 5.x + stremio-addon-sdk | Hybrid pattern — Express for config routes, SDK for protocol |
| Prowlarr API | Prowlarr REST (`/api/v1/search`) | JSON API, no XML parsing needed |
| Encryption | Node.js crypto (AES-256-GCM) | Zero deps, battle-tested |
| HTTPS (local) | selfsigned + Node https module | Self-signed cert for LAN streaming |
| Hosting | Vercel Hobby (free) | 100K invocations/month, 10s timeout |
| Metadata | Cinemeta | Free IMDb resolution |

---

## File Structure

```
pvtkrrx/
├── index.js                   # Express + SDK hybrid entry point
│                              # Also: built-in file server, playback endpoint, HTTPS server
├── src/
│   ├── clients/
│   │   ├── prowlarr.js        # Prowlarr REST API client (JSON, not Torznab XML)
│   │   ├── qbittorrent.js     # qBittorrent WebUI client
│   │   └── cinemeta.js        # Cinemeta metadata resolver
│   ├── handlers/
│   │   ├── catalog.js         # Sports, Movies, TV, Library catalogs
│   │   ├── stream.js          # Stream resolution + filter chain
│   │   └── meta.js            # Meta for custom pvtkrrx: IDs
│   ├── utils/
│   │   ├── crypto.js          # AES-256-GCM encrypt/decrypt
│   │   ├── parser.js          # Torrent name parsing (quality, codec, HDR)
│   │   ├── streams.js         # Stream object builders + file utilities
│   │   └── pathMapper.js      # qBit path → external HTTP URL mapping
│   └── config/
│       ├── categories.js      # Torznab/Prowlarr category constants
│       ├── manifest.js        # Stremio manifest
│       └── providers.js       # Seedbox provider presets
├── public/
│   ├── configure.html         # Config page (self-contained)
│   └── logo.svg               # Addon logo
├── vercel.json                # Catch-all to index.js
└── package.json               # Deps: sdk, express, selfsigned
```

---

## Data Flow

### Config Flow
```
User visits /configure
    → Enters: Prowlarr URL + API key, qBit URL + credentials,
              (optional) external file server URL, path mapping
    → "Test Connection" validates Prowlarr + qBit live
    → Server encrypts config (AES-256-GCM) → URL token
    → User gets stremio:// install link (Local or Hosted mode)
    → Stremio installs addon with token in URL
```

### Stream Flow — Movies & TV (IMDB IDs)
```
User plays movie/show in Stremio
    → Stremio queries /{token}/stream/{type}/{id}.json
    → Addon decrypts token → gets user's seedbox config
    → Parallel queries (Promise.allSettled):
       ├── Prowlarr: IMDB search (type=movie or type=tvsearch) — 7s budget
       ├── qBittorrent: completed torrents list — 5s budget
       └── Cinemeta: resolve IMDB ID → content title — 3s budget
    → Apply filter chain to IMDB results:
       ├── Remove SPORTS_ONLY_INDEXERS (SportsCult, BeyondHD-Sports, etc.)
       └── Title relevance: all significant query words must appear in result title
    → If 0 results survive filters:
       └── Fallback: title search (type=search) → apply same filters
    → For series: narrow by S{n}E{n} pattern
    → Match remaining results against qBit completed hash map:
       ├── ON SEEDBOX (hash match): build direct file URL (⚡)
       └── ON TRACKER (no match): build /playback/ URL (📥)
    → Return sorted streams (seedbox first)
```

### Stream Flow — Sports (pvtkrrx: IDs)
```
User clicks sport event from catalog
    → Stremio queries /{token}/stream/other/{pvtkrrx:base64}.json
    → Decode ID → extract torrent title, infohash
    → Check qBit completed: already on seedbox?
       → YES: build file URL → ⚡ stream instantly
       → NO: re-search Prowlarr for download link → return 📥 stream
```

### Playback Flow — Comet Pattern (📥 streams)
```
User clicks "📥 Available" stream
    → Stremio GETs /{token}/playback/{base64info}
    → Decode info: { h: infohash, l: downloadUrl }
    → Check qBit completed: already there?
       → YES: 302 redirect to file URL
       → NO: POST download URL to qBit → poll every 3s for 6s
    → If complete within 6s: 302 redirect to file URL
    → If not complete: 504 "Download started — check qBittorrent"
```

### File Serving — Two Paths
```
buildFileUrl() selects path based on config:

Path A — External file server (config.fileServerUrl set):
    fileServerUrl + pathMapping → mapPath() → external HTTP URL
    → Stremio streams directly from user's nginx/caddy/ruTorrent
    → PVTKRRX not involved in video data transfer

Path B — Built-in file server (no fileServerUrl set):
    → URL: /{token}/file/{base64(hash+filename)}
    → PVTKRRX looks up torrent save_path from qBit
    → Serves file from disk with HTTP 206 Range support
    → Works on local installs with no HTTP file server configured
```

---

## Filter Chain Detail

Prevents cross-contamination (sports results appearing for movie searches):

```
1. SPORTS_ONLY_INDEXERS (hardcoded Set):
   - SportsCult, BeyondHD-Sports, TVVault-Sports
   - These indexers only hold sports content — never relevant for movies/TV
   - Prowlarr routes imdbId queries to them as generic keyword searches
     (they don't support type=movie), returning recent sports content

2. titleRelevant(resultTitle, queryTitle):
   - Strips stopwords (the, a, an, of, in, on, at, to, for, and, or)
   - Requires every significant word from movie title to appear in result title
   - Example: "Predator Badlands" → rejects "F1 2025 Race 01" ✓
   - Example: "Predator Badlands" → keeps "Predator.Badlands.2025.2160p.UHD" ✓

3. Filter applied immediately after IMDB search (before fallback check)
   - Critical: if filter kills all results, fallback triggers correctly
   - Previous bug: filter only ran on fallback results → 450 junk results
     survived IMDB search → no fallback → PVTKRRX vanished from dropdown
```

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| SDK + Express hybrid | Clockrr pattern | Client's proven approach |
| Prowlarr REST JSON API | Over Torznab XML | Simpler, no XML parsing |
| `type=search` for fallback | Not `type=movie` | Private trackers only support `type=search`; `type=movie` returns 0 from HD-Torrents, SpeedCD |
| Categories omitted from search | Intentional | Private trackers in Prowlarr don't tag with standard Torznab categories → 0 results if you filter |
| Stateless (no cache) | Accept fresh API calls | In-memory cache useless on serverless |
| `cacheMaxAge: 0` | Force Stremio to re-query | Changes visible without reinstalling addon |
| qBit login-per-request | No persistent cookies | Serverless = no state |
| SPORTS_ONLY_INDEXERS hardcoded | Not API-based | Prowlarr has no tag-based indexer filtering in API |
| titleRelevant() filter | Word intersection | Kills sports contamination while keeping legit results |
| Cinemeta in parallel | Not sequential | Zero latency penalty; title always available for filter |
| Built-in file server | Express Route + Range | Local users don't need external nginx/caddy setup |
| Comet playback pattern | Download flow | Stream URL → /playback → poll qBit → 302 redirect |
| proxyHeaders for Basic Auth | Security | Credentials in header, never in URL |
| withConfig middleware | Clean architecture | Decrypt once, pass req.config to handlers |
| Local + Hosted install modes | Different addon IDs | Allows both local and hosted addon installed simultaneously |

---

## Timeout Budget (10s Vercel Hobby)

| Component | Timeout | Notes |
|-----------|---------|-------|
| Prowlarr REST search | 7s | AbortSignal.timeout(20000) — generous for private trackers |
| qBittorrent | 5s | Login + query within budget |
| Cinemeta | 3s | Fast, rarely times out |
| Total function | 10s | Vercel Hobby hard limit |

Queries run in parallel via `Promise.allSettled()`. Partial results returned if one times out.

---

## Known Issues / Current Status

| Area | Status | Notes |
|------|--------|-------|
| Sports catalog | ✅ Working | EPL, F1, UFC returning tiles |
| Movie/TV streams | ✅ Working | 225+ results for Predator Badlands after filtering |
| Sports contamination filter | ✅ Working | SportsCult excluded; title filter kills cross-contamination |
| Already-downloaded playback | ⚠️ Under investigation | Built-in /file/ endpoint implemented; black screen may be stale config with old fileServerUrl set |
| On-tracker download + play | ✅ Code complete | Comet pattern: triggers download, polls, redirects |
| Local HTTPS | ✅ Working | Self-signed cert on port 7001 for LAN streaming |

### Diagnosing Black Screen (playback issue)
If files appear to download but Stremio shows black screen:
1. In Stremio player, click `⋮ → Copy stream link`
2. Paste the URL — if it contains `fileServerUrl` path, the config has an old external URL set
3. Fix: go to `http://localhost:7000/configure` → clear the "File Server URL" field → reinstall
4. With empty fileServerUrl, the built-in `/file/` endpoint is used instead

---

*Updated: February 21, 2026*
