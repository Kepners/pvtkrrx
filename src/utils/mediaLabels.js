'use strict'

function playbackContentTypeFor(value, container = '') {
  const text = `${String(value || '')} ${String(container || '')}`.toLowerCase()
  if (/\.mp4(?:$|[?\s])|\bmp4\b/.test(text)) return 'video/mp4'
  if (/\.mkv(?:$|[?\s])|\b(?:mkv|matroska)\b/.test(text)) return 'video/x-matroska'
  if (/\.webm(?:$|[?\s])|\bwebm\b/.test(text)) return 'video/webm'
  if (/\.avi(?:$|[?\s])|\bavi\b/.test(text)) return 'video/x-msvideo'
  if (/\.wmv(?:$|[?\s])|\bwmv\b/.test(text)) return 'video/x-ms-wmv'
  if (/\.m4v(?:$|[?\s])|\bm4v\b/.test(text)) return 'video/x-m4v'
  if (/\.ts(?:$|[?\s])|\b(?:mpegts|transport stream)\b/.test(text)) return 'video/mp2t'
  return 'application/octet-stream'
}

function detectQualityLabel(value = '') {
  const text = String(value || '').toUpperCase()
  const match = text.match(/\b(2160P|1080P|720P|576P|540P|480P|4K|UHD)\b/)
  if (!match) return ''
  return match[1] === 'UHD' ? '2160P' : match[1]
}

function detectContainerLabel(value = '') {
  const text = String(value || '').toLowerCase()
  if (/\.(mkv)(?:$|[?\s])|\bmkv\b/.test(text)) return 'MKV'
  if (/\.(mp4)(?:$|[?\s])|\bmp4\b/.test(text)) return 'MP4'
  if (/\.(webm)(?:$|[?\s])|\bwebm\b/.test(text)) return 'WEBM'
  if (/\.(avi)(?:$|[?\s])|\bavi\b/.test(text)) return 'AVI'
  if (/\.(m4v)(?:$|[?\s])|\bm4v\b/.test(text)) return 'M4V'
  if (/\.(ts|m2ts)(?:$|[?\s])|\b(?:ts|m2ts)\b/.test(text)) return 'TS'
  return ''
}

module.exports = {
  playbackContentTypeFor,
  detectQualityLabel,
  detectContainerLabel
}
