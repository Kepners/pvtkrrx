# Commercial Specification - PVTKRRX

> **Version:** 1.0
> **Date:** February 8, 2026
> **Author:** Stewart (Commercial)

---

## 1. Cost Analysis

### Development Costs

| Item | Estimate | Notes |
|------|----------|-------|
| Architecture & setup | 0.5 days | Scaffolding, Vercel config, deps |
| Core modules | 1 day | Encryption, TorznabClient, QBitClient, Cinemeta |
| Handlers | 1 day | Catalog, stream, meta handlers |
| Config page | 0.5 days | HTML, test connection, install link |
| Sports catalog | 0.5 days | Priority #1 per MD directive |
| Integration testing | 0.5 days | End-to-end with real seedbox |
| **Total** | **~4 days** | Single developer |

### Operational Costs (Monthly)

| Service | Cost | Notes |
|---------|------|-------|
| Vercel Hobby | $0 | 100K function invocations, 100GB bandwidth |
| Domain (optional) | $0 | `pvtkrrx.vercel.app` included free |
| External APIs | $0 | Cinemeta free, Jackett/qBit are user-hosted |
| SSL certificates | $0 | Vercel provides automatic HTTPS |
| Monitoring | $0 | Vercel analytics (basic) included |
| **Total** | **$0/month** | |

### Upgrade Path

| Trigger | Action | Cost |
|---------|--------|------|
| >100K requests/month | Vercel Pro | $20/month |
| Need 60s timeout | Vercel Pro | $20/month (included) |
| >1M requests/month | Vercel Pro + usage | $20/month + $0.40/100K over 1M |
| Custom domain | Porkbun/Namecheap | ~$10/year |

## 2. Timeline Analysis

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Project setup | 0.5 days | None |
| Core modules (crypto, clients) | 1 day | Setup complete |
| Handlers (catalog, stream, meta) | 1 day | Clients complete |
| Config page | 0.5 days | Crypto module complete |
| Sports catalog | 0.5 days | Catalog handler complete |
| Integration testing | 0.5 days | All modules complete |
| **Total** | **~4 days** | Sequential dependencies |

### Critical Path
Setup → Clients (TorznabClient, QBitClient) → Handlers → Integration test → Deploy

Config page and sports catalog can be parallelized after crypto module is complete.

## 3. Scale Projections

| Users | Requests/Month | Monthly Cost | Notes |
|-------|---------------|--------------|-------|
| 10 | ~5,000 | $0 | Well within Hobby tier |
| 50 | ~25,000 | $0 | Still within Hobby tier |
| 200 | ~100,000 | $0 | At Hobby tier limit |
| 500 | ~250,000 | $20 | Upgrade to Vercel Pro |
| 2,000 | ~1,000,000 | $20 | At Pro tier base |
| 5,000+ | ~2,500,000 | ~$26 | Pro + overage ($0.40/100K) |

**Assumptions:**
- ~500 requests/user/month (catalog browsing, stream resolution, search)
- Each catalog page load = 1 request
- Each stream resolution = 1-3 requests (Jackett + qBit + Cinemeta)
- Sports browsing adds ~100 extra requests/user/month

## 4. Dependency Cost Analysis

| Dependency | License | Bundle Impact | Risk |
|------------|---------|---------------|------|
| stremio-addon-sdk | MIT | ~200KB | Low — maintained by Stremio |
| express | MIT | ~500KB | Low — industry standard |
| fast-xml-parser | MIT | ~50KB | Low — actively maintained |
| **Total deps** | **3** | **~750KB** | Minimal dependency surface |

### Cost of Alternatives Rejected

| Alternative | Why Rejected | Cost Saved |
|-------------|-------------|------------|
| xml2js | Larger bundle (~150KB vs 50KB), slower | ~100KB bundle, faster cold starts |
| Redis/KV cache | Added complexity and cost | $0-15/month |
| Prowlarr as separate client | Same Torznab protocol | Development time (unified client) |
| Custom addon protocol | SDK does this for free | ~2 days development |

## 5. Commercial Risks

| Risk | Financial Impact | Mitigation |
|------|-----------------|------------|
| Vercel Hobby tier discontinued/limited | Need to move hosting ($20+/month) | Portable architecture — Express app runs anywhere |
| Usage spike from community adoption | Could exceed 100K/month quickly | Clear upgrade path to Pro ($20/month) |
| Cinemeta API rate limits or shutdown | Movies/TV catalog degrades | Fall back to torrent name parsing (no cost) |
| Source Available license disputes | Potential community friction | Clear license terms, restrict commercial reuse only |

## 6. Efficiency Notes

### What Stewart Approved
- **Zero infrastructure cost** — No databases, no caches, no queues
- **3 dependencies** — Minimal supply chain risk
- **Single env var** — `ENCRYPTION_SECRET` only
- **Stateless** — No storage costs ever

### What Stewart Flagged
- **qBit login-per-request** — ~50ms overhead per request, but unavoidable on serverless. Not a cost issue, just a latency note.
- **No in-memory cache** — Each Cinemeta call hits their API fresh. At scale, monitor for rate limiting. If needed, add Vercel KV ($0-$3/month).
- **Sports catalog RSS** — Each catalog page load queries Jackett fresh. Consider longer `cacheMaxAge` for RSS feeds (300s vs 60s) to reduce upstream load.

---

*Prepared by Stewart (Commercial) — February 8, 2026*
