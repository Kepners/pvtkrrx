'use strict'

// v1.3 stream routing post-processor.
//
// Cached Debrid is the first playable layer when configured.
// Uncached sports Debrid handoff is opt-in only.
// qBit streams are NEVER removed — they always stay as the underlying backup.
//
// Behaviour, uniform across movies, TV, and sports:
//   - Debrid linked (at least one enabled provider with apiKey):
//       Cache hits prepend the list. For movies/TV, uncached debrid playback
//       variants are ADDED above existing qBit streams. For sports, uncached
//       debrid handoff rows are hidden unless explicitly enabled. qBit stays
//       underneath as the always-on fallback. Debrid variants derived from an
//       already-ready /file/ stream stay under that ready file so Stremio opens
//       the path that can play immediately.
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
const { PVTKRRX_LOGO_URL, formatSize, isReadyLocalStream } = require('./streams')
const { playbackContentTypeFor, detectQualityLabel, detectContainerLabel } = require('./mediaLabels')

function formatCacheSourceLabel(sourceId = '') {
  const source = String(sourceId || '').toLowerCase()
  if (source === 'pm') return 'Premiumize'
  if (source === 'putio') return 'put.io'
  return sourceId ? String(sourceId) : ''
}

function buildReadyCacheDescription(hit = {}) {
  const name = String(hit.name || 'cached').trim()
  const sizeBytes = Math.max(0, Number(hit.sizeBytes || hit.size || 0))
  const facts = [
    'READY',
    detectQualityLabel(name),
    sizeBytes > 0 ? formatSize(sizeBytes) : '',
    detectContainerLabel(name),
    formatCacheSourceLabel(hit.sourceId)
  ].filter(Boolean).join(' | ')
  return [name, facts].filter(Boolean).join('\n')
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

function decorateDebridDescription(description, providerLabel) {
  const label = String(providerLabel || '').trim().toUpperCase()
  const text = String(description || '').trim()
  const prefix = label ? `${label} DEBRID` : 'DEBRID'
  if (!text) return prefix
  if (new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return text
  return `${prefix}\n${text}`
}

// COPY: owner-approved "will download" status for uncached debrid downloader rows.
// Keeps the existing "⬇ PM · " provider prefix (smoke-asserted) and inserts the
// status so the user can tell, before clicking, that the row triggers a download.
function markDebridWillDownload(name) {
  const text = String(name || '')
  if (/·\s*will download\b/i.test(text)) return text
  const m = text.match(/^(⬇\s+[A-Za-z.]+)\s+·\s+(.*)$/)
  if (m) return `${m[1]} · will download · ${m[2]}`
  if (/^⬇/.test(text)) return `${text} · will download`
  return text
}

function isSportsContext(ctx = {}) {
  const type = String(ctx.type || '').trim().toLowerCase()
  const id = String(ctx.id || '').trim().toLowerCase()
  return type === 'sports' || id.startsWith('sportsmeta:')
}

function isReadyCacheStream(stream = {}) {
  const name = String(stream?.name || '')
  const mode = String(stream?.behaviorHints?.sourceMode || '').toLowerCase()
  return /\bREADY\b/i.test(name) || mode === 'cache' || mode === 'cached' || mode === 'debrid-cache'
}

function isNoticeStream(stream = {}) {
  return String(stream?.behaviorHints?.sourceMode || '').toLowerCase() === 'notice'
}

function sportsStreamSourceSize(stream = {}) {
  const hints = stream?.behaviorHints || {}
  return Math.max(0, Number(hints.sourceSize || hints.videoSize || 0))
}

function sportsStreamSeeders(stream = {}) {
  return Math.max(0, Number(stream?.behaviorHints?.sourceSeeders || 0))
}

function isSportsIntermediateMode(stream = {}) {
  const mode = String(stream?.behaviorHints?.sourceMode || '').toLowerCase()
  return mode === 'tracker' || mode === 'buffering'
}

function shouldKeepSportsStream(stream = {}) {
  if (isReadyCacheStream(stream) || isNoticeStream(stream)) return true

  const mode = String(stream?.behaviorHints?.sourceMode || '').toLowerCase()
  if (!mode) return true

  const sourceSize = sportsStreamSourceSize(stream)
  if (sourceSize <= 0) return false

  if (isSportsIntermediateMode(stream)) {
    return sportsStreamSeeders(stream) > 0
  }

  return true
}

function filterSportsStreams(streams = []) {
  return (Array.isArray(streams) ? streams : []).filter(shouldKeepSportsStream)
}

function allowUncachedSportsDebridHandoff(config = {}) {
  if (config?.debrid?.allowUncachedSportsHandoff === true) return true
  return /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_DEBRID_UNCACHED_SPORTS_HANDOFF || '').trim())
}

function pickReadyStreamName(hit) {
  // COPY DRAFT — pending docs/copy.md approval. Brief §3 stream-prefix lock.
  return '⚡ READY'
}

// The provider that reported the cache hit must be tried first.
//
// This used to special-case 'pm' only, which was fine while Premiumize was the
// only cache source. Once Real-Debrid gained one, an RD-only hit on a
// [Premiumize, Real-Debrid] install still went to Premiumize first — and
// Premiumize accepts magnets, so it would start a brand-new transfer of a file
// only Real-Debrid actually had, then return 503 after the poll window without
// ever asking the provider that was holding it.
function prioritizeProviderForCacheSource(sourceId, providers) {
  const list = Array.isArray(providers) ? providers.filter(Boolean) : []
  const source = String(sourceId || '').toLowerCase()
  if (!source) return list
  const owning = list.filter(p => String(p?.type || '').toLowerCase() === source)
  if (!owning.length) return list
  const rest = list.filter(p => String(p?.type || '').toLowerCase() !== source)
  return [...owning, ...rest]
}

async function resolveCacheHitToStreamUrl(hit, configuredSources, playbackBaseUrl, providersForDebrid, configToken = '') {
  if (hit.directStreamUrl) return hit.directStreamUrl
  // PM and RD cache hits don't carry a direct URL — they resolve at click time
  // through /playback/debrid. For RD the handler finds the item already on the
  // account and unrestricts it without re-adding, so the click is instant.
  if ((hit.sourceId === 'pm' || hit.sourceId === 'rd') && hit.infohash) {
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

  // Same implicit treatment for Real-Debrid. Its cache source reads the account's
  // own finished torrents, so configuring RD as a debrid provider is already
  // consent to ask RD what it is holding — no extra setup, and without this an
  // RD-only install can never show a "⚡ READY" row.
  const rdDebridKey = String(
    (Array.isArray(enabledDebrid) ? enabledDebrid : [])
      .find(p => String(p?.type || '').toLowerCase() === 'rd')?.apiKey || ''
  ).trim()
  if (rdDebridKey && !seen.has('rd')) {
    sources.push({ type: 'rd', apiKey: rdDebridKey, enabled: true, implicit: true })
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
      description: buildReadyCacheDescription(hit),
      thumbnail: PVTKRRX_LOGO_URL,
      url,
      behaviorHints: {
        notWebReady: true,
        filename: hit.name || 'cached',
        sourceMode: 'debrid-cache',
        sourceOriginLabel: formatCacheSourceLabel(hit.sourceId),
        sourceSize: Math.max(0, Number(hit.sizeBytes || 0)),
        proxyHeaders: {
          response: {
            'Content-Type': playbackContentTypeFor(hit.name || '')
          }
        }
      }
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
  const existing = Array.isArray(result.streams) ? result.streams : []
  const sportsContext = isSportsContext(ctx)
  const sportsUncachedDebridHandoffAllowed = !sportsContext || allowUncachedSportsDebridHandoff(config)

  // Backward compat: install has NOT opted into v1.3 (no debrid + no cache search
  // configured). Pass through with v1.2 behavior — no routing changes at all.
  if (!hasDebrid && enabledCache.length === 0) {
    if (sportsContext) {
      return {
        ...result,
        streams: filterSportsStreams(existing)
      }
    }
    return result
  }

  const providersForDebrid = enabledDebrid.map(p => ({ type: p.type, apiKey: p.apiKey }))
  const debridMetas = []

  // Build debrid variants from existing streams (where we can derive a hash/magnet).
  const debridStreams = []
  const debridFileStreams = []
  const debridPlaybackHashByStream = new Map()
  const cachedHashes = new Set()
  if (hasDebrid) {
    for (const stream of existing) {
      const meta = tryExtractDebridMetaFromStreamUrl(stream?.url, playbackBaseUrl, configToken)
      if (!meta) continue
      debridMetas.push(meta)
      if (sportsContext && meta.sourceKind === 'file') {
        continue
      }
      if (sportsContext && meta.sourceKind === 'playback' && !sportsUncachedDebridHandoffAllowed) {
        continue
      }
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
        description: decorateDebridDescription(stream.description, providerLabel),
        url: debridUrl
      }
      if (meta.sourceKind === 'file') {
        debridFileStreams.push(routedStream)
      } else {
        debridStreams.push(routedStream)
        if (meta.hash) debridPlaybackHashByStream.set(routedStream, String(meta.hash).toLowerCase())
      }
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
    // Dedupe hashes first, then run the per-hash cache lookups concurrently instead
    // of awaiting them one at a time (the old N+1). Results are re-flattened in the
    // original hash order so emitted-row ordering stays identical.
    const seenHashes = new Set()
    const hashMetas = []
    for (const meta of debridMetas) {
      const hash = String(meta?.hash || '').trim().toLowerCase()
      if (!/^[a-f0-9]{40}$/.test(hash) || seenHashes.has(hash)) continue
      seenHashes.add(hash)
      hashMetas.push({ hash, title: meta.name || queryTitle })
    }
    const builtByHash = await Promise.all(hashMetas.map(({ hash, title }) =>
      buildCacheSearchStreams(
        { infohash: hash, title },
        enabledCache,
        playbackBaseUrl,
        providersForDebrid,
        configToken
      ).then(built => ({ hash, built }))
    ))
    let hashPassProducedHits = false
    for (const { hash, built } of builtByHash) {
      // A cache hit means the provider already holds this exact hash -> instant,
      // so its debrid downloader row must NOT be marked "will download".
      if (built.length > 0) {
        cachedHashes.add(hash)
        hashPassProducedHits = true
      }
      cacheStreams.push(...built)
    }
    // The title search is only a fallback for sources that resolve by name (put.io).
    // If the hash pass already produced cache hits, skip the redundant title query.
    if (queryTitle && !hashPassProducedHits) {
      cacheStreams.push(...await buildCacheSearchStreams(
        { title: queryTitle },
        enabledCache,
        playbackBaseUrl,
        providersForDebrid,
        configToken
      ))
    }
  }

  // Honest labels: a debrid downloader row whose hash is NOT a confirmed cache
  // hit will start a server-side download on click, so mark it "will download".
  // (RD/AD have no reliable cache check, so their rows fall through to this too —
  // which is correct, since for them everything is a fresh download.) Cached items
  // already surface a separate "⚡ READY" row, so their downloader row stays plain.
  for (const routedStream of debridStreams) {
    const hash = debridPlaybackHashByStream.get(routedStream)
    if (hash && !cachedHashes.has(hash)) {
      routedStream.name = markDebridWillDownload(routedStream.name)
    }
  }

  // qBit remains available for every content type (movies, TV, sports). By default
  // (preferDebridOverSeedbox !== false) debrid/cache groups lead and qBit/seedbox
  // follows. When the user explicitly turns the preference off, the same GROUPS are
  // re-ordered so base/seedbox streams come first — no stream is ever dropped (debrid
  // is additive; qBit always stays in the list).
  //
  // Owner ruling 2026-08-15: content that is ALREADY DOWNLOADED and playable the
  // moment it is clicked outranks everything, debrid preference included. A family
  // clicking the top row must land on a file that exists, not on a row that starts
  // a fresh transfer. Ready local rows are hoisted above the debrid block; every
  // other group keeps its existing relative order.
  const baseStreams = existing
  const readyBaseStreams = baseStreams.filter(isReadyLocalStream)
  const restBaseStreams = baseStreams.filter(s => !isReadyLocalStream(s))
  const preferDebrid = debridConfig.preferDebridOverSeedbox !== false
  const finalStreams = hasDebrid
    ? (preferDebrid
      ? [...readyBaseStreams, ...cacheStreams, ...debridStreams, ...debridFileStreams, ...restBaseStreams]
      : [...baseStreams, ...cacheStreams, ...debridStreams, ...debridFileStreams])
    : [...readyBaseStreams, ...cacheStreams, ...restBaseStreams]

  // Dedupe by URL to prevent the same /playback/debrid token from appearing twice.
  const seen = new Set()
  const deduped = []
  const routedStreams = sportsContext ? filterSportsStreams(finalStreams) : finalStreams
  for (const s of routedStreams) {
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
  _isSportsContext: isSportsContext,
  _filterSportsStreams: filterSportsStreams,
  _shouldKeepSportsStream: shouldKeepSportsStream,
  _resolveEnabledCacheSources: resolveEnabledCacheSources,
  _prioritizeProviderForCacheSource: prioritizeProviderForCacheSource
}
