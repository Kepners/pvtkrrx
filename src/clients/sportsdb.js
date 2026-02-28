const fs = require('fs')
const path = require('path')
const { cleanTitle } = require('../utils/parser')
const { detectSport, stripSportTerms } = require('../utils/sportClassifier')

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json'
const DEFAULT_API_KEY = '123'
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_HIT_CACHE_HOURS = 24
const DEFAULT_MISS_CACHE_MINUTES = 30
const PERSIST_FILE_NAME = 'sportsdb-poster-cache.json'
const PERSIST_MAX_ENTRIES = 5000
const CACHE_KEY_VERSION = 'v2'
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000

const cache = new Map()
const inFlight = new Map()
const leagueCache = new Map()
const teamCache = new Map()
const eventCache = new Map()
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
  const configured = String(process.env.PVTKRRX_RUNTIME_DIR || '').trim()
  if (configured) return configured
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Roaming')
  return path.join(appData, 'PVTKRRX', 'runtime')
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
  } catch (_) {
    // ignore cache persistence failures
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
  } catch (_) {
    // ignore corrupt cache file
  }
}

function persistResolvedPoster(key, value, expiresAt) {
  if (!key || !value || !Number.isFinite(expiresAt)) return
  persistentStore.set(key, { value, expiresAt })
  schedulePersistFlush()
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

function pickBackgroundImage(event) {
  const candidates = [
    event?.strEventBanner,
    event?.strBanner,
    event?.strEventThumb,
    event?.strThumb,
    event?.strFanart,
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
  return pickPosterImage(event) || pickBackgroundImage(event)
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

function pickLeagueImage(league) {
  const candidates = [
    league?.strPoster,
    league?.strFanart1,
    league?.strFanart2,
    league?.strFanart3,
    league?.strBanner,
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

function pickTeamImage(team) {
  const candidates = [
    team?.strTeamFanart1,
    team?.strTeamBanner,
    team?.strTeamLogo,
    team?.strBadge
  ]
  for (const value of candidates) {
    const url = String(value || '').trim()
    if (url) return url
  }
  return ''
}

function cacheKey(apiKey, title, publishDate, eventId = '', sportHint = '') {
  return `${CACHE_KEY_VERSION}|${String(apiKey || '').trim().toLowerCase()}|${String(eventId || '').trim().toLowerCase()}|${normalizeToken(title)}|${String(publishDate || '').slice(0, 10)}|${normalizeToken(sportHint)}`
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
  if (!leagueFallback?.poster) return null
  return {
    image: leagueFallback.poster,
    poster: leagueFallback.poster,
    backgroundImage: leagueFallback.backgroundImage || leagueFallback.poster,
    eventId: '',
    eventName: '',
    eventDate: dateHint,
    sport: leagueFallback.sport || sportHint || '',
    league: leagueFallback.league || '',
    source: 'thesportsdb-league'
  }
}

class SportsDbClient {
  constructor(apiKey, options = {}) {
    this.apiKey = String(apiKey || process.env.SPORTSDB_API_KEY || DEFAULT_API_KEY).trim() || DEFAULT_API_KEY
    const cacheHours = Math.max(1, Math.min(168, toNumber(options.cacheHours, DEFAULT_HIT_CACHE_HOURS)))
    const missCacheMinutes = Math.max(5, Math.min(720, toNumber(options.missCacheMinutes, DEFAULT_MISS_CACHE_MINUTES)))
    this.hitTtlMs = cacheHours * 60 * 60 * 1000
    this.missTtlMs = missCacheMinutes * 60 * 1000
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
    const now = Date.now()
    const hit = endpointCache.get(url)
    if (hit && hit.expiresAt > now) return hit.value

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
          endpointCache.set(url, { value: [], expiresAt: Date.now() + this.missTtlMs })
          return []
        }
        const raw = await res.text()
        const trimmed = String(raw || '').trim()
        if (trimmed.startsWith('<')) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
          endpointCache.set(url, { value: [], expiresAt: Date.now() + this.missTtlMs })
          return []
        }

        let data = null
        try {
          data = trimmed ? JSON.parse(trimmed) : null
        } catch (_) {
          rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
          endpointCache.set(url, { value: [], expiresAt: Date.now() + this.missTtlMs })
          return []
        }
        const list = toEventList(data)
        const ttlMs = list.length > 0
          ? Math.min(this.hitTtlMs, 6 * 60 * 60 * 1000)
          : this.missTtlMs
        endpointCache.set(url, { value: list, expiresAt: Date.now() + ttlMs })
        return list
      } catch (_) {
        endpointCache.set(url, { value: [], expiresAt: Date.now() + this.missTtlMs })
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
    const hit = leagueCache.get(key)
    if (hit) return hit

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookupleague.php?id=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (!res.ok) return null
      const data = await res.json()
      const league = Array.isArray(data?.leagues) ? data.leagues[0] : null
      if (league) leagueCache.set(key, league)
      return league || null
    } catch (_) {
      return null
    }
  }

  async _lookupTeam(idTeam) {
    const key = String(idTeam || '').trim()
    if (!key) return null
    const hit = teamCache.get(key)
    if (hit) return hit

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/lookupteam.php?id=${encodeURIComponent(key)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (!res.ok) return null
      const data = await res.json()
      const team = Array.isArray(data?.teams) ? data.teams[0] : null
      if (team) teamCache.set(key, team)
      return team || null
    } catch (_) {
      return null
    }
  }

  async _fetchLeaguesBySport(sportName) {
    const sport = String(sportName || '').trim()
    if (!sport) return []
    if (Date.now() < rateLimitedUntil) return []

    const key = normalizeToken(sport)
    const now = Date.now()
    const hit = leaguesBySportCache.get(key)
    if (hit && hit.expiresAt > now) return hit.value

    try {
      const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/search_all_leagues.php?s=${encodeURIComponent(sport)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
      if (res.status === 429 || res.status === 403) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
      }
      if (!res.ok) {
        leaguesBySportCache.set(key, { value: [], expiresAt: Date.now() + this.missTtlMs })
        return []
      }
      const raw = await res.text()
      const trimmed = String(raw || '').trim()
      if (trimmed.startsWith('<')) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        leaguesBySportCache.set(key, { value: [], expiresAt: Date.now() + this.missTtlMs })
        return []
      }

      let data = null
      try {
        data = trimmed ? JSON.parse(trimmed) : null
      } catch (_) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        leaguesBySportCache.set(key, { value: [], expiresAt: Date.now() + this.missTtlMs })
        return []
      }
      const leagues = Array.isArray(data?.countries) ? data.countries : []
      const ttlMs = leagues.length > 0 ? Math.min(this.hitTtlMs, 24 * 60 * 60 * 1000) : this.missTtlMs
      leaguesBySportCache.set(key, { value: leagues, expiresAt: Date.now() + ttlMs })
      return leagues
    } catch (_) {
      leaguesBySportCache.set(key, { value: [], expiresAt: Date.now() + this.missTtlMs })
      return []
    }
  }

  async _resolveLeagueArtworkFromTitle(title, titleSport) {
    const sportName = sportsDbNameForSportKey(titleSport)
    if (!sportName) return null
    const leagues = await this._fetchLeaguesBySport(sportName)
    if (!Array.isArray(leagues) || leagues.length === 0) return null

    const ranked = leagues
      .map(league => ({ league, score: scoreLeague(league, title, sportName) }))
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]?.league
    if (!best) return null

    const poster = pickLeagueImage(best)
    const backgroundImage = pickLeagueBackgroundImage(best) || poster
    if (!poster) return null

    return {
      poster,
      backgroundImage,
      league: String(best.strLeague || '').trim(),
      sport: String(best.strSport || '').trim()
    }
  }

  async _resolveFallbackImage(bestEvent, prefer = 'poster') {
    if (!bestEvent) return ''
    let image = prefer === 'background'
      ? pickBackgroundImage(bestEvent)
      : pickPosterImage(bestEvent)
    if (image) return image

    const league = await this._lookupLeague(bestEvent.idLeague)
    image = prefer === 'background'
      ? (pickLeagueBackgroundImage(league) || pickLeagueImage(league))
      : (pickLeagueImage(league) || pickLeagueBackgroundImage(league))
    if (image) return image

    const home = await this._lookupTeam(bestEvent.idHomeTeam)
    image = pickTeamImage(home)
    if (image) return image

    const away = await this._lookupTeam(bestEvent.idAwayTeam)
    image = pickTeamImage(away)
    return image || ''
  }

  async getEventArtwork(item) {
    hydratePersistentCache()

    const title = String(item?.title || '').trim()
    const publishDate = String(item?.publishDate || item?.pubDate || '').trim()
    const itemSportHint = String(item?.sportHint || item?.sport || '').trim().toLowerCase()
    const titleSport = itemSportHint || detectSport(title)
    if (!title) return null

    const key = cacheKey(this.apiKey, title, publishDate, '', titleSport)
    const now = Date.now()
    const hit = cache.get(key)
    if (hit && hit.expiresAt > now) return hit.value

    const ongoing = inFlight.get(key)
    if (ongoing) return ongoing

    const pending = (async () => {
      try {
        const dateHint = extractDateHint(title, publishDate)
        const sportHint = sportsDbNameForSportKey(titleSport)
        const queries = buildCandidateQueries(title)
        if (queries.length === 0 && !(dateHint && sportHint)) {
          cache.set(key, { value: null, expiresAt: now + this.missTtlMs })
          return null
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
          const leagueFallback = await this._resolveLeagueArtworkFromTitle(title, titleSport)
          const leagueValue = toLeagueFallbackValue(leagueFallback, dateHint, sportHint)
          if (leagueValue) {
            const expiresAt = Date.now() + this.hitTtlMs
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
        const image = await this._resolveFallbackImage(best, 'poster')
        const backgroundImage = await this._resolveFallbackImage(best, 'background') || image
        if (!best || !image) {
          const leagueFallback = await this._resolveLeagueArtworkFromTitle(title, titleSport)
          const leagueValue = toLeagueFallbackValue(leagueFallback, dateHint, sportHint)
          if (leagueValue) {
            const expiresAt = Date.now() + this.hitTtlMs
            cache.set(key, { value: leagueValue, expiresAt })
            persistResolvedPoster(key, leagueValue, expiresAt)
            return leagueValue
          }
          cache.set(key, { value: null, expiresAt: Date.now() + this.missTtlMs })
          return null
        }

        const value = {
          image,
          poster: image,
          backgroundImage,
          eventId: String(best.idEvent || ''),
          eventName: String(best.strEvent || '').trim(),
          eventDate: String(best.dateEvent || '').trim(),
          sport: String(best.strSport || '').trim(),
          league: String(best.strLeague || '').trim(),
          source: 'thesportsdb'
        }
        const expiresAt = Date.now() + this.hitTtlMs
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

module.exports = { SportsDbClient }
