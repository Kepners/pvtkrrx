# Sports Filing + Naming Convention

Updated: 2026-04-30

How sports things are named, where they live, and what the URL/ID grammar is across PVTKRRX and SportsMeta. If you're inventing a new sport, league, template, or asset path, follow this.

## Canonical event id grammar

Owned by SportsMeta. Used everywhere downstream.

```
sportsmeta:event:<sport>|<date>|<league>|<key>
                  └─┬──┘ └─┬─┘ └──┬──┘ └─┬─┘
                    │     │       │     └── slug-of-event-or-matchup, see below
                    │     │       └── slug-of-league
                    │     └── ISO date YYYY-MM-DD
                    └── one of the canonical sport slugs (table below)
```

`<key>` shape:
- Matchup events: `<home-slug>-vs-<away-slug>` (e.g. `houston-rockets-vs-los-angeles-lakers`)
- Solo / non-matchup: short event title slug (e.g. `motul-hungarian-round-superpole`)

Real examples currently in production:
- `sportsmeta:event:motorsport|2026-05-01|worldssp|motul-hungarian-round-superpole`
- `sportsmeta:event:motorsport|2026-05-01|nhra-drag-racing|nhra-southern-nationals`
- `sportsmeta:event:basketball|2026-04-08|nba|oklahoma-city-thunder-vs-la-clippers`

URL-encoding rules:
- The `:` between `sportsmeta` / `event` / `<sport>` is encoded as `%3A` in URLs.
- The `|` separators are encoded as `%7C`.
- The `<key>` slug is already URL-safe.
- Example fully-encoded: `sportsmeta%3Aevent%3Amotorsport%7C2026-05-01%7Cworldssp%7Cmotul-hungarian-round-superpole`

PVTKRRX-internal ids use prefix `pvtkrrx:` for unresolved sports rows. These are not stable and never appear outside of PVTKRRX → its own meta/stream handlers.

## Sport slugs (canonical)

Used in the `<sport>` segment of the event id, the default-poster route `/asset/default/poster/<sport>`, the 4K backdrop filenames, and the SportsMeta `data-palette` attribute.

| Slug | Display name | Notes |
|---|---|---|
| `american-football` | American Football | NFL, NCAA F |
| `baseball` | Baseball | MLB |
| `basketball` | Basketball | NBA, NCAA B, WNBA, EuroLeague |
| `boxing` | Boxing | merges into `combat` palette |
| `cricket` | Cricket | IPL, T20, ODI, Test |
| `cycling` | Cycling | TdF, Giro, Vuelta |
| `darts` | Darts | PDC events |
| `fighting` | Fighting | umbrella for combat sports |
| `football` | Football | a.k.a. soccer in en-US; Premier League, La Liga etc. |
| `golf` | Golf | PGA, LPGA, LIV, Masters, Ryder |
| `hockey` | Hockey | field hockey |
| `ice-hockey` | Ice Hockey | NHL |
| `mma` | MMA | UFC, PFL, Bellator |
| `motorsport` | Motorsport | Formula 1, MotoGP, WRC, NASCAR, IndyCar, NHRA, WEC, etc. |
| `rugby` | Rugby | union + league |
| `snooker` | Snooker | PDC adjacent |
| `tennis` | Tennis | ATP, WTA, Wimbledon, US Open |
| `wrestling` | Wrestling | merges into `combat` palette |

**Family rollups for palette/pattern selection** (`broadcastSportKey` in both renderers):
- `motorsport` covers F1, MotoGP, WRC, rally, NASCAR, IndyCar, NHRA, WEC, Supercars, Le Mans
- `combat` covers MMA, UFC, boxing, wrestling, WWE, AEW
- `football` covers Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, Europa, FA Cup, World Cup, EPL, MLS
- `tennis` covers ATP, WTA, Wimbledon, US Open, Roland Garros, Australian Open
- `cricket` covers IPL, T20, ODI, Test match, Ashes
- `basketball` covers NBA, WNBA, EuroLeague, NCAAB

Anything not matching falls to `generic` (dark blue/black).

## League slugs

League names are slugified by `slugify` (lowercase, non-alphanumeric → `-`, trim leading/trailing `-`). Common ones:

| Display | Slug | Family | Code |
|---|---|---|---|
| English Premier League | `english-premier-league` | football | EPL |
| FA Cup | `fa-cup` | football | FAC |
| Major League Soccer | `major-league-soccer` / `mls` | football | MLS |
| NBA Playoffs | `nba-playoffs` | basketball | NBA |
| NBA | `nba` | basketball | NBA |
| NFL | `nfl` | american-football | NFL |
| NHL | `nhl` | ice-hockey | NHL |
| MLB | `mlb` / `major-league-baseball` | baseball | MLB |
| Formula 1 | `formula-1` / `f1` | motorsport | F1 |
| MotoGP | `motogp` | motorsport | MGP |
| WRC | `wrc-<round>` (e.g. `wrc-spain`) | motorsport | WRC |
| UFC | `ufc` | mma | UFC |
| PGA Tour | `pga-tour` / `pga` | golf | PGA |
| Indian Premier League | `indian-premier-league` / `ipl` | cricket | IPL |
| Wimbledon | `wimbledon` | tennis | WIM |
| WWE | `wwe` | wrestling | WWE |
| AEW | `aew` | wrestling | AEW |

The `Code` column is the short token used in the broadcast pill badge. Add aliases in `LEAGUE_CODES` (SportsMeta) and `LEAGUE_CODE_ALIASES` (PVTKRRX) when introducing new leagues.

## Pill label rules (`broadcastPillLabel`)

The top-left pill on the broadcast poster picks a label from this priority chain (after stripping placeholders like `TBA`, `TBD`, `N/A`, `Event`):

1. Hardcoded recognizers in this order: `MotoGP`, `WRC`, `F1`, `NBA`, `NFL`, `NHL`, `MLB`, `UFC`, `PGA`, `IPL`, `MLS`. (Both renderers share the same list.)
2. Whitelist `BROADCAST_ALLOWED_LABELS` of clean uppercase short codes (`AEW`, `AFCON`, `ATP`, `EFL`, `EPL`, `FA`, `FIFA`, `IPL`, `LIV`, `PDC`, `UCL`, `UEL`, `UEFA`, `WEC`, `WTA`, `WWE`, …).
3. Else use the cleaned league name uppercased + truncated to 18 chars.
4. Else fall back to the cleaned sport name uppercased.
5. Final fallback: `SPORTS`.

Never put title acronyms in the pill (e.g. `ICS` from "Islas Canarias Saturday Highlights"). Both renderers strip those.

## Template names

Seven sports poster templates exist. The free tier defaults to `ticket-stub`; member tier can pick any.

| Template | Source repo path | Visual character |
|---|---|---|
| `editorial` | both | Magazine cover, serif italic, gold rule |
| `broadcast` | both (audited 2026-04-30) | Sports-broadcast graphics: sport-keyed gradient + decorative pattern + pill badge + Inter title + accent stripes |
| `sportsbook` | both | Trading-floor style, rgba dark panels, JetBrains Mono labels |
| `trading-card` | both | Glossy bordered card, rx=42 outer + rx=34 inner, gold trim |
| `brutalist` | both | Large flat color blocks top, no rounded corners |
| `ticket-stub` | both | Cream paper, ticket perforation, gold rule, free-tier default |
| `glitch` | both | Cyberpunk RGB-channel-shift overlay; risky on legible titles |

Source-of-truth visual references for each: `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates`. Don't redesign; port.

## URL patterns

### SportsMeta-served (upstream)

```
# Default (per-sport fallback) routes
GET /asset/default/poster/<sport>?league=<L>&title=<T>&date=<D>&template=<TMPL>
GET /asset/default/background/<sport>?...
GET /asset/default/landscape/<sport>?...

# Canonical event routes (need real <id>)
GET /asset/poster/<urlencoded-canonical-id>?template=<TMPL>
GET /asset/background/<urlencoded-canonical-id>?template=<TMPL>
GET /asset/landscape/<urlencoded-canonical-id>?template=<TMPL>
GET /asset/logo/<urlencoded-canonical-id>
GET /asset/leagueLogo/<urlencoded-canonical-id>
GET /asset/homeBadge/<urlencoded-canonical-id>
GET /asset/awayBadge/<urlencoded-canonical-id>

# Member-token premium routes (paid SportsMeta install only)
GET /member/<token>/asset/<variant>/<id>?template=<TMPL>
```

The `<TMPL>` query is honored on:
- The default route for everyone.
- The canonical route only when memberScoped (i.e. `/member/<token>/...`); public canonical requests fall back to `defaultSvg.js`'s sport-family layout.

### PVTKRRX-served (client-safe PNG bytes)

```
GET /sports-artwork/default/poster/<sport>.png?league=<L>&title=<T>&...&template=<TMPL>
GET /sports-artwork/id/poster/<urlencoded-canonical-id>.png?template=<TMPL>
```

Plus `background` and `landscape` variants. PVTKRRX rasterizes SportsMeta's SVG via sharp before serving (Stremio clients don't reliably render SVG).

### Headers PVTKRRX returns

| Header | Meaning |
|---|---|
| `X-PVTKRRX-Artwork-Source` | `sportsmeta-raster` (proxied raster), `sportsmeta-svg-rasterized` (SVG → PNG via sharp), `pvtkrrx-template-glyph` (local fallback rendered the SVG → PNG), `pvtkrrx-sport-4k-backdrop` (served a JPEG from `backdrops/`), `pvtkrrx-emergency-legacy-fallback`, `pvtkrrx-public-template`, `pvtkrrx-paid-template` |
| `X-PVTKRRX-Artwork-Template` | The template requested/applied (`broadcast`, `ticket-stub`, …) |
| `X-PVTKRRX-Artwork-Layout-Family` | `BROADCAST`, `EDITORIAL`, `TICKET_STUB`, … |
| `X-PVTKRRX-Artwork-Cache` | `disk`, `rendered`, `memory` — where the bytes came from |
| `X-PVTKRRX-Artwork-Fallback` | Reason a fallback was taken (`sportsmeta_central_svg_layout_replaced`, `sportsmeta_svg_rasterized`, `upstream_404`, …) |
| `X-PVTKRRX-Sport-Backdrop` | When a sport-keyed JPEG backdrop was served, which bucket (`motogp`, `nba`, `generic-sport`, …) |
| `X-PVTKRRX-Sport-Backdrop-Fallback` | Reason a generic sport backdrop was used |
| `X-PVTKRRX-Sports-Event-Class` | `team_vs_team`, `motorsport_event`, `combat_event`, `tennis_or_snooker_match`, … |

## File-system naming

### 4K sport backdrops (PVTKRRX repo)

Path: `backdrops/python-backdrops/<sport>-4k.jpg`
- Sport slug from the canonical sport list above.
- Generic catch-all: `generic-sport-4k.jpg`.
- Actual files committed at 2026-04-30: `boxing-4k.jpg`, `cricket-4k.jpg`, `darts-4k.jpg`, `football-4k.jpg`, `formula1-4k.jpg`, `generic-sport-4k.jpg`, `golf-4k.jpg`, `mlb-4k.jpg`, `motogp-4k.jpg`, `nba-4k.jpg`, `nfl-4k.jpg`, `nhl-4k.jpg`, `rugby-4k.jpg`, `tennis-4k.jpg`, `ufc-4k.jpg`, `wrestling-4k.jpg`. Notice `formula1-4k.jpg` keeps the legacy `formula1` slug not `f1`; the resolver maps both.

### SportsMeta asset cache

Path: `/opt/sportsmeta/data/assets/cache/<first-2-of-sha>/<sha256>.<ext>` (PNG/SVG/JPG/WEBP).
SHA-256 of `source_url`; same key as `cache_key` in the `sportsmeta_assets` table.

### PVTKRRX raster cache

Two dirs (both equivalent shape):
- `/opt/pvtkrrx/data/pvtkrrx/sports-artwork-raster-cache/` (primary, ~272MB)
- `/opt/pvtkrrx/runtime/sports-artwork-raster-cache/` (secondary, ~1.2MB)

Per entry:
- `<sha256-of-cache-key>.bin` — raster bytes (PNG)
- `<sha256-of-cache-key>.json` — `{ version, createdAt, expiresAt, contentType, selectedArtworkSource, selectedTemplate, eventClass, fallbackReason, httpStatus, upstreamContentType }`

`selectedTemplate` is the right field to filter by when you want to bust one template's cache without nuking others. Some legacy entries have empty `selectedTemplate`; for a clean total bust, `rm -rf` the directory and `systemctl restart pvtkrrx.service` (or rebuild the Coolify container, if the cache lives in the container's writable layer).

## Versioning tokens

These appear in poster URLs and bust the entire content-addressable cache when bumped:

| Token | Owner | Where |
|---|---|---|
| `LOCAL_ARTWORK_RENDER_VERSION` (currently `20260430-public-sportsmeta-v1`) | PVTKRRX | `src/handlers/sportsArtworkProxy.js` |
| `CENTRAL_ARTWORK_VERSION` (currently `v2-central-templates`) | SportsMeta | `src/centralArtwork.js` |
| `DEFAULT_SVG_VERSION` (currently `v2-sportfamily`) | SportsMeta | `src/defaultSvg.js` |

Bumping any of these forces every consumer to fetch fresh bytes. Use sparingly — the SportsMeta DB has ~118k cached assets that all become stale at once.

## Don't-ever rules

- Don't put fake placeholder text on a poster. No `TBA`, `TBD`, `Sports Event` (unless cleaned to nothing). Both renderers strip these.
- Don't fake a `LIVE` badge unless `event.isLive === true`.
- Don't reuse the F1 racing-car glyph for non-F1 motorsport (WRC, MotoGP, NASCAR all have their own glyph or fall to `motorsport`).
- Don't output `SPORTSMETA · DEFAULT · POSTER` from the PVTKRRX local renderer — that wordmark is reserved for SportsMeta-served bytes. PVTKRRX local fallback uses `PVTKRRX · BROADCAST`.
- Don't truncate the broadcast title with ellipsis. Reduce font size and wrap.
- Don't force a `VS` marker if the event has no parsed home/away.
- Don't put the home-team color on the LEFT and away on the RIGHT for sports without that convention. Some sports list "home" second; renderer respects that order via `event.homeTeam`/`event.awayTeam` slots.
