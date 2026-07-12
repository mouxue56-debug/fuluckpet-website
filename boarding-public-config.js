/* boarding-public-config.js — licensed public boarding and cat-care price source.
 * Values are the owner-approved 2026-07-08 v4 prices. Dog prices are retained
 * only as a disabled capability because registration 220012B does not list dogs.
 * Browser: window.BOARDING_CONFIG; Node: require(). */
(function (root) {
  'use strict';

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
      // SINGLE PUBLIC LAUNCH GATE: keep disabled until the legal scope explicitly lists dogs.
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

    catGroomingBasePrice: { short: 4000, long: 6000 },
    catGroomingDiscount: {
      member: 0.85,
      graduatedCat: 0.70,
      afterBoarding3Nights: 0.90,
      afterBoarding7Nights: 0.85,
      afterBoarding14Nights: 0.80,
    },
  };

  var HOLIDAYS_2026 = [
    '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
    '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
    '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-10-12', '2026-11-03', '2026-11-23',
  ];

  var SPECIAL_DATE_RANGES = [
    { label: 'GW', category: 'high_season_core', start: '2026-04-29', end: '2026-05-06', enabled: true },
    { label: '夏休み', category: 'school_vacation', start: '2026-07-20', end: '2026-08-31', enabled: true },
    { label: 'お盆', category: 'high_season_core', start: '2026-08-08', end: '2026-08-16', enabled: true },
    { label: '9月連休', category: 'school_vacation', start: '2026-09-19', end: '2026-09-23', enabled: true },
    { label: '冬休み', category: 'school_vacation', start: '2026-12-20', end: '2027-01-07', enabled: true },
    { label: '年末年始', category: 'high_season_core', start: '2026-12-26', end: '2027-01-04', enabled: true },
  ];

  var api = {
    CONFIG: CONFIG,
    HOLIDAYS_2026: HOLIDAYS_2026,
    SPECIAL_DATE_RANGES: SPECIAL_DATE_RANGES,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BOARDING_CONFIG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
