// Build Stremio stream objects - two patterns: on-seedbox and on-tracker

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.wmv', '.ts', '.m4v']

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}

function buildStreamName(parsed, mode) {
  const icon = mode === 'seedbox' ? '\u26A1' : mode === 'buffering' ? '\u23F3' : '\uD83D\uDCE5'
  const parts = [parsed.quality, parsed.source]
  if (parsed.remux) parts.push('REMUX')
  if (parsed.hdr) parts.push(parsed.hdr)
  if (parsed.codec) parts.push(parsed.codec)
  const label = parts.filter(Boolean).join(' ') || 'Unknown'
  return `${icon} ${label}`
}

function buildDescription(item, parsed, mode, progressPercent = null) {
  const title = String(item.title || '').replace(/[^\w.\-()[\] ]/g, ' ').trim()
  const stats = []
  if (mode === 'seedbox') {
    stats.push('On Seedbox')
  } else if (mode === 'buffering') {
    stats.push(`Buffering ${Number.isFinite(progressPercent) ? progressPercent : 0}%`)
    stats.push('Starts before complete')
  } else {
    stats.push(`Seeders ${item.seeders}`)
    stats.push('Auto-buffer')
  }
  if (parsed.audio) stats.push(parsed.audio)
  stats.push(`Size ${formatSize(item.size)}`)
  if (item.indexer) stats.push(`[${item.indexer}]`)
  return title ? `${title}\n${stats.join(' ')}` : stats.join(' ')
}

function buildOnSeedboxStream(item, fileUrl, fileName, videoSize, config, parsed) {
  const stream = {
    name: buildStreamName(parsed, 'seedbox'),
    description: buildDescription(item, parsed, 'seedbox'),
    url: fileUrl,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: `pvtkrrx-${parsed.quality || 'unknown'}`,
      filename: fileName
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
      bingeGroup: `pvtkrrx-buffering-${parsed.quality || 'unknown'}`,
      filename: fileName
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
      filename: safeName + '.mkv'
    }
  }
}

// Find the main video file in a list of torrent files
function findVideoFile(files) {
  const videoFiles = files.filter(f =>
    VIDEO_EXTENSIONS.some(ext => String(f.name || '').toLowerCase().endsWith(ext))
  )
  if (videoFiles.length === 0) return files.reduce((a, b) => a.size > b.size ? a : b, files[0])
  return videoFiles.reduce((a, b) => a.size > b.size ? a : b)
}

// Find a specific episode file in a season pack
function findEpisodeFile(files, season, episode) {
  const sePat = new RegExp(`S0?${season}E0?${episode}`, 'i')
  const videoFiles = files.filter(f =>
    VIDEO_EXTENSIONS.some(ext => String(f.name || '').toLowerCase().endsWith(ext))
  )
  const match = videoFiles.find(f => sePat.test(String(f.name || '')))
  return match || findVideoFile(files)
}

// Sort: on-seedbox first, then keep original order in each group.
function sortStreams(streams) {
  function rank(stream) {
    if (stream.name.includes('\u26A1')) return 0
    if (stream.name.includes('\u23F3')) return 1
    return 2
  }

  return streams.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return 0
  })
}

module.exports = {
  formatSize,
  buildOnSeedboxStream,
  buildOnBufferingStream,
  buildOnTrackerStream,
  findVideoFile,
  findEpisodeFile,
  sortStreams
}
