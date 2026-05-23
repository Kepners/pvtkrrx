const assert = require('node:assert/strict');
const { createMockDebridProvider } = require('../src/clients/debrid/__mock__');
const { UnsupportedCapabilityError } = require('../src/clients/debrid/base');
const { createMockCacheSearchSource } = require('../src/clients/cacheSearch/__mock__');
const {
  _clearDebridCacheMemo,
  searchAllSources
} = require('../src/utils/debridCache');

let checks = 0;
const capturedOutput = [];
const originalLog = console.log;
const originalWarn = console.warn;

function recordOutput(args) {
  capturedOutput.push(args.map(arg => String(arg)).join(' '));
}

console.log = (...args) => {
  recordOutput(args);
  originalLog(...args);
};
console.warn = (...args) => {
  recordOutput(args);
  originalWarn(...args);
};

async function check(label, fn) {
  await fn();
  checks += 1;
}

async function run() {
  await check('RD addMagnet flow returns addedId and sanitizes dn', async () => {
    const rd = createMockDebridProvider({ id: 'rd' });
    const result = await rd.addMagnet('magnet:?xt=urn:btih:abc&dn=Movie%20WEB-DL%202026');
    assert.match(result.addedId, /^rd-/);
    assert.doesNotMatch(decodeURIComponent(rd.calls[0].magnet), /WEB-DL/i);
  });

  await check('AD addMagnet flow returns addedId', async () => {
    const ad = createMockDebridProvider({ id: 'ad' });
    const result = await ad.addMagnet('magnet:?xt=urn:btih:def&dn=Movie%202026');
    assert.match(result.addedId, /^ad-/);
  });

  await check('PM addMagnet flow returns addedId', async () => {
    const pm = createMockDebridProvider({ id: 'pm' });
    const result = await pm.addMagnet('magnet:?xt=urn:btih:ghi&dn=Movie%202026');
    assert.match(result.addedId, /^pm-/);
  });

  await check('PM addNzb flow returns addedId', async () => {
    const pm = createMockDebridProvider({ id: 'pm' });
    const result = await pm.addNzb('https://indexer.example/download/movie.nzb');
    assert.match(result.addedId, /^pm-nzb-/);
  });

  await check('RD addNzb throws UnsupportedCapabilityError', async () => {
    const rd = createMockDebridProvider({ id: 'rd' });
    await assert.rejects(() => rd.addNzb('https://example.test/file.nzb'), UnsupportedCapabilityError);
  });

  await check('AD addNzb throws UnsupportedCapabilityError', async () => {
    const ad = createMockDebridProvider({ id: 'ad' });
    await assert.rejects(() => ad.addNzb('https://example.test/file.nzb'), UnsupportedCapabilityError);
  });

  await check('pollStatus transitions queued to downloading to ready', async () => {
    const rd = createMockDebridProvider({ id: 'rd', pollSequence: ['queued', 'downloading', 'ready'] });
    const { addedId } = await rd.addMagnet('magnet:?xt=urn:btih:abc&dn=Movie');
    assert.equal((await rd.pollStatus(addedId)).state, 'queued');
    assert.equal((await rd.pollStatus(addedId)).state, 'downloading');
    assert.equal((await rd.pollStatus(addedId)).state, 'ready');
  });

  await check('getStreamUrl returns mock URL', async () => {
    const pm = createMockDebridProvider({ id: 'pm', streamUrls: { '0': 'http://mock/stream.mkv' } });
    const { addedId } = await pm.addMagnet('magnet:?xt=urn:btih:abc&dn=Movie');
    assert.equal(await pm.getStreamUrl(addedId, 0), 'http://mock/stream.mkv');
  });

  await check('put.io title search returns hits', async () => {
    const putio = createMockCacheSearchSource({
      id: 'putio',
      titleHits: {
        'remarkably bright creatures': [{ name: 'Remarkably Bright Creatures 2026.mkv', sizeBytes: 123, fileId: '42' }]
      }
    });
    const hits = await putio.searchByTitle('remarkably bright creatures');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].fileId, '42');
  });

  await check('put.io hash search returns null', async () => {
    const putio = createMockCacheSearchSource({ id: 'putio' });
    assert.equal(await putio.searchByHash('abc123'), null);
  });

  await check('PM hash search returns cached hit', async () => {
    const pm = createMockCacheSearchSource({
      id: 'pm',
      hashHits: {
        abc123: { name: 'Cached Movie.mkv', sizeBytes: 456, infohash: 'abc123' }
      }
    });
    const hit = await pm.searchByHash('abc123');
    assert.equal(hit.sourceId, 'pm');
    assert.equal(hit.infohash, 'abc123');
  });

  await check('PM title search returns empty array when unsupported', async () => {
    const pm = createMockCacheSearchSource({ id: 'pm' });
    assert.deepEqual(await pm.searchByTitle('Movie'), []);
  });

  await check('searchAllSources fans out in parallel and merges results', async () => {
    _clearDebridCacheMemo();
    const putio = createMockCacheSearchSource({
      id: 'putio',
      titleHits: { movie: [{ name: 'Movie put.io.mkv', sizeBytes: 1, fileId: 'p1' }] }
    });
    const pm = createMockCacheSearchSource({
      id: 'pm',
      titleHits: { movie: [{ name: 'Movie PM.mkv', sizeBytes: 2, infohash: 'hash1' }] }
    });
    const hits = await searchAllSources([
      { type: 'putio', apiKey: 'putio-secret', enabled: true, source: putio },
      { type: 'pm', apiKey: 'pm-secret', enabled: true, source: pm }
    ], { title: 'movie', type: 'movie' });
    assert.deepEqual(hits.map(hit => hit.sourceId), ['putio', 'pm']);
  });

  await check('searchAllSources memo avoids second mock hit', async () => {
    _clearDebridCacheMemo();
    const putio = createMockCacheSearchSource({
      id: 'putio',
      titleHits: { memo: [{ name: 'Memo.mkv', sizeBytes: 1, fileId: 'm1' }] }
    });
    const config = [{ type: 'putio', apiKey: 'secret', enabled: true, source: putio }];
    assert.equal((await searchAllSources(config, { title: 'memo' })).length, 1);
    assert.equal((await searchAllSources(config, { title: 'memo' })).length, 1);
    assert.equal(putio.callCounts.searchByTitle, 1);
  });

  await check('disabled source is skipped', async () => {
    _clearDebridCacheMemo();
    const putio = createMockCacheSearchSource({
      id: 'putio',
      titleHits: { skip: [{ name: 'Skip.mkv', sizeBytes: 1, fileId: 's1' }] }
    });
    const hits = await searchAllSources([{ type: 'putio', apiKey: 'secret', enabled: false, source: putio }], { title: 'skip' });
    assert.equal(hits.length, 0);
    assert.equal(putio.callCounts.searchByTitle || 0, 0);
  });

  await check('one source error does not break the other', async () => {
    _clearDebridCacheMemo();
    const broken = createMockCacheSearchSource({ id: 'putio', failOn: { searchByTitle: 'broken' } });
    const pm = createMockCacheSearchSource({
      id: 'pm',
      titleHits: { ok: [{ name: 'OK.mkv', sizeBytes: 1, infohash: 'okhash' }] }
    });
    const hits = await searchAllSources([
      { type: 'putio', apiKey: 'broken-secret', enabled: true, source: broken },
      { type: 'pm', apiKey: 'pm-secret', enabled: true, source: pm }
    ], { title: 'ok' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].sourceId, 'pm');
  });

  await check('dedupe by sourceId and fileId or infohash', async () => {
    _clearDebridCacheMemo();
    const putio = createMockCacheSearchSource({
      id: 'putio',
      titleHits: {
        dupe: [
          { name: 'Dupe 1.mkv', sizeBytes: 1, fileId: 'same' },
          { name: 'Dupe 2.mkv', sizeBytes: 2, fileId: 'same' }
        ]
      }
    });
    const hits = await searchAllSources([{ type: 'putio', apiKey: 'secret', enabled: true, source: putio }], { title: 'dupe' });
    assert.equal(hits.length, 1);
  });

  await check('captured smoke output has no API key bearer prefix', async () => {
    assert.doesNotMatch(capturedOutput.join('\n'), /Bearer\s+/i);
  });
}

run()
  .then(() => {
    console.log(`[smoke-debrid] PASS (${checks} checks)`);
  })
  .catch((error) => {
    console.error(`[smoke-debrid] FAIL: ${error.message}`);
    process.exit(1);
  })
  .finally(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });
