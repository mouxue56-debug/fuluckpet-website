'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SITE_ORIGIN = 'https://fuluckpet.com';
const FOREIGN_ORIGIN = 'https://evil.example.test';
const STORY_PATHS = ['/api/story/analyze-photo', '/api/story/generate'];

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class SpyKV {
  constructor() {
    this.reads = [];
    this.puts = [];
  }

  async get(key) {
    this.reads.push(key);
    return null;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
  }

  assertUntouched() {
    assert.deepEqual(this.reads, []);
    assert.deepEqual(this.puts, []);
  }
}

function harness(corsOrigin = SITE_ORIGIN) {
  const DATA = new SpyKV();
  return {
    DATA,
    env: { DATA, CORS_ORIGIN: corsOrigin, RELEASE_SHA: 'test-release-sha' },
    ctx: { waitUntil() {} },
  };
}

test('every edge response exposes the exact non-secret release identifier', async () => {
  const { env, ctx } = harness();
  const publicResponse = await worker.fetch(new Request(`${SITE_ORIGIN}/api/kittens`), env, ctx);
  const rejectedPreflight = await worker.fetch(request('/api/story/generate', {
    method: 'OPTIONS',
    origin: FOREIGN_ORIGIN,
  }), env, ctx);

  assert.equal(publicResponse.headers.get('X-Fuluck-Release'), 'test-release-sha');
  assert.equal(rejectedPreflight.headers.get('X-Fuluck-Release'), 'test-release-sha');
});

function request(path, { method = 'POST', origin, body = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' };
  if (origin !== undefined) headers.Origin = origin;
  return new Request(`https://fuluckpet.com${path}`, {
    method,
    headers,
    body: method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

test('foreign story preflights and POSTs stop before rate-limit or provider work', async () => {
  for (const path of STORY_PATHS) {
    for (const method of ['OPTIONS', 'POST']) {
      const { DATA, env, ctx } = harness();
      const response = await worker.fetch(request(path, {
        method,
        origin: FOREIGN_ORIGIN,
      }), env, ctx);

      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      DATA.assertUntouched();
    }
  }
});

test('story stays site-locked when CORS_ORIGIN is accidentally wildcarded', async () => {
  const { DATA, env, ctx } = harness('*');
  const response = await worker.fetch(request('/api/story/generate', {
    method: 'OPTIONS',
    origin: FOREIGN_ORIGIN,
  }), env, ctx);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  DATA.assertUntouched();
});

test('same-origin and originless story requests retain the site-scoped policy', async () => {
  for (const origin of [SITE_ORIGIN, undefined]) {
    const { DATA, env, ctx } = harness();
    const response = await worker.fetch(request('/api/story/generate', {
      origin,
      body: {},
    }), env, ctx);

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE_ORIGIN);
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal(DATA.puts.length, 0, 'invalid input should not consume the story quota');
  }
});

test('paid story endpoints fail closed before provider calls when the KV throttle is unavailable', async () => {
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return new Response('{}', { status: 500 });
  };

  try {
    for (const [path, body] of [
      ['/api/story/generate', { name: 'Mochi' }],
      ['/api/story/analyze-photo', { image: 'data:image/jpeg;base64,/9j/' }],
    ]) {
      const DATA = {
        async get(key) {
          if (key.startsWith('story:rl:')) throw new Error('KV throttle unavailable');
          return null;
        },
        async put() {
          throw new Error('story throttle must not write after a failed read');
        },
      };
      const response = await worker.fetch(request(path, {
        origin: SITE_ORIGIN,
        body,
      }), { DATA, CORS_ORIGIN: SITE_ORIGIN }, { waitUntil() {} });

      assert.equal(response.status, 503, path);
      assert.equal((await response.json()).error, 'rate_limit_unavailable');
    }
    assert.equal(providerCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
