#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const {
  SPORTS_POSTER_TEMPLATES,
  renderSportsPosterTemplateSvg
} = require('../src/utils/sportsPosterTemplates')

const DEFAULT_OUT = path.join(process.cwd(), 'dist', 'poster-samples')

const EVENTS = [
  {
    className: 'football-club-matchup',
    event: {
      sport: 'Football',
      sportHint: 'football',
      league: 'English Premier League',
      title: 'Arsenal vs Chelsea',
      eventTitle: 'Arsenal vs Chelsea',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      date: '2026-04-29',
      eventClass: 'team_vs_team'
    }
  },
  {
    className: 'football-international-matchup',
    event: {
      sport: 'Football',
      sportHint: 'football',
      league: 'UEFA Nations League',
      title: 'England vs France',
      eventTitle: 'England vs France',
      homeTeam: 'England',
      awayTeam: 'France',
      date: '2026-06-10',
      eventClass: 'team_vs_team'
    }
  },
  {
    className: 'f1-practice-1',
    event: {
      sport: 'Motorsport',
      sportHint: 'motorsport',
      league: 'Formula 1',
      title: 'British Grand Prix',
      eventTitle: 'British Grand Prix',
      eventName: 'British Grand Prix',
      eventShort: 'British GP',
      eventDetail: 'Practice 1',
      session: 'Practice 1',
      date: '2026-07-03',
      eventClass: 'motorsport_event'
    }
  },
  {
    className: 'f1-qualifying',
    event: {
      sport: 'Motorsport',
      sportHint: 'motorsport',
      league: 'Formula 1',
      title: 'British Grand Prix',
      eventTitle: 'British Grand Prix',
      eventName: 'British Grand Prix',
      eventShort: 'British Grand Prix',
      eventDetail: 'Qualifying',
      session: 'Qualifying',
      date: '2026-07-04',
      eventClass: 'motorsport_event'
    }
  },
  {
    className: 'ufc-card-solo',
    event: {
      sport: 'MMA',
      sportHint: 'mma',
      league: 'UFC',
      title: 'UFC 312',
      eventTitle: 'UFC 312',
      eventName: 'UFC 312',
      eventDetail: 'Main Card',
      session: 'Main Card',
      date: '2026-06-14',
      eventClass: 'combat_event'
    }
  },
  {
    className: 'ufc-fighter-match',
    event: {
      sport: 'MMA',
      sportHint: 'mma',
      league: 'UFC',
      title: 'UFC 312',
      eventTitle: 'UFC 312',
      eventName: 'UFC 312',
      eventDetail: 'Makhachev v Oliveira',
      session: 'Main Event',
      homeTeam: 'Makhachev',
      awayTeam: 'Oliveira',
      date: '2026-06-14',
      eventClass: 'combat_event'
    }
  },
  {
    className: 'golf-tournament-round',
    event: {
      sport: 'Golf',
      sportHint: 'golf',
      league: 'PGA Championship',
      title: 'PGA Championship',
      eventTitle: 'PGA Championship',
      eventDetail: 'Round 2',
      session: 'Round 2',
      date: '2026-05-15',
      eventClass: 'golf_event'
    }
  },
  {
    className: 'wwe-show',
    event: {
      sport: 'Wrestling',
      sportHint: 'wrestling',
      league: 'WWE',
      title: 'SmackDown',
      eventTitle: 'SmackDown',
      eventDetail: 'Friday Night',
      session: 'Friday Night',
      date: '2026-04-29',
      eventClass: 'wrestling_event'
    }
  },
  {
    className: 'cycling-stage',
    event: {
      sport: 'Cycling',
      sportHint: 'cycling',
      league: 'Tour de France',
      title: 'Tour de France',
      eventTitle: 'Tour de France',
      eventDetail: 'Stage 1',
      session: 'Stage 1',
      date: '2026-07-04',
      eventClass: 'cycling_event'
    }
  },
  {
    className: 'athletics-event',
    event: {
      sport: 'Athletics',
      sportHint: 'athletics',
      league: 'Diamond League',
      title: 'Diamond League Doha',
      eventTitle: 'Diamond League Doha',
      eventDetail: 'Finals',
      session: 'Finals',
      date: '2026-05-08',
      eventClass: 'athletics_event'
    }
  },
  {
    className: 'tennis-player-match',
    event: {
      sport: 'Tennis',
      sportHint: 'tennis',
      league: 'Wimbledon',
      title: 'Wimbledon',
      eventTitle: 'Wimbledon',
      eventDetail: 'Sinner v Alcaraz',
      session: 'Final',
      homeTeam: 'Sinner',
      awayTeam: 'Alcaraz',
      date: '2026-07-12',
      eventClass: 'tennis_or_snooker_match'
    }
  },
  {
    className: 'snooker-tournament',
    event: {
      sport: 'Snooker',
      sportHint: 'snooker',
      league: 'World Championship',
      title: 'World Snooker Championship',
      eventTitle: 'World Snooker Championship',
      eventDetail: 'Final',
      session: 'Final',
      date: '2026-05-04',
      eventClass: 'tournament_event'
    }
  },
  {
    className: 'darts-tournament',
    event: {
      sport: 'Darts',
      sportHint: 'darts',
      league: 'Premier League Darts',
      title: 'Premier League Darts',
      eventTitle: 'Premier League Darts',
      eventDetail: 'Night 1',
      session: 'Night 1',
      date: '2026-04-30',
      eventClass: 'darts_event'
    }
  },
  {
    className: 'tennis-tournament',
    event: {
      sport: 'Tennis',
      sportHint: 'tennis',
      league: 'Wimbledon',
      title: 'Wimbledon',
      eventTitle: 'Wimbledon',
      eventDetail: 'Day 1',
      session: 'Day 1',
      date: '2026-07-01',
      eventClass: 'tournament_event'
    }
  },
  {
    className: 'generic-event',
    event: {
      sport: 'Sports',
      league: 'Sports',
      title: 'Highlights Pack',
      eventTitle: 'Highlights Pack',
      eventDetail: 'Latest',
      session: 'Latest',
      date: '2026-04-29',
      eventClass: 'generic_event'
    }
  }
]

function parseOutDir(argv = []) {
  const outIndex = argv.indexOf('--out')
  if (outIndex >= 0 && argv[outIndex + 1]) return path.resolve(argv[outIndex + 1])
  const inline = argv.find((arg) => arg.startsWith('--out='))
  if (inline) return path.resolve(inline.slice('--out='.length))
  return DEFAULT_OUT
}

async function main() {
  const outDir = parseOutDir(process.argv.slice(2))
  fs.mkdirSync(outDir, { recursive: true })

  const manifest = []
  for (const { className, event } of EVENTS) {
    for (const template of SPORTS_POSTER_TEMPLATES) {
      const artwork = renderSportsPosterTemplateSvg({ event, template, variant: 'poster' })
      const basename = `${className}-${template}`
      const pngPath = path.join(outDir, `${basename}.png`)
      await sharp(Buffer.from(artwork.svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath)
      manifest.push({
        className,
        template,
        file: path.basename(pngPath),
        title: event.eventTitle || event.title,
        detail: event.eventDetail || event.session || ''
      })
    }
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), samples: manifest }, null, 2)}\n`)
  console.log(`Rendered ${manifest.length} sports poster samples to ${outDir}`)
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})
