const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const { spawn } = require('child_process')
const { deriveDefaultLocalHostname, normalizeLocalHostname } = require('./lanAlias')
const { ProwlarrClient } = require('../clients/prowlarr')

const PROWLARR_CONFIG_PATHS = [
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'Prowlarr', 'config.xml'),
  path.join(process.env.LOCALAPPDATA || '', 'Prowlarr', 'config.xml'),
  path.join(process.env.APPDATA || '', 'Prowlarr', 'config.xml')
].filter(Boolean)

const QBIT_CONFIG_PATHS = [
  path.join(process.env.APPDATA || '', 'qBittorrent', 'qBittorrent.ini'),
  path.join(process.env.LOCALAPPDATA || '', 'qBittorrent', 'qBittorrent.ini')
].filter(Boolean)

const QBIT_EXE_PATHS = [
  path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'qBittorrent', 'qbittorrent.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'qBittorrent', 'qbittorrent.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'qBittorrent', 'qbittorrent.exe')
].filter(Boolean)

function readFirstExisting(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return { path: p, content: fs.readFileSync(p, 'utf8') }
    } catch (_) {
      // ignore unreadable path
    }
  }
  return null
}

function uniquePaths(paths) {
  return [...new Set(
    Array.isArray(paths) ? paths : []
  )].map(value => String(value || '').trim()).filter(Boolean)
}

function getHomeDir(env = process.env) {
  const candidates = [
    env?.HOME,
    env?.USERPROFILE
  ]
  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (text) return text
  }
  try {
    return String(os.homedir() || '').trim()
  } catch (_) {
    return ''
  }
}

function getProwlarrConfigCandidates(env = process.env) {
  const home = getHomeDir(env)
  const dataHint = String(env.PVTKRRX_PROWLARR_DATA || env.PROWLARR_DATA || '').trim()
  const hintedPaths = dataHint ? [
    path.join(dataHint, 'config.xml'),
    path.join(dataHint, '.config', 'Prowlarr', 'config.xml'),
    path.join(dataHint, '.config', 'prowlarr', 'config.xml')
  ] : []
  if (process.platform === 'win32') {
    return uniquePaths([
      ...hintedPaths,
      path.join(env.ProgramData || 'C:\\ProgramData', 'Prowlarr', 'config.xml'),
      path.join(env.LOCALAPPDATA || '', 'Prowlarr', 'config.xml'),
      path.join(env.APPDATA || '', 'Prowlarr', 'config.xml'),
      path.join(home || '', 'AppData', 'Local', 'Prowlarr', 'config.xml')
    ])
  }

  return uniquePaths([
    ...hintedPaths,
    home && path.join(home, '.config', 'Prowlarr', 'config.xml'),
    home && path.join(home, '.config', 'prowlarr', 'config.xml'),
    home && path.join(home, '.local', 'share', 'Prowlarr', 'config.xml'),
    home && path.join(home, '.local', 'share', 'prowlarr', 'config.xml'),
    '/var/lib/prowlarr/.config/Prowlarr/config.xml',
    '/var/lib/prowlarr/.config/prowlarr/config.xml',
    '/var/lib/prowlarr/config.xml'
  ])
}

function getQbitConfigCandidates(env = process.env) {
  const home = getHomeDir(env)
  const dataHint = String(env.PVTKRRX_QBIT_DATA || '').trim()
  const userHint = String(env.PVTKRRX_QBIT_USER || env.QBIT_USER || '').trim()
  const hintedRoots = uniquePaths([
    dataHint,
    userHint && process.platform !== 'win32' ? path.join('/var/lib', userHint) : '',
    userHint && process.platform !== 'win32' ? path.join('/home', userHint) : ''
  ])
  const hintedPaths = uniquePaths(hintedRoots.flatMap((root) => [
    path.join(root, '.config', 'qBittorrent', 'qBittorrent.conf'),
    path.join(root, '.config', 'qBittorrent', 'qBittorrent.ini'),
    path.join(root, '.local', 'share', 'qBittorrent', 'qBittorrent.conf'),
    path.join(root, '.local', 'share', 'qBittorrent', 'qBittorrent.ini'),
    path.join(root, 'qBittorrent.conf'),
    path.join(root, 'qBittorrent.ini')
  ]))
  if (process.platform === 'win32') {
    return uniquePaths([
      ...hintedPaths,
      path.join(env.APPDATA || '', 'qBittorrent', 'qBittorrent.ini'),
      path.join(env.LOCALAPPDATA || '', 'qBittorrent', 'qBittorrent.ini'),
      path.join(home || '', 'AppData', 'Roaming', 'qBittorrent', 'qBittorrent.ini'),
      path.join(home || '', 'AppData', 'Local', 'qBittorrent', 'qBittorrent.ini')
    ])
  }

  return uniquePaths([
    ...hintedPaths,
    home && path.join(home, '.config', 'qBittorrent', 'qBittorrent.conf'),
    home && path.join(home, '.config', 'qBittorrent', 'qBittorrent.ini'),
    home && path.join(home, '.local', 'share', 'qBittorrent', 'qBittorrent.conf'),
    home && path.join(home, '.local', 'share', 'qBittorrent', 'qBittorrent.ini'),
    '/var/lib/qbittorrent-nox/.config/qBittorrent/qBittorrent.conf',
    '/var/lib/qbittorrent-nox/.config/qBittorrent/qBittorrent.ini',
    '/var/lib/qbittorrent/.config/qBittorrent/qBittorrent.conf',
    '/var/lib/qbittorrent/.config/qBittorrent/qBittorrent.ini'
  ])
}

function parseXmlValue(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))
  return m ? String(m[1] || '').trim() : ''
}

function parseIniValue(ini, key) {
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = String(ini || '').match(new RegExp(`^${safe}=(.*)$`, 'mi'))
  return m ? String(m[1] || '').trim() : ''
}

function upsertIniValue(ini, key, value) {
  const text = String(ini || '')
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const line = `${key}=${value}`
  const re = new RegExp(`^${safe}=.*$`, 'mi')
  if (re.test(text)) return text.replace(re, line)
  if (/\[Preferences\]/i.test(text)) return text.replace(/\[Preferences\]/i, `[Preferences]\r\n${line}`)
  return `[Preferences]\r\n${line}\r\n${text}`
}

async function getProwlarrHints() {
  const script = `
    $result = @{
      serviceExists = $false
      running = $false
      paths = @()
      exePaths = @()
    }

    $svc = Get-CimInstance Win32_Service -Filter "Name='Prowlarr'" -ErrorAction SilentlyContinue
    if ($svc) {
      $result.serviceExists = $true
      if ($svc.State -eq 'Running') { $result.running = $true }
      $pathName = [string]$svc.PathName
      if ($pathName) {
        $result.exePaths += $pathName
        if ($pathName -match '-data=("([^"]+)"|([^\\s]+))') {
          $dataPath = if ($matches[2]) { $matches[2] } else { $matches[3] }
          if ($dataPath) { $result.paths += (Join-Path $dataPath 'config.xml') }
        }
      }
    }

    $proc = Get-CimInstance Win32_Process -Filter "Name='Prowlarr.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
      $result.running = $true
      if ($proc.CommandLine -and ($proc.CommandLine -match '-data=("([^"]+)"|([^\\s]+))')) {
        $dataPath = if ($matches[2]) { $matches[2] } else { $matches[3] }
        if ($dataPath) { $result.paths += (Join-Path $dataPath 'config.xml') }
      }
    }

    $result.paths += @(
      "$env:ProgramData\\Prowlarr\\config.xml",
      "$env:LOCALAPPDATA\\Prowlarr\\config.xml",
      "$env:APPDATA\\Prowlarr\\config.xml"
    )

    $result | ConvertTo-Json -Depth 4 -Compress
  `
  const r = await runPowerShell(script, 120000)
  if (r.code !== 0) return null
  try { return JSON.parse(String(r.stdout || '{}')) } catch (err) {
    console.warn('[provision] Failed to parse Prowlarr hints JSON:', err.message)
    return null
  }
}

async function getQbitHints() {
  const script = `
    $result = @{
      running = $false
      paths = @()
      exePaths = @()
    }
    $proc = Get-CimInstance Win32_Process -Filter "Name='qbittorrent.exe'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
      $result.running = $true
      if ($proc.ExecutablePath) { $result.exePaths += [string]$proc.ExecutablePath }
    }

    $result.paths += @(
      "$env:APPDATA\\qBittorrent\\qBittorrent.ini",
      "$env:LOCALAPPDATA\\qBittorrent\\qBittorrent.ini"
    )

    $result.exePaths += @(
      "$env:ProgramFiles\\qBittorrent\\qbittorrent.exe",
      "$env:ProgramFiles(x86)\\qBittorrent\\qbittorrent.exe",
      "$env:LOCALAPPDATA\\Programs\\qBittorrent\\qbittorrent.exe"
    )

    $result | ConvertTo-Json -Depth 4 -Compress
  `
  const r = await runPowerShell(script, 120000)
  if (r.code !== 0) return null
  try { return JSON.parse(String(r.stdout || '{}')) } catch (err) {
    console.warn('[provision] Failed to parse qBit hints JSON:', err.message)
    return null
  }
}

function normalizePathList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    const v = String(item || '').trim()
    if (!v) continue
    out.push(v)
  }
  return [...new Set(out)]
}

function normalizePortNumber(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 0
}

function buildPortCandidates(preferredPort, fallbackPorts = []) {
  const seen = new Set()
  const candidates = []
  const push = (value) => {
    const port = normalizePortNumber(value)
    if (!port || seen.has(port)) return
    seen.add(port)
    candidates.push(port)
  }

  push(preferredPort)
  for (const value of Array.isArray(fallbackPorts) ? fallbackPorts : []) {
    push(value)
  }
  return candidates
}

async function isTcpPortAvailable(port, host = '0.0.0.0') {
  const normalizedPort = normalizePortNumber(port)
  if (!normalizedPort) return false

  return await new Promise((resolve) => {
    const server = net.createServer()
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      try { server.close() } catch (_) {}
      resolve(Boolean(value))
    }

    server.unref()
    server.once('error', () => finish(false))
    server.listen({ port: normalizedPort, host, exclusive: true }, () => finish(true))
  })
}

async function findAvailableTcpPort(preferredPort, options = {}) {
  const fallbackPorts = Array.isArray(options.fallbackPorts) ? options.fallbackPorts : []
  const host = String(options.host || '0.0.0.0').trim() || '0.0.0.0'
  const candidates = buildPortCandidates(preferredPort, fallbackPorts)

  for (const port of candidates) {
    if (await isTcpPortAvailable(port, host)) {
      return port
    }
  }

  throw new Error(`No free TCP port available near ${normalizePortNumber(preferredPort) || 'requested value'}`)
}

function runPowerShell(script, timeoutMs = 180000) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true
      })
    } catch (err) {
      resolve({
        code: 1,
        stdout: '',
        stderr: String(err?.message || err || 'Failed to launch PowerShell')
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let done = false

    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { child.kill('SIGTERM') } catch (_) {}
      resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out` })
    }, timeoutMs)

    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', (err) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const message = String(err?.message || err || 'Failed to launch PowerShell')
      resolve({ code: 1, stdout, stderr: `${stderr}\n${message}`.trim() })
    })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ code: Number(code || 0), stdout, stderr })
    })
  })
}

async function canAccessQbitWithoutAuth(url) {
  const target = `${String(url || '').replace(/\/$/, '')}/api/v2/app/preferences`
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch (_) {
    return false
  }
}

async function tryInstallWinget(id, notes) {
  const hasWinget = await runPowerShell('if (Get-Command winget -ErrorAction SilentlyContinue) { "yes" }')
  if (!/yes/i.test(hasWinget.stdout || '')) {
    notes.push(`winget not found; cannot auto-install ${id}`)
    return false
  }
  const cmd = `winget install --id ${id} -e --silent --accept-source-agreements --accept-package-agreements`
  const r = await runPowerShell(cmd, 600000)
  if (r.code === 0) {
    notes.push(`Installed ${id} via winget`)
    return true
  }
  notes.push(`Failed to install ${id}: ${r.stderr || r.stdout}`.trim())
  return false
}

async function ensureFirewallRules(notes) {
  const script = `
    $rules = @(
      @{ Name = "PVTKRRX TCP 7000"; Protocol = "TCP"; Port = 7000 },
      @{ Name = "PVTKRRX TCP 7001"; Protocol = "TCP"; Port = 7001 },
      @{ Name = "PVTKRRX UDP 5353"; Protocol = "UDP"; Port = 5353 },
      @{ Name = "Stremio TCP 11470"; Protocol = "TCP"; Port = 11470 },
      @{ Name = "Stremio TCP 12470"; Protocol = "TCP"; Port = 12470 }
    )

    foreach ($r in $rules) {
      $name = [string]$r.Name
      $rule = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
      if (-not $rule) {
        New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol $r.Protocol -LocalPort $r.Port -Profile Private | Out-Null
      }
    }
    Write-Output 'ok'
  `
  const r = await runPowerShell(script, 120000)
  if (r.code === 0) {
    notes.push('Windows Firewall rules ensured for LAN ports 7000/7001, mDNS 5353, and Stremio 11470/12470')
    return true
  }
  notes.push('Firewall rule update failed (run installer/app as Administrator for LAN access)')
  return false
}

async function ensureWindowsLanAccess(options = {}) {
  const notes = Array.isArray(options.notes) ? options.notes : []

  if (process.platform !== 'win32') {
    return {
      ok: false,
      message: 'Windows LAN access automation only supports Windows.',
      firewallOk: false,
      mdnsReady: false,
      bonjour: null,
      notes
    }
  }

  const openFirewall = options.openFirewall !== false
  const ensureBonjour = options.ensureBonjour !== false
  const installBonjourIfMissing = options.installBonjourIfMissing === true
  const startIfStopped = options.startIfStopped !== false

  const firewallOk = openFirewall ? await ensureFirewallRules(notes) : true
  const bonjour = ensureBonjour
    ? await ensureBonjourMdns(installBonjourIfMissing, startIfStopped, notes)
    : null
  const mdnsReady = ensureBonjour ? Boolean(bonjour?.running) : true

  return {
    ok: firewallOk,
    message: firewallOk
      ? 'Windows LAN access checks completed.'
      : 'Windows LAN access checks completed with firewall gaps.',
    firewallOk,
    mdnsReady,
    bonjour,
    notes
  }
}

async function ensureBonjourMdns(installIfMissing, startIfStopped, notes) {
  async function readBonjourState() {
    const script = `
      $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Bonjour*' -or $_.DisplayName -like 'Bonjour*' } | Select-Object -First 1
      if ($svc) {
        @{
          installed = $true
          running = ($svc.Status -eq 'Running')
          name = [string]$svc.Name
          displayName = [string]$svc.DisplayName
        } | ConvertTo-Json -Compress
      } else {
        @{ installed = $false; running = $false; name = ''; displayName = '' } | ConvertTo-Json -Compress
      }
    `
    const result = await runPowerShell(script, 120000)
    if (result.code !== 0) return { installed: false, running: false, name: '', displayName: '' }
    try { return JSON.parse(String(result.stdout || '{}')) } catch (_) { return { installed: false, running: false, name: '', displayName: '' } }
  }

  let state = await readBonjourState()
  if (!state.installed && installIfMissing) {
    const installed =
      await tryInstallWinget('Apple.BonjourPrintServices', notes) ||
      await tryInstallWinget('Apple.Bonjour', notes)
    if (installed) state = await readBonjourState()
  }

  if (state.installed && startIfStopped && !state.running && state.name) {
    const startResult = await runPowerShell(`Start-Service -Name '${String(state.name).replace(/'/g, "''")}' -ErrorAction SilentlyContinue`, 120000)
    if (startResult.code === 0) state = await readBonjourState()
  }

  if (state.installed && state.running) {
    notes.push(`mDNS responder ready (${state.displayName || state.name})`)
  } else if (state.installed) {
    notes.push('Bonjour service detected but not running')
  } else {
    notes.push('Bonjour/mDNS service not detected; .local hostname discovery may fail on some devices')
  }

  return state
}

async function ensureProwlarrRunning(installIfMissing, startIfStopped, notes) {
  let discovered = await discoverProwlarrConfig()
  let installed = Boolean(discovered.installed)

  if (!installed && installIfMissing) {
    await tryInstallWinget('Prowlarr.Prowlarr', notes)
    discovered = await discoverProwlarrConfig()
    installed = Boolean(discovered.installed)
  }

  if (startIfStopped) {
    const script = `
      $svc = Get-Service -Name 'Prowlarr' -ErrorAction SilentlyContinue
      if ($svc) {
        if ($svc.Status -ne 'Running') { Start-Service -Name 'Prowlarr' -ErrorAction SilentlyContinue }
        Write-Output 'service'
        exit 0
      }
      $exe = @(
        "$env:ProgramData\\Prowlarr\\bin\\Prowlarr.exe",
        "$env:LOCALAPPDATA\\Prowlarr\\bin\\Prowlarr.exe"
      )
      foreach ($p in $exe) {
        if (Test-Path $p) { Start-Process -FilePath $p; Write-Output 'process'; exit 0 }
      }
      Write-Output 'missing'
      exit 1
    `
    const started = await runPowerShell(script)
    if (started.code === 0) notes.push('Prowlarr start attempted')
  }

  discovered = await discoverProwlarrConfig()
  const apiKey = String(discovered.apiKey || '').trim()
  const url = String(discovered.url || '').trim() || 'http://127.0.0.1:9696'
  const ready = Boolean(apiKey && (discovered.running || installed))

  if (ready) notes.push('Prowlarr config + API key detected')
  else notes.push('Prowlarr API key not found (open Prowlarr once if newly installed)')

  return {
    installed,
    running: Boolean(discovered.running || ready),
    url,
    apiKey
  }
}

async function discoverProwlarrConfig(options = {}) {
  const useHints = options.useHints !== false
  const hints = useHints ? await getProwlarrHints() : null
  const cfg = readFirstExisting(uniquePaths([
    ...normalizePathList(hints?.paths),
    ...getProwlarrConfigCandidates()
  ]))
  const xml = cfg ? cfg.content : ''
  const apiKey = parseXmlValue(xml, 'ApiKey')
  const port = parseInt(parseXmlValue(xml, 'Port') || '9696', 10)
  const urlBase = parseXmlValue(xml, 'UrlBase')
  const url = `http://127.0.0.1:${Number.isFinite(port) ? port : 9696}${urlBase ? `/${String(urlBase).replace(/^\/+/, '')}` : ''}`.replace(/\/+$/, '')

  return {
    installed: Boolean(cfg || hints?.serviceExists || (hints?.exePaths || []).length),
    running: Boolean(hints?.running),
    url,
    apiKey,
    configPath: cfg?.path || '',
    port: Number.isFinite(port) ? port : 9696
  }
}

async function ensureQbitRunning(installIfMissing, startIfStopped, configureLocalNoAuth, notes) {
  let discovered = await discoverQbitConfig()
  let installed = Boolean(discovered.installed)

  if (!installed && installIfMissing) {
    await tryInstallWinget('qBittorrent.qBittorrent', notes)
    discovered = await discoverQbitConfig()
    installed = Boolean(discovered.installed)
  }

  const wasRunning = Boolean(discovered.running)
  const configPath = String(discovered.configPath || '').trim()
  const initialIni = configPath ? readFirstExisting([configPath])?.content || '' : ''
  let settingsPatched = false
  let selectedPort = Number.isFinite(Number(discovered.port)) ? Number(discovered.port) : 8080

  if (startIfStopped && !wasRunning) {
    try {
      selectedPort = await findAvailableTcpPort(selectedPort || 8080, {
        fallbackPorts: [8085, 8090, 8095, 8100, 8180]
      })
    } catch (error) {
      notes.push(`qBittorrent WebUI port check failed: ${error.message}`)
    }
  }

  if (startIfStopped && !wasRunning && selectedPort !== Number(discovered.port || 0)) {
    notes.push(`qBittorrent WebUI port moved to ${selectedPort} to avoid a conflict`)
  }

  if ((configureLocalNoAuth || (startIfStopped && !wasRunning)) && configPath) {
    let patched = initialIni
    if (!patched) patched = '[Preferences]\r\n'
    if (startIfStopped && !wasRunning) {
      patched = upsertIniValue(patched, 'WebUI\\Port', String(selectedPort))
    }
    if (configureLocalNoAuth) {
      patched = upsertIniValue(patched, 'WebUI\\LocalHostAuth', 'false')
      patched = upsertIniValue(patched, 'WebUI\\AuthSubnetWhitelistEnabled', 'true')
      patched = upsertIniValue(patched, 'WebUI\\AuthSubnetWhitelist', '127.0.0.1/32,::1/128')
    }

    if (patched !== initialIni) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, patched, 'utf8')
      settingsPatched = true
      if (configureLocalNoAuth) notes.push('qBittorrent localhost auth updated for zero-config addon access')
    }
  }

  if (configureLocalNoAuth && !configPath) {
    notes.push('qBittorrent config file not found yet; localhost auth will be applied after first launch')
  }

  if (startIfStopped) {
    const startScript = `
      $proc = Get-Process -Name qbittorrent -ErrorAction SilentlyContinue
      if ($proc) { Write-Output 'running'; exit 0 }
      $paths = @(
        "$env:ProgramFiles\\qBittorrent\\qbittorrent.exe",
        "$env:ProgramFiles(x86)\\qBittorrent\\qbittorrent.exe",
        "$env:LOCALAPPDATA\\Programs\\qBittorrent\\qbittorrent.exe"
      )
      foreach ($p in $paths) {
        if (Test-Path $p) { Start-Process -FilePath $p; Write-Output 'started'; exit 0 }
      }
      Write-Output 'missing'
      exit 1
    `
    const started = await runPowerShell(startScript)
    if (started.code === 0) notes.push('qBittorrent start attempted')
  }

  if (settingsPatched && startIfStopped && wasRunning) {
    const hintsAfterPatch = await getQbitHints()
    const preferredExe = [...normalizePathList(hintsAfterPatch?.exePaths), ...QBIT_EXE_PATHS]
      .find(p => fs.existsSync(p))
    if (preferredExe) {
      const escaped = preferredExe.replace(/'/g, "''")
      const restartScript = `
        Stop-Process -Name qbittorrent -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Start-Process -FilePath '${escaped}'
        Start-Sleep -Seconds 2
        Write-Output 'restarted'
      `
      const restarted = await runPowerShell(restartScript, 120000)
      if (restarted.code === 0) notes.push('qBittorrent restarted to apply localhost auth settings')
    }
  }

  discovered = await discoverQbitConfig()
  const url = String(discovered.url || '').trim() || `http://127.0.0.1:${selectedPort || 8080}`
  const username = String(discovered.username || '').trim()
  const localHostAuthDisabled = Boolean(discovered.localHostAuthDisabled)
  let running = Boolean(discovered.running)

  if (!running && startIfStopped) {
    const hintsAfter = await getQbitHints()
    for (const exe of [...normalizePathList(hintsAfter?.exePaths), ...QBIT_EXE_PATHS]) {
      try {
        if (fs.existsSync(exe)) {
          await runPowerShell(`Start-Process -FilePath '${exe.replace(/'/g, "''")}'`)
          break
        }
      } catch (_) {
        // ignore
      }
    }
    discovered = await discoverQbitConfig()
    running = Boolean(discovered.running)
  }

  let localhostApiReady = false
  if (configureLocalNoAuth && localHostAuthDisabled) {
    localhostApiReady = await canAccessQbitWithoutAuth(url)
    if (!localhostApiReady && startIfStopped) {
      const hintsAfter = await getQbitHints()
      const retryExe = [...normalizePathList(hintsAfter?.exePaths), ...QBIT_EXE_PATHS]
        .find(p => fs.existsSync(p))
      if (retryExe) {
        const escaped = retryExe.replace(/'/g, "''")
        const restartScript = `
          Stop-Process -Name qbittorrent -Force -ErrorAction SilentlyContinue
          Start-Sleep -Seconds 2
          Start-Process -FilePath '${escaped}'
          Start-Sleep -Seconds 2
          Write-Output 'restarted'
        `
        const restarted = await runPowerShell(restartScript, 120000)
        if (restarted.code === 0) {
          notes.push('qBittorrent restarted to clear auth lock and apply localhost access')
          localhostApiReady = await canAccessQbitWithoutAuth(url)
        }
      }
    }
  }

  if (!localHostAuthDisabled) {
    notes.push('qBittorrent may still require WebUI credentials')
  } else if (!localhostApiReady && configureLocalNoAuth) {
    notes.push('qBittorrent localhost auth is disabled in config, but API is still refusing anonymous access')
  } else {
    notes.push('qBittorrent localhost access ready (no WebUI login required from addon)')
  }

  return {
    installed,
    running,
    url: selectedPort > 0 ? `http://127.0.0.1:${selectedPort}` : url,
    username: (localHostAuthDisabled && localhostApiReady) ? '' : (username || ''),
    localHostAuthDisabled,
    localApiReady: localhostApiReady,
    savePath: String(discovered.savePath || '').trim(),
    configPath
  }
}

async function discoverQbitConfig(options = {}) {
  const useHints = options.useHints !== false
  const hints = useHints ? await getQbitHints() : null
  const cfg = readFirstExisting(uniquePaths([
    ...normalizePathList(hints?.paths),
    ...getQbitConfigCandidates()
  ]))
  const iniText = cfg ? cfg.content : ''
  const port = parseInt(parseIniValue(iniText, 'WebUI\\Port') || '8080', 10)
  const username = parseIniValue(iniText, 'WebUI\\Username')
  const savePath = parseIniValue(iniText, 'Session\\DefaultSavePath')
  const localHostAuth = parseIniValue(iniText, 'WebUI\\LocalHostAuth')
  const queueingSystemEnabled = parseIniValue(iniText, 'Session\\QueueingSystemEnabled') || parseIniValue(iniText, 'QueueingSystemEnabled')

  return {
    installed: Boolean(cfg || (hints?.exePaths || []).length || hints?.running),
    running: Boolean(hints?.running),
    url: `http://127.0.0.1:${Number.isFinite(port) ? port : 8080}`,
    username,
    savePath,
    localHostAuthDisabled: String(localHostAuth || '').toLowerCase() === 'false',
    queueingEnabled: String(queueingSystemEnabled || '').toLowerCase() === 'true',
    configPath: cfg?.path || '',
    port: Number.isFinite(port) ? port : 8080
  }
}

function normalizeProwlarrResourceName(value) {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function normalizeUrlBase(input) {
  return String(input || '').trim().replace(/\/+$/, '')
}

function cloneContractFields(fields) {
  return (Array.isArray(fields) ? fields : []).map(field => ({ ...field }))
}

function getContractField(fields, names) {
  const wanted = new Set((Array.isArray(names) ? names : [names]).map(name => normalizeProwlarrResourceName(name)))
  return (Array.isArray(fields) ? fields : []).find((field) => {
    const fieldName = normalizeProwlarrResourceName(field?.name || field?.label || '')
    return fieldName && wanted.has(fieldName)
  }) || null
}

function setContractField(fields, names, value) {
  const field = getContractField(fields, names)
  if (field) field.value = value
}

function parseQbitUrl(input) {
  const text = normalizeUrlBase(input)
  if (!text) throw new Error('qBittorrent URL is required')

  const parsed = new URL(text)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('qBittorrent URL must use http or https')
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80),
    useSsl: parsed.protocol === 'https:',
    urlBase: parsed.pathname.replace(/^\/+|\/+$/g, '')
  }
}

function buildQbitDownloadClientResource(schema, qbitUrl, options = {}, existingResource = null) {
  const target = parseQbitUrl(qbitUrl)
  const resource = {
    ...(schema || {}),
    ...(existingResource || {})
  }

  resource.name = String(existingResource?.name || schema?.name || 'qBittorrent').trim() || 'qBittorrent'
  resource.enable = true
  resource.protocol = 'torrent'
  resource.priority = Number.isFinite(Number(options.priority))
    ? Number(options.priority)
    : (Number.isFinite(Number(existingResource?.priority)) ? Number(existingResource.priority) : (Number.isFinite(Number(schema?.priority)) ? Number(schema.priority) : 1))
  resource.categories = Array.isArray(existingResource?.categories)
    ? existingResource.categories
    : (Array.isArray(schema?.categories) ? schema.categories : [])
  resource.supportsCategories = typeof existingResource?.supportsCategories === 'boolean'
    ? existingResource.supportsCategories
    : Boolean(schema?.supportsCategories)
  resource.implementationName = String(schema?.implementationName || existingResource?.implementationName || 'qBittorrent')
  resource.implementation = String(schema?.implementation || existingResource?.implementation || 'qBittorrent')
  resource.configContract = String(schema?.configContract || existingResource?.configContract || 'QBittorrentSettings')
  resource.fields = cloneContractFields(schema?.fields || existingResource?.fields || [])

  const queueingEnabled = Boolean(options.queueingEnabled)

  setContractField(resource.fields, ['Host', 'host'], target.host)
  setContractField(resource.fields, ['Port', 'port'], target.port)
  setContractField(resource.fields, ['UseSsl', 'useSsl', 'useSSL'], target.useSsl)
  setContractField(resource.fields, ['UrlBase', 'urlBase', 'baseUrl'], target.urlBase)
  setContractField(resource.fields, ['Username', 'username'], String(options.username || ''))
  setContractField(resource.fields, ['Password', 'password'], String(options.password || ''))
  setContractField(resource.fields, ['DefaultCategory', 'Category', 'category'], String(options.category || 'prowlarr'))
  setContractField(resource.fields, ['Priority', 'priority'], Number.isFinite(Number(options.priority))
    ? Number(options.priority)
    : (queueingEnabled ? 1 : 0))
  if (typeof options.initialState !== 'undefined') {
    setContractField(resource.fields, ['DownloadClientSettingsInitialState', 'initialState'], options.initialState)
  }
  if (typeof options.sequentialOrder !== 'undefined') {
    setContractField(resource.fields, ['DownloadClientQbittorrentSettingsSequentialOrder', 'sequentialOrder'], Boolean(options.sequentialOrder))
  }
  if (typeof options.firstAndLast !== 'undefined') {
    setContractField(resource.fields, ['DownloadClientQbittorrentSettingsFirstAndLastFirst', 'firstAndLast'], Boolean(options.firstAndLast))
  }
  if (typeof options.contentLayout !== 'undefined') {
    setContractField(resource.fields, ['DownloadClientQbittorrentSettingsContentLayout', 'contentLayout'], options.contentLayout)
  }

  if (existingResource?.id != null) {
    resource.id = existingResource.id
  } else {
    delete resource.id
  }

  return resource
}

function sameQbitConnection(resource, target) {
  const fields = Array.isArray(resource?.fields) ? resource.fields : []
  const host = String(getContractField(fields, ['Host', 'host'])?.value || '').trim().toLowerCase()
  const port = Number.parseInt(String(getContractField(fields, ['Port', 'port'])?.value || '0'), 10) || 0
  const urlBase = normalizeUrlBase(getContractField(fields, ['UrlBase', 'urlBase', 'baseUrl'])?.value || '').toLowerCase()
  const useSsl = Boolean(getContractField(fields, ['UseSsl', 'useSsl', 'useSSL'])?.value)
  return host === String(target.host || '').trim().toLowerCase() &&
    port === Number(target.port || 0) &&
    urlBase === String(target.urlBase || '').trim().toLowerCase() &&
    useSsl === Boolean(target.useSsl)
}

function findExistingQbitDownloadClient(clients, target) {
  const rows = Array.isArray(clients) ? clients : []
  const qbitClients = rows.filter((row) => {
    const contract = normalizeProwlarrResourceName(row?.configContract || row?.config_contract || '')
    const impl = normalizeProwlarrResourceName(row?.implementationName || row?.implementation_name || '')
    const name = normalizeProwlarrResourceName(row?.name || '')
    return contract === 'qbittorrentsettings' || impl.includes('qbittorrent') || name.includes('qbittorrent')
  })
  if (qbitClients.length === 0) return null

  const exact = qbitClients.find((row) => sameQbitConnection(row, target))
  return exact || qbitClients[0]
}

async function ensureProwlarrQbitDownloadClient(options = {}) {
  const result = {
    ok: false,
    skipped: false,
    action: '',
    message: '',
    error: null,
    client: null
  }

  const prowlarrUrl = normalizeUrlBase(options.prowlarrUrl || options.jackettUrl || '')
  const prowlarrApiKey = String(options.prowlarrApiKey || options.jackettApiKey || '').trim()
  const qbitUrl = normalizeUrlBase(options.qbitUrl || '')

  if (!prowlarrUrl || !prowlarrApiKey || !qbitUrl) {
    result.skipped = true
    result.message = 'Prowlarr qBittorrent download client skipped because the Prowlarr or qBittorrent URL/API key was missing.'
    return result
  }

  try {
    const client = new ProwlarrClient(prowlarrUrl, prowlarrApiKey)
    const [clients, schemas] = await Promise.all([
      client.listDownloadClients(),
      client.listDownloadClientSchemas()
    ])
    const schema = (Array.isArray(schemas) ? schemas : []).find((row) => {
      const contract = normalizeProwlarrResourceName(row?.configContract || row?.config_contract || '')
      const impl = normalizeProwlarrResourceName(row?.implementationName || row?.implementation_name || '')
      return contract === 'qbittorrentsettings' || impl.includes('qbittorrent')
    })
    if (!schema) {
      throw new Error('Prowlarr qBittorrent download client schema was not found')
    }

    const target = parseQbitUrl(qbitUrl)
    const existing = findExistingQbitDownloadClient(clients, target)
    const resource = buildQbitDownloadClientResource(
      schema,
      qbitUrl,
      {
        username: options.qbitUsername || '',
        password: options.qbitPassword || '',
        category: options.category || 'prowlarr',
        priority: options.priority,
        initialState: options.initialState,
        sequentialOrder: options.sequentialOrder,
        firstAndLast: options.firstAndLast,
        contentLayout: options.contentLayout
      },
      existing
    )

    let saved
    if (existing?.id != null) {
      saved = await client.updateDownloadClient(existing.id, resource)
      result.action = 'updated'
    } else {
      saved = await client.createDownloadClient(resource)
      result.action = 'created'
    }

    const testResource = {
      ...(saved || resource || {}),
      name: `${String(resource.name || 'qBittorrent').trim()}__pvtkrrx_test__${Date.now()}`
    }
    await client.testDownloadClient(testResource)
    result.ok = true
    result.client = saved || resource
    result.message = `Prowlarr qBittorrent download client ${result.action}`
    return result
  } catch (error) {
    result.error = error
    result.message = error?.message || String(error)
    return result
  }
}

async function autoProvisionWindows(options = {}) {
  const installIfMissing = options.installIfMissing !== false
  const startIfStopped = options.startIfStopped !== false
  const configureQbitLocalNoAuth = options.configureQbitLocalNoAuth !== false
  const openFirewall = options.openFirewall !== false
  const localHostname = normalizeLocalHostname(options.localHostname || deriveDefaultLocalHostname())
  const notes = []

  if (process.platform !== 'win32') {
    return {
      ok: false,
      message: 'Auto provision currently supports Windows only.',
      notes
    }
  }

  const prowlarr = await ensureProwlarrRunning(installIfMissing, startIfStopped, notes)
  const qbit = await ensureQbitRunning(installIfMissing, startIfStopped, configureQbitLocalNoAuth, notes)
  const downloadClientResult = await ensureProwlarrQbitDownloadClient({
    prowlarrUrl: prowlarr.url,
    prowlarrApiKey: prowlarr.apiKey || '',
    qbitUrl: qbit.url,
    qbitUsername: qbit.username || '',
    qbitPassword: qbit.password || '',
    queueingEnabled: Boolean(qbit.queueingEnabled),
    notes
  })
  if (downloadClientResult.message) notes.push(downloadClientResult.message)
  const lanAccess = await ensureWindowsLanAccess({
    notes,
    openFirewall,
    ensureBonjour: true,
    installBonjourIfMissing: installIfMissing,
    startIfStopped
  })
  const bonjour = lanAccess.bonjour

  const config = {
    jackettUrl: prowlarr.url,
    jackettApiKey: prowlarr.apiKey || '',
    qbitUrl: qbit.url,
    qbitUsername: qbit.username || '',
    qbitPassword: '',
    fileServerUrl: '',
    fileServerAuth: '',
    pathMapping: { from: '', to: '' },
    additionalStorageRoots: [],
    maxResults: 50,
    autoDeleteWatched: true,
    watchedDeleteGraceSeconds: 300,
    localHostname
  }

  const ok = Boolean(config.jackettUrl && config.jackettApiKey && config.qbitUrl)
  return {
    ok,
    message: ok
      ? 'Prowlarr + qBittorrent prepared. Local config generated.'
      : 'Provisioning completed with gaps. Check notes.',
    prowlarr,
    qbit,
    bonjour,
    config,
    notes
  }
}

module.exports = {
  autoProvisionWindows,
  ensureWindowsLanAccess,
  discoverProwlarrConfig,
  discoverQbitConfig,
  ensureProwlarrQbitDownloadClient,
  findAvailableTcpPort,
  isTcpPortAvailable
}
