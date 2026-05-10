<!-- GENERATED_BY_WORKSPACE_STANDARD_V1 -->
# Repository: pvtkrrx

# Agent Workspace Contract

## Instruction Order
1. `C:\Users\kepne\.claude\CLAUDE.md` (global baseline)
2. `./CLAUDE.md` (project-specific rules)
3. `./.claude/settings.local.json` (repo-local permissions)

## Commands And Skills
- Global command packs: `/ccc:*`, `/cu:*`, `/cs:*`, `/sc:*` from `C:\Users\kepne\.claude\commands`.
- Repo-local command overrides: `./.claude/commands/**` (if present).
- Skill trackers and memory: `./.claude/skill-memory/**`.

## Repo Knowledge Layout
- Sessions: `./.claude/sessions/`
- Features: `./.claude/features/`
- Incidents/postmortems: `./.claude/incidents/` or `./.claude/postmortems/`
- References/research: `./.claude/references/`, `./.claude/research/`

## Cross-Workspace Defaults
- If the work touches hosting, deploys, DNS, public URLs, or live environments, check `C:\Users\kepne\OneDrive\Documents\@Projects\contabo-infra` and its `BRAIN.md` before assuming the current production setup.
- For PVTKRRX release/publish/ship requests, and whenever the user says `issue a new revision`, default to a dual-surface release check: the hosted/cloud line plus the Windows EXE line. Do not treat a release as complete if only one surface was updated unless the user explicitly scopes the release to one surface.
- When finishing meaningful work in this repo, default to `git status` -> selective `git add <paths>` -> `git commit -m "<why>"` -> `git push origin <current-branch>`, unless the user explicitly says not to commit or not to push yet.
- If the user's prompt is short, vague, blunt, or underspecified, use `C:\Users\kepne\.claude\PROMPT_LIBRARY.md` to upgrade it internally before acting instead of asking them to restate it.

## Working Rule
- Apply global defaults first, then project-specific constraints from `./CLAUDE.md`.
- Keep project details in `./CLAUDE.md`; keep this file as the stable routing contract.

## Sports Posters Template Guardrail
- Before changing Sports Posters layouts, inspect `C:\Users\kepne\projects\L - PVTKRRX\PCnestspeaker\python-templates`.
- Treat those Python template generators as the current source of truth for `editorial`, `broadcast`, `sportsbook`, `trading-card`, `brutalist`, `ticket-stub`, and `glitch`.
- `ticket-stub` is the free/default layout. The paid/member Sports Posters surface can use all seven layouts.
- Real SportsMeta/SportsDB logo images must replace placeholder text in league/team slots when present; glyph fallback is only for missing images.

## Bootstrap Manifest Name/Description Lock
- The root `/manifest.json` bootstrap entry (`com.kepners.pvtkrrx.bootstrap`) has a name and a public-guide description that are pinned. Do not change them as part of unrelated work.
- **Name (every mode)**: `PVTKRR`. No `Setup`, `Server Setup`, `Desktop Setup`, route, version, or marketing suffix — public guide, default, self-host, and desktop modes all return `PVTKRR`.
- **Public-guide description (verbatim)**: `Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Use the Windows host or your self-host server, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`
- Locked source: `src/config/manifest.js` constants `PUBLIC_BOOTSTRAP_MANIFEST_NAME` + `PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION`. Self-host and desktop modes carry mode-specific descriptions referencing `configureUrl`; that is outside the lock, but their name still pins to `PVTKRR`.
- Smoke gates: `scripts/smoke-config-flow.js` and `scripts/smoke-selfhost-server.js` import those constants and assert equality. Either smoke fails if a bootstrap manifest drifts.
- If a future change wants to alter either string, touch the constants in `src/config/manifest.js`, the CLAUDE.md lock section, the BRAIN.md "Bootstrap Manifest Lock" entry, and this AGENTS.md entry in the same commit — do not edit one without the others.

## Audit-And-Proof Standard

Do not optimize for a nice-sounding answer. Optimize for a truthful one. Work in a strict audit-and-proof style.

Always:
- separate what is assumed, what is verified locally, and what is verified live
- define the product/system boundary clearly
- preserve existing product truth unless explicitly changing it
- break complex tasks into phases
- ask for and return exact proof, not vague claims
- require exact files changed, exact routes tested, exact commands run, and PASS/FAIL results
- include remaining caveats and weak points honestly
- distinguish between "ready", "ready with caveats", and "not ready"
- write safe public wording only after verification

Never:
- confuse local repo success with deployed/live success
- invent features to make the answer look better
- hide failures behind positive summary language
- call work complete without acceptance criteria being met
- treat one working example as proof of broad coverage
- blur separate systems/products into one if the architecture says otherwise

For technical/product/deployment work, use this output structure unless told otherwise:
- A. Verdict
- B. Plain-English explanation/flow
- C. Exact proof
- D. Weak points
- E. Exact fixes made
- F. Safe public wording

## PASS 5 Local Proof Note - 2026-05-05

- PASS 5 targeted free-tier sports artwork repair has local proof, but is not committed or deployed yet.
- Do not claim the live Coolify image is fixed until this dirty tree is committed, pushed, deployed, and live routes are reprobed.
- Product rule enforced locally: PVTKRRX configured/free sports artwork has exactly one included style, `ticket-stub`; requested non-ticket templates such as `glitch`, `broadcast`, `sportsbook`, `editorial`, `trading-card`, and `brutalist` normalize to `ticket-stub` until a paid entitlement surface exists inside PVTKRRX and is proven.
- Emergency glyph/text fallback may remain only for missing or broken artwork/logo data. It is not a free tier and must not be advertised as one.

