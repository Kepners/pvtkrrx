# PVTKRRX Surgical Refactor Brief

Updated: 2026-03-28

Replaces `REBUILD_PROMPT.md`. The app does not need a from-scratch rewrite.
The smoke tests pass, the core logic is sound, and the edge-case knowledge is
encoded in working code. What it needs is structural surgery.

---

## What Was Already Done (2026-03-28)

### Dead code removal
- Stripped all Stripe/billing/trial/subscription code (~280 lines)
- Removed `stripe` dependency from package.json
- Removed dead password functions, sanitizeRedirectUrl
- `requireConfigSubscription` is now a pass-through (addon is free)
- `/auth/me` no longer returns billing/trial/freeMode fields
- accountStore.js cleaned of all billing fields and Stripe key methods
- Smoke tests updated to match new shape — all 7 pass

### Shared utilities extracted
- `src/utils/rateLimiter.js` — RateLimiter class replaces 6 manual bucket maps + the `consumeLanPairRateLimit` function in index.js
- `src/utils/timeout.js` — `withTimeout` (catalog.js) and `settleWithTimeout` (stream.js) consolidated into one shared module

---

## Next Phase: Split index.js (~3,200 lines → ~50 lines)

The single biggest maintenance problem. One file handles 40+ routes across
auth, config, pairing, streaming, provisioning, and file serving.

### Target module structure

```
src/
├── server.js                    # Express setup, middleware, CORS, error handler
├── routes/
│   ├── manifest.js              # Bootstrap + route-specific manifest routes
│   ├── configure.js             # Config UI, /encrypt, /local-config CRUD
│   ├── pair.js                  # /pair/heartbeat, /pair/status, redirect logic
│   ├── playback.js              # /file/:info and /playback/:info handlers
│   ├── auth.js                  # /auth/link, /auth/me (AuthKey only, no billing)
│   ├── stremio.js               # /catalog, /stream, /meta delegation
│   └── admin.js                 # /network-info, /auto-provision, /test-connection
├── middleware/
│   └── guards.js                # requireLocalNetworkRoute, requireCsrfToken, withConfig
└── index.js                     # Compose routes, start server (~50 lines)
```

### Rules for the split
1. **Pure extraction** — move code, do not rewrite behavior
2. **Keep middleware signatures** — `withConfig`, `requireConfigSubscription`, etc.
3. **Shared state** — `lanPairStore`, `accountStore`, `rateLimiters` created in server.js, injected via `req.app.locals` or module-level singletons
4. **No new dependencies**
5. **All 7 smoke tests must still pass after each module extraction**

### Order of extraction (lowest risk first)
1. `middleware/guards.js` — pure functions, no route deps
2. `routes/admin.js` — /network-info, /auto-provision, /test-connection
3. `routes/auth.js` — /auth/link, /auth/me
4. `routes/pair.js` — heartbeat + status + redirect
5. `routes/manifest.js` — bootstrap + local + hosted manifests
6. `routes/configure.js` — config UI + /encrypt + local-config
7. `routes/stremio.js` — catalog/stream/meta delegation
8. `routes/playback.js` — /file and /playback (most complex)
9. `server.js` — final: compose all routes into app

---

## Deferred Items (Reassess After Split)

These looked like over-engineering but may just be misplaced code. Evaluate
after the god object is broken up:

### SportsDB trimming
- `src/clients/sportsdb.js` is 1,106 lines with 5+ cache layers
- File-based persistence (~100 lines) may be removable
- But sports is the #1 differentiator, so trim carefully

### Provision.js simplification
- 634 lines of Windows auto-provisioning
- winget auto-install of qBit/Prowlarr is the main candidate for removal
- Firewall rules, Bonjour, and config discovery are actively used in heartbeat

### Catalog handler DRY
- 4 near-identical catalog functions (sports/movies/TV/library) in catalog.js
- Could become one parameterized function with type-specific config objects

---

## What Is Still Unproven (Not a Code Problem)

These are validation gaps, not architecture gaps:

1. Real Stremio desktop client with PC Local route
2. Android TV / mobile LAN Bridge same-account sync
3. Apple TV synced-addon behavior
4. One real public Remote Seedbox ready-file playback path
5. KV-backed pair persistence across restarts/redeploys

No amount of refactoring proves these. They need real-device testing.

---

## Working Style

- Prove root causes before changing behavior
- Run smoke tests after every extraction step
- If a test breaks, fix it before moving to the next module
- Prefer moving code over rewriting it
- Only add abstractions when the same pattern appears 3+ times
