/* tests/boarding-calc.test.js — 宠物寄养计价 TDD。dev-only（不进部署产物）。
 * 运行：node --test tests/boarding-calc.test.js
 * 数值基准 = boarding-config.js v2（2026-07-07 owner 重定价）：寄养基础价 ×0.85，
 *   新增 smallPetBoarding（兔笼/仓鼠笼 泊数单价阶梯，无日期加算·无会员/卒业割引）。
 * 保留 §23 用例结构标签，但期望数值已按 v2 config rebase（不再照 v0.4 文档 §23 字面总额）。 */
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

// ── §23.1 猫・会員・3泊・普通日（v2: 折後¥4,800/泊 = ¥14,400）──
test('§23.1 cat member 3 nights normal = 14400', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-01', checkOutDate: '2026-06-04', isMember: true, isGraduatedCat: false });
  assert.equal(q.nights, 3);
  assert.equal(q.rate, 0.90);
  assert.equal(q.discountedBasePerNight, 4800); // roundYen100(5300×0.9)=roundYen100(4770)
  q.nightlyBreakdown.forEach(n => assert.equal(n.dateCategory, 'normal')); // 前提：3泊とも普通日
  assert.equal(q.boardingTotal, 14400);
});

// ── §23.2 猫・卒業猫・8泊 核心不変量（v2: rate 80%・折後¥4,200/泊・夏休み加算¥1,100）──
test('§23.2 cat graduated 8 nights — rate/base/surcharge invariants', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-07-22', checkOutDate: '2026-07-30', isMember: false, isGraduatedCat: true });
  assert.equal(q.nights, 8);
  assert.equal(q.rate, 0.80);              // min(卒業猫0.85, 7-13泊0.80)
  assert.equal(q.discountedBasePerNight, 4200); // roundYen100(5300×0.8)=roundYen100(4240)
  const summerNight = q.nightlyBreakdown.find(n => n.dateCategory === 'school_vacation');
  assert.equal(summerNight.dateSurcharge, 1100); // 折後基価+加算=¥5,300
  assert.equal(summerNight.totalForNight, 5300);
});

// ── §23.3 猫・30泊 = 月寄宿価60%・折後¥3,200/泊・要審査（v2）──
test('§23.3 cat 30 nights = rate 0.60 / base 3200 / needsReview', () => {
  const q = C.calculateBoarding({ animalType: 'cat', checkInDate: '2026-06-01', checkOutDate: '2026-07-01', isMember: false, isGraduatedCat: false });
  assert.equal(q.nights, 30);
  assert.equal(q.rate, 0.60);
  assert.equal(q.discountedBasePerNight, 3200); // roundYen100(5300×0.6)=roundYen100(3180)
  assert.equal(q.needsReview, true);
});

// ── §23.4 小型犬・10泊 核心不変量（v2: rate 80%・折後¥6,600/泊・お盆加算¥2,200）──
test('§23.4 small_dog 10 nights — rate/base/obon-surcharge', () => {
  const q = C.calculateBoarding({ animalType: 'small_dog', checkInDate: '2026-08-06', checkOutDate: '2026-08-16', isMember: false, isGraduatedCat: false });
  assert.equal(q.nights, 10);
  assert.equal(q.rate, 0.80);
  assert.equal(q.discountedBasePerNight, 6600); // roundYen100(8200×0.8)=roundYen100(6560)
  const obon = q.nightlyBreakdown.find(n => n.dateCategory === 'high_season_core');
  assert.equal(obon.dateSurcharge, 2200); // 高季核心加算は据え置き
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

// ── 小動物お預かり（v2 新規：ポスター準拠・泊数単価階梯のみ／日付加算・割引なし）──
test('isSmallPetType — smallPetBoarding のキーだけ true', () => {
  assert.equal(C.isSmallPetType('rabbit_cage'), true);
  assert.equal(C.isSmallPetType('hamster_cage'), true);
  assert.equal(C.isSmallPetType('cat'), false);
  assert.equal(C.isSmallPetType('small_dog'), false);
  assert.equal(C.isSmallPetType('bird'), false);
  assert.equal(C.isSmallPetType(undefined), false);
});

test('getSmallPetPerNight — 泊数階梯（minNights 降順・境界含む）', () => {
  // rabbit_cage: 1500 / 1425@7 / 1350@14 / 1275@21 / 1200@30
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 3), 1500);
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 6), 1500);  // 7泊未満は最下位ティア
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 7), 1425);  // 境界
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 14), 1350); // 境界
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 21), 1275); // 境界
  assert.equal(C.getSmallPetPerNight('rabbit_cage', 30), 1200); // 境界
  // hamster_cage: 500 / 475@7 / 451@14 / 428@21 / 400@30
  assert.equal(C.getSmallPetPerNight('hamster_cage', 3), 500);
  assert.equal(C.getSmallPetPerNight('hamster_cage', 20), 451); // 14〜20泊
  assert.equal(C.getSmallPetPerNight('hamster_cage', 21), 428); // 境界
  assert.equal(C.getSmallPetPerNight('hamster_cage', 30), 400); // 境界
  // 未知タイプ → null
  assert.equal(C.getSmallPetPerNight('cat', 5), null);
  assert.equal(C.getSmallPetPerNight('bird', 5), null);
});

test('calculateSmallPetBoarding — 総額 = 単価 × 泊数（¥100 丸めなし）', () => {
  // rabbit_cage
  const r3 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-04' });
  assert.equal(r3.nights, 3);
  assert.equal(r3.perNight, 1500);
  assert.equal(r3.tierMinNights, 1);
  assert.equal(r3.boardingTotal, 4500);          // 1500×3

  const r7 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-08' });
  assert.equal(r7.perNight, 1425);
  assert.equal(r7.tierMinNights, 7);
  assert.equal(r7.boardingTotal, 9975);          // 1425×7（丸めなし）

  const r6 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-07' });
  assert.equal(r6.nights, 6);
  assert.equal(r6.perNight, 1500);               // 7泊未満＝最下位ティア境界
  assert.equal(r6.tierMinNights, 1);

  const r14 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-15' });
  assert.equal(r14.perNight, 1350);
  const r21 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-22' });
  assert.equal(r21.perNight, 1275);
  const r30 = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-07-01' });
  assert.equal(r30.nights, 30);
  assert.equal(r30.perNight, 1200);
  assert.equal(r30.tierMinNights, 30);
  assert.equal(r30.boardingTotal, 36000);        // 1200×30

  // hamster_cage
  const h3 = C.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-04' });
  assert.equal(h3.perNight, 500);
  assert.equal(h3.boardingTotal, 1500);          // 500×3
  const h20 = C.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-21' });
  assert.equal(h20.nights, 20);
  assert.equal(h20.perNight, 451);
  assert.equal(h20.boardingTotal, 9020);         // 451×20
  const h21 = C.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-22' });
  assert.equal(h21.perNight, 428);
  const h30 = C.calculateSmallPetBoarding({ animalType: 'hamster_cage', checkInDate: '2026-06-01', checkOutDate: '2026-07-01' });
  assert.equal(h30.perNight, 400);
  assert.equal(h30.boardingTotal, 12000);        // 400×30
});

test('calculateSmallPetBoarding — 日帰りガード（同日）= error day_use', () => {
  const q = C.calculateSmallPetBoarding({ animalType: 'rabbit_cage', checkInDate: '2026-06-01', checkOutDate: '2026-06-01' });
  assert.equal(q.error, 'day_use');
});
