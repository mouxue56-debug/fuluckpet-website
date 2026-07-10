/**
 * Unit tests for B3 bulk-save kitten field-shape validation.
 *
 * SYNC NOTE: the function below is a byte-for-byte copy of `validateKittenShapes`
 * (and its KITTEN_STATUS_ENUM) in ../api/worker.js. This project has no
 * package.json / module toolchain, so importing the ESM worker from plain Node is
 * not set up; duplicating the pure logic here (with this note) mirrors the
 * validate-breederid.test.js precedent. If you change the rule in worker.js,
 * change it here too.
 *
 * Run: node tests/validate-kitten-shape.test.js
 */

'use strict';
const assert = require('assert');

// ---- copy of api/worker.js pure logic (keep in sync) ----
const KITTEN_STATUS_ENUM = ['available', 'reserved', 'sold'];
const PUBLIC_CATALOG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isSafePublicCatalogId(value) {
  return typeof value === 'string' && PUBLIC_CATALOG_ID_RE.test(value);
}

function validateKittenShapes(items) {
  const errors = [];
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    const bid = (k && typeof k.breederId === 'string' && k.breederId.trim()) || `#${i}`;
    if (!k || typeof k !== 'object' || Array.isArray(k)) {
      errors.push({ breederId: bid, field: '(item)', reason: 'not an object' });
      continue;
    }
    for (const field of ['breederId', 'id']) {
      if (k[field] === undefined || k[field] === null || k[field] === '') continue;
      if (!isSafePublicCatalogId(k[field])) {
        errors.push({ breederId: bid, field, reason: 'not a safe public URL segment' });
      }
    }
    if (k.price !== undefined && k.price !== null && String(k.price).trim() !== '') {
      if (!Number.isFinite(Number(k.price))) {
        errors.push({ breederId: bid, field: 'price', reason: 'not numeric' });
      }
    }
    if (k.status !== undefined && k.status !== null && k.status !== '') {
      if (!KITTEN_STATUS_ENUM.includes(k.status)) {
        errors.push({ breederId: bid, field: 'status', reason: `not in [${KITTEN_STATUS_ENUM.join(', ')}]` });
      }
    }
    if (k.photos !== undefined && k.photos !== null) {
      if (!Array.isArray(k.photos) || !k.photos.every((p) => typeof p === 'string')) {
        errors.push({ breederId: bid, field: 'photos', reason: 'not an array of strings' });
      }
    }
  }
  if (errors.length) return { ok: false, errors };
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

console.log('B3 bulk-save kitten field-shape validation\n');

// 1. A fully valid catalogue passes.
test('valid kittens (numeric price / enum status / string photos) pass', () => {
  const items = [
    { breederId: '2601-00909', price: 280000, status: 'available', photos: ['a.jpg', 'b.jpg'] },
    { breederId: '2601-00910', price: '250000', status: 'reserved', photos: [] },
    { breederId: '2601-00911', price: 300000, status: 'sold' }, // photos omitted
  ];
  assert.deepStrictEqual(validateKittenShapes(items), { ok: true });
});

// 2. Blank / missing price is allowed (site defaults to 0).
test('blank or missing price is allowed', () => {
  const items = [
    { breederId: 'A', price: '', status: 'available' },
    { breederId: 'B', status: 'available' },
    { breederId: 'C', price: null, status: 'available' },
  ];
  assert.deepStrictEqual(validateKittenShapes(items), { ok: true });
});

// 3. Non-numeric price is rejected, naming the record + field.
test('non-numeric price -> reject with breederId + field', () => {
  const r = validateKittenShapes([{ breederId: '2601-00909', price: 'abc', status: 'available' }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].breederId, '2601-00909');
  assert.strictEqual(r.errors[0].field, 'price');
});

// 4. Unknown status is rejected.
test('unknown status -> reject', () => {
  const r = validateKittenShapes([{ breederId: 'X', price: 1, status: 'pending' }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].field, 'status');
  assert.strictEqual(r.errors[0].breederId, 'X');
});

// 5. Missing/blank status is allowed.
test('missing or blank status is allowed', () => {
  assert.deepStrictEqual(validateKittenShapes([{ breederId: 'A', price: 1 }, { breederId: 'B', price: 1, status: '' }]), { ok: true });
});

// 6. photos not an array -> reject.
test('photos that is not an array -> reject', () => {
  const r = validateKittenShapes([{ breederId: 'A', price: 1, status: 'available', photos: 'a.jpg' }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].field, 'photos');
});

// 7. photos array with a non-string -> reject.
test('photos array containing a non-string -> reject', () => {
  const r = validateKittenShapes([{ breederId: 'A', price: 1, status: 'available', photos: ['ok.jpg', 42] }]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].field, 'photos');
});

// 8. Unknown/extra fields are tolerated (permissive).
test('unknown extra fields are tolerated', () => {
  const items = [{ breederId: 'A', price: 1, status: 'available', papa: 'x', mama: 'y', isNew: true, whatever: { nested: 1 } }];
  assert.deepStrictEqual(validateKittenShapes(items), { ok: true });
});

// 9. A non-object item is rejected, using its index as the id fallback.
test('non-object item -> reject with #index fallback id', () => {
  const r = validateKittenShapes([null, 'string', 123]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 3);
  assert.strictEqual(r.errors[0].breederId, '#0');
  assert.strictEqual(r.errors[0].field, '(item)');
});

// 10. Multiple offenders across records are all reported.
test('multiple offenders reported together', () => {
  const items = [
    { breederId: 'A', price: 'x', status: 'available' },        // bad price
    { breederId: 'B', price: 1, status: 'nope' },                // bad status
    { breederId: 'C', price: 1, status: 'available', photos: 5 },// bad photos
  ];
  const r = validateKittenShapes(items);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 3);
  assert.deepStrictEqual(r.errors.map((e) => e.field).sort(), ['photos', 'price', 'status']);
});

// 11. Empty array passes.
test('empty array passes', () => {
  assert.deepStrictEqual(validateKittenShapes([]), { ok: true });
});

test('unsafe filename and route identities are rejected', () => {
  for (const item of [
    { breederId: '../index', status: 'available' },
    { breederId: '../../outside', status: 'available' },
    { breederId: 'has/slash', status: 'available' },
    { breederId: ' leading-space', status: 'available' },
    { breederId: 'safe-id', id: '../admin', status: 'available' },
    { breederId: 12345, status: 'available' },
  ]) {
    const result = validateKittenShapes([item]);
    assert.strictEqual(result.ok, false, JSON.stringify(item));
    assert.ok(result.errors.some((error) => error.field === 'breederId' || error.field === 'id'));
  }
});

test('production-style ids and an empty draft breederId remain valid', () => {
  assert.deepStrictEqual(validateKittenShapes([
    { breederId: '2607-00594', id: '54c902a8-1419-4d17-bb9d-03a08bada302', status: 'available' },
    { breederId: '', id: 'draft_01', status: 'reserved' },
  ]), { ok: true });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
