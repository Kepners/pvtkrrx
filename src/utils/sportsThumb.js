const { cleanTitle } = require('./parser')
const { readSportsImageDataUri } = require('./sportsImageCache')

const SPORTS_THUMB_VERSION = 3

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
  return `${text.slice(0, Math.max(1, maxLen - 3)).trim()}...`
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

function teamInitials(name) {
  const parts = normalizeSpace(name).split(' ').filter(Boolean)
  if (parts.length === 0) return 'VS'
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase()
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function encodeSportsThumbToken(payload) {
  return Buffer.from(JSON.stringify({
    v: SPORTS_THUMB_VERSION,
    t: normalizeSpace(payload?.t || ''),
    d: normalizeSpace(payload?.d || ''),
    s: normalizeSpace(payload?.s || ''),
    l: normalizeSpace(payload?.l || ''),
    m: normalizeSpace(payload?.m || ''),
    o: normalizeSpace(payload?.o || ''),
    w: normalizeSpace(payload?.w || ''),
    ob: normalizeSpace(payload?.ob || ''),
    ab: normalizeSpace(payload?.ab || ''),
    gl: normalizeSpace(payload?.gl || ''),
    e: normalizeSpace(payload?.e || '')
  })).toString('base64url')
}

function decodeSportsThumbToken(token) {
  const parsed = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'))
  return {
    t: normalizeSpace(parsed.t || ''),
    d: normalizeSpace(parsed.d || ''),
    s: normalizeSpace(parsed.s || ''),
    l: normalizeSpace(parsed.l || ''),
    m: normalizeSpace(parsed.m || ''),
    o: normalizeSpace(parsed.o || ''),
    w: normalizeSpace(parsed.w || ''),
    ob: normalizeSpace(parsed.ob || ''),
    ab: normalizeSpace(parsed.ab || ''),
    gl: normalizeSpace(parsed.gl || ''),
    e: normalizeSpace(parsed.e || '')
  }
}

function makeSportsThumbUrl(baseUrl, item, variant = 'landscape') {
  const hintedSport = normalizeThemeSportKey(item?.sportHint || item?.sport)
  const token = encodeSportsThumbToken({
    t: String(item?.title || ''),
    d: String(item?.publishDate || ''),
    s: hintedSport || detectSportFromTitle(item?.title || ''),
    l: String(item?.league || item?.mappedLeague || ''),
    m: String(item?.posterStyle || item?.style || ''),
    o: String(item?.homeTeam || ''),
    w: String(item?.awayTeam || ''),
    ob: String(item?.homeBadge || ''),
    ab: String(item?.awayBadge || ''),
    gl: String(item?.leagueLogo || ''),
    e: String(item?.eventName || '')
  })
  const root = String(baseUrl || '').replace(/\/+$/, '')
  if (variant === 'poster') return `${root}/thumb/sports/poster/${token}.png`
  if (variant === 'background') return `${root}/thumb/sports/background/${token}.png`
  return `${root}/thumb/sports/${token}.png`
}

function makeSportsPosterUrl(baseUrl, item) {
  return makeSportsThumbUrl(baseUrl, item, 'poster')
}

function isFightPosterTheme(payload) {
  const text = `${payload?.t || ''} ${payload?.l || ''} ${payload?.s || ''}`.toLowerCase()
  return /\b(ufc|mma|bellator|pfl|one championship|one fc|fight night|cage warriors|strikeforce|rizin|muay thai|kickboxing)\b/.test(text)
}

function getFightBadge(title) {
  const text = String(title || '').toLowerCase()
  if (/\bearly[\s._-]*prelims?\b/.test(text)) return 'EARLY PRELIMS'
  if (/\bprelims?\b/.test(text)) return 'PRELIMS'
  if (/\bmain[\s._-]*card\b/.test(text)) return 'MAIN CARD'
  if (/\bfight[\s._-]*night\b/.test(text)) return 'FIGHT NIGHT'
  if (/\bone[\s._-]*championship\b/.test(text)) return 'ONE CHAMPIONSHIP'
  return 'FIGHT CARD'
}

function renderWatermarkLogo(dataUri, opacity = '0.10') {
  if (!dataUri) return ''
  return `<g opacity="${opacity}"><image href="${dataUri}" x="880" y="120" width="280" height="280" preserveAspectRatio="xMidYMid meet" /></g>`
}

function renderBadgeSlot(x, y, label, dataUri, accent) {
  if (dataUri) {
    return `<g>
      <rect x="${x - 130}" y="${y - 130}" width="260" height="260" rx="36" fill="#091119" fill-opacity="0.72" stroke="${accent}" stroke-opacity="0.34" stroke-width="3" />
      <image href="${dataUri}" x="${x - 110}" y="${y - 110}" width="220" height="220" preserveAspectRatio="xMidYMid meet" />
      <rect x="${x - 144}" y="${y + 148}" width="288" height="44" rx="22" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.28" />
      <text x="${x}" y="${y + 176}" fill="#eef6fb" font-size="22" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="middle">${escapeXml(truncateLabel(label, 18))}</text>
    </g>`
  }

  return `<g>
    <rect x="${x - 130}" y="${y - 130}" width="260" height="260" rx="36" fill="#0d1720" fill-opacity="0.82" stroke="${accent}" stroke-opacity="0.34" stroke-width="3" />
    <circle cx="${x}" cy="${y}" r="88" fill="${accent}" fill-opacity="0.14" />
    <circle cx="${x}" cy="${y}" r="52" fill="${accent}" fill-opacity="0.24" />
    <text x="${x}" y="${y + 16}" fill="#f5fbff" font-size="58" font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle">${escapeXml(teamInitials(label))}</text>
    <rect x="${x - 144}" y="${y + 148}" width="288" height="44" rx="22" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.28" />
    <text x="${x}" y="${y + 176}" fill="#eef6fb" font-size="22" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="middle">${escapeXml(truncateLabel(label, 18))}</text>
  </g>`
}

function renderLandscapeSvg(payload, variant = 'landscape', assets = {}) {
  const theme = resolveTheme(payload)
  const titleLines = wrapTitleLines(payload?.t || '', 30, 2)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 28).toUpperCase()
  const chip = truncateLabel(theme.chip, 18)
  const accent = theme.accent
  const bgA = theme.bgA
  const bgB = theme.bgB
  const subline = [chip, dateLabel].filter(Boolean).join(' | ')
  const rightBadge = variant === 'background' ? 'WALLPAPER' : 'SPORTS'
  const eventLabel = truncateLabel(payload?.e || '', 34)

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
  ${renderWatermarkLogo(assets?.leagueLogoDataUri, '0.12')}
  <rect x="34" y="34" width="1212" height="652" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.32" stroke-width="3" />
  <rect x="52" y="52" width="390" height="58" rx="29" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.46" />
  <text x="80" y="90" fill="#f8fbff" font-size="28" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.8">${escapeXml(leagueLabel)}</text>
  <text x="1100" y="92" fill="${accent}" font-size="22" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="end" letter-spacing="2">${escapeXml(rightBadge)}</text>
  <text x="68" y="286" fill="#f8fbff" font-size="76" font-family="JetBrains Mono, monospace" font-weight="700">${escapeXml(titleLines[0] || 'PVTKRRX Sports')}</text>
  <text x="68" y="368" fill="#d4e5eb" font-size="56" font-family="JetBrains Mono, monospace" font-weight="600">${escapeXml(titleLines[1] || '')}</text>
  <text x="68" y="430" fill="${accent}" font-size="24" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.2">${escapeXml(eventLabel)}</text>
  <text x="68" y="620" fill="${accent}" font-size="26" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.6">${escapeXml(subline || chip)}</text>
  <circle cx="1098" cy="222" r="110" fill="${accent}" fill-opacity="0.1" />
  <circle cx="1098" cy="222" r="66" fill="${accent}" fill-opacity="0.18" />
  </svg>`
}

function renderFightPosterSvg(payload, assets = {}) {
  const theme = resolveTheme(payload)
  const titleLines = wrapTitleLines(payload?.t || '', 18, 3)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 24).toUpperCase()
  const badge = getFightBadge(payload?.t)
  const accent = theme.accent
  const bgA = '#1f1009'
  const bgB = '#07070b'
  const lineCount = Math.max(1, titleLines.length)
  const baseY = 520
  const lineGap = lineCount === 1 ? 0 : lineCount === 2 ? 86 : 76
  const titleMarkup = titleLines.map((line, index) => {
    const y = baseY + (index * lineGap)
    const fontSize = lineCount === 1 ? 82 : (index === 0 ? 72 : 64)
    return `<text x="86" y="${y}" fill="#fff8f0" font-size="${fontSize}" font-family="Arial Black, Arial, sans-serif" font-weight="900" stroke="rgba(0,0,0,0.72)" stroke-width="7" paint-order="stroke fill">${escapeXml(line)}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350" viewBox="0 0 900 1350" role="img" aria-label="${escapeXml(titleLines[0] || 'PVTKRRX Sports')}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
  </defs>
  <rect width="900" height="1350" fill="url(#bg)" />
  ${renderWatermarkLogo(assets?.leagueLogoDataUri, '0.12')}
  <rect x="28" y="28" width="844" height="1294" rx="34" fill="none" stroke="${accent}" stroke-opacity="0.34" stroke-width="3" />
  <rect x="66" y="68" width="500" height="58" rx="29" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-opacity="0.55" />
  <text x="94" y="106" fill="#fff9f4" font-size="29" font-family="IBM Plex Mono, monospace" font-weight="700" letter-spacing="1.7">${escapeXml(leagueLabel)}</text>
  <text x="824" y="106" fill="${accent}" font-size="22" font-family="IBM Plex Mono, monospace" font-weight="700" text-anchor="end" letter-spacing="2">${escapeXml(badge)}</text>
  <g transform="translate(626 500)">
    <polygon points="0,-154 110,-92 154,0 110,92 0,154 -110,92 -154,0 -110,-92" fill="none" stroke="${accent}" stroke-opacity="0.84" stroke-width="10" />
    <circle cx="0" cy="0" r="92" fill="${accent}" fill-opacity="0.12" />
    <circle cx="0" cy="0" r="54" fill="${accent}" fill-opacity="0.22" />
    <text x="0" y="14" fill="#fff8f0" font-size="78" font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle">FIGHT</text>
  </g>
  ${titleMarkup}
  <text x="86" y="956" fill="${accent}" font-size="24" font-family="IBM Plex Mono, monospace" font-weight="700" letter-spacing="1.7">${escapeXml(badge)}</text>
  <text x="86" y="1010" fill="#e9d7c4" font-size="24" font-family="IBM Plex Mono, monospace" font-weight="600" letter-spacing="1.2">${escapeXml(dateLabel || 'LIVE FIGHT CARD')}</text>
  </svg>`
}

function renderLeagueEventPosterSvg(payload, assets = {}) {
  const theme = resolveTheme(payload)
  const formulaOne = String(payload?.m || '').toLowerCase() === 'formula1'
  const titleLines = wrapTitleLines(payload?.e || payload?.t || '', formulaOne ? 20 : 18, 3)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 24).toUpperCase()
  const accent = formulaOne ? '#ff3b30' : theme.accent
  const bgA = formulaOne ? '#190807' : theme.bgA
  const bgB = formulaOne ? '#060608' : theme.bgB
  const chip = formulaOne ? 'RACE WEEKEND' : theme.chip

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350" viewBox="0 0 900 1350" role="img" aria-label="${escapeXml(titleLines[0] || 'PVTKRRX Sports')}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
  </defs>
  <rect width="900" height="1350" fill="url(#bg)" />
  ${renderWatermarkLogo(assets?.leagueLogoDataUri, formulaOne ? '0.16' : '0.12')}
  <rect x="34" y="34" width="832" height="1282" rx="32" fill="none" stroke="${accent}" stroke-opacity="0.34" stroke-width="3" />
  <rect x="62" y="64" width="486" height="58" rx="29" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-opacity="0.48" />
  <text x="92" y="102" fill="#f6fbff" font-size="28" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.5">${escapeXml(leagueLabel)}</text>
  <text x="808" y="102" fill="${accent}" font-size="21" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="end" letter-spacing="1.8">${escapeXml(chip)}</text>
  <text x="92" y="520" fill="#f7fbff" font-size="${formulaOne ? '66' : '72'}" font-family="JetBrains Mono, monospace" font-weight="700">${escapeXml(titleLines[0] || 'PVTKRRX Sports')}</text>
  <text x="92" y="610" fill="#d5e5ec" font-size="58" font-family="JetBrains Mono, monospace" font-weight="600">${escapeXml(titleLines[1] || '')}</text>
  <text x="92" y="694" fill="#d5e5ec" font-size="52" font-family="JetBrains Mono, monospace" font-weight="600">${escapeXml(titleLines[2] || '')}</text>
  <text x="92" y="1066" fill="${accent}" font-size="24" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.6">${escapeXml(payload?.e || payload?.t || '')}</text>
  <text x="92" y="1140" fill="#d5e5ec" font-size="24" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="1.4">${escapeXml(dateLabel || 'EVENT CARD')}</text>
  </svg>`
}

function renderMatchupPosterSvg(payload, assets = {}) {
  const theme = resolveTheme(payload)
  const dateLabel = formatDateLabel(payload?.d)
  const leagueLabel = truncateLabel(payload?.l || theme.chip, 24).toUpperCase()
  const accent = theme.accent
  const bgA = theme.bgA
  const bgB = theme.bgB
  const leftTeam = normalizeSpace(payload?.o || 'Home')
  const rightTeam = normalizeSpace(payload?.w || 'Away')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350" viewBox="0 0 900 1350" role="img" aria-label="${escapeXml(`${leftTeam} vs ${rightTeam}`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
  </defs>
  <rect width="900" height="1350" fill="url(#bg)" />
  ${renderWatermarkLogo(assets?.leagueLogoDataUri, '0.12')}
  <rect x="28" y="28" width="844" height="1294" rx="34" fill="none" stroke="${accent}" stroke-opacity="0.34" stroke-width="3" />
  <rect x="66" y="66" width="500" height="58" rx="29" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.46" />
  <text x="94" y="104" fill="#f8fbff" font-size="28" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.7">${escapeXml(leagueLabel)}</text>
  <text x="814" y="104" fill="${accent}" font-size="22" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="end" letter-spacing="2">${escapeXml(dateLabel || 'MATCHUP')}</text>
  ${renderBadgeSlot(244, 456, leftTeam, assets?.homeBadgeDataUri, accent)}
  ${renderBadgeSlot(656, 456, rightTeam, assets?.awayBadgeDataUri, accent)}
  <g transform="translate(450 458)">
    <circle cx="0" cy="0" r="72" fill="#08131b" fill-opacity="0.82" stroke="${accent}" stroke-opacity="0.42" stroke-width="4" />
    <circle cx="0" cy="0" r="48" fill="${accent}" fill-opacity="0.18" />
    <text x="0" y="16" fill="#f7fbff" font-size="42" font-family="Arial Black, Arial, sans-serif" font-weight="900" text-anchor="middle">VS</text>
  </g>
  <text x="450" y="948" fill="${accent}" font-size="24" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="middle" letter-spacing="1.6">CLUB VS CLUB</text>
  <text x="450" y="1018" fill="#e2eef4" font-size="48" font-family="JetBrains Mono, monospace" font-weight="700" text-anchor="middle">${escapeXml(truncateLabel(`${leftTeam} vs ${rightTeam}`, 28))}</text>
  <text x="450" y="1084" fill="#c9dce5" font-size="22" font-family="JetBrains Mono, monospace" font-weight="600" text-anchor="middle" letter-spacing="1.3">${escapeXml(dateLabel || leagueLabel)}</text>
  </svg>`
}

function renderPosterSvg(payload, assets = {}) {
  const mode = String(payload?.m || '').trim().toLowerCase()
  if (mode === 'matchup') return renderMatchupPosterSvg(payload, assets)
  if (mode === 'formula1' || mode === 'league-event') return renderLeagueEventPosterSvg(payload, assets)
  if (isFightPosterTheme(payload)) return renderFightPosterSvg(payload, assets)
  return renderLeagueEventPosterSvg(payload, assets)
}

async function loadPosterAssets(payload) {
  const [homeBadgeDataUri, awayBadgeDataUri, leagueLogoDataUri] = await Promise.all([
    readSportsImageDataUri(payload?.ob, 'logo'),
    readSportsImageDataUri(payload?.ab, 'logo'),
    readSportsImageDataUri(payload?.gl, 'logo')
  ])
  return { homeBadgeDataUri, awayBadgeDataUri, leagueLogoDataUri }
}

async function renderSportsThumbSvg(payload, options = {}) {
  const variant = String(options?.variant || '').trim().toLowerCase()
  const assets = await loadPosterAssets(payload)
  if (variant === 'poster') return renderPosterSvg(payload, assets)
  if (variant === 'background') return renderLandscapeSvg(payload, 'background', assets)
  return renderLandscapeSvg(payload, 'landscape', assets)
}

module.exports = {
  detectSportFromTitle,
  makeSportsThumbUrl,
  makeSportsPosterUrl,
  decodeSportsThumbToken,
  renderSportsThumbSvg
}
