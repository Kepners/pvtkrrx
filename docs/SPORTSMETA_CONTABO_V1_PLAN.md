# SportsMeta Contabo V1 Plan

Status: live v1 baseline on Contabo after the 2026-04-10 rollout, refreshed 2026-04-11
Updated: 2026-04-11
Owner: PVTKRRX / SportsMeta planning

## Purpose

This document captures the deployed SportsMeta service split after the 2026-04-10 rollout, plus the remaining follow-up work.

Verified Contabo state on 2026-04-11 after deploy:

- SportsMeta is live at `https://sportsmeta.pvtkrrx.cc/manifest.json`
- SportsMeta is running as `sportsmeta.service`
- Caddy serves the public hostname from `/opt/stack/caddy/apps-enabled/sportsmeta.pvtkrrx.cc.caddy`
- the separate runtime paths are:
  - app: `/opt/sportsmeta/app`
  - data: `/opt/sportsmeta/data`
  - db: `/opt/sportsmeta/data/db/sportsmeta.sqlite`
  - asset cache: `/opt/sportsmeta/data/assets/cache`
  - source import roots: `/opt/pvtkrrx/runtime` and `/opt/pvtkrrx/data/pvtkrrx`
- the service env now includes `SPORTSMETA_SPORTSDB_API_KEY` for paid-gap-fill/prewarm use
- the live health surface now reports:
  - `recordCount = 2727`
  - `eventCount = 2679`
  - `aliasCount = 8300`
  - `assetCount = 6196`
  - `importRunCount = 3`
  - `sourceDocumentCount = 7302`
  - `evidenceCount = 62791`
- long canonical-id `meta` and `event` routes are fixed live after raising Fastify router `maxParamLength`
- PVTKRRX now consumes the same canonical `sportsmeta:` IDs on configured `/:config/stream/...` routes and stays stream-only
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
- prewarming and revalidating via cron or systemd timers
- exposed through the existing Contabo reverse proxy layer
- consumed by PVTKRRX for sports metadata and artwork

SportsMeta v1 should not be:

- another feature path inside the current PVTKRRX runtime
- a new paid platform bill on day one
- a Google Drive or Dropbox-powered runtime asset origin
- a full public developer product in v1
- a queue-heavy or multi-service platform build

## Design Rules

1. Keep the service separate even if it lives on the same Contabo box.
2. Keep the stack boring enough to recover by hand from SSH.
3. Download each asset once and serve stable hosted URLs.
4. Make PVTKRRX a consumer only for sports metadata and artwork.
5. Keep upgrades obvious:
   - SQLite to Postgres only when concurrency or querying becomes painful
   - local disk to object storage only when asset growth or bandwidth becomes annoying

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
- `sportsmeta.pvtkrrx.cc/asset/:variant/:id` -> hosted poster/background/logo bytes

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

## What V1 Must Not Include

- no admin dashboard
- no billing work
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

## Immediate Planning Decisions

These still need confirming before implementation starts:

1. Domain:
   - use `sportsmeta.pvtkrrx.cc` by default unless a better hostname is preferred
2. Repository ownership:
   - separate repo is preferred once implementation starts
   - if implementation begins here temporarily, the service should still be deployed as a separate app
3. Upstream provider order:
   - confirm whether v1 still starts with TheSportsDB as the only live provider
4. Asset path strategy:
   - keep `/assets/` under the API host for v1 unless Caddy/static routing proves awkward

## Initial Execution Backlog

- [ ] Decide final hostname and Caddy route name
- [ ] Decide whether SportsMeta starts in a new repo immediately or is scaffolded here first
- [ ] Define the SQLite schema and migration files
- [ ] Define the exact `GET /resolve` response contract
- [ ] Define the upstream provider adapter interface
- [ ] Stand up a local dev service and a Contabo systemd unit
- [ ] Add prewarm scripts for yesterday, today, and next 7 days
- [ ] Switch one narrow PVTKRRX sports surface to consume SportsMeta first

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
