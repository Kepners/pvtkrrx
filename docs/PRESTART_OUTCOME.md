# Prestart Meeting Outcome - PVTKRRX

> **Date:** February 8, 2026
> **Chair:** Mr Gurr (Managing Director)
> **Attendees:** Glen (PM), Colin (CTO), Peter (Production), Stewart (Commercial), Auditor
> **Decision:** APPROVED — Proceed to Build

---

## Meeting Summary

The prestart meeting reviewed Peter's Implementation Programme (PROGRAMME.md) against all concept meeting output documents. All four departments presented independently and challenged each other's findings.

---

## Department Reports

### Stewart (Commercial) — APPROVED
- Timeline: 4 days matches commercial spec
- Budget: $0/month maintained, no hidden costs
- Dependencies: 3 approved, no additions
- Build order: Efficient with good parallelism
- Minor flags: Phase 3 density (schedule risk), cacheMaxAge values should reference technical spec

### Peter (Production) — READY
- All 10 acceptance criteria from SCOPE_OF_WORKS.md mapped to specific tasks
- Programme verified against clockrr source code (exact pattern match)
- Critical path identified: Phase 2 handlers (depend on all 3 clients)
- Top risks: Torznab XML variance, Vercel 10s timeout, custom sports ID scheme
- Key insight: "Don't rush Phase 3 — integration is where bugs hide"

### Colin (CTO) — BUILD-READY WITH 4 FIXES
- All 8 technical decisions properly reflected in programme
- Timeout budgets correct (7s/5s/3s with AbortController)
- SDK integration correct (router last, withConfig middleware)
- **CRITICAL finding:** Config page encryption must be server-side (`POST /encrypt`)
- Medium: cacheMaxAge values missing from handler tasks
- Minor: parseExtra() placement, sports genre manifest fields, videoSize source

### Auditor — PROCEED
- CHECK 1: Programme vs Scope — ALL 10 criteria covered
- CHECK 2: Programme vs Technical Spec — ALL 8 decisions aligned
- CHECK 3: Programme vs Commercial Spec — Timeline, budget, deps match
- CHECK 4: MD's 5 directives — ALL respected
- CHECK 5: Programme vs Production Spec — Aligned (one cosmetic ordering difference)
- Doc typo found: CLIENT_DRIVERS.md header said "4 directives" — corrected to "5"

---

## Key Debates & Resolutions

| Debate | Resolution | Decided By |
|--------|-----------|------------|
| Config encryption: client-side vs server-side | Server-side `POST /encrypt` endpoint — ENCRYPTION_SECRET never in browser | Colin (security finding), Mr Gurr (approved) |
| Playback timeout response format | 504 JSON error — simpler, works with Stremio re-query | Mr Gurr |
| Sports build priority | Catalog first, then streaming | Mr Gurr (Peter's recommendation) |
| Test approach | Mock in dev, real seedbox in Phase 4 | Mr Gurr |
| Sports genre filtering | Query-based (`&q=UFC`) — more reliable across indexers | Mr Gurr (Colin's recommendation) |
| cacheMaxAge values | Streams: 0, Movies/TV: 300, Sports: 120 | Per TECHNICAL_SPEC.md |
| Error handling timing | Defensive from Phase 2 handlers (not Phase 3 afterthought) | Colin |
| parseExtra() placement | Phase 2 alongside catalog handler | Colin |

---

## Fixes Applied to PROGRAMME.md

1. **CRITICAL:** Added `POST /encrypt` endpoint (Task 3.4) — config page calls server, secret stays server-side
2. **MEDIUM:** Added explicit `cacheMaxAge` values to handler tasks (2.4, 2.5)
3. **MINOR:** Moved `parseExtra()` into catalog handler (Task 2.4)
4. **MINOR:** Added sports genre `extra` fields to manifest task (0.5)
5. **MINOR:** Made error handling defensive from Phase 2 (not Phase 3 bolt-on)
6. **MINOR:** Clarified dual timeout mechanism in TorznabClient
7. **MINOR:** Added explicit `qBit.files(hash)` call for videoSize in stream handler

---

## MD Decision

**APPROVED — Proceed to Build.**

The programme is comprehensive, aligned with all specifications, and the security issue has been addressed. All departments are satisfied.

### Conditions:
- Programme fixes have been applied (7 items above)
- Status changed from DRAFT to APPROVED
- Client questions answered (MD rulings recorded in PROGRAMME.md)

### Next Steps:
1. Glen (PM) to begin execution via `/ccc:pm` or `/ccc:production`
2. Follow PROGRAMME.md build order exactly
3. Phase 0 (Foundation) starts immediately
4. Target: 4 days to deployed addon

---

*Recorded by Glen (PM) — February 8, 2026*
*Approved by Mr Gurr (MD) — February 8, 2026*
