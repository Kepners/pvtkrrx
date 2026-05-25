# Claude Code Brief — PVTKRR v1.3 Integration + Ship

**For:** Claude Code (live integration + release coordination)
**Companion docs:**
- [docs/CODEX_BRIEF_V1.3_DEBRID.md](CODEX_BRIEF_V1.3_DEBRID.md) — what Codex built (read §15 first to see what actually shipped vs spec)
- [docs/IMPLEMENTATION_PLAN_2026-05-23_DEBRID_READY_PREFETCH.md](IMPLEMENTATION_PLAN_2026-05-23_DEBRID_READY_PREFETCH.md) — full plan, §10 is the authoritative v1.3 lock
- [docs/SPEC.md](SPEC.md), [docs/CURRENT_DESIGN.md](CURRENT_DESIGN.md), [docs/ROUTE_FRAMEWORK.md](ROUTE_FRAMEWORK.md) — existing live truth

**Scope of this brief:** v1.3 only. READY (v1.4) and prefetch (v1.5) are separate briefs to be written closer to those releases.

**2026-05-25 status note:** this brief is historical. The shipped v1.3.1+ behavior superseded the early "sports = debrid only" idea. Current truth: debrid streams are additive, qBittorrent/local streams remain as fallback for sports/movies/TV, and debrid is ordered first only when a provider is configured. See [POSTERS_AND_DEBRID_WORKLOG_2026-05.md](POSTERS_AND_DEBRID_WORKLOG_2026-05.md).

---

## 0. Pre-flight (do this BEFORE writing any code)

1. **Read [docs/CODEX_BRIEF_V1.3_DEBRID.md §15](CODEX_BRIEF_V1.3_DEBRID.md) (Codex completion notes).** Confirm Codex actually shipped what was specced. If Codex flagged deviations, deltas, or unfinished items, adjust this brief accordingly.
2. **Run Codex's smoke + unit tests:**
   ```
   node scripts/smoke-debrid.js
   node scripts/smoke-rd-sanitizer.js
   for f in scripts/__tests__/**/*.test.js; do node "$f" || echo "FAIL: $f"; done
   ```
   All must exit 0 before you proceed. If any fail, fix Codex's output BEFORE adding integration (don't paper over with workarounds in the integration layer).
3. **Audit Codex's output for hostname leaks and key leaks:**
   ```
   grep -r "pvt\.kepners\|kepners\.co\.uk" src/clients src/utils/debridCache.js src/utils/rdFilenameSanitizer.js
   ```
   Should return nothing.
4. **Read the project memory** at `C:\Users\kepne\.claude\projects\c--Users-kepne-OneDrive-Documents-GitHub-pvtkrrx\memory\MEMORY.md` and follow any feedback memories (especially [feedback_own_verification](owning-verification), [feedback_no_hypothetical_bug_sidebars](no-hypothetical-bugs), [feedback_no_fabricated_sport_metadata]).

If any of the above blocks you, fix the underlying issue rather than working around it.

---

## 1. Goal in one sentence

Wire Codex's `DebridProvider` + `CacheSearchSource` clients into PVTKRR's live stream pipeline, extend the encrypted install-config to carry debrid keys, surface the new Stremio Configure UI section, implement the sports-always-debrid and debrid-first routing rules, ship as v1.3 across Coolify + Contabo systemd + Windows EXE with full release parity.

---

## 2. Files you will modify or create

### Modify (existing live code — touch carefully)
```
src/config/installConfig.js        # add debrid block to encrypted schema
src/web/configure/*                # add Debrid Providers section (locate exact files first)
src/handlers/stream.js             # debrid cache check + routing + READY ordering
src/handlers/playback.js           # existing qBit flow stays — new sibling alongside
src/clients/prowlarr/*             # compose Codex's newznab.js into the existing client
package.json                       # version bump + new smoke scripts in "scripts"
docs/SPEC.md                       # update for debrid/Newznab support
docs/CURRENT_DESIGN.md             # update streams contract (READY prefix, sports routing)
docs/ROUTE_FRAMEWORK.md            # clarify debrid is an OPTION per route, not a new route
docs/PROJECT_STATUS.md             # bump to v1.3
```

### Create
```
src/handlers/playbackDebrid.js     # /playback/debrid/:token → add-and-poll → 302
src/handlers/configureDebrid.js    # POST /configure/debrid/test endpoint
src/utils/streamRouter.js          # sports vs movies/TV routing logic (extract from stream.js if cleaner)
docs/DEBRID_SETUP.md               # user setup guide (per provider, plus put.io token, plus Newznab indexers)
docs/RELEASE_NOTES_1.3.md          # release notes
```

### Do NOT touch
```
src/clients/debrid/*               # Codex owns these — only call into them
src/clients/cacheSearch/*          # Codex owns these — only call into them
src/clients/prowlarr/newznab.js    # Codex owns — compose only, don't edit
src/utils/rdFilenameSanitizer.js   # Codex owns — call only
src/utils/debridCache.js           # Codex owns — call only
src/config/manifest.js             # bootstrap manifest locked (CLAUDE.md rule)
docs/copy.md                       # locked (CLAUDE.md rule — only owner edits)
```

---

## 3. Non-negotiables (project locks — verify after every edit)

Pulled from `CLAUDE.md`, project memory, and recent incidents:

1. **Bootstrap manifest name + description locked.** `PUBLIC_BOOTSTRAP_MANIFEST_NAME = "PVTKRR"` and `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION` in `src/config/manifest.js` MUST NOT change. After every release run:
   ```
   curl -s https://www.pvtkrrx.cc/manifest.json | jq '.name, .description'
   ```
   to verify.
2. **Canonical hostname lock.** `pvt.kepners.co.uk` must NEVER appear in any user-facing string, manifest, logo URL, install token output, or shipped doc. The Caddy config can keep it in `PVTKRRX_ALLOWED_WEB_ORIGINS` (owner's personal hostname), but it never participates in manifest URL construction.
3. **Hosted relay never proxies media bytes.** `/playback/debrid` MUST 302-redirect to the debrid provider's direct URL — never stream bytes through PVTKRR.
4. **docs/copy.md is read-only.** Any new user-facing copy for the debrid Configure UI must be drafted here (or in PRs) and merged into copy.md by the owner — not by you.
5. **SportsMeta boundary intact.** Debrid + routing changes touch streams only. SportsMeta-owned routes (`/asset/...`, sport metas) are untouched.
6. **Contabo systemd parity.** Every release, rsync source to `/opt/pvtkrrx`, bump `/opt/pvtkrrx/REVISION`, `systemctl restart pvtkrrx.service` IN ADDITION TO Coolify rebuild.
7. **Release parity rule.** main commit, EXE artifacts, GitHub desktop release, GitHub self-host release, live Coolify deployment must all resolve to the same revision before calling v1.3 done.
8. **Reserved port 8766.** Never bind there (PC Nest Speaker collision).

---

## 4. Job list — CC-A through CC-J for v1.3

Sequenced. Do them in this order. Each job has explicit acceptance.

### CC-A: Config schema migration

**File:** `src/config/installConfig.js` (locate exact file — schema lives wherever the encrypted install-config is defined and validated).

**Add to schema:**
```js
debrid: {
  providers: [
    // { type: 'rd'|'ad'|'pm', apiKey: '<encrypted>', enabled: boolean }
  ],
  preferOrder: ['rd', 'ad', 'pm'],   // priority for routing
  preferDebridOverSeedbox: true,      // default true (v1.3 lock §10.3)
},
cacheSearch: {
  sources: [
    // { type: 'putio'|'pm', apiKey: '<encrypted>', enabled: boolean }
  ],
  preferOrder: ['putio', 'pm'],
}
```

**Backward compat:** existing install tokens (no `debrid` / `cacheSearch` blocks) deserialize cleanly to empty defaults. Round-trip test added to `scripts/smoke-config.js`.

**Acceptance:**
- Existing v1.2 install tokens still load
- New tokens with debrid + cacheSearch round-trip cleanly
- API keys are AES-256-GCM encrypted with the existing `ENCRYPTION_SECRET`
- `node scripts/smoke-config.js` passes

### CC-B: Configure UI — debrid + cache search

**Locate the Configure page first.** It's shared across PC Local / LAN Bridge / Remote Seedbox / Self-host server routes — one bad edit breaks all 4 install types.

**Add sections:**
1. **"Debrid providers (optional)"** — per-provider: enabled toggle, API key (password input, masked after save), "Test connection" button → calls `POST /configure/debrid/test` (CC-D's sibling).
2. **"Cache search sources (optional)"** — put.io (note: token from `app.put.io/oauth`), Premiumize (auto-toggle if user already configured PM as debrid provider — show grayed checkbox).
3. **"Prefer debrid over seedbox"** — toggle, default ON per §10.3.

**Copy draft (do NOT commit to copy.md — owner approves there separately):**
- Section header: `Debrid providers (optional)`
- Subtitle: `Add a debrid service to skip the wait. Real-Debrid is currently filtering some scene releases (May 2026); Premiumize and AllDebrid are unaffected.`
- Put.io row note: `Token: generate at app.put.io/oauth (one-click). Searches your account and friend-shared files for instant playback.`

**Acceptance:**
- Configure page renders identically on PC Local + LAN Bridge + Remote Seedbox + Self-host (test each)
- API key fields masked after save
- Test connection button returns clear pass/fail with provider name
- Existing fields (Prowlarr, qBit, Stremio AuthKey) unchanged

### CC-C: Stream pipeline integration + routing rules

**File:** `src/handlers/stream.js` (and optionally extract logic to `src/utils/streamRouter.js`).

**Pipeline order per §10.3 of plan:**

```js
async function buildStreams(meta) {
  const isSports = meta.id.startsWith('sportsmeta:');
  const config = getInstallConfig(req);
  const hasDebrid = config.debrid.providers.some(p => p.enabled);
  const hasQbit = config.qbit?.enabled;

  // 1. Cache search hits (READY-instant)
  const cacheHits = await searchAllSources(
    config.cacheSearch.sources,
    { title: meta.name, infohash: meta.infohash, year: meta.year, type: meta.type }
  );
  const readyStreams = cacheHits.map(toReadyStream);

  // 2. Prowlarr results → per-hash routing
  const prowlarrResults = await prowlarr.search(meta);
  const pendingStreams = [];

  for (const result of prowlarrResults) {
    const normalized = newznab.normalizeResult(result);

    if (normalized.protocol === 'usenet') {
      if (hasDebrid && config.debrid.providers.some(p => p.enabled && providerSupportsNzb(p))) {
        pendingStreams.push(toDebridNzbStream(normalized));
      }
      // No qBit fallback for NZB — Usenet only works via debrid
      continue;
    }

    // torrent path
    const cached = await debridCache.checkHash(config.debrid.providers, normalized.infohash);
    if (cached) {
      pendingStreams.push(toDebridReadyStream(normalized, cached));
      continue;
    }

    // Shipped behavior for sports/movies/TV: debrid first when configured, qBit fallback preserved.
    if (hasDebrid && config.debrid.preferDebridOverSeedbox) {
      pendingStreams.push(toDebridPendingStream(normalized));
    } else if (hasQbit) {
      pendingStreams.push(toQbitPendingStream(normalized));
    } else if (hasDebrid) {
      pendingStreams.push(toDebridPendingStream(normalized));
    }
  }

  // 3. Sort: READY first
  return [...readyStreams, ...pendingStreams];
}
```

**Stream name prefixes (DRAFT — finalise via copy.md approval):**
- `⚡ READY · {name}` — cache hit (Premiumize, put.io)
- `✅ READY · {name}` — local file (v1.4 territory, do not add in v1.3)
- `⬇ {provider} · {name}` — pending download via debrid
- `⬇ qBit · {name}` — pending download via seedbox

**Acceptance:**
- A movie with a known-PM-cached hash emits a `⚡ READY` stream that plays in <3s
- A sports meta with NO debrid configured returns empty streams (zero qBit fallbacks)
- A movie with NO debrid but qBit configured uses qBit (backward compat)
- A movie with both debrid + qBit prefers debrid by default
- Setting `preferDebridOverSeedbox: false` flips the default for movies/TV (sports still always debrid)

### CC-D: `/playback/debrid/:token` handler

**File:** `src/handlers/playbackDebrid.js` (new).

**Flow:**
1. Decrypt token (carries provider type, magnet OR nzb URL, fileIdx hint, install user ref).
2. Validate origin + rate limit (mirror existing `/playback` security).
3. Call appropriate provider method: `addMagnet` or `addNzb` based on token's `protocol` field.
4. `selectFiles(addedId, 'all')` for RD (no-op for AD/PM).
5. Poll status every 2s up to 30s. If state becomes `ready`, fetch `getStreamUrl(addedId, fileIdx)` → 302 redirect.
6. If 30s elapses still `downloading`, return 503 with Stremio-friendly retry hint (Stremio will re-request the stream URL, hitting the same poll cycle).

**Sibling: `POST /configure/debrid/test`** (new) — accepts `{provider, apiKey}`, runs a lightweight ping against the provider (e.g. RD `/user`, AD `/user`, PM `/account/info`, put.io `/account/info`), returns `{ok: boolean, message: string}`. Does NOT persist.

**Security rules:**
- Token is AES-256-GCM encrypted, mirror existing `/playback` token structure
- Never log full token, only first 8 chars
- Never log API keys
- Hosted relay rule: 302 only, NEVER proxy bytes (test by checking response has no body, only Location header)

**Acceptance:**
- Mock test: cached hash on Premiumize → /playback/debrid 302s to mock URL in <500ms
- Mock test: uncached hash → polls for 30s, 503 returned, retry returns same token cleanly
- Mock test: bad token → 403
- No bytes proxied (verify via response.body === null)

### CC-E: Bootstrap + manifest audit

After every CC-A through CC-D change, run:
```
curl -s https://www.pvtkrrx.cc/manifest.json
node scripts/smoke-config.js
node scripts/smoke-selfhost-server.js
```

The bootstrap manifest must remain byte-identical (modulo any owner-approved description change). The `PUBLIC_BOOTSTRAP_MANIFEST_NAME` / `_DESCRIPTION` constants MUST be unchanged in `src/config/manifest.js`.

Add a new smoke assertion to `scripts/smoke-debrid.js` (via Edit, not Codex's territory — this is the *integration* smoke layer): saving a debrid config and re-fetching the bootstrap manifest must produce identical output.

### CC-H: Smoke + npm script integration

Update `package.json`:
```json
"scripts": {
  ...existing,
  "smoke:debrid": "node scripts/smoke-debrid.js",
  "smoke:rd-sanitizer": "node scripts/smoke-rd-sanitizer.js"
}
```

Run the full smoke suite locally before pushing:
```
npm run smoke:config
npm run smoke:guards
npm run smoke:pipeline
npm run smoke:lan-pair
npm run smoke:stremio-link
npm run smoke:security
npm run smoke:parity
npm run smoke:selfhost
npm run smoke:playback
npm run smoke:provider-discovery
npm run smoke:desktop
npm run smoke:debrid          # new
npm run smoke:rd-sanitizer    # new
```

All must pass. If a pre-existing smoke fails because the debrid integration broke it, FIX the integration — don't disable the smoke.

### CC-I: Release coordination

For v1.3:

1. **Bump version:** `package.json` `"version": "1.3.0"`. Also any `electron-builder.yml` or `REVISION` files.
2. **Commit + push to `main`:**
   ```
   git status
   git add <specific files>
   git commit -m "🚀 feat: v1.3 debrid + cache search + Newznab support"
   git push origin main
   ```
3. **Coolify rebuild:**
   - Open https://coolify.buildsales.homes
   - Resource UUID `w14jewmw5ubscrxh8zzfhq7d`
   - Trigger redeploy from `main`
   - Verify after: `ssh contabo 'docker inspect <container> --format "{{.Config.Image}}"'` matches new tag
   - Verify: `ssh contabo 'docker inspect <container> --format "{{range .Config.Env}}{{println .}}{{end}}" | grep SOURCE_COMMIT'` matches GitHub HEAD
4. **Contabo systemd update (parallel):**
   ```
   rsync source → /opt/pvtkrrx
   ssh contabo 'echo "<commit-sha>" > /opt/pvtkrrx/REVISION'
   ssh contabo 'systemctl restart pvtkrrx.service'
   ssh contabo 'systemctl status pvtkrrx.service'   # confirm active
   ```
5. **Windows EXE:**
   ```
   npm run dist:win
   ```
   Verify `dist/PVTKRRX-1.3.0-Setup.exe` exists. Test install on a Windows machine. Sign if signing infra is set up.
6. **GitHub releases — TWO TAGS:**
   - `v1.3.0` (desktop) — attach EXE + `latest.yml`
   - `v1.3.0-selfhost` (self-host installer)
7. **Audits:**
   ```
   curl -s https://www.pvtkrrx.cc/manifest.json | grep -iE 'kepners\.co\.uk|pvt\.kepners'   # must be empty
   curl -s https://www.pvtkrrx.cc/manifest.json | jq '.name'                                  # must be "PVTKRR"
   curl -s https://www.pvtkrrx.cc/manifest.json | jq '.description'                           # must match locked string
   ```
8. **Release parity check (per CLAUDE.md release rule):** main commit SHA = EXE artifact source = desktop release tag = self-host release tag = Coolify SOURCE_COMMIT = systemd `/opt/pvtkrrx/REVISION`. If any diverge, release is NOT complete.
9. **Update memory:** add entry to `MEMORY.md` summarising what shipped + any new gotchas discovered.

### CC-J: Doc updates

Update or create:
- `docs/SPEC.md` — add debrid + cache search architecture, sports routing rule
- `docs/CURRENT_DESIGN.md` — add stream prefix conventions, debrid 302 pattern
- `docs/ROUTE_FRAMEWORK.md` — clarify debrid is an option PER ROUTE, not a new route
- `docs/PROJECT_STATUS.md` — bump to v1.3
- `docs/DEBRID_SETUP.md` (new) — user-facing setup guide:
  - How to get API keys (links to each provider's API key page)
  - put.io: `app.put.io/oauth` token generation steps
  - Premiumize: NZB indexer setup in Prowlarr (Newznab tab)
  - RD: May 2026 filter warning + sanitizer caveat
- `docs/RELEASE_NOTES_1.3.md` (new) — short release notes for users

Update `MEMORY.md` open work / queued section: mark v1.3 as shipped, queue v1.4 with TorBox + READY + SABnzbd/NZBGet.

---

## 5. Acceptance — v1.3 is shipped means

- [ ] All Codex smoke + unit tests pass
- [ ] CC-A through CC-J completed
- [ ] All existing smokes still pass (`npm run smoke:*` matrix)
- [ ] A movie with a PM-cached hash emits a `⚡ READY` stream playable in <3s
- [ ] A sports meta with no debrid configured keeps the v1.2 qBit/local fallback behavior where a qBit/local source exists
- [ ] A movie with no debrid + qBit configured uses qBit (backward compat preserved)
- [ ] RD `addMagnet` against a WEB-DL magnet sees sanitised `dn=` before sending
- [ ] An NZB Prowlarr result against a PM-configured install creates a transfer; same against RD-only install is skipped (no fallback)
- [ ] All 5 release surfaces (main, EXE, GitHub desktop tag, GitHub self-host tag, Coolify SOURCE_COMMIT, systemd REVISION) resolve to the same commit
- [ ] Bootstrap manifest unchanged: `name="PVTKRR"` + locked description
- [ ] Hostname audit clean: no `kepners.co.uk` / `pvt.kepners` in shipped manifests
- [ ] `docs/DEBRID_SETUP.md` exists and covers all 4 services
- [ ] `MEMORY.md` updated with v1.3 ship + v1.4 queue

---

## 6. Out of scope for v1.3 (deferred — do NOT include)

- TorBox client (v1.4)
- Local SABnzbd / NZBGet integration (v1.4)
- READY ordering across stream list (v1.4) — only the basic `⚡ READY` prefix from cache hits in v1.3; not the full `_readyRank` sort layer
- Local file READY indexing (v1.4)
- TV N+1 prefetch (v1.5)
- Search agent / catalog enrichment beyond Newznab indexer support
- Dedicated "Ready to Watch" catalog (we picked stream-list ordering — and even that's v1.4)
- Stremio addon SDK upgrades
- Billing / licensing changes

---

## 7. If you get blocked

Per [feedback_own_verification](memory link) and project memory: when stuck, surface the blocker honestly with what you tried, what failed, and what you suspect — don't paper over with workarounds in adjacent code.

Per [feedback_no_hypothetical_bug_sidebars]: don't flag adjacent bugs as "while I'm here I noticed..." unless you've actually proven them. Stay focused on v1.3 scope.

Per [feedback_calibration_no_manufactured_bugs]: if a v1.3 acceptance criterion passes with proof, state it passed. Don't manufacture an open bug to look thorough.

---

**End of brief. Pick up CC-A once Codex's §15 confirms its work is done.**
