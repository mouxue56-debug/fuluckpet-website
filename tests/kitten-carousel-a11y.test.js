'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-carousel.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function matchesClass(node, selector) {
  if (!/^\.[A-Za-z0-9_-]+$/.test(selector)) return false;
  return node.className.split(/\s+/).includes(selector.slice(1));
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.className = '';
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this._textContent = '';
    this.scrollWidth = 720;
    this.clientWidth = 240;
    this.scrollLeft = 0;
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentNode = null;
      child.parentElement = null;
    });
    this.children = [];
    this._textContent = '';
    children.forEach((child) => this.appendChild(child));
  }

  set textContent(value) {
    this._textContent = String(value == null ? '' : value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== listener);
  }

  dispatch(type, event = {}) {
    const payload = {
      target: this,
      currentTarget: this,
      relatedTarget: null,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    (this.listeners[type] || []).slice().forEach((listener) => listener.call(this, payload));
  }

  querySelectorAll(selector) {
    const result = [];
    (function visit(node) {
      node.children.forEach((child) => {
        if (matchesClass(child, selector)) result.push(child);
        visit(child);
      });
    }(this));
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }

  scrollBy(options) {
    this.scrollLeft += Number(options && options.left) || 0;
  }

  scrollTo(options) {
    this.scrollLeft = Number(options && options.left) || 0;
  }
}

function kitten(overrides = {}) {
  return {
    breederId: 'kitten-1',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    price: 220000,
    status: 'available',
    photos: ['https://images.example.test/cat.webp'],
    ...overrides,
  };
}

function createPage({ lang = 'en', reducedMotion = false, items = [kitten()], catalog = null, pathname = '/en/blog/carousel.html' } = {}) {
  const mount = new FakeElement('div');
  mount.className = 'kitten-carousel-mount';
  const windowListeners = Object.create(null);
  const activeIntervals = new Map();
  const clearedIntervals = [];
  let nextIntervalId = 0;
  let currentLang = lang;

  const document = {
    head: { appendChild() {} },
    createElement(tag) { return new FakeElement(tag); },
    createTextNode(value) {
      const node = new FakeElement('#text');
      node.textContent = value;
      return node;
    },
    querySelector(selector) {
      if (selector === '.blog-meta-cat' || selector === '.blog-cta-box') return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.kitten-carousel-mount') return [mount];
      if (selector === '.kc-section') return mount.querySelectorAll(selector);
      return [];
    },
  };

  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FULUCK_CATALOG_I18N: catalog,
    FuluckKittenCatalog: KittenCatalog,
    location: { pathname },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: reducedMotion };
    },
    addEventListener(type, listener) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(listener);
    },
  };

  const context = vm.createContext({
    document,
    window,
    localStorage: { getItem() { return currentLang; } },
    fetch() { return Promise.resolve({ ok: true, json: async () => items }); },
    URL,
    console: { warn() {} },
    setInterval(callback, delay) {
      const id = ++nextIntervalId;
      activeIntervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      if (activeIntervals.delete(id)) clearedIntervals.push(id);
    },
  });

  vm.runInContext(SOURCE, context, { filename: 'kitten-carousel.js' });

  return {
    mount,
    activeIntervals,
    clearedIntervals,
    setLang(value) { currentLang = value; },
    dispatchWindow(type) {
      (windowListeners[type] || []).slice().forEach((listener) => listener());
    },
  };
}

test('catalog breed translations win, including mixed breeds, with legacy and raw fallbacks', async () => {
  const mix = 'サイベリアン×ブリティッシュショートヘア';
  const page = createPage({
    catalog: { breeds: { en: { 'サイベリアン': 'Catalog Siberian', [mix]: 'Siberian × British mix' } } },
    items: [
      kitten({ breederId: 'one', breed: 'サイベリアン' }),
      kitten({ breederId: 'two', breed: mix }),
      kitten({ breederId: 'three', breed: 'ブリティッシュロングヘア' }),
      kitten({ breederId: 'four', breed: '未登録猫種' }),
    ],
  });
  await flushAsyncWork();

  assert.deepEqual(
    page.mount.querySelectorAll('.kc-breed').map((node) => node.textContent).sort(),
    ['Catalog Siberian', 'Siberian × British mix', 'British Longhair', '未登録猫種'].sort()
  );
});

test('reduced-motion preference prevents automatic start and interaction restart', async () => {
  const page = createPage({ reducedMotion: true });
  await flushAsyncWork();

  const track = page.mount.querySelector('.kc-track');
  const section = page.mount.querySelector('.kc-section');
  const toggle = page.mount.querySelector('.kc-auto-toggle');
  assert.equal(page.activeIntervals.size, 0);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.textContent, 'Resume auto-scroll');

  track.dispatch('mouseenter');
  track.dispatch('mouseleave');
  track.dispatch('touchstart');
  track.dispatch('touchend');
  section.dispatch('focusin');
  section.dispatch('focusout');
  assert.equal(page.activeIntervals.size, 0, 'ambient interaction never overrides reduced motion');
});

test('hover, touch, and focus pause auto-scroll and resume only after all interactions leave', async () => {
  const page = createPage();
  await flushAsyncWork();

  const track = page.mount.querySelector('.kc-track');
  const section = page.mount.querySelector('.kc-section');
  assert.equal(page.activeIntervals.size, 1);

  track.dispatch('mouseenter');
  section.dispatch('focusin');
  assert.equal(page.activeIntervals.size, 0);
  track.dispatch('mouseleave');
  assert.equal(page.activeIntervals.size, 0, 'focus keeps motion paused after hover ends');
  section.dispatch('focusout');
  assert.equal(page.activeIntervals.size, 1);

  track.dispatch('touchstart');
  assert.equal(page.activeIntervals.size, 0);
  track.dispatch('touchend');
  assert.equal(page.activeIntervals.size, 1);
});

test('language re-render clears the old interval and preserves an explicit pause', async () => {
  const page = createPage();
  await flushAsyncWork();

  const oldInterval = Array.from(page.activeIntervals.keys())[0];
  page.setLang('zh');
  page.dispatchWindow('langChanged');
  await flushAsyncWork();

  let replacement = page.mount.querySelector('.kc-auto-toggle');
  assert.ok(page.clearedIntervals.includes(oldInterval), 'language re-render clears the detached section timer');
  assert.equal(page.activeIntervals.size, 1, 'one replacement timer remains active');
  assert.equal(replacement.getAttribute('aria-pressed'), 'false');
  assert.equal(replacement.textContent, '暂停自动滚动');

  replacement.dispatch('click');
  assert.equal(page.activeIntervals.size, 0);
  assert.equal(replacement.getAttribute('aria-pressed'), 'true');
  assert.equal(replacement.textContent, '继续自动滚动');

  page.setLang('en');
  page.dispatchWindow('langChanged');
  await flushAsyncWork();

  replacement = page.mount.querySelector('.kc-auto-toggle');
  assert.equal(page.activeIntervals.size, 0, 'explicit pause survives re-render');
  assert.equal(replacement.getAttribute('aria-pressed'), 'true');
  assert.equal(replacement.textContent, 'Resume auto-scroll');
  replacement.dispatch('click');
  assert.equal(page.activeIntervals.size, 1);
  assert.equal(replacement.getAttribute('aria-pressed'), 'false');
  assert.equal(replacement.textContent, 'Pause auto-scroll');
});

test('carousel dedupes before status filtering, excludes the detail kitten, orders, then slices', async () => {
  const plain = Array.from({ length: 12 }, (_, index) => kitten({
    breederId: 'plain-' + String(index).padStart(2, '0'),
    birthday: '2026-05',
  }));
  const page = createPage({
    pathname: '/en/kittens/current.html',
    items: [
      kitten({ breederId: 'duplicate', status: 'available', birthday: '2026-07' }),
      ...plain,
      kitten({ breederId: 'current', status: 'available' }),
      kitten({
        breederId: 'promoted',
        status: 'available',
        promotionTag: 'campaign',
        promotionPriority: 999,
        birthday: '2025-01',
      }),
      kitten({ breederId: 'duplicate', status: 'sold', birthday: '2026-07' }),
    ],
  });
  await flushAsyncWork();

  const hrefs = page.mount.querySelectorAll('.kc-card').map((node) => node.getAttribute('href'));
  assert.equal(hrefs.length, 12);
  assert.equal(hrefs[0], '/en/kittens/promoted.html');
  assert.ok(!hrefs.includes('/en/kittens/current.html'));
  assert.ok(!hrefs.includes('/en/kittens/duplicate.html'));
});
