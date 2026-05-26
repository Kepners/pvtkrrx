# PVTKRRX — Senior Code Audit (Read-Only Forensic Report)

> **Current status note (2026-05-26):** This is a historical forensic audit of `package.json` version `1.1.73`. It remains useful as a risk inventory, but it is not current release status. Several referenced sports/debrid/parser fixes and smoke proofs landed later on `main`; verify each finding against current source before treating it as open.

**Date:** 2026-05-17
**Scope:** Full repository — `index.js`, `src/` (72 files, ~29.8k LOC), `src/lib/shared.js`, the sports-artwork pipeline, data/clients layer, Electron wrapper, repo-root web directories.
**Method:** Five parallel deep-dive passes, every large file read in full, imports traced, inbound `require()` graph rebuilt, git-tracked vs untracked verified. No file was modified, refactored, or committed. This report (`AUDIT.md`) is the only artifact created, as the brief permits.
**Audited app version:** `package.json` `1.1.73`.

---

## 1. Executive Summary

This is a **competent-but-overgrown single-maintainer codebase with strong fundamentals and three concentrated structural failures.** The git-tracked tree is disciplined (323 files, no secrets, hostname-lock honored, one build config, credentials handled correctly, the 2026-04-22 cache removal was clean with zero zombie references). It is **not** a from-scratch rebuild candidate.

The real risks are narrow and deep, not broad: (1) **zero process-level or Express error handling** on a long-lived streaming server whose hot path pipes disk reads with no `'error'` listener — a single mid-stream I/O failure kills the process with no in-container supervisor; (2) **three unbounded in-memory caches plus a per-poster upstream request storm** on the sports-artwork path — the credible mechanical cause of the documented 2026-05-15 sharp/libvips P1 outage; (3) **two ~3k-line god-files** (`index.js`, `src/lib/shared.js`) and a cache-key correctness bug that silently serves the wrong team's poster.

Biggest risks, in order: **process death from unhandled stream errors → OOM from unbounded buffer caches → cold-load request fan-out → Express v5 routing landmines → wrong-artwork cache-key bug.** Recommended order of attack is in §8. Honest verdict in the closing paragraph.

---

## 2. Stack & Structure Overview

| Aspect | Reality |
|---|---|
| Runtime / language | Node.js, CommonJS, no TypeScript (no build step for the server) |
| Framework | Express **v5.2.1** + `stremio-addon-sdk` 1.6.10 — hybrid (SDK manifest/types, Express does the routing by hand) |
| Key deps | `sharp` 0.34.5 (poster raster), `fast-xml-parser` (Torznab), `pg` (optional Postgres artwork cache), `multicast-dns` (LAN mDNS), `selfsigned` (local HTTPS), `7zip-bin` (RAR), `@umami/node` (analytics) |
| Desktop | Electron 31 wrapper (`electron/main.js`) sharing `index.js` as the server |
| Size | ~32.8k LOC in `src/` + `index.js`; 72 `src` files; 61 scripts; **323 git-tracked files total** |
| Entry point | `index.js` (3,046 L) — Express app, *all* routes registered inline, `/file` + `/playback` state machines inlined; delegates only `catalog`/`stream`/`meta` to `src/handlers`; everything else destructured from `src/lib/shared.js` |
| Live website | `public/` (verified — `index.js:185,251`; the only dir `express.static`/`sendFile` ever targets) |
| Deployment | Coolify Docker container (public `www.pvtkrrx.cc`) + systemd `pvtkrrx.service` (`/selfhost/*`) + Electron desktop. Three install routes: PC Local, LAN Bridge, Remote Seedbox |

**Folder taxonomy verdict:** The top-level split (`src/clients`, `src/config`, `src/handlers`, `src/lib`, `src/utils`) is conventional and sane. The AI-invented sprawl is *inside* it: a flat 58-file `src/utils/` dir, a 2,952-line `src/lib/shared.js` that is a façade re-exporting 40+ symbols from 30 other modules, and a 3,046-line `index.js` that inlines two streaming state machines. ~400 MB of **untracked** local dead weight sits at the repo root (`website/` 379 MB Next.js build residue, `pvtkrrx-web/` a nested empty `.git` clone, 23 loose PNGs, `tmp/`) — all correctly gitignored, so it pollutes disk/IDE indexing but **not** the repository.

**Premise correction (honesty note):** the audit brief assumed loose screenshots and `tmp/` are "committed in git." They are **not** — `.gitignore` covers `*.png`, `website/`, `pvtkrrx-web/`, `tmp/`. None were ever in git history except `website/` source, which was extracted in commit `40f4460` and removed. This downgrades the "no human would build it this way" disk clutter from a repository problem to a local-hygiene one.

---

## 3. Critical Findings

> *"Would I deploy this? What breaks first under load?"* — These five would.

### CRIT-1 — No process-level or Express error handling; unhandled stream errors kill the server
`index.js` (entire file), `src/lib/shared.js` — grep-confirmed: **zero** `process.on('uncaughtException')`, **zero** `process.on('unhandledRejection')`, **zero** Express error-handling middleware, **zero** `SIGTERM`/`SIGINT` handlers.
`index.js:2578`, `:2583`, `:2598` — `fs.createReadStream(resolvedFilePath, { start, end }).pipe(res)` has **no `.on('error')`** on the read stream.
**Why it matters:** A torrent-backed media server reads files that qBit is actively moving/deleting and the auto-delete-watched timer is racing. A disk read error mid-stream emits `'error'` on a listener-less stream → `uncaughtException` → **the Node process exits.** The Coolify container and the Electron host have no in-process supervisor (`electron/main.js:1239` only handles `EADDRINUSE`). This is the single most likely production-down cause and it is structurally guaranteed by the workload.
**Severity: Critical (ticking bomb).**

### CRIT-2 — No graceful shutdown; every Coolify deploy severs in-flight streams
`index.js:2912-3047` (`startLocalServers`), `electron/main.js:1305` (`stopAddonServer`), `Dockerfile:76` (`CMD ["node","index.js"]`).
**Why it matters:** Docker/Coolify `stop` sends SIGTERM; with no handler Node default-exits immediately, cutting every open `/playback`/`/file` byte-stream mid-frame. Rolling deploys (the documented normal release mechanism) hard-reset active viewers. Electron's `stopAddonServer` calls `httpServer.close()` but never destroys sockets and `before-quit` returns synchronously, so quit races the drain. Warmup `setInterval`/`setTimeout` are never cleared on shutdown.
**Severity: Critical for the hosted container; High for desktop.**

### CRIT-3 — Express v5 / path-to-regexp v8 routing landmines on the product's core routes
`index.js:276` (`/:config/configure`), `:1969` (`/:config/manifest.json`), `:2099` (`/:config/catalog/:type/:id.json`), `:2131` (`/:config/stream/:type/:id.json`), plus the legacy root variants.
**Why it matters:** Two distinct latent bugs. (a) `:config` is a single greedy path segment that matches *any* string; `express.static` is mounted at `:251` **before** these routes, so an attacker-influenced base64url token that collides with a real `public/` filename serves the file instead of the addon. The codebase is currently correct only by *declaration order*, not by design. (b) Under path-to-regexp v8 the `:id.json` suffix-param tokenizes as "param then literal `.json`", and `:id` stops at `/` and mis-splits on `.` — Stremio sports IDs of the form `sportsmeta:...` / `pvtkrrx:...` containing a `.` will route incorrectly. This is the most common Express-5 migration breakage and it sits on catalog/meta/stream — the product's entire surface.
**Severity: Critical (latent correctness, core routes).**

### CRIT-4 — Wrong-team poster: artwork memo cache key ignores `fallbackInput`
`src/handlers/sportsArtworkProxy.js:3511-3555` (`resolveDefaultArtworkCanonical`), key built `:3523-3531`, `fallbackInput` consumed downstream at `:3565`, `:3573-3579`, `:3585`.
**Why it matters:** `handleDefaultSportsArtwork` (`:3778`) passes `fallbackInput` (parsed home/away derived from the raw title when query `home`/`away` are absent), but the memo key is built *without* it. Two different events whose identity differs only inside `fallbackInput` collide on one cache key — the first event's canonical (or its **negative** result) is served to the second for up to the 6 h `RASTER_CACHE_TTL_MS`. Effect: the wrong team's poster, or a resolvable event permanently glyph-poisoned, *masked by the cache so it looks intermittent.* This matches the recurring, hard-to-pin logo-quality incidents (DIRECTIVE 001/002).
**Severity: Critical (cache-masked correctness bug on the hot path).**

### CRIT-5 — Cold-load upstream request storm on the sports-artwork path
`src/handlers/sportsArtworkProxy.js:3777-3789` then `:3842-3850` → `loadRaster` → `renderLayoutFallback` (`:2878-2896`); unconditional 5-call inspect at `:2580-2583`; per-side catalog-search→inspect at `:1928-1952`, `:1954-2063`. Compounded by the qBit poll amplification (`src/lib/shared.js:2354`, see HIGH-5).
**Why it matters:** A single default-route poster that misses canonical resolution fans out to `1 /resolve + 1 /catalog search + 2 /inspect per hit + per-rule direct fetches + a 5-way unconditional /inspect (homeBadge/awayBadge/leagueLogo/logo/poster) even for solo events that have no badges`. Only the `/resolve` leg is memoized; the catalog-search→inspect chain is not request-deduped. On a Stremio cold-load of 30–50 posters this is hundreds of upstream SportsMeta round-trips per client open. The file's own comment at `:3463-3469` calls cache-hit-rate "BUG 3" — the fan-out beneath it is worse and unaddressed.
**Severity: Critical under load (the load-breaker the brief asks about).**

> **Honorable mention (Critical-operational):** `index.js:2037-2040` pastes a directory-encrypted `stremioAddonsConfig` JWE signature inline as a string literal in the bootstrap-manifest handler — load-bearing, registration-specific production config with zero traceability, no comment, no rotation path, in the worst possible place. Functionally High, operationally Critical.

---

## 4. High-Priority Findings

### Memory / OOM cluster — the credible cause of the 2026-05-15 sharp/libvips P1
- **HIGH-1** `src/handlers/sportsArtworkProxy.js:74` `rasterCache` + `:110-116` `trimCache` — trimmed by **key count only** (`RASTER_CACHE_MAX_KEYS` ≈ 2000); each value is a full 600×900/1920×1080 PNG `Buffer`. 2000 entries × 0.3–0.8 MB ≈ **0.6–1.6 GB resident**, on top of `logoFetchCache` (also up to 2000 PNG buffers, `:2337-2341`). No coordination with `sharp.cache`. **Severity: High (ticking bomb).**
- **HIGH-2** `src/handlers/catalog.js:50` `cinemetaCache` — `new Map()` with per-entry TTL but **no size cap and no sweep**, unlike its bounded sibling `prowlarrSearchCache`. Grows forever on the long-lived systemd/Coolify runtimes. **Severity: High (memory leak).**
- **HIGH-3** `src/handlers/stream.js:56` `trackerLinkInspectionCache` — `new Map()`, TTL only checked lazily on re-read of the *same* key, **no eviction**. Grows with every distinct tracker link. **Severity: High (memory leak).**

### Request amplification & a dead fallback
- **HIGH-4** `src/handlers/catalog.js:407-428` — `searchSportsCatalogItems` fires the strict Prowlarr query with `{ useCategories: true }` and the "broad" fallback with the **exact same args** `{ useCategories: true }` (should be `false`). The broaden-the-net retry **does not exist**; it's a guaranteed cache-hit wasted round-trip. Correctness bug, not just waste — sparse sports catalogs never get the wider search they were designed to get. **Severity: High.**
- **HIGH-5** `src/lib/shared.js:2354-2429` `loadTorrentPlaybackState` issues 2–4 qBit HTTP calls; called once pre-loop, again after add, then **every 2 s for up to 90 s** in the playback loop (`index.js:2831`) *and* **every 500 ms for up to 45 s** in `/file` (`index.js:2398/2487`). One buffering playback = **100+ qBit requests** re-fetching the full file list each time. `primeTorrentForStreaming` (6 mutations) runs unconditionally per `/file` request (`index.js:2369`). Fine on localhost, real amplification on slow self-host/remote qBit. **Severity: High.**
- **HIGH-6** `src/handlers/sportsArtworkProxy.js:2580-2583` — `['homeBadge','awayBadge','leagueLogo','logo','poster']` always `Promise.all`-fetched (5 upstream JSON calls) before the code knows whether the event even has a matchup; solo events pay 2 guaranteed-useless calls. Compounds CRIT-5. **Severity: High.**
- **HIGH-7** `src/utils/sportsArtworkDiskCache.js:346`, `:262-264` — `trimSportsArtworkDiskCache` is fire-and-forget after **every** write and does a full `readdir`+`stat` of the (~272 MB) cache dir; `writeSportsArtworkPostgresCache` runs `DELETE ... WHERE expires_at <= now()` (full-table sweep) on **every single write**. O(N) work bolted onto an O(1) op on the hot path. **Severity: High.**

### Structure / spaghetti
- **HIGH-8** `src/lib/shared.js` (2,952 L) — god-module with **11+ unrelated responsibilities** (runtime flags, config store, LAN detection, pair identity, Stremio auth-key filesystem scanning ~300 L, client-IP/proxy trust, addon-config merge, account orchestration, CSRF/origin middleware, manifest build, the **torrent playback state machine** ~340 L, LAN-pair redirect middleware) plus a 220-line `module.exports` façade re-exporting 40+ symbols from 30 modules. Highest-blast-radius file in the repo; 9 scripts + `index.js` depend on it. **Severity: High (architecture).**
- **HIGH-9** `index.js:2608-2910` (`/playback/:info`, ~300 L) and `:2305-2605` (`/file/:info`, ~300 L) — single route handlers doing token decode + qBit client build + payload fetch + magnet/.torrent add + hash-diff + 90 s poll loop + packed-archive handling + 6 terminal responses, inline MIME map, inline 55-line piece-window bit-fiddling. `loadTorrentPlaybackState` is called 5× in one function with different args. Untestable; every `await` is an unguarded crash surface feeding CRIT-1. **Severity: High.**
- **HIGH-10** `src/handlers/sportsArtworkProxy.js:2765-2832` — `renderTeamBadgeArtworkPngLegacy` (68 L) is dead (never called, not exported) but is the *only* caller of `fetchCompositionImage` (`:2200-2229`) and `renderTeamSplitBaseSvg`/`renderTeamSplitOverlaySvg` (`:645-775`, ~130 L) — a ~270-line dead block, and the dead `renderTeamSplitBaseSvg` even renders the *forbidden* fabricated `venue`/`time`/`round` metadata (`:659-666`). A re-wire footgun. **Severity: High.**
- **HIGH-11** `src/handlers/sportsArtworkProxy.js:2967-3001`, `:3050-3084`, `:3167-3200` — `tryRealLogoVariantPng` invoked in three branches of one `loadRaster` closure with verbatim-triplicated logic and *diverging* `fallbackReason` strings. A fix in one branch silently misses the other two. **Severity: High (correctness drift).**
- **HIGH-12** `src/handlers/sportsArtworkProxy.js` (~25 sites), `sportsArtworkDiskCache.js`, `clients/sportsmeta.js` — pervasive `catch (_) { return null }` swallowing network/sharp/JSON/Postgres failures with **zero logging**. When a poster degrades to initials, the operator has no signal why. Directly makes the libvips-class outages undiagnosable and violates the project's own "never lie about what's broken" mandate. **Severity: High (diagnosability).**

### Security
- **HIGH-13** `src/lib/shared.js:205-208` — dev-fallback `ENCRYPTION_SECRET = 'pvtkrrx-local-dev-secret-change-me'` activates when `NODE_ENV !== 'production'`. **`Dockerfile:66-73` never sets `NODE_ENV=production`.** If Coolify doesn't inject it and `ENCRYPTION_SECRET` is unset, every hosted config token (carrying qBit/Prowlarr creds) is encrypted with a public repo constant. The guard keys off the wrong variable (should key off the hosted-relay flag the Dockerfile *does* set). **Severity: High.**
- **HIGH-14** `index.js:1095-1158` — `/encrypt` is an **unauthenticated** public endpoint (IP rate-limit only, no CSRF, no origin gate) that returns valid config-token ciphertext for arbitrary qBit/Prowlarr URLs — an encryption oracle for the production secret. Siblings `/test-connection` and `/auth/*` correctly gate with `requireCsrfToken`. **Severity: High.**
- **HIGH-15** `index.js:1922-1930` — `/test-connection` skips `validateHostedConnectionTarget` entirely on `isSameHostRequest(req)`, which trusts `X-Forwarded-For` under `trust proxy`. The documented Caddy→Coolify topology is plausibly a 2-hop path; a wrong hop count lets a forged `X-Forwarded-For` turn this into full internal SSRF (it calls `new ProwlarrClient(url).caps()` on caller-supplied URLs). **Severity: High (conditional on proxy config).**
- **HIGH-16** `index.js:1807-1902`, `:470-482` — two large HTML documents built by template-literal string concatenation inside route handlers, interpolating `req.query.host`/`req.get('host')`-derived values; safety rests entirely on `sanitizeHostForUrl` being strict. The `.replace('<body>', …)` template surgery silently no-ops if the tag ever gains an attribute. XSS-adjacent and brittle by construction. **Severity: High.**
- **HIGH-17** `index.js:251-261` — `express.static` with `immutable, max-age=86400, s-maxage=604800` on **non-content-hashed** filenames (`logo.png`, configure JS). Clients and the Caddy edge will not revalidate for a week after a deploy — this is the documented cause-class of the recurring stale-poster/stale-logo incidents. **Severity: High (recurring real incident).**

### Reliability
- **HIGH-18** `src/handlers/stream.js:1274-1295`, `:1485` — when the seedbox is down the stream path returns `{ streams: [] }`, **indistinguishable from "no results."** Only the catalog path has a health probe (`catalog.js:253`). No retry on IMDb/qBit calls (single attempt + timeout). Users see "nothing available" during an outage. **Severity: High (UX/reliability asymmetry).**
- **HIGH-19** `src/clients/qbittorrent.js:144-179` — the no-auth↔cookie retry ladder writes conflicting `noAuth` flags into a **module-global session cache** keyed only by url+user+passwordHash, on every 403 transition. Two concurrent requests (playback loop + parallel catalog `qbit.torrents`) that disagree about localhost-auth thrash the shared flag → avoidable extra 403s and full re-logins under concurrency. State-machine-as-flag-soup. **Severity: High (reliability under concurrency).**

---

## 5. Medium / Low Findings (grouped by Phase-2 category)

### A. File & Folder Hygiene
- **MED** `src/utils/dedupByKey.js` — genuinely dead, **zero** inbound `require()` anywhere in `src/`, `index.js`, `scripts/`, `electron/`. Safe delete. (Only dead file in `src/utils`; the other 57 are wired in, casing is 100% consistent camelCase, no `X2.js`/`Xv2.js` patterns.)
- **MED** Repo root: `website/` (379 MB Next.js build residue, no source/`package.json`), `pvtkrrx-web/` (98-file nested empty `.git` clone — *ticking annoyance*: nested `.git` already returned exit-128 during this audit and breaks recursive tooling), 23 loose PNGs (16 MB), `tmp/` (3.8 MB). ~400 MB untracked. **Fix is `rm -rf`, not `.gitignore`** (`.gitignore:14-15` is the current band-aid).
- **LOW** `src/utils/localInstallUrls.js`, `remoteSeedboxConfig.js`, `privateTargetHosts.js` — logic-free shims reaching `../../public/route-parity`; security logic (`isBlockedPrivateTargetHost`, DNS-rebinding suffixes) lives under `public/` and is consumed up through `src/` — a layering inversion worth knowing.

### C. Repeated & Redundant Calls
- **MED** `src/handlers/catalog.js:1596-1717` — library catalog Cinemeta **search** calls bypass `getCinemetaCached` (which only caches by imdbId), so every library browse re-searches Cinemeta per torrent and re-runs `ensurePackedArchiveExtracted` per torrent.
- **MED** `src/handlers/catalog.js:1189-1237` — cold sparse sports browse can fire 10–30 Prowlarr searches (`SEED_TERMS` fan-out twice) on the first browse after the 120 s cache TTL expires.
- **MED** `src/handlers/{catalog,meta,stream}.js` (`catalog.js:1275-1298`, `meta.js:333`) — the same SportsMeta canonical identity is resolved in catalog (often abandoned at the 1 s budget), then again in meta, then again in stream — three independent resolutions reconciled only by SportsMeta's 60 s server cache.
- **MED** `sportsArtworkProxy.js:258,285,358,377,1053,1069,2535,2957,3754` + `sportsCardArtwork.js:1001` — `classifySportsEvent`/`normalizeSportsEventMetadata` (each ~20 regexes) recomputed up to ~6× per single poster render, never memoized on the request.

### D. Call Splitting & Boundary Errors
- **MED** `src/handlers/stream.js:1538-1624` — `handleDecodedCustomStream` re-derives tracker-link inspection state in three places with subtly different short-circuit conditions instead of computing once and threading it.
- **MED** `src/utils/accountStore.js:180-205` — `saveUser` writes `userKey`/`emailKey`/`stremioUserKey` as three independent `await set()` calls with no transaction/rollback; a crash between them orphans the user from its indexes.

### E. AI Spaghetti Signatures
- **MED** `normalizeSpace` — byte-identical one-liner copy-pasted into **15+ files** (`sportsArtwork.js:20`, `sportsCardArtwork.js:38`, `sportsPosterTemplates.js:83`, `teamName.js:11`, … `catalog.js:44`).
- **MED** `hashString` (FNV-1a) — byte-identical in 4 files (`sportsCardArtwork.js:130`, `sportsPosterAdapter.js:149`, `sportsPosterTemplates.js:314`, `sportsArtworkProxy.js:497`); feeds cache keys/deterministic artwork — divergence would silently change output in one path only.
- **MED** `normalizeBaseUrl` — ~8 implementations with **subtly different semantics** (empty-string guard present in `accountStore`/`pairStore`/`stremioLinkStore`, absent in `relayUrl`/`sportsCatalogPrewarm`; `shared.js:340` a different impl entirely). The dangerous variant — same name, divergent behavior, and the hostname-lock depends on consistent base-URL handling.
- **MED** `sportsEventClassifier.js` vs `sportsPosterClassifier.js` — two modules, one responsibility, overlapping export surface, 3 different import paths for the same `classifySportsEvent`/`hasActualPair`.
- **MED** `sportsArtworkProxy.js:916-968` + `:1210-1582`, `sportsPosterTemplates.js:44-81`, `sportsPosterAdapter.js:6-54`, `sportsCardArtwork.js:160-188` — **four** independently-maintained league-name/code tables (~380 overlapping lines) that **already disagree** (`wimbledon→ATP` vs `wimbledon→WIM`).
- **LOW/NIT** `sportsArtworkProxy.js:3537` `(async () => fn())()` pointless IIFE wrapper; `:3287-3293`,`:3462-3469`,`:3489-3494` present-tense "BUG 3" archaeology comments describing behavior that no longer exists; `index.js:2132/2134` ASCII vs Unicode arrow log inconsistency; `electron/preload.js:19` exposes `fitPopupWindow` IPC whose handler `main.js:1488` was removed (silent no-op bridge).

### F. Performance
- **MED** `sportsArtworkProxy.js:6,2696-2745` — `sharp.concurrency(1)` plus a **sequential** per-slot `for` loop awaiting each resize+composite+`opaqueMeanLuminance` raw-decode one at a time (slots are independent until the final composite — parallelizable). First-paint latency multiplier under cold-load.
- **MED** `sportsArtworkProxy.js:178-187` used at `:3003` — `isExpectedRasterLayout` discards a perfectly good upstream raster whose aspect ratio falls outside hard-coded windows and forces the *most expensive* full local re-render path instead of passing the bytes through.

### G. Rebuild & Reactivity Waste
- **LOW** `analytics.js:120-123`, `sportsCatalogPrewarm.js:8-9`, `sportsIdentityBackfill.js:45-50`, `sportsArtworkDiskCache.js:7` — intentional process-singleton/once-guard module state, but non-reentrant and hard to unit-test in isolation.
- **NIT (positive)** Every `setInterval`/recurring `setTimeout` (`shared.js:1890`, `lanAlias.js:119`, `sportsCatalogPrewarm.js:328`, `sportsIdentityBackfill.js:349`) is `.unref()`'d with a paired clear path. No leaking timers. Done right.

### H. Weird State Decisions
- **MED** `index.js:2741-2748,2822` — playback "snapshot all qBit hashes → add → set-diff to guess the new torrent" is racy by the code's own comment; two concurrent magnet-without-hash playbacks can mis-attribute each other's torrent.
- **MED** `src/lib/shared.js:2512` — `withConfig` does `JSON.stringify(a) !== JSON.stringify(b)` deep-equality plus a potential **synchronous disk write** on the hot `/local/*` + `/selfhost/*` middleware path; key-order sensitivity can cause spurious rewrites (write amplification).

### I. "No Human Would Build It This Way"
- **MED** `index.js:2037-2040` hardcoded JWE signature literal (see §3 honorable mention).
- **MED** `index.js:187` module-load `fs.readFileSync(configPage)` with no guard — a missing `public/configure.html` throws on `require` and (per CRIT-1, no handler) the server never starts with only a bare stack trace.
- **LOW** `index.js:2991-3036` self-signed cert regenerated (RSA-2048) on **every** boot, never persisted — CPU on desktop cold start, and any manually-trusted cert must be re-trusted after every restart.
- **LOW** `index.js` uses `console.log`/`console.warn` as the structured-logging mechanism (dozens of lines/request, no level control, no request-ID correlation across the multi-await playback flow). Redaction *is* installed (`shared.js:203`) so it's safe, just not operable.

### Verified Safe (explicitly checked — negative findings worth recording)
- **Credentials:** qBit password POSTed form-encoded, session cache keyed by SHA-256 hash; Prowlarr `apikey` only in query string with global console redaction (`logRedaction.js`, `shared.js:203`); file-server Basic auth in `proxyHeaders`, not URLs; playback/file tokens are AES-encrypted opaque blobs. **No leak.**
- **Hostname lock:** zero `kepners.co.uk` in `public/` (live dir) or even the dead `website/`; `.env` gitignored & untracked. **CLAUDE.md guardrail satisfied.**
- **2026-04-22 cache removal:** `sportsdb`, `sportsImageCache`, `sportsCacheSeeder`, `sportsCacheAutofill`, `sportsThumb`, `sportsmetaCatalogue` have **zero** import/call sites. Clean removal, no zombie code.
- **`entitlement.js`:** precedence chain correct, free `ticket-stub` always re-added, requested→allowed clamped, owner/admin revocation instant. No bypass.
- **Reference implementations done right:** `cachedProwlarrSearch` (in-flight dedup + TTL + size trim), Prowlarr `_getIndexerCategoryLookup` (memoized + TTL + dedup) — these are the model the leaky caches (HIGH-1/2/3) should copy.

---

## 6. Patterns to Standardize (the 3–5 that clean up the most)

1. **One bounded-cache primitive.** Five caches are exemplary, three are unbounded leaks (HIGH-1/2/3). Extract a single `createBoundedCache({ maxKeys, ttl, maxBytes })` and replace every ad-hoc `new Map()` cache with it. Kills three High findings and the OOM class in one move.
2. **One error/observability discipline.** Add `process.on('uncaughtException'/'unhandledRejection')`, an Express terminal error middleware, `.on('error')` on every stream, and replace the ~25 silent `catch (_)` with a single `logSwallowed(err, context)` helper. Resolves CRIT-1 and HIGH-12 together.
3. **One string/util module.** Collapse the 15× `normalizeSpace`, 4× `hashString`, ~8× `normalizeBaseUrl`, and the 4 league tables into `src/utils/strings.js` + `src/data/leagues.js`. Removes ~600 duplicated lines and the already-diverged behavior risk.
4. **One classification call per request.** Memoize `classifySportsEvent`/`normalizeSportsEventMetadata`/`buildArtworkInputFromRequest` on the request object — currently recomputed ~6× per poster. Single import path for the classifier (kill the `sportsEventClassifier`/`sportsPosterClassifier` ambiguity).
5. **Split the two god-files.** Extract from `shared.js` the two self-contained, unit-testable units first — the **torrent playback state machine** (~340 L) and **Stremio auth-key discovery** (~300 L) — and lift `/file`+`/playback` out of `index.js` into `src/handlers/playback.js`.

---

## 7. Quick Wins (< 30 min each, outsized payoff)

| # | Action | File | Payoff |
|---|---|---|---|
| QW-1 | Add `process.on('uncaughtException')` + `process.on('unhandledRejection')` logging-and-survive guards, and `.on('error', …)` on the three `createReadStream` pipes | `index.js:2578/2583/2598`, top of file | Stops the #1 production-down cause (CRIT-1) |
| QW-2 | Add `maxKeys` eviction to `cinemetaCache` and `trackerLinkInspectionCache` (copy the `prowlarrSearchCache` trim already in the same file) | `catalog.js:50`, `stream.js:56` | Kills two memory leaks (HIGH-2/3) |
| QW-3 | Fix the duplicate Prowlarr fallback: change the broad call to `{ useCategories: false }` | `catalog.js:419-426` | Restores a missing feature + removes a wasted round-trip (HIGH-4) |
| QW-4 | Add `fallbackInput` (or its derived home/away) to the memo key | `sportsArtworkProxy.js:3523-3531` | Stops wrong-team posters (CRIT-4) |
| QW-5 | Set `NODE_ENV=production` in the Dockerfile (or re-key the dev-secret guard off the hosted flag) | `Dockerfile`, `shared.js:205` | Closes the encryption-secret exposure (HIGH-13) |
| QW-6 | Add `requireCsrfToken` + sensitive-origin gate to `/encrypt` | `index.js:1095` | Closes the encryption oracle (HIGH-14) |
| QW-7 | `rm -rf website/ pvtkrrx-web/ tmp/` + delete loose root `*.png`; remove the two `.gitignore` band-aid lines | repo root | Reclaims ~400 MB, removes the nested-`.git` tooling hazard |
| QW-8 | Delete `src/utils/dedupByKey.js` | that file | Removes the only dead `src/utils` file |
| QW-9 | Add a `SIGTERM` handler that `server.close()`s and drains before exit | `index.js:2912` | Stops every Coolify deploy from cutting live streams (CRIT-2) |

---

## 8. Recommended Refactor Sequence (ordered to avoid breakage)

1. **Stop the bleeding (no behavior change):** QW-1, QW-9 (error handling + graceful shutdown), QW-2 (cache caps), QW-5, QW-6 (the two security holes). All additive, low risk, immediately deployable. *Smoke gate: existing `npm run smoke:security`, `smoke:playback`, `smoke:guards`.*
2. **Correctness fixes:** QW-3 (Prowlarr fallback), QW-4 (memo key) — bug fixes with clear before/after, covered by `smoke:sports-resolution`/`smoke:sports-artwork`.
3. **Routing hardening (CRIT-3):** add explicit route-param constraints / move `express.static` below the `:config` routes, add a 404 + error terminal middleware. Verify against `smoke:config`, `smoke:stremio-link`, the catalog/stream/meta smoke suite. Highest test-coverage need — do **not** batch with anything else.
4. **De-duplicate (Pattern 3):** introduce `utils/strings.js` + `data/leagues.js`, migrate call sites mechanically, run the full smoke suite. Pure refactor, reversible.
5. **Tame the artwork hot path:** request-level memoization (Pattern 4), parallelize the slot loop (MED-F1), make disk/Postgres trim periodic not per-write (HIGH-7), gate the 5-way inspect on `hasMatchup` (HIGH-6). Land behind `smoke:sports-broadcast`/`smoke:free-tier-artwork` with raster-cache assertions.
6. **Split the god-files (Pattern 5):** extract playback state machine + auth-key discovery from `shared.js`; lift `/file`+`/playback` into `src/handlers/playback.js`. Largest change — do last, one module per PR, façade re-exports preserved during migration so callers don't move.
7. **Cleanup:** delete dead code (HIGH-10 legacy renderer + its now-orphaned helpers, QW-8), kill archaeology comments, persist the self-signed cert.

Rationale: every step is independently shippable and smoke-gated; the high-blast-radius `shared.js`/`index.js` surgery is deliberately last, after the safety nets (step 1) and the de-dup (step 4) make it tractable.

---

## Closing Assessment — Honest Verdict

**Salvageable with focused refactoring — not a rewrite, and not deployable-as-is to a release without step 1.** This is not AI slop pretending to be a product; it is a real product carrying AI-authorship scar tissue in two concentrated places. The fundamentals a rebuild would have to re-earn are already done correctly: credentials and token encryption are sound, the hostname lock holds, the entitlement gate is correct, the dangerous 2026-04-22 cache removal was clean with zero zombies, the git-tracked tree is lean and disciplined, and several caches are textbook implementations. The damage is *localized* — the absence of any process-level safety net on a streaming workload, three unbounded buffer caches plus a per-poster request storm on the sports path (the mechanical signature of the documented P1 outage), two ~3k-line god-files, and one cache-key bug that quietly serves the wrong team. None of that requires extracting requirements and starting over; all of it is reachable with the surgical, smoke-gated sequence in §8. The single most important sentence in this report: **fix the error handling and the unbounded caches (one afternoon of work) before the next release, because the codebase's worst failure mode is silent process death followed by an OOM, and right now nothing in production would tell you which one hit you.**

*— End of audit. No source files were modified; `AUDIT.md` is the only artifact created, per brief.*
