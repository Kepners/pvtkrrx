const DEFAULT_BASE_URL = 'https://sportsmeta.pvtkrrx.cc'
const DEFAULT_TIMEOUT_MS = Math.max(
  1500,
  parseInt(process.env.PVTKRRX_SPORTSMETA_TIMEOUT_MS || '4000', 10)
)

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

class SportsMetaClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ||
      process.env.PVTKRRX_SPORTSMETA_BASE_URL ||
      DEFAULT_BASE_URL
    )
    this.timeoutMs = Math.max(500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  }

  async getEvent(canonicalId) {
    const normalizedId = String(canonicalId || '').trim()
    if (!normalizedId || !this.baseUrl) return null

    const response = await fetch(
      `${this.baseUrl}/event/${encodeURIComponent(normalizedId)}`,
      {
        headers: {
          accept: 'application/json'
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      }
    )

    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`SportsMeta request failed with ${response.status}`)
    }

    const payload = await response.json()
    return payload?.event ? payload : null
  }
}

module.exports = {
  DEFAULT_BASE_URL,
  SportsMetaClient
}
