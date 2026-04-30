# PVTKRRX + SportsMeta — Combined Architecture

Updated: 2026-04-30

This is the cross-service map. PVTKRRX-only architecture lives in `ARCHITECTURE.md`. SportsMeta-only architecture lives in `sportsmeta/ARCHITECTURE.md` (in the sister repo).

## TL;DR

Two services, two repos, two deploy paths, one Stremio experience:

- **PVTKRRX** is the Stremio-facing **stream** addon. It owns install routes, catalogs, `/file`, `/playback`, qBittorrent + Prowlarr integration. Public host: `https://www.pvtkrrx.cc`.
- **SportsMeta** is the sports **identity + artwork** service. It owns canonical `sportsmeta:` ids, the SQLite DB, asset cache, member tokens, and Stripe billing. Public host: `https://sportsmeta.pvtkrrx.cc`.

Both run on the same Contabo VPS (`94.72.97.251`) but are completely separate processes, separately deployed, with different runtime owners.

## Edge + runtime topology

```
                       Internet
                          |
                          v
                    +-----------+
                    |   Caddy   |   container: caddy:2-alpine, ports 80/443
                    +-----+-----+
                          |
        +-----------------+-----------------+--------------------+
        |                                   |                    |
        v                                   v                    v
www.pvtkrrx.cc / pvtkrrx.cc       sportsmeta.pvtkrrx.cc      mail.* etc.
        |                                   |
        | reverse_proxy pvtkrrx:3000        | reverse_proxy host.docker.internal:3210
        v                                   v
+----------------------+            +-----------------------+
| Coolify-managed      |            | systemd unit          |
| Docker container     |            | sportsmeta.service    |
| w14jewmw5...:<sha>   |            | /opt/sportsmeta/app   |
| watches GitHub main  |            | source synced via SSH |
| Image rebuilds on    |            | restart on systemctl  |
| deploy dispatch      |            | restart only          |
+----------+-----------+            +----------+------------+
           |                                    |
           v                                    v
   /opt/pvtkrrx (host)                /opt/sportsmeta (host)
   - .node/ (shared Node binary,      - data/db/sportsmeta.sqlite
     sportsmeta.service uses it)     - data/assets/cache/
   - runtime/ bind-mounted into       - backups/
     the Coolify container at        - .env
     /root/.local/share/PVTKRRX/
   - backdrops/python-backdrops/
     bind-mounted into the container
```

`pvtkrrx.service` (systemd) used to coexist as a second PVTKRRX runtime on `/opt/pvtkrrx` port 7000. **It was stopped, disabled, and masked on 2026-04-30.** Real users never hit it; only the Coolify container is reachable from Caddy. `/opt/pvtkrrx/` survives only as a shared resource directory (Node binary, runtime bind-mount, backdrops). See `/opt/pvtkrrx/README-OPS.md` on the box.

## Service ownership matrix

| Concern | PVTKRRX | SportsMeta |
|---|---|---|
| Stremio manifest, addon SDK | ✅ | ✅ (separate addon, separate manifest) |
| Catalogs (movies, TV, library, sports list) | ✅ | sport catalogs only |
| Stream resolution + playback | ✅ | ❌ |
| `/file`, `/playback`, qBit, Prowlarr | ✅ | ❌ |
| Canonical `sportsmeta:event:…` ids | reads | ✅ owns |
| Sports DB (SQLite, ~21k events, ~118k assets) | ❌ | ✅ |
| Sports artwork generation (poster + background) | local fallback only (`renderSportsPosterTemplateSvg`) | ✅ primary (`centralArtwork.js` + `defaultSvg.js`) |
| Member tokens / Stripe billing | ❌ | ✅ |
| 4K sport backdrops | ✅ owns the JPEGs | references via SportsMeta if needed |
| LAN bridge / desktop heartbeat / pair store | ✅ | ❌ |
| Stremio account linking | ✅ | ❌ |

PVTKRRX **never** invents sports identity or premium artwork. SportsMeta **never** does stream resolution or playback. Cross-talk is via HTTP only — they share a host but not a database or runtime.

## Sports artwork pipeline (the live path)

This is the bit most often touched. End-to-end for a sports poster shown in a Stremio tile:

```
Stremio client
   |
   | GET /catalog/movie/pvtkrrx-sports-football.json
   v
PVTKRRX catalog handler (handlers/catalog.js)
   |
   | per item: build poster URL = https://www.pvtkrrx.cc/sports-artwork/...png?...&template=broadcast
   v
PVTKRRX poster URL is in meta.poster
   |
   | Stremio fetches the PNG
   v
PVTKRRX /sports-artwork handler (handlers/sportsArtworkProxy.js)
   |
   | 1. Build SportsMeta upstream URL
   |    - canonical event id known? hit /asset/poster/<id>?template=broadcast
   |    - else (default fallback)? hit /asset/default/poster/<sport>?…&template=broadcast
   v
SportsMeta server (src/server.js → centralArtwork.js / defaultSvg.js)
   |
   | template=broadcast → renderBroadcastPoster (sport-keyed gradient + pattern + pill + Inter title)
   | else default → renderDefaultSvg (sport-family system, also pill + Inter)
   v
PVTKRRX receives SVG with X-SportsMeta-Generated-Asset: true
   |
   | If the upstream SVG signals "generated", PVTKRRX rasterizes locally via
   | renderTemplateFallbackArtwork → renderSportsPosterTemplateSvg → sharp PNG.
   | The local renderer ships an identical broadcast design so the result
   | matches whether the SVG came from upstream or local fallback.
   v
PNG bytes → Stremio tile.
```

Both renderers — SportsMeta's `centralArtwork.js → renderBroadcastPoster` (`src/centralArtwork.js` after commit `bf86c66`) and PVTKRRX's `sportsPosterTemplates.js → renderBroadcast` (after commit `ed2dc53`) — emit the same `data-layout-style="sportsmeta-default-poster"` SVG shape. Auditors check for these markers:

- `viewBox="0 0 600 900"`
- `data-layout-family="BROADCAST"`
- `data-role="inner-border"` rx=28
- `data-role="accent-top"` + `data-role="accent-bottom"`
- `data-role="pill-badge"` rx=17
- `data-role="broadcast-title"` Inter 800 (matchup → HOME / VS / AWAY split)
- `data-role="broadcast-subtitle"`
- `data-role="broadcast-wordmark"`:
  - SportsMeta-served → `SPORTSMETA · BROADCAST`
  - PVTKRRX-rendered local fallback → `PVTKRRX · BROADCAST`

## Cache layers and how to bust them

The same poster URL hits up to four caches before it reaches a Stremio client. From upstream to client:

1. **SportsMeta SQLite** — table `sportsmeta_assets` at `/opt/sportsmeta/data/db/sportsmeta.sqlite`, column `source_url` carries the canonical generated URL, column `file_path` points at the on-disk SVG/PNG. **Bust pattern (broadcast only)**: `DELETE FROM sportsmeta_assets WHERE source_url LIKE '%/broadcast/%'` plus `fs.unlinkSync(file_path)` for each row. Use the `node:sqlite` API on the SportsMeta box (`better-sqlite3` is not installed).
2. **PVTKRRX raster cache** — file pairs (`.bin` raster bytes + `.json` metadata) under `/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` (~272MB, primary) and `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/` (~1.2MB, secondary). Each `.json` carries `selectedTemplate`. **Bust pattern (broadcast only)**: filter by `selectedTemplate === 'broadcast'`, unlink both `.bin` and `.json`. Empty `selectedTemplate` rows exist in legacy entries; for a complete bust, nuke the directories and `systemctl restart pvtkrrx.service` to clear the in-memory `rasterCache` Map. The Coolify Docker container has its own ephemeral cache that resets on rebuild.
3. **Caddy edge** — `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000` is set by PVTKRRX. After busting upstream, real users still see old bytes for ~24h unless they bust their own browser cache or you add a cache-buster query.
4. **Stremio client** — Stremio caches metas/posters in its own SQLite. `cacheMaxAge` on the manifest controls re-query frequency.

## Deployment paths

### PVTKRRX

1. Push to `Kepners/pvtkrrx` branch `main`.
2. Coolify does **not** auto-redeploy from the push (no GitHub webhook). Trigger manually via either:
   - Coolify UI at `https://coolify.buildsales.homes` → app `w14jewmw5ubscrxh8zzfhq7d` → Deploy.
   - Programmatic dispatch via Laravel tinker on the coolify container — see `BRAIN.md` for the exact `php artisan tinker` snippet (must include `application_name` field or the Windows watcher chokes; that's now defensively patched in `contabo-infra-notes/scripts/13-watch-coolify-deploy-failures.ps1`).
3. Wait for new container. Confirm via `docker ps --format '{{.Names}}\t{{.Image}}'`. Image tag must match the new git SHA.
4. Bust caches (PVTKRRX raster cache + SportsMeta if upstream design changed too).

### SportsMeta

1. Push to `Kepners/sportsmeta` branch `main`.
2. SSH into Contabo, `tar | ssh contabo …` source over, `rsync -a --delete` into `/opt/sportsmeta/app/{src,scripts}`, copy `package.json` + `package-lock.json`, write the new SHA to `/opt/sportsmeta/app/REVISION`.
3. `node --check` to validate syntax with the bundled Node binary at `/opt/pvtkrrx/.node/node-v22.14.0-linux-x64/bin/node`.
4. `systemctl restart sportsmeta.service`. Confirm `systemctl is-active sportsmeta.service` returns `active`.
5. Bust SportsMeta DB cache (see "Cache layers" above) — restart alone is not enough because cached SVGs/PNGs persist on disk.

GitHub clone-on-Contabo is **not** wired up because no auth keys are configured on the Contabo box. Source must be pushed from the developer's box.

## Failure modes and where they show up

| Symptom | Likely cause | Where to look |
|---|---|---|
| New design doesn't appear on `www.pvtkrrx.cc` | Coolify hasn't rebuilt; container still on old SHA | `docker ps … grep pvtkrrx` shows old image tag → trigger Coolify redeploy |
| Same item shows different art on tile vs detail | Stremio client cache or Caddy edge cache | Cache-busting query, or wait out `max-age` |
| Sports tile shows fake `TBA` text or ellipsis | PVTKRRX local fallback rendering an event that lost canonical resolution | Check `X-Pvtkrrx-Artwork-Source` header — `pvtkrrx-template-glyph` = local |
| Boxes instead of letters in poster text | Linux container missing the Inter font | Add Inter to the Coolify Docker image (TODO) |
| Sports artwork old after a SportsMeta deploy | SportsMeta `sportsmeta_assets` cache still serving stale rows | DB DELETE pattern under "Cache layers" |
| Coolify deploy watcher Windows toast says "lost contact" | Bad row in `application_deployment_queues` (e.g. NULL `application_name`) | Patched 2026-04-30 to tolerate it; fix at the row level too |
| `pvtkrrx.service` not running | Intentional — masked on 2026-04-30. Only the Coolify container should run | `systemctl status pvtkrrx.service` will show `masked`; do not unmask without explicit reason |

## Cross-references

- `ARCHITECTURE.md` — PVTKRRX-only architecture, route model, components, storage model
- `BRAIN.md` — live topology, deploy patterns, what changed in this session
- `docs/SPORTS-FILING-NAMING.md` — canonical id grammar, sport/league slugs, template names, file naming
- `CLAUDE.md` — the project instruction contract for agents working here
- `sportsmeta/ARCHITECTURE.md` — SportsMeta-only architecture (sister repo)
- `contabo-infra/BRAIN.md` (`/c/Users/kepne/OneDrive/Documents/@Projects/contabo-infra/BRAIN.md`) — host-level operational truth and history
