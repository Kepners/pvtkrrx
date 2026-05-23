const assert = require('node:assert/strict');
const { PutioCacheSearchSource } = require('../../../src/clients/cacheSearch/putio');
const { ServiceApiError } = require('../../../src/clients/cacheSearch/base');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function withFetch(responses, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      auth: String(options.headers?.Authorization || '')
    });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return next;
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run() {
  const source = new PutioCacheSearchSource('putio-token');

  await withFetch([jsonResponse({
    status: 'OK',
    files: [
      { id: 1, name: 'Movie 2025.txt', file_type: 'TEXT', size: 10 },
      { id: 2, name: 'Movie 2024.mkv', file_type: 'VIDEO', size: 20 },
      { id: 3, name: 'Show S01E02 2024.mkv', file_type: 'VIDEO', size: 30 },
      { id: 4, name: 'Movie 2023.mkv', file_type: 'VIDEO', size: 40 }
    ]
  })], async (calls) => {
    const hits = await source.searchByTitle('Movie', { year: 2024, type: 'series', limit: 2 });
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map(hit => hit.fileId), ['3', '2']);
    assert.equal(hits[0].sourceId, 'putio');
    assert.match(calls[0].url, /\/files\/search\?/);
    assert.match(calls[0].url, /query=Movie/);
    assert.equal(calls[0].auth, 'Bearer putio-token');
  });

  assert.equal(await source.searchByHash('abc123'), null);

  await withFetch([jsonResponse({ status: 'OK', url: 'https://putio.example/signed.mkv' })], async (calls) => {
    const url = await source.streamUrl({ sourceId: 'putio', fileId: '42' });
    assert.equal(url, 'https://putio.example/signed.mkv');
    assert.match(calls[0].url, /\/files\/42\/url$/);
  });

  await withFetch([jsonResponse({ status: 'ERROR', error: 'bad query' })], async () => {
    await assert.rejects(() => source.searchByTitle('bad'), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'ERROR', error: 'bad file' })], async () => {
    await assert.rejects(() => source.streamUrl({ sourceId: 'putio', fileId: '404' }), ServiceApiError);
  });
}

run()
  .then(() => console.log('[putio.test] PASS'))
  .catch((error) => {
    console.error('[putio.test] FAIL');
    console.error(error);
    process.exit(1);
  });
