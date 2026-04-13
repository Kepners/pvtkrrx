const crypto = require('crypto')

const SPORTS_AVAILABILITY_TTL_MS = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.PVTKRRX_SPORTS_AVAILABILITY_TTL_MS || String(6 * 60 * 60 * 1000), 10)
)
const SPORTS_AVAILABILITY_MAX_ENTRIES = Math.max(
  200,
  parseInt(process.env.PVTKRRX_SPORTS_AVAILABILITY_MAX_ENTRIES || '4000', 10)
)

const sportsAvailabilityStore = new Map()
const sportsCanonicalAnchorStore = new Map()

function normalizeSportsAvailabilitySource(source = {}) {
  return {
    title: String(source?.title || '').trim(),
    link: String(source?.link || '').trim(),
    infohash: String(source?.infohash || '').trim().toLowerCase(),
    size: Math.max(0, Number(source?.size || 0)),
    seeders: Math.max(0, Number(source?.seeders || 0)),
    indexer: String(source?.indexer || '').trim(),
    pubDate: String(source?.pubDate || source?.publishDate || '').trim(),
    sportHint: String(source?.sportHint || '').trim()
  }
}

function pruneExpiredSportsAvailabilityEntries(now = Date.now()) {
  for (const [key, entry] of sportsAvailabilityStore.entries()) {
    if (!entry || entry.expiresAt <= now) {
      sportsAvailabilityStore.delete(key)
    }
  }

  for (const [canonicalId, entry] of sportsCanonicalAnchorStore.entries()) {
    if (!entry || entry.expiresAt <= now) {
      sportsCanonicalAnchorStore.delete(canonicalId)
    }
  }
}

function trimSportsAvailabilityEntries(now = Date.now()) {
  pruneExpiredSportsAvailabilityEntries(now)
  if (sportsAvailabilityStore.size <= SPORTS_AVAILABILITY_MAX_ENTRIES) return

  const entries = [...sportsAvailabilityStore.entries()]
    .sort((a, b) => Number(a?.[1]?.touchedAt || 0) - Number(b?.[1]?.touchedAt || 0))

  while (sportsAvailabilityStore.size > SPORTS_AVAILABILITY_MAX_ENTRIES && entries.length > 0) {
    const [oldestKey] = entries.shift()
    if (!oldestKey) continue
    sportsAvailabilityStore.delete(oldestKey)
  }
}

function buildSportsAvailabilityAnchorKey(source = {}) {
  const normalized = normalizeSportsAvailabilitySource(source)
  const payload = JSON.stringify({
    title: normalized.title,
    link: normalized.link,
    infohash: normalized.infohash,
    size: normalized.size,
    indexer: normalized.indexer,
    pubDate: normalized.pubDate
  })
  return crypto.createHash('sha256').update(payload).digest('base64url').slice(0, 24)
}

function setSportsAvailabilityAnchor(source = {}) {
  const normalized = normalizeSportsAvailabilitySource(source)
  const hasAnchor = Boolean(normalized.link || normalized.infohash || normalized.title)
  if (!hasAnchor) return ''

  const now = Date.now()
  const key = buildSportsAvailabilityAnchorKey(normalized)
  sportsAvailabilityStore.set(key, {
    source: normalized,
    expiresAt: now + SPORTS_AVAILABILITY_TTL_MS,
    touchedAt: now
  })
  trimSportsAvailabilityEntries(now)
  return key
}

function getSportsAvailabilityAnchor(anchorKey) {
  const key = String(anchorKey || '').trim()
  if (!key) return null

  const now = Date.now()
  const entry = sportsAvailabilityStore.get(key)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    sportsAvailabilityStore.delete(key)
    return null
  }

  entry.touchedAt = now
  return {
    ...entry.source
  }
}

function setSportsAvailabilityCanonicalAnchor(canonicalId, anchorKey) {
  const normalizedCanonicalId = String(canonicalId || '').trim()
  const normalizedAnchorKey = String(anchorKey || '').trim()
  if (!normalizedCanonicalId || !normalizedAnchorKey) return ''

  const now = Date.now()
  const sourceEntry = sportsAvailabilityStore.get(normalizedAnchorKey)
  if (!sourceEntry || sourceEntry.expiresAt <= now) {
    sportsCanonicalAnchorStore.delete(normalizedCanonicalId)
    return ''
  }

  sportsCanonicalAnchorStore.set(normalizedCanonicalId, {
    anchorKey: normalizedAnchorKey,
    expiresAt: sourceEntry.expiresAt,
    touchedAt: now
  })
  trimSportsAvailabilityEntries(now)
  return normalizedAnchorKey
}

function getSportsAvailabilityAnchorByCanonical(canonicalId) {
  const normalizedCanonicalId = String(canonicalId || '').trim()
  if (!normalizedCanonicalId) return null

  const now = Date.now()
  const entry = sportsCanonicalAnchorStore.get(normalizedCanonicalId)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    sportsCanonicalAnchorStore.delete(normalizedCanonicalId)
    return null
  }

  const source = getSportsAvailabilityAnchor(entry.anchorKey)
  if (!source) {
    sportsCanonicalAnchorStore.delete(normalizedCanonicalId)
    return null
  }

  entry.touchedAt = now
  return {
    anchorKey: String(entry.anchorKey || '').trim(),
    source
  }
}

function clearSportsAvailabilityAnchors() {
  sportsAvailabilityStore.clear()
  sportsCanonicalAnchorStore.clear()
}

module.exports = {
  buildSportsAvailabilityAnchorKey,
  clearSportsAvailabilityAnchors,
  getSportsAvailabilityAnchor,
  getSportsAvailabilityAnchorByCanonical,
  normalizeSportsAvailabilitySource,
  setSportsAvailabilityAnchor,
  setSportsAvailabilityCanonicalAnchor
}
