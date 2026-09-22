'use strict';

// Product JSON-LD names the registered breeder for the Koneko account that owns the
// kitten. c995680 stays 羅方遠. d696506 is Fulluck Kitty（刘 暁棉）. Any other account
// keeps the original 羅方遠 credit and must not throw. The sentence lives only in
// JSON-LD; the visible detail body does not name a single breeder.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools/generate-site.js');
const FULLUCK = 'Fulluck Kitty（刘 暁棉）';

function loadGenerator(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1, 'generate-site.js main call boundary changed');
  source = source.slice(0, mainCall)
    + '\nmodule.exports = { generateKittenDetailPages };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

function kitten(breederId, overrides = {}) {
  return {
    breederId,
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    status: 'available',
    photos: [`https://images.example.test/${breederId}.jpg`],
    ...overrides,
  };
}

function productDescription(html) {
  const descriptions = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = JSON.parse(match[1]);
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (node && node['@type'] === 'Product') descriptions.push(node.description);
    }
  }
  assert.equal(descriptions.length, 1);
  return descriptions[0];
}

function offerPrice(html) {
  const match = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  const parsed = JSON.parse(match[1]);
  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  const product = nodes.find((node) => node && node['@type'] === 'Product');
  return product.offers.price;
}

function mainHtml(html) {
  const start = html.indexOf('<main');
  const end = html.indexOf('</main>');
  assert.ok(start !== -1 && end > start);
  return html.slice(start, end);
}

function build(t, rows) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-breeder-ld-'));
  fs.copyFileSync(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  fs.copyFileSync(path.join(ROOT, 'i18n.js'), path.join(siteDir, 'i18n.js'));
  const generator = loadGenerator(t, siteDir);
  assert.doesNotThrow(() => generator.generateKittenDetailPages(rows, [], 'ja'));
  assert.doesNotThrow(() => generator.generateKittenDetailPages(rows, [], 'en'));
  assert.doesNotThrow(() => generator.generateKittenDetailPages(rows, [], 'zh'));
  const read = (relative) => fs.readFileSync(path.join(siteDir, relative), 'utf8');
  return { read };
}

test('JSON-LD breeder credit follows the Koneko account and unknown accounts keep 羅方遠', (t) => {
  const rows = [
    kitten('list-fulluck', { group: 'd696506', breed: 'ブリティッシュショートヘア' }),
    kitten('list-fuluck', { group: 'c995680' }),
    kitten('list-unknown-group', { group: 'unknown-account' }),
    kitten('list-photo-account', {
      photos: ['https://www.koneko-breeder.com/breeder/data/d696506/child_img_1_example.jpg.webp'],
    }),
    kitten('d696506', { photos: ['https://images.example.test/account-on-breeder-id.jpg'] }),
    kitten('list-no-account'),
  ];
  const { read } = build(t, rows);

  const fulluckJa = productDescription(read('kittens/list-fulluck.html'));
  assert.match(fulluckJa, new RegExp(FULLUCK));
  assert.equal(fulluckJa.includes('羅方遠'), false);
  assert.match(productDescription(read('en/kittens/list-fulluck.html')), new RegExp(FULLUCK));
  assert.equal(productDescription(read('en/kittens/list-fulluck.html')).includes('Ra Hoen'), false);
  assert.match(productDescription(read('zh/kittens/list-fulluck.html')), new RegExp(FULLUCK));
  assert.equal(productDescription(read('zh/kittens/list-fulluck.html')).includes('罗方远'), false);
  assert.equal(mainHtml(read('kittens/list-fulluck.html')).includes(FULLUCK), false);
  assert.equal(mainHtml(read('kittens/list-fulluck.html')).includes('羅方遠'), false);
  assert.equal(offerPrice(read('kittens/list-fulluck.html')), '180000');

  const sibJa = productDescription(read('kittens/list-fuluck.html'));
  assert.match(sibJa, /ブリーダー：羅方遠/);
  assert.equal(sibJa.includes('Fulluck Kitty'), false);
  assert.match(productDescription(read('en/kittens/list-fuluck.html')), /breeder: Ra Hoen/);
  assert.match(productDescription(read('zh/kittens/list-fuluck.html')), /繁育者：罗方远/);

  for (const id of ['list-unknown-group', 'list-no-account']) {
    const description = productDescription(read(`kittens/${id}.html`));
    assert.match(description, /ブリーダー：羅方遠/);
    assert.equal(description.includes('Fulluck Kitty'), false);
  }

  assert.match(productDescription(read('kittens/list-photo-account.html')), new RegExp(FULLUCK));
  assert.match(productDescription(read('kittens/d696506.html')), new RegExp(FULLUCK));
});
