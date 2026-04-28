#!/usr/bin/env node

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const {
  DIMENSIONS,
  layoutSportsCard,
  renderSportsArtworkSvg
} = require('../src/utils/sportsCardArtwork')
const { handleCanonicalSportsArtwork, handleDefaultSportsArtwork } = require('../src/handlers/sportsArtworkProxy')
const { SPORTS_DISCOVERY_CATALOGS } = require('../src/config/sportsCatalogs')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')

const PREVIEW_DIR = path.join(process.cwd(), '.runtime', 'sports-artwork-previews')

const CASES = [
  {
    slug: 'hockey-long-title',
    input: {
      rawTitle: 'NHL Playoffs 2026 Vegas Golden Knights vs Utah Mammoth Game 3',
      sportHint: 'hockey',
      competition: 'NHL Playoffs',
      date: '2026-04-24',
      seeders: 12,
      size: '8.4 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Hockey',
      competition: 'NHL Playoffs',
      eventTitle: 'Vegas Golden Knights vs Utah Mammoth'
    }
  },
  {
    slug: 'football-chelsea-man-utd',
    input: {
      rawTitle: 'Chelsea vs Manchester United',
      sportHint: 'football',
      competition: 'English Premier League',
      date: '2026-04-18',
      seeders: 10,
      size: '6.2 GB',
      source: 'sportsmeta'
    },
    expected: {
      sport: 'Football',
      competition: 'English Premier League',
      eventTitle: 'Chelsea vs Manchester United'
    }
  },
  {
    slug: 'baseball-houston-yankees',
    input: {
      rawTitle: 'Houston Astros 720p60 Yes Network vs New York Yankees',
      sportHint: 'baseball',
      competition: 'MLB',
      date: '2026-04-24',
      seeders: 4,
      size: '5.9 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Baseball',
      competition: 'MLB',
      eventTitle: 'Houston Astros vs New York Yankees'
    }
  },
  {
    slug: 'motorsport-motogp-spain',
    input: {
      rawTitle: 'MotoGP Spain Jerez Race',
      sportHint: 'motorsport',
      date: '2026-04-25',
      seeders: 8,
      size: '3.1 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Motorsport',
      competition: 'MotoGP Spain',
      eventTitle: 'Jerez',
      eventDetail: 'Race'
    }
  },
  {
    slug: 'motorsport-formula-one-azerbaijan',
    input: {
      rawTitle: 'Formula 1 Azerbaijan GP Race 1080p WEB-DL',
      sportHint: 'motorsport',
      competition: 'Formula 1',
      eventTitle: 'Azerbaijan GP',
      eventDetail: 'Race',
      date: '2026-04-26',
      seeders: 17,
      size: '8.9 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Motorsport',
      competition: 'Formula 1',
      eventTitle: 'Azerbaijan GP',
      eventDetail: 'Race'
    }
  },
  {
    slug: 'football-nottingham-sunderland',
    input: {
      rawTitle: 'Nottingham Forest vs Sunderland',
      sportHint: 'football',
      competition: 'English Premier League',
      date: '2026-04-24',
      seeders: 6,
      size: '4.7 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Football',
      competition: 'English Premier League',
      eventTitle: 'Nottingham Forest vs Sunderland'
    }
  },
  {
    slug: 'mma-ufc-main-card',
    input: {
      rawTitle: 'UFC Fight Night Burns vs Malott Main Card 1080p WEB',
      sportHint: 'mma',
      competition: 'UFC Fight Night',
      eventDetail: 'Main Card',
      date: '2026-04-25',
      seeders: 7,
      size: '6.0 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'MMA',
      competition: 'UFC Fight Night',
      eventTitle: 'Burns vs Malott',
      eventDetail: 'Main Card'
    }
  },
  {
    slug: 'american-football-nfl-playoffs',
    input: {
      rawTitle: 'NFL Playoffs Kansas City Chiefs vs Buffalo Bills 1080p ESPN',
      sportHint: 'american-football',
      competition: 'NFL Playoffs',
      date: '2026-04-25',
      seeders: 9,
      size: '7.2 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'American Football',
      competition: 'NFL Playoffs',
      eventTitle: 'Kansas City Chiefs vs Buffalo Bills'
    }
  },
  {
    slug: 'basketball-nba-rivals',
    input: {
      rawTitle: 'NBA Boston Celtics vs Los Angeles Lakers 720p TNT',
      sportHint: 'basketball',
      competition: 'NBA',
      date: '2026-04-25',
      seeders: 11,
      size: '5.5 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Basketball',
      competition: 'NBA',
      eventTitle: 'Boston Celtics vs Los Angeles Lakers'
    }
  },
  {
    slug: 'basketball-bracketed-tracker-matchup',
    input: {
      rawTitle: 'NBA Playoffs 2026 / 1st Round / West / Game 4 / 26 04 2026 / {San Antonio Spurs @ Portland Trail Blazers m4rtyr',
      sportHint: 'basketball',
      competition: 'NBA',
      date: '2026-04-26',
      seeders: 29,
      size: '7.8 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Basketball',
      competition: 'NBA Playoffs',
      eventTitle: 'San Antonio Spurs vs Portland Trail Blazers'
    }
  },
  {
    slug: 'basketball-nba-playoffs-required',
    input: {
      rawTitle: 'NBA Playoffs 2026 / 1st Round / West / Game 4 / 26 04 2026 / {San Antonio Spurs @ Portland Trail Blazers m4rtyr',
      sportHint: 'basketball',
      competition: 'NBA Playoffs',
      date: '2026-04-26',
      seeders: 29,
      size: '7.8 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Basketball',
      competition: 'NBA Playoffs',
      eventTitle: 'San Antonio Spurs vs Portland Trail Blazers'
    }
  },
  {
    slug: 'cricket-ipl-final',
    input: {
      rawTitle: 'IPL Chennai Super Kings vs Mumbai Indians Final 1080p Sky Sports',
      sportHint: 'cricket',
      competition: 'IPL',
      eventDetail: 'Final',
      date: '2026-04-25',
      seeders: 5,
      size: '4.8 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Cricket',
      competition: 'Indian Premier League',
      eventTitle: 'Chennai Super Kings vs Mumbai Indians',
      eventDetail: 'Final'
    }
  },
  {
    slug: 'cricket-indian-premier-league-required',
    input: {
      rawTitle: 'Indian Premier League 2026 Gujarat Titans vs Royal Challengers Bengaluru 1080p',
      sportHint: 'cricket',
      competition: 'Indian Premier League',
      date: '2026-04-27',
      seeders: 18,
      size: '5.4 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Cricket',
      competition: 'Indian Premier League',
      eventTitle: 'Gujarat Titans vs Royal Challengers Bengaluru'
    }
  },
  {
    slug: 'football-mls-required',
    input: {
      rawTitle: 'MLS 2026 Atlanta United vs Inter Miami 2026 04 27 1080p',
      sportHint: 'football',
      competition: 'MLS',
      date: '2026-04-27',
      seeders: 16,
      size: '6.1 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Football',
      competition: 'Major League Soccer',
      eventTitle: 'Atlanta United vs Inter Miami'
    }
  },
  {
    slug: 'football-fa-cup-single-team-required',
    input: {
      rawTitle: 'Football FA Cup vs Chelsea 2026 04 25 1080p',
      sportHint: 'football',
      competition: 'FA Cup',
      date: '2026-04-25',
      seeders: 26,
      size: '11.2 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Football',
      competition: 'FA Cup',
      eventTitle: 'Chelsea'
    }
  },
  {
    slug: 'baseball-mlb-required',
    input: {
      rawTitle: 'Kansas City Royals vs Los Angeles Angels MLB 2026 04 25',
      sportHint: 'baseball',
      competition: 'MLB',
      date: '2026-04-25',
      seeders: 12,
      size: '6.4 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Baseball',
      competition: 'MLB',
      eventTitle: 'Kansas City Royals vs Los Angeles Angels'
    }
  },
  {
    slug: 'golf-pga-tour-required',
    input: {
      rawTitle: 'PGA Tour 2026 Zurich Classic Round 3 WEB-DL 1080p',
      sportHint: 'golf',
      competition: 'PGA Tour',
      eventTitle: 'Zurich Classic',
      date: '2026-04-27',
      seeders: 7,
      size: '4.6 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Golf',
      competition: 'PGA Tour',
      eventTitle: 'Zurich Classic'
    }
  },
  {
    slug: 'motorsport-motogp-fp1-required',
    input: {
      rawTitle: 'MotoGP 2026 Round04 Spain Jerez FP1 Practice WEB DL 1080p H264 English',
      sportHint: 'motorsport',
      competition: 'MotoGP',
      date: '2026-04-25',
      seeders: 9,
      size: '3.6 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Motorsport',
      competition: 'MotoGP Spain',
      eventTitle: 'Jerez',
      eventDetail: 'FP1 Practice'
    }
  },
  {
    slug: 'rugby-super-league',
    input: {
      rawTitle: 'Super League Rugby Leeds Rhinos vs Catalans Dragons 1080p',
      sportHint: 'rugby',
      competition: 'Super League Rugby',
      date: '2026-04-25',
      seeders: 4,
      size: '4.1 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Rugby',
      competition: 'English Rugby League Super League',
      eventTitle: 'Leeds Rhinos vs Catalans Dragons'
    }
  },
  {
    slug: 'tennis-wimbledon-classic',
    input: {
      rawTitle: 'Wimbledon Navratilova vs Evert Centre Court 720p',
      sportHint: 'tennis',
      competition: 'Wimbledon',
      eventDetail: 'Centre Court',
      date: '2026-04-25',
      seeders: 3,
      size: '3.7 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Tennis',
      competition: 'Wimbledon',
      eventTitle: 'Navratilova vs Evert',
      eventDetail: 'Centre Court'
    }
  },
  {
    slug: 'boxing-heavyweight-main-event',
    input: {
      rawTitle: 'Boxing Heavyweight Main Event Fury vs Usyk 1080p DAZN',
      sportHint: 'boxing',
      competition: 'Heavyweight',
      eventDetail: 'Main Event',
      date: '2026-04-25',
      seeders: 13,
      size: '8.0 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Boxing',
      competition: 'Heavyweight',
      eventTitle: 'Fury vs Usyk',
      eventDetail: 'Main Event'
    }
  },
  {
    slug: 'golf-pga-championship',
    input: {
      rawTitle: 'PGA Championship Tiger Woods Round 2 1080p Sky Sports',
      sportHint: 'golf',
      competition: 'PGA Championship',
      eventTitle: 'Tiger Woods Round 2',
      date: '2026-04-25',
      seeders: 6,
      size: '5.1 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Golf',
      competition: 'PGA Championship',
      eventTitle: 'Tiger Woods Round 2'
    }
  },
  {
    slug: 'cycling-tour-stage',
    input: {
      rawTitle: 'Tour de France Stage 12 Mountain Finish 1080p Eurosport',
      sportHint: 'cycling',
      competition: 'Tour de France',
      eventTitle: 'Stage 12 Mountain Finish',
      date: '2026-07-14',
      seeders: 8,
      size: '6.4 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Cycling',
      competition: 'Tour de France',
      eventTitle: 'Stage 12 Mountain Finish'
    }
  },
  {
    slug: 'darts-world-championship',
    input: {
      rawTitle: 'PDC World Championship Luke Littler vs Michael van Gerwen 1080p',
      sportHint: 'darts',
      competition: 'PDC World Championship',
      date: '2026-04-25',
      seeders: 10,
      size: '3.3 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Darts',
      competition: 'PDC World Championship',
      eventTitle: 'Luke Littler vs Michael van Gerwen'
    }
  },
  {
    slug: 'snooker-world-championship',
    input: {
      rawTitle: 'World Championship Ronnie OSullivan vs Judd Trump 1080p Eurosport',
      sportHint: 'snooker',
      competition: 'World Championship',
      date: '2026-04-25',
      seeders: 7,
      size: '4.4 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Snooker',
      competition: 'World Championship',
      eventTitle: 'Ronnie OSullivan vs Judd Trump'
    }
  },
  {
    slug: 'wrestling-wwe-main-event',
    input: {
      rawTitle: 'WWE Cody Rhodes vs Roman Reigns WrestleMania Main Event 1080p',
      sportHint: 'wrestling',
      competition: 'WWE',
      eventDetail: 'Main Event',
      date: '2026-04-25',
      seeders: 14,
      size: '9.2 GB',
      source: 'prowlarr'
    },
    expected: {
      sport: 'Wrestling',
      competition: 'WWE',
      eventTitle: 'Cody Rhodes vs Roman Reigns',
      eventDetail: 'Main Event'
    }
  }
]

function textNodes(svg) {
  const matches = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
  return matches.map((match) => {
    const attrs = match[1]
    const get = (name) => {
      const attr = attrs.match(new RegExp(`${name}="([^"]*)"`))
      return attr ? attr[1] : ''
    }
    return {
      role: get('data-role'),
      x: Number(get('x')),
      y: Number(get('y')),
      text: match[2]
    }
  })
}

function countByRole(nodes) {
  return nodes.reduce((counts, node) => {
    counts[node.role] = (counts[node.role] || 0) + 1
    return counts
  }, {})
}

function expectedSurfaceFor(normalized = {}, slug = '') {
  const text = `${slug} ${normalized.sport || ''} ${normalized.competition || ''} ${normalized.eventTitle || ''}`.toLowerCase()
  if (/formula|motogp|motor/.test(text)) return 'circuit'
  if (/american-football|nfl/.test(text)) return 'gridiron'
  if (/rugby/.test(text)) return 'rugby-pitch'
  if (/football|premier league|fa cup|mls/.test(text)) return 'football-pitch'
  if (/hockey|nhl/.test(text)) return 'hockey-rink'
  if (/basketball|nba/.test(text)) return 'basketball-court'
  if (/baseball|mlb/.test(text)) return 'baseball-diamond'
  if (/cricket|ipl/.test(text)) return 'cricket-ground'
  if (/tennis|wimbledon/.test(text)) return 'tennis-court'
  if (/snooker/.test(text)) return 'snooker-table'
  if (/boxing/.test(text)) return 'boxing-ring'
  if (/mma|ufc/.test(text)) return 'octagon'
  if (/wrestling|wwe/.test(text)) return 'wrestling-ring'
  if (/golf|pga/.test(text)) return 'golf-hole'
  if (/darts|pdc/.test(text)) return 'dartboard'
  if (/cycling|tour de france/.test(text)) return 'velodrome'
  return 'sports-field'
}

function pngDimensions(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function makeMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value)
    },
    status(code) {
      this.statusCode = code
      return this
    },
    type(value) {
      this.setHeader('Content-Type', value)
      return this
    },
    send(value) {
      this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''))
      return this
    },
    end(value) {
      this.body = Buffer.isBuffer(value) ? value : Buffer.from(value || '')
      return this
    }
  }
}

function teamBadgeSvg(label, fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="40" fill="${fill}"/>
    <circle cx="128" cy="128" r="92" fill="rgba(255,255,255,0.16)" stroke="#fff" stroke-width="8"/>
    <text x="128" y="146" text-anchor="middle" font-family="Arial Black, Arial" font-size="58" font-weight="900" fill="#fff">${label}</text>
  </svg>`
}

async function assertTeamBadgeArtworkProxy() {
  const originalFetch = global.fetch
  const canonicalId = 'sportsmeta:event:hockey|2026-04-25|nhl|utah-mammoth|vegas-golden-knights'
  const invalidLandscapeCanonicalId = 'sportsmeta:event:rugby|2026-04-26|major-league-rugby|old-glory-dc|california-legion'
  const dimensions = {
    poster: { width: 600, height: 900 },
    landscape: { width: 1280, height: 720 }
  }
  const invalidLandscapeRaster = await sharp({
    create: {
      width: 1000,
      height: 185,
      channels: 3,
      background: '#17324d'
    }
  }).jpeg().toBuffer()
  try {
    global.fetch = async (input) => {
      const url = new URL(String(input))
      if (
        url.pathname === `/member/test-token/asset/poster/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/member/test-token/asset/landscape/${encodeURIComponent(canonicalId)}`
      ) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"></svg>', {
          status: 200,
          headers: {
            'content-type': 'image/svg+xml',
            'x-sportsmeta-generated-asset': 'true'
          }
        })
      }
      if (url.pathname === `/member/test-token/asset/landscape/${encodeURIComponent(invalidLandscapeCanonicalId)}`) {
        return new Response(invalidLandscapeRaster, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' }
        })
      }
      if (url.pathname === `/event/${encodeURIComponent(canonicalId)}`) {
        return new Response(JSON.stringify({
          ok: true,
          event: {
            id: canonicalId,
            title: 'Utah Mammoth vs Vegas Golden Knights',
            sport: 'Hockey',
            league: 'NHL',
            date: '2026-04-25',
            homeTeam: 'Utah Mammoth',
            awayTeam: 'Vegas Golden Knights'
          },
          assets: {
            homeBadge: `https://sportsmeta.test/member/test-token/asset/homeBadge/${encodeURIComponent(canonicalId)}`,
            awayBadge: `https://sportsmeta.test/member/test-token/asset/awayBadge/${encodeURIComponent(canonicalId)}`
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.pathname === `/event/${encodeURIComponent(invalidLandscapeCanonicalId)}`) {
        return new Response(JSON.stringify({
          ok: true,
          event: {
            id: invalidLandscapeCanonicalId,
            title: 'Old Glory DC vs California Legion',
            sport: 'Rugby',
            league: 'Major League Rugby',
            date: '2026-04-26',
            homeTeam: 'Old Glory DC',
            awayTeam: 'California Legion'
          },
          assets: {
            homeBadge: `https://sportsmeta.test/member/test-token/asset/homeBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`,
            awayBadge: `https://sportsmeta.test/member/test-token/asset/awayBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.pathname === '/resolve') {
        assert.equal(url.searchParams.get('recordType'), 'event', 'default artwork lookup should request an event')
        assert.equal(url.searchParams.get('sport'), 'hockey', 'default artwork lookup should pass sport')
        assert.equal(url.searchParams.get('league'), 'NHL', 'default artwork lookup should pass league')
        assert.equal(url.searchParams.get('home'), 'Utah Mammoth', 'default artwork lookup should pass home team')
        assert.equal(url.searchParams.get('away'), 'Vegas Golden Knights', 'default artwork lookup should pass away team')
        return new Response(JSON.stringify({
          ok: true,
          event: {
            id: canonicalId,
            title: 'Utah Mammoth vs Vegas Golden Knights',
            sport: 'Hockey',
            league: 'NHL',
            date: '2026-04-25',
            homeTeam: 'Utah Mammoth',
            awayTeam: 'Vegas Golden Knights'
          },
          assets: {
            poster: `https://sportsmeta.test/member/default-token/asset/poster/${encodeURIComponent(canonicalId)}`,
            homeBadge: `https://sportsmeta.test/member/default-token/asset/homeBadge/${encodeURIComponent(canonicalId)}`,
            awayBadge: `https://sportsmeta.test/member/default-token/asset/awayBadge/${encodeURIComponent(canonicalId)}`
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.pathname === `/member/default-token/asset/poster/${encodeURIComponent(canonicalId)}`) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"></svg>', {
          status: 200,
          headers: {
            'content-type': 'image/svg+xml',
            'x-sportsmeta-generated-asset': 'true'
          }
        })
      }
      if (url.pathname === `/member/default-token/asset/homeBadge/${encodeURIComponent(canonicalId)}`) {
        return new Response(teamBadgeSvg('UTA', '#155e75'), {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' }
        })
      }
      if (url.pathname === `/member/default-token/asset/awayBadge/${encodeURIComponent(canonicalId)}`) {
        return new Response(teamBadgeSvg('VGK', '#92400e'), {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' }
        })
      }
      if (
        url.pathname === `/member/test-token/asset/homeBadge/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/member/test-token/asset/homeBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
      ) {
        return new Response(teamBadgeSvg('UTA', '#155e75'), {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' }
        })
      }
      if (
        url.pathname === `/member/test-token/asset/awayBadge/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/member/test-token/asset/awayBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
      ) {
        return new Response(teamBadgeSvg('VGK', '#92400e'), {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' }
        })
      }
      throw new Error(`Unexpected sports artwork proxy fetch: ${url.toString()}`)
    }

    for (const variant of Object.keys(dimensions)) {
      const response = makeMockResponse()
      await handleCanonicalSportsArtwork(
        {
          params: {
            variant,
            canonicalId: `${encodeURIComponent(canonicalId)}.png`
          },
          query: {}
        },
        response,
        {
          sportsmetaBaseUrl: 'https://sportsmeta.test',
          sportsPosterMemberToken: 'test-token'
        }
      )
      assert.equal(response.statusCode, 200, `team badge ${variant} proxy should return 200`)
      assert.equal(response.headers['content-type'], 'image/png', `team badge ${variant} proxy should return PNG`)
      assert.equal(response.headers['x-pvtkrrx-artwork-source'], `pvtkrrx-team-badge-${variant}`, `team badge ${variant} proxy should replace generated/SVG art`)
      assert.match(response.headers['x-pvtkrrx-artwork-fallback'] || '', /team_badges/, `team badge ${variant} proxy should report fallback reason`)
      assert.ok(Buffer.isBuffer(response.body), `team badge ${variant} proxy should return bytes`)
      assert.deepEqual(pngDimensions(response.body), dimensions[variant], `team badge ${variant} dimensions`)
    }

    const invalidLandscapeResponse = makeMockResponse()
    await handleCanonicalSportsArtwork(
      {
        params: {
          variant: 'landscape',
          canonicalId: `${encodeURIComponent(invalidLandscapeCanonicalId)}.png`
        },
        query: {}
      },
      invalidLandscapeResponse,
      {
        sportsmetaBaseUrl: 'https://sportsmeta.test',
        sportsPosterMemberToken: 'test-token'
      }
    )
    assert.equal(invalidLandscapeResponse.statusCode, 200, 'invalid member landscape proxy should return 200')
    assert.equal(invalidLandscapeResponse.headers['content-type'], 'image/png', 'invalid member landscape proxy should return PNG')
    assert.equal(invalidLandscapeResponse.headers['x-pvtkrrx-artwork-source'], 'pvtkrrx-team-badge-landscape', 'invalid member landscape should be replaced with a team-badge landscape')
    assert.match(
      invalidLandscapeResponse.headers['x-pvtkrrx-artwork-fallback'] || '',
      /sportsmeta_landscape_raster_layout_replaced_with_team_badges/,
      'invalid member landscape should report the layout fallback reason'
    )
    assert.deepEqual(pngDimensions(invalidLandscapeResponse.body), dimensions.landscape, 'invalid member landscape fallback dimensions')

    const defaultResolvedResponse = makeMockResponse()
    await handleDefaultSportsArtwork(
      {
        params: {
          variant: 'poster',
          sport: 'hockey.png'
        },
        query: {
          league: 'NHL',
          title: 'Utah Mammoth vs Vegas Golden Knights',
          date: '2026-04-25',
          home: 'Utah Mammoth',
          away: 'Vegas Golden Knights'
        }
      },
      defaultResolvedResponse,
      {
        sportsmetaBaseUrl: 'https://sportsmeta.test',
        sportsPosterMemberToken: 'default-token'
      }
    )
    assert.equal(defaultResolvedResponse.statusCode, 200, 'default artwork resolver should return 200')
    assert.equal(defaultResolvedResponse.headers['content-type'], 'image/png', 'default artwork resolver should return PNG')
    assert.equal(defaultResolvedResponse.headers['x-pvtkrrx-artwork-source'], 'pvtkrrx-team-badge-poster', 'default artwork resolver should use canonical team badge composition when resolvable')
    assert.match(defaultResolvedResponse.headers['x-pvtkrrx-artwork-upstream'] || '', /\/member\/\[redacted\]\/asset\/poster\/sportsmeta/, 'default artwork resolver should switch to the member canonical poster route')
    assert.deepEqual(pngDimensions(defaultResolvedResponse.body), dimensions.poster, 'default artwork resolver poster dimensions')
  } finally {
    global.fetch = originalFetch
  }
}

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true })

  const requiredSportHints = SPORTS_DISCOVERY_CATALOGS
    .map((catalog) => catalog.sportHint)
    .filter(Boolean)
  const coveredSportHints = new Set(CASES.map((testCase) => testCase.input.sportHint).filter(Boolean))
  for (const sportHint of requiredSportHints) {
    assert.ok(coveredSportHints.has(sportHint), `sports artwork case covers ${sportHint}`)
  }

  for (const testCase of CASES) {
    const normalized = normalizeSportsEventMetadata(testCase.input)
    for (const [key, value] of Object.entries(testCase.expected)) {
      assert.equal(normalized[key], value, `${testCase.slug} ${key}`)
    }
    assert.equal(normalized.rawTitle, testCase.input.rawTitle, `${testCase.slug} rawTitle preserved`)

    const layout = layoutSportsCard(testCase.input, 'poster')
    assert.equal(layout.dimensions.width, DIMENSIONS.poster.width, `${testCase.slug} poster width`)
    assert.equal(layout.dimensions.height, DIMENSIONS.poster.height, `${testCase.slug} poster height`)
    for (const variant of ['landscape', 'background']) {
      const wideLayout = layoutSportsCard(testCase.input, variant)
      const expectedDimensions = DIMENSIONS[variant]
      assert.equal(wideLayout.dimensions.width, expectedDimensions.width, `${testCase.slug} ${variant} width`)
      assert.equal(wideLayout.dimensions.height, expectedDimensions.height, `${testCase.slug} ${variant} height`)
      assert.ok(
        wideLayout.dimensions.width > wideLayout.dimensions.height,
        `${testCase.slug} ${variant} should be 16:9-safe, not a stretched portrait`
      )
      const wideSvg = renderSportsArtworkSvg(testCase.input, variant)
      assert.match(wideSvg, new RegExp(`width="${expectedDimensions.width}"`), `${testCase.slug} ${variant} width attr`)
      assert.match(wideSvg, new RegExp(`height="${expectedDimensions.height}"`), `${testCase.slug} ${variant} height attr`)
    }

    const svg = renderSportsArtworkSvg(testCase.input, 'poster')
    assert.match(svg, /width="600"/, `${testCase.slug} width attr`)
    assert.match(svg, /height="900"/, `${testCase.slug} height attr`)
    assert.match(svg, /viewBox="0 0 600 900"/, `${testCase.slug} viewBox`)
    assert.match(svg, /data-role="sport-surface"/, `${testCase.slug} should include a sport-specific surface outline`)
    assert.match(svg, new RegExp(`data-surface="${expectedSurfaceFor(normalized, testCase.slug)}"`), `${testCase.slug} should use the expected sport surface`)
    assert.doesNotMatch(svg, /data-role="visual-initials"/, `${testCase.slug} should not render fake acronym logos when real badges are unavailable`)
    assert.doesNotMatch(svg, /720p|Yes Network/i, `${testCase.slug} should not render tracker noise`)

    const nodes = textNodes(svg)
    assert.ok(nodes.length > 0, `${testCase.slug} text nodes`)
    const counts = countByRole(nodes)
    assert.ok((counts.sport || 0) <= 1, `${testCase.slug} sport max lines`)
    assert.ok((counts.competition || 0) <= 2, `${testCase.slug} competition max lines`)
    assert.ok((counts.eventTitle || 0) <= 4, `${testCase.slug} eventTitle max lines`)
    assert.ok((counts.eventDetail || 0) <= 1, `${testCase.slug} eventDetail max lines`)
    assert.ok((counts.footer || 0) <= 1, `${testCase.slug} footer max lines`)

    for (const node of nodes) {
      assert.ok(node.x >= layout.safe, `${testCase.slug} x safe ${node.role}`)
      assert.ok(node.x <= DIMENSIONS.poster.width - layout.safe, `${testCase.slug} x max ${node.role}`)
      assert.ok(node.y >= layout.safe, `${testCase.slug} y safe ${node.role}`)
      assert.ok(node.y <= DIMENSIONS.poster.height - layout.safe, `${testCase.slug} y max ${node.role}`)
    }
    const semanticNodes = nodes
      .filter((node) => ['sport', 'competition', 'eventTitle', 'eventDetail', 'footer'].includes(node.role))
      .sort((left, right) => left.y - right.y)
    for (let index = 1; index < semanticNodes.length; index += 1) {
      assert.ok(
        semanticNodes[index].y - semanticNodes[index - 1].y >= 20,
        `${testCase.slug} text rows should not overlap (${semanticNodes[index - 1].role} -> ${semanticNodes[index].role})`
      )
    }

    assert.ok(
      nodes.some((node) => node.role === 'visual-versus' || node.role === 'sport-motif') ||
        /data-role="(?:matchup-visual|sport-visual|competition-poster-visual|formula-one-poster-visual|motogp-poster-visual)"/.test(svg),
      `${testCase.slug} poster should include a visible event/sport motif`
    )

    if (!nodes.some((node) => node.role === 'visual-versus')) {
      assert.ok(
        nodes.some((node) => ['competition-mark', 'formula-one-mark', 'motogp-mark'].includes(node.role)),
        `${testCase.slug} fallback poster should include a competition mark`
      )
    }

    if (testCase.slug.includes('motogp') || testCase.slug.includes('motorsport')) {
      assert.ok(
        nodes.some((node) => node.role === 'competition-mark' && /motogp|f1|formula/i.test(node.text)) ||
          /MotoGP|F1|FORMULA|formula-one-poster-visual|motogp-poster-visual/i.test(svg),
        `${testCase.slug} motorsport fallback should expose the competition, not a generic race card`
      )
    }

    if (testCase.slug.includes('formula-one')) {
      assert.match(svg, /data-role="formula-one-poster-visual"/, `${testCase.slug} should use the Formula 1 poster visual`)
      assert.ok(
        nodes.some((node) => node.role === 'formula-one-mark' && node.text === 'F1'),
        `${testCase.slug} should expose a large F1 mark`
      )
      assert.ok(
        nodes.some((node) => node.role === 'formula-one-event-title' && /Azerbaijan/i.test(node.text)),
        `${testCase.slug} should show the GP name on the visual`
      )
    }

    if (testCase.slug.includes('motogp')) {
      assert.match(svg, /data-role="motogp-poster-visual"/, `${testCase.slug} should use the MotoGP poster visual`)
      assert.ok(
        nodes.some((node) => node.role === 'motogp-mark' && /MotoGP/i.test(node.text)),
        `${testCase.slug} should expose a large MotoGP mark`
      )
    }

    if (testCase.slug.includes('nba-playoffs')) {
      assert.ok(
        nodes.some((node) => node.role === 'competition-mark' && /NBA|PLAYOFFS/i.test(node.text)) ||
          /NBA PLAYOFFS/i.test(svg),
        `${testCase.slug} NBA Playoffs fallback should expose the competition mark`
      )
    }

    const svgPath = path.join(PREVIEW_DIR, `${testCase.slug}.svg`)
    const pngPath = path.join(PREVIEW_DIR, `${testCase.slug}.png`)
    fs.writeFileSync(svgPath, svg)
    await sharp(Buffer.from(svg)).png().toFile(pngPath)
  }

  await assertTeamBadgeArtworkProxy()

  console.log(`Sports artwork layout smoke passed. Previews: ${PREVIEW_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
