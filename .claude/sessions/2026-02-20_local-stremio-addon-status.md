# Session Report - Local Stremio Addon Bring-Up

- Date: 2026-02-20
- Project: PVTKRRX (Stremio addon)
- Scope: Get local configuration/install flow working, support local vs hosted variants, verify manifest/install behavior.

## Current Status

### Working
- Addon server is reachable on `http://localhost:7000`.
- Config page is reachable on `http://localhost:7000/configure`.
- Token encryption endpoint works (`POST /encrypt`).
- File server works on `http://localhost:8081` (serving local downloads).
- Prowlarr/qBittorrent test connection passes with provided local credentials.
- Tokenized configure page now pre-fills config via `GET /:config/config.json`.
- Manifest ID variants are active:
  - Local: `com.kepners.pvtkrrx.local`
  - Hosted: `com.kepners.pvtkrrx.hosted`
- Local install URL generation now prefers `127.0.0.1:7000`.

### User-Observed Behavior
- Stremio deep-link launch sometimes tried `https://127.0.0.1/...` without `:7000`, causing manifest fetch failure.
- Reliable workaround: paste the full `http://127.0.0.1:7000/<token>/manifest.json` directly in Stremio `Add addon`.

## Implemented Changes

- `index.js`
  - Added local `.env` loading.
  - Added non-production fallback secret if `ENCRYPTION_SECRET` missing.
  - Added static serving for `public/`.
  - Added dynamic manifest builder with mode-based IDs (`local`/`hosted`).
  - Added `GET /:config/config.json` for token-based config prefill.
  - Hardened startup with explicit HTTP server and error reporting.

- `public/configure.html`
  - Added install mode toggle (`Hosted` vs `Local / LAN`).
  - Added hosted/private URL validation logic.
  - Added token prefill loader for `/:config/configure`.
  - Local install URL generation now uses `127.0.0.1:<port>`.
  - Improved install status guidance text.

- `src/utils/pathMapper.js`
  - Normalizes Windows paths in `pathMapping.from`.
  - Fixes matching when config uses backslashes or missing trailing slashes.

- `src/config/manifest.js`
  - Updated logo path reference to public logo.

- `public/logo.svg`
  - Added local logo asset.

- `scripts/smoke-config-flow.js`
  - Added/updated smoke coverage for:
    - `/configure`
    - `/encrypt`
    - `/:token/manifest.json?mode=hosted`
    - `/:token/manifest.json?mode=local`
    - `/:token/config.json`
    - `/:token/configure`

- `package.json`
  - Added script: `smoke:config`.

- `README.md`
  - Added smoke test usage notes.

## Runbook (Local)

1. Start addon:

```powershell
cd "C:\Users\kepne\OneDrive\Documents\GitHub\pvtkrrx"
$env:ENCRYPTION_SECRET="pvtkrrx-local-dev-secret-2026"
npm start
```

2. Start file server:

```powershell
npx http-server "C:\Users\kepne\Downloads" -p 8081 --cors
```

3. Open configure page:
- `http://localhost:7000/configure`

4. In Stremio, install by pasting full HTTP manifest URL (recommended):
- `http://127.0.0.1:7000/<token>/manifest.json`

## Verification Evidence

- `npm run smoke:config` passed after latest fixes.
- Live checks returned `200` for:
  - `/configure`
  - `/manifest.json`
  - file server root on `:8081`

## Open Items

1. Deep-link reliability can vary by Stremio/OS handler; keep HTTP paste path as primary local install method.
2. For external trial testers, local-only URLs will not work unless they run services locally or endpoints are publicly exposed.
3. Hosted mode requires public URLs for Torznab, qBittorrent, and file server.

## MCP Note

- Ref MCP search was attempted for Stremio manifest/deep-link docs and returned no results.
- Exa MCP search call returned 401 in this environment.
- Practical troubleshooting proceeded via live local endpoint verification.
