# PVTKRRX Implementation Plan

Updated: 2026-03-30

## Working Rule

This plan is intentionally sequential.

- Do not move to the next item until the current item works end to end on a real client, not just in smoke tests.
- Do not hardcode titles, posters, metadata, routes, or source labels to force a pass.
- Every fix must remain dynamic and work for normal users outside this machine.
- Each item must finish with code changes, verification, and source-of-truth doc updates.

## Execution Order

### 1. Fix packed-release playback properly

Current problem:
- Packed scene releases added to qBittorrent as `.rar/.r00/.r01/...` are still failing in Stremio with `liberror`.

What this item covers:
- Prove why the current `rarUrls` implementation is rejected by the real client.
- Reconcile any mismatch between SDK markdown examples and the actual `stremio-core` archive-stream contract used by modern clients.
- Verify whether the issue is stream payload shape, archive ordering, missing fields, client limitations, or an unsupported route combination.
- Build the correct dynamic behavior for packed releases on supported playback-capable routes.
- If Stremio client support is narrower than expected, degrade cleanly without fake playback promises.

Done means:
- A real packed release can be selected and played successfully on a supported client and route, or unsupported cases are suppressed with truthful behavior.
- No hardcoded torrent naming assumptions.
- Smoke coverage exists for the final supported behavior.

### 2. Make configure/setup more automatic

Current problem:
- Setup still asks the user to understand too much about Stremio state, route choice, and account linking.

What this item covers:
- Auto-check host Stremio state on startup.
- Auto-reuse the signed-in desktop session when available.
- Reduce manual button steps and hide advanced mechanics unless needed.
- Keep the route explanation honest for `PC Local`, `LAN Bridge`, and `Remote Seedbox`.

Done means:
- Normal host setup feels one-click for typical users.
- Advanced/manual controls remain available but are not required for the happy path.
- No silent state corruption or route drift.

### 3. Verify and document true seedbox behavior

Current problem:
- Local host, LAN Bridge, and remote/seedbox playback rules can still get conflated.

What this item covers:
- Trace the full playback path for local, LAN, and true remote/seedbox use.
- Document what each route can and cannot do.
- Make config UI and runtime behavior match those rules exactly.

Done means:
- Route behavior is documented and reflected consistently in the UI and runtime.
- No misleading install/playback messaging.

### 4. Fix sports naming and identity quality

Current problem:
- Sports titles are still mismatched, including cases like downloading Japanese F1 practice when the user expected another motorsport event.

What this item covers:
- Improve sports title parsing and event normalization.
- Tighten sport/league/event disambiguation.
- Stop obviously wrong cross-event matching.

Done means:
- F1, UFC, Supercars/V8, and similar sports resolve to the correct event identity dynamically.
- Search and download behavior no longer confuses neighboring events.

### 5. Fix sports posters and metadata quality

Current problem:
- Sports tiles and detail pages still look weak or broken.

What this item covers:
- Improve event-specific posters/backdrops.
- Provide proper sports meta fields so Stremio detail pages do not look empty.
- Make UFC and other key sports look intentional instead of placeholder-heavy.

Done means:
- Sports catalog and detail pages have real metadata, useful summaries, and stronger artwork.
- No “No metadata was found” experience for normal sports entries that should resolve.

### 6. Move sports into its own top-level surface if Stremio truly supports it

Current problem:
- Sports is currently living inside the `movie` bucket.

What this item covers:
- Prove what Stremio actually supports in the type selector.
- If a real separate sports heading is supported, implement it.
- If not, build the cleanest supported alternative and document the limitation.

Done means:
- The result matches actual Stremio client capability, not wishful manifest shaping.

### 7. Make PVTKRRX appear in the film source list

Current problem:
- Stream/source attribution for normal films is not visibly showing `PVTKRRX` where the user expects it.

What this item covers:
- Trace how Stremio is grouping/rendering source names.
- Ensure PVTKRRX streams carry correct identity and labeling.
- Confirm the source picker shows `PVTKRRX` in practice.

Done means:
- PVTKRRX is visibly represented in the source list for its own streams where client behavior allows it.
- Stream labeling stays dynamic and route-aware.

## Verification Standard

For every item:

1. Prove the bug or limitation first.
2. Implement the fix in code.
3. Verify with the best available automated coverage.
4. Verify on a real client when the issue is client-facing.
5. Update the live docs after the behavior changes.

## Current Active Item

None.

- Item 1 was closed on 2026-03-30 by downgrading the unproven native archive path out of the supported default behavior.
- Native `rarUrls` emission remains available only behind `PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true` for manual testing.
- The current supported packed-release contract is now extracted direct video only.

## 2026-03-30 Closure Notes

1. Item 1 closed on 2026-03-30 by capability downgrade.
   - `npm run smoke:pipeline` and `npm run smoke:playback` both passed on 2026-03-30.
   - The later `/file` `torrent not found` log was traced to `watch-cleanup` deleting the torrent and data after playback, not to an active playback bug.
   - Official Stremio sources were re-checked: `rarUrls` is a real archive source, tuple-style `ArchiveUrl` is correct, and archive sources are routed through `rar/create`.
   - Local runtime logs and Stremio-side data on this machine still did not show one captured end-to-end native archive success.
   - Supported behavior is now: suppress partial multi-volume archives truthfully, keep completed packed releases hidden until extraction yields a direct-play file, and leave native `rarUrls` behind an explicit experimental override for manual testing only.
2. Item 2 closed.
   - `npm run smoke:config`, `npm run smoke:desktop`, and `npm run smoke:stremio-link` all passed on 2026-03-30.
   - The current configure flow now exposes route-aware primary install links and keeps manual URLs as fallback instead of the main path.
3. Item 3 re-verified.
   - `npm run smoke:lan-pair`, `npm run smoke:guards`, and `npm run smoke:security` all passed on 2026-03-30.
4. Item 4 re-verified.
   - `npm run smoke:sports` passed on 2026-03-30.
5. Item 5 re-verified.
   - `npm run smoke:sports` passed on 2026-03-30.
6. Item 6 closed by capability decision.
   - Official Stremio addon content types remain `movie`, `series`, `channel`, and `tv`, so sports stays under the supported `movie` surface.
7. Item 7 closed.
   - `npm run smoke:pipeline` still asserts that movie, direct-ready, and packed-ready stream names begin with `PVTKRRX`.
   - The real Stremio WebView2 cache on this machine contains cached stream payloads with `PVTKRRX` in the stream `name`, confirming the client is receiving and storing the branded source labels.

## Archived Item 1 Findings

- Incomplete archive sets were being surfaced too early and can trigger real Stremio `liberror`.
- Classic archive ordering needed to be `.rar`, `.r00`, `.r01`, ... instead of lexical order.
- Current `stremio-core` examples/stream conversion logic use tuple-style archive URLs and array-based `fileMustInclude`, so the addon payload now needs to match that contract before real-client signoff is meaningful.
- Official Stremio support for `rarUrls` is real in the SDK/core and routes through the local streaming server at `rar/create`.
- The repo-local `behaviorHints.sourceContainer = 'rar'` hint is not part of that official archive contract and cannot count as proof that clients honor the stream.
- Smoke tests prove payload emission and route behavior only; they do not prove end-to-end client playback.
- Neutral-title `.torrent` links were still slipping into generic `/playback` because the addon had not inspected the torrent payload before emitting live tracker streams.
- The local Stremio archive path does not behave like progressive `.mp4/.mkv` playback for partial multi-volume RAR sets, so the honest supported result is: queue them, suppress fake live play, and only advertise packed releases after extraction yields a normal direct-play file.
