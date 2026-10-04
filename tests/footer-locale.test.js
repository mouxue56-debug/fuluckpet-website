'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
function runtime(hrefs, pathname = '/blog.html', search = '?lang=en') {
  const links = hrefs.map(href => ({
    attrs: { href },
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    hasAttribute(k) { return k in this.attrs; },
  }));
  const document = {
    documentElement: { lang: 'ja' },
    querySelectorAll(s) { return s === '.footer a[href]' || s === 'a[href]' ? links : []; },
    addEventListener() {},
  };
  const context = vm.createContext({document, URL, URLSearchParams, WeakMap,
    window: {location:{pathname,search}, dispatchEvent() {}},
    localStorage: {getItem(){return null;},setItem(){}},
    CustomEvent: function(name, detail){this.type=name;this.detail=detail;},
  });
  vm.runInContext(source, context);
  return {links, set(lang){context.setLanguage(lang);}, init(){context.initI18n();}};
}
test('blog footer keeps selected language through existing kitten siblings and restores Japanese', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'blog.html'), 'utf8');
  assert.match(html, /<a href="\/kittens\.html" data-i18n="nav\.allKittens">/);
  const h=runtime(['/kittens.html']);
  h.init(); assert.equal(h.links[0].attrs.href, '/en/kittens.html');
  h.set('zh'); assert.equal(h.links[0].attrs.href, '/zh/kittens.html');
  h.set('ja'); assert.equal(h.links[0].attrs.href, '/kittens.html');
});
test('footer switching works without enhanced nav and preserves query and fragment', () => {
  const h=runtime(['/en/kittens.html?utm_source=blog#available']);
  h.set('zh'); assert.equal(h.links[0].attrs.href, '/zh/kittens.html?utm_source=blog#available');
  h.set('ja'); assert.equal(h.links[0].attrs.href, '/kittens.html?utm_source=blog#available');
});
test('footer leaves external, explicit language choices and destinations without siblings unchanged', () => {
  const hrefs=['/index.html#about','/parents.html','/blog/cat-cost-monthly.html','/kittens/index.html','https://example.com/kittens.html','//example.com/kittens.html','javascript:alert(1)','/en/community/','/en/kittens.html'];
  const h=runtime(hrefs);h.links.at(-1).attrs.hreflang='en';
  h.set('zh');assert.deepEqual(h.links.map(a=>a.attrs.href),hrefs);
});

test('stale language query cannot redirect a restored Japanese footer link', () => {
  const h=runtime(['/en/kittens.html?lang=en&utm_source=blog#available']);
  h.set('ja'); assert.equal(h.links[0].attrs.href, '/kittens.html?utm_source=blog#available');
});

test('guide links keep language without losing anchors or changing assets and external links', () => {
  const h=runtime(['/guide/price.html?lang=en#guide-topic-price-1','guide/','https://outside.example/guide/','/guide/guide.css','/en/guide/bring.html']);
  h.set('zh');
  assert.equal(h.links[0].attrs.href,'/zh/guide/price.html#guide-topic-price-1');
  assert.equal(h.links[1].attrs.href,'/zh/guide/');
  assert.equal(h.links[2].attrs.href,'https://outside.example/guide/');
  assert.equal(h.links[3].attrs.href,'/guide/guide.css');
  assert.equal(h.links[4].attrs.href,'/zh/guide/bring.html');
  h.set('ja');
  assert.equal(h.links[0].attrs.href,'/guide/price.html#guide-topic-price-1');
});
