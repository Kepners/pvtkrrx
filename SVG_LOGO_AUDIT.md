# Sports Poster Logo / SVG Readiness Audit

> **Governed by:** [MD_DIRECTIVES.md](MD_DIRECTIVES.md) DIRECTIVE 001 (CRITICAL — RELEASE BLOCKER)
> **Owner:** `/ccc:pm` (execution via `/ccc:production` / Codex) — independently verified by `/ccc:auditor`
> **Created:** 2026-05-15
> **Audited:** 2026-05-15 — independent GROUND-TRUTH pass (Codex owns the FIX; this artifact is the verifiable gate)
> **Status:** 🔴 OPEN — GROUND TRUTH ESTABLISHED, FIX PENDING (Codex)

## 2026-05-26 Sync Note

This is a historical ground-truth audit. Source-level sports parser/artwork smokes passed on 2026-05-26, but this live per-league table has not been re-run against Coolify/Stremio after the main merge. Treat rows below as the original failure baseline, not current proof.

Current local proof:
- PASS: `npm run smoke:sports-parser`
- PASS: `npm run smoke:sports-resolution`
- PASS: `npm run smoke:sports-artwork`
- PASS: `npm run smoke:free-tier-artwork`

Remaining caveat: no live Coolify/Stremio visual re-audit was performed in this cleanup pass. Do not use this file to claim current live failure or current live success without re-running the table.

This table is the proof artifact. A poster family is **PASS** only if it shows real crests/marks, OR clean deterministic initials with a proven upstream data gap. **BLANK** squares and **DUP-LEAGUE / SAME-TEAM** (same crest both sides) are automatic **FAIL** and block release.

---

## 0. CRITICAL CORRECTION — the directive's assumed endpoints do not exist

MD probe + `.claude/briefs/team-vs-team-fix.md` §1.2 assume PVTKRRX requests `https://sportsmeta.pvtkrrx.cc/asset/team/{league}/{slug}` and `/asset/league/{league}`. **Those routes are not implemented on SportsMeta and PVTKRRX never builds them.** Probed live 2026-05-15 — every form returns `HTTP 404 application/json`:

| Probed URL | Result |
|---|---|
| `/asset/team/nhl/ottawa-senators` | `404 application/json` |
| `/asset/team/hockey/ottawa-senators` | `404 application/json` |
| `/asset/team/uefa-champions-league/arsenal` | `404 application/json` |
| `/asset/team/football/arsenal` | `404 application/json` |
| `/asset/team/wnba/indiana-fever` | `404 application/json` |
| `/asset/team/basketball/indiana-fever` | `404 application/json` |
| `/asset/league/ufc` · `/asset/league/nhl` · `/asset/league/uefa-champions-league` | `404 application/json` (all) |

Source proof: `src/clients/sportsmeta.js` exports only `buildSportsMetaAssetUrl` and `buildSportsMetaDefaultAssetUrl`; **neither emits a `/team/` or `/league/` path**. The MD's "404 for real teams" is probing a route that was never built — a documentation defect in the brief/CLAUDE.md, NOT a live PVTKRRX code path.

### The endpoints PVTKRRX actually uses (verified from source)

1. **`/resolve?sport=&league=&home=&away=&date=&type=event`** → `SportsMetaClient.resolveEvent()` (`sportsmeta.js:282-308`). Returns canonical `{id, homeTeam, awayTeam, assets:{}}` or `{ok:false,error:"not_found"}`.
2. **`/event/{canonicalId}`** → `SportsMetaClient.getEvent()` (`sportsmeta.js:274-280`).
3. **`/asset/{variant}/{canonicalId}`** → `buildSportsMetaAssetUrl()` (`sportsmeta.js:393-399`).
4. **`/inspect/asset/{variant}/{canonicalId}`** → `loadInspectAssetSourceUrl()` (`sportsArtworkProxy.js:855-897`). JSON exposing the real CDN `assetSourceUrl` (`sportsmeta://optimized-logo/v1/.../<urlencoded r2.thesportsdb.com url>`); `extractFetchableInspectAssetSourceUrl()` (`:836-849`) decodes it to fetch the real badge.
5. **`/asset/default/{variant}/{sportSlug}?league=&home=&away=`** → `buildSportsMetaDefaultAssetUrl()` (`sportsmeta.js:432-453`). Generic per-sport SVG. **Always SVG, never a real crest** (probed: `/asset/default/poster/{ice-hockey,hockey,football?league=…,mma?league=ufc,wrestling?league=wwe}` all `200 image/svg+xml`).

### How a fixture maps to a request (exact functions)
- League-key: `leagueSlugFor` (`sportsArtworkProxy.js:899-904`), `LEAGUE_SLUG_ALIASES` (`:906-937`), `normalizedLeagueSlug` (`:939-942`), `deriveLeagueCanonicalId` (`:944-952`).
- Sport-slug: `resolveSportSlug` (`sportsmeta.js:362-372`): `nhl→hockey`, `nba/wnba→basketball`, `ufc→mma`, `f1→motorsport`, `boxing→fighting`.
- Team-slug: **not built by PVTKRRX for the primary path** — `home`/`away` go to `/resolve` as free strings; SportsMeta returns `sportsmeta:event:{sport}|{date}|{league-slug}|{home-slug}|{away-slug}`. Local team-slug only in the override fallback `directTeamLogoUrlFor` (`:1681-1700`) — *this has the SAME-TEAM bug, Root Cause (d)*.
- Chain: `catalog.js:628` `parseSportsTitle/parseSportsEventTitle` → `catalog.js:1391` `resolveSportsPosterAsset` → `sportsArtworkProxy.js:2252` `renderTeamBadgeArtworkPng` → `loadCanonicalEvent`→`/resolve` → `loadInspectAssetSourceUrl` → `selectLogoForSlot` (`:2460-2471`) → missing slot → `renderLogoGlyphSvg` clean initials (`:2477`).
- Default runtime template: `ticket-stub` / `TICKET_STUB` is the locked free default (`sportsPosterTemplates.js:27,109-134`).

---

## Per-League / Per-Org Audit Table

Probed live 2026-05-15 against `https://sportsmeta.pvtkrrx.cc`. "PVTKRRX request" = the **real** `/resolve` + `/inspect/asset` chain.

| # | League / Org | Sample fixture | PVTKRRX request URL built | SportsMeta HTTP | Resolved result | Root cause (a/b/c/d) | PASS/FAIL |
|---|--------------|----------------|---------------------------|-----------------|-----------------|--------------------|-----------|
| 1 | NHL | Ottawa Senators v Toronto Maple Leafs | `/resolve?sport=hockey&league=NHL&home=Ottawa Senators&away=Toronto Maple Leafs&date=*` | `200 {error:not_found}` (dates 04-30/05-10/05-15/05-20 + title-only) | DUP-LEAGUE / glyph (no canonical id) | **b + d** | 🔴 FAIL |
| 2 | NHL | Chicago Blackhawks v San Jose Sharks | `/resolve?sport=hockey&league=NHL&home=Chicago Blackhawks&away=San Jose Sharks` | `200 {error:not_found}` | DUP-LEAGUE | **b + d** | 🔴 FAIL |
| 3 | NHL | Anaheim Ducks v Vegas Golden Knights (catalogued control) | `/resolve` → `sportsmeta:event:hockey\|2026-05-15\|nhl\|anaheim-ducks\|vegas-golden-knights` → `/inspect/asset/{homeBadge,awayBadge}` | `200`; `/asset/homeBadge` `200 image/webp 14236b`; `/asset/awayBadge` `200 image/webp 10126b` | REAL distinct crests (TheSportsDB `1d465t…` vs `7fd45…`) | none | 🟢 PASS |
| 4 | UEFA Champions League | Arsenal v Atletico Madrid | `/resolve?sport=football&league=UEFA Champions League&home=Arsenal&away=Atletico Madrid` | `200 {error:not_found, candidateCanonicalIds:[]}` (date + title-only) | Missing crest(s) / glyph | **b** (UCL absent from SportsMeta catalogue entirely) | 🔴 FAIL |
| 5 | WNBA / WBL | Indiana Fever v Washington Mystics | `/resolve?sport=basketball&league=WNBA&home=Indiana Fever&away=Washington Mystics` | catalogued (`wnba\|indiana-fever\|washington-mystics` present in basketball catalog) | Real crests resolvable IF parser feeds a clean tuple | **a→d** (consumption: parse/query, NOT upstream) | 🔴 FAIL (live) |
| 6 | WNBA / WBL | "Dallas Stars vs WNBA" (observed) | parser emits away="WNBA" (league token as team) | `/resolve` → `not_found` | BLANK / DUP | **d** (title-parse: away = league token) | 🔴 FAIL |
| 7 | UFC | UFC 328 Chimaev v Strickland | `/resolve?sport=mma&league=UFC&title=UFC 328` → `sportsmeta:league:mma\|ufc` (league-level only) | `200` league record; `/asset/poster` `200 image/svg`; `/inspect/asset/leagueLogo` `cached-asset image/webp` | League SVG/mark only (no per-event); blank instead of mark+fighter text | **b** (no UFC 328 event record) | 🔴 FAIL (renders blank, not clean degrade) |
| 8 | WWE | WWE EVOLVE YT | `parseSportsEventTitle` → league=WWE eventName=EVOLVE; `/resolve` | `sportsmeta-wrestling.json` → **0 metas** (no event records) | BLANK square | **b** (upstream gap) — FAIL: no clean-initials degrade | 🔴 FAIL |
| 9 | AEW | AEW Dynamite #345 | `parseSportsEventTitle` → league=AEW eventName=Dynamite | `sportsmeta-wrestling.json` → **0 metas** | BLANK square | **b** — FAIL: no clean degrade | 🔴 FAIL |
| 10 | EPL | Arsenal v Chelsea (clean) | `/resolve?sport=football&league=…&home=Arsenal&away=Chelsea` (`english-premier-league` IS catalogued) | resolvable when tuple clean | real crests if clean tuple | **d** when title carries `MW`/`Matchweek`/round noise | 🟠 CONDITIONAL FAIL |
| 11 | NBA | Detroit Pistons v Orlando Magic | `/resolve?sport=basketball&league=NBA` (`nba` present in basketball catalog) | resolvable | real crests if clean tuple | **d** if parse noisy; else PASS | 🟠 CONDITIONAL |
| 12 | MLB | Boston Red Sox v NY Yankees | `/resolve?sport=baseball&league=MLB` (`mlb` present in baseball catalog) | resolvable | real crests if clean tuple | **d** if `Makeup of`/game-state noise leaks | 🟠 CONDITIONAL |
| 13 | F1 | British Grand Prix | `parseSportsEventTitle`→league=Formula1; SINGLE_EVENT_MOTORSPORT; `motorsport` catalog 60 metas incl `formula-1` | league mark | event mark + title, no team slots (correct by design) | none | 🟢 PASS (solo by design) |
| 14 | Snooker / Tennis / Darts / Boxing | Higgins v Murphy / Alcaraz v Sinner / Littler v MVG / Fury v Usyk | classifier → COMPETITOR_VS_COMPETITOR, never TEAM_VS_TEAM | clean initials path | initials (no crest exists for individuals — correct) | none | 🟢 PASS (initials by design) |
| 15 | NFL | (any) | `/resolve?sport=american-football&league=NFL` (`nfl` present, 35 metas) | resolvable | real crests if clean tuple | **d** if parse noisy | 🟠 CONDITIONAL |

**Counts:** PASS 4 · CONDITIONAL (parse-dependent) 4 · FAIL 7. **Zero of the MD-flagged failing families currently PASS.**

**Root cause legend:** `a` = wrong league key/slug PVTKRRX sends · `b` = SportsMeta genuinely missing asset (upstream gap → must degrade to clean initials) · `c` = both · `d` = **title-parse failure: garbled / league-as-team opponent → resolve miss → blank or same-crest both sides** (new class, added per MD scope-widen).

## Catalog Title-Parse Audit (live Stremio catalog)

> Added 2026-05-15 after live evidence: catalog shows same-team crest both sides + garbled opponents ("MW 36", "WD35", "WSM"). Governed by `.claude/briefs/team-vs-team-fix.md`. Each row run live: `node -e "require('./src/utils/sportsTitleParser').parseSportsTitle(t)"`.

| # | Raw release title (sample) | Parsed home | Parsed away | Parsed league | Result | PASS/FAIL |
|---|----------------------------|-------------|-------------|---------------|--------|-----------|
| 1 | `EPL.2026.04.30.Manchester.United.vs.Manchester.City.MW36.1080p` | `Manchester United` | `Manchester City MW36` | `EPL` | GARBLED-OPPONENT (`MW36` glued to away → resolve miss) | 🔴 FAIL |
| 2 | `Soccer.EPL.2026.05.10.Manchester.United.vs.Womens.Super.League.1080p` | `Manchester United` | `Womens Super League` | `EPL` | SAME-TEAM-DUP (away = league/junk → `directTeamLogoUrlFor` haystack matches "Manchester United" for BOTH slots → Man Utd crest twice) | 🔴 FAIL |
| 3 | `Manchester United vs Brighton MW 36` | `Manchester United` | `Brighton MW 36` | `""` | GARBLED-OPPONENT (`MW 36` glued) + WRONG-LEAGUE (league dropped) | 🔴 FAIL |
| 4 | `Premier League Manchester United vs Wolverhampton Wanderers Matchweek 35` | `Manchester United` | `Wolverhampton Wanderers Matchweek 35` | `English Premier League` | GARBLED-OPPONENT (`Matchweek 35` glued) | 🔴 FAIL |
| 5 | `EPL.MW36.Manchester.United.vs.Brighton.and.Hove.Albion.2026.05.10.1080p.WEB-DL` | `MW36 Manchester United` | `Brighton and Hove Albion` | `English Premier League` | GARBLED-HOME (`MW36` glued to HOME) | 🔴 FAIL |
| 6 | `Manchester.United.vs.Manchester.City.2026.04.30.EPL.MW36.1080p.WEB.h264-FOO` | `Manchester United` | `Manchester City` | `""` | WRONG-LEAGUE (date-before-league swallows EPL) | 🔴 FAIL |
| 7 | `Manchester United vs Wolves 2026.05.10 Premier League` | `Manchester United` | `Wolves` | `""` | CORRECT teams, WRONG-LEAGUE (league dropped) | 🟠 PARTIAL FAIL |
| 8 | `NHL.2026.04.30.Ottawa.Senators.vs.Toronto.Maple.Leafs.1080p.WEB.h264-FOO` | `Ottawa Senators` | `Toronto Maple Leafs` | `NHL` | CORRECT (parser OK — failure is upstream `not_found`, class b) | 🟢 PASS (parser) |
| 9 | `NHL 2026 04 30 Chicago Blackhawks vs San Jose Sharks` | `Chicago Blackhawks` | `San Jose Sharks` | `NHL` | CORRECT (parser OK) — fails at resolve (b) | 🟢 PASS (parser) |
| 10 | `UEFA.Champions.League.2026.04.30.Arsenal.vs.Atletico.Madrid.1080p` | `Arsenal` | `Atletico Madrid` | `UEFA Champions League` | CORRECT (parser OK) — fails at resolve (b: UCL not in SportsMeta) | 🟢 PASS (parser) |
| 11 | `WNBA.2026.07.15.Indiana.Fever.vs.Las.Vegas.Aces.1080p.WEB` | `Indiana Fever` | `Las Vegas Aces` | `WNBA` | CORRECT (parser OK) — resolvable upstream; live fail is query/parse path | 🟢 PASS (parser) |
| 12 | `UFC.328.Chimaev.vs.Strickland.1080p.WEB.h264-FOO` | `Chimaev` | `Strickland` | `UFC` | CORRECT structurally; routes to combat (no team crests) | 🟢 PASS (parser) |

**Result legend:** CORRECT · GARBLED-OPPONENT (junk away token) · SAME-TEAM-DUP (home crest both slots) · WRONG-LEAGUE. **Counts:** parser CORRECT 5 · GARBLED/WRONG/DUP 7. The garble cluster is entirely EPL/football catalog-title shaped (matchweek + dotted-release noise + date-before-league).

**Origin of "MW 36" / "WD35" / "WSM" PROVEN in `src/utils/sportsTitleParser.js`:** `TEAM_TAIL_NOISE_RE` (`:14`) and `TEAM_SIDE_LEADING_COMPETITION_RE`/`TEAM_SIDE_SEASON_NOISE_RE` (`:16-18`) contain no matchweek pattern (`mw\s?\d+`, `matchweek\s?\d+`, `wd\d+`, `wsm`, `gw\d+`). So `MW36`/`Matchweek 35` survive `normalizeTeamTokens()` (`:549-582`) and `stripCompetitionSideNoise()` (`:252-279`) and concatenate onto the team name. When the date precedes the league, `parseFlexibleMatchupTitle` (`:750-826`) consumes the league into the date/season window → `league:""`. When the real opponent is absent from the feed title, the parser latches the trailing competition phrase ("Womens Super League") as the away team → the **WSM** failure and the SAME-TEAM-DUP trigger.

## Root Cause Findings

### (a) Wrong league key/slug PVTKRRX sends — NOT the dominant cause
`resolveSportSlug` correctly maps `nhl→hockey`, `wnba→basketball`, `ufc→mma`. `/resolve` accepts the league as a free string and matches server-side. Verified: clean Ligue-1 and NHL tuples resolve perfectly. Marginal only where the parser also drops the league.

### (b) SportsMeta genuinely missing the asset (upstream gap) + PVTKRRX fails to degrade cleanly
**Proven gaps — multiple slug/key/date forms all `not_found`/404:**
- **NHL Ottawa Senators vs Toronto Maple Leafs:** `/resolve` `not_found` for 2026-04-30/05-10/05-15/05-20 and title-only. Hockey catalogue = 27 metas / ~14 fixtures; **Ottawa appears in ZERO catalogued fixtures**, Toronto only vs Montreal. Toronto's crest provably exists upstream (Toronto-vs-Montreal resolves) — the *fixture record* is the gap, not the crest.
- **UEFA Champions League (all teams):** ZERO `champions-league`/`uefa-champions-league` entries in the 60-meta football catalogue. Complete upstream absence.
- **WWE / AEW:** `sportsmeta-wrestling.json` → **0 metas**. Only `sportsmeta:league:wrestling|*` records. No event artwork possible upstream.
- **UFC specific cards (UFC 328):** only `sportsmeta:league:mma|ufc` resolves (mark, `cached-asset image/webp`). No per-event UFC 328 record.

For all of these PVTKRRX returns a blank/placeholder instead of the **mandated** clean deterministic initials/mark. That degrade failure is the FAIL — the upstream gap is out of PVTKRRX scope to fix, the blank is in scope.

### (c) Both
NHL Ottawa/Toronto and WNBA-observed cases are **b+d**: upstream window gap AND title-parse can independently produce a miss; the renderer then falls to blank/duplicate instead of clean initials.

### (d) Title-parse failure → resolve miss → blank or SAME-TEAM (NEW CLASS — single biggest controllable cause)
Three proven sub-mechanisms:
1. **Round/matchweek noise glued to opponent** — `MW36`/`Matchweek 35`/`WD35` absent from every noise regex in `sportsTitleParser.js` → away = "Manchester City MW36".
2. **League consumed/dropped** — date-before-league dotted titles yield `league:""`; missing-opponent titles yield away = competition phrase ("Womens Super League" → **WSM**).
3. **SAME-TEAM-BOTH-SIDES via `directTeamLogoUrlFor` haystack collision** (`sportsArtworkProxy.js:1681-1700`): when the away slug matches no override (`teamSlug='mw-36'` / `'womens-super-league'`), the function falls through to `haystack = leagueSlugFor([team, text].join(' '))` where `text` = the **full title** (contains "Manchester United"); it then matches the Man Utd override and **returns the Manchester United crest for the AWAY slot too** → Man Utd crest on BOTH sides. The `hasRealPair` guard (`sportsPosterTemplates.js:469`) only blocks *identical strings*, so home="Manchester United" / away="MW 36" passes as a "valid" matchup. This is the exact mechanism behind the live "Manchester United vs MW 36" duplicated crest + blurred meta-detail image.

### Decisive proof — the chain works when fed a correct, catalogued tuple
```
/resolve?sport=hockey&league=NHL&home=Anaheim Ducks&away=Vegas Golden Knights&date=2026-05-15
  → 200  sportsmeta:event:hockey|2026-05-15|nhl|anaheim-ducks|vegas-golden-knights
/asset/homeBadge/<id> → 200 image/webp 14236b  (TheSportsDB 1d465t1719573796.png)
/asset/awayBadge/<id> → 200 image/webp 10126b  (TheSportsDB 7fd4521619536689.png)  ← different image
```
SportsMeta is healthy and holds the crests. Failures are (d) PVTKRRX corrupting the query via title-parse, and (b) genuine catalogue gaps where PVTKRRX skips the mandated clean-initials degrade.

### Working slug/key forms for Codex (per the directive's NHL/UCL/WNBA/UFC requirement)
- **No `/asset/team/{league}/{slug}` form exists — do NOT add calls to it.**
- Accepted form: **`/resolve?sport={sportSlug}&league={freeString}&home={team}&away={team}&date={YYYY-MM-DD}&type=event`** then **`/inspect/asset/{homeBadge|awayBadge|leagueLogo}/{canonicalId}`**:
  - **NHL** → `sport=hockey` (not `nhl`), `league=NHL`, real team names → `sportsmeta:event:hockey|<date>|nhl|<home>|<away>`. Only catalogued (date-windowed) fixtures resolve; Ottawa/Toronto not in window → must degrade to clean initials.
  - **UCL** → no working form; entirely absent from SportsMeta. Codex must degrade to clean initials (no UCL event or per-fixture crest exists).
  - **WNBA** → `sport=basketball`, `league=WNBA`, real team names (`Indiana Fever`/`Washington Mystics`) → resolvable, crests exist. Failure is purely (d) — fix parser/query and it PASSES.
  - **UFC** → per-event has no record; `sport=mma&league=UFC` → `sportsmeta:league:mma|ufc` league mark only. Render UFC mark + fighter names as text (UFC card layout), never blank, never head-to-head.
- The mandated degrade path already exists (`renderLogoGlyphSvg`, `sportsArtworkProxy.js:2477`) but is bypassed when `directTeamLogoUrlFor` haystack-matches a wrong crest or a junk away string still "resolves" one side. Fixing (d) collapses blank/dup → clean initials.

## Fix Summary

**PENDING — Codex owns the fix. The auditor does not modify code.**

Evidence-derived fix targets (for Codex; auditor will re-verify §tables post-fix):
1. **Parser noise hardening** (`src/utils/sportsTitleParser.js`): add `mw\s?\d+`, `matchweek\s?\d+`, `wd\d+`, `wsm`, `gw\d+`, `md\s?\d+` to `TEAM_TAIL_NOISE_RE`/`TEAM_SIDE_*`; strip leading round/matchweek from home; never let a competition phrase become a team; fix date-before-league so `league` is not dropped.
2. **Reject fake matchup**: extend `hasRealPair` (`sportsPosterTemplates.js:469`) so a side that is a league/competition token, a round token, or fails team-shape validation downgrades to single-team/event layout — not a fake VS.
3. **Kill the SAME-TEAM haystack collision** (`directTeamLogoUrlFor`, `sportsArtworkProxy.js:1681-1700`): the AWAY lookup must not fall back to the full-title `text` haystack when it would re-match HOME; or de-dup (same override URL home & away → drop away, use clean initials).
4. **Guarantee clean-initials degrade** for proven upstream gaps (NHL out-of-window, UCL, WWE/AEW, UFC-per-event): zero blank squares, zero duplicated logos.
5. **Do NOT add `/asset/team/*` or `/asset/league/*` calls** — they 404. Keep the `/resolve` + `/inspect/asset` chain; fix its inputs.
6. Re-run both tables; flip to all-PASS or "PASS (clean initials, upstream gap proven)".

## Auditor Sign-Off

- [x] Auditor independently established GROUND TRUTH (live SportsMeta probes + source trace + parser execution) — 2026-05-15
- [x] Endpoint-existence corrected: `/asset/team/*` & `/asset/league/*` proven non-existent (documentation defect)
- [x] Real resolution chain mapped to exact functions/line numbers
- [x] Title-parse failure proven as root-cause class (d) with reproduction
- [ ] FIX applied by Codex
- [ ] Auditor independently re-ran the full table (post-fix)
- [ ] No BLANK results remain
- [ ] No DUP-LEAGUE / SAME-TEAM results remain
- [ ] All initials fallbacks have a proven upstream gap (NHL-window, UCL, WWE/AEW, UFC-event documented)
- [ ] **Signed off by `/ccc:auditor` (post-fix re-run):** _name / date / commit_

---

*Audit artifact for MD_DIRECTIVES.md DIRECTIVE 001 — GROUND TRUTH pass complete, FIX gate open for Codex.*
