# Implementation Programme - PVTKRRX

> **Version:** 1.0
> **Date:** February 8, 2026
> **Author:** Peter (Production)
> **Status:** APPROVED — Prestart Meeting February 8, 2026

---

## Executive Summary

PVTKRRX is built in 5 phases following the clockrr pattern (Express + stremio-addon-sdk hybrid on Vercel). Phase 0 lays the foundation (project scaffold, encryption, manifest). Phases 1-2 build the core clients and handlers. Phase 3 integrates everything into the Express/SDK entry point with the config page. Phase 4 is deploy and verify. Sports catalog is prioritised throughout per MD Directive #1.

---

## Phase 0: Foundation (Half Day)

**Goal:** Project scaffold, encryption, manifest — the skeleton everything else hangs on.

| Task | Description | Depends On | Deliverable |
|------|-------------|------------|-------------|
| 0.1 | `package.json` — 3 deps: stremio-addon-sdk, express, fast-xml-parser | None | package.json |
| 0.2 | `npm install` — lock dependencies | 0.1 | package-lock.json |
| 0.3 | `vercel.json` — catch-all to index.js | None | vercel.json |
| 0.4 | `src/utils/crypto.js` — AES-256-GCM encrypt/decrypt, SHA-256 key derivation from ENCRYPTION_SECRET | None | crypto.js |
| 0.5 | `src/config/manifest.js` — Stremio manifest with 4 catalogs (sports, movies, TV, library), configurable + configurationRequired. Sports catalog MUST declare `extra` with genre options (Football, F1, UFC, NBA, Cricket, Rugby, Tennis), search, and skip fields. | None | manifest.js |
| 0.6 | `src/config/categories.js` — Torznab category constants (5060 sports, 2000 movies, 5000 TV, etc.) | None | categories.js |
| 0.7 | `src/config/providers.js` — Seedbox provider presets (Feral, Ultra, Whatbox paths) | None | providers.js |

**Checkpoint:** `node -e "require('./src/utils/crypto')"` works, manifest exports valid JSON.

---

## Phase 1: API Clients (1 Day)

**Goal:** All three external API clients working independently. Can search Jackett, login to qBit, resolve Cinemeta.

| Task | Description | Depends On | Deliverable |
|------|-------------|------------|-------------|
| 1.1 | `src/clients/torznab.js` — TorznabClient: search(query, cats), searchImdb(imdbId, cats), rss(cats), caps(). Uses fetch + fast-xml-parser. TWO timeout mechanisms: (1) `&timeout=6` query param on every Torznab call (tells Jackett to stop searching after 6s), (2) AbortController at 7s (kills fetch if Jackett doesn't respond). Parses `<item>` → `{title, link, size, seeders, infohash, category, pubDate}`. | 0.6 (categories) | torznab.js |
| 1.2 | `src/clients/qbittorrent.js` — QBitClient: login(), torrents(filter), files(hash), add(magnetOrUrl). Login-per-request pattern. Cookie extraction from Set-Cookie header. AbortController at 5s. | None | qbittorrent.js |
| 1.3 | `src/clients/cinemeta.js` — CinemetaClient: getMovie(imdbId), getSeries(imdbId). Simple fetch to `https://v3-cinemeta.strem.io/meta/{type}/{id}.json`. AbortController at 3s. | None | cinemeta.js |

**Checkpoint:** Unit-test each client against real endpoints. TorznabClient returns parsed results, QBitClient lists torrents, CinemetaClient resolves an IMDb ID.

---

## Phase 2: Utilities & Handlers (1 Day)

**Goal:** All handler logic complete. Given config + request params, each handler returns the correct Stremio response.

| Task | Description | Depends On | Deliverable |
|------|-------------|------------|-------------|
| 2.1 | `src/utils/parser.js` — Parse torrent names: quality (2160p/1080p/720p), codec (x265/x264/AV1), audio (Atmos/DTS-HD/DD5.1), source (BluRay/WEB-DL/HDTV), HDR, REMUX detection. Regex-based. | None | parser.js |
| 2.2 | `src/utils/pathMapper.js` — Map qBit save path to HTTP file server URL using config.pathMapping {from, to}. | None | pathMapper.js |
| 2.3 | `src/utils/streams.js` — Build Stremio stream objects. Two patterns: (A) On-seedbox with direct URL + proxyHeaders + bingeGroup + filename + videoSize, (B) On-tracker with /playback URL + filename. Sort: on-seedbox first, then by seeders desc. | 2.1, 2.2 | streams.js |
| 2.4 | `src/handlers/catalog.js` — Sports: TorznabClient.rss(5060) → parse → return metas with pvtkrrx- prefix IDs. Genre filtering via `&q={genre}` query. Movies: TorznabClient.rss(2000) or search. TV: TorznabClient.rss(5000) or search. Library: QBitClient.torrents(completed) → parse → return metas. Handle `extra.search`, `extra.genre`, `extra.skip`. Include `parseExtra()` helper (parse Stremio extra path segment into object). Cache: `cacheMaxAge: 120` for sports, `cacheMaxAge: 300` for movies/TV. Defensive: return `{ metas: [] }` on any error, never throw. | 1.1, 1.2, 1.3, 2.1 | catalog.js |
| 2.5 | `src/handlers/stream.js` — Movie/TV: parallel Jackett search (by IMDb) + qBit torrents check via `Promise.allSettled()`. Match by infohash. For matched on-seedbox torrents, call `qBit.files(hash)` to get file sizes for `videoSize` behaviorHint. On-seedbox → direct URL, on-tracker → /playback URL. Sports: decode base64url ID → get infohash → check qBit → build stream. Cache: `cacheMaxAge: 0` (download status changes between queries). Defensive: return `{ streams: [] }` on any error, never throw. | 1.1, 1.2, 1.3, 2.3 | stream.js |
| 2.6 | `src/handlers/meta.js` — For custom IDs (pvtkrrx- prefix): decode base64url → return meta with title, description. For IMDb IDs: proxy to Cinemeta. Defensive: return `{ meta: null }` on any error, never throw. | 1.3 | meta.js |

**Checkpoint:** Each handler can be called with mock config and returns valid Stremio JSON.

---

## Phase 3: Integration (1 Day)

**Goal:** Everything wired together. Express app serves all routes. Config page works end-to-end. Playback endpoint implements Comet pattern.

| Task | Description | Depends On | Deliverable |
|------|-------------|------------|-------------|
| 3.1 | `index.js` — Express + SDK hybrid entry point. `withConfig` middleware. Routes: `/:config/manifest.json`, `/:config/catalog/:type/:id.json`, `/:config/catalog/:type/:id/:extra.json`, `/:config/stream/:type/:id.json`, `/:config/meta/:type/:id.json`, `/:config/playback/:info`. SDK router mounted last as fallback. `module.exports = app`. Conditional `app.listen(7000)`. CORS middleware. Error handling: wrap all async handlers in try/catch. | All Phase 2 | index.js |
| 3.2 | Playback endpoint — Decode info param → qBit login (~50ms) → check qBit status (~200ms) → if found, 302 redirect to file URL → if not, trigger qBit add via magnet (~500-2000ms) → poll every 3s within remaining budget → complete: 302 redirect → timeout: 504 JSON `{ error: "Download started — close and try again" }`. Worst case: 2 poll cycles on Hobby tier. | 1.2, 2.2 | (in index.js) |
| 3.3 | `public/configure.html` — Self-contained HTML + CSS + JS. Input fields for all config params. Provider preset dropdown. "Test Connection" button (calls Jackett caps + qBit login via server test endpoints). Calls `POST /encrypt` to encrypt config server-side → generates `stremio://` install link. ENCRYPTION_SECRET NEVER touches the browser. Clean design matching color palette. | 0.4, 3.4 | configure.html |
| 3.4 | `POST /encrypt` endpoint — Receives raw config JSON from config page, validates fields, encrypts with AES-256-GCM using ENCRYPTION_SECRET, returns encrypted token. Also `POST /test-connection` for validating Jackett + qBit credentials before install. ENCRYPTION_SECRET stays server-side only. | 0.4 | (in index.js) |
| 3.5 | CORS headers — `Access-Control-Allow-Origin: *` for Stremio compatibility. Handle OPTIONS preflight for POST endpoints. | None | (in index.js) |

**Checkpoint:** `npm start` → server on :7000 → configure page loads → can test connection → can install in Stremio → catalogs load → streams resolve.

---

## Phase 4: Deploy & Verify (Half Day)

**Goal:** Live on Vercel. Working with real Stremio client. All acceptance criteria met.

| Task | Description | Depends On | Deliverable |
|------|-------------|------------|-------------|
| 4.1 | Set `ENCRYPTION_SECRET` env var in Vercel dashboard | None | Env var configured |
| 4.2 | Deploy via `npx vercel --prod` or git push | All Phase 3 | Live at pvtkrrx.vercel.app |
| 4.3 | Verify: config page at `/configure` | 4.2 | Working config page |
| 4.4 | Verify: install addon in Stremio desktop | 4.3 | Addon installed |
| 4.5 | Verify: Sports catalog loads results | 4.4 | Sports browsing works |
| 4.6 | Verify: Movies/TV search returns streams | 4.4 | IMDb matching works |
| 4.7 | Verify: Library shows downloaded content | 4.4 | qBit integration works |
| 4.8 | Verify: Click stream → playback works (both on-seedbox and Comet pattern) | 4.4 | End-to-end playback |
| 4.9 | Verify: Vercel stays within 10s timeout | 4.2 | No timeout errors |
| 4.10 | Write README.md with install instructions | 4.8 | Documentation |

**Checkpoint:** All 10 acceptance criteria from SCOPE_OF_WORKS.md pass.

---

## Critical Path

```
Phase 0 (Foundation)
    ↓
Phase 1 (Clients) — can start 1.2 and 1.3 in parallel
    ↓
Phase 2 (Utilities & Handlers) — 2.1 and 2.2 can start early, 2.4-2.6 need clients
    ↓
Phase 3 (Integration) — needs all handlers, config page can start after crypto
    ↓
Phase 4 (Deploy & Verify) — needs everything
```

**Parallel opportunities:**
- 0.4 (crypto) + 0.5 (manifest) + 0.6 (categories) — all independent
- 1.1 + 1.2 + 1.3 — all independent clients
- 2.1 (parser) + 2.2 (pathMapper) — no dependencies on clients
- 3.3 (configure.html) can start after 0.4 (crypto) is done

**Bottleneck:** Phase 2 handlers (2.4-2.6) — they depend on all three clients being done. This is the critical path.

---

## Build Order (Exact File Sequence)

```
 1. package.json
 2. vercel.json
 3. src/config/categories.js
 4. src/config/providers.js
 5. src/utils/crypto.js
 6. src/config/manifest.js
 7. src/clients/torznab.js
 8. src/clients/qbittorrent.js
 9. src/clients/cinemeta.js
10. src/utils/parser.js
11. src/utils/pathMapper.js
12. src/utils/streams.js
13. src/handlers/catalog.js
14. src/handlers/stream.js
15. src/handlers/meta.js
16. index.js
17. public/configure.html
```

17 files total. 3 dependencies. ~750KB bundle.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Torznab XML varies by indexer | Medium | High | Defensive parsing with try/catch, test against multiple Jackett indexers |
| Vercel 10s timeout hit on slow trackers | Medium | High | Jackett `&timeout=6`, AbortController at 7s, `Promise.allSettled()` partial results |
| qBit WebUI API version differences | Low | Medium | Use v2 API only (standard since qBit 4.1), fail gracefully on unknown responses |
| Sports content has no IMDb IDs | Certain | Medium | Custom ID scheme (pvtkrrx- prefix + base64url encoded info), meta handler decodes |
| Configure page tested only in Chrome | Medium | Low | Standard HTML/CSS/JS, no framework, should work everywhere |
| Express 5.x breaking changes from clockrr | Low | Medium | Pin exact version from clockrr's package.json |

---

## Prestart Decisions (MD Rulings — February 8, 2026)

All questions resolved by Mr Gurr (MD) at prestart meeting:

| Question | Decision | Rationale |
|----------|----------|-----------|
| Sports build priority | **Catalog first, then streaming** | Visible feature proves the concept |
| Test seedbox access | **Mock in dev, real seedbox in Phase 4** | Faster dev, real integration at the end |
| Playback timeout response | **504 JSON error** | Simpler, works with Stremio's natural re-query |
| Config page encryption | **Server-side `POST /encrypt` endpoint** | ENCRYPTION_SECRET must never touch the browser (Colin's security finding) |
| Sports genre filtering | **Query-based (`&q=UFC`)** | More reliable across different indexers |
| cacheMaxAge values | **Streams: 0, Movies/TV: 300, Sports: 120** | Per TECHNICAL_SPEC.md |

### Prestart Fixes Applied (from Colin's Technical Review)
1. **CRITICAL:** Added server-side `POST /encrypt` endpoint (Task 3.4) — config page calls this instead of client-side encryption
2. **MEDIUM:** Added explicit `cacheMaxAge` values to handler tasks (2.4, 2.5)
3. **MINOR:** Moved `parseExtra()` into catalog handler (Task 2.4) instead of Phase 3
4. **MINOR:** Added sports genre `extra` fields to manifest task (0.5)
5. **MINOR:** Made error handling defensive FROM Phase 2 handlers (not Phase 3 afterthought)
6. **MINOR:** Clarified dual timeout mechanism in TorznabClient (`&timeout=6` server-side + AbortController 7s client-side)
7. **MINOR:** Added explicit `qBit.files(hash)` call for `videoSize` in stream handler (Task 2.5)

---

*Programme prepared by Peter (Production) — February 8, 2026*
*Approved at Prestart Meeting — Mr Gurr (MD) — February 8, 2026*
