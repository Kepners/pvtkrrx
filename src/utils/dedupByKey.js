/**
 * Generic deduplication utility.
 * Returns unique items based on a key function, keeping the first occurrence.
 *
 * @param {Array} items - Array of items to deduplicate
 * @param {Function} keyFn - Function that returns a string key for each item
 * @returns {Array} Deduplicated array preserving first-seen order
 */
function dedupByKey(items, keyFn) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

module.exports = { dedupByKey }
