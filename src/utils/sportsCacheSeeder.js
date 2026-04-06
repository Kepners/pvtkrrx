const { SPORTS_DISCOVERY_CATALOGS } = require('../config/sportsCatalogs')
const { listMappedLeagues } = require('./leagueMap')
const { getCachedSportsImage, normalizeRemoteImageUrl } = require('./sportsImageCache')

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json'
const DEFAULT_API_KEY = '123'
const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_IMAGE_CONCURRENCY = 6
const DEFAULT_EVENT_LEAGUE_LIMIT = 20
const DEFAULT_TEAM_LIMIT = 200
const DEFAULT_SCHEDULE_DAYS = 7

const SUPPORTED_SPORT_TARGETS = Object.freeze([
  { key: 'football', sportsDbSport: 'Soccer', label: 'Soccer' },
  { key: 'mma', sportsDbSport: 'Fighting', label: 'MMA' },
  { key: 'boxing', sportsDbSport: 'Fighting', label: 'Boxing' },
  { key: 'basketball', sportsDbSport: 'Basketball', label: 'Basketball' },
  { key: 'american-football', sportsDbSport: 'American Football', label: 'American Football' },
  { key: 'hockey', sportsDbSport: 'Ice Hockey', label: 'Ice Hockey' },
  { key: 'baseball', sportsDbSport: 'Baseball', label: 'Baseball' },
  { key: 'tennis', sportsDbSport: 'Tennis', label: 'Tennis' },
  { key: 'cricket', sportsDbSport: 'Cricket', label: 'Cricket' },
  { key: 'rugby', sportsDbSport: 'Rugby', label: 'Rugby' },
  { key: 'motorsport', sportsDbSport: 'Motorsport', label: 'Motorsport' },
  { key: 'wrestling', sportsDbSport: 'Fighting', label: 'Wrestling' }
])

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeText(value) {
  return normalizeSpace(value).toLowerCase()
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    const text = normalizeSpace(value)
    const key = normalizeText(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function uniqueBy(items = [], getKey) {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const key = String(getKey(item) || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function createLogger(logger = console) {
  return {
    log: typeof logger?.log === 'function' ? logger.log.bind(logger) : () => {},
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {}
  }
}

function scoreNameMatch(expected, candidate) {
  const expectedText = normalizeSpace(expected)
  const candidateText = normalizeSpace(candidate)
  if (!expectedText || !candidateText) return 0

  const expectedNormalized = normalizeText(expectedText)
  const candidateNormalized = normalizeText(candidateText)
  if (expectedNormalized === candidateNormalized) return 200

  const expectedCompact = compactText(expectedText)
  const candidateCompact = compactText(candidateText)
  if (expectedCompact && expectedCompact === candidateCompact) return 190
  if (expectedCompact && candidateCompact && (
    candidateCompact.includes(expectedCompact) ||
    expectedCompact.includes(candidateCompact)
  )) {
    return 150
  }

  const candidateTokens = new Set(tokenize(candidateText))
  const expectedTokens = tokenize(expectedText)
  if (expectedTokens.length === 0 || candidateTokens.size === 0) return 0

  let overlap = 0
  for (const token of expectedTokens) {
    if (candidateTokens.has(token)) overlap += 1
  }
  if (overlap === 0) return 0

  const fullMatchBonus = overlap === expectedTokens.length ? 60 : 0
  return (overlap * 20) + fullMatchBonus
}

function countLeagueArtwork(league = {}) {
  return [
    league?.strPoster,
    league?.strBanner,
    league?.strFanart1,
    league?.strFanart2,
    league?.strFanart3,
    league?.strLogo,
    league?.strBadge
  ].filter(Boolean).length
}

function countTeamArtwork(team = {}) {
  return [
    team?.strBadge,
    team?.strTeamBadge,
    team?.strTeamLogo,
    team?.strTeamBanner,
    team?.strTeamFanart1
  ].filter(Boolean).length
}

function hasLeagueArtwork(league = {}) {
  return countLeagueArtwork(league) > 0
}

function hasTeamArtwork(team = {}) {
  return countTeamArtwork(team) > 0
}

function buildLeagueIdentity(league = {}) {
  return String(league?.idLeague || compactText(league?.strLeague || league?.strLeagueAlternate || ''))
}

function buildTeamIdentity(team = {}) {
  return String(team?.idTeam || compactText(team?.strTeam || team?.strAlternate || ''))
}

function buildEventIdentity(event = {}) {
  return String(
    event?.idEvent ||
    compactText([
      event?.strEvent,
      event?.dateEvent,
      event?.strLeague,
      event?.strHomeTeam,
      event?.strAwayTeam
    ].filter(Boolean).join('|'))
  )
}

function toEventList(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.event)) return payload.event
  if (Array.isArray(payload.events)) return payload.events
  if (Array.isArray(payload.tvevents)) return payload.tvevents
  if (Array.isArray(payload.tvhighlights)) return payload.tvhighlights
  return []
}

function getMappedLeagueEntriesForSport(sportKey) {
  return listMappedLeagues()
    .filter((entry) => normalizeText(entry.sportKey) === normalizeText(sportKey))
}

function getMappedLeagueNamesForSport(sportKey) {
  return getMappedLeagueEntriesForSport(sportKey).map((entry) => entry.name)
}

function getPriorityTermsForSport(target = {}) {
  const mappedLeagues = getMappedLeagueNamesForSport(target.key)
  const catalog = SPORTS_DISCOVERY_CATALOGS.find((entry) => normalizeText(entry?.sportHint) === normalizeText(target.key))
  return uniqueStrings([
    ...mappedLeagues,
    ...(Array.isArray(catalog?.seedTerms) ? catalog.seedTerms : []),
    ...(Array.isArray(target.priorityTerms) ? target.priorityTerms : [])
  ])
}

function scoreLeagueCandidate(league = {}, priorityTerms = []) {
  const names = [
    league?.strLeague,
    league?.strLeagueAlternate,
    league?.strNaming
  ].filter(Boolean)

  let score = countLeagueArtwork(league) * 2
  for (const term of priorityTerms) {
    for (const name of names) {
      score = Math.max(score, scoreNameMatch(term, name) + (countLeagueArtwork(league) * 2))
    }
  }
  return score
}

function findBestLeagueMatch(leagues = [], expectedName = '') {
  let best = null
  let bestScore = 0
  for (const league of leagues) {
    const score = Math.max(
      scoreNameMatch(expectedName, league?.strLeague),
      scoreNameMatch(expectedName, league?.strLeagueAlternate),
      scoreNameMatch(expectedName, league?.strNaming)
    )
    if (score > bestScore) {
      best = league
      bestScore = score
    }
  }
  return bestScore >= 60 ? best : null
}

function selectLeagueTargets(leagues = [], priorityTerms = [], mappedLeagues = [], limit = DEFAULT_EVENT_LEAGUE_LIMIT) {
  const ranked = [...leagues]
    .map((league) => ({ league, score: scoreLeagueCandidate(league, priorityTerms) }))
    .sort((left, right) => right.score - left.score || String(left.league?.strLeague || '').localeCompare(String(right.league?.strLeague || '')))
    .map((entry) => entry.league)

  const selected = uniqueBy(
    [...mappedLeagues, ...ranked],
    buildLeagueIdentity
  ).slice(0, Math.max(1, limit))

  return {
    selected
  }
}

async function runWithConcurrency(items, limit, worker) {
  const concurrency = Math.max(1, Number(limit || 1))
  let cursor = 0

  async function next() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      await worker(items[index], index)
    }
  }

  const jobs = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => next())
  await Promise.all(jobs)
}

function queueImageTask(taskMap, task) {
  const normalizedUrl = normalizeRemoteImageUrl(task?.sourceUrl)
  if (!normalizedUrl) return
  if (taskMap.has(normalizedUrl)) return
  taskMap.set(normalizedUrl, {
    ...task,
    sourceUrl: normalizedUrl
  })
}

function collectEventImageTasks(taskMap, event, sportKey) {
  const eventName = normalizeSpace(event?.strEvent || event?.strFilename)
  queueImageTask(taskMap, { sourceUrl: event?.strPoster || event?.strEventPoster, variant: 'poster', category: 'event', sportKey, label: eventName })
  queueImageTask(taskMap, { sourceUrl: event?.strThumb || event?.strEventThumb, variant: 'landscape', category: 'event', sportKey, label: eventName })
  queueImageTask(taskMap, { sourceUrl: event?.strBanner || event?.strEventBanner, variant: 'background', category: 'event', sportKey, label: eventName })
  queueImageTask(taskMap, { sourceUrl: event?.strFanart, variant: 'background', category: 'event', sportKey, label: eventName })
}

function collectTeamImageTasks(taskMap, team, sportKey) {
  const teamName = normalizeSpace(team?.strTeam || team?.strAlternate)
  queueImageTask(taskMap, { sourceUrl: team?.strBadge, variant: 'logo', category: 'team', sportKey, label: teamName })
  queueImageTask(taskMap, { sourceUrl: team?.strTeamBadge, variant: 'logo', category: 'team', sportKey, label: teamName })
  queueImageTask(taskMap, { sourceUrl: team?.strTeamLogo, variant: 'logo', category: 'team', sportKey, label: teamName })
}

function collectLeagueImageTasks(taskMap, league, sportKey) {
  const leagueName = normalizeSpace(league?.strLeague || league?.strLeagueAlternate)
  queueImageTask(taskMap, { sourceUrl: league?.strLogo, variant: 'logo', category: 'league', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strBadge, variant: 'logo', category: 'league', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strPoster, variant: 'poster', category: 'league-fallback', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strBanner, variant: 'background', category: 'league-fallback', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strFanart1, variant: 'background', category: 'league-fallback', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strFanart2, variant: 'background', category: 'league-fallback', sportKey, label: leagueName })
  queueImageTask(taskMap, { sourceUrl: league?.strFanart3, variant: 'background', category: 'league-fallback', sportKey, label: leagueName })
}

function buildSportsDbUrl(apiKey, endpoint, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    const text = normalizeSpace(value)
    if (!text) continue
    query.set(key, text)
  }
  const queryString = query.toString()
  if (!queryString) return ''
  return `${BASE_URL}/${encodeURIComponent(apiKey)}/${endpoint}?${queryString}`
}

async function fetchSportsDbJson(apiKey, endpoint, params, context = {}) {
  const url = buildSportsDbUrl(apiKey, endpoint, params)
  if (!url) return null

  const requestCache = context.requestCache || new Map()
  if (requestCache.has(url)) {
    return requestCache.get(url)
  }

  const summary = context.summary
  const logger = context.logger || createLogger()
  const fetchImpl = context.fetchImpl || global.fetch
  const timeoutMs = Math.max(2000, Number(context.timeoutMs || DEFAULT_TIMEOUT_MS))

  const pending = (async () => {
    if (summary?.requests) summary.requests.total += 1
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json'
        }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const raw = await response.text()
      const trimmed = String(raw || '').trim()
      if (!trimmed || trimmed.startsWith('<')) return null
      return JSON.parse(trimmed)
    } catch (error) {
      if (summary?.requests) summary.requests.failed += 1
      logger.warn(`[cache:sports] ${endpoint} ${JSON.stringify(params || {})} failed: ${error.message}`)
      return null
    }
  })()

  requestCache.set(url, pending)
  return pending
}

async function fetchLeaguesBySport(apiKey, sportName, context) {
  const data = await fetchSportsDbJson(apiKey, 'search_all_leagues.php', { s: sportName }, context)
  return Array.isArray(data?.countries) ? data.countries : []
}

async function fetchUpcomingLeagueEvents(apiKey, idLeague, context) {
  const data = await fetchSportsDbJson(apiKey, 'eventsnextleague.php', { id: idLeague }, context)
  return toEventList(data)
}

async function fetchScheduleEventsByDate(apiKey, date, sportName, context) {
  const data = await fetchSportsDbJson(apiKey, 'eventsday.php', { d: date, s: sportName }, context)
  return toEventList(data)
}

async function fetchTvEventsByDate(apiKey, date, sportName, context) {
  const data = await fetchSportsDbJson(apiKey, 'eventstv.php', { d: date, s: sportName }, context)
  return toEventList(data)
}

async function fetchLeagueDetails(apiKey, idLeague, context) {
  const data = await fetchSportsDbJson(apiKey, 'lookupleague.php', { id: idLeague }, context)
  return Array.isArray(data?.leagues) ? data.leagues[0] || null : null
}

async function fetchMappedLeagueDetailsForSport(apiKey, sportKey, context) {
  const entries = getMappedLeagueEntriesForSport(sportKey)
    .filter((entry) => normalizeSpace(entry.idLeague))

  const leagues = []
  for (const entry of entries) {
    const league = await fetchLeagueDetails(apiKey, entry.idLeague, context)
    if (!league) continue
    leagues.push(league)
  }
  return uniqueBy(leagues, buildLeagueIdentity)
}

async function fetchTeamDetails(apiKey, idTeam, context) {
  const data = await fetchSportsDbJson(apiKey, 'lookupteam.php', { id: idTeam }, context)
  return Array.isArray(data?.teams) ? data.teams[0] || null : null
}

async function fetchTeamsForLeague(apiKey, league, context) {
  const names = uniqueStrings([league?.strLeague, league?.strLeagueAlternate])
  for (const name of names) {
    const data = await fetchSportsDbJson(apiKey, 'search_all_teams.php', { l: name }, context)
    const teams = Array.isArray(data?.teams) ? data.teams : []
    if (teams.length > 0) return teams
  }
  return []
}

function toIsoDateFromOffset(offsetDays = 0) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + Number(offsetDays || 0))
  return date.toISOString().slice(0, 10)
}

async function seedSportTarget(target, context) {
  const summary = {
    key: target.key,
    label: target.label,
    leaguesAvailable: 0,
    selectedLeagues: 0,
    mappedLeagues: 0,
    upcomingEvents: 0,
    teamsCollected: 0,
    queuedImages: 0
  }

  const mappedLeagueNames = getMappedLeagueNamesForSport(target.key)
  const mappedLeagueDetails = await fetchMappedLeagueDetailsForSport(context.apiKey, target.key, context)
  const leagues = uniqueBy([
    ...mappedLeagueDetails,
    ...(await fetchLeaguesBySport(context.apiKey, target.sportsDbSport, context))
  ], buildLeagueIdentity)
  summary.leaguesAvailable = leagues.length

  const priorityTerms = getPriorityTermsForSport(target)
  const matchedLeagueDetails = uniqueBy(
    mappedLeagueNames
      .map((name) => findBestLeagueMatch(leagues, name))
      .filter(Boolean),
    buildLeagueIdentity
  )
  const mappedMatches = uniqueBy([
    ...mappedLeagueDetails,
    ...matchedLeagueDetails
  ], buildLeagueIdentity)
  const { selected } = selectLeagueTargets(
    leagues,
    priorityTerms,
    mappedMatches,
    Math.max(1, Number(target.eventLeagueLimit || context.eventLeagueLimit || DEFAULT_EVENT_LEAGUE_LIMIT))
  )

  summary.mappedLeagues = mappedMatches.length
  summary.selectedLeagues = selected.length

  const eventsById = new Map()
  const addEvents = (items = []) => {
    for (const item of items) {
      const key = buildEventIdentity(item)
      if (!key || eventsById.has(key)) continue
      eventsById.set(key, item)
    }
  }

  for (const league of selected) {
    const idLeague = normalizeSpace(league?.idLeague)
    if (!idLeague) continue
    addEvents(await fetchUpcomingLeagueEvents(context.apiKey, idLeague, context))
  }

  const scheduleDays = Math.max(1, Number(context.scheduleDays || DEFAULT_SCHEDULE_DAYS))
  for (let offset = 0; offset < scheduleDays; offset += 1) {
    const date = toIsoDateFromOffset(offset)
    addEvents(await fetchScheduleEventsByDate(context.apiKey, date, target.sportsDbSport, context))
    addEvents(await fetchTvEventsByDate(context.apiKey, date, target.sportsDbSport, context))
  }

  summary.upcomingEvents = eventsById.size

  const localTasks = new Map()
  for (const event of eventsById.values()) {
    collectEventImageTasks(localTasks, event, target.key)
  }

  const teamLimit = Math.max(0, Number(target.teamLimit || context.teamLimitPerSport || DEFAULT_TEAM_LIMIT))
  const teamIds = new Set()
  const rankedLeagues = uniqueBy([...selected, ...mappedMatches], buildLeagueIdentity)
  for (const league of rankedLeagues) {
    if (teamIds.size >= teamLimit) break
    const teams = await fetchTeamsForLeague(context.apiKey, league, context)
    for (let team of teams) {
      if (teamIds.size >= teamLimit) break
      const teamId = buildTeamIdentity(team)
      if (!teamId || teamIds.has(teamId)) continue
      if (!hasTeamArtwork(team) && normalizeSpace(team?.idTeam)) {
        team = await fetchTeamDetails(context.apiKey, team.idTeam, context) || team
      }
      teamIds.add(teamId)
      collectTeamImageTasks(localTasks, team, target.key)
    }
  }

  summary.teamsCollected = teamIds.size

  for (let league of mappedMatches) {
    if (!hasLeagueArtwork(league) && normalizeSpace(league?.idLeague)) {
      league = await fetchLeagueDetails(context.apiKey, league.idLeague, context) || league
    }
    collectLeagueImageTasks(localTasks, league, target.key)
  }

  const tasks = [...localTasks.values()]
  summary.queuedImages = tasks.length
  return {
    summary,
    tasks
  }
}

function buildSeedSummary(apiKey) {
  const trimmedApiKey = normalizeSpace(apiKey)
  return {
    startedAt: new Date().toISOString(),
    apiKeyFingerprint: trimmedApiKey ? `${trimmedApiKey.slice(0, 4)}:${trimmedApiKey.length}` : 'none',
    requests: {
      total: 0,
      failed: 0
    },
    images: {
      total: 0,
      downloaded: 0,
      skipped: 0,
      refreshed: 0,
      stale: 0,
      failed: 0
    },
    sports: []
  }
}

function summarizeSportsImageSeed(summary = {}) {
  const sports = Array.isArray(summary?.sports) ? summary.sports : []
  const totals = sports.reduce((acc, sport) => {
    acc.events += Number(sport?.upcomingEvents || 0)
    acc.teams += Number(sport?.teamsCollected || 0)
    acc.mappedLeagues += Number(sport?.mappedLeagues || 0)
    return acc
  }, { events: 0, teams: 0, mappedLeagues: 0 })

  return [
    `${sports.length} sports`,
    `${totals.events} events`,
    `${totals.teams} teams`,
    `${totals.mappedLeagues} mapped leagues`,
    `${Number(summary?.images?.downloaded || 0)} downloaded`,
    `${Number(summary?.images?.skipped || 0)} cached`,
    `${Number(summary?.images?.refreshed || 0)} refreshed`,
    `${Number(summary?.images?.failed || 0)} failed`
  ].join(', ')
}

async function seedSportsImageCache(options = {}) {
  const apiKey = normalizeSpace(options.apiKey || process.env.SPORTSDB_API_KEY || DEFAULT_API_KEY) || DEFAULT_API_KEY
  const summary = buildSeedSummary(apiKey)
  const logger = createLogger(options.logger)
  const targets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : SUPPORTED_SPORT_TARGETS
  const requestCache = new Map()
  const taskMap = new Map()

  const context = {
    apiKey,
    fetchImpl: options.fetchImpl,
    logger,
    requestCache,
    summary,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    scheduleDays: options.scheduleDays || DEFAULT_SCHEDULE_DAYS,
    eventLeagueLimit: options.eventLeagueLimit || DEFAULT_EVENT_LEAGUE_LIMIT,
    teamLimitPerSport: options.teamLimitPerSport || DEFAULT_TEAM_LIMIT
  }

  logger.log(`[cache:sports] pre-seeding sports image cache with ${targets.length} sport groups`)
  for (const target of targets) {
    logger.log(`[cache:sports] ${target.label}: fetching leagues, events, and badges`)
    const sportResult = await seedSportTarget(target, context)
    summary.sports.push(sportResult.summary)
    for (const task of sportResult.tasks) {
      queueImageTask(taskMap, task)
    }
    logger.log(`[cache:sports] ${target.label}: queued ${sportResult.summary.queuedImages} image URLs from ${sportResult.summary.upcomingEvents} events and ${sportResult.summary.teamsCollected} teams`)
  }

  const tasks = [...taskMap.values()]
  summary.images.total = tasks.length
  await runWithConcurrency(tasks, options.imageConcurrency || DEFAULT_IMAGE_CONCURRENCY, async (task) => {
    try {
      const entry = await getCachedSportsImage(task.sourceUrl)
      if (entry?.cacheStatus === 'hit') {
        summary.images.skipped += 1
      } else if (entry?.cacheStatus === 'refresh') {
        summary.images.refreshed += 1
      } else if (entry?.cacheStatus === 'stale') {
        summary.images.stale += 1
      } else {
        summary.images.downloaded += 1
      }
    } catch (error) {
      summary.images.failed += 1
      logger.warn(`[cache:sports] image fetch failed for ${task.category}/${task.variant} ${task.label || task.sourceUrl}: ${error.message}`)
    }
  })

  summary.completedAt = new Date().toISOString()
  logger.log(`[cache:sports] complete: ${summarizeSportsImageSeed(summary)}`)
  return summary
}

module.exports = {
  SUPPORTED_SPORT_TARGETS,
  seedSportsImageCache,
  summarizeSportsImageSeed
}
