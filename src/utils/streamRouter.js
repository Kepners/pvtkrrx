'use strict'

// v1.3 stream routing post-processor.
//
// Sits between handleStream's qBit-flavored output and the Stremio response.
// Reads config.debrid + config.cacheSearch and rewrites the stream list
// per the routing rules:
//   - Sports (sportsmeta:* / pvtkrrx:sm:*): debrid only — never qBit.
//     If no debrid configured, returns empty streams.
//   - Movies/TV: debrid first (preferDebridOverSeedbox=true default),
//     qBit kept as fallback.
//   - Cache search hits (put.io + PM) prepended as ⚡ READY streams.
//
// Implementation note: existing streams carry encrypted playback tokens that
// embed {h: hash, l: link, p: path}. The router decodes those to derive the
// magnet URI for parallel debrid playback URLs. No upstream call-site edits.

const { decodePlaybackStateToken, encodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT } = require('./opaqueState')
const { searchAllSources } = require('./debridCache')
const { redactSensitiveText } = require('./logRedaction')

function isSportsId(id) {
  const s = String(id || '')
  return s.startsWith('sportsmeta:') || s.startsWith('pvtkrrx:sm:')
}

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
    return null // direct file URL; nothing to derive
  } else {
    return null
  }
  try {
    const state = decodePlaybackStateToken(token)
    if (!state || (!state.h && !state.l)) return null
    return {
      hash: String(state.h || '').toLowerCase(),
      link: String(state.l || ''),
      name: String(state.p || '')
    }
  } catch (_) {
    return null
  }
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
    return `${String(playbackBaseUrl || '').replace(/\/+$/, '')}/playback/debrid/${token}`
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

async function resolveCacheHitToStreamUrl(hit, configuredSources, playbackBaseUrl, providersForDebrid) {
  if (hit.directStreamUrl) return hit.directStreamUrl
  // PM cache hits don't have a direct URL — they need the debrid add+poll cycle.
  // Route through /playback/debrid so the existing handler does add+select+unrestrict.
  if (hit.sourceId === 'pm' && hit.infohash) {
    const magnet = buildMagnetFromHash(hit.infohash, hit.name)
    if (!magnet) return null
    return buildDebridPlaybackUrl(playbackBaseUrl, providersForDebrid, {
      src: magnet,
      name: hit.name,
      protocol: DEBRID_PROTOCOL_TORRENT
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

async function buildCacheSearchStreams(query, enabledSources, playbackBaseUrl, providersForDebrid) {
  if (!enabledSources.length) return []
  let hits = []
  try {
    hits = await searchAllSources(
      enabledSources.map(s => ({ type: s.type, apiKey: s.apiKey, enabled: true })),
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
      url = await resolveCacheHitToStreamUrl(hit, enabledSources, playbackBaseUrl, providersForDebrid)
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
  const id = String(ctx.id || '')
  const isSports = isSportsId(id)
  const debridConfig = config.debrid || { providers: [], preferDebridOverSeedbox: true }
  const cacheConfig = config.cacheSearch || { sources: [] }
  const enabledDebrid = (debridConfig.providers || []).filter(p => p && p.enabled && String(p.apiKey || '').trim())
  const enabledCache = (cacheConfig.sources || []).filter(s => s && s.enabled && String(s.apiKey || '').trim())
  const hasDebrid = enabledDebrid.length > 0
  const preferDebrid = debridConfig.preferDebridOverSeedbox !== false

  // Backward compat: install has NOT opted into v1.3 (no debrid + no cache search
  // sources configured). Pass through with v1.2 behavior — sports keep working
  // via qBit, no routing changes at all.
  const hasAnyV13ProviderConfigured = (debridConfig.providers || []).some(p => p && String(p.apiKey || '').trim()) ||
    (cacheConfig.sources || []).some(s => s && String(s.apiKey || '').trim())
  if (!hasDebrid && enabledCache.length === 0 && !hasAnyV13ProviderConfigured) {
    return result
  }

  // v1.3 sports rule: user has opted into v1.3 routing but has no ENABLED debrid
  // provider → sports streams are empty (no qBit fallback for sports per the brief).
  if (isSports && !hasDebrid) {
    return { ...result, streams: [], cacheMaxAge: result.cacheMaxAge ?? 30 }
  }

  const existing = Array.isArray(result.streams) ? result.streams : []
  const providersForDebrid = enabledDebrid.map(p => ({ type: p.type, apiKey: p.apiKey }))

  // Build debrid variants from existing streams (where we can derive a hash/magnet).
  const debridStreams = []
  if (hasDebrid) {
    for (const stream of existing) {
      const meta = tryExtractDebridMetaFromStreamUrl(stream?.url, playbackBaseUrl, configToken)
      if (!meta) continue
      const magnet = meta.link && meta.link.startsWith('magnet:')
        ? meta.link
        : meta.hash ? buildMagnetFromHash(meta.hash, meta.name) : null
      if (!magnet) continue
      const debridUrl = buildDebridPlaybackUrl(playbackBaseUrl, providersForDebrid, {
        src: magnet,
        name: stream.title || stream.name || meta.name || '',
        protocol: DEBRID_PROTOCOL_TORRENT
      })
      if (!debridUrl) continue
      // COPY DRAFT — pending docs/copy.md approval. Brief §3 stream-prefix lock.
      const providerLabel = enabledDebrid[0]?.type === 'rd'
        ? 'RD'
        : enabledDebrid[0]?.type === 'ad'
          ? 'AD'
          : 'PM'
      debridStreams.push({
        ...stream,
        name: `⬇ ${providerLabel} · ${(stream.name || '').replace(/^[⚡⬇] [A-Za-z.]+ · /, '')}`,
        url: debridUrl
      })
    }
  }

  // Build cache-search READY streams. Use first existing stream's title as the search query.
  const queryTitle = (() => {
    for (const s of existing) {
      const candidate = String(s?.title || s?.name || '').split('\n')[0].trim()
      if (candidate) return candidate
    }
    return ''
  })()
  const cacheStreams = enabledCache.length > 0
    ? await buildCacheSearchStreams({ title: queryTitle }, enabledCache, playbackBaseUrl, providersForDebrid)
    : []

  // Sports + debrid: drop the qBit-flavored existing streams; only debrid + ready.
  let baseStreams = existing
  if (isSports && hasDebrid) {
    baseStreams = []
  }

  const finalStreams = preferDebrid
    ? [...cacheStreams, ...debridStreams, ...baseStreams]
    : [...cacheStreams, ...baseStreams, ...debridStreams]

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
  _buildMagnetFromHash: buildMagnetFromHash
}
