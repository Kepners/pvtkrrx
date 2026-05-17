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
  uwcl: {
    name: 'UEFA Womens Champions League',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Womens Champions League', "UEFA Women's Champions League", "Women's Champions League", 'UWCL']
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
  facup: {
    name: 'FA Cup',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['English FA Cup', 'The FA Cup', 'The Emirates FA Cup', 'Emirates FA Cup', 'Football Association Cup']
  },
  wsl: {
    name: 'English Womens Super League',
    idLeague: '4849',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Womens Super League', "Women's Super League", 'Barclays Womens Super League', "Barclays Women's Super League", 'FA WSL', 'WSL']
  },
  englishnationalleague: {
    name: 'English National League',
    idLeague: '4590',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['National League', 'Vanarama National League', 'Conference National']
  },
  mls: {
    name: 'Major League Soccer',
    idLeague: '4346',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['MLS', 'American Major League Soccer', 'US Major League Soccer']
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
  nbaplayoffs: {
    name: 'NBA Playoffs',
    idLeague: '4387',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['NBA Postseason', 'National Basketball Association Playoffs']
  },
  basketballchampionsleague: {
    name: 'Basketball Champions League',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['BCL']
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
    aliases: ['SBK', 'WorldSBK', 'World Superbike', 'World Superbikes', 'World Superbike Championship']
  },
  bsb: {
    name: 'British Superbikes',
    idLeague: '',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['BSB', 'British Superbike', 'British Superbikes', 'British Superbike Championship']
  },
  diamondleague: {
    name: 'Diamond League',
    idLeague: '5282',
    sportKey: 'athletics',
    sportsDbSport: 'Athletics',
    aliases: ['World Athletics Diamond League', 'Athletics Diamond League']
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
    sportsDbSport: 'Golf',
    aliases: ['PGA']
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
  ncaabaseball: {
    name: 'NCAA Baseball',
    sportKey: 'baseball',
    sportsDbSport: 'Baseball',
    aliases: ['College Baseball']
  },
  worldbaseballclassic: {
    name: 'World Baseball Classic',
    sportKey: 'baseball',
    sportsDbSport: 'Baseball',
    aliases: ['WBC']
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
    name: 'Super Rugby',
    idLeague: '4505',
    sportKey: 'rugby',
    sportsDbSport: 'Rugby',
    aliases: ['Super Rugby Pacific']
  },
  superleaguerugby: {
    name: 'English Rugby League Super League',
    idLeague: '4415',
    sportKey: 'rugby',
    sportsDbSport: 'Rugby',
    aliases: ['Super League', 'Rugby Super League', 'Super League Rugby']
  },
  mlr: {
    name: 'Major League Rugby',
    sportKey: 'rugby',
    sportsDbSport: 'Rugby',
    aliases: ['MLR']
  },
  easycreditbbl: {
    name: 'EasyCredit BBL',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['Easycredit BBL Germany', 'Basketball Bundesliga']
  },
  bclamericas: {
    name: 'Basketball Champions League Americas',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['Basketball Champions League of Americas', 'BCL Americas']
  },
  slb: {
    name: 'Super League Basketball',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['SLB']
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
  wimbledon: {
    name: 'Wimbledon',
    idLeague: '4463',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis',
    aliases: ['The Championships Wimbledon']
  },
  australianopen: {
    name: 'Australian Open',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis'
  },
  rolandgarros: {
    name: 'Roland Garros',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis',
    aliases: ['French Open']
  },
  usopen: {
    name: 'US Open',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis',
    aliases: ['U.S. Open']
  },
  daviscup: {
    name: 'Davis Cup',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis'
  },
  lavercup: {
    name: 'Laver Cup',
    sportKey: 'tennis',
    sportsDbSport: 'Tennis'
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
  },

  // ---- SPORTS_TITLE_PARSER_SPEC.md §5 required leagueMap additions ----
  wsl: {
    name: "Women's Super League",
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['WSL', 'FA WSL', 'Barclays Womens Super League', "Women's Super League", 'Womens Super League']
  },
  afl: {
    name: 'AFL',
    sportKey: 'australian-football',
    sportsDbSport: 'Australian Football',
    aliases: ['Australian Football League', 'Aussie Rules']
  },
  uecl: {
    name: 'UEFA Europa Conference League',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['UECL', 'Europa Conference League', 'Conference League', 'UEFA Conference League']
  },
  giro: {
    name: "Giro d'Italia",
    sportKey: 'cycling',
    sportsDbSport: 'Cycling',
    aliases: ['Giro', 'Giro Italia', 'Tour of Italy']
  },
  btcc: {
    name: 'BTCC',
    sportKey: 'motorsport',
    sportsDbSport: 'Motorsport',
    aliases: ['British Touring Car Championship', 'British Touring Cars']
  },
  stanleycup: {
    name: 'Stanley Cup',
    idLeague: '4380',
    sportKey: 'hockey',
    sportsDbSport: 'Ice Hockey',
    aliases: ['SC', 'NHL Stanley Cup', 'Stanley Cup Playoffs', 'Stanley Cup Final']
  },
  euroleague: {
    name: 'EuroLeague',
    idLeague: '4546',
    sportKey: 'basketball',
    sportsDbSport: 'Basketball',
    aliases: ['Turkish Airlines EuroLeague', 'Euro League Basketball']
  },
  rsl: {
    name: 'Roshn Saudi League',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['RSL', 'Saudi Pro League', 'Saudi Professional League', 'SPL Saudi']
  },
  jupilerproleague: {
    name: 'Jupiler Pro League',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Belgian Pro League', 'Belgian First Division A', 'Pro League Belgium']
  },
  ekstraklasa: {
    name: 'Ekstraklasa',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Polish Ekstraklasa', 'PKO BP Ekstraklasa']
  },
  ligaportugal: {
    name: 'Liga Portugal',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Primeira Liga', 'Liga Portugal Betclic', 'Portuguese Primeira Liga', 'Primeira']
  },
  bundesliga2: {
    name: '2. Bundesliga',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['2.Bundesliga', '2 Bundesliga', 'Zweite Bundesliga', 'German 2. Bundesliga']
  },
  eredivisie: {
    name: 'Eredivisie',
    idLeague: '4337',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Dutch Eredivisie', 'Holland Eredivisie']
  },
  segundadivision: {
    name: 'Segunda División',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Segunda Division', 'LaLiga 2', 'Spanish Segunda Division', 'La Liga 2']
  },
  scottishpremiership: {
    name: 'Scottish Premiership',
    idLeague: '4330',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['SPFL', 'Scottish Premier League', 'Scottish Premiership Football']
  },
  nrlleague: {
    name: 'NRL',
    idLeague: '4416',
    sportKey: 'rugby-league',
    sportsDbSport: 'Rugby',
    aliases: ['National Rugby League', 'Australian National Rugby League']
  },
  uefaeuropaconference: {
    name: 'UEFA Europa & Conference League',
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['UEFA Europa and Conference League', 'Europa & Conference League']
  },
  womensworldcupqualifier: {
    name: "Women's FIFA World Cup Qualifier",
    sportKey: 'football',
    sportsDbSport: 'Soccer',
    aliases: ['Womens World Cup Qualifier', "Women's World Cup Qualifiers", 'FIFA Women World Cup Qualifier']
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
