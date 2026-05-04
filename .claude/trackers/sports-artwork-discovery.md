# Sports Artwork Discovery — Phase 0

Status: COMPLETE
Date: 2026-05-01
Author: Frank (Claude Code)
Source brief: `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md`
Predecessor: `.claude/trackers/sports-artwork-reconciliation.md` (PASS WITH CAVEATS)

**Goal:** enumerate every sport family, every classifier branch, every poster template, every backdrop bucket, every fallback path, and every paid/free gating point that today's PVTKRRX runtime can hit. The Phase 1 user questions and the Phase 2 template contract MUST cover every row in this discovery.

---

## 1. Manifest-facing sports catalogs (Stremio rows)

Source: `src/config/sportsCatalogs.js` — `SPORTS_DISCOVERY_CATALOGS`. **17 catalogs total** (1 aggregate + 16 sport-family). Each is exposed in the manifest as a top-level `sports` row with a `genre` filter dropdown.

| # | Catalog ID | Display name | sportHint | Genre options (filters) |
|---|---|---|---|---|
| 1 | `pvtkrrx-sports` | All Sports | _(empty)_ | Premier League, FA Cup, MLS, Formula 1, MotoGP, UFC, NBA, NBA Playoffs, NFL, MLB, IPL, PGA Tour, WWE, PDC |
| 2 | `pvtkrrx-sports-football` | Football | football | Premier League, FA Cup, MLS, Major League Soccer, Champions League, Europa League, La Liga, Serie A, Bundesliga, Arsenal, Liverpool, Manchester United |
| 3 | `pvtkrrx-sports-motorsport` | Motorsport | motorsport | Formula 1, MotoGP, NASCAR, IndyCar, WRC, Supercars, WEC, Formula E |
| 4 | `pvtkrrx-sports-mma` | MMA | mma | UFC, PFL, ONE Championship, Cage Warriors, Fight Night |
| 5 | `pvtkrrx-sports-american-football` | American Football | american-football | NFL, College Football, Super Bowl, Playoffs |
| 6 | `pvtkrrx-sports-basketball` | Basketball | basketball | NBA, NBA Playoffs, WNBA, EuroLeague, NCAA |
| 7 | `pvtkrrx-sports-cricket` | Cricket | cricket | IPL, Indian Premier League, Test Cricket, ODI, T20, The Ashes |
| 8 | `pvtkrrx-sports-rugby` | Rugby | rugby | NRL, Super Rugby, Six Nations, Rugby Championship, Premiership Rugby |
| 9 | `pvtkrrx-sports-tennis` | Tennis | tennis | ATP, WTA, Wimbledon, US Open, Australian Open, Roland Garros |
| 10 | `pvtkrrx-sports-boxing` | Boxing | boxing | Heavyweight, PPV, Matchroom, BKFC, Queensberry |
| 11 | `pvtkrrx-sports-golf` | Golf | golf | PGA Tour, LPGA Tour, Masters, Ryder Cup, LIV Golf |
| 12 | `pvtkrrx-sports-baseball` | Baseball | baseball | MLB, Major League Baseball, World Series, Postseason |
| 13 | `pvtkrrx-sports-cycling` | Cycling | cycling | Tour de France, Giro d'Italia, Vuelta a Espana, Classics |
| 14 | `pvtkrrx-sports-darts` | Darts | darts | PDC, Premier League Darts, World Championship, World Matchplay |
| 15 | `pvtkrrx-sports-snooker` | Snooker | snooker | World Championship, Masters, UK Championship |
| 16 | `pvtkrrx-sports-hockey` | Hockey | hockey | NHL, Stanley Cup, IIHF, KHL |
| 17 | `pvtkrrx-sports-wrestling` | Wrestling | wrestling | WWE, AEW, Raw, SmackDown, NXT |

Notes:
- Sport-family catalog rows are the user-facing taxonomy. The `sportHint` field flows through to `sportsCultCategoryMap.appSportHint` and into the artwork resolvers as the primary `sport` value.
- Catalog inclusion is **availability-driven** (Prowlarr decides whether a row exists). SportsMeta only enriches rows that already have tracker availability.

## 2. Sport buckets the runtime knows about

### 2a. Backdrop buckets (file-served from disk)

Source: `src/utils/sportBackdrops.js` — `REQUIRED_SPORT_BACKDROP_BUCKETS` and `public/sports-backdrops/*-4k.jpg`. **16 buckets, sport-level only**, never per-event.

| Bucket | File | Routing pattern |
|---|---|---|
| football | `football-4k.jpg` | EPL, La Liga, Champions League, FA Cup, Serie A, Bundesliga, Ligue 1, MLS, World Cup, Nations League, Euro qualifiers, Conference League, AFCON, Copa America, soccer |
| formula1 | `formula1-4k.jpg` | F1 / Formula 1 / Formula One |
| motogp | `motogp-4k.jpg` | MotoGP / Moto2 / Moto3 |
| ufc | `ufc-4k.jpg` | UFC, MMA, Bellator, PFL, ONE Championship, Fight Night, Ultimate Fighting |
| boxing | `boxing-4k.jpg` | Boxing, Matchroom, Queensberry, Top Rank, BKFC |
| rugby | `rugby-4k.jpg` | Rugby, NRL, Super Rugby, Six Nations, Premiership Rugby _(also catches volleyball/handball/AFL via `sportsCultCategoryMap` which routes them to the `rugby` appSportHint — see §6 ambiguity)_ |
| cricket | `cricket-4k.jpg` | Cricket, IPL, Test Cricket, ODI, T20, The Ashes, The Hundred |
| tennis | `tennis-4k.jpg` | Tennis, ATP, WTA, Wimbledon, Roland Garros, US Open, Australian Open, Davis Cup, Laver Cup |
| golf | `golf-4k.jpg` | Golf, PGA, LPGA, Masters, Ryder Cup, LIV Golf, Open Championship |
| nba | `nba-4k.jpg` | NBA, WNBA, basketball, EuroLeague, NCAA basketball |
| nfl | `nfl-4k.jpg` | NFL, NCAAF, college football, Super Bowl, gridiron, American football, CFL, UFL |
| nhl | `nhl-4k.jpg` | NHL, hockey, ice hockey, Stanley Cup, IIHF, KHL |
| mlb | `mlb-4k.jpg` | MLB, Major League Baseball, baseball, World Series |
| wrestling | `wrestling-4k.jpg` | WWE, AEW, wrestling, Raw, SmackDown, NXT |
| darts | `darts-4k.jpg` | Darts, PDC, BDO, World Matchplay |
| generic-sport | `generic-sport-4k.jpg` | Fallback. Also explicitly used for: neutral motorsport (WRC, NASCAR, IndyCar, Supercars, WEC, Formula E, Dakar, Grand Prix, rally) and any broadcast-layout backdrop request that does not match one of the named buckets |

The 4K backdrop is served from `/sports-backdrops/<bucket>-4k.jpg` with a `?v=20260429-sport-level-4k-v1` cache buster. SHA-256 parity between `backdrops/python-backdrops/*-4k.jpg` and `public/sports-backdrops/*-4k.jpg` is enforced by `npm run smoke:sport-backdrops`.

### 2b. SportsCult source categories → app sport hints

Source: `src/config/sportsCultCategoryMap.js` — RAW_MAP. **70 source categories** (with aliases) are explicitly mapped. Each row determines `appSportHint`, `canonicalSport`, `posterClass`, `defaultPosterMode`, `topLevelLabel`, and an optional `allowTitleRefinement` flag.

Distinct app sport hints used: `football`, `motorsport`, `mma`, `boxing`, `wrestling`, `golf`, `cycling`, `tennis`, `snooker`, `darts`, `athletics`, `winter`, `american-football`, `basketball`, `baseball`, `cricket`, `rugby`, `hockey`, plus `''` for the safety-net `Uncategorised` row.

Categories where `allowTitleRefinement: true` (text classifier may override the contract):
European Soccer, International Soccer, MotorSport, AutoMotoRacing, Fight Sports, Wrestling/Grapling, Golf, Cycling, Tennis, Darts, Athletics, Olympic games, OlympicGamesParis24, WinterOlympicGames, WinterSport, Extreme Sports, NCAA Basket/Football, Baseball, Cricket, Rugby, Chess (no — `BrainGames` only), BrainGames, ESport, Uncategorised.

Notable composite/edge entries:
- `Volleyball`, `BeachVolleyball`, `Handball`, `AFL(AustralianFB)`, `Ultimate Diskk` all map to `appSportHint: 'rugby'` (so they share the `rugby-4k` backdrop). Discovery flags this — Phase 1 should ask whether to keep this or split.
- `Chess`, `BrainGames`, `ESport`, `Documentary` all map to `appSportHint: 'athletics'` and `posterClass: 'tournament_event'/'generic_event'`. Discovery flags this — odd grouping.
- `Uncategorised` has empty `appSportHint`/`canonicalSport` and `posterClass: 'generic_event'`. This is the safety net.
- Aliases include: "Premier League Darts" → Darts (NOT football), "IPL"/"Indian Premier League" → Cricket (NOT football), "FIFA World Cup" → International Soccer.

## 3. Poster classes

Source: `src/config/sportsCultCategoryMap.js` — `POSTER_CLASSES`. **16 classes total**:

1. `team_vs_team` — football, basketball, baseball, cricket, hockey, rugby, american-football, NCAA football/basketball
2. `motorsport_event` — F1, MotoGP, NASCAR, IndyCar, WRC, MotorSport, AutoMotoRacing, karting
3. `combat_event` — UFC, MMA, Bellator, Boxing, KickBoxing/Muay Thai, Fight Sports
4. `golf_event` — Golf
5. `wrestling_event` — Wrestling/Grapling (WWE/AEW/NXT etc.)
6. `cycling_event` — Cycling, Tour de France, Giro, Vuelta
7. `athletics_event` — Athletics, Sailing, Surfing, Climbing, Extreme Sports, Bodybuilding, BreakDance, CrossFit, Bowling
8. `olympic_event` — Olympic games, Paris 2024
9. `winter_sport_event` — Winter Olympics, Winter Sport
10. `aquatics_event` — Swimming/Aquatics
11. `gymnastics_event` — Gymnastics, Rhythmic Gymnastics
12. `racket_event` — Tennis, Table Tennis, Snooker/Pool, Billiards
13. `darts_event` — Darts (PDC etc.)
14. `tennis_or_snooker_match` — paired racket/snooker matches
15. `tournament_event` — Chess, BrainGames, ESport, fallback for paired-but-no-pair downgrades
16. `generic_event` — Documentary, Uncategorised, anything that fails all classifiers

Classifier code: `src/utils/sportsPosterClassifier.js` — `classifySportsPosterEvent(input)` runs:
1. `resolveSportsCultContext` (category-driven; locked categories cannot be overridden by text)
2. `classifyByText(text, sport, paired)` — regex matchers for each class in priority order
3. `refineByCategory` for SportsCult contexts that allow title refinement
4. Downgrade `team_vs_team` → `tournament_event` when no real pair was parsed (no fake matchups)

## 4. Poster templates

Source: `src/utils/sportsPosterTemplates.js` — `SPORTS_POSTER_TEMPLATES`. **7 templates total**:

| Slug | Label | Layout family | Notes |
|---|---|---|---|
| editorial | Editorial | EDITORIAL | Magazine/headline cover |
| broadcast | Broadcast | BROADCAST | Split team-vs-team / TV-style; auto-fallback for non-team_vs_team requests |
| sportsbook | Sportsbook | SPORTSBOOK | Odds/betting feel |
| trading-card | Trading Card | TRADING_CARD | Card/spotlight |
| brutalist | Brutalist | BRUTALIST | High-contrast typographic |
| ticket-stub | Ticket Stub | TICKET_STUB | **Free/default tier** (per CLAUDE.md project rule: "06-ticket-stub is the free/default poster style") |
| glitch | Glitch | GLITCH | Glitch scanlines (always wins on `selectTemplateForSportsClass` regardless of class) |

Template-source mapping (per CLAUDE.md project rule, the visual source of truth is `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates`, family `01-editorial` … `07-glitch`):

The python-template family numbers correspond 1:1 to the JS template slugs:
- `01-editorial` → `editorial`
- `02-broadcast` → `broadcast`
- `03-sportsbook` → `sportsbook`
- `04-trading-card` → `trading-card`
- `05-brutalist` → `brutalist`
- `06-ticket-stub` → `ticket-stub` _(free/default)_
- `07-glitch` → `glitch`

Template selection (`src/utils/sportsEventClassifier.js` lines 13–18):
```js
function selectTemplateForSportsClass(eventClass, requestedTemplate = 'ticket-stub') {
  const normalized = normalizeSportsPosterTemplate(requestedTemplate || 'ticket-stub')
  if (normalized === 'glitch') return 'glitch'
  if (eventClass === 'team_vs_team') return normalized
  // For non-team_vs_team classes, "ticket-stub" is upgraded to "broadcast"
  return normalized === 'ticket-stub' ? 'broadcast' : normalized
}
```

## 5. Generated/template families in the repo

Source: `backdrops/python-backdrops/` — these are the python generators currently in the repo (separate from the visual python-templates source above):

| Folder | Content | What it generates |
|---|---|---|
| `08-team-vs-team/` | `generate.py` | Team-vs-team poster generator (recently modified, per `git status`) |
| `09-competitor-vs-competitor/` | `generate.py` | Competitor-vs-competitor poster generator (added in commit `c9f5e4c`) |
| `10-single-event-motorsport/` | `generate.py` | Single-event motorsport poster generator (added in commit `aaf292d`) |

Note: The `08`/`09`/`10` folder family in this repo is the **poster-family generator** (event/sport-class shapes), NOT the same as the `01`–`07` visual-template family in the canonical python-templates source. The README in `backdrops/python-backdrops/` is explicit: those `01–07` Python SVG generators are **historical/experimental** and produce 1920×1080 SVGs covering only 8 sport keys, and they MUST NOT be copied into `public/sports-backdrops/`. The 4K JPG backdrops in `backdrops/python-backdrops/*-4k.jpg` are the deployed sport-level backdrops.

This means there are now **three poster-family generators** that the user has explicitly bought into:
- `08-team-vs-team` (fixture: home vs away)
- `09-competitor-vs-competitor` (one-on-one: tennis match, boxing fight, snooker match)
- `10-single-event-motorsport` (race weekend session: practice/quali/race)

Mapped to the 16 poster classes:

| Poster family | Covers poster classes |
|---|---|
| 08-team-vs-team | `team_vs_team` |
| 09-competitor-vs-competitor | `combat_event` (paired), `darts_event` (paired), `tennis_or_snooker_match`, `racket_event` (paired), `wrestling_event` (paired headline), `tournament_event` for any of the above downgraded |
| 10-single-event-motorsport | `motorsport_event` |
| _(unmapped today)_ | `golf_event`, `cycling_event`, `athletics_event`, `olympic_event`, `winter_sport_event`, `aquatics_event`, `gymnastics_event`, `tournament_event` (general), `generic_event` |

Phase 1 must ask whether the unmapped classes get their own families or fold into one of the three.

## 6. Current artwork resolution flow

Source: `src/utils/sportsArtwork.js`, `src/handlers/sportsArtworkProxy.js`, `src/utils/sportsArtworkDiskCache.js`.

### 6a. URL emission (catalog/meta handlers → Stremio)

`resolveSportsPosterAsset(input)` returns a `poster` URL. It calls `buildVariantUrl('poster', input)` which prefers `buildPvtkrrxRasterUrl` (the PVTKRRX `/sports-artwork/...png` proxy on the active addon origin) over a direct SportsMeta URL.

Two URL shapes:

1. **Resolved canonical event** (input has `canonicalId` like `sportsmeta:event:...`):
   `<baseUrl>/sports-artwork/id/<variant>/<canonicalId>.png?template=<t>&v=<version>`
   For `background`/`landscape` variants, query params also carry `sport`, `league`, `title`, `date`, `home`, `away`, optional `detail`/`eventClass`/`rawTitle`/`source`.

2. **Unresolved fallback** (no canonical id, sport hint only):
   `<baseUrl>/sports-artwork/default/<variant>/<sportSlug>.png?league=...&title=...&date=...&home=...&away=...&template=<t>&v=<version>`

Variants: `poster` (600×900), `background` (1920×1080), `landscape` (1280×720), `logo` (512×512).

`posterMode` is `pvtkrrx-proxy-canonical-public` or `pvtkrrx-proxy-default-public`. `selectedArtworkSource` is `pvtkrrx-canonical-public-proxy` or `sportsmeta-default-public-proxy`. **Never** `sportsmeta-member-*` from PVTKRRX.

### 6b. Backdrop selection

`resolveSportsBackgroundAsset(input)` and `resolveSportsLandscapeAsset(input)` first check for a broadcast-layout backdrop (`resolveSportsBroadcastBackdrop`). If the layout family is `BROADCAST`, the resolver picks one of the 16 sport-level 4K JPG backdrops from `public/sports-backdrops/` via `resolveSportBackdrop`. Otherwise it falls back to the SportsMeta upstream variant URL through the same proxy.

### 6c. Logo

`resolveSportsLogoAsset(input)` always emits the `logo` variant URL through the proxy. Real SportsDB/SportsMeta logos win when present; the proxy renders a sport-specific glyph fallback only when no real raster logo can be resolved (see CLAUDE.md SportsMeta Deployment Guardrail).

### 6d. Proxy server-side behaviour (`src/handlers/sportsArtworkProxy.js`)

1. Validates variant + kind; rejects unknown ones.
2. Reads `sportsArtworkDiskCache` (and Postgres mirror if `PVTKRRX_SPORTS_ARTWORK_POSTGRES_URL` is set). Cache TTL default: 6 hours. Disk cache dir: `<runtime>/sports-artwork-raster-cache/` with up to 2,000 entries. Hash-keyed by composition input.
3. On cache miss, `buildUpstreamUrl(...)` selects the SportsMeta public/root URL.
4. `fetchUpstream(url)` with 5s timeout. SportsMeta returns SVG most of the time.
5. If upstream SVG, `rasterizeToPng` (sharp) at the variant dimensions (poster 600×900, background 1920×1080, landscape 1280×720, logo 512×512).
6. If upstream raster fails or returns SVG that fails layout sanity (`isExpectedRasterLayout`), falls back to local templates:
   - `readLocalSportBackdropFallback` for backdrops
   - `renderSportsPosterTemplateSvg` / `renderLogoGlyphSvg` for posters/logos
7. Writes result to disk + Postgres cache and serves PNG with `X-PVTKRRX-Artwork-Source` header.

### 6e. Cache classification

| Cache | Purpose | Status |
|---|---|---|
| `<runtime>/sports-artwork-raster-cache/` | Server-side SVG→PNG raster cache for proxy outputs | **SANCTIONED** (CLAUDE.md "Cache invalidation" section) |
| Optional Postgres mirror (`pvtkrrx_sports_artwork_cache` table) | Hostable raster cache mirror for stateless containers | **SANCTIONED** (env-gated) |
| `sports-image-cache/` (TheSportsDB-driven) | Old content cache | **REMOVED 2026-04-22** (do not reintroduce) |
| `sportsdb-poster-cache.json` | Old SportsDB poster cache | **REMOVED 2026-04-22** (do not reintroduce) |

## 7. Free vs paid gating points

Source: `src/lib/shared.js` (`requireConfigSubscription` is pass-through, lines 1615–1619), `docs/CURRENT_DESIGN.md` lines 60–73, `docs/SPORTSMETA_BOUNDARY.md` lines 89–97.

| Surface | Today's behaviour |
|---|---|
| PVTKRRX stream addon (any install route) | **Free** for every user. `requireConfigSubscription` is a pass-through. |
| PVTKRRX `/sports-artwork/*.png` proxy | Always backed by SportsMeta **public/root** routes. Never carries member tokens. Never calls SportsMeta member-scoped URLs. |
| Sport-level 4K backdrops | **Free** for every user. Sport-level only, never per-event. |
| Composed/template posters via the proxy | Public/free composition (SportsMeta public SVG → PVTKRRX raster). Includes ticket-stub (default) and any other template the proxy is asked for. |
| SportsMeta member premium artwork | **Paid**, served only by the SportsMeta member addon at `https://sportsmeta.pvtkrrx.cc/member/:token/...`. Not a tier inside PVTKRRX. |

**Stack-level statement** (verified): "SVG/glyph for everyone, real Sports Posters for paying customers" is true at the *stack* level. Inside PVTKRRX itself, there is no user-entitlement branch.

## 8. Title parsing patterns the runtime understands

Source: `src/utils/sportsTitleParser.js` (not deeply read for Phase 0), `src/utils/sportsEventNormalizer.js`, `src/utils/sportsPosterClassifier.js`, `src/utils/sportsPosterAdapter.js`.

Two known supported title shapes (from `docs/CURRENT_DESIGN.md` line 221):
- Team-vs-team: `EPL.2026.03.15.Arsenal.vs.Chelsea`
- Non-vs event: `Formula1.2026.03.28.Japanese.Grand.Prix.Qualifying`, `UFC.Fight.Night.270.Main.Card`

Bracketed category prefix: `[<SportsCult category name>] <title>` (per `extractBracketedCategory` in classifier).

Release noise stripped by `sportsPosterAdapter.RELEASE_NOISE_RE`: 2160p / 1080p / 720p, x264/x265/h264/HEVC/AVC/AV1, WEB-DL/WEB-RIP/HDTV, repack/proper/complete, AAC/DDP audio tags, multi/english.

Forbidden values (treated as missing): `undefined`, `null`, `unknown`, `n/a`, `na`, `sport`, `sports`, `tba`, `tbd`.

League code lookup (`sportsPosterAdapter.LEAGUE_CODES`) covers ~50 entries: EPL, FAC, MLS, UCL, UEL, UNL, FIFA, WCQ, NBA, WNBA, NFL, CFB, MLB, NHL, IPL, UFC, PFL, WWE, AEW, PGA, F1, MotoGP, NASCAR, INDY, WRC, WEC, FE, SNOOKER, WC, DARTS, BOXING, TENNIS, TABLE, PDC, WIM, ATP, WTA, plus composite-league handling for "MotoGP Brazil" → "MotoGP".

Sport icon mapping (`sportIconFor`) returns one of: `f1`, `motogp`, `motorsport`, `golf`, `darts`, `cycling`, `athletics`, `cricket`, `rugby`, `wrestling`, `snooker`, `football` (American), `soccer`, `hockey`, `basketball`, `baseball`, `tennis`, `mma`. Default: `soccer`.

## 9. Smoke tests already in place

Source: `package.json` scripts + `scripts/`.

- `npm run smoke:sport-backdrops` — SHA-256 parity between `backdrops/python-backdrops/*-4k.jpg` and `public/sports-backdrops/*-4k.jpg` + image dimensions + bucket routing
- `npm run smoke:sports-artwork-layout` — layout/aspect sanity for the proxy outputs
- `npm run smoke:sports-poster-render` — local template render
- `npm run smoke:sports-poster-classifier` — classifier accuracy
- `npm run smoke:sports-poster-adapter` — adapter cleaning/dedup/initials
- `npm run smoke:sports-team-vs-team` — team-vs-team poster pipeline
- `npm run smoke:sports-competitor-vs-competitor` — competitor-vs-competitor poster pipeline
- `npm run smoke:sports-single-event-motorsport` — single-event motorsport poster pipeline
- `npm run smoke:sports-broadcast-artwork` — broadcast layout coverage
- `npm run smoke:sports-resolution` — SportsMeta resolution outcomes
- `npm run smoke:sports-catalog-seeds` — catalog seed terms

## 10. Ambiguous / missing / questionable cases for Phase 1

Each of these needs an explicit user decision before any implementation in Phase 3.

1. **Non-team team sports lumped under `rugby` appSportHint**: Volleyball, Beach Volleyball, Handball, AFL, Ultimate all currently route to the `rugby` 4K backdrop bucket via `appSportHint: 'rugby'`. Keep, split, or add new buckets?

2. **Non-bucketed sports**: The 17 manifest catalogs include Cycling and Snooker, but neither has its own backdrop bucket — both fall through to `generic-sport-4k.jpg`. Athletics, gymnastics, aquatics, winter, olympics also fall through to generic. Add buckets, or accept generic?

3. **Mind sports / esports / docs**: Chess, BrainGames, ESport, Documentary all map to `appSportHint: 'athletics'` (so they share the generic backdrop) and `posterClass: 'tournament_event'/'generic_event'`. Out of scope, or include with explicit treatment?

4. **Poster families coverage**: Today the user has bought into 3 families (`08-team-vs-team`, `09-competitor-vs-competitor`, `10-single-event-motorsport`). 16 poster classes need to map to those 3 families, plus a fallback for the unmapped ones (`golf_event`, `cycling_event`, `athletics_event`, `olympic_event`, `winter_sport_event`, `aquatics_event`, `gymnastics_event`, `tournament_event`, `generic_event`). Single fallback poster, sport-specific per-class poster, or upgrade to one of the 3 families?

5. **Wrestling card layouts**: WWE/AEW pay-per-view shows are *event* posters with multiple bouts, not single fixtures. Use `09-competitor-vs-competitor` for the headline match, render a single event poster like motorsport, or invent a new card-layout family?

6. **Multi-fight UFC/boxing cards**: UFC events show one main event + prelims. Should every fight on the card get its own competitor-vs-competitor poster, or only the headline bout?

7. **Motorsport backdrop labels**: Today's regex routes Formula 1 → `formula1` bucket, MotoGP → `motogp` bucket, all others (WRC, NASCAR, IndyCar, Supercars, WEC, Formula E) → `generic-sport`. Phase 1 should ask whether NASCAR/IndyCar/WRC/Formula E deserve their own buckets, share a generic `motorsport` bucket, or stay as today.

8. **Generic backdrop wording**: Currently the same `generic-sport-4k.jpg` is reused for any unrecognised sport. Phase 1 should confirm there is no per-sport text overlay to add.

9. **Event-specific vs sport-level backdrops**: Today's design rule (CLAUDE.md, `sport-backdrops/README.md`) is sport-level only — never per-event. Confirm this stays.

10. **Default poster template for free users**: Today's default is `ticket-stub`. Confirm or change.

11. **Paid template upgrade path**: For SportsMeta-paying users, the paid Sports Posters live on the SportsMeta member addon. PVTKRRX is not a paid-tier branch. Confirm Phase 1 questions do not introduce a paid PVTKRRX branch.

12. **Stale audit-script defaults**: `scripts/audit-sports-posters.js`, `scripts/audit-sports-artwork.js`, `scripts/probe-sports-item.js` all default the manifest URL to `https://pvt.kepners.co.uk/...` which is dead (502). Phase 4 proof must override these via env var. Should these defaults be updated as part of Phase 3? (Trivial, but worth asking.)

---

## 11. Inputs the proxy currently accepts (for Phase 2 contract)

From `buildVariantUrl` inputs and `buildArtworkInputFromRequest`:
- `sport` / `sportHint` (one of the 18+ app sport hints)
- `league` / `competition` (free text → mapped via `LEAGUE_CODES` for short codes)
- `title` / `name` / `displayTitle` / `eventName` (the event title)
- `eventDate` / `releaseInfo` / `date`
- `homeTeam` / `home` / `awayTeam` / `away` (matchup sides)
- `principalA` / `principalB` (single-side competitors)
- `eventClass` / `posterClass` (one of the 16 poster classes)
- `eventDetail` / `detail` / `session` (race session, round, day)
- `rawTitle` (the original tracker title)
- `category` / `source` (SportsCult category origin)
- `seeders`, `size` (audit metadata; not rendered)
- `template` / `sportsPosterTemplate` (one of the 7 template slugs)
- `canonicalId` / `sportsmetaCanonicalId` (e.g. `sportsmeta:event:...`)
- `sportsmetaBaseUrl` (override; defaults to `https://sportsmeta.pvtkrrx.cc`)
- `baseUrl` (the active PVTKRRX addon origin; required to emit a proxy URL)

These are the fields the Phase 2 template contract will reference when it specifies what each poster/template needs.

---

## 12. Exit criteria

- ✅ All 17 manifest catalogs enumerated.
- ✅ All 16 backdrop buckets enumerated.
- ✅ 70 SportsCult source categories + ambiguities flagged.
- ✅ All 16 poster classes enumerated.
- ✅ All 7 poster templates enumerated and mapped to python-template family numbers.
- ✅ 3 poster-family generators (`08`/`09`/`10`) noted plus the gap for unmapped classes.
- ✅ Free vs paid gating verified end-to-end.
- ✅ Ambiguous/missing cases listed with specific Phase 1 questions.
- ⏭ Continue to Phase 1: ask the user the template questions via `AskUserQuestion` popup, in batches.

Verdict: Phase 0 **COMPLETE**. Proceed to Phase 1.
