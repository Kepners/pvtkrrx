const pkg = require('../../package.json')

const manifest = {
  id: 'com.kepners.pvtkrrx',
  version: pkg.version || '0.0.0',
  name: 'PVTKRRX',
  description: 'Stream from your private tracker seedbox through Stremio — sports, movies, TV, and your library.',
  logo: 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.ico',
  resources: [
    'catalog',
    'meta',
    { name: 'stream', types: ['movie', 'series', 'tv', 'sports'] }
  ],
  types: ['movie', 'series', 'tv', 'sports'],
  catalogs: [
    {
      type: 'sports',
      id: 'pvtkrrx-sports',
      name: 'Sports',
      extra: [
        {
          name: 'genre',
          options: ['Football', 'F1', 'UFC', 'NBA', 'Cricket', 'Rugby', 'Tennis', 'Boxing', 'Golf', 'Baseball', 'Cycling', 'Darts', 'Snooker'],
          isRequired: false
        },
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false }
      ]
    },
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

function createBootstrapManifest(baseUrl = '') {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '')
  const logoUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/logo.ico` : manifest.logo
  return {
    id: 'com.kepners.pvtkrrx.bootstrap',
    version: manifest.version,
    name: 'PVTKRRX (Configure)',
    description: 'Bootstrap manifest only. Open /configure and install PC Local, LAN Bridge, or Remote Seedbox from their explicit route URLs.',
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
