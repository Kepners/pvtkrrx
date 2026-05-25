#!/usr/bin/env node

const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE = 'false'
process.env.PVTKRRX_SPORTS_POSTER_TEMPLATE = 'ticket-stub'

const {
  DIMENSIONS,
  layoutSportsCard,
  renderSportsArtworkSvg
} = require('../src/utils/sportsCardArtwork')
const {
  SPORTS_POSTER_TEMPLATES,
  handleCanonicalSportsArtwork,
  handleDefaultSportsArtwork
} = require('../src/handlers/sportsArtworkProxy')
const { renderLogoGlyphSvg } = require('../src/utils/sportsPosterTemplates')
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

async function teamBadgePng(fill, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="46" fill="${fill}"/>
    <path d="M128 28 L210 72 V142 C210 188 174 222 128 238 C82 222 46 188 46 142 V72 Z" fill="${accent}" stroke="#fff" stroke-width="9"/>
    <circle cx="128" cy="128" r="46" fill="rgba(255,255,255,0.38)" stroke="rgba(0,0,0,0.26)" stroke-width="7"/>
    <path d="M128 78 L142 112 H178 L149 133 L160 168 L128 147 L96 168 L107 133 L78 112 H114 Z" fill="#fff"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

function sportsMetaRasterHeaders() {
  return {
    'content-type': 'image/png',
    'x-sportsmeta-delivery-format': 'raster',
    'x-sportsmeta-source': 'cached-asset',
    'x-sportsmeta-asset-class': 'public-homebadge-raster',
    'x-sportsmeta-generated-asset': 'false'
  }
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
      if (url.hostname === 'site.web.api.espn.com' && /\/sports\/soccer\/eng\.2\/standings$/i.test(url.pathname)) {
        return new Response(JSON.stringify({
          children: [
            {
              standings: {
                entries: [
                  {
                    team: {
                      displayName: 'Future Town',
                      abbreviation: 'FTN',
                      shortDisplayName: 'Future Town',
                      logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/99991.png' }]
                    }
                  },
                  {
                    team: {
                      displayName: 'Another FC',
                      abbreviation: 'AFC',
                      shortDisplayName: 'Another FC',
                      logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/99992.png' }]
                    }
                  }
                ]
              }
            }
          ]
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (
        url.hostname === 'a.espncdn.com' ||
        url.hostname === 'r2.thesportsdb.com' ||
        url.hostname === 'www.thesportsdb.com' ||
        url.hostname === 'upload.wikimedia.org' ||
        url.hostname === 'www.goldcoastfc.com.au' ||
        url.hostname === 'www.nmfc.com.au'
      ) {
        return new Response(await teamBadgePng('#0f172a', '#38bdf8'), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      }
      if (
        url.pathname === `/asset/poster/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/asset/landscape/${encodeURIComponent(canonicalId)}`
      ) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"></svg>', {
          status: 200,
          headers: {
            'content-type': 'image/svg+xml',
            'x-sportsmeta-generated-asset': 'true'
          }
        })
      }
      if (url.pathname === `/asset/landscape/${encodeURIComponent(invalidLandscapeCanonicalId)}`) {
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
            homeBadge: `https://sportsmeta.test/asset/homeBadge/${encodeURIComponent(canonicalId)}`,
            awayBadge: `https://sportsmeta.test/asset/awayBadge/${encodeURIComponent(canonicalId)}`
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
            homeBadge: `https://sportsmeta.test/asset/homeBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`,
            awayBadge: `https://sportsmeta.test/asset/awayBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.pathname === '/resolve') {
        if (
          url.searchParams.get('sport') !== 'hockey' ||
          url.searchParams.get('league') !== 'NHL' ||
          url.searchParams.get('home') !== 'Utah Mammoth' ||
          url.searchParams.get('away') !== 'Vegas Golden Knights'
        ) {
          return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          })
        }
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
            poster: `https://sportsmeta.test/asset/poster/${encodeURIComponent(canonicalId)}`,
            homeBadge: `https://sportsmeta.test/asset/homeBadge/${encodeURIComponent(canonicalId)}`,
            awayBadge: `https://sportsmeta.test/asset/awayBadge/${encodeURIComponent(canonicalId)}`
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (/^\/asset\/default\//.test(url.pathname)) {
        return new Response('not found', {
          status: 404,
          headers: { 'content-type': 'text/plain' }
        })
      }
      if (url.pathname === `/asset/poster/${encodeURIComponent(canonicalId)}`) {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"></svg>', {
          status: 200,
          headers: {
            'content-type': 'image/svg+xml',
            'x-sportsmeta-generated-asset': 'true'
          }
        })
      }
      if (url.pathname === `/asset/homeBadge/${encodeURIComponent(canonicalId)}`) {
        return new Response(await teamBadgePng('#155e75', '#0e7490'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
        })
      }
      if (url.pathname === `/asset/awayBadge/${encodeURIComponent(canonicalId)}`) {
        return new Response(await teamBadgePng('#92400e', '#fbbf24'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
        })
      }
      if (url.pathname === `/asset/leagueLogo/${encodeURIComponent(canonicalId)}`) {
        return new Response(await teamBadgePng('#111827', '#38bdf8'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
        })
      }
      if (
        url.pathname === `/asset/homeBadge/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/asset/homeBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
      ) {
        return new Response(await teamBadgePng('#155e75', '#0e7490'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
        })
      }
      if (
        url.pathname === `/asset/awayBadge/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/asset/awayBadge/${encodeURIComponent(invalidLandscapeCanonicalId)}`
      ) {
        return new Response(await teamBadgePng('#92400e', '#fbbf24'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
        })
      }
      if (
        url.pathname === `/asset/leagueLogo/${encodeURIComponent(canonicalId)}` ||
        url.pathname === `/asset/leagueLogo/${encodeURIComponent(invalidLandscapeCanonicalId)}`
      ) {
        return new Response(await teamBadgePng('#111827', '#38bdf8'), {
          status: 200,
          headers: sportsMetaRasterHeaders()
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
      assert.match(response.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-(?:template-glyph|public-template)$/, `central ${variant} proxy should stay on public/glyph artwork`)
      assert.equal(response.headers['x-pvtkrrx-sports-event-class'], 'team_vs_team', `central ${variant} proxy should classify team-vs-team events`)
      assert.match(response.headers['x-pvtkrrx-artwork-fallback'] || '', /sportsmeta_central_svg_layout_replaced_with_real_logos/, `central ${variant} proxy should report the local real-logo template replacement`)
      assert.ok(Buffer.isBuffer(response.body), `team badge ${variant} proxy should return bytes`)
      assert.deepEqual(pngDimensions(response.body), dimensions[variant], `team badge ${variant} dimensions`)
      fs.writeFileSync(path.join(PREVIEW_DIR, `team-badge-${variant}.png`), response.body)
    }

    for (const template of SPORTS_POSTER_TEMPLATES) {
      const response = makeMockResponse()
      await handleCanonicalSportsArtwork(
        {
          params: {
            variant: 'poster',
            canonicalId: `${encodeURIComponent(canonicalId)}.png`
          },
          query: { template }
        },
        response,
        {
          sportsmetaBaseUrl: 'https://sportsmeta.test',
          sportsPosterMemberToken: 'test-token'
        }
      )
      assert.equal(response.statusCode, 200, `${template} template should return 200`)
      assert.equal(response.headers['content-type'], 'image/png', `${template} template should return PNG`)
      assert.match(response.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-(?:template-glyph|public-template)$/, `${template} template request should stay on public/glyph artwork`)
      assert.equal(response.headers['x-pvtkrrx-artwork-template'], 'ticket-stub', `${template} template request should normalize to the one included PVTKRRX style`)
      assert.equal(response.headers['x-pvtkrrx-sports-event-class'], 'team_vs_team', `${template} template should preserve team-vs-team classification`)
      assert.deepEqual(pngDimensions(response.body), dimensions.poster, `${template} template poster dimensions`)
      fs.writeFileSync(path.join(PREVIEW_DIR, `template-request-${template}-effective-ticket-stub-poster.png`), response.body)
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
    assert.match(invalidLandscapeResponse.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-(?:template-glyph|public-template)$/, 'invalid landscape should stay on public/glyph artwork')
    assert.equal(invalidLandscapeResponse.headers['x-pvtkrrx-sports-event-class'], 'team_vs_team', 'invalid member landscape should preserve team-vs-team classification')
    assert.match(
      invalidLandscapeResponse.headers['x-pvtkrrx-artwork-fallback'] || '',
      /sportsmeta_landscape_raster_(?:layout_replaced|composed)_with_real_logos/,
      'invalid member landscape should report the real-logo layout fallback reason'
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
    assert.match(defaultResolvedResponse.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-(?:template-glyph|public-template)$/, 'default artwork resolver should stay on public/glyph artwork')
    assert.equal(defaultResolvedResponse.headers['x-pvtkrrx-sports-event-class'], 'team_vs_team', 'default artwork resolver should classify resolved team events')
    assert.doesNotMatch(defaultResolvedResponse.headers['x-pvtkrrx-artwork-upstream'] || '', /\/member\//, 'default artwork resolver must not switch to a member canonical poster route')
    assert.deepEqual(pngDimensions(defaultResolvedResponse.body), dimensions.poster, 'default artwork resolver poster dimensions')
    fs.writeFileSync(path.join(PREVIEW_DIR, 'default-resolved-team-badge-poster.png'), defaultResolvedResponse.body)

    const noLogoCases = [
      {
        slug: 'public-template-football-no-logo',
        sport: 'football.png',
        query: {
          league: 'English Premier League',
          title: 'Arsenal vs Chelsea',
          date: '2026-04-29',
          home: 'Arsenal',
          away: 'Chelsea',
          eventClass: 'team_vs_team'
        },
        expectedClass: 'team_vs_team',
        expectedTemplate: 'ticket-stub'
      },
      {
        slug: 'public-template-f1-no-logo',
        sport: 'motorsport.png',
        query: {
          league: 'Formula 1',
          title: 'British Grand Prix',
          detail: 'Qualifying',
          date: '2026-07-04',
          eventClass: 'motorsport_event'
        },
        expectedClass: 'motorsport_event',
        expectedTemplate: 'ticket-stub'
      },
      {
        slug: 'public-template-ufc-no-logo',
        sport: 'mma.png',
        query: {
          league: 'UFC',
          title: 'UFC 312',
          detail: 'Main Event',
          date: '2026-06-14',
          home: 'Du Plessis',
          away: 'Strickland',
          eventClass: 'combat_event'
        },
        expectedClass: 'combat_event',
        expectedTemplate: 'ticket-stub',
        expectedLayoutFamily: 'TICKET_STUB'
      },
      {
        slug: 'public-template-tennis-no-logo',
        sport: 'tennis.png',
        query: {
          league: 'Wimbledon',
          title: 'Wimbledon',
          detail: 'Sinner v Alcaraz',
          date: '2026-07-12',
          home: 'Sinner',
          away: 'Alcaraz',
          eventClass: 'tennis_or_snooker_match'
        },
        expectedClass: 'tennis_or_snooker_match',
        expectedTemplate: 'ticket-stub'
      }
    ]

    for (const testCase of noLogoCases) {
      const response = makeMockResponse()
      await handleDefaultSportsArtwork(
        {
          params: {
            variant: 'poster',
            sport: testCase.sport
          },
          query: testCase.query
        },
        response,
        {
          sportsmetaBaseUrl: 'https://sportsmeta.test'
        }
      )
      assert.equal(response.statusCode, 200, `${testCase.slug} should return 200`)
      assert.equal(response.headers['content-type'], 'image/png', `${testCase.slug} should return PNG`)
      assert.match(response.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-(?:template-glyph|public-template)$/, `${testCase.slug} should use public/glyph template art`)
      assert.equal(response.headers['x-pvtkrrx-sports-event-class'], testCase.expectedClass, `${testCase.slug} classification`)
      assert.equal(response.headers['x-pvtkrrx-artwork-template'], testCase.expectedTemplate, `${testCase.slug} selected template`)
      if (testCase.expectedLayoutFamily) {
        assert.equal(response.headers['x-pvtkrrx-artwork-layout-family'], testCase.expectedLayoutFamily, `${testCase.slug} layout family`)
      }
      assert.doesNotMatch(response.headers['x-pvtkrrx-artwork-source'], /generated-card|team-badge|emergency-svg|emergency-legacy/, `${testCase.slug} should not use old generated or emergency art`)
      assert.deepEqual(pngDimensions(response.body), dimensions.poster, `${testCase.slug} poster dimensions`)
      fs.writeFileSync(path.join(PREVIEW_DIR, `${testCase.slug}.png`), response.body)
    }

    const fakeOpponentResponse = makeMockResponse()
    await handleDefaultSportsArtwork(
      {
        params: {
          variant: 'poster',
          sport: 'football.png'
        },
        query: {
          league: 'English Premier League',
          title: 'Arsenal vs Womens Super League',
          date: '2026-05-10',
          home: 'Arsenal',
          away: 'Womens Super League',
          eventClass: 'team_vs_team'
        }
      },
      fakeOpponentResponse,
      {
        sportsmetaBaseUrl: 'https://sportsmeta.test'
      }
    )
    assert.equal(fakeOpponentResponse.statusCode, 200, 'league-as-opponent fallback should return 200')
    assert.equal(fakeOpponentResponse.headers['content-type'], 'image/png', 'league-as-opponent fallback should return PNG')
    assert.equal(fakeOpponentResponse.headers['x-pvtkrrx-artwork-logo-kind'], 'fallback-glyph', 'league-as-opponent fallback should not promote a team badge to a league/event logo')
    assert.equal(Number(fakeOpponentResponse.headers['x-pvtkrrx-logo-real-count'] || 0), 0, 'league-as-opponent fallback should not paint real logos from the full title haystack')
    assert.ok(Number(fakeOpponentResponse.headers['x-pvtkrrx-logo-fallback-count'] || 0) >= 1, 'league-as-opponent fallback should paint visible fallback initials')
    assert.doesNotMatch(String(fakeOpponentResponse.headers['x-pvtkrrx-logo-slots'] || ''), /real-team/i, 'league-as-opponent slots should not contain team crest assignments')
    assert.deepEqual(pngDimensions(fakeOpponentResponse.body), dimensions.poster, 'league-as-opponent fallback dimensions')

    const directLogoCases = [
      {
        slug: 'direct-nhl-team-logos',
        sport: 'hockey.png',
        query: {
          league: 'NHL',
          title: 'Detroit Red Wings vs Florida Panthers',
          date: '2026-04-15',
          home: 'Detroit Red Wings',
          away: 'Florida Panthers',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/nhl\/500\/det\.png/i, /\/nhl\/500\/fla\.png/i]
      },
      {
        slug: 'direct-nhl-user-screenshot-logos',
        sport: 'hockey.png',
        query: {
          league: 'NHL',
          title: 'Ottawa Senators vs Toronto Maple Leafs',
          date: '2026-04-15',
          home: 'Ottawa Senators',
          away: 'Toronto Maple Leafs',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/nhl\/500\/ott\.png/i, /\/nhl\/500\/tor\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nhl\/500\/ott\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nhl\/500\/tor\.png/i],
        unexpectedSlots: [/home:real-league/i, /away:real-league/i, /home:real-team:https:\/\/r2\.thesportsdb\.com\/images\/media\/league\/badge\/4cem2k1619616539\.png/i, /away:real-team:https:\/\/r2\.thesportsdb\.com\/images\/media\/league\/badge\/4cem2k1619616539\.png/i]
      },
      {
        slug: 'direct-nhl-blackhawks-sharks-logos',
        sport: 'hockey.png',
        query: {
          league: 'NHL',
          title: 'Chicago Blackhawks vs San Jose Sharks',
          date: '2026-04-15',
          home: 'Chicago Blackhawks',
          away: 'San Jose Sharks',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/nhl\/500\/chi\.png/i, /\/nhl\/500\/sj\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nhl\/500\/chi\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nhl\/500\/sj\.png/i],
        unexpectedSlots: [/home:real-league/i, /away:real-league/i, /home:real-team:https:\/\/r2\.thesportsdb\.com\/images\/media\/league\/badge\/4cem2k1619616539\.png/i, /away:real-team:https:\/\/r2\.thesportsdb\.com\/images\/media\/league\/badge\/4cem2k1619616539\.png/i]
      },
      {
        slug: 'direct-mls-team-logos',
        sport: 'football.png',
        query: {
          league: 'Major League Soccer',
          title: 'Chicago Fire FC vs St Louis CITY SC',
          date: '2026-04-29',
          home: 'Chicago Fire FC',
          away: 'St Louis CITY SC',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/182\.png/i, /\/soccer\/500\/21812\.png/i]
      },
      {
        slug: 'direct-efl-championship-team-logos',
        sport: 'football.png',
        query: {
          league: 'EFL Championship',
          title: 'Coventry City vs Bristol City',
          date: '2026-05-24',
          home: 'Coventry City',
          away: 'Bristol City',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/388\.png/i, /\/soccer\/500\/333\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/388\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/333\.png/i],
        unexpectedSlots: [/fallback-glyph/i, /home:real-league/i, /away:real-league/i]
      },
      {
        slug: 'direct-efl-championship-league-logo',
        sport: 'football.png',
        query: {
          league: 'English League Championship',
          title: 'EFL Championship Review',
          date: '2026-05-24',
          eventClass: 'tournament_event'
        },
        expectedSources: [/leaguelogos\/soccer\/500\/24\.png/i],
        unexpectedSlots: [/fallback-glyph/i]
      },
      {
        slug: 'dynamic-efl-championship-future-team-logos',
        sport: 'football.png',
        query: {
          league: 'English League Championship',
          title: 'Future Town vs Another FC',
          date: '2026-08-15',
          home: 'Future Town',
          away: 'Another FC',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/99991\.png/i, /\/soccer\/500\/99992\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/99991\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/99992\.png/i],
        unexpectedSlots: [/fallback-glyph/i, /home:real-league/i, /away:real-league/i]
      },
      {
        slug: 'direct-champions-league-team-logos',
        sport: 'football.png',
        query: {
          league: 'UEFA Champions League',
          title: 'Arsenal vs Real Madrid',
          date: '2026-04-29',
          home: 'Arsenal',
          away: 'Real Madrid',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/359\.png/i, /\/soccer\/500\/86\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/359\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/86\.png/i],
        unexpectedSlots: [/home:real-league/i, /away:real-league/i]
      },
      {
        slug: 'direct-champions-league-accented-team-logos',
        sport: 'football.png',
        query: {
          league: 'Champions League',
          title: 'Atletico Madrid vs Paris Saint-Germain',
          date: '2026-04-29',
          home: 'Atletico Madrid',
          away: 'Paris Saint-Germain',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/1068\.png/i, /\/soccer\/500\/160\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/1068\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/soccer\/500\/160\.png/i],
        unexpectedSlots: [/home:real-league/i, /away:real-league/i]
      },
      {
        slug: 'direct-wnba-team-logos',
        sport: 'basketball.png',
        query: {
          league: 'WNBA',
          title: 'Golden State Valkyries vs Chicago Sky',
          date: '2026-05-14',
          home: 'Golden State Valkyries',
          away: 'Chicago Sky',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/wnba\/500\/gs\.png/i, /\/wnba\/500\/chi\.png/i]
      },
      {
        slug: 'direct-womens-basketball-league-team-logos',
        sport: 'basketball.png',
        query: {
          league: 'Women Basketball League',
          title: 'Los Angeles Sparks vs Phoenix Mercury',
          date: '2026-05-14',
          home: 'Los Angeles Sparks',
          away: 'Phoenix Mercury',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/wnba\/500\/la\.png/i, /\/wnba\/500\/phx\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/wnba\/500\/la\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/wnba\/500\/phx\.png/i],
        unexpectedSlots: [/home:real-league/i, /away:real-league/i]
      },
      {
        slug: 'direct-womens-basketball-league-logo',
        sport: 'basketball.png',
        query: {
          league: 'Women Basketball League',
          title: 'WNBA Tip Off',
          date: '2026-05-14',
          eventClass: 'tournament_event'
        },
        expectedSources: [/league\/logo\/3fv4p01573154525\.png/i]
      },
      {
        slug: 'direct-afl-row-in-basketball-user-screenshot-logos',
        sport: 'basketball.png',
        query: {
          league: 'AFL',
          title: 'Gold Coast Suns vs North Melbourne',
          date: '2026-05-23',
          home: 'Gold Coast Suns',
          away: 'North Melbourne',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/icons\.svg#icn-aflc-gcfc/i, /icons\.svg#icn-aflc-nmfc/i]
      },
      {
        slug: 'direct-ufc-real-league-logo',
        sport: 'mma.png',
        query: {
          league: 'UFC',
          title: 'UFC 328',
          detail: 'Main Card',
          date: '2026-05-09',
          eventClass: 'combat_event'
        },
        expectedSources: [/league\/logo\/1gp4vo1722604906\.png/i],
        unexpectedSources: [/pvtkrrx:\/\/logo\/ufc-red/i]
      },
      {
        slug: 'direct-formula-1-league-logo',
        sport: 'motorsport.png',
        query: {
          league: 'Formula 1',
          title: 'Canadian Grand Prix',
          detail: 'Sprint Qualifying',
          date: '2026-05-23',
          eventClass: 'motorsport_event'
        },
        expectedSources: [/league\/logo\/jiqa741556460666\.png/i]
      },
      {
        slug: 'direct-nfl-user-screenshot-logos',
        sport: 'american-football.png',
        query: {
          league: 'NFL',
          title: 'New England Patriots vs Seattle Seahawks',
          date: '2026-05-23',
          home: 'New England Patriots',
          away: 'Seattle Seahawks',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/nfl\/500\/ne\.png/i, /\/nfl\/500\/sea\.png/i],
        expectedSlots: [/home:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/ne\.png/i, /away:real-team:https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500\/sea\.png/i],
        unexpectedSlots: [/fallback/i]
      },
      {
        slug: 'direct-ufl-user-screenshot-logos',
        sport: 'american-football.png',
        query: {
          league: 'UFL',
          title: 'Louisville Kings vs Houston Gamblers',
          date: '2026-05-23',
          home: 'Louisville Kings',
          away: 'Houston Gamblers',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/team\/badge\/4ysomp1770670283\.png/i, /team\/badge\/bt36gy1770671084\.png/i]
      },
      {
        slug: 'direct-euroleague-user-screenshot-logos',
        sport: 'basketball.png',
        query: {
          league: 'EuroLeague Basketball',
          title: 'Valencia Basket vs Real Madrid Baloncesto',
          date: '2026-05-23',
          home: 'Valencia Basket',
          away: 'Real Madrid Baloncesto',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/team\/badge\/9qyc231536398868\.png/i, /team\/badge\/g4ev2c1522175902\.png/i]
      },
      {
        slug: 'direct-bbl-user-screenshot-logos',
        sport: 'basketball.png',
        query: {
          league: 'EasyCredit BBL',
          title: 'Ratiopharm Ulm vs Bamberg Baskets',
          date: '2026-05-23',
          home: 'Ratiopharm Ulm',
          away: 'Bamberg Baskets',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/team\/badge\/0t59iu1677678278\.png/i, /team\/badge\/rs1gjz1714562746\.png/i]
      },
      {
        slug: 'direct-nba-playoffs-compilation-logo',
        sport: 'basketball.png',
        query: {
          league: 'NBA Playoffs',
          title: 'NBA Playoffs 22 05 2026 All Games',
          date: '2026-05-22',
          eventClass: 'tournament_event'
        },
        expectedSources: [/league\/logo\/ypuryw1421971236\.png/i]
      },
      {
        slug: 'direct-cricket-rcb-user-screenshot-logo',
        sport: 'cricket.png',
        query: {
          league: 'Indian Premier League',
          title: 'Royal Challengers Bengaluru vs Sunrisers Hyderabad',
          date: '2026-05-23',
          home: 'Royal Challengers Bengaluru',
          away: 'Sunrisers Hyderabad',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/team\/badge\/kynj5v1588331757\.png/i]
      },
      {
        slug: 'direct-rugby-nrl-user-screenshot-logos',
        sport: 'rugby.png',
        query: {
          league: 'NRL',
          title: 'Bulldogs vs Storm',
          date: '2026-05-23',
          home: 'Bulldogs',
          away: 'Storm',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/team\/badge\/ggzq4e1768487178\.png/i, /team\/badge\/hpdn401646347751\.png/i]
      },
      {
        slug: 'direct-rugby-challenge-cup-user-screenshot-logos',
        sport: 'rugby.png',
        query: {
          league: 'Challenge Cup',
          title: 'Challenge Cup vs Ulster Incl',
          date: '2026-05-23',
          home: 'Challenge Cup',
          away: 'Ulster Incl',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/league\/logo\/dwmh511716589311\.png/i, /team\/badge\/j8usvw1716743144\.png/i]
      },
      {
        slug: 'direct-us-open-cup-football-logos',
        sport: 'football.png',
        query: {
          league: 'U.S. Open Cup',
          title: 'Columbus Crew vs New York City FC',
          date: '2026-05-23',
          home: 'Columbus Crew',
          away: 'New York City FC',
          eventClass: 'team_vs_team'
        },
        expectedSources: [/\/soccer\/500\/183\.png/i, /\/soccer\/500\/17606\.png/i]
      },
      {
        slug: 'direct-atp-competitor-league-logo-fallback',
        sport: 'tennis.png',
        query: {
          league: 'ATP World Tour',
          title: 'Jannik Sinner vs Andrea Pellegrino',
          date: '2026-05-23',
          home: 'Jannik Sinner',
          away: 'Andrea Pellegrino',
          eventClass: 'tennis_or_snooker_match'
        },
        expectedSources: [/league\/badge\/q7aej51769857150\.png/i],
        unexpectedSlots: [/fallback-glyph/i]
      },
      {
        slug: 'direct-scottish-womens-premier-logo',
        sport: 'football.png',
        query: {
          league: 'Scottish Womens Premier League',
          title: 'Scottish Womens Premier League 2025/26 Show',
          date: '2026-04-26',
          eventClass: 'tournament_event'
        },
        expectedSources: [/SWPL_Logo_Brandmarque_Colour\.png/i],
        unexpectedSources: [/english-premier-league|premier-league/i]
      },
      {
        slug: 'direct-bkfc-user-screenshot-logo',
        sport: 'boxing.png',
        query: {
          league: 'BKFC',
          title: 'Larrimore vs Palm Desert Herring',
          detail: 'Main Event',
          date: '2026-05-23',
          eventClass: 'combat_event'
        },
        expectedSources: [/league\/logo\/wbatgb1564344282\.png/i],
        unexpectedSlots: [/fallback-glyph/i]
      },
      {
        slug: 'direct-tour-de-france-user-screenshot-logo',
        sport: 'cycling.png',
        query: {
          league: 'Tour de France',
          title: 'Tour France Stage 21',
          detail: 'Stage 21',
          date: '2026-05-23',
          eventClass: 'generic_event'
        },
        expectedSources: [/Tour_de_France_logo\.svg/i],
        unexpectedSlots: [/fallback-glyph/i]
      },
      {
        slug: 'direct-tour-de-france-femmes-user-screenshot-logo',
        sport: 'cycling.png',
        query: {
          league: 'Tour de France Femmes',
          title: 'Tour France Femmes Avec Zwift Stage 04',
          detail: 'Stage 04',
          date: '2026-05-23',
          eventClass: 'generic_event'
        },
        expectedSources: [/Tour_de_France_Femmes_logo\.svg/i],
        unexpectedSlots: [/fallback-glyph/i]
      },
      {
        slug: 'direct-pdc-darts-user-screenshot-logo',
        sport: 'darts.png',
        query: {
          league: 'PDC Darts',
          title: 'World Cup Darts Last Session',
          detail: 'Final',
          date: '2026-05-23',
          eventClass: 'darts_event'
        },
        expectedSources: [/league\/logo\/mnkcyf1555604592\.png/i],
        unexpectedSlots: [/fallback-glyph/i]
      }
    ]

    for (const testCase of directLogoCases) {
      const response = makeMockResponse()
      await handleDefaultSportsArtwork(
        {
          params: {
            variant: 'poster',
            sport: testCase.sport
          },
          query: testCase.query
        },
        response,
        {
          sportsmetaBaseUrl: 'https://sportsmeta.test'
        }
      )
      assert.equal(response.statusCode, 200, `${testCase.slug} should return 200`)
      assert.equal(response.headers['content-type'], 'image/png', `${testCase.slug} should return PNG`)
      assert.match(response.headers['x-pvtkrrx-artwork-source'], /^pvtkrrx-public-template$/, `${testCase.slug} should use real-logo public template art`)
      assert.ok(Number(response.headers['x-pvtkrrx-logo-real-count'] || 0) >= 1, `${testCase.slug} should paint at least one real logo`)
      const sourceUrls = String(response.headers['x-pvtkrrx-logo-source-urls'] || '')
      for (const expectedSource of testCase.expectedSources) {
        assert.match(sourceUrls, expectedSource, `${testCase.slug} should expose ${expectedSource}`)
      }
      for (const unexpectedSource of testCase.unexpectedSources || []) {
        assert.doesNotMatch(sourceUrls, unexpectedSource, `${testCase.slug} should not expose ${unexpectedSource}`)
      }
      const slotSummary = String(response.headers['x-pvtkrrx-logo-slots'] || '')
      for (const expectedSlot of testCase.expectedSlots || []) {
        assert.match(slotSummary, expectedSlot, `${testCase.slug} should expose slot ${expectedSlot}`)
      }
      for (const unexpectedSlot of testCase.unexpectedSlots || []) {
        assert.doesNotMatch(slotSummary, unexpectedSlot, `${testCase.slug} should not expose slot ${unexpectedSlot}`)
      }
      assert.deepEqual(pngDimensions(response.body), dimensions.poster, `${testCase.slug} poster dimensions`)
      fs.writeFileSync(path.join(PREVIEW_DIR, `${testCase.slug}.png`), response.body)
    }

    for (const template of SPORTS_POSTER_TEMPLATES) {
      const response = makeMockResponse()
      await handleDefaultSportsArtwork(
        {
          params: {
            variant: 'poster',
            sport: 'football.png'
          },
          query: {
            league: 'English League Championship',
            title: 'Future Town vs Another FC',
            date: '2026-08-15',
            home: 'Future Town',
            away: 'Another FC',
            eventClass: 'team_vs_team'
          }
        },
        response,
        {
          sportsmetaBaseUrl: 'https://sportsmeta.test',
          sportsPosterTemplate: template,
          entitlementSource: 'manual_grant'
        }
      )
      assert.equal(response.statusCode, 200, `dynamic EFL ${template} should return 200`)
      assert.equal(response.headers['content-type'], 'image/png', `dynamic EFL ${template} should return PNG`)
      assert.equal(response.headers['x-pvtkrrx-artwork-template'], template, `dynamic EFL ${template} should honour entitled template`)
      assert.match(String(response.headers['x-pvtkrrx-logo-source-urls'] || ''), /\/soccer\/500\/99991\.png/i, `dynamic EFL ${template} should expose the home team source`)
      assert.match(String(response.headers['x-pvtkrrx-logo-source-urls'] || ''), /\/soccer\/500\/99992\.png/i, `dynamic EFL ${template} should expose the away team source`)
      assert.doesNotMatch(String(response.headers['x-pvtkrrx-logo-slots'] || ''), /fallback-glyph/i, `dynamic EFL ${template} should not fall back to glyph logos`)
      assert.deepEqual(pngDimensions(response.body), dimensions.poster, `dynamic EFL ${template} poster dimensions`)
    }
  } finally {
    global.fetch = originalFetch
  }
}

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true })

  const fallbackLogoSvg = renderLogoGlyphSvg({
    role: 'home',
    event: { sport: 'Basketball', league: 'WNBA', homeTeam: 'Dallas Stars' },
    size: 120
  })
  assert.match(fallbackLogoSvg, /data-role="logo-fallback-svg"/, 'fallback logo SVG should be visible and auditable')
  // DIRECTIVE 001: the ONLY permitted fallback is clean deterministic
  // initials of the real entity. A "LOGO PENDING" placeholder is an explicit
  // FAIL per the directive — assert it is gone and that real initials +
  // a cleaned identity caption are rendered instead.
  assert.doesNotMatch(fallbackLogoSvg, /LOGO PENDING/, 'fallback logo SVG must NOT show the forbidden "LOGO PENDING" placeholder (DIRECTIVE 001)')
  assert.match(fallbackLogoSvg, />DS</, 'fallback logo SVG should render clean deterministic initials (Dallas Stars -> DS)')
  assert.match(fallbackLogoSvg, />DALLAS STARS</, 'fallback logo SVG should caption the real identity, not a generic role tag')
  assert.doesNotMatch(fallbackLogoSvg, /data-role="visual-initials"/, 'fallback logo SVG should not use the old invisible initials marker')

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
