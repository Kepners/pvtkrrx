const { TorznabClient } = require('../clients/torznab')
const { QBitClient } = require('../clients/qbittorrent')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { cleanTitle } = require('../utils/parser')
const { formatSize } = require('../utils/streams')

// Parse Stremio extra path segment into object
// e.g. "genre=Football&search=UFC&skip=10" → { genre: 'Football', search: 'UFC', skip: '10' }
function parseExtra(extraStr) {
  if (!extraStr) return {}
  const result = {}
  const parts = extraStr.split('&')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq)
    const value = decodeURIComponent(part.slice(eq + 1))
    result[key] = value
  }
  return result
}

async function handleCatalog(config, type, id, extraStr) {
  try {
    const extra = parseExtra(extraStr)

    switch (id) {
      case 'pvtkrrx-sports':
        return await sportsCatalog(config, extra)
      case 'pvtkrrx-movies':
        return await moviesCatalog(config, extra)
      case 'pvtkrrx-tv':
        return await tvCatalog(config, extra)
      case 'pvtkrrx-library':
        return await libraryCatalog(config, extra)
      default:
        return { metas: [] }
    }
  } catch (err) {
    return { metas: [] }
  }
}

async function sportsCatalog(config, extra) {
  const torznab = new TorznabClient(config.jackettUrl, config.jackettApiKey)
  const query = extra.genre || extra.search || ''
  const items = query
    ? await torznab.search(query, SPORT_CATS)
    : await torznab.rss(SPORT_CATS)

  const skip = parseInt(extra.skip || '0', 10)
  const metas = items.slice(skip, skip + 50).map(item => ({
    id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
      t: item.title,
      h: item.infohash,
      s: item.size,
      d: item.seeders
    })).toString('base64url'),
    type: 'tv',
    name: item.title,
    description: `${item.seeders} seeders | ${formatSize(item.size)}`,
    posterShape: 'landscape'
  }))

  return { metas, cacheMaxAge: 120 }
}

async function moviesCatalog(config, extra) {
  const torznab = new TorznabClient(config.jackettUrl, config.jackettApiKey)
  const items = extra.search
    ? await torznab.search(extra.search, MOVIE_CATS)
    : await torznab.rss(MOVIE_CATS)

  const skip = parseInt(extra.skip || '0', 10)
  const seen = new Set()
  const metas = []

  for (const item of items) {
    if (item.imdbId && !seen.has(item.imdbId)) {
      seen.add(item.imdbId)
      metas.push({
        id: item.imdbId,
        type: 'movie',
        name: cleanTitle(item.title)
      })
    }
  }

  return { metas: metas.slice(skip, skip + 50), cacheMaxAge: 300 }
}

async function tvCatalog(config, extra) {
  const torznab = new TorznabClient(config.jackettUrl, config.jackettApiKey)
  const items = extra.search
    ? await torznab.search(extra.search, TV_CATS)
    : await torznab.rss(TV_CATS)

  const skip = parseInt(extra.skip || '0', 10)
  const seen = new Set()
  const metas = []

  for (const item of items) {
    if (item.imdbId && !seen.has(item.imdbId)) {
      seen.add(item.imdbId)
      metas.push({
        id: item.imdbId,
        type: 'series',
        name: cleanTitle(item.title)
      })
    }
  }

  return { metas: metas.slice(skip, skip + 50), cacheMaxAge: 300 }
}

async function libraryCatalog(config, extra) {
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const torrents = await qbit.torrents('completed')

  const skip = parseInt(extra.skip || '0', 10)
  let filtered = torrents

  if (extra.search) {
    const q = extra.search.toLowerCase()
    filtered = torrents.filter(t => t.name.toLowerCase().includes(q))
  }

  const metas = filtered.slice(skip, skip + 50).map(t => ({
    id: 'pvtkrrx:' + Buffer.from(JSON.stringify({
      t: t.name,
      h: t.hash,
      s: t.size,
      d: 0
    })).toString('base64url'),
    type: 'movie',
    name: cleanTitle(t.name),
    description: formatSize(t.size)
  }))

  return { metas, cacheMaxAge: 300 }
}

module.exports = { handleCatalog, parseExtra }
