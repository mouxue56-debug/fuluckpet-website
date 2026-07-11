'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const LEGAL_FACTS = [
  '福楽株式会社',
  '福楽ペット',
  '大阪市城東区東中浜6丁目10番7号',
  '220012B',
  '2022年4月27日',
  '2027年4月26日',
  '動物取扱責任者',
  '羅 方遠',
];

test('boarding and cat care are indexable Japanese service destinations', () => {
  const pages = [
    ['boarding/index.html', 'https://fuluckpet.com/boarding/'],
    ['grooming/index.html', 'https://fuluckpet.com/grooming/'],
  ];

  for (const [relative, canonical] of pages) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${relative} must exist`);
    const html = read(relative);
    assert.doesNotMatch(html, /<meta\b[^>]*name=["']robots["'][^>]*noindex/i, relative);
    assert.match(html, new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
    assert.match(html, /<nav\b[^>]*class=["'][^"']*\bnav\b/i, `${relative}: desktop nav`);
    assert.match(html, /class=["'][^"']*\bmobile-nav\b/i, `${relative}: mobile nav`);
    for (const fact of LEGAL_FACTS) assert.ok(html.includes(fact), `${relative}: ${fact}`);
  }
});

test('public legal truth lists the four official categories without inventing a breeding category', () => {
  const about = read('about.html');
  const serviceCopy = `${read('boarding/index.html')}\n${read('grooming/index.html')}`;

  for (const pair of ['販売 220012A', '保管 220012B', '貸出し 220012C', '展示 220012E']) {
    assert.ok(about.includes(pair), `about.html: ${pair}`);
  }
  for (const registration of ['220012A', '220012B', '220012C', '220012E']) {
    assert.match(about, new RegExp(`第一種動物取扱業登録 ${registration}`), `JSON-LD ${registration}`);
  }
  assert.doesNotMatch(about, /"priceRange"/);
  assert.doesNotMatch(`${about}\n${serviceCopy}`, /(?:繁殖\s*220012C|220012C\s*[^<\n]{0,30}繁殖)/);
});

test('public services exclude every dog offer because 220012B does not list dogs', () => {
  const sources = [
    'boarding/index.html',
    'boarding/estimate.html',
    'grooming/index.html',
    'boarding-public-config.js',
    'boarding-public-calc.js',
    'boarding/boarding-public-estimate.js',
  ];
  for (const relative of sources) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${relative} must exist`);
    const source = read(relative);
    assert.doesNotMatch(source, /small_dog|medium_dog|large_dog|dogCarePrice|わんちゃん(?:のお預かり|基本ケア)/i, relative);
  }
});

test('sitemap exposes boarding and grooming but not the utility estimator', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/fuluckpet\.com\/boarding\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/fuluckpet\.com\/grooming\/<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/fuluckpet\.com\/boarding\/estimate\.html<\/loc>/);
});

test('machine-readable site truth names all registrations and public service URLs', () => {
  const machine = `${read('llms.txt')}\n${read('llms-full.txt')}\n${read('tools/seed-kb.js')}`;
  for (const registration of ['220012A', '220012B', '220012C', '220012E']) {
    assert.ok(machine.includes(registration), registration);
  }
  assert.ok(machine.includes('https://fuluckpet.com/boarding/'));
  assert.ok(machine.includes('https://fuluckpet.com/grooming/'));
  assert.doesNotMatch(machine, /220012C[^\n]{0,80}繁殖|繁殖[^\n]{0,80}220012C/);
});

test('chat knowledge cannot revive unlicensed dog boarding or stale price bands', () => {
  const seed = read('tools/seed-kb.js');
  const chunk = seed.match(/'kb:boarding':\s*`([\s\S]*?)`,/);
  assert.ok(chunk, 'tracked kb:boarding truth is required');
  assert.match(chunk[1], /保管220012B/);
  assert.match(chunk[1], /犬は現在受け付けていない/);
  assert.match(chunk[1], /https:\/\/fuluckpet\.com\/boarding\//);
  assert.doesNotMatch(chunk[1], /小型犬|中型犬|大型犬|フェレット|鳥類|7,400|8,200|8,900|9,000/);

  const pricing = seed.match(/'kb:pricing':\s*\n\s*'([^']+)'/);
  assert.ok(pricing, 'tracked kb:pricing truth is required');
  assert.doesNotMatch(pricing[1], /(?:14|16|29)万|¥\s*(?:140|160|290)[,.]?000/);
});

test('every static chat knowledge key is owned by the tracked seed', () => {
  const worker = read('api/worker.js');
  const seed = read('tools/seed-kb.js');
  const keyBlock = worker.match(/const KB_STATIC_KEYS = \[([\s\S]*?)\];/);
  assert.ok(keyBlock, 'KB_STATIC_KEYS block');
  const runtimeKeys = [...keyBlock[1].matchAll(/'((?:kb:)[^']+)'/g)].map((match) => match[1]).sort();
  const seededKeys = [...seed.matchAll(/^\s*'((?:kb:)[^']+)'\s*:/gm)].map((match) => match[1]).sort();
  assert.deepEqual(runtimeKeys, seededKeys);
});

test('admin boarding calendar creates only licensed-scope categories and keeps legacy labels for history', () => {
  const worker = read('api/worker.js');
  const adminHtml = read('admin/calendar.html');
  const adminJs = read('admin/js/admin-calendar.js');

  assert.match(worker, /CAL_PET_TYPES\s*=\s*\['cat',\s*'rabbit',\s*'hamster',\s*'other_small_animal'\]/);
  for (const value of ['cat', 'rabbit', 'hamster', 'other_small_animal']) {
    assert.match(adminHtml, new RegExp(`option value="${value}"`));
  }
  assert.doesNotMatch(adminHtml, /option value="(?:small_dog|medium_dog|large_dog)"/);
  assert.match(adminJs, /LEGACY_PET_TYPES/);
  assert.match(adminJs, /small_dog[\s\S]*medium_dog[\s\S]*large_dog/);
  assert.match(adminJs, /NEW_BOARDING_PET_TYPES\.indexOf\([^)]*\)\s*!==\s*-1/);
});

test('service CTAs use defined icons and estimate-only controls respect hidden state', () => {
  const style = read('style.css');
  const serviceCss = read('services.css');
  const pages = `${read('boarding/index.html')}\n${read('grooming/index.html')}`;
  for (const iconName of [...pages.matchAll(/class="ico ico-([a-z0-9-]+)"/g)].map((match) => match[1])) {
    assert.match(style, new RegExp(`\\.ico-${iconName}\\{`), iconName);
  }
  assert.doesNotMatch(pages, /ico-calculator/);
  assert.match(serviceCss, /\.estimate-main\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(read('boarding/boarding-public-estimate.js'), /discountCard\.hidden\s*=\s*!type\s*\|\|\s*isSmall/);
});
