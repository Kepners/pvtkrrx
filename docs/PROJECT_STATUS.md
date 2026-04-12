# PVTKRRX Project Status

Updated: 2026-04-12

## Current Stage

PVTKRRX is in a working `1.1.33` state on the main Windows/local route set.
The current packaged Windows app is now verified as the real host runtime, and a live Apple TV synced home-route pass has been captured against it.

The practical reading of the project today is:

- `PC Local` is the real host-desktop route and is working
- `Hybrid Home` is now the main same-account synced route for the user's other devices; the host desktop should not use it for local browsing
- stale/offline `Hybrid Home` requests can now switch into the account-linked cloud profile instead of clinging to the dead desktop-local backend
- the packaged Windows EXE now centers on `PC Local` plus the `Hybrid Home` route model, although some live desktop/runbook/help strings still say `LAN Bridge`
- explicit self-host server mode now exists for VPS/seedbox installs, with disk-backed `/selfhost` manifests, browser-admin auth for private service URLs, and optional `systemd` boot automation
- the self-host bootstrap now auto-selects a free qBittorrent WebUI port when 8080 is occupied, wires Prowlarr to the live qBittorrent download client during bootstrap, and disables any leftover `pvtkrrx-tunnel.service` once a FreeDNS/domain front door is configured
- completed-file playback on the local runtime is working again after the `/playback` and `/file` path fixes
- official Stremio archive-source support for `rarUrls` is real and was re-verified against upstream SDK/core sources on 2026-03-30
- PVTKRRX now treats extracted direct video as the only supported packed-RAR playback path by default, and keeps native `rarUrls` behind an explicit experimental override
- the PVTKRRX live sports surface now stays on generated SVG poster/background cards with sport-specific theming instead of surfacing real image proxies from the free addon path
- loose motorsport event titles such as `Formula 1 2026 Race 02 Chinese Grand Prix` now survive the hosted sports filter and can reuse cached Formula 1 league poster fallback when exact event art is missing
- licensed real imagery remains a SportsMeta-owned paid/member concern, and the integrated SportsMeta draft inside this repo now only unlocks paid artwork when an actual entitlement exists
- the old implicit local free-key SportsDB path has been removed: PVTKRRX no longer defaults to `123`, and local cache warm/autofill work now skips unless an explicit SportsDB key is configured
- `npm run server:setup` now also pre-seeds that same `sports-image-cache/` store with upcoming event art, top team badges, and mapped league artwork, `npm run cache:sports` can refresh it later without deleting warm entries, and long-running Linux/cloud runtimes now keep topping the cache up automatically every 15 minutes in rotating sport batches
- the current desktop/cloud release line is now `1.1.33`, with matching self-host prerelease `v1.12.18-selfhost`, carrying the SVG-only sports surface plus the tightened SportsMeta entitlement gate
- the current desktop/cloud line carries forward the mapped sports poster package support and permanent hosted image catalogue while adding the hybrid linked-cloud takeover fix for stale/offline home-route fallback
- the Windows desktop runtime still defaults to `%APPDATA%\PVTKRRX\runtime`, outside the EXE install directory, so local Prowlarr/qBittorrent config, poster-package mapping, and sports cache state survive normal app updates and reinstall-over-the-top installs unless that runtime folder is explicitly deleted
- the sports identity path is now materially wider: multi-token leagues (`Premier League`, `La Liga`), `DD.MM.YYYY` dates, year-only titles that can borrow the Prowlarr publish date, and event-prefix noise such as `Super Bowl LX` now normalize into the same shared structured matchup shape
- structured TheSportsDB event lookup now expands league-aware team nicknames such as `Lakers`, `Yankees`, and `Maple Leafs` to the official SportsDB team names before searching, then falls back to date+sport matching when literal event queries still miss
- non-vs event lookup now also tries stripped event-name queries (`Japanese Grand Prix`, `Fight Night 270`, etc.) so `Race`, `Qualifying`, `Practice`, `Sprint`, and `Main Card` suffixes stop blocking artwork recovery
- empty movie, TV, and sports catalogs now return a setup-needed placeholder when Prowlarr has no indexers or cannot be reached, instead of showing blank `EmptyContent`
- the Windows installer/build flow is reproducible again
- `https://www.pvtkrrx.cc` is the live public relay; `https://pvtkrrx.vercel.app` is currently a dead preview hostname returning Vercel `DEPLOYMENT_NOT_FOUND`
- the homepage refactor is now live on the canonical host, including the `truth-band` layout and the `Where does playback happen` section
- the current public route still serves through Contabo Caddy into the Coolify alias `pvtkrrx:3000`; do not treat `/opt/stack/sites/pvtkrrx` or `/opt/pvtkrrx` as the live public path without checking the reverse proxy target first
- legacy strict `LAN Bridge` tokens remain supported for manual troubleshooting and backwards compatibility, but they are no longer the default synced install path
- the remaining work is real-device coverage, remote/auth playback sign-off, and performance tuning, not a reset/rebuild

## Work Carried Out On 2026-04-12

- locked the free PVTKRRX sports catalog/meta path to generated SVG poster/background assets with sport-specific theming, instead of falling through to live image proxy URLs
- tightened the integrated SportsMeta draft so paid imagery only unlocks when a real stored entitlement exists; unlicensed tokens now stay on SVG artwork
- removed the implicit local TheSportsDB free key (`123`) from runtime defaults, installer/config flows, and cache warm/autofill tooling; those flows now skip cleanly unless an explicit key is configured
- `npm run smoke:sports`, `npm run experimental:smoke:sportsmeta`, `npm run smoke:sports-cache`, `npm run smoke:sports-cache-auto`, `npm run smoke:config`, `npm run smoke:selfhost`, `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh`, and `npm run dist:win` all passed on 2026-04-12 for the `1.1.33` release cut

## Code Review 2026-04-06

- Re-ran `npm run smoke:config`, `npm run smoke:playback`, and `npm run smoke:desktop`; all passed in the current workspace during this review.
- Main review finding: route terminology is still mixed in live code. `public/configure.html` and the hosted profile logic treat the home-device route as `Hybrid Home`, but several other shipped surfaces still present the older `LAN Bridge` name.
- Confirmed legacy `LAN Bridge` wording still exists in the current desktop popup, bootstrap-manifest descriptions for desktop installs, runbooks/provider guidance, and stream info helpers. This is terminology drift, not evidence of a second active home-device route.
- Updated the technical docs in this pass to stop overstating the rename as fully complete. No public-site or in-app copy was changed.

## Work Carried Out On 2026-04-04

- Added the new `Hybrid Home` hosted profile with a dedicated manifest id (`com.kepners.pvtkrrx.hybrid`) and route-aware configure/install copy across the shared UI.
- Hosted `Hybrid Home` now prefers LAN redirect at home and falls back to hosted/cloud behavior away from home instead of failing closed like the legacy strict LAN profile.
- `/local/lan-token` can now mint hybrid hosted tokens explicitly, while the Windows/local config path keeps its own host-side pairing defaults intact.
- Legacy hosted LAN tokens without explicit pair booleans still resolve as `LAN Bridge`, so older installs do not get silently reinterpreted as `Remote Seedbox`.
- Sports grouping now keeps one stable team order for deduped matchup posters instead of inheriting the last tracker title ordering, and the sports thumb helper is back in-tree so the richer poster generation path is not orphaned.
- Added a reusable sports cache pre-seed step plus `npm run cache:sports`, and wired both self-host setup flows to warm `sports-image-cache/` with upcoming event, team, and mapped-league artwork using the existing disk cache writer.
- Added a recurring sports-cache autofill worker for long-running Linux/cloud runtimes. It persists a rotation cursor in the runtime directory, processes one sport group every 15 minutes by default, and keeps using the same disk cache writer so repeat passes skip already-warm images.
- Self-host cloud/server playback now defaults to strict head-first sequential download again. qBit first+last-piece priority stays default-on for desktop/local routes, but cloud self-host runtimes now require an explicit `STREAM_PRIORITIZE_LAST_PIECES=true` opt-in if we want tail-piece probing help more than startup speed.
- Self-host cloud/server playback can now split origins correctly: `PVTKRRX_PUBLIC_BASE_URL` stays the install/control origin, while optional `PVTKRRX_PLAYBACK_BASE_URL` overrides built-in `/file` and `/playback` URLs so buffering and byte-serving can move onto a dedicated HTTPS origin.
- The self-host installer now sets that up properly instead of treating `PVTKRRX_PLAYBACK_BASE_URL` as a manual afterthought: FreeDNS and domain installs default it to the same public HTTPS origin and still allow an explicit optional direct-playback URL during bootstrap.
- Cut a fresh `1.1.24` Windows desktop build so the local EXE line now includes the sports cache pre-seed work instead of reusing the older `1.1.23` release label.
- Re-verified the split install model: Windows desktop still owns `PC Local` plus `Hybrid Home`, while the cloud/self-host installer continues to own the server-side `Remote Seedbox` route.
- Regression coverage now includes:
  - hybrid hosted token minting and manifest resolution
  - hybrid cloud fallback headers when the home route is offline
  - legacy LAN token compatibility without explicit booleans
  - sports structured matchup/F1 poster token coverage
  - sports cache pre-seed rerun/cache-hit coverage

## Work Carried Out On 2026-04-06

- Fixed the self-host/server `liberror` regression on incomplete matched torrents by keeping playback-capable buffering streams on `/playback` first instead of handing Stremio straight into `/file` too early.
- Opaque playback tokens now carry the chosen file path so multi-file torrents still resolve the correct episode/file when `/playback` later hands off into `/file`.
- Added smoke coverage for the new buffering handoff contract plus target-file playback-token round trips.
- Fixed the sports artwork mapped-league path so both the cache seeder and `sportsdb.js` can resolve known TheSportsDB league ids directly instead of depending on the truncated free-key `search_all_leagues.php?s=...` listing.
- Sports cache autofill no longer reports `0 mapped leagues` for known targets just because the sport-wide league list omitted EPL/UFC/NBA-style entries, and league-art poster fallback can now recover those same mapped leagues during normal meta/catalog requests.
- Cut the public desktop release as `1.1.25` and the matching Windows installer assets.
- Published the next self-host prerelease tag as `v1.12.11-selfhost` so the cloud/server installer line has a current pinned release for this fix set.
- Cut the follow-up public desktop release as `1.1.26` so the Windows installer line now carries the mapped-league artwork fix as well.
- Published the next self-host prerelease tag as `v1.12.12-selfhost` so the pinned cloud/self-host installer line carries the same mapped-league artwork fix.
- Restored a live homepage release-status chip in the hero so the public DOM/source still exposes the current release state after the homepage refactor.
- Updated the repo release rules so `issue a new revision` now explicitly means synchronized desktop EXE plus cloud/self-host release parity.
- Cut the aligned public desktop release as `1.1.27` so the published EXE line matches the current `main` revision again.
- Published the next self-host prerelease tag as `v1.12.13-selfhost` so the cloud/server installer line points at that same aligned revision.

## Work Carried Out On 2026-04-07

- Broadened `parseSportsTitle` so sports grouping, custom ids, stream fallback, and SportsDB artwork lookup all share the same richer parser instead of diverging on multi-token leagues and alternate date layouts.
- Team-vs parsing now accepts `Premier.League` / `La.Liga`, `DD.MM.YYYY`, year-only titles that can reuse the publish date, and event-prefix noise like `Super.Bowl.LX` before the teams.
- Structured SportsDB matching now resolves official league team names before `searchevents` calls and falls back to `eventsday` / `eventstv` when exact query strings still miss.
- Non-vs event searches now try stripped event-name variants first, so Formula 1 / UFC titles do not fail just because SportsDB stores the weekend/event without `Race`, `Qualifying`, `Practice`, `Sprint`, or `Main Card`.
- Regression coverage now includes:
  - multi-token league parsing
  - `DD.MM.YYYY` parsing
  - year-only title parsing with publish-date fallback
  - league-aware nickname expansion for structured lookups
  - structured date+sport fallback after literal title-search misses
  - stripped non-vs event queries for Formula 1 session titles
- `npm run smoke:sports`, `npm run smoke:sportsdb-league`, and `npm run smoke:pipeline` all passed on 2026-04-07 for this change set.

## Work Carried Out On 2026-04-08

- Fixed the cache-only sports artwork cold-start regression: the background seeder now persists seeded event + league artwork metadata only for image URLs that actually made it into the disk cache, and `getEventArtwork()` can reuse that seeded metadata after a cold restart instead of collapsing straight to SVG placeholders.
- Added smoke coverage for that release path: the seed smoke now proves `sportsdb-poster-cache.json` is written, reloads a fresh `SportsDbClient`, and verifies both seeded event artwork and seeded league fallback artwork still resolve from cache after restart.
- Release-prep moved the package version to `1.1.30`, refreshed the desktop update feed, and rebuilt the Windows artifacts for the sports cache metadata fix release.
- `npm run smoke:config`, `npm run smoke:guards`, `npm run smoke:selfhost`, `npm run smoke:desktop`, `npm run smoke:playback`, `npm run smoke:parity`, `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed on 2026-04-08 for the `1.1.30` release cut.
- `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-08 for the `1.1.30` release cut.
- `npm run dist:win` passed on 2026-04-08 for the `1.1.30` desktop release build and refreshed `dist/latest.yml` plus `dist/releases/index.json`.
- Verified `main` and `origin/main` are both at commit `e568ece` (`feat: add mapped sports poster packages`), so the `1.1.29` sports-package release is in GitHub rather than sitting as an unpushed local patch.
- Verified the live public Contabo route is now running that same release build: the current Coolify container is `w14jewmw5ubscrxh8zzfhq7d-093443455325` on image `w14jewmw5ubscrxh8zzfhq7d:e568ece2a012653caea16fdfe9fefa713dc5626b`.
- Verified `https://www.pvtkrrx.cc/version-status.json` now reports `currentVersion = 1.1.29`, `latestVersion = 1.1.29`, and `updateAvailable = false` after the manual Coolify API redeploy for deployment `cphgnqptcvtvif60g0u57n7g`.
- The live `1.1.29` commit carries forward the earlier-verified permanent-catalogue cache behavior: `sportsdb.js` still uses `PERSIST_MAX_ENTRIES = 50000` plus one-year artwork-hit / structured-event / league-asset TTLs, and `sportsImageCache.js` still carries the no-prune / no-expiry contract.
- Verified the hosted runtime root is now externalized directly on Contabo: Coolify bind-mounts `/opt/pvtkrrx/runtime` into `/root/.local/share/PVTKRRX/runtime`, so `sportsdb-poster-cache.json`, `accounts-store.json`, `lan-pair-store.json`, `stremio-link-store.json`, `local-config.json`, `server-admin-token`, `sports-cache-autofill-state.json`, and future runtime files now survive rebuilds and container replacement.
- Verified `https://www.pvtkrrx.cc/health` returned `200` after the rollout, so the hosted relay is healthy on the new commit.
- Re-confirmed deploy drift on the non-live mirror path: `/opt/stack/sites/pvtkrrx` is still at `cabe9a5`, so that checkout must not be treated as proof of what the public host is serving.
- Practical outcome: the `1.1.29` sports-package release is now fully synchronized across GitHub desktop release, GitHub self-host release, and the live hosted/cloud runtime, and the hosted runtime root is now durable enough to remember posters plus runtime config/state across updates.
- Release-prep pass on 2026-04-08 moved the package version to `1.1.29`, kept the public canonical/OG/sitemap metadata aligned to `https://www.pvtkrrx.cc`, and added mapped sports poster package support so local/server runtimes can treat a downloaded package as the primary sports-art catalogue.
- `npm run smoke:config`, `npm run smoke:guards`, `npm run smoke:selfhost`, `npm run smoke:desktop`, `npm run smoke:playback`, `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed on 2026-04-08 for the `1.1.29` sports-package release cut.
- `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-08 for the `1.1.29` sports-package release cut.
- `npm run dist:win` passed on 2026-04-08 for the `1.1.29` desktop release build and refreshed `dist/latest.yml` plus `dist/releases/index.json`.
- Added `sportsImagePackagePath` support across runtime config, configure UI, and both self-host setup flows so operators can point PVTKRRX at a downloaded local/server sports poster package.
- Added package-aware sports image resolution: if a configured package manifest maps a known `sourceUrl` to a local file, PVTKRRX now imports that file into the runtime cache before any upstream image fetch.
- Added `npm run cache:sports-package` so a mapped poster package can be synced into the runtime cache in one pass instead of waiting for lazy first-hit imports.
- Tightened the image serve path so `/image/sports/...` now stays cache-only on request: it can satisfy a miss by importing from the mapped package, but it no longer repopulates the catalogue from live upstream image fetches during normal request handling.
- Verified the live hosted rollout after the release cut: manual Coolify API redeploy `cphgnqptcvtvif60g0u57n7g` finished successfully on 2026-04-08 and moved the public relay to commit `e568ece` / version `1.1.29`.
- Externalized the live hosted runtime root on 2026-04-08 by mounting `/opt/pvtkrrx/runtime` into `/root/.local/share/PVTKRRX/runtime`; the legacy `/opt/pvtkrrx/sports-image-cache` path now resolves back into that runtime tree so the image catalogue is remembered instead of remapped on each update.
- Re-verified deployment health after the earlier transient build-export failure on deployment `328`: later GitHub webhook deployment `330` for commit `477595b` finished successfully, and the follow-up manual redeploy `tags0jmb4ozrq92iyykogq74` applied the runtime-root mount without rebuilding the image.
- `npm run smoke:sports`, `npm run smoke:config`, and `npm run smoke:parity` passed again on 2026-04-08 after the cache-only/package-aware image-path alignment, keeping the mapped-package import flow plus stable runtime-path behavior covered.

- New regression coverage on 2026-04-08:
  - `npm run smoke:config`
  - `npm run smoke:sports`
  - `npm run smoke:sports-cache`
  - `npm run smoke:sports-cache-auto`
  - manual `npm run cache:sports-package -- <temp-package-path>` operator proof

## Work Carried Out On 2026-04-09

- Traced the current `The addon returned empty content` desktop symptom to legacy disk-backed Windows host configs that still persisted `routeProfile = lan` with `lanPairRequired = true`, which makes the home-device route fail closed and return empty catalogs whenever the host pair is offline.
- Added a desktop-local config migration so disk-backed host configs now auto-upgrade that old strict `LAN Bridge` state to the current hybrid fallback profile on load/save, while explicit hosted legacy LAN tokens still keep their old fail-closed behavior for troubleshooting.
- Tightened config-issue gating so `/local/manifest.json?mode=local` does not inherit the hosted file-server warning just because the same disk-backed host config also carries a hybrid home-device profile.
- Separated LAN-pair record TTL from live redirect trust: hybrid/home-device routing now stops treating a host as online once its heartbeat goes stale relative to the configured desktop cadence, instead of clinging to a several-hour relay record after the PC or local server goes offline.
- `/pair/status` now reports `stale-heartbeat` for that condition as well, so configure/status surfaces can match the real redirect decision instead of claiming the dead host is still online.
- Hybrid hosted fallback now also checks for an account-linked hosted cloud profile and swaps that in when present, so the fallback backend comes from the saved cloud/seedbox config instead of the desktop token's own `127.0.0.1` service URLs.
- Hybrid `/encrypt` no longer overwrites that linked cloud takeover profile just because the desktop token happens to carry one non-local URL alongside local qBit/Prowlarr values.
- Bumped the Windows desktop EXE line to `1.1.31`, rebuilt the packaged artifacts with `npm run dist:win`, and refreshed the local desktop update metadata in `dist/latest.yml` plus `dist/releases/index.json`.
- Scope note: this was an EXE/version refresh only, not a claim that the hosted cloud and self-host GitHub release lines were also republished to `1.1.31`.
- Bumped the hosted cloud and Windows desktop EXE line together to `1.1.32`, refreshed the package metadata, and rebuilt the Windows artifacts so the live cloud runtime and local installer line now point at the same linked-takeover revision.
- Scope note: this `1.1.32` pass aligns the hosted cloud runtime plus the EXE artifacts, not the wider GitHub desktop/self-host release publish flow.
- Regression coverage now proves:
  - auto-provision returns a hybrid desktop home route
  - local config save/readback defaults to hybrid fallback
  - linked desktop configs keep the hybrid profile
  - legacy disk-backed desktop LAN configs auto-migrate and persist back to disk
  - stale hybrid LAN-pair records now fall through to hosted/cloud instead of redirecting to a dead LAN host
  - `npm run smoke:config`, `npm run smoke:lan-pair`, and `npm run smoke:selfhost` all passed on 2026-04-09
  - `npm run dist:win` passed on 2026-04-09 for the `1.1.31` desktop EXE refresh
  - `npm run smoke:config`, `npm run smoke:lan-pair`, `npm run smoke:selfhost`, and `npm run dist:win` all passed again on 2026-04-09 for the aligned `1.1.32` desktop/cloud revision

## Earlier 2026-04-04 Self-Host Work

- The Linux self-host installer now auto-picks a free qBittorrent WebUI port if 8080 is already occupied and writes that real port back into the qBit config before startup.
- The shared server installer now prefers the detected or exported qBittorrent port instead of hardcoding 8080 when saving self-host config.
- Empty sports/movie/TV catalogs now short-circuit to a setup-needed placeholder when Prowlarr has no indexers or is unreachable.
- Smoke coverage now includes the qBit port fallback helper and the empty-provider catalog placeholder.
- The next self-host release was published as `v1.12.10-selfhost`, keeps the working public PVTKRRX root/configure/bootstrap/manifest URLs explicit at install time using raw stdout, and now auto-wires Prowlarr to qBittorrent during bootstrap even on dirty installs while testing connectivity with a unique temporary download-client name to avoid Prowlarr duplicate-name validation.

## Work Carried Out On 2026-04-02

- LAN Bridge offline meta no longer injects the host-offline sentence into every detail page. Meta requests now fall through to hosted metadata when the pair is offline, while catalogs and streams still fail closed.
- `npm run smoke:lan-pair` passed on 2026-04-02 after the silent-offline-meta change.

## Work Carried Out On 2026-04-01

- `9b46cbb` narrowed self-host `/configure` to the `Remote Seedbox` route and hides `PC Local` / `LAN Bridge` there, matching the current runtime split.
- `da8c22f` added one-time Stremio server link sessions so a local signed-in browser device can link a hosted or self-hosted remote config without copying raw Stremio credentials onto the server.
- `npm run dist:win` passed on 2026-04-01 for the `1.1.22` desktop build, so the packaged app now includes the new cross-machine Stremio link flow.

## Work Carried Out On 2026-03-31

- `169a2e4` documented the live public-host truth table, dead preview-host status, and website audit state across the main docs set.
- `e50a6b0` rewrote the homepage around clearer product positioning, route comparison, requirements, and sports proofing.
- `9c18996` and `9b93f03` added explicit self-hosted server setup: localhost/private service validation for self-host installs, browser password flow, disk-backed `/selfhost` manifests, server setup scripts, and optional `systemd` install support.
- `d174bd2` added provider-specific runbook presets to the runbooks/configure surface.
- `428b15b` changed stream source labels so users can see whether playback is coming from the host PC or the remote/server route.
- `2d3175a` added the sports artwork byte cache/proxy layer so posters, wallpapers, landscape art, and logos can be served from the active local/hosted runtime after the first fetch instead of being hotlinked every time.
- 2026-03-31 Apple TV strict-client fix: meta responses no longer emit `meta: null`; unsupported meta paths now return a real placeholder `MetaItem` so tvOS clients do not fail deserialization on missing metadata.
- 2026-03-31 server-agnostic Stremio account link sessions: hosted-token and disk-backed `local` / `selfhost` configs can now create a short-lived browser/addon pairing session, observe addon install hits, and finish account linking from any signed-in browser device without the server scraping a Stremio password.
- 2026-03-31 desktop-local split: the Electron runtime and shared configure surface now advertise `desktopLocalOnly`, hide `Remote Seedbox` inside the Windows EXE, and keep the desktop app focused on `PC Local` plus `LAN Bridge`.

## Verified Working Now

These items are verified in the current workspace or by direct client/log proof:

- `npm run smoke:config` passed on 2026-03-29
- `npm run smoke:selfhost` passed on 2026-03-31 and now covers explicit self-host server mode, disk-backed `/selfhost` config, and self-host password gates
- `npm run smoke:selfhost` passed again on 2026-03-31 after adding browser-driven Stremio link-session persistence into the disk-backed self-host config
- `npm run smoke:provider-discovery` passed on 2026-04-02 after broadening the shared provider discovery helpers for existing Prowlarr/qBittorrent installs
- `npm run smoke:config` passed on 2026-04-06 after the `1.1.25` public release cut, keeping `/version-status.json`, `/install-selfhost.sh`, and the hosted/local manifest flows green
- `npm run smoke:desktop` passed on 2026-04-06 after the `1.1.25` public release cut
- `npm run smoke:playback` passed on 2026-04-06 after the `/playback` buffering-handoff fix and now covers target-file playback tokens for multi-file torrents
- `npm run smoke:selfhost` passed on 2026-04-06 after the `1.1.25` public release cut, keeping disk-backed self-host config plus password gating green
- `npm run smoke:pipeline` passed on 2026-04-06 after the buffering-stream handoff fix, keeping self-host/local buffering rows on the safer `/playback` route
- `npm run smoke:guards` passed on 2026-04-06 after the `1.1.25` public release cut
- `npm run smoke:lan-pair` passed on 2026-04-06 after the playback-token update, keeping opaque LAN/home-route token flow green
- `npm run smoke:sportsdb-league` passed on 2026-04-06, proving mapped league fallback can still recover EPL/UFC artwork when the upstream sport-wide league list is irrelevant or truncated
- `npm run smoke:sports-cache` passed on 2026-04-06 after switching the pre-seed flow to direct mapped-league ids for known leagues
- `npm run smoke:sports-cache-auto` passed on 2026-04-06 after the same mapped-league lookup fix, keeping cursor rotation and cache reuse green
- `npm run smoke:sports` passed on 2026-04-06 after the mapped-league lookup fix, with the expected bad-id placeholder error still isolated to the existing negative-path assertion at the end of the smoke output
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-06 from the Windows workspace for the public release cut
- `npm run smoke:config` passed again on 2026-04-06 for the `1.1.26` / `v1.12.12-selfhost` installer refresh, keeping `/version-status.json`, `/install-selfhost.sh`, and the hosted/local manifest flows green
- `npm run smoke:selfhost` passed again on 2026-04-06 for the installer refresh, keeping the explicit self-host server path green before the new pinned self-host prerelease
- `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed again on 2026-04-06 before the `1.1.26` / `v1.12.12-selfhost` installer refresh
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed again on 2026-04-06 before the `v1.12.12-selfhost` prerelease cut
- `npm run smoke:config` passed again on 2026-04-06 after the homepage release-card restore and final `1.1.27` rebuild
- `npm run smoke:selfhost` passed again on 2026-04-06 after updating the self-host smoke assertions to the current configure copy contract
- `npm run smoke:desktop` passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `npm run smoke:playback` passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed again on 2026-04-06 before the `v1.12.13-selfhost` prerelease cut
- `npm run smoke:sports-cache` passed on 2026-04-04 for the new sports cache pre-seed flow, including disk-cache reuse on rerun
- `npm run smoke:sports-cache-auto` now covers the rotating background sports-cache autofill flow: first sport, cursor advance, second sport, cursor wrap, and disk-cache reuse on the wrapped pass
- `npm run smoke:playback` now also covers the split self-host playback-origin path so `/playback` redirects can leave the control/tunnel origin and land on a dedicated direct byte-serving origin
- `npm run smoke:sports` passed on 2026-04-04 after the `1.1.24` release cut, with the expected bad-id placeholder error still isolated to the existing negative-path assertion at the end of the smoke output
- `npm run smoke:config` passed on 2026-04-04 after the `1.1.24` release cut, keeping `/install-selfhost.sh` and the hosted/local manifest flows green
- `npm run smoke:selfhost` passed on 2026-04-04 after the `1.1.24` release cut, keeping disk-backed self-host config plus password gating green
- `npm run smoke:desktop` passed on 2026-04-04 after the `1.1.24` release cut
- `npm run smoke:lan-pair` passed on 2026-04-04 after the `1.1.24` release cut, including the hosted `com.kepners.pvtkrrx.hybrid` manifest path
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-04 from the Windows workspace, confirming the cloud/self-host launcher parses cleanly even though `C:\Windows\System32\bash.exe` is only a WSL launcher stub here
- `npm run smoke:config` passed on 2026-04-02 after the release-status endpoint and homepage release card were added
- `npm run smoke:desktop` passed on 2026-04-02 after the desktop popup gained its release-status panel and preload bridge
- `npm run smoke:sports` passed on 2026-03-31 after the sports artwork byte-cache update, including proxy URL coverage and cache-hit reuse checks
- `npm run smoke:sports` passed again on 2026-03-31 after the Apple TV-safe meta placeholder change
- `npm run smoke:desktop` passed on 2026-03-29 and now guards the desktop auto-provision persistence path against writing redacted config readbacks back to disk
- `npm run smoke:playback` passed on 2026-03-29 and now covers redirect plus byte-serving on the shared `/file` route
- `npm run smoke:pipeline` passed on 2026-03-29
- `npm run smoke:sports` passed on 2026-03-29
- `npm run dist:win` passed on 2026-03-29, again on 2026-03-30 for the `1.1.16` desktop release build, again on 2026-03-30 for the `1.1.17` bug-fix desktop release build, again on 2026-03-30 for the `1.1.18` archive-extraction desktop release build, again on 2026-03-30 for the `1.1.19` desktop power-policy build, again on 2026-03-31 for the `1.1.20` sports-image-cache build, again on 2026-03-31 for the `1.1.21` Apple TV metadata-serialization fix build, again on 2026-04-01 for the `1.1.22` Stremio link-session desktop release build, again on 2026-04-02 for the `1.1.23` release-status build, and again on 2026-04-04 for the `1.1.24` sports-cache desktop build
- `npm run smoke:lan-pair` passed again on 2026-04-02 after the silent LAN offline meta pass-through change
- `npm run smoke:config`, `npm run smoke:desktop`, `npm run smoke:stremio-link`, `npm run smoke:lan-pair`, `npm run smoke:guards`, `npm run smoke:security`, `npm run smoke:pipeline`, `npm run smoke:playback`, and `npm run smoke:sports` all passed again on 2026-03-30
- root `/manifest.json` returns the bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- 2026-03-31 public host check: `https://www.pvtkrrx.cc/`, `/configure`, `/runbooks`, `/manifest.json`, and `/health` all returned `200` from the live public host; `/local/install` returned `403` as expected for a local-only helper route
- 2026-03-31 preview-host check: `https://pvtkrrx.vercel.app/` returned `404` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`, so treat it as stale and non-canonical
- 2026-04-06 homepage verification against `https://www.pvtkrrx.cc/` confirmed the refactor is now live: `truth-band` and `Where does playback happen` are present, while legacy `meta-grid` and `hero-chip` markers are absent
- 2026-04-06 Contabo runtime verification showed the public route still enters through Caddy and targets the Coolify alias `pvtkrrx:3000`; the separate `pvtkrrx.service` host runtime at `/opt/pvtkrrx` on `:7000` is not the public route unless Caddy is repointed
- 2026-04-07 public-site cleanup: the public website stopped advertising `/configure` as a public entry point, `GET /configure` now redirects remote/public requests back to the guide-only site, the bootstrap manifest now identifies remote root installs as `PVTKRRX Website Only`, and runbooks/homepage copy now point users to the Windows host runtime or their own self-host server for real setup
- explicit self-host server mode now exposes `/app-config.json`, disk-backed `/selfhost/config.json` + `/selfhost/manifest.json?mode=hosted`, and `POST /server-config` for persisted VPS/seedbox installs
- the self-host installer path has now been rebuilt around a dedicated Linux bootstrap script plus a new `npm run server:setup` installer flow that writes a stable `PVTKRRX_RUNTIME_DIR`, generates `AUTH_TOKEN_SECRET`, supports `PVTKRRX_PUBLIC_BASE_URL`, auto-discovers existing Prowlarr/qBittorrent configs when present, automatically hands off to the full bootstrap when those providers are missing, now exposes a hosted launcher at `https://www.pvtkrrx.cc/install-selfhost.sh`, pulls the app source from the branch payload by default with optional tag/manifest pinning and an automatic retry from `main` if a pinned release is too old for `scripts/server-installer.js`, saves the runtime config locally, creates the self-host password file, can install a Linux `systemd` service for auto-start on boot, and now prints the working public PVTKRRX root/configure/bootstrap/manifest URLs explicitly in the installer summary using raw stdout so they are not redacted; the current published self-host release is `v1.12.18-selfhost`
- `npm run smoke:stremio-link` passed on 2026-03-31 after the new link-session flow was added for hosted token configs: server-created session, install-seen manifest hit, browser AuthKey completion, and final linked install URL/token refresh
- configure page now exposes a one-time `Server Link Session` flow so a local signed-in Stremio browser/device can link a remote/cloud server config without the server recovering raw login credentials
- `PC Local` resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- same-host `LAN Bridge` `Failed to fetch` was traced to route choice on 2026-03-28, not to server failure
- completed-file playback error `isCompletedTorrent is not defined` was fixed in the local playback path
- the desktop splash now appears on every cold boot and stays frontmost until the main shell is ready
- the desktop wrapper now starts a Windows power blocker by default and logs lock/unlock/suspend/resume so the host is less likely to disappear when Windows is locked or the display turns off
- the desktop shell can now toggle Windows sign-in startup on/off from inside the app, and startup launches stay hidden in the tray so the local runtime can auto-launch after login without popping the main window
- the Windows startup toggle now writes a quoted `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` command and repairs the legacy malformed unquoted startup entry on the next desktop launch, fixing the installed EXE failing to auto-open from `C:\Program Files\...` paths
- host-side `LAN Bridge` status now checks the hosted relay directly, and the desktop can repair a stale local pair identity after an `invalid pair key` rejection
- host-side Stremio Desktop session scanning now detects the real WebView2 `profile/auth/key` storage format again, and startup auto-provision can link that signed-in session automatically
- sports catalog tiles now prefer portrait poster art when TheSportsDB provides it, while backgrounds stay sport/league-aware for better Stremio wallpaper coverage
- completed matched packed scene releases now stay hidden by default until PVTKRRX can surface an extracted direct-play file, while incomplete archive sets stay hidden until every volume is ready
- packed-only tracker torrents are now inspected dynamically before stream emission, so neutral-title `.torrent` links no longer fall through to fake live `/playback` streams
- sports event title parsing now handles non-vs formats (F1, UFC, MotoGP, Supercars, NASCAR, etc.) with structured league/date/event extraction
- sports catalog grouping correctly deduplicates quality variants of the same non-vs event into one tile
- sports detail pages now carry richer metadata: multi-line descriptions, sport type labels, league/date/event info
- Supercars, V8, NASCAR, WSBK, WEC, Formula E, Darts, and expanded Golf coverage added to sport detection
- local `/playback` now fails fast for incomplete multi-volume RAR releases after queueing the torrent, instead of timing out behind a false progressive-playback promise
- completed packed RAR releases now start background extraction into a managed `.pvtkrrx-extracted/<hash>` folder when the local host can reach the archive volumes, and direct extracted playback is the supported path once ready
- local `/file` now waits for the specific requested qBittorrent piece window during seek/skip range probes, so already-downloaded later ranges return `206` instead of dropping out after the initial buffer
- local qBittorrent control can now manage a PVTKRRX-owned completion hook for packed-release extraction without silently overwriting a different existing qBit post-process program
- stream labels now use emoji state badges (`⬇️` download-and-play, `⏳` buffering, `✅` downloaded, `📦` extracted) and a film-icon container badge (`🎬MKV`, `🎬MP4`, etc.)
- the desktop shell now has explicit `Minimize`, `Send To Tray`, and `Exit App` controls, hides to tray on close, and uses a larger no-scroll default layout
- the configure page now shows the live qBittorrent save path, incomplete path, fallback storage roots, and extraction-hook state when opened on the Windows host runtime
- official Stremio sources were re-checked on 2026-03-30: `rarUrls` is a real archive source, tuple-style `ArchiveUrl` is the correct payload shape, and archive sources are routed through the local streaming server at `rar/create`
- the repo-local `behaviorHints.sourceContainer = 'rar'` hint is not part of the official Stremio archive contract and should not be treated as proof that clients honor the stream
- `npm run smoke:pipeline` and `npm run smoke:playback` both passed again on 2026-03-30 during the documentation audit; these prove the supported direct-play packed-release behavior and keep the experimental native archive payload path covered
- current configure flow exposes route-aware primary install links while keeping manual addon URLs as fallback, and the current `public/configure.html` flow passed the 2026-03-30 config/desktop/link smoke pass
- the Stremio WebView2 client cache on this machine contains cached PVTKRRX stream responses with `PVTKRRX` in the stream `name`, confirming branded source labels are reaching the real client
- `1.1.19` installers were built successfully into `dist/`
- `1.1.20` installers were built successfully into `dist/` on 2026-03-31 for the sports image-cache update
- `1.1.21` installers were built successfully into `dist/` on 2026-03-31 for the Apple TV metadata-serialization fix
- `1.1.22` installers were built successfully into `dist/` on 2026-04-01 for the one-time Stremio server link-session update and self-host configure route cleanup
- `1.1.23` installers were built successfully into `dist/` on 2026-04-02 for the GitHub release-status update
- `1.1.24` installers were built successfully into `dist/` on 2026-04-04 for the sports cache pre-seed desktop release refresh
- `1.1.25` installers were built successfully into `dist/` on 2026-04-06 for the public playback-handoff release
- `1.1.26` installers were built successfully into `dist/` on 2026-04-06 for the mapped-league artwork installer refresh
- `1.1.27` installers were built successfully into `dist/` on 2026-04-06 for the synchronized release-alignment cut and homepage release-card restore
- `1.1.28` installers were built successfully into `dist/` on 2026-04-08 for the canonical-host cleanup and synchronized release refresh
- `1.1.29` installers were built successfully into `dist/` on 2026-04-08 for the mapped sports poster package release
- `1.1.30` installers were built successfully into `dist/` on 2026-04-08 for the sports cache metadata persistence release
- `1.1.23` GitHub release was published on 2026-04-02 with the matching `latest.yml`, portable EXE, and setup installer assets
- `1.1.25` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.11-selfhost` GitHub prerelease was published on 2026-04-06 for the self-host/server playback-handoff fix and current cloud installer line
- `1.1.26` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.12-selfhost` GitHub prerelease was published on 2026-04-06 for the mapped-league artwork fix and current cloud installer line
- `1.1.27` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.13-selfhost` GitHub prerelease was published on 2026-04-06 for the synchronized release-alignment cut and current cloud installer line
- `1.1.28` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.14-selfhost` GitHub prerelease was published on 2026-04-08 for the synchronized release refresh and current cloud installer line
- `1.1.29` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.15-selfhost` GitHub prerelease was published on 2026-04-08 for the mapped sports poster package release and current cloud installer line
- `1.1.30` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.16-selfhost` GitHub prerelease was published on 2026-04-08 for the cache-only sports artwork metadata persistence release and current cloud installer line
- `1.1.32` GitHub release was published on 2026-04-09 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.17-selfhost` GitHub prerelease was published on 2026-04-09 for the linked cloud takeover alignment and current cloud installer line
- `1.1.33` GitHub release was published on 2026-04-12 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.18-selfhost` GitHub prerelease was published on 2026-04-12 for the SVG-only sports free surface and SportsMeta entitlement-gated artwork line
- `npm run dist:win` passed again on 2026-04-06 for the `1.1.25` desktop public release build
- `npm run dist:win` passed again on 2026-04-06 for the `1.1.26` desktop installer refresh
- `npm run dist:win` passed again on 2026-04-06 for the aligned `1.1.27` desktop release build
- the packaged Windows desktop app is working on the current host build, including the route-first setup flow and desktop shell controls shown in the live app UI
- a real Apple TV LAN Bridge playback pass succeeded on 2026-03-31 after desktop/web install; while the Windows host stayed locked, playback started normally, the client reported the video as local, and forward/back seek worked

## What We Fixed On 2026-03-28 And 2026-03-29

1. Host-desktop `LAN Bridge` browsing:
   - Root cause: the host Windows PC was using the hosted `LAN Bridge` route instead of `PC Local`.
   - Fix: keep `LAN Bridge` for the other home devices and use `PC Local` on the host desktop.
2. Playback error on a fully downloaded file:
   - Root cause: first `/playback` crashed with `isCompletedTorrent is not defined`, and after that was fixed the redirected `/file` route still crashed because `fs` was not imported in `index.js`.
   - Fix: restored the completion-state helper, re-imported `fs` for the built-in file server, and re-covered the route with a smoke test that follows playback redirect all the way into served bytes.
3. Windows installer build failure:
   - Root cause: `electron-builder`/`rcedit` was failing when writing EXE metadata directly inside the OneDrive-backed repo output folder.
   - Fix: build in temp first, then copy/archive back into `dist/`.
4. Startup shell behavior:
   - Root cause: the splash could disappear too quickly and was not forced to the front.
   - Fix: splash is now frontmost, minimum-duration, and replaced only after the local runtime is reachable.
5. Sports posters:
   - Root cause: sports tiles were biased toward portrait/fallback art even when landscape event art existed.
   - Fix: sports artwork now tracks portrait, landscape, and background separately, and tiles prefer landscape.
6. LAN Bridge pair drift after desktop auto-provision:
   - Root cause: desktop boot could rewrite the saved local config with a sanitized `/auto-provision` readback payload, which dropped `lanPairKey` / `lanPairOwnerId`. A later local auto-setup then regenerated a new key for the same pair id and the hosted relay rejected it as `invalid pair key`.
   - Fix: desktop boot no longer persists sanitized provision readbacks, host-side pair status now asks the relay directly, and the desktop can repair the local LAN identity if the relay rejects a stale pair.
7. Host-side Stremio account reuse stopped auto-detecting the signed-in desktop session:
   - Root cause: the local auth scanner only matched clean JSON-style `auth.key` blobs and missed the noisy Chromium/WebView2 LevelDB encoding actually used by Stremio Desktop on this machine.
   - Fix: the scanner now accepts the real `profile/auth/key` blob layout, and startup `/auto-provision` reuses that signed-in host session automatically instead of waiting for a manual check button.
8. Packed sports/movie scene releases were added to qBittorrent as `.r00/.r01/...` archives and could not play:
   - Root cause: the addon only emitted direct video/file URLs and intentionally rejected `Sample + RAR` torrents as non-playable, even though Stremio supports archive playback through `rarUrls`.
   - Fix: once a packed torrent already exists in qBittorrent, local playback-capable routes now emit a Stremio `rarUrls` stream over the built-in `/file` route so Stremio can read the archive set without manual extraction. First-click tracker queueing is still a separate step.
9. Packed archive streams were still surfacing too early and classic volume ordering was wrong:
   - Root cause: the addon emitted `rarUrls` before every archive volume was fully ready, and classic multi-part sets were sorted lexically (`.r00`, `.r01`, `.rar`) instead of archive order (`.rar`, `.r00`, `.r01`).
   - Fix: incomplete packed releases are now hidden behind a clear notice until every archive volume is ready, classic volume ordering is corrected, and stale `/playback` links now stay in a waiting state instead of pretending the packed release is ready.
10. Packed archive payload shape did not match the modern Stremio core contract:
   - Root cause: the addon emitted archive entries as object-shaped `rarUrls` items and scalar `fileMustInclude`, while current `stremio-core` examples and stream conversion logic expect tuple-style archive URLs and array-based include patterns.
   - Fix: packed archive streams now serialize `rarUrls` in Stremio-core-compatible tuple form and emit `fileMustInclude` as an array of string patterns.
11. Partial packed RAR playback was still being falsely advertised on neutral-title tracker sources:
   - Root cause: unmatched `.torrent` links were being emitted as generic `/playback` streams before the addon had inspected the torrent payload, and archive-only torrents were not being prioritized as a bundle when qBittorrent primed the download.
   - Fix: tracker links are now inspected dynamically before stream emission, neutral packed-only torrents are suppressed behind a truthful packed-release notice, archive-only priming now prioritizes the full RAR bundle instead of a sample clip, and `/playback` now returns an immediate packed-archive explanation instead of stalling.
12. Completed packed releases still failed on tablet/mobile clients even when native `rarUrls` was the intended desktop/service-backed fallback:
   - Root cause: the addon relied entirely on client-side native RAR support, but real Stremio client support is uneven outside desktop/service-backed routes and the tablet path still needed a normal direct-play video file.
   - Fix: the local/host runtime now bundles `7zip-bin`, starts background extraction for completed packed releases when the archive volumes are locally reachable, and prefers the extracted direct video stream once available while keeping native `rarUrls` as the desktop-capable fallback.
13. The local host could disappear when Windows was locked or the display turned off:
   - Root cause: the Electron desktop wrapper did not request any suspend blocker and did not react to Windows lock/resume state changes, so LAN hosting depended entirely on the user's power plan staying awake.
   - Fix: `1.1.19` now starts Electron `powerSaveBlocker` in `prevent-app-suspension` mode by default, disables renderer background throttling for the desktop shell, and logs/re-heartbeats on `lock-screen`, `unlock-screen`, `suspend`, and `resume`.
14. Native packed-RAR fallback still lacked one real PVTKRRX client pass:
   - Root cause: the repo had a spec-aligned `rarUrls` payload path, but neither the local runtime logs nor the Stremio-side data on this machine contained a captured end-to-end native archive success, so the addon was still advertising an unproven playback mode.
   - Fix: completed packed releases now stay hidden by default until archive extraction can surface a normal direct-play video file; native `rarUrls` emission remains available only behind `PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true` for manual testing.
15. Local skip/seek probes could still time out a few seconds into buffering playback:
   - Root cause: `/file` knew how many head bytes were readable, but it did not map later seek probes to qBittorrent piece availability, so Stremio footer/range requests outside that initial head window still failed too early.
   - Fix: `/file` now queries qBit torrent properties + piece states, maps file offsets to torrent pieces, and waits for the requested piece window before answering late-range probes.
16. qBittorrent extraction ownership was unclear and settings could not manage it cleanly:
   - Root cause: PVTKRRX already owned archive extraction, but the UI did not expose whether qBit should trigger that flow on completion and there was no managed completion-hook path.
   - Fix: the local runtime now exposes qBit preference/readback routes for extraction state, can install a PVTKRRX-managed qBit completion hook, and refuses to overwrite a different external qBit completion program silently.
17. The desktop shell still behaved like a single close-only window and clipped the current content:
   - Root cause: the Electron shell had no tray lifecycle, no minimize/hide actions, and the fixed `920 x 660` layout plus popup overflow styling produced the persistent scrollbar.
   - Fix: the desktop window now ships larger, removes the normal scrollbar, exposes `Minimize`, `Send To Tray`, and `Exit App`, and restores cleanly from a real tray menu/click path.

## Still Needs Real-Client Proof

These items should still be treated as open until captured on real clients:

- one extra non-tvOS `LAN Bridge` browse/play pass on Android TV or Android mobile using the latest `1.1.30` desktop build for cross-client parity
- one real public `Remote Seedbox` ready-file playback success on a remote client
- one auth-protected external file-server playback success on a real Stremio client
- long-session playback/performance tuning after qBittorrent download-speed adjustments

## Current Risks

- `Hybrid Home` now depends on the Windows host desktop only for the LAN-first path; away/offline takeover still requires a linked cloud profile with reachable non-local backends
- Bonjour may still be missing or stopped on some hosts; that affects discovery/fallback polish, not the core loopback path
- remote/auth-protected playback behavior still depends on what the target Stremio client honors during redirect/auth handoff
- the addon still emits `behaviorHints.sourceContainer = 'rar'` on the experimental native archive path, but official Stremio docs/core do not define that field for archive support
- if a future Stremio client regresses local archive support, the supported fallback already remains: suppress partial multi-volume archives and only advertise extracted direct-play files
- the homepage refactor is live, but it still needs a real mobile/desktop device pass to rule out layout regressions after deploy
- route naming is still inconsistent across live surfaces; until copy work is intentionally in scope, users may continue to see both `Hybrid Home` and `LAN Bridge` referring to the same home-device path

## 2026-03-30 Plan Closure

1. ~~Rework packed RAR playback after the real-device `liberror` result.~~ **Closed 2026-03-30 by capability downgrade.**
   - `npm run smoke:pipeline` and `npm run smoke:playback` passed again on 2026-03-30.
   - The later `/file` `torrent not found` log was traced to `watch-cleanup` deleting the torrent and data after playback, not to an active playback bug.
   - A 2026-03-30 upstream audit confirmed that Stremio archive support is real: `rarUrls` exists in the SDK/core contract, tuple-style `ArchiveUrl` is correct, and archive sources are routed through `rar/create`.
   - The local runtime logs and Stremio-side data on this machine still did not show one captured end-to-end native archive success, so PVTKRRX stopped advertising that path by default instead of continuing to promise it.
   - Supported behavior is now: incomplete multi-volume archives are suppressed or fail fast with a clear message, completed bundles stay hidden until extraction yields a normal direct-play file, and the native archive payload path remains opt-in experimental only for manual testing.
2. ~~Make the configure flow more automatic.~~ **Closed 2026-03-30.**
   - `npm run smoke:config`, `npm run smoke:desktop`, and `npm run smoke:stremio-link` passed again on 2026-03-30.
   - The current simple flow now has route-aware primary install links and keeps manual addon URLs as fallback instead of the main path.
3. ~~Trace the exact seedbox playback model end to end.~~ **Done 2026-03-29.**
   - Full code trace confirmed route detection (`getInstallMode` + `getManifest` profile assignment), stream emission per route, 307 LAN redirect mechanics, and `/file`/`/playback` route guards.
   - All three routes expose the same sports-first discovery catalog family plus movies, tv, and library — no per-route catalog filtering.
   - LAN Bridge 307-redirects rewrite the token path to `/local/...?mode=local`, giving LAN devices full PC Local playback after redirect.
   - Remote Seedbox on Vercel: `/file` and `/playback` return 403 for non-local tokens; ready-file-first via `fileServerUrl`.
   - Auth-protected file servers: tracker `/playback` suppressed on non-local routes because redirect can't forward `proxyHeaders`.
   - Packed RAR: emitted only when all volumes 100% complete; suppressed at stream emission for tracker first-click; `/playback` fails fast for incomplete archives.
   - Explicit capability matrix now in `docs/ROUTE_FRAMEWORK.md`.
   - `npm run smoke:lan-pair`, `npm run smoke:guards`, and `npm run smoke:security` all passed again on 2026-03-30.
4. ~~Fix sports identity quality.~~ **Done 2026-03-29.**
   - Non-vs event titles (F1, UFC, MotoGP, Supercars, NASCAR, etc.) now parse via `parseSportsEventTitle` with structured league/date/event extraction.
   - Motorsport coverage expanded: Supercars, V8, NASCAR, WSBK, WEC, Formula E, Rally, Dakar now recognized.
   - Darts and golf added as distinct sport categories.
   - Sport hint resolution, scoring signals, and catalog grouping all updated for non-vs events.
   - TheSportsDB query builder now uses structured event names for better artwork matches.
   - Smoke tests cover event parsing, sport disambiguation, catalog grouping for F1/motorsport events, meta richness, and artwork fallback.
   - `npm run smoke:sports` passed again on 2026-03-30.
5. ~~Fix sports metadata/detail pages.~~ **Done 2026-03-29.**
   - Sports detail pages now carry multi-line descriptions with league, date, event name, matchup, and stats.
   - `runtime` field now shows the sport type label (e.g. "Motorsport", "MMA").
   - `genres` tags include both sport category and league name.
   - Artwork fallback still works when TheSportsDB returns nothing (SVG thumb or brand poster).
   - `npm run smoke:sports` passed again on 2026-03-30.
6. ~~Verify whether sports can become its own top-level Stremio surface.~~ **Closed 2026-03-30.**
   - Result: the current live addon manifest now uses a dedicated top-level `sports` surface and the latest local/LAN real-client pass shows it working across sports catalogs such as Premier League and Formula 1.
   - `npm run smoke:config` and `npm run smoke:sports` cover the current manifest/type shape and sports catalog behavior.
7. ~~Ensure `PVTKRRX` appears in the source list for normal films.~~ **Closed 2026-03-30.**
   - `npm run smoke:pipeline` still asserts that movie, direct-ready, and packed-ready stream names begin with `PVTKRRX`.
   - The real Stremio WebView2 cache on this machine contains cached stream payloads with `PVTKRRX` in the stream `name`, confirming the client is receiving and storing the branded source labels instead of only third-party addon labels.
8. SportsMeta split rollout on 2026-04-10.
   - The separate `sportsmeta` repo is now the real live addon boundary on Contabo:
     - manifest: `https://sportsmeta.pvtkrrx.cc/manifest.json`
     - catalog example: `https://sportsmeta.pvtkrrx.cc/catalog/movie/sportsmeta-basketball.json`
     - meta example: `https://sportsmeta.pvtkrrx.cc/meta/movie/sportsmeta%3Aevent%3Afighting%7C2026-04-10%7Cprofessional-fighters-league%7Cpfl-africa-1-pretoria.json`
   - Live Contabo runtime shape for SportsMeta:
     - service: `sportsmeta.service`
     - app path: `/opt/sportsmeta/app`
     - data path: `/opt/sportsmeta/data`
     - db path: `/opt/sportsmeta/data/db/sportsmeta.sqlite`
     - asset cache path: `/opt/sportsmeta/data/assets/cache`
     - source import roots: `/opt/pvtkrrx/runtime` and `/opt/pvtkrrx/data/pvtkrrx`
     - live route fragment: `/opt/stack/caddy/apps-enabled/sportsmeta.pvtkrrx.cc.caddy`
     - paid TheSportsDB key is now configured on the service via `SPORTSMETA_SPORTSDB_API_KEY`
   - The live SportsMeta health surface now reports:
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
   - SportsMeta paid membership is now live on the standalone host only:
     - pricing page: `https://sportsmeta.pvtkrrx.cc/pricing`
     - free root SportsMeta remains public and now serves SVG-only asset fallback on `/asset/...`
     - paid SportsMeta lives on tokenized member routes under `/member/:token/...`
     - live Stripe routes: `POST /billing/checkout`, `POST /billing/portal`, `POST /webhooks/stripe`
     - live yearly Stripe price ids: `price_1TKzDhENYh4p7RxpjEOBDw0c` (`Plus`) and `price_1TKzDiENYh4p7RxpgZb09QQN` (`Pro`)
     - this monetizes SportsMeta without moving entitlement logic into the `pvtkrrx` stream addon
   - SportsMeta was re-imported on 2026-04-11 from both runtime roots instead of only the older hosted cache.
   - The long canonical-id route bug is fixed live:
     - root cause was Fastify's default router `maxParamLength = 100`, which dropped longer `sportsmeta:` ids as route-level 404s
     - `https://sportsmeta.pvtkrrx.cc/meta/movie/sportsmeta%3Aevent%3Abasketball%7C2026-11-15%7Ceurobasket-women%7Cfinland-basketball-women%7Clithuania-basketball-women.json` now returns canonical metadata publicly
   - PVTKRRX is now attaching streams to the same canonical IDs without becoming the metadata owner:
     - repo commit `f676564` (`🛠️ fix: route hosted loopback services through contabo gateway`) is now live through successful Coolify deployment `372` (`sysdu6nl1s2wxcm48o01o78v`) after webhook deployment `371` failed during image export/unpack
     - that rollout moved the live public hosted container to `w14jewmw5ubscrxh8zzfhq7d-082417863890` on image `w14jewmw5ubscrxh8zzfhq7d:f676564650b757b40544b0b236fee272fd446a07`
     - the hosted relay now requires `PVTKRRX_HOST_GATEWAY_HOST=10.0.1.1` so tokenized configs that still carry `http://127.0.0.1:9696` and `http://127.0.0.1:8090` can reach the Contabo host's Prowlarr and qBittorrent services from inside the Coolify container
     - a real configured public route on `https://www.pvtkrrx.cc/:config/stream/movie/...` now returns a non-empty tracker stream again for `sportsmeta:event:fighting|2026-04-10|professional-fighters-league|pfl-africa-1-pretoria`
   - Follow-up live production repair on 2026-04-12 after the deployment audit:
     - SportsMeta upcoming ingest is now automated on the standalone host via `sportsmeta-upcoming-ingest.timer` -> `sportsmeta-upcoming-ingest.service` every 2 hours
     - the first scheduled run removed `658` contaminated seeded event rows and logged `contaminatedAfter = 0`
     - public `sportsmeta-all` is now ordered nearest-upcoming first on the live route
     - public `search=arsenal` and `search=rennes` are materially cleaner on the live SportsMeta host, and the bad `az-alkmaar|rennes` route was replaced by the correct live `az-alkmaar|heerenveen` metadata row
     - repo commit `70f0423` (`🛠 fix sports stream category constraints`) is now live on the hosted Coolify relay in container `w14jewmw5ubscrxh8zzfhq7d-184556663532` on image `w14jewmw5ubscrxh8zzfhq7d:70f0423e8dd95542b9f4a34b77c70036170fca28`
     - the configured hosted stream route now logs `Custom re-search query="..." cats="5060" useCategories=true`, proving the deployed re-search path is really category-constrained again
     - the same configured hosted stream route still returns tracker-backed football streams, so the category fix did not break SportsMeta stream attachment
   - Architecture truth after the rollout:
     - SportsMeta owns sports manifests, catalogs, metadata pages, artwork, and canonical `sportsmeta:` IDs
     - SportsMeta also owns Stripe checkout, portal, webhook, and entitlement enforcement for the premium layer
     - PVTKRRX remains the stream addon only
     - PVTKRRX remains free; the current configured `/:config/stream/...` path was not turned into a billing gate
     - the old integrated `/sportsmeta/*` draft inside `pvtkrrx` is not the live public boundary
     - the local integrated draft is now explicitly non-production in this repo and only loads when `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA=true`

## Recommended Next Work

1. Browser-check the live homepage on desktop and mobile and fix any regressions now that the refactor is public.
2. Decide whether Contabo should keep the extra `/opt/pvtkrrx` `systemd` runtime, repoint Caddy to it, or remove it so deploy expectations stop drifting.
3. Monitor SportsMeta scheduled ingest completeness and decide whether to add a broader revalidate/prune path; the new timer is live, but the first scheduled history pass still logged `status = partial` and one football window needed a one-off import after cleanup.
4. Add repeatable operator tooling for new JPG drops and future re-imports so `/opt/pvtkrrx/runtime` is not the only bootstrap path.
5. Monitor the live SportsMeta Stripe/member-token boundary and add later commercial options there if needed; keep PVTKRRX free and keep entitlement logic off the public stream addon surface.
6. Decide whether SportsMeta should stay as the current systemd + Caddy service boundary or move under Coolify later; the separate runtime itself is now working.
7. Tune qBittorrent for faster early playback and confirm stream start time improvements on real clients.
8. Keep sports poster/wallpaper review focused on what Stremio clients actually render, not just what the metadata payload contains.
9. Capture one extra Android TV or Android mobile `LAN Bridge` pass for cross-client parity beyond the now-verified Apple TV path.
10. Finish public remote/auth playback sign-off before calling the whole route set fully release-ready.
11. When copy work is back in scope, finish the `Hybrid Home` / `LAN Bridge` terminology cleanup across the popup, runbooks, bootstrap manifest text, and stream info notices.
12. Keep this file updated whenever a real device test changes the truth table.
