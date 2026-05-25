# PVTKRRX Posters And Debrid Worklog - May 2026

Updated: 2026-05-25

Current release line: `v1.3.7`

This document records the practical work completed around Sports Posters/artwork and Debrid playback. It is a summary of the current truth, not a planning brief.

## Product Boundary

- PVTKRRX is still the Stremio/private-tracker/seedbox bridge.
- SportsMeta owns sports identity, artwork source routes, member routes, paid Sports Posters entitlement, and billing.
- PVTKRRX consumes SportsMeta artwork and emits client-safe PVTKRRX artwork proxy URLs for Stremio.
- PVTKRRX can optionally use Debrid providers as a downloader layer, but it is not a debrid service and does not host media bytes.
- qBittorrent/local/seedbox playback remains the fallback whenever a debrid provider is configured and a qBit/local stream exists.

## Sports Posters / Artwork Work Completed

### Template and selection behavior

- The runtime poster template set is the seven configured poster families:
  `editorial`, `broadcast`, `sportsbook`, `trading-card`, `brutalist`, `ticket-stub`, and `glitch`.
- `ticket-stub` remains the default poster style.
- Configured PVTKRRX installs can select any valid built-in template. The later poster-style fixes corrected the earlier clamp/readback behavior so a selected style is not silently turned into the standard/default style.
- Plain forged `?template=` URLs do not unlock member-only SportsMeta artwork bytes. Entitlement-sensitive artwork remains stamped/signed or SportsMeta-owned.

### Logo and artwork source repair

- Real sports logos are preferred wherever SportsMeta can provide them.
- Placeholder glyphs/initials are now fallback only, not the normal path when real team/league artwork exists.
- EFL Championship and related football logo lookup was hardened so league/team slots can resolve dynamically instead of falling back to text where real assets exist.
- PVTKRRX no longer owns the old local TheSportsDB image cache as the source of truth. SportsMeta is the current source, with PVTKRRX acting as the client-safe transport/raster proxy.

### Sports poster layout and parser repair

- Combat/MMA/boxing events no longer get forced into fake two-team poster layouts when the source title is really a single fight card/event.
- Motorsport event titles prefer structured event/session fields over raw noisy release strings.
- Release noise such as codec, group, and pack tokens is stripped before poster titles are chosen.
- Sports catalog poster tiles use portrait/square poster artwork instead of stretched landscape wallpaper.
- Sports detail pages keep poster, background, logo, and landscape artwork as separate fields so Stremio clients do not stretch the wrong asset.

### First-screen and fallback hardening

- Sports catalog identity resolution now uses a bounded first-screen budget so Stremio gets a response quickly.
- Rows that cannot safely resolve immediately stay visible as explicit fallback `pvtkrrx:` rows instead of vanishing or guessing the wrong SportsMeta event.
- Background identity backfill can resolve those rows later and upgrade future catalog refreshes to canonical `sportsmeta:` ids and artwork.
- Tablet-safe generated fallback cards are used only when SportsMeta does not have a safe real artwork match.

## Debrid Work Completed

### Provider and cache support

- Added optional Debrid providers:
  - Real-Debrid
  - AllDebrid
  - Premiumize
- Added optional cache search sources:
  - put.io
  - Premiumize cache check
- Premiumize cache search is implicit when a Premiumize downloader API key is saved.
- Premiumize cache checks now try infohash first before falling back to title-style lookup.
- Newznab/NZB results can route through Premiumize because RD and AD do not support NZB.

### Config and installer behavior

- Encrypted install config now carries `debrid` and `cacheSearch` blocks while old v1.2 tokens deserialize safely.
- Configure UI includes provider toggles, masked API keys, provider test buttons, cache search settings, and the debrid/seedbox preference setting.
- Self-host seedbox installers now ask for Debrid downloader credentials before local/qBit/seedbox settings.
- Installer defaults place Premiumize first when configured and keep `preferDebridOverSeedbox=true`.

### Stream routing behavior

- Debrid streams are additive: qBittorrent/local/seedbox streams are not removed.
- When debrid is configured, the debrid stream is placed above the qBit/local fallback.
- Cached debrid hits appear first.
- Uncached tracker links use `/playback/debrid` so clicking Play starts the provider transfer first.
- Existing qBittorrent/local playback remains underneath as the backup route.
- Installs with no debrid/cache configuration behave like the pre-v1.3 qBit/local flow.

### Torrent/NZB handoff repair

- Sports/private-tracker `.torrent` download URLs are preserved and uploaded to debrid providers as torrent bytes instead of being discarded and rebuilt as bare magnets.
- Premiumize uses multipart `/api/transfer/create` with `src` for torrent files.
- Real-Debrid uses `PUT /torrents/addTorrent` for torrent file uploads.
- AllDebrid uses `/v4/magnet/upload/file` for torrent file uploads.
- Premiumize single-file playback now resolves via `file_id` and `/api/item/details` when `/transfer/list` does not expose a direct playable link.
- Real-Debrid filename sanitization strips known May 2026 filter trigger terms from magnet display names as a partial mitigation only.

## Sports Search Hygiene Work

This was part of making live sports/debrid usable safely in Stremio.

- `v1.3.6` removed broad all-category fallback from supplemental sports stream search.
- `v1.3.7` removed broad all-category fallback from sports catalog search.
- Adult Torznab category ids (`6000-6999`), adult category labels, and adult title/studio terms are blocked before sports stream or catalog emission.
- The exact Australian Football `On Couch` failure was fixed at both levels:
  - stream route no longer emits adult results;
  - catalog search no longer shows adult metadata entries.

## Release Timeline

| Version | Main purpose | Result |
|---|---|---|
| `v1.1.74` | Sports poster parser/layout correction | Fixed combat/motorsport poster classification, noisy titles, and fake matchup layouts. |
| `v1.3.0` | Debrid + cache search + Newznab baseline | Added RD/AD/PM clients, cache search, config schema, `/playback/debrid`, and Configure UI. |
| `v1.3.1` | Additive debrid routing correction | qBit/local streams always stay as fallback; debrid never removes them. |
| `v1.3.3` | Torrent-file debrid and poster entitlement repair | Preserved torrent files for debrid upload and tightened poster entitlement/template transport. |
| `v1.3.5` | Debrid-first downloader routing | Debrid becomes the first downloader layer when configured; qBit remains fallback. |
| `v1.3.6` | Sports stream search hygiene | Blocks adult/all-category leakage in sports stream results. |
| `v1.3.7` | Sports catalog search hygiene | Blocks adult/all-category leakage in sports catalog metadata. |

## Current Live Proof

### Public release proof

- Current public release: `v1.3.7`.
- Commit: `2ded9825749a6a139fa1db004cd213e8adef650f`.
- Tags published:
  - `v1.3.7`
  - `v1.3.7-selfhost`
- GitHub release assets:
  - `PVTKRRX-Setup-1.3.7.exe`
  - `PVTKRRX-Setup-1.3.7.exe.blockmap`
  - `PVTKRRX.1.3.7.exe`
  - `latest.yml`
  - `install-selfhost.sh`
- `https://www.pvtkrrx.cc/version-status.json` reports `currentVersion=1.3.7` and `updateAvailable=false`.

### Contabo proof

- Coolify public image:
  `w14jewmw5ubscrxh8zzfhq7d:2ded9825749a6a139fa1db004cd213e8adef650f`.
- Native `/opt/pvtkrrx` package version:
  `1.3.7`.
- Native `/opt/pvtkrrx/REVISION`:
  `2ded9825749a6a139fa1db004cd213e8adef650f`.
- `pvtkrrx.service` is active.
- Server-side proof passed:
  - `.node/node-v22.14.0-linux-x64/bin/node scripts/smoke-sports-stream-hygiene.js`
  - `.node/node-v22.14.0-linux-x64/bin/node scripts/smoke-debrid-routing.js`

### On Couch proof

- `search=On Couch` on the sports catalog returns no adult metadata entries.
- Normal sports browse still includes `Australian Football: On Couch`.
- The exact `Australian Football: On Couch` stream route returns two clean streams:
  - Premiumize first;
  - qBittorrent fallback second.
- Clicking the Premiumize stream logs:
  - `[playback-debrid] start`
  - `[svc:pm] POST /transfer/create -> 200`
  - `[playback-debrid] added provider=pm`
  - `state=downloading progress=0`

## Verification Commands Used

Local proof included:

```bash
npm run smoke:sports-stream-hygiene
npm run smoke:playback
npm run smoke:selfhost
npm run smoke:debrid-routing
npm run smoke:config
npm run smoke:desktop
npm run smoke:win-installer-path
node scripts/smoke-sports-catalog-latency.js
npm run dist:win
```

Earlier poster/debrid proof included:

```bash
npm run smoke:sports-parser
npm run smoke:sports-poster-adapter
npm run smoke:sports-poster-classifier
npm run smoke:sports-poster-render
npm run smoke:sports-single-event-motorsport
npm run smoke:sports-artwork
npm run smoke:sports-competitor-vs-competitor
npm run smoke:sports-template-families
npm run smoke:free-tier-artwork
npm run smoke:debrid-all
node scripts/__tests__/debrid/premiumize.test.js
node scripts/__tests__/debrid/realdebrid.test.js
node scripts/__tests__/debrid/alldebrid.test.js
```

## Remaining Caveats

- Premiumize handoff is proven, but playback cannot become ready until Premiumize finishes downloading or exposes playable bytes. During that state Stremio receives HTTP `503` from `/playback/debrid`.
- Real-Debrid's May 2026 filter cannot be fully bypassed by PVTKRRX because RD can inspect torrent internals after upload.
- If a sports category has no legitimate tracker result, PVTKRRX should now return no row/stream instead of broadening into unrelated categories.
- Public website code still needs a separate copy pass where visible pages say "No debrid"; the backend now supports optional debrid as a downloader layer while PVTKRRX still is not itself a debrid service.

## Safe Summary

Sports Posters work made the artwork path safer and more truthful: real SportsMeta artwork wins, selected built-in templates are honored for configured installs, fallback art is explicit, and dangerous entitlement/template shortcuts are blocked.

Debrid work made provider playback real: RD/AD/PM can be configured, cache hits are surfaced, uncached sports/private-tracker torrents are handed to Premiumize/other providers through `/playback/debrid`, and qBittorrent remains as the fallback instead of being removed.
