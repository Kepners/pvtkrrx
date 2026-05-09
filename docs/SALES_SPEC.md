# SALES_SPEC - SportsMeta / PVTKRRX Sports Artwork

> Status note (2026-05-05): this document replaces the older April sales concept. The old degraded-free-artwork split is no longer product truth.

## Current Product Boundary

- PVTKRRX is the Stremio addon/runtime for tracker-backed sports, movies, TV, and library rows.
- Prowlarr/Torznab-compatible indexers remain the source of truth for what appears in PVTKRRX sports catalogs. SportsCult is one supported source/profile, not a requirement.
- SportsMeta is enrichment: canonical sports identity, event metadata, logos, artwork URLs, and assets where available.
- SportsMeta must not create schedule-only rows inside PVTKRRX sports catalogs.
- Sports Posters member routes, checkout, entitlement, and premium artwork remain SportsMeta-owned surfaces. They are not a paid tier inside the PVTKRRX stream addon.

## Free Sports Artwork Rule

PVTKRRX sports uses a logo/artwork-based presentation, with one included visual style in the free version.

The one included PVTKRRX style is `ticket-stub`.

Configured PVTKRRX users must not be able to select non-ticket sports poster templates unless a paid entitlement surface is explicitly implemented in PVTKRRX and proven. Until then, requested templates such as `glitch`, `broadcast`, `sportsbook`, `editorial`, `trading-card`, and `brutalist` normalize to `ticket-stub`.

Emergency fallback remains allowed only when artwork or logo data is unavailable, broken, or unsafe to use. That fallback is not a product tier and must not be promoted as the free option.

## Safe Copy

Approved wording:

> Sports uses a logo/artwork-based presentation, with one included visual style in the free version.

Extended wording:

> Sports uses a logo/artwork-based presentation, with one included visual style in the free version. Prowlarr/Torznab-compatible indexers drive what appears. SportsCult is one supported source, not a requirement, while SportsMeta enriches artwork and event presentation.

Avoid wording that implies the free sports surface is a deliberately degraded visual mode.

## Sales Positioning

The sales boundary is optional SportsMeta member artwork, not gated PVTKRRX playback.

Use these claims:

- PVTKRRX streams stay free on the tested paths.
- Sports catalogs and stream attachment remain PVTKRRX functionality.
- SportsMeta owns separate member artwork routes.
- Payment does not change PVTKRRX playback.
- SportsMeta enrichment improves presentation where data and artwork exist.

Do not use these claims:

- PVTKRRX has an in-addon paid sports poster entitlement.
- PVTKRRX free sports is intentionally degraded.
- PVTKRRX free sports is a text-card tier.
- SportsMeta creates PVTKRRX catalog rows without Prowlarr/Torznab availability from the user's configured indexers.

## Proof Expectations

Before public wording says the free sports artwork rule is fixed, prove:

- default configured sports template resolves to `ticket-stub`;
- configured `sportsPosterTemplate=glitch` resolves to `ticket-stub`;
- configured `sportsPosterTemplate=broadcast` resolves to `ticket-stub`;
- configured sports meta emits `posterTemplate=ticket-stub` and `layoutFamily=TICKET_STUB` for the canonical acceptance sample;
- public configure UI exposes only the included Ticket Stub style;
- public copy does not present emergency fallback as a free option;
- the 7-family renderer contract remains covered by template-render smoke tests.
