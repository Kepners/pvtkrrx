const ADULT_CATEGORY_MIN = 6000
const ADULT_CATEGORY_MAX = 6999

const ADULT_TITLE_PATTERNS = [
  /\bxxx\b/i,
  /\badult\b/i,
  /\bporn(?:o|ography)?\b/i,
  /\bonlyfans\b/i,
  /\bof\s*leak/i,
  /\bnubiles?\b/i,
  /\bloli\b/i,
  /\bvr\s*(?:porn|bangers|conk|hush|smash)/i,
  /\bbrazzers\b/i,
  /\bbangbros\b/i,
  /\bvixen\b/i,
  /\btushy\b/i,
  /\bteamskeet\b/i,
  /\bblacked\b/i,
  /\bdigital\s*playground\b/i,
  /\bprivate\s*society\b/i,
  /\bwet\s+pussy\b/i,
  /\bpussy\b/i,
  /\bblowjob\b/i,
  /\banal\b/i,
  /\bhandjob\b/i,
  /\bgangbang\b/i,
  /\bmasturb/i,
  /\bcumshot\b/i,
  /\bcreampie\b/i,
  /\bbukkake\b/i,
  /\bmilf\b/i,
  /\bhentai\b/i,
  /\bjav\b/i,
  /\bcamgirl\b/i,
  /\bsex\s*tape\b/i,
  /\bnude(?:s)?\b/i,
  /\berotic\b/i
]

function normalizeText(value) {
  return String(value || '')
    .replace(/[_./+()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAdultCategoryId(value) {
  const numeric = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(numeric) && numeric >= ADULT_CATEGORY_MIN && numeric <= ADULT_CATEGORY_MAX
}

function hasAdultText(value) {
  const text = normalizeText(value)
  if (!text) return false
  return ADULT_TITLE_PATTERNS.some(pattern => pattern.test(text))
}

function isAdultContentResult(item = {}) {
  const categoryIds = Array.isArray(item.categoryIds) ? item.categoryIds : [item.category]
  if (categoryIds.some(hasAdultCategoryId)) return true

  const categoryText = [
    item.indexerCategoryName,
    ...(Array.isArray(item.categoryNames) ? item.categoryNames : [])
  ].filter(Boolean).join(' ')
  if (hasAdultText(categoryText)) return true

  return hasAdultText([
    item.title,
    item.indexer
  ].filter(Boolean).join(' '))
}

module.exports = {
  ADULT_CATEGORY_MIN,
  ADULT_CATEGORY_MAX,
  hasAdultText,
  isAdultContentResult
}
