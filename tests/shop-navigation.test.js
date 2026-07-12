'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const STORE_URL = 'https://fukurakupet.stores.jp/';

function loadTranslations() {
  const source = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: {},
    console: { warn() {}, error() {}, log() {} },
  });
  vm.runInContext(`${source}\n;globalThis.__translations = translations;`, context, {
    filename: 'i18n.js',
  });
  return JSON.parse(JSON.stringify(context.__translations));
}

function productionTextFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', '.superpowers', 'node_modules', 'tests'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...productionTextFiles(absolute));
    } else if (/\.(?:css|html|js|json|mjs|txt|xml)$/.test(entry.name)) {
      results.push(absolute);
    }
  }
  return results;
}

test('services menu ends with one trilingual external STORES root entry', () => {
  const nav = require('../nav.js');
  const services = nav.navGroups().find((group) => group.id === 'services');
  assert.ok(services);
  assert.deepEqual(services.items.map((item) => item.key), [
    'nav.boarding',
    'nav.grooming',
    'nav.shop',
  ]);

  const shop = services.items.find((item) => item.key === 'nav.shop');
  assert.equal(shop.href, STORE_URL);
  assert.equal(shop.external, true);
  assert.equal(shop.jaOnly, undefined);
  assert.equal(shop.icon, 'shopping-cart');

  for (const lang of ['ja', 'en', 'zh']) {
    assert.ok(
      nav.visibleNavGroups(lang).some((group) => group.id === 'services'),
      `${lang}: services group must remain visible because the shop is trilingual`,
    );
  }
});

test('service group labels name products precisely in Japanese, English and Chinese', () => {
  const translations = loadTranslations();
  assert.equal(translations.ja['nav.group.services'], 'サービス・商品');
  assert.equal(translations.en['nav.group.services'], 'Services & Shop');
  assert.equal(translations.zh['nav.group.services'], '服务与商品');
  assert.equal(translations.ja['nav.shop'], 'ショップ');
  assert.equal(translations.en['nav.shop'], 'Shop');
  assert.equal(translations.zh['nav.shop'], '商城');
});

test('desktop and mobile dynamic navigation isolate external links', () => {
  const source = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const desktop = source.slice(source.indexOf('function renderDesktopNav'), source.indexOf('function renderMobileNav'));
  const mobile = source.slice(source.indexOf('function renderMobileNav'), source.indexOf('function syncLangButtons'));
  const safeExternal = /item\.external \? ' target="_blank" rel="noopener"' : ''/;
  assert.match(desktop, safeExternal);
  assert.match(mobile, safeExternal);
});

test('storefront stays external-only with no local portal or copied item/category links', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'shop', 'index.html')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'shop.html')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), /fuluckpet\.com\/shop(?:\/|\.html)/);

  const copied = [];
  const deepLink = /fukurakupet\.stores\.jp\/(?:items\/|\?(?:all_items=true|category_id=))/;
  for (const absolute of productionTextFiles(ROOT)) {
    const source = fs.readFileSync(absolute, 'utf8');
    if (deepLink.test(source)) copied.push(path.relative(ROOT, absolute));
  }
  assert.deepEqual(copied, [], `STORES item/category links copied into the main site:\n${copied.join('\n')}`);
});
