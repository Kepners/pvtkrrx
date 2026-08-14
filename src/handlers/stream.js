const fs = require('fs')
const path = require('path')
const { ProwlarrClient } = require('../clients/prowlarr')
const { QBitClient } = require('../clients/qbittorrent')
const { CinemetaClient } = require('../clients/cinemeta')
const { SportsMetaClient } = require('../clients/sportsmeta')
const { normalizeTeamName } = require('../utils/teamName')
const { SPORT_CATS, MOVIE_CATS, TV_CATS } = require('../config/categories')
const { parse, matchesEpisode, isLikelyPackedReleaseTitle, cleanTitle } = require('../utils/parser')
const {
  getSportsAvailabilityAnchor,
  getSportsAvailabilityAnchorByCanonical
} = require('../utils/sportsAvailabilityStore')
const { isSportsCultIndexer, isSportsOnlyIndexer } = require('../utils/sportsIndexers')
const { buildOnSeedboxStream, buildOnBufferingStream, buildOnArchiveStream, buildOnTrackerStream, buildNativeTorrentStream, buildInfoStream, findVideoFile, findPackedArchiveFiles, arePackedArchiveFilesReady, findEpisodeFile, titleLooksLegacyAvi, hasLegacyAviVideoFiles, sortStreams } = require('../utils/streams')
const { encodePlaybackStateToken, encodeFileStateToken } = require('../utils/opaqueState')
const { parseSportsTitle, parseSportsEventTitle } = require('../utils/sportsTitleParser')
const { buildPlaybackFileUrl, canEmitTrackerPlayback, getTrackerPlaybackRestriction } = require('../utils/fileServing')
const { decodeCustomId } = require('../utils/customId')
const { normalizeImdbId } = require('../utils/normalizeImdbId')
const { isCompletedTorrent } = require('../utils/torrentState')
const { fetchTorrentPayload, inspectTorrentPayload } = require('../utils/torrentPayload')
const { getCachedTrackerInspection, storeTrackerInspection } = require('../utils/trackerInspectionDiskCache')
const { findExtractedArchiveVideoPath, ensurePackedArchiveExtracted } = require('../utils/archiveExtraction')
const { applyHostedServiceOverrides } = require('../utils/hostedServiceOverrides')
const { getMappedLeagueEntry } = require('../utils/leagueMap')
const { applyV13Routing } = require('../utils/streamRouter')
const { isAdultContentResult } = require('../utils/adultContentFilter')

const STREAM_UPSTREAM_TIMEOUT_MS = Math.max(2000, parseInt(process.env.PVTKRRX_STREAM_UPSTREAM_TIMEOUT_MS || '10000', 10))
const STREAM_TITLE_FALLBACK_TIMEOUT_MS = Math.max(1500, parseInt(process.env.PVTKRRX_STREAM_TITLE_FALLBACK_TIMEOUT_MS || '12000', 10))
// Movies get their own broad-search budget, independent of the TV one.
// This used to be Math.max(STREAM_TITLE_FALLBACK_TIMEOUT_MS, ...), which meant
// the 8000 default could never take effect: the TV value (12000) is larger, so
// max() always returned 12000 and every movie broad search ran to twelve
// seconds before giving up. The floor is a floor on the value itself, not on
// the TV timeout, so the intended 8s now applies and the env var can still
// raise or lower it.
// The broad, uncategorised sweep is the expensive one -- 146s measured, versus
// 3.7s for the same query with categories, for four fewer results. It stays as
// a last resort for titles the categories genuinely miss, but it is never worth
// waiting minutes for, so it keeps a tight leash while the categorised search
// above gets the real budget.
const MOVIE_TITLE_FALLBACK_TIMEOUT_MS = Math.max(1500, parseInt(
  process.env.PVTKRRX_MOVIE_TITLE_FALLBACK_TIMEOUT_MS || '8000',
  10
))
// These budgets have to match what private trackers actually do, not what we
// would like them to do. Measured on the live server 2026-08-11, real queries
// against the owner's 7 non-sport trackers:
//   categorised, all trackers, one call -> 272 results in 3.7s
//   uncategorised, all trackers         -> 276 results in 146s
//   each tracker alone, uncategorised   -> 0.26s to 3.9s
//
// So the categorised search is the one worth waiting for, and 3.7s is the good
// case -- under any contention it climbs well past the 7s this used to allow,
// at which point the search is abandoned and Stremio is told there is nothing
// to watch. Zero streams is a far worse outcome than a slower spinner, and the
// search cache means the wait is paid once per title, not once per click.
//
// 20s is roughly five times the measured typical, which leaves room for a slow
// tracker without ever sitting on a genuinely dead one.
const STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS = Math.max(1000, parseInt(
  process.env.PVTKRRX_STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS || '20000',
  10
))
const STREAM_TITLE_FALLBACK_BUDGET_MS = Math.max(5000, parseInt(
  process.env.PVTKRRX_STREAM_TITLE_FALLBACK_BUDGET_MS || '45000',
  10
))
// A ceiling on the whole candidate-inspection phase, not on each link.
// 12 candidates, 4 at a time, 15s each is 45s of worst case with nothing to
// stop it, and every one of those seconds is spent showing the viewer
// "1 addon still loading" next to another addon's finished list.
// Measured cold (Interstellar, live server 2026-08-11): searches took 13.4s and
// inspection took 22.5s of a 36s total. On a healthy pass real links come back
// in 70-457ms each, so this ceiling only bites when something is genuinely
// throttling -- and it returns the instant the candidates finish (Promise.race),
// so raising it costs nothing on a fast pass.
//
// It MUST be >= MOVIE_TV_TRACKER_LINK_INSPECTION_TIMEOUT_MS. A previous value of
// 10s sat below that 15s per-candidate timeout, which itself was chosen to
// outlast hd-torrents' stated "wait 13 seconds" throttle. The result: a
// throttled-but-fine candidate was always cut off at 10s, before the 13s wait
// the 15s was built to survive -- so the 15s was dead and legitimate torrents
// were discarded. Proven live 2026-08-12: House of the Dragon found 139 results,
// shortlisted 12, then "inspection budget hit after 10000ms; returning 0" ->
// Stremio got zero streams. 16s clears the tracker's own wait with 1s headroom.
const STREAM_CANDIDATE_INSPECTION_BUDGET_MS = Math.max(2000, parseInt(
  process.env.PVTKRRX_STREAM_CANDIDATE_INSPECTION_BUDGET_MS || '16000',
  10
))
const STREAM_MAX_CANDIDATES = Math.max(5, parseInt(process.env.PVTKRRX_STREAM_MAX_CANDIDATES || '12', 10))
// Inspecting a candidate downloads its .torrent, and Prowlarr fetches that
// from the private tracker. So this number is not "how much can our CPU take",
// it is "how many requests will a private tracker accept at once".
//
// A previous version defaulted this to the candidate cap so all 12 went in one
// wave. That is wrong for private trackers. Measured on the live server
// 2026-08-11 against real tracker links:
//   one at a time   -> HTTP 200 in 0.05-0.36s each
//   twelve at once  -> 500s and 7s timeouts, and after a search burst
//                      EVERY candidate failed, so Stremio got zero streams
// hd-torrents.org states the rule outright in its 429 body: "You've reached
// the request limit for automation tools. Please wait 13 seconds."
//
// Four keeps the whole cap inside three quick waves, comfortably under the 7s
// per-link budget, without burst-tripping the trackers. Overridable by env.
const STREAM_CANDIDATE_CONCURRENCY = Math.max(1, Math.min(
  16,
  parseInt(process.env.PVTKRRX_STREAM_CANDIDATE_CONCURRENCY || '4', 10)
))
const STREAM_SPORTS_MAX_SEARCH_QUERIES = Math.max(4, parseInt(process.env.PVTKRRX_STREAM_SPORTS_MAX_SEARCH_QUERIES || '12', 10))
const STREAM_SPORTS_MAX_SEARCH_QUERIES_WITH_DIRECT = Math.max(1, parseInt(process.env.PVTKRRX_STREAM_SPORTS_MAX_SEARCH_QUERIES_WITH_DIRECT || '3', 10))
const STREAM_SPORTS_SUPPLEMENTAL_BUDGET_MS = Math.max(2500, parseInt(process.env.PVTKRRX_STREAM_SPORTS_SUPPLEMENTAL_BUDGET_MS || '8000', 10))
const STREAM_SPORTS_RESPONSE_TIMEOUT_MS = Math.max(5000, parseInt(process.env.PVTKRRX_STREAM_SPORTS_RESPONSE_TIMEOUT_MS || '14000', 10))
const TRACKER_LINK_INSPECTION_TIMEOUT_MS = Math.max(1000, parseInt(process.env.PVTKRRX_TRACKER_LINK_INSPECTION_TIMEOUT_MS || '2500', 10))
// Inspecting a candidate downloads its .torrent through Prowlarr, so this
// budget has to survive a tracker that is asking us to slow down rather than
// one that is broken. hd-torrents.org states its rule in the 429 body: "Please
// wait 13 seconds before making another request."
//
// Measured on the live server 2026-08-11, the SAME links through PVTKRRX's own
// fetcher: 70-457ms each when the trackers were idle, 5.8s median with the
// slowest hitting the old 7000ms ceiling exactly when they were throttling.
// A 7s budget therefore fails precisely when the tracker is telling us to wait
// ~13s, and the candidate is discarded even though the file is fine -- proven
// by fetching and parsing those same torrents by hand: real infohashes, real
// playable MKVs.
//
// 15s clears the tracker's own stated wait. It costs nothing when they are
// fast, because a healthy fetch still returns in well under a second.
const MOVIE_TV_TRACKER_LINK_INSPECTION_TIMEOUT_MS = Math.max(TRACKER_LINK_INSPECTION_TIMEOUT_MS, parseInt(
  process.env.PVTKRRX_MOVIE_TV_TRACKER_LINK_INSPECTION_TIMEOUT_MS || '15000',
  10
))
const TRACKER_LINK_INSPECTION_CACHE_MS = Math.max(60 * 1000, parseInt(process.env.PVTKRRX_TRACKER_LINK_INSPECTION_CACHE_MS || String(10 * 60 * 1000), 10))
// Failed inspections get their own, much shorter life. See the note where the
// result is cached: a failure is a moment, not a fact about the torrent.
const TRACKER_LINK_INSPECTION_FAILURE_CACHE_MS = Math.max(5000, parseInt(
  process.env.PVTKRRX_TRACKER_LINK_INSPECTION_FAILURE_CACHE_MS || '30000',
  10
))
const TRACKER_LINK_INSPECTION_CACHE_MAX_KEYS = Math.max(
  50,
  parseInt(process.env.PVTKRRX_TRACKER_LINK_INSPECTION_CACHE_MAX_KEYS || '1000', 10)
)
const STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS = Math.max(1500, parseInt(
  process.env.PVTKRRX_STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS || '3000',
  10
))
const parsedMovieMinSourceBytes = parseInt(process.env.PVTKRRX_MOVIE_MIN_SOURCE_BYTES || '300000000', 10)
const MOVIE_MIN_SOURCE_BYTES = Number.isFinite(parsedMovieMinSourceBytes)
  ? Math.max(0, parsedMovieMinSourceBytes)
  : 300000000

// Module-level constant Sets — avoid recreating on every call
const TITLE_RELEVANT_STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or'])
const NON_VIDEO_ASSET_TITLE_RE = /\b(?:stl|3d\s*(?:print|model|printing)|figure\s+statue|statue\s+model|ornament|pen\s*holder|fan\s*art|model\s*design)\b/i
const LOOSE_TEAM_NOISE = new Set([
  'epl', 'premier', 'league', 'laliga', 'la', 'liga', 'serie', 'bundesliga', 'ligue', 'champions',
  'europa', 'uefa', 'nba', 'nfl', 'ufc', 'formula', 'grand', 'prix', 'f1', 'match', 'sports',
  'sport', 'live', 'full', 'replay', 'highlights', 'extended', 'main', 'card', 'prelims', 'early'
])
const trackerLinkInspectionCache = new Map()

function trimTrackerLinkInspectionCache(now = Date.now()) {
  for (const [key, entry] of trackerLinkInspectionCache) {
    if (!entry?.expiresAt || entry.expiresAt <= now) trackerLinkInspectionCache.delete(key)
  }
  while (trackerLinkInspectionCache.size > TRACKER_LINK_INSPECTION_CACHE_MAX_KEYS) {
    const oldestKey = trackerLinkInspectionCache.keys().next().value
    if (!oldestKey) break
    trackerLinkInspectionCache.delete(oldestKey)
  }
}

function buildFileUrl(config, configToken, playbackBaseUrl, hash, torrent, fileName, options = {}) {
  return buildPlaybackFileUrl(config, configToken, playbackBaseUrl, hash, torrent, fileName, options)
}

function buildPlaybackRouteUrl(playbackBaseUrl, configToken, payload) {
  try {
    const playbackInfo = encodePlaybackStateToken(payload)
    return `${playbackBaseUrl}/${configToken}/playback/${playbackInfo}`
  } catch (_) {
    return null
  }
}

function buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, hash, fileName) {
  const builtinFilePrefix = `${String(playbackBaseUrl || '').replace(/\/+$/, '')}/${configToken}/file/`
  if (!String(fileUrl || '').startsWith(builtinFilePrefix)) return fileUrl

  return buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
    h: String(hash || '').toLowerCase(),
    p: String(fileName || '')
  }) || fileUrl
}

function buildConfigureHelpUrl(addonUrl, target = 'seedbox') {
  const base = String(addonUrl || '').replace(/\/+$/, '')
  return `${base}/configure?target=${encodeURIComponent(target)}`
}

function getStreamSourceOptions(configToken) {
  return String(configToken || '').trim().toLowerCase() === 'local'
    ? { sourceTag: '[PC]', sourceLabel: 'Host PC', sourceOrigin: 'pc' }
    : { sourceTag: '[SERVER]', sourceLabel: 'Remote Server', sourceOrigin: 'server' }
}

function canServeBuiltinFileRoute(configToken) {
  const hostedRelayRuntime = /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_HOSTED_RELAY || '').trim())
  return String(configToken || '') === 'local' || !hostedRelayRuntime
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Does asking Prowlarr by IMDB id actually find anything on THIS setup?
//
// Torznab indexers are not obliged to honour an imdbid search. A tracker that
// ignores it does not say so -- it answers with an unfiltered listing, which
// then gets thrown away by the relevance filter further down. Measured on the
// owner's 7 private trackers over a morning of real lookups:
//
//   29 lookups -> 0 results
//   10 lookups -> 365 results, of which 0 survived the relevance filter
//
// Not once did it contribute a single usable source, and a movie lookup blocked
// on it for about 7 seconds every time -- roughly a third of the cold wait,
// spent on nothing.
//
// So it earns its place instead of being assumed useful: after enough
// consecutive fruitless lookups the blocking wait is dropped and the title
// search leads, exactly as TV episodes already do. One useful result puts it
// straight back. Deployments whose indexers DO support imdbid never trip this
// and keep the precision of an id-based search.
const IMDB_LOOKUP_USELESS_STREAK_LIMIT = Math.max(1, parseInt(
  process.env.PVTKRRX_IMDB_LOOKUP_USELESS_STREAK_LIMIT || '3',
  10
))
// Once demoted it must still get an occasional go, or "learning" is just a
// one-way switch: never run again means never observed working again, even
// after the owner fixes an indexer. One probe in every 20 lookups costs almost
// nothing and lets it earn its place back on its own.
const IMDB_LOOKUP_RETRY_EVERY = Math.max(2, parseInt(
  process.env.PVTKRRX_IMDB_LOOKUP_RETRY_EVERY || '20',
  10
))
let imdbLookupUselessStreak = 0
let imdbLookupSkipCount = 0

// A tracker whose downloads are broken must not be allowed to fill the shortlist.
//
// Prowlarr returns search results and download links separately, and a tracker
// can happily answer searches while every download fails. Seen live
// 2026-08-11: "Torrenting" returned 30 results for House of the Dragon and
// supplied ALL of the top candidates by seeder count, but every download came
// back HTTP 500, with Prowlarr logging "Invalid torrent file contents" -- the
// tracker was serving an HTML page instead of a torrent, the usual sign of an
// expired session. Twelve candidates, twelve failures, zero streams, while the
// same episode had perfectly good sources on TorrentLeech and IPTorrents
// sitting just below the cut.
//
// That is what made it look random to the owner: titles whose best-seeded
// copies happened to live on the broken tracker returned nothing, and titles
// whose copies lived elsewhere worked fine.
//
// So a tracker earns its place in the shortlist. Consecutive download failures
// push its results to the back rather than removing them, and a single success
// clears the record instantly -- nothing is permanently blacklisted on the
// strength of a bad afternoon.
const TRACKER_DOWNLOAD_FAILURE_DEMOTE_AT = Math.max(2, parseInt(
  process.env.PVTKRRX_TRACKER_DOWNLOAD_FAILURE_DEMOTE_AT || '4',
  10
))
const trackerDownloadFailureStreak = new Map()

function normalizeIndexerKey(name) {
  return String(name || '').trim().toLowerCase()
}

function recordTrackerDownloadOutcome(indexerName, succeeded) {
  const key = normalizeIndexerKey(indexerName)
  if (!key) return
  if (succeeded) {
    if (trackerDownloadFailureStreak.get(key) >= TRACKER_DOWNLOAD_FAILURE_DEMOTE_AT) {
      console.log(`[stream] ${indexerName} is serving torrent files again; restoring it`)
    }
    trackerDownloadFailureStreak.delete(key)
    return
  }
  const next = (trackerDownloadFailureStreak.get(key) || 0) + 1
  trackerDownloadFailureStreak.set(key, next)
  if (next === TRACKER_DOWNLOAD_FAILURE_DEMOTE_AT) {
    console.warn(
      `[stream] ${indexerName} has failed ${next} downloads in a row; ` +
      'moving its results below other trackers until one succeeds'
    )
  }
}

function trackerDownloadsLookBroken(indexerName) {
  return (trackerDownloadFailureStreak.get(normalizeIndexerKey(indexerName)) || 0) >=
    TRACKER_DOWNLOAD_FAILURE_DEMOTE_AT
}

function imdbLookupWorthWaitingFor() {
  if (imdbLookupUselessStreak < IMDB_LOOKUP_USELESS_STREAK_LIMIT) return true
  imdbLookupSkipCount += 1
  if (imdbLookupSkipCount % IMDB_LOOKUP_RETRY_EVERY === 0) {
    console.log('[stream] retrying the IMDB lookup to see whether it works again')
    return true
  }
  return false
}

function recordImdbLookupOutcome(usableCount) {
  if (Number(usableCount) > 0) {
    if (imdbLookupUselessStreak > 0) {
      console.log('[stream] IMDB lookup produced usable sources again; restoring the initial IMDB wait')
    }
    imdbLookupUselessStreak = 0
    return
  }
  imdbLookupUselessStreak += 1
  if (imdbLookupUselessStreak === IMDB_LOOKUP_USELESS_STREAK_LIMIT) {
    console.log(
      `[stream] IMDB lookup produced nothing usable ${imdbLookupUselessStreak} times running; ` +
      'searching by title first from now on'
    )
  }
}

// onSettled fires as each item finishes, so a caller that gives up waiting can
// still use whatever completed before its deadline.
async function mapWithConcurrency(items, limit, mapper, onSettled) {
  const list = Array.isArray(items) ? items : []
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length || 1))
  const results = new Array(list.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < list.length) {
      const index = nextIndex
      nextIndex += 1
      const value = await mapper(list[index], index)
      results[index] = value
      if (typeof onSettled === 'function') {
        try {
          onSettled(value, index)
        } catch (_) {
          // A reporting hook must never break the work it is reporting on.
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

async function statPlayableFile(filePath) {
  const target = String(filePath || '').trim()
  if (!target) return null
  try {
    const stat = await fs.promises.stat(target)
    return stat?.isFile?.() ? stat : null
  } catch (_) {
    return null
  }
}

function buildDirectLocalFileUrl(playbackBaseUrl, configToken, hash, filePath) {
  try {
    const info = encodeFileStateToken({
      h: String(hash || '').toLowerCase(),
      p: filePath
    })
    return `${playbackBaseUrl}/${configToken}/file/${info}`
  } catch (_) {
    return null
  }
}

async function buildOrphanedCustomFileStream(config, configToken, playbackBaseUrl, info, parsed) {
  if (!canServeBuiltinFileRoute(configToken)) return null
  const streamSourceOptions = getStreamSourceOptions(configToken)

  const infoHash = String(info?.h || '').toLowerCase()
  const filePath = String(info?.f || '').trim()
  if (!infoHash || !filePath || !path.isAbsolute(filePath)) return null
  const stat = await statPlayableFile(filePath)
  if (!stat) return null
  if (titleLooksLegacyAvi(filePath) || titleLooksLegacyAvi(info?.t)) return null

  const fileUrl = buildDirectLocalFileUrl(playbackBaseUrl, configToken, infoHash, filePath)
  if (!fileUrl) return null

  return buildOnSeedboxStream(
    { title: info?.t, size: stat.size, seeders: info?.d || 0 },
    fileUrl,
    path.basename(filePath),
    stat.size,
    config,
    parsed,
    streamSourceOptions
  )
}

async function inspectTrackerLink(link, options = {}) {
  const target = String(link || '').trim()
  if (!target) return { packedOnly: false, inspected: false }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || TRACKER_LINK_INSPECTION_TIMEOUT_MS)
  const cacheKey = `${target}|${timeoutMs}`
  const now = Date.now()
  const cached = trackerLinkInspectionCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  // Disk-backed identity cache: a remembered success skips the tracker
  // download entirely, which is what the daily download allowance meters.
  // cacheId is release identity (guid|size), not the URL — see the module
  // note for why the URL cannot be the key.
  const persistKey = String(options.cacheId || '').trim()
  if (persistKey) {
    const remembered = await getCachedTrackerInspection(persistKey)
    if (remembered) {
      trackerLinkInspectionCache.set(cacheKey, {
        expiresAt: Date.now() + TRACKER_LINK_INSPECTION_CACHE_MS,
        promise: Promise.resolve(remembered)
      })
      return remembered
    }
  }

  const promise = (async () => {
    try {
      const payload = await fetchTorrentPayload(target, {
        timeoutMs
      })
      const inspection = inspectTorrentPayload(payload.bytes)
      const totalSizeBytes = inspection.files.reduce((sum, file) => sum + Math.max(0, Number(file?.size || 0)), 0)
      const supportedDirectVideoBytes = inspection.supportedDirectVideoFiles.reduce((sum, file) => sum + Math.max(0, Number(file?.size || 0)), 0)
      return {
        infoHash: String(inspection.infoHash || '').toLowerCase(),
        trackers: inspection.trackers,
        private: Boolean(inspection.private),
        selectedVideoFileIdx: Math.max(0, Number(inspection.selectedVideoFileIdx || 0)),
        selectedVideoFileName: inspection.selectedVideoFileName,
        packedOnly: Boolean(inspection.packedOnly),
        legacyAviOnly: Boolean(inspection.legacyAviOnly),
        inspected: true,
        fileCount: inspection.files.length,
        archiveCount: inspection.archiveFiles.length,
        directVideoCount: inspection.directVideoFiles.length,
        supportedDirectVideoCount: inspection.supportedDirectVideoFiles.length,
        totalSizeBytes,
        supportedDirectVideoBytes
      }
    } catch (err) {
      return {
        packedOnly: false,
        inspected: false,
        error: String(err?.message || '')
      }
    }
  })()

  trackerLinkInspectionCache.set(cacheKey, {
    expiresAt: now + TRACKER_LINK_INSPECTION_CACHE_MS,
    promise
  })
  trimTrackerLinkInspectionCache(now)

  const result = await promise
  // A SUCCESSFUL inspection describes the torrent itself, which does not
  // change, so it is worth keeping for the full window. A FAILURE describes
  // one bad moment — a throttled tracker, a timeout — and caching that for ten
  // minutes turns a blip into ten minutes of "this title has nothing", even
  // after the tracker recovers.
  //
  // Seen live 2026-08-11: House of the Dragon returned 0 streams in SIX
  // MILLISECONDS, because all 12 candidates were serving cached failures from
  // an earlier throttled attempt. That is exactly the "hit and miss" the owner
  // reported — the same title working, then not, then working again.
  //
  // Failures therefore get a short cooldown: long enough to avoid hammering a
  // tracker that just refused us, short enough that the next look genuinely
  // retries. Same principle the Prowlarr search cache already follows.
  const cacheFor = result?.inspected
    ? TRACKER_LINK_INSPECTION_CACHE_MS
    : TRACKER_LINK_INSPECTION_FAILURE_CACHE_MS
  trackerLinkInspectionCache.set(cacheKey, {
    expiresAt: Date.now() + cacheFor,
    promise: Promise.resolve(result)
  })
  trimTrackerLinkInspectionCache()
  if (persistKey && result?.inspected) {
    // Fire-and-forget: a lost write costs one re-download, never a request.
    storeTrackerInspection(persistKey, result).catch(() => {})
  }
  return result
}

function sportsSourceHasPeersAndFiles(item = {}) {
  return Math.max(0, Number(item?.seeders || 0)) > 0 &&
    Math.max(0, Number(item?.size || 0)) > 0
}

function trackerInspectionHasPlayableVideo(inspection = {}) {
  if (!inspection?.inspected) return false
  if (inspection.packedOnly || inspection.legacyAviOnly) return false
  return Math.max(0, Number(inspection.supportedDirectVideoCount || 0)) > 0 &&
    Math.max(0, Number(inspection.supportedDirectVideoBytes || 0)) > 0
}

function buildArchiveDisplayFilename(title) {
  const safeBase = String(title || 'archive')
    .replace(/[^\w.\-()[\] ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.[a-z0-9]{2,4}$/i, '')
  return `${safeBase || 'archive'}.mkv`
}

function experimentalNativeRarStreamsEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_EXPERIMENTAL_RAR_STREAMS || '').trim())
}

function nativeStremioTorrentEnabled(config = {}) {
  if (config?.nativeStremioTorrent === true) return true
  if (config?.experimentalNativeStremioTorrent === true) return true
  if (config?.playback?.nativeStremioTorrent === true) return true
  return /^(1|true|yes|on)$/i.test(String(process.env.PVTKRRX_NATIVE_STREMIO_TORRENT || '').trim())
}

function buildNativeSourcesFromInspection(inspection = {}) {
  const infoHash = String(inspection?.infoHash || '').toLowerCase()
  const trackers = Array.isArray(inspection?.trackers) ? inspection.trackers : []
  const sources = trackers
    .map(tracker => String(tracker || '').trim())
    .filter(Boolean)
    .map(tracker => `tracker:${tracker}`)
  if (/^[a-f0-9]{40}$/.test(infoHash)) sources.push(`dht:${infoHash}`)
  return [...new Set(sources)]
}

function buildNativeTorrentFromInspection(item, inspection, parsed, streamSourceOptions, config = {}) {
  if (!nativeStremioTorrentEnabled(config)) return null
  if (!inspection?.inspected || !trackerInspectionHasPlayableVideo(inspection)) return null
  if (inspection.private) return null
  return buildNativeTorrentStream(
    item,
    {
      infoHash: inspection.infoHash,
      fileIdx: inspection.selectedVideoFileIdx,
      fileName: inspection.selectedVideoFileName || item?.title || '',
      sources: buildNativeSourcesFromInspection(inspection)
    },
    parsed,
    {
      ...streamSourceOptions,
      sourceOrigin: 'stremio',
      sourceLabel: 'Stremio'
    }
  )
}

// Shared inspect -> classify -> build path for a tracker candidate. Used by the
// movie/TV mapper, the supplemental sports loop, and the custom re-search loop.
// Returns { stream, stop }: stream is a Stremio stream or null, stop signals the
// caller to stop iterating (only set when tracker playback is restricted). All
// notice bookkeeping is mutated onto ctx.noticeCounts. Behavioral knobs:
//   - timeoutMs: inspection timeout (movie/TV uses the longer budget)
//   - allowNative: emit a native-torrent stream when supported (sports + movie/TV)
//   - knownInfoHashFallback: synthesize an inspection from item.infohash when
//     there is no tracker link (sports supplemental qBit-title items)
//   - requirePlayableVideo: skip link-backed items with no playable video file
//   - parseTitle: pre-parsed metadata, falls back to parse(item.title)
async function emitTrackerCandidateStream(item, ctx = {}) {
  const {
    playbackBaseUrl,
    configToken,
    config,
    streamSourceOptions,
    noticeCounts,
    trackerPlaybackEnabled,
    trackerPlaybackRestriction,
    timeoutMs = TRACKER_LINK_INSPECTION_TIMEOUT_MS,
    allowNative = false,
    knownInfoHashFallback = false,
    requirePlayableVideo = false
  } = ctx
  const parsed = ctx.parsed || parse(item.title || '')

  const titleLooksPacked = isLikelyPackedReleaseTitle(item.title)
  if (titleLooksLegacyAvi(item.title)) {
    if (noticeCounts) noticeCounts.legacyAviSuppressed += 1
    return { stream: null, stop: false }
  }
  const knownInfoHash = String(item?.infohash || '').toLowerCase()
  const inspection = titleLooksPacked
    ? { packedOnly: true, inspected: false }
    : item.link
      ? await inspectTrackerLink(item.link, {
        timeoutMs,
        cacheId: item.guid ? `${item.guid}|${Number(item.size || 0)}` : ''
      })
      : (knownInfoHashFallback && knownInfoHash)
        ? { packedOnly: false, inspected: true, infoHash: knownInfoHash }
        : { packedOnly: false, inspected: false }
  if (inspection.inspected && !inspection.infoHash && knownInfoHash) {
    inspection.infoHash = knownInfoHash
  }
  if (titleLooksPacked || inspection.packedOnly) {
    if (noticeCounts) noticeCounts.packedArchiveLiveUnsupported += 1
    return { stream: null, stop: false }
  }
  if (inspection.legacyAviOnly) {
    if (noticeCounts) noticeCounts.legacyAviSuppressed += 1
    return { stream: null, stop: false }
  }
  if (item.link) recordTrackerDownloadOutcome(item.indexer, Boolean(inspection.inspected))
  if (!inspection.inspected) {
    if (noticeCounts) noticeCounts.trackerLinkUnverified += 1
    return { stream: null, stop: false }
  }
  if (knownInfoHashFallback && !item.link && knownInfoHash) {
    inspection.selectedVideoFileIdx = 0
    inspection.selectedVideoFileName = item.title || ''
  }
  if (requirePlayableVideo && item.link && !trackerInspectionHasPlayableVideo(inspection)) {
    return { stream: null, stop: false }
  }
  if (allowNative) {
    const nativeStream = buildNativeTorrentFromInspection(item, inspection, parsed, streamSourceOptions, config)
    if (nativeStream) return { stream: nativeStream, stop: false }
  }
  if (!trackerPlaybackEnabled) {
    recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
    return { stream: null, stop: true }
  }
  try {
    const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
      h: item.infohash || inspection.infoHash || '',
      l: item.link
    })
    if (!playbackUrl) return { stream: null, stop: false }
    return { stream: buildOnTrackerStream(item, playbackUrl, parsed, streamSourceOptions), stop: false }
  } catch (_) {
    // Skip invalid playback payloads instead of leaking raw tracker URLs.
    return { stream: null, stop: false }
  }
}

function buildMatchedArchiveStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions = {}) {
  const archiveFiles = findPackedArchiveFiles(files)
  if (archiveFiles.length === 0) return null
  if (!arePackedArchiveFilesReady(archiveFiles)) return null

  const rarUrls = []
  for (const archiveFile of archiveFiles) {
    const archiveUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, archiveFile.name, {
      multipleFiles: files.length > 1,
      requireCurrentPathProof: false
    })
    if (!archiveUrl) return null
    const archiveBytes = Math.max(0, Number(archiveFile?.size || 0))
    rarUrls.push(archiveBytes > 0 ? [archiveUrl, archiveBytes] : [archiveUrl])
  }

  const totalBytes = archiveFiles.reduce((sum, file) => sum + Math.max(0, Number(file?.size || 0)), 0)
  return buildOnArchiveStream(
    item,
    rarUrls,
    buildArchiveDisplayFilename(item?.title || matched?.name || ''),
    totalBytes,
    parsed,
    100,
    streamSourceOptions
  )
}

async function buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions = {}) {
  const absolutePath = path.normalize(String(extractedFilePath || '').trim())
  if (!absolutePath) return null

  const stat = await statPlayableFile(absolutePath)
  if (!stat) return null

  const fileName = path.basename(absolutePath)
  const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, fileName, {
    currentFilePath: absolutePath,
    requireCurrentPathProof: false
  })
  if (!fileUrl) return null

  return buildOnSeedboxStream(item, fileUrl, fileName, stat.size, config, parsed, {
    ...streamSourceOptions,
    extracted: true
  })
}

async function buildMatchedArchiveCompatibleStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions = {}) {
  let extractedFilePath = findExtractedArchiveVideoPath(matched)
  if (extractedFilePath) {
    const extractedStream = await buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions)
    if (extractedStream) {
      return { stream: extractedStream, extractionStatus: 'ready', streamKind: 'direct' }
    }
  }

  let extractionStatus = ''
  try {
    const extraction = await ensurePackedArchiveExtracted(matched, files, config.additionalStorageRoots)
    extractionStatus = String(extraction?.status || '')
    if (extractionStatus === 'ready' && extraction?.path) {
      extractedFilePath = extraction.path
      const extractedStream = await buildExtractedArchiveStream(config, configToken, playbackBaseUrl, matched, item, parsed, extractedFilePath, streamSourceOptions)
      if (extractedStream) {
        return { stream: extractedStream, extractionStatus, streamKind: 'direct' }
      }
    }
  } catch (err) {
    console.warn(`[archive-extract] ${String(matched?.hash || '').slice(0, 8)}: ${err.message}`)
    extractionStatus = 'failed'
  }

  const archiveStream = buildMatchedArchiveStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions)
  if (archiveStream && experimentalNativeRarStreamsEnabled()) {
    return { stream: archiveStream, extractionStatus, streamKind: 'native-archive' }
  }

  return {
    stream: null,
    extractionStatus,
    streamKind: ''
  }
}

function recordPackedArchiveOutcome(noticeCounts, archiveResult) {
  if (!noticeCounts) return

  const status = String(archiveResult?.extractionStatus || '')
  if (status === 'pending') {
    noticeCounts.packedArchivePending += 1
    return
  }
  if (status === 'running') {
    noticeCounts.packedArchiveExtracting += 1
    return
  }

  // Any other non-ready archive state means PVTKRRX could not prepare a
  // direct-play file, and native archive playback is intentionally hidden
  // unless the experimental override is enabled.
  noticeCounts.packedArchiveExtractorUnavailable += 1
}

function createNoticeCounts() {
  return {
    hostedReadyOnly: 0,
    authSuppressed: 0,
    bufferingPathUnproven: 0,
    packedArchivePending: 0,
    packedArchiveLiveUnsupported: 0,
    packedArchiveExtracting: 0,
    packedArchiveExtractorUnavailable: 0,
    trackerLinkUnverified: 0,
    legacyAviSuppressed: 0
  }
}

// Decide how long Stremio may cache a stream response. We only allow a modest
// cache when the list has at least one ready/playable row and no in-flight
// downloading/preparing placeholder — otherwise we keep 0 so Stremio re-queries
// and picks up the file once it finishes downloading.
function resolveStreamCacheMaxAge(streams, { sports = false } = {}) {
  const list = Array.isArray(streams) ? streams : []
  let hasReady = false
  for (const stream of list) {
    const mode = String(stream?.behaviorHints?.sourceMode || '').toLowerCase()
    if (mode === 'buffering') return 0
    if (mode === 'seedbox' || mode === 'native-torrent' || mode === 'debrid-cache') hasReady = true
  }
  if (!hasReady) return 0
  return sports ? 30 : 60
}

function recordTrackerRestrictionNotice(noticeCounts, restriction) {
  if (!noticeCounts) return
  if (restriction === 'hosted-runtime') noticeCounts.hostedReadyOnly += 1
  else if (restriction === 'file-server-auth') noticeCounts.authSuppressed += 1
}

function appendNoticeStreams(streams, noticeCounts, addonUrl) {
  if (!noticeCounts) return

  const helpUrl = buildConfigureHelpUrl(addonUrl, 'seedbox')
  if (noticeCounts.hostedReadyOnly > 0) {
    streams.push(buildInfoStream('hosted-ready-only', helpUrl, noticeCounts.hostedReadyOnly))
  }
  if (noticeCounts.authSuppressed > 0) {
    streams.push(buildInfoStream('auth-suppressed', helpUrl, noticeCounts.authSuppressed))
  }
  if (noticeCounts.bufferingPathUnproven > 0) {
    streams.push(buildInfoStream('buffering-path-unproven', helpUrl, noticeCounts.bufferingPathUnproven))
  }
  if (noticeCounts.packedArchivePending > 0) {
    streams.push(buildInfoStream('packed-archive-pending', helpUrl, noticeCounts.packedArchivePending))
  }
  if (noticeCounts.packedArchiveLiveUnsupported > 0) {
    streams.push(buildInfoStream('packed-archive-live-unsupported', helpUrl, noticeCounts.packedArchiveLiveUnsupported))
  }
  if (noticeCounts.packedArchiveExtracting > 0) {
    streams.push(buildInfoStream('packed-archive-extracting', helpUrl, noticeCounts.packedArchiveExtracting))
  }
  if (noticeCounts.packedArchiveExtractorUnavailable > 0) {
    streams.push(buildInfoStream('packed-archive-extractor-unavailable', helpUrl, noticeCounts.packedArchiveExtractorUnavailable))
  }
  if (noticeCounts.trackerLinkUnverified > 0) {
    streams.push(buildInfoStream('tracker-link-unverified', helpUrl, noticeCounts.trackerLinkUnverified))
  }
  if (noticeCounts.legacyAviSuppressed > 0) {
    streams.push(buildInfoStream('legacy-avi-suppressed', helpUrl, noticeCounts.legacyAviSuppressed))
  }
}

const { settleWithTimeout } = require('../utils/timeout')

async function handleStream(config, type, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  let baseResult = { streams: [] }
  try {
    const effectiveConfig = applyHostedServiceOverrides(config && typeof config === 'object' ? config : {})
    if (id.startsWith('sportsmeta:')) {
      const result = await settleWithTimeout(
        handleSportsMetaStream(effectiveConfig, id, addonUrl, configToken, playbackBaseUrl),
        STREAM_SPORTS_RESPONSE_TIMEOUT_MS,
        { streams: [], cacheMaxAge: 0 }
      )
      if (result.timedOut) {
        console.warn(`[stream] sportsmeta response budget exceeded id=${id} timeoutMs=${STREAM_SPORTS_RESPONSE_TIMEOUT_MS}`)
      }
      baseResult = result.value
    } else if (id.startsWith('pvtkrrx:')) {
      const decoded = decodeCustomId(id)
      if (isSportsStreamInfo(decoded)) {
        const result = await settleWithTimeout(
          handleDecodedCustomStream(effectiveConfig, decoded, addonUrl, configToken, playbackBaseUrl),
          STREAM_SPORTS_RESPONSE_TIMEOUT_MS,
          { streams: [], cacheMaxAge: 0 }
        )
        if (result.timedOut) {
          console.warn(`[stream] custom sports response budget exceeded id=${id} timeoutMs=${STREAM_SPORTS_RESPONSE_TIMEOUT_MS}`)
        }
        baseResult = result.value
      } else {
        baseResult = await handleDecodedCustomStream(effectiveConfig, decoded, addonUrl, configToken, playbackBaseUrl)
      }
    } else if (id.startsWith('tt')) {
      baseResult = await handleImdbStream(effectiveConfig, type, id, addonUrl, configToken, playbackBaseUrl)
    }
  } catch (err) {
    console.error(`[stream] ERROR type=${type} id=${id}: ${err.message}`)
    baseResult = { streams: [] }
  }

  // v1.3 debrid + cache search routing post-processor.
  // No-op for installs without debrid/cacheSearch configured (returns existing baseResult unchanged).
  try {
    return await applyV13Routing(baseResult, {
      config,
      addonUrl,
      playbackBaseUrl,
      configToken,
      id,
      type
    })
  } catch (err) {
    console.error(`[stream-router] post-processor error type=${type} id=${id}: ${err.message}`)
    return baseResult
  }
}

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Team name normalization is shared in utils/teamName.js so stream matching
// no longer depends on the legacy SportsDb client module.
const normalizeSportsTeamName = normalizeTeamName

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function extractSportsDate(value, fallbackValue = '') {
  const sources = [String(value || ''), String(fallbackValue || '')]
  for (const source of sources) {
    const compact = source.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`

    const iso = source.match(/\b((?:19|20)\d{2})[._\s-](\d{2})[._\s-](\d{2})\b/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

    const dmy = source.match(/\b(\d{2})[._\s-](\d{2})[._\s-]((?:19|20)\d{2})\b/)
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`

    const plain = source.match(/((?:19|20)\d{2}-\d{2}-\d{2})/)
    if (plain) return plain[1]
  }
  return ''
}

function parseIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isFinite(date.getTime()) ? date : null
}

function sportsDateDistanceDays(a, b) {
  const left = parseIsoDate(a)
  const right = parseIsoDate(b)
  if (!left || !right) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)))
}

function cleanupLooseTeamSide(value, side = 'left') {
  let tokens = normalizeSportsTeamName(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !LOOSE_TEAM_NOISE.has(token))
    .filter(token => !/^(19|20)\d{2}$/.test(token))
    .filter(token => !/^\d{1,2}$/.test(token))

  if (side === 'left' && tokens.length > 4) tokens = tokens.slice(-4)
  if (side === 'right' && tokens.length > 4) tokens = tokens.slice(0, 4)
  return titleCaseWords(tokens.join(' '))
}

function parseLooseSportsEventTitle(title, fallbackDate = '') {
  const raw = String(title || '').trim()
  if (!raw) return null

  const structured = parseSportsTitle(raw, fallbackDate)
  if (structured) return structured

  const cleaned = cleanTitle(raw)
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = cleaned.match(/(.+?)\b(?:vs\.?|v|@)\b(.+)/i)
  if (!match) return null

  const date = extractSportsDate(raw, fallbackDate)
  const homeTeam = cleanupLooseTeamSide(match[1], 'left')
  const awayTeam = cleanupLooseTeamSide(match[2], 'right')
  if (!date || !homeTeam || !awayTeam) return null

  return {
    date,
    homeTeam,
    awayTeam,
    raw
  }
}

function sportsTeamNamesMatch(expected, actual) {
  const left = normalizeSportsTeamName(expected)
  const right = normalizeSportsTeamName(actual)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function sportsTeamMatchCount(targetEvent, candidateEvent) {
  const checks = [
    sportsTeamNamesMatch(targetEvent?.homeTeam, candidateEvent?.homeTeam),
    sportsTeamNamesMatch(targetEvent?.homeTeam, candidateEvent?.awayTeam),
    sportsTeamNamesMatch(targetEvent?.awayTeam, candidateEvent?.homeTeam),
    sportsTeamNamesMatch(targetEvent?.awayTeam, candidateEvent?.awayTeam)
  ]
  return checks.filter(Boolean).length
}

const NON_MATCHUP_SESSION_WORDS = new Set([
  'practice',
  'qualifying',
  'qualifier',
  'sprint',
  'race',
  'press',
  'conference',
  'warmup',
  'warm-up',
  'fp1',
  'fp2',
  'fp3'
])

function tokenizeSportsEventName(value) {
  return normalizeForMatch(value)
    .split(/\s+/)
    .filter(token =>
      token.length > 2 &&
      !['motogp', 'formula', 'grand', 'prix', 'round', 'event', 'main', 'card'].includes(token)
    )
}

function sportsSessionTokens(value) {
  const tokens = tokenizeSportsEventName(value)
  const sessions = tokens.filter(token => NON_MATCHUP_SESSION_WORDS.has(token))
  if (sessions.includes('qualifier')) sessions.push('qualifying')
  if (sessions.includes('warm')) sessions.push('warmup')
  return [...new Set(sessions)]
}

function sportsLocationTokens(value) {
  return tokenizeSportsEventName(value)
    .filter(token => !NON_MATCHUP_SESSION_WORDS.has(token))
}

function tokenOverlapCount(left = [], right = []) {
  const rightSet = new Set(right)
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0)
}

function nonMatchupSportsEventMatches(targetEvent = {}, candidateEvent = {}) {
  const targetName = String(targetEvent?.eventName || '').trim()
  const candidateName = String(candidateEvent?.eventName || '').trim()
  if (!targetName || !candidateName) return false

  const targetSessions = sportsSessionTokens(targetName)
  if (targetSessions.length > 0) {
    const candidateSessions = sportsSessionTokens(candidateName)
    if (tokenOverlapCount(targetSessions, candidateSessions) === 0) return false
  }

  const targetLocations = sportsLocationTokens(targetName)
  const candidateLocations = sportsLocationTokens(candidateName)
  if (targetLocations.length > 0 && candidateLocations.length > 0) {
    const required = Math.min(2, targetLocations.length)
    if (tokenOverlapCount(targetLocations, candidateLocations) < required) return false
  }

  if (targetEvent?.date && candidateEvent?.date) {
    const dateDistance = sportsDateDistanceDays(targetEvent.date, candidateEvent.date)
    if (dateDistance > 3) return false
  }

  return true
}

function buildStructuredSportsTarget(info = {}) {
  const explicitDate = extractSportsDate(info.e, info.p)
  const explicitHomeTeam = String(info.o || '').trim()
  const explicitAwayTeam = String(info.w || '').trim()
  if (explicitDate && explicitHomeTeam && explicitAwayTeam) {
    return {
      league: String(info.u || info.g || '').trim(),
      date: explicitDate,
      homeTeam: explicitHomeTeam,
      awayTeam: explicitAwayTeam,
      raw: String(info.t || '').trim()
    }
  }

  const structuredMatchup = parseSportsTitle(info.t || '', info.p || '') || parseLooseSportsEventTitle(info.t || '', info.p || '')
  if (structuredMatchup) return structuredMatchup

  const event = parseSportsEventTitle(info.t || '', info.p || '')
  if (event) {
    return {
      ...event,
      date: explicitDate || event.date || ''
    }
  }

  return null
}

function humanizeSportsMetaSlug(value) {
  const acronyms = {
    aew: 'AEW',
    f1: 'F1',
    indycar: 'IndyCar',
    la: 'LA',
    mlb: 'MLB',
    mma: 'MMA',
    motogp: 'MotoGP',
    nascar: 'NASCAR',
    nba: 'NBA',
    nfl: 'NFL',
    nhl: 'NHL',
    okc: 'OKC',
    pdc: 'PDC',
    ufc: 'UFC',
    wec: 'WEC',
    wrc: 'WRC',
    wwe: 'WWE'
  }

  return String(value || '')
    .trim()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const key = String(part || '').toLowerCase()
      return acronyms[key] || titleCaseWords(part)
    })
    .join(' ')
}

function parseSportsMetaId(id) {
  const rawId = String(id || '').trim()
  if (!rawId.startsWith('sportsmeta:event:')) return null

  const payload = rawId.slice('sportsmeta:event:'.length)
  const parts = payload.split('|').map((part) => String(part || '').trim())
  if (parts.length < 4) return null

  const sport = humanizeSportsMetaSlug(parts[0])
  const date = extractSportsDate(parts[1], parts[1])

  if (parts.length >= 5) {
    return {
      id: rawId,
      sport,
      league: humanizeSportsMetaSlug(parts[2]),
      date,
      homeTeam: humanizeSportsMetaSlug(parts[3]),
      awayTeam: humanizeSportsMetaSlug(parts[4])
    }
  }

  return {
    id: rawId,
    sport,
    league: humanizeSportsMetaSlug(parts[2]),
    date,
    eventName: humanizeSportsMetaSlug(parts[3])
  }
}

function buildSportsMetaSearchTitle(event = {}) {
  const league = String(event.league || '').trim()
  const date = extractSportsDate(event.date, event.date)
  const teams = [event.homeTeam, event.awayTeam].filter(Boolean).join(' vs ')
  const title = String(event.title || event.name || event.eventName || teams).trim()
  return [league, date, teams || title].filter(Boolean).join(' ').trim() || title
}

function buildSportsMetaInfo(event = {}, canonicalId = '') {
  const id = String(event.id || canonicalId || '').trim()
  const date = extractSportsDate(event.date, event.date)
  const homeTeam = String(event.homeTeam || '').trim()
  const awayTeam = String(event.awayTeam || '').trim()
  const league = String(event.league || '').trim()
  const sport = String(event.sport || '').trim()
  const displayName = String(
    event.name ||
    event.title ||
    [homeTeam, awayTeam].filter(Boolean).join(' vs ') ||
    event.eventName ||
    id
  ).trim()
  const searchTitle = buildSportsMetaSearchTitle({
    ...event,
    date,
    homeTeam,
    awayTeam,
    league
  })

  return {
    y: 'movie',
    k: 'sports',
    n: displayName,
    t: searchTitle || displayName,
    p: date,
    e: date,
    g: league,
    u: league,
    o: homeTeam,
    w: awayTeam,
    r: sport,
    v: String(event.eventId || '').trim(),
    x: id
  }
}

function normalizeSearchQuery(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildCustomSearchQueries(info = {}) {
  const queries = []
  const seen = new Set()
  const add = (value) => {
    const normalized = normalizeSearchQuery(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) return
    seen.add(key)
    queries.push(normalized)
  }

  const displayName = String(info.n || '').trim()
  const league = String(info.g || info.u || '').trim()
  const sport = String(info.r || '').trim()
  const homeTeam = String(info.o || '').trim()
  const awayTeam = String(info.w || '').trim()
  const eventDate = extractSportsDate(info.e || info.p || '', info.p || '')
  const eventYear = eventDate ? eventDate.slice(0, 4) : ''
  const eventDayMonth = eventDate
    ? `${eventDate.slice(8, 10)} ${eventDate.slice(5, 7)}`
    : ''

  add(info.t)
  add(displayName)
  if (league && displayName) add(`${league} ${displayName}`)
  if (sport && displayName) add(`${sport} ${displayName}`)
  if (homeTeam && awayTeam) {
    const matchup = `${homeTeam} vs ${awayTeam}`
    const flatMatchup = `${homeTeam} ${awayTeam}`
    add(matchup)
    if (league) add(`${league} ${matchup}`)
    for (const leagueAlias of buildSportsLeagueSearchAliases(league)) {
      add(`${leagueAlias} ${matchup}`)
      add(`${leagueAlias} ${flatMatchup}`)
      if (eventYear) {
        add(`${leagueAlias} ${eventYear} ${matchup}`)
        add(`${leagueAlias} ${eventYear} ${flatMatchup}`)
      }
      if (eventYear && eventDayMonth) {
        add(`${leagueAlias} ${eventYear} ${matchup} ${eventDayMonth}`)
        add(`${leagueAlias} ${eventYear} ${flatMatchup} ${eventDayMonth}`)
      }
    }
  }

  return queries.slice(0, STREAM_SPORTS_MAX_SEARCH_QUERIES)
}

function buildSportsLeagueSearchAliases(league = '') {
  const raw = String(league || '').trim()
  if (!raw) return []
  const entry = getMappedLeagueEntry(raw)
  const values = [
    raw,
    entry?.name,
    entry?.code,
    ...(Array.isArray(entry?.aliases) ? entry.aliases : [])
  ]
  const seen = new Set()
  const aliases = []
  for (const value of values) {
    const normalized = normalizeSearchQuery(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    aliases.push(normalized)
  }
  return aliases
}

async function loadSportsMetaInfo(config = {}, id = '') {
  const client = new SportsMetaClient({
    baseUrl: config?.sportsmetaBaseUrl
  })

  try {
    const canonical = await client.getEvent(id)
    if (canonical?.event) {
      return buildSportsMetaInfo(canonical.event, id)
    }
  } catch (error) {
    console.warn(`[stream] SportsMeta lookup failed for ${id}: ${error.message}`)
  }

  const parsed = parseSportsMetaId(id)
  if (!parsed) return null
  return buildSportsMetaInfo({
    ...parsed,
    name: parsed.homeTeam && parsed.awayTeam
      ? `${parsed.homeTeam} vs ${parsed.awayTeam}`
      : parsed.eventName
  }, id)
}

function sourceItemKey(item = {}) {
  return String(item.infohash || item.link || item.h || item.l || '')
    .trim()
    .toLowerCase()
}

function isSportsStreamInfo(info = {}) {
  return String(info?.k || '').trim().toLowerCase() === 'sports' ||
    String(info?.x || '').trim().startsWith('sportsmeta:') ||
    Boolean(String(info?.ak || '').trim())
}

function mergeUniqueSourceItems(...batches) {
  const byKey = new Map()
  for (const batch of batches) {
    for (const item of (Array.isArray(batch) ? batch : [])) {
      const key = sourceItemKey(item) ||
        `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
      if (!key || byKey.has(key)) continue
      byKey.set(key, item)
    }
  }
  return [...byKey.values()]
}

async function runSportsProwlarrSearch(torznab, query, useCategories, contextLabel) {
  const mode = useCategories ? `cats="${SPORT_CATS}" useCategories=true` : 'cats="all" useCategories=false'
  console.log(`[stream] ${contextLabel} query="${query}" ${mode}`)
  const searchResult = await settleWithTimeout(
    torznab.search(query, SPORT_CATS, 'search', {
      useCategories,
      timeoutMs: STREAM_TITLE_FALLBACK_TIMEOUT_MS + 500
    }),
    STREAM_TITLE_FALLBACK_TIMEOUT_MS,
    []
  )
  if (searchResult.timedOut) {
    console.warn(`[stream] ${contextLabel} timed out after ${STREAM_TITLE_FALLBACK_TIMEOUT_MS}ms (${mode})`)
  }
  if (searchResult.error) {
    console.error(`[stream] ${contextLabel} error (${mode}):`, searchResult.error?.message)
  }
  return Array.isArray(searchResult.value) ? searchResult.value : []
}

async function searchSportsProwlarrVariants(torznab, query, contextLabel) {
  const categoryItems = await runSportsProwlarrSearch(torznab, query, true, contextLabel)
  return filterUnsafeSportsSearchItems(categoryItems, contextLabel)
}

function filterUnsafeSportsSearchItems(items, contextLabel = 'Sports search') {
  const list = Array.isArray(items) ? items : []
  const filtered = list.filter(item => !isAdultContentResult(item))
  const removed = list.length - filtered.length
  if (removed > 0) {
    console.warn(`[stream] ${contextLabel}: suppressed ${removed} adult/non-sports source(s)`)
  }
  return filtered
}

async function buildSupplementalSportsStreams({
  info,
  torznab,
  playbackBaseUrl,
  configToken,
  config,
  streamSourceOptions,
  seenKeys,
  noticeCounts,
  trackerPlaybackEnabled,
  trackerPlaybackRestriction,
  existingStreamCount = 0,
  deadlineMs = 0
}) {
  if (!torznab) return []
  if (!canEmitTrackerPlayback(config, configToken)) {
    if (noticeCounts) recordTrackerRestrictionNotice(noticeCounts, getTrackerPlaybackRestriction(config, configToken))
    return []
  }

  const targetEvent = buildStructuredSportsTarget(info)
  const queryLimit = existingStreamCount > 0
    ? Math.min(STREAM_SPORTS_MAX_SEARCH_QUERIES_WITH_DIRECT, STREAM_SPORTS_MAX_SEARCH_QUERIES)
    : STREAM_SPORTS_MAX_SEARCH_QUERIES
  const queries = buildCustomSearchQueries(info).slice(0, queryLimit)
  const ranked = []
  const rankedKeys = new Set()
  const hasBudget = (minRemainingMs = 250) => !deadlineMs || Date.now() + minRemainingMs < deadlineMs

  // Run the per-query Prowlarr searches concurrently instead of sequentially — they were
  // awaited one-at-a-time and were the dominant ~6s of the stream-open lag. Same result set,
  // just gathered in parallel; ranking/dedup below is unchanged and order-independent.
  const searchBatches = hasBudget(750)
    ? await Promise.all(queries.map(query =>
      searchSportsProwlarrVariants(torznab, query, 'Supplemental sports search')
        .then(items => ({ query, items: Array.isArray(items) ? items : [] }))
        .catch(() => ({ query, items: [] }))
    ))
    : []
  for (const { query, items } of searchBatches) {
    for (const item of items) {
      const key = sourceItemKey(item) ||
        `${String(item?.indexer || '').trim().toLowerCase()}|${String(item?.title || '').trim().toLowerCase()}`
      if (!key || rankedKeys.has(key)) continue
      rankedKeys.add(key)

      if (isLikelyPackedReleaseTitle(item.title)) {
        ranked.push({ item, score: scoreCandidate(item), packed: true })
        continue
      }
      if (!Boolean(item?.link || item?.infohash)) continue
      if (!similarTitle(item.title, query) && !similarTitle(item.title, info?.t || info?.n || '')) continue

      let score = scoreCandidate(item)
      if (targetEvent?.date && targetEvent?.homeTeam && targetEvent?.awayTeam) {
        const parsedEvent = parseLooseSportsEventTitle(item.title, item.pubDate)
        if (parsedEvent) {
          const dateDistance = sportsDateDistanceDays(targetEvent.date, parsedEvent.date)
          const teamHits = sportsTeamMatchCount(targetEvent, parsedEvent)
          if (dateDistance > 1 || teamHits < 1) continue
          score += (teamHits * 100000000) + ((dateDistance === 0 ? 2 : 1) * 10000000)
        }
      } else if (targetEvent?.eventName) {
        const parsedEvent = parseSportsEventTitle(item.title, item.pubDate)
        if (!parsedEvent || !nonMatchupSportsEventMatches(targetEvent, parsedEvent)) continue
        score += 50000000
      }

      ranked.push({ item, score })
    }
  }

  ranked.sort((a, b) => b.score - a.score)

  const deduped = []
  for (const entry of ranked) {
    const key = sourceItemKey(entry.item)
    if (!key || seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(entry.item)
    if (deduped.length >= 20) break
  }

  const ordered = preferSeededResults(deduped, 'supplemental sports streams')
  // Inspect candidates concurrently (each .torrent fetch is a 2.5s-timeout download
  // and was the dominant serial cost). The original loop inspected candidates until
  // it had STREAM_MAX_CANDIDATES *playable* streams — failed inspections didn't count
  // — so we inspect the whole peers/files-eligible set (already capped at 20 by the
  // dedupe above) in parallel, then assemble in order applying the cap, budget, and
  // tracker-restriction "stop" semantics exactly as before.
  const inspectable = ordered.filter(sportsSourceHasPeersAndFiles)
  if (!hasBudget(500) && inspectable.length > 0) {
    console.warn('[stream] Supplemental sports inspection budget exhausted')
    return []
  }
  const candidateResults = await mapWithConcurrency(inspectable, STREAM_CANDIDATE_CONCURRENCY, async (item) => {
    if (!hasBudget(500)) return { skipped: true }
    return emitTrackerCandidateStream(item, {
      playbackBaseUrl,
      configToken,
      config,
      streamSourceOptions,
      noticeCounts,
      trackerPlaybackEnabled,
      trackerPlaybackRestriction,
      allowNative: true,
      knownInfoHashFallback: true,
      requirePlayableVideo: true,
      parsed: parse(item.title || queries[0] || '')
    })
  })

  const streams = []
  let budgetExhausted = false
  for (const result of candidateResults) {
    if (streams.length + existingStreamCount >= STREAM_MAX_CANDIDATES) break
    if (result?.skipped) {
      budgetExhausted = true
      continue
    }
    if (result?.stop) break
    if (result?.stream) streams.push(result.stream)
  }
  if (budgetExhausted) console.warn('[stream] Supplemental sports inspection budget exhausted')

  return streams
}

function scoreCandidate(item) {
  const title = String(item?.title || '')
  let quality = 0
  if (/2160p/i.test(title)) quality = 3
  else if (/1080p/i.test(title)) quality = 2
  else if (/720p/i.test(title)) quality = 1
  const seeders = Math.max(0, Number(item?.seeders || 0))
  const sizeGb = Math.max(0, Number(item?.size || 0)) / 1e9
  return (
    (seeders * 1000000) +
    (quality * 10000) +
    Math.min(sizeGb, 500)
  )
}

function hasActiveSeeders(item) {
  return Number(item?.seeders || 0) > 0
}

function preferSeededResults(items, contextLabel, keepZeroSeederPredicate = null) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) return list

  const preferred = []
  const delayed = []
  // A source is only as good as our ability to fetch its torrent file, so a
  // tracker that keeps refusing downloads is treated like a dead seed: kept,
  // but behind everything we can actually play.
  const brokenTracker = []
  for (const item of list) {
    if (trackerDownloadsLookBroken(item?.indexer)) {
      brokenTracker.push(item)
      continue
    }
    const keepNearTop = hasActiveSeeders(item) || (
      typeof keepZeroSeederPredicate === 'function' && keepZeroSeederPredicate(item)
    )
    if (keepNearTop) preferred.push(item)
    else delayed.push(item)
  }

  if (brokenTracker.length > 0) {
    const names = [...new Set(brokenTracker.map(i => String(i?.indexer || '?')))].join(', ')
    console.log(
      `[stream] ${contextLabel}: moved ${brokenTracker.length} source(s) from ${names} to the end ` +
      '(downloads failing)'
    )
  }
  if (preferred.length === 0 && delayed.length === 0) return list
  if (delayed.length > 0) {
    console.log(`[stream] ${contextLabel}: moved ${delayed.length} zero-seeder source(s) to the end`)
  }
  return [...preferred, ...delayed, ...brokenTracker]
}

function similarTitle(candidateTitle, targetTitle) {
  const candidate = normalizeForMatch(candidateTitle)
  const target = normalizeForMatch(targetTitle)
  if (!candidate || !target) return false
  if (candidate === target || candidate.includes(target) || target.includes(candidate)) return true

  const words = target.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return false
  const hits = words.reduce((acc, word) => acc + (candidate.includes(word) ? 1 : 0), 0)
  return hits >= Math.max(2, Math.ceil(words.length * 0.6))
}

function findTorrentByTitle(torrents, targetTitle) {
  const target = normalizeForMatch(targetTitle)
  if (!target) return null

  for (const torrent of torrents) {
    const name = normalizeForMatch(torrent.name)
    if (!name) continue
    if (name === target || name.includes(target) || target.includes(name)) return torrent
  }

  const words = target.split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return null

  let best = null
  let bestScore = 0
  for (const torrent of torrents) {
    const name = normalizeForMatch(torrent.name)
    const score = words.reduce((acc, word) => acc + (name.includes(word) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = torrent
    }
  }

  return bestScore >= Math.max(2, Math.ceil(words.length * 0.6)) ? best : null
}

function buildQbitTitleFallbackItems(torrents, contentTitle, options = {}) {
  if (!contentTitle || !Array.isArray(torrents) || torrents.length === 0) return []
  const items = []
  const seen = new Set()

  for (const torrent of torrents) {
    const hash = String(torrent?.hash || '').trim().toLowerCase()
    const title = String(torrent?.name || '').trim()
    if (!hash || !title || seen.has(hash)) continue
    if (!titleRelevant(title, contentTitle, options)) continue
    if (
      options?.type === 'series' &&
      options?.season &&
      options?.episode &&
      !matchesEpisode(title, options.season, options.episode)
    ) {
      continue
    }

    seen.add(hash)
    items.push({
      title,
      infohash: hash,
      link: '',
      size: Number(torrent?.size || torrent?.total_size || 0),
      seeders: 0,
      indexer: 'qBittorrent'
    })
  }

  if (items.length > 0) {
    console.log(`[stream] qBit title fallback matched ${items.length} torrent(s)`)
  }
  return items
}

// Keep only results where the significant words from the query appear in the result title.
// Prevents sports indexers returning F1/Olympics results when searching for a movie.
function titleWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => (w.length > 2 || /^\d+$/.test(w)) && !TITLE_RELEVANT_STOPWORDS.has(w))
}

function allTitleTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function matchesNumericTitleWord(resultTitle, queryWords, queryIndex) {
  const word = queryWords[queryIndex]
  if (!/^\d+$/.test(word)) return false

  const previousWord = queryWords.slice(0, queryIndex).reverse().find(token => !/^\d+$/.test(token))
  const nextWord = queryWords.slice(queryIndex + 1).find(token => !/^\d+$/.test(token))
  const resultTokens = allTitleTokens(resultTitle)

  for (let i = 0; i < resultTokens.length; i += 1) {
    if (resultTokens[i] !== word) continue
    if (previousWord && resultTokens[i - 1] === previousWord) return true
    if (nextWord && resultTokens[i + 1] === nextWord) return true
  }

  return false
}

function titleRelevant(resultTitle, queryTitle, options = {}) {
  const clean = titleWords
  const queryWords = clean(queryTitle)
  if (queryWords.length === 0) return true
  const resultLower = String(resultTitle || '').toLowerCase()
  const matchesWord = (word, index) => (/^\d+$/.test(word) ? matchesNumericTitleWord(resultTitle, queryWords, index) : resultLower.includes(word))
  const hits = queryWords.reduce((acc, word, index) => acc + (matchesWord(word, index) ? 1 : 0), 0)
  if (queryWords.every((word, index) => matchesWord(word, index))) return true

  // TV trackers often carry localized titles while preserving the exact
  // SxxEyy marker. Keep those results if at least two distinctive title words
  // still match, e.g. "Oak Island E Il Tesoro Maledetto S12E17" for
  // "The Curse of Oak Island".
  if (
    options?.type === 'series' &&
    options?.season &&
    options?.episode &&
    matchesEpisode(resultTitle, options.season, options.episode)
  ) {
    return hits >= Math.min(2, queryWords.length)
  }

  return false
}

function extractContentYear(value) {
  const match = String(value || '').match(/\b(?:19|20)\d{2}\b/)
  return match ? match[0] : ''
}

function hasMatchingImdbId(item = {}, requestedImdbId = '') {
  const requested = normalizeImdbId(requestedImdbId)
  const candidate = normalizeImdbId(item?.imdbId)
  return Boolean(requested && candidate && requested === candidate)
}

function hasMovieCompatibleCategory(item = {}) {
  const categoryIds = Array.isArray(item?.categoryIds) ? item.categoryIds.map(id => String(id || '').trim()).filter(Boolean) : []
  const categoryNames = Array.isArray(item?.categoryNames) ? item.categoryNames.map(name => String(name || '').trim()).filter(Boolean) : []
  if (categoryIds.length === 0 && categoryNames.length === 0) return true
  if (categoryIds.some(id => /^20\d{2}$/.test(id))) return true
  if (categoryNames.some(name => /\bmovies?\b/i.test(name))) return true
  return false
}

function isPlausibleMovieSource(item = {}) {
  const size = Number(item?.size || 0)
  if (!hasMovieCompatibleCategory(item)) return false
  if (NON_VIDEO_ASSET_TITLE_RE.test(String(item?.title || ''))) return false
  return !(MOVIE_MIN_SOURCE_BYTES > 0 && Number.isFinite(size) && size > 0 && size < MOVIE_MIN_SOURCE_BYTES)
}

function sourceRelevantForContent(item = {}, contentTitle = '', options = {}) {
  if (options?.type !== 'movie') {
    return contentTitle ? titleRelevant(item.title, contentTitle, options) : true
  }

  if (!isPlausibleMovieSource(item)) return false
  if (contentTitle) return titleRelevant(item.title, contentTitle, options)

  // Some Prowlarr indexers ignore imdbid and return arbitrary rows. Without
  // Cinemeta title truth, only trust rows that carry the requested imdb id.
  return hasMatchingImdbId(item, options.imdbId)
}

function buildTitleFallbackQueries(contentTitle, type, season = null, episode = null, contentYear = '') {
  const normalized = normalizeSearchQuery(contentTitle)
  const queries = []
  const seen = new Set()
  const add = (value) => {
    const query = normalizeSearchQuery(value)
    const key = query.toLowerCase()
    if (!query || seen.has(key)) return
    seen.add(key)
    queries.push(query)
  }

  const seasonNum = Number.parseInt(String(season || ''), 10)
  const episodeNum = Number.parseInt(String(episode || ''), 10)
  const episodeMarker = (
    type === 'series' &&
    Number.isFinite(seasonNum) &&
    Number.isFinite(episodeNum)
  )
    ? `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`
    : ''

  const year = extractContentYear(contentYear)
  if (type === 'movie' && year && !new RegExp(`\\b${year}\\b`).test(normalized)) {
    add(`${normalized} ${year}`)
  }
  if (episodeMarker) add(`${normalized} ${episodeMarker}`)
  add(normalized)
  if (type === 'series') {
    const words = titleWords(normalized)
    if (episodeMarker && words.length >= 2) add(`${words.slice(-2).join(' ')} ${episodeMarker}`)
    if (words.length >= 2) add(words.slice(-2).join(' '))
    if (episodeMarker && words.length >= 3) add(`${words.slice(0, 3).join(' ')} ${episodeMarker}`)
    if (words.length >= 3) add(words.slice(0, 3).join(' '))
  }

  return queries
}

function prioritizeMovieFallbackCategories(cats) {
  const preferred = ['2040', '2080', '2020', '2030', '2050', '2045', '2000']
  const input = String(cats || '')
    .split(',')
    .map(cat => cat.trim())
    .filter(Boolean)
  const seen = new Set()
  const ordered = []
  for (const cat of [...preferred, ...input]) {
    if (!input.includes(cat) || seen.has(cat)) continue
    seen.add(cat)
    ordered.push(cat)
  }
  return ordered.length > 0 ? ordered.join(',') : cats
}

async function searchTitleFallback(torznab, query, cats, options = {}) {
  const searchCats = options.type === 'movie'
    ? prioritizeMovieFallbackCategories(cats)
    : cats
  console.log(`[stream] Title fallback query="${query}" cats="${searchCats}" useCategories=true`)
  const categorized = await settleWithTimeout(
    torznab.search(query, searchCats, 'search', {
      excludeSportsIndexers: true,
      useCategories: Boolean(String(searchCats || '').trim()),
      timeoutMs: STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS,
      categoryGroupTimeoutMs: STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS,
      categorySearchConcurrency: options.type === 'movie' ? 2 : undefined
    }),
    STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS + 500,
    []
  )
  const categorizedItems = Array.isArray(categorized.value) ? categorized.value : []
  if (categorized.timedOut) {
    console.warn(`[stream] Title fallback category search timed out after ${STREAM_TITLE_CATEGORY_FALLBACK_TIMEOUT_MS}ms`)
  }
  if (categorized.error) {
    console.error('[stream] Title fallback error:', categorized.error?.message)
  }
  if (!categorized.error && !categorized.timedOut && categorizedItems.length > 0) return categorizedItems

  console.log(`[stream] Title fallback broad query="${query}" cats="all" useCategories=false`)
  const baseBroadTimeout = options.type === 'movie' ? MOVIE_TITLE_FALLBACK_TIMEOUT_MS : STREAM_TITLE_FALLBACK_TIMEOUT_MS
  const remainingMs = Number(options.remainingMs)
  const broadTimeout = Number.isFinite(remainingMs) && remainingMs > 0
    ? Math.max(1000, Math.min(baseBroadTimeout, remainingMs))
    : baseBroadTimeout
  const broad = await settleWithTimeout(
    torznab.search(query, cats, 'search', {
      excludeSportsIndexers: true,
      useCategories: false,
      timeoutMs: broadTimeout + 500
    }),
    broadTimeout,
    []
  )
  if (broad.timedOut) {
    console.warn(`[stream] Title fallback broad timed out after ${broadTimeout}ms`)
  }
  if (broad.error) {
    console.error('[stream] Title fallback broad error:', broad.error?.message)
  }
  return mergeUniqueSourceItems(categorizedItems, Array.isArray(broad.value) ? broad.value : [])
}

async function handleImdbStream(config, type, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const torznab = new ProwlarrClient(config.jackettUrl, config.jackettApiKey)
  const qbit = new QBitClient(config.qbitUrl, config.qbitUsername, config.qbitPassword)
  const streamSourceOptions = getStreamSourceOptions(configToken)
  const trackerPlaybackRestriction = getTrackerPlaybackRestriction(config, configToken)
  const trackerPlaybackEnabled = !trackerPlaybackRestriction
  const noticeCounts = createNoticeCounts()

  // Parse series ID: tt1234567:1:5 → { imdbId, season, episode }
  let imdbId = id, season = null, episode = null
  if (type === 'series') {
    const parts = id.split(':')
    imdbId = parts[0]
    season = parts[1] ? parseInt(parts[1], 10) : null
    episode = parts[2] ? parseInt(parts[2], 10) : null
  }

  const cats = type === 'series' ? TV_CATS : MOVIE_CATS
  const searchType = type === 'series' ? 'series' : 'movie'
  const hasEpisodeMarker = type === 'series' && Number.isFinite(season) && Number.isFinite(episode)

  console.log(`[stream] ${type} ${id} → imdbId=${imdbId} season=${season} ep=${episode}`)

  // Parallel: IMDB search + qBit completed torrents + Cinemeta title lookup
  // Cinemeta runs in parallel so it adds zero latency on the happy path.
  // We always need the title to filter out sports content that leaks from non-movie indexers.
  const cinemeta = new CinemetaClient()
  const initialProwlarrLookup = (hasEpisodeMarker || !imdbLookupWorthWaitingFor())
    ? Promise.resolve({ value: [], skippedTitleFirst: true })
    : settleWithTimeout(torznab.searchImdb(imdbId, cats, searchType, { excludeSportsIndexers: true }), STREAM_UPSTREAM_TIMEOUT_MS, [])
  const [jackettResult, qbitResult, cinemetaResult] = await Promise.all([
    initialProwlarrLookup,
    settleWithTimeout(qbit.torrents('all'), STREAM_UPSTREAM_TIMEOUT_MS, []),
    settleWithTimeout(
      type === 'series' ? cinemeta.getSeries(imdbId) : cinemeta.getMovie(imdbId),
      STREAM_UPSTREAM_TIMEOUT_MS,
      null
    )
  ])

  // Start the first title search the moment Cinemeta gives us a title, WITHOUT
  // waiting to see whether the IMDB lookup produced anything.
  //
  // Why: most of this deployment's indexers are private trackers, and they
  // advertise imdb search capability while ignoring the id (the filter below
  // exists precisely because they return their whole library instead). So the
  // IMDB lookup usually contributes nothing and the title search runs anyway —
  // but only AFTER the IMDB call has burned its full timeout.
  //
  // Measured on the live server before this change: a movie took 29s —
  // 10s IMDB timeout, then 7s categorised title search, then a 12s broad search
  // that also timed out. Running the title search alongside removes the first
  // wait entirely; the two now overlap instead of queueing.
  //
  // Nothing is discarded: if the IMDB lookup DOES return usable sources they
  // still win, and this speculative result is simply dropped.
  // Started further down, once we know the IMDB hit and the local qBit library
  // cannot already answer. Declared here so the fallback loop can reuse it.
  let speculativeTitleSearch = null
  let speculativeQuery = null

  let jackettItems = Array.isArray(jackettResult.value) ? jackettResult.value : []
  const qbitTorrents = Array.isArray(qbitResult.value) ? qbitResult.value : []
  const contentTitle = cinemetaResult.value?.name || null
  const contentYear =
    extractContentYear(cinemetaResult.value?.releaseInfo) ||
    extractContentYear(cinemetaResult.value?.year) ||
    extractContentYear(cinemetaResult.value?.released)

  console.log(`[stream] IMDB search returned ${jackettItems.length} results, qBit has ${qbitTorrents.length} torrents, title="${contentTitle}" year="${contentYear}"`)
  if (jackettResult.skippedTitleFirst) console.log('[stream] TV episode title-first lookup: skipping initial IMDB wait')
  if (jackettResult.timedOut) console.warn(`[stream] Prowlarr IMDB lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (qbitResult.timedOut) console.warn(`[stream] qBit torrent lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (cinemetaResult.timedOut) console.warn(`[stream] Cinemeta lookup timed out after ${STREAM_UPSTREAM_TIMEOUT_MS}ms`)
  if (jackettResult.error) console.error('[stream] Prowlarr IMDB error:', jackettResult.error?.message)
  if (qbitResult.error) console.error('[stream] qBit error:', qbitResult.error?.message)
  if (cinemetaResult.error) console.error('[stream] Cinemeta error:', cinemetaResult.error?.message)

  // Apply sports exclusion + title filter to IMDB results immediately.
  // Private trackers often declare type=movie capability but ignore the imdbId, returning their
  // full library. The filter strips those out. We then check if anything useful survived before
  // deciding whether to fall back to a title search.
  function applyFilters(items) {
    items = items.filter(item => !isSportsOnlyIndexer(item.indexer))
    const beforePacked = items.length
    items = items.filter(item => !isLikelyPackedReleaseTitle(item.title))
    if (items.length < beforePacked) {
      console.log(`[stream] Packed-release filter removed ${beforePacked - items.length} source(s)`)
    }
    const beforeLegacy = items.length
    items = items.filter(item => !titleLooksLegacyAvi(item.title))
    if (items.length < beforeLegacy) {
      noticeCounts.legacyAviSuppressed += beforeLegacy - items.length
      console.log(`[stream] Legacy AVI/XviD filter removed ${beforeLegacy - items.length} source(s)`)
    }
    if (contentTitle || type === 'movie') {
      const before = items.length
      items = items.filter(item => sourceRelevantForContent(item, contentTitle, { type, season, episode, imdbId }))
      if (items.length < before) {
        console.log(`[stream] Title/movie filter removed ${before - items.length} irrelevant results (${items.length} kept)`)
      }
    }
    return items
  }

  jackettItems = applyFilters(jackettItems)

  // Only judge the IMDB lookup when we actually waited on it. A skipped lookup
  // is not evidence either way, and scoring it would keep the streak pinned
  // high and stop it ever being retried.
  if (!jackettResult.skippedTitleFirst) {
    recordImdbLookupOutcome(jackettItems.length)
  }

  // Build hash lookup from qBit early so completed/in-progress local torrents can
  // still surface when Prowlarr is slow, empty, or rejects categorized TV search.
  const qbitMap = new Map()
  for (const t of qbitTorrents) {
    qbitMap.set(String(t.hash || '').toLowerCase(), t)
  }

  const qbitTitleFallbackItems = contentTitle && qbitTorrents.length > 0
    ? buildQbitTitleFallbackItems(qbitTorrents, contentTitle, { type, season, episode })
    : []

  if (jackettItems.length === 0 && qbitTitleFallbackItems.length > 0) {
    console.log('[stream] using qBit title fallback before slow title search')
    jackettItems = qbitTitleFallbackItems
  }

  // Start the first title search NOW, before the fallback loop, so it overlaps
  // whatever else remains rather than queueing behind it.
  //
  // Why this is here and not earlier: it must only fire when nothing else has
  // already answered. The IMDB hit and the local qBit library are both known by
  // this point, and if either produced sources we must not spend a Prowlarr
  // search at all — smoke:pipeline asserts exactly that ("qBit exact-title
  // fallback should not wait for title fallback search").
  //
  // Measured before this change: a movie took 29s — a 10s IMDB timeout, then a
  // 7s categorised title search, then a 12s broad search that also timed out.
  // Most indexers here are private trackers which advertise imdb search and
  // then ignore the id (the filter above exists for exactly that), so the IMDB
  // wait almost always buys nothing and the title search runs regardless.
  if (jackettItems.length === 0 && contentTitle) {
    const speculativeQueries = buildTitleFallbackQueries(contentTitle, type, season, episode, contentYear)
    if (speculativeQueries.length > 0) {
      speculativeQuery = speculativeQueries[0]
      speculativeTitleSearch = searchTitleFallback(torznab, speculativeQuery, cats, {
        type,
        remainingMs: STREAM_TITLE_FALLBACK_BUDGET_MS
      }).catch(err => {
        console.error('[stream] title search error:', err?.message)
        return []
      })
    }
  }

  // Fallback: title search if IMDB search returned nothing useful after filtering.
  // Use generic type=search — private trackers (HD-Torrents, SpeedCD) only support type=search.
  if (jackettItems.length === 0 && contentTitle) {
    const fallbackQueries = buildTitleFallbackQueries(contentTitle, type, season, episode, contentYear)
    // Shared wall-clock deadline for the whole fallback chain: each searchTitleFallback
    // can run two sequential Prowlarr searches, so without a budget a few queries could
    // stack into tens of seconds. Pass remaining time down so the broad search uses
    // min(its timeout, remaining), and stop iterating once the budget is spent.
    const fallbackDeadlineMs = Date.now() + STREAM_TITLE_FALLBACK_BUDGET_MS
    for (const fallbackQuery of fallbackQueries) {
      const remainingMs = fallbackDeadlineMs - Date.now()
      if (remainingMs <= 0) {
        console.warn('[stream] Title fallback budget exhausted; stopping further fallback queries')
        break
      }
      // The first query was already started alongside the IMDB lookup, so by now
      // it is usually finished or nearly so. Reuse it instead of running it again.
      const reuseSpeculative = speculativeTitleSearch && fallbackQuery === speculativeQuery
      if (reuseSpeculative) {
        console.log(`[stream] Title search (already running in parallel): "${fallbackQuery}"`)
      } else {
        console.log(`[stream] Falling back to title search: "${fallbackQuery}"`)
      }
      const fallbackItems = reuseSpeculative
        ? await speculativeTitleSearch
        : await searchTitleFallback(torznab, fallbackQuery, cats, { type, remainingMs })
      if (reuseSpeculative) speculativeTitleSearch = null
      jackettItems = applyFilters(fallbackItems)
      console.log(`[stream] Title search returned ${jackettItems.length} results after filtering`)
      if (jackettItems.length > 0) break
    }
  }

  if (jackettItems.length === 0 && hasEpisodeMarker && !jackettResult.error && !jackettResult.timedOut) {
    console.log(`[stream] TV episode title-first found no sources; trying short IMDB fallback (${STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS}ms)`)
    const imdbFallback = await settleWithTimeout(
      torznab.searchImdb(imdbId, cats, searchType, {
        timeoutMs: STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS + 500
      }),
      STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS,
      []
    )
    if (imdbFallback.timedOut) console.warn(`[stream] TV episode IMDB fallback timed out after ${STREAM_EPISODE_IMDB_FALLBACK_TIMEOUT_MS}ms`)
    if (imdbFallback.error) console.error('[stream] TV episode IMDB fallback error:', imdbFallback.error?.message)
    jackettItems = applyFilters(Array.isArray(imdbFallback.value) ? imdbFallback.value : [])
    console.log(`[stream] TV episode IMDB fallback returned ${jackettItems.length} results after filtering`)
  }

  // Filter by episode if series
  let filtered = (season && episode)
    ? jackettItems.filter(item => matchesEpisode(item.title, season, episode))
    : jackettItems

  if (filtered.length === 0 && qbitTitleFallbackItems.length > 0) {
    filtered = qbitTitleFallbackItems
  }

  filtered = preferSeededResults(filtered, 'imdb candidates', (item) => {
    const hash = String(item?.infohash || '').toLowerCase()
    if (!hash) return false
    return qbitMap.has(hash)
  })

  if (filtered.length > STREAM_MAX_CANDIDATES) {
    console.log(`[stream] Candidate cap applied: ${STREAM_MAX_CANDIDATES}/${filtered.length}`)
  }

  const streams = []
  // Whatever has been worked out by the deadline, in the order it finished.
  // Inspecting candidates has no natural ceiling: 12 links, 4 at a time, each
  // allowed 15s, is 45s in the worst case, and Stremio users stare at "1 addon
  // still loading" for every second of it. Measured cold on the live server
  // 2026-08-11 (Interstellar): 7.2s IMDB search + 6.2s title search + 22.5s
  // inspecting candidates = 36s total, with inspection the largest slice by
  // far.
  //
  // A slow tracker must not be able to hold up the results that are already
  // good. Anything still outstanding when the budget runs out is dropped, and
  // its search result stays cached, so the next look at that title picks it up
  // for free (a repeat search returns in under 200ms).
  const readyStreams = []
  const candidatePromise = mapWithConcurrency(filtered.slice(0, STREAM_MAX_CANDIDATES), STREAM_CANDIDATE_CONCURRENCY, async (item) => {
    // Private trackers don't return infohashes — allow items through if they have a download link
    if (!item.infohash && !item.link) return null
    const parsed = parse(item.title)
    const matched = item.infohash ? qbitMap.get(item.infohash) : null

    if (matched) {
      // On seedbox or buffering — get files for URL and videoSize
      try {
        const files = await qbit.files(matched.hash)
        const videoFile = (season && episode)
          ? findEpisodeFile(files, season, episode)
          : findVideoFile(files)
        if (!videoFile?.name) {
          if (hasLegacyAviVideoFiles(files)) {
            noticeCounts.legacyAviSuppressed += 1
            return null
          }
          const archiveResult = await buildMatchedArchiveCompatibleStream(config, configToken, playbackBaseUrl, matched, files, item, parsed, streamSourceOptions)
          if (archiveResult.stream) {
            return archiveResult.stream
          } else if (findPackedArchiveFiles(files).length > 0) {
            recordPackedArchiveOutcome(noticeCounts, archiveResult)
          }
          return null
        }
        const videoProgress = Number(videoFile?.progress || 0)
        const requireCurrentPathProof = !isCompletedTorrent(matched, videoProgress)
        const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, videoFile.name, {
          multipleFiles: files.length > 1,
          requireCurrentPathProof
        })
        if (!fileUrl) {
          if (requireCurrentPathProof && config?.fileServerUrl) {
            noticeCounts.bufferingPathUnproven += 1
          }
          return null
        }
        if (isCompletedTorrent(matched, videoProgress)) {
          return buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, config, parsed, streamSourceOptions)
        } else {
          const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
          const bufferingUrl = buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, matched.hash, videoFile.name)
          const bufferingItem = {
            ...item,
            downloadSpeed: matched.dlspeed,
            eta: matched.eta
          }
          return buildOnBufferingStream(bufferingItem, bufferingUrl, videoFile.name, videoFile.size, config, parsed, percent, {
            ...streamSourceOptions,
            downloadSpeed: matched.dlspeed,
            eta: matched.eta
          })
        }
      } catch (e) {
        // File listing failed, skip this stream
        return null
      }
    } else if (item.link) {
      const { stream } = await emitTrackerCandidateStream(item, {
        playbackBaseUrl,
        configToken,
        config,
        streamSourceOptions,
        noticeCounts,
        trackerPlaybackEnabled,
        trackerPlaybackRestriction,
        timeoutMs: MOVIE_TV_TRACKER_LINK_INSPECTION_TIMEOUT_MS,
        allowNative: true,
        parsed
      })
      return stream
    }
    return null
  }, (stream) => {
    if (stream) readyStreams.push(stream)
  })

  const inspectionFinished = await Promise.race([
    candidatePromise.then((list) => list),
    wait(STREAM_CANDIDATE_INSPECTION_BUDGET_MS).then(() => null)
  ])

  if (inspectionFinished) {
    for (const stream of inspectionFinished) {
      if (stream) streams.push(stream)
    }
  } else {
    // Budget spent. Ship what finished rather than making the viewer wait for
    // the stragglers; the cached search makes the next look near-instant.
    console.warn(
      `[stream] candidate inspection budget hit after ${STREAM_CANDIDATE_INSPECTION_BUDGET_MS}ms; ` +
      `returning the ${readyStreams.length} source(s) that finished`
    )
    for (const stream of readyStreams) streams.push(stream)
  }

  appendNoticeStreams(streams, noticeCounts, addonUrl)
  const sortedStreams = sortStreams(streams)
  return { streams: sortedStreams, cacheMaxAge: resolveStreamCacheMaxAge(sortedStreams) }
}

async function handleDecodedCustomStream(config, info, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const effectiveConfig = config && typeof config === 'object' ? config : {}
  const resolvedInfo = info && typeof info === 'object' ? { ...info } : {}
  const availabilityAnchorKey = String(resolvedInfo.ak || '').trim()
  const anchoredAvailability = availabilityAnchorKey
    ? getSportsAvailabilityAnchor(availabilityAnchorKey)
    : null

  if (anchoredAvailability) {
    resolvedInfo.t = String(anchoredAvailability.title || resolvedInfo.t || '').trim()
    if (!resolvedInfo.h && anchoredAvailability.infohash) resolvedInfo.h = anchoredAvailability.infohash
    if (!resolvedInfo.l && anchoredAvailability.link) resolvedInfo.l = anchoredAvailability.link
    if (!resolvedInfo.i && anchoredAvailability.indexer) resolvedInfo.i = anchoredAvailability.indexer
    if (!resolvedInfo.s && Number(anchoredAvailability.size) > 0) resolvedInfo.s = anchoredAvailability.size
    if (!resolvedInfo.d && Number(anchoredAvailability.seeders) > 0) resolvedInfo.d = anchoredAvailability.seeders
    if (!resolvedInfo.p && anchoredAvailability.pubDate) resolvedInfo.p = anchoredAvailability.pubDate
  } else if (availabilityAnchorKey) {
    console.warn(`[stream] sports availability anchor miss key=${availabilityAnchorKey}`)
  }

  let infoHash = String(resolvedInfo.h || '').toLowerCase()
  const hasInitialExplicitInfoHash = Boolean(infoHash)
  const directLink = String(resolvedInfo.l || '')
  const seenSourceKeys = new Set()
  if (infoHash) seenSourceKeys.add(infoHash)
  if (directLink) seenSourceKeys.add(directLink.toLowerCase())

  const torznab = effectiveConfig.jackettUrl && effectiveConfig.jackettApiKey
    ? new ProwlarrClient(effectiveConfig.jackettUrl, effectiveConfig.jackettApiKey)
    : null
  const qbit = effectiveConfig.qbitUrl
    ? new QBitClient(effectiveConfig.qbitUrl, effectiveConfig.qbitUsername, effectiveConfig.qbitPassword)
    : null
  const streamSourceOptions = getStreamSourceOptions(configToken)
  const trackerPlaybackRestriction = getTrackerPlaybackRestriction(effectiveConfig, configToken)
  const trackerPlaybackEnabled = !trackerPlaybackRestriction
  const allowSupplementalSportsResults = isSportsStreamInfo(resolvedInfo)
  const noticeCounts = createNoticeCounts()
  let torrents = []
  if (qbit) {
    try {
      torrents = await qbit.torrents('all')
    } catch (error) {
      console.warn(`[stream] qBit torrent list failed: ${error.message}`)
    }
  }
  const likelyPackedDirectRelease = isLikelyPackedReleaseTitle(resolvedInfo.t)
  const likelyLegacyAviDirectRelease = titleLooksLegacyAvi(resolvedInfo.t)
  let directInspection = null
  let matched = infoHash ? torrents.find(t => t.hash.toLowerCase() === infoHash) : null
  const shouldInspectDirectTracker = directLink &&
    !likelyPackedDirectRelease &&
    !likelyLegacyAviDirectRelease &&
    (allowSupplementalSportsResults || !infoHash)
  if (!matched && shouldInspectDirectTracker) {
    directInspection = await inspectTrackerLink(directLink)
    if (directInspection.infoHash) {
      infoHash = String(directInspection.infoHash || '').toLowerCase()
      seenSourceKeys.add(infoHash)
      matched = torrents.find(t => t.hash.toLowerCase() === infoHash) || null
    }
  }
  const hasExplicitTrackerSource = Boolean(infoHash || directLink)
  if (!matched && !hasExplicitTrackerSource) matched = findTorrentByTitle(torrents, resolvedInfo.t)
  // Private trackers can bake a per-download tag into the .torrent, giving the file a
  // different infohash than the one Prowlarr reports — so hash matching misses a file the
  // user has already fully downloaded, and it shows as "DL" instead of "✅ READY". Fall back
  // to a STRICT title match (exact/substring of the full, quality-specific release title;
  // no fuzzy scoring) so completed content is recognized even when the hashes differ.
  if (!matched && resolvedInfo.t) {
    const matchTarget = normalizeForMatch(resolvedInfo.t)
    if (matchTarget) {
      matched = torrents.find(t => {
        const name = normalizeForMatch(t.name)
        return name && (name === matchTarget || name.includes(matchTarget) || matchTarget.includes(name))
      }) || null
      if (matched) {
        console.log(`[stream] matched already-downloaded torrent by title (infohash differed) hash=${String(matched.hash).slice(0, 8)}`)
      }
    }
  }
  if (matched?.hash) seenSourceKeys.add(String(matched.hash).toLowerCase())

  const parsed = parse(resolvedInfo.t)
  const streams = []
  let packedArchivePending = false

  console.log(`[stream] custom title="${resolvedInfo.t}" hash=${infoHash || 'none'} matched=${matched ? matched.hash : 'none'} anchored=${Boolean(availabilityAnchorKey)}`)

  if (matched) {
    try {
      const files = await qbit.files(matched.hash)
      const videoFile = findVideoFile(files)
      if (!videoFile?.name) {
        if (hasLegacyAviVideoFiles(files)) {
          noticeCounts.legacyAviSuppressed += 1
        } else {
          const archiveResult = await buildMatchedArchiveCompatibleStream(
            effectiveConfig,
            configToken,
            playbackBaseUrl,
            matched,
            files,
            { title: resolvedInfo.t, size: resolvedInfo.s, seeders: resolvedInfo.d, indexer: resolvedInfo.i || '' },
            parsed,
            streamSourceOptions
          )
          if (archiveResult.stream) {
            streams.push(archiveResult.stream)
          } else if (findPackedArchiveFiles(files).length > 0) {
            packedArchivePending = true
            recordPackedArchiveOutcome(noticeCounts, archiveResult)
          } else {
            throw new Error('No playable video in matched torrent')
          }
        }
      } else {
        const videoProgress = Number(videoFile?.progress || 0)
        const requireCurrentPathProof = !isCompletedTorrent(matched, videoProgress)
        const fileUrl = buildFileUrl(config, configToken, playbackBaseUrl, matched.hash, matched, videoFile.name, {
          multipleFiles: files.length > 1,
          requireCurrentPathProof
        })
        if (!fileUrl) {
          if (requireCurrentPathProof && effectiveConfig?.fileServerUrl) {
            noticeCounts.bufferingPathUnproven += 1
          }
          throw new Error('Hosted mode requires a provable playback path for on-seedbox streams')
        }
        const item = { title: resolvedInfo.t, size: resolvedInfo.s, seeders: resolvedInfo.d }
        if (isCompletedTorrent(matched, videoProgress)) {
          streams.push(buildOnSeedboxStream(item, fileUrl, videoFile.name, videoFile.size, effectiveConfig, parsed, streamSourceOptions))
        } else {
          const percent = Math.max(0, Math.min(99, Math.floor(videoProgress * 100)))
          const bufferingUrl = buildBufferingStreamUrl(playbackBaseUrl, configToken, fileUrl, matched.hash, videoFile.name)
          const bufferingItem = {
            ...item,
            downloadSpeed: matched.dlspeed,
            eta: matched.eta
          }
          streams.push(buildOnBufferingStream(bufferingItem, bufferingUrl, videoFile.name, videoFile.size, effectiveConfig, parsed, percent, {
            ...streamSourceOptions,
            downloadSpeed: matched.dlspeed,
            eta: matched.eta
          }))
        }
      }
    } catch (e) {
      console.error('[stream] custom file listing failed:', e.message)
    }
  }

  if (streams.length === 0) {
    const orphanedFileStream = await buildOrphanedCustomFileStream(effectiveConfig, configToken, playbackBaseUrl, resolvedInfo, parsed)
    if (orphanedFileStream) {
      streams.push(orphanedFileStream)
    }
  }

  if (streams.length === 0 && directLink && !packedArchivePending) {
    const inspection = directInspection || (likelyLegacyAviDirectRelease
      ? { legacyAviOnly: true, inspected: true }
      : likelyPackedDirectRelease
      ? { packedOnly: true, inspected: false }
      : directLink
        ? await inspectTrackerLink(directLink)
        : infoHash
          ? { packedOnly: false, inspected: true, infoHash, selectedVideoFileIdx: 0, selectedVideoFileName: resolvedInfo.t || '' }
          : await inspectTrackerLink(directLink))

    if (inspection.inspected && !inspection.infoHash && infoHash) {
      inspection.infoHash = infoHash
    }

    if (inspection.packedOnly) {
      noticeCounts.packedArchiveLiveUnsupported += 1
    } else if (inspection.legacyAviOnly) {
      noticeCounts.legacyAviSuppressed += 1
    } else if (!inspection.inspected) {
      noticeCounts.trackerLinkUnverified += 1
    } else if (allowSupplementalSportsResults && !sportsSourceHasPeersAndFiles({ size: resolvedInfo.s, seeders: resolvedInfo.d })) {
      // Suppress sports queue-and-buffer rows that have no peers or no source size.
    } else if (allowSupplementalSportsResults && directLink && !trackerInspectionHasPlayableVideo(inspection)) {
      // Suppress sports torrents whose payload has no playable video file.
    } else {
      const nativeStream = buildNativeTorrentFromInspection(
        { title: resolvedInfo.t, size: resolvedInfo.s, seeders: resolvedInfo.d, indexer: resolvedInfo.i || '' },
        inspection,
        parsed,
        streamSourceOptions,
        effectiveConfig
      )
      if (nativeStream) {
        streams.push(nativeStream)
      } else if (trackerPlaybackEnabled) {
        try {
          const playbackUrl = buildPlaybackRouteUrl(playbackBaseUrl, configToken, {
            h: infoHash || String(inspection.infoHash || '').toLowerCase(),
            l: directLink
          })
          if (playbackUrl) {
            streams.push(buildOnTrackerStream(
              { title: resolvedInfo.t, size: resolvedInfo.s, seeders: resolvedInfo.d, indexer: resolvedInfo.i || '' },
              playbackUrl,
              parsed,
              streamSourceOptions
            ))
          }
        } catch (_) {
          // Skip invalid playback payloads instead of leaking raw tracker URLs.
        }
      } else {
        recordTrackerRestrictionNotice(noticeCounts, trackerPlaybackRestriction)
      }
    }
  }

  const skipSupplementalSportsResults = streams.length > 0 &&
    Boolean(availabilityAnchorKey) &&
    hasInitialExplicitInfoHash

  if (allowSupplementalSportsResults && !skipSupplementalSportsResults) {
    try {
      const supplementalDeadlineMs = Date.now() + STREAM_SPORTS_SUPPLEMENTAL_BUDGET_MS
      const supplementalStreams = await buildSupplementalSportsStreams({
        info: resolvedInfo,
        torznab,
        playbackBaseUrl,
        configToken,
        config: effectiveConfig,
        streamSourceOptions,
        seenKeys: seenSourceKeys,
        noticeCounts,
        trackerPlaybackEnabled,
        trackerPlaybackRestriction,
        existingStreamCount: streams.length,
        deadlineMs: supplementalDeadlineMs
      })
      if (supplementalStreams.length > 0) {
        streams.push(...supplementalStreams)
      }
    } catch (e) {
      console.error('[stream] supplemental sports search failed:', e.message)
    }
  }

  if (streams.length === 0 && torznab && !allowSupplementalSportsResults) {
    const targetTitles = buildCustomSearchQueries(resolvedInfo)
    const primaryTargetTitle = normalizeSearchQuery(resolvedInfo.t || resolvedInfo.n || '')
    const seen = new Set()

    for (const query of targetTitles) {
      let results = []
      try {
        console.log(`[stream] Custom re-search query="${query}" cats="${SPORT_CATS}" useCategories=true`)
        results = await torznab.search(query, SPORT_CATS, 'search', { useCategories: true })
      } catch (error) {
        console.error(`[stream] custom re-search failed for "${query}":`, error.message)
        continue
      }

      const filtered = results.filter(r => {
        if (!r?.link) return false
        if (isAdultContentResult(r)) return false
        if (!allowSupplementalSportsResults && !isSportsCultIndexer(r.indexer)) return false
        if (infoHash && String(r.infohash || '').toLowerCase() === infoHash) return true
        if (isLikelyPackedReleaseTitle(r.title)) return false
        if (titleLooksLegacyAvi(r.title)) return false
        return (
          similarTitle(r.title, primaryTargetTitle) ||
          similarTitle(r.title, query)
        )
      })

      const deduped = []
      for (const item of filtered.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))) {
        const key = String(item.infohash || item.link || '').toLowerCase()
        if (!key || seen.has(key) || seenSourceKeys.has(key)) continue
        seen.add(key)
        seenSourceKeys.add(key)
        deduped.push(item)
        if (deduped.length >= STREAM_MAX_CANDIDATES) break
      }
      const ordered = preferSeededResults(deduped, `custom re-search (${query})`)

      for (const item of ordered) {
        const { stream, stop } = await emitTrackerCandidateStream(item, {
          playbackBaseUrl,
          configToken,
          config: effectiveConfig,
          streamSourceOptions,
          noticeCounts,
          trackerPlaybackEnabled,
          trackerPlaybackRestriction,
          parsed: parse(item.title || primaryTargetTitle || query)
        })
        if (stop) break
        if (stream) streams.push(stream)
        if (streams.length >= STREAM_MAX_CANDIDATES) break
      }

      if (streams.length >= STREAM_MAX_CANDIDATES) break
    }
  }

  appendNoticeStreams(streams, noticeCounts, addonUrl)
  const sortedStreams = sortStreams(streams)
  return {
    streams: sortedStreams,
    cacheMaxAge: resolveStreamCacheMaxAge(sortedStreams, { sports: allowSupplementalSportsResults })
  }
}

async function handleCustomStream(config, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const info = decodeCustomId(id)
  return handleDecodedCustomStream(config, info, addonUrl, configToken, playbackBaseUrl)
}

async function handleSportsMetaStream(config, id, addonUrl, configToken, playbackBaseUrl = addonUrl) {
  const info = await loadSportsMetaInfo(config, id)
  if (!info) return { streams: [] }
  const anchoredAvailability = getSportsAvailabilityAnchorByCanonical(id)
  const resolvedInfo = {
    ...info,
    x: String(info?.x || id || '').trim(),
    q: 'resolved'
  }
  if (anchoredAvailability?.anchorKey) {
    resolvedInfo.ak = anchoredAvailability.anchorKey
  }
  return handleDecodedCustomStream(config, resolvedInfo, addonUrl, configToken, playbackBaseUrl)
}

module.exports = { handleStream }
