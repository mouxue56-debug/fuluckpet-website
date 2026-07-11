'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
const CORE_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-core.js'), 'utf8');
const RENDER_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-render.js'), 'utf8');

const PROMOTION_HINT_JA = '同じ販売ステータス内で、タグ付きが優先され、数値が大きいほど上に表示されます。同じ数値では若い子猫が先です。';
const PROMOTION_HINT_ZH = '仅在相同销售状态内排序：带促销标签的优先，数值越大越靠前；权重相同则年幼猫咪优先。';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    _values: values,
  };
}

function element(id, tagName = 'div') {
  const listeners = Object.create(null);
  const attributes = Object.create(null);
  const classes = new Set();
  return {
    id: id || '',
    tagName: tagName.toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    getClientRects() { return []; },
    focus() {},
    click() {
      (listeners.click || []).forEach((listener) => listener({ currentTarget: this, target: this }));
    },
  };
}

function createDocument() {
  const elements = new Map();
  const document = {
    body: element('body', 'body'),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement(tagName) { return element('', tagName); },
    createTextNode(text) {
      const node = element('', 'span');
      node.textContent = String(text == null ? '' : text);
      return node;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  return { document, elements };
}

function legacyKitten(overrides = {}) {
  return {
    id: 'k1',
    breederId: 'K-001',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    birthday: '2026-05',
    price: 250000,
    status: 'available',
    isNew: false,
    papa: '',
    mama: '',
    note: '',
    video: '',
    photos: [],
    coverIndex: 0,
    internalNote: 'keep-me',
    ...overrides,
  };
}

function renderHarness({ kitten = legacyKitten(), language = 'ja' } = {}) {
  const { document, elements } = createDocument();
  const calls = { saves: [], toasts: [], logs: [], modals: [] };
  const data = { kittens: [kitten], parents: [], reviews: [] };
  document.getElementById('kittenFilterStatus').value = 'all';
  document.getElementById('parentFilterBreed').value = 'all';
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    data,
    localStorage: storage(),
    LOG_KEY: 'fuluck-admin-log',
    PAGE_SIZE: 10,
    kittenPage: 1,
    parentPage: 1,
    getCoverPhoto(item) { return item.photos && item.photos[item.coverIndex || 0] || ''; },
    renderPagination() {},
    t(ja, zh) { return language === 'zh' ? zh : ja; },
    openModal(id) { calls.modals.push(id); },
    closeModal() {},
    showToast(message, type) { calls.toasts.push({ message, type }); },
    addLog(message) { calls.logs.push(message); },
    saveAndPublishFromUI(payload) { calls.saves.push(clone(payload)); return Promise.resolve(true); },
    confirm() { return true; },
    prompt() { return null; },
    getData() { return data; },
    loadImageConfig() {},
    applyAdminLang() {},
    openPhotoModal() {},
  });
  vm.runInContext(RENDER_SOURCE, context, { filename: 'admin-render.js' });
  context.renderAll = function() {};
  context.closeModal = function() {};
  return { context, elements, calls, data };
}

function fullSyncHarness(remoteKitten) {
  const { document, elements } = createDocument();
  const localStorage = storage();
  const calls = { get: [], bulk: [], publish: 0, toasts: [] };
  const remote = {
    '/api/admin/kittens': [clone(remoteKitten)],
    '/api/parents': [],
    '/api/reviews': [],
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    localStorage,
    sessionStorage: storage(),
    location: { reload() {} },
    FuluckAPI: {
      get(pathname) {
        calls.get.push(pathname);
        return Promise.resolve(clone(remote[pathname]));
      },
      bulkImport(type, items) {
        calls.bulk.push({ type, items: clone(items) });
        return Promise.resolve({ success: true });
      },
      publish() {
        calls.publish++;
        return Promise.resolve({ success: true });
      },
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ success: false }) }),
    confirm: () => true,
    prompt: () => null,
    setTimeout(fn) { queueMicrotask(fn); return 0; },
    clearTimeout() {},
    t: (ja) => ja,
    admLang: 'ja',
    loadImageConfig() {},
    applyAdminLang() {},
    showToast(message, type) { calls.toasts.push({ message, type }); },
  });
  vm.runInContext(CORE_SOURCE, context, { filename: 'admin-core.js' });
  vm.runInContext(RENDER_SOURCE, context, { filename: 'admin-render.js' });
  context.renderAll = function() {};
  context.closeModal = function() {};
  return { context, elements, calls };
}

test('kitten form exposes the exact promotion controls and localized ordering rule', () => {
  const tagSelect = ADMIN_HTML.match(/<select\b[^>]*id="kf_promotionTag"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(tagSelect, 'promotion tag select must exist');
  const optionValues = [...tagSelect[1].matchAll(/<option\b[^>]*value="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, ['', 'featured', 'campaign']);

  const priorityInput = ADMIN_HTML.match(/<input\b[^>]*id="kf_promotionPriority"[^>]*>/);
  assert.ok(priorityInput, 'promotion priority input must exist');
  assert.match(priorityInput[0], /\btype="number"/);
  assert.match(priorityInput[0], /\bmin="0"/);
  assert.match(priorityInput[0], /\bmax="999"/);
  assert.match(priorityInput[0], /\bstep="1"/);

  assert.match(ADMIN_HTML, new RegExp('data-adm-ja="' + PROMOTION_HINT_JA + '"'));
  assert.match(ADMIN_HTML, new RegExp('data-adm-zh="' + PROMOTION_HINT_ZH + '"'));
  assert.match(RENDER_SOURCE, /promotionTag/);
  assert.match(RENDER_SOURCE, /promotionPriority/);
});

test('legacy kitten promotion fields backfill to no tag and zero priority', () => {
  const { context, elements } = renderHarness();

  context.openKittenForm(context.data.kittens[0]);

  assert.equal(elements.get('kf_promotionTag').value, '');
  assert.equal(String(elements.get('kf_promotionPriority').value), '0');
});

test('valid promotion edit round-trips featured at 999 and logs the before/after values', () => {
  const { context, elements, calls } = renderHarness();
  context.openKittenForm(context.data.kittens[0]);
  elements.get('kf_promotionTag').value = 'featured';
  elements.get('kf_promotionPriority').value = '999';

  context.saveKitten();

  assert.equal(calls.saves.length, 1);
  const saved = calls.saves[0].kittens[0];
  assert.equal(saved.promotionTag, 'featured');
  assert.equal(saved.promotionPriority, 999);
  assert.equal(saved.internalNote, 'keep-me');
  assert.ok(calls.logs.includes('子猫 K-001 のプロモーションを「なし #0」から「おすすめ #999」に変更しました'));
});

test('invalid promotion priority shows an error toast and performs zero saves', async (t) => {
  const cases = [
    { name: 'positive priority without a tag', tag: '', priority: '1' },
    { name: 'fractional priority', tag: 'featured', priority: '1.5' },
    { name: 'negative priority', tag: 'featured', priority: '-1' },
    { name: 'priority above 999', tag: 'campaign', priority: '1000' },
    { name: 'non-numeric priority', tag: 'campaign', priority: 'abc' },
  ];

  for (const invalid of cases) {
    await t.test(invalid.name, () => {
      const { context, elements, calls } = renderHarness();
      context.openKittenForm(context.data.kittens[0]);
      elements.get('kf_promotionTag').value = invalid.tag;
      elements.get('kf_promotionPriority').value = invalid.priority;

      context.saveKitten();

      assert.equal(calls.saves.length, 0);
      assert.deepEqual(calls.toasts.at(-1), { message: '促销排序设置不正确', type: 'error' });
      assert.equal(context.data.kittens[0].promotionTag, undefined);
      assert.equal(context.data.kittens[0].promotionPriority, undefined);
    });
  }
});

test('promotion edit bulk-saves the authenticated full object without losing internalNote', async () => {
  const { context, elements, calls } = fullSyncHarness(legacyKitten());

  assert.equal(await context.syncFromAPI(), true);
  context.openKittenForm(context.data.kittens[0]);
  elements.get('kf_promotionTag').value = 'campaign';
  elements.get('kf_promotionPriority').value = '700';
  context.saveKitten();
  await context.saveQueue;

  assert.deepEqual(calls.get, ['/api/admin/kittens', '/api/parents', '/api/reviews']);
  assert.equal(calls.get.includes('/api/kittens'), false);
  assert.equal(calls.bulk.length, 1);
  assert.equal(calls.bulk[0].type, 'kittens');
  assert.equal(calls.bulk[0].items[0].promotionTag, 'campaign');
  assert.equal(calls.bulk[0].items[0].promotionPriority, 700);
  assert.equal(calls.bulk[0].items[0].internalNote, 'keep-me');
});
