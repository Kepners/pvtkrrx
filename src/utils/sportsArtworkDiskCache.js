const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { resolveRuntimeDir } = require('./runtimeDir')

const CACHE_DIR_NAME = 'sports-artwork-raster-cache'
let postgresPoolPromise = null

function parseBooleanEnv(value, fallback = true) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (/^(1|true|yes|on)$/i.test(text)) return true
  if (/^(0|false|no|off)$/i.test(text)) return false
  return fallback
}

function diskCacheEnabled() {
  return parseBooleanEnv(process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE, true)
}

function resolveCacheDir() {
  const configured = String(process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_DIR || '').trim()
  return configured || path.join(resolveRuntimeDir(), CACHE_DIR_NAME)
}

function resolvePostgresUrl() {
  return String(process.env.PVTKRRX_SPORTS_ARTWORK_POSTGRES_URL || '').trim()
}

function cacheNameForKey(cacheKey = '') {
  return crypto.createHash('sha256').update(String(cacheKey || '')).digest('hex')
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true })
}

async function readSportsArtworkDiskCache(cacheKey = {}) {
  const postgresHit = await readSportsArtworkPostgresCache(cacheKey)
  if (postgresHit) return postgresHit

  if (!diskCacheEnabled()) return null
  const key = String(cacheKey || '').trim()
  if (!key) return null

  const dir = resolveCacheDir()
  const name = cacheNameForKey(key)
  const metaPath = path.join(dir, `${name}.json`)
  const dataPath = path.join(dir, `${name}.bin`)

  try {
    const [metaRaw, buffer] = await Promise.all([
      fs.promises.readFile(metaPath, 'utf8'),
      fs.promises.readFile(dataPath)
    ])
    const meta = JSON.parse(metaRaw)
    if (!meta || Number(meta.expiresAt || 0) <= Date.now()) return null
    return {
      buffer,
      contentType: String(meta.contentType || 'image/png'),
      selectedArtworkSource: String(meta.selectedArtworkSource || 'unknown'),
      fallbackReason: String(meta.fallbackReason || ''),
      httpStatus: Number(meta.httpStatus || 0) || 0,
      upstreamContentType: String(meta.upstreamContentType || ''),
      cacheLayer: 'disk'
    }
  } catch (_) {
    return null
  }
}

async function getPostgresPool() {
  const connectionString = resolvePostgresUrl()
  if (!connectionString) return null
  if (postgresPoolPromise) return postgresPoolPromise

  postgresPoolPromise = (async () => {
    let Pool
    try {
      ({ Pool } = require('pg'))
    } catch (_) {
      return null
    }

    const pool = new Pool({
      connectionString,
      max: Math.max(1, Number(process.env.PVTKRRX_SPORTS_ARTWORK_POSTGRES_POOL_MAX || 2) || 2),
      idleTimeoutMillis: Math.max(1000, Number(process.env.PVTKRRX_SPORTS_ARTWORK_POSTGRES_IDLE_MS || 30000) || 30000),
      connectionTimeoutMillis: Math.max(1000, Number(process.env.PVTKRRX_SPORTS_ARTWORK_POSTGRES_CONNECT_MS || 5000) || 5000)
    })

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pvtkrrx_sports_artwork_cache (
        cache_key text PRIMARY KEY,
        content_type text NOT NULL,
        selected_artwork_source text NOT NULL,
        fallback_reason text NOT NULL DEFAULT '',
        http_status integer NOT NULL DEFAULT 0,
        upstream_content_type text NOT NULL DEFAULT '',
        body bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      )
    `)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS pvtkrrx_sports_artwork_cache_expires_idx
      ON pvtkrrx_sports_artwork_cache (expires_at)
    `)
    return pool
  })().catch(() => null)

  return postgresPoolPromise
}

async function readSportsArtworkPostgresCache(cacheKey = '') {
  const key = String(cacheKey || '').trim()
  if (!key || !resolvePostgresUrl()) return null
  try {
    const pool = await getPostgresPool()
    if (!pool) return null
    const result = await pool.query(
      `SELECT content_type, selected_artwork_source, fallback_reason, http_status, upstream_content_type, body
       FROM pvtkrrx_sports_artwork_cache
       WHERE cache_key = $1 AND expires_at > now()
       LIMIT 1`,
      [key]
    )
    const row = result.rows?.[0]
    if (!row) return null
    return {
      buffer: Buffer.from(row.body),
      contentType: String(row.content_type || 'image/png'),
      selectedArtworkSource: String(row.selected_artwork_source || 'unknown'),
      fallbackReason: String(row.fallback_reason || ''),
      httpStatus: Number(row.http_status || 0) || 0,
      upstreamContentType: String(row.upstream_content_type || ''),
      cacheLayer: 'postgres'
    }
  } catch (_) {
    return null
  }
}

async function writeSportsArtworkPostgresCache(cacheKey = '', value = {}, ttlMs = 0) {
  const key = String(cacheKey || '').trim()
  if (!key || !Buffer.isBuffer(value?.buffer) || !resolvePostgresUrl()) return false
  try {
    const pool = await getPostgresPool()
    if (!pool) return false
    const expiresAt = new Date(Date.now() + Math.max(60000, Number(ttlMs || 0) || 6 * 60 * 60 * 1000))
    await pool.query(
      `INSERT INTO pvtkrrx_sports_artwork_cache
        (cache_key, content_type, selected_artwork_source, fallback_reason, http_status, upstream_content_type, body, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
       ON CONFLICT (cache_key) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        selected_artwork_source = EXCLUDED.selected_artwork_source,
        fallback_reason = EXCLUDED.fallback_reason,
        http_status = EXCLUDED.http_status,
        upstream_content_type = EXCLUDED.upstream_content_type,
        body = EXCLUDED.body,
        created_at = now(),
        expires_at = EXCLUDED.expires_at`,
      [
        key,
        String(value.contentType || 'image/png'),
        String(value.selectedArtworkSource || 'unknown'),
        String(value.fallbackReason || ''),
        Number(value.httpStatus || 0) || 0,
        String(value.upstreamContentType || ''),
        value.buffer,
        expiresAt
      ]
    )
    pool.query(
      'DELETE FROM pvtkrrx_sports_artwork_cache WHERE expires_at <= now()'
    ).catch(() => {})
    return true
  } catch (_) {
    return false
  }
}

async function trimSportsArtworkDiskCache(dir, maxEntries) {
  const limit = Math.max(100, Number(maxEntries || process.env.PVTKRRX_SPORTS_ARTWORK_DISK_CACHE_MAX_ENTRIES || 2000) || 2000)
  let entries = []
  try {
    const names = await fs.promises.readdir(dir)
    const metaNames = names.filter((name) => /^[a-f0-9]{64}\.json$/i.test(name))
    if (metaNames.length <= limit) return
    entries = await Promise.all(metaNames.map(async (name) => {
      const metaPath = path.join(dir, name)
      try {
        const stat = await fs.promises.stat(metaPath)
        return { name, mtimeMs: stat.mtimeMs }
      } catch (_) {
        return { name, mtimeMs: 0 }
      }
    }))
  } catch (_) {
    return
  }

  entries.sort((left, right) => left.mtimeMs - right.mtimeMs)
  const remove = entries.slice(0, Math.max(0, entries.length - limit))
  await Promise.all(remove.map(async (entry) => {
    const base = entry.name.replace(/\.json$/i, '')
    await Promise.all([
      fs.promises.unlink(path.join(dir, `${base}.json`)).catch(() => {}),
      fs.promises.unlink(path.join(dir, `${base}.bin`)).catch(() => {})
    ])
  }))
}

async function writeSportsArtworkDiskCache(cacheKey = '', value = {}, options = {}) {
  const ttlMs = Math.max(60000, Number(options.ttlMs || process.env.PVTKRRX_SPORTS_ARTWORK_CACHE_MS || 6 * 60 * 60 * 1000) || 6 * 60 * 60 * 1000)
  const postgresOk = await writeSportsArtworkPostgresCache(cacheKey, value, ttlMs)

  if (!diskCacheEnabled()) return postgresOk
  const key = String(cacheKey || '').trim()
  if (!key || !Buffer.isBuffer(value?.buffer)) return postgresOk

  const dir = resolveCacheDir()
  const name = cacheNameForKey(key)
  const metaPath = path.join(dir, `${name}.json`)
  const dataPath = path.join(dir, `${name}.bin`)
  const now = Date.now()
  const meta = {
    version: 1,
    createdAt: now,
    expiresAt: now + ttlMs,
    contentType: String(value.contentType || 'image/png'),
    selectedArtworkSource: String(value.selectedArtworkSource || 'unknown'),
    fallbackReason: String(value.fallbackReason || ''),
    httpStatus: Number(value.httpStatus || 0) || 0,
    upstreamContentType: String(value.upstreamContentType || '')
  }

  try {
    await ensureDir(dir)
    await Promise.all([
      fs.promises.writeFile(dataPath, value.buffer),
      fs.promises.writeFile(metaPath, JSON.stringify(meta))
    ])
    trimSportsArtworkDiskCache(dir, options.maxEntries).catch(() => {})
    return true
  } catch (_) {
    return postgresOk
  }
}

module.exports = {
  readSportsArtworkDiskCache,
  writeSportsArtworkDiskCache
}
