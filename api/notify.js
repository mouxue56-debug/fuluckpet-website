/** Durable notification intent and retry ledger backed by Cloudflare KV. */

export const NOTIFY_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 6 * 3_600_000, 24 * 3_600_000];

const MAX_FIELD_LENGTH = 512;
const MAX_ERROR_LENGTH = 1_000;
const MAX_PROVIDER_ID_LENGTH = 256;
const MAX_RESULT_LENGTH = 4_000;
const MAX_TRANSPORT_DETAIL_LENGTH = 200;
const KEY_FIELDS = ['entityKind', 'entityId', 'channel', 'template'];
const SPEC_FIELDS = [...KEY_FIELDS, 'sourceKey', 'payloadHash', 'recipientFingerprint'];
const OWNER_EMAIL_TO = 'mouxue56@gmail.com';
const OWNER_EMAIL_FROM = { email: 'noreply@fuluckpet.com', name: 'fuluckpet 通知' };
const ADMIN_URL = 'https://fuluckpet.com/admin/';

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

function boundedString(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimText(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function boundedDetail(value) {
  if (value === null || value === undefined) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TRANSPORT_DETAIL_LENGTH ? text.slice(0, MAX_TRANSPORT_DETAIL_LENGTH) : text;
}

function providerMessageIdFrom(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const providerMessageId = result.providerMessageId
    ?? result.provider_message_id
    ?? result.providerId
    ?? result.provider_id
    ?? result.messageId
    ?? result.message_id
    ?? result.id;
  return providerMessageId === undefined || providerMessageId === null ? null : String(providerMessageId);
}

function sanitizeProviderResult(result) {
  const providerMessageId = boundedString(providerMessageIdFrom(result), MAX_PROVIDER_ID_LENGTH);
  return providerMessageId ? { provider_message_id: providerMessageId } : null;
}

function sanitizeError(error) {
  const input = error && typeof error === 'object' ? error : {};
  const code = boundedString(input.code, 128) ?? 'unknown';
  const detail = boundedString(input.detail, MAX_ERROR_LENGTH);
  return { code, detail };
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

function normalizeReplyTo(value) {
  return boundedString(value, MAX_FIELD_LENGTH);
}

function messageEnvelope(subject, text, html, telegramText, replyTo = null) {
  return { subject, text, html, telegramText, replyTo };
}

export class NotifyTransportError extends Error {
  constructor({ code, permanent, statusCode = null, detail } = {}) {
    super(code || 'notify_transport_error');
    this.name = 'NotifyTransportError';
    this.code = code || 'notify_transport_error';
    this.permanent = permanent === true;
    this.statusCode = Number.isInteger(statusCode) ? statusCode : null;
    this.detail = boundedDetail(detail);
  }
}

export function buildBookingOwnerMessage(source, requestId) {
  const submission = source && typeof source === 'object' ? source : {};
  const lines = [
    '【fuluckpet 予約】新しい見学予約が届きました',
    '',
    `■ お名前: ${submission.name ?? ''}`,
    `■ メール: ${submission.email ?? ''}`,
    `■ 電話: ${submission.phone || '（未記入）'}`,
    `■ 第一希望日: ${submission.preferred_date ?? ''}`,
    submission.preferred_date2 ? `■ 第二希望日: ${submission.preferred_date2}` : null,
    submission.preferred_time ? `■ 希望時間: ${submission.preferred_time}` : null,
    submission.visit_method ? `■ 見学方法: ${submission.visit_method}` : null,
    submission.kitten_id ? `■ 気になる子猫: ${submission.kitten_id}` : null,
    '',
    '■ メッセージ:',
    submission.message || '（なし）',
    '',
    `管理画面: ${ADMIN_URL}`,
    `Request ID: ${requestId}`,
  ].filter(Boolean);

  const text = lines.join('\n');
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:560px;margin:0 auto;padding:20px;">
<h2 style="color:#5a8a6e;margin:0 0 16px;">【fuluckpet 予約】新しい見学予約</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="padding:6px 0;color:#666;width:120px;">お名前</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(submission.name ?? '')}</td></tr>
<tr><td style="padding:6px 0;color:#666;">メール</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(submission.email ?? '')}">${escapeHtml(submission.email ?? '')}</a></td></tr>
<tr><td style="padding:6px 0;color:#666;">電話</td><td style="padding:6px 0;">${escapeHtml(submission.phone || '（未記入）')}</td></tr>
<tr><td style="padding:6px 0;color:#666;">第一希望日</td><td style="padding:6px 0;">${escapeHtml(submission.preferred_date ?? '')}</td></tr>
${submission.preferred_date2 ? `<tr><td style="padding:6px 0;color:#666;">第二希望日</td><td style="padding:6px 0;">${escapeHtml(submission.preferred_date2)}</td></tr>` : ''}
${submission.preferred_time ? `<tr><td style="padding:6px 0;color:#666;">希望時間</td><td style="padding:6px 0;">${escapeHtml(submission.preferred_time)}</td></tr>` : ''}
${submission.visit_method ? `<tr><td style="padding:6px 0;color:#666;">見学方法</td><td style="padding:6px 0;">${escapeHtml(submission.visit_method)}</td></tr>` : ''}
${submission.kitten_id ? `<tr><td style="padding:6px 0;color:#666;">気になる子猫</td><td style="padding:6px 0;">${escapeHtml(submission.kitten_id)}</td></tr>` : ''}
</table>
<div style="margin-top:18px;padding:14px;background:#f7f9f6;border-left:3px solid #5a8a6e;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(submission.message || '（なし）')}</div>
<p style="margin:20px 0 8px;"><a href="${ADMIN_URL}" style="display:inline-block;padding:10px 18px;background:#5a8a6e;color:#fff;text-decoration:none;border-radius:6px;">管理画面で確認する</a></p>
<p style="font-size:12px;color:#999;margin-top:24px;">Request ID: ${escapeHtml(requestId)}</p>
</body></html>`;
  const telegramText = [
    '<b>【fuluckpet 予約】</b>',
    `<b>名前:</b> ${escapeHtml(submission.name ?? '')}`,
    `<b>メール:</b> ${escapeHtml(submission.email ?? '')}`,
    `<b>電話:</b> ${escapeHtml(submission.phone || '（未記入）')}`,
    `<b>第一希望日:</b> ${escapeHtml(submission.preferred_date ?? '')}`,
    submission.preferred_date2 ? `<b>第二希望日:</b> ${escapeHtml(submission.preferred_date2)}` : null,
    submission.preferred_time ? `<b>希望時間:</b> ${escapeHtml(submission.preferred_time)}` : null,
    submission.visit_method ? `<b>見学方法:</b> ${escapeHtml(submission.visit_method)}` : null,
    submission.kitten_id ? `<b>気になる子猫:</b> ${escapeHtml(submission.kitten_id)}` : null,
    '',
    '<b>メッセージ:</b>',
    escapeHtml(submission.message || '（なし）'),
    '',
    `<code>${escapeHtml(requestId)}</code>`,
  ].filter(Boolean).join('\n');

  return messageEnvelope(
    `[fuluckpet 予約] ${submission.name ?? ''} さんから新しい見学予約`,
    text,
    html,
    telegramText,
    normalizeReplyTo(submission.email),
  );
}

export function buildChatOwnerMessage(source) {
  const data = source && typeof source === 'object' ? source : {};
  const sessionId = String(data.sessionId || '');
  const sidShort = sessionId.slice(0, 8);
  const provider = String(data.provider || 'fallback');
  const userMessage = trimText(data.userMessage, 600);
  const assistantMessage = trimText(data.assistantMessage, 600);
  const text = [
    `【fuluckpet chat】新しい会話 ${sidShort}`,
    '',
    `Provider: ${provider}`,
    '',
    'ユーザー:',
    userMessage,
    '',
    'ふくにゃん:',
    assistantMessage,
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:560px;margin:0 auto;padding:20px;">
<h2 style="margin:0 0 12px;">【fuluckpet chat】新しい会話</h2>
<p><b>Session:</b> <code>${escapeHtml(sidShort)}</code><br><b>Provider:</b> ${escapeHtml(provider)}</p>
<p><b>👤 ユーザー:</b><br>${escapeHtml(userMessage).replace(/\n/g, '<br>')}</p>
<p><b>🐱 ふくにゃん:</b><br>${escapeHtml(assistantMessage).replace(/\n/g, '<br>')}</p>
</body></html>`;
  const telegramText = [
    `💬 <b>新しい会話</b> <code>${escapeHtml(sidShort)}</code> · ${escapeHtml(provider)}`,
    `<b>👤 ユーザー:</b>\n${escapeHtml(userMessage)}`,
    `<b>🐱 ふくにゃん:</b>\n${escapeHtml(assistantMessage)}`,
  ].join('\n\n');
  return messageEnvelope(`[fuluckpet chat] 新しい会話 ${sidShort}`, text, html, telegramText, null);
}

export function buildDailyOwnerMessage(source) {
  const data = source && typeof source === 'object' ? source : {};
  const dateJst = String(data.dateJst || '');
  const summary = String(data.summary || '');
  const notes = Array.isArray(data.notes) ? data.notes.map((note) => String(note)) : [];
  const text = [
    `【fuluckpet 通知】${dateJst} 日次サマリー`,
    '',
    summary,
    ...(notes.length ? ['', '詳細:', ...notes] : []),
  ].join('\n');
  const htmlNotes = notes.length
    ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '<p>詳細なし</p>';
  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;max-width:560px;margin:0 auto;padding:20px;">
<h2 style="margin:0 0 12px;">【fuluckpet 通知】${escapeHtml(dateJst)} 日次サマリー</h2>
<p>${escapeHtml(summary)}</p>
${htmlNotes}
</body></html>`;
  const telegramText = [
    `<b>【fuluckpet 通知】${escapeHtml(dateJst)} 日次サマリー</b>`,
    escapeHtml(summary),
    ...(notes.length ? ['', ...notes.map((note) => `• ${escapeHtml(note)}`)] : []),
  ].join('\n');
  return messageEnvelope(`[fuluckpet 通知] ${dateJst} 日次サマリー`, text, html, telegramText, null);
}

export async function sendEmailTransport(env, message) {
  if (!env?.EMAIL || typeof env.EMAIL.send !== 'function') {
    throw new NotifyTransportError({
      code: 'email_unconfigured',
      permanent: true,
      detail: 'EMAIL binding is required',
    });
  }
  try {
    const result = await env.EMAIL.send({
      to: OWNER_EMAIL_TO,
      from: OWNER_EMAIL_FROM,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return {
      providerMessageId: providerMessageIdFrom(result),
      providerStatusCode: Number.isInteger(result?.status) ? result.status : 200,
    };
  } catch (error) {
    throw new NotifyTransportError({
      code: 'email_send_failed',
      permanent: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function classifyTelegramStatus(statusCode) {
  if ([400, 401, 403].includes(statusCode)) return true;
  if ([408, 429].includes(statusCode) || statusCode >= 500) return false;
  return false;
}

export async function sendTelegramTransport(env, message, fetchImpl, signal) {
  const token = boundedString(env?.TELEGRAM_BOT_TOKEN, MAX_FIELD_LENGTH);
  const chatId = boundedString(env?.TELEGRAM_CHAT_ID, MAX_FIELD_LENGTH);
  if (!token || !chatId) {
    throw new NotifyTransportError({
      code: 'telegram_unconfigured',
      permanent: true,
      detail: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required',
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new NotifyTransportError({
      code: 'telegram_fetch_unavailable',
      permanent: true,
      detail: 'fetch implementation is required',
    });
  }

  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.telegramText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal,
    });
  } catch (error) {
    throw new NotifyTransportError({
      code: 'telegram_network_error',
      permanent: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new NotifyTransportError({
      code: 'telegram_http_error',
      permanent: classifyTelegramStatus(response.status),
      statusCode: response.status,
      detail,
    });
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new NotifyTransportError({
      code: 'telegram_invalid_response',
      permanent: false,
      statusCode: response.status,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!body?.ok) {
    const statusCode = Number.isInteger(body?.error_code) ? body.error_code : response.status;
    throw new NotifyTransportError({
      code: 'telegram_api_error',
      permanent: classifyTelegramStatus(statusCode),
      statusCode,
      detail: body?.description ?? 'Telegram API rejected the message',
    });
  }

  return {
    providerMessageId: providerMessageIdFrom(body?.result),
    providerStatusCode: response.status,
  };
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
  const sanitizedResult = sanitizeProviderResult(result);

  const updated = {
    ...item,
    status: 'sent',
    updated_at: nowMs,
    sent_at: nowMs,
    next_attempt_ms: null,
    due_key: null,
    result: sanitizedResult,
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
  const sanitizedError = sanitizeError(error);
  const retryIndex = attemptCount - 1;
  const canRetry = retryIndex < RETRY_DELAYS_MS.length;
  const nextAttemptMs = canRetry ? nowMs + RETRY_DELAYS_MS[retryIndex] : null;
  const dueKey = canRetry ? notifyDueKey(nextAttemptMs, itemKey) : null;
  const updated = {
    ...item,
    status: canRetry ? 'retry' : 'failed',
    attempt_count: attemptCount,
    updated_at: nowMs,
    next_attempt_ms: nextAttemptMs,
    due_key: dueKey,
    last_error: sanitizedError,
  };

  if (item.due_key && item.due_key !== dueKey && typeof env.DATA.delete === 'function') {
    await env.DATA.delete(item.due_key);
  }
  await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (dueKey) await env.DATA.put(dueKey, itemKey, putOptions());
  return updated;
}
