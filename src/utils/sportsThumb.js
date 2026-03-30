const { cleanTitle } = require('./parser')

const THEMES = {
  football: { accent: '#00ff41', bgA: '#0d1d14', bgB: '#07110c', chip: 'FOOTBALL' },
  epl: { accent: '#7af542', bgA: '#08150d', bgB: '#040b06', chip: 'PREMIER LEAGUE' },
  championsleague: { accent: '#55c7ff', bgA: '#061223', bgB: '#040913', chip: 'CHAMPIONS LEAGUE' },
  f1: { accent: '#ff3b30', bgA: '#230d0b', bgB: '#120807', chip: 'F1' },
  nba: { accent: '#4da3ff', bgA: '#0b1726', bgB: '#070d14', chip: 'NBA' },
  nfl: { accent: '#7e8dff', bgA: '#11152a', bgB: '#090c14', chip: 'NFL' },
  nhl: { accent: '#90ecff', bgA: '#0a1822', bgB: '#071018', chip: 'NHL' },
  mlb: { accent: '#ff6b6b', bgA: '#201014', bgB: '#12080a', chip: 'MLB' },
  ufc: { accent: '#ff8a00', bgA: '#23180a', bgB: '#130d06', chip: 'MMA / UFC' },
  cricket: { accent: '#84ff6a', bgA: '#10220d', bgB: '#091307', chip: 'CRICKET' },
  rugby: { accent: '#9dff7a', bgA: '#13230f', bgB: '#0a1408', chip: 'RUGBY' },
  tennis: { accent: '#d7ff44', bgA: '#20260b', bgB: '#121607', chip: 'TENNIS' },
  generic: { accent: '#8ab0bb', bgA: '#101922', bgB: '#0a0f15', chip: 'SPORT' }
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncateLabel(value, maxLen = 28) {
  const text = normalizeSpace(value)
  if (!text) return ''
  if (text.length <= maxLen) return text
  return `${text.slice(0, Math.max(1, maxLen - 1)).trim()}…`
}

function detectSportFromTitle(title) {
  const t = String(title || '').toLowerCase()
  if (/\b(f1|formula[\s-]?1|grand prix|gp)\b/.test(t)) return 'f1'
  if (/\b(ufc|mma|bellator)\b/.test(t)) return 'ufc'
  if (/\b(nba|wnba|basketball)\b/.test(t)) return 'nba'
  if (/\b(nfl|super bowl|american football)\b/.test(t)) return 'nfl'
  if (/\b(nhl|ice hockey|stanley cup)\b/.test(t)) return 'nhl'
  if (/\b(mlb|baseball|world series)\b/.test(t)) return 'mlb'
  if (/\b(cricket|ipl|t20|odi|ashes)\b/.test(t)) return 'cricket'
  if (/\b(rugby|super rugby|six nations)\b/.test(t)) return 'rugby'
  if (/\b(tennis|wta|atp|wimbledon|roland garros|us open|australian open)\b/.test(t)) return 'tennis'
  if (/\b(epl|premier league|football|champions league|la liga|serie a|bundesliga|manchester|arsenal|chelsea|liverpool)\b/.test(t)) return 'football'
  return 'generic'
}

function normalizeThemeSportKey(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!key) return ''
  if (THEMES[key]) return key
  if (key === 'basketball') return 'nba'
  if (key === 'mma' || key === 'boxing' || key === 'wrestling') return 'ufc'
  if (key === 'motorsport') return 'f1'
  if (key === 'american-football') return 'nfl'
  if (key === 'baseball') return 'mlb'
  if (key === 'hockey' || key === 'ice hockey') return 'nhl'
  return ''
}

function detectLeagueThemeKey(league, title = '') {
  const text = `${league || ''} ${title || ''}`.toLowerCase()
  if (/\b(epl|english premier league|premier league)\b/.test(text)) return 'epl'
  if (/\b(uefa champions league|champions league|ucl)\b/.test(text)) return 'championsleague'
  if (/\b(formula[\s-]?1|formula1|grand prix|f1)\b/.test(text)) return 'f1'
  if (/\b(nba|wnba)\b/.test(text)) return 'nba'
  if (/\b(nfl|super bowl)\b/.test(text)) return 'nfl'
  if (/\b(nhl|stanley cup)\b/.test(text)) return 'nhl'
  if (/\b(mlb|world series)\b/.test(text)) return 'mlb'
  if (/\b(ufc|fight night|mma)\b/.test(text)) return 'ufc'
  if (/\b(ipl|cricket)\b/.test(text)) return 'cricket'
  if (/\b(rugby|six nations)\b/.test(text)) return 'rugby'
  if (/\b(wimbledon|roland garros|australian open|us open|atp|wta|tennis)\b/.test(text)) return 'tennis'
  return ''
}

function resolveTheme(payload) {
  const leagueKey = detectLeagueThemeKey(payload?.l, payload?.t)
  if (leagueKey && THEMES[leagueKey]) return THEMES[leagueKey]
  const hintedSport = normalizeThemeSportKey(payload?.s)
  if (hintedSport && THEMES[hintedSport]) return THEMES[hintedSport]
  const inferredSport = detectSportFromTitle(payload?.t || '')
  return THEMES[inferredSport] || THEMES.generic
}

function formatDateLabel(rawDate) {
  const date = new Date(rawDate || '')
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function wrapTitleLines(title, maxChars = 34, maxLines = 2) {
  const words = normalizeSpace(cleanTitle(title) || title).split(' ')
  const lines = []
  let line = ''

  for (const word of words) {
    if (!word) continue
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word
    if (lines.length === Math.max(1, maxLines - 1)) break
  }
  if (line && lines.length < maxLines) lines.push(line)

  if (lines.length === 0) return ['PVTKRRX Sports']
  return lines
}

function encodeSportsThumbToken(payload) {
  return Buffer.from(JSON.stringify({
    t: normalizeSpace(payload?.t || ''),
    d: normalizeSpace(payload?.d || ''),
    s: normalizeSpace(payload?.s || ''),
    l: normalizeSpace(payload?.l || '')
  })).toString('base64url')
}

function decodeSportsThumbToken(token) {
  const parsed = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'))
  return {
    t: normalizeSpace(parsed.t || ''),
    d: normalizeSpace(parsed.d || ''),
    s: normalizeSpace(parsed.s || ''),
    l: normalizeSpace(parsed.l || '')
  }
}

function makeSportsThumbUrl(baseUrl, item, variant = 'landscape') {
  const hintedSport = normalizeThemeSportKey(item?.sportHint || item?.sport)
  const token = encodeSportsThumbToken({
    t: String(item?.title || ''),
    d: String(item?.publishDate || ''),
    s: hintedSport || detectSportFromTitle(item?.title || ''),
    l: String(item?.league || item?.mappedLeague || '')
  })
  const root = String(baseUrl || '').replace(/\/+$/, '')
  if (variant === 'poster') return `${root}/thumb/sports/poster/${token}.svg`
  if (variant === 'background') return `${root}/thumb/sports/background/${token}.svg`
  return `${root}/thumb/sports/${token}.svg`
}

function makeSportsPosterUrl(baseUrl, item) {
  return makeSportsThumbUrl(baseUrl, item, 'poster')
}

function renderLandscapeSvg(payload, variant = 'landscape') {
  const theme = resolveTheme(payload)
  const titleLines = wrapTitleLines(payload?.t || '', 30, 2)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 28).toUpperCase()
  const chip = truncateLabel(theme.chip, 18)
  const accent = theme.accent
  const bgA = theme.bgA
  const bgB = theme.bgB
  const subline = [chip, dateLabel].filter(Boolean).join('  •  ')
  const rightBadge = variant === 'background' ? 'WALLPAPER' : 'SPORTS'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${escapeXml(titleLines[0] || 'PVTKRRX Sports')}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <radialGradient id="glowA" cx="72%" cy="24%" r="52%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.34" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowB" cx="12%" cy="88%" r="44%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.16" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect width="1280" height="720" fill="url(#glowA)" />
  <rect width="1280" height="720" fill="url(#glowB)" />
  <rect x="34" y="34" width="1212" height="652" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="3" />
  <rect x="52" y="52" width="390" height="58" rx="29" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.46" />
  <text x="80" y="90" fill="#f8fbff" font-size="28" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.8">${escapeXml(leagueLabel)}</text>
  <text x="1100" y="92" fill="${accent}" font-size="22" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="end" letter-spacing="2">${escapeXml(rightBadge)}</text>
  <text x="68" y="286" fill="#f8fbff" font-size="76" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="0.5">${escapeXml(titleLines[0] || 'PVTKRRX Sports')}</text>
  <text x="68" y="368" fill="#d4e5eb" font-size="56" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="0.3">${escapeXml(titleLines[1] || '')}</text>
  <text x="68" y="620" fill="${accent}" font-size="26" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.6">${escapeXml(subline || chip)}</text>
  <circle cx="1098" cy="222" r="110" fill="${accent}" fill-opacity="0.1" />
  <circle cx="1098" cy="222" r="66" fill="${accent}" fill-opacity="0.18" />
  </svg>`
}

function renderPosterSvg(payload) {
  const theme = resolveTheme(payload)
  const titleLines = wrapTitleLines(payload?.t || '', 18, 3)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 24).toUpperCase()
  const accent = theme.accent
  const bgA = theme.bgA
  const bgB = theme.bgB

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350" viewBox="0 0 900 1350" role="img" aria-label="${escapeXml(titleLines[0] || 'PVTKRRX Sports')}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="18%" r="58%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.34" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="900" height="1350" fill="url(#bg)" />
  <rect width="900" height="1350" fill="url(#glow)" />
  <rect x="34" y="34" width="832" height="1282" rx="30" fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="3" />
  <rect x="64" y="66" width="454" height="58" rx="29" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.48" />
  <text x="94" y="104" fill="#f8fbff" font-size="28" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.7">${escapeXml(leagueLabel)}</text>
  <text x="96" y="520" fill="#f8fbff" font-size="72" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="0.4">${escapeXml(titleLines[0] || 'PVTKRRX Sports')}</text>
  <text x="96" y="610" fill="#d4e5eb" font-size="58" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="0.3">${escapeXml(titleLines[1] || '')}</text>
  <text x="96" y="694" fill="#d4e5eb" font-size="52" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="0.3">${escapeXml(titleLines[2] || '')}</text>
  <text x="96" y="1168" fill="${accent}" font-size="26" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.8">${escapeXml(theme.chip)}</text>
  <text x="96" y="1214" fill="#d4e5eb" font-size="24" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="1.4">${escapeXml(dateLabel || 'PVTKRRX SPORTS')}</text>
  <circle cx="712" cy="240" r="124" fill="${accent}" fill-opacity="0.12" />
  <circle cx="712" cy="240" r="74" fill="${accent}" fill-opacity="0.18" />
  </svg>`
}

function renderSportsThumbSvg(payload, options = {}) {
  const variant = String(options?.variant || '').trim().toLowerCase()
  if (variant === 'poster') return renderPosterSvg(payload)
  if (variant === 'background') return renderLandscapeSvg(payload, 'background')
  return renderLandscapeSvg(payload)
}

module.exports = {
  detectSportFromTitle,
  makeSportsThumbUrl,
  makeSportsPosterUrl,
  decodeSportsThumbToken,
  renderSportsThumbSvg
}
