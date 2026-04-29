const { parse: parseMediaTitle } = require('./parser')
const { getMappedLeagueEntry, mapLeague } = require('./leagueMap')
const { normalizeSportKey, resolveSportHint } = require('./sportsRules')
const { parseSportsTitle, parseSportsEventTitle } = require('./sportsTitleParser')
const { classifySportsEvent } = require('./sportsEventClassifier')

const BROADCAST_RULES = [
  ['Sky Sports', /\bsky[\s._-]*sports?\b|\bskysports\b/i],
  ['TNT', /\btnt(?:[\s._-]*sports?)?\b/i],
  ['ESPN', /\bespn(?:p|plus|\+|2)?\b/i],
  ['FOX', /\bfox(?:[\s._-]*sports?)?\b/i],
  ['NBC', /\bnbc(?:sn)?\b/i],
  ['CBS', /\bcbs\b/i],
  ['DAZN', /\bdazn\b/i],
  ['BT Sport', /\bbt[\s._-]*sport\b/i],
  ['TSN', /\btsn\b/i],
  ['Sportsnet', /\bsportsnet\b|\bsn\b/i],
  ['F1TV', /\bf1tv\b/i],
  ['Eurosport', /\beurosport\b/i],
  ['beIN Sports', /\bbein(?:[\s._-]*sports?)?\d*\b/i],
  ['YES Network', /\byes[\s._-]*network\b/i],
  ['NESN', /\bnesn\b/i],
  ['MSG', /\bmsg\b/i],
  ['BBC', /\bbbc\b/i],
  ['Peacock', /\bpeacock\b/i],
  ['Kayo Sports', /\bkayo(?:[\s._-]*sports?)?\b/i],
  ['Apple TV', /\batvp?\b|\bapple[\s._-]*tv\b/i]
]

const SESSION_RULES = [
  ['Early Prelims', /\bearly[\s._-]*prelims?\b/i],
  ['Prelims', /\bprelims?\b/i],
  ['Main Card', /\bmain[\s._-]*card\b/i],
  ['Main Event', /\bmain[\s._-]*event\b/i],
  ['FP1 Practice', /\bfp1[\s._-]*practice\b/i],
  ['FP2 Practice', /\bfp2[\s._-]*practice\b/i],
  ['FP3 Practice', /\bfp3[\s._-]*practice\b/i],
  ['Free Practice One', /\bfree[\s._-]*practice[\s._-]*(?:one|1)\b/i],
  ['Free Practice Two', /\bfree[\s._-]*practice[\s._-]*(?:two|2)\b/i],
  ['Free Practice Three', /\bfree[\s._-]*practice[\s._-]*(?:three|3)\b/i],
  ['Warm Up', /\bwarm[\s._-]*up\b|\bwarmup\b/i],
  ['Qualifying', /\bqualifying\b|\bqualifier\b/i],
  ['Sprint', /\bsprint\b/i],
  ['Practice', /\bpractice\b/i],
  ['Race', /\brace\b/i]
]

const ROUND_RULES = [
  /\b(week\s*\d{1,2})\b/i,
  /\b(round\s*\d{1,2})\b/i,
  /\b(r\d{1,2})\b/i,
  /\b(game\s*\d{1,2})\b/i,
  /\b(stage\s*\d{1,2})\b/i,
  /\b(?:quarter[\s._-]*final|qf)\b/i,
  /\b(?:semi[\s._-]*final|sf)\b/i,
  /\bfinal\b/i
]

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function titleCase(value) {
  return normalizeSpace(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()
      if (upper === 'SMACKDOWN') return 'SmackDown'
      if (upper === 'WRESTLEMANIA') return 'WrestleMania'
      if (['AAC', 'AV1', 'DDP', 'FA', 'F1', 'GP', 'HD', 'IPL', 'MLB', 'MLS', 'MMA', 'NBA', 'NFL', 'NHL', 'PGA', 'RAW', 'UFC', 'WRC', 'WWE', 'NXT'].includes(upper)) {
        return upper
      }
      if (upper === 'MOTOGP') return 'MotoGP'
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function extractDate(rawTitle = '', fallbackDate = '') {
  const source = String(rawTitle || '')
  const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  const fallback = String(fallbackDate || '').match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})/)
  return fallback ? fallback[0] : ''
}

function extractSeason(rawTitle = '', date = '') {
  const season = String(rawTitle || '').match(/\b((?:19|20)\d{2})(?:[/-]\d{2})?\b/)
  if (season) return Number(season[1])
  const year = String(date || '').match(/^((?:19|20)\d{2})/)
  return year ? Number(year[1]) : null
}

function extractBroadcast(rawTitle = '') {
  for (const [label, pattern] of BROADCAST_RULES) {
    if (pattern.test(rawTitle)) return label
  }
  return null
}

function extractSession(rawTitle = '') {
  for (const [label, pattern] of SESSION_RULES) {
    if (pattern.test(rawTitle)) return label
  }
  return null
}

function extractRound(rawTitle = '') {
  const text = String(rawTitle || '')
  for (const pattern of ROUND_RULES) {
    const match = text.match(pattern)
    if (match?.[1]) return titleCase(match[1].replace(/([a-z])(\d)/ig, '$1 $2'))
    if (match?.[0]) return titleCase(match[0].replace(/\bqf\b/i, 'Quarter Final').replace(/\bsf\b/i, 'Semi Final'))
  }
  return null
}

function extractReleaseGroup(rawTitle = '') {
  const clean = String(rawTitle || '').trim()
  const dashed = clean.match(/-([A-Za-z0-9]{2,24})$/)
  if (dashed) return dashed[1]
  const tokens = clean.split(/[.\s]+/).filter(Boolean)
  const last = tokens[tokens.length - 1] || ''
  if (BROADCAST_RULES.some(([, pattern]) => pattern.test(last))) return null
  if (/^(?:EN|ENG|English|BBC|TNT|ESPN|FOX|NBC|CBS|ABC|FS1|FSP|SNY|SNLA|SNP|CARD|ARID|Peacock|Kayo|REPACK|PROPER|COMPLETE)$/i.test(last)) return null
  if (/^[A-Z0-9]{3,24}$/.test(last) && !/^(WEB|HDTV|AAC|H264|H265|HEVC|AV1)$/i.test(last)) return last
  return null
}

function normalizeCodec(codec = '') {
  if (/x265|h265|hevc/i.test(codec)) return 'H.265'
  if (/x264|h264|avc/i.test(codec)) return 'H.264'
  if (/av1/i.test(codec)) return 'AV1'
  return codec || null
}

function normalizeAudio(audio = '', rawTitle = '') {
  const raw = String(rawTitle || '')
  const ddp = raw.match(/\bDDP[\s._-]?(\d(?:[._]\d)?)\b/i)
  if (ddp) return `DDP${ddp[1].replace('_', '.')}`
  const dd = raw.match(/\bDD[\s._-]?(\d(?:[._]\d)?)\b/i)
  if (dd) return `DD${dd[1].replace('_', '.')}`
  const aac = raw.match(/\bAAC[\s._-]?(\d(?:[._]\d)?)?\b/i)
  if (aac) return aac[1] ? `AAC${aac[1].replace('_', '.')}` : 'AAC'
  return audio || null
}

function normalizeLanguage(languages = '') {
  const text = String(languages || '')
  if (/\bEN\b/i.test(text)) return 'English'
  if (/\bFR\b/i.test(text)) return 'French'
  if (/\bES\b/i.test(text)) return 'Spanish'
  if (/\bIT\b/i.test(text)) return 'Italian'
  if (/\bDE\b/i.test(text)) return 'German'
  if (/\bMULTI\b/i.test(text)) return 'Multi'
  return null
}

function resolveLeagueName(parsedLeague = '', rawTitle = '') {
  const mapped = mapLeague(parsedLeague) || parsedLeague
  if (mapped) return mapped
  const mappedFromTitle = getMappedLeagueEntry(rawTitle)
  return mappedFromTitle?.name || null
}

function buildCleanName(profile = {}) {
  const parts = []
  if (profile.league) parts.push(profile.league)
  else if (profile.sport) parts.push(titleCase(profile.sport))
  if (profile.date) parts.push(profile.date)
  if (profile.away_team && profile.home_team) {
    parts.push(`${profile.away_team} at ${profile.home_team}`)
  } else if (profile.event) {
    parts.push(profile.event)
  }
  if (profile.round) parts.push(profile.round)
  if (profile.session) parts.push(profile.session)
  return normalizeSpace(parts.join(' ')) || normalizeSpace(profile.raw_title || '')
}

function confidenceScore(profile = {}) {
  let score = 0
  if (profile.sport) score += 0.16
  if (profile.league) score += 0.18
  if (profile.date) score += 0.14
  if (profile.home_team && profile.away_team) score += 0.24
  if (profile.event) score += 0.16
  if (profile.session) score += 0.06
  if (profile.resolution || profile.source) score += 0.06
  return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

function parseSportsTorrentProfile(itemOrTitle = '', options = {}) {
  const rawTitle = typeof itemOrTitle === 'string'
    ? itemOrTitle
    : String(itemOrTitle?.title || '')
  const pubDate = options.pubDate || (typeof itemOrTitle === 'object' ? itemOrTitle?.pubDate || itemOrTitle?.publishDate : '') || ''
  const parsedMatchup = options.parsedSportsEvent || parseSportsTitle(rawTitle, pubDate) || null
  const parsedEvent = options.parsedEvent || (!parsedMatchup ? parseSportsEventTitle(rawTitle, pubDate) : null)
  const media = parseMediaTitle(rawTitle)
  const date = parsedMatchup?.date || parsedEvent?.date || extractDate(rawTitle, pubDate)
  const league = resolveLeagueName(parsedMatchup?.league || parsedEvent?.league || options.league || '', rawTitle)
  const sport = normalizeSportKey(resolveSportHint({
    explicitHint: options.sportHint || '',
    categoryHint: options.categoryHint || '',
    title: rawTitle
  })) || normalizeSportKey(getMappedLeagueEntry(league)?.sportKey || '')
  const session = parsedEvent ? extractSession(rawTitle) : extractSession(rawTitle)
  const profile = {
    raw_title: rawTitle,
    sport: sport || null,
    league: league || null,
    season: extractSeason(rawTitle, date),
    date: date || null,
    event: parsedMatchup ? null : (parsedEvent?.eventName ? titleCase(parsedEvent.eventName) : null),
    home_team: parsedMatchup?.homeTeam ? titleCase(parsedMatchup.homeTeam) : null,
    away_team: parsedMatchup?.awayTeam ? titleCase(parsedMatchup.awayTeam) : null,
    round: extractRound(rawTitle),
    session,
    broadcast: extractBroadcast(rawTitle),
    resolution: media.quality || null,
    source: media.source || null,
    codec: normalizeCodec(media.codec),
    audio: normalizeAudio(media.audio, rawTitle),
    language: normalizeLanguage(media.languages),
    release_group: extractReleaseGroup(rawTitle)
  }
  profile.event_class = classifySportsEvent({
    sportHint: profile.sport,
    sport: profile.sport,
    competition: profile.league,
    league: profile.league,
    eventTitle: profile.event,
    eventDetail: profile.session || profile.round,
    homeTeam: profile.home_team,
    awayTeam: profile.away_team,
    rawTitle
  })
  profile.clean_name = buildCleanName(profile)
  profile.confidence = confidenceScore(profile)
  return profile
}

function qualityRank(resolution = '') {
  if (/2160p/i.test(resolution)) return 30
  if (/1080p/i.test(resolution)) return 22
  if (/720p/i.test(resolution)) return 12
  if (/480p/i.test(resolution)) return 4
  return 0
}

function sourceRank(source = '') {
  if (/web-dl/i.test(source)) return 10
  if (/webrip/i.test(source)) return 8
  if (/web/i.test(source)) return 6
  if (/hdtv/i.test(source)) return 5
  if (/bluray/i.test(source)) return 3
  return 0
}

function dateRank(date = '', today = new Date().toISOString().slice(0, 10)) {
  const clean = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return 0
  if (clean === today) return 80
  if (clean > today) return 45
  const diffDays = Math.round((Date.parse(today) - Date.parse(clean)) / 86400000)
  if (diffDays === 1) return -20
  return -30 - Math.min(60, Math.max(0, diffDays - 1) * 4)
}

function rankSportsTorrent(itemOrTitle = '', query = '', options = {}) {
  const profile = options.profile || parseSportsTorrentProfile(itemOrTitle, options)
  const title = typeof itemOrTitle === 'string' ? itemOrTitle : String(itemOrTitle?.title || '')
  const seeders = typeof itemOrTitle === 'object' ? Number(itemOrTitle?.seeders || 0) || 0 : 0
  const q = normalizeSpace(query).toLowerCase()
  const today = String(options.today || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const currentYear = Number(today.slice(0, 4)) || new Date().getUTCFullYear()
  let score = Math.round((profile.confidence || 0) * 100)
  score += qualityRank(profile.resolution)
  score += sourceRank(profile.source)
  score += dateRank(profile.date, today)
  score += Math.min(40, Math.round(Math.log2(Math.max(1, seeders)) * 5))
  if (Number(profile.season) > 0 && Number(profile.season) < currentYear - 1) score -= 80
  if (profile.league) score += 12
  if (profile.session) score += 6
  if (profile.home_team && profile.away_team) score += 15
  if (profile.event) score += 10
  if (/\b(?:replay|highlights?|preview|review)\b/i.test(title)) score -= 12
  if (q && title.toLowerCase().includes(q)) score += 35
  return score
}

module.exports = {
  parseSportsTorrentProfile,
  rankSportsTorrent
}
