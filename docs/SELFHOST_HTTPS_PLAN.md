# Self-Host HTTPS Plan

## Problem
Stremio requires HTTPS for any addon URL that is not `127.0.0.1`. A user can install PVTKRRX on a seedbox or VPS and have everything work internally, but they still need a public HTTPS URL to install it in Stremio.

The current installer handles qBit, Prowlarr, Node, PVTKRRX, and systemd, but it does not finish the HTTPS part for self-hosted servers. This plan is for user-owned installs; the hosted pvtkrrx.cc relay is a separate path and should not be required here.

## Self-Host Options

```
How should Stremio reach this server?
1) FreeDNS (free hostname + local Caddy)
2) I have my own domain
3) Skip - I'll set this up later
```

### Option 1: FreeDNS

- Installer asks for the FreeDNS hostname the user wants to serve
- Installer optionally hits the FreeDNS dynamic-update URL so the hostname points at the current server IP
- Installer configures local Caddy on the server to terminate HTTPS and reverse proxy to port 7000

Pros: Free hostname, stable install URL, no Cloudflare dependency
Cons: Requires a FreeDNS record and public ports `80/443` on the server

### Option 2: Own Domain

- Installer asks for the domain name
- Installs local Caddy on the server
- Sets up a reverse proxy to port 7000
- Lets Caddy handle the Let's Encrypt certificate automatically
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

Video playback goes direct to the qBit file server URL. The HTTPS front door only needs to handle the lighter JSON/control traffic.

## Implementation Plan

The code should treat self-hosted installs as the independent path. The hosted site can remain the bootstrap download source, but the installed runtime must not depend on PVTKRRX infrastructure after setup.

### Phase 1: Finish HTTPS bootstrap in the installer

- `scripts/install-selfhost.sh`
  - Capture the chosen public hostname first and, for FreeDNS installs, optionally apply the FreeDNS dynamic update URL.
  - Install and configure qBit, Prowlarr, and Node next.
  - Install PVTKRRX last, using the public hostname and the discovered provider settings.
  - Keep the hosted site as the download source only.
  - If the user chooses FreeDNS or a domain, configure local Caddy on the same server and persist the chosen origin in `.env`.

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

1. FreeDNS — default free-hostname path
2. Own domain — power users
3. Skip — always available

---

*Created: April 2, 2026*
