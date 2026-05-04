# PVTKRRX Sports Artwork — Reconciled Implementation Plan

Status: RECONCILED DRAFT  
Purpose: Replace the earlier stale poster/backdrop implementation plan.

## 0. Product/System Boundary

This plan separates three systems that must not be blurred.

### A. PVTKRRX addon/runtime

PVTKRRX is the Stremio addon/runtime family. It owns:

- catalog responses
- meta responses
- stream responses
- route handling
- install routes
- qBittorrent / Prowlarr integration
- Stremio payload shape
- consuming artwork URLs supplied by the correct source

PVTKRRX must not silently become the source of sports artwork if the current architecture says SportsMeta owns that job.

### B. SportsMeta

SportsMeta is the sports artwork/metadata system.

Current asserted project truth to verify before coding:

- Sports image cache was removed from PVTKRRX on or around 2026-04-22.
- SportsMeta is now the sports artwork source.
- Canonical sports artwork host is expected to be:

```text
https://sportsmeta.pvtkrrx.cc
```

SportsMeta should own:

- sports poster generation/storage/lookup
- sports backdrop generation/storage/lookup
- sports artwork cache
- sport/family artwork mapping, if current architecture confirms this

### C. Deployment/runtime surfaces

Current asserted project truth to verify before updating anything:

- `www.pvtkrrx.cc` is served by a Coolify/container runtime.
- There is also a separate `systemd` runtime, `pvtkrrx.service`, used for self-host/Contabo.
- These are intentionally separate runtimes.
- Updating the systemd service alone does not prove the public user-facing site changed.
- Any reference to `pvt.kepners.co.uk` must be verified before being treated as live.

## 1. Hard Corrections To Earlier Plan

The earlier plan must be treated as stale in these areas.

| Area | Earlier assumption | Reconciled rule |
|---|---|---|
| Sports artwork ownership | PVTKRRX generates posters/backdrops directly | Verify whether SportsMeta owns generation/cache; if yes, PVTKRRX only consumes/links artwork |
| Sports cache | PVTKRRX has image cache work | PVTKRRX sports image cache is asserted removed; do not reintroduce it without explicit approval |
| Contabo install | Only one installation should exist | Verify current topology; if two runtimes are intentional, document both and do not collapse them |
| Live proof | Updating one runtime proves everything | False. Each runtime must be tested separately |
| Paywall | All users receive composed poster pipeline | False if current paywall scope says composed posters are paid; free users get SVG glyphs |
| `pvt.kepners.co.uk` | Treated as current surface | Must verify before using |

## 2. Work Phases

### Phase -1 — Reconciliation Gate

Do this before asking sport-template questions and before code changes.

Claude Code must review:

- `CLAUDE.md`
- `README.md`
- `ARCHITECTURE.md`
- `docs/CURRENT_DESIGN.md`
- `docs/ROUTE_FRAMEWORK.md`
- `docs/STREMIO_INSTALL_TRACKER.md`
- `docs/PROJECT_STATUS.md`
- any SportsMeta docs
- any paywall/scope docs, including files similar to:
  - `project_poster_paywall_scope.md`
  - `SportsMeta`
  - `sportsArtwork`
  - `sportsPoster`
  - `sportsBackdrop`
  - `artworkProxy`

Claude must produce:

```text
.claude/trackers/sports-artwork-reconciliation.md
```

That file must include:

1. Exact files reviewed.
2. Exact lines or snippets proving SportsMeta ownership, or a clear statement that proof was not found.
3. Exact files proving whether PVTKRRX sports image cache was removed.
4. Exact files proving free vs paid artwork behaviour.
5. Exact deployment/runtime surfaces found.
6. Whether `pvt.kepners.co.uk` is still live, stale, or unknown.
7. A PASS/FAIL verdict for proceeding.

Proceed only if this phase is `PASS` or `READY WITH CAVEATS`.

### Phase 0 — Sports/Artwork Discovery

Goal: discover the real sports families and current handling.

Do not use examples as the full task list.

Discover from:

- SportsCult/Prowlarr category mappings
- current sports classifier files
- current event normalizer/parser files
- manifest genre/sport lists
- SportsMeta supported sports/families
- current poster/backdrop templates
- current fallback SVG/glyph behaviour
- current paid/free gating logic

Record output in:

```text
.claude/trackers/sports-artwork-discovery.md
```

Required sections:

- Sports found
- League/family codes found
- Event title patterns found
- Existing poster handling
- Existing backdrop handling
- Existing fallback handling
- Existing paid/free handling
- Missing/ambiguous sports

### Phase 1 — Ask User Questions Before Implementation

Claude must ask questions using the required popup/question tool, not plain text.

Do not ask vague questions. Ask structured questions in batches.

Each question must record:

- sport/family
- current discovered behaviour
- proposed poster treatment
- proposed backdrop treatment
- free-tier behaviour
- paid-tier behaviour
- fallback behaviour
- user decision

Record all answers in:

```text
.claude/trackers/sports-artwork-question-log.md
```

### Phase 2 — Template Contract

After user answers, write:

```text
.claude/trackers/sports-artwork-template-contract.md
```

This becomes the implementation source of truth.

Required table columns:

| Sport/family | Examples | Poster template | Backdrop template | Source artwork owner | Free tier | Paid tier | Fallback | Status |
|---|---|---|---|---|---|---|---|---|

Rules:

- If SportsMeta owns artwork, say `SportsMeta`.
- If PVTKRRX only consumes the URL, say `PVTKRRX consumer only`.
- If composed posters are paid-only, record that explicitly.
- If free users receive SVG glyphs, record that explicitly.
- Generic backdrops must be sport/family-level unless the user explicitly asks for event-specific backdrops.

### Phase 3 — Implementation

Only start after Phase 2 is complete.

Implementation must preserve the boundary:

- SportsMeta owns generation/cache if verified.
- PVTKRRX should not reintroduce removed sports image cache.
- PVTKRRX should only change payload wiring, fallback selection, route usage, or consumer-side handling unless SportsMeta code is in scope.
- Paid/free behaviour must be enforced according to the verified scope doc and user-approved template contract.

Track implementation in:

```text
.claude/trackers/sports-artwork-implementation-tracker.md
```

Each entry must include:

- exact file changed
- reason
- boundary classification:
  - SportsMeta source
  - PVTKRRX consumer
  - shared docs
  - deployment
- test command
- PASS/FAIL result

### Phase 4 — Proof

Create:

```text
.claude/trackers/sports-artwork-proof-log.md
```

Must include:

- commands run
- routes tested
- exact URLs tested
- free-tier examples tested
- paid-tier examples tested, if available
- SportsMeta artwork URLs tested
- Stremio catalog/meta JSON samples
- runtime surface tested:
  - local
  - Coolify/www
  - systemd/self-host
- PASS/FAIL result per route

Do not call live ready unless the live user-facing runtime is tested.

### Phase 5 — Installer / Deployment

Only after code and proof pass.

Build/check:

- Windows EXE installer
- seedbox/self-host installer
- version bump if required
- artifact location
- install commands
- update commands
- exact runtime updated

Deployment proof must distinguish:

| Runtime | Updated? | Command | Commit/SHA | URL tested | PASS/FAIL |
|---|---|---|---|---|---|

### Phase 6 — Codex Review Prompt

Only after proof exists, Claude must write:

```text
.claude/briefs/codex-sports-artwork-review.md
```

Codex must be asked to check:

- SportsMeta/PVTKRRX boundary was preserved.
- No removed PVTKRRX image cache was reintroduced.
- Free vs paid artwork behaviour is correct.
- Posters and backdrops match the user-approved template contract.
- Public live runtime proof is not confused with local or self-host proof.
- All changed files are listed.
- All tests are reproducible.

## 3. Required User Question Batches

Claude must ask these after Phase -1 and Phase 0.

### Batch A — Global rules

1. Should generic sport backdrops remain sport/family-level only?
2. Should event-specific backdrops ever be allowed?
3. Should all free users get SVG/glyph fallback only if composed posters are paywalled?
4. Should paid users get composed posters from SportsMeta only?
5. Should PVTKRRX ever generate artwork locally, or should it always call SportsMeta?

### Batch B — Team vs team sports

For football/soccer, American football/gridiron, basketball, baseball, hockey, rugby, cricket and similar:

- poster hierarchy
- title line
- league/date line
- team line
- quality/source handling
- backdrop label
- fallback if team logos unavailable

### Batch C — Person vs person sports

For tennis, boxing, MMA/UFC, snooker, darts and similar:

- poster hierarchy
- person names
- tournament/event/card line
- round/session line
- backdrop label
- fallback if headshots unavailable

### Batch D — Multi-fight/card sports

For UFC/boxing/wrestling cards:

- whether poster should show card/event first or headline bout first
- how prelims/main card should be represented
- whether non-headline fights need separate posters
- backdrop label

### Batch E — Motorsport

For F1/WRC/IndyCar/NASCAR/MotoGP/Formula E and similar:

- whether all share `MOTORSPORT` backdrop
- whether poster should show series + event + session
- how race/quali/practice/highlights are represented
- whether driver names are used only when SportsCult title gives them

### Batch F — Golf

- event-first or round-first poster
- how round/day/session is represented
- whether player names are used only for specific person-vs-person cases
- backdrop label

### Batch G — Unknown/fallback

- generic fallback poster wording
- generic fallback backdrop wording
- whether unknown sport should be blocked, SVG-only, or shown with neutral SportsMeta fallback

## 4. Stop Conditions

Claude must stop and ask/report if:

- SportsMeta ownership cannot be verified.
- The paywall/free-tier scope cannot be found.
- The current deployment topology cannot be verified.
- The existing MD spec conflicts with live code.
- Any implementation would reintroduce removed PVTKRRX sports image cache.
- Any public wording would claim all users get composed posters when that is paywalled.

## 5. Final Verdict Labels

Use only:

- `READY`
- `READY WITH CAVEATS`
- `NOT READY`

Never use `complete` unless all acceptance criteria pass.

