# Concept Meeting Session - February 8, 2026

## What Happened
- Full agent team concept meeting for PVTKRRX
- 7 agents participated (Glen, Colin, Peter, Stewart, Jason/Jasmine, Mr Gurr, Auditor)
- Client attended and provided corrections
- All key technical and commercial decisions made
- 5 output documents + 3 project file updates produced

## Client Corrections (Important for Future)
1. **SDK vs Raw Express** — Client's clockrr project proves stremio-addon-sdk + Express works on Vercel. Don't second-guess this.
2. **Stremio behavior** — Research how Stremio actually works before proposing solutions. Stremio re-queries addons naturally via cacheMaxAge.
3. **User hosting** — Client is NOT hosting anything. Each user has their own Jackett, qBit, file server. The addon is a pure bridge.

## Key Technical Findings
- Stremio has no push mechanism for stream status updates
- Existing addons (Comet, Torrentio) embed status in stream name/description with emojis
- cacheMaxAge controls how often Stremio re-queries (60s for downloading, 3600s for ready)
- behaviorHints: configurable, configurationRequired, notWebReady, bingeGroup, p2p, adult
- No behaviorHints for progress/status — text in name/description is the only way
- Sports ID encoding must NOT include API keys (security fix from original spec)

## Documents Produced
1. docs/CLIENT_DRIVERS.md
2. docs/SCOPE_OF_WORKS.md
3. docs/TECHNICAL_SPEC.md
4. docs/COMMERCIAL_SPEC.md
5. docs/PRODUCTION_SPEC.md
6. ARCHITECTURE.md (updated)
7. README.md (updated)
8. docs/SPEC.md (updated)
