# PVTKRRX - Specification

> **Status:** Approved — Concept Meeting Complete
> **Date:** February 8, 2026
> **Full spec source:** `C:\Users\kepne\projects\L - PVTKRRX\SPEC.MD`

## Overview

PVTKRRX is a Stremio addon that connects users' private tracker seedbox infrastructure to Stremio for streaming. It's a pure API matchmaker — zero content proxying, fully stateless, free to host.

## Goals

- [x] Sports catalog (category 5060) — unique differentiator, #1 priority
- [x] Movies & TV via IMDb matching through Jackett/Prowlarr
- [x] Seedbox Library browsing (qBittorrent completed downloads)
- [x] AES-256-GCM encrypted config in addon URL
- [x] Zero operational cost (Vercel Hobby tier)
- [x] Prowlarr support via shared Torznab protocol

## User Stories

- As a private tracker user, I want to browse sports content from my trackers in Stremio
- As a seedbox owner, I want to stream already-downloaded content directly from my seedbox
- As a user, I want to search for movies/TV and have them automatically download to my seedbox
- As a user, I want to configure my seedbox details once and have them securely encrypted

## Technical Requirements

- **Framework:** stremio-addon-sdk + Express (clockrr pattern)
- **Hosting:** Vercel Hobby tier (serverless)
- **Language:** JavaScript/Node.js (CommonJS)
- **Dependencies:** stremio-addon-sdk, express, fast-xml-parser (3 total)
- **Encryption:** AES-256-GCM with SHA-256 key derivation
- **Entry Point:** Single index.js with Express + SDK router

## MVP Features (v1)

1. Configuration page with provider presets and connection testing
2. Sports catalog with browse, search, and genre filters
3. Movies catalog with IMDb matching via Cinemeta + Jackett
4. TV catalog with season/episode resolution
5. Seedbox Library catalog (qBittorrent completed downloads)
6. Stream resolution with on-seedbox detection
7. Torrent name parsing for rich stream descriptions
8. AES-256-GCM encrypted config tokens
9. Vercel deployment with single env var

## Future Features (v2+)

- TheSportsDB metadata enrichment for sports content
- Subtitle detection (.srt files)
- Multiple seedbox support
- Tracker health dashboard
- Smart quality preferences
- Ratio protection warnings

## Design Requirements

- Config page: Dark theme matching Stremio aesthetic
- Stream names: Emoji-based status (⚡ On Seedbox, 📥 Available, ⏳ Downloading)
- Provider presets: Feral, Whatbox, Ultra.cc, Seedhost, RapidSeedbox, etc.

## Concept Meeting Documents

| Document | Purpose |
|----------|---------|
| [CLIENT_DRIVERS.md](CLIENT_DRIVERS.md) | Client motivations, decisions, MD directives |
| [SCOPE_OF_WORKS.md](SCOPE_OF_WORKS.md) | Deliverables, timeline, acceptance criteria |
| [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) | Architecture, APIs, security, performance |
| [COMMERCIAL_SPEC.md](COMMERCIAL_SPEC.md) | Costs, scale projections, efficiency |
| [PRODUCTION_SPEC.md](PRODUCTION_SPEC.md) | Build order, file structure, deployment |

---

*Updated: February 8, 2026 — Concept Meeting Output*
