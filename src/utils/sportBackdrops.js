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

const FOOTBALL_COMPETITION_PATTERN = /\b(?:epl|premier\s*league|fa\s*cup|efl\s*cup|carabao\s*cup|champions\s*league|u(?:e)?fa\s*champions\s*league|ucl|europa\s*league|conference\s*league|championship|la\s*liga|serie\s*a|bundesliga|ligue\s*1|international\s*football|international\s*soccer|uefa|fifa|world\s*cup|nations\s*league|euro\s*qualifiers?|copa\s*america|afcon|mls|major\s*league\s*soccer)\b/i

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
  const normalizedBucket = REQUIRED_SPORT_BACKDROP_BUCKETS.includes(bucket)
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

function resolveSportBackdropBucket(input = {}) {
  const text = normalizeSearchText(input)
  const normalizedText = text.toLowerCase()
  const detectedSport = resolveSportHint({
    explicitHint: input.sport || input.sportHint,
    categoryHint: input.category || input.source,
    title: text
  })

  if (FOOTBALL_COMPETITION_PATTERN.test(text) || detectedSport === 'football' || /\bsoccer\b/i.test(text)) return 'football'
  if (/\b(?:motogp|moto\s*gp|moto2|moto3)\b/i.test(text)) return 'motogp'
  if (/\b(?:f1|formula\s*1|formula1|grand\s*prix)\b/i.test(text)) return 'formula1'
  if (/\b(?:ufc|ultimate\s*fighting|fight\s*night|mma|mixed\s*martial\s*arts|bellator|pfl|one\s*championship)\b/i.test(text) || detectedSport === 'mma') return 'ufc'
  if (/\b(?:boxing|matchroom|queensberry|top\s*rank|bkfc)\b/i.test(text) || detectedSport === 'boxing') return 'boxing'
  if (/\b(?:rugby|nrl|super\s*rugby|six\s*nations|premiership\s*rugby)\b/i.test(text) || detectedSport === 'rugby') return 'rugby'
  if (/\b(?:cricket|ipl|indian\s*premier\s*league|test\s*cricket|odi|t20|ashes|hundred)\b/i.test(text) || detectedSport === 'cricket') return 'cricket'
  if (/\b(?:tennis|atp|wta|wimbledon|roland\s*garros|us\s*open|australian\s*open|davis\s*cup|laver\s*cup)\b/i.test(text) || detectedSport === 'tennis') return 'tennis'
  if (/\b(?:golf|pga|lpga|masters|ryder\s*cup|liv\s*golf|open\s*championship)\b/i.test(text) || detectedSport === 'golf') return 'golf'
  if (/\b(?:nba|wnba|basketball|euroleague|ncaa\s*basketball)\b/i.test(text) || detectedSport === 'basketball') return 'nba'
  if (/\b(?:nfl|ncaaf|ncaa\s*football|college\s*football|super\s*bowl|gridiron|american\s*football|cfl|ufl)\b/i.test(text) || detectedSport === 'american-football') return 'nfl'
  if (/\b(?:nhl|hockey|ice\s*hockey|stanley\s*cup|iihf|khl)\b/i.test(text) || detectedSport === 'hockey' || detectedSport === 'ice-hockey') return 'nhl'
  if (/\b(?:mlb|major\s*league\s*baseball|baseball|world\s*series)\b/i.test(text) || detectedSport === 'baseball') return 'mlb'
  if (/\b(?:wwe|aew|wrestling|raw|smackdown|nxt)\b/i.test(text) || detectedSport === 'wrestling') return 'wrestling'
  if (/\b(?:darts|pdc|bdo|world\s*matchplay)\b/i.test(text) || detectedSport === 'darts') return 'darts'
  if (normalizedText.includes('motorsport')) return 'formula1'
  return GENERIC_SPORT_BACKDROP_BUCKET
}

function resolveAvailableSportBackdropBucket(input = {}) {
  const bucket = resolveSportBackdropBucket(input)
  if (hasSportBackdrop(bucket)) return bucket
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
  const bucket = resolveAvailableSportBackdropBucket(input)
  return {
    bucket,
    filename: bucket ? sportBackdropFilename(bucket) : '',
    path: bucket ? sportBackdropPath(bucket) : '',
    url: buildSportBackdropUrl(input.baseUrl, bucket),
    source: bucket ? 'pvtkrrx-sport-4k-backdrop' : ''
  }
}

module.exports = {
  GENERIC_SPORT_BACKDROP_BUCKET,
  REQUIRED_SPORT_BACKDROP_BUCKETS,
  SPORT_BACKDROP_DIR,
  SPORT_BACKDROP_PUBLIC_PREFIX,
  SPORT_BACKDROP_VERSION,
  buildSportBackdropUrl,
  hasSportBackdrop,
  resolveAvailableSportBackdropBucket,
  resolveSportBackdrop,
  resolveSportBackdropBucket,
  sportBackdropFilename,
  sportBackdropPath
}
