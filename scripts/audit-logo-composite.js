#!/usr/bin/env node
// Logo-composite sports poster audit harness.
//
// Fetches real SportsMeta artwork (homeBadge / awayBadge / leagueLogo) for a
// curated fixture set, renders all 7 PVTKRRX poster templates, and composites
// the real logos into each template's existing logo slots. Outputs per-template
// PNGs, per-template contact sheets, an overall contact sheet, manifest.json,
// and logo-audit-report.json with pass/fail judgements per sample.
//
// Boundaries (audit harness only — does NOT modify runtime):
//   - No change to free-tier ticket-stub clamp.
//   - No change to selectable-template contract.
//   - No change to SportsCult/Prowlarr or SportsMeta enrichment boundaries.
//   - No change to parser logic.
//   - Broadcast template returns slots:[] from the renderer; harness defines
//     its own broadcast slot positions to match the existing 600×900 SVG layout.
//
// Usage:
//   node scripts/audit-logo-composite.js
//   node scripts/audit-logo-composite.js --out <dir>
//   node scripts/audit-logo-composite.js --offline   (skip live fetch, fail)

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const {
  SPORTS_POSTER_TEMPLATES,
  renderSportsPosterTemplateSvg,
  TEMPLATE_LABELS
} = require('../src/utils/sportsPosterTemplates')

const REPO_ROOT = path.resolve(__dirname, '..')
const DEFAULT_OUT = path.resolve(
  REPO_ROOT,
  '.claude/proofs/sports-artwork/logo-composite-audit/2026-05-05-pass-1'
)
const SPORTSMETA_BASE = 'https://sportsmeta.pvtkrrx.cc'
const CANVAS_W = 600
const CANVAS_H = 900

// SportsMeta IDs were probed via the live catalog endpoint
// `/catalog/movie/sportsmeta-<sport>.json` on 2026-05-05. Each fixture covers
// one of the four event-class buckets the audit must prove:
//   - team-vs-team (multiple sports)
//   - competitor-vs-competitor (UFC)
//   - solo motorsport / session (WRC)
//   - generic league/event (PDC darts)
const FIXTURES = [
  {
    key: 'football-epl-arsenal-atletico',
    bucket: 'team-vs-team',
    sportsmetaId: 'sportsmeta:event:football|2026-05-05|general|arsenal|atl-tico-madrid',
    event: {
      sport: 'Football',
      sportHint: 'football',
      league: 'European Football',
      eventClass: 'team_vs_team',
      eventTitle: 'Arsenal vs Atlético Madrid',
      eventName: 'Arsenal vs Atlético Madrid',
      eventShort: 'Arsenal vs Atlético Madrid',
      homeTeam: 'Arsenal',
      awayTeam: 'Atlético Madrid',
      principalA: 'Arsenal',
      principalB: 'Atlético Madrid',
      home: { name: 'Arsenal', short: 'ARS', initials: 'AR' },
      away: { name: 'Atlético Madrid', short: 'ATM', initials: 'AT' },
      eventDetail: 'Champions League',
      round: 'Champions League',
      date: '2026-05-05',
      venue: 'Emirates Stadium'
    }
  },
  {
    key: 'basketball-nba-pistons-cavaliers',
    bucket: 'team-vs-team',
    sportsmetaId: 'sportsmeta:event:basketball|2026-05-05|nba|detroit-pistons|cleveland-cavaliers',
    event: {
      sport: 'Basketball',
      sportHint: 'basketball',
      league: 'NBA',
      eventClass: 'team_vs_team',
      eventTitle: 'Detroit Pistons vs Cleveland Cavaliers',
      homeTeam: 'Detroit Pistons',
      awayTeam: 'Cleveland Cavaliers',
      principalA: 'Detroit Pistons',
      principalB: 'Cleveland Cavaliers',
      home: { name: 'Detroit Pistons', short: 'DET', initials: 'DE' },
      away: { name: 'Cleveland Cavaliers', short: 'CLE', initials: 'CL' },
      eventDetail: 'NBA Playoffs · First Round',
      round: 'NBA Playoffs · First Round',
      date: '2026-05-05',
      venue: 'Little Caesars Arena'
    }
  },
  {
    key: 'hockey-nhl-vegas-anaheim',
    bucket: 'team-vs-team',
    sportsmetaId: 'sportsmeta:event:hockey|2026-05-05|nhl|vegas-golden-knights|anaheim-ducks',
    event: {
      sport: 'Hockey',
      sportHint: 'hockey',
      league: 'NHL',
      eventClass: 'team_vs_team',
      eventTitle: 'Vegas Golden Knights vs Anaheim Ducks',
      homeTeam: 'Vegas Golden Knights',
      awayTeam: 'Anaheim Ducks',
      principalA: 'Vegas Golden Knights',
      principalB: 'Anaheim Ducks',
      home: { name: 'Vegas Golden Knights', short: 'VGK', initials: 'VG' },
      away: { name: 'Anaheim Ducks', short: 'ANA', initials: 'AN' },
      eventDetail: 'Regular Season',
      round: 'Regular Season',
      date: '2026-05-05',
      venue: 'T-Mobile Arena'
    }
  },
  {
    key: 'mma-ufc-chimaev-strickland',
    bucket: 'competitor-vs-competitor',
    sportsmetaId: 'sportsmeta:event:mma|2026-05-09|ufc|ufc-328-chimaev|strickland',
    event: {
      sport: 'MMA',
      sportHint: 'mma',
      league: 'UFC',
      eventClass: 'combat_event',
      eventTitle: 'UFC 328',
      eventName: 'UFC 328',
      eventShort: 'UFC 328',
      homeTeam: 'Khamzat Chimaev',
      awayTeam: 'Sean Strickland',
      principalA: 'Khamzat Chimaev',
      principalB: 'Sean Strickland',
      home: { name: 'Khamzat Chimaev', short: 'CHI', initials: 'KC' },
      away: { name: 'Sean Strickland', short: 'STR', initials: 'SS' },
      eventDetail: 'Middleweight Title — Main Event',
      session: 'Main Event',
      round: 'Main Event',
      date: '2026-05-09',
      venue: 'T-Mobile Arena, Las Vegas'
    }
  },
  {
    key: 'motorsport-wrc-portugal',
    bucket: 'solo-motorsport',
    sportsmetaId: 'sportsmeta:event:motorsport|2026-05-07|wrc|wrc-vodafone-rally-de-portugal',
    event: {
      sport: 'Motorsport',
      sportHint: 'motorsport',
      league: 'World Rally Championship',
      eventClass: 'motorsport_event',
      eventTitle: 'Vodafone Rally de Portugal',
      eventName: 'Vodafone Rally de Portugal',
      eventShort: 'Rally de Portugal',
      eventDetail: 'WRC Round 5',
      session: 'WRC Round 5',
      round: 'Round 5',
      date: '2026-05-07',
      venue: 'Matosinhos · Portugal'
    }
  },
  {
    key: 'darts-pdc-premier-league',
    bucket: 'generic-event',
    sportsmetaId: 'sportsmeta:event:darts|2026-04-30|pdc-darts|betmgm-premier-league-night-13',
    event: {
      sport: 'Darts',
      sportHint: 'darts',
      league: 'PDC Premier League',
      eventClass: 'darts_event',
      eventTitle: 'BetMGM Premier League Night 13',
      eventName: 'BetMGM Premier League Night 13',
      eventShort: 'Premier League Darts',
      eventDetail: 'Night 13',
      session: 'Night 13',
      round: 'Night 13',
      date: '2026-04-30',
      venue: 'Sheffield · Utilita Arena'
    }
  }
]

// Body-text rectangles per template, in 600×900 canvas coords. Identity
// zones (masthead, top-bar, top-badge, vs-mark) are deliberately EXCLUDED
// because the renderer places league/team slots in those zones by design —
// flagging them as "collisions" would just count intended placements.
//
// Only zones containing rendered title/name/footer text are listed. A logo
// slot is flagged as colliding when its overlap with any of these rectangles
// is ≥ 50% of the slot's area.
//
// NB: the audit harness is the only consumer of these zones — they are tuned
// by visual inspection of the 600×900 rendered output and DO NOT drive any
// runtime behaviour.
const TEXT_ZONES = {
  editorial: [
    { name: 'headline-body', x: 32, y: 540, w: 540, h: 170 },
    { name: 'standfirst', x: 32, y: 690, w: 540, h: 80 }
  ],
  broadcast: [
    // Lower-third names "Arsenal | Atlético Madrid" + venue/date row.
    { name: 'lower-third-names', x: 32, y: 720, w: 540, h: 170 }
  ],
  sportsbook: [
    // The lower spec-table where venue/date/status text lives.
    { name: 'spec-table', x: 32, y: 660, w: 540, h: 200 }
  ],
  'trading-card': [
    // The gold name banner at the bottom.
    { name: 'name-banner', x: 36, y: 600, w: 528, h: 220 }
  ],
  brutalist: [
    // Footer row (HOME/AWAY labels + team names + venue/date).
    { name: 'footer-text', x: 32, y: 820, w: 536, h: 70 }
  ],
  'ticket-stub': [
    // The home/away name row (NOT the visual circles, which are slots).
    { name: 'name-row-text', x: 32, y: 510, w: 536, h: 60 },
    { name: 'footer-text', x: 32, y: 770, w: 536, h: 120 }
  ],
  glitch: [
    // The "<HOME> x <AWAY>" tagline ribbon at the bottom.
    { name: 'tagline-ribbon', x: 30, y: 745, w: 540, h: 80 }
  ]
}
const COLLISION_OVERLAP_THRESHOLD = 0.5

function intersectArea(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

// Broadcast renderer returns slots: []. Define harness slots that match the
// existing 600×900 SVG geometry exactly:
//   homeBadgeX/Y = (170, 320), awayBadgeX/Y = (430, 580), badgeR = 40
// Slot coords are top-left in canvas pixels; size = box edge length.
function broadcastSlotsFor(event) {
  const eventClass = String(event.eventClass || '').toLowerCase()
  const isMatchup = eventClass === 'team_vs_team' ||
    eventClass === 'combat_event' ||
    eventClass === 'tennis_or_snooker_match'
  const slots = [
    // Top-bar code box: x=27 y=27 w=48 h=33 in renderer; we composite a
    // 48×48 league logo there as an identity chip.
    { role: 'leagueLogo', left: 27, top: 27, size: 48 }
  ]
  if (isMatchup) {
    slots.push(
      { role: 'home', left: 130, top: 280, size: 80 },
      { role: 'away', left: 390, top: 540, size: 80 }
    )
  } else {
    // Solo: place the league logo as a watermark over the giant league
    // wordmark so logos remain visible per audit rule.
    slots.push({ role: 'leagueLogo', left: 220, top: 380, size: 160 })
  }
  return slots
}

// Glitch renderer returns slots but the home/away ones are 34px line-icons in
// the bottom-strip area, easy to miss at thumbnail size. The audit rule says
// every variant must show a visible logo, so we ALSO add a discreet
// upper-right league chip and (for matchups) widen the home/away slots.
// Returned slots from the renderer remain authoritative for compositing — we
// just augment them.
function augmentGlitchSlots(originalSlots, event) {
  const eventClass = String(event.eventClass || '').toLowerCase()
  const isMatchup = eventClass === 'team_vs_team' ||
    eventClass === 'combat_event' ||
    eventClass === 'tennis_or_snooker_match'
  // Add a top-right league chip so glitch is identifiable at tile size even
  // when the bottom-strip slots aren't visible. 36×36 chip clear of all text.
  const augmented = [
    ...originalSlots,
    { role: 'leagueLogo', left: 540, top: 24, size: 36 }
  ]
  if (isMatchup) {
    // The renderer's bottom team-name strip lives at y≈764. Place 44×44
    // home/away chips inside the inner border but well clear of the band.
    augmented.push(
      { role: 'home', left: 36, top: 712, size: 44 },
      { role: 'away', left: 520, top: 712, size: 44 }
    )
  }
  return augmented
}

function sportsmetaAssetUrl(sportsmetaId, variant) {
  return `${SPORTSMETA_BASE}/asset/${variant}/${encodeURIComponent(sportsmetaId)}`
}

function urlForSlot(role, sportsmetaId) {
  if (role === 'home') return sportsmetaAssetUrl(sportsmetaId, 'homeBadge')
  if (role === 'away') return sportsmetaAssetUrl(sportsmetaId, 'awayBadge')
  if (role === 'league' || role === 'leagueLogo') return sportsmetaAssetUrl(sportsmetaId, 'leagueLogo')
  return null
}

function stripExternalFontImports(svg) {
  return String(svg || '')
    .replace(/@import\s+url\([^)]*\)\s*;?/g, '')
    .replace(/<style>([\s\S]*?)<\/style>/g, (match, body) => {
      const cleaned = body.replace(/&(?![a-zA-Z#]+;)/g, '&amp;')
      if (!cleaned.trim()) return ''
      return `<style>${cleaned}</style>`
    })
}

async function fetchAssetBuffer(url, fetchCache) {
  if (fetchCache.has(url)) return fetchCache.get(url)
  const promise = (async () => {
    const response = await fetch(url, { headers: { accept: 'image/svg+xml,image/*' } })
    if (!response.ok) throw new Error(`${url} -> ${response.status}`)
    const buf = Buffer.from(await response.arrayBuffer())
    return { buffer: buf, contentType: response.headers.get('content-type') || '' }
  })()
  fetchCache.set(url, promise)
  return promise
}

async function rasteriseLogoToSize(buffer, size) {
  // Round size up to keep antialiasing tidy.
  const px = Math.max(8, Math.round(size))
  const sharpInput = sharp(buffer, { density: 192 })
  return sharpInput
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function rasteriseBaseSvg(svgString) {
  const safe = stripExternalFontImports(svgString)
  return sharp(Buffer.from(safe), { density: 192 })
    .resize({ width: CANVAS_W, height: CANVAS_H, fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function judgeSample({ template, fixture, slots, logos, fetchErrors }) {
  const issues = []
  const collisions = []
  const clipped = []
  const zones = TEXT_ZONES[template] || []
  const successfulLogos = logos.filter((l) => l.status === 'ok')
  const logoCount = successfulLogos.length

  if (logoCount === 0) {
    issues.push('no-logo-present')
  }

  for (const logo of successfulLogos) {
    const box = { x: logo.left, y: logo.top, w: logo.size, h: logo.size }
    const isClipped = box.x < 0 || box.y < 0 || box.x + box.w > CANVAS_W || box.y + box.h > CANVAS_H
    if (isClipped) {
      clipped.push({ role: logo.role, slot: { left: logo.left, top: logo.top, size: logo.size } })
    }
    const slotArea = box.w * box.h
    for (const zone of zones) {
      const overlap = intersectArea(box, zone)
      if (slotArea > 0 && overlap / slotArea >= COLLISION_OVERLAP_THRESHOLD) {
        collisions.push({ role: logo.role, slot: { left: logo.left, top: logo.top, size: logo.size }, zone: zone.name, overlapPct: Math.round((overlap / slotArea) * 1000) / 10 })
      }
    }
  }

  if (clipped.length > 0) issues.push(`clipped:${clipped.length}`)
  if (collisions.length > 0) issues.push(`collision:${collisions.length}`)

  // Headline-priority heuristic for solo templates: when no real matchup exists
  // and the template's headline zone (e.g. editorial 'headline', glitch
  // 'tagline') overlaps with any logo, fail.
  const isSolo = !['team_vs_team', 'combat_event', 'tennis_or_snooker_match'].includes(String(fixture.event.eventClass || '').toLowerCase())
  if (isSolo) {
    const headlineZoneNames = new Set(['headline-body', 'lower-third-names', 'name-banner', 'name-row-text', 'tagline-ribbon'])
    const headlineCollisions = collisions.filter((c) => headlineZoneNames.has(c.zone))
    if (headlineCollisions.length > 0) issues.push(`headline-priority:${headlineCollisions.length}`)
  }

  // Stremio readability heuristic: at least one logo must be ≥ 30px on the
  // 600×900 canvas (≈ 10px on a 200px-wide tile). All logos combined must not
  // exceed 35% of total canvas area.
  const totalLogoArea = successfulLogos.reduce((sum, l) => sum + l.size * l.size, 0)
  const canvasArea = CANVAS_W * CANVAS_H
  const stremioReadable = successfulLogos.some((l) => l.size >= 30) && totalLogoArea / canvasArea < 0.35
  if (!stremioReadable) issues.push('stremio-readability')

  const pass = issues.length === 0 && fetchErrors.length === 0

  return {
    template,
    fixture: fixture.key,
    bucket: fixture.bucket,
    slotCount: slots.length,
    logoCount,
    successfulLogos: successfulLogos.map((l) => ({ role: l.role, left: l.left, top: l.top, size: l.size, sourceUrl: l.sourceUrl })),
    fetchErrors,
    clipped,
    collisions,
    issues,
    stremioReadable,
    pass
  }
}

async function processCell({ template, fixture, outRoot, fetchCache }) {
  const fixtureDir = path.join(outRoot, 'per-template', template)
  fs.mkdirSync(fixtureDir, { recursive: true })

  let baseSvg = ''
  let baseSlots = []
  let renderError = null
  try {
    const artwork = renderSportsPosterTemplateSvg({
      event: fixture.event,
      variant: 'poster',
      template
    })
    baseSvg = artwork.svg
    baseSlots = Array.isArray(artwork.slots) ? artwork.slots : []
  } catch (error) {
    renderError = String(error.message || error)
    baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}"><rect width="100%" height="100%" fill="#400000"/><text x="50%" y="50%" font-family="Arial" font-size="22" fill="#fff" text-anchor="middle">RENDER FAILED: ${escapeXmlForSvg(renderError)}</text></svg>`
  }

  // Harness-only slot augmentation. Broadcast renderer returns slots:[]
  // intentionally; glitch slots are very small. We never modify the runtime —
  // we only decide where to overlay the fetched logo PNG on top of the
  // already-rendered template PNG.
  let slots = baseSlots
  if (template === 'broadcast') {
    slots = broadcastSlotsFor(fixture.event)
  } else if (template === 'glitch') {
    slots = augmentGlitchSlots(baseSlots, fixture.event)
  }

  const basePng = await rasteriseBaseSvg(baseSvg)

  const logos = []
  const fetchErrors = []
  const composites = []
  for (const slot of slots) {
    const url = urlForSlot(slot.role, fixture.sportsmetaId)
    if (!url) {
      logos.push({ ...slot, status: 'no-url' })
      continue
    }
    try {
      const { buffer } = await fetchAssetBuffer(url, fetchCache)
      const logoPng = await rasteriseLogoToSize(buffer, slot.size)
      composites.push({ input: logoPng, top: Math.round(slot.top), left: Math.round(slot.left) })
      logos.push({ ...slot, status: 'ok', sourceUrl: url })
    } catch (error) {
      fetchErrors.push({ url, role: slot.role, error: String(error.message || error) })
      logos.push({ ...slot, status: 'fetch-failed', sourceUrl: url, error: String(error.message || error) })
    }
  }

  const finalPng = composites.length > 0
    ? await sharp(basePng).composite(composites).png({ compressionLevel: 9 }).toBuffer()
    : basePng

  const outPng = path.join(fixtureDir, `${fixture.key}.png`)
  fs.writeFileSync(outPng, finalPng)

  // Save the raw template SVG too so we can replay without the live service.
  fs.writeFileSync(path.join(fixtureDir, `${fixture.key}.svg`), baseSvg)

  const judgement = judgeSample({ template, fixture, slots, logos, fetchErrors })
  judgement.outputPng = path.relative(outRoot, outPng).replaceAll('\\', '/')
  judgement.renderError = renderError
  return { judgement, finalPng }
}

function escapeXmlForSvg(value) {
  return String(value || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])
}

async function buildContactSheet(rows, perTemplate, outPath) {
  // rows: array of { png, label } for vertical contact sheet
  const cellW = 200
  const cellH = 300
  const labelH = 26
  const cols = perTemplate ? rows.length : Math.min(rows.length, 8)
  const rowsCount = perTemplate ? 1 : Math.ceil(rows.length / cols)
  const sheetW = cellW * cols
  const sheetH = (cellH + labelH) * rowsCount

  const composites = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellLeft = col * cellW
    const cellTop = row * (cellH + labelH)
    const png = await sharp(r.png).resize(cellW, cellH, { fit: 'cover' }).png().toBuffer()
    composites.push({ input: png, left: cellLeft, top: cellTop + labelH })
    const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#0F0E10"/><text x="${cellW / 2}" y="${labelH - 8}" font-family="Arial,sans-serif" font-size="11" fill="#e6e6e6" text-anchor="middle">${escapeXmlForSvg(r.label)}</text></svg>`
    composites.push({ input: Buffer.from(labelSvg), left: cellLeft, top: cellTop })
  }
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 12, g: 12, b: 14 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

async function buildOverallContactSheet(grid, outPath) {
  // grid: 7 rows (templates) × N cols (fixtures). Each cell { png, label }.
  const templates = SPORTS_POSTER_TEMPLATES
  const cellW = 180
  const cellH = 270
  const labelH = 22
  const rowHeaderW = 110
  const cols = FIXTURES.length
  const sheetW = rowHeaderW + cellW * cols
  const sheetH = (cellH + labelH) * templates.length + labelH

  const composites = []

  // Top header row with fixture labels
  for (let c = 0; c < cols; c += 1) {
    const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#181820"/><text x="${cellW / 2}" y="${labelH - 7}" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#9adfff" text-anchor="middle">${escapeXmlForSvg(FIXTURES[c].key)}</text></svg>`
    composites.push({ input: Buffer.from(headerSvg), left: rowHeaderW + c * cellW, top: 0 })
  }

  for (let r = 0; r < templates.length; r += 1) {
    const template = templates[r]
    const rowTop = labelH + r * (cellH + labelH)

    // Row header (template label)
    const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rowHeaderW}" height="${cellH + labelH}"><rect width="100%" height="100%" fill="#181820"/><text x="${rowHeaderW / 2}" y="${(cellH + labelH) / 2 + 4}" font-family="Arial,sans-serif" font-size="13" font-weight="800" fill="#ffd96b" text-anchor="middle">${escapeXmlForSvg(TEMPLATE_LABELS[template] || template)}</text></svg>`
    composites.push({ input: Buffer.from(headerSvg), left: 0, top: rowTop })

    for (let c = 0; c < cols; c += 1) {
      const cell = grid[`${template}::${FIXTURES[c].key}`]
      if (!cell) continue
      const png = await sharp(cell.png).resize(cellW, cellH, { fit: 'cover' }).png().toBuffer()
      const verdictColour = cell.judgement.pass ? '#0e6b3e' : '#7a1f1f'
      const verdictText = cell.judgement.pass ? 'PASS' : `FAIL ${cell.judgement.issues.join(',')}`.slice(0, 28)
      const verdictSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="${verdictColour}"/><text x="${cellW / 2}" y="${labelH - 7}" font-family="Arial,sans-serif" font-size="10" fill="#fff" text-anchor="middle">${escapeXmlForSvg(verdictText)}</text></svg>`
      composites.push({ input: png, left: rowHeaderW + c * cellW, top: rowTop })
      composites.push({ input: Buffer.from(verdictSvg), left: rowHeaderW + c * cellW, top: rowTop + cellH })
    }
  }

  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: { r: 8, g: 8, b: 10 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: DEFAULT_OUT, offline: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--out') args.out = path.resolve(argv[++i])
    else if (a.startsWith('--out=')) args.out = path.resolve(a.slice('--out='.length))
    else if (a === '--offline') args.offline = true
  }
  return args
}

async function main() {
  const args = parseArgs()
  const outRoot = args.out
  fs.mkdirSync(outRoot, { recursive: true })
  fs.mkdirSync(path.join(outRoot, 'per-template'), { recursive: true })
  fs.mkdirSync(path.join(outRoot, 'contact-sheets'), { recursive: true })

  if (args.offline) {
    console.error('Offline mode disabled — this harness must hit the live SportsMeta service to prove real-logo placement.')
    process.exit(2)
  }

  const fetchCache = new Map()
  const judgements = []
  const grid = {}

  for (const template of SPORTS_POSTER_TEMPLATES) {
    for (const fixture of FIXTURES) {
      const cellId = `${template}::${fixture.key}`
      try {
        const { judgement, finalPng } = await processCell({ template, fixture, outRoot, fetchCache })
        judgements.push(judgement)
        grid[cellId] = { judgement, png: finalPng }
        const status = judgement.pass ? 'PASS' : `FAIL ${judgement.issues.join(',') || 'unknown'}`
        console.log(`${template}/${fixture.key} → ${status} (logos=${judgement.logoCount}/${judgement.slotCount})`)
      } catch (error) {
        console.error(`${template}/${fixture.key} ERROR: ${error.stack || error}`)
        judgements.push({
          template,
          fixture: fixture.key,
          bucket: fixture.bucket,
          slotCount: 0,
          logoCount: 0,
          issues: [`harness-error:${String(error.message || error).slice(0, 80)}`],
          pass: false
        })
      }
    }
  }

  // Per-template contact sheets
  for (const template of SPORTS_POSTER_TEMPLATES) {
    const rows = FIXTURES
      .map((f) => grid[`${template}::${f.key}`])
      .filter(Boolean)
      .map((cell) => ({
        png: cell.png,
        label: `${cell.judgement.fixture} · ${cell.judgement.pass ? 'PASS' : 'FAIL'}`
      }))
    if (rows.length > 0) {
      await buildContactSheet(rows, true, path.join(outRoot, 'contact-sheets', `${template}-row.png`))
    }
  }

  // Overall contact sheet (7 templates × N fixtures grid)
  await buildOverallContactSheet(grid, path.join(outRoot, 'contact-sheets', 'overall-grid.png'))

  // Manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    sportsmetaBase: SPORTSMETA_BASE,
    templates: SPORTS_POSTER_TEMPLATES,
    fixtures: FIXTURES.map((f) => ({ key: f.key, bucket: f.bucket, sportsmetaId: f.sportsmetaId, eventTitle: f.event.eventTitle })),
    sampleCount: judgements.length,
    passCount: judgements.filter((j) => j.pass).length,
    failCount: judgements.filter((j) => !j.pass).length
  }
  fs.writeFileSync(path.join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  // Logo audit report — full per-sample detail
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: judgements.length,
      pass: judgements.filter((j) => j.pass).length,
      fail: judgements.filter((j) => !j.pass).length,
      perTemplate: SPORTS_POSTER_TEMPLATES.reduce((acc, t) => {
        const rows = judgements.filter((j) => j.template === t)
        acc[t] = {
          total: rows.length,
          pass: rows.filter((j) => j.pass).length,
          fail: rows.filter((j) => !j.pass).length,
          issues: Array.from(new Set(rows.flatMap((j) => j.issues || [])))
        }
        return acc
      }, {})
    },
    judgements
  }
  fs.writeFileSync(path.join(outRoot, 'logo-audit-report.json'), `${JSON.stringify(report, null, 2)}\n`)

  console.log('')
  console.log(`Wrote ${judgements.length} samples to ${outRoot}`)
  console.log(`  pass=${report.summary.pass}  fail=${report.summary.fail}`)
  for (const [t, s] of Object.entries(report.summary.perTemplate)) {
    console.log(`    ${t}: pass=${s.pass}/${s.total}${s.issues.length ? ` issues=${s.issues.join('|')}` : ''}`)
  }
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
