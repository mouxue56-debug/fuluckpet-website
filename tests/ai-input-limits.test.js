'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class SpyKV {
  constructor() {
    this.reads = [];
    this.puts = [];
  }
  async get(key) { this.reads.push(key); return null; }
  async put(key, value, options) { this.puts.push({ key, value, options }); }
  async list() { throw new Error('unexpected KV list'); }
  async delete() { throw new Error('unexpected KV delete'); }
  assertUntouched() {
    assert.deepEqual(this.reads, []);
    assert.deepEqual(this.puts, []);
  }
}

function harness() {
  const DATA = new SpyKV();
  return {
    DATA,
    env: { DATA, CORS_ORIGIN: SITE_ORIGIN },
    ctx: { waitUntil() {} },
  };
}

function request(path, body, headers = {}) {
  return new Request(`https://fuluckpet.com${path}`, {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      'CF-Connecting-IP': '203.0.113.31',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('public JSON endpoints require JSON before parsing or rate-limit work', async () => {
  for (const path of ['/api/auth', '/api/chat', '/api/story/analyze-photo', '/api/story/generate']) {
    const { DATA, env, ctx } = harness();
    const response = await worker.fetch(request(path, '{}', {
      'Content-Type': 'text/plain',
    }), env, ctx);
    assert.equal(response.status, 415, path);
    DATA.assertUntouched();
  }
});

test('declared oversized AI bodies return 413 before KV or provider work', async () => {
  const cases = [
    ['/api/auth', '5000'],
    ['/api/chat', '70000'],
    ['/api/story/generate', '40000'],
    ['/api/story/analyze-photo', '6000000'],
  ];
  for (const [path, length] of cases) {
    const { DATA, env, ctx } = harness();
    const response = await worker.fetch(request(path, '{}', {
      'Content-Length': length,
    }), env, ctx);
    assert.equal(response.status, 413, path);
    DATA.assertUntouched();
  }
});

test('chunked chat body is stopped at the streaming byte limit', async () => {
  const { DATA, env, ctx } = harness();
  const oversized = JSON.stringify({
    session_id: 'stream-limit',
    messages: [{ role: 'user', content: 'x'.repeat(70_000) }],
  });
  const req = request('/api/chat', oversized);
  assert.equal(req.headers.get('content-length'), null);
  const response = await worker.fetch(req, env, ctx);
  assert.equal(response.status, 413);
  DATA.assertUntouched();
});

test('chat rejects excessive history and per-message length without provider work', async () => {
  const cases = [
    Array.from({ length: 41 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: 'short',
    })),
    [{ role: 'user', content: 'x'.repeat(1501) }],
  ];
  for (const messages of cases) {
    const { DATA, env, ctx } = harness();
    const response = await worker.fetch(request('/api/chat', {
      session_id: 'shape-limit',
      messages,
    }), env, ctx);
    assert.equal(response.status, 413);
    DATA.assertUntouched();
  }
});

test('story generation rejects overlong prompt fields before provider calls', async () => {
  const { env, ctx } = harness();
  const response = await worker.fetch(request('/api/story/generate', {
    name: 'Mochi',
    happyMoment: 'x'.repeat(2001),
  }), env, ctx);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'payload_too_large');
});
