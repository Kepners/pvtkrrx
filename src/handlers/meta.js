const { CinemetaClient } = require('../clients/cinemeta')
const { formatSize } = require('../utils/streams')
const { makeSportsThumbUrl } = require('../utils/sportsThumb')
const BRAND_POSTER = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'

async function handleMeta(config, type, id, context = {}) {
  try {
    // Custom ID (sports, library)
    if (id.startsWith('pvtkrrx:')) {
      return handleCustomMeta(id, context)
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

function handleCustomMeta(id, context = {}) {
  const encoded = id.replace('pvtkrrx:', '')
  const info = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  const baseUrl = String(context.baseUrl || '').replace(/\/+$/, '')
  const poster = String(info.y || 'tv') === 'tv' && baseUrl
    ? makeSportsThumbUrl(baseUrl, { title: info.t, publishDate: info.p })
    : BRAND_POSTER

  return {
    meta: {
      id,
      type: String(info.y || 'tv'),
      name: info.t,
      description: `${info.d} seeders | ${formatSize(info.s)}`,
      poster
    }
  }
}

module.exports = { handleMeta }
