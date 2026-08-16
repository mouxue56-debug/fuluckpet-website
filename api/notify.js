/** Durable notification intent and retry ledger backed by Cloudflare KV. */

export const NOTIFY_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 6 * 3_600_000, 24 * 3_600_000];
export const CHAT_NOTIFY_DESCRIPTOR_VERSION = 1;
export const CHAT_SOURCE_PAYLOAD_HASH_RULE = 'sha256:json-v1:[ts,sid,provider,user,assistant]';
export const BOOKING_NOTIFY_DESCRIPTOR_VERSION = 1;
export const BOOKING_SOURCE_PAYLOAD_HASH_RULE = 'sha256:submission-fingerprint-v1';

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
const BOOKING_TEMPLATE = 'owner_booking_v1';
const OWNER_CHANNELS = Object.freeze(['email', 'telegram']);
const OPAQUE_ROUND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_BOOKING_ID_RE = /^(?:\d{16}-[0-9a-f]{32}|\d{13}-[0-9a-f]{8})$/i;
const SHA256_RE = /^(?:sha256:)?[0-9a-f]{64}$/i;
const TERMINAL_STATUSES = Object.freeze(['sent', 'failed', 'dead_letter', 'sent_unknown']);
const SOURCE_REPAIR_PAGE_LIMIT = 25;
const REPAIR_CURSOR_KEYS = Object.freeze({
  chat: 'notify:repair:cursor:chat:v1',
  booking: 'notify:repair:cursor:booking:v1',
});
const MAX_REPAIR_CURSOR_LENGTH = 1_024;
const EMAIL_PERMANENT_ERROR_CODES = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_CONTENT_TOO_LARGE',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY',
]);

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
  } else if (spec.template === BOOKING_TEMPLATE && spec.groupReadyKey !== undefined) {
    if (spec.entityKind !== 'booking' || !OPAQUE_BOOKING_ID_RE.test(spec.entityId)) {
      throw new TypeError('booking notification entityId must be opaque');
    }
    if (spec.groupReadyKey !== notifyGroupReadyKey(spec)) {
      throw new TypeError('booking notification groupReadyKey must match its deterministic group key');
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
  const validChat = spec.entityKind === 'chat'
    && spec.template === CHAT_ROUND_TEMPLATE
    && OPAQUE_ROUND_ID_RE.test(spec.entityId);
  const validBooking = spec.entityKind === 'booking'
    && spec.template === BOOKING_TEMPLATE
    && OPAQUE_BOOKING_ID_RE.test(spec.entityId);
  if (!validChat && !validBooking) {
    throw new TypeError('notification group must identify one opaque chat round or booking');
  }
  if (!Array.isArray(spec.channels)
    || spec.channels.length !== OWNER_CHANNELS.length
    || spec.channels.some((channel, index) => channel !== OWNER_CHANNELS[index])) {
    throw new TypeError('notification group channels must be exactly email and telegram');
  }
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
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
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) return '';
  let escaped = '';
  for (const character of wellFormedCodePoints(value)) {
    const piece = escapeHtml(character);
    if (escaped.length + piece.length > maxLength) {
      return escaped.length < maxLength ? `${escaped}…` : escaped;
    }
    escaped += piece;
  }
  return escaped;
}

function boundedCodePointField(value, maxLength) {
  const characters = wellFormedCodePoints(value);
  return characters.length <= maxLength
    ? characters.join('')
    : `${characters.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
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

async function repairTerminalSchedule(env, itemKey, item) {
  const hasSchedule = item.next_attempt_ms !== null || item.due_key !== null;
  const updated = hasSchedule ? {
    ...item,
    next_attempt_ms: null,
    due_key: null,
  } : item;
  if (hasSchedule) await env.DATA.put(itemKey, encodeItem(updated), putOptions());
  if (item.due_key && typeof env.DATA.delete === 'function') await env.DATA.delete(item.due_key);
  return updated;
}

async function readAuthoritativeNotifyItem(env, itemKey) {
  const item = await readJson(env, itemKey);
  if (!item) return null;
  if (item.status === 'sent_unknown') return repairTerminalSchedule(env, itemKey, item);
  const marker = await readSentMarker(env, itemKey);
  if (marker) return repairSentItem(env, itemKey, item, marker);
  return isTerminalStatus(item.status)
    ? repairTerminalSchedule(env, itemKey, item)
    : item;
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
  const telegramPrefix = [
    '<b>【fuluckpet 予約】</b>',
    `<b>名前:</b> ${escapeHtml(boundedCodePointField(submission.name ?? '', 100))}`,
    `<b>メール:</b> ${escapeHtml(boundedCodePointField(submission.email ?? '', 200))}`,
    `<b>電話:</b> ${escapeHtml(boundedCodePointField(submission.phone || '（未記入）', 20))}`,
    `<b>第一希望日:</b> ${escapeHtml(boundedCodePointField(submission.preferred_date ?? '', 10))}`,
    submission.preferred_date2 ? `<b>第二希望日:</b> ${escapeHtml(boundedCodePointField(submission.preferred_date2, 10))}` : null,
    submission.preferred_time ? `<b>希望時間:</b> ${escapeHtml(boundedCodePointField(submission.preferred_time, 50))}` : null,
    submission.visit_method ? `<b>見学方法:</b> ${escapeHtml(boundedCodePointField(submission.visit_method, 50))}` : null,
    submission.kitten_id ? `<b>気になる子猫:</b> ${escapeHtml(boundedCodePointField(submission.kitten_id, 100))}` : null,
    '',
    '<b>メッセージ:</b>',
  ].filter(Boolean).join('\n');
  const telegramSuffix = `\n\n<code>${escapeHtml(boundedCodePointField(requestId, 64))}</code>`;
  const freeTextBudget = Math.max(
    0,
    TELEGRAM_MAX_TEXT_LENGTH - telegramPrefix.length - telegramSuffix.length - 1,
  );
  const telegramMessage = escapeHtmlWithin(submission.message || '（なし）', freeTextBudget);
  const telegramText = `${telegramPrefix}\n${telegramMessage}${telegramSuffix}`;

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
    const providerCode = typeof error?.code === 'string' && /^E_[A-Z0-9_]{1,96}$/.test(error.code)
      ? error.code
      : 'email_send_failed';
    const permanent = EMAIL_PERMANENT_ERROR_CODES.has(providerCode);
    throw new NotifyTransportError({
      code: providerCode,
      permanent,
      statusCode: Number.isInteger(error?.statusCode)
        ? error.statusCode
        : (Number.isInteger(error?.status) ? error.status : null),
      detail: permanent
        ? 'Cloudflare Email Service rejected the request'
        : 'Cloudflare Email Service temporary failure',
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

  if (!isTerminalStatus(item.status)) {
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
    && marker.channels.length === OWNER_CHANNELS.length
    && marker.channels.every((channel, index) => channel === OWNER_CHANNELS[index]);
}

async function notifyGroupIsReady(env, item) {
  if (![CHAT_ROUND_TEMPLATE, BOOKING_TEMPLATE].includes(item.template)) return true;
  if (typeof item.group_ready_key !== 'string') return false;
  try {
    const marker = await readJson(env, item.group_ready_key);
    return groupMarkerMatchesItem(marker, item)
      && await notificationGroupMembersAreDurable(env, marker, item.group_ready_key);
  } catch (_error) {
    // Readiness is a fail-closed send gate. Source repair can rebuild a missing
    // member/reference, while an unrelated due candidate remains isolated.
    return false;
  }
}

async function notificationGroupMembersAreDurable(env, marker, readyKey) {
  if (readyKey !== notifyGroupReadyKey({
    entityKind: marker?.entity_kind,
    entityId: marker?.entity_id,
    template: marker?.template,
  })) return false;

  for (const channel of OWNER_CHANNELS) {
    const itemKey = notifyItemKey({
      entityKind: marker.entity_kind,
      entityId: marker.entity_id,
      channel,
      template: marker.template,
    });
    const member = await readAuthoritativeNotifyItem(env, itemKey);
    if (!member
      || member.item_key !== itemKey
      || member.channel !== channel
      || member.group_ready_key !== readyKey
      || !groupMarkerMatchesItem(marker, member)
      || !Number.isSafeInteger(member.created_at)
      || member.created_at < 0) return false;

    if (!isTerminalStatus(member.status)) {
      if (typeof member.due_key !== 'string'
        || await env.DATA.get(member.due_key) !== itemKey) return false;
    } else if (member.due_key !== null || member.next_attempt_ms !== null) {
      return false;
    }

    const dailyKey = dailyReferenceKey(member.created_at, itemKey);
    if (await env.DATA.get(dailyKey) !== itemKey) return false;
  }
  return true;
}

export async function markNotifyGroupReady(env, spec, nowMs) {
  assertEnv(env);
  validateGroupSpec(spec);
  assertNow(nowMs);
  const readyKey = notifyGroupReadyKey(spec);

  const marker = {
    version: 1,
    status: 'ready',
    entity_kind: spec.entityKind,
    entity_id: spec.entityId,
    template: spec.template,
    source_key: spec.sourceKey,
    payload_hash: spec.payloadHash,
    channels: [...OWNER_CHANNELS],
    ready_at: nowMs,
  };
  if (!(await notificationGroupMembersAreDurable(env, marker, readyKey))) {
    throw new Error('both notification channels must be durable before group readiness');
  }
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
  if (item.status === 'sent_unknown') return repairTerminalSchedule(env, itemKey, item);
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
  if (!item || isTerminalStatus(item.status)) return item;

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
  if (!item || isTerminalStatus(item.status)) return item;
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
  if (!item || isTerminalStatus(item.status)) return item;
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

function descriptorHasExactChannels(descriptor) {
  return Array.isArray(descriptor?.channels)
    && descriptor.channels.length === OWNER_CHANNELS.length
    && descriptor.channels.every((channel, index) => channel === OWNER_CHANNELS[index]);
}

function chatNotificationGroupFromSource(sourceKey, source) {
  const descriptor = source?.notification;
  if (typeof sourceKey !== 'string' || !sourceKey.startsWith('chat:log:')) return null;
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return null;
  if (descriptor.notification_status !== 'pending'
    || descriptor.version !== CHAT_NOTIFY_DESCRIPTOR_VERSION
    || descriptor.template !== CHAT_ROUND_TEMPLATE
    || !descriptorHasExactChannels(descriptor)
    || !OPAQUE_ROUND_ID_RE.test(descriptor.round_id)
    || !Number.isSafeInteger(descriptor.source_ts)
    || descriptor.source_ts < 0
    || descriptor.source_ts !== source.ts
    || descriptor.payload_hash_rule !== CHAT_SOURCE_PAYLOAD_HASH_RULE
    || !SHA256_RE.test(descriptor.payload_hash)) return null;
  return {
    entityKind: 'chat',
    entityId: descriptor.round_id,
    template: CHAT_ROUND_TEMPLATE,
    sourceKey,
    payloadHash: descriptor.payload_hash,
    channels: [...OWNER_CHANNELS],
    sourceTs: descriptor.source_ts,
  };
}

export function bookingNotificationGroupFromSource(sourceKey, source) {
  const descriptor = source?.notification;
  const sourceTimestamp = typeof source?.created_at === 'string'
    ? Date.parse(source.created_at)
    : Number.NaN;
  if (typeof sourceKey !== 'string' || !sourceKey.startsWith('booking:')) return null;
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) return null;
  if (descriptor.notification_status !== 'pending'
    || descriptor.version !== BOOKING_NOTIFY_DESCRIPTOR_VERSION
    || descriptor.booking_id !== source.id
    || descriptor.template !== BOOKING_TEMPLATE
    || !descriptorHasExactChannels(descriptor)
    || !OPAQUE_BOOKING_ID_RE.test(descriptor.booking_id)
    || !Number.isSafeInteger(descriptor.source_ts)
    || descriptor.source_ts < 0
    || !Number.isSafeInteger(sourceTimestamp)
    || descriptor.source_ts !== sourceTimestamp
    || descriptor.payload_hash_rule !== BOOKING_SOURCE_PAYLOAD_HASH_RULE
    || !SHA256_RE.test(descriptor.payload_hash)
    || descriptor.payload_hash !== source.submission_fingerprint) return null;
  return {
    entityKind: 'booking',
    entityId: descriptor.booking_id,
    template: BOOKING_TEMPLATE,
    sourceKey,
    payloadHash: descriptor.payload_hash,
    channels: [...OWNER_CHANNELS],
    sourceTs: descriptor.source_ts,
  };
}

async function ownerRecipientFingerprint(channel, env) {
  const identity = channel === 'email' ? OWNER_EMAIL_TO : (env.TELEGRAM_CHAT_ID || 'unconfigured');
  return sha256(`${channel}:${identity}`);
}

async function repairNotificationGroup(env, group, nowMs) {
  const groupReadyKey = notifyGroupReadyKey(group);
  const ensured = [];
  for (const channel of OWNER_CHANNELS) {
    ensured.push(await ensureNotifyIntent(env, {
      entityKind: group.entityKind,
      entityId: group.entityId,
      channel,
      template: group.template,
      sourceKey: group.sourceKey,
      payloadHash: group.payloadHash,
      recipientFingerprint: await ownerRecipientFingerprint(channel, env),
      groupReadyKey,
    }, group.sourceTs));
  }
  const readiness = await markNotifyGroupReady(env, group, nowMs);
  return {
    changed: readiness.created || ensured.some(({ created, repaired }) => created || repaired),
    readyKey: readiness.readyKey,
  };
}

async function readRepairCursor(env, kind) {
  const state = await readJson(env, REPAIR_CURSOR_KEYS[kind]);
  if (state?.version !== 1 || !isBoundedRepairCursor(state.cursor)) {
    return '';
  }
  return state.cursor;
}

function isBoundedRepairCursor(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_REPAIR_CURSOR_LENGTH;
}

async function persistRepairCursor(env, kind, page, previousCursor, nowMs) {
  const key = REPAIR_CURSOR_KEYS[kind];
  if (page?.list_complete !== false) {
    if (typeof env.DATA.delete === 'function') await env.DATA.delete(key);
    return { listComplete: true, cursorPersisted: false };
  }
  const cursor = page?.cursor;
  if (!isBoundedRepairCursor(cursor)
    || cursor === previousCursor
  ) {
    return { listComplete: false, cursorPersisted: false };
  }
  await env.DATA.put(key, toJson({ version: 1, cursor, updated_at: nowMs }, 'repair cursor', 8_000), putOptions());
  return { listComplete: false, cursorPersisted: true };
}

async function repairNotificationSources(env, kind, nowMs) {
  assertEnv(env);
  assertNow(nowMs);
  if (typeof env.DATA.list !== 'function') throw new TypeError('env.DATA list method is required');
  const prefix = kind === 'chat' ? 'chat:log:' : 'booking:';
  const cursor = await readRepairCursor(env, kind);
  const page = await env.DATA.list({ prefix, cursor, limit: SOURCE_REPAIR_PAGE_LIMIT });
  const entries = Array.isArray(page?.keys) ? page.keys.slice(0, SOURCE_REPAIR_PAGE_LIMIT) : [];
  const result = {
    candidates: 0,
    eligible: 0,
    ready: 0,
    changed: 0,
    skipped: 0,
    failed: 0,
    list_complete: page?.list_complete !== false,
    cursor_persisted: false,
  };

  for (const entry of entries) {
    const sourceKey = entry?.name;
    if (typeof sourceKey !== 'string' || !sourceKey.startsWith(prefix)) continue;
    result.candidates += 1;
    try {
      const source = await readJson(env, sourceKey);
      if (!source) {
        result.skipped += 1;
        continue;
      }
      let group;
      if (kind === 'chat') {
        group = chatNotificationGroupFromSource(sourceKey, source);
        if (!group || await chatSourcePayloadHash(source) !== group.payloadHash) {
          result.skipped += 1;
          continue;
        }
      } else {
        group = bookingNotificationGroupFromSource(sourceKey, source);
        if (!group) {
          result.skipped += 1;
          continue;
        }
      }
      result.eligible += 1;
      const repaired = await repairNotificationGroup(env, group, nowMs);
      result.ready += 1;
      if (repaired.changed) result.changed += 1;
    } catch (_error) {
      // Source/customer data and provider/KV exception text are intentionally not
      // logged. The persisted cursor eventually cycles back for another attempt.
      result.failed += 1;
    }
  }

  const cursorResult = await persistRepairCursor(env, kind, page, cursor, nowMs);
  result.list_complete = cursorResult.listComplete;
  result.cursor_persisted = cursorResult.cursorPersisted;
  return result;
}

export async function repairChatNotificationSources(env, nowMs) {
  return repairNotificationSources(env, 'chat', nowMs);
}

export async function repairBookingNotificationSources(env, nowMs) {
  return repairNotificationSources(env, 'booking', nowMs);
}

async function settleScheduledPhase(operation) {
  try {
    return { ok: true, value: await operation() };
  } catch (_error) {
    // Scheduled results remain content-free. Provider/KV exceptions may contain
    // source keys or transport payloads and must not become metrics or logs here.
    return { ok: false, value: null };
  }
}

export async function runScheduledNotificationRecovery(env, nowMs, dependencies = {}) {
  assertEnv(env);
  assertNow(nowMs);
  const chatRepair = await settleScheduledPhase(
    () => repairChatNotificationSources(env, nowMs),
  );
  const bookingRepair = await settleScheduledPhase(
    () => repairBookingNotificationSources(env, nowMs),
  );
  const due = await settleScheduledPhase(
    () => reconcileDueNotifications(env, nowMs, dependencies),
  );
  const daily = await settleScheduledPhase(
    () => ensureDailyReconcileSummary(env, nowMs, dependencies),
  );
  return { chat_repair: chatRepair, booking_repair: bookingRepair, due, daily };
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
      if (item && isTerminalStatus(item.status)) {
        await env.DATA.delete(dueKey);
        staleDeleted += 1;
        continue;
      }
      if (!item || item.due_key !== dueKey) {
        processed += 1;
        await env.DATA.delete(dueKey);
        staleDeleted += 1;
        continue;
      }
      if (!(await notifyGroupIsReady(env, item))) {
        // Source repair can deterministically recreate this reference. Removing
        // it keeps incomplete chat or booking groups out of the ordinary delivery
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
    sent_unknown: 0,
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
      const status = ['sent', 'sent_unknown', 'pending', 'retry', 'failed', 'dead_letter'].includes(item.status)
        ? item.status : 'unknown';
      notes.push(`${channel}: ${status}`);
    }
  }
  const summary = [
    `Total ${counts.total}`,
    `Sent ${counts.sent}`,
    `Sent unknown ${counts.sent_unknown}`,
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
