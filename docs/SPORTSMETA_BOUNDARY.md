# SportsMeta Boundary

Updated: 2026-04-29

## Live Truth

SportsMeta is live as a separate addon/service inside the overall PVTKRRX sports stack at `https://sportsmeta.pvtkrrx.cc`.
PVTKRRX remains the separate Stremio-facing stream addon at `https://www.pvtkrrx.cc`.

The shared Contabo VM does not make them the same product.

## Ownership

### SportsMeta owns

- the public SportsMeta hostname and addon surface
- `sportsmeta.service`
- `manifest`, `catalog`, `meta`, `event`, `resolve`, and artwork routes for canonical `sportsmeta:` ids
- the SportsMeta SQLite database and asset cache under `/opt/sportsmeta/data`
- the SportsCult/TheSportsDB coverage policy that decides which categories get scheduled API enrichment versus deterministic generated/default artwork
- premium member routes under `/member/:token/...`
- Stripe checkout, portal, webhook handling, entitlements, and member-token enforcement

### PVTKRRX owns

- the public PVTKRRX hostname and stream-addon surface
- `/:config/stream/...`, local `/file`, `/playback`, and route-specific install/config flows
- internal `pvtkrrx:` ids for its own sports/library rows
- tracker availability anchoring plus `pvtkrrx:` fallback ids for unresolved sports rows
- rendering SportsMeta-owned public canonical or default artwork through PVTKRRX `/sports-artwork/...png` proxy URLs, including client-safe free/glyph fallback poster, landscape, and background composition when the upstream canonical artwork is only generated/SVG artwork
- consuming only SportsMeta public/root artwork routes; Sports Posters member tokens and premium poster bytes stay on SportsMeta member routes
- no SportsMeta member token issuance, Stripe billing ownership, or local entitlement validation
- qBittorrent/Prowlarr integration and actual stream attachment

## Id Rules

- `sportsmeta:` ids are canonical sports metadata ids owned by SportsMeta.
- `pvtkrrx:` ids are PVTKRRX runtime ids for PVTKRRX-owned catalog rows.
- PVTKRRX may attach streams to `sportsmeta:` ids, but that does not make PVTKRRX the metadata or billing owner.

## Availability Vs Identity Rule

- Prowlarr is the availability truth inside PVTKRRX sports browsing:
  - whether a row exists right now
  - torrent title, size, seeders, infohash, and download source
  - whether a stream can actually be offered
- SportsMeta is the identity and enrichment truth:
  - canonical sport, league, team, and event identity
  - canonical naming, alias handling, ambiguity handling, and grouping ids
  - canonical artwork and metadata for resolved events
- SportsMeta must not create sports catalog rows by itself inside PVTKRRX.
  If SportsMeta knows an event exists but Prowlarr does not return a matching tracker item from the user's configured indexers, that event must not appear in the user-facing PVTKRRX catalog.
- PVTKRRX now enforces this as an explicit pipeline:
  - fetch Prowlarr sports availability
  - parse tracker title hints
  - resolve through SportsMeta when hints are strong enough
  - enrich the already-available row if resolution is safe
  - emit the raw canonical `sportsmeta:` id on resolved addon-facing rows while keeping an internal anchor to the original tracker availability
  - keep stream playback tied to the original tracker availability, not to SportsMeta
- SportsMeta resolution outcomes are explicit inside PVTKRRX:
  - `resolved`
  - `ambiguous`
  - `not_found`
  - `weak_match`
  - `fallback_only`
- Ambiguous, weak, or missing SportsMeta matches must stay honest:
  - keep the tracker row visible if it is available
  - keep fallback naming/art conservative
  - do not assign a fake canonical event or misleading artwork
- PVTKRRX may retry missed identity enrichment in a short-lived, in-process background backfill cache after the catalog response has already been returned. That cache stores SportsMeta resolution outcomes only; it does not make PVTKRRX an artwork database owner and it does not create sports rows without Prowlarr availability.
- Any configured Prowlarr indexer can create catalog and stream availability when the returned title passes PVTKRRX's sports filters.
  Category `5060` searches remain the first pass; sparse exact stream searches can also use a broad Prowlarr fallback so sports releases filed under general TV categories are not hidden.
- SportsMeta may audit SportsCult category/demand signals for enrichment planning, but that audit must stay read-only from PVTKRRX's point of view. It cannot create PVTKRRX catalog rows without live Prowlarr availability.

## Failure Rules

### If SportsMeta is down

- SportsMeta public install, metadata, and artwork routes fail on the SportsMeta host.
- PVTKRRX can still attempt stream attachment for `sportsmeta:event:` ids by parsing the canonical id locally.
- that fallback is weaker than a live SportsMeta lookup because it loses live event enrichment and SportsMeta-owned artwork URLs

### If a SportsMeta licence is revoked

- SportsMeta member image routes degrade to free artwork or fail with member-token errors, depending on route and token state
- public/free SportsMeta routes remain available
- PVTKRRX configured stream routes remain free and are not blocked by SportsMeta billing state

## Paid Sports Posters Boundary

- PVTKRRX remains free.
- Sports Posters is a SportsMeta entitlement for sports artwork only.
- PVTKRRX configs must not become a Sports Posters entitlement transport. The paid install/artwork path is the SportsMeta member URL under `https://sportsmeta.pvtkrrx.cc/member/:token/...`.
- For canonical `sportsmeta:` sports rows, PVTKRRX emits PVTKRRX `/sports-artwork/...png` raster-proxy URLs backed by SportsMeta public/root routes only. This is a client-compatibility transport for free/public SVG or glyph-style artwork, not a premium route.
- Free/fallback sports artwork stays on the same PVTKRRX `/sports-artwork/...png` raster proxy. The proxy calls SportsMeta public/default assets, carries the event title/date when known, and must not call member-scoped SportsMeta routes.
- Stripe is never called by PVTKRRX while catalog/meta/artwork routes are being served.
- SportsMeta validates the member token locally, reads its SQLite catalogue locally, and streams cached raster assets from `/opt/sportsmeta/data/assets/cache`.

## Shared But Acceptable Coupling

- same Contabo VPS
- same Caddy edge and internal network
- PVTKRRX can use `PVTKRRX_SPORTSMETA_INTERNAL_BASE_URL` from inside the Coolify container as a same-box network shortcut
- SportsMeta bootstrap imports currently ingest existing PVTKRRX runtime cache directories

These are infrastructure couplings, not proof of one product.

## Coupling To Reduce Next

- SportsMeta bootstrap imports still start from PVTKRRX cache roots instead of a fully self-owned ingest pipeline
- SportsMeta now owns a policy-driven scheduled ingest, but live SportsCult demand audit is still operator-triggered rather than a closed-loop automatic promotion/purge system
- PVTKRRX still owns fallback row ids, tracker-availability anchors, and final addon-facing PNG normalization/composition for unresolved or generated-artwork sports rows, even though identity and source artwork still come from SportsMeta
- same-box internal networking still exists between the hosted PVTKRRX relay and the SportsMeta service
- import quality cleanup is still needed for some SportsMeta alias mappings

## Experimental Draft Inside PVTKRRX

The old integrated `/sportsmeta/*` draft inside `pvtkrrx` is not the live boundary.

It has now been removed from the live product boundary:

- the legacy PVTKRRX-owned `/thumb/sports/...` and `/image/sports/...` artwork routes return `HTTP 410 Gone`
- live sports metadata/artwork ownership now sits fully in SportsMeta
- any remaining planning docs that mention the integrated draft are historical context only, not current runtime behavior
