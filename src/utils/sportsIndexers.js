const SPORTS_ONLY_INDEXERS = new Set([
  'sportscult',
  'beyondhd-sports',
  'tvvault-sports'
])

function isSportsOnlyIndexer(indexerName) {
  const normalized = String(indexerName || '').trim().toLowerCase()
  if (SPORTS_ONLY_INDEXERS.has(normalized)) return true
  return normalized.includes('sportscult')
}

module.exports = {
  SPORTS_ONLY_INDEXERS,
  isSportsOnlyIndexer
}
