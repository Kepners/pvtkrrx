# PVTKRRX System Flow And Control Audit

Date: 2026-04-23  
Workspace: `C:\Users\kepne\OneDrive\Documents\GitHub\pvtkrrx`

Truth order used for this audit:
1. `docs/CURRENT_DESIGN.md`
2. `docs/ROUTE_FRAMEWORK.md`
3. `docs/STREMIO_INSTALL_TRACKER.md`
4. `docs/PROJECT_STATUS.md`
5. `docs/SPEC.md`
6. `ARCHITECTURE.md`
7. `README.md`

Evidence labels used below:
- `VERIFIED FROM DOCS`
- `VERIFIED IN CODE`
- `VERIFIED BY TEST`
- `[DOC CLAIM NOT VERIFIED IN CODE]`
- `[UNPROVEN - DO NOT STATE AS FACT]`

## A. Verdict

`READY WITH CAVEATS`

Why this is the current audit verdict:
- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: the repo consistently proves the three-part runtime shape: hosted relay, local runtime, and Windows Electron wrapper.
- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: the repo proves the live route mechanics for `PC Local`, the hosted home-device route, and `Remote Seedbox`, including hosted fail-fast on `/file` and `/playback` when playback still depends on a local-only path.
- `VERIFIED IN CODE` and `VERIFIED BY TEST`: pairing, account linking, encrypted config tokens, secure at-rest JSON files, opaque playback/file state tokens, and guarded local-only routes are live.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: sports metadata/artwork ownership has moved out of this repo to SportsMeta. PVTKRRX now resolves and emits SportsMeta asset URLs instead of generating or proxying sports art itself.
- `VERIFIED IN CODE`: entitlement gating is currently forced free on the addon path. The remaining access control in this repo is account linking for route takeover behavior and the self-host browser password for private server config access.

Why this is not a full `READY`:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: route naming is still mixed. Live docs want `PC Local`, `LAN Bridge`, and `Remote Seedbox`, but live code and some live docs still use `Hybrid Home` for the main hosted home-device profile and keep `lan` as the strict legacy fail-closed variant.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: `docs/SPEC.md` still says sports use TheSportsDB enrichment plus cached artwork, but the live repo removed the local SportsDB client, local sports image cache, and local sports image routes.
- `VERIFIED FROM DOCS`: `ARCHITECTURE.md` still contains one stale sentence implying PVTKRRX-generated SVG cards, while the live code shows SportsMeta-owned asset URLs instead.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: the repo claims `Source Available`, but there is no `LICENSE` file in this workspace, so the exact software licence text is `[UNPROVEN - DO NOT STATE AS FACT]`.
- `VERIFIED BY TEST`: smoke coverage is strong, but it is still local smoke coverage. It does not prove every external device/client combination, every real public seedbox environment, or SportsMeta internals.

Direct answers to the required focus items:
- How hosted relay, local runtime, and Electron work together: the Electron app boots and supervises the local runtime, opens local configure/admin surfaces, and publishes LAN heartbeat state to the hosted relay; the hosted relay serves hosted manifests/config/account-link surfaces and either redirects requests back to the active local host or falls through to hosted/public behavior.
- How route selection alters install and playback behavior: `PC Local` installs from `127.0.0.1` and stays local; the hosted home-device route installs from a hosted token and either 307-redirects into the paired local runtime or falls back to hosted/public behavior; `Remote Seedbox` stays on public-ready endpoints and must fail fast when built-in hosted playback cannot truthfully serve the request.
- How SVG fallback actually works: this repo does not generate SVG fallback assets anymore. It selects SportsMeta asset URLs. Exact SVG creation/storage inside SportsMeta is `[UNPROVEN - DO NOT STATE AS FACT]` from this repo.
- Where TheSportsDB enrichment is called and how it is cached: this repo no longer calls TheSportsDB directly. SportsMeta is the external dependency boundary for that. PVTKRRX only caches sports availability anchors locally in memory.
- How licences, trial, and account access are inputted and controlled: software licence text is not fully provable from this repo; addon entitlement is currently forced free; account linking is real and feeds paired-route/cloud-takeover behavior; self-host password is real and gates private server config access.
- Is billing/trial logic currently real, partial, or placeholder: placeholder/non-enforcing in this repo for addon access. The documented env flags remain, but `requireConfigSubscription()` is a pass-through.
- What is live versus documented only: pairing, account linking, local playback, hosted fail-fast, and SportsMeta URL delegation are live; PVTKRRX-generated SVGs, local TheSportsDB artwork cache, and active billing gates are not proven live in this repo.

## B. Plain-English explanation/flow

### B1. Product/System Boundary

What PVTKRRX is:
- `VERIFIED FROM DOCS`: one addon system with a hosted relay, a local runtime, and a Windows desktop wrapper.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: one addon family exposing sports, movies, TV, and library.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: a bridge layer between the user's own tracker/qBittorrent/storage setup and Stremio.

What PVTKRRX is not:
- `VERIFIED FROM DOCS`: not a debrid service.
- `VERIFIED FROM DOCS`: not a third-party media host.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: not a generic streaming platform that proxies hosted video bytes through the public relay.
- `VERIFIED FROM DOCS`: not a standalone `.pvtk` file format product.

What the hosted relay does:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: serves hosted manifest/config routes.
- `VERIFIED IN CODE`: decrypts hosted config tokens through `withConfig`.
- `VERIFIED IN CODE`: runs Stremio link-session and AuthKey account-link routes.
- `VERIFIED IN CODE`: persists pair state, account state, and link-session state through memory, file, or KV-backed stores depending on deployment configuration.
- `VERIFIED IN CODE`: performs LAN-pair resolution and 307 redirect decisions through `maybeLanPairRedirect`.
- `VERIFIED IN CODE`: fails fast on hosted `/file` and `/playback` when the request would require local-only serving.

What the hosted relay must not do:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it must not become a hosted video-byte proxy for the public route.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it must not pretend the public hosted runtime can serve local-only tracker buffering if it cannot.

What the local runtime does:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: serves the `PC Local` route on `127.0.0.1`.
- `VERIFIED IN CODE`: stores disk-backed config under the runtime directory.
- `VERIFIED IN CODE`: serves built-in `/file` and `/playback` when the host can actually reach the file or buffer it.
- `VERIFIED IN CODE`: exposes local-only provisioning and diagnostics routes such as `/local-config`, `/local/lan-token`, `/network-info`, and the legacy root-local addon aliases.

What the Electron wrapper does:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: starts the local runtime.
- `VERIFIED IN CODE`: opens/focuses the configure surface and system tray UX.
- `VERIFIED IN CODE`: sends startup heartbeat, periodic heartbeat, and Stremio-launch pulses to the hosted relay.
- `VERIFIED IN CODE`: runs auto-provision and host bootstrap logic.

In-bounds:
- hosted relay routing and account-link surfaces
- local runtime playback/file-serving behavior
- Electron startup, tray, heartbeat, and local configure bootstrapping
- sports identity resolution against SportsMeta and emission of SportsMeta asset URLs
- paired-route fallback behavior

Out-of-bounds:
- SportsMeta internals, including real asset generation/caching and paid/member enforcement
- Stremio client behavior beyond what is directly documented or smoke-tested here
- tracker-side availability quality
- qBittorrent correctness outside the contract exercised by this repo
- any legal or commercial rights regime not declared in this repo

### B2. Terminology Conflict That Must Not Be Buried

This repo has a real naming conflict.

`VERIFIED FROM DOCS`:
- `docs/CURRENT_DESIGN.md` and `docs/SPEC.md` lock the user-facing route model to `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- `docs/ROUTE_FRAMEWORK.md`, `docs/STREMIO_INSTALL_TRACKER.md`, and `ARCHITECTURE.md` still use `Hybrid Home` for the main hosted home-device route and describe legacy strict `LAN Bridge` as the fail-closed profile.

`VERIFIED IN CODE`:
- `public/configure.html` still labels the main home-device route as `LAN Bridge`.
- `public/configure.html` generates `routeProfile: 'hybrid'` for that main route.
- `src/lib/shared.js::resolveHostedProfile()` distinguishes `hybrid`, `lan`, and `online`.
- `src/lib/shared.js::buildManifestProfile()` labels `hybrid` as `Hybrid Home` and `lan` as `LAN Bridge`.

Safe resolution note:
- The safest technical/legal reading today is: `LAN Bridge` is the intended user-facing/live-doc label, while `routeProfile='hybrid'` is the current code-level fallback-capable implementation of that home-device route, and `routeProfile='lan'` is the strict legacy/manual fail-closed variant.
- If the product wants one term only, the repo needs a coordinated docs-plus-code cleanup. Until then, do not claim there is zero naming drift.

### B3. Plain-English End-To-End Flow

#### 1. Configure

`VERIFIED FROM DOCS`:
- Windows-host users are expected to configure from the local desktop runtime first.
- The public website is guide-only, not the main place to paste private backend details.
- Self-hosted server mode has its own `/configure` surface and browser password flow.

`VERIFIED IN CODE`:
- `GET /configure` is live in `index.js`.
- On a hosted/Vercel runtime, `/configure` redirects back to the public route guide instead of acting like a public secret-entry page.
- On the Windows/local runtime, `/configure` serves the live setup UI.
- On self-host server mode, the configure page exposes the self-host password flow and loads/saves server config.

#### 2. Save / encrypt

There are three distinct save paths.

`VERIFIED IN CODE`:
- `POST /encrypt`: validates and normalizes a hosted config, encrypts it into a hosted config token, and tries to persist a linked-account hosted takeover profile when the config is hosted-capable.
- `POST /local-config`: saves the disk-backed local runtime config for `PC Local` and the local home-device route.
- `POST /server-config`: saves the self-hosted server config, gated by CSRF plus the self-host server-admin token.

Security/storage mechanism:
- `VERIFIED IN CODE`: config tokens, auth tokens, and opaque playback/file state tokens use AES-256-GCM via `src/utils/crypto.js`.
- `VERIFIED IN CODE`: secure disk-backed JSON files use the `__pvtkrrxSecure` wrapper from `src/utils/secureJsonFile.js`.

#### 3. Install route chosen

`PC Local`
- `VERIFIED FROM DOCS` and `VERIFIED BY TEST`: installs from `http://127.0.0.1:7000/local/manifest.json?mode=local`.

Hosted home-device route
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: installs from a hosted token manifest on the relay.
- `VERIFIED FROM DOCS`: the primary same-account install shape is a hosted `stremio://.../{token}/manifest.json?mode=hosted` deep link, with plain HTTPS addon URL as manual fallback.

`Remote Seedbox`
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: installs from a hosted HTTPS manifest or from the disk-backed `/selfhost/manifest.json?mode=hosted` alias on an explicit self-host server runtime.

Important install truth:
- `VERIFIED FROM DOCS`: raw `192.168.x.x` addon installs are not the stable primary supported Stremio path.
- `VERIFIED FROM DOCS`: the only reliable HTTP exception for direct Stremio install is `127.0.0.1`.

#### 4. Stremio manifest load

`VERIFIED IN CODE`:
- `GET /:config/manifest.json` is the main configured manifest route.
- `GET /manifest.json` is the bootstrap manifest, not the full configured addon.
- Manifest profile naming/description depends on `routeProfile` through `src/lib/shared.js::buildManifestProfile()`.
- `withConfig` decides whether `:config` is disk-backed local/self-host alias or an encrypted hosted token.

#### 5. Catalog generation

`VERIFIED IN CODE`:
- Catalog routes call `handleCatalog`.
- Movies and TV search through Prowlarr and enrich via Cinemeta where applicable.
- Library catalog is built from qBittorrent/library state and uses internal `pvtkrrx:` custom ids.
- Sports catalog searches tracker availability first, groups availability, resolves against SportsMeta identity where possible, then emits either canonical `sportsmeta:` ids or fallback `pvtkrrx:` sports ids.

#### 6. Meta generation

`VERIFIED IN CODE`:
- Meta routes call `handleMeta`.
- `pvtkrrx:` ids go through `handleCustomMeta`.
- `sportsmeta:` ids try a live SportsMeta event lookup first.
- IMDb ids proxy through Cinemeta.
- If no path resolves, PVTKRRX returns a placeholder meta object instead of inventing metadata.

#### 7. Stream generation

`VERIFIED IN CODE`:
- Stream routes call `handleStream`.
- `pvtkrrx:` custom ids and `sportsmeta:` ids ultimately feed the same stream decision layer.
- Sports streams prefer the original tracker availability anchor even when the addon-facing id became canonical `sportsmeta:event:...`.
- The stream layer suppresses tracker playback when the runtime cannot truthfully serve it.

#### 8. Playback decision

`VERIFIED FROM DOCS` and `VERIFIED IN CODE`:
- Built-in `/file` is the direct local-byte path.
- Built-in `/playback` is the queued-download / poll / handoff path.
- On playback-capable runtimes, `/playback` redirects into `/file` once the target file path is ready to serve safely.
- On the public hosted relay, `/file` and `/playback` must fail fast for non-local requests.

#### 9. Local file serving vs hosted fail-fast behavior

`VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`:
- Local `/:config/file/:info` can serve bytes and Range responses when the file is locally accessible.
- Local `/:config/playback/:info` can queue/poll/redirect into `/file`.
- Hosted public `/:config/file/:info` returns `403` when the request is non-local and would need built-in local serving.
- Hosted public `/:config/playback/:info` returns `403` when the request is non-local and would need built-in local buffering/queueing.
- `Remote Seedbox` on the public relay therefore stays ready-file-first and external-endpoint-first.

#### 10. LAN pair heartbeat / redirect behavior

`VERIFIED IN CODE` and `VERIFIED BY TEST`:
- Electron posts pair state to `POST /pair/heartbeat`.
- Hosted routes resolve the pair record through `maybeLanPairRedirect`.
- If the pair is online and the request still qualifies for home-route handling, hosted catalog/meta/stream/file/playback routes 307-redirect to the active local runtime.
- If the pair is offline:
  - `routeProfile='lan'` can fail closed.
  - `routeProfile='hybrid'` can fall through to hosted/cloud behavior and can apply an account-linked hosted takeover config.

#### 11. Account linking / access checks

`VERIFIED IN CODE` and `VERIFIED BY TEST`:
- Stremio link-session creation is live at `POST /auth/stremio/link-session`.
- Stremio AuthKey verification/linking is live at `POST /auth/stremio/link-authkey`.
- Linked account state is persisted in the account store.
- `/auth/me` accepts only the encrypted bearer token and returns a reduced public user model with Stremio link state.

Important control truth:
- `VERIFIED IN CODE`: linked account state currently affects route behavior and takeover config persistence, not addon billing entitlement.
- `VERIFIED IN CODE`: `requireConfigSubscription()` is a pass-through.

#### 12. Sports enrichment flow

`VERIFIED FROM DOCS` and `VERIFIED IN CODE`:
- PVTKRRX starts with tracker-backed availability.
- SportsMeta is asked to resolve identity and canonical event detail.
- Resolved groups emit canonical `sportsmeta:event:...` ids and canonical SportsMeta asset URLs.
- Unresolved groups still emit as `pvtkrrx:` custom ids and point at SportsMeta default asset URLs so the UI does not collapse to a raw/no-art state.
- Stream playback still uses the original SportsCult/tracker anchor under the canonical wrapper.

### B4. Route-By-Route Flow

#### PC Local

Install path:
- `VERIFIED FROM DOCS` and `VERIFIED BY TEST`: `http://127.0.0.1:7000/local/manifest.json?mode=local`

Runtime dependency:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: local runtime only
- `VERIFIED IN CODE`: Electron wrapper is the practical Windows host launcher, but the route logic itself is the local Express runtime

Request path:
- Stremio hits the local runtime directly.
- `withConfig` resolves `config=local` to the disk-backed config file.
- Catalog/meta/stream routes run locally with no hosted redirect step.

Playback path:
- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: completed files go through local `/file`.
- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: incomplete/on-tracker content can go through local `/playback`, which queues and eventually redirects into local `/file`.

Hard constraints:
- same Windows PC only
- Stremio install path depends on `127.0.0.1`, not raw LAN IP

Failure modes:
- missing local config
- missing local services
- inaccessible local file path
- qBittorrent not exposing the target file yet

Fallback behavior:
- no hosted fallback inside the route itself
- if the user chose the wrong route on another device, the fix is to use the hosted home-device route instead of trying to make `PC Local` portable

#### LAN Bridge / Hybrid Home

Audit-safe name:
- User-facing/live-doc name: `LAN Bridge`
- Code/runtime profile name for the main hosted home-device path: `hybrid`
- Legacy strict fail-closed path: `lan`

Install path:
- `VERIFIED FROM DOCS`: hosted token manifest on the relay, usually via `stremio://.../{token}/manifest.json?mode=hosted`
- `VERIFIED IN CODE`: configure UI still labels this install path as `LAN Bridge` while minting `routeProfile: 'hybrid'`

Runtime dependency:
- hosted relay for manifest, pairing, and redirect logic
- local desktop host for the home-network playback path
- linked hosted/public endpoints for away/offline fallback when the profile is `hybrid`

Request path:
1. Stremio hits hosted `/:config/catalog`, `/:config/meta`, `/:config/stream`, `/:config/file`, or `/:config/playback`.
2. `withConfig` decrypts the hosted token and loads any linked hosted takeover config.
3. `maybeLanPairRedirect` resolves pair status.
4. If online and redirectable, hosted response becomes `307` to the active local endpoint with `/local/...?...mode=local`.
5. If offline:
   - strict `lan` returns offline/empty behavior where required
   - `hybrid` can continue with cloud/public behavior

Playback path:
- at home with live pair: behaves like `PC Local` after the 307 redirect
- away or with stale/offline pair:
  - `hybrid`: hosted/public/cloud fallback path can apply
  - strict `lan`: fail-closed behavior remains

Hard constraints:
- host desktop must stay online and heartbeating for the home-network path
- Windows host itself should use `PC Local`, not the hosted home-device addon
- away-from-home playback still needs public-ready endpoints if the request does not redirect home

Failure modes:
- stale or missing pair heartbeat
- wrong pair key
- no redirect URL can be built
- host offline
- hosted fallback config absent or unusable

Fallback behavior:
- `VERIFIED IN CODE`: `hybrid` applies linked-account hosted takeover config through `applyCloudTakeoverConfig` when available
- `VERIFIED IN CODE`: strict `lan` returns empty/offline behavior instead of pretending the request is playable

#### Remote Seedbox

Install path:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: hosted HTTPS token manifest on the public relay, or `/selfhost/manifest.json?mode=hosted` on an explicit self-host server runtime

Runtime dependency:
- public file server / public qBittorrent endpoints for the public hosted relay
- or a self-host server runtime that can genuinely serve built-in `/file` and `/playback`

Request path:
- hosted relay decrypts the token and treats the route as `online` / non-LAN-paired
- no LAN redirect is required
- stream layer emits ready-file-compatible outputs only

Playback path:
- public hosted relay:
  - completed public file only
  - external `fileServerUrl` or public qBittorrent URL
  - built-in hosted `/file` and `/playback` must fail fast
- self-host server runtime:
  - can use built-in `/file` and `/playback` if it can genuinely read/serve the file
  - can separate public control/install origin from public byte-serving origin through `PVTKRRX_PLAYBACK_BASE_URL`

Hard constraints:
- public hosted relay is not a buffering/video-proxy runtime
- external file server is optional in some setups, but required for public hosted ready-file playback when the runtime cannot read local files directly

Failure modes:
- no public playback endpoint
- auth-protected external redirect chain that Stremio cannot safely follow with required headers
- tracker buffering required on a public hosted relay

Fallback behavior:
- fail fast with truthful restriction
- suppress tracker `/playback` streams before Stremio clicks into a dead path

### B5. Exact Technical Flow Map

#### Flow 1. Hosted manifest / config resolution

```text
Stremio client
  -> GET /:config/manifest.json?mode=hosted
  -> index.js route handler
  -> withConfig()
     -> if :config is disk alias: load secure local-config.json
     -> else: decrypt hosted token with ENCRYPTION_SECRET
     -> normalizeAddonConfig()
     -> loadAccountHostedTakeoverConfig() for hybrid tokens
  -> buildManifestProfile()
     -> local | lan | hybrid | online profile description/id
  -> manifest JSON returned
```

Key proof:
- `VERIFIED IN CODE`: `index.js` manifest routes
- `VERIFIED IN CODE`: `src/lib/shared.js::withConfig()`
- `VERIFIED IN CODE`: `src/lib/shared.js::buildManifestProfile()`

#### Flow 2. Hosted home-device request with live pair

```text
Home device on hosted token
  -> GET /:config/stream/... or /catalog/... or /meta/... or /file/... or /playback/...
  -> withConfig()
  -> maybeLanPairRedirect(routeKind)
     -> resolveLanPair()
     -> if pair online:
        -> buildLanRedirectUrl()
        -> 307 redirect to active local endpoint /local/... ?mode=local
  -> client follows redirect
  -> local runtime handles request as PC Local
```

Key proof:
- `VERIFIED IN CODE`: `src/lib/shared.js::maybeLanPairRedirect()`
- `VERIFIED BY TEST`: `npm run smoke:lan-pair` proves hosted catalog redirect when pair is online

#### Flow 3. Hosted home-device request with offline pair

```text
Hosted request
  -> withConfig()
  -> maybeLanPairRedirect(routeKind)
     -> resolveLanPair() returns offline / stale / mismatch
     -> if lanPairRequired=true:
        -> offline/fail-closed response
     -> else if hosted profile is hybrid:
        -> applyCloudTakeoverConfig()
        -> continue through hosted/public handler path
     -> else:
        -> continue through existing hosted/public config
```

Key proof:
- `VERIFIED IN CODE`: `src/lib/shared.js::applyCloudTakeoverConfig()` and `::maybeLanPairRedirect()`
- `VERIFIED BY TEST`: `npm run smoke:lan-pair` proves offline fallback behavior and strict fail-closed behavior

#### Flow 4. Stream -> playback -> file

```text
Stremio click on stream
  -> GET /:config/stream/:type/:id.json
  -> handleStream()
     -> choose custom / sportsmeta / imdb stream path
     -> decide direct external file URL vs local file URL vs playback URL
     -> suppress tracker playback when runtime cannot serve it
  -> user selects emitted stream URL
  -> GET /:config/playback/:info
     -> local/self-host capable runtime:
        -> queue or poll torrent/file state
        -> when safe, 302 redirect to /:config/file/:info
     -> public hosted non-local runtime:
        -> 403 fail fast
  -> GET /:config/file/:info
     -> local/self-host capable runtime:
        -> serve bytes / ranges
     -> public hosted non-local runtime:
        -> 403 fail fast
```

Key proof:
- `VERIFIED IN CODE`: `src/handlers/stream.js`
- `VERIFIED IN CODE`: `src/utils/fileServing.js`
- `VERIFIED IN CODE`: `index.js` `/file` and `/playback` routes
- `VERIFIED BY TEST`: `npm run smoke:playback`, `npm run smoke:guards`, `npm run smoke:pipeline`

#### Flow 5. Stremio AuthKey link flow

```text
Configure page
  -> POST /auth/stremio/link-session
     -> one-time install/session state saved
  -> user or local scan provides AuthKey
  -> POST /auth/stremio/link-authkey
     -> verify against Stremio API
     -> create or link accountStore user
     -> issue encrypted bearer auth token
     -> refresh hosted addon URL without one-time linkSession marker
  -> GET /auth/me with bearer token
     -> requireAuthUser()
     -> reduced public user model returned
```

Key proof:
- `VERIFIED IN CODE`: `index.js` auth routes
- `VERIFIED IN CODE`: `src/utils/accountStore.js`
- `VERIFIED IN CODE`: `src/utils/stremioLinkStore.js`
- `VERIFIED IN CODE`: `src/utils/authToken.js`
- `VERIFIED BY TEST`: `npm run smoke:stremio-link`

#### Flow 6. Electron heartbeat loop

```text
Electron launch
  -> start local server
  -> optionally run auto-provision
  -> sendLanPairHeartbeat('startup')
  -> setInterval heartbeat loop
  -> watch Stremio launch state
  -> pulseLanPairOnStremioLaunch()
  -> hosted relay receives /pair/heartbeat updates
```

Key proof:
- `VERIFIED IN CODE`: `electron/main.js` heartbeat/startup/tray logic

### B6. SVG / Artwork Flow

This section is intentionally strict because the repo previously had local sports art logic and now does not.

What is proven live:
- `VERIFIED FROM DOCS`: SportsMeta is the separate metadata/artwork boundary.
- `VERIFIED IN CODE`: the old local sports artwork endpoints now return `HTTP 410 Gone`.
- `VERIFIED IN CODE`: `src/utils/sportsArtwork.js` only builds SportsMeta asset URLs.
- `VERIFIED IN CODE`: `src/clients/sportsmeta.js` builds:
  - canonical asset URLs: `/asset/{variant}/{canonicalId}`
  - default asset URLs: `/asset/default/{variant}/{sport}?league=...`
- `VERIFIED IN CODE`: catalog/meta handlers call `resolveSportsPosterAsset()`, `resolveSportsBackgroundAsset()`, and `resolveSportsLogoAsset()`.

What this repo no longer does:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it no longer calls a local `SportsDbClient`.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it no longer owns a `sports-image-cache/` runtime path.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it no longer serves `/thumb/sports/...` or `/image/sports/...` artwork bytes.
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: it no longer runs the old 15-minute TheSportsDB autofill job.

Actual live selection order in this repo:
1. `VERIFIED IN CODE`: if a canonical SportsMeta id exists, build the canonical asset URL through `buildSportsMetaAssetUrl()`.
2. `VERIFIED IN CODE`: otherwise build the default asset URL through `buildSportsMetaDefaultAssetUrl()` using sport and optional league hints.
3. `VERIFIED IN CODE`: in meta responses, if the resolved URL is empty, fall back to the repo brand poster/logo placeholders rather than claiming a sport asset exists.

Where sports enrichment is called:
- `VERIFIED IN CODE`: `src/handlers/catalog.js::sportsCatalog()` calls `resolveSportsMetaIdentity()` using a `SportsMetaClient`.
- `VERIFIED IN CODE`: `src/handlers/meta.js::loadCanonicalSportsMeta()` calls `SportsMetaClient.getEvent()`.
- `VERIFIED IN CODE`: `src/handlers/stream.js::loadSportsMetaInfo()` calls `SportsMetaClient.getEvent()` and falls back to parsing the canonical id if the lookup fails.

What is cached locally in this repo:
- `VERIFIED IN CODE`: sports availability anchors are cached in memory by `src/utils/sportsAvailabilityStore.js`.
- `VERIFIED IN CODE`: canonical-id-to-anchor mappings are cached in memory there as well.
- `VERIFIED IN CODE`: default TTL is 6 hours and default max entries is 4000.

What is not cached locally in this repo:
- sports artwork bytes
- SVG source files
- TheSportsDB responses

What happens when enrichment fails:
- `VERIFIED IN CODE`: catalog does not silently drop a tracker-backed sports row. It emits a `pvtkrrx:` fallback sports id and default SportsMeta asset URL instead.
- `VERIFIED IN CODE`: stream resolution for canonical `sportsmeta:` ids can still fall back to parsed id info when live SportsMeta event lookup fails.
- `VERIFIED IN CODE`: meta for unresolved/non-canonical ids falls back to custom-id-carried hints and placeholder behavior when necessary.

What remains unproven from this repo:
- `[UNPROVEN - DO NOT STATE AS FACT]` whether the default SportsMeta asset routes are generated dynamically, pre-rendered, cached on disk, or served from another asset pipeline
- `[UNPROVEN - DO NOT STATE AS FACT]` the exact SVG generation pipeline inside SportsMeta
- `[UNPROVEN - DO NOT STATE AS FACT]` any TheSportsDB licence/attribution mechanics inside SportsMeta

Conclusion on SVG fallback:
- PVTKRRX live code selects SVG-capable fallback asset URLs owned by SportsMeta.
- PVTKRRX does not generate or store those SVG fallbacks itself anymore.

### B7. Licence / Entitlement / Control Flow

#### B7.1. Software licence position

What the repo says:
- `VERIFIED FROM DOCS`: `README.md` says `Source Available - free for personal use. Commercial use restricted.`
- `VERIFIED FROM DOCS`: `CLAUDE.md` says `License | Source Available`.
- `VERIFIED FROM CODE/CONFIG`: `package.json` says `SEE LICENSE IN LICENSE`.

What the repo does not prove:
- `[UNPROVEN - DO NOT STATE AS FACT]` the exact operative software licence text, because there is no `LICENSE` file in this workspace.

Audit-safe conclusion:
- The repo claims a source-available position.
- The exact software licence instrument is missing from the repo and must not be described as fully settled.

#### B7.2. Access entitlement / trial / billing / linked-account control

What is actually live:
- `VERIFIED IN CODE`: account linking is real.
- `VERIFIED IN CODE`: `/auth/stremio/link-authkey`, `/auth/stremio/link-session`, and `/auth/me` are live.
- `VERIFIED IN CODE`: linked account state can persist a hosted takeover config token for `hybrid` route fallback.
- `VERIFIED IN CODE`: self-host browser password is real and gates private server config load/save on the self-host configure page.

What is currently enforced on addon access:
- `VERIFIED IN CODE`: nothing in the addon route surface checks active subscription or trial before serving manifest/catalog/meta/stream/file/playback.
- `VERIFIED IN CODE`: `requireConfigSubscription()` is a pass-through with the explicit comment `Billing/subscription gating removed - addon is free.`

What state is stored:
- `VERIFIED IN CODE`: account store records internal user id, email or synthetic Stremio email, Stremio link metadata, and optional `pvtkrrx.hostedTakeoverConfigToken`.
- `VERIFIED IN CODE`: link-session store records one-time install/link state with TTL.
- `VERIFIED IN CODE`: there is no proven active subscription/trial record in the reviewed live account-store code.

What env flags exist but are not live enforcement:
- `VERIFIED FROM DOCS`: `PVTKRRX_FREE_MODE`
- `VERIFIED FROM DOCS`: `PVTKRRX_REQUIRE_ACTIVE_SUBSCRIPTION`
- `VERIFIED FROM DOCS`: `PVTKRRX_TRIAL_ENABLED`
- `VERIFIED FROM DOCS`: `PVTKRRX_TRIAL_DAYS`
- `VERIFIED FROM DOCS`: `PVTKRRX_TRIAL_REQUIRE_LINKED_ACCOUNT`

Audit-safe conclusion on billing/trial:
- Billing/trial logic in this repo is present as documentation/env-surface residue, not as live addon enforcement.
- Current addon access is effectively forced-free in this repo.

#### B7.3. Third-party asset / content licensing dependencies

What is proven:
- `VERIFIED FROM DOCS`: SportsMeta owns paid TheSportsDB usage, artwork routes, member-token routes, and billing on the sports side.
- `VERIFIED FROM DOCS`: PVTKRRX free addon routes should not surface the paid/member asset layer directly.

What is not proven here:
- `[UNPROVEN - DO NOT STATE AS FACT]` TheSportsDB licence terms as implemented by SportsMeta
- `[UNPROVEN - DO NOT STATE AS FACT]` SportsMeta asset attribution requirements
- `[UNPROVEN - DO NOT STATE AS FACT]` rights posture for any specific poster/background/logo byte served by SportsMeta

Audit-safe conclusion:
- This repo depends on SportsMeta as the sports asset/licensing boundary.
- This repo does not itself prove the downstream third-party asset rights model.

### B8. Storage / State Model

| State | Where it lives | Proof status | Notes |
|---|---|---|---|
| Hosted config token | URL path token `/:config/...` | `VERIFIED IN CODE` | Encrypted with AES-256-GCM; not plain JSON |
| Local desktop config | runtime `local-config.json` | `VERIFIED IN CODE` | Secure JSON wrapper at rest |
| Self-host server config | same disk-backed config alias path | `VERIFIED FROM DOCS` and `VERIFIED IN CODE` | Saved via `POST /server-config` with server-admin auth |
| Pair state | memory, secure file `lan-pair-store.json`, or KV REST | `VERIFIED IN CODE` | Store selected by deployment/env |
| Account state | memory, secure file `accounts-store.json`, or KV REST | `VERIFIED IN CODE` | Linked-account data, no live billing gate proven |
| Stremio link-session state | memory, secure file `stremio-link-store.json`, or KV REST | `VERIFIED IN CODE` | Default TTL 1800 seconds |
| Auth bearer token | client-held opaque bearer token | `VERIFIED IN CODE` and `VERIFIED BY TEST` | Payload verifies as encrypted token, not readable JSON |
| Playback/file opaque state | URL path tokens on `/playback` and `/file` | `VERIFIED IN CODE` and `VERIFIED BY TEST` | TTL-bound opaque tokens, not server session rows |
| Sports availability anchor cache | in-process memory maps | `VERIFIED IN CODE` | Default TTL 6h, no disk persistence reviewed |
| Artwork cache in this repo | none live | `VERIFIED FROM DOCS` and `VERIFIED IN CODE` | Legacy local sports art cache removed |
| Hosted takeover config | encrypted token inside linked account record | `VERIFIED IN CODE` | Used for `hybrid` fallback |
| Entitlement/trial flags | env docs only | `VERIFIED FROM DOCS` | Not enforced live in reviewed code |
| Self-host password on server | runtime file `server-admin-token` or env | `VERIFIED IN CODE` | File mode `0600` when written |
| Self-host password in browser | `localStorage` key `pvtkrrx_selfhost_password` | `VERIFIED IN CODE` | Configure page can also bootstrap from URL then scrub it |
| Analytics dedupe state | runtime `analytics-dedupe.json` | `VERIFIED IN CODE` | Only relevant if analytics is enabled by env |
| Logs | process stdout/stderr | `VERIFIED IN CODE` | Redaction helpers exist; no dedicated log file sink was proven |

### B9. Security / Control Boundaries

Hosted relay must never do:
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: proxy public video bytes as if it were the media host
- `VERIFIED FROM DOCS` and `VERIFIED IN CODE`: keep buffering tracker playback on a public hosted runtime that cannot serve `/playback`

Local-only routes guarded:
- `VERIFIED IN CODE`: `requireLocalNetworkRoute` protects `POST /local-config`, `POST /auto-provision`, `GET /network-info`, `POST /local/lan-token`, and `GET /local/pair-status`
- `VERIFIED BY TEST`: hosted spoofed `Host` or `X-Forwarded-For` does not unlock these routes

Sensitive origin / CSRF rules:
- `VERIFIED IN CODE`: `PVTKRRX_ALLOWED_WEB_ORIGINS` defaults to `https://www.pvtkrrx.cc`
- `VERIFIED IN CODE`: CSRF double-submit token is required on sensitive mutation routes
- `VERIFIED BY TEST`: bad origins are rejected even with a CSRF token

Test-connection rules:
- `VERIFIED IN CODE`: hosted `/test-connection` rejects loopback, LAN, private-resolution, `.local`, and rebinding-like hosts
- `VERIFIED BY TEST`: `nip.io`, `sslip.io`, `lvh.me`, and `localtest.me` style targets are blocked

Sensitive data protections:
- `VERIFIED IN CODE`: config tokens encrypted with `ENCRYPTION_SECRET`
- `VERIFIED IN CODE`: secure JSON files encrypted at rest
- `VERIFIED IN CODE`: playback/file state tokens are opaque and TTL-bound
- `VERIFIED IN CODE`: bearer auth token is encrypted and reduced to opaque subject metadata
- `VERIFIED BY TEST`: config readback redacts secrets, `/auth/me` omits internal user id/email, and `pair/status` omits endpoint metadata

### B10. Operating Modes

#### Normal mode

- `PC Local`: local runtime serves manifest, catalog, meta, stream, `/playback`, and `/file` directly on the host PC.
- Hosted home-device route with live pair: hosted relay resolves config, sees the pair online, and 307-redirects the request back to the active local host so the device effectively uses the local runtime.
- `Remote Seedbox`: hosted relay emits ready-file/public playback paths, or a self-host server runtime serves built-in playback if it can genuinely do so.

#### Offline mode

- `VERIFIED IN CODE`: if the local disk config is missing, local manifest/bootstrap paths still load but the addon surface has no working private backend config yet.
- `VERIFIED IN CODE`: if LAN pair state is stale or missing:
  - strict `lan` can fail closed
  - `hybrid` can continue on a hosted/cloud path instead of pretending the host is still online
- `VERIFIED IN CODE`: if canonical SportsMeta event lookup fails, stream logic can still continue from parsed `sportsmeta:` id information, but live event enrichment is reduced.

#### Fail-fast mode

- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: hosted public `/file` returns `403` for non-local requests that still depend on built-in local serving.
- `VERIFIED FROM DOCS`, `VERIFIED IN CODE`, and `VERIFIED BY TEST`: hosted public `/playback` returns `403` for non-local requests that still depend on built-in local queue/buffer behavior.
- `VERIFIED IN CODE`: tracker `/playback` streams are suppressed before emission when the runtime cannot safely serve them, including hosted-runtime restrictions and auth-protected external redirect-chain restrictions.
- `VERIFIED IN CODE` and `VERIFIED BY TEST`: packed incomplete releases are suppressed or surfaced with a truthful restriction notice rather than a fake playable URL.

#### Fallback mode

- `VERIFIED IN CODE`: the main hosted home-device profile (`hybrid`) can apply a linked hosted takeover config when the LAN pair is offline or no redirect URL can be built.
- `VERIFIED IN CODE`: sports catalog fallback keeps unresolved rows visible by emitting `pvtkrrx:` ids plus SportsMeta default asset URLs instead of dropping them.
- `VERIFIED IN CODE`: meta falls back to custom-id-carried hints or placeholder output when canonical lookup does not resolve.
- `VERIFIED IN CODE`: stream resolution falls back from live SportsMeta event lookup to canonical-id parsing for search context.

### B11. Live Now Vs Documented-Only

Live and code-proven now:
- hosted config token flow
- disk-backed local/self-host config flow
- pair heartbeat and pair-status flow
- hosted 307 redirect back to the active local host
- local `/file` and `/playback`
- hosted `/file` and `/playback` fail-fast restrictions
- Stremio AuthKey account linking and `/auth/me`
- SportsMeta URL delegation for sports metadata/artwork
- sports availability anchor caching
- self-host browser password storage and gating
- forced-free addon access path

Documented but not proven as live in this repo:
- PVTKRRX-generated sports SVG fallback generation
- local TheSportsDB artwork cache as part of the live runtime
- active addon billing/subscription gate
- full real-device parity across every Stremio client class
- SportsMeta internal asset generation, caching, billing, and TheSportsDB compliance details

## C. Exact proof

### C1. Phase 1 - document review

Exact docs used in truth-order priority:

| File | Exact sections / headings used | Main live truth extracted |
|---|---|---|
| `docs/CURRENT_DESIGN.md` | top-level boundary sections, route table, playback model, SportsMeta boundary, pairing section, install notes, anti-claims | canonical live boundary, locked route vocabulary, fail-fast rules, SportsMeta ownership, no `.pvtk` format |
| `docs/ROUTE_FRAMEWORK.md` | route table, `PC Local`, `Hybrid Home`, `Remote Seedbox`, playback capability matrix, endpoint matrix | exact route mechanics, legacy strict `LAN Bridge`, public hosted restrictions |
| `docs/STREMIO_INSTALL_TRACKER.md` | install matrix, route recommendations, unsupported raw LAN install notes | supported install shapes, `127.0.0.1` truth, hosted install truth |
| `docs/PROJECT_STATUS.md` | current review findings, route terminology notes, free-mode note, sports/id changes | live review caveats, mixed naming, forced-free path |
| `docs/SPEC.md` | goals, route model, non-goals, requirements | addon family scope, locked negative claims, route expectations |
| `ARCHITECTURE.md` | system diagram, route table, SportsMeta boundary, storage table, invariants | cross-check for boundary and storage, plus stale wording detection |
| `README.md` | current route overview, sports boundary note, env table | source-available claim, env flag status, sports boundary reminder |

Document conflicts found:
- `VERIFIED FROM DOCS`: `CURRENT_DESIGN.md` and `SPEC.md` lock the route vocabulary to `PC Local`, `LAN Bridge`, `Remote Seedbox`.
- `VERIFIED FROM DOCS`: `ROUTE_FRAMEWORK.md`, `STREMIO_INSTALL_TRACKER.md`, and `ARCHITECTURE.md` still use `Hybrid Home` as the main hosted home-device route and describe legacy strict `LAN Bridge` separately.
- `VERIFIED FROM DOCS`: `SPEC.md` still says `Sports catalog with TheSportsDB enrichment and cached portrait/landscape/background artwork`, which does not match the live repo boundary after 2026-04-22.
- `VERIFIED FROM DOCS`: `ARCHITECTURE.md` still contains a stale statement about PVTKRRX staying on generated SVG sports cards, while the same doc also says SportsMeta serves the assets and PVTKRRX no longer generates them.

Historical / planning docs excluded from live truth:
- `docs/IMPLEMENTATION_PLAN_2026-03-29.md`
- `docs/IMPLEMENTATION_PLAN_2026-03-30.md`
- `docs/IMPLEMENTATION_PLAN_2026-03-30_PLAYER_AND_SERVER_BACKLOG.md`
- `docs/PRODUCTION_SPEC_HISTORICAL.md`
- `docs/REBUILD_PROMPT.md`
- `docs/REFACTOR_BRIEF.md`
- `docs/SELFHOST_HTTPS_PLAN.md`
- `docs/PROMPT_CLOUDFLARE_TUNNEL.md`
- `docs/PROMPT_SELFHOST_RELAY_TOKEN.md`
- `docs/LAN_BRIDGE_PROCESS.md`

Why excluded:
- planning, historical, or runbook context only
- not part of the required live source-of-truth order
- allowed only as background, not as override

### C2. Phase 2 - code review

Exact implementation files reviewed:

Core server / route registration:
- `index.js`
- `src/lib/shared.js`
- `src/config/manifest.js`

Catalog / meta / stream:
- `src/handlers/catalog.js`
- `src/handlers/meta.js`
- `src/handlers/stream.js`
- `src/utils/customId.js`

Config / auth / token / secure storage:
- `src/utils/crypto.js`
- `src/utils/secureJsonFile.js`
- `src/utils/opaqueState.js`
- `src/utils/authToken.js`
- `src/utils/serverAdminToken.js`
- `src/utils/runtimeDir.js`

Account / pair / link-session state:
- `src/utils/accountStore.js`
- `src/utils/pairStore.js`
- `src/utils/stremioLinkStore.js`

Playback / file-serving:
- `src/utils/fileServing.js`

Sports enrichment / artwork:
- `src/utils/sportsArtwork.js`
- `src/clients/sportsmeta.js`
- `src/utils/sportsAvailabilityStore.js`
- `src/utils/sportsIdentityResolution.js`

Diagnostics / control:
- `src/utils/analytics.js`
- `src/utils/logRedaction.js`

Electron wrapper:
- `electron/main.js`

Configure UI:
- `public/configure.html`

Smoke/test harness files reviewed:
- `scripts/smoke-config-flow.js`
- `scripts/smoke-runtime-guards.js`
- `scripts/smoke-lan-pair-flow.js`
- `scripts/smoke-stremio-link.js`
- `scripts/smoke-playback-route.js`
- `scripts/smoke-stream-pipeline.js`
- `scripts/smoke-security.js`
- `scripts/smoke-parity-helpers.js`

Exact routes reviewed in code:
- `GET /configure`
- `POST /auth/stremio/link-session`
- `POST /auth/stremio/link-authkey`
- `GET /auth/me`
- `POST /encrypt`
- `POST /local-config`
- `POST /server-config`
- `POST /pair/heartbeat`
- `POST /pair/status`
- `POST /test-connection`
- `GET /:config/manifest.json`
- `GET /manifest.json`
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
- legacy sports art routes returning `410`:
  - `/thumb/sports/:info.png`
  - `/thumb/sports/:variant/:info.png`
  - `/thumb/sports/:info.svg`
  - `/thumb/sports/:variant/:info.svg`

Main code proofs for the highest-risk claims:
- Hosted config load and token decrypt: `src/lib/shared.js::withConfig()`
- Hosted hybrid takeover load: `src/lib/shared.js::loadAccountHostedTakeoverConfig()`
- Hosted redirect / cloud fallback: `src/lib/shared.js::maybeLanPairRedirect()`
- Free-mode pass-through: `src/lib/shared.js::requireConfigSubscription()`
- Manifest naming conflict: `src/lib/shared.js::buildManifestProfile()`
- Hosted `/file` and `/playback` fail-fast routes: `index.js`
- Tracker playback suppression rules: `src/utils/fileServing.js` and `src/handlers/stream.js`
- SportsMeta-only artwork URL selection: `src/utils/sportsArtwork.js` and `src/clients/sportsmeta.js`
- Canonical sports anchor bridge: `src/utils/sportsAvailabilityStore.js`, `src/handlers/catalog.js`, `src/handlers/stream.js`
- Self-host password storage/access: `src/utils/serverAdminToken.js` and `public/configure.html`
- Electron heartbeat / launch pulse: `electron/main.js`

Code claims not fully verified as true in this repo:
- `[DOC CLAIM NOT VERIFIED IN CODE]` PVTKRRX-generated live SVG sports cards
- `[DOC CLAIM NOT VERIFIED IN CODE]` local TheSportsDB artwork cache as a live runtime dependency
- `[DOC CLAIM NOT VERIFIED IN CODE]` active billing/subscription enforcement on addon routes

### C3. Phase 3 - runtime / test proof

Exact commands run:

| Command | Result | What it proves | What it does not prove |
|---|---|---|---|
| `npm run smoke:config` | `PASS` | config save/encrypt flow, secure token generation, CSRF flow, local/relay bootstrap path | does not prove real external trackers or real public Stremio client installs |
| `npm run smoke:guards` | `PASS` | hosted `/playback` fail-fast, hosted `/configure` redirect, CSRF/origin gating, local-only route protection, blocked private test-connection targets | does not prove every deploy platform or CDN edge behavior |
| `npm run smoke:lan-pair` | `PASS` | pair heartbeat, pair key rotation, hosted 307 redirect to local, offline fallback behavior, endpoint metadata omission from `/pair/status` | does not prove all device clients follow redirects the same way |
| `npm run smoke:stremio-link` | `PASS` | link-session creation, AuthKey verification flow, account persistence, opaque bearer token, reduced `/auth/me` user model | uses a mocked Stremio API, not a real live Stremio account |
| `npm run smoke:pipeline` | `PASS` | stream-emission rules, suppression paths, opaque playback/file URLs, sports canonical-anchor recovery | does not prove real tracker/network latency or SportsMeta live availability |
| `npm run smoke:playback` | `PASS` | `/playback` to `/file` handoff, packed-archive handling, range/ready-path behavior on playback-capable runtimes | uses mocks and temp files, not a real remote seedbox |
| `npm run smoke:security` | `PASS` | config redaction, local-route guard robustness, pair/status privacy, token rejection, log redaction, secure JSON behavior | does not prove every production logging sink |
| `npm run smoke:parity` | `PASS` | route-parity helpers, blocked private targets, runtime-dir helper parity, removal of legacy sportsdb/sportsThumb imports | does not prove UI text consistency |

Warnings observed during passing smoke runs:
- `npm run smoke:lan-pair` emitted post-pass warning lines including a pair owner-mismatch rejection, a timeout in a movie meta lookup, and a Prowlarr warm-up `401`. The script still passed, so these are caveats, not failures.
- `npm run smoke:pipeline` emitted a SportsMeta lookup warning (`response.json is not a function`) in a mocked path. The script still passed because it was exercising fallback behavior.

PASS / FAIL summary:
- smoke:config: `PASS`
- smoke:guards: `PASS`
- smoke:lan-pair: `PASS`
- smoke:stremio-link: `PASS`
- smoke:pipeline: `PASS`
- smoke:playback: `PASS`
- smoke:security: `PASS`
- smoke:parity: `PASS`

Exact proof snippets / references for main claims:
- Hosted fail-fast playback: `index.js` route `GET /:config/playback/:info` plus `src/utils/fileServing.js::canServePlaybackRoute()`
- Hosted fail-fast file path: `index.js` route `GET /:config/file/:info`
- Free entitlement state: `src/lib/shared.js` comment above `requireConfigSubscription()`
- Naming conflict: `public/configure.html` labels `LAN Bridge` while `routeProfile: 'hybrid'`; `src/lib/shared.js::buildManifestProfile()` maps `hybrid` to `Hybrid Home`
- SportsMeta-only asset URLs: `src/utils/sportsArtwork.js` and `src/clients/sportsmeta.js`
- Legacy sports art gone: `index.js` legacy `/thumb/sports/...` routes return `410`
- Account linking real: `index.js` auth routes plus `src/utils/accountStore.js`
- Opaque token model: `src/utils/opaqueState.js` and `src/utils/authToken.js`, plus `smoke:lan-pair` and `smoke:stremio-link`
- Self-host password in browser only: `public/configure.html` storage key `pvtkrrx_selfhost_password`
- Self-host password on disk: `src/utils/serverAdminToken.js`

## D. Weak points

- Route terminology is still mixed across live docs, UI, manifest descriptors, and internal route-profile names.
- `docs/SPEC.md` is stale on sports artwork ownership and local TheSportsDB/cache behavior.
- `ARCHITECTURE.md` still contains a stale SVG-generation sentence.
- Exact software licence text is unproven because the repo references a `LICENSE` file that is not present.
- Billing/trial env flags remain documented, but there is no live addon entitlement enforcement in reviewed code.
- `docs/PROJECT_STATUS.md` contains Stripe/subscription references in context, but code search over `index.js` and `src/` did not prove live `/billing/*` routes in this repo.
- SportsMeta internals are outside this repo. The repo cannot prove how SportsMeta generates, stores, caches, licences, or rate-limits artwork.
- Smoke tests are local and heavily mocked. They prove route logic and guard behavior, not full real-world parity across every Stremio client and every remote/public environment.
- The audit did not perform a real public Remote Seedbox playback against a live remote file server in this turn.
- The audit did not perform fresh live device tests for Apple TV, Android TV, or other synced clients in this turn; those device claims remain doc-verified, not runtime-verified here.
- No dedicated persistent operational log sink was proven beyond stdout/stderr and optional analytics dedupe state.

## E. Exact fixes made or needed

Fixes made in this turn:
- Added this audit document only.
- No runtime code paths were changed.

Fixes still needed:

1. File: `docs/SPEC.md`  
Why: stale sports wording still implies local TheSportsDB enrichment and cached artwork in PVTKRRX.  
Type: docs-only

2. File: `ARCHITECTURE.md`  
Why: remove or rewrite the stale sentence that implies PVTKRRX still generates sports SVG cards locally.  
Type: docs-only

3. Files: `docs/ROUTE_FRAMEWORK.md`, `docs/STREMIO_INSTALL_TRACKER.md`, `ARCHITECTURE.md`, `public/configure.html`, `src/lib/shared.js`, `index.js`  
Why: resolve `LAN Bridge` vs `Hybrid Home` terminology drift. The repo needs one explicit rule: either `LAN Bridge` stays the user/legal term while `hybrid` remains an internal profile label, or the product adopts one term everywhere.  
Type: both

4. File: repo root `LICENSE` or equivalent declared licence file  
Why: `package.json` and docs reference a licence file that is missing, leaving the exact software licence position unproven.  
Type: docs/legal packaging

5. Files: `README.md`, `docs/PROJECT_STATUS.md`, and any future commercial docs  
Why: clearly mark billing/trial env flags as non-enforcing placeholder surfaces in this repo and keep SportsMeta commercial ownership separate from PVTKRRX addon access.  
Type: docs-only

6. Files: optional follow-up test docs and smoke coverage plan  
Why: add real-device parity passes for at least one away-from-home `Remote Seedbox` playback and one current same-account home-device browse/play pass.  
Type: docs/test process

## F. Safe public wording

PVTKRRX is a Stremio addon system that connects your own tracker, qBittorrent, storage, and optional seedbox setup into one addon family for movies, TV, sports, and library. It runs as a hosted relay plus a local Windows runtime, with `PC Local` for the host machine, a hosted home-device route that can redirect back to the paired local runtime, and `Remote Seedbox` for public-ready playback paths.

PVTKRRX does not host your media and the public relay does not proxy video bytes. Local playback features depend on your own machine or server being able to read and serve the file. Sports metadata and artwork are now delegated to SportsMeta; PVTKRRX no longer generates or caches sports artwork locally. Account linking is live for route and install behavior, but addon access in this repo is currently forced free rather than subscription-gated.
