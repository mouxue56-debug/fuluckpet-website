'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let validateSmallAnimalShape;

test.before(async () => {
  ({ validateSmallAnimalShape } = await import('../api/worker.js'));
});

test('accepts valid rabbits, tolerated extra fields, and an empty collection', () => {
  assert.deepEqual(validateSmallAnimalShape([]), { ok: true });
  assert.deepEqual(validateSmallAnimalShape([
    {
      breederId: 'RB-001',
      species: 'rabbit',
      price: 120000,
      status: 'available',
      gender: 'unknown',
      photos: ['rabbit-1.webp'],
      name: 'Mochi',
      futureField: { preserved: true },
    },
    {
      breederId: 'RB-002',
      species: 'rabbit',
      price: '98000',
      status: 'reserved',
      photos: [],
    },
  ]), { ok: true });
});

test('requires a plain object, non-empty breederId, and rabbit species', () => {
  const result = validateSmallAnimalShape([
    null,
    [],
    new Date('2026-01-01T00:00:00Z'),
    { species: 'rabbit' },
    { breederId: '   ', species: 'rabbit' },
    { breederId: 'RB-DOG', species: 'dog' },
    { breederId: 'RB-NONE' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  assert.equal(result.errors.filter((e) => e.field === '(item)').length, 3);
  assert.equal(result.errors.filter((e) => e.field === 'breederId').length, 2);
  assert.equal(result.errors.filter((e) => e.field === 'species').length, 2);
});

test('rejects invalid price, status, and photos while allowing blank price', () => {
  assert.deepEqual(validateSmallAnimalShape([
    { breederId: 'RB-BLANK', species: 'rabbit', price: '' },
    { breederId: 'RB-NULL', species: 'rabbit', price: null },
  ]), { ok: true });

  const result = validateSmallAnimalShape([
    { breederId: 'RB-PRICE', species: 'rabbit', price: 'not-a-number' },
    { breederId: 'RB-INF', species: 'rabbit', price: Infinity },
    { breederId: 'RB-ZERO', species: 'rabbit', price: 0 },
    { breederId: 'RB-FRACTION', species: 'rabbit', price: 1.5 },
    { breederId: 'RB-BOOLEAN', species: 'rabbit', price: true },
    { breederId: 'RB-ARRAY', species: 'rabbit', price: [88000] },
    { breederId: 'RB-EMPTY-ARRAY', species: 'rabbit', price: [] },
    { breederId: 'RB-OBJECT', species: 'rabbit', price: {} },
    { breederId: 'RB-STATUS', species: 'rabbit', status: 'pending' },
    { breederId: 'RB-PHOTOS', species: 'rabbit', photos: 'rabbit.webp' },
    { breederId: 'RB-PHOTO-ELEM', species: 'rabbit', photos: ['ok.webp', 42] },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((e) => e.field).sort(),
    ['photos', 'photos', 'price', 'price', 'price', 'price', 'price', 'price', 'price', 'price', 'status'],
  );
});

test('forbids papa and mama by presence, including blank values', () => {
  const result = validateSmallAnimalShape([
    { breederId: 'RB-PAPA', species: 'rabbit', papa: '' },
    { breederId: 'RB-MAMA', species: 'rabbit', mama: null },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((e) => e.field).sort(), ['mama', 'papa']);
});

test('rejects duplicate breederIds strictly', () => {
  const result = validateSmallAnimalShape([
    { breederId: 'RB-DUP', species: 'rabbit' },
    { breederId: 'RB-DUP', species: 'rabbit' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'breederId' && /duplicate/i.test(e.reason)));
});

test('rejects the reserved bulk breederId before it can become an unreachable row', () => {
  const result = validateSmallAnimalShape([
    { breederId: 'bulk', species: 'rabbit' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'breederId' && /reserved/i.test(e.reason)));
});

test('rejects unsafe public identities and sale-incompatible fields', () => {
  const result = validateSmallAnimalShape([
    { breederId: '../RB-PATH', species: 'rabbit' },
    { breederId: ' RB-PADDED ', species: 'rabbit' },
    { breederId: 'RB-CAGE', species: 'rabbit', cage_type: 'large' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors.filter((e) => e.field === 'breederId').length, 2);
  assert.ok(result.errors.some((e) => e.field === 'cage_type' && /forbidden/i.test(e.reason)));
});

test('rejects invalid catalogue value types and ranges', () => {
  const result = validateSmallAnimalShape([
    { breederId: 'RB-NEGATIVE', species: 'rabbit', price: -1 },
    { breederId: 'RB-GENDER', species: 'rabbit', gender: 'other' },
    { breederId: 'RB-BIRTHDAY', species: 'rabbit', birthday: '2026-13' },
    { breederId: 'RB-COVER-TYPE', species: 'rabbit', coverIndex: '0' },
    { breederId: 'RB-COVER-RANGE', species: 'rabbit', photos: ['one.webp'], coverIndex: 2 },
    { breederId: 'RB-NEW', species: 'rabbit', isNew: 'yes' },
    { breederId: 'RB-TEXT', species: 'rabbit', breed: 42, color: [], video: {}, note: false },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field).sort(),
    ['birthday', 'breed', 'color', 'coverIndex', 'coverIndex', 'gender', 'isNew', 'note', 'price', 'video'],
  );
});
