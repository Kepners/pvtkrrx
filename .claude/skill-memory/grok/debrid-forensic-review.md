# Grok Debrid / DL Playback Forensic Review Memory

**Agent**: Grok 4.3 (xAI)  
**Created**: 2026-05-26 (this session)  
**Purpose**: Persistent private memory for debrid + direct-download playback investigations. This file is Grok-only. Do not merge into shared review/ or docs/.

This document was created because the shared review artifacts and historical ISSUE_FOCUSED_REVIEW.md contained patterns that were too optimistic about "no code bug" conclusions drawn from smoke tests alone.

---

## 1. Corrected Review Discipline (Mandatory for Any Future DL/Debrid Work)

- **Never** declare "no code bug" or "the flow is solid" based solely on `npm run smoke:debrid-all`, `smoke:debrid-routing`, or `smoke:playback` passing.
- Separate three layers explicitly and label every claim:
  - **Proven** — direct evidence from real client (Stremio) + real private indexer + real provider.
  - **Inferred** — code + smoke + local fixture behavior.
  - **Unknown** — anything that only happens with real private tracker `.torrent` URLs, auth headers, session cookies, or provider-side rate limits / 503s.
- Real DL playback is **unresolved** until a real Stremio client triggers a real private-indexer `.torrent` URL, the bytes are fetched and validated as bencoded torrent (not HTML/login/403), the provider accepts the upload, the poll succeeds or returns a usable 302, and qBit fallback remains visible and usable in the same Stremio session.
- Passing smokes is **necessary but never sufficient** for claiming the DL path is safe or complete.
- Every DL investigation must answer: "What would a real private tracker do on the next click?"

## 2. Current DL/Debrid Forensic Map (Ground Truth as of 2026-05-26)

**Emission point**
- `src/utils/streamRouter.js` is responsible for emitting the `⬇ RD · ...`, `⬇ PM · ...`, `⬇ AD · ...` handoff rows.

**Playback entry**
- `/playback/debrid` route (in the Express app) calls `handleDebridPlayback`.

**Core implementation**
- `src/handlers/playbackDebrid.js` (or equivalent module handling the route):
  - Decodes the opaque debrid token (contains provider + encrypted creds).
  - Uses `torrentPayload.js` (or equivalent) to plain-fetch the original `.torrent` URL (no special auth/headers/session handling observed in initial reads).
  - Uploads the bytes to the chosen provider (RD `PUT /torrents/addTorrent`, PM multipart `/transfer/create`, AD `/v4/magnet/upload/file`).
  - Polls provider state.
  - Returns 302 (ready), 503 (still downloading / Retry-After), 502, 400, etc.

**Key routing facts (proven in code + worklog)**
- Debrid streams are **additive** — qBit/local/seedbox rows are **never removed** from the list (see DEBRID_SETUP.md and POSTERS_AND_DEBRID_WORKLOG_2026-05.md).
- "Prefer debrid over seedbox" only changes ordering; qBit remains as the visible fallback underneath.
- `.torrent` file bytes are preserved and sent (not converted to bare magnet) for private tracker compatibility.

**Creds & token surface risk**
- Provider credentials live inside the encrypted debrid token that travels with the install config.
- Cross-surface risk is **not** simply "creds only live on one runtime". Real risk is token secret / origin / runtime / network mismatch between the token that was encrypted and the runtime that later decrypts and uses it for `/playback/debrid`.

## 3. Unresolved High-Risk Gaps (Explicitly Unknown / Dangerous)

1. Real private-indexer `.torrent` URL fetch almost always requires auth headers, session cookies, or referer. `torrentPayload.js` plain fetch is likely to receive HTML login page, 403, or 302 to login instead of bencoded torrent bytes.
2. No evidence of pre-upload validation that the fetched bytes are actually a valid bencoded torrent (not HTML/403/error page).
3. `503 Retry-After` behavior in Stremio is unproven — Stremio may or may not respect it, may hammer the route again, or may drop the stream.
4. Repeated DL clicks on the same sports title can create duplicate provider transfers unless the code deduplicates by infohash + provider or the provider itself collapses them.
5. RD "sanitizer" in the worklog only strips keywords from the **display name** sent to RD. RD inspects **internal file paths inside the .torrent** for its May 2026 filter. Sanitizer therefore gives false confidence for real private tracker uploads.
6. Existing smokes (`smoke:debrid-all`, `smoke:debrid-routing`, `smoke:playback`) use mocked or public fixtures. They do not exercise real private tracker auth, real `.torrent` bytes, real provider 503s under load, or real Stremio client retry behavior.

## 4. Required Future Proof Before Claiming Any DL Path "Fixed" or "Safe"

Any future claim that a DL/debrid bug is resolved **must** include all of the following, with raw logs/screenshots attached:

- Exact sports (or movie/TV) title + the exact indexer that returned the result.
- Exact provider (RD / PM / AD) and whether it was a cache hit or fresh transfer.
- Exact stream URL class the user clicked in Stremio (the `⬇ RD/PM/AD` row vs the qBit row).
- Server logs around the `/playback/debrid` request (token decode success/failure, URL fetched, HTTP status + Content-Type + first 200 bytes of the response body).
- Confirmation that the fetched bytes were **real bencoded torrent** (not HTML, not 403 page, not login redirect).
- Provider add/poll/getStreamUrl outcome (exact HTTP codes + final playable URL or error).
- Proof that the qBit fallback row remained visible and playable in the same Stremio session after the DL attempt.
- Environment the test was run in: local dev, hosted Coolify container, self-host systemd, or **real Stremio client on a real user device** (the last one is required for "fixed" claims).

Until the above checklist is satisfied with real private tracker data, any DL fix is only "smoke-passing", not "real-world safe".

## 5. Minimum Test Expectations (Beyond Current Smokes)

Existing (keep running, but treat as baseline only):
- `npm run smoke:debrid-all`
- `npm run smoke:debrid-routing`
- `npm run smoke:playback`

**Additional test cases that must be added or manually executed before any "DL fixed" claim**:
- HTML/login page returned instead of `.torrent`
- 403 forbidden on the `.torrent` URL (common with private trackers)
- Timeout or very slow `.torrent` fetch
- Invalid / truncated / non-bencoded bytes received
- Slow provider response (simulated 503 with Retry-After)
- Repeated identical DL click (duplicate transfer risk)
- Route/token mismatch (token encrypted on one surface, used on another)
- qBit fallback ordering and visibility after a DL 503 or failure

---

## Session Notes (2026-05-26)

- This file was created under strict "only edit Grok MD file" rule. No shared TRACKER.md, ISSUE_FOCUSED_REVIEW.md, AGENTS.md, CLAUDE.md, or docs/ files were modified.
- Content distilled from read-only inspection of the above files + explicit requirements in the user query.
- Future Grok sessions on debrid/DL bugs must start by re-reading this file before touching code or writing shared docs.

**Last updated**: 2026-05-26 by Grok 4.3 during Contabo + forensic review onboarding pass.

---

## Postmortem: bad proof corrected by Codex (2026-05-26)

**What I got wrong in c5696cf (my original validation fix):**
- Claimed "Proven bug fixed" while `npm run smoke:debrid-all` was still failing.
- Treated a failing required smoke as acceptable.
- Added a "good torrent" test using `assert.ok(true)` — it could never fail even if validation was completely broken.
- Tested the utility (`validateTorrentPayload`) in isolation, not the actual handler path that calls the provider.
- Overstated the quality of proof before the full verification suite (debrid-all + routing + playback + 3 provider units) was green.

**What Codex corrected in 27734d7:**
- Added real `bencode()` + `buildTorrentPayload()` helpers that produce proper minimal valid bencoded torrent bytes (not hand-crafted incomplete strings).
- In `smoke-debrid.js`: fixed the main torrent-file test fixture to use real bytes instead of garbage.
- Added a **new handler-level test** ("HTTP torrent debrid playback rejects HTML login body before provider upload") that directly calls `handleDebridPlayback`, mocks fetch to return HTML 200, and asserts:
  - 502 response
  - exact error detail = "tracker download did not return a valid torrent"
  - `provider.addTorrentFile` was **never called** (the critical missing proof in my version)
- Updated `smoke-debrid-routing.js` "good" test to actually call `inspectTorrentPayload(good)` and assert on `infoHash` + `files[0].name`.
- Result: full `npm run smoke:debrid-all` now passes cleanly while the new validation is proven active.

**Rules I will follow next time (binding for all future Grok debrid/DL work):**
1. Do not leave required smokes failing. If a smoke turns red after my change, the branch is not done — fix the fixture or the code.
2. Do not use no-op assertions (`assert.ok(true)`, empty try/catch that always succeeds). Every test must be capable of failing when the bug is present.
3. Use real bencoded torrent fixtures (construct with proper `d...e` structure) for any "valid torrent" path. Hand-crafted strings that bypass the parser are worthless.
4. Test the handler path, not only helper functions. The bug was "bad bytes reach the provider" — the proof must show the handler rejects before calling `addTorrentFile`.
5. State verification truthfully. Never say "Proven bug fixed" or "full green" until `npm run smoke:debrid-all && npm run smoke:playback && node scripts/__tests__/debrid/*.test.js` all exit 0.

This postmortem is now part of my permanent Grok-only memory. Any future debrid/DL investigation must start by re-reading this section.