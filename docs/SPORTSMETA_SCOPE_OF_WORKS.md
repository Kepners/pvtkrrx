# Scope of Works — SportsMeta

> **Version:** 1.0
> **Date:** 2026-04-08
> **Status:** DRAFT — Pending Client Approval

---

## 1. Project Summary

SportsMeta adds a centralised sports artwork catalogue to PVTKRRX. Instead of every user independently querying TheSportsDB (hitting rate limits, getting ~2% hit rates), PVTKRRX maintains a permanent, growing collection of sports event posters, league badges, and team artwork on its hosted relay.

The catalogue is exposed through a freemium model: free users see generated SVG poster cards (dark-themed, sport-coloured, matchup layouts). Paid users see real photographic artwork from TheSportsDB. The artwork quality gap is the upgrade trigger — users see the difference in their own Stremio UI every time they browse sports.

This is not a separate product. SportsMeta is a feature layer within PVTKRRX that turns the existing sports image cache into a competitive moat.

---

## 2. Deliverables

### Core Features (MVP)
1. **JSON metadata endpoint** — `GET /sportsmeta/event` returns event name, date, sport, league, home/away teams, and artwork URLs (poster, thumb, badges, league logo, background)
2. **Freemium artwork gate** — free tier receives generated SVG card URLs, paid tier receives real TheSportsDB artwork URLs. Same metadata payload, different artwork URLs.
3. **Permanent image catalogue** — no pruning, no expiry. Images downloaded once live forever. Catalogue grows via existing 15-minute autofill seeder.
4. **Input flexibility** — endpoint accepts structured queries (league + date + teams) OR raw torrent titles. Reuses existing `sportsTitleParser.js` and `sportsdb.js` matching logic.

### Out of Scope (Not in MVP)
1. External API access for third-party addon developers
2. Standalone SportsMeta domain/branding
3. MinIO storage migration (future enhancement)
4. Historical backfill beyond current seeder coverage
5. Stripe billing integration (deferred until TheSportsDB ToS review)

### Future Considerations (v2+)
1. Developer API tier (REST endpoints for other addon devs)
2. Deep historical backfill (past seasons, archived events)
3. MinIO/S3 storage backend for CDN-like delivery
4. Standalone SportsMeta addon installable separately from PVTKRRX

---

## 3. Technical Approach

Five new `/sportsmeta/` routes on the existing PVTKRRX Express server. No new service, no new deployment, no new port. Reuses existing modules: `sportsdb.js`, `sportsImageCache.js`, `sportsArtwork.js`, `sportsTitleParser.js`, `sportsCacheSeeder.js`, `sportsThumb.js`. Approximately 170 lines of new code.

Full details: [SPORTSMETA_TECHNICAL_SPEC.md](SPORTSMETA_TECHNICAL_SPEC.md)

---

## 4. Timeline & Milestones

| Phase | Description | Duration |
|-------|-------------|----------|
| Phase 1 | Core metadata endpoint + response shape | Days 1–3 |
| Phase 2 | Freemium gate (free=SVG, paid=real artwork) | Days 3–4 |
| Phase 3 | Input flexibility, edge cases, rate limiting | Days 4–6 |
| Phase 4 | Polish, deploy, smoke tests | Days 6–8 |

**Total: ~8 working days to shippable MVP**

Full details: [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md)

---

## 5. Budget Considerations

All infrastructure is sunk cost. Marginal cost of serving SportsMeta is effectively zero. TheSportsDB API (~$36/yr) is covered by a single paying subscriber at $3–4/month. Storage growth at current trajectory gives years of headroom on the VPS (164GB free).

Full details: [COMMERCIAL_SPEC.md](COMMERCIAL_SPEC.md)

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TheSportsDB ToS prohibits redistribution | Medium | Critical | Review ToS before paid tier. Free tier (generated SVGs only) has zero legal risk — ship that first |
| Storage growth exceeds VPS disk | Low | Medium | Currently 713MB / 164GB free. Years of headroom. MinIO/S3 migration path documented |
| Rate limiting from TheSportsDB | Low | Medium | Paid API key + permanent cache means each image fetched once. Background seeder spreads load |
| Low freemium conversion rate | Medium | Low | Revenue isn't the goal — moat is. Even 0% conversion, the catalogue still differentiates PVTKRRX |

---

## 7. Assumptions

- TheSportsDB paid API key remains available and functional
- Existing 15-minute autofill seeder provides sufficient catalogue growth
- PVTKRRX subscription/billing infrastructure will be built separately when needed
- Generated SVG cards are visually acceptable as the free tier experience

---

## 8. Acceptance Criteria

- [ ] `/sportsmeta/event` endpoint returns correct metadata for structured queries
- [ ] `/sportsmeta/event` endpoint handles raw torrent title input
- [ ] Free users receive generated SVG card URLs in artwork fields
- [ ] Paid users receive real TheSportsDB artwork URLs in artwork fields
- [ ] Existing image cache serves real artwork with no pruning/expiry
- [ ] Smoke tests pass for new routes
- [ ] TheSportsDB ToS reviewed and documented (blocker for paid tier)

---

**Client Approval:**

[ ] I approve this Scope of Works

---

*Prepared by Glen (PM) with input from Colin, Peter, Stewart, Jason & Jasmine — 2026-04-08*
