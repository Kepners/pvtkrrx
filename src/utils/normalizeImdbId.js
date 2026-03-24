/**
 * Shared IMDB ID normalizer.
 * Accepts "tt1234567", "tt1234567" (short), or bare digit strings.
 * Returns canonical "tt" + zero-padded-to-7 format, or '' if invalid.
 */
function normalizeImdbId(value) {
  const raw = String(value ?? '').trim()
  if (!raw || raw === '0') return ''

  const canonical = (digits) => `tt${String(digits).padStart(7, '0')}`
  if (/^tt\d{5,10}$/i.test(raw)) return canonical(raw.replace(/^tt/i, ''))
  if (/^\d{5,10}$/.test(raw)) return canonical(raw)
  return ''
}

module.exports = { normalizeImdbId }
