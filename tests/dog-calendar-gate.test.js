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
  assert.match(admin, /id="evtReadOnlyHint"[^>]*hidden[^>]*data-adm-ja="この履歴ケアは読み取り専用です。変更は保存できません。"[^>]*data-adm-zh="此历史护理记录为只读，无法保存更改。"/);
  assert.match(wrangler, /DOG_SERVICES_PUBLIC\s*=\s*"false"/);
  assert.match(worker, /canWriteCalendarEvent\(data, env\)/);
  assert.match(worker, /canUpdateCalendarEvent\(gatePrev,\s*\{ \.\.\.gatePrev, \.\.\.data \},\s*env\)/);

  const readRoute = worker.match(/path === '\/api\/admin\/calendar' && method === 'GET'[\s\S]*?(?=\/\/ POST \/api\/admin\/calendar)/);
  assert.ok(readRoute, 'calendar GET route remains available for historical records');
  assert.doesNotMatch(readRoute[0], /canWriteDogCalendarEvent/);
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
