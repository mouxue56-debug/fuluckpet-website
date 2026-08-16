# Customer Notification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `fuluckpet.com` booking and every completed AI chat round independently notify Telegram and `mouxue56@gmail.com`, retain auditable per-channel delivery state, retry failures, and send a daily reconciliation summary.

**Architecture:** Keep the existing Workers KV and booking idempotency, add a focused ESM notification module, and store deterministic per-channel intents plus time-ordered due indexes. Request handlers persist source data and intents before background delivery; one five-minute Cron Trigger retries due intents and creates one idempotent 09:00 JST reconciliation summary. Cloudflare Email Routing plus a destination-restricted `send_email` binding sends only to the verified owner address without an API key.

**Tech Stack:** Cloudflare Workers ESM, Workers KV, Cron Triggers, Cloudflare Email Routing/`send_email`, Telegram Bot API, Node.js native test runner, Wrangler 4.70.0 for production deployment and Wrangler 4.123.0 only for Email Routing onboarding.

## Global Constraints

- Recipient is exactly `mouxue56@gmail.com`; never request or store the Gmail password.
- Every completed AI chat round and every accepted booking creates both `email` and `telegram` intents.
- Persist source data and both intents before returning success; channel failures never erase or reject an accepted booking/chat answer.
- Email and Telegram states are independent and use `pending | retry | sent | failed | dead_letter | sent_unknown`.
- Retry delays are exactly 5 minutes, 30 minutes, 6 hours, and 24 hours; the fifth failed attempt becomes `failed`.
- Delivery is at-least-once because Workers KV is eventually consistent; duplicate owner alerts are safer than silent loss and must use deterministic entity/channel/template keys.
- Notification ledger records contain no complete customer message, email, phone, IP, Telegram token, or chat ID; they reference the existing source key and retain only hashes, bounded error codes/details, and provider message IDs.
- Source records and notification ledger records have TTLs no shorter than their current source retention: chat 30 days, booking/notification 90 days.
- The only new Cron Trigger is `*/5 * * * *`; daily summaries are created idempotently by the same handler at 00:00 UTC (09:00 JST).
- Cloudflare email binding is restricted with `destination_address = "mouxue56@gmail.com"` and uses `noreply@fuluckpet.com` as sender.
- No Resend account or `RESEND_API_KEY` is required; existing unused Resend code is removed only after the Cloudflare binding path passes tests.
- Production deployment keeps the repository's release provenance, exact-main, smoke, and rollback gates; no direct uncommitted Worker upload.
- Existing three historical bookings are not replayed as new customer events; they are marked `sent_unknown` or summarized separately, with the 2026-08-07 likely-real booking kept visible for owner follow-up.

---

### Task 1: Deterministic notification ledger primitives

**Files:**
- Create: `api/notify.js`
- Create: `tests/notify-ledger.test.js`

**Interfaces:**
- Produces: `notifyItemKey(spec)`, `notifyDueKey(nextAttemptMs, itemKey)`, `createNotifyIntent(env, spec, nowMs)`, `readNotifyItem(env, itemKey)`, `markNotifySent(env, itemKey, result, nowMs)`, `markNotifyFailure(env, itemKey, error, nowMs)`.
- `spec` is `{ entityKind, entityId, channel, template, sourceKey, payloadHash, recipientFingerprint }`.
- `createNotifyIntent()` returns `{ created, itemKey, dueKey, item }` and never creates a second logical intent for the same entity/channel/template.

- [ ] **Step 1: Write failing ledger tests**

Create `tests/notify-ledger.test.js` with an in-memory KV that implements `get`, `put`, `delete`, and `list`. Add literal assertions for:

```js
assert.equal(
  notifyItemKey({ entityKind: 'booking', entityId: 'b-1', channel: 'email', template: 'owner_booking_v1' }),
  'notify:item:booking:b-1:email:owner_booking_v1',
);
assert.equal(notifyDueKey(1234, 'notify:item:booking:b-1:email:owner_booking_v1'),
  'notify:due:0000000001234:notify%3Aitem%3Abooking%3Ab-1%3Aemail%3Aowner_booking_v1');
```

Also prove the first create stores one item, one due key, and one `notify:daily:YYYY-MM-DD:*` reference; the second create returns `created:false` without resetting an already-sent item.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/notify-ledger.test.js`

Expected: FAIL because `api/notify.js` does not exist.

- [ ] **Step 3: Implement the minimal ledger module**

Implement constants and deterministic builders in `api/notify.js`:

```js
export const NOTIFY_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 6 * 3_600_000, 24 * 3_600_000];

export function notifyItemKey({ entityKind, entityId, channel, template }) {
  return `notify:item:${entityKind}:${entityId}:${channel}:${template}`;
}

export function notifyDueKey(nextAttemptMs, itemKey) {
  return `notify:due:${String(nextAttemptMs).padStart(13, '0')}:${encodeURIComponent(itemKey)}`;
}
```

Validate all enum/string fields before KV writes. Store a bounded item with `attempt_count:0`, `status:'pending'`, timestamps, `source_key`, `payload_hash`, `recipient_fingerprint`, and `due_key`. Write the item, due reference, and JST daily reference with the 90-day TTL.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/notify-ledger.test.js
node --test tests/*.test.js
```

Expected: ledger tests PASS and the existing 708-test baseline remains green.

- [ ] **Step 5: Commit**

```bash
git add api/notify.js tests/notify-ledger.test.js
git commit -m "feat: add auditable notification ledger"
```

### Task 2: Cloudflare email and Telegram transports

**Files:**
- Modify: `api/notify.js`
- Create: `tests/notify-transports.test.js`

**Interfaces:**
- Produces: `buildBookingOwnerMessage(source, requestId)`, `buildChatOwnerMessage(source)`, `buildDailyOwnerMessage(source)`, `sendEmailTransport(env, message)`, `sendTelegramTransport(env, message, fetchImpl, signal)`.
- Each message is `{ subject, text, html, telegramText, replyTo }`; `replyTo` is used only for booking customer email.
- Each transport returns `{ providerMessageId, providerStatusCode }` or throws `NotifyTransportError` with `{ code, permanent, statusCode, detail }`.

- [ ] **Step 1: Write failing transport tests**

Create real behavior tests with a fake `env.EMAIL.send()` and injected `fetchImpl`:

```js
assert.deepEqual(await sendEmailTransport(env, message), {
  providerMessageId: 'cf-msg-1', providerStatusCode: 200,
});
assert.equal(sent.to, 'mouxue56@gmail.com');
assert.equal(sent.from.email, 'noreply@fuluckpet.com');
```

Add Telegram cases for HTTP 500, HTTP 429, HTTP 200 with `{ok:false}`, and HTTP 200 with `{ok:true,result:{message_id:321}}`. The first three must throw classified errors; the last must return message ID `321`. Add literal HTML-escaping assertions for hostile customer fields.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/notify-transports.test.js`

Expected: FAIL because the transport exports do not exist.

- [ ] **Step 3: Implement the transports and templates**

Use the native binding exactly once per email attempt:

```js
const result = await env.EMAIL.send({
  to: 'mouxue56@gmail.com',
  from: { email: 'noreply@fuluckpet.com', name: 'fuluckpet 通知' },
  replyTo: message.replyTo || undefined,
  subject: message.subject,
  text: message.text,
  html: message.html,
});
```

Telegram must inspect both `response.ok` and parsed JSON `body.ok`; bound response/error details to 200 characters and never include tokens. Missing bindings/token/chat ID are permanent configuration errors; 400/401/403 are permanent; 408/429/5xx/network errors are retryable.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/notify-transports.test.js
node --test tests/*.test.js
```

Expected: PASS with no network calls.

- [ ] **Step 5: Commit**

```bash
git add api/notify.js tests/notify-transports.test.js
git commit -m "feat: add verified owner notification transports"
```

### Task 3: Independent attempt, retry, and due reconciliation

**Files:**
- Modify: `api/notify.js`
- Create: `tests/notify-reconcile.test.js`

**Interfaces:**
- Produces: `attemptNotifyIntent(env, itemKey, nowMs, dependencies)`, `reconcileDueNotifications(env, nowMs, dependencies)`, and `ensureDailyReconcileSummary(env, nowMs, dependencies)`.
- `dependencies` contains only `{ fetchImpl, signal }` for external Telegram injection in tests.

- [ ] **Step 1: Write failing state-machine tests**

Cover these literal behaviors:

- `sent` and `dead_letter` items are never sent again.
- Missing source becomes `dead_letter` with `last_error_code:'source_missing'`.
- A retryable first failure becomes `retry`, `attempt_count:1`, and due time `now + 300000`.
- Attempts 2-4 use `1800000`, `21600000`, and `86400000` milliseconds.
- Fifth failure becomes `failed` and has no due key.
- Stale due references are deleted without delivery.
- Email success with Telegram failure leaves the two item keys in independent states.
- JST 09:00 creates one previous-day summary source and exactly two deterministic summary intents; a second run creates none.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/notify-reconcile.test.js`

Expected: FAIL because attempt/reconcile functions do not exist.

- [ ] **Step 3: Implement the state machine**

For each due reference, re-read the item and require `item.due_key === dueKey`. Load source using `item.source_key`; choose the builder by exact template; call only that item's channel transport. On success, store `sent`, provider identifiers, and delete the due key. On retry, write the new item and due reference before deleting the old due reference. Paginate `DATA.list({prefix:'notify:due:', cursor, limit:1000})`, but process at most 100 due entries per scheduled invocation.

At 00:00-00:59 UTC, build the prior JST day's summary from `notify:daily:<date>:` references, store `notify:summary:<date>`, and create email/Telegram summary intents using entity ID `<date>` and template `owner_daily_v1`.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/notify-reconcile.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/notify.js tests/notify-reconcile.test.js
git commit -m "feat: retry and reconcile owner notifications"
```

### Task 4: Booking route integration without duplicate intents

**Files:**
- Modify: `api/worker.js`
- Modify: `tests/booking-idempotency.test.js`
- Create: `tests/booking-notify-ledger.test.js`
- Modify: `booking.html`

**Interfaces:**
- Consumes: `createNotifyIntent()` and `attemptNotifyIntent()` from Task 1-3.
- Booking source remains the existing `booking:<...>` KV record.

- [ ] **Step 1: Write failing booking integration tests**

Extend the MemoryKV/fake context to assert:

- one accepted booking stores the booking first, then one email item and one Telegram item;
- `ctx.waitUntil` receives delivery work only after both items exist;
- sequential duplicate submission returns the original request ID and does not create or attempt a second intent;
- missing email binding never removes the booking and records an email channel failure;
- invalid booking creates no `notify:*` key.

- [ ] **Step 2: Run the booking tests and verify RED**

Run:

```bash
node --test tests/booking-idempotency.test.js tests/booking-notify-ledger.test.js tests/booking-input-safety.test.js
```

Expected: new intent assertions FAIL against the existing direct Resend/Telegram side effects.

- [ ] **Step 3: Integrate booking with the ledger**

After the existing booking KV write, create deterministic `owner_booking_v1` email and Telegram intents whose `entityId` is booking `id`, `sourceKey` is the exact booking KV key, and payload hash is `submissionFingerprint`. Schedule both `attemptNotifyIntent()` calls with `ctx.waitUntil(Promise.allSettled(...))`.

Remove `sendBookingEmail()`/`sendBookingTelegram()` only after all route tests use the new module. The public response remains `{ok:true, request_id}` because accepted source persistence, not transient channel state, defines form success. Correct the stale `booking.html` MailChannels comment.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/booking-idempotency.test.js tests/booking-notify-ledger.test.js tests/booking-input-safety.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/worker.js booking.html tests/booking-idempotency.test.js tests/booking-notify-ledger.test.js
git commit -m "feat: ledger booking email and Telegram delivery"
```

### Task 5: Every completed chat round creates email and Telegram intents

**Files:**
- Modify: `api/worker.js`
- Create: `tests/chat-notify-ledger.test.js`

**Interfaces:**
- Consumes Task 1-3 helpers.
- Reuses one synchronously persisted `chat:log:<sid>:<ts>` source record; no duplicate full chat payload is copied into notification items.

- [ ] **Step 1: Write failing chat integration tests**

Use a fake Mayuki provider response, MemoryKV, fake email binding, and fake Telegram fetch to prove:

- each successful AI response synchronously stores one chat source plus exactly two intents;
- email subject/body include a bounded session short ID, the user's question, and AI answer;
- Telegram and email are independently attempted in `waitUntil`;
- provider failure before a completed answer creates no chat notification;
- a round containing contact data still creates only one normal Telegram round intent plus the existing distinct lead alert, and one email round intent;
- response exposes `notification_status:'queued'` without claiming delivery.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/chat-notify-ledger.test.js`

Expected: FAIL because current chat sends Telegram directly and creates no email intent.

- [ ] **Step 3: Integrate completed chat rounds**

Replace the direct chat-sync Telegram call with:

1. synchronously persist the existing bounded chat log source;
2. create deterministic `owner_chat_round_v1` email and Telegram intents using the round ID `<sid>:<ts>`;
3. schedule independent attempts via one `Promise.allSettled` in `ctx.waitUntil`;
4. preserve the existing separate NEW LEAD alert behavior;
5. return `notification_status:'queued'` and no false `sent` claim.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/chat-notify-ledger.test.js tests/chat-client-contract.test.js tests/chat-cors.test.js
node --test tests/*.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/worker.js tests/chat-notify-ledger.test.js
git commit -m "feat: notify owner for every AI chat round"
```

### Task 6: Scheduled handler, binding, cron, and deployment contracts

**Files:**
- Modify: `api/worker.js`
- Modify: `api/wrangler.toml`
- Create: `tests/notification-config-contract.test.js`
- Modify: `scripts/deploy-and-smoke-worker.sh`
- Modify: `tests/deploy-smoke-script.test.js`

**Interfaces:**
- Default Worker export adds `async scheduled(controller, env, ctx)` and calls both reconciliation functions.

- [ ] **Step 1: Write failing configuration and smoke tests**

Assert behavior/configuration:

```toml
[[send_email]]
name = "EMAIL"
destination_address = "mouxue56@gmail.com"

[triggers]
crons = ["*/5 * * * *"]
```

Import the default Worker and invoke `scheduled()` with fake env/context; assert it schedules one reconciliation promise. Extend the deployment smoke contract to require a read-only notification diagnostic path that proves release/config presence without sending a message.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test tests/notification-config-contract.test.js tests/deploy-smoke-script.test.js
```

Expected: FAIL because no binding, cron, or scheduled handler exists.

- [ ] **Step 3: Implement scheduled/config/smoke contracts**

Add the restricted binding and single cron. Add `scheduled(controller, env, ctx)` to call `reconcileDueNotifications()` and `ensureDailyReconcileSummary()` inside one `ctx.waitUntil(Promise.allSettled(...))`. Add an authenticated-free, side-effect-free `GET /api/notification-health` response containing only booleans (`email_binding`, `telegram_config`, `cron_version`) and release SHA; it must expose no address, token, chat ID, counts, or customer data. Add smoke assertions for HTTP 200, exact release header, and all booleans true.

- [ ] **Step 4: Run strict gates**

Run:

```bash
node --test tests/*.test.js
node tools/verify-generated.js
cd api && npx --yes wrangler@4.70.0 deploy --strict --dry-run --keep-vars
```

Expected: PASS; dry-run lists `EMAIL` and one Cron Trigger without secrets.

- [ ] **Step 5: Commit**

```bash
git add api/worker.js api/wrangler.toml scripts/deploy-and-smoke-worker.sh tests/notification-config-contract.test.js tests/deploy-smoke-script.test.js
git commit -m "feat: schedule notification reconciliation"
```

### Task 7: Cloudflare onboarding, historical migration, and production acceptance

**Files:**
- Modify only through reviewed commits from Tasks 1-6; production state changes use Wrangler/Cloudflare and exact KV keys.

**Interfaces:**
- Requires the owner-confirmed destination `mouxue56@gmail.com`.
- Produces verified Email Routing DNS, one verified destination address, deployed Worker release, a labeled synthetic booking/chat acceptance pair, and cleaned synthetic KV records.

- [ ] **Step 1: Enable Email Routing and create the destination**

Run:

```bash
cd api
npx --yes wrangler@4.123.0 email routing enable fuluckpet.com
npx --yes wrangler@4.123.0 email routing addresses create mouxue56@gmail.com
```

Expected: routing is enabled and the destination is `pending` until the owner clicks Cloudflare's verification email. Do not request a Gmail password.

- [ ] **Step 2: Verify routing and public DNS**

Run:

```bash
npx --yes wrangler@4.123.0 email routing settings fuluckpet.com
npx --yes wrangler@4.123.0 email routing addresses list
dig +short MX fuluckpet.com
dig +short TXT fuluckpet.com
dig +short TXT cf2024-1._domainkey.fuluckpet.com
```

Expected: routing enabled, destination verified, Cloudflare MX, SPF `include:_spf.mx.cloudflare.net`, and DKIM present.

- [ ] **Step 3: Merge reviewed commits to exact main and deploy with rollback gate**

Push the reviewed branch, fast-forward `main`, push `main`, then run:

```bash
bash scripts/deploy-and-smoke-worker.sh --deploy
```

Expected: all tests/verifiers/dry-run pass, deployed version provenance equals exact `origin/main`, notification health passes, and rollback remains available until smoke completes.

- [ ] **Step 4: Migrate historical records without replaying customer notifications**

For the three existing `booking:*` records, create deterministic email/Telegram ledger items with `status:'sent_unknown'`, `attempt_count:0`, no due key, source key only, and 90-day TTL. Create one owner-only historical reconciliation summary that highlights request `8b328d42-b6ef-4835-871c-472c55d84d2d` as still `new`; do not send three fake-new booking alerts.

- [ ] **Step 5: Perform labeled end-to-end acceptance**

Start a bounded live tail, submit one labeled chat round and one labeled booking with deterministic test IDs, and verify:

- source KV exists;
- email item becomes `sent` with provider message ID;
- Telegram item becomes `sent` with provider message ID;
- Gmail receives both labeled messages;
- Telegram receives both labeled messages;
- duplicate booking replay creates no second intent;
- public response never claims a failed channel was sent.

- [ ] **Step 6: Clean synthetic records and verify steady state**

Delete only the exact synthetic booking/chat/lead/notify/due/daily keys created in Step 5, retain external labeled test messages as acceptance evidence, and re-run smoke plus a read-only KV count/status summary. Verify the real 2026-08-07 booking remains untouched.

- [ ] **Step 7: Commit operational documentation through the KB closeout workflow**

Update the existing KB runbook with exact symptoms, cause, commands, and verification; write the session log and NEXT state; close out through `bin/kb-sync.sh --closeout` with explicit paths.
