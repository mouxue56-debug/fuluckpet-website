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

function addDays(value, count) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

test('cat boarding uses one owner-approved base and unified long-stay boundaries', () => {
  const calc = require(calcPath);
  for (const [nights, rate] of [
    [1, 1], [6, 1], [7, 0.95], [13, 0.95], [14, 0.90],
    [20, 0.90], [21, 0.85], [29, 0.85], [30, 0.80],
  ]) {
    const result = calc.calculateBoarding({
      animalType: 'cat',
      checkInDate: '2026-09-01',
      checkOutDate: addDays('2026-09-01', nights),
    });
    assert.equal(result.rate, rate, `${nights} nights rate`);
    assert.equal(result.basePricePerNight, 4000, `${nights} nights base`);
    assert.equal(
      result.boardingTotal,
      Math.round((4000 * nights * rate) / 100) * 100,
      `${nights} nights total`,
    );
    assert.equal(result.nightlyBreakdown, undefined, `${nights} nights has no surcharge breakdown`);
  }
});

test('small animals keep their base prices and use the same total discount tiers', () => {
  const calc = require(calcPath);
  const rabbit = calc.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-08' });
  const hamster = calc.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-07-01' });
  assert.deepEqual(
    { nights: rabbit.nights, base: rabbit.basePricePerNight, rate: rabbit.rate, total: rabbit.boardingTotal },
    { nights: 7, base: 1500, rate: 0.95, total: 10000 },
  );
  assert.deepEqual(
    { nights: hamster.nights, base: hamster.basePricePerNight, rate: hamster.rate, total: hamster.boardingTotal },
    { nights: 30, base: 500, rate: 0.80, total: 12000 },
  );
});

test('graduated-cat boarding is always 30%OFF and never stacks with long stay', () => {
  const calc = require(calcPath);
  const short = calc.calculateBoarding({
    animalType: 'cat', checkInDate: '2026-09-01', checkOutDate: '2026-09-02', isGraduatedCat: true,
  });
  const long = calc.calculateBoarding({
    animalType: 'cat', checkInDate: '2026-09-01', checkOutDate: '2026-10-01', isGraduatedCat: true,
  });
  assert.deepEqual({ rate: short.rate, total: short.boardingTotal }, { rate: 0.70, total: 2800 });
  assert.deepEqual({ rate: long.rate, total: long.boardingTotal }, { rate: 0.70, total: 84000 });
});

test('cat care keeps approved prices and gives graduated cats one non-stacking 30% discount', () => {
  const calc = require(calcPath);
  assert.equal(calc.calculateCatGrooming('short', {}).subtotal, 4000);

  const short = calc.calculateCatGrooming('short', {
    isGraduatedCat: true,
  });
  const long = calc.calculateCatGrooming('long', {
    isGraduatedCat: true,
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

test('cat care applies only the graduated-cat discount and skips package-included items', () => {
  const calc = require(calcPath);
  const result = calc.calculateCatCare(
    { packageId: 'short', quantities: { nail: 1, paw: 1, matting15: 2 } },
    { isGraduatedCat: true },
  );

  assert.equal(result.appliedDiscountRate, 0.70);
  assert.deepEqual(result.skippedIncludedItemIds, ['nail']);
  assert.equal(result.subtotal, 5800);
});

test('legacy member and post-boarding inputs never grant a cat-care discount', () => {
  const calc = require(calcPath);
  const selection = { packageId: 'short', quantities: {} };
  for (const customer of [
    { isMember: true },
    { boardingNights: 3 },
    { boardingNights: 7 },
    { boardingNights: 14 },
    { isMember: true, boardingNights: 30 },
  ]) {
    const result = calc.calculateCatCare(selection, customer);
    assert.equal(result.appliedDiscountRate, 1);
    assert.equal(result.subtotal, 4000);
  }
});

test('invalid graduated-cat values fail closed without granting a discount', () => {
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
    { isGraduatedCat: 1 },
    { isGraduatedCat: null },
  ];

  for (const customer of invalidCustomers) {
    assert.deepEqual(calc.calculateCatCare(selection, customer), expected);
  }
  assert.equal(calc.calculateCatCare(selection, { isGraduatedCat: false }).subtotal, 4000);
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
