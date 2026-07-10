'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-core.js'), 'utf8');
const RENDER = fs.readFileSync(path.join(ROOT, 'admin/js/admin-render.js'), 'utf8');
const DATA = fs.readFileSync(path.join(ROOT, 'admin/js/admin-data.js'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    _values: values,
  };
}

function element(id) {
  const classes = new Set();
  return {
    id,
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    addEventListener() {},
    querySelector() { return null; },
    setAttribute() {},
    click() {},
  };
}

function harness({ local = null, get, bulkImport, publish } = {}) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return element(tag); },
  };
  const localStorage = storage(local == null ? {} : {
    'fuluck-admin-data': JSON.stringify(local),
  });
  const calls = { get: [], bulk: [], publish: 0 };
  const api = {
    get(pathname) {
      calls.get.push(pathname);
      return get ? get(pathname) : Promise.resolve([]);
    },
    bulkImport(type, items) {
      calls.bulk.push({ type, items: JSON.parse(JSON.stringify(items)) });
      return bulkImport ? bulkImport(type, items) : Promise.resolve({ success: true });
    },
    publish() {
      calls.publish++;
      return publish ? publish() : Promise.resolve({ success: true });
    },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    localStorage,
    sessionStorage: storage(),
    location: { reload() {} },
    FuluckAPI: api,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ success: false }) }),
    confirm: () => true,
    prompt: () => null,
    setTimeout(fn) { queueMicrotask(fn); return 0; },
    clearTimeout() {},
    t: (ja) => ja,
    admLang: 'ja',
    loadImageConfig() {},
    applyAdminLang() {},
  });
  vm.runInContext(CORE, context, { filename: 'admin-core.js' });
  vm.runInContext(RENDER, context, { filename: 'admin-render.js' });
  return { context, calls, localStorage, elements };
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

test('admin bundle contains no hard-coded catalogue fallback collections', () => {
  assert.doesNotMatch(CORE, /DEFAULT_(?:KITTENS|PARENTS|REVIEWS)/);
});

test('fresh admin starts with empty shells, never hard-coded catalogue rows', () => {
  const { context } = harness();
  assert.deepEqual(json(context.data), { kittens: [], parents: [], reviews: [] });
  assert.equal(context.remoteDataReady, false);
});

test('one failed remote read keeps writes locked and cannot publish', async () => {
  const { context, calls } = harness({
    get(pathname) {
      if (pathname === '/api/parents') return Promise.reject(new Error('offline'));
      return Promise.resolve([]);
    },
  });

  await context.syncFromAPI();
  assert.equal(context.remoteDataReady, false);
  await assert.rejects(Promise.resolve(context.saveAndPublish(context.data)), /remote|ready|sync/i);
  assert.equal(calls.bulk.length, 0);
  assert.equal(calls.publish, 0);
});

test('three successful empty collections are authoritative remote truth', async () => {
  const stale = {
    kittens: [{ id: 'stale-kitten' }],
    parents: [{ id: 'stale-parent' }],
    reviews: [{ id: 'stale-review' }],
  };
  const { context } = harness({ local: stale, get: () => Promise.resolve([]) });

  await context.syncFromAPI();

  assert.equal(context.remoteDataReady, true);
  assert.deepEqual(json(context.data), { kittens: [], parents: [], reviews: [] });
});

test('save writes only changed collections and a second no-op save writes nothing', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [{ id: 'p1', name: 'Parent' }],
    '/api/reviews': [{ id: 'r1', body: 'Review' }],
  };
  const { context, calls } = harness({ get: (pathname) => Promise.resolve(remote[pathname]) });
  await context.syncFromAPI();
  context.data.kittens[0].status = 'sold';

  await context.saveData(context.data);
  assert.deepEqual(calls.bulk.map((call) => call.type), ['kittens']);

  await context.saveData(context.data);
  assert.deepEqual(calls.bulk.map((call) => call.type), ['kittens']);
});

test('overlapping saves are serialized so an older request cannot finish last', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  const pending = [];
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(remote[pathname]),
    bulkImport: () => new Promise((resolve) => pending.push(resolve)),
  });
  await context.syncFromAPI();

  context.data.kittens[0].status = 'reserved';
  const older = context.saveData(context.data);
  context.data.kittens[0].status = 'sold';
  const newer = context.saveData(context.data);
  await new Promise(setImmediate);

  assert.equal(calls.bulk.length, 1, 'only the older write may be in flight');
  pending.shift()({ success: true });
  await new Promise(setImmediate);
  assert.equal(calls.bulk.length, 2, 'newer write starts only after older settles');
  pending.shift()({ success: true });
  await Promise.all([older, newer]);

  assert.deepEqual(calls.bulk.map((call) => call.items[0].status), ['reserved', 'sold']);
  assert.equal(json(context.remoteDataSnapshot).kittens[0].status, 'sold');
});

test('remote refresh waits for an in-flight save before reading KV again', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  let finishWrite;
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(remote[pathname]),
    bulkImport: (type, items) => new Promise((resolve) => {
      finishWrite = function() {
        remote['/api/' + type] = json(items);
        resolve({ success: true });
      };
    }),
  });
  await context.syncFromAPI();
  context.data.kittens[0].status = 'sold';
  const saving = context.saveData(context.data);
  await new Promise(setImmediate);

  const refreshing = context.syncFromAPI();
  await new Promise(setImmediate);
  assert.equal(calls.get.length, 3, 'refresh must not read while the write is in flight');

  finishWrite();
  await Promise.all([saving, refreshing]);
  assert.equal(calls.get.length, 6);
  assert.equal(json(context.data).kittens[0].status, 'sold');
});

test('partial multi-collection success updates per-collection snapshot before the next save', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [{ id: 'p1', name: 'Original' }],
    '/api/reviews': [],
  };
  let failParents = true;
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(json(remote[pathname])),
    bulkImport(type, items) {
      if (type === 'parents' && failParents) return Promise.reject(new Error('parents unavailable'));
      remote['/api/' + type] = json(items);
      return Promise.resolve({ success: true });
    },
  });
  await context.syncFromAPI();

  context.data.kittens[0].status = 'sold';
  context.data.parents[0].name = 'Pending';
  const partial = context.saveData(context.data);

  context.data.kittens[0].status = 'available';
  context.data.parents[0].name = 'Original';
  const revert = context.saveData(context.data);

  await assert.rejects(partial, /parents unavailable/);
  failParents = false;
  await revert;

  assert.equal(remote['/api/kittens'][0].status, 'available');
  assert.equal(remote['/api/parents'][0].name, 'Original');
  assert.equal(json(context.remoteDataSnapshot).kittens[0].status, 'available');
  assert.deepEqual(
    calls.bulk.map((call) => call.type),
    ['kittens', 'parents', 'parents', 'parents', 'parents', 'kittens'],
  );
});

test('bulk failure remains rejected and blocks publish', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(remote[pathname]),
    bulkImport: () => Promise.reject(new Error('KV unavailable')),
  });
  await context.syncFromAPI();
  context.data.kittens[0].status = 'sold';

  await assert.rejects(Promise.resolve(context.saveAndPublish(context.data)), /KV unavailable/);
  assert.equal(calls.publish, 0);
});

test('UI save wrapper reports failure without an unhandled rejection or false publish', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(remote[pathname]),
    bulkImport: () => Promise.reject(new Error('KV unavailable')),
  });
  await context.syncFromAPI();
  context.data.kittens[0].status = 'sold';

  const saved = await context.saveAndPublishFromUI(context.data);

  assert.equal(saved, false);
  assert.equal(calls.publish, 0);
});

test('reset clears local cache and delegates to remote sync instead of defaults', async () => {
  const { context, localStorage } = harness({
    local: { kittens: [{ id: 'cached' }], parents: [], reviews: [] },
  });
  vm.runInContext(DATA, context, { filename: 'admin-data.js' });
  let syncCalls = 0;
  context.syncFromAPI = function() { syncCalls++; return Promise.resolve(true); };

  const result = context.resetData();
  await Promise.resolve(result);

  assert.equal(localStorage.getItem('fuluck-admin-data'), null);
  assert.equal(syncCalls, 1);
});

test('legacy migration cannot bypass the guarded changed-collection save path', async () => {
  const remote = {
    '/api/kittens': [{ id: 'k1', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  const { context, calls } = harness({ get: (pathname) => Promise.resolve(remote[pathname]) });
  await context.syncFromAPI();
  context.data.kittens[0].status = 'sold';
  let legacyMigrationCalls = 0;
  context.FuluckMigrate = { migrate() { legacyMigrationCalls++; } };
  vm.runInContext(DATA, context, { filename: 'admin-data.js' });

  await Promise.resolve(context.runMigration());

  assert.equal(legacyMigrationCalls, 0);
  assert.deepEqual(calls.bulk.map((call) => call.type), ['kittens']);
});

test('failed import remains the active working copy and retry converges UI and snapshot', async () => {
  const remote = {
    '/api/kittens': [{ id: 'old', status: 'available' }],
    '/api/parents': [],
    '/api/reviews': [],
  };
  let shouldFail = true;
  const { context, calls } = harness({
    get: (pathname) => Promise.resolve(remote[pathname]),
    bulkImport: () => shouldFail
      ? Promise.reject(new Error('temporary KV failure'))
      : Promise.resolve({ success: true }),
  });
  await context.syncFromAPI();
  vm.runInContext(DATA, context, { filename: 'admin-data.js' });
  const imported = { kittens: [{ id: 'imported', status: 'available' }], parents: [], reviews: [] };

  await assert.rejects(Promise.resolve(context.importAdminData(imported)), /temporary KV failure/);
  assert.equal(json(context.data).kittens[0].id, 'imported');

  shouldFail = false;
  await context.retrySync();
  assert.equal(json(context.data).kittens[0].id, 'imported');
  assert.equal(json(context.remoteDataSnapshot).kittens[0].id, 'imported');
  const writesAfterRetry = calls.bulk.length;
  await context.saveData(context.data);
  assert.equal(calls.bulk.length, writesAfterRetry, 'converged data must be a no-op save');
});
