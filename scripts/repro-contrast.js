#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const proxy = require(path.join(__dirname, '..', 'src', 'handlers', 'sportsArtworkProxy'))

const OUT = path.join(__dirname, '..', '.runtime', 'sports-artwork-previews')
const SPORTSMETA_BASE_URL = 'https://sportsmeta.pvtkrrx.cc'

function makeResponse() {
  const headers = {}
  const chunks = []
  const res = {
    setHeader: (key, value) => { headers[String(key)] = String(value) },
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

async function renderDefault(query, sport) {
  const { headers, chunks, res } = makeResponse()
  await proxy.handleDefaultSportsArtwork(
    {
      params: { variant: 'poster', sport: `${sport}.png` },
      query: { source: 'repro', ...query }
    },
    res,
    { sportsmetaBaseUrl: SPORTSMETA_BASE_URL }
  )
  return { headers, buffer: Buffer.concat(chunks) }
}

async function whiteLogoPng() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><text x="120" y="150" text-anchor="middle" font-size="120" font-family="Arial" font-weight="900" fill="#ffffff">W</text></svg>'
  return sharp({
    create: {
      width: 240,
      height: 240,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer()
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  const wsbk = await renderDefault({
    league: 'World Superbikes',
    title: 'WSBK 2026 Round05 Czech Republic FP2',
    date: '2026-05-16',
    eventClass: 'single_event_motorsport',
    template: 'ticket-stub'
  }, 'motorsport')
  fs.writeFileSync(path.join(OUT, 'contrast-wsbk-white-logo-cream.png'), wsbk.buffer)
  console.log(`WSBK: logoKind=${wsbk.headers['X-PVTKRRX-Artwork-Logo-Kind'] || ''} real=${wsbk.headers['X-PVTKRRX-Logo-Real-Count'] || ''}`)

  const synthetic = await proxy._test.renderTemplateFallbackArtwork(
    'poster',
    {
      sport: 'motorsport',
      league: 'TESTWHITE',
      eventTitle: 'White Logo Test',
      title: 'White Logo Test',
      eventClass: 'single_event_motorsport',
      date: '2026-05-16'
    },
    'ticket-stub',
    'contrast_test',
    {
      leagueLogo: {
        buffer: await whiteLogoPng(),
        kind: 'real-league',
        sourceUrl: 'test://white'
      }
    }
  )
  fs.writeFileSync(path.join(OUT, 'contrast-synthetic-white-on-cream.png'), synthetic.buffer)
  console.log(`Synthetic white logo: kind=${synthetic.logoKind} real=${synthetic.logoRealCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
