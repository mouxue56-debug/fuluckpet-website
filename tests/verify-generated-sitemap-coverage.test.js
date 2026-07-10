'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function createVerifierSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-verify-sitemap-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(siteDir, 'tools'), { recursive: true });
  fs.copyFileSync(
    path.join(PROJECT, 'tools/verify-generated.js'),
    path.join(siteDir, 'tools/verify-generated.js'),
  );
  const robotsMeta = path.join(PROJECT, 'tools/robots-meta.js');
  if (fs.existsSync(robotsMeta)) {
    fs.copyFileSync(robotsMeta, path.join(siteDir, 'tools/robots-meta.js'));
  }

  fs.writeFileSync(path.join(siteDir, 'kittens.html'), `<!doctype html>
<link rel="stylesheet" href="/style.css?v=test">
<link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script>
<script src="/nav.js?v=test"></script>
`, 'utf8');
  return siteDir;
}

function write(siteDir, rel, content) {
  const target = path.join(siteDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function runVerifier(siteDir) {
  return spawnSync(process.execPath, [path.join(siteDir, 'tools/verify-generated.js')], {
    encoding: 'utf8',
  });
}

const ALL_MARKERS = `  <!-- 成長日記 -->
  <!-- /成長日記 -->
  <!-- 子猫詳細ページ -->
  <!-- ブログ記事 -->`;

test('verify-generated rejects a sitemap that lost generated sections and disk pages', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/health.html', '<!doctype html><title>Health</title>\n');
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc></url>
  <!-- 成長日記 -->
  <url><loc>https://fuluckpet.com/diary/</loc></url>
</urlset>
`, 'utf8');

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected integrity failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /missing required marker: <!-- ブログ記事 -->/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/blog\/health\.html/);
});

test('verify-generated requires the public root pages emitted by generate-site', (t) => {
  const siteDir = createVerifierSite(t);
  const sharedAssetPage = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  write(siteDir, 'parents.html', sharedAssetPage);
  write(siteDir, 'reviews.html', sharedAssetPage);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected missing-root failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/kittens\.html/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/parents\.html/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/reviews\.html/);
});

test('verify-generated does not force a noindex generated page into sitemap', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta name="robots" content="noindex,nofollow">
<title>Dark preview</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /blog\/dark\.html/);
});

test('verify-generated rejects a noindex generated page that leaked into sitemap', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta content="nofollow, noindex" name="robots">
<title>Dark preview</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/blog/dark.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected noindex leak failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /noindex page has <loc>: https:\/\/fuluckpet\.com\/blog\/dark\.html/);
});

test('verify-generated rejects an unquoted noindex page outside generated coverage when it leaks', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'boarding/index.html', `<!doctype html>
<meta content=noindex,nofollow name=robots>
<title>Owner-gated boarding</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/boarding/</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected noindex leak failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /noindex page has <loc>: https:\/\/fuluckpet\.com\/boarding\//);
});
