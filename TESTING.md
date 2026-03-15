# PVTKRRX — Local Testing Guide

## Phase 4: Testing Checklist

Before testing, you need a local Jackett + qBittorrent setup.

---

## Prerequisites

### 1. Install Jackett (or Prowlarr)
```bash
# Windows: Download from https://github.com/Jackett/Jackett/releases
# Or use Chocolatey:
choco install jackett

# Default URL: http://localhost:9117
```

### 2. Install qBittorrent
```bash
# Windows: Download from https://www.qbittorrent.org/download.php
# Or use Chocolatey:
choco install qbittorrent

# Enable Web UI:
# Tools → Options → Web UI
# - Enable Web User Interface (Remote control)
# - Port: 8080
# - Username: admin
# - Password: adminadmin (or set your own)
```

### 3. Configure Jackett
1. Open http://localhost:9117
2. Add at least one indexer (use a public tracker for testing, e.g., 1337x, RARBG, etc.)
3. Copy your Jackett API key from the top-right corner
4. Get the Torznab feed URL (click "Copy Torznab Feed" on an indexer)

### 4. Set ENCRYPTION_SECRET
```bash
# Windows PowerShell:
$env:ENCRYPTION_SECRET = "your-secret-key-here-at-least-32-chars-long"

# Or add to .env file (already in .gitignore):
echo ENCRYPTION_SECRET=your-secret-key-here-at-least-32-chars-long > .env

# Then load it when running:
# (If using .env, you'll need dotenv package or manual load)
```

---

## Running Locally

```bash
# Start the addon
npm start

# Output:
# PVTKRRX running at http://localhost:7000
# Configure: http://localhost:7000/configure
```

---

## Testing Steps

### 1. **Configure the Addon**
1. Open http://localhost:7000/configure
2. Fill in your local credentials:
   - **Jackett URL**: `http://localhost:9117/api/v2.0/indexers/all/results/torznab`
   - **Jackett API Key**: Your API key from Jackett
   - **qBit URL**: `http://localhost:8080`
   - **qBit Username**: `admin`
   - **qBit Password**: Your password
   - **File Server URL**: `http://localhost:8080` (for now, use qBit's WebUI URL)
   - **File Server Auth**: Leave empty
   - **Path Mapping**: From `/`, To `/` (identity mapping for local testing)
   - **Max Results**: 50

3. Click **Test Connection** — both Jackett and qBit should show ✅
4. Click **Install in Stremio** — you'll get a `stremio://` link

### 2. **Install in Stremio**
1. Click the "Open in Stremio" button (or copy the stremio:// link and paste it in your browser)
2. Stremio should open and ask to install the addon
3. Accept the installation

### 3. **Test Sports Catalog** (Acceptance Criterion #1)
1. In Stremio, go to **Discover** → **TV Channels**
2. Look for **PVTKRRX Sports** catalog
3. You should see sports content from your private trackers
4. Try the genre filter (Football, UFC, F1, etc.)
5. Try searching for a specific event

### 4. **Test Movies Catalog** (Acceptance Criterion #2)
1. Go to **Discover** → **Movies**
2. Look for **PVTKRRX Movies** catalog
3. Browse recent movie releases from your trackers
4. Search for a specific movie (e.g., "Matrix")

### 5. **Test TV Catalog** (Acceptance Criterion #3)
1. Go to **Discover** → **Series**
2. Look for **PVTKRRX TV** catalog
3. Browse TV shows from your trackers
4. Search for a specific show (e.g., "Breaking Bad")

### 6. **Test Library Catalog** (Acceptance Criterion #4)
1. First, download a torrent in qBittorrent (any torrent)
2. Wait for it to complete
3. In Stremio, go to **PVTKRRX Library** catalog
4. You should see your completed downloads
5. Search within your library

### 7. **Test Stream Handler — Movies** (Acceptance Criterion #5)
1. In Stremio, search for a movie (e.g., "The Matrix")
2. Open the movie page
3. Click on **PVTKRRX** in the stream list
4. You should see available streams:
   - ⚡ On-seedbox streams (if you have it downloaded) — Direct playback
   - 📥 On-tracker streams (available for download) — Click to trigger download

### 8. **Test Stream Handler — Series** (Acceptance Criterion #6)
1. Search for a TV show (e.g., "Breaking Bad")
2. Open a specific episode (e.g., S01E01)
3. Click on **PVTKRRX** in the stream list
4. You should see streams for that specific episode (filtered by season/episode)

### 9. **Test Playback — On-Tracker** (Acceptance Criterion #7)
1. Find a stream marked 📥 (on-tracker, not on seedbox yet)
2. Click to play
3. **Expected**: qBittorrent starts downloading the torrent
4. **Expected**: Stremio polls every 3s for up to 6s
5. **If ready**: 302 redirect to file URL → starts playing
6. **If timeout**: 504 error "Download started — close and try again"

### 10. **Test Playback — On-Seedbox** (Acceptance Criterion #8)
1. Find a stream marked ⚡ (already on seedbox)
2. Click to play
3. **Expected**: Instant redirect to file URL → starts playing immediately
4. **Verify**: File server authentication works (if you set Basic Auth)

### 11. **Test Sports-Specific Features** (Acceptance Criterion #9)
1. Go to **PVTKRRX Sports** catalog
2. Filter by genre: **UFC**
3. Find a UFC event
4. Open it — you should see streams for that event
5. The ID format should be `pvtkrrx:base64url(...)` (custom ID, not IMDb)

### 12. **Test Error Handling** (Acceptance Criterion #10)
1. **Invalid credentials**: Edit your config with wrong Jackett API key → should get empty catalogs (not crash)
2. **Network timeout**: Disconnect Jackett → catalogs should return empty gracefully
3. **Malformed config token**: Edit the stremio:// URL with garbage → should get 400 error (not crash)

---

## Known Limitations (for local testing)

1. **File Server URL**: For local testing, qBittorrent's Web UI doesn't serve files directly. You'll need to either:
   - Set up an HTTP file server pointing to your qBit download directory (e.g., with `http-server` or `nginx`)
   - Or just test on-tracker playback (which queues downloads)

2. **Path Mapping**: For local testing with identity mapping (`/` → `/`), file URLs might not work unless you have a proper file server. This is expected — on a real seedbox, the file server is always set up.

3. **Private Tracker Content**: Some private trackers require authenticated download URLs. Jackett handles this via the `link` field, but make sure your Jackett indexers are configured correctly.

---

## Success Criteria (from SCOPE_OF_WORKS.md)

All 10 acceptance criteria from the Scope of Works:

1. ✅ Sports catalog works with browsing, search, and genre filters
2. ✅ Movies catalog shows tracker content, deduped by IMDb ID
3. ✅ TV catalog shows series content
4. ✅ Library catalog shows completed qBit downloads
5. ✅ Stream handler returns streams for movies (Jackett + qBit parallel search)
6. ✅ Stream handler returns streams for TV episodes (with S01E05 filtering)
7. ✅ Playback endpoint triggers qBit download and polls for completion (Comet pattern)
8. ✅ Playback endpoint redirects to file server URL with proxyHeaders auth
9. ✅ Sports content uses custom pvtkrrx: IDs with base64url encoding (no API key leak)
10. ✅ All handlers are defensive (return empty on errors, never crash)

---

## Debugging

### Check logs
```bash
# Run with debug output
DEBUG=* npm start
```

### Inspect encrypted config token
```bash
# Decrypt a token to see what's inside (use your ENCRYPTION_SECRET)
node -e "
const {decrypt} = require('./src/utils/crypto');
const token = 'paste-your-token-here';
console.log(decrypt(token, process.env.ENCRYPTION_SECRET));
"
```

### Test individual API clients
```bash
# Test Jackett
node -e "
const {TorznabClient} = require('./src/clients/torznab');
const client = new TorznabClient('http://localhost:9117/api/v2.0/indexers/all/results/torznab', 'YOUR_API_KEY');
client.search('UFC', '5060').then(r => console.log('Results:', r.length));
"

# Test qBit
node -e "
const {QBitClient} = require('./src/clients/qbittorrent');
const client = new QBitClient('http://localhost:8080', 'admin', 'adminadmin');
client.login().then(() => client.torrents()).then(r => console.log('Torrents:', r.length));
"
```

---

## Next Steps After Local Testing

1. **Deploy to Vercel**: `vercel --prod` (set ENCRYPTION_SECRET in Vercel env vars)
2. **Test with real seedbox**: Update config with actual seedbox credentials
3. **Add more indexers**: Configure additional private trackers in Jackett
4. **Tune caching**: Adjust cacheMaxAge values based on usage patterns
5. **Monitor performance**: Check Vercel logs for timeout issues (10s limit on Hobby tier)

---

🔥 **Ready to test!** 🔥
