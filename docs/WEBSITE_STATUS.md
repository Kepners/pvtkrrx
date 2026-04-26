# PVTKRRX Website Status

Updated: 2026-04-25

## Purpose

This file tracks the current public-site truth table plus the active homepage/content backlog.
Use it as the handoff note for website work instead of relying on chat history.
Before changing homepage or configure wording, read `docs/copy.md` first. That file is the governing copy spec for public-facing language.

## Public Host Check

Verified directly on 2026-04-23 after manual Coolify API redeploy `c307hqn7q8dep83d4lbahr6l`:

- `https://www.pvtkrrx.cc/` returned `200` and now serves `og:image` / `twitter:image` = `https://www.pvtkrrx.cc/social/pvtkrrx-home.png`
- `https://www.pvtkrrx.cc/runbooks` returned `200` and now serves canonical `/runbooks` plus `https://www.pvtkrrx.cc/social/pvtkrrx-runbooks.png`
- `https://www.pvtkrrx.cc/sports` returned `200` and now serves canonical `/sports` plus `https://www.pvtkrrx.cc/social/pvtkrrx-sports.png`
- `https://www.pvtkrrx.cc/sitemap.xml` returned `200` and now exposes `lastmod 2026-04-23`
- `https://www.pvtkrrx.cc/site.webmanifest` returned `200`
- `https://www.pvtkrrx.cc/social/pvtkrrx-home.png` returned `200` with `Content-Type: image/png`
- `https://www.pvtkrrx.cc/apple-touch-icon.png` returned `200` with `Content-Type: image/png`
- `https://www.pvtkrrx.cc/health` with `Accept: text/html` returned `200`, HTML `robots=noindex,nofollow,noarchive`, and header `X-Robots-Tag: noindex, nofollow, noarchive`
- `https://www.pvtkrrx.cc/version-status.json` returned `currentVersion = 1.1.34`, `latestVersion = 1.1.34`, and `updateAvailable = false`

Repo update prepared on 2026-04-25:

- New crawlable pages are wired locally at `/blog` and `/faq`.
- Public nav/footer links now use the same main set across home, sports, Clockrr, runbooks, health, and configure surfaces: Home, Sports, Clockrr, Runbooks, Blog, FAQ, Health, Chat.
- The shared chat link is `https://discord.gg/jPj8sV3nRs`.
- `/clockrr` now uses the same PVTKRRX-styled public shell and includes horizontal movie and TV top-ten tickers derived from aggregate Clockrr subtitle request telemetry.
- `/sports` copy now reflects the current SportsMeta split: PVTKRRX stream routes stay free, SportsMeta public remains SVG-first, and Sports Posters member artwork stays on SportsMeta routes.
- `public/sitemap.xml` now includes `/blog` and `/faq` with `lastmod 2026-04-25`.

Verified directly on 2026-04-08:

- Canonical public host: `https://www.pvtkrrx.cc`
- `https://www.pvtkrrx.cc/` returned `200`
- `https://www.pvtkrrx.cc/configure` returned `302`
- `https://www.pvtkrrx.cc/sports` returned `200`
- `https://www.pvtkrrx.cc/runbooks` returned `200`
- `https://www.pvtkrrx.cc/manifest.json` returned `200`
- `https://www.pvtkrrx.cc/health` returned `200`
- `https://www.pvtkrrx.cc/local/install` returned `403`
- `https://www.pvtkrrx.cc/sitemap.xml` includes `/sports`
- Homepage markers on `https://www.pvtkrrx.cc/` now confirm the refactor is live:
  - `truth-band` present
  - `Where does playback happen` present
  - legacy `meta-grid` absent
  - legacy `hero-chip` absent

Interpretation:

- The audit claim that `/runbooks`, `/manifest.json`, and `/health` are missing is false for the canonical host.
- `/local/install` returning `403` on the public host is expected because it is a same-host/local-network helper route.
- Public `/configure` now redirects back to the guide-only homepage instead of acting as a public setup surface.
- `/sports` is now the public PVTKRRX-facing Sports Posters page. It uses the main PVTKRRX visual language and relays checkout creation to SportsMeta, while stream playback stays free.
- The public homepage should stay an entry point, not a route picker; route-specific guidance belongs inside the Windows host app or the user's own self-host server.
- The homepage refactor is now live on the canonical host, not just in the local worktree.

## Code Check

Verified in the repo and on Contabo before changing anything:

- `index.js` already defines `/configure`, `/:config/configure`, `/sports`, `/clockrr`, `/blog`, `/faq`, `/runbooks`, `/seedbox-runbooks`, `/health`, `/manifest.json`, `/:config/manifest.json`, `/local/install`, and the hosted self-host launcher route at `/install-selfhost.sh` plus `/install.sh`
- Public routing is owned by Contabo Caddy and the Coolify app target, not a preview deployment file.
- `public/index.html` is the current landing page
- public canonical/OG metadata plus `robots.txt`/`sitemap.xml` now point at `https://www.pvtkrrx.cc`
- repo + live SEO asset pass completed on 2026-04-23:
  - page-specific OG/Twitter images now live in `public/social/`
  - `public/site.webmanifest` plus explicit favicon / apple-touch-icon links are now part of the site head
  - `runbooks.html` now has canonical + social metadata parity with the homepage and sports page
  - `/configure` and `/health` now carry both HTML `robots` tags and `X-Robots-Tag` headers so non-index pages stay non-index
- Contabo Caddy currently routes `pvtkrrx.cc` / `www.pvtkrrx.cc` to Docker alias `pvtkrrx:3000`
- Docker alias `pvtkrrx` currently belongs to Coolify container `w14jewmw5ubscrxh8zzfhq7d-130633962848` on image `w14jewmw5ubscrxh8zzfhq7d:e5e2e9f553ae19debdac3f4fdbe164e63fc4a1eb`
- A separate `pvtkrrx.service` runtime is active on Contabo with `WorkingDirectory=/opt/pvtkrrx` and port `7000`, but it is not the public site path while Caddy still targets the Docker alias
- `/opt/stack/sites/pvtkrrx` is an on-box mirror/worktree, not the public-serving path by itself

## Messaging Verdict

Current state:

- Product concept is stronger than the homepage currently communicates
- Visual direction is on-brand
- Homepage copy should stay cloud-friendly and avoid route-picker language above the fold
- The README explains the product faster and with more trust than the landing page
- Sports is now the public Sports Posters entrypoint, but it still needs a real device/browser pass after the latest deploy

Main clarity gaps:

1. What the product actually does
2. Who it is for
3. What a user needs to make it work

## Homepage Problems To Fix Next

1. Keep the public homepage focused on docs and route guidance rather than raw runtime controls.
2. Keep route-specific guidance inside `/configure` and the app, not on the landing page.
3. Leave the public homepage copy in plain English and keep the CTA stack short.
4. Browser-check the live homepage and Sports Posters page on real desktop/mobile devices after the latest deploy.
5. Reduce operator-facing nav noise on the homepage. `Manifest` and `Health` are useful, but they should not compete with the main user journey.

## Implemented And Live

- Main homepage and configure hero headline now reads `PVTKRRX` as live text instead of a generic descriptive headline
- Hero copy rewritten in plain English around the actual product
- Main homepage CTA now points to `/runbooks`, with route guidance on `/#routes`
- Public `/local/install` CTA removed from the homepage
- Removed the route comparison section from the public cloud homepage
- Added "What you need" section
- Added dedicated sports proof section
- Reworked `/sports` into the single public Sports Posters page with canonical metadata, PVTKRRX-styled presentation, links to SportsMeta checkout/proof, and clear Free / Sports Posters boundaries.
- Public `sitemap.xml` now includes `/sports`
- Moved `Manifest` out of the main nav; `Health` remains as the explicit operator utility link.
- Added `/clockrr`, `/blog`, and `/faq` to the public site surface.
- Reworked `/clockrr` to match the PVTKRRX visual shell and added movie/TV ticker rows from aggregate Clockrr subtitle request telemetry. The public display uses resolvable IMDb/TMDB-style media titles and excludes raw provider-only/unresolved IDs.
- Updated `/sports` public copy onto the current SportsMeta Free / Sports Posters status.
- Added the Discord chat URL to the shared footer and FAQ.

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
- Canonical host status now documented
- Cloud homepage cleanup is live on the canonical host
- Next pass should browser-check the live homepage on desktop/mobile and keep infra notes aligned if the runtime target changes
