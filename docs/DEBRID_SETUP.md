# PVTKRR Debrid + Cache Search Setup

This guide covers how to wire each supported service into the v1.3 Debrid + Cache Search tabs on the Configure page. All services are optional. You can mix and match; for example, RD as the only debrid + put.io as the only cache source is fine.

Implementation and live proof notes are tracked in [POSTERS_AND_DEBRID_WORKLOG_2026-05.md](POSTERS_AND_DEBRID_WORKLOG_2026-05.md).

## Quick decision

| Want this? | Use this |
|---|---|
| Cheapest debrid that handles most torrents | Real-Debrid |
| Most reliable, also supports NZB (Usenet) | Premiumize |
| Backup or RD-banned content | AllDebrid |
| Instant-ready playback when content is in your cloud account | put.io (cache search) |
| Instant-ready playback for whatever Premiumize has cached | Premiumize cache check (auto-enabled if PM is set up as debrid) |

## Real-Debrid

1. Sign in at https://real-debrid.com
2. Go to https://real-debrid.com/apitoken → copy the API token
3. In PVTKRR Configure → Debrid tab: enable Real-Debrid, paste the token, hit **Test connection**

**May 2026 filter warning:** Real-Debrid added an automated filter that blocks many WEB-DL / scene releases. PVTKRR ships a partial mitigation that strips known release-group keywords from the magnet display name (e.g. `WEB-DL`, `AMZN`, `RARBG`, `YTS`) before sending to RD. This helps in some cases but is not a guaranteed bypass — RD's filter also reads internal file paths in the torrent metadata, which PVTKRR cannot modify. If RD rejects an item, PVTKRR will fall through to the next provider in your preferOrder.

## AllDebrid

1. Sign in at https://alldebrid.com
2. Go to https://alldebrid.com/apikeys/ → create or copy an API key
3. In PVTKRR Configure → Debrid tab: enable AllDebrid, paste the key, hit **Test connection**

AllDebrid has no cache check — every magnet goes through their add-and-poll cycle. Items that AD has already seen come back quickly (a few seconds). New items take longer to grab.

## Premiumize

1. Sign in at https://www.premiumize.me
2. Go to https://www.premiumize.me/account → copy the API key (Customer ID + PIN combined)
3. In PVTKRR Configure → Debrid tab: enable Premiumize, paste the key, hit **Test connection**
4. (Optional) In the Cache Search tab, enable Premiumize cache check. It reuses the same API key.

**Premiumize is special.** It's the only service that supports:
- **Instant cache check** by infohash (other services don't have this)
- **NZB submissions** for Usenet downloads (other services don't support NZB)

If you only want to set up one debrid service, Premiumize is the most capable.

## put.io (cache search source only)

put.io is not a debrid downloader — it's a search source. PVTKRR queries your put.io account + files shared by your put.io friends and surfaces instant-playable hits at the top of the stream list.

1. Sign in at https://put.io
2. Go to https://app.put.io/oauth → click "Create a new OAuth app" → copy the access token (this is a one-click flow — no real OAuth dance required)
3. In PVTKRR Configure → Cache Search tab: enable put.io, paste the token, hit **Test connection**

put.io's API searches your account AND files shared with you by your put.io friends. If your friends seed actively, your cache hit rate can be very high.

## Newznab indexers (for NZB / Usenet)

PVTKRR's stream pipeline now routes NZB results from Prowlarr through Premiumize when both are configured. To add NZB indexers:

1. Open your existing Prowlarr install
2. Add a Newznab indexer (NZBGeek, DrunkenSlug, NZBHydra2, etc.) the same way you add a Torznab indexer
3. PVTKRR auto-detects whether each result is torrent or Usenet — torrents go through the regular flow, NZBs go through Premiumize

If you don't have Premiumize configured, NZB results are skipped (no Usenet fallback through RD or AD because neither supports NZB).

## Routing rules

PVTKRR's v1.3 router is additive - qBit is **always** kept as the backup and never removed from the stream list. Sports/private-tracker rows are stricter than movies/TV because an uncached Debrid handoff can look playable in Stremio while the provider is only downloading in the background.

| Content | Debrid linked | Debrid NOT linked |
|---|---|---|
| Movies / TV | Debrid stream ADDED above each existing qBit stream (default). Original qBit stream stays underneath as backup. Toggle "Prefer debrid over seedbox" off to put qBit first instead. | qBit only (v1.2 behavior unchanged). |
| Sports / private tracker rows | Cached/ready Debrid hits show first. Uncached Debrid handoff rows are hidden by default; qBit/seedbox stays the playable path. Set `PVTKRRX_DEBRID_UNCACHED_SPORTS_HANDOFF=true` only for controlled testing. | qBit only (v1.2 behavior unchanged). |
| NZB results | Routed to Premiumize when PM is configured (RD/AD skip — neither supports NZB). | Skipped (no qBit fallback for Usenet). |
| Cached items (via cache search) | `⚡ READY` prefix, top of list. | Same — cache search runs independently of debrid. |

When an uncached debrid handoff is accepted, the default mode holds the original `/playback/debrid` request open for the poll window and redirects to the provider as soon as the provider is ready. If the provider is still preparing after that window, the route returns retryable JSON `503` with `Retry-After`, state, and progress. This keeps the original `/playback/debrid` URL as the contract Stremio can re-request until the provider is ready.

For controlled testing, `PVTKRRX_DEBRID_PREPARING_RESPONSE=loader` makes `/playback/debrid` poll briefly, then serve the bundled waiting-room MP4 while the provider continues preparing. `PVTKRRX_DEBRID_LOADER_AFTER_MS` controls that short poll window and defaults to 8000 ms. This is a prepare screen only: a single HTTP video response cannot later turn into a provider redirect. Once the provider has a playable media URL, a later request to the same debrid stream redirects Stremio to that provider URL. PVTKRR does not proxy the provider's media bytes.

Torrentio-style Stremio progress is not Debrid. It comes from Stremio native torrent rows (`infoHash`, `fileIdx`, `sources`), where Stremio itself downloads the torrent and can draw the progress UI. PVTKRR can expose experimental `DIRECT P2P` rows with `PVTKRRX_NATIVE_STREMIO_TORRENT=true` for non-private torrent payloads. Those rows bypass qBit/seedbox and should not be enabled for private tracker safety unless the user explicitly accepts that Stremio will announce from the playback device.

## Verifying

After saving config, open any movie or TV episode in Stremio. If debrid is configured, you should see streams labelled like `⬇ RD · ...` or `⬇ PM · ...` ahead of the existing seedbox streams. If put.io or Premiumize has the file already, you should see a `READY` stream at the very top. For sports, expect cached/ready Debrid first when available and qBit/seedbox rows for uncached private tracker playback.

For programmatic verification: `node scripts/smoke-debrid-routing.js` runs the routing rules end-to-end against mocked Prowlarr/debrid responses.
