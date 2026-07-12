'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const PARENTS_SOURCE = fs.readFileSync(path.join(ROOT, 'parents.html'), 'utf8');
const API_URL = 'https://api.example.test/api/kittens';

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
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

function makeParentModal(htmlWrites) {
  const modal = element('div', htmlWrites, 'modal-overlay');
  modal.id = 'parentModal';
  const close = element('button', htmlWrites, 'modal-close');
  close.id = 'parentModalClose';
  modal.appendChild(close);
  modal.appendChild(element('div', htmlWrites, 'modal-gallery'));
  modal.appendChild(element('h2', htmlWrites, 'modal-name'));
  modal.appendChild(element('span', htmlWrites, 'parent-role'));
  modal.appendChild(element('div', htmlWrites, 'modal-details'));
  modal.appendChild(element('h3', htmlWrites, 'parent-offspring-heading'));
  const children = element('div', htmlWrites, 'children-chips');
  children.setAttribute('aria-live', 'polite');
  modal.appendChild(children);
  return modal;
}

function runParentPage(options = {}) {
  const htmlWrites = [];
  const parentModal = makeParentModal(htmlWrites);
  const parentCard = element('article', htmlWrites, 'parent-card');
  const parentGender = Object.prototype.hasOwnProperty.call(options, 'parentGender')
    ? options.parentGender
    : '♂';
  parentCard.dataset = {
    name: options.parentName || 'Father-01',
    breed: 'サイベリアン',
    gender: parentGender,
    role: parentGender === '♀' ? 'ママ猫' : 'パパ猫',
    age: '3歳',
    color: 'ホワイト',
    tested: 'true',
    images: '',
    driveFolder: '',
  };

  const events = Object.create(null);
  const document = {
    documentElement: {
      lang: options.lang || 'ja',
      scrollTop: 0,
      scrollHeight: 1,
      clientHeight: 1,
    },
    body: { style: {} },
    activeElement: null,
    createElement(tag) { return new FakeElement(tag, htmlWrites); },
    createTextNode(value) { return element('#text', htmlWrites, '', value); },
    getElementById(id) {
      if (id === 'parentModal') return parentModal;
      if (id === 'parentModalClose') return parentModal.querySelector('.modal-close');
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.parent-card') return [parentCard];
      if (selector === '.kitten-card' || selector === '.kitten-card:not(.hidden)') return [];
      return [];
    },
    addEventListener(type, listener) {
      if (!events[type]) events[type] = [];
      events[type].push(listener);
    },
  };

  let fetchCount = 0;
  const responseFactory = options.fetchResponse || (() => Promise.resolve({
    ok: true,
    json: async () => options.kittens || [],
  }));
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FuluckKittenCatalog: KittenCatalog,
    FuluckPublicData: options.sharedPromise ? {
      kittenRequests: { [API_URL]: options.sharedPromise },
    } : undefined,
    location: { pathname: options.pathname || '/parents.html', hash: '', href: '' },
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
    fetch() {
      fetchCount += 1;
      return responseFactory();
    },
    localStorage: { getItem() { return options.lang || 'ja'; } },
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
  assert.equal(events.DOMContentLoaded?.length, 1);
  events.DOMContentLoaded[0]();
  return {
    fetchCount: () => fetchCount,
    htmlWrites,
    parentCard,
    parentModal,
    window,
  };
}

test('parent modal reuses the shared kittens promise, then dedupes, matches and orders API offspring', async () => {
  const pending = deferred();
  const page = runParentPage({ sharedPromise: pending.promise });

  const opened = page.window.openParentModal(page.parentCard);
  const children = page.parentModal.querySelector('.children-chips');
  assert.equal(children.getAttribute('aria-busy'), 'true');
  assert.match(children.textContent, /子猫情報を読み込んでいます/);
  assert.equal(page.fetchCount(), 0, 'an existing page-level promise is reused');

  pending.resolve([
    { breederId: 'duplicate', papa: 'Father-01', breed: '古い重複', status: 'available', birthday: '2026-07-01' },
    { breederId: 'sold-record', papa: 'Father-01', breed: '卒業した子', status: 'sold', birthday: '2026-07-10' },
    { breederId: 'reserved-child', papa: 'Father-01', breed: '商談中の子', status: 'reserved', birthday: '2026-07-09' },
    { breederId: 'young-child', papa: 'Father-01', breed: '年幼の子', status: 'available', birthday: '2026-07-10' },
    { breederId: 'duplicate', papa: 'Father-01', breed: '最新の重複', status: 'available', birthday: '2025-01-01', promotionTag: 'featured', promotionPriority: 999 },
    { breederId: 'unsafe id', papa: 'Father-01', breed: 'リンクなしの子', status: 'available', birthday: '2026-01-01' },
    { breederId: 'near-match', papa: 'Father-01 ', breed: '誤一致してはいけない子', status: 'available', birthday: '2026-12-01' },
  ]);
  await opened;

  assert.equal(children.getAttribute('aria-busy'), 'false');
  const rows = children.children;
  assert.equal(rows.length, 5, 'last-write-wins dedupe and exact papa matching apply before render');
  assert.match(rows[0].textContent, /最新の重複/, 'promotion order is reused within available kittens');
  assert.match(rows[1].textContent, /年幼の子/, 'younger unpromoted kitten follows');
  assert.match(rows[2].textContent, /リンクなしの子/);
  assert.match(rows[3].textContent, /商談中の子/);
  assert.match(rows[4].textContent, /卒業した子/);
  assert.doesNotMatch(children.textContent, /古い重複|誤一致してはいけない子/);

  const links = rows.filter((row) => row.tagName === 'A');
  assert.deepEqual(
    links.map((link) => link.getAttribute('href')),
    ['/kittens/duplicate.html', '/kittens/young-child.html', '/kittens/reserved-child.html'],
    'only safe available/reserved identities receive real detail links',
  );
  assert.equal(rows[4].tagName, 'SPAN', 'sold offspring remains a non-clickable pedigree record');
});

test('a parent card without gender matches exact papa or mama names instead of defaulting to mama', async () => {
  const page = runParentPage({
    parentGender: '',
    parentName: 'Parent-01',
    kittens: [
      { breederId: 'father-child', papa: 'Parent-01', mama: 'Mother-02', breed: '父猫子代', status: 'available' },
      { breederId: 'mother-child', papa: 'Father-02', mama: 'Parent-01', breed: '母猫子代', status: 'available' },
      { breederId: 'near-match', papa: 'Parent-01 ', mama: '', breed: '近似名字', status: 'available' },
    ],
  });

  await page.window.openParentModal(page.parentCard);
  const children = page.parentModal.querySelector('.children-chips');
  assert.equal(children.children.length, 2);
  assert.match(children.textContent, /父猫子代/);
  assert.match(children.textContent, /母猫子代/);
  assert.doesNotMatch(children.textContent, /近似名字/);
});

test('offspring detail links preserve the active English or Chinese route', async () => {
  for (const { lang, href } of [
    { lang: 'en', href: '/en/kittens/child-01.html' },
    { lang: 'zh-CN', href: '/zh/kittens/child-01.html' },
  ]) {
    const page = runParentPage({
      lang,
      kittens: [{ breederId: 'child-01', papa: 'Father-01', breed: 'Kitten', status: 'available' }],
    });

    await page.window.openParentModal(page.parentCard);
    const child = page.parentModal.querySelector('.children-chips').children[0];
    assert.equal(child.getAttribute('href'), href, `${lang} remains in the detail route`);
  }
});

test('opening parent modals repeatedly issues one kittens request and localizes empty success', async () => {
  for (const entry of [
    { lang: 'en', empty: 'No kittens are currently displayed' },
    { lang: 'zh-CN', empty: '目前没有显示中的幼猫' },
  ]) {
    const page = runParentPage({ lang: entry.lang, kittens: [] });
    await page.window.openParentModal(page.parentCard);
    await page.window.openParentModal(page.parentCard);
    assert.equal(page.fetchCount(), 1, `${entry.lang} reuses the fulfilled page-level request`);
    assert.match(page.parentModal.querySelector('.children-chips').textContent, new RegExp(entry.empty));
  }
});

test('a rejected kittens request renders a localized error instead of a false empty result', async () => {
  for (const entry of [
    { lang: 'ja', error: '子猫情報を読み込めませんでした' },
    { lang: 'en', error: 'Unable to load kitten information' },
    { lang: 'zh', error: '幼猫信息加载失败' },
  ]) {
    const page = runParentPage({
      lang: entry.lang,
      fetchResponse: () => Promise.reject(new Error('offline')),
    });
    await page.window.openParentModal(page.parentCard);
    const children = page.parentModal.querySelector('.children-chips');
    assert.equal(children.getAttribute('aria-busy'), 'false');
    assert.match(children.textContent, new RegExp(entry.error));
  }
});

test('API offspring text stays literal and cannot create unsafe links or markup', async () => {
  const marker = 'OFFSPRING_REMOTE_PAYLOAD';
  const page = runParentPage({
    kittens: [{
      breederId: `bad id\" onclick=\"${marker}`,
      papa: 'Father-01',
      breed: `<img src=x onerror=${marker}>`,
      color: `<svg onload=${marker}>`,
      gender: '♂',
      status: 'available',
      birthday: '2026-07-01',
    }],
  });
  await page.window.openParentModal(page.parentCard);

  const children = page.parentModal.querySelector('.children-chips');
  assert.match(children.textContent, new RegExp(marker));
  assert.deepEqual(page.htmlWrites.filter((value) => value.includes(marker)), []);
  assert.equal(descendants(children).filter((node) => node.tagName === 'A').length, 0);
});

test('parents modal exposes a live offspring region and cache-busts the bridge script', () => {
  assert.match(PARENTS_SOURCE, /class="parent-offspring-heading"/);
  assert.match(PARENTS_SOURCE, /class="children-chips"[^>]*aria-live="polite"[^>]*aria-busy="false"/);
  assert.match(PARENTS_SOURCE, /script\.js\?v=20260712e/);
});
