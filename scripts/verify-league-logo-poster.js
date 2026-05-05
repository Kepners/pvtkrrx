#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

// Force in-process imports of fresh code
delete require.cache[require.resolve('../src/handlers/sportsArtworkProxy')]
const proxyModule = require('../src/handlers/sportsArtworkProxy')
// Internal helper not exported — use eval-friendly access
const proxySrc = fs.readFileSync(require.resolve('../src/handlers/sportsArtworkProxy.js'), 'utf8')

// Load the helper via Function constructor (since not exported)
async function main() {
  const outDir = path.resolve(__dirname, '..', 'tmp', 'real-league-logo-verify')
  fs.mkdirSync(outDir, { recursive: true })

  const mod = require('../src/handlers/sportsArtworkProxy')
  // Hack: pull the unexported helper via eval-in-module
  const proxyFile = require.resolve('../src/handlers/sportsArtworkProxy.js')
  const Module = require('module')
  const m = new Module(proxyFile)
  m.filename = proxyFile
  m.paths = Module._nodeModulePaths(path.dirname(proxyFile))
  m._compile(proxySrc + '\nmodule.exports.__internals = { tryRealLeagueLogoPoster, deriveLeagueCanonicalId };', proxyFile)
  const { tryRealLeagueLogoPoster, deriveLeagueCanonicalId } = m.exports.__internals

  const CASES = [
    { label: 'motogp-poster', sport: 'motorsport', league: 'MotoGP' },
    { label: 'ucl-poster', sport: 'football', league: 'UEFA Champions League' },
    { label: 'epl-poster', sport: 'football', league: 'English Premier League' },
    { label: 'fa-cup-poster', sport: 'football', league: 'FA Cup' },
    { label: 'uel-poster', sport: 'football', league: 'UEFA Europa League' },
    { label: 'ufc-poster', sport: 'mma', league: 'UFC' },
    { label: 'atp-poster', sport: 'tennis', league: 'ATP World Tour' },
    { label: 'nhl-poster', sport: 'hockey', league: 'NHL' },
    { label: 'mlb-poster', sport: 'baseball', league: 'MLB' }
  ]

  for (const { label, sport, league } of CASES) {
    const canonical = deriveLeagueCanonicalId(sport, league)
    console.log(`[case] ${label}: sport=${sport} league="${league}" canonicalLeague=${canonical}`)
    const result = await tryRealLeagueLogoPoster({
      variant: 'poster',
      sport,
      league,
      sportsmetaBaseUrl: 'https://sportsmeta.pvtkrrx.cc',
      fallbackInput: { sport, league, title: league, eventClass: 'tournament_event' },
      template: 'ticket-stub'
    })
    if (result?.buffer) {
      const out = path.join(outDir, `${label}.png`)
      fs.writeFileSync(out, result.buffer)
      console.log(`  -> logoKind=${result.logoKind} src=${result.logoSourceUrl} png=${out} (${result.buffer.length} bytes)`)
    } else {
      console.log(`  -> NO MATCH (returned null)`)
    }
    console.log('')
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
