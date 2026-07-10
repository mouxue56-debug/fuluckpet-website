'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'drive-loader.js'), 'utf8');

function flushAsyncWork(rounds = 6) {
  let work = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) {
    work = work.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return work;
}

function makeCard(type) {
  const image = { src: '/fallback.webp' };
  return {
    dataset: type === 'kitten'
      ? { breederId: 'K001' }
      : { name: 'Mochi' },
    querySelector() { return image; },
  };
}

function runDriveLoader(options = {}) {
  const requests = [];
  const documentListeners = Object.create(null);
  const windowListeners = Object.create(null);
  const kittenCards = options.kittenCards || [];
  const parentCards = options.parentCards || [];
  const payloadFor = (url) => {
    if (url.endsWith('/api/drive/folders/kitten-root')) return [{ name: 'K001', id: 'kitten-images' }];
    if (url.endsWith('/api/drive/folders/parent-root')) return [{ name: 'Mochi', id: 'parent-images' }];
    if (url.endsWith('/api/drive/images/kitten-images')) return [{ id: 'kitten-photo' }];
    if (url.endsWith('/api/drive/images/parent-images')) return [{ id: 'parent-photo' }];
    return [];
  };
  const document = {
    readyState: 'loading',
    addEventListener(type, listener) {
      if (!documentListeners[type]) documentListeners[type] = [];
      documentListeners[type].push(listener);
    },
    querySelectorAll(selector) {
      if (selector === '.kitten-card[data-breeder-id]') return kittenCards;
      if (selector === '.parent-card[data-name]') return parentCards;
      return [];
    },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FULUCK_DRIVE_FOLDERS: { kittens: 'kitten-root', parents: 'parent-root' },
    addEventListener(type, listener) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(listener);
    },
  };
  class FakeImage {
    set src(value) {
      this._src = value;
      if (this.onload) this.onload();
    }
    get src() { return this._src; }
  }
  const context = vm.createContext({
    window,
    document,
    Image: FakeImage,
    fetch(url) {
      const value = String(url);
      requests.push(value);
      return Promise.resolve({ ok: true, json: async () => payloadFor(value) });
    },
    Map,
    Promise,
  });
  vm.runInContext(SOURCE, context, { filename: 'drive-loader.js' });
  return { requests, documentListeners, windowListeners };
}

function dispatch(listeners, type) {
  for (const listener of listeners[type] || []) listener();
}

test('overlapping initial and cardsLoaded scans share folder and image requests', async () => {
  const run = runDriveLoader({
    kittenCards: [makeCard('kitten')],
    parentCards: [makeCard('parent')],
  });

  dispatch(run.documentListeners, 'DOMContentLoaded');
  dispatch(run.windowListeners, 'cardsLoaded');
  await flushAsyncWork();
  dispatch(run.windowListeners, 'cardsLoaded');
  await flushAsyncWork();

  const counts = new Map();
  for (const url of run.requests) counts.set(url, (counts.get(url) || 0) + 1);
  assert.equal(counts.get('https://api.example.test/api/drive/folders/kitten-root'), 1);
  assert.equal(counts.get('https://api.example.test/api/drive/folders/parent-root'), 1);
  assert.equal(counts.get('https://api.example.test/api/drive/images/kitten-images'), 1);
  assert.equal(counts.get('https://api.example.test/api/drive/images/parent-images'), 1);
});

test('pages without matching card types do not scan those Drive roots', async () => {
  const run = runDriveLoader({ kittenCards: [makeCard('kitten')], parentCards: [] });

  dispatch(run.documentListeners, 'DOMContentLoaded');
  await flushAsyncWork();

  assert.ok(run.requests.some((url) => url.endsWith('/api/drive/folders/kitten-root')));
  assert.ok(!run.requests.some((url) => url.endsWith('/api/drive/folders/parent-root')));
});

test('every tracked Drive consumer uses the current request-cache version', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const stale = files.filter((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return /drive-loader\.js\?v=/.test(source) && !/drive-loader\.js\?v=20260710b/.test(source);
  });
  assert.deepEqual(stale, []);
});
