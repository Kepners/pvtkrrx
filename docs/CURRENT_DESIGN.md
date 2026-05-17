# PVTKRRX Current Design

Updated: 2026-04-26

## Purpose

This is the canonical description of how PVTKRRX works today.
If another document disagrees with this file, this file wins unless that document is explicitly marked as historical context.

## Runtime Model

PVTKRRX is one codebase with three active runtime pieces:

1. Optional hosted relay on the public site (`https://www.pvtkrrx.cc` today, fronted by Caddy into the live hosted Express runtime, currently the Contabo Coolify app alias `pvtkrrx:3000`):
   - should run with `PVTKRRX_HOSTED_RELAY=true` so public hosted routes stay guide/token/ready-file-first and do not serve local-only `/file` or `/playback`
   - serves hosted manifests plus the public guide pages
   - serves `/version-status.json` so the public site can compare the live build against the latest GitHub release
   - encrypts hosted config tokens
   - stores LAN pair state and account data when KV-backed storage is configured
   - handles Stremio AuthKey linking and account-scoped access checks
   - can mint short-lived Stremio link sessions so any signed-in browser device can link a hosted config token to a Stremio account
   - may test only public HTTP/HTTPS endpoints when the shared configure UI is opened on an allowed runtime
2. Self-hosted server mode on a VPS/seedbox (`PVTKRRX_SELF_HOST_MODE=true`):
   - serves its own `/configure` page and static UI
   - saves a disk-backed server config into the runtime directory
   - exposes a stable `/selfhost/manifest.json?mode=hosted` manifest with addon id `com.kepners.pvtkrrx.selfhost`
   - can mint short-lived Stremio link sessions that persist the linked `stremioUserId` back into the disk-backed `selfhost` config
   - can validate localhost/private Prowlarr and qBittorrent URLs only for same-host requests or browser sessions that present the self-host password
   - now has a one-command Linux installer that bootstraps the app directory, bundled Node runtime, `.env`, stable runtime dir, saved self-host config, password, and optional `systemd` service
   - the Linux bootstrap now auto-selects a free qBittorrent WebUI port when the default is occupied
   - can choose the self-host HTTPS front door as FreeDNS, a user-owned `https://` origin, or skip for later manual setup, and persists that choice in `PVTKRRX_SELF_HOST_HTTPS_MODE`
   - exposes a hosted launcher script at `https://www.pvtkrrx.cc/install-selfhost.sh` so the first curl can come from the canonical site instead of the moving GitHub branch tip
   - pulls the app source from the branch payload by default, with optional pinning via `PVTKRRX_RELEASE_TAG` or a custom release manifest URL; if a pinned release is too old to include `scripts/server-installer.js`, it retries from `main`
   - auto-discovers existing Prowlarr/qBittorrent configs when the services are already installed, then fills the self-host config from the recovered URLs, API keys, usernames, and ports instead of forcing a blank slate
   - provider discovery only auto-fills `127.0.0.1` / `localhost` when that service is actually detected on the same host; if Prowlarr or qBittorrent are not detected locally, the installer leaves the URL empty (or preserves a previously saved explicit remote URL) instead of inventing a loopback seedbox URL
   - if those providers are missing on a direct `npm run server:setup` run, it can hand off to the full Linux bootstrap so the installer can install them instead of silently continuing with empty defaults
   - self-host install links should come from a configured public HTTPS base URL (`PVTKRRX_PUBLIC_BASE_URL`) rather than a raw public `http://IP:port` origin
   - self-host playback can now split away from that install/control origin: `PVTKRRX_PUBLIC_BASE_URL` still drives manifest/configure/install links, while optional `PVTKRRX_PLAYBACK_BASE_URL` overrides the built-in `/file` and `/playback` stream origin
   - the installer now handles that split directly: FreeDNS and domain installs default built-in playback to the same public HTTPS origin while still allowing an optional direct playback origin
   - when a real FreeDNS/domain front door is configured, the installer now disables any leftover `pvtkrrx-tunnel.service` so the old Cloudflare quick tunnel is removed from the runtime path
   - the installer prints a one-time `Configure` bootstrap URL with `#serverAdminToken=...` so the browser can load the saved self-host config automatically on first open
   - sports metadata and artwork are served by the SportsMeta companion service (`https://sportsmeta.pvtkrrx.cc`); the installer no longer pre-seeds a local TheSportsDB image cache and the previous 15-minute autofill job has been removed on 2026-04-22
   - this is the independence path: after bootstrap, the runtime and config stay on the user's hardware and the hosted PVTKRRX site is no longer in the request path unless the user explicitly chooses the hosted relay
   - can install optional Linux `systemd` startup through `npm run server:setup` / `npm run server:install-service`
3. Local runtime on the Windows host:
   - serves `PC Local` manifests and config-backed addon routes
   - exposes built-in `/file` and `/playback` endpoints
   - provides local admin routes such as `/local-config`, `/auto-provision`, `/network-info`, `/local/qbit/preferences`, `/local/qbit/download-path`, and `/local/qbit/auto-extract`
   - reads completed files directly from the host download path when available
   - keeps its disk-backed runtime under `%APPDATA%\PVTKRRX\runtime` by default, outside the EXE install directory, so local config, account/link state, sports metadata, and cached poster bytes survive normal desktop updates and reinstall-over-the-top installs unless the runtime folder is explicitly deleted
   - can mint short-lived Stremio link sessions for the disk-backed `local` config when the request comes from the same host
4. Electron desktop wrapper:
   - launches and packages the local runtime on Windows
   - shows the startup splash and desktop shell
   - reads the same `/version-status.json` release check so the popup can flag when the desktop EXE is behind GitHub Releases
   - performs startup checks, provider warm-up, and local auto-provision helpers
   - can register/unregister itself with Windows sign-in startup from the desktop shell
   - sends LAN pair heartbeat updates and Stremio launch pulses

## Coordinated Product Stack And Entitlement

Canonical product truth (verified 2026-04-23):

- The stack is two coordinated services in one PVTKRRX product family. They are co-owned, co-hosted on Contabo, and deliberately designed to work together, but they are not one binary and not one addon.
- **PVTKRRX** is the Stremio-facing stream addon at `https://www.pvtkrrx.cc` and on the Windows desktop runtime. It owns install routes (`PC Local`, `LAN Bridge`, `Remote Seedbox`), catalog emission, `/file`, `/playback`, qBittorrent/Prowlarr integration, and stream attachment.
- **SportsMeta** is the sports identity and artwork service at `https://sportsmeta.pvtkrrx.cc`. It owns the canonical `sportsmeta:` id space, sports resolution, the SQLite DB, the asset cache, public asset routes, member-token routes, and Stripe billing.
- PVTKRRX still consumes SportsMeta public asset routes upstream: `https://sportsmeta.pvtkrrx.cc/asset/{variant}/{sportsmeta:event:...}` for resolved public events and `https://sportsmeta.pvtkrrx.cc/asset/default/{variant}/{sport}?league=...` for unresolved fallbacks. The PVTKRRX addon surface no longer hands those raw upstream URLs to Stremio directly; it emits `/sports-artwork/id/...png` and `/sports-artwork/default/...png` URLs on the active addon origin, and those proxy routes fetch the selected public SportsMeta asset surface and normalize it to the declared PNG dimensions. Sports Posters member tokens and premium poster bytes stay on SportsMeta member routes, not inside PVTKRRX stream-addon routes. SportsMeta still attaches `X-SportsMeta-Asset-Class`, `X-SportsMeta-Entitlement`, `X-SportsMeta-Source`, and `X-SportsMeta-Gated` response headers on upstream asset routes.
- SportsMeta now exposes `/proof` and `/member/:token/proof` as the truthful artwork proof surfaces. Those pages prove the actual asset class, content type, entitlement state, and route visibility on the SportsMeta side. They do not change the PVTKRRX runtime contract.
- **Every PVTKRRX user — free, unconfigured, desktop, hosted, self-host — gets the same public SportsMeta artwork, now delivered as client-safe PNG proxy URLs on the PVTKRRX addon origin.** There is no user-entitlement branch inside PVTKRRX. `requireConfigSubscription` in `src/lib/shared.js` is a pass-through middleware, `package.json` has no billing dependency, and `src/utils/sportsArtwork.js` branches on whether a canonical id is known, not on who the user is.
- Real raster sports artwork is a separate SportsMeta member product. `Sports Posters` means poster, background, logo, landscape, and other Stremio-compatible sports image fields where SportsMeta can safely resolve them. The public PVTKRRX-facing entrypoint is now `https://www.pvtkrrx.cc/sports`, styled with the main PVTKRRX site and backed by a narrow `/sports/billing/checkout` proxy that creates SportsMeta `Sports Posters` Stripe Checkout sessions. The paid half of the stack is still owned by SportsMeta, not by PVTKRRX: member tokens, entitlement enforcement, premium artwork bytes, portal/webhook handling, and member routes remain on `https://sportsmeta.pvtkrrx.cc`. PVTKRRX does not gate stream routes by billing state and does not forward member tokens through its sports catalog/meta/artwork routes.
- So the product-level statement "SVG for everyone, real posters for paying customers" is a **stack-level truth that runs through two separate Stremio addons**, not a free/paid split inside PVTKRRX. Any doc, copy, or UI that implies PVTKRRX has an internal paid artwork tier is drift and should be read as historical intent.
- If SportsMeta billing state changes, PVTKRRX behavior does not change. PVTKRRX stream routes are free on every install surface tested here.

## SportsMeta Boundary

SportsMeta is now the separate metadata/artwork product boundary.

- live host: `https://sportsmeta.pvtkrrx.cc`
- live service: `sportsmeta.service`
- SportsMeta owns canonical `sportsmeta:` ids, metadata routes, artwork routes, member-token routes, and billing
- SportsMeta owns paid TheSportsDB usage plus the public upstream sport poster/background/logo routes that PVTKRRX rasterizes for client-safe delivery
- PVTKRRX stays the separate stream addon and only consumes canonical `sportsmeta:event:` ids on resolved sports rows
- the old integrated `/sportsmeta/*` draft inside this repo, the embedded `SportsDbClient`, the `sports-image-cache/` runtime directory, `sportsdb-poster-cache.json`, the `/thumb/sports/...` + `/image/sports/...` PVTKRRX-generated artwork routes, and the `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA` escape hatch were all removed on 2026-04-22; any remaining request to those paths returns `HTTP 410 Gone`
- for every sports availability group the catalog now resolves against SportsMeta and emits:
  - a canonical `sportsmeta:event:...` id when SportsMeta resolves the tracker item to one event, or
  - a `pvtkrrx:...` custom id when resolution fails, paired with a PVTKRRX `/sports-artwork/default/...png` proxy URL backed by SportsMeta's default upstream asset surface so the Stremio surface never shows a raw placeholder for a real fixture
- PVTKRRX meta (`handleMeta`) still loads canonical event detail from SportsMeta for `sportsmeta:event:` ids, and both canonical plus fallback branches now build the same PVTKRRX `/sports-artwork/...png` URLs from the encoded sport/league hints, so there is a single authoritative upstream source of sports artwork plus a client-safe addon-facing transport

Shared Contabo hosting still exists:

- same VPS
- same Caddy edge
- same-box internal network path from the Coolify `pvtkrrx` container to SportsMeta when `PVTKRRX_SPORTSMETA_INTERNAL_BASE_URL` is used

That is shared infrastructure, not shared product ownership.

Operational behavior:

- if SportsMeta is down, PVTKRRX can still parse `sportsmeta:event:` ids locally and attempt stream search, but it loses live SportsMeta event enrichment and SportsMeta-owned asset URLs
- if a SportsMeta membership is revoked, only SportsMeta member routes degrade/fail; PVTKRRX stream routes remain free

## Current UX Model

- The public website is now guide-only. It explains `PC Local`, `LAN Bridge`, and `Remote Seedbox`, but it is no longer the default place to paste private runtime details.
- Desktop-local `/configure` on the Windows EXE now exposes `PC Local` and `LAN Bridge`; `Remote Seedbox` belongs to the separate server/cloud runtime.
- The top of `/configure` now opens with a visual setup guide that separates the two real private setup surfaces: Windows host (`http://127.0.0.1:7000/configure`) and private server (`https://your-domain/configure`), while keeping the live install actions below as editable code-driven controls.
- The top of the page focuses on the next action for the selected route.
- Noisy fallback tools are hidden by default behind `Advanced Options And Manual Fallback`, which groups connection edits, manual URLs, and rescue tools under a secondary disclosure.
- When explicit self-host server mode is active, `/configure` is now a server-only app surface: it exposes `Remote Seedbox` only, defaults there immediately, and exposes a browser-stored self-host password field for remote seedbox administration.
- Self-host server copy now explains the real contract: private/localhost backend URLs are allowed once the server password is authenticated, while only the browser-facing install origin still needs public HTTPS for Stremio.
- `/app-config.json` now also tells the shared configure UI when the runtime is desktop-local-only, so the shared page can hide the seedbox route inside the EXE without forking the whole UI.
- The advanced Stremio account tools now also expose a `Server Link Session` flow:
  - create a one-time session from the target runtime
  - copy a browser link or addon URL
  - let any signed-in Stremio browser/device session complete the proof
  - poll status until the runtime reports `install-seen` or `linked`
- Pasting the generated addon URL into Stremio is only a bootstrap step. It marks that the session was seen by Stremio, but the real account link still completes through browser-side AuthKey proof.
- The desktop popup now exposes only `PC Local` and the hosted home-device route. User-facing website/configure copy now calls that route `LAN Bridge`, while the behavior still includes the same hosted-plus-home redirect model.
- The desktop popup also exposes:
  - current runtime status
  - qBittorrent save-path controls
  - qBittorrent packed-release extraction-hook controls
  - Windows startup auto-launch control
  - runtime log copy/open actions
  - explicit `Minimize`, `Send To Tray`, and `Exit App` actions
- The configure page now mirrors that local-runtime visibility with a live qBittorrent status panel that shows the effective save path, incomplete path, fallback storage roots, and whether PVTKRRX currently manages the qBit completion hook.
- Disk-backed Windows host configs now auto-upgrade older strict LAN-only local state to the current fallback-capable `LAN Bridge` profile (`routeProfile=hybrid`) on load/save, so stale desktop configs stop failing closed when the host app is offline and the user intended cloud fallback.
- Hybrid hosted tokens can now adopt an account-linked hosted cloud profile on fallback, so the home-device route stops reusing dead desktop-local `127.0.0.1` backend URLs once the LAN pair is stale or offline.
- The public homepage, sports page, Clockrr page, blog, FAQ, and runbooks now use the brand-led `PVTKRRX` guide surface, point users at docs instead of public `/configure`, and keep the locked route vocabulary (`PC Local`, `LAN Bridge`, `Remote Seedbox`).
- The public homepage now shows a live release-status card driven by `/version-status.json`, and the Windows desktop shell shows the same release check in the popup.
- Legacy `Hybrid Home` wording may still appear in older docs or internal notes. Treat that as terminology drift, not a different route model, unless a doc explicitly calls out the older naming history.

## Public Host Truth Table

Verified on 2026-04-08:

- `https://www.pvtkrrx.cc/` returns the landing page (`200`)
- `https://www.pvtkrrx.cc/configure` no longer serves the public setup UI; public requests redirect back to the guide-only site
- `https://www.pvtkrrx.cc/sports` returns the single public Sports Posters page (`200`) and links to SportsMeta checkout/proof while keeping PVTKRRX stream playback free
- `https://www.pvtkrrx.cc/clockrr` returns the public Clockrr family page (`200`) for the separate Stremio subtitle clock addon and shows aggregate telemetry-derived movie/TV top-ten ticker rows
- `https://www.pvtkrrx.cc/blog` returns the crawlable blog/status notes page (`200`)
- `https://www.pvtkrrx.cc/faq` returns the crawlable FAQ page (`200`)
- `https://www.pvtkrrx.cc/runbooks` returns the runbooks page (`200`)
- `https://www.pvtkrrx.cc/manifest.json` returns the bootstrap manifest (`200`)
- `https://www.pvtkrrx.cc/health` returns health JSON (`200`) or the health page when the client asks for HTML
- `https://www.pvtkrrx.cc/sitemap.xml` now includes `/sports`, `/clockrr`, `/blog`, and `/faq`
- Shared public footers link to `https://discord.gg/jPj8sV3nRs` for chat.
- `https://www.pvtkrrx.cc/local/install` returns `403` from the public internet because it is a same-host/local-network helper route
- `https://www.pvtkrrx.cc/sportsmeta/...` is not a supported public production surface; the integrated draft is disabled by default in this repo
- 2026-04-06 homepage verification on the canonical host confirmed the refactored landing page markers are live: `truth-band` and `Where does playback happen` are present, while legacy `meta-grid` and `hero-chip` markers are absent

Contabo runtime note:

- `www.pvtkrrx.cc` currently reaches the Coolify-hosted `pvtkrrx` app container through Caddy for normal public website and hosted relay paths.
- `www.pvtkrrx.cc/selfhost/*` and `pvtkrrx.cc/selfhost/*` deliberately route through Caddy to the host-level `pvtkrrx.service` runtime at `/opt/pvtkrrx` on port `7000`, so the stable self-host manifest works with and without `www`.
- `pvtkrrx.cc` still redirects to `https://www.pvtkrrx.cc` for non-selfhost public paths.
- Treat the Coolify runtime and the host-level systemd runtime as separate runtimes unless the reverse proxy target is deliberately changed again.
- Verified on 2026-04-08: the live Coolify app now bind-mounts the whole hosted runtime root from `/opt/pvtkrrx/runtime` into `/root/.local/share/PVTKRRX/runtime`, so hosted runtime JSON/config state survives container replacement instead of living only in the container layer.
- Legacy hosted `sports-image-cache/` persistence notes are historical only; the live sports metadata/artwork path now depends on SportsMeta rather than a PVTKRRX-owned image cache.

## Route Model

| Route | User | Install path | Playback path | Main rule |
|---|---|---|---|---|
| `PC Local` | Same Windows machine running PVTKRRX | `http://127.0.0.1:7000/local/manifest.json?mode=local` | Local `/file` (completed) and `/playback` (queue+buffer) routes | Same-PC only |
| `LAN Bridge` | Other devices on the same Stremio account, including Apple TV | Hosted token manifest generated by configure | Hosted relay 307-redirects to the host's local runtime when the pair is online and the request still matches the home network; otherwise it falls through to hosted/public behavior and can adopt the account-linked cloud profile for the same Stremio account | Host desktop must stay running and heartbeating only for the home-network path |
| `Remote Seedbox` | Away-from-home or public playback | Hosted token manifest on the public relay, or disk-backed `/selfhost/manifest.json?mode=hosted` on a self-hosted server | Public hosted relay uses external `fileServerUrl` or public qBit URLs for completed files only; self-hosted server mode can use built-in playback and private localhost service URLs once authenticated as the server admin, and can split control/install origin from built-in playback origin with `PVTKRRX_PLAYBACK_BASE_URL` | Ready-file-first on the public hosted relay; playback-capable when self-hosted on a suitable runtime |

All three routes expose the same catalog family: sports discovery catalogs first, then movies, TV, and library.
See `docs/ROUTE_FRAMEWORK.md` for the full per-route capability matrix including packed RAR releases and auth-protected file servers.

Internal state still uses `lanPair*` field names, and older hosted tokens can still resolve against the same LAN-pair machinery. `LAN Bridge` is now the intended user-facing route label for that synced home-device path.

## Host Vs Home-Device Rule

- The Windows host desktop itself must use `PC Local` for browsing and playback.
- `LAN Bridge` is the main same-account addon for the user's other devices.
- If the host desktop browses the hosted `LAN Bridge` addon and sees `Failed to fetch`, that is a route-choice problem, not proof that the addon server is down.

## Content Model

- Top-level addon types are `movie`, `series`, and `sports`.
- Sports now uses its own top-level `sports` surface instead of being hidden under `movie`.
- Sports discovery is no longer one generic catalog plus broad sport-type genre filters. The sports surface now leads with an `All Sports` catalog followed by sport-family catalogs such as `Football`, `Motorsport`, `MMA`, `American Football`, and others, so sport selection happens in Stremio's type picker and catalog column first.
- Sport-family catalogs keep the third-column `genre` dropdown for narrower league/team-style filters such as `Premier League`, `Arsenal`, `Formula 1`, `UFC`, or `NBA`.
- Sports artwork can now carry four distinct assets from TheSportsDB:
  - `poster`
  - `landscapeImage`
  - `backgroundImage`
  - `logo`
- Sports catalog artwork now follows a SportsMeta-owned event contract instead of PVTKRRX-generated league cards:
  - sports catalog browse tiles use portrait/square `/sports-artwork/.../poster/...png` URLs as the Stremio `poster` value with `posterShape: poster`, so Discover rows keep Stremio's poster contract instead of stretching wallpaper art into poster tiles
  - sports detail metadata keeps portrait `/sports-artwork/.../poster/...png` for the event poster and uses landscape artwork for the Stremio background
  - resolved sports rows use PVTKRRX `/sports-artwork/id/{variant}/{sportsmeta:event:...}.png` URLs backed by SportsMeta public/root asset routes only; Sports Posters member artwork is served by SportsMeta member routes, not by PVTKRRX
  - unresolved sports rows use PVTKRRX `/sports-artwork/default/{variant}/{sport}.png?league=...` URLs backed by the public SportsMeta default asset route
- `backgroundImage` and `logo` stay separate from the portrait poster contract, but SportsMeta now owns those decisions too.
- When Prowlarr has no indexers or cannot be reached, empty movie, TV, and sports catalogs now return a setup-needed placeholder card instead of a blank grid, so the user gets a useful recovery cue in Stremio.
- PVTKRRX no longer maintains a local TheSportsDB cache or sports poster package path. It does not own the sports image catalogue, and its `/sports-artwork` proxy is only a client-safe transport for SportsMeta public/root artwork.
- Licensed real imagery remains SportsMeta-owned on its own paid/member routes instead of being surfaced directly from the free PVTKRRX catalog/meta path.
- `npm run server:setup` and `npm run server:install-service` now treat SportsMeta as the sports metadata/artwork dependency; they do not prompt for a TheSportsDB key or local sports poster package path anymore.
- Legacy `/image/sports/...` request handling and the old 15-minute sports-cache autofill job were removed from the live runtime; clients should consume the current PVTKRRX `/sports-artwork/...png` proxy URLs, which in turn consume SportsMeta upstream.
- The old `sports-image-cache/` runtime store is historical, not part of the live SportsMeta-owned sports path.
- Sports catalog inclusion is availability-driven:
  - Prowlarr decides whether a row exists at all from the user's configured tracker indexers.
  - SportsMeta only resolves identity and enrichment for rows that already have tracker availability.
  - SportsMeta must not inject upcoming fixtures, scheduled events, teams, leagues, or synthetic rows without Prowlarr tracker availability.
- Sports catalog resolution now follows an explicit availability -> identity -> enrichment boundary:
  - fetch Prowlarr sports availability rows
  - parse tracker titles into structured hints
  - attempt SportsMeta resolution conservatively
  - attach canonical ids and artwork only when the match verifies safely
  - keep the available tracker row visible when SportsMeta is ambiguous, weak, or missing
- Sports identity outcomes are explicit:
  - `resolved`
  - `ambiguous`
  - `not_found`
  - `weak_match`
  - `fallback_only`
- Resolved sports rows now emit the raw canonical SportsMeta id on the addon-facing catalog/meta/stream path while retaining an internal availability anchor back to the original Prowlarr tracker item so stream playback stays tied to the real torrent source.
- Prowlarr/Torznab-compatible indexers drive sports catalog rows when a returned result passes the sports title/detail filters. SportsCult is one supported Prowlarr source/profile, not a requirement. Category-limited `5060` searches remain the first pass; when category hints are missing or broad, PVTKRRX falls back to conservative title parsing instead of requiring a SportsCult anchor.
- Sports detail meta now exposes Stremio `genres` tags from the resolved sport classification when available.
- Sports title parsing now handles both team-vs-team formats (`EPL.2026.03.15.Arsenal.vs.Chelsea`) and non-vs event formats (`Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying`, `UFC.Fight.Night.270.Main.Card`).
- Motorsport coverage now includes F1, MotoGP, NASCAR, IndyCar, WRC, Supercars/V8, WSBK, WEC, and Formula E.
- Darts and golf are now recognized as distinct sport categories.
- Sports catalog grouping uses structured event keys for both vs and non-vs titles, so different quality variants of the same event collapse into one tile.
- Sports detail pages now carry richer metadata: league, date, event name, sport type label, and multi-line descriptions instead of flat stat lines.
- Sports catalog identity resolution stays bounded by a fast first-screen budget. Rows that cannot be safely resolved inside that budget remain visible as `pvtkrrx:` fallback rows, then enter an in-process background identity backfill queue. If SportsMeta later resolves that same availability row, PVTKRRX caches the canonical result and the next catalog refresh can emit the `sportsmeta:` id plus public canonical artwork without making the original Stremio response wait.
- On the self-host server, sports catalogs are prewarmed at boot/config save when Prowlarr is configured. The prewarm starts after a short boot delay, runs priority sports browse/search jobs with low concurrency, waits for identity backfill to go idle, and leaves the in-process identity cache ready for the next tablet/Stremio catalog request without front-loading a broad Prowlarr crawl during startup.
- Sports catalog pages rank resolved `sportsmeta:` rows ahead of unresolved fallback rows inside the emitted page, so poster-backed rows appear first when safe pairings exist. This does not synthesize SportsMeta-only fixtures; every row still requires Prowlarr availability.
- Sports stream lookup for canonical rows now tries a bounded set of cleaned league aliases, matchup variants, season-year variants, and day/month variants so tracker wording like `La Liga 2026 Levante Sevilla 23 04` can attach to a canonical `Spanish La Liga` event. The query set is capped to protect seedbox latency and Prowlarr capacity.
- Library items and unresolved sports rows use internal `pvtkrrx:` custom ids inside Stremio responses.
- Resolved sports rows use canonical `sportsmeta:` ids directly inside Stremio responses.
- canonical SportsMeta event ids use `sportsmeta:` and are resolved through the separate SportsMeta service boundary
- Installed route manifests keep the plain addon name `PVTKRRX`; route identity now lives in the manifest `id` and description so Stremio source grouping stays consistent.
- There is no standalone `.pvtk` file format in this repository.

## Playback Model

- Hosted relay routes do not proxy video bytes.
- Legacy sports cache files may still exist on disk from older deployments, but no live PVTKRRX route reads them anymore. `/thumb/sports/...` and `/image/sports/...` are removed from the product path and now return `HTTP 410 Gone`.
- Hosted `/file` and `/playback` return 403 on the public hosted relay for non-local requests.
- `LAN Bridge` requests 307-redirect to the host's local runtime before hitting `/file` or `/playback` when the home route is online, so after redirect all local playback capabilities apply.
- Self-host server mode now supports separate control/install and byte-serving origins: `PVTKRRX_PUBLIC_BASE_URL` drives manifest/configure/install links, while optional `PVTKRRX_PLAYBACK_BASE_URL` can point built-in `/file` and `/playback` to a different public HTTPS origin. If the playback base is unset, built-in self-host playback falls back to the public base.
- Hosted `Remote Seedbox` must use publicly reachable backend URLs. Loopback/private backend URLs are only valid on a same-box self-host server config after server-admin authentication; the hosted relay token path rejects those private targets for explicit `Remote Seedbox` installs.
- Local `/file` serves bytes with HTTP Range support when the file is locally accessible on disk.
- Local progressive playback now defaults to strict head-first sequential download. qBittorrent first+last piece priority is off by default for every route because it can pull the tail before the playable start; set `STREAM_PRIORITIZE_LAST_PIECES=true` only as an explicit diagnostic/experimental opt-in. New qBittorrent adds explicitly serialize `sequentialDownload=true` and `firstLastPiecePrio=false` instead of relying on omitted Web API defaults.
- Local `/file` now also waits on the specific requested qBittorrent piece window for seek-like range probes, so footer/skip requests can return `206` as soon as that piece window is locally readable instead of timing out after the initial head buffer succeeds.
- Local `/file` can continue serving a known absolute local file path even after qBittorrent no longer reports the torrent row, as long as the file still exists on disk.
- Local `/playback` is the queued-download path for tracker content that is not yet ready. It fetches the `.torrent` payload, adds it to qBittorrent, and as soon as qBittorrent exposes the target file on a built-in playback-capable runtime it 302-redirects into `/file`, letting the shared file route hold the HTTP connection open while bytes arrive. Already-matched in-progress streams on playback-capable runtimes now also stay on `/playback` first, carrying the chosen file path in the opaque token so Stremio does not hit `/file` prematurely and trip a player-side `liberror` while the partial file is still forming. When built-in buffering is not possible, `/playback` still waits for ready-file thresholds before redirecting.
- Playback priming now explicitly resumes the selected incomplete torrent, moves it to the top of qBittorrent's queue when queueing is enabled, keeps sequential download enabled, disables first+last piece priority unless explicitly opted in, and promotes only the chosen playable video/archive files to high file priority while demoting unrelated files.
- Completed-file playback correctly checks torrent completion state before redirecting into `/file`.
- Sports stream playback now prefers the original Prowlarr availability anchor carried in either the unresolved custom id or the canonical-id anchor cache, so canonical SportsMeta grouping does not break the link back to the real tracker torrent.
- Non-matchup sports supplemental searches, including MotoGP/F1-style events, validate event/session/location tokens before attaching extra tracker results. A high-seeder result from a different race, practice, sprint, or weekend should not attach to the selected sports tile merely because the broad title is similar.
- Matching sports streams can come from any configured Prowlarr indexer. Packed archives and unverified tracker links are still suppressed or surfaced as notice rows instead of being advertised as playable.
- TV episode title fallback retries broad Prowlarr search when categorized TV search is rejected, and exact `SxxEyy` matches can pass with partial title-token overlap so localized titles such as `Oak Island E Il Tesoro Maledetto S12E17` still surface PVTKRRX streams for the correct episode.
- If Prowlarr is empty or slow but qBittorrent already has a strict title/episode match, Movie/TV routes can emit that local torrent as a PVTKRRX stream instead of hiding the source list.
- Movie/TV stream search budgets are intentionally long enough for slower Prowlarr all-indexer title searches on the Contabo self-host stack: 10s for the initial upstream pass and 12s for title fallback.
- Stream rows now expose emoji state badges (`⬇️` download-and-play, `⏳` buffering, `✅` downloaded, `📦` extracted), a visible origin badge (`[PC]` for host-PC playback or `[SERVER]` for remote/server playback), and a film-icon container badge (`🎬MKV`, `🎬MP4`, etc.) in the addon `name`. The description switches from `Download and play` to `Downloaded — ready to play` once the file is ready and also states whether the host PC or remote server is serving it.
- Packed RAR releases (`.rar/.r00/.r01/...`):
  - Official Stremio archive-source support is real: `rarUrls` is part of the addon/core contract and is routed through the client's local streaming server.
  - Completed archive sets now trigger background extraction on the host when the archive volumes are locally reachable.
  - If extraction has already finished, PVTKRRX prefers the extracted direct video file for playback.
  - When the local runtime enables the qBittorrent completion hook, qBit only calls back into PVTKRRX after completion; PVTKRRX remains the single extraction owner.
  - If extraction is still running or unavailable, the packed source stays hidden by default instead of being advertised as normal playback.
  - Native `rarUrls` emission is now an explicit manual-testing override (`PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true`), not part of the supported default playback contract.
  - Emitting `rarUrls` still means the addon is using the official archive payload shape; it does not count as end-to-end real-client sign-off for PVTKRRX archive playback.
  - Incomplete archive sets are suppressed — no stream is offered until every volume is 100% ready.
  - Packed-only tracker sources are suppressed at stream emission time before `/playback` is ever reached.
  - `/playback` fails fast with a truthful packed-archive message if a packed torrent is already in qBit but not yet complete.
  - The addon still sets `behaviorHints.sourceContainer = 'rar'` as a repo-local hint, but that field is not part of the official Stremio archive contract and should not be used as proof that clients honor the stream.
- External `fileServerUrl` is optional. It is required for `Remote Seedbox` completed-file playback on the public hosted relay but not needed for `PC Local`, `LAN Bridge`, or self-hosted server runtimes that can read files directly and serve `/file` / `/playback`.
- When `fileServerAuth` is configured, `proxyHeaders` with Basic Auth are added to seedbox and buffering stream URLs. Tracker `/playback` is suppressed on non-local routes because Stremio cannot forward auth headers through a redirect chain.
- Remote buffering URLs are emitted only when the current file path is provable from live torrent state.
- See `docs/ROUTE_FRAMEWORK.md` for the full per-route capability matrix.

## Desktop Startup Model

- On every cold boot, the splash window opens before the main desktop shell.
- The splash is pinned `alwaysOnTop`, brought to the front, and kept visible for a minimum startup window before the main shell replaces it.
- The desktop shell starts hidden and only appears after the local runtime is reachable.
- Closing the main desktop shell now hides it to the Windows system tray unless the user explicitly exits.
- The tray exposes restore/open/exit behavior so the local runtime can keep serving while the window is hidden intentionally.
- The desktop shell can also toggle Windows sign-in startup on/off without leaving the app.
- The Windows startup toggle writes a quoted `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` command and repairs the legacy malformed unquoted entry on the next desktop launch.
- When Windows launches PVTKRRX from sign-in startup, the runtime now stays hidden in the system tray instead of opening the main window immediately.
- The desktop wrapper now starts a Windows power blocker by default (`prevent-app-suspension`) so the host can stay alive through lock-screen and display-off states while serving local/LAN traffic.
- Startup still runs:
  - local server boot
  - provider warm-up
  - automatic host-side Stremio session scan and account-link reuse when a signed-in desktop session is present
  - firewall/Bonjour checks
  - LAN pair heartbeat startup pulse
  - Stremio launch watch
- The desktop wrapper also logs `lock-screen`, `unlock-screen`, `suspend`, and `resume`, and sends a fresh LAN heartbeat on unlock/resume.

## Heartbeat Model

- The home-route heartbeat is not a rapid fixed loop anymore.
- The current behavior is:
  - send a startup pulse
  - send a pulse when Stremio launches on the host
  - send a periodic background heartbeat on the long interval configured by `PVTKRRX_LAN_PAIR_HEARTBEAT_MS` (default 12 minutes)
- The relay keeps LAN pair records around longer than one heartbeat for repair/debug flows, but redirect decisions now stop treating a host as live once the last heartbeat is stale relative to that cadence (about 15 minutes by default, unless `PVTKRRX_LAN_PAIR_FRESHNESS_MS` overrides it).

## Build Model

- `npm run dist:win` now builds Windows packages in the system temp directory first.
- After a successful build, artifacts are copied back into `dist/` and archived into `dist/releases/<version>/`.
- This avoids the `rcedit` metadata-write failure that can happen when building directly inside the OneDrive-backed repo output folder.

## Release Numbering Model

- Current release numbering is app-aligned across surfaces:
  - desktop/latest release tag: `vX.Y.Z`
  - self-host/seedbox release tag: `vX.Y.Z-selfhost`
- For app version `1.1.57`, the current tags are `v1.1.57` and `v1.1.57-selfhost`.
- Legacy `v1.12.x-selfhost` tags were an old self-host-only counter. They remain published only so older pinned installer commands keep working. Do not create new `v1.12.x-selfhost` tags, and do not use them as the preferred install/update target.
- A self-host tag and its paired desktop tag must resolve to the same Git revision before the release is described as synchronized.

## Security Rules

- Local admin routes are local-network or loopback only.
- Hosted sensitive routes use the browser-origin allowlist.
- Hosted `/test-connection` is rate limited and only allows public HTTP/HTTPS targets.
- `/pair/status` returns chosen endpoint metadata only to callers that present both `pairId` and `pairKey`.
- Stremio link sessions are short-lived, random server-issued tokens; Stremio install hits can mark them as `install-seen`, but account linking still requires a verified AuthKey proof before PVTKRRX stores linked identity.

## Design Rules

1. Raw `http://192.168.x.x:7000/...` addon installs are not a supported primary Stremio install path.
2. `PC Local` is the only supported same-PC install route.
3. `LAN Bridge` is the supported home-device route and depends on the host desktop app remaining online for the home-network path.
4. Hosted LAN-pair installs must be refreshable because stale installed tokens can point at old pair state or old route behavior.
5. Root `/manifest.json` must remain a bootstrap manifest, not a real catalog-bearing route manifest.
6. Internal notes may still use older wording, but `LAN Bridge` is the intended user-facing name for the synced home-device route.
7. The repo contains historical planning docs from February 2026; they are useful for project history, not as the live architecture.
8. Use `https://www.pvtkrrx.cc` as the canonical hosted base.
9. If the goal is to keep PVTKRRX out of the request path after setup, use explicit self-hosted server mode and a user-owned HTTPS origin.
10. The public website is docs-first and guide-only; private configuration belongs on the Windows host runtime or the user's own self-host server.

## Manifest Update Model

- App/server code and saved disk-backed config are deliberately more changeable than the Stremio manifest. Handler fixes, stream behavior, catalog contents, SportsMeta resolution, and self-host config edits apply on the next addon request when the installed route is stable.
- The explicit self-host route is the most retroactive path: an installed `https://your-domain/selfhost/manifest.json?mode=hosted` addon keeps using the current `local-config.json` on the server. Its manifest id is `com.kepners.pvtkrrx.selfhost`, separate from hosted Remote Seedbox token installs (`com.kepners.pvtkrrx.online`), so Stremio can store both identities without confusing a self-host refresh for an older hosted token. Saving backend URL or secret changes does not require a reinstall unless the manifest contract itself changes.
- A manifest refresh is still required when the addon contract changes: addon id, top-level `types`, declared `resources`, catalog ids, catalog extras, or route identity. Stremio clients can cache that contract.
- Hosted token installs are less retroactive than self-host disk config because the encrypted URL token carries a snapshot of config. Server-side handler fixes apply immediately, but config changes need a refreshed token unless the route uses account-linked hosted takeover state.

## Documentation Canon

Use these as the live set:

- `README.md` for user-facing setup
- `ARCHITECTURE.md` for runtime/component structure
- `docs/CURRENT_DESIGN.md` for canonical current behavior
- `docs/ROUTE_FRAMEWORK.md` for install-route rules
- `docs/STREMIO_INSTALL_TRACKER.md` for verified Stremio client behavior
- `docs/LAN_BRIDGE_PROCESS.md` for the underlying LAN-pair lifecycle, heartbeat, and legacy/manual troubleshooting
- `docs/PROJECT_STATUS.md` for current verification and release state
- `docs/WEBSITE_STATUS.md` for current public route checks and homepage/content backlog

The following files are planning/history records and should be read as archival context unless a section explicitly says otherwise:

- `docs/CLIENT_DRIVERS.md`
- `docs/COMMERCIAL_SPEC.md`
- `docs/PRESTART_OUTCOME.md`
- `docs/PRODUCTION_SPEC.md`
- `docs/PROGRAMME.md`
- `docs/SCOPE_OF_WORKS.md`
- `docs/TECHNICAL_SPEC.md`
