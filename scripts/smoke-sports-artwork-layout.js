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

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true })

  for (const testCase of CASES) {
    const normalized = normalizeSportsEventMetadata(testCase.input)
    for (const [key, value] of Object.entries(testCase.expected)) {
      assert.equal(normalized[key], value, `${testCase.slug} ${key}`)
    }
    assert.equal(normalized.rawTitle, testCase.input.rawTitle, `${testCase.slug} rawTitle preserved`)

    const layout = layoutSportsCard(testCase.input, 'poster')
    assert.equal(layout.dimensions.width, DIMENSIONS.poster.width, `${testCase.slug} poster width`)
    assert.equal(layout.dimensions.height, DIMENSIONS.poster.height, `${testCase.slug} poster height`)

    const svg = renderSportsArtworkSvg(testCase.input, 'poster')
    assert.match(svg, /width="600"/, `${testCase.slug} width attr`)
    assert.match(svg, /height="900"/, `${testCase.slug} height attr`)
    assert.match(svg, /viewBox="0 0 600 900"/, `${testCase.slug} viewBox`)
    assert.doesNotMatch(svg, /720p|Yes Network/i, `${testCase.slug} should not render tracker noise`)

    const nodes = textNodes(svg)
    assert.ok(nodes.length > 0, `${testCase.slug} text nodes`)
    const counts = countByRole(nodes)
    assert.ok((counts.sport || 0) <= 1, `${testCase.slug} sport max lines`)
    assert.ok((counts.competition || 0) <= 1, `${testCase.slug} competition max lines`)
    assert.ok((counts.eventTitle || 0) <= 2, `${testCase.slug} eventTitle max lines`)
    assert.ok((counts.eventDetail || 0) <= 1, `${testCase.slug} eventDetail max lines`)
    assert.ok((counts.footer || 0) <= 1, `${testCase.slug} footer max lines`)

    for (const node of nodes) {
      assert.ok(node.x >= layout.safe, `${testCase.slug} x safe ${node.role}`)
      assert.ok(node.x <= DIMENSIONS.poster.width - layout.safe, `${testCase.slug} x max ${node.role}`)
      assert.ok(node.y >= layout.safe, `${testCase.slug} y safe ${node.role}`)
      assert.ok(node.y <= DIMENSIONS.poster.height - layout.safe, `${testCase.slug} y max ${node.role}`)
    }

    const svgPath = path.join(PREVIEW_DIR, `${testCase.slug}.svg`)
    const pngPath = path.join(PREVIEW_DIR, `${testCase.slug}.png`)
    fs.writeFileSync(svgPath, svg)
    await sharp(Buffer.from(svg)).png().toFile(pngPath)
  }

  console.log(`Sports artwork layout smoke passed. Previews: ${PREVIEW_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
