/* boarding-public-config.js — licensed public boarding and cat-care price source.
 * Values are the owner-approved 2026-07-08 v4 prices. Dog prices are retained
 * only as a disabled capability because registration 220012B does not list dogs.
 * Browser: window.BOARDING_CONFIG; Node: require(). */
(function (root) {
  'use strict';

  var CAT_CARE_CATALOG = {
    packages: [
      { id: 'short', label: '短毛猫', price: 4000, includedItemIds: ['shampoo', 'nail', 'ear', 'anal'] },
      { id: 'long', label: '長毛猫', price: 6000, includedItemIds: ['shampoo', 'nail', 'ear', 'anal'] },
    ],
    items: [
      { id: 'nail', label: '爪切り', price: 1100, unit: '1回', discountEligible: true, quoteOnly: false, maxQuantity: 1 },
      { id: 'ear', label: '耳掃除', price: 660, unit: '1回', discountEligible: true, quoteOnly: false, maxQuantity: 1 },
      { id: 'paw', label: '足裏・足まわり', price: 1100, unit: '1回', discountEligible: true, quoteOnly: false, maxQuantity: 1 },
      { id: 'dental', label: '歯みがき', price: 1100, unit: '1回', discountEligible: true, quoteOnly: false, maxQuantity: 1 },
      { id: 'anal', label: '肛門腺絞り', price: null, unit: '', discountEligible: true, quoteOnly: true, maxQuantity: 1 },
      { id: 'matting15', label: '毛玉・ブラッシング', price: 1100, unit: '15分', discountEligible: false, quoteOnly: false, maxQuantity: 8 },
    ],
    discounts: {
      member: 0.85,
      graduatedCat: 0.70,
      afterBoarding3Nights: 0.90,
      afterBoarding7Nights: 0.85,
      afterBoarding14Nights: 0.80,
    },
  };

  var DOG_CARE_CATALOG = {
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
  };

  var CONFIG = {
    currency: 'JPY',
    taxIncluded: true,
    roundUnit: 100,

    boardingBasePrice: { cat: 4800 },
    smallPetBoarding: {
      rabbit_cage: {
        tiers: [
          { minNights: 30, perNight: 1200 },
          { minNights: 21, perNight: 1275 },
          { minNights: 14, perNight: 1350 },
          { minNights: 7, perNight: 1425 },
          { minNights: 1, perNight: 1500 },
        ],
      },
      hamster_cage: {
        tiers: [
          { minNights: 30, perNight: 400 },
          { minNights: 21, perNight: 428 },
          { minNights: 14, perNight: 451 },
          { minNights: 7, perNight: 475 },
          { minNights: 1, perNight: 500 },
        ],
      },
    },

    dogServices: {
      // SINGLE PUBLIC LAUNCH GATE: generate-site projects this into dog-services-launch.json.
      // Keep disabled until the legal scope explicitly lists dogs.
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
    },

    customerDiscount: { member: 0.9, graduatedCat: 0.85 },
    longStayDiscount: {
      cat: [
        { minNights: 30, rate: 0.60 },
        { minNights: 14, rate: 0.75 },
        { minNights: 7, rate: 0.80 },
      ],
    },
    dateSurcharge: {
      normal: { cat: 0 },
      weekend_or_holiday: { cat: 550 },
      school_vacation: { cat: 1100 },
      high_season_core: { cat: 2200 },
    },

    careCatalog: {
      cat: CAT_CARE_CATALOG,
      dog: DOG_CARE_CATALOG,
    },
  };

  var HOLIDAYS_2026 = [
    '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
    '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
    '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-10-12', '2026-11-03', '2026-11-23',
  ];

  var HOLIDAYS_2027 = [
    '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21',
    '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05',
    '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11',
    '2027-11-03', '2027-11-23',
  ];
  var HOLIDAYS = HOLIDAYS_2026.concat(HOLIDAYS_2027);

  var SPECIAL_DATE_RANGES = [
    { label: 'GW', category: 'high_season_core', start: '2026-04-29', end: '2026-05-06', enabled: true },
    { label: '夏休み', category: 'school_vacation', start: '2026-07-20', end: '2026-08-31', enabled: true },
    { label: 'お盆', category: 'high_season_core', start: '2026-08-08', end: '2026-08-16', enabled: true },
    { label: '9月連休', category: 'school_vacation', start: '2026-09-19', end: '2026-09-23', enabled: true },
    { label: '冬休み', category: 'school_vacation', start: '2026-12-20', end: '2027-01-07', enabled: true },
    { label: '年末年始', category: 'high_season_core', start: '2026-12-26', end: '2027-01-04', enabled: true },
    { label: 'GW', category: 'high_season_core', start: '2027-04-29', end: '2027-05-06', enabled: true },
    { label: '夏休み', category: 'school_vacation', start: '2027-07-20', end: '2027-08-31', enabled: true },
    { label: 'お盆', category: 'high_season_core', start: '2027-08-08', end: '2027-08-16', enabled: true },
    { label: '9月連休', category: 'school_vacation', start: '2027-09-19', end: '2027-09-23', enabled: true },
    { label: '冬休み', category: 'school_vacation', start: '2027-12-20', end: '2028-01-07', enabled: true },
    { label: '年末年始', category: 'high_season_core', start: '2027-12-26', end: '2028-01-04', enabled: true },
  ];

  var api = {
    CONFIG: CONFIG,
    HOLIDAYS_2026: HOLIDAYS_2026,
    HOLIDAYS_2027: HOLIDAYS_2027,
    HOLIDAYS: HOLIDAYS,
    SPECIAL_DATE_RANGES: SPECIAL_DATE_RANGES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BOARDING_CONFIG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
