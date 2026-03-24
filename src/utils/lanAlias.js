const os = require('os')

function getLanIpv4Addresses() {
  const interfaces = os.networkInterfaces()
  const addrs = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue
      const ip = String(entry.address || '').trim()
      if (!ip) continue
      addrs.push(ip)
    }
  }
  return [...new Set(addrs)]
}

function sanitizeDnsLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

function deriveDefaultLocalHostname() {
  const preferred = sanitizeDnsLabel(process.env.PVTKRRX_LOCAL_HOSTNAME || '')
  if (preferred) return `${preferred}.local`
  return 'pvtkrrx.local'
}

function normalizeLocalHostname(value) {
  let host = String(value || '').trim().toLowerCase()
  if (!host) return deriveDefaultLocalHostname()

  host = host.replace(/\.local$/i, '')
  host = sanitizeDnsLabel(host)
  if (!host) return deriveDefaultLocalHostname()
  return `${host}.local`
}

function startLanAlias(options = {}) {
  const logger = options.logger || console
  const hostname = normalizeLocalHostname(options.hostname)
  const port = Number.parseInt(options.port || '7000', 10)
  const serviceType = '_http._tcp.local'
  const serviceInstance = `${hostname.replace(/\.local$/i, '')}._http._tcp.local`
  const hostnameLower = hostname.toLowerCase()
  const serviceTypeLower = serviceType.toLowerCase()
  const serviceInstanceLower = serviceInstance.toLowerCase()

  let mdnsFactory
  try {
    mdnsFactory = require('multicast-dns')
  } catch (_) {
    return {
      enabled: false,
      hostname,
      reason: 'multicast-dns module missing',
      stop() {}
    }
  }

  const mdns = mdnsFactory({ reuseAddr: true })

  function buildPacket() {
    const ip = getLanIpv4Addresses()[0]
    if (!ip) return null

    return {
      answers: [
        { name: hostname, type: 'A', ttl: 120, data: ip },
        { name: serviceType, type: 'PTR', ttl: 120, data: serviceInstance },
        { name: serviceInstance, type: 'SRV', ttl: 120, data: { port, target: hostname, priority: 0, weight: 0 } },
        { name: serviceInstance, type: 'TXT', ttl: 120, data: ['path=/local/manifest.json?mode=local'] }
      ],
      additionals: [
        { name: hostname, type: 'A', ttl: 120, data: ip }
      ]
    }
  }

  function announce() {
    const packet = buildPacket()
    if (!packet) return false
    try {
      mdns.respond(packet)
      return true
    } catch (err) {
      logger.warn('[mdns] respond failed:', err.message)
      return false
    }
  }

  function shouldAnswer(question) {
    const name = String(question?.name || '').toLowerCase()
    const type = String(question?.type || '').toUpperCase()
    if (!name) return false

    if (name === hostnameLower && (type === 'A' || type === 'ANY')) return true
    if (name === serviceTypeLower && (type === 'PTR' || type === 'ANY')) return true
    if (name === serviceInstanceLower && (type === 'SRV' || type === 'TXT' || type === 'ANY')) return true
    return false
  }

  const onQuery = (query) => {
    const questions = Array.isArray(query?.questions) ? query.questions : []
    if (questions.some(shouldAnswer)) announce()
  }

  const onError = (err) => {
    logger.warn('[mdns] error:', err.message)
  }

  mdns.on('query', onQuery)
  mdns.on('error', onError)
  announce()
  const timer = setInterval(announce, 30000)
  if (typeof timer.unref === 'function') timer.unref()

  function stop() {
    clearInterval(timer)
    try { mdns.removeListener('query', onQuery) } catch (err) {
      logger.warn('[mdns] Failed to remove query listener:', err.message)
    }
    try { mdns.removeListener('error', onError) } catch (err) {
      logger.warn('[mdns] Failed to remove error listener:', err.message)
    }
    try { mdns.destroy() } catch (err) {
      logger.warn('[mdns] Failed to destroy socket:', err.message)
    }
  }

  return {
    enabled: true,
    hostname,
    stop
  }
}

module.exports = {
  getLanIpv4Addresses,
  deriveDefaultLocalHostname,
  normalizeLocalHostname,
  startLanAlias
}
