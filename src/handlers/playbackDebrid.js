'use strict'

const { decodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT, DEBRID_PROTOCOL_USENET } = require('../utils/opaqueState')
const { getDebridProvider } = require('../clients/debrid/base')
const { redactSensitiveText } = require('../utils/logRedaction')

const POLL_INTERVAL_MS = Math.max(500, Number.parseInt(process.env.PVTKRRX_DEBRID_POLL_INTERVAL_MS || '2000', 10))
const POLL_TIMEOUT_MS = Math.max(2000, Number.parseInt(process.env.PVTKRRX_DEBRID_POLL_TIMEOUT_MS || '30000', 10))

function maskToken(token) {
  const s = String(token || '')
  if (s.length <= 8) return s
  return s.slice(0, 8) + '…'
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

    let addedId
    try {
      if (payload.protocol === DEBRID_PROTOCOL_USENET) {
        const added = await provider.addNzb(payload.src)
        addedId = added.addedId
      } else {
        const added = await provider.addMagnet(payload.src)
        addedId = added.addedId
      }
    } catch (err) {
      console.warn(`[playback-debrid] add failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    try {
      await provider.selectFiles(addedId, 'all')
    } catch (err) {
      console.warn(`[playback-debrid] selectFiles failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
    }

    let status = null
    try {
      status = await pollUntilReady(provider, addedId, Date.now() + POLL_TIMEOUT_MS)
    } catch (err) {
      console.warn(`[playback-debrid] poll failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (!status || status.state !== 'ready') {
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
      streamUrl = await provider.getStreamUrl(addedId, payload.fileIdx || 0)
    } catch (err) {
      console.warn(`[playback-debrid] getStreamUrl failed provider=${cred.type} reason=${redactSensitiveText(err.message)}`)
      lastError = err
      continue
    }

    if (!streamUrl) {
      lastError = new Error(`Debrid provider ${cred.type} returned empty stream URL`)
      continue
    }

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
  handleDebridTest
}
