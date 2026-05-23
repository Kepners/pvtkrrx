# Codex Brief — PVTKRR v1.3 Debrid Provider Layer

**For:** Codex (heavy-lift scaffolding agent)
**Companion plan:** [docs/IMPLEMENTATION_PLAN_2026-05-23_DEBRID_READY_PREFETCH.md](IMPLEMENTATION_PLAN_2026-05-23_DEBRID_READY_PREFETCH.md) — read this first for full context.
**Scope of this brief:** CODEX-1, CODEX-2, CODEX-3 only. Stop after these. Do **not** touch any other file in the repo.
**API spec source:** All endpoint details in §5 were verified against live provider documentation on **2026-05-23**. If you find a discrepancy while implementing, the live docs win — but flag it in §15 instead of silently changing the spec.

---

## 1. Goal in one sentence

Build two self-contained client layers — `DebridProvider` (download backends: RD + AD + Premiumize) and `CacheSearchSource` (instant-READY search sources: put.io + Premiumize) — plus a parallel cache-check utility, a Newznab indexer extension to the existing Prowlarr client, an RD filename sanitizer, and a smoke test scaffold. All isolated from the rest of the codebase. Claude Code does live integration later.

## 2. Files you will create

```
src/clients/debrid/
  ├─ base.js              # DebridProvider interface, factory, shared HTTP helpers, RD filename sanitizer
  ├─ realdebrid.js        # RD client — torrent only, applies sanitizer
  ├─ alldebrid.js         # AD client — torrent only
  ├─ premiumize.js        # PM client — torrent + cloud Usenet (NZB)
  └─ __mock__.js          # in-memory mock implementing DebridProvider

src/clients/cacheSearch/
  ├─ base.js              # CacheSearchSource interface + factory
  ├─ putio.js             # put.io account + friends file search
  ├─ premiumize.js        # PM /cache/check wrapped as a CacheSearchSource
  └─ __mock__.js          # in-memory mock implementing CacheSearchSource

src/clients/prowlarr/
  └─ newznab.js           # NEW — Newznab-protocol result parser + adapter (extends existing Prowlarr client at integration time)

src/utils/
  ├─ debridCache.js       # parallel CacheSearchSource fan-out + 60s memo
  └─ rdFilenameSanitizer.js  # strip RD May 2026 filter keywords from magnet dn=

scripts/
  ├─ smoke-debrid.js          # debrid + cache search smoke suite
  └─ smoke-rd-sanitizer.js    # focused sanitizer regression suite

scripts/__tests__/debrid/
  ├─ realdebrid.test.js
  ├─ alldebrid.test.js
  └─ premiumize.test.js

scripts/__tests__/cacheSearch/
  ├─ putio.test.js
  └─ premiumize.test.js

scripts/__tests__/prowlarr/
  └─ newznab.test.js
```

**You do NOT create:** a TorBox client. TorBox is deferred to v1.4. If asked, do not improvise it.

## 3. Files you will NOT touch

These belong to Claude Code. Hands off:

- `src/handlers/*` — any handler file
- `src/web/*` — any UI/configure page
- `src/config/manifest.js` — **bootstrap manifest is locked, see §6**
- `src/config/installConfig.js` or any encrypted-config schema file
- `package.json` — Claude Code will register the smoke script
- Any existing `scripts/smoke-*.js` file (only create the new one)
- Anything in `docs/`
- Anything in `.claude/`

If you find yourself wanting to edit one of these, stop and write a note instead.

## 4. The interfaces (canonical — match exactly)

There are **two** interfaces. A service can implement one, the other, or both:
- `DebridProvider` — full transfer lifecycle (add magnet/nzb → poll → get stream URL)
- `CacheSearchSource` — query-only search for items already accessible (instant READY)

### 4.1 `src/clients/debrid/base.js`

```js
/**
 * @typedef {'rd'|'ad'|'pm'} DebridProviderId
 * @typedef {{ magnet: boolean, nzb: boolean }} DebridCapabilities
 * @typedef {{ state: 'queued'|'downloading'|'ready'|'error', progress: number, files: Array<{idx:number,name:string,size:number,selected:boolean}>, errorMessage?: string }} TransferStatus
 */

/**
 * @interface DebridProvider
 * @property {DebridProviderId} id
 * @property {DebridCapabilities} capabilities  // which source types this provider can ingest
 * @method addMagnet(magnet: string): Promise<{ addedId: string }>
 * @method addNzb(nzbUrl: string): Promise<{ addedId: string }>
 * @method selectFiles(addedId: string, fileIdxs: number[] | 'all'): Promise<void>
 * @method pollStatus(addedId: string): Promise<TransferStatus>
 * @method getStreamUrl(addedId: string, fileIdx: number): Promise<string>
 * @method remove(addedId: string): Promise<void>
 */

/**
 * @param {DebridProviderId} type
 * @param {string} apiKey
 * @returns {DebridProvider}
 */
export function getDebridProvider(type, apiKey) { /* ... */ }
```

**Capability handling:**
- RD: `{magnet:true, nzb:false}` — `addNzb` MUST throw `UnsupportedCapabilityError`
- AD: `{magnet:true, nzb:false}` — `addNzb` MUST throw `UnsupportedCapabilityError`
- PM: `{magnet:true, nzb:true}` — both work
- Callers check `capabilities.nzb` before invoking `addNzb`. Never silently swallow.

### 4.2 `src/clients/cacheSearch/base.js`

```js
/**
 * @typedef {'putio'|'pm'} CacheSearchSourceId
 * @typedef {{
 *   sourceId: CacheSearchSourceId,
 *   name: string,
 *   sizeBytes: number,
 *   infohash?: string,
 *   fileId?: string,       // provider-specific identifier needed by streamUrl()
 *   directStreamUrl?: string, // some sources can return the URL directly
 *   expiresAt?: number     // epoch ms — null = no expiry known
 * }} CacheHit
 */

/**
 * @interface CacheSearchSource
 * @property {CacheSearchSourceId} id
 * @method searchByTitle(title: string, options?: {year?: number, type?: 'movie'|'series', limit?: number}): Promise<CacheHit[]>
 * @method searchByHash(infohash: string): Promise<CacheHit | null>
 * @method streamUrl(hit: CacheHit): Promise<string>  // resolve directStreamUrl OR fetch one
 */

/**
 * @param {CacheSearchSourceId} type
 * @param {string} apiKey
 * @returns {CacheSearchSource}
 */
export function getCacheSearchSource(type, apiKey) { /* ... */ }
```

**Per-source behavior:**
- **put.io** `searchByTitle` queries `/files/search` (covers user's own files AND friend-shared files). `searchByHash` is unsupported — returns `null` (put.io has no hash index). `streamUrl(hit)` calls `/files/{fileId}/url`.
- **Premiumize** `searchByTitle` is unsupported — returns `[]` (PM has no title search). `searchByHash` calls `/cache/check` with a magnet built from the hash. `streamUrl(hit)` is a no-op return of `hit.directStreamUrl` (PM cache check doesn't give a stream URL directly; caller must subsequently `addMagnet` to convert cache→playable — this is documented in the integration layer Claude Code will write, not your problem).

If a method doesn't apply to a source, return the empty result type (`[]` or `null`) — never throw `UnsupportedCapabilityError` here. (Unlike `DebridProvider.addNzb`, search misses are normal and routine.)

## 5. Per-service notes (verified live 2026-05-23)

### Real-Debrid (`debrid/realdebrid.js`) — DebridProvider only
- **Capabilities:** `{magnet:true, nzb:false}` — `addNzb` must throw `UnsupportedCapabilityError`
- **Base URL:** `https://api.real-debrid.com/rest/1.0/`
- **Auth:** `Authorization: Bearer <apiKey>` header on every authenticated call.
- **May 2026 filter mitigation:** Every magnet passed to `addMagnet` MUST first go through `rdFilenameSanitizer.sanitizeMagnet(magnet)` (see §5.5). This is RD-specific — do NOT apply to AD or PM.
- **`addMagnet`:** Sanitize first (§5.5), then `POST /torrents/addMagnet` — form-encoded body `magnet=<sanitized magnet uri>`. Returns HTTP 201 with `{ id, uri }`. Use `id`. **Error handling:** if response is HTTP 403 with body containing `error_code: 35` ("infringing_file"), throw `RdInfringingFileError` so the integration layer can fall back to another provider.
- **`selectFiles`:** `POST /torrents/selectFiles/{id}` — form body `files=all` (or comma-separated file IDs). Returns HTTP 204 (no content).
- **`pollStatus`:** `GET /torrents/info/{id}`. Status field values: `magnet_error`, `magnet_conversion`, `waiting_files_selection`, `queued`, `downloading`, `downloaded`, `error`, `virus`, `compressing`, `uploading`, `dead`. Map to interface states: `magnet_conversion|waiting_files_selection|queued` → `queued`, `downloading|compressing|uploading` → `downloading`, `downloaded` → `ready`, anything else → `error`. `progress` field is 0-100 — divide by 100 to give 0-1. `files` array has `{id, path, bytes, selected}`. `links` is an array of "host URL" strings (these are NOT direct download links — they must be unrestricted, see next).
- **`getStreamUrl`:** Two-step: pick `info.links[fileIdx]`, then `POST /unrestrict/link` with form body `link=<that host URL>` → response has `download` field with the actual streaming URL.
- **`remove`:** `DELETE /torrents/delete/{id}`. HTTP 204 on success. Error codes: 401 bad token, 403 permission denied, 404 unknown resource.
- **Rate limit:** 250 requests/minute API-wide. HTTP 429 on excess. Refused requests still count toward the limit — implement defensive backoff. Bruteforcing leads to indefinite block (their words).

### AllDebrid (`debrid/alldebrid.js`) — DebridProvider only
- **Capabilities:** `{magnet:true, nzb:false}` — `addNzb` must throw `UnsupportedCapabilityError`
- **Base URL:** `https://api.alldebrid.com/` — note endpoints split across `/v4/` and `/v4.1/` (status uses 4.1).
- **Auth:** `Authorization: Bearer <apiKey>` header. As of 2025-01-15 the `agent` and `version` query parameters are **no longer required** — do NOT add them. Bearer header is the only auth needed.
- **`addMagnet`:** `POST /v4/magnet/upload` — form body `magnets[]=<magnet>` (repeatable). Response shape:
  ```json
  { "status":"success", "data":{ "magnets":[ { "id":123, "hash":"...", "name":"...", "size":n, "ready":bool } ] } }
  ```
  Use `data.magnets[0].id`. If a magnet errors, that magnet entry contains an error object instead of the success fields.
- **`selectFiles`:** No-op. AD doesn't expose per-file selection at this stage. Implement as `async () => {}`.
- **`pollStatus`:** `POST /v4.1/magnet/status` — form body `id=<id>`. Response:
  ```json
  { "status":"success", "data":{ "magnets":[ { "id":n, "filename":"...", "size":n, "status":"...", "statusCode":n, "downloaded":n, "files":[...] } ] } }
  ```
  Map `statusCode`: `0` → `queued`, `1|2|3` → `downloading`, `4` → `ready`, `5-15` → `error`. `progress` = `downloaded / size` (compute, not provided).
  **Files structure is a hierarchical tree**, NOT a flat array. Each node has `n` (name), `s` (size, files only), `l` (download link, files only), `e` (entries — children, folders only). You must flatten this tree to enumerate playable files. Helper required: `flattenAdTree(files) → Array<{path, size, link}>`.
- **`getStreamUrl`:** From the flattened file list pick index `fileIdx`, take its `l` (link), then `POST /v4/link/unlock` form body `link=<that link>` → response has `data.link` with the direct download URL.
- **`remove`:** `POST /v4/magnet/delete` — form body `id=<id>`. NOTE: this is POST, not GET (some older AllDebrid docs and wrappers say GET — confirmed POST against current v4 docs 2026-05-23).
- **Rate limit:** 12 req/sec, 600 req/min. HTTP 429 or 503 on excess.

### Premiumize (`debrid/premiumize.js` + `cacheSearch/premiumize.js`) — implements BOTH interfaces
- **Capabilities:** `{magnet:true, nzb:true}` — Premiumize natively handles NZB submissions through `/transfer/create` (the `src` field accepts magnet URIs AND NZB URLs). NZB-via-API is sparsely documented in their public API page but is widely confirmed in community use. Implement `addNzb` by calling `/transfer/create` with `src=<nzbUrl>`. If response is `{type:"container",...}` (legacy DLC/CCF/RSDF response shape), throw `PremiumizeContainerError` — PVTKRR only handles direct NZB URLs.
- **Base URL:** `https://www.premiumize.me/api/`
- **Auth:** `Authorization: Bearer <apiKey>` header (recommended — keeps key out of logs/Referer). Query param `?apikey=` and POST body `apikey=` are legacy fallbacks.
- **Cache search (`cacheSearch/premiumize.js`):**
  - `searchByTitle`: not supported — return `[]`.
  - `searchByHash(infohash)`: `GET /cache/check?items[]=magnet:?xt=urn:btih:<infohash>`. Response uses **parallel arrays** keyed by request order:
    ```json
    { "status":"success", "response":[true], "filename":["Name"], "filesize":["12345"] }
    ```
    Return `{ sourceId:'pm', name:filename[0], sizeBytes:Number(filesize[0]), infohash, directStreamUrl:null }` if `response[0]===true`, else `null`. The `directStreamUrl:null` signals to the integration layer that this is a "cached but needs add+select+unrestrict to play" hit, not an instant URL.
  - `streamUrl(hit)`: not implemented at this layer — return `hit.directStreamUrl` (always null for PM cache hits). Integration layer routes through the `DebridProvider` flow when needed.
- **DebridProvider methods:**
- **`addMagnet`:** `POST /transfer/create` — body `src=<magnet URI>`. Response:
  ```json
  { "status":"success", "id":"...", "name":"video.mkv" }
  ```
  If the source is a container (`.dlc`/`.ccf`/`.rsdf`) response is `{ status, type:"container", content:[links...] }` instead — return error from this method if `type === "container"`; PVTKRR only handles magnets.
- **`selectFiles`:** No-op. PM selects automatically.
- **`pollStatus`:** `GET /transfer/list` — no params, returns all transfers. Filter client-side by `id`. Response per transfer:
  ```json
  { "id":"...", "name":"...", "status":"running", "progress":0.42, "message":"...", "folder_id":"...", "file_id":null }
  ```
  Status values (only these are documented): `queued`, `running`, `finished`, `seeding`, `error`. Map: `queued` → `queued`, `running` → `downloading`, `finished|seeding` → `ready`, `error` → `error`. `progress` is already 0-1, use as-is. Note `folder_id` (for multi-file) AND `file_id` (for single-file) — see next.
- **`getStreamUrl`:** Two cases:
  - **Single-file transfer** (`file_id` present, `folder_id` null): rare, treat as folder of 1 — caller can still pass `fileIdx=0`.
  - **Multi-file transfer** (`folder_id` present): `GET /folder/list?id=<folder_id>` → response has `content[]` with entries `{ id, name, type:"file"|"folder", size?, mime_type?, link? }`. Recursively flatten if nested folders exist. Return `link` of the file at `fileIdx`.
- **`remove`:** `POST /transfer/delete` — body `id=<id>`. Response `{ status:"success" }`.
- **Rate limit:** Not documented as numeric quotas. Returns `{ status:"rate_limit_reached" }` (with HTTP 200) when hit. Treat that body shape as rate-limit and back off.

### Put.io (`cacheSearch/putio.js`) — CacheSearchSource ONLY
**Important:** Put.io is NOT a debrid download backend in PVTKRR's architecture. It is a *search source* — it queries the user's put.io account AND files shared by their put.io friends, returning instant-playable hits for the READY layer. Do NOT implement `DebridProvider` for put.io.

- **Base URL:** `https://api.put.io/v2/`
- **Auth:** Personal app token via `Authorization: Bearer <token>`. Users generate the token at `https://app.put.io/oauth` (one-click app create → copy token). Treat it exactly like the other providers' API keys — no real OAuth flow required.
- **`searchByTitle(title, options)`:**
  - `GET /files/search?query=<urlencoded title>` (optionally `&per_page=<limit>`).
  - Response shape: `{ status:"OK", files:[{id, name, file_type, size, parent_id, ...}], cursor: "...", total: N }`.
  - Filter results: `file_type === "VIDEO"` only.
  - If `options.year` provided: prefer results where `name` contains the year (substring match).
  - If `options.type === 'series'`: prefer results matching `S\d{2}E\d{2}` regex.
  - Return up to `options.limit` (default 10) `CacheHit` objects: `{ sourceId:'putio', name:file.name, sizeBytes:file.size, fileId:String(file.id), directStreamUrl:null }`.
- **`searchByHash(infohash)`:** Put.io has no hash index in its public API. Return `null` unconditionally. Add a code comment explaining this.
- **`streamUrl(hit)`:** `GET /files/{hit.fileId}/url` — response: `{ status:"OK", url:"https://..." }`. Return `body.url`. URLs are temporary (signed, ~24h validity) so don't cache them long-term.
- **Friends behavior:** `/files/search` natively covers files in the authenticated user's account AND files shared with them by friends. No separate friends endpoint needed for search.
- **Rate limits:** Not formally documented. Implement same retry/backoff as the others.
- **No torrent/NZB add methods.** If asked: not implementing. Out of scope per architecture decision.

## 5.5 RD filename sanitizer (`src/utils/rdFilenameSanitizer.js`)

In May 2026 Real-Debrid deployed an automated `infringing_file` filter (error code 35) triggered by keywords in filenames. The filter scans both the magnet display name (`dn=`) and the actual file names inside torrent metadata. PVTKRR can only sanitize what it controls: the `dn=` parameter of the magnet URI. **This is a partial mitigation, not a guaranteed bypass.** Sanitization helps in some cases (where the filter only looks at `dn=`) and is ineffective in others (where the filter reads internal file paths).

**Exports:**
```js
/**
 * @param {string} magnet — magnet URI
 * @returns {string} — magnet URI with sanitized dn= parameter
 */
export function sanitizeMagnet(magnet) { /* ... */ }

/**
 * @param {string} displayName — raw dn= value
 * @returns {string} — sanitized display name (keywords stripped/replaced)
 */
export function sanitizeDisplayName(displayName) { /* ... */ }

export const RD_FILTER_KEYWORDS = [/* see list below */];
```

**Keyword list to strip (case-insensitive, replace with empty string then collapse double-spaces):**
```
WEB-DL, WEBRip, WEB.DL, WEB.RIP, AMZN, NF, CR, ATVP, DSNP, MAX, HMAX, HBO, HULU,
YTS, RARBG, FGT, NTb, EVO, GHOST, MeGusta, AFG, NIIN, TGx, GalaxyRG, AOC,
PSA, ETHEL, FLUX, EDITH, FraMeSToR, CMRG
```

(This list is the consensus from community testing as of 2026-05-23 — see ElfHosted's May 2026 analysis and the Debrid Media Manager filter-list. Codex should add the keywords as written above; expand later as community findings update.)

**Algorithm:**
1. Parse magnet URI — extract `dn=` value (URL-decoded).
2. For each keyword: case-insensitive replace with `""`.
3. Collapse `\s+` to single space, trim.
4. If sanitized name is empty or just punctuation: use `"file"` as fallback `dn=`.
5. Re-encode and rebuild magnet URI with new `dn=`, preserving all other params (`xt=`, `tr=`, etc.) verbatim.

**Tests:** at minimum 8 cases in `scripts/smoke-rd-sanitizer.js`:
- WEB-DL stripped from middle of name
- Multiple keywords in one name
- Keywords as substring of a word should NOT be stripped (e.g. don't strip "NF" from "INFAMOUS") — use word-boundary regex
- Empty `dn=` after sanitization → fallback
- Magnet with no `dn=` → unchanged
- Magnet with multiple `tr=` trackers → all preserved
- Unicode characters in title preserved
- Result is still a valid magnet URI

---

## 5.6 Newznab indexer adapter (`src/clients/prowlarr/newznab.js`)

Prowlarr already supports Newznab-protocol indexers (NZBGeek, DrunkenSlug, NZBHydra2, etc.) the same way it supports Torznab. PVTKRR's existing Prowlarr client reads Torznab results today; it needs to ALSO recognize Newznab results and route them differently.

**Important:** You do NOT modify the existing Prowlarr client. You create an adapter module that the Prowlarr client can compose. Claude Code will do the actual wiring later.

**Exports:**
```js
/**
 * @typedef {{
 *   protocol: 'torrent' | 'usenet',
 *   title: string,
 *   sizeBytes: number,
 *   sourceUrl: string,        // magnet URI for torrent, NZB download URL for usenet
 *   infohash?: string,        // torrent only
 *   indexer: string,          // human-readable indexer name from Prowlarr
 *   publishDate?: string,     // ISO 8601
 *   seeders?: number,         // torrent only
 *   grabs?: number            // usenet equivalent of seeders, optional
 * }} NormalizedSearchResult
 */

/**
 * Detect whether a raw Prowlarr/Torznab/Newznab XML result is a Usenet (NZB) item.
 * @param {object} rawItem — single <item> from Prowlarr's XML response
 * @returns {'torrent' | 'usenet'}
 */
export function detectProtocol(rawItem) { /* ... */ }

/**
 * Normalize a single raw Prowlarr item (either protocol) into a NormalizedSearchResult.
 * For Usenet: sourceUrl is the NZB download link, infohash is absent.
 * For torrent: sourceUrl is the magnet URI, infohash is extracted from xt=urn:btih:.
 * @param {object} rawItem
 * @returns {NormalizedSearchResult}
 */
export function normalizeResult(rawItem) { /* ... */ }
```

**Detection rules (in order):**
1. If `<enclosure type>` contains `application/x-nzb` → `usenet`.
2. If `<link>` ends in `.nzb` (after stripping query string) → `usenet`.
3. If presence of `<newznab:attr name="usenetdate">` element → `usenet`.
4. Otherwise → `torrent`.

**Tests in `scripts/__tests__/prowlarr/newznab.test.js`:** at least one canned XML response per indexer family (NZBGeek, NZBHydra2, generic Newznab) plus one Torznab control to confirm detection doesn't false-positive.

---

## 6. Bootstrap manifest lock — CRITICAL

The repo has a **locked** bootstrap manifest. Two constants in `src/config/manifest.js` MUST NOT change:

- `PUBLIC_BOOTSTRAP_MANIFEST_NAME = "PVTKRR"`
- `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION` (a long pinned string)

You are not editing this file at all in this brief. If your work somehow causes a smoke test to compare against these, **do not change the constants** — flag it instead.

Also: the hostname `pvt.kepners.co.uk` must NEVER appear in any file you write. Only `https://www.pvtkrrx.cc` is the public hostname. Your code does not need to reference either hostname at all, so the easy answer is "don't mention them."

## 7. Shared HTTP rules (apply to all four services across both interfaces)

In `debrid/base.js`, export a `fetchWithRetry(url, opts, ctx)` helper used by all clients (debrid AND cacheSearch). `ctx = { serviceId, endpoint }` is for logging only.

- Uses `globalThis.fetch` (Node 20+, no dependency needed)
- 10 second timeout via `AbortController`
- 2 retries on 5xx with exponential backoff (500ms, 1500ms)
- No retry on 4xx
- On 429: respect `Retry-After` header if present, otherwise back off 5s then retry once
- On any non-2xx after retries: throw `ServiceApiError` with `{ serviceId, endpoint, status, body }` — do NOT include the API key in the error
- **Never log the API key.** Log format: `[svc:{serviceId}] {method} {endpoint} → {status}` only.
- `cacheSearch/base.js` re-exports `fetchWithRetry` and `ServiceApiError` from `debrid/base.js` to avoid duplication.

## 8. `src/utils/debridCache.js` — parallel cache search

This utility fans out across configured `CacheSearchSource` instances. It does NOT touch `DebridProvider` — that's the integration layer's job.

```js
/**
 * @param {Array<{type: CacheSearchSourceId, apiKey: string, enabled: boolean}>} configuredSources
 * @param {{ title?: string, infohash?: string, year?: number, type?: 'movie'|'series' }} query
 * @returns {Promise<CacheHit[]>} — flat array of hits across all sources, deduplicated by (sourceId, fileId|infohash)
 */
export async function searchAllSources(configuredSources, query) { /* ... */ }
```

**Behavior:**
- Filter to `enabled === true` sources only.
- For each source: if `query.infohash` present → call `searchByHash`; else if `query.title` present → call `searchByTitle(query.title, {year, type})`.
- Fan out in parallel via `Promise.allSettled`. Failures in one source do NOT abort the others — log and continue.
- 60-second in-memory memo keyed by `JSON.stringify({sourceId, query})`. No disk persistence.
- Order results: hits from sources earlier in `configuredSources` array first.
- Dedupe: drop entries with duplicate `(sourceId, fileId)` or `(sourceId, infohash)` keys.

## 9. Mocks

Two mock factories, both used by smoke + unit tests, zero real HTTP.

### `src/clients/debrid/__mock__.js`
A `MockDebridProvider` factory:
```js
{
  id: 'rd',
  capabilities: { magnet:true, nzb:false },
  pollSequence: ['queued', 'downloading', 'ready'],   // states returned on successive polls
  failOn: { addMagnet: false, addNzb: 'UnsupportedCapabilityError', ... }
}
```

### `src/clients/cacheSearch/__mock__.js`
A `MockCacheSearchSource` factory:
```js
{
  id: 'putio',
  titleHits: {
    'remarkably bright creatures': [{ name:'...', sizeBytes:n, fileId:'42', directStreamUrl:'http://mock/42.mkv' }],
  },
  hashHits: {
    'abc123def...': { name:'...', sizeBytes:n, infohash:'abc123def...' },
  },
  failOn: { searchByTitle: false, ... }
}
```

## 10. Smoke tests

### `scripts/smoke-debrid.js`
Mirror the style of one existing smoke file (read `scripts/smoke-config.js` first to match patterns — but do not edit it). Cover at minimum:

**Debrid providers (using debrid mock):**
- `addMagnet` flow on RD (with sanitization) → addedId returned
- `addMagnet` flow on AD → addedId returned
- `addMagnet` flow on PM → addedId returned
- `addNzb` on PM → addedId returned
- `addNzb` on RD throws `UnsupportedCapabilityError`
- `addNzb` on AD throws `UnsupportedCapabilityError`
- `pollStatus` state transitions through queued → downloading → ready
- `getStreamUrl` returns the expected mock URL
- RD `addMagnet` against a magnet whose `dn=` contains "WEB-DL" — verify the magnet sent to the mock has "WEB-DL" stripped

**Cache search sources (using cacheSearch mock):**
- `searchByTitle` on put.io returns hits
- `searchByHash` on put.io returns null (unsupported)
- `searchByHash` on PM returns a hit for a known-cached infohash
- `searchByTitle` on PM returns `[]` (unsupported)
- `searchAllSources` parallel fan-out: returns merged results from both sources
- 60s memo: second call within window doesn't re-hit the mock
- Disabled source is skipped
- One source erroring does not break the other (Promise.allSettled behavior)
- Dedup by (sourceId, fileId|infohash) works

**Across both:**
- Stdout shows zero API keys (grep the captured output for "Bearer " — should only appear in mock request inspection, never in log lines)

Exit code 0 on pass, 1 on any failure. Print a one-line summary: `[smoke-debrid] PASS (N checks)` or `[smoke-debrid] FAIL: <reason>`.

### `scripts/smoke-rd-sanitizer.js`
Focused regression suite for the sanitizer — the 8 cases listed in §5.5. Same exit-code + summary convention.

## 11. Unit tests

One file per service, using plain Node `assert` (no test framework dep). Stub `globalThis.fetch` with a function that returns canned `Response` objects. Each file: happy path for every method on the interface + one error path per method. Each test file callable standalone: `node scripts/__tests__/debrid/realdebrid.test.js` etc.

Coverage matrix:

| File | Methods to test |
|---|---|
| `__tests__/debrid/realdebrid.test.js` | addMagnet (with sanitization called), selectFiles, pollStatus (all state mappings), getStreamUrl (two-step unrestrict), remove, RdInfringingFileError on 403 error_code 35, addNzb throws UnsupportedCapabilityError |
| `__tests__/debrid/alldebrid.test.js` | addMagnet, pollStatus (statusCode mappings 0-15), flattenAdTree helper, getStreamUrl (two-step unlock), remove (POST not GET), addNzb throws UnsupportedCapabilityError |
| `__tests__/debrid/premiumize.test.js` | addMagnet, addNzb (success + container error), pollStatus, getStreamUrl (folder.list flatten), remove, rate_limit_reached handling |
| `__tests__/cacheSearch/putio.test.js` | searchByTitle (VIDEO filter, year preference, S?E? preference), searchByHash returns null, streamUrl |
| `__tests__/cacheSearch/premiumize.test.js` | searchByHash (parallel array shape), searchByTitle returns [], streamUrl returns null |
| `__tests__/prowlarr/newznab.test.js` | detectProtocol all 4 rules + control torrent, normalizeResult for both protocols |

Check repo for any existing `scripts/__tests__/` convention before starting — match what's there if anything.

## 12. Style

- ESM (`import`/`export`) — confirm via `package.json` `"type":"module"`.
- Node 20+ syntax. `globalThis.fetch`, no `node-fetch` import.
- 2-space indent, single quotes, semicolons. (Match repo style — open one file in `src/` to confirm.)
- **No dependencies added to `package.json`.** If you think you need one, stop and write a note in §15.
- Comments only where the WHY is non-obvious (e.g. the RD `instantAvailability` removal note, the AD-files-are-a-tree note, the May 2026 RD filter context).

## 13. Acceptance — done means

- [ ] All files in §2 exist (debrid clients + cacheSearch clients + sanitizer + newznab adapter + utility + smokes + unit tests)
- [ ] Zero files outside §2 are modified
- [ ] All `DebridProvider` implementations expose `capabilities` correctly
- [ ] All `CacheSearchSource` implementations handle their unsupported methods per §4.2
- [ ] RD sanitizer applied automatically inside `realdebrid.addMagnet` (not opt-in)
- [ ] `node scripts/smoke-debrid.js` exits 0
- [ ] `node scripts/smoke-rd-sanitizer.js` exits 0
- [ ] Every file in `scripts/__tests__/` exits 0 when run standalone
- [ ] `grep -r "pvt\.kepners\|kepners\.co\.uk" src/clients src/utils/debridCache.js src/utils/rdFilenameSanitizer.js scripts/smoke-debrid.js scripts/smoke-rd-sanitizer.js` returns nothing
- [ ] No API key ever appears in any captured stdout/stderr from the smoke suites
- [ ] No new dependency in `package.json`
- [ ] No file outside `src/clients/`, `src/utils/`, `scripts/` touched

## 14. When you finish

- Do NOT commit, push, or open a PR.
- Do NOT modify `package.json`.
- Append a `## 15. Codex completion notes` section to this brief listing: files created, any deviations from the spec, provider-API edge cases you hit, line counts per file, and any items you couldn't complete with reason.
- Claude Code will then: run the smoke tests, wire the clients into the live stream handler (per CC-A through CC-J in the companion plan), update `package.json`, implement the debrid-first / sports-always-debrid routing rules, and ship v1.3.

---

**End of brief. Do not exceed the scope above.**

## 15. Codex completion notes
*(Codex appends this section when done.)*
