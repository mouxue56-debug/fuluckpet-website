'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const catalog = require('../kitten-catalog.js');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function trackedHtmlFiles() {
  return childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

function divContentsByOpeningTag(html, openingPattern) {
  const contents = [];
  const opening = new RegExp(openingPattern.source, openingPattern.flags.includes('g') ? openingPattern.flags : openingPattern.flags + 'g');
  let match;
  while ((match = opening.exec(html))) {
    const tagPattern = /<div\b[^>]*>|<\/div>/gi;
    tagPattern.lastIndex = match.index;
    let depth = 0;
    let tag;
    while ((tag = tagPattern.exec(html))) {
      if (/^<div\b/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        contents.push(html.slice(match.index + match[0].length, tag.index));
        opening.lastIndex = tagPattern.lastIndex;
        break;
      }
    }
  }
  return contents;
}

function kittenRecords(html) {
  return [...html.matchAll(/<div class="kitten-card"([^>]*)>/g)].map((match) => {
    const attributes = Object.create(null);
    for (const attribute of match[1].matchAll(/\b(data-[a-z-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = attribute[2];
    }
    return {
      breederId: attributes['data-breeder-id'],
      status: attributes['data-status'],
      promotionTag: attributes['data-promotion-tag'],
      promotionPriority: Number(attributes['data-promotion-priority']),
      price: attributes['data-price'],
      birthday: attributes['data-birthday'],
    };
  });
}

test('every catalog consumer imports the shared contract', () => {
  for (const file of ['tools/generate-site.js', 'card-loader.js', 'kitten-carousel.js', 'cta-widget.js', 'script.js']) {
    assert.match(read(file), /FuluckKittenCatalog|require\(['"]\.\.\/kitten-catalog\.js['"]\)/, file);
  }
});

test('carousel dedupes, excludes the current kitten and orders before slice', () => {
  const source = read('kitten-carousel.js');
  assert.match(source, /orderKittens\(/);
  assert.match(source, /excludeBreederId/);
  assert.doesNotMatch(source, /available\.concat\(reserved\)\.slice\(0, 12\)/);
  assert.match(source, /orderKittens\([\s\S]*\)\.slice\(0, 12\)/);
});

test('generated and dynamic cards carry promotion semantics in the card body', () => {
  for (const file of ['tools/generate-site.js', 'card-loader.js']) {
    const source = read(file);
    assert.match(source, /data-promotion-tag/, file);
    assert.match(source, /data-promotion-priority/, file);
    assert.match(source, /kitten-promotion-chip/, file);
    assert.match(source, /kitten-body[\s\S]{0,300}promotionChip/, file);
  }
});

test('tracked HTML loads the shared contract before every ordering consumer', () => {
  const missing = [];
  for (const file of trackedHtmlFiles()) {
    const html = read(file);
    const consumerPositions = [
      html.search(/<script[^>]+src=["'][^"']*card-loader\.js(?:\?[^"']*)?["']/),
      html.search(/<script[^>]+src=["'][^"']*kitten-carousel\.js(?:\?[^"']*)?["']/),
      html.search(/<script[^>]+src=["'][^"']*cta-widget\.js(?:\?[^"']*)?["']/),
    ];
    if (/class=["'][^"']*sort-btn/.test(html) || /id=["']kittensGrid["']/.test(html)) {
      consumerPositions.push(html.search(/<script[^>]+src=["'][^"']*script\.js(?:\?[^"']*)?["']/));
    }
    const consumers = consumerPositions.filter((position) => position >= 0);
    if (consumers.length === 0) continue;
    const catalogPosition = html.search(/<script[^>]+src=["'][^"']*kitten-catalog\.js(?:\?[^"']*)?["']/);
    if (catalogPosition < 0 || catalogPosition > Math.min(...consumers)) missing.push(file);
  }
  assert.deepEqual(missing, []);
});

test('tracked static catalog grids are already in shared default order', () => {
  for (const file of ['index.html', 'kittens.html', 'en/kittens.html', 'zh/kittens.html']) {
    const html = read(file);
    const grids = divContentsByOpeningTag(
      html,
      /<div\b[^>]*(?:id="kittensGrid"|class="[^"]*\bkittens-grid\b[^"]*")[^>]*>/i,
    );
    assert.ok(grids.length > 0, `${file}: expected a catalog grid`);
    for (const grid of grids) {
      const records = kittenRecords(grid);
      if (records.length < 2) continue;
      const actual = records.map((record) => record.breederId);
      const expected = catalog.orderKittens(records).map((record) => record.breederId);
      assert.deepEqual(actual, expected, file);
    }
  }
});
