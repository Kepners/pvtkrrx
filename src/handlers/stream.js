const fs = require('fs')
const path = require('path')
const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode } = require('../utils/parser')
const { mapPath } = require('../utils/pathMapper')
const { buildOnSeedboxStream, buildOnBufferingStream, buildOnTrackerStream, findVideoFile, findEpisodeFile, sortStreams } = require('../utils/streams')

// Build URL for a local file — uses PVTKRRX built-in file server when no external fileServerUrl set
function canServeFromLocalDisk(savePath, fileName) {
  if (!savePath || !fileName) return false
  try {
    return fs.existsSync(path.join(savePath, fileName))
  } catch (_) {
    return false
  }
}

function buildFileUrl(config, configToken, addonUrl, hash, savePath, fileName) {
  // Prefer built-in serving when the addon can read the file locally.
  // This prevents stale external fileServerUrl values from causing black screens on local installs.
  if (config.fileServerUrl && !canServeFromLocalDisk(savePath, fileName)) {
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
  'sportscult',
  'beyondhd-sports',
  'tvvault-sports'
])

function isSportsOnlyIndexer(indexerName) {
  const normalized = String(indexerName || '').trim().toLowerCase()
  if (SPORTS_ONLY_INDEXERS.has(normalized)) return true
  return normalized.includes('sportscult')
}

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findTorrentByTitle(torrents, targetTitle) {
  const target = normalizeForMatch(targetTitle)
  if (!target) return null

  for (const torrent of torrents) {
    const name = normalizeForMatch(torrent.name)
    if (!name) continue
    if (name === target || name.includes(target) || target.includes(name)) return torrent
  }

  const words = target.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return null

  let best = null
  let bestScore = 0
  for (const torrent of torrents) {
    const name = normalizeForMatch(torrent.name)
    const score = words.reduce((acc, word) => acc + (name.includes(word) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = torrent
    }
  }

  return bestScore >= Math.max(2, Math.ceil(words.length * 0.6)) ? best : null
}

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

function isCompletedTorrent(torrent, fileProgress = null) {
  const torrentProgress = Number(torrent?.progress || 0)
  if (torrentProgress >= 0.999) return true
  if (Number.isFinite(fileProgress) && fileProgress >= 0.999) return true
  return false
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
    qbit.torrents('all'),
    type === 'series' ? cinemeta.getSeries(imdbId) : cinemeta.getMovie(imdbId)
  ])

  let jackettItems = jackettResult.status === 'fulfilled' ? jackettResult.value : []
  const qbitTorrents = qbitResult.status === 'fulfilled' ? qbitResult.value : []
  const contentTitle = cinemetaResult.status === 'fulfilled' ? cinemetaResult.value?.name : null

  console.log(`[stream] IMDB search returned ${jackettItems.length} results, qBit has ${qbitTorrents.length} torrents, title="${contentTitle}"`)
  if (jackettResult.status === 'rejected') console.error('[stream] Prowlarr IMDB error:', jackettResult.reason?.message)
  if (qbitResult.status === 'rejected') console.error('[stream] qBit error:', qbitResult.reason?.message)

  // Apply sports exclusion + title filter to IMDB results immediately.
  // Private trackers often declare type=movie capability but ignore the imdbId, returning their
  // full library. The filter strips those out. We then check if anything useful survived before
  // deciding whether to fall back to a title search.
  function applyFilters(items) {
    items = items.filter(item => !isSportsOnlyIndexer(item.indexer))
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
      // On seedbox or buffering — get files for URL and videoSize
      try {
        const files = await qbit.files(matched.hash)
        const videoFile = (season && episode)
          ? findEpisodeFile(files, season, episode)
          : findVideoFile(files)
        const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
        const videoProgress = Number(videoFile?.progress || 0)
        if (isCompletedTorrent(matched, videoProgress)) {
          streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed))
        } else {
          const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
          streams.push(buildOnBufferingStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed, percent))
        }
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
  const infoHash = String(info.h || '').toLowerCase()
  const directLink = String(info.l || '')

  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const torrents = await qbit.torrents('all')
  let matched = infoHash ? torrents.find(t => t.hash.toLowerCase() === infoHash) : null
  if (!matched) matched = findTorrentByTitle(torrents, info.t)

  const parsed = parse(info.t)
  const streams = []

  console.log(`[stream] custom title="${info.t}" hash=${infoHash || 'none'} matched=${matched ? matched.hash : 'none'}`)

  if (matched) {
    // Already in qBit (complete or in-progress)
    try {
      const files = await qbit.files(matched.hash)
      const videoFile = findVideoFile(files)
      const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
      const item = { title: info.t, size: info.s, seeders: info.d }
      const videoProgress = Number(videoFile?.progress || 0)
      if (isCompletedTorrent(matched, videoProgress)) {
        streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed))
      } else {
        const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
        streams.push(buildOnBufferingStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed, percent))
      }
    } catch (e) {
      console.error('[stream] custom file listing failed:', e.message)
    }
  } else {
    // Not on seedbox — use embedded link from catalog if available.
    if (directLink) {
      const playbackInfo = Buffer.from(JSON.stringify({
        h: infoHash,
        l: directLink
      })).toString('base64url')
      streams.push(buildOnTrackerStream(
        { title: info.t, size: info.s, seeders: info.d, indexer: info.i || '' },
        `${addonUrl}/${configToken}/playback/${playbackInfo}`,
        parsed
      ))
      return { streams: sortStreams(streams), cacheMaxAge: 0 }
    }

    // No embedded link — re-search Prowlarr as fallback.
    try {
      const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
      const results = await torznab.search(info.t, SPORT_CATS)
      let match = null
      if (infoHash) match = results.find(r => r.infohash === infoHash)
      if (!match) {
        const normalizedTitle = normalizeForMatch(info.t)
        match = results.find(r => normalizeForMatch(r.title) === normalizedTitle)
      }
      if (match) {
        const playbackInfo = Buffer.from(JSON.stringify({
          h: match.infohash || infoHash,
          l: match.link
        })).toString('base64url')
        streams.push(buildOnTrackerStream(
          match, `${addonUrl}/${configToken}/playback/${playbackInfo}`, parsed
        ))
      }
    } catch (e) {
      console.error('[stream] custom re-search failed:', e.message)
    }
  }

  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

module.exports = { handleStream }
