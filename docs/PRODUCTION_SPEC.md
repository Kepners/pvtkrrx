# Production Spec: SportsMeta (Integrated Feature)

> **Author:** Peter (Production Engineer)
> **Date:** April 7, 2026
> **Status:** Approved at Concept Meeting — ready for build
> **Supersedes:** `PRODUCTION_SPEC_HISTORICAL.md` (archived)

---

## 1. Decision Summary

| Decision | Answer |
|----------|--------|
| Standalone or integrated? | **Integrated** — new routes on existing PVTKRRX Express server |
| Customer | PVTKRRX users only (not third-party addon devs) |
| MVP scope | Full metadata + images: JSON endpoint returning event enrichment |
| Pricing model | **Freemium** — free gets generated SVG cards, paid gets real TheSportsDB artwork |
| Revenue priority | Strategic moat, not revenue-chasing |
| TheSportsDB API key | Stays private — all lookups run server-side on Contabo |

---

## 2. New Routes

### 2.1 JSON Metadata Endpoint

```
GET /sportsmeta/event
```

**Query parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `league` | yes | League name or mapped alias (e.g. `Premier League`, `EPL`, `UFC`) |
| `date` | no | ISO date `YYYY-MM-DD` — narrows event lookup |
| `home` | no | Home team name (vs-style events) |
| `away` | no | Away team name (vs-style events) |
| `event` | no | Event name (non-vs events like F1, UFC cards) |
| `sport` | no | Sport hint key (e.g. `football`, `mma`, `motorsport`) |
| `title` | no | Raw torrent-style title — parser extracts league/date/teams |

**Lookup priority:**
1. If `title` provided, run through `parseSportsTitle()` / `parseSportsEventTitle()` to extract structured fields
2. Use `league` + `date` + `home`/`away` or `event` to query `SportsDbClient.getEventArtwork()`
3. Resolve artwork via existing `resolveSportsPosterAsset()` / `resolveSportsBackgroundAsset()` / `resolveSportsLogoAsset()`

**Response (200):**

```json
{
  "match": true,
  "event": {
    "name": "Manchester City vs Arsenal",
    "league": "English Premier League",
    "date": "2025-12-14",
    "sport": "football",
    "homeTeam": "Manchester City",
    "awayTeam": "Arsenal"
  },
  "artwork": {
    "poster": "https://pvtkrrx.kepners.com/image/sports/poster/v1.xxx.yyy",
    "thumb": "https://pvtkrrx.kepners.com/image/sports/landscape/v1.xxx.yyy",
    "background": "https://pvtkrrx.kepners.com/image/sports/background/v1.xxx.yyy",
    "homeBadge": "https://pvtkrrx.kepners.com/image/sports/logo/v1.xxx.yyy",
    "awayBadge": "https://pvtkrrx.kepners.com/image/sports/logo/v1.xxx.yyy",
    "leagueLogo": "https://pvtkrrx.kepners.com/image/sports/logo/v1.xxx.yyy"
  },
  "tier": "free"
}
```

**No match (200):**

```json
{
  "match": false,
  "event": null,
  "artwork": null,
  "tier": "free"
}
```

### 2.2 Freemium Gate Behavior

The `artwork` object changes based on tier:

| Field | Free tier | Paid tier |
|-------|-----------|-----------|
| `poster` | Generated SVG card URL (`/thumb/sports/poster/...`) | Real TheSportsDB image (`/image/sports/poster/...`) |
| `thumb` | Generated SVG card URL (`/thumb/sports/...`) | Real TheSportsDB image (`/image/sports/landscape/...`) |
| `background` | Generated SVG card URL (`/thumb/sports/background/...`) | Real TheSportsDB image (`/image/sports/background/...`) |
| `homeBadge` | `null` (not generated) | Real team badge URL |
| `awayBadge` | `null` (not generated) | Real team badge URL |
| `leagueLogo` | `null` (not generated) | Real league logo URL |

**The `event` metadata is always returned regardless of tier.** Only the artwork source changes.

**Tier detection:** Determined by the PVTKRRX config token. The existing `FREE_MODE` / subscription infrastructure in `shared.js` will gate this. For MVP, all existing PVTKRRX users with a valid config token get paid tier (since the addon is currently free). The gate exists in code but defaults open.

### 2.3 Existing Image Routes (No Changes)

These routes already exist and serve both tiers:

| Route | Purpose | Tier |
|-------|---------|------|
| `GET /image/sports/:variant/:token` | Serves cached TheSportsDB images from disk | Paid |
| `GET /thumb/sports/:variant/:info.png` | Renders generated SVG cards as PNG via sharp | Free |
| `GET /thumb/sports/:variant/:info.svg` | Serves raw SVG cards | Free |

No modifications needed. The freemium gate lives entirely in the JSON metadata endpoint response — it controls which URL class is returned, not the image routes themselves.

---

## 3. Code Reuse Map

### Reused as-is (zero changes)

| Module | What it does | Lines |
|--------|-------------|-------|
| `src/utils/sportsImageCache.js` | Permanent file cache, signed tokens, SSRF protection, in-flight dedup | ~450 |
| `src/utils/sportsCacheSeeder.js` | League/event/team discovery, concurrent image download pipeline | ~615 |
| `src/utils/sportsCacheAutofill.js` | 15-min background seeder cron | existing |
| `src/utils/sportsArtwork.js` | Artwork priority resolution (exact > landscape > generated > fallback) | ~150 |
| `src/utils/sportsTitleParser.js` | Torrent filename parser (league/date/teams extraction) | ~310 |
| `src/utils/sportsThumb.js` | Generated SVG poster/landscape/matchup/fight card rendering | ~435 |
| `src/config/sportsCatalogs.js` | Sport category definitions and seed terms | ~165 |
| `src/utils/leagueMap.js` | League name normalization and alias mapping | existing |
| `src/utils/sportsRules.js` | Sport detection, noise filtering | existing |
| `src/utils/sportClassifier.js` | Sport category detection from titles | existing |

### Reused with thin wrapper

| Module | What's needed |
|--------|--------------|
| `src/clients/sportsdb.js` | `SportsDbClient.getEventArtwork()` — already does the full lookup. The JSON endpoint wraps this call and reformats the response. |
| `src/handlers/meta.js` | `handleCustomMeta()` contains the artwork resolution flow. The SportsMeta endpoint extracts the same logic path but returns JSON instead of Stremio meta objects. |

### New code required

| File | Purpose | Estimate |
|------|---------|----------|
| `src/handlers/sportsmeta.js` | JSON metadata endpoint handler — accepts query params, calls SportsDbClient, resolves artwork, applies freemium gate, returns JSON | ~120-150 lines |
| Route registration in `index.js` | `app.get('/sportsmeta/event', ...)` — wiring only | ~15 lines |
| Rate limiter entry | Add `sportsmeta` to `rateLimiters` in `shared.js` | ~3 lines |

**Total new code: ~170 lines.** Everything else is reuse.

---

## 4. Build Order

### Phase 1: Core JSON Endpoint (Days 1-3)

1. Create `src/handlers/sportsmeta.js`
   - Accept query params (`league`, `date`, `home`, `away`, `event`, `sport`, `title`)
   - If `title` provided: parse via `parseSportsTitle()` / `parseSportsEventTitle()` to extract structured fields
   - Call `SportsDbClient.getEventArtwork()` with extracted/provided fields
   - Run result through `resolveSportsPosterAsset()`, `resolveSportsBackgroundAsset()`, `resolveSportsLogoAsset()`
   - Return JSON response with `event` + `artwork` objects
2. Wire route in `index.js` — `GET /sportsmeta/event`
3. Add rate limiter (reuse existing pattern from `rateLimiters`)
4. Smoke test: `npm run smoke:sportsmeta`

### Phase 2: Freemium Gate (Days 3-4)

1. Add tier detection logic to `sportsmeta.js`
   - Check config token / subscription state
   - If free tier: return `/thumb/sports/...` URLs (generated cards) for poster/thumb/background, `null` for badges
   - If paid tier: return `/image/sports/...` URLs (real TheSportsDB images)
2. Gate defaults open for MVP (all valid config tokens = paid tier)
3. Add `tier` field to response

### Phase 3: Input Flexibility + Edge Cases (Days 4-6)

1. Handle raw `title` param parsing — test against known torrent filename patterns
2. Handle partial matches (league found but no event match) — return league-level fallback artwork
3. Handle non-vs events (F1 qualifying, UFC fight nights) via `parseSportsEventTitle()`
4. Cache response JSON in-memory (short TTL, ~60s) to avoid redundant SportsDB lookups for repeated queries
5. Test against the 3,109+ cached images to verify artwork URL generation

### Phase 4: Polish + Deploy (Days 6-8)

1. Add CORS headers for browser consumption (if needed beyond existing allowlist)
2. Response compression (existing Express middleware should handle)
3. Add `Cache-Control` headers to JSON responses (short TTL for metadata, long TTL for image URLs)
4. Deploy to Contabo via Coolify — same app, same container, same push-to-deploy
5. Verify on live: hit `/sportsmeta/event?league=Premier+League&date=2026-04-07&home=Arsenal&away=Chelsea`

---

## 5. Deployment

| Item | Value |
|------|-------|
| Target | Existing PVTKRRX Coolify app on Contabo VPS |
| Container | Same Node.js container — no new service |
| Image cache volume | Already mounted — `/sports-image-cache` with 3,109+ images (713MB) |
| TheSportsDB key | Already in environment (`SPORTSDB_API_KEY`) |
| Background seeder | Already running (15-min autofill via `sportsCacheAutofill.js`) |
| HTTPS termination | Caddy (existing) |
| CI/CD | Push to `main` -> Coolify auto-deploys |

**No new infrastructure.** No new DNS. No new containers. No new env vars for MVP.

---

## 6. Timeline

| Phase | Days | Deliverable |
|-------|------|-------------|
| Phase 1: Core JSON endpoint | 1-3 | `/sportsmeta/event` returns real data |
| Phase 2: Freemium gate | 3-4 | Free vs paid artwork switching |
| Phase 3: Input flexibility | 4-6 | Raw title parsing, partial matches, edge cases |
| Phase 4: Polish + deploy | 6-8 | Live on Contabo, tested, cached |

**Total: 8 working days to shippable MVP.**

Buffer for unknowns: the SportsDB client already handles rate limits, retries, and fuzzy matching. The risk is low because we're wrapping proven code, not writing new matching logic.

---

## 7. What This Is NOT

- **Not a standalone service** — no separate repo, no separate domain, no separate container
- **Not an npm package** — other devs don't install anything
- **Not a Stremio catalog addon** — it's an HTTP JSON API consumed by the PVTKRRX addon internally (and exposed for future external consumers if the moat strategy evolves)
- **Not revenue-critical** — the gate exists for future monetization but defaults open

---

## 8. Future Considerations (Post-MVP)

- **Batch endpoint** — `POST /sportsmeta/events` accepting an array of queries for catalog-page enrichment
- **WebSocket/SSE** — push new event artwork to connected clients as the seeder discovers them
- **External API keys** — if third-party addon devs want access, issue API keys with rate limits
- **CDN layer** — if image traffic grows, put Cloudflare or MinIO gateway in front of `/image/sports/`
- **Stremio catalog addon surface** — expose the enriched sports catalog as an installable addon for non-PVTKRRX users

---

*Signed: Peter, Production Engineer*
*April 7, 2026*
