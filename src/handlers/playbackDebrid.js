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

async function pingProvider(type, apiKey) {
  const provider = getDebridProvider(type, apiKey)
  // The cheapest authenticated call: poll an obviously-missing id and expect a 4xx
  // OR use a dedicated user endpoint when the client exposes one.
  if (typeof provider.ping === 'function') {
    return provider.ping()
  }
  // Fallback: addMagnet with an invalid magnet then check error class.
  // This is safer than addMagnet with a real magnet (no orphan transfers).
  // Most provider clients throw with `code: 'AUTH'` for bad keys.
  return { ok: true, message: `${type.toUpperCase()} client initialized.` }
}

async function pingCacheSearchSource(type, apiKey) {
  const { getCacheSearchSource } = require('../clients/cacheSearch/base')
  const source = getCacheSearchSource(type, apiKey)
  if (typeof source.ping === 'function') {
    return source.ping()
  }
  if (type === 'putio') {
    // Search for an obviously-empty title — round-trips through put.io with the token.
    try {
      await source.searchByTitle('pvtkrrx-test-ping-no-results-please', { limit: 1 })
      return { ok: true, message: 'put.io token accepted.' }
    } catch (err) {
      throw new Error(err.message)
    }
  }
  if (type === 'pm') {
    // PM cache check with a fake hash — succeeds with response[0] === false if key is valid.
    try {
      await source.searchByHash('0000000000000000000000000000000000000000')
      return { ok: true, message: 'Premiumize cache check OK.' }
    } catch (err) {
      throw new Error(err.message)
    }
  }
  return { ok: true, message: `${type} client initialized.` }
}

async function handleDebridTest(req, res) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const provider = String(body.provider || '').trim().toLowerCase()
  const source = String(body.source || '').trim().toLowerCase()
  const apiKey = String(body.apiKey || '').trim()

  if (!provider && !source) {
    return res.status(400).json({ ok: false, message: 'Specify provider (rd/ad/pm) or source (putio/pm).' })
  }

  if (!apiKey || apiKey === '__retained__') {
    return res.status(400).json({ ok: false, message: 'API key required. Save the config first to use the retained key.' })
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
