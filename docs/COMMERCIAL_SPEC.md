# Commercial Specification — SportsMeta (PVTKRRX Internal)

> **Status:** Historical planning draft only  
> **Author:** Stewart (Commercial)  
> **Date:** April 7, 2026  
> **Recorded decision then:** SportsMeta is an internal PVTKRRX feature, not a standalone product
>
> **Reality check (2026-04-11):** that is no longer the live product truth. SportsMeta is now live as a separate addon/service at `https://sportsmeta.pvtkrrx.cc`. Use `README.md`, `docs/SPORTSMETA_BOUNDARY.md`, and `docs/SPORTSMETA_CONTABO_V1_PLAN.md` for the current boundary.

---

## 1. Strategic Position

SportsMeta is the centralised sports artwork cache inside PVTKRRX. It is not a product. It is a **competitive moat** — the thing that makes PVTKRRX's sports catalog visually superior to every other Stremio sports addon.

| Decision | Outcome |
|----------|---------|
| Standalone product | **Rejected** — ceiling too low, licensing risk too high |
| External API sales | **Rejected** — <50 potential buyers, not worth billing infra |
| Internal moat | **Accepted** — bundled into PVTKRRX freemium tier |

**Freemium split:**
- **Free users** — generated SVG event cards (zero external API dependency)
- **Paid users** — real TheSportsDB artwork (posters, badges, thumbnails, backgrounds)

---

## 2. Cost Analysis

### Sunk Costs (Already Paid — Not Attributable to SportsMeta)

| Item | Annual Cost | Notes |
|------|------------|-------|
| Contabo VPS | ~EUR 120/yr | Shared with PVTKRRX relay, MinIO, Coolify |
| TheSportsDB paid API key | ~$36/yr (Patreon) | Already used for PVTKRRX sports catalog |
| MinIO object storage | $0 | Runs on VPS, no external cost |
| Domain / SSL | $0 | Caddy auto-cert on VPS |

### Marginal Cost of SportsMeta Feature = Near Zero

| Cost Driver | Current Load | At 100 Users | At 1,000 Users | At 5,000 Users |
|-------------|-------------|--------------|----------------|----------------|
| Storage (images) | 713MB / 3,109 images | ~800MB | ~1.2GB | ~2GB |
| Bandwidth (image serving) | Negligible | ~2GB/mo | ~20GB/mo | ~100GB/mo |
| TheSportsDB API calls | Centralised, cached 365d | No change | No change | No change |
| CPU (sharp PNG processing) | Occasional | Low | Moderate | May need queue |

**Key insight:** TheSportsDB artwork is cached with a 365-day TTL (`DEFAULT_ARTWORK_CACHE_HOURS = 24 * 365`). Once an image is fetched, it's served from disk/MinIO indefinitely. API call volume does NOT scale with user count — only with new event discovery.

**Estimated new API calls:** ~50-100/day for new events across 13 sports. This is constant regardless of user base size. Rate limit cooldown is already implemented (10-minute backoff on 429s).

### Growth Trigger Points

| Threshold | Action Required | Cost Impact |
|-----------|----------------|-------------|
| Storage > 5GB | Prune stale cache entries (>2yr old, no hits) | $0 |
| Storage > 20GB | Consider external object storage (S3/R2) | ~$1-5/mo |
| Bandwidth > 200GB/mo | Cloudflare CDN in front of image endpoints | $0 (free tier) |
| Bandwidth > 1TB/mo | Evaluate Contabo plan upgrade or CDN paid tier | ~$5-20/mo |

**Bottom line:** SportsMeta adds effectively zero marginal cost up to ~1,000 users. At 5,000 users, expect ~$5-20/month in CDN/bandwidth. This is not a cost concern.

---

## 3. Freemium Conversion Economics

### The Question: What % Must Convert to Justify TheSportsDB API Cost?

| Variable | Value |
|----------|-------|
| TheSportsDB API cost | ~$36/year ($3/month) |
| PVTKRRX premium price (proposed) | $3-5/month |
| Break-even subscribers | **1 paid user** |

This is not a conversion economics problem. The API cost is so low that a single paying subscriber covers it. The real question is whether PVTKRRX premium has enough value to convert at all.

### Conversion Benchmarks (Industry Freemium)

| Product Type | Typical Free-to-Paid | Source |
|-------------|---------------------|--------|
| Developer tools | 2-5% | Industry avg |
| Media/streaming addons | 1-3% | Comparable niche |
| Niche SaaS (<10K users) | 5-10% | Small community premium |

### Projection Table

| Total Users | 3% Convert | 5% Convert | 10% Convert | Revenue @ $4/mo |
|------------|-----------|-----------|-------------|-----------------|
| 100 | 3 | 5 | 10 | $12-40/mo |
| 500 | 15 | 25 | 50 | $60-200/mo |
| 1,000 | 30 | 50 | 100 | $120-400/mo |
| 5,000 | 150 | 250 | 500 | $600-2,000/mo |

**Even at 100 users with 3% conversion, TheSportsDB API cost is covered.** Revenue is not the goal, but it's there if wanted.

---

## 4. Competitive Moat Analysis

### What SportsMeta Gives PVTKRRX That No Other Sports Addon Has

| Capability | PVTKRRX (with SportsMeta) | Competitors |
|-----------|--------------------------|-------------|
| Sports event posters | Real TheSportsDB artwork, 3,100+ cached | Generic placeholder or none |
| Team badges in cards | Home/away badges composited into event cards | Text-only event names |
| League logos | Official league branding | None |
| Genre-filtered sports catalog | 13 sports with visual browsing | Flat unfiltered lists |
| SVG fallback cards | Styled generated cards for free tier | Broken image icons |
| Artwork cache persistence | 365-day TTL, disk-backed, survives restarts | In-memory only (lost on restart) |
| Background/landscape art | Multiple artwork styles per event | Single image or none |

### Moat Durability Assessment

| Factor | Strength | Notes |
|--------|----------|-------|
| Data accumulation | **Strong** — 713MB and growing daily | Competitors start from zero |
| API key requirement | **Moderate** — TheSportsDB paid key needed | Barrier but not impossible |
| Caching intelligence | **Strong** — league mapping, alias resolution, dedup | 7 in-memory caches + persistent store |
| SVG generation | **Moderate** — replicable but effort to build | Fallback ensures free tier looks good |
| Genre taxonomy | **Strong** — 13 mapped sports with Stremio genre IDs | Curated, not auto-generated |

**Verdict:** The moat is real but not permanent. The accumulated cache (3,100+ images, growing) and the caching intelligence (alias resolution, league mapping, dedup) create a 6-12 month head start over any competitor attempting to replicate. The SVG fallback ensures the free tier isn't embarrassing, which protects against churn.

---

## 5. Risk Register

| # | Risk | Severity | Likelihood | Mitigation | Status |
|---|------|----------|-----------|------------|--------|
| R1 | **TheSportsDB ToS prohibits redistribution** | **CRITICAL** | **Unknown** | Review ToS immediately. If prohibited: serve URLs not bytes, or negotiate licence. If URLs only: cached images become internal-only, paid tier serves redirects to TheSportsDB CDN. | **MUST REVIEW** |
| R2 | TheSportsDB API discontinued or pricing changes | Medium | Low | 365-day cache means existing images survive. Migrate to alternative API (SportsDataIO, ESPN) if needed. Budget $0-50/mo for alternative. | Monitor |
| R3 | Storage growth exceeds VPS capacity | Low | Low (years away) | Current: 713MB. At ~50 new images/day avg = ~18GB/year. VPS has >100GB headroom. Add pruning at 20GB. | Acceptable |
| R4 | Rate limiting from TheSportsDB under heavy discovery | Low | Low | Already implemented: 10-min cooldown on 429, 365d cache TTL, in-flight dedup. New calls are ~50-100/day regardless of user count. | Mitigated |
| R5 | PVTKRRX premium tier has insufficient value proposition | Medium | Medium | SportsMeta artwork is one pillar. Bundle with other premium features (priority streams, higher cache limits, advanced config). | Design phase |
| R6 | Free SVG tier is "good enough" — nobody converts | Medium | Medium | Ensure visual quality gap is obvious. Real photos vs generated cards = clear upgrade incentive. | UX design |

### R1 Action Item (BLOCKING)

**Before any premium tier launch, the client must:**
1. Read TheSportsDB Patreon/API terms of service in full
2. Identify clauses on: redistribution, caching, commercial use, sublicensing
3. If unclear, email TheSportsDB directly and ask: "Can I cache and serve your artwork to users of my Stremio addon under my paid API key?"
4. Document the answer in `docs/LICENSING.md`

**If redistribution is prohibited, fallback options:**
- Serve TheSportsDB CDN URLs (not cached bytes) to paid users — slower but legal
- Use cached images for internal rendering only (SVG compositing with badges as data URLs)
- Negotiate a redistribution licence (likely $50-200/yr based on similar APIs)

---

## 6. Pricing Recommendation

### PVTKRRX Premium Tier (SportsMeta Bundled)

| Model | Price | Rationale |
|-------|-------|-----------|
| **Recommended: Monthly** | **$3-4/month** | Low enough to impulse-buy, high enough to filter non-serious users. Covers API costs at 1 subscriber. |
| Annual discount | $30/year (~$2.50/mo) | 17-25% discount incentivises annual commitment, reduces churn |
| Lifetime | $40-50 one-time | For early adopters only. Cap at 100 lifetime seats then remove option. |

### What's NOT Recommended

| Model | Why Not |
|-------|---------|
| Per-request pricing | Overcomplicated for this audience. Stremio users expect flat pricing. |
| Tiered plans (Basic/Pro/Enterprise) | Audience too small. One tier plus free. Keep it simple. |
| >$5/month | Stremio ecosystem is price-sensitive. Competing with free addons. |
| Free forever | Leaves money on the table and makes TheSportsDB cost unrecoverable at scale. |

### Premium Tier Feature Bundle (Suggested)

SportsMeta artwork alone may not convert. Bundle with:

| Feature | Free Tier | Premium Tier |
|---------|-----------|--------------|
| Sports catalog | SVG generated cards | Real TheSportsDB artwork |
| Sports genres | All 13 | All 13 |
| Movie/TV streams | Yes | Yes |
| Library catalog | Yes | Yes |
| LAN Bridge | Yes | Yes |
| Remote Seedbox | Limited (1 device?) | Unlimited devices |
| Cache priority | Standard | Extended TTL, background pre-fetch |

---

## 7. Summary for Glen (PM)

**Build confidence: HIGH.** The economics work. Marginal cost is near zero, conversion threshold is absurdly low (1 subscriber covers the API), and the moat is real.

**One blocker: R1 (TheSportsDB licensing).** Everything else is green. Get the client to check the ToS before we build the premium gate.

**Recommended next steps:**
1. Client reviews TheSportsDB ToS (BLOCKING)
2. Production designs the SVG card generator for free tier
3. Technical specs the premium gate (Stripe integration already built but disabled)
4. Sales designs the upgrade prompt UX in Stremio catalog

---

*Prepared by Stewart (Commercial) — April 7, 2026*
*Filed for concept meeting — SportsMeta / PVTKRRX internal feature*
