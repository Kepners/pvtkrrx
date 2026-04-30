# PVTKRRX Sport Backdrops — Source-of-Truth Folder

This folder holds the **approved 4K sport backdrop assets** used by PVTKRRX
as the Stremio meta `background` for every sports catalog item.

## What is the source of truth

The `*-4k.jpg` files in this folder are the approved, deployed 4K sport
backdrop assets. They are 3840×2160 JPEGs, one per sport bucket:

```
boxing-4k.jpg     cricket-4k.jpg    darts-4k.jpg
football-4k.jpg   formula1-4k.jpg   generic-sport-4k.jpg
golf-4k.jpg       mlb-4k.jpg        motogp-4k.jpg
nba-4k.jpg        nfl-4k.jpg        nhl-4k.jpg
rugby-4k.jpg      tennis-4k.jpg     ufc-4k.jpg
wrestling-4k.jpg
```

`public/sports-backdrops/<sport>-4k.jpg` **must mirror these files
byte-for-byte**. The smoke `npm run smoke:sport-backdrops` enforces SHA-256
parity between this folder and the public mirror and will fail if either
side drifts.

## What route serves them

PVTKRRX serves these assets directly at:

```
/sports-backdrops/<sport>-4k.jpg
```

When the SportsMeta/PVTKRRX artwork proxy falls back to a local sport-level
backdrop for `background` or `landscape` variants, the response carries
`X-PVTKRRX-Artwork-Source: pvtkrrx-sport-4k-backdrop` and
`X-PVTKRRX-Sport-Backdrop: <bucket>`.

## Sport-level, not per-event

These are **sport-level** assets only. They are deliberately reused across
every event, match, league, and competition that maps to the same sport
bucket. For example:

- `football-4k.jpg` is reused for **EPL, FA Cup, UCL, La Liga**, and every
  other football/soccer competition (Serie A, Bundesliga, Ligue 1, Champions
  League, Europa League, World Cup, MLS, etc.).
- `formula1-4k.jpg` is reused for every F1 grand prix and qualifying
  session.
- `ufc-4k.jpg` is reused for every UFC card and MMA promotion.

Per-event posters live on a separate pipeline (the SportsMeta poster
templates rendered at 600×900). Do not add per-event, per-match, per-league,
or per-competition variants to this folder.

## The `01-*` … `07-*` Python generators are a SEPARATE family

A companion working folder may contain Python SVG generators in subfolders
named `01-editorial/`, `02-broadcast/`, `03-sportsbook/`, `04-trading-card/`,
`05-brutalist/`, `06-ticket-stub/`, `07-glitch/`, plus `_shared/sports.py`.
Those `generate.py` scripts are a **separate historical/experimental Python
SVG generator family** and have nothing to do with the deployed assets in
this folder.

Important facts about those scripts:

- They produce **1920×1080 SVG** files at `<dir>-<sport>.svg`.
- They cover only **8 sport keys** (`soccer, hockey, basketball, football,
  baseball, f1, mma, tennis`) — not the 16 buckets above.
- They use a different visual language (vintage paper, halftone, glitch
  scanlines, etc.).
- **They do NOT regenerate the approved 4K JPG assets above.**
- They are not part of the deployed PVTKRRX backdrop pipeline.

**Do not run those Python generators expecting them to refresh or replace
the `*-4k.jpg` assets.** If their output is ever copied into this folder or
into `public/sports-backdrops/`, it will break the source/public mirror
parity contract enforced by the smoke and will replace the approved 4K
family with the wrong art direction.

## Verification

Run the parity smoke any time these assets change:

```bash
npm run smoke:sport-backdrops
```

It asserts:

1. Each required bucket has a `<bucket>-4k.jpg` in this folder.
2. Each public mirror file exists at `public/sports-backdrops/<bucket>-4k.jpg`.
3. Each public file is exactly 3840×2160 JPEG.
4. SHA-256 of the source file matches SHA-256 of the public mirror.
5. Realistic title/league inputs route to the expected sport bucket.
