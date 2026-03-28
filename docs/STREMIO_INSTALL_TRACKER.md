# Stremio Install Protocol Tracker (Truth Table)

Updated: 2026-03-24

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
| `https://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted` with LAN pair enabled | PASS* | Requires active desktop heartbeat + hosted pair relay config |

## Conclusion
- LAN HTTP endpoint is reachable.
- Stremio install failure is protocol-policy mismatch, not LAN reachability.
- Local/LAN mobile install from raw `192.168.x.x:7000` is not a stable supported path.
- Browser-to-Stremio deep link (`Open in Stremio`) can also mis-handle localhost port/query on some client versions.
- Same-PC local install should stay manual: trusted HTTPS paste first, then `127.0.0.1:7000` HTTP fallback.
- Hosted LAN pair mode is now the preferred account-sync path for Android TV/mobile on local networks.
- `PC Local` is now a real same-PC addon route, not a gateway-only helper.

## Apple TV notes (tvOS)

- On some Apple builds, addon management UI is limited and direct addon configure/install controls may be missing in-app.
- Recommended flow: install/configure addon on Stremio Web or desktop first, then use the same account on Apple TV and allow sync.
- Treat tvOS as a synced playback client for now; do first-time addon onboarding off-device.
- Track upstream Apple behavior here:
  - https://blog.stremio.com/stremio-tech-update-44-meet-stremio-lite/
  - https://github.com/Stremio/stremio-bugs/issues/1783

## Supported install modes going forward

1. Local desktop mode (same machine):
   - `PC Local`
   - Stable copy/paste route: `http://127.0.0.1:7000/local/manifest.json?mode=local`
   - Real same-PC addon for movies, TV, sports, and library
2. Hosted LAN pair mode (phone/TV/account-sync on same LAN as host PC):
   - `LAN Bridge`
   - Primary install link should be `stremio://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted`.
   - The plain `https://www.pvtkrrx.cc/{token}/manifest.json?mode=hosted` value is manual fallback only when Stremio explicitly shows an `Add Addon URL` box.
   - Desktop app sends silent relay heartbeat every ~30s.
   - Hosted requests 307-redirect to active LAN endpoint when pair is online.
   - Pair status responses are metadata-minimized (no LAN endpoint list).
3. Hosted public mode:
   - `Remote Seedbox`
   - Use HTTPS-hosted manifest URL with public ready-file playback endpoints.
   - Treat hosted Remote Seedbox as ready-file-first unless playback is self-hosted elsewhere.

See also: `docs/ROUTE_FRAMEWORK.md`

## UX update applied

- Local configure page now exposes:
  - `Copy PC Local URL` for same-PC install via `127.0.0.1`
- LAN configure page now exposes:
  - `Install Or Refresh LAN Bridge In Stremio` for same-account sync installs on desktop/web before phone/TV pickup
  - `Copy Stremio Install Link` as the primary LAN Bridge artifact
  - `Copy Hosted Manifest URL` / `Copy Hosted Stremio URL` for direct phone/TV install
- LAN Bridge primary install must start with `stremio://`; the hosted HTTPS manifest is fallback/manual only.
- Hosted LAN Bridge tokens must be minted by the hosted relay, not encrypted locally on the Windows host runtime. If the desktop falls back to its own local secret and encrypts the hosted token itself, the hosted manifest fetch will fail with `400 Invalid config token`.
- `PC Local` is explicitly documented as desktop-host-only and should not be treated as the phone/TV addon.
- `PC Local` now remains a full same-PC addon route instead of a helper-only manifest.
- Heartbeat/AuthKey/account linking stay on Method 4 hosted LAN-pair installs only.
- LAN phone/TV and remote seedbox installs remain separate hosted URL panels.
- Sports stays nested under `Movie` for compatibility with the legacy working Stremio contract instead of being promoted to a custom top-level type.
- Local desktop builds now derive the auth-token secret at runtime, fixing false `AUTH_TOKEN_SECRET not configured` failures during automatic account-link/LAN setup.
- Website, configurator, local install helper, and desktop popup now present the three routes as explicit products: `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
- LAN Bridge account sync now tries signed-in local Stremio sessions first by scanning Stremio Desktop plus common Chromium browser profiles on the Windows host before falling back to the console snippet helper.
- Local desktop startup now warms qBittorrent + Prowlarr in the background after boot/config save so torrent/library state is touched before the first Stremio browse.
- LAN Bridge configure flow is now default-selected and reduced to a machine-checked 3-step checklist:
  - Stremio Desktop detected on this Windows PC
  - secure Stremio account link ready
  - install LAN Bridge in Stremio
- Manual AuthKey fields, console snippet fallback, raw hosted URLs, and LAN diagnostics are now pushed into fallback/manual sections instead of leading the page.
- Local runtime now exposes `/auth/stremio/local-status` so the configure page can show plain installed/session-ready checks instead of only descriptive text.
- Desktop popup now reports its content size back to Electron so the shell can grow to fit instead of clipping the bottom behind scrollbars.
- LAN Bridge now prefers the live LAN IP for hosted heartbeat redirects, with `pvtkrrx.local` kept as a fallback/discovery alias when available.
- Quick Setup now highlights only the next required action with a glow/pulse, locks later-step buttons until earlier checks are complete, and labels the final action as `Install Or Refresh` because stale installed LAN Bridge URLs in Stremio can keep pointing at old routes.
- `Copy PC Local URL` is explicitly marked as host-only and not part of the LAN Bridge install path.
- The local `/local/manifest.json` route still serves already-installed same-LAN clients so updates do not blank out older home-device installs, but raw LAN `PC Local` URLs remain debug-only and `LAN Bridge` is still the supported home-device path.
- Root `/manifest.json` must stay bootstrap-only. If it advertises the same addon id/catalogs as `PC Local`, Stremio can latch onto `/manifest.json`, render the catalog labels, and then fetch nonexistent root `/catalog/...` paths that show `EmptyContent`.

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

Desktop popup behavior:
- `Server Shell` now allows text selection instead of trapping the log tail as non-copyable UI text.
- `Copy Runtime Log` copies the current desktop log file to the clipboard so the boot sequence and contact trace can be pasted elsewhere.
- Current trace lines now include:
  - desktop boot start
  - heartbeat loop activation and success/failure
  - Stremio launch detection pulses
  - hosted `/pair/heartbeat` accept/reject outcomes
  - hosted/local addon request lines for manifest, catalog, meta, and stream routes

## Automated coverage (2026-03-22)

- `npm run smoke:config` validates:
  - current `PC Local` UI copy and local install helper
  - local manifest/profile routes
  - hosted token + manifest/configure/config routes
- `npm run smoke:lan-pair` validates:
  - pair heartbeat success
  - hosted request redirect to active LAN endpoint
  - required-pair offline fallback semantics (`200` + empty metas + offline marker):
    - wrong `lanPairKey` in hosted token
    - missing heartbeat record for requested `lanPairId`
  - opaque playback token formatting checks
- `npm run smoke:stremio-link` validates:
  - Stremio AuthKey verification against a local mock API
  - linked account token issuance and `/auth/me`
- `npm run smoke:security` validates adjacent install/config hardening:
  - config readback redaction for hosted and local config flows
  - hosted/local route-guard regression checks around browser helper routes
  - opaque playback token rejection plus secure JSON migration/write behavior

## Remaining sign-off blocker (2026-03-22)

Automated coverage now proves the wording shape and guard behavior for the hosted notice rows, but it does not prove how Stremio renders and orders those rows on real devices.

That client pass is still required because:
- sports still rides the legacy movie catalog contract and needs real-client proof on that surface
- sports and library items use internal `pvtkrrx:` ids
- the addon must fully own presentation of its own rows instead of assuming Cinemeta or generic client behavior will rescue rough edges

Real-client sign-off checklist:

1. Desktop Stremio on the host PC with `PC Local`
   - confirm the three notice rows render with the exact labels:
   - `[INFO] Ready Files Only`
   - `[INFO] Direct Buffer Hidden`
   - `[INFO] Buffer URL Not Ready`
   - check for truncation, duplication, and misleading ordering.
2. `LAN Bridge` from a second same-account device on the same LAN
   - verify the same notice wording still reads correctly after hosted-to-LAN redirect behavior.
3. `Remote Seedbox` on a true hosted/public route
   - verify notice rows appear only for the intended cases:
   - ready-file only
   - auth-unsafe direct buffer suppressed
   - buffer URL unavailable because current path proof is missing
4. One good stream beside one notice-only case
   - confirm Stremio does not visually bury the playable option under warning rows.
5. At least one TV/mobile client family in addition to desktop
   - Stremio install and presentation behavior varies enough by client family that this must be checked on a real non-desktop client before sign-off.

Until that matrix is complete, the addon should be treated as:
- implementation hardened
- wording aligned
- smoke locked
- awaiting real client verification

## Next work items

1. Run the real-client sign-off checklist above and record exact pass/fail notes per client.
2. Validate Method 4 end-to-end on Android TV + Android mobile with Stremio account sync.
3. Validate Apple TV sync flow (install on web/desktop first, confirm account addon sync on tvOS client).
4. Keep this file updated after each install test.
