You are working in the PVTKRRX repo.

Goal:
Audit and verify the sports template/rendering system after the SportsCult contract work. Do not treat the contract work as complete unless the visible Stremio sports templates are checked and proven.

Product/system boundary:
- PVTKRRX is the Stremio addon/runtime.
- SportsCult/Prowlarr results remain the source of truth for what appears in the sports catalog.
- TheSportsDB is enrichment only: posters, fanart, thumbnails, league/team/event metadata where available.
- Do NOT flip the catalog to TheSportsDB schedule-first.
- Do NOT show events unless SportsCult/Prowlarr has them.
- Non-SportsCult sports sources may appear as extra stream sources only when they match a SportsCult-owned event.
- Hosted relay must not become a video proxy.
- Preserve the three-route model: PC Local, LAN Bridge, Remote Seedbox.

Live truth to preserve:
- Sports catalog/content exists in the addon family with movies, TV, and library.
- Sports/library IDs use internal pvtkrrx: IDs.
- Meta and stream handlers must decode those IDs.
- TheSportsDB enrichment is optional/cached/fallback-safe.
- SVG/text fallback is allowed only when real artwork is unavailable, not because parsing/enrichment/template flow failed.

Main task:
Do a discovery-first audit of the sports templates and poster/backdrop/template output.

Phase 0 — repo discovery, no edits
1. Identify every sports template/artwork/rendering file.
   Likely areas to inspect, but do not assume this is complete:
   - src/utils/sportsPosterTemplates.js
   - src/utils/sportsPosterAdapter.js
   - src/utils/sportsArtwork.js
   - src/handlers/sportsArtworkProxy.js
   - src/utils/sportsThumb.js
   - src/utils/sportsEventNormalizer.js
   - src/utils/sportsPosterClassifier.js
   - src/utils/sportsTitleParser.js
   - src/config/manifest.js
   - src/handlers/catalog.js
   - src/handlers/meta.js
   - src/handlers/stream.js
   - scripts/smoke-sports*
   - scripts/generate-team-vs-team-posters.js
   - backdrops/python-backdrops/**
2. Return exact file list and state which files are:
   - contract/data parsing
   - enrichment lookup
   - Stremio meta output
   - poster/template rendering
   - backdrop/wallpaper rendering
   - fallback SVG/text rendering
   - smoke/manual verification

Phase 1 — template audit
Check the actual visible sports templates against this expected layout:

Header line:
- Sport or sport family, e.g. Football, Golf, UFC, Tennis, F1.

Second line:
- Event/league/competition, e.g. EPL, PGA, FA Cup Final, UFC 311.

Third line:
- Detail line from parsed torrent/event data:
  - team vs team, e.g. Man Utd v Chelsea
  - competitor vs competitor, e.g. Navratilova v ...
  - round/session, e.g. Tiger Woods Round 2
  - race/session, e.g. F1 Qualifying / Grand Prix
  - NOT generic "Event" unless truly unknown

Hard template failure examples:
- "- EVENT -" placeholder line
- "Event" placeholder subtitle
- title text shooting outside the poster boundary
- important event text too small to read
- serial/stub placeholders such as #BGU-EVE-
- ugly ellipsis where a clean parsed title should exist
- SportsCult raw filename used as the main public-facing title when parsed parts are available
- SVG fallback being used where a real poster/backdrop was available
- poster/backdrop fields missing in catalog/meta when enrichment succeeded

Phase 2 — SportsCult title parser proof
Create or update tests for representative SportsCult title formats. Include real-looking examples:
- EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER
- UFC.311.Early.Prelims.2026.01.18.1080p.WEB-DL.x264
- F1.2026.Round.04.Bahrain.Grand.Prix.Qualifying.1080p
- PGA.2026.The.Masters.Round.2.1080p
- Tennis.2026.Wimbledon.Navratilova.v.Player.720p
- FA.Cup.2026.Final.Team.A.v.Team.B.1080p

For each, prove extracted:
- sport
- league/competition
- date where present
- home/away or competitor names where present
- round/session where present
- quality/format
- clean display title
- template header/line1/line2/line3

Phase 3 — Stremio response proof
Run local route-level checks and capture JSON evidence.

Required routes to test:
- /local/manifest.json?mode=local
- /local/catalog/sports/<sports-catalog-id>.json?mode=local or the actual discovered sports catalog route
- /local/meta/sports/<sample-pvtkrrx-id>.json?mode=local
- /local/stream/sports/<sample-pvtkrrx-id>.json?mode=local

If the exact routes differ, discover them from the manifest and report the exact routes tested.

For catalog/meta JSON, prove:
- metas contain id
- type is correct
- name is clean
- poster exists where enrichment/template generated it
- background/fanart exists where supported
- poster is not empty, null, undefined, or broken URL
- no placeholder text leaks into name/description/poster template fields
- pvtkrrx: ID can be decoded/handled by meta and stream handlers

Phase 4 — visual/template proof
Generate deterministic screenshots or image files for at least these template families:
- team vs team
- competitor vs competitor
- round/session
- generic sports fallback
- no-artwork fallback SVG

For each generated output, return:
- exact command run
- exact output file path
- dimensions
- PASS/FAIL for text staying inside boundaries
- PASS/FAIL for line hierarchy:
  Header = sport
  Line 2 = event/league/competition
  Line 3 = detail
- PASS/FAIL for no placeholder leaks
- PASS/FAIL for readability at Stremio tile size

If screenshots cannot be generated automatically, create a manual verification HTML/page or script that renders the templates and state exactly why automated visual proof was not possible.

Phase 5 — negative regression checks
Prove these do NOT regress:
- Movie/TV sports contamination filter still blocks sports-only indexers from movie/TV searches.
- Sports catalog still uses SportsCult/Prowlarr availability, not TheSportsDB schedule browsing.
- Non-SportsCult sports results do not create independent catalog tiles.
- SVG fallback remains available when artwork cannot be found.
- Hosted /file and /playback still fail fast where required.
- PC Local, LAN Bridge, Remote Seedbox route model remains unchanged.

Phase 6 — commands required
Run and report exact PASS/FAIL:
- npm test, if available
- npm run smoke:config
- npm run smoke:guards
- npm run smoke:lan-pair
- npm run smoke:stremio-link
- any sports-specific smoke scripts discovered, especially scripts matching smoke-sports*
- any parser/template-specific test scripts added
- npm run lint, if available
- npm run build or npm run dist:win only if package scripts support it and changes affect packaging

Do not hide missing scripts. If a command does not exist, mark it as NOT AVAILABLE, not PASS.

Phase 7 — acceptance criteria
Work is not complete unless all are true:

1. SportsCult/Prowlarr remains the catalog source of truth.
2. TheSportsDB enrichment improves posters/backdrops but does not populate schedule-only catalog items.
3. Sports templates are explicitly audited.
4. At least four representative template families are rendered or screenshot-tested.
5. Placeholder text does not leak.
6. Text does not overflow boundaries.
7. Catalog/meta JSON has poster data where expected.
8. SVG fallback only appears when artwork is genuinely unavailable.
9. All changed files are listed.
10. All commands are listed with PASS/FAIL.
11. Remaining caveats are honestly stated.

Required final response format:
A. Verdict
Use one of:
- READY
- READY WITH CAVEATS
- NOT READY

B. Product/system boundary
State exactly what was in scope and what was not.

C. Plain-English explanation/flow
Explain how SportsCult → parser → TheSportsDB enrichment → template → catalog/meta/stream works.

D. Exact proof
Include:
- exact files changed
- exact files inspected
- exact commands run
- exact routes tested
- exact sample IDs/titles used
- PASS/FAIL results
- output image/screenshot paths

E. Template audit result
Table:
Template family | sample input | output path | text boundary PASS/FAIL | placeholder PASS/FAIL | poster/backdrop PASS/FAIL | notes

F. Weak points
Be blunt. Include anything not proven live, not visually verified, or dependent on real SportsCult data/API limits.

G. Exact fixes made
List file-by-file.

H. Safe public wording
Only write safe wording if the feature is actually verified. Do not claim "sports posters fixed" unless visual proof and route proof both passed.