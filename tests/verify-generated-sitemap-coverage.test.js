'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

test('verify-generated rejects a sitemap that lost generated sections and disk pages', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-verify-sitemap-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(siteDir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'blog'), { recursive: true });
  fs.copyFileSync(
    path.join(PROJECT, 'tools/verify-generated.js'),
    path.join(siteDir, 'tools/verify-generated.js'),
  );

  fs.writeFileSync(path.join(siteDir, 'kittens.html'), `<!doctype html>
<link rel="stylesheet" href="/style.css?v=test">
<link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script>
<script src="/nav.js?v=test"></script>
`, 'utf8');
  fs.writeFileSync(path.join(siteDir, 'blog/health.html'), '<!doctype html><title>Health</title>\n', 'utf8');
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc></url>
  <!-- 成長日記 -->
  <url><loc>https://fuluckpet.com/diary/</loc></url>
</urlset>
`, 'utf8');

  const result = spawnSync(process.execPath, [path.join(siteDir, 'tools/verify-generated.js')], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, `expected integrity failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /missing required marker: <!-- ブログ記事 -->/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/blog\/health\.html/);
});
