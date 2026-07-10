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
      photos: ['rabbit-1.webp'],
      name: 'Mochi',
      futureField: { preserved: true },
    },
    {
      breederId: ' RB-002 ',
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
    { breederId: 'RB-STATUS', species: 'rabbit', status: 'pending' },
    { breederId: 'RB-PHOTOS', species: 'rabbit', photos: 'rabbit.webp' },
    { breederId: 'RB-PHOTO-ELEM', species: 'rabbit', photos: ['ok.webp', 42] },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((e) => e.field).sort(),
    ['photos', 'photos', 'price', 'price', 'status'],
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

test('rejects duplicate trimmed breederIds strictly', () => {
  const result = validateSmallAnimalShape([
    { breederId: 'RB-DUP', species: 'rabbit' },
    { breederId: ' RB-DUP ', species: 'rabbit' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'breederId' && /duplicate/i.test(e.reason)));
});

test('rejects the reserved bulk breederId before it can become an unreachable row', () => {
  const result = validateSmallAnimalShape([
    { breederId: ' bulk ', species: 'rabbit' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'breederId' && /reserved/i.test(e.reason)));
});
