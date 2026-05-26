# MD Correction Log

## Directive Effectiveness Tracking

| Date | Directive Issued | Result | Correction Needed | Updated As |
|------|------------------|--------|-------------------|------------|
| 2026-05-15 | DIRECTIVE 001 scoped to website /sports gallery + SportsMeta logo endpoints | Client surfaced live Stremio catalog with same-team-both-sides + garbled opponents ("MW 36","WD35","WSM") | Scope was too narrow — missed the catalog title-parser path | Widened DIRECTIVE 001 to cover catalog title-parse/classifier; added root-cause class (d) same-team-dup from invalid opponent; auditor scope widened via SendMessage |

## Sharpened Directive Patterns
- VAGUE: "audit the SVGs" → SHARP: "per-league PASS/FAIL table + per-team title-parse table, BLANK / DUP-LEAGUE / SAME-TEAM-DUP / GARBLED-OPPONENT are release blockers, proof per row"
- Logo bugs on sports posters are TWO systems: (1) SportsMeta asset endpoint resolution, (2) release-title → (home,away,league) parser. Always audit both, not just the one in the screenshot.

| 2026-05-15 | DIRECTIVE 001 cited `/asset/team/{league}/{slug}` + `/asset/league/{league}` as the PVTKRRX path | Independent auditor proved those routes never existed; real path is `/resolve` → `/inspect/asset/{variant}/{canonicalId}` | MD probed a documented-but-fictional endpoint without verifying against source first | Directive corrected; doc defect logged against CLAUDE.md + team-vs-team-fix.md; rule: verify endpoints against `src/clients/*.js` before asserting them in a directive |

## MD Self-Corrections
- Do not lift endpoint shapes from briefs/CLAUDE.md into a binding directive without confirming them in source (`src/clients/sportsmeta.js`). The brief was stale; the directive inherited the staleness. The independent audit gate caught it — keep that gate non-optional.
- 2026-05-15: Client explicitly classified `FS1`/`FOX`/`STAN` as RUBBISH (IndyCar batch). I later reclassified them as a `tvChannel` field by inferring a "broadcaster = captured field" rule from the boxing batch (`DAZN`/`ProBox`). That OVERRODE an explicit client instruction with my own consistency inference. Client pushed back ("I TOLD YOU THAT"). Reverted in SPORTS_TITLE_PARSER_SPEC.md §1/§5. **Rule:** client per-token preference is authoritative and is NOT a derivable pattern — never generalise one explicit call into a cross-cutting rule. Default unknown station/group token → RUBBISH until client says keep. This is the `feedback_no_hypothetical_bug_sidebars` failure mode applied to preferences: an untested inference treated as confirmed.

## Client Preference Encodings
1. Client is highly visual — judges by the live product surface (Stremio catalog + website), not code claims. Proof must be visual/endpoint-level, per item.
2. "Second time of asking" = previous fix was cosmetic / not verified. Independent audit gate is mandatory before calling it done.
3. Do not present untested hypotheses as findings (see project memory feedback_no_hypothetical_bug_sidebars).
