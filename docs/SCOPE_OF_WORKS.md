# Scope of Works - PVTKRRX

> **Version:** 1.0
> **Date:** February 8, 2026
> **Status:** DRAFT — Pending Client Approval

---

## 1. Project Summary

PVTKRRX is a Stremio addon that connects users' private tracker seedbox infrastructure to Stremio. Each user configures the addon with their own Jackett/Prowlarr URL, qBittorrent WebUI URL, and HTTP file server URL. The addon encrypts these credentials into a URL token and uses them to search private trackers, manage downloads, and stream content directly from the user's seedbox.

The addon server is stateless — it never stores user data. All configuration is AES-256-GCM encrypted within the Stremio addon install URL. The server acts purely as an API matchmaker, relaying ~5-10KB of JSON/XML metadata. Video content streams directly from the user's seedbox HTTP server to their Stremio client — zero content proxying.

The unique differentiator is **sports content support** (Torznab category 5060), which no existing Stremio addon provides for private trackers.

## 2. Deliverables

### Core Features (v1)

1. **Configuration Page** — Self-contained HTML page where users enter their seedbox credentials, with provider presets, connection testing, and `stremio://` install link generation
2. **Sports Catalog** — Browse and search private tracker sports content (category 5060) with genre filters (Football, F1, UFC, NBA, Cricket, Rugby, Tennis, etc.)
3. **Movies Catalog** — Browse recent movies from private trackers, search and stream via IMDb matching
4. **TV Catalog** — Browse recent TV from private trackers, search and stream via IMDb matching with season/episode resolution
5. **Seedbox Library** — Browse everything already downloaded on the user's qBittorrent
6. **Stream Resolution** — For each title, check if content is already on seedbox (instant play) or available on tracker (add to qBit)
7. **Torrent Name Parsing** — Extract quality, codec, audio, source, HDR info for rich stream descriptions
8. **AES-256-GCM Encryption** — Secure credential handling in URL tokens
9. **Vercel Deployment** — Single `vercel.json`, runs on Hobby tier (free)
10. **Prowlarr Support** — Same Torznab protocol as Jackett, unified TorznabClient

### Out of Scope (Not in v1)

1. Content proxying — The addon NEVER handles video data
2. User accounts or databases — Fully stateless
3. Subtitle support — Future phase
4. Multiple seedbox configs — Single seedbox per addon install
5. Download progress bar UI — Stremio doesn't support this natively
6. Mobile companion app — Future phase
7. TheSportsDB metadata enrichment — Future phase

### Future Considerations (v2+)

1. Sports metadata enrichment via TheSportsDB API (posters, thumbnails)
2. Subtitle detection (`.srt` files alongside videos)
3. Multiple seedbox support per addon install
4. Tracker health dashboard
5. Smart quality preferences
6. Ratio protection warnings
7. Anonymous opt-in usage statistics

## 3. Technical Approach

**Architecture:** stremio-addon-sdk + Express on Vercel serverless (clockrr pattern)

- Single `index.js` entry point with Express app
- Custom Express routes handle `/:token/manifest.json`, `/:token/catalog/...`, `/:token/stream/...`
- SDK router mounted last as fallback for non-config paths
- `module.exports = app` for Vercel, conditional `app.listen()` for local dev
- `vercel.json` catch-all routes everything to `index.js`

**Key Technical Decisions:**
- `fast-xml-parser` for Torznab XML parsing (not xml2js)
- AES-256-GCM encryption with SHA-256 key derivation from `ENCRYPTION_SECRET` env var
- `Promise.allSettled()` for parallel Jackett + qBit queries with partial results on timeout
- Jackett `&timeout=6` parameter on every Torznab call
- Login-per-request for qBit on serverless (no persistent cookies)
- `cacheMaxAge: 60` for downloading content, `3600` for ready-to-stream

## 4. Timeline & Milestones

| Phase | Description | Duration |
|-------|-------------|----------|
| Setup | Project scaffolding, deps, Vercel config | 0.5 days |
| Core | Encryption, TorznabClient, QBitClient, Cinemeta | 1 day |
| Handlers | Catalog, stream, and meta handlers | 1 day |
| Config | Configuration page (HTML, test connection, install link) | 0.5 days |
| Sports | Sports catalog, search, genre filters, stream resolution | 0.5 days |
| Integration | End-to-end testing, Vercel deployment, Stremio install test | 0.5 days |
| **Total** | | **~4 days** |

## 5. Budget Considerations

| Item | Cost | Notes |
|------|------|-------|
| Vercel Hobby | $0/month | 100K invocations, 10s timeout |
| Domain (optional) | $0 | Uses `pvtkrrx.vercel.app` |
| Dependencies | $0 | All open source |
| External APIs | $0 | Cinemeta is free, Jackett/qBit are user's own |
| **Total** | **$0/month** | Scales to ~100K requests/month for free |

**Upgrade path:** Vercel Pro ($20/month) for 60s timeout and 1M invocations if needed.

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Vercel 10s timeout too short | Medium | High | Aggressive timeouts (7s Jackett, 5s qBit), `Promise.allSettled()` for partial results, Jackett `&timeout=6` param |
| qBit login latency on cold start | Medium | Medium | Login-per-request is unavoidable; keep timeout at 5s, fail gracefully |
| Sports ID encoding exposes API key | High | High | **FIXED** — Encode only {title, infohash, tracker, size, seeders}, no download URL |
| In-memory cache useless on serverless | Certain | Low | Accept stateless architecture; Cinemeta cache won't persist but calls are fast |
| Users misconfigure credentials | Medium | Medium | Test Connection button on config page validates before generating install URL |
| Stremio SDK config system conflicts | Low | Medium | Bypass SDK config — handle encryption in custom Express routes |

## 7. Assumptions

- Users already have a functional seedbox with Jackett/Prowlarr, qBittorrent, and HTTP file access configured
- Users' seedbox services are accessible via HTTPS from the public internet
- Stremio client handles the actual video playback — addon only provides stream URLs
- Vercel Hobby tier is sufficient for community-scale usage (~100K requests/month)
- Cinemeta API remains free and available for IMDb metadata resolution

## 8. Acceptance Criteria

- [ ] Config page loads, accepts credentials, validates connection, generates install URL
- [ ] Stremio installs addon and displays 4 catalogs (Sports, Movies, TV, Library)
- [ ] Sports catalog shows results from Jackett category 5060 with genre filters
- [ ] Movie/TV search resolves IMDb IDs to tracker results via Cinemeta + Jackett
- [ ] Already-downloaded content shows "On Seedbox" with direct HTTP stream URL
- [ ] Not-downloaded content triggers qBittorrent download from within Stremio
- [ ] Stream descriptions show quality, codec, audio, size, seeder info
- [ ] All credentials are AES-256-GCM encrypted in the addon URL
- [ ] Deploys and runs on Vercel Hobby tier (free)
- [ ] Prowlarr works alongside Jackett via shared Torznab protocol

---

**Client Approval:**

[ ] I approve this Scope of Works

Signature: _________________ Date: _________

---

*Prepared by Glen (PM) with input from Colin, Peter, Stewart, Jason & Jasmine — February 8, 2026*
