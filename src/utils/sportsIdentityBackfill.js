const { SportsMetaClient } = require('../clients/sportsmeta')
const {
  SPORTS_META_RESOLUTION_STATUS,
  resolveSportsMetaIdentity
} = require('./sportsIdentityResolution')

const BACKFILL_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL || 'true').trim())
const BACKFILL_CACHE_TTL_MS = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_CACHE_MS || String(6 * 60 * 60 * 1000), 10)
)
const BACKFILL_NEGATIVE_CACHE_TTL_MS = Math.max(
  60 * 1000,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_NEGATIVE_CACHE_MS || String(15 * 60 * 1000), 10)
)
const BACKFILL_MAX_CACHE_ENTRIES = Math.max(
  100,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_CACHE_MAX || '3000', 10)
)
const BACKFILL_MAX_QUEUE_ENTRIES = Math.max(
  50,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_QUEUE_MAX || '500', 10)
)
const BACKFILL_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_CONCURRENCY || '2', 10)
)
const BACKFILL_START_DELAY_MS = Math.max(
  0,
  parseInt(process.env.PVTKRRX_SPORTS_IDENTITY_BACKFILL_DELAY_MS || '250', 10)
)

const cache = new Map()
const queue = []
const queuedKeys = new Set()
let activeWorkers = 0
let timer = null

function normalizeKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSportsIdentityBackfillKey(group = {}) {
  const availability = group?.bestAvailability || group?.availability || group
  const tracker = availability?.trackerSource || availability || {}
  const parts = [
    group?.availabilityKey,
    tracker.title || availability.title,
    tracker.pubDate || availability.pubDate || availability.publishDate,
    availability.sportHint,
    availability.mappedLeague,
    availability.parsedSportsEvent?.league,
    availability.parsedSportsEvent?.date,
    availability.parsedSportsEvent?.homeTeam,
    availability.parsedSportsEvent?.awayTeam,
    availability.parsedEvent?.league,
    availability.parsedEvent?.date,
    availability.parsedEvent?.eventName
  ].map(normalizeKeyPart).filter(Boolean)

  return parts.length > 0 ? parts.join('|') : ''
}

function isResolvedResolution(resolution = {}) {
  return String(resolution?.status || '') === SPORTS_META_RESOLUTION_STATUS.RESOLVED &&
    Boolean(String(resolution?.canonicalId || '').trim())
}

function shouldBackfillResolution(resolution = {}) {
  const status = String(resolution?.status || '').trim()
  if (!status || status === SPORTS_META_RESOLUTION_STATUS.RESOLVED) return false
  const reason = String(resolution?.reason || '').trim()
  return (
    reason === 'identity_budget_exhausted' ||
    reason === 'identity_resolve_failed' ||
    reason === 'deferred_beyond_identity_window' ||
    reason === 'no_structured_identity' ||
    status === SPORTS_META_RESOLUTION_STATUS.FALLBACK_ONLY
  )
}

function pruneBackfillCache(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (!entry || entry.expiresAt <= now) cache.delete(key)
  }

  while (cache.size > BACKFILL_MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) break
    cache.delete(oldestKey)
  }
}

function getCachedSportsIdentityBackfill(group = {}) {
  const key = buildSportsIdentityBackfillKey(group)
  if (!key) return null

  const now = Date.now()
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    cache.delete(key)
    return null
  }

  entry.touchedAt = now
  return entry.resolution ? { ...entry.resolution } : null
}

function setCachedSportsIdentityBackfill(group = {}, resolution = {}) {
  const key = buildSportsIdentityBackfillKey(group)
  if (!key || !resolution || typeof resolution !== 'object') return ''

  const now = Date.now()
  const ttl = isResolvedResolution(resolution)
    ? BACKFILL_CACHE_TTL_MS
    : BACKFILL_NEGATIVE_CACHE_TTL_MS
  cache.set(key, {
    resolution: { ...resolution },
    expiresAt: now + ttl,
    touchedAt: now
  })
  pruneBackfillCache(now)
  return key
}

function scheduleQueueDrain() {
  if (timer || !BACKFILL_ENABLED) return
  timer = setTimeout(() => {
    timer = null
    drainQueue()
  }, BACKFILL_START_DELAY_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

function queueSportsIdentityBackfill({ group, config = {}, reason = '' } = {}) {
  if (!BACKFILL_ENABLED) return false
  if (!group?.bestAvailability) return false
  const resolution = group?.sportsMetaResolution || {}
  if (!shouldBackfillResolution(resolution)) return false

  const key = buildSportsIdentityBackfillKey(group)
  if (!key || queuedKeys.has(key)) return false
  if (getCachedSportsIdentityBackfill(group)) return false
  if (queue.length >= BACKFILL_MAX_QUEUE_ENTRIES) return false

  queue.push({
    key,
    group,
    sportsmetaBaseUrl: String(config?.sportsmetaBaseUrl || '').trim(),
    reason: String(reason || resolution?.reason || '').trim(),
    queuedAt: Date.now()
  })
  queuedKeys.add(key)
  scheduleQueueDrain()
  return true
}

function queueSportsIdentityBackfills({ groups = [], config = {}, reason = '' } = {}) {
  let queued = 0
  for (const group of (Array.isArray(groups) ? groups : [])) {
    if (queueSportsIdentityBackfill({ group, config, reason })) queued += 1
  }
  return queued
}

function drainQueue() {
  if (!BACKFILL_ENABLED) return
  while (activeWorkers < BACKFILL_CONCURRENCY && queue.length > 0) {
    const entry = queue.shift()
    if (!entry) break
    activeWorkers += 1
    processEntry(entry)
      .catch((error) => {
        console.warn(`[sports-backfill] ${entry.key}: ${error.message}`)
      })
      .finally(() => {
        activeWorkers -= 1
        if (queue.length > 0) scheduleQueueDrain()
      })
  }
}

async function processEntry(entry) {
  queuedKeys.delete(entry.key)
  const cached = getCachedSportsIdentityBackfill(entry.group)
  if (cached) return cached

  const client = new SportsMetaClient({
    baseUrl: entry.sportsmetaBaseUrl
  })
  const resolution = await resolveSportsMetaIdentity(client, entry.group.bestAvailability, {
    fastFail: false
  })
  setCachedSportsIdentityBackfill(entry.group, resolution)

  if (isResolvedResolution(resolution)) {
    console.log(`[sports-backfill] resolved title="${entry.group.bestAvailability?.title || ''}" canonical="${resolution.canonicalId}" reason="${entry.reason || ''}"`)
  }
  return resolution
}

function clearSportsIdentityBackfillState() {
  cache.clear()
  queue.length = 0
  queuedKeys.clear()
  activeWorkers = 0
  if (timer) clearTimeout(timer)
  timer = null
}

function getSportsIdentityBackfillStats() {
  return {
    enabled: BACKFILL_ENABLED,
    cacheEntries: cache.size,
    queueEntries: queue.length,
    queuedKeys: queuedKeys.size,
    activeWorkers
  }
}

function isSportsIdentityBackfillIdle() {
  return queue.length === 0 && queuedKeys.size === 0 && activeWorkers === 0 && !timer
}

function waitForSportsIdentityBackfillIdle(options = {}) {
  const timeoutMs = Math.max(0, Number(options?.timeoutMs || 0) || 0)
  const pollMs = Math.max(50, Number(options?.pollMs || 250) || 250)
  if (!BACKFILL_ENABLED || isSportsIdentityBackfillIdle() || timeoutMs === 0) {
    return Promise.resolve(getSportsIdentityBackfillStats())
  }

  scheduleQueueDrain()
  return new Promise((resolve) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      clearInterval(interval)
      clearTimeout(timeout)
      resolve(getSportsIdentityBackfillStats())
    }

    const interval = setInterval(() => {
      if (queue.length > 0 && activeWorkers === 0 && !timer) drainQueue()
      if (isSportsIdentityBackfillIdle()) finish()
    }, pollMs)
    const timeout = setTimeout(finish, timeoutMs)
    if (typeof interval.unref === 'function') interval.unref()
    if (typeof timeout.unref === 'function') timeout.unref()
  })
}

module.exports = {
  buildSportsIdentityBackfillKey,
  clearSportsIdentityBackfillState,
  getCachedSportsIdentityBackfill,
  getSportsIdentityBackfillStats,
  waitForSportsIdentityBackfillIdle,
  queueSportsIdentityBackfill,
  queueSportsIdentityBackfills,
  setCachedSportsIdentityBackfill
}
