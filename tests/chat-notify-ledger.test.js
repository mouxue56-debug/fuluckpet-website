'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

const ORIGIN = 'https://fuluckpet.com';
const NOW_MS = 1_900_000_000_000;
const SID = 'chat-session-1234567890';
const SESSION_REF = createHash('sha256').update(SID).digest('hex');
const ROUND_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ROUND_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_KEY = `chat:log:${SESSION_REF}:${NOW_MS}:${ROUND_ID}`;

let worker;
let consoleErrors;
let reconcileDueNotifications;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
  ({ reconcileDueNotifications } = await import('../api/notify.js'));
});

test.beforeEach((t) => {
  consoleErrors = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', (...args) => {
    consoleErrors.push(args.map((value) => String(value)).join(' '));
  });
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

function chatRequest(question, sessionId = SID) {
  return new Request('https://fuluckpet.com/api/chat', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.52',
    },
    body: JSON.stringify({
      session_id: sessionId,
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

function createHarness({
  answer = 'AI answer marker',
  providerFails = false,
  emailFails = false,
  roundTokens = [ROUND_ID, SECOND_ROUND_ID],
} = {}) {
  const DATA = new MemoryKV();
  const emailCalls = [];
  const telegramCalls = [];
  const providerCalls = [];
  let roundTokenIndex = 0;
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
  return {
    DATA,
    emailCalls,
    env,
    fetchImpl,
    nextRoundToken() {
      const token = roundTokens[roundTokenIndex];
      roundTokenIndex += 1;
      if (!token) throw new Error('test round token sequence exhausted');
      return token;
    },
    providerCalls,
    telegramCalls,
  };
}

function notifyItemKeys(DATA) {
  return [...DATA.store.keys()].filter((key) => key.startsWith('notify:item:')).sort();
}

function chatSourceKeys(DATA) {
  return [...DATA.store.keys()].filter((key) => key.startsWith('chat:log:')).sort();
}

async function submit(harness, question, { sessionId = SID } = {}) {
  const deferred = [];
  const waitUntilSnapshots = [];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalRandomUUID = globalThis.crypto.randomUUID;
  globalThis.fetch = harness.fetchImpl;
  Date.now = () => NOW_MS;
  globalThis.crypto.randomUUID = () => harness.nextRoundToken();
  try {
    const response = await worker.fetch(chatRequest(question, sessionId), harness.env, {
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
    globalThis.crypto.randomUUID = originalRandomUUID;
  }
}

async function submitConcurrently(harness, questions, { sessionId = SID } = {}) {
  const deferred = [];
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalRandomUUID = globalThis.crypto.randomUUID;
  globalThis.fetch = harness.fetchImpl;
  Date.now = () => NOW_MS;
  globalThis.crypto.randomUUID = () => harness.nextRoundToken();
  try {
    const responses = await Promise.all(questions.map((question) => worker.fetch(
      chatRequest(question, sessionId),
      harness.env,
      { waitUntil(promise) { deferred.push(Promise.resolve(promise)); } },
    )));
    await Promise.allSettled(deferred);
    return responses;
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    globalThis.crypto.randomUUID = originalRandomUUID;
  }
}

test('same session and millisecond sequential rounds keep distinct sources and notification pairs', async () => {
  const harness = createHarness();

  const first = await submit(harness, 'Sequential round one');
  const second = await submit(harness, 'Sequential round two');

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(chatSourceKeys(harness.DATA).length, 2);
  assert.equal(notifyItemKeys(harness.DATA).length, 4);
  assert.equal(harness.emailCalls.length, 2);
  assert.equal(harness.telegramCalls.length, 2);
});

test('same session and millisecond concurrent rounds keep distinct sources and notification pairs', async () => {
  const harness = createHarness();

  const responses = await submitConcurrently(harness, [
    'Concurrent round one',
    'Concurrent round two',
  ]);

  assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
  assert.equal(chatSourceKeys(harness.DATA).length, 2);
  assert.equal(notifyItemKeys(harness.DATA).length, 4);
  assert.equal(harness.emailCalls.length, 2);
  assert.equal(harness.telegramCalls.length, 2);
});

test('same-millisecond contact rounds use distinct lead keys tied to their round identity', async () => {
  const harness = createHarness();

  await submit(harness, 'first-contact@example.test');
  await submit(harness, 'second-contact@example.test');

  const leadKeys = [...harness.DATA.store.keys()].filter((key) => key.startsWith('lead:')).sort();
  assert.equal(leadKeys.length, 2);
  assert.equal(new Set(leadKeys).size, 2);
  assert.equal(harness.emailCalls.length, 2);
  assert.equal(harness.telegramCalls.length, 4);
});

test('hostile session id stays out of every long-lived notification key, value, and error log', async () => {
  const hostileSessionId = 'private-contact@example.test';
  const harness = createHarness();

  const readyResponse = await submit(harness, 'Privacy boundary question: lead@example.test', {
    sessionId: hostileSessionId,
  });
  harness.DATA.failPutTimes(
    ({ key }) => key.startsWith('notify:item:chat:') && key.includes(':telegram:owner_chat_round_v1'),
    10,
  );
  const partialResponse = await submit(harness, 'Second privacy question: other-lead@example.test', {
    sessionId: hostileSessionId,
  });

  assert.equal(readyResponse.response.status, 200);
  assert.equal(partialResponse.response.status, 200);
  const sourceKeys = chatSourceKeys(harness.DATA);
  assert.equal(sourceKeys.length, 2);
  for (const sourceKey of sourceKeys) {
    assert.equal(sourceKey.includes(hostileSessionId), false);
    assert.equal(JSON.parse(harness.DATA.store.get(sourceKey)).sid, hostileSessionId);
  }
  for (const [key, value] of harness.DATA.store.entries()) {
    assert.equal(key.includes(hostileSessionId), false, key);
    if (!key.startsWith('chat:log:')) assert.equal(String(value).includes(hostileSessionId), false, key);
  }
  for (const { options } of harness.telegramCalls) {
    assert.equal(String(options.body).includes(hostileSessionId), false);
  }
  assert.equal(consoleErrors.some((line) => line.includes(hostileSessionId)), false);
});

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
  const source = JSON.parse(harness.DATA.store.get(SOURCE_KEY));
  const expectedPayloadHash = `sha256:${createHash('sha256').update(JSON.stringify({
    ts: NOW_MS,
    sid: SID,
    provider: 'mayuki-grok-4.3',
    user: question,
    assistant: answer,
  })).digest('hex')}`;
  assert.deepEqual(source.notification, {
    notification_status: 'pending',
    version: 1,
    round_id: ROUND_ID,
    template: 'owner_chat_round_v1',
    channels: ['email', 'telegram'],
    source_ts: NOW_MS,
    payload_hash: expectedPayloadHash,
    payload_hash_rule: 'sha256:json-v1:[ts,sid,provider,user,assistant]',
  });

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
    assert.equal(item.payload_hash, expectedPayloadHash);
    assert.equal(
      item.group_ready_key,
      `notify:ready:chat:${ROUND_ID}:owner_chat_round_v1`,
    );
    assert.match(item.recipient_fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal(itemJson.includes('Question marker'), false);
    assert.equal(itemJson.includes('Answer marker'), false);
  }
  assert.equal(
    harness.DATA.store.has(`notify:ready:chat:${ROUND_ID}:owner_chat_round_v1`),
    true,
  );

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
    notification_status: 'pending',
    version: 1,
    round_id: ROUND_ID,
    template: 'owner_chat_round_v1',
    channels: ['email', 'telegram'],
    source_ts: NOW_MS,
    payload_hash: `sha256:${createHash('sha256').update(JSON.stringify({
      ts: NOW_MS,
      sid: SID,
      provider: 'mayuki-grok-4.3',
      user: 'Keep this completed answer recoverable',
      assistant: 'AI answer marker',
    })).digest('hex')}`,
    payload_hash_rule: 'sha256:json-v1:[ts,sid,provider,user,assistant]',
  });
  const listed = await harness.DATA.list({ prefix: 'chat:log:' });
  assert.deepEqual(listed.keys, [{ name: SOURCE_KEY }]);
  assert.equal(harness.emailCalls.length, 0);
  assert.equal(harness.telegramCalls.length, 0);

  await reconcileDueNotifications(harness.env, NOW_MS, { fetchImpl: harness.fetchImpl });
  assert.equal(harness.emailCalls.length, 0, 'partial email due must remain quarantined');
  assert.equal(harness.telegramCalls.length, 0);
});
