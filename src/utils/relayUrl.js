const DEFAULT_PAIR_RELAY_URL = 'https://www.pvtkrrx.cc'
const LEGACY_PAIR_RELAY_HOSTS = new Set([
  'pvtkrrx.vercel.app',
  'www.pvtkrrx.vercel.app'
])

function normalizeBaseUrl(input) {
  return String(input || '').trim().replace(/\/+$/, '')
}

function normalizeCandidateRelayUrl(input) {
  const raw = normalizeBaseUrl(input)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (LEGACY_PAIR_RELAY_HOSTS.has(String(parsed.host || '').toLowerCase())) {
      return DEFAULT_PAIR_RELAY_URL
    }
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
