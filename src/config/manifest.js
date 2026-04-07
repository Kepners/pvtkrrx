const pkg = require('../../package.json')
const { buildSportsCatalogManifestEntries } = require('./sportsCatalogs')

const manifest = {
  id: 'com.kepners.pvtkrrx',
  version: pkg.version || '0.0.0',
  name: 'PVTKRRX',
  description: 'Stream from your private tracker seedbox through Stremio — sports, movies, TV, and your library.',
  logo: 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.ico',
  resources: [
    'catalog',
    'meta',
    { name: 'stream', types: ['movie', 'series', 'sports'] }
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
  const bootstrapName = guideOnlyBootstrap
    ? 'PVTKRRX Website Only'
    : selfHostServerMode
      ? 'PVTKRRX Server (Setup Only)'
      : desktopLocalOnly
        ? 'PVTKRRX Desktop (Setup Only)'
        : 'PVTKRRX (Setup Only)'
  const bootstrapDescription = guideOnlyBootstrap
    ? 'Public website guide only. Configure on the Windows host that runs PVTKRRX or on your own self-host server. Do not install this root manifest as the working addon.'
    : selfHostServerMode
      ? `Setup-only bootstrap. Do not install this root manifest as the working addon. Open ${configureUrl}, save the self-hosted server Remote Seedbox route, and install it from the generated route URL.`
      : desktopLocalOnly
        ? `Setup-only bootstrap. Do not install this root manifest as the working addon. Open ${configureUrl}, configure first, then install PC Local or LAN Bridge from the generated route URL on the Windows desktop runtime.`
        : `Setup-only bootstrap. Do not install this root manifest as the working addon. Open ${configureUrl}, configure first, then install PC Local, LAN Bridge, or Remote Seedbox from the generated route URL.`
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

module.exports = manifest
