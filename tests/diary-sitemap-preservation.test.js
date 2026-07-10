'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function loadDiaryGeneratorInTempSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-diary-sitemap-'));
  const toolsDir = path.join(siteDir, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.copyFileSync(path.join(PROJECT, 'tools/generate-diary.js'), path.join(toolsDir, 'generate-diary.js'));
  fs.copyFileSync(path.join(PROJECT, 'tools/lastmod-store.js'), path.join(toolsDir, 'lastmod-store.js'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return {
    siteDir,
    generator: require(path.join(toolsDir, 'generate-diary.js')),
  };
}

test('diary sitemap refresh preserves later kitten and blog sections', (t) => {
  const { siteDir, generator } = loadDiaryGeneratorInTempSite(t);
  const sitemapPath = path.join(siteDir, 'sitemap.xml');
  const original = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- メインページ -->
  <url><loc>https://fuluckpet.com/</loc></url>
  <!-- 成長日記 -->
  <url><loc>https://fuluckpet.com/diary/</loc></url>
  <url><loc>https://fuluckpet.com/diary/stale-entry.html</loc></url>
  <!-- 子猫詳細ページ -->
  <url><loc>https://fuluckpet.com/kittens/2601-00909.html</loc></url>
  <!-- ブログ記事 -->
  <url><loc>https://fuluckpet.com/blog/health.html</loc></url>
</urlset>
`;
  fs.writeFileSync(sitemapPath, original, 'utf8');

  generator.updateSitemap([]);
  const once = fs.readFileSync(sitemapPath, 'utf8');

  assert.match(once, /https:\/\/fuluckpet\.com\/<\/loc>/, 'static URLs must remain');
  assert.match(once, /https:\/\/fuluckpet\.com\/diary\/<\/loc>/, 'diary index must remain');
  assert.doesNotMatch(once, /diary\/stale-entry\.html/, 'stale diary URLs must be replaced');
  assert.match(once, /kittens\/2601-00909\.html/, 'kitten detail section must remain');
  assert.match(once, /blog\/health\.html/, 'blog section must remain');

  generator.updateSitemap([]);
  assert.equal(fs.readFileSync(sitemapPath, 'utf8'), once, 'a second refresh must be byte-idempotent');
});
