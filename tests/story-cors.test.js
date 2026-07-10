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
    env: { DATA, CORS_ORIGIN: corsOrigin },
    ctx: { waitUntil() {} },
  };
}

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
