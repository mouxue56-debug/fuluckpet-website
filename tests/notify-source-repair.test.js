'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');

const NOW_MS = Date.parse('2026-08-16T03:00:00.000Z');
const CHAT_HASH_RULE = 'sha256:json-v1:[ts,sid,provider,user,assistant]';
const BOOKING_HASH_RULE = 'sha256:submission-fingerprint-v1';

let attemptNotifyIntent;
let createNotifyIntent;
let ensureDailyReconcileSummary;
let markNotifyFailure;
let markNotifyGroupReady;
let notifyDueKey;
let notifyGroupReadyKey;
let notifyItemKey;
let readNotifyItem;
let reconcileDueNotifications;
let repairBookingNotificationSources;
let repairChatNotificationSources;
let runScheduledNotificationRecovery;

test.before(async () => {
  ({
    attemptNotifyIntent,
    createNotifyIntent,
    ensureDailyReconcileSummary,
    markNotifyFailure,
    markNotifyGroupReady,
    notifyDueKey,
    notifyGroupReadyKey,
    notifyItemKey,
    readNotifyItem,
    reconcileDueNotifications,
    repairBookingNotificationSources,
    repairChatNotificationSources,
    runScheduledNotificationRecovery,
  } = await import('../api/notify.js'));
});

class MemoryKV {
  constructor({ pageSize = 1_000, ghostKeys = [], emptyFirstPageCursor = null } = {}) {
    this.store = new Map();
    this.operations = [];
    this.pageSize = pageSize;
    this.ghostKeys = ghostKeys;
    this.failures = [];
    this.emptyFirstPageCursor = emptyFirstPageCursor;
    this.cursorOffsets = new Map([['', 0]]);
    if (emptyFirstPageCursor) this.cursorOffsets.set(emptyFirstPageCursor, 0);
  }

  failPutTimes(predicate, remaining = 1) {
    this.failures.push({ predicate, remaining });
  }

  async get(key, type) {
    this.operations.push({ operation: 'get', key, type });
    const value = this.store.get(key) ?? null;
    if (type !== 'json' || value === null) return value;
    try { return JSON.parse(value); } catch (_error) { return null; }
  }

  async put(key, value, options) {
    this.operations.push({ operation: 'put', key, value, options });
    const failure = this.failures.find(({ predicate, remaining }) => (
      remaining > 0 && predicate({ key, value, options })
    ));
    if (failure) {
      failure.remaining -= 1;
      throw new Error('synthetic source repair KV failure');
    }
    this.store.set(key, value);
  }

  async delete(key) {
    this.operations.push({ operation: 'delete', key });
    this.store.delete(key);
  }

  async list({ prefix = '', cursor = '', limit = 1_000 } = {}) {
    this.operations.push({ operation: 'list', prefix, cursor, limit });
    if (this.emptyFirstPageCursor && cursor === '') {
      return { keys: [], list_complete: false, cursor: this.emptyFirstPageCursor };
    }
    const offset = this.cursorOffsets.get(cursor) ?? 0;
    const names = [...new Set([...this.store.keys(), ...this.ghostKeys])]
      .filter((name) => name.startsWith(prefix))
      .sort();
    const size = Math.min(limit, this.pageSize);
    const pageNames = names.slice(offset, offset + size);
    const nextOffset = offset + pageNames.length;
    const nextCursor = `c${nextOffset}`;
    this.cursorOffsets.set(nextCursor, nextOffset);
    return {
      keys: pageNames.map((name) => ({ name })),
      list_complete: nextOffset >= names.length,
      cursor: nextOffset < names.length ? nextCursor : undefined,
    };
  }
}

function createEnv(options) {
  const DATA = new MemoryKV(options);
  const emailCalls = [];
  const telegramCalls = [];
  return {
    DATA,
    emailCalls,
    telegramCalls,
    bindings: {
      DATA,
      EMAIL: {
        async send(payload) {
          emailCalls.push(payload);
          return { messageId: `email-${emailCalls.length}` };
        },
      },
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: '123456',
    },
    dependencies: {
      async fetchImpl() {
        telegramCalls.push(true);
        return {
          ok: true,
          status: 200,
          async json() { return { ok: true, result: { message_id: telegramCalls.length } }; },
          async text() { return ''; },
        };
      },
    },
  };
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function chatSource(roundId, { sid = 'private-customer@example.test', validHash = true } = {}) {
  const core = {
    ts: NOW_MS,
    sid,
    provider: 'mayuki-grok-4.3',
    user: 'private customer question',
    assistant: 'bounded assistant answer',
  };
  const payloadHash = sha256(JSON.stringify(core));
  return {
    ...core,
    notification: {
      notification_status: 'pending',
      version: 1,
      round_id: roundId,
      template: 'owner_chat_round_v1',
      channels: ['email', 'telegram'],
      source_ts: NOW_MS,
      payload_hash: validHash ? payloadHash : sha256('mismatch'),
      payload_hash_rule: CHAT_HASH_RULE,
    },
  };
}

function bookingSource(id, { descriptor = true } = {}) {
  const fingerprint = createHash('sha256').update(`booking:${id}`).digest('hex');
  return {
    id,
    created_at: new Date(NOW_MS).toISOString(),
    name: 'Synthetic Customer',
    email: 'synthetic@example.test',
    phone: '090-0000-0000',
    preferred_date: '2026-08-25',
    message: 'private booking note',
    submission_fingerprint: fingerprint,
    ...(descriptor ? {
      notification: {
        notification_status: 'pending',
        version: 1,
        booking_id: id,
        template: 'owner_booking_v1',
        channels: ['email', 'telegram'],
        source_ts: NOW_MS,
        payload_hash: fingerprint,
        payload_hash_rule: BOOKING_HASH_RULE,
      },
    } : {}),
  };
}

function dailyKey(nowMs, itemKey) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
  return `notify:daily:${date}:${encodeURIComponent(itemKey)}`;
}

function chatSpec(roundId, sourceKey, payloadHash, channel) {
  const group = {
    entityKind: 'chat', entityId: roundId, template: 'owner_chat_round_v1',
    sourceKey, payloadHash, channels: ['email', 'telegram'],
  };
  return {
    ...group,
    channel,
    recipientFingerprint: sha256(`owner:${channel}`),
    groupReadyKey: notifyGroupReadyKey(group),
  };
}

test('chat repair restores both channel items, due/daily references, and readiness from the exact listed source', async () => {
  const { bindings, DATA } = createEnv();
  const roundId = '00000000-0000-4000-8000-000000000101';
  const sourceKey = `chat:log:${'a'.repeat(64)}:${NOW_MS}:${roundId}`;
  const source = chatSource(roundId);
  await DATA.put(sourceKey, JSON.stringify(source));

  const emailSpec = chatSpec(roundId, sourceKey, source.notification.payload_hash, 'email');
  const email = await createNotifyIntent(bindings, emailSpec, NOW_MS);
  await DATA.delete(email.dueKey);
  await DATA.delete(dailyKey(NOW_MS, email.itemKey));

  const result = await repairChatNotificationSources(bindings, NOW_MS);
  const telegramKey = notifyItemKey(chatSpec(
    roundId, sourceKey, source.notification.payload_hash, 'telegram',
  ));
  const emailItem = await readNotifyItem(bindings, email.itemKey);
  const telegramItem = await readNotifyItem(bindings, telegramKey);

  assert.equal(result.candidates, 1);
  assert.equal(result.ready, 1);
  assert.equal(DATA.store.get(emailItem.due_key), email.itemKey);
  assert.equal(DATA.store.get(dailyKey(emailItem.created_at, email.itemKey)), email.itemKey);
  assert.equal(DATA.store.get(telegramItem.due_key), telegramKey);
  assert.equal(DATA.store.get(dailyKey(telegramItem.created_at, telegramKey)), telegramKey);
  assert.equal(DATA.store.has(notifyGroupReadyKey(emailSpec)), true);

  for (const [key, value] of DATA.store) {
    if (key !== sourceKey) {
      assert.equal(key.includes(source.sid), false, key);
      assert.equal(String(value).includes(source.sid), false, key);
      assert.equal(String(value).includes(source.user), false, key);
      assert.equal(String(value).includes(source.assistant), false, key);
    }
  }
});

test('chat repair persists opaque pagination progress and a bad or deleted source cannot block a later valid source', async () => {
  const ghostKey = `chat:log:${'0'.repeat(64)}:0000000000000:00000000-0000-4000-8000-000000000000`;
  const { bindings, DATA } = createEnv({ pageSize: 10, ghostKeys: [ghostKey] });
  for (let index = 1; index <= 24; index += 1) {
    const key = `chat:log:${String(index).padStart(64, '0')}:${NOW_MS}:legacy-${index}`;
    await DATA.put(key, JSON.stringify({ legacy: true, private: `legacy-${index}@example.test` }));
  }
  const mismatchedRoundId = '00000000-0000-4000-8000-000000000198';
  const mismatchedKey = `chat:log:${'e'.repeat(64)}:${NOW_MS}:${mismatchedRoundId}`;
  const mismatchedSource = chatSource(mismatchedRoundId);
  mismatchedSource.user = 'changed after the descriptor hash was frozen';
  await DATA.put(mismatchedKey, JSON.stringify(mismatchedSource));
  const roundId = '00000000-0000-4000-8000-000000000199';
  const validKey = `chat:log:${'f'.repeat(64)}:${NOW_MS}:${roundId}`;
  await DATA.put(validKey, JSON.stringify(chatSource(roundId)));

  const first = await repairChatNotificationSources(bindings, NOW_MS);
  assert.equal(first.candidates, 10);
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith(`notify:item:chat:${roundId}:`)), false);
  const cursorKey = 'notify:repair:cursor:chat:v1';
  const cursorState = JSON.parse(DATA.store.get(cursorKey));
  assert.match(cursorState.cursor, /^c[0-9]+$/);
  assert.equal(JSON.stringify(cursorState).includes('legacy-'), false);
  assert.equal(JSON.stringify(cursorState).includes('@example.test'), false);

  await repairChatNotificationSources(bindings, NOW_MS + 1);
  const third = await repairChatNotificationSources(bindings, NOW_MS + 2);
  assert.equal(third.ready, 1);
  assert.equal(DATA.store.has(`notify:ready:chat:${roundId}:owner_chat_round_v1`), true);
  assert.equal(
    [...DATA.store.keys()].some((key) => key.startsWith(`notify:item:chat:${mismatchedRoundId}:`)),
    false,
    'a descriptor whose payload hash no longer matches the source must be skipped',
  );
  const listCalls = DATA.operations.filter(({ operation, prefix }) => operation === 'list' && prefix === 'chat:log:');
  assert.deepEqual(listCalls.slice(0, 3).map(({ cursor }) => cursor), ['', 'c10', 'c20']);
});

test('chat repair persists an arbitrary bounded opaque cursor and advances past an empty page', async () => {
  const opaqueCursor = 'opaque+page/0.v1';
  const { bindings, DATA } = createEnv({ emptyFirstPageCursor: opaqueCursor });
  const roundId = '00000000-0000-4000-8000-000000000197';
  const sourceKey = `chat:log:${'d'.repeat(64)}:${NOW_MS}:${roundId}`;
  await DATA.put(sourceKey, JSON.stringify(chatSource(roundId)));

  const first = await repairChatNotificationSources(bindings, NOW_MS);
  const state = JSON.parse(DATA.store.get('notify:repair:cursor:chat:v1'));
  const second = await repairChatNotificationSources(bindings, NOW_MS + 1);

  assert.equal(first.candidates, 0);
  assert.equal(first.cursor_persisted, true);
  assert.equal(state.cursor, opaqueCursor);
  assert.equal(second.ready, 1);
  assert.equal(DATA.store.has(`notify:ready:chat:${roundId}:owner_chat_round_v1`), true);
  assert.deepEqual(
    DATA.operations
      .filter(({ operation, prefix }) => operation === 'list' && prefix === 'chat:log:')
      .map(({ cursor }) => cursor),
    ['', opaqueCursor],
  );
});

test('one repeated chat item failure is isolated and the next source still becomes ready', async () => {
  const { bindings, DATA } = createEnv();
  const badRound = '00000000-0000-4000-8000-000000000201';
  const goodRound = '00000000-0000-4000-8000-000000000202';
  const badKey = `chat:log:${'1'.repeat(64)}:${NOW_MS}:${badRound}`;
  const goodKey = `chat:log:${'2'.repeat(64)}:${NOW_MS}:${goodRound}`;
  await DATA.put(badKey, JSON.stringify(chatSource(badRound)));
  await DATA.put(goodKey, JSON.stringify(chatSource(goodRound)));
  DATA.failPutTimes(
    ({ key }) => key === `notify:item:chat:${badRound}:telegram:owner_chat_round_v1`,
    20,
  );

  const result = await repairChatNotificationSources(bindings, NOW_MS);

  assert.equal(result.failed, 1);
  assert.equal(result.ready, 1);
  assert.equal(DATA.store.has(`notify:ready:chat:${badRound}:owner_chat_round_v1`), false);
  assert.equal(DATA.store.has(`notify:ready:chat:${goodRound}:owner_chat_round_v1`), true);
});

test('booking repair gates a partial pair, repairs the new descriptor, and skips legacy bookings without replay', async () => {
  const { bindings, DATA, emailCalls, telegramCalls, dependencies } = createEnv();
  const id = '9005000000000000-11111111111111111111111111111111';
  const sourceKey = `booking:${id}`;
  const source = bookingSource(id);
  await DATA.put(sourceKey, JSON.stringify(source));
  const legacyId = '9005000000000000-99999999999999999999999999999999';
  const legacyKey = `booking:${legacyId}`;
  const legacySource = bookingSource(legacyId, { descriptor: false });
  await DATA.put(legacyKey, JSON.stringify(legacySource));
  const mismatchedTimestampId = '9005000000000000-88888888888888888888888888888888';
  const mismatchedTimestampKey = `booking:${mismatchedTimestampId}`;
  const mismatchedTimestampSource = bookingSource(mismatchedTimestampId);
  mismatchedTimestampSource.notification.source_ts += 1;
  await DATA.put(mismatchedTimestampKey, JSON.stringify(mismatchedTimestampSource));

  const group = {
    entityKind: 'booking', entityId: id, template: 'owner_booking_v1', sourceKey,
    payloadHash: source.submission_fingerprint, channels: ['email', 'telegram'],
  };
  const email = await createNotifyIntent(bindings, {
    ...group,
    channel: 'email',
    recipientFingerprint: sha256('owner:email'),
    groupReadyKey: notifyGroupReadyKey(group),
  }, NOW_MS);
  await createNotifyIntent(bindings, {
    entityKind: 'booking',
    entityId: legacyId,
    channel: 'email',
    template: 'owner_booking_v1',
    sourceKey: legacyKey,
    payloadHash: legacySource.submission_fingerprint,
    recipientFingerprint: sha256('owner:email'),
  }, NOW_MS);

  await reconcileDueNotifications(bindings, NOW_MS, dependencies);
  assert.equal(emailCalls.length, 0, 'partial and descriptor-less legacy bookings must not send early');

  const result = await repairBookingNotificationSources(bindings, NOW_MS + 1);
  await reconcileDueNotifications(bindings, NOW_MS + 1, dependencies);

  assert.equal(result.ready, 1);
  assert.equal(emailCalls.length, 1);
  assert.equal(telegramCalls.length, 1);
  assert.equal(DATA.store.has(`notify:ready:booking:${id}:owner_booking_v1`), true);
  assert.equal(
    [...DATA.store.keys()].some((key) => key.startsWith(`notify:ready:booking:${legacyId}:`)),
    false,
  );
  assert.equal(
    [...DATA.store.keys()].some((key) => key.startsWith(`notify:item:booking:${mismatchedTimestampId}:`)),
    false,
    'a booking descriptor timestamp must identify the stored source timestamp exactly',
  );
  assert.equal((await readNotifyItem(bindings, email.itemKey)).status, 'sent');

  const repeated = await repairBookingNotificationSources(bindings, NOW_MS + 2);
  await reconcileDueNotifications(bindings, NOW_MS + 2, dependencies);
  assert.equal(repeated.ready, 1);
  assert.equal(repeated.changed, 0);
  assert.equal(emailCalls.length, 1, 'a converged scan must not resend terminal email');
  assert.equal(telegramCalls.length, 1, 'a converged scan must not resend terminal Telegram');
});

test('a stale ready marker cannot authorize one remaining channel when sibling repair fails', async () => {
  const { bindings, DATA, emailCalls, telegramCalls, dependencies } = createEnv();
  const id = '9005000000000000-77777777777777777777777777777777';
  const sourceKey = `booking:${id}`;
  const source = bookingSource(id);
  await DATA.put(sourceKey, JSON.stringify(source));
  const group = {
    entityKind: 'booking', entityId: id, template: 'owner_booking_v1', sourceKey,
    payloadHash: source.submission_fingerprint, channels: ['email', 'telegram'],
  };
  const groupReadyKey = notifyGroupReadyKey(group);
  const intents = {};
  for (const channel of ['email', 'telegram']) {
    intents[channel] = await createNotifyIntent(bindings, {
      ...group,
      channel,
      recipientFingerprint: sha256(`owner:${channel}`),
      groupReadyKey,
    }, NOW_MS);
  }
  await markNotifyGroupReady(bindings, group, NOW_MS);
  await DATA.delete(intents.telegram.itemKey);
  await DATA.delete(intents.telegram.dueKey);
  DATA.failPutTimes(({ key }) => key === intents.telegram.itemKey, 20);

  const direct = await attemptNotifyIntent(
    bindings,
    intents.email.itemKey,
    NOW_MS,
    dependencies,
  );
  const scheduled = await runScheduledNotificationRecovery(
    bindings,
    NOW_MS + 1,
    dependencies,
  );

  assert.equal(direct.status, 'pending');
  assert.equal(emailCalls.length, 0);
  assert.equal(telegramCalls.length, 0);
  assert.equal(scheduled.booking_repair.value.failed, 1);
  assert.equal((await readNotifyItem(bindings, intents.email.itemKey)).status, 'pending');
  assert.equal(
    [...DATA.store.keys()].some((key) => key.startsWith('notify:due:')),
    false,
    'reconciliation must quarantine the lone due reference after repair failure',
  );
});

test('sent_unknown is terminal through ensure, repair, attempt, failure, due reconciliation, and daily counts', async () => {
  const { bindings, DATA, emailCalls, telegramCalls, dependencies } = createEnv();
  const id = '9005000000000000-22222222222222222222222222222222';
  const sourceKey = `booking:${id}`;
  const source = bookingSource(id);
  await DATA.put(sourceKey, JSON.stringify(source));
  const group = {
    entityKind: 'booking', entityId: id, template: 'owner_booking_v1', sourceKey,
    payloadHash: source.submission_fingerprint, channels: ['email', 'telegram'],
  };

  for (const channel of ['email', 'telegram']) {
    const spec = {
      ...group,
      channel,
      recipientFingerprint: sha256(`owner:${channel}`),
      groupReadyKey: notifyGroupReadyKey(group),
    };
    const intent = await createNotifyIntent(bindings, spec, Date.parse('2026-08-15T03:00:00.000Z'));
    const staleDue = notifyDueKey(NOW_MS, intent.itemKey);
    await DATA.put(intent.itemKey, JSON.stringify({
      ...intent.item,
      status: 'sent_unknown',
      next_attempt_ms: NOW_MS,
      due_key: staleDue,
    }));
    await DATA.put(staleDue, intent.itemKey);
    assert.equal((await attemptNotifyIntent(bindings, intent.itemKey, NOW_MS, dependencies)).status, 'sent_unknown');
    assert.equal((await markNotifyFailure(bindings, intent.itemKey, { code: 'late' }, NOW_MS)).status, 'sent_unknown');
  }

  await repairBookingNotificationSources(bindings, NOW_MS + 1);
  await reconcileDueNotifications(bindings, NOW_MS + 1, dependencies);
  assert.equal(emailCalls.length, 0);
  assert.equal(telegramCalls.length, 0);
  assert.equal([...DATA.store.keys()].some((key) => key.startsWith('notify:due:')), false);

  const summary = await ensureDailyReconcileSummary(
    bindings,
    Date.parse('2026-08-16T00:15:00.000Z'),
  );
  const summarySource = JSON.parse(DATA.store.get(summary.summary_key));
  assert.equal(summarySource.counts.sent_unknown, 2);
  assert.equal(summarySource.counts.sent, 0);
  assert.deepEqual(summarySource.notes, ['email: sent_unknown', 'telegram: sent_unknown']);
});
