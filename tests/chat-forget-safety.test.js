'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
const IP = '203.0.113.82';
const ROUND_ID = '00000000-0000-4000-8000-000000000001';
const BASE_TS = 1_900_000_000_000;
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class PagedKV {
  constructor({ failDelete = false } = {}) {
    const safePrefix = `chat:log:${sessionRef('safe-session')}:`;
    this.store = new Map([
      [`chat:ratelimit:${sessionRef('safe-session')}`, '29'],
      [`${safePrefix}${BASE_TS + 1}:${ROUND_ID}`, '{}'],
      [`${safePrefix}${BASE_TS + 2}:${ROUND_ID}`, '{}'],
      [`${safePrefix}${BASE_TS + 3}:${ROUND_ID}`, '{}'],
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

class LeakyCursorKV extends PagedKV {
  constructor(rawCursor) {
    super();
    this.rawCursor = rawCursor;
  }

  async list(options) {
    const page = await super.list(options);
    return page.list_complete ? page : { ...page, cursor: this.rawCursor };
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

function sessionRef(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex');
}

test('forget derives the opaque session prefix instead of listing the client session id', async () => {
  const sessionId = 'private-contact@example.test';
  const safePrefix = `chat:log:${sessionRef(sessionId)}:`;
  const DATA = new PagedKV();
  DATA.store.clear();
  DATA.store.set(`${safePrefix}${BASE_TS}:${ROUND_ID}`, '{}');

  const response = await run(DATA, sessionId);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, forgotten: true });
  assert.equal(DATA.listCalls[0].prefix, safePrefix);
  assert.deepEqual(DATA.deletes, [`${safePrefix}${BASE_TS}:${ROUND_ID}`]);
});

test('forget deletes a bounded first batch and preserves the abuse counter', async () => {
  const DATA = new PagedKV();
  const response = await run(DATA);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, forgotten: true });
  assert.equal(DATA.listCalls.length, 2);
  assert.equal(DATA.listCalls[0].limit, 500);
  assert.equal(DATA.listCalls[1].prefix, 'chat:log:safe-session:');
  assert.deepEqual(DATA.deletes.sort(), [
    `chat:log:${sessionRef('safe-session')}:${BASE_TS + 1}:${ROUND_ID}`,
    `chat:log:${sessionRef('safe-session')}:${BASE_TS + 2}:${ROUND_ID}`,
    `chat:log:${sessionRef('safe-session')}:${BASE_TS + 3}:${ROUND_ID}`,
  ]);
  assert.equal(DATA.store.get(`chat:ratelimit:${sessionRef('safe-session')}`), '29');
});

test('large sessions are deleted over bounded continuation calls', async () => {
  const DATA = new PagedKV();
  DATA.store.clear();
  DATA.store.set(`chat:ratelimit:${sessionRef('safe-session')}`, '29');
  const safePrefix = `chat:log:${sessionRef('safe-session')}:`;
  for (let index = 0; index < 1201; index += 1) {
    DATA.store.set(`${safePrefix}${BASE_TS + index}:${ROUND_ID}`, '{}');
  }
  // Model KV's eventually-consistent list view: deleted keys remain visible in this
  // snapshot, so only an opaque cursor can advance without repeatedly deleting page 1.
  DATA.listSnapshot = [...DATA.store.keys()];

  const batchSizes = [];
  let result;
  let cursor = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = DATA.deletes.filter((key) => key.startsWith('chat:log:')).length;
    const response = await run(DATA, undefined, cursor);
    assert.equal(response.status, 200);
    result = await response.json();
    const after = DATA.deletes.filter((key) => key.startsWith('chat:log:')).length;
    batchSizes.push(after - before);
    if (result.forgotten) break;
    assert.equal(result.more, true);
    assert.equal(typeof result.cursor, 'string');
    cursor = result.cursor;
  }

  assert.deepEqual(batchSizes, [500, 500, 201]);
  assert.deepEqual(result, { success: true, forgotten: true });
  assert.equal([...DATA.store.keys()].filter((key) => key.startsWith('chat:log:')).length, 0);
  assert.equal(DATA.store.get(`chat:ratelimit:${sessionRef('safe-session')}`), '29');
  assert.equal(
    DATA.deletes.filter((key) => key.startsWith('chat:log:')).length,
    1201,
    'stale list pages must not be deleted repeatedly',
  );
});

test('forget paginates both current and legacy namespaces without deleting collision-shaped neighbors', async () => {
  const sessionId = sessionRef('another-session');
  const currentPrefix = `chat:log:${sessionRef(sessionId)}:`;
  const legacyPrefix = `chat:log:${sessionId}:`;
  const DATA = new PagedKV();
  DATA.store.clear();

  const currentKeys = Array.from({ length: 501 }, (_, index) => (
    `${currentPrefix}${BASE_TS + index}:${ROUND_ID}`
  ));
  const legacyKeys = Array.from({ length: 501 }, (_, index) => (
    `${legacyPrefix}${BASE_TS + index}`
  ));
  for (const key of [...currentKeys, ...legacyKeys]) DATA.store.set(key, '{}');

  // The chosen raw SID is itself a valid session hash. These keys are therefore
  // inside one candidate prefix but have the other generation's shape; deleting
  // them would cross into another session namespace.
  const currentNamespaceLegacyShape = `${currentPrefix}${BASE_TS - 1}`;
  const legacyNamespaceCurrentShape = `${legacyPrefix}${BASE_TS - 1}:${ROUND_ID}`;
  const prefixNeighbor = `chat:log:${sessionId}-neighbor:${BASE_TS}`;
  for (const key of [currentNamespaceLegacyShape, legacyNamespaceCurrentShape, prefixNeighbor]) {
    DATA.store.set(key, '{}');
  }
  DATA.listSnapshot = [...DATA.store.keys()];

  let cursor = '';
  let result;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await run(DATA, sessionId, cursor);
    assert.equal(response.status, 200);
    result = await response.json();
    if (result.forgotten) break;
    assert.equal(result.more, true);
    assert.equal(typeof result.cursor, 'string');
    assert.ok(result.cursor.length > 0);
    assert.equal(result.cursor.includes(sessionId), false, 'continuation must not echo the raw SID');
    cursor = result.cursor;
  }

  assert.deepEqual(result, { success: true, forgotten: true });
  assert.equal(currentKeys.some((key) => DATA.store.has(key)), false);
  assert.equal(legacyKeys.some((key) => DATA.store.has(key)), false);
  assert.equal(DATA.store.has(currentNamespaceLegacyShape), true);
  assert.equal(DATA.store.has(legacyNamespaceCurrentShape), true);
  assert.equal(DATA.store.has(prefixNeighbor), true);
  assert.equal(
    DATA.deletes.filter((key) => key.startsWith('chat:log:')).length,
    currentKeys.length + legacyKeys.length,
  );
  assert.deepEqual(
    [...new Set(DATA.listCalls.map(({ prefix }) => prefix))].sort(),
    [currentPrefix, legacyPrefix].sort(),
  );
});

test('a forged legacy-phase cursor cannot skip deletion of the current namespace', async () => {
  const sessionId = 'forged-phase-session';
  const currentKey = `chat:log:${sessionRef(sessionId)}:${BASE_TS}:${ROUND_ID}`;
  const DATA = new PagedKV();
  DATA.store.clear();
  DATA.store.set(currentKey, '{}');

  const response = await run(DATA, sessionId, 'v1:l:');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, forgotten: true });
  assert.equal(DATA.store.has(currentKey), false);
});

test('forget returns an opaque token when the KV continuation contains the raw session id', async () => {
  const sessionId = 'private-contact@example.test';
  const currentPrefix = `chat:log:${sessionRef(sessionId)}:`;
  const DATA = new LeakyCursorKV(`opaque-${sessionId}-tail`);
  DATA.store.clear();
  for (let index = 0; index < 501; index += 1) {
    DATA.store.set(`${currentPrefix}${BASE_TS + index}:${ROUND_ID}`, '{}');
  }
  DATA.listSnapshot = [...DATA.store.keys()];

  const response = await run(DATA, sessionId);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.forgotten, false);
  assert.equal(result.more, true);
  assert.match(result.cursor, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.equal(result.cursor.includes(sessionId), false);
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
