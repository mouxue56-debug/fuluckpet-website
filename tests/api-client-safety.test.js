'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const API_CLIENT = fs.readFileSync(path.join(ROOT, 'admin/js/api-client.js'), 'utf8');

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(options = {}) {
  const value = options.value === undefined ? { success: true } : options.value;
  return {
    ok: options.ok === undefined ? true : options.ok,
    status: options.status === undefined ? 200 : options.status,
    text() { return Promise.resolve(options.text === undefined ? '' : options.text); },
    json() { return Promise.resolve(value); },
  };
}

function scheduler() {
  let nextId = 1;
  const pending = new Map();
  const cleared = [];

  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      pending.delete(id);
    },
    fireNext() {
      const entry = pending.entries().next();
      if (entry.done) throw new Error('No pending timer');
      const [id, timer] = entry.value;
      pending.delete(id);
      timer.callback();
      return id;
    },
    pending,
    cleared,
  };
}

function harness(fetchImpl, options = {}) {
  const timers = scheduler();
  const controllers = [];

  class FakeAbortController {
    constructor() {
      this.signal = { aborted: false };
      this.abortCalls = 0;
      controllers.push(this);
    }

    abort() {
      this.abortCalls++;
      this.signal.aborted = true;
    }
  }

  class FakeFormData {
    constructor() {
      this.entries = [];
    }

    append(name, value) {
      this.entries.push([name, value]);
    }
  }

  const context = vm.createContext({
    AbortController: options.withoutAbortController ? undefined : FakeAbortController,
    FormData: FakeFormData,
    clearTimeout: timers.clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    fetch: fetchImpl,
    getSessionPass() { return 'test-password'; },
    setTimeout: timers.setTimeout,
  });
  vm.runInContext(API_CLIENT, context, { filename: 'api-client.js' });
  return { api: context.FuluckAPI, context, controllers, timers };
}

test('GET retries one transient failure and returns the second response', async () => {
  let attempts = 0;
  const { api } = harness(function() {
    attempts++;
    if (attempts === 1) return Promise.reject(new Error('offline'));
    return Promise.resolve(response({ value: { kittens: 3 } }));
  });

  const result = await api.get('/api/kittens');

  assert.equal(attempts, 2);
  assert.deepEqual(json(result), { kittens: 3 });
});

test('POST, PUT, and DELETE never retry an ambiguous network failure', async (t) => {
  const operations = {
    POST(api) { return api.post('/api/admin/kittens', { name: 'Mugi' }); },
    PUT(api) { return api.put('/api/admin/kittens/k1', { name: 'Mugi' }); },
    DELETE(api) { return api.del('/api/admin/kittens/k1'); },
  };

  for (const [method, operation] of Object.entries(operations)) {
    await t.test(method, async () => {
      let attempts = 0;
      const networkError = new Error(method + ' connection lost');
      const { api } = harness(function() {
        attempts++;
        return Promise.reject(networkError);
      });

      await assert.rejects(operation(api), (error) => error === networkError);
      assert.equal(attempts, 1);
    });
  }
});

test('a failed POST keeps the existing API status and response-body error message', async () => {
  let attempts = 0;
  const { api } = harness(function() {
    attempts++;
    return Promise.resolve(response({ ok: false, status: 409, text: 'duplicate id' }));
  });

  await assert.rejects(api.post('/api/admin/kittens', {}), {
    message: 'API 409: duplicate id',
  });
  assert.equal(attempts, 1);
});

test('uploads are attempted once and preserve upload response errors', async () => {
  let attempts = 0;
  const { api } = harness(function() {
    attempts++;
    return Promise.resolve(response({ ok: false, status: 413, text: 'too large' }));
  });

  await assert.rejects(api.uploadFile({ name: 'large.jpg' }), {
    message: 'Upload 413: too large',
  });
  assert.equal(attempts, 1);
});

test('a timed-out POST aborts once and is never replayed', async () => {
  let attempts = 0;
  let fetchOptions;
  const { api, controllers, timers } = harness(function(_url, options) {
    attempts++;
    fetchOptions = options;
    return new Promise(function() {});
  });

  const saving = api.post('/api/admin/kittens', { name: 'Mugi' });
  timers.fireNext();

  await assert.rejects(saving, { message: 'timeout' });
  assert.equal(attempts, 1);
  assert.equal(fetchOptions.signal, controllers[0].signal);
  assert.equal(fetchOptions.signal.aborted, true);
  assert.equal(timers.pending.size, 0);
});

test('a timed-out upload aborts the fetch and ignores its late response', async () => {
  let resolveFetch;
  let fetchOptions;
  let settlements = 0;
  const { api, controllers, timers } = harness(function(_url, options) {
    fetchOptions = options;
    return new Promise(function(resolve) { resolveFetch = resolve; });
  });

  const upload = api.uploadFile({ name: 'slow.jpg' }).then(
    function(value) {
      settlements++;
      return value;
    },
    function(error) {
      settlements++;
      throw error;
    },
  );
  const timerId = timers.fireNext();

  await assert.rejects(upload, { message: 'timeout' });
  assert.equal(fetchOptions.signal, controllers[0].signal);
  assert.equal(fetchOptions.signal.aborted, true);
  assert.equal(controllers[0].abortCalls, 1);
  assert.deepEqual(timers.cleared, [timerId]);

  resolveFetch(response({ value: { url: 'https://late.example/image.jpg' } }));
  await new Promise(setImmediate);
  assert.equal(settlements, 1);
  assert.equal(timers.pending.size, 0);
});

test('a completed request clears its timeout and cannot abort later', async () => {
  let fetchOptions;
  const { api, controllers, timers } = harness(function(_url, options) {
    fetchOptions = options;
    return Promise.resolve(response({ value: { saved: true } }));
  });

  const result = await api.post('/api/admin/kittens', { name: 'Mugi' });

  assert.deepEqual(json(result), { saved: true });
  assert.equal(fetchOptions.signal, controllers[0].signal);
  assert.equal(timers.pending.size, 0);
  assert.equal(timers.cleared.length, 1);
  assert.equal(controllers[0].abortCalls, 0);
});

test('timeouts still reject when AbortController is unavailable', async () => {
  const { api, timers } = harness(function() {
    return new Promise(function() {});
  }, { withoutAbortController: true });

  const upload = api.uploadFile({ name: 'slow.jpg' });
  timers.fireNext();

  await assert.rejects(upload, { message: 'timeout' });
});
