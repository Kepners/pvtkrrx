const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { createMockDebridProvider } = require('../src/clients/debrid/__mock__');
const { UnsupportedCapabilityError } = require('../src/clients/debrid/base');
const { PremiumizeDebridProvider } = require('../src/clients/debrid/premiumize');

process.env.PVTKRRX_DEBRID_POLL_INTERVAL_MS = process.env.PVTKRRX_DEBRID_POLL_INTERVAL_MS || '500';
process.env.PVTKRRX_DEBRID_POLL_TIMEOUT_MS = process.env.PVTKRRX_DEBRID_POLL_TIMEOUT_MS || '2000';

const { handleDebridPlayback, handleDebridPlaybackHead, _clearDebridPlaybackJobs } = require('../src/handlers/playbackDebrid');
const { encodeDebridPlaybackToken, DEBRID_PROTOCOL_TORRENT } = require('../src/utils/opaqueState');
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(String(value.length)), Buffer.from(':'), value]);
  if (value instanceof Uint8Array) return bencode(Buffer.from(value));
  if (typeof value === 'string') return bencode(Buffer.from(value, 'utf8'));
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')]);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return Buffer.concat([
      Buffer.from('d'),
      ...keys.flatMap(key => [bencode(key), bencode(value[key])]),
      Buffer.from('e')
    ]);
  }
  return bencode('');
}

function buildTorrentPayload(fileName = 'SportsCult.Match.mkv', length = 12345) {
  return bencode({
    info: {
      length,
      name: fileName
    }
  });
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    redirected: null,
    headersSent: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    redirect(status, url) {
      this.redirected = { status, url };
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    }
  };
}

function createStreamingMockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.redirected = null;
  res.headersSent = false;
  res.setHeader = function setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  };
  res.removeHeader = function removeHeader(name) {
    delete this.headers[String(name).toLowerCase()];
  };
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(body) {
    this.body = body;
    this.headersSent = true;
    this.end();
    return this;
  };
  res.redirect = function redirect(status, url) {
    this.redirected = { status, url };
    this.headersSent = true;
    this.end();
    return this;
  };
  const baseEnd = res.end.bind(res);
  res.end = function end(...args) {
    this.headersSent = true;
    return baseEnd(...args);
  };
  Object.defineProperty(res, 'bodyLength', {
    get() {
      return chunks.reduce((total, chunk) => total + chunk.length, 0);
    }
  });
  return res;
}

function waitForFinish(stream) {
  if (stream.writableEnded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });
}

async function run() {
  _clearDebridPlaybackJobs();
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

  await check('PM addTorrentFile flow returns addedId', async () => {
    const pm = createMockDebridProvider({ id: 'pm' });
    const result = await pm.addTorrentFile(new Uint8Array([1, 2, 3]), 'sportscult.torrent');
    assert.match(result.addedId, /^pm-torrent-/);
    assert.equal(pm.calls[0].method, 'addTorrentFile');
    assert.equal(pm.calls[0].fileName, 'sportscult.torrent');
    assert.equal(pm.calls[0].byteLength, 3);
  });

  await check('PM folder playback picks release-name video instead of first screenshot or larger unrelated video', async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const target = String(url);
      calls.push(target);
      if (target.includes('/transfer/list')) {
        return jsonResponse({
          status: 'success',
          transfers: [{
            id: 'pm-folder-transfer',
            name: 'MLB.2026.Rockies.vs.Dodgers.1080p',
            status: 'seeding',
            folder_id: 'folder-root'
          }]
        });
      }
      if (target.includes('/folder/list?id=folder-root')) {
        return jsonResponse({
          status: 'success',
          content: [
            { type: 'folder', id: 'screens', name: 'Screens' },
            {
              type: 'file',
              id: 'main-video',
              name: 'mlb.2026.rockies.vs.dodgers.1080p.mkv',
              size: 7_535_511_552,
              link: 'https://pm.example/main-video.mkv'
            },
            {
              type: 'file',
              id: 'larger-unrelated-video',
              name: 'bonus.feature.2160p.mkv',
              size: 9_000_000_000,
              link: 'https://pm.example/bonus-feature.mkv'
            },
            {
              type: 'file',
              id: 'nfo',
              name: 'mlb.2026.rockies.vs.dodgers.nfo',
              size: 1730,
              link: 'https://pm.example/release.nfo'
            }
          ]
        });
      }
      if (target.includes('/folder/list?id=screens')) {
        return jsonResponse({
          status: 'success',
          content: [
            {
              type: 'file',
              id: 'screen-1',
              name: 'screen0001.jpg',
              size: 133266,
              link: 'https://pm.example/screen0001.jpg'
            }
          ]
        });
      }
      throw new Error(`Unexpected Premiumize fetch: ${target}`);
    };

    try {
      const pm = new PremiumizeDebridProvider('pm-secret');
      const url = await pm.getStreamUrl('pm-folder-transfer', 0);
      assert.equal(url, 'https://pm.example/main-video.mkv');
      assert.ok(calls.some(call => call.includes('/folder/list?id=folder-root')));
      assert.ok(calls.some(call => call.includes('/folder/list?id=screens')));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await check('HTTP torrent debrid playback fetches .torrent and uploads it to Premiumize', async () => {
    _clearDebridPlaybackJobs();
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=sportscult-123&apikey=secret';
    const torrentBytes = buildTorrentPayload();
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: torrentUrl,
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'SportsCult Match'
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET',
        body: options.body ? String(options.body) : '',
        contentType: options.headers?.['Content-Type']
      });
      const target = String(url);
      if (target === torrentUrl) {
        return new Response(torrentBytes, {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="sportscult.torrent"' }
        });
      }
      if (target.endsWith('/transfer/create')) {
        return jsonResponse({ status: 'success', id: 'pm-transfer-1' });
      }
      if (target.includes('/transfer/list')) {
        return jsonResponse({
          status: 'success',
          transfers: [{
            id: 'pm-transfer-1',
            name: 'SportsCult Match.mkv',
            status: 'finished',
            progress: 1,
            file_id: 'file-1'
          }]
        });
      }
      if (target.includes('/item/details?id=file-1')) {
        return jsonResponse({ status: 'success', id: 'file-1', link: 'https://pm.example/SportsCult.Match.mkv' });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlayback({ params: { token } }, res);
      assert.deepEqual(res.redirected, { status: 302, url: 'https://pm.example/SportsCult.Match.mkv' });
      const secondRes = createMockRes();
      await handleDebridPlayback({ params: { token } }, secondRes);
      assert.deepEqual(secondRes.redirected, { status: 302, url: 'https://pm.example/SportsCult.Match.mkv' });
      assert.equal(calls[0].url, torrentUrl);
      assert.match(calls[1].url, /\/transfer\/create$/);
      assert.equal(calls[1].method, 'POST');
      assert.equal(calls[1].body, '[object FormData]');
      assert.equal(calls[1].contentType, undefined);
      assert.equal(calls.filter(call => call.url === torrentUrl).length, 1, 'second DL click should reuse the debrid job without refetching .torrent');
      assert.equal(calls.filter(call => /\/transfer\/create$/.test(call.url)).length, 1, 'second DL click should not create a duplicate provider transfer');
    } finally {
      globalThis.fetch = originalFetch;
      _clearDebridPlaybackJobs();
    }
  });

  await check('debrid playback HEAD is cheap and does not fetch tracker/provider URLs', async () => {
    _clearDebridPlaybackJobs();
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: 'https://prowlarr.example/api?t=download&id=head-check&apikey=secret',
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'SportsCult.Match.1080p.mkv'
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      throw new Error(`HEAD should not fetch ${url}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlaybackHead({ params: { token } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'video/x-matroska');
      assert.equal(res.body, null);
    } finally {
      globalThis.fetch = originalFetch;
      _clearDebridPlaybackJobs();
    }
  });

  await check('HTTP torrent debrid playback returns retryable 503 while provider is still preparing', async () => {
    _clearDebridPlaybackJobs();
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=slow-sports&apikey=secret';
    const torrentBytes = buildTorrentPayload('Slow.Sports.Match.mkv', 98765);
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: torrentUrl,
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'Slow Sports Match'
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET'
      });
      const target = String(url);
      if (target === torrentUrl) {
        return new Response(torrentBytes, {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="slow-sports.torrent"' }
        });
      }
      if (target.endsWith('/transfer/create')) {
        return jsonResponse({ status: 'success', id: 'pm-slow-transfer' });
      }
      if (target.includes('/transfer/list')) {
        return jsonResponse({
          status: 'success',
          transfers: [{
            id: 'pm-slow-transfer',
            name: 'Slow Sports Match.mkv',
            status: 'running',
            progress: 0.1483,
            file_id: 'file-slow'
          }]
        });
      }
      throw new Error(`Unexpected fetch while preparing: ${target}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlayback({ params: { token } }, res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.redirected, null);
      assert.equal(String(res.headers['retry-after'] || ''), '15');
      assert.notEqual(String(res.headers['x-pvtkrrx-waiting-room'] || ''), '1', 'active debrid handoff must not substitute the waiting-room MP4 while preparing');
      assert.equal(res.body?.error, 'Debrid item still preparing');
      assert.equal(res.body?.state, 'downloading');
      assert.equal(res.body?.progress, 0.1483);
      assert.equal(calls.filter(call => call.url === torrentUrl).length, 1);
      assert.equal(calls.filter(call => /\/transfer\/create$/.test(call.url)).length, 1);
      assert.ok(calls.filter(call => call.url.includes('/transfer/list')).length >= 1);
    } finally {
      globalThis.fetch = originalFetch;
      _clearDebridPlaybackJobs();
    }
  });

  await check('stalled first provider fails over to the next provider instead of blocking playback', async () => {
    // A lapsed/dead first provider (e.g. expired Premiumize) still ACCEPTS
    // magnets but never finishes the transfer. Playback must move on and ask
    // the next configured provider (Real-Debrid here) instead of answering
    // 503 forever while a working provider sits unused behind it.
    _clearDebridPlaybackJobs();
    const { _clearAccountIndexCache } = require('../src/clients/debrid/realdebrid');
    _clearAccountIndexCache();
    const infohash = 'abcdef0123456789abcdef0123456789abcdef01';
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: `magnet:?xt=urn:btih:${infohash}&dn=Failover.Test.mkv`,
      providers: [
        { type: 'pm', apiKey: 'pm-dead-secret' },
        { type: 'rd', apiKey: 'rd-alive-secret' }
      ],
      name: 'Failover Test'
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      // Premiumize: accepts the magnet, transfer never progresses.
      if (target.endsWith('/transfer/create')) {
        return jsonResponse({ status: 'success', id: 'pm-dead-transfer' });
      }
      if (target.includes('/transfer/list')) {
        return jsonResponse({
          status: 'success',
          transfers: [{ id: 'pm-dead-transfer', name: 'Failover.Test.mkv', status: 'running', progress: 0.01 }]
        });
      }
      // Real-Debrid: nothing on the account yet, add + select + ready + unrestrict.
      if (/\/torrents\?/.test(target)) {
        return jsonResponse([]);
      }
      if (target.endsWith('/torrents/addMagnet')) {
        return jsonResponse({ id: 'rd-failover-1' });
      }
      if (target.includes('/torrents/selectFiles/rd-failover-1')) {
        return new Response(null, { status: 204 });
      }
      if (target.includes('/torrents/info/rd-failover-1')) {
        return jsonResponse({
          id: 'rd-failover-1',
          status: 'downloaded',
          progress: 100,
          filename: 'Failover.Test.mkv',
          links: ['https://real-debrid.com/d/FAILOVER'],
          files: [{ id: 0, path: '/Failover.Test.mkv', bytes: 123456, selected: 1 }]
        });
      }
      if (target.endsWith('/unrestrict/link')) {
        return jsonResponse({ download: 'https://dl.real-debrid.com/dl/Failover.Test.mkv' });
      }
      throw new Error(`Unexpected fetch during failover: ${target}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlayback({ params: { token } }, res);
      assert.deepEqual(res.redirected, { status: 302, url: 'https://dl.real-debrid.com/dl/Failover.Test.mkv' });
    } finally {
      globalThis.fetch = originalFetch;
      _clearDebridPlaybackJobs();
      _clearAccountIndexCache();
    }
  });

  await check('HTTP torrent debrid playback holds first click until PM becomes ready, then redirects', async () => {
    _clearDebridPlaybackJobs();
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=eventually-ready&apikey=secret';
    const torrentBytes = buildTorrentPayload('Eventually.Ready.Match.1080p.mkv', 98765);
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: torrentUrl,
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'Eventually Ready Match'
    });
    let listCalls = 0;
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET'
      });
      const target = String(url);
      if (target === torrentUrl) {
        return new Response(torrentBytes, {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="eventually-ready.torrent"' }
        });
      }
      if (target.endsWith('/transfer/create')) {
        return jsonResponse({ status: 'success', id: 'pm-eventual-transfer' });
      }
      if (target.includes('/transfer/list')) {
        listCalls += 1;
        const running = listCalls < 3;
        return jsonResponse({
          status: 'success',
          transfers: [{
            id: 'pm-eventual-transfer',
            name: 'Eventually Ready Match 1080p.mkv',
            status: running ? 'running' : 'finished',
            progress: running ? 0.45 : 1,
            file_id: 'file-eventual',
            link: 'https://pm.example/eventually-ready.mkv'
          }]
        });
      }
      throw new Error(`Unexpected fetch while eventual-ready polling: ${target}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlayback({ params: { token } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.redirected, { status: 302, url: 'https://pm.example/eventually-ready.mkv' });
      assert.equal(calls.filter(call => call.url === torrentUrl).length, 1);
      assert.equal(calls.filter(call => /\/transfer\/create$/.test(call.url)).length, 1);
      assert.ok(listCalls >= 3, 'handler should keep polling the same click until ready');
    } finally {
      globalThis.fetch = originalFetch;
      _clearDebridPlaybackJobs();
    }
  });

  await check('HTTP torrent debrid playback can serve the waiting-room loader while provider is still preparing', async () => {
    _clearDebridPlaybackJobs();
    const oldMode = process.env.PVTKRRX_DEBRID_PREPARING_RESPONSE;
    const oldLoaderAfter = process.env.PVTKRRX_DEBRID_LOADER_AFTER_MS;
    process.env.PVTKRRX_DEBRID_PREPARING_RESPONSE = 'loader';
    process.env.PVTKRRX_DEBRID_LOADER_AFTER_MS = '1000';
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=loader-sports&apikey=secret';
    const torrentBytes = buildTorrentPayload('Loader.Sports.Match.mkv', 98765);
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: torrentUrl,
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'Loader Sports Match'
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET'
      });
      const target = String(url);
      if (target === torrentUrl) {
        return new Response(torrentBytes, {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="loader-sports.torrent"' }
        });
      }
      if (target.endsWith('/transfer/create')) {
        return jsonResponse({ status: 'success', id: 'pm-loader-transfer' });
      }
      if (target.includes('/transfer/list')) {
        return jsonResponse({
          status: 'success',
          transfers: [{
            id: 'pm-loader-transfer',
            name: 'Loader Sports Match.mkv',
            status: 'running',
            progress: 0.2231,
            file_id: 'file-loader'
          }]
        });
      }
      throw new Error(`Unexpected fetch while serving loader: ${target}`);
    };

    try {
      const res = createStreamingMockRes();
      await handleDebridPlayback({ params: { token }, headers: {}, method: 'GET' }, res);
      await waitForFinish(res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.redirected, null);
      assert.equal(String(res.headers['x-pvtkrrx-waiting-room'] || ''), '1');
      assert.equal(String(res.headers['x-pvtkrrx-waiting-kind'] || ''), 'debrid');
      assert.equal(String(res.headers['x-pvtkrrx-waiting-provider'] || ''), 'pm');
      assert.equal(String(res.headers['x-pvtkrrx-progress'] || ''), '22');
      assert.equal(String(res.headers['content-type'] || ''), 'video/mp4');
      assert.equal(String(res.headers['retry-after'] || ''), '15');
      assert.ok(res.bodyLength > 0, 'loader response should stream the bundled waiting-room MP4 body');
      assert.equal(calls.filter(call => call.url === torrentUrl).length, 1);
      assert.equal(calls.filter(call => /\/transfer\/create$/.test(call.url)).length, 1);
      assert.ok(calls.filter(call => call.url.includes('/transfer/list')).length >= 1);
    } finally {
      globalThis.fetch = originalFetch;
      if (oldMode === undefined) delete process.env.PVTKRRX_DEBRID_PREPARING_RESPONSE;
      else process.env.PVTKRRX_DEBRID_PREPARING_RESPONSE = oldMode;
      if (oldLoaderAfter === undefined) delete process.env.PVTKRRX_DEBRID_LOADER_AFTER_MS;
      else process.env.PVTKRRX_DEBRID_LOADER_AFTER_MS = oldLoaderAfter;
      _clearDebridPlaybackJobs();
    }
  });

  await check('HTTP torrent debrid playback rejects HTML login body before provider upload', async () => {
    _clearDebridPlaybackJobs();
    const torrentUrl = 'https://prowlarr.example/api?t=download&id=login-page&apikey=secret';
    const token = encodeDebridPlaybackToken({
      protocol: DEBRID_PROTOCOL_TORRENT,
      src: torrentUrl,
      providers: [{ type: 'pm', apiKey: 'pm-secret' }],
      name: 'SportsCult Match'
    });
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({
        url: String(url),
        method: options.method || 'GET'
      });
      const target = String(url);
      if (target === torrentUrl) {
        return new Response('<!doctype html><html><body>Please log in</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        });
      }
      throw new Error(`Provider should not be called after invalid torrent payload: ${target}`);
    };

    try {
      const res = createMockRes();
      await handleDebridPlayback({ params: { token } }, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.redirected, null);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, torrentUrl);
      assert.equal(res.body?.detail, 'tracker download did not return a valid torrent');
    } finally {
      globalThis.fetch = originalFetch;
    }
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
