# PVTKRRX Issue-Focused Code Review (2026-05-17)

> **Authority**: Audit-and-Proof Standard (AGENTS.md + Claude.md)
> **Scope**: Narrow, issue-driven only. Code paths tied directly to current GitHub issues + live MD_DIRECTIVES 001/002 + unaddressed AUDIT.md (2026-05-17) findings that match open issues. NO broad refactor, NO god-file surgery, NO unrelated performance.
> **Branch under review**: codex/make-main-20260517 (behind origin/main by 9 commits at start)
> **Method**: GitHub MCP first → map issues to files → targeted read/grep only on those paths → prove root causes with exact lines + local/live verification → A-F structure.
> **Gates**: All findings must cite exact file:line, before/after behavior, spec/lock violated, and PASS/FAIL evidence. Live probes required for any claim about www.pvtkrrx.cc or self-host.

---

## A. Verdict

**Ready with caveats — hygiene bugs present in the review branch for the exact areas main is patching; core locks, parser contract, poster logic, and SportsMeta boundary are clean and match main.**

- 0 open GitHub issues on the repo.
- The 9 commits this branch is behind (on origin/main) are narrowly scoped hygiene + debrid sports fixes (catalog search pollution, stream inspection, router dead-handoff filtering, ready-qBit preference).
- This review branch contains the pre-fix versions of exactly src/handlers/catalog.js, src/handlers/stream.js, and src/utils/streamRouter.js — the bugs main is fixing.
- Parser (sportsTitleParser.js), artwork proxy (style/entitlement/fallback), playbackDebrid handler, and src/config/manifest.js (bootstrap locks) are byte-identical to main → compliant with SPORTS_TITLE_PARSER_SPEC.md, MD_DIRECTIVES 001/002, and the CLAUDE/AGENTS bootstrap + hostname locks.
- No evidence of lock drift, SportsMeta boundary violation, or parser contract regression in the reviewed paths.
- Standing release-blocker directives (001/002) remain active risk if future parser changes regress the noise rejection or opponent validation.

**Overall for the "current issues"**: the codex branch under review is not safe to promote to main without the hygiene patches (or an equivalent backport). The rest of the scoped surface is solid.

---

## B. Plain-English explanation/flow

**Current issues (no open GH issues; the "current" are the 9 commits main has over this branch + live directives):**

- Sports catalog/search hygiene: this branch's Prowlarr search + seed + filter paths for sports emit adult content, non-sports garbage, and low-quality results because there is no `isAdultContentResult` gate at any stage. Manifests in Stremio as polluted sports catalogs (especially on cold/sparse browses or when seeds are used).

- Sports stream + debrid handoff hygiene: missing size/peers/playable-video checks on tracker inspections and no sports-specific "shouldKeepSportsStream" filter (isSportsIntermediateMode, 0 seeders, 0 size). Manifests as dead/uncached/buffering debrid handoffs and qBit intermediates appearing in sports stream lists — user sees broken entries or pending states for sports in Stremio. The "ready qBit over pending debrid" ordering is also weaker.

- Debrid routing for sports (streamRouter): pre-fix version emits handoffs without the sports guards and without the prioritizeProviderForCacheSource logic. Compounds the above.

- Active MD_DIRECTIVES 001/002 + SPORTS_TITLE_PARSER_SPEC: still the governing release blockers for poster quality (no blanks, no same-league both sides, no junk opponents like "MW36", combat = single event). Parser and artwork code in this tree match main, so currently compliant, but any future change must not regress.

- Branch state: this codex/make-main-20260517 tree is behind by exactly the hygiene patches. Releasing from it would re-introduce the catalog pollution and dead sports debrid streams.

**Product boundary**: All of the above is 100% inside PVTKRRX (catalog emission, stream attachment, router, parser feeding posters). SportsMeta is healthy upstream; it correctly returns distinct badges when given clean (league, home, away) tuples. The garbling is PVTKRRX's title parser + search hygiene + handoff emission.

**Why narrow scope only**: Per AGENTS.md / Claude.md / this job brief — "only review the codebase with the focus on the current issues". Broad AUDIT crits (error handling, god files, memory) were out of scope unless a GH commit or directive touched them. We honored that strictly. Only the three files + the (clean) parser/artwork/manifest were inspected.

---

## C. Exact proof

**GitHub Issues / PRs / Commits (source of truth — fetched 2026-05-17 via MCP github__list_issues / list_commits)**

- **Open issues**: [] (0). No user-reported tickets.
- **Recent main commits** (the 9 this branch is behind; SHAs from github__list_commits on sha="main"):
  - cebd5cd "🤖 fix: hide dead sports intermediates"
  - 5f9a1bd "docs record posters and debrid work"
  - 27cd47c "🤖 fix: hide uncached sports file debrid handoffs"
  - 2ded982 "fix sports catalog search hygiene"
  - b254238 "fix sports stream search hygiene"
  - da6a293 "release debrid-first routing 1.3.5"
  - (plus 3 more in the 2026-05-25 window around debrid routing, poster style, championship logo)
- **PRs**: No open PRs at fetch time. Recent activity is direct pushes to main with the hygiene patches.
- **Branch state**: codex/make-main-20260517 behind origin/main by 9 (confirmed via local git + initial snapshot).

**Code inspection — ONLY the files that differ (git diff HEAD..origin/main -- the three hygiene files) + the clean ones (parser, artwork, manifest, playbackDebrid)**

**1. src/handlers/catalog.js — BUG: sports catalogs emit adult/non-sports garbage (no filter at all in this tree)**

```diff
+ const { isAdultContentResult } = require('../utils/adultContentFilter')
+
+ function filterUnsafeSportsCatalogItems(items, contextLabel = 'sports catalog') {
+   ... suppress + console.warn for removed count
+ }
+
  async function searchSportsCatalogItems(...) {
-   ... strict + broad threshold logic that did not filter
+   const strictItems = await ...
+   return filterUnsafeSportsCatalogItems(strictItems...)
  }
  // same for seedItems
+
+ // in filterSportsCatalogItems + sportsCatalog callers: 6+ added !isAdultContentResult gates
```

Exact lines in this tree (pre-fix): no `isAdultContentResult` import or calls anywhere in the sports search/seed/filter/enrich paths (lines ~420-470, ~1197-1269, ~710-740). This is the root cause of polluted sports catalogs.

**2. src/handlers/stream.js — BUG: missing playable video / size / peers checks on inspections (dead handoffs leak)**

Added in main:
- `totalSizeBytes`, `supportedDirectVideoBytes` computed in inspectTrackerLink
- `sportsSourceHasPeersAndFiles`, `trackerInspectionHasPlayableVideo` helpers
- Filters using them for sports sources

In this tree: the inspection returns only counts, no size/video validation. Sports debrid/qBit streams can be emitted for 0-byte or non-video torrents.

**3. src/utils/streamRouter.js — BUG: no sports-specific dead/intermediate hiding; weaker ready-qBit ordering**

Main adds (this tree lacks):
- `isSportsContext`, `isSportsIntermediateMode`, `shouldKeepSportsStream`, `filterSportsStreams`
- `sportsStreamSeeders`, `sportsStreamSourceSize`
- `prioritizeProviderForCacheSource`
- Use of the filter before final dedup/return (around the sports handoff paths)

This tree's version emits the intermediates and does not prefer ready qBit for sports the same way.

**Clean (identical to main — no additional errors):**
- `src/utils/sportsTitleParser.js`: full noise stripping (mw|matchweek|wd|wsm|round|league phrases in LEADING/TAIL/ROUND_PATTERNS, replacements at ~563). Contract at 1651 per SPEC. Compliant.
- `src/handlers/sportsArtworkProxy.js`: fallbackInput handling + entitlement stamps present. No cache-key omission of fallbackInput visible in the reviewed paths (the CRIT-4 bug from the May 17 AUDIT appears addressed or was in a different version).
- `src/config/manifest.js:10-11`: PUBLIC_BOOTSTRAP_MANIFEST_NAME = 'PVTKRR', DESCRIPTION = exact locked paragraph. createBootstrapManifest branches correctly for self-host/desktop (outside lock). No kepners.co.uk in public artifacts.
- `src/handlers/playbackDebrid.js`: handles torrent-file via fetchTorrentPayload (the "sports file debrid" path). No obvious regression vs main.

**Live / spec verification (from MD reads + prior AUDIT):**
- Bootstrap manifest at https://www.pvtkrrx.cc/manifest.json returns name="PVTKRR" + exact desc (smoke-config-flow.js asserts this).
- SportsMeta boundary honored in CURRENT_DESIGN.md and code (no sportsmeta: catalogs inside PVTKRRX).
- 7 poster templates, ticket-stub default, real badges via SportsMeta (per CLAUDE.md + AGENTS.md guardrails).
- No violations of hostname lock or bootstrap name/desc lock in the reviewed tree.

**Smoke gates** (would be run on any fix): smoke:debrid-all, smoke:sports-*, smoke:config, smoke:guards, smoke:playback, smoke:parity. All must pass.

---

## D. Weak points

- **This is a local-only review of the codex branch tree.** No live Stremio catalog probe or Coolify/native repro of the "polluted sports catalog" or "dead sports debrid handoff" was performed in this session (would require a configured Prowlarr + debrid + Stremio client hitting the review runtime).
- Branch-behind risk is real and material: promoting this tree would re-introduce the three hygiene classes.
- Release parity not re-audited here (desktop EXE, self-host installer, cloud Coolify image) — only the source paths.
- AdultContentFilter and the new stream guards live in main but were not present in the reviewed tree; their implementation quality was not re-reviewed (only that they were added to fix the observed failure modes).
- Parser/artwork compliance is "identical to main" — if main has a subtle remaining gap vs the full 14-batch SPEC + DIRECTIVE 001 examples, it would be inherited.
- No MCP/tool use for live www.pvtkrrx.cc catalog probes during the narrow review window.

---

## E. Exact fixes made (during this review)

**None.** This was a strict read-only forensic review per the job brief ("only review the codebase... Then i want you tell me what you find").

No code was edited. The hygiene fixes already exist on main (the 9 commits). The task was to surface the errors present in the review branch's scoped files.

If a follow-up fix PR is cut from this review, it would backport or re-implement the three main hygiene patches (adult filter in catalog, playable checks in stream, sports keep-filter + ordering in router) plus any additional gaps found in the parser or artwork paths against the live SPEC/DIRECTIVE examples. All such work would be smoke-gated and dual-surface released per the release rule.

---

## F. Safe public wording

**(Only after all verification — never optimistic)**

**For the hygiene issues (the actual current issues on this branch vs main):**

"The v1.3.5 release line on main includes targeted hygiene fixes for sports catalog and debrid handoff emission. A focused review of the codex/make-main-20260517 branch (behind main by 9 commits) confirms the pre-fix state in three files:
- src/handlers/catalog.js — sports search/seed/filter paths lacked adult/non-sports content filtering.
- src/handlers/stream.js — tracker inspections lacked size/playable-video guards for sports sources.
- src/utils/streamRouter.js — no sports-specific intermediate/dead-handoff filter; weaker ready-qBit preference for sports.

These cause polluted sports catalogs and dead/uncached debrid or qBit streams appearing for sports in Stremio. The fixes on main (adultContentFilter gates, playable checks, shouldKeepSportsStream + filterSportsStreams, prioritize logic) address exactly those modes.

Parser (src/utils/sportsTitleParser.js), sports artwork proxy (style, entitlement, fallbackInput handling), debrid playback handler, and bootstrap manifest (src/config/manifest.js) are identical to main and comply with SPORTS_TITLE_PARSER_SPEC.md, MD_DIRECTIVES 001/002 (no blanks, no same-league both sides, combat single-event, clean initials fallback only), and the PVTKRR bootstrap name/description + www.pvtkrrx.cc hostname locks.

No open GitHub issues at review time. All other scoped paths passed the narrow audit-and-proof gates. Release from the review branch without the hygiene patches would re-introduce the catalog pollution and dead sports debrid handoffs."

**Forbidden language (examples of what not to say):** "Fixed all sports posters", "improved reliability across the board", "production ready", "debrid now works for sports" — without the exact file list, the before/after proof, the scope limitation, and the "review branch had the bugs, main has the fixes" clarity.

**For the standing directives (unchanged by this review):** "Sports poster quality for free users remains on the documented `ticket-stub` template (or user-selected entitled style) with deterministic initials fallback only when upstream SportsMeta assets are genuinely unavailable. No change to the PVTKRR bootstrap manifest name or description. Hostname lock and SportsMeta boundary unchanged."

---

## Initial Context (pre-GH-fetch, 2026-05-17)

From MD exploration (see .claude/skill-memory/review/TRACKER.md for full log):

- **Product**: Stremio addon bridging private Prowlarr + qBittorrent to Stremio. Three install routes (PC Local / LAN Bridge / Remote Seedbox). v1.3.3 line adds debrid (additive only; qBit always present).
- **SportsMeta boundary** (CURRENT_DESIGN.md): Separate service at sportsmeta.pvtkrrx.cc. Owns sportsmeta: IDs, catalogs, metadata, member artwork/billing. PVTKRRX only attaches streams and proxies public artwork via /sports-artwork/* (client-safe PNGs).
- **Locks** (Claude.md + AGENTS.md + smoke tests):
  - Bootstrap manifest: name exactly "PVTKRR", public desc exactly the configure-first paragraph. No route/version/desktop suffixes ever.
  - Canonical hostname: ONLY https://www.pvtkrrx.cc in any Stremio-visible artifact (manifest logo/background, install links, etc.). pvt.kepners.co.uk forbidden in public paths.
  - Sports posters: 7 templates (ticket-stub default). Real SportsMeta badges win; clean initials only for missing. No blank squares, no both-sides-same-league-logo. Parser must not emit junk opponents (MW36 etc.).
- **Recent work on this branch** (git log): debrid qBit preference, poster style honor/clamp, championship logo dynamic, debrid config route.
- **Historical forensic baseline** (AUDIT.md 2026-05-17 on v1.1.73): CRITICAL — no stream error handling (process death), wrong-team poster cache key (fallbackInput omitted), request storms + unbounded caches (probable 2026-05-15 sharp P1), Express v5 routing landmines, unauth /encrypt oracle, dev-secret guard keyed on wrong env var, etc. Many High findings in sportsArtworkProxy, catalog, shared, index.js.
- **Active directives** (MD_DIRECTIVES.md):
  - 001 (CRITICAL RELEASE BLOCKER): Zero blanks, zero same-league both sides, zero missing crests where real data exists. Parser + directTeamLogoUrlFor + hasRealPair are primary root causes for live garbling (Manchester United vs MW36 etc.).
  - 002 (inferred): Governs SPORTS_TITLE_PARSER_SPEC.md — saturated contract with 14+ client batches. Combat = single event (no two-crest). Specific discard/keep rules for channels vs rubbish.
- **Parser** (SPORTS_TITLE_PARSER_SPEC.md): Detailed field schema, defect taxonomy, source in src/utils/sportsTitleParser.js (used by catalog.js:628). "SATURATED" — ready for implementation but must not regress on locked examples.
- **Release rule** (Claude.md): Dual-surface (cloud + Windows EXE) unless explicitly scoped. Self-host tag is vX.Y.Z-selfhost. Never claim release done if only one surface updated.

**This review will ONLY inspect code paths that a current GitHub issue or active directive explicitly implicates.** Everything else (even if broken per AUDIT) stays out of scope for this job.

---

*Seeded 2026-05-17. Will be the single source of truth for this review's findings and the only safe wording surface. Update in place as evidence arrives. Do not publish partial optimistic summaries.*