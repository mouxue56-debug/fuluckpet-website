/** Durable notification intent and retry ledger backed by Cloudflare KV. */

export const NOTIFY_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 6 * 3_600_000, 24 * 3_600_000];
export const CHAT_NOTIFY_DESCRIPTOR_VERSION = 1;
export const CHAT_SOURCE_PAYLOAD_HASH_RULE = 'sha256:json-v1:[ts,sid,provider,user,assistant]';

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
const DUE_PREFIX = 'notify:due:';
const READY_PREFIX = 'notify:ready:';
const SENT_MARKER_PREFIX = 'notify:sent:';
const MAX_DUE_PER_RECONCILE = 100;
const MAX_DUE_KEYS_SCANNED_PER_RECONCILE = MAX_DUE_PER_RECONCILE * 2;
const LIST_PAGE_LIMIT = 1_000;
const HOUR_MS = 60 * 60_000;
const TELEGRAM_MAX_TEXT_LENGTH = 4_096;
const MAX_DAILY_DATE_LENGTH = 32;
const MAX_DAILY_SUMMARY_LENGTH = 200;
const MAX_DAILY_NOTES = 6;
const MAX_DAILY_NOTE_LENGTH = 100;
const CHAT_ROUND_TEMPLATE = 'owner_chat_round_v1';
const CHAT_ROUND_CHANNELS = Object.freeze(['email', 'telegram']);
const OPAQUE_ROUND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function notifyItemKey({ entityKind, entityId, channel, template }) {
  return `notify:item:${entityKind}:${entityId}:${channel}:${template}`;
}

export function notifyDueKey(nextAttemptMs, itemKey) {
  return `notify:due:${String(nextAttemptMs).padStart(13, '0')}:${encodeURIComponent(itemKey)}`;
}

export function notifyGroupReadyKey({ entityKind, entityId, template }) {
  return `${READY_PREFIX}${entityKind}:${entityId}:${template}`;
}

async function notifySentMarkerKey(itemKey) {
  return `${SENT_MARKER_PREFIX}${await sha256(itemKey)}`;
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
  if (spec.groupReadyKey !== undefined) assertString(spec.groupReadyKey, 'groupReadyKey');
  if (spec.template === CHAT_ROUND_TEMPLATE) {
    if (spec.entityKind !== 'chat' || !OPAQUE_ROUND_ID_RE.test(spec.entityId)) {
      throw new TypeError('chat notification entityId must be an opaque UUID');
    }
    if (spec.groupReadyKey !== notifyGroupReadyKey(spec)) {
      throw new TypeError('chat notification groupReadyKey must match its deterministic group key');
    }
  }
}

function validateGroupSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('notification group spec must be an object');
  }
  for (const field of ['entityKind', 'entityId', 'template', 'sourceKey', 'payloadHash']) {
    assertString(spec[field], field);
  }
  if (spec.entityKind !== 'chat' || spec.template !== CHAT_ROUND_TEMPLATE || !OPAQUE_ROUND_ID_RE.test(spec.entityId)) {
    throw new TypeError('notification group must identify one opaque chat round');
  }
  if (!Array.isArray(spec.channels)
    || spec.channels.length !== CHAT_ROUND_CHANNELS.length
    || spec.channels.some((channel, index) => channel !== CHAT_ROUND_CHANNELS[index])) {
    throw new TypeError('notification group channels must be exactly email and telegram');
  }
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

function previousJstDate(nowMs) {
  return jstDate(nowMs - 24 * HOUR_MS);
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

function wellFormedCodePoints(value) {
  return [...String(value ?? '').toWellFormed()];
}

function trimText(value, maxLength) {
  const characters = wellFormedCodePoints(value);
  const text = characters.join('');
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}…` : text;
}

function escapeHtmlWithin(value, maxLength) {
  const text = String(value ?? '');
  let escaped = '';
  for (const character of text) {
    const piece = escapeHtml(character);
    if (escaped.length + piece.length > maxLength - 1) return `${escaped}…`;
    escaped += piece;
  }
  return escaped;
}

function boundedDisplayText(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return maxLength <= 1 ? text.slice(0, maxLength) : `${text.slice(0, maxLength - 1)}…`;
}

function boundedDetail(value) {
  if (value === null || value === undefined) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TRANSPORT_DETAIL_LENGTH ? text.slice(0, MAX_TRANSPORT_DETAIL_LENGTH) : text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeTelegramDetail(detail, token) {
  if (detail === null || detail === undefined) return undefined;
  let text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  text = text.replace(/https:\/\/api\.telegram\.org\/bot[^/\s?]+\/sendMessage(?:\?[^\s]*)?/g, '[REDACTED_TELEGRAM_URL]');
  if (token) {
    text = text.replace(new RegExp(escapeRegExp(token), 'g'), '[REDACTED]');
  }
  return boundedDetail(text);
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

function isSentMarker(marker) {
  return marker?.status === 'sent'
    && Number.isSafeInteger(marker.sent_at)
    && marker.sent_at >= 0;
}

async function readSentMarker(env, itemKey) {
  const marker = await readJson(env, await notifySentMarkerKey(itemKey));
  return isSentMarker(marker) ? marker : null;
}

function projectSentItem(item, marker) {
  return {
    ...item,
    status: 'sent',
    updated_at: Number.isSafeInteger(marker.updated_at) ? marker.updated_at : marker.sent_at,
    sent_at: marker.sent_at,
    next_attempt_ms: null,
    due_key: null,
    result: marker.result ?? null,
  };
}

async function repairSentItem(env, itemKey, item, marker) {
  const updated = projectSentItem(item, marker);
  const needsItemRepair = item.status !== 'sent'
    || item.sent_at !== updated.sent_at
    || item.next_attempt_ms !== null
    || item.due_key !== null
    || JSON.stringify(item.result ?? null) !== JSON.stringify(updated.result);
  if (needsItemRepair) await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (item.due_key && typeof env.DATA.delete === 'function') await env.DATA.delete(item.due_key);
  return updated;
}

async function readAuthoritativeNotifyItem(env, itemKey) {
  const item = await readJson(env, itemKey);
  if (!item) return null;
  const marker = await readSentMarker(env, itemKey);
  return marker ? repairSentItem(env, itemKey, item, marker) : item;
}

function putOptions() {
  return { expirationTtl: NOTIFY_TTL_SECONDS };
}

function encodeItem(item) {
  return toJson(item, 'notification item', MAX_RESULT_LENGTH);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function chatSourcePayloadHash(source) {
  const data = source && typeof source === 'object' ? source : {};
  return sha256(JSON.stringify({
    ts: data.ts,
    sid: data.sid,
    provider: data.provider,
    user: data.user,
    assistant: data.assistant,
  }));
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
  const sessionId = String(data.sessionId || data.sid || '');
  const sidShort = wellFormedCodePoints(sessionId).slice(0, 8).join('');
  const provider = trimText(data.provider || 'fallback', 100);
  const userMessage = trimText(data.userMessage ?? data.user, 600);
  const assistantMessage = trimText(data.assistantMessage ?? data.assistant, 600);
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
  const telegramHeader = `💬 <b>新しい会話</b> <code>${escapeHtml(sidShort)}</code> · ${escapeHtml(provider)}`;
  const telegramUserLabel = '<b>👤 ユーザー:</b>\n';
  const telegramAssistantLabel = '<b>🐱 ふくにゃん:</b>\n';
  const telegramSeparator = '\n\n';
  const fixedTelegramLength = telegramHeader.length
    + telegramSeparator.length + telegramUserLabel.length
    + telegramSeparator.length + telegramAssistantLabel.length;
  const telegramContentBudget = TELEGRAM_MAX_TEXT_LENGTH - fixedTelegramLength;
  const telegramUserBudget = Math.floor(telegramContentBudget / 2);
  const telegramAssistantBudget = telegramContentBudget - telegramUserBudget;
  const telegramText = telegramHeader
    + telegramSeparator + telegramUserLabel + escapeHtmlWithin(userMessage, telegramUserBudget)
    + telegramSeparator + telegramAssistantLabel + escapeHtmlWithin(assistantMessage, telegramAssistantBudget);
  return messageEnvelope(`[fuluckpet chat] 新しい会話 ${sidShort}`, text, html, telegramText, null);
}

export function buildDailyOwnerMessage(source) {
  const data = source && typeof source === 'object' ? source : {};
  const dateJst = boundedDisplayText(data.dateJst, MAX_DAILY_DATE_LENGTH);
  const summary = boundedDisplayText(data.summary, MAX_DAILY_SUMMARY_LENGTH);
  const notes = Array.isArray(data.notes)
    ? data.notes.slice(0, MAX_DAILY_NOTES).map((note) => boundedDisplayText(note, MAX_DAILY_NOTE_LENGTH))
    : [];
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
  const telegramLines = [
    `<b>【fuluckpet 通知】${escapeHtml(dateJst)} 日次サマリー</b>`,
    escapeHtml(summary),
  ];
  for (const note of notes) {
    const noteLines = telegramLines.length === 2 ? ['', `• ${escapeHtml(note)}`] : [`• ${escapeHtml(note)}`];
    if ([...telegramLines, ...noteLines].join('\n').length > TELEGRAM_MAX_TEXT_LENGTH) break;
    telegramLines.push(...noteLines);
  }
  const telegramText = telegramLines.join('\n');
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
  if (!Number.isInteger(statusCode)) return false;
  if ([408, 429].includes(statusCode) || statusCode >= 500) return false;
  if (statusCode >= 400 && statusCode < 500) return true;
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
      detail: sanitizeTelegramDetail(error instanceof Error ? error.message : String(error), token),
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new NotifyTransportError({
      code: 'telegram_http_error',
      permanent: classifyTelegramStatus(response.status),
      statusCode: response.status,
      detail: sanitizeTelegramDetail(detail, token),
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
      detail: sanitizeTelegramDetail(error instanceof Error ? error.message : String(error), token),
    });
  }

  if (!body?.ok) {
    const statusCode = Number.isInteger(body?.error_code) ? body.error_code : response.status;
    throw new NotifyTransportError({
      code: 'telegram_api_error',
      permanent: classifyTelegramStatus(statusCode),
      statusCode,
      detail: sanitizeTelegramDetail(body?.description ?? 'Telegram API rejected the message', token),
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
  const existing = await readAuthoritativeNotifyItem(env, itemKey);
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
    group_ready_key: spec.groupReadyKey ?? null,
    status: 'pending',
    attempt_count: 0,
    created_at: nowMs,
    updated_at: nowMs,
    next_attempt_ms: nowMs,
    due_key: dueKey,
    sent_at: null,
    last_error: null,
    last_error_code: null,
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

export async function ensureNotifyIntent(env, spec, nowMs) {
  const result = await createNotifyIntent(env, spec, nowMs);
  if (result.created) return { ...result, repaired: false };

  const { item, itemKey } = result;
  const options = putOptions();
  let repaired = false;

  if (!['sent', 'failed', 'dead_letter'].includes(item.status)) {
    assertString(item.due_key, 'item.due_key');
    const dueReference = await env.DATA.get(item.due_key);
    if (dueReference !== itemKey) {
      await env.DATA.put(item.due_key, itemKey, options);
      repaired = true;
    }
  }

  const createdAt = Number.isSafeInteger(item.created_at) && item.created_at >= 0
    ? item.created_at : nowMs;
  const dailyKey = dailyReferenceKey(createdAt, itemKey);
  const dailyReference = await env.DATA.get(dailyKey);
  if (dailyReference !== itemKey) {
    await env.DATA.put(dailyKey, itemKey, options);
    repaired = true;
  }

  return { ...result, repaired };
}

function groupMarkerMatchesItem(marker, item) {
  return marker?.version === 1
    && marker.status === 'ready'
    && marker.entity_kind === item.entity_kind
    && marker.entity_id === item.entity_id
    && marker.template === item.template
    && marker.source_key === item.source_key
    && marker.payload_hash === item.payload_hash
    && Array.isArray(marker.channels)
    && marker.channels.length === CHAT_ROUND_CHANNELS.length
    && marker.channels.every((channel, index) => channel === CHAT_ROUND_CHANNELS[index]);
}

async function notifyGroupIsReady(env, item) {
  if (item.template !== CHAT_ROUND_TEMPLATE) return true;
  if (typeof item.group_ready_key !== 'string') return false;
  return groupMarkerMatchesItem(await readJson(env, item.group_ready_key), item);
}

export async function markNotifyGroupReady(env, spec, nowMs) {
  assertEnv(env);
  validateGroupSpec(spec);
  assertNow(nowMs);
  const readyKey = notifyGroupReadyKey(spec);

  for (const channel of CHAT_ROUND_CHANNELS) {
    const itemKey = notifyItemKey({ ...spec, channel });
    const item = await readAuthoritativeNotifyItem(env, itemKey);
    const itemMatches = item
      && item.entity_kind === spec.entityKind
      && item.entity_id === spec.entityId
      && item.channel === channel
      && item.template === spec.template
      && item.source_key === spec.sourceKey
      && item.payload_hash === spec.payloadHash
      && item.group_ready_key === readyKey;
    if (!itemMatches) throw new Error('both notification channels must be durable before group readiness');

    if (!['sent', 'failed', 'dead_letter'].includes(item.status)) {
      const dueReference = item.due_key ? await env.DATA.get(item.due_key) : null;
      if (dueReference !== itemKey) {
        throw new Error('both notification channels must be durable before group readiness');
      }
    }
    const dailyKey = dailyReferenceKey(item.created_at, itemKey);
    if (await env.DATA.get(dailyKey) !== itemKey) {
      throw new Error('both notification channels must be durable before group readiness');
    }
  }

  const marker = {
    version: 1,
    status: 'ready',
    entity_kind: spec.entityKind,
    entity_id: spec.entityId,
    template: spec.template,
    source_key: spec.sourceKey,
    payload_hash: spec.payloadHash,
    channels: [...CHAT_ROUND_CHANNELS],
    ready_at: nowMs,
  };
  const existing = await readJson(env, readyKey);
  if (existing && groupMarkerMatchesItem(existing, {
    entity_kind: spec.entityKind,
    entity_id: spec.entityId,
    template: spec.template,
    source_key: spec.sourceKey,
    payload_hash: spec.payloadHash,
  })) {
    return { created: false, readyKey, marker: existing };
  }
  await env.DATA.put(readyKey, toJson(marker, 'notification group marker', MAX_RESULT_LENGTH), putOptions());
  return { created: true, readyKey, marker };
}

export async function readNotifyItem(env, itemKey) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  return readAuthoritativeNotifyItem(env, itemKey);
}

export async function markNotifySent(env, itemKey, result, nowMs) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  assertNow(nowMs);
  const item = await readJson(env, itemKey);
  if (!item) return item;
  const existingMarker = await readSentMarker(env, itemKey);
  if (existingMarker) return repairSentItem(env, itemKey, item, existingMarker);
  const sanitizedResult = sanitizeProviderResult(result);
  const marker = {
    status: 'sent',
    updated_at: nowMs,
    sent_at: nowMs,
    result: sanitizedResult,
  };
  await env.DATA.put(await notifySentMarkerKey(itemKey), toJson(marker, 'notification sent marker', MAX_RESULT_LENGTH), putOptions());
  return repairSentItem(env, itemKey, item, marker);
}

export async function markNotifyFailure(env, itemKey, error, nowMs) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  assertNow(nowMs);
  const item = await readAuthoritativeNotifyItem(env, itemKey);
  if (!item || ['sent', 'failed', 'dead_letter'].includes(item.status)) return item;

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
    last_error_code: sanitizedError.code,
  };

  if (dueKey) await env.DATA.put(dueKey, itemKey, putOptions());
  await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (item.due_key && item.due_key !== dueKey && typeof env.DATA.delete === 'function') {
    await env.DATA.delete(item.due_key);
  }
  const sentMarker = await readSentMarker(env, itemKey);
  if (sentMarker) return repairSentItem(env, itemKey, updated, sentMarker);
  return updated;
}

async function markNotifyDeadLetter(env, itemKey, error, nowMs, countAttempt = false) {
  const item = await readAuthoritativeNotifyItem(env, itemKey);
  if (!item || ['sent', 'failed', 'dead_letter'].includes(item.status)) return item;
  const sanitizedError = sanitizeError(error);
  const attemptCount = countAttempt
    ? (Number.isSafeInteger(item.attempt_count) && item.attempt_count >= 0 ? item.attempt_count + 1 : 1)
    : item.attempt_count;
  const updated = {
    ...item,
    status: 'dead_letter',
    attempt_count: attemptCount,
    updated_at: nowMs,
    next_attempt_ms: null,
    due_key: null,
    last_error: sanitizedError,
    last_error_code: sanitizedError.code,
  };
  await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (item.due_key && typeof env.DATA.delete === 'function') await env.DATA.delete(item.due_key);
  const sentMarker = await readSentMarker(env, itemKey);
  if (sentMarker) return repairSentItem(env, itemKey, updated, sentMarker);
  return updated;
}

function messageForItem(item, source) {
  switch (item.template) {
    case 'owner_booking_v1':
      return buildBookingOwnerMessage(source, item.entity_id);
    case 'owner_chat_v1':
    case 'owner_chat_round_v1':
      return buildChatOwnerMessage(source);
    case 'owner_daily_v1':
      return buildDailyOwnerMessage(source);
    default:
      return null;
  }
}

function dueTimeFromKey(dueKey) {
  const match = /^notify:due:(\d{13}):/.exec(dueKey);
  return match ? Number(match[1]) : null;
}

export async function attemptNotifyIntent(env, itemKey, nowMs, dependencies = {}) {
  assertEnv(env);
  assertString(itemKey, 'itemKey');
  assertNow(nowMs);
  const item = await readAuthoritativeNotifyItem(env, itemKey);
  if (!item || ['sent', 'failed', 'dead_letter'].includes(item.status)) return item;
  if (!(await notifyGroupIsReady(env, item))) return item;
  if (Number.isSafeInteger(item.next_attempt_ms) && item.next_attempt_ms > nowMs) return item;

  const source = await readJson(env, item.source_key);
  if (!source) {
    return markNotifyDeadLetter(env, itemKey, { code: 'source_missing' }, nowMs);
  }

  const message = messageForItem(item, source);
  if (!message) {
    return markNotifyDeadLetter(env, itemKey, { code: 'template_unsupported' }, nowMs);
  }

  let result;
  try {
    if (item.channel === 'email') {
      result = await sendEmailTransport(env, message);
    } else if (item.channel === 'telegram') {
      result = await sendTelegramTransport(env, message, dependencies.fetchImpl, dependencies.signal);
    } else {
      return markNotifyDeadLetter(env, itemKey, { code: 'channel_unsupported' }, nowMs);
    }
  } catch (error) {
    if (error instanceof NotifyTransportError && error.permanent) {
      return markNotifyDeadLetter(env, itemKey, error, nowMs, true);
    }
    return markNotifyFailure(env, itemKey, error, nowMs);
  }

  return markNotifySent(env, itemKey, result, nowMs);
}

export async function reconcileDueNotifications(env, nowMs, dependencies = {}) {
  assertEnv(env);
  assertNow(nowMs);
  if (typeof env.DATA.list !== 'function' || typeof env.DATA.delete !== 'function') {
    throw new TypeError('env.DATA list and delete methods are required');
  }

  let cursor = '';
  let processed = 0;
  let scanned = 0;
  let attempted = 0;
  let staleDeleted = 0;
  let reachedFuture = false;

  while (processed < MAX_DUE_PER_RECONCILE
    && scanned < MAX_DUE_KEYS_SCANNED_PER_RECONCILE
    && !reachedFuture) {
    const page = await env.DATA.list({ prefix: DUE_PREFIX, cursor, limit: LIST_PAGE_LIMIT });
    const keys = Array.isArray(page?.keys) ? page.keys : [];
    for (const entry of keys) {
      if (processed >= MAX_DUE_PER_RECONCILE
        || scanned >= MAX_DUE_KEYS_SCANNED_PER_RECONCILE) break;
      const dueKey = entry?.name;
      if (typeof dueKey !== 'string') continue;
      const dueTime = dueTimeFromKey(dueKey);
      if (dueTime !== null && dueTime > nowMs) {
        reachedFuture = true;
        break;
      }
      scanned += 1;
      const itemKey = await env.DATA.get(dueKey);
      const item = typeof itemKey === 'string' ? await readAuthoritativeNotifyItem(env, itemKey) : null;
      if (!item || item.due_key !== dueKey) {
        processed += 1;
        await env.DATA.delete(dueKey);
        staleDeleted += 1;
        continue;
      }
      if (!(await notifyGroupIsReady(env, item))) {
        // A Task 6 source repair can deterministically recreate this reference.
        // Removing it keeps incomplete chat groups out of the ordinary delivery
        // queue, while the attempt-level readiness check remains the race guard.
        await env.DATA.delete(dueKey);
        continue;
      }
      processed += 1;
      attempted += 1;
      await attemptNotifyIntent(env, itemKey, nowMs, dependencies);
    }

    if (processed >= MAX_DUE_PER_RECONCILE
      || scanned >= MAX_DUE_KEYS_SCANNED_PER_RECONCILE
      || reachedFuture
      || page?.list_complete !== false) break;
    if (typeof page.cursor !== 'string' || page.cursor.length === 0 || page.cursor === cursor) break;
    cursor = page.cursor;
  }

  return { processed, attempted, stale_deleted: staleDeleted };
}

async function listReferenceItemKeys(env, prefix) {
  const itemKeys = [];
  let cursor = '';
  do {
    const page = await env.DATA.list({ prefix, cursor, limit: LIST_PAGE_LIMIT });
    for (const entry of Array.isArray(page?.keys) ? page.keys : []) {
      const itemKey = await env.DATA.get(entry.name);
      if (typeof itemKey === 'string') itemKeys.push(itemKey);
    }
    if (page?.list_complete !== false) break;
    if (typeof page.cursor !== 'string' || page.cursor.length === 0 || page.cursor === cursor) break;
    cursor = page.cursor;
  } while (true);
  return [...new Set(itemKeys)].sort();
}

async function buildDailySummarySource(env, dateJst) {
  const itemKeys = await listReferenceItemKeys(env, `notify:daily:${dateJst}:`);
  const counts = {
    total: 0,
    sent: 0,
    pending: 0,
    retry: 0,
    failed: 0,
    dead_letter: 0,
  };
  const notes = [];
  for (const itemKey of itemKeys) {
    const item = await readAuthoritativeNotifyItem(env, itemKey);
    if (!item) continue;
    counts.total += 1;
    if (Object.prototype.hasOwnProperty.call(counts, item.status) && item.status !== 'total') {
      counts[item.status] += 1;
    }
    if (notes.length < MAX_DAILY_NOTES) {
      const channel = ['email', 'telegram'].includes(item.channel) ? item.channel : 'unknown';
      const status = ['sent', 'pending', 'retry', 'failed', 'dead_letter'].includes(item.status)
        ? item.status : 'unknown';
      notes.push(`${channel}: ${status}`);
    }
  }
  const summary = [
    `Total ${counts.total}`,
    `Sent ${counts.sent}`,
    `Pending ${counts.pending}`,
    `Retry ${counts.retry}`,
    `Failed ${counts.failed}`,
    `Dead letter ${counts.dead_letter}`,
  ].join(' / ');
  return { dateJst, summary, counts, notes };
}

export async function ensureDailyReconcileSummary(env, nowMs, dependencies = {}) {
  assertEnv(env);
  assertNow(nowMs);
  if (typeof env.DATA.list !== 'function') throw new TypeError('env.DATA list method is required');
  if (new Date(nowMs).getUTCHours() !== 0) {
    return { active: false, source_created: false, created_item_keys: [] };
  }

  const dateJst = previousJstDate(nowMs);
  const summaryKey = `notify:summary:${dateJst}`;
  let source = await readJson(env, summaryKey);
  let sourceCreated = false;
  if (!source) {
    source = await buildDailySummarySource(env, dateJst);
    await env.DATA.put(summaryKey, JSON.stringify(source), putOptions());
    sourceCreated = true;
  }

  const payloadHash = await sha256(JSON.stringify(source));
  const createdItemKeys = [];
  for (const channel of ['email', 'telegram']) {
    const recipientIdentity = channel === 'email' ? OWNER_EMAIL_TO : (env.TELEGRAM_CHAT_ID || 'unconfigured');
    const result = await createNotifyIntent(env, {
      entityKind: 'summary',
      entityId: dateJst,
      channel,
      template: 'owner_daily_v1',
      sourceKey: summaryKey,
      payloadHash,
      recipientFingerprint: await sha256(`${channel}:${recipientIdentity}`),
    }, nowMs);
    if (result.created) createdItemKeys.push(result.itemKey);
  }

  void dependencies;
  return {
    active: true,
    date_jst: dateJst,
    summary_key: summaryKey,
    source_created: sourceCreated,
    created_item_keys: createdItemKeys,
  };
}
