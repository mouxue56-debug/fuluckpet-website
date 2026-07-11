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
  fs.copyFileSync(path.join(PROJECT, 'tools/safe-json-for-html.js'), path.join(toolsDir, 'safe-json-for-html.js'));
  fs.copyFileSync(path.join(PROJECT, 'kitten-catalog.js'), path.join(siteDir, 'kitten-catalog.js'));
  fs.copyFileSync(
    path.join(PROJECT, 'small-animals-launch.json'),
    path.join(siteDir, 'small-animals-launch.json'),
  );
  const robotsMeta = path.join(PROJECT, 'tools/robots-meta.js');
  if (fs.existsSync(robotsMeta)) {
    fs.copyFileSync(robotsMeta, path.join(toolsDir, 'robots-meta.js'));
  }

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
  write(siteDir, 'blog/public.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/blog/public.html"><title>Public</title>\n');
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta content=noindex,nofollow name=robots>
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

test('localized kitten sitemap section labels remain XML comments', (t) => {
  const { siteDir, generator } = loadSiteGeneratorInTempSite(t);
  write(siteDir, 'en/kittens.html', '<!doctype html><title>Kittens</title>\n');
  write(siteDir, 'zh/kittens.html', '<!doctype html><title>\u5e7c\u732b</title>\n');
  write(siteDir, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc><lastmod>2026-07-10</lastmod></url>
  <!-- \u5b50\u732b\u8a73\u7d30\u30da\u30fc\u30b8 -->
  <!-- \u30d6\u30ed\u30b0\u8a18\u4e8b -->
</urlset>
`);

  generator.updateSitemap([], []);
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');

  assert.match(sitemap, /<!-- \u5b50\u732b\u8a73\u7d30\u30da\u30fc\u30b8 \(en\) -->/);
  assert.match(sitemap, /<!-- \u5b50\u732b\u8a73\u7d30\u30da\u30fc\u30b8 \(zh\) -->/);
  assert.doesNotMatch(sitemap, /^\s*\u5b50\u732b\u8a73\u7d30\u30da\u30fc\u30b8 \((?:en|zh)\)\s*$/m);
});

test('indexable localized blog siblings are emitted beside the Japanese URL', (t) => {
  const { siteDir, generator } = loadSiteGeneratorInTempSite(t);
  write(siteDir, 'blog/localized.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/blog/localized.html"><title>JA</title>\n');
  write(siteDir, 'en/blog/localized.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/en/blog/localized.html"><title>EN</title>\n');
  write(siteDir, 'zh/blog/localized.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/zh/blog/localized.html"><title>ZH</title>\n');
  write(siteDir, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <!-- \u5b50\u732b\u8a73\u7d30\u30da\u30fc\u30b8 -->
  <!-- \u30d6\u30ed\u30b0\u8a18\u4e8b -->
</urlset>
`);

  generator.updateSitemap([], []);
  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/fuluckpet\.com\/blog\/localized\.html/);
  assert.match(sitemap, /https:\/\/fuluckpet\.com\/en\/blog\/localized\.html/);
  assert.match(sitemap, /https:\/\/fuluckpet\.com\/zh\/blog\/localized\.html/);
});
