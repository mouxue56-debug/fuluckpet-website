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
    this.puts = [];
  }
  async get(key, type) {
    const value = this.store.get(key) ?? null;
    return type === 'json' && value !== null ? JSON.parse(value) : value;
  }
  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.store.set(key, value);
  }
}

function payload(overrides = {}) {
  return {
    submission_id: SUBMISSION_ID,
    name: 'Test Visitor',
    email: 'visitor@example.test',
    phone: '090-1234-5678',
    preferred_date: '2026-08-01',
    preferred_date2: '',
    preferred_time: '14:00',
    visit_method: 'in-person',
    kitten_id: '2607-00585',
    message: 'Looking forward to the visit.',
    ...overrides,
  };
}

function request(body) {
  return new Request('https://fuluckpet.com/api/booking', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.91',
    },
    body: JSON.stringify(body),
  });
}

async function run(DATA, body) {
  const deferred = [];
  const response = await worker.fetch(request(body), {
    DATA,
    CORS_ORIGIN: ORIGIN,
  }, { waitUntil(promise) { deferred.push(Promise.resolve(promise)); } });
  await Promise.allSettled(deferred);
  return response;
}

test('a sequential retry returns the original booking without a second record or calendar event', async () => {
  const DATA = new MemoryKV();
  const first = await run(DATA, payload());
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);

  const retry = await run(DATA, payload());
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.ok, true);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.request_id, firstBody.request_id);

  const bookingKeys = [...DATA.store.keys()].filter((key) => key.startsWith('booking:'));
  assert.deepEqual(bookingKeys, [`booking:${SUBMISSION_ID}`]);
  const calendar = JSON.parse(DATA.store.get('calendar_events'));
  assert.equal(calendar.events.length, 1);
  assert.equal(calendar.events[0].bookingId, SUBMISSION_ID);
});

test('reusing a submission id for different validated data is a conflict', async () => {
  const DATA = new MemoryKV();
  assert.equal((await run(DATA, payload())).status, 200);
  const response = await run(DATA, payload({ message: 'Changed after the first send.' }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'submission_conflict');
  assert.equal([...DATA.store.keys()].filter((key) => key.startsWith('booking:')).length, 1);
});

test('malformed submission ids never persist a booking', async () => {
  const DATA = new MemoryKV();
  const response = await run(DATA, payload({ submission_id: '../reused' }));
  assert.equal(response.status, 400);
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('booking:')), false);
});
