'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FAQ_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-faq.js'), 'utf8');

function element(tagName, id) {
  const listeners = Object.create(null);
  return {
    id: id || '',
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    style: {},
    className: '',
    type: '',
    value: '',
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    click() {
      if (listeners.click) listeners.click({ currentTarget: this });
    },
    _listeners: listeners,
  };
}

function descendants(root, tagName) {
  const wanted = String(tagName).toUpperCase();
  const found = [];
  (function visit(node) {
    if (node.tagName === wanted) found.push(node);
    node.children.forEach(visit);
  }(root));
  return found;
}

function visibleText(root) {
  let output = root.textContent || '';
  root.children.forEach(function(child) {
    output += visibleText(child);
  });
  return output;
}

function harness(apiItems, behavior = {}) {
  const tbody = element('tbody', 'faqTableBody');
  const elements = new Map([['faqTableBody', tbody]]);
  const calls = { get: [], post: [], put: [], del: [], bulk: [], toasts: [] };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element('input', id));
      return elements.get(id);
    },
    createElement(tagName) {
      return element(tagName);
    },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    FuluckAPI: {
      get(pathname) {
        calls.get.push(pathname);
        return behavior.get ? behavior.get(pathname) : Promise.resolve(json(apiItems));
      },
      post(pathname, body) {
        calls.post.push({ pathname, body: JSON.parse(JSON.stringify(body)) });
        return behavior.post ? behavior.post(pathname, body) : Promise.resolve(Object.assign({ id: 'server-id' }, body));
      },
      put(pathname, body) {
        calls.put.push({ pathname, body: JSON.parse(JSON.stringify(body)) });
        return behavior.put ? behavior.put(pathname, body) : Promise.resolve(Object.assign({}, body));
      },
      del(pathname) {
        calls.del.push(pathname);
        return behavior.del ? behavior.del(pathname) : Promise.resolve({ success: true });
      },
      bulkImport(type, items) {
        calls.bulk.push({ type, items: JSON.parse(JSON.stringify(items)) });
        return behavior.bulkImport ? behavior.bulkImport(type, items) : Promise.resolve({ success: true });
      },
    },
    t(ja) { return ja; },
    openModal() {},
    closeModal() {},
    showToast(message, type) { calls.toasts.push({ message, type }); },
    addLog() {},
    confirm() { return behavior.confirm !== undefined ? behavior.confirm : true; },
  });
  vm.runInContext(FAQ_SOURCE, context, { filename: 'admin-faq.js' });
  return { context, tbody, elements, calls };
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function setFaqForm(elements, values) {
  const fields = Object.assign({
    faqEditId: '',
    faq_q_ja: '質問',
    faq_q_en: 'Question',
    faq_q_zh: '问题',
    faq_a_ja: '回答',
    faq_a_en: 'Answer',
    faq_a_zh: '回答',
    faq_category: 'general',
    faq_order: '1',
    faq_published: 'true',
  }, values || {});
  Object.keys(fields).forEach(function(id) {
    if (!elements.has(id)) elements.set(id, element('input', id));
    elements.get(id).value = fields[id];
  });
}

test('API FAQ fields render as text without executable markup or inline handlers', async () => {
  const hostileId = "');globalThis.__faqPwned=true;//";
  const hostileQuestion = '<img src=x onerror="globalThis.__faqPwned=true">保険 & 安心';
  const hostileCategory = '"><svg onload="globalThis.__faqPwned=true">';
  const items = [
    {
      id: hostileId,
      order: 1,
      category: hostileCategory,
      published: true,
      question: { ja: hostileQuestion },
      answer: { ja: '回答' },
    },
    {
      id: 'faq_zh',
      order: 2,
      category: '一般咨询',
      published: false,
      question: { ja: '', zh: '接猫后可以继续咨询吗？' },
      answer: { zh: '可以。' },
    },
    {
      id: 'faq_ja',
      order: 3,
      category: '一般',
      published: true,
      question: { ja: '保険 & 安心について' },
      answer: { ja: 'いつでもご相談ください。' },
    },
  ];
  const { context, tbody } = harness(items);

  context.loadFaqData();
  await new Promise(setImmediate);

  assert.equal(tbody.innerHTML, '', 'FAQ rows must not be assembled through innerHTML');
  assert.doesNotMatch(tbody.innerHTML, /onerror|onload|onclick/i);
  const text = visibleText(tbody);
  assert.match(text, /<img src=x onerror=/, 'hostile-looking text remains visible as literal text');
  assert.match(text, /保険 & 安心/);
  assert.match(text, /<svg onload=/, 'category remains literal text');
  assert.match(text, /接猫后可以继续咨询吗？/, 'Chinese text is preserved');

  const buttons = descendants(tbody, 'button');
  assert.equal(buttons.length, 6);
  assert.ok(buttons.every((button) => typeof button._listeners.click === 'function'));

  let editedId = null;
  context.editFaq = function(id) { editedId = id; };
  buttons[0].click();
  assert.equal(editedId, hostileId, 'programmatic listener preserves the original id');

  let deletedId = null;
  context.deleteFaq = function(id) { deletedId = id; };
  buttons[1].click();
  assert.equal(deletedId, hostileId, 'delete behavior preserves the original id');
  assert.equal(context.__faqPwned, undefined);
});

test('admin loads the authenticated full collection and preserves unpublished FAQ rows', async () => {
  const items = [
    { id: 'published', published: true, question: { ja: '公開' } },
    { id: 'draft', published: false, question: { ja: '非公開' } },
  ];
  const { context, calls } = harness(items);

  await Promise.resolve(context.loadFaqData());
  await new Promise(setImmediate);

  assert.deepEqual(calls.get, ['/api/admin/faq']);
  assert.equal(context.faqRemoteReady, true);
  assert.deepEqual(json(context.faqData), items);
});

test('invalid or failed admin reads keep the previous collection locked against every write', async () => {
  const previous = [{ id: 'draft', published: false, question: { ja: '保留する下書き' } }];
  const { context, calls, elements } = harness(null, {
    get() { return Promise.resolve({ error: 'not an array' }); },
  });
  context.faqData = json(previous);
  setFaqForm(elements, { faqEditId: 'draft', faq_q_ja: '変更してはいけない' });

  await Promise.resolve(context.loadFaqData());
  await new Promise(setImmediate);
  assert.equal(context.faqRemoteReady, false);
  assert.deepEqual(json(context.faqData), previous);

  await Promise.resolve(context.saveFaq());
  await Promise.resolve(context.deleteFaq('draft'));
  await Promise.resolve(context.seedDefaultFaq());
  await new Promise(setImmediate);

  assert.deepEqual(calls.post, []);
  assert.deepEqual(calls.put, []);
  assert.deepEqual(calls.del, []);
  assert.deepEqual(calls.bulk, []);
  assert.deepEqual(json(context.faqData), previous);
});

test('admin remains locked while the full read is pending and after a network rejection', async () => {
  const previous = [{ id: 'stale', published: false, question: { ja: '以前のデータ' } }];
  let rejectRead;
  const { context } = harness(null, {
    get() {
      return new Promise(function(resolve, reject) { rejectRead = reject; });
    },
  });
  context.faqData = json(previous);

  const loading = context.loadFaqData();
  assert.equal(context.faqRemoteReady, false);
  rejectRead(new Error('offline'));
  assert.equal(await loading, false);
  assert.equal(context.faqRemoteReady, false);
  assert.deepEqual(json(context.faqData), previous);
});

test('failed edit and delete requests leave the full local collection unchanged', async () => {
  const items = [
    { id: 'draft-id', published: false, createdAt: 'old', question: { ja: '下書き' }, answer: { ja: '旧回答' }, category: 'general', order: 1 },
    { id: 'public', published: true, question: { ja: '公開' }, answer: { ja: '回答' }, category: 'care', order: 2 },
  ];
  const { context, calls, elements } = harness(items, {
    put() { return Promise.reject(new Error('edit failed')); },
    del() { return Promise.reject(new Error('delete failed')); },
  });
  await context.loadFaqData();
  setFaqForm(elements, { faqEditId: 'draft-id', faq_q_ja: '失敗する変更' });

  await context.saveFaq();
  assert.deepEqual(json(context.faqData), items, 'failed edit must roll back completely');
  assert.equal(calls.put[0].pathname, '/api/admin/faq/draft-id');
  assert.equal(calls.bulk.length, 0);

  await context.deleteFaq('draft-id');
  assert.deepEqual(json(context.faqData), items, 'failed delete must leave the row present');
  assert.deepEqual(calls.del, ['/api/admin/faq/draft-id']);
  assert.equal(calls.bulk.length, 0);
});

test('normal create, edit, and delete use item CRUD and apply server results only after success', async () => {
  const initial = [
    { id: 'draft', published: false, question: { ja: '下書き' }, answer: { ja: '回答' }, category: 'general', order: 1 },
  ];
  const { context, calls, elements } = harness(initial, {
    post(pathname, body) { return Promise.resolve(Object.assign({}, body, { id: 'from-server', createdAt: 'server-time' })); },
    put(pathname, body) { return Promise.resolve(Object.assign({}, body, { id: 'draft', createdAt: 'kept', updatedAt: 'server-update' })); },
  });
  await context.loadFaqData();

  setFaqForm(elements, { faq_q_ja: '新規FAQ', faq_published: 'true' });
  await context.saveFaq();
  assert.equal(calls.post[0].pathname, '/api/admin/faq');
  assert.ok(context.faqData.some(function(item) { return item.id === 'from-server'; }));

  setFaqForm(elements, { faqEditId: 'draft', faq_q_ja: '更新済み', faq_published: 'false' });
  await context.saveFaq();
  assert.equal(calls.put[0].pathname, '/api/admin/faq/draft');
  assert.equal(context.faqData.find(function(item) { return item.id === 'draft'; }).question.ja, '更新済み');
  assert.equal(context.faqData.find(function(item) { return item.id === 'draft'; }).published, false);

  await context.deleteFaq('draft');
  assert.deepEqual(calls.del, ['/api/admin/faq/draft']);
  assert.equal(context.faqData.some(function(item) { return item.id === 'draft'; }), false);
  assert.equal(calls.bulk.length, 0);
});

test('a pending FAQ mutation blocks duplicate submits and appends one server-created row', async () => {
  const pending = [];
  const { context, calls, elements } = harness([], {
    post(pathname, body) {
      return new Promise(function(resolve) {
        pending.push(function() { resolve(Object.assign({}, body, { id: 'created-once' })); });
      });
    },
  });
  await context.loadFaqData();
  setFaqForm(elements, { faq_q_ja: '二重送信しない' });

  const first = context.saveFaq();
  const duplicate = context.saveFaq();
  assert.equal(await duplicate, false);
  assert.equal(calls.post.length, 1, 'only one non-idempotent POST may be in flight');

  pending[0]();
  assert.equal(await first, true);
  assert.equal(context.faqData.filter(function(item) { return item.id === 'created-once'; }).length, 1);
});

test('seed bulk is readiness-gated and replaces local data only after remote success', async () => {
  const initial = [{ id: 'keep', published: false, question: { ja: '残す' } }];
  let rejectBulk = true;
  const { context, calls } = harness(initial, {
    bulkImport() {
      return rejectBulk ? Promise.reject(new Error('seed failed')) : Promise.resolve({ success: true });
    },
  });
  await context.loadFaqData();

  await context.seedDefaultFaq();
  assert.deepEqual(json(context.faqData), initial);

  rejectBulk = false;
  await context.seedDefaultFaq();
  assert.equal(calls.bulk.length, 2);
  assert.equal(context.faqData.length, 6);
  assert.equal(context.faqData[0].id, 'faq_1');
});
