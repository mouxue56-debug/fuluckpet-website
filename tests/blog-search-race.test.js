'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const index = [
  { t: 'Synthetic kitten article', d: 'Kitten fixture', c: 'Test', u: '/blog/synthetic-kitten.html' },
  { t: 'Synthetic health article', d: 'Health fixture', c: 'Test', u: '/blog/synthetic-health.html' },
];

function harness(search = '') {
  const requests = [];
  function element() {
    const listeners = new Map();
    return {
      value: '', hidden: true, innerHTML: '', style: { display: '' },
      addEventListener(type, handler) { listeners.set(type, handler); },
      dispatch(type) { listeners.get(type)?.({ preventDefault() {} }); },
    };
  }
  const form = element();
  const input = element();
  const out = element();
  const sections = [element(), element()];
  const initialUrl = new URL('https://example.test/blog.html' + search);
  const location = { href: initialUrl.href, search: initialUrl.search };
  const window = {
    location,
    history: { replaceState(_state, _title, href) {
      const next = new URL(href, location.href);
      location.href = next.href;
      location.search = next.search;
    } },
  };
  const html = fs.readFileSync(path.join(__dirname, '..', 'blog.html'), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(source => source.includes("getElementById('blogSearchResults')"));
  assert.ok(script, 'real blog search script is present');
  vm.runInNewContext(script, {
    window, URL, URLSearchParams,
    document: {
      querySelector() { return form; },
      getElementById(id) { return id === 'blogSearch' ? input : out; },
      querySelectorAll() { return sections; },
    },
    fetch(url) {
      assert.equal(url, '/blog-search-index.json');
      return new Promise((resolve, reject) => requests.push({
        resolve: () => resolve({ json: () => Promise.resolve(index) }), reject,
      }));
    },
  });
  return {
    input, out, sections, window,
    search(value) { input.value = value; input.dispatch('input'); },
    resolve(i) { assert.ok(requests[i], 'pending search index request'); requests[i].resolve(); },
    reject(i) { assert.ok(requests[i], 'pending search index request'); requests[i].reject(new Error('synthetic network failure')); },
  };
}

async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('clearing while the search index loads keeps results hidden and article sections visible', async () => {
  const h = harness();
  h.search('kitten');
  h.search('');
  h.resolve(0);
  await flush();
  assert.equal(h.out.hidden, true);
  assert.equal(h.out.innerHTML, '');
  assert.ok(h.sections.every(section => section.style.display === ''));
  assert.equal(new URL(h.window.location.href).searchParams.has('q'), false);
});

test('an older index response cannot replace the results of a newer search', async () => {
  const h = harness();
  h.search('kitten');
  h.search('health');
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.doesNotMatch(h.out.innerHTML, /synthetic-kitten\.html/);
  h.resolve(0);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.doesNotMatch(h.out.innerHTML, /synthetic-kitten\.html/);
  assert.equal(new URL(h.window.location.href).searchParams.get('q'), 'health');
});

test('the active search still renders its matches and clearing restores the article sections', async () => {
  const h = harness();
  h.search('kitten');
  h.resolve(0);
  await flush();
  assert.equal(h.out.hidden, false);
  assert.match(h.out.innerHTML, /synthetic-kitten\.html/);
  assert.ok(h.sections.every(section => section.style.display === 'none'));
  h.search('   ');
  assert.equal(h.out.hidden, true);
  assert.equal(h.out.innerHTML, '');
  assert.ok(h.sections.every(section => section.style.display === ''));
});

test('a shared search URL renders on initial load and preserves unrelated URL context', async () => {
  const h = harness('?q=health&lang=en#articles');
  h.resolve(0);
  await flush();
  assert.equal(h.input.value, 'health');
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  assert.equal(new URL(h.window.location.href).searchParams.get('lang'), 'en');
  assert.equal(new URL(h.window.location.href).hash, '#articles');
});

test('a stale failed index request cannot poison the cache used by the next search', async () => {
  const h = harness();
  h.search('kitten');
  h.search('health');
  h.resolve(1);
  await flush();
  assert.match(h.out.innerHTML, /synthetic-health\.html/);
  h.reject(0);
  await flush();
  h.search('kitten');
  assert.equal(h.out.hidden, false);
  assert.match(h.out.innerHTML, /synthetic-kitten\.html/);
});
