# Stremio Install Protocol Tracker (Truth Table)

Updated: 2026-03-08

## Why this file exists
We keep this as a single source of truth so we stop repeating failed install patterns.

## Official protocol constraints
Source: Stremio Addon SDK `docs/protocol.md`  
Link: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

- "for the addon URL in Stremio to be loaded, it needs to be loaded over HTTPS"
- "The only exception is 127.0.0.1 over HTTP"

Source: `stremio-addon-client` README  
Link: https://github.com/Stremio/stremio-addon-client

- `mapURL` forces HTTPS for addon URLs except localhost/127.0.0.1.

## Observed install results (current)

| URL entered in Stremio | Result | Notes |
|---|---|---|
| `http://127.0.0.1:7000/local/manifest.json?mode=local` | PASS | Works on same PC where server runs |
| `stremio://127.0.0.1:7001/local/manifest.json?mode=local` | FAIL | Recent desktop builds can rewrite localhost deep links incorrectly; do not rely on auto-open |
| `http://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Rewritten/treated as HTTPS by client flow |
| `stremio://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Ends up as `https://192.168.50.48:7000/...` and fails |
| `https://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Server on 7000 is HTTP, not TLS |
| Browser test: `http://192.168.50.48:7000/local/manifest.json?mode=local` | PASS | Confirms server + firewall path is OK |
| `https://pvtkrrx.vercel.app/{token}/manifest.json?mode=hosted` with LAN pair enabled | PASS* | Requires active desktop heartbeat + hosted pair relay config |

## Conclusion
- LAN HTTP endpoint is reachable.
- Stremio install failure is protocol-policy mismatch, not LAN reachability.
- Local/LAN mobile install from raw `192.168.x.x:7000` is not a stable supported path.
- Browser-to-Stremio deep link (`Open in Stremio`) can also mis-handle localhost port/query on some client versions.
- Same-PC local install should stay manual: trusted HTTPS paste first, then `127.0.0.1:7000` HTTP fallback.
- Hosted LAN pair mode is now the preferred account-sync path for Android TV/mobile on local networks.

## Apple TV notes (tvOS)

- On some Apple builds, addon management UI is limited and direct addon configure/install controls may be missing in-app.
- Recommended flow: install/configure addon on Stremio Web or desktop first, then use the same account on Apple TV and allow sync.
- Treat tvOS as a synced playback client for now; do first-time addon onboarding off-device.
- Track upstream Apple behavior here:
  - https://blog.stremio.com/stremio-tech-update-44-meet-stremio-lite/
  - https://github.com/Stremio/stremio-bugs/issues/1783

## Supported install modes going forward

1. Local desktop mode (same machine):
   - Stable copy/paste route: `http://127.0.0.1:7000/local/manifest.json?mode=local`
2. Hosted mode (phone/TV/account-sync):
   - Use HTTPS-hosted manifest URL (Vercel/public domain).
3. Hosted LAN pair mode (phone/TV/account-sync on same LAN as host PC):
   - Install Method 4 URL from configure page (hosted token with `lanPair*` fields).
   - Desktop app sends silent relay heartbeat every ~30s.
   - Hosted requests 307-redirect to active LAN endpoint when pair is online.
   - Pair status responses are metadata-minimized (no LAN endpoint list).

## UX update applied

- Local configure page now exposes:
  - `Copy PC Gateway URL` for optional same-PC helper install via `127.0.0.1`
- LAN configure page now exposes:
  - `Install LAN Bridge In Stremio` for same-account sync installs on desktop/web before phone/TV pickup
  - `Copy Hosted Manifest URL` / `Copy Hosted Stremio URL` for direct phone/TV install
- `PC Local` / `PC Gateway` is explicitly documented as desktop-host-only and should not be treated as the phone/TV addon.
- Local Windows route is now being moved toward a `PC Gateway` helper role so LAN Bridge can remain the single visible content addon and avoid duplicate PVTKRRX catalog sets in Stremio.
- Heartbeat/AuthKey/account linking stay on Method 4 hosted LAN-pair installs only.
- LAN phone/TV and remote seedbox installs remain separate hosted URL panels.
- Sports is now declared as a real top-level Stremio type instead of being nested under `Movie`, so it should appear in the first dropdown alongside other custom addon types.
- Local desktop builds now derive the auth-token secret at runtime, fixing false `AUTH_TOKEN_SECRET not configured` failures during automatic account-link/LAN setup.
- Website, configurator, local install helper, and desktop popup now present the three routes as explicit products: `PC Gateway`, `LAN Bridge`, and `Remote Seedbox`.
- LAN Bridge account sync now tries signed-in local Stremio sessions first by scanning Stremio Desktop plus common Chromium browser profiles on the Windows host before falling back to the console snippet helper.
- Local desktop startup now warms qBittorrent + Prowlarr in the background after boot/config save so torrent/library state is touched before the first Stremio browse.
- LAN Bridge configure flow is now default-selected and reduced to a machine-checked 3-step checklist:
  - Stremio Desktop detected on this Windows PC
  - secure Stremio account link ready
  - install LAN Bridge in Stremio
- Manual AuthKey fields, console snippet fallback, raw hosted URLs, and LAN diagnostics are now pushed into fallback/manual sections instead of leading the page.
- Local runtime now exposes `/auth/stremio/local-status` so the configure page can show plain installed/session-ready checks instead of only descriptive text.
- Desktop popup now reports its content size back to Electron so the shell can grow to fit instead of clipping the bottom behind scrollbars.

## Runtime logs

PVTKRRX desktop runtime folder:
- `C:\Users\kepne\AppData\Roaming\PVTKRRX\runtime`

Main files:
- `C:\Users\kepne\AppData\Roaming\PVTKRRX\runtime\local-config.json`
- `C:\Users\kepne\AppData\Roaming\PVTKRRX\runtime\logs\desktop-YYYY-MM-DD.log`

Quick commands (PowerShell):

```powershell
explorer "$env:APPDATA\PVTKRRX\runtime\logs"
Get-Content "$env:APPDATA\PVTKRRX\runtime\logs\desktop-$(Get-Date -Format yyyy-MM-dd).log" -Tail 200
```

## Automated coverage (2026-03-03)

- `npm run smoke:lan-pair` validates:
  - pair heartbeat success
  - hosted request redirect to active LAN endpoint
  - required-pair offline fallback semantics (`200` + empty metas + offline marker):
    - wrong `lanPairKey` in hosted token
    - missing heartbeat record for requested `lanPairId`
  - opaque playback token formatting checks

## Next work items

1. Validate Method 4 end-to-end on Android TV + Android mobile with Stremio account sync.
2. Validate Apple TV sync flow (install on web/desktop first, confirm account addon sync on tvOS client).
3. Keep this file updated after each install test.
