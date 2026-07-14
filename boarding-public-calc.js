/* boarding-public-calc.js — pure calculations for licensed public services. */
(function (root) {
  'use strict';

  var configApi = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
    ? require('./boarding-public-config.js')
    : root.BOARDING_CONFIG;
  var CONFIG = configApi.CONFIG;
  var HOLIDAYS = configApi.HOLIDAYS;
  var RANGES = configApi.SPECIAL_DATE_RANGES;
  var projectionApi = (typeof module !== 'undefined' && module.exports && typeof require !== 'undefined')
    ? require('./dog-services-projection.js')
    : root.DogServicesProjection;

  function roundYen100(amount) {
    return Math.round(amount / 100) * 100;
  }

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function formatDate(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return formatDate(date) === value ? date : null;
  }

  function addDays(value, count) {
    var date = parseDate(value);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() + count);
    return formatDate(date);
  }

  function getNights(checkInDate, checkOutDate) {
    var checkIn = parseDate(checkInDate);
    var checkOut = parseDate(checkOutDate);
    if (!checkIn || !checkOut) return NaN;
    return Math.round((checkOut - checkIn) / 86400000);
  }

  function getStayDates(checkInDate, nights) {
    var dates = [];
    for (var index = 0; index < nights; index += 1) dates.push(addDays(checkInDate, index));
    return dates;
  }

  function isWeekend(value) {
    var date = parseDate(value);
    if (!date) return false;
    var day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  function inRange(value, range) {
    return value >= range.start && value <= range.end;
  }

  function getDateCategory(value) {
    for (var index = 0; index < RANGES.length; index += 1) {
      if (RANGES[index].enabled && RANGES[index].category === 'high_season_core' && inRange(value, RANGES[index])) return 'high_season_core';
    }
    for (var second = 0; second < RANGES.length; second += 1) {
      if (RANGES[second].enabled && RANGES[second].category === 'school_vacation' && inRange(value, RANGES[second])) return 'school_vacation';
    }
    if (isWeekend(value) || HOLIDAYS.indexOf(value) !== -1) return 'weekend_or_holiday';
    return 'normal';
  }

  function getLongStayRate(animalType, nights) {
    var tiers = CONFIG.longStayDiscount[animalType] || [];
    for (var index = 0; index < tiers.length; index += 1) {
      if (nights >= tiers[index].minNights) return tiers[index].rate;
    }
    return null;
  }

  function getBoardingDiscountRate(input) {
    var rates = [1];
    if (input.isMember) rates.push(CONFIG.customerDiscount.member);
    if (input.animalType === 'cat' && input.isGraduatedCat) rates.push(CONFIG.customerDiscount.graduatedCat);
    var longStay = getLongStayRate(input.animalType, input.nights);
    if (longStay !== null) rates.push(longStay);
    return Math.min.apply(null, rates);
  }

  function calculateBoarding(input) {
    input = input || {};
    var basePrice = CONFIG.boardingBasePrice[input.animalType];
    if (!Number.isFinite(basePrice)) return { error: 'unknown_type', nights: 0, boardingTotal: 0, nightlyBreakdown: [] };

    var nights = getNights(input.checkInDate, input.checkOutDate);
    if (!(nights >= 1)) return { error: 'day_use', nights: nights, boardingTotal: 0, nightlyBreakdown: [] };

    var rate = getBoardingDiscountRate({
      animalType: input.animalType,
      nights: nights,
      isMember: !!input.isMember,
      isGraduatedCat: !!input.isGraduatedCat,
    });
    var discountedBasePerNight = roundYen100(basePrice * rate);
    var breakdown = getStayDates(input.checkInDate, nights).map(function (date) {
      var category = getDateCategory(date);
      var surcharge = CONFIG.dateSurcharge[category][input.animalType];
      return {
        date: date,
        dateCategory: category,
        basePerNight: discountedBasePerNight,
        dateSurcharge: surcharge,
        totalForNight: discountedBasePerNight + surcharge,
      };
    });
    return {
      nights: nights,
      rate: rate,
      basePricePerNight: basePrice,
      discountedBasePerNight: discountedBasePerNight,
      nightlyBreakdown: breakdown,
      boardingTotal: breakdown.reduce(function (sum, night) { return sum + night.totalForNight; }, 0),
      needsReview: nights >= 30,
    };
  }

  function isSmallPetType(animalType) {
    return !!(CONFIG.smallPetBoarding && Object.prototype.hasOwnProperty.call(CONFIG.smallPetBoarding, animalType));
  }

  function getSmallPetPerNight(animalType, nights) {
    var service = CONFIG.smallPetBoarding[animalType];
    if (!service) return null;
    for (var index = 0; index < service.tiers.length; index += 1) {
      if (nights >= service.tiers[index].minNights) return service.tiers[index].perNight;
    }
    return null;
  }

  function calculateSmallPetBoarding(input) {
    input = input || {};
    if (!isSmallPetType(input.animalType)) return { error: 'unknown_type', nights: 0, boardingTotal: 0, perNight: null };
    var nights = getNights(input.checkInDate, input.checkOutDate);
    if (!(nights >= 1)) return { error: 'day_use', nights: nights, boardingTotal: 0, perNight: null };
    var perNight = getSmallPetPerNight(input.animalType, nights);
    return { nights: nights, perNight: perNight, boardingTotal: perNight * nights };
  }

  function getCatGroomingRate(input) {
    input = input || {};
    var discount = CONFIG.careCatalog.cat.discounts;
    var rates = [1];
    if (input.isMember) rates.push(discount.member);
    if (input.isGraduatedCat) rates.push(discount.graduatedCat);
    var nights = Number(input.boardingNights) || 0;
    if (nights >= 14) rates.push(discount.afterBoarding14Nights);
    else if (nights >= 7) rates.push(discount.afterBoarding7Nights);
    else if (nights >= 3) rates.push(discount.afterBoarding3Nights);
    return Math.min.apply(null, rates);
  }

  function emptyCatCareResult(error) {
    var result = {
      packageId: '',
      appliedDiscountRate: 1,
      lineItems: [],
      skippedIncludedItemIds: [],
      needsQuote: false,
      subtotal: 0,
    };
    if (error) result.error = error;
    return result;
  }

  function formatYen(amount) {
    return '¥' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function discountedCatCarePrice(price, rate) {
    return rate === 1 ? price : roundYen100(price * rate);
  }

  function findById(entries, id) {
    for (var index = 0; index < entries.length; index += 1) {
      if (entries[index].id === id) return entries[index];
    }
    return null;
  }

  function isRecord(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function calculateCatCare(selection, customer) {
    if (!isRecord(selection)) return emptyCatCareResult('invalid_care_selection');
    if (typeof selection.packageId !== 'string') return emptyCatCareResult('invalid_care_selection');
    if (!isRecord(selection.quantities)) return emptyCatCareResult('invalid_care_selection');

    var catalog = CONFIG.careCatalog.cat;
    var packageConfig = selection.packageId ? findById(catalog.packages, selection.packageId) : null;
    if (selection.packageId && !packageConfig) return emptyCatCareResult('unknown_care_package');

    var itemKeys = Object.keys(selection.quantities);
    for (var keyIndex = 0; keyIndex < itemKeys.length; keyIndex += 1) {
      var itemConfig = findById(catalog.items, itemKeys[keyIndex]);
      if (!itemConfig) return emptyCatCareResult('unknown_care_item');
      var quantity = selection.quantities[itemKeys[keyIndex]];
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > itemConfig.maxQuantity) {
        return emptyCatCareResult('invalid_care_quantity');
      }
    }

    var rate = getCatGroomingRate(customer);
    return {
      appliedDiscountRate: rate,
      packageId: selection.packageId,
      lineItems: buildCatCareLineItems(catalog, packageConfig, selection.quantities, rate),
      skippedIncludedItemIds: getSkippedCatCareItemIds(catalog, packageConfig, selection.quantities),
      needsQuote: getCatCareNeedsQuote(catalog, packageConfig, selection.quantities),
      subtotal: getCatCareSubtotal(catalog, packageConfig, selection.quantities, rate),
    };
  }

  function getSkippedCatCareItemIds(catalog, packageConfig, quantities) {
    if (!packageConfig) return [];
    return catalog.items.filter(function (item) {
      return quantities[item.id] > 0 && packageConfig.includedItemIds.indexOf(item.id) !== -1;
    }).map(function (item) { return item.id; });
  }

  function getCatCareNeedsQuote(catalog, packageConfig, quantities) {
    return catalog.items.some(function (item) {
      var included = packageConfig && packageConfig.includedItemIds.indexOf(item.id) !== -1;
      return quantities[item.id] > 0 && !included && item.quoteOnly;
    });
  }

  function getCatCareSubtotal(catalog, packageConfig, quantities, rate) {
    var subtotal = packageConfig ? discountedCatCarePrice(packageConfig.price, rate) : 0;
    return catalog.items.reduce(function (sum, item) {
      var quantity = quantities[item.id] || 0;
      var included = packageConfig && packageConfig.includedItemIds.indexOf(item.id) !== -1;
      if (!quantity || included || item.quoteOnly) return sum;
      var itemRate = item.discountEligible ? rate : 1;
      return sum + discountedCatCarePrice(item.price * quantity, itemRate);
    }, subtotal);
  }

  function buildCatCareLineItems(catalog, packageConfig, quantities, rate) {
    var lineItems = [];
    if (packageConfig) {
      var packageSubtotal = discountedCatCarePrice(packageConfig.price, rate);
      lineItems.push({
        type: 'package',
        id: packageConfig.id,
        label: packageConfig.label,
        quantity: 1,
        unitPrice: packageConfig.price,
        appliedDiscountRate: rate,
        subtotal: packageSubtotal,
        displayPrice: formatYen(packageSubtotal),
      });
    }
    catalog.items.forEach(function (item) {
      var quantity = quantities[item.id] || 0;
      var included = packageConfig && packageConfig.includedItemIds.indexOf(item.id) !== -1;
      if (!quantity || included) return;
      var itemRate = item.discountEligible ? rate : 1;
      var subtotal = item.quoteOnly ? 0 : discountedCatCarePrice(item.price * quantity, itemRate);
      lineItems.push({
        type: 'item',
        id: item.id,
        label: item.label,
        unit: item.unit,
        quantity: quantity,
        unitPrice: item.price,
        appliedDiscountRate: itemRate,
        subtotal: subtotal,
        displayPrice: item.quoteOnly ? '要相談' : formatYen(subtotal),
      });
    });
    return lineItems;
  }

  function calculateCatGrooming(menu, input) {
    var result = calculateCatCare({ packageId: menu, quantities: {} }, input);
    if (result.error || !result.packageId) return null;
    var packageLine = result.lineItems[0];
    return {
      menu: menu,
      basePrice: packageLine.unitPrice,
      appliedDiscountRate: result.appliedDiscountRate,
      subtotal: result.subtotal,
    };
  }

  function unavailableDogService() {
    return { available: false, error: 'unavailable' };
  }

  function validDogProjection(projection) {
    if (!projectionApi) return false;
    var accepting = typeof projectionApi.validateDogServicesProjection === 'function' &&
      projectionApi.validateDogServicesProjection(projection) && projection.public === true;
    var preparing = typeof projectionApi.validateDogServicesPreparingProjection === 'function' &&
      projectionApi.validateDogServicesPreparingProjection(projection) && projection.preparing === true;
    return !!(accepting || preparing);
  }

  function getDogLongStayRate(size, nights, projection) {
    var tiers = projection.longStayDiscount[size] || [];
    for (var index = 0; index < tiers.length; index += 1) {
      if (nights >= tiers[index].minNights) return tiers[index].rate;
    }
    return 1;
  }

  function getDogDateCategory(value, projection) {
    var ranges = projection.calendar.specialDateRanges;
    for (var index = 0; index < ranges.length; index += 1) {
      if (ranges[index].enabled && ranges[index].category === 'high_season_core' && inRange(value, ranges[index])) return 'high_season_core';
    }
    for (var second = 0; second < ranges.length; second += 1) {
      if (ranges[second].enabled && ranges[second].category === 'school_vacation' && inRange(value, ranges[second])) return 'school_vacation';
    }
    if (isWeekend(value) || projection.calendar.holidays.indexOf(value) !== -1) return 'weekend_or_holiday';
    return 'normal';
  }

  function calculateDogBoarding(input, projection) {
    if (!validDogProjection(projection)) return unavailableDogService();
    input = input || {};
    var sizeConfig = projection.sizes[input.size];
    var basePrice = sizeConfig && sizeConfig.boardingPerNight;
    if (!Number.isFinite(basePrice)) return { available: true, error: 'unknown_size', nights: 0, boardingTotal: 0, nightlyBreakdown: [] };

    var nights = getNights(input.checkInDate, input.checkOutDate);
    if (!(nights >= 1)) return { available: true, error: 'day_use', nights: nights, boardingTotal: 0, nightlyBreakdown: [] };

    var rate = getDogLongStayRate(input.size, nights, projection);
    if (input.isMember) rate = Math.min(rate, projection.memberDiscountRate);
    var discountedBasePerNight = Math.round(basePrice * rate / projection.roundUnit) * projection.roundUnit;
    var breakdown = getStayDates(input.checkInDate, nights).map(function (date) {
      var category = getDogDateCategory(date, projection);
      var surcharge = projection.dateSurcharge[category][input.size];
      return {
        date: date,
        dateCategory: category,
        basePerNight: discountedBasePerNight,
        dateSurcharge: surcharge,
        totalForNight: discountedBasePerNight + surcharge,
      };
    });
    return {
      available: true,
      size: input.size,
      nights: nights,
      rate: rate,
      basePricePerNight: basePrice,
      discountedBasePerNight: discountedBasePerNight,
      nightlyBreakdown: breakdown,
      boardingTotal: breakdown.reduce(function (sum, night) { return sum + night.totalForNight; }, 0),
      needsReview: nights >= 30,
    };
  }

  function calculateDogBasicCare(input, projection) {
    if (!validDogProjection(projection)) return unavailableDogService();
    input = input || {};
    var sizeConfig = projection.sizes[input.size];
    var basePrice = sizeConfig && sizeConfig.basicCare;
    if (!Number.isFinite(basePrice)) return { available: true, error: 'unknown_size', subtotal: 0 };
    return {
      available: true,
      size: input.size,
      basePrice: basePrice,
      appliedDiscountRate: 1,
      subtotal: basePrice,
    };
  }

  var api = {
    roundYen100: roundYen100,
    getNights: getNights,
    getStayDates: getStayDates,
    getDateCategory: getDateCategory,
    getLongStayRate: getLongStayRate,
    getBoardingDiscountRate: getBoardingDiscountRate,
    calculateBoarding: calculateBoarding,
    isSmallPetType: isSmallPetType,
    getSmallPetPerNight: getSmallPetPerNight,
    calculateSmallPetBoarding: calculateSmallPetBoarding,
    getCatGroomingRate: getCatGroomingRate,
    calculateCatCare: calculateCatCare,
    calculateCatGrooming: calculateCatGrooming,
    calculateDogBoarding: calculateDogBoarding,
    calculateDogBasicCare: calculateDogBasicCare,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BoardingCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
