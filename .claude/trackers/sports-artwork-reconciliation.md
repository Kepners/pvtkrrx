# Sports Artwork Reconciliation — Phase -1

Status: PASS WITH CAVEATS
Date: 2026-05-01
Author: Frank (Claude Code)
Source brief: `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md`
Plan: `docs/PVTKRRX_SPORTSMETA_ARTWORK_RECONCILED_PLAN.md`

This file separates assumed / repo-verified / live-verified, defines the product boundary, and records exact lines/snippets that prove (or fail to prove) each reconciliation claim. Implementation MUST NOT START until Phase 0 (discovery) and Phase 2 (template contract) are also done.

---

## A. Verdict

**PASS WITH CAVEATS** — proceed to Phase 0 discovery.

Boundary, ownership, cache removal, free/paid behaviour, and runtime topology are all confirmed by the repo and (for the public hosts) by live HTTPS probes. Two caveats — neither blocks discovery:

1. The repo **does** still have a PVTKRRX-side raster cache (`src/utils/sportsArtworkDiskCache.js` writing to `<runtime>/sports-artwork-raster-cache/`). This is a *different* cache from the removed TheSportsDB image cache. CLAUDE.md explicitly sanctions it. Phase 3 implementation must not collapse "no PVTKRRX sports image cache" into "no PVTKRRX raster cache" — that would delete the live cache.
2. Three audit/probe scripts still hard-code a stale default manifest URL `https://pvt.kepners.co.uk/...`. The host returned `502` on a live probe today. Implementation work that runs those scripts must override the manifest URL via env var or fix the default before relying on the output.

---

## B. Files reviewed (repo proof)

- `CLAUDE.md` (project overlay) — full read
- `README.md` — full read
- `ARCHITECTURE.md` — full read
- `docs/CURRENT_DESIGN.md` — full read (368 lines)
- `docs/ROUTE_FRAMEWORK.md` — full read (165 lines)
- `docs/STREMIO_INSTALL_TRACKER.md` — full read (147 lines)
- `docs/PROJECT_STATUS.md` — too large to load whole, will spot-read in Phase 0 only as needed
- `docs/SPORTSMETA_BOUNDARY.md` — first 120 lines (covers ownership and Sports Posters paywall boundary)
- `src/utils/sportsArtwork.js` — full read
- `src/handlers/sportsArtworkProxy.js` — first 200 lines
- `src/utils/sportsArtworkDiskCache.js` — full read
- `src/utils/sportsPosterTemplates.js` — first 120 lines (template list)
- `src/utils/sportsPosterAdapter.js` — first 100 lines (league/sport vocab)
- `src/lib/shared.js` — `requireConfigSubscription` definition (lines 1610–1619)

Greps performed (relevant counts only — full lists in proof tables below):
- `sports-image-cache|sportsImageCache|sportsdb-poster-cache|sportsCacheSeeder|sportsCacheAutofill|sportsThumb|/thumb/sports|/image/sports` → 11 file hits, all in docs or as `HTTP 410 Gone` handlers; live runtime keeps no recurring TheSportsDB cache job
- `sportsArtwork|sportsPoster|sportsBackdrop|artworkProxy|sports-artwork` → 49 file hits across handlers, utils, scripts, public, docs
- `pvt\.kepners\.co\.uk` → 9 file hits, only the brief docs and 3 audit/probe scripts
- `FREE_MODE|REQUIRE_ACTIVE_SUBSCRIPTION|requireConfigSubscription|composed.poster|paywall|paid.tier|free.tier` → 28 file hits; `requireConfigSubscription` exists only as a pass-through in `src/lib/shared.js`

---

## C. Boundary statements being reconciled

The brief asks to verify five product/system boundary claims. Each is given verdict + exact proof.

### C1. SportsMeta owns sports artwork generation/cache now

**Verdict: VERIFIED.**

Repo proof:
- `ARCHITECTURE.md` lines 46–55 state: "SportsMeta is the sports identity and artwork service. It owns the public `sportsmeta:` id space, `manifest` / `catalog` / `meta` / `event` / `resolve` endpoints, the SportsMeta SQLite DB, the asset cache, the member-token routes, and Stripe billing." and "PVTKRRX depends on SportsMeta for sports identity resolution and upstream artwork bytes. It does not make independent sports artwork decisions or hold its own paid sports image catalogue."
- `docs/CURRENT_DESIGN.md` lines 75–87 ("SportsMeta Boundary") confirm the same boundary and explicitly remove the old integrated `/sportsmeta/*` draft from the live product.
- `docs/SPORTSMETA_BOUNDARY.md` lines 12–35 enumerate ownership: SportsMeta owns the SQLite DB, asset cache, premium member routes, Stripe billing, and SportsCult/TheSportsDB coverage policy.
- `src/handlers/sportsArtworkProxy.js` line 4–9 imports SportsMeta client; the only upstream calls are `buildSportsMetaAssetUrl` and `buildSportsMetaDefaultAssetUrl` — both go to `sportsmeta.pvtkrrx.cc`. PVTKRRX never calls TheSportsDB directly anymore.

Live proof:
- `https://sportsmeta.pvtkrrx.cc/` → `302` to `/pricing` (host live).

### C2. PVTKRRX sports image cache was removed

**Verdict: VERIFIED, with the caveat in §A — a *different* raster cache still exists and is sanctioned.**

Repo proof of the *removal* (the old TheSportsDB-driven cache):
- `CLAUDE.md` (project overlay), section "Sports Poster Cache — REMOVED 2026-04-22": "PVTKRRX no longer owns a sports image cache. SportsMeta is the only source of sports artwork. Deleted modules: `src/clients/sportsdb.js`, `src/utils/sportsImageCache.js`, `src/utils/sportsCacheSeeder.js`, `src/utils/sportsCacheAutofill.js`, `src/utils/sportsThumb.js`, `src/utils/sportsmetaCatalogue.js`, `src/handlers/sportsmeta.js`. Deleted routes: `/thumb/sports/:info.svg|.png`, `/image/sports/:variant/:token` now respond with `HTTP 410 Gone`."
- `index.js` lines 1052–1060 confirm those routes return `HTTP 410 Gone`:
  ```js
  app.get([
    '/thumb/sports/:info.png',
    '/thumb/sports/:variant/:info.png',
    '/thumb/sports/:info.svg',
    '/thumb/sports/:variant/:info.svg',
    '/image/sports/:variant/:token'
  ], (_req, res) => {
    res.status(410).send('pvtkrrx sports artwork moved to sportsmeta.pvtkrrx.cc')
  ```
- `index.js` line 2890 confirms autofill removal: "Legacy sportsCacheAutofill (15-min TheSportsDB scheduled job) was removed on 2026-04-22."
- Glob for the deleted modules returns nothing under `src/` — confirmed.

Caveat — the *new* sanctioned cache:
- `src/utils/sportsArtworkDiskCache.js` exists and is in active use. It caches the rasterised PNG output of the SportsMeta SVG → PNG proxy keyed by composition cache key. CLAUDE.md, "Cache invalidation → PVTKRRX (file-only)" explicitly names two cache dirs (`/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` ~272MB primary, `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/` ~1.2MB secondary) and treats them as part of current architecture.
- This is a transport/normalisation cache, not a content cache. It never calls TheSportsDB. It only caches the addon-side rasterisation of SportsMeta-owned artwork.
- Implementation rule for Phase 3: do not reintroduce *content* fetching from TheSportsDB or any sports-image source other than SportsMeta. The raster cache for the SVG→PNG proxy stays.

### C3. Free vs paid artwork behaviour

**Verdict: VERIFIED.** PVTKRRX is free. Paid artwork is a separate SportsMeta member addon — not a tier inside PVTKRRX.

Repo proof:
- `src/lib/shared.js` lines 1615–1619:
  ```js
  // Billing/subscription gating removed — addon is free.
  // Kept as pass-through so route signatures don't change.
  async function requireConfigSubscription(req, res, next) {
    return next()
  }
  ```
- `docs/CURRENT_DESIGN.md` lines 60–73 ("Coordinated Product Stack And Entitlement"): "Every PVTKRRX user — free, unconfigured, desktop, hosted, self-host — gets the same public SportsMeta artwork, now delivered as client-safe PNG proxy URLs on the PVTKRRX addon origin. There is no user-entitlement branch inside PVTKRRX." and "Real raster sports artwork is a separate SportsMeta member product."
- `docs/SPORTSMETA_BOUNDARY.md` lines 89–97 ("Paid Sports Posters Boundary"): "PVTKRRX remains free… For canonical `sportsmeta:` sports rows, PVTKRRX emits PVTKRRX `/sports-artwork/...png` raster-proxy URLs backed by SportsMeta public/root routes only. This is a client-compatibility transport for free/public SVG or glyph-style artwork, not a premium route. Free/fallback sports artwork stays on the same PVTKRRX `/sports-artwork/...png` raster proxy. The proxy calls SportsMeta public/default assets, carries the event title/date when known, and must not call member-scoped SportsMeta routes."
- `package.json` has no Stripe runtime dependency for PVTKRRX gating; SportsMeta member tokens are not minted by PVTKRRX.

So the product-level statement "SVG/glyph for everyone, real Sports Posters for paying customers" is a **stack-level truth split across two addons**, not a free/paid branch inside PVTKRRX. Any doc, copy, or UI suggesting PVTKRRX has an internal paid artwork tier is drift.

Memory note `project_poster_paywall_scope.md` recorded "Poster generation is a paying-customer website feature" — this remains true for the **stack as a whole**, but the paid surface lives on the SportsMeta member addon (`https://sportsmeta.pvtkrrx.cc/member/:token/...`), not inside PVTKRRX runtime branches.

### C4. Deployment / runtime topology

**Verdict: VERIFIED — there are two intentionally separate PVTKRRX runtimes, plus SportsMeta as a third service.**

Repo proof — both runtimes documented as distinct:
- `CLAUDE.md` (project overlay), "Deployment Topology (verified 2026-04-30)" table:
  | Runtime | What it serves | How to update |
  |---|---|---|
  | Coolify Docker container `w14jewmw5ubscrxh8zzfhq7d-...` | PUBLIC website `https://www.pvtkrrx.cc/` (Caddy → `pvtkrrx:3000`) | Push to GitHub `main`, Coolify rebuild |
  | systemd `pvtkrrx.service` (`/opt/pvtkrrx/index.js`, port 7000) | Native self-host runtime, NOT public | rsync source → `systemctl restart pvtkrrx.service` |
  Plus the explicit warning: "Updating the systemd service does NOT change what real users see."
- `ARCHITECTURE.md` line 15: "`www.pvtkrrx.cc` is presently served through Caddy into the Coolify-hosted `pvtkrrx` app container. A separate `/opt/pvtkrrx` `systemd` runtime can exist on the same host for self-host/manual use, but it is not the public route unless Caddy is repointed."
- `docs/CURRENT_DESIGN.md` lines 14–58 enumerate Optional hosted relay → Self-hosted server mode → Local Windows runtime → Electron desktop wrapper as four distinct runtime pieces.
- `CLAUDE.md`, "SportsMeta is different" sub-table makes SportsMeta a third, separate service with its own systemd unit, source path (`/opt/sportsmeta/app`), REVISION file, and rsync deploy mechanism.

Live proof — the public PVTKRRX origin and the SportsMeta origin both respond from the public internet, confirming they are distinct hosts:
```text
pvt.kepners.co.uk        502          (stale)
www.pvtkrrx.cc           200          (live)
sportsmeta.pvtkrrx.cc    302 → /pricing (live)
```

Implementation rule: Phase 4 proof must distinguish "Coolify container" (public) from "systemd `pvtkrrx.service`" (self-host) from "`sportsmeta.service`" (artwork host). Do not call updating one of them proof of the others.

### C5. `pvt.kepners.co.uk` status

**Verdict: STALE (502).** Not live. Used only in 3 audit/probe scripts as a default manifest URL.

Live proof: `curl -sS -o /dev/null -w '%{http_code}' https://pvt.kepners.co.uk/` → `502`.

Repo hits — all are *defaults* with env-var override available:
- `scripts/audit-sports-posters.js:10` → `'https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted'` (overridable via `PVTKRRX_SPORTS_POSTER_AUDIT_MANIFEST`)
- `scripts/audit-sports-artwork.js:5` → same default
- `scripts/probe-sports-item.js:3` → same default

Implementation rule: when running these scripts in Phase 4 proof, override the manifest URL or update the defaults to a working surface. Do not present `pvt.kepners.co.uk` as a live test target in any new doc.

---

## D. Contradictions found

1. **None between repo + live** for the five boundary statements. Repo claims and live HTTP probes agree.
2. The brief and plan documents (and earlier prompts in `docs/PVTKRRX_RECONCILED_SPORTS_ARTWORK_DOCS/`) imply "PVTKRRX must not reintroduce a removed sports image cache". This is correct for the *content* cache (TheSportsDB). It would be wrong if read as "delete `sportsArtworkDiskCache.js`" — that file is the SVG→PNG raster cache that the proxy needs and that CLAUDE.md sanctions. Phase 3 must not collapse the two.
3. Memory `project_poster_paywall_scope.md` says "Poster generation is a paying-customer website feature". `docs/SPORTSMETA_BOUNDARY.md` (current truth) clarifies this is a **stack-level** statement: paid Sports Posters live on the SportsMeta member addon, not on PVTKRRX. Both can be true at once. PVTKRRX itself stays free.

---

## E. Weak points / open questions

- `docs/PROJECT_STATUS.md` is 48k tokens and was not loaded whole; only spot-checked. If a later phase needs a status claim, read the relevant section directly rather than trust this summary.
- Tracker memory `[Asset-class proof mechanism](sportsmeta_asset_class_proof.md)` says: "code ready on `main`, not yet deployed to Contabo". Not yet verified live; SportsMeta proof routes were not probed for this Phase -1.
- The `PROJECT_STATUS.md`-cited 1.1.51 version vs CLAUDE.md-cited 1.1.57 hint that release/status drift exists across docs. Not load-bearing for Phase 0/1 but worth flagging before any installer work in Phase 5.
- `backdrops/python-backdrops/` contains the canonical 4K backdrops + three current poster families (`08-team-vs-team`, `09-competitor-vs-competitor`, `10-single-event-motorsport`) and is the *real* design source per CLAUDE.md project rule. Phase 0 discovery must enumerate templates from there + `src/utils/sportsPosterTemplates.js`, not invent new ones.

---

## F. Boundary rules carried forward to Phase 0+

1. SportsMeta owns canonical sports artwork generation, the SQLite catalogue, the asset cache, member tokens, and Stripe billing. PVTKRRX is a consumer.
2. PVTKRRX is allowed exactly one server-side cache surface for sports artwork: the SVG→PNG raster cache at `<runtime>/sports-artwork-raster-cache/` plus its optional Postgres mirror (`PVTKRRX_SPORTS_ARTWORK_POSTGRES_URL`). No new content cache, no TheSportsDB calls.
3. Free vs paid is a **stack-level** split. PVTKRRX stays free for every install surface. Paid Sports Posters live on the SportsMeta member addon, not inside PVTKRRX runtime branches.
4. Two PVTKRRX runtimes are intentional. Coolify container = public. systemd = self-host. SportsMeta `sportsmeta.service` is a third service. Each must be proved separately in Phase 4.
5. `pvt.kepners.co.uk` is dead (502). Do not use it as a live target.
6. Generic backdrops are sport/family-level by default. Event-specific backdrops only if the user explicitly asks for them in Phase 1.
7. Real SportsDB/SportsMeta logos win when present. Text initials are last-resort fallback (CLAUDE.md SportsMeta Deployment Guardrail).

---

## G. Exit criteria

- ✅ Reconciliation file written.
- ⏭ Continue to Phase 0 discovery: enumerate every sport/family, every poster template, every backdrop family, every classifier branch, every fallback path. Use `src/utils/sportsPosterTemplates.js`, `src/utils/sportsPosterAdapter.js`, `src/utils/sportsEventClassifier.js`, `src/utils/sportBackdrops.js`, `src/clients/sportsmeta.js`, and `backdrops/python-backdrops/` as primary inputs.
- ⏭ Then ask the user the template questions via `AskUserQuestion` popup, in batches.

Verdict: **PASS WITH CAVEATS** — proceed to Phase 0.
