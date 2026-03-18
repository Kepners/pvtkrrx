const LEAGUE_MAP = Object.freeze({
  epl: 'English Premier League',
  ucl: 'UEFA Champions League',
  uel: 'UEFA Europa League',
  laliga: 'Spanish La Liga',
  seriea: 'Italian Serie A',
  bundesliga: 'German Bundesliga',
  ligue1: 'French Ligue 1',
  nba: 'NBA',
  nfl: 'NFL',
  ufc: 'UFC',
  f1: 'Formula 1'
})

function normalizeLeagueCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function mapLeague(code) {
  const normalized = normalizeLeagueCode(code)
  if (!normalized) return null
  return LEAGUE_MAP[normalized] || null
}

module.exports = {
  mapLeague
}
