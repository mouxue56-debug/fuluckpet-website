'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const { CONFIG } = require('../boarding-public-config.js');
const {
  TRANSPORT_START,
  TRANSPORT_END,
  assertTransportConfig,
  renderTransportSection,
  buildTransportPage,
  writeTransportPage,
  isTransportPageFresh,
  formatTransportKnowledge,
} = require('../tools/transport-service-static.js');

function fixture(body = 'old transport') {
  return ['<!doctype html><main>', TRANSPORT_START, body, TRANSPORT_END, '</main>'].join('\n');
}

test('pet transport config is the canonical five-tier price source', () => {
  assert.deepEqual(CONFIG.petTransport, {
    discountEligible: false,
    tiers: [
      { id: 'within3', label: '3km以内', maxKmInclusive: 3, status: 'priced', oneWayPrice: 1650, roundTripPrice: 3300 },
      { id: 'over3to5', label: '3kmを超え5km以内', minKmExclusive: 3, maxKmInclusive: 5, status: 'priced', oneWayPrice: 2200, roundTripPrice: 4400 },
      { id: 'over5to10', label: '5kmを超え10km以内', minKmExclusive: 5, maxKmInclusive: 10, status: 'priced', oneWayPrice: 3300, roundTripPrice: 6600 },
      { id: 'over10to20', label: '10kmを超え20km以内', minKmExclusive: 10, maxKmInclusive: 20, status: 'quote', oneWayPrice: null, roundTripPrice: null },
      { id: 'over20', label: '20km超', minKmExclusive: 20, maxKmInclusive: null, status: 'unavailable', oneWayPrice: null, roundTripPrice: null },
    ],
  });
  assert.doesNotThrow(() => assertTransportConfig(CONFIG.petTransport));
});

test('transport renderer emits one accessible table with all prices and boundaries', () => {
  const rendered = renderTransportSection(CONFIG.petTransport);

  assert.equal((rendered.match(/<table\b/g) || []).length, 1);
  assert.match(rendered, /<table\b[^>]*aria-labelledby="pet-transport-heading"/);
  assert.equal((rendered.match(/<tbody>[\s\S]*?<tr>/g) || []).length, 1);
  for (const copy of [
    'お預かり・ケア利用時のペット送迎', '片道1回', 'お迎え＋お送り',
    '3km以内', '¥1,650', '¥3,300',
    '3kmを超え5km以内', '¥2,200', '¥4,400',
    '5kmを超え10km以内', '¥6,600',
    '10kmを超え20km以内', 'LINEでお見積り',
    '20km超', '送迎対応なし', '割引対象外', '子猫のお届けとは別料金',
    '表示は税込の参考価格です。距離と送迎可否は、住所と日程を確認のうえ当店が確定します。',
  ]) assert.match(rendered, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal((rendered.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length, 5);
});

test('transport renderer escapes configured labels', () => {
  const hostile = structuredClone(CONFIG.petTransport);
  hostile.tiers[0].label = '<img src=x onerror=globalThis.pwned=true>&';

  const rendered = renderTransportSection(hostile);
  assert.doesNotMatch(rendered, /<img/);
  assert.match(rendered, /&lt;img/);
  assert.match(rendered, /&amp;/);
});

test('transport marker renderer is deterministic, idempotent, and detects staleness', () => {
  const original = fixture();
  const built = buildTransportPage(original, CONFIG.petTransport);

  assert.notEqual(built, original);
  assert.equal(buildTransportPage(built, CONFIG.petTransport), built);
  assert.equal(isTransportPageFresh(built, CONFIG.petTransport), true);
  assert.equal(isTransportPageFresh(built.replace('¥1,650', '¥1,651'), CONFIG.petTransport), false);
  assert.equal(built.split(TRANSPORT_START).length - 1, 1);
  assert.equal(built.split(TRANSPORT_END).length - 1, 1);
});

test('malformed markers and invalid tier arithmetic fail before writing', (t) => {
  for (const malformed of [
    fixture().replace(TRANSPORT_START, ''),
    fixture() + `\n${TRANSPORT_END}`,
    fixture().replace(`${TRANSPORT_START}\nold transport\n${TRANSPORT_END}`, `${TRANSPORT_END}\nold transport\n${TRANSPORT_START}`),
  ]) assert.throws(() => buildTransportPage(malformed, CONFIG.petTransport), /marker|generated pet transport/i);

  const invalid = structuredClone(CONFIG.petTransport);
  invalid.tiers[1].roundTripPrice = 4300;
  assert.throws(() => assertTransportConfig(invalid), /round.trip|arithmetic|price/i);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-transport-marker-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'boarding.html');
  const original = fixture();
  fs.writeFileSync(file, original);
  assert.throws(() => writeTransportPage(file, invalid), /round.trip|arithmetic|price/i);
  assert.deepEqual(fs.readFileSync(file), Buffer.from(original));
});

test('transport knowledge contains the three numeric tiers and service limits', () => {
  const text = formatTransportKnowledge(CONFIG.petTransport);
  for (const copy of [
    '3km以内は片道1回1,650円・お迎え＋お送り3,300円',
    '3kmを超え5km以内は片道1回2,200円・お迎え＋お送り4,400円',
    '5kmを超え10km以内は片道1回3,300円・お迎え＋お送り6,600円',
    '10kmを超え20km以内はLINEでお見積り', '20km超は送迎対応なし',
    '割引対象外', '子猫のお届けとは別料金',
    '表示は税込の参考価格です。距離と送迎可否は、住所と日程を確認のうえ当店が確定します。',
  ]) assert.match(text, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('both generated service pages publish the exact tax and final-confirmation sentence', () => {
  const sentence = '表示は税込の参考価格です。距離と送迎可否は、住所と日程を確認のうえ当店が確定します。';
  for (const relative of ['boarding/index.html', 'grooming/index.html']) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.equal(source.split(sentence).length - 1, 1, relative);
    assert.equal(isTransportPageFresh(source, CONFIG.petTransport), true, relative);
  }
});

test('verify-generated rejects either stale transport page', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-transport-verifier-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  for (const relative of [
    'tools/verify-generated.js', 'tools/robots-meta.js', 'tools/safe-json-for-html.js',
    'tools/care-catalog-static.js', 'tools/transport-service-static.js', 'boarding-public-config.js',
    'dog-services-projection.js', 'dog-services-launch.json', 'dog-services-preparing.json',
    'boarding/index.html', 'grooming/index.html',
  ]) {
    const target = path.join(site, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), target);
  }
  fs.writeFileSync(path.join(site, 'kittens.html'), [
    '<link href="/style.css?v=test">', '<link href="/nav.css?v=test">',
    '<script src="/i18n.js?v=test"></script>', '<script src="/nav.js?v=test"></script>',
  ].join('\n'));
  fs.writeFileSync(path.join(site, 'sitemap.xml'), [
    '<urlset>', '<!-- 成長日記 -->', '<!-- /成長日記 -->', '<!-- 子猫詳細ページ -->',
    '<!-- ブログ記事 -->', '<url><loc>https://fuluckpet.com/kittens.html</loc></url>', '</urlset>',
  ].join('\n'));

  for (const relative of ['boarding/index.html', 'grooming/index.html']) {
    const file = path.join(site, relative);
    const marker = relative.startsWith('boarding')
      ? '<div data-dog-services-surface="boarding"></div>'
      : '<div data-dog-services-surface="care"></div>';
    let source = fs.readFileSync(file, 'utf8');
    if (!source.includes(TRANSPORT_START)) {
      source = source.replace(marker, `${marker}\n${TRANSPORT_START}\n${TRANSPORT_END}`);
    }
    fs.writeFileSync(file, source);
    writeTransportPage(file, CONFIG.petTransport);
  }

  const run = () => spawnSync(process.execPath, [path.join(site, 'tools/verify-generated.js')], {
    cwd: site,
    encoding: 'utf8',
  });
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);

  const boarding = path.join(site, 'boarding/index.html');
  fs.writeFileSync(boarding, fs.readFileSync(boarding, 'utf8').replace('¥1,650', '¥1,651'));
  const stale = run();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /\[pet-transport\] boarding\/index\.html is stale/);
});
