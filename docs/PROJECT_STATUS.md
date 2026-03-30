# PVTKRRX Project Status

Updated: 2026-03-30

## Current Stage

PVTKRRX is in a working `1.1.19` state on the main Windows/local route set.

The practical reading of the project today is:

- `PC Local` is the real host-desktop route and is working
- `LAN Bridge` is the same-account home-device route and the host desktop should not use it for local browsing
- completed-file playback on the local runtime is working again after the `/playback` and `/file` path fixes
- official Stremio archive-source support for `rarUrls` is real and was re-verified against upstream SDK/core sources on 2026-03-30
- PVTKRRX now emits the correct packed-archive payload shape, but one real-client PVTKRRX archive-playback success is still missing before that path should be called proven
- the sports catalog artwork path now prefers landscape art for tiles when available
- the Windows installer/build flow is reproducible again
- the remaining work is real-device coverage, packed-RAR client sign-off, and performance tuning, not a reset/rebuild

## Verified Working Now

These items are verified in the current workspace or by direct client/log proof:

- `npm run smoke:config` passed on 2026-03-29
- `npm run smoke:desktop` passed on 2026-03-29 and now guards the desktop auto-provision persistence path against writing redacted config readbacks back to disk
- `npm run smoke:playback` passed on 2026-03-29 and now covers redirect plus byte-serving on the shared `/file` route
- `npm run smoke:pipeline` passed on 2026-03-29
- `npm run smoke:sports` passed on 2026-03-29
- `npm run dist:win` passed on 2026-03-29, again on 2026-03-30 for the `1.1.16` desktop release build, again on 2026-03-30 for the `1.1.17` bug-fix desktop release build, again on 2026-03-30 for the `1.1.18` archive-extraction desktop release build, and again on 2026-03-30 for the `1.1.19` desktop power-policy build
- `npm run smoke:config`, `npm run smoke:desktop`, `npm run smoke:stremio-link`, `npm run smoke:lan-pair`, `npm run smoke:guards`, `npm run smoke:security`, `npm run smoke:pipeline`, `npm run smoke:playback`, and `npm run smoke:sports` all passed again on 2026-03-30
- root `/manifest.json` returns the bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- `PC Local` resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- same-host `LAN Bridge` `Failed to fetch` was traced to route choice on 2026-03-28, not to server failure
- completed-file playback error `isCompletedTorrent is not defined` was fixed in the local playback path
- the desktop splash now appears on every cold boot and stays frontmost until the main shell is ready
- the desktop wrapper now starts a Windows power blocker by default and logs lock/unlock/suspend/resume so the host is less likely to disappear when Windows is locked or the display turns off
- host-side `LAN Bridge` status now checks the hosted relay directly, and the desktop can repair a stale local pair identity after an `invalid pair key` rejection
- host-side Stremio Desktop session scanning now detects the real WebView2 `profile/auth/key` storage format again, and startup auto-provision can link that signed-in session automatically
- sports catalog tiles now prefer landscape artwork when TheSportsDB provides it
- completed matched packed scene releases now emit ordered Stremio-core-compatible `rarUrls` streams on local playback-capable routes, while incomplete archive sets stay hidden until every volume is ready
- packed-only tracker torrents are now inspected dynamically before stream emission, so neutral-title `.torrent` links no longer fall through to fake live `/playback` streams
- sports event title parsing now handles non-vs formats (F1, UFC, MotoGP, Supercars, NASCAR, etc.) with structured league/date/event extraction
- sports catalog grouping correctly deduplicates quality variants of the same non-vs event into one tile
- sports detail pages now carry richer metadata: multi-line descriptions, sport type labels, league/date/event info
- Supercars, V8, NASCAR, WSBK, WEC, Formula E, Darts, and expanded Golf coverage added to sport detection
- local `/playback` now fails fast for incomplete multi-volume RAR releases after queueing the torrent, instead of timing out behind a false progressive-playback promise
- completed packed RAR releases now start background extraction into a managed `.pvtkrrx-extracted/<hash>` folder when the local host can reach the archive volumes, and direct extracted playback is preferred once ready while `rarUrls` remain the fallback
- official Stremio sources were re-checked on 2026-03-30: `rarUrls` is a real archive source, tuple-style `ArchiveUrl` is the correct payload shape, and archive sources are routed through the local streaming server at `rar/create`
- the repo-local `behaviorHints.sourceContainer = 'rar'` hint is not part of the official Stremio archive contract and should not be treated as proof that clients honor the stream
- `npm run smoke:pipeline` and `npm run smoke:playback` both passed again on 2026-03-30 during the documentation audit; these prove payload and route behavior, not end-to-end client playback
- current configure flow exposes route-aware primary install links while keeping manual addon URLs as fallback, and the current `public/configure.html` flow passed the 2026-03-30 config/desktop/link smoke pass
- the Stremio WebView2 client cache on this machine contains cached PVTKRRX stream responses with `PVTKRRX` in the stream `name`, confirming branded source labels are reaching the real client
- `1.1.19` installers were built successfully into `dist/`

## What We Fixed On 2026-03-28 And 2026-03-29

1. Host-desktop `LAN Bridge` browsing:
   - Root cause: the host Windows PC was using the hosted `LAN Bridge` route instead of `PC Local`.
   - Fix: keep `LAN Bridge` for the other home devices and use `PC Local` on the host desktop.
2. Playback error on a fully downloaded file:
   - Root cause: first `/playback` crashed with `isCompletedTorrent is not defined`, and after that was fixed the redirected `/file` route still crashed because `fs` was not imported in `index.js`.
   - Fix: restored the completion-state helper, re-imported `fs` for the built-in file server, and re-covered the route with a smoke test that follows playback redirect all the way into served bytes.
3. Windows installer build failure:
   - Root cause: `electron-builder`/`rcedit` was failing when writing EXE metadata directly inside the OneDrive-backed repo output folder.
   - Fix: build in temp first, then copy/archive back into `dist/`.
4. Startup shell behavior:
   - Root cause: the splash could disappear too quickly and was not forced to the front.
   - Fix: splash is now frontmost, minimum-duration, and replaced only after the local runtime is reachable.
5. Sports posters:
   - Root cause: sports tiles were biased toward portrait/fallback art even when landscape event art existed.
   - Fix: sports artwork now tracks portrait, landscape, and background separately, and tiles prefer landscape.
6. LAN Bridge pair drift after desktop auto-provision:
   - Root cause: desktop boot could rewrite the saved local config with a sanitized `/auto-provision` readback payload, which dropped `lanPairKey` / `lanPairOwnerId`. A later local auto-setup then regenerated a new key for the same pair id and the hosted relay rejected it as `invalid pair key`.
   - Fix: desktop boot no longer persists sanitized provision readbacks, host-side pair status now asks the relay directly, and the desktop can repair the local LAN identity if the relay rejects a stale pair.
7. Host-side Stremio account reuse stopped auto-detecting the signed-in desktop session:
   - Root cause: the local auth scanner only matched clean JSON-style `auth.key` blobs and missed the noisy Chromium/WebView2 LevelDB encoding actually used by Stremio Desktop on this machine.
   - Fix: the scanner now accepts the real `profile/auth/key` blob layout, and startup `/auto-provision` reuses that signed-in host session automatically instead of waiting for a manual check button.
8. Packed sports/movie scene releases were added to qBittorrent as `.r00/.r01/...` archives and could not play:
   - Root cause: the addon only emitted direct video/file URLs and intentionally rejected `Sample + RAR` torrents as non-playable, even though Stremio supports archive playback through `rarUrls`.
   - Fix: once a packed torrent already exists in qBittorrent, local playback-capable routes now emit a Stremio `rarUrls` stream over the built-in `/file` route so Stremio can read the archive set without manual extraction. First-click tracker queueing is still a separate step.
9. Packed archive streams were still surfacing too early and classic volume ordering was wrong:
   - Root cause: the addon emitted `rarUrls` before every archive volume was fully ready, and classic multi-part sets were sorted lexically (`.r00`, `.r01`, `.rar`) instead of archive order (`.rar`, `.r00`, `.r01`).
   - Fix: incomplete packed releases are now hidden behind a clear notice until every archive volume is ready, classic volume ordering is corrected, and stale `/playback` links now stay in a waiting state instead of pretending the packed release is ready.
10. Packed archive payload shape did not match the modern Stremio core contract:
   - Root cause: the addon emitted archive entries as object-shaped `rarUrls` items and scalar `fileMustInclude`, while current `stremio-core` examples and stream conversion logic expect tuple-style archive URLs and array-based include patterns.
   - Fix: packed archive streams now serialize `rarUrls` in Stremio-core-compatible tuple form and emit `fileMustInclude` as an array of string patterns.
11. Partial packed RAR playback was still being falsely advertised on neutral-title tracker sources:
   - Root cause: unmatched `.torrent` links were being emitted as generic `/playback` streams before the addon had inspected the torrent payload, and archive-only torrents were not being prioritized as a bundle when qBittorrent primed the download.
   - Fix: tracker links are now inspected dynamically before stream emission, neutral packed-only torrents are suppressed behind a truthful packed-release notice, archive-only priming now prioritizes the full RAR bundle instead of a sample clip, and `/playback` now returns an immediate packed-archive explanation instead of stalling.
12. Completed packed releases still failed on tablet/mobile clients even when native `rarUrls` was the intended desktop/service-backed fallback:
   - Root cause: the addon relied entirely on client-side native RAR support, but real Stremio client support is uneven outside desktop/service-backed routes and the tablet path still needed a normal direct-play video file.
   - Fix: the local/host runtime now bundles `7zip-bin`, starts background extraction for completed packed releases when the archive volumes are locally reachable, and prefers the extracted direct video stream once available while keeping native `rarUrls` as the desktop-capable fallback.
13. The local host could disappear when Windows was locked or the display turned off:
   - Root cause: the Electron desktop wrapper did not request any suspend blocker and did not react to Windows lock/resume state changes, so LAN hosting depended entirely on the user's power plan staying awake.
   - Fix: `1.1.19` now starts Electron `powerSaveBlocker` in `prevent-app-suspension` mode by default, disables renderer background throttling for the desktop shell, and logs/re-heartbeats on `lock-screen`, `unlock-screen`, `suspend`, and `resume`.

## Still Needs Real-Client Proof

These items should still be treated as open until captured on real clients:

- one completed packed RAR playback success on a real Stremio Desktop v5 or other service-backed client using PVTKRRX's emitted `rarUrls` path
- one Stremio Web plus attached Stremio Desktop/Stremio Service packed-RAR playback pass, if web/LAN archive delegation is going to be claimed
- second-device `LAN Bridge` browse/play pass on Android TV or Android mobile using the latest `1.1.19` desktop build
- Apple TV synced-addon flow after desktop/web install
- one real public `Remote Seedbox` ready-file playback success on a remote client
- one auth-protected external file-server playback success on a real Stremio client
- long-session playback/performance tuning after qBittorrent download-speed adjustments

## Current Risks

- `LAN Bridge` still depends on the Windows host desktop staying online and heartbeating
- Bonjour may still be missing or stopped on some hosts; that affects discovery/fallback polish, not the core loopback path
- remote/auth-protected playback behavior still depends on what the target Stremio client honors during redirect/auth handoff
- the addon still emits `behaviorHints.sourceContainer = 'rar'`, but official Stremio docs/core do not define that field for archive support
- if a future Stremio client regresses local archive support, the correct fallback remains: suppress partial multi-volume archives and never fake progressive playback on packed releases

## 2026-03-30 Plan Closure

1. ~~Rework packed RAR playback after the real-device `liberror` result.~~ **Implementation complete; real-client sign-off reopened on 2026-03-30.**
   - `npm run smoke:pipeline` and `npm run smoke:playback` passed again on 2026-03-30.
   - The later `/file` `torrent not found` log was traced to `watch-cleanup` deleting the torrent and data after playback, not to an active playback bug.
   - A 2026-03-30 upstream audit confirmed that Stremio archive support is real: `rarUrls` exists in the SDK/core contract, tuple-style `ArchiveUrl` is correct, and archive sources are routed through `rar/create`.
   - Supported behavior remains truthful: incomplete multi-volume archives are suppressed or fail fast with a clear message, completed bundles can emit ordered Stremio-core-compatible `rarUrls`, and `1.1.18` adds host-side extraction so local/LAN clients can prefer a normal direct-play file once unpacking finishes.
   - The repo still lacks one captured real-client PVTKRRX success on the native archive path, so this item should not be treated as fully closed yet.
2. ~~Make the configure flow more automatic.~~ **Closed 2026-03-30.**
   - `npm run smoke:config`, `npm run smoke:desktop`, and `npm run smoke:stremio-link` passed again on 2026-03-30.
   - The current simple flow now has route-aware primary install links and keeps manual addon URLs as fallback instead of the main path.
3. ~~Trace the exact seedbox playback model end to end.~~ **Done 2026-03-29.**
   - Full code trace confirmed route detection (`getInstallMode` + `getManifest` profile assignment), stream emission per route, 307 LAN redirect mechanics, and `/file`/`/playback` route guards.
   - All three routes expose the same sports-first discovery catalog family plus movies, tv, and library — no per-route catalog filtering.
   - LAN Bridge 307-redirects rewrite the token path to `/local/...?mode=local`, giving LAN devices full PC Local playback after redirect.
   - Remote Seedbox on Vercel: `/file` and `/playback` return 403 for non-local tokens; ready-file-first via `fileServerUrl`.
   - Auth-protected file servers: tracker `/playback` suppressed on non-local routes because redirect can't forward `proxyHeaders`.
   - Packed RAR: emitted only when all volumes 100% complete; suppressed at stream emission for tracker first-click; `/playback` fails fast for incomplete archives.
   - Explicit capability matrix now in `docs/ROUTE_FRAMEWORK.md`.
   - `npm run smoke:lan-pair`, `npm run smoke:guards`, and `npm run smoke:security` all passed again on 2026-03-30.
4. ~~Fix sports identity quality.~~ **Done 2026-03-29.**
   - Non-vs event titles (F1, UFC, MotoGP, Supercars, NASCAR, etc.) now parse via `parseSportsEventTitle` with structured league/date/event extraction.
   - Motorsport coverage expanded: Supercars, V8, NASCAR, WSBK, WEC, Formula E, Rally, Dakar now recognized.
   - Darts and golf added as distinct sport categories.
   - Sport hint resolution, scoring signals, and catalog grouping all updated for non-vs events.
   - TheSportsDB query builder now uses structured event names for better artwork matches.
   - Smoke tests cover event parsing, sport disambiguation, catalog grouping for F1/motorsport events, meta richness, and artwork fallback.
   - `npm run smoke:sports` passed again on 2026-03-30.
5. ~~Fix sports metadata/detail pages.~~ **Done 2026-03-29.**
   - Sports detail pages now carry multi-line descriptions with league, date, event name, matchup, and stats.
   - `runtime` field now shows the sport type label (e.g. "Motorsport", "MMA").
   - `genres` tags include both sport category and league name.
   - Artwork fallback still works when TheSportsDB returns nothing (SVG thumb or brand poster).
   - `npm run smoke:sports` passed again on 2026-03-30.
6. ~~Verify whether sports can become its own top-level Stremio surface.~~ **Closed 2026-03-30.**
   - Result: the current live addon manifest now uses a dedicated top-level `sports` surface and the latest local/LAN real-client pass shows it working across sports catalogs such as Premier League and Formula 1.
   - `npm run smoke:config` and `npm run smoke:sports` cover the current manifest/type shape and sports catalog behavior.
7. ~~Ensure `PVTKRRX` appears in the source list for normal films.~~ **Closed 2026-03-30.**
   - `npm run smoke:pipeline` still asserts that movie, direct-ready, and packed-ready stream names begin with `PVTKRRX`.
   - The real Stremio WebView2 cache on this machine contains cached stream payloads with `PVTKRRX` in the stream `name`, confirming the client is receiving and storing the branded source labels instead of only third-party addon labels.

## Recommended Next Work

1. Tune qBittorrent for faster early playback and confirm stream start time improvements on real clients.
2. Re-test `LAN Bridge` from a second device using the latest `1.1.19` build and record the exact device/client result.
3. Keep sports poster review focused on what Stremio clients actually render, not just what the metadata payload contains.
4. Keep this file updated whenever a real device test changes the truth table.
