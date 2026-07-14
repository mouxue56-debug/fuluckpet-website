'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

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
  assert.match(wrangler, /DOG_SERVICES_PUBLIC\s*=\s*"false"/);
  assert.match(worker, /canWriteDogCalendarEvent/);

  const readRoute = worker.match(/path === '\/api\/admin\/calendar' && method === 'GET'[\s\S]*?(?=\/\/ POST \/api\/admin\/calendar)/);
  assert.ok(readRoute, 'calendar GET route remains available for historical records');
  assert.doesNotMatch(readRoute[0], /canWriteDogCalendarEvent/);
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
  ].map(([value, disabled]) => ({ value, disabled }));
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        style: {},
        textContent: '',
        scrollIntoView() {},
        querySelectorAll(selector) { return selector === 'option' ? [] : []; },
      });
    }
    return elements.get(id);
  };
  const petSelect = node('evtPetType');
  petSelect.value = 'cat';
  petSelect.querySelectorAll = (selector) => selector === 'option' ? petOptions : [];
  node('evtType').value = 'visit';
  node('evtPetTypeGroup').style.display = 'none';
  node('evtTitle').value = '猫ケア';
  node('evtStart').value = '2026-08-01';
  node('evtEnd').value = '2026-08-01';
  node('evtTime').value = '';
  node('evtStatus').value = 'confirmed';
  node('evtNotes').value = '';

  const marker = "  document.addEventListener('DOMContentLoaded'";
  assert.ok(source.includes(marker), 'Admin calendar test hook marker');
  const hooked = source.replace(marker, [
    '  window.__dogCalendarGateTest = {',
    '    updatePetTypeVisibility: updatePetTypeVisibility,',
    '    submitForm: submitForm,',
    '    startEdit: startEdit,',
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
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    FuluckAPI: {
      post(url, payload) { calls.push({ method: 'POST', url, payload }); return pending; },
      put(url, payload) { calls.push({ method: 'PUT', url, payload }); return pending; },
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

test('Admin preserves a historical dog care identity so the existing gate still rejects its edit', () => {
  const h = adminCalendarHarness();
  h.api.setEvents([{
    id: 'evt_historical_dog',
    type: 'care',
    title: '履歴の犬ケア',
    start: '2026-07-01',
    end: '2026-07-01',
    petType: 'dog_small',
    status: 'confirmed',
  }]);

  h.api.startEdit('evt_historical_dog');
  assert.equal(h.elements.get('evtPetType').value, 'dog_small');
  h.api.submitForm({ preventDefault() {} });
  assert.equal(h.calls[0].payload.petType, 'dog_small');
});
