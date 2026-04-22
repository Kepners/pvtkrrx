# SportsMeta Boundary

Updated: 2026-04-12

## Live Truth

SportsMeta is live as a separate addon and paid metadata/artwork product at `https://sportsmeta.pvtkrrx.cc`.
PVTKRRX remains the separate stream addon at `https://www.pvtkrrx.cc`.

The shared Contabo VM does not make them the same product.

## Ownership

### SportsMeta owns

- the public SportsMeta hostname and addon surface
- `sportsmeta.service`
- `manifest`, `catalog`, `meta`, `event`, `resolve`, and artwork routes for canonical `sportsmeta:` ids
- the SportsMeta SQLite database and asset cache under `/opt/sportsmeta/data`
- premium member routes under `/member/:token/...`
- Stripe checkout, portal, webhook handling, entitlements, and member-token enforcement

### PVTKRRX owns

- the public PVTKRRX hostname and stream-addon surface
- `/:config/stream/...`, local `/file`, `/playback`, and route-specific install/config flows
- internal `pvtkrrx:` ids for its own sports/library rows
- tracker availability anchoring plus `pvtkrrx:` fallback ids for unresolved sports rows
- rendering SportsMeta-owned canonical or default artwork URLs on addon responses without making independent sports artwork decisions
- qBittorrent/Prowlarr integration and actual stream attachment

## Id Rules

- `sportsmeta:` ids are canonical sports metadata ids owned by SportsMeta.
- `pvtkrrx:` ids are PVTKRRX runtime ids for PVTKRRX-owned catalog rows.
- PVTKRRX may attach streams to `sportsmeta:` ids, but that does not make PVTKRRX the metadata or billing owner.

## Availability Vs Identity Rule

- SportsCult / Prowlarr is the availability truth inside PVTKRRX sports browsing:
  - whether a row exists right now
  - torrent title, size, seeders, infohash, and download source
  - whether a stream can actually be offered
- SportsMeta is the identity and enrichment truth:
  - canonical sport, league, team, and event identity
  - canonical naming, alias handling, ambiguity handling, and grouping ids
  - canonical artwork and metadata for resolved events
- SportsMeta must not create sports catalog rows by itself inside PVTKRRX.
  If SportsMeta knows an event exists but SportsCult / Prowlarr does not return a matching tracker item, that event must not appear in the user-facing PVTKRRX catalog.
- PVTKRRX now enforces this as an explicit pipeline:
  - fetch SportsCult availability
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
- Non-SportsCult indexers may only attach later as supplemental stream candidates after a SportsCult-backed row has already resolved safely to one canonical event.
  They must not create independent catalog identity inside PVTKRRX.

## Failure Rules

### If SportsMeta is down

- SportsMeta public install, metadata, and artwork routes fail on the SportsMeta host.
- PVTKRRX can still attempt stream attachment for `sportsmeta:event:` ids by parsing the canonical id locally.
- that fallback is weaker than a live SportsMeta lookup because it loses live event enrichment and SportsMeta-owned artwork URLs

### If a SportsMeta licence is revoked

- SportsMeta member routes degrade to free behavior or fail with member-token errors, depending on token state
- public/free SportsMeta routes remain available
- PVTKRRX configured stream routes remain free and are not blocked by SportsMeta billing state

## Shared But Acceptable Coupling

- same Contabo VPS
- same Caddy edge and internal network
- PVTKRRX can use `PVTKRRX_SPORTSMETA_INTERNAL_BASE_URL` from inside the Coolify container as a same-box network shortcut
- SportsMeta bootstrap imports currently ingest existing PVTKRRX runtime cache directories

These are infrastructure couplings, not proof of one product.

## Coupling To Reduce Next

- SportsMeta bootstrap imports still start from PVTKRRX cache roots instead of a fully self-owned ingest pipeline
- PVTKRRX still owns some sports artwork/cache behavior for `pvtkrrx:` catalog items
- same-box internal networking still exists between the hosted PVTKRRX relay and the SportsMeta service
- import quality cleanup is still needed for some SportsMeta alias mappings

## Experimental Draft Inside PVTKRRX

The old integrated `/sportsmeta/*` draft inside `pvtkrrx` is not the live boundary.

It has now been removed from the live product boundary:

- the legacy PVTKRRX-owned `/thumb/sports/...` and `/image/sports/...` artwork routes return `HTTP 410 Gone`
- live sports metadata/artwork ownership now sits fully in SportsMeta
- any remaining planning docs that mention the integrated draft are historical context only, not current runtime behavior
