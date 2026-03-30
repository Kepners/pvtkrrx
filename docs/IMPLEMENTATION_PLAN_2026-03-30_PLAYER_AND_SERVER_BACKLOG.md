# PVTKRRX Player And Server Backlog

Updated: 2026-03-30

## Purpose

This file captures the next user-requested work for playback UX, archive handling, server settings clarity, and desktop shell polish.

It is intentionally implementation-focused:

- define what needs to change
- define the order to build it
- define what must be proven before calling any item done

## Working Rule

- Do not change behavior based on guesswork. Prove the current failure first with logs, request tracing, or real-client reproduction.
- Do not implement fake labels or fake icons that disagree with the real torrent/file state.
- Do not build a qBittorrent-only extraction path that conflicts with the existing PVTKRRX archive extraction flow.
- Do not close any playback item until it is verified on a real Stremio client, not just with smoke tests.

## Requested Work

### 1. Configure PVTKRRX to configure qBittorrent to unrar completed releases

User intent:
- PVTKRRX should help the server/runtime configure unpacking so packed scene releases do not stay stuck as archive-only playback.

What this really means:
- verify whether qBittorrent exposes a reliable native unpack/unrar capability through the WebUI/API or only through external-program hooks
- if qBittorrent cannot be configured portably for this, keep PVTKRRX as the extraction owner and make that explicit in the UI
- avoid duplicate extraction pipelines fighting each other

Required outcome:
- a configured server should have one clear extraction path
- packed releases should move toward direct-playable video without manual babysitting
- the settings page should explain whether extraction is handled by qBittorrent, PVTKRRX, or both with a strict priority order

Notes:
- the repo already contains host-side archive extraction logic; this must be reused or deliberately superseded, not bypassed accidentally

### 2. Make save-location controls clearer in server settings

User intent:
- it should be obvious where downloads are saving and how to change that location

Required outcome:
- configure UI and desktop shell clearly show:
  - current qBittorrent save path
  - current PVTKRRX-readable storage roots
  - how to change the path
  - what requires admin rights or qBittorrent preference updates
- if the path differs between qBittorrent and local playback roots, the UI must say that plainly

### 3. Resolve the logo/background flash in the AV player for sports and all PVTKRRX sources

User intent:
- when playback is waiting, sports and any PVTKRRX source should look like the TV/movie experience where Stremio flashes the title/logo over a background instead of feeling blank or broken

Required outcome:
- custom PVTKRRX metas consistently provide the fields Stremio actually uses for the waiting/player flash
- sports, library items, and other custom ids get the same quality of branded/player metadata treatment
- where Stremio falls back to Cinemeta-owned metadata, confirm whether addon-side branding can affect the flash; if not, document the client limitation instead of pretending it is solved

### 4. Add a proper downloaded state icon and cleaner source-state labeling

User intent:
- the source row should make it obvious when a file is already downloaded
- one icon should show file/container format
- `Queue and Buffer` should not keep appearing once the item is downloaded or already directly playable

Required outcome:
- source labels separate:
  - downloaded/ready
  - queue and buffer
  - extracting
  - packed archive
  - remote ready-file
- source metadata should also expose file/container detail such as `mp4`, `mkv`, or archive state where that is truthful
- downloaded items should visually read as downloaded immediately in the source list

### 5. Fix skipping/seek behavior so the player does not time out after about 5 seconds

User intent:
- skipping forward/back should work during queue-and-buffer playback instead of timing out and dumping the user out of the player

Required outcome:
- trace what byte ranges Stremio requests when the user seeks
- ensure the local playback path can wait for the requested range instead of failing too early
- prioritize download pieces in a way that supports both start-of-file playback and later seek probes
- stop the current failure where the player waits briefly, times out, and bounces back

### 6. Add proper desktop window controls: minimize, close to system tray, and explicit exit

User intent:
- the desktop app should have clear window actions instead of forcing the current awkward close behavior

Required outcome:
- the desktop shell exposes:
  - minimize window
  - close/hide to system tray
  - explicit exit app
- tray behavior is consistent and obvious:
  - closing the window does not accidentally kill the local server if the intended action is "keep running in tray"
  - exit really shuts the app down cleanly
- the tray menu and any close button copy make the behavior clear

### 7. Make the server window larger and remove the scrollbar

User intent:
- the server window should be big enough that all text fits without the current vertical scrollbar

Required outcome:
- increase the desktop shell window dimensions to fit the current content properly
- remove the current unnecessary scrollbar in the normal desktop state
- if true no-scroll is impossible at some screen sizes, make the layout responsive so the common desktop size shows everything without scrolling
- avoid clipping important controls or log/status text

## Build Order

### Phase 1. Seek/skip timeout root-cause and fix

Why first:
- this is the hardest playback breakage and the one most likely to make the whole experience feel broken even when the download eventually succeeds

Scope:
- instrument `/playback` and `/file` for early seek/range requests
- capture real Stremio behavior for:
  - first play
  - seek after a few seconds
  - seek on a partially downloaded file
- adjust buffering thresholds, range waiting, and piece prioritization based on evidence

Primary areas likely touched:
- `index.js`
- `src/lib/shared.js`
- `src/utils/fileServing.js`
- `scripts/smoke-playback-route.js`

Done means:
- a partially downloaded stream can be sought without the current 5-second timeout bounce on a real client
- smoke coverage exists for the final server contract

### Phase 2. Source-state labels and icons

Why second:
- once playback state is truthful, the stream rows need to reflect that state cleanly

Scope:
- redesign source name/description composition
- add explicit downloaded/ready iconography
- add file/container indicator
- ensure `Queue and Buffer` only appears when the stream is truly in that state

Primary areas likely touched:
- `src/utils/streams.js`
- `src/handlers/stream.js`
- `scripts/smoke-stream-pipeline.js`

Done means:
- completed torrents show as downloaded/ready
- queueing streams show as queue-and-buffer only while incomplete
- labels stay dynamic and route-aware

### Phase 3. AV player flash metadata consistency

Why third:
- once the source state is honest, the waiting/player flash should stop feeling like a second-class path for sports/custom sources

Scope:
- verify which `meta` fields Stremio actually uses during the wait/player flash
- normalize `logo`, `background`, `poster`, and title handling across sports, library, and other custom PVTKRRX ids
- prove whether tt/Cinemeta-backed movie and series pages can carry PVTKRRX-specific flash branding or not

Primary areas likely touched:
- `src/handlers/meta.js`
- `src/handlers/catalog.js`
- `src/clients/sportsdb.js`
- `scripts/smoke-sports-structured.js`

Done means:
- sports/custom sources show the intended player flash assets on a real client
- any remaining client-owned limitation is documented clearly

### Phase 4. Save-location UX cleanup

Why fourth:
- this is a settings-clarity problem rather than a hard playback break, but it directly affects whether the user can fix their own server path issues

Scope:
- show the effective qBittorrent save path prominently
- explain how PVTKRRX resolves local file paths from that save path
- make path changes discoverable in both the configure page and the desktop popup
- clarify any permission/admin implications

Primary areas likely touched:
- `public/configure.html`
- `electron/popup.html`
- local settings routes in `index.js`
- docs/runbooks as needed

Done means:
- a user can see and change the save location without guessing
- the UI no longer hides the path flow behind vague server wording

### Phase 5. Desktop shell controls and tray behavior

Why fifth:
- this is a pure desktop usability issue and should be solved before tuning the final shell layout

Scope:
- add visible controls for minimize, close to tray, and exit
- wire tray behavior so the local server can keep running intentionally
- ensure app shutdown is explicit and clean

Primary areas likely touched:
- `electron/main.js`
- `electron/preload.js`
- `electron/popup.html`

Done means:
- the window can minimize
- the window can hide to tray without killing the server
- the user has an explicit exit action that fully closes the app

### Phase 6. Desktop shell sizing and no-scroll layout

Why sixth:
- once the shell controls are settled, the layout can be resized around the final chrome

Scope:
- enlarge the popup/server window
- remove the normal-state scrollbar
- rebalance spacing/panels so the common desktop layout fits without clipping

Primary areas likely touched:
- `electron/main.js`
- `electron/popup.html`
- desktop sizing/style smoke coverage if added

Done means:
- the common desktop view shows the shell without the current scrollbar
- all main text and controls fit cleanly

### Phase 7. Extraction ownership and qBittorrent unrar integration

Why last:
- this depends on the save-path and playback-path truth being clear first
- it also needs a deliberate decision so qBittorrent and PVTKRRX do not both try to own unpacking

Scope:
- inspect qBittorrent preference/API support for unpack automation on the actual supported target installs
- decide one of:
  - PVTKRRX owns extraction and config merely validates/explains it
  - qBittorrent owns extraction and PVTKRRX configures/validates it
  - hybrid mode with one strict primary owner and one fallback owner
- add UI controls and validation around the chosen model

Primary areas likely touched:
- qBittorrent preference client code
- `public/configure.html`
- `electron/popup.html`
- archive extraction helpers
- setup/provisioning helpers

Done means:
- extraction ownership is unambiguous
- packed releases become direct-playable automatically on supported environments
- the UI says exactly what is happening

## Implementation Checklist

### Item A. Playback seek persistence

1. Reproduce the timeout with logs and captured range requests.
2. Record the exact difference between:
   - first play
   - auto player probe
   - manual seek
3. Update buffering/range logic only after the request pattern is proven.
4. Add smoke coverage for seek-like range requests.
5. Verify on a real Stremio client.

### Item B. Source-state UI contract

1. Define the exact state model:
   - `ready`
   - `queueing`
   - `buffering`
   - `extracting`
   - `packed-ready`
   - `remote-ready`
2. Map each state to:
   - icon
   - name prefix
   - description line
3. Ensure the format/container badge is derived from real file data, not guessed from title text when file data is available.
4. Update stream smoke tests to assert the new labels.

### Item C. Player flash branding

1. Audit all custom `meta` responses.
2. Confirm which fields Stremio actually reads for the wait/player flash on:
   - sports custom ids
   - library custom ids
   - tt/Cinemeta-backed items
3. Normalize metadata generation.
4. Verify on a real client with screenshots/log proof.

### Item D. Save location clarity

1. Surface the effective current save path.
2. Add a clear "change location" path in the UI.
3. Explain any restart/admin requirement.
4. Verify that changing the path also keeps playback path resolution valid.

### Item E. qBittorrent unrar/extraction

1. Prove what qBittorrent can and cannot do on the actual target environment.
2. Decide extraction ownership.
3. Wire the configuration path.
4. Validate extraction success end to end on a real packed release.

### Item F. Desktop tray and exit controls

1. Define the exact desktop window behavior:
   - minimize
   - close to tray
   - explicit exit
2. Add visible shell controls and tray menu actions.
3. Ensure server/runtime shutdown only happens on explicit exit.
4. Verify the app can be restored from the tray reliably.

### Item G. Larger no-scroll desktop shell

1. Measure the current popup content height and overflow behavior.
2. Increase the initial window size to fit the normal desktop content.
3. Remove the default scrollbar in the normal layout.
4. Verify the layout still behaves sensibly on smaller screens.

## Acceptance Criteria

This backlog is complete only when all of the following are true:

- a partially downloaded stream can be skipped/seeked without the current player timeout bounce
- downloaded items display as downloaded/ready and no longer read as `Queue and Buffer`
- file/container format is visible in the stream row
- sports and custom PVTKRRX sources show the intended logo/background/title flash in the player wait state
- the settings UI makes the save location obvious and editable
- the desktop shell has working minimize, tray, and exit controls
- the normal desktop shell no longer shows the current scrollbar and fits the main text cleanly
- extraction/unrar ownership is clear and automated on supported setups

## Documentation To Update When Work Starts

When the implementation begins, update these as the source of truth:

- `docs/PROJECT_STATUS.md`
- `docs/CURRENT_DESIGN.md`
- `README.md`
- any runbook/configure docs touched by save-path or extraction changes

## Current Status

Open.

No code behavior is changed by this file.
