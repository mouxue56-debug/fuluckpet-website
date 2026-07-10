'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://fuluckpet.com';

function fileForUrl(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  if (pathname === '/') return path.join(ROOT, 'index.html');
  if (pathname.endsWith('/')) return path.join(ROOT, pathname.slice(1), 'index.html');
  return path.join(ROOT, pathname.slice(1));
}

test('every sitemap page exists and declares itself as canonical', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/fuluckpet\.com\/[^<]*)<\/loc>/g)]
    .map((match) => match[1]);
  const errors = [];

  for (const url of urls) {
    const file = fileForUrl(url);
    if (!fs.existsSync(file)) {
      errors.push(`${url}: missing ${path.relative(ROOT, file)}`);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
    if (canonical !== url) errors.push(`${url}: canonical=${canonical || '<missing>'}`);
  }

  assert.deepEqual(errors, [], `sitemap canonical violations:\n${errors.join('\n')}`);
});

test('all indexable self-canonical guide pages are discoverable with coherent hreflang', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const guideDir = path.join(ROOT, 'guide');
  const files = fs.readdirSync(guideDir).filter((name) => name.endsWith('.html')).sort();
  assert.equal(files.length, 15);

  for (const filename of files) {
    const html = fs.readFileSync(path.join(guideDir, filename), 'utf8');
    assert.doesNotMatch(html, /<meta\b[^>]*name="robots"[^>]*noindex/i, filename);
    const url = filename === 'index.html' ? `${BASE}/guide/` : `${BASE}/guide/${filename}`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), filename);
    for (const lang of ['ja', 'x-default']) {
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="${lang}" href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${filename}: ${lang}`);
    }
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${filename}: sitemap`);
  }
  assert.doesNotMatch(sitemap, /https:\/\/fuluckpet\.com\/guide\/index\.html/);
});
