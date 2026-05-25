# Implementation Plan — Debrid + READY + Next-Ep Prefetch

**Date:** 2026-05-23
**Target release line:** v1.3 → v1.5 (three releases, one coordinated arc)
**Status:** PLAN ONLY — not yet actioned
**Author:** Frank (Claude Code) on request from owner

**2026-05-25 status note:** this plan is historical. The shipped v1.3.1+ routing behavior superseded the early sports-only debrid rule in this document. Current truth: debrid is an optional user-supplied downloader/cache overlay; when configured it sorts above qBittorrent/local streams, but qBittorrent/local streams remain as fallback for sports, movies, and TV. See [POSTERS_AND_DEBRID_WORKLOG_2026-05.md](POSTERS_AND_DEBRID_WORKLOG_2026-05.md).

---

## 1. Scope

Four user-requested features, treated as one architecture pass because they share data flow:

| # | Feature | Release | One-line |
|---|---------|---------|----------|
| 1 | Debrid hosting (RD / AD / Premiumize) — coexist per-install | **v1.3** | User can configure debrid creds alongside qBit. Stream resolution tries debrid cache first, falls back to seedbox. |
| 2 | Real-Debrid cache search | **v1.3** | Subsumed into #1 — cache check is the same plumbing. |
| 3 | READY badge + pin-to-top **inside PVTKRR's stream list** | **v1.4** | Items already playable (local file OR debrid cache hit) sort to the top of PVTKRR's stream array and carry a `✅ READY` prefix. Applies to movies, TV, and sports. |
| 4 | TV next-episode prefetch (N+1 only) | **v1.5** | When user plays S?E?, queue S?E?+1 in the background using whichever backend is configured (debrid or seedbox). |

### Decisions already locked (from popup 2026-05-23)
- **Debrid model:** Coexist per-install. Both qBit and debrid can be configured. Debrid cache wins when hit.
- **READY surface:** Stream-list ordering inside PVTKRR's output (per screenshot). NOT a new catalog. Manifest stays untouched.
- **Prefetch scope:** N+1 only. Stops at season finale.
- **Build order:** Debrid → READY → Prefetch.

### Open TBDs
- **READY visual treatment** beyond the `✅ READY` prefix — needs final wording approval (see §6 Copy).
- **RD cache check workaround** — `/torrents/instantAvailability` was removed by RD mid-2024. Plan defaults to "skip pre-check for RD, add-magnet-and-poll instead" (instant if RD already has it). Confirm acceptable.
- **Prefetch retention policy** — how long do prefetched files linger before cleanup. Default proposal: 7 days unwatched.

---

## 2. Non-negotiables (must not break)

Pulled from `CLAUDE.md`, project memory, and recent feedback:

1. **Bootstrap manifest lock** — `src/config/manifest.js` constants `PUBLIC_BOOTSTRAP_MANIFEST_NAME = "PVTKRR"` and the locked description string MUST NOT change. New work only touches *configured* install manifests, never the bootstrap.
2. **Canonical hostname lock** — `pvt.kepners.co.uk` must never appear in any shipped manifest, logo, install token, or user-facing string. New debrid copy follows the same rule.
3. **Hosted relay never proxies media bytes** — debrid stream URLs go direct from client to debrid provider, same as the existing Comet pattern. Relay only signs/redirects.
4. **Sports posters / SportsMeta boundary** — debrid + READY changes touch the *stream* path, not the meta/catalog/artwork path. SportsMeta-owned routes (`/asset/...`, sport metas) are out of scope.
5. **docs/copy.md is read-only** — any new user-facing copy (READY prefix, debrid config UI labels, error messages) gets added to `copy.md` ONLY when owner explicitly approves. Drafts live in this plan until then.
6. **Contabo systemd must stay current with main** — every release in this arc must rsync the new source to `/opt/pvtkrrx`, bump `REVISION`, restart `pvtkrrx.service` — in addition to Coolify rebuild.
7. **Release parity rule** — main commit, EXE artifacts, GitHub desktop release, GitHub self-host release, live Coolify deployment must all resolve to the same revision before a release is called done.
8. **Reserved port 8766** — debrid work must not bind there (PC Nest Speaker).

---

## 3. Architecture overview

### 3.1 Stream resolution pipeline (post-v1.3)

```
incoming /stream/<type>/<id>.json
  │
  ├─ resolve meta (cinemeta / sportsmeta)
  │
  ├─ search providers (Prowlarr → hash list)
  │
  ├─ for each candidate hash:
  │     ├─ check debrid cache (parallel: RD, AD, PM)
  │     │     hit → emit "⚡ READY (debrid)" stream → DONE
  │     │
  │     ├─ check local file index (existing Library logic)
  │     │     hit → emit "✅ READY (local)" stream → DONE
  │     │
  │     └─ miss → emit lazy stream:
  │             - if qBit configured → existing /playback queue+poll redirect
  │             - else if debrid configured → /playback/debrid add-and-poll redirect
  │             - else → skip
  │
  ├─ sort emitted streams: READY first, then live downloads, then queued
  │
  └─ return to Stremio
```

### 3.2 New modules

```
src/clients/debrid/
  ├─ base.js              # DebridProvider interface + factory
  ├─ realdebrid.js        # RD client
  ├─ alldebrid.js         # AD client
  ├─ premiumize.js        # PM client
  └─ __mock__.js          # in-memory mock for smoke tests

src/utils/
  ├─ debridCache.js       # parallel cache check across configured providers, short-TTL memo
  ├─ readyIndex.js        # unified "is this playable right now?" lookup (local + debrid)
  └─ prefetchQueue.js     # v1.5 — TV N+1 queue + worker

src/handlers/
  ├─ playbackDebrid.js    # /playback/debrid/:token → add-magnet, poll, 302 to direct URL
  └─ (existing stream.js, playback.js modified)

scripts/
  ├─ smoke-debrid.js      # v1.3
  ├─ smoke-ready-order.js # v1.4
  └─ smoke-prefetch.js    # v1.5
```

### 3.3 Config schema (encrypted install config)

Add a `debrid` block. Existing tokens without it MUST round-trip cleanly (treat absence as "no debrid configured").

```jsonc
{
  // ...existing fields (prowlarr, qbit, etc.)
  "debrid": {
    "providers": [
      { "type": "rd", "apiKey": "<encrypted>", "enabled": true },
      { "type": "ad", "apiKey": "<encrypted>", "enabled": false },
      { "type": "pm", "apiKey": "<encrypted>", "enabled": false }
    ],
    "preferOrder": ["rd", "ad", "pm"],
    "preferDebridOverSeedbox": true
  }
}
```

API keys ride the same AES-256-GCM `ENCRYPTION_SECRET` envelope as Prowlarr/qBit creds. Never logged in clear, never echoed in `/configure` after save.

### 3.4 Provider interface

All three providers implement one shape so callers never branch on type:

```js
interface DebridProvider {
  id: 'rd' | 'ad' | 'pm';
  checkCache(infohashes: string[]): Promise<Map<infohash, CacheStatus>>;
  addMagnet(magnet: string): Promise<{ addedId: string }>;
  pollStatus(addedId: string): Promise<{ state, progress, files }>;
  selectFiles(addedId: string, fileIdxs: number[]): Promise<void>;
  getStreamUrl(addedId: string, fileIdx: number): Promise<string>;
  removeMagnet(addedId: string): Promise<void>;
}
```

Per-provider quirks documented inline in each client file.

### 3.5 READY ordering (v1.4)

The change lives in **stream array emission**, not in catalog handlers.

After the stream array is built in `src/handlers/stream.js`:

```js
streams.sort((a, b) => {
  const ar = a._readyRank ?? 99;
  const br = b._readyRank ?? 99;
  if (ar !== br) return ar - br;
  return (b._seeds ?? 0) - (a._seeds ?? 0); // existing tiebreaker
});
```

`_readyRank` values:
- `0` = local file, fully downloaded
- `1` = debrid cache hit (instant)
- `2` = currently downloading >50%
- `3` = queued
- `99` = unknown / lazy

Applies to **every** stream path: movies, TV, sports events. No catalog reshuffle, no manifest change.

### 3.6 Prefetch (v1.5)

Trigger: HTTP Range request hits `/playback` for series ep N (proves playback actually started, not just stream-list browse).

Flow:
1. Stream handler grabs `(seriesId, season, episode)` from the playback token.
2. Compute `(seriesId, season, episode+1)`. Validate via Cinemeta — skip if season finale.
3. Push to `prefetchQueue`. Dedup by `(seriesId, season, episode+1)`.
4. Worker (1 every 30s, capped concurrency 1) runs the same stream resolution pipeline for the next ep, but stops at "queued for download" — no Stremio response, no 302.
5. File lands in the configured backend (debrid cloud OR seedbox disk).
6. Mark `prefetched=true` in local state. Cleanup utility prunes after 7 days unwatched.

End-of-season detection uses `cinemetaClient.getSeries(seriesId).seasons[seasonN].episodeCount`.

---

## 4. Work split — Codex vs Claude Code

**Principle:** Codex does well-specified, mechanical, large-surface scaffolding from API docs. Claude Code does integration into the live codebase, encrypted-config round-trips, hosted-relay safety rules, copy/UX, and release coordination — anywhere a single careless edit could break a paying user.

### 4.1 Codex jobs (heavy lift)

Each is self-contained, well-specified, and testable in isolation. Codex can be given the spec section above plus the provider's official API docs and asked to produce the file end-to-end.

#### CODEX-1: Debrid provider clients (v1.3)
**Files to create:**
- `src/clients/debrid/base.js` — interface + factory + shared retry/auth helpers
- `src/clients/debrid/realdebrid.js` — full RD API client implementing the interface
- `src/clients/debrid/alldebrid.js` — full AD API client
- `src/clients/debrid/premiumize.js` — full PM API client
- `src/clients/debrid/__mock__.js` — in-memory mock with configurable cache hits / poll states

**Spec for Codex:**
- Implement the `DebridProvider` interface defined in §3.4.
- RD: no `instantAvailability` endpoint — `checkCache` returns all-misses unconditionally and documents this in a comment. AD: use `/magnet/instant`. PM: use `/cache/check`.
- All HTTP calls use `globalThis.fetch` (Node 20+), 10s timeout, 2 retries on 5xx, no retry on 4xx.
- Auth: `Authorization: Bearer <apiKey>` for RD/PM, `?apikey=<apiKey>` for AD.
- No logging of API keys, ever. Provider id + endpoint + status code only.
- Export factory: `getDebridProvider(type, apiKey) → DebridProvider`.
- Each client gets a Jest-style unit test file under `scripts/__tests__/debrid/<provider>.test.js` using the mock HTTP layer.

#### CODEX-2: Debrid cache utility (v1.3)
**File:** `src/utils/debridCache.js`
**Spec:**
- Function `checkAllProviders(configuredProviders, infohashes) → Promise<Map<infohash, BestHit>>`.
- Parallel fan-out across configured providers, short-TTL in-memory memo (60s) keyed by hash.
- `BestHit` = `{ providerId, addedId?, fileIdx?, cachedAt }` — null if no provider hit.
- No disk persistence. Memory only.

#### CODEX-3: Debrid smoke test scaffolding (v1.3)
**File:** `scripts/smoke-debrid.js`
**Spec:**
- Mirror the structure of existing `scripts/smoke-*.js` files (read one to match style).
- Cover: cache hit per provider, all-miss fallback, provider precedence respected, config round-trip with debrid block, encrypted apiKey never leaks to stdout, rate-limit handling, revoked-key graceful degradation.
- Use the `__mock__.js` provider, no real HTTP.
- Add `"smoke:debrid": "node scripts/smoke-debrid.js"` to `package.json` scripts.

#### CODEX-4: Ready index skeleton (v1.4)
**File:** `src/utils/readyIndex.js`
**Spec:**
- Single class `ReadyIndex` with: `markLocal(infohash, filepath)`, `markDebrid(infohash, providerId, addedId)`, `getRank(infohash) → 0|1|2|3|99`, `getStream(infohash) → StreamSpec | null`.
- Backing store: in-memory map + disk JSON at `<runtime>/ready-index.json`, debounced writes (1s).
- Hydrate on boot, prune entries older than 30 days unread.
- Pure data structure — no HTTP, no integration with handlers (Claude Code wires it in).

#### CODEX-5: Prefetch queue skeleton (v1.5)
**File:** `src/utils/prefetchQueue.js`
**Spec:**
- Class `PrefetchQueue` with: `enqueue(seriesId, season, episode)`, `start(workerFn)`, `stop()`, `pending() → Array`.
- Dedup by `seriesId:season:episode`.
- Worker tick every 30s, concurrency 1.
- Disk-backed at `<runtime>/prefetch-queue.json` so restarts don't lose pending items.
- Pure data structure — Claude Code wires `workerFn` to the stream resolution pipeline.

---

### 4.2 Claude Code jobs (finesse)

Anywhere the live, nuanced codebase decides what a paying user sees. Small edits, big consequences.

#### CC-A: Config schema migration (v1.3)
- Extend the encrypted install-config schema in `src/config/installConfig.js` (or wherever the live schema lives — verify on read).
- Backward compat: install tokens without `debrid` block deserialize cleanly with `debrid: { providers: [], preferOrder: [], preferDebridOverSeedbox: false }`.
- Round-trip test added to `scripts/smoke-config.js`.

#### CC-B: Configure UI — debrid section (v1.3)
- Add "Debrid providers" section to the `/configure` page (locate the page in `src/web/configure/` or wherever it lives).
- Per-provider: enabled toggle, API key field (password input, masked after save), "Test connection" button that calls a new `/configure/debrid/test` endpoint.
- "Prefer debrid cache over seedbox" toggle.
- Copy draft below (§6).
- Must work identically across PC Local / LAN Bridge / Remote Seedbox / Self-host server routes — the configure page is shared.

#### CC-C: Stream pipeline integration (v1.3 + v1.4)
- Wire `debridCache.checkAllProviders` into `src/handlers/stream.js` ahead of the existing qBit logic.
- Build the `streams.sort((a,b)=>...)` ordering layer (§3.5) — v1.4.
- Add `_readyRank` decoration at every emission site.
- Add `✅ READY` / `⚡ READY` prefixes per copy spec (§6).
- Preserve the existing Comet `/playback` 302 pattern — only the upstream selection changes.

#### CC-D: New `/playback/debrid` handler (v1.3)
- File: `src/handlers/playbackDebrid.js`.
- Mirror existing `playback.js` security model: opaque encrypted state token, rate limit, origin guard.
- Flow: decrypt token → addMagnet → poll until ready (or 30s timeout) → 302 to direct debrid URL.
- Hosted relay rule: this handler MUST NOT proxy bytes. The 302 sends client direct to debrid provider.
- Range support: not needed (debrid handles ranges natively at their CDN).

#### CC-E: Bootstrap + manifest audit (v1.3)
- Run the existing `grep -iE 'kepners\.co\.uk|pvt\.kepners'` audit after every change.
- Verify `PUBLIC_BOOTSTRAP_MANIFEST_NAME` and description constants untouched.
- Add a new smoke assertion: `smoke-debrid.js` must check that adding debrid config does NOT mutate the bootstrap manifest output.

#### CC-F: READY badge integration (v1.4)
- Hydrate `ReadyIndex` on boot from: (a) qBit completed-files API, (b) local Library state, (c) debrid cache check for any known recent searches.
- Hook every stream emission to call `readyIndex.getRank(infohash)`.
- Periodic refresh: every 5 min, re-scan qBit completed list.
- After landing: visual QA against the screenshot the user shared (READY items at top of PVTKRR's slice in the stream picker for at least one movie, one TV ep, one sports event).

#### CC-G: Prefetch wiring (v1.5)
- Wire `prefetchQueue` worker to the stream resolution pipeline.
- Hook the Range request handler in `/playback` to enqueue N+1 on first Range arrival per session.
- Cinemeta lookup for season episode count to gate end-of-season.
- Cleanup utility (cron-style, runs every 6h): prune `prefetched=true` files unwatched for 7 days.
- Disk pressure check: if seedbox <5GB free, skip prefetch enqueue (log warning).

#### CC-H: Smoke test integration (each release)
- `npm run smoke:all` aggregates new suites.
- CI matrix updated where it exists.

#### CC-I: Release coordination (each release)
For v1.3, v1.4, v1.5 each:
1. Bump version in `package.json` + `electron-builder.yml` + any `REVISION`-style file.
2. Push to GitHub `main`.
3. Trigger Coolify rebuild (verify `SOURCE_COMMIT` env on the new container matches HEAD).
4. SSH to `contabo`, rsync `/opt/pvtkrrx`, update `/opt/pvtkrrx/REVISION`, `systemctl restart pvtkrrx.service`.
5. Build Windows EXE: `npm run dist:win`, sign, upload to GitHub release.
6. Tag matched releases: `vX.Y.Z` (desktop) + `vX.Y.Z-selfhost` (self-host).
7. Verify hostname audit: `curl -s https://www.pvtkrrx.cc/manifest.json | grep -iE 'kepners\.co\.uk|pvt\.kepners'` returns nothing.
8. Update `docs/PROJECT_STATUS.md` and `MEMORY.md` with what shipped.

#### CC-J: Doc updates (each release)
- Update `docs/ROUTE_FRAMEWORK.md` to describe debrid as a per-install option, not a new route.
- Update `docs/SPEC.md` and `docs/CURRENT_DESIGN.md` for stream-list ordering rules.
- Add a new `docs/DEBRID_SETUP.md` user guide (Resend-style how-to: where to get an API key for each provider, how to test).
- Add `docs/PREFETCH_BEHAVIOR.md` explaining N+1 prefetch, retention, disk-pressure rules.

---

### 4.3 Why this split

| Pattern | Codex | Claude Code |
|---|---|---|
| Mechanical scaffolding from a public API spec | ✅ | ❌ wasteful |
| Editing live encrypted config that paying users round-trip | ❌ risky | ✅ |
| Provider clients with isolated unit tests | ✅ | ❌ wasteful |
| Touching `src/handlers/stream.js` (the live nerve centre) | ❌ risky | ✅ |
| `/configure` UI shared across 4 install routes | ❌ risky | ✅ |
| Release coordination across Coolify + systemd + EXE | ❌ no context | ✅ |
| Manifest lock audits + canonical hostname guard | ❌ no context | ✅ |
| Stream-array reorder logic (1 small block) | ❌ overkill | ✅ |

---

## 5. Release breakdown

### v1.3 — Debrid coexist + cache search
**Shippable surface:**
- Three debrid providers configurable from `/configure`
- Stream resolution checks debrid cache first
- `⚡ READY (debrid)` prefix on instant-play streams
- `/playback/debrid` add-and-poll endpoint
- New smoke suite `smoke-debrid`

**Codex deliverables:** CODEX-1, CODEX-2, CODEX-3
**Claude Code deliverables:** CC-A, CC-B, CC-C (partial — cache check + prefix only, no full ordering yet), CC-D, CC-E, CC-H (v1.3 slice), CC-I (v1.3 release), CC-J (v1.3 docs)

### v1.4 — READY ordering inside PVTKRR's stream list
**Shippable surface:**
- `ReadyIndex` populated from local + debrid sources
- Stream array sorted by `_readyRank` before return
- `✅ READY (local)` prefix on local-file streams
- Visual QA against the user's screenshot reference

**Codex deliverables:** CODEX-4
**Claude Code deliverables:** CC-C (ordering layer), CC-F, CC-H (v1.4 slice), CC-I (v1.4 release), CC-J (v1.4 docs)

### v1.5 — TV next-ep prefetch
**Shippable surface:**
- N+1 prefetch on playback Range arrival
- End-of-season detection via Cinemeta
- 7-day unwatched cleanup
- Disk-pressure guard

**Codex deliverables:** CODEX-5
**Claude Code deliverables:** CC-G, CC-H (v1.5 slice), CC-I (v1.5 release), CC-J (v1.5 docs)

---

## 6. Copy drafts (DRAFT — not added to docs/copy.md until owner approves)

### Stream name prefixes
- `✅ READY · ` — local file, fully downloaded
- `⚡ READY · ` — debrid cache hit (instant playback)
- `⬇ DOWNLOADING ##% · ` — in progress
- `⏳ QUEUED · ` — waiting

### Stream description additions
- Local file: `Source: PVTKRR Library`
- Debrid hit: `Source: Real-Debrid cache` (substitute provider)
- Queued debrid: `Adding to Real-Debrid… refresh in 30s`

### Configure UI labels
- Section header: `Debrid providers (optional)`
- Subtitle: `Add a debrid service to skip the wait. PVTKRR will check your debrid cache before queueing a download.`
- Per-provider rows: `Real-Debrid`, `AllDebrid`, `Premiumize` + `API key` + `Test connection` button
- Prefer toggle: `Prefer debrid over seedbox when both are available`

### Error messages
- Bad API key: `That key didn't work. Check it at <provider>.com and try again.`
- Provider down: `<Provider> is unreachable right now — falling back to your seedbox.`
- All providers exhausted, no seedbox: `No streams available. Configure a seedbox or fix your debrid keys.`

---

## 7. Risks + open questions

| Risk | Mitigation |
|---|---|
| RD cache check removal means RD users get slower instant-play vs AD/PM | Document clearly. Add-magnet-and-poll is still ~2-5s for RD-cached items. |
| Debrid creds in install tokens enlarge the URL beyond Stremio's tolerance | Test token length per provider config size. May need to switch to admin-token + server-side store for self-host. |
| Hosted relay accidentally proxying debrid bytes | Smoke test asserts `/playback/debrid` always 302s, never streams body. |
| `/configure` page shared across 4 install routes — easy to break PC Local while fixing Remote Seedbox | Manual QA matrix per release. Existing smoke suites cover the routes. |
| Prefetch hammers Cinemeta with episode-count lookups | TTL cache (24h) for series structure. |
| Prefetch fills seedbox disk silently | Disk-pressure guard at 5GB free; warning to admin email if configured. |
| READY ordering interacts with Stremio's own stream sorting | Empirically Stremio respects addon-supplied order within an addon's slice. Verify after v1.4 with the user's screenshot scenario. |

---

## 8. Acceptance criteria per release

### v1.3 acceptance
- [ ] All three provider clients pass their unit tests
- [ ] `npm run smoke:debrid` passes
- [ ] `/configure` accepts and saves debrid keys; reload shows keys still active (masked)
- [ ] A movie with a known-cached hash on RD emits a `⚡ READY` stream that plays in <3s
- [ ] An install with zero debrid config behaves identically to v1.2 (zero regression)
- [ ] `curl https://www.pvtkrrx.cc/manifest.json` shows the locked bootstrap, no hostname leaks
- [ ] All five release surfaces (main, EXE, GitHub desktop tag, GitHub self-host tag, Coolify) resolve to the same commit

### v1.4 acceptance
- [ ] Open the user's screenshot scenario in Stremio: READY items appear above non-ready PVTKRR streams
- [ ] Same behavior verified on a sports event meta
- [ ] Same behavior verified on a TV episode meta
- [ ] `npm run smoke:ready-order` passes
- [ ] Release surfaces aligned

### v1.5 acceptance
- [ ] Play a TV episode → within 60s, `prefetch-queue.json` shows N+1 entry
- [ ] N+1 becomes available (READY) without user action
- [ ] Season finale: no prefetch enqueued
- [ ] 7-day-old prefetched file with no playback: cleanup removes it
- [ ] `npm run smoke:prefetch` passes
- [ ] Release surfaces aligned

---

## 9. Out of scope (explicit non-goals)

- Debrid as the ONLY backend (we picked coexist, not replace)
- A dedicated "Ready to Watch" catalog (we picked stream-list ordering)
- N+2 / whole-season prefetch
- Smart adaptive prefetch
- New install route in `docs/ROUTE_FRAMEWORK.md` (debrid is an *option* per existing route, not a new route)
- Changes to SportsMeta, sports posters, or sports artwork pipeline
- Stremio addon SDK upgrades
- Billing/licensing (still disabled per existing rule)

---

## 10. v1.3 Final Lock — 2026-05-23

The sections above (§1-§9) were the initial draft. After research and clarification on 2026-05-23, the v1.3 scope was refined materially. **This section §10 is the authoritative v1.3 spec.** Where §1-§9 differ, §10 wins.

### 10.1 Verified provider/service truth table

| Service | Role | Cache check | Torrent | NZB | Auth | Notes |
|---|---|---|---|---|---|---|
| **Real-Debrid** | DebridProvider (download) | ❌ removed mid-2024 | ✅ | ❌ | Bearer | **May 2026 filter** (error_code 35) breaks WEB-DL/scene releases. Mitigation: filename sanitizer strips known keywords from magnet `dn=` before submission. Partial fix only. |
| **AllDebrid** | DebridProvider (download) | ❌ never existed | ✅ | ❌ | Bearer | As of 2025-01-15: no `agent` / `version` params required. Magnet status moved to `/v4.1/`. Files come as hierarchical tree, must flatten. |
| **Premiumize** | DebridProvider + CacheSearchSource | ✅ `/cache/check` | ✅ | ✅ | Bearer | **Only service with working cache check.** NZB via `/transfer/create` (sparsely documented but confirmed). |
| **Put.io** | CacheSearchSource **only** (not a download backend) | n/a | n/a | n/a | Bearer (personal app token from `app.put.io/oauth`) | Searches user's account + friend-shared files via `/files/search`. No download/transfer integration. |

**v1.3 does NOT include:**
- TorBox (no verified API docs accessible — deferred to v1.4)
- Local SABnzbd/NZBGet integration (different architecture class — deferred to v1.4)

### 10.2 Two-interface architecture

`DebridProvider` and `CacheSearchSource` are now separate interfaces (not one mega-interface). Premiumize implements both. Put.io implements only `CacheSearchSource`. RD/AD implement only `DebridProvider`. Full interface spec in [docs/CODEX_BRIEF_V1.3_DEBRID.md](CODEX_BRIEF_V1.3_DEBRID.md) §4.

### 10.3 Stream routing rules (Claude Code integration — CC-C revised)

Shipped v1.3.1+ behavior superseded the initial routing rule here:
1. **All content:** sports, movies, and TV keep qBittorrent/local fallback streams where available. Debrid is ordered first only when configured.
2. **Debrid-first means ordered first, not exclusive:** qBit/local remains the backup when debrid exists, not removed.

Pipeline order in `src/handlers/stream.js`:

```
For sports meta:
  1. searchAllSources(cacheSearch) → READY hits if any → emit
  2. For each Prowlarr result hash:
       - try debrid cache (PM /cache/check)
       - if hit: emit ⚡ READY stream
       - if miss AND user has debrid configured: emit lazy /playback/debrid stream (add-and-poll)
       - if NO debrid configured: skip this hash entirely (do NOT fall back to qBit)
  3. Sort: READY first, then debrid-pending

For movies/TV meta:
  1. searchAllSources(cacheSearch) → READY hits if any → emit
  2. For each Prowlarr result hash:
       - try debrid cache (PM /cache/check)
       - if hit: emit ⚡ READY stream
       - if miss AND user has debrid: emit lazy /playback/debrid (add-and-poll)
       - if miss AND only qBit: emit lazy /playback/qbit (existing flow)
  3. Sort: READY first, then debrid-pending, then qBit-pending
```

### 10.4 RD filename sanitizer

New utility `src/utils/rdFilenameSanitizer.js`. Runs inside `realdebrid.addMagnet` (not opt-in). Strips keyword list (WEB-DL, WEBRip, AMZN, NF, CR, ATVP, DSNP, MAX, HMAX, HBO, HULU, YTS, RARBG, FGT, NTb, EVO, GHOST, MeGusta, AFG, NIIN, TGx, GalaxyRG, AOC, PSA, ETHEL, FLUX, EDITH, FraMeSToR, CMRG) from magnet `dn=` parameter. Uses word-boundary regex to avoid false positives. Falls back to `"file"` if name becomes empty.

This is a **partial mitigation** for the May 2026 RD filter, not a guaranteed bypass. The filter also scans internal file paths in torrent metadata, which PVTKRR cannot modify. Document this clearly in the Configure UI copy.

### 10.5 Newznab indexer support

New adapter `src/clients/prowlarr/newznab.js`. Extends the existing Prowlarr client (Claude Code wires it in — Codex only creates the module). Detects `application/x-nzb` enclosure / `.nzb` link / `<newznab:attr name="usenetdate">` to classify each Prowlarr result as `torrent` or `usenet`. Normalizes both into a single `NormalizedSearchResult` shape with `protocol`, `sourceUrl`, optional `infohash`.

Stream pipeline routes:
- `protocol === 'torrent'` → existing magnet flow (debrid or qBit)
- `protocol === 'usenet'` → `addNzb()` on PM only (or future TorBox in v1.4). RD/AD throw `UnsupportedCapabilityError` — caller skips.

No new indexer software to install — users configure NZB indexers in their existing Prowlarr the same way they configure Torznab today.

### 10.6 Codex job list — final

| Job | What | File(s) |
|---|---|---|
| CODEX-1 | DebridProvider interface + factory + shared HTTP + sanitizer wiring point | `src/clients/debrid/base.js` |
| CODEX-2 | Three DebridProvider implementations (RD with sanitizer, AD, PM with NZB) | `src/clients/debrid/{realdebrid,alldebrid,premiumize}.js` |
| CODEX-3 | DebridProvider mock | `src/clients/debrid/__mock__.js` |
| CODEX-4 | CacheSearchSource interface + factory | `src/clients/cacheSearch/base.js` |
| CODEX-5 | Two CacheSearchSource implementations (put.io, PM) | `src/clients/cacheSearch/{putio,premiumize}.js` |
| CODEX-6 | CacheSearchSource mock | `src/clients/cacheSearch/__mock__.js` |
| CODEX-7 | RD filename sanitizer utility | `src/utils/rdFilenameSanitizer.js` |
| CODEX-8 | Parallel cache search utility | `src/utils/debridCache.js` |
| CODEX-9 | Newznab indexer adapter | `src/clients/prowlarr/newznab.js` |
| CODEX-10 | Smoke + unit tests | `scripts/smoke-debrid.js`, `scripts/smoke-rd-sanitizer.js`, `scripts/__tests__/**/*.test.js` |

All in one Codex pass, per [docs/CODEX_BRIEF_V1.3_DEBRID.md](CODEX_BRIEF_V1.3_DEBRID.md).

### 10.7 Claude Code job list — final (revised from §4.2)

Same as §4.2 plus:
- **CC-C revised:** shipped behavior is debrid-first when configured with qBit/local fallback preserved for sports, movies, and TV
- **CC-D revised:** `/playback/debrid` handles both magnet and NZB tokens (route by token-embedded protocol field)
- **CC-J revised:** add `docs/DEBRID_SETUP.md` covers put.io token generation (`app.put.io/oauth`), RD filter warning, NZB indexer setup in Prowlarr

### 10.8 v1.4 queued (NOT in v1.3)

- TorBox as a 4th DebridProvider (native NZB support + cache check) — research API docs first
- Local SABnzbd/NZBGet client for users with paid Usenet but no debrid (parallel to qBit, but for NZB)
- READY ordering layer (was already planned for v1.4)

### 10.9 v1.5+ queued (NOT in v1.3 or v1.4)

- TV next-ep N+1 prefetch (was already v1.5)
- Search agent / catalog enrichment (open — clarified as "Usenet indexer search" which is folded into v1.3 via Newznab/Prowlarr, so this slot is now free)

### 10.10 What changed from §1-§9

| Section | Original | Locked (§10) |
|---|---|---|
| Provider count | 3 (RD/AD/PM) | 4 services across 2 interfaces (+put.io as search-only, +PM in both roles) |
| Interface design | Single `DebridProvider` with `checkCache` method | Split: `DebridProvider` + `CacheSearchSource` |
| AD cache check | `/magnet/instant` assumed available | AD has NO cache check — always all-miss |
| RD filter handling | Not addressed | RD filename sanitizer mitigates May 2026 filter (partial) |
| Usenet support | Out of scope for v1.3 | In scope: PM via `addNzb`, Prowlarr Newznab adapter |
| Sports routing | Implicit (same as movies/TV) | **Shipped correction: sports keeps qBit/local fallback; debrid is first only when configured** |
| Default routing | Implicit (debrid coexists with qBit) | **Explicit: debrid first, qBit fallback** |
| TorBox | Not mentioned | Considered, deferred to v1.4 (API docs blocked) |
