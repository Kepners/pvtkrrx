#!/usr/bin/env node

const { SPORT_CATS } = require('../src/config/categories')
const {
  buildSportsPrewarmJobs,
  prewarmSportsCatalogIndex
} = require('../src/utils/sportsCatalogPrewarm')

const SECRET_PARAM_RE = /([?&](?:apikey|api_key|passkey|pid|token|key|password|secret)=)[^&#\s"]+/ig
const MAGNET_RE = /magnet:\?[^\s"]+/ig
const DOWNLOAD_URL_RE = /https?:\/\/[^\s"]*(?:\/download\/|torznab|apikey=|api_key=|passkey=|pid=|token=|secret=)[^\s"]*/ig
const INFOHASH_RE = /\b[a-f0-9]{40}\b/ig

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    limit: 100,
    json: true
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--no-dry-run' || arg === '--run') args.dryRun = false
    else if (arg === '--limit') args.limit = Number(argv[++index] || args.limit) || args.limit
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || args.limit
    else if (arg === '--text') args.json = false
  }
  args.limit = Math.max(1, Math.min(500, Math.floor(Number(args.limit) || 100)))
  return args
}

function redactString(value = '') {
  return String(value || '')
    .replace(DOWNLOAD_URL_RE, '[redacted-download-url]')
    .replace(MAGNET_RE, '[redacted-magnet]')
    .replace(SECRET_PARAM_RE, '$1[redacted]')
    .replace(INFOHASH_RE, '[redacted-infohash]')
}

function redact(value) {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
  }
  return value
}

function envConfig() {
  return {
    jackettUrl: String(process.env.PVTKRRX_PROWLARR_URL || '').trim(),
    jackettApiKey: String(process.env.PVTKRRX_PROWLARR_API_KEY || '').trim(),
    sportsmetaBaseUrl: String(process.env.PVTKRRX_SPORTSMETA_BASE_URL || '').trim()
  }
}

function missingEnv(config) {
  const missing = []
  if (!config.jackettUrl) missing.push('PVTKRRX_PROWLARR_URL')
  if (!config.jackettApiKey) missing.push('PVTKRRX_PROWLARR_API_KEY')
  return missing
}

function buildRedactingLogger(lines) {
  return {
    log: (message) => lines.push({ level: 'log', message: redactString(message) }),
    warn: (message) => lines.push({ level: 'warn', message: redactString(message) }),
    error: (message) => lines.push({ level: 'error', message: redactString(message) })
  }
}

async function main() {
  const args = parseArgs()
  const config = envConfig()
  const missing = missingEnv(config)
  const jobs = buildSportsPrewarmJobs({ maxJobs: args.limit })
  const duplicateKeys = jobs.length - new Set(jobs.map((job) => `${job.id}|${job.extra}`)).size

  const base = {
    ok: true,
    script: 'prewarm:sports-posters',
    dryRun: args.dryRun,
    category: SPORT_CATS,
    categoryConstrained: SPORT_CATS === '5060',
    limit: args.limit,
    plannedJobs: jobs.length,
    duplicateKeys,
    sportsMetaMemberRoutes: false,
    memberTokenRequired: false,
    prowlarrConfigured: missing.length === 0
  }

  if (missing.length > 0) {
    const output = {
      ...base,
      skipped: true,
      reason: 'missing_env',
      missing,
      message: 'Missing PVTKRRX_PROWLARR_URL / PVTKRRX_PROWLARR_API_KEY; prewarm is env-gated and no network requests were made.'
    }
    process.stdout.write(`${JSON.stringify(redact(output), null, 2)}\n`)
    return
  }

  if (args.dryRun) {
    const output = {
      ...base,
      skipped: true,
      reason: 'dry_run',
      message: 'Dry run only; no Prowlarr, SportsMeta, poster, or remote cache requests were made.',
      jobs: jobs.map((job) => ({
        type: job.type,
        id: job.id,
        extra: job.extra,
        category: SPORT_CATS,
        useCategories: true
      }))
    }
    process.stdout.write(`${JSON.stringify(redact(output), null, 2)}\n`)
    return
  }

  const logLines = []
  const result = await prewarmSportsCatalogIndex(config, {
    enabled: true,
    maxJobs: args.limit,
    logger: buildRedactingLogger(logLines)
  })
  const output = {
    ...base,
    skipped: Boolean(result?.skipped),
    result,
    logLines
  }
  process.stdout.write(`${JSON.stringify(redact(output), null, 2)}\n`)
}

main().catch((error) => {
  const output = {
    ok: false,
    script: 'prewarm:sports-posters',
    error: redactString(error?.message || error)
  }
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`)
  process.exit(1)
})
