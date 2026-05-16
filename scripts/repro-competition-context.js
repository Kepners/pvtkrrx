#!/usr/bin/env node
'use strict'

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')

process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE = 'false'

const proxy = require('../src/handlers/sportsArtworkProxy')

const SPORTSMETA_BASE_URL = 'https://sportsmeta.pvtkrrx.cc'
const OUT = path.join(__dirname, '..', '.runtime', 'sports-artwork-previews')

function makeResponse() {
  const headers = {}
  const chunks = []
  const res = {
    setHeader: (key, value) => { headers[String(key).toLowerCase()] = String(value) },
    status: () => res,
    type: () => res,
    send: (body) => {
      chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body || '')))
      return res
    },
    end: (body) => {
      if (body) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body)))
      return res
    }
  }
  return { headers, chunks, res }
}

async function renderDefault({ variant, sport, query }) {
  const { headers, chunks, res } = makeResponse()
  await proxy.handleDefaultSportsArtwork(
    {
      params: { variant, sport: `${sport}.png` },
      query: { source: 'repro', template: 'broadcast', ...query }
    },
    res,
    { sportsmetaBaseUrl: SPORTSMETA_BASE_URL }
  )
  return { headers, buffer: Buffer.concat(chunks) }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  const cases = [
    {
      label: 'uel-freiburg-logo',
      variant: 'logo',
      sport: 'football',
      query: {
        league: 'UEFA Europa League',
        title: 'Freiburg vs KRC Genk',
        date: '2026-03-19',
        home: 'Freiburg',
        away: 'KRC Genk',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'mlsr7d1718774547'
    },
    {
      label: 'ucl-logo',
      variant: 'logo',
      sport: 'football',
      query: {
        league: 'UEFA Champions League',
        title: 'Arsenal vs Atletico Madrid',
        date: '2026-05-05',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'facv1u1742998896'
    },
    {
      label: 'fa-cup-logo',
      variant: 'logo',
      sport: 'football',
      query: {
        league: 'The Emirates FA Cup',
        title: 'Chelsea vs Manchester City',
        date: '2026-05-14',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'vk7isd1598802862'
    },
    {
      label: 'fa-cup-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'Football',
        competition: 'The Emirates FA Cup',
        title: 'The Emirates FA Cup Final Day',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'vk7isd1598802862'
    },
    {
      label: 'national-league-logo',
      variant: 'logo',
      sport: 'football',
      query: {
        league: 'English National League',
        competition: 'English National League',
        title: 'Chesterfield vs Notts County',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: '5mq9v01752167973'
    },
    {
      label: 'national-league-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'English National League',
        competition: 'English National League',
        title: 'Chesterfield vs Notts County',
        home: 'Chesterfield',
        away: 'Notts County',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: '5mq9v01752167973'
    },
    {
      label: 'wsl-tottenham-brighton-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'English Womens Super League',
        competition: 'English Womens Super League',
        title: 'Tottenham Women vs Brighton WFC',
        home: 'Tottenham Women',
        away: 'Brighton WFC',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'lpsm6p1751723311',
      slotNeedle: 'league:real-league:.*lpsm6p1751723311',
      expectedKind: /real-team|mixed|real-league/
    },
    {
      label: 'wsl-aston-london-city-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'English Womens Super League',
        competition: 'English Womens Super League',
        title: 'Aston Villa WFC vs London City Lionesses',
        home: 'Aston Villa WFC',
        away: 'London City Lionesses',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'lpsm6p1751723311',
      slotNeedle: 'league:real-league:.*lpsm6p1751723311',
      expectedKind: /real-team|mixed|real-league/
    },
    {
      label: 'uel-celta-freiburg-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'UEFA Europa League',
        competition: 'UEFA Europa League',
        title: 'Celta Vigo vs Freiburg',
        home: 'Celta Vigo',
        away: 'Freiburg',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'mlsr7d1718774547',
      slotNeedle: 'league:real-league:.*mlsr7d1718774547',
      expectedKind: /real-team|mixed|real-league/
    },
    {
      label: 'uel-porto-stuttgart-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'UEFA Europa League',
        competition: 'UEFA Europa League',
        title: 'Porto vs Stuttgart',
        home: 'Porto',
        away: 'Stuttgart',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'mlsr7d1718774547',
      slotNeedle: 'league:real-league:.*mlsr7d1718774547',
      expectedKind: /real-team|mixed|real-league/
    },
    {
      label: 'uel-panathinaikos-real-betis-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'UEFA Europa League',
        competition: 'UEFA Europa League',
        title: 'Panathinaikos vs Real Betis',
        home: 'Panathinaikos',
        away: 'Real Betis',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'teamlogos/soccer/500/443.png',
      expectedKind: /mixed|real-team/
    },
    {
      label: 'uel-midtjylland-nottingham-poster',
      variant: 'poster',
      sport: 'football',
      query: {
        league: 'UEFA Europa League',
        competition: 'UEFA Europa League',
        title: 'Midtjylland vs Nottingham Forest',
        home: 'Midtjylland',
        away: 'Nottingham Forest',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'teamlogos/soccer/500/572.png',
      expectedKind: /mixed|real-team/
    },
    {
      label: 'maccabi-haifa-tel-aviv-poster',
      variant: 'poster',
      sport: 'basketball',
      query: {
        league: 'Basketball',
        competition: 'Basketball',
        title: 'Maccabi Haifa vs Maccabi Tel Aviv',
        home: 'Maccabi Haifa',
        away: 'Maccabi Tel Aviv',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'Maccabi_Haifa_B.C_logo.png',
      expectedKind: /mixed|real-team/
    },
    {
      label: 'ncaa-minnesota-nebraska-poster',
      variant: 'poster',
      sport: 'basketball',
      query: {
        league: 'NCAA Basketball',
        competition: 'NCAA Basketball',
        title: 'Minnesota Golden Gophers vs Nebraska Cornhuskers',
        home: 'Minnesota Golden Gophers',
        away: 'Nebraska Cornhuskers',
        eventClass: 'team_vs_team'
      },
      sourceNeedle: 'teamlogos/ncaa/500/135.png',
      expectedKind: /mixed|real-team/
    },
    {
      label: 'supercars-logo',
      variant: 'logo',
      sport: 'motorsport',
      query: {
        league: 'Supercars Championship',
        title: 'Supercars Championship Race Melbourne',
        eventClass: 'motorsport_event'
      },
      sourceNeedle: '64f67s1770108650'
    },
    {
      label: 'world-superbikes-logo',
      variant: 'logo',
      sport: 'motorsport',
      query: {
        league: 'World Superbikes',
        title: 'World Superbikes Czech Republic Superpole',
        eventClass: 'motorsport_event'
      },
      sourceNeedle: 'g2j9rc1649703609'
    },
    {
      label: 'world-superbikes-poster',
      variant: 'poster',
      sport: 'motorsport',
      query: {
        league: 'World Superbikes',
        title: 'World Superbikes Czech Republic Superpole',
        eventClass: 'motorsport_event'
      },
      sourceNeedle: 'g2j9rc1649703609'
    },
    {
      label: 'diamond-league-logo',
      variant: 'logo',
      sport: 'athletics',
      query: {
        league: 'Diamond League',
        competition: 'Diamond League',
        title: 'Athletics Diamond League 2026 Shanghai',
        eventClass: 'athletics_event'
      },
      sourceNeedle: '7d5xlh1650475438'
    },
    {
      label: 'diamond-league-poster',
      variant: 'poster',
      sport: 'athletics',
      query: {
        league: 'Diamond League',
        competition: 'Diamond League',
        title: 'Athletics Diamond League 2026 Shanghai',
        eventClass: 'athletics_event'
      },
      sourceNeedle: '7d5xlh1650475438'
    },
    {
      label: 'boxing-logo',
      variant: 'logo',
      sport: 'boxing',
      query: {
        league: 'Boxing',
        competition: 'Boxing',
        title: 'Chukhadzhian vs Donovan',
        eventClass: 'combat'
      },
      sourceNeedle: 'xtssst1473774665'
    },
    {
      label: 'wwe-logo',
      variant: 'logo',
      sport: 'wrestling',
      query: {
        league: 'WWE',
        competition: 'WWE',
        title: 'WWE Main YT',
        eventClass: 'single_event'
      },
      sourceNeedle: 'WWE_official_logo.svg'
    },
    {
      label: 'tna-logo',
      variant: 'logo',
      sport: 'wrestling',
      query: {
        league: 'TNA Wrestling',
        competition: 'TNA Wrestling',
        title: 'TNA Wrestling iMPACT TNAPreview',
        eventClass: 'single_event'
      },
      sourceNeedle: 'TNA_Wrestling'
    },
    {
      label: 'supercars-poster',
      variant: 'poster',
      sport: 'motorsport',
      query: {
        league: 'Supercars Championship',
        title: 'Supercars Championship Race Melbourne',
        eventClass: 'motorsport_event'
      },
      sourceNeedle: '64f67s1770108650'
    }
  ]

  for (const testCase of cases) {
    const result = await renderDefault(testCase)
    const sourceUrls = result.headers['x-pvtkrrx-logo-source-urls'] || result.headers['x-pvtkrrx-logo-source-url'] || ''
    const logoSlots = result.headers['x-pvtkrrx-logo-slots'] || ''
    const logoKind = result.headers['x-pvtkrrx-artwork-logo-kind'] || result.headers['x-pvtkrrx-logo-kind'] || ''
    const expectedKind = testCase.expectedKind || /real-league|real-event/
    assert.match(logoKind, expectedKind, `${testCase.label} should use the expected real logo kind`)
    assert.match(sourceUrls, new RegExp(testCase.sourceNeedle), `${testCase.label} should use the expected competition logo source`)
    if (testCase.slotNeedle) {
      assert.match(logoSlots, new RegExp(testCase.slotNeedle), `${testCase.label} should put the competition logo in the league slot`)
    }
    const outFile = path.join(OUT, `competition-${testCase.label}.png`)
    fs.writeFileSync(outFile, result.buffer)
    console.log(`${testCase.label}: logoKind=${logoKind} source=${sourceUrls} png=${outFile}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
