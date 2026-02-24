const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron')
const pkg = require('../package.json')
const { deriveDefaultLocalHostname, normalizeLocalHostname } = require('../src/utils/lanAlias')
const { autoProvisionWindows } = require('../src/utils/provision')

if (!process.env.PVTKRRX_RUNTIME_DIR) {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Roaming')
  process.env.PVTKRRX_RUNTIME_DIR = path.join(appData, 'PVTKRRX', 'runtime')
}

const runtimeDir = process.env.PVTKRRX_RUNTIME_DIR
const logsDir = path.join(runtimeDir, 'logs')
const localConfigPath = path.join(runtimeDir, 'local-config.json')
const appIconPath = path.join(__dirname, 'assets', 'logo.ico')
const WINDOW_WIDTH = 740
const WINDOW_HEIGHT = 416
const PROVISION_ONLY_ARG = '--pvtkrrx-provision-only'
const provisionOnlyMode = process.argv.includes(PROVISION_ONLY_ARG)
let hasRetriedPortRecovery = false

function readPersistedLocalHostname() {
  try {
    if (!fs.existsSync(localConfigPath)) return ''
    const raw = fs.readFileSync(localConfigPath, 'utf8')
    if (!raw.trim()) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.localHostname || '').trim()
  } catch (_) {
    return ''
  }
}

function resolveLocalHostname() {
  return normalizeLocalHostname(
    readPersistedLocalHostname() ||
    process.env.PVTKRRX_LOCAL_HOSTNAME ||
    process.env.COMPUTERNAME ||
    deriveDefaultLocalHostname()
  )
}

process.env.PVTKRRX_LOCAL_HOSTNAME = resolveLocalHostname()

function saveLocalConfig(config) {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true })
    fs.writeFileSync(localConfigPath, JSON.stringify(config), 'utf8')
    return true
  } catch (_) {
    return false
  }
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

function persistProvisionConfig(result) {
  if (result?.config && result.config.qbitUrl) {
    saveLocalConfig(result.config)
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
    persistProvisionConfig(result)
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
        try { fs.unlinkSync(f.full) } catch (_) {}
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
      const line = `[${new Date().toISOString()}] [${level}] ${args.map(stringify).join(' ')}\n`
      try { fs.appendFileSync(currentLog, line, 'utf8') } catch (_) {}
    }

    console.log = (...args) => { write('LOG', args); old.log(...args) }
    console.info = (...args) => { write('INFO', args); old.info(...args) }
    console.warn = (...args) => { write('WARN', args); old.warn(...args) }
    console.error = (...args) => { write('ERROR', args); old.error(...args) }
  } catch (_) {
    // keep default console behavior if logger setup fails
  }
}

setupBoundedLogging()

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock && !provisionOnlyMode) {
  app.quit()
}

const addon = require('../index')

let mainWindow = null
let splashWindow = null
let httpServer = null
let port = parseInt(process.env.PORT || '7000', 10)
let running = false
let ownsServer = false

function getLocalInstallManifestUrl() {
  return `http://127.0.0.1:${port}/local/manifest.json?mode=local`
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

async function getLocalConfig() {
  try {
    return await fetchJson(`http://127.0.0.1:${port}/local/config.json`)
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

function pushStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const js = `
    if (window.popupAPI) {
      window.popupAPI.setVersion(${JSON.stringify(pkg.version || '1.0.0')});
      window.popupAPI.setStatus(${running ? 'true' : 'false'}, ${Number(port) || 7000});
    }
  `
  mainWindow.webContents.executeJavaScript(js).catch(() => {})
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: '#000000',
    icon: appIconPath,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    resizable: false,
    maximizable: false,
    minimizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'popup.html'))
  mainWindow.webContents.on('did-finish-load', () => {
    pushStatus()
  })
}

function showMainAndCloseSplash() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
}

function startAddonServer() {
  const result = addon.startLocalServers({
    exitOnHttpError: false,
    logger: console
  })

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
      persistProvisionConfig(data)
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
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  if (provisionOnlyMode) {
    const ok = await runProvisionOnlyMode()
    if (!ok) process.exitCode = 1
    app.quit()
    return
  }

  const reconciled = await reconcilePortOnBoot(port)
  if (!reconciled.ok && reconciled.action === 'occupied-by-other') {
    console.warn('[desktop] port', port, 'is held by a non-PVTKRRX process; cannot auto-kill safely')
  }

  createSplashWindow()
  startAddonServer()
  createMainWindow()

  await waitForServerReady(port, 20000)
  await bootstrapAutoProvision()
  running = await isServerReachable(port)
  pushStatus()
  showMainAndCloseSplash()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAddonServer()
})

ipcMain.handle('open-configure', async () => {
  await shell.openExternal(`http://127.0.0.1:${port}/configure`)
})

ipcMain.handle('get-local-install-url', async () => {
  return getLocalInstallManifestUrl()
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

ipcMain.handle('get-download-path', async () => {
  const prefs = await fetchJson(`http://127.0.0.1:${port}/local/qbit/preferences`)
  return {
    savePath: String(prefs?.savePath || ''),
    tempPath: String(prefs?.tempPath || ''),
    incompletePathEnabled: Boolean(prefs?.incompletePathEnabled)
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

ipcMain.handle('open-download-folder', async (_event, folderPath) => {
  const value = String(folderPath || '').trim()
  if (!value) throw new Error('No folder path available')
  const result = await shell.openPath(value)
  if (result) throw new Error(result)
  return { ok: true }
})

ipcMain.handle('quit-app', () => {
  app.quit()
})
