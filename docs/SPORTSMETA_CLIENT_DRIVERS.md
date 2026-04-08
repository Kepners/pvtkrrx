# Client Drivers — SportsMeta

> **Meeting Date:** 2026-04-08
> **MD Present:** Yes
> **Attendees:** Glen (PM), Colin (CTO), Peter (Production), Stewart (Commercial), Jason & Jasmine (Sales)
> **Meeting Type:** Concept Meeting — Native Agent Team

---

## Project Overview

**Name:** SportsMeta (working title)
**One-liner:** Cinemeta-equivalent for sports on Stremio — a centralised sports artwork catalogue integrated into PVTKRRX
**Problem:** Sports content on Stremio looks terrible — generic text cards instead of real event posters. Movies/TV have Cinemeta + TMDB. Sports has nothing. Every addon user runs their own TheSportsDB lookups, hitting rate limits, getting poor poster hit rates.
**Audience:** PVTKRRX users (freemium gate — free users get generated cards, paid users get real artwork)

---

## Client Motivations (WHY)

### Primary Drivers
1. **Strategic moat** — own the sports metadata layer in the Stremio ecosystem. No other addon has this.
2. **User experience** — sports browsing in Stremio should look as good as movies/TV with Cinemeta
3. **Centralised efficiency** — stop every user hammering TheSportsDB independently. One cache serves all.

### Success Criteria
- Sports catalogue in Stremio shows real event posters, league badges, team artwork
- Free users see generated SVG cards (functional, just not photo-quality)
- Paid users see real TheSportsDB artwork (the visual upgrade trigger)
- Catalogue grows permanently — no pruning, no expiry

### Constraints & Preferences
- Budget: Zero new infra costs — all existing (Contabo VPS, TheSportsDB paid key, MinIO)
- Timeline: ~8 working days for MVP
- Technology: Integrated into existing PVTKRRX Express server, not a separate service
- Legal: TheSportsDB ToS review required before paid tier goes live

---

## Key Decisions Made

| Decision | Client Choice | Notes |
|----------|---------------|-------|
| Service boundary | Integrated into PVTKRRX | Not a separate product/domain |
| Customer | PVTKRRX users only | No external API for other addon devs (for now) |
| Revenue goal | Strategic moat | Not chasing revenue — competitive advantage |
| MVP | Full metadata + images | JSON endpoint + poster serving |
| Pricing | Freemium | Free = generated cards, Paid = real artwork |
| TheSportsDB ToS | Not yet checked | **Blocker** for paid tier launch |

---

## Team Debates & Resolutions

| Debate | Participants | Resolution | Decided By |
|--------|-------------|------------|------------|
| Standalone vs integrated | Colin, Peter, Stewart | Integrated into PVTKRRX | Client |
| Sell externally vs internal moat | Stewart, Jason | Internal moat — Stewart's recommendation validated | Client |
| MinIO vs disk storage | Colin, Peter | Keep disk for MVP, MinIO as future path | Colin |
| New seeder vs existing | Colin, Peter | Existing 15-min autofill rotation is sufficient | Colin |
| Pricing model | Stewart, Jason | Freemium with artwork quality as upgrade trigger | Client |
| Technical spec filename | Colin | New file `SPORTSMETA_TECHNICAL_SPEC.md` to preserve historical docs | Colin |

---

*Captured by Glen (PM) — 2026-04-08*
