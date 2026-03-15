// Build Stremio stream objects - two patterns: on-seedbox and on-tracker

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.wmv', '.ts', '.m4v']
const SAMPLE_HINT_RE = /(^|[\\/.\-_ ])[sS]ample([\\/.\-_ ]|$)|(^|[\\/.\-_ ])[tT]railer([\\/.\-_ ]|$)|(^|[\\/.\-_ ])[pP]review([\\/.\-_ ]|$)|(^|[\\/.\-_ ])[pP]roof([\\/.\-_ ]|$)/
const ARCHIVE_EXT_RE = /\.(?:rar|r\d{2,3}|zip|7z|001)$/i

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}

function truncateTitle(title, maxLen = 92) {
  const text = String(title || '').replace(/[^\w.\-()[\] ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1).trim()}…`
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function slugToken(value, maxLen = 48) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!text) return ''
  return text.slice(0, maxLen)
}

function buildBingeGroup(item, parsed, mode = 'seedbox') {
  const imdbId = String(item?.imdbId || item?.imdb || '').trim().toLowerCase()
  const cleanedTitle = String(item?.title || '')
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\b\d{1,2}x\d{1,3}\b/ig, ' ')
    .replace(/\bSeason[\s._-]*\d{1,2}\b/ig, ' ')
    .replace(/\bEpisode[\s._-]*\d{1,3}\b/ig, ' ')
  const titleKey = slugToken(cleanedTitle, 40)
  const fallback = slugToken(parsed?.quality || 'unknown', 16) || 'unknown'
  const groupKey = imdbId || titleKey || fallback
  const prefix = mode === 'buffering' ? 'pvtkrrx-buffering' : 'pvtkrrx'
  return `${prefix}-${groupKey}`
}

function formatPeerLabel(seeders, mode) {
  if (mode === 'seedbox') return ''
  const count = Math.max(0, Number(seeders || 0))
  return count > 0 ? `Peers: ${count}` : 'ZERO PEERS'
}

function buildStreamName(parsed, mode) {
  const badge = mode === 'seedbox'
    ? '[SB⚡]'
    : mode === 'buffering'
      ? '[BUF⏳]'
      : '[DL⬇]'
  const quality = parsed?.quality || 'AUTO'
  const shortSource = parsed?.source || ''
  const shortCodec = parsed?.codec || ''
  const tech = uniqueNonEmpty([shortSource, shortCodec]).join(' ')
  return tech ? `${badge} PVTKRRX ${quality} ${tech}` : `${badge} PVTKRRX ${quality}`
}

function buildDescription(item, parsed, mode, progressPercent = null) {
  const title = truncateTitle(item.title)
  const tech = uniqueNonEmpty([parsed.codec, parsed.hdr, parsed.bitDepth]).join(' • ')
  const source = uniqueNonEmpty([
    parsed.source,
    parsed.remux ? 'REMUX' : '',
    parsed.audio ? `🔊 ${parsed.audio}` : ''
  ]).join(' • ')

  let modeLabel = 'Auto-buffer'
  if (mode === 'seedbox') modeLabel = 'Local ready'
  else if (mode === 'buffering') modeLabel = `Buffering ${Number.isFinite(progressPercent) ? progressPercent : 0}%`

  const peerLabel = formatPeerLabel(item.seeders, mode)
  const stats = uniqueNonEmpty([
    modeLabel,
    peerLabel,
    `💾 ${formatSize(item.size)}`,
    item.indexer ? `🛰 ${item.indexer}` : '',
    parsed.languages ? `🌐 ${parsed.languages}` : ''
  ]).join(' | ')

  const detailLine = uniqueNonEmpty([tech, source]).join(' | ')
  if (!title) return detailLine ? `${detailLine}\n${stats}` : stats
  return detailLine ? `${title}\n${detailLine}\n${stats}` : `${title}\n${stats}`
}

function buildOnSeedboxStream(item, fileUrl, fileName, videoSize, config, parsed) {
  const stream = {
    name: buildStreamName(parsed, 'seedbox'),
    description: buildDescription(item, parsed, 'seedbox'),
    url: fileUrl,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: buildBingeGroup(item, parsed, 'seedbox'),
      filename: fileName,
      sourceSeeders: Math.max(0, Number(item.seeders || 0)),
      sourceCodec: String(parsed?.codec || ''),
      sourceHdr: String(parsed?.hdr || ''),
      sourceQuality: String(parsed?.quality || ''),
      sourceSize: Math.max(0, Number(videoSize || item?.size || 0)),
      sourceMode: 'seedbox'
    }
  }

  if (videoSize) stream.behaviorHints.videoSize = videoSize

  if (config.fileServerAuth) {
    const encoded = Buffer.from(config.fileServerAuth).toString('base64')
    stream.behaviorHints.proxyHeaders = {
      request: { Authorization: `Basic ${encoded}` }
    }
  }

  return stream
}

function buildOnBufferingStream(item, fileUrl, fileName, videoSize, config, parsed, progressPercent) {
  const stream = {
    name: buildStreamName(parsed, 'buffering'),
    description: buildDescription(item, parsed, 'buffering', progressPercent),
    url: fileUrl,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: buildBingeGroup(item, parsed, 'buffering'),
      filename: fileName,
      sourceSeeders: Math.max(0, Number(item.seeders || 0)),
      sourceCodec: String(parsed?.codec || ''),
      sourceHdr: String(parsed?.hdr || ''),
      sourceQuality: String(parsed?.quality || ''),
      sourceSize: Math.max(0, Number(videoSize || item?.size || 0)),
      sourceMode: 'buffering'
    }
  }

  if (videoSize) stream.behaviorHints.videoSize = videoSize
  if (config.fileServerAuth) {
    const encoded = Buffer.from(config.fileServerAuth).toString('base64')
    stream.behaviorHints.proxyHeaders = {
      request: { Authorization: `Basic ${encoded}` }
    }
  }

  return stream
}

function buildOnTrackerStream(item, playbackUrl, parsed) {
  const safeName = (item.title || 'download').replace(/[^\w.\-()[\] ]/g, '')
  return {
    name: buildStreamName(parsed, 'tracker'),
    description: buildDescription(item, parsed, 'tracker'),
    url: playbackUrl,
    behaviorHints: {
      notWebReady: true,
      filename: safeName + '.mkv',
      sourceSeeders: Math.max(0, Number(item.seeders || 0)),
      sourceCodec: String(parsed?.codec || ''),
      sourceHdr: String(parsed?.hdr || ''),
      sourceQuality: String(parsed?.quality || ''),
      sourceSize: Math.max(0, Number(item?.size || 0)),
      sourceMode: 'tracker'
    }
  }
}

// Find the main video file in a list of torrent files
function isVideoFileName(name) {
  const value = String(name || '').toLowerCase()
  return VIDEO_EXTENSIONS.some(ext => value.endsWith(ext))
}

function isSampleVideoName(name) {
  return SAMPLE_HINT_RE.test(String(name || ''))
}

function hasPackedArchiveFiles(files) {
  return (files || []).some(f => ARCHIVE_EXT_RE.test(String(f?.name || '').toLowerCase()))
}

function pickLargestFile(files) {
  if (!Array.isArray(files) || files.length === 0) return null
  return files.reduce((a, b) => Number(a?.size || 0) > Number(b?.size || 0) ? a : b)
}

function findVideoFile(files, options = {}) {
  const list = Array.isArray(files) ? files : []
  if (list.length === 0) return null

  const videoFiles = list.filter(f => isVideoFileName(f?.name))
  if (videoFiles.length === 0) return null

  const nonSample = videoFiles.filter(f => !isSampleVideoName(f?.name))
  if (nonSample.length > 0) return pickLargestFile(nonSample)

  // Packed scene releases often contain only Sample/*.mkv plus .rar parts.
  // Avoid selecting sample files as the main playback target in that case.
  if (hasPackedArchiveFiles(list) && options.allowSampleFallback !== true) return null
  return pickLargestFile(videoFiles)
}

// Find a specific episode file in a season pack
function findEpisodeFile(files, season, episode) {
  const seasonNum = Number.parseInt(String(season || ''), 10)
  const episodeNum = Number.parseInt(String(episode || ''), 10)
  if (!Number.isFinite(seasonNum) || !Number.isFinite(episodeNum)) return null

  const videoFiles = (Array.isArray(files) ? files : []).filter(f =>
    VIDEO_EXTENSIONS.some(ext => String(f.name || '').toLowerCase().endsWith(ext))
  )
  if (videoFiles.length === 0) return null

  const seRegex = new RegExp(`\\bS0?${seasonNum}[ ._-]*E0?${episodeNum}\\b`, 'i')
  const xRegex = new RegExp(`\\b${seasonNum}x0?${episodeNum}\\b`, 'i')
  const seasonEpisodeRegex = new RegExp(`\\bSeason[ ._-]*${seasonNum}[ ._-]*Episode[ ._-]*${episodeNum}\\b`, 'i')
  const episodeOnlyRegex = new RegExp(`\\bEpisode[ ._-]*0?${episodeNum}\\b`, 'i')

  let best = null
  let bestScore = -1
  for (const file of videoFiles) {
    const name = String(file?.name || '')
    const lowerName = name.toLowerCase()
    let score = -1
    if (seRegex.test(name)) score = 100
    else if (xRegex.test(name)) score = 95
    else if (seasonEpisodeRegex.test(name)) score = 85
    else if (episodeOnlyRegex.test(name)) score = 30
    else continue

    if (!isSampleVideoName(lowerName)) score += 5
    score += Math.min(20, Number(file?.size || 0) / 1e9)

    if (score > bestScore) {
      best = file
      bestScore = score
    }
  }

  if (best) return best

  // Avoid returning the wrong episode from multi-file season packs.
  if (videoFiles.length === 1) return videoFiles[0]
  return null
}

// Sort: on-seedbox first, then non-zero peers first within each group.
function sortStreams(streams) {
  function seeders(stream) {
    return Math.max(0, Number(stream?.behaviorHints?.sourceSeeders || 0))
  }

  function compatibilityRank(stream) {
    const codec = String(stream?.behaviorHints?.sourceCodec || '').toLowerCase()
    const hdr = String(stream?.behaviorHints?.sourceHdr || '').toLowerCase()
    const text = `${stream?.name || ''} ${stream?.description || ''}`.toLowerCase()
    const combined = `${codec} ${hdr} ${text}`

    const hasDv = /\bdolby\s*vision\b|\bdv\b/.test(combined)
    const hasH265 = /\bhevc\b|\bh265\b|\bx265\b/.test(combined)
    const hasAv1 = /\bav1\b/.test(combined)
    const hasH264 = /\bavc\b|\bh264\b|\bx264\b/.test(combined)

    // Lower rank is better (more compatible with typical desktop/mobile decoders).
    if (hasH264 && !hasDv) return 0
    if (hasH265 || hasAv1) return hasDv ? 3 : 2
    if (hasDv) return 3
    return 1
  }

  function rank(stream) {
    const mode = String(stream?.behaviorHints?.sourceMode || '').toLowerCase()
    if (mode === 'seedbox') return 0
    if (mode === 'buffering') return 1
    if (mode === 'tracker') return 2
    if (stream.name.includes('\u26A1')) return 0
    if (stream.name.includes('\u23F3')) return 1
    return 2
  }

  function qualityScore(stream) {
    const hint = String(stream?.behaviorHints?.sourceQuality || '').toLowerCase()
    const name = String(stream?.name || '').toLowerCase()
    const text = `${hint} ${name}`
    if (/\b2160p\b|\b4k\b/.test(text)) return 3
    if (/\b1080p\b/.test(text)) return 2
    if (/\b720p\b/.test(text)) return 1
    return 0
  }

  function sizeBytes(stream) {
    return Math.max(0, Number(stream?.behaviorHints?.sourceSize || stream?.behaviorHints?.videoSize || 0))
  }

  return streams.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb

    // Local-ready sources stay at the very top irrespective of quality.
    if (ra === 0) {
      const za = sizeBytes(a)
      const zb = sizeBytes(b)
      if (za !== zb) return zb - za
      return 0
    }

    const sa = seeders(a)
    const sb = seeders(b)
    const az = sa > 0 ? 0 : 1
    const bz = sb > 0 ? 0 : 1
    if (az !== bz) return az - bz
    const qa = qualityScore(a)
    const qb = qualityScore(b)
    if (qa !== qb) return qb - qa
    const za = sizeBytes(a)
    const zb = sizeBytes(b)
    if (za !== zb) return zb - za
    if (sa !== sb) return sb - sa
    return 0
  })
}

module.exports = {
  formatSize,
  buildOnSeedboxStream,
  buildOnBufferingStream,
  buildOnTrackerStream,
  isSampleVideoName,
  hasPackedArchiveFiles,
  findVideoFile,
  findEpisodeFile,
  sortStreams
}


