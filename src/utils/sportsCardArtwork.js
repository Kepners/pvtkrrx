const { normalizeSportsEventMetadata, parseSportsMetaCanonicalId } = require('./sportsEventNormalizer')

const DIMENSIONS = {
  poster: { width: 600, height: 900 },
  background: { width: 1920, height: 1080 },
  landscape: { width: 1280, height: 720 },
  logo: { width: 512, height: 512 }
}

const PALETTES = {
  'American Football': ['#163025', '#2f855a', '#f8fafc', '#fbbf24'],
  Baseball: ['#102033', '#e2e8f0', '#f8fafc', '#dc2626'],
  Basketball: ['#22130f', '#f97316', '#f8fafc', '#fde68a'],
  Boxing: ['#171717', '#b91c1c', '#f8fafc', '#fca5a5'],
  Cricket: ['#10251d', '#16a34a', '#f8fafc', '#fde68a'],
  Cycling: ['#101828', '#0ea5e9', '#f8fafc', '#facc15'],
  Darts: ['#111827', '#16a34a', '#f8fafc', '#ef4444'],
  Football: ['#102a43', '#15803d', '#f8fafc', '#f6e05e'],
  Golf: ['#10251d', '#22c55e', '#f8fafc', '#facc15'],
  Hockey: ['#101820', '#2b6cb0', '#f8fafc', '#93c5fd'],
  MMA: ['#111827', '#b83280', '#f8fafc', '#f9a8d4'],
  Motorsport: ['#171717', '#e53e3e', '#f8fafc', '#f6ad55'],
  Rugby: ['#14251f', '#ca8a04', '#f8fafc', '#fde68a'],
  Snooker: ['#09251d', '#16a34a', '#f8fafc', '#f43f5e'],
  Tennis: ['#10251d', '#65a30d', '#f8fafc', '#fef08a'],
  Wrestling: ['#111827', '#0f766e', '#f8fafc', '#67e8f9'],
  Sports: ['#101828', '#407076', '#f8fafc', '#ffd8be']
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

function estimatedTextWidth(text = '', fontSize = 24) {
  return normalizeSpace(text).length * fontSize * 0.58
}

function renderTextLine(line, maxWidth = 0) {
  const fill = line.fill || '#ffffff'
  const attrs = [
    `data-role="${escapeXml(line.role || '')}"`,
    `x="${line.x}"`,
    `y="${line.y}"`,
    `font-family="Arial, Helvetica, sans-serif"`,
    `font-size="${line.fontSize}"`,
    `font-weight="${line.weight}"`,
    'letter-spacing="0"',
    `fill="${fill}"`
  ]
  if (line.anchor) attrs.push(`text-anchor="${line.anchor}"`)
  if (line.stroke) {
    attrs.push(`stroke="${line.stroke}"`)
    attrs.push(`stroke-width="${line.strokeWidth || 4}"`)
    attrs.push('paint-order="stroke"')
    attrs.push('stroke-linejoin="round"')
  }
  if (maxWidth > 0 && estimatedTextWidth(line.text, line.fontSize) > maxWidth) {
    attrs.push(`textLength="${Math.max(24, Math.round(maxWidth))}"`)
    attrs.push('lengthAdjust="spacingAndGlyphs"')
  }
  return `<text ${attrs.join(' ')}>${escapeXml(line.text)}</text>`
}

function hashString(value = '') {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function initialsFor(value = '') {
  const stop = new Set(['the', 'of', 'fc', 'cf', 'sc', 'club', 'team'])
  const words = normalizeSpace(value)
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word && !stop.has(word.toLowerCase()))
  if (words.length === 0) return 'VS'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((word) => word.charAt(0).toUpperCase()).join('')
}

function splitMatchup(title = '') {
  const match = normalizeSpace(title).match(/^(.+?)\s+(?:vs\.?|v|@)\s+(.+)$/i)
  if (!match) return null
  const left = normalizeSpace(match[1])
  const right = normalizeSpace(match[2])
  if (!left || !right) return null
  return { left, right }
}

const COMPETITION_MARK_RULES = [
  { pattern: /\bformula\s*1\b|\bf1\b/i, label: 'F1' },
  { pattern: /\bformula\s*e\b/i, label: 'FE' },
  { pattern: /\bmotogp\b|\bmoto\s*gp\b/i, label: 'MotoGP' },
  { pattern: /\bwrc\b|world\s+rally/i, label: 'WRC' },
  { pattern: /\bnascar\b/i, label: 'NASCAR' },
  { pattern: /\bindy\s*car\b|\bindycar\b/i, label: 'INDYCAR' },
  { pattern: /\bnba\s+playoffs?\b/i, label: 'NBA PLAYOFFS' },
  { pattern: /\bnba\b/i, label: 'NBA' },
  { pattern: /\bmlb\b|major\s+league\s+baseball/i, label: 'MLB' },
  { pattern: /\bnhl\b/i, label: 'NHL' },
  { pattern: /\bnfl\b/i, label: 'NFL' },
  { pattern: /\bfa\s+cup\b/i, label: 'FA CUP' },
  { pattern: /\bmls\b|major\s+league\s+soccer/i, label: 'MLS' },
  { pattern: /\bipl\b|indian\s+premier\s+league/i, label: 'IPL' },
  { pattern: /\bpga\s+tour\b/i, label: 'PGA TOUR' },
  { pattern: /\bpga\b/i, label: 'PGA' },
  { pattern: /\bufc\b/i, label: 'UFC' },
  { pattern: /\bwwe\b/i, label: 'WWE' },
  { pattern: /\baew\b/i, label: 'AEW' },
  { pattern: /\bafl\b/i, label: 'AFL' },
  { pattern: /\bwimbledon\b/i, label: 'WIMBLEDON' },
  { pattern: /\bpremier\s+league\b/i, label: 'PREMIER LEAGUE' },
  { pattern: /\bchampions\s+league\b/i, label: 'CHAMPIONS LEAGUE' },
  { pattern: /\beuropa\s+league\b/i, label: 'EUROPA LEAGUE' },
  { pattern: /\bserie\s+a\b/i, label: 'SERIE A' },
  { pattern: /\bbundesliga\b/i, label: 'BUNDESLIGA' },
  { pattern: /\bla\s+liga\b/i, label: 'LA LIGA' }
]

function colorFromText(text = '', fallback = '#1f6f50') {
  const colors = ['#0f766e', '#1d4ed8', '#b91c1c', '#7c2d12', '#4338ca', '#047857', '#be123c', '#0369a1']
  return colors[hashString(text) % colors.length] || fallback
}

function isGenericCompetition(value = '', sport = '') {
  const clean = normalizeSpace(value).toLowerCase()
  const sportClean = normalizeSpace(sport).toLowerCase()
  if (!clean) return true
  return clean === sportClean || clean === 'sports' || clean === 'sport'
}

function resolveCompetitionMark({ sport = '', competition = '', title = '', detail = '' } = {}) {
  const haystack = normalizeSpace([competition, title, detail, sport].filter(Boolean).join(' '))
  for (const rule of COMPETITION_MARK_RULES) {
    if (rule.pattern.test(haystack)) return rule.label
  }

  const preferred = !isGenericCompetition(competition, sport)
    ? competition
    : sport || title || 'Sports'
  const clean = normalizeSpace(preferred)
  if (!clean) return 'SPORTS'
  if (clean.length <= 14) return clean.toUpperCase()
  return initialsFor(clean)
}

function renderPosterMarkLines({ mark, cx, y, width, isPoster, fill = '#ffffff' }) {
  const lines = wrapText(mark, width, isPoster ? 62 : 92, isPoster ? 2 : 1)
  const fontSize = Math.round(isPoster ? (lines.length > 1 ? 58 : 74) : 86)
  const lineHeight = Math.round(fontSize * 1.02)
  return lines.map((line, index) => renderTextLine({
    role: 'competition-mark',
    text: line,
    x: cx,
    y: y + (index * lineHeight),
    fontSize,
    weight: 900,
    anchor: 'middle',
    fill,
    stroke: '#020617',
    strokeWidth: isPoster ? 9 : 11
  }, width)).join('\n  ')
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
  const safe = isPoster ? 36 : isLogo ? 40 : 64
  const maxWidth = dimensions.width - safe * 2
  const footer = buildFooter(normalized)
  const scale = isPoster ? 1 : isLogo ? 0.64 : 1.45
  const sportSize = Math.round((isPoster ? 28 : 34) * scale)
  const competitionSize = Math.round((isPoster ? 22 : 26) * scale)
  const titleSize = Math.round((isPoster ? 31 : 38) * scale)
  const detailSize = Math.round((isPoster ? 20 : 24) * scale)
  const footerSize = Math.round((isPoster ? 18 : 20) * scale)

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

  const competitionLines = wrapText(normalized.competition, maxWidth, competitionSize, isPoster ? 1 : 1)
  const titleLines = wrapText(normalized.eventTitle, maxWidth, titleSize, isPoster ? 4 : 3)
  const lines = [
    { role: 'sport', text: wrapText(normalized.sport, maxWidth, sportSize, 1)[0] || 'Sports', x: safe, y: isPoster ? 48 : 72, fontSize: sportSize, weight: 900 }
  ]

  const competitionStartY = isPoster ? 80 : 114
  competitionLines.forEach((text, index) => {
    lines.push({
      role: 'competition',
      text,
      x: safe,
      y: competitionStartY + index * Math.round(competitionSize * 1.18),
      fontSize: competitionSize,
      weight: 700
    })
  })

  const titleStartY = isPoster ? 650 : 350
  const titleStep = Math.round(titleSize * 1.14)
  titleLines.forEach((text, index) => {
    lines.push({
      role: 'eventTitle',
      text,
      x: safe,
      y: titleStartY + index * titleStep,
      fontSize: titleSize,
      weight: 850
    })
  })

  const footerY = dimensions.height - safe - 10
  const detailText = wrapText(normalized.eventDetail || '', maxWidth, detailSize, 1)[0] || ''
  const detailY = titleStartY + (titleLines.length * titleStep) + (isPoster ? 24 : 34)
  if (detailText && detailY < footerY - Math.round(detailSize * 1.7)) {
    lines.push({
      role: 'eventDetail',
      text: detailText,
      x: safe,
      y: detailY,
      fontSize: detailSize,
      weight: 650
    })
  }
  const footerText = wrapText(footer, maxWidth, footerSize, 1)[0] || ''
  if (footerText) {
    lines.push({ role: 'footer', text: footerText, x: safe, y: footerY, fontSize: footerSize, weight: 600 })
  }

  return { normalized, dimensions, safe, lines }
}

function paletteForSport(sport = '') {
  return PALETTES[sport] || PALETTES.Sports
}

function renderSportsCardSvg(input = {}, variant = 'poster') {
  const layout = layoutSportsCard(input, variant)
  const { width, height } = layout.dimensions
  const [base, accent, text, highlight] = paletteForSport(layout.normalized.sport)
  const markerSize = Math.max(8, Math.round(width * 0.016))
  const matchup = splitMatchup(layout.normalized.eventTitle)
  const isPoster = variant === 'poster'
  const visual = isPoster
    ? { x: 36, y: 118, width: width - 72, height: 492 }
    : { x: 64, y: 150, width: Math.round(width * 0.48), height: height - 232 }
  const titlePanel = isPoster
    ? { x: 28, y: 620, width: width - 56, height: 222 }
    : { x: Math.round(width * 0.56), y: 178, width: Math.round(width * 0.38), height: height - 266 }
  const textNodes = layout.lines.map((line) => {
    const fill = line.role === 'sport' || line.role === 'footer' ? '#ffffff' : line.role === 'competition' ? highlight : text
    return renderTextLine({ ...line, fill }, line.role === 'eventTitle' ? titlePanel.width - 44 : width - (layout.safe * 2))
  }).join('\n  ')
  const visualMarkup = matchup
    ? renderMatchupVisual({ matchup, x: visual.x, y: visual.y, width: visual.width, height: visual.height, base, accent, highlight, isPoster })
    : renderSportMotif({ sport: layout.normalized.sport, competition: layout.normalized.competition, title: layout.normalized.eventTitle, x: visual.x, y: visual.y, width: visual.width, height: visual.height, base, accent, highlight, text, isPoster })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(layout.normalized.eventTitle)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="0.52" stop-color="#111827"/>
      <stop offset="1" stop-color="${colorFromText(layout.normalized.eventTitle, accent)}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="rgba(15,23,42,0.96)"/>
      <stop offset="1" stop-color="rgba(15,23,42,0.72)"/>
    </linearGradient>
    <pattern id="diagonal" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="48" height="48" fill="transparent"/>
      <rect width="12" height="48" fill="rgba(255,255,255,0.055)"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#diagonal)" opacity="0.8"/>
  <rect x="${visual.x}" y="${visual.y}" width="${visual.width}" height="${visual.height}" rx="18" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" stroke-width="${Math.max(2, Math.round(width * 0.004))}"/>
  ${visualMarkup}
  <rect x="${titlePanel.x}" y="${titlePanel.y}" width="${titlePanel.width}" height="${titlePanel.height}" rx="14" fill="url(#panel)" stroke="rgba(255,255,255,0.14)" stroke-width="${Math.max(2, Math.round(width * 0.004))}"/>
  <circle cx="${width - layout.safe - markerSize}" cy="${layout.safe + markerSize}" r="${markerSize}" fill="${accent}"/>
  ${textNodes}
</svg>`
}

function renderMatchupVisual({ matchup, x, y, width, height, base, accent, highlight, isPoster }) {
  const leftColor = colorFromText(matchup.left, base)
  const rightColor = colorFromText(matchup.right, accent)
  const circleRadius = Math.round(Math.min(width, height) * (isPoster ? 0.19 : 0.21))
  const cy = Math.round(y + height * 0.48)
  const lx = Math.round(x + width * 0.27)
  const rx = Math.round(x + width * 0.73)
  const labelY = Math.round(y + height * 0.86)
  const fontSize = Math.round(circleRadius * 0.54)
  const teamFont = Math.round(isPoster ? 23 : 30)
  const leftLines = wrapText(matchup.left, width * 0.38, teamFont, 2)
  const rightLines = wrapText(matchup.right, width * 0.38, teamFont, 2)
  const renderTeamLines = (lines, tx) => lines.map((line, index) =>
    renderTextLine({
      role: 'visual-team',
      text: line,
      x: tx,
      y: labelY + (index * Math.round(teamFont * 1.12)),
      fontSize: teamFont,
      weight: 800,
      anchor: 'middle',
      fill: '#f8fafc',
      stroke: 'rgba(0,0,0,0.52)',
      strokeWidth: 4
    }, width * 0.36)
  ).join('\n  ')

  return `<g data-role="matchup-visual">
    <rect x="${x}" y="${y}" width="${width / 2}" height="${height}" rx="18" fill="${leftColor}" opacity="0.72"/>
    <rect x="${x + width / 2}" y="${y}" width="${width / 2}" height="${height}" rx="18" fill="${rightColor}" opacity="0.72"/>
    <rect x="${x + width / 2 - 4}" y="${y + 18}" width="8" height="${height - 36}" fill="rgba(0,0,0,0.42)"/>
    <circle cx="${lx}" cy="${cy}" r="${circleRadius}" fill="rgba(15,23,42,0.78)" stroke="rgba(255,255,255,0.82)" stroke-width="8"/>
    <circle cx="${rx}" cy="${cy}" r="${circleRadius}" fill="rgba(15,23,42,0.78)" stroke="rgba(255,255,255,0.82)" stroke-width="8"/>
    ${renderTextLine({ role: 'visual-initials', text: initialsFor(matchup.left), x: lx, y: cy + Math.round(fontSize * 0.34), fontSize, weight: 900, anchor: 'middle', fill: '#ffffff' }, circleRadius * 1.45)}
    ${renderTextLine({ role: 'visual-versus', text: 'V', x: x + width / 2, y: cy + Math.round(circleRadius * 0.18), fontSize: Math.round(circleRadius * 0.92), weight: 900, anchor: 'middle', fill: '#ffffff', stroke: '#020617', strokeWidth: 10 }, circleRadius * 0.95)}
    ${renderTextLine({ role: 'visual-initials', text: initialsFor(matchup.right), x: rx, y: cy + Math.round(fontSize * 0.34), fontSize, weight: 900, anchor: 'middle', fill: '#ffffff' }, circleRadius * 1.45)}
    ${renderTeamLines(leftLines, lx)}
    ${renderTeamLines(rightLines, rx)}
    <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="6" fill="${highlight}" opacity="0.8"/>
    <rect x="${x + 18}" y="${y + height - 24}" width="${width - 36}" height="6" fill="${highlight}" opacity="0.55"/>
  </g>`
}

function renderSportMotif({ sport, competition, title, x, y, width, height, base, accent, highlight, text, isPoster }) {
  const cx = Math.round(x + width / 2)
  const cy = Math.round(y + height * 0.45)
  const r = Math.round(Math.min(width, height) * (isPoster ? 0.25 : 0.28))
  const mark = resolveCompetitionMark({ sport, competition, title })
  const titleLines = wrapText(title, width - 82, isPoster ? 28 : 38, isPoster ? 2 : 2)
  const lowerLabel = wrapText(competition || sport, width - 64, isPoster ? 25 : 34, 2)
    .map((line, index) => renderTextLine({
      role: 'visual-competition',
      text: line,
      x: cx,
      y: Math.round(y + height * (isPoster ? 0.78 : 0.77)) + (index * (isPoster ? 30 : 40)),
      fontSize: isPoster ? 25 : 34,
      weight: 850,
      anchor: 'middle',
      fill: text,
      stroke: 'rgba(0,0,0,0.45)',
      strokeWidth: 4
    }, width - 96)).join('\n  ')

  const sportKey = normalizeSpace(sport).toLowerCase()
  const markY = Math.round(y + height * (isPoster ? 0.36 : 0.43))
  const posterMark = renderPosterMarkLines({
    mark,
    cx,
    y: markY,
    width: width - 76,
    isPoster,
    fill: '#ffffff'
  })
  const titleText = titleLines.map((line, index) => renderTextLine({
    role: 'visual-event-title',
    text: line,
    x: cx,
    y: Math.round(y + height * (isPoster ? 0.62 : 0.64)) + (index * (isPoster ? 31 : 42)),
    fontSize: isPoster ? 28 : 38,
    weight: 850,
    anchor: 'middle',
    fill: '#f8fafc',
    stroke: 'rgba(0,0,0,0.45)',
    strokeWidth: 5
  }, width - 96)).join('\n  ')

  let icon = ''
  if (/baseball/.test(sportKey)) {
    const iconY = Math.round(y + height * 0.28)
    const iconR = Math.round(r * 0.48)
    icon = `<circle cx="${cx}" cy="${iconY}" r="${iconR}" fill="#f8fafc" opacity="0.95"/>
      <path d="M ${cx - iconR * 0.38} ${iconY - iconR * 0.78} C ${cx - iconR * 0.1} ${iconY - iconR * 0.28}, ${cx - iconR * 0.1} ${iconY + iconR * 0.28}, ${cx - iconR * 0.38} ${iconY + iconR * 0.78}" fill="none" stroke="#dc2626" stroke-width="6" stroke-dasharray="9 11"/>
      <path d="M ${cx + iconR * 0.38} ${iconY - iconR * 0.78} C ${cx + iconR * 0.1} ${iconY - iconR * 0.28}, ${cx + iconR * 0.1} ${iconY + iconR * 0.28}, ${cx + iconR * 0.38} ${iconY + iconR * 0.78}" fill="none" stroke="#dc2626" stroke-width="6" stroke-dasharray="9 11"/>`
  } else if (/basketball/.test(sportKey)) {
    const iconY = Math.round(y + height * 0.28)
    const iconR = Math.round(r * 0.48)
    icon = `<circle cx="${cx}" cy="${iconY}" r="${iconR}" fill="#f97316" stroke="#111827" stroke-width="6" opacity="0.92"/>
      <path d="M ${cx - iconR} ${iconY} H ${cx + iconR} M ${cx} ${iconY - iconR} V ${iconY + iconR}" stroke="#111827" stroke-width="5"/>
      <path d="M ${cx - iconR * 0.62} ${iconY - iconR * 0.78} C ${cx - iconR * 0.2} ${iconY - iconR * 0.22}, ${cx - iconR * 0.2} ${iconY + iconR * 0.22}, ${cx - iconR * 0.62} ${iconY + iconR * 0.78} M ${cx + iconR * 0.62} ${iconY - iconR * 0.78} C ${cx + iconR * 0.2} ${iconY - iconR * 0.22}, ${cx + iconR * 0.2} ${iconY + iconR * 0.22}, ${cx + iconR * 0.62} ${iconY + iconR * 0.78}" fill="none" stroke="#111827" stroke-width="5"/>`
  } else if (/football|rugby|american/.test(sportKey)) {
    icon = `<rect x="${x + 26}" y="${y + 32}" width="${width - 52}" height="${Math.round(height * 0.3)}" rx="14" fill="rgba(22,101,52,0.48)" stroke="rgba(255,255,255,0.24)" stroke-width="4"/>
      <line x1="${cx}" y1="${y + 32}" x2="${cx}" y2="${y + 32 + Math.round(height * 0.3)}" stroke="rgba(255,255,255,0.32)" stroke-width="4"/>
      <circle cx="${cx}" cy="${y + 32 + Math.round(height * 0.15)}" r="${Math.round(height * 0.07)}" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="4"/>`
  } else if (/motor/.test(sportKey)) {
    icon = `<path d="M ${x + width * 0.14} ${y + height * 0.26} C ${x + width * 0.34} ${y + 58}, ${x + width * 0.64} ${y + height * 0.42}, ${x + width * 0.86} ${y + height * 0.2}" fill="none" stroke="${highlight}" stroke-width="16" stroke-linecap="round"/>
      <path d="M ${x + width * 0.14} ${y + height * 0.26} C ${x + width * 0.34} ${y + 58}, ${x + width * 0.64} ${y + height * 0.42}, ${x + width * 0.86} ${y + height * 0.2}" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round"/>`
  } else if (/tennis|snooker|golf|darts|hockey/.test(sportKey)) {
    icon = `<circle cx="${cx}" cy="${Math.round(y + height * 0.28)}" r="${Math.round(r * 0.48)}" fill="rgba(15,23,42,0.62)" stroke="${highlight}" stroke-width="7"/>
      <path d="M ${cx - r * 0.46} ${y + height * 0.28 + r * 0.32} H ${cx + r * 0.46}" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`
  } else {
    icon = `<circle cx="${cx}" cy="${Math.round(y + height * 0.28)}" r="${Math.round(r * 0.48)}" fill="rgba(15,23,42,0.62)" stroke="${highlight}" stroke-width="7"/>`
  }

  return `<g data-role="competition-poster-visual">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${base}" opacity="0.35"/>
    <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${height - 36}" rx="16" fill="rgba(15,23,42,0.28)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
    <path d="M ${x + 18} ${y + height * 0.78} L ${x + width - 18} ${y + height * 0.22}" stroke="rgba(255,255,255,0.16)" stroke-width="${isPoster ? 18 : 26}" stroke-linecap="round"/>
    ${icon}
    ${posterMark}
    ${titleText}
    ${lowerLabel}
  </g>`
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
