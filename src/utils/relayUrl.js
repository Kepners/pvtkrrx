const DEFAULT_PAIR_RELAY_URL = 'https://pvtkrrx.vercel.app'

function normalizeBaseUrl(input) {
  return String(input || '').trim().replace(/\/+$/, '')
}

function normalizeCandidateRelayUrl(input) {
  const raw = normalizeBaseUrl(input)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return `${parsed.protocol}//${parsed.host}`
  } catch (_) {
    return ''
  }
}

function normalizeRelayUrl(input, fallbackInput = process.env.PVTKRRX_PAIR_RELAY_URL || DEFAULT_PAIR_RELAY_URL) {
  const fallback = normalizeCandidateRelayUrl(fallbackInput) || DEFAULT_PAIR_RELAY_URL
  const raw = normalizeBaseUrl(input)
  if (!raw) return fallback
  return normalizeCandidateRelayUrl(raw) || fallback
}

module.exports = {
  DEFAULT_PAIR_RELAY_URL,
  normalizeRelayUrl
}
