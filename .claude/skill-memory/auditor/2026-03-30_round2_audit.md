# Code Audit Report — Round 2

> **Audit Type:** AI Verification (round 2 — correctness, not presence)
> **Auditor:** External Code Auditor
> **Date:** 2026-03-30
> **Scope:** Full b8dc6ea batch through 28112c8, every API call + compact ID + stream payload
> **Lesson applied:** Check API semantics (toggle vs set), trace field ownership, blame test fields before dismissing failures

---

## Executive Summary

**Verdict:** TWO NEW BUGS FOUND + ONE CLEANUP

Round 1 missed real issues by checking presence instead of correctness. This round traced every toggle call, every compact ID path, and every response branch. The toggle fix at 28112c8 is correct for single-request safety. Two new issues surfaced:
1. `Connection: keep-alive` missing on three early 425 response paths
2. Concurrent requests can race on `toggleSequentialDownload` (low severity)
3. Orphaned `fitPopupWindow` handler in preload.js (cleanup)

---

## API Idempotency Audit

### toggleSequentialDownload — 2 call sites

| Location | Guard | Correct? |
|----------|-------|----------|
| shared.js:1619 (`primeTorrentForStreaming`) | `if (!seqEnabled)` checks `torrent?.seq_dl === true` | ✅ Correct |
| index.js:1401 (seek handler, post-28112c8) | `if (torrent?.seq_dl !== true)` | ✅ Correct for single request |

**Concurrent race (LOW severity):** Two simultaneous `/file` requests for the same torrent can both read `seq_dl: false` before either toggle takes effect. Request A toggles ON, then Request B toggles OFF — undoing A. The `seekPriorityRequested` flag is request-scoped, so it doesn't prevent cross-request races.

**Mitigation:** Stremio sends one Range request at a time per stream. The race requires two independent clients seeking on the same torrent simultaneously. Worst outcome is sequential mode stays off — same as pre-feature behavior, not worse.

**Fix if wanted:** Per-hash mutex, or accept as known limitation since qBit has no `setSequentialDownload(hash, true)` API — only a toggle.

### toggleFirstLastPiecePrio — 2 call sites

| Location | Guard | Correct? |
|----------|-------|----------|
| shared.js:1628 (enable) | `if (shouldPrioritizeLastPieces && !firstLastEnabled)` | ✅ Correct |
| shared.js:1634 (disable) | `else if (!shouldPrioritizeLastPieces && firstLastEnabled)` | ✅ Correct |

Both properly check `torrent?.f_l_piece_prio === true` before toggling.

### setFilePriority — 2 call sites

| Location | Idempotent? | Correct? |
|----------|-------------|----------|
| shared.js:1655 (demote non-video) | Yes (set, not toggle) | ✅ |
| shared.js:1657 (prioritize video) | Yes (set, not toggle) | ✅ |

### setPreferences — 3 call sites

| Location | Idempotent? | Correct? |
|----------|-------------|----------|
| index.js:1117 (save_path) | Yes | ✅ |
| index.js:1167 (enable autorun) | Yes | ✅ |
| index.js:1172 (disable autorun) | Yes | ✅ |

Disjoint field sets across endpoints — no concurrent conflict.

---

## Compact ID Size Audit

### Production calls (2 total)

| Location | Mode | Artwork in payload? | Under 256? |
|----------|------|---------------------|------------|
| catalog.js:690 (sports) | compact: 'sports' | ❌ Removed in 5d62049 | ✅ Verified by smoke:sports |
| catalog.js:914 (library) | compact: 'library' | ❌ Removed in 5d62049 | ✅ Verified by smoke:sports |

### compactSportsPayload field audit

**Included:** y, k, t (=displayTitle), n (=displayTitle), s, d, r, h, l, e, v, u, o, w
**Excluded:** a (poster), b (background), z (logo), g (full league name), i (indexer), p (pubDate), c (count)

Note: `t` and `n` now carry the same value (displayTitle). Slightly wasteful but required because `handleCustomStream` reads `info.t` everywhere. Alternative would be to change the stream handler to fall back to `info.n`, but the current approach is safer.

### Downstream safety (decodeCustomId consumers)

All field accesses use `String(info.X || '').trim()` pattern — safe when fields are undefined.

---

## File Serving Audit

### BUG: Connection: keep-alive missing on 425 responses

**Severity: MEDIUM**

Three early-return 425 paths fire before `Connection: keep-alive` is set at line 1452:

| Line | Context | Has keep-alive? |
|------|---------|-----------------|
| 1427 | File metadata not buffered | ❌ MISSING |
| 1441 | No readable bytes at start | ❌ MISSING |
| 1512 | No readable bytes (non-range) | ❌ MISSING |
| 1452+ | All other responses (206, 503, 416) | ✅ Present |

**Impact:** Clients polling during initial buffering get 425 without keep-alive, potentially causing connection drops and forcing reconnections. This is the exact scenario where keep-alive matters most — the player is waiting for data to become available.

**Fix:** Move `res.setHeader('Connection', 'keep-alive')` and `res.setHeader('Accept-Ranges', 'bytes')` to before the first early-return block (before line 1423).

### Seek toggle propagation — CORRECT

The toggle fix at 28112c8 correctly:
1. Guards with `torrent?.seq_dl !== true`
2. Updates local state: `torrent = { ...torrent, seq_dl: true }`
3. Uses `seekPriorityRequested` to prevent re-entry within same request
4. `torrent` variable includes `seq_dl` from qBit API (confirmed via `loadTorrentPlaybackState`)

State refresh in the wait loop (`applyRefreshedPlayback`) can overwrite the local torrent, but the `seekPriorityRequested` guard prevents re-toggling. Worst case: we don't retry a failed toggle, which is acceptable for a best-effort optimization.

---

## Stream Payload Audit

### Badge correctness

| Mode | buildStateBadge | buildStateLabel | Correct? |
|------|----------------|-----------------|----------|
| seedbox | ✅ | "Downloaded — ready to play" | ✅ |
| buffering | ⏳ | "Buffering N%" | ✅ |
| tracker | ⬇️ | "Download and play" | ✅ |
| extracted | 📦 | "Downloaded and extracted" | ✅ |
| unexpected string | ⬇️ (fallback) | "Download and play" (fallback) | ✅ Safe |

No path produces old "Queue and buffer" text. Confirmed by grep: zero occurrences in codebase.

### Thumbnail coverage

| Builder | Has thumbnail? |
|---------|---------------|
| buildOnSeedboxStream | ✅ PVTKRRX_LOGO_URL |
| buildOnBufferingStream | ✅ PVTKRRX_LOGO_URL |
| buildOnTrackerStream | ✅ PVTKRRX_LOGO_URL |
| buildOnArchiveStream | ✅ PVTKRRX_LOGO_URL |
| buildInfoStream (notices) | ❌ Intentional — uses externalUrl |

All playable streams carry the thumbnail. Notice streams intentionally omit it.

### Container badge

`detectContainerLabel` handles all extensions including archive types. Default is `'VIDEO'`. Output format: `🎬MKV`, `🎬MP4`, `🎬VIDEO`, etc. No code path produces a stream name without the container badge.

---

## Desktop Shell Audit

### Window controls — FUNCTIONAL

Three 14px circular buttons (minimize/tray/exit) at popup.html:823-828. Small but mitigated by adjacent text labels, hover glow, and tooltips. All three wire correctly through preload.js to main.js IPC handlers.

### Tray — CORRECT

logo.ico is valid multi-resolution Windows icon. Tray menu has Open, Configure, Exit. Click/double-click restore the window. Close handler hides to tray when `isQuitting` is false.

### Close safety — CORRECT

Every path to `app.quit()` sets `isQuitting = true` first. Cannot deadlock.

### CLEANUP: Orphaned fitPopupWindow

**Severity: LOW**

preload.js:19 exposes `fitPopupWindow` which sends `'fit-popup-window'` IPC, but no handler exists in main.js (removed in an earlier commit). The function is never called from popup.html. Harmless dead code but should be cleaned up.

---

## Full Findings Summary

| # | Severity | Finding | Location | Status |
|---|----------|---------|----------|--------|
| 1 | **MEDIUM** | `Connection: keep-alive` missing on 425 early returns | index.js:1427, 1441, 1512 | Open — needs fix |
| 2 | **LOW** | Concurrent toggle race on sequential download | index.js:1401 | Known limitation — qBit API is toggle-only |
| 3 | **LOW** | Orphaned fitPopupWindow in preload.js | preload.js:19 | Cleanup needed |
| 4 | Resolved | Badge doc drift (emoji vs brackets) | CURRENT_DESIGN.md, PROJECT_STATUS.md | ✅ Fixed in 5d62049 |
| 5 | Resolved | Sports/library ID bloat (artwork URLs) | customId.js, catalog.js | ✅ Fixed in 5d62049 |
| 6 | Resolved | toggleSequentialDownload not guarded | index.js:1401 | ✅ Fixed in 28112c8 |

---

## Recommendations

### Fix now
1. [ ] Move `Connection: keep-alive` and `Accept-Ranges: bytes` headers before the first 425 early-return at line 1423

### Fix when convenient
1. [ ] Remove `fitPopupWindow` from preload.js:19

### Document as known limitation
1. [ ] Concurrent toggle race — add a code comment explaining why a per-hash mutex isn't worth it given single-client usage

---

*Round 2 audit — 2026-03-30*
*Corrections from round 1 applied: traced API semantics, blamed field ownership, verified idempotency.*
