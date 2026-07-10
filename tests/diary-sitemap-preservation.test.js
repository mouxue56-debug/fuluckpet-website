'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
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
  fs.copyFileSync(path.join(PROJECT, 'tools/safe-json-for-html.js'), path.join(toolsDir, 'safe-json-for-html.js'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return {
    siteDir,
    generator: require(path.join(toolsDir, 'generate-diary.js')),
  };
}

function createRunnableDiarySite(t, failureMode) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-diary-fetch-failure-'));
  const toolsDir = path.join(siteDir, 'tools');
  const diaryDir = path.join(siteDir, 'diary');
  const blogDir = path.join(siteDir, 'blog');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.mkdirSync(blogDir, { recursive: true });
  fs.copyFileSync(path.join(PROJECT, 'tools/generate-diary.js'), path.join(toolsDir, 'generate-diary.js'));
  fs.copyFileSync(path.join(PROJECT, 'tools/lastmod-store.js'), path.join(toolsDir, 'lastmod-store.js'));
  fs.copyFileSync(path.join(PROJECT, 'tools/safe-json-for-html.js'), path.join(toolsDir, 'safe-json-for-html.js'));
  fs.copyFileSync(
    path.join(PROJECT, 'blog/siberian-grooming-basics.html'),
    path.join(blogDir, 'siberian-grooming-basics.html')
  );

  const diaryFiles = {
    'index.html': '<!doctype html><title>existing diary index</title>\n',
    'existing-entry.html': '<!doctype html><title>existing diary entry</title>\n',
  };
  for (const [filename, content] of Object.entries(diaryFiles)) {
    fs.writeFileSync(path.join(diaryDir, filename), content, 'utf8');
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://fuluckpet.com/</loc></url>
  <!-- 成長日記 -->
  <url><loc>https://fuluckpet.com/diary/</loc></url>
  <url><loc>https://fuluckpet.com/diary/existing-entry.html</loc></url>
  <!-- /成長日記 -->
</urlset>
`;
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), sitemap, 'utf8');

  const preloadPath = path.join(siteDir, 'fail-https.js');
  var diaryPayload = '[]';
  if (failureMode === 'invalid-entry') diaryPayload = JSON.stringify([null, { published: true, title: 'missing slug' }]);
  if (failureMode === 'error-envelope') diaryPayload = JSON.stringify({ success: false, error: 'upstream failed', items: [] });

  fs.writeFileSync(preloadPath, `'use strict';
const https = require('node:https');
const { EventEmitter } = require('node:events');
https.get = function (_url, callback) {
  const request = new EventEmitter();
  if (${JSON.stringify(failureMode)} === 'network') {
    process.nextTick(() => request.emit('error', new Error('simulated network failure')));
    return request;
  }
  const response = new EventEmitter();
  response.statusCode = ${failureMode === 'http-503' ? '503' : '200'};
  response.statusMessage = ${failureMode === 'http-503' ? JSON.stringify('Service Unavailable') : JSON.stringify('OK')};
  response.setEncoding = function () {};
  process.nextTick(() => {
    callback(response);
    const payload = String(_url).includes('/api/diary')
      ? ${failureMode === 'invalid-json' ? JSON.stringify('{not-json') : JSON.stringify(diaryPayload)}
      : '[]';
    response.emit('data', payload);
    response.emit('end');
  });
  return request;
};
`, 'utf8');

  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return { siteDir, diaryDir, preloadPath };
}

function snapshotDiaryState(siteDir, diaryDir) {
  const diary = new Map();
  for (const filename of fs.readdirSync(diaryDir).sort()) {
    diary.set(filename, fs.readFileSync(path.join(diaryDir, filename)));
  }
  return {
    diary,
    sitemap: fs.readFileSync(path.join(siteDir, 'sitemap.xml')),
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

for (const failureMode of ['network', 'invalid-json', 'http-503', 'invalid-entry', 'error-envelope']) {
  test(`remote ${failureMode} failure aborts before mutating diary pages or sitemap`, (t) => {
    const { siteDir, diaryDir, preloadPath } = createRunnableDiarySite(t, failureMode);
    const before = snapshotDiaryState(siteDir, diaryDir);

    const result = childProcess.spawnSync(
      process.execPath,
      ['--require', preloadPath, path.join(siteDir, 'tools/generate-diary.js')],
      {
        cwd: siteDir,
        encoding: 'utf8',
        env: { ...process.env, DIARY_FIXTURE: '' },
      }
    );
    const after = snapshotDiaryState(siteDir, diaryDir);

    assert.notEqual(result.status, 0, `generator must fail closed; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.deepEqual([...after.diary.keys()], [...before.diary.keys()], 'diary file set must remain unchanged');
    for (const [filename, bytes] of before.diary) {
      assert.deepEqual(after.diary.get(filename), bytes, `${filename} must remain byte-identical`);
    }
    assert.deepEqual(after.sitemap, before.sitemap, 'sitemap.xml must remain byte-identical');
  });
}

test('successful empty API arrays remain authoritative and clear stale diary entries', (t) => {
  const { siteDir, diaryDir, preloadPath } = createRunnableDiarySite(t, 'success-empty');

  const result = childProcess.spawnSync(
    process.execPath,
    ['--require', preloadPath, path.join(siteDir, 'tools/generate-diary.js')],
    {
      cwd: siteDir,
      encoding: 'utf8',
      env: { ...process.env, DIARY_FIXTURE: '' },
    }
  );

  assert.equal(result.status, 0, `successful empty data is valid; stderr:\n${result.stderr}`);
  assert.deepEqual(fs.readdirSync(diaryDir).sort(), ['index.html']);
  assert.doesNotMatch(fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8'), /existing-entry\.html/);
});
