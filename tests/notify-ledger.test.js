'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let NOTIFY_TTL_SECONDS;
let RETRY_DELAYS_MS;
let notifyItemKey;
let notifyDueKey;
let createNotifyIntent;
let readNotifyItem;
let markNotifySent;
let markNotifyFailure;

test.before(async () => {
  ({
    NOTIFY_TTL_SECONDS,
    RETRY_DELAYS_MS,
    notifyItemKey,
    notifyDueKey,
    createNotifyIntent,
    readNotifyItem,
    markNotifySent,
    markNotifyFailure,
  } = await import('../api/notify.js'));
});

class MemoryKV {
  constructor() {
    this.store = new Map();
    this.puts = [];
    this.deletes = [];
  }

  async get(key, type) {
    const value = this.store.get(key) ?? null;
    return type === 'json' && value !== null ? JSON.parse(value) : value;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.store.set(key, value);
  }

  async delete(key) {
    this.deletes.push(key);
    this.store.delete(key);
  }

  async list({ prefix } = {}) {
    const keys = [...this.store.keys()]
      .filter((key) => !prefix || key.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys };
  }
}

const spec = {
  entityKind: 'booking',
  entityId: 'b-1',
  channel: 'email',
  template: 'owner_booking_v1',
  sourceKey: 'booking:b-1',
  payloadHash: 'sha256:payload',
  recipientFingerprint: 'sha256:recipient',
};

function env() {
  const DATA = new MemoryKV();
  return { env: { DATA }, DATA };
}

test('builds deterministic notification item and due keys', () => {
  assert.equal(
    notifyItemKey({ entityKind: 'booking', entityId: 'b-1', channel: 'email', template: 'owner_booking_v1' }),
    'notify:item:booking:b-1:email:owner_booking_v1',
  );
  assert.equal(notifyDueKey(1234, 'notify:item:booking:b-1:email:owner_booking_v1'),
    'notify:due:0000000001234:notify%3Aitem%3Abooking%3Ab-1%3Aemail%3Aowner_booking_v1');
});

test('first create writes one pending item, due reference, and JST daily reference', async () => {
  const { env: bindings, DATA } = env();
  const nowMs = Date.parse('2026-08-15T15:30:00.000Z');

  const result = await createNotifyIntent(bindings, spec, nowMs);
  const itemKey = notifyItemKey(spec);
  const dueKey = notifyDueKey(nowMs, itemKey);
  const dailyKeys = [...DATA.store.keys()].filter((key) => key.startsWith('notify:daily:2026-08-16:'));

  assert.equal(result.created, true);
  assert.equal(result.itemKey, itemKey);
  assert.equal(result.dueKey, dueKey);
  assert.equal(DATA.store.size, 3);
  assert.deepEqual([...DATA.store.keys()].sort(), [itemKey, dueKey, dailyKeys[0]].sort());
  assert.equal(dailyKeys.length, 1);
  assert.equal(JSON.parse(DATA.store.get(itemKey)).status, 'pending');
  assert.equal(JSON.parse(DATA.store.get(itemKey)).attempt_count, 0);
  assert.equal(JSON.parse(DATA.store.get(itemKey)).created_at, nowMs);
  assert.equal(JSON.parse(DATA.store.get(itemKey)).next_attempt_ms, nowMs);
  for (const put of DATA.puts) assert.equal(put.options.expirationTtl, NOTIFY_TTL_SECONDS);
});

test('second create is idempotent and does not reset an already-sent item', async () => {
  const { env: bindings, DATA } = env();
  const first = await createNotifyIntent(bindings, spec, 1_700_000_000_000);
  const sent = await markNotifySent(bindings, first.itemKey, { message_id: 'm-1' }, 1_700_000_001_000);
  const putsBeforeRetry = DATA.puts.length;

  const retry = await createNotifyIntent(bindings, spec, 1_700_000_002_000);
  assert.equal(sent.status, 'sent');
  assert.equal(retry.created, false);
  assert.deepEqual(retry.item, sent);
  assert.equal(DATA.puts.length, putsBeforeRetry);
  assert.equal((await readNotifyItem(bindings, first.itemKey)).status, 'sent');
});

test('marking a notification failure schedules the first retry', async () => {
  const { env: bindings } = env();
  const first = await createNotifyIntent(bindings, spec, 1_700_000_000_000);
  const failed = await markNotifyFailure(bindings, first.itemKey, new Error('SMTP unavailable'), 1_700_000_001_000);

  assert.equal(failed.status, 'pending');
  assert.equal(failed.attempt_count, 1);
  assert.equal(failed.last_error, 'SMTP unavailable');
  assert.equal(failed.next_attempt_ms, 1_700_000_001_000 + RETRY_DELAYS_MS[0]);
  assert.equal(failed.due_key, notifyDueKey(failed.next_attempt_ms, first.itemKey));
});

test('marking a notification sent removes its due reference and records the result', async () => {
  const { env: bindings, DATA } = env();
  const first = await createNotifyIntent(bindings, spec, 1_700_000_000_000);
  const sent = await markNotifySent(bindings, first.itemKey, { provider_id: 'p-1' }, 1_700_000_001_000);

  assert.equal(sent.status, 'sent');
  assert.equal(sent.sent_at, 1_700_000_001_000);
  assert.deepEqual(sent.result, { provider_id: 'p-1' });
  assert.equal(DATA.store.has(first.dueKey), false);
  assert.equal((await readNotifyItem(bindings, first.itemKey)).status, 'sent');
});
