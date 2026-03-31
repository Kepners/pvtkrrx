# Session Note - 2026-03-31 Website Audit Handover

## Completed

- Read repo instructions and source-of-truth docs before changing anything:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `ARCHITECTURE.md`
  - `docs/CURRENT_DESIGN.md`
  - `docs/ROUTE_FRAMEWORK.md`
  - `docs/PROJECT_STATUS.md`
- Verified the route code in `index.js` before trusting the public-site audit
- Confirmed that the repo already ships:
  - `/configure`
  - `/runbooks`
  - `/health`
  - `/manifest.json`
  - `/local/install`
- Checked the public hosts directly

## Verified Public State

- `https://pvtkrrx.vercel.app/` returned `404`
- Response header included `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`
- `https://www.pvtkrrx.cc/` returned `200`
- `https://www.pvtkrrx.cc/configure` returned `200`
- `https://www.pvtkrrx.cc/runbooks` returned `200`
- `https://www.pvtkrrx.cc/manifest.json` returned `200`
- `https://www.pvtkrrx.cc/health` returned `200`
- `https://www.pvtkrrx.cc/local/install` returned `403`

Meaning:

- The old `pvtkrrx.vercel.app` hostname is dead and should not be treated as the live product
- The canonical host is `https://www.pvtkrrx.cc`
- The public `403` on `/local/install` is expected because that route is local-only
- The homepage still should not advertise `/local/install` as a public CTA

## Current Read On The Website

- The product story in the docs is stronger than the homepage copy
- The visual direction is fine
- The current landing page is too route-heavy and too operator-coded
- Sports is underused as a differentiator
- The README currently does a better sales job than `public/index.html`

## Docs Updated In This Session

- `README.md`
- `ARCHITECTURE.md`
- `docs/CURRENT_DESIGN.md`
- `docs/ROUTE_FRAMEWORK.md`
- `docs/PROJECT_STATUS.md`
- `docs/WEBSITE_STATUS.md`

## Not Done Yet

- Homepage rewrite now exists locally in `public/index.html`
- No configure-page copy pass yet
- No deploy action taken

## Best Next Step

Start by browser-checking the new `public/index.html` pass, then deploy it when the layout is clean:

1. desktop + mobile browser pass
2. tighten any spacing/layout issues
3. deploy the homepage rewrite
4. only then consider a configure-page copy pass
