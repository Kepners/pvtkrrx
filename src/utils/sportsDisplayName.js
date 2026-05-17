function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function humanizeSportLabel(value = '') {
  const normalized = normalizeSpace(value).toLowerCase()
  if (!normalized) return ''
  const labels = {
    'american-football': 'American Football',
    'australian-rules-football': 'Australian Rules Football',
    athletics: 'Athletics',
    baseball: 'Baseball',
    basketball: 'Basketball',
    boxing: 'Boxing',
    cricket: 'Cricket',
    cycling: 'Cycling',
    darts: 'Darts',
    football: 'Football',
    golf: 'Golf',
    hockey: 'Hockey',
    'ice-hockey': 'Ice Hockey',
    mma: 'MMA',
    motorsport: 'Motorsport',
    rugby: 'Rugby',
    snooker: 'Snooker',
    tennis: 'Tennis',
    wrestling: 'Wrestling'
  }
  if (labels[normalized]) return labels[normalized]
  return normalized
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase() === part && part.length <= 4
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function displayNameAlreadyPrefixed(title = '', label = '') {
  const source = normalizeSpace(title).toLowerCase()
  const prefix = normalizeSpace(label).toLowerCase()
  if (!source || !prefix) return false
  return source === prefix ||
    source.startsWith(`${prefix}:`) ||
    source.startsWith(`${prefix} -`) ||
    source.startsWith(`${prefix} `)
}

function buildSportsDisplayName(input = {}) {
  const rawTitle = normalizeSpace(input.title || input.eventTitle || input.name)
  const eventDetail = normalizeSpace(input.eventDetail || input.round || input.session || input.gameNumber)
  const isHeadToHead = Boolean(input.homeTeam && input.awayTeam) || /\b(?:vs|v|at)\b/i.test(rawTitle)
  let title = rawTitle
  if (eventDetail && rawTitle && !isHeadToHead && !new RegExp(`\\b${eventDetail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rawTitle)) {
    const titleWords = rawTitle.split(/\s+/).filter(Boolean)
    const detailWords = eventDetail.split(/\s+/).filter(Boolean)
    const lastTitleWord = titleWords[titleWords.length - 1] || ''
    const firstDetailWord = detailWords[0] || ''
    if (lastTitleWord && firstDetailWord && lastTitleWord.toLowerCase() === firstDetailWord.toLowerCase()) {
      const remainder = detailWords.slice(1).join(' ')
      title = remainder ? `${rawTitle} ${remainder}` : rawTitle
    } else {
      title = `${rawTitle} ${eventDetail}`
    }
  }
  const competition = normalizeSpace(input.competition || input.league)
  const sport = humanizeSportLabel(input.sportHint || input.sport)
  const label = competition || sport
  if (!title) return label
  if (!label || displayNameAlreadyPrefixed(title, label)) return title
  return `${label}: ${title}`
}

module.exports = {
  buildSportsDisplayName,
  humanizeSportLabel
}
