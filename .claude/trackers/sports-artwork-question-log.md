# Sports Artwork Question Log — Phase 1

Status: IN PROGRESS
Date opened: 2026-05-01
Source: `.claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md`
Phase 0 inputs: `.claude/trackers/sports-artwork-discovery.md`

This file records every popup question asked and the user's chosen answer.
Each batch is asked via `AskUserQuestion`. Free-text "Other" answers and any optional notes are captured verbatim.

The Phase 2 template contract (`.claude/trackers/sports-artwork-template-contract.md`) is built strictly from the answers below — Claude does not invent contract rows.

---

## Batch index

| # | Topic | Status | Date answered |
|---|---|---|---|
| 1 | Global artwork rules | pending | — |
| 2 | Team-vs-team poster families | pending | — |
| 3 | Competitor-vs-competitor poster families | pending | — |
| 4 | Multi-fight / wrestling card families | pending | — |
| 5 | Motorsport family | pending | — |
| 6 | Golf and tournament-style sports | pending | — |
| 7 | Backdrop bucket coverage | pending | — |
| 8 | Unknown / fallback handling | pending | — |
| 9 | Audit-script defaults cleanup | pending | — |

---

## Batch 1 — Global artwork rules

Asked: 2026-05-01.

### Q1.1 — Lock SportsMeta as the only artwork source PVTKRRX is allowed to consume?
**Answer:** Yes, SportsMeta-only.
- PVTKRRX consumes SportsMeta public/root URLs and the local sport-level 4K backdrops only.
- No TheSportsDB, no other public sports-artwork API.
- The PVTKRRX SVG→PNG raster proxy + cache stays.

### Q1.2 — Backdrops: sport/family-level only, or event-specific?
**Answer:** Sport-level only (current behavior).
- 16 4K JPG buckets in `public/sports-backdrops/` are the only backdrop source.
- Same backdrop reused for every event in that sport bucket.
- No event-specific backdrops, no marquee curation.

### Q1.3 — Unknown / unclassifiable sports: how should the runtime treat them?
**Answer:** Show with neutral fallback (current behavior).
- `generic-sport-4k.jpg` backdrop + `ticket-stub` poster template + tracker-provided title text.
- Row stays visible in the catalog. Stream availability is preserved.

### Q1.4 — Default poster template for free users / unspecified template requests?
**Answer:** Keep `ticket-stub`.
- Matches CLAUDE.md project rule: "06-ticket-stub is the free/default poster style".
- Auto-upgrades to `broadcast` for non-`team_vs_team` classes via `selectTemplateForSportsClass`.

---

## Batch 2 — Team-vs-team poster family (`08-team-vs-team`)

Asked: 2026-05-01.

### Q2.1 — Team-vs-team poster: line-1 / line-2 / line-3 hierarchy?
**Answer:** League → Home vs Away → Date.
- Line 1: short league code or name (e.g. `EPL`, `NBA`, `NFL`).
- Line 2: matchup (`Arsenal vs Chelsea`, or `ARS vs CHE` initials when no logo or paid asset).
- Line 3: event date (e.g. `15 Mar 2026`).

### Q2.2 — Team-vs-team logos: when should they appear on the poster?
**Answer (CRITICAL — contract change):** LOGOS are PAID-CUSTOMERS-ONLY. Free customers see TEXT + GLYPHS only, never team logos.

Implications:
- **PVTKRRX proxy output (free):** poster shows team initials/short codes + sport glyph. NO team logos. NO badge fetches. Even if SportsMeta public assets include a logo, PVTKRRX must not embed it in the rendered poster output.
- **Paying customers** receive logo-enriched posters via the **SportsMeta member addon** (`https://sportsmeta.pvtkrrx.cc/member/:token/...`), which is a separate Stremio install.
- This is consistent with `docs/SPORTSMETA_BOUNDARY.md` lines 89–97 ("PVTKRRX `/sports-artwork/...png` raster-proxy URLs backed by SportsMeta public/root routes only … not a premium route").
- Phase 3 must verify no PVTKRRX proxy code path fetches or composes real team badges into output bytes.

### Q2.3 — Team-vs-team rows with NO actual pair (highlights/recaps): how should they render?
**Answer:** Downgrade to `tournament_event` poster (current behavior).
- `classifySportsPosterEvent` already does this when no real pair is parsed.
- Render as a tournament/event tile with the league badge, not a fake matchup.
- Never invent teams.

### Q2.4 — Volleyball / Handball / AFL / Beach Volleyball / Ultimate — backdrop bucket?
**Answer:** Move all of them to the `generic-sport` backdrop.
- They are no longer routed to the `rugby` 4K backdrop.
- This is a `sportsCultCategoryMap` change for the `appSportHint` field (or a backdrop-resolver routing change) — Phase 3 implementation must apply it without changing the rugby bucket itself.

---

## Batch 3 — Competitor-vs-competitor poster family (`09-competitor-vs-competitor`)

Asked: 2026-05-01.

### Q3.1 — CvC poster: line-1 / line-2 / line-3 hierarchy?
**Answer:** Tournament/Event → A vs B → Round/Date.
- Line 1: tournament or event short label (e.g. `WIMBLEDON`, `UFC 312`, `PDC WORLD`).
- Line 2: matchup (`Djokovic vs Alcaraz`, or initials when no asset).
- Line 3: round + date (e.g. `Quarterfinal · 12 Jul 2026`).
- Same shape as team-vs-team but with a round/session column.

### Q3.2 — CvC headshots / portraits on PVTKRRX-proxy output?
**Answer:** Never on PVTKRRX proxy. PAID-only via the SportsMeta member addon.
- Mirrors the team-logo rule from Batch 2 Q2.2.
- Free PVTKRRX users see text + sport glyphs only.
- Paying customers receive headshot-enriched posters via the separate SportsMeta member install.
- Phase 3 must verify no PVTKRRX proxy code path fetches/composes athlete portraits into output.

### Q3.3 — CvC rows with only ONE side parsed (e.g. `UFC Fight Night Pereira`)?
**Answer:** Render as an event poster with the lone competitor as the headline.
- Line 1: tournament/event. Line 2: the parsed competitor name. Line 3: round/date.
- No `TBA` / `TBD` placeholder on a missing side.
- Be honest about the missing opponent; do not force a two-side layout.

### Q3.4 — CvC backdrops: bucket coverage?
**Answer:** Add dedicated `snooker`, `table-tennis`, `badminton` backdrops.
- Phase 5 backlog: 3 new approved 4K JPGs must be added to `backdrops/python-backdrops/` and mirrored byte-for-byte into `public/sports-backdrops/` before the parity smoke (`npm run smoke:sport-backdrops`) passes.
- Until those assets exist, the resolver continues to fall back to `generic-sport-4k.jpg` for these sports.
- Existing buckets (tennis, boxing, ufc, darts) keep their current routing.

---

## Batch 4 — Multi-fight cards & wrestling shows (UFC cards, boxing cards, WWE/AEW PPVs)

Asked: 2026-05-01.

### Q4.1 — Multi-fight cards: poster headline?
**Answer:** Card name first.
- Line 1: card brand (`UFC 312`, `BOXING · USYK vs DUBOIS 2`).
- Line 2: headline bout when known.
- Line 3: date.
- One poster per event tile. Card brand wins.

### Q4.2 — Multi-fight cards: prelims / undercard treatment?
**Answer:** Show a `MAIN CARD + PRELIMS` badge under the headline.
- Small badge to indicate the file covers the full card (not just main card).
- Prelim list NOT shown (avoids stale-card rendering).
- Useful when a single tracker row is the whole card.

### Q4.3 — Wrestling shows (WWE, AEW, NXT): which poster family?
**Answer (clarification from user):** Wrestling is wrestling, not motorsport. The original option label was misleading — it referenced family `10-single-event-motorsport` as a *layout shape* (event-only, no paired headline), but WWE/AEW must visually stay in wrestling territory.

Resolution carried into the contract:
- Wrestling shows use the `wrestling_event` poster class.
- They use the `wrestling` 4K backdrop bucket (current).
- Poster shape = event-only (no fake matchup) by default. WrestleMania-style headline matches stay event-first; if a real paired main event is parsed and the user later wants paired treatment for wrestling, that becomes a separate decision.
- **Open follow-up:** Phase 3 should not borrow the `10-single-event-motorsport` poster generator for wrestling output. Either reuse the event-only shape from family `10` as a generator pattern AND brand it for wrestling, or accept a wrestling-specific event poster within family `09` for headline-only render. Re-ask in Batch 5 with cleaner framing if needed.

### Q4.4 — Multi-fight card backdrop bucket?
**Answer:** Keep `ufc` for UFC/MMA cards and `boxing` for boxing cards (current). WWE/AEW shows use the `wrestling` bucket.
- No new `fight-card` bucket.
- Card visual = sport bucket of the headline promotion.

### Q4.X — User-flagged motorsport rule (out of batch)
- **WRC is rally cars and SHOULD use a MOTORSPORT backdrop.**
- Today's `sportBackdrops.js` routes WRC + NASCAR + IndyCar + Supercars + WEC + Formula E + Dakar + Grand Prix + rally to `generic-sport` (via `NEUTRAL_MOTORSPORT_PATTERN`). That is the wrong bucket.
- Phase 3 must add a proper motorsport backdrop bucket (or expand the existing per-series buckets) so non-F1/non-MotoGP series get a motorsport-themed backdrop instead of the neutral generic.
- Phase 5 will need a new approved 4K JPG (or repurpose `formula1`/`motogp` mapping) — see Batch 5 below for the user's preferred resolution.

---

## Batch 5 — Motorsport family (`10-single-event-motorsport`) + wrestling resolution

Asked: 2026-05-01.

### Q5.1 — Motorsport backdrop buckets: where should WRC, NASCAR, IndyCar, Supercars, WEC, Formula E, Dakar, etc. go?
**Answer:** Add a new generic `motorsport-4k.jpg` bucket; route everything not-F1/not-MotoGP there.
- F1 keeps `formula1-4k.jpg`. MotoGP keeps `motogp-4k.jpg`. All other motorsport series share the new `motorsport-4k.jpg` bucket.
- Phase 3 implementation: add `motorsport` to `REQUIRED_SPORT_BACKDROP_BUCKETS` in `src/utils/sportBackdrops.js`, route `NEUTRAL_MOTORSPORT_PATTERN` and `detectedSport === 'motorsport'` to the new bucket instead of `generic-sport`.
- Phase 5 backlog: 1 new approved 4K JPG (`motorsport-4k.jpg`) added to `backdrops/python-backdrops/` and mirrored byte-for-byte to `public/sports-backdrops/`. Smoke `npm run smoke:sport-backdrops` must include the new bucket.

### Q5.2 — Single-event motorsport poster: line hierarchy?
**Answer:** Series → Event/Round → Session · Date.
- Line 1: series brand (`F1`, `MotoGP`, `WRC`, `NASCAR`).
- Line 2: event name (`Japanese Grand Prix`, `Rally Spain`, `Daytona 500`).
- Line 3: session + date (`Qualifying · 28 Mar 2026`).

### Q5.3 — Driver / team / car names on motorsport posters?
**Answer:** Only when the SportsCult title literally contains a driver name.
- Example: `WRC.2026.Catalunya.Day3.Tanak.Highlights` → render `Tanak` as subtitle.
- Otherwise omit. Never enrich driver names from external lookup.
- Honest about parsed signal; never invents drivers.

### Q5.4 — Wrestling poster family resolution (replaces Q4.3)?
**Answer:** New "event-show" poster shape — reuse the layout *pattern* from family `10-single-event-motorsport` but brand it as wrestling.
- WWE/AEW/NXT PPVs render as event posters with the `wrestling-4k.jpg` backdrop.
- Show name + brand mark + date. No fake paired headline.
- Visually wrestling. Structurally event-only (like motorsport).
- Phase 3: do not literally call this `single-event-motorsport`; expose a layout pattern (e.g. "event-only solo poster") that both motorsport and wrestling can emit. Wrestling's poster output must read as wrestling, not as motorsport.

---

## Batch 6 — Golf, cycling, snooker & tournament/individual sports

Asked: 2026-05-01.

### Q6.1 — Golf posters: line hierarchy?
**Answer:** Tour/Event → Round → Date.
- Line 1: `PGA TOUR` / `MASTERS` / `RYDER CUP`.
- Line 2: `Round 3` / `Final Round`.
- Line 3: date.
- Player names appear only when the SportsCult title literally contains them (same rule as motorsport).

### Q6.2 — Cycling, athletics, gymnastics, aquatics, olympics, winter — backdrop strategy?
**Answer:** Keep on `generic-sport-4k.jpg` for now.
- These sports fall through to generic.
- Avoids Phase 5 asset workload.
- Revisit if user demand grows; not a blocker.

### Q6.3 — Snooker routing in Phase 3 (Phase 5 will add `snooker-4k.jpg`)?
**Answer:** Snooker stays on `generic-sport` until the new `snooker-4k.jpg` ships in Phase 5.
- Phase 3 ships nothing for snooker visually.
- Phase 5 adds the asset and flips the route.
- Avoids a half-shipped state.

### Q6.4 — Generic_event poster wording when sport is totally unknown / Uncategorised?
**Answer:** Line 1: `SPORTS` · Line 2: cleaned tracker title · Line 3: date if parsed.
- Honest neutral fallback.
- Uses `generic-sport-4k.jpg` backdrop and `ticket-stub` template by default.
- No invented league/sport.

---

## Batch 7 — Template/family wiring + cleanup

Asked: 2026-05-01.

### Q7.1 — Template auto-upgrade (`ticket-stub` → `broadcast` for non-`team_vs_team` classes)?
**Status:** User asked for plain-English re-ask; this is an implementation detail with no user-visible naming impact.
**Default carried into contract:** Remove the auto-upgrade. Template (visual style) and class (layout shape) are decoupled. Phase 3 implementation note flagged in the contract for explicit review.

### Q7.2 — Class → poster-family mapping?
**Status:** User asked for plain-English re-ask; this is an implementation routing decision, not a content/wording decision.
**Default carried into contract:** Use the comprehensive mapping that codifies Batches 2–6 (see `template-contract.md` §6).

### Q7.3 — Stale audit-script defaults (dead `pvt.kepners.co.uk` URL)?
**Answer:** Leave them. The user is the only person who runs those audits, and they will set `PVTKRRX_SPORTS_POSTER_AUDIT_MANIFEST` (and the equivalents) explicitly.
- No code change to the script defaults in Phase 3.
- Phase 4 proof must override via env var when running these scripts.

### Q7.4 — Lock and proceed?
**Answer:** Yes — write the contract, then stop and let me read it before any code changes.
- Proceed to Phase 2: write `.claude/trackers/sports-artwork-template-contract.md`.
- Pause before Phase 3 implementation.

---

## Phase 1 status: COMPLETE

7 batches asked. All substantive content/wording decisions are recorded above. Phase 2 (template contract) starts immediately.







