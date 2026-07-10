'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR_SOURCE = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');

test('kitten listing generator emits keyboard semantics without linking sold cards', () => {
  assert.match(GENERATOR_SOURCE, /const\s+detailEligible\s*=\s*k\.status\s*===\s*'available'\s*\|\|\s*k\.status\s*===\s*'reserved'/);
  assert.match(GENERATOR_SOURCE, /const\s+cardRole\s*=\s*detailEligible\s*\?\s*'link'\s*:\s*'button'/);
  assert.match(GENERATOR_SOURCE, /role="\$\{cardRole\}"\s+tabindex="0"\$\{modalSemantics\}/);
  assert.match(GENERATOR_SOURCE, /data-detail-url="\$\{escapeHtml\(detailUrl\)\}"/);
});

test('parent listing generator preserves modal keyboard semantics on regeneration', () => {
  assert.match(GENERATOR_SOURCE, /class="parent-card"\s+role="button"\s+tabindex="0"\s+aria-haspopup="dialog"/);
});
