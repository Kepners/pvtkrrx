# Self-Host HTTPS Plan

## Problem
Stremio requires HTTPS for any addon URL that is not `127.0.0.1`. A user can install PVTKRRX on a seedbox or VPS and have everything work internally, but they still need a public HTTPS URL to install it in Stremio.

The current installer handles qBit, Prowlarr, Node, PVTKRRX, and systemd, but it does not finish the HTTPS part for self-hosted servers.

Important: the `pvtkrrx.cc` relay is cloud-hosted only. The self-host installer should not try to register against it. Self-host HTTPS needs a direct public URL for the user's own server.

## Self-Host Options

```
How should Stremio reach this server?
1) Cloudflare Tunnel (free random HTTPS URL)
2) I have my own domain
3) Skip - I will set this up later
```

### Option 1: Cloudflare Tunnel

- Installer runs `cloudflared tunnel --url http://localhost:7000`
- Gets an instant random `https://*.trycloudflare.com` URL
- Install as a systemd service for persistence
- No Cloudflare account needed for quick tunnels

Pros: Zero config, no domain, direct connection, free
Cons: Random URL changes on restart unless configured with an account, depends on the `cloudflared` binary

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

## Cloud Relay Note

The hosted cloud version already uses `https://www.pvtkrrx.cc/{token}/manifest.json` for its relay-backed install flow. That is separate from self-hosting and does not belong in the self-host installer.

## Traffic Model

The HTTPS URL is not proxying video streams. It handles:
- Manifest fetch
- Catalog queries
- Search queries
- Stream lookups

Video playback goes direct to the qBit file server URL. The tunnel or reverse proxy sees light JSON traffic only.

## Implementation Notes

### For Cloudflare Tunnel

- Install the `cloudflared` binary
- Create a systemd service for `cloudflared tunnel --url http://localhost:7000`
- Parse the assigned URL from `cloudflared` output
- Set `PVTKRRX_PUBLIC_BASE_URL` to the tunnel URL
- Consider named tunnels with a Cloudflare account for persistence

### For Own Domain

- Install Caddy via the package manager
- Write a Caddyfile such as `domain.com { reverse_proxy localhost:7000 }`
- Let Caddy handle SSL via Let's Encrypt
- Set `PVTKRRX_PUBLIC_BASE_URL`

## Priority

Build the self-host HTTPS options first: Cloudflare Tunnel, then own domain, then skip.
The cloud relay path is already part of the hosted version.

---

*Created: April 2, 2026*
