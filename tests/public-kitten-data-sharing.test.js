'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CAROUSEL_SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-carousel.js'), 'utf8');
const CTA_SOURCE = fs.readFileSync(path.join(ROOT, 'cta-widget.js'), 'utf8');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function createPage(fetchImpl) {
  const listeners = Object.create(null);
  const appended = [];
  const location = { pathname: '/blog/performance-test.html' };
  const document = {
    head: { appendChild() {} },
    body: {
      appendChild(node) {
        appended.push(node);
        return node;
      },
    },
    documentElement: { scrollTop: 0, scrollHeight: 2400 },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        className: '',
        innerHTML: '',
        classList: { add() {}, remove() {} },
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    location,
    innerHeight: 800,
    pageYOffset: 0,
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
  };
  const context = vm.createContext({
    window,
    location,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch: fetchImpl,
    URL,
    console: { warn() {} },
    setInterval() { return 1; },
    clearInterval() {},
  });
  return { context, appended, listeners, window };
}

test('carousel and CTA share one in-flight kittens request on the same page', async () => {
  const requests = [];
  const page = createPage((url) => {
    requests.push(String(url));
    return Promise.resolve({
      ok: true,
      json: async () => [{ id: 'kitten-1', status: 'available' }],
    });
  });

  vm.runInContext(CAROUSEL_SOURCE, page.context, { filename: 'kitten-carousel.js' });
  vm.runInContext(CTA_SOURCE, page.context, { filename: 'cta-widget.js' });
  await flushAsyncWork();

  assert.deepEqual(requests, ['https://api.example.test/api/kittens']);
  assert.equal(page.appended.length, 1, 'CTA still renders from the shared result');
});

test('a shared kittens failure keeps both consumers fail-safe', async () => {
  let requestCount = 0;
  const page = createPage(() => {
    requestCount += 1;
    return Promise.reject(new Error('offline'));
  });

  vm.runInContext(CAROUSEL_SOURCE, page.context, { filename: 'kitten-carousel.js' });
  vm.runInContext(CTA_SOURCE, page.context, { filename: 'cta-widget.js' });
  await flushAsyncWork();

  assert.equal(requestCount, 1);
  assert.equal(page.appended.length, 1, 'CTA renders its no-count fallback');
});

test('homepage card re-render reuses its first kittens result', async () => {
  const requests = [];
  const listeners = Object.create(null);
  const kittenGrid = { innerHTML: '<p>static</p>' };
  const parentGrid = { innerHTML: '<p>static</p>' };
  const reviewGrid = { innerHTML: '<p>static</p>' };
  const document = {
    title: 'Home',
    head: { appendChild() {} },
    getElementById(id) {
      if (id === 'kittensGrid') return kittenGrid;
      if (id === 'visibleCount') return { textContent: '' };
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return null;
      if (selector === '#parents .parents-grid') return parentGrid;
      if (selector === '#reviews .reviews-grid') return reviewGrid;
      return null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return { tagName: String(tag).toUpperCase(), textContent: '' }; },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    location: { pathname: '/index.html' },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatchEvent() {},
    rebindCards() {},
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch(url) {
      requests.push(String(url));
      return Promise.resolve({ ok: true, json: async () => [] });
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
  });

  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  await flushAsyncWork();
  for (const listener of listeners.langChanged || []) listener();
  await flushAsyncWork();

  const kittenRequests = requests.filter((url) => url.endsWith('/api/kittens'));
  assert.equal(kittenRequests.length, 1);
});

test('every tracked CTA consumer uses the current shared-data cache version', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const stale = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/cta-widget\.js\?v=/.test(source) && !/cta-widget\.js\?v=20260710a/.test(source)) {
      stale.push(file);
    }
  }
  assert.deepEqual(stale, []);
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');
  assert.match(generator, /verAsset\('cta-widget\.js', '20260710a'\)/);
});
