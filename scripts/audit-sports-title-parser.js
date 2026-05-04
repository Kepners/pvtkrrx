#!/usr/bin/env node
// One-shot Phase 2 parser proof for the sports artwork audit.
// Runs the live PVTKRRX sports title parser + classifier + adapter against the
// 6 representative SportsCult title formats from .claude/briefs/PVTKRRX_CLAUDE_RECONCILE_AND_DISCOVERY_PROMPT.md
// Phase 2, plus 2 extra real-shape titles, and prints what the runtime extracts
// for each one. Outputs JSON to .claude/proofs/sports-artwork/audit-phase2-parser.json
// and a human-readable summary to stdout.

const fs = require('node:fs')
const path = require('node:path')

const { parseSportsTitle, parseSportsEventTitle } = require('../src/utils/sportsTitleParser')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { classifySportsEvent } = require('../src/utils/sportsEventClassifier')
const { resolveSportsPosterTemplate, layoutFamilyForSportsPosterRender } = require('../src/utils/sportsPosterTemplates')

const TITLES = [
  {
    raw: 'EPL.2026.03.15.Manchester.United.vs.Chelsea.1080p.HDTV.x264-RELEASER',
    sportHint: 'football',
    competition: 'EPL'
  },
  {
    raw: 'UFC.311.Early.Prelims.2026.01.18.1080p.WEB-DL.x264',
    sportHint: 'mma',
    competition: 'UFC'
  },
  {
    raw: 'F1.2026.Round.04.Bahrain.Grand.Prix.Qualifying.1080p',
    sportHint: 'motorsport',
    competition: 'Formula 1'
  },
  {
    raw: 'PGA.2026.The.Masters.Round.2.1080p',
    sportHint: 'golf',
    competition: 'PGA Tour'
  },
  {
    raw: 'Tennis.2026.Wimbledon.Navratilova.v.Player.720p',
    sportHint: 'tennis',
    competition: 'Wimbledon'
  },
  {
    raw: 'FA.Cup.2026.Final.Team.A.v.Team.B.1080p',
    sportHint: 'football',
    competition: 'FA Cup'
  },
  {
    raw: 'WRC.2026.Catalunya.Day3.Tanak.Highlights.1080p',
    sportHint: 'motorsport',
    competition: 'WRC'
  },
  {
    raw: 'WWE.Royal.Rumble.2026.01.31.PPV.1080p.WEB.h264-HEEL',
    sportHint: 'wrestling',
    competition: 'WWE'
  }
]

function shape(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return value
  return value
}

function projection(input) {
  const sportsTitle = parseSportsTitle(input.raw)
  const eventTitle = parseSportsEventTitle(input.raw, { sportHint: input.sportHint })
  const normalized = normalizeSportsEventMetadata({
    rawTitle: input.raw,
    sportHint: input.sportHint,
    competition: input.competition,
    source: 'audit-phase2'
  })
  const eventClass = classifySportsEvent({
    sport: normalized.sport,
    sportHint: normalized.sportHint,
    league: normalized.league,
    competition: normalized.competition,
    title: normalized.title,
    eventTitle: normalized.eventTitle,
    homeTeam: normalized.homeTeam,
    awayTeam: normalized.awayTeam,
    rawTitle: input.raw
  })
  const template = resolveSportsPosterTemplate(undefined, undefined, 'ticket-stub')
  const layoutFamily = layoutFamilyForSportsPosterRender(template, { eventClass })
  return {
    raw: input.raw,
    sportHintInput: input.sportHint,
    competitionInput: input.competition,
    parser: {
      sportsTitle: shape(sportsTitle),
      eventTitle: shape(eventTitle)
    },
    normalized: shape(normalized),
    eventClass,
    template,
    layoutFamily,
    headerLine1: normalized.sport || normalized.sportHint || input.sportHint || '',
    headerLine2: normalized.league || normalized.competition || input.competition || '',
    detailLine3: (normalized.homeTeam && normalized.awayTeam)
      ? `${normalized.homeTeam} vs ${normalized.awayTeam}`
      : (normalized.eventTitle || normalized.title || 'Event')
  }
}

const results = TITLES.map(projection)

const outDir = path.join(process.cwd(), '.claude', 'proofs', 'sports-artwork')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'audit-phase2-parser.json')
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8')

console.log('PVTKRRX sports title parser proof — Phase 2')
console.log('-'.repeat(80))
for (const r of results) {
  console.log(`Title: ${r.raw}`)
  console.log(`  sport         : ${r.normalized.sport || '(none)'}`)
  console.log(`  league        : ${r.normalized.league || '(none)'}`)
  console.log(`  date          : ${r.normalized.date || '(none)'}`)
  console.log(`  homeTeam/away : ${r.normalized.homeTeam || ''} / ${r.normalized.awayTeam || ''}`)
  console.log(`  round/session : ${r.normalized.round || ''} / ${r.normalized.session || r.normalized.eventDetail || ''}`)
  console.log(`  quality       : ${r.normalized.quality || ''}`)
  console.log(`  source/format : ${r.normalized.source || ''} / ${r.normalized.format || ''}`)
  console.log(`  display title : ${r.normalized.title || r.normalized.eventTitle || ''}`)
  console.log(`  eventClass    : ${r.eventClass}`)
  console.log(`  layoutFamily  : ${r.layoutFamily}`)
  console.log(`  HEADER L1     : ${r.headerLine1}`)
  console.log(`  HEADER L2     : ${r.headerLine2}`)
  console.log(`  DETAIL  L3    : ${r.detailLine3}`)
  console.log('')
}
console.log(`Wrote: ${outPath}`)
