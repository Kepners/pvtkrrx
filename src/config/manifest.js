const manifest = {
  id: 'com.kepners.pvtkrrx',
  version: '1.0.0',
  name: 'PVTKRRX',
  description: 'Stream from your private tracker seedbox through Stremio — sports, movies, TV, and your library.',
  logo: 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/pvtkrrx.ico',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series', 'tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'pvtkrrx-sports',
      name: 'PVTKRRX Sports',
      extra: [
        {
          name: 'genre',
          options: ['Football', 'F1', 'UFC', 'NBA', 'Cricket', 'Rugby', 'Tennis'],
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

module.exports = manifest
