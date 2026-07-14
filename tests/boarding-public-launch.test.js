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

test('false launch projection keeps dog booking and schema disabled while preparation display stays separate', () => {
  const projection = JSON.parse(read('dog-services-launch.json'));
  const preparing = JSON.parse(read('dog-services-preparing.json'));
  const projectionApi = require('../dog-services-projection.js');
  const ui = require('../dog-services-public-ui.js');
  const nav = require('../nav.js');

  assert.deepEqual(projection, { public: false });
  assert.equal(projectionApi.validateDogServicesPreparingProjection(preparing), true);
  assert.equal(projectionApi.validateDogServicesProjection(projection), true);
  for (const surface of ['boarding', 'care', 'estimate', 'estimate-care']) {
    assert.equal(ui.renderSurface(surface, projection), '', surface);
  }
  assert.deepEqual(ui.buildSchemaObjects(projection), []);

  nav.resetDogServicesLaunchForTest();
  nav.applyDogServicesLaunch(projection);
  assert.deepEqual(nav.navGroups().find((group) => group.id === 'services').items.map((item) => item.key), [
    'nav.boarding', 'nav.grooming', 'nav.shop',
  ]);

  for (const relative of ['boarding/index.html', 'boarding/estimate.html', 'grooming/index.html', 'booking.html']) {
    const source = read(relative);
    assert.doesNotMatch(source, /¥\s*(?:7,400|8,200|8,900|4,500|7,500|9,000)/, relative);
    const interactive = [...source.matchAll(/<(a|button|option)\b[^>]*>[\s\S]*?<\/\1>|<input\b[^>]*>/gi)]
      .map((match) => match[0])
      .join('\n');
    assert.doesNotMatch(interactive, /犬[^<]{0,30}(?:予約|申込)|(?:予約|申込)[^<]{0,30}犬/i, `${relative}: dog booking action`);
  }
  for (const relative of ['boarding/index.html', 'grooming/index.html']) {
    const schemas = [...read(relative).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    assert.ok(schemas.length > 0, `${relative}: base JSON-LD required`);
    for (const schema of schemas) assert.doesNotMatch(schema[1], /犬|\bdog\b|わんちゃん/i, relative);
  }
  assert.match(ui.renderSurface('boarding', preparing), /現在受付停止/);
  assert.deepEqual(ui.buildSchemaObjects(preparing), []);
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

test('chat knowledge uses the canonical care catalog and keeps dog prices explicitly stopped', () => {
  const seed = read('tools/seed-kb.js');
  const { buildChunks } = require('../tools/seed-kb.js');
  const chunk = buildChunks()['kb:boarding'];
  assert.match(seed, /'kb:boarding':\s*\n\s*formatCareKnowledge\(config\)/);
  assert.match(chunk, /保管220012B/);
  assert.match(chunk, /短毛猫 4,000円/);
  assert.match(chunk, /耳掃除 660円/);
  assert.match(chunk, /肛門腺絞り 要相談/);
  assert.match(chunk, /犬[^。]{0,240}予定価格[^。]{0,240}現在受付停止/);
  assert.match(chunk, /660円／880円／1,100円/);
  assert.match(chunk, /1,650円／2,200円／2,750円/);
  assert.match(chunk, /https:\/\/fuluckpet\.com\/boarding\//);
  assert.doesNotMatch(chunk, /フェレット|鳥類|7,400|8,200|8,900|9,000/);

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

test('admin calendar shows prepared dog categories disabled while keeping licensed categories active', () => {
  const worker = read('api/worker.js');
  const adminHtml = read('admin/calendar.html');
  const adminJs = read('admin/js/admin-calendar.js');

  assert.match(worker, /CAL_PET_TYPES\s*=\s*\[[^\]]*'dog_small'[^\]]*'dog_medium'[^\]]*'dog_large'/);
  for (const value of ['cat', 'rabbit', 'hamster', 'other_small_animal']) {
    assert.match(adminHtml, new RegExp(`option value="${value}"`));
  }
  for (const value of ['dog_small', 'dog_medium', 'dog_large']) {
    assert.match(adminHtml, new RegExp(`option value="${value}"[^>]*disabled`));
  }
  assert.match(adminHtml, /犬は現在受付停止/);
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

test('graduated-cat 30% care benefit is visible, accessible and mobile-safe', () => {
  const grooming = read('grooming/index.html');
  const estimate = read('boarding/estimate.html');
  const estimateUi = read('boarding/boarding-public-estimate.js');
  const serviceCss = read('services.css');

  assert.match(grooming, /福楽卒業猫/);
  assert.match(grooming, /30%OFF/);
  assert.match(grooming, /¥2,800/);
  assert.match(grooming, /¥4,200/);
  assert.doesNotMatch(grooming, /class=["'][^"']*\bservice-price-grid\b[^"']*["'][^>]*\bstyle=/);

  assert.match(
    estimate,
    /<label\b[^>]*\bfor=["']isGraduatedCat["'][^>]*>[\s\S]*?福楽卒業猫[\s\S]*?30%OFF[\s\S]*?<\/label>/,
  );
  assert.match(estimate, /<section\b[^>]*\baria-live=["']polite["'][^>]*>/);
  assert.match(estimateUi, /福楽卒業猫 30%OFF/);
  assert.match(estimateUi, /Calc\.calculateCatCare\(/);
  assert.doesNotMatch(estimateUi, /dogBasicCare|calculateDogBasicCare|catGroomingDiscount/);

  assert.match(
    serviceCss,
    /@media\s*\(max-width:\s*800px\)[\s\S]*?\.service-price-grid,[\s\S]*?grid-template-columns:\s*1fr/,
  );
  assert.match(
    serviceCss,
    /@media\s*\(max-width:\s*600px\)[\s\S]*?\.estimate-types,[\s\S]*?\.estimate-fields,[\s\S]*?\.estimate-result-actions[\s\S]*?grid-template-columns:\s*1fr/,
  );
});
