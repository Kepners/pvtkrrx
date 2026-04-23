const DEFAULT_BASE_URL = 'https://sportsmeta.pvtkrrx.cc'
const DEFAULT_INTERNAL_BASE_URL = 'http://10.0.1.1:3210'
const DEFAULT_TIMEOUT_MS = Math.max(
  1500,
  parseInt(process.env.PVTKRRX_SPORTSMETA_TIMEOUT_MS || '4000', 10)
)
const SPORTS_META_CACHE_TTL_MS = Math.max(
  1000,
  parseInt(process.env.PVTKRRX_SPORTSMETA_CACHE_MS || '60000', 10)
)
const SPORTS_META_CACHE_MAX_KEYS = Math.max(
  100,
  parseInt(process.env.PVTKRRX_SPORTSMETA_CACHE_MAX_KEYS || '3000', 10)
)
const sportsMetaJsonCache = new Map()
const sportsMetaJsonInFlight = new Map()

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function uniqueBaseUrls(values = []) {
  const seen = new Set()
  const ordered = []
  for (const value of values) {
    const normalized = normalizeBaseUrl(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

function inferFallbackBaseUrls(options = {}) {
  const hasExplicitBaseUrl = Boolean(normalizeBaseUrl(
    options.baseUrl ||
    process.env.PVTKRRX_SPORTSMETA_BASE_URL
  ))
  if (hasExplicitBaseUrl) return []
  if (!process.env.COOLIFY_RESOURCE_UUID) return []

  return uniqueBaseUrls([
    process.env.PVTKRRX_SPORTSMETA_INTERNAL_BASE_URL ||
    DEFAULT_INTERNAL_BASE_URL
  ])
}

function normalizeResolveQueryValue(value) {
  return String(value || '').trim()
}

function trimSportsMetaCache() {
  while (sportsMetaJsonCache.size > SPORTS_META_CACHE_MAX_KEYS) {
    const oldestKey = sportsMetaJsonCache.keys().next().value
    if (!oldestKey) break
    sportsMetaJsonCache.delete(oldestKey)
  }
}

async function requestSportsMetaJson(urlString, timeoutMs) {
  const now = Date.now()
  const cached = sportsMetaJsonCache.get(urlString)
  if (cached && cached.expiresAt > now) return cached.value
  if (sportsMetaJsonInFlight.has(urlString)) return sportsMetaJsonInFlight.get(urlString)

  const pending = (async () => {
    const response = await fetch(
      urlString,
      {
        headers: {
          accept: 'application/json'
        },
        signal: AbortSignal.timeout(timeoutMs)
      }
    )

    if (response.status === 404) {
      return { ok: true, payload: null }
    }
    if (!response.ok) {
      const error = new Error(`SportsMeta request failed with ${response.status}`)
      error.status = response.status
      throw error
    }

    const payload = await response.json()
    return {
      ok: true,
      payload: payload && typeof payload === 'object' ? payload : null
    }
  })()
    .then((value) => {
      sportsMetaJsonCache.set(urlString, {
        value,
        expiresAt: Date.now() + SPORTS_META_CACHE_TTL_MS
      })
      trimSportsMetaCache()
      return value
    })
    .finally(() => {
      sportsMetaJsonInFlight.delete(urlString)
    })

  sportsMetaJsonInFlight.set(urlString, pending)
  return pending
}

function normalizeSportsMetaResolveQuery(query = {}) {
  const normalized = {
    recordType: normalizeResolveQueryValue(query?.recordType || query?.type),
    title: normalizeResolveQueryValue(query?.title),
    date: normalizeResolveQueryValue(query?.date),
    sport: normalizeResolveQueryValue(query?.sport),
    league: normalizeResolveQueryValue(query?.league),
    home: normalizeResolveQueryValue(query?.home || query?.homeTeam),
    away: normalizeResolveQueryValue(query?.away || query?.awayTeam),
    event: normalizeResolveQueryValue(query?.event || query?.eventName)
  }

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => Boolean(value))
  )
}

function normalizeSportsMetaPayload(payload = {}) {
  const event = payload?.event || {}
  const assets = payload?.assets || {}
  const canonicalId = String(event?.id || payload?.id || '').trim()
  if (!canonicalId) return null

  const normalizedEvent = {
    id: canonicalId,
    type: String(event?.type || 'movie').trim() || 'movie',
    name: String(event?.name || event?.title || canonicalId).trim() || canonicalId,
    title: String(event?.title || event?.name || canonicalId).trim() || canonicalId,
    description: String(event?.description || '').trim(),
    sport: String(event?.sport || '').trim(),
    league: String(event?.league || '').trim(),
    date: String(event?.date || '').trim(),
    homeTeam: String(event?.homeTeam || '').trim(),
    awayTeam: String(event?.awayTeam || '').trim(),
    eventId: String(event?.eventId || '').trim(),
    source: String(event?.source || 'sportsmeta').trim() || 'sportsmeta',
    truthStatus: String(event?.truthStatus || '').trim(),
    caveat: String(event?.caveat || '').trim()
  }

  const normalizedAssets = {
    poster: String(assets?.poster || '').trim(),
    background: String(assets?.background || '').trim(),
    landscape: String(assets?.landscape || '').trim(),
    logo: String(assets?.logo || '').trim(),
    leagueLogo: String(assets?.leagueLogo || '').trim(),
    homeBadge: String(assets?.homeBadge || '').trim(),
    awayBadge: String(assets?.awayBadge || '').trim()
  }

  return {
    canonicalId,
    event: normalizedEvent,
    assets: normalizedAssets,
    sportsArtwork: {
      poster: normalizedAssets.poster,
      image: normalizedAssets.landscape,
      landscapeImage: normalizedAssets.landscape,
      backgroundImage: normalizedAssets.background,
      logo: normalizedAssets.logo,
      leagueLogo: normalizedAssets.leagueLogo,
      homeBadge: normalizedAssets.homeBadge,
      awayBadge: normalizedAssets.awayBadge,
      eventName: normalizedEvent.title || normalizedEvent.name,
      league: normalizedEvent.league,
      sport: normalizedEvent.sport,
      eventDate: normalizedEvent.date,
      homeTeam: normalizedEvent.homeTeam,
      awayTeam: normalizedEvent.awayTeam,
      eventId: normalizedEvent.eventId,
      source: normalizedEvent.source
    }
  }
}

class SportsMetaClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ||
      process.env.PVTKRRX_SPORTSMETA_BASE_URL ||
      DEFAULT_BASE_URL
    )
    this.fallbackBaseUrls = inferFallbackBaseUrls(options)
    this.timeoutMs = Math.max(500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  }

  async _requestJson(pathname, query = null) {
    let lastError = null
    const candidateBaseUrls = uniqueBaseUrls([this.baseUrl, ...this.fallbackBaseUrls])
    for (const baseUrl of candidateBaseUrls) {
      try {
        const url = new URL(`${baseUrl}${pathname}`)
        for (const [key, value] of Object.entries(query || {})) {
          if (!String(value || '').trim()) continue
          url.searchParams.set(key, String(value).trim())
        }
        const result = await requestSportsMetaJson(url.toString(), this.timeoutMs)
        return result?.payload || null
      } catch (error) {
        lastError = error
      }
    }

    if (lastError) throw lastError
    return null
  }

  async getEvent(canonicalId) {
    const normalizedId = String(canonicalId || '').trim()
    if (!normalizedId || !this.baseUrl) return null

    const payload = await this._requestJson(`/event/${encodeURIComponent(normalizedId)}`)
    return normalizeSportsMetaPayload(payload)
  }

  async resolveEvent(query = {}) {
    const normalizedQuery = normalizeSportsMetaResolveQuery(query)
    if (Object.keys(normalizedQuery).length === 0 || !this.baseUrl) return null

    const payload = await this._requestJson('/resolve', normalizedQuery)
    return normalizeSportsMetaPayload(payload)
  }

  async searchCatalog(sport, search = '', options = {}) {
    const sportSlug = resolveSportSlug(sport)
    const normalizedSearch = String(search || '').trim()
    if (!sportSlug || !normalizedSearch || !this.baseUrl) return []

    const skip = Math.max(0, Number.parseInt(String(options.skip || '0'), 10) || 0)
    const extra = [`search=${encodeURIComponent(normalizedSearch)}`]
    if (skip > 0) extra.push(`skip=${skip}`)

    const payload = await this._requestJson(
      `/catalog/movie/sportsmeta-${encodeURIComponent(sportSlug)}/${extra.join('/')}.json`
    )

    return Array.isArray(payload?.metas)
      ? payload.metas
          .map((meta) => ({
            id: String(meta?.id || '').trim(),
            name: String(meta?.name || '').trim(),
            description: String(meta?.description || '').trim(),
            releaseInfo: String(meta?.releaseInfo || '').trim()
          }))
          .filter((meta) => Boolean(meta.id))
      : []
  }
}

const SUPPORTED_SPORT_SLUGS = new Set([
  'american-football',
  'baseball',
  'basketball',
  'cricket',
  'cycling',
  'darts',
  'fighting',
  'football',
  'golf',
  'hockey',
  'ice-hockey',
  'mma',
  'motorsport',
  'rugby',
  'wrestling'
])

function normalizeSportSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveSportSlug(value) {
  const slug = normalizeSportSlug(value)
  if (!slug) return ''
  if (SUPPORTED_SPORT_SLUGS.has(slug)) return slug
  if (slug === 'boxing') return 'fighting'
  if (slug === 'ufc' || slug === 'mixed-martial-arts') return 'mma'
  if (slug === 'formula-1' || slug === 'formula1' || slug === 'f1') return 'motorsport'
  if (slug === 'nhl' || slug === 'hockey') return 'hockey'
  if (slug === 'nba' || slug === 'wnba') return 'basketball'
  return slug
}

function getPublicSportsMetaBaseUrl(overrideBaseUrl) {
  return normalizeBaseUrl(
    overrideBaseUrl ||
    process.env.PVTKRRX_SPORTSMETA_BASE_URL ||
    DEFAULT_BASE_URL
  )
}

function buildSportsMetaAssetUrl(baseUrl, variant, canonicalId) {
  const base = getPublicSportsMetaBaseUrl(baseUrl)
  const v = String(variant || '').trim()
  const id = String(canonicalId || '').trim()
  if (!base || !v || !id) return ''
  return `${base}/asset/${encodeURIComponent(v)}/${encodeURIComponent(id)}`
}

function buildSportsMetaDefaultAssetUrl(baseUrl, variant, sport, league = '') {
  const base = getPublicSportsMetaBaseUrl(baseUrl)
  const v = String(variant || '').trim()
  const slug = resolveSportSlug(sport)
  if (!base || !v || !slug) return ''
  const url = new URL(`${base}/asset/default/${encodeURIComponent(v)}/${encodeURIComponent(slug)}`)
  const leagueValue = String(league || '').trim()
  if (leagueValue) url.searchParams.set('league', leagueValue)
  return url.toString()
}

module.exports = {
  DEFAULT_BASE_URL,
  buildSportsMetaAssetUrl,
  buildSportsMetaDefaultAssetUrl,
  getPublicSportsMetaBaseUrl,
  normalizeSportsMetaPayload,
  normalizeSportsMetaResolveQuery,
  resolveSportSlug,
  SportsMetaClient
}
