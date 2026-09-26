'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { parseFragment } = require('parse5');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function anchors(html) {
  const result = [];
  function visit(node) {
    if (node.tagName === 'a') result.push(Object.fromEntries(node.attrs.map(a => [a.name, a.value])));
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parseFragment(html));
  return result;
}

function navRuntime(pathname) {
  const context = vm.createContext({ window: { location: { pathname, search: '', hash: '' } }, URLSearchParams });
  const marker = "\n  if (typeof module !== 'undefined' && module.exports) {";
  vm.runInContext(read('nav.js').replace(marker,
    '\n  globalThis.renderDesktop = renderDesktopNav; globalThis.renderMobile = renderMobileNav; globalThis.syncLanguage = syncLangButtons;' + marker), context);
  context.document = {
    body: { getAttribute() { return null; } },
    documentElement: { getAttribute() { return 'ja'; } },
    querySelectorAll() { return []; },
  };
  return context;
}

test('desktop and mobile booking destinations retain only safe kitten-detail IDs', () => {
  const cases = [
    ['/kittens/2607-02164.html', '/booking.html?kitten=2607-02164'],
    ['/en/kittens/2607-02164.html', '/booking.html?kitten=2607-02164'],
    ['/zh/kittens/2607-02164.html', '/booking.html?kitten=2607-02164'],
    ['/blog.html', '/booking.html'],
    ['/kittens.html', '/booking.html'],
    ['/kittens/index.html', '/booking.html'],
    ['/kittens/invalid%22%3E.html', '/booking.html'],
    ['/kittens/../../booking.html', '/booking.html'],
    ['/kittens/' + 'a'.repeat(101) + '.html', '/booking.html'],
  ];
  for (const [pathname, expected] of cases) {
    const context = navRuntime(pathname);
    for (const render of [context.renderDesktop, context.renderMobile]) {
      const links = anchors(render({ path: pathname, hash: '' })).filter(a => a.href.startsWith('/booking.html'));
      assert.equal(links.length, 2, pathname + ': primary and menu booking links');
      for (const link of links) assert.equal(link.href, expected, pathname);
    }
  }
});

test('language synchronization cannot erase a detail navigation booking ID', () => {
  const context = navRuntime('/en/kittens/2607-02164.html');
  const link = {
    href: '/booking.html?kitten=2607-02164',
    querySelector() { return { getAttribute() { return 'nav.booking'; } }; },
    setAttribute(_key, value) { this.href = value; },
  };
  context.document.querySelectorAll = selector => selector === '.lang-btn' ? [] : [link];
  context.syncLanguage('en');
  assert.equal(link.href, '/booking.html?kitten=2607-02164');
});

async function ctaRuntime({ pathname = '/blog.html', lang = 'ja', storageError = false } = {}) {
  let stored = lang;
  const listeners = {};
  const appended = [];
  const document = {
    body: { appendChild(node) { appended.push(node); } },
    documentElement: { lang, scrollTop: 0, scrollHeight: 2400 },
    createElement() { return { classList: { add() {}, remove() {} } }; },
  };
  const location = { pathname };
  const window = { location, innerHeight: 800, pageYOffset: 0, addEventListener(type, fn) { listeners[type] = fn; } };
  const context = vm.createContext({
    document, window, location, console,
    localStorage: { getItem() { if (storageError) throw new Error('storage disabled'); return stored; } },
    fetch: async () => ({ ok: true, json: async () => [] }),
  });
  vm.runInContext(read('kitten-catalog.js'), context);
  window.FuluckKittenCatalog = context.FuluckKittenCatalog;
  vm.runInContext(read('cta-widget.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    links() { return anchors(appended[0].innerHTML); },
    switchLanguage(next) { stored = next; document.documentElement.lang = next; listeners.langChanged({ detail: { lang: next } }); },
  };
}

test('floating kitten-list link uses the rendered locale and follows in-place switches', async () => {
  const page = await ctaRuntime();
  for (const [lang, expected] of [['en', '/en/kittens.html'], ['zh', '/zh/kittens.html'], ['ja', '/kittens.html']]) {
    page.switchLanguage(lang);
    assert.equal(page.links().find(a => a.class === 'cta-widget-kittens').href, expected);
  }
});

test('floating list routes follow explicit locale paths despite stale or unavailable storage', async () => {
  for (const [options, expected] of [
    [{ pathname: '/en/kittens/2607-02164.html', lang: 'ja' }, '/en/kittens.html'],
    [{ pathname: '/zh/kittens/2607-02164.html', storageError: true }, '/zh/kittens.html'],
    [{ pathname: '/kittens/2607-02164.html', lang: 'ja', storageError: true }, '/kittens.html'],
    [{ lang: '../../bad' }, '/kittens.html'],
  ]) {
    const page = await ctaRuntime(options);
    assert.equal(page.links().find(a => a.class === 'cta-widget-kittens').href, expected);
  }
});
