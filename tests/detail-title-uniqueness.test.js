'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');
const DETAIL_DIRS = [
  { locale: 'ja', dir: path.join(PROJECT, 'kittens') },
  { locale: 'en', dir: path.join(PROJECT, 'en', 'kittens') },
  { locale: 'zh', dir: path.join(PROJECT, 'zh', 'kittens') },
];

function extractTitle(html, relativePath) {
  const match = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
  assert.ok(match, `${relativePath} must contain a <title>`);
  return match[1].trim();
}

function detailPages() {
  const pages = [];
  for (const { locale, dir } of DETAIL_DIRS) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.html') || file === 'index.html') continue;
      const absolutePath = path.join(dir, file);
      const relativePath = path.relative(PROJECT, absolutePath);
      const id = path.basename(file, '.html');
      const html = fs.readFileSync(absolutePath, 'utf8');
      pages.push({
        locale,
        id,
        relativePath,
        title: extractTitle(html, relativePath),
      });
    }
  }
  assert.ok(pages.length > 0, 'generated kitten detail pages must exist');
  return pages;
}

test('generated kitten detail titles are unique across all locales', () => {
  const seen = new Map();
  for (const page of detailPages()) {
    assert.equal(
      seen.has(page.title),
      false,
      `duplicate <title> "${page.title}" in ${page.relativePath} and ${seen.get(page.title)}`,
    );
    seen.set(page.title, page.relativePath);
  }
});

test('generated kitten detail titles include the listing id', () => {
  for (const page of detailPages()) {
    assert.ok(
      page.title.includes(`No.${page.id}`),
      `${page.relativePath} title must include No.${page.id}`,
    );
  }
});

test('Japanese detail titles keep the legacy detail brand suffix', () => {
  for (const page of detailPages().filter((item) => item.locale === 'ja')) {
    assert.ok(
      page.title.includes('子猫詳細｜福楽キャッテリー'),
      `${page.relativePath} title must keep the Japanese brand suffix`,
    );
  }
});
