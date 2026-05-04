# PVTKRRX Sports Template/Rendering Audit — Final Report

Date: 2026-05-01
Author: Frank (Claude Code)
Source briefs:
- `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md`
- `docs/PVTKRRX_RECONCILED_SPORTS_ARTWORK_DOCS/DRAWING.VTemplate.md`

Predecessors:
- `.claude/trackers/sports-artwork-reconciliation.md` (Phase -1, PASS WITH CAVEATS)
- `.claude/trackers/sports-artwork-discovery.md` (Phase 0, COMPLETE)
- `.claude/trackers/sports-artwork-question-log.md` (Phase 1, COMPLETE)
- `.claude/trackers/sports-artwork-template-contract.md` (Phase 2 contract DRAFT)

---

## A. Verdict

**READY WITH CAVEATS.**

The visible Stremio sports templates render. Header/Line-2/Line-3 hierarchy holds in every rendered sample inspected. No `EVENT` placeholder leaks. No text overflow. Sport classifier and family routing work end-to-end, with one real classification bug and several parser misses found.

Caveats blocking a full READY:
1. **WWE titles classify as `combat_event`, not `wrestling_event`.** Wrestling backdrop bucket still selected via SportsCult category map, but the eventClass label is wrong. Needs a fix in `classifyByText` priority order (see §F1).
2. **Date is dropped from F1, PGA, Tennis, FA Cup parser output** even when the year is present in the title. EPL extracts a full date; the others lose it. (§F2)
3. **WRC `Day3 Tanak Highlights` does not split into round + driver name** — display title becomes `Day3 Tanak Highlights` instead of `Round=Day 3` + `Driver=Tanak`. Conflicts with the Q5.3 contract rule. (§F3)
4. **`smoke:sports-resolution` FAILS** — version-string fixture drift, not a code bug. The fixture expects `v=20260430-public-sportsmeta-v1`; the runtime emits `v=20260501-competitor-vs-competitor-v1` (latest commit). One-line fixture update fixes it. (§F4)
5. **Live route proof (Phase 3) NOT RUN** — would require `npm start` plus reachable Prowlarr/qBit. The static smoke `smoke:config` exercises the manifest/catalog code paths and passed; full HTTP catalog/meta/stream JSON capture is deferred.
6. **Wrestling currently renders as competitor-vs-competitor** (e.g. "Cody Rhodes vs Roman Reigns" in the contact sheet). Matches the *current* code; conflicts with the Phase 2 contract Q5.4 (event-show shape, no fake paired headline). Implementation gap, not a current-state failure.
7. **WRC backdrop still routes to `generic-sport`**, not `motorsport-4k.jpg`. Matches the *current* code; the new `motorsport` bucket is a Phase 5 backlog item per the contract.

Verdict label: **READY WITH CAVEATS** for the *current* runtime; **NOT READY** to ship the new template contract until §F1–§F4 are fixed and the Phase 5 assets land.

---

## B. Product/system boundary

**In scope:**
- PVTKRRX repo: `src/utils/sports*`, `src/handlers/{catalog,meta,sportsArtworkProxy}.js`, `src/clients/sportsmeta.js`, `src/config/sports*.js`, `scripts/smoke-sports*`, `scripts/generate-team-vs-team-posters.js`, `backdrops/python-backdrops/`.
- Existing rendered sample PNGs in `.runtime/sports-{broadcast,team-vs-team-posters,single-event-motorsport-smoke,competitor-vs-competitor-smoke,artwork-previews}/` produced by the smoke tests.
- Static smokes that don't require a live HTTP listener: 11 of 14 sports smokes ran to completion.

**Out of scope (this audit):**
- Live HTTP route capture (manifest/catalog/meta/stream JSON via `npm start` against real Prowlarr/qBit). Server is not running; would need a manual session.
- SportsMeta-side code or its `sportsmeta.service` runtime. SportsMeta remains the upstream artwork source per the verified boundary (`docs/SPORTSMETA_BOUNDARY.md`).
- Live Coolify container (`https://www.pvtkrrx.cc`) and systemd `pvtkrrx.service` runtime probing — Phase 4 of the original brief, not this audit.
- Movie/TV catalog templates (no sports relevance).
- Stripe/billing — `requireConfigSubscription` is a verified pass-through.

**Boundary preserved:**
- SportsCult/Prowlarr remains the catalog availability source.
- SportsMeta (which now owns TheSportsDB integration on its side) is the enrichment-only path. PVTKRRX no longer calls TheSportsDB directly (verified: `src/clients/sportsdb.js` removed; `index.js:1052-1060` returns HTTP 410 for legacy `/thumb/sports/*` and `/image/sports/*` routes).
- Three-route model (PC Local / LAN Bridge / Remote Seedbox) untouched by this audit.
- Hosted relay does not proxy video bytes (verified via `requireConfigSubscription` audit + `smoke:guards` was queued, not yet completed).

---

## C. Plain-English explanation / flow

```
SportsCult RSS / Prowlarr search
        │
        ▼
src/handlers/catalog.js  (pulls sports rows from Prowlarr)
        │
        ├── isSportsCultIndexer / isSportsOnlyIndexer       (src/utils/sportsIndexers.js)
        ├── parseSportsTitle / parseSportsEventTitle        (src/utils/sportsTitleParser.js)
        ├── normalizeSportsEventMetadata                    (src/utils/sportsEventNormalizer.js)
        ├── mapSportsCultCategory                           (src/config/sportsCultCategoryMap.js)
        │      → sport hint, league, posterClass default
        ├── classifySportsEvent / classifySportsPosterEvent (src/utils/sportsEventClassifier.js +
        │                                                    src/utils/sportsPosterClassifier.js)
        ├── resolveSportsMetaIdentity                       (src/utils/sportsIdentityResolution.js +
        │                                                    src/clients/sportsmeta.js)
        │      → canonical "sportsmeta:event:..." id when safe
        │      → resolution status: resolved / ambiguous / not_found / weak / fallback
        └── resolveSportsPoster/Background/Landscape/Logo Asset
               (src/utils/sportsArtwork.js)
               │
               ▼
        Stremio meta payload:
          - id          = sportsmeta:event:... (resolved) OR pvtkrrx:... (fallback)
          - poster      = http://<base>/sports-artwork/{id|default}/poster/<sport-or-id>.png?...
          - background  = http://<base>/sports-backdrops/<bucket>-4k.jpg?v=...
          - landscape   = http://<base>/sports-artwork/{id|default}/landscape/...
          - logo        = http://<base>/sports-artwork/{id|default}/logo/...
               │
               ▼
Stremio client requests /sports-artwork/...png
        │
        ▼
src/handlers/sportsArtworkProxy.js
        ├── readSportsArtworkDiskCache  (src/utils/sportsArtworkDiskCache.js
        │      └── disk cache + optional Postgres mirror)
        │      → cache HIT: serve PNG bytes from disk
        ├── on cache MISS:
        │      ├── fetchUpstream(SportsMeta public/root URL)
        │      │      └── src/clients/sportsmeta.js: buildSportsMetaAssetUrl /
        │      │           buildSportsMetaDefaultAssetUrl
        │      ├── if upstream returns SVG: rasterize via sharp at variant
        │      │   dimensions (poster 600×900, bg 1920×1080, landscape 1280×720, logo 512×512)
        │      ├── if upstream fails OR layout unsanitary:
        │      │      ├── readLocalSportBackdropFallback (uses public/sports-backdrops/<bucket>-4k.jpg)
        │      │      └── renderSportsPosterTemplateSvg / renderLogoGlyphSvg
        │      │           (src/utils/sportsPosterTemplates.js — 7 templates,
        │      │            family selected via sportsEventClassifier.selectTemplateForSportsClass)
        │      └── writeSportsArtworkDiskCache
        ▼
Client gets a client-safe PNG (Stremio mobile/tablet can't render SVG reliably).
```

The free-tier rule: this whole flow uses SportsMeta **public/root** routes only. Member-token routes (`/member/:token/...`) live on the separate SportsMeta member addon and never enter PVTKRRX. Logos/portraits enter the PNG only when SportsMeta's public canonical SVG already contains them — that is exactly the §F5 audit follow-up.

---

## D. Exact proof

### D1. Files inspected (Phase 0)

**Contract / data parsing**
- `src/config/sportsCultCategoryMap.js` — 70-row SportsCult → app sport hint + poster class table; aliases (Premier League Darts → Darts, IPL → Cricket, etc.); `mapSportsCultCategory()`, `inferSportsCultPosterContextFromCategoryNames()`. Includes `POSTER_CLASSES` (16 entries) and `POSTER_MODES` (3 entries).
- `src/config/sportsCatalogs.js` — 17 manifest catalogs (1 aggregate + 16 sport-family); `buildSportsCatalogManifestEntries()`, `findSportsDiscoveryCatalog()`, `getSportsSearchSeedTerms()`.
- `src/config/manifest.js` — top-level Stremio manifest assembly (not deeply read — out of audit scope).
- `src/config/categories.js` — Prowlarr `SPORT_CATS / MOVIE_CATS / TV_CATS` constants used by handlers.
- `src/utils/sportsTitleParser.js` — `parseSportsTitle()`, `parseSportsEventTitle()`. Handles team-vs-team and non-vs event forms; date/quality/source/codec normalisers.
- `src/utils/sportsEventNormalizer.js` — title → structured event fields.
- `src/utils/sportsRules.js` — `resolveSportHint()`, `normalizeSportKey()`, `isSportsNoiseTitle`, `isLikelySportsEventTitle`.
- `src/utils/sportsIndexers.js` — `isSportsCultIndexer()` / `isSportsOnlyIndexer()` (sports-contamination filter for movie/TV).
- `src/utils/sportsCategoryHint.js`, `src/utils/sportsTorrentProfile.js`, `src/utils/sportsAvailabilityStore.js` — anchoring tracker availability to canonical ids.

**Enrichment lookup**
- `src/clients/sportsmeta.js` — SportsMeta client; `buildSportsMetaAssetUrl()`, `buildSportsMetaDefaultAssetUrl()`, `buildSportsMetaMemberAssetUrl()` (member tokens, **not used by PVTKRRX runtime**), `getPublicSportsMetaBaseUrl()`, `resolveSportSlug()`.
- `src/clients/cinemeta.js` — only used for movies/TV.
- `src/utils/sportsIdentityResolution.js` — `resolveSportsMetaIdentity()` returning `SPORTS_META_RESOLUTION_STATUS` (resolved / ambiguous / not_found / weak / fallback).
- `src/utils/sportsIdentityBackfill.js` — short-lived background backfill cache.
- `src/utils/sportsCatalogPrewarm.js` — boot-time prewarm for self-host.

**Stremio meta output**
- `src/handlers/catalog.js` — emits sports catalog metas; calls `resolveSportsPosterAsset` / `resolveSportsBackgroundAsset` / `resolveSportsLandscapeAsset` / `resolveSportsLogoAsset`.
- `src/handlers/meta.js` — emits sports detail meta; calls the same resolvers.
- `src/handlers/stream.js` — sports stream selection; not artwork-related but referenced.
- `src/utils/metaPlaceholder.js` — `BRAND_ARTWORK`, `buildMetaPlaceholder()` — branded fallback poster only when nothing better is available.

**Poster / template rendering**
- `src/utils/sportsPosterTemplates.js` — 7 templates (`editorial`, `broadcast`, `sportsbook`, `trading-card`, `brutalist`, `ticket-stub`, `glitch`); `renderSportsPosterTemplateSvg()`, `renderLogoGlyphSvg()`, `normalizeSportsPosterTemplate()`, `resolveSportsPosterTemplate()`, `layoutFamilyForSportsPosterRender()`, `isBroadcastLayoutFamily()`.
- `src/utils/sportsEventClassifier.js` — `classifySportsEvent()`, `selectTemplateForSportsClass()` (auto-upgrades `ticket-stub` → `broadcast` for non-`team_vs_team`).
- `src/utils/sportsPosterClassifier.js` — `classifySportsPosterEvent()` (16 poster classes), `hasActualPair()`, `isCompetitorVsCompetitorEvent()`. Uses `sportsCultCategoryMap` context first; text classifier second; refinement third.
- `src/utils/sportsPosterAdapter.js` — adapter from raw event input to template input; `LEAGUE_CODES`, `sportLabel()`, `leagueCodeFor()`, `sportIconFor()`, `eventFormatFor()`, `sideName()`, `buildSide()`, plus colour/initials helpers.
- `src/utils/sportsArtwork.js` — `resolveSportsPosterAsset()`, `resolveSportsBackgroundAsset()`, `resolveSportsLandscapeAsset()`, `resolveSportsLogoAsset()`. Two URL shapes: `/sports-artwork/id/<variant>/<sportsmeta:event:...>.png` for resolved canonical ids, `/sports-artwork/default/<variant>/<sport>.png?...` for unresolved fallback. Always emits the addon-origin proxy URL when `baseUrl` is known.
- `src/handlers/sportsArtworkProxy.js` — server-side proxy; SVG→PNG rasterisation via sharp; layout sanity check (`isExpectedRasterLayout`); cache integration.
- `src/utils/sportsCardArtwork.js` — additional card-style artwork helpers used by the proxy fallback.

**Backdrop / wallpaper rendering**
- `src/utils/sportBackdrops.js` — 16 sport buckets in `REQUIRED_SPORT_BACKDROP_BUCKETS`; `resolveSportBackdrop()`, `resolveSportBackdropIntent()`, `resolveSportBackdropBucket()`, `buildSportBackdropUrl()`, `sportBackdropFilename()`, `hasSportBackdrop()`.
- `public/sports-backdrops/` — 16 4K JPGs (mirror of `backdrops/python-backdrops/*-4k.jpg`).
- `backdrops/python-backdrops/` — source-of-truth folder; 16 4K JPGs + 3 poster generator families:
  - `08-team-vs-team/generate.py` — TEAM_VS_TEAM 600×900 SVG generator.
  - `09-competitor-vs-competitor/generate.py` — COMPETITOR_VS_COMPETITOR generator.
  - `10-single-event-motorsport/generate.py` — SINGLE_EVENT_MOTORSPORT generator.

**Fallback SVG / text rendering**
- `renderSportsPosterTemplateSvg` (in `sportsPosterTemplates.js`) — last-resort SVG when SportsMeta upstream fails or returns unsanitary layout.
- `renderLogoGlyphSvg` — sport-glyph fallback.
- `readLocalSportBackdropFallback` (in `sportsArtworkProxy.js`) — backdrop fallback to `public/sports-backdrops/<bucket>-4k.jpg`.

**Smoke / manual verification**
- 14 sports-related smokes in `scripts/`:
  - `smoke-sports-resolution.js`, `smoke-sport-backdrops.js`, `smoke-sports-poster-classifier.js`, `smoke-sports-poster-adapter.js`, `smoke-sportcult-category-map.js`, `smoke-sports-catalog-seeds.js`, `smoke-sports-poster-render.js`, `smoke-sports-team-vs-team.js`, `smoke-sports-competitor-vs-competitor.js`, `smoke-sports-single-event-motorsport.js`, `smoke-sports-broadcast-artwork.js`, `smoke-sports-artwork-layout.js`, `smoke-sports-catalog-latency.js`, `smoke-sports-catalog-seeds.js`.
- Audit/probe scripts: `audit-sports-artwork.js`, `audit-sports-posters.js`, `prewarm-sports-posters.js`, `debug-sports-artwork-viewer.js`, `probe-sports-item.js`. **All three audit/probe scripts default the manifest URL to dead `https://pvt.kepners.co.uk/...`** (verified live HTTP probe = 502). User confirmed they only run these manually with env override.
- Generators that produce visual proofs: `generate-team-vs-team-posters.js` (writes to `.runtime/sports-team-vs-team-posters/`).

### D2. Files NOT found in this repo (audit-prompt mentioned)
- `src/utils/sportsThumb.js` — **DELETED 2026-04-22** (per `CLAUDE.md` "Sports Poster Cache — REMOVED 2026-04-22"). Confirmed missing from `src/utils/`.

### D3. Commands run

| # | Command | Exit | Notes |
|---|---|---|---|
| 1 | `node scripts/audit-sports-title-parser.js` (Phase 2 helper, written by audit) | 0 | All 8 titles processed; output to `.claude/proofs/sports-artwork/audit-phase2-parser.{json,log}` |
| 2 | `npm run smoke:sports-poster-classifier` | 0 | PASS |
| 3 | `npm run smoke:sports-poster-adapter` | 0 | PASS |
| 4 | `npm run smoke:sportcult-category-map` | 0 | PASS |
| 5 | `npm run smoke:sports-catalog-seeds` | 0 | PASS (twice — 2nd was duplicate) |
| 6 | `npm run smoke:sport-backdrops` | 0 | PASS — 16 buckets verified, SHA-256 parity holds |
| 7 | `npm run smoke:sports-resolution` | **1** | **FAIL** — version-string fixture drift (see §F4) |
| 8 | `npm run smoke:sports-poster-render` | 0 | PASS |
| 9 | `npm run smoke:sports-team-vs-team` | 0 | PASS — 10 fixtures rendered to `.runtime/sports-team-vs-team-posters/` |
| 10 | `npm run smoke:sports-competitor-vs-competitor` | 0 | PASS — 4 fixtures rendered |
| 11 | `npm run smoke:sports-single-event-motorsport` | 0 | PASS — 5 fixtures rendered (F1, IndyCar, MotoGP×2, NASCAR, WRC) |
| 12 | `npm run smoke:sports-broadcast` | 0 | PASS — 4 fixtures rendered (basketball, MotoGP, snooker, WRC) |
| 13 | `npm run smoke:sports-artwork` | 0 | PASS — layout/aspect sanity for proxy outputs |
| 14 | `npm run smoke:config` | 0 | PASS — manifest emission, install link format |
| 15 | `npm run smoke:guards` | NOT RUN | Background task hung after smoke:config completed; killed before this ran |
| 16 | `npm run smoke:lan-pair` | NOT RUN | Same |
| 17 | `npm run smoke:stremio-link` | NOT RUN | Same |
| 18 | `npm run smoke:security` | NOT RUN | Same |
| 19 | `npm run smoke:pipeline` | NOT RUN | Same |
| 20 | `npm run smoke:playback` | NOT RUN | Same |
| 21 | `npm test` | **NOT AVAILABLE** | No `test` script in `package.json` |
| 22 | `npm run lint` | **NOT AVAILABLE** | No `lint` script in `package.json` |
| 23 | `npm run dist:win` | NOT RUN | Out of audit scope; only run when packaging changes |

### D4. Routes tested (Phase 3)

**NOT RUN** — server is not running locally and this audit did not start one. Static smokes (`smoke:config`, `smoke:sports-catalog-seeds`) exercise the manifest emission and catalog handler code paths; both PASS. Full HTTP capture against `/local/manifest.json?mode=local` / `/local/catalog/sports/<id>.json?mode=local` / `/local/meta/sports/<id>.json?mode=local` / `/local/stream/sports/<id>.json?mode=local` deferred — would require:
1. `npm start` with `ENCRYPTION_SECRET` set
2. Reachable Prowlarr (the smoke log shows local Prowlarr is configured: "Prowlarr ready (8 indexers)")
3. Reachable qBittorrent (smoke log warned "qBittorrent warm-up failed: fetch failed")
4. `curl` capture for each route

Sample IDs that *would* be exercised based on smoke log evidence:
- `pvtkrrx-sports`, `pvtkrrx-sports-football`, `pvtkrrx-sports-motorsport`, `pvtkrrx-sports-mma` (catalog ids)
- `sportsmeta:event:motorsport|2026-04-30|motogp|spain-sprint-race` (canonical id seen in smoke output)
- `pvtkrrx:...` (fallback ids — exact form not captured this run)

### D5. Sample IDs / titles used (Phase 2)

Title parser proof titles (8 total — 6 from the audit prompt + 2 added):
1. `EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER`
2. `UFC.311.Early.Prelims.2026.01.18.1080p.WEB-DL.x264`
3. `F1.2026.Round.04.Bahrain.Grand.Prix.Qualifying.1080p`
4. `PGA.2026.The.Masters.Round.2.1080p`
5. `Tennis.2026.Wimbledon.Navratilova.v.Player.720p`
6. `FA.Cup.2026.Final.Team.A.v.Team.B.1080p`
7. `WRC.2026.Catalunya.Day3.Tanak.Highlights.1080p` (added — exercises Q5.3 driver-name rule)
8. `WWE.Royal.Rumble.2026.01.31.PPV.1080p.WEB.h264-HEEL` (added — exercises wrestling classification)

### D6. Output image / proof paths

Phase 4 inspected sample copies (preserved in canonical proof folder):
- `.claude/proofs/sports-artwork/audit-phase4/contact-sheet.png` — 6-poster contact sheet (basketball/baseball/motorsport/rugby/wrestling/tennis)
- `.claude/proofs/sports-artwork/audit-phase4/team-vs-team-epl-mci-arsenal.png` — TEAM_VS_TEAM family
- `.claude/proofs/sports-artwork/audit-phase4/single-event-motorsport-f1-australian-gp.png` — SINGLE_EVENT_MOTORSPORT family
- `.claude/proofs/sports-artwork/audit-phase4/competitor-vs-competitor-ufc-makhachev-oliveira.png` — COMPETITOR_VS_COMPETITOR family
- `.claude/proofs/sports-artwork/audit-phase4/broadcast-wrc.png` — BROADCAST family

Originals also live under `.runtime/sports-{broadcast-smoke,team-vs-team-posters,single-event-motorsport-smoke,competitor-vs-competitor-smoke,artwork-previews}/` (full set of ~50 PNGs from the smokes).

Logs:
- `.claude/proofs/sports-artwork/audit-phase6.log` — full output of all 13 sports-related smokes
- `.claude/proofs/sports-artwork/audit-core-smokes.log` — partial (smoke:config completed; rest hung)
- `.claude/proofs/sports-artwork/audit-phase2-parser.log` — Phase 2 parser output
- `.claude/proofs/sports-artwork/audit-phase2-parser.json` — Phase 2 structured parser output

### D7. Files changed in this audit (Phase 3 of the brief = "no implementation")

| File | Change | Reason |
|---|---|---|
| `scripts/audit-sports-title-parser.js` | NEW | Phase 2 parser proof helper. No existing script exercised the 6 audit-prompt titles end-to-end. |
| `.claude/trackers/sports-artwork-reconciliation.md` | NEW | Phase -1 reconciliation. |
| `.claude/trackers/sports-artwork-discovery.md` | NEW | Phase 0 discovery. |
| `.claude/trackers/sports-artwork-question-log.md` | NEW | Phase 1 user popup answers. |
| `.claude/trackers/sports-artwork-template-contract.md` | NEW (DRAFT) | Phase 2 template contract. |
| `.claude/trackers/sports-artwork-audit-report.md` | NEW (this file) | Final A–H verdict report. |
| `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md` | NEW | Copy of the brief from the docs folder. |
| `docs/PVTKRRX_SPORTSMETA_ARTWORK_RECONCILED_PLAN.md` | NEW | Copy of the plan from the docs folder. |
| `.claude/proofs/sports-artwork/audit-phase4/*.png` | NEW (5 files) | Inspected sample copies. |
| `.claude/proofs/sports-artwork/audit-phase{2,6}*` | NEW | Phase 2 parser output + Phase 6 smoke logs. |

**No source code in `src/` was modified.** No handler, no util, no client, no template generator changed. Audit-only.

---

## E. Template audit result

| Template family | Sample input | Output path | Text boundary | Placeholder | Poster/backdrop | Notes |
|---|---|---|---|---|---|---|
| TEAM_VS_TEAM | `Manchester City vs Arsenal EPL` | `.runtime/sports-team-vs-team-posters/01-epl-manchester-city-arsenal.png` | **PASS** | **PASS** | **PASS** | Header `EPL` + `Manchester City × Arsenal`; line 2 = `MC` vs `ARS` initials badge with `VS`; line 3 = `PREMIER LEAGUE` + `Arsenal`. Ticket-stub footer "SECTION A-12-4" + "ADMIT ONE" reads as decorative ticket art, not a placeholder. Date missing — fixture didn't supply one. |
| SINGLE_EVENT_MOTORSPORT | F1 Australian GP fixture | `.runtime/sports-single-event-motorsport-smoke/formula1-australian-grand-prix.png` | **PASS** | **PASS** | **PASS** | Header `FORMULA 1` / `FORMULA 1`; line 2 = car icon + `Australian Grand Prix`; line 3 = `FORMULA 1` + `2026-04-30`. Hierarchy correct. Boundary good. JSON metadata captured in `.runtime/sports-single-event-motorsport-smoke/formula1-australian-grand-prix.json` confirms `titleFitStatus: "fit"`, no overflow. |
| COMPETITOR_VS_COMPETITOR | UFC Makhachev vs Oliveira | `.runtime/sports-competitor-vs-competitor-smoke/ufc-makhachev-oliveira.png` | **PASS** | **PASS-with-issue** | **PASS** | Header `UFC / MMA`; "COMPETITOR ONE / Islam Makhachev" → `VS` → "COMPETITOR TWO / Charles Oliveira"; footer `UFC / 2026-04-30`. **The "COMPETITOR ONE" / "COMPETITOR TWO" role labels read like decorative card markings, but on a small Stremio tile they could be misread as placeholder text. Worth replacing with sport-specific labels (e.g. "MAIN EVENT" / nothing).** |
| BROADCAST | WRC Spain Islas Canarias | `.runtime/sports-broadcast-smoke/wrc-broadcast.png` | **PASS** | **PASS** | **PASS** | Header `WRC`; checkered flag glyph; line 2 = "SPAIN ISLAS / CANARIAS / SATURDAY HIGHLIGHTS"; subtitle = `WRC SPAIN • ISLAS CANARIAS SATURDAY HIGHLIGHTS`; wordmark `PVTKRRX · BROADCAST`. Note: the title is wrapped over 3 lines because the algorithm shouted the full event name; not pretty but in-bounds. |
| Generic / contact sheet | 6 mixed sports | `.runtime/sports-artwork-previews/contact-sheet.png` | **PASS** | **PASS** | **PASS** | Cross-class strip. Each tile reads at thumbnail size: sport label on top, league mid, vs-pair below. Wrestling tile shows a fake-pair card (`Cody Rhodes vs Roman Reigns`) which is current code but conflicts with new contract Q5.4 (event-show shape). |
| Generic SPORTS fallback | (Uncategorised generic_event title) | Not separately rendered in this audit; covered by `smoke:sports-poster-render` test cases | **PASS** (per smoke) | **PASS** (per smoke `BAD_TEXT_RE` regression assertion in `scripts/smoke-sports-poster-render.js:14`) | n/a | The smoke explicitly checks `\b(?:SPOR|BASK|undefined|null|unknown|n\/a)\b` does not appear in any rendered SVG text node. PASS. |
| No-artwork fallback SVG | Forced upstream 404 | `.runtime/sports-artwork-previews/default-resolved-team-badge-poster.png` exists; `smoke:sports-artwork` log shows `selectedArtworkSource=pvtkrrx-template-glyph` is taken when `httpStatus=404` | **PASS** | **PASS** | **PASS** | Confirmed via `smoke:sports-artwork-layout` log: when SportsMeta upstream returns 404, the proxy emits a PVTKRRX glyph template instead of an empty PNG. `fallbackReason=upstream_404` is logged, not silently swallowed. |

### E1. Hard-failure pattern check (per audit-prompt §1)

| Hard failure pattern | Found? | Evidence |
|---|---|---|
| `- EVENT -` placeholder line | **NO** | None visible in any of the 5 inspected PNGs; smoke `BAD_TEXT_RE` blocks `SPOR/BASK/undefined/null/unknown/n\/a` |
| `Event` placeholder subtitle | **NO** | Parser proof shows `Event` only used as a default when normalizer cannot extract anything; in actual smoke renders, real titles always replace it |
| Title text outside poster boundary | **NO** | All 5 inspected PNGs render text inside the 600×900 frame; smoke `titleFitStatus: "fit"` confirms the SINGLE_EVENT_MOTORSPORT family runs a fit check |
| Important event text too small to read | **NO** | Smallest text on inspected PNGs is the date (`2026-04-30`) at the F1 footer — readable at 50% scale |
| Serial / stub placeholders like `#BGU-EVE-` | **NO** | grep across `src/utils/sports*.js` for `#BGU` / `BGU-EVE` returns zero hits |
| Ugly ellipsis where parsed title exists | **NO** | `sportsPosterAdapter.js:131-134` "No ellipsis suffix: '...' gets read as missing data". Hard cuts at word boundary instead. |
| SportsCult raw filename used as the main title | **PARTIAL** | WRC parser case (§F3): when round/driver split fails, the runtime falls back to `Day3 Tanak Highlights` which is closer to the raw filename than a clean parse. |
| SVG fallback used where real artwork available | **NO** | `smoke:sports-artwork` log shows `selectedArtworkSource=pvtkrrx-public-template` is preferred over `pvtkrrx-template-glyph` whenever upstream succeeds. |
| Poster/backdrop fields missing where enrichment succeeded | **NO** | `smoke:sports-catalog-seeds` log shows every emitted catalog row carries both `posterUrl` and `backdropUrl`, including resolved canonical (`sportsmeta-canonical-public-proxy`) and fallback (`sportsmeta-default-public-proxy`). |

---

## F. Weak points (be blunt)

### F1. WWE classified as `combat_event`, not `wrestling_event`

**Evidence:** Parser proof for `WWE.Royal.Rumble.2026.01.31.PPV.1080p.WEB.h264-HEEL` returns `eventClass: "combat_event"` and `layoutFamily: "TICKET_STUB"`. The SportsCult category map row `Wrestling/Grapling` exists with `posterClass: 'wrestling_event'`, but this audit gave `sportHint: 'wrestling'` and no explicit SportsCult category, so the text classifier path in `classifyByText()` (`src/utils/sportsPosterClassifier.js:225-296`) ran. WWE/Royal Rumble keywords ARE in the wrestling regex at line 254-256 — but the `sport === 'wrestling'` branch lives AFTER the `combat_event` branch (line 238-244) which matches `combat_event` for `sport === 'mma' || sport === 'boxing' || sport === 'fighting'`. Tracking why WWE matched combat needs a deeper look — possibly the title includes `PPV` which the combat regex matches.

**Fix:** in `classifyByText`, move the wrestling branch above the combat branch when `sport === 'wrestling'` is present, or guard the combat regex so wrestling sports don't fall through.

**Impact:** wrestling rows render as combat-style ticket-stub rather than the wrestling event-show shape. Visual: see contact-sheet wrestling tile (`Cody Rhodes vs Roman Reigns`).

### F2. Date dropped from F1, PGA, Tennis, FA Cup

**Evidence:** Parser proof shows `date: (none)` for `F1.2026.Round.04.Bahrain.Grand.Prix.Qualifying.1080p`, `PGA.2026.The.Masters.Round.2.1080p`, `Tennis.2026.Wimbledon.Navratilova.v.Player.720p`, `FA.Cup.2026.Final.Team.A.v.Team.B.1080p`. EPL extracts `2026-03-15` because the title has the full `YYYY.MM.DD`.

**Root cause:** `sportsTitleParser` `isValidDate()` (line 109) requires `YYYY.MM.DD`. Year-only `2026` doesn't trigger date parsing.

**Fix:** add a year-only fallback for titles that contain `2026.` but no month/day. Better still, surface `eventYear` separately so the poster footer can show `2026` even when no full date exists.

**Impact:** Stremio poster footer shows nothing where it should show at least the year.

### F3. WRC `Day3 Tanak Highlights` not split into round + driver

**Evidence:** Parser proof for `WRC.2026.Catalunya.Day3.Tanak.Highlights.1080p` returns `round: ''`, `homeTeam: ''`, display title `Day3 Tanak Highlights`.

**Root cause:** `ROUND_PATTERNS` in `sportsTitleParser.js` includes `['Day', /\bday\s+(\d{1,2})\b/i]` (line 64) — but the title has `Day3` (no space). The regex requires whitespace.

**Fix:** relax the regex to `/\bday\s*(\d{1,2})\b/i` and add a separate driver-name extraction step that fires only when the SportsCult title matches a known motorsport context AND the trailing token is a 1-word capitalised name (per Q5.3 contract).

**Impact:** WRC poster shows messy display title `Day3 Tanak Highlights` instead of clean `Round=Day 3`, `Driver=Tanak`. Conflicts with contract Q5.2 (Series → Event/Round → Session · Date) and Q5.3 (driver name when title has it).

### F4. `smoke:sports-resolution` FAILS on version-string drift

**Evidence:** smoke output:
```
+ actual:   '...?template=ticket-stub&v=20260501-competitor-vs-competitor-v1'
- expected: '...?template=ticket-stub&v=20260430-public-sportsmeta-v1'
```
The runtime emits `v=20260501-competitor-vs-competitor-v1` (current `SPORTS_ARTWORK_PROXY_VERSION` constant in `src/utils/sportsArtwork.js:13`); the smoke fixture expects the previous value.

**Misleading assertion message:** the message reads "PVTKRRX must not expose or forward SportsMeta member tokens in stream-addon artwork URLs" — that was the *original* purpose of the assertion, but it's now firing on the version-string change. The assertion message doesn't reflect the actual diff. Either the wrong assertion failed first or the message hasn't been updated alongside the assertion.

**Fix:** update the smoke fixture to expect `v=20260501-competitor-vs-competitor-v1`. One-line change. Also update the assertion message to "URL shape (path + version) must match expected".

**Impact:** CI/smoke regression. Doesn't affect runtime behaviour. Will block any release that runs the smoke matrix.

### F5. SportsMeta canonical SVGs may already include logos

**Evidence:** No direct evidence either way from this audit. Contract rule G5 (logos = paid only) requires the FREE-tier proxy output to contain NO team badges or fighter portraits. The proxy fetches SportsMeta `/asset/{variant}/{sportsmeta:event:...}` (public canonical) URLs; those return SVGs that the proxy rasterises. If those public SVGs *contain logos*, PVTKRRX is unintentionally serving paid-style art for free.

**Fix:** Phase 3 of the contract (when authorised) must:
1. Pick 5 high-profile fixtures (EPL match, NBA game, NFL game, UFC PPV main, F1 GP).
2. Render each one through the live PVTKRRX `/sports-artwork/...png` proxy.
3. Visually inspect the PNG. If logos appear, coordinate with SportsMeta for a logo-stripped public variant OR strip image refs in the proxy server-side before rasterising.

**Impact:** quietly violates the free/paid stack-level boundary if true. Not yet proven either way.

### F6. Wrestling renders as competitor-vs-competitor (not contract event-show)

**Evidence:** Contact-sheet wrestling tile (`.runtime/sports-artwork-previews/contact-sheet.png`) shows `WWE` header + `Cody Rhodes vs Roman Reigns` paired card layout.

**Root cause:** Current code has no `event-show` family. `sportsEventClassifier.selectTemplateForSportsClass` upgrades non-`team_vs_team` to `broadcast`, and combat-style rendering takes paired headlines.

**Fix:** Phase 3 of the contract introduces an `event-show` family (Q5.4). This is a forward-looking change, not a current-state failure.

### F7. WRC backdrop = `generic-sport`, not `motorsport`

**Evidence:** `smoke:sports-broadcast-artwork.js` log:
```
fallbackReason="neutral_motorsport_broadcast_backdrop_no_specific_asset"
backdropUrl="https://addon.test/sports-backdrops/generic-sport-4k.jpg?..."
```
Confirms WRC routes to `generic-sport`, the fallback for `NEUTRAL_MOTORSPORT_PATTERN` matches.

**Fix:** Phase 5 backlog — add `motorsport-4k.jpg` asset, add `motorsport` to `REQUIRED_SPORT_BACKDROP_BUCKETS`, route the regex hit to it.

**Impact:** WRC/NASCAR/IndyCar/Supercars/WEC/Formula E all visually generic. Acceptable today; on the contract roadmap.

### F8. UFC "COMPETITOR ONE" / "COMPETITOR TWO" labels look placeholder-ish

**Evidence:** `.runtime/sports-competitor-vs-competitor-smoke/ufc-makhachev-oliveira.png` shows literal labels "COMPETITOR ONE" above "Islam Makhachev" and "COMPETITOR TWO" above "Charles Oliveira".

**Fix:** in `09-competitor-vs-competitor/generate.py` (or the JS template), replace the literal role labels with sport-specific badges (e.g. "RED CORNER" / "BLUE CORNER" for UFC, "PLAYER 1" / "PLAYER 2" if any, or just blank).

**Impact:** thumbnail readability — the role labels are bigger than intended at 600×900 → 200×300 thumbnail size and look like template placeholder text.

### F9. Audit/probe scripts still default to dead `pvt.kepners.co.uk`

**Evidence:** verified via grep + live HTTP probe (502). User confirmed "only I would be running the audit" — keeping defaults is acceptable per Q7.3.

**Fix:** none required (user direction).

**Impact:** none for runtime; will trip up anyone else running `audit:sports-artwork` / `audit:sports-posters` / `probe:sports-item` blind.

### F10. Live route proof (Phase 3) not run

**Evidence:** server is not running; `npm start` not attempted in this audit.

**Fix:** Phase 4 of the contract roadmap will probe live `https://www.pvtkrrx.cc` and the systemd `pvtkrrx.service` runtime separately.

**Impact:** static smokes exercise the catalog/meta code paths but not the wire-format JSON Stremio actually sees. A small runtime regression (e.g. case-sensitivity in route matching) wouldn't show in static tests.

---

## G. Exact fixes made

**None.** This audit was discovery + verification only. The audit prompt's "Phase 0 — repo discovery, no edits" was honoured throughout.

The only file additions are:
1. `scripts/audit-sports-title-parser.js` — new helper for Phase 2 parser proof. Deletable.
2. `.claude/trackers/sports-artwork-{reconciliation,discovery,question-log,template-contract,audit-report}.md` — audit/contract documents.
3. `.claude/proofs/sports-artwork/audit-phase{2,4,6}*` — proof artifacts (logs, JSON, copies of inspected PNGs).
4. `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md` and `docs/PVTKRRX_SPORTSMETA_ARTWORK_RECONCILED_PLAN.md` — copies of the user-supplied briefs.

No file under `src/`, no smoke/test under `scripts/smoke-*`, no template generator under `backdrops/python-backdrops/`, no public asset, no config was modified.

---

## H. Safe public wording

Acceptable to post:
- "PVTKRRX sports posters render with the right hierarchy: sport on top, event/league second, parsed detail third. Logos and athlete portraits stay on the SportsMeta member install — PVTKRRX-rendered posters are text + sport glyph only."

NOT acceptable to post (would be a lie until the listed gaps are fixed):
- "Sports template system is complete." — wrestling classification is wrong; date is dropped from several common title shapes.
- "Every sports title parses cleanly." — WRC `Day3 Tanak Highlights` proves otherwise.
- "All smokes pass." — `smoke:sports-resolution` fails on version-string drift.
- "Live runtime verified." — Phase 3 (live HTTP route capture) was not run in this audit.

Final verdict: **READY WITH CAVEATS** — current rendering works and looks right, with 4 specific bugs (§F1–§F4) and one upstream-coordination question (§F5) blocking a "complete" call. The new template contract (`.claude/trackers/sports-artwork-template-contract.md`) is still DRAFT and awaits user approval before Phase 3 implementation begins.

---

## I. Post-audit fixes (2026-05-01, follow-up pass)

User said "carry on" after reading the audit. The four current-code bugs (§F1–§F4) are fixed below. The new template contract is still DRAFT — these fixes are independent of it.

### I.1 Files changed

| File | Lines | Reason |
|---|---|---|
| `scripts/smoke-sports-resolution.js` | 6 / 3 occurrences | F4: version-string fixture drift (`v=20260430-public-sportsmeta-v1` → `v=20260501-competitor-vs-competitor-v1`) |
| `src/utils/sportsPosterClassifier.js` | 17 | F1: move wrestling regex above combat regex so `WWE Royal Rumble PPV` returns `wrestling_event` (PPV no longer captures it as combat) |
| `src/utils/sportsTitleParser.js` | 38 | F2: new `extractFallbackYear()` + `eventYear` field on `parseSportsTitle()`/`parseSportsEventTitle()`/`parseFlexibleMatchupTitle()` outputs. F3: `ROUND_PATTERNS` regexes loosened from `\s+` to `\s*` so `Day3` matches; `normalizeEventNameTokens` strips compact `Day3/Stage4/Night2/Game5/Week7` tokens (standalone `Day`/`Stage`/etc. preserved per smoke fixture). |
| `src/utils/sportsEventNormalizer.js` | 10 | F2: surface `eventYear` from parsed events; emit on normalizer output. |

### I.2 Smoke matrix re-run after fixes (12/12 PASS)

| # | Smoke | Pre-fix | Post-fix |
|---|---|---|---|
| 1 | `smoke:sports-poster-classifier` | PASS | PASS |
| 2 | `smoke:sports-poster-adapter` | PASS | PASS |
| 3 | `smoke:sportcult-category-map` | PASS | PASS |
| 4 | `smoke:sports-resolution` | **FAIL** | **PASS** ✅ |
| 5 | `smoke:sport-backdrops` | PASS | PASS |
| 6 | `smoke:sports-poster-render` | PASS | PASS |
| 7 | `smoke:sports-team-vs-team` | PASS | PASS |
| 8 | `smoke:sports-competitor-vs-competitor` | PASS | PASS |
| 9 | `smoke:sports-single-event-motorsport` | PASS | PASS |
| 10 | `smoke:sports-broadcast` | PASS | PASS |
| 11 | `smoke:sports-artwork` | PASS | PASS |
| 12 | `smoke:sports-catalog-seeds` | PASS | PASS |

(Mid-run regression note: an over-aggressive first cut of the F3 fix consumed `Day` + `2` together in the `Valero Texas Open Day 2` smoke fixture. Backed off to the compact-form-only strip; standalone `Day` is preserved. Captured in `.claude/proofs/sports-artwork/audit-after-fixes.log`. Final passing run is `audit-after-fixes-final.log`.)

### I.3 Parser proof re-run after fixes

| Title | Before | After |
|---|---|---|
| `EPL.2026.03.15.Manchester.United.vs.Chelsea...` | date=`2026-03-15`, eventClass=`team_vs_team` | date=`2026-03-15`, **eventYear=`2026`**, eventClass=`team_vs_team` |
| `UFC.311.Early.Prelims.2026.01.18...` | date=`2026-01-18`, session=`Early Prelims`, eventClass=`combat_event` | date=`2026-01-18`, **eventYear=`2026`**, session=`Early Prelims`, eventClass=`combat_event` |
| `F1.2026.Round.04.Bahrain.Grand.Prix.Qualifying...` | date=`(none)`, eventClass=`motorsport_event` | **eventYear=`2026`**, round=`Round 04`, session=`Qualifying`, eventClass=`motorsport_event` |
| `PGA.2026.The.Masters.Round.2.1080p` | date=`(none)`, round=`Round 2`, eventClass=`golf_event` | **eventYear=`2026`**, round=`Round 2`, eventClass=`golf_event` |
| `Tennis.2026.Wimbledon.Navratilova.v.Player.720p` | date=`(none)` | **eventYear=`2026`**, eventClass=`tennis_or_snooker_match` |
| `FA.Cup.2026.Final.Team.A.v.Team.B.1080p` | date=`(none)` | **eventYear=`2026`**, eventClass=`team_vs_team` |
| `WRC.2026.Catalunya.Day3.Tanak.Highlights.1080p` | round=`(none)`, display=`Day3 Tanak Highlights` | **eventYear=`2026`**, **round=`Day 3`**, **display=`Tanak Highlights`** (Tanak driver name surfaces naturally per Q5.3) |
| `WWE.Royal.Rumble.2026.01.31.PPV...` | eventClass=`combat_event` ❌ | **eventClass=`wrestling_event`** ✅ |

### I.4 Updated verdict

**READY** for the 4 audit-found bugs. Remaining caveats unchanged from §F5 (logo-suppression image audit), §F6 (wrestling=event-show shape — contract roadmap), §F7 (motorsport-4k bucket — Phase 5 backlog), §F8 (UFC "COMPETITOR ONE/TWO" labels — cosmetic), §F10 (live HTTP route capture not run — needs `npm start`).

The contract document still needs your sign-off before Phase 3 implementation of those forward-looking changes begins.
