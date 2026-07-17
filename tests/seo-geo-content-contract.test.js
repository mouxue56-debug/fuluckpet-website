'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://fuluckpet.com';
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

for (const relative of ['index.html', 'blog.html']) {
  test(`${relative} omits obsolete structured search actions`, () => {
    assert.doesNotMatch(read(relative), /SearchAction|search_term_string/);
  });
}

for (const relative of ['llms.txt', 'llms-full.txt']) {
  test(`${relative} uses a stable review-count floor`, () => {
    const source = read(relative);
    assert.doesNotMatch(source, /(?:5\.0★\s*\/\s*)?113(?:\s*(?:レビュー|reviews?))?/i);
    assert.match(source, /100\+|100件以上/);
  });
}

test('llms.txt uses stable catalogue and article wording', () => {
  const source = read('llms.txt');
  assert.doesNotMatch(source, /\/kittens\/\d{4}-\d{5}\.html/);
  assert.doesNotMatch(source, /毎日再生成|日次で更新|170本以上/);
});

test('llms-full.txt omits an unverifiable article count and live status', () => {
  const source = read('llms-full.txt');
  assert.doesNotMatch(source, /\b\d+\+\s+articles indexed\b/i);
  assert.doesNotMatch(source, /営業中/);
});

function localPage(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/') return 'index.html';
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  return relative.endsWith('/') ? `${relative}index.html` : relative;
}

for (const relative of ['llms.txt', 'llms-full.txt']) {
  test(`${relative} only cites existing concrete fuluckpet.com pages`, () => {
    const source = read(relative).replace(
      /https:\/\/fuluckpet\.com\/kittens\/<breederId>\.html/g,
      '',
    );
    const urls = source.match(/https:\/\/fuluckpet\.com(?:\/[A-Za-z0-9._~!$&'*+,;=:@%/?#-]*)?/g) || [];
    const missing = [...new Set(urls.map(localPage))]
      .filter((page) => !fs.existsSync(path.join(ROOT, page)));

    assert.deepEqual(missing, [], `missing concrete internal pages:\n${missing.join('\n')}`);
  });
}
