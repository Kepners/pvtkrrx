const { getCacheSearchSource } = require('../clients/cacheSearch/base');

const MEMO_TTL_MS = 60 * 1000;
const memo = new Map();

function stableQuery(query = {}) {
  return {
    title: query.title || undefined,
    infohash: query.infohash || undefined,
    year: query.year || undefined,
    type: query.type || undefined
  };
}

function memoKey(sourceId, query) {
  return JSON.stringify({ sourceId, query: stableQuery(query) });
}

function getMemo(sourceId, query) {
  const key = memoKey(sourceId, query);
  const entry = memo.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memo.delete(key);
    return null;
  }
  return entry.value;
}

function setMemo(sourceId, query, value) {
  memo.set(memoKey(sourceId, query), {
    expiresAt: Date.now() + MEMO_TTL_MS,
    value
  });
}

function resolveSource(config) {
  if (config?.source && typeof config.source.searchByTitle === 'function') return config.source;
  return getCacheSearchSource(config.type, config.apiKey);
}

function dedupeHits(hits) {
  const seen = new Set();
  const result = [];
  for (const hit of hits) {
    const sourceId = String(hit?.sourceId || '');
    const keyValue = hit?.fileId || hit?.infohash || `${hit?.name || ''}:${hit?.sizeBytes || 0}`;
    const key = `${sourceId}:${keyValue}`;
    if (!sourceId || !keyValue || seen.has(key)) continue;
    seen.add(key);
    result.push(hit);
  }
  return result;
}

/**
 * @param {Array<{type: string, apiKey: string, enabled: boolean, source?: object}>} configuredSources
 * @param {{ title?: string, infohash?: string, year?: number, type?: 'movie'|'series' }} query
 * @returns {Promise<Array>}
 */
async function searchAllSources(configuredSources, query) {
  const enabled = (Array.isArray(configuredSources) ? configuredSources : [])
    .filter(source => source?.enabled === true);

  const tasks = enabled.map(async (config) => {
    const source = resolveSource(config);
    const sourceId = String(source.id || config.type || '');
    const cached = getMemo(sourceId, query);
    if (cached) return cached;

    let hits = [];
    if (query?.infohash) {
      const hit = await source.searchByHash(query.infohash);
      hits = hit ? [hit] : [];
    } else if (query?.title) {
      hits = await source.searchByTitle(query.title, {
        year: query.year,
        type: query.type
      });
    }

    setMemo(sourceId, query, hits);
    return hits;
  });

  const settled = await Promise.allSettled(tasks);
  const merged = [];
  for (let index = 0; index < settled.length; index += 1) {
    const outcome = settled[index];
    if (outcome.status === 'fulfilled') {
      merged.push(...(Array.isArray(outcome.value) ? outcome.value : []));
      continue;
    }

    const sourceId = enabled[index]?.source?.id || enabled[index]?.type || 'unknown';
    console.warn(`[cacheSearch:${sourceId}] search failed: ${outcome.reason?.message || outcome.reason}`);
  }

  return dedupeHits(merged);
}

function _clearDebridCacheMemo() {
  memo.clear();
}

module.exports = {
  searchAllSources,
  _clearDebridCacheMemo
};
