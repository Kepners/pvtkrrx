# PVTKRRX v1.3 — Debrid + Cache Search + Newznab

**Released:** 2026-05-23 (v1.3.0) → patched 2026-05-25 (v1.3.6 — sports search adult-leak hotfix)
**Type:** Feature release (purely additive, fully backward-compatible with v1.2)

## v1.3.6 patch - sports stream search hygiene

v1.3.6 fixes a backend sports search leak where an ambiguous sports title could fall through from TV/Sport category search into a broad all-category Prowlarr search. That allowed adult tracker results to appear as sports streams for the Australian Football `On Couch` item.

- Supplemental sports stream search no longer falls back to all Prowlarr categories.
- Sports stream candidates from Torznab adult categories (`6000-6999`) are blocked.
- Adult category names and adult title/studio terms are blocked before sports stream emission.
- qBittorrent/local/debrid playback routing is unchanged.

## v1.3.5 patch - debrid-first downloader routing

v1.3.5 corrects the real playback priority for Premiumize/Real-Debrid/AllDebrid installs. When a debrid provider is configured, debrid is the first downloader layer: cached links show first, and uncached tracker sports links are handed to the debrid provider on play before falling back to local/qBittorrent/seedbox.

- Premiumize cache search is implicit when a Premiumize downloader key is saved.
- Premiumize cache checks query by infohash before title fallback.
- Debrid `/playback/debrid` streams now sort above completed `/file/` streams when debrid is configured.
- qBittorrent/local/seedbox streams are still kept underneath as fallback.
- The self-host installer now asks for debrid downloader credentials before local/qBit/seedbox settings.

## What's new

### Debrid playback (optional, ADDITIVE)
Configure one or more debrid services (Real-Debrid, AllDebrid, Premiumize) in the new **Debrid** tab on the Configure page. When configured, PVTKRR ADDS a debrid playback stream alongside each existing qBittorrent stream — debrid for instant cached playback, qBit still there underneath as the always-on backup.

- **qBittorrent is always kept.** Same behaviour for movies, TV, and sports — debrid streams are ADDED above existing qBit streams when debrid is linked. qBit is never removed from the stream list. If debrid isn't configured, the stream list is identical to v1.2.
- **Per-install toggle.** "Prefer debrid over seedbox" controls order (debrid-first vs. qBit-first when both apply). Default: debrid first.
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
