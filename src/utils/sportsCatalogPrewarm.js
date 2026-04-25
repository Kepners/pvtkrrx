const { SPORTS_DISCOVERY_CATALOGS, getSportsSearchSeedTerms } = require('../config/sportsCatalogs')
const { handleCatalog } = require('../handlers/catalog')
const {
  getSportsIdentityBackfillStats,
  waitForSportsIdentityBackfillIdle
} = require('./sportsIdentityBackfill')

let prewarmPromise = null
let recurringTimer = null

function parseBooleanEnv(value, fallback = false) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(1|true|yes|on)$/i.test(text)) return true
  if (/^(0|false|no|off)$/i.test(text)) return false
  return fallback
}

function hasSportsProviderConfig(config = {}) {
  return Boolean(
    String(config?.jackettUrl || '').trim() &&
    String(config?.jackettApiKey || '').trim()
  )
}

function mapLimit(items, limit, mapper) {
  const source = Array.isArray(items) ? items : []
  const out = new Array(source.length)
  let index = 0

  async function worker() {
    while (true) {
      const current = index++
      if (current >= source.length) return
      out[current] = await mapper(source[current], current)
    }
  }

  return Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()))
    .then(() => out)
}

function addPrewarmJob(jobs, seen, catalogId, extra = '') {
  const id = String(catalogId || '').trim()
  if (!id) return
  const suffix = String(extra || '').trim()
  const key = `${id}|${suffix}`
  if (seen.has(key)) return
  seen.add(key)
  jobs.push({
    type: 'sports',
    id,
    extra: suffix
  })
}

function buildSportsPrewarmJobs(options = {}) {
  const maxJobs = Math.max(
    1,
    Number(options.maxJobs || process.env.PVTKRRX_SPORTS_PREWARM_MAX_JOBS || 24) || 24
  )
  const jobs = []
  const seen = new Set()
  const seedTerms = []
  const seedSeen = new Set()
  const allSportsCatalog = SPORTS_DISCOVERY_CATALOGS.find((catalog) => catalog.id === 'pvtkrrx-sports')

  addPrewarmJob(jobs, seen, 'pvtkrrx-sports')

  const highPriorityTerms = [
    ...(Array.isArray(allSportsCatalog?.detailOptions) ? allSportsCatalog.detailOptions : []),
    ...(Array.isArray(allSportsCatalog?.seedTerms) ? allSportsCatalog.seedTerms : [])
  ]
  for (const term of highPriorityTerms) {
    const cleanTerm = String(term || '').trim()
    const key = cleanTerm.toLowerCase()
    if (!cleanTerm || seedSeen.has(key)) continue
    seedSeen.add(key)
    addPrewarmJob(jobs, seen, 'pvtkrrx-sports', `search=${encodeURIComponent(cleanTerm)}`)
  }

  for (const catalog of SPORTS_DISCOVERY_CATALOGS) {
    addPrewarmJob(jobs, seen, catalog.id)
  }

  for (const catalog of SPORTS_DISCOVERY_CATALOGS) {
    for (const term of getSportsSearchSeedTerms(catalog.sportHint)) {
      const cleanTerm = String(term || '').trim()
      const key = cleanTerm.toLowerCase()
      if (!cleanTerm || seedSeen.has(key)) continue
      seedSeen.add(key)
      seedTerms.push(cleanTerm)
    }
  }

  for (const term of seedTerms) {
    addPrewarmJob(jobs, seen, 'pvtkrrx-sports', `search=${encodeURIComponent(term)}`)
  }

  for (const catalog of SPORTS_DISCOVERY_CATALOGS) {
    for (const term of getSportsSearchSeedTerms(catalog.sportHint)) {
      addPrewarmJob(jobs, seen, catalog.id, `search=${encodeURIComponent(term)}`)
    }
  }

  return jobs.slice(0, maxJobs)
}

async function prewarmSportsCatalogIndex(config = {}, options = {}) {
  const logger = options.logger || console
  const enabled = options.enabled === true
  const reason = String(options.reason || 'manual').trim() || 'manual'
  if (!enabled) return { skipped: true, reason: 'disabled' }
  if (!hasSportsProviderConfig(config)) return { skipped: true, reason: 'missing_prowlarr_config' }

  const jobs = buildSportsPrewarmJobs(options)
  const concurrency = Math.max(
    1,
    Number(options.concurrency || process.env.PVTKRRX_SPORTS_PREWARM_CONCURRENCY || 1) || 1
  )
  const backfillWaitMs = Math.max(
    0,
    Number(options.backfillWaitMs || process.env.PVTKRRX_SPORTS_PREWARM_BACKFILL_WAIT_MS || 30000) || 30000
  )
  const started = Date.now()
  const beforeStats = getSportsIdentityBackfillStats()

  if (logger?.log) {
    logger.log(`[sports-prewarm] starting reason=${reason} jobs=${jobs.length} concurrency=${concurrency}`)
  }

  const results = await mapLimit(jobs, concurrency, async (job) => {
    const jobStart = Date.now()
    try {
      const result = await handleCatalog(config, job.type, job.id, job.extra, {
        baseUrl: ''
      })
      return {
        ok: true,
        id: job.id,
        extra: job.extra,
        metas: Array.isArray(result?.metas) ? result.metas.length : 0,
        ms: Date.now() - jobStart
      }
    } catch (error) {
      return {
        ok: false,
        id: job.id,
        extra: job.extra,
        error: String(error?.message || error || '').trim(),
        ms: Date.now() - jobStart
      }
    }
  })

  const afterCatalogStats = getSportsIdentityBackfillStats()
  const afterBackfillStats = await waitForSportsIdentityBackfillIdle({
    timeoutMs: backfillWaitMs
  })
  const ok = results.filter((result) => result?.ok).length
  const failed = results.length - ok
  const metas = results.reduce((count, result) => count + (Number(result?.metas || 0) || 0), 0)
  const elapsed = Date.now() - started

  if (logger?.log) {
    logger.log(
      `[sports-prewarm] finished reason=${reason} jobs=${results.length} ok=${ok} failed=${failed} metas=${metas} ` +
      `cacheBefore=${beforeStats.cacheEntries} cacheAfter=${afterBackfillStats.cacheEntries} ` +
      `queuedAfterCatalog=${afterCatalogStats.queueEntries + afterCatalogStats.activeWorkers} ` +
      `remainingQueue=${afterBackfillStats.queueEntries + afterBackfillStats.activeWorkers} ms=${elapsed}`
    )
  }

  if (failed > 0 && logger?.warn) {
    const sample = results.find((result) => result && !result.ok)
    logger.warn(`[sports-prewarm] ${failed} job(s) failed; first=${sample?.id || ''} ${sample?.extra || ''} ${sample?.error || ''}`.trim())
  }

  return {
    skipped: false,
    jobs: results.length,
    ok,
    failed,
    metas,
    elapsed,
    beforeStats,
    afterCatalogStats,
    afterBackfillStats
  }
}

function scheduleSportsCatalogPrewarm(config = {}, logger = console, reason = 'boot', options = {}) {
  const defaultEnabled = options.defaultEnabled === true
  const enabled = parseBooleanEnv(process.env.PVTKRRX_SPORTS_PREWARM, defaultEnabled)
  if (!enabled || !hasSportsProviderConfig(config)) return Promise.resolve({ skipped: true })

  const delayMs = Math.max(
    0,
    Number(options.delayMs ?? process.env.PVTKRRX_SPORTS_PREWARM_DELAY_MS ?? 60000) || 60000
  )
  const intervalMs = Math.max(
    0,
    Number(options.intervalMs ?? process.env.PVTKRRX_SPORTS_PREWARM_INTERVAL_MS ?? 3600000) || 3600000
  )

  const run = (runReason) => {
    if (prewarmPromise) return prewarmPromise
    prewarmPromise = prewarmSportsCatalogIndex(config, {
      ...options,
      enabled: true,
      logger,
      reason: runReason
    }).catch((error) => {
      if (logger?.warn) logger.warn(`[sports-prewarm] failed reason=${runReason}: ${error.message}`)
      return { skipped: false, failed: true, error: error.message }
    }).finally(() => {
      prewarmPromise = null
    })
    return prewarmPromise
  }

  const timer = setTimeout(() => run(reason), delayMs)
  if (typeof timer.unref === 'function') timer.unref()

  if (intervalMs > 0 && !recurringTimer) {
    recurringTimer = setInterval(() => run('interval'), intervalMs)
    if (typeof recurringTimer.unref === 'function') recurringTimer.unref()
  }

  return Promise.resolve({ scheduled: true, delayMs, intervalMs })
}

module.exports = {
  buildSportsPrewarmJobs,
  prewarmSportsCatalogIndex,
  scheduleSportsCatalogPrewarm
}
