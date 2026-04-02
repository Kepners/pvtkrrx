# Self-Host HTTPS Plan

## Problem
Stremio requires HTTPS for any addon URL that isn't `127.0.0.1`. A user installs PVTKRRX on their seedbox/VPS, everything works internally, but they can't install it in Stremio because they don't have HTTPS.

The current installer handles qBit, Prowlarr, Node, PVTKRRX, and systemd — but stops short of the last mile.

## Proposed Solution: Three Options in the Installer

```
How should Stremio reach this server?
1) pvtkrrx.cc relay (recommended — no setup needed)
2) Cloudflare Tunnel (free random HTTPS URL)
3) I have my own domain
4) Skip — I'll set this up later
```

### Option 1: pvtkrrx.cc Relay (Recommended)

- Server registers with the hosted relay at `pvtkrrx.cc`
- Gets a unique encrypted token URL: `https://www.pvtkrrx.cc/{token}/manifest.json`
- User installs that URL in Stremio — HTTPS, done
- API calls (search, catalog, streams) route through `pvtkrrx.cc` relay back to the user's server
- Video playback goes direct to the seedbox file server (not through relay)
- **Already built** — this is the existing Remote Seedbox / LAN Bridge pattern, just needs the self-host installer to trigger registration

**Pros:** Zero config, no domain needed, no ports to open, works behind NAT
**Cons:** Relay dependency, API latency through relay

### Option 2: Cloudflare Tunnel

- Installer runs: `cloudflared tunnel --url http://localhost:7000`
- Gets an instant random `https://*.trycloudflare.com` URL
- Install as systemd service for persistence
- No Cloudflare account needed for quick tunnels

**Pros:** Zero config, no domain, direct connection (no relay), free
**Cons:** Random URL changes on restart (unless configured with account), depends on cloudflared binary

### Option 3: Own Domain

- Installer asks for the domain name
- Installs Caddy (or nginx + certbot)
- Sets up reverse proxy to port 7000
- Auto-provisions Let's Encrypt SSL cert
- Sets `PVTKRRX_PUBLIC_BASE_URL` in .env

**Pros:** Permanent URL, professional, no dependencies
**Cons:** Requires DNS setup, domain ownership

### Option 4: Skip

- Sets up everything except HTTPS
- User configures it manually later
- Shows clear instructions for what's needed

## Traffic Model

The HTTPS URL is NOT proxying video streams. It handles:
- Manifest fetch (once on install)
- Catalog queries (JSON)
- Search queries (JSON)
- Stream lookups (JSON, returns redirect URLs)

Video playback goes direct to the qBit file server URL. The relay/tunnel sees light JSON traffic only.

## Implementation Notes

### For pvtkrrx.cc relay:
- Self-host server needs an outbound registration call to `pvtkrrx.cc`
- Relay stores the server's reachable address (could be public IP:port, or a tunnel URL)
- Token is encrypted config, same as existing hosted tokens
- Server needs heartbeat or re-registration mechanism

### For Cloudflare Tunnel:
- Install `cloudflared` binary (single static binary, easy)
- Create systemd service for `cloudflared tunnel --url http://localhost:7000`
- Parse the assigned URL from cloudflared output
- Set `PVTKRRX_PUBLIC_BASE_URL` to the tunnel URL
- Consider: named tunnels with Cloudflare account for persistence

### For own domain:
- Install Caddy via package manager
- Write Caddyfile: `domain.com { reverse_proxy localhost:7000 }`
- Caddy auto-handles SSL via Let's Encrypt
- Set `PVTKRRX_PUBLIC_BASE_URL`

## Priority

Option 1 (pvtkrrx.cc relay) is the most seamless UX — zero config, uses existing infrastructure. Build this first.

Option 2 (Cloudflare Tunnel) is the best fallback — also zero config, no relay dependency.

Option 3 (own domain) is for power users who already have DNS set up.

---

*Created: April 2, 2026*
