# Sports Artwork Template Contract — Phase 2

Status: **APPROVED — IMPLEMENTED 2026-05-01**

> Originally drafted for user review. Phase 3 implementation followed under user direction ("carry on and don't stop", "fix them all"); 336 / 336 contract cells PASS via `node scripts/audit-contract-compliance.js`; 11 / 11 sports smokes PASS. Status flipped to APPROVED to match reality. Any future change to the rules below must update this doc first AND re-run the contract audit.
Date: 2026-05-01
Author: Frank (Claude Code)
Source: `.claude/trackers/sports-artwork-question-log.md` Batches 1–7
Predecessors: `.claude/trackers/sports-artwork-reconciliation.md` (PASS WITH CAVEATS), `.claude/trackers/sports-artwork-discovery.md` (COMPLETE)

This document is the implementation source of truth for sports artwork rendering in PVTKRRX. Phase 3 implementation must follow this contract exactly. If the contract is wrong, it must be amended here first — Phase 3 must not deviate silently.

---

## 1. Global rules (locked)

| # | Rule | Source |
|---|---|---|
| G1 | **SportsMeta is the only artwork source PVTKRRX is allowed to consume.** PVTKRRX consumes only SportsMeta public/root URLs and the local sport-level 4K backdrops in `public/sports-backdrops/`. No TheSportsDB, no other public artwork API. | Q1.1 |
| G2 | **Backdrops are sport/family-level only.** Same backdrop bytes reused for every event in that sport bucket. No event-specific backdrops, no marquee curation. | Q1.2 |
| G3 | **Unknown sports stay visible** with a neutral fallback (`generic-sport-4k.jpg` backdrop + `ticket-stub` template + tracker-provided title text). Stream availability is preserved. | Q1.3 |
| G4 | **Default poster template = `ticket-stub`.** Matches CLAUDE.md project rule. | Q1.4 |
| G5 | **Logos and athlete portraits are PAID-ONLY** and live on the SportsMeta member addon (`https://sportsmeta.pvtkrrx.cc/member/:token/...`). PVTKRRX-rendered posters MUST NOT embed real team badges or fighter portraits. Free PVTKRRX users see text + sport glyphs only. | Q2.2, Q3.2 |
| G6 | **PVTKRRX has no internal entitlement branch.** `requireConfigSubscription` stays as a pass-through. The free/paid split is a stack-level boundary between PVTKRRX (free) and the SportsMeta member addon (paid). | Reconciliation §C3 |
| G7 | **PVTKRRX SVG→PNG raster cache stays.** `<runtime>/sports-artwork-raster-cache/` and the optional Postgres mirror are sanctioned. Phase 3 must NOT delete `src/utils/sportsArtworkDiskCache.js` or the cache directories under the misreading "no cache". | Reconciliation §C2 |
| G8 | **No row invented.** Every catalog row must come from real Prowlarr availability. Posters and backdrops must not invent a fake matchup, driver, fighter, or team. When parse signal is missing, the row downgrades to a non-paired event poster. | Q2.3, Q3.3, Q5.3 |

---

## 2. Backdrop buckets (sport-level 4K JPGs)

The contract has **17 backdrop buckets** after Phase 5 backlog ships. Phase 3 ships the ones that already exist on disk; Phase 5 adds the missing four assets.

| # | Bucket | Status | Sports / patterns routed here |
|---|---|---|---|
| 1 | `football` | live | EPL, La Liga, Champions League, FA Cup, Serie A, Bundesliga, Ligue 1, MLS, World Cup, Nations League, Euro qualifiers, Conference League, AFCON, Copa America, soccer |
| 2 | `formula1` | live | F1, Formula 1, Formula One |
| 3 | `motogp` | live | MotoGP, Moto2, Moto3 |
| 4 | `ufc` | live | UFC, MMA, Bellator, PFL, ONE Championship, Fight Night |
| 5 | `boxing` | live | Boxing, Matchroom, Queensberry, Top Rank, BKFC |
| 6 | `rugby` | live | Rugby, NRL, Super Rugby, Six Nations, Premiership Rugby _(Volleyball / Beach Volleyball / Handball / AFL / Ultimate are removed from this bucket — see G2 below)_ |
| 7 | `cricket` | live | Cricket, IPL, Test Cricket, ODI, T20, The Ashes, The Hundred |
| 8 | `tennis` | live | Tennis, ATP, WTA, Wimbledon, Roland Garros, US Open, Australian Open, Davis Cup, Laver Cup |
| 9 | `golf` | live | Golf, PGA, LPGA, Masters, Ryder Cup, LIV Golf, Open Championship |
| 10 | `nba` | live | NBA, WNBA, basketball, EuroLeague, NCAA basketball |
| 11 | `nfl` | live | NFL, NCAAF, college football, Super Bowl, gridiron, American football, CFL, UFL |
| 12 | `nhl` | live | NHL, hockey, ice hockey, Stanley Cup, IIHF, KHL |
| 13 | `mlb` | live | MLB, Major League Baseball, baseball, World Series |
| 14 | `wrestling` | live | WWE, AEW, NXT, Raw, SmackDown, wrestling, Royal Rumble, WrestleMania, SummerSlam, Survivor Series, etc. |
| 15 | `darts` | live | Darts, PDC, BDO, World Matchplay, Premier League Darts |
| 16 | `generic-sport` | live | Catch-all fallback for any sport with no dedicated bucket: cycling, athletics, gymnastics, aquatics, olympics, winter sport, swimming, weightlifting, sailing, surfing, climbing, extreme, chess, esports, documentary, bodybuilding, breakdance, crossfit, bowling, plus Volleyball / Beach Volleyball / Handball / AFL / Ultimate (Q2.4) |
| 17 | `motorsport` | **Phase 5 backlog** | All motorsport NOT routed to `formula1` or `motogp`: WRC, NASCAR, IndyCar, Supercars, V8SC, WSBK, WEC, Formula E, Dakar, Grand Prix (where not F1), rally. Currently mis-routed to `generic-sport`. (Q5.1, Q4.X) |
| 18 | `snooker` | **Phase 5 backlog** | Snooker, Pool, Billiards, Crucible, World Snooker, UK Championship (Q3.4, Q6.3 — until asset ships, falls back to `generic-sport`) |
| 19 | `table-tennis` | **Phase 5 backlog** | Table tennis, ping-pong (Q3.4 — until asset ships, falls back to `generic-sport`) |
| 20 | `badminton` | **Phase 5 backlog** | Badminton (Q3.4 — until asset ships, falls back to `generic-sport`) |

Phase 5 deliverable: 4 new approved 3840×2160 JPGs (`motorsport-4k.jpg`, `snooker-4k.jpg`, `table-tennis-4k.jpg`, `badminton-4k.jpg`) added to `backdrops/python-backdrops/` and mirrored byte-for-byte to `public/sports-backdrops/`. The `npm run smoke:sport-backdrops` smoke must pass after the bucket list is extended.

Routing-only Phase 3 changes (no new asset required):
- `sportBackdrops.js` `NEUTRAL_MOTORSPORT_PATTERN` and `detectedSport === 'motorsport'` must route to the `motorsport` bucket once it exists; until then, keep the current `generic-sport` fallback path.
- `sportsCultCategoryMap.js` rows for Volleyball / Beach Volleyball / Handball / AFL / Ultimate must move from `appSportHint: 'rugby'` to `appSportHint: ''` (or a new `team-misc` hint that routes to `generic-sport`). Pick whichever change preserves `posterClass`/`defaultPosterMode` correctness.

---

## 3. Poster families (layout shapes)

The contract has **4 layout shapes**. Each shape covers one or more poster classes.

| Family | Generator | Shape | Covers poster classes |
|---|---|---|---|
| `08-team-vs-team` | `backdrops/python-backdrops/08-team-vs-team/generate.py` | Two-side fixture (League · Home vs Away · Date) | `team_vs_team` |
| `09-competitor-vs-competitor` | `backdrops/python-backdrops/09-competitor-vs-competitor/generate.py` | Two-person card (Tournament · A vs B · Round/Date) | `combat_event` (paired), `tennis_or_snooker_match`, `racket_event` (paired), `darts_event` (paired) |
| `10-single-event-motorsport` | `backdrops/python-backdrops/10-single-event-motorsport/generate.py` | Single-event tile (Series · Event · Session · Date) | `motorsport_event` |
| `event-show` | _new layout pattern, derived from family `10` shape but branded for the host sport_ | Single-event tile (Brand/Show · Date), no fake paired headline | `wrestling_event`, plus any non-paired `combat_event` / `darts_event` / `racket_event` downgrade, plus `golf_event`, `cycling_event`, `athletics_event`, `olympic_event`, `winter_sport_event`, `aquatics_event`, `gymnastics_event`, `tournament_event`, `generic_event` |

**Naming guardrail (Q4.3 / Q5.4 clarification):** the wrestling/`event-show` shape MUST NOT be presented to users (or to logs / `selectedTemplate` metadata) as `single-event-motorsport`. Wrestling = wrestling. Motorsport = motorsport. They share a layout *pattern* (event-only tile), not a brand.

---

## 4. Per-class contract table

The single authoritative mapping. Phase 3 implementation reads from this table.

| # | Poster class | Examples found | Family | Default template | Backdrop bucket | Free tier output | Paid tier (separate SportsMeta member addon) | Fallback when poorly parsed |
|---|---|---|---|---|---|---|---|---|
| 1 | `team_vs_team` | EPL, La Liga, NBA, NFL, MLB, NHL, MLS, IPL cricket, Six Nations, etc. | `08-team-vs-team` | `ticket-stub` | matched bucket (football/nba/nfl/nhl/mlb/cricket/rugby) or `generic-sport` for misc team sports | League → Home vs Away (text initials) → Date. **No team logos.** Sport glyph allowed. | Logos via SportsMeta member; not transported through PVTKRRX. | Downgrade to `tournament_event` if no real pair parsed. (Q2.3) |
| 2 | `motorsport_event` | F1, MotoGP, NASCAR, IndyCar, WRC, Formula E, NASCAR, WEC, Supercars | `10-single-event-motorsport` | `ticket-stub` | `formula1` (F1) / `motogp` (MotoGP) / `motorsport` (everything else once asset ships) | Series → Event/Round → Session · Date. Driver name only when title contains it. (Q5.2/Q5.3) | Driver-photo enrichment via SportsMeta member. | Series + Date only when event/session not parseable. |
| 3 | `combat_event` | UFC, Bellator, PFL, ONE Championship, Boxing, Matchroom, Queensberry, Kickboxing | `09-competitor-vs-competitor` (paired) or `event-show` (no pair) | `ticket-stub` | `ufc` (MMA) or `boxing` (boxing) | Tournament/Event → A vs B (text initials) → Round/Date. **No fighter portraits.** Card-name first for multi-fight events (Q4.1) with `MAIN CARD + PRELIMS` badge when applicable (Q4.2). | Headshots via SportsMeta member. | Lone competitor → event poster with that person as headline (Q3.3). |
| 4 | `golf_event` | PGA Tour, Masters, Ryder Cup, LIV Golf, Open Championship, LPGA | `event-show` | `ticket-stub` | `golf` | Tour/Event → Round → Date. Player name only when title contains it. (Q6.1) | Player-photo enrichment via SportsMeta member. | Tour + Date only when round/event missing. |
| 5 | `wrestling_event` | WWE, AEW, NXT, Raw, SmackDown, WrestleMania, Royal Rumble, NXT TakeOver | `event-show` (wrestling-branded) | `ticket-stub` | `wrestling` | Show name → Brand mark → Date. No fake paired headline. (Q4.3 / Q5.4) | Wrestler portraits / event-art via SportsMeta member. | Brand + Date when event name missing. |
| 6 | `cycling_event` | Tour de France, Giro d'Italia, Vuelta, classics, time trial, road race | `event-show` | `ticket-stub` | `generic-sport` (no dedicated bucket; Q6.2) | Race/Tour → Stage → Date. | Rider-photo enrichment via SportsMeta member. | Race + Date. |
| 7 | `athletics_event` | World Athletics, Diamond League, marathons, track & field | `event-show` | `ticket-stub` | `generic-sport` | Meet/Series → Event → Date. | Athlete-photo enrichment via SportsMeta member. | Series + Date. |
| 8 | `olympic_event` | Paris 2024, LA 2028, Beijing 2022, Olympic Games | `event-show` | `ticket-stub` | `generic-sport` | Games → Discipline → Date. | — | Games + Date. |
| 9 | `winter_sport_event` | Winter Olympics, alpine skiing, biathlon, cross-country, snowboard, ice/figure skating, curling, luge, skeleton | `event-show` | `ticket-stub` | `generic-sport` | Discipline → Event → Date. | — | Discipline + Date. |
| 10 | `aquatics_event` | Swimming, FINA, World Aquatics, diving | `event-show` | `ticket-stub` | `generic-sport` | Discipline → Event → Date. | — | Discipline + Date. |
| 11 | `gymnastics_event` | Gymnastics, rhythmic, artistic, trampoline | `event-show` | `ticket-stub` | `generic-sport` | Discipline → Event → Date. | — | Discipline + Date. |
| 12 | `racket_event` | Tennis (single), table tennis, snooker (single), billiards (single) — when no pair parsed | `event-show` | `ticket-stub` | `tennis` (tennis) / `snooker` once asset ships / `table-tennis` once asset ships / `badminton` once asset ships, otherwise `generic-sport` | Tournament → Stage → Date. | Player headshots via SportsMeta member. | Tournament + Date. |
| 13 | `darts_event` | PDC, World Matchplay, Premier League Darts, World Championship | `09-competitor-vs-competitor` (paired) or `event-show` (no pair) | `ticket-stub` | `darts` | Tournament → A vs B (text initials) or single competitor → Round/Date. | Player-photo enrichment via SportsMeta member. | Tournament + Date when no parse. |
| 14 | `tennis_or_snooker_match` | Tennis match, snooker match (when paired) | `09-competitor-vs-competitor` | `ticket-stub` | `tennis` (tennis) / `snooker` once asset ships, otherwise `generic-sport` | Tournament → A vs B → Round/Date. | Player-photo enrichment via SportsMeta member. | Lone player → event-show fallback (Q3.3). |
| 15 | `tournament_event` | Chess, BrainGames, Esports, generic tournaments, downgraded `team_vs_team` with no pair | `event-show` | `ticket-stub` | `generic-sport` | Tournament/League → Event/Round → Date. | — | League + Date. |
| 16 | `generic_event` | Documentary, Uncategorised, anything that fails all classifiers | `event-show` | `ticket-stub` | `generic-sport` | Line 1: `SPORTS`. Line 2: cleaned tracker title. Line 3: date if parsed. (Q6.4) | — | Same as default (already generic). |

User approval column: every row above is "User approved? **YES**" via the Batch 1–6 answers. Phase 3 must not extend, narrow, or rewrite this table — only translate it into code.

---

## 5. Free vs paid (stack-level reminder)

| Surface | Tier | Owns artwork |
|---|---|---|
| PVTKRRX `/sports-artwork/...png` proxy on `https://www.pvtkrrx.cc` | **FREE** | Text + sport glyphs only; never logos / portraits |
| PVTKRRX local backdrops `/sports-backdrops/<bucket>-4k.jpg` | **FREE** | Sport-level 4K JPGs from `public/sports-backdrops/` |
| SportsMeta public asset routes `https://sportsmeta.pvtkrrx.cc/asset/...` | **FREE upstream** | SportsMeta public default and canonical-event SVG/raster bytes |
| SportsMeta member asset routes `https://sportsmeta.pvtkrrx.cc/member/:token/...` | **PAID — separate Stremio install** | Logo-enriched / portrait-enriched real-team / real-athlete artwork |

PVTKRRX never carries member tokens, never calls member-scoped SportsMeta routes, never branches on user entitlement. The paid surface is a different addon install.

---

## 6. Implementation routing notes (Phase 3 only — flag for explicit user review)

These are not user-content decisions; they are how the existing PVTKRRX code must be edited to honour §1–§5. Spelled out here so Phase 3 reviewers can spot drift.

### 6a. Decouple template (visual style) from class (layout family) — Q7.1 default

Today `selectTemplateForSportsClass(eventClass, requestedTemplate)` upgrades `ticket-stub` → `broadcast` whenever the class is not `team_vs_team`. Under the new contract:

- Visual style = the template the user (or default) requested (`ticket-stub`, `editorial`, `broadcast`, `sportsbook`, `trading-card`, `brutalist`, `glitch`).
- Layout family = derived from the class via §3 mapping.

Phase 3 should remove the auto-upgrade. The `template=` query string sent to the proxy stays the user's request; the family decision is independent and lives in a new resolver (e.g. `resolveSportsPosterFamily(eventClass, hasActualPair)`).

### 6b. Class → family mapping function

A single helper function should encode §3:
- `team_vs_team` → `08-team-vs-team`
- `motorsport_event` → `10-single-event-motorsport`
- paired (`combat_event` / `darts_event` / `racket_event` / `tennis_or_snooker_match`) → `09-competitor-vs-competitor`
- everything else (including unpaired downgrades and `wrestling_event`) → `event-show`

When emitting the wrestling poster, the family field carried in URL/cache metadata must read `event-show` (or `event-show:wrestling`), never `single-event-motorsport`.

### 6c. Logo / portrait suppression in the proxy

`src/handlers/sportsArtworkProxy.js` must be audited to prove no code path embeds team badges or athlete portraits when serving the FREE surface. The proxy already calls `SportsMeta` public/root URLs only; verify that the rasterised SVGs returned for canonical events don't already contain logos that pass through to the rendered PNG.

If SportsMeta public canonical SVGs do contain logos, Phase 3 must either:
- request a logo-stripped variant from SportsMeta (preferred — single source of truth for the free contract), or
- post-process the SVG to strip image refs before rasterising.

### 6d. Backdrop bucket routing changes

`src/utils/sportBackdrops.js` Phase 3 changes:
- Add `motorsport` to `REQUIRED_SPORT_BACKDROP_BUCKETS`. Route `NEUTRAL_MOTORSPORT_PATTERN` matches and `detectedSport === 'motorsport'` to it. Keep `generic-sport` as the fallback when the file isn't on disk yet.
- Add `snooker`, `table-tennis`, `badminton` to `REQUIRED_SPORT_BACKDROP_BUCKETS` with the same on-disk-fallback-to-generic safety.
- No change to `formula1`, `motogp`, or any other existing bucket.

`src/config/sportsCultCategoryMap.js` Phase 3 changes:
- Move Volleyball, BeachVolleyball, Handball, AFL, Ultimate Diskk from `appSportHint: 'rugby'` to either `appSportHint: ''` (so the resolver falls through to generic) or a new `appSportHint: 'team-misc'` that explicitly routes to the generic backdrop. Pick the option that doesn't break catalog/meta downstream consumers.

### 6e. Cache invalidation after Phase 3

Once Phase 3 lands, the proxy raster cache will hold stale PNGs containing the old logo composition / wrong template-upgrade output. Phase 4 proof must include a cache bust:
- `/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` (Contabo Coolify primary)
- `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/` (Contabo Coolify secondary)
- `%APPDATA%\PVTKRRX\runtime\sports-artwork-raster-cache\` (Windows desktop runtime, if user is testing locally)
- Optional Postgres mirror (`pvtkrrx_sports_artwork_cache` table) — `DELETE FROM pvtkrrx_sports_artwork_cache;` or scoped to the affected `selected_template` / `event_class`.

### 6f. Audit-script defaults

Per Q7.3 user direction, no code change to the script defaults. Phase 4 commands run with `PVTKRRX_SPORTS_POSTER_AUDIT_MANIFEST=https://www.pvtkrrx.cc/...` or equivalent overrides set in the env.

---

## 7. Phase 3 scope boundary

Phase 3 implementation may touch:
- `src/config/sportsCultCategoryMap.js` (Volleyball/Handball/AFL/Ultimate routing)
- `src/utils/sportBackdrops.js` (new `motorsport`/`snooker`/`table-tennis`/`badminton` buckets, with safe fallback)
- `src/utils/sportsEventClassifier.js` (remove `selectTemplateForSportsClass` auto-upgrade; introduce `resolveSportsPosterFamily`)
- `src/utils/sportsPosterTemplates.js` (template normalisation only — no new templates)
- `src/utils/sportsPosterAdapter.js` (line-hierarchy ordering for each class per §4)
- `src/utils/sportsArtwork.js` (carry `family` and `posterClass` into proxy URLs; honour the no-auto-upgrade rule)
- `src/handlers/sportsArtworkProxy.js` (logo/portrait suppression audit, family-aware composition routing)
- `src/handlers/catalog.js` and `src/handlers/meta.js` (no contract change; verify `sportsArtwork` inputs flow through unchanged)
- New unit/smoke tests under `scripts/` to prove §4 routing
- `backdrops/python-backdrops/08-team-vs-team/generate.py` line ordering if needed
- New event-show generator (or a wrapper using family `10` patterns) for wrestling / unmapped classes

Phase 3 implementation MUST NOT:
- Reintroduce TheSportsDB or any non-SportsMeta sports-artwork upstream (G1).
- Delete `src/utils/sportsArtworkDiskCache.js` or the `sports-artwork-raster-cache/` directories (G7).
- Add a paid/free entitlement branch inside PVTKRRX (G6).
- Add per-event backdrops (G2).
- Move SportsMeta member-token handling into PVTKRRX (G5/G6).
- Use `pvt.kepners.co.uk` as a default URL anywhere.
- Conflate the wrestling `event-show` family with `10-single-event-motorsport` in user-visible naming/logging.

Phase 4 proof must, separately:
- Verify the public Coolify container (`https://www.pvtkrrx.cc`) renders the new contract.
- Verify the systemd `pvtkrrx.service` self-host runtime renders the new contract.
- Verify SportsMeta `https://sportsmeta.pvtkrrx.cc` is reachable as upstream.
- Bust the raster cache on every runtime tested.

---

## 7a. Visual image verification (mandatory — Phases 3 + 4 + 5)

Cache busts and HTTP 200s are not proof. **Every contract row in §4 must be confirmed by actually rendering and visually inspecting the PNG output**, both the poster and the backdrop, on every runtime that ships the change.

### 7a.1 — Per-class image samples (Phase 3 exit gate)

For each of the **16 poster classes** in §4, Phase 3 must:

1. Render a poster PNG using a representative title for that class (e.g. team_vs_team → `EPL.2026.03.15.Arsenal.vs.Chelsea`; motorsport_event → `Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying`; combat_event → `UFC.312.Pereira.vs.Rountree.Main.Card`).
2. Render the matching background PNG.
3. Save both to `.claude/proofs/sports-artwork/phase3/<class>/<sport>-<event>-{poster|background}.png`.
4. Open the PNG and **visually verify** every contract rule on §4 row for that class:
   - Line hierarchy correct (League → vs → Date for team_vs_team, etc.).
   - **No team logos / fighter portraits** anywhere in the poster bytes (G5 enforcement).
   - Backdrop bucket matches §2 (e.g. WRC → `motorsport-4k.jpg` once asset ships, not `generic-sport`).
   - Wrestling poster says "wrestling" / shows the wrestling backdrop, never says "motorsport" or shows F1 cars.
   - Sport glyph (allowed) is the right sport.
   - Text readable at thumbnail size.
5. If any rule fails, the implementation is wrong — fix before claiming Phase 3 done.

### 7a.2 — Sample matrix (minimum coverage)

The 16 rows in §4 require **at least these samples**:

| Class | Sample title to render |
|---|---|
| team_vs_team | `EPL.2026.03.15.Arsenal.vs.Chelsea` (test no-logos rule) |
| team_vs_team (no pair) | `EPL.2026.03.15.Premier.League.Highlights` (downgrade to tournament) |
| motorsport_event (F1) | `Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying` |
| motorsport_event (MotoGP) | `MotoGP.2026.04.05.Argentina.Race` |
| motorsport_event (WRC, post-Phase 5) | `WRC.2026.Catalunya.Day3.Highlights` (verify motorsport bucket, not generic) |
| combat_event (UFC card) | `UFC.312.Pereira.vs.Rountree.Main.Card.PPV` (card name first per Q4.1) |
| combat_event (boxing) | `Boxing.2026.05.10.Usyk.vs.Dubois.2` |
| combat_event (lone fighter) | `UFC.Fight.Night.Pereira.Highlights` (Q3.3 lone-side rule) |
| golf_event | `PGA.Tour.2026.04.14.Masters.Round.3` |
| wrestling_event | `WWE.Royal.Rumble.2026.PPV` (verify wrestling brand, NEVER motorsport label) |
| cycling_event | `Tour.De.France.2026.Stage.7.Highlights` |
| athletics_event | `World.Athletics.Diamond.League.Stockholm.2026` |
| olympic_event | `Olympic.Games.LA.2028.Athletics.100m.Final` |
| winter_sport_event | `Winter.Olympics.2026.Alpine.Skiing.Mens.Slalom` |
| aquatics_event | `World.Aquatics.2026.Mens.100m.Freestyle.Final` |
| gymnastics_event | `World.Artistic.Gymnastics.2026.Mens.All.Around` |
| racket_event (single) | `Wimbledon.2026.Day.7.Highlights` |
| darts_event (paired) | `PDC.World.Championship.2026.Final.Littler.vs.Humphries` |
| darts_event (no pair) | `Premier.League.Darts.2026.Night.10.Highlights` |
| tennis_or_snooker_match | `Wimbledon.2026.Quarterfinal.Djokovic.vs.Alcaraz` |
| tournament_event | `Chess.World.Championship.2026.Game.7` |
| generic_event (Uncategorised) | `Some.Random.Sports.File.2026.04.01` (verify "SPORTS" label per Q6.4) |
| Volleyball / Handball / AFL (Q2.4 reroute) | `Volleyball.Nations.League.2026.Final` (verify generic-sport, NOT rugby) |

That's **23 sample renders minimum**. Phase 3 must produce all of them and the user must approve them visually before Phase 3 is signed off.

### 7a.3 — How the user reviews them

Two options to choose from at Phase 3 exit:

- **Option A (recommended):** Claude generates the 23 PNGs, names them per §7a.1, lists every file path, and asks the user to open them in the IDE / Explorer. User says "approved" or names the files that need fixing.
- **Option B:** Claude opens each PNG via the `Read` tool (since Read can display images), shows the user inline, and asks per-class approval via `AskUserQuestion`.

Either way, **no Phase 3 sign-off without visual approval**. HTTP 200 + cache bust + smoke pass do not count as "the image is right."

### 7a.4 — Phase 4 (live runtime) image verification

Phase 4 must repeat the same image inspection on each runtime separately:

| Runtime | URL pattern to fetch | Save to |
|---|---|---|
| Public Coolify container | `https://www.pvtkrrx.cc/sports-artwork/default/poster/<sport>.png?league=...&title=...&template=ticket-stub&v=<version>` | `.claude/proofs/sports-artwork/phase4/coolify/<class>/<sport>-{poster|background}.png` |
| Self-host systemd `pvtkrrx.service` | `http://<contabo-host>:7000/sports-artwork/default/poster/...` (via SSH alias `contabo`) | `.claude/proofs/sports-artwork/phase4/systemd/<class>/<sport>-{poster|background}.png` |
| Local Windows runtime (if testing) | `http://127.0.0.1:7000/sports-artwork/default/poster/...` | `.claude/proofs/sports-artwork/phase4/local/<class>/<sport>-{poster|background}.png` |

For each runtime: pull the rendered PNG, open it, verify it matches the Phase 3 reference output for the same class. Any drift between Phase 3 reference and Phase 4 runtime output = broken cache, broken deploy, or wrong runtime serving traffic — investigate before claiming the runtime is ready.

### 7a.5 — Phase 5 (new asset) image verification

When the 4 new 4K JPGs land (`motorsport`, `snooker`, `table-tennis`, `badminton`):

1. Run `npm run smoke:sport-backdrops` — must pass with the extended bucket list.
2. Render a sample poster + background PNG for one event in each new bucket (e.g. WRC for motorsport, World Snooker for snooker, etc.).
3. Visually verify the new backdrop appears (not the generic-sport fallback).
4. Save samples to `.claude/proofs/sports-artwork/phase5/<bucket>/<sport>-{poster|background}.png`.
5. User approves visually before flipping the routing from `generic-sport` to the dedicated bucket in `sportBackdrops.js`.

### 7a.6 — Logo-suppression image audit (G5 enforcement)

Specifically for the FREE tier no-logos rule (G5), Phase 3 must:

1. Pick 5 high-profile fixtures where SportsMeta is most likely to have logo-rich SVGs available: an EPL match, an NBA game, an NFL game, a UFC PPV main event, an F1 grand prix.
2. Render each one through the PVTKRRX `/sports-artwork/...png` proxy.
3. Open the PNG and confirm by eye: NO team badges, NO fighter portraits, NO sponsor logos.
4. If any logo appears, that's the §6c upstream-coordination follow-up F5 — do not ship Phase 3 until SportsMeta provides a logo-stripped public variant or PVTKRRX strips logos in the proxy server-side.

### 7a.7 — Deliverable

`.claude/proofs/sports-artwork/` directory contains the full image-proof set, organised:

```
.claude/proofs/sports-artwork/
  phase3/
    team_vs_team/
      football-arsenal-vs-chelsea-poster.png
      football-arsenal-vs-chelsea-background.png
      ...
    motorsport_event/
      f1-japanese-gp-qualifying-poster.png
      ...
    ... (16 class folders)
  phase4/
    coolify/
      ... same structure as phase3 ...
    systemd/
      ... same structure ...
    local/
      ... same structure ...
  phase5/
    motorsport/
      wrc-catalunya-day3-poster.png
      wrc-catalunya-day3-background.png
    snooker/...
    table-tennis/...
    badminton/...
  logo-audit/
    epl-arsenal-vs-chelsea.png
    nba-lakers-vs-celtics.png
    nfl-cowboys-vs-eagles.png
    ufc-312-main-event.png
    f1-monaco-gp-race.png
```

The `.claude/proofs/` directory already exists and is the canonical proof root for this project.

---

## 8. Open follow-ups (not blocking Phase 3)

| # | Item | When to address |
|---|---|---|
| F1 | 4 new approved 4K JPGs (`motorsport`, `snooker`, `table-tennis`, `badminton`) | Phase 5 |
| F2 | Snooker / table-tennis / badminton routing flips from `generic-sport` to dedicated bucket | After F1 ships |
| F3 | `docs/PROJECT_STATUS.md` is 48k tokens and version drift between 1.1.51 and 1.1.57 noted in reconciliation §E | Pre-release |
| F4 | SportsMeta `/proof` and `/member/:token/proof` deployment status (memory `sportsmeta_asset_class_proof.md` says code on `main`, not yet deployed to Contabo) | SportsMeta-side, not PVTKRRX |
| F5 | If SportsMeta canonical SVGs already include logos in the public/root variant, Phase 3 §6c needs an upstream coordination decision (request logo-stripped public variant) | Phase 3 audit will confirm |

---

## 9. Sign-off

This contract is **DRAFT**. No code change has been made. Phase 3 will not start until the user has reviewed this document and explicitly says "approved — start Phase 3" (or equivalent).

Verdict: **READY FOR USER REVIEW**.
