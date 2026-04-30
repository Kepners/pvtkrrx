const SPORTS_POSTER_TEMPLATES = Object.freeze([
  'editorial',
  'broadcast',
  'sportsbook',
  'trading-card',
  'brutalist',
  'ticket-stub',
  'glitch'
])

const TEMPLATE_LABELS = Object.freeze({
  editorial: 'Editorial',
  broadcast: 'Broadcast',
  sportsbook: 'Sportsbook',
  'trading-card': 'Trading Card',
  brutalist: 'Brutalist',
  'ticket-stub': 'Ticket Stub',
  glitch: 'Glitch'
})

const SPORTS_POSTER_LAYOUT_FAMILIES = Object.freeze({
  editorial: 'EDITORIAL',
  broadcast: 'BROADCAST',
  sportsbook: 'SPORTSBOOK',
  'trading-card': 'TRADING_CARD',
  brutalist: 'BRUTALIST',
  'ticket-stub': 'TICKET_STUB',
  glitch: 'GLITCH'
})

const SOURCE_W = 400
const SOURCE_H = 600
const BROADCAST_W = 600
const BROADCAST_H = 900
const BROADCAST_WORDMARK = 'PVTKRRX \u00b7 BROADCAST'

const { buildPaidTemplateMatchup } = require('./sportsPosterAdapter')
const { classifySportsPosterEvent } = require('./sportsPosterClassifier')

const LEAGUE_CODE_ALIASES = Object.freeze({
  'english premier league': 'EPL',
  'premier league': 'EPL',
  'fa cup': 'FAC',
  'major league soccer': 'MLS',
  mls: 'MLS',
  nba: 'NBA',
  'nba playoffs': 'NBA',
  nfl: 'NFL',
  'nfl playoffs': 'NFL',
  mlb: 'MLB',
  nhl: 'NHL',
  'indian premier league': 'IPL',
  ipl: 'IPL',
  'pga tour': 'PGA',
  'pga championship': 'PGA',
  ufc: 'UFC',
  wwe: 'WWE',
  motogp: 'MotoGP',
  'moto gp': 'MotoGP',
  'formula 1': 'F1',
  'formula one': 'F1',
  f1: 'F1',
  wrc: 'WRC',
  wimbledon: 'ATP'
})

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value) {
  return normalizeSpace(value).toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
}

function titleCase(value = '') {
  return normalizeSpace(value)
    .split(/\s+/)
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : '')
    .join(' ')
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeSportsPosterTemplate(value) {
  const raw = normalizeKey(value)
  const aliases = {
    default: 'ticket-stub',
    free: 'ticket-stub',
    baseline: 'ticket-stub',
    classic: 'editorial',
    magazine: 'editorial',
    split: 'broadcast',
    'team-split': 'broadcast',
    versus: 'broadcast',
    vs: 'broadcast',
    tv: 'broadcast',
    odds: 'sportsbook',
    betting: 'sportsbook',
    card: 'trading-card',
    trading: 'trading-card',
    spotlight: 'trading-card',
    programme: 'ticket-stub',
    program: 'ticket-stub',
    matchday: 'ticket-stub',
    ticket: 'ticket-stub',
    stub: 'ticket-stub',
    stadium: 'broadcast',
    cyber: 'glitch',
    neon: 'glitch'
  }
  const candidate = aliases[raw] || raw
  return SPORTS_POSTER_TEMPLATES.includes(candidate) ? candidate : 'ticket-stub'
}

function layoutFamilyForSportsPosterTemplate(value) {
  const template = normalizeSportsPosterTemplate(value)
  return SPORTS_POSTER_LAYOUT_FAMILIES[template] || 'TICKET_STUB'
}

function isBroadcastLayoutFamily(value) {
  return String(value || '').trim().toUpperCase() === 'BROADCAST'
}

function resolveSportsPosterTemplate(...values) {
  for (const value of values) {
    const raw = normalizeSpace(value)
    if (raw) return normalizeSportsPosterTemplate(raw)
  }
  return normalizeSportsPosterTemplate(process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE || 'ticket-stub')
}

function dimensionsFor(variant = 'poster') {
  if (variant === 'background') return { width: 1920, height: 1080 }
  if (variant === 'landscape') return { width: 1280, height: 720 }
  return { width: 600, height: 900 }
}

function layoutScale(variant = 'poster') {
  const dims = dimensionsFor(variant)
  if (dims.width / dims.height === SOURCE_W / SOURCE_H) {
    return {
      ...dims,
      scale: dims.width / SOURCE_W,
      offsetX: 0,
      offsetY: 0,
      preserveAspectRatio: 'xMidYMid meet'
    }
  }
  const scale = Math.min(dims.width / SOURCE_W, dims.height / SOURCE_H)
  return {
    ...dims,
    scale,
    offsetX: Math.round((dims.width - SOURCE_W * scale) / 2),
    offsetY: Math.round((dims.height - SOURCE_H * scale) / 2),
    preserveAspectRatio: 'xMidYMid meet'
  }
}

function scaleSlot(slot, variant = 'poster') {
  const layout = layoutScale(variant)
  const size = Math.round(slot.size * layout.scale)
  return {
    role: slot.role,
    size,
    left: Math.round(layout.offsetX + slot.left * layout.scale),
    top: Math.round(layout.offsetY + slot.top * layout.scale)
  }
}

function wrapTemplateSvg(inner, slots = [], variant = 'poster') {
  const layout = layoutScale(variant)
  const background = variant === 'poster' ? '' : `<rect width="${layout.width}" height="${layout.height}" fill="#05070d"/>`
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img">
  ${background}
  <svg x="${layout.offsetX}" y="${layout.offsetY}" width="${Math.round(SOURCE_W * layout.scale)}" height="${Math.round(SOURCE_H * layout.scale)}" viewBox="0 0 ${SOURCE_W} ${SOURCE_H}" preserveAspectRatio="${layout.preserveAspectRatio}">
${inner}
  </svg>
</svg>`,
    slots: slots.map((slot) => scaleSlot(slot, variant)),
    overlay: ''
  }
}

function splitLines(value = '', maxChars = 20, maxLines = 2) {
  const words = normalizeSpace(value).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length > maxLines) lines.length = maxLines
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1] || ''
    lines[maxLines - 1] = last.length > maxChars - 3
      ? `${last.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`
      : `${last}...`
  }
  return lines
}

function initialsFor(value = '', fallback = 'SP') {
  const clean = normalizeSpace(value).replace(/[^A-Za-z0-9 ]+/g, ' ')
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return fallback
}

function shortFor(value = '', fallback = 'SP') {
  const clean = normalizeSpace(value).replace(/[^A-Za-z0-9 ]+/g, ' ')
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return words.map((word) => word[0]).join('').slice(0, 4).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return fallback
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

function colorForLabel(label = '', fallback = '#123c69') {
  const palette = ['#6CABDD', '#EF0107', '#552583', '#FDB927', '#0C2340', '#E31837', '#004C54', '#B4975A', '#0B5C36', '#D20A0A']
  return palette[hashString(label) % palette.length] || fallback
}

function readableAccent(primary = '#123c69') {
  const clean = String(primary || '').replace(/[^a-f0-9]/gi, '')
  if (clean.length !== 6) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return ((0.299 * r) + (0.587 * g) + (0.114 * b)) > 150 ? '#111827' : '#ffffff'
}

function leagueCodeFor(event = {}, league = '') {
  const explicit = normalizeSpace(event.leagueCode || event.league_code || event.competitionCode)
  if (explicit) return explicit.slice(0, 8).toUpperCase()
  const normalized = normalizeSpace(league || event.league || event.competition).toLowerCase()
  if (LEAGUE_CODE_ALIASES[normalized]) return LEAGUE_CODE_ALIASES[normalized]
  return shortFor(normalized || event.sport, 'SP')
}

function isFormulaOneText(text = '') {
  return /\b(?:formula\s*1|formula\s*one|formula1|f1)\b/i.test(text)
}

function sportIconFor(event = {}, facts = {}) {
  const text = `${event.sport_icon || ''} ${event.sportIcon || ''} ${facts.sport || ''} ${facts.league || ''} ${facts.detail || ''} ${facts.title || ''}`.toLowerCase()
  if (isFormulaOneText(text)) return 'f1'
  if (/moto\s*gp|motogp/.test(text)) return 'motogp'
  if (/motor|wrc|rally|nascar|indycar|wec|formula\s*e|supercars|v8sc|grand prix/.test(text)) return 'motorsport'
  if (/golf|pga|lpga|masters|ryder|liv/.test(text)) return 'golf'
  if (/darts|pdc|world matchplay/.test(text)) return 'darts'
  if (/cycling|tour de france|giro|vuelta|stage|time trial|road race/.test(text)) return 'cycling'
  if (/athletics|diamond league|continental tour|track and field|marathon/.test(text)) return 'athletics'
  if (/cricket|ipl|odi|t20|ashes/.test(text)) return 'cricket'
  if (/rugby|nrl|six nations|super rugby/.test(text)) return 'rugby'
  if (/wrestling|wwe|aew|smackdown|raw|nxt/.test(text)) return 'wrestling'
  if (/american.*football|nfl/.test(text)) return 'football'
  if (/football|soccer|premier|fa cup|mls|champions league|europa/.test(text)) return 'soccer'
  if (/hockey|nhl/.test(text)) return 'hockey'
  if (/basketball|nba/.test(text)) return 'basketball'
  if (/baseball|mlb/.test(text)) return 'baseball'
  if (/snooker|crucible|world snooker/.test(text)) return 'snooker'
  if (/tennis|wimbledon|atp|wta/.test(text)) return 'tennis'
  if (/mma|ufc|boxing|fight/.test(text)) return 'mma'
  return 'soccer'
}

function isLiveEvent(event = {}) {
  if (event.isLive === true || event.live === true) return true
  const status = normalizeSpace(event.liveStatus || event.status || event.eventStatus).toLowerCase()
  return ['live', 'in-progress', 'in_progress', 'ongoing'].includes(status)
}

function broadcastLabelFor(event = {}, facts = {}) {
  const raw = normalizeSpace(event.broadcastLabel || event.layoutLabel || event.leagueCode || event.league_code)
  if (raw) return raw
  const text = normalizeSpace(`${facts.league || ''} ${facts.sport || ''} ${facts.title || ''}`)
  if (/\b(?:moto\s*gp|motogp)\b/i.test(text)) return 'MotoGP'
  if (/\bwrc\b|\brally\b/i.test(text)) return 'WRC'
  if (isFormulaOneText(text)) return 'Formula 1'
  const code = leagueCodeFor(event, facts.league)
  if (code && code !== 'SP') return code
  return facts.league || facts.sport || 'Sports'
}

function eventTitle(event = {}) {
  const home = normalizeSpace(event.homeTeam)
  const away = normalizeSpace(event.awayTeam)
  if (home && away) return `${home} vs ${away}`
  return normalizeSpace(event.title || event.name || event.eventName || event.league || event.sport || 'Sports Event')
}

function eventFacts(event = {}) {
  const sportRaw = normalizeSpace(event.sport)
  const sport = sportRaw && sportRaw === sportRaw.toLowerCase() ? titleCase(sportRaw) : sportRaw || 'Sports'
  const league = normalizeSpace(event.league || event.competition) || sport
  const home = normalizeSpace(event.homeTeam)
  const away = normalizeSpace(event.awayTeam)
  const facts = {
    sport,
    league,
    leagueCode: leagueCodeFor(event, league),
    leagueFull: normalizeSpace(event.leagueFull || event.league_full) || league,
    title: eventTitle(event),
    detail: normalizeSpace(event.eventDetail || event.detail || event.session || ''),
    round: normalizeSpace(event.round),
    venue: normalizeSpace(event.venue),
    date: normalizeSpace(event.date || event.localDate),
    time: normalizeSpace(event.time || event.timestamp),
    home,
    away,
    seeders: normalizeSpace(event.seeders),
    size: normalizeSpace(event.size)
  }
  facts.homeShort = normalizeSpace(event.homeShort || event.homeCode || event.home?.short) || shortFor(home, 'H')
  facts.awayShort = normalizeSpace(event.awayShort || event.awayCode || event.away?.short) || shortFor(away, 'A')
  facts.homeInitials = normalizeSpace(event.homeInitials || event.home?.initials) || initialsFor(home, facts.homeShort)
  facts.awayInitials = normalizeSpace(event.awayInitials || event.away?.initials) || initialsFor(away, facts.awayShort)
  facts.sportIcon = sportIconFor(event, facts)
  return facts
}

function templateData(event = {}, theme = {}, mode = '') {
  const eventClass = event.eventClass || event.posterClass || classifySportsPosterEvent(event)
  const data = buildPaidTemplateMatchup(event, eventClass)
  const requestedMode = normalizeKey(mode)
  const eventFormat = ['matchup', 'single', 'solo'].includes(requestedMode)
    ? requestedMode
    : data.event_format
  const hasMatchup = eventFormat === 'matchup' || eventFormat === 'single'
  const isTeamMatchup = eventFormat === 'matchup'
  const leftLabel = isTeamMatchup
    ? 'HOME'
    : eventClass === 'combat_event' ? 'FIGHTER' : eventClass === 'tennis_or_snooker_match' || eventClass === 'darts_event' ? 'PLAYER' : 'ENTRY'
  const rightLabel = isTeamMatchup
    ? 'AWAY'
    : eventClass === 'combat_event' ? 'FIGHTER' : eventClass === 'tennis_or_snooker_match' || eventClass === 'darts_event' ? 'PLAYER' : 'ENTRY'
  const home = {
    ...data.home,
    primary: theme.homeColor || data.home.primary,
    secondary: theme.homeSecondary || data.home.secondary,
    accent: data.home.accent || readableAccent(theme.homeColor || data.home.primary)
  }
  const away = {
    ...data.away,
    primary: theme.awayColor || data.away.primary,
    secondary: theme.awaySecondary || data.away.secondary,
    accent: data.away.accent || readableAccent(theme.awayColor || data.away.primary)
  }
  return {
    ...data,
    event_format: eventFormat,
    primary_color: theme.homeColor || data.primary_color,
    secondary_color: theme.awayColor || data.secondary_color,
    accent_color: theme.accentColor || data.accent_color,
    home,
    away,
    hasMatchup,
    isTeamMatchup,
    isSolo: eventFormat === 'solo',
    leftLabel,
    rightLabel,
    isLive: isLiveEvent(event),
    broadcastLabel: broadcastLabelFor(event, data)
  }
}

const FONTS_BEBAS_MONO_SANS = `.bebas { font-family: 'Bebas Neue', Impact, sans-serif; }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.sans { font-family: 'Inter', system-ui, sans-serif; }`

const FONTS_EDITORIAL = `.serif { font-family: 'Playfair Display', Georgia, serif; }
.bebas { font-family: 'Bebas Neue', Impact, sans-serif; }
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.sans { font-family: 'Inter', system-ui, sans-serif; }`

const BROADCAST_PLACEHOLDER_RE = /^(?:tba|tbd|n\/?a|na|unknown|undefined|null|event|session|sports event|sport event|matchup|tournament|golf event|darts event)$/i
const BROADCAST_ALLOWED_LABELS = new Set(['AEW', 'AFCON', 'ATP', 'EFL', 'EPL', 'FA', 'FE', 'FIFA', 'F1', 'IPL', 'LIV', 'MLB', 'MLS', 'MMA', 'MotoGP', 'NBA', 'NFL', 'NHL', 'PDC', 'PFL', 'PGA', 'UCL', 'UEL', 'UFC', 'UEFA', 'WEC', 'WRC', 'WTA', 'WWE'])

function cleanBroadcastText(value = '') {
  const clean = normalizeSpace(value)
    .replace(/\.{3,}|\u2026/g, '')
    .replace(/\bTBA\b\s*(?:[-/|]|\u2022)?\s*/gi, '')
    .replace(/\s*(?:[-/|]|\u2022)\s*\bTBA\b/gi, '')
    .replace(/\s*(?:[-/|]|\u2022)\s*$/g, '')
    .replace(/^\s*(?:[-/|]|\u2022)\s*/g, '')
  const normalized = normalizeSpace(clean)
  return normalized && !BROADCAST_PLACEHOLDER_RE.test(normalized) ? normalized : ''
}

function firstBroadcastText(...values) {
  for (const value of values) {
    const clean = cleanBroadcastText(value)
    if (clean) return clean
  }
  return ''
}

function broadcastTextKey(value = '') {
  return cleanBroadcastText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function broadcastLabelCase(value = '') {
  const clean = cleanBroadcastText(value)
  if (!clean) return ''
  const upper = clean.toUpperCase()
  if (upper === 'MOTOGP') return 'MotoGP'
  return upper
}

function broadcastLabelForRender(event = {}, m = {}) {
  const text = normalizeSpace([
    event.broadcastLabel,
    event.layoutLabel,
    event.leagueCode,
    event.league_code,
    event.league,
    event.competition,
    event.title,
    event.eventTitle,
    event.eventShort,
    event.event_short,
    event.rawTitle,
    m.broadcastLabel,
    m.league_code,
    m.league,
    m.event_short,
    m.event,
    m.sport
  ].filter(Boolean).join(' '))

  if (/\b(?:moto\s*gp|motogp)\b/i.test(text)) return 'MotoGP'
  if (/\bwrc\b|\brally\b/i.test(text)) return 'WRC'
  if (isFormulaOneText(text)) return 'F1'
  if (/\bsnooker\b|\bworld\s+championship\b|\bcrucible\b/i.test(text)) return 'SNOOKER'
  if (/\bnba\b/i.test(text)) return 'NBA'
  if (/\bbasketball\b/i.test(text)) return 'BASKETBALL'
  if (/\b(?:football|soccer|premier|fa cup|mls|champions league|europa|world cup)\b/i.test(text)) return 'FOOTBALL'
  if (/\bmotorsport\b|\bmotor\b/i.test(text)) return 'MOTORSPORT'

  const raw = broadcastLabelCase(firstBroadcastText(event.broadcastLabel, event.layoutLabel, event.leagueCode, event.league_code, m.broadcastLabel, m.league_code))
  if (BROADCAST_ALLOWED_LABELS.has(raw)) return raw
  const sport = broadcastLabelCase(firstBroadcastText(event.sport, m.sport, event.sportHint))
  return sport || 'SPORTS'
}

function broadcastPaletteFor(event = {}, m = {}, label = '') {
  const text = normalizeSpace([
    label,
    event.sport,
    event.sportHint,
    event.league,
    event.competition,
    event.title,
    event.eventTitle,
    event.eventShort,
    event.rawTitle,
    m.sport,
    m.league,
    m.sport_icon
  ].filter(Boolean).join(' ')).toLowerCase()

  if (/moto\s*gp|motogp|wrc|rally|motor|motorsport|f1|formula/.test(text)) {
    return {
      key: 'motorsport',
      bg0: '#140506',
      bg1: '#2a0708',
      bg2: '#08090d',
      glow: 'rgba(239, 68, 68, 0.32)',
      glowSoft: 'rgba(239, 68, 68, 0.04)',
      accent: '#b91c1c',
      accent2: '#ef4444',
      pill: 'rgba(185, 28, 28, 0.35)',
      pattern: 'motorsport'
    }
  }
  if (/snooker|billiards|crucible/.test(text)) {
    return {
      key: 'snooker',
      bg0: '#03130d',
      bg1: '#06281a',
      bg2: '#020705',
      glow: 'rgba(34, 197, 94, 0.28)',
      glowSoft: 'rgba(34, 197, 94, 0.04)',
      accent: '#16a34a',
      accent2: '#86efac',
      pill: 'rgba(22, 163, 74, 0.32)',
      pattern: 'snooker'
    }
  }
  if (/basketball|nba|wnba/.test(text)) {
    return {
      key: 'basketball',
      bg0: '#180b05',
      bg1: '#3b1607',
      bg2: '#090604',
      glow: 'rgba(249, 115, 22, 0.30)',
      glowSoft: 'rgba(249, 115, 22, 0.04)',
      accent: '#c2410c',
      accent2: '#fb923c',
      pill: 'rgba(194, 65, 12, 0.34)',
      pattern: 'basketball'
    }
  }
  if (/football|soccer|premier|fa cup|mls|champions league|europa|world cup/.test(text)) {
    return {
      key: 'football',
      bg0: '#03140d',
      bg1: '#064e3b',
      bg2: '#020807',
      glow: 'rgba(16, 185, 129, 0.27)',
      glowSoft: 'rgba(16, 185, 129, 0.04)',
      accent: '#dc2626',
      accent2: '#f97316',
      pill: 'rgba(22, 101, 52, 0.38)',
      pattern: 'football'
    }
  }
  return {
    key: 'generic',
    bg0: '#070b16',
    bg1: '#111827',
    bg2: '#020617',
    glow: 'rgba(59, 130, 246, 0.28)',
    glowSoft: 'rgba(59, 130, 246, 0.04)',
    accent: '#b91c1c',
    accent2: '#38bdf8',
    pill: 'rgba(30, 64, 175, 0.34)',
    pattern: 'generic'
  }
}

function broadcastPatternSvg(pattern = 'generic') {
  if (pattern === 'motorsport') {
    const chevrons = Array.from({ length: 6 }, (_, index) => {
      const y = 54 + index * 130
      return `<path d="M -70 ${y} L 238 ${y} L 302 ${y + 72} L 238 ${y + 144} L -70 ${y + 144} Z" fill="rgba(255,255,255,0.075)"/>`
    }).join('')
    const checks = []
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const light = (row + col) % 2 === 0
        checks.push(`<rect x="${432 + col * 22}" y="${132 + row * 22}" width="22" height="22" fill="${light ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.34)'}"/>`)
      }
    }
    return `${chevrons}<g data-role="motorsport-checker">${checks.join('')}</g><path d="M 70 704 C 190 646 278 728 392 658 C 474 608 520 632 602 582" fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="6" stroke-linecap="round"/>`
  }
  if (pattern === 'football') {
    return `<rect x="84" y="150" width="432" height="600" rx="18" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<line x1="84" y1="450" x2="516" y2="450" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<circle cx="300" cy="450" r="76" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<rect x="84" y="286" width="92" height="328" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
<rect x="424" y="286" width="92" height="328" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
<g opacity="0.18">${Array.from({ length: 10 }, (_, index) => `<line x1="${56 + index * 54}" y1="96" x2="${-40 + index * 54}" y2="828" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>`).join('')}</g>`
  }
  if (pattern === 'snooker') {
    return `<rect x="92" y="130" width="416" height="640" rx="34" fill="rgba(0,0,0,0.14)" stroke="rgba(255,255,255,0.09)" stroke-width="4"/>
<circle cx="118" cy="156" r="16" fill="rgba(0,0,0,0.30)" stroke="rgba(255,255,255,0.08)"/>
<circle cx="482" cy="156" r="16" fill="rgba(0,0,0,0.30)" stroke="rgba(255,255,255,0.08)"/>
<circle cx="118" cy="744" r="16" fill="rgba(0,0,0,0.30)" stroke="rgba(255,255,255,0.08)"/>
<circle cx="482" cy="744" r="16" fill="rgba(0,0,0,0.30)" stroke="rgba(255,255,255,0.08)"/>
<circle cx="300" cy="450" r="120" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>
<path d="M 162 706 L 464 252" stroke="rgba(255,255,255,0.13)" stroke-width="4" stroke-linecap="round"/>
<circle cx="236" cy="586" r="15" fill="rgba(255,255,255,0.16)"/><circle cx="322" cy="496" r="12" fill="rgba(255,255,255,0.11)"/><circle cx="390" cy="398" r="10" fill="rgba(255,255,255,0.09)"/>`
  }
  if (pattern === 'basketball') {
    return `<rect x="82" y="126" width="436" height="648" rx="24" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<line x1="82" y1="450" x2="518" y2="450" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<circle cx="300" cy="450" r="74" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<path d="M 216 126 A 84 84 0 0 0 384 126" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<path d="M 216 774 A 84 84 0 0 1 384 774" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
<rect x="238" y="126" width="124" height="142" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
<rect x="238" y="632" width="124" height="142" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
<g opacity="0.16">${Array.from({ length: 9 }, (_, index) => `<line x1="${-80 + index * 92}" y1="128" x2="${120 + index * 92}" y2="772" stroke="rgba(255,255,255,0.16)" stroke-width="1.2"/>`).join('')}</g>`
  }
  return `<g opacity="0.25">${Array.from({ length: 12 }, (_, index) => `<rect x="${-120 + index * 72}" y="126" width="20" height="650" transform="rotate(28 ${-120 + index * 72} 126)" fill="rgba(255,255,255,0.12)"/>`).join('')}</g>
<circle cx="452" cy="230" r="92" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
<circle cx="452" cy="230" r="52" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
<path d="M 64 664 L 224 612 L 318 690 L 536 598" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="4" stroke-linecap="round"/>`
}

function wrapBroadcastTitle(value = '') {
  const words = cleanBroadcastText(value).split(/\s+/).filter(Boolean)
  if (!words.length) return ['Sports']
  const lines = []
  let current = ''
  const maxChars = words.join(' ').length > 42 ? 18 : 22
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  while (lines.length > 3) {
    const last = lines.pop()
    const target = lines.length - 1
    lines[target] = `${lines[target]} ${last}`
  }
  return lines
}

function broadcastTitleLayout(lines = []) {
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
  let fontSize = 54
  if (longest > 24) fontSize = 50
  if (longest > 30) fontSize = 46
  if (longest > 38) fontSize = 42
  if (longest > 48) fontSize = 38
  if (lines.length >= 3) fontSize = Math.min(fontSize, 46)
  const gap = Math.round(fontSize * 1.08)
  const startY = lines.length >= 3 ? 382 : lines.length === 2 ? 398 : 424
  return { fontSize, gap, startY }
}

function broadcastTitleFromEvent(event = {}, m = {}) {
  const home = firstBroadcastText(event.homeTeam, event.home?.name, m.home?.name)
  const away = firstBroadcastText(event.awayTeam, event.away?.name, m.away?.name)
  if (home && away && home.toLowerCase() !== away.toLowerCase()) return `${home} vs ${away}`
  return firstBroadcastText(
    event.eventShort,
    event.event_short,
    event.eventTitle,
    event.title,
    event.eventName,
    event.name,
    m.event_short,
    m.event,
    m.league,
    m.sport,
    'Sports'
  )
}

function compactBroadcastDetail(detail = '', league = '', label = '') {
  let clean = cleanBroadcastText(detail)
  if (!clean) return ''
  for (const prefix of [league, label]) {
    const words = cleanBroadcastText(prefix).split(/\s+/).filter(Boolean)
    for (const word of words) {
      clean = clean.replace(new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '')
    }
  }
  return cleanBroadcastText(clean) || cleanBroadcastText(detail)
}

function broadcastSubtitleFromEvent(event = {}, m = {}, label = '', title = '') {
  const league = firstBroadcastText(event.league, event.competition, m.leagueFull, m.league, label, event.sport, m.sport)
  const detailCandidates = [
    event.date,
    event.localDate,
    event.eventDetail,
    event.detail,
    event.session,
    event.round,
    m.date,
    m.session,
    m.round,
    event.eventShort,
    event.event_short,
    event.eventTitle,
    m.event_short,
    m.event
  ]
  const titleKey = broadcastTextKey(title)
  let detail = ''
  for (const candidate of detailCandidates) {
    const clean = compactBroadcastDetail(candidate, league, label)
    if (!clean) continue
    if (broadcastTextKey(clean) === broadcastTextKey(league)) continue
    detail = clean
    if (broadcastTextKey(clean) !== titleKey) break
  }
  const parts = [league, detail].map(cleanBroadcastText).filter(Boolean)
  const unique = []
  for (const part of parts) {
    if (!unique.some((existing) => broadcastTextKey(existing) === broadcastTextKey(part))) unique.push(part)
  }
  return unique.join(' \u2022 ')
}

function sportGlyph(icon = 'soccer', x = 50, y = 50, size = 100, color = '#fff', opacity = 1, strokeWidth = 2) {
  const shapes = {
    soccer: `<circle cx="50" cy="50" r="38"/><polygon points="50,32 62,40 58,54 42,54 38,40" fill="currentColor" stroke="none"/><line x1="50" y1="32" x2="50" y2="20"/><line x1="62" y1="40" x2="72" y2="34"/><line x1="58" y1="54" x2="68" y2="64"/><line x1="42" y1="54" x2="32" y2="64"/><line x1="38" y1="40" x2="28" y2="34"/>`,
    hockey: `<ellipse cx="50" cy="58" rx="32" ry="10" fill="currentColor" stroke="none"/><ellipse cx="50" cy="54" rx="32" ry="10"/><line x1="18" y1="54" x2="18" y2="58"/><line x1="82" y1="54" x2="82" y2="58"/>`,
    basketball: `<circle cx="50" cy="50" r="38"/><path d="M12,50 Q50,30 88,50"/><path d="M12,50 Q50,70 88,50"/><line x1="50" y1="12" x2="50" y2="88"/>`,
    football: `<ellipse cx="50" cy="50" rx="38" ry="22" transform="rotate(-20 50 50)"/><line x1="38" y1="50" x2="62" y2="50"/><line x1="42" y1="46" x2="42" y2="54"/><line x1="50" y1="44" x2="50" y2="56"/><line x1="58" y1="46" x2="58" y2="54"/>`,
    baseball: `<circle cx="50" cy="50" r="34"/><path d="M22,38 Q40,46 36,72"/><path d="M78,38 Q60,46 64,72"/>`,
    f1: `<path d="M10,60 L30,60 L40,48 L60,48 L70,60 L90,60 L90,68 L70,68 L60,76 L40,76 L30,68 L10,68 Z" fill="currentColor" stroke="none"/><circle cx="30" cy="72" r="6" fill="currentColor" stroke="none"/><circle cx="70" cy="72" r="6" fill="currentColor" stroke="none"/>`,
    motogp: `<path d="M18,66 L34,66 L46,52 L62,52 L74,66 L86,66"/><circle cx="30" cy="70" r="10"/><circle cx="74" cy="70" r="10"/><path d="M44,50 L54,34 L66,40 L62,52"/><circle cx="58" cy="26" r="6" fill="currentColor" stroke="none"/><path d="M52,36 L38,44"/>`,
    motorsport: `<path d="M20,74 C38,34 66,34 84,58"/><path d="M22,74 L88,74"/><path d="M34,62 L42,50 L58,50 L68,62"/><path d="M72,22 L72,58"/><path d="M72,22 L88,28 L72,34"/><circle cx="34" cy="74" r="7" fill="currentColor" stroke="none"/><circle cx="72" cy="74" r="7" fill="currentColor" stroke="none"/>`,
    mma: `<path d="M28,30 L44,30 L44,22 L60,22 L60,30 L72,30 L76,42 L72,68 L60,76 L40,76 L28,68 L24,42 Z"/><line x1="40" y1="44" x2="60" y2="44"/><line x1="40" y1="56" x2="60" y2="56"/>`,
    tennis: `<circle cx="50" cy="50" r="34"/><path d="M22,32 Q50,50 22,68"/><path d="M78,32 Q50,50 78,68"/>`,
    golf: `<circle cx="38" cy="68" r="14" fill="currentColor" stroke="none"/><path d="M48,68 C66,62 76,52 82,38"/><line x1="62" y1="18" x2="62" y2="76"/><path d="M62,18 L84,26 L62,34 Z" fill="currentColor" stroke="none"/>`,
    darts: `<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="25"/><circle cx="50" cy="50" r="10" fill="currentColor" stroke="none"/><line x1="50" y1="12" x2="50" y2="88"/><line x1="12" y1="50" x2="88" y2="50"/>`,
    cycling: `<circle cx="28" cy="68" r="16"/><circle cx="74" cy="68" r="16"/><path d="M28,68 L46,40 L58,68 L42,68 L56,42 L72,68"/><path d="M42,32 L54,32"/><circle cx="58" cy="24" r="7" fill="currentColor" stroke="none"/>`,
    athletics: `<path d="M30,78 C42,62 54,48 70,24"/><path d="M30,78 L50,78"/><path d="M46,56 L68,62"/><path d="M54,46 L42,30"/><circle cx="72" cy="20" r="8" fill="currentColor" stroke="none"/>`,
    cricket: `<path d="M26,76 L72,30"/><path d="M66,24 L80,38 L74,44 L60,30 Z" fill="currentColor" stroke="none"/><circle cx="28" cy="34" r="9"/>`,
    rugby: `<ellipse cx="50" cy="50" rx="36" ry="24" transform="rotate(-28 50 50)"/><path d="M28,50 Q50,40 72,50"/><path d="M28,50 Q50,60 72,50"/>`,
    snooker: `<circle cx="36" cy="62" r="13" fill="currentColor" stroke="none"/><circle cx="58" cy="62" r="13"/><circle cx="48" cy="40" r="13"/><path d="M22,82 L82,22"/>`,
    wrestling: `<rect x="20" y="34" width="60" height="42"/><line x1="20" y1="44" x2="80" y2="44"/><line x1="20" y1="56" x2="80" y2="56"/><line x1="20" y1="68" x2="80" y2="68"/><circle cx="30" cy="34" r="4" fill="currentColor" stroke="none"/><circle cx="70" cy="34" r="4" fill="currentColor" stroke="none"/><circle cx="30" cy="76" r="4" fill="currentColor" stroke="none"/><circle cx="70" cy="76" r="4" fill="currentColor" stroke="none"/>`
  }
  const inner = shapes[icon] || shapes.soccer
  const scale = size / 100
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" color="${color}" opacity="${opacity}">${inner}</g>`
}

function renderEditorial(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const issueNo = (m.date || '').replace(/-/g, '.') || 'SportsMeta'
  const homeLast = m.home.name.split(/\s+/).filter(Boolean).slice(-1)[0] || m.home.name
  const awayLast = m.away.name.split(/\s+/).filter(Boolean).slice(-1)[0] || m.away.name
  const headlineLines = splitLines(m.event_short || m.league || m.sport, 16, 2)
  const paper = '#EFEAE0'
  const ink = '#1a1612'
  const inkSoft = '#4a3d2e'
  const inkDim = '#6b5d48'
  const gold = '#9b7f3a'
  const goldLight = '#d4b76a'
  const slots = [{ role: 'league', left: 20, top: 14, size: 42 }]
  if (m.hasMatchup) {
    slots.push(
      { role: 'home', left: 50, top: 132, size: 116 },
      { role: 'away', left: 234, top: 132, size: 116 }
    )
  } else {
    slots.push({ role: 'league', left: 132, top: 118, size: 136 })
  }
  const plateIdentity = m.hasMatchup
    ? `<circle cx="108" cy="190" r="60" fill="rgba(15,12,10,0.35)" stroke="rgba(255,240,220,0.76)" stroke-width="1.2"/>
  <circle cx="292" cy="190" r="60" fill="rgba(15,12,10,0.35)" stroke="rgba(255,240,220,0.76)" stroke-width="1.2"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="215" text-anchor="middle" font-size="76" fill="#fff" stroke="#111827" stroke-width="5" paint-order="stroke" letter-spacing="1">V</text>
  <text class="sans" x="108" y="282" text-anchor="middle" font-size="8" fill="${paper}" font-weight="800">${e(m.home.name)}</text>
  <text class="sans" x="292" y="282" text-anchor="middle" font-size="8" fill="${paper}" font-weight="800">${e(m.away.name)}</text>`
    : `<circle cx="${SOURCE_W / 2}" cy="190" r="82" fill="rgba(15,12,10,0.35)" stroke="rgba(255,240,220,0.76)" stroke-width="1.2"/>
  <text class="sans" x="${SOURCE_W / 2}" y="282" text-anchor="middle" font-size="8" fill="${paper}" font-weight="800" letter-spacing="1.5">${e((m.session || m.round).toUpperCase())}</text>`
  const inner = `<defs>
    <style>${FONTS_EDITORIAL}</style>
    <linearGradient id="plateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${m.home.secondary}"/>
      <stop offset="35%" stop-color="${m.home.primary}"/>
      <stop offset="65%" stop-color="${m.away.primary}"/>
      <stop offset="100%" stop-color="${m.away.secondary}"/>
    </linearGradient>
    <pattern id="halftone" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="rgba(0,0,0,0.45)"/></pattern>
    <radialGradient id="bloom" cx="30%" cy="25%" r="50%"><stop offset="0%" stop-color="rgba(255,235,200,0.35)"/><stop offset="100%" stop-color="rgba(255,235,200,0)"/></radialGradient>
    <radialGradient id="warmVignette" cx="50%" cy="30%" r="60%"><stop offset="0%" stop-color="rgba(255,240,210,0.5)"/><stop offset="100%" stop-color="rgba(255,240,210,0)"/></radialGradient>
    <pattern id="paper" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.5" fill="rgba(60,40,20,0.05)"/></pattern>
    <linearGradient id="goldRule" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${gold}"/><stop offset="50%" stop-color="${goldLight}"/><stop offset="100%" stop-color="${gold}"/></linearGradient>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="${paper}"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#paper)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#warmVignette)" style="mix-blend-mode:multiply"/>
  <line x1="0" y1="60" x2="${SOURCE_W}" y2="60" stroke="${ink}" stroke-width="0.5"/>
  <text class="bebas" x="62" y="32" font-size="13" fill="${ink}" letter-spacing="0.1em">${e(m.league.toUpperCase())}</text>
  <text class="mono" x="62" y="44" font-size="7" fill="${inkDim}" letter-spacing="2.5">${e(m.sport.toUpperCase())}</text>
  <text class="serif" x="${SOURCE_W - 22}" y="38" text-anchor="end" font-style="italic" font-size="11" fill="${inkDim}">No. ${e(issueNo)}</text>
  <rect x="22" y="76" width="${SOURCE_W - 44}" height="230" fill="url(#plateGrad)"/>
  <rect x="22" y="76" width="${SOURCE_W - 44}" height="230" fill="url(#halftone)" style="mix-blend-mode:multiply"/>
  <rect x="22" y="76" width="${SOURCE_W - 44}" height="230" fill="url(#bloom)"/>
  ${sportGlyph(m.sport_icon, SOURCE_W / 2, 191, 150, 'rgba(255,240,220,0.48)')}
  ${plateIdentity}
  <rect x="22" y="76" width="${SOURCE_W - 44}" height="230" fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
  <rect x="34" y="84" width="64" height="14" fill="rgba(15,12,10,0.78)"/>
  <text class="sans" x="66" y="94" text-anchor="middle" font-size="7" fill="${paper}" letter-spacing="1.5" font-weight="700">PLATE I - LIVE</text>
  <text class="sans" x="22" y="328" font-size="9" fill="${gold}" letter-spacing="2.5" font-weight="700">- A ${e(m.league.toUpperCase())} FEATURE</text>
  ${m.hasMatchup
    ? `<text class="serif" x="22" y="372" font-size="42" font-style="italic" fill="${ink}" letter-spacing="-1">${e(homeLast)}</text>
  <text class="serif" x="22" y="416" font-size="22" fill="${gold}">.</text>
  <text class="serif" x="42" y="416" font-size="42" font-weight="700" fill="${ink}" letter-spacing="-1">${e(awayLast)}</text>`
    : `<text class="serif" x="22" y="372" font-size="${headlineLines.length > 1 ? 30 : 42}" font-style="italic" font-weight="700" fill="${ink}" letter-spacing="-1">${e(headlineLines[0] || m.event_short)}</text>${headlineLines[1] ? `<text class="serif" x="22" y="${headlineLines.length > 1 ? 408 : 416}" font-size="30" font-style="italic" font-weight="700" fill="${ink}" letter-spacing="-1">${e(headlineLines[1])}</text>` : ''}
  <text class="serif" x="22" y="${headlineLines.length > 1 ? 444 : 416}" font-size="22" fill="${gold}" font-style="italic">- ${e((m.session || m.round || m.sport).toUpperCase())}</text>`}
  <text class="serif" x="22" y="${m.hasMatchup ? 456 : 480}" font-size="12" font-style="italic" fill="${inkSoft}">${e(m.hasMatchup ? `${m.round}, written from ${m.venue}.` : `${m.league}, ${m.round || m.session || m.sport}.`)}</text>
  <text class="serif" x="22" y="${m.hasMatchup ? 472 : 498}" font-size="12" font-style="italic" fill="${inkSoft}">On the evening of ${e(m.date || 'matchday')}.</text>
  <rect x="22" y="540" width="${SOURCE_W - 44}" height="1" fill="url(#goldRule)"/>
  <text class="sans" x="22" y="582" font-size="8.5" fill="${ink}" letter-spacing="1.6" font-weight="600">${e(m.venue.toUpperCase())}</text>
  <text class="serif" x="${SOURCE_W - 22}" y="582" text-anchor="end" font-style="italic" font-size="12" fill="${gold}">${e(m.time || m.date)}</text>`
  return wrapTemplateSvg(inner, slots, variant)
}

function renderBroadcast(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const label = broadcastLabelForRender(event, m)
  const palette = broadcastPaletteFor(event, m, label)
  const title = broadcastTitleFromEvent(event, m)
  const titleLines = wrapBroadcastTitle(title)
  const titleLayout = broadcastTitleLayout(titleLines)
  const titleBlock = titleLines.map((line, index) => (
    `<text data-role="broadcast-title" class="broadcast-title" x="50" y="${titleLayout.startY + index * titleLayout.gap}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="${titleLayout.fontSize}" font-weight="800" fill="#ffffff" letter-spacing="0">${e(line)}</text>`
  )).join('\n')
  const subtitle = broadcastSubtitleFromEvent(event, m, label, title)
  const subtitleFont = subtitle.length > 52 ? 14 : subtitle.length > 44 ? 16 : subtitle.length > 34 ? 18 : 20
  const pillWidth = Math.max(88, Math.min(250, Math.round(label.length * 10.6 + 28)))
  const pattern = broadcastPatternSvg(palette.pattern)
  const maybeLive = m.isLive
    ? `<g data-role="broadcast-live" transform="translate(498 54)"><circle cx="0" cy="0" r="5" fill="${palette.accent2}"/><text x="14" y="5" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="12" font-weight="800" fill="#ffffff" letter-spacing="2">LIVE</text></g>`
    : ''
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BROADCAST_W}" height="${BROADCAST_H}" viewBox="0 0 ${BROADCAST_W} ${BROADCAST_H}" role="img" aria-label="${e(title)}">
  <defs>
    <linearGradient id="broadcastBgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg0}"/>
      <stop offset="52%" stop-color="${palette.bg1}"/>
      <stop offset="100%" stop-color="${palette.bg2}"/>
    </linearGradient>
    <radialGradient id="broadcastBgGlow" cx="25%" cy="18%" r="70%">
      <stop offset="0%" stop-color="${palette.glow}"/>
      <stop offset="60%" stop-color="${palette.glowSoft}"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <linearGradient id="broadcastAccentStripe" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.accent}"/>
      <stop offset="58%" stop-color="${palette.accent2}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
    <pattern id="broadcastFineLines" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
      <rect x="0" y="0" width="3" height="18" fill="rgba(255,255,255,0.035)"/>
    </pattern>
  </defs>
  <g data-role="broadcast-layout" data-layout-family="BROADCAST" data-layout-style="sportsmeta-default-poster" data-palette="${e(palette.key)}">
    <rect width="${BROADCAST_W}" height="${BROADCAST_H}" fill="url(#broadcastBgGradient)"/>
    <rect width="${BROADCAST_W}" height="${BROADCAST_H}" fill="url(#broadcastBgGlow)"/>
    <rect width="${BROADCAST_W}" height="${BROADCAST_H}" fill="url(#broadcastFineLines)" opacity="0.44"/>
    <g data-role="broadcast-pattern" opacity="0.9">${pattern}</g>
    <rect data-role="inner-border" x="30" y="30" width="540" height="840" rx="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <rect data-role="accent-top" x="30" y="30" width="540" height="4" rx="2" fill="${palette.accent}"/>
    <rect data-role="accent-bottom" x="30" y="866" width="540" height="4" rx="2" fill="url(#broadcastAccentStripe)"/>
    <g data-role="pill-badge">
      <rect x="42" y="42" width="${pillWidth}" height="34" rx="17" fill="${palette.pill}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <text data-role="broadcast-label" x="56" y="64" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="14" font-weight="700" fill="#ffffff" letter-spacing="2">${e(label)}</text>
    </g>
    ${maybeLive}
    ${titleBlock}
    ${subtitle ? `<text data-role="broadcast-subtitle" x="50" y="812" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="${subtitleFont}" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="1">${e(subtitle.toUpperCase())}</text>` : ''}
    <text data-role="broadcast-wordmark" x="50" y="844" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="12" font-weight="700" fill="rgba(255,255,255,0.55)" letter-spacing="4">${e(BROADCAST_WORDMARK)}</text>
  </g>
</svg>`
  return {
    svg,
    slots: [],
    overlay: ''
  }
}

function renderSportsbook(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: 18, top: 18, size: 32 },
        { role: 'home', left: 24, top: 190, size: 100 },
        { role: 'away', left: 276, top: 190, size: 100 }
      ]
    : [
        { role: 'league', left: 18, top: 18, size: 32 },
        { role: 'league', left: 124, top: 164, size: 152 }
      ]
  const panelY = SOURCE_H - 110
  const board = m.hasMatchup
    ? `<rect x="16" y="106" width="3" height="320" fill="${m.home.primary}" filter="url(#barGlow_L)"/>
  <text class="mono" x="24" y="130" font-size="9" fill="#7B8390" letter-spacing="1.8">&gt;&gt; ${e(m.leftLabel)}</text>
  <circle cx="74" cy="240" r="50" fill="url(#badge_L)" stroke="${m.home.accent}" stroke-width="1.5"/>
  <text class="bebas" x="24" y="350" font-size="38" fill="white" letter-spacing="0.4">${e(m.home.short)}</text>
  <text class="sans" x="24" y="372" font-size="10.5" fill="#D1D5DB">${e(m.home.name)}</text>
  <rect x="${SOURCE_W - 19}" y="106" width="3" height="320" fill="${m.away.primary}" filter="url(#barGlow_R)"/>
  <text class="mono" x="${SOURCE_W - 24}" y="130" text-anchor="end" font-size="9" fill="#7B8390" letter-spacing="1.8">${e(m.rightLabel)} &lt;&lt;</text>
  <circle cx="326" cy="240" r="50" fill="url(#badge_R)" stroke="${m.away.accent}" stroke-width="1.5"/>
  <text class="bebas" x="${SOURCE_W - 24}" y="350" text-anchor="end" font-size="38" fill="white" letter-spacing="0.4">${e(m.away.short)}</text>
  <text class="sans" x="${SOURCE_W - 24}" y="372" text-anchor="end" font-size="10.5" fill="#D1D5DB">${e(m.away.name)}</text>
  <line x1="${SOURCE_W / 2}" y1="116" x2="${SOURCE_W / 2}" y2="220" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
  <line x1="${SOURCE_W / 2}" y1="262" x2="${SOURCE_W / 2}" y2="380" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>
  <circle cx="${SOURCE_W / 2}" cy="240" r="22" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="248" text-anchor="middle" font-size="18" fill="#FCD34D" letter-spacing="0.5">VS</text>`
    : `<rect x="26" y="116" width="${SOURCE_W - 52}" height="260" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.08)"/>
  <text class="mono" x="${SOURCE_W / 2}" y="145" text-anchor="middle" font-size="9" fill="#7B8390" letter-spacing="1.8">${e(m.league.toUpperCase())}</text>
  <circle cx="${SOURCE_W / 2}" cy="228" r="58" fill="url(#badge_L)" stroke="${m.home.accent}" stroke-width="1.5"/>
  ${sportGlyph(m.sport_icon, SOURCE_W / 2, 228, 86, 'white', 0.86)}
  <text class="bebas" x="${SOURCE_W / 2}" y="330" text-anchor="middle" font-size="32" fill="white" letter-spacing="0.8">${e(m.event_short)}</text>
  <text class="sans" x="${SOURCE_W / 2}" y="356" text-anchor="middle" font-size="10.5" fill="#D1D5DB">${e(m.session || m.round)}</text>`
  const inner = `<defs>
    <style>${FONTS_BEBAS_MONO_SANS}</style>
    <radialGradient id="bgRad" cx="50%" cy="0%" r="100%"><stop offset="0%" stop-color="#14181F"/><stop offset="70%" stop-color="#07090C"/></radialGradient>
    <radialGradient id="badge_L" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="${m.home.primary}"/><stop offset="100%" stop-color="${m.home.secondary}"/></radialGradient>
    <radialGradient id="badge_R" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="${m.away.primary}"/><stop offset="100%" stop-color="${m.away.secondary}"/></radialGradient>
    <pattern id="grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/></pattern>
    <radialGradient id="gridMaskGrad"><stop offset="30%" stop-color="white"/><stop offset="80%" stop-color="black"/></radialGradient>
    <mask id="gridMask"><rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#gridMaskGrad)"/></mask>
    <filter id="blur90"><feGaussianBlur stdDeviation="50"/></filter>
    <filter id="barGlow_L"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="barGlow_R"><feGaussianBlur stdDeviation="3"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#bgRad)"/>
  <circle cx="-30" cy="0" r="180" fill="${m.home.primary}" opacity="0.35" filter="url(#blur90)"/>
  <circle cx="${SOURCE_W + 30}" cy="${SOURCE_H}" r="180" fill="${m.away.primary}" opacity="0.35" filter="url(#blur90)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#grid)" mask="url(#gridMask)"/>
  <line x1="0" y1="56" x2="${SOURCE_W}" y2="56" stroke="rgba(255,255,255,0.06)"/>
  <text class="bebas" x="58" y="28" font-size="12" fill="#E6E6E6" letter-spacing="0.1em">${e(m.league.toUpperCase())}</text>
  <text class="mono" x="58" y="40" font-size="7" fill="#9CA3AF" letter-spacing="2.5">${e(m.sport.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W - 18}" y="36" text-anchor="end" font-size="9.5" fill="#5C6573" letter-spacing="1">ID - ${e((m.date || '').replace(/-/g, ''))}</text>
  <line x1="0" y1="86" x2="${SOURCE_W}" y2="86" stroke="rgba(255,255,255,0.04)"/>
  <text class="mono" x="18" y="78" font-size="10" fill="#9CA3AF" letter-spacing="1.5"><tspan fill="#FCD34D">&gt;</tspan> ${e(m.round.toUpperCase())}</text>
  ${board}
  <rect x="16" y="${panelY}" width="${SOURCE_W - 32}" height="94" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)"/>
  <text class="mono" x="26" y="${panelY + 18}" font-size="10" fill="#7B8390" letter-spacing="1.2">VENUE</text>
  <text class="mono" x="${SOURCE_W - 26}" y="${panelY + 18}" text-anchor="end" font-size="10" fill="#E6E6E6">${e(m.venue)}</text>
  <line x1="22" y1="${panelY + 24}" x2="${SOURCE_W - 22}" y2="${panelY + 24}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 2"/>
  <text class="mono" x="26" y="${panelY + 40}" font-size="10" fill="#7B8390" letter-spacing="1.2">DATE</text>
  <text class="mono" x="${SOURCE_W - 26}" y="${panelY + 40}" text-anchor="end" font-size="10" fill="#E6E6E6">${e(m.date)}</text>
  <line x1="22" y1="${panelY + 46}" x2="${SOURCE_W - 22}" y2="${panelY + 46}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 2"/>
  <text class="mono" x="26" y="${panelY + 62}" font-size="10" fill="#7B8390" letter-spacing="1.2">TIME</text>
  <text class="mono" x="${SOURCE_W - 26}" y="${panelY + 62}" text-anchor="end" font-size="10" fill="#E6E6E6">${e(m.time)}</text>
  <line x1="22" y1="${panelY + 68}" x2="${SOURCE_W - 22}" y2="${panelY + 68}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 2"/>
  <text class="mono" x="26" y="${panelY + 84}" font-size="10" fill="#7B8390" letter-spacing="1.2">STATUS</text>
  <text class="mono" x="${SOURCE_W - 26}" y="${panelY + 84}" text-anchor="end" font-size="10" fill="#22C55E">UPCOMING</text>`
  return wrapTemplateSvg(inner, slots, variant)
}

function renderTradingCard(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const serial = `${m.sport.slice(0, 2).toUpperCase()}-${(m.date || '').replace(/-/g, '').slice(2)}-${m.home.short}${m.away.short}`
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: 160, top: 24, size: 42 },
        { role: 'home', left: 48, top: 108, size: 124 },
        { role: 'away', left: 228, top: 218, size: 124 }
      ]
    : [
        { role: 'league', left: 160, top: 24, size: 42 },
        { role: 'league', left: 128, top: 132, size: 144 }
      ]
  const rings = Array.from({ length: 18 }, (_, i) => `<circle cx="200" cy="280" r="${20 + i * 18}" fill="none" stroke="#f8e08e" stroke-width="0.5"/>`).join('')
  const rays = Array.from({ length: 36 }, (_, i) => `<line x1="200" y1="280" x2="${(200 + Math.cos(i * Math.PI / 18) * 320).toFixed(1)}" y2="${(280 + Math.sin(i * Math.PI / 18) * 320).toFixed(1)}" stroke="#f8e08e" stroke-width="0.3" opacity="0.5"/>`).join('')
  const burst = Array.from({ length: 24 }, (_, i) => `<line x1="200" y1="115" x2="${(200 + Math.cos(i / 24 * 2 * Math.PI) * 260).toFixed(1)}" y2="${(115 + Math.sin(i / 24 * 2 * Math.PI) * 260).toFixed(1)}" stroke="#f8e08e" stroke-width="${i % 2 ? 0.6 : 1.2}"/>`).join('')
  const corner = (x, y, sx, sy) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})"><path d="M2 2 L20 2 M2 2 L2 20 M2 2 L14 14 M8 2 L2 8" stroke="#f8e08e" stroke-width="1" fill="none"/><circle cx="14" cy="14" r="2" fill="#f8e08e"/></g>`
  const feature = m.hasMatchup
    ? `<g transform="translate(110 170) rotate(-7)"><circle cx="0" cy="0" r="62" fill="url(#face)" stroke="${m.home.accent}" stroke-width="2" filter="url(#shadow1)"/></g>
  <g transform="translate(${SOURCE_W - 110} 280) rotate(7)"><circle cx="0" cy="0" r="62" fill="${m.away.primary}" stroke="${m.away.accent}" stroke-width="2" filter="url(#shadow1)"/></g>
  <g transform="translate(${SOURCE_W / 2} 225) rotate(45)"><rect x="-38" y="-38" width="76" height="76" fill="url(#diamond)" stroke="#2a1a08" stroke-width="2"/></g>
  <text class="bebas" x="${SOURCE_W / 2}" y="232" text-anchor="middle" font-size="26" fill="#2a1a08" letter-spacing="1">VS</text>
  <rect x="18" y="380" width="${SOURCE_W - 36}" height="80" fill="url(#namePlate)" stroke="#2a1a08" stroke-width="1.5"/>
  <text class="serif" x="${SOURCE_W / 2}" y="406" text-anchor="middle" font-size="16" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.home.name)}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="422" text-anchor="middle" font-size="8" fill="#5a4a1f" letter-spacing="3">- VERSUS -</text>
  <text class="serif" x="${SOURCE_W / 2}" y="448" text-anchor="middle" font-size="16" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.away.name)}</text>`
    : `<g transform="translate(${SOURCE_W / 2} 210)"><circle cx="0" cy="0" r="74" fill="url(#face)" stroke="${m.home.accent}" stroke-width="2" filter="url(#shadow1)"/>${sportGlyph(m.sport_icon, 0, 0, 106, '#fff5d0', 0.82)}</g>
  <rect x="18" y="360" width="${SOURCE_W - 36}" height="104" fill="url(#namePlate)" stroke="#2a1a08" stroke-width="1.5"/>
  <text class="serif" x="${SOURCE_W / 2}" y="396" text-anchor="middle" font-size="19" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.event_short)}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="424" text-anchor="middle" font-size="8" fill="#5a4a1f" letter-spacing="3">- ${e((m.session || m.round).toUpperCase())} -</text>`
  const inner = `<defs>
    <style>.bebas { font-family: 'Bebas Neue', Impact, sans-serif; }.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }.serif { font-family: 'Playfair Display', Georgia, serif; }</style>
    <linearGradient id="foil" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f8e08e"/><stop offset="18%" stop-color="#d4af37"/><stop offset="36%" stop-color="#faf0a8"/><stop offset="54%" stop-color="#b8941f"/><stop offset="72%" stop-color="#f8e08e"/><stop offset="90%" stop-color="#8c6e1c"/><stop offset="100%" stop-color="#d4af37"/></linearGradient>
    <radialGradient id="face" cx="50%" cy="0%" r="100%"><stop offset="0%" stop-color="${m.home.primary}"/><stop offset="35%" stop-color="${m.home.secondary}"/><stop offset="100%" stop-color="#0c0c12"/></radialGradient>
    <linearGradient id="awayWash" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="60%" stop-color="${m.away.secondary}cc"/><stop offset="100%" stop-color="${m.away.primary}"/></linearGradient>
    <linearGradient id="prism" x1="0%" y1="0%" x2="100%" y2="50%"><stop offset="30%" stop-color="rgba(0,0,0,0)"/><stop offset="38%" stop-color="rgba(255,180,255,0.10)"/><stop offset="46%" stop-color="rgba(180,255,255,0.10)"/><stop offset="54%" stop-color="rgba(255,255,180,0.10)"/><stop offset="62%" stop-color="rgba(255,180,180,0.10)"/><stop offset="70%" stop-color="rgba(0,0,0,0)"/></linearGradient>
    <linearGradient id="namePlate" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff5d0"/><stop offset="40%" stop-color="#e6cc7a"/><stop offset="100%" stop-color="#c89a3c"/></linearGradient>
    <linearGradient id="diamond" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff5d0"/><stop offset="60%" stop-color="#d4af37"/><stop offset="100%" stop-color="#8c6e1c"/></linearGradient>
    <filter id="shadow1"><feGaussianBlur in="SourceAlpha" stdDeviation="6"/><feOffset dy="10"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="#1a1108"/>
  <rect x="4" y="4" width="${SOURCE_W - 8}" height="${SOURCE_H - 8}" fill="url(#foil)"/>
  <rect x="10" y="10" width="${SOURCE_W - 20}" height="${SOURCE_H - 20}" fill="none" stroke="rgba(0,0,0,0.4)"/>
  <rect x="12" y="12" width="${SOURCE_W - 24}" height="${SOURCE_H - 24}" fill="url(#face)"/>
  <rect x="12" y="12" width="${SOURCE_W - 24}" height="${SOURCE_H - 24}" fill="url(#prism)" style="mix-blend-mode:screen"/>
  <g opacity="0.18">${rings}${rays}</g>
  <rect x="12" y="${SOURCE_H / 2 + 18}" width="${SOURCE_W - 24}" height="${SOURCE_H / 2 - 30}" fill="url(#awayWash)"/>
  ${corner(20, 20, 1, 1)}${corner(SOURCE_W - 20, 20, -1, 1)}${corner(20, SOURCE_H - 20, 1, -1)}${corner(SOURCE_W - 20, SOURCE_H - 20, -1, -1)}
  <text class="bebas" x="${SOURCE_W / 2 - 2}" y="41" font-size="11" fill="#f8e08e" letter-spacing="0.1em">${e(m.league.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W / 2 - 2}" y="52" font-size="6.5" fill="#f8e08e" opacity="0.8" letter-spacing="2">${e(m.sport.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="80" text-anchor="middle" font-size="8" fill="rgba(255,245,208,0.75)" letter-spacing="2">- ${e(m.round.toUpperCase())} -</text>
  <g opacity="0.3">${burst}</g>
  ${feature}
  <text class="mono" x="22" y="${SOURCE_H - 22}" font-size="8" fill="rgba(255,245,208,0.85)" letter-spacing="1.5">${e(m.venue.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W - 22}" y="${SOURCE_H - 22}" text-anchor="end" font-size="8" fill="rgba(255,245,208,0.85)" letter-spacing="1.5">No. ${e(serial)}</text>`
  return wrapTemplateSvg(inner, slots, variant)
}

function renderBrutalist(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const y32 = SOURCE_H * 0.32
  const y78 = SOURCE_H * 0.78
  const reg = (x, y) => `<g transform="translate(${x} ${y})" style="mix-blend-mode:difference"><line x1="0" y1="-7" x2="0" y2="7" stroke="white" stroke-width="0.6"/><line x1="-7" y1="0" x2="7" y2="0" stroke="white" stroke-width="0.6"/><circle cx="0" cy="0" r="3" fill="none" stroke="white" stroke-width="0.6"/></g>`
  const slots = m.hasMatchup
    ? [{ role: 'league', left: SOURCE_W - 98, top: 22, size: 32 }]
    : [
        { role: 'league', left: SOURCE_W - 98, top: 22, size: 32 },
        { role: 'league', left: 96, top: 190, size: 208 }
      ]
  const middleStrip = m.hasMatchup
    ? `<text class="mono" x="18" y="${SOURCE_H / 2 + 4}" font-size="10" fill="${m.home.primary}" letter-spacing="1.8">* ${e(m.home.short)}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="${SOURCE_H / 2 + 4}" text-anchor="middle" font-size="10" fill="white" letter-spacing="1.8">VS</text>
  <text class="mono" x="${SOURCE_W - 18}" y="${SOURCE_H / 2 + 4}" text-anchor="end" font-size="10" fill="${m.away.primary}" letter-spacing="1.8">${e(m.away.short)} *</text>`
    : `<text class="mono" x="18" y="${SOURCE_H / 2 + 4}" font-size="10" fill="${m.home.primary}" letter-spacing="1.8">* ${e(m.league_code)}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="${SOURCE_H / 2 + 4}" text-anchor="middle" font-size="10" fill="white" letter-spacing="1.8">${e((m.session || m.round).toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W - 18}" y="${SOURCE_H / 2 + 4}" text-anchor="end" font-size="10" fill="${m.away.primary}" letter-spacing="1.8">${e(m.event_short.toUpperCase())} *</text>`
  const footer = m.hasMatchup
    ? `<text class="sans" x="18" y="${SOURCE_H - 50}" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">${e(m.leftLabel)}</text><text class="bebas" x="18" y="${SOURCE_H - 32}" font-size="18" fill="white" letter-spacing="1">${e(m.home.name)}</text><text class="sans" x="${SOURCE_W - 18}" y="${SOURCE_H - 50}" text-anchor="end" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">${e(m.rightLabel)}</text><text class="bebas" x="${SOURCE_W - 18}" y="${SOURCE_H - 32}" text-anchor="end" font-size="18" fill="white" letter-spacing="1">${e(m.away.name)}</text>`
    : `<text class="sans" x="18" y="${SOURCE_H - 50}" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">EVENT</text><text class="bebas" x="18" y="${SOURCE_H - 32}" font-size="18" fill="white" letter-spacing="1">${e(m.event_short)}</text><text class="sans" x="${SOURCE_W - 18}" y="${SOURCE_H - 50}" text-anchor="end" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">SESSION</text><text class="bebas" x="${SOURCE_W - 18}" y="${SOURCE_H - 32}" text-anchor="end" font-size="18" fill="white" letter-spacing="1">${e(m.session || m.round)}</text>`
  const inner = `<defs><style>${FONTS_BEBAS_MONO_SANS}</style></defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="#0F0E0C"/>
  <polygon points="0,0 ${SOURCE_W},0 ${SOURCE_W},${y32} 0,${y78}" fill="${m.home.primary}"/>
  <polygon points="0,${y78} ${SOURCE_W},${y32} ${SOURCE_W},${SOURCE_H} 0,${SOURCE_H}" fill="${m.away.primary}"/>
  <line x1="0" y1="${y78}" x2="${SOURCE_W}" y2="${y32}" stroke="#0F0E0C" stroke-width="4"/>
  <text class="bebas" x="-16" y="240" font-size="340" fill="${m.home.accent}" style="mix-blend-mode:difference" letter-spacing="-15">${e(m.home.initials)}</text>
  <text class="bebas" x="${SOURCE_W + 16}" y="${SOURCE_H - 20}" text-anchor="end" font-size="340" fill="${m.away.accent}" style="mix-blend-mode:difference" letter-spacing="-15">${e(m.away.initials)}</text>
  <g transform="translate(${SOURCE_W / 2} ${SOURCE_H / 2}) rotate(-12)" style="mix-blend-mode:exclusion">${sportGlyph(m.sport_icon, 0, 0, 180, 'white', 0.95)}</g>
  <g transform="translate(${SOURCE_W - 104} 14)"><rect x="0" y="0" width="92" height="46" fill="#0F0E0C" stroke="rgba(255,255,255,0.15)"/><text class="bebas" x="44" y="20" font-size="11" fill="white" letter-spacing="0.1em">${e(m.league.toUpperCase())}</text><text class="mono" x="44" y="32" font-size="6.5" fill="white" opacity="0.65" letter-spacing="2">${e(m.sport.toUpperCase())}</text></g>
  <g transform="translate(28 122) rotate(-6)"><rect x="0" y="0" width="160" height="22" fill="rgba(239,234,224,0.9)" stroke="#0F0E0C" stroke-width="2"/><text class="bebas" x="80" y="16" text-anchor="middle" font-size="13" fill="#0F0E0C" letter-spacing="1">${e(m.round.toUpperCase())}</text></g>
  <rect x="0" y="${SOURCE_H / 2 - 18}" width="${SOURCE_W}" height="36" fill="#0F0E0C"/>
  ${middleStrip}
  ${reg(17, 17)}${reg(SOURCE_W - 17, 17)}${reg(17, SOURCE_H - 17)}${reg(SOURCE_W - 17, SOURCE_H - 17)}
  <g style="mix-blend-mode:difference">${footer}<text class="mono" x="18" y="${SOURCE_H - 14}" font-size="8.5" fill="white" letter-spacing="1.6">${e(m.venue.toUpperCase())}</text><text class="mono" x="${SOURCE_W - 18}" y="${SOURCE_H - 14}" text-anchor="end" font-size="8.5" fill="white" letter-spacing="1.6">${e([m.date, m.time.toUpperCase()].filter(Boolean).join(' / '))}</text></g>`
  return wrapTemplateSvg(inner, slots, variant)
}

function renderTicketStub(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const perfRow = (y) => Array.from({ length: 25 }, (_, i) => 8 + i * 16).filter((x) => x < SOURCE_W).map((x) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#E6DEC9" stroke="rgba(60,40,15,0.35)"/>`).join('')
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: 140, top: 30, size: 44 },
        { role: 'home', left: 42, top: 162, size: 76 },
        { role: 'away', left: 282, top: 162, size: 76 }
      ]
    : [
        { role: 'league', left: 140, top: 30, size: 44 },
        { role: 'league', left: 152, top: 154, size: 96 }
      ]
  const stubY = SOURCE_H - 100
  const feature = m.hasMatchup
    ? `<g transform="translate(80 200)"><circle cx="0" cy="0" r="38" fill="${m.home.primary}" stroke="${m.home.accent}" stroke-width="2"/><rect x="-30" y="46" width="60" height="20" fill="${m.home.primary}"/><text class="bebas" x="0" y="60" text-anchor="middle" font-size="12" fill="${m.home.accent}" letter-spacing="2">${e(m.leftLabel)}</text></g>
  <text class="serif" x="${SOURCE_W / 2}" y="206" text-anchor="middle" font-style="italic" font-size="38" fill="#5a3a1f">x</text>
  <g transform="translate(${SOURCE_W - 80} 200)"><circle cx="0" cy="0" r="38" fill="${m.away.primary}" stroke="${m.away.accent}" stroke-width="2"/><rect x="-30" y="46" width="60" height="20" fill="${m.away.primary}"/><text class="bebas" x="0" y="60" text-anchor="middle" font-size="12" fill="${m.away.accent}" letter-spacing="2">${e(m.rightLabel)}</text></g>
  <line x1="20" y1="305" x2="160" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="${SOURCE_W - 160}" y1="305" x2="${SOURCE_W - 20}" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="310" text-anchor="middle" font-size="13" fill="#5a3a1f" letter-spacing="3">FEATURE</text>
  <text class="bebas" x="${SOURCE_W / 2}" y="346" text-anchor="middle" font-size="24" fill="#1a1410" letter-spacing="1">${e(m.home.name)}</text>
  <text class="serif" x="${SOURCE_W / 2}" y="368" text-anchor="middle" font-style="italic" font-size="14" fill="#9b6f2f">versus</text>
  <text class="bebas" x="${SOURCE_W / 2}" y="394" text-anchor="middle" font-size="24" fill="#1a1410" letter-spacing="1">${e(m.away.name)}</text>`
    : `<g transform="translate(${SOURCE_W / 2} 204)"><circle cx="0" cy="0" r="52" fill="${m.home.primary}" stroke="${m.home.accent}" stroke-width="2"/>${sportGlyph(m.sport_icon, 0, 0, 76, m.home.accent, 0.95)}</g>
  <line x1="20" y1="305" x2="160" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="${SOURCE_W - 160}" y1="305" x2="${SOURCE_W - 20}" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="310" text-anchor="middle" font-size="13" fill="#5a3a1f" letter-spacing="3">EVENT</text>
  <text class="bebas" x="${SOURCE_W / 2}" y="350" text-anchor="middle" font-size="28" fill="#1a1410" letter-spacing="1">${e(m.event_short)}</text>
  <text class="serif" x="${SOURCE_W / 2}" y="378" text-anchor="middle" font-style="italic" font-size="15" fill="#9b6f2f">${e(m.session || m.round)}</text>`
  const inner = `<defs>
    <style>.bebas { font-family: 'Bebas Neue', Impact, sans-serif; }.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }.serif { font-family: 'Playfair Display', Georgia, serif; }.sans { font-family: 'Inter', system-ui, sans-serif; }</style>
    <linearGradient id="mastheadOverlay" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(40,25,10,0.4)"/><stop offset="50%" stop-color="rgba(40,25,10,0)"/><stop offset="100%" stop-color="rgba(40,25,10,0.4)"/></linearGradient>
    <pattern id="paper" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.5" fill="rgba(80,50,20,0.06)"/></pattern>
    <radialGradient id="edgeWear" cx="50%" cy="50%" r="80%"><stop offset="60%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(80,50,20,0.25)"/></radialGradient>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="#E6DEC9"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#paper)"/>
  <rect x="0" y="0" width="${SOURCE_W / 2}" height="100" fill="${m.home.primary}"/>
  <rect x="${SOURCE_W / 2}" y="0" width="${SOURCE_W / 2}" height="100" fill="${m.away.primary}"/>
  <rect x="0" y="0" width="${SOURCE_W}" height="100" fill="url(#mastheadOverlay)" style="mix-blend-mode:multiply"/>
  <line x1="${SOURCE_W / 2}" y1="12" x2="${SOURCE_W / 2}" y2="88" stroke="rgba(0,0,0,0.45)" stroke-width="2"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="22" text-anchor="middle" font-size="9" fill="rgba(255,235,180,0.9)" letter-spacing="3">OFFICIAL - ADMITTANCE</text>
  <g transform="translate(${SOURCE_W / 2 - 60} 30)"><text class="bebas" x="28" y="11" font-size="11" fill="#fff5d0" letter-spacing="2">${e(m.league.toUpperCase())}</text><text class="mono" x="28" y="22" font-size="6" fill="#fff5d0" opacity="0.8" letter-spacing="2">${e(m.sport.toUpperCase())}</text></g>
  <text class="bebas" x="${SOURCE_W / 2}" y="78" text-anchor="middle" font-size="10" fill="rgba(255,245,220,0.85)" letter-spacing="2.5">- ${e(m.round.toUpperCase())} -</text>
  <line x1="0" y1="100" x2="${SOURCE_W}" y2="100" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${perfRow(108)}
  <line x1="0" y1="116" x2="${SOURCE_W}" y2="116" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${feature}
  <text class="mono" x="${SOURCE_W / 2}" y="424" text-anchor="middle" font-size="9.5" fill="#5a3a1f" letter-spacing="1.6">${e(m.venue.toUpperCase())}</text>
  <line x1="0" y1="${SOURCE_H - 117}" x2="${SOURCE_W}" y2="${SOURCE_H - 117}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${perfRow(SOURCE_H - 108)}
  <line x1="0" y1="${SOURCE_H - 100}" x2="${SOURCE_W}" y2="${SOURCE_H - 100}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  <text class="mono" x="22" y="${stubY + 22}" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">DATE</text>
  <text class="mono" x="22" y="${stubY + 38}" font-size="14" fill="#1a1410">${e(m.date)}</text>
  <text class="mono" x="22" y="${stubY + 58}" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">KICKOFF</text>
  <text class="mono" x="22" y="${stubY + 74}" font-size="14" fill="#1a1410">${e(m.time)}</text>
  <text class="sans" x="${SOURCE_W / 2}" y="${stubY + 22}" text-anchor="middle" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">SECTION</text>
  <text class="bebas" x="${SOURCE_W / 2}" y="${stubY + 44}" text-anchor="middle" font-size="22" fill="#1a1410" letter-spacing="1">A - 12 - 4</text>
  <text class="mono" x="${SOURCE_W / 2}" y="${stubY + 62}" text-anchor="middle" font-size="9" fill="#5a3a1f" letter-spacing="1">#${e(m.home.short)}-${e(m.away.short)}-${e((m.date || '').replace(/-/g, '').slice(2))}</text>
  <g transform="translate(${SOURCE_W - 58} ${stubY + 44}) rotate(-7)"><rect x="-32" y="-20" width="64" height="40" fill="none" stroke="#8c1f0f" stroke-width="2.5"/><text class="bebas" x="0" y="-2" text-anchor="middle" font-size="14" fill="#8c1f0f" letter-spacing="2">ADMIT</text><text class="bebas" x="0" y="14" text-anchor="middle" font-size="14" fill="#8c1f0f" letter-spacing="2">ONE</text></g>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#edgeWear)" pointer-events="none"/>`
  return wrapTemplateSvg(inner, slots, variant)
}

function glitchText(text, x, y, size, skew = -3, anchor = 'middle') {
  const t = escapeXml(text)
  return `<g transform="translate(${x} ${y}) skewX(${skew})"><text class="hero" x="-5" y="2" text-anchor="${anchor}" font-size="${size}" fill="#00d9ff" opacity="0.7" filter="url(#blurA)" style="mix-blend-mode:screen" letter-spacing="0.02em">${t}</text><text class="hero" x="5" y="-1" text-anchor="${anchor}" font-size="${size}" fill="#ff0044" opacity="0.75" filter="url(#blurB)" style="mix-blend-mode:screen" letter-spacing="0.02em">${t}</text><text class="hero" x="0" y="0" text-anchor="${anchor}" font-size="${size}" fill="#fff" letter-spacing="0.02em">${t}</text></g>`
}

function splitGlitchText(text, x, y, size, fill = '#fff', anchor = 'start') {
  const t = escapeXml(text)
  return `<g><text class="hero" x="${x - 1}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="#ff0044" opacity="0.85" letter-spacing="0.06em">${t}</text><text class="hero" x="${x + 1}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="#00d9ff" opacity="0.85" letter-spacing="0.06em">${t}</text><text class="hero" x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" letter-spacing="0.06em">${t}</text></g>`
}

function renderGlitch(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const isSingle = !m.hasMatchup
  const tint = m.primary_color || m.home.primary
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: 24, top: 22, size: 34 },
        { role: 'home', left: 24, top: 538, size: 34 },
        { role: 'away', left: 342, top: 538, size: 34 }
      ]
    : [
        { role: 'league', left: 24, top: 22, size: 34 },
        { role: 'league', left: 96, top: 158, size: 208 }
      ]
  const corners = [[14, 14, 0], [SOURCE_W - 14, 14, 90], [14, SOURCE_H - 14, 270], [SOURCE_W - 14, SOURCE_H - 14, 180]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-12 -6 L-12 -12 L-6 -12" stroke="#ff0044" stroke-width="1.2" fill="none"/><path d="M-11 -5 L-11 -11 L-5 -11" stroke="#00d9ff" stroke-width="1" fill="none" opacity="0.7"/></g>`).join('')
  const body = isSingle
    ? `${glitchText(m.event_short.toUpperCase(), SOURCE_W / 2, 240, 88)}<text class="mono" x="${SOURCE_W / 2}" y="290" text-anchor="middle" font-size="11" fill="#fff" letter-spacing="3">${e((m.session || m.round).toUpperCase())}</text><g transform="translate(${SOURCE_W / 2} 360)"><text class="hero" x="-1" y="0" text-anchor="middle" font-size="22" fill="#ff0044" letter-spacing="8">MAIN</text><text class="hero" x="1" y="0" text-anchor="middle" font-size="22" fill="#00d9ff" letter-spacing="8">MAIN</text><text class="hero" x="0" y="0" text-anchor="middle" font-size="22" fill="#fff" letter-spacing="8">MAIN</text></g>`
    : `${glitchText(m.home.short, SOURCE_W / 2, 220, 150)}<text class="hero" x="${SOURCE_W / 2 - 1}" y="298" text-anchor="middle" font-size="28" fill="#ff0044" letter-spacing="6">VS</text><text class="hero" x="${SOURCE_W / 2 + 1}" y="298" text-anchor="middle" font-size="28" fill="#00d9ff" letter-spacing="6">VS</text><text class="hero" x="${SOURCE_W / 2}" y="298" text-anchor="middle" font-size="28" fill="#fff" letter-spacing="6">VS</text>${glitchText(m.away.short, SOURCE_W / 2, 388, 150)}<rect x="-10" y="252" width="${SOURCE_W + 20}" height="6" fill="#0A0A0C" transform="translate(10 0)"/>`
  const taglineText = isSingle ? m.event_short.toUpperCase() : `${m.home.name.toUpperCase()} x ${m.away.name.toUpperCase()}`
  const taglineSize = taglineText.length > 28 ? 13 : 16
  const inner = `<defs>
    <style>.hero { font-family: 'Bebas Neue', Impact, sans-serif; }.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }</style>
    <radialGradient id="bgRad" cx="50%" cy="35%" r="80%"><stop offset="0%" stop-color="${tint}" stop-opacity="0.25"/><stop offset="45%" stop-color="#111114"/><stop offset="100%" stop-color="#050507"/></radialGradient>
    <radialGradient id="bgRad2" cx="50%" cy="35%" r="60%"><stop offset="0%" stop-color="#2a2a30" stop-opacity="0.9"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="50%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.85"/></radialGradient>
    <pattern id="scanFine" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="rgba(255,255,255,0.04)"/></pattern>
    <pattern id="scanCoarse" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="rgba(255,255,255,0.06)"/></pattern>
    <filter id="blurA" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.5"/></filter>
    <filter id="blurB" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.4"/></filter>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="#0A0A0C"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#bgRad)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#bgRad2)"/>
  <rect x="-20" y="110" width="${SOURCE_W + 40}" height="380" fill="url(#scanFine)" opacity="0.6"/>
  <rect x="0" y="0" width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#scanCoarse)" style="mix-blend-mode:overlay"/>
  <rect x="0" y="200" width="${SOURCE_W}" height="18" fill="rgba(255,255,255,0.07)" transform="translate(8 0) skewX(-2)" style="mix-blend-mode:screen"/>
  <rect x="0" y="280" width="${SOURCE_W}" height="6" fill="rgba(255,255,255,0.12)" transform="translate(-12 0)" style="mix-blend-mode:screen"/>
  <rect x="0" y="340" width="${SOURCE_W}" height="10" fill="#ff0044" opacity="0.3" transform="translate(6 0)" style="mix-blend-mode:screen"/>
  <rect x="0" y="358" width="${SOURCE_W}" height="10" fill="#00d9ff" opacity="0.25" transform="translate(-6 0)" style="mix-blend-mode:screen"/>
  <text class="mono" x="68" y="32" font-size="9" fill="#fff" letter-spacing="3">${e(m.league.toUpperCase())}</text>
  <text class="mono" x="68" y="42" font-size="7" fill="#fff" opacity="0.6" letter-spacing="3">${e(m.sport.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W - 24}" y="36" text-anchor="end" font-size="9.5" fill="#ff0044" letter-spacing="3">REC</text>
  <text class="mono" x="24" y="86" font-size="9" fill="#00d9ff" letter-spacing="2.5">&gt; ${e(m.round.toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W - 24}" y="86" text-anchor="end" font-size="9" fill="#fff" opacity="0.65" letter-spacing="2.5">${e(m.date)}</text>
  ${body}
  <g transform="translate(0 504)"><rect x="18" y="0" width="${SOURCE_W - 36}" height="40" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>${splitGlitchText(taglineText, 30, 26, taglineSize)}</g>
  <text class="mono" x="24" y="${SOURCE_H - 22}" font-size="9" fill="#ff0044" letter-spacing="2.5">${e((m.venue || m.sport).split(',')[0].toUpperCase())}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="${SOURCE_H - 22}" text-anchor="middle" font-size="9" fill="#fff" opacity="0.6" letter-spacing="2.5">...</text>
  <text class="mono" x="${SOURCE_W - 24}" y="${SOURCE_H - 22}" text-anchor="end" font-size="9" fill="#00d9ff" letter-spacing="2.5">${e((m.time || m.date).toUpperCase())}</text>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#vignette)" pointer-events="none"/>
  ${corners}`
  return wrapTemplateSvg(inner, slots, variant)
}

function renderSportsPosterTemplateSvg({ event = {}, variant = 'poster', template = 'editorial', theme = {}, mode = '' } = {}) {
  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  let artwork
  if (normalizedTemplate === 'broadcast') artwork = renderBroadcast(event, variant, theme, mode)
  else if (normalizedTemplate === 'sportsbook') artwork = renderSportsbook(event, variant, theme, mode)
  else if (normalizedTemplate === 'trading-card') artwork = renderTradingCard(event, variant, theme, mode)
  else if (normalizedTemplate === 'brutalist') artwork = renderBrutalist(event, variant, theme, mode)
  else if (normalizedTemplate === 'ticket-stub') artwork = renderTicketStub(event, variant, theme, mode)
  else if (normalizedTemplate === 'glitch') artwork = renderGlitch(event, variant, theme, mode)
  else artwork = renderEditorial(event, variant, theme, mode)
  return {
    ...artwork,
    template: normalizedTemplate,
    layoutFamily: layoutFamilyForSportsPosterTemplate(normalizedTemplate)
  }
}

function sportGlyphMarkup(icon = 'sports', size = 256) {
  const mapped = icon === 'football' ? 'soccer' : icon
  return sportGlyph(mapped, size / 2, size / 2, size * 0.78, '#ffffff', 1, Math.max(4, Math.round(size * 0.02)))
}

function renderLogoGlyphSvg({ role = 'league', event = {}, theme = {}, size = 256 } = {}) {
  const facts = eventFacts(event)
  const icon = sportIconFor(event, facts)
  const primary = role === 'away' ? (theme.awayColor || '#123c69') : (theme.homeColor || '#0f766e')
  const secondary = role === 'league' ? (theme.accentColor || '#b58b2a') : (theme.accentColor || '#f5d76e')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><radialGradient id="g" cx="35%" cy="30%" r="78%"><stop offset="0" stop-color="${secondary}"/><stop offset="1" stop-color="${primary}"/></radialGradient></defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="rgba(2,6,23,0)"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.43}" fill="url(#g)" stroke="rgba(255,255,255,0.78)" stroke-width="${Math.max(3, Math.round(size * 0.03))}"/>
  ${sportGlyphMarkup(icon, size)}
</svg>`
}

module.exports = {
  SPORTS_POSTER_TEMPLATES,
  SPORTS_POSTER_LAYOUT_FAMILIES,
  TEMPLATE_LABELS,
  isBroadcastLayoutFamily,
  layoutFamilyForSportsPosterTemplate,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate,
  renderLogoGlyphSvg,
  renderSportsPosterTemplateSvg
}
