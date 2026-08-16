/** Durable notification intent and retry ledger backed by Cloudflare KV. */

export const NOTIFY_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 6 * 3_600_000, 24 * 3_600_000];

const MAX_FIELD_LENGTH = 512;
const MAX_ERROR_LENGTH = 1_000;
const MAX_RESULT_LENGTH = 4_000;
const KEY_FIELDS = ['entityKind', 'entityId', 'channel', 'template'];
const SPEC_FIELDS = [...KEY_FIELDS, 'sourceKey', 'payloadHash', 'recipientFingerprint'];

export function notifyItemKey({ entityKind, entityId, channel, template }) {
  return `notify:item:${entityKind}:${entityId}:${channel}:${template}`;
}

export function notifyDueKey(nextAttemptMs, itemKey) {
  return `notify:due:${String(nextAttemptMs).padStart(13, '0')}:${encodeURIComponent(itemKey)}`;
}

function assertString(value, field, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty string of at most ${maxLength} characters`);
  }
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('notification spec must be an object');
  }
  for (const field of SPEC_FIELDS) assertString(spec[field], field);
}

function assertNow(nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError('nowMs must be a non-negative safe integer');
}

function assertEnv(env) {
  if (!env?.DATA || typeof env.DATA.get !== 'function' || typeof env.DATA.put !== 'function') {
    throw new TypeError('env.DATA KV binding is required');
  }
}

function jstDate(nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dailyReferenceKey(nowMs, itemKey) {
  return `notify:daily:${jstDate(nowMs)}:${encodeURIComponent(itemKey)}`;
}

function toJson(value, field, maxLength) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_error) {
    throw new TypeError(`${field} must be JSON serializable`);
  }
  if (serialized === undefined || serialized.length > maxLength) {
    throw new TypeError(`${field} is too large`);
  }
  return serialized;
}

async function readJson(env, key) {
  const value = await env.DATA.get(key, 'json');
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_error) { return null; }
  }
  return value;
}

function putOptions() {
  return { expirationTtl: NOTIFY_TTL_SECONDS };
}

function encodeItem(item) {
  return toJson(item, 'notification item', MAX_RESULT_LENGTH);
}

export async function createNotifyIntent(env, spec, nowMs) {
  assertEnv(env);
  validateSpec(spec);
  assertNow(nowMs);

  const itemKey = notifyItemKey(spec);
  const existing = await readJson(env, itemKey);
  if (existing) {
    return { created: false, itemKey, dueKey: existing.due_key ?? null, item: existing };
  }

  const dueKey = notifyDueKey(nowMs, itemKey);
  const item = {
    item_key: itemKey,
    entity_kind: spec.entityKind,
    entity_id: spec.entityId,
    channel: spec.channel,
    template: spec.template,
    source_key: spec.sourceKey,
    payload_hash: spec.payloadHash,
    recipient_fingerprint: spec.recipientFingerprint,
    status: 'pending',
    attempt_count: 0,
    created_at: nowMs,
    updated_at: nowMs,
    next_attempt_ms: nowMs,
    due_key: dueKey,
    sent_at: null,
    last_error: null,
    result: null,
  };

  const encodedItem = encodeItem(item);
  const options = putOptions();
  const dailyKey = dailyReferenceKey(nowMs, itemKey);
  await env.DATA.put(itemKey, encodedItem, options);
  await env.DATA.put(dueKey, itemKey, options);
  await env.DATA.put(dailyKey, itemKey, options);
  return { created: true, itemKey, dueKey, item };
}

export async function readNotifyItem(env, itemKey) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  return readJson(env, itemKey);
}

export async function markNotifySent(env, itemKey, result, nowMs) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  assertNow(nowMs);
  const item = await readJson(env, itemKey);
  if (!item || item.status === 'sent') return item;
  toJson(result, 'result', MAX_RESULT_LENGTH);

  const updated = {
    ...item,
    status: 'sent',
    updated_at: nowMs,
    sent_at: nowMs,
    next_attempt_ms: null,
    due_key: null,
    result,
  };
  if (item.due_key && typeof env.DATA.delete === 'function') await env.DATA.delete(item.due_key);
  await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  return updated;
}

export async function markNotifyFailure(env, itemKey, error, nowMs) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  assertNow(nowMs);
  const item = await readJson(env, itemKey);
  if (!item || item.status === 'sent' || item.status === 'failed') return item;

  const attemptCount = Number.isSafeInteger(item.attempt_count) && item.attempt_count >= 0
    ? item.attempt_count + 1 : 1;
  const errorText = String(error instanceof Error ? error.message : error).slice(0, MAX_ERROR_LENGTH);
  const retryIndex = attemptCount - 1;
  const canRetry = retryIndex < RETRY_DELAYS_MS.length;
  const nextAttemptMs = canRetry ? nowMs + RETRY_DELAYS_MS[retryIndex] : null;
  const dueKey = canRetry ? notifyDueKey(nextAttemptMs, itemKey) : null;
  const updated = {
    ...item,
    status: canRetry ? 'pending' : 'failed',
    attempt_count: attemptCount,
    updated_at: nowMs,
    next_attempt_ms: nextAttemptMs,
    due_key: dueKey,
    last_error: errorText,
  };

  if (item.due_key && item.due_key !== dueKey && typeof env.DATA.delete === 'function') {
    await env.DATA.delete(item.due_key);
  }
  await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (dueKey) await env.DATA.put(dueKey, itemKey, putOptions());
  return updated;
}
