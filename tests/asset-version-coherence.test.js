'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = '20260710b';
const TRUST_RELEASE = '20260711b';
const STYLE_RELEASE = '20260711c';
const SCRIPT_RELEASE = '20260711c';
const TRUTH_RELEASE = '20260711c';
const CATALOG_RELEASE = '20260711b';
const CARD_LOADER_RELEASE = '20260711d';
const ADMIN_RENDER_RELEASE = '20260711a';
const ADMIN_DIARY_RELEASE = '20260711a';
const ADMIN_FAQ_RELEASE = TRUTH_RELEASE;
const ADMIN_CALENDAR_RELEASE = '20260711a';
const NAV_RELEASE = '20260712b';
const I18N_RELEASE = '20260712b';
const NAV_STYLE_RELEASE = '20260711c';
const SERVICE_RELEASE = '20260711c';
const ESTIMATE_RELEASE = '20260712a';
const PUBLIC_ASSETS = {
  'style.css': STYLE_RELEASE,
  'nav.css': NAV_STYLE_RELEASE,
  'nav.js': NAV_RELEASE,
  'i18n.js': I18N_RELEASE,
  'blog/blog-i18n.js': RELEASE,
  'blog-listing-i18n.js': RELEASE,
  'catalog-i18n.js': RELEASE,
  'kitten-catalog.js': CATALOG_RELEASE,
  'card-loader.js': CARD_LOADER_RELEASE,
  'faq-trust-copy.js': TRUST_RELEASE,
  'faq-loader.js': TRUST_RELEASE,
  'faq-page-loader.js': TRUST_RELEASE,
  'kitten-carousel.js': CATALOG_RELEASE,
  'cta-widget.js': CATALOG_RELEASE,
  'script.js': SCRIPT_RELEASE,
  'mobile-cta.js': TRUST_RELEASE,
  'assets/chat/widget.css': TRUST_RELEASE,
  'assets/chat/widget.js': TRUTH_RELEASE,
  'services.css': SERVICE_RELEASE,
  'boarding-public-config.js': SERVICE_RELEASE,
  'boarding-public-calc.js': SERVICE_RELEASE,
  'boarding/boarding-public-estimate.js': ESTIMATE_RELEASE,
};

function trackedFiles(glob) {
  return childProcess.execFileSync('git', ['ls-files', glob], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

test('tracked pages use the current release stamp for changed public JavaScript', () => {
  for (const relative of trackedFiles('*.html')) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const [asset, expected] of Object.entries(PUBLIC_ASSETS)) {
      const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const references = [...html.matchAll(new RegExp(`(?:src|href)=["'][^"']*?(?<![A-Za-z0-9._-])${escaped}(?:\\?v=([^"']+))?["']`, 'g'))];
      for (const reference of references) {
        assert.equal(reference[1], expected, `${relative}: ${asset} must use ?v=${expected}`);
      }
    }
  }
});

test('admin pages version every local script so immutable caches cannot retain stale code', () => {
  for (const relative of trackedFiles('admin/*.html')) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const references = [...html.matchAll(/src=["'](?:\.\/)?js\/([^"'?]+\.js)(?:\?v=([^"']+))?["']/g)];
    for (const reference of references) {
      const expected = reference[1] === 'admin-render.js'
        ? ADMIN_RENDER_RELEASE
        : reference[1] === 'admin-diary-editor.js'
          ? ADMIN_DIARY_RELEASE
          : reference[1] === 'admin-faq.js'
            ? ADMIN_FAQ_RELEASE
            : reference[1] === 'admin-calendar.js'
              ? ADMIN_CALENDAR_RELEASE
          : RELEASE;
      assert.equal(reference[2], expected, `${relative}: ${reference[1]} must use ?v=${expected}`);
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
    for (const [asset, expected] of Object.entries(PUBLIC_ASSETS)) {
      const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of source.matchAll(new RegExp(`(?:verAsset|ver)\\('${escaped}',\\s*'([^']+)'\\)`, 'g'))) {
        assert.equal(match[1], expected, `${relative}: ${asset} fallback must use ${expected}`);
      }
      for (const match of source.matchAll(new RegExp(`(?<![A-Za-z0-9._-])${escaped}\\?v=([A-Za-z0-9._-]+)`, 'g'))) {
        assert.equal(match[1], expected, `${relative}: ${asset} template must use ${expected}`);
      }
    }
  }
});
