'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { safeJsonForHtmlScript } = require('../tools/safe-json-for-html');

test('shared JSON script serializer preserves data without an HTML closing-script token', () => {
  const value = {
    name: '</script><script>globalThis.__jsonLdPwned=true</script>',
    separators: '\u2028\u2029',
    ampersand: '&',
  };
  const serialized = safeJsonForHtmlScript(value, 2);
  assert.doesNotMatch(serialized, /<|>|&|\u2028|\u2029/u);
  assert.deepEqual(JSON.parse(serialized), value);
});

test('every generator that embeds remote data imports the shared HTML-script serializer', () => {
  for (const relative of [
    'tools/generate-site.js',
    'tools/generate-diary.js',
    'tools/gen-blog-edu-pages.mjs',
    'tools/gen-blog-static-pages.mjs',
    'tools/translate-blog-articles.js',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(source, /safeJsonForHtmlScript/, `${relative} must use the shared serializer`);
  }
});

test('site generator HTML script payloads do not use raw JSON.stringify', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');
  for (const marker of ['products, null, 2', 'animals, null, 2']) {
    assert.doesNotMatch(source, new RegExp(`JSON\\.stringify\\(${marker.replaceAll(', ', ',\\s*')}`));
  }
  assert.doesNotMatch(source, /const\s+(?:product|breadcrumb)JsonLd\s*=\s*(?:lang[^?]*\?\s*)?JSON\.stringify/);
});
