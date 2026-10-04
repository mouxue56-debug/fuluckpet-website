const test = require('node:test');
const assert = require('node:assert/strict');
let createPreference;
test.before(async () => { ({ createMotionPreference: createPreference } = await import('../ambient-preferences.mjs')); });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('visitors can pause and resume, and the choice survives a new page instance', () => {
  const saved = storage();
  const first = createPreference(() => saved);
  assert.equal(first.paused, false);
  first.toggle();
  assert.equal(first.paused, true);
  const nextPage = createPreference(() => saved);
  assert.equal(nextPage.paused, true);
  nextPage.toggle();
  assert.equal(nextPage.paused, false);
  assert.equal(createPreference(() => saved).paused, false);
});

test('blocked storage still permits pausing and resuming in the current page', () => {
  const pref = createPreference(() => { throw new Error('Storage unavailable'); });
  assert.equal(pref.paused, false);
  pref.toggle();
  assert.equal(pref.paused, true);
  pref.toggle();
  assert.equal(pref.paused, false);
});

test('a failed preference write preserves the user action in memory', () => {
  const pref = createPreference(() => ({ getItem: () => 'paused', setItem() { throw new Error('Quota exceeded'); } }));
  assert.equal(pref.paused, true);
  pref.toggle();
  assert.equal(pref.paused, false);
});
