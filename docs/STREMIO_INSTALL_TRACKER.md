# Stremio Install Protocol Tracker (Truth Table)

Updated: 2026-02-23

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

## Conclusion
- LAN HTTP endpoint is reachable.
- Stremio install failure is protocol-policy mismatch, not LAN reachability.
- Local/LAN mobile install from raw `192.168.x.x:7000` is not a stable supported path.
- Browser-to-Stremio deep link (`Open in Stremio`) can also mis-handle localhost port/query on some client versions.

## Supported install modes going forward

1. Local desktop mode (same machine):
   - `http://127.0.0.1:7000/local/manifest.json?mode=local`
2. Hosted mode (phone/TV/account-sync):
   - Use HTTPS-hosted manifest URL (Vercel/public domain).

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

## Next work items

1. Keep local install flow strictly loopback-first (`127.0.0.1`).
2. Move phone/TV install flow to hosted HTTPS configuration UX.
3. Keep this file updated after each install test.
