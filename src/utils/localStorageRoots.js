const fs = require('fs')
const path = require('path')
const { redactSensitiveText } = require('./logRedaction')

function normalizeTorrentPath(relPath) {
  return String(relPath || '').replace(/[\\/]+/g, '/').replace(/^\/+/, '')
}

function sanitizeStorageRoot(value) {
  let input = String(value || '').trim()
  if (!input) return ''
  input = input.replace(/^['"]+|['"]+$/g, '')
  try {
    input = path.normalize(input)
  } catch (err) {
    console.warn('[storage] Path normalization failed:', redactSensitiveText(err.message))
  }

  while (input.length > 3 && /[\\/]$/.test(input)) {
    input = input.slice(0, -1)
  }
  return input
}

function normalizeLocalStorageRoots(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/\r?\n/g)
        .map(entry => entry.trim())

  const out = []
  const seen = new Set()
  for (const entry of list) {
    const root = sanitizeStorageRoot(entry)
    if (!root) continue
    const key = root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}

function pushUniqueCandidate(candidates, seen, candidate) {
  const value = String(candidate || '').trim()
  if (!value) return
  const normalized = path.normalize(value)
  const key = normalized.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  candidates.push(normalized)
}

function buildLocalFileCandidates(torrent, relPath, additionalStorageRoots = []) {
  const normalized = normalizeTorrentPath(relPath)
  const normalizedFsPath = normalized ? normalized.split('/').join(path.sep) : ''
  const candidates = []
  const seen = new Set()
  const info = torrent && typeof torrent === 'object' ? torrent : {}

  if (info.save_path && normalizedFsPath) {
    pushUniqueCandidate(candidates, seen, path.join(info.save_path, normalizedFsPath))
  }
  if (info.download_path && normalizedFsPath) {
    pushUniqueCandidate(candidates, seen, path.join(info.download_path, normalizedFsPath))
  }

  const contentPath = String(info.content_path || '').trim()
  const contentBaseName = contentPath ? path.basename(contentPath) : ''
  if (contentPath) {
    pushUniqueCandidate(candidates, seen, contentPath)
    try {
      if (fs.existsSync(contentPath) && fs.statSync(contentPath).isDirectory() && normalizedFsPath) {
        pushUniqueCandidate(candidates, seen, path.join(contentPath, normalizedFsPath))
      }
    } catch (err) {
      console.warn('[storage] Content path check failed:', redactSensitiveText(err.message))
    }
    if (normalized && contentPath.toLowerCase().endsWith(`\\${normalized.toLowerCase().replace(/\//g, '\\')}`)) {
      pushUniqueCandidate(candidates, seen, contentPath)
    }
  }

  for (const root of normalizeLocalStorageRoots(additionalStorageRoots)) {
    if (normalizedFsPath) {
      pushUniqueCandidate(candidates, seen, path.join(root, normalizedFsPath))
      pushUniqueCandidate(candidates, seen, path.join(root, path.basename(normalizedFsPath)))
    }
    if (contentBaseName && normalizedFsPath) {
      pushUniqueCandidate(candidates, seen, path.join(root, contentBaseName, normalizedFsPath))
    } else if (contentBaseName) {
      pushUniqueCandidate(candidates, seen, path.join(root, contentBaseName))
    }
  }

  return candidates
}

function findExistingLocalFilePath(torrent, relPath, additionalStorageRoots = []) {
  const candidates = buildLocalFileCandidates(torrent, relPath, additionalStorageRoots)
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch (err) {
      console.warn('[storage] File existence check failed:', redactSensitiveText(err.message))
    }
  }
  return candidates[0] || ''
}

function hasAccessibleLocalFile(torrent, relPath, additionalStorageRoots = []) {
  const candidates = buildLocalFileCandidates(torrent, relPath, additionalStorageRoots)
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return true
    } catch (err) {
      console.warn('[storage] File existence check failed:', redactSensitiveText(err.message))
    }
  }
  return false
}

module.exports = {
  normalizeTorrentPath,
  normalizeLocalStorageRoots,
  buildLocalFileCandidates,
  findExistingLocalFilePath,
  hasAccessibleLocalFile
}
