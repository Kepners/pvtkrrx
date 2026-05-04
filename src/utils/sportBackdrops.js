const fs = require('fs')
const path = require('path')
const { resolveSportHint } = require('./sportsRules')

const SPORT_BACKDROP_VERSION = '20260429-sport-level-4k-v1'
const SPORT_BACKDROP_PUBLIC_PREFIX = '/sports-backdrops'
const SPORT_BACKDROP_DIR = path.join(__dirname, '..', '..', 'public', 'sports-backdrops')
const GENERIC_SPORT_BACKDROP_BUCKET = 'generic-sport'

const REQUIRED_SPORT_BACKDROP_BUCKETS = Object.freeze([
  'football',
  'formula1',
  'motogp',
  'ufc',
  'boxing',
  'rugby',
  'cricket',
  'tennis',
  'golf',
  'nba',
  'nfl',
  'nhl',
  'mlb',
  'wrestling',
  'darts',
  GENERIC_SPORT_BACKDROP_BUCKET
])

// Phase 5 backlog buckets (template-contract.md §2 footnotes). The routing
// logic below sets `requestedBucket` to one of these names when the source
// matches the relevant pattern. The URL builder accepts these names too, but
// `hasSportBackdrop` returns false until the asset file is dropped into
// `public/sports-backdrops/<bucket>-4k.jpg` AND a SHA-256 mirror is committed
// to `backdrops/python-backdrops/`. Until that happens, `resolveSportBackdrop`
// transparently falls back to `generic-sport`. When the asset lands, move the
// bucket name from this list into REQUIRED_SPORT_BACKDROP_BUCKETS and the
// smoke `npm run smoke:sport-backdrops` will start enforcing parity for it.
const PLANNED_SPORT_BACKDROP_BUCKETS = Object.freeze([
  'motorsport',
  'snooker',
  'table-tennis',
  'badminton'
])

const ALL_KNOWN_BACKDROP_BUCKETS = Object.freeze([
  ...REQUIRED_SPORT_BACKDROP_BUCKETS,
  ...PLANNED_SPORT_BACKDROP_BUCKETS
])

const FOOTBALL_COMPETITION_PATTERN = /\b(?:epl|premier\s*league|fa\s*cup|efl\s*cup|efl\s*championship|carabao\s*cup|champions\s*league|u(?:e)?fa\s*champions\s*league|ucl|europa\s*league|conference\s*league|la\s*liga|serie\s*a|bundesliga|ligue\s*1|international\s*football|international\s*soccer|uefa|fifa|world\s*cup|nations\s*league|euro\s*qualifiers?|copa\s*america|afcon|mls|major\s*league\s*soccer)\b/i
const FORMULA_ONE_PATTERN = /\b(?:f1|formula\s*1|formula1|formula\s*one)\b/i
const MOTOGP_PATTERN = /\b(?:motogp|moto\s*gp|moto2|moto3)\b/i
const NEUTRAL_MOTORSPORT_PATTERN = /\b(?:motorsport|motor\s*racing|wrc|world\s*rally|rally|nascar|indycar|supercars?|v8sc|wsbk|wec|formula\s*e|formulae|dakar|grand\s*prix)\b/i

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function isBroadcastLayoutFamily(value = '') {
  return String(value || '').trim().toUpperCase() === 'BROADCAST'
}

function normalizeSearchText(input = {}) {
  return [
    input.sport,
    input.sportHint,
    input.league,
    input.competition,
    input.category,
    input.source,
    input.title,
    input.name,
    input.rawTitle
  ].map(normalizeSpace).filter(Boolean).join(' ')
}

function sportBackdropFilename(bucket) {
  const normalizedBucket = ALL_KNOWN_BACKDROP_BUCKETS.includes(bucket)
    ? bucket
    : GENERIC_SPORT_BACKDROP_BUCKET
  return `${normalizedBucket}-4k.jpg`
}

function sportBackdropPath(bucket) {
  return path.join(SPORT_BACKDROP_DIR, sportBackdropFilename(bucket))
}

function hasSportBackdrop(bucket) {
  try {
    return fs.existsSync(sportBackdropPath(bucket))
  } catch (_) {
    return false
  }
}

function resolveSportBackdropIntent(input = {}) {
  const text = normalizeSearchText(input)
  const detectedSport = resolveSportHint({
    explicitHint: input.sport || input.sportHint,
    categoryHint: input.category || input.source,
    title: text
  })
  const broadcast = isBroadcastLayoutFamily(input.layoutFamily || input.theme || input.templateFamily)
  const genericReason = broadcast ? 'neutral_sports_broadcast_backdrop' : ''

  let requestedBucket = GENERIC_SPORT_BACKDROP_BUCKET
  let fallbackReason = genericReason

  if (FOOTBALL_COMPETITION_PATTERN.test(text) || detectedSport === 'football' || /\bsoccer\b/i.test(text)) requestedBucket = 'football'
  else if (MOTOGP_PATTERN.test(text)) requestedBucket = 'motogp'
  else if (FORMULA_ONE_PATTERN.test(text)) requestedBucket = 'formula1'
  else if (/\b(?:ufc|ultimate\s*fighting|fight\s*night|mma|mixed\s*martial\s*arts|bellator|pfl|one\s*championship)\b/i.test(text) || detectedSport === 'mma') requestedBucket = 'ufc'
  else if (/\b(?:boxing|matchroom|queensberry|top\s*rank|bkfc)\b/i.test(text) || detectedSport === 'boxing') requestedBucket = 'boxing'
  else if (/\b(?:rugby|nrl|super\s*rugby|six\s*nations|premiership\s*rugby)\b/i.test(text) || detectedSport === 'rugby') requestedBucket = 'rugby'
  else if (/\b(?:cricket|ipl|indian\s*premier\s*league|test\s*cricket|odi|t20|ashes|hundred)\b/i.test(text) || detectedSport === 'cricket') requestedBucket = 'cricket'
  // Table-tennis check MUST come before tennis: "Table Tennis World Tour"
  // contains the substring "tennis" and would otherwise match the tennis
  // pattern first.
  else if (/\b(?:table\s*tennis|ping[\s-]*pong|ittf)\b/i.test(text) || detectedSport === 'table-tennis') requestedBucket = 'table-tennis'
  else if (/\b(?:tennis|atp|wta|wimbledon|roland\s*garros|us\s*open|australian\s*open|davis\s*cup|laver\s*cup)\b/i.test(text) || detectedSport === 'tennis') requestedBucket = 'tennis'
  else if (/\b(?:golf|pga|lpga|masters|ryder\s*cup|liv\s*golf|open\s*championship)\b/i.test(text) || detectedSport === 'golf') requestedBucket = 'golf'
  else if (/\b(?:nba|wnba|basketball|euroleague|ncaa\s*basketball)\b/i.test(text) || detectedSport === 'basketball') requestedBucket = 'nba'
  else if (/\b(?:nfl|ncaaf|ncaa\s*football|college\s*football|super\s*bowl|gridiron|american\s*football|cfl|ufl)\b/i.test(text) || detectedSport === 'american-football') requestedBucket = 'nfl'
  else if (/\b(?:nhl|hockey|ice\s*hockey|stanley\s*cup|iihf|khl)\b/i.test(text) || detectedSport === 'hockey' || detectedSport === 'ice-hockey') requestedBucket = 'nhl'
  else if (/\b(?:mlb|major\s*league\s*baseball|baseball|world\s*series)\b/i.test(text) || detectedSport === 'baseball') requestedBucket = 'mlb'
  else if (/\b(?:wwe|aew|wrestling|raw|smackdown|nxt)\b/i.test(text) || detectedSport === 'wrestling') requestedBucket = 'wrestling'
  else if (/\b(?:darts|pdc|bdo|world\s*matchplay)\b/i.test(text) || detectedSport === 'darts') requestedBucket = 'darts'
  // Phase 5 backlog: snooker + badminton (table-tennis check moved above
  // tennis to win substring race). `resolveSportBackdrop` falls back to
  // generic-sport until the asset file ships.
  else if (/\b(?:snooker|crucible|world\s*snooker|uk\s*championship|world\s*matchplay\s*snooker|pool|billiards)\b/i.test(text) || detectedSport === 'snooker') requestedBucket = 'snooker'
  else if (/\b(?:badminton|bwf)\b/i.test(text) || detectedSport === 'badminton') requestedBucket = 'badminton'
  // WRC, NASCAR, IndyCar, Supercars, WEC, Formula E, Dakar, Grand Prix
  // (where not specifically F1) all share the planned `motorsport` bucket
  // (template-contract.md §2 row 17 / Q5.1 user direction).
  else if (NEUTRAL_MOTORSPORT_PATTERN.test(text) || detectedSport === 'motorsport') {
    requestedBucket = 'motorsport'
    fallbackReason = 'planned_motorsport_bucket_phase5_backlog'
  }

  return {
    bucket: requestedBucket,
    requestedBucket,
    fallbackReason
  }
}

function resolveSportBackdropBucket(input = {}) {
  return resolveSportBackdropIntent(input).bucket
}

function resolveAvailableSportBackdropBucket(input = {}) {
  const intent = resolveSportBackdropIntent(input)
  if (hasSportBackdrop(intent.bucket)) return intent.bucket
  if (hasSportBackdrop(GENERIC_SPORT_BACKDROP_BUCKET)) return GENERIC_SPORT_BACKDROP_BUCKET
  return ''
}

function buildSportBackdropUrl(baseUrl, bucket) {
  const addonBase = normalizeSpace(baseUrl).replace(/\/+$/, '')
  if (!addonBase || !bucket) return ''
  const url = new URL(`${addonBase}${SPORT_BACKDROP_PUBLIC_PREFIX}/${sportBackdropFilename(bucket)}`)
  url.searchParams.set('v', SPORT_BACKDROP_VERSION)
  return url.toString()
}

function resolveSportBackdrop(input = {}) {
  const intent = resolveSportBackdropIntent(input)
  let bucket = intent.bucket
  let fallbackReason = intent.fallbackReason
  if (bucket && !hasSportBackdrop(bucket)) {
    fallbackReason = `missing_${bucket}_backdrop_used_generic`
    bucket = hasSportBackdrop(GENERIC_SPORT_BACKDROP_BUCKET) ? GENERIC_SPORT_BACKDROP_BUCKET : ''
  }
  return {
    bucket,
    requestedBucket: intent.requestedBucket,
    filename: bucket ? sportBackdropFilename(bucket) : '',
    path: bucket ? sportBackdropPath(bucket) : '',
    url: buildSportBackdropUrl(input.baseUrl, bucket),
    source: bucket ? 'pvtkrrx-sport-4k-backdrop' : '',
    fallbackReason
  }
}

module.exports = {
  GENERIC_SPORT_BACKDROP_BUCKET,
  REQUIRED_SPORT_BACKDROP_BUCKETS,
  PLANNED_SPORT_BACKDROP_BUCKETS,
  ALL_KNOWN_BACKDROP_BUCKETS,
  SPORT_BACKDROP_DIR,
  SPORT_BACKDROP_PUBLIC_PREFIX,
  SPORT_BACKDROP_VERSION,
  buildSportBackdropUrl,
  hasSportBackdrop,
  resolveAvailableSportBackdropBucket,
  resolveSportBackdrop,
  resolveSportBackdropBucket,
  resolveSportBackdropIntent,
  sportBackdropFilename,
  sportBackdropPath
}
