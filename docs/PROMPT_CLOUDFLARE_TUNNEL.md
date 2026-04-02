# Prompt: Add Cloudflare Tunnel to the PVTKRRX Self-Host Installer

## Context

PVTKRRX is a Stremio addon that runs on a user's seedbox/VPS. The installer (`scripts/install-selfhost.sh` + `scripts/server-installer.js`) already handles installing qBittorrent-nox, Prowlarr, Node.js, and PVTKRRX itself — all zero-config, one curl command.

The problem: Stremio requires HTTPS for any addon URL that isn't 127.0.0.1. After install, the user has a working server on `http://localhost:7000` but can't install it in Stremio because there's no HTTPS.

## What to build

Add a **Cloudflare Tunnel** step to the installer that gives the user a free HTTPS URL with zero config — no domain, no account, no DNS.

### How Cloudflare Quick Tunnels work

```bash
cloudflared tunnel --url http://localhost:7000
```

This outputs a random `https://xxxxx.trycloudflare.com` URL. No Cloudflare account needed. The tunnel proxies HTTPS traffic to the local port. Video bytes don't go through it — only JSON API calls (manifest, catalog, search, stream lookups). Playback goes direct to the file server.

### What the installer should do

1. **Ask the user** (in `install-selfhost.sh` or `server-installer.js --auto`):
   ```
   How should Stremio reach this server?
   1) Cloudflare Tunnel — free HTTPS URL, no domain needed (recommended)
   2) I have my own domain — I'll configure HTTPS myself
   3) Skip — I'll set this up later
   ```

2. **If Cloudflare Tunnel selected:**
   - Download the `cloudflared` binary (static binary, no package manager needed):
     ```bash
     curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
     chmod +x /usr/local/bin/cloudflared
     ```
   - Create a systemd service that runs the tunnel:
     ```ini
     [Unit]
     Description=PVTKRRX Cloudflare Tunnel
     After=network-online.target pvtkrrx.service
     Wants=network-online.target

     [Service]
     Type=simple
     ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:7000 --no-autoupdate
     Restart=on-failure
     RestartSec=10

     [Install]
     WantedBy=multi-user.target
     ```
   - Start the service and capture the assigned URL from the logs:
     ```bash
     journalctl -u pvtkrrx-tunnel --no-pager -n 20 | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com'
     ```
   - Set `PVTKRRX_PUBLIC_BASE_URL` in `.env` to the tunnel URL
   - Restart PVTKRRX so it picks up the new public base URL
   - Print the Stremio install URL to the terminal

3. **If own domain selected:**
   - Prompt for the domain
   - Set `PVTKRRX_PUBLIC_BASE_URL` to `https://theirdomain.com`
   - Print a message: "Point your domain's DNS to this server's IP and set up a reverse proxy with SSL (e.g. Caddy, nginx + certbot)"

4. **If skip:**
   - Print: "PVTKRRX is running on http://localhost:7000. Stremio needs HTTPS — set PVTKRRX_PUBLIC_BASE_URL in .env when ready."

### Important details

- **Quick tunnel URLs change on restart.** This is fine for personal use — user just re-installs the addon in Stremio with the new URL. Mention this in the output.
- **For persistent URLs**, users can create a free Cloudflare account and use named tunnels. Don't build this into the installer — just mention it as an option in the output.
- **The tunnel only carries JSON API traffic.** Video playback goes direct to the file server URL configured in PVTKRRX. The tunnel bandwidth is minimal.
- **cloudflared is a single static binary** — no dependencies, no package manager, works on any Linux.

### Files to modify

- `scripts/install-selfhost.sh` — add `cloudflared` download + systemd service creation in the main flow
- `scripts/server-installer.js` — add `--auto` mode awareness of tunnel URL, update `.env` with `PVTKRRX_PUBLIC_BASE_URL`
- `README.md` — update install instructions to mention the HTTPS step
- `docs/CURRENT_DESIGN.md` — document the Cloudflare Tunnel option

### Validation

- `bash -n scripts/install-selfhost.sh` must pass
- `npm run smoke:selfhost` must pass
- Test on a clean Linux box: full install from curl pipe, tunnel starts, HTTPS URL works in browser, Stremio can install from the URL

### Output should look like

```
── Step 6/6: HTTPS for Stremio ──
Downloading cloudflared...
✓ cloudflared installed
✓ Tunnel service started

╔══════════════════════════════════════════╗
║       PVTKRRX install complete!          ║
╚══════════════════════════════════════════╝

Your Stremio install URL:
  https://random-words.trycloudflare.com/selfhost/manifest.json?mode=hosted

Configure page:
  https://random-words.trycloudflare.com/configure

Note: This URL changes if the tunnel restarts.
For a permanent URL, set up a custom domain or Cloudflare named tunnel.
```
