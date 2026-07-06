/* tests/boarding-calc.test.js — 宠物寄养计价 TDD。dev-only（不进部署产物）。
 * 运行：node --test tests/boarding-calc.test.js
 * 数值基准 = 宠物寄养.md §23 测试用例 + 各组件规则。数值必与文档一致。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../boarding-calc.js');

// ── §1.2 取整 ──
test('roundYen100', () => {
  assert.equal(C.roundYen100(5580), 5600);
  assert.equal(C.roundYen100(7920), 7900);
  assert.equal(C.roundYen100(3720), 3700);
  assert.equal(C.roundYen100(7680), 7700);
});

// ── §8 泊数 ──
test('getNights', () => {
  assert.equal(C.getNights('2026-08-01', '2026-08-02'), 1);
  assert.equal(C.getNights('2026-08-01', '2026-08-04'), 3);
  assert.equal(C.getNights('2026-08-01', '2026-08-31'), 30);
});

// ── §9 日期类别（优先级 high_season_core > school_vacation > weekend/holiday > normal）──
test('getDateCategory', () => {
  assert.equal(C.getDateCategory('2026-06-01'), 'normal');            // 月曜・祝日でも特定日でもない
  assert.equal(C.getDateCategory('2026-06-06'), 'weekend_or_holiday'); // 土曜
  assert.equal(C.getDateCategory('2026-01-01'), 'weekend_or_holiday'); // 元日（祝日）
  assert.equal(C.getDateCategory('2026-07-25'), 'school_vacation');    // 夏休み範囲
  assert.equal(C.getDateCategory('2026-08-10'), 'high_season_core');   // お盆（夏休みより優先）
  assert.equal(C.getDateCategory('2026-05-01'), 'high_season_core');   // GW
  assert.equal(C.getDateCategory('2026-03-25'), 'normal');            // 春休み既定OFF
});

// ── §6 長期割引率 ──
test('getLongStayRate', () => {
  assert.equal(C.getLongStayRate('cat', 6), null);
  assert.equal(C.getLongStayRate('cat', 7), 0.80);
  assert.equal(C.getLongStayRate('cat', 14), 0.75);
  assert.equal(C.getLongStayRate('cat', 30), 0.60);
  assert.equal(C.getLongStayRate('small_dog', 30), 0.65);
  assert.equal(C.getLongStayRate('medium_dog', 30), 0.70);
  assert.equal(C.getLongStayRate('large_dog', 30), 0.70);
});

// ── §5/§6 折扣取最优不叠加 ──
test('getBoardingDiscountRate — 会員+卒業猫 8泊 取80%（§23.2）', () => {
  assert.equal(C.getBoardingDiscountRate({ animalType: 'cat', nights: 8, isMember: true, isGraduatedCat: true }), 0.80);
  assert.equal(C.getBoardingDiscountRate({ animalType: 'cat', nights: 3, isMember: true, isGraduatedCat: false }), 0.90);
  assert.equal(C.getBoardingDiscountRate({ animalType: 'cat', nights: 3, isMember: false, isGraduatedCat: true }), 0.85);
});

// ── §23.1 猫・会員・3泊・普通日 = ¥16,800 ──
test('§23.1 cat member 3 nights normal = 16800', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-01', checkOutDate: '2026-06-04', isMember: true, isGraduatedCat: false });
  assert.equal(q.nights, 3);
  assert.equal(q.rate, 0.90);
  assert.equal(q.discountedBasePerNight, 5600);
  q.nightlyBreakdown.forEach(n => assert.equal(n.dateCategory, 'normal')); // 前提：3泊とも普通日
  assert.equal(q.boardingTotal, 16800);
});

// ── §23.2 猫・卒業猫・8泊 核心不変量（rate 80%・折後¥5,000/泊・夏休み加算¥1,100）──
test('§23.2 cat graduated 8 nights — rate/base/surcharge invariants', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-07-22', checkOutDate: '2026-07-30', isMember: false, isGraduatedCat: true });
  assert.equal(q.nights, 8);
  assert.equal(q.rate, 0.80);              // min(卒業猫0.85, 7-13泊0.80)
  assert.equal(q.discountedBasePerNight, 5000);
  const summerNight = q.nightlyBreakdown.find(n => n.dateCategory === 'school_vacation');
  assert.equal(summerNight.dateSurcharge, 1100); // 折後基価+加算=¥6,100
  assert.equal(summerNight.totalForNight, 6100);
});

// ── §23.3 猫・30泊 = 月寄宿価60%・折後¥3,700/泊・要審査 ──
test('§23.3 cat 30 nights = rate 0.60 / base 3700 / needsReview', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-01', checkOutDate: '2026-07-01', isMember: false, isGraduatedCat: false });
  assert.equal(q.nights, 30);
  assert.equal(q.rate, 0.60);
  assert.equal(q.discountedBasePerNight, 3700);
  assert.equal(q.needsReview, true);
});

// ── §23.4 小型犬・10泊 核心不変量（rate 80%・折後¥7,700/泊・お盆加算¥2,200）──
test('§23.4 small_dog 10 nights — rate/base/obon-surcharge', () => {
  const q = C.calculateBoarding({ animalType: 'small_dog', checkInDate: '2026-08-06', checkOutDate: '2026-08-16', isMember: false, isGraduatedCat: false });
  assert.equal(q.nights, 10);
  assert.equal(q.rate, 0.80);
  assert.equal(q.discountedBasePerNight, 7700);
  const obon = q.nightlyBreakdown.find(n => n.dateCategory === 'high_season_core');
  assert.equal(obon.dateSurcharge, 2200);
});

// ── §23.5 送迎 25分接+45分送 = ¥7,900 ──
test('§23.5 transport 25+45 roundtrip = 7900', () => {
  assert.equal(C.getTransportOneWayFee(25), 3300);
  assert.equal(C.getTransportOneWayFee(45), 5500);
  assert.equal(C.calculateTransportFee({ pickupMinutes: 25, dropoffMinutes: 45 }), 7900);
  assert.equal(C.calculateTransportFee({ pickupMinutes: 25 }), 3300); // 片道は割引なし
  assert.equal(C.getTransportOneWayFee(130), 'custom');
  assert.equal(C.calculateTransportFee({ pickupMinutes: 130 }), 'custom');
});

// ── §23.6 待機 75分 = ¥2,000 ──
test('§23.6 waiting 75 min = 2000', () => {
  assert.equal(C.calculateWaitingFee(30), 0);
  assert.equal(C.calculateWaitingFee(60), 1000);
  assert.equal(C.calculateWaitingFee(75), 2000);
  assert.equal(C.calculateWaitingFee(90), 2000);
  assert.equal(C.calculateWaitingFee(91), 3000);
});

// ── §13.3 猫洗護折後価 ──
test('cat grooming rates (§13.3)', () => {
  assert.equal(C.calculateCatGrooming('short_standard', {}).subtotal, 8000);
  assert.equal(C.calculateCatGrooming('short_standard', { isMember: true }).subtotal, 6800);
  assert.equal(C.calculateCatGrooming('short_standard', { isGraduatedCat: true }).subtotal, 5600);
  assert.equal(C.calculateCatGrooming('long_comfort', {}).subtotal, 11000);
  assert.equal(C.calculateCatGrooming('long_comfort', { isGraduatedCat: true }).subtotal, 7700);
});

// ── §14 狗简易清洁固定価 ──
test('dog cleaning fixed prices (§14.2)', () => {
  assert.equal(C.calculateDogCleaning('local_cleaning', 'small_dog').subtotal, 1100);
  assert.equal(C.calculateDogCleaning('simple_wash', 'large_dog').subtotal, 6600);
});

// ── §8 日帰りガード ──
test('day-use guard (nights < 1)', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-01', checkOutDate: '2026-06-01' });
  assert.equal(q.error, 'day_use');
});
