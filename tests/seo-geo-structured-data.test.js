'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function jsonLd(relative) {
  const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      const parsed = JSON.parse(match[1]);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function detailIds(prefix) {
  const directory = path.join(ROOT, prefix, 'kittens');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .map((name) => name.slice(0, -'.html'.length));
}

function pricedTrilingualBreederIds() {
  const en = new Set(detailIds('en'));
  const zh = new Set(detailIds('zh'));
  return detailIds('')
    .filter((breederId) => en.has(breederId) && zh.has(breederId))
    .filter((breederId) => ['', 'en/', 'zh/'].some((prefix) =>
      jsonLd(`${prefix}kittens/${breederId}.html`)
        .some((item) => item['@type'] === 'Product')));
}

test('kitten list pages publish one ItemList and no Product entities', () => {
  for (const relative of ['kittens.html', 'en/kittens.html', 'zh/kittens.html']) {
    const entities = jsonLd(relative);
    assert.equal(entities.filter((item) => item['@type'] === 'ItemList').length, 1);
    assert.equal(entities.filter((item) => item['@type'] === 'Product').length, 0);
    assert.equal(entities.filter((item) => item['@type'] === 'Offer').length, 0);
  }
});

test('priced trilingual details publish stable Product identities and local Offer URLs', () => {
  const breederIds = pricedTrilingualBreederIds();
  for (const breederId of breederIds) {
    for (const [lang, prefix] of [['ja', ''], ['en', 'en/'], ['zh', 'zh/']]) {
      const product = jsonLd(`${prefix}kittens/${breederId}.html`)
        .find((item) => item['@type'] === 'Product');
      assert.ok(product, `${lang} ${breederId} must publish its priced Product`);
      assert.equal(product['@id'], `https://fuluckpet.com/kittens/${breederId}.html#product`);
      assert.deepEqual(product.offers.seller, { '@id': 'https://fuluckpet.com/#cattery' });
      assert.equal(product.offers.url, `https://fuluckpet.com/${prefix}kittens/${breederId}.html`);
      assert.equal('shippingDetails' in product.offers, false);
      assert.equal('hasMerchantReturnPolicy' in product.offers, false);
      assert.equal('priceValidUntil' in product.offers, false);
    }
  }
});
