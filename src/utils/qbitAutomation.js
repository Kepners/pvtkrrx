const fs = require('fs')
const path = require('path')
const { resolveRuntimeDir } = require('./runtimeDir')

const QBIT_POSTPROCESS_SCRIPT_NAME = 'qbit-postprocess.ps1'

function normalizePathKey(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function normalizeNameKey(value) {
  return String(value || '').trim().toLowerCase()
}

function toProgramPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function getQbitPostProcessScriptPath(env = process.env) {
  return path.join(resolveRuntimeDir(env), QBIT_POSTPROCESS_SCRIPT_NAME)
}

function buildQbitPostProcessScript(baseUrl) {
  const targetBaseUrl = String(baseUrl || 'http://127.0.0.1:7000').trim() || 'http://127.0.0.1:7000'
  return [
    'param(',
    "  [string]$CompletedPath = '',",
    "  [string]$TorrentName = '',",
    `  [string]$BaseUrl = '${targetBaseUrl.replace(/'/g, "''")}'`,
    ')',
    '',
    '$payload = @{',
    '  completedPath = $CompletedPath',
    '  torrentName = $TorrentName',
    '}',
    '',
    'try {',
    "  $body = $payload | ConvertTo-Json -Compress",
    "  Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + '/local/qbit/postprocess') -ContentType 'application/json' -Body $body -TimeoutSec 45 | Out-Null",
    '} catch {',
    '  exit 0',
    '}',
    '',
    'exit 0',
    ''
  ].join('\r\n')
}

function ensureQbitPostProcessScript(baseUrl, env = process.env) {
  const scriptPath = getQbitPostProcessScriptPath(env)
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, buildQbitPostProcessScript(baseUrl), 'utf8')
  return scriptPath
}

function buildQbitAutorunProgram(scriptPath, baseUrl) {
  const normalizedScriptPath = toProgramPath(scriptPath)
  const normalizedBaseUrl = String(baseUrl || 'http://127.0.0.1:7000').trim() || 'http://127.0.0.1:7000'
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${normalizedScriptPath}" "%f" "%n" "${normalizedBaseUrl}"`
}

function isManagedQbitAutorunProgram(program) {
  const normalized = String(program || '').trim().toLowerCase()
  return normalized.includes(QBIT_POSTPROCESS_SCRIPT_NAME.toLowerCase())
}

function describeQbitAutorunMode(prefs = {}) {
  const autorunEnabled = Boolean(prefs?.autorun_enabled)
  const autorunProgram = String(prefs?.autorun_program || '').trim()
  const managed = autorunEnabled && isManagedQbitAutorunProgram(autorunProgram)

  if (managed) {
    return {
      autorunEnabled,
      autorunProgram,
      managedByPvtkrrx: true,
      mode: 'qbit-completion-hook',
      label: 'qBittorrent completion hook -> PVTKRRX extractor'
    }
  }

  if (autorunEnabled) {
    return {
      autorunEnabled,
      autorunProgram,
      managedByPvtkrrx: false,
      mode: 'external-program',
      label: 'External qBittorrent completion program'
    }
  }

  return {
    autorunEnabled,
    autorunProgram,
    managedByPvtkrrx: false,
    mode: 'pvtkrrx-on-demand',
    label: 'PVTKRRX on-demand extraction only'
  }
}

function findTorrentForPostProcess(torrents, completedPath, torrentName) {
  const pathKey = normalizePathKey(completedPath)
  const basenameKey = normalizePathKey(path.basename(String(completedPath || '')))
  const torrentNameKey = normalizeNameKey(torrentName)

  let best = null
  let bestScore = -1
  for (const torrent of Array.isArray(torrents) ? torrents : []) {
    const progress = Number(torrent?.progress || 0)
    if (!Number.isFinite(progress) || progress < 0.999) continue

    const contentPathKey = normalizePathKey(torrent?.content_path)
    const savePathKey = normalizePathKey(torrent?.save_path || torrent?.download_path)
    const nameKey = normalizeNameKey(torrent?.name)
    const expectedFolderKey = savePathKey && nameKey ? `${savePathKey}/${nameKey}` : ''
    const expectedFileKey = savePathKey && nameKey ? normalizePathKey(path.join(torrent.save_path || torrent.download_path || '', torrent.name || '')) : ''

    let score = 0
    if (pathKey) {
      if (contentPathKey && contentPathKey === pathKey) score += 400
      if (expectedFolderKey && expectedFolderKey === pathKey) score += 360
      if (expectedFileKey && expectedFileKey === pathKey) score += 340
      if (contentPathKey && pathKey.startsWith(`${contentPathKey}/`)) score += 220
      if (expectedFolderKey && pathKey.startsWith(`${expectedFolderKey}/`)) score += 180
      if (contentPathKey && basenameKey && contentPathKey.endsWith(`/${basenameKey}`)) score += 80
    }
    if (torrentNameKey && nameKey && torrentNameKey === nameKey) score += 160
    if (torrentNameKey && basenameKey && torrentNameKey === basenameKey) score += 40

    if (score > bestScore) {
      best = torrent
      bestScore = score
    }
  }

  return bestScore > 0 ? best : null
}

module.exports = {
  getQbitPostProcessScriptPath,
  ensureQbitPostProcessScript,
  buildQbitAutorunProgram,
  isManagedQbitAutorunProgram,
  describeQbitAutorunMode,
  findTorrentForPostProcess
}
