'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_ORIGIN = 'https://fuluckpet.com';
const ADMIN_PASSWORD = 'test-only-calendar-delete-password';
const ADMIN_SALT = '1234567890abcdef1234567890abcdef';

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password, salt) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${password}:${salt}`)));
}

async function calendarDeleteHarness(events, dogPublic = false) {
  const store = new Map([
    ['pw:salt', ADMIN_SALT],
    ['pw:hash', await passwordHash(ADMIN_PASSWORD, ADMIN_SALT)],
    ['calendar_events', JSON.stringify({ rev: 4, events })],
  ]);
  const puts = [];
  const gets = [];
  return {
    store,
    puts,
    gets,
    env: {
      DOG_SERVICES_PUBLIC: dogPublic ? 'true' : 'false',
      DATA: {
        async get(key, type) {
          gets.push(key);
          const value = store.get(key) ?? null;
          return type === 'json' && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value) {
          puts.push({ key, value });
          store.set(key, value);
        },
      },
    },
  };
}

function calendarDeleteRequest(id) {
  return new Request(`https://fuluckpet.com/api/admin/calendar?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Origin: ADMIN_ORIGIN, Authorization: `Bearer ${ADMIN_PASSWORD}` },
  });
}

function calendarUpdateRequest(id, body) {
  return new Request(`https://fuluckpet.com/api/admin/calendar?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      Origin: ADMIN_ORIGIN,
      Authorization: `Bearer ${ADMIN_PASSWORD}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('dog calendar policy rejects dog boarding and care by default and allows only the explicit true gate', async () => {
  const policy = await import(pathToFileURL(path.join(ROOT, 'api/calendar-dog-policy.mjs')).href);
  for (const event of [
    { type: 'boarding', petType: 'dog_small' },
    { type: 'boarding', petType: 'dog_medium' },
    { type: 'boarding', petType: 'dog_large' },
    { type: 'care', petType: 'dog_small' },
  ]) {
    assert.equal(policy.isDogCalendarEvent(event), true);
    assert.equal(policy.canWriteDogCalendarEvent(event, {}), false);
    assert.equal(policy.canWriteDogCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'false' }), false);
    assert.equal(policy.canWriteDogCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'true' }), true);
  }
  assert.equal(policy.canWriteDogCalendarEvent({ type: 'boarding', petType: 'cat' }, {}), true);
  assert.equal(policy.isDogCalendarEvent({ type: 'care', petType: 'cat' }), false);
  assert.equal(policy.canWriteDogCalendarEvent({ type: 'care', petType: 'cat' }, {}), true);
  assert.equal(policy.isDogCalendarEvent({ type: 'care', petType: 'dog_small' }), true);
  assert.equal(policy.canWriteDogCalendarEvent({ type: 'care', petType: 'dog_small' }, {}), false);
});

test('calendar write policy accepts only cat or explicitly enabled current dog care', async () => {
  const policy = await import(pathToFileURL(path.join(ROOT, 'api/calendar-dog-policy.mjs')).href);

  assert.equal(policy.canWriteCalendarEvent({ type: 'care', petType: 'cat' }, {}), true);
  for (const petType of policy.DOG_PET_TYPES) {
    assert.equal(policy.canWriteCalendarEvent({ type: 'care', petType }, {}), false, petType);
    assert.equal(policy.canWriteCalendarEvent(
      { type: 'care', petType },
      { DOG_SERVICES_PUBLIC: 'true' },
    ), true, petType);
  }

  for (const petType of [undefined, 'rabbit', 'hamster', 'other_small_animal', 'small_dog', 'medium_dog', 'large_dog']) {
    const event = { type: 'care' };
    if (petType !== undefined) event.petType = petType;
    assert.equal(policy.canWriteCalendarEvent(event, {}), false, String(petType));
    assert.equal(policy.canWriteCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'true' }), false, String(petType));
  }
});

test('calendar update policy keeps historical non-cat care read-only while the dog gate is false', async () => {
  const policy = await import(pathToFileURL(path.join(ROOT, 'api/calendar-dog-policy.mjs')).href);
  const mergedCat = { type: 'care', petType: 'cat' };

  for (const previous of [
    { type: 'care', petType: 'dog_small' },
    { type: 'care', petType: 'small_dog' },
    { type: 'care' },
    { type: 'care', petType: 'rabbit' },
  ]) {
    assert.equal(policy.canUpdateCalendarEvent(previous, mergedCat, {}), false, JSON.stringify(previous));
  }

  assert.equal(policy.canUpdateCalendarEvent(
    { type: 'care', petType: 'dog_small' },
    { type: 'care', petType: 'dog_small' },
    { DOG_SERVICES_PUBLIC: 'true' },
  ), true);
  assert.equal(policy.canUpdateCalendarEvent(
    { type: 'care', petType: 'small_dog' },
    { type: 'care', petType: 'small_dog' },
    { DOG_SERVICES_PUBLIC: 'true' },
  ), false);
  for (const previous of [
    { type: 'boarding', petType: 'small_dog' },
    { type: 'visit', petType: 'medium_dog' },
    { type: 'note', petType: 'large_dog' },
  ]) {
    assert.equal(policy.canUpdateCalendarEvent(previous, { ...previous, title: '変更' }, {
      DOG_SERVICES_PUBLIC: 'true',
    }), false, JSON.stringify(previous));
  }
});

test('Worker PUT atomically rejects stopped and legacy dogs without changing KV or rev', async () => {
  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'api/worker.js')).href);
  const cases = [
    [{ id: 'current-closed', type: 'boarding', petType: 'dog_small' }, false],
    [{ id: 'legacy-small', type: 'boarding', petType: 'small_dog' }, true],
    [{ id: 'legacy-medium', type: 'visit', petType: 'medium_dog' }, true],
    [{ id: 'legacy-large', type: 'note', petType: 'large_dog' }, true],
  ];
  for (const [event, dogPublic] of cases) {
    const stored = { ...event, title: '保持', start: '2026-07-01', end: '2026-07-01', status: 'confirmed' };
    const h = await calendarDeleteHarness([stored], dogPublic);
    const before = h.store.get('calendar_events');
    const response = await worker.fetch(calendarUpdateRequest(event.id, { title: '変更' }), h.env, { waitUntil() {} });
    assert.equal(response.status, 409, event.id);
    assert.deepEqual(await response.json(), { error: '犬サービスは現在受付停止です' }, event.id);
    assert.equal(h.puts.length, 0, event.id);
    assert.equal(h.store.get('calendar_events'), before, event.id);
    assert.equal(h.gets.filter((key) => key === 'calendar_events').length, 1, event.id);
  }
});

test('calendar delete policy protects stopped current, legacy, and malformed historical records', async () => {
  const policy = await import(pathToFileURL(path.join(ROOT, 'api/calendar-dog-policy.mjs')).href);
  const currentDog = { type: 'boarding', petType: 'dog_small' };
  const immutableHistory = [
    { type: 'boarding', petType: 'small_dog' },
    { type: 'care' },
    { type: 'care', petType: 'rabbit' },
  ];

  assert.equal(policy.canDeleteCalendarEvent({ type: 'care', petType: 'cat' }, {}), true);
  assert.equal(policy.canDeleteCalendarEvent({ type: 'boarding', petType: 'cat' }, {}), true);
  assert.equal(policy.canDeleteCalendarEvent(currentDog, {}), false);
  assert.equal(policy.canDeleteCalendarEvent(currentDog, { DOG_SERVICES_PUBLIC: 'true' }), true);
  for (const event of immutableHistory) {
    assert.equal(policy.canDeleteCalendarEvent(event, {}), false, JSON.stringify(event));
    assert.equal(policy.canDeleteCalendarEvent(event, { DOG_SERVICES_PUBLIC: 'true' }), false, JSON.stringify(event));
  }
});

test('Worker DELETE rejects protected calendar records without a KV write and deletes allowed records', async () => {
  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'api/worker.js')).href);
  const protectedCases = [
    [{ id: 'current-dog', type: 'boarding', petType: 'dog_small' }, false],
    [{ id: 'legacy-dog', type: 'boarding', petType: 'small_dog' }, false],
    [{ id: 'missing-care', type: 'care' }, false],
    [{ id: 'other-care', type: 'care', petType: 'rabbit' }, false],
    [{ id: 'legacy-open', type: 'care', petType: 'small_dog' }, true],
  ];
  for (const [event, dogPublic] of protectedCases) {
    const h = await calendarDeleteHarness([event], dogPublic);
    const response = await worker.fetch(calendarDeleteRequest(event.id), h.env, { waitUntil() {} });
    assert.equal(response.status, 409, event.id);
    assert.deepEqual(await response.json(), { error: '犬サービスは現在受付停止です' }, event.id);
    assert.equal(h.puts.length, 0, event.id);
    assert.deepEqual(JSON.parse(h.store.get('calendar_events')).events, [event], event.id);
  }

  const missingHarness = await calendarDeleteHarness([
    { id: 'keep-cat', type: 'care', petType: 'cat' },
  ], false);
  const missingResponse = await worker.fetch(
    calendarDeleteRequest('absent-event'),
    missingHarness.env,
    { waitUntil() {} },
  );
  assert.equal(missingResponse.status, 404);
  assert.equal(missingHarness.puts.length, 0);
  assert.deepEqual(JSON.parse(missingHarness.store.get('calendar_events')).events, [
    { id: 'keep-cat', type: 'care', petType: 'cat' },
  ]);

  for (const [event, dogPublic] of [
    [{ id: 'cat-care', type: 'care', petType: 'cat' }, false],
    [{ id: 'current-dog-open', type: 'boarding', petType: 'dog_small' }, true],
  ]) {
    const h = await calendarDeleteHarness([event], dogPublic);
    const response = await worker.fetch(calendarDeleteRequest(event.id), h.env, { waitUntil() {} });
    assert.equal(response.status, 200, event.id);
    assert.deepEqual(await response.json(), { rev: 5, ok: true }, event.id);
    assert.equal(h.puts.length, 1, event.id);
    assert.deepEqual(JSON.parse(h.store.get('calendar_events')).events, [], event.id);
  }
});

test('worker and admin expose prepared dog types but keep the production write gate false', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'api/worker.js'), 'utf8');
  const wrangler = fs.readFileSync(path.join(ROOT, 'api/wrangler.toml'), 'utf8');
  const admin = fs.readFileSync(path.join(ROOT, 'admin/calendar.html'), 'utf8');
  assert.match(worker, /CAL_EVENT_TYPES\s*=\s*\[[^\]]*'care'/);
  for (const type of ['dog_small', 'dog_medium', 'dog_large']) {
    assert.match(worker, new RegExp(`CAL_PET_TYPES\\s*=\\s*\\[[^\\]]*'${type}'`));
    assert.match(admin, new RegExp(`option value="${type}"[^>]*disabled`));
  }
  assert.match(admin, /犬は現在受付停止/);
  assert.match(admin, /id="evtReadOnlyHint"[^>]*hidden[^>]*data-adm-ja="この予定は読み取り専用です。変更や削除はできません。"[^>]*data-adm-zh="此日程为只读，无法更改或删除。"/);
  assert.match(wrangler, /DOG_SERVICES_PUBLIC\s*=\s*"false"/);
  assert.match(worker, /canWriteCalendarEvent\(data, env\)/);
  assert.match(worker, /canUpdateCalendarEvent\(prev, merged, env\)/);
  assert.doesNotMatch(worker, /const gateDoc =/);

  const readRoute = worker.match(/path === '\/api\/admin\/calendar' && method === 'GET'[\s\S]*?(?=\/\/ POST \/api\/admin\/calendar)/);
  assert.ok(readRoute, 'calendar GET route remains available for historical records');
  assert.doesNotMatch(readRoute[0], /can(?:Write|Update|Delete)(?:Dog)?CalendarEvent/);
});

test('Admin calendar gives cat care a filter, legend, and mobile-safe visual marker', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'admin/calendar.html'), 'utf8');

  assert.match(admin, /<input\b[^>]*data-type="care"[^>]*checked[^>]*>\s*<span\b[^>]*data-adm-ja="猫のケア"[^>]*data-adm-zh="猫护理"[^>]*>猫のケア<\/span>/);
  assert.match(admin, /class="legend-dot"[^>]*background:var\(--cal-care\)[^>]*><\/span><span\b[^>]*data-adm-ja="猫のケア"[^>]*data-adm-zh="猫护理"[^>]*>猫のケア<\/span>/);
  assert.match(admin, /--cal-care:\s*var\(--warning\)/);
  assert.match(admin, /\.cal-chip\.type-care\s*\{[^}]*var\(--cal-care-bg\)[^}]*var\(--cal-care-fg\)/);
  assert.match(admin, /\.cal-dot\.type-care\s*\{[^}]*var\(--cal-care\)/);
  assert.match(admin, /\.evt-type-badge\.type-care\s*\{[^}]*var\(--cal-care-bg\)[^}]*var\(--cal-care-fg\)/);
  assert.match(admin, /\.btn-save:disabled\s*\{[^}]*cursor:\s*not-allowed/);
  assert.match(admin, /@media \(max-width: 640px\)[\s\S]*\.cal-chips\s*\{\s*display:\s*none;\s*\}[\s\S]*\.cal-dots\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(admin, /この予定は読み取り専用です。変更や削除はできません。/);
  assert.doesNotMatch(admin, /この履歴ケアは読み取り専用/);
});

function adminCalendarHarness() {
  const source = fs.readFileSync(path.join(ROOT, 'admin/js/admin-calendar.js'), 'utf8');
  const calls = [];
  const petOptions = [
    ['cat', false],
    ['rabbit', false],
    ['hamster', false],
    ['other_small_animal', false],
    ['dog_small', true],
    ['dog_medium', true],
    ['dog_large', true],
  ].map(([value, disabled]) => ({ value, disabled, dataset: {} }));
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        style: {},
        textContent: '',
        disabled: false,
        hidden: false,
        reset() {},
        scrollIntoView() {},
        querySelectorAll(selector) { return selector === 'option' ? [] : []; },
      });
    }
    return elements.get(id);
  };
  const petSelect = node('evtPetType');
  petSelect.value = 'cat';
  petSelect.appendChild = (option) => {
    option.remove = () => {
      const index = petOptions.indexOf(option);
      if (index !== -1) petOptions.splice(index, 1);
    };
    petOptions.push(option);
  };
  petSelect.querySelectorAll = (selector) => {
    if (selector === 'option') return petOptions;
    if (selector === 'option[data-legacy-pet-type]') {
      return petOptions.filter((option) => option.dataset && option.dataset.legacyPetType);
    }
    return [];
  };
  node('evtType').value = 'visit';
  node('evtPetTypeGroup').style.display = 'none';
  node('evtTitle').value = '猫ケア';
  node('evtStart').value = '2026-08-01';
  node('evtEnd').value = '2026-08-01';
  node('evtTime').value = '';
  node('evtStatus').value = 'confirmed';
  node('evtNotes').value = '';
  node('evtReadOnlyHint').hidden = true;

  const marker = "  document.addEventListener('DOMContentLoaded'";
  assert.ok(source.includes(marker), 'Admin calendar test hook marker');
  const hooked = source.replace(marker, [
    '  window.__dogCalendarGateTest = {',
    '    updatePetTypeVisibility: updatePetTypeVisibility,',
    '    submitForm: submitForm,',
    '    startEdit: startEdit,',
    '    resetForm: resetForm,',
    '    renderDayPanel: renderDayPanel,',
    '    deleteEvent: deleteEvent,',
    '    setEvents: function(nextEvents) { events = nextEvents; }',
    '  };',
    '',
    marker,
  ].join('\n'));
  const pending = { then() { return { catch() {} }; } };
  const context = vm.createContext({
    console,
    document: {
      getElementById: node,
      createElement() { return { value: '', textContent: '', disabled: false, dataset: {} }; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    FuluckAPI: {
      post(url, payload) { calls.push({ method: 'POST', url, payload }); return pending; },
      put(url, payload) { calls.push({ method: 'PUT', url, payload }); return pending; },
      del(url) { calls.push({ method: 'DELETE', url }); return pending; },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    navigator: {},
    confirm() { return true; },
    fetch() { return Promise.resolve({ json: () => Promise.resolve({ success: false }) }); },
    setTimeout,
    clearTimeout,
  });
  context.window = context;
  vm.runInContext(hooked, context, { filename: 'admin-calendar.js' });
  return { api: context.__dogCalendarGateTest, calls, elements, petOptions };
}

test('Admin care mode forces cat while boarding restores licensed pet choices', () => {
  const h = adminCalendarHarness();
  const type = h.elements.get('evtType');
  const pet = h.elements.get('evtPetType');

  type.value = 'care';
  pet.value = 'rabbit';
  h.api.updatePetTypeVisibility();
  assert.equal(h.elements.get('evtPetTypeGroup').style.display, 'block');
  assert.equal(pet.value, 'cat');
  assert.deepEqual(h.petOptions.map((option) => [option.value, option.disabled]), [
    ['cat', false],
    ['rabbit', true],
    ['hamster', true],
    ['other_small_animal', true],
    ['dog_small', true],
    ['dog_medium', true],
    ['dog_large', true],
  ]);

  type.value = 'boarding';
  h.api.updatePetTypeVisibility();
  assert.deepEqual(h.petOptions.map((option) => [option.value, option.disabled]), [
    ['cat', false],
    ['rabbit', false],
    ['hamster', false],
    ['other_small_animal', false],
    ['dog_small', true],
    ['dog_medium', true],
    ['dog_large', true],
  ]);
});

test('Admin submits modeled petType for both cat care and boarding', () => {
  const h = adminCalendarHarness();
  const type = h.elements.get('evtType');
  const pet = h.elements.get('evtPetType');
  const event = { preventDefault() {} };

  type.value = 'care';
  pet.value = 'rabbit';
  h.api.submitForm(event);
  assert.equal(h.calls[0].payload.petType, 'cat');

  type.value = 'boarding';
  pet.value = 'rabbit';
  h.api.submitForm(event);
  assert.equal(h.calls[1].payload.petType, 'rabbit');
});

test('Admin keeps historical non-cat care unchanged and read-only until reset', () => {
  for (const [label, petType, expectedValue] of [
    ['missing', undefined, ''],
    ['current dog', 'dog_small', 'dog_small'],
    ['legacy dog', 'small_dog', 'small_dog'],
    ['other species', 'rabbit', 'rabbit'],
  ]) {
    const h = adminCalendarHarness();
    const historical = {
      id: 'evt_' + label.replace(/\s/g, '_'),
      type: 'care',
      title: '履歴ケア',
      start: '2026-07-01',
      end: '2026-07-01',
      status: 'confirmed',
    };
    if (petType !== undefined) historical.petType = petType;
    h.api.setEvents([historical]);

    h.api.startEdit(historical.id);
    assert.equal(h.elements.get('evtPetType').value, expectedValue, label);
    assert.equal(h.elements.get('btnSaveEvent').disabled, true, label);
    assert.equal(h.elements.get('evtReadOnlyHint').hidden, false, label);
    h.api.submitForm({ preventDefault() {} });
    assert.equal(h.calls.length, 0, label);

    h.api.resetForm();
    assert.equal(h.elements.get('btnSaveEvent').disabled, false, label);
    assert.equal(h.elements.get('evtReadOnlyHint').hidden, true, label);
  }
});

test('Admin hides delete and blocks edit and delete calls for every stopped read-only event', () => {
  const protectedEvents = [
    [{ id: 'current-dog', type: 'boarding', petType: 'dog_small' }, 'お預かり'],
    [{ id: 'current-dog-care', type: 'care', petType: 'dog_small' }, '犬のケア（受付停止）'],
    [{ id: 'legacy-dog', type: 'care', petType: 'small_dog' }, '犬のケア（履歴）'],
    [{ id: 'missing-care', type: 'care' }, '履歴ケア'],
    [{ id: 'other-care', type: 'care', petType: 'rabbit' }, '履歴ケア'],
  ];
  for (const [event, badge] of protectedEvents) {
    const h = adminCalendarHarness();
    const stored = {
      ...event,
      title: '読み取り専用',
      start: '2026-07-01',
      end: '2026-07-01',
      status: 'confirmed',
    };
    h.api.setEvents([stored]);
    h.api.renderDayPanel('2026-07-01');
    assert.doesNotMatch(h.elements.get('dayEventsList').innerHTML, /data-act="delete"/, event.id);
    assert.match(h.elements.get('dayEventsList').innerHTML, new RegExp(`evt-type-badge[^>]*>${badge}<`), event.id);
    h.api.startEdit(event.id);
    assert.equal(h.elements.get('btnSaveEvent').disabled, true, event.id);
    h.api.deleteEvent(event.id);
    assert.equal(h.calls.length, 0, event.id);
  }

  const allowed = adminCalendarHarness();
  allowed.api.setEvents([{
    id: 'cat-care', type: 'care', petType: 'cat', title: '猫ケア',
    start: '2026-07-01', end: '2026-07-01', status: 'confirmed',
  }]);
  allowed.api.renderDayPanel('2026-07-01');
  assert.match(allowed.elements.get('dayEventsList').innerHTML, /data-act="delete"/);
  allowed.api.deleteEvent('cat-care');
  assert.equal(allowed.calls[0].method, 'DELETE');
});
