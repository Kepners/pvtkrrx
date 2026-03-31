const BRAND_ARTWORK = 'https://raw.githubusercontent.com/Kepners/pvtkrrx/main/public/logo.svg'

function normalizeMetaType(type) {
  const value = String(type || '').trim()
  return value || 'movie'
}

function buildMetaPlaceholder(options = {}) {
  const id = String(options.id || 'pvtkrrx:unavailable').trim() || 'pvtkrrx:unavailable'
  const type = normalizeMetaType(options.type)
  const name = String(options.name || 'Item unavailable').trim() || 'Item unavailable'
  const description = String(
    options.description || 'PVTKRRX could not load metadata for this item right now.'
  ).trim() || 'PVTKRRX could not load metadata for this item right now.'
  const poster = String(options.poster || '').trim() || BRAND_ARTWORK
  const background = String(options.background || '').trim() || poster
  const logo = String(options.logo || '').trim() || BRAND_ARTWORK

  return {
    id,
    type,
    name,
    description,
    poster,
    background,
    logo
  }
}

module.exports = {
  BRAND_ARTWORK,
  buildMetaPlaceholder
}
