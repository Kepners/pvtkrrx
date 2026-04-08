# SportsMeta Technical Specification

> **Status:** Active — concept-stage spec for the SportsMeta metadata layer
> **Author:** Colin (CTO)
> **Date:** 2026-04-07
> **Parent project:** PVTKRRX
> **Depends on:** sportsdb.js, sportsImageCache.js, sportsCacheSeeder.js, sportsArtwork.js, sportsThumb.js

---

## 1. Scope

SportsMeta is an internal metadata and artwork layer integrated into the PVTKRRX Express server. It exposes structured sports event metadata and cached artwork to PVTKRRX users via new `/sportsmeta/` routes. It is not a separate service.

**In scope:** metadata JSON endpoint, freemium artwork gate, background seeder expansion, existing disk-based image cache.

**Out of scope:** separate domain, separate billing system, non-PVTKRRX consumers, MinIO migration (deferred).

---

## 2. Architecture

### 2.1 Integration Point

SportsMeta routes mount on the existing Express v5 app in `index.js` alongside the current `/image/sports/` and `/thumb/sports/` routes. No new process, no new port, no new deployment.

```
Existing PVTKRRX Express app (index.js)
  |
  +-- /image/sports/:variant/:token     (existing — cached image proxy)
  +-- /thumb/sports/:info.png            (existing — generated PNG card)
  +-- /thumb/sports/:info.svg            (existing — generated SVG card)
  |
  +-- /sportsmeta/event/:eventKey        (NEW — metadata + artwork JSON)
  +-- /sportsmeta/league/:leagueKey      (NEW — league metadata + logo)
  +-- /sportsmeta/team/:teamKey          (NEW — team metadata + badge)
  +-- /sportsmeta/catalog/:sport         (NEW — upcoming events listing)
  +-- /sportsmeta/stats                  (NEW — cache stats, catalogue size)
```

### 2.2 Request Flow

```
PVTKRRX user request
  -> Express router
  -> auth middleware (API key check from config token or query param)
  -> tier resolution (free / paid)
  -> metadata lookup (sportsdb.js persistent store + TheSportsDB API fallback)
  -> artwork resolution (sportsArtwork.js)
  -> freemium gate (swap real artwork URLs for generated SVG URLs if free tier)
  -> JSON response
```

---

## 3. Data Model

### 3.1 Event Metadata Response

```json
{
  "eventKey": "epl.2026-04-12.arsenal-vs-chelsea",
  "sport": "Football",
  "league": "English Premier League",
  "eventName": "Arsenal vs Chelsea",
  "date": "2026-04-12",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "artwork": {
    "poster": "https://www.pvtkrrx.cc/image/sports/poster/<token>",
    "landscape": "https://www.pvtkrrx.cc/image/sports/landscape/<token>",
    "background": "https://www.pvtkrrx.cc/image/sports/background/<token>",
    "logo": "https://www.pvtkrrx.cc/image/sports/logo/<token>",
    "homeBadge": "https://www.pvtkrrx.cc/image/sports/logo/<token>",
    "awayBadge": "https://www.pvtkrrx.cc/image/sports/logo/<token>"
  },
  "tier": "paid",
  "source": "thesportsdb-event"
}
```

### 3.2 Free Tier Response (same structure, different artwork URLs)

```json
{
  "eventKey": "epl.2026-04-12.arsenal-vs-chelsea",
  "sport": "Football",
  "league": "English Premier League",
  "eventName": "Arsenal vs Chelsea",
  "date": "2026-04-12",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "artwork": {
    "poster": "https://www.pvtkrrx.cc/thumb/sports/poster/<generated-token>.svg",
    "landscape": "https://www.pvtkrrx.cc/thumb/sports/landscape/<generated-token>.svg",
    "background": null,
    "logo": null,
    "homeBadge": null,
    "awayBadge": null
  },
  "tier": "free",
  "source": "generated"
}
```

### 3.3 Key Observations

- Free tier gets full metadata (event name, date, teams, league) but only generated SVG artwork. The metadata is the hook; the artwork is the paywall.
- Paid tier gets real TheSportsDB-sourced artwork served through the existing `/image/sports/` proxy cache.
- The `tier` field tells the consuming addon which level it received, so it can show upgrade prompts if desired.

---

## 4. Freemium Gate Mechanism

### 4.1 How It Works

The gate is a response-level transform, not a storage-level split. All artwork is stored once in the disk cache. The gate operates at serve time:

```
1. Resolve event metadata from sportsdb.js persistent store
2. Resolve artwork URLs via sportsArtwork.js (same logic as today)
3. Check caller tier from auth middleware:
   - PAID: return real artwork URLs (existing /image/sports/ proxy tokens)
   - FREE: replace artwork URLs with generated SVG card URLs (existing /thumb/sports/ tokens)
4. Return JSON response with tier field set
```

### 4.2 What Free Users See vs Paid Users

| Asset | Free | Paid |
|-------|------|------|
| Event name, date, teams | Yes | Yes |
| League, sport classification | Yes | Yes |
| Generated SVG poster card | Yes | Yes |
| Generated SVG landscape card | Yes | Yes |
| TheSportsDB poster | No | Yes |
| TheSportsDB landscape | No | Yes |
| TheSportsDB background | No | Yes |
| League logo | No | Yes |
| Team badges | No | Yes |

### 4.3 Implementation Notes

- Generated SVG cards already exist (`sportsThumb.js`). They render sport-themed matchup/event cards with team names, league chips, and date labels. They look decent — dark themed with sport-specific accent colours.
- The gate is a single `if (tier === 'free')` branch in the response builder. No separate data path, no separate cache.
- Badge and logo URLs are nulled for free tier because there is no meaningful generated fallback for those assets.

---

## 5. Auth & Tier Resolution

### 5.1 Authentication

SportsMeta is for PVTKRRX users only. Auth uses the existing PVTKRRX config token system:

- **Option A (primary):** API key derived from the user's encrypted config token, passed as `?key=<token>` or `Authorization: Bearer <token>` header.
- **Option B (internal):** When the PVTKRRX addon itself calls SportsMeta routes internally (same process), no auth needed — the tier is resolved from the user's loaded config.

### 5.2 Tier Resolution

Tier is determined by the user's PVTKRRX subscription state:

- `FREE_MODE = true` (current default): all users are free tier.
- When billing is enabled: tier maps to the user's Stripe subscription status (already stubbed in PVTKRRX billing infrastructure).
- Override: `SPORTSMETA_FREE_ALL=true` env var forces all requests to free tier (useful for launch period).

---

## 6. Storage Architecture

### 6.1 Current State (Keep As-Is)

- **Image blobs:** `sports-image-cache/` directory under the runtime dir. Flat file structure: `<sha256-hash>.<ext>` + `<sha256-hash>.json` metadata sidecar.
- **Metadata store:** `sportsdb-poster-cache.json` — 50k-entry persistent JSON map of TheSportsDB lookups.
- **Append-only:** images are never pruned or expired. The catalogue is the product.
- **Current size:** 3,109+ images, 713MB, growing.

### 6.2 Future Migration Path (Not MVP)

- MinIO is available on the Contabo VPS. When the catalogue exceeds practical disk limits (estimated 50k+ images, ~10GB+), migrate blob storage to MinIO with the same cache-key addressing scheme.
- The migration is a storage backend swap, not an API change. The `/image/sports/` route resolves a file path today; it would resolve a MinIO object key tomorrow.
- No action required for MVP.

---

## 7. Background Seeder

### 7.1 Existing Infrastructure

The seeder pipeline already exists and runs:

- `sportsCacheSeeder.js` — league discovery, event harvesting, concurrent image download
- `sportsCacheAutofill.js` — 15-minute rotation across sport groups on long-running servers
- `sportsdb.js` — TheSportsDB client with persistent 50k-entry store, team/league/event matching

### 7.2 SportsMeta Seeder Requirements

No new seeder needed for MVP. The existing autofill loop already:

1. Rotates through sport groups every 15 minutes
2. Discovers leagues per sport via TheSportsDB
3. Harvests upcoming events per league
4. Downloads poster, landscape, background, logo, and badge assets
5. Persists everything to the append-only disk cache

**Possible enhancement (post-MVP):** increase harvest depth (more leagues, longer lookahead window) and add historical event backfill for completed events that users might search for.

### 7.3 Rate Limit Management

- TheSportsDB free key (`123`): heavily rate-limited, unreliable for catalogue building.
- TheSportsDB paid key: required for serious seeding. Current implementation already respects a 10-minute cooldown on rate limit responses.
- The seeder's concurrency is capped at 6 parallel image downloads (configurable).

---

## 8. Legal Flag

**REQUIRED ACTION: TheSportsDB Terms of Service review.**

Before any external monetisation of SportsMeta:

1. Review the TheSportsDB paid key ToS for redistribution/resale rights on derived assets (cached images served from our infrastructure).
2. Confirm whether hosting and serving cached copies of TheSportsDB artwork to paying users constitutes permitted use under the paid tier.
3. If redistribution is not permitted, evaluate:
   - Serving only generated SVG cards to all users (no real artwork resale)
   - Licensing a higher TheSportsDB tier that permits redistribution
   - Replacing TheSportsDB with alternative/own-sourced artwork over time

**This review must complete before the paid tier goes live.** The free tier (generated SVG cards only) carries no TheSportsDB redistribution risk and can ship independently.

---

## 9. Implementation Order

| Phase | Work | Depends On |
|-------|------|------------|
| 1 | Mount `/sportsmeta/event/:eventKey` route, return metadata JSON with generated SVG artwork (free tier only) | Nothing — uses existing modules |
| 2 | Add `/sportsmeta/catalog/:sport` and `/sportsmeta/stats` routes | Phase 1 |
| 3 | Add auth middleware and tier resolution | Phase 1 + billing infrastructure toggle |
| 4 | Wire paid tier to return real artwork URLs instead of generated SVGs | Phase 3 + legal review |
| 5 | Add `/sportsmeta/league/:leagueKey` and `/sportsmeta/team/:teamKey` routes | Phase 1 |
| 6 | Evaluate MinIO migration if catalogue exceeds disk comfort zone | Phase 4 + scale data |

---

## 10. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| TheSportsDB ToS prohibits redistribution | High | Legal review before paid tier launch. Free tier ships without risk. |
| TheSportsDB rate limits throttle seeder | Medium | Paid key + existing cooldown logic. Seeder already handles this. |
| Disk storage grows beyond VPS capacity | Low | MinIO migration path documented. Current growth rate (~230MB/1k images) gives years of headroom. |
| Event key collisions across leagues | Low | Event keys include league prefix and date. Collision probability is negligible. |
| Auth bypass on SportsMeta routes | Medium | Same auth middleware as existing PVTKRRX sensitive routes. Rate limiting already in place. |

---

*Signed: Colin, CTO*
*2026-04-07*
