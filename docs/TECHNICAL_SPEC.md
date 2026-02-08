# Technical Specification - PVTKRRX

> **Version:** 1.0
> **Date:** February 8, 2026
> **Author:** Colin (CTO)

---

## 1. Architecture Overview

PVTKRRX follows the **clockrr pattern** — a hybrid stremio-addon-sdk + Express application deployed as a single Vercel serverless function. Express handles custom routes for encrypted config tokens, while the SDK router provides standard Stremio protocol compliance.

```
User's Stremio App (any device)
        ↓ HTTPS
PVTKRRX Addon Server (Vercel serverless, stateless)
        ↓ decrypts config from URL token
User's Seedbox:
   ├── Jackett/Prowlarr API  → search private trackers (Torznab XML)
   ├── qBittorrent WebUI API → manage downloads (REST + cookie auth)
   └── HTTP file server      → stream to Stremio (direct, no proxy)
```

**Key principle:** The addon server is a pure API matchmaker. It relays ~5-10KB of JSON/XML metadata. Video streams flow directly from the user's seedbox HTTP server to their Stremio client.

## 2. Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js (Vercel serverless) | Clockrr pattern, free hosting |
| Framework | Express 5.x | Custom route handling for encrypted tokens |
| Addon SDK | stremio-addon-sdk 1.6.x | Standard Stremio protocol compliance |
| XML Parsing | fast-xml-parser | 3x smaller, 2x faster than xml2js on serverless cold starts |
| Encryption | Node.js crypto (AES-256-GCM) | Zero dependencies, battle-tested |
| Hosting | Vercel Hobby tier | Free, global edge, 10s function timeout |
| Metadata | Cinemeta (Stremio's service) | Free IMDb resolution, no API key needed |

## 3. Key Technical Decisions

### Decision 1: SDK + Express Hybrid (Clockrr Pattern)
- **Options Considered:** (A) Raw Express only, (B) SDK only, (C) SDK + Express hybrid
- **Chosen:** C — SDK + Express hybrid
- **Rationale:** Client's proven pattern from clockrr project. Express handles `/:token/` routes for encrypted config, SDK router mounted last as fallback provides standard Stremio protocol compliance with minimal code.

### Decision 2: fast-xml-parser over xml2js
- **Options Considered:** xml2js (spec default), fast-xml-parser
- **Chosen:** fast-xml-parser
- **Rationale:** ~50KB vs ~150KB bundle. Faster parsing on cold starts. No callback-based API — uses synchronous parsing. Both Colin and Peter agreed.

### Decision 3: Stateless Architecture (No Cache)
- **Options Considered:** (A) In-memory Cinemeta cache, (B) Redis/KV cache, (C) Pure stateless
- **Chosen:** C — Pure stateless
- **Rationale:** Vercel serverless functions cold-start frequently — in-memory cache won't persist. Redis adds cost and complexity. Cinemeta calls are fast (~100ms). Accept the tradeoff.

### Decision 4: Login-Per-Request for qBittorrent
- **Options Considered:** (A) Persistent cookie, (B) Login-per-request
- **Chosen:** B — Login-per-request
- **Rationale:** Serverless = no persistent state. Each function invocation must authenticate fresh. qBit login is fast (~50ms on LAN). Unavoidable architectural constraint.

### Decision 5: Download Flow — Comet Playback Pattern
- **Options Considered:** (A) External URL polling hack, (B) Status in stream name/description only, (C) Comet playback endpoint pattern
- **Chosen:** C — Comet playback endpoint pattern
- **Rationale:** Stream handler returns a URL pointing to our own `/playback` endpoint (not the direct file URL). When Stremio clicks it, the playback endpoint triggers qBit download if needed, polls for completion within the request lifetime, then 302 redirects to the seedbox file URL. User sees a loading spinner → playback starts. This is the industry-standard pattern used by Comet, comet-uncached, and debrid addons. Stremio follows 302 redirects on `url` fields natively.

### Decision 6: Sports ID Encoding (Security Fix)
- **Options Considered:** (A) Spec's original encoding with download URL, (B) Stripped encoding without API key
- **Chosen:** B — Encode only {title, infohash, tracker, size, seeders}
- **Rationale:** Original spec encoded Jackett download URL in base64, which contains the API key in plaintext. MD directive: remove API key from encoded IDs. Use magnet links (infohash) or re-search at stream time.

### Decision 7: proxyHeaders for File Server Auth
- **Options Considered:** (A) Embed `user:pass@` in stream URL, (B) Use `proxyHeaders` behaviorHint
- **Chosen:** B — proxyHeaders
- **Rationale:** Instead of putting Basic Auth credentials in the stream URL (visible in plaintext), use Stremio's `proxyHeaders` behaviorHint to send the `Authorization: Basic` header with the stream request. Credentials never appear in the URL. Caveat: may not work on Stremio Web, but works on desktop and mobile apps.

### Decision 8: withConfig Express Middleware
- **Options Considered:** (A) Decrypt config per-handler, (B) Express middleware
- **Chosen:** B — `withConfig` middleware
- **Rationale:** Single middleware function decrypts the config token from the URL path and attaches it to `req.config`. All downstream handlers access `req.config` directly. Clean separation of concerns, decrypt-once pattern.

## 4. APIs & Integrations

| Integration | Purpose | Protocol | Auth |
|-------------|---------|----------|------|
| Jackett/Prowlarr | Search private trackers | Torznab XML (HTTP GET) | API key in query string |
| qBittorrent | Manage downloads, list completed | REST API (HTTP POST) | Cookie-based (SID) |
| Cinemeta | Resolve IMDb IDs to titles | REST JSON (HTTP GET) | None |
| Stremio Client | Addon protocol | Stremio Addon Protocol (HTTP GET) | None (public) |

### Torznab API Calls
```
Search:     GET {url}/api?apikey={key}&t=search&q={query}&cat={cat}&timeout=6
IMDb:       GET {url}/api?apikey={key}&t=movie&imdbid={id}&timeout=6
RSS:        GET {url}/api?apikey={key}&t=search&cat={cat}&timeout=6
Caps:       GET {url}/api?apikey={key}&t=caps
```

### qBittorrent API Calls
```
Login:      POST {url}/api/v2/auth/login        (username, password)
Torrents:   GET  {url}/api/v2/torrents/info     (filter=completed)
Files:      GET  {url}/api/v2/torrents/files     (hash={hash})
Add:        POST {url}/api/v2/torrents/add       (urls={magnetOrUrl})
```

## 5. Data Model (High-Level)

### User Config (encrypted in URL token)
```javascript
{
  jackettUrl: "https://...",       // Jackett/Prowlarr base URL
  jackettApiKey: "abc123",         // Torznab API key
  qbitUrl: "https://...",          // qBittorrent WebUI URL
  qbitUsername: "admin",           // qBit username
  qbitPassword: "pass",           // qBit password
  fileServerUrl: "https://...",    // HTTP file server base URL
  fileServerAuth: "user:pass",    // Optional Basic Auth
  pathMapping: {                   // qBit save path → HTTP path
    from: "/downloads/",
    to: "/files/"
  },
  maxResults: 50                   // Max results per search
}
```

### Stremio Stream Object — On Seedbox (instant play)
```javascript
{
  name: "⚡ 1080p BluRay REMUX",
  description: "On Seedbox | TrueHD Atmos 7.1 | 45.2 GB",
  url: "https://seedbox.example.com/files/movie.mkv",
  behaviorHints: {
    notWebReady: true,
    bingeGroup: "pvtkrrx-1080p",
    filename: "Movie.2024.1080p.BluRay.REMUX.mkv",  // MANDATORY — SDK warns without this
    videoSize: 27166832640,                           // For subtitle matching
    proxyHeaders: {
      request: { "Authorization": "Basic dXNlcjpwYXNz" }
    }
  }
}
```

### Stremio Stream Object — Available on Tracker (Comet pattern)
```javascript
{
  name: "📥 1080p BluRay",
  description: "250 seeders | 12.5 GB | Click to stream",
  url: "https://pvtkrrx.vercel.app/{token}/playback/{encodedInfo}",
  // Playback endpoint: triggers qBit download → polls → 302 redirects to file
  // If download not ready in time: serve small "not ready" response
  behaviorHints: {
    notWebReady: true,
    filename: "Movie.2024.1080p.BluRay.mkv"  // MANDATORY — SDK warns without this
  }
}
```

### Cache Strategy
```javascript
// Stream responses — always fresh (download status changes between queries)
return { streams: [...], cacheMaxAge: 0 }

// Movie/TV catalog — 5 min cache
return { metas: [...], cacheMaxAge: 300 }

// Sports catalog — shorter, RSS changes frequently
return { metas: [...], cacheMaxAge: 120 }
```

**SDK Rule:** Every stream with a `url` MUST include `behaviorHints.filename`. Without it, Stremio won't attempt subtitle matching and the SDK logs a warning (verified in SDK source: `getRouter.js`).

### Sports ID Encoding
```javascript
// Encode: base64url(JSON.stringify({...}))
{
  t: "UFC 312 Main Card",    // Title
  h: "abc123def456",         // InfoHash
  k: "MyTracker",            // Tracker name
  s: 15728640,               // Size (bytes)
  d: 42                      // Seeders
}
```

## 6. Security Considerations

- **AES-256-GCM encryption** for all user credentials in URL tokens
- **ENCRYPTION_SECRET** env var required — SHA-256 derived key
- **No API keys in encoded IDs** — Sports IDs stripped of download URLs (MD directive)
- **HTTPS everywhere** — All external API calls over TLS
- **No data storage** — Fully stateless, no database, no logs of user activity
- **proxyHeaders for Basic Auth** — File server credentials sent via `Authorization` header using Stremio's `proxyHeaders` behaviorHint, never exposed in URL
- **CORS headers** — Stremio-compatible, restricted to addon protocol needs
- **Input validation** — Config page validates URLs and credentials before encryption

## 7. Performance Requirements

- **Stream response < 10s** — Vercel Hobby tier hard limit
- **Timeout budget:** Jackett 7s (with `&timeout=6` param) + qBit 5s + Cinemeta 3s
- **Parallel queries:** `Promise.allSettled()` — Jackett and qBit queried simultaneously
- **Partial results:** If one service times out, return results from the other
- **Cold start tolerance:** ~500ms acceptable (fast-xml-parser helps minimize bundle)
- **Response size:** Target < 50KB per response (metadata only)

## 8. Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vercel 10s timeout too short for slow trackers | Some searches return partial results | Jackett `&timeout=6` param, aggressive AbortController at 7s, return partial via `allSettled()` |
| qBit session cookie doesn't persist | Extra ~50ms per request for login | Accept cost — unavoidable on serverless |
| Cinemeta service downtime | Movies/TV can't resolve IMDb to title | Fall back to title from Jackett/Prowlarr torrent name parsing |
| fast-xml-parser edge cases in Torznab responses | Parsing failures on malformed XML | Wrap in try/catch, return empty results on parse error |
| Config page XSS via user input | Security vulnerability | Sanitize all inputs, use `textContent` not `innerHTML` |
| Vercel Hobby tier rate limits (100K/month) | Addon stops working mid-month | Monitor usage, document upgrade path to Pro ($20/month) |

---

*Prepared by Colin (CTO) — February 8, 2026*
