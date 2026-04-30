# PVTKRRX Brain

## Live Topology (verified 2026-04-30)

**There is exactly one PVTKRRX runtime serving real users**: the Coolify Docker container. The systemd `pvtkrrx.service` that used to coexist on `/opt/pvtkrrx` has been stopped + disabled + masked on 2026-04-30 because it was a redundant second runtime that real users never hit. Do not bring it back without explicit need.

| Surface | Where | Watches |
|---|---|---|
| `https://www.pvtkrrx.cc` | Coolify Docker container `w14jewmw5ubscrxh8zzfhq7d-...` (image tag = git SHA on `main`), bound to internal `pvtkrrx:3000`, fronted by Caddy reverse_proxy | GitHub `Kepners/pvtkrrx` branch `main` |
| `https://sportsmeta.pvtkrrx.cc` | systemd `sportsmeta.service` (no Docker, no Coolify), source at `/opt/sportsmeta/app` | manual rsync deploy |

`/opt/pvtkrrx/` on the box still exists, but as a **shared resource directory** (Node binary used by `sportsmeta.service` + bind-mount points for the Coolify container). It is no longer a standalone runtime. See `/opt/pvtkrrx/README-OPS.md` on the box for the full breakdown.

To deploy code to real users:
1. Push to `Kepners/pvtkrrx` branch `main`.
2. Coolify auto-detects the new SHA but does **not** auto-deploy from a webhook — it only auto-deploys via its UI / API / artisan dispatch path. Trigger via the UI at `https://coolify.buildsales.homes`, or programmatically via the artisan tinker pattern documented below.
3. Wait for the new container (`docker ps --format '{{.Names}}\t{{.Image}}'` should show the new SHA in the image tag).
4. Bust any downstream caches (PVTKRRX raster cache + Caddy `Cache-Control: max-age` window).

**Programmatic Coolify deploy dispatch** (used in this session):
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
