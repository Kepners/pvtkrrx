function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SPORTS_CULT_CATEGORY_ID_TO_SPORT = new Map([
  ['100012', 'tennis'],
  ['100038', 'snooker'],
  ['100053', 'cricket'],
  ['100047', 'football'],
  ['100043', 'football'],
  ['100044', 'football'],
  ['100060', 'football'],
  ['100061', 'football'],
  ['100056', 'football'],
  ['100067', 'football'],
  ['100068', 'football'],
  ['100073', 'football'],
  ['100081', 'football'],
  ['100092', 'football'],
  ['100098', 'football'],
  ['100006', 'football'],
  ['100004', 'football'],
  ['100011', 'basketball'],
  ['100001', 'basketball'],
  ['100002', 'basketball'],
  ['100003', 'basketball'],
  ['100063', 'basketball'],
  ['100065', 'basketball'],
  ['100069', 'basketball'],
  ['100083', 'basketball'],
  ['100084', 'basketball'],
  ['100101', 'basketball'],
  ['100103', 'basketball'],
  ['100024', 'baseball'],
  ['100051', 'baseball'],
  ['100005', 'american-football'],
  ['100041', 'american-football'],
  ['100059', 'american-football'],
  ['100085', 'american-football'],
  ['100097', 'american-football'],
  ['100028', 'mma'],
  ['100058', 'mma'],
  ['100077', 'mma'],
  ['100029', 'boxing'],
  ['100035', 'boxing'],
  ['100033', 'wrestling'],
  ['100009', 'mma'],
  ['100032', 'motorsport'],
  ['100015', 'motorsport'],
  ['100054', 'motorsport'],
  ['100055', 'motorsport'],
  ['100064', 'motorsport'],
  ['100082', 'motorsport'],
  ['100095', 'motorsport'],
  ['100070', 'motorsport'],
  ['100023', 'cycling'],
  ['100089', 'cycling'],
  ['100090', 'cycling'],
  ['100091', 'cycling'],
  ['100007', 'rugby'],
  ['100057', 'rugby'],
  ['100025', 'hockey'],
  ['100027', 'hockey'],
  ['100042', 'hockey'],
  ['100052', 'hockey'],
  ['100050', 'golf'],
  ['100026', 'olympics'],
  ['100104', 'olympics'],
  ['100094', 'olympics']
])

function sportKeyFromCategoryName(name) {
  const text = normalizeText(name)
  if (!text) return ''

  if (/tennis|table tennis/.test(text)) return 'tennis'
  if (/snooker|pool|billard/.test(text)) return 'snooker'
  if (/cricket/.test(text)) return 'cricket'
  if (/afl|australian football|aussie rules/.test(text)) return 'australian-football'
  if (/epl|efl|elc|la liga|serie a|ligue1|bundesliga|champions league|europa league|conference league|uecl|uel|international soccer|european soccer|beachsoccer|mls|primeiraportugal|liga portugal|eredivisie|belgianproleague|jupiler|ekstraklasa|segunda|scottish prem|spfl|wsl|womens super league|roshn|saudi (?:pro )?league|rsl/.test(text)) return 'football'
  if (/nba|wnba|euroleague|european basketball|international basket|ncaa basketball|fiba|gleague|streetball|basketball champions|eurocup/.test(text)) return 'basketball'
  if (/mlb|baseball/.test(text)) return 'baseball'
  if (/nfl|american football|ncaa football|ufl|cfl/.test(text)) return 'american-football'
  if (/mma|ufc|bellator|fight sports|ultimate diskk|kickboxing|muay thai/.test(text)) return 'mma'
  if (/boxing/.test(text)) return 'boxing'
  if (/wrestling|grapling/.test(text)) return 'wrestling'
  if (/formula1|motogp|moto2|moto3|moto 2|moto 3|nascar|indycar|wsbk|btcc|wrc|automotoracing|motorsport/.test(text)) return 'motorsport'
  if (/darts|premier league darts/.test(text)) return 'darts'
  if (/cycling|tourdefrance|lavuelta|giro/.test(text)) return 'cycling'
  if (/nrl|rugby league/.test(text)) return 'rugby-league'
  if (/rugby|gaa/.test(text)) return 'rugby'
  if (/icehockey|nhl|khl|stanley cup|field hockey/.test(text)) return 'hockey'
  if (/golf/.test(text)) return 'golf'
  if (/olympic/.test(text)) return 'olympics'
  return ''
}

function scoreSportCandidate(current, next) {
  if (!next) return current
  if (!current) return next
  return current
}

function sportHintFromCategory(input = {}) {
  const indexerName = String(input.indexerName || '').trim().toLowerCase()
  const categoryIds = Array.isArray(input.categoryIds) ? input.categoryIds : []
  const categoryNames = Array.isArray(input.categoryNames) ? input.categoryNames : []

  let hint = ''

  if (indexerName.includes('sportscult')) {
    for (const rawId of categoryIds) {
      const id = String(rawId || '').trim()
      if (!id || id === '5060') continue
      hint = scoreSportCandidate(hint, SPORTS_CULT_CATEGORY_ID_TO_SPORT.get(id) || '')
      if (hint) return hint
    }
  }

  for (const name of categoryNames) {
    hint = scoreSportCandidate(hint, sportKeyFromCategoryName(name))
    if (hint) return hint
  }

  return hint
}

module.exports = {
  sportKeyFromCategoryName,
  sportHintFromCategory
}
