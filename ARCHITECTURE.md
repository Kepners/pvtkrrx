# PVTKRRX - Architecture

## System Overview

```
User's Stremio App (any device)
        ↓ HTTPS
PVTKRRX Addon Server (Vercel serverless, stateless)
        ↓ decrypts config from URL token (AES-256-GCM)
User's Seedbox:
   ├── Jackett/Prowlarr API  → search private trackers (Torznab XML)
   ├── qBittorrent WebUI API → manage downloads (REST + cookie auth)
   └── HTTP file server      → stream to Stremio (direct, zero proxy)
```

**Key principle:** The addon server relays ~5-10KB of JSON/XML metadata only. Video streams flow directly from the user's seedbox to their Stremio client.

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 18+ (Vercel) | Clockrr pattern, free hosting |
| Framework | Express 5.x + stremio-addon-sdk | Hybrid pattern — Express for config routes, SDK for protocol |
| XML Parsing | fast-xml-parser | 3x smaller than xml2js, faster cold starts |
| Encryption | Node.js crypto (AES-256-GCM) | Zero deps, battle-tested |
| Hosting | Vercel Hobby (free) | 100K invocations/month, 10s timeout |
| Metadata | Cinemeta | Free IMDb resolution |

## File Structure

```
pvtkrrx/
├── index.js                   # Express + SDK hybrid entry point
├── src/
│   ├── clients/
│   │   ├── torznab.js         # Jackett/Prowlarr client (unified)
│   │   ├── qbittorrent.js     # qBittorrent WebUI client
│   │   └── cinemeta.js        # Cinemeta metadata resolver
│   ├── handlers/
│   │   ├── catalog.js         # Sports, Movies, TV, Library catalogs
│   │   ├── stream.js          # Stream resolution
│   │   └── meta.js            # Meta for custom IDs
│   ├── utils/
│   │   ├── crypto.js          # AES-256-GCM encrypt/decrypt
│   │   ├── parser.js          # Torrent name parsing
│   │   ├── streams.js         # Stream object building
│   │   └── pathMapper.js      # qBit path → HTTP URL mapping
│   └── config/
│       ├── categories.js      # Torznab categories
│       ├── manifest.js        # Stremio manifest
│       └── providers.js       # Seedbox provider presets
├── public/
│   ├── configure.html         # Config page (self-contained)
│   └── logo.ico               # Addon logo
├── vercel.json                # Catch-all to index.js
└── package.json               # 3 deps: sdk, express, fast-xml-parser
```

## Data Flow

### Config Flow
```
User visits /configure
    → Enters seedbox credentials
    → "Test Connection" validates Jackett + qBit
    → Server encrypts config (AES-256-GCM) → URL token
    → User gets stremio:// install link
    → Stremio installs addon with token in URL
```

### Stream Flow
```
User plays content in Stremio
    → Stremio queries /{token}/stream/{type}/{id}.json
    → Addon decrypts token → gets user's seedbox config
    → Parallel queries:
       ├── Jackett/Prowlarr: search private trackers (7s timeout)
       └── qBittorrent: check already-downloaded (5s timeout)
    → Promise.allSettled() → partial results OK
    → On seedbox? → Direct HTTP URL (⚡ instant play)
    → On tracker? → URL points to /playback endpoint (📥 Comet pattern)
    → Stremio renders stream list
```

### Playback Flow (Comet Pattern)
```
User clicks "📥 Available" stream
    → Stremio sends GET to /{token}/playback/{info}
    → Addon checks qBit: already downloaded?
       → YES: 302 redirect to seedbox HTTP file URL
       → NO: triggers qBit download, polls every 3s
    → Download completes → 302 redirect to file
    → Stremio player starts (user saw loading spinner)
```

### Sports Flow
```
User browses Sports catalog
    → Stremio queries /{token}/catalog/other/pvtkrrx-sports.json
    → Addon queries Jackett RSS (category 5060)
    → Returns metas with {title, infohash, tracker, size, seeders}
    → User selects sport event
    → Stream handler checks seedbox → resolves to HTTP URL or shows download option
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| SDK + Express hybrid | Clockrr pattern | Client's proven approach |
| fast-xml-parser | Over xml2js | Smaller bundle, faster cold starts |
| Stateless (no cache) | Accept fresh API calls | In-memory cache useless on serverless |
| qBit login-per-request | No persistent cookies | Serverless = no state |
| Sports ID without API key | Security fix | Original spec leaked API keys in base64 |
| Prowlarr via Torznab | Unified client | Same protocol as Jackett |
| Comet playback pattern | Download flow | Stream URL → /playback → poll qBit → 302 redirect |
| proxyHeaders for Basic Auth | Security | Credentials in header, never in URL |
| withConfig middleware | Clean architecture | Decrypt once, pass req.config to handlers |

## Timeout Budget (10s Vercel Hobby)

| Component | Timeout | Notes |
|-----------|---------|-------|
| Jackett/Prowlarr | 7s | `&timeout=6` param + AbortController at 7s |
| qBittorrent | 5s | Login + query within budget |
| Cinemeta | 3s | Fast, rarely times out |
| Total function | 10s | Vercel Hobby hard limit |

Queries run in parallel via `Promise.allSettled()`. Partial results returned if one times out.

---

*Updated: February 8, 2026 — Concept Meeting Output*
