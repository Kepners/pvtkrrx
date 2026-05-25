'use strict'

// v1.3 stream routing post-processor.
//
// Debrid is the first downloader layer when configured.
// qBit streams are NEVER removed — they always stay as the underlying backup.
//
// Behaviour, uniform across movies, TV, and sports:
//   - Debrid linked (at least one enabled provider with apiKey):
//       Cache hits (⚡ READY) prepend the list, then ⬇ debrid playback
//       variants are ADDED above the existing qBit streams. qBit stays in
//       place underneath as the always-on fallback. Debrid variants derived
//       from an already-ready /file/ stream stay under that ready file so
//       Stremio opens the path that can play immediately.
//   - Debrid NOT linked:
//       Existing qBit stream list passes through untouched (v1.2 behavior).
//       Cache hits still prepend if a cache source is configured.
//
// Implementation note: existing streams carry encrypted playback/file tokens
// that embed {h: hash, l: link, p: path}. The router decodes those to derive
// the magnet URI for parallel debrid playback URLs. No upstream call-site edits.

const { decodeFileStateToken, decodePlaybackStateToken, encodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT } = require('./opaqueState')
const { searchAllSources } = require('./debridCache')
const { redactSensitiveText } = require('./logRedaction')

function buildMagnetFromHash(hash, name) {
  const h = String(hash || '').toLowerCase().trim()
  if (!/^[a-f0-9]{40}$/.test(h)) return null
  const dn = String(name || '').trim()
  return dn
    ? `magnet:?xt=urn:btih:${h}&dn=${encodeURIComponent(dn)}`
    : `magnet:?xt=urn:btih:${h}`
}

function tryExtractDebridMetaFromStreamUrl(url, playbackBaseUrl, configToken) {
  const text = String(url || '')
  if (!text) return null
  const playbackPrefix = `${String(playbackBaseUrl || '').replace(/\/+$/, '')}/${configToken}/playback/`
  const filePrefix = `${String(playbackBaseUrl || '').replace(/\/+$/, '')}/${configToken}/file/`
  // Already a debrid stream — skip rewrite
  if (text.includes('/playback/debrid/')) return null
  let token = null
  if (text.startsWith(playbackPrefix)) {
    token = text.slice(playbackPrefix.length).split(/[?#]/)[0]
  } else if (text.startsWith(filePrefix)) {
    token = text.slice(filePrefix.length).split(/[?#]/)[0]
    try {
      const state = decodeFileStateToken(token)
      if (!state?.h) return null
      return {
        hash: String(state.h || '').toLowerCase(),
        link: '',
        name: String(state.p || ''),
        sourceKind: 'file'
      }
    } catch (_) {
      return null
    }
  } else {
    return null
  }
  try {
    const state = decodePlaybackStateToken(token)
    if (!state || (!state.h && !state.l)) return null
    return {
      hash: String(state.h || '').toLowerCase(),
      link: String(state.l || ''),
      name: String(state.p || ''),
      sourceKind: 'playback'
    }
  } catch (_) {
    return null
  }
}

function buildRouteBase(playbackBaseUrl, configToken = '') {
  const base = String(playbackBaseUrl || '').replace(/\/+$/, '')
  const token = String(configToken || '').trim().replace(/^\/+|\/+$/g, '')
  return token ? `${base}/${token}` : base
}

function buildDebridPlaybackUrl(playbackBaseUrl, providers, payload) {
  try {
    const token = encodeDebridPlaybackToken({
      protocol: payload.protocol || DEBRID_PROTOCOL_TORRENT,
      src: payload.src,
      fileIdx: payload.fileIdx || 0,
      providers,
      name: payload.name || ''
    })
    return `${buildRouteBase(playbackBaseUrl, payload.configToken)}/playback/debrid/${token}`
  } catch (err) {
    console.warn(`[stream-router] debrid token encode failed: ${redactSensitiveText(err.message)}`)
    return null
  }
}

function pickReadyStreamName(hit) {
  const source = hit.sourceId === 'putio' ? 'put.io' : hit.sourceId === 'pm' ? 'Premiumize' : hit.sourceId
  // COPY DRAFT — pending docs/copy.md approval. Brief §3 stream-prefix lock.
  return `⚡ READY · ${source}`
}

function prioritizeProviderForCacheSource(sourceId, providers) {
  const list = Array.isArray(providers) ? providers.filter(Boolean) : []
  const source = String(sourceId || '').toLowerCase()
  if (source !== 'pm') return list
  const pm = list.filter(p => String(p?.type || '').toLowerCase() === 'pm')
  const rest = list.filter(p => String(p?.type || '').toLowerCase() !== 'pm')
  return [...pm, ...rest]
}

async function resolveCacheHitToStreamUrl(hit, configuredSources, playbackBaseUrl, providersForDebrid, configToken = '') {
  if (hit.directStreamUrl) return hit.directStreamUrl
  // PM cache hits don't have a direct URL — they need the debrid add+poll cycle.
  // Route through /playback/debrid so the existing handler does add+select+unrestrict.
  if (hit.sourceId === 'pm' && hit.infohash) {
    const magnet = buildMagnetFromHash(hit.infohash, hit.name)
    if (!magnet) return null
    const providerOrder = prioritizeProviderForCacheSource(hit.sourceId, providersForDebrid)
    return buildDebridPlaybackUrl(playbackBaseUrl, providerOrder, {
      src: magnet,
      name: hit.name,
      protocol: DEBRID_PROTOCOL_TORRENT,
      configToken
    })
  }
  // put.io fileId path — fetch fresh signed URL from the source
  if (hit.sourceId === 'putio' && hit.fileId) {
    const { getCacheSearchSource } = require('../clients/cacheSearch/base')
    const cred = configuredSources.find(c => c.type === 'putio')
    if (!cred?.apiKey) return null
    try {
      const source = getCacheSearchSource('putio', cred.apiKey)
      return await source.streamUrl(hit)
    } catch (err) {
      console.warn(`[stream-router] put.io streamUrl resolve failed: ${redactSensitiveText(err.message)}`)
      return null
    }
  }
  return null
}

function resolveEnabledCacheSources(cacheConfig = {}, enabledDebrid = []) {
  const sources = []
  const seen = new Set()
  const pmDebridKey = String(
    (Array.isArray(enabledDebrid) ? enabledDebrid : [])
      .find(p => String(p?.type || '').toLowerCase() === 'pm')?.apiKey || ''
  ).trim()
  const rawSources = Array.isArray(cacheConfig.sources) ? cacheConfig.sources : []

  for (const raw of rawSources) {
    if (!raw || typeof raw !== 'object') continue
    const type = String(raw.type || '').trim().toLowerCase()
    if (!type || seen.has(type)) continue
    const apiKey = String(raw.apiKey || '').trim() || (type === 'pm' ? pmDebridKey : '')
    if (raw.enabled !== true || !apiKey) continue
    seen.add(type)
    sources.push({ ...raw, type, apiKey, enabled: true })
  }

  if (pmDebridKey && !seen.has('pm')) {
    sources.push({ type: 'pm', apiKey: pmDebridKey, enabled: true, implicit: true })
  }

  return sources
}

async function buildCacheSearchStreams(query, enabledSources, playbackBaseUrl, providersForDebrid, configToken = '') {
  if (!enabledSources.length) return []
  let hits = []
  try {
    hits = await searchAllSources(
      enabledSources.map(s => ({ type: s.type, apiKey: s.apiKey, enabled: true, source: s.source })),
      query
    )
  } catch (err) {
    console.warn(`[stream-router] cache search failed: ${redactSensitiveText(err.message)}`)
    return []
  }
  const out = []
  for (const hit of hits) {
    let url
    try {
      url = await resolveCacheHitToStreamUrl(hit, enabledSources, playbackBaseUrl, providersForDebrid, configToken)
    } catch (err) {
      console.warn(`[stream-router] cache hit resolve failed: ${redactSensitiveText(err.message)}`)
      continue
    }
    if (!url) continue
    out.push({
      name: pickReadyStreamName(hit),
      title: hit.name || 'cached',
      url
    })
  }
  return out
}

async function applyV13Routing(result, ctx = {}) {
  if (!result || typeof result !== 'object') return result
  const config = ctx.config && typeof ctx.config === 'object' ? ctx.config : {}
  const playbackBaseUrl = String(ctx.playbackBaseUrl || ctx.addonUrl || '').replace(/\/+$/, '')
  const configToken = String(ctx.configToken || '').trim()
  const debridConfig = config.debrid || { providers: [], preferDebridOverSeedbox: true }
  const cacheConfig = config.cacheSearch || { sources: [] }
  const enabledDebrid = (debridConfig.providers || []).filter(p => p && p.enabled && String(p.apiKey || '').trim())
  const enabledCache = resolveEnabledCacheSources(cacheConfig, enabledDebrid)
  const hasDebrid = enabledDebrid.length > 0

  // Backward compat: install has NOT opted into v1.3 (no debrid + no cache search
  // configured). Pass through with v1.2 behavior — no routing changes at all.
  if (!hasDebrid && enabledCache.length === 0) {
    return result
  }

  const existing = Array.isArray(result.streams) ? result.streams : []
  const providersForDebrid = enabledDebrid.map(p => ({ type: p.type, apiKey: p.apiKey }))
  const debridMetas = []

  // Build debrid variants from existing streams (where we can derive a hash/magnet).
  const debridStreams = []
  const debridFileStreams = []
  if (hasDebrid) {
    for (const stream of existing) {
      const meta = tryExtractDebridMetaFromStreamUrl(stream?.url, playbackBaseUrl, configToken)
      if (!meta) continue
      debridMetas.push(meta)
      const torrentSource = meta.link || (meta.hash ? buildMagnetFromHash(meta.hash, meta.name) : null)
      if (!torrentSource) continue
      const debridUrl = buildDebridPlaybackUrl(playbackBaseUrl, providersForDebrid, {
        src: torrentSource,
        name: stream.title || meta.name || stream.name || '',
        protocol: DEBRID_PROTOCOL_TORRENT,
        configToken
      })
      if (!debridUrl) continue
      // COPY DRAFT — pending docs/copy.md approval. Brief §3 stream-prefix lock.
      const providerLabel = enabledDebrid[0]?.type === 'rd'
        ? 'RD'
        : enabledDebrid[0]?.type === 'ad'
          ? 'AD'
          : 'PM'
      const routedStream = {
        ...stream,
        name: `⬇ ${providerLabel} · ${(stream.name || '').replace(/^[⚡⬇] [A-Za-z.]+ · /, '')}`,
        url: debridUrl
      }
      if (meta.sourceKind === 'file') debridFileStreams.push(routedStream)
      else debridStreams.push(routedStream)
    }
  }

  // Build cache-search READY streams. Hash checks run first because Premiumize
  // cache lookup is hash-based; title search is only a fallback for sources
  // that support it, such as put.io.
  const queryTitle = (() => {
    for (const s of existing) {
      const candidate = String(s?.title || s?.name || '').split('\n')[0].trim()
      if (candidate) return candidate
    }
    return ''
  })()
  const cacheStreams = []
  if (enabledCache.length > 0) {
    const seenHashes = new Set()
    for (const meta of debridMetas) {
      const hash = String(meta?.hash || '').trim().toLowerCase()
      if (!/^[a-f0-9]{40}$/.test(hash) || seenHashes.has(hash)) continue
      seenHashes.add(hash)
      cacheStreams.push(...await buildCacheSearchStreams(
        { infohash: hash, title: meta.name || queryTitle },
        enabledCache,
        playbackBaseUrl,
        providersForDebrid,
        configToken
      ))
    }
    if (queryTitle) {
      cacheStreams.push(...await buildCacheSearchStreams(
        { title: queryTitle },
        enabledCache,
        playbackBaseUrl,
        providersForDebrid,
        configToken
      ))
    }
  }

  // qBit remains available for every content type (movies, TV, sports), but
  // debrid is the first downloader target when configured.
  const baseStreams = existing
  const finalStreams = hasDebrid
    ? [...cacheStreams, ...debridStreams, ...debridFileStreams, ...baseStreams]
    : [...cacheStreams, ...baseStreams]

  // Dedupe by URL to prevent the same /playback/debrid token from appearing twice.
  const seen = new Set()
  const deduped = []
  for (const s of finalStreams) {
    const key = String(s?.url || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(s)
  }

  return {
    ...result,
    streams: deduped
  }
}

module.exports = {
  applyV13Routing,
  // exported for tests
  _tryExtractDebridMetaFromStreamUrl: tryExtractDebridMetaFromStreamUrl,
  _buildDebridPlaybackUrl: buildDebridPlaybackUrl,
  _buildMagnetFromHash: buildMagnetFromHash,
  _resolveEnabledCacheSources: resolveEnabledCacheSources,
  _prioritizeProviderForCacheSource: prioritizeProviderForCacheSource
}
