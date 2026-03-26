# Codex Note: Configure Page Refactor

## What's changing

### 1. Rename "Options" tab → "Settings"
The Options service tab in `public/configure.html` is being renamed to **Settings** to better reflect its purpose as a preferences panel vs connection details.

### 2. Move TheSportsDB fields from Prowlarr tab → Settings tab
- **TheSportsDB API Key** and **TheSportsDB Cache Hours** are sports enrichment preferences, not Prowlarr connection details.
- They are being relocated from the Prowlarr service card into the Settings service card.
- The Prowlarr tab now only contains: Base URL + API Key (pure connection fields).

### 3. Clean tab separation
After this refactor, tabs follow a clear pattern:
- **Prowlarr** = URL + API Key (connection)
- **qBittorrent** = URL + credentials (connection)
- **Storage** = fallback roots (connection)
- **File Server** = seedbox URLs + path mapping (connection)
- **Settings** = max results, local hostname, auto-delete, TheSportsDB API key, TheSportsDB cache TTL (preferences)

### 4. Code dedup noted but NOT done yet
The following duplications were identified but are **not being changed in this pass** to keep the diff small and safe:
- `isPrivateInstallHost()` / `canQueryLocalRuntime()` / `isPrivateHostname()` — three near-identical private-network checks
- `setStatus()` / `setStremioLinkStatus()` / `setPairStatusNote()` — three status display mechanisms
- Multiple clipboard copy helpers with identical patterns
- `setActiveLocalHostname` + `setInstallModeHint` always called as a pair in 7 places

## Files changed
- `public/configure.html` — tab rename + field relocation
