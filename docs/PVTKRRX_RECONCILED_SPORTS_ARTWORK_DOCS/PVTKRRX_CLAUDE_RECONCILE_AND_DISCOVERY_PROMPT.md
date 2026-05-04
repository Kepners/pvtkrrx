# Claude Code Prompt — Reconcile SportsMeta Truth, Then Ask User Sport Artwork Questions

You are working in the PVTKRRX repo.

## A. Verdict

Do not implement yet.

Your first job is to reconcile the sports artwork plan against current project truth, because the previous plan may be stale and may wrongly imply that PVTKRRX still owns sports artwork generation/cache.

## B. Product/System Boundary

You must keep these systems separate:

1. **PVTKRRX addon/runtime**
   - owns Stremio addon routes, catalog/meta/stream payloads, install routes, runtime config, playback wiring.
   - may consume sports artwork URLs.
   - must not reintroduce a removed sports image cache unless explicitly approved.

2. **SportsMeta**
   - asserted current sports artwork/metadata source.
   - expected artwork host: `https://sportsmeta.pvtkrrx.cc`.
   - may own poster/backdrop generation and cache.

3. **Deployment/runtime surfaces**
   - asserted current topology includes:
     - Coolify/container runtime at `www.pvtkrrx.cc`
     - separate systemd `pvtkrrx.service` runtime for self-host/Contabo
   - these may intentionally coexist.
   - do not collapse them into “one installation” unless the repo/live proof says that is correct.
   - verify whether `pvt.kepners.co.uk` still exists before using it.

4. **Free vs paid artwork**
   - asserted current truth: composed poster pipeline is paywalled.
   - free users may receive SVG glyph/fallback artwork.
   - verify this before changing anything.

## C. Mandatory Phase -1: Reconcile First

Before asking the user sport-template questions, review the repo and write:

```text
.claude/trackers/sports-artwork-reconciliation.md
```

Review at minimum:

```text
CLAUDE.md
README.md
ARCHITECTURE.md
docs/CURRENT_DESIGN.md
docs/ROUTE_FRAMEWORK.md
docs/STREMIO_INSTALL_TRACKER.md
docs/PROJECT_STATUS.md
```

Then search for and review any files matching these concepts:

```text
SportsMeta
sportsmeta
sports artwork
sports image cache
image cache
poster paywall
project_poster_paywall_scope.md
sportsArtwork
sportsPoster
sportsBackdrop
artworkProxy
free tier
paid tier
composed poster
SVG glyph
```

Your reconciliation file must include:

1. Exact files reviewed.
2. Exact lines/snippets proving whether SportsMeta owns sports artwork now.
3. Exact proof whether PVTKRRX sports image cache was removed.
4. Exact proof of free vs paid artwork behaviour.
5. Exact proof of deployment/runtime topology.
6. Exact status of `pvt.kepners.co.uk`: live, stale, unknown, or not referenced.
7. Any contradictions.
8. Verdict:
   - `PASS`
   - `PASS WITH CAVEATS`
   - `FAIL`

Do not continue if this phase is `FAIL`.

## D. Mandatory Phase 0: Discovery

After reconciliation, discover all sports/families and current artwork handling.

Write:

```text
.claude/trackers/sports-artwork-discovery.md
```

Include:

- all sport/family names found
- all SportsCult/Prowlarr mappings found
- all league codes found
- all title/event parsing patterns found
- current poster behaviour
- current backdrop behaviour
- current SVG/glyph fallback behaviour
- current SportsMeta URL usage
- current paid/free gating behaviour
- ambiguous or missing cases

Do not treat example sports from previous prompts as the complete list.

## E. Mandatory Phase 1: Ask The User Questions

After Phase -1 and Phase 0, ask the user template questions.

Important:
- Use the project-required popup question mechanism if available.
- Do not ask approval for routine tasks.
- These questions are not routine. They define the artwork contract.
- Ask in structured batches, not one giant vague question.
- Record each answer.

Write answers to:

```text
.claude/trackers/sports-artwork-question-log.md
```

### Question Batch 1 — Global artwork rules

Ask the user to decide:

1. Should SportsMeta be the only source for generated sports posters/backdrops?
2. Should PVTKRRX only consume SportsMeta URLs and SVG/glyph fallbacks?
3. Should free users get SVG/glyph fallback only when composed poster pipeline is paywalled?
4. Should paid users get composed SportsMeta posters where available?
5. Should generic backdrops be sport/family-level only?
6. Should event-specific backdrops ever be allowed?
7. Should unknown sports be shown with neutral fallback, SVG-only, or blocked?

### Question Batch 2 — Team vs team sports

For each discovered team-vs-team sport/family, ask:

- poster title line
- second line
- third line
- whether league/date/session appears
- whether team logos are expected
- free-tier output
- paid-tier output
- generic backdrop label
- fallback when logos/artwork are missing

Must include discovered cases such as football/soccer, gridiron/American football, basketball, baseball, hockey, rugby, cricket if present.

### Question Batch 3 — Person vs person sports

For each discovered person-vs-person sport/family, ask:

- whether names are primary
- whether tournament/event/card is primary
- round/session line
- headshot requirement or not
- free-tier output
- paid-tier output
- backdrop label
- fallback handling

Must include tennis, boxing, MMA/UFC, darts, snooker if present.

### Question Batch 4 — Multi-fight/card sports

For UFC/boxing/wrestling cards or similar, ask:

- event/card first or headline bout first
- how prelims/main card are shown
- whether every fight gets its own poster or only the event tile does
- free-tier output
- paid-tier output
- backdrop label

### Question Batch 5 — Motorsport

For each discovered motorsport family, ask:

- whether F1/WRC/Indy/NASCAR/MotoGP/Formula E all share `MOTORSPORT` backdrop
- poster hierarchy:
  - series
  - event
  - session
  - date
  - quality/source
- whether driver/team names are used only if SportsCult title gives them
- free-tier output
- paid-tier output

### Question Batch 6 — Golf and tournament sports

Ask:

- event-first or round-first
- how day/round/session appears
- whether player names are used only when title gives them
- backdrop label
- free-tier output
- paid-tier output

## F. Mandatory Phase 2: Template Contract

After user answers, write:

```text
.claude/trackers/sports-artwork-template-contract.md
```

It must be the implementation source of truth.

Use this table:

| Sport/family | Examples found | Event type | Poster template | Backdrop template | Artwork owner | Free tier | Paid tier | Fallback | User approved? |
|---|---|---|---|---|---|---|---|---|---|

Rules:

- If SportsMeta owns generated artwork, write `SportsMeta`.
- If PVTKRRX only consumes URLs, write `PVTKRRX consumer only`.
- If free users get SVG glyphs, write that.
- If composed posters are paid-only, write that.
- Do not leave vague wording like “maybe”, “should”, or “probably”.

## G. Implementation Gate

Do not implement until:

1. Reconciliation is done.
2. Discovery is done.
3. User questions are answered.
4. Template contract is written.
5. User-approved decisions are recorded.

## H. Implementation Rules

When implementation starts:

- Do not reintroduce removed PVTKRRX sports image cache.
- Do not move SportsMeta responsibilities into PVTKRRX.
- Do not claim one runtime if there are intentionally two.
- Do not call self-host/systemd proof public-site proof.
- Do not make composed-poster promises for free users if paywall scope says otherwise.
- Do not use `pvt.kepners.co.uk` unless verified live/current.

Track work in:

```text
.claude/trackers/sports-artwork-implementation-tracker.md
```

Every change entry must include:

- exact file changed
- why changed
- whether it is SportsMeta, PVTKRRX consumer, shared docs, or deployment
- command run
- PASS/FAIL result

## I. Proof Log

Write:

```text
.claude/trackers/sports-artwork-proof-log.md
```

Must include:

- exact commands run
- exact routes tested
- exact URLs tested
- sample catalog JSON
- sample meta JSON
- sample poster URL
- sample backdrop URL
- free-tier proof
- paid-tier proof if available
- local runtime proof
- public `www.pvtkrrx.cc` proof
- systemd/self-host proof if updated
- PASS/FAIL for each

## J. Codex Audit Prompt

Only after implementation and proof, write:

```text
.claude/briefs/codex-sports-artwork-review.md
```

Codex must check:

- SportsMeta/PVTKRRX boundary
- no removed cache reintroduced
- free vs paid artwork behaviour
- user-approved template contract followed
- all sports/families discovered were handled or explicitly marked out of scope
- live proof is not confused with local/self-host proof
- installers were built only after tests passed
- exact changed files and commands are reproducible

## K. Required Final Response Format

Use:

A. Verdict  
B. Plain-English explanation/flow  
C. Exact proof  
D. Weak points  
E. Exact fixes made  
F. Safe public wording  

Verdict must be one of:

- READY
- READY WITH CAVEATS
- NOT READY

Never say complete unless all acceptance criteria are met.

Start now with Phase -1 reconciliation only.
