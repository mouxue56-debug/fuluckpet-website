'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let attemptNotifyIntent;
let buildDailyOwnerMessage;
let createNotifyIntent;
let ensureNotifyIntent;
let ensureDailyReconcileSummary;
let markNotifyFailure;
let markNotifyGroupReady;
let markNotifySent;
let notifyDueKey;
let notifyGroupReadyKey;
let notifyItemKey;
let readNotifyItem;
let reconcileDueNotifications;

test.before(async () => {
  ({
    attemptNotifyIntent,
    buildDailyOwnerMessage,
    createNotifyIntent,
    ensureNotifyIntent,
    ensureDailyReconcileSummary,
    markNotifyFailure,
    markNotifyGroupReady,
    markNotifySent,
    notifyDueKey,
    notifyGroupReadyKey,
    notifyItemKey,
    readNotifyItem,
    reconcileDueNotifications,
  } = await import('../api/notify.js'));
});

class MemoryKV {
  constructor({ pageSize = Infinity } = {}) {
    this.store = new Map();
    this.operations = [];
    this.pageSize = pageSize;
    this.rejectedPutKey = null;
  }

  async get(key, type) {
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
    if (key === this.rejectedPutKey) throw new Error('synthetic KV put failure');
    this.store.set(key, value);
  }

  async delete(key) {
    this.operations.push({ operation: 'delete', key });
    this.store.delete(key);
  }

  async list({ prefix = '', cursor = '', limit = 1_000 } = {}) {
    this.operations.push({ operation: 'list', prefix, cursor, limit });
    const allNames = [...this.store.keys()]
      .filter((name) => name.startsWith(prefix) && (!cursor || name > cursor))
      .sort();
    const size = Math.min(limit, this.pageSize);
    const names = allNames.slice(0, size);
    const hasMore = allNames.length > names.length;
    return {
      keys: names.map((name) => ({ name })),
      list_complete: !hasMore,
      cursor: hasMore ? names.at(-1) : undefined,
    };
  }
}

class StaleReadRaceKV extends MemoryKV {
  constructor(itemKey) {
    super();
    this.itemKey = itemKey;
    this.armed = false;
    this.raceReads = 0;
    this.releaseReads = null;
    this.readBarrier = new Promise((resolve) => { this.releaseReads = resolve; });
    this.releaseRetryPut = null;
    this.sentPut = new Promise((resolve) => { this.releaseRetryPut = resolve; });
  }

  arm() {
    this.armed = true;
  }

  async get(key, type) {
    const snapshot = await super.get(key, type);
    if (this.armed && key === this.itemKey && type === 'json' && this.raceReads < 2) {
      this.raceReads += 1;
      if (this.raceReads === 2) this.releaseReads();
      await this.readBarrier;
    }
    return snapshot;
  }

  async put(key, value, options) {
    if (key === this.itemKey) {
      const status = JSON.parse(value).status;
      if (status === 'retry') await this.sentPut;
      await super.put(key, value, options);
      if (status === 'sent') this.releaseRetryPut();
      return;
    }
    await super.put(key, value, options);
  }
}

function createEnv(options) {
  const DATA = new MemoryKV(options);
  const emailCalls = [];
  return {
    DATA,
    emailCalls,
    bindings: {
      DATA,
      EMAIL: {
        async send(payload) {
          emailCalls.push(payload);
          return { id: `email-${emailCalls.length}`, status: 200 };
        },
      },
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: '123456',
    },
  };
}

function notificationSpec({
  entityKind = 'booking',
  entityId = 'b-1',
  channel = 'email',
  // Most tests in this file isolate transport/retry state-machine behavior. Use
  // a supported non-group template so those tests cannot bypass the production
  // chat/booking two-channel readiness contract with a forged marker.
  template = 'owner_daily_v1',
  sourceKey = `booking:${entityId}`,
  groupReadyKey,
  payloadHash = `sha256:${entityKind}-${entityId}`,
} = {}) {
  return {
    entityKind,
    entityId,
    channel,
    template,
    sourceKey,
    payloadHash,
    recipientFingerprint: `sha256:owner-${channel}`,
    ...(groupReadyKey ? { groupReadyKey } : {}),
  };
}

function bookingSource(name = 'Synthetic Customer') {
  return {
    name,
    email: 'synthetic@example.test',
    phone: '000-0000-0000',
    preferred_date: '2026-08-20',
    message: 'Synthetic notification test',
  };
}

function chatSource() {
  return {
    ts: 1_900_000_000_000,
    sid: 'private-source-session',
    provider: 'mayuki-grok-4.3',
    user: 'Question',
    assistant: 'Answer',
  };
}

async function putJson(DATA, key, value) {
  await DATA.put(key, JSON.stringify(value));
}

function telegramResponse(status = 200, body = { ok: true, result: { message_id: 101 } }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return status >= 400 ? 'temporary provider failure' : ''; },
  };
}

test('sent and dead-letter notification items are never delivered again', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:00:00.000Z');
  const sentSpec = notificationSpec({ entityId: 'sent-1' });
  await putJson(DATA, sentSpec.sourceKey, bookingSource());
  const sentIntent = await createNotifyIntent(bindings, sentSpec, nowMs);
  await markNotifySent(bindings, sentIntent.itemKey, { providerMessageId: 'already-sent' }, nowMs);

  const deadSpec = notificationSpec({ entityId: 'dead-1' });
  const deadIntent = await createNotifyIntent(bindings, deadSpec, nowMs);
  await attemptNotifyIntent(bindings, deadIntent.itemKey, nowMs, {});
  await putJson(DATA, deadSpec.sourceKey, bookingSource());

  await attemptNotifyIntent(bindings, sentIntent.itemKey, nowMs + 1, {});
  await attemptNotifyIntent(bindings, deadIntent.itemKey, nowMs + 1, {});

  assert.equal(emailCalls.length, 0);
  assert.equal((await readNotifyItem(bindings, sentIntent.itemKey)).status, 'sent');
  assert.equal((await readNotifyItem(bindings, deadIntent.itemKey)).status, 'dead_letter');
});

test('a late retryable failure cannot resurrect a dead-letter item', async () => {
  const { bindings, DATA } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:00:30.000Z');
  const intent = await createNotifyIntent(bindings, notificationSpec(), nowMs);
  await attemptNotifyIntent(bindings, intent.itemKey, nowMs, {});

  const result = await markNotifyFailure(
    bindings,
    intent.itemKey,
    { code: 'late_transport_failure', detail: 'synthetic race loser' },
    nowMs + 1,
  );

  assert.equal(result.status, 'dead_letter');
  assert.equal(result.last_error_code, 'source_missing');
  assert.equal(result.due_key, null);
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('notify:due:')), false);
});

test('a concurrent stale-read failure cannot overwrite a confirmed sent item', async () => {
  const nowMs = Date.parse('2026-08-16T00:00:45.000Z');
  const spec = notificationSpec({ channel: 'telegram', entityId: 'sent-race-1' });
  const itemKey = notifyItemKey(spec);
  const DATA = new StaleReadRaceKV(itemKey);
  const { bindings } = createEnv();
  bindings.DATA = DATA;
  await putJson(DATA, spec.sourceKey, bookingSource());
  await createNotifyIntent(bindings, spec, nowMs);
  DATA.arm();

  await Promise.all([
    markNotifySent(bindings, itemKey, { providerMessageId: 'telegram-confirmed-1' }, nowMs + 1),
    markNotifyFailure(
      bindings,
      itemKey,
      { code: 'telegram_network_error', detail: 'synthetic concurrent failure' },
      nowMs + 2,
    ),
  ]);

  const persisted = await readNotifyItem(bindings, itemKey);
  assert.equal(persisted.status, 'sent');
  assert.equal(persisted.due_key, null);
  assert.deepEqual(persisted.result, { provider_message_id: 'telegram-confirmed-1' });
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('notify:due:')), false);
});

test('authoritative reads, attempts, and reconciliation preserve sent over stale retry state', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:00:50.000Z');
  const spec = notificationSpec({ entityId: 'sent-authoritative-1' });
  await putJson(DATA, spec.sourceKey, bookingSource());
  const intent = await createNotifyIntent(bindings, spec, nowMs);
  const sent = await markNotifySent(
    bindings,
    intent.itemKey,
    { providerMessageId: 'email-confirmed-1' },
    nowMs + 1,
  );
  const staleDueKey = notifyDueKey(nowMs + 2, intent.itemKey);
  const staleRetry = {
    ...intent.item,
    status: 'retry',
    attempt_count: 1,
    updated_at: nowMs + 2,
    next_attempt_ms: nowMs + 2,
    due_key: staleDueKey,
    result: null,
  };

  await putJson(DATA, intent.itemKey, staleRetry);
  await DATA.put(staleDueKey, intent.itemKey);
  const authoritativeRead = await readNotifyItem(bindings, intent.itemKey);
  assert.equal(authoritativeRead.status, 'sent');
  assert.equal(authoritativeRead.due_key, null);
  assert.deepEqual(authoritativeRead.result, sent.result);
  assert.equal(DATA.store.has(staleDueKey), false);

  await putJson(DATA, intent.itemKey, staleRetry);
  await DATA.put(staleDueKey, intent.itemKey);
  const attemptResult = await attemptNotifyIntent(bindings, intent.itemKey, nowMs + 2, {});
  assert.equal(attemptResult.status, 'sent');
  assert.equal(DATA.store.has(staleDueKey), false);
  assert.equal(emailCalls.length, 0);

  await putJson(DATA, intent.itemKey, staleRetry);
  await DATA.put(staleDueKey, intent.itemKey);
  const reconcileResult = await reconcileDueNotifications(bindings, nowMs + 2, {});
  assert.deepEqual(reconcileResult, { processed: 0, attempted: 0, stale_deleted: 1 });
  assert.equal(DATA.store.has(staleDueKey), false);
  assert.equal(emailCalls.length, 0);
});

test('a missing source dead-letters the item with source_missing and removes its due key', async () => {
  const { bindings, DATA } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:01:00.000Z');
  const intent = await createNotifyIntent(bindings, notificationSpec(), nowMs);

  const result = await attemptNotifyIntent(bindings, intent.itemKey, nowMs, {});

  assert.equal(result.status, 'dead_letter');
  assert.equal(result.last_error_code, 'source_missing');
  assert.deepEqual(result.last_error, { code: 'source_missing', detail: null });
  assert.equal(result.attempt_count, 0);
  assert.equal(result.due_key, null);
  assert.equal(DATA.store.has(intent.dueKey), false);
});

test('the first retryable failure schedules attempt one exactly five minutes later', async () => {
  const { bindings, DATA } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:02:00.000Z');
  const spec = notificationSpec({ channel: 'telegram' });
  await putJson(DATA, spec.sourceKey, bookingSource());
  const intent = await createNotifyIntent(bindings, spec, nowMs);
  DATA.operations.length = 0;

  const result = await attemptNotifyIntent(
    bindings,
    intent.itemKey,
    nowMs,
    { fetchImpl: async () => telegramResponse(500) },
  );

  assert.equal(result.status, 'retry');
  assert.equal(result.attempt_count, 1);
  assert.equal(result.next_attempt_ms, nowMs + 300_000);
  assert.equal(result.due_key, notifyDueKey(nowMs + 300_000, intent.itemKey));

  const oldDeleteIndex = DATA.operations.findIndex(
    ({ operation, key }) => operation === 'delete' && key === intent.dueKey,
  );
  const itemPutIndex = DATA.operations.findIndex(
    ({ operation, key }) => operation === 'put' && key === intent.itemKey,
  );
  const newDuePutIndex = DATA.operations.findIndex(
    ({ operation, key }) => operation === 'put' && key === result.due_key,
  );
  assert.ok(itemPutIndex >= 0 && itemPutIndex < oldDeleteIndex);
  assert.ok(newDuePutIndex >= 0 && newDuePutIndex < oldDeleteIndex);
});

test('a failed new-due write leaves the old pending schedule recoverable', async () => {
  const { bindings, DATA } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:02:30.000Z');
  const spec = notificationSpec({ channel: 'telegram' });
  await putJson(DATA, spec.sourceKey, bookingSource());
  const intent = await createNotifyIntent(bindings, spec, nowMs);
  DATA.rejectedPutKey = notifyDueKey(nowMs + 300_000, intent.itemKey);

  await assert.rejects(
    attemptNotifyIntent(
      bindings,
      intent.itemKey,
      nowMs,
      { fetchImpl: async () => telegramResponse(500) },
    ),
    /synthetic KV put failure/,
  );

  const persisted = await readNotifyItem(bindings, intent.itemKey);
  assert.equal(persisted.status, 'pending');
  assert.equal(persisted.due_key, intent.dueKey);
  assert.equal(DATA.store.has(intent.dueKey), true);
});

test('attempts two through four use exact delays and the fifth failure is terminal', async () => {
  const { bindings, DATA } = createEnv();
  const createdAt = Date.parse('2026-08-16T00:03:00.000Z');
  const spec = notificationSpec({ channel: 'telegram' });
  await putJson(DATA, spec.sourceKey, bookingSource());
  const intent = await createNotifyIntent(bindings, spec, createdAt);
  let nowMs = createdAt;
  const expectedDelays = [300_000, 1_800_000, 21_600_000, 86_400_000];

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await attemptNotifyIntent(
      bindings,
      intent.itemKey,
      nowMs,
      { fetchImpl: async () => telegramResponse(500) },
    );
    assert.equal(result.status, 'retry');
    assert.equal(result.attempt_count, attempt);
    assert.equal(result.next_attempt_ms, nowMs + expectedDelays[attempt - 1]);
    nowMs = result.next_attempt_ms;
  }

  const terminal = await attemptNotifyIntent(
    bindings,
    intent.itemKey,
    nowMs,
    { fetchImpl: async () => telegramResponse(500) },
  );
  assert.equal(terminal.status, 'failed');
  assert.equal(terminal.attempt_count, 5);
  assert.equal(terminal.next_attempt_ms, null);
  assert.equal(terminal.due_key, null);
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('notify:due:')), false);
});

test('reconciliation deletes stale due references without delivering their items', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:04:00.000Z');
  const spec = notificationSpec();
  await putJson(DATA, spec.sourceKey, bookingSource());
  const intent = await createNotifyIntent(bindings, spec, nowMs + 60_000);
  const staleDueKey = notifyDueKey(nowMs, intent.itemKey);
  await DATA.put(staleDueKey, intent.itemKey);
  const missingItemDueKey = notifyDueKey(nowMs, 'notify:item:booking:missing:email:owner_booking_v1');
  await DATA.put(missingItemDueKey, 'notify:item:booking:missing:email:owner_booking_v1');

  const result = await reconcileDueNotifications(bindings, nowMs, {});

  assert.equal(result.processed, 2);
  assert.equal(result.attempted, 0);
  assert.equal(result.stale_deleted, 2);
  assert.equal(DATA.store.has(staleDueKey), false);
  assert.equal(DATA.store.has(missingItemDueKey), false);
  assert.equal(DATA.store.has(intent.dueKey), true);
  assert.equal(emailCalls.length, 0);
});

test('email success and Telegram failure leave independent item states', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:05:00.000Z');
  const sourceKey = 'booking:dual-1';
  await putJson(DATA, sourceKey, bookingSource('Dual Channel'));
  const emailIntent = await createNotifyIntent(bindings, notificationSpec({ entityId: 'dual-1', sourceKey }), nowMs);
  const telegramIntent = await createNotifyIntent(bindings, notificationSpec({
    entityId: 'dual-1',
    sourceKey,
    channel: 'telegram',
  }), nowMs);
  let telegramCalls = 0;

  await reconcileDueNotifications(bindings, nowMs, {
    fetchImpl: async () => {
      telegramCalls += 1;
      return telegramResponse(500);
    },
  });

  const emailItem = await readNotifyItem(bindings, emailIntent.itemKey);
  const telegramItem = await readNotifyItem(bindings, telegramIntent.itemKey);
  assert.equal(emailCalls.length, 1);
  assert.equal(telegramCalls, 1);
  assert.equal(emailItem.status, 'sent');
  assert.deepEqual(emailItem.result, { provider_message_id: 'email-1' });
  assert.equal(telegramItem.status, 'retry');
  assert.equal(telegramItem.attempt_count, 1);
});

test('Cloudflare Email E_* failures enter permanent or retry state without persisted customer detail', async (t) => {
  for (const fixture of [
    { code: 'E_VALIDATION_ERROR', wantStatus: 'dead_letter', wantAttempt: 1 },
    { code: 'E_RATE_LIMIT_EXCEEDED', wantStatus: 'retry', wantAttempt: 1 },
  ]) {
    await t.test(fixture.code, async () => {
      const { bindings, DATA } = createEnv();
      const nowMs = Date.parse('2026-08-16T00:05:10.000Z');
      const spec = notificationSpec({ entityId: `email-${fixture.code.toLowerCase()}` });
      await putJson(DATA, spec.sourceKey, bookingSource('Private Customer Name'));
      bindings.EMAIL.send = async () => {
        throw Object.assign(
          new Error('Private Customer Name private@example.test private message'.repeat(20)),
          { code: fixture.code },
        );
      };
      const intent = await createNotifyIntent(bindings, spec, nowMs);

      const result = await attemptNotifyIntent(bindings, intent.itemKey, nowMs, {});

      assert.equal(result.status, fixture.wantStatus);
      assert.equal(result.attempt_count, fixture.wantAttempt);
      assert.equal(result.last_error_code, fixture.code);
      const serialized = DATA.store.get(intent.itemKey);
      assert.equal(serialized.includes('Private Customer Name'), false);
      assert.equal(serialized.includes('private@example.test'), false);
      assert.equal(serialized.includes('private message'), false);
    });
  }
});

test('chat due items stay quarantined until Task 6 marks the complete group ready', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const nowMs = Date.parse('2026-08-16T00:05:30.000Z');
  const entityId = '00000000-0000-4000-8000-000000000099';
  const sourceKey = 'chat:log:opaque-session:1900000000000:opaque-round';
  const payloadHash = 'sha256:frozen-chat-payload';
  const template = 'owner_chat_round_v1';
  const groupSpec = {
    entityKind: 'chat',
    entityId,
    template,
    sourceKey,
    payloadHash,
    channels: ['email', 'telegram'],
  };
  const groupReadyKey = notifyGroupReadyKey(groupSpec);
  await putJson(DATA, sourceKey, chatSource());
  const emailIntent = await createNotifyIntent(bindings, notificationSpec({
    entityKind: 'chat',
    entityId,
    channel: 'email',
    template,
    sourceKey,
    groupReadyKey,
    payloadHash,
  }), nowMs);

  await reconcileDueNotifications(bindings, nowMs, {});
  assert.equal(emailCalls.length, 0);
  assert.equal((await readNotifyItem(bindings, emailIntent.itemKey)).status, 'pending');
  await assert.rejects(
    markNotifyGroupReady(bindings, groupSpec, nowMs),
    /both notification channels must be durable/,
  );

  const telegramIntent = await createNotifyIntent(bindings, {
    ...notificationSpec({
      entityKind: 'chat',
      entityId,
      channel: 'telegram',
      template,
      sourceKey,
      groupReadyKey,
      payloadHash,
    }),
  }, nowMs);
  await ensureNotifyIntent(bindings, notificationSpec({
    entityKind: 'chat',
    entityId,
    channel: 'email',
    template,
    sourceKey,
    groupReadyKey,
    payloadHash,
  }), nowMs);
  await markNotifyGroupReady(bindings, groupSpec, nowMs);
  let telegramCalls = 0;

  await reconcileDueNotifications(bindings, nowMs, {
    fetchImpl: async () => {
      telegramCalls += 1;
      return telegramResponse();
    },
  });

  assert.equal(emailCalls.length, 1);
  assert.equal(telegramCalls, 1);
  assert.equal((await readNotifyItem(bindings, emailIntent.itemKey)).status, 'sent');
  assert.equal((await readNotifyItem(bindings, telegramIntent.itemKey)).status, 'sent');
});

test('one hundred quarantined chat items cannot consume the booking delivery budget', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const chatDueMs = Date.parse('2026-08-16T00:05:00.000Z');
  const bookingDueMs = chatDueMs + 1_000;

  for (let index = 0; index < 100; index += 1) {
    const entityId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const sourceKey = `chat:log:opaque-session:${chatDueMs}:${entityId}`;
    const template = 'owner_chat_round_v1';
    const groupSpec = {
      entityKind: 'chat',
      entityId,
      template,
      sourceKey,
      payloadHash: `sha256:frozen-chat-payload-${index}`,
      channels: ['email', 'telegram'],
    };
    await putJson(DATA, sourceKey, chatSource());
    await createNotifyIntent(bindings, notificationSpec({
      ...groupSpec,
      channel: 'email',
      groupReadyKey: notifyGroupReadyKey(groupSpec),
    }), chatDueMs);
  }

  const bookingId = '9005000000000000-66666666666666666666666666666666';
  const bookingSourceKey = `booking:${bookingId}`;
  await putJson(DATA, bookingSourceKey, bookingSource('Booking Must Not Starve'));
  const bookingGroup = {
    entityKind: 'booking',
    entityId: bookingId,
    template: 'owner_booking_v1',
    sourceKey: bookingSourceKey,
    payloadHash: 'sha256:frozen-booking-payload',
    channels: ['email', 'telegram'],
  };
  const bookingReadyKey = notifyGroupReadyKey(bookingGroup);
  const bookingIntents = {};
  for (const channel of ['email', 'telegram']) {
    bookingIntents[channel] = await createNotifyIntent(bindings, notificationSpec({
      ...bookingGroup,
      channel,
      groupReadyKey: bookingReadyKey,
    }), bookingDueMs);
  }
  await markNotifyGroupReady(bindings, bookingGroup, bookingDueMs);
  let telegramCalls = 0;

  const result = await reconcileDueNotifications(bindings, bookingDueMs, {
    fetchImpl: async () => {
      telegramCalls += 1;
      return telegramResponse();
    },
  });

  assert.equal(emailCalls.length, 1);
  assert.equal(telegramCalls, 1);
  assert.equal((await readNotifyItem(bindings, bookingIntents.email.itemKey)).status, 'sent');
  assert.equal((await readNotifyItem(bindings, bookingIntents.telegram.itemKey)).status, 'sent');
  assert.equal(result.processed, 2);
  assert.equal(result.attempted, 2);
  assert.equal([...DATA.store.keys()].filter((key) => key.startsWith('notify:due:')).length, 0);
  assert.equal(
    [...DATA.store.values()].filter((value) => {
      try {
        return JSON.parse(value)?.template === 'owner_chat_round_v1';
      } catch (_error) {
        return false;
      }
    }).length,
    100,
    'quarantine keeps every durable chat item recoverable for Task 6',
  );
});

test('one hundred failed or dead-letter stale due keys cannot starve a later active notification', async () => {
  const { bindings, DATA, emailCalls } = createEnv();
  const terminalDueMs = Date.parse('2026-08-16T00:05:40.000Z');
  const activeDueMs = terminalDueMs + 1_000;

  for (let index = 0; index < 100; index += 1) {
    const spec = notificationSpec({ entityId: `terminal-${String(index).padStart(3, '0')}` });
    const intent = await createNotifyIntent(bindings, spec, terminalDueMs);
    await putJson(DATA, intent.itemKey, {
      ...intent.item,
      status: index % 2 === 0 ? 'failed' : 'dead_letter',
      next_attempt_ms: terminalDueMs,
      due_key: intent.dueKey,
    });
  }

  const activeSpec = notificationSpec({ entityId: 'active-after-terminal-stale-due' });
  await putJson(DATA, activeSpec.sourceKey, bookingSource('Active After Terminal'));
  const active = await createNotifyIntent(bindings, activeSpec, activeDueMs);

  const result = await reconcileDueNotifications(bindings, activeDueMs, {});

  assert.equal(emailCalls.length, 1);
  assert.equal((await readNotifyItem(bindings, active.itemKey)).status, 'sent');
  assert.deepEqual(result, { processed: 1, attempted: 1, stale_deleted: 100 });
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('notify:due:')), false);
  for (let index = 0; index < 100; index += 1) {
    const item = await readNotifyItem(
      bindings,
      notifyItemKey(notificationSpec({ entityId: `terminal-${String(index).padStart(3, '0')}` })),
    );
    assert.equal(item.due_key, null);
    assert.equal(item.next_attempt_ms, null);
  }
});

test('a scheduled reconciliation paginates due keys and processes at most 100 entries', async () => {
  const { bindings, DATA } = createEnv({ pageSize: 60 });
  const nowMs = Date.parse('2026-08-16T00:06:00.000Z');
  for (let index = 0; index < 105; index += 1) {
    const itemKey = `notify:item:booking:missing-${String(index).padStart(3, '0')}:email:owner_booking_v1`;
    await DATA.put(notifyDueKey(nowMs, itemKey), itemKey);
  }
  DATA.operations.length = 0;

  const result = await reconcileDueNotifications(bindings, nowMs, {});

  assert.equal(result.processed, 100);
  assert.equal(result.stale_deleted, 100);
  assert.equal([...DATA.store.keys()].filter((key) => key.startsWith('notify:due:')).length, 5);
  const listCalls = DATA.operations.filter(({ operation }) => operation === 'list');
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0].limit, 1_000);
  assert.equal(listCalls[0].cursor, '');
  assert.ok(listCalls[1].cursor.startsWith('notify:due:'));
});

test('JST 09:00 creates one prior-day source and two deterministic intents only once', async () => {
  const { bindings, DATA } = createEnv();
  const previousDayMs = Date.parse('2026-08-15T03:00:00.000Z');
  const nowMs = Date.parse('2026-08-16T00:15:00.000Z');
  const sourceKey = 'booking:daily-1';
  await putJson(DATA, sourceKey, bookingSource('Daily Summary'));
  const email = await createNotifyIntent(bindings, notificationSpec({ entityId: 'daily-1', sourceKey }), previousDayMs);
  const telegram = await createNotifyIntent(bindings, notificationSpec({
    entityId: 'daily-1',
    sourceKey,
    channel: 'telegram',
  }), previousDayMs);
  await markNotifySent(bindings, email.itemKey, { providerMessageId: 'email-daily-1' }, previousDayMs + 1);
  const telegramItem = await readNotifyItem(bindings, telegram.itemKey);
  telegramItem.status = 'retry';
  telegramItem.attempt_count = 1;
  await putJson(DATA, telegram.itemKey, telegramItem);

  const first = await ensureDailyReconcileSummary(bindings, nowMs, {});
  const putsAfterFirst = DATA.operations.length;
  const second = await ensureDailyReconcileSummary(bindings, nowMs + 1_000, {});

  const summaryKeys = [...DATA.store.keys()].filter((key) => key.startsWith('notify:summary:'));
  assert.deepEqual(summaryKeys, ['notify:summary:2026-08-15']);
  const source = JSON.parse(DATA.store.get(summaryKeys[0]));
  assert.equal(source.dateJst, '2026-08-15');
  assert.deepEqual(source.counts, {
    total: 2,
    sent: 1,
    sent_unknown: 0,
    pending: 0,
    retry: 1,
    failed: 0,
    dead_letter: 0,
  });
  assert.deepEqual(source.notes, ['email: sent', 'telegram: retry']);
  assert.equal(first.source_created, true);
  assert.deepEqual(first.created_item_keys.sort(), [
    notifyItemKey({ entityKind: 'summary', entityId: '2026-08-15', channel: 'email', template: 'owner_daily_v1' }),
    notifyItemKey({ entityKind: 'summary', entityId: '2026-08-15', channel: 'telegram', template: 'owner_daily_v1' }),
  ].sort());
  assert.equal(second.source_created, false);
  assert.deepEqual(second.created_item_keys, []);
  assert.equal(DATA.operations.length, putsAfterFirst);
});

test('daily summaries treat sent markers as authoritative over stale terminal item copies', async (t) => {
  for (const staleStatus of ['retry', 'failed']) {
    await t.test(staleStatus, async () => {
      const { bindings, DATA } = createEnv();
      const previousDayMs = Date.parse('2026-08-15T04:00:00.000Z');
      const nowMs = Date.parse('2026-08-16T00:20:00.000Z');
      const spec = notificationSpec({ entityId: `daily-stale-${staleStatus}` });
      const intent = await createNotifyIntent(bindings, spec, previousDayMs);
      await markNotifySent(
        bindings,
        intent.itemKey,
        { providerMessageId: `email-${staleStatus}-confirmed` },
        previousDayMs + 1,
      );
      const staleDueKey = notifyDueKey(previousDayMs + 2, intent.itemKey);
      await putJson(DATA, intent.itemKey, {
        ...intent.item,
        status: staleStatus,
        attempt_count: staleStatus === 'retry' ? 1 : 5,
        updated_at: previousDayMs + 2,
        next_attempt_ms: previousDayMs + 2,
        due_key: staleDueKey,
        result: null,
      });
      await DATA.put(staleDueKey, intent.itemKey);

      const result = await ensureDailyReconcileSummary(bindings, nowMs, {});
      const source = JSON.parse(DATA.store.get(result.summary_key));

      assert.deepEqual(source.counts, {
        total: 1,
        sent: 1,
        sent_unknown: 0,
        pending: 0,
        retry: 0,
        failed: 0,
        dead_letter: 0,
      });
      assert.deepEqual(source.notes, ['email: sent']);
      assert.equal(DATA.store.has(staleDueKey), false);
      assert.equal(JSON.parse(DATA.store.get(intent.itemKey)).status, 'sent');
    });
  }
});

test('daily owner messages stay deterministic and bounded for 100 two-hundred-character notes', () => {
  const notes = Array.from({ length: 100 }, (_unused, index) => (
    `${String(index).padStart(3, '0')}:${'"'.repeat(196)}`
  ));
  assert.equal(notes.every((note) => note.length === 200), true);
  const source = {
    dateJst: '2026-08-15',
    summary: '"'.repeat(200),
    notes,
  };

  const first = buildDailyOwnerMessage(source);
  const second = buildDailyOwnerMessage(source);

  assert.deepEqual(first, second);
  assert.ok(first.telegramText.length <= 4_096, `Telegram length was ${first.telegramText.length}`);
  assert.ok(first.text.length <= 2_000, `email text length was ${first.text.length}`);
  assert.ok(first.html.length <= 8_000, `email HTML length was ${first.html.length}`);
});
