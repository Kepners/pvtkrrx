# Auditor Tracker

## Current State
- **Last session**: 2026-03-31
- **Status**: round 2 audit complete, report written
- **Last audit**: Full batch b8dc6ea through 28112c8

## Outstanding Items
| # | Priority | Item | Found | Status |
|---|----------|------|-------|--------|
| 1 | 🔴 | `Connection: keep-alive` missing on three 425 early-return paths in /file route (index.js:1427, 1441, 1512) | 2026-03-31 | ⏳ Open — needs fix |
| 2 | 🟡 | Concurrent toggle race on `toggleSequentialDownload` — two requests can undo each other | 2026-03-31 | Document as known limitation |
| 3 | 🟢 | Orphaned `fitPopupWindow` in preload.js:19 — dead code, handler removed | 2026-03-31 | ⏳ Cleanup when convenient |

## Completed
| Date | What | Outcome |
|------|------|---------|
| 2026-03-30 | Round 1 audit of b8dc6ea claims | Found 2 doc gaps, missed 2 code bugs |
| 2026-03-30 | Badge doc drift fix | ✅ Fixed in 5d62049 |
| 2026-03-30 | Sports/library ID bloat fix | ✅ Fixed in 5d62049 |
| 2026-03-30 | User fixed toggle bug | ✅ Fixed in 28112c8 |
| 2026-03-31 | Round 2 full audit (correctness pass) | Found 1 medium bug (425 keep-alive), 1 low race, 1 cleanup. Report written. |

## Lessons Learned
- git-blame test fields before calling failures "pre-existing"
- Verify API call semantics (toggle vs set) not just presence
- Check ALL response paths for header coverage, not just the happy path
- An audit that only checks "does the feature exist" is not enough — must check "does the feature work correctly"

## Next Actions
1. Fix the 425 keep-alive gap (move headers before first early return)
2. Remove orphaned fitPopupWindow from preload.js
3. Add comment explaining concurrent toggle limitation
