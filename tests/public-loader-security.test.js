const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');
const BLOG_SOURCE = fs.readFileSync(path.join(ROOT, 'blog-loader.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function response(data, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || (options.ok === false ? 503 : 200),
    json: async () => data
  };
}

function runCardLoader(options = {}) {
  const page = options.page || 'index';
  const initial = '<article class="static-fallback">STATIC SEO FALLBACK</article>';
  const kittenGrid = { innerHTML: initial };
  const parentGrid = { innerHTML: initial };
  const reviewGrid = { innerHTML: initial };
  const visibleCount = { textContent: 'static' };
  const sectionTitle = { textContent: 'Siberian (static)' };
  const section = {
    querySelector(selector) {
      if (selector === '.kittens-grid') return kittenGrid;
      if (selector === '.sec-tag') return { textContent: 'Siberian' };
      if (selector === '.sec-title') return sectionTitle;
      return null;
    }
  };
  const parentSectionConfig = [
    ['Siberian', 'サイベリアン'],
    ['British Shorthair', 'ブリティッシュショートヘア'],
    ['British Longhair', 'ブリティッシュロングヘア'],
    ['Ragdoll', 'ラグドール'],
  ];
  const parentGrids = parentSectionConfig.map(([, breed]) => ({
    innerHTML: `<article class="static-fallback">STATIC ${breed}</article>`,
  }));
  const parentSections = parentSectionConfig.map(([tag], index) => ({
    querySelector(selector) {
      if (selector === '.parents-grid') return parentGrids[index];
      if (selector === '.sec-tag') return { textContent: tag };
      return null;
    },
  }));
  const schemas = [];
  const listeners = {};
  let rebound = 0;

  const document = {
    title: page === 'kittens' ? '子猫一覧' : 'Home',
    head: { appendChild(node) { schemas.push(node); } },
    getElementById(id) {
      if (id === 'kittensGrid' && page === 'index') return kittenGrid;
      if (id === 'visibleCount') return visibleCount;
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return page === 'index' ? null : {};
      if (selector === '#parents .parents-grid') return parentGrid;
      if (selector === '#reviews .reviews-grid') return reviewGrid;
      if (selector === '.reviews-page-grid') return reviewGrid;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.section') {
        if (page === 'kittens') return [section];
        if (page === 'parents') return parentSections;
        return [];
      }
      if (selector === '.kittens-grid') return page === 'kittens' ? [kittenGrid] : [];
      if (selector === '.parents-grid') return page === 'parents' ? parentGrids : [];
      return [];
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        setAttribute(name, value) { this[name] = String(value); },
        textContent: ''
      };
    }
  };

  const payloads = options.payloads || {};
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FULUCK_CATALOG_I18N: options.catalog,
    location: { pathname: page === 'index' ? '/index.html' : '/' + page + '.html' },
    addEventListener(type, fn) { listeners[type] = fn; },
    dispatchEvent() {},
    rebindCards() { rebound += 1; }
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return options.lang || 'ja'; } },
    fetch(url) {
      const endpoint = String(url).split('/').pop();
      return Promise.resolve(payloads[endpoint] || response([]));
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
    setTimeout,
    clearTimeout
  });
  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  return {
    kittenGrid,
    parentGrid,
    parentGrids,
    reviewGrid,
    visibleCount,
    sectionTitle,
    schemas,
    listeners,
    get rebound() { return rebound; },
    initial
  };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
    this._innerHTML = '';
    this.htmlWrites = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._textContent = '';
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  get classList() {
    const element = this;
    return {
      add(name) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        classes.add(name);
        element.className = Array.from(classes).join(' ');
      },
      remove(name) {
        element.className = element.className.split(/\s+/).filter((item) => item && item !== name).join(' ');
      }
    };
  }

  set textContent(value) {
    this._textContent = String(value == null ? '' : value);
    this.children = [];
    this._innerHTML = '';
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(value) {
    this._innerHTML = String(value == null ? '' : value);
    this.htmlWrites.push(this._innerHTML);
    this.children = [];
    this._textContent = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelectorAll(selector) {
    const results = [];
    const matches = (node) => {
      if (selector.startsWith('.')) {
        return node.className.split(/\s+/).includes(selector.slice(1));
      }
      if (selector === 'script[data-schema="blog-articles"]') {
        return node.tagName === 'SCRIPT' && node.attributes['data-schema'] === 'blog-articles';
      }
      return node.tagName === selector.toUpperCase();
    };
    const visit = (node) => {
      node.children.forEach((child) => {
        if (matches(child)) results.push(child);
        visit(child);
      });
    };
    visit(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function runBlogLoader(options = {}) {
  const list = new FakeElement('div');
  const filters = new FakeElement('div');
  const detail = new FakeElement('div');
  const staticCard = new FakeElement('a');
  staticCard.className = 'blog-card';
  staticCard.textContent = 'STATIC SEO FALLBACK';
  list.appendChild(staticCard);
  const head = new FakeElement('head');
  const listeners = {};
  const redirects = [];
  const document = {
    title: 'Blog',
    head,
    createElement(tag) { return new FakeElement(tag); },
    getElementById(id) {
      if (id === 'blogList') return list;
      if (id === 'blogFilters') return filters;
      if (id === 'blogDetail') return detail;
      return null;
    },
    getElementsByTagName(tag) { return tag === 'head' ? [head] : []; }
  };
  const window = {
    location: {
      search: options.search || '',
      replace(url) { redirects.push(String(url)); }
    },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return options.lang || 'ja'; } },
    fetch() { return Promise.resolve(options.response || response([])); },
    URL,
    URLSearchParams,
    console: { log() {}, warn() {} }
  });
  vm.runInContext(BLOG_SOURCE, context, { filename: 'blog-loader.js' });
  return { list, filters, detail, head, listeners, redirects, staticCard };
}

function allDescendants(root) {
  const result = [];
  const visit = (node) => {
    node.children.forEach((child) => {
      result.push(child);
      visit(child);
    });
  };
  visit(root);
  return result;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

test('card loader keeps every static fallback when any homepage response is non-OK or malformed', async () => {
  for (const payloads of [
    {
      kittens: response([{ breederId: 'safe-id', breed: 'サイベリアン', status: 'available' }]),
      parents: response([], { ok: false, status: 503 }),
      reviews: response([])
    },
    {
      kittens: response([{ breederId: 'safe-id', breed: 'サイベリアン', status: 'available' }]),
      parents: response({ items: [] }),
      reviews: response([])
    }
  ]) {
    const result = runCardLoader({ payloads });
    await flushAsyncWork();
    assert.equal(result.kittenGrid.innerHTML, result.initial);
    assert.equal(result.parentGrid.innerHTML, result.initial);
    assert.equal(result.reviewGrid.innerHTML, result.initial);
    assert.equal(result.rebound, 0);
  }
});

test('card loader validates and escapes all API-backed card fields while preserving trusted icons', async () => {
  const marker = 'PAYLOAD_MARKER';
  const result = runCardLoader({
    payloads: {
      kittens: response([{
        id: 'safe-id',
        breederId: 'safe-id',
        breed: '<img src=x onerror=' + marker + '>',
        gender: '♂',
        color: '<svg onload=' + marker + '>',
        birthday: '<svg/onload=' + marker + '>-01',
        price: '0" onpointerover="' + marker,
        status: 'available',
        papa: 'papa" onclick="' + marker,
        mama: '<img src=x onerror=' + marker + '>',
        isNew: 'true" onclick="' + marker,
        photos: ['https://images.example.test/cat.jpg" onerror="' + marker],
        coverIndex: 0,
        video: 'https://youtube.com/embed/abc" onload="' + marker,
        note: '<script>' + marker + '</script>',
        group: 'c995680'
      }, {
        id: 'unsafe-status-is-dropped',
        breederId: 'unsafe-status-is-dropped',
        breed: 'サイベリアン',
        gender: '♀',
        status: 'available" autofocus onfocus="' + marker,
        price: 1,
        photos: []
      }]),
      parents: response([{
        id: 'parent',
        name: '<img src=x onerror=' + marker + '>',
        breed: '<svg onload=' + marker + '>',
        gender: '♀" onclick="' + marker,
        role: 'ママ猫" onmouseover="' + marker,
        age: '<script>' + marker + '</script>',
        color: '<img src=x onerror=' + marker + '>',
        tested: 'true" onclick="' + marker,
        photos: ['javascript:' + marker],
        group: 'c995680'
      }]),
      reviews: response([{
        body: '<img src=x onerror=' + marker + '>',
        region: '<svg onload=' + marker + '>',
        author: '<script>' + marker + '</script>',
        date: '" onclick="' + marker
      }])
    }
  });
  await flushAsyncWork();

  const combined = result.kittenGrid.innerHTML + result.parentGrid.innerHTML + result.reviewGrid.innerHTML;
  assert.doesNotMatch(combined, /<script|<svg\s+onload|<img\s+src=x|onpointerover=|autofocus\s+onfocus=|javascript:/i);
  assert.doesNotMatch(combined, /src="[^"]*PAYLOAD_MARKER|data-(?:price|status|new|video|tested)="[^"]*PAYLOAD_MARKER/i);
  assert.match(result.kittenGrid.innerHTML, /ico-mars/);
  assert.match(result.parentGrid.innerHTML, /ico-check/);
  assert.match(result.reviewGrid.innerHTML, /ico-star/);
  assert.match(combined, /&lt;(?:img|svg|script)/i, 'unsafe text should remain visible as escaped text');

  // Several card values are read back from the DOM and interpolated by the legacy modal.
  // After the browser decodes this first HTML layer, those downstream values must still
  // be incapable of opening tags, attributes, or CSS-selector escapes.
  const dataValues = Array.from(combined.matchAll(/data-(?:papa|mama|name|breed|gender|role|age|color)="([^"]*)"/g), (match) => decodeHtml(match[1]));
  const displayedValues = Array.from((result.kittenGrid.innerHTML + result.parentGrid.innerHTML).matchAll(/<(?:h3|p)[^>]*>(.*?)<\/(?:h3|p)>/g), (match) => decodeHtml(match[1].replace(/<[^>]+>/g, '')));
  for (const value of dataValues.concat(displayedValues)) {
    assert.doesNotMatch(value, /[<>"'`\\]/, value);
  }
});

test('card loader keeps a static list when a page response is non-OK or not an array', async () => {
  for (const apiResponse of [
    response([{ breederId: 'safe-id', breed: 'サイベリアン', status: 'available', price: 1 }], { ok: false, status: 503 }),
    response({ items: [] })
  ]) {
    const result = runCardLoader({ page: 'kittens', payloads: { kittens: apiResponse } });
    await flushAsyncWork();
    assert.equal(result.kittenGrid.innerHTML, result.initial);
    assert.equal(result.schemas.length, 0);
    assert.equal(result.rebound, 0);
  }
});

test('dynamic kitten cards link only to statuses that receive generated detail pages', async () => {
  const kittens = ['available', 'reserved', 'sold'].map((status) => ({
    breederId: `kitten-${status}`,
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05',
    price: 100000,
    status,
    photos: [`https://images.example.test/${status}.jpg`],
  }));
  const result = runCardLoader({ page: 'kittens', payloads: { kittens: response(kittens) } });
  await flushAsyncWork();

  for (const status of ['available', 'reserved']) {
    assert.match(
      result.kittenGrid.innerHTML,
      new RegExp(`class="kitten-card"[^>]*role="link"[^>]*tabindex="0"[^>]*data-status="${status}"[^>]*data-detail-url="/kittens/kitten-${status}\\.html"`),
    );
  }
  assert.match(result.kittenGrid.innerHTML, /class="kitten-card"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-haspopup="dialog"[^>]*data-status="sold"[^>]*data-detail-url=""/);
  assert.doesNotMatch(result.kittenGrid.innerHTML, /data-detail-url="\/kittens\/kitten-sold\.html"/);
});

test('dynamic cards use the generated breed catalogue before legacy fallbacks', async () => {
  const mix = 'サイベリアン×ブリティッシュ';
  const result = runCardLoader({
    page: 'kittens',
    lang: 'en',
    catalog: {
      breeds: { en: { [mix]: 'Siberian × British mix' } },
      colors: { en: {} },
    },
    payloads: {
      kittens: response([{
        breederId: 'mix-kitten',
        breed: mix,
        color: 'ブルー',
        gender: '♀',
        birthday: '2026-05',
        price: 100000,
        status: 'available',
        photos: ['https://images.example.test/mix.jpg'],
      }]),
    },
  });
  await flushAsyncWork();

  assert.match(result.kittenGrid.innerHTML, /Siberian × British mix/);
  assert.doesNotMatch(result.kittenGrid.innerHTML, /<h3>サイベリアン×ブリティッシュ<\/h3>/);
});

test('dynamic parent cards expose modal button semantics', async () => {
  const result = runCardLoader({
    payloads: {
      kittens: response([]),
      parents: response([{
        name: 'しろくん',
        breed: 'サイベリアン',
        gender: '♂',
        role: 'パパ猫',
        age: '3歳',
        color: 'ホワイト',
        tested: true,
        group: 'c995680',
      }]),
      reviews: response([]),
    },
  });
  await flushAsyncWork();

  assert.match(result.parentGrid.innerHTML, /class="parent-card"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-haspopup="dialog"/);
});

test('parents page replaces every generated breed section by tag without duplicate stale cards', async () => {
  const expected = [
    ['サイベリアン', 'Siberian Parent'],
    ['ブリティッシュショートヘア', 'Shorthair Parent'],
    ['ブリティッシュロングヘア', 'Longhair Parent'],
    ['ラグドール', 'Ragdoll Parent'],
  ];
  const parents = expected.map(([breed, name], index) => ({
    id: `parent-${index}`,
    name,
    breed,
    gender: index === 0 ? '♂' : '♀',
    role: index === 0 ? 'パパ猫' : 'ママ猫',
    age: '3歳',
    color: 'テストカラー',
    tested: true,
    photos: [`https://images.example.test/parent-${index}.jpg`],
    group: index === 0 ? 'c995680' : 'd696506',
  }));
  const result = runCardLoader({ page: 'parents', payloads: { parents: response(parents) } });
  await flushAsyncWork();

  function assertBreedGridMapping() {
    assert.equal(result.parentGrids.length, 4);
    result.parentGrids.forEach((grid, index) => {
      assert.match(grid.innerHTML, new RegExp(expected[index][1]));
      assert.doesNotMatch(grid.innerHTML, /STATIC/);
      expected.forEach(([, name], otherIndex) => {
        if (otherIndex !== index) assert.doesNotMatch(grid.innerHTML, new RegExp(name));
      });
    });
  }
  assertBreedGridMapping();
  assert.equal(result.rebound, 1);

  result.parentGrids.forEach((grid) => { grid.innerHTML = '<article>STATIC AGAIN</article>'; });
  result.listeners.langChanged();
  await flushAsyncWork();
  assertBreedGridMapping();
  assert.equal(result.rebound, 2, 'language rerender uses the same section mapper');
});

test('blog loader preserves static SEO fallback on non-OK and malformed article payloads', async () => {
  for (const apiResponse of [
    response([{ slug: 'looks-valid', title: { ja: 'Would replace fallback' } }], { ok: false, status: 503 }),
    response({ items: [] })
  ]) {
    const result = runBlogLoader({ response: apiResponse });
    await flushAsyncWork();
    assert.equal(result.list.children.length, 1);
    assert.equal(result.list.children[0], result.staticCard);
    assert.equal(result.filters.children.length, 0);
    assert.equal(result.head.querySelectorAll('script[data-schema="blog-articles"]').length, 0);
  }
});

test('blog listing uses DOM text and validated URLs for adversarial API fields', async () => {
  const marker = 'BLOG_PAYLOAD_MARKER';
  const result = runBlogLoader({
    response: response([{
      slug: 'safe-article',
      category: '<img src=x onerror=' + marker + '>',
      title: { ja: '<svg onload=' + marker + '>literal title' },
      excerpt: { ja: '<script>' + marker + '</script>' },
      coverImage: 'javascript:' + marker,
      tags: ['safe', '<img onerror=' + marker + '>']
    }])
  });
  await flushAsyncWork();

  const descendants = allDescendants(result.list);
  const links = descendants.filter((node) => node.tagName === 'A');
  const images = descendants.filter((node) => node.tagName === 'IMG');
  assert.equal(result.list.htmlWrites.length, 0, 'API content must not be assembled through innerHTML');
  assert.equal(result.filters.htmlWrites.length, 0, 'API categories must not be assembled through innerHTML');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, '/blog/safe-article.html');
  assert.equal(images.length, 0, 'unsafe cover URLs must fall back to the static no-image tile');
  assert.match(result.list.textContent, new RegExp(marker));

  const schema = result.head.querySelector('script[data-schema="blog-articles"]');
  assert.ok(schema);
  const graph = JSON.parse(schema.textContent)['@graph'];
  assert.equal(graph.length, 1);
  assert.equal(graph[0].image, 'https://fuluckpet.com/images/ogp.jpg');
});

test('blog legacy slug redirect accepts one safe filename segment only', () => {
  assert.deepEqual(runBlogLoader({ search: '?slug=safe-article' }).redirects, ['/blog/safe-article.html']);
  for (const slug of ['../admin', 'a/b', 'javascript:alert(1)', '%2e%2e/secret', 'bad slug']) {
    assert.deepEqual(runBlogLoader({ search: '?slug=' + encodeURIComponent(slug) }).redirects, [], slug);
  }
});

test('blog loader contains no reachable rich-HTML detail renderer', () => {
  assert.doesNotMatch(BLOG_SOURCE, /function\s+renderDetail\b/);
  assert.doesNotMatch(BLOG_SOURCE, /blog-detail-content/);
});
