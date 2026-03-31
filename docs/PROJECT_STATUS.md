# PVTKRRX Project Status

Updated: 2026-03-31

## Current Stage

PVTKRRX is in a working `1.1.21` state on the main Windows/local route set.
The current packaged Windows app is now verified as the real host runtime, and a live Apple TV LAN Bridge pass has been captured against it.

The practical reading of the project today is:

- `PC Local` is the real host-desktop route and is working
- `LAN Bridge` is the same-account home-device route and the host desktop should not use it for local browsing
- explicit self-host server mode now exists for VPS/seedbox installs, with disk-backed `/selfhost` manifests, browser-admin auth for private service URLs, and optional `systemd` boot automation
- completed-file playback on the local runtime is working again after the `/playback` and `/file` path fixes
- official Stremio archive-source support for `rarUrls` is real and was re-verified against upstream SDK/core sources on 2026-03-30
- PVTKRRX now treats extracted direct video as the only supported packed-RAR playback path by default, and keeps native `rarUrls` behind an explicit experimental override
- the sports catalog artwork path now prefers portrait poster art for tiles, while keeping separate sport-aware backgrounds/logos for player wallpaper/loading
- sports poster, wallpaper, landscape, and logo bytes can now be cached on demand by the active runtime through signed `/image/sports/...` URLs instead of hotlinking every request back to the upstream artwork host
- the Windows installer/build flow is reproducible again
- `https://www.pvtkrrx.cc` is the live public relay; `https://pvtkrrx.vercel.app` is currently a dead preview hostname returning Vercel `DEPLOYMENT_NOT_FOUND`
- the homepage rewrite now exists locally in `public/index.html`, but it still needs a browser pass and deliberate deploy before the live site can be treated as updated
- the remaining work is real-device coverage, remote/auth playback sign-off, and performance tuning, not a reset/rebuild

## Work Carried Out On 2026-03-31

- `169a2e4` documented the live public-host truth table, dead preview-host status, and website audit state across the main docs set.
- `e50a6b0` rewrote the homepage around clearer product positioning, route comparison, requirements, and sports proofing.
- `9c18996` and `9b93f03` added explicit self-hosted server setup: localhost/private service validation for self-host installs, browser-admin token flow, disk-backed `/selfhost` manifests, server setup scripts, and optional `systemd` install support.
- `d174bd2` added provider-specific runbook presets to the runbooks/configure surface.
- `428b15b` changed stream source labels so users can see whether playback is coming from the host PC or the remote/server route.
- `2d3175a` added the sports artwork byte cache/proxy layer so posters, wallpapers, landscape art, and logos can be served from the active local/hosted runtime after the first fetch instead of being hotlinked every time.
- 2026-03-31 Apple TV strict-client fix: meta responses no longer emit `meta: null`; unsupported or offline-meta paths now return a real placeholder `MetaItem` so tvOS clients do not fail deserialization on missing metadata.

## Verified Working Now

These items are verified in the current workspace or by direct client/log proof:

- `npm run smoke:config` passed on 2026-03-29
- `npm run smoke:selfhost` passed on 2026-03-31 and now covers explicit self-host server mode, disk-backed `/selfhost` config, and server-admin token gates
- `npm run smoke:sports` passed on 2026-03-31 after the sports artwork byte-cache update, including proxy URL coverage and cache-hit reuse checks
- `npm run smoke:sports` passed again on 2026-03-31 after the Apple TV-safe meta placeholder change
- `npm run smoke:desktop` passed on 2026-03-29 and now guards the desktop auto-provision persistence path against writing redacted config readbacks back to disk
- `npm run smoke:playback` passed on 2026-03-29 and now covers redirect plus byte-serving on the shared `/file` route
- `npm run smoke:pipeline` passed on 2026-03-29
- `npm run smoke:sports` passed on 2026-03-29
- `npm run dist:win` passed on 2026-03-29, again on 2026-03-30 for the `1.1.16` desktop release build, again on 2026-03-30 for the `1.1.17` bug-fix desktop release build, again on 2026-03-30 for the `1.1.18` archive-extraction desktop release build, again on 2026-03-30 for the `1.1.19` desktop power-policy build, again on 2026-03-31 for the `1.1.20` sports-image-cache build, and again on 2026-03-31 for the `1.1.21` Apple TV metadata-serialization fix build
- `npm run smoke:lan-pair` passed again on 2026-03-31 after the Apple TV-safe LAN offline meta placeholder change
- `npm run smoke:config`, `npm run smoke:desktop`, `npm run smoke:stremio-link`, `npm run smoke:lan-pair`, `npm run smoke:guards`, `npm run smoke:security`, `npm run smoke:pipeline`, `npm run smoke:playback`, and `npm run smoke:sports` all passed again on 2026-03-30
- root `/manifest.json` returns the bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- 2026-03-31 public host check: `https://www.pvtkrrx.cc/`, `/configure`, `/runbooks`, `/manifest.json`, and `/health` all returned `200` from the live public host; `/local/install` returned `403` as expected for a local-only helper route
- 2026-03-31 preview-host check: `https://pvtkrrx.vercel.app/` returned `404` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`, so treat it as stale and non-canonical
- 2026-03-31 homepage rewrite landed locally in `public/index.html`: plain-English hero, route comparison, requirements section, sports proof section, and removal of the public `/local/install` CTA
- explicit self-host server mode now exposes `/app-config.json`, disk-backed `/selfhost/config.json` + `/selfhost/manifest.json?mode=hosted`, and `POST /server-config` for persisted VPS/seedbox installs
- `npm run server:setup` now writes `.env`, saves the runtime config locally, creates a server admin token file, and can install a Linux `systemd` service for auto-start on boot
- `PC Local` resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- same-host `LAN Bridge` `Failed to fetch` was traced to route choice on 2026-03-28, not to server failure
- completed-file playback error `isCompletedTorrent is not defined` was fixed in the local playback path
- the desktop splash now appears on every cold boot and stays frontmost until the main shell is ready
- the desktop wrapper now starts a Windows power blocker by default and logs lock/unlock/suspend/resume so the host is less likely to disappear when Windows is locked or the display turns off
- the desktop shell can now toggle Windows sign-in startup on/off from inside the app, and startup launches stay hidden in the tray so the local runtime can auto-launch after login without popping the main window
- host-side `LAN Bridge` status now checks the hosted relay directly, and the desktop can repair a stale local pair identity after an `invalid pair key` rejection
- host-side Stremio Desktop session scanning now detects the real WebView2 `profile/auth/key` storage format again, and startup auto-provision can link that signed-in session automatically
- sports catalog tiles now prefer portrait poster art when TheSportsDB provides it, while backgrounds stay sport/league-aware for better Stremio wallpaper coverage
- completed matched packed scene releases now stay hidden by default until PVTKRRX can surface an extracted direct-play file, while incomplete archive sets stay hidden until every volume is ready
- packed-only tracker torrents are now inspected dynamically before stream emission, so neutral-title `.torrent` links no longer fall through to fake live `/playback` streams
- sports event title parsing now handles non-vs formats (F1, UFC, MotoGP, Supercars, NASCAR, etc.) with structured league/date/event extraction
- sports catalog grouping correctly deduplicates quality variants of the same non-vs event into one tile
- sports detail pages now carry richer metadata: multi-line descriptions, sport type labels, league/date/event info
- Supercars, V8, NASCAR, WSBK, WEC, Formula E, Darts, and expanded Golf coverage added to sport detection
- local `/playback` now fails fast for incomplete multi-volume RAR releases after queueing the torrent, instead of timing out behind a false progressive-playback promise
- completed packed RAR releases now start background extraction into a managed `.pvtkrrx-extracted/<hash>` folder when the local host can reach the archive volumes, and direct extracted playback is the supported path once ready
- local `/file` now waits for the specific requested qBittorrent piece window during seek/skip range probes, so already-downloaded later ranges return `206` instead of dropping out after the initial buffer
- local qBittorrent control can now manage a PVTKRRX-owned completion hook for packed-release extraction without silently overwriting a different existing qBit post-process program
- stream labels now use emoji state badges (`⬇️` download-and-play, `⏳` buffering, `✅` downloaded, `📦` extracted) and a film-icon container badge (`🎬MKV`, `🎬MP4`, etc.)
- the desktop shell now has explicit `Minimize`, `Send To Tray`, and `Exit App` controls, hides to tray on close, and uses a larger no-scroll default layout
- the configure page now shows the live qBittorrent save path, incomplete path, fallback storage roots, and extraction-hook state when opened on the Windows host runtime
- official Stremio sources were re-checked on 2026-03-30: `rarUrls` is a real archive source, tuple-style `ArchiveUrl` is the correct payload shape, and archive sources are routed through the local streaming server at `rar/create`
- the repo-local `behaviorHints.sourceContainer = 'rar'` hint is not part of the official Stremio archive contract and should not be treated as proof that clients honor the stream
- `npm run smoke:pipeline` and `npm run smoke:playback` both passed again on 2026-03-30 during the documentation audit; these prove the supported direct-play packed-release behavior and keep the experimental native archive payload path covered
- current configure flow exposes route-aware primary install links while keeping manual addon URLs as fallback, and the current `public/configure.html` flow passed the 2026-03-30 config/desktop/link smoke pass
- the Stremio WebView2 client cache on this machine contains cached PVTKRRX stream responses with `PVTKRRX` in the stream `name`, confirming branded source labels are reaching the real client
- `1.1.19` installers were built successfully into `dist/`
- `1.1.20` installers were built successfully into `dist/` on 2026-03-31 for the sports image-cache update
- `1.1.21` installers were built successfully into `dist/` on 2026-03-31 for the Apple TV metadata-serialization fix
- the packaged Windows desktop app is working on the current host build, including the route-first setup flow and desktop shell controls shown in the live app UI
- a real Apple TV LAN Bridge playback pass succeeded on 2026-03-31 after desktop/web install; while the Windows host stayed locked, playback started normally, the client reported the video as local, and forward/back seek worked

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
14. Native packed-RAR fallback still lacked one real PVTKRRX client pass:
   - Root cause: the repo had a spec-aligned `rarUrls` payload path, but neither the local runtime logs nor the Stremio-side data on this machine contained a captured end-to-end native archive success, so the addon was still advertising an unproven playback mode.
   - Fix: completed packed releases now stay hidden by default until archive extraction can surface a normal direct-play video file; native `rarUrls` emission remains available only behind `PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true` for manual testing.
15. Local skip/seek probes could still time out a few seconds into buffering playback:
   - Root cause: `/file` knew how many head bytes were readable, but it did not map later seek probes to qBittorrent piece availability, so Stremio footer/range requests outside that initial head window still failed too early.
   - Fix: `/file` now queries qBit torrent properties + piece states, maps file offsets to torrent pieces, and waits for the requested piece window before answering late-range probes.
16. qBittorrent extraction ownership was unclear and settings could not manage it cleanly:
   - Root cause: PVTKRRX already owned archive extraction, but the UI did not expose whether qBit should trigger that flow on completion and there was no managed completion-hook path.
   - Fix: the local runtime now exposes qBit preference/readback routes for extraction state, can install a PVTKRRX-managed qBit completion hook, and refuses to overwrite a different external qBit completion program silently.
17. The desktop shell still behaved like a single close-only window and clipped the current content:
   - Root cause: the Electron shell had no tray lifecycle, no minimize/hide actions, and the fixed `920 x 660` layout plus popup overflow styling produced the persistent scrollbar.
   - Fix: the desktop window now ships larger, removes the normal scrollbar, exposes `Minimize`, `Send To Tray`, and `Exit App`, and restores cleanly from a real tray menu/click path.

## Still Needs Real-Client Proof

These items should still be treated as open until captured on real clients:

- one extra non-tvOS `LAN Bridge` browse/play pass on Android TV or Android mobile using the latest `1.1.21` desktop build for cross-client parity
- one real public `Remote Seedbox` ready-file playback success on a remote client
- one auth-protected external file-server playback success on a real Stremio client
- long-session playback/performance tuning after qBittorrent download-speed adjustments

## Current Risks

- `LAN Bridge` still depends on the Windows host desktop staying online and heartbeating
- Bonjour may still be missing or stopped on some hosts; that affects discovery/fallback polish, not the core loopback path
- remote/auth-protected playback behavior still depends on what the target Stremio client honors during redirect/auth handoff
- the addon still emits `behaviorHints.sourceContainer = 'rar'` on the experimental native archive path, but official Stremio docs/core do not define that field for archive support
- if a future Stremio client regresses local archive support, the supported fallback already remains: suppress partial multi-volume archives and only advertise extracted direct-play files
- the rewritten homepage still needs a browser/device pass before deploy, so mobile/layout regressions are not ruled out yet

## 2026-03-30 Plan Closure

1. ~~Rework packed RAR playback after the real-device `liberror` result.~~ **Closed 2026-03-30 by capability downgrade.**
   - `npm run smoke:pipeline` and `npm run smoke:playback` passed again on 2026-03-30.
   - The later `/file` `torrent not found` log was traced to `watch-cleanup` deleting the torrent and data after playback, not to an active playback bug.
   - A 2026-03-30 upstream audit confirmed that Stremio archive support is real: `rarUrls` exists in the SDK/core contract, tuple-style `ArchiveUrl` is correct, and archive sources are routed through `rar/create`.
   - The local runtime logs and Stremio-side data on this machine still did not show one captured end-to-end native archive success, so PVTKRRX stopped advertising that path by default instead of continuing to promise it.
   - Supported behavior is now: incomplete multi-volume archives are suppressed or fail fast with a clear message, completed bundles stay hidden until extraction yields a normal direct-play file, and the native archive payload path remains opt-in experimental only for manual testing.
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

1. Browser-check the rewritten homepage locally and fix any desktop/mobile layout regressions before deploy.
2. Deploy the homepage rewrite deliberately so `https://www.pvtkrrx.cc` matches the updated local `public/index.html`.
3. Tune qBittorrent for faster early playback and confirm stream start time improvements on real clients.
4. Keep sports poster/wallpaper review focused on what Stremio clients actually render, not just what the metadata payload contains.
5. Capture one extra Android TV or Android mobile `LAN Bridge` pass for cross-client parity beyond the now-verified Apple TV path.
6. Finish public remote/auth playback sign-off before calling the whole route set fully release-ready.
7. Keep this file updated whenever a real device test changes the truth table.
