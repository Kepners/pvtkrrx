# PVTKRRX Project Status

Updated: 2026-05-17

## Current Stage

PVTKRRX is moving to the `1.1.73` release line. Release numbering remains app-aligned: desktop/latest is `vX.Y.Z`, self-host/seedbox is `vX.Y.Z-selfhost`, and legacy `v1.12.x-selfhost` tags are compatibility history only. The current release priority is hardening seedbox progressive playback so qBittorrent is forced head-first: sequential download on, first+last piece priority off, and selected playable files promoted ahead of unrelated files.

## 2026-05-17: v1.1.73 seedbox qBittorrent flag hardening

- Release scope: harden the qBittorrent Web API add path after live seedbox proof showed qBittorrent pulling tail pieces before playback started.
- Root cause addressed: the playback runtime already passed `firstLastPiecePrio=false`, but the low-level qBittorrent client only serialized true boolean flags, so a false value was omitted from `/api/v2/torrents/add`.
- Fix included: qBittorrent magnet/URL adds and uploaded `.torrent` adds now serialize both `sequentialDownload=true` and `firstLastPiecePrio=false` when playback requests those booleans.
- Regression proof added: `npm run smoke:playback` now asserts the actual qBittorrent add payloads include explicit false first/last priority for both add surfaces.
- User-facing test note: existing torrents that already downloaded tail pieces keep those bytes on disk; clean proof requires removing/re-adding the torrent after installing this revision or confirming the existing torrent has `Download first and last pieces first` unticked.

## 2026-05-17: v1.1.70 main unification and sports artwork release

- Release scope: merge the live `integrate/sportcult-category-contract` parser/sports-artwork work back into `main`, preserve the `1.1.69` playback release-line fixes, and publish a new Windows testable revision.
- Coolify control-plane state: public app id `9` / uuid `w14jewmw5ubscrxh8zzfhq7d` now tracks `main`, and `application_settings.is_auto_deploy_enabled=true` was verified directly in the Coolify DB.
- Sports/parser fixes included: SPORTS_TITLE_PARSER_SPEC §7 parser contract, live catalog wiring, competition/logo resolution hardening, owner/admin poster style forwarding, contrast-safe logo plates, and sports poster cache/render version `20260516-competition-context-v30`.
- Playback fixes included: selected torrent prioritization plus contiguous-piece buffer readiness proof from the `1.1.69` release line.
- Windows release assets rebuilt locally for `1.1.70`: `PVTKRRX Setup 1.1.70.exe`, `PVTKRRX 1.1.70.exe`, `PVTKRRX Setup 1.1.70.exe.blockmap`, and `latest.yml`.
- Local proof before push/release: `npm run smoke:sports-parser`, `npm run smoke:sports-resolution`, `npm run smoke:playback`, `npm run smoke:sports-artwork`, `npm run smoke:config`, `npm run smoke:selfhost`, `npm run smoke:entitlement`, `npm run smoke:free-tier-artwork`, `npm run smoke:pipeline`, `npm run smoke:security`, `npm run smoke:guards`, `npm run smoke:win-installer-path`, and `npm run dist:win` passed.
- Required post-push proof: `origin/main`, GitHub releases `v1.1.70` and `v1.1.70-selfhost`, Windows release assets, and the live Coolify container must all resolve to the same final revision before the release is called complete.

## 2026-05-16: v1.1.69 seedbox playback priority release

- Released commit `ae7d908c0f6066a82475d475cfae83b0fbba7b1c` to `main`, GitHub desktop release `v1.1.69`, paired self-host release `v1.1.69-selfhost`, the public Coolify website, and the native `/opt/pvtkrrx` self-host runtime.
- Playback fix: `/playback` now adds new torrents unpaused with sequential download, resumes incomplete selected torrents, requests top queue priority when qBittorrent supports queueing, promotes the selected video/archive files, demotes unrelated files, and redirects to `/file` as soon as qBittorrent exposes the selected file.
- Windows release assets published: `PVTKRRX-Setup-1.1.69.exe`, `PVTKRRX.1.1.69.exe`, `PVTKRRX-Setup-1.1.69.exe.blockmap`, `latest.yml`, and `install-selfhost.sh`.
- Local proof passed before release: `npm run smoke:win-installer-path`, `npm run smoke:playback`, `npm run smoke:desktop`, `npm run smoke:config`, `npm run smoke:selfhost`, `npm run smoke:pipeline`, `npm run smoke:remote-seedbox-guard`, `npm run smoke:guards`, `npm run smoke:parity`, and `npm run dist:win`.
- Live proof after release: `https://www.pvtkrrx.cc/version-status.json` returned `currentVersion=1.1.69`, `latestVersion=1.1.69`, `updateAvailable=false`, setup asset `PVTKRRX-Setup-1.1.69.exe`, and portable asset `PVTKRRX.1.1.69.exe`.
- Live download proof: `https://www.pvtkrrx.cc/download/windows/setup` redirects to the `v1.1.69` setup EXE, and `/download/windows/portable` redirects to the `v1.1.69` portable EXE.
- Live seedbox proof: `https://www.pvtkrrx.cc/selfhost/manifest.json?mode=hosted` and `https://pvtkrrx.cc/selfhost/manifest.json?mode=hosted` both return manifest version `1.1.69`; `pvtkrrx.service` is active on `/opt/pvtkrrx` at revision `ae7d908c0f6066a82475d475cfae83b0fbba7b1c`.

## 2026-05-14: v1.1.68 installer finish-path and self-host route repair

- Reproduced the live Stremio install failure for `https://www.pvtkrrx.cc/selfhost/manifest.json`: Caddy sent `/selfhost/*` to the public Coolify app, which treated `selfhost` as a config token and returned `400 Invalid config token`.
- Fixed the Contabo Caddy route so `https://www.pvtkrrx.cc/selfhost/*` and `https://pvtkrrx.cc/selfhost/*` proxy to the native `/opt/pvtkrrx` systemd runtime on port `7000`, while non-selfhost apex traffic still redirects to `https://www.pvtkrrx.cc`.
- Proved the installer hang source locally: NSIS `customInstall` synchronously executed the installed Electron app with `--pvtkrrx-network-access-only`, so slow firewall/Bonjour PowerShell checks could hold the setup progress bar near the end.
- Moved LAN access checks out of the blocking NSIS install phase. The desktop first-launch provisioning path remains responsible for firewall/Bonjour checks and elevated repair.
- Added a Windows installer guard that fails if the NSIS install phase synchronously runs `$appExe` again, if `--pvtkrrx-network-access-only` returns to the installer script, or if release surfaces contain PCNESTSPEAKER/user-path/private-host markers.
- Local proof passed: `npm run smoke:win-installer-path`, `npm run smoke:desktop`, `npm run smoke:parity`, `npm run smoke:guards`, `npm run smoke:config`, `npm run smoke:selfhost`, and `npm run dist:win`.

## 2026-04-30: v1.1.63 sport-level 4K backdrops and SportsCult category contract

- Sports backdrop fallback now uses reusable sport-level 4K landscape assets instead of event-, match-, league-, or competition-specific generated backdrops.
- Football competitions such as EPL, FA Cup, UCL, Champions League, Europa League, La Liga, Serie A, Bundesliga, Ligue 1, and international football all map to the same `football-4k.jpg` fallback.
- Trusted SportsMeta event/team artwork still wins when available; unresolved Prowlarr/SportsCult rows fall back to `/sports-backdrops/<sport>-4k.jpg`, and unknown sport detection falls back to `generic-sport-4k.jpg`.
- Added the SportsCult bracketed-category contract so tracker RSS category hints are preserved for title classification.
- Clarified and enforced the SportsMeta boundary: RSS/SportsCult poster generation and paid Sports Posters member artwork belong to the SportsMeta website/member addon only. PVTKRRX now consumes public/root SportsMeta artwork routes, rasterizes public SVG/glyph artwork for Stremio compatibility, drops legacy member-token config fields on normalization, and pins its public template to Ticket Stub.
- Release proof passed locally for the real Stremio sports catalog/meta routes, football mapping fixtures, contact-sheet style artifact, Windows build, self-host smoke, and installer syntax guard.

## 2026-04-28: sports poster artwork repair in progress

- Generated sports fallback artwork now uses sport-specific surfaces such as football pitches, basketball courts, baseball diamonds, hockey rinks, racing circuits, tennis courts, snooker tables, octagons, and rings instead of generic stripe cards.
- Generated matchup fallbacks no longer render fake acronym logos when real SportsMeta badge images are unavailable; they show the surface, team names, and a centered versus mark.
- `/sports-artwork/default/...` now carries parsed home/away hints and, when a Sports Posters token is configured, attempts a conservative SportsMeta canonical resolve before falling back to generated artwork.
- Local proof so far: `npm run smoke:sports-artwork`, `npm run smoke:sports-resolution`, and the `http://127.0.0.1:7099/` artwork debug page with cache version `20260428-surface-v8`.

## 2026-04-27: v1.1.57 FA Cup round-marker parser correction

- Supersedes `1.1.56` because the live targeted audit found FA Cup rows with round markers such as `QF West Ham Utd vs Leeds Utd` could still render as `Leeds Utd vs QF`.
- Sports title parsing now strips `QF`/`SF` round abbreviations without stripping real directional team names such as `West Ham`.
- Added a regression proving `FA Cup 2026 05 04 QF West Ham Utd vs Leeds Utd` parses as `West Ham Utd vs Leeds Utd`.

## 2026-04-27: v1.1.56 sports parser, artwork, and detail metadata repair

- Repairs parser coverage for the required tracker terms: PGA, PGA Tour, IPL, Indian Premier League, MLS, Major League Soccer, FA Cup, MLB, NBA Playoffs, and MotoGP session titles.
- Sports detail metadata now carries richer left-side facts for both canonical SportsMeta rows and unresolved Prowlarr fallback rows: sport, league, event, session, date, teams, source count, seeders, size, and resolution status where available.
- Sports detail backgrounds now prefer real landscape/background artwork and default landscape proxy URLs instead of using a portrait poster as the page backdrop.
- Mandatory regression tests now cover noisy NBA Playoffs, MLB, MLS, IPL, PGA Tour, FA Cup one-team rows, MotoGP compound sessions, and detail-page fallback metadata.
- Paired SportsMeta resolver update `9efadba` adds matching truth fixtures and tracker-noise normalization for the same mandatory terms.

## 2026-04-27: v1.1.55 bracketed tracker matchup artwork correction

- Supersedes `1.1.54` because the first live proof still showed ugly generated cards for tracker titles that hid the actual matchup inside an unmatched bracket, such as `{San Antonio Spurs @ Portland Trail Blazers ...`.
- Sports event normalization now uses loose matchup extraction even when a broader sports parser has already classified the row, prefers bracketed `{home @ away}` text, and strips common release-group suffixes before building generated poster initials.
- Added a sports artwork smoke regression for the NBA Playoffs tracker format so generated fallback posters use `San Antonio Spurs vs Portland Trail Blazers` instead of tracker-title initials.

## 2026-04-27: v1.1.54 generated sports artwork visual correction

- Supersedes `1.1.53` because the dimension guard made many fallback sports posters technically valid but visually worse.
- Generated fallback sports posters now use a stronger poster composition: matchup split panels, initials, a central `V`, sport-specific motifs for non-matchup events, and a constrained bottom text panel.
- Sports artwork proxy URLs now carry `v=20260427-visual-v2` so Stremio/client caches refresh the new generated artwork instead of keeping the older text-only poster bytes.

## 2026-04-27: v1.1.53 SportsMeta raster landscape guard

- PVTKRRX now validates proxied SportsMeta raster dimensions before returning them to Stremio.
- Invalid member landscape/background rasters such as ultra-wide team banners are replaced with a generated 16:9 team-badge landscape when canonical team data is available, or with the generated sports card fallback otherwise.
- Added a sports artwork smoke regression for an invalid `1000x185` member landscape returning a `1280x720` team-badge PNG instead of passing the banner through.

## 2026-04-27: v1.1.52 sports Discover stale canonical ranking correction

- Sports Discover no longer sorts every resolved SportsMeta row ahead of fallback tracker availability.
- Sports catalog ranking now uses query relevance first, then event freshness (`today/upcoming`, undated availability, stale past events), then normal tracker availability, with resolved SportsMeta identity kept as the final tie-break.
- This prevents stale canonical motorsport rows such as an older MotoGP sprint from pinning above fresher tracker rows that have not yet paired to SportsMeta.
- Added a `smoke:sports-catalog-seeds` regression where a stale resolved MotoGP Spain row has better pubDate/seeders than an undated MotoGP Brazil row; the Brazil row must remain first.
- SportsMeta TV schedule ingest is paired with this release through commit `821b03a`: Contabo fetches TheSportsDB `eventstv.php` by date plus sport, stores paired records/assets server-side, and exposes only cached SportsMeta/PVTKRRX URLs to clients.

## 2026-04-26: v1.1.51 Sports Posters entitlement-copy correction

- PVTKRRX `/sports` now presents one paid SportsMeta artwork entitlement, `Sports Posters`, instead of the stale Plus/Pro split.
- Public copy now states the real product scope: poster, background, logo, landscape, and other Stremio-compatible sports image fields when SportsMeta can safely resolve them.
- The PVTKRRX-facing sports page no longer advertises a monthly checkout path or a non-existent expanded Pro level.
- This release is paired with SportsMeta commit `c310d45`, which normalizes legacy `plus`/`pro` tier ids to the single Sports Posters entitlement and prevents landscape SportsDB thumb/banner images from being served raw as posters.

## 2026-04-26: v1.1.50 proactive sports artwork pairing

- SportsMeta resolver changes are paired with PVTKRRX changes for availability-driven sports rows: Prowlarr/qBittorrent still decide whether a row exists, while SportsMeta now resolves identity and artwork more proactively without guessing below threshold.
- Superseded by the 2026-04-30 boundary correction: PVTKRRX no longer consumes SportsMeta member raster routes. Paid Sports Posters routes and entitlement tokens stay on SportsMeta; PVTKRRX keeps only the public SVG/glyph fallback path.
- PVTKRRX sports identity backfill now persists to the runtime directory by default, so startup/prewarm work can survive process restarts instead of only helping the first in-memory response window.
- Added `npm run audit:sports-artwork` to sample live-style sports catalog rows and report poster/background URLs, asset source headers, dimensions, fallback status, and mismatch reasons.
- Local proof passed before release prep:
  - `npm run smoke:sports-resolution`
  - `npm run smoke:sports-artwork`
  - `npm run smoke:sports-catalog-seeds`
  - `npm run smoke:sports-catalog-latency`
  - `node --check scripts/audit-sports-artwork.js`
  - `node --check src\utils\sportsIdentityBackfill.js`

## 2026-04-25: v1.1.49 sports Discover poster-shape correction

- Product rule clarified after the live screenshot review: sports Discover rows are meant to use portrait/square poster tiles, not landscape wallpaper tiles.
- Root cause: the `1.1.45` sports artwork hotfix routed the landscape proxy URL into the catalog `poster` field and emitted `posterShape: landscape`, which made Stremio's Discover poster row warp sports artwork.
- Repo fix: sports catalog rows now emit `/sports-artwork/.../poster/...png` in `poster` with `posterShape: poster`; landscape/background artwork stays on the `background` field for detail/backdrop use.
- Added smoke coverage in `smoke:sports-catalog-seeds` so sports browse rows fail if the catalog poster regresses back to a landscape artwork URL.
- Local proof passed:
  - `npm run smoke:sports-catalog-seeds`
  - `npm run smoke:sports-resolution`
  - `npm run smoke:sports-artwork`
  - `npm run smoke:pipeline`
  - `npm run smoke:config`
  - `(Get-Content scripts\install-selfhost.sh -Raw) -replace "\r", "" | bash -n`
  - `npm run dist:win`

## 2026-04-25: v1.1.48 MotoGP wrong-source follow-up

- Live self-host proof on `1.1.47` showed the Oak Island Movie/TV source route was fixed, but the first resolved MotoGP SportsMeta row still hit a stream timeout after matching a different same-title qBittorrent torrent by title.
- Root cause: resolved sports rows with an explicit tracker hash could still fall through to qBit title matching when that exact hash was not already present locally.
- Repo fix: explicit tracker-hash sports anchors no longer title-match a different local qBit torrent, and once their selected tracker source is emitted they skip slow supplemental sports searches.
- Added smoke coverage for the wrong-source case: selected MotoGP Spain Sprint hash present, wrong same-title qBit torrent present, and supplemental search forbidden.
- This supersedes `1.1.47` as the final playback-source release for the MotoGP repro.

## 2026-04-25: v1.1.47 live Prowlarr timeout follow-up

- Live direct Prowlarr proof showed `The Curse of Oak Island S12E17` does exist, but the broad title search takes about 9 seconds on the Contabo stack.
- PVTKRRX's previous Movie/TV fallback budget was 5 seconds, so it timed out before the correct source could be filtered and emitted.
- Repo fix: Movie/TV upstream search default budget is now 10s and title fallback budget is now 12s, while the strict episode/title filtering from `1.1.45`/`1.1.46` still prevents wrong-episode matches.
- This remains the Movie/TV source-chip fix for the Oak Island repro, but the overall screenshot hotfix is superseded by `1.1.48` because MotoGP needed the wrong-source guard above.

## 2026-04-25: v1.1.46 live TV-source follow-up

- Live verification of `1.1.45` on Contabo still returned `0` streams for `https://pvt.kepners.co.uk/selfhost/stream/series/tt3455408:12:17.json?mode=hosted`.
- The remaining live root cause was different from the original filter bug: Prowlarr broad TV title fallback timed out repeatedly, while qBittorrent already reported candidate torrents for the request.
- Repo fix:
  - Movie/TV stream handling now builds strict qBittorrent title fallback items when Prowlarr is empty, rejected, or slow.
  - Series fallback requires the exact `SxxEyy` marker plus the same partial title-token rules used for localized tracker titles, so downloaded `Oak Island ... S12E17` torrents can surface without accepting a different episode.
  - Added smoke coverage for this qBit-only localized TV episode path.
- This follow-up added the local qBittorrent fallback, but live Oak Island still needed the `1.1.47` Prowlarr timeout budget increase because that episode was not already present in qBittorrent.

## 2026-04-25: v1.1.45 playback source and sports artwork hotfix

- Reproduced the missing PVTKRRX source-chip issue against the live self-host route before changing code:
  - `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted` advertised `movie,series,sports` and stream resource types correctly.
  - `https://pvt.kepners.co.uk/selfhost/stream/series/tt3455408:12:17.json?mode=hosted` returned `0` streams.
  - live logs showed the title fallback for `The Curse of Oak Island` hit `Prowlarr HTTP 400` on categorized TV search, then stopped.
- Root causes fixed in repo:
  - TV title fallback now retries broad search after a categorized Prowlarr rejection.
  - exact TV episode matches can survive partial title-token overlap, so localized tracker titles such as `Oak Island E Il Tesoro Maledetto S12E17` are not discarded only because they miss the English word `Curse`.
  - non-matchup sports supplemental searches now validate event/session/location tokens before attaching extra MotoGP/F1-style results, so a different race/weekend cannot win just because it has more seeders.
  - sports browse catalog rows were switched to landscape artwork in this release, but that was corrected in `1.1.49`; current sports browse rows use portrait/square poster artwork with `posterShape: poster`, while sports detail metadata keeps portrait poster artwork and landscape background artwork.
  - member SportsMeta artwork now goes through the PVTKRRX `/sports-artwork/...png` raster proxy, so poster/background/logo variants are normalized before Stremio renders them.
- Local proof passed:
  - `npm run smoke:pipeline`
  - `npm run smoke:sports-resolution`
  - `npm run smoke:sports-artwork`

## 2026-04-25: Sports tablet search/poster prewarm hotfix

- Reproduced the tablet-facing complaint against the live Contabo self-host route before this fix: sports search rows were being returned before the SportsMeta identity pass/backfill had paired them, so many visible rows used generated fallback cards instead of member poster URLs.
  - `search=MotoGP` initially returned current tracker rows but no canonical SportsMeta poster row.
  - `search=Premier League` initially admitted unrelated `Indian Premier League` cricket rows and had no canonical poster rows.
  - server logs showed `identity_budget_exhausted` rows and backfill work queued after the catalog response had already been sent.
- Root cause:
  - the first catalog response had only a 1s SportsMeta identity budget and no server boot prewarm/index pass
  - MotoGP tracker titles such as `MotoGP Spain Jerez` were too short for the event parser and were being date-anchored to torrent publish date instead of the real SportsMeta event
  - known-league search used loose text matching, so `Premier League` matched cricket and Scottish football titles
  - matchup search fallback could accept a one-team token overlap, which was enough to risk a wrong Chelsea poster pairing
- Repo fix:
  - added self-host sports catalog prewarm in `src/utils/sportsCatalogPrewarm.js`, scheduled at boot/config save for the self-host runtime
  - added backfill idle waiting so the prewarm can leave the identity cache ready for the next tablet browse
  - tightened MotoGP/motorsport short-title parsing, undated motorsport search, and location-alias matching
  - tightened known-league filtering so English Premier League search no longer admits IPL or Scottish Women’s Premier League rows
  - tightened matchup search verification so both teams must loosely match before a search candidate can become canonical
  - sorted resolved SportsMeta rows before fallback rows inside the emitted sports catalog page
- Live Contabo self-host hotfix applied directly to `/opt/pvtkrrx` and `pvtkrrx.service` restarted active.
  - backups include `/opt/pvtkrrx-backups/20260425-193733-sports-search-prewarm-hotfix`, `/opt/pvtkrrx-backups/20260425-194423-sports-prewarm-defaults`, `/opt/pvtkrrx-backups/20260425-194854-sports-parser-verifier`, `/opt/pvtkrrx-backups/20260425-195320-sports-league-filter`, `/opt/pvtkrrx-backups/20260425-195741-sports-canonical-sort`, and `/opt/pvtkrrx-backups/20260425-200314-sports-canonical-sort-bool`
  - latest boot prewarm proof: `[sports-prewarm] finished reason=server-boot jobs=32 ok=32 failed=0 metas=686 cacheBefore=0 cacheAfter=232 queuedAfterCatalog=70 remainingQueue=0`
- Final live proof after prewarm:
  - all sports default: `50` rows, `17` canonical/member-poster rows; first 8 rows were all canonical
  - football default: `17` rows, `5` canonical/member-poster rows; first 5 rows were canonical
  - motorsport default: `25` rows, `1` canonical/member-poster row, first row `Spain Sprint Race`
  - `search=MotoGP`: `50` rows, `1` canonical/member-poster row, first row `Spain Sprint Race`
  - `search=Champions League`: `45` rows, `1` canonical/member-poster row, first row `Arsenal vs Sporting CP`
  - `search=Premier League`: `22` rows, `0` canonical/member-poster rows, with `0` IPL rows and `0` Scottish Women’s Premier League rows
  - no probed route contained the bad Ghanaian Chelsea pairing (`Berekum Chelsea` / `Medeama`)
- Caveat: this makes the server index/prewarm real and improves first-screen poster visibility, but it does not make Sports Posters commercially complete. Premier League search is now cleaner but still has zero pairable poster rows because the remaining tracker titles are mostly undated matchday labels; pairing those without dates would risk wrong posters. This is a live self-host/runtime hotfix on top of app version `1.1.44`; no new Windows EXE or paired release tag was cut.

### Follow-up live audit on 2026-04-25

- Additional Contabo backups from the follow-up deploy: `/opt/pvtkrrx-backups/20260425-201848-sports-hint-conflict`, `/opt/pvtkrrx-backups/20260425-203144-sports-hint-elc`, and `/opt/pvtkrrx-backups/20260425-204236-sports-prewarm-throttle`.
- Conflicting Prowlarr category hints no longer override strong title league/sport signals, so `EFL`/`ELC` football tracker rows do not leak into the Motorsport catalog.
- Boot sports prewarm now starts after 60s, runs 24 priority jobs, and uses lower seed-query concurrency. Prowlarr and PVTKRRX were restarted to clear the stuck live search queue.
- Latest boot prewarm proof: `[sports-prewarm] finished reason=server-boot jobs=24 ok=24 failed=0 metas=712 cacheBefore=120 cacheAfter=292 queuedAfterCatalog=0 remainingQueue=0 ms=51098`.
- Latest all-default live pass: all 17 configured sport default catalogs returned HTTP `200`; All Sports `50/20`, Football `34/8`, Motorsport `12/1`, MMA `50/1`, Basketball `13/1`, Rugby `3/2`, Baseball `15/5`, Hockey `12/3`, where the second number is canonical/member-poster rows.
- Current weak/default-empty surfaces: Boxing, Golf, and Cycling returned `0` default rows; American Football, Cricket, Tennis, Darts, Snooker, and Wrestling returned rows but no canonical/member-poster rows in the default pass.
- Latest common all-sports search proof: Premier League `22/0`, Formula 1 `43/0`, UFC `46/1`, NBA `50/12`, NFL `50/0`, IPL `50/0`, MotoGP `50/1`, WWE `15/0`, PDC `50/0`.
- Commercial-readiness caveat still stands: the server is now indexing and pairing what can be safely paired, but several sports/leagues still need better SportsMeta coverage/title parsing before this is chargeable as a complete Sports Posters product.

## 2026-04-25: v44 sports tablet artwork and stream hotfix

- Reproduced the tablet-facing seedbox failure against the live self-host route before changing stream behavior:
  - selected item: `sportsmeta:event:football|2026-04-18|english-premier-league|chelsea|manchester-united`
  - catalog and meta returned valid sports metadata and reachable SportsMeta member JPEG poster/background URLs
  - `GET https://pvt.kepners.co.uk/selfhost/stream/sports/sportsmeta%3Aevent%3Afootball%7C2026-04-18%7Cenglish-premier-league%7Cchelsea%7Cmanchester-united.json?mode=hosted` did not complete within a 60s probe timeout, leaving Stremio stuck in the addon loading state
- Root cause: canonical sports stream handling could spend the whole request budget on sequential supplemental Prowlarr searches plus tracker-link inspection even when the catalog carried an availability anchor with a usable infohash/link.
- Repo fix:
  - added `scripts/probe-sports-item.js` and `npm run probe:sports-item -- "<ITEM_ID_OR_SLUG>"` for manifest -> catalog -> meta -> artwork -> stream proof
  - added `src/utils/sportsEventNormalizer.js` so tracker titles become `{ sport, competition, eventTitle, eventDetail, date, seeders, size, rawTitle, source }` before fallback artwork
  - added `src/utils/sportsCardArtwork.js` and `npm run smoke:sports-artwork` to generate tablet-safe PNG/SVG card previews and assert dimensions, viewBox, line limits, and safe text coordinates
  - changed the PVTKRRX `/sports-artwork/...png` proxy so SportsMeta raster images still win, but SportsMeta SVG fallback cards are replaced with local tablet-safe generated PNG cards instead of passing through the cramped SVG layout
  - bounded sports stream handling with a 14s response ceiling, shorter supplemental search plans once a direct anchored stream exists, parallel category/broad sports searches, and no torrent-payload inspection when a trusted Prowlarr infohash is already available
- Live Contabo self-host hotfix applied to `/opt/pvtkrrx` and `pvtkrrx.service` restarted active.
  - backup: `/opt/pvtkrrx-backups/20260425-132332-sports-tablet-v44-hotfix`
  - syntax checks passed on patched live handlers and new utility modules before restart
- Post-fix live proof on the selected item:
  - manifest: `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted` returned `200`
  - catalog: `https://pvt.kepners.co.uk/selfhost/catalog/sports/pvtkrrx-sports.json?mode=hosted` returned `200` with 50 metas
  - meta: selected Chelsea vs Manchester United meta route returned valid sports meta
  - poster/background: returned `200 image/jpeg` from SportsMeta member artwork, with the token redacted in logs/probe output
  - stream: selected stream route returned `200` in `8506ms` with `{ "streams": [...] }`, `6` streams, and public HTTPS `/selfhost/playback/...` stream URLs
  - generated fallback previews returned `200 image/png` with `X-PVTKRRX-Artwork-Source: pvtkrrx-generated-card` for football, baseball, hockey, and motorsport long-title cases
- Local proof passed:
  - `npm run smoke:sports-artwork`
  - `npm run smoke:sports-resolution`
  - `npm run smoke:pipeline`
  - `npm run smoke:sports-catalog-seeds`
- Follow-up every-sport hardening on 2026-04-25:
  - widened matchup/title cleanup beyond football/baseball/hockey to cover all configured sports discovery families: football, motorsport, MMA, American football, basketball, cricket, rugby, tennis, boxing, golf, baseball, cycling, darts, snooker, hockey, and wrestling
  - expanded `npm run smoke:sports-artwork` so every configured sport family has a normalization/layout case and the test fails if a new sports catalog is added without card coverage
  - redeployed the updated runtime parser/normalizer files to `/opt/pvtkrrx`, restarted `pvtkrrx.service`, and confirmed the service is active
  - live fallback artwork proof fetched every configured sport family from `https://pvt.kepners.co.uk/sports-artwork/default/poster/<sport>.png`; all returned `200 image/png`, `600x900`, with `X-PVTKRRX-Artwork-Source: pvtkrrx-generated-card`
  - live stream probes passed for current football, motorsport, baseball, hockey, and rugby catalog/canonical rows; the historical Chelsea vs Manchester United canonical row now returns valid empty `{ "streams": [] }` instead of hanging when no current tracker stream is available
- Caveat: this is a live self-host/runtime hotfix on top of app version `1.1.44`; it has not yet been cut as a new desktop EXE or paired release tag.

## 2026-04-25: 1.1.44 self-host release numbering correction

- Corrected the confusing split numbering that made `1.1.44`, `v1.12.29-selfhost`, and `1.1.42` look like competing current releases.
- Current release identity is now:
  - desktop/latest release: `v1.1.44`
  - self-host/seedbox release: `v1.1.44-selfhost`
  - legacy compatibility alias: `v1.12.29-selfhost`, retitled as legacy and mapped to app `1.1.44`
  - release commit for all three tags: `dfb013b15819ee70037f2877b195a3cf077f2ad2`
- New rule: future self-host releases use `vX.Y.Z-selfhost` for the same app version. Do not issue new `v1.12.x-selfhost` counter tags.
- GitHub release proof:
  - `v1.1.44-selfhost` is published as a prerelease with `install-selfhost.sh`
  - `v1.1.44`, `v1.1.44-selfhost`, and `v1.12.29-selfhost` all resolve to commit `dfb013b15819ee70037f2877b195a3cf077f2ad2`
  - old `v1.12.29-selfhost` remains available only so older pinned installer commands do not break
- Contabo self-host restore proof after the accidental `v1.12.27-selfhost` / app `1.1.42` downgrade:
  - restored `/opt/pvtkrrx` using installer tag `v1.1.44-selfhost`
  - backup path: `/opt/pvtkrrx-backups/20260425-134046-restore-v1.1.44-selfhost/pvtkrrx-code-pre-v1.1.44-selfhost.tgz`
  - `/opt/pvtkrrx/package.json` reports `version: 1.1.44`
  - `pvtkrrx.service`, `qbittorrent-nox.service`, and `prowlarr.service` are active
  - `https://pvt.kepners.co.uk/version-status.json` reports `currentVersion=1.1.44`, `latestVersion=1.1.44`, and `updateAvailable=false`
  - `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted` reports id `com.kepners.pvtkrrx.selfhost`, version `1.1.44`, and `behaviorHints.configurationRequired=false`
  - unauthenticated `https://pvt.kepners.co.uk/selfhost/config.json` still returns `401`
- Hosted/public proof:
  - `https://www.pvtkrrx.cc/version-status.json` reports `currentVersion=1.1.44`, `latestVersion=1.1.44`, and `updateAvailable=false`

## 2026-04-25: 1.1.43 release and live sync

- Shipped the self-host install identity fix as:
  - desktop/latest release: `v1.1.43`
  - self-host/seedbox release: `v1.12.28-selfhost`
  - release commit: `6c0711ad4e78d6ca366d9f568d718d9736f5fb6a`
- Windows release assets published on `v1.1.43`:
  - `latest.yml`
  - `PVTKRRX-Setup-1.1.43.exe`
  - `PVTKRRX-Setup-1.1.43.exe.blockmap`
  - `PVTKRRX.1.1.43.exe`
  - `install-selfhost.sh`
- Self-host/seedbox prerelease `v1.12.28-selfhost` is published with `install-selfhost.sh`.
- Hosted runtime sync:
  - initial Coolify deployment `473` for commit `6c0711a` failed during `npm ci`
  - forced rebuild deployment `474` finished successfully
  - live public container is `w14jewmw5ubscrxh8zzfhq7d-074521578672`
  - live public image is `w14jewmw5ubscrxh8zzfhq7d:6c0711ad4e78d6ca366d9f568d718d9736f5fb6a`
  - `https://www.pvtkrrx.cc/version-status.json` reports `currentVersion=1.1.43`, `latestVersion=1.1.43`, and `updateAvailable=false`
  - `https://www.pvtkrrx.cc/manifest.json` reports `version=1.1.43`
  - `https://www.pvtkrrx.cc/download/windows/setup` redirects to the `v1.1.43` setup asset
  - `https://www.pvtkrrx.cc/download/windows/portable` redirects to the `v1.1.43` portable asset
- Contabo self-host runtime sync:
  - updated `/opt/pvtkrrx` using installer tag `v1.12.28-selfhost`
  - backup/log directory: `/opt/pvtkrrx-backups/20260425-095155-v1.1.43-release-sync`
  - `/opt/pvtkrrx/package.json` reports `version: 1.1.43`
  - `pvtkrrx.service`, `qbittorrent-nox.service`, and `prowlarr.service` are active
  - `https://pvt.kepners.co.uk/version-status.json` reports `currentVersion=1.1.43`, `latestVersion=1.1.43`, and `updateAvailable=false`
  - `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted` reports id `com.kepners.pvtkrrx.selfhost`, version `1.1.43`, `behaviorHints.configurationRequired=false`, `behaviorHints.configurable=true`, and `20` catalogs
  - unauthenticated `https://pvt.kepners.co.uk/selfhost/config.json` still returns `401`

## 2026-04-25: Self-host Stremio install identity separation

- Reproduced the install-management symptom against the live self-host route: `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted` returned a configured manifest (`configurationRequired=false`) but still used addon id `com.kepners.pvtkrrx.online`.
- Root cause: that id is also used by hosted Remote Seedbox token manifests. If Stremio already has an older `com.kepners.pvtkrrx.online` install, opening the self-host URL can show the existing addon as `Configure` / `Uninstall` instead of storing the self-host URL as a separate install.
- Local fix: explicit self-host disk-backed manifests now use `com.kepners.pvtkrrx.selfhost`; hosted Remote Seedbox token manifests continue to use `com.kepners.pvtkrrx.online`.
- User-facing implication: after this fix is live, the self-host server link may need one fresh install because the addon id changed. Old hosted/temporary PVTKRRX entries can be removed from Stremio once the self-host entry is present.

## 2026-04-25: Self-host password recovery and manifest retrofit hardening

- Live symptom reproduced on `https://pvt.kepners.co.uk/configure`: the browser had a stale self-host password and `/selfhost/config.json` returned `401 Valid self-host password required`.
- Proved the saved server config was still present and healthy: `/app-config.json` reported `serverConfigConfigured=true`, and `/selfhost/config.json` returned the saved Prowlarr/qBittorrent readback when called with the current server-side self-host password.
- Copied the current unlock URL to the Windows clipboard without printing the password into chat.
- Patched the configure page so a rejected self-host password clears the stale browser-stored password instead of retrying it on every load.
- Patched the self-host installers to preserve an existing runtime `server-admin-token` file when `.env` does not already contain `PVTKRRX_SELF_HOST_PASSWORD` / `PVTKRRX_SERVER_ADMIN_TOKEN`, preventing accidental admin-password rotation on future installer runs.
- Clarified the self-host manifest model in the UI and docs: the installed `/selfhost/manifest.json?mode=hosted` route is stable and uses the current saved server config on the next request; Stremio refresh is only needed for a new device or a manifest contract change.
- Local proof passed:
  - `node --check scripts/server-installer.js`
  - `node --check scripts/server-setup.js`
  - `node --check scripts/smoke-config-flow.js`
  - `node --check scripts/smoke-selfhost-server.js`
  - `npm run smoke:config`
  - `npm run smoke:selfhost`
- Live `/opt/pvtkrrx` hotfix applied with backup at `/opt/pvtkrrx-backups/20260425-082950-selfhost-admin-password-ui`; `pvtkrrx.service` restarted active.

## 2026-04-25: Public Sports Posters URL alignment

- `https://www.pvtkrrx.cc/sports` is now the intended public PVTKRRX-facing Sports Posters page.
- The page uses the same dark neon PVTKRRX visual language as the existing homepage and keeps the sports/product boundary explicit: PVTKRRX streaming stays free, while paid Sports Posters only upgrades sports poster, background, and logo artwork.
- Added a narrow hosted relay endpoint, `POST /sports/billing/checkout`, which proxies `posters` checkout creation to SportsMeta with `interval=month|year`. Stripe keys, member tokens, entitlement checks, premium artwork bytes, portal handling, and webhooks remain in SportsMeta.
- Local proof used a mock SportsMeta checkout server and passed:
  - `GET /sports` returned `200` and rendered the Sports Posters checkout controls.
  - `POST /sports/billing/checkout` forwarded `tierId=posters` and `interval=year`, then returned the mock Stripe checkout URL.

## 2026-04-25: Sports poster/result backfill hardening

- Reproduced the reported seedbox symptom on `https://pvt.kepners.co.uk/selfhost` before changing code:
  - the `Levante vs Sevilla` sports catalog row resolved to `sportsmeta:event:football|2026-04-23|spanish-la-liga|levante|sevilla`
  - the stream route returned one playable source from `SportsCult`
  - direct Prowlarr checks for `La Liga 2026 Levante Sevilla`, `Levante Sevilla`, and `Levante vs Sevilla` returned only `SportsCult` for the current fixture, even with broad search, so that exact row is not hiding other current tracker sources inside PVTKRRX
- Added an in-process sports identity backfill queue. When a sports catalog row ships unresolved because the fast identity pass timed out or deferred it, PVTKRRX now queues a background SportsMeta resolution and caches the result so the next catalog refresh can emit the canonical `sportsmeta:` row and member poster URLs.
- Improved sports title cleanup for tracker/broadcast noise:
  - `720p60fps`, `720pEN60fps`, `1080p60`, `1080i`, `ESPNP`, `USAN`, `NESN`, `MSG`, `F1TV`, `R1`, `GM3`, playoff wording, and motorsport practice/sprint/qualifying session tokens are stripped from identity matching where appropriate.
  - MotoGP/session titles now resolve around the event/weekend wording instead of letting the session label block poster recovery.
- Added sport stream search aliases for canonical rows. The stream path now tries bounded league alias/year/date variants such as `La Liga 2026 Levante Sevilla 23 04`, while keeping a hard query cap so a single Stremio stream request does not fan out indefinitely.
- Local checks passed:
  - `node --check` on changed PVTKRRX sports files
  - `npm run smoke:sports-resolution`
  - `npm run smoke:pipeline`
  - `npm run smoke:sports-catalog-seeds`
  - `npm run smoke:sports-catalog-latency`
  - `npm run smoke:selfhost`
  - `npm run smoke:config`
- Release follow-up:
  - bumped PVTKRRX to `1.1.41`
  - rebuilt the Windows EXE line with `npm run dist:win`
  - published GitHub desktop release `v1.1.41` with `latest.yml`, setup EXE, blockmap, and portable EXE assets
  - published self-host prerelease `v1.12.26-selfhost`
  - updated the Contabo self-host runtime from `v1.12.26-selfhost`; `https://pvt.kepners.co.uk/version-status.json` reports `currentVersion=1.1.41`, `latestVersion=1.1.41`, and `updateAvailable=false`
  - `https://www.pvtkrrx.cc/version-status.json` also reports `currentVersion=1.1.41`, `latestVersion=1.1.41`, and `updateAvailable=false`

## 2026-04-24: Sports tracker broad-search release

- Reproduced the user-facing MotoGP/Jerez failure against the live Contabo seedbox before changing release state: Prowlarr category `5060` returned only one `SportsCult` result, while a broad Prowlarr search returned the same event from `SportsCult`, `TorrentLeech`, and `Torrenting`.
- Updated the sports catalog path so accepted sports availability can come from any configured Prowlarr indexer, not just `SportsCult`.
- Updated the sports stream path so sparse sports-category lookups fall back to a broad Prowlarr search, merge unique results, and keep the existing packed/unverified torrent suppression.
- Deployed the hotfix to `/opt/pvtkrrx` on the Contabo self-host runtime and re-proved the same MotoGP/Jerez stream route returns three tracker rows: `SportsCult`, `TorrentLeech`, and `Torrenting`.
- Cut release `1.1.40` for the Windows EXE line and self-host update line so installed seedboxes can update from the published GitHub release. `1.1.38` was superseded after live installer proof exposed a non-fatal Prowlarr download-client sync failure that could still make the self-host installer exit non-zero; `1.1.39` was superseded after live proof showed the shell installer could treat qBittorrent's already-active WebUI port as a conflict and save the wrong qBit URL.
- Updated `scripts/server-installer.js --auto` so optional Prowlarr/qBittorrent download-client sync failures warn and continue, matching the interactive installer behavior and preserving the app update.
- Updated `scripts/install-selfhost.sh` so existing active qBittorrent installs keep their systemd/configured WebUI port instead of being moved to a guessed fallback port during updates.
- Local release checks passed:
  - `npm run smoke:pipeline`
  - `npm run smoke:sports-catalog-seeds`
  - `npm run smoke:sports-resolution`
  - `npm run smoke:selfhost`
  - `npm run smoke:config`
  - `node scripts/smoke-prowlarr-qbit-link.js`
  - `(Get-Content scripts\install-selfhost.sh -Raw) -replace "\`r", "" | bash -n`
  - `npm run dist:win`

## 2026-04-24: Contabo self-host canonical sports meta type hotfix

- New live regression reproduced on the Contabo self-host route after installer and manifest success: canonical sports catalog rows were emitted as Stremio `type: "sports"`, but the canonical `sportsmeta:event:` meta branch returned `meta.type: "movie"` because it inherited SportsMeta's internal event type.
- Exact failing row traced before the fix:
  - catalog: `GET https://pvt.kepners.co.uk/selfhost/catalog/sports/pvtkrrx-sports.json?mode=hosted`
  - id: `sportsmeta:event:basketball|2026-04-23|nba|atlanta-hawks|new-york-knicks`
  - catalog type: `sports`
  - meta: `GET https://pvt.kepners.co.uk/selfhost/meta/sports/sportsmeta%3Aevent%3Abasketball%7C2026-04-23%7Cnba%7Catlanta-hawks%7Cnew-york-knicks.json?mode=hosted`
  - pre-fix meta response returned `meta.type: "movie"`, which mismatched the requested Stremio sports surface.
- Fixed `src/handlers/meta.js` so canonical SportsMeta meta responses preserve the requested route type, while keeping the canonical id, name, description, and artwork path unchanged.
- Added a regression assertion to `scripts/smoke-sports-resolution.js` proving a SportsMeta payload with internal `event.type: "movie"` still returns `meta.type: "sports"` when requested through the PVTKRRX sports surface.
- Deployed the one-file runtime hotfix to `/opt/pvtkrrx/src/handlers/meta.js`, backed up the previous live file under `/opt/pvtkrrx-backups/20260424-202150-meta-type-hotfix/`, and restarted `pvtkrrx.service`.
- Post-fix live proof on the same Contabo route:
  - same catalog row still exists with `type: "sports"`
  - same meta URL returns `200 application/json` with `meta.type: "sports"`
  - canonical poster proxy returns `200 image/png`
- Local guard checks passed:
  - `npm run smoke:sports-resolution`
  - `npm run smoke:selfhost`

## 2026-04-24: Portable sports catalog reliability fix

- Reproduced the remaining runtime failure on the supported product surfaces before changing code:
  - local desktop `manifest` returned `200`
  - local desktop `football` timed out at roughly `90s`
  - local desktop `motorsport` returned `200` with `50 metas`, `0 canonical`, `50 fallback`
  - local desktop `mma` returned `200` with `50 metas`, `1 canonical`, `49 fallback`
  - self-host `manifest` returned `200`
  - self-host `football` timed out at roughly `90s`
  - self-host `motorsport` returned `200` with `50 metas`, `0 canonical`, `50 fallback`
  - self-host `mma` returned `200` with `50 metas`, `1 canonical`, `49 fallback`
- Proved the true failure boundary was not a machine-specific install path and not direct Prowlarr starvation. The portable bottleneck was repeated SportsMeta resolution churn on football titles:
  - direct trace before the fix showed `sportsmetaResolve=766`, `sportsmetaSearch=1400` with only `190` unique search keys, and `sportsmetaEvent=6289` with only `631` unique canonical ids
  - the same trace showed football runtime exploding to `149164ms` and later `458972ms`, while Prowlarr time was only a smaller subset of the total wall-clock time
  - football was uniquely bad because noisy repeated club tokens kept re-walking the same SportsMeta search and event candidates
- Landed the repo fix in the real product code instead of patching one box:
  - `src/clients/sportsmeta.js` now caches successful JSON lookups and dedupes in-flight requests across repeated catalog/event fetches
  - `src/utils/sportsIdentityResolution.js` now strips generic football noise terms from search terms and shortlists search candidates before dereferencing canonical events
  - `scripts/smoke-sports-resolution.js` now proves repeated football resolutions reuse cached SportsMeta responses and skip mismatched-date/unrelated candidates
- Direct trace after the fix proved the pathological churn was cut down materially:
  - football dropped to `29005ms`, `50 metas`, `20 canonical`, `30 fallback`
  - `sportsmetaEvent` dropped from `6289` to `95`
  - motorsport stayed at `10036ms`, `50 metas`
  - mma stayed at `6110ms`, `50 metas`
- Deployed the same repo-backed fix to the live self-host runtime at `/opt/pvtkrrx`, restarted `pvtkrrx.service`, and re-tested the supported surfaces.
- Post-fix supported-surface proof on 2026-04-24:
  - local desktop:
    - `manifest`: `200` in `25ms`
    - `football`: `200` in `25355ms`, `50 metas`, `20 canonical`, `30 fallback`
    - `motorsport`: `200` in `7360ms`, `50 metas`, `0 canonical`, `50 fallback`
    - `mma`: `200` in `7168ms`, `50 metas`, `1 canonical`, `49 fallback`
  - self-host:
    - `manifest`: `200` in `160ms`
    - `football`: `200` in `26884ms`, `50 metas`, `20 canonical`, `30 fallback`
    - `motorsport`: `200` in `7425ms`, `50 metas`, `0 canonical`, `50 fallback`
    - `mma`: `200` in `5991ms`, `50 metas`, `1 canonical`, `49 fallback`
- Local and self-host are now back on the same sports contract:
  - both surfaces return `50` metas for football, motorsport, and mma
  - both surfaces emit canonical `sportsmeta:event:` ids where resolution is provable and `pvtkrrx:` fallback ids where it is not
  - both surfaces emit only `https://sportsmeta.pvtkrrx.cc` artwork URLs on the tested catalogs
- Re-proved the approved SportsMeta/PVTKRRX model still holds:
  - public canonical poster route `GET /asset/poster/:id` returns `200 image/svg+xml`
  - public default fallback poster route `GET /asset/default/poster/:sport` returns `200 image/svg+xml`
  - SportsMeta member routes still work live:
    - `GET /member/:token/manifest.json` returns `200`
    - `GET /member/:token/asset/poster/:id` returns `200 image/jpeg`
  - `src/lib/shared.js` still keeps `requireConfigSubscription()` as a pass-through, so no fake sports unlock gate has reappeared
  - the current repo `src` tree still does not import or use a live legacy SportsDB client on the active sports path
- Smoke coverage passed on 2026-04-24:
  - PASS: `smoke:sports-resolution`
  - PASS: `smoke:sports-catalog-seeds`
  - PASS: `smoke:sports-catalog-latency`
  - PASS: `smoke:config`
  - PASS: `smoke:selfhost`
  - PASS: `smoke:parity`
  - PASS: `smoke:desktop`
  - PASS: `smoke:stremio-link`
  - PASS: `smoke:guards`
  - PASS: `smoke:security`
- Remaining honest caveat:
  - the desktop runtime proof used the fresh `1.1.35` build launched from the builder temp output because this machine still had a stale OS lock against copying back into `dist/win-unpacked`
  - that lock does not change the product/runtime fix itself, but it does mean the local packaging copy step on this box still needs cleanup before treating `dist/win-unpacked` as clean build output

## 2026-04-23: SportsMeta coordination truth pass

- Verified the approved product boundary directly against live code and live routes: PVTKRRX is the Stremio-facing addon/install/playback layer, while SportsMeta is the sports identity/artwork/billing service inside the same overall sports stack.
- Verified free/default artwork truth on the live SportsMeta root routes:
  - `GET /asset/default/:variant/:sport` returns `200 image/svg+xml`
  - `GET /asset/:variant/:id` returns `200 image/svg+xml` on the public root surface
- Verified paid/member artwork truth on the live SportsMeta member routes:
  - `GET /member/:token/manifest.json` returns `200` for a live active member token
  - `GET /member/:token/asset/poster/:id` returns `200 image/jpeg`
  - `POST /billing/checkout` returns a live Stripe Checkout session for paid tiers
- Verified PVTKRRX runtime truth on both local desktop and self-host meta routes: the addon emits only public SportsMeta asset URLs (`/asset/...` and `/asset/default/...`) and does not switch artwork by user entitlement. `requireConfigSubscription()` is still a pass-through, so PVTKRRX remains free on the tested path.
- Verified no direct TheSportsDB dependency on the tested live sports path. The current sports path resolves through SportsMeta rather than a local PVTKRRX TheSportsDB client.
- Current caveat from the exact route re-test on 2026-04-23:
  - local desktop and self-host `motorsport` and `mma` sports catalogs returned `50` metas in the current pass
  - football returned `50` metas earlier in same-day logs, but timed out and later produced `metas=0` during the direct re-test window, so football catalog reliability is not cleanly signed off in this pass

## 2026-04-23: Final sports closeout pass

- Replaced the stale Windows desktop listener with the current `1.1.34` build and re-proved the real installed listener on `127.0.0.1:7000` / `127.0.0.1:7001`.
- The working desktop runtime is now the current-user install at `C:\Users\kepne\AppData\Local\Programs\PVTKRRX\`; the stale `C:\Program Files\PVTKRRX` install was removed from the active startup path.
- Verified local installed desktop sports output on the live listener:
  - football catalog emits `50` metas with canonical `sportsmeta:event:` ids for resolved rows and SportsMeta default assets for unresolved rows
  - motorsport catalog emits `50` metas and currently stays fallback/default on the sampled rows
  - MMA catalog emits `50` metas and now includes canonical `sportsmeta:event:` ids for resolved rows alongside SportsMeta default fallback art
- The Contabo self-host runtime at `/opt/pvtkrrx` was still behind the desktop resolver pass. Updated the live runtime files directly (`src/clients/sportsmeta.js`, `src/utils/sportsIdentityResolution.js`, `src/utils/sportsTitleParser.js`), restarted `pvtkrrx.service`, and re-proved `https://pvt.kepners.co.uk/selfhost`.
- Post-restart self-host proof now matches the local contract class:
  - football catalog emits `50` metas, including canonical `sportsmeta:event:football|2026-04-22|spanish-la-liga|barcelona|celta-vigo`
  - motorsport catalog emits `50` metas with SportsMeta default fallback art for unresolved rows
  - MMA catalog emits `50` metas and now includes canonical `sportsmeta:event:mma|2026-04-11|ufc|ufc-327-proch-zka|ulberg`
  - canonical posters/backgrounds/logos come from `https://sportsmeta.pvtkrrx.cc/asset/...`
  - fallback posters/backgrounds/logos come from `https://sportsmeta.pvtkrrx.cc/asset/default/...`
- Resolver quality improved materially on the same 9-sample dirty-title proof set:
  - detached baseline worktree at repo `HEAD`: `1/9` canonical resolutions
  - current resolver pass: `5/9` canonical resolutions
  - remaining weak cases are still mostly motorsport / event-format titles (`PFL Belfast`, `Japanese Grand Prix`, `Supercars Christchurch`, `NASCAR Truck Bristol Qualifying`)
- Added `npm run smoke:sports-resolution` and kept the sports seed smoke green. The final closeout smoke pass on 2026-04-23 ended with:
  - PASS: `smoke:sports-resolution`, `smoke:sports-catalog-seeds`, `smoke:config`, `smoke:selfhost`, `smoke:parity`, `smoke:desktop`, `smoke:stremio-link`, `smoke:security`
- License truth re-confirmed: PVTKRRX is still free on the tested path. `requireConfigSubscription()` remains a pass-through in `src/lib/shared.js`, `/auth/me` no longer returns billing state, and the only remaining "unlock" is the self-host browser password used to reveal disk-backed private server config on a self-hosted `/configure` page.
- Legacy sports cache cleanup on 2026-04-23:
  - local desktop runtime no longer has `sports-image-cache/`, `sportsdb-poster-cache.json`, or `sports-cache-autofill-state.json`
  - live Contabo runtime had one empty legacy directory left at `/opt/pvtkrrx/runtime/sports-image-cache`
  - removed that empty directory after confirming the live codebase no longer reads or writes legacy sports cache paths

## 2026-04-23: Public SEO and share-asset pass deployed

- Added generated public site assets for the hosted guide surface:
  - page-specific social cards in `public/social/`
  - `public/site.webmanifest`
  - explicit `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, and Android icon PNGs
- Homepage, sports, and runbooks now all expose canonical metadata plus page-specific `og:image` / `twitter:image` URLs.
- `runbooks.html` now has full metadata parity with the homepage and sports page instead of being a crawlable page with no social metadata.
- `configure.html` and `health.html` now both carry hard noindex signals in two layers:
  - HTML `<meta name="robots" content="noindex,nofollow,noarchive">`
  - response header `X-Robots-Tag: noindex, nofollow, noarchive`
- `public/sitemap.xml` now carries `lastmod 2026-04-23` for `/`, `/runbooks`, and `/sports`.
- Added `scripts/generate-social-assets.js` plus `npm run assets:site` so the public icons and share images are reproducible instead of one-off blobs.
- Expanded `scripts/smoke-config-flow.js` to verify:
  - homepage/runbooks/sports canonical + social image metadata
  - `/site.webmanifest`
  - `/favicon.ico`
  - `/apple-touch-icon.png`
  - generated social PNG routes at `1200x630`
  - `/health` noindex header + meta behavior
- `npm run smoke:config` passed locally on 2026-04-23 after those checks were added.
- Live deploy proof on 2026-04-23:
  - pushed repo commit `e5e2e9f553ae19debdac3f4fdbe164e63fc4a1eb` (`🤖 fix: add site seo and share assets`) to `main`
  - initial live check showed the public Coolify runtime was still on older image `b696ab0...`
  - queued manual Coolify API redeploy `c307hqn7q8dep83d4lbahr6l` for app UUID `w14jewmw5ubscrxh8zzfhq7d`
  - deployment finished successfully at `2026-04-23T13:06:44Z`
  - live public container is now `w14jewmw5ubscrxh8zzfhq7d-130633962848` on image `w14jewmw5ubscrxh8zzfhq7d:e5e2e9f553ae19debdac3f4fdbe164e63fc4a1eb`
  - direct public checks after the redeploy confirmed:
    - `https://www.pvtkrrx.cc/` serves `https://www.pvtkrrx.cc/social/pvtkrrx-home.png`
    - `https://www.pvtkrrx.cc/runbooks` serves canonical `/runbooks` plus `https://www.pvtkrrx.cc/social/pvtkrrx-runbooks.png`
    - `https://www.pvtkrrx.cc/sports` serves canonical `/sports` plus `https://www.pvtkrrx.cc/social/pvtkrrx-sports.png`
    - `https://www.pvtkrrx.cc/site.webmanifest` returns `200`
    - `https://www.pvtkrrx.cc/apple-touch-icon.png` returns `200 image/png`
    - `https://www.pvtkrrx.cc/health` HTML returns `X-Robots-Tag: noindex, nofollow, noarchive`
    - `https://www.pvtkrrx.cc/version-status.json` reports `currentVersion = 1.1.34`, `latestVersion = 1.1.34`, `updateAvailable = false`

## 2026-04-22: SportsMeta boundary finalised

- SportsMeta is now the single owner of sports metadata and artwork. PVTKRRX no longer ships `src/clients/sportsdb.js`, `src/utils/sportsmetaCatalogue.js`, `src/utils/sportsCacheSeeder.js`, `src/utils/sportsCacheAutofill.js`, `src/utils/sportsImageCache.js`, or `src/utils/sportsThumb.js`; the experimental `src/handlers/sportsmeta.js` and the `PVTKRRX_EXPERIMENTAL_INTERNAL_SPORTSMETA` flag were also removed.
- `src/utils/sportsArtwork.js` was rewritten into a thin resolver that returns `https://sportsmeta.pvtkrrx.cc/asset/{variant}/{canonicalId}` when SportsMeta resolved the event and `https://sportsmeta.pvtkrrx.cc/asset/default/{variant}/{sport}?league=...` when it did not. SportsMeta was extended with a new `/asset/default/:variant/:sport` route that serves a deterministic sport-coloured SVG, and that route is live on Contabo.
- SportsMeta `/resolve` plus the PVTKRRX resolver now enforce an event-only contract for live sports attachment: resolved rows emit canonical `sportsmeta:event:` ids, while unresolved rows stay explicit `pvtkrrx:` fallback rows with SportsMeta-owned default artwork instead of silently disappearing.
- Empty-query sport family browse now seeds Prowlarr with the catalog's own search terms before filtering, so `pvtkrrx-sports-motorsport` and `pvtkrrx-sports-mma` no longer collapse to zero when the default browse batch is dominated by football.
- The configure UI, provision defaults, `normalizeAddonConfig`, `server-installer.js`, and `server-setup.js` no longer accept or store `sportsDbApiKey`, `sportsDbCacheHours`, or `sportsImagePackagePath`. `index.js` no longer starts the 15-minute autofill loop and `/thumb/sports/...` plus `/image/sports/...` now return `HTTP 410 Gone`.
- The live Contabo logs prior to this release showed PVTKRRX hammering `www.thesportsdb.com` with the free key `123` and receiving `HTTP 429` every few minutes on `search_all_teams.php`. Those requests disappear after this change because the scheduled job that produced them has been removed from the codebase.
The current packaged Windows app is now verified as the real host runtime, and a live Apple TV synced home-route pass has been captured against it.

The practical reading of the project today is:

- `PC Local` is the real host-desktop route and is working
- `Hybrid Home` is now the main same-account synced route for the user's other devices; the host desktop should not use it for local browsing
- stale/offline `Hybrid Home` requests can now switch into the account-linked cloud profile instead of clinging to the dead desktop-local backend
- the packaged Windows EXE now centers on `PC Local` plus the `Hybrid Home` route model, although some live desktop/runbook/help strings still say `LAN Bridge`
- explicit self-host server mode now exists for VPS/seedbox installs, with disk-backed `/selfhost` manifests, browser-admin auth for private service URLs, and optional `systemd` boot automation
- the self-host bootstrap now auto-selects a free qBittorrent WebUI port when 8080 is occupied, wires Prowlarr to the live qBittorrent download client during bootstrap, and disables any leftover `pvtkrrx-tunnel.service` once a FreeDNS/domain front door is configured
- completed-file playback on the local runtime is working again after the `/playback` and `/file` path fixes
- official Stremio archive-source support for `rarUrls` is real and was re-verified against upstream SDK/core sources on 2026-03-30
- PVTKRRX now treats extracted direct video as the only supported packed-RAR playback path by default, and keeps native `rarUrls` behind an explicit experimental override
- the PVTKRRX live sports surface now uses SportsMeta for both canonical event art and default fallback art, instead of any local PVTKRRX-owned image proxy or cache layer
- loose motorsport event titles such as `Formula 1 2026 Race 02 Chinese Grand Prix` now survive the hosted sports filter and keep their sport family rows populated on both local and self-host installs
- licensed real imagery remains a SportsMeta-owned concern, and PVTKRRX no longer carries a parallel entitlement or artwork decision surface for sports
- the old implicit local free-key SportsDB path has been removed: PVTKRRX no longer defaults to `123`, no local cache warm/autofill work remains on the live path, and leftover runtime cache files are now stale artifacts rather than supported runtime state
- the current desktop/cloud release line is now `1.1.33`, with matching self-host prerelease `v1.12.18-selfhost`, carrying the SVG-only sports surface plus the tightened SportsMeta entitlement gate
- the current desktop/cloud line carries forward the mapped sports poster package support and permanent hosted image catalogue while adding the hybrid linked-cloud takeover fix for stale/offline home-route fallback
- the Windows desktop runtime still defaults to `%APPDATA%\PVTKRRX\runtime`, outside the EXE install directory, so local Prowlarr/qBittorrent config, poster-package mapping, and sports cache state survive normal app updates and reinstall-over-the-top installs unless that runtime folder is explicitly deleted
- the sports identity path is now materially wider: multi-token leagues (`Premier League`, `La Liga`), `DD.MM.YYYY` dates, year-only titles that can borrow the Prowlarr publish date, and event-prefix noise such as `Super Bowl LX` now normalize into the same shared structured matchup shape
- structured TheSportsDB event lookup now expands league-aware team nicknames such as `Lakers`, `Yankees`, and `Maple Leafs` to the official SportsDB team names before searching, then falls back to date+sport matching when literal event queries still miss
- non-vs event lookup now also tries stripped event-name queries (`Japanese Grand Prix`, `Fight Night 270`, etc.) so `Race`, `Qualifying`, `Practice`, `Sprint`, and `Main Card` suffixes stop blocking artwork recovery
- empty movie, TV, and sports catalogs now return a setup-needed placeholder when Prowlarr has no indexers or cannot be reached, instead of showing blank `EmptyContent`
- the Windows installer/build flow is reproducible again
- `https://www.pvtkrrx.cc` is the live public relay.
- the homepage refactor is now live on the canonical host, including the `truth-band` layout and the `Where does playback happen` section
- the current public route still serves through Contabo Caddy into the Coolify alias `pvtkrrx:3000`; do not treat `/opt/stack/sites/pvtkrrx` or `/opt/pvtkrrx` as the live public path without checking the reverse proxy target first
- `https://www.pvtkrrx.cc/manifest.json` remains a setup/bootstrap manifest only; the real public self-host addon surface for the Contabo `systemd` runtime is `https://pvt.kepners.co.uk/selfhost/manifest.json?mode=hosted`
- the public self-host sports handshake now emits raw canonical `sportsmeta:` ids only when SportsMeta resolution is provable, and suppresses unresolved sports discovery rows instead of leaking weak or contaminated fallback ids into Stremio-facing catalogs
- a real Stremio desktop pass on 2026-04-13 hit the live self-host `manifest -> catalog -> meta -> stream` path for `sportsmeta:event:football|2026-04-11|english-premier-league|arsenal|bournemouth`, so the current proof set now includes one actual client trace rather than curl-only route checks
- legacy strict `LAN Bridge` tokens remain supported for manual troubleshooting and backwards compatibility, but they are no longer the default synced install path
- the remaining work is real-device coverage, remote/auth playback sign-off, and performance tuning, not a reset/rebuild

## Work Carried Out On 2026-04-13

- widened the SportsMeta identity bridge so noisy SportsCult football titles such as `NEWVISION Premier League Arsenal Bournemouth 20260411 HDTV 1080i MP1 H 264 TPTV` now resolve deterministically to the canonical SportsMeta event id instead of falling back to an internal `pvtkrrx:` sports row
- changed the self-host sports catalog contract so resolved discovery rows emit raw canonical `sportsmeta:event:...` ids, while unresolved rows fail closed and are suppressed from addon-facing discovery instead of serving unstable fallback metadata
- added a canonical-id to availability-anchor bridge so a direct Stremio `stream/sports/sportsmeta:...` request can recover the original SportsCult playback anchor and still return the expected `/playback` stream
- updated the live self-host `systemd` runtime on Contabo (`/opt/pvtkrrx`, `pvtkrrx.service`) and re-verified the addon-facing public routes on `https://pvt.kepners.co.uk/selfhost`
- captured one real Stremio desktop trace on 2026-04-13 against that public self-host route: manifest, catalog, meta, and stream were all requested by the client for the same canonical Arsenal vs Bournemouth event
- `npm run smoke:sports` and `npm run smoke:pipeline` both passed on 2026-04-13 after the canonical-id handshake and stream-anchor recovery changes

## Work Carried Out On 2026-04-12

- locked the free PVTKRRX sports catalog/meta path to generated SVG poster/background assets with sport-specific theming, instead of falling through to live image proxy URLs
- tightened the integrated SportsMeta draft so paid imagery only unlocks when a real stored entitlement exists; unlicensed tokens now stay on SVG artwork
- removed the implicit local TheSportsDB free key (`123`) from runtime defaults, installer/config flows, and cache warm/autofill tooling; those flows now skip cleanly unless an explicit key is configured
- `npm run smoke:sports`, `npm run experimental:smoke:sportsmeta`, `npm run smoke:sports-cache`, `npm run smoke:sports-cache-auto`, `npm run smoke:config`, `npm run smoke:selfhost`, `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh`, and `npm run dist:win` all passed on 2026-04-12 for the `1.1.33` release cut

## Code Review 2026-04-06

- Re-ran `npm run smoke:config`, `npm run smoke:playback`, and `npm run smoke:desktop`; all passed in the current workspace during this review.
- Main review finding: route terminology is still mixed in live code. `public/configure.html` and the hosted profile logic treat the home-device route as `Hybrid Home`, but several other shipped surfaces still present the older `LAN Bridge` name.
- Confirmed legacy `LAN Bridge` wording still exists in the current desktop popup, bootstrap-manifest descriptions for desktop installs, runbooks/provider guidance, and stream info helpers. This is terminology drift, not evidence of a second active home-device route.
- Updated the technical docs in this pass to stop overstating the rename as fully complete. No public-site or in-app copy was changed.

## Work Carried Out On 2026-04-04

- Added the new `Hybrid Home` hosted profile with a dedicated manifest id (`com.kepners.pvtkrrx.hybrid`) and route-aware configure/install copy across the shared UI.
- Hosted `Hybrid Home` now prefers LAN redirect at home and falls back to hosted/cloud behavior away from home instead of failing closed like the legacy strict LAN profile.
- `/local/lan-token` can now mint hybrid hosted tokens explicitly, while the Windows/local config path keeps its own host-side pairing defaults intact.
- Legacy hosted LAN tokens without explicit pair booleans still resolve as `LAN Bridge`, so older installs do not get silently reinterpreted as `Remote Seedbox`.
- Sports grouping now keeps one stable team order for deduped matchup posters instead of inheriting the last tracker title ordering, and the sports thumb helper is back in-tree so the richer poster generation path is not orphaned.
- Added a reusable sports cache pre-seed step plus `npm run cache:sports`, and wired both self-host setup flows to warm `sports-image-cache/` with upcoming event, team, and mapped-league artwork using the existing disk cache writer.
- Added a recurring sports-cache autofill worker for long-running Linux/cloud runtimes. It persists a rotation cursor in the runtime directory, processes one sport group every 15 minutes by default, and keeps using the same disk cache writer so repeat passes skip already-warm images.
- Progressive playback now defaults to strict head-first sequential download for every route, including seedbox-backed desktop/local routes. qBit first+last-piece priority now requires an explicit `STREAM_PRIORITIZE_LAST_PIECES=true` opt-in because it can waste startup bandwidth on the end of the file.
- Self-host cloud/server playback can now split origins correctly: `PVTKRRX_PUBLIC_BASE_URL` stays the install/control origin, while optional `PVTKRRX_PLAYBACK_BASE_URL` overrides built-in `/file` and `/playback` URLs so buffering and byte-serving can move onto a dedicated HTTPS origin.
- The self-host installer now sets that up properly instead of treating `PVTKRRX_PLAYBACK_BASE_URL` as a manual afterthought: FreeDNS and domain installs default it to the same public HTTPS origin and still allow an explicit optional direct-playback URL during bootstrap.
- Cut a fresh `1.1.24` Windows desktop build so the local EXE line now includes the sports cache pre-seed work instead of reusing the older `1.1.23` release label.
- Re-verified the split install model: Windows desktop still owns `PC Local` plus `Hybrid Home`, while the cloud/self-host installer continues to own the server-side `Remote Seedbox` route.
- Regression coverage now includes:
  - hybrid hosted token minting and manifest resolution
  - hybrid cloud fallback headers when the home route is offline
  - legacy LAN token compatibility without explicit booleans
  - sports structured matchup/F1 poster token coverage
  - sports cache pre-seed rerun/cache-hit coverage

## Work Carried Out On 2026-04-06

- Fixed the self-host/server `liberror` regression on incomplete matched torrents by keeping playback-capable buffering streams on `/playback` first instead of handing Stremio straight into `/file` too early.
- Opaque playback tokens now carry the chosen file path so multi-file torrents still resolve the correct episode/file when `/playback` later hands off into `/file`.
- Added smoke coverage for the new buffering handoff contract plus target-file playback-token round trips.
- Fixed the sports artwork mapped-league path so both the cache seeder and `sportsdb.js` can resolve known TheSportsDB league ids directly instead of depending on the truncated free-key `search_all_leagues.php?s=...` listing.
- Sports cache autofill no longer reports `0 mapped leagues` for known targets just because the sport-wide league list omitted EPL/UFC/NBA-style entries, and league-art poster fallback can now recover those same mapped leagues during normal meta/catalog requests.
- Cut the public desktop release as `1.1.25` and the matching Windows installer assets.
- Published the next self-host prerelease tag as `v1.12.11-selfhost` so the cloud/server installer line has a current pinned release for this fix set.
- Cut the follow-up public desktop release as `1.1.26` so the Windows installer line now carries the mapped-league artwork fix as well.
- Published the next self-host prerelease tag as `v1.12.12-selfhost` so the pinned cloud/self-host installer line carries the same mapped-league artwork fix.
- Restored a live homepage release-status chip in the hero so the public DOM/source still exposes the current release state after the homepage refactor.
- Updated the repo release rules so `issue a new revision` now explicitly means synchronized desktop EXE plus cloud/self-host release parity.
- Cut the aligned public desktop release as `1.1.27` so the published EXE line matches the current `main` revision again.
- Published the next self-host prerelease tag as `v1.12.13-selfhost` so the cloud/server installer line points at that same aligned revision.

## Work Carried Out On 2026-04-07

- Broadened `parseSportsTitle` so sports grouping, custom ids, stream fallback, and SportsDB artwork lookup all share the same richer parser instead of diverging on multi-token leagues and alternate date layouts.
- Team-vs parsing now accepts `Premier.League` / `La.Liga`, `DD.MM.YYYY`, year-only titles that can reuse the publish date, and event-prefix noise like `Super.Bowl.LX` before the teams.
- Structured SportsDB matching now resolves official league team names before `searchevents` calls and falls back to `eventsday` / `eventstv` when exact query strings still miss.
- Non-vs event searches now try stripped event-name variants first, so Formula 1 / UFC titles do not fail just because SportsDB stores the weekend/event without `Race`, `Qualifying`, `Practice`, `Sprint`, or `Main Card`.
- Regression coverage now includes:
  - multi-token league parsing
  - `DD.MM.YYYY` parsing
  - year-only title parsing with publish-date fallback
  - league-aware nickname expansion for structured lookups
  - structured date+sport fallback after literal title-search misses
  - stripped non-vs event queries for Formula 1 session titles
- `npm run smoke:sports`, `npm run smoke:sportsdb-league`, and `npm run smoke:pipeline` all passed on 2026-04-07 for this change set.

## Work Carried Out On 2026-04-08

- Fixed the cache-only sports artwork cold-start regression: the background seeder now persists seeded event + league artwork metadata only for image URLs that actually made it into the disk cache, and `getEventArtwork()` can reuse that seeded metadata after a cold restart instead of collapsing straight to SVG placeholders.
- Added smoke coverage for that release path: the seed smoke now proves `sportsdb-poster-cache.json` is written, reloads a fresh `SportsDbClient`, and verifies both seeded event artwork and seeded league fallback artwork still resolve from cache after restart.
- Release-prep moved the package version to `1.1.30`, refreshed the desktop update feed, and rebuilt the Windows artifacts for the sports cache metadata fix release.
- `npm run smoke:config`, `npm run smoke:guards`, `npm run smoke:selfhost`, `npm run smoke:desktop`, `npm run smoke:playback`, `npm run smoke:parity`, `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed on 2026-04-08 for the `1.1.30` release cut.
- `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-08 for the `1.1.30` release cut.
- `npm run dist:win` passed on 2026-04-08 for the `1.1.30` desktop release build and refreshed `dist/latest.yml` plus `dist/releases/index.json`.
- Verified `main` and `origin/main` are both at commit `e568ece` (`feat: add mapped sports poster packages`), so the `1.1.29` sports-package release is in GitHub rather than sitting as an unpushed local patch.
- Verified the live public Contabo route is now running that same release build: the current Coolify container is `w14jewmw5ubscrxh8zzfhq7d-093443455325` on image `w14jewmw5ubscrxh8zzfhq7d:e568ece2a012653caea16fdfe9fefa713dc5626b`.
- Verified `https://www.pvtkrrx.cc/version-status.json` now reports `currentVersion = 1.1.29`, `latestVersion = 1.1.29`, and `updateAvailable = false` after the manual Coolify API redeploy for deployment `cphgnqptcvtvif60g0u57n7g`.
- The live `1.1.29` commit carries forward the earlier-verified permanent-catalogue cache behavior: `sportsdb.js` still uses `PERSIST_MAX_ENTRIES = 50000` plus one-year artwork-hit / structured-event / league-asset TTLs, and `sportsImageCache.js` still carries the no-prune / no-expiry contract.
- Verified the hosted runtime root is now externalized directly on Contabo: Coolify bind-mounts `/opt/pvtkrrx/runtime` into `/root/.local/share/PVTKRRX/runtime`, so `sportsdb-poster-cache.json`, `accounts-store.json`, `lan-pair-store.json`, `stremio-link-store.json`, `local-config.json`, `server-admin-token`, `sports-cache-autofill-state.json`, and future runtime files now survive rebuilds and container replacement.
- Verified `https://www.pvtkrrx.cc/health` returned `200` after the rollout, so the hosted relay is healthy on the new commit.
- Re-confirmed deploy drift on the non-live mirror path: `/opt/stack/sites/pvtkrrx` is still at `cabe9a5`, so that checkout must not be treated as proof of what the public host is serving.
- Practical outcome: the `1.1.29` sports-package release is now fully synchronized across GitHub desktop release, GitHub self-host release, and the live hosted/cloud runtime, and the hosted runtime root is now durable enough to remember posters plus runtime config/state across updates.
- Release-prep pass on 2026-04-08 moved the package version to `1.1.29`, kept the public canonical/OG/sitemap metadata aligned to `https://www.pvtkrrx.cc`, and added mapped sports poster package support so local/server runtimes can treat a downloaded package as the primary sports-art catalogue.
- `npm run smoke:config`, `npm run smoke:guards`, `npm run smoke:selfhost`, `npm run smoke:desktop`, `npm run smoke:playback`, `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed on 2026-04-08 for the `1.1.29` sports-package release cut.
- `C:/Program Files/Git/bin/bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-08 for the `1.1.29` sports-package release cut.
- `npm run dist:win` passed on 2026-04-08 for the `1.1.29` desktop release build and refreshed `dist/latest.yml` plus `dist/releases/index.json`.
- Historical note: `sportsImagePackagePath` existed in the 2026-04-08 release path, but that config surface is now removed because SportsMeta owns live sports artwork and default fallback posters.
- Added package-aware sports image resolution: if a configured package manifest maps a known `sourceUrl` to a local file, PVTKRRX now imports that file into the runtime cache before any upstream image fetch.
- Added `npm run cache:sports-package` so a mapped poster package can be synced into the runtime cache in one pass instead of waiting for lazy first-hit imports.
- Tightened the image serve path so `/image/sports/...` now stays cache-only on request: it can satisfy a miss by importing from the mapped package, but it no longer repopulates the catalogue from live upstream image fetches during normal request handling.
- Verified the live hosted rollout after the release cut: manual Coolify API redeploy `cphgnqptcvtvif60g0u57n7g` finished successfully on 2026-04-08 and moved the public relay to commit `e568ece` / version `1.1.29`.
- Externalized the live hosted runtime root on 2026-04-08 by mounting `/opt/pvtkrrx/runtime` into `/root/.local/share/PVTKRRX/runtime`; the legacy `/opt/pvtkrrx/sports-image-cache` path now resolves back into that runtime tree so the image catalogue is remembered instead of remapped on each update.
- Re-verified deployment health after the earlier transient build-export failure on deployment `328`: later GitHub webhook deployment `330` for commit `477595b` finished successfully, and the follow-up manual redeploy `tags0jmb4ozrq92iyykogq74` applied the runtime-root mount without rebuilding the image.
- `npm run smoke:sports`, `npm run smoke:config`, and `npm run smoke:parity` passed again on 2026-04-08 after the cache-only/package-aware image-path alignment, keeping the mapped-package import flow plus stable runtime-path behavior covered.

- New regression coverage on 2026-04-08:
  - `npm run smoke:config`
  - `npm run smoke:sports`
  - `npm run smoke:sports-cache`
  - `npm run smoke:sports-cache-auto`
  - manual `npm run cache:sports-package -- <temp-package-path>` operator proof

## Work Carried Out On 2026-04-09

- Traced the current `The addon returned empty content` desktop symptom to legacy disk-backed Windows host configs that still persisted `routeProfile = lan` with `lanPairRequired = true`, which makes the home-device route fail closed and return empty catalogs whenever the host pair is offline.
- Added a desktop-local config migration so disk-backed host configs now auto-upgrade that old strict `LAN Bridge` state to the current hybrid fallback profile on load/save, while explicit hosted legacy LAN tokens still keep their old fail-closed behavior for troubleshooting.
- Tightened config-issue gating so `/local/manifest.json?mode=local` does not inherit the hosted file-server warning just because the same disk-backed host config also carries a hybrid home-device profile.
- Separated LAN-pair record TTL from live redirect trust: hybrid/home-device routing now stops treating a host as online once its heartbeat goes stale relative to the configured desktop cadence, instead of clinging to a several-hour relay record after the PC or local server goes offline.
- `/pair/status` now reports `stale-heartbeat` for that condition as well, so configure/status surfaces can match the real redirect decision instead of claiming the dead host is still online.
- Hybrid hosted fallback now also checks for an account-linked hosted cloud profile and swaps that in when present, so the fallback backend comes from the saved cloud/seedbox config instead of the desktop token's own `127.0.0.1` service URLs.
- Hybrid `/encrypt` no longer overwrites that linked cloud takeover profile just because the desktop token happens to carry one non-local URL alongside local qBit/Prowlarr values.
- Bumped the Windows desktop EXE line to `1.1.31`, rebuilt the packaged artifacts with `npm run dist:win`, and refreshed the local desktop update metadata in `dist/latest.yml` plus `dist/releases/index.json`.
- Scope note: this was an EXE/version refresh only, not a claim that the hosted cloud and self-host GitHub release lines were also republished to `1.1.31`.
- Bumped the hosted cloud and Windows desktop EXE line together to `1.1.32`, refreshed the package metadata, and rebuilt the Windows artifacts so the live cloud runtime and local installer line now point at the same linked-takeover revision.
- Scope note: this `1.1.32` pass aligns the hosted cloud runtime plus the EXE artifacts, not the wider GitHub desktop/self-host release publish flow.
- Regression coverage now proves:
  - auto-provision returns a hybrid desktop home route
  - local config save/readback defaults to hybrid fallback
  - linked desktop configs keep the hybrid profile
  - legacy disk-backed desktop LAN configs auto-migrate and persist back to disk
  - stale hybrid LAN-pair records now fall through to hosted/cloud instead of redirecting to a dead LAN host
  - `npm run smoke:config`, `npm run smoke:lan-pair`, and `npm run smoke:selfhost` all passed on 2026-04-09
  - `npm run dist:win` passed on 2026-04-09 for the `1.1.31` desktop EXE refresh
  - `npm run smoke:config`, `npm run smoke:lan-pair`, `npm run smoke:selfhost`, and `npm run dist:win` all passed again on 2026-04-09 for the aligned `1.1.32` desktop/cloud revision

## Earlier 2026-04-04 Self-Host Work

- The Linux self-host installer now auto-picks a free qBittorrent WebUI port if 8080 is already occupied and writes that real port back into the qBit config before startup.
- The shared server installer now prefers the detected or exported qBittorrent port instead of hardcoding 8080 when saving self-host config.
- Empty sports/movie/TV catalogs now short-circuit to a setup-needed placeholder when Prowlarr has no indexers or is unreachable.
- Smoke coverage now includes the qBit port fallback helper and the empty-provider catalog placeholder.
- The next self-host release was published as `v1.12.10-selfhost`, keeps the working public PVTKRRX root/configure/bootstrap/manifest URLs explicit at install time using raw stdout, and now auto-wires Prowlarr to qBittorrent during bootstrap even on dirty installs while testing connectivity with a unique temporary download-client name to avoid Prowlarr duplicate-name validation.

## Work Carried Out On 2026-04-02

- LAN Bridge offline meta no longer injects the host-offline sentence into every detail page. Meta requests now fall through to hosted metadata when the pair is offline, while catalogs and streams still fail closed.
- `npm run smoke:lan-pair` passed on 2026-04-02 after the silent-offline-meta change.

## Work Carried Out On 2026-04-01

- `9b46cbb` narrowed self-host `/configure` to the `Remote Seedbox` route and hides `PC Local` / `LAN Bridge` there, matching the current runtime split.
- `da8c22f` added one-time Stremio server link sessions so a local signed-in browser device can link a hosted or self-hosted remote config without copying raw Stremio credentials onto the server.
- `npm run dist:win` passed on 2026-04-01 for the `1.1.22` desktop build, so the packaged app now includes the new cross-machine Stremio link flow.

## Work Carried Out On 2026-03-31

- `169a2e4` documented the live public-host truth table and website audit state across the main docs set.
- `e50a6b0` rewrote the homepage around clearer product positioning, route comparison, requirements, and sports proofing.
- `9c18996` and `9b93f03` added explicit self-hosted server setup: localhost/private service validation for self-host installs, browser password flow, disk-backed `/selfhost` manifests, server setup scripts, and optional `systemd` install support.
- `d174bd2` added provider-specific runbook presets to the runbooks/configure surface.
- `428b15b` changed stream source labels so users can see whether playback is coming from the host PC or the remote/server route.
- `2d3175a` added the sports artwork byte cache/proxy layer so posters, wallpapers, landscape art, and logos can be served from the active local/hosted runtime after the first fetch instead of being hotlinked every time.
- 2026-03-31 Apple TV strict-client fix: meta responses no longer emit `meta: null`; unsupported meta paths now return a real placeholder `MetaItem` so tvOS clients do not fail deserialization on missing metadata.
- 2026-03-31 server-agnostic Stremio account link sessions: hosted-token and disk-backed `local` / `selfhost` configs can now create a short-lived browser/addon pairing session, observe addon install hits, and finish account linking from any signed-in browser device without the server scraping a Stremio password.
- 2026-03-31 desktop-local split: the Electron runtime and shared configure surface now advertise `desktopLocalOnly`, hide `Remote Seedbox` inside the Windows EXE, and keep the desktop app focused on `PC Local` plus `LAN Bridge`.

## Verified Working Now

These items are verified in the current workspace or by direct client/log proof:

- `npm run smoke:config` passed on 2026-03-29
- `npm run smoke:selfhost` passed on 2026-03-31 and now covers explicit self-host server mode, disk-backed `/selfhost` config, and self-host password gates
- `npm run smoke:selfhost` passed again on 2026-03-31 after adding browser-driven Stremio link-session persistence into the disk-backed self-host config
- `npm run smoke:provider-discovery` passed on 2026-04-02 after broadening the shared provider discovery helpers for existing Prowlarr/qBittorrent installs
- `npm run smoke:config` passed on 2026-04-06 after the `1.1.25` public release cut, keeping `/version-status.json`, `/install-selfhost.sh`, and the hosted/local manifest flows green
- `npm run smoke:desktop` passed on 2026-04-06 after the `1.1.25` public release cut
- `npm run smoke:playback` passed on 2026-04-06 after the `/playback` buffering-handoff fix and now covers target-file playback tokens for multi-file torrents
- `npm run smoke:selfhost` passed on 2026-04-06 after the `1.1.25` public release cut, keeping disk-backed self-host config plus password gating green
- `npm run smoke:pipeline` passed on 2026-04-06 after the buffering-stream handoff fix, keeping self-host/local buffering rows on the safer `/playback` route
- `npm run smoke:guards` passed on 2026-04-06 after the `1.1.25` public release cut
- `npm run smoke:lan-pair` passed on 2026-04-06 after the playback-token update, keeping opaque LAN/home-route token flow green
- `npm run smoke:sportsdb-league` passed on 2026-04-06, proving mapped league fallback can still recover EPL/UFC artwork when the upstream sport-wide league list is irrelevant or truncated
- `npm run smoke:sports-cache` passed on 2026-04-06 after switching the pre-seed flow to direct mapped-league ids for known leagues
- `npm run smoke:sports-cache-auto` passed on 2026-04-06 after the same mapped-league lookup fix, keeping cursor rotation and cache reuse green
- `npm run smoke:sports` passed on 2026-04-06 after the mapped-league lookup fix, with the expected bad-id placeholder error still isolated to the existing negative-path assertion at the end of the smoke output
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-06 from the Windows workspace for the public release cut
- `npm run smoke:config` passed again on 2026-04-06 for the `1.1.26` / `v1.12.12-selfhost` installer refresh, keeping `/version-status.json`, `/install-selfhost.sh`, and the hosted/local manifest flows green
- `npm run smoke:selfhost` passed again on 2026-04-06 for the installer refresh, keeping the explicit self-host server path green before the new pinned self-host prerelease
- `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed again on 2026-04-06 before the `1.1.26` / `v1.12.12-selfhost` installer refresh
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed again on 2026-04-06 before the `v1.12.12-selfhost` prerelease cut
- `npm run smoke:config` passed again on 2026-04-06 after the homepage release-card restore and final `1.1.27` rebuild
- `npm run smoke:selfhost` passed again on 2026-04-06 after updating the self-host smoke assertions to the current configure copy contract
- `npm run smoke:desktop` passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `npm run smoke:playback` passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `npm run smoke:sports`, `npm run smoke:sports-cache`, and `npm run smoke:sports-cache-auto` all passed again on 2026-04-06 for the aligned `1.1.27` release cut
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed again on 2026-04-06 before the `v1.12.13-selfhost` prerelease cut
- `npm run smoke:sports-cache` passed on 2026-04-04 for the new sports cache pre-seed flow, including disk-cache reuse on rerun
- `npm run smoke:sports-cache-auto` now covers the rotating background sports-cache autofill flow: first sport, cursor advance, second sport, cursor wrap, and disk-cache reuse on the wrapped pass
- `npm run smoke:playback` now also covers the split self-host playback-origin path so `/playback` redirects can leave the control/tunnel origin and land on a dedicated direct byte-serving origin
- `npm run smoke:sports` passed on 2026-04-04 after the `1.1.24` release cut, with the expected bad-id placeholder error still isolated to the existing negative-path assertion at the end of the smoke output
- `npm run smoke:config` passed on 2026-04-04 after the `1.1.24` release cut, keeping `/install-selfhost.sh` and the hosted/local manifest flows green
- `npm run smoke:selfhost` passed on 2026-04-04 after the `1.1.24` release cut, keeping disk-backed self-host config plus password gating green
- `npm run smoke:desktop` passed on 2026-04-04 after the `1.1.24` release cut
- `npm run smoke:lan-pair` passed on 2026-04-04 after the `1.1.24` release cut, including the hosted `com.kepners.pvtkrrx.hybrid` manifest path
- `C:\Program Files\Git\bin\bash.exe -n scripts/install-selfhost.sh` passed on 2026-04-04 from the Windows workspace, confirming the cloud/self-host launcher parses cleanly even though `C:\Windows\System32\bash.exe` is only a WSL launcher stub here
- `npm run smoke:config` passed on 2026-04-02 after the release-status endpoint and homepage release card were added
- `npm run smoke:desktop` passed on 2026-04-02 after the desktop popup gained its release-status panel and preload bridge
- `npm run smoke:sports` passed on 2026-03-31 after the sports artwork byte-cache update, including proxy URL coverage and cache-hit reuse checks
- `npm run smoke:sports` passed again on 2026-03-31 after the Apple TV-safe meta placeholder change
- `npm run smoke:desktop` passed on 2026-03-29 and now guards the desktop auto-provision persistence path against writing redacted config readbacks back to disk
- `npm run smoke:playback` passed on 2026-03-29 and now covers redirect plus byte-serving on the shared `/file` route
- `npm run smoke:pipeline` passed on 2026-03-29
- `npm run smoke:sports` passed on 2026-03-29
- `npm run dist:win` passed on 2026-03-29, again on 2026-03-30 for the `1.1.16` desktop release build, again on 2026-03-30 for the `1.1.17` bug-fix desktop release build, again on 2026-03-30 for the `1.1.18` archive-extraction desktop release build, again on 2026-03-30 for the `1.1.19` desktop power-policy build, again on 2026-03-31 for the `1.1.20` sports-image-cache build, again on 2026-03-31 for the `1.1.21` Apple TV metadata-serialization fix build, again on 2026-04-01 for the `1.1.22` Stremio link-session desktop release build, again on 2026-04-02 for the `1.1.23` release-status build, and again on 2026-04-04 for the `1.1.24` sports-cache desktop build
- `npm run smoke:lan-pair` passed again on 2026-04-02 after the silent LAN offline meta pass-through change
- `npm run smoke:config`, `npm run smoke:desktop`, `npm run smoke:stremio-link`, `npm run smoke:lan-pair`, `npm run smoke:guards`, `npm run smoke:security`, `npm run smoke:pipeline`, `npm run smoke:playback`, and `npm run smoke:sports` all passed again on 2026-03-30
- root `/manifest.json` returns the bootstrap manifest (`com.kepners.pvtkrrx.bootstrap`) with no catalogs/resources and `configurationRequired=true`
- 2026-03-31 public host check: `https://www.pvtkrrx.cc/`, `/configure`, `/runbooks`, `/manifest.json`, and `/health` all returned `200` from the live public host; `/local/install` returned `403` as expected for a local-only helper route
- 2026-03-31 public host check confirmed `https://www.pvtkrrx.cc/` as the canonical live public host.
- 2026-04-06 homepage verification against `https://www.pvtkrrx.cc/` confirmed the refactor is now live: `truth-band` and `Where does playback happen` are present, while legacy `meta-grid` and `hero-chip` markers are absent
- 2026-04-06 Contabo runtime verification showed the public route still enters through Caddy and targets the Coolify alias `pvtkrrx:3000`; the separate `pvtkrrx.service` host runtime at `/opt/pvtkrrx` on `:7000` is not the public route unless Caddy is repointed
- 2026-04-07 public-site cleanup: the public website stopped advertising `/configure` as a public entry point, `GET /configure` now redirects remote/public requests back to the guide-only site, and runbooks/homepage copy now point users to the Windows host runtime or their own self-host server for real setup. 2026-05-09 manifest rewrite: the public bootstrap manifest now identifies remote root installs as `PVTKRR Setup`, the Stremio-visible addon name is `PVTKRR`, and the root manifest is described as a configure-first entry that leads to generated PC Local, LAN Bridge, or Remote Seedbox route manifests.
- explicit self-host server mode now exposes `/app-config.json`, disk-backed `/selfhost/config.json` + `/selfhost/manifest.json?mode=hosted`, and `POST /server-config` for persisted VPS/seedbox installs
- the self-host installer path has now been rebuilt around a dedicated Linux bootstrap script plus a new `npm run server:setup` installer flow that writes a stable `PVTKRRX_RUNTIME_DIR`, generates `AUTH_TOKEN_SECRET`, supports `PVTKRRX_PUBLIC_BASE_URL`, auto-discovers existing Prowlarr/qBittorrent configs when present, automatically hands off to the full bootstrap when those providers are missing, now exposes a hosted launcher at `https://www.pvtkrrx.cc/install-selfhost.sh`, pulls the app source from the branch payload by default with optional tag/manifest pinning and an automatic retry from `main` if a pinned release is too old for `scripts/server-installer.js`, saves the runtime config locally, creates the self-host password file, can install a Linux `systemd` service for auto-start on boot, and now prints the working public PVTKRRX root/configure/bootstrap/manifest URLs explicitly in the installer summary using raw stdout so they are not redacted; the current published self-host release is `v1.12.18-selfhost`
- `npm run smoke:stremio-link` passed on 2026-03-31 after the new link-session flow was added for hosted token configs: server-created session, install-seen manifest hit, browser AuthKey completion, and final linked install URL/token refresh
- configure page now exposes a one-time `Server Link Session` flow so a local signed-in Stremio browser/device can link a remote/cloud server config without the server recovering raw login credentials
- `PC Local` resolves as a real addon from `http://127.0.0.1:7000/local/manifest.json?mode=local`
- same-host `LAN Bridge` `Failed to fetch` was traced to route choice on 2026-03-28, not to server failure
- completed-file playback error `isCompletedTorrent is not defined` was fixed in the local playback path
- the desktop splash now appears on every cold boot and stays frontmost until the main shell is ready
- the desktop wrapper now starts a Windows power blocker by default and logs lock/unlock/suspend/resume so the host is less likely to disappear when Windows is locked or the display turns off
- the desktop shell can now toggle Windows sign-in startup on/off from inside the app, and startup launches stay hidden in the tray so the local runtime can auto-launch after login without popping the main window
- the Windows startup toggle now writes a quoted `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` command and repairs the legacy malformed unquoted startup entry on the next desktop launch, fixing the installed EXE failing to auto-open from `C:\Program Files\...` paths
- host-side `LAN Bridge` status now checks the hosted relay directly, and the desktop can repair a stale local pair identity after an `invalid pair key` rejection
- host-side Stremio Desktop session scanning now detects the real WebView2 `profile/auth/key` storage format again, and startup auto-provision can link that signed-in session automatically
- sports catalog tiles now prefer portrait poster art when TheSportsDB provides it, while backgrounds stay sport/league-aware for better Stremio wallpaper coverage
- completed matched packed scene releases now stay hidden by default until PVTKRRX can surface an extracted direct-play file, while incomplete archive sets stay hidden until every volume is ready
- packed-only tracker torrents are now inspected dynamically before stream emission, so neutral-title `.torrent` links no longer fall through to fake live `/playback` streams
- sports event title parsing now handles non-vs formats (F1, UFC, MotoGP, Supercars, NASCAR, etc.) with structured league/date/event extraction
- sports catalog grouping correctly deduplicates quality variants of the same non-vs event into one tile
- sports detail pages now carry richer metadata: multi-line descriptions, sport type labels, league/date/event info
- Supercars, V8, NASCAR, WSBK, WEC, Formula E, Darts, and expanded Golf coverage added to sport detection
- local `/playback` now fails fast for incomplete multi-volume RAR releases after queueing the torrent, instead of timing out behind a false progressive-playback promise
- completed packed RAR releases now start background extraction into a managed `.pvtkrrx-extracted/<hash>` folder when the local host can reach the archive volumes, and direct extracted playback is the supported path once ready
- local `/file` now waits for the specific requested qBittorrent piece window during seek/skip range probes, so already-downloaded later ranges return `206` instead of dropping out after the initial buffer
- local qBittorrent control can now manage a PVTKRRX-owned completion hook for packed-release extraction without silently overwriting a different existing qBit post-process program
- stream labels now use emoji state badges (`⬇️` download-and-play, `⏳` buffering, `✅` downloaded, `📦` extracted) and a film-icon container badge (`🎬MKV`, `🎬MP4`, etc.)
- the desktop shell now has explicit `Minimize`, `Send To Tray`, and `Exit App` controls, hides to tray on close, and uses a larger no-scroll default layout
- the configure page now shows the live qBittorrent save path, incomplete path, fallback storage roots, and extraction-hook state when opened on the Windows host runtime
- official Stremio sources were re-checked on 2026-03-30: `rarUrls` is a real archive source, tuple-style `ArchiveUrl` is the correct payload shape, and archive sources are routed through the local streaming server at `rar/create`
- the repo-local `behaviorHints.sourceContainer = 'rar'` hint is not part of the official Stremio archive contract and should not be treated as proof that clients honor the stream
- `npm run smoke:pipeline` and `npm run smoke:playback` both passed again on 2026-03-30 during the documentation audit; these prove the supported direct-play packed-release behavior and keep the experimental native archive payload path covered
- current configure flow exposes route-aware primary install links while keeping manual addon URLs as fallback, and the current `public/configure.html` flow passed the 2026-03-30 config/desktop/link smoke pass
- the Stremio WebView2 client cache on this machine contains cached PVTKRRX stream responses with `PVTKRRX` in the stream `name`, confirming branded source labels are reaching the real client
- `1.1.19` installers were built successfully into `dist/`
- `1.1.20` installers were built successfully into `dist/` on 2026-03-31 for the sports image-cache update
- `1.1.21` installers were built successfully into `dist/` on 2026-03-31 for the Apple TV metadata-serialization fix
- `1.1.22` installers were built successfully into `dist/` on 2026-04-01 for the one-time Stremio server link-session update and self-host configure route cleanup
- `1.1.23` installers were built successfully into `dist/` on 2026-04-02 for the GitHub release-status update
- `1.1.24` installers were built successfully into `dist/` on 2026-04-04 for the sports cache pre-seed desktop release refresh
- `1.1.25` installers were built successfully into `dist/` on 2026-04-06 for the public playback-handoff release
- `1.1.26` installers were built successfully into `dist/` on 2026-04-06 for the mapped-league artwork installer refresh
- `1.1.27` installers were built successfully into `dist/` on 2026-04-06 for the synchronized release-alignment cut and homepage release-card restore
- `1.1.28` installers were built successfully into `dist/` on 2026-04-08 for the canonical-host cleanup and synchronized release refresh
- `1.1.29` installers were built successfully into `dist/` on 2026-04-08 for the mapped sports poster package release
- `1.1.30` installers were built successfully into `dist/` on 2026-04-08 for the sports cache metadata persistence release
- `1.1.23` GitHub release was published on 2026-04-02 with the matching `latest.yml`, portable EXE, and setup installer assets
- `1.1.25` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.11-selfhost` GitHub prerelease was published on 2026-04-06 for the self-host/server playback-handoff fix and current cloud installer line
- `1.1.26` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.12-selfhost` GitHub prerelease was published on 2026-04-06 for the mapped-league artwork fix and current cloud installer line
- `1.1.27` GitHub release was published on 2026-04-06 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.13-selfhost` GitHub prerelease was published on 2026-04-06 for the synchronized release-alignment cut and current cloud installer line
- `1.1.28` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.14-selfhost` GitHub prerelease was published on 2026-04-08 for the synchronized release refresh and current cloud installer line
- `1.1.29` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.15-selfhost` GitHub prerelease was published on 2026-04-08 for the mapped sports poster package release and current cloud installer line
- `1.1.30` GitHub release was published on 2026-04-08 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.16-selfhost` GitHub prerelease was published on 2026-04-08 for the cache-only sports artwork metadata persistence release and current cloud installer line
- `1.1.32` GitHub release was published on 2026-04-09 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.17-selfhost` GitHub prerelease was published on 2026-04-09 for the linked cloud takeover alignment and current cloud installer line
- `1.1.33` GitHub release was published on 2026-04-12 with the matching `latest.yml`, portable EXE, and setup installer assets
- `v1.12.18-selfhost` GitHub prerelease was published on 2026-04-12 for the SVG-only sports free surface and SportsMeta entitlement-gated artwork line
- `npm run dist:win` passed again on 2026-04-06 for the `1.1.25` desktop public release build
- `npm run dist:win` passed again on 2026-04-06 for the `1.1.26` desktop installer refresh
- `npm run dist:win` passed again on 2026-04-06 for the aligned `1.1.27` desktop release build
- the packaged Windows desktop app is working on the current host build, including the route-first setup flow and desktop shell controls shown in the live app UI
- a real Apple TV LAN Bridge playback pass succeeded on 2026-03-31 after desktop/web install; while the Windows host stayed locked, playback started normally, the client reported the video as local, and forward/back seek worked

## What We Fixed On 2026-03-28 And 2026-03-29

1. Host-desktop `LAN Bridge` browsing:
   - Root cause: the host Windows PC was using the hosted `LAN Bridge` route instead of `PC Local`.
   - Fix: keep `LAN Bridge` for the other home devices and use `PC Local` on the host desktop.
2. Playback error on a fully downloaded file:
   - Root cause: first `/playback` crashed with `isCompletedTorrent is not defined`, and after that was fixed the redirected `/file` route still crashed because `fs` was not imported in `index.js`.
   - Fix: restored the completion-state helper, re-imported `fs` for the built-in file server, and re-covered the route with a smoke test that follows playback redirect all the way into served bytes.
3. Windows installer build failure:
   - Root cause: `electron-builder`/`rcedit` was failing when writing EXE metadata directly inside the OneDrive-backed repo output folder.
   - Fix: build in temp first, then copy/archive back into `dist/`.
4. Startup shell behavior:
   - Root cause: the splash could disappear too quickly and was not forced to the front.
   - Fix: splash is now frontmost, minimum-duration, and replaced only after the local runtime is reachable.
5. Sports posters:
   - Root cause: sports tiles were biased toward portrait/fallback art even when landscape event art existed.
   - Fix: sports artwork now tracks portrait, landscape, and background separately, and tiles prefer landscape.
6. LAN Bridge pair drift after desktop auto-provision:
   - Root cause: desktop boot could rewrite the saved local config with a sanitized `/auto-provision` readback payload, which dropped `lanPairKey` / `lanPairOwnerId`. A later local auto-setup then regenerated a new key for the same pair id and the hosted relay rejected it as `invalid pair key`.
   - Fix: desktop boot no longer persists sanitized provision readbacks, host-side pair status now asks the relay directly, and the desktop can repair the local LAN identity if the relay rejects a stale pair.
7. Host-side Stremio account reuse stopped auto-detecting the signed-in desktop session:
   - Root cause: the local auth scanner only matched clean JSON-style `auth.key` blobs and missed the noisy Chromium/WebView2 LevelDB encoding actually used by Stremio Desktop on this machine.
   - Fix: the scanner now accepts the real `profile/auth/key` blob layout, and startup `/auto-provision` reuses that signed-in host session automatically instead of waiting for a manual check button.
8. Packed sports/movie scene releases were added to qBittorrent as `.r00/.r01/...` archives and could not play:
   - Root cause: the addon only emitted direct video/file URLs and intentionally rejected `Sample + RAR` torrents as non-playable, even though Stremio supports archive playback through `rarUrls`.
   - Fix: once a packed torrent already exists in qBittorrent, local playback-capable routes now emit a Stremio `rarUrls` stream over the built-in `/file` route so Stremio can read the archive set without manual extraction. First-click tracker queueing is still a separate step.
9. Packed archive streams were still surfacing too early and classic volume ordering was wrong:
   - Root cause: the addon emitted `rarUrls` before every archive volume was fully ready, and classic multi-part sets were sorted lexically (`.r00`, `.r01`, `.rar`) instead of archive order (`.rar`, `.r00`, `.r01`).
   - Fix: incomplete packed releases are now hidden behind a clear notice until every archive volume is ready, classic volume ordering is corrected, and stale `/playback` links now stay in a waiting state instead of pretending the packed release is ready.
10. Packed archive payload shape did not match the modern Stremio core contract:
   - Root cause: the addon emitted archive entries as object-shaped `rarUrls` items and scalar `fileMustInclude`, while current `stremio-core` examples and stream conversion logic expect tuple-style archive URLs and array-based include patterns.
   - Fix: packed archive streams now serialize `rarUrls` in Stremio-core-compatible tuple form and emit `fileMustInclude` as an array of string patterns.
11. Partial packed RAR playback was still being falsely advertised on neutral-title tracker sources:
   - Root cause: unmatched `.torrent` links were being emitted as generic `/playback` streams before the addon had inspected the torrent payload, and archive-only torrents were not being prioritized as a bundle when qBittorrent primed the download.
   - Fix: tracker links are now inspected dynamically before stream emission, neutral packed-only torrents are suppressed behind a truthful packed-release notice, archive-only priming now prioritizes the full RAR bundle instead of a sample clip, and `/playback` now returns an immediate packed-archive explanation instead of stalling.
12. Completed packed releases still failed on tablet/mobile clients even when native `rarUrls` was the intended desktop/service-backed fallback:
   - Root cause: the addon relied entirely on client-side native RAR support, but real Stremio client support is uneven outside desktop/service-backed routes and the tablet path still needed a normal direct-play video file.
   - Fix: the local/host runtime now bundles `7zip-bin`, starts background extraction for completed packed releases when the archive volumes are locally reachable, and prefers the extracted direct video stream once available while keeping native `rarUrls` as the desktop-capable fallback.
13. The local host could disappear when Windows was locked or the display turned off:
   - Root cause: the Electron desktop wrapper did not request any suspend blocker and did not react to Windows lock/resume state changes, so LAN hosting depended entirely on the user's power plan staying awake.
   - Fix: `1.1.19` now starts Electron `powerSaveBlocker` in `prevent-app-suspension` mode by default, disables renderer background throttling for the desktop shell, and logs/re-heartbeats on `lock-screen`, `unlock-screen`, `suspend`, and `resume`.
14. Native packed-RAR fallback still lacked one real PVTKRRX client pass:
   - Root cause: the repo had a spec-aligned `rarUrls` payload path, but neither the local runtime logs nor the Stremio-side data on this machine contained a captured end-to-end native archive success, so the addon was still advertising an unproven playback mode.
   - Fix: completed packed releases now stay hidden by default until archive extraction can surface a normal direct-play video file; native `rarUrls` emission remains available only behind `PVTKRRX_EXPERIMENTAL_RAR_STREAMS=true` for manual testing.
15. Local skip/seek probes could still time out a few seconds into buffering playback:
   - Root cause: `/file` knew how many head bytes were readable, but it did not map later seek probes to qBittorrent piece availability, so Stremio footer/range requests outside that initial head window still failed too early.
   - Fix: `/file` now queries qBit torrent properties + piece states, maps file offsets to torrent pieces, and waits for the requested piece window before answering late-range probes.
16. qBittorrent extraction ownership was unclear and settings could not manage it cleanly:
   - Root cause: PVTKRRX already owned archive extraction, but the UI did not expose whether qBit should trigger that flow on completion and there was no managed completion-hook path.
   - Fix: the local runtime now exposes qBit preference/readback routes for extraction state, can install a PVTKRRX-managed qBit completion hook, and refuses to overwrite a different external qBit completion program silently.
17. The desktop shell still behaved like a single close-only window and clipped the current content:
   - Root cause: the Electron shell had no tray lifecycle, no minimize/hide actions, and the fixed `920 x 660` layout plus popup overflow styling produced the persistent scrollbar.
   - Fix: the desktop window now ships larger, removes the normal scrollbar, exposes `Minimize`, `Send To Tray`, and `Exit App`, and restores cleanly from a real tray menu/click path.

## Still Needs Real-Client Proof

These items should still be treated as open until captured on real clients:

- one extra non-tvOS `LAN Bridge` browse/play pass on Android TV or Android mobile using the latest `1.1.30` desktop build for cross-client parity
- one real public `Remote Seedbox` ready-file playback success on a remote client
- one auth-protected external file-server playback success on a real Stremio client
- long-session playback/performance tuning after qBittorrent download-speed adjustments

## Current Risks

- `Hybrid Home` now depends on the Windows host desktop only for the LAN-first path; away/offline takeover still requires a linked cloud profile with reachable non-local backends
- Bonjour may still be missing or stopped on some hosts; that affects discovery/fallback polish, not the core loopback path
- remote/auth-protected playback behavior still depends on what the target Stremio client honors during redirect/auth handoff
- the addon still emits `behaviorHints.sourceContainer = 'rar'` on the experimental native archive path, but official Stremio docs/core do not define that field for archive support
- if a future Stremio client regresses local archive support, the supported fallback already remains: suppress partial multi-volume archives and only advertise extracted direct-play files
- the homepage refactor is live, but it still needs a real mobile/desktop device pass to rule out layout regressions after deploy
- route naming is still inconsistent across live surfaces; until copy work is intentionally in scope, users may continue to see both `Hybrid Home` and `LAN Bridge` referring to the same home-device path

## 2026-03-30 Plan Closure

1. ~~Rework packed RAR playback after the real-device `liberror` result.~~ **Closed 2026-03-30 by capability downgrade.**
   - `npm run smoke:pipeline` and `npm run smoke:playback` passed again on 2026-03-30.
   - The later `/file` `torrent not found` log was traced to `watch-cleanup` deleting the torrent and data after playback, not to an active playback bug.
   - A 2026-03-30 upstream audit confirmed that Stremio archive support is real: `rarUrls` exists in the SDK/core contract, tuple-style `ArchiveUrl` is correct, and archive sources are routed through `rar/create`.
   - The local runtime logs and Stremio-side data on this machine still did not show one captured end-to-end native archive success, so PVTKRRX stopped advertising that path by default instead of continuing to promise it.
   - Supported behavior is now: incomplete multi-volume archives are suppressed or fail fast with a clear message, completed bundles stay hidden until extraction yields a normal direct-play file, and the native archive payload path remains opt-in experimental only for manual testing.
2. ~~Make the configure flow more automatic.~~ **Closed 2026-03-30.**
   - `npm run smoke:config`, `npm run smoke:desktop`, and `npm run smoke:stremio-link` passed again on 2026-03-30.
   - The current simple flow now has route-aware primary install links and keeps manual addon URLs as fallback instead of the main path.
3. ~~Trace the exact seedbox playback model end to end.~~ **Done 2026-03-29.**
   - Full code trace confirmed route detection (`getInstallMode` + `getManifest` profile assignment), stream emission per route, 307 LAN redirect mechanics, and `/file`/`/playback` route guards.
   - All three routes expose the same sports-first discovery catalog family plus movies, tv, and library — no per-route catalog filtering.
   - LAN Bridge 307-redirects rewrite the token path to `/local/...?mode=local`, giving LAN devices full PC Local playback after redirect.
   - Remote Seedbox on hosted relay: `/file` and `/playback` return 403 for non-local tokens; ready-file-first via `fileServerUrl`.
   - Auth-protected file servers: tracker `/playback` suppressed on non-local routes because redirect can't forward `proxyHeaders`.
   - Packed RAR: emitted only when all volumes 100% complete; suppressed at stream emission for tracker first-click; `/playback` fails fast for incomplete archives.
   - Explicit capability matrix now in `docs/ROUTE_FRAMEWORK.md`.
   - `npm run smoke:lan-pair`, `npm run smoke:guards`, and `npm run smoke:security` all passed again on 2026-03-30.
4. ~~Fix sports identity quality.~~ **Done 2026-03-29.**
   - Non-vs event titles (F1, UFC, MotoGP, Supercars, NASCAR, etc.) now parse via `parseSportsEventTitle` with structured league/date/event extraction.
   - Motorsport coverage expanded: Supercars, V8, NASCAR, WSBK, WEC, Formula E, Rally, Dakar now recognized.
   - Darts and golf added as distinct sport categories.
   - Sport hint resolution, scoring signals, and catalog grouping all updated for non-vs events.
   - TheSportsDB query builder now uses structured event names for better artwork matches.
   - Smoke tests cover event parsing, sport disambiguation, catalog grouping for F1/motorsport events, meta richness, and artwork fallback.
   - `npm run smoke:sports` passed again on 2026-03-30.
5. ~~Fix sports metadata/detail pages.~~ **Done 2026-03-29.**
   - Sports detail pages now carry multi-line descriptions with league, date, event name, matchup, and stats.
   - `runtime` field now shows the sport type label (e.g. "Motorsport", "MMA").
   - `genres` tags include both sport category and league name.
   - Artwork fallback still works when TheSportsDB returns nothing (SVG thumb or brand poster).
   - `npm run smoke:sports` passed again on 2026-03-30.
6. ~~Verify whether sports can become its own top-level Stremio surface.~~ **Closed 2026-03-30.**
   - Result: the current live addon manifest now uses a dedicated top-level `sports` surface and the latest local/LAN real-client pass shows it working across sports catalogs such as Premier League and Formula 1.
   - `npm run smoke:config` and `npm run smoke:sports` cover the current manifest/type shape and sports catalog behavior.
7. ~~Ensure `PVTKRRX` appears in the source list for normal films.~~ **Closed 2026-03-30.**
   - `npm run smoke:pipeline` still asserts that movie, direct-ready, and packed-ready stream names begin with `PVTKRRX`.
   - The real Stremio WebView2 cache on this machine contains cached stream payloads with `PVTKRRX` in the stream `name`, confirming the client is receiving and storing the branded source labels instead of only third-party addon labels.
8. SportsMeta split rollout on 2026-04-10.
   - The separate `sportsmeta` repo is now the real live addon boundary on Contabo:
     - manifest: `https://sportsmeta.pvtkrrx.cc/manifest.json`
     - catalog example: `https://sportsmeta.pvtkrrx.cc/catalog/movie/sportsmeta-basketball.json`
     - meta example: `https://sportsmeta.pvtkrrx.cc/meta/movie/sportsmeta%3Aevent%3Afighting%7C2026-04-10%7Cprofessional-fighters-league%7Cpfl-africa-1-pretoria.json`
   - Live Contabo runtime shape for SportsMeta:
     - service: `sportsmeta.service`
     - app path: `/opt/sportsmeta/app`
     - data path: `/opt/sportsmeta/data`
     - db path: `/opt/sportsmeta/data/db/sportsmeta.sqlite`
     - asset cache path: `/opt/sportsmeta/data/assets/cache`
     - source import roots: `/opt/pvtkrrx/runtime` and `/opt/pvtkrrx/data/pvtkrrx`
     - live route fragment: `/opt/stack/caddy/apps-enabled/sportsmeta.pvtkrrx.cc.caddy`
     - paid TheSportsDB key is now configured on the service via `SPORTSMETA_SPORTSDB_API_KEY`
   - The live SportsMeta health surface now reports:
     - `recordCount = 2727`
     - `eventCount = 2679`
     - `aliasCount = 8300`
     - `assetCount = 6196`
     - `importRunCount = 3`
     - `sourceDocumentCount = 7302`
     - `evidenceCount = 62791`
     - `customerCount = 2`
     - `subscriptionCount = 2`
     - `activeEntitlementCount = 2`
     - `activeTokenCount = 2`
   - SportsMeta paid membership is now live on the standalone host only:
     - pricing page: `https://sportsmeta.pvtkrrx.cc/pricing`
     - free root SportsMeta remains public and now serves SVG-only asset fallback on `/asset/...`
     - paid SportsMeta lives on tokenized member routes under `/member/:token/...`
     - live Stripe routes: `POST /billing/checkout`, `POST /billing/portal`, `POST /webhooks/stripe`
     - live yearly Stripe price ids: `price_1TKzDhENYh4p7RxpjEOBDw0c` (`Plus`) and `price_1TKzDiENYh4p7RxpgZb09QQN` (`Pro`)
     - this monetizes SportsMeta without moving entitlement logic into the `pvtkrrx` stream addon
   - SportsMeta was re-imported on 2026-04-11 from both runtime roots instead of only the older hosted cache.
   - The long canonical-id route bug is fixed live:
     - root cause was Fastify's default router `maxParamLength = 100`, which dropped longer `sportsmeta:` ids as route-level 404s
     - `https://sportsmeta.pvtkrrx.cc/meta/movie/sportsmeta%3Aevent%3Abasketball%7C2026-11-15%7Ceurobasket-women%7Cfinland-basketball-women%7Clithuania-basketball-women.json` now returns canonical metadata publicly
   - PVTKRRX is now attaching streams to the same canonical IDs without becoming the metadata owner:
     - repo commit `f676564` (`🛠️ fix: route hosted loopback services through contabo gateway`) is now live through successful Coolify deployment `372` (`sysdu6nl1s2wxcm48o01o78v`) after webhook deployment `371` failed during image export/unpack
     - that rollout moved the live public hosted container to `w14jewmw5ubscrxh8zzfhq7d-082417863890` on image `w14jewmw5ubscrxh8zzfhq7d:f676564650b757b40544b0b236fee272fd446a07`
     - the hosted relay now requires `PVTKRRX_HOST_GATEWAY_HOST=10.0.1.1` so tokenized configs that still carry `http://127.0.0.1:9696` and `http://127.0.0.1:8090` can reach the Contabo host's Prowlarr and qBittorrent services from inside the Coolify container
     - a real configured public route on `https://www.pvtkrrx.cc/:config/stream/movie/...` now returns a non-empty tracker stream again for `sportsmeta:event:fighting|2026-04-10|professional-fighters-league|pfl-africa-1-pretoria`
   - Follow-up live production repair on 2026-04-12 after the deployment audit:
     - SportsMeta upcoming ingest is now automated on the standalone host via `sportsmeta-upcoming-ingest.timer` -> `sportsmeta-upcoming-ingest.service` every 2 hours
     - the first scheduled run removed `658` contaminated seeded event rows and logged `contaminatedAfter = 0`
     - public `sportsmeta-all` is now ordered nearest-upcoming first on the live route
     - public `search=arsenal` and `search=rennes` are materially cleaner on the live SportsMeta host, and the bad `az-alkmaar|rennes` route was replaced by the correct live `az-alkmaar|heerenveen` metadata row
     - repo commit `70f0423` (`🛠 fix sports stream category constraints`) is now live on the hosted Coolify relay in container `w14jewmw5ubscrxh8zzfhq7d-184556663532` on image `w14jewmw5ubscrxh8zzfhq7d:70f0423e8dd95542b9f4a34b77c70036170fca28`
     - the configured hosted stream route now logs `Custom re-search query="..." cats="5060" useCategories=true`, proving the deployed re-search path is really category-constrained again
     - the same configured hosted stream route still returns tracker-backed football streams, so the category fix did not break SportsMeta stream attachment
   - Architecture truth after the rollout:
     - SportsMeta owns sports manifests, catalogs, metadata pages, artwork, and canonical `sportsmeta:` IDs
     - SportsMeta also owns Stripe checkout, portal, webhook, and entitlement enforcement for the premium layer
     - PVTKRRX remains the stream addon only
     - PVTKRRX remains free; the current configured `/:config/stream/...` path was not turned into a billing gate
     - the old integrated `/sportsmeta/*` draft inside `pvtkrrx` is not the live public boundary and the remaining legacy public routes now return `HTTP 410 Gone`
     - the live contract between PVTKRRX and SportsMeta is event-only canonical resolution plus SportsMeta-owned default fallback artwork

## Recommended Next Work

1. Browser-check the live homepage on desktop and mobile and fix any regressions now that the refactor is public.
2. Decide whether Contabo should keep the extra `/opt/pvtkrrx` `systemd` runtime, repoint Caddy to it, or remove it so deploy expectations stop drifting.
3. Monitor the SportsMeta `major` coverage-policy scheduled ingest that replaced the broad 14-day crawl on 2026-04-29; the next proof point is the first full 6-hour policy run, then a decision on SportsCult demand-audit promotion, revalidate/prune work, and any DB/cache purge or compaction.
4. Add repeatable operator tooling for new JPG drops and future re-imports so `/opt/pvtkrrx/runtime` is not the only bootstrap path.
5. Monitor the live SportsMeta Stripe/member-token boundary and add later commercial options there if needed; keep PVTKRRX free and keep entitlement logic off the public stream addon surface.
6. Decide whether SportsMeta should stay as the current systemd + Caddy service boundary or move under Coolify later; the separate runtime itself is now working.
7. Tune qBittorrent for faster early playback and confirm stream start time improvements on real clients.
8. Keep sports poster/wallpaper review focused on what Stremio clients actually render, not just what the metadata payload contains.
9. Capture one extra Android TV or Android mobile `LAN Bridge` pass for cross-client parity beyond the now-verified Apple TV path.
10. Finish public remote/auth playback sign-off before calling the whole route set fully release-ready.
11. When copy work is back in scope, finish the `Hybrid Home` / `LAN Bridge` terminology cleanup across the popup, runbooks, bootstrap manifest text, and stream info notices.
12. Keep this file updated whenever a real device test changes the truth table.
