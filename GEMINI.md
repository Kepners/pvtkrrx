# PVTKRRX Workspace

## Project Overview

**PVTKRRX** is a Node.js-based Stremio addon system that bridges a user's own media infrastructure (Prowlarr/Torznab and qBittorrent) to Stremio. It allows users to stream from their private trackers and seedboxes without relying on third-party media hosts or debrid services. 

The project features multiple deployment routes based on playback location:
- **PC Local:** Run and consumed on the same Windows PC.
- **LAN Bridge:** Hosted relay that redirects home devices (TV, phone, Apple TV) to the live local Windows host.
- **Remote Seedbox / Self-Hosted Server:** For away-from-home or seedbox-first playback, potentially hosted on a VPS or public endpoint.

## Architecture & Directory Structure

- `index.js`: Main entry point for the Express and Stremio addon server.
- `src/handlers/`: Contains catalog, metadata, stream, and sports artwork handlers.
- `src/clients/`: Client integrations for Prowlarr, qBittorrent, Cinemeta, and SportsMeta.
- `src/utils/`: Helpers for routing, playback, storage, authentication, and parsing.
- `public/`: Public guide pages and shared configuration UI (frontend).
- `electron/`: Windows desktop application wrapper.
- `scripts/`: Installer, smoke checks, build, and release scripts.
- `docs/`: Extensive documentation (Architecture, Routing, Status, etc.). Canonical behavior is defined in `CURRENT_DESIGN.md`, `ROUTE_FRAMEWORK.md`, and `STREMIO_INSTALL_TRACKER.md`.

## Building and Running

**Prerequisites:** Node.js, npm.

**Installation:**
```bash
npm install
```

**Local Development:**
Set the encryption secret environment variable before starting:
```powershell
$env:ENCRYPTION_SECRET = "replace-with-a-long-local-secret"
npm start
# OR for watch mode:
npm run dev
```

**Electron Desktop App Development:**
```bash
npm run desktop:dev
```

**Build Windows Artifacts:**
```bash
npm run dist:win
```

## Testing

The project uses extensive "smoke" scripts for testing different flows and components rather than a standard test runner.
Some key test commands:
- `npm run smoke:config`
- `npm run smoke:guards`
- `npm run smoke:pipeline`
- `npm run smoke:lan-pair`
- `npm run smoke:selfhost`
- `npm run smoke:security`
- `npm run smoke:desktop`

See `docs/TESTING.md` for the full verification guide.

## Development Conventions & Notes

- **Naming:** Follow the established route nomenclature: `PC Local`, `LAN Bridge`, `Remote Seedbox`. Avoid deprecated terms like `Hybrid Home` unless matching explicit old documentation.
- **Hosted Relay:** Deployments acting as the hosted relay should set `PVTKRRX_HOSTED_RELAY=true` to prevent serving local-only file/playback routes.
- **Licensing:** The project does not currently contain a license file. Do not invent license wording without explicit owner instruction.
- **SportsMeta:** Keep in mind that SportsMeta is a companion service; PVTKRRX stays free and proxies only public/root artwork. Paid artwork/tokens remain on the SportsMeta member addon.
