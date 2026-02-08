# PVTKRRX

**Connect your private tracker seedbox to Stremio. No debrid. No hosting. Your hardware, your trackers.**

## What This Does

PVTKRRX is a Stremio addon that bridges your existing seedbox infrastructure into Stremio. You configure it with your own:

- **Jackett/Prowlarr URL** — for searching your private trackers
- **qBittorrent WebUI URL** — for managing downloads
- **HTTP file server URL** — for streaming completed downloads

The addon handles: search → download → stream. You bring the seedbox, the addon does the rest.

## Key Features

- **Sports** — Browse and search private tracker sports content (category 5060) directly in Stremio
- **Movies & TV** — IMDb-matched content from your private trackers
- **Seedbox Library** — Browse everything already downloaded on your seedbox
- **Zero data stored** — All config AES-256-GCM encrypted in the addon URL
- **No debrid needed** — Your seedbox IS the streaming server
- **Free hosting** — Runs on Vercel Hobby tier ($0/month)

## Quick Start

```bash
git clone https://github.com/Kepners/pvtkrrx.git
cd pvtkrrx
npm install
npm start
```

Then open `http://localhost:7000/configure` to enter your seedbox details.

## How It Works

```
Your Stremio App (any device)
        ↓ HTTPS
PVTKRRX (Vercel serverless, stateless)
        ↓ decrypts your config from the addon URL
Your Seedbox:
   ├── Jackett/Prowlarr  → searches your private trackers
   ├── qBittorrent       → manages your downloads
   └── HTTP file server  → streams to your Stremio
```

All credentials are AES-256-GCM encrypted and embedded in the addon URL. The server never stores anything.

## Requirements

Your seedbox needs:
1. **Jackett** or **Prowlarr** with private trackers configured
2. **qBittorrent** with WebUI enabled
3. **HTTP(S) file access** to completed downloads (nginx, caddy, ruTorrent built-in, etc.)

Most seedbox providers (Feral, Whatbox, Ultra, Seedhost, etc.) support all of these out of the box.

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

## License

Source Available — free for personal use. Commercial use restricted.
