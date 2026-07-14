'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'boarding-public-config.js');
const calcPath = path.join(ROOT, 'boarding-public-calc.js');

test('licensed public calculator modules exist', () => {
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(calcPath), true);
});

test('cat boarding keeps approved base, date surcharge and long-stay math', () => {
  const calc = require(calcPath);
  const oneNight = calc.calculateBoarding({
    animalType: 'cat',
    checkInDate: '2026-07-13',
    checkOutDate: '2026-07-14',
  });
  assert.equal(oneNight.nights, 1);
  assert.equal(oneNight.boardingTotal, 4800);

  const weekend = calc.calculateBoarding({
    animalType: 'cat',
    checkInDate: '2026-07-18',
    checkOutDate: '2026-07-19',
  });
  assert.equal(weekend.boardingTotal, 5350);

  const seven = calc.calculateBoarding({
    animalType: 'cat',
    checkInDate: '2026-06-01',
    checkOutDate: '2026-06-08',
  });
  assert.equal(seven.discountedBasePerNight, 3800);
});

test('2027 holidays and seasonal ranges use the established surcharge priority', () => {
  const calc = require(calcPath);
  assert.equal(calc.getDateCategory('2027-03-22'), 'weekend_or_holiday');
  assert.equal(calc.getDateCategory('2027-08-10'), 'high_season_core');
});

test('small-animal tiers keep the owner-approved per-night values', () => {
  const calc = require(calcPath);
  const rabbit = calc.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-08' });
  const hamster = calc.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-07-01' });
  assert.deepEqual({ nights: rabbit.nights, perNight: rabbit.perNight, total: rabbit.boardingTotal }, { nights: 7, perNight: 1425, total: 9975 });
  assert.deepEqual({ nights: hamster.nights, perNight: hamster.perNight, total: hamster.boardingTotal }, { nights: 30, perNight: 400, total: 12000 });
});

test('cat care keeps approved prices and gives graduated cats one non-stacking 30% discount', () => {
  const calc = require(calcPath);
  assert.equal(calc.calculateCatGrooming('short', {}).subtotal, 4000);

  const short = calc.calculateCatGrooming('short', {
    isMember: true,
    isGraduatedCat: true,
    boardingNights: 14,
  });
  const long = calc.calculateCatGrooming('long', {
    isMember: true,
    isGraduatedCat: true,
    boardingNights: 14,
  });

  assert.deepEqual(
    { rate: short.appliedDiscountRate, subtotal: short.subtotal },
    { rate: 0.70, subtotal: 2800 },
  );
  assert.deepEqual(
    { rate: long.appliedDiscountRate, subtotal: long.subtotal },
    { rate: 0.70, subtotal: 4200 },
  );
});

test('cat care keeps ordinary undiscounted yen exact', () => {
  const calc = require(calcPath);
  const result = calc.calculateCatCare({ packageId: '', quantities: { ear: 1 } }, {});
  assert.equal(result.appliedDiscountRate, 1);
  assert.equal(result.subtotal, 660);
});

test('cat care applies the best fixed-price discount and skips package-included items', () => {
  const calc = require(calcPath);
  const result = calc.calculateCatCare(
    { packageId: 'short', quantities: { nail: 1, paw: 1, matting15: 2 } },
    { isMember: true, isGraduatedCat: true, boardingNights: 14 },
  );

  assert.equal(result.appliedDiscountRate, 0.70);
  assert.deepEqual(result.skippedIncludedItemIds, ['nail']);
  assert.equal(result.subtotal, 5800);
});

test('invalid cat care customer values fail closed without granting a discount', () => {
  const calc = require(calcPath);
  const selection = { packageId: 'short', quantities: {} };
  const expected = {
    error: 'invalid_customer',
    packageId: '',
    appliedDiscountRate: 1,
    lineItems: [],
    skippedIncludedItemIds: [],
    needsQuote: false,
    subtotal: 0,
  };
  const invalidCustomers = [
    { isGraduatedCat: 'false' },
    { isMember: 'false' },
    { boardingNights: Infinity },
    { boardingNights: -1 },
    { boardingNights: 1.5 },
    { boardingNights: Number.MAX_SAFE_INTEGER + 1 },
    { boardingNights: '14' },
  ];

  for (const customer of invalidCustomers) {
    assert.deepEqual(calc.calculateCatCare(selection, customer), expected);
  }
  assert.equal(calc.calculateCatCare(selection, {
    isMember: false,
    isGraduatedCat: false,
    boardingNights: 0,
  }).subtotal, 4000);
});

test('quote-only cat care is marked for consultation without displaying zero yen', () => {
  const calc = require(calcPath);
  const result = calc.calculateCatCare({ packageId: '', quantities: { anal: 1 } }, {});

  assert.equal(result.needsQuote, true);
  assert.equal(result.subtotal, 0);
  assert.equal(result.lineItems[0].displayPrice, '要相談');
});

test('unknown cat care packages fail closed with an empty result', () => {
  const calc = require(calcPath);
  assert.deepEqual(calc.calculateCatCare({ packageId: 'unknown', quantities: {} }, {}), {
    error: 'unknown_care_package',
    packageId: '',
    appliedDiscountRate: 1,
    lineItems: [],
    skippedIncludedItemIds: [],
    needsQuote: false,
    subtotal: 0,
  });
});

test('unknown items and invalid cat care quantities fail closed', () => {
  const calc = require(calcPath);
  assert.equal(calc.calculateCatCare({ packageId: '', quantities: { unknown: 1 } }, {}).error, 'unknown_care_item');
  for (const quantity of [-1, 1.5, 9]) {
    assert.equal(
      calc.calculateCatCare({ packageId: '', quantities: { matting15: quantity } }, {}).error,
      'invalid_care_quantity',
    );
  }
});

test('cat care rejects non-record quantity shapes', () => {
  const calc = require(calcPath);
  for (const quantities of [[], new Map([['ear', 1]])]) {
    assert.equal(
      calc.calculateCatCare({ packageId: '', quantities }, {}).error,
      'invalid_care_selection',
    );
  }
});

test('invalid and unknown service inputs fail closed', () => {
  const calc = require(calcPath);
  assert.equal(calc.calculateBoarding({ animalType: 'dog', checkInDate: '2026-06-01', checkOutDate: '2026-06-02' }).error, 'unknown_type');
  assert.equal(calc.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-02', checkOutDate: '2026-06-01' }).error, 'day_use');
  assert.equal(calc.calculateSmallPetBoarding({ animalType: 'unknown', checkInDate: '2026-06-01', checkOutDate: '2026-06-02' }).error, 'unknown_type');
  assert.equal(calc.calculateCatGrooming('unknown', {}), null);
});
