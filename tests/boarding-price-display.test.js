/* boarding-price-display.test.js — owner-gated boarding must fail closed publicly.
 * Pricing math remains covered by boarding-calc.test.js; direct public URLs must not
 * expose those internal values or load the estimator before registration is supplied. */
'use strict';

const assert = require('node:assert/strict');
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
