const { renderSportSurfaceOutline } = require('./sportsCardArtwork')

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
  motogp: 'MGP',
  'moto gp': 'MGP',
  'formula 1': 'F1',
  'formula one': 'F1',
  f1: 'F1',
  wimbledon: 'ATP'
})

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value) {
  return normalizeSpace(value).toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
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

function resolveSportsPosterTemplate(...values) {
  for (const value of values) {
    const raw = normalizeSpace(value)
    if (raw) return normalizeSportsPosterTemplate(raw)
  }
  return normalizeSportsPosterTemplate(process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE || 'ticket-stub')
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

function renderTextLines(lines = [], x, y, options = {}) {
  const fontSize = Number(options.fontSize || 30)
  const lineHeight = Number(options.lineHeight || Math.round(fontSize * 1.18))
  const anchor = options.anchor || 'middle'
  const weight = options.weight || 800
  const fill = options.fill || '#f8fafc'
  const family = options.family || 'Arial, Helvetica, sans-serif'
  const style = options.style ? ` font-style="${options.style}"` : ''
  const letterSpacing = options.letterSpacing !== undefined ? ` letter-spacing="${options.letterSpacing}"` : ' letter-spacing="0"'
  const stroke = options.stroke
    ? ` stroke="${options.stroke}" stroke-width="${options.strokeWidth || 4}" paint-order="stroke" stroke-linejoin="round"`
    : ''
  return lines.map((line, index) =>
    `<text x="${Math.round(x)}" y="${Math.round(y + (index * lineHeight))}" text-anchor="${anchor}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}"${letterSpacing} fill="${fill}"${style}${stroke}>${escapeXml(line)}</text>`
  ).join('\n')
}

function titleForEvent(event = {}) {
  const home = normalizeSpace(event.homeTeam)
  const away = normalizeSpace(event.awayTeam)
  if (home && away) return `${home} vs ${away}`
  return normalizeSpace(event.title || event.name || event.eventName || event.league || event.sport || 'Sports Event')
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

function leagueCodeFor(event = {}, league = '') {
  const explicit = normalizeSpace(event.leagueCode || event.league_code || event.competitionCode)
  if (explicit) return explicit.slice(0, 5).toUpperCase()
  const normalized = normalizeSpace(league || event.league || event.competition).toLowerCase()
  if (LEAGUE_CODE_ALIASES[normalized]) return LEAGUE_CODE_ALIASES[normalized]
  return shortFor(normalized || event.sport, 'SP')
}

function detailForEvent(event = {}) {
  return normalizeSpace(event.eventDetail || event.detail || event.session || event.round || '')
}

function sportIconFor(event = {}, facts = {}) {
  const text = `${event.sportIcon || ''} ${facts.sport || ''} ${facts.league || ''} ${facts.detail || ''}`.toLowerCase()
  if (/formula|f1/.test(text)) return 'f1'
  if (/moto\s*gp|motogp|motor/.test(text)) return 'f1'
  if (/american.*football|nfl/.test(text)) return 'american-football'
  if (/football|soccer|premier|fa cup|mls/.test(text)) return 'football'
  if (/hockey|nhl/.test(text)) return 'hockey'
  if (/basketball|nba/.test(text)) return 'basketball'
  if (/baseball|mlb/.test(text)) return 'baseball'
  if (/cricket|ipl/.test(text)) return 'cricket'
  if (/tennis|wimbledon/.test(text)) return 'tennis'
  if (/snooker/.test(text)) return 'snooker'
  if (/boxing/.test(text)) return 'boxing'
  if (/mma|ufc/.test(text)) return 'mma'
  if (/wrestling|wwe/.test(text)) return 'wrestling'
  if (/golf|pga/.test(text)) return 'golf'
  if (/rugby/.test(text)) return 'rugby'
  return 'sports'
}

function eventFacts(event = {}) {
  const sport = normalizeSpace(event.sport) || 'Sports'
  const league = normalizeSpace(event.league || event.competition)
  const facts = {
    sport,
    league,
    leagueCode: leagueCodeFor(event, league),
    home: normalizeSpace(event.homeTeam),
    away: normalizeSpace(event.awayTeam),
    homeShort: normalizeSpace(event.homeShort || event.homeCode || event.home?.short),
    awayShort: normalizeSpace(event.awayShort || event.awayCode || event.away?.short),
    homeInitials: normalizeSpace(event.homeInitials || event.home?.initials),
    awayInitials: normalizeSpace(event.awayInitials || event.away?.initials),
    title: titleForEvent(event),
    detail: detailForEvent(event),
    date: normalizeSpace(event.date || event.localDate),
    venue: normalizeSpace(event.venue),
    time: normalizeSpace(event.time || event.timestamp),
    round: normalizeSpace(event.round),
    season: normalizeSpace(event.season),
    seeders: normalizeSpace(event.seeders),
    size: normalizeSpace(event.size)
  }
  facts.homeShort = facts.homeShort || shortFor(facts.home, 'H')
  facts.awayShort = facts.awayShort || shortFor(facts.away, 'A')
  facts.homeInitials = facts.homeInitials || initialsFor(facts.home, facts.homeShort)
  facts.awayInitials = facts.awayInitials || initialsFor(facts.away, facts.awayShort)
  facts.sportIcon = sportIconFor(event, facts)
  return facts
}

function dimensionsFor(variant = 'poster') {
  if (variant === 'background') return { width: 1920, height: 1080 }
  if (variant === 'landscape') return { width: 1280, height: 720 }
  return { width: 600, height: 900 }
}

function layoutForVariant(variant = 'poster') {
  const dims = dimensionsFor(variant)
  const portrait = dims.height > dims.width
  return {
    ...dims,
    portrait,
    safe: Math.round(Math.min(dims.width, dims.height) * (portrait ? 0.055 : 0.045))
  }
}

function clampSlot(slot, width, height) {
  const size = Math.max(8, Math.round(slot.size || Math.min(width, height) * 0.2))
  return {
    role: slot.role,
    size,
    left: Math.max(0, Math.min(width - size, Math.round(slot.left))),
    top: Math.max(0, Math.min(height - size, Math.round(slot.top)))
  }
}

function buildDefs({ homeColor, awayColor, accentColor, paper = false, dark = false } = {}) {
  const home = homeColor || '#0f766e'
  const away = awayColor || '#123c69'
  const accent = accentColor || '#b58b2a'
  return `<defs>
    <linearGradient id="splitBg" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${home}"/>
      <stop offset="0.5" stop-color="${home}"/>
      <stop offset="0.5" stop-color="${away}"/>
      <stop offset="1" stop-color="${away}"/>
    </linearGradient>
    <linearGradient id="diagonalSplit" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${home}"/>
      <stop offset="0.5" stop-color="#060810"/>
      <stop offset="1" stop-color="${away}"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="0.52" stop-color="rgba(255,255,255,0.03)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.44)"/>
    </linearGradient>
    <linearGradient id="darkBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#14181f"/>
      <stop offset="0.6" stop-color="#07090c"/>
      <stop offset="1" stop-color="${away}"/>
    </linearGradient>
    <linearGradient id="foil" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8e08e"/>
      <stop offset="0.18" stop-color="#d4af37"/>
      <stop offset="0.36" stop-color="#faf0a8"/>
      <stop offset="0.54" stop-color="#b8941f"/>
      <stop offset="0.72" stop-color="#f8e08e"/>
      <stop offset="1" stop-color="#8c6e1c"/>
    </linearGradient>
    <linearGradient id="ticketFade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${home}"/>
      <stop offset="1" stop-color="${away}"/>
    </linearGradient>
    <pattern id="diagonal" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
      <rect width="46" height="46" fill="transparent"/>
      <rect width="11" height="46" fill="rgba(255,255,255,0.055)"/>
    </pattern>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.15" fill="rgba(15,23,42,0.28)"/>
    </pattern>
    <pattern id="paper" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="#f4efe4"/>
      <circle cx="2" cy="2" r="0.9" fill="rgba(31,41,55,0.06)"/>
      <circle cx="11" cy="8" r="0.8" fill="rgba(31,41,55,0.045)"/>
      <circle cx="7" cy="15" r="0.7" fill="rgba(31,41,55,0.04)"/>
    </pattern>
    <radialGradient id="softGlow" cx="50%" cy="35%" r="65%">
      <stop offset="0" stop-color="${accent}" stop-opacity="${dark ? '0.24' : '0.17'}"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow"><feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dy="7"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`
}

function surfaceSvg(facts, box, theme = {}, opacity = 0.36) {
  return renderSportSurfaceOutline({
    sport: facts.sport,
    competition: facts.league,
    title: facts.title,
    detail: facts.detail,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    highlight: '#f8fafc',
    accent: theme.accentColor || '#b58b2a',
    text: '#f8fafc',
    opacity
  })
}

function renderVersusOverlay({ width, height, x, y, w, h, label = 'V', color = '#ffffff', stroke = '#020617', opacity = 1 }) {
  const cx = Math.round(x + w / 2)
  const cy = Math.round(y + h * 0.5)
  const fontSize = Math.round(Math.min(w, h) * 0.24)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${cx}" y="${Math.round(cy + fontSize * 0.32)}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" letter-spacing="0" stroke="${stroke}" stroke-width="${Math.max(8, Math.round(fontSize * 0.14))}" stroke-linejoin="round" paint-order="stroke" fill="${color}" opacity="${opacity}">${escapeXml(label)}</text>
</svg>`
}

function logoBackdrop(slot, options = {}) {
  const cx = Math.round(slot.left + slot.size / 2)
  const cy = Math.round(slot.top + slot.size / 2)
  const r = Math.round(slot.size * 0.52)
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${options.fill || 'rgba(255,255,255,0.10)'}" stroke="${options.stroke || 'rgba(255,255,255,0.28)'}" stroke-width="${Math.max(2, Math.round(slot.size * 0.025))}"/>`
}

function editorialLayout(width, height, portrait) {
  return portrait
    ? { headerH: 112, visual: { x: 48, y: 166, width: width - 96, height: 360 }, titleY: 610 }
    : { headerH: 124, visual: { x: Math.round(width * 0.43), y: 142, width: Math.round(width * 0.52), height: height - 246 }, titleY: 252 }
}

function templateEditorial(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const accent = theme.accentColor || '#9a6a16'
  const layout = editorialLayout(width, height, portrait)
  const visual = layout.visual
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 88 : 108, left: safe, top: portrait ? 22 : 20 }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 190 : 270, left: visual.x + visual.width * 0.25 - (portrait ? 95 : 135), top: visual.y + visual.height * 0.44 - (portrait ? 95 : 135) }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 190 : 270, left: visual.x + visual.width * 0.75 - (portrait ? 95 : 135), top: visual.y + visual.height * 0.44 - (portrait ? 95 : 135) }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 250 : 340, left: visual.x + visual.width * 0.5 - (portrait ? 125 : 170), top: visual.y + visual.height * 0.37 - (portrait ? 125 : 170) }, width, height)
  const title = hasMatchup ? facts.title : normalizeSpace(facts.title || facts.league || facts.sport)
  const titleLines = splitLines(title, portrait ? 25 : 32, 2)
  const story = [facts.round ? `Round ${facts.round}` : '', facts.venue, facts.time].filter(Boolean).join(', ')
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs({ ...theme, paper: true })}
  <rect width="${width}" height="${height}" fill="url(#paper)"/>
  <line x1="0" y1="${layout.headerH}" x2="${width}" y2="${layout.headerH}" stroke="#1f2937" stroke-width="${portrait ? 2 : 4}"/>
  ${hasMatchup ? '' : logoBackdrop(singleSlot, { fill: 'rgba(17,24,39,0.12)', stroke: 'rgba(17,24,39,0.22)' })}
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${portrait ? 56 : 62}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 36 : 52}" font-weight="900" fill="#111827">${escapeXml(facts.league || facts.sport)}</text>
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${portrait ? 86 : 99}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 17 : 24}" font-weight="700" letter-spacing="6" fill="#374151">${escapeXml(facts.sport.toUpperCase())}</text>
  <text x="${width - safe}" y="${portrait ? 66 : 80}" text-anchor="end" font-family="Georgia, serif" font-size="${portrait ? 23 : 32}" font-style="italic" fill="${accent}">${escapeXml(facts.date || 'Sports Posters')}</text>
  <rect x="${visual.x}" y="${visual.y}" width="${visual.width}" height="${visual.height}" fill="${hasMatchup ? 'url(#splitBg)' : 'url(#diagonalSplit)'}"/>
  <rect x="${visual.x}" y="${visual.y}" width="${visual.width}" height="${visual.height}" fill="url(#shade)"/>
  <rect x="${visual.x}" y="${visual.y}" width="${visual.width}" height="${visual.height}" fill="url(#dots)" opacity="0.42"/>
  ${surfaceSvg(facts, { x: visual.x + visual.width * 0.12, y: visual.y + visual.height * 0.16, width: visual.width * 0.76, height: visual.height * 0.48 }, theme, 0.42)}
  ${hasMatchup ? `<line x1="${visual.x + visual.width / 2}" y1="${visual.y}" x2="${visual.x + visual.width / 2}" y2="${visual.y + visual.height}" stroke="rgba(0,0,0,0.5)" stroke-width="${portrait ? 7 : 10}"/>` : ''}
  <rect x="${visual.x + 18}" y="${visual.y + 22}" width="${portrait ? 132 : 172}" height="${portrait ? 42 : 54}" fill="rgba(17,24,39,0.78)"/>
  <text x="${visual.x + 42}" y="${visual.y + (portrait ? 52 : 58)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 22 : 30}" font-weight="900" letter-spacing="8" fill="#ffffff">${escapeXml((facts.detail || 'LIVE').toUpperCase())}</text>
  ${hasMatchup ? renderTextLines(splitLines(facts.home, portrait ? 18 : 28, portrait ? 2 : 1), visual.x + visual.width * 0.25, visual.y + visual.height - (portrait ? 42 : 32), { fontSize: portrait ? 25 : 32, lineHeight: portrait ? 29 : 38, fill: '#ffffff', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 6 }) : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.away, portrait ? 18 : 28, portrait ? 2 : 1), visual.x + visual.width * 0.75, visual.y + visual.height - (portrait ? 42 : 32), { fontSize: portrait ? 25 : 32, lineHeight: portrait ? 29 : 38, fill: '#ffffff', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 6 }) : ''}
  <line x1="${visual.x + 22}" y1="${visual.y + visual.height + (portrait ? 50 : 42)}" x2="${visual.x + visual.width - 22}" y2="${visual.y + visual.height + (portrait ? 50 : 42)}" stroke="${accent}" stroke-width="${portrait ? 5 : 6}"/>
  ${renderTextLines(titleLines, safe, layout.titleY, { anchor: 'start', fontSize: portrait ? 58 : 70, lineHeight: portrait ? 66 : 78, weight: 500, family: 'Georgia, serif', style: 'italic', fill: '#161616' })}
  <text x="${safe}" y="${height - (portrait ? 158 : 86)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 18 : 25}" font-weight="800" letter-spacing="8" fill="${accent}">${escapeXml([facts.round ? `Round ${facts.round}` : '', facts.date].filter(Boolean).join(' | ').toUpperCase())}</text>
  ${story ? `<text x="${safe}" y="${height - (portrait ? 104 : 46)}" font-family="Georgia, serif" font-size="${portrait ? 24 : 32}" font-style="italic" fill="#27272a">${escapeXml(splitLines(story, portrait ? 48 : 80, 1)[0])}</text>` : ''}
  <line x1="${safe}" y1="${height - (portrait ? 78 : 36)}" x2="${width - safe}" y2="${height - (portrait ? 78 : 36)}" stroke="${accent}" stroke-width="${portrait ? 4 : 5}"/>
  <text x="${safe}" y="${height - (portrait ? 36 : 14)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 19 : 24}" font-weight="900" letter-spacing="8" fill="#111827">${escapeXml((facts.venue || facts.league || facts.sport).toUpperCase())}</text>
  <text x="${width - safe}" y="${height - (portrait ? 36 : 14)}" text-anchor="end" font-family="Georgia, serif" font-size="${portrait ? 24 : 30}" font-style="italic" fill="${accent}">${escapeXml(facts.time || facts.date)}</text>
</svg>`
  return {
    svg,
    slots,
    overlay: hasMatchup ? renderVersusOverlay({ width, height, x: visual.x, y: visual.y, w: visual.width, h: visual.height }) : ''
  }
}

function templateBroadcast(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const panel = portrait
    ? { x: safe, y: 150, width: width - safe * 2, height: 520 }
    : { x: safe, y: 118, width: width - safe * 2, height: height - 214 }
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 76 : 96, left: safe, top: safe }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 184 : 286, left: panel.x + panel.width * 0.27 - (portrait ? 92 : 143), top: panel.y + panel.height * 0.39 - (portrait ? 92 : 143) }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 184 : 286, left: panel.x + panel.width * 0.73 - (portrait ? 92 : 143), top: panel.y + panel.height * 0.39 - (portrait ? 92 : 143) }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 250 : 360, left: panel.x + panel.width / 2 - (portrait ? 125 : 180), top: panel.y + panel.height * 0.33 - (portrait ? 125 : 180) }, width, height)
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const lowerTop = portrait ? height - 180 : height - 128
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs({ ...theme, dark: true })}
  <rect width="${width}" height="${height}" fill="#02050d"/>
  <polygon points="0,0 ${width * 0.64},0 ${width * 0.42},${height} 0,${height}" fill="${theme.homeColor || '#0f766e'}"/>
  <polygon points="${width * 0.58},0 ${width},0 ${width},${height} ${width * 0.36},${height}" fill="${theme.awayColor || '#123c69'}"/>
  <rect width="${width}" height="${height}" fill="url(#shade)"/>
  <rect width="${width}" height="${height}" fill="url(#diagonal)" opacity="0.22"/>
  ${surfaceSvg(facts, { x: safe, y: safe, width: width - safe * 2, height: height - safe * 2 }, theme, 0.14)}
  ${hasMatchup ? '' : logoBackdrop(singleSlot, { fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.24)' })}
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${safe + (portrait ? 34 : 48)}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 29 : 48}" font-weight="950" fill="#ffffff">${escapeXml(facts.league || facts.sport)}</text>
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${safe + (portrait ? 64 : 88)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 16 : 25}" font-weight="800" letter-spacing="5" fill="${theme.accentColor || '#f5d76e'}">${escapeXml([facts.date, facts.detail || facts.round].filter(Boolean).join(' | ').toUpperCase())}</text>
  <circle cx="${width - safe - 18}" cy="${safe + 22}" r="${portrait ? 7 : 10}" fill="#ef4444"/>
  <text x="${width - safe - 34}" y="${safe + (portrait ? 28 : 33)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 14 : 20}" font-weight="900" letter-spacing="4" fill="#ffffff">LIVE</text>
  <rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" fill="rgba(2,6,23,0.36)" stroke="rgba(255,255,255,0.18)" stroke-width="${portrait ? 3 : 5}"/>
  ${hasMatchup ? `<line x1="${panel.x + panel.width / 2}" y1="${panel.y + 28}" x2="${panel.x + panel.width / 2}" y2="${panel.y + panel.height - 28}" stroke="rgba(255,255,255,0.26)" stroke-width="${portrait ? 4 : 7}"/>` : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.home, portrait ? 18 : 28, 2), panel.x + panel.width * 0.24, panel.y + panel.height - (portrait ? 104 : 68), { fontSize: portrait ? 24 : 38, lineHeight: portrait ? 29 : 45, fill: '#ffffff', stroke: '#020617', strokeWidth: 7 }) : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.away, portrait ? 18 : 28, 2), panel.x + panel.width * 0.76, panel.y + panel.height - (portrait ? 104 : 68), { fontSize: portrait ? 24 : 38, lineHeight: portrait ? 29 : 45, fill: '#ffffff', stroke: '#020617', strokeWidth: 7 }) : ''}
  <rect x="0" y="${lowerTop}" width="${width}" height="${height - lowerTop}" fill="rgba(0,0,0,0.82)"/>
  <text x="${safe}" y="${lowerTop + (portrait ? 60 : 50)}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 37 : 60}" font-weight="950" fill="#ffffff">${escapeXml(splitLines(facts.title, portrait ? 24 : 42, 1)[0])}</text>
  <text x="${safe}" y="${lowerTop + (portrait ? 106 : 94)}" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 19 : 28}" font-weight="800" fill="${theme.accentColor || '#f5d76e'}">${escapeXml([facts.venue, facts.time].filter(Boolean).join(' | '))}</text>
</svg>`
  return {
    svg,
    slots,
    overlay: hasMatchup ? renderVersusOverlay({ width, height, x: panel.x, y: panel.y, w: panel.width, h: panel.height, label: 'VS', color: '#f8fafc' }) : ''
  }
}

function templateSportsbook(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 72 : 96, left: safe, top: safe }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 170 : 250, left: width * 0.28 - (portrait ? 85 : 125), top: portrait ? 250 : 205 }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 170 : 250, left: width * 0.72 - (portrait ? 85 : 125), top: portrait ? 250 : 205 }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 230 : 330, left: width / 2 - (portrait ? 115 : 165), top: portrait ? 220 : 170 }, width, height)
  const panelY = portrait ? 650 : height - 164
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs({ ...theme, dark: true })}
  <rect width="${width}" height="${height}" fill="url(#darkBg)"/>
  <circle cx="-40" cy="0" r="${portrait ? 250 : 360}" fill="${theme.homeColor || '#0f766e'}" opacity="0.28"/>
  <circle cx="${width + 40}" cy="${height}" r="${portrait ? 250 : 380}" fill="${theme.awayColor || '#123c69'}" opacity="0.30"/>
  <rect width="${width}" height="${height}" fill="url(#diagonal)" opacity="0.14"/>
  <line x1="0" y1="${portrait ? 102 : 112}" x2="${width}" y2="${portrait ? 102 : 112}" stroke="rgba(255,255,255,0.08)"/>
  ${hasMatchup ? '' : logoBackdrop(singleSlot, { fill: 'rgba(255,255,255,0.08)', stroke: 'rgba(255,255,255,0.22)' })}
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${safe + (portrait ? 34 : 48)}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 28 : 46}" font-weight="950" fill="#e5e7eb">${escapeXml(facts.league || facts.sport)}</text>
  <text x="${safe + (hasMatchup ? leagueSlot.size + 18 : 0)}" y="${safe + (portrait ? 62 : 88)}" font-family="Consolas, monospace" font-size="${portrait ? 14 : 22}" font-weight="700" letter-spacing="5" fill="#9ca3af">${escapeXml(facts.sport.toUpperCase())}</text>
  <text x="${width - safe}" y="${safe + (portrait ? 46 : 68)}" text-anchor="end" font-family="Consolas, monospace" font-size="${portrait ? 16 : 24}" font-weight="800" fill="#5c6573">ID ${escapeXml((facts.date || '').replace(/-/g, ''))}</text>
  ${surfaceSvg(facts, { x: safe, y: portrait ? 146 : 132, width: width - safe * 2, height: portrait ? 430 : height - 340 }, theme, 0.24)}
  ${hasMatchup ? logoBackdrop(homeSlot, { fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.24)' }) : ''}
  ${hasMatchup ? logoBackdrop(awaySlot, { fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.24)' }) : ''}
  ${hasMatchup ? `<line x1="${width / 2}" y1="${portrait ? 190 : 170}" x2="${width / 2}" y2="${portrait ? 538 : height - 210}" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>` : ''}
  ${hasMatchup ? `<text x="${width / 2}" y="${portrait ? 406 : 330}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 34 : 54}" font-weight="950" fill="${theme.accentColor || '#f5d76e'}">VS</text>` : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.home, portrait ? 18 : 28, 2), safe, portrait ? 572 : height - 230, { anchor: 'start', fontSize: portrait ? 27 : 40, lineHeight: portrait ? 32 : 46, fill: '#ffffff' }) : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.away, portrait ? 18 : 28, 2), width - safe, portrait ? 572 : height - 230, { anchor: 'end', fontSize: portrait ? 27 : 40, lineHeight: portrait ? 32 : 46, fill: '#ffffff' }) : ''}
  <rect x="${safe}" y="${panelY}" width="${width - safe * 2}" height="${height - panelY - safe}" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.08)" stroke-width="${portrait ? 2 : 3}"/>
  <text x="${safe + 18}" y="${panelY + (portrait ? 34 : 42)}" font-family="Consolas, monospace" font-size="${portrait ? 16 : 24}" font-weight="800" fill="#7b8390" letter-spacing="4">VENUE</text>
  <text x="${width - safe - 18}" y="${panelY + (portrait ? 34 : 42)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 18 : 26}" font-weight="800" fill="#e5e7eb">${escapeXml(facts.venue || facts.title)}</text>
  <line x1="${safe + 18}" y1="${panelY + (portrait ? 54 : 66)}" x2="${width - safe - 18}" y2="${panelY + (portrait ? 54 : 66)}" stroke="rgba(255,255,255,0.07)" stroke-dasharray="5 5"/>
  <text x="${safe + 18}" y="${panelY + (portrait ? 88 : 106)}" font-family="Consolas, monospace" font-size="${portrait ? 16 : 24}" font-weight="800" fill="#7b8390" letter-spacing="4">DATE</text>
  <text x="${width - safe - 18}" y="${panelY + (portrait ? 88 : 106)}" text-anchor="end" font-family="Consolas, monospace" font-size="${portrait ? 18 : 26}" font-weight="800" fill="#e5e7eb">${escapeXml(facts.date || facts.time)}</text>
  <text x="${safe + 18}" y="${height - safe - 14}" font-family="Consolas, monospace" font-size="${portrait ? 16 : 24}" font-weight="800" fill="#22c55e">STATUS LIVE</text>
</svg>`
  return { svg, slots, overlay: '' }
}

function templateTradingCard(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 68 : 88, left: width / 2 - (portrait ? 34 : 44), top: portrait ? 32 : 24 }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 182 : 268, left: width * 0.3 - (portrait ? 91 : 134), top: portrait ? 190 : 158 }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 182 : 268, left: width * 0.7 - (portrait ? 91 : 134), top: portrait ? 330 : 210 }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 250 : 360, left: width / 2 - (portrait ? 125 : 180), top: portrait ? 205 : 152 }, width, height)
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const nameY = portrait ? 590 : height - 172
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs({ ...theme, dark: true })}
  <rect width="${width}" height="${height}" fill="#1a1108"/>
  <rect x="${safe * 0.2}" y="${safe * 0.2}" width="${width - safe * 0.4}" height="${height - safe * 0.4}" fill="url(#foil)"/>
  <rect x="${safe * 0.55}" y="${safe * 0.55}" width="${width - safe * 1.1}" height="${height - safe * 1.1}" fill="url(#darkBg)"/>
  <rect x="${safe * 0.55}" y="${height * 0.52}" width="${width - safe * 1.1}" height="${height * 0.44}" fill="${theme.awayColor || '#123c69'}" opacity="0.45"/>
  <rect width="${width}" height="${height}" fill="url(#softGlow)"/>
  ${surfaceSvg(facts, { x: safe, y: portrait ? 112 : 86, width: width - safe * 2, height: portrait ? 395 : height - 280 }, theme, 0.16)}
  ${hasMatchup ? logoBackdrop(homeSlot, { fill: 'rgba(255,255,255,0.09)', stroke: '#f8e08e' }) : logoBackdrop(singleSlot, { fill: 'rgba(255,255,255,0.09)', stroke: '#f8e08e' })}
  ${hasMatchup ? logoBackdrop(awaySlot, { fill: 'rgba(255,255,255,0.09)', stroke: '#f8e08e' }) : ''}
  <text x="${width / 2}" y="${portrait ? 130 : 108}" text-anchor="middle" font-family="Consolas, monospace" font-size="${portrait ? 15 : 23}" font-weight="700" letter-spacing="6" fill="rgba(255,245,208,0.78)">${escapeXml([facts.league, facts.detail || facts.round].filter(Boolean).join(' | ').toUpperCase())}</text>
  ${hasMatchup ? `<g transform="translate(${width / 2} ${portrait ? 304 : 268}) rotate(45)"><rect x="${portrait ? -44 : -58}" y="${portrait ? -44 : -58}" width="${portrait ? 88 : 116}" height="${portrait ? 88 : 116}" fill="url(#foil)" stroke="#2a1a08" stroke-width="3"/></g><text x="${width / 2}" y="${portrait ? 320 : 286}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 34 : 48}" font-weight="950" fill="#2a1a08">VS</text>` : ''}
  <rect x="${safe}" y="${nameY}" width="${width - safe * 2}" height="${portrait ? 126 : 96}" fill="#e6cc7a" stroke="#2a1a08" stroke-width="${portrait ? 3 : 4}"/>
  ${hasMatchup ? renderTextLines(splitLines(facts.home, portrait ? 24 : 36, 1), width / 2, nameY + (portrait ? 42 : 36), { fontSize: portrait ? 27 : 36, weight: 900, family: 'Georgia, serif', style: 'italic', fill: '#2a1a08' }) : ''}
  ${hasMatchup ? `<text x="${width / 2}" y="${nameY + (portrait ? 68 : 60)}" text-anchor="middle" font-family="Consolas, monospace" font-size="${portrait ? 14 : 18}" font-weight="800" letter-spacing="7" fill="#5a4a1f">VERSUS</text>` : ''}
  ${hasMatchup ? renderTextLines(splitLines(facts.away, portrait ? 24 : 36, 1), width / 2, nameY + (portrait ? 106 : 84), { fontSize: portrait ? 27 : 36, weight: 900, family: 'Georgia, serif', style: 'italic', fill: '#2a1a08' }) : renderTextLines(splitLines(facts.title, portrait ? 23 : 40, 2), width / 2, nameY + (portrait ? 48 : 48), { fontSize: portrait ? 34 : 48, lineHeight: portrait ? 39 : 54, weight: 900, family: 'Georgia, serif', style: 'italic', fill: '#2a1a08' })}
  <text x="${safe}" y="${height - (portrait ? 36 : 18)}" font-family="Consolas, monospace" font-size="${portrait ? 15 : 22}" fill="rgba(255,245,208,0.9)" letter-spacing="4">${escapeXml((facts.venue || facts.sport).toUpperCase())}</text>
  <text x="${width - safe}" y="${height - (portrait ? 36 : 18)}" text-anchor="end" font-family="Consolas, monospace" font-size="${portrait ? 15 : 22}" fill="rgba(255,245,208,0.9)" letter-spacing="4">${escapeXml(facts.date || facts.time)}</text>
</svg>`
  return { svg, slots, overlay: '' }
}

function templateBrutalist(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 68 : 86, left: width - safe - (portrait ? 68 : 86), top: safe }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 185 : 278, left: safe + 18, top: portrait ? 178 : 150 }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 185 : 278, left: width - safe - 18 - (portrait ? 185 : 278), top: portrait ? 420 : 214 }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 270 : 380, left: width / 2 - (portrait ? 135 : 190), top: portrait ? 210 : 150 }, width, height)
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const y32 = Math.round(height * 0.32)
  const y78 = Math.round(height * 0.78)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs(theme)}
  <rect width="${width}" height="${height}" fill="#0f0e0c"/>
  <polygon points="0,0 ${width},0 ${width},${y32} 0,${y78}" fill="${theme.homeColor || '#0f766e'}"/>
  <polygon points="0,${y78} ${width},${y32} ${width},${height} 0,${height}" fill="${theme.awayColor || '#123c69'}"/>
  <line x1="0" y1="${y78}" x2="${width}" y2="${y32}" stroke="#0f0e0c" stroke-width="${portrait ? 7 : 10}"/>
  <rect width="${width}" height="${height}" fill="url(#diagonal)" opacity="0.12"/>
  ${surfaceSvg(facts, { x: safe, y: portrait ? 120 : 90, width: width - safe * 2, height: portrait ? 520 : height - 170 }, theme, 0.17)}
  <text x="${safe}" y="${portrait ? 118 : 112}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 64 : 100}" font-weight="950" fill="#ffffff" opacity="0.92">${escapeXml(facts.leagueCode)}</text>
  <text x="${safe + 8}" y="${portrait ? 160 : 160}" font-family="Consolas, monospace" font-size="${portrait ? 19 : 30}" font-weight="800" letter-spacing="5" fill="#ffffff">${escapeXml((facts.league || facts.sport).toUpperCase())}</text>
  ${hasMatchup ? logoBackdrop(homeSlot, { fill: 'rgba(0,0,0,0.20)', stroke: 'rgba(255,255,255,0.34)' }) : logoBackdrop(singleSlot, { fill: 'rgba(0,0,0,0.20)', stroke: 'rgba(255,255,255,0.34)' })}
  ${hasMatchup ? logoBackdrop(awaySlot, { fill: 'rgba(0,0,0,0.20)', stroke: 'rgba(255,255,255,0.34)' }) : ''}
  <g style="mix-blend-mode:difference">
    <line x1="${safe / 2}" y1="${safe / 2}" x2="${safe * 1.5}" y2="${safe / 2}" stroke="white"/>
    <line x1="${safe / 2}" y1="${safe / 2}" x2="${safe / 2}" y2="${safe * 1.5}" stroke="white"/>
    <line x1="${width - safe / 2}" y1="${height - safe / 2}" x2="${width - safe * 1.5}" y2="${height - safe / 2}" stroke="white"/>
    <line x1="${width - safe / 2}" y1="${height - safe / 2}" x2="${width - safe / 2}" y2="${height - safe * 1.5}" stroke="white"/>
  </g>
  <g transform="translate(${safe} ${portrait ? 610 : height - 148}) rotate(-5)">
    <rect x="0" y="0" width="${portrait ? 250 : 360}" height="${portrait ? 42 : 58}" fill="rgba(239,234,224,0.9)" stroke="#0f0e0c" stroke-width="${portrait ? 4 : 6}"/>
    <text x="${portrait ? 125 : 180}" y="${portrait ? 29 : 39}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 23 : 34}" font-weight="950" fill="#0f0e0c">${escapeXml((facts.detail || facts.round || 'LIVE').toUpperCase())}</text>
  </g>
  ${renderTextLines(splitLines(facts.title, portrait ? 22 : 45, 2), safe, height - (portrait ? 168 : 76), { anchor: 'start', fontSize: portrait ? 44 : 72, lineHeight: portrait ? 50 : 80, weight: 950, fill: '#ffffff', stroke: '#0f0e0c', strokeWidth: portrait ? 7 : 10 })}
  <text x="${safe}" y="${height - safe}" font-family="Consolas, monospace" font-size="${portrait ? 17 : 26}" font-weight="800" fill="#ffffff" letter-spacing="4">${escapeXml([facts.venue, facts.date].filter(Boolean).join(' | ').toUpperCase())}</text>
</svg>`
  return {
    svg,
    slots,
    overlay: hasMatchup ? renderVersusOverlay({ width, height, x: 0, y: 175, w: width, h: portrait ? 360 : 390, color: '#ffffff', stroke: '#0f0e0c', opacity: 0.92 }) : ''
  }
}

function templateTicketStub(event = {}, variant = 'poster', theme = {}, mode = 'matchup') {
  const { width, height, portrait, safe } = layoutForVariant(variant)
  const facts = eventFacts(event)
  const hasMatchup = mode !== 'single' && facts.home && facts.away
  const mastheadH = portrait ? 150 : 128
  const leagueSlot = clampSlot({ role: 'league', size: portrait ? 78 : 96, left: width / 2 - (portrait ? 39 : 48), top: portrait ? 36 : 28 }, width, height)
  const homeSlot = clampSlot({ role: 'home', size: portrait ? 150 : 228, left: width * 0.27 - (portrait ? 75 : 114), top: portrait ? 260 : 202 }, width, height)
  const awaySlot = clampSlot({ role: 'away', size: portrait ? 150 : 228, left: width * 0.73 - (portrait ? 75 : 114), top: portrait ? 260 : 202 }, width, height)
  const singleSlot = clampSlot({ role: 'league', size: portrait ? 245 : 350, left: width / 2 - (portrait ? 122 : 175), top: portrait ? 215 : 165 }, width, height)
  const slots = hasMatchup ? [leagueSlot, homeSlot, awaySlot] : [singleSlot]
  const perf = []
  const perfY = mastheadH + 14
  for (let x = 12; x < width; x += portrait ? 24 : 32) {
    perf.push(`<circle cx="${x}" cy="${perfY}" r="${portrait ? 5 : 6}" fill="#e6dec9" stroke="rgba(60,40,15,0.35)"/>`)
  }
  const stubY = height - (portrait ? 160 : 120)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildDefs({ ...theme, paper: true })}
  <rect width="${width}" height="${height}" fill="#e6dec9"/>
  <rect width="${width}" height="${height}" fill="url(#paper)"/>
  <rect x="0" y="0" width="${width / 2}" height="${mastheadH}" fill="${theme.homeColor || '#0f766e'}"/>
  <rect x="${width / 2}" y="0" width="${width / 2}" height="${mastheadH}" fill="${theme.awayColor || '#123c69'}"/>
  <rect x="0" y="0" width="${width}" height="${mastheadH}" fill="rgba(40,25,10,0.34)"/>
  <text x="${width / 2}" y="${portrait ? 30 : 24}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${portrait ? 15 : 21}" font-weight="900" fill="rgba(255,245,220,0.86)" letter-spacing="6">OFFICIAL ADMITTANCE</text>
  <text x="${width / 2}" y="${mastheadH - (portrait ? 24 : 18)}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 22 : 32}" font-weight="950" fill="#fff5d0" letter-spacing="7">${escapeXml((facts.league || facts.sport).toUpperCase())}</text>
  <line x1="0" y1="${mastheadH}" x2="${width}" y2="${mastheadH}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="6 6"/>
  ${perf.join('\n')}
  ${hasMatchup ? logoBackdrop(homeSlot, { fill: 'rgba(255,245,208,0.60)', stroke: 'rgba(90,58,31,0.55)' }) : logoBackdrop(singleSlot, { fill: 'rgba(255,245,208,0.60)', stroke: 'rgba(90,58,31,0.55)' })}
  ${hasMatchup ? logoBackdrop(awaySlot, { fill: 'rgba(255,245,208,0.60)', stroke: 'rgba(90,58,31,0.55)' }) : ''}
  ${hasMatchup ? `<text x="${width / 2}" y="${portrait ? 348 : 298}" text-anchor="middle" font-family="Georgia, serif" font-size="${portrait ? 52 : 72}" font-style="italic" fill="#5a3a1f">x</text>` : ''}
  <line x1="${safe}" y="${portrait ? 480 : height - 242}" x2="${width / 2 - 54}" y2="${portrait ? 480 : height - 242}" stroke="#5a3a1f" stroke-width="1" stroke-dasharray="4 5"/>
  <line x1="${width / 2 + 54}" y1="${portrait ? 480 : height - 242}" x2="${width - safe}" y2="${portrait ? 480 : height - 242}" stroke="#5a3a1f" stroke-width="1" stroke-dasharray="4 5"/>
  <text x="${width / 2}" y="${portrait ? 488 : height - 234}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 20 : 30}" font-weight="950" letter-spacing="6" fill="#5a3a1f">FEATURE</text>
  ${renderTextLines(splitLines(facts.title, portrait ? 24 : 44, 2), width / 2, portrait ? 548 : height - 182, { fontSize: portrait ? 40 : 58, lineHeight: portrait ? 46 : 66, weight: 950, fill: '#1a1410' })}
  <text x="${width / 2}" y="${portrait ? 640 : height - 106}" text-anchor="middle" font-family="Consolas, monospace" font-size="${portrait ? 17 : 25}" font-weight="800" fill="#5a3a1f" letter-spacing="4">${escapeXml((facts.venue || facts.league).toUpperCase())}</text>
  <line x1="0" y1="${stubY}" x2="${width}" y2="${stubY}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="6 6"/>
  <text x="${safe}" y="${stubY + (portrait ? 42 : 38)}" font-family="Consolas, monospace" font-size="${portrait ? 17 : 25}" font-weight="900" fill="#5a3a1f" letter-spacing="5">DATE</text>
  <text x="${safe}" y="${stubY + (portrait ? 78 : 78)}" font-family="Consolas, monospace" font-size="${portrait ? 23 : 34}" font-weight="800" fill="#1a1410">${escapeXml(facts.date || facts.time)}</text>
  <g transform="translate(${width - safe - (portrait ? 84 : 118)} ${stubY + (portrait ? 72 : 66)}) rotate(-7)">
    <rect x="${portrait ? -52 : -72}" y="${portrait ? -30 : -40}" width="${portrait ? 104 : 144}" height="${portrait ? 60 : 80}" fill="none" stroke="#8c1f0f" stroke-width="${portrait ? 4 : 6}"/>
    <text x="0" y="-3" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 24 : 34}" font-weight="950" fill="#8c1f0f">ADMIT</text>
    <text x="0" y="${portrait ? 24 : 34}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${portrait ? 24 : 34}" font-weight="950" fill="#8c1f0f">ONE</text>
  </g>
</svg>`
  return { svg, slots, overlay: '' }
}

function templateSingleLogo(event = {}, variant = 'poster', theme = {}, template = 'editorial') {
  if (template === 'broadcast') return templateBroadcast(event, variant, theme, 'single')
  if (template === 'sportsbook') return templateSportsbook(event, variant, theme, 'single')
  if (template === 'trading-card') return templateTradingCard(event, variant, theme, 'single')
  if (template === 'brutalist') return templateBrutalist(event, variant, theme, 'single')
  if (template === 'ticket-stub') return templateTicketStub(event, variant, theme, 'single')
  return templateEditorial(event, variant, theme, 'single')
}

function renderSportsPosterTemplateSvg({ event = {}, variant = 'poster', template = 'editorial', theme = {}, mode = 'matchup' } = {}) {
  const normalizedTemplate = normalizeSportsPosterTemplate(template)
  if (mode === 'single') return templateSingleLogo(event, variant, theme, normalizedTemplate)
  if (normalizedTemplate === 'broadcast') return templateBroadcast(event, variant, theme, mode)
  if (normalizedTemplate === 'sportsbook') return templateSportsbook(event, variant, theme, mode)
  if (normalizedTemplate === 'trading-card') return templateTradingCard(event, variant, theme, mode)
  if (normalizedTemplate === 'brutalist') return templateBrutalist(event, variant, theme, mode)
  if (normalizedTemplate === 'ticket-stub') return templateTicketStub(event, variant, theme, mode)
  return templateEditorial(event, variant, theme, mode)
}

function sportGlyphMarkup(icon = 'sports', size = 256) {
  const stroke = '#ffffff'
  const fill = 'rgba(255,255,255,0.10)'
  if (icon === 'football') {
    return `<rect x="${size * 0.18}" y="${size * 0.2}" width="${size * 0.64}" height="${size * 0.48}" rx="${size * 0.025}" fill="none" stroke="${stroke}" stroke-width="${size * 0.035}"/>
      <circle cx="${size * 0.5}" cy="${size * 0.44}" r="${size * 0.12}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.025}"/>
      <line x1="${size * 0.5}" y1="${size * 0.2}" x2="${size * 0.5}" y2="${size * 0.68}" stroke="${stroke}" stroke-width="${size * 0.02}"/>`
  }
  if (icon === 'basketball') {
    return `<circle cx="${size * 0.5}" cy="${size * 0.45}" r="${size * 0.28}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.035}"/>
      <path d="M ${size * 0.22} ${size * 0.45} Q ${size * 0.5} ${size * 0.28} ${size * 0.78} ${size * 0.45} M ${size * 0.22} ${size * 0.45} Q ${size * 0.5} ${size * 0.62} ${size * 0.78} ${size * 0.45} M ${size * 0.5} ${size * 0.17} L ${size * 0.5} ${size * 0.73}" fill="none" stroke="${stroke}" stroke-width="${size * 0.025}"/>`
  }
  if (icon === 'baseball') {
    return `<circle cx="${size * 0.5}" cy="${size * 0.45}" r="${size * 0.28}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.035}"/>
      <path d="M ${size * 0.30} ${size * 0.32} Q ${size * 0.42} ${size * 0.44} ${size * 0.34} ${size * 0.65} M ${size * 0.70} ${size * 0.32} Q ${size * 0.58} ${size * 0.44} ${size * 0.66} ${size * 0.65}" fill="none" stroke="${stroke}" stroke-width="${size * 0.025}" stroke-dasharray="${size * 0.035} ${size * 0.035}"/>`
  }
  if (icon === 'hockey') {
    return `<ellipse cx="${size * 0.5}" cy="${size * 0.58}" rx="${size * 0.28}" ry="${size * 0.08}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.03}"/>
      <path d="M ${size * 0.28} ${size * 0.2} L ${size * 0.44} ${size * 0.58} L ${size * 0.34} ${size * 0.7} M ${size * 0.72} ${size * 0.2} L ${size * 0.56} ${size * 0.58} L ${size * 0.66} ${size * 0.7}" fill="none" stroke="${stroke}" stroke-width="${size * 0.035}" stroke-linecap="round"/>`
  }
  if (icon === 'f1') {
    return `<path d="M ${size * 0.16} ${size * 0.48} C ${size * 0.28} ${size * 0.34}, ${size * 0.72} ${size * 0.34}, ${size * 0.84} ${size * 0.48}" fill="none" stroke="${stroke}" stroke-width="${size * 0.045}" stroke-linecap="round"/>
      <path d="M ${size * 0.2} ${size * 0.59} L ${size * 0.8} ${size * 0.52}" fill="none" stroke="${stroke}" stroke-width="${size * 0.03}" stroke-linecap="round"/>
      <text x="${size * 0.5}" y="${size * 0.48}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${size * 0.22}" font-weight="950" fill="${stroke}">GP</text>`
  }
  if (icon === 'tennis') {
    return `<circle cx="${size * 0.5}" cy="${size * 0.45}" r="${size * 0.26}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.035}"/>
      <path d="M ${size * 0.32} ${size * 0.28} Q ${size * 0.5} ${size * 0.45} ${size * 0.32} ${size * 0.62} M ${size * 0.68} ${size * 0.28} Q ${size * 0.5} ${size * 0.45} ${size * 0.68} ${size * 0.62}" fill="none" stroke="${stroke}" stroke-width="${size * 0.025}"/>`
  }
  if (icon === 'mma' || icon === 'boxing') {
    return `<rect x="${size * 0.22}" y="${size * 0.27}" width="${size * 0.56}" height="${size * 0.36}" rx="${size * 0.06}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.035}"/>
      <line x1="${size * 0.22}" y1="${size * 0.39}" x2="${size * 0.78}" y2="${size * 0.39}" stroke="${stroke}" stroke-width="${size * 0.018}"/>
      <line x1="${size * 0.22}" y1="${size * 0.51}" x2="${size * 0.78}" y2="${size * 0.51}" stroke="${stroke}" stroke-width="${size * 0.018}"/>`
  }
  return `<circle cx="${size * 0.5}" cy="${size * 0.45}" r="${size * 0.28}" fill="${fill}" stroke="${stroke}" stroke-width="${size * 0.035}"/>
    <path d="M ${size * 0.34} ${size * 0.53} L ${size * 0.5} ${size * 0.26} L ${size * 0.66} ${size * 0.53} Z" fill="none" stroke="${stroke}" stroke-width="${size * 0.035}" stroke-linejoin="round"/>`
}

function renderLogoGlyphSvg({ role = 'league', event = {}, theme = {}, size = 256 } = {}) {
  const facts = eventFacts(event)
  const icon = sportIconFor(event, facts)
  const primary = role === 'away' ? (theme.awayColor || '#123c69') : (theme.homeColor || '#0f766e')
  const secondary = role === 'league' ? (theme.accentColor || '#b58b2a') : (theme.accentColor || '#f5d76e')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="35%" cy="30%" r="78%">
      <stop offset="0" stop-color="${secondary}"/>
      <stop offset="1" stop-color="${primary}"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="rgba(2,6,23,0)"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.43}" fill="url(#g)" stroke="rgba(255,255,255,0.78)" stroke-width="${Math.max(3, Math.round(size * 0.03))}"/>
  ${sportGlyphMarkup(icon, size)}
</svg>`
}

module.exports = {
  SPORTS_POSTER_TEMPLATES,
  TEMPLATE_LABELS,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate,
  renderLogoGlyphSvg,
  renderSportsPosterTemplateSvg
}
