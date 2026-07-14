'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'boarding-public-config.js');
const calcPath = path.join(ROOT, 'boarding-public-calc.js');
const projectionPath = path.join(ROOT, 'dog-services-projection.js');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function publicProjection() {
  const source = require(configPath);
  const configApi = {
    CONFIG: { ...source.CONFIG, dogServices: { ...source.CONFIG.dogServices, public: true } },
    HOLIDAYS: source.HOLIDAYS.slice(),
    SPECIAL_DATE_RANGES: source.SPECIAL_DATE_RANGES.map((range) => ({ ...range })),
  };
  return require(projectionPath).buildDogServicesProjection(configApi);
}

test('dog boarding and canonical care prices stay behind one disabled public gate', () => {
  const { CONFIG } = require(configPath);
  const source = read('boarding-public-config.js');
  const calcSource = read('boarding-public-calc.js');

  assert.deepEqual(CONFIG.dogServices, {
    public: false,
    preparingVisible: true,
    locationNotice: '大阪・針中野での受付開始を予定しています。開始時期は決まり次第お知らせします。',
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
  });
  assert.deepEqual(CONFIG.careCatalog.dog, {
    items: [
      { id: 'nail', label: '爪切り', priceBySize: { small: 660, medium: 880, large: 1100 } },
      { id: 'ear', label: '耳掃除', priceBySize: { small: 660, medium: 880, large: 1100 } },
      { id: 'anal', label: '肛門腺', priceBySize: { small: 660, medium: 880, large: 1100 } },
    ],
    bundles: [
      {
        id: 'basic3',
        label: '基本ケア3点セット',
        includedItemIds: ['nail', 'ear', 'anal'],
        priceBySize: { small: 1650, medium: 2200, large: 2750 },
      },
    ],
  });
  assert.deepEqual(source.match(/\bpublic\s*:\s*(?:true|false)/g), ['public: false']);
  assert.doesNotMatch(source, /basicCareBasePrice/);
  assert.doesNotMatch(`${source}\n${calcSource}`, /allowDraft/);
  assert.doesNotMatch(calcSource, /\b(?:7400|8200|8900|4500|7500|9000)\b/);
});

test('dog calculators fail closed while the public gate is false', () => {
  const calc = require(calcPath);

  assert.equal(typeof calc.calculateDogBoarding, 'function');
  assert.equal(typeof calc.calculateDogCare, 'function');
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
    calc.calculateDogCare({ size: 'small', offerId: 'nail' }),
    { available: false, error: 'unavailable' },
  );
  assert.deepEqual(
    calc.calculateDogBasicCare({ size: 'small' }),
    { available: false, error: 'unavailable' },
  );
});

test('the single config flip projects correct dog boarding and undiscounted care math', () => {
  const calc = require(calcPath);
  assert.equal(typeof calc.calculateDogBoarding, 'function');
  assert.equal(typeof calc.calculateDogCare, 'function');
  assert.equal(typeof calc.calculateDogBasicCare, 'function');
  const projection = publicProjection();
    const normal = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
    }, projection);
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
    }, projection);
    assert.deepEqual(
      { rate: member.rate, discountedBase: member.discountedBasePerNight, total: member.boardingTotal },
      { rate: 0.90, discountedBase: 6700, total: 6700 },
    );

    const weekend = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-06',
      checkOutDate: '2026-06-07',
    }, projection);
    const schoolVacation = calc.calculateDogBoarding({
      size: 'medium',
      checkInDate: '2026-07-20',
      checkOutDate: '2026-07-21',
    }, projection);
    const highSeason = calc.calculateDogBoarding({
      size: 'large',
      checkInDate: '2026-08-08',
      checkOutDate: '2026-08-09',
    }, projection);
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
      }, projection);
      assert.equal(result.rate, rate, `${size} ${nights} nights rate`);
      assert.equal(result.discountedBasePerNight, discountedBase, `${size} ${nights} nights base`);
    }

    for (const [size, subtotal] of [['small', 1650], ['medium', 2200], ['large', 2750]]) {
      assert.deepEqual(
        calc.calculateDogBasicCare({
          size,
          isMember: true,
          isGraduatedCat: true,
          boardingNights: 30,
        }, projection),
        { available: true, size, basePrice: subtotal, appliedDiscountRate: 1, subtotal },
      );
    }

    for (const [offerId, size, subtotal] of [
      ['nail', 'small', 660],
      ['ear', 'medium', 880],
      ['anal', 'large', 1100],
      ['basic3', 'large', 2750],
    ]) {
      const result = calc.calculateDogCare({
        size,
        offerId,
        isMember: true,
        isGraduatedCat: true,
        boardingNights: 30,
      }, projection);
      assert.deepEqual(result, {
        available: true,
        size,
        offerId,
        basePrice: subtotal,
        appliedDiscountRate: 1,
        subtotal,
      });
    }
});

test('dog care rejects an unknown offer or size without exposing a subtotal', () => {
  const calc = require(calcPath);
  const projection = publicProjection();
  assert.equal(typeof calc.calculateDogCare, 'function');

  const unknownOffer = calc.calculateDogCare({ size: 'small', offerId: 'missing' }, projection);
  assert.deepEqual(unknownOffer, { available: true, error: 'unknown_offer' });
  assert.equal(Object.hasOwn(unknownOffer, 'subtotal'), false);

  const unknownSize = calc.calculateDogCare({ size: 'extra-large', offerId: 'nail' }, projection);
  assert.deepEqual(unknownSize, { available: true, error: 'unknown_size' });
  assert.equal(Object.hasOwn(unknownSize, 'subtotal'), false);
});

test('member and seven-night dog discounts use the lower rate without stacking', () => {
  const calc = require(calcPath);
  const projection = publicProjection();
    const result = calc.calculateDogBoarding({
      size: 'small',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-08',
      isMember: true,
    }, projection);
    const weekendNights = result.nightlyBreakdown.filter((night) => night.dateCategory === 'weekend_or_holiday');
    const surchargeTotal = result.nightlyBreakdown.reduce((sum, night) => sum + night.dateSurcharge, 0);

    assert.deepEqual(
      {
        rate: result.rate,
        discountedBase: result.discountedBasePerNight,
        weekendNights: weekendNights.length,
        surchargeTotal,
        total: result.boardingTotal,
      },
      {
        rate: 0.80,
        discountedBase: 5900,
        weekendNights: 2,
        surchargeTotal: 1100,
        total: 42400,
      },
    );
});
