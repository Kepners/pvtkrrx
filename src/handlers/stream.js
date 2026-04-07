const fs = require('fs')
const path = require('path')
const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { normalizeTeamName } = require('../clients/sportsdb')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode, isLikelyPackedReleaseTitle, cleanTitle } = require('../utils/parser')
const { isSportsOnlyIndexer } = require('../utils/sportsIndexers')
const { buildOnSeedboxStream, buildOnBufferingStream, buildOnArchiveStream, buildOnTrackerStream, buildInfoStream, findVideoFile, findPackedArchiveFiles, arePackedArchiveFilesReady, findEpisodeFile, sortStreams } = require('../utils/streams')
const { encodePlaybackStateToken, encodeFileStateToken } = require('../utils/opaqueState')
const { parseSportsTitle } = require('../utils/sportsTitleParser')
const { buildPlaybackFileUrl, canEmitTrackerPlayback, getTrackerPlaybackRestriction } = require('../utils/fileServing')
const { decodeCustomId } = require('../utils/customId')
const { isCompletedTorrent } = require('../utils/torrentState')
const { fetchTorrentPayload, inspectTorrentPayload } = require('../utils/torrentPayload')
const { findExtractedArchiveVideoPath, ensurePackedArchiveExtracted } = require('../utils/archiveExtraction')

const STREAM_UPSTREAM_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_STREAM_UPSTREAM_TIMEOUT_MS || '7000', 10))
const STREAM_TITLE_FALLBACK_TIMEOUT_MS = Math.max(1500, parseInt(process.env.PVTKRRX_STREAM_TITLE_FALLBACK_TIMEOUT_MS || '5000', 10))
const STREAM_MAX_CANDIDATES = Math.max(5, parseInt(process.env.PVTKRRX_STREAM_MAX_CANDIDATES || '20', 10))
const TRACKER_LINK_INSPECTION_TIMEOUT_MS = Math.max(1500, parseInt(process.env.PVTKRRX_TRACKER_LINK_INSPECTION_TIMEOUT_MS || '4000', 10))
const TRACKER_LINK_INSPECTION_CACHE_MS = Math.max(60 * 1000, parseInt(process.env.PVTKRRX_TRACKER_LINK_INSPECTION_CACHE_MS || String(10 * 60 * 1000), 10))

// Module-level constant Sets — avoid recreating on every call
const TITLE_RELEVANT_STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or'])
const LOOSE_TEAM_NOISE = new Set([
  'epl', 'premier', 'league', 'laliga', 'la', 'liga', 'serie', 'bundesliga', 'ligue', 'champions',
  'europa', 'uefa', 'nba', 'nfl', 'ufc', 'formula', 'grand', 'prix', 'f1', 'match', 'sports',
  'sport', 'live', 'full', 'replay', 'highlights', 'extended', 'main', 'card', 'prelims', 'early'
])
const trackerLinkInspectionCache = new Map()

function buildFileUrl(config, configToken, playbackBaseUrl, hash, torrent, fileName, options = {}) {
  return buildPlaybackFileUrl(config, configToken, playbackBaseUrl, hash, torrent, fileName, options)
}

function buildPlaybackRouteUrl(playbackBaseUrl, configToken, payload) {
  try {
    const playbackInfo = encodePlaybackStateToken(payload)
    return `${playbackBaseUrl}/${configToken}/playback/${playbackInfo}`
  } catch (_) {
    return null
  }
}

function buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, hash, fileName) {
  const builtinFilePrefix = `${String(playbackBaseUrl || '').replace(/\/+$/, '')}/${configToken}/file/`
  if (!String(fileUrl || '').startsWith(builtinFilePrefix)) return fileUrl

  return buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
    h: String(hash || '').toLowerCase(),
    p: String(fileName || '')
  }) || fileUrl
}

function buildConfigureHelpUrl(addonUrl, target = 'seedbox') {
  const base = String(addonUrl || '').replace(/\/+$/, '')
  return `${base}/configure?target=${encodeURIComponent(target)}`
}

function getStreamSourceOptions(configToken) {
  return String(configToken || '').trim().toLowerCase() === 'local'
    ? { sourceTag: '[PC]', sourceLabel: 'Host PC', sourceOrigin: 'pc' }
    : { sourceTag: '[SERVER]', sourceLabel: 'Remote Server', sourceOrigin: 'server' }
}

function canServeBuiltinFileRoute(configToken) {
  return String(configToken || '') === 'local' || !process.env.VERCEL
}

function buildDirectLocalFileUrl(playbackBaseUrl, configToken, hash, filePath) {
  try {
    const info = encodeFileStateToken({
      h: String(hash || '').toLowerCase(),
      p: filePath
    })
    return `${playbackBaseUrl}/${configToken}/file/${info}`
  } catch (_) {
    return null
  }
}

function buildOrphanedCustomFileStream(config, configToken, playbackBaseUrl, info, parsed) {
  if (!canServeBuiltinFileRoute(configToken)) return null
  const streamSourceOptions = getStreamSourceOptions(configToken)

  const infoHash = String(info?.h || '').toLowerCase()
  const filePath = String(info?.f || '').trim()
  if (!infoHash || !filePath || !path.isAbsolute(filePath)) return null
  if (!fs.existsSync(filePath)) return null

  let stat = null
  try {
    stat = fs.statSync(filePath)
  } catch (_) {
    return null
  }
  if (!stat?.isFile?.()) return null

  const fileUrl = buildDirectLocalFileUrl(playbackBaseUrl, configToken, infoHash, filePath)
  if (!fileUrl) return null

  return buildOnSeedboxStream(
    { title: info?.t, size: stat.size, seeders: info?.d || 0 },
    fileUrl,
    path.basename(filePath),
    stat.size,
    config,
    parsed,
    streamSourceOptions
  )
}

async function inspectTrackerLink(link) {
  const target = String(link || '').trim()
  if (!target) return { packedOnly: false, inspected: false }

  const now = Date.now()
  const cached = trackerLinkInspectionCache.get(target)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = (async () => {
    try {
      const payload = await fetchTorrentPayload(target, {
        timeoutMs: TRACKER_LINK_INSPECTION_TIMEOUT_MS
      })
      const inspection = inspectTorrentPayload(payload.bytes)
      return {
        infoHash: String(inspection.infoHash || '').toLowerCase(),
        packedOnly: Boolean(inspection.packedOnly),
        inspected: true,
        fileCount: inspection.files.length,
        archiveCount: inspection.archiveFiles.length,
        directVideoCount: inspection.directVideoFiles.length
      }
    } catch (err) {
      return {
        packedOnly: false,
        inspected: false,
        error: String(err?.message || '')
      }
    }
  })()

  trackerLinkInspectionCache.set(target, {
    expiresAt: now + TRACKER_LINK_INSPECTION_CACHE_MS,
    promise
  })

  const result = await promise
  trackerLinkInspectionCache.set(target, {
    expiresAt: Date.now() + TRACKER_LINK_INSPECTION_CACHE_MS,
    promise: Promise.resolve(result)
  })
  return result
}

function buildArchiveDisplayFilename(title) {
  const safeBase = String(title || 'archive')
    .replace(/[^\w.\-()[\] ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
  return `${safeBase || 'archive'}.mkv`
}

function experimentalNativeRarStreamsEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS || '').trim())
}

function buildMatchedArchiveStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions = {}) {
  const archiveFiles = findPackedArchiveFiles(files)
  if (archiveFiles.length === 0) return null
  if (!arePackedArchiveFilesReady(archiveFiles)) return null

  const rarUrls = []
  for (const archiveFile of archiveFiles) {
    const archiveUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, archiveFile.name, {
      multipleFiles: files.length > 1,
      requireCurrentPathProof: false
    })
    if (!archiveUrl) return null
    const archiveBytes = Math.max(0, Number(archiveFile?.size || 0))
    rarUrls.push(archiveBytes > 0 ? [archiveUrl, archiveBytes] : [archiveUrl])
  }

  const totalBytes = archiveFiles.reduce((sum, file) => sum + Math.max(0, Number(file?.size || 0)), 0)
  return buildOnArchiveStream(
    item,
    rarUrls,
    buildArchiveDisplayFilename(item?.title || matched?.name || ''),
    totalBytes,
    parsed,
    100,
    streamSourceOptions
  )
}

function buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions = {}) {
  const absolutePath = path.normalize(String(extractedFilePath || '').trim())
  if (!absolutePath || !fs.existsSync(absolutePath)) return null

  let stat = null
  try {
    stat = fs.statSync(absolutePath)
  } catch (_) {
    stat = null
  }
  if (!stat?.isFile?.()) return null

  const fileName = path.basename(absolutePath)
  const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, fileName, {
    currentFilePath: absolutePath,
    requireCurrentPathProof: false
  })
  if (!fileUrl) return null

  return buildOnSeedboxStream(item, fileUrl, fileName, stat.size, config, parsed, {
    ...streamSourceOptions,
    extracted: true
  })
}

async function buildMatchedArchiveCompatibleStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions = {}) {
  let extractedFilePath = findExtractedArchiveVideoPath(matched)
  if (extractedFilePath) {
    const extractedStream = buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions)
    if (extractedStream) {
      return { stream: extractedStream, extractionStatus: 'ready', streamKind: 'direct' }
    }
  }

  let extractionStatus = ''
  try {
    const extraction = await ensurePackedArchiveExtracted(matched, files, config.additionalStorageRoots)
    extractionStatus = String(extraction?.status || '')
    if (extractionStatus === 'ready' && extraction?.path) {
      extractedFilePath = extraction.path
      const extractedStream = buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions)
      if (extractedStream) {
        return { stream: extractedStream, extractionStatus, streamKind: 'direct' }
      }
    }
  } catch (err) {
    console.warn(`[archive-extract] ${String(matched?.hash || '').slice(0, 8)}: ${err.message}`)
    extractionStatus = 'failed'
  }

  const archiveStream = buildMatchedArchiveStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions)
  if (archiveStream && experimentalNativeRarStreamsEnabled()) {
    return { stream: archiveStream, extractionStatus, streamKind: 'native-archive' }
  }

  return {
    stream: null,
    extractionStatus,
    streamKind: ''
  }
}

function recordPackedArchiveOutcome(noticeCounts, archiveResult) {
  if (!noticeCounts) return

  const status = String(archiveResult?.extractionStatus || '')
  if (status === 'pending') {
    noticeCounts.packedArchivePending += 1
    return
  }
  if (status === 'running') {
    noticeCounts.packedArchiveExtracting += 1
    return
  }

  // Any other non-ready archive state means PVTKRRX could not prepare a
  // direct-play file, and native archive playback is intentionally hidden
  // unless the experimental override is enabled.
  noticeCounts.packedArchiveExtractorUnavailable += 1
}

function createNoticeCounts() {
  return {
    hostedReadyOnly: 0,
    authSuppressed: 0,
    bufferingPathUnproven: 0,
    packedArchivePending: 0,
    packedArchiveLiveUnsupported: 0,
    packedArchiveExtracting: 0,
    packedArchiveExtractorUnavailable: 0,
    trackerLinkUnverified: 0
  }
}

function recordTrackerRestrictionNotice(noticeCounts, restriction) {
  if (!noticeCounts) return
  if (restriction === 'hosted-runtime') noticeCounts.hostedReadyOnly += 1
  else if (restriction === 'file-server-auth') noticeCounts.authSuppressed += 1
}

function appendNoticeStreams(streams, noticeCounts, addonUrl) {
  if (!noticeCounts) return

  const helpUrl = buildConfigureHelpUrl(addonUrl, 'seedbox')
  if (noticeCounts.hostedReadyOnly > 0) {
    streams.push(buildInfoStream('hosted-ready-only', helpUrl, noticeCounts.hostedReadyOnly))
  }
  if (noticeCounts.authSuppressed > 0) {
    streams.push(buildInfoStream('auth-suppressed', helpUrl, noticeCounts.authSuppressed))
  }
  if (noticeCounts.bufferingPathUnproven > 0) {
    streams.push(buildInfoStream('buffering-path-unproven', helpUrl, noticeCounts.bufferingPathUnproven))
  }
  if (noticeCounts.packedArchivePending > 0) {
    streams.push(buildInfoStream('packed-archive-pending', helpUrl, noticeCounts.packedArchivePending))
  }
  if (noticeCounts.packedArchiveLiveUnsupported > 0) {
    streams.push(buildInfoStream('packed-archive-live-unsupported', helpUrl, noticeCounts.packedArchiveLiveUnsupported))
  }
  if (noticeCounts.packedArchiveExtracting > 0) {
    streams.push(buildInfoStream('packed-archive-extracting', helpUrl, noticeCounts.packedArchiveExtracting))
  }
  if (noticeCounts.packedArchiveExtractorUnavailable > 0) {
    streams.push(buildInfoStream('packed-archive-extractor-unavailable', helpUrl, noticeCounts.packedArchiveExtractorUnavailable))
  }
  if (noticeCounts.trackerLinkUnverified > 0) {
    streams.push(buildInfoStream('tracker-link-unverified', helpUrl, noticeCounts.trackerLinkUnverified))
  }
}

const { settleWithTimeout } = require('../utils/timeout')

async function handleStream(config, type, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  try {
    if (id.startsWith('pvtkrrx:')) {
      return await handleCustomStream(config, id, addonUrl, configToken, playbackBaseUrl)
    }

    if (id.startsWith('tt')) {
      return await handleImdbStream(config, type, id, addonUrl, configToken, playbackBaseUrl)
    }

    return { streams: [] }
  } catch (err) {
    console.error(`[stream] ERROR type=${type} id=${id}: ${err.message}`)
    return { streams: [] }
  }
}

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Team name normalization is now shared via sportsdb.js normalizeTeamName()
// which includes a richer alias table (Manchester United variants, etc.)
const normalizeSportsTeamName = normalizeTeamName

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function extractSportsDate(value, fallbackValue = '') {
  const sources = [String(value || ''), String(fallbackValue || '')]
  for (const source of sources) {
    const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`

    const iso = source.match(/((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    const dmy = source.match(/(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})/)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

    const plain = source.match(/((?:19|20)\d{2}-\d{2}-\d{2})/)
    if (plain) return plain[1]
  }
  return ''
}

function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isFinite(date.getTime()) ? date : null
}

function sportsDateDistanceDays(a, b) {
  const left = parseIsoDate(a)
  const right = parseIsoDate(b)
  if (!left || !right) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)))
}

function cleanupLooseTeamSide(value, side = 'left') {
  let tokens = normalizeSportsTeamName(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !LOOSE_TEAM_NOISE.has(token))
    .filter(token => !/^(19|20)\d{2}$/.test(token))
    .filter(token => !/^\d{1,2}$/.test(token))

  if (side === 'left' && tokens.length > 4) tokens = tokens.slice(-4)
  if (side === 'right' && tokens.length > 4) tokens = tokens.slice(0, 4)
  return titleCaseWords(tokens.join(' '))
}

function parseLooseSportsEventTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const structured = parseSportsTitle(raw, fallbackDate)
  if (structured) return structured

  const cleaned = cleanTitle(raw)
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = cleaned.match(/(.+?)\b(?:vs\.?|v|@)\b(.+)/i)
  if (!match) return null

  const date = extractSportsDate(raw, fallbackDate)
  const homeTeam = cleanupLooseTeamSide(match[1], 'left')
  const awayTeam = cleanupLooseTeamSide(match[2], 'right')
  if (!date || !homeTeam || !awayTeam) return null

  return {
    date,
    homeTeam,
    awayTeam,
    raw
  }
}

function sportsTeamNamesMatch(expected, actual) {
  const left = normalizeSportsTeamName(expected)
  const right = normalizeSportsTeamName(actual)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function sportsTeamMatchCount(targetEvent, candidateEvent) {
  const checks = [
    sportsTeamNamesMatch(targetEvent?.homeTeam, candidateEvent?.homeTeam),
    sportsTeamNamesMatch(targetEvent?.homeTeam, candidateEvent?.awayTeam),
    sportsTeamNamesMatch(targetEvent?.awayTeam, candidateEvent?.homeTeam),
    sportsTeamNamesMatch(targetEvent?.awayTeam, candidateEvent?.awayTeam)
  ]
  return checks.filter(Boolean).length
}

function buildStructuredSportsTarget(info = {}) {
  const explicitDate = extractSportsDate(info.e, info.p)
  const explicitHomeTeam = String(info.o || '').trim()
  const explicitAwayTeam = String(info.w || '').trim()
  if (explicitDate && explicitHomeTeam && explicitAwayTeam) {
    return {
      league: String(info.u || info.g || '').trim(),
      date: explicitDate,
      homeTeam: explicitHomeTeam,
      awayTeam: explicitAwayTeam,
      raw: String(info.t || '').trim()
    }
  }

  return parseSportsTitle(info.t || '', info.p || '') || parseLooseSportsEventTitle(info.t || '', info.p || '')
}

function sourceItemKey(item = {}) {
  return String(item.infohash || item.link || item.h || item.l || '')
    .trim()
    .toLowerCase()
}

async function buildSupplementalSportsStreams({
  info,
  torznab,
  playbackBaseUrl,
  configToken,
  config,
  streamSourceOptions,
  seenKeys,
  noticeCounts,
  trackerPlaybackEnabled,
  trackerPlaybackRestriction
}) {
  if (!canEmitTrackerPlayback(config, configToken)) {
    if (noticeCounts) recordTrackerRestrictionNotice(noticeCounts, getTrackerPlaybackRestriction(config, configToken))
    return []
  }

  const targetEvent = buildStructuredSportsTarget(info)
  if (!targetEvent?.date || !targetEvent?.homeTeam || !targetEvent?.awayTeam) return []

  const searchQuery = `${targetEvent.homeTeam} vs ${targetEvent.awayTeam}`
  const searchResult = await settleWithTimeout(
    torznab.search(searchQuery, SPORT_CATS),
    STREAM_TITLE_FALLBACK_TIMEOUT_MS,
    []
  )
  const items = Array.isArray(searchResult.value) ? searchResult.value : []
  if (searchResult.timedOut) {
    console.warn(`[stream] Supplemental sports search timed out after ${STREAM_TITLE_FALLBACK_TIMEOUT_MS}ms`)
  }
  if (searchResult.error) {
    console.error('[stream] Supplemental sports search error:', searchResult.error?.message)
  }

  const ranked = items
    .filter(item => !isSportsOnlyIndexer(item.indexer))
    .filter(item => !isLikelyPackedReleaseTitle(item.title))
    .filter(item => Boolean(item?.link || item?.infohash))
    .map(item => {
      const parsedEvent = parseLooseSportsEventTitle(item.title, item.pubDate)
      if (!parsedEvent) return null

      const dateDistance = sportsDateDistanceDays(targetEvent.date, parsedEvent.date)
      const teamHits = sportsTeamMatchCount(targetEvent, parsedEvent)
      if (dateDistance > 1 || teamHits < 1) return null

      return {
        item,
        score: (teamHits * 100000000) + ((dateDistance === 0 ? 2 : 1) * 10000000) + scoreCandidate(item)
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const deduped = []
  for (const entry of ranked) {
    const key = sourceItemKey(entry.item)
    if (!key || seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(entry.item)
    if (deduped.length >= 20) break
  }

  const ordered = preferSeededResults(deduped, 'supplemental sports streams')
  const streams = []
  for (const item of ordered) {
    const titleLooksPacked = isLikelyPackedReleaseTitle(item.title)
    const inspection = titleLooksPacked
      ? { packedOnly: true, inspected: false }
      : await inspectTrackerLink(item.link)
    if (titleLooksPacked || inspection.packedOnly) {
      if (noticeCounts) noticeCounts.packedArchiveLiveUnsupported += 1
      continue
    }
    if (!inspection.inspected) {
      if (noticeCounts) noticeCounts.trackerLinkUnverified += 1
      continue
    }
    if (!trackerPlaybackEnabled) {
      recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
      break
    }
    try {
      const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
        h: item.infohash || inspection.infoHash || '',
        l: item.link
      })
      if (!playbackUrl) continue
      streams.push(buildOnTrackerStream(
        item,
        playbackUrl,
        parse(item.title || searchQuery),
        streamSourceOptions
      ))
    } catch (_) {
      // Skip invalid playback payloads instead of leaking raw tracker URLs.
    }
  }

  return streams
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
  const clean = s => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !TITLE_RELEVANT_STOPWORDS.has(w))
  const queryWords = clean(queryTitle)
  if (queryWords.length === 0) return true
  const resultLower = resultTitle.toLowerCase()
  return queryWords.every(w => resultLower.includes(w))
}

async function handleImdbStream(config, type, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const streamSourceOptions = getStreamSourceOptions(configToken)
  const trackerPlaybackRestriction = getTrackerPlaybackRestriction(config, configToken)
  const trackerPlaybackEnabled = !trackerPlaybackRestriction
  const noticeCounts = createNoticeCounts()

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
        if (!videoFile?.name) {
          const archiveResult = await buildMatchedArchiveCompatibleStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions)
          if (archiveResult.stream) {
            streams.push(archiveResult.stream)
          } else if (findPackedArchiveFiles(files).length > 0) {
            recordPackedArchiveOutcome(noticeCounts, archiveResult)
          }
          continue
        }
        const videoProgress = Number(videoFile?.progress || 0)
        const requireCurrentPathProof = !isCompletedTorrent(matched, videoProgress)
        const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, videoFile.name, {
          multipleFiles: files.length > 1,
          requireCurrentPathProof
        })
        if (!fileUrl) {
          if (requireCurrentPathProof && config?.fileServerUrl) {
            noticeCounts.bufferingPathUnproven += 1
          }
          continue
        }
        if (isCompletedTorrent(matched, videoProgress)) {
          streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed, streamSourceOptions))
        } else {
          const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
          const bufferingUrl = buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, matched.hash, videoFile.name)
          streams.push(buildOnBufferingStream(item, bufferingUrl, videoFile.name, videoFile.size, config, parsed, percent, streamSourceOptions))
        }
      } catch (e) {
        // File listing failed, skip this stream
      }
    } else if (item.link) {
      const titleLooksPacked = isLikelyPackedReleaseTitle(item.title)
      const inspection = titleLooksPacked
        ? { packedOnly: true, inspected: false }
        : await inspectTrackerLink(item.link)
      if (titleLooksPacked || inspection.packedOnly) {
        noticeCounts.packedArchiveLiveUnsupported += 1
        continue
      }
      if (!inspection.inspected) {
        noticeCounts.trackerLinkUnverified += 1
        continue
      }
      if (trackerPlaybackEnabled) {
        // On tracker — playback URL (works with or without infohash)
        try {
          const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
            h: item.infohash || inspection.infoHash || '',
            l: item.link
          })
          if (!playbackUrl) continue
          streams.push(buildOnTrackerStream(item, playbackUrl, parsed, streamSourceOptions))
        } catch (_) {
          // Skip invalid playback payloads instead of leaking raw tracker URLs.
        }
      } else {
        recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
      }
    }
  }

  appendNoticeStreams(streams, noticeCounts, addonUrl)
  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

async function handleCustomStream(config, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const info = decodeCustomId(id)
  let infoHash = String(info.h || '').toLowerCase()
  const directLink = String(info.l || '')
  const seenSourceKeys = new Set()
  if (infoHash) seenSourceKeys.add(infoHash)
  if (directLink) seenSourceKeys.add(directLink.toLowerCase())

  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const streamSourceOptions = getStreamSourceOptions(configToken)
  const trackerPlaybackRestriction = getTrackerPlaybackRestriction(config, configToken)
  const trackerPlaybackEnabled = !trackerPlaybackRestriction
  const noticeCounts = createNoticeCounts()
  const torrents = await qbit.torrents('all')
  const likelyPackedDirectRelease = isLikelyPackedReleaseTitle(info.t)
  let directInspection = null
  let matched = infoHash ? torrents.find(t => t.hash.toLowerCase() === infoHash) : null
  if (!matched && !infoHash && directLink && !likelyPackedDirectRelease) {
    directInspection = await inspectTrackerLink(directLink)
    if (directInspection.infoHash) {
      infoHash = String(directInspection.infoHash || '').toLowerCase()
      seenSourceKeys.add(infoHash)
      matched = torrents.find(t => t.hash.toLowerCase() === infoHash) || null
    }
  }
  if (!matched) matched = findTorrentByTitle(torrents, info.t)
  if (matched?.hash) seenSourceKeys.add(String(matched.hash).toLowerCase())

  const parsed = parse(info.t)
  const streams = []
  let packedArchivePending = false

  console.log(`[stream] custom title="${info.t}" hash=${infoHash || 'none'} matched=${matched ? matched.hash : 'none'}`)

  if (matched) {
    try {
      const files = await qbit.files(matched.hash)
      const videoFile = findVideoFile(files)
      if (!videoFile?.name) {
        const archiveResult = await buildMatchedArchiveCompatibleStream(
          config,
          configToken,
          playbackBaseUrl,
          matched,
          files,
          { title: info.t, size: info.s, seeders: info.d, indexer: info.i || '' },
          parsed,
          streamSourceOptions
        )
        if (archiveResult.stream) {
          streams.push(archiveResult.stream)
        } else if (findPackedArchiveFiles(files).length > 0) {
          packedArchivePending = true
          recordPackedArchiveOutcome(noticeCounts, archiveResult)
        } else {
          throw new Error('No playable video in matched torrent')
        }
      } else {
        const videoProgress = Number(videoFile?.progress || 0)
        const requireCurrentPathProof = !isCompletedTorrent(matched, videoProgress)
        const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, videoFile.name, {
          multipleFiles: files.length > 1,
          requireCurrentPathProof
        })
        if (!fileUrl) {
          if (requireCurrentPathProof && config?.fileServerUrl) {
            noticeCounts.bufferingPathUnproven += 1
          }
          throw new Error('Hosted mode requires a provable playback path for on-seedbox streams')
        }
        const item = { title: info.t, size: info.s, seeders: info.d }
        if (isCompletedTorrent(matched, videoProgress)) {
          streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed, streamSourceOptions))
        } else {
          const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
          const bufferingUrl = buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, matched.hash, videoFile.name)
          streams.push(buildOnBufferingStream(item, bufferingUrl, videoFile.name, videoFile.size, config, parsed, percent, streamSourceOptions))
        }
      }
    } catch (e) {
      console.error('[stream] custom file listing failed:', e.message)
    }
  }

  if (streams.length === 0) {
    const orphanedFileStream = buildOrphanedCustomFileStream(config, configToken, playbackBaseUrl, info, parsed)
    if (orphanedFileStream) {
      streams.push(orphanedFileStream)
    }
  }

  if (streams.length === 0 && directLink && !packedArchivePending) {
    const inspection = directInspection || (likelyPackedDirectRelease
      ? { packedOnly: true, inspected: false }
      : await inspectTrackerLink(directLink))

    if (inspection.packedOnly) {
      noticeCounts.packedArchiveLiveUnsupported += 1
    } else if (!inspection.inspected) {
      noticeCounts.trackerLinkUnverified += 1
    } else if (trackerPlaybackEnabled) {
      try {
        const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
          h: infoHash || String(inspection.infoHash || '').toLowerCase(),
          l: directLink
        })
        if (playbackUrl) {
          streams.push(buildOnTrackerStream(
            { title: info.t, size: info.s, seeders: info.d, indexer: info.i || '' },
            playbackUrl,
            parsed,
            streamSourceOptions
          ))
        }
      } catch (_) {
        // Skip invalid playback payloads instead of leaking raw tracker URLs.
      }
    } else {
      recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
    }
  }

  try {
    const supplementalStreams = await buildSupplementalSportsStreams({
      info,
      torznab,
      playbackBaseUrl,
      configToken,
      config,
      streamSourceOptions,
      seenKeys: seenSourceKeys,
      noticeCounts,
      trackerPlaybackEnabled,
      trackerPlaybackRestriction
    })
    if (supplementalStreams.length > 0) {
      streams.push(...supplementalStreams)
    }
  } catch (e) {
    console.error('[stream] supplemental sports search failed:', e.message)
  }

  if (streams.length === 0) {
    try {
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
        if (!key || seen.has(key) || seenSourceKeys.has(key)) continue
        seen.add(key)
        seenSourceKeys.add(key)
        deduped.push(item)
        if (deduped.length >= 20) break
      }
      const ordered = preferSeededResults(deduped, 'custom re-search')

      for (const item of ordered) {
        const titleLooksPacked = isLikelyPackedReleaseTitle(item.title)
        const inspection = titleLooksPacked
          ? { packedOnly: true, inspected: false }
          : await inspectTrackerLink(item.link)
        if (titleLooksPacked || inspection.packedOnly) {
          noticeCounts.packedArchiveLiveUnsupported += 1
          continue
        }
        if (!inspection.inspected) {
          noticeCounts.trackerLinkUnverified += 1
          continue
        }
        if (!trackerPlaybackEnabled) {
          recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
          break
        }
        try {
          const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
            h: item.infohash || inspection.infoHash || '',
            l: item.link
          })
          if (!playbackUrl) continue
          streams.push(buildOnTrackerStream(
            item,
            playbackUrl,
            parse(item.title || info.t),
            streamSourceOptions
          ))
        } catch (_) {
          // Skip invalid playback payloads instead of leaking raw tracker URLs.
        }
      }
    } catch (e) {
      console.error('[stream] custom re-search failed:', e.message)
    }
  }

  appendNoticeStreams(streams, noticeCounts, addonUrl)
  return { streams: sortStreams(streams), cacheMaxAge: 0 }
}

module.exports = { handleStream }
