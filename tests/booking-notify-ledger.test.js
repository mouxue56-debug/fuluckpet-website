'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
const SUBMISSION_ID = '9005000000000000-0123456789abcdef0123456789abcdef';
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class MemoryKV {
  constructor() {
    this.store = new Map();
    this.operations = [];
    this.putFailures = [];
  }

  failPutOnce(predicate) {
    this.putFailures.push(predicate);
  }

  async get(key, type) {
    this.operations.push({ operation: 'get', key, type });
    const value = this.store.get(key) ?? null;
    if (type !== 'json' || value === null) return value;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  async put(key, value, options) {
    this.operations.push({ operation: 'put', key, value, options });
    const failureIndex = this.putFailures.findIndex((predicate) => predicate({ key, value, options }));
    if (failureIndex >= 0) {
      this.putFailures.splice(failureIndex, 1);
      throw new Error(`synthetic KV put failure for ${key}`);
    }
    this.store.set(key, value);
  }

  async delete(key) {
    this.operations.push({ operation: 'delete', key });
    this.store.delete(key);
  }

  async list({ prefix = '' } = {}) {
    this.operations.push({ operation: 'list', prefix });
    return {
      keys: [...this.store.keys()]
        .filter((name) => name.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
      list_complete: true,
    };
  }
}

function payload(overrides = {}) {
  return {
    name: 'Ledger Visitor',
    email: 'ledger-visitor@example.test',
    phone: '090-9999-8888',
    preferred_date: '2026-08-20',
    preferred_date2: '',
    preferred_time: '14:00',
    visit_method: 'in-person',
    kitten_id: '2607-00585',
    message: 'Private booking note for source storage only.',
    ...overrides,
  };
}

function bookingRequest(body) {
  return new Request('https://fuluckpet.com/api/booking', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.91',
      'User-Agent': 'booking-ledger-test',
    },
    body: JSON.stringify(body),
  });
}

function createHarness({ emailBinding = true } = {}) {
  const DATA = new MemoryKV();
  const emailCalls = [];
  const telegramCalls = [];
  const env = {
    DATA,
    TELEGRAM_BOT_TOKEN: 'test-telegram-token',
    TELEGRAM_CHAT_ID: '123456789',
  };
  if (emailBinding) {
    env.EMAIL = {
      async send(message) {
        emailCalls.push(message);
        return { id: `cf-email-${emailCalls.length}`, status: 200 };
      },
    };
  }
  return { DATA, emailCalls, telegramCalls, env };
}

function telegramResponse() {
  return {
    ok: true,
    status: 200,
    async json() { return { ok: true, result: { message_id: 321 } }; },
    async text() { return ''; },
  };
}

function notifyItemKeys(DATA) {
  return [...DATA.store.keys()].filter((key) => key.startsWith('notify:item:')).sort();
}

async function submit(harness, body) {
  const deferred = [];
  const waitUntilSnapshots = [];
  const waitUntilLedgerSnapshots = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    harness.telegramCalls.push(args);
    return telegramResponse();
  };
  try {
    const response = await worker.fetch(bookingRequest(body), harness.env, {
      waitUntil(promise) {
        waitUntilSnapshots.push(notifyItemKeys(harness.DATA));
        waitUntilLedgerSnapshots.push(
          [...harness.DATA.store.keys()].filter((key) => key.startsWith('notify:')).sort(),
        );
        deferred.push(Promise.resolve(promise));
      },
    });
    await Promise.allSettled(deferred);
    return { response, waitUntilSnapshots, waitUntilLedgerSnapshots };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('accepted booking persists its exact source key before both owner notification intents', async () => {
  const harness = createHarness();
  const submitted = payload();

  const { response, waitUntilSnapshots } = await submit(harness, submitted);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const bookingKeys = [...harness.DATA.store.keys()].filter((key) => key.startsWith('booking:'));
  assert.equal(bookingKeys.length, 1);
  assert.match(bookingKeys[0], /^booking:\d{16}:\d+-[0-9a-f]{8}$/);
  const booking = JSON.parse(harness.DATA.store.get(bookingKeys[0]));
  const itemKeys = notifyItemKeys(harness.DATA);
  assert.deepEqual(itemKeys, [
    `notify:item:booking:${booking.id}:email:owner_booking_v1`,
    `notify:item:booking:${booking.id}:telegram:owner_booking_v1`,
  ]);

  const sourcePutIndex = harness.DATA.operations.findIndex(
    ({ operation, key }) => operation === 'put' && key === bookingKeys[0],
  );
  for (const itemKey of itemKeys) {
    const itemPutIndex = harness.DATA.operations.findIndex(
      ({ operation, key }) => operation === 'put' && key === itemKey,
    );
    assert.ok(sourcePutIndex >= 0 && sourcePutIndex < itemPutIndex);
    const itemJson = harness.DATA.store.get(itemKey);
    const item = JSON.parse(itemJson);
    assert.equal(item.entity_id, booking.id);
    assert.equal(item.source_key, bookingKeys[0]);
    assert.equal(item.payload_hash, booking.submission_fingerprint);
    assert.match(item.recipient_fingerprint, /^sha256:[0-9a-f]{64}$/);
    for (const privateValue of [
      submitted.email,
      submitted.phone,
      submitted.message,
      harness.env.TELEGRAM_BOT_TOKEN,
      harness.env.TELEGRAM_CHAT_ID,
      '203.0.113.91',
    ]) {
      assert.equal(itemJson.includes(privateValue), false);
    }
  }

  assert.equal(waitUntilSnapshots.length, 2);
  for (const snapshot of waitUntilSnapshots) assert.deepEqual(snapshot, itemKeys);
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
});

test('sequential duplicate reuses its request id without new intents or delivery attempts', async () => {
  const harness = createHarness();
  const submitted = payload({ submission_id: SUBMISSION_ID });
  const first = await submit(harness, submitted);
  const firstBody = await first.response.json();
  const putsAfterFirst = harness.DATA.operations.filter(({ operation }) => operation === 'put').length;
  const deletesAfterFirst = harness.DATA.operations.filter(({ operation }) => operation === 'delete').length;

  const duplicate = await submit(harness, submitted);
  const duplicateBody = await duplicate.response.json();

  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicateBody.ok, true);
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicateBody.request_id, firstBody.request_id);
  assert.deepEqual(notifyItemKeys(harness.DATA), [
    `notify:item:booking:${SUBMISSION_ID}:email:owner_booking_v1`,
    `notify:item:booking:${SUBMISSION_ID}:telegram:owner_booking_v1`,
  ]);
  assert.equal(harness.DATA.operations.filter(({ operation }) => operation === 'put').length, putsAfterFirst);
  assert.equal(harness.DATA.operations.filter(({ operation }) => operation === 'delete').length, deletesAfterFirst);
  assert.equal(duplicate.waitUntilSnapshots.length, 0);
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
});

test('duplicate retry repairs a missing second-channel intent before delivery and calendar work', async (t) => {
  t.mock.method(console, 'error', () => {});
  const harness = createHarness();
  const submitted = payload({ submission_id: SUBMISSION_ID });
  const emailItemKey = `notify:item:booking:${SUBMISSION_ID}:email:owner_booking_v1`;
  const telegramItemKey = `notify:item:booking:${SUBMISSION_ID}:telegram:owner_booking_v1`;
  harness.DATA.failPutOnce(({ key }) => key === telegramItemKey);

  const first = await submit(harness, submitted);
  const firstBody = await first.response.json();

  assert.equal(first.response.status, 500);
  assert.equal(firstBody.error, 'INTERNAL_ERROR');
  assert.equal(harness.DATA.store.has(`booking:${SUBMISSION_ID}`), true);
  assert.deepEqual(notifyItemKeys(harness.DATA), [emailItemKey]);
  assert.deepEqual(first.waitUntilSnapshots, []);
  assert.equal(harness.DATA.store.has('calendar_events'), false);
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 0);

  const retry = await submit(harness, submitted);
  const retryBody = await retry.response.json();

  assert.equal(retry.response.status, 200);
  assert.equal(retryBody.ok, true);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.request_id, firstBody.request_id);
  assert.deepEqual(notifyItemKeys(harness.DATA), [emailItemKey, telegramItemKey]);
  assert.equal(retry.waitUntilSnapshots.length, 2);
  for (const snapshot of retry.waitUntilSnapshots) {
    assert.deepEqual(snapshot, [emailItemKey, telegramItemKey]);
  }
  const emailItem = JSON.parse(harness.DATA.store.get(emailItemKey));
  const telegramItem = JSON.parse(harness.DATA.store.get(telegramItemKey));
  assert.equal(emailItem.status, 'sent');
  assert.equal(telegramItem.status, 'sent');
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
  const calendar = JSON.parse(harness.DATA.store.get('calendar_events'));
  assert.equal(calendar.events.filter(({ bookingId }) => bookingId === SUBMISSION_ID).length, 1);
  assert.equal(
    harness.DATA.operations.filter(({ operation, key }) => operation === 'put' && key === 'calendar_events').length,
    1,
  );
});

test('duplicate retry repairs a missing due reference before delivery and calendar work', async (t) => {
  t.mock.method(console, 'error', () => {});
  const harness = createHarness();
  const submitted = payload({ submission_id: SUBMISSION_ID });
  const emailItemKey = `notify:item:booking:${SUBMISSION_ID}:email:owner_booking_v1`;
  const telegramItemKey = `notify:item:booking:${SUBMISSION_ID}:telegram:owner_booking_v1`;
  harness.DATA.failPutOnce(({ key, value }) => (
    key.startsWith('notify:due:') && value === telegramItemKey
  ));

  const first = await submit(harness, submitted);
  const firstBody = await first.response.json();

  assert.equal(first.response.status, 500);
  assert.equal(firstBody.error, 'INTERNAL_ERROR');
  assert.deepEqual(notifyItemKeys(harness.DATA), [emailItemKey, telegramItemKey]);
  const orphan = JSON.parse(harness.DATA.store.get(telegramItemKey));
  assert.equal(orphan.status, 'pending');
  assert.equal(harness.DATA.store.has(orphan.due_key), false);
  assert.deepEqual(first.waitUntilSnapshots, []);
  assert.equal(harness.DATA.store.has('calendar_events'), false);

  const retry = await submit(harness, submitted);
  const retryBody = await retry.response.json();

  assert.equal(retry.response.status, 200);
  assert.equal(retryBody.ok, true);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.request_id, firstBody.request_id);
  assert.equal(retry.waitUntilLedgerSnapshots.length, 2);
  for (const snapshot of retry.waitUntilLedgerSnapshots) {
    assert.equal(snapshot.includes(orphan.due_key), true);
  }
  const repaired = JSON.parse(harness.DATA.store.get(telegramItemKey));
  assert.equal(repaired.status, 'sent');
  assert.equal(repaired.due_key, null);
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
  const calendar = JSON.parse(harness.DATA.store.get('calendar_events'));
  assert.equal(calendar.events.filter(({ bookingId }) => bookingId === SUBMISSION_ID).length, 1);
  assert.equal(
    harness.DATA.operations.filter(({ operation, key }) => operation === 'put' && key === 'calendar_events').length,
    1,
  );
});

test('missing EMAIL binding keeps the accepted booking and records the email failure', async () => {
  const harness = createHarness({ emailBinding: false });

  const { response } = await submit(harness, payload({ submission_id: SUBMISSION_ID }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'warning'), false);
  const bookingKey = `booking:${SUBMISSION_ID}`;
  assert.equal(harness.DATA.store.has(bookingKey), true);
  assert.equal(
    harness.DATA.operations.some(({ operation, key }) => operation === 'delete' && key === bookingKey),
    false,
  );
  const emailItem = JSON.parse(harness.DATA.store.get(
    `notify:item:booking:${SUBMISSION_ID}:email:owner_booking_v1`,
  ));
  assert.equal(emailItem.status, 'dead_letter');
  assert.equal(emailItem.attempt_count, 1);
  assert.equal(emailItem.last_error_code, 'email_unconfigured');
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 1);
});

test('invalid booking creates neither a source record nor notification ledger keys', async () => {
  const harness = createHarness();

  const { response, waitUntilSnapshots } = await submit(harness, payload({ email: 'not-an-email' }));

  assert.equal(response.status, 400);
  assert.equal([...harness.DATA.store.keys()].some((key) => key.startsWith('booking:')), false);
  assert.equal([...harness.DATA.store.keys()].some((key) => key.startsWith('notify:')), false);
  assert.deepEqual(waitUntilSnapshots, []);
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 0);
});
