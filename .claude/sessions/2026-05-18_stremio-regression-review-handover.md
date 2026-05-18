# 2026-05-18 Stremio Regression Review Handover

Status: recorded for tomorrow. Do not treat any root cause below as proven yet. The user explicitly asked not to investigate tonight.

## Trigger

After releasing PVTKRRX `1.2.1`, the user retested in Stremio and qBittorrent and reported several live UX/playback failures. Screenshots were provided in chat and should be used as evidence when reproducing.

## Reported Issues

1. Sports poster style selector says `Brutalist`, but Stremio still shows the old ticket-stub/broadcast-looking artwork.
   - Screenshot shows configure UI message: `Server-side admin override active. Selected style: Brutalist.`
   - Stremio sports catalog still displays the familiar red/blue poster style.
   - Need prove whether this is config-token mismatch, server-side override not applied to generated artwork URLs, SportsMeta/PVTKRRX cache reuse, Stremio image cache, entitlement/free-tier lock to `ticket-stub`, or stale installed manifest.

2. Huge delay on the stream/source selection panel.
   - Screenshot shows the Stremio stream list panel on the right stuck with skeleton rows.
   - Need trace `/stream` latency by stage: SportsMeta identity lookup, Prowlarr search, qBittorrent torrents/files/properties/piece states, torrent metadata fetch, and stream sorting.
   - Need add route timing logs before optimizing.

3. Player has no useful loading/download data.
   - Screenshot shows player stuck on poster/artwork with no PVTKRR-visible progress or reason.
   - Recent stream metadata telemetry may only appear in stream descriptions, not player chrome.
   - Need decide what PVTKRR can expose inside Stremio stream names/descriptions, and what must be exposed via PVTKRR logs/diagnostic UI instead.

4. qBittorrent is not obviously downloading the start first.
   - Screenshot shows the qBit piece bar spread across the file while the torrent is downloading.
   - User says it is downloading everything at once, not the start first.
   - Need prove live flags on the exact torrent: `seq_dl`, `f_l_piece_prio`, file `piece_range`, `piece_size`, first contiguous complete pieces, requested range piece priority, and whether the torrent was added before the latest release or re-primed after it.
   - Need inspect whether PVTKRR calls qBit add/prime APIs correctly, whether qBit applies them, and whether existing torrents need explicit repair.

5. Almost full download still does not play.
   - Screenshot shows MLB torrent around `91.1%`, high download speed, ETA under a minute, but Stremio still stuck on poster/artwork.
   - Need prove whether Stremio is requesting `/playback`, redirected to `/file`, receiving `425`, `503`, `206`, or no response.
   - Need capture range headers, response status, `Content-Range`, `X-PVTKRRX-Progress`, and server logs for the exact hash.
   - Need distinguish server/file readiness from Stremio codec/player behavior.

6. PVTKRR-side logs are now a product requirement.
   - User wants to understand what is happening without reading raw server logs.
   - Need design a diagnostic surface that is safe for secrets:
     - request id per stream/playback attempt
     - selected torrent title/hash prefix/file
     - qBit progress/speed/ETA/flags
     - first contiguous readable bytes vs required startup bytes
     - `/playback` decision and `/file` range decisions
     - latest errors and retryable wait states
   - Consider both desktop/local visible logs and server/self-host logs.

7. Stremio developer/debug capability needs research.
   - User asked whether Stremio has a dev function but does not want that researched tonight.
   - Tomorrow: check current Stremio Desktop debug/devtools/log options, Android TV logging options, and whether stream addon metadata can affect the player loading UI.

## Tomorrow Investigation Plan

1. Reproduce against live `1.2.1` with cache-busting where possible.
   - Confirm public Coolify and native self-host are still on `b20acf07bb08538372d86bd1368fd22e1431d4af`.
   - Confirm which install route/user token the Stremio client is using.
   - Reinstall/refresh route manifest if needed, but record whether stale install state was the cause.

2. Poster style path audit.
   - Trace configure style value through config token, manifest behavior hints, catalog meta poster/background URLs, `sportsArtworkProxy`, template normalization, and cache keys.
   - Check whether `PVTKRRX_SPORTS_POSTER_ADMIN_OVERRIDE` or free-tier `ticket-stub` guard overrides the UI-selected `Brutalist`.
   - Check Stremio image caching and whether artwork URLs include a style/version cache key.

3. Stream/source latency audit.
   - Add or temporarily enable structured timing logs around `handleStream`.
   - Measure the slow screenshot case with exact event id/title.
   - Identify the slowest stage before changing code.

4. Playback/qBit sequential proof.
   - For the reported MLB torrent hash from qBit, query qBit Web API state, files, properties, and piece states.
   - Confirm whether `seq_dl=true` and `f_l_piece_prio=false`.
   - Compute first contiguous readable bytes and compare to PVTKRR required startup bytes.
   - If qBit did not apply sequential mode, inspect add payload and prime/repair path.

5. Stuck near-complete playback proof.
   - Capture `/playback` and `/file` server logs for one click.
   - Probe the generated file URL directly with `Range: bytes=0-1048575`.
   - Confirm whether the route serves playable bytes or tells Stremio to wait.

6. Diagnostic UX design.
   - Add low-risk logs first.
   - Then add a user-facing diagnostic endpoint/panel if needed.
   - Keep secrets redacted and hashes shortened in UI.

## Acceptance Criteria

- Changing sports poster style to `Brutalist` visibly changes new Stremio catalog artwork after a documented refresh/cache path, or the UI truthfully says why it cannot.
- Stream selection panel no longer hangs without explanation; route timings identify and reduce the slow path.
- PVTKRR exposes useful download/loading state before and during playback selection.
- New playback torrents are provably head-first: qBit flags and piece state show contiguous start pieces being prioritised.
- If playback is not yet possible, PVTKRR gives a clear retry/wait reason in logs and diagnostics.
- A near-complete torrent either plays or produces exact evidence showing whether the blocker is PVTKRR route logic, qBit piece availability, Stremio player behavior, or codec/container support.

