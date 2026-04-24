# Repository Audit - 2026-04-24

## Verdict

Ready with caveats after the cleanup in this pass.

The GitHub root was carrying local editor files, runtime logs, stale MVP notes, and a README that mixed user setup, deployment history, release notes, sports architecture, and troubleshooting into one long document. That made the project look less coherent than the product actually is.

## Verified Locally

- `README.md` was about 39 KB and mixed user-facing setup with internal/live deployment notes.
- `TESTING.md` still described the old Jackett/Vercel MVP workflow and did not match the current Prowlarr, Contabo/Coolify, Windows local, LAN Bridge, and self-host model.
- Tracked files ignored by current `.gitignore` included:
  - `.runtime/addon.log`
  - `.runtime/fileserver.log`
  - `.vscode/settings.json`
  - `dist/releases/**`
  - `public/og-image*.png`
- `pvtkrrx.code-workspace` was tracked in the repository root.
- Root-level historical notes were visible on GitHub:
  - `BUILD_SUMMARY.md`
  - `CODEX_NOTE.md`
  - `DESIGN_CONFIRMATION.md`
  - `FULL_SITE_REDESIGN.md`
- Route naming was inconsistent across first-read docs: `LAN Bridge` in current public copy/spec, but `Hybrid Home` in route and architecture docs.
- `package.json` says `SEE LICENSE IN LICENSE`, but no `LICENSE` file is present in the repository root.

## Fixes Made

- Removed tracked runtime/editor files from Git while leaving local copies on disk:
  - `.runtime/addon.log`
  - `.runtime/fileserver.log`
  - `.vscode/settings.json`
  - `pvtkrrx.code-workspace`
- Updated `.gitignore` to keep `.vscode/` and `*.code-workspace` out of Git.
- Rewrote `README.md` as a shorter user-facing setup guide.
- Moved stale root notes to `docs/archive/`.
- Moved and rewrote the testing guide as `docs/TESTING.md`.
- Aligned first-read route docs around the user-facing `LAN Bridge` label:
  - `ARCHITECTURE.md`
  - `docs/ROUTE_FRAMEWORK.md`
  - `docs/STREMIO_INSTALL_TRACKER.md`
  - `docs/CURRENT_DESIGN.md`
  - `CLAUDE.md`

## Product Truth Preserved

- PVTKRRX remains the Stremio-facing private tracker/seedbox bridge.
- PVTKRRX is not a debrid service and not a media host.
- The three user-facing routes are `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- Current `LAN Bridge` behavior is still implemented internally as `routeProfile=hybrid`.
- Hosted Remote Seedbox remains ready-file-first unless the runtime is explicitly self-hosted and playback-capable.
- SportsMeta remains the separate sports identity/artwork/billing service. PVTKRRX does not currently have its own paid stream-addon unlock gate.

## Remaining Caveats

- `dist/releases/**` is still tracked even though `dist/` is ignored. That may be intentional for the Windows release surface, but it keeps large binaries in the Git tree. Moving all binary releases to GitHub Releases only is an owner decision.
- `public/og-image*.png` is still tracked even though broad image ignores exist. These may be legacy public share assets; do not remove without checking live references.
- `LICENSE` is missing while `package.json` points to it. That needs a legal/owner decision before adding or changing license text.
- Some source strings still use `Hybrid Home` as an internal/code-facing label. This pass aligned first-read docs, not every runtime string.
- The worktree already had unrelated release-state changes before this audit:
  - modified `dist/releases/index.json`
  - untracked `scripts/probe-live-release.js`
  Those were not treated as part of this docs/repo hygiene cleanup.
