const { cleanTitle } = require('./parser')

const THEMES = {
  football: { accent: '#00ff41', bgA: '#0d1d14', bgB: '#07110c', chip: 'FOOTBALL' },
  f1: { accent: '#ff3b30', bgA: '#230d0b', bgB: '#120807', chip: 'F1' },
  ufc: { accent: '#ff8a00', bgA: '#23180a', bgB: '#130d06', chip: 'MMA / UFC' },
  nba: { accent: '#4da3ff', bgA: '#0b1726', bgB: '#070d14', chip: 'NBA' },
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

function detectSportFromTitle(title) {
  const t = String(title || '').toLowerCase()
  if (/\b(f1|formula[\s-]?1|grand prix|gp)\b/.test(t)) return 'f1'
  if (/\b(ufc|mma|bellator)\b/.test(t)) return 'ufc'
  if (/\b(nba|wnba|basketball)\b/.test(t)) return 'nba'
  if (/\b(cricket|ipl|t20|odi|ashes)\b/.test(t)) return 'cricket'
  if (/\b(rugby|super rugby|six nations)\b/.test(t)) return 'rugby'
  if (/\b(tennis|wta|atp|wimbledon|roland garros|us open|australian open)\b/.test(t)) return 'tennis'
  if (/\b(epl|premier league|football|champions league|la liga|serie a|bundesliga|manchester|arsenal|chelsea|liverpool)\b/.test(t)) return 'football'
  return 'generic'
}

function formatDateLabel(rawDate) {
  const date = new Date(rawDate || '')
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function wrapTitleLines(title, maxChars = 34) {
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
    if (lines.length === 2) break
  }
  if (line && lines.length < 2) lines.push(line)

  if (lines.length === 0) return ['PVTKRRX Sports', '']
  if (lines.length === 1) return [lines[0], '']
  return [lines[0], lines[1]]
}

function encodeSportsThumbToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeSportsThumbToken(token) {
  const parsed = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'))
  return {
    t: normalizeSpace(parsed.t || ''),
    d: normalizeSpace(parsed.d || ''),
    s: normalizeSpace(parsed.s || '')
  }
}

function makeSportsThumbUrl(baseUrl, item) {
  const token = encodeSportsThumbToken({
    t: String(item?.title || ''),
    d: String(item?.publishDate || ''),
    s: detectSportFromTitle(item?.title || '')
  })
  const root = String(baseUrl || '').replace(/\/+$/, '')
  return `${root}/thumb/sports/${token}.svg`
}

function renderSportsThumbSvg(payload) {
  const sportKey = String(payload?.s || detectSportFromTitle(payload?.t || '')).toLowerCase()
  const theme = THEMES[sportKey] || THEMES.generic
  const [line1, line2] = wrapTitleLines(payload?.t || '')
  const dateLabel = formatDateLabel(payload?.d)

  const title1 = escapeXml(line1)
  const title2 = escapeXml(line2)
  const chip = escapeXml(theme.chip)
  const date = escapeXml(dateLabel)
  const accent = theme.accent
  const bgA = theme.bgA
  const bgB = theme.bgB

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${title1}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <radialGradient id="glow" cx="65%" cy="28%" r="58%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)" />
  <rect width="640" height="360" fill="url(#glow)" />
  <rect x="20" y="20" width="600" height="320" rx="16" fill="none" stroke="${accent}" stroke-opacity="0.34" stroke-width="2" />
  <circle cx="548" cy="92" r="54" fill="${accent}" fill-opacity="0.16" />
  <circle cx="548" cy="92" r="34" fill="${accent}" fill-opacity="0.22" />
  <rect x="34" y="40" width="182" height="34" rx="17" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.5" />
  <text x="49" y="61" fill="#f8f7ff" font-size="15" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.2">${chip}</text>
  <text x="36" y="168" fill="#f8f7ff" font-size="37" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1">${title1}</text>
  <text x="36" y="214" fill="#cde0e6" font-size="30" font-family="JetBrains Mono, monospace" font-weight="600" letter-spacing="0.6">${title2}</text>
  <text x="36" y="300" fill="${accent}" font-size="16" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1.5">PVTKRRX SPORTS ${date ? `• ${date}` : ''}</text>
</svg>`
}

module.exports = {
  detectSportFromTitle,
  makeSportsThumbUrl,
  decodeSportsThumbToken,
  renderSportsThumbSvg
}

