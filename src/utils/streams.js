// Build Stremio stream objects — two patterns: on-seedbox and on-tracker

const { parse } = require('./parser')

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.wmv', '.ts', '.m4v']

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(0) + ' KB'
}

function buildStreamName(parsed, onSeedbox) {
  const icon = onSeedbox ? '\u26A1' : '\uD83D\uDCE5'
  const parts = [parsed.quality, parsed.source]
  if (parsed.remux) parts.push('REMUX')
  if (parsed.hdr) parts.push(parsed.hdr)
  if (parsed.codec) parts.push(parsed.codec)
  const label = parts.filter(Boolean).join(' ') || 'Unknown'
  return `${icon} ${label}`
}

function buildDescription(item, parsed, onSeedbox) {
  const parts = []
  if (onSeedbox) {
    parts.push('On Seedbox')
  } else {
    parts.push(`${item.seeders} seeders`)
  }
  if (parsed.audio) parts.push(parsed.audio)
  parts.push(formatSize(item.size))
  if (!onSeedbox) parts.push('Click to stream')
  return parts.join(' | ')
}

function buildOnSeedboxStream(item, fileUrl, fileName, videoSize, config, parsed) {
  const stream = {
    name: buildStreamName(parsed, true),
    description: buildDescription(item, parsed, true),
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

function buildOnTrackerStream(item, playbackUrl, parsed) {
  const safeName = (item.title || 'download').replace(/[^\w.\-()[\] ]/g, '')
  return {
    name: buildStreamName(parsed, false),
    description: buildDescription(item, parsed, false),
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
    VIDEO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
  )
  if (videoFiles.length === 0) return files.reduce((a, b) => a.size > b.size ? a : b, files[0])
  return videoFiles.reduce((a, b) => a.size > b.size ? a : b)
}

// Find a specific episode file in a season pack
function findEpisodeFile(files, season, episode) {
  const sePat = new RegExp(`S0?${season}E0?${episode}`, 'i')
  const videoFiles = files.filter(f =>
    VIDEO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
  )
  const match = videoFiles.find(f => sePat.test(f.name))
  return match || findVideoFile(files)
}

// Sort: on-seedbox first, then by seeders desc
function sortStreams(streams) {
  return streams.sort((a, b) => {
    const aLocal = a.name.includes('\u26A1')
    const bLocal = b.name.includes('\u26A1')
    if (aLocal && !bLocal) return -1
    if (!aLocal && bLocal) return 1
    return 0 // preserve original order within same group
  })
}

module.exports = {
  formatSize,
  buildOnSeedboxStream,
  buildOnTrackerStream,
  findVideoFile,
  findEpisodeFile,
  sortStreams
}
