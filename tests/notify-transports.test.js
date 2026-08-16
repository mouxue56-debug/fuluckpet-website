'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let NotifyTransportError;
let buildBookingOwnerMessage;
let buildChatOwnerMessage;
let buildDailyOwnerMessage;
let sendEmailTransport;
let sendTelegramTransport;

test.before(async () => {
  ({
    NotifyTransportError,
    buildBookingOwnerMessage,
    buildChatOwnerMessage,
    buildDailyOwnerMessage,
    sendEmailTransport,
    sendTelegramTransport,
  } = await import('../api/notify.js'));
});

function createResponse({ ok, status, jsonBody, textBody = '' }) {
  return {
    ok,
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return textBody;
    },
  };
}

test('buildBookingOwnerMessage escapes hostile customer fields for html and telegram', () => {
  const message = buildBookingOwnerMessage({
    name: '<img src=x onerror=alert(1)>',
    email: 'customer@example.com',
    phone: '090-1111-2222',
    preferred_date: '2026-08-20',
    preferred_date2: '2026-08-21',
    preferred_time: '10:00 <script>',
    visit_method: 'LINE <b>video</b>',
    kitten_id: '<b>kitten-1</b>',
    message: '<script>alert(1)</script> & "quoted"',
  }, 'req-123');

  assert.equal(message.subject, '[fuluckpet 予約] <img src=x onerror=alert(1)> さんから新しい見学予約');
  assert.equal(message.replyTo, 'customer@example.com');
  assert.match(message.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(message.html, /10:00 &lt;script&gt;/);
  assert.match(message.html, /LINE &lt;b&gt;video&lt;\/b&gt;/);
  assert.match(message.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quoted&quot;/);
  assert.doesNotMatch(message.html, /<script>alert\(1\)<\/script>/);
  assert.match(message.telegramText, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(message.telegramText, /LINE &lt;b&gt;video&lt;\/b&gt;/);
  assert.match(message.telegramText, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quoted&quot;/);
});

test('buildChatOwnerMessage and buildDailyOwnerMessage produce owner-safe message envelopes', () => {
  const chat = buildChatOwnerMessage({
    sessionId: 'session-1234567890',
    userMessage: 'Need info about <b>pricing</b>',
    assistantMessage: 'Use LINE & stay safe',
    provider: 'mayuki-grok-4.3',
  });
  const daily = buildDailyOwnerMessage({
    dateJst: '2026-08-16',
    summary: 'Sent 3 / Retry 1 / Failed 0',
    notes: ['<b>booking:b-1</b> sent', 'chat:c-1 retry'],
  });

  assert.equal(chat.replyTo, null);
  assert.match(chat.subject, /chat/i);
  assert.match(chat.html, /&lt;b&gt;pricing&lt;\/b&gt;/);
  assert.match(chat.telegramText, /&lt;b&gt;pricing&lt;\/b&gt;/);
  assert.equal(daily.replyTo, null);
  assert.match(daily.subject, /2026-08-16/);
  assert.match(daily.html, /&lt;b&gt;booking:b-1&lt;\/b&gt;/);
  assert.match(daily.telegramText, /&lt;b&gt;booking:b-1&lt;\/b&gt;/);
});

test('chat Telegram message stays within 4096 after escaping without broken HTML entities', () => {
  const adversarial = `&<>"'猫🐾`.repeat(120);
  const message = buildChatOwnerMessage({
    sessionId: 'session-escape-boundary',
    userMessage: adversarial,
    assistantMessage: adversarial,
    provider: 'mayuki-grok-4.3',
  });

  assert.ok(message.telegramText.length <= 4_096, message.telegramText.length);
  assert.match(message.telegramText, /&amp;/);
  assert.match(message.telegramText, /&lt;/);
  assert.match(message.telegramText, /&gt;/);
  assert.match(message.telegramText, /&quot;/);
  assert.match(message.telegramText, /&#39;/);
  assert.match(message.telegramText, /猫/);
  assert.match(message.telegramText, /🐾/);
  assert.equal(
    message.telegramText.replace(/&(amp|lt|gt|quot|#39);/g, '').includes('&'),
    false,
    'escaped output must not end with a partial HTML entity',
  );
  const tags = message.telegramText.match(/<[^>]+>/g) || [];
  assert.equal(tags.filter((tag) => tag === '<b>').length, 3);
  assert.equal(tags.filter((tag) => tag === '</b>').length, 3);
  assert.equal(tags.filter((tag) => tag === '<code>').length, 1);
  assert.equal(tags.filter((tag) => tag === '</code>').length, 1);
  assert.equal(tags.every((tag) => ['<b>', '</b>', '<code>', '</code>'].includes(tag)), true);
});

test('sendEmailTransport uses the Cloudflare Email binding and returns provider metadata', async () => {
  const calls = [];
  const env = {
    EMAIL: {
      async send(payload) {
        calls.push(payload);
        return { id: 'cf-msg-1', status: 200, ignored: 'secret' };
      },
    },
  };
  const message = {
    subject: 'Subject',
    text: 'Body',
    html: '<p>Body</p>',
    telegramText: 'Body',
    replyTo: 'customer@example.com',
  };

  assert.deepEqual(await sendEmailTransport(env, message), {
    providerMessageId: 'cf-msg-1',
    providerStatusCode: 200,
  });
  assert.equal(calls.length, 1);
  const [sent] = calls;
  assert.equal(sent.to, 'mouxue56@gmail.com');
  assert.deepEqual(sent.from, { email: 'noreply@fuluckpet.com', name: 'fuluckpet 通知' });
  assert.equal(sent.replyTo, 'customer@example.com');
  assert.equal(sent.subject, 'Subject');
  assert.equal(sent.text, 'Body');
  assert.equal(sent.html, '<p>Body</p>');
});

test('sendEmailTransport fails closed when the Cloudflare Email binding is missing', async () => {
  await assert.rejects(
    sendEmailTransport({}, {
      subject: 'Subject',
      text: 'Body',
      html: '<p>Body</p>',
      telegramText: 'Body',
      replyTo: 'customer@example.com',
    }),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'email_unconfigured');
      assert.equal(error.permanent, true);
      assert.equal(error.statusCode, null);
      return true;
    },
  );
});

test('sendTelegramTransport classifies HTTP 500 as retryable', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({ ok: false, status: 500, textBody: 'server exploded' }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_http_error');
      assert.equal(error.permanent, false);
      assert.equal(error.statusCode, 500);
      assert.equal(error.detail, 'server exploded');
      assert.equal(error.detail.includes('top-secret-token'), false);
      return true;
    },
  );
});

test('sendTelegramTransport classifies HTTP 429 as retryable', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({ ok: false, status: 429, textBody: 'slow down' }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_http_error');
      assert.equal(error.permanent, false);
      assert.equal(error.statusCode, 429);
      assert.equal(error.detail, 'slow down');
      return true;
    },
  );
});

test('sendTelegramTransport redacts token-bearing request URLs from network exceptions', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => {
        throw new Error('fetch failed for https://api.telegram.org/bottop-secret-token/sendMessage?chat_id=123456');
      },
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_network_error');
      assert.equal(error.permanent, false);
      assert.equal(error.statusCode, null);
      assert.equal(error.detail.includes('top-secret-token'), false);
      assert.equal(error.detail.includes('https://api.telegram.org/bot'), false);
      return true;
    },
  );
});

test('sendTelegramTransport classifies HTTP 404 as permanent', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({ ok: false, status: 404, textBody: 'endpoint missing' }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_http_error');
      assert.equal(error.permanent, true);
      assert.equal(error.statusCode, 404);
      assert.equal(error.detail, 'endpoint missing');
      return true;
    },
  );
});

test('sendTelegramTransport fails closed when token or chat id is missing', async () => {
  await assert.rejects(
    sendTelegramTransport(
      { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' },
      { telegramText: 'Hello' },
      async () => createResponse({ ok: true, status: 200, jsonBody: { ok: true, result: { message_id: 321 } } }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_unconfigured');
      assert.equal(error.permanent, true);
      assert.equal(error.statusCode, null);
      return true;
    },
  );
});

test('sendTelegramTransport classifies API-level 422 rejection as permanent', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({
        ok: true,
        status: 200,
        jsonBody: { ok: false, error_code: 422, description: 'invalid entity payload' },
      }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_api_error');
      assert.equal(error.permanent, true);
      assert.equal(error.statusCode, 422);
      assert.equal(error.detail, 'invalid entity payload');
      return true;
    },
  );
});

test('sendTelegramTransport keeps API-level 429 rejection retryable', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({
        ok: true,
        status: 200,
        jsonBody: { ok: false, error_code: 429, description: 'too many requests' },
      }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_api_error');
      assert.equal(error.permanent, false);
      assert.equal(error.statusCode, 429);
      assert.equal(error.detail, 'too many requests');
      return true;
    },
  );
});

test('sendTelegramTransport classifies API-level rejection in a 200 response', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };

  await assert.rejects(
    sendTelegramTransport(
      env,
      { telegramText: 'Hello' },
      async () => createResponse({
        ok: true,
        status: 200,
        jsonBody: { ok: false, error_code: 403, description: 'forbidden by bot policy' },
      }),
    ),
    (error) => {
      assert.ok(error instanceof NotifyTransportError);
      assert.equal(error.code, 'telegram_api_error');
      assert.equal(error.permanent, true);
      assert.equal(error.statusCode, 403);
      assert.equal(error.detail, 'forbidden by bot policy');
      return true;
    },
  );
});

test('sendTelegramTransport returns provider metadata for a successful Telegram send', async () => {
  const env = {
    TELEGRAM_BOT_TOKEN: 'top-secret-token',
    TELEGRAM_CHAT_ID: '123456',
  };
  const abortController = new AbortController();
  const calls = [];

  const result = await sendTelegramTransport(
    env,
    { telegramText: 'Hello <b>world</b>' },
    async (url, options) => {
      calls.push({ url, options });
      return createResponse({
        ok: true,
        status: 200,
        jsonBody: { ok: true, result: { message_id: 321 } },
      });
    },
    abortController.signal,
  );

  assert.deepEqual(result, {
    providerMessageId: '321',
    providerStatusCode: 200,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/bottop-secret-token/sendMessage');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.signal, abortController.signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    chat_id: '123456',
    text: 'Hello <b>world</b>',
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
});
