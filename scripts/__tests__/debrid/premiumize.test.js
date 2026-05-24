const assert = require('node:assert/strict');
const {
  PremiumizeDebridProvider,
  mapPremiumizeStatus
} = require('../../../src/clients/debrid/premiumize');
const {
  PremiumizeContainerError,
  ServiceApiError
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

function transferList(transfer) {
  return {
    status: 'success',
    transfers: [transfer]
  };
}

async function run() {
  const provider = new PremiumizeDebridProvider('secret-key');
  assert.deepEqual(provider.capabilities, { magnet: true, torrentFile: true, nzb: true });

  await withFetch([jsonResponse({ status: 'success', id: 'pm1', name: 'Movie.mkv' })], async (calls) => {
    const result = await provider.addMagnet('magnet:?xt=urn:btih:abc');
    assert.deepEqual(result, { addedId: 'pm1' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/transfer\/create$/);
    assert.equal(calls[0].body, 'src=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc');
  });

  await withFetch([jsonResponse({ status: 'success', id: 'nzb1', name: 'Movie.nzb' })], async () => {
    assert.deepEqual(await provider.addNzb('https://indexer.example/movie.nzb'), { addedId: 'nzb1' });
  });

  await withFetch([jsonResponse({ status: 'success', id: 'torrent1', name: 'Movie.torrent' })], async (calls) => {
    assert.deepEqual(await provider.addTorrentFile(new Uint8Array([1, 2, 3]), 'Movie.torrent'), { addedId: 'torrent1' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/transfer\/create$/);
    assert.equal(calls[0].body, '[object FormData]');
  });

  await withFetch([jsonResponse({ status: 'success', type: 'container', content: ['link'] })], async () => {
    await assert.rejects(() => provider.addNzb('https://example.test/file.dlc'), PremiumizeContainerError);
  });

  const statuses = {
    queued: 'queued',
    running: 'downloading',
    finished: 'ready',
    seeding: 'ready',
    error: 'error'
  };
  for (const [raw, expected] of Object.entries(statuses)) {
    assert.equal(mapPremiumizeStatus(raw), expected);
    await withFetch([jsonResponse(transferList({
      id: 'pm1',
      name: 'Movie.mkv',
      status: raw,
      progress: 0.42,
      message: raw === 'error' ? 'failed' : '',
      file_id: 'file1',
      folder_id: null,
      size: 100
    }))], async () => {
      const status = await provider.pollStatus('pm1');
      assert.equal(status.state, expected);
      assert.equal(status.progress, 0.42);
    });
  }

  await withFetch([
    jsonResponse(transferList({ id: 'pm1', status: 'finished', folder_id: 'folder1', file_id: null })),
    jsonResponse({
      status: 'success',
      content: [
        { id: 'folder2', name: 'Nested', type: 'folder', content: [{ id: 'file1', name: 'A.mkv', type: 'file', size: 1, link: 'https://pm.example/a.mkv' }] },
        { id: 'file2', name: 'B.mkv', type: 'file', size: 2, link: 'https://pm.example/b.mkv' }
      ]
    })
  ], async () => {
    assert.equal(await provider.getStreamUrl('pm1', 1), 'https://pm.example/b.mkv');
  });

  await withFetch([
    jsonResponse(transferList({ id: 'pm1', name: 'Movie.mkv', status: 'finished', progress: 1, file_id: 'file1', folder_id: 'folder1' })),
    jsonResponse({ status: 'success', id: 'file1', name: 'Movie.mkv', link: 'https://pm.example/item.mkv' })
  ], async (calls) => {
    assert.equal(await provider.getStreamUrl('pm1', 0), 'https://pm.example/item.mkv');
    assert.match(calls[1].url, /\/item\/details\?id=file1$/);
  });

  await withFetch([jsonResponse({ status: 'success' })], async (calls) => {
    await provider.remove('pm1');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/transfer\/delete$/);
    assert.equal(calls[0].body, 'id=pm1');
  });

  await provider.selectFiles('pm1', [0]);

  await withFetch([jsonResponse({ status: 'error', message: 'bad src' })], async () => {
    await assert.rejects(() => provider.addMagnet('magnet:?xt=urn:btih:bad'), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'success', transfers: [] })], async () => {
    const status = await provider.pollStatus('missing');
    assert.equal(status.state, 'error');
  });

  await withFetch([jsonResponse({ status: 'success', transfers: [] })], async () => {
    await assert.rejects(() => provider.getStreamUrl('missing', 0), ServiceApiError);
  });

  await withFetch([jsonResponse({ status: 'error' })], async () => {
    await assert.rejects(() => provider.remove('pm1'), ServiceApiError);
  });

  await withFetch([
    jsonResponse({ status: 'rate_limit_reached' }),
    jsonResponse(transferList({ id: 'pm1', name: 'Movie.mkv', status: 'finished', progress: 1, file_id: 'file1', link: 'https://pm.example/single.mkv' }))
  ], async () => {
    const status = await provider.pollStatus('pm1');
    assert.equal(status.state, 'ready');
  });
}

run()
  .then(() => console.log('[premiumize.test] PASS'))
  .catch((error) => {
    console.error('[premiumize.test] FAIL');
    console.error(error);
    process.exit(1);
  });
