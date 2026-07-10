'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('localized blog pages agree on self canonical, Open Graph URL, schema URL, and sitemap', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const files = [];
  for (const lang of ['en', 'zh']) {
    const dir = path.join(ROOT, lang, 'blog');
    for (const filename of fs.readdirSync(dir).filter((name) => name.endsWith('.html')).sort()) {
      files.push({ lang, filename, path: path.join(dir, filename) });
    }
  }
  assert.equal(files.length, 10);

  for (const item of files) {
    const html = fs.readFileSync(item.path, 'utf8');
    const self = `https://fuluckpet.com/${item.lang}/blog/${item.filename}`;
    const quotedSelf = self.replaceAll('.', '\\.');
    assert.match(html, new RegExp(`<link rel="canonical" href="${quotedSelf}"`), `${item.lang}/${item.filename} canonical`);
    assert.match(html, new RegExp(`<meta property="og:url" content="${quotedSelf}"`), `${item.lang}/${item.filename} og:url`);
    assert.match(html, new RegExp(`"mainEntityOfPage"\\s*:\\s*\\{[^}]*"@id"\\s*:\\s*"${quotedSelf}"`), `${item.lang}/${item.filename} schema`);
    assert.match(html, new RegExp(`"position"\\s*:\\s*3[^}]*"item"\\s*:\\s*"${quotedSelf}"`), `${item.lang}/${item.filename} breadcrumb schema`);
    assert.match(sitemap, new RegExp(`<loc>${quotedSelf}<\\/loc>`), `${item.lang}/${item.filename} sitemap`);
  }
});
