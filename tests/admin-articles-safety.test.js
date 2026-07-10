'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ARTICLES_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-articles.js'), 'utf8');

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
    src: '',
    alt: '',
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

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function settle() {
  return new Promise(function(resolve) {
    setImmediate(function() { setImmediate(resolve); });
  });
}

function harness(apiItems, behavior) {
  behavior = behavior || {};
  const tbody = element('tbody', 'articlesTableBody');
  const elements = new Map([['articlesTableBody', tbody]]);
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
    admLang: 'ja',
    FuluckAPI: {
      get(pathname) {
        calls.get.push(pathname);
        return behavior.get ? behavior.get(pathname) : Promise.resolve(json(apiItems));
      },
      post(pathname, body) {
        calls.post.push({ pathname, body: json(body) });
        return behavior.post
          ? behavior.post(pathname, body)
          : Promise.resolve(Object.assign({}, body, { id: 'server-id', createdAt: 'server-created' }));
      },
      put(pathname, body) {
        calls.put.push({ pathname, body: json(body) });
        return behavior.put
          ? behavior.put(pathname, body)
          : Promise.resolve(Object.assign({}, body, { id: decodeURIComponent(pathname.split('/').pop()), updatedAt: 'server-updated' }));
      },
      del(pathname) {
        calls.del.push(pathname);
        return behavior.del ? behavior.del(pathname) : Promise.resolve({ success: true });
      },
      bulkImport(type, items) {
        calls.bulk.push({ type, items: json(items) });
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
  vm.runInContext(ARTICLES_SOURCE, context, { filename: 'admin-articles.js' });
  return { context, tbody, elements, calls };
}

function setArticleForm(elements, values) {
  const fields = Object.assign({
    articleEditId: '',
    art_slug: 'safe-article',
    art_category: 'health',
    art_title_ja: '安全な記事',
    art_title_en: 'Safe article',
    art_title_zh: '安全文章',
    art_excerpt_ja: '概要',
    art_content_ja: '<p>本文</p>',
    art_cover: 'https://images.example.test/cover.jpg',
    art_published: 'false',
  }, values || {});
  Object.keys(fields).forEach(function(id) {
    if (!elements.has(id)) elements.set(id, element('input', id));
    elements.get(id).value = fields[id];
  });
}

test('remote article fields render as text and only safe cover URLs reach image elements', async () => {
  const hostileId = "');globalThis.__articlePwned=true;//";
  const items = [
    {
      id: hostileId,
      title: { ja: '<img src=x onerror="globalThis.__articlePwned=true">' },
      category: '"><svg onload="globalThis.__articlePwned=true">',
      coverImage: 'javascript:globalThis.__articlePwned=true',
      published: false,
    },
    { id: 'https', title: { ja: 'HTTPS' }, category: 'health', coverImage: 'https://cdn.example.test/a.jpg', published: true },
    { id: 'root', title: { ja: 'Root' }, category: 'health', coverImage: '/images/a.jpg', published: true },
    { id: 'data', title: { ja: 'Data' }, category: 'health', coverImage: 'data:image/svg+xml,<svg onload=alert(1)>', published: true },
    { id: 'network', title: { ja: 'Network' }, category: 'health', coverImage: '//evil.example/a.jpg', published: true },
  ];
  const { context, tbody } = harness(items);

  await context.loadArticlesData();

  assert.equal(tbody.innerHTML, '', 'rows must not be assembled through innerHTML');
  assert.doesNotMatch(tbody.innerHTML, /onerror|onload|onclick/i);
  const text = visibleText(tbody);
  assert.match(text, /<img src=x onerror=/, 'hostile-looking title remains literal text');
  assert.match(text, /<svg onload=/, 'hostile-looking category remains literal text');

  const images = descendants(tbody, 'img');
  assert.deepEqual(images.map(function(image) { return image.src; }), [
    'https://cdn.example.test/a.jpg',
    '/images/a.jpg',
  ]);

  const buttons = descendants(tbody, 'button');
  assert.equal(buttons.length, items.length * 2);
  assert.ok(buttons.every(function(button) { return typeof button._listeners.click === 'function'; }));
  let editedId = null;
  context.editArticle = function(id) { editedId = id; };
  buttons[0].click();
  assert.equal(editedId, hostileId);
  let deletedId = null;
  context.deleteArticle = function(id) { deletedId = id; };
  buttons[1].click();
  assert.equal(deletedId, hostileId);
  assert.equal(context.__articlePwned, undefined);
});

test('admin loads the authenticated full collection and preserves unpublished articles', async () => {
  const items = [
    { id: 'published', published: true, title: { ja: '公開' } },
    { id: 'draft', published: false, title: { ja: '非公開' } },
  ];
  const { context, calls } = harness(items);

  assert.equal(await context.loadArticlesData(), true);

  assert.deepEqual(calls.get, ['/api/admin/articles']);
  assert.equal(context.articlesRemoteReady, true);
  assert.deepEqual(json(context.articlesData), items);
});

test('invalid admin reads preserve prior state and keep every write locked', async () => {
  const previous = [{ id: 'draft', published: false, title: { ja: '残す下書き' } }];
  const { context, calls, elements } = harness(null, {
    get() { return Promise.resolve({ success: false, items: [] }); },
  });
  context.articlesData = json(previous);
  setArticleForm(elements, { articleEditId: 'draft', art_title_ja: '保存してはいけない' });

  assert.equal(await context.loadArticlesData(), false);
  assert.equal(context.articlesRemoteReady, false);
  assert.deepEqual(json(context.articlesData), previous);

  assert.equal(await context.saveArticle(), false);
  assert.equal(await context.deleteArticle('draft'), false);
  assert.deepEqual(calls.post, []);
  assert.deepEqual(calls.put, []);
  assert.deepEqual(calls.del, []);
  assert.deepEqual(calls.bulk, []);
  assert.deepEqual(json(context.articlesData), previous);
});

test('admin remains write-locked while the full read is pending and after rejection', async () => {
  const previous = [{ id: 'stale', published: false, title: { ja: '以前のデータ' } }];
  let rejectRead;
  const { context } = harness(null, {
    get() {
      return new Promise(function(resolve, reject) { rejectRead = reject; });
    },
  });
  context.articlesData = json(previous);

  const loading = context.loadArticlesData();
  assert.equal(context.articlesRemoteReady, false);
  rejectRead(new Error('offline'));
  assert.equal(await loading, false);
  assert.equal(context.articlesRemoteReady, false);
  assert.deepEqual(json(context.articlesData), previous);
});

test('failed item writes preserve local state and lock mutations until a full reread', async () => {
  const items = [
    {
      id: 'draft/id?x', slug: 'draft', published: false, createdAt: 'old',
      title: { ja: '下書き', en: '', zh: '' }, excerpt: { ja: '旧概要', en: '', zh: '' },
      content: { ja: '旧本文', en: '', zh: '' }, category: 'health', coverImage: '', tags: [],
    },
    { id: 'public', slug: 'public', published: true, title: { ja: '公開', en: '', zh: '' } },
  ];
  let putFails = true;
  const { context, calls, elements } = harness(items, {
    put(pathname, body) {
      return putFails
        ? Promise.reject(new Error('connection lost after send'))
        : Promise.resolve(Object.assign({}, body, { id: 'draft/id?x', updatedAt: 'server' }));
    },
    del() { return Promise.reject(new Error('delete response lost')); },
  });
  await context.loadArticlesData();
  setArticleForm(elements, { articleEditId: 'draft/id?x', art_title_ja: '失敗する変更' });

  assert.equal(await context.saveArticle(), false);
  assert.deepEqual(json(context.articlesData), items);
  assert.equal(context.articlesRemoteReady, false, 'uncertain write failure must force a reread');
  assert.equal(calls.put[0].pathname, '/api/admin/articles/draft%2Fid%3Fx');

  assert.equal(await context.deleteArticle('draft/id?x'), false);
  assert.deepEqual(calls.del, [], 'locked state blocks a second write');

  putFails = false;
  assert.equal(await context.loadArticlesData(), true);
  assert.equal(await context.deleteArticle('draft/id?x'), false);
  assert.deepEqual(json(context.articlesData), items);
  assert.equal(context.articlesRemoteReady, false);
  assert.deepEqual(calls.del, ['/api/admin/articles/draft%2Fid%3Fx']);
  assert.equal(calls.bulk.length, 0);
});

test('create, edit, and delete use item CRUD and apply validated server records after success', async () => {
  const initial = [
    {
      id: 'draft/id?x', slug: 'draft', published: false, createdAt: 'kept',
      title: { ja: '下書き', en: 'Draft', zh: '草稿' }, excerpt: { ja: '旧', en: 'Hidden EN excerpt', zh: '隐藏中文摘要' },
      content: { ja: '旧本文', en: 'Hidden EN content', zh: '隐藏中文正文' }, category: 'health', coverImage: '', tags: ['preserve-me'],
    },
  ];
  const { context, calls, elements } = harness(initial, {
    post(pathname, body) {
      return Promise.resolve(Object.assign({}, body, { id: 'server-created', createdAt: 'server-time' }));
    },
    put(pathname, body) {
      return Promise.resolve(Object.assign({}, initial[0], body, { id: 'draft/id?x', createdAt: 'kept', updatedAt: 'server-time' }));
    },
  });
  await context.loadArticlesData();

  setArticleForm(elements, { art_slug: 'new', art_title_ja: '新規', art_title_en: 'New', art_title_zh: '新文章' });
  assert.equal(await context.saveArticle(), true);
  assert.equal(calls.post[0].pathname, '/api/admin/articles');
  assert.equal(context.articlesData.find(function(item) { return item.id === 'server-created'; }).title.zh, '新文章');

  setArticleForm(elements, {
    articleEditId: 'draft/id?x', art_slug: 'draft', art_title_ja: '更新', art_title_en: 'Updated', art_title_zh: '已更新',
  });
  assert.equal(await context.saveArticle(), true);
  assert.equal(calls.put[0].pathname, '/api/admin/articles/draft%2Fid%3Fx');
  assert.equal(context.articlesData.find(function(item) { return item.id === 'draft/id?x'; }).title.en, 'Updated');
  assert.equal(calls.put[0].body.excerpt.en, 'Hidden EN excerpt', 'languages absent from the form must survive edits');
  assert.equal(calls.put[0].body.excerpt.zh, '隐藏中文摘要');
  assert.equal(calls.put[0].body.content.en, 'Hidden EN content');
  assert.equal(calls.put[0].body.content.zh, '隐藏中文正文');
  assert.equal(Object.prototype.hasOwnProperty.call(calls.put[0].body, 'tags'), false, 'hidden metadata must not be reset by the legacy form');
  assert.deepEqual(context.articlesData.find(function(item) { return item.id === 'draft/id?x'; }).tags, ['preserve-me']);

  assert.equal(await context.deleteArticle('draft/id?x'), true);
  assert.deepEqual(calls.del, ['/api/admin/articles/draft%2Fid%3Fx']);
  assert.equal(context.articlesData.some(function(item) { return item.id === 'draft/id?x'; }), false);
  assert.equal(calls.bulk.length, 0, 'normal CRUD must never bulk-replace the collection');
});

test('a pending create blocks duplicate submits and appends exactly one server row', async () => {
  let resolveCreate;
  const { context, calls, elements } = harness([], {
    post(pathname, body) {
      return new Promise(function(resolve) {
        resolveCreate = function() { resolve(Object.assign({}, body, { id: 'created-once' })); };
      });
    },
  });
  await context.loadArticlesData();
  setArticleForm(elements, { art_title_ja: '二重送信しない' });

  const first = context.saveArticle();
  const duplicate = context.saveArticle();
  assert.equal(await duplicate, false);
  assert.equal(calls.post.length, 1);

  resolveCreate();
  assert.equal(await first, true);
  assert.equal(context.articlesData.filter(function(item) { return item.id === 'created-once'; }).length, 1);
});

test('malformed success responses never mutate local data and force a reread', async () => {
  const initial = [{ id: 'keep', slug: 'keep', published: false, title: { ja: '保持' } }];
  const { context, elements } = harness(initial, {
    post() { return Promise.resolve({ success: true }); },
  });
  await context.loadArticlesData();
  setArticleForm(elements, { art_title_ja: '追加されない' });

  assert.equal(await context.saveArticle(), false);
  assert.deepEqual(json(context.articlesData), initial);
  assert.equal(context.articlesRemoteReady, false);
});
