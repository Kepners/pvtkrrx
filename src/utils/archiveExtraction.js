const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { path7za } = require('7zip-bin')
const { findExistingLocalFilePath } = require('./localStorageRoots')
const { findPackedArchiveFiles, isSampleVideoName } = require('./streams')

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.wmv', '.ts', '.m4v', '.mov'])
const EXTRACTION_DIR_NAME = '.pvtkrrx-extracted'
const EXTRACTION_MARKER_NAME = '.pvtkrrx-ready.json'
const EXTRACTION_TIMEOUT_MS = Math.max(
  60 * 1000,
  parseInt(process.env.PVTKRRX_ARCHIVE_EXTRACT_TIMEOUT_MS || String(15 * 60 * 1000), 10)
)

const extractionJobs = new Map()
const extractionState = new Map()

function normalizeHash(value) {
  return String(value || '').trim().toLowerCase()
}

function canExtractPackedArchives() {
  return Boolean(path7za && fs.existsSync(path7za))
}

function getArchiveExtractionDir(torrent) {
  const hash = normalizeHash(torrent?.hash)
  const baseDir = String(torrent?.save_path || torrent?.download_path || '').trim()
  if (!hash || !baseDir) return ''
  return path.join(path.normalize(baseDir), EXTRACTION_DIR_NAME, hash)
}

function getArchiveExtractionMarkerPath(torrent) {
  const outputDir = getArchiveExtractionDir(torrent)
  return outputDir ? path.join(outputDir, EXTRACTION_MARKER_NAME) : ''
}

function readExtractionMarker(torrent) {
  const markerPath = getArchiveExtractionMarkerPath(torrent)
  if (!markerPath || !fs.existsSync(markerPath)) return null

  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (_) {
    return null
  }
}

function isVideoPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

function listFilesRecursive(rootDir) {
  const out = []
  if (!rootDir || !fs.existsSync(rootDir)) return out

  const queue = [rootDir]
  while (queue.length > 0) {
    const current = queue.shift()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (_) {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }
      if (entry.isFile()) out.push(fullPath)
    }
  }

  return out
}

function pickBestExtractedVideo(files) {
  const candidates = files
    .filter(filePath => isVideoPath(filePath))
    .map(filePath => {
      let stat = null
      try {
        stat = fs.statSync(filePath)
      } catch (_) {
        stat = null
      }
      return {
        filePath,
        size: Number(stat?.size || 0),
        sample: isSampleVideoName(path.basename(filePath))
      }
    })
    .filter(entry => entry.size > 0)
    .sort((left, right) => {
      if (left.sample !== right.sample) return left.sample ? 1 : -1
      if (right.size !== left.size) return right.size - left.size
      return left.filePath.localeCompare(right.filePath, undefined, { numeric: true, sensitivity: 'base' })
    })

  return candidates[0]?.filePath || ''
}

function findExtractedArchiveVideoPath(torrent) {
  const marker = readExtractionMarker(torrent)
  const rawMarkerPath = String(marker?.videoPath || '').trim()
  if (!rawMarkerPath) return ''

  const markerPath = path.normalize(rawMarkerPath)
  if (markerPath && markerPath !== '.' && fs.existsSync(markerPath)) {
    return markerPath
  }
  return ''
}

function resolveFirstArchiveVolumePath(torrent, files, additionalStorageRoots = []) {
  const archiveFiles = findPackedArchiveFiles(files)
  if (archiveFiles.length === 0) return ''

  for (const archiveFile of archiveFiles) {
    const absolutePath = findExistingLocalFilePath(torrent, archiveFile.name, additionalStorageRoots)
    if (absolutePath && fs.existsSync(absolutePath)) {
      return path.normalize(absolutePath)
    }
  }

  return ''
}

function run7ZipExtract(firstArchivePath, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(path7za, [
      'x',
      '-y',
      '-aoa',
      '-bso0',
      '-bse1',
      '-bsp0',
      `-o${outputDir}`,
      firstArchivePath
    ], {
      windowsHide: true
    })

    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`7-Zip extraction timed out after ${EXTRACTION_TIMEOUT_MS}ms`))
    }, EXTRACTION_TIMEOUT_MS)

    child.stdout.on('data', () => {})
    child.stderr.on('data', chunk => {
      stderr += String(chunk || '')
    })

    child.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `7-Zip extraction failed with exit code ${code}`))
    })
  })
}

async function extractPackedArchive(torrent, files, additionalStorageRoots = []) {
  const hash = normalizeHash(torrent?.hash)
  const outputDir = getArchiveExtractionDir(torrent)
  if (!hash || !outputDir) {
    throw new Error('Missing torrent hash or save path for archive extraction')
  }

  const firstArchivePath = resolveFirstArchiveVolumePath(torrent, files, additionalStorageRoots)
  if (!firstArchivePath) {
    throw new Error('Packed archive volumes are not reachable on local disk')
  }

  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })

  await run7ZipExtract(firstArchivePath, outputDir)

  const extractedVideoPath = pickBestExtractedVideo(listFilesRecursive(outputDir))
  if (!extractedVideoPath) {
    throw new Error('Archive extracted but no playable video file was found')
  }

  const markerPath = getArchiveExtractionMarkerPath(torrent)
  fs.writeFileSync(markerPath, JSON.stringify({
    hash,
    videoPath: path.normalize(extractedVideoPath),
    sourceArchivePath: firstArchivePath,
    extractedAt: new Date().toISOString()
  }, null, 2))

  return path.normalize(extractedVideoPath)
}

async function ensurePackedArchiveExtracted(torrent, files, additionalStorageRoots = []) {
  const hash = normalizeHash(torrent?.hash)
  if (!hash) return { status: 'invalid' }

  const existingPath = findExtractedArchiveVideoPath(torrent)
  if (existingPath) {
    extractionState.set(hash, { status: 'ready', path: existingPath, updatedAt: Date.now() })
    return { status: 'ready', path: existingPath }
  }

  const archiveFiles = findPackedArchiveFiles(files)
  if (archiveFiles.length === 0) return { status: 'not-archive' }
  if (!archiveFiles.every(file => Number(file?.progress || 0) >= 0.999)) {
    return { status: 'pending' }
  }

  if (!canExtractPackedArchives()) {
    extractionState.set(hash, { status: 'unavailable', updatedAt: Date.now() })
    return { status: 'unavailable' }
  }

  const firstArchivePath = resolveFirstArchiveVolumePath(torrent, files, additionalStorageRoots)
  if (!firstArchivePath) {
    extractionState.set(hash, { status: 'missing-source', updatedAt: Date.now() })
    return { status: 'missing-source' }
  }

  if (extractionJobs.has(hash)) {
    return { status: 'running' }
  }

  extractionState.set(hash, { status: 'running', updatedAt: Date.now() })

  const job = extractPackedArchive(torrent, files, additionalStorageRoots)
    .then((videoPath) => {
      extractionState.set(hash, { status: 'ready', path: videoPath, updatedAt: Date.now() })
      return videoPath
    })
    .catch((err) => {
      extractionState.set(hash, {
        status: 'failed',
        error: String(err?.message || 'Archive extraction failed'),
        updatedAt: Date.now()
      })
      throw err
    })
    .finally(() => {
      extractionJobs.delete(hash)
    })

  extractionJobs.set(hash, job)
  return { status: 'running' }
}

module.exports = {
  canExtractPackedArchives,
  getArchiveExtractionDir,
  findExtractedArchiveVideoPath,
  ensurePackedArchiveExtracted
}
