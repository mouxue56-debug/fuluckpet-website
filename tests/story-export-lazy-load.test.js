'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const STORY_SOURCE = fs.readFileSync(path.join(ROOT, 'story/index.html'), 'utf8');
const LOADER_PATH = path.join(ROOT, 'story/html2canvas-loader.js');

test('story page does not fetch html2canvas before an export click', () => {
  assert.doesNotMatch(
    STORY_SOURCE,
    /<script\b[^>]*\bsrc=["']https:\/\/html2canvas\.hertzen\.com\/dist\/html2canvas\.min\.js["'][^>]*><\/script>/i
  );
  assert.match(STORY_SOURCE, /<script\s+src="\/story\/html2canvas-loader\.js\?v=20260710b"><\/script>/);
  assert.match(STORY_SOURCE, /FuluckStoryExport\.loadHtml2Canvas\(\)/);
});

test('lazy loader appends one third-party script for concurrent callers', async () => {
  assert.ok(fs.existsSync(LOADER_PATH), 'story/html2canvas-loader.js must exist');
  const source = fs.readFileSync(LOADER_PATH, 'utf8');
  const appended = [];
  const document = {
    createElement(tag) { return { tagName: String(tag).toUpperCase() }; },
    head: { appendChild(node) { appended.push(node); return node; } },
  };
  const window = {};
  const context = vm.createContext({ window, document, Promise });

  vm.runInContext(source, context, { filename: 'html2canvas-loader.js' });
  assert.equal(appended.length, 0, 'evaluating the local loader must not load the library');

  const first = window.FuluckStoryExport.loadHtml2Canvas();
  const second = window.FuluckStoryExport.loadHtml2Canvas();
  assert.equal(first, second, 'concurrent exports share one in-flight promise');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://html2canvas.hertzen.com/dist/html2canvas.min.js');

  const renderer = function renderer() {};
  window.html2canvas = renderer;
  appended[0].onload();
  assert.equal(await first, renderer);
  assert.equal(await second, renderer);
});

test('lazy loader evicts a failed request so the next click can retry', async () => {
  assert.ok(fs.existsSync(LOADER_PATH), 'story/html2canvas-loader.js must exist');
  const source = fs.readFileSync(LOADER_PATH, 'utf8');
  const appended = [];
  const document = {
    createElement() { return {}; },
    head: { appendChild(node) { appended.push(node); return node; } },
  };
  const window = {};
  const context = vm.createContext({ window, document, Promise });
  vm.runInContext(source, context, { filename: 'html2canvas-loader.js' });

  const first = window.FuluckStoryExport.loadHtml2Canvas();
  const rejected = assert.rejects(first, /html2canvas/i);
  appended[0].onerror();
  await rejected;

  const second = window.FuluckStoryExport.loadHtml2Canvas();
  assert.equal(appended.length, 2);
  assert.notEqual(first, second);
});
