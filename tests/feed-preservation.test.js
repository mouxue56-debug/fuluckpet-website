'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools', 'generate-site.js');

function loadGenerator(siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1);
  source = source.slice(0, mainCall) + '\nmodule.exports = { generateFeedIfAvailable };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  return loaded.exports;
}

test('article outage preserves the last good feed while a successful empty array is authoritative', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-feed-preserve-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const feedPath = path.join(siteDir, 'feed.xml');
  fs.writeFileSync(feedPath, '<last-good-feed/>\n', 'utf8');
  const generator = loadGenerator(siteDir);

  assert.equal(generator.generateFeedIfAvailable(null), false);
  assert.equal(fs.readFileSync(feedPath, 'utf8'), '<last-good-feed/>\n');

  assert.equal(generator.generateFeedIfAvailable([]), true);
  const refreshed = fs.readFileSync(feedPath, 'utf8');
  assert.match(refreshed, /<rss version="2\.0">/);
  assert.doesNotMatch(refreshed, /<item>/);
});

test('main keeps article fetch failures distinct from a successful empty array', () => {
  const source = fs.readFileSync(GENERATOR, 'utf8');
  assert.match(source, /fetchJSON\('\/api\/articles'\)[\s\S]*?return null/);
  assert.match(source, /generateFeedIfAvailable\(articles\)/);
});
