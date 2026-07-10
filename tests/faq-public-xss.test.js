'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HOME_SOURCE = fs.readFileSync(path.join(ROOT, 'faq-loader.js'), 'utf8');
const PAGE_SOURCE = fs.readFileSync(path.join(ROOT, 'faq-page-loader.js'), 'utf8');

class FakeElement {
  constructor(tagName, htmlWrites) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.id = '';
    this.type = '';
    this._text = '';
    this._innerHTML = '';
    this._listeners = Object.create(null);
    this._htmlWrites = htmlWrites;
    const self = this;
    this.classList = {
      contains(name) { return self.className.split(/\s+/).filter(Boolean).includes(name); },
      add(...names) {
        const classes = new Set(self.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        self.className = Array.from(classes).join(' ');
      },
      remove(...names) {
        const removed = new Set(names);
        self.className = self.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' ');
      },
    };
  }

  set textContent(value) {
    this._text = String(value == null ? '' : value);
    this.children = [];
    this._innerHTML = '';
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(value) {
    this._innerHTML = String(value == null ? '' : value);
    this._text = '';
    this.children = [];
    if (this._innerHTML) this._htmlWrites.push(this._innerHTML);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      child.children.slice().forEach((nested) => this.appendChild(nested));
      child.children = [];
      return child;
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    this._listeners[type] = listener;
  }

  click() {
    if (this._listeners.click) this._listeners.click.call(this, { currentTarget: this });
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return this.parentElement.children[index + 1] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    (function visit(node) {
      node.children.forEach((child) => {
        if (className && child.classList.contains(className)) results.push(child);
        visit(child);
      });
    }(this));
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function createHarness(source, items, surface) {
  const htmlWrites = [];
  const homeContainer = new FakeElement('div', htmlWrites);
  homeContainer.className = 'faq-list';
  const listContainer = new FakeElement('div', htmlWrites);
  listContainer.id = 'faqList';
  const filterContainer = new FakeElement('div', htmlWrites);
  filterContainer.id = 'faqFilters';
  const events = Object.create(null);
  const storage = new Map([['fuluckpet-lang', 'ja']]);
  const document = {
    querySelector(selector) {
      return selector === '.faq-list' && surface === 'home' ? homeContainer : null;
    },
    getElementById(id) {
      if (surface !== 'page') return null;
      if (id === 'faqList') return listContainer;
      if (id === 'faqFilters') return filterContainer;
      return null;
    },
    createElement(tagName) { return new FakeElement(tagName, htmlWrites); },
    createDocumentFragment() { return new FakeElement('#fragment', htmlWrites); },
    createTextNode(value) {
      const node = new FakeElement('#text', htmlWrites);
      node.textContent = value;
      return node;
    },
  };
  const window = {
    addEventListener(type, listener) { events[type] = listener; },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    window,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    fetch() {
      return Promise.resolve({ json() { return Promise.resolve(items); } });
    },
  });
  vm.runInContext(source, context, { filename: surface === 'home' ? 'faq-loader.js' : 'faq-page-loader.js' });
  return { homeContainer, listContainer, filterContainer, htmlWrites, events, storage, window };
}

function domSurface(root) {
  const fields = [root.tagName, root.id, root.className, root._text];
  Object.keys(root.attributes).forEach((key) => fields.push(key, root.attributes[key]));
  Object.keys(root.dataset).forEach((key) => fields.push(key, root.dataset[key]));
  root.children.forEach((child) => fields.push(domSurface(child)));
  return fields.join('|');
}

test('homepage FAQ renders malicious API fields as literal text with accordion a11y and language switching', async () => {
  const hostileId = '"><img src=x onerror=globalThis.pwned=true>';
  const hostileCategory = '<svg onload=globalThis.pwned=true>';
  const items = [{
    id: hostileId,
    category: hostileCategory,
    question: {
      ja: '<img src=x onerror=globalThis.pwned=true>質問',
      zh: '<svg onload=globalThis.pwned=true>问题',
    },
    answer: {
      ja: '<a onmouseover=globalThis.pwned=true>回答</a>',
      zh: '<b onclick=globalThis.pwned=true>回答</b>',
    },
  }];
  const result = createHarness(HOME_SOURCE, items, 'home');
  await new Promise(setImmediate);

  assert.deepEqual(result.htmlWrites, [], 'API fields must never enter innerHTML');
  assert.match(result.homeContainer.textContent, /<img src=x onerror=.*質問/);
  assert.match(result.homeContainer.textContent, /<a onmouseover=.*回答<\/a>/);
  assert.doesNotMatch(domSurface(result.homeContainer), new RegExp(hostileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(domSurface(result.homeContainer), new RegExp(hostileCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const button = result.homeContainer.querySelector('.faq-q');
  assert.ok(button);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), 'home-faq-a-0');
  assert.equal(button.nextElementSibling.getAttribute('role'), 'region');
  button.click();
  assert.equal(button.parentElement.classList.contains('active'), true, 'uses the state class consumed by the production FAQ CSS');
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  result.storage.set('fuluckpet-lang', 'zh');
  result.events.langChanged();
  assert.match(result.homeContainer.textContent, /<svg onload=.*问题/);
  assert.match(result.homeContainer.textContent, /<b onclick=.*回答<\/b>/);
});

test('standalone FAQ safely preserves categories, icons, filtering, a11y, and language switching', async () => {
  const hostileId = "faq');globalThis.pwned=true;//";
  const hostileCategory = '"><img src=x onerror=globalThis.pwned=true>';
  const items = [
    {
      id: 'known',
      category: 'general',
      question: { ja: '一般の質問', zh: '一般问题' },
      answer: { ja: '一般の回答', zh: '一般回答' },
    },
    {
      id: hostileId,
      category: hostileCategory,
      question: { ja: '<img src=x onerror=globalThis.pwned=true>危険な質問', zh: '<svg onload=globalThis.pwned=true>危险问题' },
      answer: { ja: '<a onclick=globalThis.pwned=true>危険な回答</a>', zh: '<b onmouseover=globalThis.pwned=true>危险回答</b>' },
    },
    {
      id: 'prototype-category',
      category: '__proto__',
      question: { ja: '原型名カテゴリの質問', zh: '原型类别问题' },
      answer: { ja: '表示される回答', zh: '应显示的回答' },
    },
  ];
  const result = createHarness(PAGE_SOURCE, items, 'page');
  await new Promise(setImmediate);

  assert.deepEqual(result.htmlWrites, [], 'filters, category labels, and FAQ data must use DOM construction');
  assert.match(result.listContainer.textContent, /<img src=x onerror=.*危険な質問/);
  assert.match(result.listContainer.textContent, /<a onclick=.*危険な回答<\/a>/);
  assert.match(result.listContainer.textContent, /原型名カテゴリの質問/, 'prototype-named unknown categories remain visible');
  const surface = domSurface(result.listContainer) + domSurface(result.filterContainer);
  assert.doesNotMatch(surface, new RegExp(hostileId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(surface, new RegExp(hostileCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const iconClasses = result.filterContainer.querySelectorAll('.ico').map((node) => node.className);
  assert.ok(iconClasses.some((value) => value.includes('ico-clipboard-list')));
  assert.ok(iconClasses.some((value) => value.includes('ico-message-circle')));

  const questions = result.listContainer.querySelectorAll('.faq-q');
  assert.equal(questions.length, 3);
  assert.equal(questions[0].getAttribute('aria-expanded'), 'false');
  assert.equal(questions[0].nextElementSibling.getAttribute('role'), 'region');
  questions[0].click();
  assert.equal(questions[0].parentElement.classList.contains('active'), true);
  assert.equal(questions[0].getAttribute('aria-expanded'), 'true');

  const generalFilter = result.filterContainer.querySelectorAll('.faq-filter-btn').find((button) => button.dataset.cat === 'general');
  assert.ok(generalFilter);
  generalFilter.click();
  assert.equal(result.listContainer.querySelectorAll('.faq-q').length, 1);
  assert.match(result.listContainer.textContent, /一般の質問/);
  assert.doesNotMatch(result.listContainer.textContent, /危険な質問/);

  result.storage.set('fuluckpet-lang', 'zh');
  result.events.langChanged();
  assert.match(result.listContainer.textContent, /一般问题/);
  assert.ok(result.filterContainer.querySelectorAll('.faq-filter-btn').find((button) => button.dataset.cat === 'general').classList.contains('active'));
});
