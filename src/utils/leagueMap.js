const LEAGUE_MAP = Object.freeze({
  epl: {
    name: 'English Premier League',
    idLeague: '4328',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Premier League', 'EPL']
  },
  ucl: {
    name: 'UEFA Champions League',
    idLeague: '4480',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Champions League', 'UCL']
  },
  uel: {
    name: 'UEFA Europa League',
    idLeague: '4481',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Europa League', 'UEL']
  },
  laliga: {
    name: 'Spanish La Liga',
    idLeague: '4335',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['La Liga', 'LaLiga']
  },
  seriea: {
    name: 'Italian Serie A',
    idLeague: '4332',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Serie A']
  },
  bundesliga: {
    name: 'German Bundesliga',
    idLeague: '4331',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Bundesliga']
  },
  ligue1: {
    name: 'French Ligue 1',
    idLeague: '4334',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Ligue 1']
  },
  nba: {
    name: 'NBA',
    idLeague: '4387',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['National Basketball Association']
  },
  nfl: {
    name: 'NFL',
    idLeague: '4391',
    sportKey: 'american-football',
    sportsDbSport: 'American Football',
    aliases: ['National Football League']
  },
  ufc: {
    name: 'UFC',
    idLeague: '4443',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['Ultimate Fighting Championship']
  },
  pfl: {
    name: 'PFL',
    idLeague: '5430',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['Professional Fighters League']
  },
  one: {
    name: 'ONE Championship',
    idLeague: '4495',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['ONE', 'ONE Fighting Championship', 'ONE FC']
  },
  boxing: {
    name: 'Boxing',
    idLeague: '4445',
    sportKey: 'boxing',
    sportsDbSport: 'Fighting',
    aliases: ['Boxing']
  },
  bkfc: {
    name: 'BKFC',
    idLeague: '4567',
    sportKey: 'boxing',
    sportsDbSport: 'Fighting',
    aliases: ['Bare Knuckle Boxing', 'Bare Knuckle Fighting Championship']
  },
  glory: {
    name: 'Glory',
    idLeague: '4798',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['Glory Kickboxing']
  },
  rizin: {
    name: 'Rizin FF',
    idLeague: '4491',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['RIZIN', 'RIZIN Fighting Federation']
  },
  cagewarriors: {
    name: 'Cage Warriors',
    idLeague: '4492',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['CWFC', 'Cage Warriors Fighting Championship']
  },
  lfa: {
    name: 'LFA',
    idLeague: '5429',
    sportKey: 'mma',
    sportsDbSport: 'Fighting',
    aliases: ['Legacy Fighting Alliance']
  },
  f1: {
    name: 'Formula 1',
    idLeague: '4370',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['F1', 'Formula One', 'Formula-1']
  },
  formula1: {
    name: 'Formula 1',
    idLeague: '4370',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['F1', 'Formula One', 'Formula-1']
  },
  motogp: {
    name: 'MotoGP',
    idLeague: '4407',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport'
  },
  nascar: {
    name: 'NASCAR',
    idLeague: '4393',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    sportsDbName: 'NASCAR Cup Series',
    aliases: ['NASCAR Cup Series']
  },
  indycar: {
    name: 'IndyCar',
    idLeague: '4373',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    sportsDbName: 'IndyCar Series',
    aliases: ['IndyCar Series']
  },
  wrc: {
    name: 'WRC',
    idLeague: '4409',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['World Rally Championship']
  },
  supercars: {
    name: 'Supercars Championship',
    idLeague: '4489',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    sportsDbName: 'V8 Supercars',
    aliases: ['V8 Supercars', 'Supercars']
  },
  v8sc: {
    name: 'Supercars Championship',
    idLeague: '4489',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    sportsDbName: 'V8 Supercars',
    aliases: ['V8SC', 'V8 Supercars', 'Supercars']
  },
  wsbk: {
    name: 'World Superbikes',
    idLeague: '4454',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    sportsDbName: 'SBK',
    aliases: ['SBK', 'World Superbike Championship']
  },
  wec: {
    name: 'WEC',
    idLeague: '4413',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['FIA World Endurance Championship']
  },
  formulae: {
    name: 'Formula E',
    idLeague: '4371',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport'
  },
  pga: {
    name: 'PGA Tour',
    idLeague: '4425',
    sportKey: 'golf',
    sportsDbSport: 'Golf'
  },
  lpga: {
    name: 'LPGA Tour',
    idLeague: '4553',
    sportKey: 'golf',
    sportsDbSport: 'Golf'
  },
  pdc: {
    name: 'PDC Darts',
    idLeague: '4554',
    sportKey: 'darts',
    sportsDbSport: 'Darts',
    aliases: ['PDC', 'Professional Darts Corporation']
  },
  bdo: {
    name: 'BDO Darts',
    idLeague: '4561',
    sportKey: 'darts',
    sportsDbSport: 'Darts',
    aliases: ['BDO', 'British Darts Organisation']
  },
  uciworldtour: {
    name: 'UCI World Tour',
    idLeague: '4465',
    sportKey: 'cycling',
    sportsDbSport: 'Cycling',
    aliases: ['UCI', 'UCI WorldTour', 'World Tour']
  },
  worldsnooker: {
    name: 'World Snooker',
    idLeague: '4555',
    sportKey: 'snooker',
    sportsDbSport: 'Snooker',
    aliases: ['World Snooker Tour', 'WST']
  },
  mlb: {
    name: 'MLB',
    idLeague: '4424',
    sportKey: 'baseball',
    sportsDbSport: 'Baseball',
    aliases: ['Major League Baseball']
  },
  nhl: {
    name: 'NHL',
    idLeague: '4380',
    sportKey: 'hockey',
    sportsDbSport: 'Ice Hockey',
    aliases: ['National Hockey League']
  },
  wwe: {
    name: 'WWE',
    idLeague: '4444',
    sportKey: 'wrestling',
    sportsDbSport: 'Fighting',
    aliases: ['World Wrestling Entertainment']
  },
  aew: {
    name: 'AEW',
    idLeague: '4563',
    sportKey: 'wrestling',
    sportsDbSport: 'Fighting',
    aliases: ['All Elite Wrestling']
  },
  tna: {
    name: 'TNA Wrestling',
    idLeague: '4455',
    sportKey: 'wrestling',
    sportsDbSport: 'Fighting',
    aliases: ['TNA', 'Impact Wrestling']
  },
  roh: {
    name: 'ROH',
    idLeague: '4448',
    sportKey: 'wrestling',
    sportsDbSport: 'Fighting',
    aliases: ['Ring of Honor']
  },
  njpw: {
    name: 'NJPW',
    idLeague: '4449',
    sportKey: 'wrestling',
    sportsDbSport: 'Fighting',
    aliases: ['New Japan Pro Wrestling']
  },
  nrl: {
    name: 'NRL',
    idLeague: '4416',
    sportKey: 'rugby',
    sportsDbSport: 'Rugby',
    aliases: ['National Rugby League', 'Australian National Rugby League']
  },
  superrugby: {
    name: 'English Rugby League Super League',
    idLeague: '4415',
    sportKey: 'rugby',
    sportsDbSport: 'Rugby',
    aliases: ['Super League', 'Rugby Super League']
  },
  atp: {
    name: 'ATP World Tour',
    idLeague: '4464',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis',
    aliases: ['ATP', 'Association of Tennis Professionals']
  },
  wta: {
    name: 'WTA Tour',
    idLeague: '4517',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis',
    aliases: ['WTA', 'Womens Tennis Association']
  },
  bbl: {
    name: 'Big Bash League',
    idLeague: '4461',
    sportKey: 'cricket',
    sportsDbSport: 'Cricket',
    sportsDbName: 'Australian Big Bash League',
    aliases: ['BBL', 'Big Bash']
  },
  ipl: {
    name: 'Indian Premier League',
    idLeague: '4460',
    sportKey: 'cricket',
    sportsDbSport: 'Cricket',
    aliases: ['IPL']
  },
  eurobasket: {
    name: 'EuroLeague Basketball',
    idLeague: '4546',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['EuroLeague', 'Turkish Airlines EuroLeague']
  },
  cfl: {
    name: 'CFL',
    idLeague: '4405',
    sportKey: 'american-football',
    sportsDbSport: 'American Football',
    aliases: ['Canadian Football League']
  }
})

function normalizeLeagueCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    const text = String(value || '').trim()
    const key = normalizeLeagueCode(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function createLeagueEntry(code, value = {}) {
  const name = String(value?.name || '').trim()
  const sportsDbName = String(value?.sportsDbName || name).trim()
  const aliases = uniqueStrings([name, sportsDbName, ...(Array.isArray(value?.aliases) ? value.aliases : [])])
  return Object.freeze({
    code,
    name,
    idLeague: String(value?.idLeague || '').trim(),
    sportKey: String(value?.sportKey || '').trim(),
    sportsDbSport: String(value?.sportsDbSport || '').trim(),
    sportsDbName,
    aliases: Object.freeze(aliases)
  })
}

const LEAGUE_ENTRIES = Object.freeze(
  Object.entries(LEAGUE_MAP).map(([code, value]) => createLeagueEntry(code, value))
)

const LEAGUE_LOOKUP = (() => {
  const lookup = new Map()
  for (const entry of LEAGUE_ENTRIES) {
    const keys = [entry.code, entry.name, entry.sportsDbName, ...entry.aliases]
    for (const key of keys) {
      const normalized = normalizeLeagueCode(key)
      if (!normalized || lookup.has(normalized)) continue
      lookup.set(normalized, entry)
    }
  }
  return lookup
})()

function getMappedLeagueEntry(value) {
  const normalized = normalizeLeagueCode(value)
  if (!normalized) return null
  return LEAGUE_LOOKUP.get(normalized) || null
}

function mapLeague(code) {
  return getMappedLeagueEntry(code)?.name || null
}

function listMappedLeagues() {
  return LEAGUE_ENTRIES.map((entry) => ({
    ...entry,
    aliases: [...entry.aliases]
  }))
}

module.exports = {
  LEAGUE_MAP,
  getMappedLeagueEntry,
  listMappedLeagues,
  mapLeague,
  normalizeLeagueCode
}
