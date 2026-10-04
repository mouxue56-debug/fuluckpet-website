'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('../nav.js');

test('published boarding and grooming pages remain reachable from every navigation language', () => {
  const services = nav.navGroups().find(group => group.id === 'services').items;
  for (const name of ['boarding', 'grooming']) {
    const item = services.find(item => item.key === 'nav.' + name);
    assert.equal(nav.hasStaticSibling('/' + name + '/'), true);
    assert.ok(!item.jaOnly, name + ' must not disappear in English or Chinese');
    for (const lang of ['ja', 'en', 'zh']) {
      assert.equal(nav.localizedItemHref(item, lang), '/' + (lang === 'ja' ? '' : lang + '/') + name + '/');
    }
  }
});

test('naming tool links carry the selected language without rewriting unrelated external links', () => {
  const items = nav.navGroups().flatMap(group => group.items);
  const naming = items.find(item => item.key === 'nav.naming');
  const shop = items.find(item => item.key === 'nav.shop');
  for (const lang of ['ja', 'en', 'zh']) {
    assert.equal(new URL(nav.localizedItemHref(naming, lang)).searchParams.get('lang'), lang);
    assert.equal(nav.localizedItemHref(shop, lang), shop.href);
  }
});
