/* Pure dog-service launch projection. Browser: window.DogServicesProjection; Node: require(). */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DogServicesProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SIZE_KEYS = ['small', 'medium', 'large'];
  var SIZE_LABELS = { small: '小型犬', medium: '中型犬', large: '大型犬' };
  var DATE_CATEGORIES = ['normal', 'weekend_or_holiday', 'school_vacation', 'high_season_core'];
  var CARE_ITEM_DEFINITIONS = [
    { id: 'nail', label: '爪切り' },
    { id: 'ear', label: '耳掃除' },
    { id: 'anal', label: '肛門腺' },
  ];
  var CARE_BUNDLE_DEFINITIONS = [
    { id: 'basic3', label: '基本ケア3点セット', includedItemIds: ['nail', 'ear', 'anal'] },
  ];
  var FALSE_PROJECTION = Object.freeze({ public: false });

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasExactKeys(value, keys) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function (key, index) {
      return key === expected[index];
    });
  }

  function validBoardingYen(value, allowZero) {
    return Number.isInteger(value) && value >= (allowZero ? 0 : 1000) && value <= 1000000;
  }

  function validCareYen(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    var parts = value.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  }

  function validSizeMap(value, validator) {
    if (!hasExactKeys(value, SIZE_KEYS)) return false;
    return SIZE_KEYS.every(function (size) { return validator(value[size], size); });
  }

  function validTierList(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 8) return false;
    var previousMin = Infinity;
    return value.every(function (tier) {
      if (!hasExactKeys(tier, ['minNights', 'rate'])) return false;
      if (!Number.isInteger(tier.minNights) || tier.minNights < 1 || tier.minNights > 365) return false;
      if (!(typeof tier.rate === 'number' && tier.rate >= 0.1 && tier.rate <= 1)) return false;
      if (tier.minNights >= previousMin) return false;
      previousMin = tier.minNights;
      return true;
    });
  }

  function validIncludedItemIds(value, expected) {
    return Array.isArray(value) && value.length === expected.length && value.every(function (id, index) {
      return id === expected[index];
    });
  }

  function validCareCatalog(value) {
    if (!hasExactKeys(value, ['items', 'bundles'])) return false;
    if (!Array.isArray(value.items) || value.items.length !== CARE_ITEM_DEFINITIONS.length) return false;
    if (!value.items.every(function (item, index) {
      var expected = CARE_ITEM_DEFINITIONS[index];
      return hasExactKeys(item, ['id', 'label', 'priceBySize']) &&
        item.id === expected.id && item.label === expected.label &&
        validSizeMap(item.priceBySize, validCareYen);
    })) return false;
    if (!Array.isArray(value.bundles) || value.bundles.length !== CARE_BUNDLE_DEFINITIONS.length) return false;
    return value.bundles.every(function (bundle, index) {
      var expected = CARE_BUNDLE_DEFINITIONS[index];
      return hasExactKeys(bundle, ['id', 'label', 'includedItemIds', 'priceBySize']) &&
        bundle.id === expected.id && bundle.label === expected.label &&
        validIncludedItemIds(bundle.includedItemIds, expected.includedItemIds) &&
        validSizeMap(bundle.priceBySize, validCareYen);
    });
  }

  function validateDogServicesProjection(value) {
    if (hasExactKeys(value, ['public']) && value.public === false) return true;
    if (!hasExactKeys(value, [
      'public', 'version', 'currency', 'taxIncluded', 'roundUnit', 'sizes',
      'memberDiscountRate', 'longStayDiscount', 'dateSurcharge', 'calendar', 'care',
    ])) return false;
    if (value.public !== true || value.version !== 2 || value.currency !== 'JPY') return false;
    if (value.taxIncluded !== true || value.roundUnit !== 100) return false;
    if (!(typeof value.memberDiscountRate === 'number' && value.memberDiscountRate >= 0.5 && value.memberDiscountRate <= 1)) return false;
    if (!validSizeMap(value.sizes, function (entry, size) {
      return hasExactKeys(entry, ['label', 'boardingPerNight']) &&
        entry.label === SIZE_LABELS[size] && validBoardingYen(entry.boardingPerNight, false);
    })) return false;
    if (!validSizeMap(value.longStayDiscount, validTierList)) return false;
    if (!hasExactKeys(value.dateSurcharge, DATE_CATEGORIES)) return false;
    if (!DATE_CATEGORIES.every(function (category) {
      return validSizeMap(value.dateSurcharge[category], function (amount) { return validBoardingYen(amount, true); });
    })) return false;
    if (!hasExactKeys(value.calendar, ['holidays', 'specialDateRanges'])) return false;
    if (!Array.isArray(value.calendar.holidays) || value.calendar.holidays.length > 100 ||
        !value.calendar.holidays.every(validDate)) return false;
    if (!Array.isArray(value.calendar.specialDateRanges) || value.calendar.specialDateRanges.length > 40 ||
        !value.calendar.specialDateRanges.every(function (range) {
          return hasExactKeys(range, ['category', 'start', 'end', 'enabled']) &&
            (range.category === 'school_vacation' || range.category === 'high_season_core') &&
            validDate(range.start) && validDate(range.end) && range.start <= range.end && range.enabled === true;
        })) return false;
    return validCareCatalog(value.care);
  }

  function validateDogServicesPreparingProjection(value) {
    if (!hasExactKeys(value, [
      'public', 'preparing', 'accepting', 'locationNotice', 'version', 'currency', 'taxIncluded',
      'roundUnit', 'sizes', 'memberDiscountRate', 'longStayDiscount', 'dateSurcharge', 'calendar',
      'care',
    ])) return false;
    if (value.public !== false || value.preparing !== true || value.accepting !== false) return false;
    if (value.locationNotice !== '大阪・針中野での受付開始を予定しています。開始時期は決まり次第お知らせします。') return false;
    var launchShape = {};
    Object.keys(value).forEach(function (key) {
      if (key !== 'preparing' && key !== 'accepting' && key !== 'locationNotice') launchShape[key] = value[key];
    });
    launchShape.public = true;
    return validateDogServicesProjection(launchShape);
  }

  function copySizeMap(source, valueForSize) {
    var output = {};
    SIZE_KEYS.forEach(function (size) { output[size] = valueForSize(source || {}, size); });
    return output;
  }

  function copyCareCatalog(source) {
    var items = source && Array.isArray(source.items) ? source.items : [];
    var bundles = source && Array.isArray(source.bundles) ? source.bundles : [];
    return {
      items: items.map(function (item) {
        return {
          id: item && item.id,
          label: item && item.label,
          priceBySize: copySizeMap(item && item.priceBySize, function (prices, size) { return prices[size]; }),
        };
      }),
      bundles: bundles.map(function (bundle) {
        return {
          id: bundle && bundle.id,
          label: bundle && bundle.label,
          includedItemIds: bundle && Array.isArray(bundle.includedItemIds) ? bundle.includedItemIds.slice() : [],
          priceBySize: copySizeMap(bundle && bundle.priceBySize, function (prices, size) { return prices[size]; }),
        };
      }),
    };
  }

  function buildEnabledShape(configApi) {
    var config = configApi && configApi.CONFIG;
    var dog = config && config.dogServices;
    if (!dog) throw new Error('dogServices config unavailable');
    if (!Array.isArray(configApi && configApi.HOLIDAYS)) throw new Error('combined holidays unavailable');

    var projection = {
      public: true,
      version: 2,
      currency: config.currency,
      taxIncluded: config.taxIncluded,
      roundUnit: config.roundUnit,
      memberDiscountRate: config.customerDiscount && config.customerDiscount.member,
      sizes: copySizeMap(dog.boardingBasePrice, function (_source, size) {
        return {
          label: SIZE_LABELS[size],
          boardingPerNight: dog.boardingBasePrice[size],
        };
      }),
      longStayDiscount: copySizeMap(dog.longStayDiscount, function (source, size) {
        return (source[size] || []).map(function (tier) {
          return { minNights: tier.minNights, rate: tier.rate };
        });
      }),
      dateSurcharge: {},
      calendar: {
        holidays: configApi.HOLIDAYS.slice(),
        specialDateRanges: (configApi.SPECIAL_DATE_RANGES || []).filter(function (range) {
          return range && range.enabled === true &&
            (range.category === 'school_vacation' || range.category === 'high_season_core');
        }).map(function (range) {
          return { category: range.category, start: range.start, end: range.end, enabled: true };
        }),
      },
      care: copyCareCatalog(config.careCatalog && config.careCatalog.dog),
    };
    DATE_CATEGORIES.forEach(function (category) {
      projection.dateSurcharge[category] = copySizeMap(dog.dateSurcharge[category], function (source, size) {
        return source[size];
      });
    });
    if (!validateDogServicesProjection(projection)) {
      throw new Error('dogServices public config cannot produce a safe projection');
    }
    return projection;
  }

  function buildDogServicesProjection(configApi) {
    var dog = configApi && configApi.CONFIG && configApi.CONFIG.dogServices;
    if (!dog || dog.public !== true) return { public: false };
    return buildEnabledShape(configApi);
  }

  function buildDogServicesPreparingProjection(configApi) {
    var dog = configApi && configApi.CONFIG && configApi.CONFIG.dogServices;
    if (!dog || dog.preparingVisible !== true) return { public: false, preparing: false };
    var enabled = buildEnabledShape(configApi);
    var preparing = Object.assign({}, enabled, {
      public: false,
      preparing: true,
      accepting: false,
      locationNotice: dog.locationNotice,
    });
    if (!validateDogServicesPreparingProjection(preparing)) {
      throw new Error('dogServices preparing config cannot produce a safe projection');
    }
    return preparing;
  }

  function serializeDogServicesProjection(configApi) {
    return JSON.stringify(buildDogServicesProjection(configApi)) + '\n';
  }

  function serializeDogServicesPreparingProjection(configApi) {
    return JSON.stringify(buildDogServicesPreparingProjection(configApi)) + '\n';
  }

  return {
    FALSE_PROJECTION: FALSE_PROJECTION,
    SIZE_KEYS: SIZE_KEYS.slice(),
    buildDogServicesProjection: buildDogServicesProjection,
    buildDogServicesPreparingProjection: buildDogServicesPreparingProjection,
    serializeDogServicesProjection: serializeDogServicesProjection,
    serializeDogServicesPreparingProjection: serializeDogServicesPreparingProjection,
    validateDogServicesProjection: validateDogServicesProjection,
    validateDogServicesPreparingProjection: validateDogServicesPreparingProjection,
  };
});
