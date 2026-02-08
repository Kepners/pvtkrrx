# PVTKRRX - Architecture

## System Overview

```
PVTKRRX Stremio Addon
├── Manifest
│   ├── ID, name, description
│   ├── Resources: TBD
│   └── Types: movie, series
├── Handlers
│   └── TBD
└── Server
    └── Express / Stremio SDK server
```

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Stremio Addon SDK |
| Server | Express (via SDK) |
| Hosting | Local / Beamup |

## Data Flow
```
User plays content in Stremio
    → Stremio queries addon manifest
    → Addon returns available resources
    → Stremio requests resource data
    → Addon processes and returns data
    → Stremio renders result
```

## Key Design Decisions
- TBD (fill in as architecture solidifies)

---

*Created: February 8, 2026*
