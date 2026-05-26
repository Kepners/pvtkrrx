# Sports Title Parser — Target Contract & Learning Ledger

> **Governed by:** [MD_DIRECTIVES.md](MD_DIRECTIVES.md) DIRECTIVE 002
> **Owner:** MD (Mr Gurr). Execution: Production/Codex. Verification: Auditor.
> **Created:** 2026-05-15. **Updated:** 2026-05-16. **Status:** 🟢 SATURATED — 14 client-annotated batches logged, ~20 defect classes, all field decisions locked. Taxonomy stable; ready for the staged implementation plan. Still LIVING (append new genuinely-novel formats), but recent batches confirm existing classes rather than reveal new ones.
> **Source code under correction:** `src/utils/sportsTitleParser.js` (`parseSportsTitle`, `parseSportsEventTitle`), consumed by `src/handlers/catalog.js:628`.

This is the contract the corrected parser MUST satisfy. It is built from the client's own annotated examples — not assumptions. Each example is logged with: raw title → what the current code produces → what the client requires → defect classes.

---

## 1. Target field schema (non-vs / single-event path)

| Field | Definition | Client examples |
|---|---|---|
| `sport` | Series/championship identity, **qualifier preserved**. Never empty — unmapped → `Others` (see §6) | `IndyCar NTT`, `IndyCar NXT`, `IndyCar Series`, `Boxing`, `Others` |
| `year` | Standalone season year | `2026` |
| `round` | Named race or round number | `Indy500`, `R06`, `Round05` |
| `gameNumber` | **NEW FIELD** — series/playoff game identifier (kept, NOT discarded) | `Round 10 Game 1` (AFL), `Game 5` (NBA/NHL playoffs), `QF Game 4` |
| `venue` | **NEW FIELD** — circuit/location | `Indianapolis`, `Long Beach` |
| `session` | Session type incl. multi-part | `Practice 1 & 2`, `Race`, `Qualifying`, `FP2` |
| `date` | `DD MM` (year from `year` token) or `DD MM YYYY` | `14 05` (+`2026` → `2026-05-14`), `05 09 2026` |
| `quality` | Resolution / fps | `720pEN60fps`, `1080p60fps` |
| `format` | **NEW FIELD** — source + container + codec | `WEB DL 1080p H264` |
| `language` | **NEW FIELD** — audio language | `English`, `EN` |
| `tvChannel` | **NEW FIELD** — captured ONLY for tokens the client explicitly designates as a channel to keep | `DAZN`, `ProBox` (client-named so far) |
| _(discard)_ | RUBBISH = scene groups **AND** all stations/broadcasters the client called rubbish | `FS1`, `FS2`, `FOX`, `STAN`, `SkyF1`, `MWR`, `Z3R0` |

**Locked decision (2026-05-15):** venue is its own field; `Race`/`Practice`/`Qualifying`/`FP2` are all `session` (Example-A logic). `Race` is NOT folded into `round`.

**HARD RULE (correction 2026-05-15):** TV-channel-vs-rubbish is the **client's explicit per-token call**, NOT a derivable "broadcaster = field" rule. The client stated `FS1`/`FOX`/`STAN` = RUBBISH (Batch 1) and `DAZN`/`ProBox` = `tvChannel` (Batch 2). Do **NOT** generalize one into the other. An earlier spec revision wrongly reclassified `FS1`/`FOX`/`STAN` as `tvChannel` by inference — that was an override of an explicit instruction and is reverted. Default for any unknown station/group token = **RUBBISH** until the client explicitly says keep it as `tvChannel`.

### 1a. Combat / fighter-vs-fighter sub-schema (boxing, MMA, UFC)

Client decision (2026-05-15): combat events are a **single `event` string**, NOT split into `homeTeam`/`awayTeam`. No two-crest head-to-head poster (consistent with saved UFC card-layout guidance).

| Token group | → Field |
|---|---|
| `Carter Efe vs Portable` | `event` (whole "A vs B" string, one field) |
| `DAZN` / `ProBox` | `tvChannel` |
| `Full Event` / `Main Event` / `Main Card` / `Prelims` | `session` |
| `01 05 26` | `date` (`DD MM YY` → `2026-05-01`) |
| `Z3R0` | discard (scene group) |
| `720p` / `1080p` | `quality` |
| (from indexer/category) | `sport` = `Boxing` |

## 2. Sport taxonomy — web-verified (do NOT collapse)

`NTT INDYCAR SERIES` (premier championship) and `INDY NXT by Firestone` (official **development/feeder** series) are **different championships** that race the same weekends on the same tracks (indycar.com / indynxt.com / Wikipedia, confirmed 2026-05-15).

- `IndyCar NTT`, `IndyCar Series`, `Indycar Series` → **NTT IndyCar Series** (premier)
- `IndyCar NXT` → **Indy NXT** (feeder — DIFFERENT identity, different artwork)

The parser must keep the qualifier so NXT events are never branded as the premier series.

## 3. Current code vs target — defect taxonomy

| Class | Defect | Fix obligation |
|---|---|---|
| `SPORT-QUALIFIER-LOST` | `league="Indycar"`, qualifier (`NTT`/`NXT`/`Series`) dumped into name | Emit `sport` with qualifier; map NXT≠NTT |
| `LEAGUE-MISCASE` | `titleCase` lowercases `IndyCar`→`Indycar` (not in upperTokens) | Correct casing for series labels |
| `DATE-DDMM-MISSED` | `DD MM` + separate year not parsed (18/19 had empty `date`) | Parse `DD MM`, bind to `year` token |
| `SESSION-SHREDDED` | `Practice 1 & 2` → `&` only | Preserve full multi-part session string |
| `RUBBISH-LEAK` | `STAN`/`Series`/`RC` survive into `eventName` | Strip broadcaster + scene group fully |
| `ROUND-NOT-LIFTED` | `Indy500` left in name instead of `round` | Recognise named races as `round` |
| `NO-VENUE-FIELD` | Venue mixed into mangled name | Add `venue` field |
| `NO-FORMAT-FIELD` | source/codec discarded silently, not categorised | Add `format` field |
| `NO-LANGUAGE-FIELD` | `English`/`EN` not surfaced | Add `language` field |
| `SESSION-GAP` | `Practice 12/13`, typo `Pracitce` unrecognised | Broaden session detection / fuzzy |
| `COMBAT-SPLIT-WRONG` | Combat (boxing/MMA/UFC) split into `homeTeam`/`awayTeam`; client wants ONE `event` string, no head-to-head | Combat path emits single `event="A vs B"`, no home/away, no two-crest poster |
| `BROADCASTER-NOT-CAPTURED` | Broadcaster discarded or leaked instead of captured as `tvChannel` | All broadcasters → `tvChannel` field, cross-sport |
| `MISLABELED-COMPETITION-TOKEN` | Title league token is wrong (`EPL` for Celtic vs Rangers = Scottish) | Known-club → competition/country map overrides the title token; clubs are ground truth |
| `AT-SEPARATOR-UNHANDLED` | `A at B` / `A @ B` (US away@home) not a separator → no split; and when split, first team is AWAY not home → teams reversed | Add `at`/`@` as separators; first side = AWAY, second = HOME for that convention |
| `TENNIS-YEAR-INDEX-DROPS-DATE` | Tennis year-index path slices past an explicit `DD MM (YYYY)` date between tournament name and players → date lost | Capture the pre-player date before the tennis slice |
| `SLASH-DATE-MISSED` | `2026/05/10` not parsed (`extractFallbackDate` separator class `[._\s-]` excludes `/`) | Add `/` to date separators |
| `GAMENUMBER-LOST` | `R2, GM3` / `Game 5` / `Round 10 Game 1` stripped as noise instead of captured | Emit `gameNumber`; never let it destroy the team (see `LEADING-ROUND-NOISE-DESTROYS-TEAM`) |

### Batches 8-14 ledger summary

Batches 8-14 (boxing/IndyCar already 1-3; these are 8-14: MLB RS, MLS, EuroLeague, NBA, NCAA, AFL, F1, WWE, SUMO, MLBN, SC, WTA, ATP, IPL, RSL, cricket, Giro, NASCAR, NHL, Bundesliga, Eredivisie, Segunda, WNBA, Scottish) **largely CONFIRM existing defect classes** — they are not producing many new ones. Recurring: `SEASON-QUALIFIER-BREAKS-YEAR-HINT` (RS/Playoffs → title date → pubDate), `COMPETITION-DROPPED-NOT-IN-LEAGUEMAP` (non-English leagues), `ANCILLARY-CONTENT-AS-EVENT` (studio/recap/replay/commentary shows), `GAMENUMBER-LOST`, `EVENTTITLE-IGNORES-LEAGUEMAP`. Genuinely new: `MISLABELED-COMPETITION-TOKEN`, `AT-SEPARATOR`, `TENNIS-YEAR-INDEX-DROPS-DATE`, `SLASH-DATE-MISSED`, `WRONG-DATE-INTERPRETATION`. The taxonomy is now saturated — strong basis for the implementation plan.

## 4. Worked-example ledger

### Batch 1 — IndyCar (motorsport / single-event), client-annotated 2026-05-15

Representative current-code output vs required (full 19-row trace in conversation):

| Raw title | Current code | Required (client schema) | Defects |
|---|---|---|---|
| `IndyCar NTT 2026 Indy500 Practice 1 & 2 14 05 720pEN60fps FS1` | league=`Indycar`, date=``, eventYear=`2026`, eventName=`NTT Indy500 &`, session=`Practice 1` | sport=`IndyCar NTT`, year=`2026`, round=`Indy500`, session=`Practice 1 & 2`, date=`2026-05-14`, quality=`720pEN60fps`, drop `FS1` | SPORT-QUALIFIER-LOST, DATE-DDMM-MISSED, SESSION-SHREDDED, ROUND-NOT-LIFTED, RUBBISH-LEAK, LEAGUE-MISCASE |
| `IndyCar Series 05 09 2026 R06 Indianapolis Race FOX 1080p60fps` | league=`Indycar`, date=`2026-09-05`, eventName=`Series Indianapolis`, session=`Race`, round=`R 06` | sport=`IndyCar Series`, date=`2026-09-05`, round=`R06`, venue=`Indianapolis`, session=`Race`, quality=`1080p60fps`, drop `FOX` | SPORT-QUALIFIER-LOST, NO-VENUE-FIELD, RUBBISH-LEAK, LEAGUE-MISCASE |
| `Indycar Series 2026 Round05 Long Beach Race STAN WEB DL 1080p H264 English MWR` | league=`Indycar`, date=``, eventName=`Series Long Beach STAN`, session=`Race`, round=`Round 05` | sport=`IndyCar Series`, year=`2026`, round=`Round05`, venue=`Long Beach`, session=`Race`, format=`WEB DL 1080p H264`, language=`English`, drop `STAN`,`MWR` | SPORT-QUALIFIER-LOST, RUBBISH-LEAK, NO-VENUE-FIELD, NO-FORMAT-FIELD, NO-LANGUAGE-FIELD, DATE-DDMM-MISSED |

**Pattern findings (batch 1):** parser path = `parseSportsEventTitle` for all (no `vs`, on `EVENT_LEAGUE_RE` allow-list). `eventYear` IS extracted on all 19 → the "no year on poster" symptom for IndyCar is **downstream rendering** (poster keys off empty `date`, ignores `eventYear`), not the parser.

### Batch 2 — Boxing (combat / fighter-vs-fighter), client screenshot 2026-05-15

Path = `parseSportsTitle` → `parseFlexibleMatchupTitle` (no dots, has `vs`). 14 titles traced. Full table in conversation. Representative:

| Raw title | Current code | Required (client schema) | Defects |
|---|---|---|---|
| `Boxing 2026 Naoya Inoue vs Junto Nakatani Main Event 02/05 720pEN50fps DAZN` | league=`Boxing`, date=`2026-05-02`, home=`Naoya Inoue`, away=`Junto Nakatani` (works) | sport=`Boxing`, year=`2026`, fighters=`Naoya Inoue` / `Junto Nakatani`, session=`Main Event`, date=`2026-05-02`, quality=`720p`, language=`EN`, drop `DAZN` | SESSION-NOT-CAPTURED, NO-LANGUAGE-FIELD, QUALITY-NOT-EXTRACTED |
| `DAZN Carter Efe vs Portable Full Event 01 05 26 Z3R0 720p` | league=``, date=``, eventYear=``, home=`Carter Efe`, away=`Portable` | sport=`Boxing`, fighters=`Carter Efe`/`Portable`, session=`Full Event`, date=`2026-05-01`, quality=`720p`, drop `DAZN`,`Z3R0` | TWO-DIGIT-YEAR-MISSED, STREAMER-AS-LEAGUE-LOST, SESSION-NOT-CAPTURED, QUALITY-NOT-EXTRACTED |
| `ProBox Erdenebat vs Breedy Full Event 01 05 26 Z3R0 1080p` | league=``, date=``, eventYear=``, home=`ProBox Erdenebat`, away=`Breedy` | sport=`Boxing`, fighters=`Erdenebat`/`Breedy`, session=`Full Event`, date=`2026-05-01`, quality=`1080p`, drop `ProBox`,`Z3R0` | TWO-DIGIT-YEAR-MISSED, BROADCASTER-PREFIX-LEAK, STREAMER-AS-LEAGUE-LOST, SESSION-NOT-CAPTURED |
| `DAZN Whittaker vs Suarez Prelims 18 04 26 Z3R0 720p` | league=``, date=``, home=`Whittaker`, away=`Suarez Prelims` | sport=`Boxing`, fighters=`Whittaker`/`Suarez`, session=`Prelims`, date=`2026-04-18`, quality=`720p` | TWO-DIGIT-YEAR-MISSED, SESSION-NOT-CAPTURED (Prelims leaks into fighter), STREAMER-AS-LEAGUE-LOST |
| `TalkSport Boxing Craw Seaman vs Hunte Smith Full Event 25 04 26 Z3R0 1080p` | league=``, home=`TalkSport Boxing Craw Seaman`, away=`Hunte Smith` | sport=`Boxing`, fighters=`Craw Seaman`/`Hunte Smith`, session=`Full Event`, date=`2026-04-25` | BROADCASTER-PREFIX-LEAK, SPORT-NOT-DERIVED, TWO-DIGIT-YEAR-MISSED |

**New defect classes (added to taxonomy):**

| Class | Defect | Fix obligation |
|---|---|---|
| `TWO-DIGIT-YEAR-MISSED` | `DD MM YY` (`01 05 26`) → no date AND no `eventYear` (10/14 titles). Parser only accepts 4-digit years. **Direct parser-level cause of "won't tell me the year".** | Accept 2-digit year `YY`→`20YY` in `DD MM YY`; populate `date` + `year` |
| `STREAMER-AS-LEAGUE-LOST` | Titles led by `DAZN`/`ProBox`/`STAN`/`TalkSport` → `league=""`, no sport identity | Derive `sport` from indexer/category + a broadcaster ignore-list; never key identity off the streamer |
| `BROADCASTER-PREFIX-LEAK` | `ProBox`/`STAN`/`TalkSport` not in strip-list → leak into fighter name (`ProBox Erdenebat`, `STAN Moloney`). Only `DAZN` strips. | Comprehensive broadcaster/platform ignore-list (DAZN, ProBox, STAN/Stan Sport, TalkSport, ESPN+, …) applied to all sides |
| `SESSION-NOT-CAPTURED` | `Full Event`/`Main Event`/`Main Card`/`Prelims` not surfaced as `session`; some stripped, `Prelims` leaks into fighter | Recognise + emit boxing card sessions; never leak into fighter name |
| `QUALITY-NOT-EXTRACTED` | `parseFlexibleMatchupTitle` returns no `quality`/`language` (`720pEN50fps`/`720pSPA60fps`/`720p eng` lost) | Extract `quality`, `language` on the vs/flexible path too |

**Boxing notes:** broadcaster/platform tokens here are `DAZN`, `ProBox` (ProBox TV), `STAN` (Stan Sport AU), `TalkSport`, plus scene group `Z3R0` — all RUBBISH. Sport identity for this indexer = `Boxing` regardless of which streamer leads the title. Fighter-vs-fighter is the bout structure, but per saved guidance combat events should not render as two-crest head-to-head posters — open question for the poster layer, not the parser.

## 6. 🔑 Sport comes from PROWLARR, not the title (client hint, code-verified 2026-05-15)

**The sport identity is already in the Prowlarr return — the title parser should NOT be the sport oracle.**

`src/clients/prowlarr.js` `_mapResult()` (lines 61-118) returns per item:
`indexer` (name), `category`, `categoryIds[]`, `categoryNames[]`, `indexerCategoryName`, **`sportHint`**, `pubDate`.

`sportHint` = `resolveSportHint({ categoryHint, title })` where `categoryHint = sportHintFromCategory({ indexerName, categoryIds, categoryNames })` (`src/utils/sportsCategoryHint.js`). `mapTextToSport` (lines 77-96) maps category/indexer text → sport: tennis, snooker, cricket, football, basketball, baseball, american-football, mma, boxing, wrestling, motorsport, darts, cycling, rugby, hockey, golf, olympics. There is also a category-ID → sport map (boxing `100029/100035`, motorsport `100032/100015/...`).

`catalog.js normalizeSportsCatalogItems` (line 631+) **already threads** `sportHint`, `categoryNames`, `indexerCategoryName` into `parseSportsTorrentProfile` + `classifySportsEvent`. So the sport signal is present even when BOTH title parsers return null.

**Architectural correction this drives:**
- Sport/`league` family should be taken from Prowlarr `sportHint`/category/indexer — NOT derived from the title's hardcoded `EVENT_LEAGUE_RE` allow-list.
- The title parser's job shrinks to **event specifics within an already-known sport**: date, round, venue, session, participant(s), tvChannel, quality, format, language.
- This dissolves `STREAMER-AS-LEAGUE-LOST` and most of `ALLOWLIST-COVERAGE-GAP`: DAZN-led boxing titles still classify as boxing via the indexer/category even though the title starts with a streamer.

**Remaining gap — RESOLVED 2026-05-15 (client decision):** Do **NOT** enumerate every niche sport. Any category/indexer/title the mapper cannot classify to a known sport → bucket `sport = "Others"` (catch-all). Equestrian, rodeo, powerboat (F1H2O), cliff-diving, freeride-MTB, horse-racing, and anything else unmapped all resolve to `Others`. `sportHint` must therefore **never be empty** — it is either a known sport or `Others`. Downstream: `Others` drives a generic "Others" catalog grouping and the deterministic generic fallback poster (no fake logos — ties to DIRECTIVE 001).

### Batch 3 — Extreme / niche (Equestrian, Rodeo, Red Bull, F1H2O, Horse Racing), client screenshot 2026-05-15

**Headline: BOTH title parsers return `null` for the ENTIRE batch.**
- `parseSportsTitle` → `parseFlexibleMatchupTitle`: no `vs`/`v`/`@` → returns null.
- `parseSportsEventTitle`: `resolveEventLeagueStart` requires the title to START with an `EVENT_LEAGUE_RE` league. None of `American Rodeo`, `Equestrian`, `Red Bull`, `F1H2O`, `Horce Racing`, `Jumping` are on it → returns null. ("American" hits the GENERIC_SPORT_PREFIX recursion but "Rodeo" isn't a known league → still null.)
- Net: `parsedSportsEvent=null`, `parsedEvent=null` → no `league`, no `date`, no `eventYear`, no `eventName`. Raw title shown, no year, no identity. **This is the `ALLOWLIST-COVERAGE-GAP` defect at full scale** — title-side sport derivation is structurally incapable here; only the Prowlarr §6 path can rescue it.

| Raw title | Both parsers | Sport via Prowlarr? | Notes |
|---|---|---|---|
| `American Rodeo 2026 Super Qualifier St Tite 04 04 720pEN60fps` | null | `mapTextToSport` has no "rodeo" → likely `''` unless indexer/category says it | date `04 04` + sep year `2026`; tvChannel none |
| `Equestrian Jumping Prague 2025 Global Champions League Semi Final 21 11 720pEN50fps ES` | null | no "equestrian" in map → likely `''` | `ES` = language? (Spanish) or rubbish — client to confirm |
| `Red Bull Rampage \| Men's \| Redbull Tv \| 1080p60fps \| BlackDevil` | null | no map entry | **pipe `\|` delimited** — `splitEventTitleTokens` doesn't treat `\|` as separator → tokens keep `\|`. `Redbull Tv` channel?, `BlackDevil` group=rubbish |
| `F1H2O World Championship Round 3 Zhengzhou 2025 Sprint Race 11 10 720pEN50fps ES` | null | `F1H2O`≠`F1`; no powerboat in map → `''` | round/venue/session present but unparsed |
| `Horce Racing 2025 1st Racing Tour 05 10 720pEN30fps` | null | typo "Horce"; no horse-racing in map | typo + no coverage |

**New defect classes:**

| Class | Defect | Fix obligation |
|---|---|---|
| `ALLOWLIST-COVERAGE-GAP` | `parseSportsEventTitle` bails to null for any sport not on `EVENT_LEAGUE_RE`; whole niche-sport batch unparsed | Sport from Prowlarr §6; title parser must still extract event specifics even when sport is unknown to its own list |
| `PIPE-DELIM-UNHANDLED` | `\|`-delimited titles (Red Bull) not tokenised on `\|` | Treat `\|` as a token separator |
| `SPORTHINT-MAP-GAP` | unmapped category/indexer → `sportHint=''` (no identity, no fallback) | Unmapped → `sport="Others"` catch-all (NOT enumerate every sport); `sportHint` never empty |

### Batch 4 — Mixed football + motorsport + DOCUMENTARIES, client screenshot 2026-05-15

| Raw title | Current code | Required | Defects |
|---|---|---|---|
| `UECL 2026 03 12 Crystal Palace vs AEK Larnaca 1080p WEB H264` | league=`""` (UECL absent from leagueMap), date=`2026-03-12`, home=`Crystal Palace`, away=`AEK Larnaca` | sport=`football`(Prowlarr), competition=`UECL`/`UEFA Europa Conference League`, date=`2026-03-12`, home/away as-is | `COMPETITION-DROPPED-NOT-IN-LEAGUEMAP` |
| `Brawn The Impossible Formula 1 Story S01 1080p DSNP WEB DL DDP5 1 H264 FLUX` | both parsers null | NOT a fixture — flag as documentary/series, exclude from event/poster pipeline | `DOCUMENTARY-AS-EVENT` |
| `Formula 1 Drive to Survive S06 1080p WEBRip x265 KONTRAST` | league=`Formula 1`, event=`Drive to Survive S06`, no date/year | NOT a fixture — `S06` ⇒ docuseries; exclude from race poster pipeline | `DOCUMENTARY-AS-EVENT` |
| `WSBK 2026 Round05 Czech Republic FP2 WEB DL 1080p H264 English MWR` | league=`Wsbk` (titleCase, not leagueMap `World Superbikes`), date=``, eventYear=`2026`, event=`Czech Republic`, session=`FP2`, round=`Round 05` | sport=`motorsport`, competition=`World Superbikes`, venue=`Czech Republic`, round=`Round05`, session=`FP2`, year=`2026` | `EVENTTITLE-IGNORES-LEAGUEMAP`, `NO-VENUE-FIELD` |
| `MotoGP 2026 Round06 Spain Catalunya Practice WEB DL 1080p H264 English MWR` | league=`MotoGP`, event=`Spain Catalunya`, session=`""` (bare "Practice"), round=`Round 06` | competition=`MotoGP`, venue=`Spain Catalunya`, session=`Practice`, round=`Round06`, year=`2026` | `SESSION-GAP` (bare "Practice"), `NO-VENUE-FIELD` |

**New defect classes:**

| Class | Defect | Fix obligation |
|---|---|---|
| `DOCUMENTARY-AS-EVENT` | Docuseries/documentaries (`S01`/`S06`, "Drive to Survive", "Story", DSNP/Netflix doc) parsed as fixtures or bucketed by sportHint → wrong race poster on a TV show | Detect episodic/doc markers (`S\d+E?\d*`, doc keywords) → `contentType="documentary"`; KEEP under detected sport; generic doc artwork (no race/head-to-head poster); sort below real fixtures (client decision 2026-05-15) |
| `COMPETITION-DROPPED-NOT-IN-LEAGUEMAP` | Title carries a real competition token (`UECL`) but leagueMap/`EVENT_LEAGUE_RE` don't know it → competition lost (`league=""`) | Keep the literal competition token even when unmapped; sport still comes from Prowlarr §6; `Others`-style retention for the competition label |
| `EVENTTITLE-IGNORES-LEAGUEMAP` | `parseSportsEventTitle` labels via `titleCase` not leagueMap → `WSBK`→`Wsbk` though map has `World Superbikes` | Event path must resolve the canonical name via leagueMap before falling back to titleCase |

### Batch 5-7 — EPL/WSL, NHL/Giro/AFL/MotoGP/FIBA/WTA, MLS/AEW/WNBA/WRC/SC/BTCC (client screenshots 2026-05-15)

Verified leagueMap: EPL=`English Premier League`✓, NHL=`NHL`✓, MLS=`Major League Soccer`✓, WRC=`WRC`✓, EasyCredit BBL✓, WTA✓. **NOT mapped → `league=""`:** WSL/Women's Super League, AFL, Giro d'Italia, BTCC, SC/Stanley Cup. Sport for these must come from Prowlarr §6 (football/hockey/cycling/motorsport) or `Others`.

**Confirmed WORKING (protect in the fix):** team-vs-team with a clear date — NHL/EPL/MLS `LEAGUE YYYY MM DD Home vs Away …` → clean home/away + correct date + mapped league. Pipe `|`-delimited EPL also works (`splitMatchupTitleTokens` converts `|`→space). AEW Dynamite weekly show parses fine.

**New defect classes:**

| Class | Defect | Fix obligation |
|---|---|---|
| `LEADING-ROUND-NOISE-DESTROYS-TEAM` | Unmapped competition (`AFL`) + `Round N Game M` between league and teams → home builder grabs `AFL`, breaks before real home side (`Brisbane Lions` lost, home=`AFL`). **Same root as original "Man Utd vs Man Utd" same-team-dup.** | Strip leading competition+round+game noise regardless of leagueMap membership before isolating home side; never let a league/round token become the team |
| `US-DATE-FORMAT-MISSED` | `6/16/24` (M/D/YY) and `14 5 2026` (single-digit month) → no date AND no year. Code requires 2-digit month + 4-digit year, DMY order | Parse M/D/YY, D/M/YY, single-digit month, 2-digit year; bind to separate year token; never silently drop |
| `ANCILLARY-CONTENT-AS-EVENT` | Press Conference / Pre & Post Match / After The Flag / Gear Up / Highlights / Coverage parsed as the live fixture | Detect ancillary markers → `contentType="ancillary"`; keep under sport; generic art; sort below the real session (same model as documentary decision) |
| `SPONSOR-PREFIX-LEAK` / `TENNIS-COMMA-PLAYERS-UNPARSED` | `VET CONCEPT Gladiators Trier` (sponsor glued to club); tennis `Surname, First` with no `vs` → no matchup | Sponsor ignore-list per club; tennis comma-name + no-vs matchup extraction |

---

## 7. TARGET OUTCOME / ACCEPTANCE MATRIX (binding — review before implementation)

Every row: real title → what the code does **now** → what the corrected parser **must** produce. This is the pass/fail oracle. No implementation ships unless every row's NEW column is produced.

| # | Raw title | NOW (broken) | NEW (required) |
|---|---|---|---|
| 1 Combat | `DAZN Carter Efe vs Portable Full Event 01 05 26 Z3R0 720p` | league=``, no date/year, home=`Carter Efe`, away=`Portable` | sport=`Boxing`(Prowlarr), event=`Carter Efe vs Portable` (single, no head-to-head), tvChannel=`DAZN`, session=`Full Event`, date=`2026-05-01`, year=`2026`, quality=`720p`; drop `Z3R0` |
| 2 Motorsport | `IndyCar NTT 2026 Indy500 Practice 1 & 2 14 05 720pEN60fps FS1` | league=`Indycar`, event=`NTT Indy500 &`, date=``, session=`Practice 1` | sport=`IndyCar NTT`, year=`2026`, round=`Indy500`, session=`Practice 1 & 2`, venue=`Indianapolis`, date=`2026-05-14`, quality=`720p`, language=`EN`; drop `FS1` |
| 3 Football (unmapped comp) | `UECL 2026 03 12 Crystal Palace vs AEK Larnaca 1080p WEB H264` | league=``, date=`2026-03-12`, teams clean | sport=`football`, competition=`UEFA Europa Conference League`, date=`2026-03-12`, home=`Crystal Palace`, away=`AEK Larnaca`, format=`WEB H264`, quality=`1080p` |
| 4 Mislabelled comp | `EPL 2026 Celtic vs Rangers 10 05 720pEN60fps CBS` | league=`English Premier League` ❌ | sport=`football`, competition=`Scottish Premiership` (club map overrides EPL), home=`Celtic`, away=`Rangers`, date=`2026-05-10`, year=`2026`; drop `CBS` |
| 5 Documentary | `Formula 1 Drive to Survive S06 1080p WEBRip x265 KONTRAST` | league=`Formula 1`, event=`Drive to Survive S06`, no date | sport=`motorsport`, competition=`Formula 1`, contentType=`documentary`, title=`Drive to Survive S06`, date=torrent pubDate, generic doc art, sorted below fixtures |
| 6 Ancillary | `MotoGP 2026 Round05 France Post Event Press Conference WEB DL …` | league=`MotoGP`, event treated as race | sport=`motorsport`, competition=`MotoGP`, round=`Round 05`, venue=`France`, contentType=`ancillary`, year=`2026`, date=pubDate, generic art, below the race |
| 7 Round-noise destroys team | `AFL 2026 Round 10 Game 1 Brisbane Lions V Geelong Cats 1080p KAYO …` | league=``, home=`AFL` ❌ (Brisbane Lions lost) | sport=`australian-football`, competition=`AFL`, year=`2026`, gameNumber=`Round 10 Game 1`, home=`Brisbane Lions`, away=`Geelong Cats`, date=pubDate, format=`KAYO WEB DL` |
| 8 Season-qualifier breaks year | `MLB RS 2026 Seattle Mariners vs Chicago White Sox 10 05` | league=`MLB`, date=`` (RS broke year-hint) | sport=`baseball`, competition=`MLB`, season=`Regular Season`, home=`Seattle Mariners`, away=`Chicago White Sox`, date=`2026-05-10`, year=`2026` |
| 9 US date M/D/YY | `Indiana Fever vs Chicago Sky 6/16/24` | league=``, no date/year | sport=`basketball`, competition=`WNBA`, home=`Indiana Fever`, away=`Chicago Sky`, date=`2024-06-16`, year=`2024` |
| 10 `at` separator | `NBA Playoffs 2026 05 09 R2G3 Oklahoma City Thunder at Los Angeles Lakers EN` | mangled eventName | sport=`basketball`, competition=`NBA Playoffs`, date=`2026-05-09`, gameNumber=`R2 G3`, away=`Oklahoma City Thunder` (`at`→first=away), home=`Los Angeles Lakers`, language=`EN` |
| 11 Wrong-date guard | `MLB 2026 12 05 2026 Chicago Cubs vs Atlanta Braves 1080p60fps BravesVsn` | date=`2026-12-05` ❌ | date=`2026-05-12` (prefer DD-MM-YYYY), sport=`baseball`, competition=`MLB`, home=`Chicago Cubs`, away=`Atlanta Braves` |
| 12 Tennis vs | `WTA Roma QF 2026 Sorana Cirstea vs Jelena Ostapenko 12 05 DAZN` | works | unchanged: sport=`tennis`, competition=`WTA`, round=`QF`, p1=`Sorana Cirstea`, p2=`Jelena Ostapenko`, date=`2026-05-12`, tvChannel=`DAZN`, year=`2026` |
| 13 Tennis comma no-vs | `WTA Rome, Italy Women Singles Semifinals Cirstea, Sorana Gauff, Coco` | mangled, no matchup | sport=`tennis`, competition=`WTA`, venue=`Rome`, round=`Semi Final`, p1=`Sorana Cirstea`, p2=`Coco Gauff`, date=pubDate |
| 14 Slash date | `Inside the NBA 2026/05/10 \| 1080p 50fps ESPN` | no date, parsed as event | sport=`basketball`, competition=`NBA`, contentType=`ancillary`, date=`2026-05-10`, generic art |
| 15 Abbreviation | `NBA 2026 05 13 R2G5 CLE vs DET ESPN` | home=`R2G5 CLE`, away=`DET` | sport=`basketball`, competition=`NBA`, date=`2026-05-13`, gameNumber=`R2 G5`, home=`Cleveland Cavaliers`, away=`Detroit Pistons` |
| 16 Club norm + upstream gap | `Dutch Eredivisie 2026 FC Groningen vs N E C 10 05` | league=``, home leak | sport=`football`, competition=`Eredivisie`, home=`FC Groningen`, away=`NEC Nijmegen`, date=`2026-05-10`; **artwork = clean `NEC` initials until SportsMeta ingests Eredivisie (DIR-001)** |
| 17 Unmapped → Others | `American Rodeo 2026 Super Qualifier St Tite 04 04 720pEN60fps` | both parsers null | sport=`Others` (Prowlarr can't classify), title kept, round=`Super Qualifier`, date=`2026-04-04`, year=`2026`, generic Others art |

**Invariants every row must satisfy:** `sport` never empty (known or `Others`); `date`+`year` never empty (title → torrent pubDate); broadcaster never leaks into a team/event name; `gameNumber`/`session`/`venue` captured not discarded; combat/doc/ancillary never rendered as head-to-head; client per-token `tvChannel`/rubbish calls honoured exactly.

### Batch 8 — _(superseded; see Batches 8-14 ledger summary above)_

---

## 5. Resolved decisions & watch-list

**RESOLVED 2026-05-15:**
- `tvChannel` captured ONLY for client-named channels (`DAZN`, `ProBox`). `FS1`/`FS2`/`FOX`/`STAN`/`SkyF1`/`MWR` = **RUBBISH** per explicit client instruction (Batch 1). No "broadcaster = field" generalisation. (Corrects an earlier wrong inference — see CORRECTIONS.md.)
- Combat (boxing/MMA/UFC): single `event` string, no `homeTeam`/`awayTeam`, no two-crest head-to-head poster.
- **Documentaries/docuseries** (`S\d+`, "Drive to Survive", "Story", doc markers): KEEP under the detected sport (e.g. Formula 1) but set `contentType="documentary"` — no head-to-head/race poster, generic documentary artwork, sorted BELOW real fixtures. Not excluded, not its own bucket. **Extends to:** studio shows ("Inside the NBA", "AFL 360"), recaps ("Recapping the Action"), replays ("Sprint Race Replay"), compilations ("All Games"), player-bio docs ("The Terry Francona Story") → `contentType` documentary/ancillary, same treatment.
- **Date resolution order (client rule 2026-05-16):** (1) parseable date in the title; (2) if none → the torrent's made date (`pubDate`/`publishDate` from Prowlarr). `date`/`year` must therefore **never be empty** — title date preferred, torrent date is the guaranteed fallback. The code already threads `fallbackDate = item.pubDate` into both parsers; the fix must ensure it is actually used whenever the title date is absent OR unbindable (see `SEASON-QUALIFIER-BREAKS-YEAR-HINT`).
- **Bare `DD MM` is ALWAYS the date (client-confirmed 2026-05-16):** a standalone `13 05` = day-month (13 May), even when no year is adjacent and even when a `Game 5`/`Round`/qualifier sits before it. Resolve the year from the title's year token (e.g. `2026`) if present, else the torrent date. Confirmed examples: `Valencia Basket vs Panathinaikos Game 5 13 05` → 2026-05-13; `Big Sky Track & Field Championship (Multi Events) 13 05` → 2026-05-13. Order is `DD MM` (day first), not `MM DD`.
- Standing permission: use the internet to resolve classification questions; only ask the client when the web cannot answer.
- **Title competition token is NOT authoritative (client correction 2026-05-16):** `EPL 2026 Celtic vs Rangers` — the torrent says EPL but Celtic/Rangers = **Scottish Premiership** (Old Firm). A known-club → competition/country map must OVERRIDE a mislabelled league token. Build a club identity map (start: Celtic, Rangers, Hearts, Hibernian, Aberdeen, Dundee… → Scottish Premiership) and extend per sport. When the title league contradicts the clubs' real competition, the clubs win.
- **Club-identity map must also expand abbreviations (Batch 15-17):** not only spaced letters (`N E C`→NEC Nijmegen) but 3-letter codes (`CLE`→Cleveland, `DET`→Detroit, etc.) — common in NBA/NHL/MLB titles like `R2G5 CLE vs DET`. Same map, broader entries.
- **Batches 15-17 = ~95% confirmation.** Only new: NRL (leagueMap), abbreviation expansion (above). Taxonomy remains saturated — no new defect classes. Continuing to feed examples is diminishing returns; the spec is implementation-ready.
- **Club normalization is necessary but NOT sufficient for artwork (verified live 2026-05-16):** `N E C` → must normalize to `NEC Nijmegen` via the club-identity map. BUT SportsMeta `/resolve` returns `404 not_found` for `N E C`, `NEC`, AND `NEC Nijmegen` — **SportsMeta has no Eredivisie data** (same upstream gap class as UCL, Batch 4). Real crest exists upstream (TheSportsDB) but SportsMeta hasn't ingested it. → Two workstreams: (1) parser emits canonical club so it resolves when data exists; (2) SportsMeta must ingest Eredivisie (separate, outside this parser scope). Until (2), DIRECTIVE 001 governs: **clean deterministic `NEC` initials — never blank, never fake/duplicate-league logo.** This is the explicit bridge between SPORTS_TITLE_PARSER_SPEC and DIRECTIVE 001.

**Required leagueMap additions (client-directed + audit-confirmed unmapped):**
| Competition | Sport | Source | Notes |
|---|---|---|---|
| **WSL** / Women's Super League | football | **client directive 2026-05-16** | English women's football top tier |
| **AFL** / Australian Football League | australian-football | **client directive 2026-05-16** | "Round N Game M" → `gameNumber` |
| UECL / UEFA Europa Conference League | football | audit (Batch 4) | |
| Giro d'Italia | cycling | audit (Batch 6) | |
| BTCC / British Touring Car | motorsport | audit (Batch 7) | |
| SC / Stanley Cup | hockey | audit (Batch 7/9) | NHL playoff competition |
| EuroLeague, CPL, Brazil Cup, Big Sky NCAA | various | audit (Batch 8) | confirm canonical names |
| RSL / Roshn Saudi League | football | audit (Batch 10) | Al Nassr/Al Hilal — Saudi Pro League |
| Cricket bilateral ("X tour of Y", "1st T20I/ODI/Test") | cricket | audit (Batch 11) | needs tour/series + match-number handling, no `vs` |
| Scottish Premiership | football | **client correction (Batch 13)** | Celtic/Rangers — overrides mislabelled "EPL" |
| Jupiler Pro League (BE), Ekstraklasa (PL), Liga Portugal/Primeira (PT), 2.Bundesliga (DE), Eredivisie (NL), Segunda División (ES) | football | audit (Batch 12-14) | non-English domestic leagues broadly unmapped |
| NRL / National Rugby League | rugby-league | audit (Batch 17) | Rabbitohs/Dolphins/Sharks/Bulldogs — same `Round N Game M` structure as AFL |
| UEL / UEFA Europa League; "UEFA Europa & Conference League" combined | football | audit (Batch 15-17) | distinct from UECL; combined-competition `&` form also appears |
| Women's FIFA World Cup Qualifier | football | audit (Batch 17) | dual-year: tournament yr (2027) vs match date (2026) — date logic correctly picks the match triple |

Anything still unmapped after these → `Others` (§6). The implementation plan must add these to `src/utils/leagueMap.js` and ensure `parseSportsEventTitle` resolves via leagueMap (fixes `EVENTTITLE-IGNORES-LEAGUEMAP`).
- Broadcaster/scene-group disambiguation: Google may be used to classify any unknown token (broadcaster/streamer vs scene release group) — client granted self-service web lookup, do not bottleneck on asking.

**Watch-list:**
- Venue dictionary needed (Indianapolis, Long Beach, …) — likely a circuit/venue map per sport.
- `format` grammar: `<source> <container?> <res> <codec>` ordering varies.
- Confirm whether `sport` should be split into `seriesFamily` (IndyCar) + `seriesTier` (NTT/NXT/Series) for artwork keying.
- Team-vs-team path (`parseSportsTitle`) defects (NHL/EPL same-crest, MW-noise) still tracked under DIRECTIVE 001 — keep separate from this event-path contract.
