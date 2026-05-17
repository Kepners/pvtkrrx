# Production (Peter) Tracker

## Current State
- **Last session**: 2026-05-17
- **Status**: active — shipping v1.2.0
- **Key metric**: self-host playback fixed, user-confirmed working incl. progressive streaming

## Outstanding Items
| # | Priority | Item | Found | Status |
|---|----------|------|-------|--------|
| 1 | 🟠 | qBit seq/first-last toggle-vs-stale-snapshot hardening (verify-after-add; re-read fresh state before toggle). Evidence: torrent `01a0a2d8` `f_l_piece_prio=true` vs intent. NOT a blocker. | 2026-05-17 | ⏳ |
| 2 | 🟡 | Owner's box only fully self-routes via `pvt.kepners.co.uk` (Caddy `/selfhost` not stripped; no Express `/selfhost` mount). Generic self-host users unaffected. | 2026-05-17 | ⏳ |

## Completed
| Date | What | Outcome |
|------|------|---------|
| 2026-05-17 | `getPlaybackBaseUrl` self-host playback-base fix + smoke gate | Shipped `1.1.76` (`864877d`), parity-verified, native deployed, user-confirmed working incl. streaming-while-downloading; promoted to `1.2.0` |
| 2026-05-17 | v1.1.75 parity-clean release | Fixed 1.1.74 EXE/cloud version-label collision |

## Next Actions
1. Finish v1.2.0: bump, build EXEs, tag v1.2.0 + v1.2.0-selfhost, GH releases, redeploy native Contabo, verify parity.
2. Scope + ship the qBit toggle-hardening as its own change with smoke proof.

## Notes
- Release parity contract: main commit = both tags = EXE = both GH releases = live runtime, all same revision (see auto-memory release-1-1-75-parity).
- Coolify rebuild carries the unmerged sharp/libvips risk (`codex/docker-sharp-build-fix` `7bab930`); not required for the self-host fix.
- Calibration: don't manufacture open bugs after a fabrication callout — evidence both ways.
