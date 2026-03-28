# Stremio Addon Protocol — Comprehensive Reference

> Compiled from official SDK source code, GitHub documentation, and protocol specification.
> Last updated: 2026-03-26

---

## Table of Contents

1. [What IS a Stremio Addon?](#1-what-is-a-stremio-addon)
2. [The Manifest](#2-the-manifest)
3. [How Streams Work](#3-how-streams-work)
4. [The Request/Response Cycle](#4-the-requestresponse-cycle)
5. [ID Formats](#5-id-formats)
6. [Catalog Resource](#6-catalog-resource)
7. [Meta Resource](#7-meta-resource)
8. [Common Pitfalls](#8-common-pitfalls)
9. [stremio-addon-sdk Internals](#9-stremio-addon-sdk-internals)
10. [Transport Protocol](#10-transport-protocol)
11. [Addon Installation](#11-addon-installation)
12. [Cache Control](#12-cache-control)
13. [Subtitles Resource](#13-subtitles-resource)
14. [Meta Links](#14-meta-links)
15. [Content Types](#15-content-types)
16. [Stream Source Types (Complete)](#16-stream-source-types-complete)

---

## 1. What IS a Stremio Addon?

### It's a URL, not an "app"

A Stremio addon is **not** an application that runs inside Stremio. It is an **HTTP server** (or static file host) that responds to standardized URL patterns with JSON. Stremio discovers addons by their **Transport URL** — the URL to the addon's `manifest.json`.

### How Stremio discovers addons

1. User provides a manifest URL (e.g., `https://myaddon.com/manifest.json`)
2. Stremio fetches the manifest and reads what the addon provides (catalogs, streams, meta, subtitles)
3. Stremio stores the manifest URL locally as an "installed" addon
4. From then on, Stremio makes HTTP GET requests to the addon whenever it needs data the addon declared it can provide

### Lifecycle

```
User provides URL → Stremio fetches /manifest.json → Addon is "installed"
                                                          ↓
User browses content → Stremio calls /catalog/... → Addon returns metas
User clicks item    → Stremio calls /meta/...    → Addon returns metadata
User wants to play  → Stremio calls /stream/...  → Addon returns stream sources
```

### Key insight: Addons are stateless from Stremio's perspective

Stremio has **no push mechanism**. It cannot receive notifications from addons. It only pulls data by making HTTP requests. The addon has no way to "push" updates to Stremio — the client re-requests data based on `cacheMaxAge` headers.

---

## 2. The Manifest

The manifest is the **single most important file**. It's served at `/manifest.json` (or `/:config/manifest.json` for configurable addons) and tells Stremio everything about what the addon provides.

### Required fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique dot-separated identifier | `"com.stremio.filmon"` |
| `name` | string | Human-readable name | `"My Addon"` |
| `description` | string | Human-readable description | `"Streams from my sources"` |
| `version` | string | Semantic version | `"1.2.3"` |
| `resources` | array | What resources the addon handles | `["catalog", "stream"]` |
| `types` | array | What content types the addon works with | `["movie", "series"]` |
| `catalogs` | array | List of catalog definitions (can be `[]`) | See below |

### Size limit

**Manifest must be under 8KB** when JSON-stringified. The SDK enforces this — exceeding it throws an error: `"manifest size exceeds 8kb, which is incompatible with addonCollection API"`.

### `resources` — What the addon provides

Resources can be **strings** or **objects**:

```js
// Simple: uses manifest-level types and idPrefixes for all resources
resources: ["catalog", "meta", "stream", "subtitles"]

// Advanced: per-resource type and idPrefix filtering
resources: [
  "catalog",  // uses manifest.types
  "meta",     // uses manifest.types
  { name: "stream", types: ["movie"], idPrefixes: ["tt"] }  // only movies with IMDB IDs
]
```

Available resource names: `catalog`, `meta`, `stream`, `subtitles`, `addon_catalog`

**When a resource is a string**, it inherits the manifest's top-level `types` and `idPrefixes`.
**When a resource is an object** `{ name, types, idPrefixes? }`, it uses its own filtering.

The `idPrefixes` filtering **does NOT apply to `catalog`** — catalogs are always requested if defined in `catalogs[]`.

### `types` — Content types

```js
types: ["movie", "series", "channel", "tv"]
```

| Type | Description |
|------|-------------|
| `movie` | Feature films. Single video per meta item. |
| `series` | TV series. Has episodes via Video Objects (season/episode). |
| `channel` | YouTube-style channels. Has uploaded videos. |
| `tv` | Live TV. Streams should be live (no duration). |

### `idPrefixes` — ID filtering (optional, top-level)

```js
idPrefixes: ["tt", "yt_id:"]
```

If set, the addon will **only be called** for content IDs starting with these prefixes. For example, `["tt"]` means only IMDB IDs.

Can also be set per-resource in the advanced resource object format.

### `catalogs` — Catalog definitions

Each catalog is an object:

```js
catalogs: [
  {
    type: "movie",           // REQUIRED: content type
    id: "my-movies",         // REQUIRED: unique catalog ID within this addon
    name: "My Movies",       // REQUIRED: human-readable name
    extra: [                 // OPTIONAL: extra query parameters supported
      { name: "search", isRequired: false },
      { name: "genre", isRequired: false, options: ["Action", "Comedy"] },
      { name: "skip", isRequired: false }
    ]
  }
]
```

**Extra properties:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Parameter name (`search`, `genre`, `skip`) |
| `isRequired` | boolean | If `true`, catalog is ONLY requested with this param (e.g., search-only catalog) |
| `options` | string[] | Pre-set list of values (used for genre dropdowns) |
| `optionsLimit` | number | Max values user can select from options (default: 1) |

**Standard pagination:** Stremio uses `skip` in multiples of 100. If you return fewer than 100 items, Stremio considers it the end of the catalog.

### `behaviorHints` — Runtime behavior

```js
behaviorHints: {
  adult: false,               // Contains adult content (shows warning)
  p2p: false,                 // Contains P2P content (IP visibility warning)
  configurable: true,         // Addon supports user configuration
  configurationRequired: true // Addon REQUIRES configuration before use
}
```

**Configuration flow:**
- `configurable: true` → Shows "Install" + "Configure" buttons
- `configurationRequired: true` → Shows ONLY "Configure" button (no Install)
- When a user configures an addon, the config is embedded in the URL path: `/{configJSON}/manifest.json`
- After configuration, the SDK **removes** `configurationRequired` and `configurable` from the served manifest (so the addon becomes installable)

### `config` — User settings fields

```js
config: [
  { key: "apiKey", type: "text", title: "API Key", required: true },
  { key: "quality", type: "select", title: "Quality", options: ["720p", "1080p", "4K"] },
  { key: "adultContent", type: "checkbox", title: "Show adult content", default: "checked" }
]
```

| Type | Description |
|------|-------------|
| `text` | Single-line text input |
| `number` | Numeric input |
| `password` | Masked text input |
| `checkbox` | Boolean. `default: "checked"` to enable by default |
| `select` | Dropdown. Requires `options` array. |

**Important:** If `config` is set but `behaviorHints.configurable` is not `true`, the SDK warns: `"manifest.config is set but manifest.behaviorHints.configurable is disabled, the Configure button will not show"`.

### Visual metadata

```js
background: "https://example.com/bg.png",  // Min 1024x786, PNG/JPG
logo: "https://example.com/logo.png",       // 256x256, monochrome PNG
contactEmail: "support@example.com"          // Used for Report button
```

---

## 3. How Streams Work

### The `stream` resource

When a user clicks "play" on a movie or selects a video (episode) in a series, Stremio calls:

```
GET /stream/{type}/{videoID}.json
```

The addon returns `{ streams: [Stream, Stream, ...] }`.

**Streams should be ordered from highest to lowest quality.**

### Stream Object — Source types

Every Stream Object must include **exactly one** of these source properties:

#### `url` — Direct HTTP stream (most common)

```js
{
  url: "https://example.com/video.mp4",
  name: "1080p",
  description: "Direct stream",
  behaviorHints: {
    filename: "movie.mp4"  // HIGHLY recommended for subtitle matching
  }
}
```

- Must be HTTP(S) by default
- Must be MP4 over HTTPS for web-ready streams
- For non-MP4 or non-HTTPS, set `behaviorHints.notWebReady: true`
- Also supports FTP(S) and RTMP (client-dependent)
- **Stremio follows 302/307 redirects** on `url` values (key for delayed/proxy patterns)

#### `infoHash` — BitTorrent

```js
{
  infoHash: "abc123def456...",
  fileIdx: 0,  // Index of video file in torrent (optional; largest file if omitted)
  sources: [
    "tracker:udp://tracker.example.com:1337",
    "dht:abc123..."
  ]
}
```

- `fileIdx` is optional — if omitted, the largest file in the torrent is selected
- `sources` provides additional tracker URLs and DHT nodes for peer discovery
- **WARNING:** DHT may be prohibited by private trackers

#### `ytId` — YouTube video

```js
{
  ytId: "dQw4w9WgXcQ",
  name: "YouTube"
}
```

Uses Stremio's built-in YouTube player.

#### `externalUrl` — Open in browser

```js
{
  externalUrl: "https://www.netflix.com/watch/12345"
}
```

Opens the URL in the user's browser. Can also be a **Meta Link** (see section 14).

#### `nzbUrl` — Usenet (NZB)

```js
{
  nzbUrl: "https://example.com/file.nzb",
  servers: ["nntps://user:pass@news.example.com:563/4"],
  fileIdx: 0
}
```

#### Archive sources: `rarUrls`, `zipUrls`, `7zipUrls`, `tgzUrls`, `tarUrls`

Arrays of Source Objects `{ url, bytes? }` pointing to archive files. Multi-volume supported (except tar).

### Stream Object — Display properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Stream quality label (e.g., "1080p", "4K HDR") |
| `description` | string | Stream description text |
| `title` | string | **DEPRECATED** — use `description` instead |
| `subtitles` | Subtitle[] | Inline subtitle tracks for this stream |

### Stream Object — `behaviorHints`

```js
behaviorHints: {
  // Geo-restriction
  countryWhitelist: ["gbr", "usa"],   // ISO 3166-1 alpha-3, lowercase

  // Web readiness
  notWebReady: true,                  // Required for non-HTTPS or non-MP4 URLs

  // Binge watching
  bingeGroup: "myAddon-720p",         // Auto-select same group for next episode

  // Proxy headers (REQUIRES notWebReady: true)
  proxyHeaders: {
    request: { "Authorization": "Basic abc123", "User-Agent": "Stremio" },
    response: { "Content-Type": "video/mp4" }
  },

  // Subtitle matching (when streaming server is offline)
  videoHash: "abc123...",              // OpenSubtitles hash
  videoSize: 1500000000,              // File size in bytes
  filename: "Movie.2024.1080p.mp4"    // Filename for subtitle identification
}
```

**`bingeGroup` explained:** When watching a series, if the current episode's stream has `bingeGroup: "myAddon-720p"` and the next episode also has a stream with the same `bingeGroup`, Stremio will **automatically select that stream** for the next episode without user intervention.

**`proxyHeaders` explained:** Sends custom HTTP headers with stream requests. The `request` object adds headers to the outgoing request (e.g., Authorization). The `response` object sets headers on the response. **Both require `notWebReady: true`.**

**`filename` warning:** The SDK prints a console warning if you return streams with `url` but without `behaviorHints.filename`: `"streams include stream.url but do not include stream.behaviorHints.filename, this is not recommended, subtitles may not be retrieved for these streams"`.

---

## 4. The Request/Response Cycle

### URL pattern

All requests follow this pattern:

```
GET /{config?}/{resource}/{type}/{id}/{extra?}.json
```

Where:
- `{config?}` — Optional JSON-encoded user config (for configurable addons)
- `{resource}` — `catalog`, `meta`, `stream`, `subtitles`
- `{type}` — `movie`, `series`, `channel`, `tv`
- `{id}` — Content/video identifier
- `{extra?}` — Optional query-string-encoded extra parameters

### Example request flow: User opens a movie

```
1. User clicks on a movie in a catalog
   → GET /meta/movie/tt1234567.json
   ← { meta: { id: "tt1234567", name: "Movie", ... } }

2. User clicks "play" / views streams
   → GET /stream/movie/tt1234567.json
   ← { streams: [{ url: "https://...", name: "1080p" }, ...] }
```

### Example request flow: User opens a TV series episode

```
1. User clicks on a series
   → GET /meta/series/tt0898266.json
   ← { meta: { id: "tt0898266", name: "Big Bang Theory", videos: [...] } }

2. User selects Season 9, Episode 17
   → GET /stream/series/tt0898266:9:17.json
   ← { streams: [{ url: "https://...", name: "1080p" }, ...] }
```

### Example request flow: Catalog browsing

```
1. Feed (page 1)
   → GET /catalog/movie/my-movies.json
   ← { metas: [{ id: "tt123", name: "Movie 1", poster: "..." }, ...] }

2. Feed (page 2)
   → GET /catalog/movie/my-movies/skip=100.json
   ← { metas: [...next 100 items...] }

3. Search
   → GET /catalog/movie/my-movies/search=batman.json
   ← { metas: [...search results...] }

4. Genre filter
   → GET /catalog/movie/my-movies/genre=Action.json
   ← { metas: [...filtered results...] }

5. Combined (genre + skip)
   → GET /catalog/movie/my-movies/genre=Action&skip=100.json
   ← { metas: [...] }
```

### Extra parameters encoding

Extra parameters are **NOT** passed as query strings (`?key=value`). They are part of the **URL path**, encoded as a querystring-formatted segment before `.json`:

```
/catalog/movie/my-movies/search=game%20of%20thrones&skip=100.json
                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                         This is the "extra" segment, NOT a query string
```

The SDK parses this using `qs.parse()` on the URL segment (after stripping `.json`).

### Configurable addon URL structure

For addons with `config`, the user's configuration is JSON-encoded into the URL path:

```
/{base64/JSON config}/manifest.json
/{base64/JSON config}/stream/movie/tt1234567.json
```

The SDK parses `req.params.config` with `JSON.parse()`. The handler receives it as `args.config`.

### Response format

All responses are JSON with `Content-Type: application/json; charset=utf-8`.

---

## 5. ID Formats

### Movies

For movies, the **meta ID** and **video ID** are the same:

```
Meta ID:  tt1234567       (IMDB ID)
Video ID: tt1234567       (same as meta ID)

Stream request: /stream/movie/tt1234567.json
```

### TV Series (IMDB / Cinemeta)

For series provided by Cinemeta (IMDB-based), the **video ID** includes season and episode:

```
Meta ID:  tt0898266                    (the series itself)
Video ID: tt0898266:9:17               (series:season:episode)

Stream request: /stream/series/tt0898266:9:17.json
Meta request:   /meta/series/tt0898266.json
```

The format is: `{imdbId}:{season}:{episode}`

### Custom IDs

Addons can use any ID format with a custom prefix:

```
Meta ID:  myprefix:12345
Video ID: myprefix:12345              (movies, single video)
Video ID: myprefix:12345:1:3          (series, custom convention)
```

When using custom IDs (not `tt` prefix), you **must** implement `meta` handler — Cinemeta only handles IMDB IDs.

### YouTube IDs

```
yt_id:UCrDkAvwZum-UTjHmzDI2iIw                    (channel)
yt_id:UCrDkAvwZum-UTjHmzDI2iIw:9bZkp7q19f0        (specific video)
```

### Key rule

If you use `tt` (IMDB) IDs, you can skip the `meta` handler entirely — Stremio's built-in **Cinemeta** addon handles all IMDB metadata. You only need `stream` (and optionally `catalog`).

---

## 6. Catalog Resource

### What catalogs do

Catalogs provide **browsable lists of content** that appear on Stremio's Discover page and Board (home screen). They return **Meta Preview Objects** — lightweight metadata for grid display.

### Request

```
GET /catalog/{type}/{catalogId}.json
GET /catalog/{type}/{catalogId}/{extra}.json
```

### Handler signature

```js
builder.defineCatalogHandler(function(args) {
  // args.type   = "movie" | "series" | "channel" | "tv"
  // args.id     = catalog ID from manifest (e.g., "my-movies")
  // args.extra  = { search: "query", genre: "Action", skip: 100 }
  // args.config = user configuration object

  return Promise.resolve({ metas: [MetaPreview, MetaPreview, ...] })
})
```

### Meta Preview Object (returned by catalogs)

```js
{
  id: "tt1234567",                    // REQUIRED: universal identifier
  type: "movie",                      // REQUIRED: content type
  name: "Big Buck Bunny",             // REQUIRED: display name
  poster: "https://example.com/p.jpg", // REQUIRED: poster image URL

  // Optional display fields:
  posterShape: "poster",              // "poster" (1:0.675), "square" (1:1), "landscape" (1:1.77)
  genres: ["Animation", "Comedy"],    // Genre tags
  imdbRating: "7.4",                  // IMDb rating string (0.0-10.0)
  releaseInfo: "2008",                // Year. For series: "2000-2014" or "2000-"
  description: "A short description",
  director: ["Director Name"],
  cast: ["Actor 1", "Actor 2"],
  links: [MetaLink, ...],
  trailers: [{ source: "ytVideoId", type: "Trailer" }]
}
```

**Poster specs:** Accepted aspect ratios 1:0.675 (IMDb poster type) or 1:1 (square). Max 100KB, recommended under 50KB.

### Catalogs vs Streams

| Aspect | Catalog | Stream |
|--------|---------|--------|
| Returns | Meta Preview Objects (browsable items) | Stream Objects (playable sources) |
| Purpose | Content discovery / navigation | Content playback |
| When called | User browses Discover page or searches | User opens detail page / clicks play |
| Can exist without the other? | Yes — catalog-only addon is valid | Yes — stream-only addon is valid |
| idPrefixes filtering | Does NOT apply (always requested) | Applies normally |

**A catalog-only addon** is useful for curating content lists — the actual streams come from other installed addons.

**A stream-only addon** provides streams for content discovered through other addons (like Cinemeta).

---

## 7. Meta Resource

### What meta does

Meta provides **detailed metadata** for a content item — the full detail page in Stremio. It's called when a user clicks on an item to see its detail page.

### Request

```
GET /meta/{type}/{id}.json
```

### Handler signature

```js
builder.defineMetaHandler(function(args) {
  // args.type   = "movie" | "series" | "channel" | "tv"
  // args.id     = meta item ID (e.g., "tt1234567")
  // args.config = user configuration object

  return Promise.resolve({ meta: MetaObject })
})
```

### Full Meta Object

```js
{
  // Required
  id: "tt1234567",
  type: "movie",
  name: "Movie Name",

  // Visual
  poster: "https://example.com/poster.jpg",
  posterShape: "poster",
  background: "https://example.com/bg.jpg",    // Detail page background (max 500KB)
  logo: "https://example.com/logo.png",         // Detail page logo

  // Metadata
  genres: ["Action", "Sci-Fi"],
  description: "A few sentences about the movie.",
  releaseInfo: "2024",
  released: "2024-06-15T00:00:00.000Z",  // ISO 8601
  runtime: "120m",
  language: "English",
  country: "USA",
  awards: "3 Oscar nominations",
  website: "https://official-site.com",
  imdbRating: "8.1",
  director: ["Director Name"],
  cast: ["Actor 1", "Actor 2"],

  // Links (replaces deprecated genres/director/cast arrays)
  links: [
    { name: "Christopher Nolan", category: "director", url: "stremio:///search?search=Christopher%20Nolan" },
    { name: "Sci-Fi", category: "genre", url: "stremio:///discover/..." }
  ],

  // Trailers
  trailers: [
    { source: "ytVideoId", type: "Trailer" }
    // Future: will become Stream Objects
  ],

  // Videos (REQUIRED for series/channel, auto-generated for movies)
  videos: [Video, Video, ...],

  // Behavior
  behaviorHints: {
    defaultVideoId: "tt1234567:1:1"  // Open directly to this video's streams
  }
}
```

### Video Object (for series/channels)

```js
{
  id: "tt0108778:1:1",                    // REQUIRED: video ID
  title: "Pilot",                          // REQUIRED: video title
  released: "1994-09-22T20:00:00.000Z",   // REQUIRED: ISO 8601 air date

  // Optional
  season: 1,
  episode: 1,
  thumbnail: "https://example.com/thumb.jpg",  // Max 5KB
  overview: "Monica and the gang...",
  available: true,                              // Explicitly mark as streamable
  streams: [StreamObject, ...],                 // Inline streams (exclusive — skips other addons)
  trailers: [StreamObject, ...]                 // Video-level trailers
}
```

**Critical:** If `videos` is not provided for a movie type, Stremio assumes the meta item has ONE video with an ID equal to the meta item ID. For series, you MUST provide `videos` with season/episode data.

**Inline streams:** If you provide `video.streams`, Stremio will **NOT request streams from any other addon** for that video. Use with caution.

---

## 8. Common Pitfalls

### 1. CORS — The #1 reason addons "don't talk back"

**Every route must serve CORS headers that allow all origins.** The SDK handles this automatically via the `cors` npm package. If you're building without the SDK, you must set:

```
Access-Control-Allow-Origin: *
```

on ALL responses, including `/manifest.json`.

**Without CORS, Stremio Web and the desktop app will silently fail to load the addon.**

### 2. HTTPS requirement

- Addons must be served over **HTTPS** for remote deployment
- **Exception:** `127.0.0.1` (localhost) — HTTP is allowed
- **NOT an exception:** `192.168.x.x` or other LAN IPs — Stremio rewrites these to HTTPS, which fails without a valid cert
- `localhost` hostname also works with HTTP in some clients

### 3. Manifest validation failures

- Manifest must be **valid JSON**
- Manifest must be **under 8KB**
- `resources` and `types` must be **non-empty arrays**
- `catalogs` must be an array (can be empty `[]` if no catalog resource)
- SDK lints the manifest on construction and throws on invalid configs

### 4. Response format mismatches

```js
// WRONG — will silently fail
return { stream: { url: "..." } }

// CORRECT
return { streams: [{ url: "..." }] }

// WRONG
return { meta: [{ id: "..." }] }

// CORRECT (meta is object, not array)
return { meta: { id: "..." } }

// CORRECT (catalog returns array of metas)
return { metas: [{ id: "..." }] }
```

### 5. Missing `filename` behaviorHint for URL streams

The SDK warns if streams use `url` without `behaviorHints.filename`. Without it, subtitle addons may not find correct subtitles.

### 6. Handler not matching manifest

The SDK validates that every resource declared in `manifest.resources` has a corresponding handler, and vice versa. Mismatches throw errors at build time.

### 7. Extra parameters not declared in catalog

If your catalog supports search but you don't declare `extra: [{ name: "search" }]`, Stremio will never send search queries to that catalog.

### 8. Returning more than 100 items

Stremio's standard page size is 100. Return exactly 100 to signal "more pages available". Return fewer than 100 to signal "end of catalog".

### 9. `notWebReady` not set for non-standard streams

If your `url` is not MP4 over HTTPS, you must set `behaviorHints.notWebReady: true`, or Stremio Web will fail to play it.

### 10. `proxyHeaders` without `notWebReady`

`proxyHeaders` only works when `notWebReady: true` is also set. Without it, the headers are ignored.

### 11. Series stream ID format

Stream requests for series episodes use the VIDEO ID (e.g., `tt0898266:9:17`), NOT the meta/series ID (`tt0898266`). Your stream handler receives the full video ID including season:episode.

---

## 9. stremio-addon-sdk Internals

### Architecture: Three layers

```
AddonBuilder (builder.js)
    ↓ .getInterface()
AddonInterface { manifest, get(resource, type, id, extra, config) }
    ↓ passed to
serveHTTP / getRouter
    ↓
Express HTTP server with protocol-compliant routes
```

### `AddonBuilder` (builder.js)

- Accepts manifest, validates with `stremio-addon-linter`
- Freezes manifest object (immutable after construction)
- Enforces 8KB manifest size limit
- Provides `.defineCatalogHandler()`, `.defineMetaHandler()`, `.defineStreamHandler()`, `.defineSubtitlesHandler()`, `.defineResourceHandler(resource, fn)`
- All `define*Handler` methods are just `.defineResourceHandler.bind(this, resourceName)`
- Prevents duplicate handler registration
- `.getInterface()` validates all handlers match manifest, returns `AddonInterface`

### `AddonInterface`

An immutable object with:
- `manifest` — frozen manifest
- `get(resource, type, id, extra, config)` — dispatches to the correct handler

### `getRouter` (getRouter.js) — The actual HTTP routing

Creates an Express router with these routes:

```
GET /:config?/manifest.json
GET /:config?/:resource(catalog|meta|stream|subtitles)/:type/:id/:extra?.json
```

Key behaviors:
1. **CORS is applied globally** via `cors()` middleware — mandatory per protocol
2. **Config prefix** is only added if `manifest.config` has entries
3. **Resource regex** is built dynamically from manifest resources: `(catalog|meta|stream|...)`
4. **Extra parameters** are parsed from the URL path (not query string) using `qs.parse()`
5. **Config handling:** If present, parsed with `JSON.parse()` and passed to handler
6. **Cache headers** are set from response properties (`cacheMaxAge`, `staleRevalidate`, `staleError`)
7. **307 redirects** are supported via `resp.redirect` in handler response
8. **Error handling:** Missing handler → 404, handler error → 500

### `serveHTTP` (serveHTTP.js) — The HTTP server

- Creates Express app
- Sets global `Cache-Control` headers (from `opts.cacheMaxAge`)
- Mounts the router from `getRouter`
- Optionally serves static files
- Generates landing page HTML from manifest
- Handles `/configure` redirect for configurable addons
- Supports `--launch` flag (opens Stremio Web staging) and `--install` flag (opens desktop app)

### Routes created by the SDK

For an addon with `resources: ["catalog", "stream"]` and `config`:

```
GET /:config?/manifest.json
GET /:config?/catalog/:type/:id/:extra?.json
GET /:config?/stream/:type/:id/:extra?.json
GET /                              (landing page or redirect to /configure)
GET /configure                     (configuration page, if configurable)
```

---

## 10. Transport Protocol

### Supported transports

| URL Pattern | Transport |
|------------|-----------|
| `https://.../manifest.json` | HTTP transport |
| `http://127.0.0.1:.../manifest.json` | HTTP transport (localhost exception) |
| `https://.../stremio/v1` | Legacy transport (v1/v2 protocol) |
| `ipfs://.../manifest.json` | IPFS transport |
| `ipns://.../manifest.json` | IPFS transport |

### HTTP requirements

1. **HTTPS mandatory** for all remote addons
2. **Exception:** `127.0.0.1` and `localhost` can use HTTP
3. **CORS mandatory** — `Access-Control-Allow-Origin: *` on all responses
4. **Content-Type:** `application/json; charset=utf-8`
5. **No authentication on protocol routes** — the protocol itself is unauthenticated (use config for user tokens)

### Static hosting is valid

An addon can be **entirely static files** served from GitHub Pages, S3, or any CDN:

```
/manifest.json
/catalog/movie/my-catalog.json
/stream/movie/tt1234567.json
```

No server-side logic needed for simple addons.

---

## 11. Addon Installation

### What "installing" means

Installing an addon in Stremio is simply **storing the manifest URL**. Stremio fetches the manifest, validates it, and saves the URL. There is no code execution, no download, no sandboxing.

### Installation methods

#### 1. Direct URL entry
User pastes the manifest URL in Stremio's addon search bar:
```
https://myaddon.com/manifest.json
```

#### 2. `stremio://` protocol handler
Opening a URL like this triggers the desktop app's addon install prompt:
```
stremio://myaddon.com/manifest.json
```
(Note: the `stremio://` scheme replaces `https://`)

The SDK's `--install` flag does this:
```js
opn(url.replace('http://', 'stremio://'))
```

#### 3. Stremio Web with `addonOpen` parameter
```
https://staging.strem.io#?addonOpen=https%3A%2F%2Fmyaddon.com%2Fmanifest.json
```

The SDK's `--launch` flag does this:
```js
const installUrl = `https://staging.strem.io#?addonOpen=${encodeURIComponent(url)}`
```

#### 4. Publishing to Central
```js
const { publishToCentral } = require('stremio-addon-sdk')
publishToCentral('https://myaddon.com/manifest.json')
```

This registers the addon in Stremio's Community Addons list, making it discoverable by all users.

### Configurable addon installation

For addons with `configurationRequired: true`:

1. User opens the addon URL → sees Configure page
2. User fills in config fields
3. Config is JSON-encoded into the URL: `https://myaddon.com/%7B%22apiKey%22%3A%22abc%22%7D/manifest.json`
4. This config-embedded URL is what gets "installed"
5. All subsequent requests include the config in the URL path

---

## 12. Cache Control

Handlers can return cache control properties alongside their data:

```js
return {
  streams: [...],
  cacheMaxAge: 3600,        // Cache-Control: max-age=3600
  staleRevalidate: 600,     // stale-while-revalidate=600
  staleError: 86400          // stale-if-error=86400
}
```

These translate to HTTP headers:
```
Cache-Control: max-age=3600, stale-while-revalidate=600, stale-if-error=86400, public
```

**Warning:** The SDK warns if any cache value exceeds 1 year (365 * 24 * 60 * 60 seconds):
`"cacheMaxAge set to more than 1 year, be advised that cache times are in seconds, not milliseconds."`

**Global default:** `serveHTTP(interface, { cacheMaxAge: 3600 })` sets default cache for all routes. Handler-level values override the global default.

---

## 13. Subtitles Resource

### Request

```
GET /subtitles/{type}/{id}/{extra}.json
```

Where `id` is the **OpenSubtitles file hash**, and `extra` contains `videoID` and `videoSize`.

### Handler signature

```js
builder.defineSubtitlesHandler(function(args) {
  // args.type   = content type
  // args.id     = OpenSubtitles file hash
  // args.extra  = { videoID, videoSize }

  return Promise.resolve({
    subtitles: [
      { url: "https://example.com/subs.srt", lang: "en" },
      { url: "https://example.com/subs-es.srt", lang: "es" }
    ]
  })
})
```

### Subtitle Object

```js
{
  url: "https://example.com/subtitles.srt",  // URL to subtitle file
  lang: "en"                                   // Language code
}
```

---

## 14. Meta Links

Internal navigation links that Stremio handles natively:

| Format | Action |
|--------|--------|
| `stremio:///search?search=${query}` | Opens Search page with query |
| `stremio:///discover/${transportUrl}/${type}/${catalogId}?${extra}` | Opens Discover page for addon catalog |
| `stremio:///detail/${type}/${id}` | Opens content Detail page |
| `stremio:///detail/${type}/${id}/${videoId}` | Opens Detail page with Streams for specific video |

Used in `externalUrl` stream property or `links` in Meta Objects.

---

## 15. Content Types

| Type | Metadata | Videos | Streams | Notes |
|------|----------|--------|---------|-------|
| `movie` | name, genre, director, actors, images | Single (ID = meta ID) | Standard | Most common |
| `series` | Same as movie + episodes array | Multiple via Video Objects | Per-video (season:episode) | Video IDs include season:episode |
| `channel` | name, description | Uploaded videos array | Per-video | YouTube-style |
| `tv` | name, description, genre | N/A | Live (no duration) | Live streams |

---

## 16. Stream Source Types (Complete)

| Source | Property | Format | Notes |
|--------|----------|--------|-------|
| Direct URL | `url` | HTTP(S)/FTP(S)/RTMP string | Most common. Must be MP4+HTTPS for web-ready. |
| BitTorrent | `infoHash` + optional `fileIdx` | 40-char hex hash | Optional `sources` for trackers/DHT. Largest file if no `fileIdx`. |
| YouTube | `ytId` | YouTube video ID string | Uses built-in player |
| External | `externalUrl` | URL or Meta Link string | Opens in browser |
| Usenet | `nzbUrl` + optional `servers` | HTTP(S)/FTP(S) to .nzb | Requires NNTP servers for download |
| RAR Archive | `rarUrls` | Array of Source Objects | Multi-volume supported, no decompression |
| ZIP Archive | `zipUrls` | Array of Source Objects | Multi-volume + decompression, no seeking |
| 7-Zip | `7zipUrls` | Array of Source Objects | LZMA decompression, seeking only uncompressed |
| TGZ | `tgzUrls` | Array of Source Objects | Multi-volume + decompression, no seeking |
| TAR | `tarUrls` | Array of Source Objects | No multi-volume, no compression, seeking supported |

**Source Object format:**
```js
{ url: "https://example.com/file.rar", bytes: 1500000000 }
```
`bytes` is optional but speeds up initial buffering.

---

## Quick Reference: Handler → URL → Response

| Handler | URL Pattern | Response Shape |
|---------|------------|----------------|
| `defineCatalogHandler` | `/catalog/{type}/{id}/{extra?}.json` | `{ metas: [MetaPreview] }` |
| `defineMetaHandler` | `/meta/{type}/{id}.json` | `{ meta: MetaObject }` |
| `defineStreamHandler` | `/stream/{type}/{videoId}.json` | `{ streams: [StreamObject] }` |
| `defineSubtitlesHandler` | `/subtitles/{type}/{hash}/{extra}.json` | `{ subtitles: [SubtitleObject] }` |
| `defineResourceHandler` | `/{resource}/{type}/{id}/{extra?}.json` | Custom (e.g., `{ addons: [...] }`) |

---

## Quick Reference: Manifest Template

```js
{
  id: "com.example.myaddon",
  version: "1.0.0",
  name: "My Addon",
  description: "Does awesome things",

  resources: [
    "catalog",
    { name: "stream", types: ["movie", "series"], idPrefixes: ["tt"] }
  ],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "my-movies",
      name: "My Movies",
      extra: [
        { name: "search", isRequired: false },
        { name: "genre", isRequired: false, options: ["Action", "Comedy", "Drama"] },
        { name: "skip", isRequired: false }
      ]
    }
  ],

  idPrefixes: ["tt"],

  behaviorHints: {
    configurable: true,
    configurationRequired: false
  },

  config: [
    { key: "apiUrl", type: "text", title: "API URL", required: true }
  ],

  logo: "https://example.com/logo.png",
  background: "https://example.com/bg.jpg",
  contactEmail: "support@example.com"
}
```
