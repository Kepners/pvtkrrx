const SPORTS = [
  { key: 'football', keywords: ['football', 'soccer', 'epl', 'premier league', 'mls', 'major league soccer', 'american major league soccer', 'la liga', 'serie a', 'bundesliga', 'uefa', 'champions league', 'europa league', 'conference league', 'efl', 'english football league', 'league one', 'league two', 'fa cup', 'carabao cup', 'community shield'] },
  { key: 'basketball', keywords: ['basketball', 'nba playoffs', 'nba postseason', 'nba', 'wnba', 'euroleague'] },
  { key: 'baseball', keywords: ['baseball', 'major league baseball', 'mlb'] },
  { key: 'hockey', keywords: ['hockey', 'nhl', 'ice hockey'] },
  { key: 'american-football', keywords: ['american football', 'nfl', 'ncaa football', 'college football', 'super bowl', 'cfl', 'ufl'] },
  { key: 'mma', keywords: ['mma', 'ufc', 'fight night', 'bellator', 'pfl'] },
  { key: 'boxing', keywords: ['boxing'] },
  { key: 'tennis', keywords: ['tennis', 'atp', 'wta'] },
  { key: 'rugby', keywords: ['rugby'] },
  { key: 'cricket', keywords: ['cricket', 'indian premier league', 'ipl', 't20'] },
  { key: 'motorsport', keywords: ['f1', 'formula 1', 'formula1', 'motogp', 'motorsport', 'grand prix', 'indycar', 'wrc', 'nascar', 'supercars', 'v8 supercars', 'bathurst', 'wsbk', 'wec', 'formula e', 'rally', 'dakar', 'sprint cup'] },
  { key: 'cycling', keywords: ['cycling', 'tour de france', 'giro', 'vuelta'] },
  { key: 'wrestling', keywords: ['wwe', 'aew', 'wrestling', 'smackdown', 'raw'] },
  { key: 'darts', keywords: ['darts', 'pdc darts', 'bdo darts', 'premier league darts'] },
  { key: 'snooker', keywords: ['snooker'] },
  { key: 'golf', keywords: ['golf', 'pga tour', 'pga', 'lpga', 'masters'] },
  { key: 'athletics', keywords: ['world athletics', 'diamond league', 'continental tour', 'track and field', 'olympic athletics', 'london marathon', 'boston marathon'] },
  { key: 'olympics', keywords: ['olympics', 'olympic games'] }
]

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function detectSport(title) {
  const text = ` ${normalizeText(title)} `
  if (!text.trim()) return ''

  let bestKey = ''
  let bestScore = 0
  for (const sport of SPORTS) {
    let score = 0
    for (const keyword of sport.keywords) {
      const pattern = ` ${normalizeText(keyword)} `
      if (text.includes(pattern)) score += Math.max(1, pattern.trim().length)
    }
    if (score > bestScore) {
      bestScore = score
      bestKey = sport.key
    }
  }
  return bestKey
}

function isSportsTitle(title) {
  return Boolean(detectSport(title))
}

function stripSportTerms(value) {
  let text = ` ${normalizeText(value)} `
  for (const sport of SPORTS) {
    for (const keyword of sport.keywords) {
      const pattern = ` ${normalizeText(keyword)} `
      text = text.split(pattern).join(' ')
    }
  }
  return text.replace(/\s+/g, ' ').trim()
}

module.exports = {
  SPORTS,
  normalizeText,
  detectSport,
  isSportsTitle,
  stripSportTerms
}
