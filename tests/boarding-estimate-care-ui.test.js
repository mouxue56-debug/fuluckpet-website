'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function tagWithId(html, tagName, id) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
  assert.ok(match, `${tagName}#${id} is required`);
  return match[0];
}

test('estimate dates expose the extended supported range and accessible errors', () => {
  const html = read('boarding/estimate.html');
  const checkIn = tagWithId(html, 'input', 'checkIn');
  const checkOut = tagWithId(html, 'input', 'checkOut');
  const dateError = tagWithId(html, 'p', 'dateError');

  assert.match(checkIn, /\bmax=["']2027-12-31["']/);
  assert.match(checkOut, /\bmax=["']2028-01-01["']/);
  for (const input of [checkIn, checkOut]) {
    assert.match(input, /\baria-describedby=["'][^"']*\bdateNote\b[^"']*\bdateError\b[^"']*["']/);
  }
  assert.match(dateError, /\brole=["']status["']/);
  assert.match(html, /2028年1月2日以降/);
});

test('estimate replaces the static cat menu with catalog-backed cat and dog fields', () => {
  const html = read('boarding/estimate.html');

  assert.match(html, /\bid=["']catCareField["']/);
  assert.match(html, /\bid=["']catCarePackage["']/);
  assert.match(html, /\bid=["']catCareItems["']/);
  assert.doesNotMatch(html, /\bid=["']catCare["']/);
  assert.match(html, /data-dog-services-surface=["']estimate-care["']/);
});

test('species state exposes cat controls only for cats and dog controls only for dogs', () => {
  const api = require('../boarding/boarding-public-estimate.js');

  assert.deepEqual(api.stateFor('cat'), { catCareHidden: false, dogCareHidden: true });
  assert.deepEqual(api.stateFor('dog_small'), { catCareHidden: true, dogCareHidden: false });
  assert.deepEqual(api.stateFor('rabbit_cage'), { catCareHidden: true, dogCareHidden: true });
});

test('selecting a cat package clears an included single before disabling it', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const catalog = {
    packages: [{ id: 'short', includedItemIds: ['nail'] }],
    items: [
      { id: 'nail', maxQuantity: 1 },
      { id: 'matting15', maxQuantity: 8 },
    ],
  };
  const events = [];
  const nail = { type: 'checkbox' };
  Object.defineProperties(nail, {
    checked: { configurable: true, set(value) { events.push(`checked:${value}`); } },
    disabled: { configurable: true, set(value) { events.push(`disabled:${value}`); } },
  });
  const matting = { type: 'select-one', value: '2', disabled: true };

  api.applyCatPackageSelection('short', catalog, { nail, matting15: matting });

  assert.deepEqual(events, ['checked:false', 'disabled:true']);
  assert.equal(matting.value, '2');
  assert.equal(matting.disabled, false);
});

test('stopped dog output never exposes LINE while its completed quote remains copyable', () => {
  const api = require('../boarding/boarding-public-estimate.js');

  for (const mode of ['empty', 'error', 'result', 'date-limit']) {
    assert.equal(api.actionStateFor('dog_small', mode).lineHidden, true, mode);
  }
  assert.deepEqual(api.actionStateFor('dog_small', 'result'), {
    lineHidden: true,
    lineDisabled: true,
    copyHidden: false,
  });
  assert.deepEqual(api.actionStateFor('cat', 'date-limit'), {
    lineHidden: false,
    lineDisabled: false,
    copyHidden: true,
  });
  assert.deepEqual(api.actionStateFor('rabbit_cage', 'date-limit'), {
    lineHidden: false,
    lineDisabled: false,
    copyHidden: true,
  });
});

test('estimator consumes the canonical care catalogs without legacy aliases', () => {
  const source = read('boarding/boarding-public-estimate.js');
  const config = require('../boarding-public-config.js');

  assert.match(source, /Config\.careCatalog\.cat/);
  assert.match(source, /document\.createElement\(/);
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /Calc\.calculateCatCare\(/);
  assert.match(source, /input\[name=["']dogCareOffer["']\]:checked/);
  assert.match(source, /Calc\.calculateDogCare\(/);
  assert.match(source, /7泊以上 20%OFF（会員10%よりお得）/);
  assert.match(source, /毛玉・ブラッシング[^\n]{0,100}割引対象外/);
  assert.doesNotMatch(source, /dogBasicCare|calculateDogBasicCare|catGroomingDiscount|calculateCatGrooming/);
  assert.equal(Object.hasOwn(config.CONFIG, 'catGroomingDiscount'), false);
});

test('estimate CSS keeps compact semantic care controls touch-safe and narrow-screen friendly', () => {
  const css = read('services.css');

  assert.match(css, /\.estimate-care-field\s+fieldset/);
  assert.match(css, /\.estimate-care-list/);
  assert.match(css, /\.estimate-care-control[^}]*min-height:\s*44px/s);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.estimate-care-list[\s\S]*?grid-template-columns:\s*1fr/);
});
