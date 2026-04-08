const fs = require('fs')
const path = require('path')
const { cleanTitle } = require('../utils/parser')
const { detectSport, stripSportTerms } = require('../utils/sportClassifier')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { getMappedLeagueEntry, listMappedLeagues, mapLeague } = require('../utils/leagueMap')
const { resolveRuntimeDir } = require('../utils/runtimeDir')

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json'
const DEFAULT_API_KEY = '123'
const DEFAULT_TIMEOUT_MS = 8000
const PERSIST_FILE_NAME = 'sportsdb-poster-cache.json'
const PERSIST_MAX_ENTRIES = 50000
const CACHE_KEY_VERSION = 'v5'
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_ARTWORK_CACHE_HOURS = 24 * 365
const DEFAULT_MISS_CACHE_HOURS = 6
const STRUCTURED_EVENT_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000
const LEAGUE_ASSET_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000

const cache = new Map()
const inFlight = new Map()
const leagueCache = new Map()
const teamCache = new Map()
const eventCache = new Map()
const eventInFlight = new Map()
const eventLookupCache = new Map()
const eventLookupInFlight = new Map()
const teamsByLeagueCache = new Map()
const teamsByLeagueInFlight = new Map()
const endpointCache = new Map()
const endpointInFlight = new Map()
const leaguesBySportCache = new Map()
const persistentStore = new Map()
let rateLimitedUntil = 0
let persistentLoaded = false
const TEAM_ALIASES = [
  { re: /\bmanchi(?:\s+utd)?\b/gi, value: 'manchester united' },
  { re: /\bman(?:chester)?[\s.\-_]*utd\b/gi, value: 'manchester united' },
  { re: /\bman[\s.\-_]*u\b/gi, value: 'manchester united' },
  { re: /\butd\b/gi, value: 'united' },
  { re: /\bspurs\b/gi, value: 'tottenham hotspur' },
  { re: /\bnewc\b/gi, value: 'newcastle' },
  { re: /\bwolves\b/gi, value: 'wolverhampton' }
]

function getRuntimeDir() {
  return resolveRuntimeDir()
}

function getPersistentCachePath() {
  return path.join(getRuntimeDir(), PERSIST_FILE_NAME)
}

function schedulePersistFlush() {
  try {
    const filePath = getPersistentCachePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const entries = [...persistentStore.entries()]
      .map(([key, data]) => ({ key, value: data?.value || null, expiresAt: Number(data?.expiresAt || 0) }))
      .filter(entry => entry.key && entry.value && entry.expiresAt > Date.now())
      .sort((a, b) => b.expiresAt - a.expiresAt)
      .slice(0, PERSIST_MAX_ENTRIES)
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, entries }), 'utf8')
  } catch (err) {
    console.warn('[sportsdb] Cache persistence flush failed:', err.message)
  }
}

function hydratePersistentCache() {
  if (persistentLoaded) return
  persistentLoaded = true
  try {
    const filePath = getPersistentCachePath()
    if (!fs.existsSync(filePath)) return
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
    const now = Date.now()
    for (const entry of entries) {
      const key = String(entry?.key || '').trim()
      const value = entry?.value || null
      const expiresAt = Number(entry?.expiresAt || 0)
      if (!key || !value || !Number.isFinite(expiresAt) || expiresAt <= now) continue
      persistentStore.set(key, { value, expiresAt })
      cache.set(key, { value, expiresAt })
    }
  } catch (err) {
    console.warn('[sportsdb] Cache hydration failed (corrupt file?):', err.message)
  }
}

function persistResolvedArtwork(key, value, expiresAt) {
  if (!key || !value || !Number.isFinite(expiresAt)) return
  cache.set(key, { value, expiresAt })
  persistentStore.set(key, { value, expiresAt })
  schedulePersistFlush()
}

function getCachedValue(store, key) {
  const hit = store.get(key)
  if (!hit) return undefined
  if (!Number.isFinite(hit.expiresAt) || hit.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

function setCachedValue(store, key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeToken(value) {
  return normalizeSpace(value).toLowerCase()
}

function applyTeamAliases(value) {
  let text = String(value || '')
  for (const alias of TEAM_ALIASES) {
    text = text.replace(alias.re, alias.value)
  }
  return normalizeSpace(text)
}

function normalizeTeamName(value) {
  return normalizeToken(applyTeamAliases(String(value || '').replace(/[._]+/g, ' ')))
}

function normalizeLeagueName(value) {
  const mapped = mapLeague(value)
  return normalizeToken(mapped || value)
}

function buildLeagueIdentity(league = {}) {
  return String(
    league?.idLeague ||
    normalizeToken(league?.strLeague || league?.strLeagueAlternate || league?.strNaming || '')
  )
}

function uniqueBy(items = [], getKey) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = String(getKey(item) || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    const text = normalizeSpace(value)
    const key = normalizeToken(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function sportKeyFromLeagueCode(value) {
  const code = normalizeToken(value).replace(/\s+/g, '')
  if (!code) return ''
  if (['nba'].includes(code)) return 'basketball'
  if (['nfl'].includes(code)) return 'american-football'
  if (['ufc'].includes(code)) return 'mma'
  if (['f1', 'formula1', 'motogp', 'nascar', 'indycar', 'wrc', 'supercars', 'v8sc', 'wsbk', 'wec', 'formulae'].includes(code)) return 'motorsport'
  if (['pdc', 'bdo'].includes(code)) return 'darts'
  if (['pga', 'lpga', 'masters'].includes(code)) return 'golf'
  if (['mlb'].includes(code)) return 'baseball'
  if (['nhl'].includes(code)) return 'hockey'
  if (['wwe', 'aew'].includes(code)) return 'wrestling'
  const mappedEntry = getMappedLeagueEntry(value)
  if (mappedEntry?.sportKey) return mappedEntry.sportKey
  return ''
}

function sportsDbNameForSportKey(sportKey) {
  const key = String(sportKey || '').trim().toLowerCase()
  const map = {
    football: 'Soccer',
    basketball: 'Basketball',
    baseball: 'Baseball',
    hockey: 'Ice Hockey',
    'american-football': 'American Football',
    mma: 'MMA',
    boxing: 'Boxing',
    tennis: 'Tennis',
    rugby: 'Rugby',
    cricket: 'Cricket',
    motorsport: 'Motorsport',
    cycling: 'Cycling',
    wrestling: 'Combat Sports',
    snooker: 'Snooker',
    golf: 'Golf',
    olympics: 'Multisport'
  }
  return map[key] || ''
}

function sportsDbSportMatches(left, right) {
  const aliases = {
    fighting: ['fighting', 'mma', 'boxing', 'combat sports', 'wrestling'],
    mma: ['mma', 'fighting', 'combat sports'],
    boxing: ['boxing', 'fighting', 'combat sports'],
    wrestling: ['wrestling', 'combat sports', 'fighting'],
    'combat sports': ['combat sports', 'fighting', 'mma', 'boxing', 'wrestling']
  }

  const a = normalizeToken(left)
  const b = normalizeToken(right)
  if (!a || !b) return false
  if (a === b) return true

  const leftAliases = aliases[a] || [a]
  const rightAliases = aliases[b] || [b]
  return leftAliases.some(value => rightAliases.includes(value))
}

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeTitle(value) {
  const cleaned = normalizeSpace(
    cleanTitle(String(value || ''))
      .replace(/\.(mkv|mp4|avi|ts|m4v)$/i, '')
      .replace(/[\[\]\(\)\{\}]/g, ' ')
      .replace(/\b(?:19|20)\d{2}\/\d{2}\b/gi, ' ')
      .replace(/\b(?:19|20)\d{2}[.\-_\s]\d{2}[.\-_\s]\d{2}\b/gi, ' ')
      .replace(/\b\d{2}[.\-_\s]\d{2}[.\-_\s](?:19|20)\d{2}\b/gi, ' ')
      .replace(/\b(?:19|20)\d{2}\b/gi, ' ')
      .replace(/\b(?:mini|full|extended|highlights?|replay|prematch|pre[\s.\-_]*match|post[\s.\-_]*match|webrip|web[\s.\-_]*dl|bluray|hdtv|h264|h265|x264|x265|hevc|aac|ac3|ddp|truehd|dts|multi|english|eng|en|verum|skynz)\b/gi, ' ')
      .replace(/\b(?:rs|tip[\s.\-_]*off|regular[\s.\-_]*season|spring[\s.\-_]*training|olympic(?:s)?|closing[\s.\-_]*ceremony|opening[\s.\-_]*ceremony|games?)\b/gi, ' ')
      .replace(/\b(?:2160p\d*|1080p\d*|720p\d*|480p\d*|10bit|8bit|hdr10\+?|hdr|dovi|dv)\b/gi, ' ')
      .replace(/\s+/g, ' ')
  )
  const withAliases = applyTeamAliases(cleaned)
  const stripped = stripSportTerms(withAliases)
  return normalizeSpace(stripped || cleaned)
}

function parseIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function dateDistanceDays(a, b) {
  const left = parseIsoDate(a)
  const right = parseIsoDate(b)
  if (!left || !right) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)))
}

function capitalizeWords(value) {
  return normalizeSpace(value)
    .split(' ')
    .map(part => part ? (part[0].toUpperCase() + part.slice(1).toLowerCase()) : '')
    .join(' ')
    .trim()
}

function tokenizeTeamText(value) {
  return normalizeTeamName(value)
    .split(/\s+/)
    .filter(Boolean)
}

function buildTokenInitials(tokens = []) {
  return (Array.isArray(tokens) ? tokens : [])
    .map(token => String(token || '').trim())
    .filter(Boolean)
    .map(token => token[0])
    .join('')
}

function tokensEndWith(tokens, suffix) {
  if (!Array.isArray(tokens) || !Array.isArray(suffix) || suffix.length === 0 || suffix.length > tokens.length) return false
  for (let i = 0; i < suffix.length; i += 1) {
    if (tokens[tokens.length - suffix.length + i] !== suffix[i]) return false
  }
  return true
}

function tokensContainSequence(tokens, sequence) {
  if (!Array.isArray(tokens) || !Array.isArray(sequence) || sequence.length === 0 || sequence.length > tokens.length) return false
  for (let i = 0; i <= tokens.length - sequence.length; i += 1) {
    let match = true
    for (let j = 0; j < sequence.length; j += 1) {
      if (tokens[i + j] !== sequence[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

function splitAlternateTeamNames(value) {
  return String(value || '')
    .split(/[;,|]+/)
    .map(normalizeSpace)
    .filter(Boolean)
}

function buildTeamNameVariants(team = {}) {
  return uniqueStrings([
    team?.strTeam,
    team?.strTeamShort,
    ...splitAlternateTeamNames(team?.strAlternate)
  ])
}

function scoreTeamNameVariant(rawTeam, candidateName) {
  const rawTokens = tokenizeTeamText(rawTeam)
  const candidateTokens = tokenizeTeamText(candidateName)
  if (rawTokens.length === 0 || candidateTokens.length === 0) return 0

  const raw = rawTokens.join(' ')
  const rawCompact = rawTokens.join('')
  const candidateCompact = candidateTokens.join('')
  const rawInitials = buildTokenInitials(rawTokens)
  const candidateInitials = buildTokenInitials(candidateTokens)

  if (raw === candidateTokens.join(' ')) return 180
  if (tokensEndWith(candidateTokens, rawTokens)) return 165
  if (tokensEndWith(rawTokens, candidateTokens)) return 160
  if (rawCompact.length >= 2 && rawCompact === candidateInitials) return 155
  if (candidateCompact.length >= 2 && candidateCompact === rawInitials) return 150
  if (tokensContainSequence(candidateTokens, rawTokens)) return 145
  if (tokensContainSequence(rawTokens, candidateTokens)) return 140

  const candidateSet = new Set(candidateTokens)
  const overlap = rawTokens.filter(token => candidateSet.has(token)).length
  if (overlap >= Math.min(rawTokens.length, candidateTokens.length) && overlap > 0) return 110 + overlap * 5
  if (overlap >= 2) return 75 + overlap * 5
  if (overlap === 1 && (rawTokens.length === 1 || candidateTokens.length === 1)) return 55
  return 0
}

function scoreLeagueTeamCandidate(rawTeam, team = {}) {
  const variants = buildTeamNameVariants(team)
  let best = 0
  for (const variant of variants) {
    const variantScore = scoreTeamNameVariant(rawTeam, variant) + (normalizeToken(variant) === normalizeToken(team?.strTeam) ? 5 : 0)
    if (variantScore > best) best = variantScore
  }
  return best
}

function resolveOfficialTeamName(rawTeam, teams = []) {
  const ranked = (Array.isArray(teams) ? teams : [])
    .map(team => ({
      team,
      score: scoreLeagueTeamCandidate(rawTeam, team)
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 80) return normalizeSpace(rawTeam)
  return normalizeSpace(best.team?.strTeam || rawTeam)
}

function buildStructuredMatchQueries(structuredEvent, officialHomeTeam, officialAwayTeam) {
  const homeVariants = uniqueStrings([officialHomeTeam, structuredEvent?.homeTeam])
  const awayVariants = uniqueStrings([officialAwayTeam, structuredEvent?.awayTeam])
  const variants = []

  for (const homeTeam of homeVariants) {
    for (const awayTeam of awayVariants) {
      variants.push(`${homeTeam} vs ${awayTeam}`)
    }
  }

  return uniqueStrings(variants)
}

function stripEventSearchNoise(value) {
  let text = normalizeSpace(value)
  if (!text) return ''

  const suffixes = [
    /\b(?:race|qualifying|shootout|sprint)\b$/i,
    /\b(?:main[\s.\-_]*card|prelims?|early[\s.\-_]*prelims?)\b$/i,
    /\b(?:practice|practice\s+(?:one|two|three|1|2|3)|free[\s.\-_]*practice(?:\s+(?:one|two|three|1|2|3))?)\b$/i
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const suffix of suffixes) {
      const next = normalizeSpace(text.replace(suffix, ' '))
      if (next && next !== text) {
        text = next
        changed = true
      }
    }
  }

  return text
}

function buildEventQueryVariants(eventName, leagueDisplay = '') {
  const rawName = normalizeSpace(eventName)
  const strippedName = stripEventSearchNoise(rawName)
  return uniqueStrings([
    strippedName,
    strippedName && leagueDisplay ? `${leagueDisplay} ${strippedName}` : '',
    rawName,
    rawName && leagueDisplay ? `${leagueDisplay} ${rawName}` : ''
  ])
}

function buildGenericQueryFragments(value) {
  const noise = new Set([
    'mini', 'full', 'extended', 'highlights', 'highlight', 'replay',
    'prematch', 'pre', 'match', 'postmatch', 'post', 'webrip', 'webdl', 'web',
    'bluray', 'hdtv', 'x264', 'x265', 'h264', 'h265', 'hevc', 'aac', 'ac3', 'ddp',
    'truehd', 'dts', 'multi', 'english', 'eng', 'verum', 'skynz', 'fps'
  ])

  const tokens = normalizeToken(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !noise.has(token))
    .filter(token => !/^\d{1,2}$/.test(token))
    .filter(token => !/^(19|20)\d{2}$/.test(token))

  const variants = []
  const core = tokens.filter(token => token !== 'vs' && token !== 'v')
  if (core.length >= 2) {
    variants.push(capitalizeWords(core.slice(0, Math.min(4, core.length)).join(' ')))
    variants.push(capitalizeWords(core.slice(0, Math.min(6, core.length)).join(' ')))
  }
  if (core.length >= 3) {
    variants.push(capitalizeWords(core.slice(-3).join(' ')))
  }

  const strongest = [...core]
    .filter(token => token.length >= 6)
    .sort((a, b) => b.length - a.length)[0]
  if (strongest) variants.push(capitalizeWords(strongest))

  return variants
}

function hasVs(value) {
  return /\bvs\b|\bv\b/i.test(String(value || ''))
}

function extractDateHint(value, fallbackDate) {
  const candidates = [String(value || ''), String(fallbackDate || '')]
  for (const source of candidates) {
    const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`

    const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

    const plain = source.match(/((?:19|20)\d{2}-\d{2}-\d{2})/)
    if (plain) return plain[1]
  }
  return ''
}

function extractTeamsQuery(title) {
  const cleaned = applyTeamAliases(normalizeTitle(title))
  if (!hasVs(cleaned)) return ''

  const parts = cleaned.split(/\bvs\b|\bv\b/i)
  if (parts.length < 2) return ''

  const left = normalizeToken(parts[0]).split(' ').filter(Boolean)
  const right = normalizeToken(parts[1]).split(' ').filter(Boolean)
  if (left.length === 0 || right.length === 0) return ''

  const noise = new Set([
    'epl', 'premier', 'league', 'la', 'liga', 'serie', 'bundesliga', 'champions', 'super',
    'women', 'womens', 'cup', 'match', 'sports', 'tv', 'channel', 'st', 'hd', 'uhd',
    'fhd', 'uic', 'main', 'card', 'prelims', 'early', 'rs', 'nba', 'mlb', 'nfl', 'nhl',
    'tip', 'off', 'regular', 'season', 'spring', 'training', 'game', 'games', 'winter',
    'olympic', 'olympics', 'opening', 'closing', 'ceremony'
  ])

  const takeLeft = []
  for (let i = left.length - 1; i >= 0; i -= 1) {
    const token = left[i]
    if (!token || token.length < 2 || noise.has(token) || /^\d+$/.test(token) || /\d{3,4}p\d*fps?/.test(token)) continue
    takeLeft.unshift(token)
    if (takeLeft.length >= 3) break
  }

  const takeRight = []
  for (const token of right) {
    if (!token || token.length < 2 || noise.has(token) || /^\d+$/.test(token) || /\d{3,4}p\d*fps?/.test(token)) continue
    takeRight.push(token)
    if (takeRight.length >= 3) break
  }

  if (takeLeft.length === 0 || takeRight.length === 0) return ''
  return `${capitalizeWords(takeLeft.join(' '))} vs ${capitalizeWords(takeRight.join(' '))}`
}

function buildCandidateQueries(title, structuredEvent = null) {
  const original = normalizeSpace(String(title || structuredEvent?.raw || ''))
  const cleaned = normalizeTitle(title)
  if (!cleaned && !original) return []

  const variants = []

  // For non-vs event titles, use the event name directly as a high-priority query
  const eventParsed = structuredEvent?.eventName
    ? structuredEvent
    : parseSportsEventTitle(title)
  if (eventParsed?.eventName) {
    const leagueDisplay = normalizeSpace(mapLeague(eventParsed.league) || eventParsed.league || '')
    variants.push(...buildEventQueryVariants(eventParsed.eventName, leagueDisplay))
  }

  const teams = structuredEvent?.homeTeam && structuredEvent?.awayTeam
    ? `${normalizeSpace(structuredEvent.homeTeam)} vs ${normalizeSpace(structuredEvent.awayTeam)}`
    : extractTeamsQuery(title)
  if (teams) variants.push(teams)

  const raw = normalizeSpace(
    cleanTitle(String(title || ''))
      .replace(/\b(?:2160p\d*|1080p\d*|720p\d*|480p\d*|10bit|8bit|hdr10\+?|hdr|dovi|dv)\b/gi, ' ')
      .replace(/\b(?:webrip|web[\s.\-_]*dl|bluray|hdtv|h264|h265|x264|x265|hevc|aac|ac3|ddp|truehd|dts|multi|english|eng|verum|skynz)\b/gi, ' ')
      .replace(/\s+/g, ' ')
  )
  if (raw) variants.push(capitalizeWords(raw))
  variants.push(...buildGenericQueryFragments(raw || original))

  if (cleaned) variants.push(capitalizeWords(cleaned))

  const noDate = cleaned
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (noDate && noDate !== cleaned) variants.push(capitalizeWords(noDate))

  const deduped = []
  const seen = new Set()
  for (const variant of variants) {
    const key = normalizeToken(variant)
    if (!key || key.length < 6 || seen.has(key)) continue
    seen.add(key)
    deduped.push(variant)
    if (deduped.length >= 6) break
  }
  return deduped
}

function tokenize(value) {
  const stop = new Set([
    'vs', 'v', 'the', 'and', 'for', 'with', 'live', 'event', 'match', 'main', 'card',
    'prelims', 'early', 'season', 'week', 'day', 'tv', 'sport', 'sports', 'league',
    'full', 'mini', 'replay', 'highlights'
  ])
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(part => part.length > 1 && !/^\d+$/.test(part) && !stop.has(part))
}

function getSportMatchScore(titleSport, eventSportText) {
  const sport = normalizeToken(eventSportText || '')
  if (!titleSport || !sport) return 0

  if (sportsDbSportMatches(sportsDbNameForSportKey(titleSport) || titleSport, sport)) {
    return 8
  }

  const isMatch = (
    (sport.includes('soccer') && titleSport === 'football') ||
    (sport.includes('basketball') && titleSport === 'basketball') ||
    (sport.includes('baseball') && titleSport === 'baseball') ||
    (sport.includes('ice hockey') && titleSport === 'hockey') ||
    (sport.includes('american football') && titleSport === 'american-football') ||
    (sport.includes('mma') && titleSport === 'mma') ||
    (sport.includes('boxing') && titleSport === 'boxing') ||
    (sport.includes('tennis') && titleSport === 'tennis') ||
    (sport.includes('rugby') && titleSport === 'rugby') ||
    (sport.includes('cricket') && titleSport === 'cricket') ||
    (sport.includes('motorsport') && titleSport === 'motorsport') ||
    (sport.includes('cycling') && titleSport === 'cycling') ||
    ((sport.includes('wrestling') || sport.includes('combat')) && titleSport === 'wrestling') ||
    (sport.includes('snooker') && titleSport === 'snooker') ||
    (sport.includes('golf') && titleSport === 'golf')
  )
  return isMatch ? 8 : -6
}

function scoreEvent(event, title, dateHint, titleSport = '') {
  const titleTokens = tokenize(title)
  const eventText = [
    event?.strEvent,
    event?.strEventAlternate,
    event?.strFilename,
    event?.strChannel,
    event?.strEventCountry,
    event?.strLeague,
    event?.strHomeTeam,
    event?.strAwayTeam
  ].filter(Boolean).join(' ')

  const eventTokens = new Set(tokenize(eventText))
  let overlap = 0
  let longHits = 0
  for (const token of titleTokens) {
    if (!eventTokens.has(token)) continue
    if (token.length >= 4) {
      overlap += 3
      longHits += 1
    } else {
      overlap += 1
    }
  }

  const imageBonus = pickAnyImage(event) ? 5 : 0
  const exactDateMatch = Boolean(dateHint && String(event?.dateEvent || '') === dateHint)
  const dateBonus = exactDateMatch ? 6 : 0
  const sportBonus = getSportMatchScore(titleSport, event?.strSport)
  const score = overlap + imageBonus + dateBonus + sportBonus
  return { score, overlap, longHits, exactDateMatch, sportBonus }
}

function pickPosterImage(event) {
  const candidates = [
    event?.strEventPoster,
    event?.strPoster,
    event?.strEventSquare,
    event?.strSquare,
    event?.strEventThumb,
    event?.strThumb,
    event?.strEventBanner,
    event?.strBanner,
    event?.strFanart,
    event?.strLogo
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickLandscapeImage(event) {
  const candidates = [
    event?.strEventThumb,
    event?.strThumb,
    event?.strEventBanner,
    event?.strBanner,
    event?.strFanart,
    event?.strEventSquare,
    event?.strSquare,
    event?.strEventPoster,
    event?.strPoster,
    event?.strLogo
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickBackgroundImage(event) {
  const candidates = [
    event?.strEventBanner,
    event?.strBanner,
    event?.strFanart,
    event?.strEventThumb,
    event?.strThumb,
    event?.strEventPoster,
    event?.strPoster,
    event?.strEventSquare,
    event?.strSquare,
    event?.strLogo
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickAnyImage(event) {
  return pickLandscapeImage(event) || pickPosterImage(event) || pickBackgroundImage(event)
}

function pickEventLogo(event) {
  const candidates = [
    event?.strLogo
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function makeEventKey(event) {
  if (!event) return ''
  const id = String(event.idEvent || event.id || '').trim()
  if (id) return id
  const fallback = `${event.strEvent || ''}|${event.dateEvent || ''}|${event.strChannel || ''}`
  return normalizeToken(fallback)
}

function toEventList(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.event)) return payload.event
  if (Array.isArray(payload.events)) return payload.events
  if (Array.isArray(payload.tvevents)) return payload.tvevents
  if (Array.isArray(payload.tvhighlights)) return payload.tvhighlights
  return []
}

function pickLeaguePosterImage(league) {
  const candidates = [
    league?.strPoster,
    league?.strLogo,
    league?.strBadge,
    league?.strFanart1,
    league?.strFanart2,
    league?.strFanart3,
    league?.strBanner
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickLeagueLandscapeImage(league) {
  const candidates = [
    league?.strFanart1,
    league?.strFanart2,
    league?.strFanart3,
    league?.strBanner,
    league?.strPoster,
    league?.strLogo,
    league?.strBadge
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickLeagueBackgroundImage(league) {
  const candidates = [
    league?.strFanart1,
    league?.strFanart2,
    league?.strFanart3,
    league?.strBanner,
    league?.strPoster,
    league?.strLogo,
    league?.strBadge
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickLeagueLogo(league) {
  const candidates = [
    league?.strLogo,
    league?.strBadge
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickTeamBadgeImage(team) {
  const candidates = [
    team?.strBadge,
    team?.strTeamBadge,
    team?.strTeamLogo,
    team?.strTeamJersey,
    team?.strTeamBanner,
    team?.strTeamFanart1
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickTeamPosterImage(team) {
  return pickTeamBadgeImage(team)
}

function pickTeamLandscapeImage(team) {
  const candidates = [
    team?.strTeamFanart1,
    team?.strTeamBanner,
    team?.strTeamLogo,
    team?.strBadge,
    team?.strTeamJersey
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function pickTeamLogo(team) {
  const candidates = [
    team?.strBadge,
    team?.strTeamBadge,
    team?.strTeamLogo
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function buildStructuredEventData(item) {
  const explicitLeague = normalizeSpace(item?.league || item?.leagueCode || '')
  const explicitDate = extractDateHint(item?.date || item?.eventDate || '', item?.publishDate || item?.pubDate || '')
  const explicitHomeTeam = normalizeSpace(item?.homeTeam || '')
  const explicitAwayTeam = normalizeSpace(item?.awayTeam || '')
  if (explicitLeague && explicitDate && explicitHomeTeam && explicitAwayTeam) {
    return {
      league: explicitLeague,
      date: explicitDate,
      homeTeam: explicitHomeTeam,
      awayTeam: explicitAwayTeam,
      quality: normalizeSpace(item?.quality || ''),
      raw: String(item?.title || '').trim()
    }
  }

  const vsResult = parseSportsTitle(item?.title || '', explicitDate || item?.publishDate || item?.pubDate || '')
  if (vsResult) return vsResult

  // Try event-style parsing for non-vs titles (F1, UFC, Supercars, etc.)
  const eventResult = parseSportsEventTitle(item?.title || '')
  if (eventResult) {
    return {
      league: eventResult.league,
      date: eventResult.date || explicitDate || '',
      eventName: eventResult.eventName,
      quality: eventResult.quality || '',
      raw: eventResult.raw
    }
  }

  return null
}

function structuredFingerprint(event) {
  if (!event) return ''
  if (event.homeTeam && event.awayTeam) {
    return [
      normalizeLeagueName(event.league),
      String(event.date || '').slice(0, 10),
      normalizeTeamName(event.homeTeam),
      normalizeTeamName(event.awayTeam)
    ].join('|')
  }
  if (event.eventName) {
    return [
      normalizeLeagueName(event.league),
      String(event.date || '').slice(0, 10),
      normalizeToken(event.eventName)
    ].join('|')
  }
  return ''
}

function structuredLookupCacheKey(apiKey, event) {
  return `${CACHE_KEY_VERSION}|structured|${String(apiKey || '').trim().toLowerCase()}|${structuredFingerprint(event)}`
}

function cacheKey(apiKey, title, publishDate, eventId = '', sportHint = '', structuredEvent = null) {
  return `${CACHE_KEY_VERSION}|${String(apiKey || '').trim().toLowerCase()}|${String(eventId || '').trim().toLowerCase()}|${normalizeToken(title)}|${String(publishDate || '').slice(0, 10)}|${normalizeToken(sportHint)}|${structuredFingerprint(structuredEvent)}`
}

function eventArtworkCacheKey(apiKey, eventId = '') {
  const normalizedEventId = String(eventId || '').trim().toLowerCase()
  if (!normalizedEventId) return ''
  return `${CACHE_KEY_VERSION}|event-artwork|${String(apiKey || '').trim().toLowerCase()}|${normalizedEventId}`
}

function structuredArtworkCacheKey(apiKey, structuredEvent = null) {
  const fingerprint = structuredFingerprint(structuredEvent)
  if (!fingerprint) return ''
  return `${CACHE_KEY_VERSION}|structured-artwork|${String(apiKey || '').trim().toLowerCase()}|${fingerprint}`
}

function leagueArtworkCacheKey(apiKey, league = '', date = '', sportHint = '') {
  const normalizedLeague = normalizeLeagueName(league) || normalizeToken(league)
  const normalizedDate = String(date || '').slice(0, 10)
  const normalizedSport = normalizeToken(sportHint)
  if (!normalizedLeague && !normalizedDate && !normalizedSport) return ''
  return `${CACHE_KEY_VERSION}|league-artwork|${String(apiKey || '').trim().toLowerCase()}|${normalizedLeague}|${normalizedDate}|${normalizedSport}`
}

function persistResolvedArtworkVariants(primaryKey, value, expiresAt, options = {}) {
  if (!value || !Number.isFinite(expiresAt)) return

  if (primaryKey) persistResolvedArtwork(primaryKey, value, expiresAt)

  const apiKey = String(options.apiKey || '').trim()
  const eventKey = eventArtworkCacheKey(apiKey, options.eventId || value?.eventId)
  if (eventKey) persistResolvedArtwork(eventKey, value, expiresAt)

  const structuredKey = structuredArtworkCacheKey(apiKey, options.structuredEvent)
  if (structuredKey) persistResolvedArtwork(structuredKey, value, expiresAt)

  const source = String(value?.source || '').trim()
  if (source === 'thesportsdb-league') {
    const leagueKey = leagueArtworkCacheKey(
      apiKey,
      options.league || value?.league || '',
      options.dateHint || value?.eventDate || '',
      options.sportHint || value?.sport || ''
    )
    if (leagueKey) persistResolvedArtwork(leagueKey, value, expiresAt)
  }
}

function scoreLeague(league, title, titleSport) {
  const leagueText = [
    league?.strLeague,
    league?.strLeagueAlternate,
    league?.strNaming,
    league?.strCountry
  ].filter(Boolean).join(' ')
  const titleTokens = tokenize(title)
  const leagueTokens = new Set(tokenize(leagueText))
  let overlap = 0
  for (const token of titleTokens) {
    if (!leagueTokens.has(token)) continue
    overlap += token.length >= 4 ? 3 : 1
  }

  const normalizedTitle = normalizeToken(title)
  const normalizedLeague = normalizeToken(leagueText)
  let bonus = 0
  if (titleSport && normalizeToken(league?.strSport || '').includes(normalizeToken(titleSport))) bonus += 6
  if (/\bwta\b/.test(normalizedTitle) && /\bwta\b/.test(normalizedLeague)) bonus += 8
  if (/\batp\b/.test(normalizedTitle) && /\batp\b/.test(normalizedLeague)) bonus += 8
  if (/\bolympic/.test(normalizedTitle) && /\bolympic/.test(normalizedLeague)) bonus += 10
  if (/\bdavis[\s-]*cup\b/.test(normalizedTitle) && /\bdavis[\s-]*cup\b/.test(normalizedLeague)) bonus += 10
  if (/\blaver[\s-]*cup\b/.test(normalizedTitle) && /\blaver[\s-]*cup\b/.test(normalizedLeague)) bonus += 10
  if (normalizedTitle.includes(normalizedLeague) || normalizedLeague.includes(normalizedTitle)) bonus += 5
  return overlap + bonus
}

function toLeagueFallbackValue(leagueFallback, dateHint, sportHint) {
  const poster = String(leagueFallback?.poster || '').trim()
  const landscapeImage = String(leagueFallback?.landscapeImage || '').trim() || poster
  if (!poster && !landscapeImage) return null
  const backgroundImage = String(leagueFallback?.backgroundImage || '').trim() || landscapeImage || poster
  const logo = String(leagueFallback?.logo || '').trim()
  return {
    image: landscapeImage || poster,
    poster: poster || landscapeImage,
    landscapeImage: landscapeImage || poster,
    backgroundImage,
    logo,
    eventId: '',
    eventName: '',
    eventDate: dateHint,
    sport: leagueFallback.sport || sportHint || '',
    league: leagueFallback.league || '',
    leagueLogo: logo,
    source: 'thesportsdb-league'
  }
}

function getLeagueMatchScore(expectedLeague, actualLeague) {
  const expected = normalizeLeagueName(expectedLeague)
  const actual = normalizeLeagueName(actualLeague)
  if (!expected || !actual) return 0
  if (expected === actual) return 20
  if (expected.includes(actual) || actual.includes(expected)) return 12
  return 0
}

function getLeagueMatchScoreForLeague(expectedLeague, league = {}) {
  return Math.max(
    getLeagueMatchScore(expectedLeague, league?.strLeague),
    getLeagueMatchScore(expectedLeague, league?.strLeagueAlternate),
    getLeagueMatchScore(expectedLeague, league?.strNaming)
  )
}

function teamNameMatches(expected, actual) {
  return scoreTeamNameVariant(expected, actual) >= 80
}

function getStructuredTeamMatchScore(event, homeTeam, awayTeam) {
  const eventHome = String(event?.strHomeTeam || '').trim()
  const eventAway = String(event?.strAwayTeam || '').trim()
  if (!eventHome || !eventAway) return 0

  const orderedHome = teamNameMatches(homeTeam, eventHome)
  const orderedAway = teamNameMatches(awayTeam, eventAway)
  if (orderedHome && orderedAway) return 100

  const swappedHome = teamNameMatches(homeTeam, eventAway)
  const swappedAway = teamNameMatches(awayTeam, eventHome)
  if (swappedHome && swappedAway) return 90

  const hits = [orderedHome, orderedAway, swappedHome, swappedAway].filter(Boolean).length
  if (hits >= 2) return 70
  if (hits === 1) return 25
  return 0
}

function buildArtworkValue(event, posterImage, landscapeImage, backgroundImage, logoImage = '', source = 'thesportsdb') {
  if (!event) return null
  const poster = String(posterImage || '').trim()
  const landscape = String(landscapeImage || '').trim() || poster
  const background = String(backgroundImage || '').trim() || landscape || poster
  const logo = String(logoImage || '').trim()
  if (!poster && !landscape && !background) return null
  return {
    image: landscape || poster || background,
    poster: poster || landscape || background,
    landscapeImage: landscape || poster || background,
    backgroundImage: background || landscape || poster,
    logo,
    eventId: String(event.idEvent || ''),
    eventName: String(event.strEvent || '').trim(),
    eventDate: String(event.dateEvent || '').trim(),
    sport: String(event.strSport || '').trim(),
    league: String(event.strLeague || '').trim(),
    homeTeam: String(event.strHomeTeam || '').trim(),
    awayTeam: String(event.strAwayTeam || '').trim(),
    source
  }
}

function applyArtworkContext(value, context = {}) {
  if (!value || !context || typeof context !== 'object') return value
  const next = { ...value }
  const homeBadge = String(context.homeBadge || '').trim()
  const awayBadge = String(context.awayBadge || '').trim()
  const leagueLogo = String(context.leagueLogo || '').trim()
  const homeTeam = String(context.homeTeam || value.homeTeam || '').trim()
  const awayTeam = String(context.awayTeam || value.awayTeam || '').trim()
  if (homeBadge) next.homeBadge = homeBadge
  if (awayBadge) next.awayBadge = awayBadge
  if (leagueLogo) next.leagueLogo = leagueLogo
  if (homeTeam) next.homeTeam = homeTeam
  if (awayTeam) next.awayTeam = awayTeam
  return next
}

class SportsDbClient {
  constructor(apiKey, options = {}) {
    this.apiKey = String(apiKey || process.env.SPORTSDB_API_KEY || DEFAULT_API_KEY).trim() || DEFAULT_API_KEY
    const cacheHours = Math.max(1, Math.min(24, toNumber(options.cacheHours, DEFAULT_ARTWORK_CACHE_HOURS)))
    this.artworkHitTtlMs = cacheHours * 60 * 60 * 1000
    this.missTtlMs = DEFAULT_MISS_CACHE_HOURS * 60 * 60 * 1000
    this.structuredEventTtlMs = STRUCTURED_EVENT_CACHE_TTL_MS
    this.leagueAssetTtlMs = LEAGUE_ASSET_CACHE_TTL_MS
    this.timeoutMs = Math.max(3000, Math.min(20000, toNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS)))
  }

  async _fetchList(endpoint, params = {}) {
    if (Date.now() < rateLimitedUntil) return []

    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params || {})) {
      const trimmed = String(value || '').trim()
      if (!trimmed) continue
      query.set(key, trimmed)
    }
    if ([...query.keys()].length === 0) return []

    const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/${endpoint}?${query.toString()}`
    const hit = getCachedValue(endpointCache, url)
    if (hit !== undefined) return hit

    const ongoing = endpointInFlight.get(url)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            Accept: 'application/json'
          }
        })
        if (res.status === 429 || res.status === 403) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        }
        if (!res.ok) {
          setCachedValue(endpointCache, url, [], this.missTtlMs)
          return []
        }
        const raw = await res.text()
        const trimmed = String(raw || '').trim()
        if (trimmed.startsWith('<')) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
          setCachedValue(endpointCache, url, [], this.missTtlMs)
          return []
        }

        let data = null
        try {
          data = trimmed ? JSON.parse(trimmed) : null
        } catch (_) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
          setCachedValue(endpointCache, url, [], this.missTtlMs)
          return []
        }
        const list = toEventList(data)
        const ttlMs = list.length > 0 ? this.artworkHitTtlMs : this.missTtlMs
        setCachedValue(endpointCache, url, list, ttlMs)
        return list
      } catch (_) {
        setCachedValue(endpointCache, url, [], this.missTtlMs)
        return []
      } finally {
        endpointInFlight.delete(url)
      }
    })()

    endpointInFlight.set(url, pending)
    return pending
  }

  async _fetchEvents(query, dateHint) {
    if (!query) return []
    const jobs = [this._fetchList('searchevents.php', { e: query })]
    if (dateHint) {
      jobs.push(this._fetchList('searchevents.php', { e: query, d: dateHint }))
    }
    const sets = await Promise.all(jobs)
    return sets.flat()
  }

  async _fetchEventsByDate(date, sport) {
    if (!date) return []
    const jobs = [this._fetchList('eventsday.php', { d: date })]
    if (sport) jobs.push(this._fetchList('eventsday.php', { d: date, s: sport }))
    const sets = await Promise.all(jobs)
    return sets.flat()
  }

  async _fetchTvEventsByDate(date, sport) {
    if (!date) return []
    const jobs = [this._fetchList('eventstv.php', { d: date })]
    if (sport) jobs.push(this._fetchList('eventstv.php', { d: date, s: sport }))
    const sets = await Promise.all(jobs)
    return sets.flat()
  }

  async _fetchHighlightsByDate(date) {
    if (!date) return []
    return this._fetchList('eventshighlights.php', { d: date })
  }

  async _lookupLeague(idLeague) {
    const key = String(idLeague || '').trim()
    if (!key) return null
    const hit = getCachedValue(leagueCache, key)
    if (hit !== undefined) return hit || null

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookupleague.php?id=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (!res.ok) {
        setCachedValue(leagueCache, key, null, this.missTtlMs)
        return null
      }
      const data = await res.json()
      const league = Array.isArray(data?.leagues) ? data.leagues[0] : null
      setCachedValue(leagueCache, key, league || null, league ? this.leagueAssetTtlMs : this.missTtlMs)
      return league || null
    } catch (_) {
      setCachedValue(leagueCache, key, null, this.missTtlMs)
      return null
    }
  }

  async _lookupEvent(idEvent) {
    const key = String(idEvent || '').trim()
    if (!key) return null
    const hit = getCachedValue(eventLookupCache, key)
    if (hit !== undefined) return hit || null

    const ongoing = eventLookupInFlight.get(key)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookupevent.php?id=${encodeURIComponent(key)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
        if (!res.ok) {
          setCachedValue(eventLookupCache, key, null, this.missTtlMs)
          return null
        }
        const data = await res.json()
        const event = Array.isArray(data?.events) ? data.events[0] : null
        setCachedValue(eventLookupCache, key, event || null, event ? this.artworkHitTtlMs : this.missTtlMs)
        return event || null
      } catch (_) {
        setCachedValue(eventLookupCache, key, null, this.missTtlMs)
        return null
      } finally {
        eventLookupInFlight.delete(key)
      }
    })()

    eventLookupInFlight.set(key, pending)
    return pending
  }

  async _lookupTeam(idTeam) {
    const key = String(idTeam || '').trim()
    if (!key) return null
    const hit = getCachedValue(teamCache, key)
    if (hit !== undefined) return hit || null

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookupteam.php?id=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (!res.ok) {
        setCachedValue(teamCache, key, null, this.missTtlMs)
        return null
      }
      const data = await res.json()
      const team = Array.isArray(data?.teams) ? data.teams[0] : null
      setCachedValue(teamCache, key, team || null, team ? this.leagueAssetTtlMs : this.missTtlMs)
      return team || null
    } catch (_) {
      setCachedValue(teamCache, key, null, this.missTtlMs)
      return null
    }
  }

  async _fetchTeamsByLeague(leagueHint = '') {
    const mappedLeague = getMappedLeagueEntry(leagueHint)
    const leagueId = String(mappedLeague?.idLeague || '').trim()
    if (!leagueId) return []

    const hit = getCachedValue(teamsByLeagueCache, leagueId)
    if (hit !== undefined) return hit

    const ongoing = teamsByLeagueInFlight.get(leagueId)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookup_all_teams.php?id=${encodeURIComponent(leagueId)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
        if (!res.ok) {
          setCachedValue(teamsByLeagueCache, leagueId, [], this.missTtlMs)
          return []
        }

        const data = await res.json()
        const teams = Array.isArray(data?.teams) ? data.teams : []
        setCachedValue(teamsByLeagueCache, leagueId, teams, teams.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs)
        return teams
      } catch (_) {
        setCachedValue(teamsByLeagueCache, leagueId, [], this.missTtlMs)
        return []
      } finally {
        teamsByLeagueInFlight.delete(leagueId)
      }
    })()

    teamsByLeagueInFlight.set(leagueId, pending)
    return pending
  }

  async _resolveStructuredTeamNames(structuredEvent = {}) {
    const rawHomeTeam = normalizeSpace(structuredEvent?.homeTeam)
    const rawAwayTeam = normalizeSpace(structuredEvent?.awayTeam)
    if (!rawHomeTeam || !rawAwayTeam) {
      return {
        homeTeam: rawHomeTeam,
        awayTeam: rawAwayTeam
      }
    }

    const teams = await this._fetchTeamsByLeague(structuredEvent.league)
    if (!Array.isArray(teams) || teams.length === 0) {
      return {
        homeTeam: rawHomeTeam,
        awayTeam: rawAwayTeam
      }
    }

    return {
      homeTeam: resolveOfficialTeamName(rawHomeTeam, teams),
      awayTeam: resolveOfficialTeamName(rawAwayTeam, teams)
    }
  }

  async _fetchDirectMappedLeaguesBySport(sportName) {
    const sport = normalizeToken(sportName)
    if (!sport) return []

    const entries = uniqueBy(
      listMappedLeagues().filter((entry) =>
        sportsDbSportMatches(entry?.sportsDbSport || '', sport) &&
        String(entry?.idLeague || '').trim()
      ),
      (entry) => entry.idLeague || entry.code
    )

    const leagues = []
    for (const entry of entries) {
      const league = await this._lookupLeague(entry.idLeague)
      if (!league) continue
      leagues.push(league)
    }

    return uniqueBy(leagues, buildLeagueIdentity)
  }

  async _fetchLeaguesBySport(sportName) {
    const sport = String(sportName || '').trim()
    if (!sport) return []
    const directMappedLeagues = await this._fetchDirectMappedLeaguesBySport(sport)
    if (Date.now() < rateLimitedUntil) return directMappedLeagues

    const key = normalizeToken(sport)
    const hit = getCachedValue(leaguesBySportCache, key)
    if (hit !== undefined) return hit

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/search_all_leagues.php?s=${encodeURIComponent(sport)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (res.status === 429 || res.status === 403) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      }
      if (!res.ok) {
        const ttlMs = directMappedLeagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
        setCachedValue(leaguesBySportCache, key, directMappedLeagues, ttlMs)
        return directMappedLeagues
      }
      const raw = await res.text()
      const trimmed = String(raw || '').trim()
      if (trimmed.startsWith('<')) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        const ttlMs = directMappedLeagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
        setCachedValue(leaguesBySportCache, key, directMappedLeagues, ttlMs)
        return directMappedLeagues
      }

      let data = null
      try {
        data = trimmed ? JSON.parse(trimmed) : null
      } catch (_) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        const ttlMs = directMappedLeagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
        setCachedValue(leaguesBySportCache, key, directMappedLeagues, ttlMs)
        return directMappedLeagues
      }
      const leagues = uniqueBy([
        ...directMappedLeagues,
        ...(Array.isArray(data?.countries) ? data.countries : [])
      ], buildLeagueIdentity)
      const ttlMs = leagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
      setCachedValue(leaguesBySportCache, key, leagues, ttlMs)
      return leagues
    } catch (_) {
      const ttlMs = directMappedLeagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
      setCachedValue(leaguesBySportCache, key, directMappedLeagues, ttlMs)
      return directMappedLeagues
    }
  }

  async _resolveLeagueArtworkFromTitle(title, titleSport, leagueHint = '') {
    const sportName = sportsDbNameForSportKey(titleSport)
    if (!sportName) return null
    const leagues = await this._fetchLeaguesBySport(sportName)
    if (!Array.isArray(leagues) || leagues.length === 0) return null

    let ranked = leagues
      .map(league => ({ league, score: scoreLeague(league, leagueHint || title, sportName) }))
      .sort((a, b) => b.score - a.score)

    if (leagueHint) {
      const mappedLeagueEntry = getMappedLeagueEntry(leagueHint)
      if (mappedLeagueEntry?.idLeague) {
        const directMatch = ranked.find((entry) => String(entry.league?.idLeague || '').trim() === mappedLeagueEntry.idLeague)
        if (directMatch) {
          ranked = [directMatch]
        } else {
          const strictLeagueMatches = ranked.filter(entry => getLeagueMatchScoreForLeague(leagueHint, entry.league) > 0)
          if (strictLeagueMatches.length === 0) return null
          ranked = strictLeagueMatches
        }
      } else {
        const strictLeagueMatches = ranked.filter(entry => getLeagueMatchScoreForLeague(leagueHint, entry.league) > 0)
        if (strictLeagueMatches.length === 0) return null
        ranked = strictLeagueMatches
      }
    }

    const best = ranked[0]?.league
    if (!best) return null

    const poster = pickLeaguePosterImage(best)
    const landscapeImage = pickLeagueLandscapeImage(best) || poster
    const backgroundImage = pickLeagueBackgroundImage(best) || landscapeImage || poster
    if (!poster && !landscapeImage) return null

    return {
      poster,
      landscapeImage,
      backgroundImage,
      logo: pickLeagueLogo(best),
      league: String(best.strLeague || '').trim(),
      sport: String(best.strSport || '').trim()
    }
  }

  async _resolveFallbackImage(bestEvent, prefer = 'poster') {
    if (!bestEvent) return ''
    let image = prefer === 'background'
      ? pickBackgroundImage(bestEvent)
      : prefer === 'landscape'
        ? pickLandscapeImage(bestEvent)
        : pickPosterImage(bestEvent)
    if (image) return image

    const league = await this._lookupLeague(bestEvent.idLeague)
    image = prefer === 'background'
      ? (pickLeagueBackgroundImage(league) || pickLeagueLandscapeImage(league) || pickLeaguePosterImage(league))
      : prefer === 'landscape'
        ? (pickLeagueLandscapeImage(league) || pickLeaguePosterImage(league) || pickLeagueBackgroundImage(league))
        : (pickLeaguePosterImage(league) || pickLeagueLandscapeImage(league) || pickLeagueBackgroundImage(league))
    if (image) return image

    const home = await this._lookupTeam(bestEvent.idHomeTeam)
    image = prefer === 'landscape'
      ? pickTeamLandscapeImage(home)
      : pickTeamPosterImage(home)
    if (image) return image

    const away = await this._lookupTeam(bestEvent.idAwayTeam)
    image = prefer === 'landscape'
      ? pickTeamLandscapeImage(away)
      : pickTeamPosterImage(away)
    return image || ''
  }

  async _resolveFallbackLogo(bestEvent) {
    if (!bestEvent) return ''
    let logo = pickEventLogo(bestEvent)
    if (logo) return logo

    const league = await this._lookupLeague(bestEvent.idLeague)
    logo = pickLeagueLogo(league)
    if (logo) return logo

    const home = await this._lookupTeam(bestEvent.idHomeTeam)
    logo = pickTeamLogo(home)
    if (logo) return logo

    const away = await this._lookupTeam(bestEvent.idAwayTeam)
    return pickTeamLogo(away)
  }

  async _resolveArtworkContext(bestEvent) {
    if (!bestEvent) return {}
    const [league, home, away] = await Promise.all([
      this._lookupLeague(bestEvent.idLeague),
      this._lookupTeam(bestEvent.idHomeTeam),
      this._lookupTeam(bestEvent.idAwayTeam)
    ])

    return {
      homeTeam: String(bestEvent.strHomeTeam || '').trim(),
      awayTeam: String(bestEvent.strAwayTeam || '').trim(),
      homeBadge: pickTeamBadgeImage(home),
      awayBadge: pickTeamBadgeImage(away),
      leagueLogo: pickLeagueLogo(league)
    }
  }

  async findEventByStructuredData(input = {}) {
    const structuredEvent = buildStructuredEventData(input)
    if (!structuredEvent) return null

    const key = structuredLookupCacheKey(this.apiKey, structuredEvent)
    const hit = getCachedValue(eventCache, key)
    if (hit !== undefined) return hit || null

    const ongoing = eventInFlight.get(key)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const byId = new Map()
        const addEvent = (event) => {
          const eventKey = makeEventKey(event)
          if (!eventKey) return
          byId.set(eventKey, event)
        }

        const resolvedTeams = await this._resolveStructuredTeamNames(structuredEvent)
        const expectedHomeTeam = resolvedTeams.homeTeam || structuredEvent.homeTeam
        const expectedAwayTeam = resolvedTeams.awayTeam || structuredEvent.awayTeam
        const queries = buildStructuredMatchQueries(structuredEvent, expectedHomeTeam, expectedAwayTeam)

        for (const query of queries.slice(0, 4)) {
          const candidates = await this._fetchEvents(query, structuredEvent.date)
          for (const event of candidates) addEvent(event)
          if (byId.size >= 12) break
        }

        const structuredSport = sportsDbNameForSportKey(sportKeyFromLeagueCode(structuredEvent.league))
        if (structuredEvent.date && byId.size < 10) {
          const [dayEvents, tvEvents] = await Promise.all([
            this._fetchEventsByDate(structuredEvent.date, structuredSport),
            this._fetchTvEventsByDate(structuredEvent.date, structuredSport)
          ])
          for (const event of dayEvents) addEvent(event)
          for (const event of tvEvents) addEvent(event)
        }

        if (byId.size === 0) {
          setCachedValue(eventCache, key, null, this.missTtlMs)
          return null
        }

        const ranked = [...byId.values()]
          .map(event => {
            const teamScore = getStructuredTeamMatchScore(event, expectedHomeTeam, expectedAwayTeam)
            const dateDistance = dateDistanceDays(structuredEvent.date, event?.dateEvent)
            const dateScore = Number.isFinite(dateDistance)
              ? (dateDistance === 0 ? 30 : dateDistance === 1 ? 20 : -100)
              : -100
            const leagueScore = getLeagueMatchScore(structuredEvent.league, event?.strLeague)
            return {
              event,
              score: teamScore + dateScore + leagueScore,
              teamScore,
              dateDistance,
              leagueScore
            }
          })
          .filter(entry => {
            const requiresLeagueMatch = Boolean(normalizeLeagueName(structuredEvent.league))
            return entry.teamScore >= 70 && entry.dateDistance <= 1 && (!requiresLeagueMatch || entry.leagueScore > 0)
          })
          .sort((a, b) => b.score - a.score)

        const best = ranked[0]?.event || null
        setCachedValue(eventCache, key, best, best ? this.structuredEventTtlMs : this.missTtlMs)
        return best
      } catch (_) {
        setCachedValue(eventCache, key, null, this.missTtlMs)
        return null
      } finally {
        eventInFlight.delete(key)
      }
    })()

    eventInFlight.set(key, pending)
    return pending
  }

  async getEventArtwork(item) {
    hydratePersistentCache()

    const title = String(item?.title || '').trim()
    const publishDate = String(item?.publishDate || item?.pubDate || '').trim()
    const structuredEvent = buildStructuredEventData(item)
    const structuredSportHint = structuredEvent ? sportKeyFromLeagueCode(structuredEvent.league) : ''
    const itemSportHint = String(item?.sportHint || item?.sport || structuredSportHint).trim().toLowerCase()
    const titleSport = itemSportHint || detectSport(title)
    const requestedEventIdRaw = String(item?.eventId || '').trim()
    const dateHint = structuredEvent?.date || extractDateHint(title, publishDate)
    const mappedLeague = mapLeague(structuredEvent?.league || item?.league || item?.leagueCode || '') ||
      normalizeSpace(item?.league || structuredEvent?.league || item?.leagueCode || '')
    const sportHint = sportsDbNameForSportKey(titleSport || structuredSportHint)
    if (!title && !structuredEvent && !requestedEventIdRaw && !mappedLeague) return null

    const key = cacheKey(
      this.apiKey,
      title,
      publishDate,
      requestedEventIdRaw,
      titleSport,
      structuredEvent
    )
    const now = Date.now()
    const hit = cache.get(key)
    if (hit && hit.expiresAt > now) return hit.value

    const eventArtHit = getCachedValue(cache, eventArtworkCacheKey(this.apiKey, requestedEventIdRaw))
    if (eventArtHit !== undefined) return eventArtHit || null

    const structuredArtHit = getCachedValue(cache, structuredArtworkCacheKey(this.apiKey, structuredEvent))
    if (structuredArtHit !== undefined) return structuredArtHit || null

    // Cache-only mode: never make live API calls to TheSportsDB during
    // catalog or meta requests.  The background autofill populates the
    // persistent cache; on a miss we return null so the artwork resolver
    // falls through to the instant generated-SVG poster card.
    return null
  }
}

module.exports = { SportsDbClient, normalizeTeamName }
