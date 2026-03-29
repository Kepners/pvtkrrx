const fs = require('fs')
const path = require('path')
const { cleanTitle } = require('../utils/parser')
const { detectSport, stripSportTerms } = require('../utils/sportClassifier')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { mapLeague } = require('../utils/leagueMap')
const { resolveRuntimeDir } = require('../utils/runtimeDir')

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json'
const DEFAULT_API_KEY = '123'
const DEFAULT_TIMEOUT_MS = 8000
const PERSIST_FILE_NAME = 'sportsdb-poster-cache.json'
const PERSIST_MAX_ENTRIES = 5000
const CACHE_KEY_VERSION = 'v4'
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_ARTWORK_CACHE_HOURS = 24
const DEFAULT_MISS_CACHE_HOURS = 6
const STRUCTURED_EVENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const LEAGUE_ASSET_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const cache = new Map()
const inFlight = new Map()
const leagueCache = new Map()
const teamCache = new Map()
const eventCache = new Map()
const eventInFlight = new Map()
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

function persistResolvedPoster(key, value, expiresAt) {
  if (!key || !value || !Number.isFinite(expiresAt)) return
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
  if (mapLeague(value)) return 'football'
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

    const iso = source.match(/\b((?:19|20)\d{2})[.\-_\s](\d{2})[.\-_\s](\d{2})\b/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    const dmy = source.match(/\b(\d{2})[.\-_\s](\d{2})[.\-_\s]((?:19|20)\d{2})\b/)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

    const plain = source.match(/\b((?:19|20)\d{2}-\d{2}-\d{2})\b/)
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

function buildCandidateQueries(title) {
  const original = normalizeSpace(String(title || ''))
  const cleaned = normalizeTitle(title)
  if (!cleaned && !original) return []

  const variants = []

  // For non-vs event titles, use the event name directly as a high-priority query
  const eventParsed = parseSportsEventTitle(title)
  if (eventParsed?.eventName) {
    const leagueDisplay = mapLeague(eventParsed.league) || eventParsed.league || ''
    if (leagueDisplay && eventParsed.eventName) {
      variants.push(`${leagueDisplay} ${eventParsed.eventName}`)
    }
    variants.push(capitalizeWords(eventParsed.eventName))
  }

  const teams = extractTeamsQuery(title)
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
    league?.strBadge,
    league?.strLogo,
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

function pickTeamPosterImage(team) {
  const candidates = [
    team?.strTeamLogo,
    team?.strBadge,
    team?.strTeamJersey,
    team?.strTeamBanner,
    team?.strTeamFanart1,
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
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

  const vsResult = parseSportsTitle(item?.title || '')
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
  return [
    normalizeLeagueName(event.league),
    String(event.date || '').slice(0, 10),
    normalizeTeamName(event.homeTeam),
    normalizeTeamName(event.awayTeam)
  ].join('|')
}

function structuredLookupCacheKey(apiKey, event) {
  return `${CACHE_KEY_VERSION}|structured|${String(apiKey || '').trim().toLowerCase()}|${structuredFingerprint(event)}`
}

function cacheKey(apiKey, title, publishDate, eventId = '', sportHint = '', structuredEvent = null) {
  return `${CACHE_KEY_VERSION}|${String(apiKey || '').trim().toLowerCase()}|${String(eventId || '').trim().toLowerCase()}|${normalizeToken(title)}|${String(publishDate || '').slice(0, 10)}|${normalizeToken(sportHint)}|${structuredFingerprint(structuredEvent)}`
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
  return {
    image: landscapeImage || poster,
    poster: poster || landscapeImage,
    landscapeImage: landscapeImage || poster,
    backgroundImage,
    eventId: '',
    eventName: '',
    eventDate: dateHint,
    sport: leagueFallback.sport || sportHint || '',
    league: leagueFallback.league || '',
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

function teamNameMatches(expected, actual) {
  const expectedName = normalizeTeamName(expected)
  const actualName = normalizeTeamName(actual)
  if (!expectedName || !actualName) return false
  return actualName === expectedName || actualName.includes(expectedName) || expectedName.includes(actualName)
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

function buildArtworkValue(event, posterImage, landscapeImage, backgroundImage, source = 'thesportsdb') {
  if (!event) return null
  const poster = String(posterImage || '').trim()
  const landscape = String(landscapeImage || '').trim() || poster
  const background = String(backgroundImage || '').trim() || landscape || poster
  if (!poster && !landscape && !background) return null
  return {
    image: landscape || poster || background,
    poster: poster || landscape || background,
    landscapeImage: landscape || poster || background,
    backgroundImage: background || landscape || poster,
    eventId: String(event.idEvent || ''),
    eventName: String(event.strEvent || '').trim(),
    eventDate: String(event.dateEvent || '').trim(),
    sport: String(event.strSport || '').trim(),
    league: String(event.strLeague || '').trim(),
    source
  }
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

  async _fetchLeaguesBySport(sportName) {
    const sport = String(sportName || '').trim()
    if (!sport) return []
    if (Date.now() < rateLimitedUntil) return []

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
        setCachedValue(leaguesBySportCache, key, [], this.missTtlMs)
        return []
      }
      const raw = await res.text()
      const trimmed = String(raw || '').trim()
      if (trimmed.startsWith('<')) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        setCachedValue(leaguesBySportCache, key, [], this.missTtlMs)
        return []
      }

      let data = null
      try {
        data = trimmed ? JSON.parse(trimmed) : null
      } catch (_) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        setCachedValue(leaguesBySportCache, key, [], this.missTtlMs)
        return []
      }
      const leagues = Array.isArray(data?.countries) ? data.countries : []
      const ttlMs = leagues.length > 0 ? this.leagueAssetTtlMs : this.missTtlMs
      setCachedValue(leaguesBySportCache, key, leagues, ttlMs)
      return leagues
    } catch (_) {
      setCachedValue(leaguesBySportCache, key, [], this.missTtlMs)
      return []
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
      const strictLeagueMatches = ranked.filter(entry => getLeagueMatchScore(leagueHint, entry.league?.strLeague) > 0)
      if (strictLeagueMatches.length === 0) return null
      ranked = strictLeagueMatches
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
        const query = `${capitalizeWords(structuredEvent.homeTeam)} vs ${capitalizeWords(structuredEvent.awayTeam)}`
        const candidates = await this._fetchList('searchevents.php', { e: query })
        if (!Array.isArray(candidates) || candidates.length === 0) {
          setCachedValue(eventCache, key, null, this.missTtlMs)
          return null
        }

        const ranked = candidates
          .map(event => {
            const teamScore = getStructuredTeamMatchScore(event, structuredEvent.homeTeam, structuredEvent.awayTeam)
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
    if (!title && !structuredEvent) return null

    const key = cacheKey(
      this.apiKey,
      title,
      publishDate,
      String(item?.eventId || '').trim(),
      titleSport,
      structuredEvent
    )
    const now = Date.now()
    const hit = cache.get(key)
    if (hit && hit.expiresAt > now) return hit.value

    const ongoing = inFlight.get(key)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const dateHint = structuredEvent?.date || extractDateHint(title, publishDate)
        const mappedLeague = mapLeague(structuredEvent?.league || '') || String(structuredEvent?.league || '').trim()
        const sportHint = sportsDbNameForSportKey(titleSport || structuredSportHint)
        const queries = buildCandidateQueries(title)
        if (queries.length === 0 && !(structuredEvent || (dateHint && sportHint))) {
          cache.set(key, { value: null, expiresAt: now + this.missTtlMs })
          return null
        }

        if (structuredEvent) {
          const structuredMatch = await this.findEventByStructuredData(structuredEvent)
          const structuredPoster = await this._resolveFallbackImage(structuredMatch, 'poster')
          const structuredLandscape = await this._resolveFallbackImage(structuredMatch, 'landscape') || structuredPoster
          const structuredBackground = await this._resolveFallbackImage(structuredMatch, 'background') || structuredLandscape || structuredPoster
          const structuredValue = buildArtworkValue(
            structuredMatch,
            structuredPoster,
            structuredLandscape,
            structuredBackground,
            'thesportsdb-structured'
          )
          if (structuredValue) {
            const expiresAt = Date.now() + this.artworkHitTtlMs
            cache.set(key, { value: structuredValue, expiresAt })
            persistResolvedPoster(key, structuredValue, expiresAt)
            return structuredValue
          }
        }

        const byId = new Map()
        const addEvent = (event) => {
          const key = makeEventKey(event)
          if (!key) return
          byId.set(key, event)
        }

        for (const query of queries.slice(0, 2)) {
          const events = await this._fetchEvents(query, dateHint)
          for (const event of events) addEvent(event)
          if (byId.size >= 15) break
        }

        if (dateHint && byId.size < 10) {
          const [dayEvents, tvEvents] = await Promise.all([
            this._fetchEventsByDate(dateHint, sportHint),
            this._fetchTvEventsByDate(dateHint, sportHint)
          ])
          for (const event of dayEvents) addEvent(event)
          for (const event of tvEvents) addEvent(event)
        }

        if (byId.size === 0) {
          const leagueFallback = await this._resolveLeagueArtworkFromTitle(title, titleSport || structuredSportHint, mappedLeague)
          const leagueValue = toLeagueFallbackValue(leagueFallback, dateHint, sportHint)
          if (leagueValue) {
            const expiresAt = Date.now() + this.artworkHitTtlMs
            cache.set(key, { value: leagueValue, expiresAt })
            persistResolvedPoster(key, leagueValue, expiresAt)
            return leagueValue
          }
          cache.set(key, { value: null, expiresAt: Date.now() + this.missTtlMs })
          return null
        }

        const ranked = [...byId.values()]
          .map(event => {
            const scored = scoreEvent(event, title, dateHint, titleSport)
            return { event, ...scored }
          })
          .filter(entry =>
            entry.longHits > 0 ||
            entry.overlap >= 4 ||
            entry.score >= 10 ||
            (entry.exactDateMatch && entry.sportBonus >= 0 && entry.overlap >= 1)
          )
          .sort((a, b) => b.score - a.score)
        const best = ranked[0]?.event
        const posterImage = await this._resolveFallbackImage(best, 'poster')
        const landscapeImage = await this._resolveFallbackImage(best, 'landscape') || posterImage
        const backgroundImage = await this._resolveFallbackImage(best, 'background') || landscapeImage || posterImage
        if (!best || (!posterImage && !landscapeImage && !backgroundImage)) {
          const leagueFallback = await this._resolveLeagueArtworkFromTitle(title, titleSport || structuredSportHint, mappedLeague)
          const leagueValue = toLeagueFallbackValue(leagueFallback, dateHint, sportHint)
          if (leagueValue) {
            const expiresAt = Date.now() + this.artworkHitTtlMs
            cache.set(key, { value: leagueValue, expiresAt })
            persistResolvedPoster(key, leagueValue, expiresAt)
            return leagueValue
          }
          cache.set(key, { value: null, expiresAt: Date.now() + this.missTtlMs })
          return null
        }

        const value = buildArtworkValue(best, posterImage, landscapeImage, backgroundImage, 'thesportsdb')
        const expiresAt = Date.now() + this.artworkHitTtlMs
        cache.set(key, { value, expiresAt })
        persistResolvedPoster(key, value, expiresAt)
        return value
      } catch (_) {
        cache.set(key, { value: null, expiresAt: Date.now() + this.missTtlMs })
        return null
      } finally {
        inFlight.delete(key)
      }
    })()

    inFlight.set(key, pending)
    return pending
  }
}

module.exports = { SportsDbClient, normalizeTeamName }
