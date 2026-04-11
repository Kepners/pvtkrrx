# SportsMeta Boundary

Updated: 2026-04-11

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
- its own runtime caches and sports artwork handling for `pvtkrrx:` items
- qBittorrent/Prowlarr integration and actual stream attachment

## Id Rules

- `sportsmeta:` ids are canonical sports metadata ids owned by SportsMeta.
- `pvtkrrx:` ids are PVTKRRX runtime ids for PVTKRRX-owned catalog rows.
- PVTKRRX may attach streams to `sportsmeta:` ids, but that does not make PVTKRRX the metadata or billing owner.

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

It is now intentionally non-production:

- disabled unless `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA=true`
- exposed only as local draft tooling and draft route code
- not part of the supported public `www.pvtkrrx.cc` surface

