# SportsMeta Contabo V1 Plan

Status: live v1 with yearly Stripe memberships on Contabo after the 2026-04-11 billing rollout
Updated: 2026-04-11
Owner: PVTKRRX / SportsMeta planning

## Purpose

This document captures the deployed SportsMeta service split after the 2026-04-10 rollout, plus the remaining follow-up work.

Verified Contabo state on 2026-04-11 after deploy:

- SportsMeta is live at `https://sportsmeta.pvtkrrx.cc/manifest.json`
- the pricing page is live at `https://sportsmeta.pvtkrrx.cc/pricing`
- SportsMeta is running as `sportsmeta.service`
- Caddy serves the public hostname from `/opt/stack/caddy/apps-enabled/sportsmeta.pvtkrrx.cc.caddy`
- the separate runtime paths are:
  - app: `/opt/sportsmeta/app`
  - data: `/opt/sportsmeta/data`
  - db: `/opt/sportsmeta/data/db/sportsmeta.sqlite`
  - asset cache: `/opt/sportsmeta/data/assets/cache`
  - source import roots: `/opt/pvtkrrx/runtime` and `/opt/pvtkrrx/data/pvtkrrx` (bootstrap import inputs, not live request-path dependencies)
- the service env now includes `SPORTSMETA_SPORTSDB_API_KEY` for paid-gap-fill/prewarm use
- the service env now also includes the SportsMeta billing keys:
  - `SPORTSMETA_FREE_ASSET_MODE=svg`
  - `SPORTSMETA_MEMBER_TOKEN_SECRET`
  - `SPORTSMETA_STRIPE_SECRET_KEY`
  - `SPORTSMETA_STRIPE_WEBHOOK_SECRET`
  - `SPORTSMETA_STRIPE_PORTAL_CONFIGURATION_ID`
  - `SPORTSMETA_STRIPE_PRICE_PLUS_YEARLY`
  - `SPORTSMETA_STRIPE_PRICE_PRO_YEARLY`
- the live health surface now reports:
  - `recordCount = 2727`
  - `eventCount = 2679`
  - `aliasCount = 8300`
  - `assetCount = 6196`
  - `importRunCount = 3`
  - `sourceDocumentCount = 7302`
  - `evidenceCount = 62791`
  - `customerCount = 2`
  - `subscriptionCount = 2`
  - `activeEntitlementCount = 2`
  - `activeTokenCount = 2`
- public free asset routes now return SVG-only fallback because production runs with `SPORTSMETA_FREE_ASSET_MODE=svg`
- paid SportsMeta is now delivered through tokenized member routes under `/member/:token/...`
- live billing routes:
  - `GET /pricing`
  - `POST /billing/checkout`
  - `GET /billing/success`
  - `POST /billing/portal`
  - `POST /webhooks/stripe`
- live Stripe ids:
  - Plus product `prod_UJcSIIL9W3C4o5`
  - Plus yearly price `price_1TKzDhENYh4p7RxpjEOBDw0c`
  - Pro product `prod_UJcSqt7aILFloN`
  - Pro yearly price `price_1TKzDiENYh4p7RxpgZb09QQN`
  - webhook endpoint `we_1TKzInENYh4p7RxpPpQR9uIt`
- long canonical-id `meta` and `event` routes are fixed live after raising Fastify router `maxParamLength`
- PVTKRRX now consumes the same canonical `sportsmeta:` IDs on configured `/:config/stream/...` routes and stays stream-only
- the old integrated `/sportsmeta/*` draft inside `pvtkrrx` is now explicitly non-production and disabled by default unless `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA=true`
- the current public hosted relay fix is repo commit `f676564` on the `pvtkrrx` side, live through Coolify deployment `372` on container `w14jewmw5ubscrxh8zzfhq7d-082417863890`
- the hosted relay now carries `PVTKRRX_HOST_GATEWAY_HOST=10.0.1.1` so tokenized loopback service URLs can resolve Prowlarr and qBittorrent through the Contabo host gateway from inside the Coolify container
- a configured public stream route for `sportsmeta:event:fighting|2026-04-10|professional-fighters-league|pfl-africa-1-pretoria` now returns a real tracker stream again on `https://www.pvtkrrx.cc/:config/stream/movie/...`

The live production boundary is now:

- a separate service
- on the same Contabo server
- with its own storage, process, and responsibility boundary
- consumed by PVTKRRX rather than buried inside it

If any later planning section in this file disagrees with the live-state section above, the live-state section wins.

This is the cheapest sane path that still creates the right long-term product boundary.

## Decision Summary

SportsMeta v1 should be:

- a small separate Node service on Contabo
- backed by SQLite first
- storing asset files on local disk first
- monetized through Stripe yearly memberships on SportsMeta itself
- prewarming and revalidating via cron or systemd timers
- exposed through the existing Contabo reverse proxy layer
- consumed by PVTKRRX for sports metadata and artwork

SportsMeta v1 should not be:

- another feature path inside the current PVTKRRX runtime
- a Google Drive or Dropbox-powered runtime asset origin
- a full public developer product in v1
- a queue-heavy or multi-service platform build

## Design Rules

1. Keep the service separate even if it lives on the same Contabo box.
2. Keep the stack boring enough to recover by hand from SSH.
3. Download each asset once and serve stable hosted URLs.
4. Make PVTKRRX a consumer only for sports metadata and artwork.
5. Keep billing and entitlements inside SportsMeta, not inside the PVTKRRX stream addon.
6. Keep upgrades obvious:
   - SQLite to Postgres only when concurrency or querying becomes painful
   - local disk to object storage only when asset growth or bandwidth becomes annoying

## Membership Boundary

The live commercial split is now:

- public root SportsMeta routes = free compatibility surface
- public root asset routes = SVG-only fallback
- member token routes under `/member/:token/...` = premium transport
- PVTKRRX configured stream routes stay free and keep attaching streams to the same canonical ids

That is the key production guardrail. Premium enforcement happens on SportsMeta output, not on PVTKRRX streams.

## V1 Architecture

### Runtime

- API: Node.js
- Web framework: Fastify
- Process manager: systemd
- Scheduler: cron or systemd timers

### Storage

- Metadata DB: SQLite
- Asset storage: local disk under a dedicated SportsMeta data directory
- Backups: filesystem-level copies of the SQLite db, asset directory, and env/config

### Reverse Proxy

The original cheap-stack sketch said Nginx. On this Contabo host, that is the wrong choice.
The VPS already uses Caddy as the public reverse proxy, so v1 should reuse Caddy instead of
adding a second proxy tier.

Current public shape:

- `sportsmeta.pvtkrrx.cc` -> Fastify API plus hosted artwork routes
- `sportsmeta.pvtkrrx.cc/asset/:variant/:id` -> public SVG-first asset routes
- `sportsmeta.pvtkrrx.cc/member/:token/...` -> premium member transport
- `sportsmeta.pvtkrrx.cc/pricing` -> public pricing and upgrade page

Optional later split if needed:

- `assets.sportsmeta.pvtkrrx.cc` for static assets only

## Proposed Contabo Layout

```text
/opt/sportsmeta/
  app/
    src/
    package.json
    dist/
  data/
    db/
      sportsmeta.sqlite
    assets/
      events/
      teams/
      competitions/
    logs/
  scripts/
    prewarm-upcoming.sh
    prewarm-yesterday.sh
    revalidate-stale.sh
```

Current process shape:

- Fastify app currently listens on `0.0.0.0:3210`
- systemd unit keeps the service alive
- Caddy reverse proxies `sportsmeta.pvtkrrx.cc` to `10.0.1.1:3210`
- artwork is currently served through the app's `/asset/:variant/:id` routes

## Data Model

### `events`

- `id`
- `sport`
- `competition_id`
- `event_name`
- `event_slug`
- `event_date`
- `event_time`
- `home_team_id`
- `away_team_id`
- `season`
- `round`
- `status`
- `provider_status`
- `last_resolved_at`
- `last_revalidated_at`

### `teams`

- `id`
- `sport`
- `canonical_name`
- `slug`
- `country`
- `created_at`
- `updated_at`

### `competitions`

- `id`
- `sport`
- `canonical_name`
- `slug`
- `country`
- `season_label`
- `created_at`
- `updated_at`

### `provider_mappings`

- `id`
- `provider`
- `provider_type`
- `provider_key`
- `event_id`
- `team_id`
- `competition_id`
- `raw_payload_json`
- `last_seen_at`

### `assets`

- `id`
- `owner_type`
- `owner_id`
- `asset_type`
- `relative_path`
- `mime_type`
- `checksum`
- `source_url`
- `source_provider`
- `status`
- `width`
- `height`
- `last_fetched_at`

## Asset Strategy

### V1 Rules

- SportsMeta downloads asset bytes once.
- SportsMeta stores bytes locally on disk.
- SportsMeta returns stable public URLs.
- PVTKRRX never hotlinks provider URLs directly.
- PVTKRRX never needs to know where the bytes originally came from.

### URL Shape

Examples:

- `https://sportsmeta.pvtkrrx.cc/assets/events/123/poster.jpg`
- `https://sportsmeta.pvtkrrx.cc/assets/events/123/background.jpg`
- `https://sportsmeta.pvtkrrx.cc/assets/teams/456/logo.png`
- `https://sportsmeta.pvtkrrx.cc/assets/competitions/789/logo.png`

### File Naming

Use deterministic paths, not temporary random names:

```text
/assets/events/{eventId}/poster.{ext}
/assets/events/{eventId}/background.{ext}
/assets/teams/{teamId}/logo.{ext}
/assets/competitions/{competitionId}/logo.{ext}
```

### Dedupe

At minimum:

- hash downloaded files
- avoid re-downloading identical bytes if the asset is unchanged

Do not build a full image-processing pipeline in v1.

## API Contract

### Public/Internal Read Endpoints

- `GET /health`
- `GET /resolve?title=&date=&sport=&league=&home=&away=`
- `GET /event/:id`
- `GET /event/:id/assets`

### Billing / Membership Endpoints

- `GET /pricing`
- `POST /billing/checkout`
- `GET /billing/success`
- `POST /billing/portal`
- `POST /webhooks/stripe`
- `GET /member/:token`
- `GET /member/:token/manifest.json`
- `GET /member/:token/catalog/:type/:id.json`
- `GET /member/:token/meta/:type/:id.json`
- `GET /member/:token/asset/:variant/:id`
- `GET /member/:token/resolve`

### Internal/Protected Write Endpoints

- `POST /internal/prewarm/upcoming`
- `POST /internal/prewarm/yesterday`
- `POST /internal/revalidate/:id`

Internal endpoints should be:

- localhost-only, or
- protected by a shared secret header

No public admin UI in v1.

## Resolution Model

### On-Demand Resolve

When PVTKRRX requests an event:

1. Check the local SportsMeta DB first.
2. If found, return the canonical event and hosted asset URLs.
3. If not found, resolve it against the upstream provider.
4. Normalize the event, teams, and competition.
5. Download poster/background/logo once.
6. Persist the event, mappings, and assets.
7. Return the canonical result.

This gives lazy fill for real user demand.

### Scheduled Prewarm

v1 prewarm windows:

- yesterday
- today
- next 7 days

This directly targets:

- active fixtures
- recent replays
- near-future cards

### Historical Backfill

Do not ingest the full sports universe in v1.

For older replays:

- resolve on demand
- persist permanently once found

That keeps history aligned to real usage instead of endless bulk ingest.

## PVTKRRX Integration Rule

Once SportsMeta is live enough to answer the required sports surfaces:

- PVTKRRX should stop calling TheSportsDB directly for sports catalog cards and meta art
- PVTKRRX should call SportsMeta only

That is the main product outcome:

- one writer
- many readers
- no per-runtime cold-cache identity problem

## Deployment Shape

### Contabo Service

- repo checkout under `/opt/sportsmeta/app`
- runtime data under `/opt/sportsmeta/data`
- systemd unit for Fastify API
- cron or timer jobs for prewarm/revalidate

### Caddy Route

Add a dedicated Caddy route fragment for:

- `sportsmeta.pvtkrrx.cc`

Route behavior:

- proxy API traffic to `127.0.0.1:3100`
- serve `/assets/` statically from `/opt/sportsmeta/data/assets`

### Logging

Use:

- journald for app/service logs
- file logs only if a specific operational reason appears

## Backup Plan

Back up:

- `/opt/sportsmeta/data/db/sportsmeta.sqlite`
- `/opt/sportsmeta/data/assets/`
- service env/config files

That is enough to recover the whole v1 service.

Cheap recovery model:

- nightly tarball
- copy to backup location already used on the server

## Security Rules

- keep the public API minimal
- keep prewarm and revalidate routes protected
- lightly rate-limit `/resolve`
- do not expose provider secrets to clients
- do not expose local filesystem paths in responses
- keep Stripe secrets and member-token secrets server-only
- do not claim premium access unless the member token resolves to an active server-side entitlement

## What V1 Must Not Include

- no admin dashboard
- no fake billing buttons or frontend-only entitlement logic
- no billing logic inside PVTKRRX
- no public API key product
- no queue system
- no Redis
- no Postgres yet
- no object storage migration yet
- no second reverse proxy stack

## Upgrade Triggers

### Move SQLite to Postgres When

- write concurrency becomes annoying
- query complexity grows materially
- migrations and operational tooling become painful

### Move Local Disk Assets to MinIO/R2 When

- asset growth becomes awkward on VPS disk
- bandwidth starts mattering
- CDN behavior becomes important
- service split across machines becomes likely

## Build Phases

### Phase 1: Skeleton

- create the service skeleton
- add SQLite schema
- add `/health`
- add Caddy route
- add systemd unit

### Phase 2: Resolution

- implement `GET /resolve`
- normalize competition/team/event identity
- persist provider mappings
- persist canonical event records

### Phase 3: Assets

- download poster/background/logo once
- save bytes to local disk
- save asset metadata to SQLite
- return stable hosted asset URLs

### Phase 4: PVTKRRX Integration

- switch sports catalog and meta lookup to SportsMeta
- stop relying on direct TheSportsDB hot paths in PVTKRRX

### Phase 5: Prewarm

- add cron or timer jobs for:
  - yesterday
  - today
  - next 7 days
- add revalidate endpoint for stale records

## Current Commercial State

The production system now runs the intended paid-upgrade boundary:

1. Free users install the public addon and get SVG-only assets.
2. Plus and Pro users upgrade through Stripe Checkout on SportsMeta itself.
3. Stripe webhook events sync entitlements into the SportsMeta SQLite DB.
4. The server issues member-token transport URLs under `/member/:token/...`.
5. PVTKRRX continues to consume canonical ids without becoming the metadata owner or billing owner.

## Remaining Backlog

- [x] Add a policy-driven SportsCult/SportsDB scheduled ingest strategy so major sports stay covered without broad default API/storage growth
- [x] Add operator tooling for the SportsCult coverage plan and read-only demand audit
- [x] Reduce live SportsMeta scheduled ingest cadence from every 2 hours to every 6 hours after the policy deployment
- [ ] Observe the first full production run of the new `major` policy and record the API/request/storage result
- [ ] Run the SportsCult demand audit with explicit Prowlarr env if SportsMeta is allowed read-only Prowlarr access
- [ ] Decide DB/cache purge or compaction only after policy-run proof shows default-generated categories are safe to keep lightweight
- [ ] Watch the first real paid customers through Stripe webhooks and the portal path instead of only smoke tokens
- [ ] Decide whether SportsMeta should later add lifetime/manual offers on top of the current yearly-first model
- [ ] Improve import quality and alias contamination without weakening canonical-id stability
- [ ] Add more premium asset coverage so Plus/Pro hit SVG fallback less often on edge leagues
- [ ] Decide whether SportsMeta stays as `systemd + Caddy` or later moves behind Coolify without changing the separate hostname and token boundary

## Relationship To Existing Docs

Use this file as the implementation decision for v1.

The earlier docs remain useful context:

- `docs/SPORTSMETA_CATALOGUE_ARCHITECTURE.md`
- `docs/SPORTSMETA_TECHNICAL_SPEC.md`
- `docs/SPORTSMETA_SCOPE_OF_WORKS.md`

But for implementation direction, this file wins:

- separate service
- Contabo-first
- SQLite first
- local asset storage first
- PVTKRRX as consumer only
