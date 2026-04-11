// Experimental integrated SportsMeta draft only.
// This runtime-local catalogue is not the live product boundary; the standalone
// SportsMeta service is the production owner of canonical `sportsmeta:` metadata.

const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { resolveRuntimeDir } = require('./runtimeDir')

const DB_FILE_NAME = 'sportsmeta-catalogue.sqlite'
const POSTER_CACHE_FILE_NAME = 'sportsdb-poster-cache.json'
const IMAGE_CACHE_DIR_NAME = 'sports-image-cache'

let activeState = null

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeDate(value) {
  const text = normalizeSpace(value)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function slugKeyPart(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function inferTeamsFromEventName(eventName) {
  const text = normalizeSpace(eventName)
  if (!text) return { homeTeam: '', awayTeam: '' }

  const parts = text.split(/\s+vs\.?\s+/i)
  if (parts.length === 2) {
    return {
      homeTeam: normalizeSpace(parts[0]),
      awayTeam: normalizeSpace(parts[1])
    }
  }

  return {
    homeTeam: '',
    awayTeam: ''
  }
}

function buildStructuredAliasKey(input = {}) {
  const league = slugKeyPart(input.league)
  const date = normalizeDate(input.date || input.eventDate)
  const homeTeam = slugKeyPart(input.homeTeam)
  const awayTeam = slugKeyPart(input.awayTeam)
  const eventName = slugKeyPart(input.eventName || input.name)
  const parts = []

  if (league) parts.push(`l:${league}`)
  if (date) parts.push(`d:${date}`)
  if (homeTeam && awayTeam) {
    const teams = [homeTeam, awayTeam].sort()
    parts.push(`m:${teams[0]}:${teams[1]}`)
  } else if (eventName) {
    parts.push(`e:${eventName}`)
  }

  return parts.length >= 2 ? parts.join('|') : ''
}

function buildLeagueAliasKey(input = {}) {
  const league = slugKeyPart(input.league)
  const sport = slugKeyPart(input.sport || input.sportHint)
  if (!league) return ''
  return sport ? `s:${sport}|l:${league}` : `l:${league}`
}

function buildRecordKey(payload = {}) {
  const eventId = normalizeSpace(payload.eventId)
  if (eventId) return `event:${eventId}`

  const structuredKey = buildStructuredAliasKey(payload)
  if (structuredKey) return `event-key:${structuredKey}`

  const leagueKey = buildLeagueAliasKey(payload)
  if (leagueKey) return `league:${leagueKey}`

  return ''
}

function buildAliasEntries(payload = {}, options = {}) {
  const aliases = []
  const eventId = normalizeSpace(payload.eventId)
  const structuredKey = buildStructuredAliasKey(payload)
  const leagueKey = buildLeagueAliasKey(payload)
  const sourceKey = normalizeSpace(options.sourceKey)

  if (eventId) {
    aliases.push({
      aliasKey: `event-id:${eventId}`,
      aliasType: 'event-id'
    })
  }

  if (structuredKey) {
    aliases.push({
      aliasKey: `structured:${structuredKey}`,
      aliasType: 'structured'
    })
  }

  if (leagueKey) {
    aliases.push({
      aliasKey: `league:${leagueKey}`,
      aliasType: payload.eventId || structuredKey ? 'league-fallback' : 'league',
    })
  }

  if (sourceKey) {
    aliases.push({
      aliasKey: `source:${sourceKey}`,
      aliasType: 'source'
    })
  }

  return aliases
}

function normalizeArtworkPayload(payload = {}) {
  const eventName = normalizeSpace(payload.eventName || payload.name)
  const inferredTeams = inferTeamsFromEventName(eventName)
  const homeTeam = normalizeSpace(payload.homeTeam || inferredTeams.homeTeam)
  const awayTeam = normalizeSpace(payload.awayTeam || inferredTeams.awayTeam)
  const league = normalizeSpace(payload.league)
  const sport = normalizeSpace(payload.sport)
  const eventId = normalizeSpace(payload.eventId)
  const date = normalizeDate(payload.eventDate || payload.date)
  const recordKey = buildRecordKey({
    eventId,
    eventName,
    league,
    sport,
    date,
    homeTeam,
    awayTeam
  })

  if (!recordKey) return null

  return {
    recordKey,
    recordType: recordKey.startsWith('league:') ? 'league' : 'event',
    eventId,
    name: eventName || league,
    league,
    eventDate: date,
    sport,
    homeTeam,
    awayTeam,
    source: normalizeSpace(payload.source),
    image: normalizeSpace(payload.image),
    poster: normalizeSpace(payload.poster),
    landscapeImage: normalizeSpace(payload.landscapeImage),
    backgroundImage: normalizeSpace(payload.backgroundImage),
    logo: normalizeSpace(payload.logo),
    leagueLogo: normalizeSpace(payload.leagueLogo),
    homeBadge: normalizeSpace(payload.homeBadge),
    awayBadge: normalizeSpace(payload.awayBadge),
    rawPayload: payload
  }
}

function parseJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (_) {
    return fallback
  }
}

function parseJsonText(text, fallback) {
  try {
    return JSON.parse(String(text || ''))
  } catch (_) {
    return fallback
  }
}

function getSportsMetaCataloguePath(options = {}) {
  const runtimeDir = normalizeSpace(options.runtimeDir) || resolveRuntimeDir(options.env)
  return path.join(runtimeDir, DB_FILE_NAME)
}

function createState(runtimeDir) {
  const dbPath = getSportsMetaCataloguePath({ runtimeDir })
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sportsmeta_assets (
      cache_key TEXT PRIMARY KEY,
      source_url TEXT NOT NULL UNIQUE,
      content_type TEXT,
      ext TEXT,
      size INTEGER,
      fetched_at INTEGER,
      last_accessed_at INTEGER,
      file_path TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sportsmeta_records (
      record_key TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      event_id TEXT,
      name TEXT,
      league TEXT,
      event_date TEXT,
      sport TEXT,
      home_team TEXT,
      away_team TEXT,
      source TEXT,
      image_source_url TEXT,
      poster_source_url TEXT,
      landscape_source_url TEXT,
      background_source_url TEXT,
      logo_source_url TEXT,
      league_logo_source_url TEXT,
      home_badge_source_url TEXT,
      away_badge_source_url TEXT,
      raw_payload_json TEXT,
      imported_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sportsmeta_records_event_id_idx
    ON sportsmeta_records(event_id);

    CREATE INDEX IF NOT EXISTS sportsmeta_records_lookup_idx
    ON sportsmeta_records(record_type, league, event_date, home_team, away_team);

    CREATE TABLE IF NOT EXISTS sportsmeta_aliases (
      alias_key TEXT PRIMARY KEY,
      record_key TEXT NOT NULL,
      alias_type TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      FOREIGN KEY(record_key) REFERENCES sportsmeta_records(record_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS sportsmeta_aliases_record_idx
    ON sportsmeta_aliases(record_key);

    CREATE TABLE IF NOT EXISTS sportsmeta_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sportsmeta_entitlements (
      account_user_id TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      plan TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  return {
    runtimeDir,
    dbPath,
    db,
    statements: {
      upsertAsset: db.prepare(`
        INSERT INTO sportsmeta_assets (
          cache_key,
          source_url,
          content_type,
          ext,
          size,
          fetched_at,
          last_accessed_at,
          file_path,
          imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          source_url = excluded.source_url,
          content_type = excluded.content_type,
          ext = excluded.ext,
          size = excluded.size,
          fetched_at = excluded.fetched_at,
          last_accessed_at = excluded.last_accessed_at,
          file_path = excluded.file_path,
          imported_at = excluded.imported_at
      `),
      upsertRecord: db.prepare(`
        INSERT INTO sportsmeta_records (
          record_key,
          record_type,
          event_id,
          name,
          league,
          event_date,
          sport,
          home_team,
          away_team,
          source,
          image_source_url,
          poster_source_url,
          landscape_source_url,
          background_source_url,
          logo_source_url,
          league_logo_source_url,
          home_badge_source_url,
          away_badge_source_url,
          raw_payload_json,
          imported_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(record_key) DO UPDATE SET
          record_type = excluded.record_type,
          event_id = excluded.event_id,
          name = excluded.name,
          league = excluded.league,
          event_date = excluded.event_date,
          sport = excluded.sport,
          home_team = excluded.home_team,
          away_team = excluded.away_team,
          source = excluded.source,
          image_source_url = excluded.image_source_url,
          poster_source_url = excluded.poster_source_url,
          landscape_source_url = excluded.landscape_source_url,
          background_source_url = excluded.background_source_url,
          logo_source_url = excluded.logo_source_url,
          league_logo_source_url = excluded.league_logo_source_url,
          home_badge_source_url = excluded.home_badge_source_url,
          away_badge_source_url = excluded.away_badge_source_url,
          raw_payload_json = excluded.raw_payload_json,
          imported_at = excluded.imported_at,
          updated_at = excluded.updated_at
      `),
      deleteAliasesForRecord: db.prepare(`
        DELETE FROM sportsmeta_aliases
        WHERE record_key = ?
      `),
      upsertAlias: db.prepare(`
        INSERT INTO sportsmeta_aliases (
          alias_key,
          record_key,
          alias_type,
          imported_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(alias_key) DO UPDATE SET
          record_key = excluded.record_key,
          alias_type = excluded.alias_type,
          imported_at = excluded.imported_at
      `),
      getRecordByAlias: db.prepare(`
        SELECT r.*
        FROM sportsmeta_aliases a
        JOIN sportsmeta_records r
          ON r.record_key = a.record_key
        WHERE a.alias_key = ?
        LIMIT 1
      `),
      getRecordByEventId: db.prepare(`
        SELECT *
        FROM sportsmeta_records
        WHERE event_id = ?
        LIMIT 1
      `),
      setMeta: db.prepare(`
        INSERT INTO sportsmeta_meta (
          meta_key,
          meta_value,
          updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(meta_key) DO UPDATE SET
          meta_value = excluded.meta_value,
          updated_at = excluded.updated_at
      `),
      getMeta: db.prepare(`
        SELECT meta_value
        FROM sportsmeta_meta
        WHERE meta_key = ?
      `),
      upsertEntitlement: db.prepare(`
        INSERT INTO sportsmeta_entitlements (
          account_user_id,
          tier,
          plan,
          expires_at,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_user_id) DO UPDATE SET
          tier = excluded.tier,
          plan = excluded.plan,
          expires_at = excluded.expires_at,
          source = excluded.source,
          updated_at = excluded.updated_at
      `),
      getEntitlement: db.prepare(`
        SELECT *
        FROM sportsmeta_entitlements
        WHERE account_user_id = ?
        LIMIT 1
      `),
      countAssets: db.prepare(`
        SELECT COUNT(*) AS total
        FROM sportsmeta_assets
      `),
      countRecords: db.prepare(`
        SELECT COUNT(*) AS total
        FROM sportsmeta_records
      `),
      countAliases: db.prepare(`
        SELECT COUNT(*) AS total
        FROM sportsmeta_aliases
      `),
      countByType: db.prepare(`
        SELECT record_type, COUNT(*) AS total
        FROM sportsmeta_records
        GROUP BY record_type
      `)
    }
  }
}

function getActiveState(options = {}) {
  const runtimeDir = normalizeSpace(options.runtimeDir) || resolveRuntimeDir(options.env)
  if (activeState && activeState.runtimeDir === runtimeDir) {
    return activeState
  }

  closeSportsMetaCatalogue()

  activeState = createState(runtimeDir)
  return activeState
}

function closeSportsMetaCatalogue(options = {}) {
  const runtimeDir = normalizeSpace(options.runtimeDir)
  if (!activeState) return
  if (runtimeDir && activeState.runtimeDir !== runtimeDir) return
  try {
    activeState.db.close()
  } catch (_) {
    // ignore
  }
  activeState = null
}

function setMetaValue(state, key, value, now = Date.now()) {
  state.statements.setMeta.run(key, String(value ?? ''), now)
}

function upsertRecord(state, record, aliases, now = Date.now()) {
  state.statements.upsertRecord.run(
    record.recordKey,
    record.recordType,
    record.eventId,
    record.name,
    record.league,
    record.eventDate,
    record.sport,
    record.homeTeam,
    record.awayTeam,
    record.source,
    record.image,
    record.poster,
    record.landscapeImage,
    record.backgroundImage,
    record.logo,
    record.leagueLogo,
    record.homeBadge,
    record.awayBadge,
    JSON.stringify(record.rawPayload || {}),
    now,
    now
  )

  state.statements.deleteAliasesForRecord.run(record.recordKey)
  for (const alias of aliases) {
    state.statements.upsertAlias.run(
      alias.aliasKey,
      record.recordKey,
      alias.aliasType,
      now
    )
  }
}

function importImageSidecars(state, runtimeDir, summary, now) {
  const cacheDir = path.join(runtimeDir, IMAGE_CACHE_DIR_NAME)
  if (!fs.existsSync(cacheDir)) return

  const files = fs.readdirSync(cacheDir).filter((name) => name.endsWith('.json'))
  for (const metaFileName of files) {
    summary.assetSidecars += 1
    const metadata = parseJsonFile(path.join(cacheDir, metaFileName), null)
    const cacheKey = normalizeSpace(metadata?.cacheKey)
    const sourceUrl = normalizeSpace(metadata?.sourceUrl)
    const ext = normalizeSpace(metadata?.ext)
    if (!cacheKey || !sourceUrl || !ext) {
      summary.assetSkipped += 1
      continue
    }

    const filePath = path.join(cacheDir, `${cacheKey}${ext}`)
    if (!fs.existsSync(filePath)) {
      summary.assetSkipped += 1
      continue
    }

    state.statements.upsertAsset.run(
      cacheKey,
      sourceUrl,
      normalizeSpace(metadata?.contentType),
      ext,
      Number(metadata?.size || 0),
      Number(metadata?.fetchedAt || 0),
      Number(metadata?.lastAccessedAt || 0),
      filePath,
      now
    )
    summary.assetsImported += 1
  }
}

function importPosterCacheEntries(state, runtimeDir, summary, now) {
  const cacheFilePath = path.join(runtimeDir, POSTER_CACHE_FILE_NAME)
  const parsed = parseJsonFile(cacheFilePath, null)
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
  summary.posterCacheEntries = entries.length

  for (const entry of entries) {
    const normalized = normalizeArtworkPayload(entry?.value || null)
    if (!normalized) {
      summary.recordSkipped += 1
      continue
    }

    const aliases = buildAliasEntries(normalized, { sourceKey: entry?.key })
    if (aliases.length === 0) {
      summary.recordSkipped += 1
      continue
    }

    upsertRecord(state, normalized, aliases, now)
    summary.recordsImported += 1
    summary.aliasesImported += aliases.length
  }
}

function importSportsMetaCatalogue(options = {}) {
  const state = getActiveState(options)
  const now = Date.now()
  const summary = {
    runtimeDir: state.runtimeDir,
    dbPath: state.dbPath,
    assetSidecars: 0,
    assetsImported: 0,
    assetSkipped: 0,
    posterCacheEntries: 0,
    recordsImported: 0,
    recordSkipped: 0,
    aliasesImported: 0,
    startedAt: now
  }

  setMetaValue(state, 'catalogue_version', '1', now)
  setMetaValue(state, 'last_import_started_at', String(now), now)

  state.db.exec('BEGIN')
  try {
    importImageSidecars(state, state.runtimeDir, summary, now)
    importPosterCacheEntries(state, state.runtimeDir, summary, now)
    state.db.exec('COMMIT')
  } catch (error) {
    try {
      state.db.exec('ROLLBACK')
    } catch (_) {
      // ignore
    }
    throw error
  }

  const finishedAt = Date.now()
  summary.completedAt = finishedAt
  summary.assetCount = Number(state.statements.countAssets.get()?.total || 0)
  summary.recordCount = Number(state.statements.countRecords.get()?.total || 0)
  summary.aliasCount = Number(state.statements.countAliases.get()?.total || 0)
  summary.recordsByType = state.statements.countByType.all()

  setMetaValue(state, 'last_import_completed_at', String(finishedAt), finishedAt)
  setMetaValue(state, 'last_import_summary_json', JSON.stringify(summary), finishedAt)
  return summary
}

function parseRecordRow(row) {
  if (!row) return null
  const rawPayload = parseJsonText(row.raw_payload_json, null)
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {}

  return {
    ...payload,
    recordKey: String(row.record_key || ''),
    recordType: String(row.record_type || ''),
    eventId: normalizeSpace(row.event_id || payload.eventId),
    eventName: normalizeSpace(row.name || payload.eventName || payload.name),
    league: normalizeSpace(row.league || payload.league),
    eventDate: normalizeDate(row.event_date || payload.eventDate || payload.date),
    sport: normalizeSpace(row.sport || payload.sport),
    homeTeam: normalizeSpace(row.home_team || payload.homeTeam),
    awayTeam: normalizeSpace(row.away_team || payload.awayTeam),
    source: normalizeSpace(row.source || payload.source),
    image: normalizeSpace(row.image_source_url || payload.image),
    poster: normalizeSpace(row.poster_source_url || payload.poster),
    landscapeImage: normalizeSpace(row.landscape_source_url || payload.landscapeImage),
    backgroundImage: normalizeSpace(row.background_source_url || payload.backgroundImage),
    logo: normalizeSpace(row.logo_source_url || payload.logo),
    leagueLogo: normalizeSpace(row.league_logo_source_url || payload.leagueLogo),
    homeBadge: normalizeSpace(row.home_badge_source_url || payload.homeBadge),
    awayBadge: normalizeSpace(row.away_badge_source_url || payload.awayBadge)
  }
}

function resolveLookupAliasCandidates(query = {}) {
  const candidates = []
  const eventId = normalizeSpace(query.eventId)
  const structuredKey = buildStructuredAliasKey({
    league: query.league,
    date: query.date,
    homeTeam: query.homeTeam,
    awayTeam: query.awayTeam,
    eventName: query.eventName || query.displayTitle || query.title
  })
  const leagueKey = buildLeagueAliasKey({
    league: query.league,
    sport: query.sportHint || query.sport
  })

  if (eventId) candidates.push(`event-id:${eventId}`)
  if (structuredKey) candidates.push(`structured:${structuredKey}`)
  if (leagueKey) candidates.push(`league:${leagueKey}`)
  return [...new Set(candidates)]
}

function lookupSportsMetaRecord(query = {}, options = {}) {
  const state = getActiveState(options)
  for (const aliasKey of resolveLookupAliasCandidates(query)) {
    const row = state.statements.getRecordByAlias.get(aliasKey)
    const record = parseRecordRow(row)
    if (record) return record
  }

  const eventId = normalizeSpace(query.eventId)
  if (!eventId) return null
  return parseRecordRow(state.statements.getRecordByEventId.get(eventId))
}

function upsertResolvedSportsMetaRecord(payload = {}, options = {}) {
  const state = getActiveState(options)
  const normalized = normalizeArtworkPayload(payload)
  if (!normalized) return null

  const aliases = buildAliasEntries(normalized, {
    sourceKey: options.sourceKey
  })
  if (aliases.length === 0) return null

  upsertRecord(state, normalized, aliases, Date.now())
  return normalized
}

function getSportsMetaCatalogueStats(options = {}) {
  const state = getActiveState(options)
  const completedAt = state.statements.getMeta.get('last_import_completed_at')
  const summaryRow = state.statements.getMeta.get('last_import_summary_json')

  let lastImportSummary = null
  try {
    lastImportSummary = summaryRow?.meta_value
      ? JSON.parse(summaryRow.meta_value)
      : null
  } catch (_) {
    lastImportSummary = null
  }

  return {
    runtimeDir: state.runtimeDir,
    dbPath: state.dbPath,
    assetCount: Number(state.statements.countAssets.get()?.total || 0),
    recordCount: Number(state.statements.countRecords.get()?.total || 0),
    aliasCount: Number(state.statements.countAliases.get()?.total || 0),
    recordsByType: state.statements.countByType.all(),
    lastImportCompletedAt: Number(completedAt?.meta_value || 0) || 0,
    lastImportSummary
  }
}

function getSportsMetaEntitlement(accountUserId, options = {}) {
  const normalizedAccountUserId = normalizeSpace(accountUserId)
  if (!normalizedAccountUserId) return null

  const state = getActiveState(options)
  const row = state.statements.getEntitlement.get(normalizedAccountUserId)
  if (!row) return null

  const expiresAt = Number(row.expires_at || 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null

  return {
    accountUserId: normalizedAccountUserId,
    tier: normalizeSpace(row.tier),
    plan: normalizeSpace(row.plan),
    expiresAt,
    source: normalizeSpace(row.source)
  }
}

function upsertSportsMetaEntitlement(input = {}, options = {}) {
  const accountUserId = normalizeSpace(input.accountUserId)
  if (!accountUserId) {
    throw new Error('accountUserId is required')
  }

  const tier = normalizeSpace(input.tier || 'sportsmeta') || 'sportsmeta'
  const plan = normalizeSpace(input.plan || 'annual') || 'annual'
  const source = normalizeSpace(input.source || 'manual') || 'manual'
  const expiresAt = Number(input.expiresAt || 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('expiresAt must be a future unix timestamp in milliseconds')
  }

  const now = Date.now()
  const state = getActiveState(options)
  state.statements.upsertEntitlement.run(
    accountUserId,
    tier,
    plan,
    expiresAt,
    source,
    now,
    now
  )

  return {
    accountUserId,
    tier,
    plan,
    expiresAt,
    source
  }
}

module.exports = {
  DB_FILE_NAME,
  buildStructuredAliasKey,
  closeSportsMetaCatalogue,
  getSportsMetaEntitlement,
  getSportsMetaCataloguePath,
  getSportsMetaCatalogueStats,
  importSportsMetaCatalogue,
  lookupSportsMetaRecord,
  upsertSportsMetaEntitlement,
  upsertResolvedSportsMetaRecord
}
