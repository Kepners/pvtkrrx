# MD Tracker

## 2026-05-26 Sync
- **Status**: Root directive/spec artifacts synced after the codex branch was merged into `main`.
- **Parser**: DIRECTIVE 002 now has current-source proof; `npm run smoke:sports-parser` passed 27/27 on 2026-05-26.
- **Sports artwork**: DIRECTIVE 001 has source-level smoke proof (`smoke:sports-resolution`, `smoke:sports-artwork`, `smoke:free-tier-artwork`) but still needs live Coolify/Stremio visual proof before public claims.
- **Cleanup**: Removed committed `.claude/scheduled_tasks.lock`, `GEMINI.md`, and stale `AUDIT_IMPLEMENTATION_PLAN.md`. Added `.claude/*.lock` to `.gitignore`.
- **Historical docs kept with warnings**: `AUDIT.md`, `SVG_LOGO_AUDIT.md`, `ISSUE_FOCUSED_REVIEW.md`.

## Current State
- **Last session**: 2026-05-15 → 2026-05-16
- **Status**: active — parser contract SHIPPED LIVE (client-authorised test deploy); Coolify build pipeline FIXED; DIRECTIVE 001 (logo readiness) audit gate still OPEN
- **Key metric**: Title parser fix = 🟢 LIVE on `https://www.pvtkrrx.cc` (commit `da6bdb4`, container healthy 200); Coolify build pipeline = 🟢 FIXED; DIR-001 logo audit gate = 🟠 still pending

## Outstanding Items
| # | Priority | Item | Found | Status |
|---|----------|------|-------|--------|
| 0 | 🔴 P1 | Coolify build pipeline broken — fresh builds crash on sharp/libvips | 2026-05-15 | ✅ RESOLVED 2026-05-16 — hardened Dockerfile builds clean THROUGH Coolify (`sharp ok 0.34.5 8.17.3`); controlled deploy of `da6bdb4` live & healthy. Auto-deploy still `false` by choice (verify `main` builds before re-enabling) |
| 1 | 🔴 BLOCKER | DIRECTIVE 001: sports poster logo readiness | 2026-05-15 | 🔄 ground truth DONE, root cause PROVEN (class d title-parser); Codex fix rolled back; gate pending |
| 2 | 🟠 HIGH | Doc defect: CLAUDE.md + .claude/briefs/team-vs-team-fix.md cite non-existent `/asset/team` `/asset/league` routes | 2026-05-15 | ⏳ correct as part of DIR-001 |
| 3 | 🟠 HIGH | Product bugs: wrong-torrent selection (dead/0-seed pick), event year missing on poster | 2026-05-15 | ⏳ fold into DIR-001/002 |
| 4 | 🟢 verify | Auditor independent re-run of SVG_LOGO_AUDIT.md after fix | 2026-05-15 | ⏳ gate, post-fix |
| 5 | 🟠 HIGH | DIRECTIVE 002: sports title parser field contract — SPORTS_TITLE_PARSER_SPEC.md | 2026-05-15 | 🔄 **14 batches logged, taxonomy SATURATED**; implementation plan pending |
| 6 | ✅ done | Implement parser fix per §7 (test-driven harness) | 2026-05-16 | ✅ commit `d761c01`, 23/23 green (17 §7 + 6 regression); `parseSportsTitleContract` + clubIdentity.js + leagueMap; NOT yet wired to consumers |
| 7 | ✅ DONE | SHIP IT — client-authorised test deploy: wire contract into consumers + hardened Dockerfile + controlled Coolify deploy + verify live | 2026-05-16 | ✅ commit `da6bdb4` LIVE on `www.pvtkrrx.cc` (container `w14jewmw5ubscrxh8zzfhq7d-165144371361`, SOURCE_COMMIT=da6bdb4, manifest 200, hostname-clean, parser fix observable, RestartCount=0). Branch HEAD = parser `d761c01` + Codex playback `9cc94b7` + consumer migration `da6bdb4` all deployed together. Site never 502 (rolling update). Gate: smoke:sports-parser 23/23, smoke:sports-resolution + pipeline + playback + remote-seedbox-guard PASS; only known motorsport smoke fails (== baseline) |

## Live regressions found in client testing 2026-05-16 (parser shipped, artwork NOT)
| # | Priority | Item | Status |
|---|----------|------|--------|
| 8 | 🔴 DIR-001 BLOCKER | Blank black squares on single-event/combat/ancillary posters — live logs: `pvtkrrx-template-glyph` glyph fallback renders empty black centre (200/svg, not a crash). Team-vs-team fine. | 🔄 local fixes on feature branch; visual-proof gate still required after v28 deploy |
| 9 | 🔴 HIGH | Poster-style admin override ignored — 100% live renders `template=ticket-stub` despite "Server-side admin override active. Selected style: Glitch"; `resolveSportsPosterTemplateFromConfig`→`verifyStampedSportsPosterEntitlement` always falls back to ticket-stub | ✅ live env fixed and 09a07a0 logs now show `template=glitch`; keep verifying after next deploy |
| 10 | 🟠 HIGH | Catalog ~30s + incomplete — `cache=rendered` not `cache=hit` (cache-key churn?), per-item SportsMeta lookups serial | 🔄 same agent |
| — | note | All 3 are BACKEND Node (`sportsArtworkProxy.js` + catalog handler) — no EXE needed for hosted route; desktop EXE is separate later parity release. MD over-claimed "verified" on the parser ship — must verify on-screen, not via smoke logs (client correction). |
| 9a | 🔴 ROOT CAUSE | BUG 9 cause FOUND: live Coolify container had **NO `PVTKRRX_OWNER_EMAILS`/`PVTKRRX_ADMIN_EMAILS` env set** → `verifyStampedSportsPosterEntitlement` (entitlement.js:252) owner allowlist was empty → always ticket-stub. Owner=`kepners@gmail.com`, sha256=`d86b1757…bf60f7`. Fix: set `PVTKRRX_OWNER_EMAILS=kepners@gmail.com` durably at Coolify resource level + verify configure stamps OWNER_OVERRIDE+hash. | ✅ verified live container has `PVTKRRX_OWNER_EMAILS` and Coolify app env row exists |
| 11 | 🟠 BILLING AUDIT | Client asked: check Stripe users afterwards. Corrected PVTKRR-specific audit 2026-05-16: PVTKRR/SportsMeta Stripe product `prod_UOcNRjrdIlJwxI`, prices `price_1TPp8T…Ng9Uk` (£2.99) and `price_1TPp8T…hCU8` (£24.99), have 0 active/trialing/total Stripe subscriptions when queried with the live SportsMeta Stripe key. Live SportsMeta DB has 8 PVTKRR checkout sessions, all expired/unpaid in Stripe, plus 2 stale local `stripe` entitlements/tokens pointing at fake `sub_sportsmeta_*` IDs that Stripe returns `resource_missing`; do not treat those as real paid PVTKRR users. | ✅ checked; cleanup/revoke needs explicit production-billing approval |
| 12 | 🔴 DIR-001 | White/light logos or fallback initials disappear on cream ticket-stub body. | 🔄 v28 local fix adds luminance-aware dark plates + URL/cache version bump; proof PNGs generated under `.runtime/sports-artwork-previews` |

## Incident
- [2026-05-15 Coolify sharp build outage](../../incidents/2026-05-15_coolify-sharp-build-outage.md) — P1 total outage from Codex push auto-deployed by Coolify; recovered on cached known-good image (`pvtkrrx-recovery` container, `e43a9fe`); Coolify auto-deploy disabled (`application_settings.is_auto_deploy_enabled=false`). Dockerfile hardening proven locally + Contabo daemon, NOT via Coolify yet. Build fix must precede any redeploy + DIR-001 gate.

## Completed
| Date | What | Outcome |
|------|------|---------|
| 2026-05-15 | DIRECTIVE 001 + SVG_LOGO_AUDIT.md; independent auditor ground truth | Proven: real fix is class-d title parser; SportsMeta `/resolve` healthy when fed clean tuple; brief/CLAUDE.md endpoint doc defect caught |
| 2026-05-15 | P1 outage diagnosed + recovered | Site back on cached v1.1.68; auto-deploy disabled; incident written |
| 2026-05-15→16 | DIRECTIVE 002 + SPORTS_TITLE_PARSER_SPEC.md living contract; 14 client-annotated batches traced through real code | ~20 defect classes; Prowlarr = sport oracle; all client field decisions locked |

## Next Actions
1. **Write the implementation plan** from SPORTS_TITLE_PARSER_SPEC.md (parser + leagueMap + club map + Prowlarr sport + date resolution + DIR-001 bridge) — client to greenlight
2. Fix Coolify Dockerfile via a real controlled Coolify deploy; verify boot; re-enable auto-deploy only after
3. Auditor re-runs SVG_LOGO_AUDIT.md after fix; MD reports all-PASS to client; no main merge for sports artwork until then

## Key Decisions Locked (client, 2026-05-15→16)
- Schema: `sport`(never empty; unmapped→`Others`), `year`, `round`, `gameNumber`, `venue`, `session`, `date`, `quality`, `format`, `language`, `tvChannel`(only client-named: DAZN/ProBox), `contentType`(documentary/ancillary)
- Sport comes from **Prowlarr category/indexer**, not the title's allow-list (SPEC §6)
- Combat = single `event` string, no head-to-head
- Documentaries/ancillary (S0x, "Drive to Survive", studio/recap/replay/commentary, MLBN bios) → keep under sport, `contentType` flag, generic art, sorted below fixtures
- Date order: title date → torrent `pubDate`; bare `DD MM` always day-month; never empty
- `tvChannel`/rubbish is the client's explicit per-token call — NEVER inferred (FS1/FOX/STAN=rubbish; DAZN/ProBox=tvChannel)
- Mislabelled competition token: club identity overrides (Celtic/Rangers = Scottish, NOT EPL)
- Club normalization (`N E C`→NEC Nijmegen) necessary but SportsMeta has no Eredivisie → clean initials per DIR-001 until upstream ingests
- leagueMap additions required: WSL, AFL (client-directed) + UECL, Giro, BTCC, Stanley Cup, EuroLeague, RSL, Jupiler/Ekstraklasa/Liga Portugal/2.Bundesliga/Eredivisie/Segunda, Scottish Premiership

## Notes
- Codex worked the logo fix in parallel — treat as untrusted until it passes SVG_LOGO_AUDIT.md gate.
- SPORTS_TITLE_PARSER_SPEC.md is the binding acceptance oracle for DIRECTIVE 002 — no parser change ships unless every logged example produces the client's required output.
- CORRECTIONS.md logs my FS1/FOX/STAN over-inference error — per-token client preference is authoritative, never generalised.
