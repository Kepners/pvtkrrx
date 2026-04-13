const DEFAULT_BASE_URL = 'https://sportsmeta.pvtkrrx.cc'
const DEFAULT_INTERNAL_BASE_URL = 'http://10.0.1.1:3210'
const DEFAULT_TIMEOUT_MS = Math.max(
  1500,
  parseInt(process.env.PVTKRRX_SPORTSMETA_TIMEOUT_MS || '4000', 10)
)

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

function normalizeSportsMetaResolveQuery(query = {}) {
  const normalized = {
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

        const response = await fetch(
          url.toString(),
          {
            headers: {
              accept: 'application/json'
            },
            signal: AbortSignal.timeout(this.timeoutMs)
          }
        )

        if (response.status === 404) return null
        if (!response.ok) {
          lastError = new Error(`SportsMeta request failed with ${response.status}`)
          lastError.status = response.status
          continue
        }

        const payload = await response.json()
        if (payload && typeof payload === 'object') return payload
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
}

module.exports = {
  DEFAULT_BASE_URL,
  normalizeSportsMetaPayload,
  normalizeSportsMetaResolveQuery,
  SportsMetaClient
}
