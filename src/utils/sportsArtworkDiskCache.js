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
      selectedTemplate: String(meta.selectedTemplate || ''),
      layoutFamily: String(meta.layoutFamily || ''),
      eventClass: String(meta.eventClass || ''),
      renderFailure: String(meta.renderFailure || ''),
      fallbackReason: String(meta.fallbackReason || ''),
      sportBackdropFallbackReason: String(meta.sportBackdropFallbackReason || ''),
      logoKind: String(meta.logoKind || ''),
      logoSourceUrl: String(meta.logoSourceUrl || ''),
      logoSourceUrls: Array.isArray(meta.logoSourceUrls) ? meta.logoSourceUrls : [],
      logoFallbackReason: String(meta.logoFallbackReason || ''),
      logoRealCount: Number(meta.logoRealCount || 0) || 0,
      logoFallbackCount: Number(meta.logoFallbackCount || 0) || 0,
      logoSlots: Array.isArray(meta.logoSlots) ? meta.logoSlots : [],
      logoLookupAttempts: Array.isArray(meta.logoLookupAttempts) ? meta.logoLookupAttempts : [],
      realLogoLookupAttempted: Boolean(meta.realLogoLookupAttempted),
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
        selected_template text NOT NULL DEFAULT '',
        layout_family text NOT NULL DEFAULT '',
        event_class text NOT NULL DEFAULT '',
        render_failure text NOT NULL DEFAULT '',
        fallback_reason text NOT NULL DEFAULT '',
        sport_backdrop_fallback_reason text NOT NULL DEFAULT '',
        logo_kind text NOT NULL DEFAULT '',
        logo_source_url text NOT NULL DEFAULT '',
        logo_source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
        logo_fallback_reason text NOT NULL DEFAULT '',
        logo_real_count integer NOT NULL DEFAULT 0,
        logo_fallback_count integer NOT NULL DEFAULT 0,
        logo_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
        logo_lookup_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
        real_logo_lookup_attempted boolean NOT NULL DEFAULT false,
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
    await pool.query(`
      ALTER TABLE pvtkrrx_sports_artwork_cache
      ADD COLUMN IF NOT EXISTS selected_template text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS layout_family text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS event_class text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS render_failure text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS sport_backdrop_fallback_reason text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS logo_kind text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS logo_source_url text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS logo_source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS logo_fallback_reason text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS logo_real_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS logo_fallback_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS logo_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS logo_lookup_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS real_logo_lookup_attempted boolean NOT NULL DEFAULT false
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
      `SELECT content_type, selected_artwork_source, selected_template, layout_family, event_class, render_failure, fallback_reason, sport_backdrop_fallback_reason, logo_kind, logo_source_url, logo_source_urls, logo_fallback_reason, logo_real_count, logo_fallback_count, logo_slots, logo_lookup_attempts, real_logo_lookup_attempted, http_status, upstream_content_type, body
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
      selectedTemplate: String(row.selected_template || ''),
      layoutFamily: String(row.layout_family || ''),
      eventClass: String(row.event_class || ''),
      renderFailure: String(row.render_failure || ''),
      fallbackReason: String(row.fallback_reason || ''),
      sportBackdropFallbackReason: String(row.sport_backdrop_fallback_reason || ''),
      logoKind: String(row.logo_kind || ''),
      logoSourceUrl: String(row.logo_source_url || ''),
      logoSourceUrls: Array.isArray(row.logo_source_urls) ? row.logo_source_urls : [],
      logoFallbackReason: String(row.logo_fallback_reason || ''),
      logoRealCount: Number(row.logo_real_count || 0) || 0,
      logoFallbackCount: Number(row.logo_fallback_count || 0) || 0,
      logoSlots: Array.isArray(row.logo_slots) ? row.logo_slots : [],
      logoLookupAttempts: Array.isArray(row.logo_lookup_attempts) ? row.logo_lookup_attempts : [],
      realLogoLookupAttempted: Boolean(row.real_logo_lookup_attempted),
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
        (cache_key, content_type, selected_artwork_source, selected_template, layout_family, event_class, render_failure, fallback_reason, sport_backdrop_fallback_reason, logo_kind, logo_source_url, logo_source_urls, logo_fallback_reason, logo_real_count, logo_fallback_count, logo_slots, logo_lookup_attempts, real_logo_lookup_attempted, http_status, upstream_content_type, body, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16::jsonb, $17::jsonb, $18, $19, $20, $21, now(), $22)
       ON CONFLICT (cache_key) DO UPDATE SET
        content_type = EXCLUDED.content_type,
        selected_artwork_source = EXCLUDED.selected_artwork_source,
        selected_template = EXCLUDED.selected_template,
        layout_family = EXCLUDED.layout_family,
        event_class = EXCLUDED.event_class,
        render_failure = EXCLUDED.render_failure,
        fallback_reason = EXCLUDED.fallback_reason,
        sport_backdrop_fallback_reason = EXCLUDED.sport_backdrop_fallback_reason,
        logo_kind = EXCLUDED.logo_kind,
        logo_source_url = EXCLUDED.logo_source_url,
        logo_source_urls = EXCLUDED.logo_source_urls,
        logo_fallback_reason = EXCLUDED.logo_fallback_reason,
        logo_real_count = EXCLUDED.logo_real_count,
        logo_fallback_count = EXCLUDED.logo_fallback_count,
        logo_slots = EXCLUDED.logo_slots,
        logo_lookup_attempts = EXCLUDED.logo_lookup_attempts,
        real_logo_lookup_attempted = EXCLUDED.real_logo_lookup_attempted,
        http_status = EXCLUDED.http_status,
        upstream_content_type = EXCLUDED.upstream_content_type,
        body = EXCLUDED.body,
        created_at = now(),
        expires_at = EXCLUDED.expires_at`,
      [
        key,
        String(value.contentType || 'image/png'),
        String(value.selectedArtworkSource || 'unknown'),
        String(value.selectedTemplate || ''),
        String(value.layoutFamily || ''),
        String(value.eventClass || ''),
        String(value.renderFailure || ''),
        String(value.fallbackReason || ''),
        String(value.sportBackdropFallbackReason || ''),
        String(value.logoKind || ''),
        String(value.logoSourceUrl || ''),
        JSON.stringify(Array.isArray(value.logoSourceUrls) ? value.logoSourceUrls : []),
        String(value.logoFallbackReason || ''),
        Number(value.logoRealCount || 0) || 0,
        Number(value.logoFallbackCount || 0) || 0,
        JSON.stringify(Array.isArray(value.logoSlots) ? value.logoSlots : []),
        JSON.stringify(Array.isArray(value.logoLookupAttempts) ? value.logoLookupAttempts : []),
        Boolean(value.realLogoLookupAttempted),
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
    selectedTemplate: String(value.selectedTemplate || ''),
    layoutFamily: String(value.layoutFamily || ''),
    eventClass: String(value.eventClass || ''),
    renderFailure: String(value.renderFailure || ''),
    fallbackReason: String(value.fallbackReason || ''),
    sportBackdropFallbackReason: String(value.sportBackdropFallbackReason || ''),
    logoKind: String(value.logoKind || ''),
    logoSourceUrl: String(value.logoSourceUrl || ''),
    logoSourceUrls: Array.isArray(value.logoSourceUrls) ? value.logoSourceUrls : [],
    logoFallbackReason: String(value.logoFallbackReason || ''),
    logoRealCount: Number(value.logoRealCount || 0) || 0,
    logoFallbackCount: Number(value.logoFallbackCount || 0) || 0,
    logoSlots: Array.isArray(value.logoSlots) ? value.logoSlots : [],
    logoLookupAttempts: Array.isArray(value.logoLookupAttempts) ? value.logoLookupAttempts : [],
    realLogoLookupAttempted: Boolean(value.realLogoLookupAttempted),
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
