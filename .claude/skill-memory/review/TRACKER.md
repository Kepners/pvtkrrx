# Review Tracker

## 2026-05-26 Follow-Up State
- **Status**: Branch parity resolved; follow-up findings committed and pushed.
- **Branch**: `codex/make-main-20260517` rebased onto `origin/main`, then pushed with `--force-with-lease`.
- **Follow-up source fix commit**: `163d09a`.
- **Important note**: The original 2026-05-17 Grok verdict is now historical. It correctly described the stale branch at that time, but the branch is no longer behind main and no longer lacks the main sports/debrid hygiene fixes.
- **Pre-existing staged docs preserved**: `.claude/scheduled_tasks.lock`, `.claude/skill-memory/md/CORRECTIONS.md`, `AUDIT.md`, `GEMINI.md`, `MD_DIRECTIVES.md`, `SPORTS_TITLE_PARSER_SPEC.md`, `SVG_LOGO_AUDIT.md`. These were not included in the follow-up fix commit.
- **Obsolete staged release-index downgrade not reapplied**: `dist/releases/index.json` stayed on the rebased `1.3.7` main version instead of the staged `1.3.3` version.

### Follow-Up Findings
- `scripts/smoke-sports-stream-hygiene.js` exposed a real source bug: supplemental sports stream search still called all-category Prowlarr fallback. Fixed in `src/handlers/stream.js`.
- `scripts/smoke-sports-resolution.js` exposed a stale assertion: it expected configured `sportsPosterTemplate=glitch` to normalize to `ticket-stub`. Current AGENTS/CLAUDE/docs state configured PVTKRRX installs can select all seven built-in templates, with `ticket-stub` only as the default. The smoke now keeps the no-member-token check while expecting `glitch`.

### Follow-Up Proof
- PASS: `npm run smoke:sports-stream-hygiene`
- PASS: `npm run smoke:debrid-routing`
- PASS: `npm run smoke:sports-parser`
- PASS: `npm run smoke:sports-resolution`
- PASS: `npm run smoke:free-tier-artwork`
- PASS: `npm run smoke:config`
- PASS: `npm run smoke:guards`
- PASS: `npm run smoke:playback`
- PASS: `npm run smoke:parity`
- PASS: `npm run smoke:debrid-all`

### Remaining Actions
1. If this branch should become main, review the remaining staged audit/directive docs and then merge or fast-forward intentionally.
2. Do not claim live release proof until Coolify/systemd/Stremio routes are probed against the target revision.
3. Reconcile older docs that still describe the historical "free tier clamps to ticket-stub" behavior if they are still considered source-of-truth.

## Current State
- **Last session**: 2026-05-17 (initial session for this focused review)
- **Status**: active
- **Focus**: Issue-driven narrow codebase review — GitHub current issues + live MD_DIRECTIVES (001/002) + unaddressed findings from AUDIT.md (2026-05-17) + branch parity (codex/make-main-20260517 behind main by 9)
- **Key metric**: Confirmed live bugs / spec violations / lock drifts found in targeted code paths only (zero broad refactoring)
- **Governing docs**: Claude.md, AGENTS.md, MD_DIRECTIVES.md, SPORTS_TITLE_PARSER_SPEC.md, docs/CURRENT_DESIGN.md, docs/PROJECT_STATUS.md, AUDIT.md (historical forensic baseline)

## Outstanding Items
| # | Priority | Item | Found | Status |
|---|----------|------|-------|--------|
| 1 | 🔴 | Fetch and analyze exact current GitHub open issues + recent PRs/commits | 2026-05-17 | ✅ 0 open issues; 9 hygiene commits on main identified (catalog, stream, router) |
| 2 | 🔴 | Map each GH issue to precise source files/routes (sportsTitleParser, artwork proxy, stream router, manifest, self-host vs hosted, debrid, error paths) | 2026-05-17 | ✅ Mapped: catalog.js + stream.js + streamRouter.js (the 3 differing files); parser/artwork/manifest clean |
| 3 | 🔴 | Inspect only those paths for root causes, spec violations (bootstrap name/desc/hostname locks, SportsMeta boundary, poster template contract, parser contract), cache errors, crash risks | 2026-05-17 | ✅ Done (git diff + targeted reads/greps). See ISSUE_FOCUSED_REVIEW.md §C for exact lines + diff proof |
| 4 | 🟡 | Document every error/misalignment with exact file:line + snippets + proof (local + any live probes) | 2026-05-17 | ✅ Filled in ISSUE_FOCUSED_REVIEW.md (A-F structure). 3 concrete bug classes proven via main's hygiene diffs |
| 5 | 🟡 | Produce final audit-and-proof report (A.Verdict ... F.Safe public wording) | 2026-05-17 | ✅ Complete in the MD artifact + this TRACKER log |
| 6 | 🟢 | Update TRACKER + commit/push new review MDs per safe git workflow | 2026-05-17 | ⏳ Now (this step) |

## Completed
| Date | What | Outcome |
|------|------|---------|
| 2026-05-17 | Full MD inventory + deep read of canonical docs (README, Claude.md, AGENTS.md, AUDIT.md full, CURRENT_DESIGN, PROJECT_STATUS, MD_DIRECTIVES, SPORTS_TITLE_PARSER_SPEC, etc.) | Project understood: PVTKRRX Stremio addon (3 routes), strict SportsMeta separation, bootstrap locks (PVTKRR name + exact desc + www.pvtkrrx.cc only), 7 poster templates (ticket-stub default), v1.3.3 debrid additive, heavy sports parser/artwork history with release-blocker directives still active. |
| 2026-05-17 | Created required MD artifacts for job (.claude/skill-memory/review/TRACKER.md + ISSUE_FOCUSED_REVIEW.md) | Audit-and-proof structure seeded; ready for GH-driven findings. |
| 2026-05-17 | Git state captured (branch behind, staged MDs from prior codex work) | Context for release parity and push rules noted. |

## Next Actions
1. Complete GitHub MCP fetch (list_issues, recent PRs/commits) — drive the narrow review scope.
2. Targeted code reads/greps ONLY on issue-mapped paths (no fishing expeditions).
3. Apply audit-and-proof: separate assumed/verified-local/verified-live; exact lines; PASS/FAIL; caveats.
4. Fill ISSUE_FOCUSED_REVIEW.md with A-F structure + full error list.
5. Git status -> selective add -> emoji commit -> push (or note behind + rebase).
6. Close session log in TRACKER.

## Notes
- **Strict scope**: Review **only** code tied to identified current issues. Broad AUDIT findings (god files, general memory) out of scope unless a GH issue directly references them.
- **Anti-patterns forbidden**: No "nice summary", no hiding failures, no local-repo=deployed assumption, no treating one example as broad proof.
- **Communication**: Every message starts/ends with contextual emoji; human tone; personality.
- **Git**: Per Claude.md/AGENTS.md — status first, selective add by path, emoji-prefix commit, push current branch, pull-rebase if rejected.
- **Memory**: This TRACKER is the persistent state. Append session logs after every work block. Never repeat solved work.
- **MCP**: For github tools, search_tool first for exact schema before use_tool.
- Branch snapshot (initial): codex/make-main-20260517 behind origin/main by 9 commits. Staged in prior work: AUDIT.md, MD_DIRECTIVES.md, SPORTS_TITLE_PARSER_SPEC.md, SVG_LOGO_AUDIT.md, GEMINI.md, CORRECTIONS.md, scheduled lock, dist/releases/index.json.

*Initial seed by focused review session 2026-05-17. Update after each phase.*
