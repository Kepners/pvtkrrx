const assert = require('node:assert/strict');
const {
  AllDebridProvider,
  flattenAdTree,
  mapAdStatusCode
} = require('../../../src/clients/debrid/alldebrid');
const {
  ServiceApiError,
  UnsupportedCapabilityError
} = require('../../../src/clients/debrid/base');

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
      body: options.body ? String(options.body) : ''
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

function statusBody(statusCode) {
  return {
    status: 'success',
    data: {
      magnets: [{
        id: 123,
        filename: 'Movie',
        size: 100,
        status: `status-${statusCode}`,
        statusCode,
        downloaded: 50,
        files: [{
          n: 'Folder',
          e: [{ n: 'Movie.mkv', s: 100, l: 'https://ad.example/file' }]
        }]
      }]
    }
  };
}

async function run() {
  const provider = new AllDebridProvider('secret-key');
  assert.deepEqual(provider.capabilities, { magnet: true, torrentFile: true, nzb: false });

  await withFetch([jsonResponse({
    status: 'success',
    data: { magnets: [{ id: 123, hash: 'abc', name: 'Movie', size: 100, ready: true }] }
  })], async (calls) => {
    const result = await provider.addMagnet('magnet:?xt=urn:btih:abc');
    assert.deepEqual(result, { addedId: '123' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/v4\/magnet\/upload$/);
    assert.match(calls[0].body, /magnets%5B%5D=magnet/);
  });

  await withFetch([jsonResponse({
    status: 'success',
    data: { files: [{ id: 456, hash: 'abc', name: 'Movie.torrent', size: 100, ready: true }] }
  })], async (calls) => {
    const result = await provider.addTorrentFile(new Uint8Array([1, 2, 3]), 'Movie.torrent');
    assert.deepEqual(result, { addedId: '456' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/v4\/magnet\/upload\/file$/);
    assert.equal(calls[0].body, '[object FormData]');
  });

  assert.deepEqual(flattenAdTree([{
    n: 'Folder',
    e: [
      { n: 'A.mkv', s: 10, l: 'a' },
      { n: 'Nested', e: [{ n: 'B.mkv', s: 20, l: 'b' }] }
    ]
  }]), [
    { path: 'Folder/A.mkv', size: 10, link: 'a' },
    { path: 'Folder/Nested/B.mkv', size: 20, link: 'b' }
  ]);

  for (let code = 0; code <= 15; code += 1) {
    const expected = code === 0 ? 'queued' : ([1, 2, 3].includes(code) ? 'downloading' : (code === 4 ? 'ready' : 'error'));
    assert.equal(mapAdStatusCode(code), expected);
    await withFetch([jsonResponse(statusBody(code))], async () => {
      const status = await provider.pollStatus('123');
      assert.equal(status.state, expected);
      assert.equal(status.progress, 0.5);
      assert.equal(status.files[0].name, 'Folder/Movie.mkv');
    });
  }

  await withFetch([
    jsonResponse(statusBody(4)),
    jsonResponse({ status: 'success', data: { link: 'https://direct.example/movie.mkv' } })
  ], async (calls) => {
    const url = await provider.getStreamUrl('123', 0);
    assert.equal(url, 'https://direct.example/movie.mkv');
    assert.match(calls[1].url, /\/v4\/link\/unlock$/);
    assert.match(calls[1].body, /^link=https/);
  });

  await withFetch([jsonResponse({ status: 'success' })], async (calls) => {
    await provider.remove('123');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/v4\/magnet\/delete$/);
    assert.equal(calls[0].body, 'id=123');
  });

  await provider.selectFiles('123', [0]);
  await assert.rejects(() => provider.addNzb('https://example.test/file.nzb'), UnsupportedCapabilityError);

  await withFetch([jsonResponse({ status: 'success', data: { magnets: [{ error: { code: 'bad' } }] } })], async () => {
    await assert.rejects(() => provider.addMagnet('magnet:?xt=urn:btih:bad'), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'success', data: { magnets: [] } })], async () => {
    await assert.rejects(() => provider.pollStatus('missing'), ServiceApiError);
  });

  await withFetch([jsonResponse({ ...statusBody(4), data: { magnets: [{ ...statusBody(4).data.magnets[0], files: [] }] } })], async () => {
    await assert.rejects(() => provider.getStreamUrl('123', 0), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'error', error: 'bad id' })], async () => {
    await assert.rejects(() => provider.remove('123'), ServiceApiError);
  });
}

run()
  .then(() => console.log('[alldebrid.test] PASS'))
  .catch((error) => {
    console.error('[alldebrid.test] FAIL');
    console.error(error);
    process.exit(1);
  });
