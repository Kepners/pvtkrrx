const SPORTS_ONLY_INDEXERS = new Set([
  'sportscult',
  'beyondhd-sports',
  'tvvault-sports'
])

function normalizeSportsIndexerName(indexerName) {
  return String(indexerName || '').trim().toLowerCase()
}

function isSportsCultIndexer(indexerName) {
  const normalized = normalizeSportsIndexerName(indexerName)
  if (!normalized) return false
  return normalized.includes('sportscult')
}

function isSportsOnlyIndexer(indexerName) {
  const normalized = normalizeSportsIndexerName(indexerName)
  if (SPORTS_ONLY_INDEXERS.has(normalized)) return true
  return isSportsCultIndexer(normalized)
}

module.exports = {
  SPORTS_ONLY_INDEXERS,
  normalizeSportsIndexerName,
  isSportsCultIndexer,
  isSportsOnlyIndexer
}
