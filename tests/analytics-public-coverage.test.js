'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('parse5');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIRS = new Set(['blog', 'guide', 'en', 'zh', 'diary', 'boarding', 'grooming', 'kittens', 'parents', 'story', 'day']);
function walk(dir, depth = 0) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return depth || PUBLIC_DIRS.has(entry.name) ? walk(path.join(dir, entry.name), depth + 1) : [];
    return entry.name.endsWith('.html') ? [path.join(dir, entry.name)] : [];
  });
}
function scripts(html) {
  const result = [];
  function walkNode(node) {
    if (node.tagName === 'script') {
      const src = (node.attrs || []).find(a => a.name === 'src');
      if (src) result.push(src.value);
    }
    for (const child of node.childNodes || []) walkNode(child);
  }
  walkNode(parse(html)); return result;
}
function assertTracking(src, label) {
  const analytics = src.filter(s => /(?:^|\/)analytics\.js(?:\?|$)/.test(s));
  const inquiry = src.filter(s => /(?:^|\/)inquiry-context\.js(?:\?|$)/.test(s));
  assert.equal(analytics.length, 1, label + ': one centralized analytics script');
  assert.equal(inquiry.length, 1, label + ': one inquiry script');
  assert.ok(src.indexOf(inquiry[0]) < src.indexOf(analytics[0]), label + ': inquiry initializes before tracking');
}
test('every public page using GA4 and shared i18n retains one centralized inquiry tracker', () => {
  let checked = 0;
  for (const filename of walk(ROOT)) {
    const src = scripts(fs.readFileSync(filename, 'utf8'));
    if (!src.some(s => /googletagmanager\.com\/gtag\//.test(s)) || !src.some(s => /(?:^|\/)i18n\.js(?:\?|$)/.test(s))) continue;
    checked++;
    assertTracking(src, path.relative(ROOT, filename));
  }
  assert.ok(checked > 250, 'must cover the published content pages as well as conversion pages');
});
test('new article, diary and animal templates retain tracking after regeneration', () => {
  let checked = 0;
  for (const relative of ['tools/gen-blog-edu-pages.mjs', 'tools/gen-blog-static-pages.mjs', 'tools/generate-diary.js', 'tools/generate-site.js']) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    // These are complete literal page tails, excluding calls that replace a closing tag.
    const tails = [...source.matchAll(/<script src="\/i18n\.js[^\n]+[\s\S]*?^<\/body>\n<\/html>/gm)];
    assert.ok(tails.length, relative + ': template tails found');
    for (const tail of tails) {
      checked++;
      assertTracking(scripts(tail[0]), relative);
    }
  }
  assert.equal(checked, 7, 'two article templates, two diary templates, and three detail/list templates');
});
