# Stremio Install Protocol Tracker (Truth Table)

Updated: 2026-03-03

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
   - `http://127.0.0.1:7000/local/manifest.json?mode=local`
2. Hosted mode (phone/TV/account-sync):
   - Use HTTPS-hosted manifest URL (Vercel/public domain).
3. Hosted LAN pair mode (phone/TV/account-sync on same LAN as host PC):
   - Install Method 4 URL from configure page (hosted token with `lanPair*` fields).
   - Desktop app sends silent relay heartbeat every ~30s.
   - Hosted requests 307-redirect to active LAN endpoint when pair is online.
   - Pair status responses are metadata-minimized (no LAN endpoint list).

## UX update applied

- Local configure page now uses **Copy local Addon URL** instead of relying on local deep link open.
- Install flow for local now expects manual paste in Stremio:
  - `Addons -> + Add Addon URL -> paste http://127.0.0.1:7000/local/manifest.json?mode=local`

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
