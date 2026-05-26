# MD DIRECTIVES - PVTKRRX

> **AUTHORITY:** These directives come from the Managing Director (Mr Gurr).
> **COMPLIANCE:** All `/ccc:` and `/cu:` utilities MUST read and follow these.
> **OVERRIDE:** These override utility defaults and engineer instinct. Follow the directive, not your preference.
> **LAST UPDATED:** 2026-05-15
> **STATUS:** ACTIVE

---

## DIRECTIVE 001: Sports Poster Logo/SVG Readiness — Zero Blank, Zero Duplicate-League Posters

**Issued:** 2026-05-15
**To:** ALL (execution: `/ccc:pm` → `/ccc:production`; verification: `/ccc:auditor`)
**Priority:** CRITICAL — RELEASE BLOCKER
**Repeat offense:** This is the SECOND time of asking. Codex worked it once; it is still broken in production.

### THE DIRECTIVE

Every sports poster rendered by PVTKRRX MUST resolve real artwork for **both** sides of a fixture (or the single mark for solo/combat events) before it ships. The following are now **release blockers** — a build with any of these is NOT shippable:

1. **No blank squares.** A poster slot showing an empty black/placeholder square (observed: "WWE EVOLVE YT", "Dallas Stars vs WNBA", "UFC 328 Chimaev vs Strickland") is a FAIL.
2. **No both-sides-same-league-logo posters.** A team-vs-team poster showing the same league logo (e.g. "NHL" roundel) in BOTH the home and away slots (observed: Ottawa Senators v Toronto Maple Leafs, Chicago Blackhawks v San Jose Sharks) is a FAIL. This was already prohibited by `CLAUDE.md` — it is now a hard gate.
3. **No missing team crests on team fixtures** where a real crest exists upstream (observed: some UEFA Champions League teams, WBL/WNBA).
4. **Permitted fallback ONLY:** clean deterministic initials (the existing initials path) when — and only when — a real crest is genuinely unavailable upstream. Initials are acceptable; blanks and duplicated league logos are not.

### SCOPE WIDENED 2026-05-15 (live Stremio catalog, not just the website)

New evidence from the live catalog (Sports → Football → Manchester United): fixtures render the **same team crest on BOTH sides** ("Manchester United vs Manchester United"), opponent names come through as **garbage tokens** ("MW 36", "WD35", "WSM"), and the meta detail pane shows a **blurred/broken image**. This proves the failure is not only the SportsMeta logo endpoint — the **release-title parser/classifier is emitting invalid opponents**, and the renderer then duplicates the home crest. The audit and fix MUST cover the catalog title-parse path (`.claude/briefs/team-vs-team-fix.md` governs selection rules), not just the website gallery. SAME-TEAM-BOTH-SIDES and GARBLED-OPPONENT are FAILs and release blockers.

### CORRECTION 2026-05-15 (MD probe was against a non-existent route — auditor caught it)

The original MD probe below tested `/asset/team/{league}/{slug}` and `/asset/league/{league}`. The independent auditor proved **those routes do not exist on SportsMeta and PVTKRRX never builds them** — every form returns `404 application/json`. This is a **documentation defect** in `.claude/briefs/team-vs-team-fix.md` §1.2 and the SportsMeta endpoint note in `CLAUDE.md`, NOT a live code path. Those docs MUST be corrected as part of this directive.

**The real PVTKRRX artwork path (verified from `src/clients/sportsmeta.js`):**
`parseSportsTitle` (`src/utils/sportsTitleParser.js`) → `/resolve?sport=&league=&home=&away=&date=&type=event` → `/inspect/asset/{variant}/{canonicalId}` → decoded TheSportsDB CDN badge. Generic `/asset/default/{variant}/{sport}` is SVG-only and is the clean-degrade source.

**PROVEN PRIMARY ROOT CAUSE — Class (d), title parser.** SportsMeta is healthy: fed a correct catalogued tuple it returns two distinct real crests (verified: Anaheim Ducks vs Vegas Golden Knights → distinct webp badges). The live garbling is PVTKRRX corrupting its own query:
- `src/utils/sportsTitleParser.js` does not strip matchweek/round/league noise — `Manchester.United.vs.Manchester.City.MW36` parses away as `Manchester City MW36`; `…vs.Womens.Super.League` parses away as `Womens Super League`.
- `directTeamLogoUrlFor` (`src/handlers/sportsArtworkProxy.js:1681-1700`) falls back to a haystack built from the **full title** (contains "Manchester United") → returns the **home crest in the away slot** = SAME-TEAM poster.
- `hasRealPair` guard (`src/utils/sportsPosterTemplates.js:469`) only blocks *identical* strings, so "Man Utd" vs "MW 36" passes as a fake valid matchup.

**FIX TARGET (for Codex / Production):** (1) `sportsTitleParser.js` — strip `mw\d+`/`matchweek`/round/league-phrase noise from team tokens, reject league phrases as opponents; (2) `directTeamLogoUrlFor` — never derive the away crest from a full-title haystack; (3) `hasRealPair` — reject when away is junk/empty/league-token, not only when identical; (4) genuine upstream gaps (UCL absent, UFC-328 no event, WWE/AEW 0 metas) MUST render clean deterministic initials, never blank.

### ROOT-CAUSE SCOPE (original probe — superseded by CORRECTION above, retained for history)

Original (incorrect) MD probe tested non-existent routes:

```
404  /asset/team/nhl/ottawa-senators        (route never existed)
404  /asset/team/uefa-champions-league/arsenal
404  /asset/league/ufc
200  /asset/default/poster/icehockey   (SVG — the clean-degrade source)
```

Root-cause classes (auditor-confirmed weighting: **(d) is the dominant controllable cause**):
- (a) **Wrong league key / slug format** PVTKRRX sends to SportsMeta (consumption-side bug in `src/handlers/sportsArtworkProxy.js` / `src/utils/sportsPosterTemplates.js`), OR
- (b) **SportsMeta genuinely missing the asset** (upstream data gap — out of PVTKRRX scope to fix the data, but PVTKRRX MUST then degrade to clean initials, never blank/duplicate), OR
- (c) **Both.**
- (d) **Title-parser emits an invalid/empty opponent** (e.g. "MW 36", "WD35", "WSM") so the renderer falls back to the home crest on both slots — a SAME-TEAM-DUP poster. Distinct from (a)–(c); fix is in the catalog title parse/classifier, not the logo endpoint.

Guessing is forbidden. Prove which with evidence (exact request URL PVTKRRX builds vs. what SportsMeta accepts).

### COMPLIANCE CHECK (the audit deliverable)

- [ ] `SVG_LOGO_AUDIT.md` created at project root with a per-league PASS/FAIL table (template below).
- [ ] Every league/org that appears in the live `/sports` gallery + rotating hero + real catalog is a row: football leagues (EPL, UCL, Champions League, La Liga, etc.), NHL, NBA, WNBA/WBL, MLB, NFL, UFC, WWE, AEW, F1, and any other family currently rendered.
- [ ] Each row records: real request URL PVTKRRX builds, SportsMeta HTTP status, resolved artwork (real crest / initials / BLANK / DUP-LEAGUE), PASS or FAIL.
- [ ] Root cause stated per failing family with evidence (category a/b/c above).
- [ ] Fix applied and re-tested; the table flips to all PASS or "PASS (clean initials, upstream gap proven)".
- [ ] `/ccc:auditor` independently re-runs the table and signs off.
- [ ] No release/merge to `main` for sports artwork until the table is all-PASS.

### RATIONALE

The client has now asked twice. Broken artwork on the public marketing surface (`https://www.pvtkrrx.cc/sports`) directly undermines the paid Sports Posters product. "It mostly works" is not acceptable. Proof per league or it isn't done.

---

---

## DIRECTIVE 002: Sports Title Parser — Client-Defined Field Contract

**Issued:** 2026-05-15
**To:** ALL (execution: Production/Codex; verification: Auditor)
**Priority:** HIGH — feeds DIRECTIVE 001 (bad parse → bad artwork/identity)

### THE DIRECTIVE

The corrected sports title parser MUST emit the client-defined schema in [SPORTS_TITLE_PARSER_SPEC.md](SPORTS_TITLE_PARSER_SPEC.md): `sport` (qualifier preserved — `NTT`≠`NXT`≠`Series`), `year`, `round`, `venue` (new), `session` (full multi-part), `date` (`DD MM` bound to `year`), `quality`, `format` (new), `language` (new); broadcaster + scene-group tokens discarded.

That spec is a **living contract**. As the client annotates more example batches, the ledger and defect taxonomy grow there. No parser change ships unless every logged example produces the client's required output. The spec — not the engineer's judgement — is the acceptance oracle.

### COMPLIANCE CHECK
- [ ] Every worked example in SPORTS_TITLE_PARSER_SPEC.md §4 passes (current → required).
- [ ] `NTT IndyCar Series` and `Indy NXT` resolve to distinct `sport` identities.
- [ ] Auditor re-runs the ledger after the fix.

### RATIONALE
The client is mapping the truth title-by-title because prior passes guessed. This directive makes their mapping the binding spec so it cannot be re-guessed.

---

## Active Directive Index

| # | Title | Priority | Owner | Status |
|---|-------|----------|-------|--------|
| 001 | Sports Poster Logo/SVG Readiness | CRITICAL / BLOCKER | PM → Production/Codex, Auditor | 🔄 OPEN — ground truth established, root cause PROVEN (class d title-parser), FIX PENDING with Codex |
| 002 | Sports Title Parser field contract | HIGH | Production/Codex, Auditor | 🔄 OPEN — living spec, batch 1 (IndyCar) logged |

---

*Managing Director — Mr Gurr — 2026-05-15*
