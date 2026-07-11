'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function loadGenerator(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-kitten-path-'));
  const toolsDir = path.join(siteDir, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.copyFileSync(path.join(PROJECT, 'tools/lastmod-store.js'), path.join(toolsDir, 'lastmod-store.js'));
  fs.copyFileSync(path.join(PROJECT, 'tools/robots-meta.js'), path.join(toolsDir, 'robots-meta.js'));
  fs.copyFileSync(path.join(PROJECT, 'tools/safe-json-for-html.js'), path.join(toolsDir, 'safe-json-for-html.js'));
  fs.copyFileSync(path.join(PROJECT, 'kitten-catalog.js'), path.join(siteDir, 'kitten-catalog.js'));
  fs.copyFileSync(path.join(PROJECT, 'small-animals-launch.json'), path.join(siteDir, 'small-animals-launch.json'));
  fs.copyFileSync(path.join(PROJECT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  fs.copyFileSync(path.join(PROJECT, 'sitemap.xml'), path.join(siteDir, 'sitemap.xml'));

  const source = fs.readFileSync(path.join(PROJECT, 'tools/generate-site.js'), 'utf8');
  const mainCall = source.lastIndexOf('\nmain().catch');
  assert.notEqual(mainCall, -1);
  fs.writeFileSync(
    path.join(toolsDir, 'generate-site.js'),
    source.slice(0, mainCall) + '\nmodule.exports = { generateKittens, generateKittenDetailPages, updateSitemap };\n',
    'utf8',
  );
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return { siteDir, generator: require(path.join(toolsDir, 'generate-site.js')) };
}

test('kitten generation rejects unsafe breederId before deleting or writing any file', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const kittensDir = path.join(siteDir, 'kittens');
  fs.mkdirSync(kittensDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), 'ROOT SENTINEL', 'utf8');
  fs.writeFileSync(path.join(kittensDir, 'keep.html'), 'KEEP SENTINEL', 'utf8');

  assert.throws(() => generator.generateKittenDetailPages([{
    breederId: '../index',
    status: 'available',
    photos: ['https://images.example.test/cat.jpg'],
  }], []), /unsafe|URL segment|breederId/i);

  assert.equal(fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8'), 'ROOT SENTINEL');
  assert.equal(fs.readFileSync(path.join(kittensDir, 'keep.html'), 'utf8'), 'KEEP SENTINEL');
});

test('listing generation rejects any unsafe catalogue identity before replacing kittens.html', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const listingPath = path.join(siteDir, 'kittens.html');
  const before = fs.readFileSync(listingPath);

  assert.throws(() => generator.generateKittens([{
    breederId: '../listing-escape',
    status: 'sold',
    breed: 'サイベリアン',
    photos: ['https://images.example.test/cat.jpg'],
  }]), /unsafe|URL segment|breederId/i);
  assert.deepEqual(fs.readFileSync(listingPath), before);
});

test('sitemap generation rejects unsafe detail identities before replacing sitemap.xml', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const sitemapPath = path.join(siteDir, 'sitemap.xml');
  const before = fs.readFileSync(sitemapPath);
  const store = { lastmodForUrl: () => '2026-07-10', save: () => {} };

  assert.throws(() => generator.updateSitemap([], [{
    breederId: '../sitemap-escape',
    status: 'available',
    photos: ['https://images.example.test/cat.jpg'],
  }], store), /unsafe|URL segment|breederId/i);
  assert.deepEqual(fs.readFileSync(sitemapPath), before);
});

test('kitten generation also rejects an unsafe fallback id before mutation', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  fs.mkdirSync(path.join(siteDir, 'kittens'), { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'kittens', 'keep.html'), 'KEEP SENTINEL', 'utf8');

  assert.throws(() => generator.generateKittenDetailPages([{
    breederId: '',
    id: '../../outside',
    status: 'reserved',
    photos: ['https://images.example.test/cat.jpg'],
  }], []), /unsafe|URL segment|id/i);
  assert.equal(fs.readFileSync(path.join(siteDir, 'kittens', 'keep.html'), 'utf8'), 'KEEP SENTINEL');
});

test('duplicate detail identities generate once with the listing keep-last semantics', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const shared = {
    breederId: '2607-duplicate',
    status: 'available',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    birthday: '2026-05-01',
    price: 100000,
    photos: ['https://images.example.test/cat.jpg'],
  };
  const generated = generator.generateKittenDetailPages([
    { ...shared, name: 'Old record' },
    { ...shared, name: 'Surviving record' },
  ], []);

  assert.equal(generated.length, 1);
  assert.equal(generated[0].name, 'Surviving record');
  assert.equal(fs.readdirSync(path.join(siteDir, 'kittens')).filter((file) => file.endsWith('.html')).length, 1);
  assert.equal(fs.existsSync(path.join(siteDir, 'kittens', '2607-duplicate.html')), true);
});

test('latest sold duplicate suppresses an older available detail page and sitemap URL', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const breederId = 'task2-cross-status';
  const kittensDir = path.join(siteDir, 'kittens');
  fs.mkdirSync(kittensDir, { recursive: true });
  fs.writeFileSync(path.join(kittensDir, `${breederId}.html`), 'STALE DETAIL', 'utf8');
  const generated = generator.generateKittenDetailPages([
    {
      breederId,
      status: 'available',
      breed: 'サイベリアン',
      gender: '♂',
      color: 'ブルー',
      birthday: '2026-05-01',
      price: 100000,
      photos: ['https://images.example.test/old-available.jpg'],
    },
    {
      breederId,
      status: 'sold',
      photos: [],
    },
  ], []);

  assert.deepEqual(generated, []);
  assert.equal(fs.existsSync(path.join(siteDir, 'kittens', `${breederId}.html`)), false);

  const store = { lastmodForUrl: () => '2026-07-11', save: () => {} };
  generator.updateSitemap([], generated, store);
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, new RegExp(`/kittens/${breederId}\\.html`));
});

test('unknown read status renders as sold and never receives a detail page or sitemap URL', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const breederId = 'pending-status-fixture';
  const kitten = {
    breederId,
    status: 'pending',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    birthday: '2026-05-01',
    price: 100000,
    photos: ['https://images.example.test/pending.jpg'],
  };

  generator.generateKittens([kitten]);
  const listing = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  const card = listing.match(new RegExp(`<div class="kitten-card"[^>]*data-breeder-id="${breederId}"[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>`));
  assert.ok(card, 'fixture card should render in the static list');
  assert.match(card[0], /data-status="sold"/);
  assert.match(card[0], /class="kit-status st-sold"[^>]*>sold<\/span>/);
  assert.match(card[0], /data-detail-url=""/);
  assert.doesNotMatch(listing, new RegExp(`/kittens/${breederId}\\.html`));

  const generated = generator.generateKittenDetailPages([kitten], []);
  assert.deepEqual(generated, []);
  assert.equal(fs.existsSync(path.join(siteDir, 'kittens', `${breederId}.html`)), false);

  const store = { lastmodForUrl: () => '2026-07-11', save: () => {} };
  generator.updateSitemap([], generated, store);
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, new RegExp(`/kittens/${breederId}\\.html`));
});

test('static cards and Product data share the strict sale-price contract', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  const invalidPrices = [0, -1, 1.5, '1e3', '1,000', '', null, false, NaN, Infinity, {}, []];
  const kittens = invalidPrices.map((price, index) => ({
    breederId: `invalid-price-${index}`,
    status: 'available',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    birthday: '2026-05-01',
    price,
    photos: [`https://images.example.test/invalid-${index}.jpg`],
  }));
  kittens.push({
    breederId: 'valid-string-price',
    status: 'available',
    breed: 'サイベリアン',
    gender: '♀',
    color: 'ブルー',
    birthday: '2026-05-01',
    price: '220000',
    photos: ['https://images.example.test/valid.jpg'],
  });

  generator.generateKittens(kittens);
  const listing = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  for (let index = 0; index < invalidPrices.length; index += 1) {
    const breederId = `invalid-price-${index}`;
    const card = listing.match(new RegExp(`<div class="kitten-card"[^>]*data-breeder-id="${breederId}"[^>]*>[\\s\\S]*?<\\/div>\\s*<\\/div>`));
    assert.ok(card, breederId);
    assert.match(card[0], /data-price=""/, breederId);
    assert.match(card[0], /価格はお問い合わせください/, breederId);
    assert.doesNotMatch(listing, new RegExp(`kittens\\.html#${breederId}`), breederId);
  }

  const validCard = listing.match(/<div class="kitten-card"[^>]*data-breeder-id="valid-string-price"[^>]*>[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(validCard);
  assert.match(validCard[0], /data-price="220000"/);
  assert.match(validCard[0], /&yen;220,000/);
  assert.match(listing, /kittens\.html#valid-string-price/);
});

test('generated kitten lists contain no trailing whitespace', (t) => {
  const { siteDir, generator } = loadGenerator(t);
  generator.generateKittens([{
    breederId: 'no-trailing-space',
    status: 'available',
    breed: 'サイベリアン',
    gender: '♂',
    color: 'ブルー',
    birthday: '2026-05-01',
    price: 100000,
    photos: ['https://images.example.test/cat.jpg'],
  }]);

  const listing = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  assert.doesNotMatch(listing, /[ \t]+$/m);
});
