(function attachRouteParity(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }
  if (root && typeof root === 'object') {
    root.PVTKRRXRouteParity = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRouteParity() {
  const DNS_REBINDING_SUFFIXES = ['.nip.io', '.xip.io', '.sslip.io', '.lvh.me', '.localtest.me']

  function normalizeHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase()
    if (!host) return ''
    if (host.startsWith('[') && host.endsWith(']')) {
      return host.slice(1, -1)
    }
    return host
  }

  function isPrivateIpv4(hostname) {
    const host = normalizeHost(hostname)
    if (!host) return false
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.startsWith('10.')) return true
    if (host.startsWith('192.168.')) return true
    const parts = host.split('.')
    if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
      const second = Number.parseInt(parts[1], 10)
      if (parts[0] === '172' && second >= 16 && second <= 31) return true
    }
    return false
  }

  function isPrivateIpv6(hostname) {
    const host = normalizeHost(hostname)
    if (!host) return false
    if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
    if (!/^[0-9a-f:]+$/i.test(host)) return false
    return (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    )
  }

  function isBlockedPrivateTargetHost(hostname) {
    const host = normalizeHost(hostname)
    if (!host) return false
    if (host === '0.0.0.0' || host === 'host.docker.internal') return true
    if (host.endsWith('.localhost') || host.endsWith('.local')) return true
    if (host.startsWith('169.254.')) return true
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) return true

    for (const suffix of DNS_REBINDING_SUFFIXES) {
      if (!host.endsWith(suffix)) continue
      if (suffix === '.lvh.me' || suffix === '.localtest.me') return true
      const subdomain = host.slice(0, host.length - suffix.length)
      if (isPrivateIpv4(subdomain)) return true
      if (isPrivateIpv4(subdomain.replace(/-/g, '.'))) return true
    }

    return false
  }

  function buildLocalModeUrls(hostname, port, httpsPort) {
    const modeQuery = '?mode=local'
    return {
      httpManifest: `http://${hostname}:${port}/local/manifest.json${modeQuery}`,
      httpsManifest: `https://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`,
      stremio: `stremio://${hostname}:${port}/local/manifest.json${modeQuery}`,
      stremioHttps: `stremio://${hostname}:${httpsPort}/local/manifest.json${modeQuery}`
    }
  }

  function stripRemoteSeedboxLanFields(config = {}, options = {}) {
    const next = config && typeof config === 'object' ? { ...config } : {}
    next.lanPairEnabled = false
    next.lanPairRequired = false
    delete next.lanPairId
    delete next.lanPairKey
    delete next.lanPairOwnerId
    delete next.localHostname
    delete next.localHostnameCustom
    if (options.keepRelayUrl !== true) {
      delete next.lanPairRelayUrl
    }
    return next
  }

  return {
    DNS_REBINDING_SUFFIXES,
    buildLocalModeUrls,
    isBlockedPrivateTargetHost,
    isPrivateIpv4,
    isPrivateIpv6,
    stripRemoteSeedboxLanFields
  }
})
