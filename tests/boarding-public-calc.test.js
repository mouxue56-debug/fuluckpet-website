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

test('invalid and unknown service inputs fail closed', () => {
  const calc = require(calcPath);
  assert.equal(calc.calculateBoarding({ animalType: 'dog', checkInDate: '2026-06-01', checkOutDate: '2026-06-02' }).error, 'unknown_type');
  assert.equal(calc.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-02', checkOutDate: '2026-06-01' }).error, 'day_use');
  assert.equal(calc.calculateSmallPetBoarding({ animalType: 'unknown', checkInDate: '2026-06-01', checkOutDate: '2026-06-02' }).error, 'unknown_type');
  assert.equal(calc.calculateCatGrooming('unknown', {}), null);
});
