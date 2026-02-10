const { TorznabClient } = require('../clients/torznab')
const { QBitClient } = require('../clients/qbittorrent')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode } = require('../utils/parser')
const { mapPath } = require('../utils/pathMapper')
const { buildOnSeedboxStream, buildOnTrackerStream, findVideoFile, findEpisodeFile, sortStreams } = require('../utils/streams')

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

async function handleImdbStream(config, type, id, addonUrl, configToken) {
  const torznab = new TorznabClient(config.jackettUrl, config.jackettApiKey)
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

  // Parallel: Jackett search + qBit completed torrents
  const [jackettResult, qbitResult] = await Promise.allSettled([
    torznab.searchImdb(imdbId, cats, searchType),
    qbit.torrents('completed')
  ])

  const jackettItems = jackettResult.status === 'fulfilled' ? jackettResult.value : []
  const qbitTorrents = qbitResult.status === 'fulfilled' ? qbitResult.value : []

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
    if (!item.infohash) continue
    const parsed = parse(item.title)
    const matched = qbitMap.get(item.infohash)

    if (matched) {
      // On seedbox — get files for URL and videoSize
      try {
        const files = await qbit.files(matched.hash)
        const videoFile = (season && episode)
          ? findEpisodeFile(files, season, episode)
          : findVideoFile(files)
        const fileUrl = mapPath(matched.save_path, videoFile.name, config.fileServerUrl, config.pathMapping)
        streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed))
      } catch (e) {
        // File listing failed, skip this stream
      }
    } else {
      // On tracker — playback URL
      const info = Buffer.from(JSON.stringify({
        h: item.infohash,
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
      const fileUrl = mapPath(matched.save_path, videoFile.name, config.fileServerUrl, config.pathMapping)
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
      const torznab = new TorznabClient(config.jackettUrl, config.jackettApiKey)
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
