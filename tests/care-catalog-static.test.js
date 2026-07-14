'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const { CONFIG } = require('../boarding-public-config.js');
const catalogStatic = require('../tools/care-catalog-static.js');

const {
  SCHEMA_START,
  SCHEMA_END,
  MENU_START,
  MENU_END,
  renderCatCareSchema,
  renderCatCareMenu,
  buildGroomingPage,
  writeGroomingPage,
  isGroomingPageFresh,
  formatCareKnowledge,
} = catalogStatic;

function fixture(schemaBody = 'old schema', menuBody = 'old menu') {
  return [
    '<!doctype html><head>',
    SCHEMA_START,
    schemaBody,
    SCHEMA_END,
    '</head><body>',
    MENU_START,
    menuBody,
    MENU_END,
    '</body>',
  ].join('\n');
}

function schemaObject(rendered) {
  const match = rendered.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'cat care schema script');
  return JSON.parse(match[1]);
}

test('cat care schema contains the exact numeric catalog without consultation-only offers', () => {
  const rendered = renderCatCareSchema(CONFIG.careCatalog.cat);
  const schema = schemaObject(rendered);

  assert.equal(schema['@type'], 'Service');
  assert.equal(schema.offers.length, 7);
  assert.deepEqual(
    schema.offers.map((offer) => [offer.name, Number(offer.price)]),
    [
      ['短毛猫', 4000],
      ['長毛猫', 6000],
      ['爪切り', 1100],
      ['耳掃除', 660],
      ['足裏・足まわり', 1100],
      ['歯みがき', 1100],
      ['毛玉・ブラッシング（15分）', 1100],
    ],
  );
  assert.doesNotMatch(JSON.stringify(schema), /肛門腺|犬|Dog/i);
});

test('cat care menu is package-first with one closed disclosure for every single item', () => {
  const rendered = renderCatCareMenu(CONFIG.careCatalog.cat);

  assert.equal((rendered.match(/<details\b/g) || []).length, 1);
  assert.doesNotMatch(rendered.match(/<details\b[^>]*>/)[0], /\bopen\b/);
  assert.equal((rendered.match(/class="service-price-card/g) || []).length, 3);
  for (const copy of [
    '短毛猫', '¥4,000', '長毛猫', '¥6,000', '福楽卒業猫', '30%OFF', '¥2,800', '¥4,200',
    '爪切り', '¥1,100', '耳掃除', '¥660', '足裏・足まわり', '歯みがき',
    '肛門腺絞り', '要相談', '毛玉・ブラッシング', '15分',
  ]) assert.match(rendered, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('visible catalog text and JSON script data are escaped without changing their values', () => {
  const hostile = structuredClone(CONFIG.careCatalog.cat);
  hostile.packages[0].label = '</script><script>globalThis.pwned=true</script>&';
  hostile.items[0].label = '<img src=x onerror=globalThis.pwned=true>';

  const menu = renderCatCareMenu(hostile);
  const schemaText = renderCatCareSchema(hostile);
  const schema = schemaObject(schemaText);
  const schemaPayload = schemaText.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];

  assert.doesNotMatch(menu, /<img|<script/);
  assert.match(menu, /&lt;img/);
  assert.doesNotMatch(schemaPayload, /[<>&]/);
  assert.equal(schema.offers[0].name, hostile.packages[0].label);
  assert.equal(schema.offers[2].name, hostile.items[0].label);
});

test('grooming marker renderer is deterministic, idempotent, and detects staleness', () => {
  const original = fixture();
  const built = buildGroomingPage(original, CONFIG.careCatalog.cat);

  assert.notEqual(built, original);
  assert.equal(buildGroomingPage(built, CONFIG.careCatalog.cat), built);
  assert.equal(isGroomingPageFresh(built, CONFIG.careCatalog.cat), true);
  assert.equal(isGroomingPageFresh(built.replace('¥4,000', '¥4,001'), CONFIG.careCatalog.cat), false);
  for (const marker of [SCHEMA_START, SCHEMA_END, MENU_START, MENU_END]) {
    assert.equal(built.split(marker).length - 1, 1, marker);
  }
});

test('marker errors fail closed and writeGroomingPage preserves the original bytes', (t) => {
  for (const malformed of [
    fixture().replace(SCHEMA_START, ''),
    fixture() + '\n' + MENU_END,
    fixture().replace(`${MENU_START}\nold menu\n${MENU_END}`, `${MENU_END}\nold menu\n${MENU_START}`),
  ]) {
    assert.throws(() => buildGroomingPage(malformed, CONFIG.careCatalog.cat), /marker|generated cat care/i);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-care-marker-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'grooming.html');
  const malformed = fixture().replace(MENU_END, '');
  fs.writeFileSync(file, malformed);
  assert.throws(() => writeGroomingPage(file, CONFIG.careCatalog.cat), /marker|generated cat care/i);
  assert.deepEqual(fs.readFileSync(file), Buffer.from(malformed));
});

test('care knowledge is config-derived and keeps stopped dog prices next to their status', () => {
  const text = formatCareKnowledge(CONFIG);
  for (const value of [
    '保管220012B', '猫は1泊4,800円', '短毛猫 4,000円', '長毛猫 6,000円',
    '爪切り 1,100円', '耳掃除 660円', '肛門腺絞り 要相談', '毛玉・ブラッシング 1,100円／15分',
    '660円／880円／1,100円', '1,650円／2,200円／2,750円',
    '予定価格', '現在受付停止',
    'https://fuluckpet.com/boarding/', 'https://fuluckpet.com/boarding/estimate.html', 'https://fuluckpet.com/grooming/',
  ]) assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /犬[^。]{0,240}予定価格[^。]{0,240}現在受付停止/);
});

test('verify-generated rejects a stale grooming menu or schema block', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-care-verifier-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  for (const relative of [
    'tools/verify-generated.js', 'tools/robots-meta.js', 'tools/safe-json-for-html.js',
    'tools/care-catalog-static.js', 'boarding-public-config.js', 'dog-services-projection.js',
    'dog-services-launch.json', 'dog-services-preparing.json', 'grooming/index.html',
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

  const run = () => spawnSync(process.execPath, [path.join(site, 'tools/verify-generated.js')], {
    cwd: site,
    encoding: 'utf8',
  });
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);

  const grooming = path.join(site, 'grooming/index.html');
  fs.writeFileSync(grooming, fs.readFileSync(grooming, 'utf8').replace('¥660', '¥661'));
  const stale = run();
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /\[care-catalog\] grooming\/index\.html is stale/);
});
