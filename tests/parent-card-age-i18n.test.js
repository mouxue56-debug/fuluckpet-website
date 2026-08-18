'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.join(__dirname, '..');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function response(data, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || (options.ok === false ? 503 : 200),
    json: async () => data,
  };
}

function runCardLoader(options = {}) {
  const initial = '<article class="static-fallback">STATIC SEO FALLBACK</article>';
  const kittenGrid = { innerHTML: initial };
  const parentGrid = { innerHTML: initial };
  const reviewGrid = { innerHTML: initial };
  const visibleCount = { textContent: 'static' };

  const document = {
    title: 'Home',
    documentElement: { lang: options.lang || 'ja' },
    head: { appendChild() {} },
    getElementById(id) {
      if (id === 'kittensGrid') return kittenGrid;
      if (id === 'visibleCount') return visibleCount;
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return null;
      if (selector === '#parents .parents-grid') return parentGrid;
      if (selector === '#reviews .reviews-grid') return reviewGrid;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        setAttribute(name, value) { this[name] = String(value); },
        textContent: '',
      };
    },
  };

  const payloads = options.payloads || {};
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FuluckKittenCatalog: KittenCatalog,
    location: { pathname: '/index.html' },
    addEventListener() {},
    dispatchEvent() {},
    rebindCards() {},
  };

  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch(url) {
      const endpoint = String(url).split('/').pop();
      return Promise.resolve(payloads[endpoint] || response([]));
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
    setTimeout,
    clearTimeout,
  });

  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  return { parentGrid };
}

function parent(name, age) {
  return {
    name,
    breed: 'サイベリアン',
    gender: '♂',
    role: 'パパ猫',
    age,
    color: 'ホワイト',
    tested: true,
    group: 'c995680',
  };
}

async function renderVisibleParentAges(lang, ages) {
  const result = runCardLoader({
    lang,
    payloads: {
      kittens: response([]),
      parents: response(ages.map((age, index) => parent('parent-' + index, age))),
      reviews: response([]),
    },
  });
  await flushAsyncWork();
  return Array.from(result.parentGrid.innerHTML.matchAll(
    /<p style="font-size:12px;color:var\(--text-note\);">([^<]*)<\/p>/g
  ), (match) => match[1]);
}

test('dynamic parent cards localize visible age by page language', async () => {
  const cases = [
    ['ja', '3歳6ヶ月'],
    ['zh', '3岁6个月'],
    ['en', '3 years 6 months'],
  ];

  for (const [lang, expected] of cases) {
    assert.deepEqual(await renderVisibleParentAges(lang, ['3歳6ヶ月']), [expected]);
  }
});

test('dynamic parent card age renderer handles year-only and zero-year ages', async () => {
  assert.deepEqual(await renderVisibleParentAges('zh', ['3歳', '0歳7ヶ月']), ['3岁', '7个月']);
  assert.deepEqual(await renderVisibleParentAges('en', ['3歳', '0歳7ヶ月']), ['3 years', '7 months']);
});
