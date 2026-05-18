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
  { pattern: /\bmoto2\b|\bmoto\s*2\b/i, label: 'Moto2' },
  { pattern: /\bmoto3\b|\bmoto\s*3\b/i, label: 'Moto3' },
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

function isFormulaOneMark(mark = '', competition = '', title = '') {
  return /^f1$/i.test(normalizeSpace(mark)) ||
    /\b(?:formula\s*1|formula\s*one|f1)\b/i.test(`${competition} ${title}`)
}

function isMotoGpMark(mark = '', competition = '', title = '') {
  return /^moto(?:gp|2|3)$/i.test(normalizeSpace(mark)) ||
    /\bmoto\s*gp\b|\bmotogp\b|\bmoto\s*2\b|\bmoto2\b|\bmoto\s*3\b|\bmoto3\b/i.test(`${competition} ${title}`)
}

function resolveMotorsportBrandKind(normalized = {}) {
  const sport = normalizeSpace(normalized.sport)
  const competition = normalizeSpace(normalized.competition)
  const title = normalizeSpace(normalized.eventTitle)
  const mark = resolveCompetitionMark({ sport, competition, title, detail: normalized.eventDetail })
  if (isFormulaOneMark(mark, competition, title)) return 'f1'
  if (isMotoGpMark(mark, competition, title)) return 'motogp'
  return ''
}

function resolveSurfaceKind({ sport = '', competition = '', title = '', detail = '' } = {}) {
  const haystack = normalizeSpace([sport, competition, title, detail].filter(Boolean).join(' ')).toLowerCase()
  if (/\b(?:formula\s*1|formula\s*one|f1|motogp|moto\s*gp|moto2|moto\s*2|moto3|moto\s*3|wrc|rally|nascar|indycar|grand prix|gp)\b/i.test(haystack)) return 'circuit'
  if (/\b(?:american football|nfl|super bowl|gridiron)\b/i.test(haystack)) return 'gridiron'
  if (/\b(?:football|soccer|premier league|epl|fa cup|mls|la liga|serie a|bundesliga|champions league|europa league)\b/i.test(haystack)) return 'football-pitch'
  if (/\b(?:rugby|six nations|urc|super league|nrl)\b/i.test(haystack)) return 'rugby-pitch'
  if (/\b(?:ice hockey|hockey|nhl)\b/i.test(haystack)) return 'hockey-rink'
  if (/\b(?:basketball|nba|wnba|euroleague)\b/i.test(haystack)) return 'basketball-court'
  if (/\b(?:tennis|wimbledon|atp|wta)\b/i.test(haystack)) return 'tennis-court'
  if (/\b(?:snooker|billiards|pool)\b/i.test(haystack)) return 'snooker-table'
  if (/\b(?:boxing)\b/i.test(haystack)) return 'boxing-ring'
  if (/\b(?:mma|ufc|pfl|bellator|octagon)\b/i.test(haystack)) return 'octagon'
  if (/\b(?:wrestling|wwe|aew|nxt|raw|smackdown)\b/i.test(haystack)) return 'wrestling-ring'
  if (/\b(?:baseball|mlb|world series)\b/i.test(haystack)) return 'baseball-diamond'
  if (/\b(?:cricket|ipl|indian premier league|t20|odi|test match)\b/i.test(haystack)) return 'cricket-ground'
  if (/\b(?:golf|pga|masters|open championship|ryder cup)\b/i.test(haystack)) return 'golf-hole'
  if (/\b(?:darts|pdc)\b/i.test(haystack)) return 'dartboard'
  if (/\b(?:cycling|tour de france|giro|velodrome)\b/i.test(haystack)) return 'velodrome'
  return 'sports-field'
}

function linePath(points = []) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ')
}

function renderSportSurfaceOutline({ sport = '', competition = '', title = '', detail = '', x, y, width, height, highlight = '#ffffff', accent = '#94a3b8', text = '#f8fafc', opacity = 0.55 } = {}) {
  const kind = resolveSurfaceKind({ sport, competition, title, detail })
  const sw = Math.max(3, Math.round(Math.min(width, height) * 0.012))
  const thin = Math.max(2, Math.round(sw * 0.58))
  const line = `rgba(255,255,255,${opacity})`
  const dim = `rgba(255,255,255,${Math.max(0.12, opacity * 0.34)})`
  const glow = `rgba(255,255,255,${Math.max(0.08, opacity * 0.18)})`
  const cx = x + width / 2
  const cy = y + height / 2
  const rx = width * 0.42
  const ry = height * 0.34

  if (kind === 'football-pitch' || kind === 'rugby-pitch') {
    const boxW = width * 0.36
    const boxH = height * 0.16
    const goalW = width * 0.2
    return `<g data-role="sport-surface" data-surface="${kind}" opacity="0.95">
      <rect x="${x + width * 0.08}" y="${y + height * 0.08}" width="${width * 0.84}" height="${height * 0.84}" rx="${Math.round(width * 0.035)}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      <line x1="${cx}" y1="${y + height * 0.08}" x2="${cx}" y2="${y + height * 0.92}" stroke="${dim}" stroke-width="${thin}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.15}" fill="none" stroke="${line}" stroke-width="${thin}"/>
      <rect x="${cx - boxW / 2}" y="${y + height * 0.08}" width="${boxW}" height="${boxH}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <rect x="${cx - boxW / 2}" y="${y + height * 0.92 - boxH}" width="${boxW}" height="${boxH}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <rect x="${cx - goalW / 2}" y="${y + height * 0.08}" width="${goalW}" height="${boxH * 0.42}" fill="none" stroke="${glow}" stroke-width="${thin}"/>
      <rect x="${cx - goalW / 2}" y="${y + height * 0.92 - boxH * 0.42}" width="${goalW}" height="${boxH * 0.42}" fill="none" stroke="${glow}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'gridiron') {
    const lines = []
    for (let i = 1; i < 10; i += 1) {
      const lx = x + (width * i / 10)
      lines.push(`<line x1="${lx}" y1="${y + height * 0.1}" x2="${lx}" y2="${y + height * 0.9}" stroke="${i === 5 ? line : dim}" stroke-width="${i === 5 ? sw : thin}"/>`)
    }
    const postTop = y + height * 0.13
    const postBottom = y + height * 0.28
    return `<g data-role="sport-surface" data-surface="gridiron">
      <rect x="${x + width * 0.06}" y="${y + height * 0.1}" width="${width * 0.88}" height="${height * 0.8}" rx="${Math.round(width * 0.025)}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      ${lines.join('\n      ')}
      <path d="M ${cx - width * 0.08} ${postTop} V ${postBottom} H ${cx + width * 0.08} V ${postTop}" fill="none" stroke="${highlight}" stroke-width="${sw}" stroke-linecap="round"/>
      <path d="M ${cx - width * 0.08} ${y + height - (postTop - y)} V ${y + height - (postBottom - y)} H ${cx + width * 0.08} V ${y + height - (postTop - y)}" fill="none" stroke="${highlight}" stroke-width="${sw}" stroke-linecap="round"/>
    </g>`
  }

  if (kind === 'hockey-rink') {
    return `<g data-role="sport-surface" data-surface="hockey-rink">
      <rect x="${x + width * 0.06}" y="${y + height * 0.16}" width="${width * 0.88}" height="${height * 0.68}" rx="${Math.min(width, height) * 0.18}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      <line x1="${cx}" y1="${y + height * 0.16}" x2="${cx}" y2="${y + height * 0.84}" stroke="rgba(239,68,68,0.55)" stroke-width="${thin}"/>
      <line x1="${x + width * 0.31}" y1="${y + height * 0.16}" x2="${x + width * 0.31}" y2="${y + height * 0.84}" stroke="rgba(96,165,250,0.6)" stroke-width="${thin}"/>
      <line x1="${x + width * 0.69}" y1="${y + height * 0.16}" x2="${x + width * 0.69}" y2="${y + height * 0.84}" stroke="rgba(96,165,250,0.6)" stroke-width="${thin}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.09}" fill="none" stroke="${line}" stroke-width="${thin}"/>
      <circle cx="${x + width * 0.22}" cy="${y + height * 0.34}" r="${Math.min(width, height) * 0.065}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <circle cx="${x + width * 0.78}" cy="${y + height * 0.66}" r="${Math.min(width, height) * 0.065}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'basketball-court') {
    return `<g data-role="sport-surface" data-surface="basketball-court">
      <rect x="${x + width * 0.07}" y="${y + height * 0.12}" width="${width * 0.86}" height="${height * 0.76}" rx="${Math.round(width * 0.025)}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      <line x1="${cx}" y1="${y + height * 0.12}" x2="${cx}" y2="${y + height * 0.88}" stroke="${dim}" stroke-width="${thin}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.13}" fill="none" stroke="${line}" stroke-width="${thin}"/>
      <path d="M ${x + width * 0.07} ${y + height * 0.34} Q ${x + width * 0.28} ${cy} ${x + width * 0.07} ${y + height * 0.66}" fill="none" stroke="${line}" stroke-width="${thin}"/>
      <path d="M ${x + width * 0.93} ${y + height * 0.34} Q ${x + width * 0.72} ${cy} ${x + width * 0.93} ${y + height * 0.66}" fill="none" stroke="${line}" stroke-width="${thin}"/>
      <rect x="${x + width * 0.07}" y="${cy - height * 0.13}" width="${width * 0.18}" height="${height * 0.26}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <rect x="${x + width * 0.75}" y="${cy - height * 0.13}" width="${width * 0.18}" height="${height * 0.26}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'tennis-court') {
    return `<g data-role="sport-surface" data-surface="tennis-court">
      <rect x="${x + width * 0.08}" y="${y + height * 0.12}" width="${width * 0.84}" height="${height * 0.76}" rx="${Math.round(width * 0.018)}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      <line x1="${cx}" y1="${y + height * 0.12}" x2="${cx}" y2="${y + height * 0.88}" stroke="${highlight}" stroke-width="${sw}" stroke-dasharray="${sw * 1.8} ${sw * 1.4}"/>
      <line x1="${x + width * 0.08}" y1="${cy}" x2="${x + width * 0.92}" y2="${cy}" stroke="${dim}" stroke-width="${thin}"/>
      <line x1="${x + width * 0.28}" y1="${y + height * 0.12}" x2="${x + width * 0.28}" y2="${y + height * 0.88}" stroke="${dim}" stroke-width="${thin}"/>
      <line x1="${x + width * 0.72}" y1="${y + height * 0.12}" x2="${x + width * 0.72}" y2="${y + height * 0.88}" stroke="${dim}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'snooker-table') {
    const pocket = Math.max(10, Math.min(width, height) * 0.035)
    return `<g data-role="sport-surface" data-surface="snooker-table">
      <rect x="${x + width * 0.08}" y="${y + height * 0.14}" width="${width * 0.84}" height="${height * 0.72}" rx="${Math.round(width * 0.04)}" fill="rgba(22,101,52,0.22)" stroke="${line}" stroke-width="${sw}"/>
      <circle cx="${x + width * 0.1}" cy="${y + height * 0.16}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <circle cx="${cx}" cy="${y + height * 0.15}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <circle cx="${x + width * 0.9}" cy="${y + height * 0.16}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <circle cx="${x + width * 0.1}" cy="${y + height * 0.84}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <circle cx="${cx}" cy="${y + height * 0.85}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <circle cx="${x + width * 0.9}" cy="${y + height * 0.84}" r="${pocket}" fill="rgba(0,0,0,0.52)"/>
      <line x1="${x + width * 0.28}" y1="${y + height * 0.16}" x2="${x + width * 0.28}" y2="${y + height * 0.84}" stroke="${dim}" stroke-width="${thin}"/>
      <path d="M ${x + width * 0.28} ${cy - height * 0.18} A ${height * 0.18} ${height * 0.18} 0 0 1 ${x + width * 0.28} ${cy + height * 0.18}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'octagon') {
    const points = []
    const radius = Math.min(rx, ry) * 1.08
    for (let i = 0; i < 8; i += 1) {
      const theta = (Math.PI / 8) + (i * Math.PI / 4)
      points.push(`${(cx + Math.cos(theta) * radius).toFixed(1)},${(cy + Math.sin(theta) * radius).toFixed(1)}`)
    }
    return `<g data-role="sport-surface" data-surface="octagon">
      <polygon points="${points.join(' ')}" fill="none" stroke="${line}" stroke-width="${sw}"/>
      <polygon points="${points.join(' ')}" fill="rgba(0,0,0,0.12)" stroke="${dim}" stroke-width="${thin}" transform="translate(0 0) scale(0.72)" transform-origin="${cx} ${cy}"/>
    </g>`
  }

  if (kind === 'boxing-ring' || kind === 'wrestling-ring') {
    const ropeGap = height * 0.14
    return `<g data-role="sport-surface" data-surface="${kind}">
      <rect x="${x + width * 0.13}" y="${y + height * 0.18}" width="${width * 0.74}" height="${height * 0.64}" fill="rgba(15,23,42,0.2)" stroke="${line}" stroke-width="${sw}"/>
      <line x1="${x + width * 0.13}" y1="${cy - ropeGap}" x2="${x + width * 0.87}" y2="${cy - ropeGap}" stroke="${highlight}" stroke-width="${thin}"/>
      <line x1="${x + width * 0.13}" y1="${cy}" x2="${x + width * 0.87}" y2="${cy}" stroke="${line}" stroke-width="${thin}"/>
      <line x1="${x + width * 0.13}" y1="${cy + ropeGap}" x2="${x + width * 0.87}" y2="${cy + ropeGap}" stroke="${dim}" stroke-width="${thin}"/>
      <circle cx="${x + width * 0.13}" cy="${y + height * 0.18}" r="${sw * 1.6}" fill="${accent}"/>
      <circle cx="${x + width * 0.87}" cy="${y + height * 0.18}" r="${sw * 1.6}" fill="${accent}"/>
      <circle cx="${x + width * 0.13}" cy="${y + height * 0.82}" r="${sw * 1.6}" fill="${accent}"/>
      <circle cx="${x + width * 0.87}" cy="${y + height * 0.82}" r="${sw * 1.6}" fill="${accent}"/>
    </g>`
  }

  if (kind === 'baseball-diamond') {
    const d = Math.min(width, height) * 0.32
    const home = [cx, y + height * 0.72]
    const first = [cx + d, cy]
    const second = [cx, y + height * 0.28]
    const third = [cx - d, cy]
    return `<g data-role="sport-surface" data-surface="baseball-diamond">
      <path d="${linePath([home, first, second, third, home])}" fill="rgba(234,179,8,0.12)" stroke="${line}" stroke-width="${sw}"/>
      <path d="M ${home[0]} ${home[1]} L ${x + width * 0.14} ${y + height * 0.9} M ${home[0]} ${home[1]} L ${x + width * 0.86} ${y + height * 0.9}" stroke="${dim}" stroke-width="${thin}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.07}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <rect x="${second[0] - sw}" y="${second[1] - sw}" width="${sw * 2}" height="${sw * 2}" fill="${text}"/>
      <rect x="${first[0] - sw}" y="${first[1] - sw}" width="${sw * 2}" height="${sw * 2}" fill="${text}"/>
      <rect x="${third[0] - sw}" y="${third[1] - sw}" width="${sw * 2}" height="${sw * 2}" fill="${text}"/>
    </g>`
  }

  if (kind === 'cricket-ground') {
    return `<g data-role="sport-surface" data-surface="cricket-ground">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(22,101,52,0.18)" stroke="${line}" stroke-width="${sw}"/>
      <rect x="${cx - width * 0.07}" y="${cy - height * 0.24}" width="${width * 0.14}" height="${height * 0.48}" rx="${sw}" fill="rgba(234,179,8,0.16)" stroke="${dim}" stroke-width="${thin}"/>
      <line x1="${cx - width * 0.09}" y1="${cy - height * 0.17}" x2="${cx + width * 0.09}" y2="${cy - height * 0.17}" stroke="${line}" stroke-width="${thin}"/>
      <line x1="${cx - width * 0.09}" y1="${cy + height * 0.17}" x2="${cx + width * 0.09}" y2="${cy + height * 0.17}" stroke="${line}" stroke-width="${thin}"/>
    </g>`
  }

  if (kind === 'golf-hole') {
    return `<g data-role="sport-surface" data-surface="golf-hole">
      <path d="M ${x + width * 0.08} ${y + height * 0.78} C ${x + width * 0.32} ${y + height * 0.5}, ${x + width * 0.56} ${y + height * 0.92}, ${x + width * 0.9} ${y + height * 0.56}" fill="none" stroke="${line}" stroke-width="${sw * 2}" stroke-linecap="round"/>
      <ellipse cx="${x + width * 0.72}" cy="${y + height * 0.38}" rx="${width * 0.18}" ry="${height * 0.1}" fill="rgba(34,197,94,0.22)" stroke="${dim}" stroke-width="${thin}"/>
      <line x1="${x + width * 0.72}" y1="${y + height * 0.38}" x2="${x + width * 0.72}" y2="${y + height * 0.18}" stroke="${line}" stroke-width="${thin}"/>
      <path d="M ${x + width * 0.72} ${y + height * 0.18} L ${x + width * 0.84} ${y + height * 0.23} L ${x + width * 0.72} ${y + height * 0.28} Z" fill="${highlight}" opacity="0.8"/>
    </g>`
  }

  if (kind === 'dartboard') {
    const rings = [0.34, 0.28, 0.22, 0.16, 0.08]
    return `<g data-role="sport-surface" data-surface="dartboard">
      ${rings.map((scale, index) => `<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * scale}" fill="none" stroke="${index % 2 ? highlight : line}" stroke-width="${index === rings.length - 1 ? sw : thin}"/>`).join('\n      ')}
      ${Array.from({ length: 10 }).map((_, index) => {
        const a = (Math.PI * 2 * index) / 10
        return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * Math.min(width, height) * 0.34}" y2="${cy + Math.sin(a) * Math.min(width, height) * 0.34}" stroke="${dim}" stroke-width="${thin}"/>`
      }).join('\n      ')}
    </g>`
  }

  if (kind === 'velodrome') {
    return `<g data-role="sport-surface" data-surface="velodrome">
      <rect x="${x + width * 0.08}" y="${y + height * 0.22}" width="${width * 0.84}" height="${height * 0.56}" rx="${height * 0.28}" fill="none" stroke="${line}" stroke-width="${sw * 1.6}"/>
      <rect x="${x + width * 0.18}" y="${y + height * 0.32}" width="${width * 0.64}" height="${height * 0.36}" rx="${height * 0.18}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
      <path d="M ${x + width * 0.22} ${cy} H ${x + width * 0.78}" stroke="${highlight}" stroke-width="${thin}" stroke-linecap="round"/>
    </g>`
  }

  if (kind === 'circuit') {
    const path = [
      [x + width * 0.14, y + height * 0.64],
      [x + width * 0.26, y + height * 0.28],
      [x + width * 0.52, y + height * 0.24],
      [x + width * 0.7, y + height * 0.42],
      [x + width * 0.86, y + height * 0.31],
      [x + width * 0.78, y + height * 0.76],
      [x + width * 0.42, y + height * 0.7],
      [x + width * 0.3, y + height * 0.86],
      [x + width * 0.14, y + height * 0.64]
    ]
    return `<g data-role="sport-surface" data-surface="circuit">
      <path d="${linePath(path)}" fill="none" stroke="rgba(0,0,0,0.52)" stroke-width="${sw * 4}" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${linePath(path)}" fill="none" stroke="${line}" stroke-width="${sw * 2}" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${linePath(path.slice(0, 5))}" fill="none" stroke="${highlight}" stroke-width="${thin}" stroke-linejoin="round" stroke-linecap="round"/>
      <rect x="${x + width * 0.57}" y="${y + height * 0.2}" width="${width * 0.16}" height="${sw * 3}" fill="${text}" opacity="0.7" transform="rotate(42 ${x + width * 0.65} ${y + height * 0.22})"/>
    </g>`
  }

  return `<g data-role="sport-surface" data-surface="sports-field">
    <rect x="${x + width * 0.1}" y="${y + height * 0.16}" width="${width * 0.8}" height="${height * 0.68}" rx="${Math.round(width * 0.04)}" fill="none" stroke="${line}" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.18}" fill="none" stroke="${dim}" stroke-width="${thin}"/>
  </g>`
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
  const motorsportBrandKind = !matchup ? resolveMotorsportBrandKind(layout.normalized) : ''
  if (motorsportBrandKind && variant !== 'logo') {
    return renderMotorsportBrandCardSvg({ layout, kind: motorsportBrandKind, variant, base, accent, text, highlight })
  }
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
    ? renderMatchupVisual({
      matchup,
      sport: layout.normalized.sport,
      competition: layout.normalized.competition,
      title: layout.normalized.eventTitle,
      detail: layout.normalized.eventDetail,
      x: visual.x,
      y: visual.y,
      width: visual.width,
      height: visual.height,
      base,
      accent,
      highlight,
      text,
      isPoster
    })
    : renderSportMotif({ sport: layout.normalized.sport, competition: layout.normalized.competition, title: layout.normalized.eventTitle, detail: layout.normalized.eventDetail, x: visual.x, y: visual.y, width: visual.width, height: visual.height, base, accent, highlight, text, isPoster })
  const backgroundSurface = renderSportSurfaceOutline({
    sport: layout.normalized.sport,
    competition: layout.normalized.competition,
    title: layout.normalized.eventTitle,
    detail: layout.normalized.eventDetail,
    x: Math.round(width * 0.08),
    y: Math.round(height * 0.1),
    width: Math.round(width * 0.84),
    height: Math.round(height * 0.78),
    highlight,
    accent,
    text,
    opacity: 0.2
  })

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
  ${backgroundSurface}
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#diagonal)" opacity="0.18"/>
  <rect x="${visual.x}" y="${visual.y}" width="${visual.width}" height="${visual.height}" rx="18" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.16)" stroke-width="${Math.max(2, Math.round(width * 0.004))}"/>
  ${visualMarkup}
  <rect x="${titlePanel.x}" y="${titlePanel.y}" width="${titlePanel.width}" height="${titlePanel.height}" rx="14" fill="url(#panel)" stroke="rgba(255,255,255,0.14)" stroke-width="${Math.max(2, Math.round(width * 0.004))}"/>
  <circle cx="${width - layout.safe - markerSize}" cy="${layout.safe + markerSize}" r="${markerSize}" fill="${accent}"/>
  ${textNodes}
</svg>`
}

function renderMatchupVisual({ matchup, sport = '', competition = '', title = '', detail = '', x, y, width, height, base, accent, highlight, text = '#f8fafc', isPoster }) {
  const leftColor = colorFromText(matchup.left, base)
  const rightColor = colorFromText(matchup.right, accent)
  const cy = Math.round(y + height * 0.48)
  const lx = Math.round(x + width * 0.27)
  const rx = Math.round(x + width * 0.73)
  const labelY = Math.round(y + height * 0.56)
  const versusSize = Math.round(Math.min(width, height) * (isPoster ? 0.2 : 0.23))
  const teamFont = Math.round(isPoster ? 31 : 42)
  const leftLines = wrapText(matchup.left, width * 0.4, teamFont, 3)
  const rightLines = wrapText(matchup.right, width * 0.4, teamFont, 3)
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
      strokeWidth: 5
    }, width * 0.36)
  ).join('\n  ')

  const surface = renderSportSurfaceOutline({
    sport,
    competition,
    title,
    detail,
    x: x + Math.round(width * 0.04),
    y: y + Math.round(height * 0.08),
    width: Math.round(width * 0.92),
    height: Math.round(height * 0.58),
    highlight,
    accent,
    text,
    opacity: 0.56
  })

  return `<g data-role="matchup-visual">
    <rect x="${x}" y="${y}" width="${width / 2}" height="${height}" rx="18" fill="${leftColor}" opacity="0.72"/>
    <rect x="${x + width / 2}" y="${y}" width="${width / 2}" height="${height}" rx="18" fill="${rightColor}" opacity="0.72"/>
    ${surface}
    <rect x="${x + width / 2 - 4}" y="${y + 18}" width="8" height="${height - 36}" fill="rgba(0,0,0,0.42)"/>
    <rect x="${x + 22}" y="${Math.round(y + height * 0.5)}" width="${Math.round(width * 0.42)}" height="${Math.round(height * 0.24)}" rx="14" fill="rgba(15,23,42,0.54)" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
    <rect x="${Math.round(x + width * 0.56)}" y="${Math.round(y + height * 0.5)}" width="${Math.round(width * 0.42)}" height="${Math.round(height * 0.24)}" rx="14" fill="rgba(15,23,42,0.54)" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
    ${renderTextLine({ role: 'visual-versus', text: 'V', x: x + width / 2, y: cy + Math.round(versusSize * 0.32), fontSize: versusSize, weight: 900, anchor: 'middle', fill: '#ffffff', stroke: '#020617', strokeWidth: 10 }, versusSize * 1.05)}
    ${renderTeamLines(leftLines, lx)}
    ${renderTeamLines(rightLines, rx)}
    <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="6" fill="${highlight}" opacity="0.8"/>
    <rect x="${x + 18}" y="${y + height - 24}" width="${width - 36}" height="6" fill="${highlight}" opacity="0.55"/>
  </g>`
}

function renderMotorsportBrandVisual({ kind, mark, title, detail, competition, x, y, width, height, base, accent, highlight, text, isPoster }) {
  const cx = Math.round(x + width / 2)
  const brand = kind === 'motogp' ? 'motogp' : 'formula-one'
  const markFontSize = kind === 'motogp'
    ? Math.round(isPoster ? 76 : 118)
    : Math.round(isPoster ? 104 : 152)
  const markY = Math.round(y + height * (isPoster ? 0.34 : 0.38))
  const titleLines = wrapText(title || competition || mark, width - 88, isPoster ? 31 : 46, isPoster ? 2 : 2)
  const detailText = wrapText(detail || '', width - 92, isPoster ? 23 : 34, 1)[0] || ''
  const competitionText = wrapText(competition || mark, width - 92, isPoster ? 22 : 32, 1)[0] || ''
  const titleStartY = Math.round(y + height * (isPoster ? 0.62 : 0.64))
  const titleMarkup = titleLines.map((line, index) => renderTextLine({
    role: `${brand}-event-title`,
    text: line,
    x: cx,
    y: titleStartY + (index * Math.round((isPoster ? 31 : 46) * 1.12)),
    fontSize: isPoster ? 31 : 46,
    weight: 900,
    anchor: 'middle',
    fill: '#f8fafc',
    stroke: '#020617',
    strokeWidth: isPoster ? 6 : 8
  }, width - 98)).join('\n  ')
  const detailMarkup = detailText
    ? renderTextLine({
      role: `${brand}-session`,
      text: detailText,
      x: cx,
      y: Math.round(y + height * (isPoster ? 0.82 : 0.84)),
      fontSize: isPoster ? 23 : 34,
      weight: 850,
      anchor: 'middle',
      fill: highlight,
      stroke: '#020617',
      strokeWidth: isPoster ? 4 : 6
    }, width - 110)
    : ''
  const competitionMarkup = competitionText
    ? renderTextLine({
      role: `${brand}-competition`,
      text: competitionText,
      x: cx,
      y: Math.round(y + height * (isPoster ? 0.91 : 0.92)),
      fontSize: isPoster ? 20 : 30,
      weight: 750,
      anchor: 'middle',
      fill: text,
      stroke: 'rgba(0,0,0,0.42)',
      strokeWidth: 4
    }, width - 120)
    : ''
  const markFill = kind === 'motogp' ? '#f8fafc' : '#ffffff'
  const circuit = renderSportSurfaceOutline({
    sport: 'motorsport',
    competition,
    title,
    detail,
    x: x + Math.round(width * 0.08),
    y: y + Math.round(height * 0.08),
    width: Math.round(width * 0.84),
    height: Math.round(height * 0.42),
    highlight,
    accent,
    text,
    opacity: 0.68
  })

  return `<g data-role="${brand}-poster-visual">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${base}" opacity="0.38"/>
    <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${height - 36}" rx="16" fill="rgba(15,23,42,0.32)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
    ${circuit}
    ${renderTextLine({
      role: `${brand}-mark`,
      text: mark,
      x: cx,
      y: markY,
      fontSize: markFontSize,
      weight: 950,
      anchor: 'middle',
      fill: markFill,
      stroke: '#020617',
      strokeWidth: isPoster ? 10 : 14
    }, width - 88)}
    ${titleMarkup}
    ${detailMarkup}
    ${competitionMarkup}
  </g>`
}

function renderMotorsportBrandCardSvg({ layout, kind, variant, base, accent, text, highlight }) {
  const { width, height } = layout.dimensions
  const normalized = layout.normalized
  const brand = kind === 'motogp' ? 'motogp' : 'formula-one'
  const mark = kind === 'motogp'
    ? resolveCompetitionMark({
      sport: normalized.sport,
      competition: normalized.competition,
      title: normalized.eventTitle,
      detail: normalized.eventDetail
    })
    : 'F1'
  const isPoster = variant === 'poster'
  const isBackground = variant === 'background'
  const cx = Math.round(width / 2)
  const title = normalizeSpace(normalized.eventTitle || normalized.competition || mark)
  const session = normalizeSpace(normalized.eventDetail || '')
  const competition = normalizeSpace(normalized.competition || (kind === 'motogp' ? mark : 'Formula 1'))
  const footer = buildFooter(normalized)
  const titleLines = wrapText(title, width * (isPoster ? 0.82 : 0.58), isPoster ? 42 : isBackground ? 82 : 58, isPoster ? 2 : 1)
  const markFontSize = kind === 'motogp'
    ? Math.round(isPoster ? 100 : isBackground ? 190 : 148)
    : Math.round(isPoster ? 148 : isBackground ? 245 : 190)
  const titleFontSize = Math.round(isPoster ? 42 : isBackground ? 82 : 58)
  const sessionFontSize = Math.round(isPoster ? 28 : isBackground ? 46 : 34)
  const competitionFontSize = Math.round(isPoster ? 22 : isBackground ? 36 : 28)
  const footerFontSize = Math.round(isPoster ? 18 : isBackground ? 26 : 20)
  const markY = Math.round(height * (isPoster ? 0.34 : 0.42))
  const titleStartY = Math.round(height * (isPoster ? 0.56 : 0.62))
  const sessionY = Math.round(height * (isPoster ? 0.72 : 0.74))
  const competitionY = Math.round(height * (isPoster ? 0.83 : 0.84))
  const footerY = Math.round(height - (isPoster ? 42 : 54))
  const titleMarkup = titleLines.map((line, index) => renderTextLine({
    role: `${brand}-event-title`,
    text: line,
    x: cx,
    y: titleStartY + (index * Math.round(titleFontSize * 1.12)),
    fontSize: titleFontSize,
    weight: 900,
    anchor: 'middle',
    fill: '#f8fafc',
    stroke: '#020617',
    strokeWidth: isPoster ? 8 : 12
  }, width * (isPoster ? 0.82 : 0.62))).join('\n  ')
  const sessionMarkup = session
    ? renderTextLine({
      role: `${brand}-session`,
      text: session,
      x: cx,
      y: sessionY,
      fontSize: sessionFontSize,
      weight: 850,
      anchor: 'middle',
      fill: highlight,
      stroke: '#020617',
      strokeWidth: isPoster ? 5 : 8
    }, width * (isPoster ? 0.76 : 0.5))
    : ''
  const competitionMarkup = renderTextLine({
    role: `${brand}-competition`,
    text: competition,
    x: cx,
    y: competitionY,
    fontSize: competitionFontSize,
    weight: 800,
    anchor: 'middle',
    fill: text,
    stroke: 'rgba(0,0,0,0.48)',
    strokeWidth: isPoster ? 4 : 6
  }, width * (isPoster ? 0.76 : 0.48))
  const footerMarkup = footer
    ? renderTextLine({
      role: 'footer',
      text: footer,
      x: isPoster ? 36 : 64,
      y: footerY,
      fontSize: footerFontSize,
      weight: 700,
      fill: '#ffffff'
    }, width - (isPoster ? 72 : 128))
    : ''
  const circuit = renderSportSurfaceOutline({
    sport: 'motorsport',
    competition,
    title,
    detail: session,
    x: Math.round(width * 0.12),
    y: Math.round(height * (isPoster ? 0.08 : 0.12)),
    width: Math.round(width * 0.76),
    height: Math.round(height * (isPoster ? 0.36 : 0.42)),
    highlight,
    accent,
    text,
    opacity: 0.7
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="brandBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="0.58" stop-color="#111827"/>
      <stop offset="1" stop-color="${colorFromText(title, accent)}"/>
    </linearGradient>
    <pattern id="brandDiagonal" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
      <rect width="56" height="56" fill="transparent"/>
      <rect width="12" height="56" fill="rgba(255,255,255,0.05)"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="url(#brandBg)"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#brandDiagonal)" opacity="0.18"/>
  <g data-role="${brand}-poster-visual">
    ${circuit}
    ${renderTextLine({
      role: `${brand}-mark`,
      text: mark,
      x: cx,
      y: markY,
      fontSize: markFontSize,
      weight: 950,
      anchor: 'middle',
      fill: '#ffffff',
      stroke: '#020617',
      strokeWidth: isPoster ? 12 : 18
    }, width * (isPoster ? 0.76 : 0.5))}
    ${titleMarkup}
    ${sessionMarkup}
    ${competitionMarkup}
  </g>
  ${footerMarkup}
</svg>`
}

function renderSportMotif({ sport, competition, title, detail, x, y, width, height, base, accent, highlight, text, isPoster }) {
  const cx = Math.round(x + width / 2)
  const cy = Math.round(y + height * 0.45)
  const r = Math.round(Math.min(width, height) * (isPoster ? 0.25 : 0.28))
  const mark = resolveCompetitionMark({ sport, competition, title, detail })
  if (isFormulaOneMark(mark, competition, title)) {
    return renderMotorsportBrandVisual({ kind: 'f1', mark: 'F1', title, detail, competition, x, y, width, height, base, accent, highlight, text, isPoster })
  }
  if (isMotoGpMark(mark, competition, title)) {
    return renderMotorsportBrandVisual({ kind: 'motogp', mark: 'MotoGP', title, detail, competition, x, y, width, height, base, accent, highlight, text, isPoster })
  }
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

  const surface = renderSportSurfaceOutline({
    sport,
    competition,
    title,
    detail,
    x: x + Math.round(width * 0.07),
    y: y + Math.round(height * 0.08),
    width: Math.round(width * 0.86),
    height: Math.round(height * 0.5),
    highlight,
    accent,
    text,
    opacity: 0.68
  })

  return `<g data-role="competition-poster-visual">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${base}" opacity="0.35"/>
    <rect x="${x + 18}" y="${y + 18}" width="${width - 36}" height="${height - 36}" rx="16" fill="rgba(15,23,42,0.28)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
    ${surface}
    ${posterMark}
    ${titleText}
    ${lowerLabel}
  </g>`
}

function renderSportsArtworkSvg(input = {}, variant = 'poster') {
  return renderSportsCardSvg(input, variant)
}

function buildArtworkInputFromRequest({ canonicalId = '', sport = '', league = '', title = '', date = '', homeTeam = '', awayTeam = '', seeders = '', size = '', rawTitle = '', source = 'fallback' } = {}) {
  const parsed = parseSportsMetaCanonicalId(canonicalId)
  return normalizeSportsEventMetadata({
    canonicalId,
    sportHint: sport || parsed?.sportKey || '',
    sport: sport || parsed?.sport || '',
    competition: league || parsed?.competition || '',
    eventTitle: title || parsed?.eventTitle || '',
    date: date || parsed?.date || '',
    homeTeam,
    awayTeam,
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
  renderSportSurfaceOutline,
  renderSportsArtworkSvg,
  wrapText
}
