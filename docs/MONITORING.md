# PVTKRRX Monitoring

Updated: 2026-04-09

## Purpose

This is the recommended monitoring model for PVTKRRX today:

1. public-page traffic on the hosted guide pages
2. server-side product events on the hosted relay
3. no analytics on local/self-host runtimes unless an operator explicitly opts in

The current implementation is Umami-first and host-gated.

## Recommended Deployment

Use Coolify to run a self-hosted Umami stack, then point the hosted `www.pvtkrrx.cc` runtime at it.

Recommended shape:

- Coolify service: `Umami`
- Database: Postgres managed by Coolify or your existing database layer
- Public analytics domain: `stats.pvtkrrx.cc` or similar
- PVTKRRX hosted relay env:
  - `PVTKRRX_ANALYTICS_PROVIDER=umami`
  - `PVTKRRX_ANALYTICS_UMAMI_HOST_URL=https://stats.pvtkrrx.cc`
  - `PVTKRRX_ANALYTICS_UMAMI_WEBSITE_ID=<umami-website-id>`
  - `PVTKRRX_ANALYTICS_ALLOWED_HOSTS=www.pvtkrrx.cc,pvtkrrx.cc`
  - `PVTKRRX_ANALYTICS_HASH_SALT=<long-random-secret>`

Do not set those vars on the Windows EXE runtime or customer self-host servers unless you intentionally want private-runtime telemetry.

## What Is Tracked

### Public Guide Pages

The public hosted pages load Umami only when the current host matches the allowlist.

Tracked pages:

- `/`
- `/sports`
- `/runbooks`

Tracked CTA clicks:

- `cta_read_setup_guide`
- `cta_choose_route`
- `cta_view_sports`
- `cta_open_releases`
- `cta_download_windows`

### Hosted Product Events

The hosted relay now emits these server-side Umami events:

- `config_generated`
  - fired when `/encrypt` successfully returns a hosted config token
- `manifest_install_seen`
  - fired once per config token on first hosted manifest hit
- `manifest_active_day`
  - fired once per config token per day on hosted manifest hits
- `lan_host_active`
  - fired once per pair id per day when the Windows desktop heartbeat reaches the hosted relay
- `selfhost_installer_requested`
  - fired when the public hosted runtime serves `install-selfhost.sh`
- `desktop_download_requested`
  - fired when the public hosted runtime receives a tracked Windows download redirect request such as `/download/windows/setup`
- `stremio_link_session_created`
  - fired when the hosted runtime creates a one-time Stremio link session
- `stremio_account_linked`
  - fired when AuthKey linking completes successfully

## How To Read The Numbers

- Traffic: pageviews on `/`, `/sports`, `/runbooks`
- Setup intent: `config_generated`
- Approximate installs: `manifest_install_seen`
- Active hosted installs: `manifest_active_day`
- Active LAN hosts: `lan_host_active`
- Self-host installer demand: `selfhost_installer_requested`
- Windows EXE download requests: `desktop_download_requested` filtered by `asset_kind=setup`
- Account-link conversion: `stremio_link_session_created` -> `stremio_account_linked`

GitHub release asset download counts are still useful, but they are a secondary signal rather than the main install metric.
The tracked Windows download route measures download starts from PVTKRRX-owned links, not guaranteed GitHub byte-complete downloads. If someone downloads straight from GitHub without touching the tracked PVTKRRX URL, Umami will not see that request.

## Privacy Rules

The implementation intentionally avoids sending:

- raw Prowlarr or qBittorrent URLs
- API keys
- file paths
- tracker names
- raw Stremio user ids
- config tokens in analytics URLs

Hosted dedupe keys are hashed before they are persisted to the local runtime `analytics-dedupe.json` state file.

## Files In This Repo

- `src/utils/analytics.js`
  - Umami config, host gating, and dedupe logic
- `public/analytics.js`
  - lightweight browser loader for hosted guide-page analytics
- `index.js`
  - server-side product event instrumentation and `/analytics-config.json`

## Notes

- This is an operations feature, not a billing/entitlement feature.
- If you ever want customer-owned self-host runtimes to report into a separate operator dashboard, enable that explicitly with `PVTKRRX_ANALYTICS_TRACK_PRIVATE_RUNTIMES=true` on that runtime and use a different Umami website/project.
