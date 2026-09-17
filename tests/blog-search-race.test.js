'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const index = [
  { t: 'Synthetic kitten article', d: 'Kitten fixture', c: 'Test', u: '/blog/synthetic-kitten.html' },
  { t: 'Synthetic health article', d: 'Health fixture', c: 'Test', u: '/blog/synthetic-health.html' },
];

const listingI18n = {
  categories: {
    breed: { en: 'Breeds', zh: '品种知识' },
    lifestyle: { en: 'Cat Life', zh: '猫咪生活' },
    nutrition: { en: 'Nutrition', zh: '饮食营养' },
  },
  articles: {
    'siberian-kitten-feeding-guide': {
      en: { title: 'A Feeding Guide for Siberian Kittens — Age, Portions, and Food Choices', excerpt: 'Portions and food choices for a newly welcomed kitten.' },
      zh: { title: '西伯利亚猫幼猫喂养指南 — 月龄、食量与推荐猫粮', excerpt: '刚迎接西伯利亚猫幼猫的喂养说明。' },
    },
    'kitten-feeding-guide': {
      en: { title: 'Kitten Feeding Guide: Recommended Food by Age', excerpt: 'Age-based feeding notes.' },
      zh: { title: '幼猫喂养指南：分月龄推荐口粮', excerpt: '分月龄口粮选择。' },
    },
    'siberian-cost-breakdown': {
      en: { title: 'Complete Cost Guide for Owning a Siberian Cat', excerpt: 'Initial setup and monthly expenses.' },
      zh: { title: '养一只西伯利亚猫要花多少钱？初期费用+每月支出全解析', excerpt: '初期准备费用和每月固定开销。' },
    },
    'cat-cost-monthly': {
      en: { title: 'How Much Does It Cost to Own a Cat?', excerpt: 'Monthly and annual expenses.' },
      zh: { title: '养猫费用详解：每月花多少钱？年度费用明细', excerpt: '每月每年的维护费用。' },
    },
    'cat-first-year-cost': {
      en: { title: 'Complete Guide to First-Year Cat Ownership Costs', excerpt: 'Purchase price to initial expenses.' },
      zh: { title: '养猫第一年费用总结：从购买费到初始费用完全指南', excerpt: '第一年费用项目。' },
    },
    'kitten-price-factors': {
      en: { title: 'How Kitten Prices Are Determined', excerpt: 'Pedigree and coat color.' },
      zh: { title: '小猫价格的决定因素 | 血统、毛色、性别导致价格差异的原因', excerpt: '价格差异的原因。' },
    },
    'siberian-price-guide': {
      en: { title: 'Siberian Cat Price Guide', excerpt: 'What affects cost.' },
      zh: { title: '西伯利亚猫价格指南｜价格影响因素与最新价格查询方法', excerpt: '查看最新价格。' },
    },
    'cat-insurance-guide': {
      en: { title: 'Pet Insurance Guide: Preparing for Your Cat\'s Medical Expenses', excerpt: 'Insurance comparison.' },
      zh: { title: '宠物保险选择指南：为猫咪的医疗费做好准备', excerpt: '医疗费与保险。' },
    },
  },
};

function harness(search = '', options = {}) {
  const requests = [];
  const windowListeners = new Map();
  function element() {
    const listeners = new Map();
    return {
      value: '', hidden: true, innerHTML: '', style: { display: '' },
      childNodes: [],
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
      querySelector() { return null; },
      addEventListener(type, handler) { listeners.set(type, handler); },
      dispatch(type) { listeners.get(type)?.({ preventDefault() {} }); },
    };
  }
  const form = element();
  const input = element();
  const out = element();
  const sections = [element(), element()];
  const initialUrl = new URL('https://example.test/blog.html' + search);
  const location = { href: initialUrl.href, search: initialUrl.search };
  const documentElement = {
    lang: options.htmlLang || 'ja',
    getAttribute(name) { return name === 'lang' ? this.lang : null; },
  };
  const storage = options.storage === 'throw'
    ? { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } }
    : {
      getItem(key) { return key === 'fuluckpet-lang' ? (options.storedLang || null) : null; },
      setItem() {
        if (options.setThrows) throw new Error('storage write blocked');
      },
    };
  const window = {
    location,
    history: { replaceState(_state, _title, href) {
      const next = new URL(href, location.href);
      location.href = next.href;
      location.search = next.search;
    } },
    localStorage: storage,
    _blogListingI18n: options.listing || null,
    addEventListener(type, handler) { windowListeners.set(type, handler); },
  };
  const html = fs.readFileSync(path.join(__dirname, '..', 'blog.html'), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(source => source.includes("getElementById('blogSearchResults')"));
  assert.ok(script, 'real blog search script is present');
  vm.runInNewContext(script, {
    window, URL, URLSearchParams, localStorage: storage,
    document: {
      documentElement,
      readyState: 'complete',
      querySelector() { return form; },
      getElementById(id) { return id === 'blogSearch' ? input : out; },
      querySelectorAll() { return sections; },
      addEventListener() {},
    },
    fetch(url) {
      assert.equal(url, '/blog-search-index.json');
      return new Promise((resolve, reject) => requests.push({
        resolve: (data = options.index || index, ok = true) => resolve({ ok, json: () => Promise.resolve(data) }), reject,
      }));
    },
  });
  return {
    input, out, sections, window, documentElement,
    search(value) { input.value = value; input.dispatch('input'); },
    resolve(i, data = options.index || index, ok = true) { assert.ok(requests[i], 'pending search index request'); requests[i].resolve(data, ok); },
    submit() { form.dispatch('submit'); },
    requestCount() { return requests.length; },
    reject(i) { assert.ok(requests[i], 'pending search index request'); requests[i].reject(new Error('synthetic network failure')); },
    changeLang(lang) {
      documentElement.lang = lang;
      windowListeners.get('langChanged')?.({ detail: { lang } });
    },
  };
}

async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('clearing while the search index loads keeps results hidden and article sections visible', async () => {
  const h = harness();
  h.search('kitten');
  h.search('');
  h.resolve(0);
  await flush();
  assert.equal(h.out.hidden, true);
  assert.equal(h.out.innerHTML, '');
  assert.ok(h.sections.every(section => section.style.display === ''));
  assert.equal(new URL(h.window.location.href).searchParams.has('q'), false);
});

test('an older index response cannot replace the results of a newer search', async () => {
  const h = harness();
  h.search('kitten');
  h.search('health');
  assert.equal(h.requestCount(), 1, 'in-flight searches share one index request');
  h.resolve(0);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.doesNotMatch(h.out.innerHTML, /synthetic-kitten\.html/);
  assert.equal(new URL(h.window.location.href).searchParams.get('q'), 'health');
});

test('the active search still renders its matches and clearing restores the article sections', async () => {
  const h = harness();
  h.search('kitten');
  h.resolve(0);
  await flush();
  assert.equal(h.out.hidden, false);
  assert.match(h.out.innerHTML, /synthetic-kitten\.html/);
  assert.ok(h.sections.every(section => section.style.display === 'none'));
  h.search('   ');
  assert.equal(h.out.hidden, true);
  assert.equal(h.out.innerHTML, '');
  assert.ok(h.sections.every(section => section.style.display === ''));
});

test('a shared search URL renders on initial load and preserves unrelated URL context', async () => {
  const h = harness('?q=health&lang=en#articles');
  h.resolve(0);
  await flush();
  assert.equal(h.input.value, 'health');
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.equal(new URL(h.window.location.href).searchParams.get('lang'), 'en');
  assert.equal(new URL(h.window.location.href).hash, '#articles');
});

test('changing the query while a load is pending then failing retries on the next search', async () => {
  const h = harness();
  h.search('kitten');
  h.search('health');
  assert.equal(h.requestCount(), 1, 'in-flight searches share one index request');
  h.reject(0);
  await flush();
  assert.match(h.out.innerHTML, /data-blog-search-status="error"/);
  assert.doesNotMatch(h.out.innerHTML, /synthetic-kitten|synthetic-health/);
  assert.doesNotMatch(h.out.innerHTML, /0 件|0 result/);
  h.search('health');
  assert.equal(h.requestCount(), 2, 'a later search retries after the shared request failed');
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.doesNotMatch(h.out.innerHTML, /synthetic-kitten\.html/);
});

test('failing after the query is cleared keeps the listing visible and retries later', async () => {
  const h = harness();
  h.search('kitten');
  h.search('');
  assert.equal(h.requestCount(), 1);
  h.reject(0);
  await flush();
  assert.equal(h.out.hidden, true);
  assert.equal(h.out.innerHTML, '');
  assert.ok(h.sections.every(section => section.style.display === ''));
  h.search('health');
  assert.equal(h.requestCount(), 2, 'clearing does not cache a failed index load');
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
});

test('a failed search retries only when the user starts another search', async () => {
  const h = harness();
  h.search('kitten');
  h.reject(0);
  await flush();
  assert.equal(h.requestCount(), 1, 'no automatic retry');
  assert.match(h.out.innerHTML, /data-blog-search-status="error"/);
  assert.doesNotMatch(h.out.innerHTML, /0 件|0 result/);
  assert.doesNotMatch(h.out.innerHTML, /class="blog-card"/);
  h.search('health');
  assert.equal(h.requestCount(), 2, 'a new search retries the unavailable index');
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
});

test('resubmitting the same search recovers after a transient failure', async () => {
  const h = harness();
  h.search('kitten');
  h.reject(0);
  await flush();
  h.submit();
  assert.equal(h.requestCount(), 2);
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-kitten\.html/);
});

test('a successfully loaded empty index stays cached and shows no matches', async () => {
  const h = harness();
  h.search('kitten');
  h.resolve(0, []);
  await flush();
  h.search('health');
  assert.equal(h.requestCount(), 1, 'a valid empty array is a successful cache');
  assert.equal(h.out.hidden, false);
  assert.match(h.out.innerHTML, /data-blog-search-status="empty"/);
  assert.doesNotMatch(h.out.innerHTML, /class="blog-card"/);
});

test('an HTTP failure with an empty JSON body does not become a successful empty cache', async () => {
  const h = harness();
  h.search('kitten');
  h.resolve(0, [], false);
  await flush();
  assert.match(h.out.innerHTML, /data-blog-search-status="error"/);
  assert.doesNotMatch(h.out.innerHTML, /data-blog-search-status="empty"/);
  h.search('health');
  assert.equal(h.requestCount(), 2);
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
});

test('searching in English matches listing translations and keeps UTM plus hash', async () => {
  const realIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blog-search-index.json'), 'utf8'));
  const h = harness('?utm_source=newsletter&lang=en#keep', { listing: listingI18n, index: realIndex, htmlLang: 'en' });
  h.search('feeding');
  h.resolve(0, realIndex);
  await flush();
  assert.match(h.out.innerHTML, /siberian-kitten-feeding-guide/);
  assert.match(h.out.innerHTML, /kitten-feeding-guide/);
  assert.match(h.out.innerHTML, /\/en\/blog\/siberian-kitten-feeding-guide\.html/);
  assert.match(h.out.innerHTML, /\/blog\/kitten-feeding-guide\.html\?lang=en/);
  assert.equal(new URL(h.window.location.href).searchParams.get('utm_source'), 'newsletter');
  assert.equal(new URL(h.window.location.href).searchParams.get('lang'), 'en');
  assert.equal(new URL(h.window.location.href).hash, '#keep');
  assert.equal([...h.out.innerHTML.matchAll(/class="blog-card"/g)].length, 2);
  assert.match(h.out.innerHTML, /blog-card-cat">Nutrition</);
  assert.doesNotMatch(h.out.innerHTML, /食事・栄養/);
});

test('searching 费用 in Chinese matches existing listing translations', async () => {
  const realIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blog-search-index.json'), 'utf8'));
  const realListing = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'blog-listing-i18n.js'), 'utf8'), { window: realListing });
  const h = harness('?lang=zh', { listing: realListing._blogListingI18n, index: realIndex, htmlLang: 'zh' });
  h.search('费用');
  h.resolve(0, realIndex);
  await flush();
  assert.equal([...h.out.innerHTML.matchAll(/class="blog-card"/g)].length, 6);
  assert.match(h.out.innerHTML, /siberian-cost-breakdown\.html\?lang=zh/);
});

test('langChanged redraws the current query using translations without a second fetch', async () => {
  const realIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blog-search-index.json'), 'utf8'));
  const h = harness('', { listing: listingI18n, index: realIndex, storage: 'throw' });
  h.search('feeding');
  h.resolve(0, realIndex);
  await flush();
  assert.match(h.out.innerHTML, /data-blog-search-status="empty"/);
  h.changeLang('en');
  await flush();
  assert.equal(h.requestCount(), 1);
  assert.match(h.out.innerHTML, /A Feeding Guide for Siberian Kittens/);
  assert.match(h.out.innerHTML, /\/en\/blog\/siberian-kitten-feeding-guide\.html/);
});

test('stale storage EN cannot override a JA langChanged when searching again', async () => {
  const realIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blog-search-index.json'), 'utf8'));
  const h = harness('', {
    listing: listingI18n,
    index: realIndex,
    storedLang: 'en',
    setThrows: true,
  });
  h.search('feeding');
  h.resolve(0, realIndex);
  await flush();
  assert.match(h.out.innerHTML, /A Feeding Guide for Siberian Kittens/);
  h.changeLang('ja');
  await flush();
  assert.equal(h.requestCount(), 1);
  assert.match(h.out.innerHTML, /data-blog-search-status="empty"/);
  assert.doesNotMatch(h.out.innerHTML, /A Feeding Guide for Siberian Kittens/);
  h.search('feeding');
  assert.equal(h.requestCount(), 1);
  assert.match(h.out.innerHTML, /data-blog-search-status="empty"/);
  assert.doesNotMatch(h.out.innerHTML, /\/en\/blog\/siberian-kitten-feeding-guide/);
});

test('every real index category translates in EN/ZH and stays Japanese in JA', async () => {
  const realIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'blog-search-index.json'), 'utf8'));
  const realListing = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'blog-listing-i18n.js'), 'utf8'), { window: realListing });
  const expectedCats = [
    'アレルギー', 'シニア猫', 'ブリーダー', 'ブリーダー選び', '健康・医療', '健康管理',
    '品種紹介', '子猫', '子猫育て', '日常ケア', '猫ライフ', '猫種知識',
    '行動・しつけ', '行動訓練', '記事', '食事・栄養', '飲食栄養',
  ].sort();
  assert.deepEqual([...new Set(realIndex.map(entry => entry.c))].sort(), expectedCats);
  const labels = {
    'アレルギー': { en: 'Allergies', zh: '过敏与低敏' },
    'シニア猫': { en: 'Senior Cats', zh: '老年猫护理' },
    'ブリーダー': { en: 'Choosing a Breeder', zh: '繁殖者选择' },
    'ブリーダー選び': { en: 'Choosing a Breeder', zh: '繁殖者选择' },
    '健康・医療': { en: 'Health', zh: '健康管理' },
    '健康管理': { en: 'Health', zh: '健康管理' },
    '品種紹介': { en: 'Breeds', zh: '品种知识' },
    '子猫': { en: 'Kitten Care', zh: '幼猫养育' },
    '子猫育て': { en: 'Kitten Care', zh: '幼猫养育' },
    '日常ケア': { en: 'Grooming', zh: '日常护理' },
    '猫ライフ': { en: 'Cat Life', zh: '猫咪生活' },
    '猫種知識': { en: 'Breeds', zh: '品种知识' },
    '行動・しつけ': { en: 'Behavior & Training', zh: '行为训练' },
    '行動訓練': { en: 'Behavior & Training', zh: '行为训练' },
    '記事': { en: 'Article', zh: '文章' },
    '食事・栄養': { en: 'Nutrition', zh: '饮食营养' },
    '飲食栄養': { en: 'Nutrition', zh: '饮食营养' },
  };
  const samples = expectedCats.map(cat => realIndex.find(entry => entry.c === cat));
  const h = harness('', { listing: realListing._blogListingI18n, index: realIndex });
  h.search(samples[0].t);
  h.resolve(0, realIndex);
  await flush();

  function cardCat(html, slug) {
    const match = html.match(new RegExp('href="[^"]*' + slug + '\\.html[^"]*" class="blog-card"><span class="blog-card-cat">([^<]*)</span>'));
    return match && match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  function slugOf(entry) {
    return entry.u.match(/\/blog\/([a-z0-9-]+)\.html$/)[1];
  }

  async function assertLang(lang) {
    h.changeLang(lang);
    for (const entry of samples) {
      h.search(entry.t);
      await flush();
      const shown = cardCat(h.out.innerHTML, slugOf(entry));
      const expected = lang === 'ja' ? entry.c : labels[entry.c][lang];
      assert.equal(shown, expected, lang + ' ' + entry.c + ' via ' + slugOf(entry));
    }
  }

  await assertLang('ja');
  await assertLang('en');
  await assertLang('zh');
  assert.equal(h.requestCount(), 1);
});

test('malicious titles are escaped and off-site hrefs never become clickable results', async () => {
  const poisoned = [
    { t: '<img src=x onerror=alert(1)>', d: 'kitten <script>alert(1)</script>', c: 'Test', u: '/blog/synthetic-kitten.html' },
    { t: 'javascript kitten', d: 'kitten', c: 'Test', u: 'javascript:alert(1)' },
    { t: 'Offsite kitten', d: 'kitten', c: 'Test', u: 'https://evil.example/blog/synthetic-kitten.html' },
    { t: 'Protocol-relative kitten', d: 'kitten', c: 'Test', u: '//evil.example/blog/synthetic-kitten.html' },
  ];
  const h = harness('', { index: poisoned });
  h.search('kitten');
  h.resolve(0, poisoned);
  await flush();
  assert.match(h.out.innerHTML, /href="\/blog\/synthetic-kitten\.html"/);
  assert.equal([...h.out.innerHTML.matchAll(/class="blog-card"/g)].length, 1);
  assert.doesNotMatch(h.out.innerHTML, /javascript:/);
  assert.doesNotMatch(h.out.innerHTML, /evil\.example/);
  assert.doesNotMatch(h.out.innerHTML, /<img src=x/);
  assert.doesNotMatch(h.out.innerHTML, /<script>/);
  assert.match(h.out.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h.out.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
