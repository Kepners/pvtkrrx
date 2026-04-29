#!/usr/bin/env node

const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')
const sharp = require('sharp')

const { resolveSportSlug } = require('../src/clients/sportsmeta')
const { handleCanonicalSportsArtwork, handleDefaultSportsArtwork } = require('../src/handlers/sportsArtworkProxy')
const { renderSportsArtworkSvg } = require('../src/utils/sportsCardArtwork')
const { normalizeSportsEventMetadata } = require('../src/utils/sportsEventNormalizer')
const { parseSportsEventTitle, parseSportsTitle } = require('../src/utils/sportsTitleParser')

const OUT_DIR = path.join(process.cwd(), '.runtime', 'sports-artwork-debug')
const ASSET_DIR = path.join(OUT_DIR, 'assets')
const PORT = Math.max(1024, Number(process.env.PVTKRRX_ARTWORK_DEBUG_PORT || 7099) || 7099)
const HOST = '127.0.0.1'
const PROXY_VERSION = '20260429-python-template-port-v2'
const DEBUG_CONFIG = {
  sportsmetaBaseUrl: process.env.PVTKRRX_SPORTSMETA_BASE_URL || process.env.SPORTSMETA_BASE_URL || 'https://sportsmeta.pvtkrrx.cc',
  sportsPosterMemberToken: process.env.PVTKRRX_SPORTSMETA_MEMBER_TOKEN || process.env.SPORTSMETA_MEMBER_TOKEN || ''
}

const CASES = [
  {
    slug: 'formula-one-azerbaijan',
    label: 'Formula 1 fallback',
    rawTitle: 'Formula1.2026.Azerbaijan.GP.Race.1080p.WEB-DL',
    sportHint: 'motorsport',
    competition: 'Formula 1',
    seeders: 17,
    size: '8.9 GB',
    note: 'Default route. If SportsMeta can resolve this and a member token is configured, the proxy uses member artwork. Otherwise it must show a Formula 1 circuit fallback, not a generic stripe card.'
  },
  {
    slug: 'motogp-brazil',
    label: 'MotoGP fallback',
    rawTitle: 'MotoGP.2026.Round.04.Brazil.GP.Qualifying.1080p.WEB-DL',
    sportHint: 'motorsport',
    competition: 'MotoGP',
    seeders: 7,
    size: '1.4 GB',
    note: 'Default fallback route. This should be logo-first MotoGP artwork, not a generic race card.'
  },
  {
    slug: 'football-chelsea-leeds-default',
    label: 'Football default team split',
    rawTitle: 'FA Cup Chelsea vs Leeds United 2026 04 26 1080p WEB-DL',
    sportHint: 'football',
    competition: 'FA Cup',
    date: '2026-04-26',
    seeders: 26,
    size: '11.2 GB',
    note: 'Default route with teams. The request carries home/away into the proxy so it can resolve to canonical SportsMeta and use real SportsDB/SportsMeta badge images when available; otherwise it must show a football-pitch fallback.'
  },
  {
    slug: 'football-man-utd-brentford-canonical',
    label: 'Canonical team-badge route',
    rawTitle: 'Manchester United vs Brentford',
    canonicalId: 'sportsmeta:event:football|2026-04-27|english-premier-league|manchester-united|brentford',
    sportHint: 'football',
    competition: 'English Premier League',
    date: '2026-04-27',
    seeders: 11,
    size: '5.9 GB',
    note: 'Canonical route. The proxy loads SportsMeta /event, then homeBadge and awayBadge, then composes the poster.'
  },
  {
    slug: 'hockey-canonical',
    label: 'Canonical hockey team-badge route',
    rawTitle: 'Utah Mammoth vs Vegas Golden Knights',
    canonicalId: 'sportsmeta:event:hockey|2026-04-25|nhl|utah-mammoth|vegas-golden-knights',
    sportHint: 'hockey',
    competition: 'NHL',
    date: '2026-04-25',
    seeders: 13,
    size: '25.8 GB',
    note: 'Canonical team-badge route used as a control sample.'
  }
]

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function queryString(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const clean = normalizeSpace(value)
    if (clean) search.set(key, clean)
  }
  search.set('v', PROXY_VERSION)
  return search.toString()
}

function defaultArtworkPath(variant, normalized = {}) {
  const sportSlug = resolveSportSlug(normalized.sport) || resolveSportSlug(normalized.sportHint) || 'sports'
  const search = queryString({
    league: normalized.competition,
    title: normalized.eventTitle,
    date: normalized.date,
    home: normalized.homeTeam,
    away: normalized.awayTeam,
    detail: normalized.eventDetail,
    seeders: normalized.seeders,
    size: normalized.size,
    rawTitle: normalized.rawTitle,
    source: normalized.source || 'prowlarr'
  })
  return `/sports-artwork/default/${encodeURIComponent(variant)}/${encodeURIComponent(sportSlug)}.png?${search}`
}

function canonicalArtworkPath(variant, canonicalId) {
  return `/sports-artwork/id/${encodeURIComponent(variant)}/${encodeURIComponent(canonicalId)}.png?v=${encodeURIComponent(PROXY_VERSION)}`
}

function buildSamples() {
  return CASES.map((sample) => {
    const normalized = normalizeSportsEventMetadata({
      ...sample,
      source: sample.canonicalId ? 'sportsmeta' : 'prowlarr'
    })
    const routeKind = sample.canonicalId ? 'canonical-id' : 'default-fallback'
    return {
      ...sample,
      routeKind,
      normalized,
      parsedMatchup: parseSportsTitle(sample.rawTitle, sample.date || ''),
      parsedEvent: parseSportsEventTitle(sample.rawTitle, sample.date || ''),
      posterPath: sample.canonicalId
        ? canonicalArtworkPath('poster', sample.canonicalId)
        : defaultArtworkPath('poster', normalized),
      backgroundPath: sample.canonicalId
        ? canonicalArtworkPath('background', sample.canonicalId)
        : defaultArtworkPath('background', normalized),
      localPreviewPath: `/assets/${sample.slug}.png`
    }
  })
}

async function writeLocalPreviews(samples = []) {
  ensureDir(ASSET_DIR)
  for (const sample of samples) {
    const svg = renderSportsArtworkSvg(sample.normalized, 'poster')
    const svgPath = path.join(ASSET_DIR, `${sample.slug}.svg`)
    const pngPath = path.join(ASSET_DIR, `${sample.slug}.png`)
    fs.writeFileSync(svgPath, svg)
    await sharp(Buffer.from(svg)).png().toFile(pngPath)
  }
}

function renderJson(value) {
  return escapeHtml(JSON.stringify(value || null, null, 2))
}

function renderCard(sample) {
  const parser = {
    parseSportsTitle: sample.parsedMatchup,
    parseSportsEventTitle: sample.parsedEvent,
    normalized: sample.normalized
  }
  const badgePath = sample.routeKind === 'canonical-id'
    ? 'canonical -> SportsMeta /event -> member homeBadge/awayBadge/leagueLogo -> pvtkrrx-team-badge-* only when real raster badge bytes exist'
    : 'default -> SportsMeta resolve attempt -> canonical member badges if resolved -> sport-specific generated surface if not'

  return `<article class="case" data-label="${escapeHtml(sample.label)}">
    <div class="case-head">
      <div>
        <h2>${escapeHtml(sample.label)}</h2>
        <p>${escapeHtml(sample.note)}</p>
      </div>
      <span class="pill">${escapeHtml(sample.routeKind)}</span>
    </div>
    <div class="grid">
      <section class="poster-pane">
        <h3>Local SVG preview</h3>
        <img src="${escapeHtml(sample.localPreviewPath)}" alt="${escapeHtml(sample.label)} local preview">
      </section>
      <section class="poster-pane">
        <h3>Proxy poster route</h3>
        <img src="${escapeHtml(sample.posterPath)}" data-inspect="${escapeHtml(sample.posterPath)}" alt="${escapeHtml(sample.label)} proxy poster">
        <dl class="headers" data-result-for="${escapeHtml(sample.posterPath)}">
          <dt>Status</dt><dd>pending</dd>
          <dt>Source</dt><dd>pending</dd>
          <dt>Fallback</dt><dd>pending</dd>
          <dt>Upstream</dt><dd>pending</dd>
        </dl>
      </section>
      <section class="wide-pane">
        <h3>Proxy background route</h3>
        <img src="${escapeHtml(sample.backgroundPath)}" data-inspect="${escapeHtml(sample.backgroundPath)}" alt="${escapeHtml(sample.label)} proxy background">
        <dl class="headers" data-result-for="${escapeHtml(sample.backgroundPath)}">
          <dt>Status</dt><dd>pending</dd>
          <dt>Source</dt><dd>pending</dd>
          <dt>Fallback</dt><dd>pending</dd>
          <dt>Upstream</dt><dd>pending</dd>
        </dl>
      </section>
      <section class="trace">
        <h3>Resolution trace</h3>
        <p><strong>Raw:</strong> ${escapeHtml(sample.rawTitle)}</p>
        <p><strong>Badge path:</strong> ${escapeHtml(badgePath)}</p>
        ${sample.canonicalId ? `<p><strong>Canonical ID:</strong> ${escapeHtml(sample.canonicalId)}</p>` : ''}
        <p><strong>Member token configured:</strong> ${DEBUG_CONFIG.sportsPosterMemberToken ? 'yes' : 'no'}</p>
        <pre>${renderJson(parser)}</pre>
      </section>
    </div>
  </article>`
}

function renderHtml(samples = []) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PVTKRRX Sports Artwork Debug</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070a13;
      --panel: #111827;
      --line: rgba(255,255,255,0.14);
      --text: #f8fafc;
      --muted: #b6c2d6;
      --accent: #38bdf8;
      --warn: #fbbf24;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, rgba(56,189,248,0.16), transparent 34%), var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: rgba(7,10,19,0.92);
      backdrop-filter: blur(10px);
    }
    header h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0;
    }
    header p {
      margin: 6px 0 0;
      color: var(--muted);
      max-width: 980px;
      line-height: 1.45;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      white-space: nowrap;
      font-size: 13px;
    }
    main {
      display: grid;
      gap: 18px;
      padding: 18px;
    }
    .case {
      border: 1px solid var(--line);
      background: rgba(17,24,39,0.82);
      border-radius: 8px;
      padding: 18px;
    }
    .case-head {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 14px;
    }
    h2, h3 { margin: 0; letter-spacing: 0; }
    h2 { font-size: 20px; }
    h3 { font-size: 13px; color: var(--accent); text-transform: uppercase; margin-bottom: 10px; }
    p { line-height: 1.45; color: var(--muted); }
    .pill {
      align-self: flex-start;
      border: 1px solid rgba(56,189,248,0.5);
      border-radius: 999px;
      padding: 7px 11px;
      color: #dbeafe;
      background: rgba(14,165,233,0.12);
      font-size: 12px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(180px, 240px) minmax(180px, 240px) minmax(340px, 1fr) minmax(360px, 1.2fr);
      gap: 16px;
      align-items: start;
    }
    img {
      width: 100%;
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #020617;
    }
    .poster-pane img {
      aspect-ratio: 2 / 3;
      object-fit: contain;
    }
    .wide-pane img {
      aspect-ratio: 16 / 9;
      object-fit: contain;
    }
    .headers {
      display: grid;
      grid-template-columns: 82px 1fr;
      gap: 6px 10px;
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--muted);
    }
    .headers dt {
      color: #dbeafe;
      font-weight: 700;
    }
    .headers dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .trace {
      min-width: 0;
    }
    pre {
      max-height: 520px;
      overflow: auto;
      padding: 12px;
      margin: 10px 0 0;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #050816;
      color: #dbeafe;
      font-size: 12px;
      line-height: 1.45;
    }
    .bad { color: #fecaca; }
    .good { color: #bbf7d0; }
    @media (max-width: 1280px) {
      .grid { grid-template-columns: repeat(2, minmax(220px, 1fr)); }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>PVTKRRX Sports Artwork Debug</h1>
      <p>This shows the exact difference between direct canonical cards and default sports rows. Default rows now attempt a conservative SportsMeta canonical resolve first when a member token is configured; only unresolved rows use the sport-specific generated fallback.</p>
    </div>
    <div class="toolbar">Proxy version ${escapeHtml(PROXY_VERSION)} | ${escapeHtml(new Date().toISOString())}</div>
  </header>
  <main>
    ${samples.map(renderCard).join('\n')}
  </main>
  <script>
    async function inspectImage(url) {
      const result = document.querySelector('[data-result-for="' + CSS.escape(url) + '"]')
      if (!result) return
      const cells = result.querySelectorAll('dd')
      try {
        const response = await fetch(url, { cache: 'no-store' })
        cells[0].textContent = String(response.status)
        cells[0].className = response.ok ? 'good' : 'bad'
        cells[1].textContent = response.headers.get('x-pvtkrrx-artwork-source') || '(none)'
        cells[2].textContent = response.headers.get('x-pvtkrrx-artwork-fallback') || '(none)'
        cells[3].textContent = response.headers.get('x-pvtkrrx-artwork-upstream') || '(none)'
      } catch (error) {
        cells[0].textContent = error.message
        cells[0].className = 'bad'
      }
    }
    for (const image of document.querySelectorAll('img[data-inspect]')) {
      inspectImage(image.getAttribute('data-inspect'))
    }
  </script>
</body>
</html>`
}

function contentTypeFor(filePath) {
  if (/\.html$/i.test(filePath)) return 'text/html; charset=utf-8'
  if (/\.png$/i.test(filePath)) return 'image/png'
  if (/\.svg$/i.test(filePath)) return 'image/svg+xml; charset=utf-8'
  if (/\.json$/i.test(filePath)) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function sendFile(res, filePath) {
  if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('Content-Type', contentTypeFor(filePath))
  fs.createReadStream(filePath).pipe(res)
}

function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.type = (value) => {
    res.setHeader('Content-Type', value)
    return res
  }
  res.send = (value) => {
    if (Buffer.isBuffer(value)) {
      res.end(value)
    } else {
      res.end(String(value || ''))
    }
    return res
  }
  return res
}

async function routeArtwork(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'sports-artwork') return false
  const kind = parts[1] || ''
  const variant = parts[2] || ''
  const finalPart = decodeURIComponent((parts.slice(3).join('/') || '').replace(/\.png$/i, ''))
  const query = Object.fromEntries(url.searchParams.entries())
  req.query = query
  req.params = {}
  adaptResponse(res)
  if (kind === 'default') {
    req.params.variant = variant
    req.params.sport = finalPart
    await handleDefaultSportsArtwork(req, res, DEBUG_CONFIG)
    return true
  }
  if (kind === 'id') {
    req.params.variant = variant
    req.params.canonicalId = finalPart
    await handleCanonicalSportsArtwork(req, res, DEBUG_CONFIG)
    return true
  }
  return false
}

function openBrowser(url) {
  if (!process.argv.includes('--open')) return
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

async function main() {
  ensureDir(OUT_DIR)
  const samples = buildSamples()
  await writeLocalPreviews(samples)
  const html = renderHtml(samples)
  const htmlPath = path.join(OUT_DIR, 'index.html')
  fs.writeFileSync(htmlPath, html)

  if (!process.argv.includes('--serve')) {
    console.log(`Sports artwork debug page written: ${htmlPath}`)
    return
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
      if (await routeArtwork(req, res, url)) return
      const requested = url.pathname === '/'
        ? path.join(OUT_DIR, 'index.html')
        : path.join(OUT_DIR, decodeURIComponent(url.pathname))
      sendFile(res, requested)
    } catch (error) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(error.stack || error.message)
    }
  })

  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}/`
    console.log(`Sports artwork debug viewer: ${url}`)
    openBrowser(url)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
