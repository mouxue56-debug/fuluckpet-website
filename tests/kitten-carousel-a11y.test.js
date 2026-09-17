'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-carousel.js'), 'utf8');

test('mobile carousel gutters stay inside a 390px detail-page viewport', () => {
  assert.match(
    SOURCE,
    /@media\(max-width:600px\)\{[^}]*\.kc-track-wrap\s*\{[^}]*margin:\s*0 -16px;[^}]*padding:\s*0 16px;/,
  );
});

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

  replaceChild(next, previous) {
    const i = this.children.indexOf(previous);
    this.children[i] = next;
    next.parentNode = this;
    next.parentElement = this;
    previous.parentNode = null;
    previous.parentElement = null;
    return previous;
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

function createPage({
  lang = 'en',
  documentLang,
  reducedMotion = false,
  items = [kitten()],
  catalog = null,
  pathname = '/en/blog/carousel.html',
  search = '',
  storageLang,
  storageThrows = false,
  category = '',
  blogCta = false,
} = {}) {
  const mount = new FakeElement('div');
  mount.className = 'kitten-carousel-mount';
  const root = new FakeElement('main');
  root.appendChild(mount);
  const originalCta = new FakeElement('div');
  originalCta.className = 'blog-cta-box';
  originalCta.textContent = 'Book a visit';
  if (blogCta) root.appendChild(originalCta);
  const windowListeners = Object.create(null);
  const activeIntervals = new Map();
  const clearedIntervals = [];
  let nextIntervalId = 0;
  let currentLang = storageLang !== undefined ? storageLang : lang;

  const document = {
    documentElement: { lang: documentLang !== undefined ? documentLang : lang },
    head: { appendChild() {} },
    createElement(tag) { return new FakeElement(tag); },
    createTextNode(value) {
      const node = new FakeElement('#text');
      node.textContent = value;
      return node;
    },
    querySelector(selector) {
      if (selector === '.blog-meta-cat') {
        if (!category) return null;
        const node = new FakeElement('span');
        node.textContent = category;
        return node;
      }
      if (selector === '.blog-cta-box') return root.querySelector(selector);
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.kitten-carousel-mount') return root.querySelectorAll(selector);
      if (selector === '.kc-section') return mount.querySelectorAll(selector);
      return [];
    },
  };

  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FULUCK_CATALOG_I18N: catalog,
    FuluckKittenCatalog: KittenCatalog,
    location: { pathname, search },
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
    localStorage: {
      getItem() {
        if (storageThrows) throw new Error('storage blocked');
        return currentLang;
      },
    },
    fetch() { return Promise.resolve({ ok: true, json: async () => items }); },
    URL,
    URLSearchParams,
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
    root,
    originalCta,
    activeIntervals,
    clearedIntervals,
    setLang(value) {
      currentLang = value;
      document.documentElement.lang = value;
    },
    dispatchWindow(type) {
      const event = { type, detail: { lang: currentLang } };
      (windowListeners[type] || []).slice().forEach((listener) => listener(event));
    },
  };
}

function hrefsOf(mount, selector) {
  return mount.querySelectorAll(selector).map((node) => node.getAttribute('href'));
}

function queryOf(href) {
  return new URL(href, 'https://fuluckpet.com').searchParams;
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

test('carousel uses localized price inquiry for every invalid sale price', async () => {
  const invalidPrices = [0, -1, 1.5, '1e3', '1,000', '', null, false, NaN, Infinity, {}, []];
  for (const [lang, inquiry] of [
    ['ja', '価格はお問い合わせください'],
    ['en', 'Please ask for the current price'],
    ['zh', '价格请咨询'],
  ]) {
    for (let index = 0; index < invalidPrices.length; index += 1) {
      const page = createPage({
        lang,
        pathname: `/${lang}/blog/price.html`,
        items: [kitten({ breederId: `invalid-${index}`, price: invalidPrices[index] })],
      });
      await flushAsyncWork();
      const price = page.mount.querySelector('.kc-price');
      assert.equal(price.textContent, inquiry, `${lang}: ${String(invalidPrices[index])}`);
      assert.doesNotMatch(price.textContent, /¥/);
    }

    const valid = createPage({
      lang,
      pathname: `/${lang}/blog/price.html`,
      items: [kitten({ price: '220000' })],
    });
    await flushAsyncWork();
    assert.equal(valid.mount.querySelector('.kc-price').textContent, '¥220,000');
  }
});

const LINE_URL = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
const HYPHEN_ID = '2603-02736';

test('dynamic EN/ZH blog first render prefixes hyphen ids and localizes exact CTAs', async () => {
  for (const [lang, bookingLabel] of [['en', 'Book a Visit'], ['zh', '预约见学']]) {
    const page = createPage({
      lang,
      pathname: '/blog/siberian-weight-size.html',
      search: `?lang=${lang}`,
      category: '猫種知識',
      items: [kitten({ breederId: HYPHEN_ID })],
    });
    await flushAsyncWork();

    assert.deepEqual(hrefsOf(page.mount, '.kc-card'), [`/${lang}/kittens/${HYPHEN_ID}.html`]);
    const ctas = hrefsOf(page.mount, '.kc-btn');
    assert.equal(ctas[0], `/${lang}/kittens.html`);
    assert.equal(queryOf(ctas[1]).get('lang'), lang);
    assert.equal(queryOf(ctas[1]).get('kitten'), null);
    assert.equal(new URL(ctas[1], 'https://fuluckpet.com').pathname, '/booking.html');
    assert.match(page.mount.textContent, new RegExp(bookingLabel));
    assert.ok(!ctas.some((href) => href === LINE_URL));
  }

  const guide = createPage({
    lang: 'en',
    pathname: '/blog/siberian-weight-size.html',
    search: '?lang=en',
    category: '子猫育て',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  const guideCtas = hrefsOf(guide.mount, '.kc-btn');
  assert.equal(guideCtas[0], '/guide/?lang=en');
  assert.equal(guideCtas[1], LINE_URL);

  const defaultCta = createPage({
    lang: 'en',
    pathname: '/blog/siberian-weight-size.html',
    search: '?lang=en',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  const fallback = hrefsOf(defaultCta.mount, '.kc-btn');
  assert.equal(fallback[0], '/en/kittens.html');
  assert.equal(fallback[1], LINE_URL);
});

test('langChanged on a dynamic blog rewrites cards and CTAs EN → ZH → JA', async () => {
  const page = createPage({
    lang: 'en',
    pathname: '/blog/siberian-weight-size.html',
    search: '?lang=en',
    category: '猫種知識',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  assert.equal(hrefsOf(page.mount, '.kc-card')[0], `/en/kittens/${HYPHEN_ID}.html`);

  page.setLang('zh');
  page.dispatchWindow('langChanged');
  await flushAsyncWork();
  assert.equal(hrefsOf(page.mount, '.kc-card')[0], `/zh/kittens/${HYPHEN_ID}.html`);
  assert.equal(hrefsOf(page.mount, '.kc-btn')[0], '/zh/kittens.html');
  assert.equal(queryOf(hrefsOf(page.mount, '.kc-btn')[1]).get('lang'), 'zh');

  page.setLang('ja');
  page.dispatchWindow('langChanged');
  await flushAsyncWork();
  assert.equal(hrefsOf(page.mount, '.kc-card')[0], `/kittens/${HYPHEN_ID}.html`);
  assert.deepEqual(hrefsOf(page.mount, '.kc-btn'), ['/kittens.html', '/booking.html']);
});

test('storage throw and stale EN keep JA on a Japanese document', async () => {
  const thrown = createPage({
    lang: 'ja',
    documentLang: '',
    pathname: '/blog/siberian-weight-size.html',
    storageThrows: true,
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  assert.equal(hrefsOf(thrown.mount, '.kc-card')[0], `/kittens/${HYPHEN_ID}.html`);
  assert.equal(hrefsOf(thrown.mount, '.kc-btn')[0], '/kittens.html');

  const stale = createPage({
    lang: 'ja',
    documentLang: 'ja',
    storageLang: 'en',
    pathname: '/blog/siberian-weight-size.html',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  assert.equal(hrefsOf(stale.mount, '.kc-card')[0], `/kittens/${HYPHEN_ID}.html`);
  assert.equal(hrefsOf(stale.mount, '.kc-btn')[0], '/kittens.html');
});

test('static /zh route wins over leftover storage EN', async () => {
  const page = createPage({
    lang: 'zh',
    documentLang: 'ja',
    storageLang: 'en',
    pathname: '/zh/blog/siberian-weight-size.html',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  assert.equal(hrefsOf(page.mount, '.kc-card')[0], `/zh/kittens/${HYPHEN_ID}.html`);
  assert.equal(hrefsOf(page.mount, '.kc-btn')[0], '/zh/kittens.html');
});

test('detail booking keeps kitten query on JA and localized pages without adding it on blogs', async () => {
  const jaDetail = createPage({
    lang: 'ja',
    pathname: `/kittens/${HYPHEN_ID}.html`,
    storageLang: 'en',
    category: '猫種知識',
    items: [
      kitten({ breederId: HYPHEN_ID }),
      kitten({ breederId: '2605-02526' }),
    ],
  });
  await flushAsyncWork();
  assert.deepEqual(hrefsOf(jaDetail.mount, '.kc-card'), ['/kittens/2605-02526.html']);
  const jaBooking = hrefsOf(jaDetail.mount, '.kc-btn')[1];
  assert.equal(new URL(jaBooking, 'https://fuluckpet.com').pathname, '/booking.html');
  assert.equal(queryOf(jaBooking).get('kitten'), HYPHEN_ID);
  assert.equal(queryOf(jaBooking).get('lang'), null);

  const enDetail = createPage({
    lang: 'en',
    pathname: `/en/kittens/${HYPHEN_ID}.html`,
    category: '猫種知識',
    items: [
      kitten({ breederId: HYPHEN_ID }),
      kitten({ breederId: '2605-02526' }),
    ],
  });
  await flushAsyncWork();
  const enBooking = hrefsOf(enDetail.mount, '.kc-btn')[1];
  assert.equal(new URL(enBooking, 'https://fuluckpet.com').pathname, '/booking.html');
  assert.equal(queryOf(enBooking).get('kitten'), HYPHEN_ID);
  assert.equal(queryOf(enBooking).get('lang'), 'en');

  const blog = createPage({
    lang: 'en',
    pathname: '/blog/siberian-weight-size.html',
    search: '?lang=en',
    category: '猫種知識',
    items: [kitten({ breederId: HYPHEN_ID })],
  });
  await flushAsyncWork();
  assert.equal(queryOf(hrefsOf(blog.mount, '.kc-btn')[1]).get('kitten'), null);
});

for (const items of [[], [kitten({status:'sold'})], [kitten({photos:[]})]]) {
  test(`empty/unrenderable catalog preserves the original blog CTA (${JSON.stringify(items)})`, async () => {
    const page = createPage({items, blogCta:true});
    await flushAsyncWork();
    assert.equal(page.root.contains(page.originalCta), true);
    assert.equal(page.originalCta.textContent, 'Book a visit');
  });
}
test('a usable carousel replaces the original CTA without duplicating it', async () => {
  const page = createPage({blogCta:true});
  await flushAsyncWork();
  assert.equal(page.root.contains(page.originalCta), false);
  assert.equal(page.root.querySelectorAll('.kc-section').length, 2);
});
