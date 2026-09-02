// Resolve titles against the owner's Google Drive media library.
//
// On Contabo the library is an rclone FUSE mount of `gdrive-raw:Plex Media`
// (unit `gdrive-media-rclone.service`, mounted read-only at
// /opt/stack/gdrive-media/media and shown to Plex as /data-gdrive). The
// archiver `archive-torrents-to-gdrive.sh` copies finished PVTKRRX downloads up
// there and, once the copy passes a SHA-256 + byte-count check, the local
// torrent is deleted after 7 days of seeding.
//
// That deletion is why this exists: the Drive copy outlives the torrent, so
// without a library lookup an archived episode disappears from Stremio even
// though it is still sitting on the mount and still playing fine in Plex.
//
// Layout written by the archiver (do not "tidy" these — they are the contract):
//   <root>/Films and TV/TV/<Show>/Season NN/<Show> - SxxEyy[ - detail].<ext>
//   <root>/Films and TV/Films/<file>
//   <root>/Sports/<file>
//
// Show folder and file names come from tv_media.py's canonical_show(), which
// title-cases release tokens and folds a trailing year into "(YYYY)". Rather
// than re-implement that transform and hope it stays in step, this module scans
// the directory and matches on tv_media.py's own identity_key() normalisation —
// lowercase, non-alphanumerics collapsed to single spaces.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { redactSensitiveText } = require('./logRedaction')

const PLAYABLE_VIDEO_EXT_RE = /\.(?:mkv|mp4|m4v|webm|avi|mov|ts|m2ts|mpg|mpeg)$/i
const TV_SUBPATH = ['Films and TV', 'TV']
const FILM_SUBPATH = ['Films and TV', 'Films']

// The mount runs --dir-cache-time 1m, and every uncached readdir is a Drive API
// round trip, so listings are cached just inside that window.
const LISTING_TTL_MS = Math.max(
  0,
  parseInt(process.env.PVTKRRX_DRIVE_LIBRARY_LISTING_TTL_MS || '55000', 10) || 55000
)
const LISTING_CACHE_MAX_KEYS = 200
const listingCache = new Map()

function normalizeDriveLibraryRoot(value) {
  const raw = String(value || '').trim().replace(/^['"]+|['"]+$/g, '')
  if (!raw) return ''
  try {
    return path.normalize(raw).replace(/[\\/]+$/, '')
  } catch (_) {
    return ''
  }
}

// tv_media.py identity_key(): re.sub(r"[^a-z0-9]+", " ", show.lower()).strip()
function normalizeIdentity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// canonical_show() folds a trailing year into "(YYYY)", so "Show (2018)" and
// "Show" have to compare equal when the caller does not know the year.
function stripTrailingYear(value) {
  return String(value || '').replace(/\s*\(?(?:19|20)\d{2}\)?\s*$/, '').trim()
}

function identityVariants(value) {
  const out = new Set()
  const direct = normalizeIdentity(value)
  if (direct) out.add(direct)
  const withoutYear = normalizeIdentity(stripTrailingYear(value))
  if (withoutYear) out.add(withoutYear)
  return out
}

function rememberListing(key, entries, now) {
  if (LISTING_TTL_MS <= 0) return entries
  listingCache.set(key, { entries, expiresAt: now + LISTING_TTL_MS })
  for (const [cachedKey, entry] of listingCache) {
    if (!entry?.expiresAt || entry.expiresAt <= now) listingCache.delete(cachedKey)
  }
  while (listingCache.size > LISTING_CACHE_MAX_KEYS) {
    const oldestKey = listingCache.keys().next().value
    if (!oldestKey) break
    listingCache.delete(oldestKey)
  }
  return entries
}

function clearDriveLibraryCache() {
  listingCache.clear()
}

async function readDirectory(dirPath) {
  const key = path.normalize(String(dirPath || ''))
  if (!key) return []
  const now = Date.now()
  const cached = listingCache.get(key)
  if (cached && cached.expiresAt > now) return cached.entries

  let entries = []
  try {
    const dirents = await fs.promises.readdir(key, { withFileTypes: true })
    entries = dirents.map(dirent => ({
      name: dirent.name,
      isDirectory: dirent.isDirectory(),
      isFile: dirent.isFile()
    }))
  } catch (err) {
    // A missing branch is normal (no Films folder yet, show not archived); an
    // unreadable mount is worth a line but must never break stream assembly.
    if (err?.code !== 'ENOENT') {
      console.warn('[drive-library] listing failed:', redactSensitiveText(err.message))
    }
    entries = []
  }

  return rememberListing(key, entries, now)
}

function findDirectoryByTitle(entries, title) {
  const wanted = identityVariants(title)
  if (!wanted.size) return null
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    for (const candidate of identityVariants(entry.name)) {
      if (wanted.has(candidate)) return entry.name
    }
  }
  return null
}

function episodeCodePattern(season, episode) {
  const seasonNumber = Number(season)
  const episodeNumber = Number(episode)
  if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) return null
  if (seasonNumber < 0 || episodeNumber < 1) return null
  // Match the archiver's zero-padded SxxEyy, and also a wider-padded episode
  // number so a 3-digit anime-style episode still resolves.
  return new RegExp(`s0*${seasonNumber}[ ._-]*e0*${episodeNumber}(?![0-9])`, 'i')
}

async function statPlayable(filePath) {
  try {
    const stat = await fs.promises.stat(filePath)
    return stat?.isFile?.() ? stat : null
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[drive-library] stat failed:', redactSensitiveText(err.message))
    }
    return null
  }
}

// A Drive library file has no torrent, so the built-in /file route serves it
// through its orphan-path branch. That branch still needs a syntactic hash, so
// derive a stable one from the path — it identifies the file, it is never a
// real infohash, and it is deterministic so repeat requests reuse one token.
function driveFileHash(absolutePath) {
  return crypto.createHash('sha1').update(path.normalize(String(absolutePath || ''))).digest('hex')
}

async function findDriveEpisode(root, { title, season, episode } = {}) {
  const libraryRoot = normalizeDriveLibraryRoot(root)
  if (!libraryRoot || !String(title || '').trim()) return null

  const codeRe = episodeCodePattern(season, episode)
  if (!codeRe) return null

  const tvRoot = path.join(libraryRoot, ...TV_SUBPATH)
  const showFolder = findDirectoryByTitle(await readDirectory(tvRoot), title)
  if (!showFolder) return null

  const showPath = path.join(tvRoot, showFolder)
  const seasonNumber = Number(season)
  const seasonEntries = await readDirectory(showPath)
  const seasonWanted = new Set([
    `season ${seasonNumber}`,
    `season ${String(seasonNumber).padStart(2, '0')}`,
    ...(seasonNumber === 0 ? ['specials'] : [])
  ])
  const seasonFolder = seasonEntries.find(
    entry => entry.isDirectory && seasonWanted.has(normalizeIdentity(entry.name))
  )
  if (!seasonFolder) return null

  const seasonPath = path.join(showPath, seasonFolder.name)
  for (const entry of await readDirectory(seasonPath)) {
    if (!entry.isFile) continue
    if (!PLAYABLE_VIDEO_EXT_RE.test(entry.name)) continue
    if (!codeRe.test(entry.name)) continue

    const filePath = path.join(seasonPath, entry.name)
    const stat = await statPlayable(filePath)
    if (!stat) continue
    return {
      path: filePath,
      name: entry.name,
      size: Number(stat.size || 0),
      show: showFolder,
      season: seasonNumber,
      episode: Number(episode),
      hash: driveFileHash(filePath)
    }
  }

  return null
}

async function findDriveMovie(root, { title, year } = {}) {
  const libraryRoot = normalizeDriveLibraryRoot(root)
  if (!libraryRoot || !String(title || '').trim()) return null

  const wanted = identityVariants(title)
  if (!wanted.size) return null
  const wantedYear = /^(?:19|20)\d{2}$/.test(String(year || '').trim()) ? String(year).trim() : ''

  const filmRoot = path.join(libraryRoot, ...FILM_SUBPATH)
  let looseMatch = null

  for (const entry of await readDirectory(filmRoot)) {
    if (!entry.isFile) continue
    if (!PLAYABLE_VIDEO_EXT_RE.test(entry.name)) continue

    const stem = entry.name.replace(PLAYABLE_VIDEO_EXT_RE, '')
    const normalizedStem = normalizeIdentity(stem)
    const matchesTitle = [...wanted].some(
      candidate => normalizedStem === candidate || normalizedStem.startsWith(`${candidate} `)
    )
    if (!matchesTitle) continue

    const filePath = path.join(filmRoot, entry.name)
    const stat = await statPlayable(filePath)
    if (!stat) continue

    const result = {
      path: filePath,
      name: entry.name,
      size: Number(stat.size || 0),
      hash: driveFileHash(filePath)
    }

    // A year in the release name is the only thing separating remakes, so an
    // exact year match wins outright and a title-only hit is the fallback.
    if (wantedYear && normalizedStem.includes(wantedYear)) return result
    if (!looseMatch) looseMatch = result
  }

  return wantedYear ? null : looseMatch
}

module.exports = {
  normalizeDriveLibraryRoot,
  normalizeIdentity,
  findDriveEpisode,
  findDriveMovie,
  driveFileHash,
  clearDriveLibraryCache,
  PLAYABLE_VIDEO_EXT_RE
}
