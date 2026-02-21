# PVTKRRX

**Connect your private tracker seedbox to Stremio. No debrid. No hosting. Your hardware, your trackers.**

## What This Does

PVTKRRX is a Stremio addon that bridges your existing seedbox infrastructure into Stremio. You configure it with your own:

- **Prowlarr URL + API key** — searches your private trackers
- **qBittorrent WebUI URL** — manages downloads and streams your library

The addon handles: search → download → stream. PVTKRRX has a **built-in file server** so you can stream completed downloads directly — no external HTTP server required.

## Key Features

- **Sports** — Browse and search private tracker sports content (EPL, F1, UFC) directly in Stremio
- **Movies & TV** — IMDb-matched content from your private trackers
- **Seedbox Library** — Browse everything already downloaded on your seedbox
- **Smart filtering** — Sports indexers never contaminate movie/TV searches
- **Zero data stored** — All config AES-256-GCM encrypted in the addon URL
- **No debrid needed** — Your seedbox IS the streaming server
- **Free hosting** — Runs on Vercel Hobby tier ($0/month)

## What's Working

| Feature | Status |
|---------|--------|
| Sports catalog (EPL, F1, UFC tiles) | ✅ Working |
| Movie/TV streams from private trackers | ✅ Working |
| Sports contamination filter | ✅ Working — SportsCult never appears in movie searches |
| Already-downloaded files | ✅ Working — built-in file server with Range support |
| On-tracker download + play | ✅ Working — Comet pattern triggers download, redirects when done |
| Local + Hosted install modes | ✅ Working |

## Quick Start

### Use the Hosted Service (£1/month)

Visit **[pvtkrrx.vercel.app](https://pvtkrrx.vercel.app)** to configure your addon in 60 seconds.

### Self-Host (Free)

```bash
git clone https://github.com/Kepners/pvtkrrx.git
cd pvtkrrx
npm install
npm start
```

Then open `http://localhost:7000/configure` to enter your seedbox details.

## Requirements

Your seedbox needs:
1. **Prowlarr** with private trackers configured (or Jackett — same config page)
2. **qBittorrent** with WebUI enabled

That's it. PVTKRRX has a **built-in file server** and will stream files directly from qBittorrent's download directory. No nginx, no caddy, no ruTorrent file server needed.

> **Optional:** If you already have an HTTP file server on your seedbox (nginx, caddy, Synology, etc.) you can configure the "File Server URL" field to use it instead. Leave it blank to use the built-in server.

## Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Prowlarr URL | Yes | e.g. `http://seedbox.example.com:9696` |
| Prowlarr API Key | Yes | Found in Prowlarr → Settings → General |
| qBittorrent URL | Yes | e.g. `http://seedbox.example.com:8080` |
| qBittorrent Username | Yes | qBit WebUI credentials |
| qBittorrent Password | Yes | qBit WebUI credentials |
| File Server URL | No | External HTTP server URL. **Leave blank** to use built-in server |
| Path Mapping | No | Only if using external file server with different paths |

## How It Works

```
Your Stremio App (any device)
        ↓ HTTPS
PVTKRRX (Vercel serverless, stateless)
        ↓ decrypts your config from the addon URL
Your Seedbox:
   ├── Prowlarr  → searches your private trackers
   └── qBittorrent → manages downloads + streams files
```

All credentials are AES-256-GCM encrypted and embedded in the addon URL. The server never stores anything.

### Stream Types

**⚡ On Seedbox** — File is already downloaded. Plays immediately.

**📥 Available** — File is on a private tracker. Click to trigger download. PVTKRRX polls qBittorrent and redirects to the file once it's done.

## Verify Stremio Config Flow

Run this smoke check to validate the configuration page, token encryption, and install manifest routes:

```bash
npm run smoke:config
```

This verifies:
- `/configure` loads
- `POST /encrypt` returns a token
- `/:token/manifest.json` resolves
- `/:token/configure` resolves
- Invalid token routes return `400`

## Deployment

### Vercel (Recommended)
```bash
npx vercel --prod
# Set ENCRYPTION_SECRET in Vercel dashboard
```

### Self-Host
```bash
ENCRYPTION_SECRET=your-secret-here npm start
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENCRYPTION_SECRET` | Yes | Key for encrypting/decrypting user configs |

## Troubleshooting

### Black screen when playing a downloaded file

1. In the Stremio player click `⋯ → Copy stream link`
2. Paste it somewhere to inspect the URL
3. If it contains your old file server URL → your config has a stale `fileServerUrl` set
4. Fix: go to `http://localhost:7000/configure`, **clear the File Server URL field**, and reinstall the addon
5. With File Server URL empty, PVTKRRX uses its built-in file server

### PVTKRRX not appearing in stream dropdown

Usually means all search results got filtered (good — stops sports content showing for movies).

- Check server console: `[stream]` log lines show result counts before and after filtering
- If 0 results after filtering, the title fallback search also ran — check that too
- Confirm Prowlarr indexers are working: test connection in configure page

### Sports content appearing in movie searches

Should not happen — the filter chain explicitly blocks sports-only indexers and uses title matching.

If it does appear, check server console for `[stream] Title filter removed` lines. If the filter isn't running, the Cinemeta lookup may have failed (movie title unavailable).

## License

Source Available — free for personal use. Commercial use restricted.
