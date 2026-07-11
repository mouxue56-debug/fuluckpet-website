/* faq-trust-copy.js — versioned local truth for owner-reviewed FAQ facts. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FaqTrustCopy = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = '20260711-trust-v1';
  var LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  var COPY = {
    faq_2: {
      question: {
        ja: '見学は予約制ですか？',
        en: 'Are visits by appointment only?',
        zh: '参观需要预约吗？'
      },
      answer: {
        ja: '見学は完全予約制です。ご希望の日時は予約ページまたはLINEからお知らせください。平日・土日いずれも対応可能です。見学時間は約30分〜1時間を目安にしてください。',
        en: 'Visits are by appointment only. Please share your preferred date and time through the booking page or LINE. Weekdays and weekends are available. Please allow about 30 minutes to 1 hour for your visit.',
        zh: '参观采用完全预约制。请通过预约页面或 LINE 告知希望的日期和时间。平日和周末均可，每次参观请预留约 30 分钟至 1 小时。'
      },
      links: {
        ja: [{ href: '/booking.html', label: '予約ページ' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/booking.html', label: 'Booking page' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/booking.html', label: '预约页面' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    },
    faq_4: {
      question: {
        ja: '子猫の価格帯を教えてください。',
        en: 'How can I check kitten prices?',
        zh: '如何查看猫咪价格？'
      },
      answer: {
        ja: '料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。',
        en: 'Prices vary by kitten. Please check the latest details on each kitten page or contact us on LINE.',
        zh: '价格因猫咪而异。请查看每只猫咪页面的最新信息，或通过 LINE 咨询。'
      },
      links: {
        ja: [{ href: '/kittens.html', label: '子猫一覧' }, { href: LINE_URL, label: 'LINEで相談' }],
        en: [{ href: '/kittens.html', label: 'View kittens' }, { href: LINE_URL, label: 'Contact us on LINE' }],
        zh: [{ href: '/kittens.html', label: '查看猫咪' }, { href: LINE_URL, label: '通过 LINE 咨询' }]
      }
    }
  };

  function normalizeLang(lang) {
    return lang === 'en' || lang === 'zh' ? lang : 'ja';
  }

  function applyTrustOverrides(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (!item || typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(COPY, item.id)) return item;
      var reviewed = COPY[item.id];
      var clone = {};
      Object.keys(item).forEach(function (key) { clone[key] = item[key]; });
      clone.question = Object.assign({}, reviewed.question);
      clone.answer = Object.assign({}, reviewed.answer);
      clone.trustCopyVersion = VERSION;
      return clone;
    });
  }

  function linksFor(id, lang) {
    if (!Object.prototype.hasOwnProperty.call(COPY, id)) return [];
    var reviewed = COPY[id];
    return reviewed.links[normalizeLang(lang)].map(function (link) {
      return { href: link.href, label: link.label };
    });
  }

  return {
    version: VERSION,
    copy: COPY,
    applyTrustOverrides: applyTrustOverrides,
    linksFor: linksFor
  };
}));
