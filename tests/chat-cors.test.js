'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SITE_ORIGIN = 'https://fuluckpet.com';
const FOREIGN_ORIGIN = 'https://evil.example.com';

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class SpyKV {
  constructor(entries = {}) {
    this.store = new Map(Object.entries(entries));
    this.reads = [];
    this.puts = [];
    this.lists = [];
    this.deletes = [];
  }

  async get(key, type) {
    this.reads.push(key);
    if (!this.store.has(key)) return null;
    const value = this.store.get(key);
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.store.set(key, value);
  }

  async list(options) {
    this.lists.push(options);
    return {
      keys: [...this.store.keys()]
        .filter((key) => key.startsWith(options?.prefix || ''))
        .map((name) => ({ name })),
    };
  }

  async delete(key) {
    this.deletes.push(key);
    this.store.delete(key);
  }

  assertUntouched() {
    assert.deepEqual(this.reads, [], 'foreign chat request must not read KV');
    assert.deepEqual(this.puts, [], 'foreign chat request must not write KV');
    assert.deepEqual(this.lists, [], 'foreign chat request must not list chat logs');
    assert.deepEqual(this.deletes, [], 'foreign chat request must not delete chat logs');
  }
}

function makeHarness(entries = {}, corsOrigin = SITE_ORIGIN) {
  const DATA = new SpyKV(entries);
  const deferred = [];
  return {
    env: { DATA, CORS_ORIGIN: corsOrigin },
    DATA,
    deferred,
    ctx: { waitUntil(promise) { deferred.push(promise); } },
  };
}

function request(path, { method = 'GET', origin, body } = {}) {
  const headers = {};
  if (origin !== undefined) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://fuluckpet.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const CHAT_PATH_VARIANTS = [
  '/api/chat',
  '/api/chat?lang=ja',
  '/api/chat/',
  '/api/chat/diagnostic',
  '/api/%63hat',
  '/api/chat%2Fdiagnostic',
];

test('foreign chat namespace preflights are rejected without ACAO or side effects', async () => {
  for (const path of CHAT_PATH_VARIANTS) {
    const { env, DATA, ctx, deferred } = makeHarness();
    const response = await worker.fetch(request(path, {
      method: 'OPTIONS',
      origin: FOREIGN_ORIGIN,
    }), env, ctx);

    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null, path);
    assert.equal(deferred.length, 0, path);
    DATA.assertUntouched();
  }
});

test('foreign chat namespace POSTs are rejected before forget, provider, Telegram, or log work', async () => {
  for (const path of CHAT_PATH_VARIANTS) {
    const { env, DATA, ctx, deferred } = makeHarness({
      'chat:log:cors-probe:1': JSON.stringify({ private: true }),
    });
    const response = await worker.fetch(request(path, {
      method: 'POST',
      origin: FOREIGN_ORIGIN,
      body: { session_id: 'cors-probe', action: 'forget' },
    }), env, ctx);

    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null, path);
    assert.equal(deferred.length, 0, path);
    DATA.assertUntouched();
  }
});

test('chat stays fail-closed when CORS_ORIGIN is accidentally configured as wildcard', async () => {
  const { env, DATA, ctx } = makeHarness({}, '*');
  const response = await worker.fetch(request('/api/chat', {
    method: 'OPTIONS',
    origin: FOREIGN_ORIGIN,
  }), env, ctx);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  DATA.assertUntouched();
});

test('same-origin chat preflight and forget remain functional with site-scoped ACAO', async () => {
  const preflightHarness = makeHarness();
  const preflight = await worker.fetch(request('/api/chat', {
    method: 'OPTIONS',
    origin: SITE_ORIGIN,
  }), preflightHarness.env, preflightHarness.ctx);
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
  assert.equal(preflight.headers.get('Vary'), 'Origin');
  preflightHarness.DATA.assertUntouched();

  const forgetHarness = makeHarness({
    'chat:log:same-origin:1': JSON.stringify({ private: true }),
    'chat:ratelimit:same-origin': '2',
  });
  const forgotten = await worker.fetch(request('/api/chat', {
    method: 'POST',
    origin: SITE_ORIGIN,
    body: { session_id: 'same-origin', action: 'forget' },
  }), forgetHarness.env, forgetHarness.ctx);

  assert.equal(forgotten.status, 200);
  assert.equal(forgotten.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
  assert.equal(forgotten.headers.get('Vary'), 'Origin');
  assert.deepEqual(await forgotten.json(), { success: true, forgotten: true });
  assert.deepEqual(forgetHarness.DATA.deletes, ['chat:log:same-origin:1']);
  assert.equal(
    forgetHarness.DATA.store.get('chat:ratelimit:same-origin'),
    '2',
    'forget must not reset the abuse counter',
  );
});

test('originless chat clients remain compatible but never receive wildcard ACAO', async () => {
  const { env, ctx } = makeHarness();
  const response = await worker.fetch(request('/api/chat', {
    method: 'POST',
    body: { session_id: 'cli-probe', action: 'forget' },
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
});

test('unrelated public GET and admin CORS behavior stays unchanged', async () => {
  const publicHarness = makeHarness({ kittens: '[]' });
  const publicResponse = await worker.fetch(request('/api/kittens', {
    origin: FOREIGN_ORIGIN,
  }), publicHarness.env, publicHarness.ctx);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('Access-Control-Allow-Origin'), '*');

  const adminHarness = makeHarness();
  const adminResponse = await worker.fetch(request('/api/admin/kittens', {
    origin: FOREIGN_ORIGIN,
  }), adminHarness.env, adminHarness.ctx);
  assert.equal(adminResponse.status, 403);
  assert.equal(adminResponse.headers.get('Access-Control-Allow-Origin'), null);
  adminHarness.DATA.assertUntouched();
});
