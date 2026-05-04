# Codex Audit Brief — PVTKRRX Sports Artwork

You are reviewing PVTKRRX sports artwork rendering after a multi-phase fix that ran 2026-05-01. Treat the contract document `.claude/trackers/sports-artwork-template-contract.md` §1–§5 as the source of truth. Where the canonical Python templates at `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates\` differ from the contract, the contract wins.

## What you must verify

### A. Boundary preserved
1. PVTKRRX is the Stremio stream addon. SportsMeta is the separate sports-identity/artwork service at `https://sportsmeta.pvtkrrx.cc`. The two products MUST NOT be collapsed.
2. PVTKRRX consumes only SportsMeta public/root asset routes. Member-token routes (`/member/:token/...`) MUST NOT be called from PVTKRRX runtime, and any member URL MUST NOT appear in PVTKRRX-rendered SVG bytes.
3. The two PVTKRRX runtimes are intentionally separate: Coolify Docker container for `https://www.pvtkrrx.cc/` and systemd `pvtkrrx.service` on Contabo for self-host. Updates to one are not updates to the other.

### B. Cache not reintroduced
The TheSportsDB-driven sports image cache (`src/clients/sportsdb.js`, `src/utils/sportsImageCache.js`, `src/utils/sportsCacheSeeder.js`, `src/utils/sportsCacheAutofill.js`, `src/utils/sportsThumb.js`, `src/utils/sportsmetaCatalogue.js`, `src/handlers/sportsmeta.js`) was REMOVED 2026-04-22. Verify none of those files exist now.

The `src/utils/sportsArtworkDiskCache.js` raster cache for the SVG→PNG proxy IS sanctioned (see CLAUDE.md "Cache invalidation"). Do not delete it.

### C. Free vs paid
1. PVTKRRX is free for every install surface. `requireConfigSubscription` in `src/lib/shared.js` is a pass-through. No entitlement branch lives inside PVTKRRX.
2. **G5 invariant**: PVTKRRX-rendered posters/backdrops/logos contain text + sport glyphs only. NO real team badges, NO athlete portraits, NO `<image>` elements, NO `xlink:href`/`href` to remote URLs in the SVG. Run `node scripts/audit-contract-compliance.js` — must report **336/336 PASS** (this includes 168 "with-logos" cells where logo URLs are deliberately injected to verify they don't leak into output).

### D. Per-class contract followed
For every poster class in `.claude/trackers/sports-artwork-template-contract.md` §4, validate:
- Right family routing (team_vs_team→`08`, motorsport_event→`10`, paired combat/darts/tennis→`09`, everything else→event-show)
- Right backdrop bucket (per §2: football→football, F1→formula1, MotoGP→motogp, etc.; Phase 5 backlog buckets motorsport/snooker/table-tennis/badminton fall back to generic-sport until assets land)
- Hard invariants:
  - **motorsport_event NEVER renders head-to-head** (Q5.3 + G8). Test: pass an F1 event with synthetic `homeTeam`/`awayTeam` driver pair → output must be event-only (no fake VS).
  - **wrestling_event NEVER renders fake paired headline** (Q5.4). Test: pass WWE PPV with synthetic `homeTeam`/`awayTeam` → event-show shape only.
  - **team_vs_team with no real pair downgrades** to tournament_event layout (Q2.3). Test: "Premier League Highlights" no homeTeam/awayTeam → no fake VS rendered.

### E. Live runtime sanity
Run `curl https://www.pvtkrrx.cc/sports-artwork/default/poster/football.png?league=Test&title=ProbeMatch&template=ticket-stub > /tmp/live.png && file /tmp/live.png`. The file must be a valid PNG. Open it and verify text renders as text, NOT as `□` boxes.

**Known prior bug** (fixed via `Dockerfile` added 2026-05-01): the Coolify container had no fonts installed, so all rendered text appeared as `□` boxes. The new Dockerfile installs fontconfig + Liberation/DejaVu/Noto + Google Fonts (Bebas Neue, Inter, Playfair Display, JetBrains Mono) + asserts via fc-list during build that all four canonical fonts are resolvable. If you see `□` boxes in the live render, the Coolify container has not been rebuilt from the new commit yet.

### F. All 7 templates work, including glitch
PVTKRRX has 7 templates: `editorial`, `broadcast`, `sportsbook`, `trading-card`, `brutalist`, `ticket-stub`, `glitch`. Every template must render every event class without crashing AND without contract violations. The contract audit covers this — `node scripts/audit-contract-compliance.js` reports 7 templates × 24 fixtures × 2 (clean+logo-bombed) = 336 cells.

### G. The smoke matrix
Must report 11/11 PASS:
```bash
for s in sports-poster-render sports-broadcast sports-poster-classifier sports-resolution sports-team-vs-team sports-competitor-vs-competitor sports-single-event-motorsport sports-artwork sports-poster-adapter sport-backdrops sportcult-category-map; do
  npm run smoke:$s
done
```

## Look for these specific failure modes

| Failure mode | Where to look |
|---|---|
| Member-token URL in PVTKRRX poster bytes | `src/utils/sportsArtwork.js`, `src/handlers/sportsArtworkProxy.js` — search for `/member/` |
| `<image>` tag in any rendered SVG | `src/utils/sportsPosterTemplates.js` — should have NONE; sport-glyph SVG only |
| F1 / MotoGP rendering "Driver vs Driver" | `templateData()` in sportsPosterTemplates.js — `motorsportNeverPair` must be true |
| Wrestling rendering fake headline pair | Same — `wrestlingNeverPair` must be true |
| Literal "EVENT" / "- EVENT -" / "#BGU-EVE-" placeholder text | grep `>EVENT<` and `>-\s*EVENT\s*-<` across the renderers |
| Live container rendering `□` boxes | `Dockerfile` font install step — `fc-list \| grep -iE "Bebas Neue\|Inter\|Playfair Display\|JetBrains Mono"` should return all four |
| TheSportsDB calls reintroduced | grep `thesportsdb\|sportsdb` across `src/` — should only appear in SportsMeta upstream notes, not as a runtime client |
| Old `sports-image-cache/` dir written to at runtime | grep `sports-image-cache` — should only appear in deletion notes / docs |
| Per-template renderer ignored in favour of layout family for non-team sports | `renderSportsPosterTemplateSvg` dispatch order — per-template branches MUST be before the family fallback branches |

## Acceptance criteria

Work is **complete** if and only if:
1. `node scripts/audit-contract-compliance.js` reports **336/336 PASS**
2. All 11 sports smokes PASS
3. Live `https://www.pvtkrrx.cc/sports-artwork/default/poster/football.png?...` returns a PNG with readable text (not `□` boxes)
4. No member-token URLs appear in any PVTKRRX-rendered SVG (G5)
5. F1/MotoGP and wrestling event posters render as event-only tiles even when test data supplies fake competitor pairs

Report any `NOT READY` finding with: exact file path, line number, the contract rule it violates, and the smallest reproduction.

## Reference artefacts

Generated 2026-05-01:
- `.claude/trackers/sports-artwork-reconciliation.md` (Phase -1)
- `.claude/trackers/sports-artwork-discovery.md` (Phase 0)
- `.claude/trackers/sports-artwork-question-log.md` (Phase 1)
- `.claude/trackers/sports-artwork-template-contract.md` (Phase 2 — the contract)
- `.claude/trackers/sports-artwork-audit-report.md` (initial audit + post-fix)
- `.claude/trackers/sports-artwork-template-vs-original.md` (canonical-vs-PVTKRRX visual report)
- `.claude/trackers/sports-artwork-PUNCH-LIST.md` (this and remaining phases)
- `.claude/proofs/sports-artwork/audit-contract-compliance/` — 336 rendered cells
- `.claude/proofs/sports-artwork/audit-template-vs-original/` — 48 side-by-side composites vs canonical
- `.claude/proofs/sports-artwork/audit-phase4-live/` — 5 live PNG samples + headers from `https://www.pvtkrrx.cc/`

Use these as starting points; do not re-derive.
