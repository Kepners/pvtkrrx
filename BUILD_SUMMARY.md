# PVTKRRX — Build Summary

**Status**: Historical snapshot from initial MVP build (Feb 2026).
Hosted `/playback` notes in this file describe the original MVP plan, not the current hosted `Remote Seedbox` behavior.
For current stage and active work, see `docs/PROJECT_STATUS.md`.

---

## What's Been Built

### 📦 **20 Files, 3,148 Lines of Code**

#### Phase 0: Foundation (6 files)
- ✅ `package.json` — 3 dependencies: stremio-addon-sdk, express, fast-xml-parser
- ✅ `vercel.json` — Serverless deployment config
- ✅ `src/utils/crypto.js` — AES-256-GCM encryption with SHA-256 key derivation
- ✅ `src/config/manifest.js` — 4 catalogs with sports genre extras
- ✅ `src/config/categories.js` — Torznab category constants (movies, TV, sports)
- ✅ `src/config/providers.js` — Seedbox presets (Feral, Ultra, Whatbox, Swizzin)

#### Phase 1: API Clients (3 files)
- ✅ `src/clients/torznab.js` — Jackett/Prowlarr client with dual timeout (7s client + 6s server)
- ✅ `src/clients/qbittorrent.js` — qBit Web API with login-per-request pattern
- ✅ `src/clients/cinemeta.js` — IMDb metadata proxy

#### Phase 2: Utilities & Handlers (6 files)
- ✅ `src/utils/parser.js` — Torrent name parsing (quality, codec, audio, HDR, episodes)
- ✅ `src/utils/pathMapper.js` — Seedbox path → HTTP URL mapping
- ✅ `src/utils/streams.js` — Stream builders (on-seedbox with proxyHeaders, on-tracker with the original Comet-plan flow)
- ✅ `src/handlers/catalog.js` — Sports (genre filtering), Movies, TV, Library catalogs
- ✅ `src/handlers/stream.js` — Parallel Jackett + qBit search, episode matching for series
- ✅ `src/handlers/meta.js` — Custom ID decoder + Cinemeta proxy

#### Phase 3: Integration (2 files)
- ✅ `index.js` — Express + SDK hybrid with withConfig middleware, original Comet-plan playback handling, POST /encrypt, POST /test-connection
- ✅ `public/configure.html` — Self-contained config page with provider presets and connection testing

#### Documentation (3 files)
- ✅ `README.md` — Project overview
- ✅ `ARCHITECTURE.md` — System design
- ✅ `TESTING.md` — Local testing guide

---

## Key Features Implemented

### 🎯 **Sports-First Architecture**
- Sports catalog with genre filtering (Football, F1, UFC, NBA, Cricket, Rugby, Tennis)
- Custom `pvtkrrx:` ID format with base64url encoding (no API key leaks)
- Genre-based search via `&q={genre}` query parameter

### 🔒 **Security**
- AES-256-GCM encryption for config tokens (credentials never in URL)
- Server-side encryption endpoint (ENCRYPTION_SECRET never touches browser)
- proxyHeaders for Basic Auth (credentials sent securely with stream requests)
- Defensive error handling (all handlers return empty on errors, never expose internals)

### ⚡ **Performance**
- Stateless serverless design (no cache needed)
- Parallel API calls with `Promise.allSettled()` for partial results
- Dual timeout mechanism: 7s AbortSignal + 6s server-side param
- Login-per-request qBit pattern (optimized for serverless cold starts)

### 📺 **Stremio Integration**
- 4 catalogs: Sports (tv type), Movies (movie type), TV (series type), Library (movie type)
- Episode matching with S01E05 format and season pack support
- bingeGroup for auto-selecting next episode
- videoSize behaviorHint for bandwidth estimation
- filename behaviorHint for file type detection

### 🎬 **Comet Playback Pattern**
- Stream URL points to `/playback` endpoint
- Triggers qBit download if not on seedbox
- Polls every 3s for up to 6s (within Vercel 10s timeout budget)
- 302 redirect to file server URL when ready
- 504 JSON error if timeout (download continues in background)

---

## What Works Right Now

### ✅ Verified Functionality
1. **Root manifest** — SDK router serves `/manifest.json` at addon root
2. **POST /encrypt** — Server-side config encryption generates token
3. **Config-authenticated routes** — All `/:config/` routes decrypt and serve correctly
4. **All API clients load** — TorznabClient, QBitClient, CinemetaClient tested
5. **All utilities load** — parser, pathMapper, streams verified with unit tests
6. **All handlers load** — catalog, stream, meta handlers verified

### 🧪 Integration Tests Passed
- ✅ Manifest served via SDK router (4 catalogs, correct ID)
- ✅ Encrypt endpoint generates AES-256-GCM token
- ✅ Config manifest decrypts and serves correctly
- ✅ Parser extracts: quality="2160p", codec="x265", audio="Atmos", source="BluRay", hdr="HDR10+", remux=true
- ✅ Episode matching: S01E05 ✓, season packs ✓, wrong episode ✗
- ✅ Path mapper: seedbox path → HTTP URL correctly
- ✅ Size formatting: 1.5 GB, 25.0 GB, 800 KB
- ✅ Video file finder picks largest .mkv from torrent files

---

## Architecture Highlights

### Request Flow
```
User → Stremio → https://pvtkrrx.vercel.app/{token}/catalog/tv/pvtkrrx-sports.json
                         ↓
                  withConfig middleware (decrypt token → req.config)
                         ↓
                  handleCatalog(config, 'tv', 'pvtkrrx-sports', null)
                         ↓
                  TorznabClient.rss(SPORT_CATS) → parse → metas
                         ↓
                  { metas: [...], cacheMaxAge: 120 }
```

### Historical Comet Playback Flow
```
User clicks stream → Stremio requests /playback/{info}
                         ↓
                  Decode base64url info → { h: infohash, l: download_link }
                         ↓
                  qBit.torrents('completed') → check if hash exists
                         ↓
          ┌─────────────┴─────────────┐
          ↓                           ↓
    Already downloaded          Not downloaded
          ↓                           ↓
    qBit.files(hash)            qBit.add(link)
          ↓                           ↓
    findVideoFile()             Poll for 6s (2 cycles @ 3s)
          ↓                           ↓
    mapPath() → fileUrl         ┌───┴───┐
          ↓                     ↓       ↓
    302 → fileUrl           Ready   Timeout
                              ↓       ↓
                          302    504 JSON
```

### Tech Stack
- **Node.js 18+** (Vercel runtime)
- **Express 5.2.1** (async route handlers, modern middleware)
- **stremio-addon-sdk 1.6.10** (manifest + fallback router)
- **fast-xml-parser 4.5.0** (Torznab XML parsing, 3x smaller than xml2js)
- **Native crypto** (AES-256-GCM, SHA-256, no external deps)
- **Native fetch** (AbortSignal.timeout, no axios/node-fetch needed)

---

## What's Next: Phase 4

### Local Testing Requirements
1. Install Jackett or Prowlarr locally
2. Install qBittorrent with Web UI enabled
3. Set `ENCRYPTION_SECRET` environment variable
4. Run `npm start` → http://localhost:7000
5. Configure addon via http://localhost:7000/configure
6. Install in Stremio via generated `stremio://` link
7. Test all 10 acceptance criteria (see [TESTING.md](TESTING.md))

### Then Production Deployment
1. Deploy to Vercel: `vercel --prod`
2. Set ENCRYPTION_SECRET in Vercel environment variables
3. Update config with real seedbox credentials
4. Test with actual private tracker content

---

## File Structure
```
pvtkrrx/
├── index.js                    # Express + SDK entry point
├── package.json                # Dependencies
├── vercel.json                 # Vercel config
├── public/
│   └── configure.html          # Config page
├── src/
│   ├── config/
│   │   ├── manifest.js         # Stremio manifest
│   │   ├── categories.js       # Torznab categories
│   │   └── providers.js        # Seedbox presets
│   ├── clients/
│   │   ├── torznab.js          # Jackett/Prowlarr API
│   │   ├── qbittorrent.js      # qBit Web API
│   │   └── cinemeta.js         # Cinemeta proxy
│   ├── utils/
│   │   ├── crypto.js           # AES-256-GCM encrypt/decrypt
│   │   ├── parser.js           # Torrent name parsing
│   │   ├── pathMapper.js       # Path mapping
│   │   └── streams.js          # Stream builders
│   └── handlers/
│       ├── catalog.js          # Catalog handler
│       ├── stream.js           # Stream handler
│       └── meta.js             # Meta handler
├── docs/
│   ├── SPEC.md                 # Full spec (3166 lines)
│   ├── SCOPE_OF_WORKS.md       # Acceptance criteria
│   ├── TECHNICAL_SPEC.md       # 8 key decisions
│   ├── COMMERCIAL_SPEC.md      # Cost analysis
│   ├── PRODUCTION_SPEC.md      # Build order
│   ├── CLIENT_DRIVERS.md       # 5 binding directives
│   ├── PROGRAMME.md            # Implementation plan (APPROVED)
│   └── PRESTART_OUTCOME.md     # Prestart meeting result
├── ARCHITECTURE.md             # System overview
├── TESTING.md                  # Testing guide
├── BUILD_SUMMARY.md            # This file
└── README.md                   # Project intro
```

---

## Development Timeline

- **Concept Meeting**: Full spec produced (5 docs, 3166-line SPEC.MD)
- **Prestart Meeting**: Programme approved by MD with 7 fixes
- **Phase 0-3 Build**: ~4 hours (17 source files, 3,148 LOC)
- **Current Status**: Ready for local testing

---

## Key Decisions Made

1. **stremio-addon-sdk + Express hybrid** (clockrr pattern) — SDK for protocol compliance, Express for custom routes
2. **AES-256-GCM encryption** (single ENCRYPTION_SECRET) — Strong security, no key management overhead
3. **Stateless serverless** — No cache, no database, pure compute
4. **Login-per-request qBit** — Unavoidable on serverless, optimized with SID caching per invocation
5. **Sports catalog #1 priority** (MD directive) — Genre filtering, custom IDs, landscape posters
6. **Prowlarr via Torznab** — Unified protocol for all indexers
7. **Historical Comet playback pattern** — Poll qBit, 302 redirect when ready
8. **proxyHeaders for Basic Auth** — Credentials in headers, never in URL
9. **Server-side POST /encrypt** — ENCRYPTION_SECRET never touches browser (Colin's security fix)
10. **Defensive handlers** — Return empty on errors, never throw (MD's prestart directive)

---

🔥 **PVTKRRX is BUILT and READY TO TEST** 🔥

Next step: Follow [TESTING.md](TESTING.md) to set up local Jackett + qBit and verify all 10 acceptance criteria.
