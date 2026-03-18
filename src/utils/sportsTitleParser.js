const QUALITY_RE = /^(?:2160p|1080p|720p|576p|540p|480p|sd|hd|fhd|uhd)(?:\d{2,3}fps)?$/i
const SOURCE_RE = /^(?:hdtv|pdtv|sdtv|webrip|webdl|web-dl|web|bluray|bdrip|dvdrip|satfeed|iptv)$/i
const CODEC_RE = /^(?:x264|x265|h264|h265|hevc|avc|av1)(?:-.+)?$/i

function normalizeSegment(value) {
  return String(value || '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isValidDate(year, month, day) {
  if (!/^(19|20)\d{2}$/.test(String(year || ''))) return false
  if (!/^\d{2}$/.test(String(month || '')) || !/^\d{2}$/.test(String(day || ''))) return false

  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

function isTeamSeparator(token) {
  const value = String(token || '').trim().toLowerCase()
  return value === 'vs' || value === 'v'
}

function isMetadataToken(token) {
  const value = String(token || '').trim()
  if (!value) return false
  return QUALITY_RE.test(value) || SOURCE_RE.test(value) || CODEC_RE.test(value)
}

function parseSportsTitle(title) {
  const raw = String(title || '').trim()
  if (!raw) return null

  const tokens = raw.split('.').map(token => token.trim()).filter(Boolean)
  if (tokens.length < 7) return null

  const [leagueToken, year, month, day, ...tail] = tokens
  if (!leagueToken || !isValidDate(year, month, day)) return null

  const separatorIndex = tail.findIndex(isTeamSeparator)
  if (separatorIndex <= 0 || separatorIndex >= tail.length - 1) return null

  const homeTeamTokens = tail.slice(0, separatorIndex)
  const trailingTokens = tail.slice(separatorIndex + 1)

  const metadataIndex = trailingTokens.findIndex(isMetadataToken)
  const awayTeamTokens = metadataIndex === -1
    ? trailingTokens
    : trailingTokens.slice(0, metadataIndex)

  if (homeTeamTokens.length === 0 || awayTeamTokens.length === 0) return null

  const league = normalizeSegment(leagueToken)
  const homeTeam = normalizeSegment(homeTeamTokens.join(' '))
  const awayTeam = normalizeSegment(awayTeamTokens.join(' '))
  if (!league || !homeTeam || !awayTeam) return null

  const qualityToken = metadataIndex === -1 ? '' : trailingTokens[metadataIndex]
  const quality = QUALITY_RE.test(qualityToken) ? qualityToken : ''

  return {
    league,
    date: `${year}-${month}-${day}`,
    homeTeam,
    awayTeam,
    ...(quality ? { quality } : {}),
    raw
  }
}

/*
Example checks:
parseSportsTitle('EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER')
// => { league: 'EPL', date: '2026-03-15', homeTeam: 'Manchester United', awayTeam: 'Chelsea', quality: '1080p', raw: '...' }

parseSportsTitle('NBA.2026.03.16.Los.Angeles.Lakers.v.Boston.Celtics.HDTV.x264-GRP')
// => { league: 'NBA', date: '2026-03-16', homeTeam: 'Los Angeles Lakers', awayTeam: 'Boston Celtics', raw: '...' }

parseSportsTitle('Broken.Title.Without.Separator.1080p')
// => null
*/

module.exports = {
  parseSportsTitle
}
