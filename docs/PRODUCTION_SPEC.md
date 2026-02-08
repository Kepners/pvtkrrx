# Production Specification - PVTKRRX

> **Version:** 1.0
> **Date:** February 8, 2026
> **Author:** Peter (Production)

---

## 1. Build Requirements

### Development Environment
- Node.js 18+ (Vercel runtime)
- npm for package management
- Git for version control
- Vercel CLI for deployment (`npx vercel`)

### Dependencies (3 total)
| Package | Version | Purpose |
|---------|---------|---------|
| stremio-addon-sdk | ^1.6.10 | Stremio protocol compliance |
| express | ^5.2.1 | HTTP routing for encrypted config tokens |
| fast-xml-parser | ^4.x | Torznab XML response parsing |

### package.json
```json
{
  "name": "pvtkrrx",
  "version": "1.0.0",
  "description": "Private tracker seedbox addon for Stremio",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "dev": "node index.js"
  },
  "dependencies": {
    "stremio-addon-sdk": "^1.6.10",
    "express": "^5.2.1",
    "fast-xml-parser": "^4.5.0"
  }
}
```

## 2. Deployment Strategy

### Target Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local testing | `http://localhost:7000` |
| Production | Live addon | `https://pvtkrrx.vercel.app` |

### Vercel Configuration
```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.js" }]
}
```

### Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `ENCRYPTION_SECRET` | Yes | AES-256-GCM key derivation seed |
| `VERCEL` | Auto-set | Vercel sets this — used to skip `app.listen()` |

### Deployment Process
1. `git push origin main` — Vercel auto-deploys from GitHub
2. Or `npx vercel --prod` for manual deployment
3. Set `ENCRYPTION_SECRET` in Vercel dashboard → Settings → Environment Variables

## 3. File Structure

```
pvtkrrx/
├── index.js                   # Entry point (Express + SDK hybrid)
├── src/
│   ├── clients/
│   │   ├── torznab.js         # Jackett/Prowlarr Torznab client
│   │   ├── qbittorrent.js     # qBittorrent WebUI client
│   │   └── cinemeta.js        # Cinemeta metadata resolver
│   ├── handlers/
│   │   ├── catalog.js         # Catalog handler (sports, movies, TV, library)
│   │   ├── stream.js          # Stream resolution handler
│   │   └── meta.js            # Meta handler for custom IDs
│   ├── utils/
│   │   ├── crypto.js          # AES-256-GCM encrypt/decrypt
│   │   ├── parser.js          # Torrent name parsing
│   │   ├── streams.js         # Stream object building & sorting
│   │   └── pathMapper.js      # qBit save path → HTTP URL mapping
│   └── config/
│       ├── categories.js      # Torznab category constants
│       ├── manifest.js        # Stremio manifest definition
│       └── providers.js       # Seedbox provider presets
├── public/
│   ├── configure.html         # Configuration page
│   └── logo.ico               # Addon logo
├── vercel.json                # Vercel deployment config
├── package.json               # Dependencies
└── README.md                  # Documentation
```

**Note:** Spec proposed `api/[...path].js` (Vercel catch-all pattern) but we're using `index.js` with `vercel.json` catch-all route instead — matches the clockrr pattern exactly.

## 4. Entry Point Pattern (index.js)

```javascript
const express = require('express');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { decryptConfig } = require('./src/utils/crypto');
const { handleCatalog } = require('./src/handlers/catalog');
const { handleStream } = require('./src/handlers/stream');
const { handleMeta } = require('./src/handlers/meta');
const manifest = require('./src/config/manifest');

const app = express();

const builder = new addonBuilder(manifest);

// Middleware: decrypt config from URL path (decrypt-once pattern)
function withConfig(req, res, next) {
  try {
    req.config = decryptConfig(req.params.config, process.env.ENCRYPTION_SECRET);
    next();
  } catch (e) {
    res.status(400).json({ error: 'Invalid configuration' });
  }
}

// Health + Configure
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/configure', (req, res) => res.sendFile('configure.html', { root: 'public' }));

// Config-based Stremio routes (before SDK router)
app.get('/:config/manifest.json', withConfig, (req, res) => {
  res.json(builder.getInterface().manifest);
});

app.get('/:config/catalog/:type/:id.json', withConfig, async (req, res) => {
  const result = await handleCatalog({ ...req.params, extra: {}, config: req.config });
  res.json(result);
});

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, async (req, res) => {
  const extra = parseExtra(req.params.extra);
  const result = await handleCatalog({ ...req.params, extra, config: req.config });
  res.json(result);
});

app.get('/:config/stream/:type/:id.json', withConfig, async (req, res) => {
  const result = await handleStream({ ...req.params, config: req.config });
  res.json(result);
});

app.get('/:config/meta/:type/:id.json', withConfig, async (req, res) => {
  const result = await handleMeta({ ...req.params, config: req.config });
  res.json(result);
});

// Playback endpoint (Comet pattern — trigger download, poll, 302 redirect)
app.get('/:config/playback/:info', withConfig, async (req, res) => {
  // Decode torrent info, check qBit status
  // If already downloaded: 302 redirect to seedbox file URL
  // If not: trigger qBit download, poll within request lifetime
  // On completion: 302 redirect to file
  // On timeout: 504 "Download in progress, try again"
});

// SDK router as fallback (landing page, non-config manifest)
builder.defineCatalogHandler(() => Promise.resolve({ metas: [] }));
builder.defineStreamHandler(() => Promise.resolve({ streams: [] }));
builder.defineMetaHandler(() => Promise.resolve({ meta: null }));
app.use(getRouter(builder.getInterface()));

module.exports = app;

if (!process.env.VERCEL) {
  app.listen(7000, () => console.log('PVTKRRX running on http://localhost:7000'));
}
```

## 5. Distribution

### How Users Get It
1. User visits `https://pvtkrrx.vercel.app/configure`
2. Enters seedbox credentials (Jackett URL, qBit URL, file server URL)
3. Clicks "Test Connection" to validate
4. Clicks "Generate Install Link"
5. Server encrypts config → returns `stremio://` protocol link
6. User clicks link → Stremio installs addon
7. Addon appears in Stremio with 4 catalogs

### Update Mechanism
- Vercel auto-deploys from `main` branch on push
- Addon updates are instant — no user action needed
- Users' encrypted tokens remain valid across deployments (same `ENCRYPTION_SECRET`)
- If `ENCRYPTION_SECRET` changes, all users must reconfigure (documented in README)

## 6. Build Order

```
Level 0: Foundation
  ├── package.json + npm install
  ├── vercel.json
  ├── src/utils/crypto.js (encrypt/decrypt)
  └── src/config/manifest.js

Level 1: Clients
  ├── src/clients/torznab.js (Jackett/Prowlarr)
  ├── src/clients/qbittorrent.js
  └── src/clients/cinemeta.js

Level 2: Utilities
  ├── src/utils/parser.js (torrent name parsing)
  ├── src/utils/streams.js (stream object building)
  ├── src/utils/pathMapper.js (path mapping)
  └── src/config/categories.js + providers.js

Level 3: Handlers
  ├── src/handlers/catalog.js (sports FIRST — MD directive)
  ├── src/handlers/stream.js
  └── src/handlers/meta.js

Level 4: Integration
  ├── index.js (Express + SDK hybrid — clockrr pattern)
  └── public/configure.html

Level 5: Deploy
  ├── Local testing (http://localhost:7000)
  ├── Vercel deployment
  └── Stremio install verification
```

## 7. Stream Status Pattern (Comet Playback Pattern)

Based on Colin's Stremio behavior research. This is the industry-standard pattern used by Comet, comet-uncached, and debrid addons.

### Content Already on Seedbox (instant play)
```javascript
{
  name: "⚡ 1080p BluRay REMUX",
  description: "On Seedbox | TrueHD Atmos 7.1 | 45.2 GB",
  url: "https://seedbox.example.com/files/movie.mkv",
  behaviorHints: {
    notWebReady: true,
    bingeGroup: "pvtkrrx-1080p",
    filename: "Movie.2024.1080p.BluRay.REMUX.mkv",
    proxyHeaders: {
      request: { "Authorization": "Basic dXNlcjpwYXNz" }
    }
  }
}
```

### Content Available on Tracker (Comet pattern)
```javascript
{
  name: "📥 1080p BluRay",
  description: "250 seeders | 12.5 GB | Click to stream",
  url: "https://pvtkrrx.vercel.app/{token}/playback/{encodedInfo}",
  // User clicks → Stremio shows loading spinner
  // Playback endpoint: triggers qBit download → polls → 302 redirects to file
  // User experience: loading spinner → playback starts
  behaviorHints: { notWebReady: true }
}
```

### Playback Endpoint Flow
```
1. Stremio sends GET to /playback/{info}
2. Addon checks qBit: already downloaded?
   → YES: 302 redirect to seedbox file URL (instant)
   → NO: trigger qBit download via magnet/URL
3. Poll qBit every 3s within request lifetime
   → Hobby: ~8s of polling (covers ~800MB at 100MB/s)
   → Pro: ~55s of polling (covers ~5.5GB at 100MB/s)
4. Download complete → 302 redirect to seedbox file URL
5. Timeout → 504 "Download in progress, close and retry"
6. On retry: stream handler checks qBit again, finds file → returns direct URL
```

### proxyHeaders for Basic Auth
Instead of embedding `user:pass@` in stream URLs, use Stremio's `proxyHeaders` behaviorHint:
```javascript
behaviorHints: {
  proxyHeaders: {
    request: { "Authorization": "Basic " + btoa(user + ":" + pass) }
  }
}
```
Credentials never appear in the URL. Works on desktop and mobile Stremio clients (may not work on Stremio Web).

## 8. Production Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vercel cold starts (~500ms) | Slower first request | fast-xml-parser helps minimize bundle size |
| Users with slow seedbox connections | Timeouts hit before results return | Promise.allSettled() returns partial results |
| Torznab XML format varies by indexer | Parsing failures | Robust parser with try/catch, test against multiple indexers |
| express@5 breaking changes | Unexpected behavior | Pin to ^5.2.1, clockrr uses same version |
| Config page served as static file | Can't server-render | Self-contained HTML with embedded JS — no build step needed |

---

*Prepared by Peter (Production) — February 8, 2026*
