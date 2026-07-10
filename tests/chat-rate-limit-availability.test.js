'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const SITE_ORIGIN = 'https://fuluckpet.com';
let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

test('chat preserves its availability policy when only the shared IP-throttle KV operation fails', async () => {
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async (url) => {
    assert.match(String(url), /relay\.example\.test\/v1\/chat\/completions$/);
    providerCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Available through the existing chat policy.' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const puts = [];
  const DATA = {
    async get(key) {
      if (key.startsWith('chat:iprl:')) throw new Error('IP throttle KV read unavailable');
      return null;
    },
    async put(key, value, options) {
      puts.push({ key, value, options });
    },
  };

  try {
    const response = await worker.fetch(new Request('https://fuluckpet.com/api/chat', {
      method: 'POST',
      headers: {
        Origin: SITE_ORIGIN,
        'CF-Connecting-IP': '203.0.113.44',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'chat-availability',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    }), {
      DATA,
      CORS_ORIGIN: SITE_ORIGIN,
      MAYUKI_GATEWAY_URL: 'https://relay.example.test',
    }, { waitUntil() {} });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, 'Available through the existing chat policy.');
    assert.equal(providerCalls, 1);
    assert.ok(puts.some((entry) => entry.key === 'chat:ratelimit:chat-availability'));
  } finally {
    global.fetch = originalFetch;
  }
});
