# PVTKRRX Website Status

Updated: 2026-03-31

## Purpose

This file tracks the current public-site truth table plus the active homepage/content backlog.
Use it as the handoff note for website work instead of relying on chat history.

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
- The public homepage still should not send outside visitors to `/local/install`; that is a real UX problem even though the route behavior itself is intentional.

## Code Check

Verified in the repo before changing anything:

- `index.js` already defines `/configure`, `/:config/configure`, `/runbooks`, `/seedbox-runbooks`, `/health`, `/manifest.json`, `/:config/manifest.json`, and `/local/install`
- `vercel.json` still maps `/configure` and `/runbooks`, but the old preview deployment is currently dead
- `public/index.html` is the current landing page
- No homepage rewrite has been implemented yet in this pass; this work stopped at audit + documentation handoff

## Messaging Verdict

Current state:

- Product concept is stronger than the homepage currently communicates
- Visual direction is on-brand
- Homepage copy is still too route-first and operator-coded
- The README explains the product faster and with more trust than the landing page
- Sports is a real differentiator in the product, but the homepage only treats it like a badge

Main clarity gaps:

1. What the product actually does
2. Who it is for
3. What a user needs to make it work

## Homepage Problems To Fix Next

1. Replace the hero copy with a plain-English product sentence.
2. Stop sending public users to the local-only `/local/install` route.
3. Add a clear route comparison for `PC Local`, `LAN Bridge`, and `Remote Seedbox`.
4. Add a "What you need" section:
   - Prowlarr or Torznab-compatible search
   - qBittorrent WebUI
   - optional file server for public remote setups
   - Windows host app for local/LAN routes
5. Give sports its own section instead of leaving it in the badge strip.
6. Reduce operator-facing nav noise on the homepage. `Manifest` and `Health` are useful, but they should not compete with the main user journey.

## Suggested Homepage Shape

1. Hero:
   - "Private trackers in Stremio, through your own setup."
   - Supporting line explaining Prowlarr + qBittorrent + Stremio in one sentence
2. Proof/value strip:
   - Sports
   - Movies and TV
   - Library
   - No debrid
   - Your hardware
3. Route comparison:
   - `PC Local`
   - `LAN Bridge`
   - `Remote Seedbox`
4. What you need
5. Sports proof section
6. Final CTA into `/configure`

## Files To Edit Next

- `public/index.html` for the homepage rewrite
- `public/configure.html` only if the rewrite needs small CTA/copy alignment
- `docs/WEBSITE_STATUS.md` after the homepage pass so the new truth is recorded

## Overnight Handoff

- Route audit complete
- Public host check complete
- Canonical host vs dead preview host now documented
- No homepage code changes made yet
- Next pass should start in `public/index.html`, not by re-auditing the routes again
