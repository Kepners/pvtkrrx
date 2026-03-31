const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, clipboard, screen, powerMonitor, powerSaveBlocker } = require('electron')
const pkg = require('../package.json')
const { deriveDefaultLocalHostname, normalizeLocalHostname } = require('../src/utils/lanAlias')
const { buildLocalModeUrls } = require('../src/utils/localInstallUrls')
const { autoProvisionWindows, ensureWindowsLanAccess } = require('../src/utils/provision')
const { normalizeRelayUrl } = require('../src/utils/relayUrl')
const { resolveRuntimeDir } = require('../src/utils/runtimeDir')
const { loadSecureJsonFile, saveSecureJsonFile } = require('../src/utils/secureJsonFile')
const { redactSensitiveArgs, redactSensitiveText } = require('../src/utils/logRedaction')

if (!process.env.PVTKRRX_RUNTIME_DIR) {
  process.env.PVTKRRX_RUNTIME_DIR = resolveRuntimeDir()
}
// The Windows EXE must never inherit server/cloud runtime mode from ambient env.
process.env.PVTKRRX_DESKTOP_LOCAL_ONLY = 'true'
process.env.PVTKRRX_SELF_HOST_MODE = 'false'

const runtimeDir = resolveRuntimeDir()
const logsDir = path.join(runtimeDir, 'logs')
const localConfigPath = path.join(runtimeDir, 'local-config.json')
const appIconPath = path.join(__dirname, 'assets', 'logo.ico')
const WINDOW_WIDTH = 1320
const WINDOW_HEIGHT = 1107
const MIN_WINDOW_WIDTH = 1320
const MIN_WINDOW_HEIGHT = 1107
const MIN_SPLASH_MS = Math.max(1500, parseInt(process.env.PVTKRRX_MIN_SPLASH_MS || '2600', 10) || 2600)
const STARTUP_LAUNCH_ARG = '--pvtkrrx-startup-launch'
const PROVISION_ONLY_ARG = '--pvtkrrx-provision-only'
const NETWORK_ACCESS_ONLY_ARG = '--pvtkrrx-network-access-only'
const startupLaunchMode = process.argv.includes(STARTUP_LAUNCH_ARG)
const provisionOnlyMode = process.argv.includes(PROVISION_ONLY_ARG)
const networkAccessOnlyMode = process.argv.includes(NETWORK_ACCESS_ONLY_ARG)
let hasRetriedPortRecovery = false
// Desktop publishes its LAN location and then mostly waits; set 0 to disable periodic relay heartbeat.
const parsedLanPairHeartbeatMs = parseInt(process.env.PVTKRRX_LAN_PAIR_HEARTBEAT_MS || '720000', 10)
const LAN_PAIR_HEARTBEAT_MS = Number.isFinite(parsedLanPairHeartbeatMs) ? parsedLanPairHeartbeatMs : 720000
const STREMIO_LAUNCH_WATCH_ENABLED = String(process.env.PVTKRRX_STREMIO_LAUNCH_WATCH_ENABLED || 'true').trim().toLowerCase() !== 'false'
const STREMIO_LAUNCH_POLL_MS = Math.max(5000, parseInt(process.env.PVTKRRX_STREMIO_LAUNCH_POLL_MS || '10000', 10))
const DEFAULT_POWER_BLOCKER_MODE = normalizePowerBlockerMode(process.env.PVTKRRX_POWER_BLOCKER_MODE || 'prevent-app-suspension')

function readPersistedLocalHostname() {
  try {
    const parsed = loadSecureJsonFile(localConfigPath, { defaultValue: null })
    return String(parsed?.localHostname || '').trim()
  } catch (_) {
    return ''
  }
}

function resolveLocalHostname() {
  return normalizeLocalHostname(
    readPersistedLocalHostname() ||
    process.env.PVTKRRX_LOCAL_HOSTNAME ||
    deriveDefaultLocalHostname()
  )
}

process.env.PVTKRRX_LOCAL_HOSTNAME = resolveLocalHostname()

function saveLocalConfig(config) {
  try {
    saveSecureJsonFile(localConfigPath, config)
    return true
  } catch (_) {
    return false
  }
}

function getDesktopStartupLaunchConfig() {
  const executablePath = String(process.execPath || '').trim()
  if (!executablePath) return { path: '', args: [] }
  if (app.isPackaged) {
    return {
      path: executablePath,
      args: [STARTUP_LAUNCH_ARG]
    }
  }
  const entryPoint = String(process.argv[1] || path.join(__dirname, 'main.js')).trim()
  return {
    path: executablePath,
    args: entryPoint ? [entryPoint, STARTUP_LAUNCH_ARG] : [STARTUP_LAUNCH_ARG]
  }
}

function getDesktopStartupState() {
  if (process.platform !== 'win32') {
    return {
      startupAvailable: false,
      startupEnabled: false,
      startupLabel: 'Windows startup is only available on Windows'
    }
  }

  try {
    const launchConfig = getDesktopStartupLaunchConfig()
    const settings = app.getLoginItemSettings({
      path: launchConfig.path,
      args: launchConfig.args
    })
    const enabled = Boolean(settings?.openAtLogin)
    return {
      startupAvailable: true,
      startupEnabled: enabled,
      startupLabel: enabled
        ? 'Enabled - PVTKRRX launches when Windows signs in'
        : 'Disabled - PVTKRRX only starts when you open it'
    }
  } catch (err) {
    return {
      startupAvailable: false,
      startupEnabled: false,
      startupLabel: `Unavailable - ${err.message || 'startup state read failed'}`
    }
  }
}

function setDesktopStartupEnabled(enabled) {
  if (process.platform !== 'win32') return getDesktopStartupState()
  const launchConfig = getDesktopStartupLaunchConfig()
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: launchConfig.path,
    args: launchConfig.args
  })
  return getDesktopStartupState()
}

function ensureLocalLanPairOwner(config) {
  const next = config && typeof config === 'object' ? { ...config } : null
  if (!next || next.lanPairEnabled === false) return next
  const pairId = String(next.lanPairId || '').trim()
  const pairKey = String(next.lanPairKey || '').trim()
  if (!pairId || !pairKey) return next
  const ownerId = String(next.lanPairOwnerId || '').trim()
  if (ownerId) return next
  next.lanPairOwnerId = crypto.randomBytes(24).toString('base64url')
  saveLocalConfig(next)
  return next
}

function getProvisionPayload() {
  return {
    installIfMissing: true,
    startIfStopped: true,
    configureQbitLocalNoAuth: true,
    openFirewall: true,
    localHostname: process.env.PVTKRRX_LOCAL_HOSTNAME
  }
}

function makeDesktopPairId() {
  return crypto.randomBytes(9).toString('base64url').toLowerCase()
}

function makeDesktopPairKey() {
  return crypto.randomBytes(24).toString('base64url')
}

function makeDesktopPairOwnerId() {
  return crypto.randomBytes(24).toString('base64url')
}

function repairLanPairIdentity(reason = 'invalid pair key') {
  try {
    const current = loadSecureJsonFile(localConfigPath, { defaultValue: null })
    if (!current || typeof current !== 'object') return null
    if (current.lanPairEnabled === false) return null

    const next = {
      ...current,
      lanPairId: makeDesktopPairId(),
      lanPairKey: makeDesktopPairKey(),
      lanPairOwnerId: makeDesktopPairOwnerId()
    }
    saveSecureJsonFile(localConfigPath, next)
    console.warn(`[desktop] lan pair identity repaired (${reason}); refresh LAN Bridge in Stremio on your home devices`)
    return next
  } catch (err) {
    console.warn('[desktop] lan pair identity repair failed:', err.message)
    return null
  }
}

function runPowerShell(command, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGTERM') } catch (_) {}
      resolve({ code: 1, stdout, stderr: `${stderr}\nTimeout` })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: Number.isInteger(code) ? code : 1, stdout, stderr })
    })
  })
}

async function isRunningAsAdmin() {
  if (process.platform !== 'win32') return false
  const script = '[bool](([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))'
  const result = await runPowerShell(script, 10000)
  return /\btrue\b/i.test(String(result.stdout || ''))
}

function needsElevatedProvisionPass(notes) {
  if (!Array.isArray(notes)) return false
  return notes.some((n) => {
    const note = String(n || '')
    return (
      note.includes('Firewall rule update failed') ||
      note.includes('Bonjour service detected but not running') ||
      note.includes('Bonjour/mDNS service not detected')
    )
  })
}

async function runProvisionOnlyMode() {
  try {
    const result = await autoProvisionWindows(getProvisionPayload())
    console.log('[desktop-provision] message:', result?.message || 'ok')
    if (Array.isArray(result?.notes)) {
      for (const n of result.notes) console.log('[desktop-provision] note:', n)
    }
    return Boolean(result?.ok)
  } catch (err) {
    console.error('[desktop-provision] failed:', err.message)
    return false
  }
}

async function runNetworkAccessOnlyMode() {
  try {
    const result = await ensureWindowsLanAccess({
      openFirewall: true,
      ensureBonjour: true,
      installBonjourIfMissing: false,
      startIfStopped: true
    })
    console.log('[desktop-network] message:', result?.message || 'ok')
    if (Array.isArray(result?.notes)) {
      for (const n of result.notes) console.log('[desktop-network] note:', n)
    }
    return Boolean(result?.firewallOk)
  } catch (err) {
    console.error('[desktop-network] failed:', err.message)
    return false
  }
}

async function runElevatedProvisionPass() {
  if (process.platform !== 'win32') return false
  if (!app.isPackaged) return false

  const exePath = String(process.execPath || '').trim()
  if (!exePath) return false

  const escapedExe = exePath.replace(/'/g, "''")
  const escapedArg = PROVISION_ONLY_ARG.replace(/'/g, "''")
  const script = `
    try {
      Start-Process -FilePath '${escapedExe}' -ArgumentList '${escapedArg}' -Verb RunAs -Wait -WindowStyle Hidden
      Write-Output 'ok'
      exit 0
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `
  const result = await runPowerShell(script, 900000)
  if (result.code === 0) return true
  console.warn('[desktop] elevated provisioning pass failed:', (result.stderr || result.stdout || '').trim() || 'unknown error')
  return false
}

function setupBoundedLogging() {
  try {
    fs.mkdirSync(logsDir, { recursive: true })
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const currentLog = path.join(logsDir, `desktop-${y}-${m}-${d}.log`)

    const files = fs.readdirSync(logsDir)
      .filter(f => /^desktop-\d{4}-\d{2}-\d{2}\.log$/i.test(f))
      .map(name => {
        const full = path.join(logsDir, name)
        const stat = fs.statSync(full)
        return { name, full, mtimeMs: stat.mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (i >= 6 || f.mtimeMs < cutoff) {
        try { fs.unlinkSync(f.full) } catch (err) {
          console.warn('[desktop] Failed to clean old log:', f.name, err.message)
        }
      }
    }

    const old = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console)
    }

    function stringify(arg) {
      if (arg instanceof Error) return arg.stack || arg.message
      if (typeof arg === 'string') return arg
      try { return JSON.stringify(arg) } catch (_) { return String(arg) }
    }

    function write(level, args) {
      const safeArgs = redactSensitiveArgs(args)
      const line = `[${new Date().toISOString()}] [${level}] ${safeArgs.map(stringify).join(' ')}\n`
      try { fs.appendFileSync(currentLog, line, 'utf8') } catch (_) {}
      return safeArgs
    }

    console.log = (...args) => { old.log(...write('LOG', args)) }
    console.info = (...args) => { old.info(...write('INFO', args)) }
    console.warn = (...args) => { old.warn(...write('WARN', args)) }
    console.error = (...args) => { old.error(...write('ERROR', args)) }
  } catch (_) {
    // keep default console behavior if logger setup fails
  }
}

setupBoundedLogging()

function getLatestDesktopLogPath() {
  try {
    const files = fs.readdirSync(logsDir)
      .filter(f => /^desktop-\d{4}-\d{2}-\d{2}\.log$/i.test(f))
      .map(name => {
        const full = path.join(logsDir, name)
        const stat = fs.statSync(full)
        return { full, mtimeMs: stat.mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    return files[0]?.full || ''
  } catch (_) {
    return ''
  }
}

function readRecentDesktopLogs(limit = 80) {
  const maxLines = Math.max(10, Math.min(400, parseInt(String(limit || 80), 10) || 80))
  const logPath = getLatestDesktopLogPath()
  if (!logPath || !fs.existsSync(logPath)) {
    return { path: '', text: '' }
  }

  try {
    const raw = fs.readFileSync(logPath, 'utf8')
    const lines = raw.split(/\r?\n/).filter(Boolean)
    return {
      path: logPath,
      text: lines.slice(-maxLines).join('\n')
    }
  } catch (_) {
    return { path: logPath, text: '' }
  }
}

function readCurrentDesktopLog() {
  const logPath = getLatestDesktopLogPath()
  if (!logPath || !fs.existsSync(logPath)) {
    return { path: '', text: '' }
  }

  try {
    return {
      path: logPath,
      text: fs.readFileSync(logPath, 'utf8')
    }
  } catch (_) {
    return { path: logPath, text: '' }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock && !provisionOnlyMode && !networkAccessOnlyMode) {
  app.quit()
}

const addon = require('../index')

let mainWindow = null
let splashWindow = null
let httpServer = null
let addonServerState = null
let port = parseInt(process.env.PORT || '7000', 10)
let running = false
let ownsServer = false
let lanPairTimer = null
let lanPairFailureCount = 0
let hasLoggedHeartbeatSuccess = false
let lastHeartbeatSuccessAt = 0
let stremioLaunchWatchTimer = null
let stremioWasRunning = false
let stremioLaunchWatchFailureCount = 0
let splashShownAt = 0
let powerBlockerId = null
let tray = null
let isQuitting = false

function normalizePowerBlockerMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'off' || normalized === 'disabled' || normalized === 'false' || normalized === '0') {
    return 'off'
  }
  if (normalized === 'prevent-display-sleep') return 'prevent-display-sleep'
  return 'prevent-app-suspension'
}

function getPowerBlockerMode() {
  return DEFAULT_POWER_BLOCKER_MODE
}

function ensureDesktopPowerBlocker(reason = 'startup') {
  const mode = getPowerBlockerMode()
  if (mode === 'off') {
    if (reason === 'startup') {
      console.log('[desktop-power] blocker disabled (mode=off)')
    }
    return
  }

  if (powerBlockerId && powerSaveBlocker.isStarted(powerBlockerId)) return
  powerBlockerId = powerSaveBlocker.start(mode)
  console.log(`[desktop-power] blocker active mode=${mode} id=${powerBlockerId} reason=${reason}`)
}

function releaseDesktopPowerBlocker(reason = 'shutdown') {
  if (!powerBlockerId) return
  try {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId)
      console.log(`[desktop-power] blocker stopped id=${powerBlockerId} reason=${reason}`)
    }
  } catch (_) {
    // ignore power blocker shutdown errors
  }
  powerBlockerId = null
}

function installPowerMonitorHooks() {
  powerMonitor.on('lock-screen', () => {
    console.log('[desktop-power] lock-screen detected')
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[desktop-power] unlock-screen detected')
    ensureDesktopPowerBlocker('unlock-screen')
    sendLanPairHeartbeat('unlock-screen').catch(err => {
      console.warn('[desktop-power] unlock-screen heartbeat failed:', err.message)
    })
  })

  powerMonitor.on('suspend', () => {
    console.warn('[desktop-power] system suspend detected; local server and LAN heartbeat will pause until resume')
  })

  powerMonitor.on('resume', async () => {
    console.log('[desktop-power] system resume detected')
    ensureDesktopPowerBlocker('resume')
    try {
      running = await isServerReachable(port)
      pushStatus()
      await sendLanPairHeartbeat('resume')
    } catch (err) {
      console.warn('[desktop-power] resume recovery failed:', err.message)
    }
  })
}

function getLocalInstallUrls() {
  const httpsPort = parseInt(process.env.HTTPS_PORT || '7001', 10)
  return buildLocalModeUrls('127.0.0.1', port, httpsPort)
}

function getLocalInstallManifestUrl() {
  return getLocalInstallUrls().httpManifest
}

function isLikelyOwnServerProcess(proc) {
  const name = String(proc?.name || '').toLowerCase()
  const cmd = String(proc?.commandLine || '').toLowerCase()
  const exe = String(proc?.executablePath || '').toLowerCase()

  if (!name && !cmd && !exe) return false
  if (name.includes('pvtkrrx')) return true
  if (exe.includes('pvtkrrx')) return true
  if (cmd.includes('pvtkrrx')) return true
  if (name === 'node.exe' && cmd.includes('index.js') && cmd.includes('pvtkrrx')) return true
  return false
}

async function getListeningProcessOnPort(checkPort = port) {
  if (process.platform !== 'win32') return null

  const script = `
    try {
      $conn = Get-NetTCPConnection -LocalPort ${Number(checkPort)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $conn) { Write-Output '{}'; exit 0 }
      $owningPid = [int]$conn.OwningProcess
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owningPid" -ErrorAction SilentlyContinue
      if (-not $proc) {
        @{ pid = $owningPid; name = ''; commandLine = ''; executablePath = '' } | ConvertTo-Json -Compress
        exit 0
      }
      @{
        pid = [int]$proc.ProcessId
        name = [string]$proc.Name
        commandLine = [string]$proc.CommandLine
        executablePath = [string]$proc.ExecutablePath
      } | ConvertTo-Json -Compress
    } catch {
      Write-Output '{}'
    }
  `

  const result = await runPowerShell(script, 15000)
  if (result.code !== 0) return null
  try {
    const parsed = JSON.parse(String(result.stdout || '{}').trim() || '{}')
    if (!parsed || !parsed.pid) return null
    return parsed
  } catch (_) {
    return null
  }
}

async function waitForPortToBeFreed(checkPort = port, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const holder = await getListeningProcessOnPort(checkPort)
    if (!holder) return true
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

async function reconcilePortOnBoot(checkPort = port) {
  const holder = await getListeningProcessOnPort(checkPort)
  if (!holder || !holder.pid) return { ok: true, action: 'clear' }
  if (Number(holder.pid) === Number(process.pid)) return { ok: true, action: 'self' }

  if (!isLikelyOwnServerProcess(holder)) {
    return { ok: false, action: 'occupied-by-other', holder }
  }

  console.warn('[desktop] found stale local server process on port', checkPort, 'pid', holder.pid, '- terminating')
  const killResult = await runPowerShell(`Stop-Process -Id ${Number(holder.pid)} -Force -ErrorAction SilentlyContinue`, 15000)
  if (killResult.code !== 0) {
    return { ok: false, action: 'kill-failed', holder }
  }

  const cleared = await waitForPortToBeFreed(checkPort, 7000)
  return { ok: cleared, action: cleared ? 'recovered' : 'still-occupied', holder }
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, { ...options, signal: timeout })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`
    throw new Error(message)
  }
  return data
}

function normalizeQbitPreferenceSnapshot(prefs = null) {
  const value = prefs && typeof prefs === 'object' ? prefs : null
  return {
    available: Boolean(value),
    savePath: String(value?.savePath || ''),
    tempPath: String(value?.tempPath || ''),
    incompletePathEnabled: Boolean(value?.incompletePathEnabled),
    additionalStorageRoots: Array.isArray(value?.additionalStorageRoots) ? value.additionalStorageRoots : [],
    autoExtractEnabled: Boolean(value?.autoExtractEnabled),
    autoExtractManagedByPvtkrrx: Boolean(value?.autoExtractManagedByPvtkrrx),
    autoExtractMode: String(value?.autoExtractMode || ''),
    autoExtractLabel: String(value?.autoExtractLabel || (value ? 'PVTKRRX on-demand extraction only' : 'Unavailable')),
    autoExtractProgram: String(value?.autoExtractProgram || ''),
    autoExtractScriptPath: String(value?.autoExtractScriptPath || '')
  }
}

async function readDesktopSettingsSnapshot() {
  let prefs = null
  try {
    prefs = await fetchJson(`http://127.0.0.1:${port}/local/qbit/preferences`)
  } catch (_) {
    prefs = null
  }
  return {
    ...normalizeQbitPreferenceSnapshot(prefs),
    ...getDesktopStartupState()
  }
}

async function isServerReachable(checkPort = port) {
  try {
    const res = await fetch(`http://127.0.0.1:${checkPort}/manifest.json`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch (_) {
    return false
  }
}

async function waitForServerReady(checkPort = port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isServerReachable(checkPort)) return true
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

async function getLocalConfig() {
  try {
    return ensureLocalLanPairOwner(loadSecureJsonFile(localConfigPath, { defaultValue: null }))
  } catch (_) {
    return null
  }
}

async function getServiceUrls() {
  const cfg = await getLocalConfig()
  return {
    prowlarrUrl: cfg?.jackettUrl || 'http://127.0.0.1:9696',
    qbitUrl: cfg?.qbitUrl || 'http://127.0.0.1:8080'
  }
}

function sanitizeBaseUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return `${url.protocol}//${url.host}`
  } catch (_) {
    return ''
  }
}

function dedupeEndpoints(list) {
  const out = []
  const seen = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    const baseUrl = sanitizeBaseUrl(item?.baseUrl)
    if (!baseUrl) continue
    if (seen.has(baseUrl)) continue
    seen.add(baseUrl)
    out.push({
      baseUrl,
      source: String(item?.source || '').trim() || 'unknown'
    })
  }
  return out
}

function summarizePairId(pairId) {
  const value = String(pairId || '').trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function summarizeEndpointSources(endpoints) {
  const seen = new Set()
  const labels = []
  for (const entry of Array.isArray(endpoints) ? endpoints : []) {
    const label = String(entry?.source || '').trim() || 'unknown'
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels.length ? labels.join(',') : 'none'
}

function summarizeHeartbeatPayload(payload) {
  const body = payload?.body && typeof payload.body === 'object' ? payload.body : {}
  const endpoints = Array.isArray(body.endpoints) ? body.endpoints : []
  return {
    pairId: summarizePairId(body.pairId),
    endpointCount: endpoints.length,
    endpointSources: summarizeEndpointSources(endpoints),
    appVersion: String(body.appVersion || '').trim() || 'unknown'
  }
}

async function buildLanPairHeartbeatPayload() {
  const cfg = await getLocalConfig()
  if (!cfg || cfg.lanPairEnabled === false) return null

  const pairId = String(cfg.lanPairId || '').trim().toLowerCase()
  const pairKey = String(cfg.lanPairKey || '').trim()
  const relayUrl = normalizeRelayUrl(cfg.lanPairRelayUrl || process.env.PVTKRRX_PAIR_RELAY_URL || '')
  if (!pairId || !pairKey || !relayUrl) return null

  const networkInfo = await fetchJson(`http://127.0.0.1:${port}/network-info`, {}, 4000).catch(() => null)
  const endpoints = dedupeEndpoints(networkInfo?.pairEndpoints || [])
  if (!endpoints.length) return null

  return {
    relayUrl,
    body: {
      pairId,
      pairKey,
      ownerId: String(cfg.lanPairOwnerId || '').trim(),
      localHostname: String(cfg.localHostname || '').trim(),
      relayUrl,
      appVersion: String(pkg.version || ''),
      endpoints
    }
  }
}

async function sendLanPairHeartbeat(source = 'interval', options = {}) {
  try {
    const now = Date.now()
    const sinceLast = now - lastHeartbeatSuccessAt
    if (sinceLast < 10000 && source !== 'interval') {
      console.log(`[desktop] lan pair heartbeat skipped (${source}): last success ${Math.round(sinceLast / 1000)}s ago`)
      return true
    }

    const payload = await buildLanPairHeartbeatPayload()
    if (!payload) {
      if (source !== 'interval') {
        console.log(`[desktop] lan pair heartbeat skipped (${source}): LAN Bridge is not ready yet`)
      }
      return false
    }

    const summary = summarizeHeartbeatPayload(payload)

    const res = await fetch(`${payload.relayUrl}/pair/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.body),
      signal: AbortSignal.timeout(4000)
    })

    if (!res.ok) {
      lanPairFailureCount += 1
      let body = null
      let detail = ''
      try {
        body = await res.json()
        detail = ` reason=${body?.error || JSON.stringify(body)}`
      } catch (_) {}
      const reason = String(body?.error || '').trim().toLowerCase()
      if (
        options.allowRepair !== false &&
        res.status === 403 &&
        (reason === 'invalid pair key' || reason === 'pair owner mismatch')
      ) {
        const repaired = repairLanPairIdentity(reason)
        if (repaired) {
          return sendLanPairHeartbeat(`${source}-repair`, { allowRepair: false })
        }
      }
      if (source !== 'interval' || lanPairFailureCount >= 3) {
        console.warn(
          `[desktop] lan pair heartbeat failed (${source}) status=${res.status}${detail} pair=${summary.pairId} endpoints=${summary.endpointCount}`
        )
      }
      return false
    }

    const recovered = lanPairFailureCount >= 3
    if (source !== 'interval' || !hasLoggedHeartbeatSuccess || recovered) {
      console.log(
        `[desktop] lan pair heartbeat ok (${source}) pair=${summary.pairId} endpoints=${summary.endpointCount} sources=${summary.endpointSources} app=${summary.appVersion}`
      )
    }
    if (recovered) {
      console.log('[desktop] lan pair heartbeat restored')
    }
    lanPairFailureCount = 0
    hasLoggedHeartbeatSuccess = true
    lastHeartbeatSuccessAt = Date.now()
    return true
  } catch (err) {
    lanPairFailureCount += 1
    if (source !== 'interval' || lanPairFailureCount >= 3) {
      console.warn(`[desktop] lan pair heartbeat error (${source}):`, redactSensitiveText(err.message))
    }
    return false
  }
}

async function isStremioRunning() {
  if (process.platform !== 'win32') return false
  const script = `
    try {
      $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'stremio' } | Select-Object -First 1
      if ($proc) { Write-Output '1' } else { Write-Output '0' }
      exit 0
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `
  const result = await runPowerShell(script, 10000)
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || 'failed to inspect stremio process')
  }
  return /\b1\b/.test(String(result.stdout || ''))
}

async function pulseLanPairOnStremioLaunch() {
  try {
    const runningNow = await isStremioRunning()
    const launched = runningNow && !stremioWasRunning
    stremioWasRunning = runningNow

    if (launched) {
      console.log('[desktop] Stremio launch detected')
      sendLanPairHeartbeat('stremio-launch').catch(err => {
        console.warn('[desktop] Stremio-launch heartbeat failed:', err.message)
      })
    }

    if (stremioLaunchWatchFailureCount >= 3) {
      console.log('[desktop] stremio launch watch restored')
    }
    stremioLaunchWatchFailureCount = 0
  } catch (err) {
    stremioLaunchWatchFailureCount += 1
    if (stremioLaunchWatchFailureCount >= 3) {
      console.warn('[desktop] stremio launch watch error:', err.message)
    }
  }
}

function startStremioLaunchWatch() {
  stopStremioLaunchWatch()
  if (!STREMIO_LAUNCH_WATCH_ENABLED) return
  if (process.platform !== 'win32') return
  console.log(`[desktop] stremio launch watch active (poll=${STREMIO_LAUNCH_POLL_MS}ms)`)
  pulseLanPairOnStremioLaunch().catch(err => {
    console.warn('[desktop] Initial Stremio launch pulse failed:', err.message)
  })
  stremioLaunchWatchTimer = setInterval(() => {
    pulseLanPairOnStremioLaunch().catch(err => {
      if (stremioLaunchWatchFailureCount < 3) {
        console.warn('[desktop] Stremio launch watch pulse failed:', err.message)
      }
    })
  }, STREMIO_LAUNCH_POLL_MS)
  if (typeof stremioLaunchWatchTimer.unref === 'function') stremioLaunchWatchTimer.unref()
}

function stopStremioLaunchWatch() {
  if (stremioLaunchWatchTimer) clearInterval(stremioLaunchWatchTimer)
  stremioLaunchWatchTimer = null
  stremioWasRunning = false
}

function startLanPairHeartbeatLoop() {
  stopLanPairHeartbeatLoop()
  sendLanPairHeartbeat('startup').catch(err => {
    console.warn('[desktop] Initial heartbeat failed:', err.message)
  })
  if (LAN_PAIR_HEARTBEAT_MS <= 0) return
  const intervalMs = Math.max(60000, LAN_PAIR_HEARTBEAT_MS)
  console.log(`[desktop] lan pair heartbeat loop active (interval=${intervalMs}ms)`)
  lanPairTimer = setInterval(() => {
    sendLanPairHeartbeat('interval').catch(err => {
      lanPairFailureCount = (lanPairFailureCount || 0) + 1
      if (lanPairFailureCount <= 3) {
        console.warn('[desktop] Heartbeat failed:', err.message)
      }
    })
  }, intervalMs)
  if (typeof lanPairTimer.unref === 'function') lanPairTimer.unref()
}

function stopLanPairHeartbeatLoop() {
  if (!lanPairTimer) return
  clearInterval(lanPairTimer)
  lanPairTimer = null
}

function pushStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const js = `
    if (window.popupAPI) {
      window.popupAPI.setVersion(${JSON.stringify(pkg.version || '0.0.0')});
      window.popupAPI.setStatus(${running ? 'true' : 'false'}, ${Number(port) || 7000});
    }
  `
  mainWindow.webContents.executeJavaScript(js).catch(err => {
    console.warn('[desktop] UI status push failed:', err.message)
  })
}

function bringWindowToFront(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return
  try { targetWindow.show() } catch (_) {}
  try { targetWindow.moveTop() } catch (_) {}
  try { targetWindow.focus() } catch (_) {}
}

function showMainWindow(reason = 'tray') {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) {
    try { mainWindow.restore() } catch (_) {}
  }
  console.log(`[desktop-ui] show main window (${reason})`)
  bringWindowToFront(mainWindow)
}

function hideMainWindowToTray(reason = 'close') {
  if (!mainWindow || mainWindow.isDestroyed()) return
  console.log(`[desktop-ui] hide to tray (${reason})`)
  try { mainWindow.hide() } catch (_) {}
}

function createTray() {
  if (tray || !appIconPath || !fs.existsSync(appIconPath)) return

  tray = new Tray(appIconPath)
  tray.setToolTip('PVTKRRX')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open PVTKRRX',
      click: () => showMainWindow('tray-menu')
    },
    {
      label: 'Open Configure',
      click: () => {
        shell.openExternal(`http://127.0.0.1:${port}/configure`).catch(() => {})
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]))
  tray.on('click', () => showMainWindow('tray-click'))
  tray.on('double-click', () => showMainWindow('tray-double-click'))
}

function pinSplashToFront() {
  if (!splashWindow || splashWindow.isDestroyed()) return
  try {
    splashWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  } catch (_) {
    try { splashWindow.setAlwaysOnTop(true) } catch (_) {}
  }
  try { splashWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) } catch (_) {}
  bringWindowToFront(splashWindow)
}

function createSplashWindow() {
  splashShownAt = Date.now()
  splashWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: false,
    backgroundColor: '#000000',
    icon: appIconPath,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  splashWindow.once('ready-to-show', () => {
    pinSplashToFront()
  })
  splashWindow.webContents.once('did-finish-load', () => {
    pinSplashToFront()
  })
  splashWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      setTimeout(() => {
        pinSplashToFront()
      }, 60)
    }
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  setTimeout(() => {
    pinSplashToFront()
  }, 100)
}

// Window size is fixed at creation — no runtime resizing.
// The CSS grid layout in popup.html handles any window size gracefully.

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    resizable: true,
    maximizable: true,
    minimizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'popup.html'))
  mainWindow.webContents.on('did-finish-load', () => {
    pushStatus()
  })
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideMainWindowToTray('window-close')
  })
}

async function showMainAndCloseSplash() {
  const elapsed = Date.now() - splashShownAt
  const remaining = MIN_SPLASH_MS - elapsed
  if (remaining > 0) await wait(remaining)

  if (splashWindow && !splashWindow.isDestroyed()) {
    try { splashWindow.setAlwaysOnTop(false) } catch (_) {}
    splashWindow.destroy()
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    bringWindowToFront(mainWindow)
  }
}

function startAddonServer() {
  const result = addon.startLocalServers({
    exitOnHttpError: false,
    logger: console
  })

  addonServerState = result
  httpServer = result.httpServer
  port = result.port
  running = false
  ownsServer = true

  httpServer.on('listening', () => {
    running = true
    ownsServer = true
    console.log('[desktop] local addon server listening on', port)
    pushStatus()
  })

  httpServer.on('error', async (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const reachable = await isServerReachable(port)
      if (reachable) {
        running = true
        ownsServer = false
        console.warn('[desktop] port', port, 'already in use; attached to existing local server')
      } else {
        const recovered = hasRetriedPortRecovery ? null : await reconcilePortOnBoot(port)
        if (recovered?.ok && (recovered.action === 'recovered' || recovered.action === 'clear')) {
          hasRetriedPortRecovery = true
          console.warn('[desktop] recovered stale listener on port', port, '- restarting local server')
          startAddonServer()
          return
        }
        running = false
        console.error('[desktop] port', port, 'in use but server not reachable')
      }
      pushStatus()
      return
    }

    running = false
    console.error('[desktop] addon server error:', err?.message || err)
    pushStatus()
  })
}

async function bootstrapAutoProvision() {
  try {
    const runProvisionPass = async () => {
      const url = `http://127.0.0.1:${port}/auto-provision`
      const data = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getProvisionPayload())
      }, 180000)
      return data
    }

    let data = await runProvisionPass()
    console.log('[desktop] auto-provision:', data?.message || 'ok')
    if (Array.isArray(data?.notes)) {
      for (const n of data.notes) console.log('[desktop] note:', n)
    }

    if (needsElevatedProvisionPass(data?.notes)) {
      const admin = await isRunningAsAdmin()
      if (!admin) {
        console.log('[desktop] attempting elevated provisioning pass for firewall/Bonjour...')
        const elevatedOk = await runElevatedProvisionPass()
        if (elevatedOk) {
          console.log('[desktop] elevated provisioning pass completed')
          // Re-run non-elevated pass after elevation to refresh config + status.
          data = await runProvisionPass()
          if (Array.isArray(data?.notes)) {
            for (const n of data.notes) console.log('[desktop] note(post-elev):', n)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[desktop] auto-provision error:', err.message)
  }
}

function stopAddonServer() {
  if (!httpServer || !ownsServer) return
  try {
    httpServer.close()
  } catch (_) {
    // ignore shutdown errors
  }
  try {
    const httpsServer = addonServerState?.httpsServer
    if (httpsServer) httpsServer.close()
    if (!httpsServer && addonServerState?.httpsReady) {
      addonServerState.httpsReady.then(server => {
        try {
          if (server) server.close()
        } catch (err) {
          console.warn('[desktop] HTTPS server close failed:', err.message)
        }
      }).catch(err => {
        console.warn('[desktop] HTTPS server shutdown failed:', err.message)
      })
    }
  } catch (_) {
    // ignore shutdown errors
  }
  addonServerState = null
  httpServer = null
}

app.on('second-instance', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    pinSplashToFront()
    return
  }
  showMainWindow('second-instance')
})

app.whenReady().then(async () => {
  isQuitting = false
  if (provisionOnlyMode) {
    const ok = await runProvisionOnlyMode()
    if (!ok) process.exitCode = 1
    app.quit()
    return
  }

  if (networkAccessOnlyMode) {
    const ok = await runNetworkAccessOnlyMode()
    if (!ok) process.exitCode = 1
    app.quit()
    return
  }

  console.log(`[desktop] boot start v${pkg.version}`)
  if (startupLaunchMode) {
    console.log('[desktop] startup launch detected; booting hidden in system tray')
  }
  ensureDesktopPowerBlocker('startup')
  installPowerMonitorHooks()
  const reconciled = await reconcilePortOnBoot(port)
  if (!reconciled.ok && reconciled.action === 'occupied-by-other') {
    console.warn('[desktop] port', port, 'is held by a non-PVTKRRX process; cannot auto-kill safely')
  }

  createTray()
  if (!startupLaunchMode) {
    createSplashWindow()
  }
  startAddonServer()
  createMainWindow()

  try {
    await waitForServerReady(port, 20000)
  } catch (err) {
    console.warn('[desktop] server startup wait failed:', err.message)
  }
  running = await isServerReachable(port)
  pushStatus()
  if (startupLaunchMode) {
    hideMainWindowToTray('startup-launch')
  } else {
    await showMainAndCloseSplash()
  }
  startLanPairHeartbeatLoop()
  startStremioLaunchWatch()

  bootstrapAutoProvision().then(async () => {
    running = await isServerReachable(port)
    pushStatus()
  }).catch(err => {
    console.warn('[desktop] bootstrap auto-provision failed:', err.message)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  showMainWindow('activate')
})

app.on('before-quit', () => {
  isQuitting = true
  if (tray) {
    try { tray.destroy() } catch (_) {}
    tray = null
  }
  releaseDesktopPowerBlocker('before-quit')
  stopStremioLaunchWatch()
  stopLanPairHeartbeatLoop()
  stopAddonServer()
})

ipcMain.handle('open-configure', async () => {
  await shell.openExternal(`http://127.0.0.1:${port}/configure`)
})

ipcMain.handle('open-configure-lan', async () => {
  await shell.openExternal(`http://127.0.0.1:${port}/configure?target=lan`)
})

ipcMain.handle('get-local-install-url', async () => {
  return getLocalInstallManifestUrl()
})

ipcMain.handle('get-local-install-urls', async () => {
  return getLocalInstallUrls()
})

ipcMain.handle('get-local-stremio-status', async () => {
  try {
    return await fetchJson(`http://127.0.0.1:${port}/auth/stremio/local-status`)
  } catch (err) {
    return {
      ok: false,
      installed: false,
      signedInSessionFound: false,
      error: String(err?.message || 'Local Stremio status unavailable')
    }
  }
})

ipcMain.handle('copy-local-install-url', async () => {
  const url = getLocalInstallManifestUrl()
  clipboard.writeText(url)
  return url
})

ipcMain.handle('open-prowlarr', async () => {
  const urls = await getServiceUrls()
  await shell.openExternal(urls.prowlarrUrl)
})

ipcMain.handle('open-qbit', async () => {
  const urls = await getServiceUrls()
  await shell.openExternal(urls.qbitUrl)
})

// fit-popup-window IPC removed — window size is fixed at creation

ipcMain.handle('get-download-path', async () => {
  return readDesktopSettingsSnapshot()
})

ipcMain.handle('get-recent-logs', async (_event, limit = 80) => {
  return readRecentDesktopLogs(limit)
})

ipcMain.handle('copy-runtime-log', async () => {
  const currentLog = readCurrentDesktopLog()
  const text = String(currentLog.text || '')
  if (!currentLog.path || !text.trim()) throw new Error('No runtime log available yet')
  clipboard.writeText(text)
  return {
    path: currentLog.path,
    lineCount: text.split(/\r?\n/).filter(Boolean).length
  }
})

ipcMain.handle('set-download-path', async (_event, savePath) => {
  const value = String(savePath || '').trim()
  if (!value) throw new Error('Download path cannot be empty')

  const updated = await fetchJson(`http://127.0.0.1:${port}/local/qbit/download-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ savePath: value })
  })
  return { savePath: String(updated?.savePath || value) }
})

ipcMain.handle('save-qbit-settings', async (_event, payload = {}) => {
  const value = String(payload?.savePath || '').trim()
  const autoExtractEnabled = payload?.autoExtractEnabled
  const startupEnabled = payload?.startupEnabled

  if (value) {
    await fetchJson(`http://127.0.0.1:${port}/local/qbit/download-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savePath: value })
    })
  }

  if (typeof autoExtractEnabled === 'boolean') {
    await fetchJson(`http://127.0.0.1:${port}/local/qbit/auto-extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: autoExtractEnabled })
    })
  }

  if (typeof startupEnabled === 'boolean') {
    setDesktopStartupEnabled(startupEnabled)
  }

  return readDesktopSettingsSnapshot()
})

ipcMain.handle('open-download-folder', async (_event, folderPath) => {
  const value = String(folderPath || '').trim()
  if (!value) throw new Error('No folder path available')
  const result = await shell.openPath(value)
  if (result) throw new Error(result)
  return { ok: true }
})

ipcMain.handle('minimize-app', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
  mainWindow.minimize()
  return { ok: true }
})

ipcMain.handle('hide-to-tray', () => {
  hideMainWindowToTray('ipc')
  return { ok: true }
})

ipcMain.handle('quit-app', () => {
  isQuitting = true
  app.quit()
})
