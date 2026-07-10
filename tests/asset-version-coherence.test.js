'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = '20260710b';
const PUBLIC_ASSETS = [
  'nav.js',
  'i18n.js',
  'blog/blog-i18n.js',
  'blog-listing-i18n.js',
  'catalog-i18n.js',
  'card-loader.js',
  'faq-page-loader.js',
  'kitten-carousel.js',
  'script.js',
  'assets/chat/widget.css',
  'assets/chat/widget.js',
];

function trackedFiles(glob) {
  return childProcess.execFileSync('git', ['ls-files', glob], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

test('tracked pages use the current release stamp for changed public JavaScript', () => {
  for (const relative of trackedFiles('*.html')) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const asset of PUBLIC_ASSETS) {
      const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const references = [...html.matchAll(new RegExp(`(?:src|href)=["'][^"']*${escaped}(?:\\?v=([^"']+))?["']`, 'g'))];
      for (const reference of references) {
        assert.equal(reference[1], RELEASE, `${relative}: ${asset} must use ?v=${RELEASE}`);
      }
    }
  }
});

test('admin pages version every local script so immutable caches cannot retain stale code', () => {
  for (const relative of trackedFiles('admin/*.html')) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const references = [...html.matchAll(/src=["'](?:\.\/)?js\/[^"'?]+\.js(?:\?v=([^"']+))?["']/g)];
    for (const reference of references) {
      assert.equal(reference[1], RELEASE, `${relative}: local admin scripts must use ?v=${RELEASE}`);
    }
  }
});

test('generator defaults and direct templates cannot reintroduce an old public asset stamp', () => {
  const sources = [
    'tools/generate-site.js',
    'tools/generate-diary.js',
    'tools/gen-blog-edu-pages.mjs',
    'tools/gen-blog-static-pages.mjs',
    'tools/translate-blog-articles.js',
  ].map((relative) => ({ relative, source: fs.readFileSync(path.join(ROOT, relative), 'utf8') }));

  for (const { relative, source } of sources) {
    for (const asset of PUBLIC_ASSETS) {
      const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of source.matchAll(new RegExp(`(?:verAsset|ver)\\('${escaped}',\\s*'([^']+)'\\)`, 'g'))) {
        assert.equal(match[1], RELEASE, `${relative}: ${asset} fallback must use ${RELEASE}`);
      }
      for (const match of source.matchAll(new RegExp(`${escaped}\\?v=([A-Za-z0-9._-]+)`, 'g'))) {
        assert.equal(match[1], RELEASE, `${relative}: ${asset} template must use ${RELEASE}`);
      }
    }
  }
});
