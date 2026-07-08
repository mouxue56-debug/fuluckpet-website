/* boarding-price-display.test.js — 单一价格真源「防漂移」锁。
 * boarding/index.html 里手写展示的每一个价格，都必须能由 boarding-config.js（+ calc 的取整/折扣逻辑）推导出来。
 * owner 改 config 后若忘了同步静态展示表 / JSON-LD，本测试立刻红灯——这就是 Fable「让单一价格真源成真」的锁。
 * 只读，不改任何展示；boarding/index.html 是 noindex，但价格 drift 会误导估价与信任。 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { CONFIG } = require('../boarding-config.js');
const calc = require('../boarding-calc.js');
const { roundYen100, getLongStayRate } = calc;

const HTML = fs.readFileSync(path.join(__dirname, '..', 'boarding', 'index.html'), 'utf8');

// 展示格式：¥4,800（千位逗号）
const yen = (n) => '¥' + Number(n).toLocaleString('en-US');
const has = (needle) => HTML.includes(needle);

const ANIMALS = ['cat', 'small_dog', 'medium_dog', 'large_dog'];

test('基础价 base price — 展示卡 + 1泊行 + JSON-LD 三处都等于 config', () => {
  for (const a of ANIMALS) {
    const base = CONFIG.boardingBasePrice[a];
    assert.ok(has(yen(base)), `visible ¥${base} (${a}) missing from boarding/index.html`);
    assert.ok(has(`"price": "${base}"`), `JSON-LD Offer price "${base}" (${a}) missing`);
  }
});

test('小動物 1泊基准价 — JSON-LD + 阶梯表首行', () => {
  const rabbit = CONFIG.smallPetBoarding.rabbit_cage.tiers.find(t => t.minNights === 1).perNight;
  const hamster = CONFIG.smallPetBoarding.hamster_cage.tiers.find(t => t.minNights === 1).perNight;
  assert.ok(has(`"price": "${rabbit}"`), `small-pet rabbit JSON-LD "${rabbit}" missing`);
  assert.ok(has(`"price": "${hamster}"`), `small-pet hamster JSON-LD "${hamster}" missing`);
  // 阶梯表：每一档 perNight 都应作为展示值出现
  for (const kind of ['rabbit_cage', 'hamster_cage']) {
    for (const t of CONFIG.smallPetBoarding[kind].tiers) {
      assert.ok(has(yen(t.perNight)), `small-pet ${kind} tier ${yen(t.perNight)} missing from display`);
    }
  }
});

test('長期割引阶梯表 — 每一档展示值 = roundYen100(base × getLongStayRate)', () => {
  // 表内代表泊数：7〜13 / 14〜29 / 30〜（1〜6 为基础价，已在上一测试覆盖）
  const NIGHTS = [7, 14, 30];
  for (const a of ANIMALS) {
    const base = CONFIG.boardingBasePrice[a];
    for (const n of NIGHTS) {
      const expected = roundYen100(base * getLongStayRate(a, n));
      assert.ok(has(yen(expected)), `long-stay ${a}@${n}泊 expected ${yen(expected)} missing from table (drift!)`);
    }
  }
});

test('日付加算表 — 各カテゴリの加算額 = config.dateSurcharge', () => {
  for (const cat of ['weekend_or_holiday', 'school_vacation', 'high_season_core']) {
    for (const a of ANIMALS) {
      const s = CONFIG.dateSurcharge[cat][a];
      if (s > 0) assert.ok(has('+' + yen(s)), `surcharge ${cat}/${a} = +${yen(s)} missing`);
    }
  }
});

test('猫の洗護 — 短毛/長毛 = config.catGroomingBasePrice', () => {
  assert.ok(has(yen(CONFIG.catGroomingBasePrice.short)), `cat grooming short ${yen(CONFIG.catGroomingBasePrice.short)} missing`);
  assert.ok(has(yen(CONFIG.catGroomingBasePrice.long)), `cat grooming long ${yen(CONFIG.catGroomingBasePrice.long)} missing`);
});

test('わんちゃん基本ケア — 小型/中型/大型 = config.dogCarePrice', () => {
  for (const a of ['small_dog', 'medium_dog', 'large_dog']) {
    assert.ok(has(yen(CONFIG.dogCarePrice[a])), `dog care ${a} ${yen(CONFIG.dogCarePrice[a])} missing`);
  }
});

test('送迎 — 片道最短档 = config.transportOneWayFee[0].fee', () => {
  const oneWay = CONFIG.transportOneWayFee[0].fee;
  assert.ok(has(yen(oneWay)), `transport one-way base ${yen(oneWay)} missing`);
});
