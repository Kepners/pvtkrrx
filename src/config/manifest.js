const pkg = require('../../package.json')
const { buildSportsCatalogManifestEntries } = require('./sportsCatalogs')

// CLAUDE.md "Bootstrap Manifest Name/Description Lock" — these constants are the
// single source of truth for what Stremio shows when www.pvtkrrx.cc/manifest.json
// or the same-host bootstrap is added. The lock forbids any route, version,
// desktop, server, or marketing suffix on the name, and pins the public-guide
// description verbatim. Smoke tests (scripts/smoke-config-flow.js,
// scripts/smoke-selfhost-server.js) assert against these constants directly.
const PUBLIC_BOOTSTRAP_MANIFEST_NAME = 'PVTKRR'
const PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION = 'Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Use the Windows host or your self-host server, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This bootstrap entry intentionally exposes no catalogs or streams.'

const manifest = {
  id: 'com.kepners.pvtkrrx',
  version: pkg.version || '0.0.0',
  name: 'PVTKRR',
  description: 'Private trackers and seedbox content inside Stremio. No debrid, no third-party media host; PVTKRR bridges your configured Prowlarr/qBittorrent setup to sports, movies, TV, and library streams.',
  logo: 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg',
  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['movie', 'series', 'sports'],
      idPrefixes: ['tt', 'pvtkrrx:', 'sportsmeta:']
    },
    {
      name: 'stream',
      types: ['movie', 'series', 'sports'],
      idPrefixes: ['tt', 'pvtkrrx:', 'sportsmeta:']
    }
  ],
  types: ['movie', 'series', 'sports'],
  catalogs: [
    ...buildSportsCatalogManifestEntries(),
    {
      type: 'movie',
      id: 'pvtkrrx-movies',
      name: 'PVTKRRX Movies',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'series',
      id: 'pvtkrrx-tv',
      name: 'PVTKRRX TV',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'movie',
      id: 'pvtkrrx-library',
      name: 'PVTKRRX Library',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: true,
    configurationRequired: true
  }
}

function createBootstrapManifest(baseUrl = '', options = {}) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '')
  const configureUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/configure` : '/configure'
  // Caddy intercepts /logo.ico on www.pvtkrrx.cc and serves a 393-byte stripped
  // 64x64 SVG with Content-Type image/svg+xml. Stremio renders it, but
  // stremio-addons.net and other directory crawlers strict-check the extension
  // and can break on the mismatch. Use /logo.svg instead so the URL extension,
  // Content-Type, and bytes all agree, and the response is the full 512x512
  // brand SVG served by Express (Caddy passes it straight through).
  const logoUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/logo.svg` : manifest.logo
  const runtimeOptions = options && typeof options === 'object' ? options : {}
  const selfHostServerMode = runtimeOptions.selfHostServerMode === true
  const desktopLocalOnly = runtimeOptions.desktopLocalOnly === true
  // CLAUDE.md lock: name is exactly 'PVTKRR' for every mode. The flag-aware
  // branching used to produce "PVTKRR Setup" / "PVTKRR Server Setup" /
  // "PVTKRR Desktop Setup" — those suffixes are forbidden by the lock.
  const bootstrapName = PUBLIC_BOOTSTRAP_MANIFEST_NAME
  // CLAUDE.md lock: the public-facing description is the verbatim locked text.
  // Self-host and desktop runtimes carry mode-specific copy with a configureUrl,
  // which is explicitly outside the lock because those routes serve a different
  // device class (an admin who already chose self-host / desktop, not a Stremio
  // user adding the addon from the public site).
  const bootstrapDescription = selfHostServerMode
    ? `Configure-first entry for the self-host server. Open ${configureUrl}, save the Remote Seedbox route on this server, then install the generated route manifest. This entry intentionally exposes no catalogs or streams.`
    : desktopLocalOnly
      ? `Configure-first entry for the Windows desktop runtime. Open ${configureUrl}, connect Prowlarr/qBittorrent, then install PC Local or LAN Bridge from the generated route manifest. This entry intentionally exposes no catalogs or streams.`
      : PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION
  return {
    id: 'com.kepners.pvtkrrx.bootstrap',
    version: manifest.version,
    name: bootstrapName,
    description: bootstrapDescription,
    logo: logoUrl,
    resources: [],
    types: [],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: true
    }
  }
}

Object.defineProperty(manifest, 'createBootstrapManifest', {
  value: createBootstrapManifest,
  enumerable: false
})
Object.defineProperty(manifest, 'PUBLIC_BOOTSTRAP_MANIFEST_NAME', {
  value: PUBLIC_BOOTSTRAP_MANIFEST_NAME,
  enumerable: false
})
Object.defineProperty(manifest, 'PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION', {
  value: PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
  enumerable: false
})

module.exports = manifest
