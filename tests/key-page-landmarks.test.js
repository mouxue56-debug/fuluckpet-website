'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const KEY_PAGES = [
  'index.html',
  'kittens.html',
  'parents.html',
  'faq.html',
  'blog.html',
  'booking.html',
  'waitlist.html',
  'boarding/index.html',
  'story/index.html',
];

test('key visitor journeys expose a working skip link and one main landmark', () => {
  for (const relative of KEY_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(html, /<a\b[^>]*class="[^"]*skip-link[^"]*"[^>]*href="#main"[^>]*>/, `${relative}: skip link`);
    assert.equal((html.match(/<main\b/g) || []).length, 1, `${relative}: exactly one main landmark`);
    assert.match(html, /<main\b[^>]*\bid="main"[^>]*>/, `${relative}: skip-link target`);
  }
});
