'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const bookingHtml = fs.readFileSync(
  path.resolve(__dirname, '../booking.html'),
  'utf8',
);

function styleRules(html) {
  const rules = [];
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of style[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      rules.push({
        selectors: rule[1].split(',').map((selector) => selector.trim()),
        declarations: rule[2],
      });
    }
  }
  return rules;
}

test('booking submit label has an authored hidden-display contract', () => {
  const rule = styleRules(bookingHtml).find(({ selectors, declarations }) =>
    selectors.includes('.booking-submit .btn-text[hidden]') &&
    selectors.includes('.booking-submit .btn-sending[hidden]') &&
    /display\s*:\s*none\s*;/i.test(declarations),
  );

  // This is a source-level author-CSS contract only. Chromium rendering and
  // accessible-name behavior are verified separately in run-owned evidence.
  assert.ok(
    rule,
    'btn-text[hidden] and btn-sending[hidden] must share an authored display:none rule',
  );
});
