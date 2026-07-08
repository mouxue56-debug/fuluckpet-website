/* boarding-config.js — 宠物寄养估价：单一价格真源（照抄 宠物寄养.md §28 / §9）。
 * 全站唯一价格/折扣/日期配置来源。前端与测试都只读这里，杜绝第二份手写价。
 * 数值皆来自 owner 规则文档 v0.4，不得擅改。税込・JPY。
 * v2 待办：迁至 KV + admin 编辑器（DECISION_MEMO D2）。
 * 用法：node → require('./boarding-config.js'); 浏览器 → window.BOARDING_CONFIG。 */
(function (root) {
  'use strict';

  var CONFIG = {
    currency: 'JPY',
    taxIncluded: true,
    roundUnit: 100,

    // §3.1 寄宿基础价 / 1晚（税込）
    // v3 2026-07-08 owner 指示：在 v2（×0.85）基础上「再打9折做基准」→ v2 价 ×0.9（roundYen100）。
    //   原价 6200/9600/10700/11700 → v2 5300/8200/9100/9900 → v3 4800/7400/8200/8900（累计 ≈76.5%）。
    // 市场核对：大阪猫 1 泊行情 ~¥5,500 → v3 ¥4,800 明确低于行情，获客定位强。
    boardingBasePrice: { cat: 4800, small_dog: 7400, medium_dog: 8200, large_dog: 8900 },

    // 小動物お預かり（2026-07-07 owner ポスター準拠・数値そのまま）：
    // 1泊単価の泊数階梯（≈5/10/15/20%OFF at 7/14/21/30泊）。日付加算・会員/卒業猫割引は適用しない。
    // rabbit_cage=60cmケージ（うさぎ・チンチラ・フェレット等）／hamster_cage=小動物ケージ（ハムスター等）。
    // 鳥・爬虫類（ヘビ等）は要相談（お見積り）。
    smallPetBoarding: {
      rabbit_cage: {
        tiers: [
          { minNights: 30, perNight: 1200 }, { minNights: 21, perNight: 1275 },
          { minNights: 14, perNight: 1350 }, { minNights: 7, perNight: 1425 },
          { minNights: 1, perNight: 1500 },
        ],
      },
      hamster_cage: {
        tiers: [
          { minNights: 30, perNight: 400 }, { minNights: 21, perNight: 428 },
          { minNights: 14, perNight: 451 }, { minNights: 7, perNight: 475 },
          { minNights: 1, perNight: 500 },
        ],
      },
    },

    // §5 顾客身份折扣（不叠加，取最优）
    customerDiscount: { member: 0.9, graduatedCat: 0.85 },

    // §6 长期寄宿阶梯（按晚数，与身份折扣不叠加取最优）
    longStayDiscount: {
      cat:       [{ minNights: 30, rate: 0.60 }, { minNights: 14, rate: 0.75 }, { minNights: 7, rate: 0.80 }],
      small_dog: [{ minNights: 30, rate: 0.65 }, { minNights: 14, rate: 0.75 }, { minNights: 7, rate: 0.80 }],
      medium_dog:[{ minNights: 30, rate: 0.70 }, { minNights: 14, rate: 0.75 }, { minNights: 7, rate: 0.80 }],
      large_dog: [{ minNights: 30, rate: 0.70 }, { minNights: 14, rate: 0.75 }, { minNights: 7, rate: 0.80 }],
    },

    // §9.2 日期加价（固定额，不参与折扣，每晚只取最高优先级一类）
    dateSurcharge: {
      normal:             { cat: 0,    small_dog: 0,    medium_dog: 0,    large_dog: 0 },
      weekend_or_holiday: { cat: 550,  small_dog: 550,  medium_dog: 1100, large_dog: 1100 },
      school_vacation:    { cat: 1100, small_dog: 1100, medium_dog: 1650, large_dog: 2200 },
      high_season_core:   { cat: 2200, small_dog: 2200, medium_dog: 3300, large_dog: 3300 },
    },

    // §13 猫洗护基础价（v3 2026-07-08 owner：洗护价 ×0.85 · roundYen100；原 8000/9000/10000/11000）
    catGroomingBasePrice: { short_standard: 6800, short_comfort: 7700, long_standard: 8500, long_comfort: 9400 },
    // §13.2 猫洗护折扣（不叠加取最优；寄宿后洗护按住宿晚数）
    catGroomingDiscount: { member: 0.85, graduatedCat: 0.70, afterBoarding3Nights: 0.90, afterBoarding7Nights: 0.85, afterBoarding14Nights: 0.80 },

    // §14.2 狗狗简易清洁（禁称「トリミング/専門美容」——见文案红线）
    // v3 2026-07-08 owner：洗护/清洁价 ×0.85 · roundYen100（原 1100/1650/2200 … 3300/4400/6600）
    dogCleaningPrice: {
      local_cleaning:      { small_dog: 900,  medium_dog: 1400, large_dog: 1900 },
      body_wipe:           { small_dog: 1900, medium_dog: 2800, large_dog: 3700 },
      footwash_plus_local: { small_dog: 2300, medium_dog: 3300, large_dog: 4700 },
      simple_wash:         { small_dog: 2800, medium_dog: 3700, large_dog: 5600 },
    },

    // §16 接送（按单程车程；往返 9 折；>120 分 custom）
    // v3 2026-07-08 owner 指示：30分以内 ¥2,000／60分 ¥3,000（+¥1,000/30分 延伸 90分¥4,000・120分¥5,000）
    transportOneWayFee: [{ maxMinutes: 30, fee: 2000 }, { maxMinutes: 60, fee: 3000 }, { maxMinutes: 90, fee: 4000 }, { maxMinutes: 120, fee: 5000 }],
    transportRoundTripDiscountRate: 0.90,

    // §17 等待费（30 分免费，之后每 30 分 ¥1,000，端数进位）
    waitingFee: { freeMinutes: 30, unitMinutes: 30, feePerUnit: 1000 },

    // §8.2 标准退房时间（时间版规则用，v1 仅日期版可留作展示）
    standardCheckoutTime: '12:00',

    // §15/§19 追加费指引（只展示，不自动计入总价）
    additionalFeeGuide: {
      medication: '¥550〜¥1,100 / 日', matting: '¥550 / 10分〜', shedding: '¥1,100〜¥3,300',
      specialCare: '¥1,100 / 泊〜 または +20〜50%', isolation: '¥1,100〜¥2,200 / 泊',
      aggressiveBehavior: '¥1,100〜¥3,300 / 日 または お断り', groomingStopFee: '¥3,300〜¥5,500',
    },
  };

  // §9.3 2026 日本官方祝日 / 休日
  var HOLIDAYS_2026 = [
    '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29',
    '2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11',
    '2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23',
  ];

  // §9.4 / §9.5 店铺特定日期范围（enabled=false 的默认不启用：春休み）
  var SPECIAL_DATE_RANGES = [
    { label: 'GW',       category: 'high_season_core', start: '2026-04-29', end: '2026-05-06', enabled: true },
    { label: '夏休み',   category: 'school_vacation',  start: '2026-07-20', end: '2026-08-31', enabled: true },
    { label: 'お盆',     category: 'high_season_core', start: '2026-08-08', end: '2026-08-16', enabled: true },
    { label: '9月連休',  category: 'school_vacation',  start: '2026-09-19', end: '2026-09-23', enabled: true },
    { label: '冬休み',   category: 'school_vacation',  start: '2026-12-20', end: '2027-01-07', enabled: true },
    { label: '年末年始', category: 'high_season_core', start: '2026-12-26', end: '2027-01-04', enabled: true },
    { label: '春休み',   category: 'school_vacation',  start: '2026-03-20', end: '2026-04-07', enabled: false },
  ];

  var api = { CONFIG: CONFIG, HOLIDAYS_2026: HOLIDAYS_2026, SPECIAL_DATE_RANGES: SPECIAL_DATE_RANGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BOARDING_CONFIG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
