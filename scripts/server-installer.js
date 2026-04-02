const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')
const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')

const { loadSecureJsonFile, saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const { ensureServerAdminToken } = require('../src/utils/serverAdminToken')
const { discoverProwlarrConfig, discoverQbitConfig } = require('../src/utils/provision')
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

  const body = `${nextLines.filter((line, index, arr) => index < arr.length - 1 || line !== '').join('\n')}\n`
  fs.writeFileSync(filePath, body, 'utf8')
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function normalizeBaseUrl(input) {
  return String(input || '').trim().replace(/\/+$/, '')
}

function parseHttpUrl(input, options = {}) {
  const {
    allowEmpty = false,
    requireHttps = false,
    allowLoopbackHttp = false
  } = options
  const text = normalizeBaseUrl(input)
  if (!text) {
    if (allowEmpty) return null
    throw new Error('Value is required')
  }

  let parsed
  try {
    parsed = new URL(text)
  } catch (_) {
    throw new Error('Enter a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http:// or https://')
  }

  const hostname = String(parsed.hostname || '').trim().toLowerCase()
  if (
    requireHttps &&
    parsed.protocol !== 'https:' &&
    !(allowLoopbackHttp && hostname === '127.0.0.1')
  ) {
    throw new Error('This value must use https://')
  }

  return parsed
}

function normalizeOrigin(input) {
  const parsed = parseHttpUrl(input, { allowEmpty: true, allowLoopbackHttp: true })
  return parsed ? normalizeBaseUrl(parsed.origin) : ''
}

function normalizeOriginList(input) {
  const items = String(input || '')
    .split(',')
    .map(part => normalizeOrigin(part))
    .filter(Boolean)
  return [...new Set(items)].join(', ')
}

function buildDefaultAllowedOrigins(publicBaseUrl, httpPort, httpsPort, existingValue = '') {
  const preferred = normalizeOriginList(existingValue)
  if (preferred) return preferred

  const next = []
  const publicOrigin = normalizeOrigin(publicBaseUrl)
  if (publicOrigin) next.push(publicOrigin)
  next.push(`http://localhost:${httpPort}`)
  next.push(`http://127.0.0.1:${httpPort}`)
  next.push(`https://localhost:${httpsPort}`)
  next.push(`https://127.0.0.1:${httpsPort}`)
  return [...new Set(next)].join(', ')
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

async function promptHttpUrl(rl, label, defaultValue = '', options = {}) {
  while (true) {
    const value = await promptValue(rl, label, defaultValue, {
      allowEmpty: options.allowEmpty === true
    })
    try {
      const parsed = parseHttpUrl(value, options)
      return parsed ? normalizeBaseUrl(parsed.toString()) : ''
    } catch (error) {
      console.log(error.message)
    }
  }
}

async function promptInteger(rl, label, defaultValue, options = {}) {
  const min = Number.isFinite(options.min) ? options.min : 1
  const max = Number.isFinite(options.max) ? options.max : Number.MAX_SAFE_INTEGER
  while (true) {
    const raw = await promptValue(rl, label, String(defaultValue || ''))
    const value = Number.parseInt(String(raw || '').trim(), 10)
    if (!Number.isFinite(value) || value < min || value > max) {
      console.log(`Enter a whole number between ${min} and ${max}.`)
      continue
    }
    return value
  }
}

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [command], { stdio: 'ignore' })
    : spawnSync('which', [command], { stdio: 'ignore' })
  return probe.status === 0
}

function runAsRoot(command, args, options = {}) {
  const execOptions = {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || process.cwd()
  }

  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    execFileSync(command, args, execOptions)
    return
  }

  if (!commandExists('sudo')) {
    throw new Error(`Root access is required to run ${command}. Re-run this command with sudo.`)
  }

  execFileSync('sudo', [command, ...args], execOptions)
}

function lookupUserGroup(user) {
  const username = String(user || '').trim()
  if (!username) throw new Error('Service user is required')
  const uid = execFileSync('id', ['-u', username], { encoding: 'utf8' }).trim()
  const gid = execFileSync('id', ['-gn', username], { encoding: 'utf8' }).trim()
  return {
    user: username,
    uid: Number.parseInt(uid, 10),
    group: gid
  }
}

function ensureOwnership(targetPath, user, repoRoot) {
  if (process.platform !== 'linux' || !targetPath || !user) return
  if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true })
  const owner = lookupUserGroup(user)
  runAsRoot('chown', ['-R', `${owner.user}:${owner.group}`, targetPath], { cwd: repoRoot })
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

function runFullBootstrap(repoRoot) {
  const scriptPath = path.join(repoRoot, 'scripts', 'install-selfhost.sh')
  const result = spawnSync('bash', [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (Number(result.status || 0) !== 0) {
    throw new Error(`Self-host bootstrap exited with code ${Number(result.status || 1)}`)
  }
}

function defaultServiceUser() {
  return String(
    process.env.PVTKRRX_SERVICE_USER ||
    process.env.SUDO_USER ||
    process.env.USER ||
    os.userInfo().username
  ).trim()
}

function defaultServiceName() {
  return String(
    process.env.PVTKRRX_SYSTEMD_SERVICE_NAME ||
    'pvtkrrx'
  ).trim() || 'pvtkrrx'
}

function deriveDisplayOrigin(publicBaseUrl, port) {
  const publicOrigin = normalizeOrigin(publicBaseUrl)
  if (publicOrigin) return publicOrigin
  return `http://localhost:${port}`
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  const envPath = path.join(repoRoot, '.env')
  const envFromFile = parseDotEnvFile(envPath)
  const defaultRuntimeDir = String(
    envFromFile.PVTKRRX_RUNTIME_DIR ||
    process.env.PVTKRRX_RUNTIME_DIR ||
    path.join(repoRoot, 'data', 'pvtkrrx')
  ).trim()
  const mergedEnv = {
    ...envFromFile,
    ...process.env,
    PVTKRRX_RUNTIME_DIR: defaultRuntimeDir
  }
  const existingSecret = String(mergedEnv.ENCRYPTION_SECRET || '').trim()
  const existingAuthSecret = String(mergedEnv.AUTH_TOKEN_SECRET || '').trim()
  const existingPort = Number.parseInt(String(mergedEnv.PORT || '7000').trim(), 10) || 7000
  const existingHttpsPort = Number.parseInt(String(mergedEnv.HTTPS_PORT || '7001').trim(), 10) || 7001
  const existingPublicBaseUrl = normalizeBaseUrl(mergedEnv.PVTKRRX_PUBLIC_BASE_URL || '')
  const existingConfig = loadExistingServerConfig(defaultRuntimeDir, existingSecret)
  const bundledNodePath = String(process.env.PVTKRRX_NODE_PATH || process.execPath).trim() || process.execPath

  const rl = readline.createInterface({ input, output })
  try {
    console.log('PVTKRRX server installer')
    console.log('This installer writes a stable self-host config, server admin token, and optional systemd service.')
    console.log('Press Enter to keep an existing/default value. Use "-" to clear an optional field.')
    console.log('')

    const prowlarr = await discoverProwlarrConfig({ useHints: false })
    const qbit = await discoverQbitConfig({ useHints: false })
    const missingProviders = !prowlarr.installed || !prowlarr.apiKey || !qbit.installed
    if (process.platform === 'linux' && missingProviders) {
      const installBootstrap = await promptBoolean(
        rl,
        'Prowlarr and/or qBittorrent are missing. Run the full bootstrap now to install them automatically?',
        true
      )
      if (installBootstrap) {
        rl.close()
        runFullBootstrap(repoRoot)
        return
      }
      console.log('Continuing with manual values. Install Prowlarr and qBittorrent first if you want automatic detection.')
      console.log('')
    }

    const encryptionSecret = await promptValue(
      rl,
      'ENCRYPTION_SECRET',
      existingSecret || randomSecret()
    )
    const authTokenSecret = await promptValue(
      rl,
      'AUTH_TOKEN_SECRET',
      existingAuthSecret || randomSecret()
    )
    const httpPort = await promptInteger(rl, 'HTTP port', existingPort, { min: 1, max: 65535 })
    const httpsPort = await promptInteger(rl, 'HTTPS port', existingHttpsPort, { min: 1, max: 65535 })
    const runtimeDir = await promptValue(rl, 'Runtime directory', defaultRuntimeDir)
    const publicBaseUrl = await promptHttpUrl(
      rl,
      'Public HTTPS URL for Stremio install links (optional)',
      existingPublicBaseUrl,
      {
        allowEmpty: true,
        requireHttps: true
      }
    )
    const allowedWebOrigins = normalizeOriginList(await promptValue(
      rl,
      'Allowed browser origins (comma separated, optional)',
      buildDefaultAllowedOrigins(
        publicBaseUrl,
        httpPort,
        httpsPort,
        String(mergedEnv.PVTKRRX_ALLOWED_WEB_ORIGINS || '').trim()
      ),
      { allowEmpty: true }
    ))

    const jackettUrl = await promptHttpUrl(
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
    const qbitUrl = await promptHttpUrl(
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
    const fileServerUrl = await promptHttpUrl(
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
    const sportsDbCacheHours = await promptInteger(
      rl,
      'TheSportsDB cache hours',
      String(existingConfig?.sportsDbCacheHours || 24).trim(),
      { min: 1, max: 168 }
    )
    const maxResults = await promptInteger(
      rl,
      'Max results per search',
      String(existingConfig?.maxResults || 50).trim(),
      { min: 10, max: 200 }
    )
    const autoDeleteWatched = await promptBoolean(
      rl,
      'Auto-delete watched torrents/files',
      existingConfig?.autoDeleteWatched !== false
    )
    const watchedDeleteGraceSeconds = await promptInteger(
      rl,
      'Delete grace period seconds',
      String(existingConfig?.watchedDeleteGraceSeconds ?? 300).trim(),
      { min: 0, max: 86400 * 30 }
    )

    let installService = false
    let serviceName = defaultServiceName()
    let serviceUser = defaultServiceUser()
    if (process.platform === 'linux') {
      installService = await promptBoolean(rl, 'Install/start systemd service for auto-boot', true)
      if (installService) {
        serviceName = await promptValue(rl, 'systemd service name', serviceName)
        serviceUser = await promptValue(rl, 'systemd service user', serviceUser)
      }
    }

    updateDotEnvFile(envPath, {
      ENCRYPTION_SECRET: encryptionSecret,
      AUTH_TOKEN_SECRET: authTokenSecret,
      PVTKRRX_SELF_HOST_MODE: 'true',
      PVTKRRX_RUNTIME_DIR: runtimeDir,
      PVTKRRX_PUBLIC_BASE_URL: publicBaseUrl,
      PVTKRRX_ALLOWED_WEB_ORIGINS: allowedWebOrigins,
      PORT: String(httpPort),
      HTTPS_PORT: String(httpsPort)
    })

    process.env.ENCRYPTION_SECRET = encryptionSecret
    process.env.AUTH_TOKEN_SECRET = authTokenSecret
    process.env.PVTKRRX_SELF_HOST_MODE = 'true'
    process.env.PVTKRRX_RUNTIME_DIR = runtimeDir
    process.env.PVTKRRX_PUBLIC_BASE_URL = publicBaseUrl
    process.env.PVTKRRX_ALLOWED_WEB_ORIGINS = allowedWebOrigins
    process.env.PORT = String(httpPort)
    process.env.HTTPS_PORT = String(httpsPort)

    const { normalizeAddonConfig } = require('../src/lib/shared')

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
      sportsDbCacheHours,
      maxResults,
      autoDeleteWatched,
      watchedDeleteGraceSeconds,
      lanPairEnabled: false,
      lanPairRequired: false
    }, {
      includeLocalSecrets: true
    })

    const localConfigPath = path.join(runtimeDir, 'local-config.json')
    saveSecureJsonFile(localConfigPath, nextConfig, { secret: encryptionSecret })
    const adminState = ensureServerAdminToken(runtimeDir, {
      env: process.env,
      createIfMissing: true
    })

    let serviceResult = null
    if (installService) {
      ensureOwnership(runtimeDir, serviceUser, repoRoot)
      try {
        serviceResult = installSystemdService({
          repoRoot,
          nodePath: bundledNodePath,
          serviceName,
          user: serviceUser
        })
      } catch (error) {
        console.warn(`systemd install skipped: ${error.message}`)
      }
    }

    const displayOrigin = deriveDisplayOrigin(publicBaseUrl, httpPort)
    console.log('')
    console.log('PVTKRRX server install complete')
    console.log(`App directory: ${repoRoot}`)
    console.log(`Runtime directory: ${runtimeDir}`)
    console.log(`Saved config: ${localConfigPath}`)
    console.log(`Server admin token file: ${adminState.path || path.join(runtimeDir, 'server-admin-token')}`)
    console.log(`Configure URL: ${displayOrigin}/configure`)
    console.log(`Self-host manifest: ${displayOrigin}/selfhost/manifest.json?mode=hosted`)
    if (publicBaseUrl) {
      console.log(`Public install base: ${publicBaseUrl}`)
      console.log(`Allowed web origins: ${allowedWebOrigins || '(none)'}`)
    } else {
      console.log('Public install base: not set')
      console.log('Remote Stremio installs need a real HTTPS origin. Add one later by setting PVTKRRX_PUBLIC_BASE_URL in .env and restarting the service.')
    }
    console.log(`HTTP port: ${httpPort}`)
    console.log(`HTTPS port: ${httpsPort}`)
    console.log(`Node binary: ${bundledNodePath}`)
    if (serviceResult) {
      console.log(`systemd service: ${serviceResult.serviceName}.service`)
      console.log(`Service unit: ${serviceResult.unitPath}`)
      console.log(`Service user: ${serviceResult.user}`)
    } else if (process.platform === 'linux') {
      console.log('Auto-boot: run `npm run server:install-service` later if you want systemd startup.')
    }
  } finally {
    rl.close()
  }
}

// ─── Auto-detection ────────────────────────────────────────────────

function findProwlarrConfig() {
  const prowlarrDataDir = String(process.env.PVTKRRX_PROWLARR_DATA || '').trim()
  const candidates = [
    prowlarrDataDir ? path.join(prowlarrDataDir, 'config.xml') : null,
    '/var/lib/prowlarr/config.xml',
    path.join(os.homedir(), '.config', 'Prowlarr', 'config.xml'),
    '/opt/Prowlarr/config.xml'
  ].filter(Boolean)

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function parseProwlarrConfigXml(configPath) {
  const xml = fs.readFileSync(configPath, 'utf8')
  const apiKey = (xml.match(/<ApiKey>([^<]+)<\/ApiKey>/) || [])[1] || ''
  const port = (xml.match(/<Port>([^<]+)<\/Port>/) || [])[1] || '9696'
  return { apiKey: apiKey.trim(), port: Number.parseInt(port.trim(), 10) || 9696 }
}

function findQbitConfig() {
  const qbitUser = String(process.env.PVTKRRX_QBIT_USER || 'qbittorrent').trim()
  const candidates = [
    `/var/lib/${qbitUser}/.config/qBittorrent/qBittorrent.conf`,
    path.join(os.homedir(), '.config', 'qBittorrent', 'qBittorrent.conf'),
    `/home/${qbitUser}/.config/qBittorrent/qBittorrent.conf`
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function parseQbitConfig(configPath) {
  const ini = fs.readFileSync(configPath, 'utf8')
  const portMatch = ini.match(/WebUI\\Port=(\d+)/) || ini.match(/web_ui_port=(\d+)/i)
  const usernameMatch = ini.match(/WebUI\\Username=(.+)/)
  const savePathMatch = ini.match(/Session\\DefaultSavePath=(.+)/)

  return {
    port: portMatch ? Number.parseInt(portMatch[1], 10) : null,
    username: usernameMatch ? usernameMatch[1].trim() : '',
    savePath: savePathMatch ? savePathMatch[1].trim() : ''
  }
}

async function runAuto() {
  const repoRoot = path.resolve(__dirname, '..')
  const envPath = path.join(repoRoot, '.env')
  const envFromFile = parseDotEnvFile(envPath)
  const defaultRuntimeDir = String(
    envFromFile.PVTKRRX_RUNTIME_DIR ||
    process.env.PVTKRRX_RUNTIME_DIR ||
    path.join(repoRoot, 'data', 'pvtkrrx')
  ).trim()
  const mergedEnv = { ...envFromFile, ...process.env, PVTKRRX_RUNTIME_DIR: defaultRuntimeDir }
  const existingSecret = String(mergedEnv.ENCRYPTION_SECRET || '').trim()
  const existingAuthSecret = String(mergedEnv.AUTH_TOKEN_SECRET || '').trim()
  const existingConfig = loadExistingServerConfig(defaultRuntimeDir, existingSecret)
  const bundledNodePath = String(process.env.PVTKRRX_NODE_PATH || process.execPath).trim() || process.execPath
  const httpPort = Number.parseInt(String(mergedEnv.PORT || '7000').trim(), 10) || 7000
  const httpsPort = Number.parseInt(String(mergedEnv.HTTPS_PORT || '7001').trim(), 10) || 7001
  const existingPublicBaseUrl = normalizeBaseUrl(mergedEnv.PVTKRRX_PUBLIC_BASE_URL || '')

  console.log('PVTKRRX auto-configuration')
  console.log('')

  const prowlarr = await discoverProwlarrConfig({ useHints: false })
  const qbit = await discoverQbitConfig({ useHints: false })

  let jackettUrl = String(existingConfig?.jackettUrl || prowlarr.url || 'http://localhost:9696').trim()
  let jackettApiKey = String(existingConfig?.jackettApiKey || prowlarr.apiKey || '').trim()
  let qbitUrl = String(existingConfig?.qbitUrl || qbit.url || 'http://localhost:8080').trim()
  let qbitUsername = String(existingConfig?.qbitUsername || qbit.username || '').trim()
  let qbitPassword = String(existingConfig?.qbitPassword || '').trim()

  if (prowlarr.configPath) {
    console.log(`✓ Prowlarr detected at ${prowlarr.configPath}`)
    console.log(`  URL: ${jackettUrl}`)
    if (jackettApiKey) console.log(`  API key: ${jackettApiKey.slice(0, 8)}...`)
  } else {
    console.log('⚠ Prowlarr config not found, using default URL. Configure later via /configure.')
  }

  if (qbit.configPath) {
    console.log(`✓ qBittorrent detected at ${qbit.configPath}`)
    console.log(`  URL: ${qbitUrl}`)
    if (qbitUsername) console.log(`  Username: ${qbitUsername}`)
    if (qbit.savePath) console.log(`  Save path: ${qbit.savePath}`)
    if (qbit.localHostAuthDisabled) console.log('  Localhost auth: disabled')
  } else {
    console.log('⚠ qBittorrent config not found, using default URL. Configure later via /configure.')
  }

  // ── Secrets ──
  const encryptionSecret = existingSecret || randomSecret()
  const authTokenSecret = existingAuthSecret || randomSecret()

  // ── Write .env ──
  const allowedWebOrigins = normalizeOriginList(
    String(mergedEnv.PVTKRRX_ALLOWED_WEB_ORIGINS || '').trim() ||
    buildDefaultAllowedOrigins(existingPublicBaseUrl, httpPort, httpsPort)
  )

  updateDotEnvFile(envPath, {
    ENCRYPTION_SECRET: encryptionSecret,
    AUTH_TOKEN_SECRET: authTokenSecret,
    PVTKRRX_SELF_HOST_MODE: 'true',
    PVTKRRX_RUNTIME_DIR: defaultRuntimeDir,
    PVTKRRX_PUBLIC_BASE_URL: existingPublicBaseUrl,
    PVTKRRX_ALLOWED_WEB_ORIGINS: allowedWebOrigins,
    PORT: String(httpPort),
    HTTPS_PORT: String(httpsPort)
  })

  // ── Set process env for normalizeAddonConfig ──
  process.env.ENCRYPTION_SECRET = encryptionSecret
  process.env.AUTH_TOKEN_SECRET = authTokenSecret
  process.env.PVTKRRX_SELF_HOST_MODE = 'true'
  process.env.PVTKRRX_RUNTIME_DIR = defaultRuntimeDir
  process.env.PORT = String(httpPort)
  process.env.HTTPS_PORT = String(httpsPort)

  // ── Write local config ──
  const { normalizeAddonConfig } = require('../src/lib/shared')

  const nextConfig = normalizeAddonConfig({
    ...(existingConfig && typeof existingConfig === 'object' ? existingConfig : {}),
    jackettUrl,
    jackettApiKey,
    qbitUrl,
    qbitUsername,
    qbitPassword,
    provider: String(existingConfig?.provider || 'custom').trim() || 'custom',
    fileServerUrl: String(existingConfig?.fileServerUrl || '').trim(),
    fileServerAuth: String(existingConfig?.fileServerAuth || '').trim(),
    sportsDbApiKey: String(existingConfig?.sportsDbApiKey || '123').trim(),
    sportsDbCacheHours: existingConfig?.sportsDbCacheHours || 24,
    maxResults: existingConfig?.maxResults || 50,
    autoDeleteWatched: existingConfig?.autoDeleteWatched !== false,
    watchedDeleteGraceSeconds: existingConfig?.watchedDeleteGraceSeconds ?? 300,
    lanPairEnabled: false,
    lanPairRequired: false
  }, { includeLocalSecrets: true })

  fs.mkdirSync(defaultRuntimeDir, { recursive: true })
  const localConfigPath = path.join(defaultRuntimeDir, 'local-config.json')
  saveSecureJsonFile(localConfigPath, nextConfig, { secret: encryptionSecret })
  const adminState = ensureServerAdminToken(defaultRuntimeDir, {
    env: process.env,
    createIfMissing: true
  })

  console.log('')
  console.log(`✓ Config saved to ${localConfigPath}`)
  console.log(`✓ Admin token: ${fs.readFileSync(adminState.path, 'utf8').trim()}`)

  // ── systemd service ──
  let serviceResult = null
  if (process.platform === 'linux') {
    const serviceName = defaultServiceName()
    const serviceUser = defaultServiceUser()
    ensureOwnership(defaultRuntimeDir, serviceUser, repoRoot)
    try {
      serviceResult = installSystemdService({
        repoRoot,
        nodePath: bundledNodePath,
        serviceName,
        user: serviceUser
      })
      console.log(`✓ systemd service: ${serviceResult.serviceName}.service (${serviceResult.unitPath})`)
    } catch (error) {
      console.warn(`⚠ systemd install skipped: ${error.message}`)
    }
  }

  const displayOrigin = deriveDisplayOrigin(existingPublicBaseUrl, httpPort)
  console.log('')
  console.log('─── Summary ───')
  console.log(`Prowlarr:    ${jackettUrl}`)
  console.log(`qBittorrent: ${qbitUrl}`)
  console.log(`Configure:   ${displayOrigin}/configure`)
  console.log(`Manifest:    ${displayOrigin}/selfhost/manifest.json?mode=hosted`)
  console.log(`HTTP port:   ${httpPort}`)
  console.log(`Node binary: ${bundledNodePath}`)
  if (existingPublicBaseUrl) {
    console.log(`Public URL:  ${existingPublicBaseUrl}`)
  } else {
    console.log('Public URL:  not set (add PVTKRRX_PUBLIC_BASE_URL to .env for Stremio HTTPS installs)')
  }
}

if (require.main === module) {
  const isAuto = process.argv.includes('--auto')
  const entry = isAuto ? runAuto : run
  entry().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  buildDefaultAllowedOrigins,
  defaultServiceName,
  defaultServiceUser,
  normalizeOrigin,
  normalizeOriginList,
  parseDotEnvFile,
  parseHttpUrl,
  updateDotEnvFile
}
