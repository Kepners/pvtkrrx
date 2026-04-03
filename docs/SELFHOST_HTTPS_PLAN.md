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

## Implementation Plan

The code should treat self-hosted installs as the independent path. The hosted site can remain the bootstrap download source, but the installed runtime must not depend on PVTKRRX infrastructure after setup.

### Phase 1: Finish HTTPS bootstrap in the installer

- `scripts/install-selfhost.sh`
  - Install `cloudflared` first so the public front door exists before the app stack is finalized.
  - Start the tunnel, capture the generated HTTPS URL, and export it as `PVTKRRX_PUBLIC_BASE_URL`.
  - Install and configure qBit, Prowlarr, and Node next.
  - Install PVTKRRX last, using the tunnel URL and the discovered provider settings.
  - Keep the hosted site as the download source only.
  - If the user chooses a domain later, print the reverse-proxy/SSL instructions and persist the chosen origin in `.env`.

- `scripts/server-installer.js`
  - Treat `PVTKRRX_PUBLIC_BASE_URL` as the canonical public origin for self-host mode.
  - Persist the origin into `.env` and echo the final Stremio install URL.
  - Keep the `selfhost` runtime fully functional without any hosted relay calls.
  - Refuse raw public `http://IP:port` origins for remote Stremio installs.

### Phase 2: Make the configure UI speak in "user-owned" terms

- `public/configure.html`
  - Reword self-host copy so it says the server belongs to the user after bootstrap.
  - Keep `Server Link Session` as a one-time account-link helper, not a runtime dependency.
  - Make the generated self-host manifest/install URL clearly come from the user-owned public origin.
  - Remove any self-host copy that implies `pvtkrrx.cc` is part of the required runtime path.

### Phase 3: Keep the runtime path origin-driven

- `src/lib/shared.js`
  - Keep `getPublicBaseUrl()` and related helpers driven by `PVTKRRX_PUBLIC_BASE_URL` or the deployed origin.
  - Ensure self-host route generation never falls back to hosted relay-specific behavior.
- `index.js`
  - Leave `/install-selfhost.sh` as a bootstrap download only.
  - Keep self-host manifest/config endpoints local to the user-owned runtime.

### Phase 4: Lock the behavior with tests

- `scripts/smoke-selfhost-server.js`
  - Verify a self-host runtime saves config to disk and serves `/selfhost/manifest.json?mode=hosted` from the configured public base URL.
  - Verify remote self-host admin access still works without any hosted relay dependency.
- `scripts/smoke-config-flow.js`
  - Verify the install page exposes the self-host flow and the final install URL.

### Phase 5: Deprecate conflicting relay-first guidance

- `docs/PROMPT_SELFHOST_RELAY_TOKEN.md`
  - Mark it historical or replace it with a note that the hosted relay is not the self-host contract.
- Any remaining docs or UI copy that imply the relay is required for self-host should be rewritten or archived.

## Acceptance Criteria

- A fresh user can install once and then run PVTKRRX from their own hardware without ongoing dependence on PVTKRRX infrastructure.
- The installer produces a working HTTPS origin or a clear next step for the user to create one.
- Self-host config survives reboot and stays editable only through the server admin path.
- `npm run smoke:selfhost` still passes.
- `npm run smoke:config` still passes.
- The docs and UI consistently describe self-host as the independence path.

## Priority

1. Cloudflare Tunnel — simplest to implement, works for everyone including behind NAT
2. Own domain — power users
3. Skip — always available

---

*Created: April 2, 2026*
