(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FuluckKittenCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS_RANK = { available: 0, reserved: 1, sold: 2 };
  var TAGS = { featured: true, campaign: true };
  var LABELS = {
    featured: { ja: 'おすすめ', en: 'Featured', zh: '推荐' },
    campaign: { ja: 'キャンペーン', en: 'Campaign', zh: '活动' },
  };
  var SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

  function normalizeStatus(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATUS_RANK, value) ? value : 'sold';
  }

  function normalizePromotionTag(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TAGS, value) ? value : '';
  }

  function normalizePromotionPriority(record) {
    var tag = normalizePromotionTag(record && record.promotionTag);
    var value = record && record.promotionPriority;
    return tag && Number.isInteger(value) && value >= 0 && value <= 999 ? value : 0;
  }

  function promotionLabel(tag, lang) {
    var normalized = normalizePromotionTag(tag);
    if (!normalized) return '';
    var selectedLang = lang === 'en' || lang === 'zh' ? lang : 'ja';
    return LABELS[normalized][selectedLang];
  }

  function isSafeIdentity(value) {
    return typeof value === 'string' && SAFE_ID_RE.test(value);
  }

  function identityOf(record, index) {
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      if (isSafeIdentity(record.breederId)) return record.breederId;
      if (isSafeIdentity(record.id)) return record.id;
    }
    return '__row_' + index;
  }

  function dedupeKittens(items) {
    var list = Array.isArray(items) ? items : [];
    var firstOrder = [];
    var latestByIdentity = Object.create(null);

    for (var index = 0; index < list.length; index += 1) {
      var identity = identityOf(list[index], index);
      if (!Object.prototype.hasOwnProperty.call(latestByIdentity, identity)) {
        firstOrder.push(identity);
      }
      latestByIdentity[identity] = list[index];
    }

    return firstOrder.map(function (identity) {
      return latestByIdentity[identity];
    });
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function birthdayRank(value) {
    if (typeof value !== 'string') return null;
    var match = /^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.exec(value);
    if (!match) return null;

    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = match[3] === undefined ? 0 : Number(match[3]);
    if (day) {
      var daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day > daysInMonth[month - 1]) return null;
    }
    return year * 10000 + month * 100 + day;
  }

  function priceRank(value) {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
    var numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }

  function compareMissingLast(left, right, descending) {
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;
    return descending ? right - left : left - right;
  }

  function compareBirthday(left, right) {
    return compareMissingLast(
      birthdayRank(left && left.birthday),
      birthdayRank(right && right.birthday),
      true,
    );
  }

  function secondaryOf(options) {
    var value = options && options.secondary;
    return value === 'newest' || value === 'price-asc' || value === 'price-desc' ? value : 'default';
  }

  function compareKittens(left, right, options) {
    var statusDifference = STATUS_RANK[normalizeStatus(left && left.status)] - STATUS_RANK[normalizeStatus(right && right.status)];
    if (statusDifference) return statusDifference;

    var leftPromoted = normalizePromotionTag(left && left.promotionTag) ? 1 : 0;
    var rightPromoted = normalizePromotionTag(right && right.promotionTag) ? 1 : 0;
    var promotionDifference = rightPromoted - leftPromoted;
    if (promotionDifference) return promotionDifference;

    var priorityDifference = normalizePromotionPriority(right) - normalizePromotionPriority(left);
    if (priorityDifference) return priorityDifference;

    var secondary = secondaryOf(options);
    if (secondary === 'price-asc' || secondary === 'price-desc') {
      var priceDifference = compareMissingLast(
        priceRank(left && left.price),
        priceRank(right && right.price),
        secondary === 'price-desc',
      );
      if (priceDifference) return priceDifference;
    }

    return compareBirthday(left, right);
  }

  function orderKittens(items, options) {
    return dedupeKittens(items)
      .map(function (item, index) {
        return { item: item, index: index };
      })
      .sort(function (left, right) {
        return compareKittens(left.item, right.item, options) || left.index - right.index;
      })
      .map(function (entry) {
        return entry.item;
      });
  }

  return {
    orderKittens: orderKittens,
    dedupeKittens: dedupeKittens,
    compareKittens: compareKittens,
    normalizeStatus: normalizeStatus,
    normalizePromotionTag: normalizePromotionTag,
    normalizePromotionPriority: normalizePromotionPriority,
    promotionLabel: promotionLabel,
    identityOf: identityOf,
  };
});
