'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const API_URL = 'https://api.example.test/api/kittens';

const CATALOG = {
  breeds: {
    en: { 'サイベリアン': 'Siberian' },
    zh: { 'サイベリアン': '西伯利亚猫' },
  },
  colors: {
    en: { 'ダイリュートキャリコ': 'Dilute Calico' },
    zh: { 'ダイリュートキャリコ': '淡三花' },
  },
};

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
  const children = element('div', htmlWrites, 'children-chips');
  children.setAttribute('aria-live', 'polite');
  modal.appendChild(children);
  return modal;
}

function runParentModal(options = {}) {
  const htmlWrites = [];
  const parentModal = makeParentModal(htmlWrites);
  const parentCard = element('article', htmlWrites, 'parent-card');
  parentCard.dataset = {
    name: 'Parent-01',
    breed: options.breed || 'サイベリアン',
    gender: '♂',
    role: 'パパ猫',
    age: options.age || '3歳6ヶ月',
    color: options.color || 'ダイリュートキャリコ',
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
      if (selector === '.page-hero') return null;
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

  class FakeObserver {
    observe() {}
    unobserve() {}
  }

  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    FULUCK_CATALOG_I18N: options.catalog === undefined ? CATALOG : options.catalog,
    FuluckKittenCatalog: KittenCatalog,
    FuluckPublicData: {
      kittenRequests: {
        [API_URL]: Promise.resolve([]),
      },
    },
    location: { pathname: '/parents.html', hash: '', href: '' },
    scrollY: 0,
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
    scrollTo() {},
  };

  const context = vm.createContext({
    document,
    window,
    fetch() {
      throw new Error('parent modal i18n tests must use the shared kittens promise');
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
  return { parentCard, parentModal, window };
}

function modalDetailValues(parentModal) {
  return parentModal.querySelectorAll('.detail-row').map((row) => row.querySelector('.detail-value').textContent);
}

async function renderParentDetails(options) {
  const page = runParentModal(options);
  await page.window.openParentModal(page.parentCard);
  return modalDetailValues(page.parentModal);
}

test('parent modal localizes breed, color, and age from the active document language', async () => {
  const cases = [
    { lang: 'ja', expected: ['サイベリアン', 'ダイリュートキャリコ', '3歳6ヶ月'] },
    { lang: 'zh', expected: ['西伯利亚猫', '淡三花', '3岁6个月'] },
    { lang: 'en', expected: ['Siberian', 'Dilute Calico', '3 years 6 months'] },
  ];

  for (const entry of cases) {
    const values = await renderParentDetails({ lang: entry.lang });
    assert.equal(values[0], entry.expected[0], `${entry.lang} breed`);
    assert.equal(values[2], entry.expected[1], `${entry.lang} color`);
    assert.equal(values[3], entry.expected[2], `${entry.lang} age`);
  }
});

test('parent modal leaves unmapped catalog values in the original Japanese text', async () => {
  const values = await renderParentDetails({ lang: 'zh', color: '未登録カラー' });
  assert.equal(values[0], '西伯利亚猫');
  assert.equal(values[2], '未登録カラー');
});

test('parent modal age renderer follows the Fable year and month rules', async () => {
  const cases = [
    { lang: 'zh', age: '3歳', expected: '3岁' },
    { lang: 'en', age: '3歳', expected: '3 years' },
    { lang: 'zh', age: '0歳7ヶ月', expected: '7个月' },
    { lang: 'en', age: '0歳7ヶ月', expected: '7 months' },
    { lang: 'en', age: '1歳1ヶ月', expected: '1 year 1 month' },
  ];

  for (const entry of cases) {
    const values = await renderParentDetails({ lang: entry.lang, age: entry.age });
    assert.equal(values[3], entry.expected, `${entry.lang} ${entry.age}`);
  }
});
