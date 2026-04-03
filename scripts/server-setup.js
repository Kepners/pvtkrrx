const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')

const { resolveRuntimeDir } = require('../src/utils/runtimeDir')
const { loadSecureJsonFile, saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const { ensureServerAdminToken } = require('../src/utils/serverAdminToken')
const { installSystemdService } = require('./install-systemd-service')

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function formatEnvValue(value) {
  const text = String(value ?? '')
  if (/[\s#"'`]/.test(text)) {
    return JSON.stringify(text)
  }
  return text
}

function updateDotEnvFile(filePath, updates) {
  const existingLines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    : []
  const pending = new Map(
    Object.entries(updates).map(([key, value]) => [String(key), String(value ?? '')])
  )

  const nextLines = existingLines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (!match) return line
    const key = match[1]
    if (!pending.has(key)) return line
    const value = pending.get(key)
    pending.delete(key)
    return `${key}=${formatEnvValue(value)}`
  })

  for (const [key, value] of pending.entries()) {
    nextLines.push(`${key}=${formatEnvValue(value)}`)
  }

  const outputBody = `${nextLines.filter((line, index, arr) => index < arr.length - 1 || line !== '').join('\n')}\n`
  fs.writeFileSync(filePath, outputBody, 'utf8')
}

function randomSecret() {
  return crypto.randomBytes(32).toString('base64url')
}

async function promptValue(rl, label, defaultValue = '', options = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  const raw = await rl.question(`${label}${suffix}: `)
  const text = String(raw || '').trim()
  if (!text) return String(defaultValue || '').trim()
  if (options.allowEmpty === true && text === '-') return ''
  return text
}

async function promptBoolean(rl, label, defaultValue = true) {
  const suffix = defaultValue ? ' [Y/n]' : ' [y/N]'
  const raw = await rl.question(`${label}${suffix}: `)
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return defaultValue
  if (['y', 'yes', 'true', '1'].includes(text)) return true
  if (['n', 'no', 'false', '0'].includes(text)) return false
  return defaultValue
}

function loadExistingServerConfig(runtimeDir, secret) {
  const configPath = path.join(runtimeDir, 'local-config.json')
  try {
    return loadSecureJsonFile(configPath, {
      defaultValue: null,
      secret
    })
  } catch (_) {
    return null
  }
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  const envPath = path.join(repoRoot, '.env')
  const envFromFile = parseDotEnvFile(envPath)
  const mergedEnv = {
    ...envFromFile,
    ...process.env
  }
  const runtimeDir = resolveRuntimeDir(mergedEnv)
  const existingSecret = String(mergedEnv.ENCRYPTION_SECRET || '').trim()
  const existingSelfHostPassword = String(
    mergedEnv.PVTKRRX_SELF_HOST_PASSWORD ||
    mergedEnv.PVTKRRX_SERVER_ADMIN_TOKEN ||
    ''
  ).trim()
  const existingConfig = loadExistingServerConfig(runtimeDir, existingSecret)

  const rl = readline.createInterface({ input, output })
  try {
    console.log('PVTKRRX server setup')
    console.log('Press Enter to keep an existing/default value. Use "-" to clear an optional field.')
    console.log('')

    const encryptionSecret = await promptValue(
      rl,
      'ENCRYPTION_SECRET',
      existingSecret || randomSecret()
    )
    const selfHostPassword = await promptValue(
      rl,
      'Self-host config password',
      existingSelfHostPassword || randomSecret()
    )
    const jackettUrl = await promptValue(
      rl,
      'Prowlarr URL',
      String(existingConfig?.jackettUrl || 'http://localhost:9696').trim()
    )
    const jackettApiKey = await promptValue(
      rl,
      'Prowlarr API key',
      String(existingConfig?.jackettApiKey || '').trim(),
      { allowEmpty: true }
    )
    const qbitUrl = await promptValue(
      rl,
      'qBittorrent URL',
      String(existingConfig?.qbitUrl || 'http://localhost:8080').trim()
    )
    const qbitUsername = await promptValue(
      rl,
      'qBittorrent username',
      String(existingConfig?.qbitUsername || '').trim(),
      { allowEmpty: true }
    )
    const qbitPassword = await promptValue(
      rl,
      'qBittorrent password',
      String(existingConfig?.qbitPassword || '').trim(),
      { allowEmpty: true }
    )
    const fileServerUrl = await promptValue(
      rl,
      'File Server URL (optional)',
      String(existingConfig?.fileServerUrl || '').trim(),
      { allowEmpty: true }
    )
    const fileServerAuth = await promptValue(
      rl,
      'File Server Authorization header (optional)',
      String(existingConfig?.fileServerAuth || '').trim(),
      { allowEmpty: true }
    )
    const sportsDbApiKey = await promptValue(
      rl,
      'TheSportsDB API key',
      String(existingConfig?.sportsDbApiKey || '123').trim()
    )
    const sportsDbCacheHours = Number.parseInt(
      await promptValue(
        rl,
        'TheSportsDB cache hours',
        String(existingConfig?.sportsDbCacheHours || 24).trim()
      ),
      10
    ) || 24
    const maxResults = Number.parseInt(
      await promptValue(
        rl,
        'Max results per search',
        String(existingConfig?.maxResults || 50).trim()
      ),
      10
    ) || 50
    const autoDeleteWatched = await promptBoolean(
      rl,
      'Auto-delete watched torrents/files',
      existingConfig?.autoDeleteWatched !== false
    )
    const watchedDeleteGraceSeconds = Number.parseInt(
      await promptValue(
        rl,
        'Delete grace period seconds',
        String(existingConfig?.watchedDeleteGraceSeconds ?? 300).trim()
      ),
      10
    ) || 0
    const installService = process.platform === 'linux'
      ? await promptBoolean(rl, 'Install/start systemd service for auto-boot', true)
      : false

    updateDotEnvFile(envPath, {
      ENCRYPTION_SECRET: encryptionSecret,
      PVTKRRX_SELF_HOST_PASSWORD: selfHostPassword,
      PVTKRRX_SERVER_ADMIN_TOKEN: selfHostPassword,
      PVTKRRX_SELF_HOST_MODE: 'true'
    })

    process.env.ENCRYPTION_SECRET = encryptionSecret
    process.env.PVTKRRX_SELF_HOST_PASSWORD = selfHostPassword
    process.env.PVTKRRX_SERVER_ADMIN_TOKEN = selfHostPassword
    process.env.PVTKRRX_SELF_HOST_MODE = 'true'
    if (mergedEnv.PVTKRRX_RUNTIME_DIR) {
      process.env.PVTKRRX_RUNTIME_DIR = mergedEnv.PVTKRRX_RUNTIME_DIR
    }

    const {
      normalizeAddonConfig
    } = require('../src/lib/shared')

    const localConfigPath = path.join(runtimeDir, 'local-config.json')
    const nextConfig = normalizeAddonConfig({
      ...(existingConfig && typeof existingConfig === 'object' ? existingConfig : {}),
      jackettUrl,
      jackettApiKey,
      qbitUrl,
      qbitUsername,
      qbitPassword,
      provider: String(existingConfig?.provider || 'custom').trim() || 'custom',
      fileServerUrl,
      fileServerAuth,
      sportsDbApiKey,
      sportsDbCacheHours: Math.max(1, Math.min(168, sportsDbCacheHours)),
      maxResults: Math.max(10, Math.min(200, maxResults)),
      autoDeleteWatched,
      watchedDeleteGraceSeconds: Math.max(0, watchedDeleteGraceSeconds),
      lanPairEnabled: false,
      lanPairRequired: false
    }, {
      includeLocalSecrets: true
    })

    saveSecureJsonFile(localConfigPath, nextConfig, { secret: encryptionSecret })
    const adminState = ensureServerAdminToken(runtimeDir, {
      env: process.env,
      createIfMissing: true
    })
    const configureBootstrapUrl = `http://localhost:${process.env.PORT || '7000'}/configure#serverPassword=${encodeURIComponent(adminState.token)}&serverAdminToken=${encodeURIComponent(adminState.token)}`

    let serviceResult = null
    if (installService) {
      try {
        serviceResult = installSystemdService({ repoRoot })
      } catch (error) {
        console.warn(`systemd install skipped: ${error.message}`)
      }
    }

    console.log('')
    console.log('PVTKRRX server setup complete')
    console.log(`Runtime directory: ${runtimeDir}`)
    console.log(`Saved config: ${localConfigPath}`)
    console.log(`Self-host password file: ${adminState.path || path.join(runtimeDir, 'server-admin-token')}`)
    console.log(`Configure page: http://localhost:${process.env.PORT || '7000'}/configure`)
    console.log(`Bootstrap page: ${configureBootstrapUrl}`)
    console.log('Stable self-host manifest: /selfhost/manifest.json?mode=hosted')
    if (serviceResult) {
      console.log(`systemd service: ${serviceResult.serviceName}.service`)
      console.log(`Service unit: ${serviceResult.unitPath}`)
      console.log(`Service user: ${serviceResult.user}`)
    } else if (process.platform === 'linux') {
      console.log('Auto-boot: run `npm run server:install-service` later if you want systemd startup.')
    }
    console.log('You can re-run `npm run server:setup` any time, or open /configure and finish the remaining fields there.')
  } finally {
    rl.close()
  }
}

run().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
