'use strict'

const crypto = require('node:crypto')
const { decodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT, DEBRID_PROTOCOL_USENET } = require('../utils/opaqueState')
const { getDebridProvider } = require('../clients/debrid/base')
const { redactSensitiveText } = require('../utils/logRedaction')
const { fetchTorrentPayload, validateTorrentPayload } = require('../utils/torrentPayload')

const POLL_INTERVAL_MS = Math.max(500, Number.parseInt(process.env.PVTKRRX_DEBRID_POLL_INTERVAL_MS || '2000', 10))
const POLL_TIMEOUT_MS = Math.max(2000, Number.parseInt(
  process.env.PVTKRRX_DEBRID_POLL_TIMEOUT_MS ||
  process.env.PVTKRRX_DEBRID_KEEPALIVE_TIMEOUT_MS ||
  '120000',
  10
))
const JOB_TTL_MS = Math.max(POLL_TIMEOUT_MS, Number.parseInt(process.env.PVTKRRX_DEBRID_JOB_TTL_MS || '600000', 10))
const READY_JOB_TTL_MS = Math.max(30000, Number.parseInt(process.env.PVTKRRX_DEBRID_READY_JOB_TTL_MS || '900000', 10))
const debridPlaybackJobs = new Map()

function maskToken(token) {
  const s = String(token || '')
  if (s.length <= 8) return s
  return s.slice(0, 8) + '…'
}

function playbackContentTypeFor(value = '') {
  const text = String(value || '').toLowerCase()
  if (/\.mp4(?:$|[?\s])|\bmp4\b/.test(text)) return 'video/mp4'
  if (/\.mkv(?:$|[?\s])|\b(?:mkv|matroska)\b/.test(text)) return 'video/x-matroska'
  if (/\.webm(?:$|[?\s])|\bwebm\b/.test(text)) return 'video/webm'
  if (/\.avi(?:$|[?\s])|\bavi\b/.test(text)) return 'video/x-msvideo'
  if (/\.wmv(?:$|[?\s])|\bwmv\b/.test(text)) return 'video/x-ms-wmv'
  if (/\.m4v(?:$|[?\s])|\bm4v\b/.test(text)) return 'video/x-m4v'
  if (/\.ts(?:$|[?\s])|\b(?:mpegts|transport stream)\b/.test(text)) return 'video/mp2t'
  return 'application/octet-stream'
}

function handleDebridPlaybackHead(req, res) {
  const tokenParam = req.params.token || req.params.info
  let payload = null
  try {
    payload = decodeDebridPlaybackToken(tokenParam)
  } catch (err) {
    console.warn(`[playback-debrid] HEAD token decode failed token=${maskToken(tokenParam)} reason=${redactSensitiveText(err.message)}`)
    return res.status(400).end()
  }
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', playbackContentTypeFor(payload.name || payload.src || ''))
  return res.status(200).end()
}

function stableJobKey(cred, payload) {
  const hash = crypto.createHash('sha256')
  hash.update(String(cred?.type || ''))
  hash.update('\0')
  hash.update(String(cred?.apiKey || ''))
  hash.update('\0')
  hash.update(String(payload?.protocol || DEBRID_PROTOCOL_TORRENT))
  hash.update('\0')
  hash.update(String(payload?.src || ''))
  hash.update('\0')
  hash.update(String(payload?.fileIdx ?? 0))
  return hash.digest('hex')
}

function cleanupDebridPlaybackJobs(now = Date.now()) {
  for (const [key, job] of debridPlaybackJobs.entries()) {
    if (!job || Number(job.expiresAt || 0) <= now) debridPlaybackJobs.delete(key)
  }
}

async function addDebridSource(provider, cred, payload) {
  if (payload.protocol === DEBRID_PROTOCOL_USENET) {
    const added = await provider.addNzb(payload.src)
    return added.addedId
  }
  if (/^magnet:/i.test(payload.src)) {
    const added = await provider.addMagnet(payload.src)
    return added.addedId
  }
  if (!provider.capabilities.torrentFile || typeof provider.addTorrentFile !== 'function') {
    const err = new Error(`Debrid provider ${cred.type} does not support torrent file upload`)
    err.code = 'DEBRID_PROVIDER_UNSUPPORTED'
    throw err
  }
  const torrent = await fetchTorrentPayload(payload.src)
  // Minimal validation before any provider upload (reuses existing inspect in torrentPayload).
  // Rejects HTML/login/403/random bytes that a private tracker may return for a 200 OK.
  validateTorrentPayload(torrent.bytes)
  const added = await provider.addTorrentFile(torrent.bytes, torrent.fileName)
  return added.addedId
}

function getOrCreateDebridJob(provider, cred, payload) {
  cleanupDebridPlaybackJobs()
  const key = stableJobKey(cred, payload)
  const existing = debridPlaybackJobs.get(key)
  if (existing && Number(existing.expiresAt || 0) > Date.now()) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  const job = {
    key,
    providerType: String(cred?.type || ''),
    addedId: '',
    status: null,
    streamUrl: '',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    expiresAt: Date.now() + JOB_TTL_MS,
    addPromise: null,
    selected: false
  }
  job.addPromise = (async () => {
    const addedId = await addDebridSource(provider, cred, payload)
    job.addedId = addedId
    job.expiresAt = Date.now() + JOB_TTL_MS
    return addedId
  })()
  debridPlaybackJobs.set(key, job)
  return job
}

async function pollUntilReady(provider, addedId, deadline) {
  let last = null
  while (Date.now() < deadline) {
    const status = await provider.pollStatus(addedId)
    last = status
    if (status.state === 'ready') return status
    if (status.state === 'error') {
      const err = new Error(status.errorMessage || `Debrid provider ${provider.id} returned error state`)
      err.code = 'DEBRID_PROVIDER_ERROR'
      throw err
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return last
}

async function handleDebridPlayback(req, res) {
  const tokenParam = req.params.token || req.params.info
  let payload = null
  try {
    payload = decodeDebridPlaybackToken(tokenParam)
  } catch (err) {
    console.warn(`[playback-debrid] token decode failed token=${maskToken(tokenParam)} reason=${redactSensitiveText(err.message)}`)
    return res.status(400).json({ error: 'Invalid debrid token' })
  }

  const providerOrder = payload.providers || []
  let lastError = null
  const srcKind = payload.protocol === DEBRID_PROTOCOL_USENET
    ? 'nzb'
    : /^magnet:/i.test(payload.src || '')
      ? 'magnet'
      : 'torrent-file'
  console.log(`[playback-debrid] start token=${maskToken(tokenParam)} protocol=${payload.protocol || DEBRID_PROTOCOL_TORRENT} source=${srcKind} providers=${providerOrder.length}`)

  for (const cred of providerOrder) {
    let provider
    try {
      provider = getDebridProvider(cred.type, cred.apiKey)
    } catch (err) {
      console.warn(`[playback-debrid] provider init failed type=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (payload.protocol === DEBRID_PROTOCOL_USENET && !provider.capabilities.nzb) {
      console.log(`[playback-debrid] skipping ${cred.type} — does not support NZB`)
      continue
    }
    if (payload.protocol === DEBRID_PROTOCOL_TORRENT && !provider.capabilities.magnet) {
      console.log(`[playback-debrid] skipping ${cred.type} — does not support magnet`)
      continue
    }

    let job = null
    try {
      job = getOrCreateDebridJob(provider, cred, payload)
      if (job.streamUrl) {
        job.lastUsedAt = Date.now()
        job.expiresAt = Date.now() + READY_JOB_TTL_MS
        console.log(`[playback-debrid] cached 302 -> ${cred.type} token=${maskToken(tokenParam)}`)
        return res.redirect(302, job.streamUrl)
      }
      const addedId = await job.addPromise
      console.log(`[playback-debrid] attached provider=${cred.type} id=${maskToken(addedId)}`)
    } catch (err) {
      if (job?.key) debridPlaybackJobs.delete(job.key)
      console.warn(`[playback-debrid] add failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (!job.selected) {
      try {
        await provider.selectFiles(job.addedId, 'all')
        job.selected = true
      } catch (err) {
        console.warn(`[playback-debrid] selectFiles failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      }
    }

    let status = null
    try {
      status = await pollUntilReady(provider, job.addedId, Date.now() + POLL_TIMEOUT_MS)
      job.status = status
    } catch (err) {
      if (job?.key) debridPlaybackJobs.delete(job.key)
      console.warn(`[playback-debrid] poll failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (!status || status.state !== 'ready') {
      console.log(`[playback-debrid] preparing provider=${cred.type} state=${status?.state || 'unknown'} progress=${status?.progress || 0}`)
      res.setHeader('Retry-After', '15')
      return res.status(503).json({
        error: 'Debrid item still preparing',
        state: status?.state || 'unknown',
        progress: status?.progress || 0,
        retryAfter: 15
      })
    }

    let streamUrl
    try {
      streamUrl = await provider.getStreamUrl(job.addedId, payload.fileIdx || 0)
    } catch (err) {
      if (job?.key) debridPlaybackJobs.delete(job.key)
      console.warn(`[playback-debrid] getStreamUrl failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (!streamUrl) {
      if (job?.key) debridPlaybackJobs.delete(job.key)
      lastError = new Error(`Debrid provider ${cred.type} returned empty stream URL`)
      continue
    }

    job.streamUrl = streamUrl
    job.expiresAt = Date.now() + READY_JOB_TTL_MS
    console.log(`[playback-debrid] 302 -> ${cred.type} token=${maskToken(tokenParam)}`)
    return res.redirect(302, streamUrl)
  }

  const message = lastError ? redactSensitiveText(lastError.message) : 'No configured debrid provider could fulfill this request'
  return res.status(502).json({ error: 'Debrid playback failed', detail: message })
}

// Real authenticated round-trip per provider. Returns {ok, message} on success;
// throws Error on failure. No silent "OK" fallback — if we can't prove the key
// works, we fail loudly.
async function pingProvider(type, apiKey) {
  const trimmed = String(apiKey || '').trim()
  if (!trimmed) throw new Error('API key is empty')

  if (type === 'rd') {
    const res = await fetch('https://api.real-debrid.com/rest/1.0/user', {
      headers: { Authorization: `Bearer ${trimmed}` }
    })
    if (res.status === 401 || res.status === 403) throw new Error('Real-Debrid rejected the API key (HTTP ' + res.status + ').')
    if (!res.ok) throw new Error('Real-Debrid responded HTTP ' + res.status)
    const body = await res.json().catch(() => ({}))
    const username = String(body?.username || body?.email || '').trim()
    const premium = Number(body?.premium || 0)
    return { ok: true, message: username
      ? `Real-Debrid OK — ${username}${premium > 0 ? ` (premium ${premium}d left)` : ''}.`
      : 'Real-Debrid OK.' }
  }

  if (type === 'ad') {
    const res = await fetch('https://api.alldebrid.com/v4/user', {
      headers: { Authorization: `Bearer ${trimmed}` }
    })
    if (res.status === 401 || res.status === 403) throw new Error('AllDebrid rejected the API key (HTTP ' + res.status + ').')
    if (!res.ok) throw new Error('AllDebrid responded HTTP ' + res.status)
    const body = await res.json().catch(() => ({}))
    if (String(body?.status || '').toLowerCase() !== 'success') {
      throw new Error('AllDebrid rejected: ' + String(body?.error?.message || body?.error?.code || 'unknown'))
    }
    const username = String(body?.data?.user?.username || body?.data?.user?.email || '').trim()
    const premium = Boolean(body?.data?.user?.isPremium)
    return { ok: true, message: username
      ? `AllDebrid OK — ${username}${premium ? ' (premium)' : ''}.`
      : 'AllDebrid OK.' }
  }

  if (type === 'pm') {
    const res = await fetch('https://www.premiumize.me/api/account/info', {
      headers: { Authorization: `Bearer ${trimmed}` }
    })
    if (res.status === 401 || res.status === 403) throw new Error('Premiumize rejected the API key (HTTP ' + res.status + ').')
    if (!res.ok) throw new Error('Premiumize responded HTTP ' + res.status)
    const body = await res.json().catch(() => ({}))
    if (String(body?.status || '').toLowerCase() !== 'success') {
      throw new Error('Premiumize rejected: ' + String(body?.message || 'unknown'))
    }
    const expires = body?.premium_until ? new Date(Number(body.premium_until) * 1000).toISOString().slice(0, 10) : ''
    const email = String(body?.customer_id || '').trim()
    return { ok: true, message: email
      ? `Premiumize OK — ${email}${expires ? ` (premium until ${expires})` : ''}.`
      : 'Premiumize OK.' }
  }

  // Touch the client factory so unknown providers throw consistently.
  getDebridProvider(type, trimmed)
  throw new Error('Unknown debrid provider: ' + type)
}

async function pingCacheSearchSource(type, apiKey) {
  const trimmed = String(apiKey || '').trim()
  if (!trimmed) throw new Error('API key is empty')

  if (type === 'putio') {
    const res = await fetch('https://api.put.io/v2/account/info', {
      headers: { Authorization: `Bearer ${trimmed}` }
    })
    if (res.status === 401 || res.status === 403) throw new Error('put.io rejected the token (HTTP ' + res.status + ').')
    if (!res.ok) throw new Error('put.io responded HTTP ' + res.status)
    const body = await res.json().catch(() => ({}))
    if (String(body?.status || 'OK').toUpperCase() !== 'OK') {
      throw new Error('put.io rejected: ' + String(body?.error_message || body?.error || 'unknown'))
    }
    const username = String(body?.info?.username || body?.info?.mail || '').trim()
    return { ok: true, message: username
      ? `put.io OK — ${username}.`
      : 'put.io OK.' }
  }

  if (type === 'pm') {
    // Premiumize cache source reuses the PM API key. Use the same /account/info round-trip.
    return pingProvider('pm', trimmed)
  }

  throw new Error('Unknown cache search source: ' + type)
}

function resolveSavedApiKey(kind, type) {
  // Lazy require to avoid circular deps at module load.
  const { loadLocalConfigFile } = require('../lib/shared')
  let saved
  try {
    saved = loadLocalConfigFile()
  } catch (_) {
    return ''
  }
  if (!saved || typeof saved !== 'object') return ''
  const block = kind === 'debrid' ? saved.debrid : saved.cacheSearch
  const list = block && typeof block === 'object'
    ? (kind === 'debrid'
      ? (Array.isArray(block.providers) ? block.providers : [])
      : (Array.isArray(block.sources) ? block.sources : []))
    : []
  const entry = list.find(item => item && String(item.type || '').toLowerCase() === type)
  if (entry && entry.apiKey) return String(entry.apiKey)
  // PM uses ONE account: cacheSearch PM falls back to debrid PM apiKey.
  if (kind === 'cacheSearch' && type === 'pm') {
    const debridList = Array.isArray(saved.debrid?.providers) ? saved.debrid.providers : []
    const pmDebrid = debridList.find(p => p && String(p.type || '').toLowerCase() === 'pm')
    if (pmDebrid && pmDebrid.apiKey) return String(pmDebrid.apiKey)
  }
  return ''
}

async function handleDebridTest(req, res) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const provider = String(body.provider || '').trim().toLowerCase()
  const source = String(body.source || '').trim().toLowerCase()
  const rawApiKey = String(body.apiKey || '').trim()
  const useRetained = body.useRetained === true || rawApiKey === '__retained__'

  if (!provider && !source) {
    return res.status(400).json({ ok: false, message: 'Specify provider (rd/ad/pm) or source (putio/pm).' })
  }

  let apiKey = rawApiKey
  if (!apiKey || useRetained) {
    apiKey = provider
      ? resolveSavedApiKey('debrid', provider)
      : resolveSavedApiKey('cacheSearch', source)
    if (!apiKey) {
      return res.status(400).json({ ok: false, message: 'No API key entered and none saved yet. Paste the key and click Test again.' })
    }
  }

  try {
    if (provider) {
      if (!['rd', 'ad', 'pm'].includes(provider)) {
        return res.status(400).json({ ok: false, message: 'Unknown debrid provider.' })
      }
      const result = await pingProvider(provider, apiKey)
      return res.json({ ok: true, message: result?.message || `${provider.toUpperCase()} OK.` })
    }
    if (!['putio', 'pm'].includes(source)) {
      return res.status(400).json({ ok: false, message: 'Unknown cache search source.' })
    }
    const result = await pingCacheSearchSource(source, apiKey)
    return res.json({ ok: true, message: result?.message || `${source} OK.` })
  } catch (err) {
    console.warn(`[debrid-test] failed kind=${provider || source} reason=${redactSensitiveText(err.message)}`)
    return res.status(200).json({ ok: false, message: redactSensitiveText(err.message) })
  }
}

module.exports = {
  handleDebridPlayback,
  handleDebridPlaybackHead,
  _clearDebridPlaybackJobs: () => debridPlaybackJobs.clear(),
  handleDebridTest
}
