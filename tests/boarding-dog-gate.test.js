'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'boarding-public-config.js');
const calcPath = path.join(ROOT, 'boarding-public-calc.js');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('historical dog prices stay behind one disabled public gate', () => {
  const { CONFIG } = require(configPath);
  const source = read('boarding-public-config.js');
  const calcSource = read('boarding-public-calc.js');

  assert.deepEqual(CONFIG.dogServices, {
    public: false,
    boardingBasePrice: { small: 7400, medium: 8200, large: 8900 },
    longStayDiscount: {
      small: [
        { minNights: 30, rate: 0.65 },
        { minNights: 14, rate: 0.75 },
        { minNights: 7, rate: 0.80 },
      ],
      medium: [
        { minNights: 30, rate: 0.70 },
        { minNights: 14, rate: 0.75 },
        { minNights: 7, rate: 0.80 },
      ],
      large: [
        { minNights: 30, rate: 0.70 },
        { minNights: 14, rate: 0.75 },
        { minNights: 7, rate: 0.80 },
      ],
    },
    dateSurcharge: {
      normal: { small: 0, medium: 0, large: 0 },
      weekend_or_holiday: { small: 550, medium: 1100, large: 1100 },
      school_vacation: { small: 1100, medium: 1650, large: 2200 },
      high_season_core: { small: 2200, medium: 3300, large: 3300 },
    },
    basicCareBasePrice: { small: 4500, medium: 7500, large: 9000 },
  });
  assert.deepEqual(source.match(/\bpublic\s*:\s*(?:true|false)/g), ['public: false']);
  assert.doesNotMatch(`${source}\n${calcSource}`, /allowDraft/);
  assert.doesNotMatch(calcSource, /\b(?:7400|8200|8900|4500|7500|9000)\b/);
});

test('dog calculators fail closed while the public gate is false', () => {
  const calc = require(calcPath);

  assert.equal(typeof calc.calculateDogBoarding, 'function');
  assert.equal(typeof calc.calculateDogBasicCare, 'function');
  assert.deepEqual(
    calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
    }),
    { available: false, error: 'unavailable' },
  );
  assert.deepEqual(
    calc.calculateDogBasicCare({ size: 'small' }),
    { available: false, error: 'unavailable' },
  );
});

test('the single config flip enables correct dog boarding and undiscounted care math', () => {
  const { CONFIG } = require(configPath);
  const calc = require(calcPath);
  assert.ok(CONFIG.dogServices, 'dogServices config is required');
  assert.equal(typeof calc.calculateDogBoarding, 'function');
  assert.equal(typeof calc.calculateDogBasicCare, 'function');
  const originalPublic = CONFIG.dogServices.public;

  CONFIG.dogServices.public = true;
  try {
    const normal = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
    });
    assert.deepEqual(
      {
        available: normal.available,
        basePrice: normal.basePricePerNight,
        discountedBase: normal.discountedBasePerNight,
        surcharge: normal.nightlyBreakdown[0].dateSurcharge,
        total: normal.boardingTotal,
      },
      { available: true, basePrice: 7400, discountedBase: 7400, surcharge: 0, total: 7400 },
    );

    const member = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
      isMember: true,
    });
    assert.deepEqual(
      { rate: member.rate, discountedBase: member.discountedBasePerNight, total: member.boardingTotal },
      { rate: 0.90, discountedBase: 6700, total: 6700 },
    );

    const weekend = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-06',
      checkOutDate: '2026-06-07',
    });
    const schoolVacation = calc.calculateDogBoarding({
      size: 'medium',
      checkInDate: '2026-07-20',
      checkOutDate: '2026-07-21',
    });
    const highSeason = calc.calculateDogBoarding({
      size: 'large',
      checkInDate: '2026-08-08',
      checkOutDate: '2026-08-09',
    });
    assert.deepEqual(
      [weekend.boardingTotal, schoolVacation.boardingTotal, highSeason.boardingTotal],
      [7950, 9850, 12200],
    );

    const stays = [
      ['small', '2026-02-08', 7, 0.80, 5900],
      ['small', '2026-02-15', 14, 0.75, 5600],
      ['small', '2026-03-03', 30, 0.65, 4800],
      ['medium', '2026-03-03', 30, 0.70, 5700],
      ['large', '2026-03-03', 30, 0.70, 6200],
    ];
    for (const [size, checkOutDate, nights, rate, discountedBase] of stays) {
      const result = calc.calculateDogBoarding({
        size,
        checkInDate: '2026-02-01',
        checkOutDate,
      });
      assert.equal(result.rate, rate, `${size} ${nights} nights rate`);
      assert.equal(result.discountedBasePerNight, discountedBase, `${size} ${nights} nights base`);
    }

    for (const [size, subtotal] of [['small', 4500], ['medium', 7500], ['large', 9000]]) {
      assert.deepEqual(
        calc.calculateDogBasicCare({
          size,
          isMember: true,
          isGraduatedCat: true,
          boardingNights: 30,
        }),
        { available: true, size, basePrice: subtotal, appliedDiscountRate: 1, subtotal },
      );
    }
  } finally {
    CONFIG.dogServices.public = originalPublic;
  }
});
