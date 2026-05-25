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
    ['moto gp', 'motorsport'],
    ['moto2', 'motorsport'],
    ['moto 2', 'motorsport'],
    ['moto3', 'motorsport'],
    ['moto 3', 'motorsport'],
    ['nascar', 'motorsport'],
    ['indycar', 'motorsport'],
    ['wrc', 'motorsport'],
    ['supercars', 'motorsport'],
    ['v8 supercars', 'motorsport'],
    ['v8sc', 'motorsport'],
    ['wsbk', 'motorsport'],
    ['bsb', 'motorsport'],
    ['british superbike', 'motorsport'],
    ['british superbikes', 'motorsport'],
    ['wec', 'motorsport'],
    ['formula e', 'motorsport'],
    ['formulae', 'motorsport'],
    ['american football', 'american-football'],
    ['gridiron football', 'american-football'],
    ['nfl', 'american-football'],
    ['ufl', 'american-football'],
    ['united football league', 'american-football'],
    ['ncaa football', 'american-football'],
    ['soccer', 'football'],
    ['efl', 'football'],
    ['efl championship', 'football'],
    ['elc', 'football'],
    ['epl', 'football'],
    ['english championship', 'football'],
    ['english football league championship', 'football'],
    ['english league championship', 'football'],
    ['mls', 'football'],
    ['major league soccer', 'football'],
    ['american major league soccer', 'football'],
    ['sky bet championship', 'football'],
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

const NBA_TEAM_PATTERN = /\b(?:atlanta\s+hawks|hawks|boston\s+celtics|celtics|brooklyn\s+nets|nets|charlotte\s+hornets|hornets|chicago\s+bulls|bulls|cleveland\s+cavaliers|cavs?|dallas\s+mavericks|mavs?|denver\s+nuggets|nuggets|detroit\s+pistons|pistons|golden\s+state\s+warriors|warriors|houston\s+rockets|rockets|indiana\s+pacers|pacers|la\s+clippers|los\s+angeles\s+clippers|clippers|los\s+angeles\s+lakers|la\s+lakers|lakers|memphis\s+grizzlies|grizzlies|miami\s+heat|milwaukee\s+bucks|bucks|minnesota\s+timberwolves|timberwolves|new\s+orleans\s+pelicans|pelicans|new\s+york\s+knicks|knicks|oklahoma\s+city\s+thunder|okc\s+thunder|thunder|orlando\s+magic|magic|philadelphia\s+76ers|76ers|sixers|phoenix\s+suns|suns|portland\s+trail\s+blazers|trail\s+blazers|blazers|sacramento\s+kings|kings|san\s+antonio\s+spurs|spurs|toronto\s+raptors|raptors|utah\s+jazz|jazz|washington\s+wizards|wizards)\b/i
const MLS_TEAM_PATTERN = /\b(?:atlanta\s+united|columbus\s+crew|colorado\s+rapids|houston\s+dynamo|new\s+york\s+city\s+fc|nycfc|orlando\s+city|san\s+jose\s+earthquakes|st\.?\s+louis\s+city)\b/i
const UFL_TEAM_PATTERN = /\b(?:dc\s+defenders|houston\s+gamblers|louisville\s+kings|orlando\s+storm)\b/i
const SNOOKER_PLAYER_PATTERN = /\b(?:john\s+higgins|shaun\s+murphy|ronnie\s+o['\s._-]*sullivan|judd\s+trump|mark\s+selby|mark\s+allen|neil\s+robertson|kyren\s+wilson|ding\s+junhui|mark\s+williams|stephen\s+maguire|jack\s+lisowski)\b/i

function detectStrongSportHintFromTitle(title) {
  const value = String(title || '')
  if (!value.trim()) return ''

  const rules = [
    ['darts', /\b(?:pdc|bdo|darts|premier[\s._-]*league[\s._-]*darts)\b/i],
    ['cricket', /\b(?:cricket|ipl|indian[\s._-]*premier[\s._-]*league|t20|odi|ashes|big[\s._-]*bash|the[\s._-]*hundred)\b/i],
    ['basketball', /\b(?:basketball[\s._-]*champions[\s._-]*league|easycredit[\s._-]*bbl|nba(?:[\s._-]*(?:playoffs?|postseason))?|wnba|euroleague|ncaa[\s._-]*basketball|slb)\b/i],
    ['football', /\b(?:efl(?:[\s._-]*championship)?|elc|epl|mls|major[\s._-]*league[\s._-]*soccer|uefa|english[\s._-]*(?:football[\s._-]*league[\s._-]*championship|football[\s._-]*league|league[\s._-]*championship|championship)|sky[\s._-]*bet[\s._-]*championship|la[\s._-]*liga|serie[\s._-]*a|bundesliga|champions[\s._-]*league|europa[\s._-]*league|conference[\s._-]*league|fa[\s._-]*cup|carabao[\s._-]*cup|community[\s._-]*shield|fifa[\s._-]*world[\s._-]*cup|world[\s._-]*cup[\s._-]*qualifiers?|uefa[\s._-]*nations[\s._-]*league|european[\s._-]*championship|euros?|euro[\s._-]*qualifiers?|copa[\s._-]*america|afcon|asian[\s._-]*cup|conmebol[\s._-]*qualifiers?|concacaf[\s._-]*qualifiers?|international[\s._-]*friendlies?)\b/i],
    ['american-football', /\b(?:nfl|ncaaf|ncaa[\s._-]*football|college[\s._-]*football|super[\s._-]*bowl|cfl|ufl|xfl)\b/i],
    ['baseball', /\b(?:mlb|major[\s._-]*league[\s._-]*baseball|baseball)\b/i],
    ['hockey', /\b(?:nhl|ice[\s._-]*hockey)\b/i],
    ['tennis', /\b(?:atp|wta|wimbledon|roland[\s._-]*garros|us[\s._-]*open|australian[\s._-]*open|davis[\s._-]*cup|laver[\s._-]*cup)\b/i],
    ['rugby', /\b(?:rugby|nrl|super[\s._-]*rugby|six[\s._-]*nations|united[\s._-]*rugby[\s._-]*championship)\b/i],
    ['motorsport', /\b(?:f1|formula[\s._-]*1|formula1|motogp|moto[\s._-]*gp|moto[\s._-]*2|moto[\s._-]*3|nascar|indycar|wrc|supercars|v8[\s._-]*supercars|bathurst|wsbk|bsb|british[\s._-]*superbikes?|wec|formula[\s._-]*e)\b/i],
    ['mma', /\b(?:ufc|bellator|pfl|fight[\s._-]*night|one[\s._-]*championship)\b/i],
    ['boxing', /\b(?:boxing|matchroom|queensberry|top[\s._-]*rank)\b/i],
    ['golf', /\b(?:pga(?:[\s._-]*tour)?|lpga|masters|ryder[\s._-]*cup|open[\s._-]*championship)\b/i],
    ['athletics', /\b(?:world[\s._-]*athletics|diamond[\s._-]*league|continental[\s._-]*tour|track[\s._-]*(?:and|&)[\s._-]*field|olympic[\s._-]*athletics|athletics[\s._-]*championships?|london[\s._-]*marathon|boston[\s._-]*marathon)\b/i],
    ['cycling', /\b(?:cycling|tour[\s._-]*de[\s._-]*france|giro[\s._-]*d[\s._-]*italia|vuelta)\b/i],
    ['wrestling', /\b(?:wwe|aew|wrestling)\b/i],
    ['snooker', /\bsnooker\b/i]
  ]

  for (const [sport, pattern] of rules) {
    if (pattern.test(value)) return sport
  }
  if (NBA_TEAM_PATTERN.test(value)) return 'basketball'
  if (SNOOKER_PLAYER_PATTERN.test(value)) return 'snooker'
  return ''
}

function resolveSportHint(input = {}) {
  const strongTitle = normalizeSportKey(detectStrongSportHintFromTitle(input.title || ''))
  const explicit = normalizeSportKey(input.explicitHint)
  const category = normalizeSportKey(input.categoryHint)
  const preferredNonTitle = explicit || category

  if (strongTitle === 'tennis' && explicit === 'football' && MLS_TEAM_PATTERN.test(String(input.title || ''))) return explicit
  if (strongTitle === 'basketball' && explicit === 'american-football' && UFL_TEAM_PATTERN.test(String(input.title || ''))) return explicit
  if (strongTitle && preferredNonTitle && strongTitle !== preferredNonTitle) return strongTitle
  if (explicit) return explicit

  if (category) return category

  if (strongTitle) return strongTitle

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
    if (sport === 'football' && /\b(?:efl(?:[\s.\-_]*championship)?|elc|epl|mls|major[\s.\-_]*league[\s.\-_]*soccer|english[\s.\-_]*(?:league[\s.\-_]*championship|championship)|sky[\s.\-_]*bet[\s.\-_]*championship|premier[\s.\-_]*league|fa[\s.\-_]*cup|la[\s.\-_]*liga|serie[\s.\-_]*a|bundesliga|champions[\s.\-_]*league|europa[\s.\-_]*league|fifa[\s.\-_]*world[\s.\-_]*cup|world[\s.\-_]*cup[\s.\-_]*qualifiers?|uefa[\s.\-_]*nations[\s.\-_]*league|euro[\s.\-_]*qualifiers?|copa[\s.\-_]*america|afcon|asian[\s.\-_]*cup|conmebol|concacaf|international[\s.\-_]*friendlies?)\b/i.test(value)) score += 2
    if (sport === 'basketball' && /\b(?:nba(?:[\s.\-_]*(?:playoffs?|postseason))?|wnba|euroleague|ncaa)\b/i.test(value)) score += 2
    if (sport === 'baseball' && /\b(?:mlb|major[\s.\-_]*league[\s.\-_]*baseball)\b/i.test(value)) score += 2
    if (sport === 'american-football' && /\b(?:nfl|ncaa|cfl|ufl)\b/i.test(value)) score += 2
    if (sport === 'motorsport' && /\b(?:f1|formula[\s.\-_]*1|formula1|motogp|moto[\s.\-_]*gp|moto[\s.\-_]*2|moto[\s.\-_]*3|nascar|indycar|wrc|supercars|v8[\s.\-_]*supercars|bathurst|wsbk|bsb|british[\s.\-_]*superbikes?|wec|formula[\s.\-_]*e|grand[\s.\-_]*prix|gp)\b/i.test(value)) score += 2
    if (sport === 'mma' && /\b(?:ufc|bellator|pfl|fight[\s.\-_]*night|one[\s.\-_]*championship)\b/i.test(value)) score += 2
    if (sport === 'darts' && /\b(?:pdc|bdo|darts|premier[\s.\-_]*league[\s.\-_]*darts)\b/i.test(value)) score += 2
    if (sport === 'cricket' && /\b(?:ipl|indian[\s.\-_]*premier[\s.\-_]*league|t20|odi|ashes)\b/i.test(value)) score += 2
    if (sport === 'golf' && /\b(?:pga(?:[\s.\-_]*tour)?|lpga|masters|open[\s.\-_]*championship|ryder[\s.\-_]*cup)\b/i.test(value)) score += 2
    if (sport === 'athletics' && /\b(?:world[\s.\-_]*athletics|diamond[\s.\-_]*league|continental[\s.\-_]*tour|track[\s.\-_]*(?:and|&)[\s.\-_]*field|olympic[\s.\-_]*athletics|marathon)\b/i.test(value)) score += 2
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
