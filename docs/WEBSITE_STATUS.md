# PVTKRRX Website Status

Updated: 2026-04-08

## Purpose

This file tracks the current public-site truth table plus the active homepage/content backlog.
Use it as the handoff note for website work instead of relying on chat history.
Before changing homepage or configure wording, read `docs/copy.md` first. That file is the governing copy spec for public-facing language.

## Public Host Check

Verified directly on 2026-04-08:

- Canonical public host: `https://www.pvtkrrx.cc`
- Old preview host: `https://pvtkrrx.vercel.app`
- `https://www.pvtkrrx.cc/` returned `200`
- `https://www.pvtkrrx.cc/configure` returned `302`
- `https://www.pvtkrrx.cc/sports` returned `200`
- `https://www.pvtkrrx.cc/runbooks` returned `200`
- `https://www.pvtkrrx.cc/manifest.json` returned `200`
- `https://www.pvtkrrx.cc/health` returned `200`
- `https://www.pvtkrrx.cc/local/install` returned `403`
- `https://www.pvtkrrx.cc/sitemap.xml` includes `/sports`
- `https://pvtkrrx.vercel.app/` returned `404` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- Homepage markers on `https://www.pvtkrrx.cc/` now confirm the refactor is live:
  - `truth-band` present
  - `Where does playback happen` present
  - legacy `meta-grid` absent
  - legacy `hero-chip` absent

Interpretation:

- The audit claim that `/runbooks`, `/manifest.json`, and `/health` are missing is false for the canonical host.
- That claim is true only for the dead `pvtkrrx.vercel.app` preview hostname.
- `/local/install` returning `403` on the public host is expected because it is a same-host/local-network helper route.
- Public `/configure` now redirects back to the guide-only homepage instead of acting as a public setup surface.
- `/sports` is now a dedicated public guide page with canonical metadata and guide-only CTAs.
- The public homepage should stay an entry point, not a route picker; route-specific guidance belongs inside the Windows host app or the user's own self-host server.
- The homepage refactor is now live on the canonical host, not just in the local worktree.

## Code Check

Verified in the repo and on Contabo before changing anything:

- `index.js` already defines `/configure`, `/:config/configure`, `/sports`, `/runbooks`, `/seedbox-runbooks`, `/health`, `/manifest.json`, `/:config/manifest.json`, `/local/install`, and the hosted self-host launcher route at `/install-selfhost.sh` plus `/install.sh`
- `vercel.json` still maps `/configure` and `/runbooks`, but the old preview deployment is currently dead
- `public/index.html` is the current landing page
- public canonical/OG metadata plus `robots.txt`/`sitemap.xml` now point at `https://www.pvtkrrx.cc`
- Contabo Caddy currently routes `pvtkrrx.cc` / `www.pvtkrrx.cc` to Docker alias `pvtkrrx:3000`
- Docker alias `pvtkrrx` currently belongs to Coolify container `w14jewmw5ubscrxh8zzfhq7d-080959859728`
- A separate `pvtkrrx.service` runtime is active on Contabo with `WorkingDirectory=/opt/pvtkrrx` and port `7000`, but it is not the public site path while Caddy still targets the Docker alias
- `/opt/stack/sites/pvtkrrx` is an on-box mirror/worktree, not the public-serving path by itself

## Messaging Verdict

Current state:

- Product concept is stronger than the homepage currently communicates
- Visual direction is on-brand
- Homepage copy should stay cloud-friendly and avoid route-picker language above the fold
- The README explains the product faster and with more trust than the landing page
- Sports is now a real public page, but it still needs a real device/browser pass after the latest deploy

Main clarity gaps:

1. What the product actually does
2. Who it is for
3. What a user needs to make it work

## Homepage Problems To Fix Next

1. Keep the public homepage focused on docs and route guidance rather than raw runtime controls.
2. Keep route-specific guidance inside `/configure` and the app, not on the landing page.
3. Leave the public homepage copy in plain English and keep the CTA stack short.
4. Browser-check the live homepage and sports page on real desktop/mobile devices after the latest deploy.
5. Reduce operator-facing nav noise on the homepage. `Manifest` and `Health` are useful, but they should not compete with the main user journey.

## Implemented And Live

- Main homepage and configure hero headline now reads `PVTKRRX` as live text instead of a generic descriptive headline
- Hero copy rewritten in plain English around the actual product
- Main homepage CTA now points to `/runbooks`, with route guidance on `/#routes`
- Public `/local/install` CTA removed from the homepage
- Removed the route comparison section from the public cloud homepage
- Added "What you need" section
- Added dedicated sports proof section
- Added a dedicated public `/sports` page with canonical metadata and guide-only CTAs
- Public `sitemap.xml` now includes `/sports`
- Moved `Manifest` and `Health` links out of the main nav and into the footer utility area

## Suggested Homepage Shape

1. Hero:
   - `PVTKRRX`
   - Supporting line explaining Prowlarr + qBittorrent + Stremio in one sentence
2. Proof/value strip:
   - Sports
   - Movies and TV
   - Library
   - No debrid
   - Your hardware
3. What you need
4. Sports proof section
5. Final CTA into `/runbooks`

## Files To Edit Next

- `public/index.html` for any follow-up homepage polish after device checks
- `public/configure.html` only if the live homepage changes need CTA/copy alignment
- Contabo infra docs when the public runtime target changes again

## Overnight Handoff

- Route audit complete
- Public host check complete
- Canonical host vs dead preview host now documented
- Cloud homepage cleanup is live on the canonical host
- Next pass should browser-check the live homepage on desktop/mobile and keep infra notes aligned if the runtime target changes
