const SPORTS_RELEASE_NOISE_PATTERN = String.raw`\b(?:2160p|1080p|1080i|720p|576p|540p|480p)(?:[a-z]{1,6})?(?:\d{2,3}fps)?\b|\b\d{2,3}fps\b|\b(?:x|h)[\s._-]?26[45](?:[\s._-]+[a-z0-9]{2,20})?\b|\b(?:x264|x265|h264|h265|hevc|avc|av1|web[\s._-]*dl|web[\s._-]*rip|web|hdtv|repack|proper|complete|aac|ac3|ddp?\d?(?:\.\d)?|multi)\b|\b(?:fbb|megust[ae]?|afg|epworks|mwr|z3r0|kontrast|flux|verum|m4rtyr|thecig|billie|ntb|ctrlhd|deflate|organic|tgx|blackdevil|nva)\b`
const SPORTS_RELEASE_NOISE_RE = new RegExp(SPORTS_RELEASE_NOISE_PATTERN, 'gi')

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stripSportsReleaseNoise(value = '') {
  return normalizeSpace(String(value || '').replace(SPORTS_RELEASE_NOISE_RE, ' '))
}

function containsSportsReleaseNoise(value = '') {
  return new RegExp(SPORTS_RELEASE_NOISE_PATTERN, 'i').test(String(value || ''))
}

module.exports = {
  SPORTS_RELEASE_NOISE_PATTERN,
  SPORTS_RELEASE_NOISE_RE,
  stripSportsReleaseNoise,
  containsSportsReleaseNoise
}
