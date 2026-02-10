// Parse torrent names: quality, codec, audio, source, HDR, REMUX, season/episode

function parse(title) {
  const t = title || ''
  return {
    quality: extractQuality(t),
    codec: extractCodec(t),
    audio: extractAudio(t),
    source: extractSource(t),
    hdr: extractHDR(t),
    remux: /\bremux\b/i.test(t)
  }
}

function extractQuality(t) {
  if (/2160p/i.test(t)) return '2160p'
  if (/1080p/i.test(t)) return '1080p'
  if (/720p/i.test(t)) return '720p'
  if (/480p/i.test(t)) return '480p'
  return ''
}

function extractCodec(t) {
  if (/\bx265\b|\bHEVC\b/i.test(t)) return 'x265'
  if (/\bx264\b|\bAVC\b/i.test(t)) return 'x264'
  if (/\bAV1\b/i.test(t)) return 'AV1'
  return ''
}

function extractAudio(t) {
  if (/\bAtmos\b/i.test(t)) return 'Atmos'
  if (/\bDTS[\.\-\s]?HD[\.\s]?MA\b/i.test(t)) return 'DTS-HD MA'
  if (/\bTrueHD\b/i.test(t)) return 'TrueHD'
  if (/\bDTS[\.\-\s]?HD\b/i.test(t)) return 'DTS-HD'
  if (/\bFLAC\b/i.test(t)) return 'FLAC'
  if (/\bDD[P\+]\b|\bE[\.\-]?AC[\.\-]?3\b/i.test(t)) return 'DD+'
  if (/\bDD\b|\bAC[\.\-]?3\b/i.test(t)) return 'DD'
  if (/\bAAC\b/i.test(t)) return 'AAC'
  return ''
}

function extractSource(t) {
  if (/\bREMUX\b/i.test(t)) return 'BluRay'
  if (/\bBlu[\.\-\s]?Ray\b|\bBDRip\b/i.test(t)) return 'BluRay'
  if (/\bWEB[\.\-\s]?DL\b/i.test(t)) return 'WEB-DL'
  if (/\bWEBRip\b/i.test(t)) return 'WEBRip'
  if (/\bHDTV\b/i.test(t)) return 'HDTV'
  if (/\bHDRip\b/i.test(t)) return 'HDRip'
  if (/\bDVDRip\b/i.test(t)) return 'DVDRip'
  return ''
}

function extractHDR(t) {
  if (/\bDolby[\.\s]?Vision\b|\b\bDoVi\b/i.test(t)) return 'DV'
  if (/\bHDR10\+/i.test(t)) return 'HDR10+'
  if (/\bHDR10\b/i.test(t)) return 'HDR10'
  if (/\bHDR\b/i.test(t)) return 'HDR'
  return ''
}

// Match torrent title against specific season/episode
function matchesEpisode(title, season, episode) {
  // Specific episode: S01E05, 1x05
  const se = new RegExp(`S0?${season}E0?${episode}\\b`, 'i')
  const sxe = new RegExp(`\\b${season}x0?${episode}\\b`, 'i')
  if (se.test(title) || sxe.test(title)) return true

  // Season pack: "S01" without episode, or "Season 1" (no specific episode mentioned)
  if (!(/S\d+E\d+/i.test(title)) && !(/\d+x\d+/i.test(title))) {
    const seasonOnly = new RegExp(`\\bS0?${season}\\b|\\bSeason\\s*0?${season}\\b`, 'i')
    if (seasonOnly.test(title)) return true
  }

  return false
}

// Clean torrent name to readable title
function cleanTitle(name) {
  return (name || '')
    .replace(/\.(mkv|mp4|avi|ts|m4v)$/i, '')
    .replace(/[\.\-_]/g, ' ')
    .replace(/\s*(2160p|1080p|720p|480p|x265|x264|HEVC|AVC|BluRay|WEB[\s-]?DL|WEBRip|HDTV|REMUX|HDR\S*|DTS\S*|TrueHD|Atmos|DD[P+]?\d*|AAC|FLAC|AC3)\b.*/i, '')
    .trim()
}

module.exports = { parse, matchesEpisode, cleanTitle }
