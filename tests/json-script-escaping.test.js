'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools', 'generate-site.js');
const { safeJsonForHtmlScript } = require('../tools/safe-json-for-html');

function loadGeneratorForSite(t, siteDir) {
  fs.copyFileSync(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall) + '\nmodule.exports = { generateKittens };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

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
    'tools/care-catalog-static.js',
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
  for (const marker of ['itemListJsonLd, null, 2', 'animals, null, 2']) {
    assert.doesNotMatch(source, new RegExp(`JSON\\.stringify\\(${marker.replaceAll(', ', ',\\s*')}`));
  }
  assert.doesNotMatch(source, /const\s+(?:product|breadcrumb)JsonLd\s*=\s*(?:lang[^?]*\?\s*)?JSON\.stringify/);
});

test('generated kitten ItemList remains parseable when remote fields contain script tokens', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-item-list-json-'));
  const generator = loadGeneratorForSite(t, siteDir);
  const hostileImage = 'https://images.example.test/cat.jpg?</script><script>bad()</script>';
  generator.generateKittens([{
    breederId: 'script-safe',
    status: 'available',
    breed: '</script><script>bad()</script>',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    photos: [hostileImage],
  }]);

  const html = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  const match = html.match(/<!-- Generated kitten ItemList -->\s*<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'generated listing must contain one ItemList block');
  const itemList = JSON.parse(match[1]);
  assert.equal(itemList['@type'], 'ItemList');
  assert.equal(itemList.itemListElement[0].image, hostileImage);
  assert.doesNotMatch(match[1], /<|>|&/);
});
