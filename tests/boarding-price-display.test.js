/* boarding-price-display.test.js — owner-gated boarding must fail closed publicly.
 * Pricing math remains covered by boarding-calc.test.js; direct public URLs must not
 * expose those internal values or load the estimator before registration is supplied. */
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const pages = ['boarding/index.html', 'boarding/estimate.html'];

test('owner-gated boarding pages expose no prices, estimator controls, or offer schema', () => {
  for (const relative of pages) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const body = (html.match(/<body\b[\s\S]*<\/body>/i) || [''])[0];
    assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex/i, relative);
    assert.doesNotMatch(body, /[\u00a5円]\s*[0-9]|<form\b|<input\b|<select\b/i, relative);
    assert.doesNotMatch(html, /"@type"\s*:\s*"(?:Service|Offer)"/i, relative);
  }
});

test('owner-gated direct pages do not load internal pricing or estimator code', () => {
  for (const relative of pages) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(html, /boarding-(?:config|calc|estimate)\.js/i, relative);
    assert.doesNotMatch(html, /\/booking\.html|page\.line\.me/i, relative);
  }
});

test('owner-gated pricing runtime is absent from the tracked public tree', () => {
  const internalPricingPaths = [
    'boarding-config.js',
    'boarding-calc.js',
    'boarding/boarding-estimate.js',
    'tests/boarding-calc.test.js',
  ];
  const trackedFiles = new Set(execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n'));
  const deletedFiles = new Set(execFileSync('git', ['ls-files', '--deleted'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n'));

  for (const relative of internalPricingPaths) {
    assert.equal(
      trackedFiles.has(relative) && !deletedFiles.has(relative),
      false,
      `${relative} must not remain tracked in the public working tree`,
    );
    assert.equal(fs.existsSync(path.join(ROOT, relative)), false, `${relative} must not remain public`);
  }
});

test('public guide pricing has no owner-gated boarding quote', () => {
  const guideFiles = ['guide/price.html', 'guide/i18n-guide-body.js'];
  const boardingQuote = /長期お預かり|Extended Boarding|长期寄养|1,500\s*(?:円|yen|日元)\s*(?:\/|per|／)?\s*(?:日|day|天)/i;

  for (const relative of guideFiles) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(source, boardingQuote, relative);
  }
});
