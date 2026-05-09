const pkg = require('../../package.json')
const { buildSportsCatalogManifestEntries } = require('./sportsCatalogs')

const BOOTSTRAP_MANIFEST_NAME = 'PVTKRR'
const PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION = 'Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Use the Windows host or your self-host server, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This bootstrap entry intentionally exposes no catalogs or streams.'

const manifest = {
  id: 'com.kepners.pvtkrrx',
  version: pkg.version || '0.0.0',
  name: 'PVTKRR',
  description: 'Private trackers and seedbox content inside Stremio. No debrid, no third-party media host; PVTKRR bridges your configured Prowlarr/qBittorrent setup to sports, movies, TV, and library streams.',
  logo: 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.ico',
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
  const logoUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/logo.ico` : manifest.logo
  const runtimeOptions = options && typeof options === 'object' ? options : {}
  const selfHostServerMode = runtimeOptions.selfHostServerMode === true
  const desktopLocalOnly = runtimeOptions.desktopLocalOnly === true
  const guideOnlyBootstrap = runtimeOptions.guideOnlyBootstrap === true
  // Stremio-visible lock: the public bootstrap manifest must stay named
  // "PVTKRR" and keep the SportsMeta sports-cataloguing copy asserted in
  // smoke:config and documented in AGENTS.md, CLAUDE.md, and BRAIN.md.
  const bootstrapDescription = guideOnlyBootstrap
    ? PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION
    : selfHostServerMode
      ? `Configure-first entry for the self-host server. Sports in Stremio are catalogued through SportsMeta, while this server provides the Prowlarr/qBittorrent-backed route manifest. Open ${configureUrl}, save the Remote Seedbox route on this server, then install the generated route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`
      : desktopLocalOnly
        ? `Configure-first entry for the Windows desktop runtime. Sports in Stremio are catalogued through SportsMeta, while this PC provides the Prowlarr/qBittorrent-backed route manifest. Open ${configureUrl}, then install PC Local or LAN Bridge from the generated route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`
        : `Configure-first entry for PVTKRR. Sports in Stremio are catalogued through SportsMeta, while playback still comes from your configured Prowlarr/qBittorrent setup. Open ${configureUrl}, then install PC Local, LAN Bridge, or Remote Seedbox from the generated route manifest. This bootstrap entry intentionally exposes no catalogs or streams.`
  return {
    id: 'com.kepners.pvtkrrx.bootstrap',
    version: manifest.version,
    name: BOOTSTRAP_MANIFEST_NAME,
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

Object.defineProperty(manifest, 'BOOTSTRAP_MANIFEST_NAME', {
  value: BOOTSTRAP_MANIFEST_NAME,
  enumerable: false
})

Object.defineProperty(manifest, 'PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION', {
  value: PUBLIC_BOOTSTRAP_MANIFEST_DESCRIPTION,
  enumerable: false
})

module.exports = manifest
