'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('all generated kitten detail pages load Google Fonts without blocking first paint', () => {
  let count = 0;
  for (const lang of ['', 'en', 'zh']) {
    const directory = path.join(ROOT, lang, 'kittens');
    for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.html') && name !== 'index.html')) {
      count += 1;
      const relative = path.join(lang, 'kittens', filename);
      const html = fs.readFileSync(path.join(directory, filename), 'utf8');
      assert.match(html, /<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/[^">]+" onload=/, `${relative}: async font stylesheet`);
      assert.match(html, /<noscript><link href="https:\/\/fonts\.googleapis\.com\//, `${relative}: no-JS font fallback`);
      const activeHtml = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
      assert.doesNotMatch(activeHtml, /<link href="https:\/\/fonts\.googleapis\.com\/[^">]+" rel="stylesheet">/, `${relative}: render-blocking font stylesheet`);
    }
  }
  assert.ok(count > 0);
});
