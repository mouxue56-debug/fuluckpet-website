'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function loadSiteGeneratorInTempSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-site-sitemap-'));
  const toolsDir = path.join(siteDir, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.copyFileSync(path.join(PROJECT, 'tools/lastmod-store.js'), path.join(toolsDir, 'lastmod-store.js'));

  const source = fs.readFileSync(path.join(PROJECT, 'tools/generate-site.js'), 'utf8');
  const mainCall = source.lastIndexOf('\nmain().catch');
  assert.notEqual(mainCall, -1, 'generate-site.js main call boundary changed');
  fs.writeFileSync(
    path.join(toolsDir, 'generate-site.js'),
    source.slice(0, mainCall) + '\nmodule.exports = { updateSitemap };\n',
    'utf8',
  );

  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return { siteDir, generator: require(path.join(toolsDir, 'generate-site.js')) };
}

function write(siteDir, rel, content) {
  const target = path.join(siteDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

test('site sitemap disk scan excludes noindex blog pages', (t) => {
  const { siteDir, generator } = loadSiteGeneratorInTempSite(t);
  write(siteDir, 'blog/public.html', '<!doctype html><title>Public</title>\n');
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta content="nofollow, noindex" name="robots">
<title>Dark preview</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc><lastmod>2026-07-10</lastmod></url>
  <!-- 子猫詳細ページ -->
  <!-- ブログ記事 -->
</urlset>
`);

  generator.updateSitemap([], []);
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');

  assert.match(sitemap, /https:\/\/fuluckpet\.com\/blog\/public\.html/);
  assert.doesNotMatch(sitemap, /https:\/\/fuluckpet\.com\/blog\/dark\.html/);
});
