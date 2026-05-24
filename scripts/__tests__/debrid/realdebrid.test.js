const assert = require('node:assert/strict');
const { RealDebridProvider, mapRdStatus } = require('../../../src/clients/debrid/realdebrid');
const {
  RdInfringingFileError,
  ServiceApiError,
  UnsupportedCapabilityError
} = require('../../../src/clients/debrid/base');

function jsonResponse(body, status = 200) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createFetchQueue(responses, calls) {
  return async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? String(options.body) : ''
    });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return typeof next === 'function' ? next(url, options) : next;
  };
}

async function withFetch(responses, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = createFetchQueue([...responses], calls);
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run() {
  const provider = new RealDebridProvider('secret-key');
  assert.deepEqual(provider.capabilities, { magnet: true, torrentFile: true, nzb: false });

  await withFetch([jsonResponse({ id: 'rd1', uri: 'magnet:ok' }, 201)], async (calls) => {
    const result = await provider.addMagnet('magnet:?xt=urn:btih:abc&dn=Movie%20WEB-DL%202026');
    assert.deepEqual(result, { addedId: 'rd1' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/torrents\/addMagnet$/);
    assert.doesNotMatch(decodeURIComponent(calls[0].body), /WEB-DL/i);
  });

  await withFetch([jsonResponse({ id: 'rd-file-1', uri: 'torrent:ok' }, 201)], async (calls) => {
    const result = await provider.addTorrentFile(new Uint8Array([1, 2, 3]), 'Movie.torrent');
    assert.deepEqual(result, { addedId: 'rd-file-1' });
    assert.equal(calls[0].method, 'PUT');
    assert.match(calls[0].url, /\/torrents\/addTorrent$/);
  });

  await withFetch([new Response(null, { status: 204 })], async (calls) => {
    await provider.selectFiles('rd1', 'all');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/torrents\/selectFiles\/rd1$/);
    assert.equal(calls[0].body, 'files=all');
  });

  const statusExpectations = {
    magnet_conversion: 'queued',
    waiting_files_selection: 'queued',
    queued: 'queued',
    downloading: 'downloading',
    compressing: 'downloading',
    uploading: 'downloading',
    downloaded: 'ready',
    magnet_error: 'error',
    error: 'error',
    virus: 'error',
    dead: 'error'
  };
  for (const [rawStatus, expected] of Object.entries(statusExpectations)) {
    assert.equal(mapRdStatus(rawStatus), expected);
    await withFetch([jsonResponse({
      status: rawStatus,
      progress: 42,
      files: [{ id: 7, path: '/Movie.mkv', bytes: 99, selected: true }]
    })], async () => {
      const status = await provider.pollStatus('rd1');
      assert.equal(status.state, expected);
      assert.equal(status.progress, 0.42);
      assert.deepEqual(status.files[0], { idx: 7, name: '/Movie.mkv', size: 99, selected: true });
    });
  }

  await withFetch([
    jsonResponse({ links: ['host-zero', 'host-one'] }),
    jsonResponse({ download: 'https://download.example/movie.mkv' })
  ], async (calls) => {
    const streamUrl = await provider.getStreamUrl('rd1', 1);
    assert.equal(streamUrl, 'https://download.example/movie.mkv');
    assert.match(calls[1].url, /\/unrestrict\/link$/);
    assert.equal(calls[1].body, 'link=host-one');
  });

  await withFetch([new Response(null, { status: 204 })], async (calls) => {
    await provider.remove('rd1');
    assert.equal(calls[0].method, 'DELETE');
    assert.match(calls[0].url, /\/torrents\/delete\/rd1$/);
  });

  await assert.rejects(() => provider.addNzb('https://example.test/file.nzb'), UnsupportedCapabilityError);

  await withFetch([jsonResponse({ error_code: 35, error: 'infringing_file' }, 403)], async () => {
    await assert.rejects(
      () => provider.addMagnet('magnet:?xt=urn:btih:abc&dn=Movie'),
      RdInfringingFileError
    );
  });

  await withFetch([jsonResponse({ error: 'not found' }, 404)], async () => {
    await assert.rejects(() => provider.selectFiles('missing', [1]), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'error', progress: 0, files: [] })], async () => {
    const status = await provider.pollStatus('rd1');
    assert.equal(status.state, 'error');
    assert.equal(status.errorMessage, 'error');
  });

  await withFetch([jsonResponse({ links: [] })], async () => {
    await assert.rejects(() => provider.getStreamUrl('rd1', 0), ServiceApiError);
  });

  await withFetch([jsonResponse({ error: 'not found' }, 404)], async () => {
    await assert.rejects(() => provider.remove('missing'), ServiceApiError);
  });
}

run()
  .then(() => console.log('[realdebrid.test] PASS'))
  .catch((error) => {
    console.error('[realdebrid.test] FAIL');
    console.error(error);
    process.exit(1);
  });
