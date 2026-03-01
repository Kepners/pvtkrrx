const fs = require('fs')
const path = require('path')
const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode, isLikelyPackedReleaseTitle } = require('../utils/parser')
const { mapPath } = require('../utils/pathMapper')
const { buildOnSeedboxStream, buildOnBufferingStream, buildOnTrackerStream, findVideoFile, findEpisodeFile, sortStreams } = require('../utils/streams')
const STREAM_UPSTREAM_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_STREAM_UPSTREAM_TIMEOUT_MS || '7000', 10))
const STREAM_TITLE_FALLBACK_TIMEOUT_MS = Math.max(1500, parseInt(process.env.PVTKRRX_STREAM_TITLE_FALLBACK_TIMEOUT_MS || '5000', 10))
const STREAM_MAX_CANDIDATES = Math.max(5, parseInt(process.env.PVTKRRX_STREAM_MAX_CANDIDATES || '20', 10))
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL)

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
  if (IS_VERCEL_RUNTIME) {
    if (config.fileServerUrl) {
      return mapPath(savePath, fileName, config.fileServerUrl, config.pathMapping)
    }
    return null
  }

  // Prefer built-in serving when the addon can read the file locally.
  // This prevents stale external fileServerUrl values from causing black screens on local installs.
  if (config.fileServerUrl && !canServeFromLocalDisk(savePath, fileName)) {
    return mapPath(savePath, fileName, config.fileServerUrl, config.pathMapping)
  }
  const info = Buffer.from(JSON.stringify({ h: hash.toLowerCase(), p: fileName })).toString('base64url')
  return `${addonUrl}/${configToken}/file/${info}`
}

function settleWithTimeout(promise, timeoutMs, fallbackValue) {
  const timeout = Math.max(500, Number.parseInt(String(timeoutMs || 0), 10) || 0)
  if (!timeout) {
    return Promise.resolve(promise)
      .then(value => ({ value, timedOut: false, error: null }))
      .catch(error => ({ value: fallbackValue, timedOut: false, error }))
  }

  return new Promise(resolve => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve({ value: fallbackValue, timedOut: true, error: null })
    }, timeout)

    Promise.resolve(promise)
      .then((value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value, timedOut: false, error: null })
      })
      .catch((error) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ value: fallbackValue, timedOut: false, error })
      })
  })
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

function scoreCandidate(item) {
  const title = String(item?.title || '')
  let quality = 0
  if (/2160p/i.test(title)) quality = 3
  else if (/1080p/i.test(title)) quality = 2
  else if (/720p/i.test(title)) quality = 1
  const seeders = Math.max(0, Number(item?.seeders || 0))
  const sizeGb = Math.max(0, Number(item?.size || 0)) / 1e9
  return (
    (seeders * 1000000) +
    (quality * 10000) +
    Math.min(sizeGb, 500)
  )
}

function hasActiveSeeders(item) {
  return Number(item?.seeders || 0) > 0
}

function preferSeededResults(items, contextLabel, keepZeroSeederPredicate = null) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) return list

  const preferred = []
  const delayed = []
  for (const item of list) {
    const keepNearTop = hasActiveSeeders(item) || (
      typeof keepZeroSeederPredicate === 'function' && keepZeroSeederPredicate(item)
    )
    if (keepNearTop) preferred.push(item)
    else delayed.push(item)
  }

  if (preferred.length === 0 || delayed.length === 0) return list
  if (delayed.length > 0) {
    console.log(`[stream] ${contextLabel}: moved ${delayed.length} zero-seeder source(s) to the end`)
  }
  return [...preferred, ...delayed]
}

function similarTitle(candidateTitle, targetTitle) {
  const candidate = normalizeForMatch(candidateTitle)
  const target = normalizeForMatch(targetTitle)
  if (!candidate || !target) return false
  if (candidate === target || candidate.includes(target) || target.includes(candidate)) return true

  const words = target.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return false
  const hits = words.reduce((acc, word) => acc + (candidate.includes(word) ? 1 : 0), 0)
  return hits >= Math.max(2, Math.ceil(words.length * 0.6))
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
  const [jackettResult, qbitResult, cinemetaResult] = await Promise.all([
    settleWithTimeout(torznab.searchImdb(imdbId, cats, searchType), STREAM_UPSTREAM_TIMEOUT_MS, []),
    settleWithTimeout(qbit.torrents('all'), STREAM_UPSTREAM_TIMEOUT_MS, []),
    settleWithTimeout(
      type === 'series' ? cinemeta.getSeries(imdbId) : cinemeta.getMovie(imdbId),
      STREAM_UPSTREAM_TIMEOUT_MS,
      null
    )
  ])

  let jackettItems = Array.isArray(jackettResult.value) ? jackettResult.value : []
  const qbitTorrents = Array.isArray(qbitResult.value) ? qbitResult.value : []
  const contentTitle = cinemetaResult.value?.name || null

  console.log(`[stream] IMDB search returned ${jackettItems.length} results, qBit has ${qbitTorrents.length} torrents, title="${contentTitle}"`)
  if (jackettResult.timedOut) console.warn(`[stream] Prowlarr IMDB lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (qbitResult.timedOut) console.warn(`[stream] qBit torrent lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (cinemetaResult.timedOut) console.warn(`[stream] Cinemeta lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (jackettResult.error) console.error('[stream] Prowlarr IMDB error:', jackettResult.error?.message)
  if (qbitResult.error) console.error('[stream] qBit error:', qbitResult.error?.message)
  if (cinemetaResult.error) console.error('[stream] Cinemeta error:', cinemetaResult.error?.message)

  // Apply sports exclusion + title filter to IMDB results immediately.
  // Private trackers often declare type=movie capability but ignore the imdbId, returning their
  // full library. The filter strips those out. We then check if anything useful survived before
  // deciding whether to fall back to a title search.
  function applyFilters(items) {
    items = items.filter(item => !isSportsOnlyIndexer(item.indexer))
    const beforePacked = items.length
    items = items.filter(item => !isLikelyPackedReleaseTitle(item.title))
    if (items.length < beforePacked) {
      console.log(`[stream] Packed-release filter removed ${beforePacked - items.length} source(s)`)
    }
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
    console.log(`[stream] Falling back to title search: "${contentTitle}"`)
    const fallbackResult = await settleWithTimeout(
      torznab.search(contentTitle, cats),
      STREAM_TITLE_FALLBACK_TIMEOUT_MS,
      []
    )
    const fallbackItems = Array.isArray(fallbackResult.value) ? fallbackResult.value : []
    if (fallbackResult.timedOut) {
      console.warn(`[stream] Title fallback timed out after ${STREAM_TITLE_FALLBACK_TIMEOUT_MS}ms`)
    }
    if (fallbackResult.error) {
      console.error('[stream] Title fallback error:', fallbackResult.error?.message)
    }
    jackettItems = applyFilters(fallbackItems)
    console.log(`[stream] Title search returned ${jackettItems.length} results after filtering`)
  }

  // Filter by episode if series
  let filtered = (season && episode)
    ? jackettItems.filter(item => matchesEpisode(item.title, season, episode))
    : jackettItems

  // Build hash lookup from qBit
  const qbitMap = new Map()
  for (const t of qbitTorrents) {
    qbitMap.set(t.hash.toLowerCase(), t)
  }

  filtered = preferSeededResults(filtered, 'imdb candidates', (item) => {
    const hash = String(item?.infohash || '').toLowerCase()
    if (!hash) return false
    return qbitMap.has(hash)
  })

  if (filtered.length > STREAM_MAX_CANDIDATES) {
    console.log(`[stream] Candidate cap applied: ${STREAM_MAX_CANDIDATES}/${filtered.length}`)
  }

  const streams = []
  for (const item of filtered.slice(0, STREAM_MAX_CANDIDATES)) {
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
        if (!videoFile?.name) continue
        const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
        if (!fileUrl) continue
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
    try {
      const files = await qbit.files(matched.hash)
      const videoFile = findVideoFile(files)
      if (!videoFile?.name) throw new Error('No playable video in matched torrent')

      const fileUrl = buildFileUrl(config, configToken, addonUrl, matched.hash, matched.save_path, videoFile.name)
      if (!fileUrl) throw new Error('Hosted mode requires fileServerUrl for on-seedbox streams')
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
  }

  if (streams.length === 0 && directLink) {
    const playbackInfo = Buffer.from(JSON.stringify({
      h: infoHash,
      l: directLink
    })).toString('base64url')
    streams.push(buildOnTrackerStream(
      { title: info.t, size: info.s, seeders: info.d, indexer: info.i || '' },
      `${addonUrl}/${configToken}/playback/${playbackInfo}`,
      parsed
    ))
  }

  if (streams.length === 0) {
    try {
      const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
      const results = await torznab.search(info.t, SPORT_CATS)
      let filtered = results.filter(r => {
        if (!r?.link) return false
        if (infoHash && String(r.infohash || '').toLowerCase() === infoHash) return true
        if (isLikelyPackedReleaseTitle(r.title)) return false
        return similarTitle(r.title, info.t)
      })

      const seen = new Set()
      const deduped = []
      for (const item of filtered.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))) {
        const key = String(item.infohash || item.link || '').toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        deduped.push(item)
        if (deduped.length >= 20) break
      }
      const ordered = preferSeededResults(deduped, 'custom re-search')

      for (const item of ordered) {
        const playbackInfo = Buffer.from(JSON.stringify({
          h: item.infohash || '',
          l: item.link
        })).toString('base64url')
        streams.push(buildOnTrackerStream(
          item,
          `${addonUrl}/${configToken}/playback/${playbackInfo}`,
          parse(item.title || info.t)
        ))
      }
    } catch (e) {
      console.error('[stream] custom re-search failed:', e.message)
    }
  }

  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

module.exports = { handleStream }
