'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse, parseFragment } = require('parse5');
const { getVisual, imageMarkup } = require('../blog-visuals.js');

const ROOT = path.resolve(__dirname, '..');
const attr = (node, name) => (node.attrs || []).find(item => item.name === name)?.value;
const hasClass = (node, name) => (attr(node, 'class') || '').split(/\s+/).includes(name);
const text = node => node.value || (node.childNodes || []).map(text).join('');
function nodes(node) {
  return [node, ...(node.childNodes || []).flatMap(nodes)];
}
const cards = nodes(parse(fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8')))
  .filter(node => node.tagName === 'a' && hasClass(node, 'blog-card'));

test('every existing article has a bounded, local illustration asset', () => {
  assert.equal(cards.length, 174, 'preserve the complete article listing');
  assert.equal(new Set(cards.map(card => attr(card, 'href'))).size, 174);
  for (const card of cards) {
    const href = attr(card, 'href');
    const visual = getVisual(href);
    assert.ok(visual, 'missing illustration: ' + href);
    assert.match(visual.src, /^\/images\/[a-zA-Z0-9/_-]+\.webp$/, href);
    assert.equal(visual.width, 480);
    assert.equal(visual.height, 320);
    assert.ok(fs.statSync(path.join(ROOT, visual.src)).isFile(), visual.src);
  }
});

test('article identity survives supported locale paths, language queries and fragments', () => {
  for (const card of cards) {
    const href = attr(card, 'href');
    const original = getVisual(href);
    for (const lang of ['ja', 'en', 'zh']) {
      assert.deepEqual(getVisual(href + '?lang=' + lang + '#reading'), original, href);
      if (lang !== 'ja') {
        assert.deepEqual(getVisual('/' + lang + href + '?lang=' + lang + '#reading'), original, href);
      }
    }
  }
});

test('unknown, external and traversing addresses cannot choose or inject an image', () => {
  const href = attr(cards[0], 'href');
  const invalid = [
    null, undefined, {}, '',
    'https://evil.example' + href,
    'https://fuluckpet.com' + href,
    '//fuluckpet.com' + href,
    'javascript:alert(1)',
    '/images/example.webp',
    '/blog/unknown-article-for-test.html',
    '/de' + href,
    '/blog/../' + href.slice(1),
    '/blog/%2e%2e/' + href.slice(1),
    '/en/../' + href.slice(1),
    '/blog/..\\' + href.slice(1),
    href + '\"><img src=x onerror=alert(1)>',
  ];
  for (const value of invalid) {
    assert.equal(getVisual(value), null, String(value));
    assert.equal(imageMarkup(value, 'en'), '', String(value));
  }
});

test('illustrations have localized AI disclosure, stable dimensions and no redundant link name', () => {
  const href = attr(cards[0], 'href');
  const captions = new Set();
  for (const lang of ['ja', 'en', 'zh']) {
    const all = nodes(parseFragment(imageMarkup(href, lang)));
    const wrapper = all.find(node => hasClass(node, 'blog-card-visual'));
    const images = all.filter(node => node.tagName === 'img');
    const label = all.find(node => hasClass(node, 'blog-card-visual-label'));
    assert.ok(wrapper);
    assert.equal(images.length, 1);
    const image = images[0];
    assert.equal(attr(image, 'src'), getVisual(href).src);
    assert.equal(attr(image, 'alt'), '', 'the article title supplies the link name');
    assert.equal(attr(image, 'width'), '480');
    assert.equal(attr(image, 'height'), '320');
    assert.equal(attr(image, 'loading'), 'lazy');
    assert.ok(label, 'AI disclosure remains visible');
    assert.match(text(label), /AI/);
    assert.equal(text(label), attr(label, 'data-experience-' + lang));
    for (const translation of ['ja', 'en', 'zh']) assert.ok(attr(label, 'data-experience-' + translation));
    captions.add(text(label));
    assert.equal(all.some(node => ['script', 'iframe', 'object'].includes(node.tagName)), false);
    assert.equal(all.some(node => (node.attrs || []).some(item => /^on/i.test(item.name))), false);
  }
  assert.equal(captions.size, 3, 'each supported language has its own disclosure');
  const hostileQuery = href + '?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E&lang=en';
  assert.equal(imageMarkup(hostileQuery, 'en'), imageMarkup(href, 'en'), 'query strings never become image markup');
});


test('static cards preserve illustration markup without needing JavaScript and enrichment is idempotent', () => {
  const html = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
  const { applyBlogVisuals } = require('../tools/apply-blog-visuals.js');
  assert.equal(applyBlogVisuals(html), html);
  for (const card of cards) {
    const images = nodes(card).filter(node => node.tagName === 'img');
    assert.equal(images.length, 1, attr(card, 'href'));
    assert.equal(attr(images[0], 'src'), getVisual(attr(card, 'href')).src);
    assert.equal(attr(images[0], 'loading'), 'lazy');
  }
});
