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
  const kittenCard = element('article', htmlWrites, 'kitten-card');
  kittenCard.dataset = {
    images: options.kittenImages || '',
    video: options.kittenVideo || '',
    driveFolder: '',
    name: options.kittenName || '',
    status: options.kittenStatus || 'available',
    new: 'true',
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

  const parentCard = element('article', htmlWrites, 'parent-card');
  parentCard.dataset = {
    name: options.parentName || 'しろくん',
    breed: options.parentBreed || 'サイベリアン',
    gender: options.parentGender || '♂',
    role: options.parentRole || 'パパ猫',
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
      return null;
    },
    querySelector(selector) {
      querySelectors.push(selector);
      if (selector === '.page-hero') return options.pageHero ? {} : null;
      if (selector.startsWith('.parent-card[data-name=')) return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.kitten-card' || selector === '.kitten-card:not(.hidden)') return [kittenCard];
      if (selector === '.parent-card') return [parentCard];
      if (selector.startsWith('.kitten-card[data-')) return [kittenCard];
      return [];
    },
    addEventListener(type, listener) {
      if (!events[type]) events[type] = [];
      events[type].push(listener);
    },
  };
  const window = {
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
    addEventListener() {},
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
  return { htmlWrites, kittenCard, parentCard, kittenModal, parentModal, window, querySelectors };
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
