const assert = require('node:assert/strict');
const { PremiumizeCacheSearchSource } = require('../../../src/clients/cacheSearch/premiumize');
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
  const source = new PremiumizeCacheSearchSource('pm-token');

  assert.deepEqual(await source.searchByTitle('Movie'), []);

  await withFetch([jsonResponse({
    status: 'success',
    response: [true],
    filename: ['Cached Movie.mkv'],
    filesize: ['12345']
  })], async (calls) => {
    const hit = await source.searchByHash('ABC123');
    assert.deepEqual(hit, {
      sourceId: 'pm',
      name: 'Cached Movie.mkv',
      sizeBytes: 12345,
      infohash: 'ABC123',
      directStreamUrl: null
    });
    assert.match(calls[0].url, /\/cache\/check\?/);
    assert.match(calls[0].url, /items%5B%5D=magnet/);
    assert.equal(calls[0].auth, 'Bearer pm-token');
  });

  await withFetch([jsonResponse({ status: 'success', response: [false], filename: [], filesize: [] })], async () => {
    assert.equal(await source.searchByHash('miss'), null);
  });

  assert.equal(await source.streamUrl({ sourceId: 'pm', directStreamUrl: null }), null);

  await withFetch([jsonResponse({ status: 'error', message: 'bad' })], async () => {
    await assert.rejects(() => source.searchByHash('bad'), ServiceApiError);
  });
}

run()
  .then(() => console.log('[premiumize-cache.test] PASS'))
  .catch((error) => {
    console.error('[premiumize-cache.test] FAIL');
    console.error(error);
    process.exit(1);
  });
