const { normalizeSportsEventMetadata, parseSportsMetaCanonicalId } = require('./sportsEventNormalizer')

const DIMENSIONS = {
  poster: { width: 600, height: 900 },
  background: { width: 1920, height: 1080 },
  landscape: { width: 1280, height: 720 },
  logo: { width: 512, height: 512 }
}

const PALETTES = {
  Football: ['#102a43', '#2f855a', '#f6e05e'],
  Baseball: ['#13293d', '#d72638', '#f8f7f2'],
  Hockey: ['#101820', '#2b6cb0', '#edf2f7'],
  Motorsport: ['#171717', '#e53e3e', '#f6ad55'],
  Basketball: ['#1a202c', '#dd6b20', '#fbd38d'],
  MMA: ['#111827', '#b83280', '#e5e7eb'],
  Sports: ['#101828', '#407076', '#ffd8be']
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function getDimensions(variant = 'poster') {
  return DIMENSIONS[variant] || DIMENSIONS.poster
}

function truncateToFit(text, maxChars) {
  const clean = normalizeSpace(text)
  if (clean.length <= maxChars) return clean
  if (maxChars <= 3) return clean.slice(0, maxChars)
  return `${clean.slice(0, maxChars - 3).trimEnd()}...`
}

function maxCharsForWidth(maxWidth, fontSize) {
  return Math.max(4, Math.floor(maxWidth / (fontSize * 0.6)))
}

function wrapText(text, maxWidth, fontSize, maxLines) {
  const clean = normalizeSpace(text)
  if (!clean) return []
  const maxChars = maxCharsForWidth(maxWidth, fontSize)
  const words = clean.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  let overflow = false

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) {
      lines.push(current)
      if (lines.length >= maxLines) {
        overflow = true
        current = ''
        break
      }
    }
    current = word.length > maxChars ? truncateToFit(word, maxChars) : word
  }
  if (lines.length < maxLines && current) {
    lines.push(current)
  } else if (current) {
    overflow = true
  }

  if (lines.length > maxLines) lines.length = maxLines
  const consumed = lines.join(' ').replace(/\.\.\.$/, '').length
  if ((overflow || consumed < clean.length) && lines.length === maxLines) {
    const last = lines[maxLines - 1] || ''
    lines[maxLines - 1] = last.endsWith('...')
      ? last
      : truncateToFit(`${last} ...`, maxChars)
  }
  return lines.map((line) => truncateToFit(line, maxChars))
}

function buildFooter(normalized = {}) {
  const parts = []
  if (normalized.date) parts.push(normalized.date)
  if (Number(normalized.seeders) > 0) parts.push(`${Number(normalized.seeders)} seeders`)
  if (normalized.size) parts.push(normalized.size)
  return parts.join(' | ')
}

function layoutSportsCard(input = {}, variant = 'poster') {
  const normalized = normalizeSportsEventMetadata(input)
  const dimensions = getDimensions(variant)
  const isPoster = variant === 'poster'
  const isLogo = variant === 'logo'
  const safe = isPoster ? 52 : isLogo ? 40 : 96
  const maxWidth = dimensions.width - safe * 2
  const footer = buildFooter(normalized)
  const scale = isPoster ? 1 : isLogo ? 0.64 : 1.45
  const sportSize = Math.round((isPoster ? 42 : 46) * scale)
  const competitionSize = Math.round((isPoster ? 32 : 36) * scale)
  const titleSize = Math.round((isPoster ? 44 : 54) * scale)
  const detailSize = Math.round((isPoster ? 30 : 32) * scale)
  const footerSize = Math.round((isPoster ? 24 : 28) * scale)

  if (isLogo) {
    return {
      normalized,
      dimensions,
      safe,
      lines: [
        { role: 'sport', text: wrapText(normalized.sport, maxWidth, sportSize, 1)[0] || 'Sports', x: safe, y: 176, fontSize: sportSize, weight: 800 },
        { role: 'competition', text: wrapText(normalized.competition, maxWidth, competitionSize, 1)[0] || '', x: safe, y: 248, fontSize: competitionSize, weight: 700 },
        { role: 'eventTitle', text: wrapText(normalized.eventTitle, maxWidth, titleSize, 1)[0] || '', x: safe, y: 338, fontSize: titleSize, weight: 800 }
      ].filter((line) => line.text)
    }
  }

  const titleLines = wrapText(normalized.eventTitle, maxWidth, titleSize, 2)
  const lines = [
    { role: 'sport', text: wrapText(normalized.sport, maxWidth, sportSize, 1)[0] || 'Sports', x: safe, y: isPoster ? 94 : 146, fontSize: sportSize, weight: 800 },
    { role: 'competition', text: wrapText(normalized.competition, maxWidth, competitionSize, 1)[0] || '', x: safe, y: isPoster ? 154 : 230, fontSize: competitionSize, weight: 700 },
    ...titleLines.map((text, index) => ({
      role: 'eventTitle',
      text,
      x: safe,
      y: (isPoster ? 314 : 486) + index * Math.round(titleSize * 1.24),
      fontSize: titleSize,
      weight: 850
    })),
    { role: 'eventDetail', text: wrapText(normalized.eventDetail || '', maxWidth, detailSize, 1)[0] || '', x: safe, y: isPoster ? 510 : 760, fontSize: detailSize, weight: 650 },
    { role: 'footer', text: wrapText(footer, maxWidth, footerSize, 1)[0] || '', x: safe, y: dimensions.height - safe - 18, fontSize: footerSize, weight: 600 }
  ].filter((line) => line.text)

  return { normalized, dimensions, safe, lines }
}

function paletteForSport(sport = '') {
  return PALETTES[sport] || PALETTES.Sports
}

function renderSportsCardSvg(input = {}, variant = 'poster') {
  const layout = layoutSportsCard(input, variant)
  const { width, height } = layout.dimensions
  const [base, accent, text] = paletteForSport(layout.normalized.sport)
  const markerSize = Math.max(8, Math.round(width * 0.018))
  const textNodes = layout.lines.map((line) => {
    const fill = line.role === 'sport' || line.role === 'footer' ? '#ffffff' : text
    return `<text data-role="${line.role}" x="${line.x}" y="${line.y}" font-family="Arial, Helvetica, sans-serif" font-size="${line.fontSize}" font-weight="${line.weight}" letter-spacing="0" fill="${fill}">${escapeXml(line.text)}</text>`
  }).join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(layout.normalized.eventTitle)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="0.58" stop-color="#151827"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="url(#bg)"/>
  <rect x="${layout.safe}" y="${layout.safe}" width="${width - layout.safe * 2}" height="${height - layout.safe * 2}" rx="0" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="${Math.max(2, Math.round(width * 0.005))}"/>
  <circle cx="${width - layout.safe - markerSize}" cy="${layout.safe + markerSize}" r="${markerSize}" fill="${accent}"/>
  ${textNodes}
</svg>`
}

function renderSportsArtworkSvg(input = {}, variant = 'poster') {
  return renderSportsCardSvg(input, variant)
}

function buildArtworkInputFromRequest({ canonicalId = '', sport = '', league = '', title = '', date = '', seeders = '', size = '', rawTitle = '', source = 'fallback' } = {}) {
  const parsed = parseSportsMetaCanonicalId(canonicalId)
  return normalizeSportsEventMetadata({
    canonicalId,
    sportHint: sport || parsed?.sportKey || '',
    sport: sport || parsed?.sport || '',
    competition: league || parsed?.competition || '',
    eventTitle: title || parsed?.eventTitle || '',
    date: date || parsed?.date || '',
    seeders: Number(seeders || 0) || undefined,
    size,
    rawTitle: rawTitle || title || canonicalId,
    source
  })
}

module.exports = {
  DIMENSIONS,
  buildArtworkInputFromRequest,
  layoutSportsCard,
  renderSportsArtworkSvg,
  wrapText
}
