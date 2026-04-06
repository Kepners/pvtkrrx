const assert = require('node:assert/strict')
const path = require('node:path')

const { SportsDbClient } = require('../src/clients/sportsdb')

function buildFetchStub() {
  const requests = []
  const queryKey = (endpoint, params = {}) => `${endpoint}?${new URLSearchParams(params).toString()}`
  const jsonResponses = new Map([
    [
      queryKey('search_all_leagues.php', { s: 'Soccer' }),
      {
        countries: [
          {
            idLeague: '4617',
            strLeague: 'Albanian Superliga',
            strSport: 'Soccer',
            strPoster: 'https://images.example.com/league/albania-poster.jpg'
          }
        ]
      }
    ],
    [
      'lookupleague.php?id=4328',
      {
        leagues: [
          {
            idLeague: '4328',
            strLeague: 'English Premier League',
            strLeagueAlternate: 'Premier League, EPL, England',
            strSport: 'Soccer',
            strPoster: 'https://images.example.com/league/epl-poster.jpg',
            strBanner: 'https://images.example.com/league/epl-banner.jpg',
            strLogo: 'https://images.example.com/league/epl-logo.png'
          }
        ]
      }
    ],
    [
      queryKey('search_all_leagues.php', { s: 'MMA' }),
      {
        countries: [
          {
            idLeague: '5999',
            strLeague: 'Cage Fury Fighting Championships',
            strSport: 'MMA',
            strPoster: 'https://images.example.com/league/cffc-poster.jpg'
          }
        ]
      }
    ],
    [
      'lookupleague.php?id=4443',
      {
        leagues: [
          {
            idLeague: '4443',
            strLeague: 'UFC',
            strLeagueAlternate: 'Ultimate Fighting Championship',
            strSport: 'MMA',
            strPoster: 'https://images.example.com/league/ufc-poster.jpg',
            strBanner: 'https://images.example.com/league/ufc-banner.jpg',
            strLogo: 'https://images.example.com/league/ufc-logo.png'
          }
        ]
      }
    ]
  ])

  const fetchStub = async (url) => {
    requests.push(String(url))
    const parsed = new URL(String(url))
    if (parsed.hostname !== 'www.thesportsdb.com') {
      throw new Error(`Unexpected fetch URL: ${url}`)
    }

    const key = `${path.posix.basename(parsed.pathname)}?${parsed.searchParams.toString()}`
    const payload = jsonResponses.get(key)
    if (payload === undefined) {
      throw new Error(`Unexpected SportsDB request: ${key}`)
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    })
  }

  return {
    fetchStub,
    getRequests: () => [...requests]
  }
}

async function main() {
  const originalFetch = global.fetch
  const { fetchStub, getRequests } = buildFetchStub()
  global.fetch = fetchStub

  try {
    const client = new SportsDbClient('123', { timeoutMs: 3000 })

    const footballLeague = await client._resolveLeagueArtworkFromTitle(
      'Arsenal vs Chelsea',
      'football',
      'English Premier League'
    )
    assert.ok(footballLeague, 'expected football league fallback to resolve')
    assert.equal(footballLeague.poster, 'https://images.example.com/league/epl-poster.jpg')
    assert.equal(footballLeague.logo, 'https://images.example.com/league/epl-logo.png')

    const mmaLeague = await client._resolveLeagueArtworkFromTitle(
      'UFC Fight Night 300',
      'mma',
      'UFC'
    )
    assert.ok(mmaLeague, 'expected mma league fallback to resolve')
    assert.equal(mmaLeague.poster, 'https://images.example.com/league/ufc-poster.jpg')
    assert.equal(mmaLeague.logo, 'https://images.example.com/league/ufc-logo.png')

    const requests = getRequests()
    assert.ok(requests.some((url) => url.includes('lookupleague.php?id=4328')), 'expected direct EPL league lookup')
    assert.ok(requests.some((url) => url.includes('lookupleague.php?id=4443')), 'expected direct UFC league lookup')

    console.log('Smoke sportsdb mapped league lookup passed')
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
