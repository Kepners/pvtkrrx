# PVTKRRX Website Status

Updated: 2026-04-06

## Purpose

This file tracks the current public-site truth table plus the active homepage/content backlog.
Use it as the handoff note for website work instead of relying on chat history.
Before changing homepage or configure wording, read `docs/copy.md` first. That file is the governing copy spec for public-facing language.

## Public Host Check

Verified directly on 2026-03-31:

- Canonical public host: `https://www.pvtkrrx.cc`
- Old preview host: `https://pvtkrrx.vercel.app`
- `https://www.pvtkrrx.cc/` returned `200`
- `https://www.pvtkrrx.cc/configure` returned `200`
- `https://www.pvtkrrx.cc/runbooks` returned `200`
- `https://www.pvtkrrx.cc/manifest.json` returned `200`
- `https://www.pvtkrrx.cc/health` returned `200`
- `https://www.pvtkrrx.cc/local/install` returned `403`
- `https://pvtkrrx.vercel.app/` returned `404` with `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`

Interpretation:

- The audit claim that `/configure`, `/runbooks`, `/manifest.json`, and `/health` are missing is false for the canonical host.
- That claim is true only for the dead `pvtkrrx.vercel.app` preview hostname.
- `/local/install` returning `403` on the public host is expected because it is a same-host/local-network helper route.
- The public homepage should stay an entry point, not a route picker; route-specific guidance belongs inside `/configure` and the app.

## Code Check

Verified in the repo before changing anything:

- `index.js` already defines `/configure`, `/:config/configure`, `/runbooks`, `/seedbox-runbooks`, `/health`, `/manifest.json`, `/:config/manifest.json`, `/local/install`, and the hosted self-host launcher route at `/install-selfhost.sh` plus `/install.sh`
- `vercel.json` still maps `/configure` and `/runbooks`, but the old preview deployment is currently dead
- `public/index.html` is the current landing page
- A homepage rewrite was implemented locally on 2026-03-31 in `public/index.html`, but this pass has not deployed or browser-checked it yet

## Messaging Verdict

Current state:

- Product concept is stronger than the homepage currently communicates
- Visual direction is on-brand
- Homepage copy should stay cloud-friendly and avoid route-picker language above the fold
- The README explains the product faster and with more trust than the landing page
- Sports is a real differentiator in the product, but the homepage only treats it like a badge

Main clarity gaps:

1. What the product actually does
2. Who it is for
3. What a user needs to make it work

## Homepage Problems To Fix Next

1. Keep the public homepage focused on Configure rather than route selection.
2. Keep route-specific guidance inside `/configure` and the app, not on the landing page.
3. Leave the public homepage copy in plain English and keep the CTA stack short.
4. Keep sports as a dedicated section instead of leaving it in the badge strip.
5. Reduce operator-facing nav noise on the homepage. `Manifest` and `Health` are useful, but they should not compete with the main user journey.

## Implemented In This Pass

- Main homepage and configure hero headline now reads `PVTKRRX` as live text instead of a generic descriptive headline
- Hero copy rewritten in plain English around the actual product
- Main CTA changed to `/configure`
- Public `/local/install` CTA removed from the homepage
- Removed the route comparison section from the public cloud homepage
- Added "What you need" section
- Added dedicated sports proof section
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
5. Final CTA into `/configure`

## Files To Edit Next

- `public/index.html` for the cloud-homepage cleanup
- `public/configure.html` only if the rewrite needs small CTA/copy alignment
- `docs/WEBSITE_STATUS.md` after the homepage pass so the new truth is recorded

## Overnight Handoff

- Route audit complete
- Public host check complete
- Canonical host vs dead preview host now documented
- Cloud homepage cleanup now exists locally in `public/index.html`
- Next pass should browser-check the rewrite locally, then deploy it deliberately
