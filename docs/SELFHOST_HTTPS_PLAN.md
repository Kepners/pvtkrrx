# Self-Host HTTPS Plan

## Problem
Stremio requires HTTPS for any addon URL that is not `127.0.0.1`. A user can install PVTKRRX on a seedbox or VPS and have everything work internally, but they still need a public HTTPS URL to install it in Stremio.

The current installer handles qBit, Prowlarr, Node, PVTKRRX, and systemd, but it does not finish the HTTPS part for self-hosted servers. This plan is for user-owned installs; the hosted pvtkrrx.cc relay is a separate path and should not be required here.

## Self-Host Options

```
How should Stremio reach this server?
1) Cloudflare Tunnel (free random HTTPS URL)
2) I have my own domain
3) Skip - I'll set this up later
```

### Option 1: Cloudflare Tunnel

- Installer runs `cloudflared tunnel --url http://localhost:7000`
- Gets an instant random `https://*.trycloudflare.com` URL
- Install as a systemd service for persistence
- No Cloudflare account needed for quick tunnels
- Works behind NAT — no ports need to be open

Pros: Zero config, no domain, works behind NAT, free
Cons: Random URL changes on restart unless configured with an account, depends on cloudflared binary
- For a persistent URL, use a named Cloudflare Tunnel or your own domain instead of a quick tunnel.

### Option 2: Own Domain

- Installer asks for the domain name
- Installs Caddy or nginx plus certbot
- Sets up a reverse proxy to port 7000
- Auto-provisions a Let's Encrypt SSL cert
- Sets `PVTKRRX_PUBLIC_BASE_URL` in `.env`

Pros: Permanent URL, professional, no tunnel dependency
Cons: Requires DNS setup and domain ownership

### Option 3: Skip

- Sets up everything except HTTPS
- User configures it manually later
- Shows clear instructions for what is still needed

Important: the self-host installer should not try to register against the pvtkrrx.cc relay. Self-host HTTPS needs a direct public URL for the user's own server.

## Traffic Model

The HTTPS URL is not proxying video streams. It handles:
- Manifest fetch (once on install)
- Catalog queries (JSON)
- Search queries (JSON)
- Stream lookups (JSON, returns redirect URLs)

Video playback goes direct to the qBit file server URL. The relay/tunnel sees light JSON traffic only.

## Priority

1. Cloudflare Tunnel — simplest to implement, works for everyone including behind NAT
2. Own domain — power users
3. Skip — always available

---

*Created: April 2, 2026*
