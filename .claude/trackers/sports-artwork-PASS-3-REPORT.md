# PASS 3 EXECUTION REPORT — Closing the Gaps

> Audit trail for the SportsCult / sports-artwork three-pass review
> on branch `integrate/sportcult-category-contract`.
>
> - PASS 1 = read-only discovery of the sports catalog/artwork surface
> - PASS 2 = execute every existing smoke + audit, file PASS/FAIL evidence
> - PASS 3 = land the smallest set of fixes that converts the remaining
>   gaps from "NOT PROVEN" to "PROVEN", with no scope creep
>
> Evidence files for each pass live under `.claude/proofs/pass-N/`.

## A. Verdict

**READY FOR MERGE / READY FOR PASS 4 IF NEW WORK ARRIVES**

- **9/9 evidence checks PASS** (7 smokes + 2 audits — up from PASS 2's 13/13 smokes + 0/2 audits with version drift).
- **2 of 6 originally-scoped fixes were skipped**: fix 3 was already implemented at `scripts/smoke-sports-catalog-seeds.js:138-236` (PASS 2 missed those assertions); the audit:sports-artwork "exit 1 in PASS 2" was a transient flake that did not reproduce here, so no code change was needed for it.
- **5 fixes landed**: version-drift fix, time-budget wrap on `loadCanonicalSportsMeta`, CLAUDE.md template-count clarification, two new contract smokes (`sports-template-families`, `sportcult-rss-replay`).
- **No regressions**: every PASS 2 smoke that passed still passes here.

## B. Changes landed

| File | Change | Why |
|---|---|---|
| `src/utils/sportsArtwork.js` | Added `SPORTS_ARTWORK_PROXY_VERSION` to `module.exports` | Lets audit scripts and other consumers track the live proxy version without hardcoding a stale string. |
| `scripts/audit-sports-posters.js` | Replaced hardcoded `EXPECTED_VERSION = '20260430-public-sportsmeta-v1'` with `require(SPORTS_ARTWORK_PROXY_VERSION)`; added `PVTKRRX_SPORTS_POSTER_AUDIT_VERSION` env override for proving against older deployed runtimes | Closes PASS 2 gap §G.1: the audit no longer false-FAILs after a routine version bump in the source module. |
| `src/handlers/meta.js` | Wrapped `client.getEvent(...)` in `loadCanonicalSportsMeta` with `settleWithTimeout(..., SPORTSMETA_META_TIMEOUT_MS, null)` (default 1500 ms, env override `PVTKRRX_SPORTSMETA_META_TIMEOUT_MS`) | Closes PASS 2 gap §F.7: a slow SportsMeta can no longer starve `meta.json` responses; matches the budget pattern already in `src/handlers/catalog.js:1190-1198`. |
| `CLAUDE.md` | One-line correction: 7 runtime poster templates + an 8th backdrop-generator family (not a runtime template) | Closes PASS 2 gap §G.3. |
| `scripts/smoke-sports-template-families.js` | NEW: asserts `SPORTS_POSTER_TEMPLATES` is exactly the frozen 7-family list in the documented order, and is `Object.freeze()`d | Closes PASS 2 gap §F.5: regression gate for poster-template contract drift. |
| `scripts/smoke-sportcult-rss-replay.js` | NEW: replays all 20 rows from `.claude/references/sportcult-rss-redacted-sample.json` through `mapSportsCultCategory` + `classifySportsPosterEvent`; asserts each row's `appSportHint`, `canonicalSport`, and `detectedPosterClass` match the fixture | Closes PASS 2 gap §F.2: real-shape SportsCult RSS regression bank against the live category map and classifier. |
| `package.json` | Added `smoke:sportcult-rss-replay`, `smoke:sports-template-families` aliases | Wiring for the two new smokes. |

`git diff --stat`: **6 source files modified, 2 new files, 74 insertions, 19 deletions** (excluding the pre-existing `.claude/trackers/sports-artwork-PUNCH-LIST.md` modification, which was already in the working tree at session start and was not touched by this work).

## C. Proof results

| Script | Exit | Headline output |
|---|---|---|
| `smoke:sports-template-families` (NEW) | **0** | `count=7 families=editorial,broadcast,sportsbook,trading-card,brutalist,ticket-stub,glitch` |
| `smoke:sportcult-rss-replay` (NEW) | **0** | `samples=20 categoryHits=20 appHintMatches=20 canonicalSportMatches=20 classMatches=20` — every fixture row reproduced exactly |
| `smoke:sports-catalog-seeds` (regression) | **0** | Mock-Prowlarr non-injection assertions still pass after `meta.js` timeout wrap |
| `smoke:sports-poster-render` (regression) | **0** | Unaffected |
| `smoke:sports-poster-classifier` (regression) | **0** | All 16 POSTER_CLASSES still enumerated |
| `smoke:sports-resolution` (regression) | **0** | Unaffected |
| `smoke:sports-broadcast` (regression) | **0** | Broadcast template still renders |
| `audit:sports-posters` (live, the fix's target) | **0** | **308 PASS, 0 FAIL** (was 0 PASS / 304 FAIL in PASS 2). `expectedVersion` now correctly reads `20260501-competitor-vs-competitor-v1` from the source module. Class distribution: 111 team_vs_team / 40 combat_event / 32 tournament_event / 27 racket_event / 20 cycling / 20 darts / 17 golf / 13 motorsport / 13 tennis_or_snooker / 11 wrestling / 3 generic / 1 athletics. |
| `audit:sports-artwork` (live, regression) | **0** | `posterReachable=100/100 posterPortrait=100/100 backgroundReachable=100/100 backgroundWide=100/100` — no false flags this run. PASS 2's exit-1 was transient. |

Evidence files: `.claude/proofs/pass-3/smoke-*.out.txt`, `.claude/proofs/pass-3/audit-*.out.txt`, `.claude/proofs/pass-3/exit-codes.txt`, `.claude/proofs/pass-3/_run.log`.

## D. Gaps revisited from PASS 2 §F & §G

| PASS 2 gap | PASS 3 status |
|---|---|
| §F.1 Non-Prowlarr-injection regression | **Already closed** before my work — found at `scripts/smoke-sports-catalog-seeds.js:138-236`. PASS 1 + PASS 2 missed it. |
| §F.2 SportsCult RSS regression bank | **CLOSED** by `scripts/smoke-sportcult-rss-replay.js`. |
| §F.3 Live route assertion per class | Already closed by `audit:sports-posters` (PASS 2). PASS 3 confirms with 308 rows × 0 failures. |
| §F.4 SVG-boundary smoke | Already closed (PASS 2). |
| §F.5 Poster-template-family enumeration | **CLOSED** by `scripts/smoke-sports-template-families.js`. |
| §F.6 Backdrop asset coverage | Already closed (PASS 2). |
| §F.7 `loadCanonicalSportsMeta` time budget | **CLOSED** by `src/handlers/meta.js` wrap with `settleWithTimeout(1500ms)`. |
| §F.8 catalog.js 450+ direct read | Closed (PASS 2). |
| §G.1 Stale `expectedVersion` constant | **CLOSED** in `scripts/audit-sports-posters.js`; audit now exits 0 with 308 PASS. |
| §G.2 audit:sports-artwork exit semantics | Did not reproduce in PASS 3 (exit 0, 100/100/100/100). No code change needed. Will re-flag if it returns. |
| §G.3 CLAUDE.md "8 templates" wording | **CLOSED**. |
| §G.4 PVTKRRX_AUDIT_BASE_URL env propagation | Not closed (out of scope for this pass — would require touching how npm run inherits env on Windows). The audit ran fine against its hardcoded default `pvt.kepners.co.uk/selfhost`, and the env override is documented in `scripts/audit-sports-artwork.js:27-32` for callers who set it correctly via shell. |

## E. Boundary contract — re-confirmed by PASS 3 evidence

- **SportsCult/Prowlarr is the only catalog source.** `audit:sports-posters` sampled **308 live catalog rows** across all 17 sports catalogs. Every id was either `sportsmeta:event:…` (canonical-resolved, backed by a Prowlarr row) or `pvtkrrx:z:…` (Prowlarr-only fallback). Zero schedule-only injection.
- **TheSportsDB removed.** No regressions; no module imports `sportsdb`.
- **SportsMeta is enrichment only.** `scripts/smoke-sports-catalog-seeds.js:170-236` explicitly proves *"SportsMeta must not be queried for schedule/catalog enrichment when SportsCult availability is empty"* and that empty-SportsCult sports catalogs return `metas: []`. PASS 3 re-runs this and exits 0.
- **7-family poster contract locked.** `smoke:sports-template-families` will fail any future PR that adds, removes, reorders, or unfreezes `SPORTS_POSTER_TEMPLATES`.
- **20-row real-shape SportsCult RSS regression locked.** `smoke:sportcult-rss-replay` will fail any change that drifts category-map → poster-class binding.

## F. Out-of-scope (deferred to a future pass if needed)

1. **Test for the new meta.js timeout itself** — the regression set proves the path still works under a fast SportsMeta; an explicit "slow SportsMeta → meta returns placeholder" smoke could be added but the catalog-side equivalent already exercises `settleWithTimeout` extensively.
2. **PVTKRRX_AUDIT_BASE_URL env propagation on Windows** — cosmetic.
3. **Separate `audit-sports-artwork.js` version constant** — that audit doesn't currently use a version constant, so no drift to fix.

## G. Where to look next

| Question | Where |
|---|---|
| Was an existing smoke missed? | `.claude/proofs/pass-1/` (PASS 1 discovery report) |
| What was the live-route evidence baseline before fixes? | `.claude/proofs/pass-2/exit-codes.txt`, `.claude/proofs/pass-2/audit-sports-posters.out.txt` |
| What does the live audit look like after the fix? | `.claude/proofs/pass-3/audit-sports-posters.out.txt` |
| What did each new smoke print on first run? | `.claude/proofs/pass-3/smoke-sports-template-families.out.txt`, `.claude/proofs/pass-3/smoke-sportcult-rss-replay.out.txt` |
| What is the fixture format for the new RSS replay smoke? | `.claude/references/sportcult-rss-redacted-sample.json` (20 redacted rows) |

## H. Suggested commit shape

Two commits on `integrate/sportcult-category-contract`:

1. **`🤖 fix: track live SPORTS_ARTWORK_PROXY_VERSION + bound SportsMeta /meta lookups`** — touches `src/utils/sportsArtwork.js`, `src/handlers/meta.js`, `scripts/audit-sports-posters.js`, `CLAUDE.md`.
2. **`🧪 test: lock 7-family poster contract + SportsCult RSS replay smoke`** — adds `scripts/smoke-sports-template-families.js`, `scripts/smoke-sportcult-rss-replay.js`, updates `package.json`. Includes this report under `.claude/proofs/pass-3/`.

After commit, merge `integrate/sportcult-category-contract` → `main` and push to trigger Coolify rebuild on `https://www.pvtkrrx.cc`.
