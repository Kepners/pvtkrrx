#!/usr/bin/env node
// Regression bank against the redacted SportsCult RSS sample.
//
// Reads .claude/references/sportcult-rss-redacted-sample.json (real-shape
// SportsCult titles with their expected category mapping + poster
// classification) and asserts the live category map + classifier still
// produce the same contract for every row.
//
// What this proves:
//   - Every bracket category in the sample resolves via mapSportsCultCategory.
//   - The resolved appSportHint matches the fixture's expected appSportHint.
//   - The resolved canonicalSport matches the fixture's expected canonicalSport.
//   - classifySportsPosterEvent returns the fixture's expected
//     detectedPosterClass for every row when given the SportsCult
//     category context the fixture captured.
//
// What this does NOT prove (intentional — outside contract):
//   - Exact parsedHome/parsedAway/parsedTitle string match. The fixture
//     itself contains parser quirks (e.g. one row with parsedHome="|").
//     Drift in those is expected and tracked separately by
//     audit-sports-title-parser.js + smoke-sports-team-vs-team etc.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { mapSportsCultCategory } = require('../src/config/sportsCultCategoryMap')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const {
  POSTER_CLASSES,
  classifySportsPosterEvent
} = require('../src/utils/sportsPosterClassifier')

const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '.claude',
  'references',
  'sportcult-rss-redacted-sample.json'
)

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const samples = Array.isArray(fixture?.samples) ? fixture.samples : []
assert.ok(samples.length > 0, `fixture at ${FIXTURE_PATH} must contain samples[]`)

const validClasses = new Set(POSTER_CLASSES)

const failures = []
let categoryHits = 0
let appHintMatches = 0
let canonicalSportMatches = 0
let classMatches = 0

for (const sample of samples) {
  const titlePreview = String(sample.title || '').slice(0, 80)
  const sourceCategory = String(sample.sourceCategory || sample.bracketCategory || '').trim()

  const entry = mapSportsCultCategory(sourceCategory)
  if (!entry) {
    failures.push(`unmapped SportsCult category '${sourceCategory}' for "${titlePreview}"`)
    continue
  }
  categoryHits += 1

  if (entry.appSportHint !== sample.appSportHint) {
    failures.push(`'${sourceCategory}': appSportHint='${entry.appSportHint}' != fixture='${sample.appSportHint}' (title="${titlePreview}")`)
  } else {
    appHintMatches += 1
  }

  if (entry.canonicalSport !== sample.canonicalSport) {
    failures.push(`'${sourceCategory}': canonicalSport='${entry.canonicalSport}' != fixture='${sample.canonicalSport}' (title="${titlePreview}")`)
  } else {
    canonicalSportMatches += 1
  }

  const normalized = normalizeSportsEventMetadata({
    rawTitle: sample.title,
    source: 'prowlarr',
    sportHint: entry.appSportHint,
    competition: sample.parsedCompetition || entry.topLevelLabel || sourceCategory
  })

  // Replay the classifier against the same SportsCult context the fixture
  // captured, but with current parser output so stale parsedHome/parsedAway
  // fixture artifacts cannot re-authorize fake matchups.
  const classified = classifySportsPosterEvent({
    sportKey: entry.appSportHint,
    sportHint: entry.appSportHint,
    sport: normalized.sport || sample.parsedSport,
    competition: normalized.competition || sample.parsedCompetition,
    league: normalized.competition || sample.parsedCompetition,
    eventTitle: normalized.eventTitle || sample.parsedTitle,
    eventName: normalized.eventName || normalized.eventTitle || sample.parsedTitle,
    title: sample.title,
    rawTitle: sample.title,
    eventDetail: normalized.eventDetail || sample.parsedDetail,
    detail: normalized.eventDetail || sample.parsedDetail,
    homeTeam: normalized.homeTeam || '',
    awayTeam: normalized.awayTeam || '',
    principalA: normalized.principalA || normalized.homeTeam || '',
    principalB: normalized.principalB || normalized.awayTeam || '',
    sportsCultCategory: sourceCategory,
    sportsCultCategoryNames: sample.categoryNames,
    indexerCategoryName: sample.indexerCategoryName
  })

  if (!validClasses.has(classified)) {
    failures.push(`'${sourceCategory}': classifier returned unknown class '${classified}' (title="${titlePreview}")`)
    continue
  }

  if (classified !== sample.detectedPosterClass) {
    failures.push(`'${sourceCategory}': posterClass='${classified}' != fixture='${sample.detectedPosterClass}' (title="${titlePreview}")`)
  } else {
    classMatches += 1
  }
}

if (failures.length > 0) {
  console.error('SportsCult RSS replay smoke FAILED:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(
  `SportsCult RSS replay smoke passed. samples=${samples.length} ` +
  `categoryHits=${categoryHits} appHintMatches=${appHintMatches} ` +
  `canonicalSportMatches=${canonicalSportMatches} classMatches=${classMatches}`
)
