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
const {
  classifySportsPosterEvent,
  hasActualPair,
  isCompetitorVsCompetitorEvent
} = require('./sportsPosterClassifier')

const LEAGUE_CODE_ALIASES = Object.freeze({
  'english premier league': 'EPL',
  'premier league': 'EPL',
  'uefa champions league': 'UCL',
  'champions league': 'UCL',
  ucl: 'UCL',
  'uefa europa league': 'UEL',
  'europa league': 'UEL',
  uel: 'UEL',
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
  wimbledon: 'ATP',
  snooker: 'SNOOKER',
  'world championship': 'WC',
  darts: 'DARTS',
  boxing: 'BOXING',
  tennis: 'TENNIS',
  'table tennis': 'TABLE'
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

function layoutFamilyForSportsPosterRender(value, event = {}) {
  const template = normalizeSportsPosterTemplate(value)
  if (template === 'broadcast') return 'BROADCAST'
  const explicit = normalizeSpace(event.layoutFamily || event.sportsArtwork?.layoutFamily).toUpperCase()
  const paired = hasActualPair(event)
  const classifiedClass = classifySportsPosterEvent(event)
  const teamLayoutAllowed = paired && classifiedClass === 'team_vs_team'
  if (explicit === 'TEAM_VS_TEAM' && teamLayoutAllowed) return 'TEAM_VS_TEAM'
  if (explicit === 'COMPETITOR_VS_COMPETITOR') return 'COMPETITOR_VS_COMPETITOR'
  if (explicit === 'SINGLE_EVENT_MOTORSPORT') return 'SINGLE_EVENT_MOTORSPORT'
  const eventClass = normalizeSpace(event.eventClass || event.posterClass) || classifiedClass
  if (eventClass === 'team_vs_team' && teamLayoutAllowed) return 'TEAM_VS_TEAM'
  if (isCompetitorVsCompetitorEvent({ ...event, eventClass })) return 'COMPETITOR_VS_COMPETITOR'
  if (eventClass === 'motorsport_event') return 'SINGLE_EVENT_MOTORSPORT'
  return layoutFamilyForSportsPosterTemplate(template)
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

function svgDataAttrs(values = {}) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && normalizeSpace(value) !== '')
    .map(([key, value]) => {
      const attr = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
      return `data-${attr}="${escapeXml(value)}"`
    })
    .join(' ')
}

function wrapTemplateSvg(inner, slots = [], variant = 'poster', metadata = {}) {
  const layout = layoutScale(variant)
  const background = variant === 'poster' ? '' : `<rect width="${layout.width}" height="${layout.height}" fill="#05070d"/>`
  const dataAttrs = svgDataAttrs(metadata)
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img"${dataAttrs ? ` ${dataAttrs}` : ''}>
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

function estimatedTextWidth(value = '', fontSize = 16) {
  return normalizeSpace(value).length * fontSize * 0.58
}

function fitTextAttributes(value = '', maxWidth = 120, baseSize = 16, minSize = 10) {
  const clean = normalizeSpace(value)
  const rawSize = clean ? Math.floor((maxWidth / Math.max(clean.length * 0.58, 1))) : baseSize
  const fontSize = Math.max(minSize, Math.min(baseSize, rawSize))
  const attrs = [`font-size="${fontSize}"`]
  if (estimatedTextWidth(clean, fontSize) > maxWidth) {
    attrs.push(`textLength="${Math.round(maxWidth)}"`)
    attrs.push('lengthAdjust="spacingAndGlyphs"')
  }
  return attrs.join(' ')
}

function letterStartingWords(words = []) {
  return words.filter((word) => /^[A-Za-z]/.test(word))
}

function initialsFor(value = '', fallback = 'SP') {
  const clean = normalizeSpace(value).replace(/[^A-Za-z0-9 ]+/g, ' ')
  const words = clean.split(/\s+/).filter(Boolean)
  const lettered = letterStartingWords(words)
  // 3+ letter-starting words: take first letter of each (e.g. Boston Red Sox -> BRS,
  // New York Yankees -> NYY, Tampa Bay Lightning -> TBL), capped at 3 chars.
  if (lettered.length >= 3) {
    return lettered.map((word) => word[0]).join('').slice(0, 3).toUpperCase()
  }
  if (lettered.length === 2) {
    return `${lettered[0][0]}${lettered[1][0]}`.toUpperCase()
  }
  const single = lettered[0] || words[0]
  if (single) return single.slice(0, 3).toUpperCase()
  return fallback
}

function shortFor(value = '', fallback = 'SP') {
  const clean = normalizeSpace(value).replace(/[^A-Za-z0-9 ]+/g, ' ')
  const words = clean.split(/\s+/).filter(Boolean)
  const lettered = letterStartingWords(words)
  if (lettered.length >= 2) return lettered.map((word) => word[0]).join('').slice(0, 4).toUpperCase()
  const single = lettered[0] || words[0]
  if (single) return single.slice(0, 3).toUpperCase()
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

// Names that look like placeholder fallbacks rather than real
// competitor/team names. Used to suppress fake-matchup rendering on
// solo events that only have generic event labels.
const FORBIDDEN_PAIR_NAMES = new Set(['', 'home', 'away', 'team', 'event', 'session', 'fighter', 'player', 'competitor', 'tba', 'tbd', 'unknown', 'n/a', 'na', 'sports', 'sport'])

function pickRealSide(...candidates) {
  for (const candidate of candidates) {
    const value = normalizeSpace(candidate)
    if (!value) continue
    if (FORBIDDEN_PAIR_NAMES.has(value.toLowerCase())) continue
    return value
  }
  return ''
}

function templateData(event = {}, theme = {}, mode = '') {
  const classifiedClass = classifySportsPosterEvent(event)
  const eventClass = event.eventClass || event.posterClass || classifiedClass
  const data = buildPaidTemplateMatchup(event, eventClass)
  const requestedMode = normalizeKey(mode)
  const eventFormat = ['matchup', 'single', 'solo'].includes(requestedMode)
    ? requestedMode
    : data.event_format
  // Audit fix G1.3/G1.4: when the source supplies a real driver/competitor
  // pair (e.g. UFC with Makhachev vs Oliveira, tennis with Alcaraz vs Sinner),
  // per-template renderers must show the head-to-head — not the event-only
  // tile. The canonical Python templates do exactly this: solo events with
  // home+away render as head-to-head sportsbook/trading-card panels. We must
  // check the ORIGINAL event input — not data.home/away because the adapter
  // falls back to eventShort/session/league names when no real side was
  // supplied, which would falsely trigger a fake matchup.
  //
  // CONTRACT INVARIANT (Q5.3 + user direction 2026-05-01): motorsport_event
  // is NEVER a head-to-head. F1, MotoGP, NASCAR, IndyCar, WRC, etc. are
  // multi-car / multi-driver races, not 1v1 contests. Even if test data or
  // upstream metadata supplies home/away as drivers, the runtime renders the
  // event tile (Series · Event · Session · Date) — driver names appear only
  // when the source title literally contains one, which is handled by the
  // event title text, never by a fake "vs" layout.
  const rawLeft = pickRealSide(event.principalA, event.homeTeam, event.home?.name, event.fighterA, event.playerA, event.teamA)
  const rawRight = pickRealSide(event.principalB, event.awayTeam, event.away?.name, event.fighterB, event.playerB, event.teamB)
  const hasRealPair = Boolean(hasActualPair(event) && rawLeft && rawRight && rawLeft.toLowerCase() !== rawRight.toLowerCase())
  const teamLayoutAllowed = eventClass !== 'team_vs_team' || classifiedClass === 'team_vs_team'
  const motorsportNeverPair = eventClass === 'motorsport_event'
  // Audit fix (contract §4 row 1 fallback + Q2.3 + G8): team_vs_team with no
  // real pair must downgrade to tournament_event so we don't render a fake
  // "Highlights vs Highlights" matchup. Without this guard, the adapter still
  // returns event_format='matchup' for team_vs_team class even when no real
  // sides parsed.
  const teamWithoutPair = eventClass === 'team_vs_team' && (!hasRealPair || !teamLayoutAllowed)
  // Wrestling per Q5.4 / contract §4 row 5: event-show shape, no fake paired
  // headline. Suppress matchup layout even when test data supplies a fake
  // headline pair.
  const wrestlingNeverPair = eventClass === 'wrestling_event'
  const hasMatchup = !motorsportNeverPair && !teamWithoutPair && !wrestlingNeverPair && (
    eventFormat === 'matchup' || eventFormat === 'single' || (eventFormat === 'solo' && hasRealPair)
  )
  const isTeamMatchup = eventFormat === 'matchup' && !motorsportNeverPair && !teamWithoutPair
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
    broadcastLabel: broadcastLabelFor(event, data),
    // Audit fix (contract bug 3): expose the original eventTitle/eventName so
    // solo template renders prefer "Royal Rumble" / "Day 7 Highlights" /
    // "Brazilian Grand Prix" (full source title) over the adapter's shortened
    // event_short which may strip session/round noise.
    eventTitle: normalizeSpace(event.eventTitle || event.eventName || event.name || event.title || data.eventTitle || data.event_short || ''),
    eventDate: normalizeSpace(event.date || event.eventDate || data.date || ''),
    eventDetail: normalizeSpace(event.eventDetail || event.session || event.round || data.event_detail || data.session || data.round || '')
  }
}

function competitorLabelFor(event = {}, m = {}) {
  const text = normalizeSpace([
    event.leagueCode,
    event.league_code,
    event.competitionCode,
    event.league,
    event.competition,
    event.sport,
    event.title,
    event.eventTitle,
    event.rawTitle,
    m.league_code,
    m.league,
    m.sport
  ].filter(Boolean).join(' '))
  if (/\b(?:ufc|ultimate fighting championship)\b/i.test(text)) return { leagueLabel: 'UFC', sportLabel: 'MMA' }
  if (/\b(?:mma|pfl|bellator|one championship)\b/i.test(text)) return { leagueLabel: 'MMA', sportLabel: 'MMA' }
  if (/\b(?:boxing|matchroom|queensberry|bkfc|heavyweight|welterweight|lightweight)\b/i.test(text)) return { leagueLabel: 'BOXING', sportLabel: 'BOXING' }
  if (/\b(?:pdc|darts?|world matchplay|premier league darts)\b/i.test(text)) return { leagueLabel: 'DARTS', sportLabel: 'DARTS' }
  if (/\b(?:atp|wimbledon|australian open|roland garros|french open|us open tennis)\b/i.test(text)) return { leagueLabel: 'ATP', sportLabel: 'TENNIS' }
  if (/\bwta\b/i.test(text)) return { leagueLabel: 'WTA', sportLabel: 'TENNIS' }
  if (/\btennis\b/i.test(text)) return { leagueLabel: 'TENNIS', sportLabel: 'TENNIS' }
  if (/\b(?:wc|world championship|crucible|snooker|billiards|pool)\b/i.test(text)) return { leagueLabel: 'SNOOKER', sportLabel: 'SNOOKER' }
  if (/\b(?:wwe|aew|nxt|raw|smackdown|wrestling)\b/i.test(text)) return { leagueLabel: 'WRESTLING', sportLabel: 'WRESTLING' }
  const clean = normalizeSpace(m.league_code || m.league || m.sport || 'SPORT').toUpperCase()
  return { leagueLabel: clean, sportLabel: normalizeSpace(m.sport || clean).toUpperCase() }
}

function wrapLinesNoEllipsis(value = '', maxChars = 17, maxLines = 2) {
  const words = normalizeSpace(value).split(/\s+/).filter(Boolean)
  if (!words.length) return []
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
    if (lines.length >= maxLines - 1) break
  }
  const used = lines.concat(current ? [current] : []).join(' ').split(/\s+/).filter(Boolean).length
  const remaining = words.slice(used)
  if (remaining.length) lines.push([current, ...remaining].filter(Boolean).join(' '))
  else if (current) lines.push(current)
  return lines.slice(0, maxLines)
}

function fitCompetitorName(value = '', maxWidth = 286, baseSize = 44, minSize = 25) {
  const clean = normalizeSpace(value)
  let fontSize = baseSize
  let lines = [clean]
  while (fontSize > minSize && estimatedTextWidth(clean, fontSize) > maxWidth) {
    fontSize -= 1
  }
  if (estimatedTextWidth(clean, fontSize) > maxWidth) {
    const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(fontSize * 0.58, 1)))
    lines = wrapLinesNoEllipsis(clean, maxChars, 2)
    while (fontSize > minSize && lines.some((line) => estimatedTextWidth(line, fontSize) > maxWidth)) {
      fontSize -= 1
    }
  }
  const fitted = lines.length > 0 && lines.every((line) => estimatedTextWidth(line, fontSize) <= maxWidth)
  return {
    text: clean,
    lines,
    fontSize,
    maxWidth,
    status: fitted ? 'fit' : 'fit-with-textLength'
  }
}

function renderCompetitorNameLines(fit, x, y, anchor, role, side, e) {
  return fit.lines.map((line, index) => {
    const attrs = [
      `data-role="${role}"`,
      `data-competitor-side="${side}"`,
      `data-competitor-name="${e(fit.text)}"`,
      `data-fit-status="${fit.status}"`,
      `x="${x}"`,
      `y="${y + index * Math.round(fit.fontSize * 1.02)}"`,
      `font-size="${fit.fontSize}"`,
      `text-anchor="${anchor}"`,
      'font-family="Bebas Neue, Impact, Arial, sans-serif"',
      'font-weight="900"',
      'fill="#fff8dc"',
      'letter-spacing="0"'
    ]
    if (estimatedTextWidth(line, fit.fontSize) > fit.maxWidth) {
      attrs.push(`textLength="${fit.maxWidth}"`)
      attrs.push('lengthAdjust="spacingAndGlyphs"')
    }
    return `<text ${attrs.join(' ')}>${e(line)}</text>`
  }).join('\n    ')
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
  const total = words.join(' ').length
  const maxChars = total > 36 ? 14 : total > 24 ? 16 : 18
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
  const safeWidth = 800
  let fontSize = longest > 0 ? Math.min(54, Math.max(28, Math.floor(safeWidth / longest))) : 54
  if (lines.length >= 3) fontSize = Math.min(fontSize, 42)
  const gap = Math.round(fontSize * 1.08)
  const startY = lines.length >= 3 ? 382 : lines.length === 2 ? 398 : 424
  return { fontSize, gap, startY }
}

function broadcastMatchupFromEvent(event = {}, m = {}) {
  const home = firstBroadcastText(event.homeTeam, event.home?.name, event.principalA, event.fighterA, event.playerA, event.teamA)
  const away = firstBroadcastText(event.awayTeam, event.away?.name, event.principalB, event.fighterB, event.playerB, event.teamB)
  if (!home || !away) return null
  if (home.toLowerCase() === away.toLowerCase()) return null
  const eventFormat = String(m?.event_format || '').toLowerCase()
  if (eventFormat === 'solo') return null
  return { home, away }
}

function broadcastTitleFromEvent(event = {}, m = {}) {
  const matchup = broadcastMatchupFromEvent(event, m)
  if (matchup) return `${matchup.home} vs ${matchup.away}`
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

function broadcastMatchupKey(home = '', away = '') {
  return broadcastTextKey(`${home} ${away}`)
}

function stripVersusToken(value = '') {
  return String(value || '').replace(/\b(?:vs|v|versus|x)\b/gi, ' ')
}

function broadcastSubtitleFromEvent(event = {}, m = {}, label = '', title = '', matchup = null) {
  const league = firstBroadcastText(event.league, event.competition, m.leagueFull, m.league, label, event.sport, m.sport)
  const realDetailCandidates = [
    event.date,
    event.localDate,
    event.eventDetail,
    event.detail,
    event.session,
    event.round,
    m.date
  ]
  const fallbackDetailCandidates = [
    m.session,
    m.round,
    event.eventShort,
    event.event_short,
    event.eventTitle,
    m.event_short,
    m.event
  ]
  const detailCandidates = matchup
    ? realDetailCandidates
    : realDetailCandidates.concat(fallbackDetailCandidates)
  const titleKey = broadcastTextKey(title)
  const matchupKey = matchup ? broadcastMatchupKey(matchup.home, matchup.away) : ''
  let detail = ''
  for (const candidate of detailCandidates) {
    const clean = compactBroadcastDetail(candidate, league, label)
    if (!clean) continue
    const cleanKey = broadcastTextKey(clean)
    const cleanKeyNoVersus = broadcastTextKey(stripVersusToken(clean))
    if (cleanKey === broadcastTextKey(league)) continue
    if (matchupKey && (cleanKey === matchupKey || cleanKeyNoVersus === matchupKey)) continue
    detail = clean
    if (cleanKey !== titleKey && cleanKeyNoVersus !== titleKey) break
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
  // Audit fix (contract bug 3): prefer the source eventTitle ("Royal Rumble",
  // "Day 7 Highlights", "Brazilian Grand Prix") over the adapter-shortened
  // event_short which strips session/round noise.
  // Audit fix (2026-05-05): drop max-chars from 18→14 so 18-char titles like
  // "British Grand Prix" wrap to 2 lines at the smaller 30px size instead of
  // overflowing the right margin at 42px on a 400px canvas.
  const headlineLines = splitLines((m.eventTitle && !m.hasMatchup ? m.eventTitle : m.event_short) || m.eventTitle || m.event_short || m.league || m.sport, 14, 2)
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
  // Audit fix G3.2: editorial hero now uses team-colour radial sun-burst
  // (matches canonical 01-editorial direction) instead of the generic dome+V.
  // Sun rays radiate from centre; sport glyph silhouette sits on top in
  // ivory/paper colour. Glyph rendering is an emergency fallback for missing
  // or broken artwork, not a selectable free product tier.
  const sunRays = Array.from({ length: 24 }, (_, i) => {
    const angle = i * Math.PI / 12
    const r1 = 24
    const r2 = 96
    const x1 = (SOURCE_W / 2 + Math.cos(angle) * r1).toFixed(1)
    const y1 = (190 + Math.sin(angle) * r1).toFixed(1)
    const x2 = (SOURCE_W / 2 + Math.cos(angle) * r2).toFixed(1)
    const y2 = (190 + Math.sin(angle) * r2).toFixed(1)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${paper}" stroke-width="${i % 2 ? 0.6 : 1.4}" opacity="0.32"/>`
  }).join('')
  const heroAccent = m.hasMatchup ? m.away.primary : m.home.primary
  const plateIdentity = `<defs>
    <radialGradient id="editorialSun" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${paper}" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="${m.home.primary}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${heroAccent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="${SOURCE_W / 2}" cy="190" r="100" fill="url(#editorialSun)"/>
  ${sunRays}
  ${sportGlyph(m.sport_icon, SOURCE_W / 2, 190, 132, paper, 0.78, 1.4)}
  <circle cx="${SOURCE_W / 2}" cy="190" r="42" fill="none" stroke="${paper}" stroke-width="1" stroke-dasharray="2 3" opacity="0.55"/>
  ${m.hasMatchup
    ? `<text class="serif" x="${SOURCE_W / 2}" y="252" text-anchor="middle" font-size="22" fill="${paper}" font-style="italic" letter-spacing="1">v</text>
  <text class="sans" x="${SOURCE_W / 2}" y="298" text-anchor="middle" font-size="9" fill="${paper}" font-weight="800" letter-spacing="2.4">${e(m.home.name.toUpperCase())} · ${e(m.away.name.toUpperCase())}</text>`
    : `<text class="sans" x="${SOURCE_W / 2}" y="298" text-anchor="middle" font-size="9" fill="${paper}" font-weight="800" letter-spacing="1.5">${e((m.session || m.round || m.sport).toUpperCase())}</text>`}`
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

const BROADCAST_TITLE_FONT = "'Inter','Helvetica Neue','Arial',sans-serif"

function broadcastSideFontSize(name = '') {
  const length = String(name || '').length
  if (length <= 10) return 56
  if (length <= 14) return 48
  if (length <= 18) return 42
  return 36
}

// Wrap a broadcast solo title into <=2 lines that fit a target safe width.
// Conservative width estimate: 0.62 * fontSize per char for Inter 800 weight.
function wrapBroadcastSoloTitle(title, safeWidth = 510) {
  const text = String(title || '').trim()
  if (!text) return ['']
  const words = text.split(/\s+/)
  if (words.length === 1) return [text]
  // Try splitting roughly in half by word count, then refine to balance line widths
  let bestSplit = Math.ceil(words.length / 2)
  let bestDiff = Infinity
  for (let split = 1; split < words.length; split += 1) {
    const a = words.slice(0, split).join(' ').length
    const b = words.slice(split).join(' ').length
    const diff = Math.abs(a - b)
    if (diff < bestDiff) { bestDiff = diff; bestSplit = split }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')]
}

function renderBroadcastMatchupTitle(matchup, e) {
  const homeName = matchup.home.toUpperCase()
  const awayName = matchup.away.toUpperCase()
  const sharedSize = Math.min(broadcastSideFontSize(homeName), broadcastSideFontSize(awayName))
  const versusSize = Math.max(28, Math.round(sharedSize * 0.6))
  const homeY = 376
  const versusY = homeY + Math.round(sharedSize * 0.92)
  const awayY = versusY + Math.round(sharedSize * 1.04)
  return `<text data-role="broadcast-title" class="broadcast-title" x="50" y="${homeY}" font-family="${BROADCAST_TITLE_FONT}" font-size="${sharedSize}" font-weight="800" fill="#ffffff" letter-spacing="-1">${e(homeName)}</text>
    <text data-role="broadcast-versus" x="50" y="${versusY}" font-family="${BROADCAST_TITLE_FONT}" font-size="${versusSize}" font-weight="600" fill="rgba(255,255,255,0.7)" letter-spacing="6">VS</text>
    <text data-role="broadcast-title" class="broadcast-title" x="50" y="${awayY}" font-family="${BROADCAST_TITLE_FONT}" font-size="${sharedSize}" font-weight="800" fill="#ffffff" letter-spacing="-1">${e(awayName)}</text>`
}

function renderBroadcastSoloTitle(title, e) {
  const lines = wrapBroadcastTitle(title)
  const layout = broadcastTitleLayout(lines)
  return lines.map((line, index) => (
    `<text data-role="broadcast-title" class="broadcast-title" x="50" y="${layout.startY + index * layout.gap}" font-family="${BROADCAST_TITLE_FONT}" font-size="${layout.fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-1">${e(line.toUpperCase())}</text>`
  )).join('\n    ')
}

function renderBroadcast(event = {}, variant = 'poster', theme = {}, mode = '') {
  // Audit fix G2: rewritten to match the canonical 02-broadcast direction —
  // diagonal team-colour halves, chrome VS centrepiece, stroked corner
  // initials, lower-third HOME/AWAY panel. Source-of-truth template lives at
  // C:/Users/kepne/projects/L - PVTKRRX/PCnestspeaker/python-templates/02-broadcast/generate.py
  // Scaled from canonical 400x600 to PVTKRRX 600x900 (1.5x).
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const W = BROADCAST_W   // 600
  const H = BROADCAST_H   // 900
  const label = broadcastLabelForRender(event, m)
  const palette = broadcastPaletteFor(event, m, label)
  const home = m.home
  const away = m.away
  const sportIcon = m.sport_icon || sportIconFor(event, m)
  const round = normalizeSpace(m.round || m.session || m.eventDetail || '')
  const venue = normalizeSpace(m.venue || '')
  const date = normalizeSpace(m.date || '')
  const time = normalizeSpace(m.time || '')
  const homeName = (home?.name || '').toString()
  const awayName = (away?.name || '').toString()
  const homeShort = (home?.short || home?.initials || homeName.slice(0, 3) || 'HME').toString().toUpperCase()
  const awayShort = (away?.short || away?.initials || awayName.slice(0, 3) || 'AWY').toString().toUpperCase()

  // Diagonal halves (canonical 0,0 -> W*0.6,0 -> W*0.4,H -> 0,H for home)
  const halves = `
    <polygon data-role="home-half" points="0,0 ${W * 0.6},0 ${W * 0.4},${H} 0,${H}" fill="url(#broadcastSideHome)"/>
    <polygon data-role="away-half" points="${W * 0.6},0 ${W},0 ${W},${H} ${W * 0.4},${H}" fill="url(#broadcastSideAway)"/>
    <line x1="${W / 2 - 45}" y1="0" x2="${W / 2 + 45}" y2="${H}" stroke="rgba(255,255,255,0.85)" stroke-width="4" filter="url(#broadcastSeamBlur)" opacity="0.7"/>`

  // Background sport glyph at very low opacity
  const bgGlyph = sportGlyph(sportIcon, W / 2, H / 2, 630, '#ffffff', 0.06)

  // Top bar — code box + league + sport + LIVE indicator
  const liveDot = m.isLive
    ? `<circle cx="${W - 66}" cy="42" r="5" fill="#ef4444" filter="url(#broadcastRedGlow)"/>
       <text class="sans" data-role="broadcast-live" x="${W - 51}" y="48" font-size="14" font-weight="700" fill="white" letter-spacing="2">LIVE</text>`
    : ''
  const topBar = `
    <g data-role="broadcast-top">
      <rect x="27" y="27" width="48" height="33" fill="none" stroke="white" stroke-width="1.4"/>
      <text class="bebas" x="51" y="51" text-anchor="middle" font-size="20" fill="white">${e((m.league_code || label || '').toString().slice(0, 4).toUpperCase() || 'SP')}</text>
      <text class="bebas" x="87" y="42" font-size="18" fill="white" letter-spacing="0.1em">${e((m.league || label || '').toString().toUpperCase())}</text>
      <text class="mono" x="87" y="60" font-size="10" fill="white" opacity="0.65" letter-spacing="2.5">${e((m.sport || '').toString().toUpperCase())}</text>
      ${liveDot}
    </g>`

  // Pair branch — diagonal halves + circular team badges + chrome VS centre + lower third
  // Badges sit on the diagonal: HOME upper-left of VS (on home half), AWAY lower-right of VS (on away half).
  // Filled with each side's primary colour, white ring, white code text — readable at thumbnail size.
  const homePrimary = home.primary || '#1f2a44'
  const awayPrimary = away.primary || '#3a1c1c'
  // Audit fix (2026-05-05): badges shrunk from 52→40 so the central chrome VS
  // regains primary focus on team-vs-team posters. Real SportsMeta logos drop
  // into these slots later; the sized-down disc is the fallback weight.
  const badgeR = 40
  const homeBadgeX = 170
  const homeBadgeY = 320
  const awayBadgeX = 430
  const awayBadgeY = 580
  const broadcastSlots = []
  const codeFontSize = (code) => code.length <= 2 ? 32 : code.length <= 3 ? 28 : 22
  const codeYOffset = (code) => Math.round(codeFontSize(code) * 0.34)
  const pairBlock = m.hasMatchup ? `
    <g data-role="broadcast-home-badge">
      <circle cx="${homeBadgeX}" cy="${homeBadgeY + 4}" r="${badgeR}" fill="rgba(0,0,0,0.5)" filter="url(#broadcastSeamBlur)"/>
      <circle cx="${homeBadgeX}" cy="${homeBadgeY}" r="${badgeR}" fill="${homePrimary}" stroke="rgba(255,255,255,0.92)" stroke-width="2.4"/>
      <text class="bebas" data-role="broadcast-home-code" x="${homeBadgeX}" y="${homeBadgeY + codeYOffset(homeShort)}" text-anchor="middle" font-size="${codeFontSize(homeShort)}" fill="#ffffff" letter-spacing="1.6">${e(homeShort)}</text>
    </g>
    <g data-role="broadcast-versus-mark" transform="translate(${W / 2} ${H / 2})">
      <text class="bebas" x="0" y="33" text-anchor="middle" font-size="132" fill="url(#broadcastChrome)" letter-spacing="6" filter="url(#broadcastVsShadow)" transform="skewX(-12)">VS</text>
    </g>
    <g data-role="broadcast-away-badge">
      <circle cx="${awayBadgeX}" cy="${awayBadgeY + 4}" r="${badgeR}" fill="rgba(0,0,0,0.5)" filter="url(#broadcastSeamBlur)"/>
      <circle cx="${awayBadgeX}" cy="${awayBadgeY}" r="${badgeR}" fill="${awayPrimary}" stroke="rgba(255,255,255,0.92)" stroke-width="2.4"/>
      <text class="bebas" data-role="broadcast-away-code" x="${awayBadgeX}" y="${awayBadgeY + codeYOffset(awayShort)}" text-anchor="middle" font-size="${codeFontSize(awayShort)}" fill="#ffffff" letter-spacing="1.6">${e(awayShort)}</text>
    </g>
    ${round ? `<text class="mono" x="${W / 2}" y="${H / 2 + 147}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.85)" letter-spacing="2.5">— ${e(round.toUpperCase())} —</text>` : ''}
    <rect x="0" y="${H - 195}" width="${W}" height="195" fill="url(#broadcastBottomBar)"/>
    <g fill="white">
      <text data-role="broadcast-home-label" x="27" y="${H - 99}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="13" font-weight="700" fill="${home.primary}" letter-spacing="1.8">${e(m.leftLabel)}</text>
      <text data-role="broadcast-title" class="broadcast-title" x="27" y="${H - 72}" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="27" font-weight="800" fill="#ffffff" letter-spacing="1">${e(homeName)}</text>
      <text data-role="broadcast-away-label" x="${W - 27}" y="${H - 99}" text-anchor="end" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="13" font-weight="700" fill="${away.primary}" letter-spacing="1.8">${e(m.rightLabel)}</text>
      <text data-role="broadcast-title" class="broadcast-title" x="${W - 27}" y="${H - 72}" text-anchor="end" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="27" font-weight="800" fill="#ffffff" letter-spacing="1">${e(awayName)}</text>
    </g>
    <line x1="27" y1="${H - 57}" x2="${W - 27}" y2="${H - 57}" stroke="rgba(255,255,255,0.4)" stroke-width="0.9"/>
    <text class="mono" data-role="broadcast-venue" x="27" y="${H - 33}" font-size="13" fill="rgba(255,255,255,0.7)" letter-spacing="1.6">${e(venue.toUpperCase())}</text>
    <text class="mono" data-role="broadcast-date" x="${W - 27}" y="${H - 33}" text-anchor="end" font-size="13" fill="rgba(255,255,255,0.7)" letter-spacing="1.6">${e(date)}${time ? ` · ${e(time.toUpperCase())}` : ''}</text>
    <text data-role="broadcast-wordmark" x="${W / 2}" y="${H - 12}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.55)" letter-spacing="4">${e(BROADCAST_WORDMARK)}</text>` : ''

  // Solo branch — single-event poster (motorsport, golf, etc. with no real pair)
  // Same diagonal background still draws but the lower-third + chrome VS are
  // replaced with an event-only treatment so we don't render fake matchups.
  // Prefer the original event title (richer signal — "Gear Up", "Islas Canarias
  // Saturday Highlights", "British Grand Prix") over the adapter's shortened
  // event_short which strips noise tokens we'd want on a poster.
  const soloTitleRaw = normalizeSpace(
    event.eventTitle ||
    event.title ||
    event.eventName ||
    m.event_short ||
    m.league ||
    'Event'
  )
  const soloTitle = soloTitleRaw.toUpperCase()
  // Wrap long titles to up to 2 lines + auto-shrink font size to keep text
  // inside the 510px safe width (W=600 minus 45px margins each side).
  const soloLines = wrapBroadcastSoloTitle(soloTitle, 510)
  const soloFontSize = soloLines.length > 1 ? 44 : (soloTitle.length > 16 ? 46 : 58)
  const soloBaseY = H / 2 + 195 - (soloLines.length - 1) * Math.round(soloFontSize * 0.5)
  // Solo: dominant league wordmark (F1, UFC, ATP, etc.) replaces the sport glyph
  // so single-event posters echo the broadcast pair treatment.
  const leagueMarkRaw = (m.league_code || label || m.sport || '').toString().toUpperCase().slice(0, 6) || 'EVENT'
  const leagueMarkSize = leagueMarkRaw.length <= 2 ? 220
    : leagueMarkRaw.length <= 3 ? 180
    : leagueMarkRaw.length <= 4 ? 140
    : 100
  const accentTopY = 80
  const accentBottomY = m.hasMatchup ? H - 205 : H - 137
  const soloBlock = !m.hasMatchup ? `
    <g data-role="broadcast-solo">
      <text class="bebas" data-role="broadcast-league-mark" x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-size="${leagueMarkSize}" font-weight="900" fill="#ffffff" letter-spacing="-2" filter="url(#broadcastVsShadow)">${e(leagueMarkRaw)}</text>
      ${soloLines.map((line, idx) => `<text data-role="broadcast-title" class="broadcast-title" x="${W / 2}" y="${soloBaseY + idx * Math.round(soloFontSize * 1.05)}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="${soloFontSize}" font-weight="800" fill="white" letter-spacing="2">${e(line)}</text>`).join('\n      ')}
      ${round ? `<text class="mono" x="${W / 2}" y="${soloBaseY + soloLines.length * Math.round(soloFontSize * 1.05) + 14}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.85)" letter-spacing="2.5">— ${e(round.toUpperCase())} —</text>` : ''}
    </g>
    <rect x="0" y="${H - 130}" width="${W}" height="130" fill="url(#broadcastBottomBar)"/>
    <text class="mono" data-role="broadcast-venue" x="27" y="${H - 60}" font-size="13" fill="rgba(255,255,255,0.7)" letter-spacing="1.6">${e(venue.toUpperCase())}</text>
    <text class="mono" data-role="broadcast-date" x="${W - 27}" y="${H - 60}" text-anchor="end" font-size="13" fill="rgba(255,255,255,0.7)" letter-spacing="1.6">${e(date)}${time ? ` · ${e(time.toUpperCase())}` : ''}</text>
    <text data-role="broadcast-wordmark" x="${W / 2}" y="${H - 24}" text-anchor="middle" font-family="'Inter','Helvetica Neue','Arial',sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.55)" letter-spacing="4">${e(BROADCAST_WORDMARK)}</text>` : ''

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(soloTitle)}">
  <defs>
    <radialGradient id="broadcastSideHome" cx="30%" cy="40%" r="80%">
      <stop offset="0%" stop-color="${home.primary || '#1f2a44'}"/>
      <stop offset="70%" stop-color="${home.secondary || '#0a1020'}"/>
      <stop offset="100%" stop-color="#060810"/>
    </radialGradient>
    <radialGradient id="broadcastSideAway" cx="70%" cy="60%" r="80%">
      <stop offset="0%" stop-color="${away.primary || '#3a1c1c'}"/>
      <stop offset="70%" stop-color="${away.secondary || '#1a0808'}"/>
      <stop offset="100%" stop-color="#060810"/>
    </radialGradient>
    <linearGradient id="broadcastChrome" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#d8d8d8"/>
      <stop offset="55%" stop-color="#8a8a8a"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="broadcastBottomBar" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="35%" stop-color="rgba(0,0,0,0.85)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.95)"/>
    </linearGradient>
    <radialGradient id="broadcastVignette" cx="50%" cy="50%" r="75%">
      <stop offset="35%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </radialGradient>
    <pattern id="broadcastScanlines" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="rgba(255,255,255,0.04)"/>
    </pattern>
    <filter id="broadcastSeamBlur"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="broadcastRedGlow"><feGaussianBlur stdDeviation="1.5"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="broadcastVsShadow"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="4"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>${FONTS_BEBAS_MONO_SANS}</style>
  </defs>
  <g data-role="broadcast-layout" data-layout-family="BROADCAST" data-layout-style="sportsmeta-default-poster" data-palette="${e(palette.key)}">
    <rect width="${W}" height="${H}" fill="#000"/>
    ${halves}
    <g data-role="broadcast-pattern" opacity="0.9">
      <rect width="${W}" height="${H}" fill="url(#broadcastScanlines)" style="mix-blend-mode:overlay"/>
      <rect width="${W}" height="${H}" fill="url(#broadcastVignette)"/>
    </g>
    ${bgGlyph}
    ${topBar}
    ${pairBlock}
    ${soloBlock}
    <rect data-role="inner-border" x="30" y="30" width="540" height="840" rx="28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <rect data-role="accent-top" x="30" y="${accentTopY}" width="540" height="4" rx="2" fill="${palette.accent}"/>
    <rect data-role="accent-bottom" x="30" y="${accentBottomY}" width="540" height="4" rx="2" fill="${palette.accent2}"/>
    <g data-role="pill-badge"></g>
  </g>
</svg>`
  return {
    svg,
    slots: broadcastSlots,
    overlay: ''
  }
}

function renderCompetitorVsCompetitor(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const { leagueLabel, sportLabel } = competitorLabelFor(event, m)
  const paletteKey = leagueLabel === 'ATP' || leagueLabel === 'WTA' ? leagueLabel : sportLabel
  const palette = {
    SNOOKER: ['#113d2e', '#07110f', '#d6b36a', '#f7f0dc'],
    TENNIS: ['#174f2a', '#09140d', '#d7ff4f', '#f5f7eb'],
    ATP: ['#103d67', '#071626', '#79d6ff', '#f2fbff'],
    WTA: ['#682155', '#160715', '#ff8bd8', '#fff0fa'],
    UFC: ['#8f1616', '#130707', '#f7d046', '#fff4dd'],
    MMA: ['#7a1b1b', '#100708', '#f7d046', '#fff4dd'],
    BOXING: ['#79351b', '#120907', '#f0c173', '#fff1dc'],
    DARTS: ['#123b58', '#071019', '#ffcf4d', '#eef8ff'],
    WRESTLING: ['#50307b', '#10091a', '#d5b3ff', '#f8f1ff']
  }[paletteKey] || ['#19324a', '#07111b', '#e7b85d', '#f7f0dc']
  const [primary, secondary, accent, paper] = palette
  const one = cleanBroadcastText(m.home.name) || m.home.name
  const two = cleanBroadcastText(m.away.name) || m.away.name
  const oneBox = { x: 34, y: 132, width: 286, height: 104 }
  const twoBox = { x: 80, y: 364, width: 286, height: 104 }
  const vsBox = { x: 168, y: 268, width: 64, height: 64 }
  const logoSlot = { role: 'league', left: 304, top: 32, size: 58 }
  const oneFit = fitCompetitorName(one, oneBox.width)
  const twoFit = fitCompetitorName(two, twoBox.width)
  const leagueLabelAttrs = fitTextAttributes(leagueLabel, 150, 15, 9)
  const sportLabelAttrs = fitTextAttributes(sportLabel, 150, 7, 5)
  const maybeLive = m.isLive
    ? `<g data-role="live-status" transform="translate(306 28)"><circle cx="0" cy="0" r="4" fill="#ff2d2d"/><text x="12" y="4" class="mono" font-size="9" font-weight="900" fill="${paper}" letter-spacing="2">LIVE</text></g>`
    : ''
  const subtitle = normalizeSpace(m.round || m.session || m.venue)
  const footerLeft = normalizeSpace(m.date || '')
  const footerRight = normalizeSpace(event.source || m.time || '')
  const slots = [logoSlot]
  const inner = `<defs>
    <style>${FONTS_BEBAS_MONO_SANS}</style>
    <linearGradient id="competitorBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${primary}"/><stop offset="58%" stop-color="${secondary}"/><stop offset="100%" stop-color="#050608"/></linearGradient>
    <radialGradient id="competitorSpotA" cx="16%" cy="24%" r="72%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.20"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="competitorSpotB" cx="85%" cy="72%" r="68%"><stop offset="0%" stop-color="${paper}" stop-opacity="0.14"/><stop offset="100%" stop-color="${paper}" stop-opacity="0"/></radialGradient>
    <pattern id="competitorGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(255,248,220,0.05)" stroke-width="0.7"/></pattern>
    <filter id="competitorShadow"><feDropShadow dx="0" dy="12" stdDeviation="11" flood-color="#000000" flood-opacity="0.36"/></filter>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#competitorBg)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#competitorSpotA)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#competitorSpotB)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#competitorGrid)"/>
  <path d="M28 109 H372" stroke="rgba(255,248,220,0.22)" stroke-width="1.4"/>
  <path d="M28 489 H372" stroke="rgba(255,248,220,0.22)" stroke-width="1.4"/>
  <path d="M38 118 C100 82 169 79 236 103" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="3.4"/>
  <path d="M362 482 C300 520 231 523 164 499" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="3.4"/>
  <g data-role="event-identity" data-league-label="${e(leagueLabel)}" data-sport-label="${e(sportLabel)}" transform="translate(28 28)">
    <rect x="0" y="0" width="166" height="50" rx="5" fill="rgba(5,6,8,0.62)" stroke="rgba(255,248,220,0.36)"/>
    <text data-role="league-label" data-league-label="${e(leagueLabel)}" class="bebas" x="13" y="25" ${leagueLabelAttrs} fill="${paper}" letter-spacing="0">${e(leagueLabel)}</text>
    <text data-role="sport-label" data-sport-label="${e(sportLabel)}" class="mono" x="13" y="41" ${sportLabelAttrs} fill="rgba(255,248,220,0.72)" letter-spacing="2">${e(sportLabel)}</text>
  </g>
  <g data-role="event-logo-slot" data-box-x="${logoSlot.left}" data-box-y="${logoSlot.top}" data-box-width="${logoSlot.size}" data-box-height="${logoSlot.size}">
    <rect x="${logoSlot.left}" y="${logoSlot.top}" width="${logoSlot.size}" height="${logoSlot.size}" rx="6" fill="rgba(255,248,220,0.06)" stroke="rgba(255,248,220,0.22)"/>
  </g>
  ${maybeLive}
  <g data-role="competitor-one" data-competitor-side="one" data-competitor-name="${e(one)}"
     data-box-x="${oneBox.x}" data-box-y="${oneBox.y}" data-box-width="${oneBox.width}" data-box-height="${oneBox.height}" filter="url(#competitorShadow)">
    <text class="mono" x="${oneBox.x}" y="${oneBox.y - 13}" font-size="8" font-weight="900" fill="${accent}" letter-spacing="2.5">COMPETITOR ONE</text>
    ${renderCompetitorNameLines(oneFit, oneBox.x, oneBox.y + 41, 'start', 'competitor-one-name', 'one', e)}
  </g>
  <g data-role="versus" data-box-x="${vsBox.x}" data-box-y="${vsBox.y}" data-box-width="${vsBox.width}" data-box-height="${vsBox.height}" transform="translate(${vsBox.x + vsBox.width / 2} ${vsBox.y + vsBox.height / 2})">
    <circle cx="0" cy="0" r="28" fill="rgba(5,6,8,0.80)" stroke="${accent}" stroke-width="2.2"/>
    <text data-role="matchup-vs" class="bebas" x="0" y="9" text-anchor="middle" font-size="28" font-weight="900" fill="${paper}" letter-spacing="0">VS</text>
  </g>
  <g data-role="competitor-two" data-competitor-side="two" data-competitor-name="${e(two)}"
     data-box-x="${twoBox.x}" data-box-y="${twoBox.y}" data-box-width="${twoBox.width}" data-box-height="${twoBox.height}" filter="url(#competitorShadow)">
    <text class="mono" x="${twoBox.x + twoBox.width}" y="${twoBox.y - 13}" text-anchor="end" font-size="8" font-weight="900" fill="${accent}" letter-spacing="2.5">COMPETITOR TWO</text>
    ${renderCompetitorNameLines(twoFit, twoBox.x + twoBox.width, twoBox.y + 41, 'end', 'competitor-two-name', 'two', e)}
  </g>
  ${subtitle ? `<text data-role="event-subtitle" class="mono" x="28" y="540" font-size="8" font-weight="800" fill="rgba(255,248,220,0.70)" letter-spacing="2">${e(subtitle.toUpperCase())}</text>` : ''}
  ${footerLeft ? `<text data-role="footer-date" class="mono" x="28" y="568" font-size="8.5" font-weight="800" fill="rgba(255,248,220,0.62)" letter-spacing="1.6">${e(footerLeft.toUpperCase())}</text>` : ''}
  ${footerRight ? `<text data-role="footer-source" class="mono" x="${SOURCE_W - 28}" y="568" text-anchor="end" font-size="8.5" font-weight="800" fill="rgba(255,248,220,0.62)" letter-spacing="1.6">${e(footerRight.toUpperCase())}</text>` : ''}`
  return wrapTemplateSvg(inner, slots, variant, {
    layoutFamily: 'COMPETITOR_VS_COMPETITOR',
    leagueLabel,
    sportLabel,
    competitorOne: one,
    competitorTwo: two
  })
}

// SINGLE_EVENT_MOTORSPORT
//
// One central motorsport identity, no VS, sport-specific glyph. Mirrors the
// Python proof generator at backdrops/python-backdrops/10-single-event-motorsport/
// so smoke assertions can rely on identical data-role markers from both paths.

const MOTORSPORT_LEAGUE_RULES = [
  { pattern: /\b(?:moto\s*gp|motogp)\b/i, label: 'MOTOGP', sport: 'MotoGP', icon: 'motogp-bike' },
  { pattern: /\b(?:wrc|world\s+rally(?:\s+championship)?|rally)\b/i, label: 'WRC', sport: 'WRC', icon: 'wrc-rally' },
  { pattern: /\b(?:formula\s*1|formula\s*one|formula1|f1)\b/i, label: 'FORMULA 1', sport: 'Formula 1', icon: 'f1' },
  { pattern: /\bnascar\b/i, label: 'NASCAR', sport: 'NASCAR', icon: 'nascar-oval' },
  { pattern: /\b(?:indycar|indy\s*car|indy\s*500)\b/i, label: 'INDYCAR', sport: 'IndyCar', icon: 'indycar-oval' },
  { pattern: /\b(?:wec|world\s+endurance|formula\s*e|supercars?|v8sc)\b/i, label: 'MOTORSPORT', sport: 'Motorsport', icon: 'motorsport-helmet' },
  { pattern: /\b(?:motorsport|motor\s+racing|grand\s+prix|race\s+series)\b/i, label: 'MOTORSPORT', sport: 'Motorsport', icon: 'motorsport-helmet' }
]

const MOTORSPORT_PALETTES = {
  MOTOGP: { primary: '#c81d2a', secondary: '#1a0606', accent: '#ffd166', paper: '#fff4e0' },
  WRC: { primary: '#2563eb', secondary: '#0a1024', accent: '#fbbf24', paper: '#f5f7ff' },
  'FORMULA 1': { primary: '#e10600', secondary: '#15151e', accent: '#f4f4f4', paper: '#ffffff' },
  NASCAR: { primary: '#ffd200', secondary: '#111111', accent: '#0033a0', paper: '#fff8d6' },
  INDYCAR: { primary: '#1f3a8a', secondary: '#0b1228', accent: '#f97316', paper: '#eef2ff' },
  MOTORSPORT: { primary: '#1f2937', secondary: '#0a0d12', accent: '#ef4444', paper: '#f3f4f6' }
}

function classifyMotorsportLeague(event = {}, m = {}) {
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
    event.sport,
    m.broadcastLabel,
    m.league_code,
    m.league,
    m.event,
    m.event_short
  ].filter(Boolean).join(' '))
  for (const rule of MOTORSPORT_LEAGUE_RULES) {
    if (rule.pattern.test(text)) return { label: rule.label, sport: rule.sport, icon: rule.icon }
  }
  return { label: 'MOTORSPORT', sport: 'Motorsport', icon: 'motorsport-helmet' }
}

function isMotorsportPlaceholder(value = '') {
  const clean = normalizeSpace(value).toLowerCase()
  if (!clean) return true
  return /^(?:tba|tbd|n\/?a|na|unknown|undefined|null|event|session|sports?\s*event|sport\s*event|motorsport\s*event|matchup|tournament)$/i.test(clean)
}

function fitMotorsportTitle(text = '', maxWidth = 350, baseSize = 50, minSize = 26) {
  const clean = normalizeSpace(text)
  if (!clean) return { text: '', lines: [], fontSize: baseSize, maxWidth, status: 'empty' }
  let fontSize = baseSize
  let lines = [clean]
  while (fontSize > minSize && estimatedTextWidth(clean, fontSize) > maxWidth) fontSize -= 2
  if (estimatedTextWidth(clean, fontSize) > maxWidth) {
    const computeWrap = (size) => {
      const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(size * 0.58, 1)))
      return splitLines(clean, maxChars, 3)
    }
    lines = computeWrap(fontSize)
    while (fontSize > minSize && lines.some((line) => estimatedTextWidth(line, fontSize) > maxWidth)) {
      fontSize -= 2
      lines = computeWrap(fontSize)
    }
  }
  const fitted = lines.length > 0 && lines.every((line) => estimatedTextWidth(line, fontSize) <= maxWidth)
  return { text: clean, lines, fontSize, maxWidth, status: fitted ? 'fit' : 'fit-with-textLength' }
}

function motorsportGlyphMarkup(iconKind, cx, cy, size, paper, accent) {
  const half = size / 2
  const ringRadius = size * 0.46
  const strokeColor = paper
  const innerScale = (size / 200).toFixed(3)
  const ringStroke = Math.max(2, Math.round(size * 0.018))
  const ring = `<circle cx="${cx}" cy="${cy}" r="${ringRadius}" fill="rgba(0,0,0,0.32)" stroke="${strokeColor}" stroke-width="${ringStroke}"/>`
  const inner = (() => {
    if (iconKind === 'motogp-bike') {
      return `<g transform="translate(${cx} ${cy}) scale(${innerScale})" stroke="${strokeColor}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="-46" cy="34" r="30"/>
        <circle cx="50" cy="34" r="30"/>
        <path d="M -46 34 L -8 -10 L 36 -10 L 50 34"/>
        <path d="M -10 -8 L 6 -36 L 28 -28 L 22 -8"/>
        <circle cx="14" cy="-46" r="14" fill="${accent}" stroke="none"/>
        <path d="M -28 -2 L -56 16"/>
      </g>`
    }
    if (iconKind === 'wrc-rally') {
      return `<g transform="translate(${cx} ${cy}) scale(${innerScale})" stroke="${strokeColor}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M -68 26 L -54 -4 L -18 -22 L 30 -22 L 54 -4 L 68 26 Z"/>
        <path d="M -34 -4 L -10 -16 L 22 -16 L 38 -4"/>
        <circle cx="-40" cy="34" r="16"/>
        <circle cx="42" cy="34" r="16"/>
        <path d="M -84 50 L -54 50" stroke="${accent}"/>
        <path d="M -90 62 L -40 62" stroke="${accent}"/>
        <path d="M -78 -14 L -52 -14" stroke="${accent}"/>
      </g>`
    }
    if (iconKind === 'f1') {
      return `<g transform="translate(${cx} ${cy}) scale(${innerScale})" stroke="${strokeColor}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M -78 18 L -52 18 L -38 0 L 30 0 L 50 18 L 78 18 L 78 30 L 50 30 L 38 42 L -22 42 L -38 30 L -78 30 Z"/>
        <circle cx="-50" cy="36" r="14" fill="${accent}" stroke="none"/>
        <circle cx="56" cy="36" r="14" fill="${accent}" stroke="none"/>
        <path d="M -82 12 L -90 6 L -70 6"/>
        <path d="M 70 6 L 90 6 L 82 12"/>
      </g>`
    }
    if (iconKind === 'nascar-oval' || iconKind === 'indycar-oval') {
      return `<g transform="translate(${cx} ${cy}) scale(${innerScale})" stroke="${strokeColor}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="0" cy="6" rx="78" ry="40"/>
        <ellipse cx="0" cy="6" rx="58" ry="22"/>
        <path d="M -34 6 L 34 6" stroke="${accent}" stroke-dasharray="6 6"/>
        <rect x="-6" y="-46" width="44" height="22" fill="none"/>
        <rect x="-6" y="-46" width="11" height="11" fill="${strokeColor}" stroke="none"/>
        <rect x="16" y="-46" width="11" height="11" fill="${strokeColor}" stroke="none"/>
        <rect x="5" y="-35" width="11" height="11" fill="${strokeColor}" stroke="none"/>
        <rect x="27" y="-35" width="11" height="11" fill="${strokeColor}" stroke="none"/>
        <line x1="-6" y1="-46" x2="-6" y2="-2" stroke-width="4"/>
      </g>`
    }
    return `<g transform="translate(${cx} ${cy}) scale(${innerScale})" stroke="${strokeColor}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M -52 16 C -52 -34 52 -34 52 16 L 52 26 L -52 26 Z"/>
        <path d="M -42 -2 L 42 -2 L 38 14 L -38 14 Z" fill="${accent}" stroke="none"/>
        <circle cx="0" cy="58" r="22"/>
        <circle cx="0" cy="58" r="8" fill="${strokeColor}" stroke="none"/>
      </g>`
  })()
  return `<g data-role="motorsport-identity" data-icon-kind="${iconKind}">${ring}${inner}</g>`
}

const MOTORSPORT_LEAGUE_PREFIX_RE = /^\s*(?:formula\s*1|formula\s*one|formula1|f1|motogp|moto\s*gp|wrc|world\s+rally(?:\s+championship)?|nascar|indycar|indy\s*car|wec|formula\s*e|supercars?|v8sc|motorsport)\b[\s\-:.]*/i
const RELEASE_NOISE_TAIL_RE = /\b(?:1080p|2160p|720p|web[\-._\s]?dl|web[\-._\s]?rip|web|hdtv|x264|x265|h264|h265|hevc|av1|repack|proper|aac|ddp\d?(?:\.\d)?|multi|english|fps\d+|mkv|mp4)\b/gi

function stripMotorsportLeaguePrefix(value = '') {
  return normalizeSpace(String(value || '').replace(/[._]+/g, ' ').replace(MOTORSPORT_LEAGUE_PREFIX_RE, '').replace(RELEASE_NOISE_TAIL_RE, ' '))
}

function pickMotorsportEventTitle(event = {}, m = {}, label = '') {
  const labelEscaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const labelPrefix = labelEscaped ? new RegExp(`^${labelEscaped}\\s+`, 'i') : null
  const fromCandidates = (values) => {
    for (const value of values) {
      const clean = normalizeSpace(value)
      if (!clean || isMotorsportPlaceholder(clean)) continue
      const stripped = labelPrefix ? clean.replace(labelPrefix, '').trim() : clean
      if (stripped && !isMotorsportPlaceholder(stripped)) return stripped
      if (clean && !isMotorsportPlaceholder(clean)) return clean
    }
    return ''
  }
  // Prefer a clean rawTitle stripped of motorsport league prefix when the
  // normalized eventTitle came back single-token or shorter — the upstream
  // motorsport normalizer drops digits like "Daytona 500" -> "Daytona" and
  // mangles "Long Beach Grand Prix" -> "Beach Grand Prix".
  const fromRaw = stripMotorsportLeaguePrefix(event.rawTitle || '')
  const fromNormalized = fromCandidates([
    event.eventTitle,
    event.event_title,
    event.title,
    m.event,
    m.event_short,
    event.eventShort,
    event.event_short
  ])
  if (fromRaw) {
    const rawWords = fromRaw.split(/\s+/).filter(Boolean)
    const normWords = fromNormalized.split(/\s+/).filter(Boolean)
    if (!fromNormalized) return fromRaw
    if (rawWords.length > normWords.length) return fromRaw
    if (rawWords.length === normWords.length && fromRaw.length > fromNormalized.length) return fromRaw
  }
  if (fromNormalized) return fromNormalized
  return fromCandidates([event.competition, event.league, m.league])
}

function renderSingleEventMotorsport(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const { label, sport, icon } = classifyMotorsportLeague(event, m)
  const palette = MOTORSPORT_PALETTES[label] || MOTORSPORT_PALETTES.MOTORSPORT
  const { primary, secondary, accent, paper } = palette
  const eventTitleRaw = pickMotorsportEventTitle(event, m, label)
  const eventTitle = eventTitleRaw || (label === 'MOTORSPORT' ? 'Motorsport Event' : `${sport} Event`)
  const subtitleCandidate = normalizeSpace(
    m.session ||
    m.round ||
    event.session ||
    event.round ||
    (event.competition && event.competition !== eventTitle ? event.competition : '') ||
    (event.league && event.league !== eventTitle && event.league !== sport ? event.league : '')
  )
  const subtitle = !subtitleCandidate || isMotorsportPlaceholder(subtitleCandidate) ? '' : subtitleCandidate
  const isLive = m.isLive === true
  const date = normalizeSpace(m.date || event.date || '')

  const labelBox = { x: 24, y: 24, width: 156, height: 44 }
  const identityBox = { x: 90, y: 130, width: 220, height: 220 }
  const titleBox = { x: 24, y: 380, width: 352, height: 140 }

  const titleFit = fitMotorsportTitle(eventTitle, titleBox.width - 8, 44, 22)
  const lineStep = Math.round(titleFit.fontSize * 1.05)
  const titleStartY = titleBox.y + 44

  const titleMarkup = titleFit.lines.map((line, index) => {
    const overFlow = estimatedTextWidth(line, titleFit.fontSize) > titleFit.maxWidth
    const length = overFlow ? ` textLength="${titleFit.maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''
    return `<text data-role="event-title" data-fit-status="${titleFit.status}" x="${titleBox.x}" y="${titleStartY + index * lineStep}" font-size="${titleFit.fontSize}" font-family="Bebas Neue, Impact, Arial, sans-serif" font-weight="800" letter-spacing="0" fill="${paper}"${length}>${e(line)}</text>`
  }).join('\n  ')

  const subtitleMarkup = subtitle
    ? `<text data-role="event-subtitle" x="${titleBox.x}" y="${titleStartY + titleFit.lines.length * lineStep + 20}" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" fill="rgba(255,255,255,0.78)" letter-spacing="2">${e(subtitle.toUpperCase())}</text>`
    : ''

  const liveMarkup = isLive
    ? `<g data-role="live-status" data-live="true" transform="translate(${SOURCE_W - 24} 32)"><circle cx="0" cy="0" r="5" fill="#ff2d2d"/><text x="-10" y="5" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="900" fill="${paper}" letter-spacing="2">LIVE</text></g>`
    : ''

  const dateMarkup = date && !isMotorsportPlaceholder(date)
    ? `<text data-role="footer-date" x="${SOURCE_W - 24}" y="${SOURCE_H - 24}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="800" fill="rgba(255,255,255,0.72)" letter-spacing="2">${e(date)}</text>`
    : ''

  const slots = [{ role: 'league', left: identityBox.x, top: identityBox.y, size: identityBox.width }]

  const inner = `<defs>
    <linearGradient id="motorsportBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="55%" stop-color="${secondary}"/>
      <stop offset="100%" stop-color="#04050a"/>
    </linearGradient>
    <radialGradient id="motorsportSpot" cx="22%" cy="20%" r="80%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="motorsportGrid" width="22" height="22" patternUnits="userSpaceOnUse">
      <path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
    <filter id="motorsportShadow"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity="0.34"/></filter>
  </defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#motorsportBg)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#motorsportSpot)"/>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#motorsportGrid)"/>
  <path d="M0 76 H${SOURCE_W}" stroke="rgba(255,255,255,0.20)" stroke-width="1.4"/>
  <path d="M0 374 H${SOURCE_W}" stroke="rgba(255,255,255,0.12)" stroke-width="1.4"/>

  <g data-role="sport-label" data-league-label="${e(label)}" data-sport-label="${e(sport)}"
     data-box-x="${labelBox.x}" data-box-y="${labelBox.y}" data-box-width="${labelBox.width}" data-box-height="${labelBox.height}"
     transform="translate(${labelBox.x} ${labelBox.y})">
    <rect x="0" y="0" width="${labelBox.width}" height="${labelBox.height}" rx="5" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.35)"/>
    <text x="12" y="22" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="900" fill="${paper}" letter-spacing="2">${e(label)}</text>
    <text x="12" y="36" font-family="Inter, Arial, sans-serif" font-size="8" font-weight="800" fill="rgba(255,255,255,0.7)" letter-spacing="3">${e(sport.toUpperCase())}</text>
  </g>
  ${liveMarkup}

  <g filter="url(#motorsportShadow)" data-role="motorsport-identity-box"
     data-box-x="${identityBox.x}" data-box-y="${identityBox.y}" data-box-width="${identityBox.width}" data-box-height="${identityBox.height}">
    ${motorsportGlyphMarkup(icon, identityBox.x + identityBox.width / 2, identityBox.y + identityBox.height / 2, identityBox.width, paper, accent)}
  </g>

  <g data-role="event-title-box" data-box-x="${titleBox.x}" data-box-y="${titleBox.y}" data-box-width="${titleBox.width}" data-box-height="${titleBox.height}">
    ${titleMarkup}
  </g>
  ${subtitleMarkup}
  ${dateMarkup}`

  return wrapTemplateSvg(inner, slots, variant, {
    layoutFamily: 'SINGLE_EVENT_MOTORSPORT',
    leagueLabel: label,
    sportLabel: sport,
    iconKind: icon,
    eventTitle: titleFit.text
  })
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
  <text class="bebas" x="${SOURCE_W / 2}" y="330" text-anchor="middle" font-size="${(m.eventTitle || m.event_short || '').length > 18 ? 24 : 32}" fill="white" letter-spacing="0.8">${e(m.eventTitle || m.event_short)}</text>
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
  // Audit fix G3.3: render team-initial monograms inside the badge orbs so
  // free-tier trading-card matches the canonical 04-trading-card layout (MC,
  // ARS letter monograms instead of empty solid orbs). Initials stay text-
  // only — no real team logo bytes embedded (G5).
  const homeMonoSize = (m.home.initials || '').length > 2 ? 30 : 36
  const awayMonoSize = (m.away.initials || '').length > 2 ? 30 : 36
  const homeMonoFill = readableAccent(m.home.primary)
  const awayMonoFill = readableAccent(m.away.primary)
  const feature = m.hasMatchup
    ? `<g transform="translate(110 170) rotate(-7)">
    <circle cx="0" cy="0" r="62" fill="url(#face)" stroke="${m.home.accent}" stroke-width="2" filter="url(#shadow1)"/>
    <text data-role="fallback-team-initials" data-team-side="home" data-team-name="${e(m.home.name)}" class="bebas" x="0" y="${Math.round(homeMonoSize * 0.34)}" text-anchor="middle" font-size="${homeMonoSize}" fill="${homeMonoFill}" letter-spacing="0">${e(m.home.initials)}</text>
  </g>
  <g transform="translate(${SOURCE_W - 110} 280) rotate(7)">
    <circle cx="0" cy="0" r="62" fill="${m.away.primary}" stroke="${m.away.accent}" stroke-width="2" filter="url(#shadow1)"/>
    <text data-role="fallback-team-initials" data-team-side="away" data-team-name="${e(m.away.name)}" class="bebas" x="0" y="${Math.round(awayMonoSize * 0.34)}" text-anchor="middle" font-size="${awayMonoSize}" fill="${awayMonoFill}" letter-spacing="0">${e(m.away.initials)}</text>
  </g>
  <g transform="translate(${SOURCE_W / 2} 225) rotate(45)"><rect x="-38" y="-38" width="76" height="76" fill="url(#diamond)" stroke="#2a1a08" stroke-width="2"/></g>
  <text class="bebas" x="${SOURCE_W / 2}" y="232" text-anchor="middle" font-size="26" fill="#2a1a08" letter-spacing="1">VS</text>
  <rect x="18" y="380" width="${SOURCE_W - 36}" height="80" fill="url(#namePlate)" stroke="#2a1a08" stroke-width="1.5"/>
  <text class="serif" x="${SOURCE_W / 2}" y="406" text-anchor="middle" font-size="16" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.home.name)}</text>
  <text class="mono" x="${SOURCE_W / 2}" y="422" text-anchor="middle" font-size="8" fill="#5a4a1f" letter-spacing="3">- VERSUS -</text>
  <text class="serif" x="${SOURCE_W / 2}" y="448" text-anchor="middle" font-size="16" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.away.name)}</text>`
    : `<g transform="translate(${SOURCE_W / 2} 210)"><circle cx="0" cy="0" r="74" fill="url(#face)" stroke="${m.home.accent}" stroke-width="2" filter="url(#shadow1)"/>${sportGlyph(m.sport_icon, 0, 0, 106, '#fff5d0', 0.82)}</g>
  <rect x="18" y="360" width="${SOURCE_W - 36}" height="104" fill="url(#namePlate)" stroke="#2a1a08" stroke-width="1.5"/>
  <text class="serif" x="${SOURCE_W / 2}" y="396" text-anchor="middle" font-size="${(m.eventTitle || m.event_short || '').length > 22 ? 14 : 19}" font-style="italic" font-weight="700" fill="#2a1a08">${e(m.eventTitle || m.event_short)}</text>
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
        { role: 'league', left: 24, top: 62, size: 48 }
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
    : `<text class="sans" x="18" y="${SOURCE_H - 50}" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">${e((m.league || m.sport || 'EVENT').toUpperCase())}</text><text class="bebas" x="18" y="${SOURCE_H - 32}" font-size="18" fill="white" letter-spacing="1">${e(m.eventTitle || m.event_short)}</text><text class="sans" x="${SOURCE_W - 18}" y="${SOURCE_H - 50}" text-anchor="end" font-size="8" fill="white" opacity="0.7" letter-spacing="1.6">${e(((m.session || m.round) ? 'SESSION' : 'DATE').toUpperCase())}</text><text class="bebas" x="${SOURCE_W - 18}" y="${SOURCE_H - 32}" text-anchor="end" font-size="18" fill="white" letter-spacing="1">${e(m.session || m.round || m.date)}</text>`
  const identityLeagueLabel = normalizeSpace(m.league_code || m.league || m.sport || 'EVT').toUpperCase()
  const identitySportLabel = normalizeSpace(m.sport || identityLeagueLabel).toUpperCase()
  const identityLeagueAttrs = fitTextAttributes(identityLeagueLabel, 44, 11, 7)
  const identitySportAttrs = fitTextAttributes(identitySportLabel, 44, 6.5, 5)
  // Audit fix (2026-05-05): when there's no real matchup (motorsport, golf,
  // tournament, wrestling), the giant opposing-corner letters used to be
  // initials of `m.home/away` which fell back to event-shorthand and session
  // strings — yielding unreadable pairs like "BG / QS" for F1 British GP /
  // Qualifying Saturday. Derive top from league code (F1, MGP, PGA…) and
  // bottom from event-title initials (BGP, PGA, WSC…) so the wordmark reads.
  const giantTop = m.hasMatchup
    ? m.home.initials
    : (m.league_code || initialsFor(m.league || m.sport, 'EVT')).toString().slice(0, 3).toUpperCase()
  const giantBottom = m.hasMatchup
    ? m.away.initials
    : initialsFor(m.eventTitle || m.event_short || m.round || m.session, m.away.initials || 'EVT').toString().slice(0, 3).toUpperCase()
  const inner = `<defs><style>${FONTS_BEBAS_MONO_SANS}</style></defs>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="#0F0E0C"/>
  <polygon points="0,0 ${SOURCE_W},0 ${SOURCE_W},${y32} 0,${y78}" fill="${m.home.primary}"/>
  <polygon points="0,${y78} ${SOURCE_W},${y32} ${SOURCE_W},${SOURCE_H} 0,${SOURCE_H}" fill="${m.away.primary}"/>
  <line x1="0" y1="${y78}" x2="${SOURCE_W}" y2="${y32}" stroke="#0F0E0C" stroke-width="4"/>
  <text class="bebas" x="-16" y="240" font-size="340" fill="${m.home.accent}" style="mix-blend-mode:difference" letter-spacing="-15">${e(giantTop)}</text>
  <text class="bebas" x="${SOURCE_W + 16}" y="${SOURCE_H - 20}" text-anchor="end" font-size="340" fill="${m.away.accent}" style="mix-blend-mode:difference" letter-spacing="-15">${e(giantBottom)}</text>
  <g transform="translate(${SOURCE_W / 2} ${SOURCE_H / 2}) rotate(-12)" style="mix-blend-mode:exclusion">${sportGlyph(m.sport_icon, 0, 0, 180, 'white', 0.95)}</g>
  <g transform="translate(${SOURCE_W - 104} 14)"><rect x="0" y="0" width="92" height="46" fill="#0F0E0C" stroke="rgba(255,255,255,0.15)"/><text class="bebas" x="64" y="20" text-anchor="middle" ${identityLeagueAttrs} fill="white" letter-spacing="0.1em">${e(identityLeagueLabel)}</text><text class="mono" x="64" y="32" text-anchor="middle" ${identitySportAttrs} fill="white" opacity="0.65" letter-spacing="2">${e(identitySportLabel)}</text></g>
  <g transform="translate(28 122) rotate(-6)"><rect x="0" y="0" width="160" height="22" fill="rgba(239,234,224,0.9)" stroke="#0F0E0C" stroke-width="2"/><text class="bebas" x="80" y="16" text-anchor="middle" font-size="13" fill="#0F0E0C" letter-spacing="1">${e(m.round.toUpperCase())}</text></g>
  <rect x="0" y="${SOURCE_H / 2 - 18}" width="${SOURCE_W}" height="36" fill="#0F0E0C"/>
  ${middleStrip}
  ${reg(17, 17)}${reg(SOURCE_W - 17, 17)}${reg(17, SOURCE_H - 17)}${reg(SOURCE_W - 17, SOURCE_H - 17)}
  <g style="mix-blend-mode:difference">${footer}<text class="mono" x="18" y="${SOURCE_H - 14}" font-size="8.5" fill="white" letter-spacing="1.6">${e(m.venue.toUpperCase())}</text><text class="mono" x="${SOURCE_W - 18}" y="${SOURCE_H - 14}" text-anchor="end" font-size="8.5" fill="white" letter-spacing="1.6">${e([m.date, m.time.toUpperCase()].filter(Boolean).join(' / '))}</text></g>`
  return wrapTemplateSvg(inner, slots, variant)
}

function stubSerial(m, leagueLabel = '') {
  const datePart = String(m.date || '').replace(/-/g, '').slice(2)
  if (m.isTeamMatchup || m.hasMatchup) {
    // Always emit the trailing dash so the date slot is visible even when the
    // event has no date set. Matches the legacy ticket-stub serial layout.
    return `#${m.home.short}-${m.away.short}-${datePart}`
  }
  // Solo / non-matchup events: no fake home/away. Use league code + date.
  const code = String(leagueLabel || m.league_code || m.sport || 'EVT').replace(/[^A-Z0-9]+/gi, '').toUpperCase().slice(0, 8)
  return `#${code}-${datePart}`
}

function renderTicketStub(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const perfRow = (y) => Array.from({ length: 25 }, (_, i) => 8 + i * 16).filter((x) => x < SOURCE_W).map((x) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#E6DEC9" stroke="rgba(60,40,15,0.35)"/>`).join('')
  const homeVisual = { x: 108, y: 205, size: 88 }
  const awayVisual = { x: 292, y: 355, size: 88 }
  const leagueLogoSlot = { x: 24, y: 25, size: 54 }
  const homeInitialSize = m.home.initials.length > 2 ? 25 : 30
  const awayInitialSize = m.away.initials.length > 2 ? 25 : 30
  const homeNameAttrs = fitTextAttributes(m.home.name, 156, 18, 10)
  const awayNameAttrs = fitTextAttributes(m.away.name, 156, 18, 10)
  const leagueLabel = normalizeSpace(m.league_code || m.league || m.sport).toUpperCase()
  const leagueLabelAttrs = fitTextAttributes(leagueLabel, 82, 18, 10)
  const sportLabelAttrs = fitTextAttributes(m.sport.toUpperCase(), 112, 6, 5)
  const soloTitle = normalizeSpace(m.eventTitle || m.event_short || m.league || m.sport)
  const soloTitleAttrs = fitTextAttributes(soloTitle, SOURCE_W - 44, 28, 18)
  const vsBox = { x: SOURCE_W / 2 - 35, y: SOURCE_H / 2 - 35, size: 70 }
  const layoutRole = m.isTeamMatchup ? 'team-vs-team-layout' : 'head-to-head-layout'
  const homeVisualRole = m.isTeamMatchup ? 'home-team-visual' : 'left-competitor-visual'
  const awayVisualRole = m.isTeamMatchup ? 'away-team-visual' : 'right-competitor-visual'
  const initialsRole = m.isTeamMatchup ? 'fallback-team-initials' : 'fallback-competitor-initials'
  const homeNameRole = m.isTeamMatchup ? 'home-team-name' : 'left-competitor-name'
  const awayNameRole = m.isTeamMatchup ? 'away-team-name' : 'right-competitor-name'
  const homeVisualIdentity = m.isTeamMatchup
    ? `data-team-side="home" data-team-name="${e(m.home.name)}"`
    : `data-competitor-side="left" data-competitor-name="${e(m.home.name)}"`
  const awayVisualIdentity = m.isTeamMatchup
    ? `data-team-side="away" data-team-name="${e(m.away.name)}"`
    : `data-competitor-side="right" data-competitor-name="${e(m.away.name)}"`
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: leagueLogoSlot.x, top: leagueLogoSlot.y, size: leagueLogoSlot.size },
        { role: 'home', left: homeVisual.x - homeVisual.size / 2, top: homeVisual.y - homeVisual.size / 2, size: homeVisual.size },
        { role: 'away', left: awayVisual.x - awayVisual.size / 2, top: awayVisual.y - awayVisual.size / 2, size: awayVisual.size }
      ]
    : [
        { role: 'league', left: leagueLogoSlot.x, top: leagueLogoSlot.y, size: leagueLogoSlot.size },
        { role: 'league', left: 152, top: 154, size: 96 }
      ]
  const stubY = SOURCE_H - 100
  const feature = m.hasMatchup
    ? `<g data-role="${layoutRole}"${m.isTeamMatchup ? ' data-layout-family="TEAM_VS_TEAM" data-event-class="team_vs_team"' : ''} data-league-label="${e(leagueLabel)}">
    <g data-role="${homeVisualRole}" ${homeVisualIdentity} data-box-x="${homeVisual.x - homeVisual.size / 2}" data-box-y="${homeVisual.y - homeVisual.size / 2}" data-box-width="${homeVisual.size}" data-box-height="${homeVisual.size}" transform="translate(${homeVisual.x} ${homeVisual.y})">
      <circle cx="0" cy="0" r="${homeVisual.size / 2}" fill="${m.home.primary}" stroke="${m.home.accent}" stroke-width="2.4"/>
      <circle cx="0" cy="0" r="${homeVisual.size / 2 - 7}" fill="rgba(230,222,201,0.12)" stroke="rgba(255,255,255,0.34)" stroke-width="1"/>
      <text data-role="${initialsRole}" ${m.isTeamMatchup ? 'data-team-side="home"' : 'data-competitor-side="left"'} class="bebas" x="0" y="${Math.round(homeInitialSize * 0.34)}" text-anchor="middle" font-size="${homeInitialSize}" fill="${m.home.accent}" letter-spacing="0">${e(m.home.initials)}</text>
    </g>
    <g data-role="versus" data-box-x="${vsBox.x}" data-box-y="${vsBox.y}" data-box-width="${vsBox.size}" data-box-height="${vsBox.size}" transform="translate(${SOURCE_W / 2} ${SOURCE_H / 2})">
      <circle cx="0" cy="0" r="35" fill="#1a1410" stroke="#9b6f2f" stroke-width="2.6"/>
      <circle cx="0" cy="0" r="27" fill="none" stroke="rgba(230,222,201,0.45)" stroke-width="1"/>
      <text data-role="matchup-vs" class="bebas" x="0" y="13" text-anchor="middle" font-size="34" fill="#fff5d0" letter-spacing="0">VS</text>
    </g>
    <g data-role="${awayVisualRole}" ${awayVisualIdentity} data-box-x="${awayVisual.x - awayVisual.size / 2}" data-box-y="${awayVisual.y - awayVisual.size / 2}" data-box-width="${awayVisual.size}" data-box-height="${awayVisual.size}" transform="translate(${awayVisual.x} ${awayVisual.y})">
      <circle cx="0" cy="0" r="${awayVisual.size / 2}" fill="${m.away.primary}" stroke="${m.away.accent}" stroke-width="2.4"/>
      <circle cx="0" cy="0" r="${awayVisual.size / 2 - 7}" fill="rgba(230,222,201,0.12)" stroke="rgba(255,255,255,0.34)" stroke-width="1"/>
      <text data-role="${initialsRole}" ${m.isTeamMatchup ? 'data-team-side="away"' : 'data-competitor-side="right"'} class="bebas" x="0" y="${Math.round(awayInitialSize * 0.34)}" text-anchor="middle" font-size="${awayInitialSize}" fill="${m.away.accent}" letter-spacing="0">${e(m.away.initials)}</text>
    </g>
    <line x1="24" y1="270" x2="156" y2="270" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
    <line x1="${SOURCE_W - 156}" y1="430" x2="${SOURCE_W - 24}" y2="430" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
    <text class="mono" x="28" y="286" font-size="8" fill="#5a3a1f" letter-spacing="1.6">${e(m.leftLabel)}</text>
    <text data-role="${homeNameRole}"${m.isTeamMatchup ? ` data-team-side="home" data-team-name="${e(m.home.name)}"` : ''} class="bebas" x="28" y="308" ${homeNameAttrs} fill="#1a1410" letter-spacing="0">${e(m.home.name)}</text>
    <text class="mono" x="${SOURCE_W - 28}" y="446" text-anchor="end" font-size="8" fill="#5a3a1f" letter-spacing="1.6">${e(m.rightLabel)}</text>
    <text data-role="${awayNameRole}"${m.isTeamMatchup ? ` data-team-side="away" data-team-name="${e(m.away.name)}"` : ''} class="bebas" x="${SOURCE_W - 28}" y="468" text-anchor="end" ${awayNameAttrs} fill="#1a1410" letter-spacing="0">${e(m.away.name)}</text>
  </g>`
    : `<g transform="translate(${SOURCE_W / 2} 204)"><circle cx="0" cy="0" r="52" fill="${m.home.primary}" stroke="${m.home.accent}" stroke-width="2"/>${sportGlyph(m.sport_icon, 0, 0, 76, m.home.accent, 0.95)}</g>
  <line x1="20" y1="305" x2="160" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <line x1="${SOURCE_W - 160}" y1="305" x2="${SOURCE_W - 20}" y2="305" stroke="#5a3a1f" stroke-width="0.6" stroke-dasharray="2 2"/>
  <text class="bebas" x="${SOURCE_W / 2}" y="310" text-anchor="middle" font-size="13" fill="#5a3a1f" letter-spacing="3">${e((m.league || m.sport || '').toUpperCase()) || ''}</text>
  <text class="bebas" data-role="ticket-stub-solo-title" x="${SOURCE_W / 2}" y="350" text-anchor="middle" ${soloTitleAttrs} fill="#1a1410" letter-spacing="1">${e(soloTitle)}</text>
  ${(m.session || m.round) ? `<text class="serif" x="${SOURCE_W / 2}" y="378" text-anchor="middle" font-style="italic" font-size="15" fill="#9b6f2f">${e(m.session || m.round)}</text>` : ''}`
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
  <g data-role="league-logo-frame" data-league-label="${e(leagueLabel)}" transform="translate(${leagueLogoSlot.x - 4} ${leagueLogoSlot.y - 4})"><rect x="0" y="0" width="${leagueLogoSlot.size + 8}" height="${leagueLogoSlot.size + 8}" rx="8" fill="rgba(255,245,208,0.1)" stroke="rgba(255,245,208,0.24)" stroke-width="1"/></g>
  ${m.round ? `<text class="bebas" x="${SOURCE_W / 2}" y="78" text-anchor="middle" font-size="10" fill="rgba(255,245,220,0.85)" letter-spacing="2.5">- ${e(m.round.toUpperCase())} -</text>` : ''}
  <line x1="0" y1="100" x2="${SOURCE_W}" y2="100" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${perfRow(108)}
  <line x1="0" y1="116" x2="${SOURCE_W}" y2="116" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${feature}
  ${m.venue ? `<text class="mono" x="${SOURCE_W / 2}" y="424" text-anchor="middle" font-size="9.5" fill="#5a3a1f" letter-spacing="1.6">${e(m.venue.toUpperCase())}</text>` : ''}
  <line x1="0" y1="${SOURCE_H - 117}" x2="${SOURCE_W}" y2="${SOURCE_H - 117}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${perfRow(SOURCE_H - 108)}
  <line x1="0" y1="${SOURCE_H - 100}" x2="${SOURCE_W}" y2="${SOURCE_H - 100}" stroke="rgba(60,40,15,0.45)" stroke-dasharray="3 3"/>
  ${m.date ? `<text class="mono" x="22" y="${stubY + 22}" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">DATE</text>
  <text class="mono" x="22" y="${stubY + 38}" font-size="14" fill="#1a1410">${e(m.date)}</text>` : ''}
  ${m.time ? `<text class="mono" x="22" y="${stubY + 58}" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">KICKOFF</text>
  <text class="mono" x="22" y="${stubY + 74}" font-size="14" fill="#1a1410">${e(m.time)}</text>` : ''}
  <text class="sans" x="${SOURCE_W / 2}" y="${stubY + 22}" text-anchor="middle" font-size="8" fill="#5a3a1f" letter-spacing="2" font-weight="700">SECTION</text>
  <text class="bebas" x="${SOURCE_W / 2}" y="${stubY + 44}" text-anchor="middle" font-size="22" fill="#1a1410" letter-spacing="1">A - 12 - 4</text>
  <text class="mono" x="${SOURCE_W / 2}" y="${stubY + 62}" text-anchor="middle" font-size="9" fill="#5a3a1f" letter-spacing="1">${e(stubSerial(m, leagueLabel))}</text>
  <g transform="translate(${SOURCE_W - 58} ${stubY + 44}) rotate(-7)"><rect x="-32" y="-20" width="64" height="40" fill="none" stroke="#8c1f0f" stroke-width="2.5"/><text class="bebas" x="0" y="-2" text-anchor="middle" font-size="14" fill="#8c1f0f" letter-spacing="2">ADMIT</text><text class="bebas" x="0" y="14" text-anchor="middle" font-size="14" fill="#8c1f0f" letter-spacing="2">ONE</text></g>
  <rect width="${SOURCE_W}" height="${SOURCE_H}" fill="url(#edgeWear)" pointer-events="none"/>`
  return wrapTemplateSvg(inner, slots, variant, m.isTeamMatchup
    ? {
        layoutFamily: 'TEAM_VS_TEAM',
        leagueLabel,
        homeTeam: m.home.name,
        awayTeam: m.away.name
      }
    : {})
}

function glitchText(text, x, y, size, skew = -3, anchor = 'middle') {
  const t = escapeXml(text)
  return `<g transform="translate(${x} ${y}) skewX(${skew})"><text class="hero" x="-5" y="2" text-anchor="${anchor}" font-size="${size}" fill="#00d9ff" opacity="0.7" filter="url(#blurA)" style="mix-blend-mode:screen" letter-spacing="0.02em">${t}</text><text class="hero" x="5" y="-1" text-anchor="${anchor}" font-size="${size}" fill="#ff0044" opacity="0.75" filter="url(#blurB)" style="mix-blend-mode:screen" letter-spacing="0.02em">${t}</text><text class="hero" x="0" y="0" text-anchor="${anchor}" font-size="${size}" fill="#fff" letter-spacing="0.02em">${t}</text></g>`
}

function splitGlitchText(text, x, y, size, fill = '#fff', anchor = 'start') {
  const t = escapeXml(text)
  return `<g><text class="hero" x="${x - 1}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="#ff0044" opacity="0.85" letter-spacing="0.06em">${t}</text><text class="hero" x="${x + 1}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="#00d9ff" opacity="0.85" letter-spacing="0.06em">${t}</text><text class="hero" x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" letter-spacing="0.06em">${t}</text></g>`
}

// Lay out a solo glitch headline so it never overflows the 400px source canvas.
// Returns 1 or 2 lines plus a font size scaled to the longest line. Bebas Neue
// at 88px averages ~37px per char; ~352px safe width fits ~9 chars at 88px.
function layoutGlitchSoloTitle(text = '') {
  const cleaned = String(text || '').trim()
  if (!cleaned) return { lines: ['EVENT'], size: 88 }
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    const len = words[0].length
    const size = len > 14 ? 48 : (len > 10 ? 58 : (len > 8 ? 64 : (len > 7 ? 72 : 96)))
    return { lines: words, size }
  }
  let bestSplit = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ').length
    const b = words.slice(i).join(' ').length
    const diff = Math.abs(a - b)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSplit = i
    }
  }
  const line1 = words.slice(0, bestSplit).join(' ')
  const line2 = words.slice(bestSplit).join(' ')
  const longest = Math.max(line1.length, line2.length)
  const size = longest > 14 ? 44 : (longest > 11 ? 56 : (longest > 9 ? 64 : (longest > 8 ? 68 : 80)))
  return { lines: [line1, line2], size }
}

function renderGlitch(event = {}, variant = 'poster', theme = {}, mode = '') {
  const m = templateData(event, theme, mode)
  const e = escapeXml
  const isSingle = !m.hasMatchup
  const tint = m.primary_color || m.home.primary
  const slots = m.hasMatchup
    ? [
        { role: 'league', left: 24, top: 22, size: 34 },
        { role: 'home', left: 32, top: 430, size: 54 },
        { role: 'away', left: 314, top: 430, size: 54 }
      ]
    : [
        { role: 'league', left: 24, top: 22, size: 34 },
        { role: 'league', left: 310, top: 392, size: 58 }
      ]
  const corners = [[14, 14, 0], [SOURCE_W - 14, 14, 90], [14, SOURCE_H - 14, 270], [SOURCE_W - 14, SOURCE_H - 14, 180]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M-12 -6 L-12 -12 L-6 -12" stroke="#ff0044" stroke-width="1.2" fill="none"/><path d="M-11 -5 L-11 -11 L-5 -11" stroke="#00d9ff" stroke-width="1" fill="none" opacity="0.7"/></g>`).join('')
  // Audit fix (contract bug 3 / glitch): prefer source m.eventTitle so
  // "Royal Rumble", "Brazilian Grand Prix", "Day 7 Highlights" etc. survive
  // through to the rendered glitch SVG instead of being collapsed into the
  // adapter-shortened event_short.
  const soloHeadline = (m.eventTitle || m.event_short || '').toUpperCase()
  // Solo headline: word-wrap to 1-2 lines so 18-char titles like
  // "BRITISH GRAND PRIX" stop clipping the 400px canvas at 88px.
  const soloLayout = layoutGlitchSoloTitle(soloHeadline)
  const soloLineGap = Math.round(soloLayout.size * 0.92)
  const soloCentreY = soloLayout.lines.length === 1 ? 240 : 232
  const soloLineYs = soloLayout.lines.length === 1
    ? [soloCentreY]
    : [soloCentreY - Math.round(soloLineGap / 2), soloCentreY + Math.round(soloLineGap / 2)]
  const soloHeadSvg = soloLayout.lines.map((line, idx) => glitchText(line, SOURCE_W / 2, soloLineYs[idx], soloLayout.size)).join('')
  const soloSessionText = (m.session || m.round || m.sport || '').toString().toUpperCase()
  const soloSessionY = soloLayout.lines.length === 1 ? 290 : (soloLineYs[soloLineYs.length - 1] + 28)
  // Replace the literal "MAIN" ribbon with a derived session/round word so
  // golf "Round 2", F1 "Qualifying", etc. are reflected. Length-adaptive font
  // and letter-spacing keep the ribbon contained.
  const ribbonRaw = (m.session || m.round || m.event_short || 'EVENT').toString()
  const ribbonFirst = ribbonRaw.split(/[\s\-—–·\/]+/).filter(Boolean)[0] || ribbonRaw
  const ribbonLabel = ribbonFirst.toUpperCase().slice(0, 12) || 'EVENT'
  const ribbonSize = ribbonLabel.length > 8 ? 16 : 22
  const ribbonSpacing = ribbonLabel.length > 8 ? 4 : 8
  const ribbonY = soloLayout.lines.length === 1 ? 360 : Math.max(soloSessionY + 38, 360)
  const body = isSingle
    ? `${soloHeadSvg}<text class="mono" x="${SOURCE_W / 2}" y="${soloSessionY}" text-anchor="middle" font-size="11" fill="#fff" letter-spacing="3">${e(soloSessionText)}</text><g transform="translate(${SOURCE_W / 2} ${ribbonY})"><text class="hero" x="-1" y="0" text-anchor="middle" font-size="${ribbonSize}" fill="#ff0044" letter-spacing="${ribbonSpacing}">${e(ribbonLabel)}</text><text class="hero" x="1" y="0" text-anchor="middle" font-size="${ribbonSize}" fill="#00d9ff" letter-spacing="${ribbonSpacing}">${e(ribbonLabel)}</text><text class="hero" x="0" y="0" text-anchor="middle" font-size="${ribbonSize}" fill="#fff" letter-spacing="${ribbonSpacing}">${e(ribbonLabel)}</text></g>`
    : `${glitchText(m.home.short, SOURCE_W / 2, 220, 150)}<text class="hero" x="${SOURCE_W / 2 - 1}" y="298" text-anchor="middle" font-size="28" fill="#ff0044" letter-spacing="6">VS</text><text class="hero" x="${SOURCE_W / 2 + 1}" y="298" text-anchor="middle" font-size="28" fill="#00d9ff" letter-spacing="6">VS</text><text class="hero" x="${SOURCE_W / 2}" y="298" text-anchor="middle" font-size="28" fill="#fff" letter-spacing="6">VS</text>${glitchText(m.away.short, SOURCE_W / 2, 388, 150)}<rect x="-10" y="252" width="${SOURCE_W + 20}" height="6" fill="#0A0A0C" transform="translate(10 0)"/>`
  const taglineText = isSingle ? soloHeadline : `${m.home.name.toUpperCase()} x ${m.away.name.toUpperCase()}`
  const taglineSize = taglineText.length > 28 ? 13 : 16
  // Truncate the round string in the upper header so long labels like
  // "WESTERN CONFERENCE FINALS · GAME 2" never collide with the right-anchored
  // date at x=SOURCE_W-24. Mono 9px @ 2.5 letter-spacing leaves ~28 safe chars.
  const headerRoundRaw = (m.round || '').toString().toUpperCase()
  const headerRound = headerRoundRaw.length > 26 ? `${headerRoundRaw.slice(0, 25).trimEnd()}…` : headerRoundRaw
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
  <text class="mono" x="24" y="86" font-size="9" fill="#00d9ff" letter-spacing="2.5">&gt; ${e(headerRound)}</text>
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
  const layoutFamily = layoutFamilyForSportsPosterRender(normalizedTemplate, event)
  // Dispatch reorder (audit fix G1 / sports-artwork-template-vs-original.md):
  // The requested template wins. Per-template renderers handle every sport
  // (team-vs-team, competitor-vs-competitor, motorsport solo) directly, so
  // the visual style stays consistent. The COMPETITOR_VS_COMPETITOR /
  // SINGLE_EVENT_MOTORSPORT family branches only fire when no specific
  // template was requested or the template slug is unknown.
  let artwork
  if (normalizedTemplate === 'broadcast') artwork = renderBroadcast(event, variant, theme, mode)
  else if (normalizedTemplate === 'editorial') artwork = renderEditorial(event, variant, theme, mode)
  else if (normalizedTemplate === 'sportsbook') artwork = renderSportsbook(event, variant, theme, mode)
  else if (normalizedTemplate === 'trading-card') artwork = renderTradingCard(event, variant, theme, mode)
  else if (normalizedTemplate === 'brutalist') artwork = renderBrutalist(event, variant, theme, mode)
  else if (normalizedTemplate === 'ticket-stub') artwork = renderTicketStub(event, variant, theme, mode)
  else if (normalizedTemplate === 'glitch') artwork = renderGlitch(event, variant, theme, mode)
  else if (layoutFamily === 'COMPETITOR_VS_COMPETITOR') artwork = renderCompetitorVsCompetitor(event, variant, theme, mode)
  else if (layoutFamily === 'SINGLE_EVENT_MOTORSPORT') artwork = renderSingleEventMotorsport(event, variant, theme, mode)
  else artwork = renderEditorial(event, variant, theme, mode)
  return {
    ...artwork,
    template: normalizedTemplate,
    layoutFamily
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
  if (role === 'home' || role === 'away') {
    const eventClass = normalizeSpace(event.eventClass || event.posterClass) || classifySportsPosterEvent(event)
    const isTeam = eventClass === 'team_vs_team'
    const name = role === 'away' ? facts.away : facts.home
    const label = role === 'away'
      ? (facts.awayInitials || initialsFor(name, 'AW'))
      : (facts.homeInitials || initialsFor(name, 'HM'))
    const fontSize = label.length > 2 ? Math.round(size * 0.26) : Math.round(size * 0.32)
    const accent = readableAccent(primary)
    const roleAttr = isTeam
      ? `data-role="fallback-team-initials" data-team-side="${escapeXml(role)}" data-team-name="${escapeXml(name)}"`
      : `data-role="fallback-competitor-initials" data-competitor-side="${role === 'away' ? 'right' : 'left'}" data-competitor-name="${escapeXml(name)}"`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><radialGradient id="g" cx="35%" cy="30%" r="78%"><stop offset="0" stop-color="${secondary}"/><stop offset="1" stop-color="${primary}"/></radialGradient></defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.43}" fill="url(#g)" stroke="rgba(255,255,255,0.78)" stroke-width="${Math.max(3, Math.round(size * 0.03))}"/>
  <text ${roleAttr} x="${size / 2}" y="${Math.round(size * 0.5 + fontSize * 0.35)}" text-anchor="middle" font-family="'Bebas Neue', Impact, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${accent}" letter-spacing="0">${escapeXml(label)}</text>
</svg>`
  }
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
  layoutFamilyForSportsPosterRender,
  normalizeSportsPosterTemplate,
  resolveSportsPosterTemplate,
  renderLogoGlyphSvg,
  renderSportsPosterTemplateSvg,
  // Family-shape renderers exported for tests + tooling that need to assert
  // the layout-family markers directly. Production callers should still use
  // renderSportsPosterTemplateSvg, which honours the requested template.
  renderCompetitorVsCompetitor,
  renderSingleEventMotorsport
}
