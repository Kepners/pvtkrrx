# PVTKRRX Brain

## 2026-05-16: Partial Playback Buffer Handoff Hotfix Deployed

- Scope: repair Stremio playback startup for partially downloaded qBittorrent files. This changed both active PVTKRRX server surfaces: the native `/opt/pvtkrrx` `pvtkrrx.service` runtime used by `pvt.kepners.co.uk` and `/selfhost/*`, and the public Coolify container for `www.pvtkrrx.cc`. It did not change DNS, Caddy route files, qBittorrent credentials, Prowlarr credentials/indexers, SportsMeta, Stripe, Mailcow, or download paths.
- Root cause: `/playback` could redirect Stremio into `/file` once qBittorrent exposed the selected file path, even when qBit had downloaded scattered pieces rather than a contiguous playable head buffer. The old readiness estimate used progress percent, which can be misleading for progressive playback.
- Fix shipped:
  - `/playback` now requires `state.ready === true` before redirecting an incomplete torrent to `/file`.
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
| `https://www.pvtkrrx.cc` except `/selfhost/*` | Coolify Docker container `w14jewmw5ubscrxh8zzfhq7d-...`, bound to internal `pvtkrrx:3000`, fronted by Caddy reverse_proxy | GitHub `Kepners/pvtkrrx` branch `integrate/sportcult-category-contract` as of the 2026-05-16 playback deploy |
| `https://www.pvtkrrx.cc/selfhost/*`, `https://pvtkrrx.cc/selfhost/*`, and `https://pvt.kepners.co.uk/*` | Native systemd `pvtkrrx.service`, working directory `/opt/pvtkrrx`, port `7000`, fronted by Caddy `host.docker.internal:7000` | Manual tarball/rsync-style deploy into `/opt/pvtkrrx`, currently on `main` hotfix commit `b5b4b748611e343aa89e2ae6b3c3ae66a083e244` |
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
2. Coolify auto-detects the new SHA but does **not** auto-deploy from a webhook — it only auto-deploys via its UI / API / artisan dispatch path. Trigger via the UI at `https://coolify.buildsales.homes`, or programmatically via the artisan tinker pattern documented below.
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
