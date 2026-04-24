# PVTKRRX Testing Guide

This is the current verification guide for the active route model.

Do not use the old Jackett/public-host MVP checklist as current truth. The live product is Prowlarr/qBittorrent-first, with PC Local, LAN Bridge, and Remote Seedbox routes.

## Baseline Setup

For local development:

```bash
npm install
$env:ENCRYPTION_SECRET = "replace-with-a-long-local-secret"
npm start
```

Open:

- `http://127.0.0.1:7000/configure`
- `http://127.0.0.1:7000/local/manifest.json?mode=local`

For useful playback checks, the runtime also needs access to:

- Prowlarr or another Torznab-compatible search service
- qBittorrent WebUI
- qBittorrent download paths that the selected runtime can read, or a public HTTPS file server for hosted Remote Seedbox

## Smoke Tests

Run the focused smoke checks before release or after route-sensitive changes:

```bash
npm run smoke:config
npm run smoke:guards
npm run smoke:pipeline
npm run smoke:lan-pair
npm run smoke:selfhost
npm run smoke:security
npm run smoke:desktop
npm run smoke:provider-discovery
```

Sports-specific checks:

```bash
npm run smoke:sports-resolution
npm run smoke:sports-catalog-seeds
npm run smoke:sports-catalog-latency
```

Windows build check:

```bash
npm run dist:win
```

## Route Acceptance Checks

### PC Local

Pass criteria:

- `GET /local/manifest.json?mode=local` returns a real catalog-bearing manifest from `127.0.0.1`.
- Stremio Desktop on the Windows host can install the PC Local route.
- Completed files use built-in `/file` playback when the runtime can read the qBittorrent download path.
- On-tracker unpacked sources use `/playback` only on playback-capable local routes.

Hard rule: PC Local is for the same Windows machine only.

### LAN Bridge

Pass criteria:

- The Windows host has a saved local config.
- The hosted LAN Bridge token contains a pair id/key and relay URL.
- The host desktop sends a fresh heartbeat.
- Other same-account home devices install the hosted `stremio://` LAN Bridge URL.
- Home-network requests 307-redirect to the active Windows host.
- The host Windows PC itself still uses PC Local, not LAN Bridge, for browsing and playback.

Hard rule: LAN Bridge depends on the Windows host staying online for the home-network path.

### Remote Seedbox

Pass criteria for hosted relay:

- The token does not carry private or loopback backend URLs.
- Prowlarr, qBittorrent, and completed-file playback endpoints are public HTTPS URLs.
- Hosted `/file` and `/playback` fail closed for non-local requests.
- Stream rows expose ready-file playback only when the file path can actually be served.

Pass criteria for explicit self-host:

- `PVTKRRX_SELF_HOST_MODE=true` is set.
- `/selfhost/manifest.json?mode=hosted` returns the stable server manifest.
- The server config is disk-backed and survives restart.
- Remote browser sessions need the self-host admin password before private/localhost service URLs are accepted.

Hard rule: hosted Remote Seedbox is ready-file-first. Use self-host mode when the server should queue, buffer, or serve bytes itself.

## Manual Stremio Checks

Use real Stremio clients for final sign-off:

- Stremio Desktop on the Windows host: PC Local browse and playback.
- A same-account home device: LAN Bridge browse and playback while the Windows host is online.
- A remote client: Remote Seedbox ready-file playback through public HTTPS endpoints.
- If file-server auth is configured, verify the target Stremio client honors the required headers/redirect behavior.

Do not call a route fully signed off from smoke tests alone when real-client behavior is the risk.

## Expected Catalogs

All routes should expose the same catalog family:

- sports
- movies
- series
- library

The route changes playback capability, not the catalog family.

## Known Risk Areas

- LAN Bridge and older docs may still mention `Hybrid Home`; treat that as naming drift for the home-device route.
- Public hosted relay does not proxy video bytes.
- Auth-protected external file-server playback depends on client support for the emitted stream payload.
- Packed RAR playback is supported through extracted direct video by default. Native `rarUrls` remains experimental unless explicitly enabled.
- `http://127.0.0.1` is the only plain-HTTP addon install exception Stremio reliably accepts. Other devices need hosted HTTPS or a proper self-host HTTPS origin.
