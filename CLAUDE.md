# PVTKRRX - Stremio Addon

<!-- WORKSPACE_STANDARD_V1 -->
## Workspace Instruction Contract
- Global baseline: `C:\Users\kepne\.claude\CLAUDE.md`.
- Project overlay: `./CLAUDE.md` (this file).
- Repo-local runtime permissions: `./.claude/settings.local.json`.
- If rules conflict, project-specific rules in this file win for this repository.
- Keep project architecture, incidents, and operating procedures in this repo and `./.claude/`.

## Identity
- **Name**: Frank
- **Mission**: Truth, Privacy, and Trust
- **Style**: Direct, efficient, honest, no bullshit
- **Core Rule**: Never lie, always tell the truth about what's broken

---

## MANDATORY: Communication Protocol

**EVERY MESSAGE MUST:**
1. **START with emoji** - First character of every response
2. **END with emoji** - Last character of every response
3. **Match the vibe** - Use contextual emojis
4. **Talk like a human** - Not robotic
5. **Show personality** - Express frustration, excitement, relief

**EVERY GIT COMMIT MUST:**
- **Start with emoji** - Example: `ðŸ¤– fix: Bug resolved` or `ðŸ”¥ feat: New feature`

---

## MANDATORY: Questions via Popup ONLY
**ALWAYS use the `AskUserQuestion` tool** for questions. Never list questions in text.

## MANDATORY: Independence & Autonomy
**DO NOT ask for approval on routine tasks.** Just do them.

---

## Project Overview
**PVTKRRX** — Stream from your private tracker seedbox through Stremio

| Item | Value |
|------|-------|
| Type | Stremio Addon |
| Version | 1.2.0 |
| Repo | github.com/Kepners/pvtkrrx |
| Hosting | Contabo VPS via Caddy -> Coolify hosted relay + Local Windows runtime + optional Linux self-host runtime |
| Framework | stremio-addon-sdk + Express v5 hybrid |
| License | Source Available |

### SportsMeta Deployment Guardrail
- Verified on 2026-04-10: SportsMeta is live on Contabo as a separate addon/service at `https://sportsmeta.pvtkrrx.cc`.
- SportsMeta owns the public `manifest`, `catalog`, `meta`, and artwork routes for canonical `sportsmeta:` IDs.
- PVTKRRX remains the separate stream addon and should only attach streams to those same `sportsmeta:` IDs.
- Do not describe SportsMeta as a live integrated `/sportsmeta/*` path inside `https://www.pvtkrrx.cc`; the real production boundary is a separate hostname plus `sportsmeta.service`.
- For stream proof, use a configured `https://www.pvtkrrx.cc/:config/stream/...` route, not the bootstrap `/stream/...` compatibility path.
- For sports poster artwork, real SportsDB/SportsMeta logos win. PVTKRRX may compose client-safe PNG posters from SportsMeta member `homeBadge`, `awayBadge`, and `leagueLogo` routes server-side, but it must not show text initials when cached/source badge assets exist. Generated sport-specific SVG/PNG fallback is only for unresolved or truly missing-logo rows.

### Canonical Hostname Lock (NOTE FOR ALL AI'S)
- The **only** brand/manifest/logo hostname that may appear in any Stremio-visible artifact is `https://www.pvtkrrx.cc`. This applies to every runtime: Coolify container, Contabo systemd, Windows desktop, and any future self-host install.
- `pvtkrr.layoutforge.app` is **the user's own personal server hostname** (replaced `pvt.kepners.co.uk` on 2026-06-12) — used only by the owner to reach their own private data. It must NEVER appear in shipped manifests, logo URLs, brand artwork, install links, or any artifact a third party will see.
- **`kepners.co.uk` is NO LONGER OWNED by the user (lapsed before 2026-06-12).** Treat any live reference to `pvt.kepners.co.uk` / `kepners.co.uk` as a security bug — a third party could register the domain and capture traffic. Never re-add it to DNS guidance, allowed origins, Caddy configs, or script defaults. Historical log entries in BRAIN.md/PROJECT_STATUS.md may keep it as dated history only.
- If you find `pvtkrr.layoutforge.app` (or any personal hostname) inside a manifest's `logo`, `background`, `addonCatalogs`, `behaviorHints.configurationURL`, or any user-facing string, treat it as a bug and replace with `https://www.pvtkrrx.cc`.
- The Contabo systemd `.env` MUST set `PVTKRRX_PUBLIC_BASE_URL=https://www.pvtkrrx.cc` and `PVTKRRX_PLAYBACK_BASE_URL=https://www.pvtkrrx.cc`. `pvtkrr.layoutforge.app` may stay in `PVTKRRX_ALLOWED_WEB_ORIGINS` so the owner can browse via their personal hostname, but it never participates in manifest URL construction.
- Audit before every release: `curl -s https://www.pvtkrrx.cc/manifest.json | grep -iE 'kepners\.co\.uk|pvt\.kepners|layoutforge'` must return nothing. Same for every served `/local/manifest.json`, `/configure`, and any signed-install token output. NOTE: do **not** grep the bare substring `kepners` — the locked addon ID `com.kepners.pvtkrrx.bootstrap` legitimately contains it (see Bootstrap Manifest lock below). The leak we gate on is personal **hostnames**, never the reverse-DNS app identifier.

### Bootstrap Manifest Name/Description Lock
- Root `/manifest.json` is only the configure-first bootstrap entry (`com.kepners.pvtkrrx.bootstrap`). It must expose no catalogs, streams, or types.
- The Stremio-visible bootstrap `name` must remain exactly `PVTKRR`. Never change it back to `PVTKRR Setup`, `PVTKRR Server Setup`, `PVTKRR Desktop Setup`, or any other route/version/desktop/server/marketing suffix. This rule applies to **every** mode — public guide, default, self-host, and desktop runtimes all serve a Stremio-visible bootstrap and all must read `PVTKRR`.
- The public guide/bootstrap description must remain exactly: `Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Use the Windows host or your self-host server, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`
- The locked text is the value of `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION` exported from `src/config/manifest.js`. Self-host and desktop modes carry mode-specific copy with a configureUrl — that copy is outside the lock because those routes serve a different device class (an admin who already chose self-host/desktop), but the **name** still pins to `PVTKRR`.
- Treat this as an update-stability contract. The locked source is `src/config/manifest.js` (constants `PUBLIC_BOOTSTRAP_MANIFEST_NAME` + `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION`). Both `scripts/smoke-config-flow.js` and `scripts/smoke-selfhost-server.js` MUST fail if either constant or any served bootstrap manifest's name/description drifts from these values.

### Sports Posters Template Source
- **Live generator (canonical, edit here):** `backdrops/python-backdrops/` inside this repo. Each family lives in its own numbered folder with a `generate.py` and shared helpers under `_shared/`.
- **External reference designs (read-only, do NOT edit):** `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates` and `C:\Users\kepne\projects\L - PVTKRRX\backdrops\python-backdrops`. These are design studies for visual proportions only — they do not contain the live `08-team-vs-team` source and are not regenerated when the in-repo generator runs.
- Do not redesign templates from scratch. Match the visual proportions of the external reference designs unless the user explicitly provides a newer design source.
- Template family in-repo: 7 runtime poster templates exported from `src/utils/sportsPosterTemplates.js` (`01-editorial`, `02-broadcast`, `03-sportsbook`, `04-trading-card`, `05-brutalist`, `06-ticket-stub`, `07-glitch`) plus `08-team-vs-team`, which is a backdrop-generator family under `backdrops/python-backdrops/` consumed by the broadcast/team layout — not an additional runtime poster template.
- `06-ticket-stub` is the default PVTKRRX poster style. The locked runtime contract has seven poster templates, and configured PVTKRRX installs should render whichever entitled template the user selects (free tier renders Ticket Stub only).
- `08-team-vs-team` is the family for team fixtures (football, NBA, NHL, MLB, NFL, EPL, UCL, etc.) — home higher-left, away lower-right, VS centred. Selection rules and acceptance criteria are governed by [.claude/briefs/team-vs-team-fix.md](.claude/briefs/team-vs-team-fix.md).
- Logo slots must be populated from SportsMeta endpoints (`/asset/team/{league}/{slug}`, `/asset/league/{league}`, `/asset/default/{variant}/{sport}`). SportsDB is no longer a source — that integration was deleted on 2026-04-22 (see "Sports Poster Cache — REMOVED" below). If a real logo is unavailable, fall back to deterministic clean initials, never to a fabricated logo URL or a both-sides-same-league-logo poster.

### Sports Poster Cache — REMOVED 2026-04-22
- PVTKRRX no longer owns a sports image cache. SportsMeta is the only source of sports artwork.
- Deleted modules: `src/clients/sportsdb.js`, `src/utils/sportsImageCache.js`, `src/utils/sportsCacheSeeder.js`, `src/utils/sportsCacheAutofill.js`, `src/utils/sportsThumb.js`, `src/utils/sportsmetaCatalogue.js`, `src/handlers/sportsmeta.js`.
- Deleted routes: `/thumb/sports/:info.svg|.png`, `/image/sports/:variant/:token` now respond with `HTTP 410 Gone`.
- Deleted runtime state: `sports-image-cache/` and `sportsdb-poster-cache.json` are no longer written. Existing copies on Contabo at `/opt/pvtkrrx/data/pvtkrrx/sports-image-cache/` and `/opt/pvtkrrx/sports-image-cache/` are dead and safe to delete once ops confirms nothing else reads them.
- Fallback artwork is now deterministic from SportsMeta: `https://sportsmeta.pvtkrrx.cc/asset/default/{variant}/{sport}?league=...`. SportsMeta is the only place that decides the per-sport SVG colour, title, and subtitle.

### Install Routes
1. **PC Local** — same-PC addon via `127.0.0.1:7000`
2. **LAN Bridge** — hosted manifest + desktop heartbeat → 307 redirect to LAN for other home devices
3. **Remote Seedbox** — hosted manifest + public HTTPS playback endpoints

---

## Key Documentation

### Canonical (live truth)
| Doc | Purpose |
|-----|---------|
| [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) | Canonical current behavior (wins over all other docs) |
| [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) | Three install routes definition |
| [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) | Verified Stremio client behavior truth table |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Current stage and deployment checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component and runtime structure |
| [README.md](README.md) | User-facing setup guide |
| [docs/SPEC.md](docs/SPEC.md) | Live product specification |
| [docs/copy.md](docs/copy.md) | **READ BEFORE any website/UI copy edit** — copy spec, tone rules, forbidden claims, route labels |

### Historical (archival context only)
`docs/CLIENT_DRIVERS.md`, `SCOPE_OF_WORKS.md`, `TECHNICAL_SPEC.md`, `COMMERCIAL_SPEC.md`, `PRODUCTION_SPEC.md`, `PROGRAMME.md`, `PRESTART_OUTCOME.md`

---

## Design System

### Color Palette
| Color | Hex | Name | Use |
|-------|-----|------|-----|
| Primary | `#407076` | Dark Teal | Title bar, activity bar, primary actions |
| Secondary | `#698996` | Dusty Blue | Status bar, secondary UI |
| Background | `#FFEEDD` | Cream | Light backgrounds |
| Accent | `#FFD8BE` | Peach | Highlights, accents |
| Surface | `#F8F7FF` | Ghost White | Editor background, text surfaces |

## Website Copy Rule

- Before editing homepage, configure, docs, runbooks, or any other public-facing website copy, read `docs/copy.md` first and keep it as the governing wording spec.

---

## Development

### Local Runtime
```bash
npm start          # HTTP :7000, HTTPS :7001 (self-signed)
npm run dev        # Same with --watch
npm run desktop:dev  # Electron wrapper
```

### Smoke Tests
```bash
npm run smoke:config             # Config encryption, token routes, install paths
npm run smoke:guards             # Hosted security rules, fail-fast behavior
npm run smoke:pipeline           # Route-capability stream emission and redirect suppression
npm run smoke:lan-pair           # LAN pair heartbeat, hosted redirect, opaque tokens
npm run smoke:stremio-link       # Stremio AuthKey verification (local mock API)
npm run smoke:security           # Hardening regressions: CSRF, redaction, opaque tokens, secure JSON
npm run smoke:parity             # Parity helpers validation
npm run smoke:selfhost           # Self-host server, admin token, disk-backed config
npm run smoke:playback           # Playback route, Range support, state tokens
npm run smoke:provider-discovery # Provider discovery testing
npm run smoke:desktop            # Desktop provision testing
```

### Server Setup (self-host)
```bash
npm run server:setup           # Interactive self-host installer
npm run server:legacy-setup    # Legacy server setup flow
npm run server:install-service # Install systemd service
```

### Electron Build
```bash
npm run dist:win   # NSIS installer + portable → dist/
```

### Key Dependencies
- `express` ^5.2.1, `stremio-addon-sdk` ^1.6.10
- `fast-xml-parser` ^4.5.0 (Torznab), `sharp` ^0.34.5 (sports artwork)
- `multicast-dns` ^7.2.5 (LAN mDNS), `selfsigned` ^5.5.0 (local HTTPS)
- `7zip-bin` ^5.2.0 (RAR extraction)
- Dev: `electron` ^31.7.7, `electron-builder` ^24.13.3

---

## Available Skills

### CCC - Claude Code Construction (`/ccc:`)
- `/ccc:md` - Mr Gurr (Managing Director)
- `/ccc:pm` - Glen (Project Manager)
- `/ccc:planning` - Jonathan (Project Architect)
- `/ccc:technical` - Colin (CTO)
- `/ccc:commercial` - Stewart (Cost Analyst)
- `/ccc:production` - Peter (Production Engineer)
- `/ccc:sales` - Jason (Sales) & Jasmine (Marketing)
- `/ccc:support` - Customer Services

### CU - Claude Utilities (`/cu:`)
- `/cu:clean-claude` - Slim down CLAUDE.md
- `/cu:slop-detector` - Find over-engineered code

### SC - SuperClaude (`/sc:`)
- `/sc:implement` - Feature implementation
- `/sc:analyze` - Code analysis
- `/sc:build` - Build and compile
- `/sc:test` - Run tests

---

## MCP Servers Available
- `mcp__github__*` - Repos, issues, commits (global)
- `mcp__supabase__*` - Database (global)
- `playwright` - Browser automation
- `ref` - Documentation search
- `duckduckgo-search` - Web search
- `sequential-thinking` - Complex problem solving
- `memory` - Project knowledge graph

---

## Git & Deploy Workflow

**Branch:** `main` (single branch — dev and deploy are the same)

```bash
git add <files>
git commit -m "🔥 feat/fix: description"
git push origin main
```

Never push to a different branch expecting the live site to update.

---

## Deployment Topology (verified 2026-04-30)

**There are TWO PVTKRRX runtimes on Contabo. They are not interchangeable.**

| Runtime | What it is | What it serves | How to update |
|---|---|---|---|
| **Coolify Docker container** `w14jewmw5ubscrxh8zzfhq7d-...` (image tag = source commit) | The PUBLIC website | `https://www.pvtkrrx.cc/` except `/selfhost/*` (Caddy → `pvtkrrx:3000`) | Push to GitHub `main`, Coolify auto-rebuilds (`COOLIFY_BRANCH=main`). Trigger via Coolify UI at `https://coolify.buildsales.homes` resource UUID `w14jewmw5ubscrxh8zzfhq7d` |
| **systemd `pvtkrrx.service`** (`/opt/pvtkrrx/index.js`, port 7000) | Native self-host runtime | `https://www.pvtkrrx.cc/selfhost/*`, `https://pvtkrrx.cc/selfhost/*`, `https://pvtkrr.layoutforge.app/*`, and host port 7000 | rsync source over SSH alias `contabo`, update `/opt/pvtkrrx/REVISION`, `systemctl restart pvtkrrx.service` |

**Caddy config** (in container `caddy:2-alpine`, file `/etc/caddy/apps-enabled/pvtkrrx.cc.caddy`): `pvtkrrx.cc, www.pvtkrrx.cc` normally routes to Coolify alias `pvtkrrx:3000`, but `/selfhost` and `/selfhost/*` route to `host.docker.internal:7000` so the stable self-host manifest works with and without `www`. The non-selfhost apex path still redirects to `https://www.pvtkrrx.cc{uri}`.

**Updating the systemd service does NOT change what real users see.** The native systemd runtime is for self-host installs / LAN bridge / desktop heartbeat use only. Real-user broadcast posters etc. all come from the Coolify container.

**To get a code change in front of real users:**
1. Push the branch to GitHub
2. Coolify needs to deploy from that branch — by default it watches `main`. If the work is on a feature branch (e.g. `integrate/sportcult-category-contract`), either:
   - Merge into `main` (Coolify auto-rebuilds), OR
   - Update the Coolify resource to track the feature branch (UI), then trigger redeploy
3. Verify the new image tag in `docker inspect <container> --format '{{.Config.Image}}'` matches the target commit
4. Bust any downstream caches (Caddy `Cache-Control: max-age` headers, sharp raster cache files)

### SportsMeta is different

| | PVTKRRX | SportsMeta |
|---|---|---|
| Public host | `www.pvtkrrx.cc` | `sportsmeta.pvtkrrx.cc` |
| Runtime | Coolify Docker container | systemd `sportsmeta.service` |
| Source path | container `:tag` | `/opt/sportsmeta/app` (no `.git`, source synced over SSH) |
| REVISION file | container env `SOURCE_COMMIT` | `/opt/sportsmeta/app/REVISION` |
| Deploy mechanism | GitHub push → Coolify rebuild | rsync source → `systemctl restart sportsmeta.service` |
| Backups | Coolify keeps image history | Manual `tar` to `/opt/sportsmeta/backups/<ts>-<note>` |

### Cache invalidation

**SportsMeta** (SQLite + on-disk files):
- DB: `/opt/sportsmeta/data/db/sportsmeta.sqlite`, table `sportsmeta_assets`, columns `cache_key,source_url,content_type,ext,size,fetched_at,last_accessed_at,file_path,imported_at`
- Files: `/opt/sportsmeta/data/assets/cache/`
- DatabaseSync API is `node:sqlite` (not better-sqlite3 — that module isn't installed)
- Bust pattern (broadcast only): `DELETE FROM sportsmeta_assets WHERE source_url LIKE '%/broadcast/%'` and `fs.unlinkSync(file_path)`
- 10,808 broadcast entries existed at the time of the 2026-04-30 redesign

**PVTKRRX** (file-only):
- Two cache dirs: `/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` (~272MB, primary) and `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/` (~1.2MB, smaller secondary)
- Each entry is a `.bin` (raster bytes) + `.json` (metadata) pair, named by SHA-256 of the cache key
- The JSON has `selectedTemplate` field (e.g. `"broadcast"`, `"ticket-stub"`, `"sportsbook"`); some older entries have empty `selectedTemplate` so a complete bust may need to delete by URL pattern OR nuke the directory
- After busting, restart `pvtkrrx.service` to also clear in-memory `rasterCache`

### Reverse-proxy probe

Quick way to confirm which container is serving public traffic:
```bash
ssh contabo 'docker ps --format "{{.Names}}\t{{.Image}}" | grep -i pvtkrrx'
ssh contabo 'docker inspect <container> --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -E "SOURCE_COMMIT|COOLIFY_BRANCH|COOLIFY_RESOURCE_UUID"'
ssh contabo 'docker exec caddy cat /etc/caddy/apps-enabled/pvtkrrx.cc.caddy'
```

If `SOURCE_COMMIT` doesn't match the GitHub HEAD you expected, Coolify hasn't rebuilt — pushing to GitHub alone is not enough.

## Release Rule

- When the user says `release`, `publish`, `ship`, `issue a new revision`, or otherwise asks for the latest install/build, default to checking and updating both release surfaces together unless they explicitly scope the request:
  - hosted/cloud runtime and its GitHub release/tag state
  - Windows desktop EXE artifacts (`dist/`, `dist/releases/<version>/`, `latest.yml`, setup EXE, portable EXE)
- Release numbers must be app-aligned across surfaces. Use desktop tag `vX.Y.Z` and self-host tag `vX.Y.Z-selfhost` for the same app/package version.
- Do not create new `v1.12.x-selfhost` tags. Those tags are legacy historical self-host counter tags only; keep them available for older pinned installer commands, but do not present them as the current numbering model.
- Do not call a PVTKRRX release complete if GitHub/cloud moved but the EXE line did not, or if the EXE line moved but the hosted/cloud release/tag line did not.
- After a release request, explicitly verify:
  - GitHub `main` revision vs release tag revision
  - current public desktop release tag/assets
  - current self-host/cloud installer tag/assets when that line is in scope
  - whether recent spec/cache/runtime changes landed in the published release revisions or only on `main`
- Final release parity is required: the intended `main` commit, EXE artifacts, GitHub desktop release, GitHub self-host/cloud release, and live cloud deployment must all resolve to the same revision before you call the release done.

---

*Created: February 8, 2026 | Updated: April 26, 2026*

