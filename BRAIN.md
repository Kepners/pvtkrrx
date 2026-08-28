# PVTKRRX Brain

## 2026-06-12: Personal hostname migrated to pvtkrr.layoutforge.app

- Reason: the owner no longer owns `kepners.co.uk`, so `pvt.kepners.co.uk` is dead
  and a third party could register the domain — treat any remaining live use of it
  as a security bug.
- Changes made live on Contabo:
  - Porkbun DNS: new A record `pvtkrr.layoutforge.app -> 94.72.97.251` (record ID
    555107084) on the `layoutforge.app` zone. The zone's wildcard CNAME to
    `pixie.porkbun.com` still exists; the specific A record overrides it.
  - Caddy: created `/opt/stack/caddy/apps-{available,enabled}/pvtkrr.layoutforge.app.caddy`
    (`reverse_proxy host.docker.internal:7000`), deleted both
    `pvt.kepners.co.uk.caddy` files, reloaded Caddy in-container.
  - `/opt/pvtkrrx/.env`: `PVTKRRX_ALLOWED_WEB_ORIGINS` now lists
    `https://pvtkrr.layoutforge.app` instead of the dead hostname;
    `pvtkrrx.service` restarted and active.
- Proof: `https://pvtkrr.layoutforge.app/manifest.json` returned 200 in ~0.3s with
  bootstrap name `PVTKRR` and no personal hostname in the body;
  `https://www.pvtkrrx.cc/manifest.json` unchanged and clean of `kepners.co.uk`.
- Repo updates: CLAUDE.md hostname lock + topology table, this file's surface
  table, and the default manifest URLs in `scripts/audit-sports-posters.js`,
  `scripts/audit-sports-artwork.js`, `scripts/probe-sports-item.js`.
- Owner action required: any Stremio install on a phone/TV that was added via
  `pvt.kepners.co.uk` must be reinstalled from
  `https://pvtkrr.layoutforge.app/selfhost/manifest.json?mode=hosted` (old
  manifest URLs in already-installed clients keep pointing at the dead hostname).
- Historical dated entries below intentionally keep the old hostname as history.

## 2026-05-25: v1.3.4 playback/poster release

- Scope: durable `main` release for the public Coolify surface, native Contabo
  self-host runtime, and Windows desktop release artifacts. No DNS/Caddy routing
  change was made.
- Source state:
  - Release commit `f3a2b7da7f4bb09957ae5d74215c5cbab9d8f11f` was pushed to
    `Kepners/pvtkrrx` `main`.
  - Package version and release index now point at `1.3.4`.
- Product fixes:
  - qBit-ready `/file/` streams are preserved as the first playable option.
  - When a qBit `/file/` stream came from a tracker torrent URL, PVTKRRX can now
    derive the original tracker handoff and add the debrid stream beside it for
    configured Premiumize/Real-Debrid/AllDebrid installs.
  - Config-route playback now keeps debrid routing on the same configured route.
  - Sports poster style readback no longer clamps an entitled `glitch` request
    to the free `ticket-stub` layout.
  - EFL Championship logo lookup was made dynamic instead of relying on one
    hard-coded case.
- Local proof before deploy:
  - PASS: `npm run smoke:debrid-routing`
  - PASS: `npm run smoke:debrid-config`
  - PASS: `npm run smoke:playback`
  - PASS: `npm run smoke:pipeline`
  - PASS: `npm run smoke:config`
  - PASS: `npm run smoke:selfhost`
  - PASS: `npm run smoke:entitlement`
  - PASS: `npm run smoke:free-tier-artwork`
  - PASS: `npm run smoke:sports-poster-render`
  - PASS: `npm run smoke:sports-artwork`
  - PASS: `npm run smoke:debrid-all`
  - PASS: `npm run smoke:guards`
  - PASS: `npm run smoke:security`
  - PASS: `npm run smoke:win-installer-path`
  - PASS: `npm run dist:win` produced `PVTKRRX Setup 1.3.4.exe`,
    `PVTKRRX 1.3.4.exe`, `latest.yml`, and the setup blockmap.
- Public Coolify proof:
  - Deployment queue row `881` finished for
    `f3a2b7da7f4bb09957ae5d74215c5cbab9d8f11f`.
  - Running public container:
    `w14jewmw5ubscrxh8zzfhq7d-170703390558`, image
    `w14jewmw5ubscrxh8zzfhq7d:f3a2b7da7f4bb09957ae5d74215c5cbab9d8f11f`.
  - Container env verified `SOURCE_COMMIT=f3a2b7da7f4bb09957ae5d74215c5cbab9d8f11f`,
    `COOLIFY_BRANCH=main`, and `PVTKRRX_HOSTED_RELAY=true`.
  - `https://www.pvtkrrx.cc/manifest.json?probe=f3a2b7d` returned bootstrap
    version `1.3.4` and locked name `PVTKRR`.
  - Live poster probe from the Contabo `/selfhost` catalog returned
    `HTTP 200 image/png`, `X-PVTKRRX-Revision=f3a2b7d...`, and
    `X-PVTKRRX-Artwork-Template=glitch`.
- Native Contabo proof:
  - Source archive SHA-256 before extraction:
    `ff9d39aec8a1b3ea7839e305cb69a7eecefd2f220ed1007a23b9748a8d76a7c4`.
  - Source backup before extraction:
    `/opt/pvtkrrx-backups/20260525T170929Z-pre-1.3.4-f3a2b7da7f4b-source.tgz`.
  - `/opt/pvtkrrx/REVISION` contains
    `f3a2b7da7f4bb09957ae5d74215c5cbab9d8f11f`; package version is `1.3.4`;
    `pvtkrrx.service` is active.
  - The stable `/selfhost` disk config was restored from local Contabo services:
    Prowlarr on loopback, qBittorrent on loopback, built-in file serving, and
    self-host admin poster entitlement for `glitch`. No debrid provider API key
    was present in server state, so debrid handoff remains enabled for token
    configs that carry a debrid key.
  - Startup warmup after restore logged qBittorrent ready with 8 torrents and
    Prowlarr ready with 8 indexers.
  - `https://www.pvtkrrx.cc/selfhost/catalog/sports/pvtkrrx-sports-basketball.json`
    returned `HTTP 200` with 12 metas; the first item was
    `NBA Playoffs: Oklahoma City Thunder vs San Antonio Spurs`.
  - The May 25 Spurs/Thunder qBit source queued, downloaded, changed to a ready
    `✅ [SERVER]` stream, and its `/selfhost/file/...` URL returned
    `HTTP 206 Partial Content`, `Content-Type: video/x-matroska`,
    `Content-Range: bytes 0-65535/12034063938`, `X-Pvtkrrx-Progress: 100`,
    and 65,536 bytes.
- Weak points:
  - `npm ci` still reports existing dependency audit findings; this release did
    not change dependency versions.
  - The restored stable `/selfhost` alias has no debrid provider because no
    debrid API key was available on the server. Existing encrypted Stremio
    token installs that include Premiumize/Real-Debrid/AllDebrid keys use the
    v1.3.4 debrid handoff code.

## 2026-05-24: Debrid torrent-file upload and poster entitlement fix deployed

- Scope: PVTKRRX public Coolify container and native `/opt/pvtkrrx` Contabo
  self-host runtime. No DNS, Caddy route, SportsMeta service, Prowlarr,
  qBittorrent credentials/state, Stripe, Mailcow, or Windows EXE assets were
  changed.
- Source state:
  - Behavior commit `3a210b95ae1d6c10379a072c35b31850cbebbcf7` was pushed to
    `Kepners/pvtkrrx` `main`.
  - Commit message: `fix debrid torrent uploads and poster entitlements`.
- Product fixes:
  - Sports/private-tracker torrent download URLs are no longer discarded for
    debrid. PVTKRRX fetches the `.torrent` server-side and uploads the torrent
    bytes to Premiumize, Real-Debrid, or AllDebrid when the provider supports
    torrent-file upload.
  - Premiumize single-file transfers now resolve playback through `file_id` and
    `/api/item/details` when `/transfer/list` has no direct `link`.
  - Free/public sports posters stay on `ticket-stub` even while the public
    Coolify env still has `PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE=broadcast`.
    Owner/admin and paid/manual-grant styles use stamped entitlement data; paid
    stamps are HMAC-signed so forged plain `?template=` URLs fall back to
    Ticket Stub.
  - Entitled poster style changes in Configure now auto-save through
    `/local-config` or `/server-config`; config load only refreshes status text.
- Local proof before deploy:
  - PASS: `node scripts/__tests__/debrid/premiumize.test.js`
  - PASS: `node scripts/__tests__/debrid/realdebrid.test.js`
  - PASS: `node scripts/__tests__/debrid/alldebrid.test.js`
  - PASS: `npm run smoke:debrid-all`
  - PASS: `node scripts/smoke-entitlement.js`
  - PASS: `node scripts/smoke-free-tier-artwork.js`
  - PASS: `node scripts/smoke-config-flow.js`
  - PASS: `node scripts/smoke-sports-artwork-layout.js`
  - PASS: `npm run smoke:playback`
  - PASS: `npm run smoke:pipeline`
  - PASS: `node scripts/smoke-selfhost-server.js`
- Public Coolify proof:
  - Deployment queue row `879` finished for commit
    `3a210b95ae1d6c10379a072c35b31850cbebbcf7`.
  - Running public container after deploy:
    `w14jewmw5ubscrxh8zzfhq7d-225652088376`, image
    `w14jewmw5ubscrxh8zzfhq7d:3a210b95ae1d6c10379a072c35b31850cbebbcf7`.
  - Container env verified `SOURCE_COMMIT=3a210b95ae1d6c10379a072c35b31850cbebbcf7`,
    `COOLIFY_BRANCH=main`, and existing
    `PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE=broadcast`.
  - `https://www.pvtkrrx.cc/health?format=json&probe=3a210b9` returned `HTTP 200`.
  - Live forged `template=glitch` and `template=broadcast` public artwork probes
    returned `HTTP 200 image/png`, `X-PVTKRRX-Revision=3a210b95...`,
    `X-PVTKRRX-Artwork-Template=ticket-stub`, and upstream SportsMeta URLs with
    `template=ticket-stub`.
- Native Contabo proof:
  - Source-only backup before extraction:
    `/opt/pvtkrrx-backups/20260524T230430Z-pre-1.3.3-3a210b9-source.tgz`,
    SHA-256 `c57e5c3914d6691a560510e833a2c60c4ea48caa03fa3ea343614a75c66ff357`.
  - Local git archive SHA-256 matched on server before extraction:
    `d00e6ab2fda8beeadda1e6af13a05dd598abe436184a3a0c4287d7e1d9cdcacb`.
  - `/opt/pvtkrrx/REVISION` contains
    `3a210b95ae1d6c10379a072c35b31850cbebbcf7`.
  - `pvtkrrx.service` restarted and verified `active`; package version is
    `1.3.3`; startup logs show qBittorrent and Prowlarr warmup ready.
  - Native local health `http://127.0.0.1:7000/health?format=json&probe=3a210b9-native`
    returned `HTTP 200`.
  - Native public `https://pvt.kepners.co.uk/...template=broadcast...` artwork
    probe returned `HTTP 200`, `X-PVTKRRX-Revision=3a210b95...`,
    `X-PVTKRRX-Artwork-Template=ticket-stub`, and upstream SportsMeta URL with
    `template=ticket-stub`.
- Weak points:
  - The live proof covers the debrid upload code path through local mocks, not a
    real Premiumize/Real-Debrid/AllDebrid account transfer.
  - Paid/manual-grant poster stamping is proven locally; live public probes prove
    forged/free premium template requests are blocked.
  - Stremio clients may need a catalog refresh/reinstall to pick up newly saved
    poster/debrid config.

## 2026-05-23: Sports poster logo/routing fixes deployed live

- Scope: public PVTKRRX Coolify container for `https://www.pvtkrrx.cc` sports
  artwork/catalog routing. No DNS, Caddy route, SportsMeta service, Stripe,
  Prowlarr, qBittorrent, or Windows EXE release was changed.
- Source state:
  - `main` now points to `e3a41dffe010c9e4369b37866d76c9f9f6ad0167`.
  - Fix commits:
    - `4b82347055467668df35f25bf31e9a092cf5929d` fixed sports logo lookup and
      sport routing for reported poster cases.
    - `6513154f015caecbd22d837488fa965b9ada17b2` bumped the public artwork URL
      cache version to `20260523-logo-routing-v31`.
    - `e3a41dffe010c9e4369b37866d76c9f9f6ad0167` bumped the server-side render
      cache key to the same `20260523-logo-routing-v31`.
- Product change:
  - Real league/team logo lookup now covers the reported Darts/PDC, UFC,
    Formula 1, NFL/UFL, basketball, cricket, rugby, football, tennis, boxing,
    and cycling fallback gaps.
  - `Hull City vs Middlesbrough` is forced into football/EFL Championship
    identity rather than motorsport.
  - U.S. Open Cup soccer rows are protected from tennis routing.
  - UFC no longer uses fake red text; it uses the SportsMeta/SportsDB UFC logo.
- Deploy proof:
  - Coolify webhook deployments for the final commit finished: rows `835` and
    `836` both `finished` for commit `e3a41dffe010c9e4369b37866d76c9f9f6ad0167`.
  - Running public container:
    `w14jewmw5ubscrxh8zzfhq7d-190757571145`,
    image `w14jewmw5ubscrxh8zzfhq7d:e3a41dffe010c9e4369b37866d76c9f9f6ad0167`.
  - Container env verifies `SOURCE_COMMIT=e3a41dffe010c9e4369b37866d76c9f9f6ad0167`
    and `COOLIFY_BRANCH=main`.
  - `https://www.pvtkrrx.cc/health` returned `HTTP 200`.
  - Live Darts/PDC artwork returned `HTTP 200 image/png`,
    `X-PVTKRRX-Revision=e3a41dffe010c9e4369b37866d76c9f9f6ad0167`,
    `X-PVTKRRX-Artwork-Cache-Version=20260523-logo-routing-v31`,
    `X-PVTKRRX-Artwork-Render-Version=20260523-logo-routing-v31`,
    `X-PVTKRRX-Logo-Real-Count=2`, `X-PVTKRRX-Logo-Fallback-Count=0`,
    and real logo source `https://r2.thesportsdb.com/images/media/league/logo/mnkcyf1555604592.png`.
  - Live UFC artwork returned the same final revision/cache headers with real
    UFC logo source `https://r2.thesportsdb.com/images/media/league/logo/1gp4vo1722604906.png`.
  - Live Hull City vs Middlesbrough football artwork returned the final
    revision/cache headers and real team logo sources for Hull City and
    Middlesbrough.
- Weak points:
  - Public Coolify currently has `PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE=broadcast`,
    so live public artwork requests render as `broadcast` even when a request asks
    for `ticket-stub`. This was an existing environment setting and was not
    changed in this deploy.
  - The shared logo lookup path is fixed, but a full visual proof across every
    paid/member template (`editorial`, `broadcast`, `sportsbook`,
    `trading-card`, `brutalist`, `ticket-stub`, `glitch`) was not run against
    the live member-entitled surface in this deploy.
  - Stremio clients may still need a catalog refresh/restart to pick up the new
    `v=20260523-logo-routing-v31` artwork URLs.

## 2026-05-18: Stremio retest issues queued for full review

- User retested `1.2.1` in Stremio/qBittorrent and asked to record issues for tomorrow rather than investigate immediately.
- Captured handover: `.claude/sessions/2026-05-18_stremio-regression-review-handover.md`.
- Issues recorded:
  - Sports poster style selector shows `Brutalist`, but Stremio artwork still appears to use the old ticket-stub/broadcast style.
  - Stream/source selection panel has a large delay and shows skeleton rows.
  - Player view has no useful PVTKRR loading/download data.
  - qBittorrent appears to download scattered pieces rather than the start first.
  - A torrent near full download still does not play.
  - Need PVTKRR-side structured logs/diagnostic UI.
  - Need research Stremio Desktop/Android TV developer or debug logging options.
- Do not claim a root cause yet. Tomorrow's first step is evidence capture: route token, exact torrent hash/title, qBit flags/piece states, `/playback` and `/file` statuses, artwork URL/template/cache keys, and route timing logs.

## 2026-05-17: Main branch and Coolify auto-deploy restored for 1.1.70

- Scope: unify the live public Coolify branch back onto GitHub `main`, restore Coolify auto-deploy, and issue the next app-aligned release revision for hosted/cloud plus Windows desktop testing.
- Coolify control-plane state changed:
  - App id `9`, uuid `w14jewmw5ubscrxh8zzfhq7d`, now has `git_branch=main`.
  - `application_settings.is_auto_deploy_enabled=true`.
  - Verified directly in the Coolify DB after the update.
- Release target:
  - App/package version bumped to `1.1.70`.
  - `main` must include the current live sports/parser/artwork fixes from `integrate/sportcult-category-contract` plus the existing `1.1.69` playback release-line work.
  - Windows EXE artifacts must be rebuilt for `1.1.70` before calling this revision complete.
- Acceptance bar before closing:
  - `origin/main` points at the final `1.1.70` release commit.
  - Coolify builds and serves that same commit on `https://www.pvtkrrx.cc`.
  - GitHub releases/tags `v1.1.70` and `v1.1.70-selfhost` resolve to the same commit.
  - The desktop release has setup/portable EXE assets for `1.1.70`.
  - Live manifest/version/artwork probes prove the public container is not still serving the old feature-branch image.

## 2026-05-16: Partial Playback Buffer Handoff Hotfix Deployed

- Scope: repair Stremio playback startup for partially downloaded qBittorrent files. This changed both active PVTKRRX server surfaces: the native `/opt/pvtkrrx` `pvtkrrx.service` runtime used by `pvt.kepners.co.uk` and `/selfhost/*`, and the public Coolify container for `www.pvtkrrx.cc`. It did not change DNS, Caddy route files, qBittorrent credentials, Prowlarr credentials/indexers, SportsMeta, Stripe, Mailcow, or download paths.
- Root cause: `/playback` could redirect Stremio into `/file` once qBittorrent exposed the selected file path, even when qBit had downloaded scattered pieces rather than a contiguous playable head buffer. The old readiness estimate used progress percent, which can be misleading for progressive playback.
- Fix shipped:
  - `/playback` redirects an incomplete torrent to `/file` once the file exists locally and the URL targets the built-in `/file` route; the actual byte-readability proof is enforced inside `/file` via the contiguous piece-window check (425 vs 206). [Correction 2026-06-12: the original note here claimed a `state.ready === true` gate on the redirect itself — in the shipped code `state.ready` only feeds logging/labels; the fail-closed guarantee lives in `/file`.]
  - `loadTorrentPlaybackState` now computes contiguous readable bytes from qBittorrent `properties().piece_size`, file `piece_range`, and `pieceStates()`; if qBit cannot prove the contiguous head pieces for an incomplete local file, playback fails closed and waits.
  - `/file` now sets media-friendly `Accept-Ranges: bytes`, `Cache-Control: no-store`, and `Connection: keep-alive` headers before serving.
- Release-line/self-host deploy:
  - `main` hotfix commit: `b5b4b748611e343aa89e2ae6b3c3ae66a083e244` (`Harden playback buffer readiness proof`), cherry-picked on top of `1.1.69`.
  - `/opt/pvtkrrx/REVISION` now records `b5b4b748611e343aa89e2ae6b3c3ae66a083e244`.
  - Backup: `/opt/pvtkrrx-backups/20260517-004715-playback-buffer-b5b4b74/pvtkrrx-code-pre-b5b4b74.tar`.
  - `pvtkrrx.service` restarted and returned `active/running`.
- Public Coolify deploy:
  - Existing Coolify branch remains `integrate/sportcult-category-contract`.
  - Deployment queue row `733` finished for `ab5caa61f8b756685732d9bf855d18bf2c34f81b`.
  - Running container: `w14jewmw5ubscrxh8zzfhq7d-225009626040`.
  - Running image: `w14jewmw5ubscrxh8zzfhq7d:ab5caa61f8b756685732d9bf855d18bf2c34f81b`.
  - Container env: `SOURCE_COMMIT=ab5caa61f8b756685732d9bf855d18bf2c34f81b`, `COOLIFY_BRANCH=integrate/sportcult-category-contract`.
- Proof:
  - Feature branch `ab5caa61f8b756685732d9bf855d18bf2c34f81b`: `npm run smoke:playback` and `npm run smoke:pipeline` passed.
  - Clean release-line hotfix worktree `b5b4b748611e343aa89e2ae6b3c3ae66a083e244`: `npm run smoke:playback`, `npm run smoke:pipeline`, and `npm run smoke:selfhost` passed with package version `1.1.69`.
  - Remote `/opt/pvtkrrx` playback smoke passed with `./.node/node-v22.14.0-linux-x64/bin/node scripts/smoke-playback-route.js`.
  - `https://pvt.kepners.co.uk/health`, local `http://127.0.0.1:7000/health`, and `https://www.pvtkrrx.cc/health` returned healthy responses after deploy.
  - `https://pvt.kepners.co.uk/version-status.json` returned `currentVersion=1.1.69`, `latestVersion=1.1.69`, `updateAvailable=false`.
  - Code grep confirmed both live surfaces contain the `pieceVerifiedReadableBytes` logic, incomplete-torrent `state.ready !== true` guard, and `Accept-Ranges` headers.
- Weak points:
  - No real Stremio client playback test was run against an actively partial torrent after deployment.
  - The public Coolify container still reports package version `1.1.68` from the feature branch, so `https://www.pvtkrrx.cc/version-status.json` still says update available to `1.1.69`.
  - The branch split remains unresolved: public Coolify tracks `integrate/sportcult-category-contract`, while `/opt/pvtkrrx` is deliberately on a `1.1.69` main hotfix to avoid downgrading the self-host server.

## 2026-05-15: Coolify sharp/libvips Dockerfile fix proven, not deployed

- Scope: public Coolify Docker build path only. Production still runs on the cached recovery image `w14jewmw5ubscrxh8zzfhq7d:e43a9fe4363850108db3c17e5a7658b35afc3d50` via `pvtkrrx-recovery`; this follow-up did not move public traffic to a fresh Coolify image.
- Root cause proof: the crashed fresh image `w14jewmw5ubscrxh8zzfhq7d:540e9fa017e15d2de55ff866a0883acb07bdf98f` is missing `@img/sharp-libvips-linux-x64` while the healthy recovery image has it.
- Fix staged in repo: Dockerfile now installs production dependencies with `npm ci --omit=dev --include=optional`, rebuilds `sharp`, asserts the linux-x64 sharp/libvips packages and `libvips-cpp.so*` exist, then runs a build-time `require('sharp')` probe.
- Proof captured:
  - Local `docker build --no-cache --progress=plain -t pvtkrrx-sharp-proof:local .` passed with `sharp ok 0.34.5 8.17.3`.
  - Local throwaway container served `/manifest.json` with `HTTP 200` and reported `{"sharp":"0.34.5","vips":"8.17.3"}`.
  - Contabo throwaway build from `main` plus only the patched Dockerfile also passed with `sharp ok 0.34.5 8.17.3`.
  - Contabo throwaway container served `http://127.0.0.1:13080/manifest.json` with `HTTP 200` and reported the same sharp/vips versions.
  - Throwaway Contabo container/image and `/tmp/pvtkrrx-sharp-proof` were removed after proof.
- Current production guardrail: Coolify auto-deploy remains disabled. Do not re-enable it until a controlled Coolify deployment of this hardened Dockerfile boots and live routes are rechecked.

## Live Topology (verified 2026-05-16)

There are currently two PVTKRRX server surfaces on Contabo. Keep them separate when proving or deploying fixes:

| Surface | Where | Watches |
|---|---|---|
| `https://www.pvtkrrx.cc` except `/selfhost/*` | Coolify Docker container `w14jewmw5ubscrxh8zzfhq7d-...`, bound to internal `pvtkrrx:3000`, fronted by Caddy reverse_proxy | GitHub `Kepners/pvtkrrx` branch `main` as of the 2026-05-17 branch unification |
| `https://www.pvtkrrx.cc/selfhost/*`, `https://pvtkrrx.cc/selfhost/*`, and `https://pvtkrr.layoutforge.app/*` (replaced `pvt.kepners.co.uk` on 2026-06-12 — domain no longer owned) | Native systemd `pvtkrrx.service`, working directory `/opt/pvtkrrx`, port `7000`, fronted by Caddy `host.docker.internal:7000` | Manual tarball/rsync-style deploy into `/opt/pvtkrrx`, currently on `main` hotfix commit `b5b4b748611e343aa89e2ae6b3c3ae66a083e244` |
| `https://sportsmeta.pvtkrrx.cc` | systemd `sportsmeta.service` (no Docker, no Coolify), source at `/opt/sportsmeta/app` | manual rsync deploy |

Do not use the public Coolify container as proof that the self-host playback route changed, and do not use `/opt/pvtkrrx` proof as proof that the normal public website changed. The 2026-05-16 playback fix was intentionally deployed to both surfaces.

## Bootstrap Manifest Lock - 2026-05-09

Root `/manifest.json` is the configure-first bootstrap entry only. It intentionally exposes no catalogs, streams, resources, or addon types; configured PC Local, LAN Bridge, Remote Seedbox, and self-host route manifests are the install surfaces that expose real catalog/stream behavior.

Stremio-visible bootstrap copy is locked for update stability:
- `name`: `PVTKRR`
- public guide/bootstrap `description`: `Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Use the Windows host or your self-host server, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`

Do not rename this manifest to `PVTKRR Setup`, `PVTKRR Server Setup`, `PVTKRR Desktop Setup`, or any route/version/marketing suffix during version bumps, release-index refreshes, installer updates, or manifest refactors — the name `PVTKRR` applies to every bootstrap mode (guide, default, self-host, desktop). The locked values live in `src/config/manifest.js` as `PUBLIC_BOOTSTRAP_MANIFEST_NAME` and `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION` (both exported as non-enumerable manifest properties). Self-host and desktop modes carry mode-specific descriptions referencing `configureUrl` — that copy is outside the lock, but the **name** still pins to `PVTKRR`. `npm run smoke:config` and `npm run smoke:selfhost` import those constants and assert equality against every served bootstrap manifest; either smoke fails if any bootstrap drifts. If amending either string, touch the constants in `src/config/manifest.js`, the CLAUDE.md lock section, this BRAIN.md entry, and AGENTS.md in the same commit.

To deploy code to real users:
1. Push to `Kepners/pvtkrrx` branch `main`.
2. Coolify auto-deploy is enabled for this app. A `main` push should queue a webhook deployment automatically; the UI/API/artisan dispatch path below remains the manual fallback.
3. Wait for the new container (`docker ps --format '{{.Names}}\t{{.Image}}'` should show the new SHA in the image tag).
4. Bust any downstream caches (PVTKRRX raster cache + Caddy `Cache-Control: max-age` window).

### GitHub webhook → Coolify auto-deploy (set up 2026-04-30)

GitHub repository webhook is now wired to Coolify so pushes to `main` auto-deploy. No manual `php artisan tinker` dispatch needed for normal pushes.

| Field | Value |
|---|---|
| GitHub repo settings | `Kepners/pvtkrrx` → Settings → Webhooks |
| Payload URL | `https://coolify.buildsales.homes/webhooks/source/github/events/manual` |
| Content type | `application/json` |
| Secret | stored in Coolify DB only — `applications.manual_webhook_secret_github` for app id 9 (uuid `w14jewmw5ubscrxh8zzfhq7d`). Do not commit the value. |
| SSL verification | enabled |
| Events | Just the `push` event |
| Active | true |

How it works:
1. `git push origin main` → GitHub fires a `push` webhook to the Payload URL.
2. Coolify (`POST /webhooks/source/github/events/manual`) verifies the signature against the per-app `manual_webhook_secret_github`, finds app id 9 by repository URL, queues an `ApplicationDeploymentQueue` row, dispatches `App\Jobs\ApplicationDeploymentJob`.
3. Container rebuild proceeds the same way as a manual deploy.

To verify after a push:
```bash
ssh contabo 'docker logs coolify --since 2m 2>&1 | grep -iE "webhook|deploy|pvtkrrx" | tail'
ssh contabo 'docker exec coolify-db psql -U coolify -c "SELECT id, application_id, status, is_webhook, commit, created_at FROM application_deployment_queues WHERE application_id = 9 ORDER BY id DESC LIMIT 3;"'
```

If a push fails to trigger:
1. GitHub repo → Settings → Webhooks → the webhook → Recent Deliveries — look for red X, click for response body.
2. Check signature mismatch (most common cause): if Coolify returns 401/403 it usually means the secret in GitHub doesn't match `manual_webhook_secret_github` in the Coolify DB.
3. The `coolify-buildsales` GitHub App (installation id `116123960`) is also installed at the account level. If both the App and the manual webhook are firing for `Kepners/pvtkrrx`, Coolify deduplicates by deployment id but you may see two queue entries; that's harmless.

**Programmatic Coolify deploy dispatch** (manual fallback, used before the webhook was wired):
```bash
ssh contabo 'docker exec coolify php artisan tinker --execute="
\$app = \App\Models\Application::where(\"uuid\", \"w14jewmw5ubscrxh8zzfhq7d\")->first();
\$srv = \$app->destination->server;
\$queued = \App\Models\ApplicationDeploymentQueue::create([
  \"application_id\" => \$app->id,
  \"server_id\" => \$srv->id,
  \"destination_id\" => \$app->destination->id,
  \"deployment_uuid\" => (string)\Illuminate\Support\Str::uuid(),
  \"pull_request_id\" => 0,
  \"force_rebuild\" => false,
  \"commit\" => \"HEAD\",
  \"status\" => \"queued\",
  \"is_webhook\" => false,
  \"is_api\" => true,
  \"restart_only\" => false,
  \"application_name\" => \"kepners/pvtkrrx:main-w14jewmw5ubscrxh8zzfhq7d\",
]);
\App\Jobs\ApplicationDeploymentJob::dispatch(application_deployment_queue_id: \$queued->id);
"'
```

**Critical**: always set `application_name` when creating a queue row by hand. The Windows Coolify deploy watcher (`contabo-infra/scripts/13-watch-coolify-deploy-failures.ps1`) used to throw `Cannot bind argument to parameter 'ApplicationName' because it is an empty string` on null/empty rows; that's been patched on 2026-04-30 to tolerate it (commit `983b5ca` in `contabo-infra-notes`), but it's still much cleaner not to leave NULL rows in `application_deployment_queues`.

## Sports Posters Template Memory

- Canonical design source: `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates`.
- Do not invent a new poster style when working on Sports Posters. Copy/port the Python template geometry, hierarchy, and intent first.
- Active template family:
  - `01-editorial`
  - `02-broadcast`
  - `03-sportsbook`
  - `04-trading-card`
  - `05-brutalist`
  - `06-ticket-stub`
  - `07-glitch`
- `06-ticket-stub` is the free/default poster layout.
- Member Sports Posters can use all seven templates.
- Logo priority: SportsMeta/SportsDB league logo, home badge, and away badge first; sport-specific glyph fallback only when the DB image is missing.
- If a sport/league/team repeatedly falls back to glyphs, log it as DB enrichment work rather than redesigning the poster.

## PASS 5 Local Proof Note - Free-Tier Sports Artwork Repair 2026-05-05

PASS 5 has local proof but is not committed or deployed yet. Do not claim the live Coolify image is fixed until this dirty tree is committed, pushed, deployed, and live routes are reprobed.

What PASS 5 fixes locally:
- PASS 4 hard failure: a configured token with `sportsPosterTemplate=glitch` emitted `posterTemplate=glitch` and `layoutFamily=GLITCH`.
- Required rule: PVTKRRX configured/free sports artwork has exactly one included style, `ticket-stub`.
- Requested non-ticket templates (`glitch`, `broadcast`, `sportsbook`, `editorial`, `trading-card`, `brutalist`) normalize to `ticket-stub` until PVTKRRX has an explicit paid entitlement gate and proof.
- Text/glyph fallback remains emergency-only for missing/broken artwork/logo data, not a free product tier.

Local proof captured:
- `npm run smoke:free-tier-artwork` proves default/free aliasing, configured non-ticket normalization, configured meta output, locked configure UI, and stale-copy checks for the named surfaces.
- Configured route repros for `sportsPosterTemplate=glitch` and `sportsPosterTemplate=broadcast` both emitted `posterTemplate=ticket-stub` and `layoutFamily=TICKET_STUB`; the poster route returned `image/png`, 600x900, non-zero bytes.
- PASS 5 route/security smokes passed locally. `npm test`, `npm run lint`, and `npm run build` are not available scripts.

Remaining caveats:
- No PASS 5 commit or deploy has been made.
- Existing live/selfhost poster audit still reported two live poster text failures and samples the currently deployed target, not this local repaired tree.
- Other historical SportsMeta planning docs may still contain old SVG/free-tier wording; PASS 5 only repaired the named PVTKRRX/public surfaces.

## Dual-Deploy 502 Repeat — 2026-08-27

The 2026-08-14 failure mode happened again on 2026-08-27 ~22:28 UTC: a feature-branch
push (webhook has no branch filter) and a `main` push a few minutes later queued two
deploys whose container-removal phases overlapped, leaving zero pvtkrrx containers and
public 502. Reminder the hard way: the one-push-at-a-time rule counts EVERY ref —
a branch push alone queues a deploy of `main`, so a branch push followed by a merge
push within one deploy window (~3 min) is still two parallel deploys. Recovery used
here: one fresh `main` push (this commit) to fire a single clean deploy, per the
documented webhook-redelivery recovery.
## 2026-08-28: Debrid failure now hands the same click to qBittorrent

- Root cause proven live with `The Secret of Skinwalker Ranch` S07E05: search returned 22 rows, but a debrid click ended after Real-Debrid returned HTTP 451. The qBittorrent row underneath was never invoked.
- The debrid row now retains its original signed qBittorrent playback token. If every debrid provider fails terminally, the request redirects internally to that exact qBittorrent item. A provider that is still downloading keeps its retry response; completed `/file/` rows never become add fallbacks.
- The fallback is bound to the PVTKRR configuration that created it and is rejected under a different configuration or the unscoped compatibility route.
- Premiumize was removed from Matt's live PVTKRR cache settings and plex-debrid credentials. The obsolete Premiumize rescue timer was disabled. Backups were retained.
- Local proof: `smoke:debrid-all`, `smoke:pipeline`, `smoke:security`, and `smoke:config` all pass.
- Live proof on native revision `a69ec42`: S07E05 returned RD HTTP 451, logged `all providers failed -> qbit`, downloaded the exact EDITH 1080p release to `/opt/pvtkrrx/downloads`, copied and size-verified it on Google Drive, retained the qBit seed for 7 days, and refreshed Plex. Plex indexed `Home Sweet Homestead` as S07E05 and returned HTTP 206 video bytes from the Drive copy.
