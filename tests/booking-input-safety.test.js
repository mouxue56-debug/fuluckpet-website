'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

function harness() {
  const reads = [];
  const puts = [];
  return {
    reads,
    puts,
    env: {
      DATA: {
        async get(key) { reads.push(key); return null; },
        async put(key, value, options) { puts.push({ key, value, options }); },
      },
    },
    ctx: { waitUntil() {} },
  };
}

function request(body, headers = {}) {
  return new Request('https://fuluckpet.com/api/booking', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });
}

test('booking requires JSON before parsing or persistence', async () => {
  const { env, ctx, reads, puts } = harness();
  const response = await worker.fetch(request('{}', { 'Content-Type': 'text/plain' }), env, ctx);
  assert.equal(response.status, 415);
  assert.deepEqual(reads, []);
  assert.deepEqual(puts, []);
});

test('booking rejects declared and streamed oversized payloads before persistence', async () => {
  const declared = harness();
  const declaredResponse = await worker.fetch(request('{}', {
    'Content-Length': '40000',
  }), declared.env, declared.ctx);
  assert.equal(declaredResponse.status, 413);
  assert.deepEqual(declared.puts, []);

  const streamed = harness();
  const largeRequest = request(JSON.stringify({ note: 'x'.repeat(40_000) }));
  assert.equal(largeRequest.headers.get('content-length'), null);
  const streamedResponse = await worker.fetch(largeRequest, streamed.env, streamed.ctx);
  assert.equal(streamedResponse.status, 413);
  assert.deepEqual(streamed.puts, []);
});

test('malformed bounded booking JSON stays a 400 without persistence', async () => {
  const { env, ctx, puts } = harness();
  const response = await worker.fetch(request('{'), env, ctx);
  assert.equal(response.status, 400);
  assert.deepEqual(puts, []);
});
