const fs = require('fs')
const path = require('path')

const { resolveRuntimeDir } = require('./runtimeDir')
const { loadSecureJsonFile } = require('./secureJsonFile')
const {
  SUPPORTED_SPORT_TARGETS,
  seedSportsImageCache,
  summarizeSportsImageSeed
} = require('./sportsCacheSeeder')

const STATE_FILE_NAME = 'sports-cache-autofill-state.json'
const DEFAULT_INITIAL_DELAY_MS = 15 * 60 * 1000
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_TARGETS_PER_RUN = 1
const DEFAULT_EVENT_LEAGUE_LIMIT = 8
const DEFAULT_TEAM_LIMIT_PER_SPORT = 50
const DEFAULT_SCHEDULE_DAYS = 7
const DEFAULT_IMAGE_CONCURRENCY = 4

let activeAutofillPromise = null
let schedulerController = null

function normalizeSpace(value) {
  return String(value || '').trim()
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseBoolean(value, fallback = false) {
  const text = normalizeSpace(value).toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function createLogger(logger = console) {
  return {
    log: typeof logger?.log === 'function' ? logger.log.bind(logger) : () => {},
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {}
  }
}

function formatDurationCompact(ms) {
  const value = Math.max(1000, Number(ms || 0))
  if (value % (60 * 60 * 1000) === 0) {
    return `${value / (60 * 60 * 1000)}h`
  }
  if (value % (60 * 1000) === 0) {
    return `${value / (60 * 1000)}m`
  }
  return `${Math.round(value / 1000)}s`
}

function getSportsCacheAutofillStatePath(runtimeDir = resolveRuntimeDir()) {
  return path.join(runtimeDir, STATE_FILE_NAME)
}

function loadLocalAddonConfig(runtimeDir = resolveRuntimeDir()) {
  const configPath = path.join(runtimeDir, 'local-config.json')
  try {
    return loadSecureJsonFile(configPath, { defaultValue: null }) || null
  } catch (_) {
    return null
  }
}

function resolveSportsCacheApiKey(options = {}) {
  const env = options.env || process.env
  const runtimeDir = normalizeSpace(options.runtimeDir) || resolveRuntimeDir(env)
  const localConfig = options.localConfig === undefined
    ? loadLocalAddonConfig(runtimeDir)
    : options.localConfig

  return normalizeSpace(
    options.apiKey ||
    env.PVTKRRX_SPORTS_CACHE_API_KEY ||
    env.SPORTSDB_API_KEY ||
    localConfig?.sportsDbApiKey ||
    '123'
  ) || '123'
}

function resolveSportsCacheAutofillConfig(options = {}) {
  const env = options.env || process.env
  const platform = normalizeSpace(options.platform) || process.platform
  const isVercelRuntime = typeof options.isVercelRuntime === 'boolean'
    ? options.isVercelRuntime
    : Boolean(env.VERCEL)
  const enabledByDefault = !isVercelRuntime && platform !== 'win32'
  const enabled = typeof options.enabled === 'boolean'
    ? options.enabled
    : parseBoolean(env.PVTKRRX_SPORTS_CACHE_AUTO_FILL, enabledByDefault)

  return {
    enabled,
    runtimeDir: normalizeSpace(options.runtimeDir) || resolveRuntimeDir(env, { platform }),
    initialDelayMs: clampInteger(
      options.initialDelayMs ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_INITIAL_DELAY_MS,
      DEFAULT_INITIAL_DELAY_MS,
      1000,
      7 * 24 * 60 * 60 * 1000
    ),
    intervalMs: clampInteger(
      options.intervalMs ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      60 * 1000,
      30 * 24 * 60 * 60 * 1000
    ),
    targetsPerRun: clampInteger(
      options.targetsPerRun ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_TARGETS_PER_RUN,
      DEFAULT_TARGETS_PER_RUN,
      1,
      SUPPORTED_SPORT_TARGETS.length
    ),
    eventLeagueLimit: clampInteger(
      options.eventLeagueLimit ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_EVENT_LEAGUE_LIMIT,
      DEFAULT_EVENT_LEAGUE_LIMIT,
      1,
      50
    ),
    teamLimitPerSport: clampInteger(
      options.teamLimitPerSport ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_TEAM_LIMIT_PER_SPORT,
      DEFAULT_TEAM_LIMIT_PER_SPORT,
      0,
      50
    ),
    scheduleDays: clampInteger(
      options.scheduleDays ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_SCHEDULE_DAYS,
      DEFAULT_SCHEDULE_DAYS,
      1,
      7
    ),
    imageConcurrency: clampInteger(
      options.imageConcurrency ?? env.PVTKRRX_SPORTS_CACHE_AUTO_FILL_IMAGE_CONCURRENCY,
      DEFAULT_IMAGE_CONCURRENCY,
      1,
      6
    )
  }
}

function createEmptyAutofillState() {
  return {
    nextTargetIndex: 0,
    lastStartedAt: '',
    lastCompletedAt: '',
    lastTargets: [],
    lastSummary: null,
    lastError: ''
  }
}

function loadSportsCacheAutofillState(statePath = getSportsCacheAutofillStatePath()) {
  const fallback = createEmptyAutofillState()
  if (!statePath || !fs.existsSync(statePath)) return fallback

  try {
    const raw = fs.readFileSync(statePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    return {
      nextTargetIndex: Math.max(0, Number.parseInt(parsed.nextTargetIndex, 10) || 0),
      lastStartedAt: normalizeSpace(parsed.lastStartedAt),
      lastCompletedAt: normalizeSpace(parsed.lastCompletedAt),
      lastTargets: Array.isArray(parsed.lastTargets)
        ? parsed.lastTargets.map((value) => normalizeSpace(value)).filter(Boolean)
        : [],
      lastSummary: parsed.lastSummary && typeof parsed.lastSummary === 'object'
        ? parsed.lastSummary
        : null,
      lastError: normalizeSpace(parsed.lastError)
    }
  } catch (_) {
    return fallback
  }
}

function saveSportsCacheAutofillState(statePath = getSportsCacheAutofillStatePath(), state = {}) {
  if (!statePath) return
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({
    nextTargetIndex: Math.max(0, Number.parseInt(state.nextTargetIndex, 10) || 0),
    lastStartedAt: normalizeSpace(state.lastStartedAt),
    lastCompletedAt: normalizeSpace(state.lastCompletedAt),
    lastTargets: Array.isArray(state.lastTargets)
      ? state.lastTargets.map((value) => normalizeSpace(value)).filter(Boolean)
      : [],
    lastSummary: state.lastSummary && typeof state.lastSummary === 'object'
      ? state.lastSummary
      : null,
    lastError: normalizeSpace(state.lastError)
  }, null, 2), 'utf8')
}

function pickSportsCacheAutofillTargets(options = {}) {
  const targets = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : SUPPORTED_SPORT_TARGETS
  if (targets.length === 0) {
    return {
      startIndex: 0,
      nextTargetIndex: 0,
      targets: []
    }
  }

  const count = Math.max(1, Math.min(
    targets.length,
    Number.parseInt(String(options.targetsPerRun || DEFAULT_TARGETS_PER_RUN), 10) || DEFAULT_TARGETS_PER_RUN
  ))
  const rawIndex = Number.parseInt(String(options.nextTargetIndex || 0), 10) || 0
  const startIndex = ((rawIndex % targets.length) + targets.length) % targets.length
  const selectedTargets = []
  for (let offset = 0; offset < count; offset += 1) {
    selectedTargets.push(targets[(startIndex + offset) % targets.length])
  }

  return {
    startIndex,
    nextTargetIndex: (startIndex + selectedTargets.length) % targets.length,
    targets: selectedTargets
  }
}

function describeSportsCacheAutofill(config = resolveSportsCacheAutofillConfig()) {
  if (!config.enabled) return 'disabled'
  const runLabel = `${config.targetsPerRun} sport${config.targetsPerRun === 1 ? '' : 's'}/run`
  return `first run in ${formatDurationCompact(config.initialDelayMs)}, then every ${formatDurationCompact(config.intervalMs)} (${runLabel})`
}

async function runSportsCacheAutofill(options = {}) {
  if (activeAutofillPromise) return activeAutofillPromise

  const config = resolveSportsCacheAutofillConfig(options)
  const logger = createLogger(options.logger)
  if (!config.enabled) return null

  const statePath = normalizeSpace(options.statePath) || getSportsCacheAutofillStatePath(config.runtimeDir)
  const targetsSource = Array.isArray(options.targets) && options.targets.length > 0
    ? options.targets
    : SUPPORTED_SPORT_TARGETS
  const reason = normalizeSpace(options.reason) || 'scheduled'

  let state = loadSportsCacheAutofillState(statePath)
  const selection = pickSportsCacheAutofillTargets({
    targets: targetsSource,
    targetsPerRun: config.targetsPerRun,
    nextTargetIndex: state.nextTargetIndex
  })

  if (selection.targets.length === 0) return null

  const nextState = {
    ...state,
    lastStartedAt: new Date().toISOString(),
    lastCompletedAt: '',
    lastTargets: selection.targets.map((target) => normalizeSpace(target?.key || target?.label)),
    lastSummary: null,
    lastError: ''
  }
  saveSportsCacheAutofillState(statePath, nextState)

  const targetLabels = selection.targets.map((target) => target.label).join(', ')
  const apiKey = resolveSportsCacheApiKey({
    ...options,
    runtimeDir: config.runtimeDir
  })

  activeAutofillPromise = (async () => {
    logger.log(`[cache:sports:auto] starting (${reason}): ${targetLabels}`)
    try {
      const summary = await seedSportsImageCache({
        apiKey,
        logger,
        fetchImpl: options.fetchImpl,
        targets: selection.targets,
        scheduleDays: config.scheduleDays,
        eventLeagueLimit: config.eventLeagueLimit,
        teamLimitPerSport: config.teamLimitPerSport,
        imageConcurrency: config.imageConcurrency
      })

      state = {
        ...nextState,
        nextTargetIndex: selection.nextTargetIndex,
        lastCompletedAt: new Date().toISOString(),
        lastSummary: {
          text: summarizeSportsImageSeed(summary),
          requests: summary.requests,
          images: summary.images,
          sports: summary.sports
        }
      }
      saveSportsCacheAutofillState(statePath, state)
      logger.log(`[cache:sports:auto] complete (${reason}): ${state.lastSummary.text}`)
      return {
        config,
        state,
        summary,
        targets: selection.targets
      }
    } catch (error) {
      state = {
        ...nextState,
        lastError: normalizeSpace(error?.message || 'Unknown sports cache autofill error')
      }
      saveSportsCacheAutofillState(statePath, state)
      logger.warn(`[cache:sports:auto] failed (${reason}): ${state.lastError}`)
      throw error
    }
  })().finally(() => {
    activeAutofillPromise = null
  })

  return activeAutofillPromise
}

function startSportsCacheAutofill(options = {}) {
  if (schedulerController) return schedulerController

  const config = resolveSportsCacheAutofillConfig(options)
  const logger = createLogger(options.logger)
  if (!config.enabled) return null

  let timer = null
  let stopped = false

  const scheduleNext = (delayMs, reason) => {
    timer = setTimeout(async () => {
      if (stopped) return
      try {
        await runSportsCacheAutofill({
          ...options,
          reason,
          runtimeDir: config.runtimeDir
        })
      } catch (_) {
        // runSportsCacheAutofill already logged the failure
      }

      if (stopped) return
      scheduleNext(config.intervalMs, 'scheduled')
    }, Math.max(1000, Number(delayMs || 0)))

    if (typeof timer.unref === 'function') timer.unref()
  }

  logger.log(`[cache:sports:auto] scheduled: ${describeSportsCacheAutofill(config)}`)
  scheduleNext(config.initialDelayMs, normalizeSpace(options.reason) || 'startup')

  schedulerController = {
    config,
    stop() {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      schedulerController = null
    }
  }

  return schedulerController
}

module.exports = {
  DEFAULT_EVENT_LEAGUE_LIMIT,
  DEFAULT_IMAGE_CONCURRENCY,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_SCHEDULE_DAYS,
  DEFAULT_TARGETS_PER_RUN,
  DEFAULT_TEAM_LIMIT_PER_SPORT,
  STATE_FILE_NAME,
  describeSportsCacheAutofill,
  formatDurationCompact,
  getSportsCacheAutofillStatePath,
  loadSportsCacheAutofillState,
  pickSportsCacheAutofillTargets,
  resolveSportsCacheApiKey,
  resolveSportsCacheAutofillConfig,
  runSportsCacheAutofill,
  saveSportsCacheAutofillState,
  startSportsCacheAutofill
}
