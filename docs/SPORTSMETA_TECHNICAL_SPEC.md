# SportsMeta Technical Specification

> **Status:** Draft - local integrated-route proposal, not the live Contabo state
> **Author:** Colin (CTO)
> **Date:** 2026-04-10
> **Parent project:** PVTKRRX
> **Depends on:** `sportsdb.js`, `sportsImageCache.js`, `sportsCacheSeeder.js`, `sportsArtwork.js`, `sportsThumb.js`

> **Verified audit note (2026-04-10):** this file does not describe the current live Contabo deployment.
> Public `https://www.pvtkrrx.cc/sportsmeta/event?...` still returns `404`, the live `pvtkrrx`
> container does not include the SportsMeta handler/catalogue files described here, and the mounted
> runtime does not contain `sportsmeta-catalogue.sqlite`. Treat this as a draft local proposal only.

---

## 1. Scope

SportsMeta is an internal metadata and artwork layer integrated into the existing PVTKRRX Express server. It runs on the same Contabo-hosted runtime as the main addon and reuses the current sports cache/catalogue assets already being built for PVTKRRX.

In scope:

- `GET /sportsmeta/event` style metadata response inside the current app
- yearly upgrade gate from generated SVG artwork to real SportsMeta artwork
- reuse of the existing `sportsdb-poster-cache.json` metadata store
- reuse of the existing `sports-image-cache/` image catalogue as the SportsMeta base inventory
- continued use of the existing background cache seeder/autofill pipeline

Out of scope for v1:

- separate service
- separate domain
- separate container
- third-party public developer API
- billing implementation details beyond the entitlement hook
- MinIO/object-storage migration

---

## 2. Runtime Shape

SportsMeta mounts inside the existing PVTKRRX app:

```text
PVTKRRX Express app
  /image/sports/:variant/:token      existing cached real artwork
  /thumb/sports/:variant/:info.svg   existing generated SVG fallback art
  /sportsmeta/event                  new JSON event metadata endpoint
  /:config/sportsmeta/event          config-scoped JSON event metadata endpoint
```

There is no second runtime. The same Contabo-hosted PVTKRRX deployment owns:

- token/config handling
- SportsMeta route execution
- image caching
- background seeding
- future entitlement checks

---

## 3. Tier Model

SportsMeta v1 uses two artwork tiers:

- `svg`: base tier, generated SVG cards only
- `sportsmeta`: yearly upgrade tier, real cached sports artwork when available

The route contract should not care how billing is implemented later. The tier can be resolved from:

- config token fields such as `sportsmetaTier` / `sportsmetaEntitlement`
- temporary env overrides for rollout/testing
- later yearly billing/entitlement state

v1 rule:

- metadata always returns
- artwork source changes by tier

---

## 4. Request Flow

```text
request
  -> existing config token / local-config middleware
  -> SportsMeta tier resolution (`svg` or `sportsmeta`)
  -> structured sports identity extraction from query/title
  -> `sportsmeta-catalogue.sqlite` alias lookup
  -> `SportsDbClient.getEventArtwork()` cache fallback
  -> artwork response shaping
  -> JSON response
```

If real artwork is unavailable, both tiers still return useful metadata. The `sportsmeta` tier may still fall back to generated SVG artwork when the cache has no exact real asset.

---

## 5. Data Contract

### Event response

```json
{
  "match": true,
  "resolved": true,
  "event": {
    "key": "nba.2026-04-08.la-clippers-oklahoma-city-thunder",
    "eventId": "12345",
    "name": "Oklahoma City Thunder vs LA Clippers",
    "league": "NBA",
    "date": "2026-04-08",
    "sport": "basketball",
    "homeTeam": "Oklahoma City Thunder",
    "awayTeam": "LA Clippers",
    "source": "thesportsdb"
  },
  "artwork": {
    "poster": "https://www.pvtkrrx.cc/image/sports/poster/<token>",
    "thumb": "https://www.pvtkrrx.cc/image/sports/landscape/<token>",
    "landscape": "https://www.pvtkrrx.cc/image/sports/landscape/<token>",
    "background": "https://www.pvtkrrx.cc/image/sports/background/<token>",
    "logo": "https://www.pvtkrrx.cc/image/sports/logo/<token>",
    "leagueLogo": "https://www.pvtkrrx.cc/image/sports/logo/<token>",
    "homeBadge": "https://www.pvtkrrx.cc/image/sports/logo/<token>",
    "awayBadge": "https://www.pvtkrrx.cc/image/sports/logo/<token>"
  },
  "tier": "sportsmeta",
  "source": "thesportsdb"
}
```

### Base-tier response

```json
{
  "match": true,
  "resolved": true,
  "event": {
    "key": "nba.2026-04-08.la-clippers-oklahoma-city-thunder",
    "eventId": "12345",
    "name": "Oklahoma City Thunder vs LA Clippers",
    "league": "NBA",
    "date": "2026-04-08",
    "sport": "basketball",
    "homeTeam": "Oklahoma City Thunder",
    "awayTeam": "LA Clippers",
    "source": "thesportsdb"
  },
  "artwork": {
    "poster": "https://www.pvtkrrx.cc/thumb/sports/poster/<token>.svg",
    "thumb": "https://www.pvtkrrx.cc/thumb/sports/<token>.svg",
    "landscape": "https://www.pvtkrrx.cc/thumb/sports/<token>.svg",
    "background": "https://www.pvtkrrx.cc/thumb/sports/background/<token>.svg",
    "logo": null,
    "leagueLogo": null,
    "homeBadge": null,
    "awayBadge": null
  },
  "tier": "svg",
  "source": "thesportsdb"
}
```

### No-match response

```json
{
  "match": false,
  "resolved": false,
  "event": null,
  "artwork": null,
  "tier": "svg",
  "source": "none"
}
```

---

## 6. Storage Model

SportsMeta v1 deliberately reuses the current PVTKRRX catalogue storage:

- image bytes: `sports-image-cache/`
- structured metadata aliases: `sportsdb-poster-cache.json`
- normalized catalogue database: `sportsmeta-catalogue.sqlite`
- cache warmers: `sportsCacheSeeder.js` and `sportsCacheAutofill.js`

Current practical inventory:

- roughly `700MB+` cached real sports images
- append-only catalogue behavior
- persistent runtime-mounted storage on the live Contabo host

This means SportsMeta does not need a fresh bootstrap store. The current image catalogue is already the first SportsMeta asset base.
The SQLite catalogue stores structured aliases, entitlements, and file-path references back to the runtime image cache; the actual JPG/PNG bytes stay in `sports-image-cache/` instead of being copied into the database.

Operational bootstrap commands:

- `npm run sportsmeta:import -- /opt/pvtkrrx/runtime`
- `npm run sportsmeta:grant -- <accountUserId> 365`

---

## 7. Legal Constraint

Before the yearly `sportsmeta` paid tier goes live:

1. Review TheSportsDB paid-plan redistribution terms.
2. Confirm whether serving cached artwork bytes to paying users is permitted.
3. If not permitted, change the paid tier before launch rather than after launch.

The base `svg` tier carries no TheSportsDB redistribution risk.

---

## 8. Implementation Order

### Phase 1

- add integrated `sportsmeta` event handler inside PVTKRRX
- add root + config-scoped event routes
- rate limit the route
- default base tier to `svg`
- allow config/env override to `sportsmeta`

### Phase 2

- use the same response contract to drive one or more PVTKRRX sports surfaces
- stop adding new direct TheSportsDB-only paths outside the SportsMeta seam
- keep the gate at the response layer, not the storage layer

### Phase 3

- add broader SportsMeta endpoints such as sport catalog, league, and team
- connect yearly billing/entitlement to the same `svg` / `sportsmeta` gate

---

## 9. Decision Summary

SportsMeta v1 is:

- integrated into PVTKRRX
- running on the existing Contabo-hosted runtime
- backed by the existing sports metadata/image catalogue
- designed around a yearly `svg` -> `sportsmeta` upgrade path

SportsMeta v1 is not:

- a separate repo requirement
- a second service requirement
- a second image store
- a greenfield metadata platform
