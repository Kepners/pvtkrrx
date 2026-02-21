const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode } = require('../utils/parser')
const { mapPath } = require('../utils/pathMapper')
const { buildOnSeedboxStream, buildOnTrackerStream, findVideoFile, findEpisodeFile, sortStreams } = require('../utils/streams')

// Build URL for a local file — uses PVTKRRX built-in file server when no external fileServerUrl set
function buildFileUrl(config, configToken, addonUrl, hash, savePath, fileName) {
  if (config.fileServerUrl) {
    return mapPath(savePath, fileName, config.fileServerUrl, config.pathMapping)
  }
  const info = Buffer.from(JSON.stringify({ h: hash.toLowerCase(), p: fileName })).toString('base64url')
  return `${addonUrl}/${configToken}/file/${info}`
}

async function handleStream(config, type, id, addonUrl, configToken) {
  try {
    if (id.startsWith('pvtkrrx:')) {
      return await handleCustomStream(config, id, addonUrl, configToken)
    }

    if (id.startsWith('tt')) {
      return await handleImdbStream(config, type, id, addonUrl, configToken)
    }

    return { streams: [] }
  } catch (err) {
    return { streams: [] }
  }
}

// Indexers that only carry sports content — never relevant for movie/TV IMDB searches.
const SPORTS_ONLY_INDEXERS = new Set([
  'SportsCult',
  'BeyondHD-Sports',
  'TVVault-Sports'
])

// Keep only results where the significant words from the query appear in the result title.
// Prevents sports indexers returning F1/Olympics results when searching for a movie.
function titleRelevant(resultTitle, queryTitle) {
  const stopwords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or'])
  const clean = s => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w))
  const queryWords = clean(queryTitle)
  if (queryWords.length === 0) return true
  const resultLower = resultTitle.toLowerCase()
  return queryWords.every(w => resultLower.includes(w))
}

async function handleImdbStream(config, type, id, addonUrl, configToken) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)

  // Parse series ID: tt1234567:1:5 → { imdbId, season, episode }
  let imdbId = id, season = null, episode = null
  if (type === 'series') {
    const parts = id.split(':')
    imdbId = parts[0]
    season = parts[1] ? parseInt(parts[1], 10) : null
    episode = parts[2] ? parseInt(parts[2], 10) : null
  }

  const cats = type === 'series' ? TV_CATS : MOVIE_CATS
  const searchType = type === 'series' ? 'series' : 'movie'

  console.log(`[stream] ${type} ${id} → imdbId=${imdbId} season=${season} ep=${episode}`)

  // Parallel: IMDB search + qBit completed torrents + Cinemeta title lookup
  // Cinemeta runs in parallel so it adds zero latency on the happy path.
  // We always need the title to filter out sports content that leaks from non-movie indexers.
  const cinemeta = new CinemetaClient()
  const [jackettResult, qbitResult, cinemetaResult] = await Promise.allSettled([
    torznab.searchImdb(imdbId, cats, searchType),
    qbit.torrents('completed'),
    type === 'series' ? cinemeta.getSeries(imdbId) : cinemeta.getMovie(imdbId)
  ])

  let jackettItems = jackettResult.status === 'fulfilled' ? jackettResult.value : []
  const qbitTorrents = qbitResult.status === 'fulfilled' ? qbitResult.value : []
  const contentTitle = cinemetaResult.status === 'fulfilled' ? cinemetaResult.value?.name : null

  console.log(`[stream] IMDB search returned ${jackettItems.length} results, qBit has ${qbitTorrents.length} completed, title="${contentTitle}"`)
  if (jackettResult.status === 'rejected') console.error('[stream] Prowlarr IMDB error:', jackettResult.reason?.message)
  if (qbitResult.status === 'rejected') console.error('[stream] qBit error:', qbitResult.reason?.message)

  // Apply sports exclusion + title filter to IMDB results immediately.
  // Private trackers often declare type=movie capability but ignore the imdbId, returning their
  // full library. The filter strips those out. We then check if anything useful survived before
  // deciding whether to fall back to a title search.
  function applyFilters(items) {
    items = items.filter(item => !SPORTS_ONLY_INDEXERS.has(item.indexer))
    if (contentTitle) {
      const before = items.length
      items = items.filter(item => titleRelevant(item.title, contentTitle))
      if (items.length < before) {
        console.log(`[stream] Title filter removed ${before - items.length} irrelevant results (${items.length} kept)`)
      }
    }
    return items
  }

  jackettItems = applyFilters(jackettItems)

  // Fallback: title search if IMDB search returned nothing useful after filtering.
  // Use generic type=search — private trackers (HD-Torrents, SpeedCD) only support type=search.
  if (jackettItems.length === 0 && contentTitle) {
    try {
      console.log(`[stream] Falling back to title search: "${contentTitle}"`)
      const fallbackItems = await torznab.search(contentTitle, cats)
      jackettItems = applyFilters(fallbackItems)
      console.log(`[stream] Title search returned ${jackettItems.length} results after filtering`)
    } catch (e) {
      console.error('[stream] Title fallback error:', e.message)
    }
  }

  // Filter by episode if series
  const filtered = (season && episode)
    ? jackettItems.filter(item => matchesEpisode(item.title, season, episode))
    : jackettItems

  // Build hash lookup from qBit
  const qbitMap = new Map()
  for (const t of qbitTorrents) {
    qbitMap.set(t.hash.toLowerCase(), t)
  }

  const streams = []
  for (const item of filtered) {
    // Private trackers don't return infohashes — allow items through if they have a download link
    if (!item.infohash && !item.link) continue
    const parsed = parse(item.title)
    const matched = item.infohash ? qbitMap.get(item.infohash) : null

    if (matched) {
      // On seedbox — get files for URL and videoSize
      try {
        const files = await qbit.files(matched.hash)
        const videoFile = (season && episode)
          ? findEpisodeFile(files, season, episode)
          : findVideoFile(files)
        const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
        streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed))
      } catch (e) {
        // File listing failed, skip this stream
      }
    } else if (item.link) {
      // On tracker — playback URL (works with or without infohash)
      const info = Buffer.from(JSON.stringify({
        h: item.infohash || '',
        l: item.link
      })).toString('base64url')
      streams.push(buildOnTrackerStream(item, `${addonUrl}/${configToken}/playback/${info}`, parsed))
    }
  }

  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

async function handleCustomStream(config, id, addonUrl, configToken) {
  const encoded = id.replace('pvtkrrx:', '')
  const info = JSON.parse(Buffer.from(encoded, 'base64url').toString())

  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const torrents = await qbit.torrents('completed')
  const matched = torrents.find(t => t.hash.toLowerCase() === info.h)

  const parsed = parse(info.t)
  const streams = []

  if (matched) {
    // Already on seedbox
    try {
      const files = await qbit.files(matched.hash)
      const videoFile = findVideoFile(files)
      const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
      streams.push(buildOnSeedboxStream(
        { title: info.t, size: info.s, seeders: info.d },
        fileUrl, videoFile.name, videoFile.size, config, parsed
      ))
    } catch (e) {
      // File listing failed
    }
  } else {
    // Not on seedbox — re-search Jackett to get download link
    try {
      const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
      const results = await torznab.search(info.t, SPORT_CATS)
      const match = results.find(r => r.infohash === info.h)
      if (match) {
        const playbackInfo = Buffer.from(JSON.stringify({
          h: match.infohash,
          l: match.link
        })).toString('base64url')
        streams.push(buildOnTrackerStream(
          match, `${addonUrl}/${configToken}/playback/${playbackInfo}`, parsed
        ))
      }
    } catch (e) {
      // Re-search failed
    }
  }

  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

module.exports = { handleStream }
