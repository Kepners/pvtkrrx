const { CinemetaClient } = require('../clients/cinemeta')
const { formatSize } = require('../utils/streams')

async function handleMeta(config, type, id) {
  try {
    // Custom ID (sports, library)
    if (id.startsWith('pvtkrrx:')) {
      return handleCustomMeta(id)
    }

    // IMDb ID — proxy to Cinemeta
    if (id.startsWith('tt')) {
      const cinemeta = new CinemetaClient()
      const meta = type === 'series'
        ? await cinemeta.getSeries(id)
        : await cinemeta.getMovie(id)
      return { meta }
    }

    return { meta: null }
  } catch (err) {
    return { meta: null }
  }
}

function handleCustomMeta(id) {
  const encoded = id.replace('pvtkrrx:', '')
  const info = JSON.parse(Buffer.from(encoded, 'base64url').toString())

  return {
    meta: {
      id,
      type: 'tv',
      name: info.t,
      description: `${info.d} seeders | ${formatSize(info.s)}`
    }
  }
}

module.exports = { handleMeta }
