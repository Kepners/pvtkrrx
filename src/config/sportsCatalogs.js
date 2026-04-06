const SPORTS_DISCOVERY_CATALOGS = Object.freeze([
  {
    id: 'pvtkrrx-sports',
    name: 'All Sports',
    sportHint: '',
    detailOptions: ['Premier League', 'Formula 1', 'UFC', 'NBA', 'NFL', 'IPL', 'MotoGP', 'WWE', 'PDC'],
    seedTerms: ['Premier League', 'Formula 1', 'UFC', 'NBA', 'NFL', 'IPL']
  },
  {
    id: 'pvtkrrx-sports-football',
    name: 'Football',
    sportHint: 'football',
    detailOptions: ['Premier League', 'Champions League', 'Europa League', 'La Liga', 'Serie A', 'Bundesliga', 'Arsenal', 'Liverpool', 'Manchester United'],
    seedTerms: ['Premier League', 'Champions League', 'La Liga', 'Serie A']
  },
  {
    id: 'pvtkrrx-sports-motorsport',
    name: 'Motorsport',
    sportHint: 'motorsport',
    detailOptions: ['Formula 1', 'MotoGP', 'NASCAR', 'IndyCar', 'WRC', 'Supercars', 'WEC', 'Formula E'],
    seedTerms: ['Formula 1', 'MotoGP', 'NASCAR', 'Supercars']
  },
  {
    id: 'pvtkrrx-sports-mma',
    name: 'MMA',
    sportHint: 'mma',
    detailOptions: ['UFC', 'PFL', 'ONE Championship', 'Cage Warriors', 'Fight Night'],
    seedTerms: ['UFC', 'PFL', 'ONE Championship']
  },
  {
    id: 'pvtkrrx-sports-american-football',
    name: 'American Football',
    sportHint: 'american-football',
    detailOptions: ['NFL', 'College Football', 'Super Bowl', 'Playoffs'],
    seedTerms: ['NFL', 'College Football']
  },
  {
    id: 'pvtkrrx-sports-basketball',
    name: 'Basketball',
    sportHint: 'basketball',
    detailOptions: ['NBA', 'WNBA', 'EuroLeague', 'NCAA'],
    seedTerms: ['NBA', 'WNBA', 'EuroLeague']
  },
  {
    id: 'pvtkrrx-sports-cricket',
    name: 'Cricket',
    sportHint: 'cricket',
    detailOptions: ['IPL', 'Test Cricket', 'ODI', 'T20', 'The Ashes'],
    seedTerms: ['IPL', 'Test Cricket', 'T20']
  },
  {
    id: 'pvtkrrx-sports-rugby',
    name: 'Rugby',
    sportHint: 'rugby',
    detailOptions: ['NRL', 'Super Rugby', 'Six Nations', 'Rugby Championship', 'Premiership Rugby'],
    seedTerms: ['NRL', 'Super Rugby', 'Six Nations']
  },
  {
    id: 'pvtkrrx-sports-tennis',
    name: 'Tennis',
    sportHint: 'tennis',
    detailOptions: ['ATP', 'WTA', 'Wimbledon', 'US Open', 'Australian Open', 'Roland Garros'],
    seedTerms: ['ATP', 'WTA', 'Wimbledon', 'US Open']
  },
  {
    id: 'pvtkrrx-sports-boxing',
    name: 'Boxing',
    sportHint: 'boxing',
    detailOptions: ['Heavyweight', 'PPV', 'Matchroom', 'BKFC', 'Queensberry'],
    seedTerms: ['Boxing', 'BKFC']
  },
  {
    id: 'pvtkrrx-sports-golf',
    name: 'Golf',
    sportHint: 'golf',
    detailOptions: ['PGA Tour', 'LPGA Tour', 'Masters', 'Ryder Cup', 'LIV Golf'],
    seedTerms: ['PGA Tour', 'Masters', 'Ryder Cup']
  },
  {
    id: 'pvtkrrx-sports-baseball',
    name: 'Baseball',
    sportHint: 'baseball',
    detailOptions: ['MLB', 'World Series', 'Postseason'],
    seedTerms: ['MLB', 'World Series']
  },
  {
    id: 'pvtkrrx-sports-cycling',
    name: 'Cycling',
    sportHint: 'cycling',
    detailOptions: ['Tour de France', "Giro d'Italia", 'Vuelta a Espana', 'Classics'],
    seedTerms: ['Tour de France', "Giro d'Italia", 'Vuelta a Espana']
  },
  {
    id: 'pvtkrrx-sports-darts',
    name: 'Darts',
    sportHint: 'darts',
    detailOptions: ['PDC', 'Premier League Darts', 'World Championship', 'World Matchplay'],
    seedTerms: ['PDC', 'Premier League Darts']
  },
  {
    id: 'pvtkrrx-sports-snooker',
    name: 'Snooker',
    sportHint: 'snooker',
    detailOptions: ['World Championship', 'Masters', 'UK Championship'],
    seedTerms: ['Snooker', 'World Championship']
  },
  {
    id: 'pvtkrrx-sports-hockey',
    name: 'Hockey',
    sportHint: 'hockey',
    detailOptions: ['NHL', 'Stanley Cup', 'IIHF', 'KHL'],
    seedTerms: ['NHL', 'Stanley Cup']
  },
  {
    id: 'pvtkrrx-sports-wrestling',
    name: 'Wrestling',
    sportHint: 'wrestling',
    detailOptions: ['WWE', 'AEW', 'Raw', 'SmackDown', 'NXT'],
    seedTerms: ['WWE', 'AEW', 'Raw']
  }
])

function buildSportsCatalogExtra(detailOptions = []) {
  const extra = []
  if (Array.isArray(detailOptions) && detailOptions.length > 0) {
    extra.push({
      name: 'genre',
      options: detailOptions,
      isRequired: false
    })
  }
  extra.push({ name: 'search', isRequired: false })
  extra.push({ name: 'skip', isRequired: false })
  return extra
}

function buildSportsCatalogManifestEntries() {
  return SPORTS_DISCOVERY_CATALOGS.map((catalog) => ({
    type: 'sports',
    id: catalog.id,
    name: catalog.name,
    extra: buildSportsCatalogExtra(catalog.detailOptions)
  }))
}

function findSportsDiscoveryCatalog(id) {
  const normalizedId = String(id || '').trim().toLowerCase()
  if (!normalizedId) return null
  return SPORTS_DISCOVERY_CATALOGS.find((catalog) => catalog.id.toLowerCase() === normalizedId) || null
}

function getSportsSearchSeedTerms(sportHint = '') {
  const normalizedHint = String(sportHint || '').trim().toLowerCase()
  const match = SPORTS_DISCOVERY_CATALOGS.find((catalog) => String(catalog.sportHint || '').trim().toLowerCase() === normalizedHint)
  if (match?.seedTerms?.length) return [...match.seedTerms]
  const allSportsCatalog = SPORTS_DISCOVERY_CATALOGS.find((catalog) => catalog.id === 'pvtkrrx-sports')
  return allSportsCatalog?.seedTerms?.length ? [...allSportsCatalog.seedTerms] : ['UFC', 'Premier League', 'Formula 1', 'NBA', 'WWE', 'Boxing']
}

module.exports = {
  SPORTS_DISCOVERY_CATALOGS,
  buildSportsCatalogManifestEntries,
  findSportsDiscoveryCatalog,
  getSportsSearchSeedTerms
}
