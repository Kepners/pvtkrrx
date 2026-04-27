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
    ['motogp', 'motorsport'],
    ['nascar', 'motorsport'],
    ['indycar', 'motorsport'],
    ['wrc', 'motorsport'],
    ['supercars', 'motorsport'],
    ['v8 supercars', 'motorsport'],
    ['v8sc', 'motorsport'],
    ['wsbk', 'motorsport'],
    ['wec', 'motorsport'],
    ['formula e', 'motorsport'],
    ['formulae', 'motorsport'],
    ['nfl', 'american-football'],
    ['ncaa football', 'american-football'],
    ['soccer', 'football'],
    ['epl', 'football'],
    ['mls', 'football'],
    ['major league soccer', 'football'],
    ['american major league soccer', 'football'],
    ['ufc', 'mma'],
    ['bellator', 'mma'],
    ['pfl', 'mma'],
    ['wwe', 'wrestling'],
    ['aew', 'wrestling'],
    ['pdc', 'darts'],
    ['bdo', 'darts'],
    ['pga', 'golf'],
    ['pga tour', 'golf'],
    ['lpga', 'golf'],
    ['masters', 'golf'],
    ['mlb', 'baseball'],
    ['major league baseball', 'baseball'],
    ['nba playoffs', 'basketball'],
    ['nba postseason', 'basketball'],
    ['indian premier league', 'cricket'],
    ['ipl', 'cricket']
  ])

  if (aliases.has(raw)) return aliases.get(raw)
  return raw
}

function detectStrongSportHintFromTitle(title) {
  const value = String(title || '')
  if (!value.trim()) return ''

  const rules = [
    ['darts', /\b(?:pdc|bdo|darts|premier[\s._-]*league[\s._-]*darts)\b/i],
    ['cricket', /\b(?:cricket|ipl|indian[\s._-]*premier[\s._-]*league|t20|odi|ashes|big[\s._-]*bash|the[\s._-]*hundred)\b/i],
    ['football', /\b(?:efl|elc|epl|mls|major[\s._-]*league[\s._-]*soccer|uefa|english[\s._-]*football[\s._-]*league|la[\s._-]*liga|serie[\s._-]*a|bundesliga|champions[\s._-]*league|europa[\s._-]*league|conference[\s._-]*league|fa[\s._-]*cup|carabao[\s._-]*cup|community[\s._-]*shield)\b/i],
    ['american-football', /\b(?:nfl|ncaaf|ncaa[\s._-]*football|college[\s._-]*football|super[\s._-]*bowl|cfl|ufl|xfl)\b/i],
    ['basketball', /\b(?:nba(?:[\s._-]*(?:playoffs?|postseason))?|wnba|euroleague|ncaa[\s._-]*basketball)\b/i],
    ['baseball', /\b(?:mlb|major[\s._-]*league[\s._-]*baseball|baseball)\b/i],
    ['hockey', /\b(?:nhl|ice[\s._-]*hockey)\b/i],
    ['tennis', /\b(?:atp|wta|wimbledon|roland[\s._-]*garros|us[\s._-]*open|australian[\s._-]*open|davis[\s._-]*cup|laver[\s._-]*cup)\b/i],
    ['rugby', /\b(?:rugby|nrl|super[\s._-]*rugby|six[\s._-]*nations|united[\s._-]*rugby[\s._-]*championship)\b/i],
    ['motorsport', /\b(?:f1|formula[\s._-]*1|formula1|motogp|nascar|indycar|wrc|supercars|v8[\s._-]*supercars|bathurst|wsbk|wec|formula[\s._-]*e)\b/i],
    ['mma', /\b(?:ufc|bellator|pfl|fight[\s._-]*night|one[\s._-]*championship)\b/i],
    ['boxing', /\b(?:boxing|matchroom|queensberry|top[\s._-]*rank)\b/i],
    ['golf', /\b(?:pga(?:[\s._-]*tour)?|lpga|masters|ryder[\s._-]*cup|open[\s._-]*championship)\b/i],
    ['cycling', /\b(?:cycling|tour[\s._-]*de[\s._-]*france|giro[\s._-]*d[\s._-]*italia|vuelta)\b/i],
    ['wrestling', /\b(?:wwe|aew|wrestling)\b/i],
    ['snooker', /\bsnooker\b/i]
  ]

  for (const [sport, pattern] of rules) {
    if (pattern.test(value)) return sport
  }
  return ''
}

function resolveSportHint(input = {}) {
  const strongTitle = normalizeSportKey(detectStrongSportHintFromTitle(input.title || ''))
  const explicit = normalizeSportKey(input.explicitHint)
  const category = normalizeSportKey(input.categoryHint)
  const preferredNonTitle = explicit || category

  if (strongTitle && preferredNonTitle && strongTitle !== preferredNonTitle) return strongTitle
  if (explicit) return explicit

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
  if (/\b(?:grand[\s.\-_]*prix|gp|fight[\s.\-_]*night|race[\s.\-_]*\d|sprint|qualifying|practice|free[\s.\-_]*practice|fp[1-3]|warm[\s.\-_]*up)\b/i.test(value)) score += 2
  if (/\b(?:19|20)\d{2}[.\-_\s]\d{2}[.\-_\s]\d{2}\b/i.test(value) || /\b\d{2}[.\-_\s]\d{2}[.\-_\s](?:19|20)\d{2}\b/i.test(value) || /\b(?:19|20)\d{2}\d{2}\d{2}\b/i.test(value)) score += 2
  if (/\b(?:1080p|720p|2160p)\b/i.test(value)) score += 1

  const sport = normalizeSportKey(sportHint)
  if (sport) {
    if (sport === 'tennis' && /\b(?:atp|wta|wimbledon|roland[\s.\-_]*garros|us[\s.\-_]*open|australian[\s.\-_]*open|davis[\s.\-_]*cup|laver[\s.\-_]*cup)\b/i.test(value)) score += 2
    if (sport === 'football' && /\b(?:epl|mls|major[\s.\-_]*league[\s.\-_]*soccer|premier[\s.\-_]*league|fa[\s.\-_]*cup|la[\s.\-_]*liga|serie[\s.\-_]*a|bundesliga|champions[\s.\-_]*league|europa[\s.\-_]*league)\b/i.test(value)) score += 2
    if (sport === 'basketball' && /\b(?:nba(?:[\s.\-_]*(?:playoffs?|postseason))?|wnba|euroleague|ncaa)\b/i.test(value)) score += 2
    if (sport === 'baseball' && /\b(?:mlb|major[\s.\-_]*league[\s.\-_]*baseball)\b/i.test(value)) score += 2
    if (sport === 'american-football' && /\b(?:nfl|ncaa|cfl|ufl)\b/i.test(value)) score += 2
    if (sport === 'motorsport' && /\b(?:f1|formula[\s.\-_]*1|formula1|motogp|nascar|indycar|wrc|supercars|v8[\s.\-_]*supercars|bathurst|wsbk|wec|formula[\s.\-_]*e|grand[\s.\-_]*prix|gp)\b/i.test(value)) score += 2
    if (sport === 'mma' && /\b(?:ufc|bellator|pfl|fight[\s.\-_]*night|one[\s.\-_]*championship)\b/i.test(value)) score += 2
    if (sport === 'darts' && /\b(?:pdc|bdo|darts|premier[\s.\-_]*league[\s.\-_]*darts)\b/i.test(value)) score += 2
    if (sport === 'cricket' && /\b(?:ipl|indian[\s.\-_]*premier[\s.\-_]*league|t20|odi|ashes)\b/i.test(value)) score += 2
    if (sport === 'golf' && /\b(?:pga(?:[\s.\-_]*tour)?|lpga|masters|open[\s.\-_]*championship|ryder[\s.\-_]*cup)\b/i.test(value)) score += 2
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
