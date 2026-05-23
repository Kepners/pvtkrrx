# PVTKRRX v1.3 — Debrid + Cache Search + Newznab

**Released:** 2026-05-23
**Type:** Feature release (additive, fully backward-compatible with v1.2)

## What's new

### Debrid playback (optional)
Configure one or more debrid services (Real-Debrid, AllDebrid, Premiumize) in the new **Debrid** tab on the Configure page. When configured, PVTKRR will route torrent/NZB downloads through your debrid account so you get instant playback for cached items and faster downloads for the rest — no need to wait on a seedbox finishing the download.

- **Coexists with qBittorrent.** Your existing seedbox setup keeps working. Debrid is added as an option, not a replacement.
- **Sports route through debrid only.** Sports streams (`sportsmeta:*` IDs) use debrid when configured. If no debrid is enabled, sports streams return empty — debrid is the only currently supported path for live/scheduled sports.
- **Movies/TV: debrid first by default.** Toggle the "Prefer debrid over seedbox" option to flip this.
- **Real-Debrid May 2026 filter mitigation.** A built-in sanitizer strips known filter keywords (WEB-DL, AMZN, etc.) from the magnet display name before submission to RD. This is a partial mitigation — RD's filter also reads internal torrent file paths which PVTKRR cannot modify.

### Cache search (optional)
PVTKRR can query your put.io account (and friend-shared files) plus Premiumize's cache index to surface **instant-ready streams** at the top of the list, marked with `⚡ READY`. No download wait at all when the content is already there.

- **put.io.** Generate a personal app token at [app.put.io/oauth](https://app.put.io/oauth) and paste it into the Cache Search tab.
- **Premiumize.** Reuses your Premiumize API key from the Debrid tab.

### Newznab (Usenet indexer) support
PVTKRR's Prowlarr client now recognizes Newznab indexers alongside Torznab. NZB results are routed to Premiumize for cloud Usenet pickup. RD and AD don't support NZB and are skipped automatically.

No new indexer software to install — configure NZB indexers in your existing Prowlarr the same way you configure Torznab.

## Backward compatibility

Installs without any debrid or cache search configured are completely unchanged from v1.2. The v1.3 routing rules only kick in when you opt in by configuring at least one provider.

## Smoke proof

- `npm run smoke:debrid-all` — provider clients, RD filename sanitizer, schema round-trip, routing rules
- All existing v1.2 smoke tests pass unchanged

## Known limitations

- Real-Debrid's May 2026 filter cannot be fully bypassed at the addon layer; some scene releases will still get blocked even after sanitization.
- READY ordering across all stream sources (local files + debrid + qBit) lands in v1.4 — v1.3 only prepends cache-search hits to the existing PVTKRR slice.
- TorBox client deferred to v1.4 (API docs blocked at v1.3 spec time).
- Local SABnzbd/NZBGet integration deferred to v1.4.
