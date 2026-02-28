const { detectSport } = require('./sportClassifier')

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeSportKey(value) {
  const raw = normalizeToken(value)
  if (!raw) return ''

  const aliases = new Map([
    ['f1', 'motorsport'],
    ['formula 1', 'motorsport'],
    ['formula1', 'motorsport'],
    ['nfl', 'american-football'],
    ['ncaa football', 'american-football'],
    ['soccer', 'football'],
    ['epl', 'football'],
    ['ufc', 'mma'],
    ['bellator', 'mma'],
    ['wwe', 'wrestling'],
    ['aew', 'wrestling']
  ])

  if (aliases.has(raw)) return aliases.get(raw)
  return raw
}

function resolveSportHint(input = {}) {
  const explicit = normalizeSportKey(input.explicitHint)
  if (explicit) return explicit

  const category = normalizeSportKey(input.categoryHint)
  if (category) return category

  const titleDetected = normalizeSportKey(detectSport(input.title || ''))
  if (titleDetected) return titleDetected

  return ''
}

function isSportsNoiseTitle(title) {
  const value = String(title || '')
  return (
    /\bS\d{1,2}E\d{1,3}\b/i.test(value) ||
    /\b\d{1,2}x\d{1,3}\b/i.test(value) ||
    /\bSeason[\s._-]*\d{1,2}\b/i.test(value) ||
    /\b(?:ebook|e[\s.\-_]*book|audiobook|retail|novel|bookware)\b/i.test(value) ||
    /\b(?:update|patch|trainer|unlocker|dlc|mod)\b/i.test(value) ||
    /\b(?:tutorial|how[\s.\-_]*to|guide)\b/i.test(value)
  )
}

function scoreSportsEventSignals(title, sportHint = '') {
  const value = String(title || '')
  let score = 0

  if (/\b(?:vs\.?|v|@)\b/i.test(value)) score += 3
  if (/\b(?:match|round|r\d{1,2}|stage|heat|qualifier|quarter[\s.\-_]*final|semi[\s.\-_]*final|final|play[\s.\-_]*off|playoff|main[\s.\-_]*card|prelims?)\b/i.test(value)) score += 2
  if (/\b(?:19|20)\d{2}[.\-_\s]\d{2}[.\-_\s]\d{2}\b/i.test(value) || /\b\d{2}[.\-_\s]\d{2}[.\-_\s](?:19|20)\d{2}\b/i.test(value) || /\b(?:19|20)\d{2}\d{2}\d{2}\b/i.test(value)) score += 2
  if (/\b(?:1080p|720p|2160p)\b/i.test(value)) score += 1

  const sport = normalizeSportKey(sportHint)
  if (sport) {
    if (sport === 'tennis' && /\b(?:atp|wta|wimbledon|roland[\s.\-_]*garros|us[\s.\-_]*open|australian[\s.\-_]*open|davis[\s.\-_]*cup|laver[\s.\-_]*cup)\b/i.test(value)) score += 2
    if (sport === 'football' && /\b(?:epl|premier[\s.\-_]*league|la[\s.\-_]*liga|serie[\s.\-_]*a|bundesliga|champions[\s.\-_]*league|europa[\s.\-_]*league)\b/i.test(value)) score += 2
    if (sport === 'basketball' && /\b(?:nba|wnba|euroleague|ncaa)\b/i.test(value)) score += 2
    if (sport === 'american-football' && /\b(?:nfl|ncaa|cfl|ufl)\b/i.test(value)) score += 2
    if (sport === 'motorsport' && /\b(?:f1|formula[\s.\-_]*1|motogp|nascar|indycar|wrc|grand[\s.\-_]*prix|gp)\b/i.test(value)) score += 2
    if (sport === 'mma' && /\b(?:ufc|bellator|fight[\s.\-_]*night|one[\s.\-_]*championship)\b/i.test(value)) score += 2
  }

  return score
}

function isLikelySportsEventTitle(title, sportHint = '') {
  if (isSportsNoiseTitle(title)) return false
  const score = scoreSportsEventSignals(title, sportHint)
  return score >= 3
}

module.exports = {
  normalizeSportKey,
  resolveSportHint,
  isSportsNoiseTitle,
  scoreSportsEventSignals,
  isLikelySportsEventTitle
}
