# Stremio Install Protocol Tracker (Truth Table)

Updated: 2026-03-30

## Why this file exists

We keep this as a single source of truth so we stop repeating failed install patterns.

## Official Protocol Constraints

Source: Stremio Addon SDK `docs/protocol.md`  
Link: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

- addon URLs must load over HTTPS
- the only HTTP exception is `127.0.0.1`

Source: `stremio-addon-client` README  
Link: https://github.com/Stremio/stremio-addon-client

- client URL mapping forces HTTPS for addon URLs except localhost/`127.0.0.1`

## Archive Source Note

- Official Stremio SDK/core support `rarUrls` archive streams.
- That archive path requires a local or attached Stremio streaming server.
- PVTKRRX now emits the archive payload in the expected tuple-based shape for completed bundles.
- This tracker does not yet sign off native packed-RAR playback until one real client succeeds with that path.

## Observed Install Results (Current)

| URL entered or used in Stremio | Result | Notes |
|---|---|---|
| `http://127.0.0.1:7000/local/manifest.json?mode=local` | PASS | Stable same-PC install path on the Windows host |
| `stremio://127.0.0.1:7001/local/manifest.json?mode=local` | FAIL/UNSTABLE | Desktop deep-link handling for localhost remains unreliable |
| `http://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Browser may load it, but Stremio install flow does not treat it as a supported addon URL |
| `stremio://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Ends up treated as `https://192.168.50.48:7000/...` and fails |
| `https://192.168.50.48:7000/local/manifest.json?mode=local` | FAIL | Port `7000` is HTTP, not TLS |
| Browser test: `http://192.168.50.48:7000/local/manifest.json?mode=local` | PASS | Confirms server + firewall path, not Stremio install acceptance |
| `stremio://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted` for `LAN Bridge` | PASS* | Correct route for other home devices when heartbeat is online |
| Hosted `LAN Bridge` browsed on the host Windows desktop | WRONG ROUTE | Redirects back to LAN IP and can show `Failed to fetch`; host desktop should use `PC Local` instead |

## Conclusion

- LAN reachability and Stremio addon-install rules are separate problems.
- Raw LAN HTTP addon installs are still not the supported primary Stremio path.
- `PC Local` is the only supported same-PC route.
- `LAN Bridge` is the correct route for the user's other home devices on the same Stremio account and LAN.
- If the host desktop shows `Failed to fetch` while browsing `LAN Bridge`, the fix is to use `PC Local` on that host, not to keep debugging the hosted relay as if it were down.

## Apple TV Notes (tvOS)

- On some Apple builds, addon management UI is limited and direct addon configure/install controls may be missing in-app.
- Recommended flow: install/configure the addon on Stremio Web or desktop first, then use the same account on Apple TV and allow sync.
- Treat tvOS as a synced playback client for now; do first-time addon onboarding off-device.

## Supported Install Modes Going Forward

1. Local desktop mode (same machine):
   - `PC Local`
   - Stable copy/paste route: `http://127.0.0.1:7000/local/manifest.json?mode=local`
   - Real same-PC addon for movies, TV, sports, and library
2. Hosted LAN pair mode (phone/TV/account-sync on same LAN as host PC):
   - `LAN Bridge`
   - Primary install link should be `stremio://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted`
   - The plain `https://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted` value is manual fallback only when Stremio explicitly shows an `Add Addon URL` box
   - Hosted requests 307-redirect to the active LAN endpoint when pair is online
3. Hosted public mode:
   - `Remote Seedbox`
   - Use HTTPS-hosted manifest URL with public ready-file playback endpoints
   - Treat hosted `Remote Seedbox` as ready-file-first unless playback is self-hosted elsewhere

See also: `docs/ROUTE_FRAMEWORK.md`

## Current UX Shape

- Configure now opens with three route cards: `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- Each route shows a simplified next-step panel first.
- Fallback/manual tools are hidden under `Hidden Setup Tabs`.
- `LAN Bridge` setup tells the user to sign into Stremio on the host PC first, because the local host session is reused whenever possible.
- The desktop popup repeats the same rule and sends the user to the right setup page per route.

## Heartbeat / Desktop Notes

- Desktop heartbeat is not a short fixed 30-second loop anymore.
- Current behavior is:
  - startup heartbeat
  - Stremio-launch heartbeat pulse
  - long periodic heartbeat loop (default 12 minutes)
- The desktop splash now opens on every cold boot and stays frontmost until the main shell is ready.

## Runtime Logs

PVTKRRX desktop runtime folder:

- `%APPDATA%\PVTKRRX\runtime`

Main files:

- `%APPDATA%\PVTKRRX\runtime\local-config.json`
- `%APPDATA%\PVTKRRX\runtime\logs\desktop-YYYY-MM-DD.log`

Quick commands (PowerShell):

```powershell
explorer "$env:APPDATA\PVTKRRX\runtime\logs"
Get-Content "$env:APPDATA\PVTKRRX\runtime\logs\desktop-$(Get-Date -Format yyyy-MM-dd).log" -Tail 200
```

## Automated Coverage (2026-03-30)

- `npm run smoke:config` validates:
  - current `PC Local` and hosted install shape
  - local manifest/profile routes
  - hosted token + manifest/configure/config routes
- `npm run smoke:playback` validates:
  - completed playback correctly redirects into `/file`
  - the local playback route no longer crashes on completion-state checks
- `npm run smoke:pipeline` validates:
  - hosted remote stream suppression and local playback-capable behavior
  - completed packed archives emit the expected `rarUrls` payload shape when the bundle is fully ready
  - incomplete packed archives stay suppressed behind truthful notices
- `npm run smoke:sports` validates:
  - sports structured enrichment
  - order-agnostic sports grouping
  - landscape artwork preference for sports catalog tiles
- These smoke checks do not prove end-to-end client playback of native archive streams.

## Remaining Sign-Off Blockers

1. One fresh second-device `LAN Bridge` browse/play pass using the latest `1.1.19` desktop build.
2. One real completed packed RAR playback success on Stremio Desktop v5 or another service-backed client using PVTKRRX's emitted `rarUrls` path.
3. Apple TV synced-addon verification on a real client.
4. One real public `Remote Seedbox` playback success.
5. One auth-protected external file-server playback success on a real client.
