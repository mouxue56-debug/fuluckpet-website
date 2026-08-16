'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
const NOW_MS = 1_900_000_000_000;
const SID = 'chat-session-1234567890';
const SOURCE_KEY = `chat:log:${SID}:${NOW_MS}`;
const ROUND_ID = `${SID}:${NOW_MS}`;

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

test.beforeEach((t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
});

class MemoryKV {
  constructor() {
    this.store = new Map();
    this.operations = [];
    this.putFailures = [];
  }

  failPutTimes(predicate, remaining = 1) {
    this.putFailures.push({ predicate, remaining });
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
    const failure = this.putFailures.find(({ predicate, remaining }) => (
      remaining > 0 && predicate({ key, value, options })
    ));
    if (failure) {
      failure.remaining -= 1;
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
        .filter((key) => key.startsWith(prefix))
        .sort()
        .map((name) => ({ name })),
      list_complete: true,
    };
  }
}

function chatRequest(question) {
  return new Request('https://fuluckpet.com/api/chat', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.52',
    },
    body: JSON.stringify({
      session_id: SID,
      messages: [{ role: 'user', content: question }],
    }),
  });
}

function providerResponse(answer) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: answer } }] };
    },
    async text() { return ''; },
  };
}

function providerFailure() {
  return {
    ok: false,
    status: 503,
    async json() { return {}; },
    async text() { return 'provider unavailable'; },
  };
}

function telegramResponse() {
  return {
    ok: true,
    status: 200,
    async json() { return { ok: true, result: { message_id: 321 } }; },
    async text() { return JSON.stringify({ ok: true, result: { message_id: 321 } }); },
  };
}

function createHarness({ answer = 'AI answer marker', providerFails = false, emailFails = false } = {}) {
  const DATA = new MemoryKV();
  const emailCalls = [];
  const telegramCalls = [];
  const providerCalls = [];
  const env = {
    DATA,
    CORS_ORIGIN: ORIGIN,
    MAYUKI_GATEWAY_URL: 'https://mayuki.example.test',
    MAYUKI_GATEWAY_KEY: 'mayuki-test-key',
    TELEGRAM_BOT_TOKEN: 'telegram-test-token',
    TELEGRAM_CHAT_ID: '123456789',
    EMAIL: {
      async send(message) {
        emailCalls.push(message);
        if (emailFails) throw new Error('synthetic email failure');
        return { id: 'cf-email-chat-1', status: 200 };
      },
    },
  };
  const fetchImpl = async (url, options = {}) => {
    if (String(url).startsWith('https://mayuki.example.test/')) {
      providerCalls.push({ url: String(url), options });
      return providerFails ? providerFailure() : providerResponse(answer);
    }
    if (String(url).startsWith('https://api.telegram.org/')) {
      telegramCalls.push({ url: String(url), options });
      return telegramResponse();
    }
    throw new Error(`unexpected fetch URL: ${url}`);
  };
  return { DATA, emailCalls, env, fetchImpl, providerCalls, telegramCalls };
}

function notifyItemKeys(DATA) {
  return [...DATA.store.keys()].filter((key) => key.startsWith('notify:item:')).sort();
}

function chatSourceKeys(DATA) {
  return [...DATA.store.keys()].filter((key) => key.startsWith('chat:log:')).sort();
}

async function submit(harness, question) {
  const deferred = [];
  const waitUntilSnapshots = [];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = harness.fetchImpl;
  Date.now = () => NOW_MS;
  try {
    const response = await worker.fetch(chatRequest(question), harness.env, {
      waitUntil(promise) {
        waitUntilSnapshots.push(notifyItemKeys(harness.DATA));
        deferred.push(Promise.resolve(promise));
      },
    });
    await Promise.allSettled(deferred);
    return { response, deferred, waitUntilSnapshots };
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
}

test('completed AI round durably queues exactly one email and Telegram intent from one source', async () => {
  const question = `Question marker <b>private</b> ${'q'.repeat(700)}`;
  const answer = `Answer marker <script>private</script> ${'a'.repeat(700)}`;
  const harness = createHarness({ answer });

  const { response, waitUntilSnapshots } = await submit(harness, question);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notification_status, 'queued');
  assert.equal(Object.hasOwn(body, 'telegram_status'), false);
  assert.equal(JSON.stringify(body).includes('sent'), false);
  assert.deepEqual(chatSourceKeys(harness.DATA), [SOURCE_KEY]);

  const itemKeys = notifyItemKeys(harness.DATA);
  assert.deepEqual(itemKeys, [
    `notify:item:chat:${ROUND_ID}:email:owner_chat_round_v1`,
    `notify:item:chat:${ROUND_ID}:telegram:owner_chat_round_v1`,
  ]);
  assert.deepEqual(waitUntilSnapshots, [itemKeys]);

  const sourcePutIndex = harness.DATA.operations.findIndex(
    ({ operation, key }) => operation === 'put' && key === SOURCE_KEY,
  );
  for (const itemKey of itemKeys) {
    const itemPutIndex = harness.DATA.operations.findIndex(
      ({ operation, key }) => operation === 'put' && key === itemKey,
    );
    assert.ok(sourcePutIndex >= 0 && sourcePutIndex < itemPutIndex);
    const itemJson = harness.DATA.store.get(itemKey);
    const item = JSON.parse(itemJson);
    assert.equal(item.entity_id, ROUND_ID);
    assert.equal(item.source_key, SOURCE_KEY);
    assert.match(item.payload_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(item.recipient_fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal(itemJson.includes('Question marker'), false);
    assert.equal(itemJson.includes('Answer marker'), false);
  }

  assert.equal(harness.emailCalls.length, 1);
  const [email] = harness.emailCalls;
  assert.match(email.subject, /chat-ses/);
  assert.match(email.text, /Question marker/);
  assert.match(email.text, /Answer marker/);
  assert.equal(email.text.includes(SID), false);
  assert.ok(email.text.length < 1_600, 'email chat body must remain bounded');

  assert.equal(harness.telegramCalls.length, 1);
  const telegramBody = JSON.parse(harness.telegramCalls[0].options.body);
  assert.match(telegramBody.text, /chat-ses/);
  assert.match(telegramBody.text, /Question marker/);
  assert.match(telegramBody.text, /Answer marker/);
  assert.equal(telegramBody.text.includes(SID), false);
  assert.ok(telegramBody.text.length < 1_600, 'Telegram chat body must remain bounded');
});

test('email failure cannot prevent the independent Telegram chat attempt', async () => {
  const harness = createHarness({ emailFails: true });

  const { response, waitUntilSnapshots } = await submit(harness, 'Independent channel question');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notification_status, 'queued');
  assert.equal(waitUntilSnapshots.length, 1);
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
  const emailItem = JSON.parse(harness.DATA.store.get(
    `notify:item:chat:${ROUND_ID}:email:owner_chat_round_v1`,
  ));
  const telegramItem = JSON.parse(harness.DATA.store.get(
    `notify:item:chat:${ROUND_ID}:telegram:owner_chat_round_v1`,
  ));
  assert.equal(emailItem.status, 'retry');
  assert.equal(telegramItem.status, 'sent');
});

test('provider failure before an answer creates no chat source or owner notification', async () => {
  const harness = createHarness({ providerFails: true });

  const { response, deferred } = await submit(harness, 'Provider failure question');

  assert.equal(response.status, 502);
  assert.equal(chatSourceKeys(harness.DATA).length, 0);
  assert.equal(notifyItemKeys(harness.DATA).length, 0);
  assert.equal(deferred.length, 0);
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 0);
});

test('contact round keeps one normal Telegram intent plus the distinct lead alert', async () => {
  const harness = createHarness();

  const { response } = await submit(harness, '連絡先は customer@example.test です');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notification_status, 'queued');
  assert.deepEqual(notifyItemKeys(harness.DATA), [
    `notify:item:chat:${ROUND_ID}:email:owner_chat_round_v1`,
    `notify:item:chat:${ROUND_ID}:telegram:owner_chat_round_v1`,
  ]);
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 2);
  const telegramTexts = harness.telegramCalls.map(({ options }) => JSON.parse(options.body).text);
  assert.equal(telegramTexts.filter((text) => text.includes('新しい会話')).length, 1);
  assert.equal(telegramTexts.filter((text) => text.includes('NEW LEAD')).length, 1);
  assert.equal([...harness.DATA.store.keys()].filter((key) => key.startsWith('lead:')).length, 1);
});

test('one partial intent write failure is repaired before either channel is attempted', async () => {
  const harness = createHarness();
  const telegramItemKey = `notify:item:chat:${ROUND_ID}:telegram:owner_chat_round_v1`;
  harness.DATA.failPutTimes(({ key }) => key === telegramItemKey);

  const { response, waitUntilSnapshots } = await submit(harness, 'Repair this completed round');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notification_status, 'queued');
  const itemKeys = notifyItemKeys(harness.DATA);
  assert.deepEqual(itemKeys, [
    `notify:item:chat:${ROUND_ID}:email:owner_chat_round_v1`,
    telegramItemKey,
  ]);
  assert.deepEqual(waitUntilSnapshots, [itemKeys]);
  assert.equal(
    harness.DATA.operations.filter(({ operation, key, value }) => (
      operation === 'put'
      && key === telegramItemKey
      && JSON.parse(value).status === 'pending'
    )).length,
    2,
  );
  assert.equal(harness.emailCalls.length, 1);
  assert.equal(harness.telegramCalls.length, 1);
});

test('unrepaired intent setup still returns the answer with a discoverable durable source', async () => {
  const harness = createHarness();
  const telegramItemKey = `notify:item:chat:${ROUND_ID}:telegram:owner_chat_round_v1`;
  harness.DATA.failPutTimes(({ key }) => key === telegramItemKey, 10);

  const { response, waitUntilSnapshots } = await submit(harness, 'Keep this completed answer recoverable');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.message, 'AI answer marker');
  assert.equal(body.notification_status, 'queued');
  assert.deepEqual(waitUntilSnapshots, []);
  assert.deepEqual(chatSourceKeys(harness.DATA), [SOURCE_KEY]);
  const source = JSON.parse(harness.DATA.store.get(SOURCE_KEY));
  assert.deepEqual(source.notification, {
    channels: ['email', 'telegram'],
    entity_id: ROUND_ID,
    template: 'owner_chat_round_v1',
  });
  const listed = await harness.DATA.list({ prefix: 'chat:log:' });
  assert.deepEqual(listed.keys, [{ name: SOURCE_KEY }]);
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 0);
});
