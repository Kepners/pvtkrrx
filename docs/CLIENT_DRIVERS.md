# Client Drivers - PVTKRRX

> **Meeting Date:** February 8, 2026
> **MD Present:** Yes — Mr Gurr attended, issued 5 binding directives
> **Attendees:** Glen (PM), Colin (CTO), Peter (Production), Stewart (Commercial), Jason & Jasmine (Sales), Mr Gurr (MD), Auditor
> **Meeting Type:** Native Agent Team — real inter-specialist messaging

---

## Project Overview

**Name:** PVTKRRX
**One-liner:** A Stremio addon that connects users' private tracker seedbox infrastructure to Stremio for streaming — zero content proxying, pure API matchmaker.
**Problem:** Private tracker users with seedboxes have no way to browse and stream their content through Stremio. Existing addons (Torrentio, Jackettio, Comet) focus on public trackers and debrid services.
**Audience:** Private tracker community members who already have seedbox infrastructure (Jackett/Prowlarr + qBittorrent + HTTP file server).

---

## Client Motivations (WHY)

### Primary Drivers
1. **Bridge the gap** — Users have seedboxes with private tracker content but no Stremio integration
2. **Sports content** — No existing Stremio addon handles private tracker sports (category 5060) — this is the unique differentiator
3. **Community tool** — Client wants to give back to the private tracker community with a free, open tool

### Success Criteria
- Users can configure their own seedbox credentials and install the addon in Stremio
- Sports catalog works with browsing, search, and genre filters
- Movies and TV resolve via IMDb matching through Jackett/Prowlarr
- Already-downloaded content streams instantly from the user's seedbox
- Not-yet-downloaded content can be added to qBittorrent from within Stremio
- Runs free on Vercel Hobby tier

### Constraints & Preferences
- Budget: **Zero operational cost** — Vercel Hobby tier, no paid services
- Timeline: **ASAP** — estimated 3-4 days for MVP
- Technology: **stremio-addon-sdk + Express** — proven pattern from client's clockrr project
- Hosting: **Vercel** — as specified in the original spec

---

## Key Decisions Made

| Decision | Client Choice | Notes |
|----------|---------------|-------|
| Platform | Stremio Addon (web-hosted) | Vercel serverless |
| Tech stack | stremio-addon-sdk + Express (clockrr pattern) | Client's proven pattern |
| Distribution | Stremio addon install URL | `stremio://` protocol link from config page |
| Pricing | Free | Community tool |
| License | Source Available (not MIT) | Restricts commercial reuse |
| XML Parser | fast-xml-parser | Smaller bundle, faster on serverless |
| Encryption | AES-256-GCM | Custom crypto.js, not plain base64 |
| Prowlarr | Supported in v1 | Same Torznab protocol as Jackett |
| Logo | Use existing .ico file | From client's assets |
| SDK | stremio-addon-sdk | Clockrr pattern — Express handles config routes, SDK router mounted last |

---

## MD Binding Directives

Mr Gurr (Managing Director) issued 5 binding directives:

| # | Directive | Rationale |
|---|-----------|-----------|
| 1 | **Sports catalog is #1 priority** | Unique differentiator vs Torrentio/Jackettio/Comet |
| 2 | **Zero content proxying is non-negotiable** | ~5-10KB JSON/XML only, video streams direct from seedbox |
| 3 | **Config page must be dead simple and trustworthy** | Users are handing over seedbox credentials |
| 4 | **Ship for Vercel Hobby tier with aggressive timeouts** | 10s function limit, 100K invocations/month |
| 5 | **Use the clockrr architecture pattern** | Client's proven deployment — lowest risk path |

---

## Team Debates & Resolutions

| Debate | Participants | Resolution | Decided By |
|--------|-------------|------------|------------|
| SDK vs raw Express | Colin vs Client | Use SDK (clockrr pattern proven) | Client |
| xml2js vs fast-xml-parser | Colin, Peter | fast-xml-parser (smaller, faster) | Unanimous |
| Sports ID encoding (security) | Colin, Mr Gurr | Remove API key from ID — encode only {title, infohash, tracker, size, seeders} | Mr Gurr |
| Prowlarr in v1 | Colin, Peter | Yes — same Torznab protocol, rename JackettClient → TorznabClient | Glen |
| In-memory cache on serverless | Peter, Colin | Useless on Vercel (cold starts kill cache). Accept stateless. | Peter |
| qBit auth strategy | Peter, Stewart | Login-per-request (unavoidable on serverless) | Peter |
| Download polling approach | Colin, Peter, Client | Comet playback pattern — stream URL points to /playback endpoint, triggers qBit download, polls, 302 redirects to file. User sees loading spinner → playback. | Colin |
| File server auth | Colin | Use proxyHeaders behaviorHint for Basic Auth — credentials never in URL | Colin |
| Config middleware | Colin, Peter | withConfig Express middleware — decrypt once, pass req.config to all handlers | Colin |
| Timeout budget | Colin, Stewart | Jackett 7s + &timeout=6 param, qBit 5s, Cinemeta 3s — fits 10s Hobby tier | Colin |

---

## Client Corrections

| What Client Said | What We Assumed | Correction |
|-----------------|-----------------|------------|
| "Do I need Jackett?" | We were asking about their Jackett setup | Each USER has their own Jackett/Prowlarr — client is NOT hosting anything |
| "What did we do for clockrr?" | Colin recommended against SDK | SDK + Express pattern is proven — use it |
| "You need to understand how Stremio works" | Team proposed complex polling mechanisms | Stremio handles re-querying naturally via cacheMaxAge |

---

*Captured by Glen (PM) — February 8, 2026*
