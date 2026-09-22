'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../booking.html'), 'utf8');
const marker = '// ===== Booking Form Submission — POSTs to fuluck-api Worker =====';
const markerAt = html.indexOf(marker);
assert.notEqual(markerAt, -1, 'booking submit marker must exist');
const scriptStart = html.lastIndexOf('<script>', markerAt);
const scriptEnd = html.indexOf('</script>', markerAt);
assert.ok(scriptStart >= 0 && scriptEnd > markerAt, 'booking inline script bounds');
const bookingScript = html.slice(scriptStart + '<script>'.length, scriptEnd);

class FakeTimers {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.active = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.active.set(id, { callback, at: this.now + Number(delay) });
    return id;
  }

  clearTimeout(id) {
    this.active.delete(id);
  }

  advanceBy(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      const due = [...this.active.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due;
      this.active.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = end;
  }
}

class FakeElement {
  constructor(id, value = '') {
    this.id = id;
    this.value = value;
    this.hidden = false;
    this.disabled = false;
    this.className = '';
    this.textContent = '';
    this.placeholder = '';
    this.style = { display: '' };
    this.attributes = new Map();
    this.listeners = new Map();
    this.scrollCount = 0;
    this.focusCount = 0;
    this.validity = { badInput: false };
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  dispatch(type) {
    const event = { preventDefault() {} };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }

  setAttribute(name, value) {
    // Chromium date controls clear unfinished keyboard input when min is set,
    // even to its current value (independently reproduced in browser review).
    if (name === 'min' && this.validity.badInput) {
      this.value = '';
      this.validity.badInput = false;
    }
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  scrollIntoView() {
    this.scrollCount += 1;
  }

  focus() {
    this.focusCount += 1;
  }

  querySelector() {
    return null;
  }
}

async function flushMicrotasks(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function createHarness(responseModes, options = {}) {
  let now = Date.parse(options.now || '2026-09-07T01:00:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const timers = new FakeTimers();
  const elements = new Map();
  const add = (id, value = '') => {
    const element = new FakeElement(id, value);
    elements.set(id, element);
    return element;
  };

  const form = add('bookingForm');
  const submit = add('bookingSubmit');
  const buttonText = new FakeElement('buttonText');
  const buttonSending = new FakeElement('buttonSending');
  buttonSending.hidden = true;
  submit.querySelector = (selector) => {
    if (selector === '.btn-text') return buttonText;
    if (selector === '.btn-sending') return buttonSending;
    return null;
  };

  const success = add('bookingSuccess');
  success.className = 'booking-result';
  const error = add('bookingError');
  error.className = 'booking-result';
  const errorHeading = new FakeElement('bookingErrorHeading');
  error.querySelector = (selector) => (selector === 'h3' ? errorHeading : null);

  add('bookingRetry');
  add('bookingSuccessKittens');
  add('bk-name', 'Synthetic Visitor');
  add('bk-email', 'synthetic@example.test');
  add('bk-phone', '');
  add('bk-date', '2026-09-10');
  add('bk-date2', '');
  add('bk-time', '');
  add('bk-method', 'onsite');
  add('bk-kitten', '');
  add('bk-message', 'synthetic non-customer fixture');
  for (const id of ['name', 'email', 'phone', 'date', 'date2', 'method', 'message']) {
    add(`bk-${id}-err`).hidden = true;
  }

  form.querySelector = (selector) => {
    if (selector !== '[aria-invalid="true"]') return null;
    return [...elements.values()].find(
      (element) => element.getAttribute('aria-invalid') === 'true',
    ) || null;
  };

  const requests = [];
  function fetchStub(url, options) {
    assert.equal(url, 'https://fuluck-api.mouxue56.workers.dev/api/booking');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    const mode = responseModes[requests.length];
    assert.ok(mode, `unexpected fetch call ${requests.length + 1}`);
    const request = {
      signal: options.signal,
      payload: JSON.parse(options.body),
      abortEvents: 0,
    };
    requests.push(request);

    return Promise.resolve({
      status: mode === 'http-failure' ? 503 : 200,
      json() {
        if (mode === 'invalid-json') {
          return Promise.reject(new SyntaxError('synthetic invalid JSON'));
        }
        if (mode === 'pending-until-abort') {
          return new Promise((resolve, reject) => {
            const onAbort = () => {
              request.abortEvents += 1;
              reject(new DOMException('synthetic abort', 'AbortError'));
            };
            request.signal.addEventListener('abort', onAbort, { once: true });
          });
        }
        return Promise.resolve(
          mode === 'success'
            ? { ok: true, request_id: 'synthetic-request' }
            : { ok: false, error: 'synthetic failure' },
        );
      },
    });
  }

  const localStorage = { getItem() { return options.lang || 'ja'; } };
  const sessionStorage = { getItem() { return null; } };
  const context = {
    Date: ClockDate,
    gtag: options.gtag,
    AbortController,
    AbortSignal,
    DOMException,
    URLSearchParams,
    clearTimeout: timers.clearTimeout.bind(timers),
    console: { error() {} },
    document: {
      getElementById(id) { return elements.get(id) || null; },
      querySelectorAll() { return []; },
    },
    fetch: fetchStub,
    localStorage,
    sessionStorage,
    setTimeout: timers.setTimeout.bind(timers),
  };
  context.window = context;
  context.globalThis = context;
  context.location = { search: '' };
  context.crypto = { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
  context.addEventListener = () => {};

  vm.createContext(context);
  vm.runInContext(bookingScript, context, { filename: 'booking.html#submit' });
  // Execute any later inline date initializer as the browser does; after the
  // date logic moves into submission scope this list is simply empty.
  for (const match of html.slice(scriptEnd + '</script>'.length).matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(match[1], context, { filename: 'booking.html#later-inline' });
  }

  return {
    elements,
    setNow(value) { now = Date.parse(value); },
    error,
    errorHeading,
    form,
    requests,
    submit,
    success,
    timers,
    submitForm() { form.dispatch('submit'); },
  };
}

test('response body timeout recovers the form and accepts an idempotent retry', async () => {
  const harness = createHarness(['pending-until-abort', 'success']);

  harness.submitForm();
  await flushMicrotasks();
  assert.equal(harness.submit.disabled, true);
  assert.equal(harness.submit.getAttribute('aria-busy'), 'true');
  assert.equal(harness.error.className, 'booking-result');

  harness.timers.advanceBy(20_000);
  await flushMicrotasks();
  assert.equal(harness.requests[0].signal.aborted, true);
  assert.equal(harness.requests[0].abortEvents, 1);
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.submit.getAttribute('aria-busy'), 'false');
  assert.equal(harness.error.className, 'booking-result error');
  assert.equal(harness.errorHeading.focusCount, 1);

  harness.submitForm();
  await flushMicrotasks();
  assert.equal(harness.requests.length, 2);
  assert.equal(
    harness.requests[1].payload.submission_id,
    harness.requests[0].payload.submission_id,
  );
  assert.equal(harness.form.style.display, 'none');
  assert.equal(harness.success.className, 'booking-result success');
});

test('complete success clears its timeout and never falls into error recovery', async () => {
  const harness = createHarness(['success']);

  harness.submitForm();
  await flushMicrotasks();
  assert.equal(harness.form.style.display, 'none');
  assert.equal(harness.success.className, 'booking-result success');

  harness.timers.advanceBy(20_001);
  await flushMicrotasks();
  assert.equal(harness.requests[0].signal.aborted, false);
  assert.equal(harness.error.className, 'booking-result');
  assert.equal(harness.errorHeading.focusCount, 0);
});

test('complete HTTP failure clears its timeout and stays recoverable', async () => {
  const harness = createHarness(['http-failure']);

  harness.submitForm();
  await flushMicrotasks();
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.submit.getAttribute('aria-busy'), 'false');
  assert.equal(harness.error.className, 'booking-result error');
  assert.equal(harness.errorHeading.focusCount, 1);

  harness.timers.advanceBy(20_001);
  await flushMicrotasks();
  assert.equal(harness.requests[0].signal.aborted, false);
  assert.equal(harness.requests[0].abortEvents, 0);
  assert.equal(harness.errorHeading.focusCount, 1);
});

test('invalid JSON normalizes to existing recovery and clears its timeout', async () => {
  const harness = createHarness(['invalid-json']);

  harness.submitForm();
  await flushMicrotasks();
  assert.equal(harness.submit.disabled, false);
  assert.equal(harness.submit.getAttribute('aria-busy'), 'false');
  assert.equal(harness.error.className, 'booking-result error');
  assert.equal(harness.errorHeading.focusCount, 1);

  harness.timers.advanceBy(20_001);
  await flushMicrotasks();
  assert.equal(harness.requests[0].signal.aborted, false);
  assert.equal(harness.errorHeading.focusCount, 1);
});

for (const field of ['bk-date', 'bk-date2']) {
  for (const value of ['2000-01-01', '2026-09-07', '2027-02-30']) {
    test(`${field} rejects ${value} without submitting and focuses its inline error`, async () => {
      const h = createHarness(['success']);
      const input = h.elements.get(field);
      input.value = value;
      h.submitForm();
      await flushMicrotasks();
      assert.equal(h.requests.length, 0);
      assert.equal(input.getAttribute('aria-invalid'), 'true');
      assert.equal(input.focusCount, 1);
      assert.equal(h.elements.get(`${field}-err`).hidden, false);
    });
  }
}

for (const [now, tomorrow] of [
  ['2026-09-07T14:59:59Z', '2026-09-08'],
  ['2026-09-07T15:00:00Z', '2026-09-09'],
  ['2026-12-31T15:00:00Z', '2027-01-02'],
  ['2028-02-28T15:00:00Z', '2028-03-01'],
]) {
  test(`JST tomorrow ${tomorrow} stays bookable at ${now}`, async () => {
    const h = createHarness(['success'], { now });
    for (const id of ['bk-date', 'bk-date2']) {
      assert.equal(h.elements.get(id).getAttribute('min'), tomorrow);
      h.elements.get(id).value = tomorrow;
    }
    h.submitForm();
    await flushMicrotasks();
    assert.equal(h.requests.length, 1);
    assert.equal(h.success.className, 'booking-result success');
  });
}

test('an open page refreshes the JST bound when midnight passes before submit', async () => {
  const h = createHarness(['success'], { now: '2026-09-07T14:59:59Z' });
  h.elements.get('bk-date').value = '2026-09-08';
  h.setNow('2026-09-07T15:00:00Z');
  h.submitForm();
  await flushMicrotasks();
  assert.equal(h.requests.length, 0);
  assert.equal(h.elements.get('bk-date').getAttribute('min'), '2026-09-09');
});

for (const lang of ['ja', 'en', 'zh']) {
  test(`${lang} second-date change shows localized error and valid correction clears it`, () => {
    const h = createHarness(['success'], { lang });
    const input = h.elements.get('bk-date2');
    const error = h.elements.get('bk-date2-err');
    input.value = '2026-09-07';
    input.dispatch('change');
    assert.equal(error.hidden, false);
    assert.match(error.textContent, {ja: /日本時間/, en: /Japan time/, zh: /日本时间/}[lang]);
    input.value = '';
    input.dispatch('change');
    assert.equal(error.hidden, true);
    assert.equal(input.getAttribute('aria-invalid'), null);
  });
}

for (const crossesMidnight of [false, true]) {
  test(`unfinished optional date survives validation and blocks submit (midnight=${crossesMidnight})`, async () => {
    const h = createHarness(['success'], { now: '2026-09-07T14:59:59Z' });
    const second = h.elements.get('bk-date2');
    second.value = '';
    second.validity.badInput = true;
    if (crossesMidnight) h.setNow('2026-09-07T15:00:00Z');
    // A first-date blur also refreshes the shared minimum: it must not erase
    // unfinished input in the second field before that field is validated.
    h.elements.get('bk-date').dispatch('blur');
    second.dispatch('blur');
    assert.equal(second.validity.badInput, true);
    assert.equal(second.getAttribute('aria-invalid'), 'true');
    h.submitForm();
    await flushMicrotasks();
    assert.equal(h.requests.length, 0);
    assert.equal(h.elements.get('bk-date2-err').hidden, false);

    // Explicitly clearing the native partial input restores optional semantics.
    second.validity.badInput = false;
    second.dispatch('change');
    assert.equal(second.getAttribute('min'), crossesMidnight ? '2026-09-09' : '2026-09-08');
    h.submitForm();
    await flushMicrotasks();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].payload.preferred_date2, '');
  });
}

for (const lang of ['ja', 'en', 'zh']) {
  test(`booking success keeps ${lang} catalogue navigation`, () => {
    const h = createHarness(['success'], { lang });
    assert.equal(h.elements.get('bookingSuccessKittens').getAttribute('href'), lang === 'ja' ? '/kittens.html' : `/${lang}/kittens.html`);
  });
}


test('a saved booking stays successful when optional analytics throws', async () => {
  const h = createHarness(['success'], { gtag() { throw new Error('analytics unavailable'); } });
  h.submitForm();
  await flushMicrotasks();
  assert.equal(h.requests.length, 1);
  assert.equal(h.form.style.display, 'none');
  assert.equal(h.success.className, 'booking-result success');
  assert.equal(h.error.className, 'booking-result');
  assert.equal(h.errorHeading.focusCount, 0);
});

test('raw message length matches server limit including surrounding whitespace', async () => {
  const h = createHarness(['success']);
  h.elements.get('bk-message').value = ' '.repeat(2000) + 'x';
  h.submitForm();
  await flushMicrotasks();
  assert.equal(h.requests.length, 0);
  assert.equal(h.elements.get('bk-message').getAttribute('aria-invalid'), 'true');
  assert.equal(h.elements.get('bk-message').focusCount, 1);
});
