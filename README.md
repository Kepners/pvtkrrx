# PVTKRRX

Private tracker and seedbox content inside Stremio.

No debrid. No third-party media host. Your hardware, your trackers.

## What This Is

PVTKRRX is a Stremio addon system that connects your own media infrastructure to Stremio.

You bring:

- Prowlarr or another Torznab-compatible search service
- qBittorrent with WebUI enabled
- Stremio
- a Windows host, seedbox, VPS, or public playback endpoint depending on the route

PVTKRRX handles the bridge:

1. Stremio asks PVTKRRX for movies, TV, sports, or library rows.
2. PVTKRRX searches your configured trackers through Prowlarr.
3. PVTKRRX checks qBittorrent for already-downloaded files.
4. The selected route decides whether playback is served locally, through your home host, or through public seedbox endpoints.

PVTKRRX does not host your media and does not replace your private tracker or seedbox setup.

## What The Website Does

`https://www.pvtkrrx.cc` is the public guide, bootstrap, and hosted relay surface.

Use it for:

- reading the setup guide
- downloading or bootstrapping the app
- hosted LAN Bridge relay/token flows
- hosted Remote Seedbox token flows when your endpoints are public

Do not treat the public website as the default place to paste private localhost details. Configure private local setups on the machine that owns the runtime:

- Windows host: `http://127.0.0.1:7000/configure`
- self-host server: `https://your-domain/configure`

## Route Choice

Choose the route based on where playback actually happens.

| Route | Use It For | Configure It At | Playback Rule |
|---|---|---|---|
| PC Local | The Windows PC running PVTKRRX | `http://127.0.0.1:7000/configure` | Same-PC only. Uses the local runtime and built-in `/file` / `/playback` routes. |
| LAN Bridge | TV, phone, web, Apple TV, and other home devices on the same Stremio account | Windows host configure page | The hosted relay redirects back to the live Windows host while it is online at home. Away-from-home fallback needs public/linked cloud endpoints. |
| Remote Seedbox | Away-from-home or seedbox-first playback | Public hosted token or your own self-host server | Public hosted relay is ready-file-first. Self-hosted server mode can be playback-capable when it can read/serve the files. |

Older/internal notes may still say `Hybrid Home`. Treat that as the current LAN Bridge home-device route unless a document explicitly says it means the old strict LAN-only profile.

## How To Use It

### Windows Host

Use this when your Windows PC is the playback bridge.

1. Install the current Windows release from GitHub Releases.
2. Start PVTKRRX on the Windows PC.
3. Open `http://127.0.0.1:7000/configure`.
4. Enter your Prowlarr and qBittorrent details.
5. Install `PC Local` in Stremio Desktop on that same Windows PC.
6. Use `LAN Bridge` for your other home devices on the same Stremio account.

For PC Local and LAN Bridge, the built-in file server can serve completed local files when the runtime can read qBittorrent's download directory. You do not need a separate third-party file server just to get started on those routes.

### Self-Hosted Server

Use this when your own server or seedbox should own the runtime and keep operating without the PVTKRRX hosted relay in the request path.

```bash
curl -fsSL https://www.pvtkrrx.cc/install-selfhost.sh | sudo bash
```

The installer sets up the app, Node runtime, production dependencies, saved server config, optional `systemd` service, and a stable `/selfhost/manifest.json?mode=hosted` install path. That self-host install uses its own Stremio addon id, separate from hosted Remote Seedbox token installs.

Self-hosted server mode can use private or localhost Prowlarr/qBittorrent URLs after server-admin authentication, but the Stremio-facing install origin still needs a real public HTTPS hostname.

## Release Tags

Release numbering is app-aligned. The Windows/desktop release uses `vX.Y.Z`; the paired self-host/seedbox release uses `vX.Y.Z-selfhost`. For example, app version `1.1.44` is released as `v1.1.44` and `v1.1.44-selfhost`.

Older `v1.12.x-selfhost` tags are legacy compatibility tags from the previous self-host-only counter. They are kept so pinned installer commands do not break, but new installs and updates should use the app-aligned self-host tag.

### Hosted Remote Seedbox

Use this only when playback endpoints are intentionally public and reachable over HTTPS.

The hosted public relay does not proxy video bytes and does not queue-and-buffer local-only tracker playback. It is effectively a ready-file route unless you run PVTKRRX on a playback-capable self-hosted runtime.

## Billing And Unlocks

PVTKRRX does not currently require payment before the stream addon works.

Current behavior:

- PVTKRRX stream routes are free on the tested paths.
- Stremio account linking is used for account-aware route setup and LAN Bridge/cloud fallback, not as a payment gate.
- The self-host server password opens private server administration on your own runtime. It is not a paid service login.
- SportsMeta is a separate companion sports identity/artwork service at `https://sportsmeta.pvtkrrx.cc`.
- `https://www.pvtkrrx.cc/sports` is the public PVTKRRX-facing Sports Posters page. Its checkout buttons create SportsMeta Stripe Checkout sessions through a narrow proxy, while SportsMeta still owns member tokens, entitlement checks, and premium artwork routes.
- SportsMeta paid member routes are separate from the PVTKRRX stream addon. PVTKRRX stays free and its `/sports-artwork/...png` proxy consumes only public/root SportsMeta artwork; paid poster bytes and member tokens stay on the SportsMeta member addon.

Practical answer: to use PVTKRRX, configure your own Prowlarr/qBittorrent setup and install the route that matches your playback path. There is no in-app purchase step to complete first.

## What Appears In Stremio

All routes expose the same addon family:

- sports discovery catalogs
- movies
- TV series
- qBittorrent library items

The route changes playback capability, not the catalog family.

Important playback differences:

- PC Local can serve files and queue/buffer through the local runtime.
- LAN Bridge can do the same after the hosted relay redirects to the live Windows host.
- Hosted Remote Seedbox only works with public ready-file playback paths.
- Self-hosted Remote Seedbox can be playback-capable when the server can read the files and serve `/file` / `/playback`.

## Local Development

```bash
npm install
$env:ENCRYPTION_SECRET = "replace-with-a-long-local-secret"
npm start
```

Then open:

- configure: `http://127.0.0.1:7000/configure`
- root bootstrap manifest: `http://127.0.0.1:7000/manifest.json`
- PC Local manifest: `http://127.0.0.1:7000/local/manifest.json?mode=local`

Useful scripts:

```bash
npm run smoke:config
npm run smoke:guards
npm run smoke:pipeline
npm run smoke:lan-pair
npm run smoke:selfhost
npm run smoke:security
npm run smoke:desktop
npm run dist:win
```

See [docs/TESTING.md](docs/TESTING.md) for the current verification guide.

Hosted relay deployments should set `PVTKRRX_HOSTED_RELAY=true`. That keeps the public relay in guide/token mode and prevents it from serving local-only `/file` or `/playback` routes.

## Repository Map

| Path | Purpose |
|---|---|
| `index.js` | Main Express and Stremio addon server |
| `src/handlers/` | Catalog, metadata, stream, and sports artwork handlers |
| `src/clients/` | Prowlarr, qBittorrent, Cinemeta, and SportsMeta clients |
| `src/utils/` | Route, playback, storage, auth, security, and parsing helpers |
| `public/` | Public guide pages and shared configure UI |
| `electron/` | Windows desktop wrapper |
| `scripts/` | Installer, smoke checks, release, and build scripts |
| `dist/releases/` | Versioned Windows release artifacts currently tracked for published releases |
| `docs/` | Current architecture, route, status, testing, and historical notes |

## Documentation Canon

Read these first when checking current behavior:

- [docs/CURRENT_DESIGN.md](docs/CURRENT_DESIGN.md) - canonical current behavior
- [docs/ROUTE_FRAMEWORK.md](docs/ROUTE_FRAMEWORK.md) - install route rules
- [docs/STREMIO_INSTALL_TRACKER.md](docs/STREMIO_INSTALL_TRACKER.md) - verified Stremio client behavior
- [ARCHITECTURE.md](ARCHITECTURE.md) - component and runtime structure
- [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) - current verification state and remaining caveats

Archived or historical notes should not override those files.

## Current Caveats

- Route naming drift still exists in older docs and some internal code names.
- Hosted Remote Seedbox is not proof of full cloud playback; it needs public ready-file endpoints.
- Public `http://192.168.x.x:7000/...` addon installs are not a stable Stremio path. Use `127.0.0.1` for same-PC PC Local, or use the hosted LAN Bridge install path for other home devices.
- Public remote/auth-protected playback still needs real-client proof before being described as fully signed off.
- The package currently references a license file that is not present in the repository. Do not invent license wording without an owner decision.
