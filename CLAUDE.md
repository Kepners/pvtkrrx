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
| Version | 1.1.48 |
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

*Created: February 8, 2026 | Updated: April 25, 2026*

