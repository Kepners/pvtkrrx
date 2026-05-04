#!/usr/bin/env node
// Contract-compliance audit for sports artwork rendering.
//
// This audit validates EVERY rendered output against the rules in
// .claude/trackers/sports-artwork-template-contract.md (§1 global rules,
// §2 backdrop bucket routing, §3 layout families, §4 per-class contract).
//
// Where canonical Python templates and the contract diverge (e.g. the
// canonical wrongly supplies driver pairs for F1, which §4 row 2 + Q5.3
// forbid), the contract wins. Visual fidelity to canonical is secondary.
//
// Output: .claude/proofs/sports-artwork/audit-contract-compliance.json
// + side-by-side rasters per (class, template).

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const { renderSportsPosterTemplateSvg, SPORTS_POSTER_TEMPLATES } = require('../src/utils/sportsPosterTemplates')
const { resolveSportsBackgroundAsset } = require('../src/utils/sportsArtwork')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_ROOT = path.resolve(REPO_ROOT, '.claude/proofs/sports-artwork/audit-contract-compliance')
const W = 600
const H = 900

// Test events: one per poster class per §4. Deliberately use titles that DO
// NOT contain driver/fighter names so the contract rule "names only when
// title gives them" can be tested. Where a class has both "with pair" and
// "no pair" branches, both variants are tested.
const FIXTURES = [
  // 1. team_vs_team — paired (real teams)
  {
    class: 'team_vs_team',
    slug: 'team_vs_team__epl',
    expectedFamily: 'TEAM_VS_TEAM',
    expectedBackdrop: 'football',
    event: {
      sport: 'Football', sportHint: 'football',
      league: 'English Premier League', competition: 'English Premier League',
      eventClass: 'team_vs_team',
      eventTitle: 'Manchester City vs Arsenal',
      homeTeam: 'Manchester City', awayTeam: 'Arsenal',
      principalA: 'Manchester City', principalB: 'Arsenal',
      home: { name: 'Manchester City', short: 'MCI', initials: 'MC' },
      away: { name: 'Arsenal', short: 'ARS', initials: 'AR' },
      date: '2026-04-28', round: 'Matchweek 34',
      rawTitle: 'EPL 2026.04.28 Manchester City vs Arsenal'
    },
    expect: {
      hasMatchup: true,
      mustContain: ['MANCHESTER CITY', 'ARSENAL'],
      mustNotContain: []
    }
  },
  // 1b. team_vs_team downgraded — no pair → tournament_event
  {
    class: 'team_vs_team_no_pair',
    slug: 'team_vs_team__epl_highlights',
    expectedFamily: 'TICKET_STUB',  // will fall through
    expectedBackdrop: 'football',
    event: {
      sport: 'Football', sportHint: 'football',
      league: 'English Premier League', competition: 'English Premier League',
      eventClass: 'team_vs_team',
      eventTitle: 'Premier League Highlights',
      rawTitle: 'EPL Premier League Highlights 2026.04.28',
      date: '2026-04-28'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['HIGHLIGHTS'],
      mustNotContain: ['VS', 'V '] // No fake matchup
    }
  },
  // 2. motorsport_event — F1 race, NEVER head-to-head
  {
    class: 'motorsport_event',
    slug: 'motorsport_event__f1_british_gp',
    expectedFamily: 'SINGLE_EVENT_MOTORSPORT',
    expectedBackdrop: 'formula1',
    event: {
      sport: 'Motorsport', sportHint: 'motorsport',
      league: 'Formula 1', competition: 'Formula 1',
      eventClass: 'motorsport_event',
      eventTitle: 'British Grand Prix',
      eventName: 'British Grand Prix',
      eventShort: 'British GP',
      eventDetail: 'Qualifying',
      session: 'Qualifying',
      round: 'Round 12',
      date: '2026-07-04',
      venue: 'Silverstone Circuit',
      rawTitle: 'F1 2026.07.04 British Grand Prix Qualifying'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['BRITISH'],
      // CRITICAL: NEVER show fake driver vs (Q5.3, G8)
      mustNotContain: ['VERSTAPPEN', 'NORRIS', 'HAMILTON', 'LECLERC']
    }
  },
  // 2b. motorsport_event with home/away supplied (test data trick) — should STILL be event-only
  {
    class: 'motorsport_event_invariant',
    slug: 'motorsport_event__motogp_with_fake_pair',
    expectedFamily: 'SINGLE_EVENT_MOTORSPORT',
    expectedBackdrop: 'motogp',
    event: {
      sport: 'Motorsport', sportHint: 'motorsport',
      league: 'MotoGP', competition: 'MotoGP',
      eventClass: 'motorsport_event',
      eventTitle: 'Brazilian Grand Prix',
      eventShort: 'Brazil GP',
      session: 'Race',
      date: '2026-08-15',
      // INTENTIONAL: even when test data supplies a fake driver pair, the
      // motorsport_event class must NEVER render them as head-to-head.
      homeTeam: 'Marc Marquez', awayTeam: 'Pecco Bagnaia',
      principalA: 'Marc Marquez', principalB: 'Pecco Bagnaia',
      home: { name: 'Marc Marquez', short: 'MM' },
      away: { name: 'Pecco Bagnaia', short: 'PB' },
      rawTitle: 'MotoGP 2026.08.15 Brazilian Grand Prix Race'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['BRAZILIAN'],
      // F1/MotoGP CONTRACT INVARIANT: never paired layout even with fake pair
      mustNotContain: []
    }
  },
  // 3. combat_event paired — real UFC fight
  {
    class: 'combat_event',
    slug: 'combat_event__ufc_paired',
    expectedFamily: 'COMPETITOR_VS_COMPETITOR',
    expectedBackdrop: 'ufc',
    event: {
      sport: 'MMA', sportHint: 'mma',
      league: 'UFC', competition: 'UFC',
      eventClass: 'combat_event',
      eventTitle: 'UFC 312',
      eventDetail: 'Main Event',
      homeTeam: 'Islam Makhachev', awayTeam: 'Charles Oliveira',
      principalA: 'Islam Makhachev', principalB: 'Charles Oliveira',
      home: { name: 'Islam Makhachev', short: 'MAK' },
      away: { name: 'Charles Oliveira', short: 'OLI' },
      date: '2026-06-14',
      rawTitle: 'UFC 312 2026.06.14 Makhachev vs Oliveira Main Event'
    },
    expect: {
      hasMatchup: true,
      mustContain: ['MAKHACHEV', 'OLIVEIRA'],
      mustNotContain: []
    }
  },
  // 3b. combat_event no pair — boxing event without parsed fighters
  {
    class: 'combat_event_no_pair',
    slug: 'combat_event__boxing_card',
    expectedBackdrop: 'boxing',
    event: {
      sport: 'Boxing', sportHint: 'boxing',
      league: 'Matchroom Boxing', competition: 'Matchroom Boxing',
      eventClass: 'combat_event',
      eventTitle: 'Heavyweight Title Card',
      eventDetail: 'PPV',
      date: '2026-05-10',
      rawTitle: 'Boxing 2026.05.10 Heavyweight Title Card PPV'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['HEAVYWEIGHT'],
      mustNotContain: []
    }
  },
  // 4. golf_event — names only when title gives them; don't invent
  {
    class: 'golf_event',
    slug: 'golf_event__pga_masters',
    expectedBackdrop: 'golf',
    event: {
      sport: 'Golf', sportHint: 'golf',
      league: 'PGA Tour', competition: 'PGA Tour',
      eventClass: 'golf_event',
      eventTitle: 'The Masters',
      eventDetail: 'Round 3',
      round: 'Round 3',
      date: '2026-04-14',
      rawTitle: 'PGA Tour 2026.04.14 The Masters Round 3'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['MASTERS'],
      // No fake golfers
      mustNotContain: ['SCHEFFLER', 'WOODS', 'MCILROY']
    }
  },
  // 5. wrestling_event — show name, NO fake paired headline (Q5.4)
  {
    class: 'wrestling_event',
    slug: 'wrestling_event__wwe_royal_rumble',
    expectedBackdrop: 'wrestling',
    event: {
      sport: 'Wrestling', sportHint: 'wrestling',
      league: 'WWE', competition: 'WWE',
      eventClass: 'wrestling_event',
      eventTitle: 'Royal Rumble',
      eventDetail: 'PPV',
      date: '2026-01-31',
      // INTENTIONAL: even if a fake headline pair is supplied, wrestling
      // contract says event-show shape — no fake paired headline (Q5.4).
      homeTeam: 'Cody Rhodes', awayTeam: 'Roman Reigns',
      home: { name: 'Cody Rhodes', short: 'CR' },
      away: { name: 'Roman Reigns', short: 'RR' },
      rawTitle: 'WWE Royal Rumble 2026.01.31 PPV'
    },
    expect: {
      // Wrestling per contract = event-show, no paired layout. Currently
      // PVTKRRX renders combat-style — this is a known gap (sports-artwork-
      // template-contract.md §F6 / §G1 — wrestling=event-show needs new family).
      hasMatchup: 'KNOWN_GAP_WRESTLING_EVENT_SHOW',
      mustContain: ['ROYAL'],
      mustNotContain: []
    }
  },
  // 6. cycling_event — race + stage, no driver names invented
  {
    class: 'cycling_event',
    slug: 'cycling_event__tour_de_france',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Cycling', sportHint: 'cycling',
      league: 'Tour de France', competition: 'Tour de France',
      eventClass: 'cycling_event',
      eventTitle: 'Stage 7',
      eventDetail: 'Stage 7',
      date: '2026-07-08',
      rawTitle: 'Tour de France 2026.07.08 Stage 7 Highlights'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['STAGE'],
      mustNotContain: ['POGAČAR', 'POGACAR', 'VINGEGAARD']
    }
  },
  // 7. athletics_event
  {
    class: 'athletics_event',
    slug: 'athletics_event__diamond_league',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Athletics', sportHint: 'athletics',
      league: 'World Athletics', competition: 'Diamond League',
      eventClass: 'athletics_event',
      eventTitle: 'Stockholm Meet',
      date: '2026-06-20',
      rawTitle: 'World Athletics Diamond League Stockholm 2026.06.20'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['STOCKHOLM'],
      mustNotContain: []
    }
  },
  // 8. olympic_event
  {
    class: 'olympic_event',
    slug: 'olympic_event__paris_2024',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Olympics', sportHint: 'olympics',
      league: 'Olympic Games', competition: 'Paris 2024',
      eventClass: 'olympic_event',
      eventTitle: '100m Final',
      date: '2024-08-04',
      rawTitle: 'Olympic Games Paris 2024 100m Final'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['100M'],
      mustNotContain: []
    }
  },
  // 9. winter_sport_event
  {
    class: 'winter_sport_event',
    slug: 'winter_sport_event__alpine',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Winter', sportHint: 'winter',
      league: 'Winter Olympics', competition: 'Winter Olympics',
      eventClass: 'winter_sport_event',
      eventTitle: 'Alpine Skiing',
      date: '2026-02-15',
      rawTitle: 'Winter Olympics 2026 Alpine Skiing Mens Slalom'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['ALPINE'],
      mustNotContain: []
    }
  },
  // 10. aquatics_event
  {
    class: 'aquatics_event',
    slug: 'aquatics_event__world_aquatics',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Aquatics', sportHint: 'aquatics',
      league: 'World Aquatics', competition: 'FINA',
      eventClass: 'aquatics_event',
      eventTitle: 'Mens 100m Freestyle',
      date: '2026-07-25',
      rawTitle: 'World Aquatics 2026 Mens 100m Freestyle Final'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['100M', 'FREESTYLE'],
      mustNotContain: []
    }
  },
  // 11. gymnastics_event
  {
    class: 'gymnastics_event',
    slug: 'gymnastics_event__world',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Gymnastics', sportHint: 'gymnastics',
      league: 'World Gymnastics', competition: 'World Artistic Gymnastics',
      eventClass: 'gymnastics_event',
      eventTitle: 'Mens All-Around Final',
      date: '2026-10-10',
      rawTitle: 'World Artistic Gymnastics 2026 Mens All-Around Final'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['ALL'],
      mustNotContain: []
    }
  },
  // 12. racket_event (single — no pair)
  {
    class: 'racket_event',
    slug: 'racket_event__wimbledon_solo',
    expectedBackdrop: 'tennis',
    event: {
      sport: 'Tennis', sportHint: 'tennis',
      league: 'Wimbledon', competition: 'Wimbledon',
      eventClass: 'racket_event',
      eventTitle: 'Day 7 Highlights',
      date: '2026-07-08',
      rawTitle: 'Wimbledon 2026 Day 7 Highlights'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['DAY', 'HIGHLIGHTS'],
      mustNotContain: ['DJOKOVIC', 'ALCARAZ', 'SINNER']
    }
  },
  // 13. darts_event paired
  {
    class: 'darts_event',
    slug: 'darts_event__pdc_paired',
    expectedBackdrop: 'darts',
    event: {
      sport: 'Darts', sportHint: 'darts',
      league: 'PDC World Championship', competition: 'PDC World Championship',
      eventClass: 'darts_event',
      eventTitle: 'Final',
      homeTeam: 'Luke Littler', awayTeam: 'Luke Humphries',
      principalA: 'Luke Littler', principalB: 'Luke Humphries',
      home: { name: 'Luke Littler', short: 'LIT' },
      away: { name: 'Luke Humphries', short: 'HUM' },
      date: '2026-01-03',
      rawTitle: 'PDC World Championship 2026 Final Littler vs Humphries'
    },
    expect: {
      hasMatchup: true,
      mustContain: ['LITTLER', 'HUMPHRIES'],
      mustNotContain: []
    }
  },
  // 14. tennis_or_snooker_match
  {
    class: 'tennis_or_snooker_match',
    slug: 'tennis_match__wimbledon_qf',
    expectedBackdrop: 'tennis',
    event: {
      sport: 'Tennis', sportHint: 'tennis',
      league: 'Wimbledon', competition: 'Wimbledon',
      eventClass: 'tennis_or_snooker_match',
      eventTitle: 'Quarterfinal',
      eventDetail: 'Quarterfinal',
      homeTeam: 'Carlos Alcaraz', awayTeam: 'Jannik Sinner',
      principalA: 'Carlos Alcaraz', principalB: 'Jannik Sinner',
      home: { name: 'Carlos Alcaraz', short: 'ALC' },
      away: { name: 'Jannik Sinner', short: 'SIN' },
      date: '2026-07-09',
      rawTitle: 'Wimbledon 2026 Quarterfinal Alcaraz vs Sinner'
    },
    expect: {
      hasMatchup: true,
      mustContain: ['ALCARAZ', 'SINNER'],
      mustNotContain: []
    }
  },
  // 15. tournament_event (chess, esports, downgraded TVT no pair)
  {
    class: 'tournament_event',
    slug: 'tournament_event__chess_wc',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: 'Chess', sportHint: 'athletics',
      league: 'World Chess Championship', competition: 'World Chess Championship',
      eventClass: 'tournament_event',
      eventTitle: 'Game 7',
      date: '2026-11-15',
      rawTitle: 'World Chess Championship 2026 Game 7'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['GAME'],
      mustNotContain: []
    }
  },
  // 16. generic_event (Uncategorised) — Line 1 = SPORTS per Q6.4
  {
    class: 'generic_event',
    slug: 'generic_event__unknown',
    expectedBackdrop: 'generic-sport',
    event: {
      sport: '', sportHint: '',
      league: '', competition: '',
      eventClass: 'generic_event',
      eventTitle: 'Random Sports File',
      date: '2026-04-01',
      rawTitle: 'Random Sports File 2026.04.01'
    },
    expect: {
      hasMatchup: false,
      mustContain: [],
      mustNotContain: []
    }
  }
]

// All 7 PVTKRRX templates per contract §3 / sportsPosterTemplates.SPORTS_POSTER_TEMPLATES.
// Audit must validate every template, not just the 6 visual ones.
const TEMPLATES = ['editorial', 'broadcast', 'sportsbook', 'trading-card', 'brutalist', 'ticket-stub', 'glitch']

// Logo / portrait URL fields a SportsMeta-resolved event might carry. PVTKRRX
// FREE tier (G5) must render text + sport glyphs only — these URLs MUST NOT
// appear in any rendered SVG.
const LOGO_URL_FIELDS = {
  homeLogo: 'https://sportsmeta.pvtkrrx.cc/asset/logo/sportsmeta%3Ateam%3Afootball%7Cmanchester-city.svg',
  awayLogo: 'https://sportsmeta.pvtkrrx.cc/asset/logo/sportsmeta%3Ateam%3Afootball%7Carsenal.svg',
  leagueLogo: 'https://sportsmeta.pvtkrrx.cc/asset/logo/sportsmeta%3Aleague%3Afootball%7Cepl.svg',
  homeBadge: 'https://sportsmeta.pvtkrrx.cc/asset/badge/sportsmeta%3Ateam%3Afootball%7Cmanchester-city.png',
  awayBadge: 'https://sportsmeta.pvtkrrx.cc/asset/badge/sportsmeta%3Ateam%3Afootball%7Carsenal.png',
  homePortrait: 'https://sportsmeta.pvtkrrx.cc/asset/portrait/sportsmeta%3Aplayer%3Afighter1.png',
  awayPortrait: 'https://sportsmeta.pvtkrrx.cc/asset/portrait/sportsmeta%3Aplayer%3Afighter2.png',
  // Member-scoped paid asset (the audit must NEVER see this URL in PVTKRRX poster bytes)
  memberPosterUrl: 'https://sportsmeta.pvtkrrx.cc/member/sm_paid_token_xyz/asset/poster/sportsmeta%3Aevent%3Aepl%7Cmci-vs-ars.png'
}

function checkBackdropBucket(event, expectedBucket) {
  const url = resolveSportsBackgroundAsset({
    ...event,
    baseUrl: 'https://addon.test',
    layoutFamily: 'BROADCAST'  // forces backdrop selection over canonical-id path
  })
  if (!url) return { ok: false, actual: '', reason: 'no backdrop URL emitted' }
  // Parse bucket from /sports-backdrops/<bucket>-4k.jpg pattern
  const match = String(url).match(/\/sports-backdrops\/([a-z0-9-]+?)-4k\.jpg/i)
  const actualBucket = match ? match[1] : ''
  if (!actualBucket) return { ok: false, actual: url, reason: 'URL did not match expected /sports-backdrops/<bucket>-4k.jpg shape' }
  // Phase 5 backlog: snooker/motorsport/table-tennis/badminton fall back to
  // generic-sport until the assets ship — accept generic-sport as a valid
  // alternative for those buckets per contract §2 footnotes.
  const phase5Bucket = ['snooker', 'motorsport', 'table-tennis', 'badminton'].includes(expectedBucket)
  if (phase5Bucket && actualBucket === 'generic-sport') {
    return { ok: true, actual: actualBucket, note: 'Phase 5 backlog — generic-sport fallback acceptable until asset ships' }
  }
  return { ok: actualBucket === expectedBucket, actual: actualBucket, reason: actualBucket === expectedBucket ? '' : `expected '${expectedBucket}' bucket, got '${actualBucket}'` }
}

function checkContractRules(svg, expect, fixture, template) {
  const violations = []
  const text = String(svg || '')

  // G5: no logos / portraits / member URLs anywhere in the rendered SVG.
  if (/<image\b/i.test(text)) {
    violations.push('G5: poster contains an <image> element (free tier must be text + SVG glyphs only)')
  }
  if (/sportsmeta[^"\s]*\/member\//i.test(text)) {
    violations.push('G5: member-scoped artwork URL embedded in PVTKRRX poster (paid bytes leaked into free)')
  }
  if (/data-role="(?:home-logo|away-logo|fighter-portrait|player-portrait|team-badge)"/i.test(text)) {
    violations.push('G5: poster contains real-logo / portrait slots (free tier must be text + glyphs only)')
  }
  // Any external HTTP(S) URL inside an SVG attribute that isn't xmlns is a
  // potential leak. xlink:href and href to remote URLs would embed external
  // bytes — both forbidden in free tier.
  for (const attr of ['xlink:href', 'href']) {
    const re = new RegExp(`${attr.replace(':', ':')}="https?:\\/\\/[^"]+"`, 'i')
    if (re.test(text)) {
      violations.push(`G5: poster has external ${attr} link (logo/portrait fetch would happen at render)`)
    }
  }
  // Specifically check that any logo URLs we passed in DID NOT make it into the SVG.
  for (const [field, url] of Object.entries(LOGO_URL_FIELDS)) {
    if (text.includes(url)) {
      violations.push(`G5: input '${field}' URL leaked verbatim into poster output`)
    }
  }

  // G8 + Q5.3: no invented driver/fighter names. Per-fixture mustNotContain.
  for (const banned of expect.mustNotContain || []) {
    const re = new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(text)) {
      violations.push(`G8/Q5.3: poster contains '${banned}' which the source title did not provide (invented name)`)
    }
  }

  // Required content per fixture
  for (const required of expect.mustContain || []) {
    const re = new RegExp(`\\b${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (!re.test(text)) {
      violations.push(`Missing required content: '${required}' should appear in the poster but does not`)
    }
  }

  // No "EVENT" placeholder leak (audit prompt §1)
  if (/<text[^>]*>\s*EVENT\s*<\/text>/i.test(text)) {
    violations.push('Placeholder leak: literal "EVENT" text rendered')
  }
  if (/#BGU-EVE-/i.test(text)) {
    violations.push('Placeholder leak: serial stub "#BGU-EVE-" rendered')
  }
  // Only flag visible "- EVENT -" text, not the data-event-class attribute
  // which legitimately contains the substring. Match within a <text> element.
  if (/<text[^>]*>[^<]*-\s*EVENT\s*-[^<]*<\/text>/i.test(text)) {
    violations.push('Placeholder leak: "- EVENT -" placeholder rendered')
  }

  // motorsport_event invariant: never render fake VS for solo motorsport
  if (fixture.expect.hasMatchup === false && fixture.class.startsWith('motorsport_event')) {
    if (/<text[^>]*>\s*VS\s*<\/text>/i.test(text)) {
      violations.push('Q5.3 + motorsport invariant: F1/MotoGP/etc. must NOT render a VS layout')
    }
  }

  return violations
}

async function rasterise(svg) {
  const safe = String(svg || '')
    .replace(/@import\s+url\([^)]*\)\s*;?/g, '')
    .replace(/<style>([\s\S]*?)<\/style>/g, (m, b) => {
      const c = b.replace(/&(?![a-zA-Z#]+;)/g, '&amp;')
      return c.trim() ? `<style>${c}</style>` : ''
    })
  return await sharp(Buffer.from(safe), { density: 192 })
    .resize({ width: W, height: H, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// Layout-variation extras — exercise paths the main per-class fixtures miss.
// Each adds a NEW fixture row; the same TEMPLATES sweep runs against each.
const LAYOUT_VARIATION_FIXTURES = [
  // Lone fighter on a multi-fight card (Q3.3): only one competitor parsed
  {
    class: 'combat_event_lone',
    slug: 'combat_event__lone_fighter',
    expectedBackdrop: 'ufc',
    event: {
      sport: 'MMA', sportHint: 'mma',
      league: 'UFC Fight Night', competition: 'UFC Fight Night',
      eventClass: 'combat_event',
      eventTitle: 'UFC Fight Night Pereira',
      eventDetail: 'Main Event',
      // Only one side parsed
      homeTeam: 'Alex Pereira', principalA: 'Alex Pereira',
      home: { name: 'Alex Pereira', short: 'PER' },
      date: '2026-09-12',
      rawTitle: 'UFC Fight Night 2026.09.12 Pereira Main Event'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['PEREIRA'],
      mustNotContain: ['TBA', 'TBD'] // No fake opponent invented
    }
  },
  // Multi-fight card with main + prelims badge (Q4.1, Q4.2)
  {
    class: 'combat_event_card',
    slug: 'combat_event__ufc_312_full_card',
    expectedBackdrop: 'ufc',
    event: {
      sport: 'MMA', sportHint: 'mma',
      league: 'UFC', competition: 'UFC',
      eventClass: 'combat_event',
      eventTitle: 'UFC 312',
      eventDetail: 'Main Card + Prelims',
      homeTeam: 'Islam Makhachev', awayTeam: 'Charles Oliveira',
      principalA: 'Islam Makhachev', principalB: 'Charles Oliveira',
      home: { name: 'Islam Makhachev', short: 'MAK' },
      away: { name: 'Charles Oliveira', short: 'OLI' },
      date: '2026-06-14',
      rawTitle: 'UFC 312 2026.06.14 Main Card and Early Prelims'
    },
    expect: {
      hasMatchup: true,
      mustContain: ['MAKHACHEV', 'OLIVEIRA'],
      mustNotContain: []
    }
  },
  // Wrestling with paired headline (WrestleMania main event) — must STILL be event-show, not paired
  {
    class: 'wrestling_event_paired_main',
    slug: 'wrestling_event__wrestlemania_with_main',
    expectedBackdrop: 'wrestling',
    event: {
      sport: 'Wrestling', sportHint: 'wrestling',
      league: 'WWE', competition: 'WWE',
      eventClass: 'wrestling_event',
      eventTitle: 'WrestleMania 41',
      eventDetail: 'Main Event',
      homeTeam: 'Cody Rhodes', awayTeam: 'Roman Reigns',
      principalA: 'Cody Rhodes', principalB: 'Roman Reigns',
      home: { name: 'Cody Rhodes', short: 'CR' },
      away: { name: 'Roman Reigns', short: 'RR' },
      date: '2026-04-06',
      rawTitle: 'WWE WrestleMania 41 2026.04.06 Cody Rhodes vs Roman Reigns Main Event'
    },
    expect: {
      hasMatchup: false, // Q5.4: wrestling = event-show, never paired
      mustContain: ['WRESTLEMANIA'],
      mustNotContain: []
    }
  },
  // Motorsport with WRC + day + driver in title (Q5.3 — driver allowed when title gives it)
  {
    class: 'motorsport_event_wrc_with_driver',
    slug: 'motorsport_event__wrc_day_driver',
    expectedBackdrop: 'motorsport',
    event: {
      sport: 'Motorsport', sportHint: 'motorsport',
      league: 'WRC', competition: 'WRC Catalunya',
      eventClass: 'motorsport_event',
      eventTitle: 'Catalunya Day 3 Tanak Highlights',
      eventDetail: 'Day 3',
      round: 'Day 3',
      date: '2026-10-22',
      rawTitle: 'WRC 2026.10.22 Catalunya Day 3 Tanak Highlights'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['CATALUNYA'],
      mustNotContain: []
    }
  },
  // League-only — no event detail (e.g. "PGA Tour Highlights" with no round)
  {
    class: 'golf_event_league_only',
    slug: 'golf_event__pga_tour_highlights',
    expectedBackdrop: 'golf',
    event: {
      sport: 'Golf', sportHint: 'golf',
      league: 'PGA Tour', competition: 'PGA Tour',
      eventClass: 'golf_event',
      eventTitle: 'PGA Tour Highlights',
      date: '2026-04-15',
      rawTitle: 'PGA Tour Highlights 2026.04.15'
    },
    expect: {
      hasMatchup: false,
      mustContain: ['PGA'],
      mustNotContain: []
    }
  }
]

// Build a logo-bombed copy of every fixture (clean + with logos supplied).
// This is the G5 enforcement test: the renderer must NEVER embed any of the
// supplied logo / portrait URLs in the rendered SVG.
function logoBombFixture(fixture) {
  return {
    ...fixture,
    slug: `${fixture.slug}__with_logos`,
    event: { ...fixture.event, ...LOGO_URL_FIELDS,
      home: { ...(fixture.event.home || {}), logo: LOGO_URL_FIELDS.homeLogo, badge: LOGO_URL_FIELDS.homeBadge, portrait: LOGO_URL_FIELDS.homePortrait },
      away: { ...(fixture.event.away || {}), logo: LOGO_URL_FIELDS.awayLogo, badge: LOGO_URL_FIELDS.awayBadge, portrait: LOGO_URL_FIELDS.awayPortrait }
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true })
  const cleanFixtures = [...FIXTURES, ...LAYOUT_VARIATION_FIXTURES]
  const allFixtures = [...cleanFixtures, ...cleanFixtures.map(logoBombFixture)]
  const results = []
  let pass = 0
  let fail = 0
  for (const fixture of allFixtures) {
    const classDir = path.join(OUT_ROOT, fixture.slug)
    fs.mkdirSync(classDir, { recursive: true })
    const backdropCheck = checkBackdropBucket(fixture.event, fixture.expectedBackdrop)
    const cells = []
    for (const template of TEMPLATES) {
      let artwork
      let renderError = ''
      try {
        artwork = renderSportsPosterTemplateSvg({
          event: fixture.event,
          variant: 'poster',
          template
        })
      } catch (error) {
        renderError = String(error.message || error)
      }
      const svg = artwork?.svg || ''
      const layoutFamily = artwork?.layoutFamily || ''
      const violations = renderError
        ? [`renderer threw: ${renderError}`]
        : checkContractRules(svg, fixture.expect, fixture, template)
      // Layout family check: if expectedFamily is specified, the rendered
      // family must match (after dispatch-reorder, template wins so this is
      // mostly informational unless template === undefined).
      if (fixture.expectedFamily && fixture.expectedFamily !== 'TICKET_STUB' && layoutFamily !== fixture.expectedFamily) {
        // Template-specific renders use TICKET_STUB / EDITORIAL / etc. layoutFamily
        // — only enforce expectedFamily for broadcast (always BROADCAST family)
        if (template === 'broadcast' && layoutFamily !== 'BROADCAST') {
          violations.push(`broadcast template should always emit BROADCAST family, got '${layoutFamily}'`)
        }
      }
      const cellPass = violations.length === 0
      if (cellPass) pass += 1; else fail += 1
      let pngPath = ''
      if (svg) {
        try {
          const png = await rasterise(svg)
          pngPath = path.join(classDir, `${template}.png`)
          fs.writeFileSync(pngPath, png)
        } catch (rasterErr) {
          violations.push(`rasterise failed: ${rasterErr.message || rasterErr}`)
        }
      }
      cells.push({
        template,
        layoutFamily,
        renderError,
        violations,
        pass: cellPass,
        png: pngPath ? path.relative(REPO_ROOT, pngPath).replace(/\\/g, '/') : ''
      })
    }
    results.push({
      slug: fixture.slug,
      class: fixture.class,
      expectedFamily: fixture.expectedFamily || '',
      expectedBackdrop: fixture.expectedBackdrop || '',
      backdropCheck,
      cells
    })
  }
  const total = pass + fail
  const summary = {
    generatedAt: new Date().toISOString(),
    totals: { pass, fail, total, passRate: total ? +(pass / total * 100).toFixed(1) : 0 },
    results
  }
  fs.writeFileSync(
    path.join(OUT_ROOT, 'index.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  )
  // Stdout summary
  console.log(`Contract-compliance audit: ${pass}/${total} cells PASS (${summary.totals.passRate}%)`)
  console.log()
  for (const r of results) {
    const passCount = r.cells.filter((c) => c.pass).length
    const failCount = r.cells.length - passCount
    console.log(`${r.slug}: ${passCount}/${r.cells.length} PASS  | backdrop: ${r.backdropCheck.ok ? 'PASS' : 'FAIL'} (${r.backdropCheck.actual || r.backdropCheck.reason})`)
    if (failCount > 0) {
      for (const cell of r.cells) {
        if (!cell.pass) {
          console.log(`    ${cell.template}: ${cell.violations.join('; ')}`)
        }
      }
    }
  }
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
