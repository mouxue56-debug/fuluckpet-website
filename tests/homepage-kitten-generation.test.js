'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const KittenCatalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools/generate-site.js');
const START = '<!-- BEGIN GENERATED HOMEPAGE KITTENS -->';
const END = '<!-- END GENERATED HOMEPAGE KITTENS -->';

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function loadGenerator(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall)
    + '\nmodule.exports = { generateKittens, generateHomepageKittens, validateHomepageKittensMarkers };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

function setupSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-homepage-kittens-'));
  copy(path.join(ROOT, 'index.html'), path.join(siteDir, 'index.html'));
  copy(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  return { siteDir, generator: loadGenerator(t, siteDir) };
}

function kittenCards(html) {
  const cards = [];
  const opening = /<div class="kitten-card"([^>]*)>/g;
  let match;
  while ((match = opening.exec(html))) {
    const tags = /<div\b[^>]*>|<\/div>/gi;
    tags.lastIndex = match.index;
    let depth = 0;
    let tag;
    while ((tag = tags.exec(html))) {
      if (/^<div\b/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        const attrs = Object.create(null);
        for (const attribute of match[1].matchAll(/\b(data-[a-z-]+)="([^"]*)"/g)) {
          attrs[attribute[1]] = attribute[2];
        }
        cards.push({ attrs, html: html.slice(match.index, tags.lastIndex) });
        opening.lastIndex = tags.lastIndex;
        break;
      }
    }
  }
  return cards;
}

function visibleCountValue(html) {
  const matches = [...html.matchAll(/<span\b[^>]*\bid=["']visibleCount["'][^>]*>([^<]*)<\/span>/gi)];
  assert.equal(matches.length, 1, 'homepage must expose exactly one simple #visibleCount target');
  const value = Number(matches[0][1].trim());
  assert.ok(Number.isSafeInteger(value) && value >= 0, '#visibleCount must contain a non-negative integer');
  return value;
}

function maskVisibleCount(html) {
  return html.replace(
    /(<span\b[^>]*\bid=["']visibleCount["'][^>]*>)[^<]*(<\/span>)/i,
    '$1COUNT$2',
  );
}

function baseKitten(breederId, overrides = {}) {
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

test('tracked homepage owns exactly one bounded generated kittens block', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(html.split(START).length - 1, 1);
  assert.equal(html.split(END).length - 1, 1);
  const grid = html.indexOf('id="kittensGrid"');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  const controls = html.indexOf('id="loadMoreArea"');
  assert.ok(grid >= 0 && grid < start && start < end && end < controls);
});

test('tracked homepage visible count matches its current generated fallback cards', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const owned = html.slice(html.indexOf(START) + START.length, html.indexOf(END));
  assert.equal(visibleCountValue(html), kittenCards(owned).length);
});

test('homepage fallback is the ordered eligible subset of the complete list snapshot', (t) => {
  const { siteDir, generator } = setupSite(t);
  const kittens = [
    baseKitten('2601-01855', { status: 'available', price: 250000 }),
    baseKitten('home-featured', { promotionTag: 'featured', promotionPriority: 999, birthday: '2026-01-01', price: '220000' }),
    baseKitten('home-campaign', { promotionTag: 'campaign', promotionPriority: 50, birthday: '2026-02-01' }),
    baseKitten('home-a1', { birthday: '2026-07-01' }),
    baseKitten('home-a2', { birthday: '2026-06-01' }),
    baseKitten('home-a3', { birthday: '2026-05-01' }),
    baseKitten('home-a4', { birthday: '2026-04-01' }),
    baseKitten('home-a5', { birthday: '2026-03-01' }),
    baseKitten('home-r1', { breed: 'サイベリアン×ブリティッシュ', status: 'reserved', promotionTag: 'campaign', promotionPriority: 5, price: null }),
    baseKitten('home-r2', { status: 'reserved', birthday: '2026-06-01' }),
    baseKitten('home-r3', { status: 'reserved', birthday: '2026-01-01' }),
    baseKitten('other-breed', { breed: 'ラグドール' }),
    baseKitten('unsafe-photo', { photos: ['javascript:alert(1)'] }),
    baseKitten('missing-photo', { photos: [] }),
    baseKitten('unknown-status', { status: 'pending' }),
    baseKitten('2601-01855', { status: 'sold', price: 250000 }),
  ];
  const intended = new Set([
    'home-featured', 'home-campaign', 'home-a1', 'home-a2', 'home-a3',
    'home-a4', 'home-a5', 'home-r1', 'home-r2', 'home-r3',
  ]);
  const expectedIds = KittenCatalog.orderKittens(kittens)
    .filter((kitten) => intended.has(kitten.breederId))
    .slice(0, 9)
    .map((kitten) => kitten.breederId);
  const indexPath = path.join(siteDir, 'index.html');
  const stale = fs.readFileSync(indexPath, 'utf8').replace(
    /(<span\b[^>]*\bid=["']visibleCount["'][^>]*>)[^<]*(<\/span>)/i,
    (_match, open, close) => `${open}77${close}`,
  );
  fs.writeFileSync(indexPath, stale, 'utf8');
  const before = fs.readFileSync(indexPath, 'utf8');

  generator.generateKittens(kittens);
  generator.generateHomepageKittens(kittens);

  const after = fs.readFileSync(indexPath, 'utf8');
  const homepage = kittenCards(after);
  const fullList = kittenCards(fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8'));
  assert.deepEqual(homepage.map((card) => card.attrs['data-breeder-id']), expectedIds);
  assert.equal(homepage.length, 9);
  assert.equal(visibleCountValue(after), homepage.length);
  assert.equal(homepage.some((card) => card.attrs['data-breeder-id'] === '2601-01855'), false);
  for (const absent of ['other-breed', 'unsafe-photo', 'missing-photo', 'unknown-status']) {
    assert.equal(homepage.some((card) => card.attrs['data-breeder-id'] === absent), false, absent);
  }

  const fullById = new Map(fullList.map((card) => [card.attrs['data-breeder-id'], card]));
  for (const home of homepage) {
    const full = fullById.get(home.attrs['data-breeder-id']);
    assert.ok(full, home.attrs['data-breeder-id']);
    for (const field of ['data-status', 'data-price', 'data-promotion-tag', 'data-promotion-priority']) {
      assert.equal(home.attrs[field], full.attrs[field], `${home.attrs['data-breeder-id']}: ${field}`);
    }
    assert.match(home.html, new RegExp(`st-${home.attrs['data-status']}`));
    if (home.attrs['data-promotion-tag']) {
      assert.match(home.html, new RegExp(`kitten-promotion-chip[\\s\\S]*data-promotion-tag="${home.attrs['data-promotion-tag']}"`));
    }
  }
  assert.match(fullById.get('2601-01855').html, /data-status="sold"/);
  assert.match(fullById.get('2601-01855').html, /st-sold/);

  assert.equal(
    maskVisibleCount(after.slice(0, after.indexOf(START) + START.length)),
    maskVisibleCount(before.slice(0, before.indexOf(START) + START.length)),
  );
  assert.equal(after.slice(after.indexOf(END)), before.slice(before.indexOf(END)));
});

test('homepage fallback emits the existing honest empty state', (t) => {
  const { siteDir, generator } = setupSite(t);
  generator.generateHomepageKittens([]);
  const html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  const owned = html.slice(html.indexOf(START) + START.length, html.indexOf(END));
  assert.match(owned, /class="catalog-empty"[^>]*role="status"[^>]*data-generated-empty="true"/);
  assert.match(owned, /現在、掲載中の子猫はいません。/);
  assert.doesNotMatch(owned, /class="kitten-card"/);
  assert.equal(visibleCountValue(html), 0);
});

test('homepage generator rejects invalid owned markers without mutating the file', (t) => {
  const { siteDir, generator } = setupSite(t);
  const indexPath = path.join(siteDir, 'index.html');
  const valid = `<main><span id="visibleCount">1</span><div id="kittensGrid">${START}OLD${END}</div><aside>KEEP</aside></main>`;
  const invalidTemplates = [
    valid.replace(START, ''),
    valid.replace(START, START + START),
    `<main><div id="kittensGrid">${END}OLD${START}</div></main>`,
    `${START}OUTSIDE${END}<main><div id="kittensGrid">OLD</div></main>`,
    valid.replace('id="visibleCount"', 'id="missingVisibleCount"'),
    valid.replace('</span>', '</span><span id="visibleCount">2</span>'),
  ];

  for (const html of invalidTemplates) {
    fs.writeFileSync(indexPath, html, 'utf8');
    const before = fs.readFileSync(indexPath);
    assert.throws(
      () => generator.generateHomepageKittens([baseKitten('safe-row')]),
      /homepage|marker|kittensGrid|visibleCount|count target|owned/i,
    );
    assert.deepEqual(fs.readFileSync(indexPath), before);
  }
});
