'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const NAV_SOURCE = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
const GENERATOR = path.join(ROOT, 'tools', 'generate-site.js');

function classes(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const next = force === undefined ? !values.has(name) : Boolean(force);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
  };
}

function element(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  const listeners = new Map();
  return {
    classList: classes(),
    style: {},
    children: [],
    disabled: false,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) || [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    dispatch(name, event = {}) {
      for (const callback of listeners.get(name) || []) callback(event);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    getClientRects() { return [{}]; },
    focus() {},
  };
}

function menuRuntime(pathname, initialLang) {
  const hamburger = element({ 'aria-label': 'メニュー' });
  const navFab = element({ 'aria-label': 'メニューを開く' });
  const close = element();
  const sections = element();
  const mobileNav = element();
  const desktopNav = element();
  let mobileMarkup = '';
  Object.defineProperty(mobileNav, 'innerHTML', {
    get() { return mobileMarkup; },
    set(value) {
      mobileMarkup = String(value);
      const closeLabel = mobileMarkup.match(/class="nav-mobile-close"[^>]*aria-label="([^"]+)"/);
      const sectionsLabel = mobileMarkup.match(/class="nav-mobile-sections"[^>]*aria-label="([^"]+)"/);
      if (closeLabel) close.setAttribute('aria-label', closeLabel[1]);
      if (sectionsLabel) sections.setAttribute('aria-label', sectionsLabel[1]);
    },
  });
  mobileNav.querySelector = (selector) => {
    if (selector === '.nav-mobile-close') return close;
    if (selector === '.nav-mobile-sections') return sections;
    return null;
  };
  desktopNav.innerHTML = '';

  const bodyAttributes = new Map([['data-nav-language', initialLang]]);
  const body = element();
  body.children = [mobileNav];
  body.getAttribute = (name) => bodyAttributes.get(name) || null;
  body.setAttribute = (name, value) => bodyAttributes.set(name, String(value));

  const documentListeners = new Map();
  const document = {
    body,
    activeElement: hamburger,
    documentElement: element({ lang: initialLang }),
    querySelector(selector) {
      if (selector === '.nav') return desktopNav;
      if (selector === '.mobile-nav') return mobileNav;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById(id) {
      if (id === 'hamburger') return hamburger;
      if (id === 'mobileNav') return mobileNav;
      if (id === 'mobileNavFab') return navFab;
      return null;
    },
    addEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      callbacks.push(callback);
      documentListeners.set(name, callbacks);
    },
    dispatch(name, event) {
      for (const callback of documentListeners.get(name) || []) callback(event);
    },
  };

  const windowListeners = new Map();
  const saved = new Map();
  const window = {
    location: { pathname, search: '', hash: '', href: pathname },
    setTimeout() { return 0; },
    addEventListener(name, callback) {
      const callbacks = windowListeners.get(name) || [];
      callbacks.push(callback);
      windowListeners.set(name, callbacks);
    },
    dispatchEvent(event) {
      for (const callback of windowListeners.get(event.type) || []) callback(event);
    },
  };
  const localStorage = {
    getItem(key) { return saved.has(key) ? saved.get(key) : null; },
    setItem(key, value) { saved.set(key, String(value)); },
  };
  window.setLanguage = function (lang) {
    body.setAttribute('data-nav-language', lang);
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('fuluckpet-lang', lang);
    window.dispatchEvent({ type: 'langChanged', detail: { lang } });
  };

  const anchor = "\n  if (typeof module !== 'undefined' && module.exports) {";
  assert.ok(NAV_SOURCE.includes(anchor), 'nav.js test instrumentation anchor');
  const instrumented = NAV_SOURCE.replace(
    anchor,
    '\n  globalThis.__navInternals = { enhanceNav, claimMobileTrigger };' + anchor,
  );
  const context = vm.createContext({
    window,
    localStorage,
    URLSearchParams,
    console,
  });
  vm.runInContext(instrumented, context, { filename: 'nav.js' });
  context.document = document;

  return {
    hamburger,
    navFab,
    close,
    sections,
    mobileNav,
    document,
    window,
    nav: context.__navInternals,
  };
}

function menuNames(runtime) {
  return {
    trigger: runtime.hamburger.getAttribute('aria-label'),
    floatingTrigger: runtime.navFab.getAttribute('aria-label'),
    close: runtime.close.getAttribute('aria-label'),
    dialog: runtime.mobileNav.getAttribute('aria-label'),
    navigation: runtime.sections.getAttribute('aria-label'),
  };
}

test('mobile menu accessible names follow locale initially, while open, and after closing', () => {
  const cases = [
    { lang: 'ja', path: '/about.html', menu: 'メニュー', close: 'メニューを閉じる' },
    { lang: 'en', path: '/en/kittens/2603-02736.html', menu: 'MENU', close: 'Close menu' },
    { lang: 'zh', path: '/zh/kittens/2608-52935.html', menu: '菜单', close: '关闭菜单' },
  ];

  for (const item of cases) {
    const runtime = menuRuntime(item.path, item.lang);
    runtime.nav.enhanceNav();
    runtime.nav.claimMobileTrigger();

    assert.deepEqual(menuNames(runtime), {
      trigger: item.menu,
      floatingTrigger: item.menu,
      close: item.close,
      dialog: item.menu,
      navigation: item.menu,
    }, `${item.lang}: initial enhanced names`);

    runtime.hamburger.dispatch('click', { preventDefault() {} });
    assert.deepEqual(menuNames(runtime), {
      trigger: item.close,
      floatingTrigger: item.close,
      close: item.close,
      dialog: item.menu,
      navigation: item.menu,
    }, `${item.lang}: open names`);

    runtime.document.dispatch('keydown', { key: 'Escape', preventDefault() {} });
    assert.deepEqual(menuNames(runtime), {
      trigger: item.menu,
      floatingTrigger: item.menu,
      close: item.close,
      dialog: item.menu,
      navigation: item.menu,
    }, `${item.lang}: closed names`);
  }
});

test('an in-place language switch updates every mobile menu accessible name', () => {
  const runtime = menuRuntime('/about.html', 'ja');
  runtime.nav.enhanceNav();
  runtime.nav.claimMobileTrigger();
  runtime.hamburger.dispatch('click', { preventDefault() {} });

  const chineseButton = element({ 'data-lang': 'zh' });
  chineseButton.closest = () => chineseButton;
  runtime.document.dispatch('click', { target: chineseButton });

  assert.deepEqual(menuNames(runtime), {
    trigger: '关闭菜单',
    floatingTrigger: '关闭菜单',
    close: '关闭菜单',
    dialog: '菜单',
    navigation: '菜单',
  });
});

function loadGenerator(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall)
    + '\nmodule.exports = { generateKittens, generateKittenDetailPages };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

test('generated English and Chinese kitten pages bake locale-correct hamburger names', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-menu-label-'));
  for (const relative of ['kittens.html', 'i18n.js']) {
    fs.copyFileSync(path.join(ROOT, relative), path.join(siteDir, relative));
  }
  const generator = loadGenerator(t, siteDir);
  const fixture = [{
    breederId: 'synthetic-menu-label',
    breed: 'サイベリアン',
    color: 'ホワイト',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    status: 'available',
    photos: ['https://images.example.test/synthetic-menu-label.jpg'],
  }];

  for (const item of [
    { lang: 'en', label: 'MENU' },
    { lang: 'zh', label: '菜单' },
  ]) {
    generator.generateKittens(fixture, item.lang);
    generator.generateKittenDetailPages(fixture, [], item.lang);
    for (const relative of [
      `${item.lang}/kittens.html`,
      `${item.lang}/kittens/synthetic-menu-label.html`,
    ]) {
      const html = fs.readFileSync(path.join(siteDir, relative), 'utf8');
      assert.match(html, new RegExp(`<button class="hamburger" id="hamburger" aria-label="${item.label}"`), relative);
      assert.doesNotMatch(html, /<button class="hamburger" id="hamburger" aria-label="メニュー"/, relative);
      if (relative.endsWith('/kittens.html')) {
        assert.match(html, new RegExp(`<button class="mobile-nav-fab" id="mobileNavFab" aria-label="${item.label}"`), relative);
      }
    }
  }
});

test('tracked localized pages enhanced by shared navigation ship a locale-correct fallback name', () => {
  const cases = [
    { lang: 'en', label: 'MENU' },
    { lang: 'zh', label: '菜单' },
  ];
  let checked = 0;
  let floatingTriggers = 0;
  for (const item of cases) {
    const pending = [path.join(ROOT, item.lang)];
    while (pending.length) {
      const directory = pending.pop();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(absolute);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
        const html = fs.readFileSync(absolute, 'utf8');
        if (!/<div\b[^>]*class="[^"]*\bmobile-nav\b/.test(html)) continue;
        checked += 1;
        const relative = path.relative(ROOT, absolute);
        assert.match(
          html,
          new RegExp(`<button class="hamburger" id="hamburger" aria-label="${item.label}"`),
          relative,
        );
        if (html.includes('id="mobileNavFab"')) {
          floatingTriggers += 1;
          assert.match(
            html,
            new RegExp(`<button class="mobile-nav-fab" id="mobileNavFab" aria-label="${item.label}"`),
            relative,
          );
        }
      }
    }
  }
  assert.equal(checked, 54, 'all currently enhanced EN/ZH pages stay in scope');
  assert.equal(floatingTriggers, 8, 'every existing EN/ZH floating trigger stays in scope');
});
