const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')
const socialDir = path.join(publicDir, 'social')
const logoSvgPath = path.join(publicDir, 'logo.svg')
const logoIcoPath = path.join(publicDir, 'logo.ico')

const canvas = { width: 1200, height: 630 }

const pages = [
  {
    file: 'pvtkrrx-home.png',
    badge: 'HOME',
    eyebrow: 'PRIVATE TRACKER BRIDGE',
    titleLines: ['Private Trackers', 'Inside Stremio'],
    subtitle: 'Prowlarr and qBittorrent on your hardware. No debrid. No third-party media host.',
    chips: ['SPORTS', 'MOVIES', 'TV', 'LIBRARY', 'YOUR HARDWARE'],
    sideTitle: 'Guide Surface',
    sideCopy: 'Public guide pages for the addon. Configure on the Windows host or your own self-host server.',
    sideListTitle: 'Coverage',
    sideList: [
      'Three route model',
      'Hosted guide pages',
      'Release-aware site status'
    ],
    accentStart: '#00f6ff',
    accentEnd: '#00ff66'
  },
  {
    file: 'pvtkrrx-sports.png',
    badge: 'SPORTS GUIDE',
    eyebrow: 'SPORTS SUPPORT',
    titleLines: ['Private Tracker', 'Sports In Stremio'],
    subtitle: 'Browse football, F1, UFC, NBA, cricket, rugby, tennis, and more from your own tracker stack.',
    chips: ['FOOTBALL', 'F1', 'UFC', 'NBA', 'CRICKET'],
    sideTitle: 'Sports Layer',
    sideCopy: 'Sports stays a first-class catalog with metadata and artwork routed through SportsMeta.',
    sideListTitle: 'Signals',
    sideList: [
      'Genre filtering',
      'Artwork enrichment',
      'Tracker-owned content'
    ],
    accentStart: '#00f6ff',
    accentEnd: '#ff315f'
  },
  {
    file: 'pvtkrrx-runbooks.png',
    badge: 'RUNBOOKS',
    eyebrow: 'SETUP GUIDES',
    titleLines: ['Seedbox Setup', 'Guides'],
    subtitle: 'Provider-specific runbooks for Whatbox, Ultra.cc, SeedHost, Feral, Swizzin, and more.',
    chips: ['WHATBOX', 'ULTRA.CC', 'SEEDHOST', 'FERAL', 'SWIZZIN'],
    sideTitle: 'Operator Docs',
    sideCopy: 'Practical setup guidance for public endpoints, Prowlarr, qBittorrent, and route selection.',
    sideListTitle: 'Included',
    sideList: [
      'Provider presets',
      'Route-specific setup',
      'Self-host pointers'
    ],
    accentStart: '#00f6ff',
    accentEnd: '#8e6bff'
  },
  {
    file: 'pvtkrrx-configure.png',
    badge: 'CONFIGURE FIRST',
    eyebrow: 'ROUTE SETUP',
    titleLines: ['Choose The Route', 'That Matches Playback'],
    subtitle: 'PC Local for the host PC. LAN Bridge for other home devices. Remote Seedbox for public endpoints.',
    chips: ['PC LOCAL', 'LAN BRIDGE', 'REMOTE SEEDBOX'],
    sideTitle: 'Setup Truth',
    sideCopy: 'The configure surface is not indexable. It stays focused on private runtime setup and route-specific install links.',
    sideListTitle: 'Modes',
    sideList: [
      'Windows host runtime',
      'Self-host server runtime',
      'Hosted token minting'
    ],
    accentStart: '#00f6ff',
    accentEnd: '#00ff66'
  }
]

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapText(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
  }

  if (current) lines.push(current)
  return lines
}

function renderLines(lines, x, startY, fontSize, lineHeight, color, weight = 700, letterSpacing = 0) {
  return lines.map((line, index) => {
    const y = startY + index * lineHeight
    return `<text x="${x}" y="${y}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" letter-spacing="${letterSpacing}">${escapeXml(line)}</text>`
  }).join('')
}

function renderMonoLines(lines, x, startY, fontSize, lineHeight, color, opacity = 1) {
  return lines.map((line, index) => {
    const y = startY + index * lineHeight
    return `<text x="${x}" y="${y}" fill="${color}" fill-opacity="${opacity}" font-family="Consolas, 'Courier New', monospace" font-size="${fontSize}" letter-spacing="1.1">${escapeXml(line)}</text>`
  }).join('')
}

function buildChipRow(chips, x, y, accentStart, accentEnd) {
  let cursor = x
  const segments = []
  for (const chip of chips) {
    const label = String(chip)
    const width = 26 + label.length * 11
    segments.push(`
      <g transform="translate(${cursor} ${y})">
        <rect width="${width}" height="34" rx="17" fill="rgba(4, 12, 26, 0.9)" stroke="url(#chipStroke)" />
        <text x="${width / 2}" y="22" text-anchor="middle" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="13" letter-spacing="1">${escapeXml(label)}</text>
      </g>
    `)
    cursor += width + 12
  }
  return segments.join('').replace(/accentStart/g, accentStart).replace(/accentEnd/g, accentEnd)
}

function buildList(items, x, startY, accent) {
  return items.map((item, index) => {
    const y = startY + index * 46
    return `
      <g transform="translate(${x} ${y})">
        <rect width="12" height="12" rx="6" fill="${accent}" fill-opacity="0.88" />
        <text x="26" y="11" fill="#d8e4ff" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${escapeXml(item)}</text>
      </g>
    `
  }).join('')
}

function buildCardSvg(page, logoDataUri) {
  const sideCopyLines = wrapText(page.sideCopy, 28)
  const subtitleLines = wrapText(page.subtitle, 60)
  const badgeWidth = 34 + String(page.badge).length * 10
  const sideCopyStartY = 82
  const sideCopyFontSize = 20
  const sideCopyLineHeight = 28
  const sideCopyBottomY = sideCopyStartY + (Math.max(sideCopyLines.length, 1) - 1) * sideCopyLineHeight
  const sideDividerY = sideCopyBottomY + 20
  const sideListTitleY = sideDividerY + 38
  const sideListStartY = sideListTitleY + 26

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#02050a" />
        <stop offset="55%" stop-color="#09121d" />
        <stop offset="100%" stop-color="#070913" />
      </linearGradient>
      <radialGradient id="glowLeft" cx="25%" cy="34%" r="60%">
        <stop offset="0%" stop-color="${page.accentStart}" stop-opacity="0.28" />
        <stop offset="55%" stop-color="${page.accentStart}" stop-opacity="0.08" />
        <stop offset="100%" stop-color="${page.accentStart}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="glowRight" cx="84%" cy="24%" r="54%">
        <stop offset="0%" stop-color="${page.accentEnd}" stop-opacity="0.2" />
        <stop offset="55%" stop-color="${page.accentEnd}" stop-opacity="0.06" />
        <stop offset="100%" stop-color="${page.accentEnd}" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="panelStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${page.accentStart}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${page.accentEnd}" stop-opacity="0.45" />
      </linearGradient>
      <linearGradient id="badgeFill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${page.accentStart}" />
        <stop offset="100%" stop-color="${page.accentEnd}" />
      </linearGradient>
      <linearGradient id="chipStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${page.accentStart}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${page.accentEnd}" stop-opacity="0.35" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${page.accentStart}" stroke-opacity="0.08" />
      </pattern>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="22" />
      </filter>
    </defs>

    <rect width="${canvas.width}" height="${canvas.height}" fill="url(#bg)" />
    <rect width="${canvas.width}" height="${canvas.height}" fill="url(#grid)" />
    <rect width="${canvas.width}" height="${canvas.height}" fill="url(#glowLeft)" />
    <rect width="${canvas.width}" height="${canvas.height}" fill="url(#glowRight)" />

    <g opacity="0.18">
      <circle cx="260" cy="298" r="212" fill="none" stroke="${page.accentStart}" stroke-opacity="0.16" stroke-width="2" />
      <circle cx="260" cy="298" r="180" fill="none" stroke="${page.accentStart}" stroke-opacity="0.18" stroke-width="2" />
      <circle cx="260" cy="298" r="148" fill="none" stroke="${page.accentStart}" stroke-opacity="0.2" stroke-width="2" />
      <circle cx="260" cy="298" r="116" fill="none" stroke="${page.accentStart}" stroke-opacity="0.22" stroke-width="2" />
      <circle cx="260" cy="298" r="84" fill="none" stroke="${page.accentStart}" stroke-opacity="0.24" stroke-width="2" />
    </g>

    <rect x="32" y="24" width="1136" height="52" rx="18" fill="#07111c" fill-opacity="0.9" stroke="${page.accentStart}" stroke-opacity="0.22" />
    <circle cx="52" cy="50" r="4.5" fill="${page.accentStart}" />
    <text x="68" y="56" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="18" letter-spacing="1.2">PVTKRRX / PRIVATE TRACKER BRIDGE</text>

    <g transform="translate(810 34)">
      <rect width="72" height="30" rx="15" fill="#07111c" fill-opacity="0.98" stroke="${page.accentStart}" stroke-opacity="0.28" />
      <text x="36" y="20" text-anchor="middle" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="13" letter-spacing="1">HOME</text>
    </g>
    <g transform="translate(894 34)">
      <rect width="86" height="30" rx="15" fill="#07111c" fill-opacity="0.98" stroke="${page.accentStart}" stroke-opacity="0.28" />
      <text x="43" y="20" text-anchor="middle" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="13" letter-spacing="1">SPORTS</text>
    </g>
    <g transform="translate(992 34)">
      <rect width="104" height="30" rx="15" fill="#07111c" fill-opacity="0.98" stroke="${page.accentStart}" stroke-opacity="0.28" />
      <text x="52" y="20" text-anchor="middle" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="13" letter-spacing="1">RUNBOOKS</text>
    </g>

    <rect x="36" y="94" width="1128" height="500" rx="26" fill="#08111c" fill-opacity="0.84" stroke="url(#panelStroke)" stroke-opacity="0.72" />
    <rect x="36" y="94" width="1128" height="500" rx="26" fill="url(#glowLeft)" opacity="0.18" />

    <g filter="url(#softGlow)">
      <circle cx="980" cy="206" r="84" fill="${page.accentEnd}" fill-opacity="0.08" />
      <circle cx="916" cy="458" r="110" fill="${page.accentStart}" fill-opacity="0.08" />
    </g>

    <image href="${logoDataUri}" x="68" y="138" width="108" height="108" />
    <text x="192" y="174" fill="${page.accentStart}" font-family="Consolas, 'Courier New', monospace" font-size="18" letter-spacing="2">${escapeXml(page.eyebrow)}</text>
    <g transform="translate(192 190)">
      <rect width="${badgeWidth}" height="34" rx="17" fill="url(#badgeFill)" />
      <text x="${badgeWidth / 2}" y="22" text-anchor="middle" fill="#031018" font-family="Consolas, 'Courier New', monospace" font-size="13" font-weight="700" letter-spacing="1.2">${escapeXml(page.badge)}</text>
    </g>

    ${renderLines(page.titleLines, 68, 316, 70, 72, '#f6fbff', 800, 0.4)}
    <rect x="70" y="352" width="430" height="2" fill="url(#badgeFill)" />
    ${renderMonoLines(subtitleLines, 70, 438, 20, 28, '#d4e0f8', 0.95)}
    ${buildChipRow(page.chips, 70, 494, page.accentStart, page.accentEnd)}

    <g transform="translate(782 148)">
      <rect width="330" height="348" rx="22" fill="#0a1522" fill-opacity="0.92" stroke="${page.accentStart}" stroke-opacity="0.22" />
      <text x="28" y="42" fill="${page.accentStart}" font-family="Consolas, 'Courier New', monospace" font-size="15" letter-spacing="1.8">${escapeXml(page.sideTitle)}</text>
      ${renderLines(sideCopyLines, 28, sideCopyStartY, sideCopyFontSize, sideCopyLineHeight, '#f1f7ff', 700, 0)}
      <rect x="28" y="${sideDividerY}" width="272" height="1" fill="${page.accentStart}" fill-opacity="0.22" />
      <text x="28" y="${sideListTitleY}" fill="${page.accentEnd}" font-family="Consolas, 'Courier New', monospace" font-size="15" letter-spacing="1.8">${escapeXml(page.sideListTitle)}</text>
      ${buildList(page.sideList, 28, sideListStartY, page.accentEnd)}
    </g>

    <g transform="translate(782 510)">
      <rect width="330" height="72" rx="18" fill="#0a1522" fill-opacity="0.92" stroke="${page.accentEnd}" stroke-opacity="0.22" />
      <text x="28" y="32" fill="#d8e4ff" font-family="Consolas, 'Courier New', monospace" font-size="15" letter-spacing="1.2">YOUR HARDWARE / YOUR TRACKERS</text>
      <text x="28" y="54" fill="#a3b7da" font-family="Consolas, 'Courier New', monospace" font-size="13" letter-spacing="1">www.pvtkrrx.cc</text>
    </g>
  </svg>
  `.trim()
}

async function writeSocialCard(page, logoDataUri) {
  const outputPath = path.join(socialDir, page.file)
  const svg = buildCardSvg(page, logoDataUri)
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outputPath)
  return outputPath
}

async function writeIcons() {
  const logoSvg = await fs.readFile(logoSvgPath)
  const iconSpecs = [
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'android-chrome-192x192.png', size: 192 },
    { file: 'android-chrome-512x512.png', size: 512 },
    { file: 'favicon-32x32.png', size: 32 },
    { file: 'favicon-16x16.png', size: 16 }
  ]

  for (const icon of iconSpecs) {
    await sharp(logoSvg)
      .resize(icon.size, icon.size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(publicDir, icon.file))
  }

  await fs.copyFile(logoIcoPath, path.join(publicDir, 'favicon.ico'))
}

async function main() {
  await fs.mkdir(socialDir, { recursive: true })
  const logoSvg = await fs.readFile(logoSvgPath, 'utf8')
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`

  await Promise.all([
    ...pages.map(page => writeSocialCard(page, logoDataUri)),
    writeIcons()
  ])

  for (const page of pages) {
    process.stdout.write(`generated ${path.join('public', 'social', page.file)}\n`)
  }
  process.stdout.write('generated public favicon and touch icons\n')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
