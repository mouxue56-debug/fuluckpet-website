'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const WRANGLER = fs.readFileSync(path.join(ROOT, 'api/wrangler.toml'), 'utf8');
const RELEASE = 'task6-release-test';

let worker;

test.before(async () => {
  ({ default: worker } = await import('../api/worker.js'));
});

class MemoryKV {
  constructor({ failChatList = false } = {}) {
    this.store = new Map();
    this.operations = [];
    this.failChatList = failChatList;
  }

  async get(key, type) {
    this.operations.push({ operation: 'get', key, type });
    const value = this.store.get(key) ?? null;
    if (type !== 'json' || value === null) return value;
    try { return JSON.parse(value); } catch (_error) { return null; }
  }

  async put(key, value, options) {
    this.operations.push({ operation: 'put', key, value, options });
    this.store.set(key, value);
  }

  async delete(key) {
    this.operations.push({ operation: 'delete', key });
    this.store.delete(key);
  }

  async list({ prefix = '', cursor = '', limit = 1_000 } = {}) {
    this.operations.push({ operation: 'list', prefix, cursor, limit });
    if (this.failChatList && prefix === 'chat:log:') {
      this.failChatList = false;
      throw new Error('synthetic chat scanner failure with private@example.test');
    }
    const names = [...this.store.keys()].filter((key) => key.startsWith(prefix)).sort();
    return { keys: names.map((name) => ({ name })), list_complete: true };
  }
}

function configuredEnv(DATA = new MemoryKV()) {
  return {
    DATA,
    RELEASE_SHA: RELEASE,
    EMAIL: {
      async send() { throw new Error('health/scheduled fixture must not send'); },
    },
    TELEGRAM_BOT_TOKEN: 'private-telegram-token',
    TELEGRAM_CHAT_ID: 'private-chat-id',
  };
}

test('Wrangler has one restricted EMAIL binding and exactly one five-minute cron', () => {
  assert.equal((WRANGLER.match(/^\[\[send_email\]\]$/gm) || []).length, 1);
  assert.match(WRANGLER, /^name\s*=\s*"EMAIL"$/m);
  assert.match(WRANGLER, /^destination_address\s*=\s*"mouxue56@gmail\.com"$/m);
  assert.equal((WRANGLER.match(/^\[triggers\]$/gm) || []).length, 1);
  assert.match(WRANGLER, /^crons\s*=\s*\["\*\/5 \* \* \* \*"\]$/m);
});

test('notification health is read-only and exposes only release plus three booleans', async () => {
  const touched = [];
  const DATA = new Proxy({}, {
    get(_target, property) {
      touched.push(String(property));
      throw new Error('health must not touch KV');
    },
  });
  let emailSends = 0;
  const env = configuredEnv(DATA);
  env.EMAIL.send = async () => { emailSends += 1; };

  const response = await worker.fetch(
    new Request('https://fuluckpet.com/api/notification-health'),
    env,
    { waitUntil() { throw new Error('health must not schedule work'); } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Fuluck-Release'), RELEASE);
  assert.deepEqual(Object.keys(body).sort(), [
    'cron_version', 'email_binding', 'release', 'telegram_config',
  ]);
  assert.deepEqual(body, {
    release: RELEASE,
    email_binding: true,
    telegram_config: true,
    cron_version: true,
  });
  assert.deepEqual(touched, []);
  assert.equal(emailSends, 0);
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'mouxue56@gmail.com', 'private-telegram-token', 'private-chat-id',
    'count', 'customer', 'provider', 'message_id',
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test('scheduled registers exactly one promise and runs repair before due reconciliation and daily summary', async () => {
  const DATA = new MemoryKV();
  const waits = [];
  const scheduledTime = Date.parse('2026-08-16T00:15:00.000Z');

  await worker.scheduled({ scheduledTime }, configuredEnv(DATA), {
    waitUntil(promise) { waits.push(Promise.resolve(promise)); },
  });
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  const prefixes = DATA.operations
    .filter(({ operation }) => operation === 'list')
    .map(({ prefix }) => prefix);
  assert.deepEqual(prefixes.slice(0, 4), [
    'chat:log:',
    'booking:',
    'notify:due:',
    'notify:daily:2026-08-15:',
  ]);
});

test('a chat repair fault cannot suppress booking scan, due reconciliation, or daily summary', async () => {
  const DATA = new MemoryKV({ failChatList: true });
  const waits = [];

  await worker.scheduled(
    { scheduledTime: Date.parse('2026-08-16T00:20:00.000Z') },
    configuredEnv(DATA),
    { waitUntil(promise) { waits.push(Promise.resolve(promise)); } },
  );
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  const prefixes = DATA.operations
    .filter(({ operation }) => operation === 'list')
    .map(({ prefix }) => prefix);
  assert.deepEqual(prefixes.slice(0, 4), [
    'chat:log:',
    'booking:',
    'notify:due:',
    'notify:daily:2026-08-15:',
  ]);
  assert.equal(DATA.store.has('notify:summary:2026-08-15'), true);
});
