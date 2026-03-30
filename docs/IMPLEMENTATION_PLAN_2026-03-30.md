# PVTKRRX UX & Playback Improvements

Date: 2026-03-30

## Summary

This batch covers desktop app usability, stream labelling, player reliability, and qBittorrent integration. Every item is implemented in the same commit.

Post-implementation verification on 2026-03-31 confirmed that the packaged Windows app is working as the real host runtime, and Apple TV playback through `LAN Bridge` worked while the Windows host stayed locked. Forward/back seek also worked, and the player reported the stream as local.

---

## 1. Auto-Extract RAR Archives via qBittorrent

**Problem:** Users had to manually understand how PVTKRRX handles packed scene releases.

**What changed:**
- The desktop UI toggle now reads: *"Auto-extract RAR archives when downloads complete — qBittorrent calls PVTKRRX to unpack scene releases automatically so Stremio can play them."*
- The toggle configures qBittorrent's completion hook (`autorun_program`) to call PVTKRRX's `/qbit/postprocess` endpoint.
- When enabled, completed RAR releases are automatically extracted via 7-Zip, producing a direct-play `.mkv`/`.mp4` that Stremio can use immediately.

**Files:** `electron/popup.html` (UI label), existing `index.js` `/qbit/auto-extract` endpoint (backend — unchanged).

---

## 2. Clearer Save Location Settings

**Problem:** The download path UI labels were technical and unclear.

**What changed:**
- "Current Save Path" → *"Where completed files are saved"*
- "Incomplete Path" → *"Incomplete downloads (temp)"*
- "Fallback Storage Roots" → *"Extra folders PVTKRRX scans"*
- "Packed Release Extraction" → *"RAR auto-extract status"*
- Added instruction text above the input: *"Change save location — enter a folder path and click Apply"*
- Merged the Apply, Open Folder, and Refresh buttons into one row for less scrolling.

**Files:** `electron/popup.html`

---

## 3. Logo Thumbnail During Player Loading

**Problem:** When switching streams, Stremio briefly shows a black flash before the video appears. TV services resolve this by showing a branded loading image.

**What changed:**
- Every stream object now includes `thumbnail` pointing to the PVTKRRX logo (`https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.ico`).
- Stremio clients that support the `thumbnail` field will show the PVTKRRX logo during the stream loading phase instead of a blank/black screen.
- Applied to: seedbox, buffering, tracker, and archive stream builders.

**Files:** `src/utils/streams.js` — `PVTKRRX_LOGO_URL` constant + `thumbnail` on all four stream builders.

---

## 4. Download Status Icon and File Format Icon

**Problem:** Stream names used plain text badges like `[DL]`, `[Q&B]`, `[MKV]` which weren't visually distinct.

**What changed:**
- State badges are now emoji-based:
  - `✅` — Downloaded and ready to play
  - `⏳` — Buffering in progress
  - `⬇️` — Download and play (was "Queue and buffer")
  - `📦` — Downloaded and extracted from RAR
- File format now shows with a film icon: `🎬MKV`, `🎬MP4`, etc.
- Example stream name: `PVTKRRX ✅ 1080p BluRay x264 🎬MKV`

**Files:** `src/utils/streams.js` — `buildStateBadge()`, `buildStreamName()`

---

## 5. Updated Stream State Labels

**Problem:** "Queue and buffer" was confusing — it didn't change when the file was actually downloaded.

**What changed:**
- `buildStateLabel()` now returns clearer text:
  - `'Downloaded — ready to play'` for seedbox mode (file fully downloaded)
  - `'Download and play'` for tracker mode (replaces "Queue and buffer")
  - `'Downloaded and extracted'` for extracted archives
  - `'Buffering N%'` unchanged for active downloads
- The `buildDescription()` stats line uses the same unified label function.

**Files:** `src/utils/streams.js` — `buildStateLabel()`, `buildDescription()`

---

## 6. Seeking/Skipping Fix for Buffering Files

**Problem:** When seeking in a buffering file, the Stremio player would time out after ~5 seconds because the requested byte range wasn't available yet.

**What changed:**
- **Connection keep-alive:** File responses now include `Connection: keep-alive` to prevent premature TCP disconnection during range waits.
- **Sequential download on seek:** When a Range request targets unavailable bytes, PVTKRRX now toggles qBittorrent's sequential download mode so pieces near the seek position are prioritized.
- The 45-second range wait timeout and 500ms polling interval remain the same (configurable via `STREAM_RANGE_WAIT_TIMEOUT_MS` and `STREAM_RANGE_WAIT_INTERVAL_MS` env vars).

**Note:** Some Stremio clients (especially Android/ExoPlayer) have internal player timeouts shorter than the server wait. For these, the sequential download toggle helps pieces arrive faster, but there's no server-side fix for the player's own HTTP timeout.

**Files:** `index.js` — `/file` route: added `Connection: keep-alive` header, added seek-triggered sequential download toggle.

---

## 7. Window Control Buttons (Minimize, Tray, Exit)

**Problem:** The title bar buttons were styled as generic text buttons that didn't look like standard window controls.

**What changed:**
- Replaced text buttons with circular traffic-light-style controls:
  - 🟡 **Minimize** (amber) — minimizes to taskbar
  - 🔵 **Tray** (blue) — hides to system tray
  - 🔴 **Exit** (red) — quits the application
- Each control has a hover-reveal icon (−, ▾, ×) and a label underneath.
- Added "PVTKRRX Server" title text in the drag bar.
- Removed the duplicate "Send To Tray" button from the shell actions section.

**Files:** `electron/popup.html` — drag-bar HTML and CSS

---

## 8. Larger Window — No Scroll Bar

**Problem:** The desktop server window (1180×860) was too small, causing content overflow and scroll bars.

**What changed:**
- Window dimensions increased from 1180×860 to **1320×1107**.
- Minimum dimensions increased from 1100×820 to **1320×1107**.
- Left panel switched from rigid `grid-template-rows` to `flex-direction: column` so the shell console fills available space.
- Right panel switched to flex layout so the path card fills remaining space.
- Shell console `max-height` removed — it now grows to fill available space via `flex: 1`.
- Path card also uses `flex: 1` to fill remaining right-panel space.

**Files:** `electron/main.js` (window dimensions), `electron/popup.html` (CSS layout)

---

## Verification

All existing smoke tests should continue to pass. Stream name assertions in `smoke:pipeline` need updating for the new emoji badges.

Real-device status after implementation:
- Windows packaged host app: verified working
- Apple TV synced-addon playback through `LAN Bridge`: verified working
- Remaining open proof is now centered on extra Android/mobile parity plus public remote/auth playback

Run:
```bash
npm run smoke:config
npm run smoke:guards
npm run smoke:pipeline
npm run smoke:playback
npm run smoke:lan-pair
npm run smoke:security
npm run smoke:sports
npm run smoke:stremio-link
```
