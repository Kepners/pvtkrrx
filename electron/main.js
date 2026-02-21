const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const pkg = require('../package.json')

if (!process.env.PVTKRRX_RUNTIME_DIR) {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Roaming')
  process.env.PVTKRRX_RUNTIME_DIR = path.join(appData, 'PVTKRRX', 'runtime')
}

const runtimeDir = process.env.PVTKRRX_RUNTIME_DIR
const logsDir = path.join(runtimeDir, 'logs')
const appIconPath = path.join(__dirname, 'assets', 'logo.ico')
const WINDOW_WIDTH = 740
const WINDOW_HEIGHT = 416

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

const addon = require('../index')

let mainWindow = null
let splashWindow = null
let httpServer = null
let port = parseInt(process.env.PORT || '7000', 10)
let running = false
let ownsServer = false

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
    const url = `http://127.0.0.1:${port}/auto-provision`
    const data = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installIfMissing: true,
        startIfStopped: true,
        configureQbitLocalNoAuth: true,
        openFirewall: true
      })
    }, 180000)

    console.log('[desktop] auto-provision:', data?.message || 'ok')
    if (Array.isArray(data?.notes)) {
      for (const n of data.notes) console.log('[desktop] note:', n)
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

app.whenReady().then(async () => {
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
