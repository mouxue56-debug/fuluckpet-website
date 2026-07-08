/* boarding-calc.js — 宠物寄养估价：纯计算逻辑（照 宠物寄养.md §6/§9/§10/§13/§16/§17）。
 * 无状态、无 DOM、无网络：可被 node 测试直接加载，也可浏览器 window.BoardingCalc 调用。
 * 唯一价格来源 = boarding-config.js。红线：数值必与规则文档一致。
 * 关键口径：折扣取 min 不叠加；日期加价固定额、不参与折扣（§10.1/§23.2：折后基础价 + 加算）。 */
(function (root) {
  'use strict';

  var cfgApi = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
    ? require('./boarding-config.js')
    : root.BOARDING_CONFIG;
  var CONFIG = cfgApi.CONFIG;
  var HOLIDAYS = cfgApi.HOLIDAYS_2026;
  var RANGES = cfgApi.SPECIAL_DATE_RANGES;

  // §1.2 取整：100円四舍五入
  function roundYen100(amount) { return Math.round(amount / 100) * 100; }

  function parseDate(s) { var p = String(s).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(s, n) { var d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return fmtDate(d); }

  // §8.1 泊数 = 日历天差（入住当晚算1泊，退房当天不算）
  function getNights(checkInDate, checkOutDate) {
    return Math.round((parseDate(checkOutDate) - parseDate(checkInDate)) / 86400000);
  }
  // 各晚对应日期 = 入住日 … 入住日+泊数-1
  function getStayDates(checkInDate, nights) {
    var out = []; for (var i = 0; i < nights; i++) out.push(addDays(checkInDate, i)); return out;
  }

  function isWeekend(s) { var d = parseDate(s).getUTCDay(); return d === 0 || d === 6; }
  function isHoliday(s) { return HOLIDAYS.indexOf(s) !== -1; }
  function inRange(s, r) { return s >= r.start && s <= r.end; }

  // §9.6 日期类别优先级：high_season_core > school_vacation > weekend_or_holiday > normal（不叠加）
  function getDateCategory(s) {
    var i;
    for (i = 0; i < RANGES.length; i++) if (RANGES[i].enabled && RANGES[i].category === 'high_season_core' && inRange(s, RANGES[i])) return 'high_season_core';
    for (i = 0; i < RANGES.length; i++) if (RANGES[i].enabled && RANGES[i].category === 'school_vacation' && inRange(s, RANGES[i])) return 'school_vacation';
    if (isWeekend(s) || isHoliday(s)) return 'weekend_or_holiday';
    return 'normal';
  }

  // §6 长期阶梯（返回最优惠率或 null）
  function getLongStayRate(animalType, nights) {
    var tiers = CONFIG.longStayDiscount[animalType] || [];
    for (var i = 0; i < tiers.length; i++) if (nights >= tiers[i].minNights) return tiers[i].rate;
    return null;
  }

  // §4/§5/§6 寄宿折扣率：候选取 Math.min（不叠加）
  function getBoardingDiscountRate(input) {
    var rates = [1.0];
    if (input.isMember) rates.push(CONFIG.customerDiscount.member);
    if (input.animalType === 'cat' && input.isGraduatedCat) rates.push(CONFIG.customerDiscount.graduatedCat);
    var ls = getLongStayRate(input.animalType, input.nights);
    if (ls !== null) rates.push(ls);
    return Math.min.apply(null, rates);
  }

  // §10 寄宿总计算
  function calculateBoarding(input) {
    var nights = getNights(input.checkInDate, input.checkOutDate);
    if (!(nights >= 1)) return { nights: nights, error: 'day_use', boardingTotal: 0, nightlyBreakdown: [] };
    var rate = getBoardingDiscountRate({
      animalType: input.animalType, nights: nights, isMember: !!input.isMember, isGraduatedCat: !!input.isGraduatedCat,
    });
    var basePrice = CONFIG.boardingBasePrice[input.animalType];
    var discountedBasePerNight = roundYen100(basePrice * rate);
    var breakdown = getStayDates(input.checkInDate, nights).map(function (date) {
      var cat = getDateCategory(date);
      var sur = CONFIG.dateSurcharge[cat][input.animalType];
      return { date: date, dateCategory: cat, basePerNight: discountedBasePerNight, dateSurcharge: sur, totalForNight: discountedBasePerNight + sur };
    });
    var total = breakdown.reduce(function (s, n) { return s + n.totalForNight; }, 0);
    return {
      nights: nights, rate: rate, basePricePerNight: basePrice, discountedBasePerNight: discountedBasePerNight,
      nightlyBreakdown: breakdown, boardingTotal: total, needsReview: nights >= 30,
    };
  }

  // §13 猫洗护折扣（不叠加取最优；寄宿后按晚数）
  function getCatGroomingRate(input) {
    var d = CONFIG.catGroomingDiscount, rates = [1.0];
    if (input.isMember) rates.push(d.member);
    if (input.isGraduatedCat) rates.push(d.graduatedCat);
    var n = input.boardingNights || 0;
    if (n >= 14) rates.push(d.afterBoarding14Nights);
    else if (n >= 7) rates.push(d.afterBoarding7Nights);
    else if (n >= 3) rates.push(d.afterBoarding3Nights);
    return Math.min.apply(null, rates);
  }
  function calculateCatGrooming(menu, input) {
    var base = CONFIG.catGroomingBasePrice[menu];
    if (base == null) return null;
    var rate = getCatGroomingRate(input || {});
    return { menu: menu, basePrice: base, appliedDiscountRate: rate, subtotal: roundYen100(base * rate) };
  }

  // §14 わんちゃんの基本ケア（无折扣，固定价；按体型）
  function calculateDogCare(animalType) {
    var price = CONFIG.dogCarePrice[animalType];
    if (price == null) return null;
    return { animalType: animalType, subtotal: price };
  }

  // §16 接送（单程档位；往返 9 折；>120 分 custom）
  function getTransportOneWayFee(minutes) {
    var tiers = CONFIG.transportOneWayFee;
    for (var i = 0; i < tiers.length; i++) if (minutes <= tiers[i].maxMinutes) return tiers[i].fee;
    return 'custom';
  }
  function calculateTransportFee(input) {
    var fees = [], f;
    if (input.pickupMinutes != null) { f = getTransportOneWayFee(input.pickupMinutes); if (f === 'custom') return 'custom'; fees.push(f); }
    if (input.dropoffMinutes != null) { f = getTransportOneWayFee(input.dropoffMinutes); if (f === 'custom') return 'custom'; fees.push(f); }
    var sub = fees.reduce(function (s, x) { return s + x; }, 0);
    return fees.length === 2 ? roundYen100(sub * CONFIG.transportRoundTripDiscountRate) : sub;
  }

  // §17 等待费（30 分免费后每 30 分 ¥1,000，端数进位）
  function calculateWaitingFee(waitingMinutes) {
    var free = CONFIG.waitingFee.freeMinutes;
    if (waitingMinutes <= free) return 0;
    var units = Math.ceil((waitingMinutes - free) / CONFIG.waitingFee.unitMinutes);
    return units * CONFIG.waitingFee.feePerUnit;
  }

  // ── 小動物お預かり（ポスター準拠・泊数階梯のみ；日付加算・会員/卒業割引なし）──
  // 小動物タイプ判定（CONFIG.smallPetBoarding のキー）
  function isSmallPetType(animalType) {
    var m = CONFIG.smallPetBoarding;
    return !!(m && Object.prototype.hasOwnProperty.call(m, animalType));
  }
  // 1泊単価（tiers を上から走査＝minNights 降順、nights>=minNights の最初のティア）。未知タイプは null。
  function getSmallPetPerNight(animalType, nights) {
    var cfg = CONFIG.smallPetBoarding && CONFIG.smallPetBoarding[animalType];
    if (!cfg) return null;
    var tiers = cfg.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (nights >= tiers[i].minNights) return tiers[i].perNight;
    return null;
  }
  // 小動物寄宿総計算。boardingTotal = perNight × nights（¥100 丸めなし＝ポスター単価そのまま）。
  // day_use ガードは calculateBoarding と同一（nights<1）。
  function calculateSmallPetBoarding(input) {
    var nights = getNights(input.checkInDate, input.checkOutDate);
    if (!(nights >= 1)) return { nights: nights, error: 'day_use', boardingTotal: 0, perNight: null, tierMinNights: null };
    var cfg = CONFIG.smallPetBoarding && CONFIG.smallPetBoarding[input.animalType];
    var perNight = getSmallPetPerNight(input.animalType, nights);
    if (perNight === null) return { nights: nights, error: 'unknown_type', boardingTotal: 0, perNight: null, tierMinNights: null };
    var tierMinNights = null, tiers = cfg.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (nights >= tiers[i].minNights) { tierMinNights = tiers[i].minNights; break; }
    return { nights: nights, perNight: perNight, boardingTotal: perNight * nights, tierMinNights: tierMinNights };
  }

  var api = {
    roundYen100: roundYen100, getNights: getNights, getStayDates: getStayDates, getDateCategory: getDateCategory,
    getLongStayRate: getLongStayRate, getBoardingDiscountRate: getBoardingDiscountRate, calculateBoarding: calculateBoarding,
    getCatGroomingRate: getCatGroomingRate, calculateCatGrooming: calculateCatGrooming, calculateDogCare: calculateDogCare,
    getTransportOneWayFee: getTransportOneWayFee, calculateTransportFee: calculateTransportFee, calculateWaitingFee: calculateWaitingFee,
    isSmallPetType: isSmallPetType, getSmallPetPerNight: getSmallPetPerNight, calculateSmallPetBoarding: calculateSmallPetBoarding,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BoardingCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
