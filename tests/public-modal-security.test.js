'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const CAROUSEL_SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-carousel.js'), 'utf8');
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function matchesSimpleSelector(node, selector) {
  if (!selector || selector.includes(',') || selector.includes('[')) return false;
  const notMatch = selector.match(/:not\(\.([A-Za-z0-9_-]+)\)$/);
  const forbiddenClass = notMatch ? notMatch[1] : '';
  if (notMatch) selector = selector.slice(0, notMatch.index);
  const tagMatch = selector.match(/^[A-Za-z][A-Za-z0-9-]*/);
  const tag = tagMatch ? tagMatch[0].toUpperCase() : '';
  const classes = Array.from(selector.matchAll(/\.([A-Za-z0-9_-]+)/g), (match) => match[1]);
  if (tag && node.tagName !== tag) return false;
  if (classes.some((name) => !node.classList.contains(name))) return false;
  if (forbiddenClass && node.classList.contains(forbiddenClass)) return false;
  return Boolean(tag || classes.length);
}

class FakeElement {
  constructor(tagName, htmlWrites) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.className = '';
    this.id = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = Object.create(null);
    this._textContent = '';
    this._innerHTML = '';
    this.htmlWrites = htmlWrites;
    this.offsetParent = this;
    const element = this;
    this.classList = {
      contains(name) {
        return element.className.split(/\s+/).filter(Boolean).includes(name);
      },
      add(...names) {
        const classes = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        element.className = Array.from(classes).join(' ');
      },
      remove(...names) {
        const removed = new Set(names);
        element.className = element.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' ');
      },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !this.contains(name) : Boolean(force);
        if (shouldAdd) this.add(name);
        else this.remove(name);
        return shouldAdd;
      },
    };
  }

  appendChild(child) {
    // Real DOM appendChild moves an existing node; a push-only fake would
    // duplicate cards during catalogue sort and hide the snapshot bug.
    if (child.parentNode && Array.isArray(child.parentNode.children)) {
      const siblings = child.parentNode.children;
      const index = siblings.indexOf(child);
      if (index !== -1) siblings.splice(index, 1);
    }
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
    this._innerHTML = '';
    children.forEach((child) => this.appendChild(child));
  }

  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    if (index === -1) return previous;
    previous.parentNode = null;
    previous.parentElement = null;
    next.parentNode = this;
    next.parentElement = this;
    this.children[index] = next;
    return previous;
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
    this._textContent = '';
    this.children = [];
    if (this._innerHTML) this.htmlWrites.push(this._innerHTML);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes[name] = stringValue;
    if (name === 'class') this.className = stringValue;
    if (name === 'id') this.id = stringValue;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
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
      stopPropagation() {},
      preventDefault() {},
      ...event,
    };
    (this.listeners[type] || []).forEach((listener) => listener.call(this, payload));
  }

  click() {
    this.dispatch('click');
  }

  querySelectorAll(selector) {
    if (selector.includes(',')) return [];
    const results = [];
    (function visit(node) {
      node.children.forEach((child) => {
        if (matchesSimpleSelector(child, selector)) results.push(child);
        visit(child);
      });
    }(this));
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  focus() {}
  scrollBy() {}
  scrollTo() {}
  getBoundingClientRect() { return { top: 0, left: 0 }; }
}

function element(tag, htmlWrites, className, text) {
  const node = new FakeElement(tag, htmlWrites);
  node.className = className || '';
  if (text !== undefined) node.textContent = text;
  return node;
}

function descendants(root) {
  const result = [];
  (function visit(node) {
    node.children.forEach((child) => {
      result.push(child);
      visit(child);
    });
  }(root));
  return result;
}

function unsafeAttributeSurface(root) {
  return descendants(root).flatMap((node) => Object.entries(node.attributes)).filter(([name, value]) => (
    /^on/i.test(name) || ((name === 'src' || name === 'href') && /^(?:javascript|data):/i.test(value))
  ));
}

function runKittenCarousel(items) {
  const htmlWrites = [];
  const mount = element('div', htmlWrites, 'kitten-carousel-mount');
  const head = element('head', htmlWrites);
  const listeners = Object.create(null);
  const document = {
    head,
    createElement(tag) { return new FakeElement(tag, htmlWrites); },
    createTextNode(value) { return element('#text', htmlWrites, '', value); },
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
  const context = vm.createContext({
    document,
    window: {
      FULUCK_API_BASE: 'https://api.example.test',
      FULUCK_CATALOG_I18N: null,
      FuluckKittenCatalog: KittenCatalog,
      location: { pathname: '/blog/security.html' },
      addEventListener(type, listener) { listeners[type] = listener; },
    },
    localStorage: { getItem() { return 'ja'; } },
    fetch() {
      return Promise.resolve({ ok: true, json: async () => items });
    },
    URL,
    console: { warn() {} },
    setInterval() { return 1; },
    clearInterval() {},
  });
  vm.runInContext(CAROUSEL_SOURCE, context, { filename: 'kitten-carousel.js' });
  return { mount, htmlWrites, listeners };
}

function makeCatalogCard(htmlWrites, data) {
  const card = element('article', htmlWrites, 'kitten-card');
  card.dataset = {
    images: '',
    video: '',
    driveFolder: '',
    name: data.breederId,
    status: data.status || 'available',
    new: 'false',
    promotionTag: data.promotionTag || '',
    promotionPriority: data.promotionPriority == null ? '' : String(data.promotionPriority),
    papa: '',
    mama: '',
    breederId: data.breederId,
    detailUrl: '',
    price: String(data.price),
    birthday: data.birthday || '2026-06',
  };
  card.appendChild(element('h3', htmlWrites, '', 'サイベリアン'));
  card.appendChild(element('p', htmlWrites, 'kit-meta', '男の子 ・ ブルー'));
  card.appendChild(element('p', htmlWrites, 'kit-price', '¥' + data.price + '（税込）'));
  return card;
}

function catalogIds(grid) {
  return grid.children
    .filter((child) => child.classList.contains('kitten-card'))
    .map((child) => child.dataset.breederId);
}

function makeModal(htmlWrites, id) {
  const modal = element('div', htmlWrites, 'modal-overlay');
  modal.id = id;
  modal.appendChild(element('button', htmlWrites, 'modal-close'));
  modal.appendChild(element('div', htmlWrites, 'modal-gallery'));
  if (id === 'kittenModal') {
    modal.appendChild(element('div', htmlWrites, 'modal-info'));
  } else {
    modal.appendChild(element('h2', htmlWrites, 'modal-name'));
    modal.appendChild(element('span', htmlWrites, 'parent-role'));
    modal.appendChild(element('div', htmlWrites, 'modal-details'));
    modal.appendChild(element('div', htmlWrites, 'children-chips'));
  }
  return modal;
}

function runMainScript(options = {}) {
  const htmlWrites = [];
  const kittenModal = makeModal(htmlWrites, 'kittenModal');
  const parentModal = makeModal(htmlWrites, 'parentModal');
  const catalogCards = options.catalogCards
    ? options.catalogCards.map((data) => makeCatalogCard(htmlWrites, data))
    : null;
  const kittenCard = catalogCards ? catalogCards[0] : element('article', htmlWrites, 'kitten-card');
  if (!catalogCards) {
    kittenCard.dataset = {
      images: options.kittenImages || '',
      video: options.kittenVideo || '',
      driveFolder: '',
      name: options.kittenName || '',
      status: options.kittenStatus || 'available',
      new: options.isNew === false ? 'false' : 'true',
      promotionTag: options.promotionTag || '',
      papa: options.papa || '',
      mama: options.mama || '',
      breederId: options.breederId || '',
      detailUrl: options.detailUrl || '',
      price: options.priceData === undefined ? '220000' : options.priceData,
    };
    kittenCard.appendChild(element('h3', htmlWrites, '', options.breed || 'サイベリアン'));
    kittenCard.appendChild(element('p', htmlWrites, 'kit-meta', options.meta || '男の子 ・ ブルー'));
    kittenCard.appendChild(element('p', htmlWrites, 'kit-meta', options.birthday || '2026年5月'));
    kittenCard.appendChild(element('p', htmlWrites, 'kit-price', options.price || '¥220,000（税込）'));
  }

  const kittensGrid = element('div', htmlWrites);
  kittensGrid.id = 'kittensGrid';
  (catalogCards || [kittenCard]).forEach((card) => kittensGrid.appendChild(card));

  const sortDefault = element('button', htmlWrites, 'sort-btn active');
  sortDefault.dataset.sort = 'default';
  const sortPriceAsc = element('button', htmlWrites, 'sort-btn');
  sortPriceAsc.dataset.sort = 'price-asc';
  const sortButtons = catalogCards ? [sortDefault, sortPriceAsc] : [];

  const filterAll = element('button', htmlWrites, 'filter-btn active');
  filterAll.dataset.filter = 'all';
  const filterAvailable = element('button', htmlWrites, 'filter-btn');
  filterAvailable.dataset.filter = 'available';
  const filterButtons = catalogCards ? [filterAll, filterAvailable] : [];

  const parentCard = element('article', htmlWrites, 'parent-card');
  parentCard.dataset = {
    name: options.parentName || 'しろくん',
    breed: options.parentBreed || 'サイベリアン',
    gender: Object.prototype.hasOwnProperty.call(options, 'parentGender') ? options.parentGender : '♂',
    role: Object.prototype.hasOwnProperty.call(options, 'parentRole') ? options.parentRole : 'パパ猫',
    age: options.parentAge || '3歳',
    color: options.parentColor || 'ホワイト',
    tested: 'true',
    images: options.parentImages || '',
    driveFolder: '',
  };
  const defaultOffspring = (options.papa === parentCard.dataset.name || options.mama === parentCard.dataset.name)
    ? [{
        breederId: options.breederId || '',
        papa: options.papa || '',
        mama: options.mama || '',
        breed: options.breed || 'サイベリアン',
        color: options.meta || '',
        birthday: options.birthday || '',
        status: options.kittenStatus || 'available',
      }]
    : [];
  const offspring = options.apiKittens === undefined ? defaultOffspring : options.apiKittens;

  const events = Object.create(null);
  const querySelectors = [];
  const document = {
    documentElement: { lang: options.lang || 'ja', scrollTop: 0, scrollHeight: 1, clientHeight: 1 },
    body: { style: {} },
    activeElement: null,
    createElement(tag) { return new FakeElement(tag, htmlWrites); },
    createTextNode(value) { return element('#text', htmlWrites, '', value); },
    getElementById(id) {
      if (id === 'kittenModal') return kittenModal;
      if (id === 'parentModal') return parentModal;
      if (id === 'modalClose') return kittenModal.querySelector('.modal-close');
      if (id === 'parentModalClose') return parentModal.querySelector('.modal-close');
      if (id === 'kittensGrid') return catalogCards ? kittensGrid : null;
      return null;
    },
    querySelector(selector) {
      querySelectors.push(selector);
      if (selector === '.page-hero') return options.pageHero ? {} : null;
      if (selector.startsWith('.parent-card[data-name=')) return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.kitten-card' || selector === '.kitten-card:not(.hidden)') {
        const cards = catalogCards
          ? kittensGrid.querySelectorAll('.kitten-card')
          : [kittenCard];
        if (selector.endsWith(':not(.hidden)')) {
          return cards.filter((card) => !card.classList.contains('hidden'));
        }
        return cards;
      }
      if (selector === '.sort-btn') return sortButtons;
      if (selector === '.filter-btn') return filterButtons;
      if (selector === '.parent-card') return [parentCard];
      if (selector.startsWith('.kitten-card[data-')) {
        return catalogCards ? kittensGrid.querySelectorAll('.kitten-card') : [kittenCard];
      }
      return [];
    },
    addEventListener(type, listener) {
      if (!events[type]) events[type] = [];
      events[type].push(listener);
    },
  };
  const windowEvents = Object.create(null);
  const window = {
    DriveLoader: options.driveLoader,
    FULUCK_API_BASE: 'https://api.example.test',
    FuluckKittenCatalog: KittenCatalog,
    FuluckPublicData: {
      kittenRequests: {
        'https://api.example.test/api/kittens': Promise.resolve(offspring),
      },
    },
    location: { pathname: options.pathname || '/index.html', hash: options.hash || '', href: '' },
    scrollY: 0,
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener(type, listener) {
      if (!windowEvents[type]) windowEvents[type] = [];
      windowEvents[type].push(listener);
    },
    dispatchEvent(event) {
      const type = event && event.type;
      (windowEvents[type] || []).forEach((listener) => listener.call(window, event));
    },
    scrollTo() {},
  };
  class FakeObserver {
    observe() {}
    unobserve() {}
  }
  const context = vm.createContext({
    document,
    window,
    IntersectionObserver: FakeObserver,
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    decodeURIComponent,
    encodeURIComponent,
    URL,
    console: { log() {}, warn() {} },
  });
  vm.runInContext(SCRIPT_SOURCE, context, { filename: 'script.js' });
  assert.ok(events.DOMContentLoaded && events.DOMContentLoaded.length === 1, 'main script must register once');
  events.DOMContentLoaded[0]();
  return {
    htmlWrites,
    kittenCard,
    kittenCards: catalogCards || [kittenCard],
    kittensGrid,
    sortPriceAsc,
    filterAvailable,
    parentCard,
    kittenModal,
    parentModal,
    window,
    querySelectors,
  };
}

test('kitten carousel renders hostile API text literally and rejects unsafe photo and id URLs', async () => {
  const marker = 'CAROUSEL_PAYLOAD_MARKER';
  const result = runKittenCarousel([{
    breederId: `bad\" onclick=\"${marker}`,
    breed: `<img src=x onerror=${marker}>`,
    gender: '♂',
    color: `<svg onload=${marker}>`,
    price: 220000,
    status: 'available',
    isNew: true,
    photos: ['https://images.example.test/cat.webp'],
    coverIndex: 0,
  }, {
    breederId: 'safe-id',
    breed: 'サイベリアン',
    gender: '♀',
    color: 'ブルー',
    price: 200000,
    status: 'available',
    photos: [`javascript:${marker}`],
  }]);
  await flushAsyncWork();

  assert.deepEqual(result.htmlWrites.filter((value) => value.includes(marker)), [], 'API values must not enter innerHTML');
  assert.match(result.mount.textContent, new RegExp(marker), 'hostile labels remain visible as literal text');
  assert.deepEqual(unsafeAttributeSurface(result.mount), []);
  const links = descendants(result.mount).filter((node) => node.tagName === 'A' && node.classList.contains('kc-card'));
  const images = descendants(result.mount).filter((node) => node.tagName === 'IMG');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), '/kittens.html', 'invalid IDs use the safe catalogue fallback');
  assert.equal(images.length, 1, 'unsafe photo protocols are not rendered');
  assert.equal(images[0].getAttribute('src'), 'https://images.example.test/cat.webp');
  assert.ok(result.mount.querySelector('.kc-prev').listeners.click.length, 'normal carousel controls remain wired');
});

test('kitten modal uses text nodes and protocol-checked media for card-backed fields', async () => {
  const marker = 'KITTEN_MODAL_PAYLOAD_MARKER';
  const result = runMainScript({
    kittenImages: `javascript:${marker},https://images.example.test/safe.webp`,
    kittenVideo: `<iframe src=\"https://evil.example.test/embed/${marker}\"></iframe>`,
    kittenName: `<img src=x onerror=${marker}>`,
    breed: `<svg onload=${marker}>`,
    meta: `♂ ・ <img src=x onerror=${marker}>`,
    birthday: `<script>${marker}</script>`,
    price: `¥1</span><img src=x onerror=${marker}>（税込）`,
    papa: `papa\" onclick=\"${marker}`,
    mama: `<svg onload=${marker}>`,
    breederId: `<img src=x onerror=${marker}>`,
  });
  result.kittenCard.click();
  await flushAsyncWork();

  assert.deepEqual(result.htmlWrites.filter((value) => value.includes(marker)), [], 'card-backed values must not enter innerHTML');
  assert.match(result.kittenModal.textContent, new RegExp(marker), 'hostile labels remain literal text');
  assert.deepEqual(unsafeAttributeSurface(result.kittenModal), []);
  const images = descendants(result.kittenModal).filter((node) => node.tagName === 'IMG');
  const frames = descendants(result.kittenModal).filter((node) => node.tagName === 'IFRAME');
  assert.equal(images.length, 2, 'one safe image is rendered in the slide and thumbnail');
  assert.ok(images.every((node) => node.getAttribute('src') === 'https://images.example.test/safe.webp'));
  assert.equal(frames.length, 0, 'non-YouTube embeds are rejected');
  assert.equal(result.kittenModal.querySelector('.kit-status').textContent, '販売中');
  assert.ok(result.kittenModal.querySelector('.modal-parents'), 'normal parent section remains present');
  assert.ok(result.kittenModal.querySelector('.modal-actions'), 'normal booking action remains present');
  assert.doesNotMatch(
    result.kittenModal.textContent,
    /1回接種済み|PKD\(-\)|HCM\(-\)|ワクチン接種済|遺伝子検査済|健康診断済|駆虫済み/,
    'individual medical claims require per-kitten owner data',
  );
});

test('kitten modal follows the active document language instead of publishing Japanese UI on localized pages', () => {
  const cases = [{
    lang: 'en',
    expected: ['Available', 'Breed', 'Sex', 'Color', 'Birthday', 'Listing ID', 'Parents', 'Dad', 'Mom',
      'In-Person Sales under the Animal Protection Law', 'Ask about this kitten on LINE', 'Book a Visit'],
  }, {
    lang: 'zh-CN',
    expected: ['可预约', '品种', '性别', '毛色', '生日', '刊登ID', '父母猫', '爸爸', '妈妈',
      '依据《动物爱护管理法》的面对面销售', '通过LINE咨询这只猫咪', '预约见学'],
  }];

  for (const entry of cases) {
    const result = runMainScript({
      lang: entry.lang,
      papa: 'PAPA-01',
      mama: 'MAMA-01',
      breederId: 'KIT-01',
    });
    result.kittenCard.click();
    const text = result.kittenModal.textContent;
    entry.expected.forEach((label) => assert.match(text, new RegExp(label), `${entry.lang}: ${label}`));
    assert.doesNotMatch(
      text,
      /販売中|猫種|性別|カラー|誕生日|掲載ID|両親|パパ|ママ|動物愛護管理法に基づく対面販売|この子についてLINEで相談|見学を予約/,
      `${entry.lang} modal must not fall back to Japanese labels`,
    );
  }
});

test('featured kitten modal shows localized recommendation instead of NEW', () => {
  const cases = [
    ['ja', 'おすすめ'],
    ['en', 'Featured'],
    ['zh', '推荐'],
  ];

  for (const [lang, expected] of cases) {
    const result = runMainScript({ lang, promotionTag: 'featured', isNew: true });
    result.kittenCard.click();
    const status = result.kittenModal.querySelector('.modal-status-row');
    const promotion = status.querySelector('.kitten-promotion-chip');

    assert.ok(promotion, lang);
    assert.equal(promotion.textContent, expected, lang);
    assert.equal(promotion.getAttribute('data-promotion-tag'), 'featured', lang);
    assert.equal(status.querySelector('.kit-badge-new'), null, lang);
  }
});

test('unpriced kitten inquiry copy never receives a tax-included suffix', () => {
  const cases = [
    { lang: 'ja', price: '価格はお問い合わせください', tax: '（税込）' },
    { lang: 'en', price: 'Please ask for the current price', tax: '(tax incl.)' },
    { lang: 'zh', price: '价格请咨询', tax: '（含税）' },
  ];
  for (const entry of cases) {
    const result = runMainScript({ lang: entry.lang, price: entry.price, priceData: '' });
    result.kittenCard.click();
    const row = result.kittenModal.querySelector('.modal-price-row');
    assert.ok(row, `${entry.lang} keeps the inquiry price row`);
    assert.equal(row.querySelector('.modal-price').textContent, entry.price);
    assert.doesNotMatch(row.textContent, new RegExp(entry.tax.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(row.querySelector('.tax'), null);
  }
});

test('parent modal and kitten navigation localize neutral facts without inventing named medical results', async () => {
  const cases = [{
    lang: 'en',
    expected: ['Father', 'Breed', 'Sex', 'Color', 'Age', 'Test information', 'Test information recorded', 'No kittens are currently displayed'],
    previous: 'Previous',
    next: 'Next',
  }, {
    lang: 'zh',
    expected: ['父猫', '品种', '性别', '毛色', '年龄', '检测信息', '已登记检测信息', '目前没有显示中的幼猫'],
    previous: '上一只',
    next: '下一只',
  }];

  for (const entry of cases) {
    const result = runMainScript({ lang: entry.lang, parentName: 'Parent-01' });
    result.kittenCard.click();
    assert.match(result.kittenModal.querySelector('.modal-kitten-prev').textContent, new RegExp(entry.previous));
    assert.match(result.kittenModal.querySelector('.modal-kitten-next').textContent, new RegExp(entry.next));
    await result.window.openParentModal(result.parentCard);
    const text = result.parentModal.textContent;
    entry.expected.forEach((label) => assert.match(text, new RegExp(label), `${entry.lang}: ${label}`));
    assert.doesNotMatch(text, /PKD|HCM|検査済み|検査予定|猫種|性別|カラー|年齢|現在表示中の子猫はいません/);
  }
});

test('parent modal renders remote parent and child fields safely without losing normal details', async () => {
  const marker = 'PARENT_MODAL_PAYLOAD_MARKER';
  const result = runMainScript({
    parentName: `<img src=x onerror=${marker}>`,
    parentBreed: `<svg onload=${marker}>`,
    parentRole: `papa\" onclick=\"${marker}`,
    parentAge: `<script>${marker}</script>`,
    parentColor: `<img src=x onerror=${marker}>`,
    parentImages: `data:image/svg+xml,<svg onload=${marker}>,https://images.example.test/parent.webp`,
    papa: `<img src=x onerror=${marker}>`,
    breed: `<img src=x onerror=${marker}>child`,
    meta: `<svg onload=${marker}>child meta`,
    kittenStatus: 'available',
  });
  await result.window.openParentModal(result.parentCard);

  assert.deepEqual(result.htmlWrites.filter((value) => value.includes(marker)), [], 'parent and child values must not enter innerHTML');
  assert.match(result.parentModal.textContent, new RegExp(marker), 'hostile parent labels remain literal text');
  assert.deepEqual(unsafeAttributeSurface(result.parentModal), []);
  const images = descendants(result.parentModal).filter((node) => node.tagName === 'IMG');
  assert.equal(images.length, 1, 'the safe parent image is rendered while the single-image UI keeps thumbnails hidden');
  assert.ok(images.every((node) => node.getAttribute('src') === 'https://images.example.test/parent.webp'));
  assert.ok(result.parentModal.querySelector('.detail-row'));
  assert.ok(result.parentModal.querySelector('.child-chip'));
  assert.equal(result.parentModal.querySelector('.parent-role').classList.contains('role-papa'), true);
});

test('parent hash lookup compares decoded names without constructing a CSS selector', async () => {
  const hostileName = `name\"] .kitten-card, [data-x=\"hash-selector-marker`;
  const result = runMainScript({
    hash: '#parent-' + encodeURIComponent(hostileName),
    parentName: hostileName,
  });
  await flushAsyncWork();

  assert.equal(result.querySelectors.some((selector) => selector.startsWith('.parent-card[data-name=')), false);
  assert.equal(result.parentModal.querySelector('.modal-name').textContent, hostileName);
});

test('homepage kitten and parent cards expose button semantics and support Enter and Space', async () => {
  const result = runMainScript();

  for (const card of [result.kittenCard, result.parentCard]) {
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.getAttribute('aria-haspopup'), 'dialog');
  }

  result.kittenCard.dispatch('keydown', { key: 'Enter' });
  assert.equal(result.kittenModal.classList.contains('active'), true, 'Enter opens the kitten modal');

  let prevented = 0;
  result.parentCard.dispatch('keydown', {
    key: ' ',
    preventDefault() { prevented += 1; },
  });
  await flushAsyncWork();
  assert.equal(prevented, 1, 'Space does not scroll the page');
  assert.equal(result.parentModal.classList.contains('active'), true, 'Space opens the parent modal');
});

test('listing kitten cards expose link semantics for real details and keep sold cards modal-only', () => {
  const available = runMainScript({
    pageHero: true,
    pathname: '/kittens.html',
    breederId: 'safe-kitten',
    detailUrl: '/kittens/safe-kitten.html',
  });
  assert.equal(available.kittenCard.getAttribute('role'), 'link');
  assert.equal(available.kittenCard.getAttribute('tabindex'), '0');
  assert.equal(available.kittenCard.hasAttribute('aria-haspopup'), false);
  available.kittenCard.dispatch('keydown', { key: 'Enter' });
  assert.equal(available.window.location.href, '/kittens/safe-kitten.html');
  assert.equal(available.kittenModal.classList.contains('active'), false);

  const sold = runMainScript({
    pageHero: true,
    pathname: '/kittens.html',
    kittenStatus: 'sold',
    breederId: 'sold-kitten',
  });
  assert.equal(sold.kittenCard.getAttribute('role'), 'button');
  assert.equal(sold.kittenCard.getAttribute('tabindex'), '0');
  assert.equal(sold.kittenCard.getAttribute('aria-haspopup'), 'dialog');
  sold.kittenCard.dispatch('keydown', { key: 'Enter' });
  assert.equal(sold.window.location.href, '', 'sold cards never navigate to a removed detail page');
  assert.equal(sold.kittenModal.classList.contains('active'), true);
});

test('rebindCards is idempotent for keyboard and pointer activation handlers', () => {
  const result = runMainScript();
  let parentOpens = 0;
  result.window.openParentModal = () => { parentOpens += 1; };

  result.window.rebindCards();
  result.window.rebindCards();
  result.parentCard.click();
  assert.equal(parentOpens, 1, 'one click activation fires exactly once after repeated rebinds');

  result.parentCard.dispatch('keydown', { key: 'Enter' });
  assert.equal(parentOpens, 2, 'one keyboard activation fires exactly once after repeated rebinds');
});

const PRICE_ASC_CARDS = [
  { breederId: '2604-02563', price: 100000, birthday: '2026-07' },
  { breederId: '2605-02526', price: 100000, birthday: '2026-06' },
  { breederId: '2608-52935', price: 270000, birthday: '2026-05' },
  { breederId: '2603-02736', price: 200000, birthday: '2026-04' },
];

function openThenStep(result, startCard, direction, count) {
  startCard.click();
  const button = result.kittenModal.querySelector(direction === 'next' ? '.modal-kitten-next' : '.modal-kitten-prev');
  const names = [result.kittenModal.querySelector('.modal-name').textContent];
  for (let step = 0; step < count; step += 1) {
    button.dispatch('click', { stopPropagation() {} });
    names.push(result.kittenModal.querySelector('.modal-name').textContent);
  }
  return names;
}

test('price-asc sort handler then Next/Prev follow the live DOM, not the bind snapshot', () => {
  const result = runMainScript({ catalogCards: PRICE_ASC_CARDS });
  assert.deepEqual(catalogIds(result.kittensGrid), ['2604-02563', '2605-02526', '2608-52935', '2603-02736']);

  result.sortPriceAsc.click();
  assert.deepEqual(
    catalogIds(result.kittensGrid),
    ['2604-02563', '2605-02526', '2603-02736', '2608-52935'],
    'price-asc is not the original neighbour order',
  );

  const names = openThenStep(result, result.kittenCards[0], 'next', 2);
  assert.deepEqual(names, ['2604-02563', '2605-02526', '2603-02736']);
  assert.notEqual(names[2], '2608-52935');

  const lastAfterSort = result.kittenCards.find((card) => card.dataset.breederId === '2608-52935');
  const back = openThenStep(result, lastAfterSort, 'prev', 2);
  assert.deepEqual(back, ['2608-52935', '2603-02736', '2605-02526']);
});

test('cardsLoaded re-sorts then Next follows the post-refresh DOM order', () => {
  const result = runMainScript({ catalogCards: PRICE_ASC_CARDS });
  result.sortPriceAsc.click();
  result.kittensGrid.children
    .filter((child) => child.classList.contains('kitten-card'))
    .slice()
    .reverse()
    .forEach((card) => result.kittensGrid.appendChild(card));
  result.window.bindKittenCards();

  result.window.dispatchEvent({ type: 'cardsLoaded' });
  assert.deepEqual(catalogIds(result.kittensGrid), ['2604-02563', '2605-02526', '2603-02736', '2608-52935']);

  const names = openThenStep(result, result.kittenCards[0], 'next', 2);
  assert.deepEqual(names, ['2604-02563', '2605-02526', '2603-02736']);
});

test('modal Next skips filtered hidden cards after a live reorder', () => {
  const result = runMainScript({
    catalogCards: [
      { breederId: '2604-02563', price: 100000, status: 'available', birthday: '2026-07' },
      { breederId: '2605-02526', price: 100000, status: 'reserved', birthday: '2026-06' },
      { breederId: '2608-52935', price: 270000, status: 'available', birthday: '2026-05' },
      { breederId: '2603-02736', price: 200000, status: 'available', birthday: '2026-04' },
    ],
  });
  result.sortPriceAsc.click();
  result.filterAvailable.click();
  assert.equal(result.kittenCards[1].classList.contains('hidden'), true);

  const names = openThenStep(result, result.kittenCards[0], 'next', 1);
  assert.deepEqual(names, ['2604-02563', '2603-02736']);
});

test('repeated bindKittenCards after sort keeps a single click and keydown handler', () => {
  const result = runMainScript({ catalogCards: PRICE_ASC_CARDS });
  result.sortPriceAsc.click();
  result.window.bindKittenCards();
  result.window.bindKittenCards();
  const card = result.kittenCards[0];
  assert.equal((card.listeners.click || []).length, 1);
  assert.equal((card.listeners.keydown || []).length, 1);
  card.click();
  card.click();
  assert.equal(result.kittenModal.classList.contains('active'), true);
});

test('parent modal uses standard role when gender is missing and does not impersonate mother', async () => {
  const cases = [
    { lang: 'ja', role: 'パパ猫', text: 'パパ猫', tone: 'role-papa' },
    { lang: 'en', role: 'パパ猫', text: 'Father', tone: 'role-papa' },
    { lang: 'zh', role: 'パパ猫', text: '父猫', tone: 'role-papa' },
    { lang: 'ja', role: 'ママ猫', text: 'ママ猫', tone: 'role-mama' },
    { lang: 'en', role: 'ママ猫', text: 'Mother', tone: 'role-mama' },
    { lang: 'zh', role: 'ママ猫', text: '母猫', tone: 'role-mama' },
  ];
  for (const entry of cases) {
    const result = runMainScript({
      lang: entry.lang,
      parentGender: '',
      parentRole: entry.role,
      parentName: 'Parent-01',
    });
    await result.window.openParentModal(result.parentCard);
    const roleEl = result.parentModal.querySelector('.parent-role');
    assert.equal(roleEl.textContent, entry.text, `${entry.lang} ${entry.role} label`);
    assert.equal(roleEl.classList.contains(entry.tone), true, `${entry.lang} ${entry.role} class`);
    assert.equal(roleEl.classList.contains(entry.tone === 'role-papa' ? 'role-mama' : 'role-papa'), false);
    await result.window.openParentModal(result.parentCard);
    assert.equal(roleEl.textContent, entry.text, `${entry.lang} reopen`);
    assert.equal(roleEl.classList.contains(entry.tone), true);
  }
});

test('unknown or retired roles stay neutral without gender, and valid gender wins over role', async () => {
  const unknown = runMainScript({ lang: 'en', parentGender: '', parentRole: 'スタッフ', parentName: 'Staff-01' });
  await unknown.window.openParentModal(unknown.parentCard);
  const unknownRole = unknown.parentModal.querySelector('.parent-role');
  assert.equal(unknownRole.textContent, 'スタッフ');
  assert.equal(unknownRole.classList.contains('role-neutral'), true);
  assert.equal(unknownRole.classList.contains('role-mama'), false);
  assert.equal(unknownRole.classList.contains('role-papa'), false);

  const retired = runMainScript({ lang: 'en', parentGender: '', parentRole: '過去の実績', parentName: 'Retired-01' });
  await retired.window.openParentModal(retired.parentCard);
  const retiredRole = retired.parentModal.querySelector('.parent-role');
  assert.equal(retiredRole.textContent, 'Past breeding record');
  assert.equal(retiredRole.classList.contains('role-neutral'), true);
  assert.equal(retiredRole.classList.contains('role-mama'), false);

  const fatherWins = runMainScript({ lang: 'zh', parentGender: '♂', parentRole: 'ママ猫', parentName: 'Dad-01' });
  await fatherWins.window.openParentModal(fatherWins.parentCard);
  const fatherRole = fatherWins.parentModal.querySelector('.parent-role');
  assert.equal(fatherRole.textContent, '父猫');
  assert.equal(fatherRole.classList.contains('role-papa'), true);

  const motherWins = runMainScript({ lang: 'en', parentGender: '♀', parentRole: 'パパ猫', parentName: 'Mom-01' });
  await motherWins.window.openParentModal(motherWins.parentCard);
  const motherRole = motherWins.parentModal.querySelector('.parent-role');
  assert.equal(motherRole.textContent, 'Mother');
  assert.equal(motherRole.classList.contains('role-mama'), true);

  const retiredFather = runMainScript({ lang: 'ja', parentGender: '♂', parentRole: '過去の実績', parentName: 'Retired-Dad' });
  await retiredFather.window.openParentModal(retiredFather.parentCard);
  const retiredFatherRole = retiredFather.parentModal.querySelector('.parent-role');
  assert.equal(retiredFatherRole.textContent, '過去の実績');
  assert.equal(retiredFatherRole.classList.contains('role-papa'), true);
});


test('late Drive photos cannot replace the currently opened kitten gallery', async () => {
  let resolveA;
  const aPhotos = new Promise(resolve => { resolveA = resolve; });
  const harness = runMainScript({
    catalogCards: [{ breederId: 'A', price: 100 }, { breederId: 'B', price: 200 }],
    driveLoader: { loadCardImages() { return aPhotos; } },
  });
  const [a, b] = harness.kittenCards;
  a.dataset.driveFolder = 'folderA';
  b.dataset.images = '/images/kitten-b.jpg';
  a.dispatch('click');
  b.dispatch('click');
  resolveA('/images/kitten-a.jpg');
  await flushAsyncWork();
  const images = harness.kittenModal.querySelector('.modal-gallery').querySelectorAll('img');
  assert.ok(images.length > 0);
  assert.ok(images.every(img => img.getAttribute('src') === '/images/kitten-b.jpg'));
});

test('a rejected Drive photo load exits loading state without an unhandled rejection', async () => {
  const harness = runMainScript({ driveLoader: { loadCardImages() { return Promise.reject(new Error('offline')); } } });
  harness.kittenCard.dataset.driveFolder = 'folderA';
  harness.kittenCard.dispatch('click');
  await flushAsyncWork();
  const gallery = harness.kittenModal.querySelector('.modal-gallery');
  assert.doesNotMatch(gallery.textContent, /読み込み中/);
  assert.ok(gallery.querySelector('.carousel-slide'));
});

test('reordering while a kitten is open preserves that kitten as the navigation anchor', () => {
  const result = runMainScript({ catalogCards: PRICE_ASC_CARDS });
  result.kittenCards.find(card => card.dataset.breederId === '2603-02736').click();
  result.sortPriceAsc.click();
  result.kittenModal.querySelector('.modal-kitten-next').click();
  assert.equal(result.kittenModal.querySelector('.modal-name').textContent, '2608-52935');
});

test('late parent photos cannot overwrite a newer parent or its details', async () => {
  let finish;
  const photos = new Promise(resolve => { finish = resolve; });
  const result = runMainScript({ driveLoader: { loadCardImages() { return photos; } } });
  const a = result.parentCard;
  a.dataset.driveFolder = 'folderA';
  const first = result.window.openParentModal(a);
  const b = element('article', result.htmlWrites, 'parent-card');
  b.dataset = { ...a.dataset, name: 'Parent B', driveFolder: '', images: '/images/parent-b.jpg' };
  await result.window.openParentModal(b);
  finish('/images/parent-a.jpg');
  await first;
  assert.equal(result.parentModal.querySelector('.modal-name').textContent, 'Parent B');
  const images = result.parentModal.querySelector('.modal-gallery').querySelectorAll('img');
  assert.ok(images.length > 0);
  assert.ok(images.every(img => img.getAttribute('src') === '/images/parent-b.jpg'));
});

test('parent modal remains usable when Drive photo loading fails', async () => {
  const result = runMainScript({ driveLoader: { loadCardImages() { return Promise.reject(new Error('offline')); } } });
  result.parentCard.dataset.driveFolder = 'folderA';
  await result.window.openParentModal(result.parentCard);
  assert.ok(result.parentModal.classList.contains('active'));
  assert.doesNotMatch(result.parentModal.querySelector('.modal-gallery').textContent, /読み込み中/);
});
