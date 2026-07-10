'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildIndexNowUrls } = require('../tools/indexnow-urls');

test('IndexNow URL builder excludes every noindex HTML surface', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-indexnow-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, 'guide'), { recursive: true });
  fs.mkdirSync(path.join(site, 'dark'), { recursive: true });
  fs.writeFileSync(path.join(site, 'index.html'), '<link rel="canonical" href="https://fuluckpet.com/"><title>Home</title>');
  fs.writeFileSync(path.join(site, 'public.html'), '<meta name="robots" content="index,follow"><link href="https://fuluckpet.com/public.html" rel="canonical">');
  fs.writeFileSync(path.join(site, 'guide/index.html'), '<link rel="canonical" href="https://fuluckpet.com/guide/"><title>Guide</title>');
  fs.writeFileSync(path.join(site, 'dark/index.html'), '<meta content=noindex,nofollow name=robots>');
  fs.writeFileSync(path.join(site, 'none.html'), '<meta name="robots" content="none">');

  const urls = buildIndexNowUrls([
    'index.html',
    'public.html',
    'guide/index.html',
    'dark/index.html',
    'none.html',
    'missing.html',
    'style.css',
  ], site);

  assert.deepEqual(urls, [
    'https://fuluckpet.com/',
    'https://fuluckpet.com/public.html',
    'https://fuluckpet.com/guide/',
  ]);
});

test('IndexNow submits only self-canonical public pages', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-indexnow-canonical-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(site, 'self.html'), '<link rel="canonical" href="https://fuluckpet.com/self.html">');
  fs.writeFileSync(path.join(site, 'alias.html'), '<link rel="canonical" href="https://fuluckpet.com/self.html">');
  fs.writeFileSync(path.join(site, 'missing-canonical.html'), '<title>No canonical</title>');
  fs.writeFileSync(path.join(site, 'foreign.html'), '<link rel="canonical" href="https://example.test/foreign.html">');
  fs.writeFileSync(path.join(site, 'admin/index.html'), '<title>Admin</title>');

  assert.deepEqual(buildIndexNowUrls([
    'self.html',
    'alias.html',
    'missing-canonical.html',
    'foreign.html',
    'admin/index.html',
  ], site), ['https://fuluckpet.com/self.html']);
});

test('IndexNow URL builder rejects paths outside the site root', () => {
  assert.deepEqual(buildIndexNowUrls(['../secret.html'], '/tmp/site'), []);
});

test('IndexNow URL builder rejects URL-normalization traversal aliases', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-indexnow-alias-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, '%2e%2e'), { recursive: true });
  fs.writeFileSync(path.join(site, '%2e%2e/secret.html'), '<meta name="robots" content="index">');
  fs.writeFileSync(path.join(site, '..\\secret.html'), '<meta name="robots" content="index">');

  assert.deepEqual(buildIndexNowUrls([
    '%2e%2e/secret.html',
    '..\\secret.html',
  ], site), []);
});
