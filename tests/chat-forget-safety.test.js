'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
const IP = '203.0.113.82';
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class PagedKV {
  constructor({ failDelete = false } = {}) {
    this.store = new Map([
      ['chat:ratelimit:safe-session', '29'],
      ['chat:log:safe-session:1', '{}'],
      ['chat:log:safe-session:2', '{}'],
      ['chat:log:safe-session:3', '{}'],
    ]);
    this.failDelete = failDelete;
    this.listCalls = [];
    this.deletes = [];
    this.listSnapshot = null;
  }

  async get(key) { return this.store.get(key) ?? null; }
  async put(key, value) { this.store.set(key, value); }
  async list(options) {
    this.listCalls.push(options);
    const all = (this.listSnapshot || [...this.store.keys()])
      .filter((key) => key.startsWith(options.prefix));
    const limit = options.limit || 1000;
    const start = options.cursor ? Number(options.cursor) : 0;
    const end = Math.min(start + limit, all.length);
    return {
      keys: all.slice(start, end).map((name) => ({ name })),
      list_complete: end >= all.length,
      ...(end < all.length ? { cursor: String(end) } : {}),
    };
  }
  async delete(key) {
    if (this.failDelete) throw new Error('delete failed');
    this.deletes.push(key);
    this.store.delete(key);
  }
}

function request(sessionId = 'safe-session', cursor = '') {
  return new Request('https://fuluckpet.com/api/chat', {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': IP,
    },
    body: JSON.stringify({
      session_id: sessionId,
      action: 'forget',
      ...(cursor ? { forget_cursor: cursor } : {}),
    }),
  });
}

async function run(DATA, sessionId, cursor) {
  return worker.fetch(request(sessionId, cursor), {
    DATA,
    CORS_ORIGIN: SITE_ORIGIN,
  }, { waitUntil() {} });
}

test('forget deletes a bounded first batch and preserves the abuse counter', async () => {
  const DATA = new PagedKV();
  const response = await run(DATA);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, forgotten: true });
  assert.equal(DATA.listCalls.length, 1);
  assert.equal(DATA.listCalls[0].limit, 500);
  assert.deepEqual(DATA.deletes.sort(), [
    'chat:log:safe-session:1',
    'chat:log:safe-session:2',
    'chat:log:safe-session:3',
  ]);
  assert.equal(DATA.store.get('chat:ratelimit:safe-session'), '29');
});

test('large sessions are deleted over bounded continuation calls', async () => {
  const DATA = new PagedKV();
  DATA.store.clear();
  DATA.store.set('chat:ratelimit:safe-session', '29');
  for (let index = 0; index < 1201; index += 1) {
    DATA.store.set(`chat:log:safe-session:${String(index).padStart(4, '0')}`, '{}');
  }
  // Model KV's eventually-consistent list view: deleted keys remain visible in this
  // snapshot, so only an opaque cursor can advance without repeatedly deleting page 1.
  DATA.listSnapshot = [...DATA.store.keys()];

  const batchSizes = [];
  let result;
  let cursor = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = DATA.deletes.length;
    const response = await run(DATA, undefined, cursor);
    assert.equal(response.status, 200);
    result = await response.json();
    batchSizes.push(DATA.deletes.length - before);
    if (result.forgotten) break;
    assert.equal(result.more, true);
    assert.equal(typeof result.cursor, 'string');
    cursor = result.cursor;
  }

  assert.deepEqual(batchSizes, [500, 500, 201]);
  assert.deepEqual(result, { success: true, forgotten: true });
  assert.equal([...DATA.store.keys()].filter((key) => key.startsWith('chat:log:')).length, 0);
  assert.equal(DATA.store.get('chat:ratelimit:safe-session'), '29');
  assert.equal(DATA.deletes.length, 1201, 'stale list pages must not be deleted repeatedly');
});

test('forget reports failure instead of claiming deletion succeeded', async () => {
  const DATA = new PagedKV({ failDelete: true });
  const response = await run(DATA);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, error: 'forget_failed' });
});

test('forget has an IP budget independent from chat sessions', async () => {
  const DATA = new PagedKV();
  for (let index = 0; index < 60; index += 1) {
    const response = await run(DATA, `session-${index}`);
    assert.equal(response.status, 200);
  }
  const listCount = DATA.listCalls.length;
  const blocked = await run(DATA, 'session-rotated-again');
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'rate_limited');
  assert.equal(DATA.listCalls.length, listCount, 'blocked forget must not scan KV');
});
