const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_SOURCE = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');
const GENERATOR = path.join(ROOT, 'tools/generate-site.js');

function kittenCard(attributes) {
  return {
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    querySelector() { return { textContent: attributes['data-name'] || '' }; },
  };
}

function runAnalytics(cards) {
  const listeners = {};
  const session = new Map();
  const document = {
    readyState: 'complete',
    referrer: '',
    querySelectorAll(selector) { return selector === '.kitten-card' ? cards : []; },
    querySelector() { return null; },
    addEventListener(type, listener) { listeners[type] = listener; },
  };
  const window = {
    location: { pathname: '/kittens.html', search: '', host: 'example.test' },
    dataLayer: [],
  };
  const context = vm.createContext({
    window,
    document,
    sessionStorage: { getItem(key) { return session.get(key) || null; }, setItem(key, value) { session.set(key, value); } },
    URL,
    URLSearchParams,
    setTimeout,
  });
  vm.runInContext(ANALYTICS_SOURCE, context, { filename: 'analytics.js' });
  return { window, listeners };
}

function categoryEventsFor(breed) {
  const card = kittenCard({
    'data-breeder-id': 'stable-kitten-42',
    'data-breed': breed,
    'data-price': '220000',
    'data-name': 'Mochi',
  });
  const result = runAnalytics([card]);
  result.listeners.click({ target: { closest(selector) { return selector === '.kitten-card' ? card : null; } } });
  const list = result.window.dataLayer.find((event) => event.event === 'view_item_list');
  const click = result.window.dataLayer.find((event) => event.event === 'select_item');
  return { list: list.items[0], click: click.items[0] };
}

test('analytics emits the card formal breed for list and click events', () => {
  for (const breed of ['サイベリアン', 'ブリティッシュショートヘア', 'ブリティッシュロングヘア', 'サイベリアン×ブリティッシュ']) {
    const events = categoryEventsFor(breed);
    assert.equal(events.list.item_id, 'stable-kitten-42');
    assert.equal(events.click.item_id, 'stable-kitten-42');
    assert.equal(events.list.item_category, breed);
    assert.equal(events.click.item_category, breed);
  }
});

test('analytics records an explicit Unknown category when a card has no formal breed', () => {
  const events = categoryEventsFor('');
  assert.equal(events.list.item_category, 'Unknown');
  assert.equal(events.click.item_category, 'Unknown');
});

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function loadGenerator(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1, 'generator main boundary changed');
  source = source.slice(0, mainCall) + '\nmodule.exports = { generateKittens };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

function parseCards(html) {
  const cards = new Map();
  const decode = (value) => value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const match of html.matchAll(/<(?:a|div) class="kitten-card"([^>]*)>/g)) {
    const attrs = Object.create(null);
    for (const attribute of match[1].matchAll(/\b(data-[a-z-]+)="([^"]*)"/g)) {
      attrs[attribute[1]] = decode(attribute[2]);
    }
    if (attrs['data-breeder-id']) cards.set(attrs['data-breeder-id'], attrs);
  }
  return cards;
}

function fixtureKittens() {
  const base = {
    color: 'ブルー', gender: '♀', birthday: '2026-05-01', price: 220000,
    status: 'available', photos: ['https://images.example.test/kitten.jpg'],
  };
  return [
    { ...base, breederId: 'fixture-siberian', breed: 'サイベリアン' },
    { ...base, breederId: 'fixture-short', breed: 'ブリティッシュショートヘア' },
    { ...base, breederId: 'fixture-long', breed: 'ブリティッシュロングヘア' },
    { ...base, breederId: 'fixture-mix', breed: 'サイベリアン×ブリティッシュ' },
    { ...base, breederId: 'fixture-unknown', breed: '' },
    { ...base, breederId: 'fixture-escaped', breed: '特殊 "<>&' },
  ];
}

function dynamicCards(lang, kittens) {
  const grid = { innerHTML: '' };
  const tag = { textContent: '' };
  const title = { textContent: '', removeAttribute() {} };
  const section = { hidden: false, querySelector(selector) {
    if (selector === '.kittens-grid') return grid;
    if (selector === '.sec-tag') return tag;
    if (selector === '.sec-title') return title;
    return null;
  } };
  const document = {
    title: 'Kitten list',
    documentElement: { lang },
    getElementById() { return null; },
    querySelector(selector) { return selector === '.page-hero' ? {} : null; },
    querySelectorAll(selector) {
      if (selector === '.section' || selector === '.kittens-grid') return selector === '.section' ? [section] : [grid];
      return [];
    },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test', FuluckKittenCatalog: KittenCatalog,
    FULUCK_CATALOG_I18N: { breeds: { en: { 'サイベリアン': 'Siberian', 'ブリティッシュショートヘア': 'British Shorthair' }, zh: { 'サイベリアン': '西伯利亚猫', 'ブリティッシュショートヘア': '英国短毛猫' } } },
    location: { pathname: `/${lang === 'ja' ? '' : `${lang}/`}kittens.html` },
    addEventListener() {}, dispatchEvent() {}, rebindCards() {},
  };
  const context = vm.createContext({
    window, document, localStorage: { getItem() { return lang; } }, Event: function Event() {},
    URL, setTimeout, clearTimeout, console: { log() {}, warn() {} },
    fetch(url) {
      assert.equal(String(url), 'https://api.example.test/api/kittens');
      return Promise.resolve({ ok: true, json: async () => kittens });
    },
  });
  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  return new Promise((resolve) => setImmediate(resolve)).then(() => new Promise((resolve) => setImmediate(resolve))).then(() => ({ cards: parseCards(grid.innerHTML), html: grid.innerHTML }));
}

test('static and hydrated cards retain canonical raw breed across JA, EN, and ZH', async (t) => {
  const kittens = fixtureKittens();
  const expectedById = new Map(kittens.map((kitten) => [kitten.breederId, kitten.breederId === 'fixture-escaped' ? '特殊 ＂‹›&' : kitten.breed]));
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-analytics-category-'));
  for (const file of ['kittens.html', 'en/kittens.html', 'zh/kittens.html', 'i18n.js', 'catalog-i18n.js']) {
    copy(path.join(ROOT, file), path.join(siteDir, file));
  }
  const generator = loadGenerator(t, siteDir);

  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittens(kittens, lang);
    const staticHtml = fs.readFileSync(path.join(siteDir, lang === 'ja' ? 'kittens.html' : `${lang}/kittens.html`), 'utf8');
    const staticCards = parseCards(staticHtml);
    const hydrated = await dynamicCards(lang, kittens);
    for (const [id, rawBreed] of expectedById) {
      assert.equal(staticCards.get(id)['data-breed'], rawBreed, `${lang} static ${id}`);
      assert.equal(hydrated.cards.get(id)['data-breed'], rawBreed, `${lang} hydrated ${id}`);
    }
    if (lang === 'en') {
      assert.match(staticHtml, />British Shorthair</);
      assert.match(hydrated.html, />British Shorthair</);
    }
    if (lang === 'zh') {
      assert.match(staticHtml, />英国短毛猫</);
      assert.match(hydrated.html, />英国短毛猫</);
    }
  }
});
