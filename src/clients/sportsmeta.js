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

  async getEvent(canonicalId) {
    const normalizedId = String(canonicalId || '').trim()
    if (!normalizedId || !this.baseUrl) return null

    let lastError = null
    const candidateBaseUrls = uniqueBaseUrls([this.baseUrl, ...this.fallbackBaseUrls])
    for (const baseUrl of candidateBaseUrls) {
      try {
        const response = await fetch(
          `${baseUrl}/event/${encodeURIComponent(normalizedId)}`,
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
          continue
        }

        const payload = await response.json()
        if (payload?.event) return payload
      } catch (error) {
        lastError = error
      }
    }

    if (lastError) throw lastError
    return null
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  SportsMetaClient
}
