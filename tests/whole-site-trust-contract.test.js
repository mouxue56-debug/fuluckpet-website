'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const jsonLd = (file) => Array.from(
  read(file).matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/g),
  (match) => JSON.parse(match[1]),
);
const visibleHtml = (file) => read(file).replace(
  /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/g,
  '',
);

const PRICE_COPY = {
  ja: '料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。',
  en: 'Prices vary by kitten. Please check the latest details on each kitten page or contact us on LINE.',
  zh: '价格因猫咪而异。请查看每只猫咪页面的最新信息，或通过 LINE 咨询。',
};

const VISIT_COPY = {
  ja: '見学は完全予約制です。ご希望の日時は予約ページまたはLINEからお知らせください。平日・土日いずれも対応可能です。見学時間は約30分〜1時間を目安にしてください。',
  en: 'Visits are by appointment only. Please share your preferred date and time through the booking page or LINE. Weekdays and weekends are available. Please allow about 30 minutes to 1 hour for your visit.',
  zh: '参观采用完全预约制。请通过预约页面或 LINE 告知希望的日期和时间。平日和周末均可，每次参观请预留约 30 分钟至 1 小时。',
};

const KITTEN_HERO_COPY = {
  ja: '新しいご家族を待っている子猫たちをご紹介します。料金は各子猫ページでご確認ください。',
  en: 'Meet the kittens waiting for their new families. Check each kitten page for current details.',
  zh: '为您介绍正在等待新家庭的猫咪们。最新信息请查看每只猫咪页面。',
};

const LEGAL_VISIT_COPY = {
  ja: 'LINEビデオ通話は事前相談・オンライン見学として利用できますが、契約前には登録事業所で子猫の現物確認と対面説明が必要です。',
  en: 'LINE video calls are available for preliminary consultations and online viewing, but before signing a contract you must visit the registered premises to see the kitten and receive an in-person explanation.',
  zh: 'LINE 视频通话可用于前期咨询和线上看猫，但签约前仍须到登记营业场所现场确认幼猫实物并接受面对面说明。',
};

const BREEDER_VISIT_COPY = {
  ja: '予約ページまたはLINEからご相談ください。LINEビデオ通話は事前相談・オンライン見学に利用できますが、契約前には登録事業所で子猫の現物確認と対面説明が必要です。現地見学は完全予約制です。',
  en: 'Start by contacting us through LINE or the booking form. A LINE video call is available for preliminary consultation and online viewing, but before any contract you must visit the registered premises to see the kitten and receive an in-person explanation.',
  zh: '请先通过 LINE 或预约表单咨询。LINE 视频通话仅用于前期咨询和线上看猫；签约前仍须到登记营业场所现场确认幼猫实物并接受面对面说明。',
};

const HOMEPAGE_AWARD_COPY = {
  ja: '2025年上半期 全国サイベリアンブリーダー お客様評価第1位',
  en: 'H1 2025: No. 1 nationwide for customer ratings among Siberian breeders',
  zh: '2025年上半年 全国西伯利亚猫繁育者 客户评价第1名',
};

test('public FAQ copy names real channels and contains no invented form or hardcoded range', () => {
  for (const file of ['faq.html', 'index.html', 'i18n.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /お問い合わせフォーム|contact form|联系表单/i, file);
    assert.doesNotMatch(source, /14万円|16万円|29万円|140,000|160,000|290,000/, file);
  }

  const faq = read('faq.html');
  const i18n = read('i18n.js');
  for (const text of Object.values(PRICE_COPY)) assert.ok(faq.includes(text) || i18n.includes(text), text);
  assert.ok(faq.includes(PRICE_COPY.ja), 'static FAQ and FAQ JSON-LD use the reviewed Japanese price copy');
  assert.match(faq, /href=["']\/booking\.html["']/);
  assert.match(faq, /href=["']https:\/\/page\.line\.me\/915hnnlk/);
});

test('visit guidance uses one reviewed duration and real booking channels on static fallbacks', () => {
  const faq = read('faq.html');
  const home = read('index.html');
  const i18n = read('i18n.js');
  const trust = read('faq-trust-copy.js');

  assert.ok(faq.includes(VISIT_COPY.ja), 'FAQ HTML and JSON-LD use the reviewed visit guidance');
  assert.ok(home.includes(VISIT_COPY.ja), 'homepage static fallback uses the reviewed visit guidance');
  for (const copy of Object.values(VISIT_COPY)) {
    assert.ok(i18n.includes(copy), `i18n includes: ${copy}`);
    assert.ok(trust.includes(copy), `trust override includes: ${copy}`);
  }
  const homeFaq = home.slice(home.indexOf('<!-- ========== FAQ ========== -->'), home.indexOf('<!-- ========== FAQ ========== -->') + 9000);
  assert.match(homeFaq, /href=["']\/booking\.html["']/);
  assert.match(homeFaq, /href=["']https:\/\/page\.line\.me\/915hnnlk/);
  assert.doesNotMatch(`${faq}\n${trust}`, /見学時間は約1〜2時間|allow about 1–2 hours|预留约 1〜2 小时/);
});

test('video calls stay preliminary and never replace the legally required on-site meeting', () => {
  const i18n = read('i18n.js');
  for (const copy of Object.values(LEGAL_VISIT_COPY)) assert.ok(i18n.includes(copy), copy);

  const sources = [
    'i18n.js',
    'index.html',
    'gallery.html',
    'reviews.html',
    'siberian-allergy.html',
    'waitlist.html',
    'booking.html',
    'faq.html',
    'siberian-breeder-osaka.html',
    'en/siberian-breeder-osaka.html',
    'zh/siberian-breeder-osaka.html',
    'blog/siberian-osaka-guide.html',
    'admin/litter-publisher.html',
    'tools/build_pages.py',
    'tools/seed-kb.js',
    'llms-full.txt',
  ];
  const falseEquivalence = /(?:来場またはLINEビデオ通話|on-site or LINE video call|到场或LINE视频通话)[^。\n.]{0,120}(?:説明|現物確認|required before purchase|说明|实物确认)/i;
  const falseVisitChoice = /見学（対面(?:・|または)(?:LINE)?ビデオ通話|対面・LINEビデオ通話での見学|visit(?:s)?(?:\s*\(|,\s*|\s+)in person or (?:via )?(?:LINE )?video call|看猫（当面(?:・|或)(?:LINE)?视频通话|当面・LINE视频通话的看猫/i;
  const staleVideoAdvice = /可能であれば実際に訪問することをおすすめ|Some breeders also offer video call options for those who live far away|部分猫舍也提供视频通话服务，方便远距离客户/i;
  const substituteVisitCopy = /対面見学のほか、LINEビデオ通話での見学|対面・LINEビデオ通話での見学/i;
  for (const file of sources) {
    const source = read(file);
    assert.doesNotMatch(source, falseEquivalence, file);
    assert.doesNotMatch(source, falseVisitChoice, file);
    assert.doesNotMatch(source, staleVideoAdvice, file);
    assert.doesNotMatch(source, substituteVisitCopy, file);
  }

  const homeFaq = jsonLd('index.html').find((document) => document['@type'] === 'FAQPage');
  const visitAnswer = homeFaq.mainEntity.find((entry) => entry.name === '見学は予約制ですか？');
  assert.equal(visitAnswer.acceptedAnswer.text, LEGAL_VISIT_COPY.ja);
  for (const file of ['gallery.html', 'reviews.html', 'siberian-allergy.html', 'waitlist.html']) {
    assert.ok(visibleHtml(file).includes(LEGAL_VISIT_COPY.ja), `${file}: reviewed legal visit copy`);
  }
});

for (const [file, parallelCopy] of [
  ['index.html', /対面見学\s*・\s*LINEビデオ通話対応/],
  ['siberian-allergy.html', /相性チェック<\/b>のお時間を長めに確保（対面・ビデオ通話）/],
  ['zh/siberian-breeder-osaka.html', /当面或\s*LINE\s*视频通话/],
]) {
  test(`${file} never presents LINE video alongside the legally required on-site visit`, () => {
    assert.doesNotMatch(read(file), parallelCopy, file);
  });
}

test('parsed breeder FAQ JSON-LD keeps the on-site contract duty in JA EN ZH', () => {
  for (const [file, lang] of [
    ['siberian-breeder-osaka.html', 'ja'],
    ['en/siberian-breeder-osaka.html', 'en'],
    ['zh/siberian-breeder-osaka.html', 'zh'],
  ]) {
    const faq = jsonLd(file).find((document) => document['@type'] === 'FAQPage');
    const visitAnswer = faq.mainEntity.find((entry) => /迎える|welcome|迎接/i.test(entry.name));
    assert.ok(visitAnswer, `${file}: visit FAQ remains present`);
    assert.equal(visitAnswer.acceptedAnswer.text, BREEDER_VISIT_COPY[lang], `${file}: parsed visit answer`);
  }
});

test('future Osaka landing generation keeps LINE video preliminary to the on-site duty', () => {
  const source = read('tools/build_pages.py');
  const landingFaq = source.slice(source.indexOf('LANDING_FAQ'), source.indexOf('LANDING_BODY'));
  assert.ok(landingFaq.includes(LEGAL_VISIT_COPY.ja));
});

test('Osaka breeder pages use per-kitten current pricing in visible copy and parsed JSON-LD', () => {
  const pages = [
    ['siberian-breeder-osaka.html', PRICE_COPY.ja, /14万円|140,000/],
    ['en/siberian-breeder-osaka.html', PRICE_COPY.en, /¥?140,000/],
    ['zh/siberian-breeder-osaka.html', PRICE_COPY.zh, /14万日元|¥?140,000/],
  ];

  for (const [file, expected, stalePrice] of pages) {
    const visible = visibleHtml(file);
    assert.ok(visible.includes(expected), `${file}: visible copy points to each kitten page`);
    assert.doesNotMatch(visible, stalePrice, `${file}: visible copy has no global starting price`);

    const documents = jsonLd(file);
    const faq = documents.find((document) => document['@type'] === 'FAQPage');
    const priceAnswer = faq.mainEntity.find((entry) => /価格|price|价格/i.test(entry.name));
    assert.equal(priceAnswer.acceptedAnswer.text, expected, `${file}: FAQ JSON-LD`);
    const localBusiness = documents.find((document) => document['@type'] === 'LocalBusiness');
    assert.ok(localBusiness, `${file}: LocalBusiness JSON-LD remains present`);
    assert.equal(localBusiness.priceRange, undefined, `${file}: LocalBusiness has no stale global priceRange`);
  }

  assert.doesNotMatch(
    read('tools/build_pages.py'),
    /概ね14万円|Generally\s+¥?140,000|大致为14万日元/i,
    'future generation source cannot restore the stale global starting price',
  );
});

test('homepage satisfaction claim is bounded to the H1 2025 nationwide Siberian customer-rating award', () => {
  const home = read('index.html');
  const description = home.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/)[1];
  assert.ok(description.includes(HOMEPAGE_AWARD_COPY.ja), 'homepage metadata carries the bounded award claim');
  assert.ok(home.includes(`data-i18n="hero.no1">${HOMEPAGE_AWARD_COPY.ja}</span>`), 'visible hero fallback carries the bounded award claim');

  const i18n = read('i18n.js');
  for (const copy of Object.values(HOMEPAGE_AWARD_COPY)) assert.ok(i18n.includes(copy), copy);
  assert.doesNotMatch(`${home}\n${i18n}`, /全国満足度\s*No\.1|No\.1 Customer Satisfaction Nationwide|全国客户满意度\s*No\.1/);
});

test('homepage mobile ContactPoint is not falsely marked as toll-free', () => {
  const localBusiness = jsonLd('index.html').find((document) => document['@type'] === 'LocalBusiness');
  assert.equal(localBusiness.contactPoint.telephone, '+81-80-5416-7843');
  assert.equal(localBusiness.contactPoint.contactOption, undefined);
});

test('catalogue, AI and future-generation surfaces never publish a global kitten price band', () => {
  const listPages = [
    ['kittens.html', KITTEN_HERO_COPY.ja],
    ['en/kittens.html', KITTEN_HERO_COPY.en],
    ['zh/kittens.html', KITTEN_HERO_COPY.zh],
  ];
  for (const [file, copy] of listPages) assert.ok(read(file).includes(copy), `${file}: reviewed hero copy`);

  const sources = [
    ...listPages.map(([file]) => file),
    'tools/generate-site.js',
    'assets/chat/widget.js',
    'admin/js/admin-faq.js',
    'tools/seed-kb.js',
    'tools/build_pages.py',
    'tools/gen-blog-wave-c.mjs',
    'llms.txt',
    'llms-full.txt',
  ];
  const bannedRange = /(?:140,000|160,000)\s*(?:〜|～|〜|–|\-|to)\s*(?:¥)?290,000|16万円\s*(?:〜|～|〜|–|\-)〜?\s*29万円/i;
  for (const file of sources) assert.doesNotMatch(read(file), bannedRange, file);

  const machineCopy = `${read('llms.txt')}\n${read('llms-full.txt')}`;
  assert.doesNotMatch(machineCopy, /お問い合わせフォーム|見学時間は約1〜2時間/);
  assert.ok(read('assets/chat/widget.js').includes(PRICE_COPY.ja), 'offline chat price answer uses the reviewed truth');

  const homeJsonLd = jsonLd('index.html');
  const localBusiness = homeJsonLd.find((document) => document['@type'] === 'LocalBusiness');
  assert.ok(localBusiness, 'homepage keeps its LocalBusiness identity');
  assert.equal(
    localBusiness.hasOfferCatalog,
    undefined,
    'homepage must not publish a synthetic generic kitten price or AggregateOffer band',
  );
});

test('runtime navigation exposes distinct truthful destinations and a dedicated service group', () => {
  const nav = require('../nav.js');
  const groups = nav.navGroups();
  const items = groups.flatMap((group) => group.items);
  assert.equal(items.find((item) => item.key === 'nav.about').href, '/#about');
  assert.equal(items.find((item) => item.key === 'nav.aboutPage').href, '/about.html');
  assert.equal(items.find((item) => item.key === 'nav.diary').featured, undefined);
  assert.deepEqual(groups.map((group) => group.id), ['pets', 'services', 'adoption', 'breed', 'cattery']);
  assert.deepEqual(groups.find((group) => group.id === 'services').items.map((item) => item.key), ['nav.boarding', 'nav.grooming', 'nav.shop']);
  assert.equal(items.find((item) => item.key === 'nav.boarding').href, '/boarding/');
  assert.equal(items.find((item) => item.key === 'nav.grooming').href, '/grooming/');
  assert.equal(items.find((item) => item.key === 'nav.boarding').jaOnly, true);
  assert.equal(items.find((item) => item.key === 'nav.grooming').jaOnly, true);
  assert.equal(items.find((item) => item.key === 'nav.boarding').featured, undefined);
  assert.equal(items.find((item) => item.key === 'nav.grooming').featured, undefined);
  assert.equal(items.find((item) => item.key === 'nav.shop').href, 'https://fukurakupet.stores.jp/');
  assert.equal(items.find((item) => item.key === 'nav.shop').external, true);
  const navCss = read('nav.css');
  assert.match(navCss, /body\.nav-enhanced \.header-inner\s*\{[^}]*max-width:\s*1380px/s);
  assert.match(navCss, /@media \(max-width:\s*1360px\)[\s\S]*body\.nav-enhanced \.nav\s*\{\s*display:\s*none/);
});

test('FAQ trust override ignores prototype-named or unknown API ids', () => {
  const trust = require('../faq-trust-copy.js');
  const source = { id: '__proto__', question: { ja: '原文' }, answer: { ja: '回答' } };
  assert.deepEqual(trust.applyTrustOverrides([source]), [source]);
  assert.deepEqual(trust.linksFor('__proto__', 'ja'), []);
  assert.deepEqual(trust.linksFor('unknown', 'ja'), []);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.id = '';
    this._text = '';
    this._listeners = Object.create(null);
    const self = this;
    this.classList = {
      contains(name) { return self.className.split(/\s+/).includes(name); },
      add(...names) { self.className = [...new Set(self.className.split(/\s+/).filter(Boolean).concat(names))].join(' '); },
      remove(...names) { self.className = self.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
    };
  }
  set textContent(value) { this._text = String(value == null ? '' : value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      child.children.slice().forEach((nested) => this.appendChild(nested));
      return child;
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, listener) { this._listeners[type] = listener; }
  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const matches = [];
    (function visit(node) {
      node.children.forEach((child) => {
        if (className && child.classList.contains(className)) matches.push(child);
        visit(child);
      });
    }(this));
    return matches;
  }
}

function runLoader(file, surface) {
  const home = new FakeElement('div');
  const list = new FakeElement('div');
  const filters = new FakeElement('div');
  const events = {};
  const storage = new Map([['fuluckpet-lang', 'ja']]);
  const document = {
    querySelector(selector) { return surface === 'home' && selector === '.faq-list' ? home : null; },
    getElementById(id) {
      if (surface !== 'page') return null;
      return id === 'faqList' ? list : id === 'faqFilters' ? filters : null;
    },
    createElement(tag) { return new FakeElement(tag); },
    createDocumentFragment() { return new FakeElement('#fragment'); },
    createTextNode(value) { const node = new FakeElement('#text'); node.textContent = value; return node; },
  };
  const window = { addEventListener(type, listener) { events[type] = listener; } };
  const context = vm.createContext({
    document,
    window,
    localStorage: { getItem(key) { return storage.get(key) || null; } },
    fetch() {
      return Promise.resolve({ json() {
        return Promise.resolve([
          { id: 'faq_2', category: 'general', question: { ja: 'OLD VISIT' }, answer: { ja: 'お問い合わせフォーム' } },
          { id: 'faq_4', category: 'purchase', question: { ja: 'OLD PRICE' }, answer: { ja: '16万円〜29万円' } },
        ]);
      } });
    },
  });
  vm.runInContext(read('faq-trust-copy.js'), context, { filename: 'faq-trust-copy.js' });
  vm.runInContext(read(file), context, { filename: file });
  return { root: surface === 'home' ? home : list, events, storage };
}

for (const [file, surface] of [['faq-loader.js', 'home'], ['faq-page-loader.js', 'page']]) {
  test(`${file} overrides stale successful API trust facts in JA EN ZH`, async () => {
    const result = runLoader(file, surface);
    await new Promise(setImmediate);
    for (const lang of ['ja', 'en', 'zh']) {
      result.storage.set('fuluckpet-lang', lang);
      if (lang !== 'ja') result.events.langChanged();
      assert.match(result.root.textContent, new RegExp(PRICE_COPY[lang].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(result.root.textContent, new RegExp(VISIT_COPY[lang].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(result.root.textContent, /お問い合わせフォーム|16万円|29万円|OLD (?:VISIT|PRICE)/i);
    }
  });
}
