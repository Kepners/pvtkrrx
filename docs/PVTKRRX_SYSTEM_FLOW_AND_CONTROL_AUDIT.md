# PVTKRRX Missing System Truth Audit

Date: 2026-04-23  
Workspace: `C:\Users\kepne\OneDrive\Documents\GitHub\pvtkrrx`

Truth-order sources used for this audit:
1. `docs/CURRENT_DESIGN.md`
2. `docs/ROUTE_FRAMEWORK.md`
3. `docs/STREMIO_INSTALL_TRACKER.md`
4. `docs/PROJECT_STATUS.md`
5. `docs/SPEC.md`
6. `ARCHITECTURE.md`
7. `README.md`
8. `Sport-library-integration.txt` (`missing`)

Supporting context used only after the truth-order docs:
- `docs/SPORTSMETA_BOUNDARY.md`

Evidence labels:
- `ASSUMED`
- `VERIFIED IN DOCS`
- `VERIFIED IN CODE`
- `VERIFIED BY TEST`
- `VERIFIED LIVE`
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`

## A. Verdict

Overall verdict: `READY WITH CAVEATS`

Short version:
- `VERIFIED IN DOCS`, `VERIFIED IN CODE`, `VERIFIED BY TEST`: PVTKRRX is one addon system with a hosted relay, a local runtime, and a Windows Electron wrapper.
- `VERIFIED IN DOCS`, `VERIFIED IN CODE`, `VERIFIED BY TEST`: hosted `/file` and `/playback` do fail fast when the request still depends on local-only serving.
- `VERIFIED IN DOCS`, `VERIFIED IN CODE`, `VERIFIED BY TEST`: sports, movies, TV, and library are still one addon family.
- `VERIFIED IN DOCS`, `VERIFIED IN CODE`, `VERIFIED BY TEST`: sports rows use internal `pvtkrrx:` ids when unresolved and raw canonical `sportsmeta:` ids when resolution is provable.
- `VERIFIED IN DOCS`, `VERIFIED IN CODE`, `VERIFIED LIVE`: SportsMeta is a separate live public addon/service boundary, not a hidden subsection of the public PVTKRRX stream addon.
- `VERIFIED IN CODE`: PVTKRRX does not contain a live Stripe payment or addon-entitlement gate. `requireConfigSubscription()` is a pass-through.
- `VERIFIED IN CODE`: account linking is real, but it currently drives account association and hybrid cloud-takeover behavior, not paid access.
- `VERIFIED IN CODE`, `VERIFIED BY TEST`: the only clearly enforced credential gate in this repo today is the self-host admin password for private self-host config access, plus auth-token protection on `/auth/me`, plus local-route and pair-state guards.

Hard conclusion for the disputed licensing question:

`[NO VERIFIED LIVE STRIPE LICENCE FLOW FOUND]`

That conclusion applies to the PVTKRRX repo and addon-access path.  
`VERIFIED LIVE` and `VERIFIED IN DOCS` do show a separate SportsMeta pricing surface, but that is a separate product/service boundary and not proof that PVTKRRX itself is Stripe-gated.

Subsystem status:

| Subsystem | Status | Current truth |
|---|---|---|
| Hosted relay manifest/config/catalog/meta/stream path | `LIVE BUT PARTIAL` | live and tested, but route naming is still mixed |
| Hosted `/file` and `/playback` fail-fast | `LIVE AND ENFORCED` | 403 on hosted runtime when local-only serving is required |
| PC Local route | `LIVE AND ENFORCED` | local manifest plus local `/file` and `/playback` |
| Home-device hosted route (`LAN Bridge` user-facing / `hybrid` code-facing) | `LIVE BUT PARTIAL` | redirect/fallback logic is live, naming drift remains |
| Stremio account linking | `LIVE BUT PARTIAL` | link session + AuthKey proof + account store are live |
| SportsMeta identity/artwork delegation | `LIVE BUT PARTIAL` | live in code and live on public SportsMeta, but SportsMeta internals are external |
| Local sports SVG/art generation inside PVTKRRX | `SCAFFOLDED / NOT ENFORCED` | removed; old routes now return 410 |
| PVTKRRX Stripe payment | `SCAFFOLDED / NOT ENFORCED` | no code found |
| PVTKRRX addon entitlement enforcement | `SCAFFOLDED / NOT ENFORCED` | middleware attached but no-op |
| SportsMeta paid/member/Stripe layer | `DOC CLAIM ONLY / NOT VERIFIED IN CODE` from this repo | public pricing page is live, but the implementation is outside this repo |

## B. Plain-English explanation/flow

PVTKRRX is one Stremio addon system with three active runtime surfaces: the hosted relay, the local runtime, and the Windows desktop wrapper. The hosted relay issues manifests, encrypted config tokens, link sessions, pair lookups, and hosted route decisions. The local runtime and self-host runtime do the work that actually requires local disk, local qBittorrent access, or private backend URLs. The Windows EXE is the packaged launcher and supervisor for the Windows-local runtime.

SportsMeta is not the same system as the PVTKRRX stream addon. SportsMeta is the separate sports metadata/artwork boundary. PVTKRRX asks SportsMeta to resolve sports identity and to supply artwork URLs, but PVTKRRX still decides whether a sports row exists at all, still owns the tracker availability pipeline, and still owns the actual stream attachment and playback decisions.

Stripe and paid membership do not currently control PVTKRRX addon access in this repo. The repo proves account linking, bearer auth for `/auth/me`, hybrid cloud takeover tied to a linked account, pair-state checks, and self-host password gates. The repo does not prove a Stripe-to-licence-to-addon gate for catalog/meta/stream/file/playback. Today, those addon routes are still effectively free.

### B1. Evidence State Of The Main Disputed Claims

| Claim | ASSUMED | VERIFIED IN DOCS | VERIFIED IN CODE | VERIFIED BY TEST | VERIFIED LIVE | Audit result |
|---|---|---|---|---|---|---|
| PVTKRRX is one addon system with hosted relay + local runtime + Windows wrapper | no | yes | yes | yes | n/a | true |
| Hosted relay does not proxy video bytes | no | yes | yes | yes | n/a | true |
| SportsMeta is a separate service/domain boundary | no | yes | yes | partial | yes | true |
| SportsMeta is the primary sports identity/artwork layer | no | yes | yes | yes | partial | true |
| PVTKRRX still owns sports availability and playback | no | yes | yes | yes | n/a | true |
| PVTKRRX generates sports SVG fallback locally | no | no | no | no | no | false |
| PVTKRRX has a live Stripe licence gate | no | no | no | no | no | false |
| Billing/trial/account state exists in docs/architecture | no | yes | partial | n/a | n/a | true, but not as live addon enforcement |
| Addon access is currently forced free | no | yes | yes | yes | n/a | true |

### B2. Product / System Boundary

#### PVTKRRX boundary

`VERIFIED IN DOCS`
- `docs/CURRENT_DESIGN.md:12-57` defines one codebase with hosted relay, self-host mode, local runtime, and Electron wrapper.
- `docs/CURRENT_DESIGN.md:143-149` and `docs/SPEC.md:21-33` keep one addon family across `PC Local`, `LAN Bridge`, and `Remote Seedbox`.

`VERIFIED IN CODE`
- `index.js` registers the hosted and addon-facing routes.
- `src/lib/shared.js:196-205` creates local file-backed stores for local config, pair state, account state, and Stremio link state.
- `electron/main.js:854-1041` builds heartbeat payloads and sends host liveness back to the relay.

`VERIFIED BY TEST`
- `npm run smoke:config`
- `npm run smoke:lan-pair`
- `npm run smoke:selfhost`

#### SportsMeta boundary

`VERIFIED IN DOCS`
- `docs/CURRENT_DESIGN.md:60-71` says SportsMeta owns canonical `sportsmeta:` ids, metadata routes, artwork routes, member-token routes, and billing.
- `ARCHITECTURE.md:47-53` says SportsMeta owns the separate hostname, service, DB, asset cache, member-token routes, and Stripe billing.
- `docs/PROJECT_STATUS.md:515-571` says the separate `sportsmeta` repo/service is the live boundary on Contabo.

`VERIFIED IN CODE`
- `src/clients/sportsmeta.js:1-2` points at `https://sportsmeta.pvtkrrx.cc` by default.
- `src/clients/sportsmeta.js:167-180` calls external `/event` and `/resolve`.
- `src/clients/sportsmeta.js:183-205` calls external SportsMeta catalog search.
- `index.js:946-957` makes the old PVTKRRX sports-art endpoints return `410 Gone`.

`VERIFIED LIVE`
- `https://sportsmeta.pvtkrrx.cc/manifest.json` is live and responds as a separate addon.
- `https://sportsmeta.pvtkrrx.cc/pricing` is live and explicitly says PVTKRRX stays free while SportsMeta is the optional upgrade.

Audit boundary statement:
- SportsMeta is a separate service/domain/addon boundary.
- From this repo alone, the separate repo boundary is `DOC CLAIM ONLY / NOT VERIFIED IN CODE`.

#### Stripe/payment boundary

`VERIFIED IN DOCS`
- `docs/CURRENT_DESIGN.md:64-65`
- `ARCHITECTURE.md:50-51`
- `docs/PROJECT_STATUS.md:541-567`
- `docs/SPORTSMETA_BOUNDARY.md:20-21`

`VERIFIED LIVE`
- The SportsMeta pricing page says paid membership exists on SportsMeta, not on PVTKRRX.

`VERIFIED IN CODE`
- none in the PVTKRRX runtime. A repo-wide code search returned no Stripe integration.

Audit boundary statement:
- Stripe/payment is outside the PVTKRRX repo boundary.
- Any paid SportsMeta membership is a separate product boundary unless and until PVTKRRX code proves otherwise.

#### Stremio boundary

`VERIFIED IN DOCS`
- PVTKRRX is a Stremio addon, not the Stremio client itself.

`VERIFIED IN CODE`
- manifest, catalog, meta, and stream surfaces are exposed in `index.js`.
- AuthKey account linking depends on the external Stremio API and Stremio client/browser behavior.

#### User-owned infrastructure boundary

`VERIFIED IN DOCS`, `VERIFIED IN CODE`
- Prowlarr, qBittorrent, optional external file server, local disk, and self-host runtime remain user-owned infrastructure.
- Hosted relay decisions do not make hosted relay the byte-serving owner.

### B3. Request Flow Map

#### Configure

1. Browser hits `GET /configure` or `GET /:config/configure`.
2. Local/self-host configure returns editable setup UI.
3. Hosted public guide surface redirects away from hosted configure in hosted runtime tests.
4. Save paths:
   - `POST /encrypt` for hosted token configs
   - `POST /local-config` for Windows host disk config
   - `POST /server-config` for self-host server disk config
   - `POST /auto-provision` for local host bootstrap

#### Install

1. `PC Local` installs from `http://127.0.0.1:7000/local/manifest.json?mode=local`.
2. Home-device hosted route installs from a hosted token manifest.
3. Self-host uses `/selfhost/manifest.json?mode=hosted`.
4. `docs/ROUTE_FRAMEWORK.md` and `docs/STREMIO_INSTALL_TRACKER.md` still call the code-facing route `Hybrid Home`, while `docs/CURRENT_DESIGN.md` locks the user-facing label to `LAN Bridge`.

#### Manifest

1. `GET /manifest.json` is bootstrap/setup-only.
2. `GET /:config/manifest.json` is the working addon surface.
3. Manifest profile is chosen from config state:
   - `local` -> `PC Local`
   - `hybrid` -> `Hybrid Home`
   - `lan` -> strict legacy `LAN Bridge`
   - `online` -> `Remote Seedbox`

#### Catalog

1. Request enters `/:config/catalog/:type/:id.json`.
2. `withConfig` decrypts token or loads local config.
3. `requireConfigSubscription` runs but is a no-op.
4. `maybeLanPairRedirect('catalog')` either:
   - 307 redirects to the live LAN host
   - fails closed for strict legacy `lanPairRequired=true`
   - or falls through to hosted/cloud behavior for `hybrid`
5. `handleCatalog()` serves the requested surface.

#### Meta

1. Request enters `/:config/meta/:type/:id.json`.
2. Same config + no-op entitlement gate + pair redirect/fallback logic.
3. If id is `sportsmeta:...`, PVTKRRX fetches canonical SportsMeta event metadata.
4. If id is `pvtkrrx:...`, PVTKRRX decodes the custom payload and optionally enriches from SportsMeta if the carried canonical id is trustworthy.

#### Stream

1. Request enters `/:config/stream/:type/:id.json`.
2. Same config + no-op entitlement gate + pair redirect/fallback logic.
3. Non-sports ids use normal movie/TV/library flow.
4. `sportsmeta:` ids go through `handleSportsMetaStream()`.
5. `pvtkrrx:` custom sports ids go through `handleDecodedCustomStream()`.
6. Playback still depends on Prowlarr/qBit/local disk or an external file server, not SportsMeta.

#### Playback / file / redirect / fail-fast

1. `/:config/file/:info` and `/:config/playback/:info` still carry the no-op entitlement middleware.
2. `maybeLanPairRedirect()` can redirect those routes to `/local/...` on the paired host.
3. If request remains on hosted runtime and still needs local-only serving, hosted runtime returns 403 with a truthful message.
4. Hosted relay never proxies the actual video bytes.

#### Account check

1. `POST /auth/stremio/link-session` creates a one-time link session.
2. `GET /auth/stremio/link/:sessionToken` redirects into configure/install flow.
3. `POST /auth/stremio/link-authkey` verifies Stremio AuthKey, links user, and can persist a linked hosted config token.
4. `GET /auth/me` requires bearer auth and returns only linked Stremio account metadata.

#### Sports resolution

1. PVTKRRX gets tracker availability from Prowlarr.
2. PVTKRRX parses sport/league/date/title hints from the tracker title.
3. PVTKRRX asks SportsMeta `/resolve`.
4. If `/resolve` is ambiguous, empty, or errors, PVTKRRX falls back to SportsMeta search catalog + canonical `/event` verification.
5. If canonical resolution is proven, PVTKRRX emits raw canonical `sportsmeta:event:...`.
6. If not, PVTKRRX emits a `pvtkrrx:` custom id with the resolution status carried inside it.

### B4. SportsMeta Flow

#### 1. System boundary

Is SportsMeta a separate service/process/domain/repo boundary?

- `VERIFIED IN DOCS`: yes, separate hostname/service/product boundary.
- `VERIFIED IN CODE`: yes, PVTKRRX uses external HTTP calls and no longer exposes internal live SportsMeta routes.
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: separate repo, DB, and service internals.

Exact SportsMeta endpoints used by PVTKRRX code:
- `GET /event/:canonicalId`
- `GET /resolve`
- `GET /catalog/movie/sportsmeta-{sport}/search=...json`
- asset URL patterns:
  - `/asset/{variant}/{canonicalId}`
  - `/asset/default/{variant}/{sport}?league=...`

Exact SportsMeta endpoints/docs referenced but not implemented in this repo:
- `GET /manifest.json`
- pricing surface at `/pricing`
- member routes under `/member/:token/...`
- docs claim billing routes such as `POST /billing/checkout`, `POST /billing/portal`, `POST /webhooks/stripe`

What SportsMeta owns that PVTKRRX does not:
- canonical sports ids
- canonical sports metadata routes
- artwork routes
- paid/member sports-art boundary
- paid TheSportsDB usage according to docs

What PVTKRRX still owns even when SportsMeta exists:
- whether a sports row exists in the PVTKRRX catalog at all
- tracker availability truth
- availability grouping
- availability anchor cache
- Prowlarr/qBit search and stream emission
- `/file` and `/playback`

#### 2. Functional role

Sports identity:
- `VERIFIED IN CODE`: canonical identity is resolved through `resolveSportsMetaIdentity()` in `src/utils/sportsIdentityResolution.js:916-1039`.

Event lookup:
- `VERIFIED IN CODE`: `src/clients/sportsmeta.js:167-172` fetches canonical event details.

Event resolution:
- `VERIFIED IN CODE`: `src/clients/sportsmeta.js:175-180` calls `/resolve`.
- `VERIFIED IN CODE`: `src/utils/sportsIdentityResolution.js:963-1028` falls back to SportsMeta search + verification if `/resolve` is ambiguous or fails.

Poster/background/logo/artwork serving:
- `VERIFIED IN CODE`: `src/utils/sportsArtwork.js:44-69` always builds SportsMeta asset URLs.

Metadata enrichment:
- `VERIFIED IN CODE`: `src/handlers/meta.js:59-126` fetches canonical SportsMeta event metadata for `sportsmeta:` ids.

Fallback behavior:
- `VERIFIED IN CODE`: unresolved catalog rows still emit `pvtkrrx:` ids and default SportsMeta asset URLs instead of being dropped.
- `VERIFIED IN CODE`: `src/handlers/stream.js:631-653` can parse canonical `sportsmeta:event:` ids locally if SportsMeta lookup fails.

Caching:
- `VERIFIED IN CODE`: PVTKRRX caches only availability anchors and canonical-anchor mappings in memory with TTL.
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: SportsMeta asset cache and DB internals.

Resolve path:
- tracker title -> parsed sports hints -> SportsMeta `/resolve` -> fallback SportsMeta search -> canonical verification -> id emission

#### 3. Integration flow

Catalog request flow:
1. Stremio requests PVTKRRX sports catalog.
2. PVTKRRX searches Prowlarr and filters/groupes availability.
3. For each availability group, PVTKRRX resolves identity through SportsMeta.
4. PVTKRRX emits:
   - canonical `sportsmeta:event:` id if verified
   - or `pvtkrrx:` custom id if not verified
5. PVTKRRX always keeps playback tied to the original tracker availability anchor.

Meta request flow:
1. Stremio requests PVTKRRX meta.
2. If id is canonical `sportsmeta:...`, PVTKRRX fetches SportsMeta `/event/...`.
3. If id is fallback `pvtkrrx:...`, PVTKRRX decodes the carried hints and only uses canonical SportsMeta lookup if the carried canonical id is marked `resolved`.
4. Artwork URLs are always SportsMeta URLs.

Stream request flow:
1. Stremio requests PVTKRRX stream.
2. If id is canonical `sportsmeta:...`, PVTKRRX fetches canonical event if possible, or locally parses the canonical id if fetch fails.
3. PVTKRRX rehydrates the original availability anchor from its in-memory store when possible.
4. PVTKRRX then performs tracker/qBit stream logic.
5. SportsMeta does not serve the stream bytes.

#### 4. Failure / fallback

If SportsMeta is unavailable:
- `VERIFIED IN CODE`: catalog resolution falls back to unresolved `pvtkrrx:` rows.
- `VERIFIED IN CODE`: canonical stream requests can still be parsed locally and continue into tracker search.
- `VERIFIED IN CODE`: artwork URLs still point at SportsMeta, so visual fallback is not local if SportsMeta is fully down.

If resolve fails:
- `VERIFIED IN CODE`: status stays explicit as `ambiguous`, `not_found`, `weak_match`, or `fallback_only`.
- `VERIFIED IN CODE`: PVTKRRX does not invent a fake canonical id.

If artwork is missing:
- `VERIFIED IN CODE`: PVTKRRX only chooses canonical or default SportsMeta URLs.
- `ASSUMED`: actual image-asset existence and any member-route fallback inside SportsMeta are outside this repo.

Where SVG fallback is used:
- `VERIFIED IN CODE`: when no canonical id is available, PVTKRRX builds `/asset/default/{variant}/{sport}?league=...`.

Whether SVG is generated or stored:
- `VERIFIED IN CODE`: not in PVTKRRX.
- `VERIFIED IN DOCS`: SportsMeta public/free route is SVG-first.
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: exact SportsMeta SVG-generation/storage implementation.

Files that control the fallback choice inside PVTKRRX:
- `src/clients/sportsmeta.js`
- `src/utils/sportsArtwork.js`
- `src/handlers/catalog.js`
- `src/handlers/meta.js`
- `index.js` for the old 410 legacy routes

#### 5. Ownership conclusion

Is SportsMeta required for sports to function?

Audit answer:
- `VERIFIED IN CODE`: SportsMeta is the primary sports identity and artwork layer.
- `VERIFIED IN CODE`: SportsMeta is not the playback or availability layer.
- `VERIFIED IN CODE`: PVTKRRX can still emit unresolved sports rows and can still continue some stream paths when canonical ids are already known.
- Final classification: SportsMeta is a `partial dependency` and the `primary sports identity/artwork layer`, not the full sports system.

### B5. SVG Flow

Where SVG comes from:
- `VERIFIED IN CODE`: PVTKRRX points to SportsMeta default asset URLs.
- `VERIFIED IN DOCS`, `VERIFIED LIVE`: SportsMeta public/free surface is SVG-only on the public root asset routes.

Who creates it:
- `VERIFIED IN CODE`: not PVTKRRX.
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: SportsMeta internals.

When it is used:
- unresolved sports rows
- any sports artwork selection that does not have a verified canonical id

When it is not used:
- canonical resolved rows, where PVTKRRX chooses `/asset/{variant}/{canonicalId}`

Exact files and functions:
- `src/utils/sportsArtwork.js:44-69`
- `src/clients/sportsmeta.js:255-271`
- `src/handlers/catalog.js:955-1004`
- `src/handlers/meta.js:220-239`
- `index.js:946-957`

Storage and caching behavior:
- `VERIFIED IN CODE`: no local sports art cache in PVTKRRX
- `VERIFIED IN CODE`: only availability-anchor cache exists in `src/utils/sportsAvailabilityStore.js:3-147`
- `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: SportsMeta asset-cache path and asset persistence internals

Fallback order inside PVTKRRX:
1. canonical `sportsmeta:` asset URL when canonical id is trusted
2. default SportsMeta sport/league asset URL when canonical id is absent or unresolved
3. brand poster/logo only inside meta-handler generic fallback, not as a sports-specific SVG generator

### B6. Licence / Entitlement Flow

`[NO VERIFIED LIVE STRIPE LICENCE FLOW FOUND]`

#### Layer 1 — Payment

`VERIFIED IN CODE`
- no Stripe calls in `index.js`, `src/**`, `electron/**`, `public/**`, `scripts/**`, or `package.json`

`VERIFIED IN DOCS`, `VERIFIED LIVE`
- SportsMeta pricing page is live and says SportsMeta is the optional paid surface

Audit result:
- PVTKRRX payment layer: none proven
- SportsMeta payment layer: external live surface exists, but implementation is outside this repo

#### Layer 2 — Licence / entitlement

What exact thing gives a user access today?

- `VERIFIED IN CODE`: a valid config token or local/self-host config gives addon access
- `VERIFIED IN CODE`: Stremio account linking does not gate addon access
- `VERIFIED IN CODE`: payment success does not gate addon access in this repo
- `VERIFIED IN CODE`: no entitlement row or active subscription check is consulted on catalog/meta/stream/file/playback
- `VERIFIED IN CODE`: the only non-addon credential gate is the self-host admin password for private self-host configure/save flows

#### Layer 3 — Storage

What is stored today:
- local config: `runtime/local-config.json`
- pair state: `runtime/lan-pair-store.json`
- account links: `runtime/accounts-store.json`
- Stremio link sessions: `runtime/stremio-link-store.json`
- self-host admin password: `runtime/server-admin-token`
- hosted takeover config token: `user.pvtkrrx.hostedTakeoverConfigToken` inside the account store

What is not stored today:
- no Stripe customer id
- no subscription row
- no entitlement row
- no trial-start row
- no paid-addon licence token

#### Layer 4 — Enforcement

Where access is actually checked:
- `/auth/me` uses `requireAuthUser`
- self-host admin-only flows use `requireServerAdminToken`
- local-only routes use `requireLocalNetworkRoute`
- pair redirect/fallback logic uses pair id/key/TTL/network checks

Where addon access is not actually checked:
- catalog
- meta
- stream
- `/file`
- `/playback`

Reason:
- `src/lib/shared.js:1559-1562` keeps `requireConfigSubscription()` as a pass-through

#### Exact answers to the required questions

1. How is a licence or entitlement inputted?
   - `VERIFIED IN CODE`: it is not inputted for PVTKRRX addon access.
   - `VERIFIED IN CODE`: account link is inputted through `POST /auth/stremio/link-authkey` or local auto-link flow.
   - `VERIFIED IN CODE`: self-host password is generated by the server on startup in self-host mode.

2. How is it linked to a user/account?
   - `VERIFIED IN CODE`: Stremio AuthKey proves a Stremio user id, which is stored in `AccountStore`.
   - `VERIFIED IN CODE`: linked config can carry `accountUserId`, `accountProvider`, and `accountLinkedAt`.
   - `VERIFIED IN CODE`: no Stripe customer linkage exists in this repo.

3. How is it stored?
   - `VERIFIED IN CODE`: linked user state lives in `AccountStore`.
   - `VERIFIED IN CODE`: hosted takeover config token is stored in the linked user record.
   - `VERIFIED IN CODE`: no entitlement/subscription storage exists.

4. How is it verified?
   - `VERIFIED IN CODE`: AuthKey is verified against the Stremio API.
   - `VERIFIED IN CODE`: bearer auth token is verified locally by decrypting and checking `exp`.
   - `VERIFIED IN CODE`: there is no addon entitlement verification step.

5. How is it enforced?
   - `VERIFIED IN CODE`: not enforced for addon access.
   - `VERIFIED IN CODE`: enforced only for `/auth/me`, local-only routes, pair-state decisions, and self-host admin flows.

6. How is it revoked or expired?
   - `VERIFIED IN CODE`: auth tokens expire.
   - `VERIFIED IN CODE`: link sessions expire.
   - `VERIFIED IN CODE`: pair state becomes stale/offline.
   - `VERIFIED IN CODE`: no paid-addon licence expiry or revocation path exists.

7. What part is Stripe-driven versus app-driven?
   - `VERIFIED IN CODE`: app-driven parts are account linking, pair state, and self-host password gate.
   - `DOC CLAIM ONLY / NOT VERIFIED IN CODE`: Stripe-driven paid/member behavior exists on SportsMeta, outside this repo.

8. What part is only scaffolded for future rollout?
   - `VERIFIED IN CODE`: `requireConfigSubscription()` exists only as a pass-through shell.
   - `VERIFIED IN CODE`: repo-wide search found the documented billing/trial env vars only in `README.md`, not in runtime code.

### B7. Live Status Classification

| Subsystem | Classification | Proof |
|---|---|---|
| PVTKRRX core route model | `LIVE BUT PARTIAL` | docs + code + smoke tests; naming drift remains |
| Hosted `/file` and `/playback` fail-fast | `LIVE AND ENFORCED` | `index.js:2139-2145`, `index.js:2434-2440`, `smoke:guards` |
| Pair heartbeat and pair status | `LIVE AND ENFORCED` | `index.js:1447-1595`, `smoke:lan-pair`, `smoke:security` |
| Account linking | `LIVE BUT PARTIAL` | `index.js:881-945`, `1276-1331`, `smoke:stremio-link` |
| Self-host admin password gate | `LIVE AND ENFORCED` | `src/lib/shared.js:188-212`, `1395-1400`, `smoke:selfhost` |
| SportsMeta identity resolution inside PVTKRRX | `LIVE BUT PARTIAL` | `src/utils/sportsIdentityResolution.js`, `smoke:sports-resolution` |
| Canonical `sportsmeta:` ids on PVTKRRX stream path | `LIVE BUT PARTIAL` | `src/handlers/catalog.js`, `src/handlers/stream.js`, `smoke:pipeline` |
| SportsMeta public addon | `VERIFIED LIVE` external boundary | live manifest responds |
| SportsMeta paid/member split | `LIVE BUT EXTERNAL TO THIS REPO` | live pricing page responds; repo code absent |
| PVTKRRX local sports SVG generator | `SCAFFOLDED / NOT ENFORCED` | removed; old routes 410 |
| PVTKRRX Stripe/addon licence gate | `SCAFFOLDED / NOT ENFORCED` | no code; middleware no-op |

## C. Exact proof

### C1. Phase 1 — Doc audit

Exact files used:
- `docs/CURRENT_DESIGN.md`
- `docs/ROUTE_FRAMEWORK.md`
- `docs/STREMIO_INSTALL_TRACKER.md`
- `docs/PROJECT_STATUS.md`
- `docs/SPEC.md`
- `ARCHITECTURE.md`
- `README.md`
- `Sport-library-integration.txt` (`missing`)
- supporting context: `docs/SPORTSMETA_BOUNDARY.md`

Exact headings / sections used:
- `docs/CURRENT_DESIGN.md`
  - `Runtime Model`
  - `SportsMeta Boundary`
  - `Current UX Model`
  - `Route Model`
  - `Content Model`
  - `Playback Model`
- `docs/ROUTE_FRAMEWORK.md`
  - `Route Summary`
  - `Current Rules`
  - `PC Local`
  - `Hybrid Home`
  - `Playback Capability Matrix`
  - `By Endpoint`
  - `What .pvtk Is Not`
- `docs/STREMIO_INSTALL_TRACKER.md`
  - `Observed Install Results (Current)`
  - `Conclusion`
  - `Supported Install Modes Going Forward`
- `docs/PROJECT_STATUS.md`
  - `Current Stage`
  - `2026-04-23: Final sports closeout pass`
  - `2026-04-22: SportsMeta boundary finalised`
  - `SportsMeta split rollout on 2026-04-10`
- `docs/SPEC.md`
  - `Required Route Model`
  - `Functional Scope`
  - `Operational Requirements`
- `ARCHITECTURE.md`
  - `SportsMeta Boundary`
  - `Route Model`
  - `Sports And Library`
- `README.md`
  - `Key Features`
  - `Route Framework`
  - `How It Works`
  - `Environment Variables`

Live truths extracted from docs:
- PVTKRRX is one addon system with hosted relay + local runtime + Electron wrapper.
- Route model truth is meant to be `PC Local`, `LAN Bridge`, `Remote Seedbox`.
- Hosted relay does not proxy video bytes.
- SportsMeta is now the separate sports metadata/artwork boundary.
- PVTKRRX stays the stream addon and only attaches streams to canonical `sportsmeta:` ids.
- Old local SportsDB cache/artwork generation path is removed.
- Current docs say addon access is still forced free.

Conflicts found in docs:
- `docs/CURRENT_DESIGN.md` and `docs/SPEC.md` lock the user-facing route name to `LAN Bridge`, but `docs/ROUTE_FRAMEWORK.md`, `docs/STREMIO_INSTALL_TRACKER.md`, `ARCHITECTURE.md`, and `README.md` still use `Hybrid Home` as the main live home-device route.
- `docs/SPEC.md:41` still says sports use TheSportsDB enrichment and cached artwork, which conflicts with the 2026-04-22 docs and current code.
- `ARCHITECTURE.md:139` says PVTKRRX live sports surface stays on generated SVG cards, which conflicts with current code that only emits SportsMeta URLs.
- `README.md:207` still mentions optional local SportsDB/package cache tooling in the flow diagram, which conflicts with the removed local sports-cache path.
- `package.json` says `SEE LICENSE IN LICENSE`, but there is no root `LICENSE` file.

Missing areas that docs do not settle by themselves:
- exact current SportsMeta internals
- exact live Stripe webhook code
- exact member-route enforcement internals
- whether SportsMeta asset generation is stored or generated on demand
- whether the live public bootstrap manifest version is current

Doc-audit commands run:
- `git status --short --branch`
- `rg -n "^(#|##|###) " docs/CURRENT_DESIGN.md docs/ROUTE_FRAMEWORK.md docs/STREMIO_INSTALL_TRACKER.md docs/PROJECT_STATUS.md docs/SPEC.md ARCHITECTURE.md README.md`
- `if (Test-Path docs/SPORTSMETA_BOUNDARY.md) { rg -n "^(#|##|###) " docs/SPORTSMETA_BOUNDARY.md } else { Write-Output "[MISSING] docs/SPORTSMETA_BOUNDARY.md" }`
- `if (Test-Path docs/PVTKRRX_SYSTEM_FLOW_AND_CONTROL_AUDIT.md) { Get-Content docs/PVTKRRX_SYSTEM_FLOW_AND_CONTROL_AUDIT.md -First 120 } else { Write-Output "[MISSING] docs/PVTKRRX_SYSTEM_FLOW_AND_CONTROL_AUDIT.md" }`
- `if (Test-Path "Sport-library-integration.txt") { Write-Output "Sport-library-integration.txt present" } else { Write-Output "Sport-library-integration.txt missing" }`

### C2. Phase 2 — Code audit

Exact files reviewed:
- `package.json`
- `index.js`
- `public/configure.html`
- `electron/main.js`
- `src/lib/shared.js`
- `src/utils/accountStore.js`
- `src/utils/authToken.js`
- `src/utils/crypto.js`
- `src/utils/secureJsonFile.js`
- `src/utils/fileServing.js`
- `src/utils/customId.js`
- `src/utils/sportsAvailabilityStore.js`
- `src/utils/sportsArtwork.js`
- `src/utils/sportsIdentityResolution.js`
- `src/clients/sportsmeta.js`
- `src/handlers/catalog.js`
- `src/handlers/meta.js`
- `src/handlers/stream.js`
- `scripts/smoke-config-flow.js`
- `scripts/smoke-runtime-guards.js`
- `scripts/smoke-lan-pair-flow.js`
- `scripts/smoke-stremio-link.js`
- `scripts/smoke-sports-resolution.js`
- `scripts/smoke-sports-catalog-seeds.js`
- `scripts/smoke-playback-route.js`
- `scripts/smoke-security.js`
- `scripts/smoke-selfhost-server.js`

Exact routes reviewed in PVTKRRX:
- `GET /configure`
- `GET /:config/configure`
- `GET /auth/stremio/link/:sessionToken`
- `GET /auth/stremio/link-session/:sessionToken`
- `POST /auth/stremio/link-session`
- `POST /encrypt`
- `POST /local-config`
- `POST /server-config`
- `POST /auto-provision`
- `GET /auth/stremio/local-status`
- `POST /auth/stremio/auto-link-local`
- `POST /auth/stremio/link-authkey`
- `GET /auth/me`
- `GET /network-info`
- `POST /local/lan-token`
- `GET /local/pair-status`
- `POST /pair/heartbeat`
- `POST /pair/status`
- `GET /manifest.json`
- `GET /:config/manifest.json`
- `GET /:config/config.json`
- `GET /catalog/:type/:id.json`
- `GET /catalog/:type/:id/:extra.json`
- `GET /stream/:type/:id.json`
- `GET /meta/:type/:id.json`
- `GET /:config/catalog/:type/:id.json`
- `GET /:config/catalog/:type/:id/:extra.json`
- `GET /:config/stream/:type/:id.json`
- `GET /:config/meta/:type/:id.json`
- `GET /:config/file/:info`
- `GET /:config/playback/:info`
- legacy removed sports-art routes:
  - `/thumb/sports/:info.png`
  - `/thumb/sports/:variant/:info.png`
  - `/thumb/sports/:info.svg`
  - `/thumb/sports/:variant/:info.svg`
  - `/image/sports/:variant/:token`

Exact SportsMeta external routes referenced by code:
- `/event/:canonicalId`
- `/resolve`
- `/catalog/movie/sportsmeta-{sport}/search=...json`
- `/asset/{variant}/{canonicalId}`
- `/asset/default/{variant}/{sport}?league=...`

Main code proof for the core claims:

Hosted/local/runtime/account storage:
- `src/lib/shared.js:196-205` creates `local-config.json`, `lan-pair-store.json`, `accounts-store.json`, and `stremio-link-store.json`.
- `src/utils/secureJsonFile.js:5-53` stores disk JSON with marker `pvtkrrx-secure-json-v1` and encrypted payloads.
- `src/utils/crypto.js:11-38` uses AES-256-GCM for encrypted tokens.
- `src/utils/authToken.js:11-35` builds encrypted bearer tokens with `iat` and `exp`.

Account linking exists:
- `index.js:902-945` creates Stremio link sessions.
- `index.js:1276-1324` verifies AuthKey and completes the link.
- `src/utils/accountStore.js:137-183` creates/links Stremio users.
- `src/lib/shared.js:1084-1097` hydrates config with `accountUserId`, `accountProvider`, and `accountLinkedAt`.
- `src/lib/shared.js:1132-1158` stores a linked hosted takeover config token on the account record.
- `index.js:1326-1331` `/auth/me` returns only public link-state metadata.

Addon billing gate is not live:
- `src/lib/shared.js:1559-1562` keeps `requireConfigSubscription()` as a pass-through with the comment `Billing/subscription gating removed — addon is free.`
- `index.js:1933-1974`, `2139`, and `2434` still attach that middleware to catalog/meta/stream/file/playback routes, but the middleware does nothing.
- repo-wide code search for Stripe/billing/subscription/trial returned no active runtime enforcement:
  - `rg -n "stripe|Stripe|billing/checkout|billing/portal|webhooks/stripe|customer portal|checkout session|webhook" index.js src electron public scripts package.json`
  - `rg -n "trial|subscription|entitlement|license|licence|billing|active subscription|require active" index.js src electron public scripts package.json`
  - `rg -n "PVTKRRX_TRIAL|PVTKRRX_FREE_MODE|PVTKRRX_REQUIRE_ACTIVE_SUBSCRIPTION" .`

Self-host admin gate is real:
- `src/lib/shared.js:188-212` creates a self-host password file in self-host mode.
- `src/lib/shared.js:1395-1400` enforces `requireServerAdminToken`.
- `index.js:1049-1071` protects `/server-config` with `requireServerAdminToken`.

Home-route redirect and fallback are real:
- `src/lib/shared.js:933-946` resolves hosted profile from config.
- `src/lib/shared.js:2186-2218` resolves pair status.
- `src/lib/shared.js:2256-2327` redirects, fails closed, or applies cloud takeover.
- `index.js:1365-1595` implements LAN token minting, pair heartbeat, and pair status.

Hosted `/file` and `/playback` do fail fast:
- `src/utils/fileServing.js:18-29` marks hosted runtime and auth-protected file-server cases as restricted.
- `index.js:2139-2145` returns hosted `/file` 403 for non-local hosted runtime.
- `index.js:2434-2440` returns hosted `/playback` 403 for non-local hosted runtime.

SportsMeta external boundary is real in code:
- `src/clients/sportsmeta.js:1-2` default base URL is `https://sportsmeta.pvtkrrx.cc`.
- `src/clients/sportsmeta.js:24-35` can use same-box internal base URL when deployed behind Coolify without explicit public override.
- `src/clients/sportsmeta.js:167-205` calls external event/resolve/catalog search routes.
- `index.js:946-957` old PVTKRRX sports-art routes now return 410.

SportsMeta functional role inside PVTKRRX:
- `src/utils/sportsIdentityResolution.js:916-1039` performs conservative resolution and search fallback.
- `src/handlers/catalog.js:894-1004` resolves each availability group, emits canonical `sportsmeta:` ids when proven, and `pvtkrrx:` ids otherwise.
- `src/utils/sportsAvailabilityStore.js:69-147` stores in-memory availability anchors and canonical-id anchor mapping.
- `src/utils/customId.js:31-46` carries event date, league code, home/away teams, canonical id, resolution status, and anchor key in custom ids.
- `src/handlers/meta.js:59-126` fetches canonical SportsMeta metadata for `sportsmeta:` ids.
- `src/handlers/meta.js:171-239` uses canonical lookup only when the custom id carries a trusted canonical id, otherwise builds default SportsMeta asset URLs.
- `src/handlers/stream.js:631-653` falls back to local canonical-id parsing when SportsMeta lookup fails.
- `src/handlers/stream.js:1309-1321` uses canonical-id anchor mapping to rehydrate the real tracker source.
- `src/handlers/stream.js:1047-1085` keeps playback tied to the original availability anchor and only allows supplemental non-SportsCult streams after a resolved anchored sports row exists.

SVG fallback selection:
- `src/utils/sportsArtwork.js:44-69` chooses canonical SportsMeta asset URL when canonical id exists, otherwise SportsMeta default asset URL.
- `src/clients/sportsmeta.js:255-271` builds the canonical and default SportsMeta asset URLs.
- There is no local sports SVG generator in the current repo code.

Electron/startup/heartbeat:
- `electron/main.js:582-625` manages power blocker and resume/unlock heartbeat behavior.
- `electron/main.js:854-953` builds and sends pair heartbeat payloads.
- `electron/main.js:975-1041` watches for Stremio launch and sends a heartbeat pulse.

Route-name drift in code:
- `src/lib/shared.js:1655-1700` still labels hosted `hybrid` manifests as `Hybrid Home` and strict `lan` manifests as `LAN Bridge`.
- `public/configure.html:5989-6000` still generates home-device tokens with `routeProfile: 'hybrid'`.
- `public/configure.html` text still presents the user-facing label as `LAN Bridge`.

Code-audit commands run:
- `Get-Content package.json`
- `Get-ChildItem scripts | Select-Object -ExpandProperty Name`
- `Get-Content docs/SPORTSMETA_BOUNDARY.md`
- `rg -n "requireConfigSubscription|publicUserModel|hydrateAccountLinkForConfig|persistAccountHostedTakeoverConfig|resolveHostedProfile|buildManifestProfile|resolveLanPair|maybeLanPairRedirect|ensureHostedTakeoverConfigForRequest|getTrackerPlaybackRestriction" src/lib/shared.js src/utils/fileServing.js`
- `rg -n "app\\.(get|post)\\('/|app\\.get\\('/:config/(manifest|config|catalog|meta|stream|file|playback)|app\\.post\\('/auth|app\\.get\\('/auth|app\\.post\\('/pair|app\\.get\\('/local|app\\.post\\('/local" index.js`
- `rg -n "SPORTSMETA_BASE_URL|SPORTSMETA_INTERNAL_BASE_URL|getEvent\\(|resolveEvent\\(|searchCatalog\\(|buildSportsMetaAssetUrl|buildSportsMetaDefaultAssetUrl|normalizeSportsMetaPayload|parseSportsMetaId" src/clients/sportsmeta.js src/handlers/stream.js src/utils/sportsArtwork.js`
- `rg -n "resolveSportsMetaIdentity|resolveSportsMetaIdentityBySearch|buildSportsMetaResolutionPlan|verifySportsMetaResolution|setSportsAvailabilityAnchor|setSportsAvailabilityCanonicalAnchor|getSportsAvailabilityAnchorByCanonical|encodeCustomId|decodeCustomId" src/utils/sportsIdentityResolution.js src/utils/sportsAvailabilityStore.js src/utils/customId.js`
- `rg -n "sportsCatalog\\(|resolved groups emit canonical|custom sports id|resolveSportsPosterAsset|resolveSportsBackgroundAsset|resolveSportsLogoAsset|loadCanonicalSportsMeta|buildCanonicalSportsMetaResponse|handleSportsMetaStream|loadSportsMetaInfo|handleDecodedCustomStream|SportsMeta lookup failed" src/handlers/catalog.js src/handlers/meta.js src/handlers/stream.js`
- `rg -n "thumb/sports|image/sports|experimental internal SportsMeta routes removed|/auth/me|/encrypt|/local-config|/server-config|/auto-provision|/network-info|/local/lan-token|/local/pair-status|/pair/heartbeat|/pair/status|/:config/file/:info|/:config/playback/:info|403\\)|res\\.status\\(410\\)" index.js`
- `rg -n "lock-screen|unlock-screen|resume|powerSaveBlocker|sendLanPairHeartbeat|buildLanPairHeartbeatPayload|stremio launch|startLocalServer|desktop-local-only|SELFHOST=0" electron/main.js`
- `if (Test-Path LICENSE) { Write-Output 'LICENSE present' } else { Write-Output 'LICENSE missing' }; rg -n "SportsMeta|TheSportsDB|PVTKRRX_FREE_MODE|PVTKRRX_REQUIRE_ACTIVE_SUBSCRIPTION|PVTKRRX_TRIAL|hybrid|LAN Bridge|Hybrid Home|SEE LICENSE IN LICENSE" README.md docs/CURRENT_DESIGN.md docs/ROUTE_FRAMEWORK.md docs/PROJECT_STATUS.md docs/SPEC.md ARCHITECTURE.md package.json`
- `rg -n "stripe|Stripe|billing/checkout|billing/portal|webhooks/stripe|customer portal|checkout session|webhook" index.js src electron public scripts package.json`
- `rg -n "trial|subscription|entitlement|license|licence|billing|active subscription|require active" index.js src electron public scripts package.json`
- `rg -n "PVTKRRX_TRIAL|PVTKRRX_FREE_MODE|PVTKRRX_REQUIRE_ACTIVE_SUBSCRIPTION" .`
- `rg -n "/member/|member-token|member routes|sportsmeta\\.pvtkrrx\\.cc/pricing|/pricing|activeEntitlementCount|subscriptionCount" index.js src electron public scripts README.md docs/CURRENT_DESIGN.md docs/PROJECT_STATUS.md ARCHITECTURE.md docs/SPORTSMETA_BOUNDARY.md`

### C3. Phase 3 — Test / execution proof

Exact commands run and results:

| Command | Result | What it proves | What it does not prove |
|---|---|---|---|
| `npm run smoke:config` | `PASS` | config save/encrypt/readback flow, manifest variants, install-link format, local/runtime route behavior | does not prove live public deployment |
| `npm run smoke:guards` | `PASS` | hosted runtime fails fast on hosted `/playback`, hosted configure restrictions, local-only route guards | does not prove every public proxy deployment |
| `npm run smoke:lan-pair` | `PASS` | pair heartbeat, pair status, redirect/fallback logic, hybrid cloud takeover, opaque token behavior | does not prove real multi-device consumer behavior |
| `npm run smoke:stremio-link` | `PASS` | Stremio link-session creation, install-seen status, AuthKey linking, bearer token shape | uses mocked Stremio API, not live Stremio service |
| `npm run smoke:sports-resolution` | `PASS` | SportsMeta resolution/search-fallback algorithm and fail-closed generic-event behavior | uses mocked SportsMeta responses, not live SportsMeta |
| `npm run smoke:sports-catalog-seeds` | `PASS` | seeded sports browse behavior and empty-query sport-family enrichment path | uses mocked Prowlarr/SportsMeta path |
| `npm run smoke:playback` | `PASS` | local `/playback` and `/file` route behavior, ready/buffering/packed paths | not a real Stremio player sign-off |
| `npm run smoke:security` | `PASS` | `/auth/me` auth requirement, secret redaction, anti-rebinding guards, local-route lockout, pair-status secrecy | does not prove every proxy/header combination |
| `npm run smoke:pipeline` | `PASS` | stream pipeline, anchored sports supplemental search path, fallback survival when SportsMeta lookup errors | not full live external-provider proof |
| `npm run smoke:selfhost` | `PASS` | self-host mode, self-host password creation and enforcement, private same-host config-save path | does not prove live public self-host deployment |

Non-fatal but important observations from test output:
- `smoke:lan-pair` logged a rejected owner-mismatch heartbeat after the pass. That is expected test coverage, not a test failure.
- `smoke:pipeline` logged `SportsMeta lookup failed ... response.json is not a function` after the pass. That proves the stream path can survive SportsMeta lookup failure and keep fallback behavior, but it also shows the mocked failure path still deserves cleanup/hardening.
- `smoke:selfhost` and `smoke:lan-pair` both logged a Prowlarr warm-up 401 after the pass. That did not fail the smoke test, but it is not proof that live provider warm-up is universally clean.

Live internet checks executed:
- `VERIFIED LIVE`: `https://www.pvtkrrx.cc/manifest.json` responded as a setup-only bootstrap manifest.
- `VERIFIED LIVE`: `https://sportsmeta.pvtkrrx.cc/manifest.json` responded as a separate SportsMeta addon.
- `VERIFIED LIVE`: `https://sportsmeta.pvtkrrx.cc/pricing` responded with public copy that says:
  - PVTKRRX stays free
  - SportsMeta is the optional upgrade
  - free root SportsMeta is SVG-only
  - paid behavior lives on member routes, not on the PVTKRRX stream addon

Live-surface caveat:
- `VERIFIED LIVE`: the public root PVTKRRX bootstrap manifest currently reports version `1.1.30`, which does not match the repo/doc claim of current working `1.1.34`. That is a live version-string drift, not proof that the working tokenized routes are on `1.1.30`.

## D. Weak points

- `Sport-library-integration.txt` is missing, so that source could not be audited.
- Route naming is still mixed between `LAN Bridge` and `Hybrid Home` across docs, manifest-building code, and UI copy.
- `docs/SPEC.md` still describes removed local TheSportsDB/cached-artwork behavior.
- `ARCHITECTURE.md` still includes stale wording about PVTKRRX-generated sports SVG cards.
- `README.md` still has a stale `How It Works` line about optional local SportsDB/package cache tooling.
- `package.json` claims `SEE LICENSE IN LICENSE`, but no root `LICENSE` file is present.
- PVTKRRX does not generate local sports SVG fallback; if SportsMeta is fully unavailable, the sports art URLs still point to SportsMeta and will not render locally.
- Sports availability anchors are in-memory TTL state only. If anchor TTL expires, canonical `sportsmeta:` ids lose the fast path back to the original tracker row and the stream path becomes weaker.
- SportsMeta member/Stripe implementation is outside this repo. The public pricing page is live, but webhook, customer, entitlement, and member-token code are not verifiable here.
- The smoke suite is strong for repo logic but mostly uses mocks for external Stremio/SportsMeta/Prowlarr/qBit edges. That is proof of contract behavior, not full live-surface proof.
- `smoke:pipeline` fallback warning shows the pipeline survives SportsMeta lookup errors, but the specific mocked error shape still needs cleanup.

## E. Exact fixes made or needed

Fix made in this pass:
- `docs/PVTKRRX_SYSTEM_FLOW_AND_CONTROL_AUDIT.md`
  - reason: replace the failed earlier pass with a stricter audit that separates docs/code/tests/live proof and answers the SportsMeta + Stripe/licence questions directly
  - type: `docs-only`

Exact follow-up fixes needed:

1. `docs/SPEC.md`
   - reason: `Functional Scope` still claims live TheSportsDB enrichment and cached artwork
   - type: `docs-only`

2. `ARCHITECTURE.md`
   - reason: `Sports And Library` still describes PVTKRRX-generated SVG cards instead of SportsMeta-owned asset URLs
   - type: `docs-only`

3. `README.md`
   - reason: `Route Framework` and `How It Works` still carry stale `Hybrid Home` naming and stale local SportsDB/cache wording
   - type: `docs-only`

4. `public/configure.html` plus `src/lib/shared.js`
   - reason: user-facing route name and manifest/profile name are still split between `LAN Bridge` and `Hybrid Home`
   - type: `both`

5. `package.json` plus root `LICENSE`
   - reason: package metadata points to a missing license file
   - type: `both`

6. `src/utils/customId.js`
   - reason: stale comment still mentions TheSportsDB-targeted lookups for sports artwork flow
   - type: `code-only`

7. `scripts/smoke-stream-pipeline.js` and/or SportsMeta mock/error handling around `src/handlers/stream.js`
   - reason: non-fatal `response.json is not a function` warning should be cleaned up so failure-path proof is cleaner
   - type: `code-only`

8. Product decision, then docs/code alignment
   - reason: if PVTKRRX should stay free, remove or clearly quarantine placeholder billing/trial env docs; if billing is intended later, implement a real entitlement model instead of keeping no-op placeholders that look live
   - type: `both`

## F. Safe public wording

PVTKRRX is the free stream addon. It handles tracker availability, stream attachment, and playback routing across PC Local, home-device relay use, and remote seedbox/self-host paths. SportsMeta is the separate sports metadata and artwork companion service. When PVTKRRX can safely resolve a sports row, it uses canonical `sportsmeta:` ids and SportsMeta artwork URLs; when it cannot, it keeps the row honest with a PVTKRRX fallback id and SportsMeta’s default SVG artwork path.

Today, PVTKRRX itself does not have a live Stripe-controlled addon licence gate. Account linking is live, but it is used for account association and route fallback behavior, not to lock catalog or stream access behind payment. Paid membership, where present, belongs to the separate SportsMeta surface rather than the free PVTKRRX stream addon.
