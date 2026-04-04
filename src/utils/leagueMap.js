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
  f1: 'Formula 1',
  formula1: 'Formula 1',
  motogp: 'MotoGP',
  nascar: 'NASCAR',
  indycar: 'IndyCar',
  wrc: 'WRC',
  supercars: 'Supercars Championship',
  v8sc: 'Supercars Championship',
  wsbk: 'World Superbikes',
  wec: 'WEC',
  formulae: 'Formula E',
  pga: 'PGA Tour',
  lpga: 'LPGA Tour',
  pdc: 'PDC Darts',
  mlb: 'MLB',
  nhl: 'NHL',
  wwe: 'WWE',
  aew: 'AEW'
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

function listMappedLeagues() {
  return Object.entries(LEAGUE_MAP).map(([code, name]) => ({ code, name }))
}

module.exports = {
  LEAGUE_MAP,
  listMappedLeagues,
  mapLeague
}
