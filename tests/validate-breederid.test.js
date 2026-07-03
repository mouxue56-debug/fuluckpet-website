/**
 * Unit tests for D3-B breederId uniqueness validation (GRANDFATHER rule).
 *
 * SYNC NOTE: the two functions below are a byte-for-byte copy of
 * `dupCounts` / `validateBreederIdUniqueness` in ../api/worker.js. This project
 * has no package.json / module toolchain, so importing the ESM worker from plain
 * Node is not set up; duplicating the pure logic here (with this note) is the
 * smallest honest way to unit-test it. If you change the rule in worker.js,
 * change it here too.
 *
 * Run: node tests/validate-breederid.test.js
 */

'use strict';
const assert = require('assert');

// ---- copy of api/worker.js pure logic (keep in sync) ----
function dupCounts(list) {
  const counts = new Map();
  for (const item of (Array.isArray(list) ? list : [])) {
    const id = item && typeof item.breederId === 'string' ? item.breederId.trim() : '';
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const dups = new Map();
  for (const [id, n] of counts) {
    if (n > 1) dups.set(id, n - 1);
  }
  return dups;
}

function validateBreederIdUniqueness(currentList, incomingList) {
  const currentDups = dupCounts(currentList);
  const incomingDups = dupCounts(incomingList);
  const offending = [];
  for (const [id, incomingExtra] of incomingDups) {
    const currentExtra = currentDups.get(id) || 0;
    if (incomingExtra > currentExtra) offending.push(id);
  }
  if (offending.length) return { ok: false, ids: offending };
  return { ok: true };
}
// ---- end copy ----

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e));
  }
}

const k = (breederId) => ({ breederId, breed: 'サイベリアン' });

// The owner's 3 known legacy dupes (each appears >1x in the STORED array).
const LEGACY_CURRENT = [
  k('2509-01171'), k('2509-01171'),   // legacy dup #1
  k('2508-00310'), k('2508-00310'),   // legacy dup #2
  k('2508-02468'), k('2508-02468'),   // legacy dup #3
  k('2602-00625'), k('2601-01855'),   // unique ids
];

console.log('D3-B breederId uniqueness — GRANDFATHER rule\n');

// 1. Clean array (all unique) -> pass.
test('clean array (all unique breederIds) passes', () => {
  const current = [k('A'), k('B'), k('C')];
  const incoming = [k('A'), k('B'), k('C'), k('D')];
  const r = validateBreederIdUniqueness(current, incoming);
  assert.deepStrictEqual(r, { ok: true });
});

// 2. New duplicate -> reject with the offending id.
test('incoming introduces a NEW dup -> reject with that id', () => {
  const current = [k('A'), k('B')];
  const incoming = [k('A'), k('B'), k('B')]; // B newly duplicated
  const r = validateBreederIdUniqueness(current, incoming);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.ids, ['B']);
});

// 3. Legacy dupes preserved (edit unrelated fields, keep dup count) -> pass.
test('editing a row while keeping the 3 legacy dupes at same count passes', () => {
  const incoming = LEGACY_CURRENT.map((x) => ({ ...x, price: 200000 })); // touch every row
  const r = validateBreederIdUniqueness(LEGACY_CURRENT, incoming);
  assert.deepStrictEqual(r, { ok: true });
});

// 3b. Cleaning up a legacy dup (removing one copy) still passes.
test('cleaning up a legacy dup (fewer copies) passes', () => {
  const incoming = [
    k('2509-01171'),                  // was 2, now 1 (cleaned)
    k('2508-00310'), k('2508-00310'), // untouched
    k('2508-02468'), k('2508-02468'), // untouched
  ];
  const r = validateBreederIdUniqueness(LEGACY_CURRENT, incoming);
  assert.deepStrictEqual(r, { ok: true });
});

// 4. Legacy dup count INCREASED -> reject.
test('increasing a legacy dup count -> reject with that id', () => {
  const incoming = LEGACY_CURRENT.concat([k('2509-01171')]); // 2 extra copies now, was 1
  const r = validateBreederIdUniqueness(LEGACY_CURRENT, incoming);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.ids, ['2509-01171']);
});

// 5. Empty / missing breederIds are ignored (fresh draft rows).
test('empty/missing breederIds are ignored', () => {
  const current = [k('A')];
  const incoming = [k('A'), { breederId: '' }, { breederId: '   ' }, { breed: 'x' }, { breederId: '' }];
  const r = validateBreederIdUniqueness(current, incoming);
  assert.deepStrictEqual(r, { ok: true });
});

// 6. Multiple new dups -> all offending ids reported.
test('multiple new dups -> all offending ids reported', () => {
  const current = [k('A'), k('B')];
  const incoming = [k('A'), k('A'), k('B'), k('B')];
  const r = validateBreederIdUniqueness(current, incoming);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.ids.sort(), ['A', 'B']);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
