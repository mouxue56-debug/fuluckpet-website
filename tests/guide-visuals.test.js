'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('parse5');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
function nodes(html) {
  const result = [];
  function walk(node, translated = false) {
    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
    translated ||= Boolean(attrs['data-i18n-html']);
    result.push({ tag: node.tagName, attrs, translated });
    (node.childNodes || []).forEach(child => walk(child, translated));
  }
  walk(parse(html));
  return result;
}
test('every guide has visible illustrative imagery that survives body translation', () => {
  for (const name of fs.readdirSync(path.join(root, 'guide')).filter(n => n.endsWith('.html'))) {
    const html = read('guide/' + name);
    const images = nodes(html).filter(n => n.tag === 'img' && n.attrs.src?.startsWith('/images/guide-scenes/'));
    assert.ok(images.length > 0, name + ' needs guide imagery');
    for (const { attrs, translated } of images) {
      // Body images are mirrored in JA/EN/ZH; coverage is checked separately.
      assert.ok(Number(attrs.width) > 0 && Number(attrs.height) > 0);
      assert.ok(fs.existsSync(path.join(root, attrs.src)));
      assert.ok(attrs.srcset && attrs.sizes, 'responsive image sources required');
      assert.equal(attrs.decoding, 'async');
      if (attrs.alt) for (const lang of ['ja','en','zh']) assert.ok(attrs['data-guide-' + lang]);
    }
    assert.match(html, /AI生成|AIイメージ/);
    for (const script of [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]) {
      assert.ok(!script[1].includes('/images/guide-scenes/'), 'illustration must not become individual-cat evidence');
    }
  }
});
test('guide directory exposes a CollectionPage with all visible article destinations', () => {
  const html = read('guide/index.html');
  const schemas = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const page = schemas.find(s => s['@type'] === 'CollectionPage');
  assert.ok(page, 'directory is a CollectionPage');
  const actual = nodes(html).filter(n => n.tag === 'a' && (n.attrs.class || '').split(' ').includes('guide-card')).map(n => 'https://fuluckpet.com' + n.attrs.href).sort();
  assert.deepEqual(page.mainEntity.itemListElement.map(i => i.url).sort(), actual);
  assert.equal(new Set(actual).size, actual.length);
});
test('each article has its own subject-specific image and matching directory thumbnail', () => {
  const articles = fs.readdirSync(path.join(root, 'guide')).filter(n => n.endsWith('.html') && n !== 'index.html');
  const sources = articles.map(name => {
    const slug = name.replace('.html', '');
    const image = nodes(read('guide/' + name)).find(n => n.tag === 'img' && n.attrs.src === '/images/guide-scenes/v2/' + slug + '-960.webp');
    assert.ok(image);
    assert.match(image.attrs.src, new RegExp('/v2/' + slug + '-960\\.webp$'));
    const directory = read('guide/index.html');
    const card = directory.match(new RegExp('<a href="/guide/' + slug + '\\.html" class="guide-card"[\\s\\S]*?</a>'));
    assert.ok(card && card[0].includes(image.attrs.src), slug + ' should match its thumbnail');
    return image.attrs.src;
  });
  assert.equal(new Set(sources).size, 14, 'do not reuse decorative scenes across unrelated articles');
  assert.match(read('guide/index.html'), /guide-real-portraits/);
});
test('guide captions and alternative text follow rendered language and restore Japanese', () => {
  const elements = [
    { tagName: 'IMG', values: { ja: '猫のイメージ', en: 'Illustrative cat', zh: '猫咪示意图' } },
    { tagName: 'SPAN', values: { ja: 'AI生成のイメージ', en: 'AI-generated illustration', zh: 'AI生成示意图' } },
    { tagName: 'A', target: 'aria-label', values: { ja: 'LINEでお問い合わせ', en: 'Contact us on LINE', zh: '通过LINE联系我们' } },
  ];
  for (const el of elements) {
    el.getAttribute = key => key === 'data-guide-target' ? el.target : el.values[key.replace('data-guide-', '')];
    el.setAttribute = (key, value) => { el[key] = value; };
  }
  const events = {};
  const document = { readyState: 'complete', documentElement: { lang: 'en' }, querySelectorAll: () => elements };
  const context = vm.createContext({ document, window: { addEventListener: (key, fn) => { events[key] = fn; } } });
  vm.runInContext(read('guide/guide-visuals.js'), context);
  assert.equal(elements[0].alt, elements[0].values.en);
  assert.equal(elements[1].textContent, elements[1].values.en);
  assert.equal(elements[2]['aria-label'], elements[2].values.en);
  assert.equal(elements[2].textContent, undefined, 'do not replace link children when translating its label');
  for (const lang of ['zh', 'ja', 'invalid']) {
    document.documentElement.lang = lang;
    events.langChanged();
    const expected = lang === 'invalid' ? 'ja' : lang;
    assert.equal(elements[0].alt, elements[0].values[expected]);
    assert.equal(elements[1].textContent, elements[1].values[expected]);
  }
});
