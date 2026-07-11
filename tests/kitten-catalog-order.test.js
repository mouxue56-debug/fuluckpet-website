const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const catalog = require('../kitten-catalog.js');

test('orders status, promotion, priority, then younger birthday', () => {
  const actual = catalog.orderKittens([
    { breederId: 'sold', status: 'sold', birthday: '2026-07' },
    { breederId: 'plain', status: 'available', birthday: '2026-07' },
    { breederId: 'low', status: 'available', promotionTag: 'featured', promotionPriority: 1, birthday: '2026-06' },
    { breederId: 'high-old', status: 'available', promotionTag: 'campaign', promotionPriority: 999, birthday: '2026-01' },
    { breederId: 'high-young', status: 'available', promotionTag: 'featured', promotionPriority: 999, birthday: '2026-05' },
    { breederId: 'reserved', status: 'reserved', promotionTag: 'featured', promotionPriority: 999, birthday: '2026-07' },
  ]).map((item) => item.breederId);
  assert.deepEqual(actual, ['high-young', 'high-old', 'low', 'plain', 'reserved', 'sold']);
});

test('legacy and invalid read values fail closed without mutating input', () => {
  const input = [{ breederId: 'unknown', status: 'pending', birthday: 'bad' }, { breederId: 'legacy', status: 'available' }];
  const snapshot = structuredClone(input);
  assert.deepEqual(catalog.orderKittens(input).map((item) => item.breederId), ['legacy', 'unknown']);
  assert.deepEqual(input, snapshot);
});

test('dedupe is first-position, last-write-wins and deterministic', () => {
  const output = catalog.dedupeKittens([
    { breederId: 'A', price: 1 }, { breederId: 'B', price: 2 }, { breederId: 'A', price: 3 },
  ]);
  assert.deepEqual(output.map((item) => [item.breederId, item.price]), [['A', 3], ['B', 2]]);
});

test('rows without safe identity stay distinct and missing prices stay last', () => {
  const rows = catalog.orderKittens([
    { status: 'available', price: '', birthday: '2026-07' },
    { status: 'available', price: 200000, birthday: '2026-06' },
    { status: 'available', price: 100000, birthday: '2026-05' },
  ], { secondary: 'price-asc' });
  assert.deepEqual(rows.map((item) => item.price), [100000, 200000, '']);
  assert.equal(rows.length, 3);
});

test('normalizers fail closed and promotion priority accepts only tagged integer boundaries', () => {
  assert.equal(catalog.normalizeStatus('available'), 'available');
  assert.equal(catalog.normalizeStatus('reserved'), 'reserved');
  assert.equal(catalog.normalizeStatus('sold'), 'sold');
  for (const value of ['pending', 'AVAILABLE', '', null, undefined, '__proto__', 'constructor', 'toString', new String('available')]) {
    assert.equal(catalog.normalizeStatus(value), 'sold');
  }

  assert.equal(catalog.normalizePromotionTag('featured'), 'featured');
  assert.equal(catalog.normalizePromotionTag('campaign'), 'campaign');
  for (const value of ['FEATURED', 'other', '', null, undefined, '__proto__', 'constructor', 'toString']) {
    assert.equal(catalog.normalizePromotionTag(value), '');
  }

  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'featured', promotionPriority: 0 }), 0);
  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'campaign', promotionPriority: 999 }), 999);
  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'featured', promotionPriority: -1 }), 0);
  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'featured', promotionPriority: 1000 }), 0);
  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'featured', promotionPriority: '999' }), 0);
  assert.equal(catalog.normalizePromotionPriority({ promotionTag: 'unknown', promotionPriority: 999 }), 0);
  assert.equal(catalog.normalizePromotionPriority(null), 0);
});

test('sale prices accept only positive safe integers and canonical digit strings', () => {
  assert.equal(catalog.normalizeSalePrice(220000), 220000);
  assert.equal(catalog.normalizeSalePrice('220000'), 220000);
  for (const value of [
    0,
    -1,
    1.5,
    '1e3',
    '1,000',
    '',
    '0001',
    null,
    false,
    NaN,
    Infinity,
    {},
    [],
    '9007199254740992',
  ]) {
    assert.equal(catalog.normalizeSalePrice(value), null, String(value));
  }
});

test('promotion labels are exact in ja, en, and zh with safe fallbacks', () => {
  assert.equal(catalog.promotionLabel('featured', 'ja'), 'おすすめ');
  assert.equal(catalog.promotionLabel('featured', 'en'), 'Featured');
  assert.equal(catalog.promotionLabel('featured', 'zh'), '推荐');
  assert.equal(catalog.promotionLabel('campaign', 'ja'), 'キャンペーン');
  assert.equal(catalog.promotionLabel('campaign', 'en'), 'Campaign');
  assert.equal(catalog.promotionLabel('campaign', 'zh'), '活动');
  assert.equal(catalog.promotionLabel('featured'), 'おすすめ');
  assert.equal(catalog.promotionLabel('campaign', 'fr'), 'キャンペーン');
  assert.equal(catalog.promotionLabel('unknown', 'en'), '');
});

test('identity prefers safe breederId, then safe id, then a non-colliding row key', () => {
  assert.equal(catalog.identityOf({ breederId: 'breeder-1', id: 'row-1' }, 0), 'breeder-1');
  assert.equal(catalog.identityOf({ breederId: '../unsafe', id: 'row_2' }, 1), 'row_2');
  assert.equal(catalog.identityOf({ breederId: ' leading', id: 'also/unsafe' }, 2), '__row_2');
  assert.equal(catalog.identityOf(null, 3), '__row_3');

  const rows = [{ price: 1 }, { price: 2 }, { breederId: '../unsafe', price: 3 }];
  assert.deepEqual(catalog.dedupeKittens(rows), rows);

  const crossField = catalog.dedupeKittens([
    { breederId: 'shared-id', value: 'first' },
    { id: 'shared-id', value: 'last' },
  ]);
  assert.equal(crossField.length, 1);
  assert.equal(crossField[0].value, 'last');
});

test('birthday ranking accepts YYYY-MM and real YYYY-MM-DD but rejects impossible dates', () => {
  const actual = catalog.orderKittens([
    { breederId: 'bad-nonleap', status: 'available', birthday: '2026-02-29' },
    { breederId: 'month', status: 'available', birthday: '2026-05' },
    { breederId: 'bad-day', status: 'available', birthday: '2026-04-31' },
    { breederId: 'leap-day', status: 'available', birthday: '2024-02-29' },
    { breederId: 'full-day', status: 'available', birthday: '2026-05-31' },
    { breederId: 'bad-format', status: 'available', birthday: '2026-5' },
  ]).map((item) => item.breederId);
  assert.deepEqual(actual, ['full-day', 'month', 'leap-day', 'bad-day', 'bad-format', 'bad-nonleap']);
});

test('all secondary modes retain merchandising priority and use birthday as their tiebreak', () => {
  const birthdayRows = [
    { breederId: 'old', status: 'available', birthday: '2026-01' },
    { breederId: 'young', status: 'available', birthday: '2026-06' },
  ];
  assert.deepEqual(catalog.orderKittens(birthdayRows, { secondary: 'default' }).map((item) => item.breederId), ['young', 'old']);
  assert.deepEqual(catalog.orderKittens(birthdayRows, { secondary: 'newest' }).map((item) => item.breederId), ['young', 'old']);

  const priceRows = [
    { breederId: 'missing', status: 'available', price: '', birthday: '2026-07' },
    { breederId: 'two', status: 'available', price: 200000, birthday: '2026-03' },
    { breederId: 'one-old', status: 'available', price: '100000', birthday: '2026-01' },
    { breederId: 'one-young', status: 'available', price: 100000, birthday: '2026-05' },
  ];
  assert.deepEqual(
    catalog.orderKittens(priceRows, { secondary: 'price-asc' }).map((item) => item.breederId),
    ['one-young', 'one-old', 'two', 'missing'],
  );
  assert.deepEqual(
    catalog.orderKittens(priceRows, { secondary: 'price-desc' }).map((item) => item.breederId),
    ['two', 'one-young', 'one-old', 'missing'],
  );

  const guarded = catalog.orderKittens([
    { breederId: 'sold-cheap', status: 'sold', price: 1, birthday: '2026-07' },
    { breederId: 'plain-cheap', status: 'available', price: 1, birthday: '2026-07' },
    { breederId: 'promo-zero', status: 'available', promotionTag: 'featured', promotionPriority: 0, price: 1, birthday: '2026-07' },
    { breederId: 'promo-max', status: 'available', promotionTag: 'campaign', promotionPriority: 999, price: 999999, birthday: '2026-01' },
    { breederId: 'reserved-cheap', status: 'reserved', price: 1, birthday: '2026-07' },
  ], { secondary: 'price-asc' }).map((item) => item.breederId);
  assert.deepEqual(guarded, ['promo-max', 'promo-zero', 'plain-cheap', 'reserved-cheap', 'sold-cheap']);
});

test('invalid and missing prices stay last in both price directions', () => {
  const rows = [
    { breederId: 'blank', status: 'available', price: '' },
    { breederId: 'zero', status: 'available', price: 0 },
    { breederId: 'boolean', status: 'available', price: true },
    { breederId: 'overflow', status: 'available', price: '9007199254740992' },
    { breederId: 'valid', status: 'available', price: 1 },
  ];
  for (const secondary of ['price-asc', 'price-desc']) {
    assert.deepEqual(
      catalog.orderKittens(rows, { secondary }).map((item) => item.breederId),
      ['valid', 'blank', 'boolean', 'overflow', 'zero'],
    );
  }
});

test('identity breaks metric ties before source order', () => {
  const a = { breederId: 'A', status: 'available', birthday: '2026-05', price: 100 };
  const b = { breederId: 'B', status: 'available', birthday: '2026-05', price: 100 };
  assert.ok(catalog.compareKittens(a, b, { secondary: 'price-asc' }) < 0);
  assert.ok(catalog.compareKittens(b, a, { secondary: 'price-asc' }) > 0);
  assert.deepEqual(catalog.orderKittens([b, a], { secondary: 'price-asc' }), [a, b]);
});

test('ordering is non-mutating and identical across consecutive calls', () => {
  const input = [
    { breederId: 'B', status: 'available', birthday: '2026-01' },
    { breederId: 'A', status: 'available', birthday: '2026-06', price: 10 },
    { breederId: 'B', status: 'available', birthday: '2026-03' },
  ];
  const snapshot = structuredClone(input);
  const first = catalog.orderKittens(input, { secondary: 'newest' });
  const second = catalog.orderKittens(input, { secondary: 'newest' });
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.breederId), ['A', 'B']);
  assert.deepEqual(input, snapshot);
  assert.notEqual(first, input);
});

test('UMD module exposes the complete browser global without dependencies', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'kitten-catalog.js'), 'utf8');
  const context = {};
  vm.runInNewContext(source, context);
  assert.deepEqual(
    Object.keys(context.FuluckKittenCatalog).sort(),
    [
      'compareKittens',
      'dedupeKittens',
      'identityOf',
      'normalizePromotionPriority',
      'normalizePromotionTag',
      'normalizeSalePrice',
      'normalizeStatus',
      'orderKittens',
      'promotionLabel',
    ],
  );
});
