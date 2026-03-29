const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const selfsigned = require('selfsigned')
const express = require('express')
const shared = require('./src/lib/shared')
const { isCompletedTorrent } = require('./src/utils/torrentState')

// Destructure everything routes need from the shared module.
// Shared module initializes env, console redaction, stores, and rate limiters at load time.
const {
  // State & singletons
  lanPairStore, accountStore, rateLimiters,
  watchedDeleteTimers, watchedDeleteInFlight,
  IS_VERCEL_RUNTIME, DEFAULT_LOCAL_HOSTNAME,
  STREAM_WAIT_TIMEOUT_MS, STREAM_WAIT_INTERVAL_MS,
  STREAM_RANGE_WAIT_TIMEOUT_MS, STREAM_RANGE_WAIT_INTERVAL_MS,
  STREAM_READY_START_FRACTION, STREAM_PRIORITIZE_LAST_PIECES,
  WATCHED_DELETE_THRESHOLD, WATCHED_DELETE_GRACE_MS,
  LAN_PAIR_TTL_SECONDS, LAN_PAIR_BIND_PUBLIC_IP, LAN_PAIR_LOCK_HOST,
  SECRET_CONFIG_FIELDS, SENSITIVE_WEB_ORIGINS, manifest,
  // Crypto & tokens
  encrypt, decrypt, decodeFileStateToken, decodePlaybackStateToken,
  // Handlers
  handleCatalog, handleStream, handleMeta,
  // Clients
  ProwlarrClient, QBitClient,
  // Provisioning
  autoProvisionWindows, normalizeLocalHostname, startLanAlias,
  // URL & network helpers
  buildLocalModeUrls, normalizeRelayUrl, stripRemoteSeedboxLanFields,
  buildPlaybackFileUrl, normalizeLocalStorageRoots,
  decodeSportsThumbToken, renderSportsThumbSvg,
  findVideoFile, hasPackedArchiveFiles, isSampleVideoName,
  // Account
  normalizeStremioUserId, createAuthToken,
  // Logging
  redactSensitiveText, createRedactingLogger,
  // Config & pair helpers
  loadLocalConfigFile, saveLocalConfigFile, detectLanAddresses, getMdnsHost,
  normalizeBaseUrl, normalizeAddonConfig, mergeRetainedSecrets,
  hydrateAccountLinkForConfig, buildConfigReadback, resolveExistingConfigForBody,
  getConfigIssues, getPublicBaseUrl, loadConfigFromSourceToken,
  ensureLanPairConfig, normalizeRetainedSecretFields, stripEphemeralConfigFields,
  // Pair helpers
  sanitizePairId, sanitizePairKey, sanitizePairOwnerId,
  summarizePairId, hashPairKey, normalizePairEndpoints,
  summarizeEndpointSources, buildLanPairEndpoints,
  chooseLanPairEndpoint, buildLanRedirectUrl,
  // Request & security helpers
  getClientIp, isSameHostRequest, hashClientIp, requestClientLabel,
  isSensitiveCorsRoute, isAllowedSensitiveOrigin, normalizeOrigin,
  ensureCsrfCookie, requestHostname, isLoopbackHost, getInstallMode,
  shouldRejectPcLocalManifestRequest, parseHttpUrlCandidate,
  sanitizeHostForUrl, validateHostedConnectionTarget,
  isLocalNetworkRequest, parseBooleanLoose,
  // Middleware
  requireCsrfToken, requireLocalNetworkRoute, requireLocalConfigReadback,
  requireLocalQbitControl, requireAuthUser, requireConfigSubscription,
  withConfig, withLegacyRootLocalConfig,
  // Auth
  getAuthTokenSecret, authSecretAvailable, isValidEmail, publicUserModel,
  discoverLocalStremioAuthKeyCandidates, getLocalStremioDesktopStatus,
  createLinkedStremioAuthSession,
  // Manifest & cache
  getManifest, parseCacheSeconds, setPublicCacheHeaders, applyHostedRouteCacheHeaders,
  // Warmup
  ensureBootLanAccess, warmLocalProviders, scheduleLocalProviderWarmup,
  repairLocalProwlarrConfig,
  // Playback helpers
  sleep, extractInfoHashFromLink, extractTrackerHost,
  pickLikelyNewTorrent, normalizeTorrentPath, findTorrentFileByPath,
  resolveTorrentFilePath, getReadableBytes, isPlaybackReady,
  primeTorrentForStreaming, loadTorrentPlaybackState,
  autoDeleteWatchedEnabled, watchedDeleteGraceMs, scheduleWatchedCleanup,
  isMagnetLink, parseTorrentFileName, fetchTorrentPayload,
  mintHostedConfigToken, resolveLanPair, lanPairOfflineResponse, maybeLanPairRedirect
} = shared

const app = express()
app.set('trust proxy', false)
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf)
  }
}))

// ─── CORS ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const sensitiveCorsRoute = isSensitiveCorsRoute(req)
  const sensitiveOriginAllowed = !sensitiveCorsRoute || isAllowedSensitiveOrigin(req)
  const rawOrigin = String(req.headers.origin || '').trim()
  const requestOrigin = normalizeOrigin(rawOrigin)
  const responseOrigin = rawOrigin === 'null' ? 'null' : (requestOrigin || rawOrigin)

  if (rawOrigin) {
    if (sensitiveCorsRoute) {
      if (responseOrigin && sensitiveOriginAllowed) {
        res.setHeader('Access-Control-Allow-Origin', responseOrigin)
        res.setHeader('Vary', 'Origin')
      }
    } else {
      if (responseOrigin) {
        res.setHeader('Access-Control-Allow-Origin', responseOrigin)
        res.setHeader('Vary', 'Origin')
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*')
      }
    }
  } else if (sensitiveCorsRoute) {
    if (requestOrigin && sensitiveOriginAllowed) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin)
      res.setHeader('Vary', 'Origin')
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').trim()
  const defaultHeaders = [
    'Content-Type',
    'Authorization',
    'Range',
    'Accept',
    'Stremio-Protocol-Version',
    'Access-Control-Request-Private-Network'
  ]
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders || defaultHeaders.join(', '))
  if (String(req.headers['access-control-request-private-network'] || '').toLowerCase() === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  if (String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase().includes('https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (req.method === 'OPTIONS') {
    if (sensitiveCorsRoute && !sensitiveOriginAllowed) return res.sendStatus(403)
    return res.sendStatus(204)
  }
  if (sensitiveCorsRoute && !sensitiveOriginAllowed) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  next()
})

// ─── Static routes ──────────────────────────────────────────
const publicDir = path.join(__dirname, 'public')
const configPage = path.join(publicDir, 'configure.html')
const runbooksPage = path.join(publicDir, 'runbooks.html')
const healthPage = path.join(publicDir, 'health.html')
app.use(express.static(publicDir, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const lowerPath = String(filePath || '').toLowerCase()
    if (lowerPath.endsWith('.html')) {
      setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
      return
    }
    setPublicCacheHeaders(res, 86400, { sMaxAge: 604800, staleWhileRevalidate: 2592000, immutable: true })
  }
}))
app.get('/configure', (req, res) => {
  ensureCsrfCookie(req, res)
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(configPage)
})
app.get('/:config/configure', (req, res) => {
  ensureCsrfCookie(req, res)
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(configPage)
})
app.get('/runbooks', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(runbooksPage)
})
app.get('/seedbox-runbooks', (req, res) => {
  setPublicCacheHeaders(res, 60, { sMaxAge: 900, staleWhileRevalidate: 86400 })
  res.sendFile(runbooksPage)
})
app.get('/thumb/sports/:info.svg', (req, res) => {
  try {
    const payload = decodeSportsThumbToken(req.params.info)
    const svg = renderSportsThumbSvg(payload)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    setPublicCacheHeaders(res, 86400, { sMaxAge: 604800, staleWhileRevalidate: 2592000, immutable: true })
    res.send(svg)
  } catch (_) {
    res.status(400).send('invalid thumbnail payload')
  }
})

// ─── POST /encrypt — server-side config encryption ─────────
app.post('/encrypt', async (req, res) => {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) return res.status(500).json({ error: 'ENCRYPTION_SECRET not configured' })
  const clientIp = getClientIp(req)
  const limit = rateLimiters.encrypt.consume(clientIp || 'unknown')
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: 'too many requests' })
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid config payload' })
  }

  const existingConfig = resolveExistingConfigForBody(req.body)
  const mergedConfig = mergeRetainedSecrets(req.body, existingConfig)
  const normalizedConfig = await hydrateAccountLinkForConfig(normalizeAddonConfig(mergedConfig))
  const issues = getConfigIssues(normalizedConfig, {
    requestBaseUrl: getPublicBaseUrl(req)
  })
  if (issues.length > 0) {
    return res.status(400).json({
      error: issues[0].message,
      issueCode: issues[0].code,
      notifyUser: true
    })
  }

  try {
    const tokenPayload = normalizedConfig.lanPairEnabled === false
      ? stripRemoteSeedboxLanFields(normalizedConfig)
      : normalizedConfig
    const token = encrypt(tokenPayload, secret)
    res.json({ token })
  } catch (err) {
    res.status(400).json({ error: 'Encryption failed' })
  }
})

// Save local-mode config to disk so Stremio can use a stable /local manifest URL.
app.post('/local-config', requireLocalNetworkRoute, async (req, res) => {
  const cfg = req.body || {}
  if (!cfg.qbitUrl) {
    return res.status(400).json({ error: 'qBit URL is required for local config' })
  }

  try {
    const existingConfig = resolveExistingConfigForBody(cfg, { preferLocal: true })
    const mergedConfig = mergeRetainedSecrets(cfg, existingConfig)
    const localHostname = normalizeLocalHostname(cfg.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    const saved = await hydrateAccountLinkForConfig(normalizeAddonConfig({
      ...mergedConfig,
      localHostname,
      localHostnameCustom
    }, {
      defaultEnabled: true,
      defaultRequired: true,
      includeLocalSecrets: true
    }))
    saveLocalConfigFile(saved)
    scheduleLocalProviderWarmup(saved, console, 'local-config-save').catch(err => {
      console.warn('[config-save] Provider warmup failed:', err.message)
    })
    res.json({
      ok: true,
      ...buildConfigReadback(saved),
      localHostname
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save local config' })
  }
})

app.post('/auto-provision', requireLocalNetworkRoute, async (req, res) => {
  try {
    const options = req.body || {}
    const localHostname = normalizeLocalHostname(options.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const localHostnameCustom = localHostname !== DEFAULT_LOCAL_HOSTNAME
    let accountUserId = String(options.accountUserId || '').trim()
    let accountProvider = String(options.accountProvider || '').trim()
    let accountLinkedAt = Number(options.accountLinkedAt || 0)
    let stremioUserId = normalizeStremioUserId(options.stremioUserId || '')
    let hintedPairId = sanitizePairId(options.lanPairId || '')
    let autoLinkedSourceLabel = ''

    if (!stremioUserId && authSecretAvailable()) {
      const authSecret = getAuthTokenSecret()
      const candidates = discoverLocalStremioAuthKeyCandidates()
      for (const candidate of candidates) {
        try {
          const linked = await createLinkedStremioAuthSession(candidate.authKey, authSecret)
          stremioUserId = normalizeStremioUserId(linked?.stremio?.userId || '')
          if (!hintedPairId) {
            hintedPairId = sanitizePairId(linked?.stremio?.recommendedPairId || '')
          }
          if (stremioUserId) {
            if (!accountProvider) accountProvider = 'stremio-authkey'
            if (!accountLinkedAt) accountLinkedAt = Date.now()
            autoLinkedSourceLabel = String(candidate.sourceLabel || '').trim()
          }
          break
        } catch (err) {
          if (Number(err?.statusCode || 0) === 401) continue
          throw err
        }
      }
    }

    const result = await autoProvisionWindows({
      installIfMissing: options.installIfMissing,
      startIfStopped: options.startIfStopped,
      configureQbitLocalNoAuth: options.configureQbitLocalNoAuth,
      openFirewall: options.openFirewall,
      localHostname
    })
    const existingConfig = result.config
      ? resolveExistingConfigForBody(result.config, { preferLocal: true })
      : null
    const provisionedSource = result.config
      ? mergeRetainedSecrets({
        ...result.config,
        ...(accountUserId ? { accountUserId } : {}),
        ...(accountProvider ? { accountProvider } : {}),
        ...(accountLinkedAt > 0 ? { accountLinkedAt } : {}),
        ...(stremioUserId ? { stremioUserId } : {}),
        ...(hintedPairId ? { lanPairId: hintedPairId } : {}),
        localHostname,
        localHostnameCustom
      }, existingConfig)
      : null
    const provisionedConfig = provisionedSource
      ? normalizeAddonConfig(provisionedSource, {
        defaultEnabled: true,
        defaultRequired: true,
        includeLocalSecrets: true
      })
      : null
    const hydratedProvisionedConfig = provisionedConfig
      ? await hydrateAccountLinkForConfig(provisionedConfig)
      : null

    if (result.config && result.config.qbitUrl) {
      saveLocalConfigFile(hydratedProvisionedConfig)
      scheduleLocalProviderWarmup(hydratedProvisionedConfig, console, 'auto-provision').catch(err => {
        console.warn('[auto-provision] Provider warmup failed:', err.message)
      })
    }
    const responseNotes = Array.isArray(result.notes) ? [...result.notes] : []
    if (autoLinkedSourceLabel) {
      responseNotes.push(`Signed-in Stremio session detected on this PC (${autoLinkedSourceLabel}) and linked automatically`)
    }
    res.json({
      ...result,
      notes: responseNotes,
      config: hydratedProvisionedConfig
        ? buildConfigReadback(hydratedProvisionedConfig)
        : (result.config ? buildConfigReadback(result.config) : null),
      lanPair: hydratedProvisionedConfig
        ? {
            lanPairId: hydratedProvisionedConfig.lanPairId,
            lanPairEnabled: hydratedProvisionedConfig.lanPairEnabled,
            lanPairRequired: hydratedProvisionedConfig.lanPairRequired,
            lanPairRelayUrl: hydratedProvisionedConfig.lanPairRelayUrl
          }
        : null,
      localHostname
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Auto provision failed', detail: err.message })
  }
})

app.get('/health', (req, res) => {
  const accept = String(req.headers.accept || '')
  const wantsHtml = req.query?.format !== 'json' && accept.includes('text/html')
  if (wantsHtml) {
    setPublicCacheHeaders(res, 10, { sMaxAge: 60, staleWhileRevalidate: 60 })
    return res.sendFile(healthPage)
  }
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    ok: true,
    time: new Date().toISOString()
  })
})

app.get('/auth/stremio/local-status', (req, res) => {
  if (!isSameHostRequest(req)) {
    return res.status(403).json({ error: 'Open configure on the Windows host PC to check local Stremio status.' })
  }

  try {
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      ...getLocalStremioDesktopStatus()
    })
  } catch (err) {
    res.status(500).json({
      error: 'Failed to inspect local Stremio status',
      detail: err.message
    })
  }
})

// Browser-triggered local account-link helpers read local session material from this machine,
// so keep both the same-host socket/IP gate and the configure page's double-submit CSRF flow.
app.post('/auth/stremio/auto-link-local', requireCsrfToken, async (req, res) => {
  if (!authSecretAvailable()) {
    return res.status(500).json({ error: 'AUTH_TOKEN_SECRET not configured' })
  }
  if (!isSameHostRequest(req)) {
    return res.status(403).json({ error: 'Auto detect only works from this PC. Open configure on the Windows host and try again.' })
  }

  const authSecret = getAuthTokenSecret()

  try {
    const clientIp = getClientIp(req)
    const limit = rateLimiters.auth.consume(clientIp || 'unknown')
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ error: 'too many requests' })
    }

    const candidates = discoverLocalStremioAuthKeyCandidates()
    if (!candidates.length) {
      return res.status(404).json({
        error: 'No signed-in Stremio session found on this PC',
        detail: 'Open Stremio Desktop or sign in at web.stremio.com in Brave, Chrome, or Edge, then try again.'
      })
    }

    let lastVerificationError = null
    for (const candidate of candidates) {
      try {
        const payload = await createLinkedStremioAuthSession(candidate.authKey, authSecret)
        return res.json({
          ...payload,
          detected: {
            method: 'local-storage',
            sourceLabel: candidate.sourceLabel
          }
        })
      } catch (err) {
        if (Number(err?.statusCode || 0) === 401) {
          lastVerificationError = err
          continue
        }
        throw err
      }
    }

    if (lastVerificationError) {
      return res.status(401).json({
        error: 'Signed-in Stremio session was found, but the stored AuthKey is no longer valid',
        detail: 'Open Stremio Desktop or web.stremio.com, refresh the login, then try Auto Find again.'
      })
    }

    return res.status(404).json({
      error: 'No valid Stremio AuthKey found on this PC',
      detail: 'Open Stremio Desktop or sign in at web.stremio.com, then try again.'
    })
  } catch (err) {
    const statusCode = Number(err?.statusCode || 0) || 500
    const payload = { error: statusCode === 500 ? 'Local Stremio auto-link failed' : err.message }
    if (err?.detail) payload.detail = err.detail
    res.status(statusCode).json(payload)
  }
})

// Manual AuthKey link is intentionally not same-host-only: the caller supplies the AuthKey
// directly, and sensitive-origin allowlisting plus double-submit CSRF is enough to protect it
// without breaking supported hosted configure flows.
app.post('/auth/stremio/link-authkey', requireCsrfToken, async (req, res) => {
  if (!authSecretAvailable()) {
    return res.status(500).json({ error: 'AUTH_TOKEN_SECRET not configured' })
  }
  const authSecret = getAuthTokenSecret()

  try {
    const clientIp = getClientIp(req)
    const limit = rateLimiters.auth.consume(clientIp || 'unknown')
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ error: 'too many requests' })
    }

    const payload = await createLinkedStremioAuthSession(req.body?.authKey, authSecret)
    res.json(payload)
  } catch (err) {
    const statusCode = Number(err?.statusCode || 0) || 500
    const payload = { error: statusCode === 500 ? 'Stremio link failed' : err.message }
    if (err?.detail) payload.detail = err.detail
    res.status(statusCode).json(payload)
  }
})

app.get('/auth/me', requireAuthUser, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    ok: true,
    user: publicUserModel(req.authUser)
  })
})

// Returns local/lan install URLs for one-click setup across PC + TV/phone on same LAN.
app.get('/network-info', requireLocalNetworkRoute, (req, res) => {
  const port = parseInt(process.env.PORT || '7000', 10)
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)
  const lanIps = detectLanAddresses()
  const primaryLanIp = lanIps[0] || ''
  const mdnsHost = getMdnsHost()
  const loopback = buildLocalModeUrls('127.0.0.1', port, httpsPort)
  const mdns = buildLocalModeUrls(mdnsHost, port, httpsPort)
  const lan = primaryLanIp ? buildLocalModeUrls(primaryLanIp, port, httpsPort) : null

  res.json({
    port,
    httpsPort,
    localHostname: mdnsHost,
    loopback,
    mdns: { hostname: mdnsHost, ...mdns },
    lan,
    lanCandidates: lanIps.map(ip => ({ ip, ...buildLocalModeUrls(ip, port, httpsPort) })),
    preferredOrder: [
      { id: 'localhost', url: loopback.httpManifest },
      { id: 'mdns', url: mdns.httpManifest },
      { id: 'lan-ip', url: lan ? lan.httpManifest : '' }
    ],
    pairEndpoints: buildLanPairEndpoints(port, httpsPort)
  })
})


// LAN Bridge is a hosted route, so the same-host helper must ask the relay to mint
// the token with the relay's secret instead of encrypting it with the local runtime secret.
app.post('/local/lan-token', requireLocalNetworkRoute, requireCsrfToken, async (req, res) => {
  const localConfig = loadLocalConfigFile()
  if (!localConfig) return res.status(404).json({ error: 'Local config not saved yet' })

  try {
    const normalized = await hydrateAccountLinkForConfig(normalizeAddonConfig(localConfig, {
      defaultEnabled: true,
      defaultRequired: true,
      includeLocalSecrets: true
    }))
    const pairId = sanitizePairId(normalized.lanPairId)
    const pairKey = sanitizePairKey(normalized.lanPairKey)
    if (!pairId || !pairKey || normalized.lanPairEnabled === false) {
      return res.status(400).json({ error: 'LAN Bridge is not configured yet' })
    }

    const hosted = await mintHostedConfigToken(normalized.lanPairRelayUrl || '', normalized)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      token: hosted.token,
      lanPairId: pairId,
      lanPairRelayUrl: hosted.relayBase
    })
  } catch (err) {
    res.status(Number(err?.statusCode || 500)).json({ error: 'Failed to build LAN token', detail: err.message })
  }
})

app.get('/local/pair-status', requireLocalNetworkRoute, async (req, res) => {
  const localConfig = loadLocalConfigFile()
  if (!localConfig) {
    return res.status(404).json({ ok: false, error: 'Local config not saved yet' })
  }

  const pairId = sanitizePairId(localConfig.lanPairId)
  const pairKey = sanitizePairKey(localConfig.lanPairKey)
  const relayUrl = normalizeRelayUrl(localConfig.lanPairRelayUrl || '')
  if (!pairId || !pairKey || !relayUrl || localConfig.lanPairEnabled === false) {
    return res.json({ ok: true, online: false })
  }

  try {
    const relayRes = await fetch(`${relayUrl}/pair/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairId, pairKey }),
      signal: AbortSignal.timeout(4000)
    })
    const relayData = await relayRes.json().catch(() => ({}))
    if (!relayRes.ok) {
      if (relayRes.status === 429) {
        res.setHeader('Retry-After', String(relayRes.headers.get('retry-after') || '60'))
        return res.status(429).json({ ok: false, error: 'relay rate-limited' })
      }
      return res.status(502).json({
        ok: false,
        error: 'relay status failed',
        detail: String(relayData?.error || `HTTP ${relayRes.status}`).trim()
      })
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      online: relayData?.online === true,
      updatedAt: Number(relayData?.updatedAt || 0),
      expiresAt: Number(relayData?.expiresAt || 0)
    })
  } catch (err) {
    res.status(502).json({ ok: false, error: 'relay status failed', detail: err.message })
  }
})

app.post('/pair/heartbeat', async (req, res) => {
  try {
    const pairId = sanitizePairId(req.body?.pairId)
    const pairKey = sanitizePairKey(req.body?.pairKey)
    const ownerId = sanitizePairOwnerId(req.body?.ownerId)
    const localHostname = normalizeLocalHostname(req.body?.localHostname || DEFAULT_LOCAL_HOSTNAME)
    const relayUrl = normalizeRelayUrl(req.body?.relayUrl || '')
    const endpoints = normalizePairEndpoints(req.body?.endpoints || [])
    const pairLabel = summarizePairId(pairId || req.body?.pairId)
    const clientLabel = requestClientLabel(req)
    const endpointSources = summarizeEndpointSources(endpoints)

    if (!pairId || !pairKey || !ownerId) {
      console.warn(`[pair] heartbeat rejected id=${pairLabel} from=${clientLabel} reason=missing-fields`)
      return res.status(400).json({ ok: false, error: 'pairId, pairKey, and ownerId are required' })
    }
    if (!endpoints.length) {
      console.warn(`[pair] heartbeat rejected id=${pairLabel} from=${clientLabel} reason=no-endpoints`)
      return res.status(400).json({ ok: false, error: 'At least one valid LAN endpoint is required' })
    }
    const clientIp = getClientIp(req)
    const limit = rateLimiters.heartbeat.consume(`${clientIp || 'unknown'}:${pairId}`)
    if (!limit.allowed) {
      console.warn(`[pair] heartbeat rate-limited id=${pairLabel} from=${clientLabel}`)
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ ok: false, error: 'too many requests' })
    }

    const incomingKeyHash = hashPairKey(pairKey)
    const incomingOwnerHash = hashPairKey(ownerId)
    const incomingIpHash = LAN_PAIR_BIND_PUBLIC_IP ? hashClientIp(req) : ''
    const existingState = await lanPairStore.get(pairId)
    if (existingState) {
      const existingKeyHash = String(existingState.keyHash || '')
      const existingOwnerHash = String(existingState.ownerHash || '')
      const ownerMatches = Boolean(existingOwnerHash) && existingOwnerHash === incomingOwnerHash
      if (existingKeyHash && incomingKeyHash !== existingKeyHash && !ownerMatches) {
        console.warn(`[pair] heartbeat rejected id=${pairLabel} from=${clientLabel} reason=invalid-key`)
        return res.status(403).json({ ok: false, error: 'invalid pair key' })
      }
      if (LAN_PAIR_LOCK_HOST) {
        if (existingOwnerHash && existingOwnerHash !== incomingOwnerHash) {
          console.warn(`[pair] heartbeat rejected id=${pairLabel} from=${clientLabel} reason=owner-mismatch`)
          return res.status(409).json({ ok: false, error: 'pair owner mismatch' })
        }
      }
      if (LAN_PAIR_BIND_PUBLIC_IP && LAN_PAIR_LOCK_HOST) {
        const existingIpHash = String(existingState.clientIpHash || '')
        if (existingIpHash && incomingIpHash && existingIpHash !== incomingIpHash) {
          console.warn(`[pair] heartbeat rejected id=${pairLabel} from=${clientLabel} reason=host-mismatch`)
          return res.status(409).json({ ok: false, error: 'pair host mismatch' })
        }
      }
    }

    const now = Date.now()
    const state = {
      pairId,
      keyHash: incomingKeyHash,
      ownerHash: incomingOwnerHash,
      clientIpHash: incomingIpHash,
      endpoints,
      localHostname,
      relayUrl,
      appVersion: String(req.body?.appVersion || '').trim(),
      updatedAt: now,
      expiresAt: now + LAN_PAIR_TTL_SECONDS * 1000
    }
    await lanPairStore.set(pairId, state, LAN_PAIR_TTL_SECONDS)
    res.json({
      ok: true,
      online: true,
      ttlSeconds: LAN_PAIR_TTL_SECONDS,
      updatedAt: state.updatedAt
    })
    console.log(
      `[pair] heartbeat ok id=${pairLabel} from=${clientLabel} endpoints=${endpoints.length} sources=${endpointSources} ttl=${LAN_PAIR_TTL_SECONDS}s`
    )
  } catch (err) {
    console.error('[pair] heartbeat error:', err.message)
    res.status(500).json({ ok: false, error: 'heartbeat failed', detail: err.message })
  }
})

app.post('/pair/status', async (req, res) => {
  try {
    const pairId = sanitizePairId(req.body?.pairId)
    const pairKey = sanitizePairKey(req.body?.pairKey)
    if (!pairId || !pairKey) return res.status(400).json({ ok: false, error: 'pairId and pairKey are required' })
    const clientIp = getClientIp(req)
    const limit = rateLimiters.status.consume(`${clientIp || 'unknown'}:${pairId}`)
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return res.status(429).json({ ok: false, error: 'too many requests' })
    }

    const state = await lanPairStore.get(pairId)
    if (!state) {
      return res.json({ ok: true, online: false })
    }

    if (hashPairKey(pairKey) !== String(state.keyHash || '')) {
      return res.json({ ok: true, online: false })
    }

    if (LAN_PAIR_BIND_PUBLIC_IP) {
      const stateIpHash = String(state.clientIpHash || '')
      const requestIpHash = hashClientIp(req)
      if (stateIpHash && requestIpHash && stateIpHash !== requestIpHash) {
        return res.json({ ok: true, online: false })
      }
    }

    const preferred = chooseLanPairEndpoint(state)
    res.json({
      ok: true,
      online: Boolean(preferred),
      updatedAt: Number(state.updatedAt || 0),
      expiresAt: Number(state.expiresAt || 0)
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: 'status failed', detail: err.message })
  }
})

// Local install helper page (localhost copy workflow).
// Open on the same PC that runs PVTKRRX:
// http://127.0.0.1:7000/local/install
app.get('/local/install', requireLocalNetworkRoute, (req, res) => {
  const port = parseInt(process.env.PORT || '7000', 10)
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)
  const loopbackUrls = buildLocalModeUrls('127.0.0.1', port, httpsPort)
  const requestedHost = sanitizeHostForUrl(req.query.host)
  const headerHost = sanitizeHostForUrl(String(req.get('host') || '').split(':')[0])
  const fallbackHost = sanitizeHostForUrl(getMdnsHost())
  const host = requestedHost || headerHost || fallbackHost || '127.0.0.1'
  const lanDebugManifest = `http://${host}:${port}/local/manifest.json?mode=local`
  const showLanDebugManifest = host !== '127.0.0.1' && host !== 'localhost'
  const pcConfigureUrl = `http://127.0.0.1:${port}/configure?target=pc`
  const lanConfigureUrl = `http://127.0.0.1:${port}/configure?target=lan`
  const seedboxConfigureUrl = `http://127.0.0.1:${port}/configure?target=seedbox`

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PVTKRRX Install Routes</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #101018; color: #e8e8ff; }
    .shell { max-width: 1040px; margin: 0 auto; }
    .card { padding: 18px; border: 1px solid #2a2a3a; border-radius: 12px; background: #151526; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18); }
    .lead { max-width: 760px; line-height: 1.55; color: #c9d4f8; }
    .route-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
    .route-card { padding: 16px; border: 1px solid #2d3958; border-radius: 10px; background: linear-gradient(180deg, #131c2b, #101725); }
    .route-card h3 { margin: 0 0 6px; font-size: 18px; }
    .route-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 1.3px; color: #7dd3fc; margin-bottom: 10px; }
    .route-copy { min-height: 64px; line-height: 1.5; color: #d9e2ff; }
    .route-list { margin: 12px 0; padding-left: 18px; color: #b9c5e8; line-height: 1.45; }
    .route-list li + li { margin-top: 5px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    button.btn, a.btn { display: inline-block; padding: 10px 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; }
    a.btn.secondary, button.btn.secondary { background: #1d2738; color: #d4def7; border: 1px solid #32415f; }
    code { display: block; margin-top: 10px; padding: 10px; background: #0c0c15; border-radius: 6px; word-break: break-all; }
    p { line-height: 1.45; }
    .route-note { margin-top: 10px; color: #99acd9; font-size: 13px; }
    @media (max-width: 900px) { .route-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <h2>PVTKRRX Install Routes</h2>
      <p class="lead">PVTKRRX is one runtime with three separate Stremio routes. PC Local is now a real same-PC addon for browsing and playback on this Windows machine. LAN Bridge remains the route for your other home devices.</p>
      <div class="route-grid">
        <section class="route-card">
          <div class="route-kicker">Same Windows machine</div>
          <h3>PC Local</h3>
          <p class="route-copy">Use this on the same Windows machine that runs the local PVTKRRX server. It now exposes the real movies, TV, sports, and library catalogs on this PC.</p>
          <ul class="route-list">
            <li>Uses loopback only</li>
            <li>No heartbeat or account sync</li>
            <li>Direct same-PC browsing and playback</li>
          </ul>
          <div class="actions">
            <button class="btn" id="copyHttpBtn" type="button">Copy PC Local URL</button>
            <a class="btn secondary" href="${pcConfigureUrl}">Open PC Local Setup</a>
          </div>
          <code id="manifestCode">${loopbackUrls.httpManifest}</code>
          <p class="route-note">Install this in Stremio Desktop on this same Windows PC when you want PVTKRRX to appear as a real local addon source.</p>
          ${showLanDebugManifest
            ? `<p class="route-note">Debug-only raw LAN URL. This is not the supported same-PC install path.</p><code>${lanDebugManifest}</code>`
            : ''}
        </section>

        <section class="route-card">
          <div class="route-kicker">Home network sync</div>
          <h3>LAN Bridge</h3>
          <p class="route-copy">Use this for phone, tablet, Android TV, Apple TV, or Stremio Web on the same LAN as the host PC.</p>
          <ul class="route-list">
            <li>Hosted install URL with LAN heartbeat</li>
            <li>Optional Stremio account sync</li>
            <li>Host PC must stay online</li>
          </ul>
          <div class="actions">
            <a class="btn" href="${lanConfigureUrl}">Open LAN Bridge Setup</a>
          </div>
          <p class="route-note">This is the route that should sync across your Stremio account on phone, TV, web, and Apple TV while the host PC stays online.</p>
        </section>

        <section class="route-card">
          <div class="route-kicker">Public HTTPS endpoints</div>
          <h3>Remote Seedbox</h3>
          <p class="route-copy">Use this when Prowlarr, qBittorrent, and file serving are reachable over public authenticated URLs. On the hosted site this is not a generic tracker-buffering route: it is ready-file / public-playback only unless you self-host playback support.</p>
          <ul class="route-list">
            <li>Not a generic tracker-buffering route</li>
            <li>Works away from home LAN</li>
            <li>Requires public HTTPS playback path</li>
          </ul>
          <div class="actions">
            <a class="btn" href="${seedboxConfigureUrl}">Open Remote Seedbox Setup</a>
          </div>
          <p class="route-note">This is the right route for seedbox-first playback, not the LAN Bridge. On the hosted relay it is intentionally ready-file / public-playback only and fails closed when the path cannot actually be served.</p>
        </section>
      </div>
    </div>
  </div>
  <script>
    async function copyCode(codeId, btnId) {
      const btn = document.getElementById(btnId)
      const text = document.getElementById(codeId).textContent.trim()
      try {
        await navigator.clipboard.writeText(text)
        const prev = btn.textContent
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = prev }, 1400)
      } catch (_) {
        const range = document.createRange()
        const code = document.getElementById(codeId)
        range.selectNodeContents(code)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        try { document.execCommand('copy') } catch (_) {}
        sel.removeAllRanges()
      }
    }
    document.getElementById('copyHttpBtn').addEventListener('click', () => copyCode('manifestCode', 'copyHttpBtn'))
  </script>
</body>
</html>`)
})

// ─── POST /test-connection — validate credentials ──────────
app.post('/test-connection', requireCsrfToken, async (req, res) => {
  const clientIp = getClientIp(req)
  const limit = rateLimiters.testConnection.consume(clientIp || 'unknown')
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds))
    return res.status(429).json({ error: 'too many requests' })
  }

  const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {}
  const existingConfig = resolveExistingConfigForBody(payload, { preferLocal: isSameHostRequest(req) })
  const mergedPayload = mergeRetainedSecrets(payload, existingConfig)
  const { jackettUrl, jackettApiKey, qbitUrl, qbitUsername, qbitPassword } = mergedPayload
  const parsedJackettUrl = parseHttpUrlCandidate(jackettUrl)
  const parsedQbitUrl = parseHttpUrlCandidate(qbitUrl)
  const trustedLocalCaller = isSameHostRequest(req)

  try {
    if (!trustedLocalCaller) {
      for (const target of [parsedJackettUrl, parsedQbitUrl]) {
        await validateHostedConnectionTarget(target)
      }
    }
  } catch (err) {
    const statusCode = Number(err?.statusCode || 0) || 403
    return res.status(statusCode).json({ error: err.message })
  }

  const results = { jackett: false, qbit: false }

  if (!parsedJackettUrl || !String(jackettApiKey || '').trim()) {
    results.jackettError = 'Prowlarr URL and API key are required'
  } else {
    try {
      const prowlarr = new ProwlarrClient(parsedJackettUrl.toString(), jackettApiKey)
      await prowlarr.caps()
      results.jackett = true
    } catch (err) {
      results.jackettError = err.message
    }
  }

  if (!parsedQbitUrl) {
    results.qbitError = 'qBittorrent URL is required'
  } else {
    try {
      const qbit = new QBitClient(parsedQbitUrl.toString(), qbitUsername, qbitPassword)
      await qbit.preferences()
      results.qbit = true
    } catch (err) {
      results.qbitError = err.message
    }
  }

  res.json(results)
})

// ─── withConfig middleware ──────────────────────────────────


// ─── Stremio addon routes (config-authenticated) ────────────
app.get('/:config/manifest.json', withConfig, (req, res) => {
  console.log(`[stremio] ← manifest  config=${req.params.config === 'local' ? 'local' : 'token'} from=${req.ip || req.socket?.remoteAddress || '?'}`)
  const m = getManifest(req)
  // Configured URL — user is already set up, show Install not Configure.
  // For /local without saved credentials, keep configurationRequired=true
  // so Stremio can install and then guide user to Configure instead of failing fetch.
  if (m.behaviorHints) m.behaviorHints.configurationRequired = Boolean(req.localConfigMissing)
  if (shouldRejectPcLocalManifestRequest(req)) {
    if (m.behaviorHints) m.behaviorHints.configurationRequired = true
    m.description = 'PC Local only works from http://127.0.0.1 on the same Windows PC. For LAN phones, TVs, or other devices, install LAN Bridge instead.'
    console.warn(
      `[stremio] local manifest rejected for non-local host=${requestHostname(req) || '?'} from=${requestClientLabel(req)}`
    )
  }
  if (req.configIssues.length > 0) {
    if (m.behaviorHints) m.behaviorHints.configurationRequired = true
    m.description = req.configIssues[0].message
  }
  console.log(`[stremio] → manifest  id=${m.id} catalogs=${m.catalogs?.length || 0} configRequired=${m.behaviorHints?.configurationRequired} issues=${req.configIssues.length}`)
  applyHostedRouteCacheHeaders(req, res, 60, { sMaxAge: 300, staleWhileRevalidate: 900 })
  res.json(m)
})

app.get('/:config/config.json', withConfig, requireLocalConfigReadback, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json(buildConfigReadback(req.config))
})

app.get('/manifest.json', (req, res) => {
  console.log(`[stremio] ← manifest  config=root from=${req.ip || req.socket?.remoteAddress || '?'}`)
  setPublicCacheHeaders(res, 60, { sMaxAge: 300, staleWhileRevalidate: 900 })
  const m = manifest.createBootstrapManifest(getPublicBaseUrl(req))
  console.log(`[stremio] → manifest  id=${m.id} catalogs=${m.catalogs?.length || 0} configRequired=${m.behaviorHints?.configurationRequired}`)
  res.json(m)
})

app.get('/catalog/:type/:id.json', withLegacyRootLocalConfig, requireConfigSubscription, async (req, res) => {
  console.warn(`[stremio] compat root catalog type=${req.params.type} id=${req.params.id} from=${requestClientLabel(req)} -> /local`)
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null, {
    baseUrl: getPublicBaseUrl(req)
  })
  console.log(`[stremio] compat root catalog result type=${req.params.type} id=${req.params.id} metas=${result?.metas?.length || 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/catalog/:type/:id/:extra.json', withLegacyRootLocalConfig, requireConfigSubscription, async (req, res) => {
  console.warn(`[stremio] compat root catalog type=${req.params.type} id=${req.params.id} extra=${req.params.extra} from=${requestClientLabel(req)} -> /local`)
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra, {
    baseUrl: getPublicBaseUrl(req)
  })
  console.log(`[stremio] compat root catalog result type=${req.params.type} id=${req.params.id} metas=${result?.metas?.length || 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/stream/:type/:id.json', withLegacyRootLocalConfig, requireConfigSubscription, async (req, res) => {
  const addonUrl = getPublicBaseUrl(req)
  console.warn(`[stremio] compat root stream type=${req.params.type} id=${req.params.id} from=${requestClientLabel(req)} -> /local`)
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, 'local')
  console.log(`[stremio] compat root stream result type=${req.params.type} id=${req.params.id} streams=${Array.isArray(result?.streams) ? result.streams.length : 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 20, 5, 120)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 3, 300) })
  res.json(result)
})

app.get('/meta/:type/:id.json', withLegacyRootLocalConfig, requireConfigSubscription, async (req, res) => {
  console.warn(`[stremio] compat root meta type=${req.params.type} id=${req.params.id} from=${requestClientLabel(req)} -> /local`)
  const result = await handleMeta(req.config, req.params.type, req.params.id, {
    baseUrl: getPublicBaseUrl(req)
  })
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: 300, staleWhileRevalidate: 1800 })
  res.json(result)
})

app.get('/:config/catalog/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('catalog'), async (req, res) => {
  console.log(`[stremio] ← catalog   type=${req.params.type} id=${req.params.id} from=${req.ip || req.socket?.remoteAddress || '?'}`)
  const result = await handleCatalog(req.config, req.params.type, req.params.id, null, {
    baseUrl: getPublicBaseUrl(req)
  })
  console.log(`[stremio] → catalog   type=${req.params.type} id=${req.params.id} metas=${result?.metas?.length || 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/:config/catalog/:type/:id/:extra.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('catalog'), async (req, res) => {
  console.log(`[stremio] ← catalog   type=${req.params.type} id=${req.params.id} extra=${req.params.extra} from=${req.ip || req.socket?.remoteAddress || '?'}`)
  const result = await handleCatalog(req.config, req.params.type, req.params.id, req.params.extra, {
    baseUrl: getPublicBaseUrl(req)
  })
  console.log(`[stremio] → catalog   type=${req.params.type} id=${req.params.id} metas=${result?.metas?.length || 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 120, 15, 900)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 4, 3600) })
  res.json(result)
})

app.get('/:config/stream/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('stream'), async (req, res) => {
  const addonUrl = getPublicBaseUrl(req)
  console.log(`[stremio] <- stream   type=${req.params.type} id=${req.params.id} from=${requestClientLabel(req)}`)
  const result = await handleStream(req.config, req.params.type, req.params.id, addonUrl, req.params.config)
  console.log(`[stremio] -> stream   type=${req.params.type} id=${req.params.id} streams=${Array.isArray(result?.streams) ? result.streams.length : 0}`)
  const ttl = parseCacheSeconds(result?.cacheMaxAge, 20, 5, 120)
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: ttl, staleWhileRevalidate: Math.min(ttl * 3, 300) })
  res.json(result)
})

app.get('/:config/meta/:type/:id.json', withConfig, requireConfigSubscription, maybeLanPairRedirect('meta'), async (req, res) => {
  console.log(`[stremio] ← meta     type=${req.params.type} id=${req.params.id} from=${req.ip || req.socket?.remoteAddress || '?'}`)
  const result = await handleMeta(req.config, req.params.type, req.params.id, {
    baseUrl: getPublicBaseUrl(req)
  })
  applyHostedRouteCacheHeaders(req, res, 0, { sMaxAge: 300, staleWhileRevalidate: 1800 })
  res.json(result)
})

app.get('/:config/qbit/preferences', withConfig, requireLocalQbitControl, async (req, res) => {
  try {
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const prefs = await qbit.preferences()
    res.json({
      savePath: String(prefs?.save_path || ''),
      tempPath: String(prefs?.temp_path || ''),
      incompletePathEnabled: Boolean(prefs?.temp_path_enabled)
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read qBit preferences', detail: err.message })
  }
})

app.post('/:config/qbit/download-path', withConfig, requireLocalQbitControl, async (req, res) => {
  try {
    const savePath = String(req.body?.savePath || '').trim()
    if (!savePath) return res.status(400).json({ error: 'savePath is required' })

    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    await qbit.setPreferences({ save_path: savePath })
    const prefs = await qbit.preferences()
    res.json({
      ok: true,
      savePath: String(prefs?.save_path || '')
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update qBit download path', detail: err.message })
  }
})

// ─── Built-in file server — serves local files with Range support ───
// Used when no external fileServerUrl is configured (e.g. local qBit setup).
app.get('/:config/file/:info', withConfig, requireConfigSubscription, maybeLanPairRedirect('file'), async (req, res) => {
  try {
    if (IS_VERCEL_RUNTIME && req.params.config !== 'local') {
      return res.status(403).json({
        error: 'Built-in file serving is disabled on hosted runtime',
        detail: 'Use File Server URL or LAN Pair local relay for playback'
      })
    }

    let state = null
    try {
      state = decodeFileStateToken(req.params.info)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid file token' })
    }
    const h = String(state?.h || '').toLowerCase()
    const p = String(state?.p || '')
    console.log(`[file-route] hash=${String(h || '').slice(0, 8)} hasPath=${Boolean(p)}`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const playback = await loadTorrentPlaybackState(qbit, String(h || '').toLowerCase(), p, req.config.additionalStorageRoots)
    if (!playback?.torrent) {
      console.warn(`[file-route] torrent not found hash=${String(h || '').slice(0, 8)}`)
      return res.status(404).json({ error: 'Torrent not found' })
    }

    const { torrent, files, file, resolvedFilePath } = playback
    const torrentHash = String(torrent?.hash || h || '').toLowerCase()
    if (!file) {
      const errMsg = playback.packedArchive
        ? 'Packed archive release detected (RAR) with no direct video file. Choose a WEB-DL/REMUX source.'
        : 'No playable video file found in torrent.'
      return res.status(422).json({ error: errMsg })
    }
    await primeTorrentForStreaming(qbit, torrent, file, files)
    if (!playback.fileExists || !resolvedFilePath) {
      console.warn('[file-route] file not found on disk')
      return res.status(425).json({
        error: 'Buffering torrent metadata',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    let fileSize = Math.max(0, Number(file?.size || playback.diskSize || 0))
    let readableBytes = Number(playback.readableBytes || 0)
    let isComplete = Number(file?.progress || torrent.progress || 0) >= 0.999

    const ext = path.extname(resolvedFilePath).toLowerCase()
    const mime = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.wmv': 'video/x-ms-wmv', '.ts': 'video/mp2t', '.m4v': 'video/x-m4v' }
    const contentType = mime[ext] || 'application/octet-stream'

    if (!isComplete && readableBytes <= 0) {
      return res.status(425).json({
        error: 'Download started — waiting for initial buffer',
        progress: Number(file?.progress || torrent.progress || 0)
      })
    }

    let maxReadable = isComplete ? fileSize : Math.max(0, Math.min(fileSize, readableBytes))
    const range = req.headers.range
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PVTKRRX-Progress', String(Math.round(Number(file?.progress || torrent.progress || 0) * 100)))

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      let start = parseInt(startStr, 10)
      let requestedEnd = endStr ? parseInt(endStr, 10) : fileSize - 1

      // Support suffix-byte ranges: "bytes=-500000"
      if (!Number.isFinite(start) && Number.isFinite(requestedEnd) && requestedEnd > 0) {
        const suffixLen = requestedEnd
        start = Math.max(0, maxReadable - suffixLen)
        requestedEnd = maxReadable - 1
      }

      if (!Number.isFinite(start) || start < 0 || start >= maxReadable) {
        // Stremio can request ranges ahead of currently downloaded bytes.
        // Avoid immediate hard failure: wait briefly for the needed range.
        if (!isComplete && Number.isFinite(start) && start >= 0) {
          const waitUntil = Date.now() + STREAM_RANGE_WAIT_TIMEOUT_MS
          while (Date.now() < waitUntil && start >= maxReadable) {
            await sleep(STREAM_RANGE_WAIT_INTERVAL_MS)
            const refreshed = await loadTorrentPlaybackState(qbit, torrentHash, file?.name || p, req.config.additionalStorageRoots)
            if (!refreshed?.torrent || !refreshed?.file) break
            fileSize = Math.max(0, Number(refreshed.file?.size || refreshed.diskSize || fileSize))
            readableBytes = Number(refreshed.readableBytes || readableBytes)
            isComplete = Number(refreshed.file?.progress || refreshed.torrent.progress || 0) >= 0.999
            maxReadable = isComplete ? fileSize : Math.max(0, Math.min(fileSize, readableBytes))
            if (start < maxReadable) break
          }
        }

        if (start >= maxReadable) {
          // Return a retryable status for progressive playback instead of a hard 416.
          res.setHeader('Content-Range', `bytes */${fileSize}`)
          res.setHeader('Retry-After', '2')
          return res.status(503).json({
            error: 'Requested byte range not available yet',
            progress: Number(file?.progress || torrent.progress || 0),
            retryAfterSeconds: 2
          })
        }
      }

      const end = Math.min(requestedEnd, maxReadable - 1)
      if (end < start) {
        res.setHeader('Content-Range', `bytes */${fileSize}`)
        res.setHeader('Retry-After', '2')
        return res.sendStatus(416)
      }

      if (isComplete && fileSize > 0) {
        const watchedRatio = (end + 1) / fileSize
        if (watchedRatio >= WATCHED_DELETE_THRESHOLD) {
          scheduleWatchedCleanup(req.config, torrentHash, `range-${Math.round(watchedRatio * 100)}pct`)
        }
      }

      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Content-Length', String(end - start + 1))
      fs.createReadStream(resolvedFilePath, { start, end }).pipe(res)
    } else {
      if (isComplete) {
        res.status(200)
        res.setHeader('Content-Length', String(fileSize))
        fs.createReadStream(resolvedFilePath).pipe(res)
      } else {
        if (maxReadable <= 0) {
          return res.status(425).json({
            error: 'Download started — waiting for initial buffer',
            progress: Number(file?.progress || torrent.progress || 0)
          })
        }
        const end = maxReadable - 1
        res.status(206)
        res.setHeader('Content-Range', `bytes 0-${end}/${fileSize}`)
        res.setHeader('Content-Length', String(maxReadable))
        fs.createReadStream(resolvedFilePath, { start: 0, end }).pipe(res)
      }
    }
  } catch (err) {
    console.error('[file] Error:', redactSensitiveText(err.message))
    if (!res.headersSent) res.status(500).json({ error: 'File serve failed' })
  }
})

// ─── Playback endpoint — Comet pattern ──────────────────────
app.get('/:config/playback/:info', withConfig, requireConfigSubscription, maybeLanPairRedirect('playback'), async (req, res) => {
  try {
    if (IS_VERCEL_RUNTIME && req.params.config !== 'local') {
      return res.status(403).json({
        error: 'Built-in playback buffering is disabled on hosted runtime',
        detail: 'Use File Server URL or LAN Pair local relay for playback'
      })
    }

    let info = null
    try {
      info = decodePlaybackStateToken(req.params.info)
    } catch (_) {
      return res.status(400).json({ error: 'Invalid playback token' })
    }
    const trackerHost = extractTrackerHost(info.l)
    let trackedHash = String(info.h || extractInfoHashFromLink(info.l) || '').toLowerCase()
    console.log(`[playback-route] hash=${trackedHash.slice(0, 8)} hasLink=${Boolean(info.l)}`)
    const qbit = new QBitClient(req.config.qbitUrl, req.config.qbitUsername, req.config.qbitPassword)
    const waitDeadline = Date.now() + STREAM_WAIT_TIMEOUT_MS
    let primedTorrent = false
    let primedFile = false
    let lastProgress = 0
    let hasTorrent = false
    let knownHashesBeforeAdd = null
    let maxAvailability = 0
    let maxSeedersSeen = 0
    let maxPeersSeen = 0

    // If we can identify the torrent hash, check whether it's already playable.
    if (trackedHash) {
      const existing = await loadTorrentPlaybackState(qbit, trackedHash, '', req.config.additionalStorageRoots)
      if (existing?.torrent) {
        if (!primedTorrent || (!primedFile && existing.file)) {
          await primeTorrentForStreaming(qbit, existing.torrent, existing.file, existing.files)
          primedTorrent = true
          if (existing.file) primedFile = true
        }
        if (!existing.file && (existing.packedArchive || Number(existing.torrent.progress || 0) >= 0.999)) {
          return res.status(422).json({
            error: existing.packedArchive
              ? 'Packed archive release detected (RAR). Reopen the stream list after qBittorrent adds it and use the RAR stream.'
              : 'Torrent completed but no playable video file was detected.'
          })
        }
        hasTorrent = true
        if ((existing.ready || Number(existing.torrent.progress || 0) >= 0.999) && existing.file?.name) {
          const fileUrl = buildPlaybackFileUrl(
            req.config,
            req.params.config,
            getPublicBaseUrl(req),
            existing.torrent.hash,
            existing.torrent,
            existing.file.name,
            {
              multipleFiles: existing.files.length > 1,
              currentFilePath: existing.fileExists ? existing.resolvedFilePath : '',
              requireCurrentPathProof: !isCompletedTorrent(existing.torrent, Number(existing.file?.progress || 0))
            }
          )
          if (!fileUrl) {
            return res.status(412).json({
              error: 'Hosted playback requires File Server URL or LAN Pair relay'
            })
          }
          console.log('[playback-route] existing torrent ready -> redirect file')
          return res.redirect(302, fileUrl)
        }
        lastProgress = Number(existing.file?.progress || existing.torrent.progress || 0)
        maxAvailability = Math.max(maxAvailability, Number(existing.torrent?.availability || 0))
        maxSeedersSeen = Math.max(maxSeedersSeen, Number(existing.torrent?.num_seeds || 0))
        maxPeersSeen = Math.max(maxPeersSeen, Number(existing.torrent?.num_leechs || 0))
      }
    }

    // If hash is missing, snapshot current torrent hashes so we can detect which torrent was just added.
    if (!trackedHash && info.l) {
      try {
        const current = await qbit.torrents('all')
        knownHashesBeforeAdd = new Set((current || []).map(t => String(t.hash || '').toLowerCase()))
      } catch (err) {
        console.warn('[playback-route] Hash snapshot failed — torrent detection may be unreliable:', redactSensitiveText(err.message))
      }
    }

    if (!hasTorrent && !info.l) {
      return res.status(404).json({ error: 'Torrent not found and no tracker link provided' })
    }

    // Not ready yet — add to qBit queue if we have a tracker/magnet link.
    if (info.l && !hasTorrent) {
      try {
        if (isMagnetLink(info.l)) {
          await qbit.add(info.l, {
            sequentialDownload: true,
            firstLastPiecePrio: STREAM_PRIORITIZE_LAST_PIECES
          })
        } else {
          const payload = await fetchTorrentPayload(info.l)
          await qbit.addTorrentFile(payload.bytes, payload.fileName, {
            sequentialDownload: true,
            firstLastPiecePrio: STREAM_PRIORITIZE_LAST_PIECES
          })
        }
      } catch (addErr) {
        // qBit may reject duplicate/stale URLs; continue probing torrent list.
        console.warn(`[playback-route] add rejected: ${redactSensitiveText(addErr.message)}`)
      }
    }

    // Keep request open and auto-redirect once enough start-buffer exists.
    while (Date.now() < waitDeadline) {
      await sleep(STREAM_WAIT_INTERVAL_MS)

      if (!trackedHash) {
        const allTorrents = await qbit.torrents('all')
        const candidate = pickLikelyNewTorrent(allTorrents, knownHashesBeforeAdd, trackerHost)
        if (candidate?.hash) {
          trackedHash = String(candidate.hash).toLowerCase()
          lastProgress = Number(candidate.progress || 0)
        } else {
          continue
        }
      }

      const state = await loadTorrentPlaybackState(qbit, trackedHash, '', req.config.additionalStorageRoots)
      if (!state?.torrent) {
        trackedHash = ''
        continue
      }
      if (!primedTorrent || (!primedFile && state.file)) {
        await primeTorrentForStreaming(qbit, state.torrent, state.file, state.files)
        primedTorrent = true
        if (state.file) primedFile = true
      }
      if (!state.file) {
        if (state.packedArchive || Number(state.torrent.progress || 0) >= 0.999) {
          return res.status(422).json({
            error: state.packedArchive
              ? 'Packed archive release detected (RAR). Reopen the stream list after qBittorrent adds it and use the RAR stream.'
              : 'Torrent completed but no playable video file was detected.'
          })
        }
        lastProgress = Number(state.torrent.progress || 0)
        maxAvailability = Math.max(maxAvailability, Number(state.torrent?.availability || 0))
        maxSeedersSeen = Math.max(maxSeedersSeen, Number(state.torrent?.num_seeds || 0))
        maxPeersSeen = Math.max(maxPeersSeen, Number(state.torrent?.num_leechs || 0))
        continue
      }
      hasTorrent = true

      lastProgress = Number(state.file?.progress || state.torrent.progress || 0)
      maxAvailability = Math.max(maxAvailability, Number(state.torrent?.availability || 0))
      maxSeedersSeen = Math.max(maxSeedersSeen, Number(state.torrent?.num_seeds || 0))
      maxPeersSeen = Math.max(maxPeersSeen, Number(state.torrent?.num_leechs || 0))
      if ((state.ready || Number(state.torrent.progress || 0) >= 0.999) && state.file?.name) {
        const fileUrl = buildPlaybackFileUrl(
          req.config,
          req.params.config,
          getPublicBaseUrl(req),
          state.torrent.hash,
          state.torrent,
          state.file.name,
          {
            multipleFiles: state.files.length > 1,
            currentFilePath: state.fileExists ? state.resolvedFilePath : '',
            requireCurrentPathProof: !isCompletedTorrent(state.torrent, Number(state.file?.progress || 0))
          }
        )
        if (!fileUrl) {
          return res.status(412).json({
            error: 'Hosted playback requires File Server URL or LAN Pair relay'
          })
        }
        console.log('[playback-route] progressive-ready -> redirect file')
        return res.redirect(302, fileUrl)
      }
    }

    // Still buffering.
    const stalledNoPieces = lastProgress <= 0.001 && maxAvailability < 0.01
    console.warn(
      `[playback-route] timeout waiting for buffer hash=${trackedHash.slice(0, 8)} ` +
      `progress=${Math.round(lastProgress * 100)}% availability=${maxAvailability.toFixed(3)} ` +
      `seeders=${maxSeedersSeen} peers=${maxPeersSeen}`
    )
    res.status(503).json({
      error: stalledNoPieces
        ? 'Source stalled - no available pieces from peers. Pick another source.'
        : 'Download queued - still buffering start of file',
      progress: lastProgress,
      availability: Number(maxAvailability.toFixed(3)),
      seedersSeen: maxSeedersSeen,
      peersSeen: maxPeersSeen,
      retryAfterSeconds: 4
    })
  } catch (err) {
    console.error('[playback-route] Error:', redactSensitiveText(err.message))
    res.status(500).json({ error: 'Playback failed' })
  }
})

// ─── Local dev server ───────────────────────────────────────
function startLocalServers(options = {}) {
  const exitOnHttpError = options.exitOnHttpError !== false
  const enableLanAlias = options.enableLanAlias !== false
  const ensureLanAccessOnBoot = options.ensureLanAccessOnBoot !== false
  const logger = createRedactingLogger(options.logger || console)
  const port = Number.isFinite(options.port) ? options.port : parseInt(process.env.PORT || '7000', 10)
  const httpsPort = Number.isFinite(options.httpsPort) ? options.httpsPort : parseInt(process.env.HTTPS_PORT || '7001', 10)
  const mdnsHost = getMdnsHost()
  let lanAlias = null
  const state = {
    httpServer: null,
    httpsServer: null,
    httpsReady: Promise.resolve(null),
    port,
    httpsPort,
    lanAlias: null
  }

  logger.log(`[boot] starting local runtime port=${port} httpsPort=${httpsPort}`)

  if (ensureLanAccessOnBoot) {
    ensureBootLanAccess(logger).catch(err => {
      logger.warn('[boot] LAN access setup failed:', err.message)
    })
  }

  const bootConfig = loadLocalConfigFile()
  if (bootConfig) {
    const warmTimer = setTimeout(() => {
      repairLocalProwlarrConfig(bootConfig, logger, 'server-boot')
        .then((repairedConfig) => scheduleLocalProviderWarmup(repairedConfig, logger, 'server-boot'))
        .catch(err => {
          logger.warn('[boot] Provider warmup failed:', err.message)
        })
    }, 900)
    if (typeof warmTimer.unref === 'function') warmTimer.unref()
  }

  // HTTP
  const httpServer = http.createServer(app)
  state.httpServer = httpServer
  httpServer.listen(port, () => {
    logger.log(`PVTKRRX HTTP  → http://localhost:${port}`)
    logger.log(`Configure:      http://localhost:${port}/configure`)
    if (enableLanAlias && !lanAlias) {
      lanAlias = startLanAlias({ hostname: mdnsHost, port, logger })
      state.lanAlias = lanAlias
      if (lanAlias?.enabled) {
        logger.log(`PVTKRRX mDNS  → http://${lanAlias.hostname}:${port}/local/manifest.json?mode=local`)
      } else {
        logger.warn(`PVTKRRX mDNS disabled (${lanAlias?.reason || 'unknown'})`)
      }
    }
  })
  httpServer.on('error', (err) => {
    logger.error('HTTP server failed to start:', err.message)
    if (exitOnHttpError) process.exit(1)
  })
  httpServer.on('close', () => {
    try {
      if (lanAlias && typeof lanAlias.stop === 'function') lanAlias.stop()
    } catch (err) {
      logger.warn('[server] mDNS alias cleanup failed:', err.message)
    }
  })

  // HTTPS (self-signed — must be trusted in OS/browser first)
  state.httpsReady = (async () => {
    try {
      const attrs = [{ name: 'commonName', value: 'localhost' }]
      const pems = await selfsigned.generate(attrs, {
        days: 365,
        algorithm: 'sha256',
        keySize: 2048,
        extensions: [
          { name: 'basicConstraints', cA: false, critical: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
          { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' },
              { type: 7, ip: '127.0.0.1' },
              { type: 7, ip: '::1' }
            ]
          }
        ]
      })
      const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app)
      state.httpsServer = httpsServer
      await new Promise((resolve, reject) => {
        const onListening = () => {
          httpsServer.off('error', onError)
          resolve()
        }
        const onError = (err) => {
          httpsServer.off('listening', onListening)
          reject(err)
        }
        httpsServer.once('listening', onListening)
        httpsServer.once('error', onError)
        httpsServer.listen(httpsPort)
      })
      logger.log(`PVTKRRX HTTPS → https://localhost:${httpsPort} (self-signed — trust cert in browser first)`)
      httpsServer.on('error', (err) => {
        logger.warn(`HTTPS server error on port ${httpsPort}:`, err.message)
      })
      return httpsServer
    } catch (err) {
      logger.warn('HTTPS server skipped:', err.message)
      return null
    }
  })()

  return state
}

if (require.main === module) {
  startLocalServers({ exitOnHttpError: true, logger: console })
}

module.exports = app
module.exports.startLocalServers = startLocalServers
