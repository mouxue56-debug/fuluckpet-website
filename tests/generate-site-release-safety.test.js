'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools', 'generate-site.js');

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, targetPath);
    else if (entry.isFile()) copyFile(sourcePath, targetPath);
  }
}

function artifactSnapshot(siteDir) {
  const snapshot = new Map();
  function visit(absDir, relDir = '') {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (relDir === '' && entry.name === 'tools') continue;
      const rel = path.join(relDir, entry.name);
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) visit(abs, rel);
      else if (entry.isFile()) snapshot.set(rel.split(path.sep).join('/'), fs.readFileSync(abs));
    }
  }
  visit(siteDir);
  return snapshot;
}

function createRunnableLastGoodSite(t, kittenMode) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-site-last-good-'));
  const toolsDir = path.join(siteDir, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });

  for (const rel of [
    'tools/generate-site.js',
    'tools/lastmod-store.js',
    'tools/robots-meta.js',
    'tools/safe-json-for-html.js',
    'small-animals-launch.json',
    'kittens.html',
    'en/kittens.html',
    'zh/kittens.html',
    'parents.html',
    'reviews.html',
    'sitemap.xml',
    'feed.xml',
    'catalog-i18n.js',
  ]) {
    copyFile(path.join(ROOT, rel), path.join(siteDir, rel));
  }
  for (const rel of ['kittens', 'en/kittens', 'zh/kittens']) {
    copyTree(path.join(ROOT, rel), path.join(siteDir, rel));
  }

  const unsafeKitten = [{
    id: 'safe-row-id',
    breederId: '../escape',
    status: 'available',
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    photos: ['https://images.example.test/cat.jpg'],
  }];
  const kittenPayload = kittenMode === 'non-array'
    ? JSON.stringify({ success: true, items: [] })
    : JSON.stringify(kittenMode === 'unsafe-id' ? unsafeKitten : []);
  const preloadPath = path.join(toolsDir, 'fake-https.js');
  fs.writeFileSync(preloadPath, `'use strict';
const https = require('node:https');
const { EventEmitter } = require('node:events');
https.get = function (url, options, callback) {
  if (typeof options === 'function') callback = options;
  const request = new EventEmitter();
  const endpoint = new URL(String(url)).pathname;
  if (${JSON.stringify(kittenMode)} === 'network' && endpoint === '/api/kittens') {
    process.nextTick(() => request.emit('error', new Error('simulated kittens outage')));
    return request;
  }
  const response = new EventEmitter();
  response.statusCode = 200;
  response.setEncoding = function () {};
  process.nextTick(() => {
    callback(response);
    const payload = endpoint === '/api/kittens'
      ? ${JSON.stringify(kittenPayload)}
      : '[]';
    response.emit('data', payload);
    response.emit('end');
  });
  return request;
};
`, 'utf8');

  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return { siteDir, preloadPath };
}

for (const kittenMode of ['network', 'non-array', 'unsafe-id']) {
  test(`kittens ${kittenMode} failure exits before changing any last-good site artifact`, (t) => {
    const { siteDir, preloadPath } = createRunnableLastGoodSite(t, kittenMode);
    const before = artifactSnapshot(siteDir);
    const result = childProcess.spawnSync(
      process.execPath,
      ['--require', preloadPath, path.join(siteDir, 'tools/generate-site.js')],
      {
        cwd: siteDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          SMALL_ANIMALS_DARK_SLUG: '',
          FULUCK_ADMIN_PASS: '',
        },
      },
    );
    const after = artifactSnapshot(siteDir);

    assert.notEqual(result.status, 0, `release generator must fail closed; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      kittenMode === 'unsafe-id' ? /unsafe kitten|public URL segment/i : /kittens.*(?:outage|array)/i,
    );
    assert.deepEqual([...after.keys()], [...before.keys()], 'artifact file set must remain unchanged');
    for (const [rel, bytes] of before) {
      assert.deepEqual(after.get(rel), bytes, `${rel} must remain byte-identical`);
    }
  });
}

function loadGeneratorForSite(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall) + '\nmodule.exports = { generateKittens, generateKittenDetailPages };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

function listingProducts(html) {
  const match = html.match(/<!-- Per-kitten Product schema \(generated by SEO sweep\) -->\s*<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'generated listing must contain its Product schema block');
  return JSON.parse(match[1]);
}

test('listing Product schemas only advertise kittens with generated detail pages', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-schema-detail-url-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  copyFile(path.join(ROOT, 'faq.html'), path.join(siteDir, 'faq.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const base = {
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    photos: ['https://images.example.test/cat.jpg'],
  };
  const kittens = [
    { ...base, id: 'row-available', breederId: 'schema-available', status: 'available' },
    { ...base, id: 'row-reserved', breederId: 'schema-reserved', status: 'reserved' },
    { ...base, id: 'row-sold', breederId: 'schema-sold', status: 'sold' },
  ];

  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittens(kittens, lang);
    generator.generateKittenDetailPages(kittens, [], lang);
  }

  for (const lang of ['ja', 'en', 'zh']) {
    const prefix = lang === 'ja' ? '' : `${lang}/`;
    const listPath = path.join(siteDir, prefix, 'kittens.html');
    const products = listingProducts(fs.readFileSync(listPath, 'utf8'));
    assert.equal(products.length, 2, `${lang} schema must omit sold inventory without a detail page`);
    assert.doesNotMatch(JSON.stringify(products), /schema-sold/);

    for (const product of products) {
      for (const value of [product['@id'], product.offers.url, product.offers.hasMerchantReturnPolicy.merchantReturnLink]) {
        const url = new URL(value);
        assert.equal(url.origin, 'https://fuluckpet.com');
        const rel = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
        assert.equal(fs.existsSync(path.join(siteDir, rel)), true, `${value} must resolve to a generated or existing site file`);
      }
    }
  }

  assert.equal(fs.existsSync(path.join(siteDir, 'kittens/schema-sold.html')), false);
  assert.equal(fs.existsSync(path.join(siteDir, 'en/kittens/schema-sold.html')), false);
  assert.equal(fs.existsSync(path.join(siteDir, 'zh/kittens/schema-sold.html')), false);
});
