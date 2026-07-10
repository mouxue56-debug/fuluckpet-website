'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('404 language links point to existing localized entry pages', () => {
  const html = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');

  for (const [lang, href] of [
    ['en', '/en/kittens.html'],
    ['zh', '/zh/kittens.html'],
  ]) {
    assert.ok(html.includes(`<a href="${href}" lang="${lang}">`), `${href} link must be present`);
    assert.equal(fs.existsSync(path.join(ROOT, href.slice(1))), true, `${href} must exist`);
  }

  assert.doesNotMatch(html, /href="\/(?:en|zh)\/"/, 'language links must not lead to known 404 routes');
});
