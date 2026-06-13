#!/usr/bin/env node
/**
 * Acceptance oracle for SPORTS_TITLE_PARSER_SPEC.md §7.
 *
 * Encodes all 17 §7 acceptance rows (RAW -> required fields) plus regression
 * cases for the CONFIRMED-WORKING happy paths that must not break. Runs the
 * real parser path (parseSportsTitleContract). Prints a PASS/FAIL table and
 * exits non-zero on any failure.
 *
 * Wired as `npm run smoke:sports-parser`.
 */

const { parseSportsTitleContract } = require('../src/utils/sportsTitleParser')

// Each case: { id, raw, opts (Prowlarr context), expect: { field: value | predicate } }
// A value is checked for case-insensitive string equality after trim.
// A function predicate receives the actual value and returns boolean.

const eq = (want) => (got) =>
  String(got || '').trim().toLowerCase() === String(want || '').trim().toLowerCase()

const noReleaseNoise = (got) =>
  !/\b(?:h264|h265|x264|x265|fbb|megust[ae]?|afg|epworks|mwr)\b/i.test(String(got || ''))

const CASES = [
  // ---------------- §7 ACCEPTANCE MATRIX (17 rows) ----------------
  {
    id: '1 Combat',
    raw: 'DAZN Carter Efe vs Portable Full Event 01 05 26 Z3R0 720p',
    opts: { sportHint: 'boxing', pubDate: '2026-05-01T00:00:00Z' },
    expect: {
      sport: eq('boxing'),
      event: eq('Carter Efe vs Portable'),
      tvChannel: eq('DAZN'),
      session: eq('Full Event'),
      date: eq('2026-05-01'),
      year: eq('2026'),
      quality: eq('720p'),
      home: (v) => !v,
      away: (v) => !v
    }
  },
  {
    id: '1b Combat MVP MMA no split/release leak',
    raw: 'MVP MMA 1 Rousey vs Carano 1080p H264-FBB',
    opts: { sportHint: 'mma', categoryNames: ['MMA'], pubDate: '2026-05-17T00:00:00Z' },
    expect: {
      sport: eq('mma'),
      event: (v) => /rousey\s+vs\s+carano/i.test(v) && noReleaseNoise(v),
      home: (v) => !v,
      away: (v) => !v,
      quality: eq('1080p')
    }
  },
  {
    id: '1c Combat ONE Fight Night no duplicate/release leak',
    raw: 'ONE Championship One Fight Night 43 H264-FBB 1080p',
    opts: { sportHint: 'mma', categoryNames: ['MMA'], pubDate: '2026-05-17T00:00:00Z' },
    expect: {
      sport: eq('mma'),
      competition: eq('ONE Championship'),
      event: (v) => eq('Fight Night')(v) && noReleaseNoise(v),
      round: eq('Night 43'),
      home: (v) => !v,
      away: (v) => !v
    }
  },
  {
    id: '2 Motorsport',
    raw: 'IndyCar NTT 2026 Indy500 Practice 1 & 2 14 05 720pEN60fps FS1',
    opts: { sportHint: 'motorsport', pubDate: '2026-05-14T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      year: eq('2026'),
      round: eq('Indy500'),
      session: eq('Practice 1 & 2'),
      venue: eq('Indianapolis'),
      date: eq('2026-05-14'),
      quality: (v) => /720p/i.test(v),
      language: eq('EN')
    }
  },
  {
    id: '2b Motorsport BSB Race One not ONE Championship',
    raw: 'BSB Donington Park GP Race One 1080p H264-FBB',
    opts: { sportHint: 'motorsport', categoryNames: ['Motorsport'], pubDate: '2026-05-17T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      competition: eq('British Superbikes'),
      event: (v) => eq('Donington Park GP')(v) && noReleaseNoise(v),
      session: eq('Race One')
    }
  },
  {
    id: '2c Motorsport Formula E no scene-group leak',
    raw: 'Formula E 2026 Monaco E Prix EPWorks 1080p',
    opts: { sportHint: 'motorsport', categoryNames: ['Formula E'], pubDate: '2026-05-17T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      competition: eq('Formula E'),
      event: (v) => eq('Monaco E Prix')(v) && noReleaseNoise(v),
      venue: eq('Monaco')
    }
  },
  {
    id: '3 Football unmapped comp',
    raw: 'UECL 2026 03 12 Crystal Palace vs AEK Larnaca 1080p WEB H264',
    opts: { sportHint: 'football', pubDate: '2026-03-12T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('UEFA Europa Conference League'),
      date: eq('2026-03-12'),
      home: eq('Crystal Palace'),
      away: eq('AEK Larnaca'),
      quality: (v) => /1080p/i.test(v)
    }
  },
  {
    id: '4 Mislabelled comp',
    raw: 'EPL 2026 Celtic vs Rangers 10 05 720pEN60fps CBS',
    opts: { sportHint: 'football', pubDate: '2026-05-10T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('Scottish Premiership'),
      home: eq('Celtic'),
      away: eq('Rangers'),
      date: eq('2026-05-10'),
      year: eq('2026'),
      tvChannel: (v) => !v
    }
  },
  {
    id: '5 Documentary',
    raw: 'Formula 1 Drive to Survive S06 1080p WEBRip x265 KONTRAST',
    opts: { sportHint: 'motorsport', pubDate: '2026-04-01T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      competition: eq('Formula 1'),
      contentType: eq('documentary'),
      title: (v) => /drive to survive/i.test(v) && /s06/i.test(v),
      date: eq('2026-04-01')
    }
  },
  {
    id: '6 Ancillary',
    raw: 'MotoGP 2026 Round05 France Post Event Press Conference WEB DL 1080p H264',
    opts: { sportHint: 'motorsport', pubDate: '2026-05-04T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      competition: eq('MotoGP'),
      round: eq('Round05'),
      venue: eq('France'),
      contentType: eq('ancillary'),
      year: eq('2026'),
      date: eq('2026-05-04')
    }
  },
  {
    id: '7 Round-noise destroys team',
    raw: 'AFL 2026 Round 10 Game 1 Brisbane Lions V Geelong Cats 1080p KAYO WEB DL',
    opts: { sportHint: 'australian-football', pubDate: '2026-06-01T00:00:00Z' },
    expect: {
      sport: eq('australian-football'),
      competition: eq('AFL'),
      year: eq('2026'),
      gameNumber: eq('Round 10 Game 1'),
      home: eq('Brisbane Lions'),
      away: eq('Geelong Cats'),
      date: eq('2026-06-01')
    }
  },
  {
    id: '8 Season-qualifier breaks year',
    raw: 'MLB RS 2026 Seattle Mariners vs Chicago White Sox 10 05',
    opts: { sportHint: 'baseball', pubDate: '2026-05-09T00:00:00Z' },
    expect: {
      sport: eq('baseball'),
      competition: eq('MLB'),
      season: eq('Regular Season'),
      home: eq('Seattle Mariners'),
      away: eq('Chicago White Sox'),
      date: eq('2026-05-10'),
      year: eq('2026')
    }
  },
  {
    id: '9 US date M/D/YY',
    raw: 'Indiana Fever vs Chicago Sky 6/16/24',
    opts: { sportHint: 'basketball', pubDate: '2024-06-16T00:00:00Z' },
    expect: {
      sport: eq('basketball'),
      home: eq('Indiana Fever'),
      away: eq('Chicago Sky'),
      date: eq('2024-06-16'),
      year: eq('2024')
    }
  },
  {
    id: '10 at separator',
    raw: 'NBA Playoffs 2026 05 09 R2G3 Oklahoma City Thunder at Los Angeles Lakers EN',
    opts: { sportHint: 'basketball', pubDate: '2026-05-09T00:00:00Z' },
    expect: {
      sport: eq('basketball'),
      competition: eq('NBA Playoffs'),
      date: eq('2026-05-09'),
      gameNumber: (v) => /r2\s*g3/i.test(v),
      away: eq('Oklahoma City Thunder'),
      home: eq('Los Angeles Lakers'),
      language: eq('EN')
    }
  },
  {
    id: '11 Wrong-date guard',
    raw: 'MLB 2026 12 05 2026 Chicago Cubs vs Atlanta Braves 1080p60fps BravesVsn',
    opts: { sportHint: 'baseball', pubDate: '2026-05-12T00:00:00Z' },
    expect: {
      date: eq('2026-05-12'),
      sport: eq('baseball'),
      competition: eq('MLB'),
      home: eq('Chicago Cubs'),
      away: eq('Atlanta Braves')
    }
  },
  {
    id: '12 Tennis vs',
    raw: 'WTA Roma QF 2026 Sorana Cirstea vs Jelena Ostapenko 12 05 DAZN',
    opts: { sportHint: 'tennis', pubDate: '2026-05-12T00:00:00Z' },
    expect: {
      sport: eq('tennis'),
      competition: (v) => /wta/i.test(v),
      round: eq('Quarter Final'),
      home: eq('Sorana Cirstea'),
      away: eq('Jelena Ostapenko'),
      date: eq('2026-05-12'),
      tvChannel: eq('DAZN'),
      year: eq('2026')
    }
  },
  {
    id: '13 Tennis comma no-vs',
    raw: 'WTA Rome, Italy Women Singles Semifinals Cirstea, Sorana Gauff, Coco',
    opts: { sportHint: 'tennis', pubDate: '2026-05-11T00:00:00Z' },
    expect: {
      sport: eq('tennis'),
      competition: (v) => /wta/i.test(v),
      round: eq('Semi Final'),
      date: eq('2026-05-11')
    }
  },
  {
    id: '14 Slash date',
    raw: 'Inside the NBA 2026/05/10 1080p 50fps ESPN',
    opts: { sportHint: 'basketball', pubDate: '2026-05-10T00:00:00Z' },
    expect: {
      sport: eq('basketball'),
      competition: (v) => /nba/i.test(v),
      contentType: eq('ancillary'),
      date: eq('2026-05-10')
    }
  },
  {
    id: '15 Abbreviation',
    raw: 'NBA 2026 05 13 R2G5 CLE vs DET ESPN',
    opts: { sportHint: 'basketball', pubDate: '2026-05-13T00:00:00Z' },
    expect: {
      sport: eq('basketball'),
      competition: (v) => /nba/i.test(v),
      date: eq('2026-05-13'),
      gameNumber: (v) => /r2\s*g5/i.test(v),
      home: eq('Cleveland Cavaliers'),
      away: eq('Detroit Pistons')
    }
  },
  {
    id: '16 Club norm + upstream gap',
    raw: 'Dutch Eredivisie 2026 FC Groningen vs N E C 10 05',
    opts: { sportHint: 'football', pubDate: '2026-05-10T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('Eredivisie'),
      home: eq('FC Groningen'),
      away: eq('NEC Nijmegen'),
      date: eq('2026-05-10')
    }
  },
  {
    id: '17 Unmapped -> Others',
    raw: 'American Rodeo 2026 Super Qualifier St Tite 04 04 720pEN60fps',
    opts: { sportHint: '', categoryNames: [], pubDate: '2026-04-04T00:00:00Z' },
    expect: {
      sport: eq('Others'),
      round: eq('Super Qualifier'),
      date: eq('2026-04-04'),
      year: eq('2026')
    }
  },

  // ---------------- REGRESSION: CONFIRMED-WORKING happy paths ----------------
  {
    id: 'R1 NHL leading-date team-vs-team',
    raw: 'NHL 2026 05 10 Boston Bruins vs Toronto Maple Leafs 1080p',
    opts: { sportHint: 'hockey', pubDate: '2026-05-10T00:00:00Z' },
    expect: {
      sport: eq('hockey'),
      competition: eq('NHL'),
      home: eq('Boston Bruins'),
      away: eq('Toronto Maple Leafs'),
      date: eq('2026-05-10')
    }
  },
  {
    id: 'R2 EPL leading-date team-vs-team',
    raw: 'EPL 2026 05 11 Arsenal vs Chelsea 1080p',
    opts: { sportHint: 'football', pubDate: '2026-05-11T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('English Premier League'),
      home: eq('Arsenal'),
      away: eq('Chelsea'),
      date: eq('2026-05-11')
    }
  },
  {
    id: 'R3 MLS leading-date team-vs-team',
    raw: 'MLS 2026 05 12 LA Galaxy vs Seattle Sounders 1080p',
    opts: { sportHint: 'football', pubDate: '2026-05-12T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('Major League Soccer'),
      home: eq('LA Galaxy'),
      away: eq('Seattle Sounders'),
      date: eq('2026-05-12')
    }
  },
  {
    id: 'R4 NBA Playoffs @ + m4rtyr scene-group',
    raw: 'NBA Playoffs 2026 05 09 Boston Celtics @ Miami Heat 1080p m4rtyr',
    opts: { sportHint: 'basketball', pubDate: '2026-05-09T00:00:00Z' },
    expect: {
      sport: eq('basketball'),
      competition: eq('NBA Playoffs'),
      away: eq('Boston Celtics'),
      home: eq('Miami Heat'),
      date: eq('2026-05-09')
    }
  },
  {
    id: 'R5 Tennis WTA Roma vs + year',
    raw: 'WTA Roma 2026 Iga Swiatek vs Aryna Sabalenka 14 05',
    opts: { sportHint: 'tennis', pubDate: '2026-05-14T00:00:00Z' },
    expect: {
      sport: eq('tennis'),
      home: eq('Iga Swiatek'),
      away: eq('Aryna Sabalenka'),
      date: eq('2026-05-14'),
      year: eq('2026')
    }
  },
  {
    id: 'R6 AEW Dynamite weekly show',
    raw: 'AEW Dynamite 2026 05 07 1080p',
    opts: { sportHint: 'wrestling', pubDate: '2026-05-07T00:00:00Z' },
    expect: {
      sport: eq('wrestling'),
      competition: eq('AEW'),
      date: eq('2026-05-07')
    }
  },

  // -------- WC-NATION ABBREVIATION (USA dropped -> team_vs_team fix) --------
  // Confirmed bug: "USA" was stripped as a broadcast-region token so the home
  // side was discarded and the fixture collapsed to a single tournament_event.
  // The abbreviation must resolve to the canonical nation as the HOME side.
  {
    id: 'WC1 USA abbreviation as home (full name baseline)',
    raw: 'FIFA World Cup United States vs Paraguay',
    opts: { sportHint: 'football' },
    expect: {
      sport: eq('football'),
      competition: eq('FIFA World Cup'),
      home: eq('United States'),
      away: eq('Paraguay')
    }
  },
  {
    id: 'WC2 USA abbreviation as home',
    raw: 'FIFA World Cup USA Vs Paraguay',
    opts: { sportHint: 'football' },
    expect: {
      sport: eq('football'),
      competition: eq('FIFA World Cup'),
      home: eq('United States'),
      away: eq('Paraguay')
    }
  },
  {
    id: 'WC3 USA abbreviation as home with date + broadcaster',
    raw: 'FIFA World Cup 2026 USA vs Paraguay 12 06 Fox',
    opts: { sportHint: 'football', pubDate: '2026-06-12T00:00:00Z' },
    expect: {
      sport: eq('football'),
      competition: eq('FIFA World Cup'),
      home: eq('United States'),
      away: (v) => /^paraguay/i.test(String(v || '')),
      date: eq('2026-06-12'),
      year: eq('2026')
    }
  },
  {
    id: 'WC4 England abbreviation as home (english-tag strip guard)',
    raw: 'FIFA World Cup England vs Wales',
    opts: { sportHint: 'football' },
    expect: {
      sport: eq('football'),
      competition: eq('FIFA World Cup'),
      home: eq('England'),
      away: eq('Wales')
    }
  },
  {
    id: 'WC5 single-event F1 GP still a single event (no false split)',
    raw: 'Formula 1 2026 USA Grand Prix Race 1080p',
    opts: { sportHint: 'motorsport', pubDate: '2026-10-25T00:00:00Z' },
    expect: {
      sport: eq('motorsport'),
      competition: eq('Formula 1'),
      contentType: eq('event'),
      home: (v) => !v,
      away: (v) => !v,
      event: (v) => !!String(v || '').trim()
    }
  }
]

function fmt(v) {
  if (v === undefined || v === null || v === '') return '∅'
  return String(v)
}

function run() {
  let pass = 0
  let fail = 0
  const rows = []

  for (const c of CASES) {
    const actual = parseSportsTitleContract(c.raw, c.opts || {})
    const failures = []
    for (const [field, check] of Object.entries(c.expect)) {
      const got = actual[field]
      const ok = typeof check === 'function' ? !!check(got) : eq(check)(got)
      if (!ok) {
        failures.push(`${field}: got=${fmt(got)} want=${typeof check === 'function' ? '<predicate>' : check}`)
      }
    }
    if (failures.length === 0) {
      pass += 1
      rows.push(`PASS  ${c.id}`)
    } else {
      fail += 1
      rows.push(`FAIL  ${c.id}`)
      for (const f of failures) rows.push(`        - ${f}`)
      rows.push(`        actual=${JSON.stringify(actual)}`)
    }
  }

  console.log('\n=== smoke:sports-parser — SPORTS_TITLE_PARSER_SPEC.md §7 oracle ===\n')
  for (const r of rows) console.log(r)
  console.log(`\n${pass}/${pass + fail} passed (${fail} failed)\n`)

  if (fail > 0) process.exit(1)
}

run()
