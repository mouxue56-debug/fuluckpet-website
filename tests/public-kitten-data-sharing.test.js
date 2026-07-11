'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-catalog.js'), 'utf8');
const CAROUSEL_SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-carousel.js'), 'utf8');
const CTA_SOURCE = fs.readFileSync(path.join(ROOT, 'cta-widget.js'), 'utf8');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

function kittenControlsSource() {
  const startMarker = '  // ===== Update visible kitten count =====';
  const endMarker = '  // ===== Modal a11y helpers';
  const start = SCRIPT_SOURCE.indexOf(startMarker);
  const end = SCRIPT_SOURCE.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'main script keeps the kitten controls section');
  assert.notEqual(end, -1, 'main script keeps the kitten controls boundary');
  return `(function () {\n${SCRIPT_SOURCE.slice(start, end)}\n})();`;
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function installCatalog(context) {
  vm.runInContext(CATALOG_SOURCE, context, { filename: 'kitten-catalog.js' });
  context.window.FuluckKittenCatalog = context.FuluckKittenCatalog;
}

class CatalogControlNode {
  constructor(className = '') {
    this.className = className;
    this.dataset = {};
    this.style = {};
    this.listeners = Object.create(null);
  }

  get classList() {
    const node = this;
    return {
      add(name) {
        const names = new Set(node.className.split(/\s+/).filter(Boolean));
        names.add(name);
        node.className = [...names].join(' ');
      },
      remove(name) {
        node.className = node.className.split(/\s+/).filter((item) => item && item !== name).join(' ');
      },
      contains(name) {
        return node.className.split(/\s+/).includes(name);
      },
    };
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  click() {
    for (const listener of this.listeners.click || []) listener({ currentTarget: this });
  }
}

class CatalogGrid {
  constructor() {
    this.children = [];
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [...this._innerHTML.matchAll(/<div class="kitten-card"([^>]*)>/g)].map((match) => {
      const card = new CatalogControlNode('kitten-card');
      for (const attribute of match[1].matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)) {
        const key = attribute[1].replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase());
        card.dataset[key] = attribute[2];
      }
      card.parentNode = this;
      return card;
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelectorAll(selector) {
    if (selector === '.kitten-card') return this.children.slice();
    return [];
  }

  appendChild(card) {
    this.children = this.children.filter((candidate) => candidate !== card);
    this.children.push(card);
    card.parentNode = this;
    return card;
  }
}

function homepageControlsPage(kittens) {
  const listeners = Object.create(null);
  const grid = new CatalogGrid();
  const visibleCount = { textContent: '0' };
  const filterButtons = ['all', 'available', 'reserved', 'sold'].map((filter, index) => {
    const button = new CatalogControlNode(index === 0 ? 'filter-btn active' : 'filter-btn');
    button.dataset.filter = filter;
    return button;
  });
  const sortButtons = ['default', 'price-asc', 'price-desc', 'newest'].map((sort, index) => {
    const button = new CatalogControlNode(index === 0 ? 'sort-btn active' : 'sort-btn');
    button.dataset.sort = sort;
    return button;
  });
  const document = {
    title: 'Home',
    documentElement: { lang: 'ja' },
    getElementById(id) {
      if (id === 'kittensGrid') return grid;
      if (id === 'visibleCount') return visibleCount;
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.filter-btn') return filterButtons;
      if (selector === '.sort-btn') return sortButtons;
      if (selector === '.kitten-card') return grid.children.slice();
      if (selector === '.kitten-card:not(.hidden)') {
        return grid.children.filter((card) => !card.classList.contains('hidden'));
      }
      return [];
    },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FuluckKittenCatalog: null,
    location: { pathname: '/index.html' },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners[event.type] || []) listener(event);
    },
    rebindCards() {},
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch(url) {
      const endpoint = String(url).split('/').pop();
      return Promise.resolve({
        ok: true,
        json: async () => endpoint === 'kittens' ? kittens : [],
      });
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  });
  installCatalog(context);
  window.FuluckKittenCatalog = context.FuluckKittenCatalog;
  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  vm.runInContext(kittenControlsSource(), context, { filename: 'script.js#kitten-controls' });
  return { context, filterButtons, grid, listeners, sortButtons, visibleCount, window };
}

function createPage(fetchImpl) {
  const listeners = Object.create(null);
  const appended = [];
  const location = { pathname: '/blog/performance-test.html' };
  const document = {
    head: { appendChild() {} },
    body: {
      appendChild(node) {
        appended.push(node);
        return node;
      },
    },
    documentElement: { scrollTop: 0, scrollHeight: 2400 },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        className: '',
        innerHTML: '',
        classList: { add() {}, remove() {} },
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    location,
    innerHeight: 800,
    pageYOffset: 0,
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
  };
  const context = vm.createContext({
    window,
    location,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch: fetchImpl,
    URL,
    console: { warn() {} },
    setInterval() { return 1; },
    clearInterval() {},
  });
  return { context, appended, listeners, window };
}

test('carousel and CTA share one in-flight kittens request on the same page', async () => {
  const requests = [];
  const page = createPage((url) => {
    requests.push(String(url));
    return Promise.resolve({
      ok: true,
      json: async () => [{ id: 'kitten-1', status: 'available' }],
    });
  });

  installCatalog(page.context);
  vm.runInContext(CAROUSEL_SOURCE, page.context, { filename: 'kitten-carousel.js' });
  vm.runInContext(CTA_SOURCE, page.context, { filename: 'cta-widget.js' });
  await flushAsyncWork();

  assert.deepEqual(requests, ['https://api.example.test/api/kittens']);
  assert.equal(page.appended.length, 1, 'CTA still renders from the shared result');
});

test('a shared kittens failure keeps both consumers fail-safe', async () => {
  let requestCount = 0;
  const page = createPage(() => {
    requestCount += 1;
    return Promise.reject(new Error('offline'));
  });

  installCatalog(page.context);
  vm.runInContext(CAROUSEL_SOURCE, page.context, { filename: 'kitten-carousel.js' });
  vm.runInContext(CTA_SOURCE, page.context, { filename: 'cta-widget.js' });
  await flushAsyncWork();

  assert.equal(requestCount, 1);
  assert.equal(page.appended.length, 1, 'CTA renders its no-count fallback');
});

test('homepage card re-render reuses its first kittens result', async () => {
  const requests = [];
  const listeners = Object.create(null);
  const kittenGrid = { innerHTML: '<p>static</p>' };
  const parentGrid = { innerHTML: '<p>static</p>' };
  const reviewGrid = { innerHTML: '<p>static</p>' };
  const document = {
    title: 'Home',
    head: { appendChild() {} },
    getElementById(id) {
      if (id === 'kittensGrid') return kittenGrid;
      if (id === 'visibleCount') return { textContent: '' };
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return null;
      if (selector === '#parents .parents-grid') return parentGrid;
      if (selector === '#reviews .reviews-grid') return reviewGrid;
      return null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return { tagName: String(tag).toUpperCase(), textContent: '' }; },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    location: { pathname: '/index.html' },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatchEvent() {},
    rebindCards() {},
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch(url) {
      requests.push(String(url));
      return Promise.resolve({ ok: true, json: async () => [] });
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
  });

  installCatalog(context);
  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  await flushAsyncWork();
  for (const listener of listeners.langChanged || []) listener();
  await flushAsyncWork();

  const kittenRequests = requests.filter((url) => url.endsWith('/api/kittens'));
  assert.equal(kittenRequests.length, 1);
});

test('homepage language re-render reapplies the active availability filter and shared price order', async () => {
  const page = homepageControlsPage([
    {
      breederId: 'available-expensive',
      breed: 'サイベリアン',
      birthday: '2026-06-01',
      price: 320000,
      status: 'available',
    },
    {
      breederId: 'available-affordable',
      breed: 'サイベリアン',
      birthday: '2026-05-01',
      price: 180000,
      status: 'available',
    },
    {
      breederId: 'reserved-cheapest',
      breed: 'サイベリアン',
      birthday: '2026-07-01',
      price: 120000,
      status: 'reserved',
    },
  ]);
  await flushAsyncWork();

  page.filterButtons.find((button) => button.dataset.filter === 'available').click();
  page.sortButtons.find((button) => button.dataset.sort === 'price-asc').click();
  assert.deepEqual(
    page.grid.children.map((card) => card.dataset.breederId),
    ['available-affordable', 'available-expensive', 'reserved-cheapest'],
    'the shared comparator owns price ordering before the refresh',
  );
  assert.equal(page.grid.children[2].classList.contains('hidden'), true);

  page.window.dispatchEvent(new page.context.Event('langChanged'));
  await flushAsyncWork();

  assert.equal(page.listeners.cardsLoaded?.length, 1, 'one refresh listener is enough for every card reload');
  assert.equal(
    page.filterButtons.find((button) => button.dataset.filter === 'available').classList.contains('active'),
    true,
  );
  assert.equal(
    page.sortButtons.find((button) => button.dataset.sort === 'price-asc').classList.contains('active'),
    true,
  );
  assert.deepEqual(
    page.grid.children.map((card) => card.dataset.breederId),
    ['available-affordable', 'available-expensive', 'reserved-cheapest'],
    'the language-driven card rebuild preserves the selected price order',
  );
  assert.deepEqual(
    page.grid.children.filter((card) => !card.classList.contains('hidden')).map((card) => card.dataset.breederId),
    ['available-affordable', 'available-expensive'],
    'the language-driven card rebuild preserves the selected availability filter',
  );
  assert.equal(page.visibleCount.textContent, 2);
});

test('CTA count follows shared last-write-wins dedupe semantics', async () => {
  const page = createPage(() => Promise.resolve({
    ok: true,
    json: async () => [
      { breederId: 'duplicate', status: 'available' },
      { breederId: 'visible', status: 'available' },
      { breederId: 'duplicate', status: 'sold' },
    ],
  }));

  installCatalog(page.context);
  vm.runInContext(CTA_SOURCE, page.context, { filename: 'cta-widget.js' });
  await flushAsyncWork();

  assert.match(page.appended[0].innerHTML, /子猫募集中 1匹/);
});

test('every tracked CTA consumer uses the current shared-data cache version', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const stale = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/cta-widget\.js\?v=/.test(source) && !/cta-widget\.js\?v=20260711a/.test(source)) {
      stale.push(file);
    }
  }
  assert.deepEqual(stale, []);
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');
  assert.match(generator, /verAsset\('cta-widget\.js', '20260711a'\)/);
});
