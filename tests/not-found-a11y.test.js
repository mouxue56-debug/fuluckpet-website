'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '..', '404.html'), 'utf8');

test('404 page has a skip target and disables decorative motion when requested', () => {
  assert.match(html, /<a[^>]+class="skip-link"[^>]+href="#main"/);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<main[^>]+id="main"/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.error-icon\s*\{[^}]*animation:\s*none/i);
});
