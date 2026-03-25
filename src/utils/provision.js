const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { deriveDefaultLocalHostname, normalizeLocalHostname } = require('./lanAlias')

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
  const hintsBefore = await getProwlarrHints()
  const cfgCandidates = [
    ...normalizePathList(hintsBefore?.paths),
    ...PROWLARR_CONFIG_PATHS
  ]
  let cfg = readFirstExisting(cfgCandidates)
  let installed = Boolean(cfg || hintsBefore?.serviceExists || (hintsBefore?.exePaths || []).length)

  if (!installed && installIfMissing) {
    await tryInstallWinget('Prowlarr.Prowlarr', notes)
    const hintsAfterInstall = await getProwlarrHints()
    cfg = readFirstExisting([
      ...normalizePathList(hintsAfterInstall?.paths),
      ...PROWLARR_CONFIG_PATHS
    ])
    installed = Boolean(cfg || hintsAfterInstall?.serviceExists || (hintsAfterInstall?.exePaths || []).length)
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

  const hintsAfter = await getProwlarrHints()
  cfg = readFirstExisting([
    ...normalizePathList(hintsAfter?.paths),
    ...cfgCandidates
  ]) || cfg
  const xml = cfg ? cfg.content : ''
  const apiKey = parseXmlValue(xml, 'ApiKey')
  const port = parseInt(parseXmlValue(xml, 'Port') || '9696', 10)
  const url = `http://127.0.0.1:${Number.isFinite(port) ? port : 9696}`
  const ready = Boolean(apiKey && (hintsAfter?.running || hintsBefore?.running || installed))

  if (ready) notes.push('Prowlarr config + API key detected')
  else notes.push('Prowlarr API key not found (open Prowlarr once if newly installed)')

  return {
    installed,
    running: Boolean(hintsAfter?.running || hintsBefore?.running || ready),
    url,
    apiKey
  }
}

async function discoverProwlarrConfig() {
  const hints = await getProwlarrHints()
  const cfg = readFirstExisting([
    ...normalizePathList(hints?.paths),
    ...PROWLARR_CONFIG_PATHS
  ])
  const xml = cfg ? cfg.content : ''
  const apiKey = parseXmlValue(xml, 'ApiKey')
  const port = parseInt(parseXmlValue(xml, 'Port') || '9696', 10)
  const url = `http://127.0.0.1:${Number.isFinite(port) ? port : 9696}`

  return {
    installed: Boolean(cfg || hints?.serviceExists || (hints?.exePaths || []).length),
    running: Boolean(hints?.running),
    url,
    apiKey
  }
}

async function ensureQbitRunning(installIfMissing, startIfStopped, configureLocalNoAuth, notes) {
  const hintsBefore = await getQbitHints()
  const iniCandidates = [
    ...normalizePathList(hintsBefore?.paths),
    ...QBIT_CONFIG_PATHS
  ]
  let ini = readFirstExisting(iniCandidates)
  let installed = Boolean(
    ini ||
    (hintsBefore?.exePaths || []).some(p => fs.existsSync(p)) ||
    hintsBefore?.running
  )

  if (!installed && installIfMissing) {
    await tryInstallWinget('qBittorrent.qBittorrent', notes)
    const hintsAfterInstall = await getQbitHints()
    ini = readFirstExisting([
      ...normalizePathList(hintsAfterInstall?.paths),
      ...QBIT_CONFIG_PATHS
    ])
    installed = Boolean(
      ini ||
      (hintsAfterInstall?.exePaths || []).some(p => fs.existsSync(p)) ||
      hintsAfterInstall?.running
    )
  }

  let iniText = ini ? ini.content : ''
  let settingsPatched = false

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

  const hintsAfterStart = await getQbitHints()
  ini = readFirstExisting([
    ...normalizePathList(hintsAfterStart?.paths),
    ...iniCandidates
  ]) || ini
  iniText = ini ? ini.content : iniText

  if (configureLocalNoAuth && ini && iniText) {
    let patched = iniText
    patched = upsertIniValue(patched, 'WebUI\\LocalHostAuth', 'false')
    patched = upsertIniValue(patched, 'WebUI\\AuthSubnetWhitelistEnabled', 'true')
    patched = upsertIniValue(patched, 'WebUI\\AuthSubnetWhitelist', '127.0.0.1/32,::1/128')

    if (patched !== iniText) {
      fs.writeFileSync(ini.path, patched, 'utf8')
      iniText = patched
      settingsPatched = true
      notes.push('qBittorrent localhost auth updated for zero-config addon access')
    }
  }

  let runningCheck = await runPowerShell(`if (Get-Process -Name qbittorrent -ErrorAction SilentlyContinue) { "yes" } else { "no" }`)
  let running = /yes/i.test(runningCheck.stdout || '') || Boolean(hintsAfterStart?.running)

  const preferredExe = [...normalizePathList(hintsAfterStart?.exePaths), ...QBIT_EXE_PATHS]
    .find(p => fs.existsSync(p))

  if (settingsPatched && running && startIfStopped && preferredExe) {
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

  const hintsAfter = await getQbitHints()
  ini = readFirstExisting([
    ...normalizePathList(hintsAfter?.paths),
    ...iniCandidates
  ]) || ini
  iniText = ini ? ini.content : iniText

  const port = parseInt(parseIniValue(iniText, 'WebUI\\Port') || '8080', 10)
  const username = parseIniValue(iniText, 'WebUI\\Username')
  const localHostAuth = parseIniValue(iniText, 'WebUI\\LocalHostAuth')

  const url = `http://127.0.0.1:${Number.isFinite(port) ? port : 8080}`
  runningCheck = await runPowerShell(`if (Get-Process -Name qbittorrent -ErrorAction SilentlyContinue) { "yes" } else { "no" }`)
  running = /yes/i.test(runningCheck.stdout || '') || Boolean(hintsAfter?.running)

  if (!running && startIfStopped) {
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
  }

  const localhostAuthDisabled = String(localHostAuth || '').toLowerCase() === 'false'

  let localhostApiReady = false
  if (configureLocalNoAuth && localhostAuthDisabled) {
    localhostApiReady = await canAccessQbitWithoutAuth(url)
    if (!localhostApiReady && startIfStopped) {
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

  if (!localhostAuthDisabled) {
    notes.push('qBittorrent may still require WebUI credentials')
  } else if (!localhostApiReady && configureLocalNoAuth) {
    notes.push('qBittorrent localhost auth is disabled in config, but API is still refusing anonymous access')
  } else {
    notes.push('qBittorrent localhost access ready (no WebUI login required from addon)')
  }

  return {
    installed,
    running,
    url,
    username: (localhostAuthDisabled && localhostApiReady) ? '' : (username || ''),
    localHostAuthDisabled: localhostAuthDisabled,
    localApiReady: localhostApiReady
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
    sportsDbApiKey: '123',
    sportsDbCacheHours: 24,
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
  discoverProwlarrConfig
}
