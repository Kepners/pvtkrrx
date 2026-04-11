function normalizeBaseUrl(input) {
  const value = String(input || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  return value
}

function parseUrlCandidate(input) {
  const value = String(input || '').trim()
  if (!value) return null
  try {
    return new URL(value)
  } catch (_) {
    return null
  }
}

function resolveHostedProfile(config = {}) {
  const explicit = String(config?.routeProfile || '').trim().toLowerCase()
  if (explicit === 'online' || explicit === 'hybrid') return explicit

  const hasLegacyLanPairState = Boolean(config?.lanPairId || config?.lanPairKey || config?.lanPairRelayUrl)
  const lanEnabled = typeof config?.lanPairEnabled === 'boolean'
    ? config.lanPairEnabled
    : hasLegacyLanPairState
  const lanRequired = typeof config?.lanPairRequired === 'boolean'
    ? config.lanPairRequired
    : false

  if (!lanEnabled) return 'online'
  return lanRequired ? 'lan' : 'hybrid'
}

function isLoopbackServiceUrl(input) {
  const parsed = parseUrlCandidate(input)
  if (!parsed) return false
  const hostname = String(parsed.hostname || '').trim().toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function resolveHostedLoopbackGatewayHost() {
  return String(process.env.PVTKRRX_HOST_GATEWAY_HOST || '').trim()
}

function rewriteLoopbackServiceUrl(input, gatewayHost = '') {
  const parsed = parseUrlCandidate(input)
  const targetHost = String(gatewayHost || '').trim()
  if (!parsed || !targetHost || !isLoopbackServiceUrl(input)) return normalizeBaseUrl(input)
  try {
    parsed.hostname = targetHost
    return normalizeBaseUrl(parsed.toString())
  } catch (_) {
    return normalizeBaseUrl(input)
  }
}

function applyHostedServiceOverrides(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  const gatewayHost = resolveHostedLoopbackGatewayHost()
  const hostedProfile = resolveHostedProfile(config)
  if (!gatewayHost || (hostedProfile !== 'online' && hostedProfile !== 'hybrid')) {
    return { ...config }
  }

  return {
    ...config,
    jackettUrl: rewriteLoopbackServiceUrl(config.jackettUrl, gatewayHost),
    qbitUrl: rewriteLoopbackServiceUrl(config.qbitUrl, gatewayHost)
  }
}

module.exports = {
  applyHostedServiceOverrides,
  isLoopbackServiceUrl,
  resolveHostedLoopbackGatewayHost,
  rewriteLoopbackServiceUrl
}
