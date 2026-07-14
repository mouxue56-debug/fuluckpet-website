'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const yen = (value) => `¥${Number(value).toLocaleString('en-US')}`;

test('public boarding prices come from a tracked licensed-scope config', () => {
  const configPath = path.join(ROOT, 'boarding-public-config.js');
  assert.equal(fs.existsSync(configPath), true, 'boarding-public-config.js must exist');
  const { CONFIG, HOLIDAYS_2026, HOLIDAYS_2027, HOLIDAYS } = require(configPath);
  const source = read('boarding-public-config.js');

  assert.deepEqual(Object.keys(CONFIG.boardingBasePrice), ['cat']);
  assert.ok(CONFIG.dogServices, 'dogServices config is required');
  assert.equal(CONFIG.dogServices.public, false);
  assert.doesNotMatch(source, /allowDraft/);
  assert.equal(CONFIG.boardingBasePrice.cat, 4800);
  assert.equal(CONFIG.catGroomingBasePrice, undefined);
  assert.deepEqual(
    CONFIG.careCatalog.cat.packages.map(({ id, price }) => [id, price]),
    [['short', 4000], ['long', 6000]],
  );
  assert.deepEqual(
    CONFIG.careCatalog.cat.items.map(({ id, price }) => [id, price]),
    [
      ['nail', 1100],
      ['ear', 660],
      ['paw', 1100],
      ['dental', 1100],
      ['anal', null],
      ['matting15', 1100],
    ],
  );
  assert.ok(HOLIDAYS_2027.includes('2027-03-22'));
  assert.ok(HOLIDAYS.includes('2026-07-20'));
  assert.ok(HOLIDAYS.includes('2027-09-23'));
  assert.deepEqual(HOLIDAYS, HOLIDAYS_2026.concat(HOLIDAYS_2027));
});

test('static service prices stay equal to the public config', () => {
  const { CONFIG } = require(path.join(ROOT, 'boarding-public-config.js'));
  const careStatic = require(path.join(ROOT, 'tools/care-catalog-static.js'));
  const boarding = read('boarding/index.html');
  const grooming = read('grooming/index.html');

  assert.ok(boarding.includes(yen(CONFIG.boardingBasePrice.cat)), 'cat boarding price');
  for (const kind of ['rabbit_cage', 'hamster_cage']) {
    for (const tier of CONFIG.smallPetBoarding[kind].tiers) {
      assert.ok(boarding.includes(yen(tier.perNight)), `${kind} ${tier.minNights} nights`);
    }
  }
  assert.equal(careStatic.isGroomingPageFresh(grooming, CONFIG.careCatalog.cat), true);
  for (const carePackage of CONFIG.careCatalog.cat.packages) {
    assert.ok(grooming.includes(yen(carePackage.price)), `${carePackage.id} care price`);
  }
  for (const item of CONFIG.careCatalog.cat.items.filter((entry) => !entry.quoteOnly)) {
    assert.ok(grooming.includes(yen(item.price)), `${item.id} care price`);
  }
  assert.match(grooming, /肛門腺絞り[\s\S]{0,120}要相談/);
  assert.equal((grooming.match(/<details\b/g) || []).length, 1, 'one static cat-care disclosure');
});

test('public estimator loads only the projected config and calculator', () => {
  const html = read('boarding/estimate.html');
  assert.match(html, /\/boarding-public-config\.js\?v=/);
  assert.match(html, /\/boarding-public-calc\.js\?v=/);
  assert.match(html, /\/boarding\/boarding-public-estimate\.js\?v=/);
  assert.doesNotMatch(html, /(?:^|\/)boarding-(?:config|calc|estimate)\.js/i);
});

test('legacy full pricing config stays absent and exactly tombstoned', () => {
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'));
  assert.equal(tracked.has('boarding-config.js'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'boarding-config.js')), false);

  const wrangler = read('api/wrangler.toml');
  assert.match(wrangler, /^workers_dev\s*=\s*true\s*$/m);
  assert.match(wrangler, /pattern\s*=\s*"fuluckpet\.com\/boarding-config\.js"/);
  assert.doesNotMatch(wrangler, /pattern\s*=\s*"(?:\*\.)?fuluckpet\.com\/\*"/);
});

test('unrelated public guide pricing has no boarding quote', () => {
  const boardingQuote = /長期お預かり|Extended Boarding|长期寄养|1,500\s*(?:円|yen|日元)\s*(?:\/|per|／)?\s*(?:日|day|天)/i;
  for (const relative of ['guide/price.html', 'guide/i18n-guide-body.js']) {
    assert.doesNotMatch(read(relative), boardingQuote, relative);
  }
});
