'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const https = require('node:https');
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
    'kitten-catalog.js',
    'small-animals-launch.json',
    'boarding-public-config.js',
    'dog-services-projection.js',
    'dog-services-launch.json',
    'index.html',
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
    : kittenMode === 'oversize'
      ? JSON.stringify(['x'.repeat(6 * 1024 * 1024)])
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
  if (${JSON.stringify(kittenMode)} === 'timeout' && endpoint === '/api/kittens') {
    request.setTimeout = function (_milliseconds, onTimeout) {
      process.nextTick(onTimeout);
      return request;
    };
    request.destroy = function (error) {
      process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      return request;
    };
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

for (const kittenMode of ['network', 'timeout', 'oversize', 'non-array', 'unsafe-id']) {
  test(`kittens ${kittenMode} failure exits before changing any last-good site artifact`, (t) => {
    const { siteDir, preloadPath } = createRunnableLastGoodSite(t, kittenMode);
    const before = artifactSnapshot(siteDir);
    const result = childProcess.spawnSync(
      process.execPath,
      ['--require', preloadPath, path.join(siteDir, 'tools/generate-site.js')],
      {
        cwd: siteDir,
        encoding: 'utf8',
        timeout: 3000,
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
      kittenMode === 'unsafe-id'
        ? /unsafe kitten|public URL segment/i
        : kittenMode === 'oversize'
          ? /response.*(?:large|bytes|limit)/i
          : kittenMode === 'timeout'
            ? /timed out.*kittens|kittens.*timed out/i
            : /kittens.*(?:outage|array)/i,
    );
    assert.deepEqual([...after.keys()], [...before.keys()], 'artifact file set must remain unchanged');
    for (const [rel, bytes] of before) {
      assert.deepEqual(after.get(rel), bytes, `${rel} must remain byte-identical`);
    }
  });
}

test('successful empty collections replace stale catalogue artifacts with honest empty states', (t) => {
  const { siteDir, preloadPath } = createRunnableLastGoodSite(t, 'empty');
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

  assert.equal(result.status, 0, `empty snapshot is authoritative; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const expectedEmptyCopy = {
    'index.html': '現在、掲載中の子猫はいません。',
    'kittens.html': '現在、掲載中の子猫はいません。',
    'en/kittens.html': 'There are currently no kittens listed.',
    'zh/kittens.html': '目前没有在售幼猫。',
    'parents.html': '現在、掲載中の親猫はいません。',
    'reviews.html': '現在、掲載中のレビューはありません。',
  };
  for (const [rel, copy] of Object.entries(expectedEmptyCopy)) {
    const html = fs.readFileSync(path.join(siteDir, rel), 'utf8');
    assert.match(html, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${rel} must publish an honest empty state`);
  }
  assert.match(
    fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8'),
    /<span\b[^>]*\bid=["']visibleCount["'][^>]*>0<\/span>/i,
    'homepage empty state must report zero visible kittens',
  );

  for (const rel of ['kittens', 'en/kittens', 'zh/kittens']) {
    const detailFiles = fs.readdirSync(path.join(siteDir, rel)).filter((name) => name.endsWith('.html') && name !== 'index.html');
    assert.deepEqual(detailFiles, [], `${rel} must not retain stale detail pages`);
  }
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /\/kittens\/[^<]+\.html/, 'sitemap and detail output must describe the same empty inventory');
});

for (const scenario of [
  {
    label: 'missing owned marker',
    mutate: (html) => html.replace('<!-- BEGIN GENERATED HOMEPAGE KITTENS -->', ''),
  },
  {
    label: 'missing visible count target',
    mutate: (html) => html.replace('id="visibleCount"', 'id="missingVisibleCount"'),
  },
  {
    label: 'duplicate visible count target',
    mutate: (html) => html.replace(
      /<span\b[^>]*\bid=["']visibleCount["'][^>]*>[^<]*<\/span>/i,
      (target) => target + target,
    ),
  },
]) {
  test(`homepage ${scenario.label} fails before changing any last-good artifact`, (t) => {
    const { siteDir, preloadPath } = createRunnableLastGoodSite(t, 'empty');
    const indexPath = path.join(siteDir, 'index.html');
    fs.writeFileSync(indexPath, scenario.mutate(fs.readFileSync(indexPath, 'utf8')), 'utf8');
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

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /homepage|marker|kittensGrid|visibleCount|count target|owned/i);
    assert.deepEqual([...after.keys()], [...before.keys()]);
    for (const [rel, bytes] of before) assert.deepEqual(after.get(rel), bytes, rel);
  });
}

function loadGeneratorForSite(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall) + '\nmodule.exports = { enrichKittensWithDrivePhotos, fetchJSON, generateKittens, generateKittenDetailPages };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

test('site generator wall-clock deadline does not depend on ClientRequest.setTimeout firing', async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-site-network-deadline-'));
  const generator = loadGeneratorForSite(t, siteDir);
  const originalGet = https.get;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  t.after(() => {
    https.get = originalGet;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  https.get = function () {
    const request = new EventEmitter();
    request.setTimeout = function () { return request; };
    request.destroy = function (error) {
      process.nextTick(() => request.emit('error', error || new Error('destroyed')));
      return request;
    };
    return request;
  };
  global.setTimeout = function (callback, milliseconds) {
    if (milliseconds === 15000) {
      process.nextTick(callback);
      return { testDeadline: true };
    }
    return originalSetTimeout(callback, milliseconds);
  };
  global.clearTimeout = function (timer) {
    if (!timer || !timer.testDeadline) originalClearTimeout(timer);
  };

  const harnessDeadline = new Promise((_, reject) => {
    originalSetTimeout(() => reject(new Error('test harness deadline: generator remained pending')), 100);
  });
  await assert.rejects(
    Promise.race([generator.fetchJSON('/api/kittens'), harnessDeadline]),
    /timed out.*kittens|kittens.*timed out/i,
  );
});

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
      assert.equal('shippingDetails' in product.offers, false, 'unknown shipping cost/timing must not be invented');
      assert.equal('hasMerchantReturnPolicy' in product.offers, false, 'return policy must wait for owner/legal facts');
      assert.equal('priceValidUntil' in product.offers, false, 'price validity cannot be invented without an owner source');
      for (const value of [product['@id'], product.offers.url]) {
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

test('listing Product descriptions never invent individual health or temperament traits', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-schema-truthful-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  copyFile(path.join(ROOT, 'faq.html'), path.join(siteDir, 'faq.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const kittens = [{
    id: 'row-factual',
    breederId: 'schema-factual',
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    status: 'available',
    photos: ['https://images.example.test/cat.jpg'],
  }];

  for (const lang of ['ja', 'en', 'zh']) generator.generateKittens(kittens, lang);

  const descriptions = ['ja', 'en', 'zh'].map((lang) => {
    const prefix = lang === 'ja' ? '' : `${lang}/`;
    const products = listingProducts(fs.readFileSync(path.join(siteDir, prefix, 'kittens.html'), 'utf8'));
    assert.equal(products.length, 1);
    return products[0].description;
  });

  for (const description of descriptions) {
    assert.doesNotMatch(
      description,
      /人懐こ|健康的|活発|穏やか|上品|愛らしい性格/,
      'schema may contain only catalogue facts supplied by the owner',
    );
  }
  assert.match(descriptions[0], /掲載ID schema-factual/);
});

test('missing kitten prices never become zero-price offers or visible zero-yen claims', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-price-truth-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const base = {
    breed: 'サイベリアン', color: 'ブルー', gender: '♂', birthday: '2026-05',
    status: 'available', photos: ['https://images.example.test/cat.jpg'],
  };
  const kittens = [
    { ...base, id: 'priced-row', breederId: 'priced-kitten', price: 180000 },
    { ...base, id: 'unpriced-row', breederId: 'unpriced-kitten', price: '' },
    { ...base, id: 'boolean-row', breederId: 'boolean-price-kitten', price: true },
    { ...base, id: 'array-row', breederId: 'array-price-kitten', price: [250000] },
    { ...base, id: 'object-row', breederId: 'object-price-kitten', price: {} },
  ];
  const copy = {
    ja: '価格はお問い合わせください',
    en: 'Please ask for the current price',
    zh: '价格请咨询',
  };

  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittens(kittens, lang);
    generator.generateKittenDetailPages(kittens, [], lang);
    const prefix = lang === 'ja' ? '' : `${lang}/`;
    const listing = fs.readFileSync(path.join(siteDir, prefix, 'kittens.html'), 'utf8');
    const products = listingProducts(listing);
    assert.equal(products.length, 1, `${lang} only the priced kitten can publish an Offer`);
    assert.equal(products[0].offers.price, '180000');
    assert.doesNotMatch(listing, /(?:&yen;|¥)0\b/);
    assert.match(listing, new RegExp(copy[lang]));

    const detail = fs.readFileSync(path.join(siteDir, prefix, 'kittens/unpriced-kitten.html'), 'utf8');
    assert.doesNotMatch(detail, /(?:&yen;|¥)0\b/);
    assert.doesNotMatch(detail, /"@type"\s*:\s*"Product"/, 'unpriced detail cannot publish a zero-price Product');
    assert.match(detail, new RegExp(copy[lang]));
    for (const id of ['boolean-price-kitten', 'array-price-kitten', 'object-price-kitten']) {
      const coercedDetail = fs.readFileSync(path.join(siteDir, prefix, `kittens/${id}.html`), 'utf8');
      assert.doesNotMatch(coercedDetail, /"@type"\s*:\s*"Product"/, `${lang} ${id} cannot publish a coerced Product`);
      assert.match(coercedDetail, new RegExp(copy[lang]));
    }
  }
});

test('generated kitten details have one main landmark, a working skip link, and native thumbnail controls', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-detail-landmarks-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const kittens = [{
    id: 'row-landmark',
    breederId: 'detail-landmark',
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05',
    price: 180000,
    status: 'available',
    coverIndex: 1,
    photos: ['https://images.example.test/one.jpg', 'https://images.example.test/two.jpg'],
  }];

  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittenDetailPages(kittens, [], lang);
    const prefix = lang === 'ja' ? '' : `${lang}/`;
    const html = fs.readFileSync(path.join(siteDir, prefix, 'kittens/detail-landmark.html'), 'utf8');
    assert.equal((html.match(/<main\b/g) || []).length, 1, `${lang} must have exactly one main opening tag`);
    assert.equal((html.match(/<\/main>/g) || []).length, 1, `${lang} must close main exactly once`);
    assert.match(html, /<a[^>]+class="skip-link"[^>]+href="#main"/);
    assert.ok(html.indexOf('</main>') < html.indexOf('<!-- ========== FOOTER ========== -->'), `${lang} footer must sit outside main`);
    assert.equal((html.match(/<button[^>]+class="kitten-detail-thumb/g) || []).length, 2, `${lang} thumbnails use native buttons`);
    assert.match(html, /class="kitten-detail-thumb active"[^>]+aria-pressed="true"/);
    assert.match(html, /class="kitten-detail-thumb"[^>]+aria-pressed="false"/);
    assert.doesNotMatch(html, /<img[^>]+class="kitten-detail-thumb/);
  }
});

test('Drive enrichment uses bounded concurrency instead of one serial request per kitten', async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-drive-concurrency-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const originalGet = https.get;
  t.after(() => { https.get = originalGet; });

  let activeImages = 0;
  let maxActiveImages = 0;
  https.get = function (url, options, callback) {
    if (typeof options === 'function') callback = options;
    const request = new EventEmitter();
    request.destroy = function () { return request; };
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    response.setEncoding = function () {};
    const endpoint = new URL(String(url)).pathname;
    process.nextTick(() => {
      callback(response);
      if (endpoint.includes('/api/drive/folders/')) {
        response.emit('data', JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
          name: `KIT-${index}`,
          id: `folder-${index}`,
        }))));
        response.emit('end');
        return;
      }
      activeImages += 1;
      maxActiveImages = Math.max(maxActiveImages, activeImages);
      setImmediate(() => {
        response.emit('data', JSON.stringify([{ url: `/api/drive/img/${path.basename(endpoint)}` }]));
        response.emit('end');
        activeImages -= 1;
      });
    });
    return request;
  };

  const kittens = Array.from({ length: 8 }, (_, index) => ({ breederId: `KIT-${index}`, photos: [] }));
  await generator.enrichKittensWithDrivePhotos(kittens);
  assert.ok(maxActiveImages >= 2, `expected parallel enrichment, observed ${maxActiveImages}`);
  assert.ok(maxActiveImages <= 4, `enrichment must stay bounded, observed ${maxActiveImages}`);
  assert.ok(kittens.every((kitten) => kitten.photos.length === 1));
});
