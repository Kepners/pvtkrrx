const fs = require('fs')
const path = require('path')
const { resolveRuntimeDir } = require('./runtimeDir')

// Persistent memory for tracker link inspections.
//
// Inspecting a candidate means downloading its .torrent from the tracker, and
// private trackers meter exactly that: each account gets a daily allowance of
// .torrent downloads (Torrenting: 15/day; TorrentLeech refused in bulk on
// 2026-08-13 the same way). The in-RAM inspection cache only remembers for
// minutes and dies with the process, so every evening of family browsing
// re-downloaded the same .torrents until the allowance ran dry — and then every
// title returned 0 streams until the daily reset.
//
// A .torrent's contents never change: the infohash, file list and sizes are
// the release's identity. So a SUCCESSFUL inspection is a durable fact, safe
// to keep for days. Failures are still moments, not facts — they are never
// written here (same settled rule as the RAM cache).
//
// Keying: the tracker download URL cannot be the key — Prowlarr re-encrypts it
// on every search, so the same release gets a different URL each time (proven
// live: 50/50 URLs changed between two identical searches 3s apart). The
// result's guid (the tracker's canonical torrent page URL) is stable, so the
// caller keys by guid plus size — size guards the rare tracker that replaces a
// torrent's payload behind the same page.

const CACHE_FILE_NAME = 'tracker-inspection-cache.json'

function parseBooleanEnv(value, fallback = true) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(1|true|yes|on)$/i.test(text)) return true
  if (/^(0|false|no|off)$/i.test(text)) return false
  return fallback
}

function diskCacheEnabled() {
  return parseBooleanEnv(process.env.PVTKRRX_TRACKER_INSPECTION_DISK_CACHE, true)
}

const DISK_TTL_MS = Math.max(60 * 60 * 1000, parseInt(
  process.env.PVTKRRX_TRACKER_INSPECTION_DISK_TTL_MS || String(14 * 24 * 60 * 60 * 1000),
  10
) || 14 * 24 * 60 * 60 * 1000)

const DISK_MAX_ENTRIES = Math.max(500, parseInt(
  process.env.PVTKRRX_TRACKER_INSPECTION_DISK_MAX_ENTRIES || '5000',
  10
) || 5000)

const SAVE_DEBOUNCE_MS = 5000

function resolveCacheFile() {
  const configured = String(process.env.PVTKRRX_TRACKER_INSPECTION_CACHE_DIR || '').trim()
  const dir = configured || resolveRuntimeDir()
  return path.join(dir, CACHE_FILE_NAME)
}

let entries = null
let loadPromise = null
let saveTimer = null
let dirty = false

async function loadEntries() {
  if (entries) return entries
  if (!loadPromise) {
    loadPromise = (async () => {
      const loaded = new Map()
      try {
        const raw = await fs.promises.readFile(resolveCacheFile(), 'utf8')
        const parsed = JSON.parse(raw)
        const now = Date.now()
        for (const [key, entry] of Object.entries(parsed?.entries || {})) {
          if (!entry || typeof entry !== 'object') continue
          if ((now - Number(entry.at || 0)) >= DISK_TTL_MS) continue
          if (!entry.result?.inspected || !entry.result?.infoHash) continue
          loaded.set(key, entry)
        }
      } catch (_) {
        // Missing or corrupt cache file — start empty. This is a cache.
      }
      entries = loaded
      return entries
    })()
  }
  return loadPromise
}

function scheduleSave() {
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!dirty || !entries) return
    dirty = false
    try {
      const file = resolveCacheFile()
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      const payload = { version: 1, entries: Object.fromEntries(entries) }
      const tmp = `${file}.tmp`
      await fs.promises.writeFile(tmp, JSON.stringify(payload))
      await fs.promises.rename(tmp, file)
    } catch (_) {
      // A failed save costs a re-download later, nothing more.
    }
  }, SAVE_DEBOUNCE_MS)
  if (typeof saveTimer.unref === 'function') saveTimer.unref()
}

function trimToMaxEntries() {
  if (!entries || entries.size <= DISK_MAX_ENTRIES) return
  const byAge = [...entries.entries()].sort(
    (a, b) => Number(a[1]?.lastUsedAt || a[1]?.at || 0) - Number(b[1]?.lastUsedAt || b[1]?.at || 0)
  )
  const excess = entries.size - DISK_MAX_ENTRIES
  for (let i = 0; i < excess; i++) entries.delete(byAge[i][0])
}

async function getCachedTrackerInspection(cacheId) {
  const key = String(cacheId || '').trim()
  if (!key || !diskCacheEnabled()) return null
  const map = await loadEntries()
  const entry = map.get(key)
  if (!entry) return null
  if ((Date.now() - Number(entry.at || 0)) >= DISK_TTL_MS) {
    map.delete(key)
    scheduleSave()
    return null
  }
  entry.lastUsedAt = Date.now()
  scheduleSave()
  // Callers patch fields onto the inspection they get back; hand out a copy so
  // those edits never leak into the stored fact.
  return { ...entry.result }
}

async function storeTrackerInspection(cacheId, result) {
  const key = String(cacheId || '').trim()
  if (!key || !diskCacheEnabled()) return
  if (!result?.inspected || !result?.infoHash) return
  const map = await loadEntries()
  map.set(key, { at: Date.now(), lastUsedAt: Date.now(), result: { ...result } })
  trimToMaxEntries()
  scheduleSave()
}

module.exports = {
  getCachedTrackerInspection,
  storeTrackerInspection
}
