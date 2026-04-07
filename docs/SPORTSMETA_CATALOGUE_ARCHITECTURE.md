# SportsMeta Catalogue Architecture

Status: planning draft
Updated: 2026-04-08

## Purpose

This document turns the current sports-art cache work into a product plan.

The target product is a hosted sports metadata and artwork service:

- one master catalogue on Contabo
- one canonical asset origin for posters, logos, backgrounds, and landscape art
- paid access for PVTKRRX users or third-party customers
- zero repeated TheSportsDB lookups and zero repeated image downloads on every client runtime

The short version is:

- today, every runtime can resolve and cache sports artwork for itself
- the next product step is to make Contabo the single writer
- desktop, self-host, and hosted PVTKRRX surfaces then become readers of that shared catalogue

## Current Foundation In This Repo

The codebase already has most of the raw primitives needed for a first version:

- `src/utils/sportsImageCache.js`
  - signed sports image proxy URLs
  - disk-backed cached image bytes
  - append-only image cache behavior
- `src/clients/sportsdb.js`
  - event, structured-event, and league-artwork resolution
  - persistent artwork cache
  - long-lived SportsDB hit caching with short miss retries
- `src/utils/sportsCacheSeeder.js`
  - pre-seeds event, team, and league assets by sport group
- `src/utils/sportsCacheAutofill.js`
  - background refill job that can keep upcoming sports warm over time
- `src/utils/accountStore.js`
  - account persistence with linked Stremio identities
- `index.js` and `src/lib/shared.js`
  - auth endpoints
  - bearer-token plumbing
  - a billing gate hook that currently passes everything through because the addon is free

That means the repo already behaves like a rough internal origin warmer. The missing step is to formalize it as a durable shared service instead of a per-runtime convenience cache.

## Product Definition

Working name: `SportsMeta`

What it sells:

- normalized sports event metadata
- normalized league/team identities
- canonical asset URLs
- durable hosted image bytes
- optional packaged snapshots for customers who want a local mirror

What it does not sell:

- video playback
- torrent discovery
- qBittorrent access
- a generic public image hotlinking proxy with anonymous access

PVTKRRX remains a consumer of this service, not the whole product definition.

## Core Design Principles

1. One writer, many readers.
   - Only the hosted Contabo catalogue ingests upstream metadata and writes canonical records.

2. Durable origin, cheap edges.
   - The master catalogue must live in durable storage.
   - Local runtime disk caches can still exist, but only as optional read-through edge caches.

3. Canonical identities first, images second.
   - The hard problem is stable event and league identity.
   - Asset URLs should hang off canonical IDs, not raw upstream search strings.

4. Internal first, external second.
   - The first customer is the hosted PVTKRRX relay.
   - External paid API customers should be added only after the internal path is stable.

5. No rebuild-driven data loss.
   - A permanent catalogue cannot depend on container filesystem survival.

## Why The Current Setup Is Not Enough

The current permanent cache policy is the right behavior for a consumer runtime, but not yet a product-grade master catalogue.

Main gap:

- the current hosted relay runs in a Coolify container
- the current cache code writes into the runtime directory
- without a mounted durable volume or object store, "permanent" really means "until container replacement"

For a paid catalogue product, the master store must survive:

- app rebuilds
- container replacement
- horizontal scaling
- asset reindexing
- multi-consumer access

That pushes the architecture toward durable metadata storage plus durable object storage.

## Recommended Contabo Architecture

### 1. Metadata Store

Use Postgres for canonical catalogue data.

Why:

- stable primary keys
- queryable event resolution
- usage metering and entitlements belong there anyway
- better fit than giant JSON blobs once external customers exist

Recommended tables:

- `sports_catalog_events`
  - canonical event record
  - event fingerprint
  - sport key
  - league key
  - event date
  - home team key
  - away team key
  - normalized event name
  - source confidence
  - last upstream verification time
- `sports_catalog_leagues`
  - canonical league identity and labels
- `sports_catalog_teams`
  - canonical team identity and labels
- `sports_catalog_assets`
  - asset metadata
  - asset id
  - object key
  - content hash
  - width and height when known
  - variant (`poster`, `background`, `landscape`, `logo`)
  - source URL
  - provenance and first-seen timestamp
- `sports_catalog_event_assets`
  - links events to the chosen canonical asset set
- `sports_catalog_ingest_runs`
  - seeding and autofill audit trail
- `sports_catalog_api_keys`
  - customer or service auth
- `sports_catalog_usage_rollups`
  - monthly or daily metering

### 2. Object Store

Use MinIO on Contabo for master image bytes.

Why:

- the server already has MinIO in the Contabo stack
- object storage is a cleaner fit than growing image directories inside app containers
- canonical image URLs can map to durable object keys
- future CDN or Caddy caching becomes straightforward

Recommended bucket layout:

- bucket: `sportsmeta-assets`
- object key pattern:
  - `v1/{variant}/{sha256}.{ext}`

Important rule:

- store by content hash, not by source URL
- source URLs change and expire
- image bytes do not

### 3. Catalogue API

Keep the first version inside this Express app, but make it a distinct internal module and URL surface.

Suggested API surfaces:

- `GET /catalogue/v1/resolve`
  - input: title, publish date, sport hint, league hint, optional event id
  - output: canonical event record plus asset ids and hosted URLs
- `GET /catalogue/v1/events/:fingerprint`
  - direct canonical event lookup
- `GET /catalogue/v1/leagues/:leagueKey`
  - canonical league data and fallback assets
- `GET /catalogue/v1/assets/:assetId`
  - stable asset response or redirect to object storage origin
- `POST /catalogue/v1/admin/seed`
  - protected ingest trigger
- `POST /catalogue/v1/admin/revalidate`
  - protected re-fetch for stale or low-confidence matches

### 4. Ingest Worker

Split ingest into two modes:

- scheduled warm path
  - reuse the current sport-group seeding and autofill logic
  - write canonical event rows and durable asset objects
- on-demand miss path
  - when a request cannot be served from the catalogue, resolve it once
  - persist the result
  - return the canonical record

That means `sportsdb.js` stops being "runtime local helper only" and becomes the resolver behind the catalogue writer.

### 5. Consumer Modes

There should be three read modes:

- internal hosted PVTKRRX mode
  - server-to-server token
  - no per-user client secret in the addon flow
- paid customer API mode
  - API key or bearer token
  - rate limits and usage metering
- export package mode
  - periodic snapshot for customers who want to host a local mirror

## Canonical Identity Strategy

The service should not use raw upstream event titles as the long-term key.

Recommended event fingerprint:

- `sportKey`
- `leagueKey`
- `eventDate`
- `homeTeamKey`
- `awayTeamKey`
- `eventNameNormalized` for non-vs events

Fingerprint examples:

- football fixture:
  - `football|premier-league|2026-08-17|arsenal|chelsea`
- motorsport session:
  - `motorsport|formula-1|2026-03-28|japanese-grand-prix|qualifying`
- MMA card:
  - `mma|ufc|2026-05-10|fight-night-270|main-card`

The exact string format can change. The important part is that the catalogue owns the canonical identity instead of trusting upstream query text.

## Asset Model

Each canonical event can point to zero or more canonical assets:

- poster
- landscape
- background
- logo

Rules:

- assets are immutable once stored by content hash
- event-to-asset links are mutable
- newer or better upstream art can replace the chosen link without deleting the old object

This gives safer history and easier rollback:

- object bytes are append-only
- only the canonical pointer changes

## Auth, Entitlements, And Billing

The repo already has account linkage and auth-token plumbing. Use that instead of inventing a second identity system.

Recommended model:

- keep Stremio-linked user identity as the primary user record for PVTKRRX customers
- add service/API keys as a second auth mode for external customers
- keep internal hosted PVTKRRX requests on a server-side service token

Suggested entitlement tiers:

- `internal`
  - hosted PVTKRRX relay only
- `personal-addon`
  - paid customer package for personal use in PVTKRRX desktop or self-host
- `developer`
  - third-party API usage
- `snapshot`
  - periodic export package access

Metering candidates:

- resolve requests
- event-detail reads
- asset egress bytes
- admin-triggered refreshes

Important implementation note:

- do not put third-party API keys into Stremio client-visible URLs
- the addon should receive only catalogue URLs or tokenized responses

## Recommended Storage Ownership

Current recommendation:

- Postgres owns metadata, identities, entitlements, and usage
- MinIO owns master image bytes
- runtime disk cache becomes optional edge cache only

Do not make the hosted product depend on:

- container-local `sports-image-cache/` as the sole source of truth
- giant JSON files as the only catalogue database
- per-user runtime directories for the master dataset

## Request Flows

### Internal Hosted PVTKRRX Flow

1. Stream or meta request needs sports artwork.
2. Hosted relay calls internal catalogue resolver with service auth.
3. Catalogue returns canonical event and hosted asset URLs.
4. Hosted relay emits those stable URLs into addon responses.
5. Local runtime may still edge-cache bytes if useful, but it is not the writer.

### Paid Desktop Or Self-Host Package Flow

1. User links account or enters paid package entitlement.
2. Runtime uses a user-scoped catalogue token or API key.
3. Runtime resolves event metadata from the master catalogue.
4. Runtime either uses hosted asset URLs directly or keeps a local edge copy.

### External API Customer Flow

1. Customer calls `resolve` endpoint with title/date/sport hints.
2. Catalogue returns canonical event payload and asset URLs.
3. Usage is metered against API key.

## Suggested Rollout Phases

### Phase 0: Legality And Commercial Guardrails

Before charging for this:

- verify TheSportsDB terms for redistribution, caching, and resale of metadata and artwork
- confirm whether paid redistribution requires a commercial licence or a different source
- decide whether the product can store and resell the bytes, or only broker licensed access

This is the first gate because it affects the whole business model.

### Phase 1: Durable Internal Catalogue

Goal:

- keep PVTKRRX as the only consumer
- move master asset storage off container-local disk

Build:

- Postgres schema
- MinIO object writer
- internal service token
- catalogue read/write module

Success condition:

- hosted PVTKRRX stops doing direct SportsDB lookups on normal hot paths

### Phase 2: Read-Through Consumer Integration

Goal:

- hosted relay reads from the catalogue first
- desktop and self-host can optionally read from the hosted catalogue instead of resolving everything locally

Build:

- catalogue-first lookup adapter
- feature flag for desktop and self-host consumers
- graceful fallback to current local resolver

Success condition:

- most sports artwork requests are catalogue hits

### Phase 3: Paid PVTKRRX Package

Goal:

- sell the catalogue as a PVTKRRX add-on feature

Build:

- entitlement record
- usage metering
- service plan enforcement
- package onboarding in configure flow

Success condition:

- desktop and self-host users can subscribe to the hosted catalogue instead of using their own SportsDB key and cold local warm-up

### Phase 4: External Developer Product

Goal:

- expose a clean API for third-party addons or apps

Build:

- public API docs
- API key issuance
- rate limiting
- customer dashboard

Success condition:

- non-PVTKRRX consumers can pay for the catalogue directly

## Recommended First Build Slice

The first implementation slice should be small and operationally useful:

1. Add a storage adapter layer for sports assets and catalogue records.
   - current local disk writes stay one adapter
   - MinIO and Postgres become the hosted master adapters

2. Add canonical event and asset tables in Postgres.

3. Add a catalogue writer job that reuses:
   - `sportsCacheSeeder.js`
   - `sportsCacheAutofill.js`
   - `sportsdb.js`

4. Add an internal-only `resolve` endpoint for the hosted relay.

5. Switch hosted PVTKRRX sports meta/artwork reads to use the internal catalogue first.

Do not start with:

- Stripe checkout
- customer dashboard
- public API docs
- external SDKs

The product should first prove that one master catalogue actually reduces misses, egress churn, and repeated upstream traffic for PVTKRRX itself.

## Main Risks

### 1. Upstream Rights Risk

Biggest commercial risk:

- the upstream metadata or artwork provider may not allow this exact resale model

If redistribution is restricted, fallback product shapes are:

- sell normalized event identity and resolver results only
- sell customer-hosted snapshot tooling
- sell a brokered service that requires the customer to provide their own upstream key

### 2. Permanent Storage Growth

If the catalogue is append-only:

- bytes only go up
- object storage costs only go up

Mitigation:

- content-hash dedupe
- store canonical chosen assets only at first
- keep raw alternates only when confidence or rollback value justifies them

### 3. Match Quality

If canonical identity is wrong:

- every consumer gets the same wrong answer

Mitigation:

- confidence scores
- low-confidence revalidation queue
- manual admin override for broken high-value leagues/events

### 4. Runtime Drift

Current operational reality:

- hosted relay, desktop release line, self-host release line, and on-box mirrors can drift apart

Mitigation:

- catalogue service should publish its own version and schema status
- release parity should be explicit when catalogue behavior changes

## Decision Summary

Recommended direction:

- yes, build the catalogue product
- build it inside the current repo first
- make Contabo the master writer
- move the master store to Postgres plus MinIO
- keep local runtime caches as optional edge caches
- make hosted PVTKRRX the first customer before opening it to third parties

If that path works, the service can later move into its own repo and hostnames without changing the core model.
