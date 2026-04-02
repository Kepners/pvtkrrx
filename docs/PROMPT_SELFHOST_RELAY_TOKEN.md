# Prompt: Self-Host Installer Gets a pvtkrrx.cc Relay Token URL Automatically

## Problem

PVTKRRX self-host installer sets up qBit, Prowlarr, and PVTKRRX on a Linux box. Everything works internally. But Stremio requires HTTPS for addon URLs — the user has no domain, no SSL, and a working server they can't use.

## Solution

At the end of the install, the self-host server calls `POST /encrypt` on the hosted relay at `https://www.pvtkrrx.cc` with its own config. The relay returns an encrypted token. The installer constructs a ready-to-use Stremio install URL:

```
https://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted
```

User pastes that into Stremio. Done. No domain, no tunnel, no SSL setup.

## How the existing relay token system works

The hosted relay at `pvtkrrx.cc` is a stateless crypto service:

1. `POST /encrypt` receives a config object (Prowlarr URL, API key, qBit URL, credentials, etc.)
2. Server encrypts it with **AES-256-GCM** using the relay's `ENCRYPTION_SECRET`
3. Returns `{ token: "base64url-encoded-ciphertext" }`
4. When Stremio hits `GET /{token}/manifest.json`, the relay decrypts the token back into config
5. The relay uses that config to call the user's Prowlarr/qBit on their behalf
6. Video playback goes direct to the user's file server — relay only proxies JSON API calls

The relay does NOT store anything — the token IS the config, encrypted. No database, no registration, no accounts.

## What to build

### 1. Add relay token generation to `scripts/server-installer.js` `--auto` mode

After writing the local config and starting the systemd service, the installer should:

```javascript
// Build the config payload for the relay (same shape as configure.html sends)
const relayPayload = {
  jackettUrl,        // user's Prowlarr URL (must be publicly reachable from relay)
  jackettApiKey,     // user's Prowlarr API key
  qbitUrl,           // user's qBit URL (must be publicly reachable from relay)  
  qbitUsername,      // qBit credentials
  qbitPassword,
  fileServerUrl,     // user's file server URL (for ready-file playback)
  fileServerAuth,    // optional basic auth
  // ... other config fields
};

// Call the hosted relay to encrypt
const res = await fetch('https://www.pvtkrrx.cc/encrypt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(relayPayload)
});
const { token } = await res.json();

// Construct the install URL
const installUrl = `https://www.pvtkrrx.cc/${token}/manifest.json?mode=hosted`;
console.log(`Your Stremio install URL: ${installUrl}`);
```

### 2. Add Step 6 to `scripts/install-selfhost.sh`

After Step 5 (auto-configure PVTKRRX), add:

```
── Step 6/6: Stremio Install URL ──
```

The shell script should call the Node installer with a flag like `--generate-relay-url` or handle it within the existing `--auto` flow.

### 3. Handle the "publicly reachable" requirement

**This is the critical design decision.** The relay at `pvtkrrx.cc` needs to reach the user's Prowlarr and qBit to proxy API calls. Two sub-options:

**Option A: User's services are publicly reachable (seedbox with open ports)**
- Prowlarr at `http://{public-ip}:9696`
- qBit at `http://{public-ip}:8080`
- The relay calls these directly
- Token contains the public URLs

**Option B: User's services are NOT publicly reachable (behind NAT/firewall)**
- The relay can't reach them
- This is where the self-hosted `/selfhost/manifest.json` route matters
- The token should contain the PUBLIC URL of the PVTKRRX server itself as a proxy
- If the user has no public URL... they need a tunnel or domain (back to the Cloudflare Tunnel option)

**For the installer, detect this:**
```bash
# Check if ports are reachable from outside
PUBLIC_IP=$(curl -s ifconfig.me)
if curl -s -o /dev/null -w "%{http_code}" "http://${PUBLIC_IP}:7000/" | grep -q "200"; then
  echo "Server is publicly reachable"
  # Use public IP in the relay token
else
  echo "Server is behind NAT/firewall"
  # Offer Cloudflare Tunnel or tell user to open ports
fi
```

### 4. Update the installer output

```
╔══════════════════════════════════════════╗
║       PVTKRRX install complete!          ║
╚══════════════════════════════════════════╝

Stremio install URL:
  https://www.pvtkrrx.cc/eyJhbGciOi.../manifest.json?mode=hosted

  Copy this URL → Open Stremio → Add Addon → Paste URL → Install

Configure page:
  http://localhost:7000/configure

Services:
  PVTKRRX:     http://localhost:7000    ✓ running
  Prowlarr:    http://localhost:9696    ✓ 8 indexers
  qBittorrent: http://localhost:8080    ✓ ready
```

## Files to modify

| File | Change |
|------|--------|
| `scripts/server-installer.js` | Add relay token generation after config save in `runAuto()` |
| `scripts/install-selfhost.sh` | Add Step 6 for URL generation, port reachability check |
| `index.js` | Ensure `POST /encrypt` on the hosted relay accepts self-host configs |
| `src/lib/shared.js` | Ensure `normalizeAddonConfig` handles self-host relay configs |
| `README.md` | Update install instructions with the Stremio URL output |
| `docs/CURRENT_DESIGN.md` | Document the self-host relay flow |

## Important constraints

1. **The relay's `ENCRYPTION_SECRET` is different from the self-host server's.** The self-host server calls the RELAY's `/encrypt` endpoint, not its own. The relay encrypts with its own secret.

2. **Secrets travel over HTTPS.** The `POST /encrypt` call sends Prowlarr API keys and qBit passwords to pvtkrrx.cc over TLS. The relay encrypts them into the token and does NOT store them. But the user should understand their credentials pass through the relay.

3. **Token contains everything.** If someone gets the token, they can use the relay to access the user's Prowlarr/qBit. The token is the auth. This is the same security model as the existing Remote Seedbox flow.

4. **Public reachability is required.** The relay must be able to reach the user's services. If the user is behind NAT, the token URL won't work. The installer should detect this and offer alternatives.

5. **The `/encrypt` endpoint has rate limiting.** The installer makes one call. This is fine.

## Validation

- Full install on a clean VPS with public IP
- Installer generates a `pvtkrrx.cc` token URL
- URL is accessible via HTTPS in a browser (returns manifest JSON)
- URL installs successfully in Stremio
- Catalog browse and search work through the relay
- `npm run smoke:selfhost` passes
- `bash -n scripts/install-selfhost.sh` passes

## What NOT to build

- No user accounts or registration system on pvtkrrx.cc
- No database of self-host servers
- No heartbeat or keep-alive mechanism
- No admin dashboard for managing relay tokens
- The relay stays stateless — token IS the state
