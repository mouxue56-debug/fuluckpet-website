'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('every target=_blank anchor isolates the opened browsing context', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const unsafe = [];

  for (const relative of files) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const match of html.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)) {
      if (!/\brel=["'][^"']*\bnoopener\b[^"']*["']/i.test(match[0])) {
        unsafe.push(`${relative}: ${match[0].replace(/\s+/g, ' ').slice(0, 180)}`);
      }
    }
  }

  assert.deepEqual(unsafe, [], `target=_blank anchors missing rel=noopener:\n${unsafe.join('\n')}`);
});
