const pkg = require('../../package.json')
const { buildSportsCatalogManifestEntries } = require('./sportsCatalogs')

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
  const bootstrapDescription = guideOnlyBootstrap
    ? 'Configure-first entry for PVTKRR. Use the Windows host or your self-host server to connect Prowlarr/qBittorrent, then install the generated PC Local, LAN Bridge, or Remote Seedbox route manifest. This entry intentionally exposes no catalogs or streams.'
    : selfHostServerMode
      ? `Configure-first entry for the self-host server. Open ${configureUrl}, save the Remote Seedbox route on this server, then install the generated route manifest. This entry intentionally exposes no catalogs or streams.`
      : desktopLocalOnly
        ? `Configure-first entry for the Windows desktop runtime. Open ${configureUrl}, connect Prowlarr/qBittorrent, then install PC Local or LAN Bridge from the generated route manifest. This entry intentionally exposes no catalogs or streams.`
        : `Configure-first entry for PVTKRR. Open ${configureUrl}, connect Prowlarr/qBittorrent, then install PC Local, LAN Bridge, or Remote Seedbox from the generated route manifest. This entry intentionally exposes no catalogs or streams.`
  return {
    id: 'com.kepners.pvtkrrx.bootstrap',
    version: manifest.version,
    name: manifest.name,
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

module.exports = manifest
