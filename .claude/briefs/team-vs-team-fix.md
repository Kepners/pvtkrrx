# BRIEF: TEAM_VS_TEAM sports poster — finish-line audit-and-prove pass

> **Audience:** CX (or any agent) continuing the TEAM_VS_TEAM poster work in PVTKRRX.
> **Style:** Audit-and-prove. Separate assumed / verified-locally / verified-live. Never claim live success unless live endpoints were actually hit.

---

## 0. State at the time this brief was issued

You are NOT starting from scratch. The TEAM_VS_TEAM family already has a working generator. Six commits have landed against this work:

| Commit | Purpose |
|---|---|
| `ab67428` | Initial team-vs-team generator + smoke + adapter wiring |
| `32dad99` | Restore TEAM_VS_TEAM poster proof generator |
| `1f4f317` | Skip digit-prefixed words when deriving short codes (49ers fix) |
| `78e78dc` | Drive team codes from SportsMeta, drop hardcoded fixture overrides |
| `6b7c33e` | 3+ word team initials use full acronym, not first+last |
| `69686bd` | Docs: GitHub→Coolify auto-deploy webhook is now wired |

**Read those commits first.** Build on them. Do not rewrite the generator from scratch.

---

## 1. Hard facts to internalise before touching code

1. **The Python source for TEAM_VS_TEAM is IN-REPO**, not in the user's external `projects/` tree:
   - Generator: `backdrops/python-backdrops/08-team-vs-team/generate.py`
   - Shared helpers: `backdrops/python-backdrops/_shared/`
   - **Ignore** any external paths like `C:\Users\kepne\projects\L - PVTKRRX\backdrops\python-backdrops` or `…\PCnestspeaker\python-templates`. Those are reference-only and do NOT contain the live `08-team-vs-team` source.

2. **PVTKRRX has NO sports image cache anymore.** It was deleted on 2026-04-22. SportsMeta is the only source of sports artwork. Do not rebuild a cache. Logo URLs to use:
   - Team logo: `https://sportsmeta.pvtkrrx.cc/asset/team/{league}/{slug}`
   - League logo: `https://sportsmeta.pvtkrrx.cc/asset/league/{league}`
   - Default fallback: `https://sportsmeta.pvtkrrx.cc/asset/default/{variant}/{sport}`

3. **`main` is auto-deployed to Coolify via webhook.** Pushing to `main` ships to real users. **For this work, use a feature branch and do NOT push to `main`** unless explicitly told to. `git push origin <feature-branch>` only.

4. **`docs/copy.md` is locked read-only.** Section F of the final report is chat-reply only. Do NOT edit `docs/copy.md`.

5. **Authoritative version source:** `package.json`. Ignore version numbers in `CLAUDE.md`, `MEMORY.md`, or other docs — they have drifted (1.1.65 vs 1.1.51 vs 1.1.32).

6. **Coordinate axis:** SVG/raster top-left origin. `y` increases downward. Therefore "home higher than away" means `homeBox.y < awayBox.y`.

7. **Canvas sizes are pinned, two of them, on purpose:**
   - `SOURCE_BOX = 400 × 600` — runtime SVG emitted by `renderSportsPosterTemplateSvg`. Stays compact for fast Stremio tile rendering.
   - `POSTER_BOX = 600 × 900` — Python-generated PNG/SVG at 2:3 poster ratio for the proof bundle.
   Do not change these without explicit go-ahead.

8. **VS centring tolerance:** `≤ 2px` against canvas centre. Smoke currently asserts `≤ 1px` — keep it tight; do not relax.

---

## 2. Goal

Bring TEAM_VS_TEAM to acceptance for this whole list:

- Football, basketball (NBA), hockey (NHL), baseball (MLB), American football (NFL), rugby, cricket team fixtures.
- Real SportsMeta logos when available; deterministic clean initials when not.
- Home visually higher-left, Away lower-right, VS centred, no overlap.
- No fake LIVE, no TBA, no merged team-name strings, no ellipsis in essential team names, no fake acronym pill badges.
- Negative routing: motorsport (F1, MotoGP, WRC, NASCAR, IndyCar) and person-vs-person sports (boxing, tennis, UFC, snooker, darts) must NOT pick TEAM_VS_TEAM.
- Broadcast and every other smoke must still pass.

---

## 3. System boundary (allowed / forbidden)

**Allowed to modify:**
- `backdrops/python-backdrops/08-team-vs-team/generate.py`
- `backdrops/python-backdrops/_shared/*.py` if a shared helper is genuinely broken AND every other family's smoke still passes.
- `src/utils/sportsPosterAdapter.js`
- `src/utils/sportsPosterTemplates.js`
- `src/utils/sportsArtwork.js`
- `src/utils/sportsArtworkProxy.js` and `sportsArtworkDiskCache.js` only if shared helper is broken.
- `src/utils/sportsEventClassifier.js`, `sportsEventNormalizer.js` (parser/classifier work).
- `scripts/smoke-sports-team-vs-team.js` and any new smoke specifically for this family.
- `package.json` only to register a new smoke script if one is added.

**Forbidden to modify (boundary):**
- Anything under `electron/`, `installers/`, `caddy/`, deployment scripts.
- Route model in `index.js`, `src/handlers/manifest.js`, `src/handlers/stream*.js`, `src/handlers/playback*.js`.
- LAN bridge, Stremio auth, qBittorrent, Prowlarr code paths.
- `docs/copy.md` (locked).
- Any rebuild of a PVTKRRX sports image cache (it was deliberately deleted).
- `main` branch push without explicit go-ahead.

**SportsMeta integration constraint:**
- SportsCult/Prowlarr remains catalog source of truth.
- SportsMeta supplies team identity (`short`, `initials`) and artwork (`team`, `league`, `default` endpoints). PVTKRRX must call SportsMeta for these — never reinvent them locally.
- If SportsMeta is unavailable, fall back to deterministic initials (rule below). Never fabricate a logo URL.

---

## 4. Selection rules (when does TEAM_VS_TEAM win?)

**Pick TEAM_VS_TEAM only when ALL are true:**
- Two teams confidently parsed from title.
- Sport is in: `football`, `basketball`, `hockey`, `baseball`, `american-football`, `rugby`, `cricket` (team fixture only — not a single-event highlights show).
- Title structure matches one of:
  - `Team A vs Team B`
  - `Team A v Team B`
  - `Team A @ Team B` — see below
  - SportsCult equivalent (e.g. `Team.A.vs.Team.B.YYYY.MM.DD.LEAGUE.<noise>`)

**Home/away convention (this matters — silent inversion is a real risk):**
- `vs` and `v`: first team is **home**, second is **away**. (`Manchester City vs Arsenal` → home=Man City)
- `@`: first team is **away**, second is **home** — US sports convention. (`Houston Rockets @ Los Angeles Lakers` → home=Lakers, away=Rockets)
- The parser MUST distinguish these two cases. Add a fixture for each.

**Reject TEAM_VS_TEAM when ANY is true:**
- Sport is motorsport (F1, MotoGP, WRC, NASCAR, IndyCar).
- Sport is person-vs-person without a dedicated COMPETITOR_VS_COMPETITOR layout (boxing, tennis, UFC, snooker, darts, golf).
- Title is broadcast / highlights / preview with no reliable pair (e.g. `EPL Saturday Highlights`).
- Either side parses as `TBA`, `TBD`, or empty.
- Title contains only one team (e.g. `Manchester City Season Review`).

---

## 5. Initials fallback — ONE deterministic rule (no "MC or MCI" ambiguity)

When SportsMeta does not supply a team identity, derive initials with this exact algorithm:

1. **Tokenise** team name on whitespace. Drop tokens whose first character is a digit (handles `49ers`).
2. **Count remaining tokens N** (letter-starting words):
   - `N == 1`: take the first 3 letters of that single word, uppercased. Cap at 3. (`Arsenal` → `ARS`, never `ARSE`.)
   - `N == 2`: first letter of each token, uppercased. (`Houston Rockets` → `HR`. `San Francisco` → `SF`.)
   - `N >= 3`: first letter of each token, uppercased, concatenated. (`Boston Red Sox` → `BRS`. `Kansas City Chiefs` → `KCC`. `Los Angeles Lakers` → `LAL`.)
3. **Vulgarity guard:** if the resulting code matches `/(?:ARSE|FUCK|SHIT|CUNT|CRAP)/i`, fall back to first 3 letters truncated by a different stride or use the league-team override map. Never ship a vulgar code.
4. **SportsMeta override:** if `event.home.short` / `event.away.short` is present, USE IT VERBATIM (already capped, vetted server-side). Same for `.initials`.

This algorithm is already implemented in CX's last few commits. Lock it in tests, do not redesign it.

---

## 6. Logo priority (forbidden inventions listed)

Order:
1. SportsMeta team endpoint with the resolved `{league}/{slug}`.
2. SportsMeta league endpoint as a single-side fallback (only if BOTH team endpoints fail — never paint the same league logo on both sides).
3. Deterministic initials per §5 inside a clean circle/shield.

**Forbidden:**
- Inventing a team logo URL.
- Painting a generic sport icon as if it were a team logo.
- Rendering both home AND away as the same league logo.
- Generating a synthetic acronym "pill badge" derived from full title initials (e.g. an `MCA` pill from `Manchester City Arsenal`).
- Showing `LIVE` unless `event.live === true` or an equivalent explicit boolean from the upstream catalog.
- Showing `TBA` / `TBD`. If parsed, the classifier must reject TEAM_VS_TEAM upstream.

---

## 7. Required SVG / proof markers

Every TEAM_VS_TEAM SVG output MUST emit these exact attributes (smoke depends on them):

```
<svg ... data-layout-family="TEAM_VS_TEAM">
  <g data-role="home-team-visual" data-team-side="home" data-team-name="..."
     data-box-x="..." data-box-y="..." data-box-width="..." data-box-height="...">
    <text data-role="fallback-team-initials" data-team-side="home">...</text>
  </g>
  <g data-role="away-team-visual" data-team-side="away" data-team-name="..."
     data-box-x="..." data-box-y="..." data-box-width="..." data-box-height="...">
    <text data-role="fallback-team-initials" data-team-side="away">...</text>
  </g>
  <g data-role="versus" data-box-x="..." data-box-y="..." data-box-width="..." data-box-height="...">VS</g>
</svg>
```

Each Python-generated fixture also MUST emit a sibling JSON proof file with:

```json
{
  "layoutFamily": "TEAM_VS_TEAM",
  "homeTeam": "...",
  "awayTeam": "...",
  "leagueLabel": "...",
  "homeVisualBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "awayVisualBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "versusBox":     { "x": 0, "y": 0, "width": 0, "height": 0 },
  "titleFitStatus": {
    "home": { "status": "fit|wrap|shrink|clip" },
    "away": { "status": "fit|wrap|shrink|clip" }
  },
  "usedLogoOrInitials": "logo|initials|league-fallback",
  "warnings": []
}
```

Smoke MUST assert `titleFitStatus.*.status === "fit"` for every required fixture. `clip` is a fail.

---

## 8. Required fixtures

### Positive (must select TEAM_VS_TEAM and pass all geometry/text assertions)

| # | Slug | Title | Sport | League | Notes |
|---|---|---|---|---|---|
| 1 | `epl-manchester-city-arsenal` | `Manchester City vs Arsenal EPL` | football | English Premier League | Pristine input |
| 2 | `nba-houston-rockets-lakers` | `Houston Rockets vs Los Angeles Lakers` | basketball | NBA | Pristine, `vs` |
| 3 | `nba-rockets-at-lakers` | `Houston Rockets @ Los Angeles Lakers` | basketball | NBA | **`@` convention — home must be Lakers, away Rockets** |
| 4 | `nba-cavaliers-raptors` | `Cleveland Cavaliers vs Toronto Raptors` | basketball | NBA | |
| 5 | `nhl-flyers-penguins` | `Philadelphia Flyers vs Pittsburgh Penguins` | hockey | NHL | |
| 6 | `nfl-49ers-chiefs-generic-fallback` | `San Francisco 49ers vs Kansas City Chiefs` | american-football | NFL | Digit-prefix token; expect SF / KCC |
| 7 | `mlb-yankees-redsox-generic-fallback` | `New York Yankees vs Boston Red Sox` | baseball | MLB | Expect NYY / BRS |
| 8 | `laliga-real-madrid-barcelona` | `Real Madrid vs Barcelona La Liga` | football | La Liga | Multi-word non-English club |
| 9 | `epl-noisy-real-world-title` | `Manchester.City.vs.Arsenal.2026.04.30.EPL.1080p.WEB-DL.x264-FOO` | football | EPL | **Real-world Prowlarr noise — parser must strip cleanly** |
| 10 | `epl-live-fixture` | `Manchester City vs Arsenal EPL` with `event.live = true` | football | EPL | **LIVE marker MUST appear** |
| 11 | `epl-no-sportsmeta` | `Manchester City vs Arsenal EPL` with stubbed SportsMeta failure | football | EPL | **Fallback to initials path; no broken-image artifact; no league-logo-on-both-sides** |

### Negative (must NOT select TEAM_VS_TEAM)

| Slug | Title | Why |
|---|---|---|
| `motogp-brazil` | `MotoGP Brazil Gear Up` | motorsport |
| `wrc-spain-highlights` | `WRC Spain Islas Canarias Saturday Highlights` | motorsport + highlights |
| `boxing-fury-usyk` | `Tyson Fury vs Oleksandr Usyk Heavyweight Title` | person-vs-person |
| `tennis-alcaraz-sinner` | `Carlos Alcaraz vs Jannik Sinner ATP Finals` | person-vs-person |
| `darts-littler-mvg` | `Littler vs Van Gerwen Premier League Darts` | person-vs-person (note: `Premier League` substring is a trap) |
| `snooker-trump-selby` | `Trump vs Selby UK Championship` | person-vs-person |
| `tba-away-side` | `Liverpool vs TBA` | TBA side — classifier must reject |
| `single-team-no-vs` | `Manchester City Season Review` | single team |
| `epl-highlights` | `EPL Saturday Highlights` | broadcast/highlights, no pair |

### Broadcast regression
- Re-run the existing broadcast fixtures. Every assertion must still pass with byte-for-byte stability on the broadcast SVG markers.

---

## 9. Geometry assertions (locked numbers)

For every positive fixture, smoke MUST assert against `POSTER_BOX = 600 × 900` (Python output) and `SOURCE_BOX = 400 × 600` (runtime SVG):

```
assert |versusBox.center.x − canvas.width  / 2| ≤ 2
assert |versusBox.center.y − canvas.height / 2| ≤ 2
assert homeBox.y < awayBox.y                                  // home higher (lower y)
assert homeBox.x + homeBox.width  / 2 < canvas.width / 2      // home left of centre
assert awayBox.x + awayBox.width  / 2 > canvas.width / 2      // away right of centre
assert homeBox does not overlap versusBox
assert awayBox does not overlap versusBox
assert homeBox does not overlap awayBox
```

Plus the existing slot-coordinate locks at [scripts/smoke-sports-team-vs-team.js:275-284](scripts/smoke-sports-team-vs-team.js#L275-L284) — keep them.

---

## 10. Visual regression (do not rely on JSON alone)

For each positive fixture, the Python generator MUST emit:
- `<slug>.svg` (markers + JSON proof)
- `<slug>.png` (rasterised)
- `<slug>.proof.json` (structured proof)

Smoke MUST also compute a `sharp`-based perceptual hash of each PNG and compare against a checked-in golden hash file at `tests/fixtures/team-vs-team/<slug>.hash.json`. Tolerance: ≤ 2% Hamming distance for pHash. If the hash diff exceeds tolerance, the smoke fails AND prints the new hash so the human reviewer can update the golden after eyeballing the contact sheet.

Generated artifacts go to `.runtime/sports-team-vs-team-smoke/`. **Add a `.gitignore` entry for `.runtime/` if not already present.** Goldens (hash JSON only — not the PNGs themselves) live under `tests/fixtures/team-vs-team/` and ARE committed.

---

## 11. Phases

### Phase 1 — Map the pipeline
Report exact file/line refs for: Python generator, shared layout helpers, logo loader, JS adapter, classifier, normalizer, home/away parser, initials algorithm, VS rendering, title-fit helper, smoke. **Stop and confirm in chat before changing code.**

### Phase 2 — Selection rules
Walk §4 against the classifier code. Add any missing branches. Fix the `@` convention if the parser doesn't already handle it. Confirm person-vs-person sports route to a different family (or `null` until a COMPETITOR_VS_COMPETITOR family lands).

### Phase 3 — Generator
Implement layout per §5–§7 in Python source. Don't patch generated SVG/PNG. Re-derive output by running the generator.

### Phase 4 — Logo & fallback
Wire SportsMeta endpoints per §6. Verify the "SportsMeta unavailable" fixture produces clean initials, not a broken-image artifact and not a both-sides-same-league-logo poster.

### Phase 5 — Tests
Add the missing fixtures from §8. Lock geometry per §9. Lock pHash regression per §10.

### Phase 6 — Proof markers
Verify §7 markers are present and consumable by the smoke. Update existing markers if missing attributes.

### Phase 7 — Smoke assertions
Tighten per §9. Add explicit `titleFitStatus === "fit"` checks. Add LIVE-on-when-live and LIVE-off-by-default checks.

### Phase 8 — Regenerate fixtures
Run the generator. Land outputs in `.runtime/sports-team-vs-team-smoke/`. Commit only the hash JSON goldens.

### Phase 9 — Verification commands (run ALL, report PASS/FAIL each)

```
python <generator>                          # the exact command must be in the report
npm run smoke:sports-team-vs-team
npm run smoke:sports-broadcast
npm run smoke:sport-backdrops
npm run smoke:sports-artwork
npm run smoke:sports-poster-render
npm run smoke:sports-poster-adapter
npm run smoke:sports-poster-classifier
npm run smoke:sports-resolution
npm run smoke:sportcult-category-map
npm run smoke:sports-catalog-seeds
npm run smoke:guards
git diff --check
git status --short
```

If `npm test` does not exist, report exactly: `npm test: FAIL — no test script`.

### Phase 10 — Cache-bust note (do NOT execute, just include in report)
If/when the change ships, the cache-bust pattern documented in the project `CLAUDE.md` section "Cache invalidation" must be run for both:
- PVTKRRX: `/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` and `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/`, then `systemctl restart pvtkrrx.service` (and Coolify container restart for the public site).
- SportsMeta: `DELETE FROM sportsmeta_assets WHERE source_url LIKE '%/team/%' OR source_url LIKE '%/league/%'` against `/opt/sportsmeta/data/db/sportsmeta.sqlite`, plus delete the matching files in `/opt/sportsmeta/data/assets/cache/`, then `systemctl restart sportsmeta.service`.

Do NOT run these unless explicitly asked.

---

## 12. Final report (use exactly this structure)

### A. Verdict
One of: `READY` / `READY WITH CAVEATS` / `NOT READY`.

### B. Plain-English flow
3–6 sentences. How TEAM_VS_TEAM is selected and rendered end-to-end.

### C. Exact proof
- Branch name and commit SHAs landed
- Files changed (full path list)
- Exact commands run, in order, with PASS/FAIL each
- Fixture output paths
- Rendered values: `layoutFamily`, `homeTeam`, `awayTeam`, `leagueLabel`, `homeVisualBox`, `awayVisualBox`, `versusBox`, `usedLogoOrInitials`, `titleFitStatus`, pHash & golden delta

### D. Weak points
- SportsMeta logo coverage gaps by league
- Sports families still not covered (e.g. COMPETITOR_VS_COMPETITOR not implemented)
- Whether live-route testing was actually performed (it should not be — work is local-only)
- Any remaining visual weaknesses surfaced by the contact sheet

### E. Exact fixes made
File-by-file diff summary in plain English.

### F. Safe public wording
Chat-reply text only. **Do NOT edit `docs/copy.md`.** Do NOT claim live/deployed success. Only claim what the smoke commands actually verified.

---

## 13. Acceptance criteria (the bar)

- `git branch --show-current` is NOT `main`.
- `npm run smoke:sports-team-vs-team` PASSES with all fixtures from §8.
- `npm run smoke:sports-broadcast` PASSES with no regression.
- All other smoke commands in §9 PASS.
- pHash deltas for all positive fixtures within 2%.
- No fake LIVE / TBA / merged team-name string / clipped text / fake acronym pill / both-sides-same-logo case in any output.
- Negative fixtures all reject TEAM_VS_TEAM.
- `@` convention fixture renders Lakers as home, Rockets as away.
- "SportsMeta unavailable" fixture renders clean initials.
- "Live = true" fixture renders LIVE marker; default fixtures do not.
- `git diff --check` clean.
- Report follows §12 verbatim.
