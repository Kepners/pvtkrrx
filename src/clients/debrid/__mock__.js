const {
  UnsupportedCapabilityError,
  PremiumizeContainerError,
  RdInfringingFileError
} = require('./base');
const { sanitizeMagnet } = require('../../utils/rdFilenameSanitizer');

function defaultCapabilities(id) {
  if (id === 'pm') return { magnet: true, nzb: true };
  return { magnet: true, nzb: false };
}

function errorFromName(name, id, method) {
  if (name === 'UnsupportedCapabilityError') return new UnsupportedCapabilityError(id, method === 'addNzb' ? 'nzb' : method);
  if (name === 'PremiumizeContainerError') return new PremiumizeContainerError({ status: 'success', type: 'container' });
  if (name === 'RdInfringingFileError') return new RdInfringingFileError();
  return new Error(String(name || `Mock failure: ${method}`));
}

class MockDebridProvider {
  constructor(config = {}) {
    this.id = String(config.id || 'rd');
    this.capabilities = config.capabilities || defaultCapabilities(this.id);
    this.pollSequence = Array.isArray(config.pollSequence) ? [...config.pollSequence] : ['queued', 'downloading', 'ready'];
    this.failOn = config.failOn || {};
    this.files = Array.isArray(config.files) ? config.files : [{
      idx: 0,
      name: 'mock-video.mkv',
      size: 1024,
      selected: true
    }];
    this.streamUrls = config.streamUrls || {};
    this.calls = [];
    this.callCounts = {};
    this.added = new Map();
    this.nextId = 1;
  }

  _record(method, payload = {}) {
    this.callCounts[method] = Number(this.callCounts[method] || 0) + 1;
    this.calls.push({ method, ...payload });
  }

  _maybeFail(method) {
    const failure = this.failOn[method];
    if (!failure) return;
    if (failure instanceof Error) throw failure;
    if (typeof failure === 'string') throw errorFromName(failure, this.id, method);
    throw new Error(`Mock failure: ${method}`);
  }

  async addMagnet(magnet) {
    this._maybeFail('addMagnet');
    const submittedMagnet = this.id === 'rd' ? sanitizeMagnet(magnet) : String(magnet || '');
    this._record('addMagnet', { magnet: submittedMagnet });
    const addedId = `${this.id}-${this.nextId++}`;
    this.added.set(addedId, { magnet: submittedMagnet, pollIndex: 0 });
    return { addedId };
  }

  async addNzb(nzbUrl) {
    this._maybeFail('addNzb');
    if (!this.capabilities.nzb) throw new UnsupportedCapabilityError(this.id, 'nzb');
    this._record('addNzb', { nzbUrl: String(nzbUrl || '') });
    const addedId = `${this.id}-nzb-${this.nextId++}`;
    this.added.set(addedId, { nzbUrl: String(nzbUrl || ''), pollIndex: 0 });
    return { addedId };
  }

  async selectFiles(addedId, fileIdxs) {
    this._maybeFail('selectFiles');
    this._record('selectFiles', { addedId: String(addedId || ''), fileIdxs });
  }

  async pollStatus(addedId) {
    this._maybeFail('pollStatus');
    const transfer = this.added.get(String(addedId)) || { pollIndex: 0 };
    const index = Math.min(transfer.pollIndex || 0, this.pollSequence.length - 1);
    const state = this.pollSequence[index] || 'ready';
    transfer.pollIndex = index + 1;
    this.added.set(String(addedId), transfer);
    this._record('pollStatus', { addedId: String(addedId || ''), state });
    return {
      state,
      progress: state === 'queued' ? 0 : (state === 'downloading' ? 0.5 : 1),
      files: this.files,
      ...(state === 'error' ? { errorMessage: 'mock error' } : {})
    };
  }

  async getStreamUrl(addedId, fileIdx) {
    this._maybeFail('getStreamUrl');
    this._record('getStreamUrl', { addedId: String(addedId || ''), fileIdx: Number(fileIdx) || 0 });
    const key = `${addedId}:${Number(fileIdx) || 0}`;
    return String(this.streamUrls[key] || this.streamUrls[fileIdx] || `http://mock/${this.id}/${addedId}/${Number(fileIdx) || 0}.mkv`);
  }

  async remove(addedId) {
    this._maybeFail('remove');
    this._record('remove', { addedId: String(addedId || '') });
    this.added.delete(String(addedId));
  }
}

function createMockDebridProvider(config = {}) {
  return new MockDebridProvider(config);
}

module.exports = {
  MockDebridProvider,
  createMockDebridProvider
};
